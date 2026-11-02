/* Values are {k:'int',v:BigInt,ty}, {k:'bool'|'char'|'str',v} and {k:'unit'}; an int with ty null is a literal whose type
   is still open. Deterministic: no clock, no randomness. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
class Unsup{constructor(feature,line){this.feature=feature;this.line=line;}}
class Limit{constructor(why){this.why=why;}}
class Ret{constructor(v){this.v=v;}}
const UNIT={k:'unit'};
const bool=v=>({k:'bool',v});
// Rust orders text by UTF-8 bytes, which is code point order; JS < compares UTF-16 units and puts U+10000 and up before U+E000
const cmpCodePoints=(x,y)=>{
  const p=Array.from(x),q=Array.from(y);
  for(let i=0;i<Math.min(p.length,q.length);i++){const d=p[i].codePointAt(0)-q[i].codePointAt(0);if(d)return d;}
  return p.length-q.length;
};

RQ.interp=(ast,opts)=>{
  opts=opts||{};
  const maxSteps=opts.maxSteps??100000,maxDepth=opts.maxDepth??64;
  const {fits,isInt}=RQ.types;
  let steps=0,depth=0,out='',err='';
  const fns=new Map(),consts=new Map(),cval=new Map();
  for(const it of ast.items){if(it.t==='Fn')fns.set(it.name,it);else if(it.t==='Const')consts.set(it.name,it);}
  const tick=()=>{if(++steps>maxSteps)throw new Limit('steps');};
  const mkInt=(v,ty,line)=>{if(!fits(v,ty))throw new Unsup('integer overflow',line);return {k:'int',v,ty:ty||null};};
  const intTy=n=>n&&n.t==='Path'&&n.segs.length===1&&isInt(n.segs[0].name)?n.segs[0].name:null;
  // a value meeting a declared type: an open int takes the declared type, and must fit it
  const coerce=(val,tyNode,line)=>{const t=intTy(tyNode);return t&&val.k==='int'?mkInt(val.v,t,line):val;};
  // an int still open at a binding or a print is an i32 for good, so it must fit one
  const settle=(val,line)=>{if(val.k==='int'&&!val.ty&&!fits(val.v,null))throw new Unsup('integer overflow',line);return val;};
  const find=(env,n)=>{for(let i=env.length-1;i>=0;i--)if(env[i].has(n))return env[i].get(n);return null;};

  function binop(op,a,b,line){
    if(a.k==='int'&&b.k==='int'){
      const ty=a.ty||b.ty;
      if(!ty&&!(fits(a.v,null)&&fits(b.v,null)))throw new Unsup('integer overflow',line);
      switch(op){
        case '+':return mkInt(a.v+b.v,ty,line);
        case '-':return mkInt(a.v-b.v,ty,line);
        case '*':return mkInt(a.v*b.v,ty,line);
        case '/':if(b.v===0n)throw new Unsup('division by zero',line);return mkInt(a.v/b.v,ty,line);
        case '%':if(b.v===0n)throw new Unsup('division by zero',line);return mkInt(a.v%b.v,ty,line);
        case '&':return mkInt(a.v&b.v,ty,line);
        case '|':return mkInt(a.v|b.v,ty,line);
        case '^':return mkInt(a.v^b.v,ty,line);
      }
    }
    if(a.k===b.k&&(a.k==='int'||a.k==='bool'||a.k==='char'||a.k==='str')){
      const d=a.k==='char'||a.k==='str'?cmpCodePoints(a.v,b.v):a.v<b.v?-1:a.v>b.v?1:0;
      switch(op){
        case '==':return bool(d===0);
        case '!=':return bool(d!==0);
        case '<':return bool(d<0);
        case '>':return bool(d>0);
        case '<=':return bool(d<=0);
        case '>=':return bool(d>=0);
      }
    }
    throw new Unsup('type checking',line);
  }

  function emit(name,s){
    if(name==='println'||name==='eprintln')s+='\n';
    if(name==='println'||name==='print')out+=s;else err+=s;
  }
  function macro(e,env){
    if(!e.args.length){emit(e.name,'');return UNIT;}
    const parts=RQ.std.parseFormat(e.args[0].v).parts;
    const pos=e.args.slice(1).map(x=>settle(ev(x,env),x.line)),named=new Map();
    for(const x of e.named)named.set(x.name,settle(ev(x.expr,env),x.expr.line));
    let s='';
    for(const p of parts){
      if(p.lit!==undefined)s+=p.lit;
      else if(p.idx!==undefined)s+=RQ.std.display(pos[p.idx]);
      else{
        let v=named.get(p.name);
        if(!v){const c=find(env,p.name);v=c?c.val:consts.has(p.name)?constVal(p.name):null;}
        if(!v)throw new Unsup('unresolved name',e.line);
        s+=RQ.std.display(v);
      }
    }
    emit(e.name,s);return UNIT;
  }
  function constVal(n){
    if(cval.has(n)){const v=cval.get(n);if(v)return v;throw new Unsup('unresolved name',consts.get(n).line);}
    cval.set(n,null);
    const c=consts.get(n),v=coerce(ev(c.init,[new Map()]),c.ty,c.line);
    cval.set(n,v);return v;
  }
  const called=new Set();
  function callFn(f,args,line){
    called.add(f);
    tick();
    if(depth+1>maxDepth)throw new Limit('depth');
    depth++;
    const fenv=[new Map()];
    f.params.forEach((p,i)=>fenv[0].set(p.pat.name,{val:coerce(args[i],p.ty,line)}));
    let r;
    try{r=block(f.body,fenv);}
    catch(x){if(x instanceof Ret)r=x.v;else throw x;}
    finally{depth--;}
    return f.ret?coerce(r,f.ret,line):UNIT;
  }
  function block(b,env){
    env.push(new Map());
    try{
      for(const s of b.stmts){
        tick();
        if(s.t==='Let'){
          let v=ev(s.init,env);
          v=s.ty?coerce(v,s.ty,s.line):settle(v,s.line);
          if(s.pat.t==='IdentPat')env[env.length-1].set(s.pat.name,{val:v});
        }else if(s.t==='ExprStmt')ev(s.expr,env);
        else throw new Unsup(s.t,s.line);
      }
      return b.tail?ev(b.tail,env):UNIT;
    }finally{env.pop();}
  }
  function ev(e,env){
    switch(e.t){
      case 'Lit':
        if(e.kind==='int')return e.suffix?mkInt(BigInt(e.v),e.suffix,e.line):{k:'int',v:BigInt(e.v),ty:null};
        if(e.kind==='bool')return bool(e.v);
        if(e.kind==='str'||e.kind==='char')return {k:e.kind,v:e.v};
        throw new Unsup(e.kind,e.line);
      case 'Paren':return ev(e.expr,env);
      case 'Path':{
        const n=e.segs[0].name,c=find(env,n);
        if(c)return c.val;
        if(consts.has(n))return constVal(n);
        throw new Unsup('unresolved name',e.line);
      }
      case 'Unary':{
        const a=ev(e.expr,env);
        if(e.op==='-'&&a.k==='int')return mkInt(-a.v,a.ty,e.line);
        if(e.op==='!'&&a.k==='bool')return bool(!a.v);
        throw new Unsup('type checking',e.line);
      }
      case 'Binary':{
        if(e.op==='&&'){const a=ev(e.lhs,env);return a.v?ev(e.rhs,env):a;}
        if(e.op==='||'){const a=ev(e.lhs,env);return a.v?a:ev(e.rhs,env);}
        const a=ev(e.lhs,env),b=ev(e.rhs,env);
        return binop(e.op,a,b,e.line);
      }
      case 'Assign':{
        if(e.lhs.t!=='Path')throw new Unsup('assignment target',e.line);
        const cell=find(env,e.lhs.segs[0].name);
        if(!cell)throw new Unsup('assignment target',e.line);
        let r=ev(e.rhs,env);
        if(e.op!=='=')r=binop(e.op.slice(0,-1),cell.val,r,e.line);
        if(r.k==='int'&&cell.val.k==='int')r=mkInt(r.v,r.ty||cell.val.ty,e.line);
        cell.val=r;return UNIT;
      }
      case 'Call':{
        const f=fns.get(e.callee.segs[0].name);
        if(!f)throw new Unsup('unresolved name',e.line);
        return callFn(f,e.args.map(a=>ev(a,env)),e.line);
      }
      case 'Macro':return macro(e,env);
      case 'Block':return block(e,env);
      case 'Return':throw new Ret(e.expr?ev(e.expr,env):UNIT);
      default:throw new Unsup(e.t,e.line);
    }
  }

  try{
    // rustc range-checks every const and every fn body; the quest only runs what main reaches, so it evaluates every const
    // up front and gives up on a fn main never calls rather than say ok about code it did not check
    for(const n of consts.keys())constVal(n);
    callFn(fns.get('main'),[],1);
    for(const f of fns.values())if(!called.has(f))throw new Unsup('unused function',f.line);
    return {status:'ok',stdout:out,stderr:err,exit:0};
  }catch(x){
    if(x instanceof Limit)return {status:'limit',limit:x.why,stdout:out,stderr:err,exit:null};
    if(x instanceof Unsup)return {status:'unsupported',unsupported:{feature:x.feature,line:x.line},stdout:out,stderr:err,exit:null};
    throw x;
  }
};
})();
