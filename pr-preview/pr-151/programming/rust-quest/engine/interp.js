/* Values are {k:'int',v:BigInt,ty}, {k:'float',v:Number}, {k:'bool'|'char'|'str',v}, {k:'tuple'|'array',v:[values]},
   {k:'struct',name,fields:[{name,val}]} (declaration order) and {k:'unit'}. A String is {k:'String',v,id} and never changes:
   push_str puts a new one with the same heap id in the variable's cell. A reference is {k:'ref',cell,mut,loan}, where cell is
   the {val} of the variable it borrows (val is null until a deferred let is set) and loan is the node id of the borrow.
   The checker gives every literal its final type (opts.info), so a value always carries a concrete type.
   Ownership is tracked as Rust does: a cell is moved when its non-Copy value is passed on, and what is still owned is dropped
   at the end of its scope in reverse declaration order (also while a panic unwinds), a temporary at the end of its statement.
   Dropping a struct runs its `Drop::drop` first, then drops its fields in declaration order.
   events: {t:'alloc',kind,id,line} {t:'free',id,line} {t:'move',name,line} {t:'drop',name,ty,line,part?} (part: a field or element).
   With opts.snap it also records a snapshot before every statement and one at the end; opts.loans are the borrow pass's loans.
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
const MAX_EVENTS=200000,MAX_SNAPS=2000;
const bool=v=>({k:'bool',v});
const OPNAME={'+':'add','-':'subtract','*':'multiply'};
// Rust orders text by UTF-8 bytes, which is code point order; JS < compares UTF-16 units and puts U+10000 and up before U+E000
const cmpCodePoints=(x,y)=>{
  const p=Array.from(x),q=Array.from(y);
  for(let i=0;i<Math.min(p.length,q.length);i++){const d=p[i].codePointAt(0)-q[i].codePointAt(0);if(d)return d;}
  return p.length-q.length;
};
const peel=e=>e.t==='Paren'?peel(e.expr):e;
const MAX_STRING=100000; // JS chars; a doubling loop would otherwise take all the memory
const MAX_OUTPUT=1000000; // JS chars of stdout and stderr together; a loop printing a near-limit String would otherwise fill memory before maxSteps
// Rust's len counts UTF-8 bytes; TextEncoder is not in the vm sandbox
const utf8Len=s=>{let n=0;for(const c of s){const p=c.codePointAt(0);n+=p<0x80?1:p<0x800?2:p<0x10000?3:4;}return n;};

RQ.interp=(ast,opts)=>{
  opts=opts||{};
  const maxSteps=opts.maxSteps??100000,maxDepth=opts.maxDepth??64,info=opts.info||new Map();
  const {fits,INT,wrap,isCopy,res,show}=RQ.types;
  let steps=0,depth=0,out='',err='';
  const fns=new Map(),consts=new Map(),cval=new Map(),decls=new Map(),dropImpl=new Map();
  for(const it of ast.items){
    if(it.t==='Fn')fns.set(it.name,it);else if(it.t==='Const')consts.set(it.name,it);
    else if(it.t==='Struct')decls.set(it.name,it);
    else if(it.t==='Impl'&&it.trait)dropImpl.set(it.selfTy.segs[0].name,it.items[0]);
  }
  const events=[],heap=new Map(),temps=[],frames=[],snaps=[],loanOf=new Map((opts.loans||[]).map(l=>[l.ast,l])),idSets=new Map();
  let nextId=1,lastEv=0;
  const tick=()=>{if(++steps>maxSteps)throw new Limit('steps');};
  const bug=what=>{throw new Error('interpreter: '+what);};
  const find=(env,n)=>{for(let i=env.length-1;i>=0;i--)if(env[i].has(n))return env[i].get(n);return null;};
  const int=(v,ty)=>({k:'int',v,ty});
  const checked=(v,ty,msg,e)=>{if(!fits(v,ty))throw panic(msg,e);return int(v,ty);};
  const unref=v=>RQ.std.unref(v);
  const read=(cell,line)=>{if(cell.val===null)throw new Unsup('deferred initialization',line);return cell.val;};
  const note=o=>{events.push(o);if(events.length>MAX_EVENTS)throw new Limit('steps');};
  // a new String value is a new heap object, push_str keeps the object (same id) and changes what it holds
  const string=(s,id,line)=>{
    if(s.length>MAX_STRING)throw new Limit('string size');
    if(id===undefined){id=nextId++;note({t:'alloc',kind:'String',id,line:line||0});heap.set(id,{id,kind:'String',v:s});}
    else heap.get(id).v=s;
    return {k:'String',v:s,id};
  };
  const panic=(msg,e)=>{const p=new Panic(msg,e);err+=RQ.diag.panicText(p);return p;};
  const typeOf=e=>{const o=info.get(e);return o&&o.ty;};
  const isPlace=e=>{e=peel(e);return e.t==='Path'||e.t==='Field'||e.t==='Index'||e.t==='Deref';};
  function cellOf(e,env){
    e=peel(e);
    if(e.t==='Deref')return cellOf(e.expr,env);
    let c=(e.t==='Path'&&find(env,e.segs[0].name))||{val:ev(e,env)};
    while(read(c,e.line).k==='ref')c=c.val.cell;
    return c;
  }

  function intOp(op,a,b,e){
    const ty=a.ty;
    switch(op){
      case '+':case '-':case '*':return checked(op==='+'?a.v+b.v:op==='-'?a.v-b.v:a.v*b.v,ty,'attempt to '+OPNAME[op]+' with overflow',e);
      case '/':
        if(b.v===0n)throw panic('attempt to divide by zero',e);
        return checked(a.v/b.v,ty,'attempt to divide with overflow',e);
      case '%':
        if(b.v===0n)throw panic('attempt to calculate the remainder with a divisor of zero',e);
        if(a.v===INT[ty][0]&&b.v===-1n&&ty[0]==='i')throw panic('attempt to calculate the remainder with overflow',e);
        return int(a.v%b.v,ty);
      case '&':return int(a.v&b.v,ty);
      case '|':return int(a.v|b.v,ty);
      case '^':return int(a.v^b.v,ty);
    }
    return null;
  }
  function binop(op,a,b,e){
    a=unref(a);b=unref(b);
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
    if(out.length+err.length>MAX_OUTPUT)throw new Limit('output size');
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
        else if(p.idx!==undefined)s+=RQ.std.render(pos[p.idx],p.fmt,tick,MAX_OUTPUT-out.length-err.length-s.length);
        else{
          let v=named.get(p.name);
          if(!v){const c=find(env,p.name);v=c?read(c,e.line):consts.has(p.name)?constVal(p.name):bug('name '+p.name);}
          s+=RQ.std.render(v,p.fmt,tick,MAX_OUTPUT-out.length-err.length-s.length);
        }
        // a line built from many big parts stops here; emit sees the total over the cap and throws
        if(out.length+err.length+s.length>MAX_OUTPUT)break;
      }
    }catch(x){
      if(x instanceof RQ.std.Unmodeled)throw new Unsup('format spec',e.line);
      if(x instanceof RQ.std.Over)throw new Limit('output size');
      throw x;
    }
    if(e.name==='format')return string(s,undefined,e.line);
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
  const owns=v=>v.k==='String'||v.k==='struct'||(v.k==='tuple'&&v.v.some(owns))||(v.k==='array'&&v.v.length>0&&owns(v.v[0]));
  // run `cleanup` after `work` however it ends, except when the run is being abandoned (a limit or an unmodeled construct)
  function guard(work,cleanup){
    let r;
    try{r=work();}
    catch(x){if(!(x instanceof Limit||x instanceof Unsup))cleanup();throw x;}
    cleanup();return r;
  }
  function dropValue(v,name,line,part){
    if(!owns(v))return;
    switch(v.k){
      case 'String':
        note({t:'drop',name,ty:'String',line,part});
        heap.delete(v.id);note({t:'free',id:v.id,line});
        break;
      case 'struct':{
        note({t:'drop',name,ty:v.name,line,part});
        const d=dropImpl.get(v.name);
        if(d)runDrop(d,v,line);
        for(const f of v.fields)dropValue(f.val,name&&name+'.'+f.name,line,true);
        break;
      }
      default:
        note({t:'drop',name,ty:v.k,line,part});
        v.v.forEach((x,i)=>dropValue(x,name&&name+(v.k==='array'?'['+i+']':'.'+i),line,true));
    }
  }
  function dropScope(scope){
    for(let i=scope.own.length-1;i>=0;i--){
      const c=scope.own[i];
      if(c.val!==null&&!c.moved&&!c.dropped)dropValue(c.val,c.name,c.line);
    }
  }
  const dropTemps=mark=>{while(temps.length>mark){const t=temps.pop();dropValue(t.v,null,t.line);}};
  function declare(scope,name,cell){scope.set(name,cell);scope.own.push(cell);}
  const newScope=()=>{const m=new Map();m.own=[];return m;};
  const tyName=n=>{const o=info.get(n);return o&&o.ty?show(o.ty):'';};
  // a by-value use of a local moves a non-Copy value out of it (a reference is reborrowed, never moved)
  function mv(e,env){
    const x=peel(e);
    if(x.t==='Path'){
      const c=find(env,x.segs[0].name),t=typeOf(x);
      if(c){
        const v=read(c,x.line);
        if(t&&!isCopy(t)&&res(t).k!=='ref'){c.moved=true;note({t:'move',name:c.name,line:x.line});}
        return v;
      }
    }
    return ev(e,env);
  }
  // operands that end up owned together: if a later one panics, the earlier ones drop while it unwinds
  function mvAll(es,env){
    const vals=[];
    try{for(const e of es)vals.push(mv(e,env));}
    catch(x){if(x instanceof Panic)for(let i=vals.length-1;i>=0;i--)dropValue(vals[i],null,es[i].line);throw x;}
    return vals;
  }
  function runDrop(f,v,line){
    tick();
    if(depth+1>maxDepth)throw new Limit('depth');
    depth++;
    const fenv=[newScope()];
    declare(fenv[0],'self',{val:{k:'ref',cell:{val:v},mut:true},name:'self',ty:'&mut '+v.name,line});
    frames.push({fn:'drop',env:fenv,stmt:null});
    try{block(f.body,fenv);}finally{depth--;frames.pop();}
  }
  function callFn(f,args,line){
    tick();
    if(depth+1>maxDepth)throw new Limit('depth');
    depth++;
    const fenv=[newScope()];
    f.params.forEach((p,i)=>declare(fenv[0],p.pat.name,{val:args[i],name:p.pat.name,ty:tyName(p.pat),line:p.pat.line}));
    frames.push({fn:f.name,env:fenv,stmt:null});
    let r,abandon=false;
    try{r=block(f.body,fenv);}
    catch(x){
      if(x instanceof Ret)r=x.v;
      else{if(x instanceof Limit||x instanceof Unsup)abandon=true;throw x;}
    }
    finally{
      if(!abandon)dropScope(fenv[0]);
      depth--;frames.pop();
    }
    return r;
  }
  function stmt(s,env,scope){
    if(s.t==='Let'){
      const pt=s.pat;
      if(pt.t==='IdentPat'){
        const cell={val:s.init?mv(s.init,env):null,name:pt.name,ty:tyName(pt),line:pt.line};
        declare(scope,pt.name,cell);
      }else if(s.init){
        // `let _ = place;` neither moves nor drops; `let _ = value;` drops the value at once
        const v=ev(s.init,env);
        if(!isPlace(s.init))dropValue(v,null,s.line);
      }
    }else if(s.t==='ExprStmt'){
      const x=peel(s.expr),v=x.t==='Path'?mv(x,env):ev(s.expr,env);
      if(x.t!=='Field'&&x.t!=='Index'&&x.t!=='Deref')dropValue(v,null,s.line);
    }else throw new Unsup(s.t,s.line);
  }
  function block(b,env){
    const scope=newScope(),fr=frames[frames.length-1];
    env.push(scope);
    let abandon=false;
    try{
      for(const s of b.stmts){
        tick();
        if(fr)fr.stmt=s;
        snapshot(s.line);
        const mark=temps.length;
        guard(()=>stmt(s,env,scope),()=>dropTemps(mark));
      }
      if(!b.tail)return UNIT;
      if(fr)fr.stmt=b.tail;
      snapshot(b.tail.line);
      const mark=temps.length;
      // a temporary of the tail expression drops before the block's locals (edition 2024)
      return guard(()=>mv(b.tail,env),()=>dropTemps(mark));
    }catch(x){
      if(x instanceof Limit||x instanceof Unsup)abandon=true;
      throw x;
    }finally{
      env.pop();
      if(!abandon)dropScope(scope);
    }
  }
  function body(b,env,box){
    try{block(b,env);}
    catch(x){
      if(x instanceof Brk){box.v=x.v;return true;}
      if(!(x instanceof Cont))throw x;
    }
    return false;
  }
  const clip=t=>t.length>40?t.slice(0,39)+'…':t;
  const scalar=v=>{
    try{return v.k==='char'?"'"+v.v+"'":v.k==='str'?'"'+clip(v.v)+'"':v.k==='unit'?'()':RQ.std.display(v);}
    catch(x){return '?';}
  };
  // the slots a value fills on the stack: one per scalar, String pointer or reference; heap ids only while the owner is live
  function leaves(v,path,out,live){
    switch(v.k){
      case 'String':out.push({path,heap:live?v.id:null});break;
      case 'ref':out.push({path,ref:true,mut:v.mut,loan:v.loan,cell:v.cell});break;
      case 'struct':for(const f of v.fields)leaves(f.val,path?path+'.'+f.name:f.name,out,live);break;
      case 'tuple':case 'array':
        v.v.slice(0,8).forEach((x,i)=>leaves(x,path+(v.k==='array'?'['+i+']':(path?'.':'')+i),out,live));
        if(v.v.length>8)out.push({path:path+'…',text:'… '+(v.v.length-8)+' more'});
        break;
      default:out.push({path,text:scalar(v)});
    }
  }
  const idsOf=n=>{
    let set=idSets.get(n);
    if(!set){set=new Set();RQ.walk(n,m=>{set.add(m.id);});idSets.set(n,set);}
    return set;
  };
  function snapshot(line,end){
    if(!opts.snap)return;
    if(snaps.length>=MAX_SNAPS)return;
    const recs=new Map(),owners=new Map(),frs=[];
    for(const f of frames){
      const vars=[];
      for(const sc of f.env)for(const c of sc.own||[]){
        const live=c.val!==null&&!c.moved&&!c.dropped;
        const rec={uid:recs.size,name:c.name,ty:c.ty||'',state:c.val===null?'uninit':c.dropped?'dropped':c.moved?'moved':'owned',leaves:[]};
        if(c.val!==null)leaves(c.val,'',rec.leaves,live);
        for(const l of rec.leaves)if(l.heap!=null)owners.set(l.heap,c.name+(l.path?'.'+l.path:''));
        recs.set(c,rec);vars.push(rec);
      }
      frs.push({fn:f.fn,vars});
    }
    const loans=[],seen=new Set();
    for(const rec of recs.values())for(const l of rec.leaves){
      if(!l.ref)continue;
      const to=recs.get(l.cell),st=loanOf.get(l.loan);
      // a borrow is live while a later use needs it; without the borrow pass's region it is shown as live
      const live=!st||frames.some(f=>f.stmt&&st.live.some(id=>idsOf(f.stmt).has(id)));
      loans.push({id:l.loan,kind:l.mut?'mut':'shared',ref:rec.name+(l.path?'.'+l.path:''),place:to?to.name:null,live,line:st?st.line:0});
      if(to&&live&&!seen.has(to)){seen.add(to);to.n=0;}
      if(to&&live){to.n++;if(to.state==='owned')to.state=l.mut?'mutBorrowed':'shared';}
      l.to=to?to.uid:null;l.toName=to?to.name:null;
    }
    for(const rec of recs.values())for(const l of rec.leaves){delete l.cell;if(l.ref&&l.to===undefined){l.to=null;l.toName=null;}}
    snaps.push({step:steps,line,end:!!end,frames:frs,
      heap:[...heap.values()].map(h=>({id:h.id,kind:h.kind,content:h.v,owner:owners.get(h.id)||null})),
      loans,events:events.slice(lastEv)});
    lastEv=events.length;
  }

  // a temporary in a condition drops before the branch runs
  function cond(c,env){const mark=temps.length;return guard(()=>ev(c,env).v,()=>dropTemps(mark));}
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
        if(c)return read(c,e.line);
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
        let cell;
        if(e.lhs.t==='Path')cell=find(env,e.lhs.segs[0].name);
        else if(e.lhs.t==='Deref'){
          const rv=ev(e.lhs.expr,env);
          if(rv.k!=='ref')throw new Unsup('assignment target',e.line);
          cell=rv.cell;
        }else throw new Unsup('assignment target',e.line);
        if(!cell)return bug('assign');
        let r=e.op==='='?mv(e.rhs,env):ev(e.rhs,env);
        if(e.op!=='=')r=binop(e.op.slice(0,-1),read(cell,e.line),r,e);
        // the old value drops once the new one is computed, unless it was moved out or never set
        else if(cell.val!==null&&!cell.moved&&!cell.dropped)dropValue(cell.val,cell.name,e.line);
        cell.val=r;cell.moved=false;cell.dropped=false;return UNIT;
      }
      case 'Call':{
        const sg=e.callee.t==='Path'?e.callee.segs:[],f=sg.length===1&&fns.get(sg[0].name);
        if(f)return callFn(f,mvAll(e.args,env),e.line);
        if(sg.length===2&&sg[0].name==='String'&&sg[1].name==='new')return string('',undefined,e.line);
        if(sg.length===2&&sg[0].name==='String'&&sg[1].name==='from')return string(unref(ev(e.args[0],env)).v,undefined,e.line);
        if(sg.length===2&&sg[0].name==='Clone'&&sg[1].name==='clone')return string(unref(ev(e.args[0],env)).v,undefined,e.line);
        if(sg.length===1&&sg[0].name==='drop'&&e.args.length===1){
          const a=peel(e.args[0]),c=a.t==='Path'&&find(env,a.segs[0].name),v=mv(a,env);
          dropValue(v,c?c.name:null,e.line);
          if(c&&c.moved)c.dropped=true;
          return UNIT;
        }
        throw new Unsup('call',e.line);
      }
      case 'Ref':{
        const x=peel(e.expr);
        if(x.t==='Field'||x.t==='Index')throw new Unsup('borrow of a field',e.line);
        if(x.t==='Deref')throw new Unsup('reborrow',e.line);
        const own=x.t==='Path'&&find(env,x.segs[0].name);
        if(own){read(own,x.line);return {k:'ref',cell:own,mut:e.mut,loan:e.id};}
        return {k:'ref',cell:{val:ev(x,env)},mut:e.mut,loan:e.id};
      }
      case 'Deref':{
        const v=ev(e.expr,env);
        if(v.k!=='ref')throw new Unsup('dereference',e.line);
        return read(v.cell,e.line);
      }
      case 'MethodCall':{
        if(!RQ.std.methods.has(e.name))throw new Unsup('method call',e.line);
        if(e.name==='push_str'){
          const r=peel(e.recv);
          if(r.t==='Field'||r.t==='Index')throw new Unsup('borrow of a field',e.line);
          const c=cellOf(r,env),add=unref(ev(e.args[0],env)).v;
          c.val=string(c.val.v+add,c.val.id);return UNIT;
        }
        const rv=ev(e.recv,env),s=unref(rv).v;
        // an owned String that no variable holds lives until the end of the statement
        if(rv.k==='String'&&!isPlace(e.recv))temps.push({v:rv,line:e.line});
        if(e.name==='len')return int(BigInt(utf8Len(s)),'usize');
        if(e.name==='as_str')return {k:'str',v:s};
        return string(s,undefined,e.line);
      }
      case 'Macro':return macro(e,env);
      case 'Block':return block(e,env);
      case 'Return':throw new Ret(e.expr?mv(e.expr,env):UNIT);
      case 'Tuple':return e.elems.length?{k:'tuple',v:mvAll(e.elems,env)}:UNIT;
      case 'Array':return {k:'array',v:mvAll(e.elems,env)};
      case 'StructLit':{
        const d=decls.get(e.path.segs[0].name),vals=mvAll(e.fields.map(f=>f.expr),env),by=new Map(e.fields.map((f,i)=>[f.name,vals[i]]));
        return {k:'struct',name:d.name,fields:d.fields.map(f=>({name:f.name,val:by.get(f.name)}))};
      }
      case 'ArrayRepeat':{const v=ev(e.elem,env);return {k:'array',v:Array(Number(e.len.v)).fill(v)};}
      case 'Index':{
        const a=ev(e.expr,env),i=ev(e.index,env);
        if(i.v>=BigInt(a.v.length))throw panic('index out of bounds: the len is '+a.v.length+' but the index is '+i.v,e);
        return a.v[Number(i.v)];
      }
      case 'Field':{
        const b=unref(ev(e.expr,env));
        return b.k==='struct'?b.fields.find(f=>f.name===e.name).val:b.v[Number(e.name)];
      }
      case 'Cast':return cast(ev(e.expr,env),e.ty,e);
      case 'If':
        if(cond(e.cond,env))return block(e.then,env);
        return e.els?e.els.t==='If'?ev(e.els,env):block(e.els,env):UNIT;
      case 'Loop':{
        const box={v:UNIT};
        for(;;){tick();if(body(e.body,env,box))return box.v;}
      }
      case 'While':{
        const box={v:UNIT};
        for(;;){tick();if(!cond(e.cond,env)||body(e.body,env,box))return UNIT;}
      }
      case 'For':{
        const r=peel(e.iter),from=ev(r.from,env),to=ev(r.to,env),box={v:UNIT},end=r.inclusive?to.v+1n:to.v;
        for(let i=from.v;i<end;i++){
          tick();
          const sc=newScope();env.push(sc);
          if(e.pat.t==='IdentPat')declare(sc,e.pat.name,{val:int(i,from.ty),name:e.pat.name,ty:from.ty,line:e.line});
          try{if(body(e.body,env,box))return UNIT;}finally{env.pop();}
        }
        return UNIT;
      }
      case 'Break':throw new Brk(e.expr?mv(e.expr,env):UNIT);
      case 'Continue':throw new Cont();
      default:throw new Unsup(e.t,e.line);
    }
  }

  const extra=()=>({events,snaps});
  try{
    // rustc range-checks every const; the lint pass reports an overflow, so a const only fails here on a shape it cannot model
    for(const n of consts.keys())constVal(n);
    callFn(fns.get('main'),[],1);
    snapshot(snaps.length?snaps[snaps.length-1].line:1,true);
    return {status:'ok',stdout:out,stderr:err,exit:0,...extra()};
  }catch(x){
    if(x instanceof Limit)return {status:'limit',limit:x.why,stdout:out.slice(0,MAX_OUTPUT),stderr:err.slice(0,MAX_OUTPUT),exit:null,...extra()};
    if(x instanceof Unsup)return {status:'unsupported',unsupported:{feature:x.feature,line:x.line},stdout:out,stderr:err,exit:null,...extra()};
    if(x instanceof Panic){
      snapshot(x.line,true);
      return {status:'panic',stdout:out,stderr:err,exit:101,panic:{msg:x.msg,line:x.line,col:x.col},...extra()};
    }
    throw x;
  }
};
})();
