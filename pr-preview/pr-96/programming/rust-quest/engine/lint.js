/* The deny-by-default lints rustc runs on a program that type-checks: overflowing_literals on every literal, and
   arithmetic_overflow and unconditional_panic on the operations whose operands rustc can work out ahead of time. This
   models the folding rustc's probes showed (see tests/rust/lint.test.mjs). A shape whose folding is not verified comes out
   as unsupported('const folding'), never as ok. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const peel=e=>e.t==='Paren'?peel(e.expr):e;
const ARITH={'+':1,'-':1,'*':1};

RQ.lint=(ast,info)=>{
  const {INT,fits,wrap}=RQ.types;
  const errors=[],un=[],seen=new Set();
  const once=(k,f)=>{if(!seen.has(k)){seen.add(k);f();}};
  const unsup=(feature,line)=>once(feature+'@'+line,()=>un.push({feature,line}));
  const flag=(id,n,o)=>once(id+'@'+n.line+':'+n.col,()=>errors.push(RQ.diag.make(id,n.line,n.col,o)));
  const rtyOf=e=>(info.get(e)||{}).rty;
  const bindOf=e=>(info.get(e)||{}).bind;
  // the local a place hangs off: x for x, x.0 and x[i]
  const rootBind=n=>{n=peel(n);while(n.t==='Field'||n.t==='Index')n=peel(n.expr);return n.t==='Path'?bindOf(n):null;};
  let borrowed=new Set(); // per fn: the locals that are the root of a & or &mut operand, or of an autoref method receiver

  // overflowing_literals is a type-based lint, so it covers every literal, reachable or not
  const negated=new Set();
  RQ.walk(ast,n=>{if(n.t==='Unary'&&n.op==='-'){const x=peel(n.expr);if(x.t==='Lit'&&x.kind==='int')negated.add(x);}});
  const badLit=new Set();
  RQ.walk(ast,n=>{
    if(n.t!=='Lit'||n.kind!=='int')return;
    const ty=rtyOf(n),v=negated.has(n)?-BigInt(n.v):BigInt(n.v);
    if(!fits(v,ty)){badLit.add(n);flag('overflowing_literals',n,{ty});}
  });

  let st=new Map(),dead=0,barriers=0,div=false,constLine=0;
  const consts=new Map(),constVals=new Map();
  for(const it of ast.items)if(it.t==='Const')consts.set(it.name,it);

  const barrier=()=>{barriers++;for(const s of st.values())s.fresh=false;};
  const snap=()=>new Map([...st].map(([k,s])=>[k,{...s}]));
  // a trap in a branch rustc may drop, or on a value whose folding is not verified, is not judged
  function trap(id,n,o,amb){
    if(constLine)unsup('const initializer',constLine);
    else if(dead||amb)unsup('const folding',n.line);
    else flag(id,n,o);
  }
  const int=(v,ty,amb)=>({k:'int',v,ty,amb});
  const boolv=(v,amb)=>({k:'bool',v,amb});
  const amb2=(a,b)=>!!((a&&a.amb)||(b&&b.amb));
  const assignedIn=n=>{const s=new Set();RQ.walk(n,x=>{if(x.t==='Assign'){const b=bindOf(x);if(b)s.add(b);}});return s;};
  const forget=bs=>{for(const b of bs)if(st.has(b))st.get(b).val=null;};
  // a break inside a nested loop leaves that loop, not this one
  const hasBreak=n=>{let f=false;RQ.walk(n,x=>{if(x.t==='Break')f=true;if(x.t==='Loop'||x.t==='While'||x.t==='For')return false;});return f;};
  // a doubtful aggregate or index makes the element doubtful
  const part=(a,i,amb)=>{
    const v=a&&a.k==='agg'?a.els[i]:null;
    return v?{...v,amb:v.amb||a.amb||amb}:null;
  };

  // rustc (1.99.1) does not fold a condition that reads a let mut the way it folds an immutable one
  const doubtful=(cond,c)=>{
    let m=c.amb;
    RQ.walk(cond,x=>{if(x.t==='Path'){const b=bindOf(x);if(b&&b.mut)m=true;}});
    return !!m;
  };
  function arith(op,a,b,e){
    if(op==='/'||op==='%'){
      if(b&&b.k==='int'&&b.v===0n)trap('unconditional_panic',e,{why:op==='/'?'attempt to divide by zero':'attempt to calculate the remainder with a divisor of zero'},b.amb||amb2(a,b));
      else if(a&&b&&a.k==='int'&&b.k==='int'&&a.ty[0]==='i'&&a.v===INT[a.ty][0]&&b.v===-1n)unsup('integer overflow',e.line);
      else if(a&&b&&a.k==='int'&&b.k==='int')return int(op==='/'?a.v/b.v:a.v%b.v,a.ty,amb2(a,b));
      return null;
    }
    if(!a||!b||a.k!=='int'||b.k!=='int')return null;
    const r=op==='+'?a.v+b.v:op==='-'?a.v-b.v:a.v*b.v;
    if(!fits(r,a.ty)){trap('arithmetic_overflow',e,{},amb2(a,b));return null;}
    return int(r,a.ty,amb2(a,b));
  }
  function compare(op,a,b){
    if(!a||!b||a.k!==b.k||(a.k!=='int'&&a.k!=='bool'))return null;
    const x=a.v,y=b.v;
    const r={'==':x===y,'!=':x!==y,'<':x<y,'>':x>y,'<=':x<=y,'>=':x>=y}[op];
    return r===undefined?null:boolv(r,amb2(a,b));
  }

  function block(b){
    for(const s of b.stmts){
      if(div)return null;
      if(s.t==='Let'){
        if(!s.init)continue; // a deferred let has no value to fold
        const before=barriers,v=ev(s.init);
        if(s.pat.t==='IdentPat'){const bd=bindOf(s.pat);if(bd)st.set(bd,{val:v,fresh:barriers===before});}
      }else if(s.t==='ExprStmt')ev(s.expr);
    }
    return div||!b.tail?null:ev(b.tail);
  }
  // the live branch runs as written; a branch the condition rules out is judged only as far as rustc is known to ignore it
  function branch(b,live){
    const was=div;
    if(!live)dead++;
    block(b);
    if(!live)dead--;
    const d=div;div=was;return d;
  }
  function loopBody(n,cond){
    forget(assignedIn(n));barrier();
    const c=cond?ev(cond):null;
    barrier();
    branch(n.body,!(c&&c.k==='bool'&&c.v===false));
    forget(assignedIn(n));barrier();
    return c;
  }

  function ev(e){
    switch(e.t){
      case 'Lit':{
        if(e.kind==='bool')return boolv(e.v);
        if(e.kind!=='int'||badLit.has(e))return null;
        return int(BigInt(e.v),rtyOf(e));
      }
      case 'Paren':return ev(e.expr);
      case 'Path':{
        const b=bindOf(e);
        if(b){
          const s=st.get(b);
          if(!s||!s.val)return null;
          // a local whose address is taken anywhere in the fn: rustc's folding of it is not verified
          return {...s.val,amb:s.val.amb||borrowed.has(b)||(b.mut&&(b.assigns===0||!s.fresh))};
        }
        const n=e.segs[0].name;
        if(!consts.has(n))return null;
        const v=constKnown(n);
        return v&&{...v,amb:true};
      }
      case 'Unary':{
        const x=peel(e.expr);
        if(e.op==='-'&&x.t==='Lit'&&x.kind==='int')return badLit.has(x)?null:int(-BigInt(x.v),rtyOf(x));
        const a=ev(e.expr);
        if(e.op==='!')return a&&a.k==='bool'?boolv(!a.v,a.amb):null;
        if(a&&a.k==='int'&&a.ty[0]==='i'&&a.v===INT[a.ty][0]){trap('arithmetic_overflow',e,{},a.amb);barrier();return null;}
        barrier();
        return a&&a.k==='int'?int(-a.v,a.ty,a.amb):null;
      }
      case 'Binary':{
        const op=e.op;
        if(op==='&&'||op==='||'){
          const a=ev(e.lhs);
          if(a&&a.k==='bool'&&a.v===(op==='||'))return a;
          const b=ev(e.rhs);
          return a&&b&&a.k==='bool'&&b.k==='bool'?boolv(op==='&&'?a.v&&b.v:a.v||b.v,amb2(a,b)):null;
        }
        const a=ev(e.lhs),b=ev(e.rhs);
        if(ARITH[op]||op==='/'||op==='%'){const r=arith(op,a,b,e);barrier();return r;}
        if(op==='&'||op==='|'||op==='^'){
          return a&&b&&a.k==='int'&&b.k==='int'?int(op==='&'?a.v&b.v:op==='|'?a.v|b.v:a.v^b.v,a.ty,amb2(a,b)):null;
        }
        return compare(op,a,b);
      }
      case 'Cast':{
        const a=ev(e.expr),t=e.ty.t==='Path'?e.ty.segs[0].name:'';
        return a&&a.k==='int'&&INT[t]?int(wrap(a.v,t),t,a.amb):null;
      }
      case 'Ref':{
        ev(e.expr);
        // a &mut hands out a way to change the value that rustc's folding may or may not see
        if(e.mut){const b=rootBind(e.expr);if(b)forget([b]);barrier();}
        return null;
      }
      case 'Deref':ev(e.expr);return null;
      case 'MethodCall':{
        ev(e.recv);
        for(const a of e.args)ev(a);
        barrier();return null;
      }
      case 'Assign':{
        // *r = v: lints in v still fire, but nothing is stored and nothing folded (the Deref's .bind is the reference, not the target)
        if(e.lhs.t==='Deref'){ev(e.rhs);barrier();return null;}
        const b=bindOf(e),before=barriers;
        let r=ev(e.rhs);
        if(e.op!=='='){
          const s=b&&st.get(b),cur=s&&s.val&&{...s.val,amb:s.val.amb||!s.fresh};
          r=arith(e.op.slice(0,-1),cur,r,e);barrier();
        }
        if(b&&st.has(b)){const s=st.get(b);s.val=r;s.fresh=barriers===before;}
        return null;
      }
      case 'Call':case 'Macro':{
        const args=e.t==='Call'?e.args:[...(e.args||[]),...e.named.map(x=>x.expr)];
        for(const a of args)ev(a);
        barrier();return null;
      }
      case 'Index':{
        const a=ev(e.expr),i=ev(e.index),n=(info.get(e)||{}).alen;
        if(i&&i.k==='int'&&n!==undefined&&i.v>=BigInt(n))trap('unconditional_panic',e,{why:'index out of bounds: the length is '+n+' but the index is '+i.v},i.amb);
        barrier();
        return i&&i.k==='int'&&part(a,Number(i.v),i.amb);
      }
      case 'Tuple':case 'Array':return {k:'agg',els:e.elems.map(ev)};
      case 'ArrayRepeat':return {k:'agg',els:Array(Number(e.len.v)).fill(ev(e.elem))};
      case 'Field':return part(ev(e.expr),Number(e.name));
      case 'Block':return block(e);
      case 'Return':case 'Break':if(e.expr)ev(e.expr);div=true;return null;
      case 'Continue':div=true;return null;
      case 'If':{
        const c=ev(e.cond),known=c&&c.k==='bool';
        barrier();
        const base=snap();
        const dt=branch(e.then,!known||c.v);
        st=base;
        let de=false;
        if(e.els&&e.els.t==='If'){
          const was=div;
          if(known&&c.v)dead++;
          ev(e.els);
          if(known&&c.v)dead--;
          de=div;div=was;
        }else if(e.els)de=branch(e.els,!known||!c.v);
        forget(assignedIn(e));barrier();
        // rustc follows only the taken edge of an if on a known condition, so a diverging taken branch ends the block
        div=known?(c.v?dt:!!e.els&&de):!!e.els&&dt&&de;
        if(known&&div&&doubtful(e.cond,c)){unsup('const folding',e.cond.line);div=false;}
        return null;
      }
      case 'Loop':
        loopBody(e,null);
        div=!hasBreak(e.body);return null;
      case 'While':{
        const c=loopBody(e,e.cond);
        // rustc treats a while on a known-true condition with no break like loop {}: nothing after it is reachable
        div=!!c&&c.k==='bool'&&c.v===true&&!hasBreak(e.body);
        if(div&&doubtful(e.cond,c)){unsup('const folding',e.cond.line);div=false;}
        return null;
      }
      case 'For':{
        const r=peel(e.iter);
        if(r.from)ev(r.from);if(r.to)ev(r.to);
        loopBody(e,null);return null;
      }
      default:return null;
    }
  }

  function constKnown(n){
    if(constVals.has(n))return constVals.get(n);
    constVals.set(n,null);
    const c=consts.get(n),keep=[st,constLine,dead];
    st=new Map();constLine=c.line;dead=0;
    const v=ev(c.init);
    [st,constLine,dead]=keep;
    constVals.set(n,v);return v;
  }

  for(const n of consts.keys())constKnown(n);
  for(const it of ast.items){
    if(it.t!=='Fn'||!it.body)continue;
    st=new Map();dead=0;barriers=0;div=false;borrowed=new Set();
    RQ.walk(it.body,n=>{
      let root=null;
      if(n.t==='Ref'&&n.expr)root=rootBind(n.expr); // a type's Ref has no expr
      else if(n.t==='MethodCall'){const r=(info.get(n)||{}).recv;if(r&&r.adj!=='val')root=rootBind(n.recv);}
      if(root)borrowed.add(root);
    });
    block(it.body);
  }
  const by=(a,b)=>a.line-b.line||(a.col||0)-(b.col||0);
  return {errors:errors.sort(by),unsupported:un.sort(by)};
};
})();
