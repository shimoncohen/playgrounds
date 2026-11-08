/* Anything outside what is modeled is listed as unsupported, never guessed at, so a program is only judged when every
   construct in it is modeled. Types are inferred with unify; the resolved type of every literal, the binding behind every
   name and the length behind every index go into `info` (a Map from node) for lint.js and the interpreter. DOM-free.
   What info holds per node (the move and borrow passes read these):
     ty    every expression and every binding pattern: its type (resolve it with RQ.types.res)
     bind  a Path that names a local, a binding pattern (let, for, param), a Deref (the local that holds the reference, when the
           operand is a plain name), and an Assign to a plain name: {mut,kind:'let'|'param',ty,assigns,deferred?}
     caps  the format-string literal of a print macro: [{name,bind}] for each {name} the string captures (bind is null for a const)
     recv  a MethodCall on a String, &str or array: {method, kind:'place'|'refvar'|'temp', adj:'&'|'&mut'|'val'}. kind is a place expression, a local that
           holds a reference, or anything else; adj is how the receiver is passed (an owned place is borrowed, a reference is used)
     um    a MethodCall on a user type, Option or Result: {key ('Type::name'), self (null|'val'|'&'|'&mut'), adj, kind, ref (the receiver is a reference), text (the receiver as written)}.
           adj: val (move or copy), & and &mut (borrow the owned receiver), reb (use the reference as a shared one), copy (copy out from behind a reference)
     sig   a Call: {params:[type], ret:type, from, key} (key names a method or associated fn: 'Type::name')
     ctor  a Call or Path that builds a struct or enum variant: {adt, variant}; variant is null for a struct
     match a Match: {mode:'move'|'ref', place, bindsMoved}; arms: IdentPat nodes carry sel (the path below the scrutinee) and bty
     rty, alen  the resolved literal type and array length, as before
   Structs are `struct Name { f: T }`, `struct Name(T)` and `struct Name;`; enums have unit, tuple and struct variants. Neither is generic and no field is a
   reference. #[derive] takes Debug, Clone, Copy, PartialEq and Eq. Option and Result are builtin generic enums. The impls are inherent `impl Name { ... }`
   (methods and associated fns, no generics) and `impl Drop for Name { fn drop(&mut self) { prints } }`. A match takes an enum or a shared reference to one,
   with unit, tuple and struct variant patterns whose parts are names or `_`. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const MACRO_NAMES='format panic assert assert_eq assert_ne debug_assert debug_assert_eq vec write writeln todo unimplemented unreachable'.split(' ');
RQ.CHECK_FEATURES=['derive','match guard','struct','enum','impl','trait','static','type alias','use','mod','generics','method','nested item','closure','match',
  'method call','field access','slice','reference','dereference','cast','try operator','struct literal','qualified path',
  'fn pointer','impl Trait','inferred type','pattern','let else','deferred initialization','format spec','assignment target','type checking',
  'const initializer','integer overflow','const folding','main signature','path call','function value','bit shift','block label','call','wrong argument count',
  'range expression','for iterable','let condition','array length','break outside loop','field of a temporary',
  'explicit lifetime','lifetime elision','reference coercion','reference to reference','reborrow',
  'String','Vec','HashMap','Option','Result','Box','str',...MACRO_NAMES.filter(n=>n!=='format').map(n=>n+'!')];
const PRINT={println:false,print:false,eprintln:true,eprint:true}; // value: goes to stderr
const ITEM={Struct:'struct',Enum:'enum',Impl:'impl',Trait:'trait',Static:'static',TypeAlias:'type alias',Use:'use',Mod:'mod'};
const EXPR={Match:'match',Closure:'closure',MethodCall:'method call',Range:'range expression',Ref:'reference',Deref:'dereference',Try:'try operator',
  StructLit:'struct literal',LetCond:'let condition',Await:'async',QPath:'qualified path'};
const TYPE_NODE={Slice:'slice',FnPtr:'fn pointer',ImplTrait:'impl Trait',QPath:'qualified path',Infer:'inferred type'};
const COMPARE=new Set(['==','!=','<','>','<=','>=']);
const ARITH=new Set(['+','-','*','/','%']);
const MAX_ARRAY=10000;

RQ.check=ast=>{
  const {T,unify,isInt,res,show,fits,isCopy,has,hasRef}=RQ.types;
  const errors=[],un=[],seen=new Set(),info=new Map();
  let regions=0;
  const mkRef=(mut,to)=>T.ref(mut,to,++regions);
  const I=n=>{let o=info.get(n);if(!o){o={};info.set(n,o);}return o;};
  const unsup=(f,line)=>{const k=f+'@'+line;if(!seen.has(k)){seen.add(k);un.push({feature:f,line});}return T.any;};
  const syn=(line,col,msg)=>errors.push({line,col,msg});
  const fns=new Map(),consts=new Map(),itemNames=new Set(),structs=new Map(),enums=new Map(),drops=new Map(),methods=new Map();
  let curSelf=null;
  // lets that rebind a visible name, those whose value reads the old one, and every read of a local variable
  let shadows=0,shadowUses=0,varUses=0;
  const defined=it=>{
    if(itemNames.has(it.name)){errors.push(RQ.diag.make('E0428',it.line,it.col,{name:it.name}));return false;}
    itemNames.add(it.name);return true;
  };
  const peel=e=>e.t==='Paren'?peel(e.expr):e;
  const mism=(want,got,n)=>errors.push(RQ.diag.make('E0308',n.line,n.col,{expected:show(want),found:show(got)}));
  const expect=(got,want,n)=>{if(unify(got,want))return true;mism(want,got,n);return false;};
  // where a value goes into a typed place (let annotation, argument, return): &String becomes &str, and no other reference
  // converts. Two plainly different types are E0308 as always; a reference pair rustc might still convert is not guessed.
  const headOf=t=>{t=res(t);return ['int','ivar','float','fvar','bool','char','unit'].includes(t.k)?'scalar':['tuple','array','slice','String'].includes(t.k)?t.k:null;};
  const isRef=t=>{t=res(t);return t.k==='ref'||t.k==='str';};
  function clashes(g,w){
    g=res(g);w=res(w);
    const gr=isRef(g),wr=isRef(w);
    if(!gr&&!wr)return true;
    if(gr&&wr)return g.k==='ref'&&w.k==='ref'&&g.mut===w.mut&&!!headOf(g.to)&&!!headOf(w.to)&&headOf(g.to)!==headOf(w.to);
    return !!headOf(gr?w:g);
  }
  function coerce(got,want,n){
    if(unify(got,want))return true;
    const g=res(got),w=res(want);
    if(g.k==='ref'&&!g.mut&&res(g.to).k==='String'&&w.k==='str')return true;
    if(g.k==='ref'&&w.k==='ref'&&!g.mut&&!w.mut&&res(g.to).k==='array'&&res(w.to).k==='slice'&&unify(res(g.to).el,res(w.to).el))return true;
    // a shared reference never coerces to a &mut one; the other way round is a reborrow, which is not modeled
    if(g.k==='ref'&&w.k==='ref'&&!g.mut&&w.mut||clashes(g,w))mism(want,got,n);else unsup('reference coercion',n.line);
    return false;
  }
  const unknown=(name,n)=>{errors.push(RQ.diag.make('E0425',n.line,n.col,{name}));return T.any;};
  const endNode=n=>n.t==='Block'&&n.tail?endNode(n.tail):n;
  // the number of values a type holds, so nested arrays cannot multiply into a print or a clone that freezes the page
  const weight=t=>{
    t=res(t);
    const sum=fs=>fs.reduce((s,f)=>s+weight(f.ty||f),0);
    return t.k==='array'?t.n*weight(t.el):t.k==='tuple'?sum(t.els):t.k==='struct'?sum(structs.get(t.name).fields):t.k==='enum'?sum(t.builtin?t.args:enums.get(t.name).variants.flatMap(v=>v.fields)):1;
  };
  // rustc gives a bare literal under a cast the cast's type, so the checker has to see it too
  const bareLit=e=>{
    e=peel(e);let neg=false;
    if(e.t==='Unary'&&e.op==='-'){neg=true;e=peel(e.expr);}
    return e.t==='Lit'&&e.kind==='int'&&!e.suffix?{lit:e,v:neg?-BigInt(e.v):BigInt(e.v)}:null;
  };

  // the type nodes inside a type node; every walker below goes through it so a new type form is handled in one place
  const kids=n=>n.t==='Ref'||n.t==='Array'||n.t==='Slice'?[n.ty]:n.t==='Tuple'?n.tys:n.t==='Path'?n.segs.flatMap(g=>(g.args||[]).filter(a=>a.t!=='Lifetime'&&a.t!=='Binding'&&a.t!=='Lit')):[];
  // a reference type with no lifetime written: in a return type that needs lifetime elision (E0106/E0515)
  const bareRef=n=>n.t==='Ref'?n.lt===null||bareRef(n.ty):kids(n).some(bareRef);
  const firstBare=n=>n.t==='Ref'?(n.lt===null?n:firstBare(n.ty)):kids(n).map(firstBare).find(Boolean)||null;
  const countRefs=n=>n.t==='Ref'?1+countRefs(n.ty):kids(n).reduce((a,x)=>a+countRefs(x),0);
  const hasMutRef=n=>n.t==='Ref'?n.mut||hasMutRef(n.ty):kids(n).some(hasMutRef);
  const optTy=t=>T.enum('Option',[t],DERIVES,true),resTy=(t,e)=>T.enum('Result',[t,e],DERIVES,true);
  const adtRec=n=>structs.get(n)||enums.get(n);
  const adtTy=n=>{const r=structs.get(n);return r?T.struct(n,r.der):T.enum(n,[],enums.get(n).der);};
  // `top` is set only for a fn's whole return type (and a const's type): that is the one place `&'static str` is checked against its leaves
  function tyOf(n,top){
    if(n.t==='Path'&&n.segs.length===1&&!n.global&&!n.segs[0].fn){
      const sg=n.segs[0],s=sg.name;
      if(sg.args){
        const ok=(s==='Option'&&sg.args.length===1||s==='Result'&&sg.args.length===2)&&!structs.has(s)&&!enums.has(s);
        if(!ok||kids(n).length!==sg.args.length)return unsup(adtRec(s)?'generics':s,n.line);
        const as=sg.args.map(a=>tyOf(a));
        return s==='Option'?optTy(as[0]):resTy(as[0],as[1]);
      }
      if(isInt(s))return T.int(s);
      if(s==='bool')return T.bool;
      if(s==='char')return T.char;
      if(s==='f64')return T.float;
      if(s==='String')return T.string;
      if(s==='Self'&&curSelf)return adtTy(curSelf);
      if(adtRec(s))return adtTy(s);
      return unsup(s==='Self'?'impl':s,n.line);
    }
    if(n.t==='Ref'){
      const to=n.ty,isStr=to.t==='Path'&&to.segs.length===1&&!to.segs[0].args&&to.segs[0].name==='str';
      if(to.t==='Ref')return unsup('reference to reference',n.line);
      if(n.lt&&!(top&&n.lt==='static'&&isStr&&!n.mut))return unsup('explicit lifetime',n.line);
      if(isStr)return n.mut?unsup('reference',n.line):T.str;
      if(to.t==='Slice'){const el=tyOf(to.ty);return n.mut?unsup('reference',n.line):mkRef(false,T.slice(el));}
      return mkRef(n.mut,tyOf(to));
    }
    if(n.t==='Tuple')return n.tys.length?T.tuple(n.tys.map(x=>tyOf(x))):T.unit;
    if(n.t==='Array'){
      const l=n.len;
      if(l.t!=='Lit'||l.kind!=='int'||BigInt(l.v)>BigInt(MAX_ARRAY))return unsup('array length',n.line);
      const t=T.array(tyOf(n.ty),Number(l.v));
      return weight(t)>MAX_ARRAY?unsup('array length',n.line):t;
    }
    return unsup(n.t==='Path'?n.segs[n.segs.length-1].name:TYPE_NODE[n.t]||n.t,n.line);
  }

  const DERIVES=['Debug','Clone','Copy','PartialEq','Eq'];
  // the derived traits, or null when an attribute is anything but a plain derive of a modeled trait
  function derivesOf(it){
    const out=[];
    for(const a of it.attrs){
      const m=/^derive \( (.*) \)$/.exec(a);
      if(!m)return null;
      for(const x of m[1].split(',')){
        const t=x.trim();
        if(!t)continue;
        if(!DERIVES.includes(t)||out.includes(t))return null;
        out.push(t);
      }
    }
    return out;
  }
  // a struct and an enum live in the type namespace, so they may share a name with a fn or a const
  for(const it of ast.items)if(it.t==='Struct'||it.t==='Enum'){
    if(structs.has(it.name)||enums.has(it.name))errors.push(RQ.diag.make('E0428',it.line,it.col,{name:it.name}));
    else (it.t==='Struct'?structs:enums).set(it.name,{node:it,kind:'named',fields:[],variants:[],der:derivesOf(it)||[]});
  }
  const BUILTIN=new Set(['String','bool','char','f64','str','Vec','Option','Result','Box','HashMap','Self']);
  const refNode=n=>n.t==='Ref'||kids(n).some(refNode);
  const fieldList=(kind,fs)=>kind==='tuple'?fs.map((t,i)=>({name:String(i),ty:t})):fs;
  // a field that is a reference needs a lifetime, which is not modeled
  function fieldsOk(kind,fs){
    const names=new Set();
    for(const f of fieldList(kind,fs)){
      if(names.has(f.name)||refNode(f.ty))return false;
      names.add(f.name);
    }
    return true;
  }
  function structDecl(it){
    const rec=structs.get(it.name);
    if(rec.node!==it)return;
    if(derivesOf(it)===null){unsup('derive',it.line);return;}
    if(it.generics.length||BUILTIN.has(it.name)||isInt(it.name)||!fieldsOk(it.kind,it.fields)){unsup('struct',it.line);return;}
    rec.kind=it.kind;
    rec.fields=fieldList(it.kind,it.fields).map(f=>({name:f.name,ty:tyOf(f.ty)}));
  }
  function enumDecl(it){
    const rec=enums.get(it.name);
    if(rec.node!==it)return;
    if(derivesOf(it)===null){unsup('derive',it.line);return;}
    const vn=new Set(it.variants.map(v=>v.name));
    if(it.generics.length||BUILTIN.has(it.name)||isInt(it.name)||!it.variants.length||vn.size!==it.variants.length||it.variants.some(v=>v.disc||!fieldsOk(v.kind,v.fields))){unsup('enum',it.line);return;}
    rec.variants=it.variants.map(v=>({name:v.name,kind:v.kind,fields:fieldList(v.kind,v.fields).map(f=>({name:f.name,ty:tyOf(f.ty)}))}));
  }
  const DROP_OK=new Set(['Block','ExprStmt','Macro','Lit','Path','Field','Paren']);
  const one=n=>n&&n.t==='Path'&&n.segs.length===1&&!n.segs[0].args&&!n.segs[0].fn;
  function dropImpl(it){
    const f=it.items[0],tr=it.trait,st=it.selfTy;
    const name=one(st)?st.segs[0].name:'';
    let ok=one(tr)&&tr.segs[0].name==='Drop'&&!it.generics.length&&!it.attrs.length&&structs.has(name)&&!drops.has(name)
      &&it.items.length===1&&f.t==='Fn'&&f.name==='drop'&&!f.generics.length&&!f.attrs.length&&!f.params.length&&!f.ret&&!!f.body
      &&!!f.selfParam&&f.selfParam.ref&&f.selfParam.mut&&!f.selfParam.lt&&!f.selfParam.ty;
    // the body only prints: anything else (a call, a move, a borrow) would need the full analysis of a method
    if(ok){
      if(f.body.tail||f.body.stmts.some(x=>x.t!=='ExprStmt'||x.expr.t!=='Macro'||!(x.expr.name in PRINT)))ok=false;
      RQ.walk(f.body,n=>{if(!DROP_OK.has(n.t))ok=false;});
    }
    if(ok)drops.set(name,it);else unsup('impl',it.line);
  }

  // from is the index, among the call's arguments (the receiver first), of the one the result borrows
  function fnSig(it,owner){
    const sp=it.selfParam;
    if(it.generics.length)unsup('generics',it.line);
    if(sp&&sp.lt)unsup('explicit lifetime',sp.line);
    else if(sp&&sp.ty)unsup('method',sp.line);
    const names=new Set();
    const params=it.params.map(p=>{
      const ok=p.pat.t==='IdentPat'&&!p.pat.sub&&!p.pat.byRef;
      if(!ok)unsup('pattern',p.pat.line);
      else if(names.has(p.pat.name))errors.push(RQ.diag.make('E0415',p.pat.line,p.pat.col,{name:p.pat.name}));
      else names.add(p.pat.name);
      return {name:ok?p.pat.name:'_',mut:ok&&p.pat.mut,ty:tyOf(p.ty),pat:p.pat};
    });
    const ret=it.ret?tyOf(it.ret,true):T.unit;
    const sh=sp?1:0;
    let from=-1;
    if(it.ret&&bareRef(it.ret)){
      // a &self or &mut self result borrows from self; otherwise one lifetime position among the parameters is the one the result borrows, and none or several is E0106
      const refs=it.params.map(p=>countRefs(p.ty)),total=refs.reduce((a,x)=>a+x,0);
      const sharedOnly=!hasMutRef(it.ret)&&(it.ret.t==='Ref'||it.ret.t==='Path'&&kids(it.ret).every(k=>k.t==='Ref'&&k.lt===null));
      if(sp&&sp.ref){if(sharedOnly)from=0;else unsup('lifetime elision',it.ret.line);}
      else if(total!==1){const at=firstBare(it.ret);errors.push(RQ.diag.make('E0106',at.line,at.col,{}));}
      else{
        const q=it.params[refs.indexOf(1)];
        if(sharedOnly&&q.ty.t==='Ref'&&!q.ty.mut&&q.ty.lt===null)from=refs.indexOf(1)+sh;else unsup('lifetime elision',it.ret.line);
      }
    }
    const selfTy=sp&&owner?(sp.ref?mkRef(sp.mut,adtTy(owner)):adtTy(owner)):null;
    return {params,ret,from,selfKind:sp?(sp.ref?(sp.mut?'&mut':'&'):'val'):null,selfTy,selfMut:!!sp&&!sp.ref&&sp.mut};
  }
  function implDecl(it){
    const st=it.selfTy,name=one(st)?st.segs[0].name:'';
    const ok=!it.trait&&!it.generics.length&&!it.attrs.length&&!!adtRec(name)&&it.items.every(x=>x.t==='Fn'&&!x.attrs.length);
    if(!ok){unsup('impl',it.line);return;}
    curSelf=name;
    const mm=methods.get(name)||new Map();
    methods.set(name,mm);
    for(const f of it.items){
      if(mm.has(f.name)){unsup('impl',f.line);continue;}
      if(!f.body)syn(f.line,f.col,'associated function in `impl` without body');
      mm.set(f.name,{node:f,owner:name,key:name+'::'+f.name,...fnSig(f,name)});
    }
    curSelf=null;
  }

  for(const it of ast.items){
    if(it.t==='Struct')structDecl(it);
    else if(it.t==='Enum')enumDecl(it);
    else if(it.t==='Impl'&&it.trait)dropImpl(it);
    else if(it.t==='Fn'){
      const sg=fnSig(it,null);
      if(it.selfParam)unsup('method',it.line);
      if(it.name==='main'&&(sg.params.length||it.ret))unsup('main signature',it.line);
      if(!it.body)syn(it.line,it.col,'free function without a body');
      if(defined(it))fns.set(it.name,{node:it,params:sg.params,ret:sg.ret,from:sg.from});
    }else if(it.t==='Const'){
      const ty=tyOf(it.ty,true);
      if(defined(it))consts.set(it.name,{node:it,ty});
    }else if(it.t!=='Impl'&&(ITEM[it.t]||!['Extern','MacroRules','Union'].includes(it.t)))unsup(ITEM[it.t]||it.t,it.line);
  }
  for(const it of ast.items)if(it.t==='Impl'&&!it.trait)implDecl(it);
  // a tuple or unit struct is also a value, so it cannot share a name with a fn or a const
  for(const [name,rec] of structs)if(rec.kind!=='named'&&(fns.has(name)||consts.has(name)))unsup('struct',rec.node.line);
  // a type that holds itself, directly or through a tuple, an array, a variant or an Option, has infinite size (E0072), which is not modeled
  const heldBy=t=>{
    t=res(t);
    if(t.k==='struct')return structs.get(t.name).fields.map(f=>f.ty);
    if(t.k==='enum')return t.builtin?t.args:enums.get(t.name).variants.flatMap(v=>v.fields.map(f=>f.ty));
    return t.k==='tuple'?t.els:t.k==='array'?[t.el]:[];
  };
  const holds=(t,seenS)=>{
    t=res(t);
    if(t.k==='struct'||t.k==='enum'&&!t.builtin){
      if(seenS.has(t.name))return true;
      seenS=new Set([...seenS,t.name]);
    }
    return heldBy(t).some(x=>holds(x,seenS));
  };
  for(const [name,rec] of [...structs,...enums]){
    const all=rec.fields.concat(...rec.variants.map(v=>v.fields));
    if(all.some(f=>holds(f.ty,new Set([name])))){rec.fields=[];rec.variants=[];unsup(rec.node.t==='Struct'?'struct':'enum',rec.node.line);}
    else if(weight(rec.node.t==='Struct'?T.struct(name,rec.der):T.enum(name,[],rec.der))>MAX_ARRAY)unsup('array length',rec.node.line);
    // a derive needs every field to have the trait, and Copy and Eq need Clone and PartialEq beside them
    else if(rec.der.some(tr=>all.some(f=>!has(f.ty,tr)))||rec.der.includes('Copy')&&!rec.der.includes('Clone')||rec.der.includes('Eq')&&!rec.der.includes('PartialEq'))unsup('derive',rec.node.line);
  }
  if(!fns.has('main')&&!un.length)syn(1,1,'`main` function not found in the file');

  let scopes=[],curRet=T.unit,curStatic=false,loops=[],vars=[],lits=[],fmts=[],tvs=[];
  // a fn declared `-> &'static str` may only give back string literals: any other leaf could borrow from a parameter, which rustc
  // rejects, and the quest does not model lifetimes. Block tails and if branches are looked through; return/break/continue have their own check.
  function staticLeaves(e){
    e=peel(e);
    if(e.t==='Block'){if(e.tail)staticLeaves(e.tail);}
    else if(e.t==='If'){staticLeaves(e.then);if(e.els)staticLeaves(e.els);}
    else if(!(e.t==='Lit'&&e.kind==='str')&&!['Return','Break','Continue'].includes(e.t))unsup('explicit lifetime',e.line);
  }
  const lookup=n=>{for(let i=scopes.length-1;i>=0;i--)if(scopes[i].has(n))return scopes[i].get(n);return null;};
  const bindVar=(n,mut,kind,ty,node)=>{
    const b={mut,kind,ty,assigns:0};
    // a by-value binding named like a unit variant of its own enum type is E0170, deny-by-default in rustc
    if(node&&!mut&&!node.byRef&&!node.sub){
      let u=res(ty);while(u.k==='ref')u=res(u.to);
      const rec=u.k==='enum'?enums.get(u.name):null;
      if(rec&&rec.variants.some(v=>v.name===n&&v.kind==='unit'))errors.push(RQ.diag.make('E0170',node.line,node.col,{name:n,enum:u.name}));
    }
    scopes[scopes.length-1].set(n,b);
    if(node){const o=I(node);o.bind=b;o.ty=ty;}
    return b;
  };
  const ivar=()=>{const v=T.ivar();vars.push(v);return v;};
  const fvar=()=>{const v=T.fvar();vars.push(v);return v;};
  // a type with a struct or enum inside: printing it without Display or Debug is E0277, not something unmodeled
  const mentionsAdt=t=>{t=res(t);return t.k==='struct'||t.k==='enum'||t.k==='ref'&&mentionsAdt(t.to)||t.k==='tuple'&&t.els.some(mentionsAdt)||(t.k==='array'||t.k==='slice')&&mentionsAdt(t.el);};
  const printable=(t,dbg)=>{
    t=res(t);
    switch(t.k){
      case 'struct':case 'enum':return dbg&&has(t,'Debug');
      case 'int':case 'float':case 'bool':case 'char':case 'str':case 'String':case 'any':case 'never':return true;
      case 'ref':return printable(t.to,dbg);
      case 'slice':return dbg&&printable(t.el,dbg);
      case 'unit':return dbg;
      case 'tuple':return dbg&&t.els.every(x=>printable(x,dbg));
      case 'array':return dbg&&printable(t.el,dbg);
      default:return false;
    }
  };
  function finish(){
    for(const v of vars){const r=res(v);if(r.k==='ivar')r.ref=T.int('i32');else if(r.k==='fvar')r.ref=T.float;}
    for(const [v,line] of tvs)if(res(v).k==='tvar')unsup('inferred type',line);
    for(const [e,t] of lits){const r=res(t);I(e).rty=r.k==='int'?r.ty:r.k==='float'?'f64':'i32';}
    for(const f of fmts){
      const r=res(f.t);
      if(!printable(r,f.fmt.debug)){
        if(mentionsAdt(r))errors.push(RQ.diag.make('E0277',f.line,f.col,{type:show(r),debug:f.fmt.debug}));
        else unsup('type checking',f.line);
      }
      else if(f.fmt.prec!==null&&r.k!=='float'&&r.k!=='any')unsup('format spec',f.line);
    }
    vars=[];lits=[];fmts=[];tvs=[];
  }

  function slice(e,x){
    const rg=peel(x.index),b=res(ex(x.expr)),ts=[rg.from,rg.to].filter(Boolean).map(ex);
    if(e.mut)return unsup('reference',e.line);
    if(b.k==='any'||b.k==='never')return T.any;
    if(!ts.every(t=>unify(t,T.int('usize'))))return unsup('type checking',e.line);
    if(b.k==='ref'&&b.mut)return unsup('reborrow',e.line);
    const base=b.k==='ref'?res(b.to):b;
    if(base.k==='String'||b.k==='str'){I(e).slice='str';return T.str;}
    if(base.k==='array'||base.k==='slice'){I(e).slice='arr';return mkRef(false,T.slice(base.el));}
    return unsup('type checking',e.line);
  }

  function block(b){
    if(b.unsafe)return unsup('unsafe',b.line);
    if(b.label)return unsup('block label',b.line);
    scopes.push(new Map());
    let diverges=false;
    for(const s of b.stmts){
      if(s.t==='Let'){
        const pt=s.pat;
        const named=pt.t==='IdentPat'&&!pt.sub&&!pt.byRef;
        if(!named&&pt.t!=='Wild')unsup('pattern',pt.line);
        if(s.els)unsup('let else',s.line);
        if(!s.init){
          // without a type the variable's type would have to be worked out from a later assignment
          if(!s.ty)unsup('deferred initialization',s.line);
          const b=named&&bindVar(pt.name,pt.mut,'let',s.ty?tyOf(s.ty):T.any,pt);
          if(b&&s.ty)b.deferred=true;
          continue;
        }
        let t=ex(s.init);
        if(named&&lookup(pt.name)){
          shadows++;
          let reads=false;
          RQ.walk(s.init,n=>{if(n.t==='Path'&&n.segs.length===1&&n.segs[0].name===pt.name)reads=true;});
          if(reads)shadowUses++;
        }
        if(s.ty){const a=tyOf(s.ty);coerce(t,a,s.init);t=a;}
        if(named)bindVar(pt.name,pt.mut,'let',t,pt);
      }else if(s.t==='ExprStmt'){if(res(ex(s.expr)).k==='never')diverges=true;}
      else if(s.t==='ItemStmt')unsup('nested item',s.line);
      else unsup(s.t,s.line);
    }
    const t=b.tail?ex(b.tail):diverges?T.never:T.unit;
    scopes.pop();
    return t;
  }

  function format(m){
    const name=m.name,line=m.line;
    if(!m.args.length){
      if(name==='println'||name==='eprintln')return T.unit;
      syn(line,m.col,'requires at least a format string argument');return T.unit;
    }
    const f=m.args[0];
    if(f.t!=='Lit'||f.kind!=='str'){m.args.forEach(ex);syn(f.line,f.col,'format argument must be a string literal');return T.unit;}
    const pf=RQ.std.parseFormat(f.v);
    if(pf.error){syn(f.line,f.col,pf.error);return T.unit;}
    if(pf.spec){unsup('format spec',line);return T.unit;}
    const pos=m.args.slice(1).map(ex),named=m.named.map(x=>ex(x.expr)),usedPos=new Set(),usedNamed=new Set(),caps=[];
    I(f).caps=caps;
    for(const part of pf.parts){
      if(part.idx!==undefined){
        if(part.idx>=pos.length){syn(f.line,f.col,'invalid reference to positional argument '+part.idx+' (there '+(pos.length===1?'is 1 argument':'are '+pos.length+' arguments')+')');return T.unit;}
        usedPos.add(part.idx);fmts.push({t:pos[part.idx],line:m.args[1+part.idx].line,col:m.args[1+part.idx].col,fmt:part.fmt});
      }else if(part.name!==undefined){
        const ni=m.named.findIndex(x=>x.name===part.name);
        if(ni>=0){usedNamed.add(part.name);fmts.push({t:named[ni],line:m.named[ni].expr.line,col:m.named[ni].expr.col,fmt:part.fmt});}
        else{
          const l=lookup(part.name);if(l)varUses++;
          const b=l||consts.get(part.name);
          if(b)caps.push({name:part.name,bind:l});
          if(b)fmts.push({t:b.ty,line:f.line,col:f.col,fmt:part.fmt});
          else if(fns.has(part.name))unsup('function value',f.line);
          else unknown(part.name,f);
        }
      }
    }
    for(let i=0;i<pos.length;i++)if(!usedPos.has(i)){syn(m.args[1+i].line,m.args[1+i].col,'argument never used');return T.unit;}
    for(const x of m.named)if(!usedNamed.has(x.name)){syn(x.expr.line,x.expr.col,'named argument never used');return T.unit;}
    return T.unit;
  }

  // operands of an operator: two different concrete int types are E0308 at the right operand, any other clash is not modeled
  function operands(a,b,e){
    if(unify(a,b))return true;
    const x=res(a),y=res(b);
    if(x.k==='int'&&y.k==='int')mism(a,b,e.rhs);else unsup('type checking',e.line);
    return false;
  }
  const cls=t=>{t=res(t);return t.k==='int'||t.k==='ivar'||t.k==='float'||t.k==='fvar'?'num':t.k;};

  function cast(e){
    const src=ex(e.expr),to=tyOf(e.ty),s=res(src),d=res(to);
    if(d.k==='any'||s.k==='any'||s.k==='never')return to;
    const lit=bareLit(e.expr);
    if(lit&&d.k==='int'){
      if(!fits(lit.v,d.ty))return unsup('const folding',e.line);
      unify(src,to);return to;
    }
    if(lit&&d.k==='char'){if(fits(lit.v,'u8')){unify(src,T.int('u8'));return to;}return unsup('cast',e.line);}
    const num=s.k==='int'||s.k==='ivar'||s.k==='float'||s.k==='fvar';
    const ok=d.k==='int'||d.k==='float'?num||s.k==='bool'&&d.k==='int'||s.k==='char'&&d.k==='int'
      :d.k==='char'?s.k==='char'||(s.k==='int'&&s.ty==='u8'):d.k==='bool'&&s.k==='bool';
    return ok?to:unsup('cast',e.line);
  }

  const fresh=line=>{const v=T.tvar();tvs.push([v,line]);return v;};
  const variantsOf=t=>{
    t=res(t);
    if(!t.builtin)return enums.get(t.name).variants;
    const f=ty=>[{name:'0',ty}];
    return t.name==='Option'?[{name:'None',kind:'unit',fields:[]},{name:'Some',kind:'tuple',fields:f(t.args[0])}]
      :[{name:'Ok',kind:'tuple',fields:f(t.args[0])},{name:'Err',kind:'tuple',fields:f(t.args[1])}];
  };
  const noArgs=p=>p.t==='Path'&&!p.global&&p.segs.every(g=>!g.args&&!g.fn);
  // what a path names when it builds a struct or an enum variant: {name (the type), ty, kind, fields, vi (the variant, null for a struct)}
  function ctorOf(p){
    if(!noArgs(p)||p.segs.length>2)return null;
    const sg=p.segs;
    let n=sg[0].name,ty,vn=null;
    if(sg.length===1){
      if(n==='Self'&&curSelf&&structs.has(curSelf))n=curSelf;
      const shadowed=fns.has(n)||consts.has(n)||structs.has(n)||enums.has(n);
      if(structs.has(n)){
        const r=structs.get(n);
        return {name:n,ty:adtTy(n),kind:r.kind,fields:r.fields,vi:null};
      }
      if(shadowed)return null;
      if(n==='None'||n==='Some')ty=optTy(fresh(p.line));
      else if(n==='Ok'||n==='Err')ty=resTy(fresh(p.line),fresh(p.line));
      else return null;
      vn=n;
    }else{
      if(n==='Self')n=curSelf;
      vn=sg[1].name;
      if(enums.has(n))ty=adtTy(n);
      else if(!structs.has(n)&&!fns.has(n)&&!consts.has(n)&&n==='Option')ty=optTy(fresh(p.line));
      else if(!structs.has(n)&&!fns.has(n)&&!consts.has(n)&&n==='Result')ty=resTy(fresh(p.line),fresh(p.line));
      else return null;
    }
    const vi=variantsOf(ty).findIndex(v=>v.name===vn);
    if(vi<0)return null;
    const v=variantsOf(ty)[vi];
    return {name:res(ty).name,ty,kind:v.kind,fields:v.fields,vi};
  }
  function variantIndex(t,p){
    if(!noArgs(p)||p.segs.length>2)return -1;
    const sg=p.segs,vs=variantsOf(t);
    if(sg.length===1)return t.builtin?vs.findIndex(v=>v.name===sg[0].name):-1;
    const n=sg[0].name==='Self'?curSelf:sg[0].name;
    return n===t.name?vs.findIndex(v=>v.name===sg[1].name):-1;
  }
  // the root name, the field names down to the place, and the first reference the place reaches through, for a place made only of fields
  function chainOf(e){
    const parts=[];
    let via=null;
    for(e=peel(e);e.t==='Field';e=peel(e.expr)){
      parts.unshift(e.name);
      const o=info.get(e.expr),bt=o&&o.ty&&res(o.ty);
      if(bt&&bt.k==='ref')via=via||bt;
    }
    if(e.t!=='Path'||e.segs.length!==1)return null;
    const o=info.get(e),bt=o&&o.ty&&res(o.ty);
    if(parts.length&&bt&&bt.k==='ref')via=via||bt;
    return {root:e,name:e.segs[0].name,parts,via,text:[e.segs[0].name,...parts].join('.')};
  }
  const UNIVERSAL=['into','try_into','borrow','borrow_mut','type_id'];
  // methods the compiler provides: derived Clone, and a few on Option and Result
  function builtinMethod(base,name){
    const rec=(selfKind,params,ret,from)=>({key:name==='clone'?'Clone::clone':(base.builtin?base.name+'::':'')+name,selfKind,params:params.map(ty=>({ty})),ret,from:from??(hasRef(base)?0:-1),builtin:true});
    if(name==='clone'&&has(base,'Clone'))return rec('&',[],base);
    if(!base.builtin)return null;
    const opt=base.name==='Option',[a,b]=base.args;
    if(name==='is_some'||name==='is_none')return opt?rec('&',[],T.bool,-1):null;
    if(name==='is_ok'||name==='is_err')return opt?null:rec('&',[],T.bool,-1);
    // Result::unwrap and expect print the error, so they need it to be Debug
    const dbgOk=opt||has(b,'Debug');
    if(name==='unwrap')return dbgOk?rec('val',[],a):null;
    if(name==='expect')return dbgOk?rec('val',[T.str],a):null;
    if(name==='unwrap_or')return hasRef(base)?null:rec('val',[a],a);
    return null;
  }
  function adtMethod(e,r,base,args){
    const isRef=r.k==='ref',name=e.name,own=base.builtin?null:methods.get(base.name);
    const m=(own&&own.get(name))||builtinMethod(base,name);
    const ch=chainOf(e.recv),text=isRef?(peel(e.recv).t==='Path'?'*':'')+(ch?ch.text:'value'):ch?ch.text:'value';
    if(!m){
      if(name==='clone'&&isRef&&!r.mut&&!args.length){I(e).um={key:'ref::clone',self:'&',adj:'val',kind:peel(e.recv).t==='Path'?'refvar':'temp',ref:true,text,from:0};return r;}
      if(base.builtin||UNIVERSAL.includes(name)||(name==='eq'||name==='ne')&&has(base,'PartialEq'))return unsup('method call',e.line);
      errors.push(RQ.diag.make('E0599',e.nline,e.ncol,{what:'method',name,type:show(base),kind:base.k}));
      return T.any;
    }
    const sk=m.selfKind;
    if(!sk){errors.push(RQ.diag.make('E0599',e.nline,e.ncol,{what:'method',name,type:show(base),kind:base.k}));return T.any;}
    if(args.length!==m.params.length)return unsup('wrong argument count',e.line);
    args.forEach((t,i)=>coerce(t,m.params[i].ty,e.args[i]));
    let adj;
    if(!isRef)adj=sk;
    else if(sk==='val')adj='copy';else if(!r.mut)adj='val';
    else adj=sk==='&'?'reb':'val';
    const p=peel(e.recv);
    I(e).um={key:m.key,self:sk,adj,kind:isRef?(p.t==='Path'?'refvar':'temp'):placeChain(e.recv)?'place':'temp',ref:isRef,text,from:m.from};
    // a &mut self method needs a mutable place: behind a shared reference, or through one to a field, it is E0596
    if(sk==='&mut'&&(isRef&&!r.mut||!isRef&&ch&&ch.via&&!ch.via.mut))errors.push(RQ.diag.make('E0596',e.line,e.col,{name:text,ref:true}));
    // a by-value self takes the value away from behind the reference, which only a Copy type allows
    if(sk==='val'&&isRef&&!isCopy(base))errors.push(RQ.diag.make('E0507',e.recv.line,e.recv.col,{name:text,mut:r.mut}));
    return m.ret;
  }

  function armPat(p,base,vs,mode,s,viaRef,cov,scrut){
    // one E0507 per match: the scrutinee is what the names move out of
    const moveOut=variant=>{
      if(cov.err)return;
      cov.err=true;
      const x=peel(scrut),inner=x.t==='Deref'?peel(x.expr):x,ch=chainOf(inner),via=x.t==='Deref'?res(info.get(inner).ty):ch&&ch.via;
      errors.push(RQ.diag.make('E0507',scrut.line,scrut.col,{name:ch?ch.text:'value',variant,mut:!!via&&via.mut}));
    };
    const bind=(sp,f,variant)=>{
      if(sp.t==='Wild')return;
      if(sp.t!=='IdentPat'||sp.sub||sp.byRef||scopes[scopes.length-1].has(sp.name)||consts.has(sp.name)||structs.has(sp.name)){unsup('pattern',sp.line);return;}
      const bt=mode==='ref'?mkRef(false,f.ty):f.ty;
      if(mode==='move'&&!isCopy(f.ty)){
        if(viaRef)moveOut(variant);
        else cov.moves=true;
      }
      bindVar(sp.name,sp.mut,'let',bt,sp);
      I(sp).sel=variant+'.'+f.name;
    };
    switch(p.t){
      case 'Wild':return 'all';
      case 'IdentPat':{
        const vi=base.builtin?vs.findIndex(v=>v.name===p.name&&v.kind==='unit'):-1;
        if(vi>=0&&!p.sub&&!p.byRef){I(p).variant=vi;return vi;}
        if(p.sub||p.byRef||consts.has(p.name)||structs.has(p.name)||p.name==='Some'||p.name==='Ok'||p.name==='Err'){unsup('pattern',p.line);return 'all';}
        if(mode==='move'&&!isCopy(s)){if(viaRef){unsup('move out of reference',p.line);return 'all';}cov.moves=true;}
        bindVar(p.name,p.mut,'let',s,p);I(p).sel='';
        return 'all';
      }
      case 'PathPat':{
        const vi=variantIndex(base,p.path);
        if(vi<0||vs[vi].kind!=='unit'){unsup('pattern',p.line);return 'all';}
        I(p).variant=vi;return vi;
      }
      case 'TupleStructPat':case 'StructPat':{
        const vi=variantIndex(base,p.path),v=vs[vi];
        if(vi<0||v.kind!==(p.t==='StructPat'?'named':'tuple')){unsup('pattern',p.line);return 'all';}
        I(p).variant=vi;
        if(p.t==='StructPat'){
          const seen=new Set();
          for(const f of p.fields){
            const fd=v.fields.find(x=>x.name===f.name);
            if(!fd||seen.has(f.name)){unsup('pattern',p.line);return vi;}
            seen.add(f.name);bind(f.pat,fd,v.name);
          }
          if(!p.rest&&seen.size!==v.fields.length)unsup('pattern',p.line);
        }else{
          const ri=p.pats.findIndex(x=>x.t==='Rest');
          if(p.pats.filter(x=>x.t==='Rest').length>1||(ri<0?p.pats.length!==v.fields.length:p.pats.length-1>v.fields.length)){unsup('pattern',p.line);return vi;}
          p.pats.forEach((sp,i)=>{
            if(sp.t==='Rest')return;
            const fi=ri>=0&&i>ri?v.fields.length-(p.pats.length-i):i;
            bind(sp,v.fields[fi],v.name);
          });
        }
        return vi;
      }
      default:unsup('pattern',p.line);return 'all';
    }
  }
  function matchExpr(e){
    const st=ex(e.scrut),s=res(st);
    if(e.arms.some(a=>a.guard))return unsup('match guard',e.line);
    if(s.k==='any'||s.k==='never')return T.any;
    const mode=s.k==='ref'?'ref':'move',base=s.k==='ref'?res(s.to):s;
    if(base.k!=='enum'||s.k==='ref'&&s.mut)return unsup('match',e.line);
    const vs=variantsOf(base),sc=peel(e.scrut),ch=chainOf(sc);
    const viaRef=sc.t==='Deref'||!!(ch&&ch.via);
    const covered=new Set(),cov={moves:false};
    let all=false,rt=null;
    for(const a of e.arms){
      scopes.push(new Map());
      const c=armPat(a.pat,base,vs,mode,s,viaRef,cov,e.scrut);
      if(c==='all')all=true;else covered.add(c);
      const bt=ex(a.body);
      scopes.pop();
      if(res(bt).k==='never')continue;
      if(rt===null)rt=bt;
      else if(!unify(rt,bt)){
        if(!clashes(bt,rt))return unsup('reference coercion',a.body.line);
        mism(rt,bt,endNode(a.body));
      }
    }
    if(!all&&vs.some((v,i)=>!covered.has(i))){
      const miss=vs.filter((v,i)=>!covered.has(i)).map(v=>(base.builtin?'':base.name+'::')+v.name+(v.kind==='tuple'?'('+v.fields.map(()=>'_').join(', ')+')':v.kind==='named'?' { .. }':''));
      errors.push(RQ.diag.make('E0004',e.scrut.line,e.scrut.col,{missing:miss}));
    }
    I(e).match={mode,place:placeChain(sc)||sc.t==='Deref',bindsMoved:cov.moves};
    return rt||T.never;
  }

  function ex(e){const t=expr(e);I(e).ty=t;return t;}
  const place=e=>{e=peel(e);return e.t==='Path'||e.t==='Field'||e.t==='Index'||e.t==='Deref';};
  const placeChain=e=>{e=peel(e);return e.t==='Path'||((e.t==='Field'||e.t==='Index')&&placeChain(e.expr));};
  function expr(e){
    switch(e.t){
      case 'Lit':{
        let t;
        if(e.kind==='int'){
          if(e.suffix&&!isInt(e.suffix))return unsup(e.suffix,e.line);
          t=e.suffix?T.int(e.suffix):ivar();
        }else if(e.kind==='float'){
          if(e.suffix==='f32')return unsup('f32',e.line);
          t=e.suffix==='f64'?T.float:fvar();
        }else if(e.kind==='str')return T.str;
        else if(e.kind==='char')return T.char;
        else return T.bool;
        lits.push([e,t]);return t;
      }
      case 'Paren':return ex(e.expr);
      case 'Path':{
        if(e.segs.length>2||e.global||e.segs.some(g=>g.args))return unsup('path call',e.line);
        const n=e.segs[0].name,local=e.segs.length===1&&lookup(n),b=local||(e.segs.length===1&&consts.get(n));
        if(local){varUses++;I(e).bind=local;}
        if(b)return b.ty;
        const ct=ctorOf(e);
        if(ct){
          if(ct.kind!=='unit')return unsup('function value',e.line);
          I(e).ctor={adt:ct.name,variant:ct.vi};
          return ct.ty;
        }
        if(e.segs.length===1&&fns.has(n))return unsup('function value',e.line);
        if(e.segs.length===1)return unknown(n,e);
        const owner=e.segs[0].name==='Self'?curSelf:e.segs[0].name;
        if(!adtRec(owner))return unsup('path call',e.line);
        if(methods.get(owner)&&methods.get(owner).has(e.segs[1].name))return unsup('function value',e.line);
        errors.push(RQ.diag.make('E0599',e.segs[1].line,e.col,{what:'item',name:e.segs[1].name,type:owner,kind:structs.has(owner)?'struct':'enum'}));
        return T.any;
      }
      case 'Unary':{
        const t=ex(e.expr),r=res(t);
        if(e.op==='-')return r.k==='int'&&RQ.types.isSigned(r.ty)||r.k==='ivar'||r.k==='float'||r.k==='fvar'||r.k==='any'?t:unsup('type checking',e.line);
        return unify(t,T.bool)?t:unsup('type checking',e.line);
      }
      case 'Binary':{
        let a=ex(e.lhs),b=ex(e.rhs);
        const op=e.op;
        if(op==='&&'||op==='||')return unify(a,T.bool)&&unify(b,T.bool)?T.bool:unsup('type checking',e.line);
        if(op==='<<'||op==='>>')return unsup('bit shift',e.line);
        // a shared reference to a number works like the number in arithmetic, and two of them compare like the numbers they point at
        const num=t=>{const r=res(t);return r.k==='ref'&&!r.mut&&['int','ivar','float','fvar'].includes(res(r.to).k)?r.to:null;};
        const na=num(a),nb=num(b);
        if(na||nb){
          if(!(COMPARE.has(op)?na&&nb:true)||!unify(na||a,nb||b))return unsup('type checking',e.line);
          a=na||a;b=nb||b;
        }
        if(!operands(a,b,e))return COMPARE.has(op)?T.bool:a;
        const u=res(a).k==='any'?b:a,c=cls(u);
        if(c==='struct'||c==='enum'){
          const eq=op==='=='||op==='!=';
          if(eq&&has(u,'PartialEq'))return T.bool;
          // Option and Result order their contents; a user type cannot derive PartialOrd here, so it has no ordering
          if(!COMPARE.has(op)||res(u).builtin&&!eq)return unsup('type checking',e.line);
          errors.push(RQ.diag.make('E0369',e.oline,e.ocol,{op,type:show(u)}));
          return T.bool;
        }
        if(COMPARE.has(op))return ['num','bool','char','str','any'].includes(c)?T.bool:unsup('type checking',e.line);
        if(ARITH.has(op))return c==='num'||c==='any'?u:unsup('type checking',e.line);
        if(op==='&'||op==='|'||op==='^')return ['int','ivar','any'].includes(res(u).k)?u:unsup('type checking',e.line);
        return unsup(op,e.line);
      }
      case 'Assign':{
        const r=ex(e.rhs);
        let ty;
        if(e.lhs.t==='Deref'){
          // *r = v writes through a &mut; through a & it is E0594, which is not modeled
          ty=ex(e.lhs);
          const rt=res(info.get(e.lhs.expr).ty);
          if(rt.k==='ref'&&!rt.mut)return unsup('assignment target',e.line);
          if(rt.k!=='ref')return T.any;
        }else if(peel(e.lhs).t==='Field'){
          ty=ex(e.lhs);
          const ch=chainOf(e.lhs);
          if(!ch||!lookup(ch.name))return res(ty).k==='any'?T.unit:unsup('assignment target',e.line);
          // E0594 is a borrowck error, like E0384: the borrow pass still runs beside it
          if(ch.via){if(!ch.via.mut)errors.push(RQ.diag.make('E0594',e.line,e.col,{name:ch.text,ref:true}));}
          else if(!lookup(ch.name).mut)errors.push(RQ.diag.make('E0594',e.line,e.col,{name:ch.text,root:ch.name}));
        }else{
          if(e.lhs.t!=='Path'||e.lhs.segs.length!==1||e.lhs.segs[0].args){ex(e.lhs);return unsup('assignment target',e.line);}
          const n=e.lhs.segs[0].name,b=lookup(n);
          if(!b){if(consts.has(n))return unsup('assignment target',e.line);return unknown(n,e.lhs);}
          b.assigns++;I(e).bind=b;
          // the first assignment to a deferred let is its initialisation: whether a second one is E0384 depends on the paths (borrow.js)
          if(!b.mut&&!b.deferred)errors.push(RQ.diag.make('E0384',e.line,e.col,{name:n,kind:b.kind}));
          ty=b.ty;
        }
        if(e.op!=='='){
          const op=e.op.slice(0,-1);
          if(op==='<<'||op==='>>')return unsup('bit shift',e.line);
          if(!operands(ty,r,{rhs:e.rhs,line:e.line}))return T.unit;
          const bit=op==='&'||op==='|'||op==='^',c=cls(ty);
          if(!(c==='any'||(bit?['int','ivar'].includes(res(ty).k):c==='num')))unsup('type checking',e.line);
        }else if(!unify(ty,r))return unsup('type checking',e.line);
        return T.unit;
      }
      case 'Call':{
        const sg=e.callee.t==='Path'?e.callee.segs:[];
        if(sg.length===2&&sg[0].name==='String'&&!sg[0].args&&!sg[1].args&&!e.callee.global&&(sg[1].name==='from'||sg[1].name==='new')){
          const ts=e.args.map(ex),from=sg[1].name==='from';
          if(ts.length!==(from?1:0))return unsup('wrong argument count',e.line);
          // String::from takes a &str or a &String; the other From impls (String, char, Box...) are not modeled
          if(from){const a=res(ts[0]);if(!(a.k==='str'||a.k==='any'||a.k==='ref'&&!a.mut&&res(a.to).k==='String'))return unsup('type checking',e.line);}
          I(e).sig={params:from?[T.str]:[],ret:T.string};
          return T.string;
        }
        if(sg.length===2&&sg[0].name==='Clone'&&sg[1].name==='clone'&&!sg[0].args&&!sg[1].args&&!e.callee.global){
          const ts=e.args.map(ex);
          if(ts.length!==1)return unsup('wrong argument count',e.line);
          // only a `&String` argument is modeled, so the copy is always a String
          const a=res(ts[0]);
          if(!(a.k==='any'||a.k==='ref'&&!a.mut&&res(a.to).k==='String'))return unsup('type checking',e.line);
          I(e).sig={params:ts,ret:T.string};
          return T.string;
        }
        const ct=e.callee.t==='Path'?ctorOf(e.callee):null;
        if(ct){
          const ts=e.args.map(ex);
          if(ct.kind!=='tuple')return unsup('call',e.line);
          if(ts.length!==ct.fields.length)return unsup('wrong argument count',e.line);
          ts.forEach((t,i)=>coerce(t,ct.fields[i].ty,e.args[i]));
          I(e).ctor={adt:ct.name,variant:ct.vi};
          return ct.ty;
        }
        if(e.callee.t==='Path'&&sg.length===2&&noArgs(e.callee)){
          const owner=sg[0].name==='Self'?curSelf:sg[0].name,m=methods.get(owner)&&methods.get(owner).get(sg[1].name);
          const ts=e.args.map(ex);
          if(m){
            const params=(m.selfTy?[m.selfTy]:[]).concat(m.params.map(q=>q.ty));
            if(ts.length!==params.length)return unsup('wrong argument count',e.line);
            ts.forEach((t,i)=>coerce(t,params[i],e.args[i]));
            I(e).sig={params,ret:m.ret,from:m.from,key:m.key};
            return m.ret;
          }
          if(adtRec(owner)){errors.push(RQ.diag.make('E0599',sg[1].line,e.callee.col,{what:'item',name:sg[1].name,type:owner,kind:structs.has(owner)?'struct':'enum'}));return T.any;}
          return unsup('path call',e.line);
        }
        if(e.callee.t!=='Path'||e.callee.segs.length!==1||e.callee.segs[0].args||e.callee.global){e.args.forEach(ex);return unsup(e.callee.t==='Path'?'path call':'call',e.line);}
        const n=e.callee.segs[0].name,f=fns.get(n);
        const ts=e.args.map(ex);
        if(lookup(n)||consts.has(n))return unsup('call',e.line);
        if(!f&&n==='drop'){
          if(ts.length!==1)return unsup('wrong argument count',e.line);
          I(e).sig={params:ts,ret:T.unit};
          return T.unit;
        }
        if(!f)return unknown(n,e.callee);
        if(ts.length!==f.params.length)return unsup('wrong argument count',e.line);
        ts.forEach((t,i)=>coerce(t,f.params[i].ty,e.args[i]));
        I(e).sig={params:f.params.map(p=>p.ty),ret:f.ret,from:f.from};
        return f.ret;
      }
      case 'Ref':{
        const sx=peel(e.expr);
        if(sx.t==='Index'&&peel(sx.index).t==='Range')return slice(e,sx);
        const t=ex(e.expr),r=res(t);
        if(r.k==='ref'||r.k==='str')return unsup('reference to reference',e.line);
        return mkRef(e.mut,t);
      }
      case 'Deref':{
        const t=ex(e.expr),r=res(t),x=peel(e.expr);
        if(x.t==='Path'&&info.get(x).bind)I(e).bind=info.get(x).bind;
        if(r.k==='ref')return r.to;
        return r.k==='any'||r.k==='never'?T.any:unsup('dereference',e.line);
      }
      case 'MethodCall':{
        const rt=ex(e.recv),args=e.args.map(ex),r=res(rt);
        if(r.k==='any'||r.k==='never')return T.any;
        const adt=r.k==='ref'?res(r.to):r;
        if(adt.k==='struct'||adt.k==='enum')return adtMethod(e,r,adt,args);
        // o owned String, r &String, m &mut String, s &str
        const seq=r.k==='array'?r:r.k==='ref'&&!r.mut&&['array','slice'].includes(res(r.to).k)?res(r.to):null;
        if(e.name==='len'&&seq&&(seq.k==='slice'||isCopy(seq))){
          if(args.length)return unsup('wrong argument count',e.line);
          I(e).recv={method:'len',kind:peel(e.recv).t==='Path'?'refvar':'temp',adj:'val'};
          return T.int('usize');
        }
        const shape=r.k==='String'?'o':r.k==='str'?'s':r.k==='ref'?(res(r.to).k==='String'?(r.mut?'m':'r'):''):'';
        const sig=RQ.std.methods.get(e.name);
        if(!sig||!shape||!sig.recv.includes(shape))return unsup('method call',e.line);
        if(shape==='m'&&e.name==='as_str')return unsup('reborrow',e.line);
        if(args.length!==sig.args.length)return unsup('wrong argument count',e.line);
        args.forEach((t,i)=>coerce(t,sig.args[i],e.args[i]));
        const kind=shape==='o'?(place(e.recv)?'place':'temp'):peel(e.recv).t==='Path'?'refvar':'temp';
        I(e).recv={method:e.name,kind,adj:shape==='o'?sig.self:'val'};
        return sig.ret;
      }
      case 'Macro':{
        if(e.args===null)return T.any;
        if(e.name in PRINT)return format(e);
        if(e.name==='format'){format(e);return T.string;}
        e.args.forEach(ex);
        return unsup(e.name+'!',e.line);
      }
      case 'Block':return block(e);
      case 'Return':{
        if(!e.expr){if(!unify(T.unit,curRet))unsup('type checking',e.line);return T.never;}
        if(coerce(ex(e.expr),curRet,e.expr)&&curStatic)staticLeaves(e.expr);
        return T.never;
      }
      case 'Tuple':return e.elems.length?T.tuple(e.elems.map(ex)):T.unit;
      case 'Array':{
        const ts=e.elems.map(ex),el=ts.length?ts[0]:T.any;
        for(const t of ts.slice(1))if(!unify(el,t))return unsup('type checking',e.line);
        return T.array(el,ts.length);
      }
      case 'ArrayRepeat':{
        const el=ex(e.elem);
        if(e.len.t!=='Lit'||e.len.kind!=='int'||BigInt(e.len.v)>BigInt(MAX_ARRAY))return unsup('array length',e.line);
        if(!isCopy(el))return unsup('type checking',e.line); // E0277: [expr; N] needs Copy
        const t=T.array(el,Number(e.len.v));
        return weight(t)>MAX_ARRAY?unsup('array length',e.line):t;
      }
      case 'Index':{
        const b=res(ex(e.expr)),i=ex(e.index);
        if(b.k==='any'||b.k==='never')return T.any;
        // through a `&[T]`; a `&[T; N]` keeps its length for the lint, so it is not indexed through the reference
        if(b.k==='ref'&&!b.mut&&res(b.to).k==='slice')return unify(i,T.int('usize'))?res(b.to).el:unsup('type checking',e.line);
        if(b.k!=='array'||!unify(i,T.int('usize')))return unsup('type checking',e.line);
        I(e).alen=b.n;return b.el;
      }
      case 'Field':{
        let b=res(ex(e.expr));
        if(b.k==='any'||b.k==='never')return T.any;
        // a field of a reference to a struct reads through it; only the `self` of a Drop impl is one
        if(b.k==='ref'&&res(b.to).k==='struct')b=res(b.to);
        if(b.k==='struct'){
          const f=structs.get(b.name).fields.find(x=>x.name===e.name);
          if(!f){errors.push(RQ.diag.make('E0609',e.nline||e.line,e.col,{name:e.name,type:b.name}));return T.any;}
          return placeChain(e.expr)?f.ty:unsup('field of a temporary',e.line);
        }
        const i=/^\d+$/.test(e.name)?Number(e.name):-1;
        if(b.k==='tuple'){
          if(i>=0&&i<b.els.length)return b.els[i];
          errors.push(RQ.diag.make('E0609',e.nline||e.line,e.col,{name:e.name,type:show(b)}));return T.any;
        }
        return unsup('field access',e.line);
      }
      case 'Cast':return cast(e);
      case 'StructLit':{
        const ct=e.path.t==='Path'?ctorOf(e.path):null;
        const ts=e.fields.map(f=>ex(f.expr));
        // a missing, repeated or unknown field (E0063, E0062, E0560) and `..base` are not modeled
        if(!ct||ct.kind!=='named'||e.base||e.fields.length!==ct.fields.length||e.fields.some(f=>!ct.fields.some(x=>x.name===f.name))||new Set(e.fields.map(f=>f.name)).size!==e.fields.length)return unsup('struct literal',e.line);
        e.fields.forEach((f,i)=>coerce(ts[i],ct.fields.find(x=>x.name===f.name).ty,f.expr));
        I(e).ctor={adt:ct.name,variant:ct.vi};
        return ct.ty;
      }
      case 'Match':return matchExpr(e);
      case 'If':{
        expect(ex(e.cond),T.bool,e.cond);
        const a=block(e.then);
        if(!e.els){return ['unit','never','any'].includes(res(a).k)?T.unit:unsup('type checking',e.line);}
        const b=e.els.t==='If'?ex(e.els):block(e.els);
        if(!unify(a,b)){
          // rustc coerces each arm to an annotation the arms are not yet checked against, so a clash between references is not a verdict
          if(!clashes(b,a))return unsup('reference coercion',e.line);
          mism(a,b,endNode(e.els));return a;
        }
        return res(a).k==='never'?b:a;
      }
      case 'Loop':{
        if(e.label)return unsup('block label',e.line);
        const l={ty:null,value:true};loops.push(l);
        block(e.body);loops.pop();
        return l.ty?l.ty:T.never;
      }
      case 'While':{
        if(e.label)return unsup('block label',e.line);
        expect(ex(e.cond),T.bool,e.cond);
        loops.push({ty:null,value:false});
        const t=block(e.body);loops.pop();
        if(!['unit','never','any'].includes(res(t).k))unsup('type checking',e.line);
        return T.unit;
      }
      case 'For':{
        if(e.label)return unsup('block label',e.line);
        const pt=e.pat,named=pt.t==='IdentPat'&&!pt.sub&&!pt.byRef;
        if(!named&&pt.t!=='Wild')unsup('pattern',pt.line);
        const it=peel(e.iter);let el=T.any;
        if(it.t==='Range'&&it.from&&it.to){
          const a=ex(it.from),b=ex(it.to);
          if(!unify(a,b)||!['int','ivar','any'].includes(res(a).k))unsup('type checking',it.line);else el=a;
        }else{ex(e.iter);unsup('for iterable',e.iter.line);}
        scopes.push(new Map());
        if(named)bindVar(pt.name,pt.mut,'let',el,pt);
        loops.push({ty:null,value:false});
        const t=block(e.body);loops.pop();scopes.pop();
        if(!['unit','never','any'].includes(res(t).k))unsup('type checking',e.line);
        return T.unit;
      }
      case 'Break':{
        if(e.label)return unsup('block label',e.line);
        const l=loops[loops.length-1];
        if(!l){if(e.expr)ex(e.expr);return unsup('break outside loop',e.line);}
        const t=e.expr?ex(e.expr):T.unit;
        if(e.expr&&!l.value)return unsup('type checking',e.line);
        if(l.value){if(l.ty===null)l.ty=t;else if(!unify(l.ty,t))return unsup('type checking',e.line);}
        return T.never;
      }
      case 'Continue':
        if(e.label)return unsup('block label',e.line);
        return loops.length?T.never:unsup('break outside loop',e.line);
      default:return unsup(EXPR[e.t]||e.t,e.line);
    }
  }

  function fnBody(f){
    if(!f.node.body)return;
    scopes=[new Map()];curRet=f.ret;loops=[];
    const r=f.node.ret;curStatic=!!r&&r.t==='Ref'&&r.lt==='static';
    if(f.selfTy)bindVar('self',f.selfMut,'param',f.selfTy,f.node.selfParam);
    for(const p of f.params)bindVar(p.name,p.mut,'param',p.ty,p.pat);
    const body=f.node.body,t=block(body);
    if(body.tail||f.node.ret){if(coerce(t,f.ret,body.tail?endNode(body.tail):f.node.ret)&&curStatic&&body.tail)staticLeaves(body.tail);}
    else if(!unify(t,f.ret))unsup('type checking',f.node.line);
    finish();
  }
  // rustc runs only const fn in a const, so a call to a plain fn there is E0015; the quest allows literals and maths on other consts
  const constOk=e=>e.t==='Lit'||e.t==='Path'||((e.t==='Paren'||e.t==='Unary')&&constOk(e.expr))||(e.t==='Binary'&&constOk(e.lhs)&&constOk(e.rhs));
  for(const f of fns.values())fnBody(f);
  for(const [owner,mm] of methods){
    curSelf=owner;
    for(const m of mm.values())fnBody(m);
  }
  curSelf=null;
  for(const [name,it] of drops){
    const f=it.items[0];
    scopes=[new Map()];curRet=T.unit;loops=[];curStatic=false;
    bindVar('self',false,'param',mkRef(true,T.struct(name)),f.selfParam);
    block(f.body);
    finish();
  }
  for(const c of consts.values()){
    scopes=[new Map()];loops=[];
    if(!c.node.init){unsup('deferred initialization',c.node.line);continue;}
    if(!constOk(c.node.init)){unsup('const initializer',c.node.line);continue;}
    expect(ex(c.node.init),c.ty,c.node.init);
    finish();
  }
  return {errors,unsupported:un,shadows,shadowUses,varUses,info};
};
})();
