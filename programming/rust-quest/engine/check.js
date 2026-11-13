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
     cc    a Call of a closure value; iterFor a For over an iterator value; um.inner a `&mut self` iterator method whose result borrows what the iterator borrows
     cl    a Closure (written by mir.js): {caps:[{name,bind,mode ('ref'|'mut'|'move'|'copy')}],kind ('Fn'|'FnMut'|'FnOnce'),move}
   Structs are `struct Name { f: T }`, `struct Name(T)` and `struct Name;`; enums have unit, tuple and struct variants. Type parameters are
   allowed, without bounds; a field is a reference only in a struct with a lifetime. #[derive] takes Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default and Hash. Option and Result are builtin generic enums; Vec<T> and
   HashMap<K, V> are builtin collections (kind coll) whose elements are never references. `use std::collections::HashMap;` is the one `use` that is modeled. The impls are inherent `impl Name { ... }` and `impl<T> Name<T> { ... }`,
   `impl Trait for Name` (a user trait, Display, From<X>) and `impl Drop for Name { fn drop(&mut self) { prints } }`. A match takes an enum or a shared reference to one,
   with unit, tuple and struct variant patterns whose parts are names or `_`. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const MACRO_NAMES='format panic assert assert_eq assert_ne debug_assert debug_assert_eq vec write writeln todo unimplemented unreachable'.split(' ');
RQ.CHECK_FEATURES=['derive','match guard','struct','enum','impl','trait','static','type alias','use','mod','generics','method','nested item','closure','match',
  'method call','field access','slice','reference','dereference','cast','try operator','struct literal','qualified path',
  'fn pointer','impl Trait','inferred type','pattern','deferred initialization','format spec','assignment target','type checking',
  'const initializer','const folding','main signature','path call','function value','block label','call','wrong argument count',
  'range expression','for iterable','let condition','array length','break outside loop','field of a temporary',
  'explicit lifetime','lifetime elision','reference coercion','reference to reference','reborrow',
  'error conversion','string concatenation','polymorphic recursion','bounds','where','into','generic reference','String','Vec','HashMap','Option','Result','Box','str','collection method','iterator','closure kind','closure bound','closure returning a reference','hash key','reference in collection',...MACRO_NAMES.filter(n=>n!=='format').map(n=>n+'!')];
const dict=o=>Object.assign(Object.create(null),o); // tables keyed by learner text must not inherit Object.prototype names
const PRINT=dict({println:false,print:false,eprintln:true,eprint:true}); // value: goes to stderr
const ITEM={Struct:'struct',Enum:'enum',Impl:'impl',Trait:'trait',Static:'static',TypeAlias:'type alias',Use:'use',Mod:'mod'};
const EXPR={Match:'match',Closure:'closure',MethodCall:'method call',Range:'range expression',Ref:'reference',Deref:'dereference',Try:'try operator',
  StructLit:'struct literal',LetCond:'let condition',Await:'async',QPath:'qualified path'};
const TYPE_NODE={Slice:'slice',FnPtr:'fn pointer',ImplTrait:'impl Trait',QPath:'qualified path',Infer:'inferred type'};
const COMPARE=new Set(['==','!=','<','>','<=','>=']);
const ARITH=new Set(['+','-','*','/','%']);
const MAX_ARRAY=10000;
const COLL=dict({Vec:1,HashMap:2});
const STD_TRAITS=['Debug','Clone','Copy','PartialEq','Eq','PartialOrd','Ord','Hash'];

