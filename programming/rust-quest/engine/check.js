/* Anything outside what is modeled is listed as unsupported, never guessed at, so a program is only judged when every
   construct in it is modeled. Types are inferred with unify; the resolved type of every literal, the binding behind every
   name and the length behind every index go into `info` (a Map from node) for lint.js and the interpreter. DOM-free.
   What info holds per node (the move and borrow passes read these):
     ty    every expression and every binding pattern: its type (resolve it with RQ.types.res)
     bind  a Path that names a local, a binding pattern (let, for, param), a Deref (the local that holds the reference, when the
           operand is a plain name), and an Assign to a plain name: {mut,kind:'let'|'param',ty,assigns,deferred?}
     caps  the format-string literal of a print macro: [{name,bind}] for each {name} the string captures (bind is null for a const)
     recv  a MethodCall: {method, kind:'place'|'refvar'|'temp', adj:'&'|'&mut'|'val'}. kind is a place expression, a local that
           holds a reference, or anything else; adj is how the receiver is passed (an owned place is borrowed, a reference is used)
     sig   a Call: {params:[type], ret:type}
     rty, alen  the resolved literal type and array length, as before
   Structs are plain `struct Name { field: Type }` with owned fields; the only impl is `impl Drop for Name { fn drop(&mut self) { prints } }`. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const MACRO_NAMES='format panic assert assert_eq assert_ne debug_assert debug_assert_eq vec write writeln todo unimplemented unreachable'.split(' ');
RQ.CHECK_FEATURES=['struct','enum','impl','trait','static','type alias','use','mod','generics','method','nested item','closure','match',
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
  const {T,unify,isInt,res,show,fits,isCopy}=RQ.types;
  const errors=[],un=[],seen=new Set(),info=new Map();
  let regions=0;
  const mkRef=(mut,to)=>T.ref(mut,to,++regions);
  const I=n=>{let o=info.get(n);if(!o){o={};info.set(n,o);}return o;};
  const unsup=(f,line)=>{const k=f+'@'+line;if(!seen.has(k)){seen.add(k);un.push({feature:f,line});}return T.any;};
  const syn=(line,col,msg)=>errors.push({line,col,msg});
  const fns=new Map(),consts=new Map(),itemNames=new Set(),structs=new Map(),drops=new Map();
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
  // the number of values a type holds, so nested arrays cannot multiply into a print that freezes the page
  const weight=t=>{t=res(t);return t.k==='array'?t.n*weight(t.el):t.k==='tuple'?t.els.reduce((s,x)=>s+weight(x),0):1;};
  // rustc gives a bare literal under a cast the cast's type, so the checker has to see it too
  const bareLit=e=>{
    e=peel(e);let neg=false;
    if(e.t==='Unary'&&e.op==='-'){neg=true;e=peel(e.expr);}
    return e.t==='Lit'&&e.kind==='int'&&!e.suffix?{lit:e,v:neg?-BigInt(e.v):BigInt(e.v)}:null;
  };

  // a reference type with no lifetime written: in a return type that needs lifetime elision (E0106/E0515), which is not modeled
  const bareRef=n=>n.t==='Ref'?n.lt===null||bareRef(n.ty):n.t==='Tuple'?n.tys.some(bareRef):n.t==='Array'?bareRef(n.ty):false;
  const firstBare=n=>n.t==='Ref'?(n.lt===null?n:firstBare(n.ty)):n.t==='Tuple'?n.tys.map(firstBare).find(Boolean)||null:n.t==='Array'?firstBare(n.ty):null;
  const countRefs=n=>n.t==='Ref'?1+countRefs(n.ty):n.t==='Tuple'?n.tys.reduce((a,x)=>a+countRefs(x),0):n.t==='Array'?countRefs(n.ty):0;
  // `top` is set only for a fn's whole return type (and a const's type): that is the one place `&'static str` is checked against its leaves
  function tyOf(n,top){
    if(n.t==='Path'&&n.segs.length===1&&!n.segs[0].args&&!n.segs[0].fn){
      const s=n.segs[0].name;
      if(isInt(s))return T.int(s);
      if(s==='bool')return T.bool;
      if(s==='char')return T.char;
      if(s==='f64')return T.float;
      if(s==='String')return T.string;
      if(structs.has(s))return T.struct(s);
      return unsup(s,n.line);
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

  // a struct lives in the type namespace, so it may share a name with a fn or a const
  for(const it of ast.items)if(it.t==='Struct'){
    if(structs.has(it.name))errors.push(RQ.diag.make('E0428',it.line,it.col,{name:it.name}));
    else structs.set(it.name,{node:it,fields:[]});
  }
  const refNode=n=>n.t==='Ref'||(n.t==='Tuple'&&n.tys.some(refNode))||(n.t==='Array'&&refNode(n.ty));
  const BUILTIN=new Set(['String','bool','char','f64','str','Vec','Option','Result','Box','HashMap']);
  function structDecl(it){
    const rec=structs.get(it.name);
    if(rec.node!==it)return;
    const names=new Set();
    let ok=!it.generics.length&&it.kind==='named'&&!it.attrs.length&&!BUILTIN.has(it.name)&&!isInt(it.name);
    // a borrowed field needs a lifetime, which is not modeled
    for(const f of ok?it.fields:[]){
      if(names.has(f.name)||refNode(f.ty))ok=false;
      names.add(f.name);
    }
    if(!ok){unsup('struct',it.line);return;}
    rec.fields=it.fields.map(f=>({name:f.name,ty:tyOf(f.ty)}));
  }
  const DROP_OK=new Set(['Block','ExprStmt','Macro','Lit','Path','Field','Paren']);
  function dropImpl(it){
    const f=it.items[0],tr=it.trait,st=it.selfTy,one=n=>n&&n.t==='Path'&&n.segs.length===1&&!n.segs[0].args&&!n.segs[0].fn;
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

  for(const it of ast.items){
    if(it.t==='Struct')structDecl(it);
    else if(it.t==='Impl')dropImpl(it);
    else if(it.t==='Fn'){
      if(it.generics.length)unsup('generics',it.line);
      if(it.selfParam)unsup('method',it.line);
      const names=new Set();
      const params=it.params.map(p=>{
        const ok=p.pat.t==='IdentPat'&&!p.pat.sub&&!p.pat.byRef;
        if(!ok)unsup('pattern',p.pat.line);
        else if(names.has(p.pat.name))errors.push(RQ.diag.make('E0415',p.pat.line,p.pat.col,{name:p.pat.name}));
        else names.add(p.pat.name);
        return {name:ok?p.pat.name:'_',mut:ok&&p.pat.mut,ty:tyOf(p.ty),pat:p.pat};
      });
      const ret=it.ret?tyOf(it.ret,true):T.unit;
      let from=-1;
      if(it.ret&&bareRef(it.ret)){
        // one lifetime position among the parameters is the one the result borrows; none or several is E0106
        const refs=it.params.map(p=>countRefs(p.ty)),total=refs.reduce((a,x)=>a+x,0);
        if(total!==1){const at=firstBare(it.ret);errors.push(RQ.diag.make('E0106',at.line,at.col,{}));}
        else if(it.ret.t==='Ref'&&!it.ret.mut&&!it.params[refs.indexOf(1)].ty.mut&&it.params[refs.indexOf(1)].ty.t==='Ref'&&it.params[refs.indexOf(1)].ty.lt===null)from=refs.indexOf(1);
        else unsup('lifetime elision',it.ret.line);
      }
      if(it.name==='main'&&(params.length||it.ret))unsup('main signature',it.line);
      if(!it.body)syn(it.line,it.col,'free function without a body');
      if(defined(it))fns.set(it.name,{node:it,params,ret,from});
    }else if(it.t==='Const'){
      const ty=tyOf(it.ty,true);
      if(defined(it))consts.set(it.name,{node:it,ty});
    }else if(ITEM[it.t])unsup(ITEM[it.t],it.line);
    else if(!['Extern','MacroRules','Union'].includes(it.t))unsup(it.t,it.line);
  }
  // a struct that holds itself, directly or through a tuple or array, has infinite size (E0072), which is not modeled
  const holds=(t,seenS)=>{
    t=res(t);
    if(t.k==='struct'){
      if(seenS.has(t.name))return true;
      return structs.get(t.name).fields.some(f=>holds(f.ty,new Set([...seenS,t.name])));
    }
    return t.k==='tuple'?t.els.some(x=>holds(x,seenS)):t.k==='array'?holds(t.el,seenS):false;
  };
  for(const [name,rec] of structs)if(rec.fields.some(f=>holds(f.ty,new Set([name])))){rec.fields=[];unsup('struct',rec.node.line);}
  if(!fns.has('main')&&!un.length)syn(1,1,'`main` function not found in the file');

  let scopes=[],curRet=T.unit,curStatic=false,loops=[],vars=[],lits=[],fmts=[];
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
    scopes[scopes.length-1].set(n,b);
    if(node){const o=I(node);o.bind=b;o.ty=ty;}
    return b;
  };
  const ivar=()=>{const v=T.ivar();vars.push(v);return v;};
  const fvar=()=>{const v=T.fvar();vars.push(v);return v;};
  const printable=(t,dbg)=>{
    t=res(t);
    switch(t.k){
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
    for(const [e,t] of lits){const r=res(t);I(e).rty=r.k==='int'?r.ty:r.k==='float'?'f64':'i32';}
    for(const f of fmts){
      const r=res(f.t);
      if(!printable(r,f.fmt.debug))unsup('type checking',f.line);
      else if(f.fmt.prec!==null&&r.k!=='float'&&r.k!=='any')unsup('format spec',f.line);
    }
    vars=[];lits=[];fmts=[];
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
        usedPos.add(part.idx);fmts.push({t:pos[part.idx],line:m.args[1+part.idx].line,fmt:part.fmt});
      }else if(part.name!==undefined){
        const ni=m.named.findIndex(x=>x.name===part.name);
        if(ni>=0){usedNamed.add(part.name);fmts.push({t:named[ni],line:m.named[ni].expr.line,fmt:part.fmt});}
        else{
          const l=lookup(part.name);if(l)varUses++;
          const b=l||consts.get(part.name);
          if(b)caps.push({name:part.name,bind:l});
          if(b)fmts.push({t:b.ty,line:f.line,fmt:part.fmt});
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
        if(e.segs.length!==1||e.segs[0].args||e.global)return unsup('path call',e.line);
        const n=e.segs[0].name,local=lookup(n),b=local||consts.get(n);
        if(local){varUses++;I(e).bind=local;}
        if(b)return b.ty;
        if(fns.has(n))return unsup('function value',e.line);
        return unknown(n,e);
      }
      case 'Unary':{
        const t=ex(e.expr),r=res(t);
        if(e.op==='-')return r.k==='int'&&RQ.types.isSigned(r.ty)||r.k==='ivar'||r.k==='float'||r.k==='fvar'||r.k==='any'?t:unsup('type checking',e.line);
        return unify(t,T.bool)?t:unsup('type checking',e.line);
      }
      case 'Binary':{
        const a=ex(e.lhs),b=ex(e.rhs),op=e.op;
        if(op==='&&'||op==='||')return unify(a,T.bool)&&unify(b,T.bool)?T.bool:unsup('type checking',e.line);
        if(op==='<<'||op==='>>')return unsup('bit shift',e.line);
        if(!operands(a,b,e))return COMPARE.has(op)?T.bool:a;
        const u=res(a).k==='any'?b:a,c=cls(u);
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
        if(e.callee.t!=='Path'||e.callee.segs.length!==1||e.callee.segs[0].args||e.callee.global){e.args.forEach(ex);return unsup(e.callee.t==='Path'?'path call':'call',e.line);}
        const n=e.callee.segs[0].name,f=fns.get(n);
        const ts=e.args.map(ex);
        if(lookup(n)||consts.has(n))return unsup('call',e.line);
        if(!f&&n==='drop'){
          if(ts.length!==1)return unsup('wrong argument count',e.line);
          I(e).sig={params:ts,ret:T.unit};
          return T.unit;
        }
        if(!f&&(n==='Some'||n==='Ok'||n==='Err'))return unsup(n==='Some'?'Option':'Result',e.line);
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
          if(!f)return unsup('field access',e.line);
          return placeChain(e.expr)?f.ty:unsup('field of a temporary',e.line);
        }
        const i=/^\d+$/.test(e.name)?Number(e.name):-1;
        return b.k==='tuple'&&i>=0&&i<b.els.length?b.els[i]:unsup('field access',e.line);
      }
      case 'Cast':return cast(e);
      case 'StructLit':{
        const p=e.path,name=p.t==='Path'&&p.segs.length===1&&!p.segs[0].args&&!p.global?p.segs[0].name:'';
        const rec=structs.get(name);
        const ts=e.fields.map(f=>ex(f.expr));
        // a missing, repeated or unknown field (E0063, E0062, E0560) and `..base` are not modeled
        if(!rec||e.base||e.fields.length!==rec.fields.length||e.fields.some(f=>!rec.fields.some(x=>x.name===f.name))||new Set(e.fields.map(f=>f.name)).size!==e.fields.length)return unsup('struct literal',e.line);
        e.fields.forEach((f,i)=>coerce(ts[i],rec.fields.find(x=>x.name===f.name).ty,f.expr));
        return T.struct(name);
      }
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
    for(const p of f.params)bindVar(p.name,p.mut,'param',p.ty,p.pat);
    const body=f.node.body,t=block(body);
    if(body.tail||f.node.ret){if(coerce(t,f.ret,body.tail?endNode(body.tail):f.node.ret)&&curStatic&&body.tail)staticLeaves(body.tail);}
    else if(!unify(t,f.ret))unsup('type checking',f.node.line);
    finish();
  }
  // rustc runs only const fn in a const, so a call to a plain fn there is E0015; the quest allows literals and maths on other consts
  const constOk=e=>e.t==='Lit'||e.t==='Path'||((e.t==='Paren'||e.t==='Unary')&&constOk(e.expr))||(e.t==='Binary'&&constOk(e.lhs)&&constOk(e.rhs));
  for(const f of fns.values())fnBody(f);
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
