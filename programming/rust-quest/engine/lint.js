/* The deny-by-default lints rustc runs on a program that type-checks: overflowing_literals on every literal, and
   arithmetic_overflow and unconditional_panic on the operations whose operands rustc can work out ahead of time. This
   models the folding rustc's probes showed (see tests/rust/lint.test.mjs). A shape whose folding is not verified comes out
   as unsupported('const folding'), never as ok. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const peel=RQ.peel;
const ARITH={'+':1,'-':1,'*':1};
const FORMATS=new Set(['println','print','eprintln','eprint','format','panic','write','writeln']);

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

  let st=new Map(),dead=0,skip=0,barriers=0,div=false,constLine=0;
  const consts=new Map(),constVals=new Map();
  for(const it of ast.items)if(it.t==='Const')consts.set(it.name,it);

  const barrier=()=>{barriers++;for(const s of st.values())s.fresh=false;};
  const snap=()=>new Map([...st].map(([k,s])=>[k,{...s}]));
  // rustc follows only the taken edge of a branch on a known condition, so a trap in the other one is never linted;
  // a trap in a match arm, whose scrutinee rustc may also fold, is not judged
  function trap(id,n,o){
    if(constLine)unsup('const initializer',constLine);
    else if(skip)return;
    else if(dead)unsup('const folding',n.line);
    else flag(id,n,o);
  }
  const int=(v,ty)=>({k:'int',v,ty});
  const boolv=v=>({k:'bool',v});
  const assignedIn=n=>{const s=new Set();RQ.walk(n,x=>{if(x.t==='Assign'){const b=bindOf(x);if(b)s.add(b);}});return s;};
  // rustc keeps the value of a local assigned once for the whole fn, and of one assigned more than once only inside the block
  // of its last store; it keeps none for a local whose address is taken anywhere in the fn
  const valueOf=(b,s)=>s.val&&!borrowed.has(b)&&(b.assigns===0||s.fresh)?s.val:null;
  const forget=bs=>{for(const b of bs)if(st.has(b))st.get(b).val=null;};
  // a break inside a nested loop leaves that loop, not this one
  const hasBreak=n=>{let f=false;RQ.walk(n,x=>{if(x.t==='Break')f=true;if(x.t==='Loop'||x.t==='While'||x.t==='For')return false;});return f;};
  const part=(a,i)=>a&&a.k==='agg'?a.els[i]||null:null;
  function arith(op,a,b,e){
    if(op==='/'||op==='%'){
      if(b&&b.k==='int'&&b.v===0n)trap('unconditional_panic',e,{why:op==='/'?'attempt to divide by zero':'attempt to calculate the remainder with a divisor of zero'});
      else if(a&&b&&a.k==='int'&&b.k==='int'&&a.ty[0]==='i'&&a.v===INT[a.ty][0]&&b.v===-1n)unsup('integer overflow',e.line);
      else if(a&&b&&a.k==='int'&&b.k==='int')return int(op==='/'?a.v/b.v:a.v%b.v,a.ty);
      return null;
    }
    if(!a||!b||a.k!=='int'||b.k!=='int')return null;
    const r=op==='+'?a.v+b.v:op==='-'?a.v-b.v:a.v*b.v;
    if(!fits(r,a.ty)){trap('arithmetic_overflow',e,{});return null;}
    return int(r,a.ty);
  }
  function compare(op,a,b){
    if(!a||!b||a.k!==b.k||(a.k!=='int'&&a.k!=='bool'))return null;
    const x=a.v,y=b.v;
    const r={'==':x===y,'!=':x!==y,'<':x<y,'>':x>y,'<=':x<=y,'>=':x>=y}[op];
    return r===undefined?null:boolv(r);
  }

  // the arm of a desugared destructuring let holds the rest of the block, so it is straight-line code
  function destructure(p,v,fresh){
    if(p.t==='IdentPat'){const bd=!p.sub&&!p.byRef&&bindOf(p);if(bd)st.set(bd,{val:v,fresh});}
    else if(p.t==='TuplePat'&&v&&v.k==='agg'&&v.els.length===p.pats.length&&!p.pats.some(x=>x.t==='Rest'))p.pats.forEach((x,i)=>destructure(x,part(v,i),fresh));
  }

  function block(b){
    for(const s of b.stmts){
      if(div)return null;
      if(s.t==='Let'){
        if(!s.init)continue; // a deferred let has no value to fold
        const v=ev(s.init);
        if(s.pat.t==='IdentPat'){const bd=bindOf(s.pat);if(bd)st.set(bd,{val:v,fresh:true});}
      }else if(s.t==='ExprStmt')ev(s.expr);
    }
    return div||!b.tail?null:ev(b.tail);
  }
  // the live branch runs as written; a branch the condition rules out is judged only as far as rustc is known to ignore it
  function branch(b,live){
    const was=div;
    if(!live)skip++;
    block(b);
    if(!live)skip--;
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
          return valueOf(b,s);
        }
        const n=e.segs[0].name;
        if(!consts.has(n))return null;
        return constKnown(n);
      }
      case 'Unary':{
        const x=peel(e.expr);
        if(e.op==='-'&&x.t==='Lit'&&x.kind==='int')return badLit.has(x)?null:int(-BigInt(x.v),rtyOf(x));
        const a=ev(e.expr);
        if(e.op==='!')return a&&a.k==='bool'?boolv(!a.v):null;
        if(a&&a.k==='int'&&a.ty[0]==='i'&&a.v===INT[a.ty][0]){trap('arithmetic_overflow',e,{});barrier();return null;}
        barrier();
        return a&&a.k==='int'?int(-a.v,a.ty):null;
      }
      case 'Binary':{
        const op=e.op;
        if(op==='&&'||op==='||'){
          const a=ev(e.lhs);
          if(a&&a.k==='bool'&&a.v===(op==='||'))return a;
          const b=ev(e.rhs);
          return a&&b&&a.k==='bool'&&b.k==='bool'?boolv(op==='&&'?a.v&&b.v:a.v||b.v):null;
        }
        const a=ev(e.lhs),b=ev(e.rhs);
        if(ARITH[op]||op==='/'||op==='%'){const r=arith(op,a,b,e);barrier();return r;}
        if(op==='&'||op==='|'||op==='^'){
          return a&&b&&a.k==='int'&&b.k==='int'?int(op==='&'?a.v&b.v:op==='|'?a.v|b.v:a.v^b.v,a.ty):null;
        }
        return compare(op,a,b);
      }
      case 'Cast':{
        const a=ev(e.expr),t=e.ty.t==='Path'?e.ty.segs[0].name:'';
        return a&&a.k==='int'&&INT[t]?int(wrap(a.v,t),t):null;
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
      case 'Try':ev(e.expr);barrier();return null;
      case 'Assign':{
        // a write to a field leaves the folded value of its root unknown
        if(e.lhs.t==='Field'||e.lhs.t==='Index'){
          ev(e.rhs);
          const rb=rootBind(e.lhs);
          if(rb)forget([rb]);
          barrier();return null;
        }
        // *r = v: lints in v still fire, but nothing is stored and nothing folded (the Deref's .bind is the reference, not the target)
        if(e.lhs.t==='Deref'){ev(e.rhs);barrier();return null;}
        const b=bindOf(e);
        let r=ev(e.rhs);
        if(e.op!=='='){
          const s=b&&st.get(b),cur=s&&valueOf(b,s);
          r=arith(e.op.slice(0,-1),cur,r,e);barrier();
        }
        if(b&&st.has(b)){const s=st.get(b);s.val=r;s.fresh=true;}
        return null;
      }
      case 'Call':case 'Macro':{
        const args=e.t==='Call'?e.args:[...(e.args||[]),...e.named.map(x=>x.expr)];
        for(const a of args)ev(a);
        barrier();
        if(e.name==='panic')div=true;
        return null;
      }
      case 'Index':{
        const a=ev(e.expr),i=ev(e.index),n=(info.get(e)||{}).alen;
        if(i&&i.k==='int'&&n!==undefined&&i.v>=BigInt(n))trap('unconditional_panic',e,{why:'index out of bounds: the length is '+n+' but the index is '+i.v});
        barrier();
        return i&&i.k==='int'&&part(a,Number(i.v));
      }
      case 'Closure':{
        // the body runs later and its captures are unknown here, but a lint inside it is still rustc's
        const keep=st,was=div;
        st=new Map();div=false;
        ev(e.body);
        st=keep;div=was;
        forget(assignedIn(e));barrier();
        return null;
      }
      case 'Tuple':case 'Array':return {k:'agg',els:e.elems.map(ev)};
      case 'StructLit':for(const f of e.fields)ev(f.expr);return null;
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
          if(known&&c.v)skip++;
          ev(e.els);
          if(known&&c.v)skip--;
          de=div;div=was;
        }else if(e.els)de=branch(e.els,!known||!c.v);
        forget(assignedIn(e));barrier();
        // rustc follows only the taken edge of an if on a known condition, so a diverging taken branch ends the block
        div=known?(c.v?dt:!!e.els&&de):!!e.els&&dt&&de;
        return null;
      }
      case 'Match':{
        if(e.kind==='let'){
          const before=barriers,v=ev(e.scrut);
          destructure(e.arms[0].pat,v,barriers===before);
          return ev(e.arms[0].body);
        }
        ev(e.scrut);barrier();
        const base=snap();
        let all=e.arms.length>0;
        // rustc may fold the scrutinee and drop the arms it rules out, which the lint pass cannot tell, so no arm is judged
        for(const a of e.arms){
          st=new Map([...base].map(([k,v])=>[k,{...v}]));
          const was=div;
          dead++;
          if(a.body.t==='Block')block(a.body);else ev(a.body);
          dead--;
          all=all&&div;div=was;
        }
        st=base;forget(assignedIn(e));barrier();
        div=all;return null;
      }
      case 'Loop':
        loopBody(e,null);
        div=!hasBreak(e.body);return null;
      case 'While':{
        const c=loopBody(e,e.cond);
        // rustc treats a while on a known-true condition with no break like loop {}: nothing after it is reachable
        div=!!c&&c.k==='bool'&&c.v===true&&!hasBreak(e.body);
        return null;
      }
      case 'For':{
        const r=peel(e.iter);
        if(r.t==='Range'){if(r.from)ev(r.from);if(r.to)ev(r.to);}else ev(e.iter);
        loopBody(e,null);return null;
      }
      default:return null;
    }
  }

  function constKnown(n){
    if(constVals.has(n))return constVals.get(n);
    constVals.set(n,null);
    const c=consts.get(n),keep=[st,constLine,dead,skip];
    st=new Map();constLine=c.line;dead=0;skip=0;
    const v=ev(c.init);
    [st,constLine,dead,skip]=keep;
    constVals.set(n,v);return v;
  }

  for(const n of consts.keys())constKnown(n);
  const fns=RQ.fnItems(ast).map(x=>x.f);
  for(const it of fns){
    if(it.t!=='Fn'||!it.body)continue;
    st=new Map();dead=skip=0;barriers=0;div=false;borrowed=new Set();
    RQ.walk(it.body,n=>{
      let root=null;
      if(n.t==='Ref'&&n.expr)root=rootBind(n.expr); // a type's Ref has no expr
      else if(n.t==='MethodCall'){
        const i=info.get(n)||{},r=i.recv,u=i.um;
        if(r&&r.adj!=='val'||u&&!u.ref&&(u.adj==='&'||u.adj==='&mut'))root=rootBind(n.recv);
      }
      if(root)borrowed.add(root);
      if(n.t==='Macro'&&n.args&&FORMATS.has(n.name)){
        // format_args! takes `&arg` for every argument, and for every `{name}` it captures
        const at=n.name==='write'||n.name==='writeln'?1:0;
        for(const a of [...n.args.slice(at+1),...n.named.map(x=>x.expr)]){const b=rootBind(a);if(b)borrowed.add(b);}
        const f=n.args[at];
        if(f&&f.t==='Lit'&&f.kind==='str')for(const c of (info.get(f)||{}).caps||[])if(c.bind)borrowed.add(c.bind);
      }
      if(n.t==='Closure'&&!n.move){
        // a non-move closure holds the outer vars it names by reference, as a Ref does
        const own=new Set(),used=[];
        RQ.walk(n,x=>{if(x.t==='IdentPat'){const b=bindOf(x);if(b)own.add(b);}else if(x.t==='Path'){const b=bindOf(x);if(b)used.push(b);}});
        for(const b of used)if(!own.has(b))borrowed.add(b);
      }
    });
    block(it.body);
  }
  const by=(a,b)=>a.line-b.line||(a.col||0)-(b.col||0);
  return {errors:errors.sort(by),unsupported:un.sort(by)};
};
})();