RQ.check=ast=>{
  const {T,unify,isInt,res,show,fits,isCopy,has,hasRef,subst}=RQ.types;
  const errors=[],un=[],seen=new Set(),info=new Map();
  let regions=0;
  const mkRef=(mut,to)=>T.ref(mut,to,++regions);
  const I=n=>{let o=info.get(n);if(!o){o={};info.set(n,o);}return o;};
  const unsup=(f,line)=>{const k=f+'@'+line;if(!seen.has(k)){seen.add(k);un.push({feature:f,line});}return T.any;};
  const syn=(line,col,msg)=>errors.push({line,col,msg});
  const fns=new Map(),consts=new Map(),itemNames=new Set(),structs=new Map(),enums=new Map(),drops=new Map(),methods=new Map();
  let curSelf=null,curSelfTy=null,sigLts=null,selfLt=null;
  const traits=new Map(),traitImpls=new Map(),uses=new Set(),methodNodes=new Map(),froms=new Map(),fromImpls=[],intos=[];
  let tparams=null,selfPar=null,implArgs=null,obligs=[],inBody=false,fnOk=false;
  const ltSeen=new Set();
  // lets that rebind a visible name, those whose value reads the old one, and every read of a local variable
  let shadows=0,shadowUses=0,varUses=0;
  const defined=it=>{
    if(itemNames.has(it.name)){errors.push(RQ.diag.make('E0428',it.line,it.col,{name:it.name}));return false;}
    itemNames.add(it.name);return true;
  };
  const peel=RQ.peel;
  const mism=(want,got,n,what)=>errors.push(RQ.diag.make('E0308',n.line,n.col,{expected:show(want),found:show(got),what:what||(peel(n).t==='Try'?'try':undefined)}));
  const expect=(got,want,n)=>{if(unify(got,want))return true;mism(want,got,n);return false;};
  // where a value goes into a typed place (let annotation, argument, return): &String becomes &str, and no other reference
  // converts. Two plainly different types are E0308 as always; a reference pair rustc might still convert is not guessed.
  const headOf=t=>{t=res(t);return ['int','ivar','float','fvar','bool','char','unit'].includes(t.k)?'scalar':['tuple','array','slice','String'].includes(t.k)?t.k:t.k==='struct'||t.k==='enum'&&!t.builtin||t.k==='param'?t.k+':'+t.name:null;};
  const isRef=t=>{t=res(t);return t.k==='ref'||t.k==='str';};
  function clashes(g,w){
    g=res(g);w=res(w);
    const gr=isRef(g),wr=isRef(w);
    if(!gr&&!wr)return true;
    if(gr&&wr)return g.k==='ref'&&w.k==='ref'&&g.mut===w.mut&&!!headOf(g.to)&&!!headOf(w.to)&&headOf(g.to)!==headOf(w.to);
    return !!headOf(gr?w:g);
  }
  function coerce(got,want,n){
    const o=res(want);
    if(o.k==='opq'){
      const g=res(got);
      if(g.k==='closure'||g.k==='opq'||g.k==='param'){fnMeet(got,{kind:o.kind,params:o.params,ret:o.ret},n);return true;}
    }
    if(unify(got,want))return true;
    const g=res(got),w=res(want);
    if(g.k==='ref'&&!g.mut&&res(g.to).k==='String'&&w.k==='str')return true;
    if(g.k==='str'&&w.k==='ref'&&!w.mut&&res(w.to).k==='String'){mism(want,got,n);return false;}
    if(g.k==='ref'&&w.k==='ref'&&g.mut===w.mut&&res(g.to).k==='array'&&res(w.to).k==='slice'&&unify(res(g.to).el,res(w.to).el))return true;
    if(g.k==='ref'&&w.k==='ref'&&g.mut===w.mut&&res(g.to).k==='coll'&&res(g.to).name==='Vec'&&res(w.to).k==='slice'&&unify(res(g.to).args[0],res(w.to).el))return true;
    // &&T auto-derefs to &T, as when a `filter` closure passes its argument on
    if(g.k==='ref'&&w.k==='ref'&&!g.mut&&!w.mut&&res(g.to).k==='ref'&&!res(g.to).mut)return coerce(res(g.to),want,n);
    // rustc checks `vec![..]` against the annotation element by element and points at the element, which is not modeled
    if(g.k==='coll'&&w.k==='coll'&&g.name===w.name){unsup('type checking',n.line);return false;}
    // a shared reference never coerces to a &mut one; the other way round is a reborrow, which is not modeled
    if(g.k==='ref'&&w.k==='ref'&&!g.mut&&w.mut||clashes(g,w))mism(want,got,n);else unsup('reference coercion',n.line);
    return false;
  }
  const unknown=(name,n)=>{n=RQ.peel(n);errors.push(RQ.diag.make('E0425',n.pline??n.line,n.pcol??n.col,{name}));return T.any;};
  const endNode=n=>n.t==='Block'&&n.tail?endNode(n.tail):n;
  // the number of values a type holds, so nested arrays cannot multiply into a print or a clone that freezes the page.
  // A Vec or HashMap counts as one: its elements are made by steps that are counted, and a recursive type such as `Vec<Node>` would not end
  const weight=t=>{
    t=res(t);
    const sum=fs=>fs.reduce((s,f)=>s+weight(f.ty||f),0);
    return t.k==='coll'?1:t.k==='array'?t.n*weight(t.el):t.k==='tuple'?sum(t.els):t.k==='struct'?sum(fieldsOf(t)):t.k==='enum'?sum(t.builtin?t.args:variantsOf(t).flatMap(v=>v.fields)):1;
  };
  // rustc gives a bare literal under a cast the cast's type, so the checker has to see it too
  const isIntLit=x=>{x=peel(x);return x.t==='Lit'&&x.kind==='int';};
  const bareLit=e=>{
    e=peel(e);let neg=false;
    if(e.t==='Unary'&&e.op==='-'){neg=true;e=peel(e.expr);}
    return e.t==='Lit'&&e.kind==='int'&&!e.suffix?{lit:e,v:neg?-BigInt(e.v):BigInt(e.v)}:null;
  };

  // the type nodes inside a type node; every walker below goes through it so a new type form is handled in one place
  const kids=n=>n.t==='Ref'||n.t==='Array'||n.t==='Slice'?[n.ty]:n.t==='Tuple'?n.tys:n.t==='Path'?n.segs.flatMap(g=>(g.args||[]).filter(a=>a.t!=='Lifetime'&&a.t!=='Binding'&&a.t!=='Lit')):[];
  // a struct written without its lifetime, or with `'_`, is an elided position like a `&` with none
  const ltStruct=n=>n.t==='Path'&&n.segs.length===1&&!n.segs[0].fn&&structs.has(n.segs[0].name)&&structs.get(n.segs[0].name).node.generics.some(g=>g.kind==='lt');
  const lifeArgs=n=>(n.segs[0].args||[]).filter(a=>a.t==='Lifetime');
  const elidedPath=n=>ltStruct(n)&&lifeArgs(n).every(a=>a.name==='_');
  const bareRef=n=>n.t==='Ref'?n.lt===null||bareRef(n.ty):elidedPath(n)||kids(n).some(bareRef);
  const firstBare=n=>n.t==='Ref'?(n.lt===null?n:firstBare(n.ty)):elidedPath(n)?lifeArgs(n)[0]||n:kids(n).map(firstBare).find(Boolean)||null;
  const countRefs=n=>(n.t==='Ref'||ltStruct(n)?1:0)+(n.t==='Ref'?countRefs(n.ty):kids(n).reduce((a,x)=>a+countRefs(x),0));
  const mentionsSelf=n=>n.t==='Path'&&n.segs.length===1&&n.segs[0].name==='Self'||kids(n).some(mentionsSelf);
  // `Self` in an `impl<'a> Name<'a>` carries 'a, so it counts as a mention
  const namesIn=(n,out=new Set())=>{
    if(selfLt&&selfLt!=='_'&&n.t==='Path'&&n.segs.length===1&&n.segs[0].name==='Self'&&!n.segs[0].args)out.add(selfLt);
    if(n.t==='Ref'&&n.lt)out.add(n.lt);
    if(n.t==='Path')for(const g of n.segs)for(const a of g.args||[])if(a.t==='Lifetime'&&a.name!=='_')out.add(a.name);
    kids(n).forEach(k=>namesIn(k,out));
    return out;
  };
  // a named lifetime is modeled only in a signature or a struct field, and must be declared there (E0261)
  function lifetimeOk(node,name){
    if(!sigLts)return false;
    if(!sigLts.has(name)&&!ltSeen.has(node)){ltSeen.add(node);errors.push(RQ.diag.make('E0261',node.line,node.col,{name}));}
    return true;
  }
  const hasMutRef=n=>n.t==='Ref'?n.mut||hasMutRef(n.ty):kids(n).some(hasMutRef);
  const optTy=t=>T.enum('Option',[t],STD_TRAITS,true),resTy=(t,e)=>T.enum('Result',[t,e],STD_TRAITS,true);
  const adtRec=n=>structs.get(n)||enums.get(n);
  const adtTy=(n,args)=>{
    const r=structs.get(n),e=r||enums.get(n),as=args||e.tps||[];
    return r?T.struct(n,r.der,r.node.generics.some(g=>g.kind==='lt'),as):T.enum(n,as,e.der);
  };
  const openTy=(n,line)=>adtTy(n,(adtRec(n).tps||[]).map(()=>fresh(line)));
  const pmap=t=>{const r=adtRec(t.name);return r&&r.tps&&r.tps.length?new Map(r.tps.map((p,i)=>[p,t.args[i]])):null;};
  const inst=(t,ty)=>{const m=pmap(t);return m?subst(ty,m):ty;};
  const fieldsOf=t=>structs.get(t.name).fields.map(f=>({...f,ty:inst(t,f.ty)}));
  // a collection's loans are not tracked, so no element may be, or hold, a reference or a &str
  const holdsRef=t=>{
    t=res(t);
    return t.k==='ref'||t.k==='str'||t.k==='closure'||t.k==='opq'||t.k==='iter'||t.k==='struct'&&t.lt||t.k==='tuple'&&t.els.some(holdsRef)||(t.k==='array'||t.k==='slice')&&holdsRef(t.el)||(t.k==='enum'||t.k==='coll'||t.k==='struct')&&t.args.some(holdsRef);
  };
  // a type that is still open, so a trait cannot be judged yet; fl also counts a float literal, which is not Eq or Hash once it settles
  const isOpen=(t,fl)=>{
    t=res(t);
    const o=x=>isOpen(x,fl);
    return t.k==='tvar'||fl&&t.k==='fvar'||t.k==='tuple'&&t.els.some(o)||(t.k==='array'||t.k==='slice')&&o(t.el)||t.k==='ref'&&o(t.to)||(t.k==='enum'||t.k==='coll'||t.k==='struct')&&t.args.some(o);
  };
  const implsTrait=(t,tr)=>(traitImpls.get(tr)||new Set()).has(t.name);
  const displays=t=>{
    t=res(t);
    switch(t.k){
      case 'int':case 'float':case 'bool':case 'char':case 'str':case 'String':case 'any':case 'never':case 'ivar':case 'fvar':return true;
      case 'ref':return displays(t.to);
      case 'param':return t.bounds.has('Display');
      case 'struct':return implsTrait(t,'Display');
      case 'enum':return !t.builtin&&implsTrait(t,'Display');
      default:return false;
    }
  };
  const meets=(t,tr)=>{
    t=res(t);
    if(t.k==='any'||t.k==='never')return true;
    if(tr==='Display')return displays(t);
    if(traits.has(tr)&&!traits.get(tr).builtin)return t.k==='param'?t.bounds.has(tr):(t.k==='struct'||t.k==='enum'&&!t.builtin)&&implsTrait(t,tr);
    return has(t,tr);
  };
  // `top` is set only for a fn's whole return type (and a const's type): that is the one place `&'static str` is checked against its leaves
  const fmtErr=T.enum('Error',[],STD_TRAITS,true),ordTy=T.enum('Ordering',[],STD_TRAITS,true);
  const fmtResult=()=>resTy(T.unit,fmtErr);
  function fmtType(n){
    const names=n.segs.map(g=>g.name),last=names[names.length-1],sg=n.segs[n.segs.length-1];
    const pre=names.slice(0,-1).join('::');
    const via=pre==='std::fmt'||pre==='fmt'&&uses.has('fmt')||pre===''&&last==='Formatter'&&uses.has('Formatter')&&!adtRec(last);
    if(!via||n.global)return null;
    if(last==='Formatter'&&(!sg.args||sg.args.length===1&&sg.args[0].t==='Lifetime'&&sg.args[0].name==='_'))return T.fmtr;
    if(last==='Result'&&pre!==''&&!sg.args)return fmtResult();
    if(last==='Error'&&pre!==''&&!sg.args)return fmtErr;
    return null;
  }
  function tyOf(n,top){
    if(n.t==='Path'&&!n.segs.some(g=>g.fn)){const ft=fmtType(n);if(ft)return ft;}
    if(n.t==='Path'&&n.segs.length===1&&!n.global&&!n.segs[0].fn){
      const sg=n.segs[0],s=sg.name;
      if(sg.args){
        if(sg.args.length&&sg.args.every(a=>a.t==='Lifetime')){
          if(!ltStruct(n)||sg.args.length!==1)return unsup(adtRec(s)?'generics':s,n.line);
          const a=sg.args[0];
          if(a.name==='static'||a.name!=='_'&&!lifetimeOk(a,a.name))return unsup('explicit lifetime',n.line);
          return adtTy(s);
        }
        if(adtRec(s)&&adtRec(s).tps.length&&!sg.args.some(a=>a.t==='Lifetime')){
          const want=adtRec(s).tps.length;
          if(sg.args.length!==want||kids(n).length!==want){errors.push(RQ.diag.make('E0107',n.line,n.col,{kind:structs.has(s)?'struct':'enum',name:s,want,got:sg.args.length}));return T.any;}
          return adtTy(s,sg.args.map(a=>tyOf(a)));
        }
        if(COLL[s]&&!adtRec(s)){
          if(s==='HashMap'&&!mapUse||sg.args.length!==COLL[s]||kids(n).length!==sg.args.length)return unsup(s,n.line);
          const as=sg.args.map(a=>tyOf(a));
          return as.some(holdsRef)?unsup('reference in collection',n.line):T.coll(s,as);
        }
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
      if(tparams&&tparams.has(s))return tparams.get(s);
      if(s==='Self'&&selfPar)return selfPar;
      if(s==='Self'&&curSelf)return curSelfTy||adtTy(curSelf);
      if(adtRec(s)&&adtRec(s).tps.length){
        errors.push(RQ.diag.make('E0107',n.line,n.col,{missing:true,kind:structs.has(s)?'struct':'enum',name:s}));
        return T.any;
      }
      if(adtRec(s))return adtTy(s);
      return unsup(s==='Self'?'impl':s,n.line);
    }
    if(n.t==='Infer')return inBody?fresh(n.line):unsup('inferred type',n.line);
    if(n.t==='ImplTrait'){
      const fb=n.bounds.length===1&&n.bounds[0].segs&&n.bounds[0].segs.length===1&&n.bounds[0].segs[0].fn&&['Fn','FnMut','FnOnce'].includes(n.bounds[0].segs[0].name)?n.bounds[0].segs[0]:null;
      if(!implArgs&&top&&fb){
        const f=fb.fn,ret=f.ret?tyOf(f.ret):T.unit;
        return holdsRef(ret)?unsup('closure returning a reference',n.line):T.opq(fb.name,f.inputs.map(x=>tyOf(x)),ret);
      }
      if(!implArgs)return unsup('impl Trait',n.line);
      const p=T.param('impl '+n.bounds.map(b=>b.segs?b.segs.map(g=>g.name).join('::'):'').join(' + '),new Set());
      p.declared=[];implArgs.push({p,bounds:n.bounds});
      return p;
    }
    if(n.t==='Ref'){
      const to=n.ty,isStr=to.t==='Path'&&to.segs.length===1&&!to.segs[0].args&&to.segs[0].name==='str';
      if(to.t==='Ref')return unsup('reference to reference',n.line);
      if(n.lt==='static'){if(!(top&&isStr&&!n.mut))return unsup('explicit lifetime',n.line);}
      else if(n.lt&&(n.mut||!lifetimeOk(n,n.lt)))return unsup('explicit lifetime',n.line);
      if(isStr)return n.mut?unsup('reference',n.line):T.str;
      if(to.t==='Slice')return mkRef(n.mut,T.slice(tyOf(to.ty)));
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

  const DERIVES=[...STD_TRAITS,'Default'];
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
    else (it.t==='Struct'?structs:enums).set(it.name,{node:it,kind:'named',fields:[],variants:[],der:derivesOf(it)||[],impls:new Set(),tps:[]});
  }
  for(const it of ast.items)if(it.t==='Trait'){
    if(structs.has(it.name)||enums.has(it.name)||traits.has(it.name))errors.push(RQ.diag.make('E0428',it.line,it.col,{name:it.name}));
    else traits.set(it.name,{node:it,name:it.name,methods:new Map()});
  }
  const BUILTIN=new Set(['String','bool','char','f64','str','Vec','Option','Result','Box','HashMap','Self']);
  const refNode=n=>n.t==='Ref'||kids(n).some(refNode);
  const fieldList=(kind,fs)=>kind==='tuple'?fs.map((t,i)=>({name:String(i),ty:t})):fs;
  // a struct field may hold a shared reference (a lifetime is then needed); any other field with a reference in it is not modeled
  const refField=t=>t.t==='Ref'&&!t.mut&&t.ty.t!=='Ref';
  function fieldsOk(kind,fs,refs){
    const names=new Set();
    for(const f of fieldList(kind,fs)){
      if(names.has(f.name)||refNode(f.ty)&&!(refs&&refField(f.ty)))return false;
      names.add(f.name);
    }
    return true;
  }
  const ltParams=g=>g.length===1&&g[0].kind==='lt'&&!g[0].bounds.length;
  function structDecl(it){
    const rec=structs.get(it.name);
    if(rec.node!==it)return;
    if(derivesOf(it)===null){unsup('derive',it.line);return;}
    const tys=it.generics.length>0&&it.generics.every(g=>g.kind==='ty'&&!g.bounds.length&&!g.default);
    if(it.generics.length&&!ltParams(it.generics)&&!tys||BUILTIN.has(it.name)||isInt(it.name)||!fieldsOk(it.kind,it.fields,!tys)){unsup('struct',it.line);return;}
    rec.kind=it.kind;
    if(tys){tparams=typeParams(it.generics,[],it.line);rec.tps=[...tparams.values()];}
    sigLts=new Set(it.generics.map(g=>g.name));
    const fl=fieldList(it.kind,it.fields);
    let bare=false;
    rec.fields=fl.map(f=>{
      const at=firstBare(f.ty);
      if(at){bare=true;errors.push(RQ.diag.make('E0106',at.line,at.col,{field:true}));}
      return {name:f.name,ty:tyOf(f.ty)};
    });
    // rustc reports the missing lifetime only
    if(!bare)for(const g of it.generics)if(g.kind==='lt'&&!fl.some(f=>namesIn(f.ty).has(g.name)))errors.push(RQ.diag.make('E0392',g.line,g.col,{name:g.name}));
    unusedParams(rec,it,rec.fields);
    sigLts=null;tparams=null;
  }
  const unusedParams=(rec,it,fields)=>{
    for(const p of rec.tps||[])if(!fields.some(f=>mentionsParam(f.ty,p)))errors.push(RQ.diag.make('E0392',p.line,p.col,{name:p.name,ty:true}));
  };
  function enumDecl(it){
    const rec=enums.get(it.name);
    if(rec.node!==it)return;
    if(derivesOf(it)===null){unsup('derive',it.line);return;}
    for(const v of it.variants)noVis(v);
    const vn=new Set(it.variants.map(v=>v.name));
    const tys=it.generics.length>0&&it.generics.every(g=>g.kind==='ty'&&!g.bounds.length&&!g.default);
    if(it.generics.length&&!tys||BUILTIN.has(it.name)||isInt(it.name)||!it.variants.length||vn.size!==it.variants.length||it.variants.some(v=>v.disc||!fieldsOk(v.kind,v.fields))){unsup('enum',it.line);return;}
    if(tys){tparams=typeParams(it.generics,[],it.line);rec.tps=[...tparams.values()];}
    rec.variants=it.variants.map(v=>({name:v.name,kind:v.kind,fields:fieldList(v.kind,v.fields).map(f=>({name:f.name,ty:tyOf(f.ty)}))}));
    unusedParams(rec,it,rec.variants.flatMap(v=>v.fields));
    tparams=null;
    const dv=it.variants.flatMap((v,i)=>v.attrs.includes('default')?[i]:[]);
    rec.defaultVi=dv.length===1&&it.variants[dv[0]].kind==='unit'?dv[0]:-1;
  }
  const one=n=>n&&n.t==='Path'&&n.segs.length===1&&!n.segs[0].args&&!n.segs[0].fn;
  // Debug and Display need a `use`, so without one they are E0405 like any unknown name; the other prelude traits are not modeled as bounds
  const PRELUDE_TRAITS=new Set(['Clone','Copy','PartialEq','Eq','PartialOrd','Ord','Default']);
  const OTHER_PRELUDE=new Set(['Send','Sync','Sized','Drop','Fn','FnMut','FnOnce','AsRef','AsMut','Into','From','Iterator','Extend','IntoIterator','DoubleEndedIterator','ExactSizeIterator','ToOwned','ToString','TryFrom','TryInto','FromIterator']);
  const IMPLIED=dict({Copy:['Clone'],Eq:['PartialEq'],PartialOrd:['PartialEq'],Ord:['Eq','PartialOrd','PartialEq']});
  // '' is a fn, const or static, which rustc also reports as E0404; undefined is a name that does not exist (E0405)
  function nonTrait(name,ps){
    if(ps&&ps.has(name))return 'type parameter';
    if(traits.has(name))return;
    if(structs.has(name))return 'struct';
    if(enums.has(name))return 'enum';
    if(['String','Vec','Box'].includes(name)||name==='HashMap'&&mapUse)return 'struct';
    if(name==='Option'||name==='Result')return 'enum';
    if(isInt(name)||['bool','char','f64','str'].includes(name))return 'builtin type';
    const it=ast.items.find(x=>x.name===name&&['TypeAlias','Mod','Fn','Const','Static'].includes(x.t));
    return it?{TypeAlias:'type alias',Mod:'module'}[it.t]||'':undefined;
  }
  function notTrait(name,line,col,ps){
    if(name==='Self'){unsup('bounds',line);return true;}
    const kind=nonTrait(name,ps);
    if(kind===undefined)return false;
    errors.push(RQ.diag.make('E0404',line,col,{name,kind}));return true;
  }
  function boundName(b,ps){
    if(b.t==='Lifetime'){unsup('lifetime bound',b.line);return null;}
    if(b.segs.some(g=>g.args||g.fn)){unsup('bounds',b.line);return null;}
    const names=b.segs.map(g=>g.name),last=names[names.length-1],pre=names.slice(0,-1).join('::');
    if(names.length===1){
      if(traits.has(last)&&!traits.get(last).builtin||PRELUDE_TRAITS.has(last)||(last==='Debug'||last==='Display')&&uses.has(last))return last;
      if(OTHER_PRELUDE.has(last)||last==='Hash'&&uses.has('Hash')){unsup('bounds',b.line);return null;}
      if(notTrait(last,b.line,b.col,ps))return null;
      errors.push(RQ.diag.make('E0405',b.line,b.col,{name:last}));return null;
    }
    if((pre==='std::fmt'||pre==='fmt'&&uses.has('fmt'))&&(last==='Display'||last==='Debug')||pre==='std::cmp'&&['PartialEq','Eq','PartialOrd','Ord'].includes(last)||pre==='std::clone'&&last==='Clone'||pre==='std::marker'&&last==='Copy'||pre==='std::default'&&last==='Default')return last;
    unsup('bounds',b.line);return null;
  }
  // a bound that could not be resolved is already reported, so the parameter then accepts anything and adds no second error
  function boundOf(p,b,ps){
    const fb=b.t==='Path'&&b.segs.length===1&&b.segs[0].fn&&!b.global&&['Fn','FnMut','FnOnce'].includes(b.segs[0].name)?b.segs[0]:null;
    if(fb){
      if(fnOk&&!p.fnb)p.fnb={kind:fb.name,node:fb.fn,params:null,ret:null};
      else{unsup('bounds',b.line);p.lenient=true;p.bounds={has:()=>true,add(){}};}
      return;
    }
    const n=boundName(b,ps);
    if(n)addBound(p,n);
    else{p.lenient=true;p.bounds={has:()=>true,add(){}};}
  }
  function addBound(p,name){
    if(p.declared.includes(name))return;
    p.declared.push(name);p.bounds.add(name);
    for(const x of IMPLIED[name]||[])p.bounds.add(x);
  }
  const resolveFnb=p=>{
    const f=p.fnb;
    if(!f||f.params)return;
    f.params=f.node.inputs.map(x=>tyOf(x));
    f.ret=f.node.ret?tyOf(f.node.ret):T.unit;
    if(holdsRef(f.ret)){unsup('closure returning a reference',f.node.ret.line);f.ret=T.any;}
  };
  function typeParams(gs,wh,line){
    const map=new Map();
    for(const g of gs){
      if(g.kind==='lt')continue;
      if(g.kind!=='ty'||g.default||map.has(g.name)||BUILTIN.has(g.name)||adtRec(g.name)||traits.has(g.name)){unsup('generics',g.line||line);continue;}
      const p=T.param(g.name,new Set());p.declared=[];p.line=g.line;p.col=g.col;map.set(g.name,p);
    }
    const scope=new Set([...(tparams?tparams.keys():[]),...map.keys()]);
    for(const g of gs)if(g.kind==='ty'&&map.has(g.name))for(const b of g.bounds)boundOf(map.get(g.name),b,scope);
    for(const w of wh||[]){
      const t=w.ty;
      if(w.lt||!t||t.t!=='Path'||t.segs.length!==1||t.segs[0].args||!map.has(t.segs[0].name)){unsup('where',line);continue;}
      for(const b of w.bounds)boundOf(map.get(t.segs[0].name),b,scope);
    }
    return map;
  }
  const mentionsParam=(t,p)=>{
    t=res(t);
    return t===p||t.k==='ref'&&mentionsParam(t.to,p)||(t.k==='array'||t.k==='slice')&&mentionsParam(t.el,p)||t.k==='tuple'&&t.els.some(x=>mentionsParam(x,p))||(t.k==='enum'||t.k==='coll'||t.k==='struct')&&t.args.some(x=>mentionsParam(x,p));
  };
  function instantiate(f,line,argNodes,callee){
    const inst=new Map(f.tps.map(p=>[p,fresh(line)]));
    const params=f.params.map(q=>subst(q.ty,inst)),ret=subst(f.ret,inst);
    const meet=()=>{
      if(f===curFn)for(const p of f.tps){const t=res(inst.get(p));if(t.k!=='param'&&f.tps.some(q=>mentionsParam(t,q)))unsup('polymorphic recursion',line);}
      f.tps.forEach(p=>{
        const k=f.params.findIndex(q=>mentionsParam(q.ty,p)),at=k>=0&&argNodes[k]||callee;
        for(const tr of p.declared)obligs.push({ty:inst.get(p),tr,line:at.line,col:at.col});
        if(mentionsParam(f.ret,p)||f.params.some(q=>res(q.ty).k==='ref'&&res(q.ty).mut&&mentionsParam(q.ty,p)))obligs.push({ty:inst.get(p),ret:true,line});
      });
    };
    const fnw=f.params.map(q=>{
      const t=res(q.ty);
      return t.k==='param'&&t.fnb&&t.fnb.params?{kind:t.fnb.kind,params:t.fnb.params.map(x=>subst(x,inst)),ret:subst(t.fnb.ret,inst)}:null;
    });
    return {inst,params,ret,meet,fnw};
  }
  // from is the index, among the call's arguments (the receiver first), of the one the result borrows
  function fnSig(it,owner,implLts,selfT){
    const sp=it.selfParam,own=it.generics.filter(g=>g.kind==='lt'&&!g.bounds.length);
    if(own.some(g=>g.kind==='lt'&&g.bounds.length)||new Set(own.map(g=>g.name)).size!==own.length||own.some(g=>implLts&&implLts.has(g.name))||it.generics.some(g=>g.kind==='const'))unsup('generics',it.line);
    const outer=tparams;
    fnOk=true;
    const tmap=typeParams(it.generics,it.where,it.line);
    tparams=new Map([...(outer||[]),...tmap]);
    const anon=implArgs=[];
    sigLts=new Set([...(implLts||[]),...own.map(g=>g.name)]);
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
    implArgs=null;
    for(const a of anon)for(const b of a.bounds)boundOf(a.p,b);
    fnOk=false;
    for(const p of [...tmap.values(),...anon.map(a=>a.p)])resolveFnb(p);
    const ret=it.ret?tyOf(it.ret,true):T.unit;
    const sh=sp?1:0;
    let from=-1,more=[],reg=null;
    const argTys=[...(sp?[null]:[]),...it.params.map(p=>p.ty)],named=it.ret?[...namesIn(it.ret)].filter(x=>x!=='static'):[];
    // the `'_` of `impl Name<'_>` is a lifetime of its own, which `Self` would carry
    if(selfLt==='_'&&[...argTys,it.ret].some(t=>t&&mentionsSelf(t)))unsup('explicit lifetime',it.line);
    // the body may return only data from the parameters that mention the result's lifetime
    if(named.length){
      const a=named[0];
      if(named.length>1||bareRef(it.ret)||hasMutRef(it.ret)||sp&&implLts&&implLts.has(a))unsup('explicit lifetime',it.ret.line);
      else{
        const ties=argTys.flatMap((t,k)=>t&&namesIn(t).has(a)?[k]:[]);
        [from=-1,...more]=ties;
        reg={ret:a,allowed:ties};
      }
    }
    else if(it.ret&&bareRef(it.ret)){
      // a &self or &mut self result borrows from self; otherwise one lifetime position among the parameters is the one the result borrows, and none or several is E0106
      const refs=it.params.map(p=>countRefs(p.ty)),total=refs.reduce((a,x)=>a+x,0);
      const sharedOnly=!hasMutRef(it.ret)&&(it.ret.t==='Ref'||it.ret.t==='Path'&&kids(it.ret).every(k=>k.t==='Ref'&&k.lt===null));
      if(sp&&sp.ref){if(sharedOnly)from=0;else unsup('lifetime elision',it.ret.line);}
      else if(total!==1){const at=firstBare(it.ret);errors.push(RQ.diag.make('E0106',at.line,at.col,{}));}
      else{
        const q=it.params[refs.indexOf(1)];
        if(sharedOnly&&q.ty.t==='Ref'&&!q.ty.mut&&q.ty.lt===null)from=refs.indexOf(1)+sh;else unsup('lifetime elision',it.ret.line);
      }
      if(from>=0)reg={ret:null,allowed:[from]};
    }
    if(reg){
      reg.plain=argTys.map(t=>!!t&&t.t==='Ref'&&t.lt===null&&!namesIn(t).size);
      reg.names=[...(sp?['self']:[]),...params.map(p=>p.name)];
    }
    sigLts=null;
    tparams=outer;
    const base=selfT||(owner?adtTy(owner):null);
    const selfTy=sp&&base?(sp.ref?mkRef(sp.mut,base):base):null;
    return {params,ret,from,more,reg,selfKind:sp?(sp.ref?(sp.mut?'&mut':'&'):'val'):null,selfTy,selfMut:!!sp&&!sp.ref&&sp.mut,tps:[...tmap.values(),...anon.map(a=>a.p)],tmap:new Map([...(outer||[]),...tmap,...anon.map(a=>[a.p.name,a.p])])};
  }
  function implDecl(it){
    const st=it.selfTy,seg=st.t==='Path'&&st.segs.length===1&&!st.global&&!st.segs[0].fn?st.segs[0]:null;
    const lt=!!seg&&ltStruct(st),gs=it.generics;
    const rec=seg&&adtRec(seg.name),gen=!!rec&&rec.tps.length>0&&!lt;
    const tyGs=gs.length>0&&gs.every(g=>g.kind==='ty');
    const name=seg&&(!seg.args||lt&&seg.args.length===1&&seg.args[0].t==='Lifetime'||gen&&seg.args.every(a=>a.t!=='Lifetime'))?seg.name:'';
    const ok=!it.trait&&(!gs.length||lt&&ltParams(gs)||tyGs&&gen)&&!it.attrs.length&&!!adtRec(name)&&it.items.every(x=>x.t==='Fn'&&!x.attrs.length);
    if(!ok){unsup('impl',it.line);return;}
    const implLts=new Set(gs.map(g=>g.name));
    const implMap=tyGs?typeParams(gs,it.where,it.line):null;
    tparams=implMap;
    const pattern=gen?tyOf(st):null;
    if(implMap&&[...implMap.values()].some(p=>!mentionsParam(pattern,p))){unsup('impl',it.line);tparams=null;return;}
    if(it.where.length&&!implMap){unsup('impl',it.line);return;}
    if(lt&&!seg.args)errors.push(RQ.diag.make('E0726',st.line,st.col,{name}));
    else if(lt){sigLts=implLts;const a=seg.args[0];if(a.name==='static')unsup('explicit lifetime',a.line);else if(a.name!=='_')lifetimeOk(a,a.name);sigLts=null;}
    selfLt=lt&&seg.args?seg.args[0].name:null;
    curSelf=name;curSelfTy=pattern;
    const mm=methods.get(name)||new Map();
    methods.set(name,mm);
    for(const f of it.items){
      if(mm.has(f.name)){unsup('impl',f.line);continue;}
      if(!f.body)syn(f.line,f.col,'associated function in `impl` without body');
      mm.set(f.name,{node:f,owner:name,key:name+'::'+f.name,...fnSig(f,name,implLts,pattern),itps:implMap?[...implMap.values()]:[],pattern});
    }
    curSelf=null;curSelfTy=null;tparams=null;
    selfLt=null;
  }

  function traitSigs(it){
    const rec=traits.get(it.name);
    if(!rec||rec.node!==it)return;
    if(it.generics.length||it.supers.length||it.where.length||it.attrs.length||it.items.some(x=>x.t!=='Fn')){unsup('trait',it.line);rec.bad=true;return;}
    const self=selfPar=T.param('Self',new Set([it.name]));
    self.declared=[it.name];
    for(const f of it.items){
      noVis(f);
      if(rec.methods.has(f.name)||f.attrs.length){unsup('trait',f.line);rec.bad=true;continue;}
      rec.methods.set(f.name,{node:f,name:f.name,owner:null,key:'dyn:'+it.name+'::'+f.name,trait:it.name,hasBody:!!f.body,selfPar:self,...fnSig(f,null,null,self)});
    }
    selfPar=null;
  }
  function implTrait(tp){
    if(tp.t!=='Path'){unsup('impl',tp.line);return null;}
    const names=tp.segs.map(g=>g.name),last=names[names.length-1],pre=names.slice(0,-1).join('::');
    if(tp.segs.some(g=>g.args||g.fn)){unsup('impl',tp.line);return null;}
    if(names.length===1&&traits.has(last))return traits.get(last);
    if(names.length===1&&last==='Drop')return STD_IMPL.Drop;
    if(last==='Display'&&(pre==='std::fmt'||pre==='fmt'&&uses.has('fmt')||pre===''&&uses.has('Display')))return STD_IMPL.Display;
    if(names.length===1&&PRELUDE_TRAITS.has(last)||OTHER_PRELUDE.has(last)||last==='Debug'&&(pre!==''||uses.has('Debug'))||last==='Hash'&&pre===''&&uses.has('Hash')||pre!==''){unsup('impl',tp.line);return null;}
    if(notTrait(last,tp.line,tp.col))return null;
    errors.push(RQ.diag.make('E0405',tp.line,tp.col,{name:last}));return null;
  }
  const STD_IMPL={Drop:{name:'Drop',builtin:true,methods:new Map([['drop',{name:'drop',hasBody:false}]])},Display:{name:'Display',builtin:true,methods:new Map([['fmt',{name:'fmt',hasBody:false}]])}};
  const sameSig=(m,tm,owner)=>{
    const self=adtTy(owner),map=new Map([[tm.selfPar,self]]);
    return tm.params.every((q,i)=>unify(subst(q.ty,map),m.params[i].ty))&&unify(subst(tm.ret,map),m.ret);
  };
  function fromImpl(it,argNode){
    const owner=one(it.selfTy)?it.selfTy.segs[0].name:'',rec=adtRec(owner);
    if(!rec||it.generics.length||it.where.length||it.attrs.length||rec.node.generics.length){unsup('impl',it.line);return;}
    curSelf=owner;
    const from=tyOf(argNode),list=froms.get(owner)||[],name='From<'+show(from)+'>';
    froms.set(owner,list);
    if(show(from)===owner||list.some(x=>show(x.from)===show(from))){errors.push(RQ.diag.make('E0119',it.line,it.col,{trait:name,type:owner}));curSelf=null;return;}
    let m=null;
    for(const f of it.items){
      if(f.t!=='Fn'||f.attrs.length){unsup('impl',f.line);continue;}
      noVis(f);
      if(f.name!=='from'){errors.push(RQ.diag.make('E0407',f.line,f.col,{name:f.name,trait:'From'}));continue;}
      if(m){unsup('impl',f.line);continue;}
      const sig=fnSig(f,owner);
      if(!f.body)syn(f.line,f.col,'associated function in `impl` without body');
      if(f.selfParam||f.generics.length||sig.params.length!==1){unsup('impl',f.line);continue;}
      m={node:f,owner,key:owner+'::from#'+list.length,...sig};
      if(!unify(sig.params[0].ty,from))errors.push(RQ.diag.make('E0053',f.params[0].ty.line,f.params[0].ty.col,{name:'from'}));
      else if(!unify(sig.ret,adtTy(owner)))errors.push(RQ.diag.make('E0053',f.ret?f.ret.line:f.line,f.ret?f.ret.col:f.col,{name:'from'}));
    }
    curSelf=null;
    if(!m){if(!it.items.length)errors.push(RQ.diag.make('E0046',it.line,it.col,{missing:['from']}));return;}
    list.push({from,key:m.key});methodNodes.set(m.key,m.node);fromImpls.push(m);
  }
  const noVis=n=>{if(n.pub)errors.push(RQ.diag.make('E0449',n.pub.line,n.pub.col,{}));};
  function traitImpl(it){
    const tp=it.trait,st=it.selfTy;
    const fa=tp.t==='Path'&&tp.segs.length===1&&tp.segs[0].name==='From'&&!traits.has('From')&&tp.segs[0].args&&tp.segs[0].args.length===1&&tp.segs[0].args[0].t!=='Lifetime'?tp.segs[0].args[0]:null;
    if(fa){fromImpl(it,fa);return;}
    const owner=one(st)?st.segs[0].name:'';
    const tr=implTrait(tp);
    if(!tr)return;
    const rec=adtRec(owner);
    if(!rec||it.generics.length||it.where.length||it.attrs.length||tr.bad||rec.node.generics.length||tr.name==='Drop'&&!structs.has(owner)){unsup('impl',it.line);return;}
    const set=traitImpls.get(tr.name)||new Set();
    traitImpls.set(tr.name,set);
    if(set.has(owner)){errors.push(RQ.diag.make('E0119',it.line,it.col,{trait:tr.name,type:owner}));return;}
    set.add(owner);adtRec(owner).impls.add(tr.name);
    if(tr.name==='Drop'&&rec.der.includes('Copy'))errors.push(RQ.diag.make('E0184',rec.node.line,rec.node.col,{}));
    curSelf=owner;
    const mm=methods.get(owner)||new Map();
    methods.set(owner,mm);
    const given=new Set();
    for(const f of it.items){
      if(f.t!=='Fn'||f.attrs.length){unsup('impl',f.line);continue;}
      noVis(f);
      const tm=tr.methods.get(f.name);
      if(!tm){errors.push(RQ.diag.make('E0407',f.line,f.col,{name:f.name,trait:tr.name}));continue;}
      if(mm.has(f.name)||given.has(f.name)){unsup('impl',f.line);continue;}
      given.add(f.name);
      const m={node:f,owner,key:owner+'::'+f.name,...fnSig(f,owner)};
      if(!f.body)syn(f.line,f.col,'associated function in `impl` without body');
      if(tr.name==='Drop'){
        if(f.params.length||f.ret||f.generics.length||!f.selfParam||!f.selfParam.ref||!f.selfParam.mut||f.selfParam.lt||f.selfParam.ty)unsup('impl',f.line);
      }else if(tr.name==='Display'){
        if(f.params.length!==1||f.generics.length||!f.ret||!f.selfParam||!f.selfParam.ref||f.selfParam.mut||f.selfParam.lt||f.selfParam.ty)unsup('impl',f.line);
        else if(!unify(m.params[0].ty,mkRef(true,T.fmtr)))errors.push(RQ.diag.make('E0053',f.params[0].ty.line,f.params[0].ty.col,{name:f.name}));
        else if(!unify(m.ret,fmtResult()))errors.push(RQ.diag.make('E0053',f.ret.line,f.ret.col,{name:f.name}));
      }else if(!!tm.node.selfParam!==!!f.selfParam||(f.selfParam&&tm.selfKind!==m.selfKind))unsup('impl',f.line);
      else if(tm.params.length!==m.params.length)errors.push(RQ.diag.make('E0050',f.line,f.col,{name:f.name,trait:tr.name,got:m.params.length+(f.selfParam?1:0),want:tm.params.length+(tm.node.selfParam?1:0)}));
      else if(tm.tps.length||m.tps.length)unsup('impl',f.line);
      else if(!sameSig(m,tm,owner)){
        const bad=tm.params.findIndex((q,i)=>!unify(subst(q.ty,new Map([[tm.selfPar,adtTy(owner)]])),m.params[i].ty));
        const at=bad>=0?f.params[bad].ty:f.ret||f;
        errors.push(RQ.diag.make('E0053',at.line,at.col,{name:f.name}));
      }
      mm.set(f.name,m);methodNodes.set(m.key,f);
      if(tr.name==='Drop')drops.set(owner,it);
    }
    const missing=[...tr.methods.values()].filter(m=>!m.hasBody&&!given.has(m.name)).map(m=>m.name);
    if(missing.length)errors.push(RQ.diag.make('E0046',it.line,it.col,{missing}));
    for(const tm of tr.methods.values()){
      if(given.has(tm.name))continue;
      if(!tm.hasBody&&tr.builtin)continue;
      if(mm.has(tm.name)){unsup('impl',it.line);continue;}
      const m={node:tm.node,owner,key:owner+'::'+tm.name,...fnSig(tm.node,owner),dflt:true};
      mm.set(tm.name,m);methodNodes.set(m.key,tm.node);
    }
    curSelf=null;
  }

  const useMap=it=>it.t==='Use'&&!it.pub&&it.txt==='std :: collections :: HashMap';
  const USE_NAMES=dict({'std :: fmt':'fmt','std :: fmt :: Display':'Display','std :: fmt :: Debug':'Debug','std :: fmt :: Formatter':'Formatter'});
  const mapUse=ast.items.filter(useMap).length===1;
  for(const it of ast.items){
    if(it.t==='Struct')structDecl(it);
    else if(it.t==='Enum')enumDecl(it);
    else if(it.t==='Fn'){
      const sg=fnSig(it,null);
      if(it.selfParam)unsup('method',it.line);
      if(it.name==='main'&&sg.params.length)unsup('main signature',it.line);
      if(!it.body)syn(it.line,it.col,'free function without a body');
      if(defined(it))fns.set(it.name,{node:it,params:sg.params,ret:sg.ret,from:sg.from,more:sg.more,reg:sg.reg,tps:sg.tps,tmap:sg.tmap});
    }else if(it.t==='Const'){
      const ty=tyOf(it.ty,true);
      if(defined(it))consts.set(it.name,{node:it,ty});
    }else if(mapUse&&useMap(it)){}
    else if(it.t==='Use'&&!it.pub&&USE_NAMES[it.txt]&&!uses.has(USE_NAMES[it.txt]))uses.add(USE_NAMES[it.txt]);
    else if(it.t!=='Impl'&&it.t!=='Trait'&&(ITEM[it.t]||!['Extern','MacroRules','Union'].includes(it.t)))unsup(ITEM[it.t]||it.t,it.line);
  }
  for(const it of ast.items)if(it.t==='Trait')traitSigs(it);
  for(const it of ast.items)if(it.t==='Impl'&&!it.trait)implDecl(it);
  for(const it of ast.items)if(it.t==='Impl')noVis(it);
  for(const it of ast.items)if(it.t==='Impl'&&it.trait)traitImpl(it);
  // a tuple or unit struct is also a value, so it cannot share a name with a fn or a const
  for(const [name,rec] of structs)if(rec.kind!=='named'&&(fns.has(name)||consts.has(name)))unsup('struct',rec.node.line);
  // a type that holds itself, directly or through a tuple, an array, a variant or an Option, has infinite size (E0072), which is not modeled
  const heldBy=t=>{
    t=res(t);
    if(t.k==='struct')return fieldsOf(t).map(f=>f.ty);
    if(t.k==='enum')return t.builtin?t.args:variantsOf(t).flatMap(v=>v.fields.map(f=>f.ty));
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
  // an enum derives Default from its one `#[default]` unit variant, so its fields are not asked for Default
  const NEEDS=dict({Copy:['Clone'],Eq:['PartialEq'],PartialOrd:['PartialEq'],Ord:['PartialOrd','Eq']});
  const badDerive=(rec,all)=>{
    const en=rec.node.t==='Enum';
    return rec.der.some(tr=>(tr!=='Default'||!en)&&all.some(f=>!has(f.ty,tr))||(NEEDS[tr]||[]).some(r=>!rec.der.includes(r)))
      ||en&&(rec.der.includes('Default')?rec.defaultVi<0:rec.node.variants.some(v=>v.attrs.includes('default')));
  };
  for(const [name,rec] of [...structs,...enums]){
    const loose=new Map(rec.tps.map(p=>[p,T.any])),all=rec.fields.concat(...rec.variants.map(v=>v.fields)).map(f=>({...f,ty:subst(f.ty,loose)}));
    if(all.some(f=>holds(f.ty,new Set([name])))){rec.fields=[];rec.variants=[];unsup(rec.node.t==='Struct'?'struct':'enum',rec.node.line);}
    else if(weight(adtTy(name))>MAX_ARRAY)unsup('array length',rec.node.line);
    // a derive needs every field to have the trait, and Copy and Eq need Clone and PartialEq beside them
    else if(badDerive(rec,all))unsup('derive',rec.node.line);
  }
  if(!fns.has('main')&&!un.length)syn(1,1,'`main` function not found in the file');

  let scopes=[],curRet=T.unit,curStatic=false,loops=[],vars=[],negs=[],okNeg=new Set(),freeNeg=new Set(),lits=[],fmts=[],tvs=[],keyChecks=[],patLits=[],exChecks=[];
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
    const b={mut,kind,ty,assigns:0,cl:curCl};
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
  const mentionsAdt=t=>{t=res(t);return t.k==='param'||t.k==='struct'||t.k==='enum'||t.k==='coll'||t.k==='ref'&&mentionsAdt(t.to)||t.k==='tuple'&&t.els.some(mentionsAdt)||(t.k==='array'||t.k==='slice')&&mentionsAdt(t.el);};
  const printable=(t,dbg)=>{
    t=res(t);
    switch(t.k){
      case 'struct':case 'enum':return dbg?has(t,'Debug'):displays(t);
      case 'param':return t.bounds.has(dbg?'Debug':'Display');
      case 'int':case 'float':case 'bool':case 'char':case 'str':case 'String':case 'any':case 'never':return true;
      case 'ref':return printable(t.to,dbg);
      case 'slice':return dbg&&printable(t.el,dbg);
      case 'unit':return dbg;
      case 'tuple':return dbg&&t.els.every(x=>printable(x,dbg));
      case 'array':return dbg&&printable(t.el,dbg);
      case 'coll':return dbg&&t.args.every(x=>printable(x,dbg));
      default:return false;
    }
  };
  const peelRefs=t=>{t=res(t);return t.k==='ref'?peelRefs(t.to):t;};
  // rustc names the first element type that lacks Debug, not the Vec or HashMap around it
  const lacksDebug=t=>{
    t=res(t);
    if(t.k==='ref')return lacksDebug(t.to);
    const bad=t.k==='coll'&&t.args.find(a=>!printable(a,true));
    return bad?lacksDebug(bad):t;
  };
  function finish(){
    for(const p of pend)settle(p);
    pend=[];
    for(const f of fmts)f.shown=show(f.fmt.debug?lacksDebug(f.t):peelRefs(f.t));
    for(const v of vars){const r=res(v);if(r.k==='ivar')r.ref=T.int('i32');else if(r.k==='fvar')r.ref=T.float;}
    for(const [v,line] of tvs)if(res(v).k==='tvar'&&!res(v).pendDone)unsup('inferred type',line);
    for(const {e,src,tgt} of intos){
      const t=res(tgt),s0=res(src);
      if(t.k==='tvar'||isOpen(s0,false))continue;
      const fl=t.k==='struct'||t.k==='enum'&&!t.builtin?froms.get(t.name):null,hit=fl&&fl.find(x=>unify(x.from,s0));
      if(hit)I(e).um={key:hit.key,self:'val',adj:'val',kind:'temp',ref:false,text:'value',from:-1,more:[]};
      else if(unify(s0,t))I(e).um={key:'Into::id',self:'val',adj:'val',kind:'temp',ref:false,text:'value',from:-1,more:[]};
      else if(t.k==='String'&&s0.k==='str'||t.k==='int'&&s0.k==='int'&&widens(s0.ty,t.ty))I(e).um={key:t.k==='String'?'Into::String':'Into::int',to:t.ty,self:'val',adj:'val',kind:'temp',ref:false,text:'value',from:-1,more:[]};
      else if(fl||t.k==='struct'||t.k==='enum'&&!t.builtin)errors.push(RQ.diag.make('E0277',e.nline,e.ncol,{what:'bound',type:show(t),trait:'From<'+show(s0,true)+'>'}));
      else unsup('into',e.line);
    }
    intos.length=0;
    const methodSeen=new Set();
    for(const o of obligs){
      const r=res(o.ty);
      if(r.k==='tvar'||isOpen(r,false))continue;
      // whether a closure is Copy depends on its captures, which only mir.js works out
      if(r.k==='closure'&&!o.ret&&!o.method&&(o.tr==='Copy'||o.tr==='Clone')){
        if(o.tr==='Clone')unsup('closure bound',o.line);else r.needCopy={line:o.line,col:o.col};
        continue;
      }
      if(o.method&&methodSeen.has(o.line+':'+o.col))continue;
      if(o.method&&!meets(r,o.tr))methodSeen.add(o.line+':'+o.col);
      if(o.ret){if(r.k==='str'||hasRef(r))unsup('generic reference',o.line);}
      else if(!meets(r,o.tr))errors.push(o.method?RQ.diag.make('E0599',o.line,o.col,{what:'bounds',name:o.method,type:o.shown(),kind:o.kind==='enum'?'enum':'struct'}):RQ.diag.make('E0277',o.line,o.col,{what:'bound',trait:o.tr,type:show(r)}));
    }
    obligs=[];
    // E0600 where the position expects an unsigned type, E0277 (once per literal type) where a later use fixes it
    const bound=new Set();
    for(const [e,t,r0] of negs){
      const r=res(t);
      if(r.k!=='int'||RQ.types.isSigned(r.ty))continue;
      if(okNeg.has(e))errors.push(RQ.diag.make('E0600',e.line,e.col,{type:r.ty}));
      else if(freeNeg.has(e)){if(!bound.has(r0)){bound.add(r0);errors.push(RQ.diag.make('E0277',e.line,e.col,{what:'bound',trait:'Neg',type:r.ty}));}}
      else unsup('type checking',e.line);
    }
    for(const [e,t] of lits){const r=res(t);I(e).rty=r.k==='int'?r.ty:r.k==='float'?'f64':'i32';}
    for(const f of fmts){
      const r=res(f.t);
      if(r.k==='tvar'&&r.pendDone)continue;
      if(!printable(r,f.fmt.debug)){
        if(mentionsAdt(r))errors.push(RQ.diag.make('E0277',f.line,f.col,{type:f.shown,debug:f.fmt.debug}));
        else unsup('type checking',f.line);
      }
      else if(f.fmt.prec!==null&&r.k!=='float'&&r.k!=='any')unsup('format spec',f.line);
    }
    for(const [k,line] of keyChecks)if(!isOpen(k)&&(!has(k,'Eq')||!has(k,'Hash')))unsup('hash key',line);
    for(const [l,line] of patLits){const r=res(l.ty);if(r.k!=='int'||!fits(l.v,r.ty)||l.noBelow&&l.v===RQ.types.INT[r.ty][0])unsup('pattern',line);}
    for(const x of exChecks){
      const d=exDesc(x.st),first=x.e.arms[0];
      if(!x.rows.length&&d.k!=='enum'){errors.push(RQ.diag.make('E0004',x.e.scrut.line,x.e.scrut.col,{empty:show(x.st)}));continue;}
      const miss=RQ.exhaust.missing(d,x.rows);
      if(miss===null)unsup('pattern',x.e.line);
      else if(miss.length){
        const at=x.e.kind==='let'?first.pat:x.e.scrut;
        errors.push(RQ.diag.make(x.e.kind==='let'?'E0005':'E0004',at.line,at.col,{missing:miss}));
      }
    }
    vars=[];negs=[];okNeg=new Set();freeNeg=new Set();lits=[];fmts=[];tvs=[];keyChecks=[];patLits=[];exChecks=[];
  }

  // `v[a..b].m()` borrows the slice itself, as `(&v[a..b]).m()` does
  function lendRange(e){
    const rx=peel(e.recv);
    if(rx.t==='Index'&&peel(rx.index).t==='Range')e.recv={t:'Ref',id:rx.id+0.25,lent:true,line:rx.line,col:rx.col,mut:e.name==='iter_mut'||MUT_SEQ.includes(e.name)||SORT_BY.includes(e.name),expr:rx};
  }
  function slice(e,x){
    const rg=peel(x.index),b=res(ex(x.expr)),ts=[rg.from,rg.to].filter(Boolean).map(ex);
    if(b.k==='any'||b.k==='never')return T.any;
    if(!ts.every(t=>unify(t,T.int('usize'))))return unsup('type checking',e.line);
    const base=b.k==='ref'?res(b.to):b;
    if(base.k==='coll'&&base.name!=='Vec')return unsup('collection method',e.line);
    if(base.k==='String'||b.k==='str'){
      if(e.mut)return unsup('reference',e.line);
      I(e).slice='str';return T.str;
    }
    if(base.k==='array'||base.k==='slice'||base.k==='coll'){
      // IndexMut borrows the base mutably, so behind a `&` it is E0596, as for a Vec element
      const bx=peel(x.expr),ch=e.mut&&(bx.t==='Path'||bx.t==='Field')?chainOf(bx):null;
      if(ch&&(ch.via?!ch.via.mut:b.k==='ref'&&!ch.parts.length&&!b.mut))errors.push(RQ.diag.make('E0596',bx.line,bx.col,{name:b.k==='ref'&&!ch.parts.length?'*'+ch.name:ch.text,ref:true}));
      I(e).slice='arr';return mkRef(!!e.mut,T.slice(base.k==='coll'?base.args[0]:base.el));
    }
    return unsup('type checking',e.line);
  }

  // `for` calls `into_iter()` on its operand: a `&mut` it is handed is moved, not reborrowed
  function intoIterFor(e,it){
    const call={t:'MethodCall',id:it.id+0.5,recv:it,name:'into_iter',targs:null,args:[],line:it.line,col:it.col,nline:it.line,ncol:it.col};
    e.iter=call;reuse=it;I(call).forMove=true;
    const t=res(ex(call));
    reuse=null;
    if(t.k==='iter'){I(e).iterFor=true;return t.item;}
    return unsup('for iterable',it.line);
  }

  // I(e).fi is {src (the node to borrow or move), mode (val moves it, ref and mut lend it), viaRef (src is already a reference), part ('kv', 'k' or 'v' of a map)}; mir.js and interp.js read it
  function forItems(e,it){
    let src=it,mode='val',part='kv',ty,viaRef=false;
    if(it.t==='MethodCall'&&ITERS.includes(it.name)&&!it.args.length){
      lendRange(it);
      const rt=res(ex(it.recv)),base=rt.k==='ref'?res(rt.to):rt;
      if(base.k!=='coll'){
        reuse=it.recv;
        const t=res(ex(it));
        reuse=null;
        if(t.k==='iter'){I(e).iterFor=true;return t.item;}
        return t.k==='any'||t.k==='never'?T.any:unsup('for iterable',it.line);
      }
      src=it.recv;ty=base;viaRef=rt.k==='ref';
      if(it.name==='iter'||it.name==='keys'||it.name==='values')mode='ref';
      else if(it.name==='iter_mut'||it.name==='values_mut')mode='mut';
      else mode=viaRef?(rt.mut?'mut':'ref'):'val';
      if(it.name==='keys')part='k';else if(it.name==='values'||it.name==='values_mut')part='v';
      if(base.name==='Vec'&&part!=='kv')return unsup('for iterable',it.line);
      if(viaRef&&!rt.mut&&mode==='mut')return unsup('for iterable',it.line);
    }else if(it.t==='Ref'){
      const x=peel(it.expr);
      if(x.t==='Index'&&peel(x.index).t==='Range'){
        const st=res(ex(it));
        if(st.k==='any'||st.k==='never')return T.any;
        return st.k==='ref'&&res(st.to).k==='slice'?intoIterFor(e,it):unsup('for iterable',it.line);
      }
      const rt=res(ex(it));
      if(rt.k!=='ref')return T.any;
      ty=res(rt.to);src=it.expr;mode=it.mut?'mut':'ref';
      if(ty.k!=='coll'&&ty.k!=='array')return unsup('for iterable',it.line);
    }else{
      const rt=res(ex(it));
      if(rt.k==='any'||rt.k==='never')return T.any;
      if(rt.k==='iter'){I(e).iterFor=true;return rt.item;}
      if(rt.k==='coll')ty=rt;
      else if(rt.k==='ref'&&res(rt.to).k==='coll'){ty=res(rt.to);mode=rt.mut?'mut':'ref';viaRef=true;}
      else if(rt.k==='ref'&&res(rt.to).k==='array'){ty=res(rt.to);mode=rt.mut?'mut':'ref';viaRef=true;}
      else if(rt.k==='array'||rt.k==='ref'&&res(rt.to).k==='slice')return intoIterFor(e,it);
      else return unsup('for iterable',it.line);
    }
    I(e).fi={src,mode,viaRef,part,coll:ty.name};
    if(ty.k==='array')return mkRef(mode==='mut',ty.el);
    const [k,v]=ty.args,m=mode==='val'?x=>x:mode==='mut'?x=>mkRef(true,x):x=>mkRef(false,x);
    if(ty.name==='Vec')return m(k);
    if(part==='k')return mkRef(false,k);
    if(part==='v')return mkRef(mode==='mut',v);
    return mode==='val'?T.tuple([k,v]):T.tuple([mkRef(false,k),mkRef(mode==='mut',v)]);
  }

  function block(b,w){
    if(b.unsafe)return unsup('unsafe',b.line);
    if(b.label)return unsup('block label',b.line);
    scopes.push(new Map());
    let diverges=false;
    for(const s of b.stmts){
      if(s.t==='Let'){
        const pt=s.pat;
        const named=pt.t==='IdentPat'&&!pt.sub&&!pt.byRef;
        if(!named&&pt.t!=='Wild')unsup('pattern',pt.line);
        if(!s.init){
          // without a type the variable's type would have to be worked out from a later assignment
          if(!s.ty)unsup('deferred initialization',s.line);
          const b=named&&bindVar(pt.name,pt.mut,'let',s.ty?tyOf(s.ty):T.any,pt);
          if(b&&s.ty)b.deferred=true;
          continue;
        }
        const ann=s.ty?tyOf(s.ty):null;
        letInit=peel(s.init);letPat=named?pt:null;
        if(ann&&letInit.t==='Unary'&&letInit.op==='-'&&isIntLit(letInit.expr))okNeg.add(letInit);
        if(!ann)negFree(s.init);
        let t=exW(s.init,ann);
        letInit=null;letPat=null;
        if(named&&lookup(pt.name)){
          shadows++;
          let reads=false;
          RQ.walk(s.init,n=>{if(n.t==='Path'&&n.segs.length===1&&n.segs[0].name===pt.name)reads=true;});
          if(reads)shadowUses++;
        }
        if(ann){coerce(t,ann,s.init);t=ann;}
        if(named)bindVar(pt.name,pt.mut,'let',t,pt);
      }else if(s.t==='ExprStmt'){if(res(ex(s.expr)).k==='never')diverges=true;}
      else if(s.t==='ItemStmt')unsup('nested item',s.line);
      else unsup(s.t,s.line);
    }
    const t=b.tail?exW(b.tail,w):diverges?T.never:T.unit;
    scopes.pop();
    return t;
  }

  function format(m){
    const name=m.name,line=m.line;
    if(!m.args.length){
      if(name==='println'||name==='eprintln'||name==='panic')return T.unit;
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
    for(let n=peel(e.expr);n.t==='Unary'&&n.op==='-';n=peel(n.expr))okNeg.add(n);
    const src=ex(e.expr),to=tyOf(e.ty),s=res(src),d=res(to);
    if(d.k==='any'||s.k==='any'||s.k==='never')return to;
    const lit=bareLit(e.expr);
    if(d.k==='int'&&d.ty[0]==='u'){
      let n=peel(e.expr),neg=false;
      while(n.t==='Unary'&&n.op==='-'){neg=true;n=peel(n.expr);}
      if(neg&&n.t==='Lit'&&n.kind==='int'&&!n.suffix){unify(src,to);return to;}
    }
    if(lit&&d.k==='int'){
      unify(src,to);return to;
    }
    if(lit&&d.k==='char'){if(fits(lit.v,'u8')){unify(src,T.int('u8'));return to;}return unsup('cast',e.line);}
    const num=s.k==='int'||s.k==='ivar'||s.k==='float'||s.k==='fvar';
    const ok=d.k==='int'||d.k==='float'?num||s.k==='bool'&&d.k==='int'||s.k==='char'&&d.k==='int'
      :d.k==='char'?s.k==='char'||(s.k==='int'&&s.ty==='u8'):d.k==='bool'&&s.k==='bool';
    return ok?to:unsup('cast',e.line);
  }

  const fresh=line=>{const v=T.tvar();tvs.push([v,line]);return v;};
  function variantsOf(t){
    t=res(t);
    if(!t.builtin){const vs=enums.get(t.name).variants;return pmap(t)?vs.map(v=>({...v,fields:v.fields.map(f=>({...f,ty:inst(t,f.ty)}))})):vs;}
    const f=ty=>[{name:'0',ty}];
    if(t.name==='Ordering')return ['Less','Equal','Greater'].map(name=>({name,kind:'unit',fields:[]}));
    return t.name==='Option'?[{name:'None',kind:'unit',fields:[]},{name:'Some',kind:'tuple',fields:f(t.args[0])}]
      :[{name:'Ok',kind:'tuple',fields:f(t.args[0])},{name:'Err',kind:'tuple',fields:f(t.args[1])}];
  }
  const noArgs=p=>p.t==='Path'&&!p.global&&p.segs.every(g=>!g.args&&!g.fn);
  function ctorOf(p){
    if(!noArgs(p)||p.segs.length>2)return null;
    const sg=p.segs;
    let n=sg[0].name,ty,vn=null;
    if(sg.length===1){
      if(n==='Self'&&curSelf&&structs.has(curSelf))n=curSelf;
      const shadowed=fns.has(n)||consts.has(n)||structs.has(n)||enums.has(n);
      if(structs.has(n)){
        const r=structs.get(n),ty=openTy(n,p.line);
        return {name:n,ty,kind:r.kind,fields:fieldsOf(ty),vi:null};
      }
      if(shadowed)return null;
      if(n==='None'||n==='Some')ty=optTy(fresh(p.line));
      else if(n==='Ok'||n==='Err')ty=resTy(fresh(p.line),fresh(p.line));
      else return null;
      vn=n;
    }else{
      if(n==='Self')n=curSelf;
      vn=sg[1].name;
      if(enums.has(n))ty=openTy(n,p.line);
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
  const inIndex=e=>{for(e=peel(e);e.t==='Field'||e.t==='Index';e=peel(e.expr))if(e.t==='Index')return true;return false;};
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
  // the lossless integer From impls; usize and isize have only a few, so they are left out
  const widens=(from,to)=>{
    if(from.endsWith('size')||to.endsWith('size'))return false;
    const fb=+from.slice(1),tb=+to.slice(1);
    return from[0]===to[0]?fb<tb:from[0]==='u'&&fb<tb;
  };
  // rustc names the part of the element type that lacks Ord, not the whole element
  const ordLeaf=t=>{
    t=res(t);
    const sub=t.k==='array'||t.k==='slice'?[t.el]:t.k==='tuple'?t.els:t.k==='enum'&&t.builtin||t.k==='coll'&&t.name==='Vec'?t.args:[];
    const bad=sub.find(x=>!has(x,'Ord'));
    return bad?ordLeaf(bad):t;
  };
  const SORT_BY=['sort_by','sort_unstable_by','sort_by_key','sort_unstable_by_key'],CMPS=['cmp','partial_cmp','total_cmp'];
  const SORTS=['sort','sort_unstable'],MUT_SEQ=['swap','reverse',...SORTS],SEQ_METHODS=[...MUT_SEQ,'contains','first','last'];
  const UNIVERSAL=['into','try_into','borrow','borrow_mut','type_id'];
  const ITERS=['iter','iter_mut','into_iter','keys','values','values_mut'],STORES=['push','insert','entry.or_insert','entry.or_default'];
  const MAP_KEYED=['insert','get','get_mut','contains_key','remove','entry.or_insert','entry.or_default'];
  function builtinMethod(base,name,args){
    const rec=(selfKind,params,ret,from)=>({key:name==='clone'?'Clone::clone':(base.builtin||base.k==='coll'?base.name+'::':'')+name,selfKind,params:params.map(ty=>({ty})),ret,from:from??(hasRef(base)?0:-1),builtin:true});
    if(name==='clone'&&has(base,'Clone'))return rec('&',[],base);
    if(name==='to_string'&&meets(base,'Display')&&base.k!=='coll')return {...rec('&',[],T.string,-1),key:'Display::to_string'};
    if(name==='cmp'&&has(base,'Ord'))return {...rec('&',[mkRef(false,base)],ordTy,-1),key:'Ord::cmp'};
    if(name==='partial_cmp'&&has(base,'PartialOrd'))return {...rec('&',[mkRef(false,base)],optTy(ordTy),-1),key:'PartialOrd::partial_cmp'};
    if(name==='total_cmp'&&base.k==='float')return {...rec('&',[mkRef(false,base)],ordTy,-1),key:'f64::total_cmp'};
    if(base.builtin&&base.name==='Ordering'){
      if(name==='reverse')return rec('val',[],ordTy,-1);
      if(name==='then')return rec('val',[ordTy],ordTy,-1);
      return null;
    }
    if(base.k==='array'||base.k==='slice'){
      const el=base.el,usz=T.int('usize'),on=(selfKind,params,ret,from)=>({...rec(selfKind,params,ret,from),key:'Vec::'+name});
      switch(name){
        case 'swap':return on('&mut',[usz,usz],T.unit,-1);
        case 'reverse':return on('&mut',[],T.unit,-1);
        case 'sort':case 'sort_unstable':return has(el,'Ord')?on('&mut',[],T.unit,-1):null;
        case 'contains':return has(el,'PartialEq')?on('&',[mkRef(false,el)],T.bool,-1):null;
        case 'first':case 'last':return on('&',[],optTy(mkRef(false,el)),0);
      }
      return null;
    }
    if(base.k==='coll'){
      const [k,v]=base.args,vec=base.name==='Vec',usz=T.int('usize');
      if(name==='len'||name==='is_empty')return rec('&',[],name==='len'?T.int('usize'):T.bool,-1);
      if(name==='clear')return rec('&mut',[],T.unit,-1);
      if(name==='extend'){
        const a=args.length===1?res(args[0]):null,el=a&&(a.k==='coll'&&a.name===base.name||a.k==='array')?(a.k==='array'?a.el:vec?a.args[0]:T.tuple(a.args)):a&&!vec&&a.k==='coll'&&a.name==='Vec'?a.args[0]:null;
        return el&&unify(el,vec?k:T.tuple([k,v]))?rec('&mut',[args[0]],T.unit,-1):null;
      }
      if(vec){
        switch(name){
          case 'push':return rec('&mut',[k],T.unit,-1);
          case 'pop':return rec('&mut',[],optTy(k),-1);
          case 'insert':return rec('&mut',[usz,k],T.unit,-1);
          case 'remove':return rec('&mut',[usz],k,-1);
          case 'truncate':return rec('&mut',[usz],T.unit,-1);
          case 'swap':return rec('&mut',[usz,usz],T.unit,-1);
          case 'reverse':return rec('&mut',[],T.unit,-1);
          case 'sort':case 'sort_unstable':return has(k,'Ord')?rec('&mut',[],T.unit,-1):null;
          case 'contains':return has(k,'PartialEq')?rec('&',[mkRef(false,k)],T.bool,-1):null;
          case 'get':return rec('&',[usz],optTy(mkRef(false,k)),0);
          case 'get_mut':return rec('&mut',[usz],optTy(mkRef(true,k)),0);
          case 'first':case 'last':return rec('&',[],optTy(mkRef(false,k)),0);
        }
        return null;
      }
      // a key that is still open is judged when the fn ends (keyChecks)
      if(!MAP_KEYED.includes(name)||!(isOpen(k,true)||has(k,'Eq')&&has(k,'Hash')))return null;
      switch(name){
        case 'insert':return rec('&mut',[k,v],optTy(v),-1);
        case 'get':return rec('&',[mkRef(false,k)],optTy(mkRef(false,v)),0);
        case 'get_mut':return rec('&mut',[mkRef(false,k)],optTy(mkRef(true,v)),0);
        case 'contains_key':return rec('&',[mkRef(false,k)],T.bool,-1);
        case 'remove':return rec('&mut',[mkRef(false,k)],optTy(v),-1);
        case 'entry.or_insert':return rec('&mut',[k,v],mkRef(true,v),0);
        case 'entry.or_default':return has(v,'Default')?rec('&mut',[k],mkRef(true,v),0):null;
      }
      return null;
    }
    if(!base.builtin)return null;
    const opt=base.name==='Option',[a,b]=base.args;
    if(name==='is_some'||name==='is_none')return opt?rec('&',[],T.bool,-1):null;
    if(name==='is_ok'||name==='is_err')return opt?null:rec('&',[],T.bool,-1);
    // Result::unwrap and expect print the error, so they need it to be Debug
    const dbgOk=opt||has(b,'Debug');
    if((name==='copied'||name==='cloned')&&opt&&res(a).k==='ref')return has(res(a).to,name==='copied'?'Copy':'Clone')?rec('val',[],optTy(res(a).to),-1):null;
    if(name==='unwrap')return dbgOk?rec('val',[],a):null;
    if(name==='expect')return dbgOk?rec('val',[T.str],a):null;
    if(name==='unwrap_or')return hasRef(base)?null:rec('val',[a],a);
    if(name==='unwrap_or_default')return hasRef(base)||!has(a,'Default')?null:rec('val',[],a);
    if(opt){
      if(name!=='ok_or'||args.length!==1)return null;
      const lit=res(args[0]).k==='str';
      return lit||!holdsRef(args[0])?rec('val',[args[0]],resTy(a,args[0]),hasRef(base)?0:lit?1:-1):null;
    }
    if(name==='ok')return rec('val',[],optTy(a));
    if(name==='err')return rec('val',[],optTy(b));
    if(name==='unwrap_err'||name==='expect_err')return has(a,'Debug')?rec('val',name==='expect_err'?[T.str]:[],b):null;
    return null;
  }
  function openImpl(m,line,col,base){
    const im=new Map(m.itps.map(p=>[p,fresh(line)]));
    if(base&&!unify(subst(m.pattern,im),base))return null;
    const shown=()=>show(subst(m.pattern,im));
    for(const p of m.itps)for(const tr of p.declared)obligs.push({ty:im.get(p),tr,line,col,method:m.node.name,shown,kind:m.pattern.k});
    for(const p of m.itps)if(mentionsParam(m.ret,p))obligs.push({ty:im.get(p),ret:true,line});
    return {...m,params:m.params.map(q=>({...q,ty:subst(q.ty,im)})),ret:subst(m.ret,im),selfTy:m.selfTy&&subst(m.selfTy,im)};
  }
  const missingTrait=(base,name)=>{
    for(const tr of traits.values())if(!tr.builtin&&tr.methods.has(name)&&tr.methods.get(name).selfKind&&!(traitImpls.get(tr.name)||new Set()).has(base.name))return tr.name;
    return null;
  };
  const paramMethods=base=>({get:name=>{
    for(const trName of base.declared||[]){
      const tr=traits.get(trName),tm=tr&&!tr.builtin&&tr.methods.get(name);
      if(!tm||!tm.selfKind)continue;
      const map=new Map([[tm.selfPar,base]]);
      return {...tm,params:tm.params.map(q=>({...q,ty:subst(q.ty,map)})),ret:subst(tm.ret,map)};
    }
    return null;
  }});
  function adtMethod(e,r,base,args,spec){
    if(base.k==='param'&&base.lenient)return T.any;
    const isRef=r.k==='ref',name=e.name,own=base.builtin||base.k==='coll'?null:base.k==='param'?paramMethods(base):methods.get(base.name);
    let m=(spec&&spec.build(args))||(own&&own.get(name))||builtinMethod(base,name,args);
    // a `&str` is a `str` type here, so its own comparison takes one more `&` only behind a reference
    if(m&&m.builtin&&CMPS.includes(name)&&base.k==='str'&&!isRef)m={...m,params:[{ty:T.str}]};
    if(!m&&spec&&base.k==='iter')return unsup('iterator',e.line);
    const ch=chainOf(e.recv),text=isRef?(peel(e.recv).t==='Path'?'*':'')+(ch?ch.text:'value'):ch?ch.text:'value';
    if(!m){
      if(base.k==='array'||base.k==='slice'){
        const el=res(base.el),need=SORTS.includes(name)&&!args.length?'Ord':name==='contains'&&args.length===1?'PartialEq':null;
        if(need&&!isOpen(el,false)&&el.k!=='any'&&(need==='Ord'||unify(args[0],mkRef(false,el)))){
          errors.push(RQ.diag.make('E0277',e.nline,e.ncol,{trait:need,type:show(need==='Ord'?ordLeaf(el):el)}));
          return need==='Ord'?T.unit:T.bool;
        }
        return unsup('method call',e.line);
      }
      if(name==='clone'&&isRef&&!r.mut&&!args.length){I(e).um={key:'ref::clone',self:'&',adj:'val',kind:peel(e.recv).t==='Path'?'refvar':'temp',ref:true,text,from:0};return r;}
      if(base.k==='coll'){
        // the method exists but the elements lack a trait it needs; while an element type is open that is not judged
        const map=base.name==='HashMap',bounded=name==='clone'&&!args.length||map&&MAP_KEYED.includes(name)&&!name.includes('.');
        if(ITERS.includes(name)&&!args.length)return unsup('iterator',e.line);
        const el=base.name==='Vec'?res(base.args[0]):null,need=el&&(SORTS.includes(name)&&!args.length?'Ord':name==='contains'&&args.length===1?'PartialEq':null);
        if(need&&!isOpen(el,false)&&el.k!=='any'&&(need==='Ord'||unify(args[0],mkRef(false,el)))){
          errors.push(RQ.diag.make('E0277',e.nline,e.ncol,{trait:need,type:show(need==='Ord'?ordLeaf(el):el)}));
          return need==='Ord'?T.unit:T.bool;
        }
        if(!bounded)return unsup('collection method',e.line);
        if(isOpen(base,true))return unsup('inferred type',e.line);
        errors.push(RQ.diag.make('E0599',e.nline,e.ncol,{what:'bounds',name,type:show(base)}));
        return T.any;
      }
      if(name==='total_cmp'&&base.k==='fvar')return unsup('inferred type',e.line);
      if(base.builtin||UNIVERSAL.includes(name)||(name==='eq'||name==='ne')&&has(base,'PartialEq'))return unsup('method call',e.line);
      errors.push(RQ.diag.make('E0599',e.nline,e.ncol,{what:'method',name,type:show(base,true),kind:base.k==='param'?'type parameter':['int','ivar','float','fvar','bool','char'].includes(base.k)?'type':base.k,trait:base.k!=='param'&&missingTrait(base,name)}));
      return T.any;
    }
    if(name==='drop'&&base.k==='struct'&&drops.has(base.name)){errors.push(RQ.diag.make('E0040',e.nline,e.ncol,{}));return T.unit;}
    if(m.pattern){
      m=openImpl(m,e.nline,e.ncol,base);
      if(!m){errors.push(RQ.diag.make('E0599',e.nline,e.ncol,{what:'method',name,type:show(base),kind:base.k}));return T.any;}
    }
    const sk=m.selfKind;
    if(!sk){errors.push(RQ.diag.make('E0599',e.nline,e.ncol,{what:'method',name,type:show(base),kind:base.k}));return T.any;}
    if(args.length!==m.params.length)return unsup('wrong argument count',e.line);
    const gi=m.tps&&m.tps.length?instantiate(m,e.line,e.args,e):null;
    if(gi)m={...m,params:gi.params.map(ty=>({ty})),ret:gi.ret};
    const keyIsText=base.k==='coll'&&base.name==='HashMap'&&res(base.args[0]).k==='String'&&['get','get_mut','contains_key','remove'].includes(name)&&res(args[0]).k==='str';
    // a position that is not a plain usize is a range or another index type, which `get` takes and Rust Quest does not model
    if(base.k==='coll'&&base.name==='Vec'&&(name==='get'||name==='get_mut')&&!unify(args[0],T.int('usize')))return unsup('collection method',e.line);
    if(!keyIsText)args.forEach((t,i)=>coerce(t,m.params[i].ty,e.args[i]));
    if(base.k==='coll'&&STORES.includes(name)&&args.some(holdsRef))return unsup('reference in collection',e.line);
    if(base.k==='coll'&&base.name==='HashMap'&&MAP_KEYED.includes(name)&&isOpen(base.args[0],true))keyChecks.push([base.args[0],e.line]);
    let adj;
    if(!isRef)adj=sk;
    else if(sk==='val')adj='copy';else if(!r.mut)adj='val';
    else adj=sk==='&'?'reb':'val';
    const p=peel(e.recv);
    if(sk==='&mut'&&guardRoot&&scrutRoot(p)===guardRoot){if(isRef)unsup('match guard',e.line);else guardBorrow(p,e.line,e.col);}
    if(gi)gi.meet();
    I(e).um={key:m.key,self:sk,adj,kind:isRef?(p.t==='Path'?'refvar':'temp'):placeChain(e.recv)?'place':'temp',ref:isRef,text,from:m.from,more:m.more,inner:m.inner};
    // a &mut self method needs a mutable place: behind a shared reference, or through one to a field, it is E0596
    if(sk==='&mut'&&(isRef&&!r.mut||!isRef&&ch&&ch.via&&!ch.via.mut))errors.push(RQ.diag.make('E0596',e.line,e.col,{name:text,ref:true}));
    // a by-value self takes the value away from behind the reference, which only a Copy type allows
    if(sk==='val'&&isRef&&!isCopy(base))errors.push(RQ.diag.make('E0507',e.recv.line,e.recv.col,{name:text,mut:r.mut}));
    return m.ret;
  }

  // Each binding gets bpath (its path below the scrutinee) and bmode ('move' or 'ref') for mir.js and interp.js. Any pattern but a name or `_`
  // looks through a `&` on the scrutinee, and everything below it binds by reference; a `&` met further down is not modeled.
  const WILD=RQ.exhaust.WILD;
  const wrapRef=(ir,n)=>{for(let i=0;i<n;i++)ir={c:'single',args:[ir]};return ir;};
  function patLit(n){
    let neg=false;
    while(n.t==='Unary'&&n.op==='-'){neg=!neg;n=n.expr;}
    if(n.t==='Path'&&n.segs.length===2&&isInt(n.segs[0].name)&&(n.segs[1].name==='MIN'||n.segs[1].name==='MAX')&&!neg&&!nameTaken(n.segs[0].name)){
      return {kind:'int',v:RQ.types.INT[n.segs[0].name][n.segs[1].name==='MIN'?0:1],ty:T.int(n.segs[0].name),line:n.line};
    }
    if(n.t!=='Lit')return null;
    if(n.kind==='int'){
      if(n.suffix&&!isInt(n.suffix))return null;
      const v=BigInt(n.v);
      return {kind:'int',v:neg?-v:v,ty:n.suffix?T.int(n.suffix):ivar(),line:n.line};
    }
    if(neg)return null;
    if(n.kind==='char')return {kind:'char',v:BigInt(n.v.codePointAt(0)),ty:T.char,line:n.line};
    if(n.kind==='bool')return {kind:'bool',v:n.v,ty:T.bool,line:n.line};
    if(n.kind==='str')return {kind:'str',ty:T.str,line:n.line};
    return null;
  }
  function peelPat(p,t,mode,path){
    let wraps=0;
    t=res(t);
    while(t.k==='ref'){
      if(t.mut||path.length){unsup('pattern',p.line);return null;}
      mode='ref';wraps++;t=res(t.to);
    }
    return {t,mode,wraps};
  }
  const hasBinding=n=>{let b=false;RQ.walk(n,x=>{if(x.t==='IdentPat'&&x.name!=='None')b=true;});return b;};
  const nameTaken=n=>fns.has(n)||consts.has(n)||structs.has(n)||enums.has(n);
  const patPath=n=>({t:'Path',segs:[{name:n,args:null,fn:null}],global:false});
  function bindPat(p,t,mode,path,st){
    const n=p.name;
    if(p.byRef||p.mut&&mode==='ref'||p.sub&&hasBinding(p.sub)||st.names.has(n)){unsup('pattern',p.line);return WILD;}
    st.names.add(n);st.binds++;
    if(mode==='move'&&!isCopy(t)){
      const last=path[path.length-1];
      if(st.viaRef){
        const dp=peel(st.scrut).pat;
        if(!dp&&(path.length!==1||!last.variant)){unsup('move out of reference',p.line);return WILD;}
        if(!st.cov.err){
          st.cov.err=true;
          if(dp)errors.push(RQ.diag.make('E0507',p.line,p.col,{pat:true,mut:dp.mut}));
          else{
            const x=peel(st.scrut),inner=x.t==='Deref'?peel(x.expr):x,ch=chainOf(inner),via=x.t==='Deref'?res(info.get(inner).ty):ch&&ch.via;
            errors.push(RQ.diag.make('E0507',st.scrut.line,st.scrut.col,{name:ch?ch.text:'value',variant:last.variant,mut:!!via&&via.mut}));
          }
        }
      }else st.cov.moves=true;
    }
    bindVar(n,p.mut,'let',mode==='ref'?mkRef(false,t):t,p);
    const o=I(p);o.bpath=path;o.bmode=mode;
    return p.sub?walkPat(p.sub,t,mode,path,st):WILD;
  }
  function subPats(p,pats,fields,mode,path,st,variant,vi){
    const ri=pats.findIndex(x=>x.t==='Rest');
    if(pats.filter(x=>x.t==='Rest').length>1||(ri<0?pats.length!==fields.length:pats.length-1>fields.length)){unsup('pattern',p.line);return null;}
    const args=fields.map(()=>WILD);
    pats.forEach((sp,i)=>{
      if(sp.t==='Rest')return;
      const fi=ri>=0&&i>ri?fields.length-(pats.length-i):i,f=fields[fi];
      args[fi]=walkPat(sp,f.ty,mode,[...path,{sel:(variant?variant+'.':'')+f.name,f:f.name,ty:f.ty,variant}],st);
    });
    return args;
  }
  function walkPat(p,t,mode,path,st){
    t=res(t);
    const bad=()=>{unsup('pattern',p.line);return WILD;};
    const anyNames=()=>{
      RQ.walk(p,x=>{if(x.t==='IdentPat'&&!st.names.has(x.name)&&x.name!=='None'){st.names.add(x.name);bindVar(x.name,x.mut,'let',T.any,x);I(x).bpath=path;I(x).bmode='move';}});
      return WILD;
    };
    if(t.k==='any'||t.k==='never')return anyNames();
    switch(p.t){
      case 'Wild':return WILD;
      case 'IdentPat':{
        const n=p.name;
        if(!p.sub&&!p.byRef&&(consts.has(n)||structs.has(n)))return bad();
        if((n==='Some'||n==='Ok'||n==='Err')&&!nameTaken(n)&&!p.sub&&!p.byRef){
          errors.push(RQ.diag.make('E0530',p.line,p.col,{name:n}));return WILD;
        }
        if(n==='None'&&!nameTaken(n)&&!p.sub&&!p.byRef){I(p).tests=path;return walkPat({...p,t:'PathPat',path:patPath(n)},t,mode,path,st);}
        return bindPat(p,t,mode,path,st);
      }
      case 'Or':{
        const before=st.binds,alts=p.alts.map(a=>walkPat(a,t,mode,path,st));
        if(st.binds!==before)return bad();
        return {or:alts};
      }
      case 'LitPat':case 'RangePat':{
        const q=peelPat(p,t,mode,path);
        if(!q)return WILD;
        let ends,ir;
        if(p.t==='LitPat'){
          const l=patLit(p.lit);
          if(!l)return bad();
          ends=[l];
          ir=l.kind==='str'?{c:'single',args:[{c:'opaque'}]}:l.kind==='bool'?{c:'bool',v:l.v}:{c:'range',lo:l.v,hi:l.v};
        }else{
          const lo=p.lo&&patLit(p.lo),hi=p.hi&&patLit(p.hi);
          if(!lo&&!hi||p.lo&&!lo||p.hi&&!hi||[lo,hi].some(x=>x&&x.kind!=='int'&&x.kind!=='char'))return bad();
          const hv=hi?(p.inclusive?hi.v:hi.v-1n):null;
          if(lo&&hi&&lo.v>hv)return bad();
          if(!lo&&!p.inclusive)hi.noBelow=true;
          ends=[lo,hi].filter(Boolean);
          ir={c:'range',lo:lo?lo.v:null,hi:hv};
        }
        for(const l of ends){
          if(!unify(l.ty,q.t)){mism(q.t,l.ty,p);return WILD;}
          if(l.kind==='int')patLits.push([l,p.line]);
        }
        I(p).tests=path;
        return wrapRef(ir,q.wraps);
      }
      case 'TuplePat':{
        const q=peelPat(p,t,mode,path);
        if(!q)return WILD;
        const els=q.t.k==='tuple'?q.t.els:q.t.k==='unit'?[]:null;
        if(!els){mism(q.t,T.tuple(p.pats.map(()=>T.tvar())),p);return anyNames();}
        const args=subPats(p,p.pats,els.map((ty,i)=>({name:String(i),ty})),q.mode,path,st,null);
        return args?wrapRef({c:'single',args},q.wraps):WILD;
      }
      case 'PathPat':case 'TupleStructPat':case 'StructPat':{
        const q=peelPat(p,t,mode,path);
        if(!q)return WILD;
        const u=q.t,kind=p.t==='PathPat'?'unit':p.t==='StructPat'?'named':'tuple';
        let v,vi=null;
        if(u.k==='enum'){
          vi=variantIndex(u,p.path);
          if(vi<0){
            const sg=p.path.segs;
            if(p.t!=='StructPat'&&!u.builtin&&sg.length===2&&noArgs(p.path)&&(sg[0].name===u.name||sg[0].name==='Self'&&curSelf===u.name)&&!(methods.get(u.name)&&methods.get(u.name).has(sg[1].name))){
              errors.push(RQ.diag.make('E0599',p.line,p.col,{what:'item',name:sg[1].name,type:u.name,kind:'enum'}));
              return WILD;
            }
            return bad();
          }
          v=variantsOf(u)[vi];
        }else if(u.k==='struct'){
          const ct=ctorOf(p.path);
          if(!ct||ct.vi!==null||ct.name!==u.name)return bad();
          unify(ct.ty,u);
          v=ct;
        }else return bad();
        if(v.kind!==kind)return bad();
        const vname=u.k==='enum'?v.name:null;
        let args;
        if(p.t==='StructPat'){
          const seen=new Set();
          args=v.fields.map(()=>WILD);
          for(const f of p.fields){
            const fi=v.fields.findIndex(x=>x.name===f.name);
            if(fi<0||seen.has(f.name))return bad();
            seen.add(f.name);
            args[fi]=walkPat(f.pat,v.fields[fi].ty,q.mode,[...path,{sel:(vname?vname+'.':'')+f.name,f:f.name,ty:v.fields[fi].ty,variant:vname}],st);
          }
          if(!p.rest&&seen.size!==v.fields.length)return bad();
        }else if(p.t==='TupleStructPat'){
          args=subPats(p,p.pats,v.fields,q.mode,path,st,vname);
          if(!args)return WILD;
        }else args=[];
        if(u.k==='enum')I(p).tests=path;
        return wrapRef(u.k==='enum'?{c:'v',i:vi,args}:{c:'single',args},q.wraps);
      }
      default:return bad();
    }
  }
  function exDesc(t){
    t=res(t);
    switch(t.k){
      case 'bool':return {k:'bool'};
      case 'char':return {k:'char'};
      case 'int':{const r=RQ.types.INT[t.ty];return {k:'int',lo:r[0],hi:r[1],ty:t.ty,open:t.ty.endsWith('size')};}
      case 'str':return {k:'ref',to:()=>({k:'opaque'})};
      case 'ref':return {k:'ref',to:()=>exDesc(t.to)};
      case 'unit':return {k:'tuple',tys:()=>[]};
      case 'tuple':return {k:'tuple',tys:()=>t.els.map(exDesc)};
      case 'struct':{
        const r=structs.get(t.name),fl=fieldsOf(t);
        return {k:'struct',name:t.name,kind:r.kind,names:fl.map(f=>f.name),tys:()=>fl.map(f=>exDesc(f.ty))};
      }
      case 'enum':return {k:'enum',prefix:t.builtin?'':t.name+'::',variants:variantsOf(t).map(v=>({name:v.name,kind:v.kind,names:v.fields.map(f=>f.name),tys:()=>v.fields.map(f=>exDesc(f.ty))}))};
      default:return {k:'opaque'};
    }
  }
  // rustc holds a shared borrow of the matched place through every guard, so a guard may not take &mut of it (E0502)
  let guardRoot=null;
  function guardBorrow(n,line,col){
    if(n.t==='Path')errors.push(RQ.diag.make('E0502',line,col,{name:guardRoot,mut:true}));
    else unsup('match guard',line);
  }
  const scrutRoot=n=>{while(n.t==='Field'||n.t==='Index')n=peel(n.expr);return n.t==='Path'&&n.segs.length===1?n.segs[0].name:null;};
  function matchExpr(e){
    const w0=takeWant(),w=w0&&e.kind!=='letelse'&&e.kind!=='whilelet'&&!e.noElse?w0:null;
    let st=ex(e.scrut);
    if(e.annot){const a=tyOf(e.annot);coerce(st,a,e.scrut);st=a;}
    const s=res(st),broken=s.k==='any'||s.k==='never';
    if(s.k==='ref'&&s.mut)return unsup('match',e.line);
    const sc=peel(e.scrut),ch=chainOf(sc);
    const viaRef=sc.t==='Deref'||!!(ch&&ch.via);
    const cov={moves:false,err:false},rows=[];
    const nodeFor=a=>e.kind==='letelse'&&a===e.arms[1];
    let rt=null;
    for(const a of e.arms){
      scopes.push(new Map());
      const ps={cov,viaRef,scrut:e.scrut,names:new Set(),binds:0};
      const ir=walkPat(a.pat,st,'move',[],ps);
      if(a.guard){
        const root=scrutRoot(sc),was=guardRoot;
        const named=n=>{let f=false;RQ.walk(n,x=>{if(x.t==='IdentPat'&&x.name===root)f=true;});return f;};
        const shadowed=root&&(named(a.pat)||named(a.guard));
        guardRoot=root&&!shadowed?root:null;
        expect(ex(a.guard),T.bool,a.guard);
        guardRoot=was;
        if(root)RQ.walk(a.guard,g=>{
          if(g.t==='Assign'&&scrutRoot(peel(g.lhs))===root)unsup('match guard',g.line);
          if(shadowed&&(g.t==='MethodCall'||g.t==='Ref'&&g.mut))unsup('match guard',g.line);
        });
      }
      rows.push({p:ir,g:!!a.guard});
      const bt=exW(a.body,w);
      scopes.pop();
      if(nodeFor(a)){
        if(!['never','any'].includes(res(bt).k))errors.push(RQ.diag.make('E0308',endNode(a.body).line,endNode(a.body).col,{what:'letelse',expected:'!',found:show(bt)}));
        continue;
      }
      if(res(bt).k==='never'||e.noElse&&a===e.arms[1])continue;
      if(w){coerce(bt,w,endNode(a.body));rt=w;}
      else if(rt===null)rt=bt;
      else if(!unify(rt,bt)){
        if(!clashes(bt,rt))return unsup('reference coercion',a.body.line);
        errors.push(RQ.diag.make('E0308',endNode(a.body).line,endNode(a.body).col,{what:e.kind==='iflet'?'else':'match',expected:show(rt),found:show(bt)}));
      }
    }
    if(!broken)exChecks.push({e,st,rows});
    I(e).match={ref:s.k==='ref',place:!!placeChain(sc)||sc.t==='Deref',bindsMoved:cov.moves};
    if(e.kind==='whilelet'){
      if(rt&&!['unit','never','any'].includes(res(rt).k))unsup('type checking',e.line);
      return T.unit;
    }
    if(e.noElse){
      if(rt&&!['unit','never','any'].includes(res(rt).k)){
        if(['int','ivar','float','fvar','bool','char','str','String'].includes(res(rt).k)){const n=endNode(e.arms[0].body);errors.push(RQ.diag.make('E0308',n.line,n.col,{expected:'()',found:show(rt)}));}
        else unsup('type checking',e.line);
      }
      return T.unit;
    }
    return rt||T.never;
  }

  function vecMacro(e){
    const ts=e.args.map(ex);
    if(e.repeat){
      const n=ex(e.repeat);
      if(isOpen(ts[0]))return unsup('inferred type',e.line);
      if(!has(ts[0],'Clone'))return unsup('type checking',e.line);
      expect(n,T.int('usize'),e.repeat);
    }
    const el=ts.length?ts[0]:fresh(e.line);
    for(const t of ts.slice(1))if(!unify(el,t))return unsup('type checking',e.line);
    return ts.some(holdsRef)?unsup('reference in collection',e.line):T.coll('Vec',[el]);
  }
  function ex(e){const t=expr(e);I(e).ty=t;return t;}
  // The type a coercion site (fn tail, return, annotated let, call argument) expects of a `match`, `if` or block; rustc coerces each arm to it
  // and reports the arm that does not fit.
  let want=null;
  // `?` converts the error with From. Std has no From into a type the learner declares, and none from a number, bool or unit into String
  const noFrom=(from,to)=>{
    const user=x=>x.k==='struct'||x.k==='enum'&&!x.builtin;
    if(user(to))return true;
    if(user(from))return ['int','float','bool','char','unit','String'].includes(to.k);
    return to.k==='String'&&['int','float','bool','unit'].includes(from.k);
  };
  const takeWant=()=>{const w=want;want=null;return w&&!['any','never'].includes(res(w).k)?w:null;};
  // rustc types a literal from what its position expects before negating it: E0600 there, E0277 when nothing is expected yet
  function negOk(e,w){
    if(!w)return;
    const x=peel(e),t=res(w);
    if(x.t==='Unary'&&x.op==='-'){
      let n=x;
      while(n.t==='Unary'&&n.op==='-')n=peel(n.expr);
      if(t.k==='int'&&!RQ.types.isSigned(t.ty)&&isIntLit(n))for(let m=x;m!==n;m=peel(m.expr))okNeg.add(m);
    }else if(x.t==='Ref'&&t.k==='ref'&&!x.mut===!t.mut)negOk(x.expr,t.to);
    else if(x.t==='Tuple'&&t.k==='tuple'&&t.els.length===x.elems.length)x.elems.forEach((y,i)=>negOk(y,t.els[i]));
    else if(x.t==='Array'&&t.k==='array')x.elems.forEach(y=>negOk(y,t.el));
    else if(x.t==='ArrayRepeat'&&t.k==='array')negOk(x.elem,t.el);
    else if(x.t==='Macro'&&x.name==='vec'&&x.args&&!x.named.length&&t.k==='coll'&&t.name==='Vec')x.args.forEach(y=>negOk(y,t.args[0]));
    else if(x.t==='Call'&&x.args.length===1&&peel(x.callee).t==='Path'&&t.k==='enum'&&t.builtin){
      const sg=peel(x.callee).segs,v=sg[sg.length-1].name;
      if(v==='Some'||v==='Ok')negOk(x.args[0],t.args[0]);
      else if(v==='Err')negOk(x.args[0],t.args[1]);
    }
  }
  // positions that expect nothing of a `-` operand: its `Neg` bound is checked at the end
  function negFree(e){
    const x=peel(e);
    if(x.t==='Unary'&&x.op==='-')for(let n=x;n.t==='Unary'&&n.op==='-';n=peel(n.expr))freeNeg.add(n);
    else if(x.t==='Tuple'||x.t==='Array')x.elems.forEach(negFree);
    else if(x.t==='ArrayRepeat')negFree(x.elem);
    else if(x.t==='Macro'&&x.name==='vec'&&x.args&&!x.named.length)x.args.forEach(negFree);
    else if(x.t==='Call'&&peel(x.callee).t==='Path'&&['Some','Ok','Err'].includes(peel(x.callee).segs.slice(-1)[0].name))x.args.forEach(negFree);
    else if(x.t==='Block'&&x.tail&&!x.label)negFree(x.tail);
    else if(x.t==='If'){negFree(x.then);if(x.els)negFree(x.els);}
    else if(x.t==='Match'&&x.kind!=='let')x.arms.forEach(a=>negFree(a.body));
  }
  function exW(e,w){
    negOk(e,w);
    const t=peel(e).t;
    if(t==='Closure'&&w&&res(w).k==='opq'){if(++opqCl>1)return unsup('closure kind',peel(e).line);expSig=sigOf(w);}
    if(w&&(t==='Match'||t==='If'||t==='Block'||t==='MethodCall'&&['collect','sum','product'].includes(peel(e).name)))want=w;
    return ex(e);
  }
  const place=e=>{e=peel(e);return e.t==='Path'||e.t==='Field'||e.t==='Index'||e.t==='Deref';};
  const placeChain=e=>{e=peel(e);return e.t==='Path'||((e.t==='Field'||e.t==='Index')&&placeChain(e.expr));};
  // mir.js decides how a closure captures and which Fn trait it implements (info.get(closure).cl)
  const RANK={Fn:0,FnMut:1,FnOnce:2};
  const usz=T.int('usize');
  let expSig=null,opqCl=0,curCl=null,letInit=null,letPat=null,reuse=null,rangeOk=false,pend=[];
  const callable=t=>{t=res(t);return t.k==='closure'||t.k==='opq'||t.k==='param'&&!!t.fnb&&!!t.fnb.params;};
  const sigOf=t=>{
    t=res(t);
    if(t.k==='param')return {kind:t.fnb.kind,params:t.fnb.params,ret:t.fnb.ret};
    return {kind:t.kind||'closure',params:t.params,ret:t.ret};
  };
  const sigText=w=>w.kind+'('+w.params.map(p=>show(p)).join(', ')+')'+(res(w.ret).k==='unit'?'':' -> '+show(w.ret));
  function fnMeet(t,w,node){
    t=res(t);
    if(t.k==='any'||t.k==='never')return;
    if(t.k==='tvar')return unsup('inferred type',node.line);
    if(t.k==='ref'&&['closure','opq','param','tvar'].includes(res(t.to).k))return unsup('closure kind',node.line);
    if(!callable(t)){errors.push(RQ.diag.make('E0277',node.line,node.col,{what:'fn',text:sigText(w),type:show(t)}));return;}
    const s=sigOf(t);
    if(s.params.length!==w.params.length){errors.push(RQ.diag.make('E0593',node.line,node.col,{want:w.params.length,got:s.params.length}));return;}
    const bad=s.params.findIndex((p,i)=>!unify(p,w.params[i]));
    // rustc defers an operator on an untyped parameter (&i32 * 2 is fine), where the engine settled it on the literal's type
    if(bad>=0){if(s.params[bad].arith)unsup('inferred type',node.line);else errors.push(RQ.diag.make('E0631',node.line,node.col,{}));return;}
    if(!unify(s.ret,w.ret)){unsup('type checking',node.line);return;}
    if(t.k==='closure'){if(t.need==null||RANK[w.kind]<RANK[t.need])t.need=w.kind;}
    else if(RANK[s.kind]>RANK[w.kind])unsup('closure kind',node.line);
  }
  function closureExpr(e,exp){
    if(e.params.some(p=>p.pat.byRef||p.pat.sub))return unsup('pattern',e.line);
    const n=e.params.length;
    const wrongCount=!!exp&&exp.params.length!==n;
    let badParam=false;
    if(wrongCount)errors.push(RQ.diag.make('E0593',e.line,e.col,{want:exp.params.length,got:n}));
    const ps=e.params.map((p,i)=>{
      const v=exp&&!wrongCount?exp.params[i]:null;
      if(!p.ty)return v||fresh(p.pat.line);
      const d=tyOf(p.ty);
      if(v&&!unify(d,v)){
        badParam=true;
        // on a std adapter rustc adds a second error (E0599, E0277) for whatever uses the result
        if(exp.std)unsup('type checking',e.line);else errors.push(RQ.diag.make('E0631',e.line,e.col,{}));
      }
      return d;
    });
    const tvp=e.params.map((p,i)=>!p.ty&&(!exp||wrongCount)?res(ps[i]):null);
    tvp.forEach((v,i)=>{if(v&&v.k==='tvar'){v.cparam=e.params[i].pat;if(wrongCount)v.pendDone=true;}});
    const ret=e.ret?tyOf(e.ret):exp?exp.ret:fresh(e.line);
    const ct=T.closure(e.id,ps,ret);
    if(exp)ct.exp=exp.kind;
    const keep={r:curRet,l:loops,c:curCl,w:want};
    const cl={id:e.id,tries:[]};
    scopes.push(new Map());
    curCl=cl;curRet=ret;loops=[];want=null;
    e.params.forEach((p,i)=>bindVar(p.pat.name,p.pat.mut,'param',ps[i],p.pat));
    const bt=exW(e.body,ret);
    if(!badParam)coerce(bt,ret,endNode(e.body));
    if(res(bt).k==='any'&&res(ret).k==='tvar')res(ret).pendDone=true;
    scopes.pop();
    curRet=keep.r;loops=keep.l;curCl=keep.c;want=keep.w;
    for(const x of cl.tries)tryCheck(x.e,x.t,res(x.ret));
    if(e.move&&holdsRef(ret))return unsup('closure returning a reference',e.line);
    return ct;
  }
  const tryKind=x=>x.k==='enum'&&x.builtin?x.name:null;
  // `?` in a closure with no declared return type is judged once the body has fixed that type
  function tryCheck(e,t,rt){
    const tk=tryKind(t);
    if(!tk||hasRef(rt))return unsup('try operator',e.line);
    const ok=t.args[0];
    if(rt.k==='any'||rt.k==='never')return ok;
    const rk=tryKind(rt);
    if(!rk||rk!==tk){errors.push(RQ.diag.make('E0277',e.qline,e.qcol,{what:rk?'try-kind':'try-ret',from:tk,ret:show(rt)}));return ok;}
    if(tk==='Option')return ok;
    const [,from]=t.args,[,to]=rt.args;
    if(isOpen(from,false)||isOpen(to,false))return unsup('inferred type',e.line);
    if(unify(from,to))return ok;
    const fl=froms.get(res(to).name),hit=res(to).k!=='enum'||!res(to).builtin?fl&&fl.find(x=>unify(x.from,from)):null;
    if(hit){I(e).conv=hit.key;return ok;}
    if(noFrom(res(from),res(to)))errors.push(RQ.diag.make('E0277',e.qline,e.qcol,{what:'try-convert',to:show(to),from:show(from)}));
    else unsup('error conversion',e.line);
    return ok;
  }
  // arguments checked against the closure signatures a std method expects; sig(i,types so far) gives the signature of argument i or null
  function argsWith(e,sig){
    const ts=[];
    e.args.forEach((a,i)=>{
      const w=sig&&sig(i,ts);
      if(w&&peel(a).t==='Closure'){expSig={...w,std:true};ts.push(ex(a));return;}
      if(e.name==='zip'&&peel(a).t==='Range')rangeOk=true;
      const t=ex(a);
      if(w)fnMeet(t,w,a);
      ts.push(t);
    });
    return ts;
  }
  const rec=(key,selfKind,params,ret,from,more)=>({key,selfKind,params:params.map(ty=>({ty})),ret,from,more:more||[],builtin:true});
  const unitSig=(kind,params,ret)=>({kind,params,ret});
  const iterOf=(item,o)=>T.iter(item,o.lent,o.de,o.es);
  const peelOne=t=>{t=res(t);return t.k==='ref'?res(t.to):t;};
  const numeric=t=>['int','ivar','float','fvar'].includes(res(t).k);
  function itemOfInto(t){
    t=res(t);
    if(t.k==='iter')return t.item;
    if(t.k==='coll'&&t.name==='Vec')return t.args[0];
    if(t.k==='array')return t.el;
    if(t.k==='ref'){
      const to=res(t.to);
      if(to.k==='coll'&&to.name==='Vec')return mkRef(t.mut,to.args[0]);
      if(to.k==='array'||to.k==='slice')return mkRef(t.mut,to.el);
    }
    return null;
  }
  function resultTarget(e,hint){
    if(e.targs){
      if(e.targs.length!==1)return unsup('iterator',e.line);
      return tyOf(e.targs[0]);
    }
    return hint||fresh(e.line);
  }
  const FROMITER_TEXT=(tgt,item)=>({what:'collect',type:show(tgt),item:show(item,true)});
  function settle(p){
    const tgt=res(p.tgt),item=res(p.item),e=p.e;
    if(tgt.k==='any'||tgt.k==='never'||item.k==='any')return;
    if(tgt.k==='tvar'){
      if(p.pat){
        const b=info.get(p.pat)&&info.get(p.pat).bind;
        tgt.pendDone=true;
        errors.push(RQ.diag.make(b&&b.methodUse?'E0282':'E0283',p.pat.line,p.pat.col,{}));
      }else unsup('inferred type',e.line);
      return;
    }
    if(p.kind==='collect'){
      let ok;
      if(tgt.k==='coll'&&tgt.name==='Vec')ok=unify(tgt.args[0],item);
      else if(tgt.k==='coll'&&tgt.name==='HashMap'){
        const ti=T.tuple([tgt.args[0],tgt.args[1]]);
        ok=unify(ti,item);
        if(ok)keyChecks.push([tgt.args[0],e.line]);
      }else if(tgt.k==='String'){const i=peelOne(item);ok=['char','str','String'].includes(i.k)&&(item.k!=='ref'||i.k==='char');}
      else{unsup('iterator',e.line);return;}
      if(!ok){errors.push(RQ.diag.make('E0277',e.nline,e.ncol,FROMITER_TEXT(tgt,item)));return;}
      if(holdsRef(tgt))unsup('reference in collection',e.line);
      return;
    }
    if(!numeric(tgt)||!numeric(peelOne(item))){unsup('iterator',e.line);return;}
    if(!unify(tgt,peelOne(item)))errors.push(RQ.diag.make('E0277',e.nline,e.ncol,{what:'sum',op:p.kind,type:show(tgt),item:show(item,true)}));
  }

  function iterSpec(e,it,name,hint){
    const item=it.item,at=e.line;
    const keep={lent:it.lent,de:it.de,es:it.es};
    const fn=(kind,params,ret)=>unitSig(kind,params,ret);
    const adapt=(ret,flags,cl,more)=>({cl,build:()=>rec('Iter::'+name,'val',[T.any],iterOf(ret,flags),0,more)});
    switch(name){
      case 'map':{const B=fresh(at);return adapt(B,{lent:true,de:it.de,es:it.es},()=>fn('FnMut',[item],B),[1]);}
      case 'filter':return adapt(item,{lent:true,de:it.de,es:false},()=>fn('FnMut',[mkRef(false,item)],T.bool),[1]);
      case 'take_while':case 'skip_while':return adapt(item,{lent:true,de:false,es:false},()=>fn('FnMut',[mkRef(false,item)],T.bool),[1]);
      case 'enumerate':return {build:()=>rec('Iter::enumerate','val',[],iterOf(T.tuple([usz,item]),{lent:it.lent,de:it.de&&it.es,es:it.es}),0)};
      case 'rev':return it.de?{build:()=>rec('Iter::rev','val',[],iterOf(item,keep),0)}:{unsup:'iterator'};
      case 'take':case 'skip':return {build:()=>rec('Iter::'+name,'val',[usz],iterOf(item,{lent:it.lent,de:false,es:it.es}),0)};
      case 'zip':return {build:args=>{
        const oi=args.length===1?itemOfInto(args[0]):null;
        if(!oi)return null;
        const ot=res(args[0]);
        return rec('Iter::zip','val',[args[0]],iterOf(T.tuple([item,oi]),{lent:true,de:false,es:it.es&&(ot.k!=='iter'||ot.es)}),0,[1]);
      }};
      case 'copied':case 'cloned':{
        const r=res(item);
        if(r.k!=='ref'&&r.k!=='str')return {unsup:'iterator'};
        const to=r.k==='str'?r:res(r.to);
        if(!has(to,name==='copied'?'Copy':'Clone'))return {unsup:'iterator'};
        return {build:()=>rec('Iter::'+name,'val',[],iterOf(to,keep),0)};
      }
      case 'count':return {build:()=>rec('Iter::count','val',[],usz,-1)};
      case 'last':return {build:()=>rec('Iter::last','val',[],optTy(item),hasRef(item)?0:-1)};
      case 'next':return {build:()=>({...rec('Iter::next','&mut',[],optTy(item),-1),inner:hasRef(item)})};
      case 'min':case 'max':return {build:()=>{
        const i=res(item);
        if(!isOpen(i,false)&&!has(i,'Ord')){errors.push(RQ.diag.make('E0277',e.nline,e.ncol,{what:'bound',trait:'Ord',type:show(ordLeaf(i.k==='ref'?i.to:i))}));return rec('Iter::'+name,'val',[],optTy(item),-1);}
        return rec('Iter::'+name,'val',[],optTy(item),hasRef(item)?0:-1);
      }};
      case 'any':case 'all':return {cl:()=>fn('FnMut',[item],T.bool),build:()=>rec('Iter::'+name,'&mut',[T.any],T.bool,-1)};
      case 'position':return {cl:()=>fn('FnMut',[item],T.bool),build:()=>rec('Iter::position','&mut',[T.any],optTy(usz),-1)};
      case 'find':return {cl:()=>fn('FnMut',[mkRef(false,item)],T.bool),build:()=>({...rec('Iter::find','&mut',[T.any],optTy(item),-1),inner:hasRef(item)})};
      case 'for_each':return {cl:()=>fn('FnMut',[item],T.unit),build:()=>rec('Iter::for_each','val',[T.any],T.unit,-1)};
      case 'fold':return {cl:(i,ts)=>i===1?fn('FnMut',[ts[0],item],ts[0]):null,build:args=>hasRef(args[0])?null:rec('Iter::fold','val',[args[0],T.any],args[0],-1)};
      case 'sum':case 'product':case 'collect':return {build:()=>{
        const tgt=resultTarget(e,hint);
        if(res(tgt).k==='tvar')res(tgt).pendTgt=true;
        if(name==='collect'&&hasRef(tgt))return null;
        pend.push({kind:name,e,tgt,item,pat:peel(e)===letInit?letPat:null});
        return rec('Iter::'+name,'val',[],tgt,-1);
      }};
    }
    return {unsup:'iterator'};
  }
  function srcSpec(e,r,base,name){
    const isRef=r.k==='ref',mut=isRef&&r.mut;
    if(e.args.length)return null;
    const lend=(sk,item,flags)=>({build:()=>rec('Src::'+name,sk,[],iterOf(item,{lent:true,...flags}),isRef||sk!=='val'?0:-1)});
    if(base.k==='String'||base.k==='str'){
      if(name!=='chars')return null;
      return lend('&',T.char,{de:true,es:false});
    }
    if(base.k==='array'||base.k==='slice'){
      const el=base.el;
      if(name==='iter')return lend('&',mkRef(false,el),{de:true,es:true});
      if(name==='iter_mut')return lend('&mut',mkRef(true,el),{de:true,es:true});
      if(name==='into_iter'){
        if(isRef)return lend(mut?'&mut':'&',mkRef(mut,el),{de:true,es:true});
        if(base.k==='slice')return null;
        return {build:()=>rec('Src::into_iter','val',[],iterOf(el,{lent:false,de:true,es:true}),-1)};
      }
      return null;
    }
    if(base.k!=='coll')return null;
    const [k,v]=base.args,vec=base.name==='Vec',fl={de:vec,es:true};
    const pair=(a,b)=>T.tuple([a,b]);
    switch(name){
      case 'iter':return lend('&',vec?mkRef(false,k):pair(mkRef(false,k),mkRef(false,v)),fl);
      case 'iter_mut':return lend('&mut',vec?mkRef(true,k):pair(mkRef(false,k),mkRef(true,v)),fl);
      case 'into_iter':
        if(isRef)return lend(mut?'&mut':'&',vec?mkRef(mut,k):pair(mkRef(false,k),mkRef(mut,v)),fl);
        return {build:()=>rec('Src::into_iter','val',[],iterOf(vec?k:pair(k,v),{lent:false,...fl}),-1)};
      case 'keys':return vec?null:lend('&',mkRef(false,k),fl);
      case 'values':return vec?null:lend('&',mkRef(false,v),fl);
      case 'values_mut':return vec?null:lend('&mut',mkRef(true,v),fl);
    }
    return null;
  }
  function closureSpec(e,r,base,name){
    const at=e.line,fn=unitSig;
    const seqEl=base.k==='array'||base.k==='slice'?base.el:base.k==='coll'&&base.name==='Vec'?base.args[0]:null;
    if(seqEl&&SORT_BY.includes(name)&&!(name.endsWith('_by')&&nameTaken('Ordering'))){
      const keyed=name.endsWith('_key'),K=keyed?fresh(at):null;
      return {cl:()=>keyed?fn('FnMut',[mkRef(false,seqEl)],K):fn('FnMut',[mkRef(false,seqEl),mkRef(false,seqEl)],ordTy),build:()=>{
        if(keyed){
          if(hasRef(K))return null;
          if(!isOpen(K,false)&&!has(K,'Ord'))errors.push(RQ.diag.make('E0277',e.nline,e.ncol,{what:'bound',trait:'Ord',type:show(K)}));
        }
        return rec('Vec::'+name,'&mut',[T.any],T.unit,-1);
      }};
    }
    if(base.k==='coll'){
      const [k,v]=base.args;
      if(name==='retain'){
        const vec=base.name==='Vec';
        return {cl:()=>fn('FnMut',vec?[mkRef(false,k)]:[mkRef(false,k),mkRef(true,v)],T.bool),build:()=>rec(base.name+'::retain','&mut',[T.any],T.unit,-1)};
      }
      if(base.name==='HashMap'&&name==='entry.or_insert_with'&&(isOpen(k,true)||has(k,'Eq')&&has(k,'Hash')))
        return {cl:i=>i===1?fn('FnOnce',[],v):null,build:()=>{
          if(isOpen(k,true))keyChecks.push([k,at]);
          return rec('HashMap::entry.or_insert_with','&mut',[k,T.any],mkRef(true,v),0);
        }};
      return null;
    }
    if(!base.builtin)return null;
    if(base.name==='Ordering')return name==='then_with'?{cl:()=>fn('FnOnce',[],ordTy),build:()=>rec('Ordering::then_with','val',[T.any],ordTy,-1)}:null;
    const opt=base.name==='Option',[a,b]=base.args;
    const val=(cl,ret,params)=>({cl,build:()=>hasRef(ret)?null:rec((opt?'Option::':'Result::')+name,'val',params||[T.any],ret,-1)});
    if(opt){
      switch(name){
        case 'map':{const B=fresh(at);return val(()=>fn('FnOnce',[a],B),optTy(B));}
        case 'and_then':{const B=fresh(at);return val(()=>fn('FnOnce',[a],optTy(B)),optTy(B));}
        case 'unwrap_or_else':return val(()=>fn('FnOnce',[],a),a);
        case 'filter':return val(()=>fn('FnOnce',[mkRef(false,a)],T.bool),optTy(a));
        case 'is_some_and':return val(()=>fn('FnOnce',[a],T.bool),T.bool);
        case 'ok_or_else':{const E=fresh(at);return val(()=>fn('FnOnce',[],E),resTy(a,E));}
        case 'map_or':return {cl:(i,ts)=>i===1?fn('FnOnce',[a],ts[0]):null,build:args=>hasRef(args[0])?null:rec('Option::map_or','val',[args[0],T.any],args[0],-1)};
      }
      return null;
    }
    switch(name){
      case 'map':{const B=fresh(at);return val(()=>fn('FnOnce',[a],B),resTy(B,b));}
      case 'map_err':{const F=fresh(at);return val(()=>fn('FnOnce',[b],F),resTy(a,F));}
      case 'and_then':{const B=fresh(at);return val(()=>fn('FnOnce',[a],resTy(B,b)),resTy(B,b));}
      case 'unwrap_or_else':return val(()=>fn('FnOnce',[b],a),a);
    }
    return null;
  }
  function stdSpec(e,r,base,hint){
    const name=e.name;
    if(base.k==='iter')return iterSpec(e,base,name,hint);
    const src=['iter','iter_mut','into_iter','keys','values','values_mut','chars'].includes(name)?srcSpec(e,r,base,name):null;
    if(src)return src;
    if(base.k==='coll'||base.builtin||base.k==='array'||base.k==='slice')return closureSpec(e,r,base,name);
    return null;
  }
  function callValue(e){
    const c=peel(e.callee);
    let ty;
    if(c.t==='Path'){
      if(c.segs.length!==1||c.segs[0].args||c.global)return null;
      const b=lookup(c.segs[0].name);
      if(!b||!callable(b.ty))return null;
      varUses++;I(c).bind=b;I(c).ty=b.ty;ty=b.ty;
    }else if(c.t==='Call'||c.t==='Closure'){
      ty=ex(c);
      if(!callable(ty)){e.args.forEach(ex);return unsup('call',e.line);}
    }else return null;
    const s=sigOf(ty),ts=e.args.map(ex);
    if(ts.length!==s.params.length){errors.push(RQ.diag.make('E0057',e.line,e.col,{want:s.params.length,got:ts.length}));return T.any;}
    ts.forEach((t,i)=>{
      const n=errors.length;
      coerce(t,s.params[i],e.args[i]);
      // the first call fixes an untyped parameter that an operator used, and rustc then reports a mismatch inside the body, not at the call
      if(s.params[i].arith&&!s.params[i].called&&errors.length>n){errors.length=n;unsup('inferred type',e.line);}
      s.params[i].called=true;
    });
    if(holdsRef(s.ret))return unsup('closure returning a reference',e.line);
    I(e).cc={kind:s.kind};
    return s.ret;
  }
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
        const [tn,cn]=e.segs.map(g=>g.name);
        if(e.segs.length===2&&RQ.types.isInt(tn)&&(cn==='MIN'||cn==='MAX')&&!adtRec(tn)){I(e).ic={ty:tn,max:cn==='MAX'};return T.int(tn);}
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
        if(e.op==='-'&&r.k==='int'&&!RQ.types.isSigned(r.ty)){errors.push(RQ.diag.make('E0600',e.line,e.col,{type:r.ty}));return t;}
        if(e.op==='-'&&r.k==='ivar')negs.push([e,t,r]);
        if(e.op==='-')return r.k==='int'&&RQ.types.isSigned(r.ty)||r.k==='ivar'||r.k==='float'||r.k==='fvar'||r.k==='any'?t:unsup('type checking',e.line);
        if(r.k==='int'||r.k==='ivar')return t;
        return unify(t,T.bool)?t:unsup('type checking',e.line);
      }
      case 'Binary':{
        let a=ex(e.lhs);
        if(COMPARE.has(e.op)){negFree(e.lhs);negOk(e.rhs,a);}
        else if(ARITH.has(e.op)||e.op==='<<'||e.op==='>>'){negFree(e.lhs);negFree(e.rhs);}
        let b=ex(e.rhs);
        const op=e.op;
        if(op==='&&'||op==='||')return unify(a,T.bool)&&unify(b,T.bool)?T.bool:unsup('type checking',e.line);
        if(op==='<<'||op==='>>'){
          // the shift amount is any integer type and does not meet the left side: the result has the left side's type
          const x=res(a),y=res(b),isI=r=>r.k==='int'||r.k==='ivar';
          if(['any','never'].includes(x.k)||['any','never'].includes(y.k))return T.any;
          if(isI(x)&&isI(y))return a;
          if(['float','fvar','bool','char'].includes(x.k)&&isI(y)){errors.push(RQ.diag.make('E0369',e.oline,e.ocol,{op,type:show(a)}));return T.any;}
          return unsup('type checking',e.line);
        }
        const SCALAR=['int','ivar','float','fvar','bool','char'];
        if(op==='+'&&(res(a).k==='str'||res(a).k==='ref'&&res(res(a).to).k==='String')&&(SCALAR.includes(res(b).k)||res(b).k==='str'||res(b).k==='ref'&&res(res(b).to).k==='String')){
          errors.push(RQ.diag.make('E0369',e.oline,e.ocol,{op,type:show(a),right:show(b)}));
          return T.any;
        }
        if(op==='+'&&res(a).k==='String'){
          const rb=res(b);
          if(SCALAR.includes(rb.k)){mism(T.str,b,e.rhs);return T.string;}
          // String + &str and String + &String (deref coercion) move the left String and give it back; other right sides are not judged
          return rb.k==='str'||rb.k==='ref'&&res(rb.to).k==='String'?T.string:unsup('string concatenation',e.line);
        }
        // a comparison needs the same number of references on both sides: rustc reports E0277 for == and != and E0308 for the order operators
        if(COMPARE.has(op)){
          const depth=t=>{let n=0;t=res(t);while(t.k==='ref'){n++;t=res(t.to);}return [n,t];};
          const [da,ca]=depth(a),[db,cb]=depth(b);
          if((da||db)&&numeric(ca)&&numeric(cb)){
            if(da!==db){
              if(op==='=='||op==='!=')errors.push(RQ.diag.make('E0277',e.oline,e.ocol,{what:'cmp',left:show(a,true),right:show(b,true)}));
              else mism(a,b,e.rhs);
              return T.bool;
            }
            if(da>1){if(!unify(ca,cb))mism(a,b,e.rhs);return T.bool;}
          }
        }
        // a shared reference to a number works like the number in arithmetic, and two of them compare like the numbers they point at
        const num=t=>{const r=res(t);return r.k==='ref'&&!r.mut&&['int','ivar','float','fvar'].includes(res(r.to).k)?r.to:null;};
        const na=num(a),nb=num(b);
        if(na||nb){
          if(!(COMPARE.has(op)?na&&nb:true)||!unify(na||a,nb||b))return unsup('type checking',e.line);
          a=na||a;b=nb||b;
        }
        for(const x of [a,b])if(x.k==='tvar'&&x.cparam)x.arith=true;
        if(!operands(a,b,e))return COMPARE.has(op)?T.bool:a;
        const u=res(a).k==='any'?b:a;
        let core=res(u);
        while(core.k==='ref')core=res(core.to);
        const c=core.k==='param'?'param':cls(u);
        if(c==='tvar'&&core.cparam&&(COMPARE.has(op)||ARITH.has(op)))return COMPARE.has(op)?T.bool:u;
        if(c==='param'||ARITH.has(op)&&(c==='struct'||c==='enum'&&!res(u).builtin)){
          if(c==='param'&&res(u).k==='ref'&&ARITH.has(op))return unsup('type checking',e.line);
          if(!COMPARE.has(op)&&!ARITH.has(op))return unsup('type checking',e.line);
          if(COMPARE.has(op)&&meets(core,op==='=='||op==='!='?'PartialEq':'PartialOrd'))return T.bool;
          errors.push(RQ.diag.make('E0369',e.oline,e.ocol,{op,type:show(u),param:c==='param'}));
          return COMPARE.has(op)?T.bool:T.any;
        }
        if(c==='struct'||c==='enum'||c==='coll'){
          if(!COMPARE.has(op)||isOpen(u))return unsup(isOpen(u)?'inferred type':'type checking',e.line);
          if(has(u,op==='=='||op==='!='?'PartialEq':'PartialOrd'))return T.bool;
          errors.push(RQ.diag.make('E0369',e.oline,e.ocol,{op,type:show(u)}));
          return T.bool;
        }
        if(COMPARE.has(op))return ['num','bool','char','str','any'].includes(c)?T.bool:unsup('type checking',e.line);
        if(ARITH.has(op))return c==='num'||c==='any'?u:unsup('type checking',e.line);
        if(op==='&'||op==='|'||op==='^')return ['int','ivar','bool','any'].includes(res(u).k)?u:unsup('type checking',e.line);
        return unsup(op,e.line);
      }
      case 'Assign':{
        const lb=e.op==='='&&e.lhs.t==='Path'&&e.lhs.segs.length===1&&lookup(e.lhs.segs[0].name);
        if(lb)negOk(e.rhs,lb.ty);
        else if(e.op!=='=')negFree(e.rhs);
        const r=ex(e.rhs);
        let ty;
        if(e.lhs.t==='Deref'){
          // *r = v writes through a &mut; through a & it is E0594, which is not modeled
          ty=ex(e.lhs);
          const rt=res(info.get(e.lhs.expr).ty);
          if(rt.k==='ref'&&!rt.mut)return unsup('assignment target',e.line);
          if(rt.k!=='ref')return T.any;
        }else if(inIndex(e.lhs)){
          ty=ex(e.lhs);
          const steps=[];
          for(let b=peel(e.lhs);b.t==='Index'||b.t==='Field';b=peel(b.expr))steps.unshift(b);
          const first=steps.findIndex(x=>x.t==='Index'),vecAt=steps.findIndex(x=>x.t==='Index'&&I(x).vecIdx);
          const b=peel(steps[first].expr);
          const ch=b.t==='Path'||b.t==='Field'?chainOf(b):null,bd=ch&&lookup(ch.name);
          const holdsRef=steps.slice(first+1).some(x=>res(info.get(x.expr)&&info.get(x.expr).ty||T.any).k==='ref');
          if(!ch||!bd||holdsRef)return res(ty).k==='any'?T.unit:unsup('assignment target',e.line);
          const bt=res(info.get(b)&&info.get(b).ty||T.any),viaRef=ch.via||bt.k==='ref'&&!ch.parts.length;
          const shared=ch.via?!ch.via.mut:viaRef&&!bt.mut,locked=vecAt<0&&!viaRef&&!bd.mut;
          // inside a closure the message names a captured variable, which is not modeled
          if(bd.cl!==curCl&&(shared||locked))return unsup('assignment target',e.line);
          const tail=to=>steps.slice(first,to).map(x=>x.t==='Index'?'[_]':'.'+x.name).join('');
          // E0594 and E0596 are borrowck errors, like E0384: the borrow pass still runs beside them
          if(vecAt<0){
            if(shared)errors.push(RQ.diag.make('E0594',e.line,e.col,{name:ch.text+tail(),ref:true}));
            else if(locked)errors.push(RQ.diag.make('E0594',e.line,e.col,{name:ch.text+tail(),root:ch.name}));
          }else if(shared)errors.push(RQ.diag.make('E0596',e.line,e.col,{name:bt.k==='ref'&&!ch.parts.length&&vecAt===first?'*'+ch.name:ch.text+tail(vecAt),ref:true}));
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
          if(!b.mut&&!b.deferred)errors.push(b.cl!==curCl?RQ.diag.make('E0594',e.line,e.col,{name:n,plain:true}):RQ.diag.make('E0384',e.line,e.col,{name:n,kind:b.kind}));
          ty=b.ty;
        }
        if(e.op!=='='){
          const op=e.op.slice(0,-1);
          if(op==='<<'||op==='>>'){
            const x=res(ty),y=res(r),isI=t=>t.k==='int'||t.k==='ivar'||t.k==='any';
            return isI(x)&&isI(y)?T.unit:unsup('type checking',e.line);
          }
          if(op==='+'&&res(ty).k==='String')return unsup('string concatenation',e.line);
          const rt=res(r),rn=rt.k==='ref'&&!rt.mut&&numeric(res(rt.to))?rt.to:r;
          if(!operands(ty,rn,{rhs:e.rhs,line:e.line}))return T.unit;
          const bit=op==='&'||op==='|'||op==='^',c=cls(ty);
          if(!(c==='any'||(bit?['int','ivar','bool'].includes(res(ty).k):c==='num')))unsup('type checking',e.line);
        }else if(!unify(ty,r)){
          const w=res(ty),g=res(r);
          return unsup(w.k==='str'&&g.k==='ref'&&!g.mut&&res(g.to).k==='String'?'assigned string reference':'type checking',e.line);
        }
        return T.unit;
      }
      case 'Call':{
        const cv=callValue(e);
        if(cv!==null)return cv;
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
        if(sg.length===2&&COLL[sg[0].name]&&!adtRec(sg[0].name)&&sg[1].name==='new'&&noArgs(e.callee)){
          const name=sg[0].name;
          e.args.forEach(ex);
          if(name==='HashMap'&&!mapUse)return unsup('HashMap',e.line);
          if(e.args.length)return unsup('wrong argument count',e.line);
          const ty=T.coll(name,Array.from({length:COLL[name]},()=>fresh(e.line)));
          I(e).sig={params:[],ret:ty};
          return ty;
        }
        const ct=e.callee.t==='Path'?ctorOf(e.callee):null;
        if(ct){
          const ts=e.args.map((a,i)=>(ct.kind==='tuple'&&ct.fields[i]&&negOk(a,ct.fields[i].ty),ex(a)));
          if(ct.kind!=='tuple')return unsup('call',e.line);
          if(ts.length!==ct.fields.length)return unsup('wrong argument count',e.line);
          ts.forEach((t,i)=>coerce(t,ct.fields[i].ty,e.args[i]));
          I(e).ctor={adt:ct.name,variant:ct.vi};
          return ct.ty;
        }
        if(e.callee.t==='Path'&&sg.length===2&&noArgs(e.callee)){
          let owner=sg[0].name==='Self'?curSelf:sg[0].name,m=methods.get(owner)&&methods.get(owner).get(sg[1].name);
          const ts=e.args.map(ex),via=traits.get(owner);
          if(via&&!via.builtin){
            const tm=via.methods.get(sg[1].name);
            let a=ts.length&&res(ts[0]);
            while(a&&a.k==='ref')a=res(a.to);
            if(!tm||!tm.selfKind||!a||a.k!=='struct'&&!(a.k==='enum'&&!a.builtin))return unsup('path call',e.line);
            if(!implsTrait(a,via.name)){errors.push(RQ.diag.make('E0277',e.args[0].line,e.args[0].col,{what:'bound',trait:via.name,type:show(a)}));return T.any;}
            owner=a.name;m=methods.get(owner).get(sg[1].name);
          }
          if(!m&&sg[1].name==='from'&&adtRec(owner)&&ts.length===1){
            const fl=froms.get(owner),hit=fl&&fl.find(x=>unify(x.from,ts[0]));
            if(hit){I(e).sig={params:[hit.from],ret:adtTy(owner),key:hit.key};return adtTy(owner);}
            if(unify(adtTy(owner),ts[0]))return unsup('call',e.line);
            if(fl&&fl.length)errors.push(RQ.diag.make('E0277',e.args[0].line,e.args[0].col,{what:'bound',type:owner,trait:'From<'+show(ts[0],true)+'>'}));
            else mism(adtTy(owner),ts[0],e.args[0]);
            return adtTy(owner);
          }
          if(m){
            if(m.key.endsWith('::drop')&&drops.has(owner))return unsup('call',e.line);
            if(m.pattern)m=openImpl(m,sg[1].line,e.callee.col,null);
            const gi=m.tps.length?instantiate(m,e.line,e.args.slice(m.selfTy?1:0),e.callee):null;
            const params=(m.selfTy?[m.selfTy]:[]).concat(gi?gi.params:m.params.map(q=>q.ty)),ret=gi?gi.ret:m.ret;
            if(ts.length!==params.length)return unsup('wrong argument count',e.line);
            ts.forEach((t,i)=>coerce(t,params[i],e.args[i]));
            if(gi)gi.meet();
            I(e).sig={params,ret,from:m.from,more:m.more,key:m.key};
            return ret;
          }
          if(adtRec(owner)&&sg[1].name==='default'&&adtRec(owner).tps.length&&adtRec(owner).der.includes('Default'))return unsup('derive',e.line);
          if(adtRec(owner)&&sg[1].name==='default'&&has(adtTy(owner),'Default')){
            if(ts.length)return unsup('wrong argument count',e.line);
            const ty=adtTy(owner);
            I(e).sig={params:[],ret:ty};I(e).dflt=ty;
            return ty;
          }
          if(adtRec(owner)){errors.push(RQ.diag.make('E0599',sg[1].line,e.callee.col,{what:'item',name:sg[1].name,type:owner,kind:structs.has(owner)?'struct':'enum'}));return T.any;}
          return unsup('path call',e.line);
        }
        if(e.callee.t!=='Path'||e.callee.segs.length!==1||e.callee.segs[0].args||e.callee.global){e.args.forEach(ex);return unsup(e.callee.t==='Path'?'path call':'call',e.line);}
        const n=e.callee.segs[0].name,f=fns.get(n);
        const gi=f&&f.tps.length&&f.params.length===e.args.length?instantiate(f,e.line,e.args,e.callee):null;
        const ts=e.args.map((a,i)=>{
          const w=gi&&gi.fnw[i];
          if(!w)return exW(a,gi?gi.params[i]:f&&f.params.length===e.args.length?f.params[i].ty:null);
          if(peel(a).t==='Closure'){expSig=w;return ex(a);}
          const t=ex(a);fnMeet(t,w,a);return t;
        });
        const lb=lookup(n);
        if(lb&&['int','ivar','float','fvar','bool','char','String','str','unit','tuple','array','struct','enum','coll'].includes(res(lb.ty).k)){errors.push(RQ.diag.make('E0618',e.callee.line,e.callee.col,{name:n,type:show(lb.ty)}));return T.any;}
        if(lb||consts.has(n))return unsup('call',e.line);
        if(!f&&n==='drop'){
          if(ts.length!==1)return unsup('wrong argument count',e.line);
          I(e).sig={params:ts,ret:T.unit};
          return T.unit;
        }
        if(!f)return unknown(n,e.callee);
        if(ts.length!==f.params.length)return unsup('wrong argument count',e.line);
        ts.forEach((t,i)=>coerce(t,gi?gi.params[i]:f.params[i].ty,e.args[i]));
        if(gi)gi.meet();
        I(e).sig={params:gi?gi.params:f.params.map(p=>p.ty),ret:gi?gi.ret:f.ret,from:f.from,more:f.more};
        return gi?gi.ret:f.ret;
      }
      case 'Ref':{
        const sx=peel(e.expr);
        if(e.mut&&guardRoot&&scrutRoot(sx)===guardRoot)guardBorrow(sx,e.line,e.col);
        if(sx.t==='Index'&&peel(sx.index).t==='Range')return slice(e,sx);
        const t=ex(e.expr),r=res(t);
        if(r.k==='ref'||r.k==='str')return unsup('reference to reference',e.line);
        return mkRef(e.mut,t);
      }
      case 'Deref':{
        const t=ex(e.expr),r=res(t),x=peel(e.expr);
        if(x.t==='Path'&&info.get(x).bind)I(e).bind=info.get(x).bind;
        if(e.pat){
          // an `&` or `&mut` pattern is matched against the reference itself, so a value of another type is E0308
          if(r.k==='any'||r.k==='never')return T.any;
          if(r.k!=='ref'||r.mut!==e.pat.mut){errors.push(RQ.diag.make('E0308',e.line,e.col,{expected:show(t),found:e.pat.mut?'&mut _':'&_'}));return T.any;}
        }
        if(r.k==='ref')return r.to;
        return r.k==='any'||r.k==='never'?T.any:unsup('dereference',e.line);
      }
      case 'MethodCall':{
        const hint=['collect','sum','product'].includes(e.name)?takeWant():null;
        if(peel(e.recv).t==='Range')rangeOk=true;
        if(e.recv!==reuse)lendRange(e);
        const rt=e.recv===reuse?(reuse=null,info.get(e.recv).ty):ex(e.recv),r=res(rt);
        if(r.k==='tvar'&&(r.cparam||r.pendTgt)){
          e.args.forEach(ex);
          if(r.cparam){if(!r.pendDone)errors.push(RQ.diag.make('E0282',r.cparam.line,r.cparam.col,{}));r.pendDone=true;}
          else{const p=peel(e.recv),b=p.t==='Path'&&info.get(p)&&info.get(p).bind;if(b)b.methodUse=true;}
          return T.any;
        }
        const adt0=r.k==='ref'?res(r.to):r;
        if(e.name==='push'&&adt0.k==='coll'&&adt0.name==='Vec'&&e.args.length===1)negOk(e.args[0],adt0.args[0]);
        const spec=r.k==='any'||r.k==='never'?null:stdSpec(e,r,adt0,hint);
        if(spec){
          if(spec.unsup)return unsup(spec.unsup,e.line);
          const sa=argsWith(e,spec.cl);
          return adtMethod(e,r,adt0,sa,spec);
        }
        const args=e.args.map(ex);
        if(r.k==='any'||r.k==='never')return T.any;
        if(adt0.k==='iter')return unsup('iterator',e.line);
        if(e.name==='into'&&!args.length&&r.k!=='ref'){
          const tgt=fresh(e.line);
          intos.push({e,src:rt,tgt});
          return tgt;
        }
        const adt=r.k==='ref'?res(r.to):r;
        if(adt.k==='struct'||adt.k==='enum'||adt.k==='coll'||adt.k==='param'||SEQ_METHODS.includes(e.name)&&(adt.k==='array'||adt.k==='slice')||e.name==='to_string'&&!args.length&&['int','ivar','float','fvar','bool','char'].includes(adt.k)||CMPS.includes(e.name)&&!nameTaken('Ordering')&&['int','ivar','float','fvar','bool','char','unit','String','str','tuple','array','slice','ref'].includes(adt.k))return adtMethod(e,r,adt,args,null);
        // o owned String, r &String, m &mut String, s &str
        const seq=r.k==='array'?r:r.k==='ref'&&['array','slice'].includes(res(r.to).k)?res(r.to):null;
        if((e.name==='len'||e.name==='is_empty')&&seq&&(seq.k==='slice'||isCopy(seq))){
          if(args.length)return unsup('wrong argument count',e.line);
          I(e).recv={method:e.name,kind:peel(e.recv).t==='Path'?'refvar':'temp',adj:'val'};
          return e.name==='len'?T.int('usize'):T.bool;
        }
        const shape=r.k==='String'?'o':r.k==='str'?'s':r.k==='ref'?(res(r.to).k==='String'?(r.mut?'m':'r'):res(r.to).k==='str'?'s':''):'';
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
        if(e.name==='panic'){format(e);return T.never;}
        if(e.name==='write'||e.name==='writeln'){
          const d=res(ex(e.args[0]));
          if(d.k==='any')return T.any;
          if(!(d.k==='ref'&&d.mut&&res(d.to).k==='fmtr'))return unsup(e.name+'!',e.line);
          format({...e,name:e.name==='write'?'print':'println',args:e.args.slice(1)});
          return fmtResult();
        }
        if(e.name==='vec'&&!e.named.length)return vecMacro(e);
        e.args.forEach(ex);
        return unsup(e.name+'!',e.line);
      }
      case 'Block':return block(e,takeWant());
      case 'Try':{
        const t=res(ex(e.expr)),rt=res(curRet);
        if(t.k==='any'||t.k==='never')return T.any;
        if(rt.k==='tvar'&&curCl&&tryKind(t)){curCl.tries.push({e,t,ret:curRet});return t.args[0];}
        return tryCheck(e,t,rt);
      }
      case 'Return':{
        if(!e.expr){if(!unify(T.unit,curRet))unsup('type checking',e.line);return T.never;}
        if(coerce(exW(e.expr,curRet),curRet,e.expr)&&curStatic)staticLeaves(e.expr);
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
        if(b.k==='ref'&&res(b.to).k==='slice')return unify(i,T.int('usize'))?res(b.to).el:unsup('type checking',e.line);
        const cb=b.k==='ref'?res(b.to):b;
        if(cb.k==='coll'){
          if(cb.name!=='Vec')return unsup('map index',e.line);
          if(!unify(i,T.int('usize')))return unsup('collection method',e.line);
          I(e).vecIdx=true;return cb.args[0];
        }
        if(cb.k!=='array'||!unify(i,T.int('usize')))return unsup('type checking',e.line);
        I(e).alen=cb.n;return cb.el;
      }
      case 'Field':{
        let b=res(ex(e.expr));
        const b0=b;
        if(b.k==='any'||b.k==='never')return T.any;
        // a field of a reference to a struct reads through it; only the `self` of a Drop impl is one
        while(b.k==='ref'&&['struct','tuple','ref'].includes(res(b.to).k))b=res(b.to);
        if(b.k==='struct'){
          const f=fieldsOf(b).find(x=>x.name===e.name);
          if(!f){errors.push(RQ.diag.make('E0609',e.nline||e.line,e.ncol||e.col,{name:e.name,type:show(b0,true)}));return T.any;}
          return placeChain(e.expr)?f.ty:unsup('field of a temporary',e.line);
        }
        const i=/^\d+$/.test(e.name)?Number(e.name):-1;
        if(b.k==='tuple'){
          if(i>=0&&i<b.els.length)return b.els[i];
          errors.push(RQ.diag.make('E0609',e.nline||e.line,e.ncol||e.col,{name:e.name,type:show(b0,true)}));return T.any;
        }
        return unsup('field access',e.line);
      }
      case 'Cast':return cast(e);
      case 'StructLit':{
        const ct=e.path.t==='Path'?ctorOf(e.path):null;
        const ts=e.fields.map(f=>{
          const d=ct&&ct.kind==='named'&&ct.fields.find(x=>x.name===f.name);
          if(d)negOk(f.expr,d.ty);
          return ex(f.expr);
        });
        // a missing, repeated or unknown field (E0063, E0062, E0560) and `..base` are not modeled
        if(!ct||ct.kind!=='named'||e.base||e.fields.length!==ct.fields.length||e.fields.some(f=>!ct.fields.some(x=>x.name===f.name))||new Set(e.fields.map(f=>f.name)).size!==e.fields.length)return unsup('struct literal',e.line);
        e.fields.forEach((f,i)=>coerce(ts[i],ct.fields.find(x=>x.name===f.name).ty,f.expr));
        I(e).ctor={adt:ct.name,variant:ct.vi};
        return ct.ty;
      }
      case 'Match':return matchExpr(e);
      case 'If':{
        const w=e.els?takeWant():(takeWant(),null);
        expect(ex(e.cond),T.bool,e.cond);
        const a=block(e.then,w);
        if(!e.els){return ['unit','never','any'].includes(res(a).k)?T.unit:unsup('type checking',e.line);}
        const b=e.els.t==='If'?exW(e.els,w):block(e.els,w);
        if(w){
          if(res(a).k!=='never')coerce(a,w,endNode(e.then));
          if(res(b).k!=='never')coerce(b,w,endNode(e.els));
          return w;
        }
        if(!unify(a,b)){
          // rustc coerces each arm to an annotation the arms are not yet checked against, so a clash between references is not a verdict
          if(!clashes(b,a))return unsup('reference coercion',e.line);
          mism(a,b,endNode(e.els),'else');return a;
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
        const pt=e.pat,named=pt.t==='IdentPat';
        const it=peel(e.iter);let el=T.any;
        if(it.t==='Range'&&it.from&&it.to){
          const a=ex(it.from),b=ex(it.to);
          if(!unify(a,b)||!['int','ivar','any'].includes(res(a).k))unsup('type checking',it.line);else el=a;
        }else el=forItems(e,it);
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
      case 'Closure':{const w=expSig;expSig=null;return closureExpr(e,w);}
      case 'Range':{
        const ok=rangeOk;
        rangeOk=false;
        if(!ok||!e.from||!e.to)return unsup('range expression',e.line);
        const a=ex(e.from),b=ex(e.to);
        if(!unify(a,b)||!['int','ivar','any'].includes(res(a).k))return unsup('type checking',e.line);
        return T.iter(a,false,true,false);
      }
      default:return unsup(EXPR[e.t]||e.t,e.line);
    }
  }

  let curFn=null;
  function fnBody(f){
    if(!f.node.body)return;
    curFn=f;
    scopes=[new Map()];curRet=f.ret;loops=[];tparams=f.tmap||null;opqCl=0;
    if(f.reg)I(f.node).reg=f.reg;
    if(f.node.name==='main'&&f.node.ret){
      const m=res(f.ret);
      if(!(m.k==='enum'&&m.builtin&&m.name==='Result'&&res(m.args[0]).k==='unit'&&!isOpen(m.args[1],false)&&has(m.args[1],'Debug')))unsup('main signature',f.node.line);
    }
    const r=f.node.ret;curStatic=!!r&&r.t==='Ref'&&r.lt==='static';
    if(f.selfTy)bindVar('self',f.selfMut,'param',f.selfTy,f.node.selfParam);
    for(const p of f.params)bindVar(p.name,p.mut,'param',p.ty,p.pat);
    const body=f.node.body,t=block(body,f.node.ret?f.ret:null);
    if(body.tail||f.node.ret){if(coerce(t,f.ret,body.tail?endNode(body.tail):f.node.ret)&&curStatic&&body.tail)staticLeaves(body.tail);}
    else if(!unify(t,f.ret))unsup('type checking',f.node.line);
    finish();
  }
  // rustc runs only const fn in a const, so a call to a plain fn there is E0015; the quest allows literals and maths on other consts
  const constOk=e=>e.t==='Lit'||e.t==='Path'||((e.t==='Paren'||e.t==='Unary')&&constOk(e.expr))||(e.t==='Binary'&&constOk(e.lhs)&&constOk(e.rhs));
  inBody=true;
  for(const f of fns.values())fnBody(f);
  for(const [owner,mm] of methods){
    curSelf=owner;
    for(const m of mm.values())if(!m.dflt){curSelfTy=m.pattern||null;fnBody(m);}
  }
  curSelf=null;curSelfTy=null;
  for(const m of fromImpls){curSelf=m.owner;fnBody(m);}
  curSelf=null;
  for(const tr of traits.values())for(const m of tr.methods.values()){
    if(!m.hasBody)continue;
    selfPar=m.selfPar;
    fnBody(m);
  }
  selfPar=null;tparams=null;
  for(const c of consts.values()){
    scopes=[new Map()];loops=[];
    if(!c.node.init){unsup('deferred initialization',c.node.line);continue;}
    if(!constOk(c.node.init)){unsup('const initializer',c.node.line);continue;}
    negOk(c.node.init,c.ty);
    expect(ex(c.node.init),c.ty,c.node.init);
    finish();
  }
  return {errors,unsupported:un,shadows,shadowUses,varUses,info,adts:{structs,enums,methodNodes}};
};
})();
