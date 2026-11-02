/* Anything outside what is modeled is listed as unsupported, never guessed at, so a program is only judged when every
   construct in it is modeled. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const MACRO_NAMES='format panic assert assert_eq assert_ne debug_assert debug_assert_eq vec write writeln todo unimplemented unreachable'.split(' ');
RQ.CHECK_FEATURES=['struct','enum','impl','trait','static','type alias','use','mod','generics','method','nested item','closure','if','match','loop','while','for',
  'method call','field access','tuple','array','slice','index','range','reference','dereference','cast','try operator','struct literal','qualified path',
  'fn pointer','impl Trait','inferred type','pattern','let else','deferred initialization','float','format spec','assignment target','type checking',
  'unresolved name','const initializer','unused function','integer overflow','division by zero','main signature','path call','function value','bit shift','block label','call','wrong argument count',
  'String','Vec','HashMap','Option','Result','Box','str',...MACRO_NAMES.map(n=>n+'!')];
const PRINT={println:false,print:false,eprintln:true,eprint:true}; // value: goes to stderr
const ITEM={Struct:'struct',Enum:'enum',Impl:'impl',Trait:'trait',Static:'static',TypeAlias:'type alias',Use:'use',Mod:'mod'};
const EXPR={If:'if',Match:'match',Loop:'loop',While:'while',For:'for',Closure:'closure',Tuple:'tuple',Array:'array',ArrayRepeat:'array',Index:'index',
  Field:'field access',MethodCall:'method call',Range:'range',Cast:'cast',Ref:'reference',Deref:'dereference',Try:'try operator',StructLit:'struct literal',
  Break:'loop',Continue:'loop',LetCond:'if',Await:'async',QPath:'qualified path'};
const TYPE_NODE={Array:'array',Slice:'slice',Tuple:'tuple',FnPtr:'fn pointer',ImplTrait:'impl Trait',QPath:'qualified path',Infer:'inferred type'};
const COMPARE=new Set(['==','!=','<','>','<=','>=']);
const ARITH=new Set(['+','-','*','/','%']);

RQ.check=ast=>{
  const {T,unify,isInt}=RQ.types;
  const errors=[],un=[],seen=new Set();
  const unsup=(f,line)=>{const k=f+'@'+line;if(!seen.has(k)){seen.add(k);un.push({feature:f,line});}return T.any;};
  const syn=(line,col,msg)=>errors.push({line,col,msg});
  const fns=new Map(),consts=new Map(),itemNames=new Set();
  // lets that rebind a visible name, those whose value reads the old one, and every read of a local variable
  let shadows=0,shadowUses=0,varUses=0;
  const defined=it=>{
    if(itemNames.has(it.name)){errors.push(RQ.diag.make('E0428',it.line,it.col,{name:it.name}));return false;}
    itemNames.add(it.name);return true;
  };

  function tyOf(n){
    if(n.t==='Path'&&n.segs.length===1&&!n.segs[0].args&&!n.segs[0].fn){
      const s=n.segs[0].name;
      if(isInt(s))return T.int(s);
      if(s==='bool')return T.bool;
      if(s==='char')return T.char;
      return unsup(s,n.line);
    }
    if(n.t==='Ref'){
      if(!n.mut&&n.ty.t==='Path'&&n.ty.segs.length===1&&n.ty.segs[0].name==='str')return T.str;
      return unsup('reference',n.line);
    }
    if(n.t==='Tuple'&&n.tys.length===0)return T.unit;
    return unsup(n.t==='Path'?n.segs[n.segs.length-1].name:TYPE_NODE[n.t]||n.t,n.line);
  }

  for(const it of ast.items){
    if(it.t==='Fn'){
      if(it.generics.length)unsup('generics',it.line);
      if(it.selfParam)unsup('method',it.line);
      const names=new Set();
      const params=it.params.map(p=>{
        const ok=p.pat.t==='IdentPat'&&!p.pat.sub&&!p.pat.byRef;
        if(!ok)unsup('pattern',p.pat.line);
        else if(names.has(p.pat.name))errors.push(RQ.diag.make('E0415',p.pat.line,p.pat.col,{name:p.pat.name}));
        else names.add(p.pat.name);
        return {name:ok?p.pat.name:'_',mut:ok&&p.pat.mut,ty:tyOf(p.ty)};
      });
      const ret=it.ret?tyOf(it.ret):T.unit;
      if(it.name==='main'&&(params.length||it.ret))unsup('main signature',it.line);
      if(!it.body)syn(it.line,it.col,'free function without a body');
      if(defined(it))fns.set(it.name,{node:it,params,ret});
    }else if(it.t==='Const'){
      const ty=tyOf(it.ty);
      if(defined(it))consts.set(it.name,{node:it,ty});
    }else if(ITEM[it.t])unsup(ITEM[it.t],it.line);
    else if(!['Extern','MacroRules','Union'].includes(it.t))unsup(it.t,it.line);
  }
  if(!fns.has('main')&&!un.length)syn(1,1,'`main` function not found in the file');

  let scopes=[],curRet=T.unit;
  const lookup=n=>{for(let i=scopes.length-1;i>=0;i--)if(scopes[i].has(n))return scopes[i].get(n);return null;};
  const declare=(n,b)=>scopes[scopes.length-1].set(n,b);

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
        if(!s.init){unsup('deferred initialization',s.line);if(named)declare(pt.name,{mut:pt.mut,kind:'let',ty:s.ty?tyOf(s.ty):T.any});continue;}
        let t=ex(s.init);
        if(named&&lookup(pt.name)){
          shadows++;
          let reads=false;
          RQ.walk(s.init,n=>{if(n.t==='Path'&&n.segs.length===1&&n.segs[0].name===pt.name)reads=true;});
          if(reads)shadowUses++;
        }
        if(s.ty){const a=tyOf(s.ty),u=unify(t,a);if(!u)unsup('type checking',s.line);t=u&&u.k==='int'&&a.k==='int'?a:u||a;}
        if(named)declare(pt.name,{mut:pt.mut,kind:'let',ty:t});
      }else if(s.t==='ExprStmt'){if(ex(s.expr).k==='never')diverges=true;}
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
    const pos=m.args.slice(1),usedPos=new Set(),usedNamed=new Set();
    for(const x of pos){const t=ex(x);if(!['int','bool','char','str','any','never'].includes(t.k))unsup('type checking',x.line);}
    for(const x of m.named){const t=ex(x.expr);if(!['int','bool','char','str','any','never'].includes(t.k))unsup('type checking',x.expr.line);}
    for(const part of pf.parts){
      if(part.idx!==undefined){
        if(part.idx>=pos.length){syn(f.line,f.col,'invalid reference to positional argument '+part.idx+' (there '+(pos.length===1?'is 1 argument':'are '+pos.length+' arguments')+')');return T.unit;}
        usedPos.add(part.idx);
      }else if(part.name!==undefined){
        if(m.named.some(x=>x.name===part.name))usedNamed.add(part.name);
        else{const l=lookup(part.name);if(l)varUses++;const b=l||consts.get(part.name);if(!b)unsup('unresolved name',f.line);else if(!['int','bool','char','str','any'].includes(b.ty.k))unsup('type checking',f.line);}
      }
    }
    for(let i=0;i<pos.length;i++)if(!usedPos.has(i)){syn(pos[i].line,pos[i].col,'argument never used');return T.unit;}
    for(const x of m.named)if(!usedNamed.has(x.name)){syn(x.expr.line,x.expr.col,'named argument never used');return T.unit;}
    return T.unit;
  }

  function ex(e){
    switch(e.t){
      case 'Lit':
        if(e.kind==='int'){if(e.suffix&&!isInt(e.suffix))return unsup(e.suffix,e.line);return T.int(e.suffix);}
        if(e.kind==='float')return unsup('float',e.line);
        if(e.kind==='str')return T.str;
        if(e.kind==='char')return T.char;
        return T.bool;
      case 'Paren':return ex(e.expr);
      case 'Path':{
        if(e.segs.length!==1||e.segs[0].args||e.global)return unsup('path call',e.line);
        const n=e.segs[0].name,local=lookup(n),b=local||consts.get(n);
        if(local)varUses++;
        if(b)return b.ty;
        if(fns.has(n))return unsup('function value',e.line);
        return unsup('unresolved name',e.line);
      }
      case 'Unary':{
        const t=ex(e.expr);
        if(e.op==='-')return t.k==='int'&&RQ.types.isSigned(t.ty)?t:t.k==='any'?t:unsup('type checking',e.line);
        return t.k==='bool'||t.k==='any'?t:unsup('type checking',e.line);
      }
      case 'Binary':{
        const a=ex(e.lhs),b=ex(e.rhs),op=e.op;
        if(op==='&&'||op==='||'){return unify(a,T.bool)&&unify(b,T.bool)?T.bool:unsup('type checking',e.line);}
        if(op==='<<'||op==='>>')return unsup('bit shift',e.line);
        const u=unify(a,b);
        if(!u)return unsup('type checking',e.line);
        if(COMPARE.has(op))return T.bool;
        if(ARITH.has(op)||op==='&'||op==='|'||op==='^')return u.k==='int'||u.k==='any'?u:unsup('type checking',e.line);
        return unsup(op,e.line);
      }
      case 'Assign':{
        const r=ex(e.rhs);
        if(e.lhs.t!=='Path'||e.lhs.segs.length!==1||e.lhs.segs[0].args){ex(e.lhs);return unsup('assignment target',e.line);}
        const n=e.lhs.segs[0].name,b=lookup(n);
        if(!b){if(consts.has(n))return unsup('assignment target',e.line);return unsup('unresolved name',e.line);}
        if(!b.mut)errors.push(RQ.diag.make('E0384',e.line,e.col,{name:n,kind:b.kind}));
        if(e.op!=='='){
          const op=e.op.slice(0,-1);
          if(op==='<<'||op==='>>')return unsup('bit shift',e.line);
          if(!(unify(b.ty,r)&&(b.ty.k==='int'||b.ty.k==='any')))return unsup('type checking',e.line);
        }else if(!unify(b.ty,r))return unsup('type checking',e.line);
        return T.unit;
      }
      case 'Call':{
        if(e.callee.t!=='Path'||e.callee.segs.length!==1||e.callee.segs[0].args||e.callee.global){e.args.forEach(ex);return unsup(e.callee.t==='Path'?'path call':'call',e.line);}
        const n=e.callee.segs[0].name,f=fns.get(n);
        const ts=e.args.map(ex);
        if(!f||lookup(n))return unsup(lookup(n)?'call':'unresolved name',e.line);
        if(ts.length!==f.params.length)return unsup('wrong argument count',e.line);
        ts.forEach((t,i)=>{if(!unify(t,f.params[i].ty))unsup('type checking',e.args[i].line);});
        return f.ret;
      }
      case 'Macro':{
        if(e.args===null)return T.any;
        if(e.name in PRINT)return format(e);
        e.args.forEach(ex);
        return unsup(e.name+'!',e.line);
      }
      case 'Block':return block(e);
      case 'Return':{
        const t=e.expr?ex(e.expr):T.unit;
        if(!unify(t,curRet))unsup('type checking',e.line);
        return T.never;
      }
      default:return unsup(EXPR[e.t]||e.t,e.line);
    }
  }

  function fnBody(f){
    if(!f.node.body)return;
    scopes=[new Map()];curRet=f.ret;
    for(const p of f.params)declare(p.name,{mut:p.mut,kind:'param',ty:p.ty});
    const t=block(f.node.body);
    if(!unify(t,f.ret))unsup('type checking',f.node.line);
  }
  // rustc runs only const fn in a const, so a call to a plain fn there is E0015; the quest allows literals and maths on other consts
  const constOk=e=>e.t==='Lit'||e.t==='Path'||((e.t==='Paren'||e.t==='Unary')&&constOk(e.expr))||(e.t==='Binary'&&constOk(e.lhs)&&constOk(e.rhs));
  for(const f of fns.values())fnBody(f);
  for(const c of consts.values()){
    scopes=[new Map()];
    if(!c.node.init){unsup('deferred initialization',c.node.line);continue;}
    if(!constOk(c.node.init)){unsup('const initializer',c.node.line);continue;}
    const t=ex(c.node.init);
    if(!unify(t,c.ty))unsup('type checking',c.node.line);
  }
  return {errors,unsupported:un,shadows,shadowUses,varUses};
};
})();
