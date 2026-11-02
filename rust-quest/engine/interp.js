/* Values are {k:'int',v:BigInt,ty}, {k:'float',v:Number}, {k:'bool'|'char'|'str',v}, {k:'tuple'|'array',v:[values]} and
   {k:'unit'}. The checker gives every literal its final type (opts.info), so a value always carries a concrete type.
   Deterministic: no clock, no randomness. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
class Unsup{constructor(feature,line){this.feature=feature;this.line=line;}}
class Limit{constructor(why){this.why=why;}}
class Ret{constructor(v){this.v=v;}}
class Brk{constructor(v){this.v=v;}}
class Cont{}
class Panic{constructor(msg,e){this.msg=msg;this.line=e.line;this.col=e.col;}}
const UNIT={k:'unit'};
const bool=v=>({k:'bool',v});
const OPNAME={'+':'add','-':'subtract','*':'multiply'};
// Rust orders text by UTF-8 bytes, which is code point order; JS < compares UTF-16 units and puts U+10000 and up before U+E000
const cmpCodePoints=(x,y)=>{
  const p=Array.from(x),q=Array.from(y);
  for(let i=0;i<Math.min(p.length,q.length);i++){const d=p[i].codePointAt(0)-q[i].codePointAt(0);if(d)return d;}
  return p.length-q.length;
};
const peel=e=>e.t==='Paren'?peel(e.expr):e;

RQ.interp=(ast,opts)=>{
  opts=opts||{};
  const maxSteps=opts.maxSteps??100000,maxDepth=opts.maxDepth??64,info=opts.info||new Map();
  const {fits,INT,wrap}=RQ.types;
  let steps=0,depth=0,out='',err='';
  const fns=new Map(),consts=new Map(),cval=new Map();
  for(const it of ast.items){if(it.t==='Fn')fns.set(it.name,it);else if(it.t==='Const')consts.set(it.name,it);}
  const tick=()=>{if(++steps>maxSteps)throw new Limit('steps');};
  const bug=what=>{throw new Error('interpreter: '+what);};
  const find=(env,n)=>{for(let i=env.length-1;i>=0;i--)if(env[i].has(n))return env[i].get(n);return null;};
  const int=(v,ty)=>({k:'int',v,ty});
  const checked=(v,ty,msg,e)=>{if(!fits(v,ty))throw new Panic(msg,e);return int(v,ty);};

  function intOp(op,a,b,e){
    const ty=a.ty;
    switch(op){
      case '+':case '-':case '*':return checked(op==='+'?a.v+b.v:op==='-'?a.v-b.v:a.v*b.v,ty,'attempt to '+OPNAME[op]+' with overflow',e);
      case '/':
        if(b.v===0n)throw new Panic('attempt to divide by zero',e);
        return checked(a.v/b.v,ty,'attempt to divide with overflow',e);
      case '%':
        if(b.v===0n)throw new Panic('attempt to calculate the remainder with a divisor of zero',e);
        if(a.v===INT[ty][0]&&b.v===-1n&&ty[0]==='i')throw new Panic('attempt to calculate the remainder with overflow',e);
        return int(a.v%b.v,ty);
      case '&':return int(a.v&b.v,ty);
      case '|':return int(a.v|b.v,ty);
      case '^':return int(a.v^b.v,ty);
    }
    return null;
  }
  function binop(op,a,b,e){
    if(a.k==='int'&&b.k==='int'){const r=intOp(op,a,b,e);if(r)return r;}
    if(a.k==='float'&&b.k==='float'){
      switch(op){
        case '+':return {k:'float',v:a.v+b.v};
        case '-':return {k:'float',v:a.v-b.v};
        case '*':return {k:'float',v:a.v*b.v};
        case '/':return {k:'float',v:a.v/b.v};
        case '%':return {k:'float',v:a.v%b.v};
      }
    }
    if(a.k===b.k&&['int','float','bool','char','str'].includes(a.k)){
      const text=a.k==='char'||a.k==='str',d=text?cmpCodePoints(a.v,b.v):null;
      const x=text?d:a.v,y=text?0:b.v;
      switch(op){
        case '==':return bool(x===y);
        case '!=':return bool(x!==y);
        case '<':return bool(x<y);
        case '>':return bool(x>y);
        case '<=':return bool(x<=y);
        case '>=':return bool(x>=y);
      }
    }
    return bug('operator '+op+' on '+a.k+' and '+b.k);
  }

  function cast(v,to,e){
    const t=to.segs[0].name;
    if(INT[t]){
      const [lo,hi]=INT[t];
      switch(v.k){
        case 'int':return int(wrap(v.v,t),t);
        case 'bool':return int(v.v?1n:0n,t);
        case 'char':return int(wrap(BigInt(v.v.codePointAt(0)),t),t);
        case 'float':{
          if(Number.isNaN(v.v))return int(0n,t);
          if(v.v===Infinity)return int(hi,t);
          if(v.v===-Infinity)return int(lo,t);
          const n=BigInt(Math.trunc(v.v));
          return int(n<lo?lo:n>hi?hi:n,t);
        }
      }
    }else if(t==='f64')return {k:'float',v:v.k==='int'?Number(v.v):v.v};
    else if(t==='char')return v.k==='char'?v:{k:'char',v:String.fromCodePoint(Number(v.v))};
    else if(t==='bool')return v;
    return bug('cast to '+t+' at line '+e.line);
  }

  function emit(name,s){
    if(name==='println'||name==='eprintln')s+='\n';
    if(name==='println'||name==='print')out+=s;else err+=s;
  }
  function macro(e,env){
    if(!e.args.length){emit(e.name,'');return UNIT;}
    const parts=RQ.std.parseFormat(e.args[0].v).parts;
    const pos=e.args.slice(1).map(x=>ev(x,env)),named=new Map();
    for(const x of e.named)named.set(x.name,ev(x.expr,env));
    let s='';
    try{
      for(const p of parts){
        if(p.lit!==undefined)s+=p.lit;
        else if(p.idx!==undefined)s+=RQ.std.render(pos[p.idx],p.fmt,tick);
        else{
          let v=named.get(p.name);
          if(!v){const c=find(env,p.name);v=c?c.val:consts.has(p.name)?constVal(p.name):bug('name '+p.name);}
          s+=RQ.std.render(v,p.fmt,tick);
        }
      }
    }catch(x){
      if(x instanceof RQ.std.Unmodeled)throw new Unsup('format spec',e.line);
      throw x;
    }
    emit(e.name,s);return UNIT;
  }
  function constVal(n){
    if(cval.has(n)){const v=cval.get(n);if(v)return v;throw new Unsup('const initializer',consts.get(n).line);}
    cval.set(n,null);
    const c=consts.get(n);
    try{cval.set(n,ev(c.init,[new Map()]));}
    catch(x){if(x instanceof Panic)throw new Unsup('const initializer',c.line);throw x;}
    return cval.get(n);
  }
  function callFn(f,args,line){
    tick();
    if(depth+1>maxDepth)throw new Limit('depth');
    depth++;
    const fenv=[new Map()];
    f.params.forEach((p,i)=>fenv[0].set(p.pat.name,{val:args[i]}));
    let r;
    try{r=block(f.body,fenv);}
    catch(x){if(x instanceof Ret)r=x.v;else throw x;}
    finally{depth--;}
    return r;
  }
  function block(b,env){
    env.push(new Map());
    try{
      for(const s of b.stmts){
        tick();
        if(s.t==='Let'){
          const v=ev(s.init,env);
          if(s.pat.t==='IdentPat')env[env.length-1].set(s.pat.name,{val:v});
        }else if(s.t==='ExprStmt')ev(s.expr,env);
        else throw new Unsup(s.t,s.line);
      }
      return b.tail?ev(b.tail,env):UNIT;
    }finally{env.pop();}
  }
  function body(b,env,box){
    try{block(b,env);}
    catch(x){
      if(x instanceof Brk){box.v=x.v;return true;}
      if(!(x instanceof Cont))throw x;
    }
    return false;
  }
  function ev(e,env){
    switch(e.t){
      case 'Lit':{
        const rty=(info.get(e)||{}).rty;
        if(e.kind==='int')return int(BigInt(e.v),rty);
        if(e.kind==='float')return {k:'float',v:Number(e.v)};
        if(e.kind==='bool')return bool(e.v);
        return {k:e.kind,v:e.v};
      }
      case 'Paren':return ev(e.expr,env);
      case 'Path':{
        const n=e.segs[0].name,c=find(env,n);
        if(c)return c.val;
        if(consts.has(n))return constVal(n);
        return bug('name '+n);
      }
      case 'Unary':{
        const lit=peel(e.expr);
        if(e.op==='-'&&lit.t==='Lit'&&lit.kind==='int')return int(-BigInt(lit.v),(info.get(lit)||{}).rty);
        const a=ev(e.expr,env);
        if(e.op==='-'&&a.k==='int')return checked(-a.v,a.ty,'attempt to negate with overflow',e);
        if(e.op==='-'&&a.k==='float')return {k:'float',v:-a.v};
        if(e.op==='!'&&a.k==='bool')return bool(!a.v);
        return bug('unary '+e.op);
      }
      case 'Binary':{
        if(e.op==='&&'){const a=ev(e.lhs,env);return a.v?ev(e.rhs,env):a;}
        if(e.op==='||'){const a=ev(e.lhs,env);return a.v?a:ev(e.rhs,env);}
        const a=ev(e.lhs,env),b=ev(e.rhs,env);
        return binop(e.op,a,b,e);
      }
      case 'Assign':{
        const cell=find(env,e.lhs.segs[0].name);
        if(!cell)return bug('assign');
        let r=ev(e.rhs,env);
        if(e.op!=='=')r=binop(e.op.slice(0,-1),cell.val,r,e);
        cell.val=r;return UNIT;
      }
      case 'Call':{
        const f=fns.get(e.callee.segs[0].name);
        if(!f)return bug('call');
        return callFn(f,e.args.map(a=>ev(a,env)),e.line);
      }
      case 'Macro':return macro(e,env);
      case 'Block':return block(e,env);
      case 'Return':throw new Ret(e.expr?ev(e.expr,env):UNIT);
      case 'Tuple':return e.elems.length?{k:'tuple',v:e.elems.map(x=>ev(x,env))}:UNIT;
      case 'Array':return {k:'array',v:e.elems.map(x=>ev(x,env))};
      case 'ArrayRepeat':{const v=ev(e.elem,env);return {k:'array',v:Array(Number(e.len.v)).fill(v)};}
      case 'Index':{
        const a=ev(e.expr,env),i=ev(e.index,env);
        if(i.v>=BigInt(a.v.length))throw new Panic('index out of bounds: the len is '+a.v.length+' but the index is '+i.v,e);
        return a.v[Number(i.v)];
      }
      case 'Field':return ev(e.expr,env).v[Number(e.name)];
      case 'Cast':return cast(ev(e.expr,env),e.ty,e);
      case 'If':
        if(ev(e.cond,env).v)return block(e.then,env);
        return e.els?e.els.t==='If'?ev(e.els,env):block(e.els,env):UNIT;
      case 'Loop':{
        const box={v:UNIT};
        for(;;){tick();if(body(e.body,env,box))return box.v;}
      }
      case 'While':{
        const box={v:UNIT};
        for(;;){tick();if(!ev(e.cond,env).v||body(e.body,env,box))return UNIT;}
      }
      case 'For':{
        const r=peel(e.iter),from=ev(r.from,env),to=ev(r.to,env),box={v:UNIT},end=r.inclusive?to.v+1n:to.v;
        for(let i=from.v;i<end;i++){
          tick();
          env.push(new Map());
          if(e.pat.t==='IdentPat')env[env.length-1].set(e.pat.name,{val:int(i,from.ty)});
          try{if(body(e.body,env,box))return UNIT;}finally{env.pop();}
        }
        return UNIT;
      }
      case 'Break':throw new Brk(e.expr?ev(e.expr,env):UNIT);
      case 'Continue':throw new Cont();
      default:throw new Unsup(e.t,e.line);
    }
  }

  try{
    // rustc range-checks every const; the lint pass reports an overflow, so a const only fails here on a shape it cannot model
    for(const n of consts.keys())constVal(n);
    callFn(fns.get('main'),[],1);
    return {status:'ok',stdout:out,stderr:err,exit:0};
  }catch(x){
    if(x instanceof Limit)return {status:'limit',limit:x.why,stdout:out,stderr:err,exit:null};
    if(x instanceof Unsup)return {status:'unsupported',unsupported:{feature:x.feature,line:x.line},stdout:out,stderr:err,exit:null};
    if(x instanceof Panic){
      const panic={msg:x.msg,line:x.line,col:x.col};
      return {status:'panic',stdout:out,stderr:err+RQ.diag.panicText(panic),exit:101,panic};
    }
    throw x;
  }
};
})();
