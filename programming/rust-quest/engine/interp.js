/* Values are {k:'int',v:BigInt,ty}, {k:'float',v:Number}, {k:'bool'|'char'|'str',v}, {k:'tuple'|'array',v:[values]},
   {k:'struct',name,kind,fields:[{name,val}]} (declaration order; kind is named, tuple or unit), {k:'enum',name,variant,kind,fields} (Option and Result are enums too),
   {k:'vec',v:[values],id,ty} and {k:'map',v:[{key,val}],id,ty} (a HashMap keeps its entries in insertion order, which the program can never see: printing one with two or more
   entries, or dropping one whose values have a Drop impl, is unsupported; ty is the type as text) and {k:'unit'}. A field or an enum payload that was moved out holds MOVED ({k:'moved'}), set in place: only a value that is not Copy is ever partly moved, and
   it has one owner. Writing a field makes a new struct along the path, so a Copy struct that two variables share is never changed through one of them. A String is {k:'String',v,id} and never changes:
   push_str puts a new one with the same heap id in the variable's cell. A reference is {k:'ref',cell,mut,loan}, where cell is
   the {val} of the variable it borrows (val is null until a deferred let is set) and loan is the node id of the borrow.
   The checker gives every literal its final type (opts.info), so a value always carries a concrete type.
   Ownership is tracked as Rust does: a cell is moved when its non-Copy value is passed on, and what is still owned is dropped
   at the end of its scope in reverse declaration order (also while a panic unwinds), a temporary at the end of its statement.
   Dropping a struct runs its `Drop::drop` first, then drops its fields in declaration order.
   events: {t:'alloc',kind,id,line} {t:'free',id,line} {t:'move',name,line} {t:'drop',name,ty,line,part?} (part: a field or element) {t:'print',name,line}.
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
const UNIT={k:'unit'},MOVED={k:'moved'};
const BVARS={Option:[['None','unit',[]],['Some','tuple',['0']]],Result:[['Ok','tuple',['0']],['Err','tuple',['0']]]};
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
  const {fits,INT,wrap,isCopy,res,show}=RQ.types,adts=opts.adts;
  let steps=0,depth=0,out='',err='';
  const sess=RQ.std.hashSession(opts.seed||0);
  const fns=new Map(),consts=new Map(),cval=new Map(),decls=new Map(),dropImpl=new Map(),enumDecl=new Map(),methodFns=new Map();
  for(const it of ast.items){
    if(it.t==='Fn')fns.set(it.name,it);else if(it.t==='Const')consts.set(it.name,it);
    else if(it.t==='Struct')decls.set(it.name,it);
    else if(it.t==='Enum')enumDecl.set(it.name,it);
    else if(it.t==='Impl'&&it.trait)dropImpl.set(it.selfTy.segs[0].name,it.items[0]);
    else if(it.t==='Impl')for(const f of it.items)methodFns.set(it.selfTy.segs[0].name+'::'+f.name,f);
  }
  const declFields=d=>d.kind==='tuple'?d.fields.map((_,i)=>String(i)):d.kind==='unit'?[]:d.fields.map(f=>f.name);
  const variantInfo=(adt,vi)=>{
    if(BVARS[adt]){const [name,kind,fields]=BVARS[adt][vi];return {name,kind,fields};}
    const v=enumDecl.get(adt).variants[vi];
    return {name:v.name,kind:v.kind,fields:declFields(v)};
  };
  const ctorVal=(c,vals)=>{
    if(c.variant===null){const d=decls.get(c.adt);return {k:'struct',name:d.name,kind:d.kind,fields:declFields(d).map((n,i)=>({name:n,val:vals[i]}))};}
    const v=variantInfo(c.adt,c.variant);
    return {k:'enum',name:c.adt,variant:v.name,kind:v.kind,fields:v.fields.map((n,i)=>({name:n,val:vals[i]}))};
  };
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
  const string=(s,id,line)=>{
    if(s.length>MAX_STRING)throw new Limit('string size');
    if(id===undefined){id=nextId++;note({t:'alloc',kind:'String',id,empty:s==='',line:line||0});heap.set(id,{id,kind:'String',v:s});}
    else heap.get(id).v=s;
    return {k:'String',v:s,id};
  };
  const panic=(msg,e)=>{const p=new Panic(msg,e);err+=RQ.diag.panicText(p);return p;};
  const typeOf=e=>{const o=info.get(e);return o&&o.ty;};
  const isPlace=e=>{e=peel(e);return e.t==='Path'||e.t==='Field'||e.t==='Index'||e.t==='Deref';};
  const view=v=>{
    const r=v.k==='ref'&&v.range;
    const arr=(v.k==='ref'?v.cell.val:v).v;
    return r?{arr,off:r[0],len:r[1]-r[0]}:{arr,off:0,len:arr.length};
  };
  function slice(e,x,env){
    const rg=peel(x.index),px=peel(x.expr),pl=px.t==='Field'&&placeOf(px,env),own=px.t==='Path'?find(env,px.segs[0].name):pl&&fieldCell(pl.cell,pl.path);
    const bv=ev(px,env),at=n=>Number(unref(ev(n,env)).v);
    const lo=rg.from?at(rg.from):0;
    let hi=rg.to?at(rg.to)+(rg.inclusive?1:0):null;
    const text=info.get(e).slice==='str';
    const src=text?unref(bv).v:null;
    const len=text?src.length:view(bv).len;
    if(hi===null)hi=len;
    // rustc points an overloaded index at its `[`, and reports an inclusive end as written
    const at0={line:x.bline,col:x.bcol},shown=rg.inclusive?hi-1:hi;
    if(text){
      if(/[^\x00-\x7f]/.test(src))throw new Unsup('slice of non-ASCII text',e.line);
      if(lo>len)throw panic('start byte index '+lo+' is out of bounds for string of length '+len,at0);
      if(hi>len)throw panic('end byte index '+shown+' is out of bounds for string of length '+len,at0);
      if(lo>hi)throw panic('byte range starts at '+lo+' but ends at '+hi,at0);
      const base=bv.k==='ref'||bv.k==='str';
      const sv=unref(bv);
      return {k:'str',v:src.slice(lo,hi),cell:base?bv.cell:own||null,loan:base?bv.loan:e.id,heap:sv.k==='String'?sv.id:bv.heap,off:(bv.k==='str'?bv.off||0:0)+lo};
    }
    if(lo>len)throw panic('range start index '+lo+' out of range for slice of length '+len,at0);
    if(hi>len)throw panic('range end index '+shown+' out of range for slice of length '+len,at0);
    if(lo>hi)throw panic('slice index starts at '+lo+' but ends at '+hi,at0);
    const v=view(bv);
    return {k:'ref',cell:bv.k==='ref'?bv.cell:own,mut:false,loan:bv.k==='ref'?bv.loan:e.id,range:[v.off+lo,v.off+hi]};
  }
  function cellOf(e,env){
    e=peel(e);
    if(e.t==='Deref')return cellOf(e.expr,env);
    if(e.t==='Field'){const pl=placeOf(e,env);if(pl)return fieldCell(pl.cell,pl.path);}
    let c=(e.t==='Path'&&find(env,e.segs[0].name))||{val:ev(e,env)};
    while(read(c,e.line).k==='ref')c=c.val.cell;
    return c;
  }

  const isVecIdx=n=>{const o=info.get(n);return !!o&&!!o.vecIdx;};
  function indexCell(e,env){
    const b=peel(e.expr);
    let vec,c=null;
    if(b.t==='Index'&&isVecIdx(b)){const ic=indexCell(b,env);vec=unref(ic.val);c=ic;}
    else{
      vec=unref(ev(b,env));
      if(b.t==='Path')c=find(env,b.segs[0].name);
      else if(b.t==='Field'){const pl=placeOf(b,env);c=pl&&fieldCell(pl.cell,pl.path);}
      while(c&&c.val&&c.val.k==='ref')c=c.val.cell;
    }
    const i=ev(e.index,env);
    if(i.v>=BigInt(vec.v.length))throw panic('index out of bounds: the len is '+vec.v.length+' but the index is '+i.v,{line:e.bline,col:e.bcol});
    const k=Number(i.v);
    return elemCell(vec,k,c);
  }
  function elemCell(vec,k,pc){
    const root=pc&&(pc.proxy?pc.parent:pc),label=(pc&&pc.proxy?pc.label:'')+'['+k+']';
    return {proxy:true,parent:root||null,label,name:root&&root.name?root.name+(pc.proxy?'.'+pc.label:'')+'['+k+']':null,
      get val(){return vec.v[k];},set val(x){vec.v[k]=x;}};
  }
  function entryCell(m,en,pc,part){
    const root=pc&&(pc.proxy?pc.parent:pc),at=entryAt(m,en);
    return {proxy:true,parent:root||null,label:(pc&&pc.proxy?pc.label:'')+'['+(part==='key'?at:'value of '+at)+']',
      get val(){return part==='key'?en.key:en.val;},set val(x){if(part==='key')en.key=x;else en.val=x;}};
  }
  // a map entry is named by its key in the memory view when the key is a scalar, else by its place in key-text order
  function entryAt(m,en){
    const k=en.key;
    return ['int','bool','char','String'].includes(k.k)?'key '+(k.k==='String'?'"'+clip(k.v)+'"':scalar(k)):'entry '+entries(m).indexOf(en);
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
    if(['struct','enum','vec','map'].includes(a.k)&&(op==='=='||op==='!='))return bool(eqv(a,b)===(op==='=='));
    if(op==='<'||op==='>'||op==='<='||op==='>='){
      const c=cmpv(a,b);
      return bool(c!==null&&(op==='<'?c<0:op==='>'?c>0:op==='<='?c<=0:c>=0));
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
    // an owned value that no variable holds is a temporary of the statement
    [...e.args.slice(1),...e.named.map(x=>x.expr)].forEach((x,i)=>{const v=i<pos.length?pos[i]:named.get(e.named[i-pos.length].name);if(owns(v)&&!isPlace(x))temps.push({v,line:e.line});});
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
    note({t:'print',name:e.name,line:e.line});
    emit(e.name,s);return UNIT;
  }
  function vecMacro(e,env){
    if(!e.repeat){
      const vals=mvAll(e.args,env);
      return coll('vec',vals,tyName(e),e.line,!vals.length);
    }
    const x=mv(e.args[0],env),n=Number(unref(ev(e.repeat,env)).v);
    // the copies are counted before they are made, so a huge count stops at the step limit instead of filling memory
    steps+=n;
    if(steps>maxSteps)throw new Limit('steps');
    const items=[];
    for(let i=1;i<n;i++)items.push(cloneVal(x,e.line));
    if(n>0)items.push(x);else dropValue(x,null,e.line);
    return coll('vec',items,tyName(e),e.line,!n);
  }
  function constVal(n){
    if(cval.has(n)){const v=cval.get(n);if(v)return v;throw new Unsup('const initializer',consts.get(n).line);}
    cval.set(n,null);
    const c=consts.get(n);
    try{cval.set(n,ev(c.init,[new Map()]));}
    catch(x){if(x instanceof Panic)throw new Unsup('const initializer',c.line);throw x;}
    return cval.get(n);
  }
  const owns=v=>v.k==='String'||v.k==='struct'||v.k==='enum'||v.k==='vec'||v.k==='map'||(v.k==='tuple'&&v.v.some(owns))||(v.k==='array'&&v.v.length>0&&owns(v.v[0]));
  const hasDrop=v=>{
    switch(v.k){
      case 'struct':return dropImpl.has(v.name)||v.fields.some(f=>hasDrop(f.val));
      case 'enum':return v.fields.some(f=>hasDrop(f.val));
      case 'tuple':case 'array':case 'vec':return v.v.some(hasDrop);
      case 'map':return v.v.some(en=>hasDrop(en.key)||hasDrop(en.val));
      default:return false;
    }
  };
  function guard(work,cleanup){
    let r;
    try{r=work();}
    catch(x){if(!(x instanceof Limit||x instanceof Unsup))cleanup();throw x;}
    cleanup();return r;
  }
  // a map's entries in key-text order: the view must not claim the insertion order, which a real HashMap does not keep
  function entries(m){
    if(m.k!=='map')return m.v;
    return m.v.map(en=>({en,t:RQ.std.debug(en.key)})).sort((a,b)=>a.t<b.t?-1:a.t>b.t?1:0).map(x=>x.en);
  }
  function dropValue(v,name,line,part){
    if(!owns(v))return;
    switch(v.k){
      case 'String':
        note({t:'drop',name,ty:'String',line,part});
        heap.delete(v.id);note({t:'free',id:v.id,line});
        break;
      case 'struct':{
        // a struct with a field moved out has no Drop impl (E0509) and is not dropped as a whole: its other fields drop one by one
        const partial=v.fields.some(f=>f.val.k==='moved');
        if(!partial){
          note({t:'drop',name,ty:v.name,line,part});
          const d=dropImpl.get(v.name);
          if(d)runDrop(d,v,line,name);
        }
        for(const f of v.fields)dropValue(f.val,name&&name+'.'+f.name,line,true);
        break;
      }
      case 'enum':
        if(!v.fields.some(f=>f.val.k==='moved'))note({t:'drop',name,ty:v.name,line,part});
        for(const f of v.fields)dropValue(f.val,name&&name+'.'+f.name,line,true);
        break;
      case 'vec':case 'map':
        note({t:'drop',name,ty:v.ty,line,part});
        (v.k==='map'&&v.v.length>1&&v.v.some(en=>hasDrop(en.key)||hasDrop(en.val))?RQ.std.hashOrder(v):entries(v)).forEach((x,i)=>{
          if(v.k==='vec')dropValue(x,name&&name+'['+i+']',line,true);
          else{dropValue(x.key,name&&name+'[key '+i+']',line,true);dropValue(x.val,name&&name+'[value '+i+']',line,true);}
        });
        heap.delete(v.id);note({t:'free',id:v.id,line});
        break;
      default:
        if(!v.v.some(x=>x.k==='moved'))note({t:'drop',name,ty:v.k,line,part});
        v.v.forEach((x,i)=>dropValue(x,name&&name+(v.k==='array'?'['+i+']':'.'+i),line,true));
    }
  }
  function dropScope(scope){
    for(let i=scope.own.length-1;i>=0;i--){
      const c=scope.own[i];
      if(c.val!==null&&!c.moved&&!c.dropped)dropValue(c.val,c.name,c.line);
    }
  }
  const dropTemps=mark=>{while(temps.length>mark){const t=temps.pop(),v=t.cell?(t.cell.moved?null:t.cell.val):t.v;if(v)dropValue(v,null,t.line);}};
  // places: a path is the field names (or tuple indexes) below a variable's cell; a reference met on the way is followed (auto-deref)
  const step=(v,h)=>{
    while(v.k==='ref')v=v.cell.val;
    if(v.k==='tuple')return {holder:{get val(){return v.v[Number(h)];},set val(x){v.v[Number(h)]=x;}}};
    return {holder:v.fields.find(f=>f.name===h)};
  };
  function holderAt(val,path){
    let h;
    for(const sel of path){h=step(val,sel).holder;val=h.val;}
    return h;
  }
  const getAt=(val,path)=>path.length?holderAt(val,path).val:val;
  function setAt(val,path,nv){
    if(!path.length)return nv;
    const [h,...t]=path;
    if(val.k==='ref'){val.cell.val=setAt(val.cell.val,path,nv);return val;}
    if(val.k==='tuple'){const i=Number(h);return {...val,v:val.v.map((x,k)=>k===i?setAt(x,t,nv):x)};}
    return {...val,fields:val.fields.map(f=>f.name===h?{name:f.name,val:setAt(f.val,t,nv)}:f)};
  }
  function fieldCell(cell,path){
    if(!path.length)return cell;
    return {proxy:true,parent:cell.proxy?cell.parent:cell,label:(cell.proxy?cell.label+'.':'')+path.join('.'),
      get val(){return getAt(cell.val,path);},set val(x){cell.val=setAt(cell.val,path,x);}};
  }
  function placeOf(e,env){
    e=peel(e);
    if(e.t==='Path'){const c=find(env,e.segs[0].name);return c?{cell:c,path:[],loan:null}:null;}
    if(e.t!=='Field')return null;
    const b=placeOf(e.expr,env);
    if(!b)return null;
    const cur=getAt(b.cell.val,b.path);
    if(cur.k==='ref')return {cell:cur.cell,path:[e.name],loan:cur.loan};
    return {cell:b.cell,path:[...b.path,e.name],loan:b.loan};
  }
  const rootName=c=>{while(c.proxy)c=c.parent;return c.name;};
  const pathName=(c,path)=>{const r=rootName(c);return r?[r,...(c.proxy?[c.label]:[]),...path].join('.'):null;};
  function eqv(a,b){
    tick();
    a=unref(a);b=unref(b);
    switch(a.k){
      case 'unit':return true;
      case 'int':case 'float':case 'bool':case 'char':return a.v===b.v;
      case 'str':case 'String':return a.v===b.v;
      case 'tuple':case 'array':case 'vec':return a.v.length===b.v.length&&a.v.every((x,i)=>eqv(x,b.v[i]));
      case 'map':return a.v.length===b.v.length&&a.v.every(en=>{const o=mapFind(b,en.key);return !!o&&eqv(en.val,o.val);});
      case 'struct':return a.fields.every((f,i)=>eqv(f.val,b.fields[i].val));
      case 'enum':return a.variant===b.variant&&a.fields.every((f,i)=>eqv(f.val,b.fields[i].val));
    }
    return bug('equality of '+a.k);
  }
  const mapFind=(m,key)=>m.v.find(en=>eqv(en.key,key));
  const variantIndex=v=>BVARS[v.name]?BVARS[v.name].findIndex(x=>x[0]===v.variant):enumDecl.get(v.name).variants.findIndex(x=>x.name===v.variant);
  // -1, 0 or 1; null when a NaN makes the two unordered, which makes every comparison false
  function cmpv(a,b){
    tick();
    a=unref(a);b=unref(b);
    const ord=(x,y)=>x<y?-1:x>y?1:0;
    const seq=(xs,ys)=>{
      for(let i=0;i<Math.min(xs.length,ys.length);i++){const c=cmpv(xs[i],ys[i]);if(c!==0)return c;}
      return ord(xs.length,ys.length);
    };
    switch(a.k){
      case 'unit':return 0;
      case 'int':case 'bool':return ord(a.v,b.v);
      case 'float':return Number.isNaN(a.v)||Number.isNaN(b.v)?null:ord(a.v,b.v);
      case 'char':case 'str':case 'String':return Math.sign(cmpCodePoints(a.v,b.v));
      case 'tuple':case 'array':case 'vec':return seq(a.v,b.v);
      case 'struct':return seq(a.fields.map(f=>f.val),b.fields.map(f=>f.val));
      case 'enum':{
        const x=variantIndex(a),y=variantIndex(b);
        return x!==y?ord(x,y):seq(a.fields.map(f=>f.val),b.fields.map(f=>f.val));
      }
    }
    return bug('ordering of '+a.k);
  }
  // empty: it has never held an element, so it owns no heap memory yet
  function coll(k,items,ty,line,empty){
    const id=nextId++,v={k,v:items,id,ty};
    note({t:'alloc',kind:k==='vec'?'Vec':'HashMap',id,empty,line:line||0});
    heap.set(id,{id,kind:k==='vec'?'Vec':'HashMap',val:v});
    return v;
  }
  function defaultVal(t,line){
    tick();
    t=res(t);
    switch(t.k){
      case 'int':return int(0n,t.ty);
      case 'float':return {k:'float',v:0};
      case 'bool':return bool(false);
      case 'char':return {k:'char',v:'\0'};
      case 'str':return {k:'str',v:''};
      case 'String':return string('',undefined,line);
      case 'tuple':return {k:'tuple',v:t.els.map(x=>defaultVal(x,line))};
      case 'array':return {k:'array',v:Array.from({length:t.n},()=>defaultVal(t.el,line))};
      case 'coll':return coll(t.name==='Vec'?'vec':'map',[],show(t),line,true);
      case 'enum':return ctorVal({adt:t.name,variant:t.builtin?0:adts.enums.get(t.name).defaultVi},[]);
      case 'struct':return ctorVal({adt:t.name,variant:null},adts.structs.get(t.name).fields.map(f=>defaultVal(f.ty,line)));
      default:return UNIT;
    }
  }
  function cloneVal(v,line){
    tick();
    v=unref(v);
    switch(v.k){
      case 'String':return string(v.v,undefined,line);
      case 'tuple':case 'array':return {...v,v:v.v.map(x=>cloneVal(x,line))};
      case 'struct':case 'enum':return {...v,fields:v.fields.map(f=>({name:f.name,val:f.val.k==='ref'||f.val.k==='str'?f.val:cloneVal(f.val,line)}))};
      case 'vec':case 'map':{
        const c=coll(v.k,[],v.ty,line,v.v.length===0);
        for(const x of v.v)c.v.push(v.k==='vec'?cloneVal(x,line):{key:cloneVal(x.key,line),val:cloneVal(x.val,line)});
        return c;
      }
      default:return v;
    }
  }
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
    if(x.t==='Field'){
      const t=typeOf(x),pl=t&&!isCopy(t)&&res(t).k!=='ref'&&placeOf(x,env);
      if(pl){
        const h=holderAt(pl.cell.val,pl.path),v=h.val;
        h.val=MOVED;
        note({t:'move',name:pathName(pl.cell,pl.path),line:x.line});
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
  function runDrop(f,v,line,name){
    tick();
    if(depth+1>maxDepth)throw new Limit('depth');
    depth++;
    const fenv=[newScope()];
    const host={val:v,name:name||'a temporary',ty:v.name,line};
    declare(fenv[0],'self',{val:{k:'ref',cell:host,mut:true},name:'self',ty:'&mut '+v.name,line});
    frames.push({fn:'drop',env:fenv,stmt:null,host});
    try{block(f.body,fenv);}finally{depth--;frames.pop();}
  }
  function callFn(f,args,line,label){
    tick();
    if(depth+1>maxDepth)throw new Limit('depth');
    depth++;
    const fenv=[newScope()];
    const ps=[...(f.selfParam?[{name:'self',node:f.selfParam}]:[]),...f.params.map(p=>({name:p.pat.name,node:p.pat}))];
    ps.forEach((p,i)=>declare(fenv[0],p.name,{val:args[i],name:p.name,ty:tyName(p.node),line:p.node.line}));
    frames.push({fn:label||f.name,env:fenv,stmt:null});
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
        const v=ev(s.init,env);
        if(!isPlace(s.init))dropValue(v,null,s.line);
      }
    }else if(s.t==='ExprStmt'){
      const x=peel(s.expr),moves=x.t==='Path'||x.t==='Field'&&typeOf(x)&&!isCopy(typeOf(x)),v=moves?mv(x,env):ev(s.expr,env);
      if(moves||x.t!=='Field'&&x.t!=='Index'&&x.t!=='Deref')dropValue(v,null,s.line);
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
  // a moved collection (val) drops the elements a `break` or a panic leaves, then frees its buffer
  function forColl(e,fi,env){
    const src=peel(fi.src),box={v:UNIT},val=fi.mode==='val',map=fi.coll==='HashMap';
    let coll,pc=null,loan=e.id;
    if(val||fi.viaRef){
      const rv=val?mv(fi.src,env):ev(fi.src,env);
      coll=unref(rv);
      if(rv.k==='ref'){pc=rv.cell;loan=rv.loan;}
    }else if(src.t==='Index'&&isVecIdx(src)){pc=indexCell(src,env);coll=pc.val;}
    else if(src.t==='Field'){const pl=placeOf(src,env);pc=pl&&fieldCell(pl.cell,pl.path);coll=unref(pc?read(pc,e.line):ev(src,env));}
    else{pc=src.t==='Path'&&find(env,src.segs[0].name);coll=unref(pc?read(pc,e.line):ev(src,env));}
    while(pc&&pc.val&&pc.val.k==='ref')pc=pc.val.cell;
    const mut=fi.mode==='mut';
    const list=map?RQ.std.hashOrder(coll):coll.v.slice();
    const itemAt=i=>{
      if(!map)return val?list[i]:{k:'ref',cell:elemCell(coll,i,pc),mut,loan};
      const en=list[i];
      if(val)return fi.part==='k'?en.key:fi.part==='v'?en.val:{k:'tuple',v:[en.key,en.val]};
      const kr={k:'ref',cell:entryCell(coll,en,pc,'key'),mut:false,loan},vr={k:'ref',cell:entryCell(coll,en,pc,'value'),mut,loan};
      return fi.part==='k'?kr:fi.part==='v'?vr:{k:'tuple',v:[kr,vr]};
    };
    const dropItem=x=>{if(map&&val&&fi.part==='kv'){dropValue(x.v[0],null,e.line);dropValue(x.v[1],null,e.line);}else dropValue(x,null,e.line);};
    let i=0,bail=false;
    try{
      for(;i<(map?list.length:coll.v.length);){
        tick();
        const item=itemAt(i++),sc=newScope();
        env.push(sc);
        if(e.pat.t==='IdentPat')declare(sc,e.pat.name,{val:item,name:e.pat.name,ty:tyName(e.pat),line:e.line});
        let abandon=false,stop;
        try{stop=body(e.body,env,box);}
        catch(x){abandon=x instanceof Limit||x instanceof Unsup;throw x;}
        finally{
          env.pop();
          if(!abandon){
            if(e.pat.t==='IdentPat')dropScope(sc);
            else if(val)dropItem(item);
          }
        }
        if(stop)break;
      }
    }catch(x){
      bail=x instanceof Limit||x instanceof Unsup;
      throw x;
    }finally{
      if(val&&!bail){
        for(;i<list.length;i++)dropItem(itemAt(i));
        heap.delete(coll.id);note({t:'free',id:coll.id,line:e.line});
      }
    }
    return UNIT;
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
  function leaves(v,path,out,live){
    if(v.k==='str'&&v.cell){out.push({path,ref:true,mut:false,loan:v.loan,cell:v.cell,text:scalar(v),into:v.heap,range:v.heap!=null?[v.off,v.off+v.v.length]:undefined});return;}
    switch(v.k){
      case 'String':out.push({path,heap:live?v.id:null});break;
      case 'ref':out.push({path,ref:true,mut:v.mut,loan:v.loan,cell:v.cell,text:v.range?'['+v.range[0]+'..'+v.range[1]+']':undefined});break;
      case 'struct':for(const f of v.fields)leaves(f.val,path?path+'.'+f.name:f.name,out,live);break;
      case 'enum':
        out.push({path,text:v.variant});
        for(const f of v.fields)leaves(f.val,(path?path+'.':'')+v.variant+'.'+f.name,out,live);
        break;
      case 'vec':case 'map':
        out.push({path,heap:live?v.id:null});
        // the elements are one type, so if the first owns no heap memory none does and the walk is skipped
        if(v.v.length&&(v.k==='vec'?owns(v.v[0]):owns(v.v[0].key)||owns(v.v[0].val)))entries(v).forEach((x,i)=>{
          const inner=[];
          if(v.k==='vec')leaves(x,path+'['+i+']',inner,live);
          else{
            const k=x.key,at=['int','bool','char','String'].includes(k.k)?'key '+(k.k==='String'?'"'+clip(k.v)+'"':scalar(k)):'entry '+i;
            leaves(k,path+'['+at+']',inner,live);leaves(x.val,path+'[value of '+at+']',inner,live);
          }
          for(const l of inner)out.push({...l,hidden:true});
        });
        break;
      case 'moved':out.push({path,text:'moved'});break;
      case 'tuple':case 'array':
        v.v.slice(0,8).forEach((x,i)=>leaves(x,path+(v.k==='array'?'['+i+']':(path?'.':'')+i),out,live));
        if(v.v.length>8)out.push({path:path+'…',text:'… '+(v.v.length-8)+' more'});
        break;
      default:out.push({path,text:scalar(v)});
    }
  }
  // what a Vec or HashMap box holds: an element that owns heap memory is a pointer to it
  function inline(x){
    switch(x.k){
      case 'String':case 'vec':case 'map':return 'pointer to #'+x.id;
      case 'struct':case 'enum':{
        const nm=x.k==='struct'?x.name:x.variant,fs=x.fields.map(f=>(x.kind==='named'?f.name+': ':'')+inline(f.val));
        return !fs.length?nm:x.kind==='named'?nm+' { '+fs.join(', ')+' }':nm+'('+fs.join(', ')+')';
      }
      case 'tuple':case 'array':return (x.k==='tuple'?'(':'[')+x.v.slice(0,8).map(inline).join(', ')+(x.v.length>8?', …':'')+(x.k==='tuple'?')':']');
      case 'moved':return 'moved';
      default:return scalar(x);
    }
  }
  function collText(c){
    if(!c.v.length)return '';
    const items=entries(c).slice(0,8).map(x=>c.k==='vec'?inline(x):inline(x.key)+': '+inline(x.val));
    const shown=items.join(', ')+(c.v.length>8?', … '+(c.v.length-8)+' more':'');
    return c.k==='vec'?'['+shown+']':'{'+shown+'}';
  }
  const idsOf=n=>{
    let set=idSets.get(n);
    if(!set){set=new Set();RQ.walk(n,m=>{set.add(m.id);});idSets.set(n,set);}
    return set;
  };
  const at=(name,path)=>!path?name:path[0]==='['?name+path:name+'.'+path;
  const lab=c=>c.label[0]==='['?c.label:'.'+c.label;
  function snapshot(line,end){
    if(!opts.snap)return;
    if(snaps.length>=MAX_SNAPS-(end?0:1))return;
    const recs=new Map(),owners=new Map(),frs=[];
    for(const f of frames){
      const vars=[],cells=[];
      if(f.host)cells.push(f.host);
      for(const sc of f.env)cells.push(...sc.own||[]);
      for(const c of cells){
        if(c.name&&c.name[0]==='#')continue;
        const live=c.val!==null&&!c.moved&&!c.dropped;
        const rec={uid:recs.size,name:c.name,ty:c.ty||'',state:c.val===null?'uninit':c.dropped?'dropped':c.moved?'moved':'owned',leaves:[]};
        if(c.val!==null)leaves(c.val,'',rec.leaves,live);
        for(const l of rec.leaves)if(l.heap!=null)owners.set(l.heap,at(c.name,l.path));
        recs.set(c,rec);vars.push(rec);
      }
      frs.push({fn:f.fn,vars});
    }
    const loans=[],seen=new Set();
    for(const rec of recs.values())for(const l of rec.leaves){
      if(!l.ref)continue;
      const px=!!l.cell.proxy,to=recs.get(px?l.cell.parent:l.cell),st=loanOf.get(l.loan);
      // without the borrow pass's region a loan is shown as live
      const live=!st||frames.some(f=>f.stmt&&st.live.some(id=>idsOf(f.stmt).has(id)));
      loans.push({id:l.loan,kind:l.mut?'mut':'shared',ref:at(rec.name,l.path),place:to?to.name+(px?lab(l.cell):''):null,live,line:st?st.line:0});
      // a borrow of one field does not make the whole variable look borrowed
      if(to&&live&&!px&&!seen.has(to)){seen.add(to);to.n=0;}
      if(to&&live&&!px){to.n++;if(to.state==='owned')to.state=l.mut?'mutBorrowed':'shared';}
      l.to=to?to.uid:null;l.toName=to?to.name+(px?lab(l.cell):''):null;
    }
    for(const rec of recs.values())for(const l of rec.leaves){delete l.cell;if(l.ref&&l.to===undefined){l.to=null;l.toName=null;}}
    snaps.push({step:steps,line,end:!!end,frames:frs,
      heap:[...heap.values()].map(h=>({id:h.id,kind:h.kind,content:h.val?collText(h.val):h.v,owner:owners.get(h.id)||null})),
      loans,events:events.slice(lastEv)});
    lastEv=events.length;
  }

  function userMethod(e,env){
    const u=info.get(e).um;
    let rv;
    if(u.ref)rv=u.adj==='copy'?read(ev(e.recv,env).cell,e.line):ev(e.recv,env);
    else if(u.adj==='val')rv=mv(e.recv,env);
    else{
      const pl=isPlace(e.recv)&&placeOf(e.recv,env),r0=peel(e.recv);
      if(pl){read(pl.cell,e.line);rv={k:'ref',cell:fieldCell(pl.cell,pl.path),mut:u.adj==='&mut',loan:pl.loan??e.id};}
      else if(r0.t==='Index'&&isVecIdx(r0))rv={k:'ref',cell:indexCell(r0,env),mut:u.adj==='&mut',loan:e.id};
      else{
        const v=ev(e.recv,env);
        if(owns(v))temps.push({v,line:e.line});
        rv={k:'ref',cell:{val:v},mut:u.adj==='&mut',loan:e.id};
      }
    }
    const args=mvAll(e.args,env),f=methodFns.get(u.key);
    if(f)return callFn(f,[rv,...args],e.line,u.key);
    return builtinMethod(u.key,e,rv,args);
  }
  function builtinMethod(key,e,rv,args){
    const at0={line:e.nline,col:e.ncol};
    if(key==='ref::clone')return rv;
    if(key==='Clone::clone'||key.endsWith('::clone'))return cloneVal(rv,e.line);
    if(key.startsWith('Vec::')||key.startsWith('HashMap::')){
      const c=unref(rv);
      const none=()=>ctorVal({adt:'Option',variant:0},[]),some=x=>ctorVal({adt:'Option',variant:1},[x]);
      const cell=(function(){let r=rv;while(r.cell.val.k==='ref')r=r.cell.val;return r.cell;})();
      const eref=(k,mut)=>({k:'ref',cell:elemCell(c,k,cell),mut,loan:e.id});
      const vref=(en,mut)=>({k:'ref',cell:entryCell(c,en,cell,'value'),mut,loan:e.id});
      const at=n=>Number(unref(n).v);
      const insertEntry=(k,v)=>{
        const old=mapFind(c,k);
        if(!old){c.v.push({key:k,val:v});return null;}
        const prev=old.val;
        old.val=v;
        dropValue(k,null,e.line);
        return prev;
      };
      const consume=a=>{if(a.k==='vec'||a.k==='map'){heap.delete(a.id);note({t:'free',id:a.id,line:e.line});}};
      switch(key.slice(key.indexOf('::')+2)){
        case 'len':return int(BigInt(c.v.length),'usize');
        case 'is_empty':return bool(!c.v.length);
        case 'push':c.v.push(args[0]);return UNIT;
        case 'insert':{
          if(c.k==='vec'){
            const k=at(args[0]);
            if(k>c.v.length)throw panic('insertion index (is '+k+') should be <= len (is '+c.v.length+')',at0);
            c.v.splice(k,0,args[1]);return UNIT;
          }
          const prev=insertEntry(args[0],args[1]);
          return prev===null?none():some(prev);
        }
        case 'pop':return c.v.length?some(c.v.pop()):none();
        case 'clear':{
          const es=c.v.splice(0);
          if(c.k==='vec')es.forEach(x=>dropValue(x,null,e.line));
          else(es.length>1&&es.some(en=>hasDrop(en.key)||hasDrop(en.val))?RQ.std.hashOrder({v:es}):es).forEach(en=>{dropValue(en.key,null,e.line);dropValue(en.val,null,e.line);});
          return UNIT;
        }
        case 'remove':{
          if(c.k==='vec'){
            const k=at(args[0]);
            if(k>=c.v.length)throw panic('removal index (is '+k+') should be < len (is '+c.v.length+')',at0);
            return c.v.splice(k,1)[0];
          }
          const i=c.v.findIndex(en=>eqv(en.key,args[0]));
          if(i<0)return none();
          const [en]=c.v.splice(i,1);
          dropValue(en.key,null,e.line);
          return some(en.val);
        }
        case 'truncate':{
          const k=at(args[0]);
          if(k<c.v.length)c.v.splice(k).forEach(x=>dropValue(x,null,e.line));
          return UNIT;
        }
        case 'swap':{
          const a=at(args[0]),b=at(args[1]);
          for(const k of [a,b])if(k>=c.v.length)throw panic('index out of bounds: the len is '+c.v.length+' but the index is '+k,at0);
          [c.v[a],c.v[b]]=[c.v[b],c.v[a]];return UNIT;
        }
        case 'reverse':c.v.reverse();return UNIT;
        case 'sort':c.v.sort((x,y)=>cmpv(x,y));return UNIT;
        case 'contains':return bool(c.v.some(x=>eqv(x,args[0])));
        case 'contains_key':return bool(!!mapFind(c,args[0]));
        case 'get':case 'get_mut':{
          const mut=key.endsWith('get_mut');
          if(c.k==='vec'){const k=at(args[0]);return k<c.v.length?some(eref(k,mut)):none();}
          const en=mapFind(c,args[0]);
          return en?some(vref(en,mut)):none();
        }
        case 'first':return c.v.length?some(eref(0,false)):none();
        case 'last':return c.v.length?some(eref(c.v.length-1,false)):none();
        case 'extend':{
          const a=unref(args[0]);
          if(c.k==='vec')for(const x of a.v)c.v.push(x);
          else if(a.k==='map')for(const en of RQ.std.hashOrder(a)){const prev=insertEntry(en.key,en.val);if(prev!==null)dropValue(prev,null,e.line);}
          else for(const t of a.v){const prev=insertEntry(t.v[0],t.v[1]);if(prev!==null)dropValue(prev,null,e.line);}
          consume(a);
          return UNIT;
        }
        case 'entry.or_insert':case 'entry.or_default':{
          let en=mapFind(c,args[0]);
          const dflt=key.endsWith('default');
          if(en){dropValue(args[0],null,e.line);if(!dflt)dropValue(args[1],null,e.line);}
          else{en={key:args[0],val:dflt?defaultVal(res(typeOf(e)).to,e.line):args[1]};c.v.push(en);}
          return vref(en,true);
        }
      }
      return bug('method '+key);
    }
    const v=unref(rv),opt=key.startsWith('Option::');
    const ok=opt?v.variant==='Some':v.variant==='Ok';
    switch(key.slice(key.indexOf('::')+2)){
      case 'is_some':case 'is_none':case 'is_ok':case 'is_err':return bool(key.endsWith('some')||key.endsWith('is_ok')?ok:!ok);
      case 'unwrap':case 'expect':{
        if(ok)return v.fields[0].val;
        const msg=key.endsWith('expect')?unref(args[0]).v:null;
        const why=opt?msg??'called `Option::unwrap()` on a `None` value'
          :(msg??'called `Result::unwrap()` on an `Err` value')+': '+RQ.std.debug(v.fields[0].val,tick,MAX_OUTPUT);
        if(!opt)dropValue(v.fields[0].val,null,e.line);
        throw panic(why,at0);
      }
      case 'copied':case 'cloned':{
        if(!ok)return v;
        const x=unref(v.fields[0].val);
        return ctorVal({adt:'Option',variant:1},[key.endsWith('cloned')?cloneVal(x,e.line):x]);
      }
      case 'unwrap_or':{
        if(ok){dropValue(args[0],null,e.line);return v.fields[0].val;}
        if(!opt)dropValue(v.fields[0].val,null,e.line);
        return args[0];
      }
    }
    return bug('method '+key);
  }
  const patLitVal=n=>{
    if(n.t==='Unary')return -patLitVal(n.expr);
    if(n.t==='Path')return RQ.types.INT[n.segs[0].name][n.segs[1].name==='MIN'?0:1];
    return n.kind==='int'?BigInt(n.v):n.v;
  };
  const patNum=v=>typeof v==='string'?BigInt(v.codePointAt(0)):v;
  function pmatch(p,v){
    tick();
    const x=unref(v);
    switch(p.t){
      case 'Wild':return true;
      case 'IdentPat':{
        const o=info.get(p);
        return !o||o.bpath===undefined?x.variant===p.name:!p.sub||pmatch(p.sub,v);
      }
      case 'Or':return p.alts.some(a=>pmatch(a,v));
      case 'LitPat':{
        return x.v===patLitVal(p.lit);
      }
      case 'RangePat':{
        const n=patNum(x.v),lo=p.lo&&patNum(patLitVal(p.lo)),hi=p.hi&&patNum(patLitVal(p.hi));
        return (lo===null||n>=lo)&&(hi===null||(p.inclusive?n<=hi:n<hi));
      }
      case 'TuplePat':{
        const ri=p.pats.findIndex(q=>q.t==='Rest'),len=x.k==='unit'?0:x.v.length;
        return p.pats.every((q,i)=>q.t==='Rest'||pmatch(q,x.v[ri>=0&&i>ri?len-(p.pats.length-i):i]));
      }
      case 'PathPat':return x.k==='struct'||x.variant===p.path.segs[p.path.segs.length-1].name;
      case 'TupleStructPat':{
        if(x.k==='enum'&&x.variant!==p.path.segs[p.path.segs.length-1].name)return false;
        const ri=p.pats.findIndex(q=>q.t==='Rest'),len=x.fields.length;
        return p.pats.every((q,i)=>q.t==='Rest'||pmatch(q,x.fields[ri>=0&&i>ri?len-(p.pats.length-i):i].val));
      }
      case 'StructPat':
        if(x.k==='enum'&&x.variant!==p.path.segs[p.path.segs.length-1].name)return false;
        return p.fields.every(f=>pmatch(f.pat,x.fields.find(y=>y.name===f.name).val));
      default:return bug('pattern '+p.t);
    }
  }
  const patBinds=p=>{
    const out=[];
    RQ.walk(p,n=>{if(n.t==='IdentPat'&&info.get(n)&&info.get(n).bpath!==undefined)out.push(n);});
    return out;
  };
  function matchEx(e,env){
    const mi=info.get(e).match,sc=peel(e.scrut),mark=temps.length;
    let val,cell,ref=null,base=null;
    if(mi.ref){
      ref=ev(sc,env);cell=ref.cell;val=cell.val;
    }else{
      val=ev(sc,env);
      if(mi.place){const pl=sc.t==='Deref'?null:placeOf(sc,env);base=pl?pathName(pl.cell,pl.path):null;}
      else{
        cell={val,name:null,line:e.line};
        if(owns(val))temps.push({cell,line:e.line});
      }
    }
    const bindAll=(scope,a,moving)=>{
      for(const sp of patBinds(a.pat)){
        const o=info.get(sp),path=o.bpath.map(q=>q.f);
        let v;
        if(o.bmode==='ref')v={k:'ref',cell:fieldCell(cell,path),mut:false,loan:ref.loan};
        else if(!path.length){
          if(ref)v=ref;
          else if(!moving)v=val;
          else if(mi.place)v=mv(e.scrut,env);
          else{v=val;if(!isCopy(typeOf(sp)))cell.moved=true;}
        }else{
          const h=holderAt(val,path);
          v=h.val;
          if(moving&&!isCopy(typeOf(sp))){
            h.val=MOVED;
            note({t:'move',name:base&&base+'.'+path.join('.'),line:sp.line});
          }
        }
        declare(scope,sp.name,{val:v,name:sp.name,ty:tyName(sp),line:sp.line});
      }
    };
    let arm=null;
    for(const a of e.arms){
      if(!pmatch(a.pat,val))continue;
      if(a.guard){
        const probe=newScope();
        env.push(probe);
        try{bindAll(probe,a,false);if(!cond(a.guard,env))continue;}finally{env.pop();}
      }
      arm=a;break;
    }
    if(!arm)return bug('match');
    const scope=newScope();
    env.push(scope);
    let abandon=false;
    const lastIfLet=e.kind==='iflet'&&arm===e.arms[1];
    try{
      bindAll(scope,arm,true);
      if(e.kind==='let'||e.kind==='letelse'||lastIfLet)dropTemps(mark);
      return mv(arm.body,env);
    }catch(x){
      if(x instanceof Limit||x instanceof Unsup)abandon=true;
      throw x;
    }finally{
      env.pop();
      if(!abandon){
        dropScope(scope);
        if(e.kind==='iflet'||e.kind==='whilelet')dropTemps(mark);
      }
    }
  }

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
        const ct=(info.get(e)||{}).ctor;
        if(ct)return ctorVal(ct,[]);
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
        }else if(peel(e.lhs).t==='Index'){
          let r=e.op==='='?mv(e.rhs,env):ev(e.rhs,env),ic;
          try{ic=indexCell(peel(e.lhs),env);}catch(x){if(x instanceof Panic&&e.op==='=')dropValue(r,null,e.line);throw x;}
          const old=ic.val;
          if(e.op!=='=')r=binop(e.op.slice(0,-1),old,r,e);
          else dropValue(old,ic.name,e.line,true);
          ic.val=r;
          return UNIT;
        }else if(peel(e.lhs).t==='Field'){
          const pl=placeOf(e.lhs,env);
          if(!pl)throw new Unsup('assignment target',e.line);
          const old=getAt(read(pl.cell,e.line),pl.path);
          let r=e.op==='='?mv(e.rhs,env):ev(e.rhs,env);
          if(e.op!=='=')r=binop(e.op.slice(0,-1),old,r,e);
          else if(old.k!=='moved')dropValue(old,pathName(pl.cell,pl.path),e.line,true);
          pl.cell.val=setAt(pl.cell.val,pl.path,r);
          return UNIT;
        }else throw new Unsup('assignment target',e.line);
        if(!cell)return bug('assign');
        let r=e.op==='='?mv(e.rhs,env):ev(e.rhs,env);
        if(e.op!=='=')r=binop(e.op.slice(0,-1),read(cell,e.line),r,e);
        else if(cell.val!==null&&!cell.moved&&!cell.dropped)dropValue(cell.val,cell.name,e.line);
        cell.val=r;cell.moved=false;cell.dropped=false;return UNIT;
      }
      case 'Call':{
        const o=info.get(e)||{};
        if(o.ctor)return ctorVal(o.ctor,mvAll(e.args,env));
        if(o.dflt)return defaultVal(o.dflt,e.line);
        if(o.sig&&o.sig.key)return callFn(methodFns.get(o.sig.key),mvAll(e.args,env),e.line,o.sig.key);
        const sg=e.callee.t==='Path'?e.callee.segs:[],f=sg.length===1&&fns.get(sg[0].name);
        if(f)return callFn(f,mvAll(e.args,env),e.line);
        if(sg.length===2&&sg[0].name==='String'&&sg[1].name==='new')return string('',undefined,e.line);
        if(sg.length===2&&sg[1].name==='new'&&(sg[0].name==='Vec'||sg[0].name==='HashMap'))return coll(sg[0].name==='Vec'?'vec':'map',[],tyName(e),e.line,true);
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
        if(x.t==='Index'&&peel(x.index).t==='Range')return slice(e,x,env);
        if(x.t==='Field'){
          const pl=placeOf(x,env);
          if(!pl)throw new Unsup('borrow of a field',e.line);
          read(pl.cell,x.line);
          return {k:'ref',cell:fieldCell(pl.cell,pl.path),mut:e.mut,loan:pl.loan??e.id};
        }
        if(x.t==='Index'){
          if(!isVecIdx(x))throw new Unsup('borrow of a field',e.line);
          return {k:'ref',cell:indexCell(x,env),mut:e.mut,loan:e.id};
        }
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
        if((info.get(e)||{}).um)return userMethod(e,env);
        if(!RQ.std.methods.has(e.name))throw new Unsup('method call',e.line);
        if(e.name==='push_str'){
          const r=peel(e.recv);
          if(r.t==='Index'&&!isVecIdx(r))throw new Unsup('borrow of a field',e.line);
          const c=r.t==='Index'?indexCell(r,env):cellOf(r,env),add=unref(ev(e.args[0],env)).v;
          c.val=string(c.val.v+add,c.val.id);return UNIT;
        }
        const rv=ev(e.recv,env);
        if(e.name==='len'&&(rv.k==='array'||rv.k==='ref'&&(rv.cell.val.k==='array'||rv.cell.val.k==='vec')))return int(BigInt(view(rv).len),'usize');
        const s=unref(rv).v;
        if(rv.k==='String'&&!isPlace(e.recv))temps.push({v:rv,line:e.line});
        if(e.name==='len')return int(BigInt(utf8Len(s)),'usize');
        if(e.name==='as_str')return {k:'str',v:s};
        return string(s,undefined,e.line);
      }
      case 'Macro':return e.name==='vec'?vecMacro(e,env):macro(e,env);
      case 'Block':return block(e,env);
      case 'Return':throw new Ret(e.expr?mv(e.expr,env):UNIT);
      case 'Tuple':return e.elems.length?{k:'tuple',v:mvAll(e.elems,env)}:UNIT;
      case 'Array':return {k:'array',v:mvAll(e.elems,env)};
      case 'StructLit':{
        const c=info.get(e).ctor,names=c.variant===null?declFields(decls.get(c.adt)):variantInfo(c.adt,c.variant).fields;
        const vals=mvAll(e.fields.map(f=>f.expr),env),by=new Map(e.fields.map((f,i)=>[f.name,vals[i]]));
        return ctorVal(c,names.map(n=>by.get(n)));
      }
      case 'Match':return matchEx(e,env);
      case 'ArrayRepeat':{const v=ev(e.elem,env);return {k:'array',v:Array(Number(e.len.v)).fill(v)};}
      case 'Index':{
        const a=view(ev(e.expr,env)),i=ev(e.index,env);
        if(i.v>=BigInt(a.len))throw panic('index out of bounds: the len is '+a.len+' but the index is '+i.v,isVecIdx(e)?{line:e.bline,col:e.bcol}:e);
        return a.arr[a.off+Number(i.v)];
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
        const fi=info.get(e).fi;
        if(fi)return forColl(e,fi,env);
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

  const extra=()=>({events,snaps,hashIterated:sess.iterated});
  try{
    // rustc range-checks every const; the lint pass reports an overflow, so a const only fails here on a shape it cannot model
    for(const n of consts.keys())constVal(n);
    callFn(fns.get('main'),[],1);
    snapshot(snaps.length?snaps[snaps.length-1].line:1,true);
    return {status:'ok',stdout:out,stderr:err,exit:0,...extra()};
  }catch(x){
    // a value nested thousands deep overflows the JS stack in drop, clone, == or Debug
    if(x instanceof RangeError)x=new Limit('nesting');
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
