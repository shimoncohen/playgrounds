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
  const isRef=e=>{const t=(info.get(e)||{}).ty;return !!t&&RQ.types.res(t).k==='ref';};
  // the local a place hangs off: x for x, x.0 and x[i]
  const rootBind=n=>{n=peel(n);while(n.t==='Field'||n.t==='Index')n=peel(n.expr);return n.t==='Path'?bindOf(n):null;};
  let shaky=new Set();
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

  let st=new Map(),defVal=new Map(),outerDef=null,keeps=[],dead=0,skip=0,prune=0,unsure=0,bor=0,softK=0,dub=0,frames=[],barriers=0,div=false,constLine=0;
  const consts=new Map(),constVals=new Map();
  for(const it of ast.items)if(it.t==='Const')consts.set(it.name,it);

  const barrier=()=>{barriers++;for(const s of st.values())s.fresh=false;};
  const snap=()=>new Map([...st].map(([k,s])=>[k,{...s}]));
  // rustc follows only the taken edge of a branch on a known condition, so a trap in the other one is never linted;
  // a trap in a match arm whose scrutinee this pass cannot decide, or on a value whose known-ness is in doubt, is unsupported
  const isLit=x=>{x=peel(x);if(x.t==='Unary'&&x.op==='-')x=peel(x.expr);return x.t==='Lit'&&x.kind==='int';};
  const litOnly=n=>n.t==='Binary'?isLit(n.lhs)&&isLit(n.rhs):n.t==='Unary'&&isLit(n.expr);
  function trap(id,n,o,d){
    if(constLine)unsup('const initializer',constLine);
    else if(skip){
      // rustc promotes a borrowed constant expression and lints its overflow wherever it sits in the code it built; it prunes the
      // dead side of a literal condition and of a literal pattern, and evaluates nothing else there
      if(prune||!bor||id!=='arithmetic_overflow')return;
      if(litOnly(n)){if(unsure)unsup('const folding',n.line);else flag(id,n,o);}
      else{let c=false;RQ.walk(n,x=>{if(x.t==='Path'&&!bindOf(x)&&consts.has(x.segs[0].name))c=true;});if(c)unsup('const folding',n.line);}
    }else if(dead||dub||d)unsup('const folding',n.line);
    else flag(id,n,o);
  }
  const int=(v,ty,d)=>({k:'int',v,ty,d});
  const dbt=(a,b)=>!!((a&&a.d)||(b&&b.d));
  const doubt=v=>v&&{...v,d:true};
  // rustc folds one level of aggregate: what sits inside a nested one is unknown to it
  const nest=els=>els.map(v=>v&&v.k==='agg'?null:v);
  const boolv=(v,d,lit)=>({k:'bool',v,d,lit});
  const assignedIn=n=>{const s=new Set();RQ.walk(n,x=>{if(x.t==='Assign'){const b=bindOf(x)||rootBind(x.lhs);if(b)s.add(b);}});return s;};
  // rustc keeps the value of a local assigned once for the whole fn, and of one assigned more than once only inside the block
  // of its last store; it keeps none for a local whose address is taken anywhere in the fn
  const valueOf=(b,s)=>!s.val||borrowed.has(b)?null:s.doubt||shaky.has(b)?doubt(s.val):b.assigns===0||s.fresh?s.val:null;
  // after a shape whose effect on rustc's folding is not decided, what was known stays known but only blocks a verdict
  const doubtAll=()=>{for(const s of st.values())if(s.val)s.doubt=true;for(const [b,v] of defVal)defVal.set(b,doubt(v));};
  const forget=bs=>{for(const b of bs)if(st.has(b))st.get(b).val=null;};
  const firstKind=m=>m.arms[0]&&!m.arms[0].guard?patKind(m.arms[0].pat):'ref';
  const containsExit=n=>{let f=false;RQ.walk(n,x=>{if(x.t==='Break'||x.t==='Continue')f=true;});return f;};
  const isExit=x=>(x.t==='ExprStmt'?x=x.expr:x).t==='Return'||x.t==='Break'&&!x.label;
  // a break through no switch: only a plain block or an irrefutable match stands between it and the loop
  const plainBreak=n=>{
    if(!n)return false;
    if(n.t==='ExprStmt')return plainBreak(n.expr);
    if(n.t==='Paren')return plainBreak(n.expr);
    if(n.t==='Break')return !n.label;
    if(n.t==='Block')return !n.label&&(n.stmts.some(plainBreak)||plainBreak(n.tail));
    if(n.t==='Match'&&firstKind(n)!=='ref')return n.arms.some(a=>plainBreak(a.body));
    return false;
  };
  const hasBreak=n=>{let f=false;RQ.walk(n,x=>{if(x.t==='Break')f=true;if(x.t==='Loop'||x.t==='While'||x.t==='For')return false;});return f;};
  const part=(a,i)=>{const v=a&&a.k==='agg'?(typeof i==='string'?a.by&&a.by[i]:a.els[i])||null:null;return v&&a.d?doubt(v):v;};
  const leftTy=e=>{const t=e.t==='Assign'&&e.lhs.t==='Path'?(bindOf(e)||{}).ty:(info.get(e.lhs)||{}).ty,r=t&&RQ.types.res(t);return r?r.k==='int'?r.ty:r.k==='ivar'?'i32':null:null;};
  function arith(op,a,b,e){
    if(op==='/'||op==='%'){
      if(b&&b.k==='int'&&b.v===0n)trap('unconditional_panic',e,{why:op==='/'?'attempt to divide by zero':'attempt to calculate the remainder with a divisor of zero'},dbt(a,b));
      else if(a&&b&&a.k==='int'&&b.k==='int'&&a.ty[0]==='i'&&a.v===INT[a.ty][0]&&b.v===-1n)unsup('integer overflow',e.line);
      else if(a&&b&&a.k==='int'&&b.k==='int')return int(op==='/'?a.v/b.v:a.v%b.v,a.ty,dbt(a,b));
      return null;
    }
    if(op==='<<'||op==='>>'){
      // rustc checks the amount against the width of the left side's type even when the left side is not known
      const lt=a&&a.k==='int'?a.ty:leftTy(e);
      if(!b||b.k!=='int'||!lt)return null;
      if(b.v<0n||b.v>=BigInt(lt.endsWith('size')?64:lt.slice(1))){trap('arithmetic_overflow',e,{},dbt(a,b));return null;}
      return a&&a.k==='int'?int(op==='<<'?wrap(a.v<<b.v,lt):a.v>>b.v,lt,dbt(a,b)):null;
    }
    if(!a||!b||a.k!=='int'||b.k!=='int')return null;
    const r=op==='+'?a.v+b.v:op==='-'?a.v-b.v:a.v*b.v;
    if(!fits(r,a.ty)){trap('arithmetic_overflow',e,{},dbt(a,b));return null;}
    return int(r,a.ty,dbt(a,b));
  }
  function compare(op,a,b){
    if(!a||!b||a.k!==b.k||(a.k!=='int'&&a.k!=='bool'))return null;
    const x=a.v,y=b.v;
    const r={'==':x===y,'!=':x!==y,'<':x<y,'>':x>y,'<=':x<=y,'>=':x>=y}[op];
    return r===undefined?null:boolv(r,dbt(a,b));
  }

  // 'irr': no switch is built; 'ref': a real switch; 'maybe': cannot tell cheaply
  function patKind(p){
    const all=ps=>{const ks=ps.map(x=>x.t==='Rest'?'maybe':patKind(x));return ks.includes('ref')?'ref':ks.every(k=>k==='irr')?'irr':'maybe';};
    switch(p.t){
      case 'Wild':return 'irr';
      case 'IdentPat':return !bindOf(p)?'ref':p.byRef?'maybe':p.sub?(patKind(p.sub)==='ref'?'ref':'maybe'):'irr';
      case 'TuplePat':return all(p.pats);
      case 'Or':{const ks=p.alts.map(patKind);return ks.every(k=>k==='ref')?'ref':'maybe';}
      case 'RefPat':return patKind(p.pat)==='ref'?'ref':'maybe';
      case 'StructPat':case 'TupleStructPat':{
        const segs=p.path.segs,last=segs[segs.length-1].name;
        const item=ast.items.find(i=>(i.t==='Struct'&&segs.length===1&&i.name===last)||(i.t==='Enum'&&segs.length===2&&i.name===segs[0].name));
        // a struct is one shape; an enum variant is a switch unless the enum has a single variant
        if(!item||item.t==='Enum'&&item.variants.length>1)return 'ref';
        const k=p.t==='StructPat'?all(p.fields.map(f=>f.pat)):all(p.pats);
        return item.t==='Enum'&&k!=='ref'?'maybe':k;
      }
      default:return 'ref';
    }
  }

  // the arm of a desugared destructuring let holds the rest of the block, so it is straight-line code
  function destructure(p,v,fresh,sub){
    if(p.t==='IdentPat'){const bd=(sub||!p.sub)&&!p.byRef&&bindOf(p);if(bd)st.set(bd,{val:v,fresh});}
    else if((p.t==='TuplePat'||p.t==='TupleStructPat')&&v&&v.k==='agg'&&v.els.length===p.pats.length&&!p.pats.some(x=>x.t==='Rest'))p.pats.forEach((x,i)=>destructure(x,part(v,i),fresh,sub));
    else if(p.t==='StructPat'&&v&&v.k==='agg'&&v.by)p.fields.forEach(f=>destructure(f.pat,part(v,f.name),fresh,sub));
  }

  const litVal=n=>n.t==='Unary'?-litVal(n.expr):n.t==='Lit'&&n.kind==='bool'?n.v:n.t==='Lit'&&n.kind==='int'?BigInt(n.v):null;
  // alternatives as {k:'any'}, {k:'lit',v} or {k:'range',lo,hi,incl}; null for any other shape
  function normPat(p){
    const lit=x=>{const v=litVal(x);return typeof v==='bigint'?v:null;};
    switch(p.t){
      case 'Wild':return [{k:'any'}];
      case 'IdentPat':return p.byRef||!bindOf(p)?null:p.sub?normPat(p.sub):[{k:'any'}];
      case 'LitPat':{const v=lit(p.lit);return v===null?null:[{k:'lit',v}];}
      case 'RangePat':{
        if(!p.lo||!p.hi)return null;
        const lo=lit(p.lo),hi=lit(p.hi);
        if(lo===null||hi===null)return null;
        return p.inclusive&&lo===hi?[{k:'lit',v:lo}]:[{k:'range',lo,hi,incl:p.inclusive}];
      }
      case 'Or':{
        const out=[];
        for(const x of p.alts){const r=x.t==='Or'||x.t==='IdentPat'&&x.sub?null:normPat(x);if(!r)return null;out.push(...r);}
        return out;
      }
      default:return null;
    }
  }
  // only a comparison or flag: evaluating it early must not change anything
  const simpleGuard=g=>{
    g=peel(g);
    if(g.t==='Unary'&&g.op==='!'&&nots(g)===1)g=peel(g.expr);
    if(g.t==='Path')return true;
    if(g.t!=='Binary'||!['==','!=','<','>','<=','>='].includes(g.op))return false;
    const operand=x=>{x=peel(x);if(x.t==='Unary'&&x.op==='-')x=peel(x.expr);return x.t==='Path'||x.t==='Lit'&&x.kind==='int';};
    return operand(g.lhs)&&operand(g.rhs);
  };
  // rustc tests the first candidate (an or-pattern is one per alternative); a candidate no test reaches is never lowered. Null: not modeled.
  function lowerMatch(e){
    const arms=e.arms,C=[];
    for(let i=0;i<arms.length;i++){
      const x=normPat(arms[i].pat),g=arms[i].guard;
      if(!x||g&&!simpleGuard(g))return null;
      for(const a of x)C.push({i,a,g});
    }
    const INF=10n**30n,N=[],add=o=>N.push(o)-1,bodies=[],guarded=new Set();
    const span=a=>a.k==='lit'?[a.v,a.v]:a.k==='range'?[a.lo,a.incl?a.hi:a.hi-1n]:[-INF,INF];
    const body=i=>bodies[i]??(bodies[i]=add({t:'arm',i}));
    const matched=(cs,f)=>{
      const k=cs.findIndex(x=>!x.g);
      return (k<0?cs:cs.slice(0,k+1)).reduceRight((next,x)=>x.g?(guarded.add(x.i),add({t:'bool',g:x.g,f:next,o:body(x.i)})):body(x.i),f);
    };
    function tests(L,fail){
      if(!L.length)return fail;
      const c=L[0];
      if(c.a.k==='any')return c.g?matched([c],tests(L.slice(1),fail)):body(c.i);
      if(c.a.k==='range'){
        const [lo,hi]=span(c.a),miss=[];
        let stop=L.length;
        const same=[c];
        for(let j=1;j<L.length;j++){
          const [a,b]=span(L[j].a);
          if(L[j].a.k==='range'&&a===lo&&b===hi)same.push(L[j]);
          else if(L[j].a.k==='any'||a<=hi&&b>=lo){stop=j;break;}
          else miss.push(L[j]);
        }
        const rem=tests(L.slice(stop),fail);
        return add({t:'cmp',lo,hi,f:miss.length?tests(miss,rem):rem,o:matched(same,rem)});
      }
      const vals=[],by=new Map(),other=[];
      let stop=L.length;
      for(let j=0;j<L.length;j++){
        const x=L[j],[a,b]=span(x.a);
        if(x.a.k==='lit'&&!other.some(y=>{const [c,d]=span(y.a);return a>=c&&a<=d;})){if(!by.has(a)){by.set(a,[]);vals.push(a);}by.get(a).push(x);}
        else if(x.a.k==='range'&&!vals.some(v=>v>=a&&v<=b))other.push(x);
        else{stop=j;break;}
      }
      const rem=tests(L.slice(stop),fail);
      return add({t:'sw',vals:vals.map(v=>[v,matched(by.get(v),rem)]),o:other.length?tests(other,rem):rem});
    }
    const start=tests(C,-1);
    return {N,start,guarded};
  }
  const hasBinding=p=>{let f=false;RQ.walk(p,x=>{if(x.t==='IdentPat'&&bindOf(x))f=true;});return f;};
  // a guarded arm's bindings borrow the scrutinee, so rustc loses it: a local for the whole fn, any other value but a literal for the match
  const guardBinds=m=>{
    const low=lowerMatch(m);
    return !!low&&m.arms.some((a,i)=>a.guard&&low.guarded.has(i)&&hasBinding(a.pat));
  };
  // without a lowering it is not known which guarded arms rustc builds, so the scrutinee only blocks a verdict
  const guardMaybe=m=>!lowerMatch(m)&&m.arms.some(a=>a.guard&&hasBinding(a.pat));
  // the lint walks depth first: only the otherwise-edge chain from the match keeps what was known. Arms are 'full', 'blank' or 'skip'; null: not modeled.
  function matchPlan(e,sv){
    const low=lowerMatch(e);
    if(!low||sv&&(sv.d||sv.k!=='int'))return null;
    const {N,start}=low,seen=new Set(),out=new Array(e.arms.length).fill('skip'),stack=[[start,'full']];
    while(stack.length){
      const [id,state]=stack.pop();
      if(id<0||seen.has(id))continue;
      seen.add(id);
      const x=N[id],known=sv&&state==='full';
      let succ;
      if(x.t==='arm'){out[x.i]=state;continue;}
      if(x.t==='sw'){
        const hit=known&&x.vals.find(([v])=>v===sv.v);
        succ=known?[hit?hit[1]:x.o]:[...x.vals.map(([,t])=>t),x.o];
      }else if(x.t==='cmp')succ=known?[sv.v>=x.lo&&sv.v<=x.hi?x.o:x.f]:[x.f,x.o];
      else{
        const c=state==='full'?ev(x.g):blank(()=>ev(x.g));
        if(c&&(c.k!=='bool'||c.d||c.lit))return null;
        // `!c` as a guard switches on `c` with the two edges the other way round
        succ=c?[c.v?x.o:x.f]:nots(x.g)?[x.o,x.f]:[x.f,x.o];
      }
      succ=succ.filter(t=>t>=0);
      succ.forEach((t,j)=>stack.push([t,j===succ.length-1?state:'blank']));
    }
    return out;
  }
  function pickArm(e,sv){
    if(!sv||sv.d||sv.k!=='int'&&sv.k!=='bool')return -1;
    const hit=p=>{
      if(p.t==='Wild')return true;
      if(p.t==='IdentPat')return !p.sub&&!p.byRef&&!!bindOf(p)?true:undefined;
      if(p.t==='LitPat'){const v=litVal(p.lit);return v===null?undefined:v===sv.v;}
      if(p.t==='RangePat'&&sv.k==='int'&&p.lo&&p.hi){
        const a=litVal(p.lo),b=litVal(p.hi);
        return typeof a==='bigint'&&typeof b==='bigint'?sv.v>=a&&(p.inclusive?sv.v<=b:sv.v<b):undefined;
      }
      if(p.t==='Or'){let r=false;for(const x of p.alts){const h=hit(x);if(h===undefined)return undefined;r=r||h;}return r;}
      return undefined;
    };
    if(e.arms.some(a=>a.guard))return -1;
    for(let i=0;i<e.arms.length;i++){const h=hit(e.arms[i].pat);if(h===undefined)return -1;if(h)return i;}
    return -1;
  }
  function stmt(s){
    if(s.t==='Let'){
      if(!s.init){
        const bd=s.pat.t==='IdentPat'&&bindOf(s.pat);
        if(bd)st.set(bd,{val:null,fresh:true});
        return;
      }
      let v=ev(s.init);
      if(s.pat.t==='IdentPat'){
        const bd=bindOf(s.pat);
        // rustc keeps nothing of an aggregate copied whole from a local, nor of an array that is stored more than once
        if(v&&v.k==='agg'&&(peel(s.init).t==='Path'||v.arr&&bd&&bd.assigns>0))v=null;
        if(bd)st.set(bd,{val:v,fresh:true});
      }
    }else if(s.t==='ExprStmt')ev(s.expr);
  }
  // code after an if or match on a known value still exists for rustc, which lints its borrowed constant expressions: it is
  // evaluated with the trap rules of a skipped region
  function block(b){
    let k=0;
    const enter=()=>{k=softK;softK=0;div=false;skip++;if(k===2)prune++;else if(k===3)unsure++;};
    const leave=()=>{if(k){skip--;if(k===2)prune--;else if(k===3)unsure--;div=true;}};
    for(const s of b.stmts){
      if(div){if(!softK||k){leave();return null;}enter();}
      stmt(s);
    }
    if(div&&softK&&!k)enter();
    const r=div||!b.tail?null:ev(b.tail);
    leave();
    return r;
  }
  // a loop whose body ends in a direct break or return, with no break or continue before it, has no back edge: rustc sees
  // straight-line code up to there, and nothing after the loop is reachable when the body diverges first
  function straightLoop(b){
    const items=[...b.stmts,...(b.tail?[b.tail]:[])];
    for(const s of items){
      if(div)return null;
      const x=s.t==='ExprStmt'?s.expr:s;
      if(x.t==='Break')return x.expr?ev(x.expr):null;
      if(s===b.tail)ev(s);else stmt(s);
    }
    return null;
  }
  // the live branch runs as written; a trap in a branch the condition rules out is never linted
  // rustc skips the const-prop state a switch had when it enters a block through one of the switch's value targets (the else of
  // an if, a literal arm): what was known before the switch is unknown there, what the block assigns itself is known
  function blank(f){
    const keep=st,keepOuter=outerDef;
    // inside a loop a local known before the loop and not assigned in it stays known
    const kept=b=>keeps.some(k=>k.has(b));
    st=new Map([...st].map(([k,s])=>[k,kept(k)?{...s}:{...s,val:null,doubt:false}]));
    outerDef=new Set([...(outerDef||[]),...[...defVal.keys()].filter(b=>!kept(b))]);
    const r=f();
    st=keep;outerDef=keepOuter;return r;
  }
  const nots=c=>{let n=0,x=peel(c);while(x.t==='Unary'&&x.op==='!'){n++;x=peel(x.expr);}return n;};
  const isLitPat=(p,kind)=>p.t==='LitPat'&&(kind==='bool'?peel(p.lit).kind==='bool':typeof litVal(p.lit)==='bigint')||p.t==='Or'&&p.alts.every(x=>x.t==='LitPat'&&typeof litVal(x.lit)==='bigint');
  // which arms of a match on a value rustc does not know enter through a value target ('blank') or the otherwise edge ('full')
  function armStates(e){
    const a=e.arms,n=a.length;
    if(n<2||a.some(x=>x.guard))return null;
    const last=a[n-1].pat,catchAll=last.t==='Wild'||last.t==='IdentPat'&&!last.sub&&!last.byRef&&!!bindOf(last);
    if(catchAll&&a.slice(0,n-1).every(x=>isLitPat(x.pat,'int'))){
      const vs=a.slice(0,n-1).flatMap(x=>(x.pat.t==='Or'?x.pat.alts:[x.pat]).map(y=>litVal(y.lit)));
      if(new Set(vs).size===vs.length)return a.map((x,i)=>i<n-1?'blank':'full');
    }
    const rng=p=>p.t==='RangePat'&&p.lo&&p.hi&&typeof litVal(p.lo)==='bigint'&&typeof litVal(p.hi)==='bigint';
    if(n===2&&catchAll&&rng(a[0].pat))return ['full','blank'];
    if(n===2&&isLitPat(a[0].pat,'bool')&&isLitPat(a[1].pat,'bool')){
      const v0=peel(a[0].pat.lit).v,v1=peel(a[1].pat.lit).v;
      if(v0!==v1)return v0?['full','blank']:['blank','full'];
    }
    return null;
  }
  // code after an if whose diverging side leaves only a value-target edge into it starts with nothing known; inside a loop the
  // effect of break and return is not pinned, so what was known only blocks a verdict
  function blankAfter(pre){
    if(keeps.length){doubtAll();return;}
    for(const s of st.values()){s.val=null;s.doubt=false;}
    for(const b of pre)defVal.delete(b);
  }
  const hasReturn=n=>{let f=false;RQ.walk(n,x=>{if(x.t==='Return')f=true;});return f;};
  function branch(b,live,pr){
    const was=div;
    if(!live){skip++;if(pr)prune++;}
    block(b);
    if(!live){skip--;if(pr)prune--;}
    const d=div;div=was;return d;
  }
  let lastFrame=null;
  function loopBody(n,cond){
    forget(assignedIn(n));barrier();
    const c=cond?ev(cond):null;
    barrier();
    const fr={n:0,vals:[],bad:false},d=c&&c.d?1:0;
    const noBack=[...n.body.stmts,...(n.body.tail?[n.body.tail]:[])].some(isExit);
    keeps.push(noBack?new Set():new Set([...st].filter(([,s])=>s.val).map(([k])=>k)));
    frames.push(fr);dub+=d;
    if(cond&&!(c&&c.k==='bool')&&nots(cond)===1)blank(()=>branch(n.body,true,false));
    else branch(n.body,!(c&&c.k==='bool'&&c.v===false&&!c.d),c&&c.lit);
    dub-=d;frames.pop();keeps.pop();lastFrame=fr;
    forget(assignedIn(n));barrier();
    return c;
  }

  function ev(e){
    switch(e.t){
      case 'Lit':{
        if(e.kind==='bool')return boolv(e.v,false,true);
        if(e.kind!=='int'||badLit.has(e))return null;
        return int(BigInt(e.v),rtyOf(e));
      }
      case 'Paren':return ev(e.expr);
      case 'Path':{
        const b=bindOf(e);
        if(b){
          if(b.deferred&&b.assigns===1){const v=defVal.get(b);return v&&!borrowed.has(b)&&!(outerDef&&outerDef.has(b))?v:null;}
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
        if(e.op==='!')return a&&a.k==='bool'?boolv(!a.v,a.d,a.lit):null;
        if(a&&a.k==='int'&&a.ty[0]==='i'&&a.v===INT[a.ty][0]){trap('arithmetic_overflow',e,{},a.d);barrier();return null;}
        barrier();
        return a&&a.k==='int'?int(-a.v,a.ty,a.d):null;
      }
      case 'Binary':{
        const op=e.op;
        if(op==='&&'||op==='||'){
          const a=ev(e.lhs);
          barrier();
          if(a&&a.k==='bool'&&a.v===(op==='||'))return a;
          const b=op==='||'&&!(a&&a.k==='bool')?blank(()=>ev(e.rhs)):ev(e.rhs);
          barrier();
          return a&&b&&a.k==='bool'&&b.k==='bool'?boolv(op==='&&'?a.v&&b.v:a.v||b.v,dbt(a,b)):null;
        }
        const a=ev(e.lhs),b=ev(e.rhs);
        if(ARITH[op]||op==='/'||op==='%'||op==='<<'||op==='>>'){
          // a reference operand makes it a call of std's impl, which rustc neither folds nor lints
          const r=isRef(e.lhs)||isRef(e.rhs)?null:arith(op,a,b,e);
          barrier();
          return r;
        }
        if(op==='&'||op==='|'||op==='^'){
          return a&&b&&a.k==='int'&&b.k==='int'?int(op==='&'?a.v&b.v:op==='|'?a.v|b.v:a.v^b.v,a.ty,dbt(a,b)):null;
        }
        return compare(op,a,b);
      }
      case 'Cast':{
        const a=ev(e.expr),t=e.ty.t==='Path'?e.ty.segs[0].name:'';
        return a&&a.k==='int'&&INT[t]?int(wrap(a.v,t),t,a.d):null;
      }
      case 'Ref':{
        bor++;ev(e.expr);bor--;
        // a &mut hands out a way to change the value that rustc's folding may or may not see
        if(e.mut){const b=rootBind(e.expr);if(b)forget([b]);barrier();}
        return null;
      }
      case 'Deref':ev(e.expr);return null;
      case 'MethodCall':{
        const i=info.get(e)||{},u=i.um,ar=i.recv&&i.recv.adj!=='val'||u&&!u.ref&&(u.adj==='&'||u.adj==='&mut');
        if(ar)bor++;
        ev(e.recv);
        if(ar)bor--;
        for(const a of e.args)ev(a);
        barrier();return null;
      }
      case 'Try':ev(e.expr);barrier();return null;
      case 'Assign':{
        // a write to a field leaves the folded value of its root unknown
        if(e.lhs.t==='Field'||e.lhs.t==='Index'){
          const r=ev(e.rhs);
          let x=peel(e.lhs);
          while(x.t==='Field')x=peel(x.expr);
          if(x.t==='Index')ev(x);
          if(e.op==='/='||e.op==='%=')arith(e.op[0],null,r,e);
          else if(e.op==='<<='||e.op==='>>=')arith(e.op.slice(0,-1),null,r,e);
          const rb=rootBind(e.lhs);
          if(rb)forget([rb]);
          barrier();return null;
        }
        // *r = v: lints in v still fire, but nothing is stored and nothing folded (the Deref's .bind is the reference, not the target)
        if(e.lhs.t==='Deref'){
          const r=ev(e.rhs);
          if(['/=','%=','<<=','>>='].includes(e.op))arith(e.op.slice(0,-1),null,r,e);
          barrier();return null;
        }
        const b=bindOf(e);
        let r=ev(e.rhs);
        // the one store of a deferred let reaches every later read, wherever in the control flow it sits
        if(b&&b.deferred&&b.assigns===1){defVal.set(b,r);if(outerDef)outerDef.delete(b);return null;}
        if(e.op!=='='){
          const s=b&&st.get(b),cur=s&&valueOf(b,s);
          r=arith(e.op.slice(0,-1),cur,r,e);barrier();
        }
        // a struct or array stored again is not folded, and neither is an aggregate copied whole from a local
        if(r&&r.k==='agg'&&(peel(e.rhs).t==='Path'||r.by||r.arr))r=null;
        if(b&&st.has(b)){const s=st.get(b);s.val=r;s.fresh=true;s.doubt=false;}
        return null;
      }
      case 'Call':case 'Macro':{
        const args=e.t==='Call'?e.args:[...(e.args||[]),...e.named.map(x=>x.expr)];
        const fmt=e.t==='Macro'&&FORMATS.has(e.name);
        if(fmt)bor++;
        const vals=args.map(ev),c=e.t==='Call'&&(info.get(e)||{}).ctor;
        if(fmt)bor--;
        if(c&&c.variant==null)return {k:'agg',els:nest(vals)};
        if(c){doubtAll();return null;}
        barrier();
        if(e.name==='panic'){div=true;softK=0;}
        return null;
      }
      case 'Index':{
        const a=ev(e.expr),i=ev(e.index),n=(info.get(e)||{}).alen;
        if(i&&i.k==='int'&&n!==undefined&&i.v>=BigInt(n))trap('unconditional_panic',e,{why:'index out of bounds: the length is '+n+' but the index is '+i.v},i.d);
        barrier();
        return i&&i.k==='int'&&part(a,Number(i.v));
      }
      case 'Closure':{
        // the body runs later and its captures are unknown here, but a lint inside it is still rustc's
        const keep=st,was=div;
        st=new Map();div=false;
        ev(e.body);
        st=keep;div=was;
        forget(assignedIn(e));
        return null;
      }
      case 'Tuple':case 'Array':return {k:'agg',arr:e.t==='Array',els:nest(e.elems.map(ev))};
      case 'StructLit':{
        const by={};
        for(const f of e.fields){const v=ev(f.expr);by[f.name]=v&&v.k==='agg'?null:v;}
        const c=(info.get(e)||{}).ctor;
        return c&&c.variant==null?{k:'agg',els:[],by}:null;
      }
      case 'ArrayRepeat':ev(e.elem);return null;
      case 'Field':return part(ev(e.expr),/^\d+$/.test(e.name)?Number(e.name):e.name);
      case 'Block':return block(e);
      case 'Return':case 'Break':{
        const v=e.expr?ev(e.expr):null;
        if(e.t==='Break'&&frames.length){
          const fr=frames[frames.length-1];
          if(e.label||skip||dead)for(const f of frames)f.bad=true;
          fr.n++;if(e.expr)fr.vals.push(v);
        }
        div=true;softK=0;return null;
      }
      case 'Continue':div=true;softK=0;return null;
      case 'If':{
        const c=ev(e.cond),known=c&&c.k==='bool'&&!c.d,nn=known?0:nots(e.cond),db=(c&&c.d)||nn>1?1:0,preDef=[...defVal.keys()];
        barrier();
        const base=snap();
        dub+=db;
        const thenBlank=!known&&nn===1,elseBlank=!known&&nn===0;
        const dt=thenBlank?blank(()=>branch(e.then,true)):branch(e.then,!known||c.v,known&&c.lit);
        st=base;
        let de=false;
        if(e.els&&e.els.t==='If'){
          const was=div;
          if(known&&c.v){skip++;if(c.lit)prune++;}
          if(elseBlank)blank(()=>ev(e.els));else ev(e.els);
          if(known&&c.v){skip--;if(c.lit)prune--;}
          de=div;div=was;
        }else if(e.els)de=elseBlank?blank(()=>branch(e.els,true)):branch(e.els,!known||!c.v,known&&c.lit);
        dub-=db;
        forget(assignedIn(e));barrier();
        // rustc follows only the taken edge of an if on a known condition, so a diverging taken branch ends the block
        div=known?(c.v?dt:!!e.els&&de):!!e.els&&dt&&de;
        softK=div&&known?(c.lit?2:1):0;
        if(!known&&nn<2&&(dt||(e.els&&de))){
          const live=[];
          if(!dt)live.push(nn===0?'full':'blank');
          if(!(e.els&&de))live.push(nn===0?'blank':'full');
          // only a return is probed; a panic leaves the code after it with what was known
          if((dt&&!hasReturn(e.then))||(e.els&&de&&!hasReturn(e.els)))doubtAll();
          else if(live.length===1&&live[0]==='blank')blankAfter(preDef);
        }
        return null;
      }
      case 'Match':{
        if(e.kind==='let'){
          const before=barriers,v=ev(e.scrut);
          destructure(e.arms[0].pat,v,barriers===before);
          return ev(e.arms[0].body);
        }
        const a0=e.arms[0],pk=firstKind(e);
        // an irrefutable first arm needs no switch, so it is straight-line code and the arms after it are unreachable, never linted
        if(pk==='irr'){
          const before=barriers,v=ev(e.scrut);
          destructure(a0.pat,v,barriers===before);
          return ev(a0.body);
        }
        const sv0=ev(e.scrut),sv=guardBinds(e)&&!isLit(e.scrut)?null:guardMaybe(e)&&sv0?doubt(sv0):sv0;barrier();
        const base=snap(),preDef=[...defVal.keys()];
        const model=!frames.length&&(e.arms.some(a=>a.guard||a.pat.t==='IdentPat'&&a.pat.sub)||!sv&&!armStates(e))?matchPlan(e,sv):null;
        const pick=model?-1:pickArm(e,sv),armDiv=[],states=model||(!sv?armStates(e):null);
        let hasRange=false;
        for(const a of e.arms)RQ.walk(a.pat,x=>{if(x.t==='RangePat')hasRange=true;});
        let all=e.arms.length>0;
        // with a known scrutinee rustc follows only the arm that matches; otherwise a trap in any arm is unsupported
        e.arms.forEach((a,i)=>{
          st=new Map([...base].map(([k,v])=>[k,{...v}]));
          const was=div,mode=model&&model[i]==='skip'?'skip':states?'unknown':pick<0?'dead':i===pick?'live':'skip',pr=!hasRange&&!model;
          destructure(a.pat,sv,false,true);
          if(mode==='dead')dead++;else if(mode==='skip'){skip++;if(pr)prune++;else unsure++;}
          const run=()=>{if(a.body.t==='Block')block(a.body);else ev(a.body);};
          if(mode==='unknown'&&states[i]==='blank')blank(run);else run();
          if(mode==='dead')dead--;else if(mode==='skip'){skip--;if(pr)prune--;else unsure--;}
          armDiv.push(div);all=all&&div;div=was;
        });
        st=base;forget(assignedIn(e));barrier();
        if(pk==='maybe')doubtAll();
        if(states&&armDiv.some(d=>d)){
          const live=armDiv.map((d,i)=>d||states[i]==='skip'?null:states[i]).filter(Boolean);
          if(live.length&&live.every(x=>x==='blank'))blankAfter(preDef);
        }
        div=pick>=0?armDiv[pick]:model?armDiv.every((d,i)=>d||model[i]==='skip'):all;
        softK=div&&pick>=0?(hasRange?3:2):0;
        return null;
      }
      case 'Loop':{
        const items=[...e.body.stmts,...(e.body.tail?[e.body.tail]:[])],di=items.findIndex(isExit);
        const early=di>=0&&items.slice(0,di).some(containsExit);
        if(!e.label&&di>=0&&!early)return straightLoop(e.body);
        loopBody(e,null);
        const fr=lastFrame;
        div=!hasBreak(e.body);
        if(div)softK=0;
        if(early||e.label&&hasBreak(e.body)||plainBreak(e.body)||hasReturn(e.body))doubtAll();
        return fr.n===1&&fr.vals.length===1&&!fr.bad&&!e.label?doubt(fr.vals[0]):null;
      }
      case 'While':{
        const c=loopBody(e,e.cond);
        // rustc treats a while on a known-true condition with no break like loop {}: nothing after it is reachable
        div=!!c&&c.k==='bool'&&c.v===true&&!c.d&&!hasBreak(e.body);
        if(div)softK=0;
        if(hasReturn(e.body))doubtAll();
        return null;
      }
      case 'For':{
        const r=peel(e.iter);
        if(r.t==='Range'){if(r.from)ev(r.from);if(r.to)ev(r.to);}else ev(e.iter);
        loopBody(e,null);
        if(hasReturn(e.body))doubtAll();
        return null;
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
    st=new Map();defVal=new Map();dead=skip=0;barriers=0;div=false;borrowed=new Set();shaky=new Set();
    RQ.walk(it.body,n=>{
      let root=null;
      if(n.t==='Ref'&&n.expr)root=rootBind(n.expr); // a type's Ref has no expr
      else if(n.t==='MethodCall'){
        const i=info.get(n)||{},r=i.recv,u=i.um;
        if(r&&r.adj!=='val'||u&&!u.ref&&(u.adj==='&'||u.adj==='&mut'))root=rootBind(n.recv);
      }
      if(root)borrowed.add(root);
      if(n.t==='Match'&&n.kind!=='let'&&(guardBinds(n)||guardMaybe(n))){const x=peel(n.scrut),b=x.t==='Path'&&bindOf(x);if(b)(guardBinds(n)?borrowed:shaky).add(b);}
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
