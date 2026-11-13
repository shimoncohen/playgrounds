/* Lowers the fns the move and borrow pass analyses to a control-flow graph. RQ.mir.analysed(fn, info, ast) is the skip rule: a fn
   without a reference, a String or a deferred let is never lowered, so old programs keep their results. DOM-free.
   RQ.mir(ast, info) gives {fns, unsupported}. A fn is {name, ast (the Fn node id), line, locals, blocks}; blocks[0] is the entry.
     local  {id, name (null for a temp), src (the named local a temp was copied from), bind (the checker's binding), ty, mut, param, line}
            A field of an owned local is a local of its own: {parent, sel (the field name, or 'Variant.field' below an enum), path:true, name 'p.f'}. The borrow pass
            treats a path and its ancestors and descendants as overlapping and two siblings as disjoint.
     block  {id, instrs, succ (block ids), unreachable (no path from the entry; the analysis skips it)}
     instr  {op, ast (node id), line, col, ...}:
       decl   {l, uninit}     the local comes alive; uninit for `let x: T;`. Params have no decl, they are set on entry.
       assign {l, rv}         whole-local write. Compound `x += v` is `x = op(copy x, v)`.
       eval   {rv}            rv whose result is unit or unused
       store  {ref, x}        `*r = v`: ref is an operand for the reference local, x the value
       dead   {l}             StorageDead of a named local, in reverse declaration order. Temps get none.
       branch {x}             the block has two succ: then, else (loop body, loop exit)
       return {x}             x is null for a unit fn
     rv     {k:'use',x} | {k:'const'} | {k:'ref',l,mut,implicit?} | {k:'call',fn,args,from,more} | {k:'method',name,recv,args} | {k:'op',args}
            | {k:'agg',args} | {k:'deref',x} | {k:'macro',name,args} | {k:'peek',x} (a match reads its scrutinee without moving it).
            A call to a method has the receiver as its first argument; `ref` of a path borrows just that field.  `ref` borrows the local l (`&l[a..b]` of an owned l too); from is the argument index a returned reference borrows from, or -1; a method call on an owned String
            gets a ref temp as recv, and `as_str` on it carries that ref in its result.
     operand {k:'copy'|'move',l} by isCopy of the value's type, or {k:'const'}. A `&mut` local passed to a call or a method
            is an implicit reborrow, not a move (except std drop): {k:'copy',l,reb:true,sh} (sh: the callee takes `&`). Reading a Field or Index is a copy of the root local. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
RQ.BORROW_FEATURES=['borrow of a field','temporary borrow','partial move','move out of reference','two-phase borrow','constant condition','program too large','closure capture of a field','closure capture of a mutable reference'];
const MAX_INSTRS=5000,MAX_LOCALS=300;
const PRINT=new Set(['println','print','eprintln','eprint']);
const peel=RQ.peel;
const NIL={k:'const'};
const BIG={};

const hasUserDrop=ast=>!!ast&&ast.items.some(i=>i.t==='Fn'&&i.name==='drop');

function analysed(fn,info,ast){
  const {isCopy,hasRef}=RQ.types;
  const userDrop=hasUserDrop(ast);
  let hit=!!(info.get(fn)&&info.get(fn).reg);
  RQ.walk(fn,n=>{
    if(hit)return false;
    if(n.t==='Ref'&&n.expr||n.t==='Deref'||n.t==='MethodCall'||n.t==='Closure'||n.t==='Let'&&!n.init)hit=true;
    else if(n.t==='Call'&&n.callee.t==='Path'){
      const sg=n.callee.segs.map(s=>s.name).join('::');
      if(sg==='String::from'||sg==='String::new'||sg==='drop'&&!userDrop)hit=true;
    }
    const o=info.get(n);
    if(o&&o.ty&&(!isCopy(o.ty)||hasRef(o.ty)))hit=true;
    return hit?false:undefined;
  });
  return hit;
}

function lowerFn(f,info,un,err,userDrop,dropTys,fname,sink,ctx){
  const {T,res,isCopy}=RQ.types;
  const L=[],B=[],lm=new Map(),scopes=[],loops=[];
  let cur,count=0,retL;
  const tyOf=e=>{const o=info.get(e);return res(o&&o.ty||T.any);};
  const carries=t=>RQ.types.hasRef(t)||t.k==='str';
  const rebArg=new Map(),extRef=new Set(),argRef=new Map(),asgRef=new Set(),stmtTemps=[];
  const isUnit=t=>t.k==='unit'||t.k==='never';
  const isBool=e=>{e=peel(e);return e.t==='Lit'&&e.kind==='bool';};
  const local=(name,ty,o)=>{
    if(L.length>=MAX_LOCALS)throw BIG;
    L.push({id:L.length,name,bind:null,ty:res(ty),mut:false,param:false,line:0,...o});
    return L.length-1;
  };
  const temp=ty=>local(null,ty);
  const blk=()=>{B.push({id:B.length,instrs:[],succ:[],unreachable:false});return B.length-1;};
  const edge=(a,b)=>B[a].succ.push(b);
  const emit=(op,nd,o)=>{
    if(++count>MAX_INSTRS)throw BIG;
    B[cur].instrs.push({op,ast:nd.id,line:nd.line,col:nd.col,...o});
  };
  const opnd=(l,reb,sh)=>reb?{k:'copy',l,reb:true,sh:!!sh}:{k:isCopy(L[l].ty)?'copy':'move',l};
  // a closure body sees the locals of the fn around it as captures: a local of its own that starts out holding the value
  const caps=new Map();
  const lidBind=b=>{
    if(lm.has(b))return lm.get(b);
    const pl=ctx?ctx.lidBind(b):-1;
    if(pl<0)return -1;
    const o=ctx.L[pl];
    const id=local(o.name,o.ty,{bind:b,mut:o.mut,param:true,cap:true,line:o.line});
    lm.set(b,id);caps.set(b,id);
    return id;
  };
  const lid=p=>{const o=info.get(p),b=o&&o.bind;return b?lidBind(b):-1;};
  const put=(rv,nd,dest,ty,pos)=>{
    const at=pos?{line:pos.line,col:pos.col,nline:nd.line,ncol:nd.col}:{};
    if(dest===undefined){
      if(isUnit(res(ty))){emit('eval',nd,{rv,...at});return NIL;}
      dest=temp(ty);
    }
    emit('assign',nd,{l:dest,rv,...at});
    return opnd(dest);
  };
  const fin=(x,nd,dest)=>dest===undefined?x:put({k:'use',x},nd,dest);
  const out=(dest)=>dest===undefined?NIL:opnd(dest);
  const paths=new Map(),uninit=new Set();
  const pathLocal=(base,sel,ty)=>{
    const k=base+'/'+sel;
    if(paths.has(k))return paths.get(k);
    const b=L[base];
    const id=local(b.name===null?null:b.name+'.'+sel.replace(/^[^.]*\./,''),ty,{parent:base,sel,path:true,mut:b.mut,line:b.line});
    paths.set(k,id);return id;
  };
  // a plain name ('local'), fields down from an owned local ('path'), fields down from a reference local ('via'), an index somewhere in the chain ('idx')
  function classify(e){
    let n=peel(e);
    const fields=[];
    for(;n.t==='Field'||n.t==='Index';n=peel(n.expr)){
      if(n.t==='Index')return {k:'idx'};
      fields.unshift(n);
    }
    const l=n.t==='Path'?lid(n):-1;
    if(l<0)return {k:'other'};
    if(!fields.length)return {k:'local',l};
    if(fields.some(f=>tyOf(f.expr).k==='ref'))return {k:'via',l};
    let cur=l;
    for(const f of fields)cur=pathLocal(cur,f.name,tyOf(f));
    return {k:'path',l:cur};
  }
  // moving a field out of a type that implements Drop is E0509
  const dropped=l=>{for(let p=L[l].parent;p!==undefined;p=L[p].parent)if(L[p].ty.k==='struct'&&dropTys.has(L[p].ty.name))return true;return false;};
  const declare=(pat,nd,uninit_,ty,param)=>{
    const b=info.get(pat).bind;
    const self=pat.t==='SelfParam';
    const id=local(self?'self':pat.name,ty,{bind:b,mut:self?pat.mut&&!pat.ref:!!pat.mut,param:!!param,line:pat.line});
    lm.set(b,id);scopes[scopes.length-1].push(id);
    if(uninit_)uninit.add(id);
    if(!param)emit('decl',nd,{l:id,uninit:uninit_});
    return id;
  };
  const kill=(ids,nd)=>{for(let j=ids.length-1;j>=0;j--)emit('dead',nd,{l:ids[j]});};
  const deads=(from,nd)=>{for(let i=scopes.length-1;i>=from;i--)kill(scopes[i],nd);};
  const retDest=ty=>{if(retL===undefined){retL=temp(ty);L[retL].ret=true;}return retL;};

  // a Path argument or receiver: a `&mut` local is reborrowed here, not moved; sh: the callee takes `&`, so the reborrow is shared
  const argOp=(x,sh)=>{
    const p=peel(x),l=p.t==='Path'?lid(p):-1;
    if(l>=0){const t=L[l].ty;return opnd(l,t.k==='ref'&&t.mut,sh);}
    return ex(x);
  };
  // std `drop<T>(x: T)` takes its argument by value: a generic parameter gets no reborrow, so a `&mut` local is moved
  const moveOp=x=>{
    const p=peel(x),l=p.t==='Path'?lid(p):-1;
    return l>=0?opnd(l):ex(x);
  };
  // Operands are read left to right. A named local read before a sibling that emits instrs is copied or moved into a temp now,
  // not by the instr that consumes it; a reborrow is left alone, its use at the consumer keeps the loans live (see rebTwice).
  const seq=(es,f)=>es.map((e,i)=>{
    const x=f(e);
    if(x.k==='const'||x.reb||L[x.l].name===null||es.slice(i+1).every(s=>['Lit','Path'].includes(peel(s).t)))return x;
    const t=put({k:'use',x},e,undefined,L[x.l].ty);
    if(t.k!=='const')L[t.l].src=L[x.l].name;
    return t;
  });
  // a temporary dies at the end of its statement, so a loan that outlives it is E0716
  const ownTemp=l=>{
    const t=L[l];
    if(t.name===null&&!t.tmp&&t.ty.k!=='ref'&&t.ty.k!=='str'){t.tmp=true;stmtTemps.push(l);}
  };
  // the receiver of a method that gives back a borrow of it: a constant is promoted and lives forever
  const ownRecv=(e,l)=>{
    const pr=promo(e.recv);
    if(pr==='yes')return;
    if(pr==='maybe'&&carries(tyOf(e))){un('temporary borrow',e);return;}
    ownTemp(l);
  };
  // rustc promotes the borrow of a constant to a static, which never dies: yes, no, or maybe when it depends on rules not modeled
  function promo(x){
    x=peel(x);
    switch(x.t){
      case 'Lit':return 'yes';
      case 'Unary':return (x.op==='-'||x.op==='!')&&scalar(x.expr)?promo(x.expr):'maybe';
      case 'Tuple':case 'Array':return worst(x.elems.map(promo));
      case 'ArrayRepeat':return peel(x.len).t==='Lit'?promo(x.elem):'maybe';
      // `&&`, `||` and a comparison or operator on a non-scalar (str, tuple, String) are calls or branches, which rustc never promotes
      case 'Binary':{
        if(x.op==='&&'||x.op==='||')return 'no';
        if(x.op==='/'||x.op==='%'){
          if(!scalar(x.lhs)||!scalar(x.rhs))return 'no';
          const ops=worst([promo(x.lhs),promo(x.rhs)]);
          return ['float','fvar'].includes(tyOf(x.lhs).k)?ops:worst([ops,divisorOk(x)]);
        }
        const ok=['+','-','*','&','|','^','<<','>>','==','!=','<','>','<=','>='].includes(x.op);
        if(!ok)return 'maybe';
        return scalar(x.lhs)&&scalar(x.rhs)?worst([promo(x.lhs),promo(x.rhs)]):'no';
      }
      case 'Cast':return scalar(x.expr)&&scalar(x)?promo(x.expr):'maybe';
      case 'StructLit':{
        if(x.base)return 'maybe';
        return dropTys.has(x.path.segs[x.path.segs.length-1].name)?'no':worst(x.fields.map(f=>promo(f.expr)));
      }
      case 'Call':{
        const ct=(info.get(x)||{}).ctor;
        if(!ct)return 'no';
        return dropTys.has(ct.adt)?'no':worst(x.args.map(promo));
      }
      case 'Path':{
        const ct=(info.get(x)||{}).ctor;
        return ct?(dropTys.has(ct.adt)?'no':'yes'):lid(x)>=0?'no':'maybe';
      }
      case 'Macro':case 'MethodCall':return 'no';
      default:return 'maybe';
    }
  }
  // rustc promotes an integer `/` or `%` only when the divisor is itself a literal other than 0, and for a signed type with divisor -1 only when the dividend is a literal other than the minimum
  function divisorOk(x){
    const lit=n=>{
      n=peel(n);
      const neg=n.t==='Unary'&&n.op==='-';
      if(neg)n=peel(n.expr);
      return n.t==='Lit'&&n.kind==='int'?(neg?-BigInt(n.v):BigInt(n.v)):null;
    };
    const d=lit(x.rhs);
    if(d===null){
      const r=peel(x.rhs);
      return r.t==='Binary'||r.t==='Cast'||r.t==='Unary'&&r.op==='!'?'no':'maybe';
    }
    if(d===0n)return 'no';
    const ty=tyOf(x.lhs),name=ty.k==='int'?ty.ty:'i32';
    if(d!==-1n||!RQ.types.isSigned(name))return 'yes';
    const n=lit(x.lhs);
    return n===null?'maybe':n===RQ.types.INT[name][0]?'no':'yes';
  }
  const scalar=n=>['int','ivar','float','fvar','bool','char'].includes(tyOf(n).k);
  const worst=rs=>rs.includes('no')?'no':rs.includes('maybe')?'maybe':'yes';
  // the same `&mut` local twice among the operands of one call (E0499 in rustc) has no loan here: not modelled
  const rebTwice=(es,nd)=>{
    for(const a of es){
      const p=peel(a),l=p.t==='Path'?lid(p):-1;
      if(l<0||L[l].ty.k!=='ref'||!L[l].ty.mut)continue;
      let n=0;
      RQ.walk(es,x=>{if(x.t==='Path'&&lid(x)===l)n++;});
      if(n>1){un('reborrow',nd);return;}
    }
  };
  const rootOf=p=>{
    const idx=[];
    for(p=peel(p);p.t==='Field'||p.t==='Index';p=peel(p.expr))if(p.t==='Index')idx.unshift(p.index);
    const l=p.t==='Path'?lid(p):-1;
    return {base:p,l,idx};
  };
  // A Vec is indexed through `Index::index(&v, i)`: a read borrows the whole collection for a moment, a write or `&mut v[i]` borrows it mutably.
  const vecIdx=n=>{const o=n.t==='Index'&&info.get(n);return !!o&&!!o.vecIdx;};
  const hasVecIdx=p=>{for(p=peel(p);p.t==='Field'||p.t==='Index';p=peel(p.expr))if(vecIdx(p))return true;return false;};
  function vecRoot(e){
    const idx=[],steps=[];let inner=null;
    for(let n=peel(e);n.t==='Field'||n.t==='Index';n=peel(n.expr)){steps.unshift(n);if(n.t==='Index'){idx.unshift(n.index);inner=n;}}
    // the IndexMut borrow is of the place below the first Vec index, which rustc names with `[_]` for each array index on the way
    return {c:classify(inner.expr),idx,inner,sfx:stepText(steps,steps.indexOf(inner),steps.findIndex(vecIdx))};
  }
  const stepText=(steps,from,to)=>steps.slice(from,to).map(n=>n.t==='Index'?'[_]':'.'+n.name).join('');
  const hasIdx=p=>{for(p=peel(p);p.t==='Field'||p.t==='Index';p=peel(p.expr))if(p.t==='Index')return true;return false;};
  const fieldChain=x=>{const o=[];for(x=peel(x);x.t==='Field';x=peel(x.expr))o.unshift(x.name);return x.t==='Path'?[lid(x),...o]:null;};
  const related=(q,b)=>q[0]===b[0]&&q.slice(1,Math.min(q.length,b.length)).every((y,k)=>y===b[k+1]);
  function chainsOn(n,l,out=[]){
    const q=fieldChain(n);
    if(q&&q[0]===l)out.push(q);
    else kidsOf(n).forEach(k=>chainsOn(k,l,out));
    return out;
  }
  // Reborrows of a `&mut` local are not tracked, so an index operand that reads the collection being written cannot be judged
  const readsPlace=(n,base)=>{const b=fieldChain(base);return !b||chainsOn(n,b[0]).some(q=>related(q,b));};
  // an operand that borrows the collection at c; a reference local is reused, so its loans stay on the result
  function vecRef(c,mut,nd,implicit,r,pos){
    const viaRef=c.k==='via'||(c.k==='local'||c.k==='path')&&L[c.l].ty.k==='ref';
    if(mut&&r&&viaRef&&r.idx.some(x=>readsPlace(x,r.inner.expr))){un('reborrow',nd);return null;}
    if(viaRef){const t=L[c.l].ty;return opnd(c.l,t.k==='ref'&&t.mut,!mut);}
    if(c.k==='local'||c.k==='path')return put({k:'ref',l:c.l,mut,implicit,...r&&r.sfx&&{sfx:r.sfx}},nd,undefined,T.ref(mut,L[c.l].ty,0),pos);
    un('temporary borrow',nd);return null;
  }
  // An array element is a place of the array itself, so borrowing it lends the whole array (rustc names it `a[_]`); the indices run before the borrow starts.
  function elemRoot(e){
    const idx=[],steps=[];let inner=null;
    for(let n=peel(e);n.t==='Field'||n.t==='Index';n=peel(n.expr)){steps.unshift(n);if(n.t==='Index'){idx.unshift(n.index);inner=n;}}
    return {c:classify(inner.expr),idx,inner,sfx:stepText(steps,steps.indexOf(inner),steps.length)};
  }
  function elemRef(r,mut,nd,implicit,pos){
    const c=r.c;
    if(c.k!=='local'&&c.k!=='path'&&c.k!=='via'){un('temporary borrow',nd);return null;}
    const t=L[c.l].ty,viaRef=c.k==='via'||t.k==='ref';
    if(mut&&viaRef&&r.idx.some(x=>readsPlace(x,r.inner.expr))){un('reborrow',nd);return null;}
    if(mut&&viaRef&&t.k==='ref'&&!t.mut){err('E0596',pos||nd,{name:chainText(r.inner.expr)+r.sfx,ref:true});return null;}
    emit('eval',nd,{rv:{k:'op',args:r.idx.map(x=>ex(x))}});
    if(viaRef)return opnd(c.l,t.k==='ref'&&t.mut,!mut);
    return put({k:'ref',l:c.l,mut,implicit,sfx:r.sfx},nd,undefined,T.ref(mut,t,0),pos);
  }
  // the reference a method call or loop takes of an indexed place: a Vec index borrows the Vec first and runs the indices under it
  function idxRef(p,mut,nd,implicit){
    if(!hasVecIdx(p))return elemRef(elemRoot(p),mut,nd,implicit);
    const r=vecRoot(p),ro=vecRef(r.c,mut,nd,implicit,r);
    if(ro)emit('eval',nd,{rv:{k:'op',args:[ro,...r.idx.map(x=>ex(x))]}});
    return ro;
  }
  const kidsOf=n=>Object.values(n).flatMap(v=>Array.isArray(v)?v:[v]).filter(x=>x&&typeof x==='object'&&typeof x.t==='string');
  // A `&mut` method call may read its receiver while it computes the arguments (a two-phase borrow). The arguments then run before the
  // `&mut` borrow starts here, so only reads of the receiver are allowed: a `&mut` use of it, or a move, is not modelled.
  function twoPhaseOk(args,b){
    const rooted=n=>{n=peel(n);while(n.t==='Field'||n.t==='Index')n=peel(n.expr);return n.t==='Path'&&!!info.get(n)&&info.get(n).bind===b;};
    const idxOf=n=>{const o=[];for(n=peel(n);n.t==='Field'||n.t==='Index';n=peel(n.expr))if(n.t==='Index')o.push(n.index);return o;};
    const ok=n=>{
      if(n.t==='Path')return !(info.get(n)&&info.get(n).bind===b);
      if(n.t==='MethodCall'&&rooted(n.recv)){const u=info.get(n).um;return !!u&&u.self==='&'&&u.from<0&&u.adj!=='val'&&idxOf(n.recv).every(ok)&&n.args.every(ok);}
      if(n.t==='Ref'&&rooted(n.expr))return !n.mut&&idxOf(n.expr).every(ok);
      if((n.t==='Field'||n.t==='Index')&&rooted(n))return isCopy(tyOf(n))&&idxOf(n).every(ok);
      return kidsOf(n).every(ok);
    };
    return args.every(ok);
  }
  // format_args! takes `&arg` of every argument first, so a reference local is borrowed too and a later arg cannot reassign it
  const printLocal=(l,nd)=>put({k:'ref',l,mut:false,implicit:true},nd,undefined,T.ref(false,L[l].ty,0));
  function printArg(x,nd){
    const p=peel(x);
    if(p.t==='Path'){const l=lid(p);if(l>=0)return printLocal(l,nd);}
    // rustc takes `&*r` of a `*r` argument, which keeps r's loan alive to the call like `&r`
    if(p.t==='Deref'){
      const q=peel(p.expr),l=q.t==='Path'?lid(q):-1;
      if(l>=0&&L[l].ty.k==='ref')return printLocal(l,nd);
    }
    if(p.t==='Field'){
      const c=classify(p);
      if(c.k==='path')return put({k:'ref',l:c.l,mut:false,implicit:true},p,undefined,T.ref(false,L[c.l].ty,0));
    }
    if(p.t==='Field'||p.t==='Index'){
      const r=rootOf(p);
      if(r.l>=0){
        if(r.idx.length)emit('eval',p,{rv:{k:'op',args:r.idx.map(x=>ex(x))}});
        return put({k:'ref',l:r.l,mut:false,implicit:true},p,undefined,T.ref(false,L[r.l].ty,0));
      }
    }
    return ex(x);
  }

  const RANK={Fn:0,FnMut:1,FnOnce:2};
  function captureUse(F){
    const root=l=>{while(F.locals[l].parent!==undefined)l=F.locals[l].parent;return l;};
    const ids=new Set(F.locals.filter(l=>l.cap).map(l=>l.id)),use=new Map([...ids].map(l=>[l,{mv:null,mut:null,field:false}]));
    const note=(l,kind,i)=>{
      const r=root(l);
      if(!ids.has(r))return;
      const m=use.get(r);
      if(r!==l)m.field=true;
      if(kind==='move'&&!m.mv)m.mv=i;
      if((kind==='mut'||kind==='write')&&!m.mut)m.mut={i,write:kind==='write'};
    };
    for(const b of F.blocks)for(const i of b.instrs){
      const o=x=>{if(x&&x.k!=='const')note(x.l,x.k==='move'?'move':x.reb&&!x.sh?'mut':'copy',i);};
      const rv=r=>{
        if(r.k==='ref')note(r.l,r.mut?'mut':'ref',i);
        else if(r.k==='use'||r.k==='deref'||r.k==='peek')o(r.x);
        else if(r.k==='method'){o(r.recv);r.args.forEach(o);}
        else if(r.args)r.args.forEach(o);
      };
      if(i.rv)rv(i.rv);
      else if(i.op==='store'){o(i.ref);o(i.x);}
      else if(i.op==='branch'||i.op==='return')o(i.x);
      if(i.op==='assign'||i.op==='write')note(i.l,'write',i);
    }
    return use;
  }
  function closureEx(e,dest){
    const ty=tyOf(e);
    const body=e.body.t==='Block'?e.body:{t:'Block',id:e.body.id,line:e.body.line,col:e.body.col,stmts:[],tail:e.body};
    const sub=lowerFn({t:'Fn',id:e.id,line:e.line,col:e.col,params:e.params,selfParam:null,body},info,un,err,userDrop,dropTys,'closure at line '+e.line,sink,{lidBind,L});
    if(!sub)return fin(NIL,e,dest);
    sink.push(sub);
    const use=captureUse(sub),o=info.get(e);
    o.cl={caps:[],move:e.move};
    let kind='Fn',first=null;
    const ops=[],copy=[];
    for(const [bind,il] of sub.caps){
      const u=use.get(il),pl=lm.get(bind),t=L[pl].ty;
      if(t.k==='ref'&&t.mut){un('closure capture of a mutable reference',e);return fin(NIL,e,dest);}
      if(u.field){un('closure capture of a field',e);return fin(NIL,e,dest);}
      const byRef=t.k==='ref'||t.k==='str';
      let mode;
      if(u.mv){kind='FnOnce';if(!first)first={i:u.mv,name:L[pl].name,move:true};}
      else if(u.mut&&kind!=='FnOnce'){kind='FnMut';if(!first)first={i:u.mut.i,name:L[pl].name,write:u.mut.write};}
      if(byRef){mode='copy';ops.push(opnd(pl));copy.push(true);}
      else if(e.move||u.mv){mode=isCopy(t)?'copy':'move';ops.push(opnd(pl));copy.push(isCopy(t));}
      else if(u.mut){mode='mut';ops.push(put({k:'ref',l:pl,mut:true,cap:true},e,undefined,T.ref(true,t,0)));copy.push(false);}
      else{mode='ref';ops.push(put({k:'ref',l:pl,mut:false,cap:true},e,undefined,T.ref(false,t,0)));copy.push(true);}
      o.cl.caps.push({name:L[pl].name,bind,mode});
    }
    ty.kind=kind;ty.copy=copy.every(Boolean);
    if(!ty.copy&&ty.needCopy)err('E0277',ty.needCopy,{what:'bound',trait:'Copy',type:'{closure}'});
    ty.sharedCap=o.cl.caps.some(c=>c.mode==='ref');ty.mutCap=o.cl.caps.some(c=>c.mode==='mut');
    o.cl.kind=kind;
    // a closure written where a trait is expected takes its kind from it, so the body is what breaks; one named first is judged where it is passed
    if(ty.exp){
      if(RANK[ty.exp]<RANK[kind]&&first){
        const at={line:first.i.line,col:first.i.col};
        if(first.move)err('E0507',at,{name:first.name,closure:ty.exp});
        else err(first.write?'E0594':'E0596',at,{name:first.name,closure:ty.exp});
      }
    }else if(ty.need&&RANK[ty.need]<RANK[kind])err('E0525',e,{want:ty.need,has:kind});
    return put({k:'call',fn:'closure',args:ops,from:ops.length?0:-1,more:ops.slice(1).map((_,i)=>i+1)},e,dest,ty);
  }
  function closureCall(e,dest){
    const c=peel(e.callee);
    let l,x;
    if(c.t==='Path')l=lid(c);
    else{x=ex(c);l=x.k==='const'?-1:x.l;}
    if(l<0){un('call',e);return fin(NIL,e,dest);}
    const t=L[l].ty,kind=t.k==='param'&&t.fnb?t.fnb.kind:t.kind;
    if(!kind){un('call',e);return fin(NIL,e,dest);}
    const callee=kind==='Fn'?{k:'copy',l}:kind==='FnMut'?put({k:'ref',l,mut:true,implicit:true},e,undefined,T.ref(true,t,0)):opnd(l);
    rebTwice(e.args,e);
    const args=seq(e.args,argOp);
    return put({k:'call',fn:'closure',args:[callee,...args],from:-1,more:[]},e,dest,tyOf(e));
  }

  function place(e,dest){
    if(hasVecIdx(e)){
      const r=vecRoot(e);
      if(!isCopy(tyOf(e))){
        const bt=tyOf(r.inner.expr);
        err('E0507',e,{index:true,type:RQ.types.show(bt.k==='ref'?bt.to:bt)});
        return fin(NIL,e,dest);
      }
      const idx=r.idx.map(x=>ex(x)),ro=vecRef(r.c,false,e,true);
      if(!ro)return fin(NIL,e,dest);
      return put({k:'op',args:[ro,...idx]},e,dest,tyOf(e));
    }
    const c=classify(e);
    if(c.k==='path'){
      if(!isCopy(tyOf(e))&&dropped(c.l)){un('partial move',e);return fin(NIL,e,dest);}
      return fin(opnd(c.l),e,dest);
    }
    if(!isCopy(tyOf(e))){
      if(c.k==='via')err('E0507',e,{name:chainText(e),mut:L[c.l].ty.mut});else un('partial move',e);
      return fin(NIL,e,dest);
    }
    // a number read through a reference carries none of the reference's loans, but it still uses the reference; a `&str` field keeps them
    if(c.k==='via'&&!carries(tyOf(e))){emit('eval',e,{rv:{k:'peek',x:{k:'copy',l:c.l}}});return fin(NIL,e,dest);}
    const r=rootOf(e);
    let base;
    if(r.l>=0)base={k:'copy',l:r.l};
    else{const x=ex(r.base);base=x.k==='const'?x:{k:'copy',l:x.l};}
    return r.idx.length?put({k:'op',args:[base,...r.idx.map(x=>ex(x))]},e,dest,tyOf(e)):fin(base,e,dest);
  }

  const chainText=e=>{const parts=[];for(e=peel(e);e.t==='Field';e=peel(e.expr))parts.unshift(e.name);return [e.t==='Path'?e.segs[0].name:'value',...parts].join('.');};
  // `&1` or `&String::from("a")` as an argument of a Vec or HashMap method: the method only reads it during the call and its result never borrows from it
  function stdArg(x,u,i){
    const q=peel(x);
    if(q.t!=='Ref'||q.mut||!/^(Vec|HashMap)::/.test(u.key)||u.from===i+1)return argOp(x,true);
    const inner=peel(q.expr);
    if(['Path','Field','Index','Deref'].includes(inner.t)||(inner.t==='Index'&&peel(inner.index).t==='Range'))return argOp(x,true);
    const v=ex(inner),t=v.k==='const'||isCopy(tyOf(inner))?put({k:'use',x:v},q,undefined,tyOf(inner)):v;
    return t.k==='const'?t:put({k:'ref',l:t.l,mut:false,implicit:true},q,undefined,T.ref(false,tyOf(inner),0));
  }
  const stdArgs=u=>{let i=0;return x=>stdArg(x,u,i++);};
  const SLICE_MUT=new Set(['Vec::swap','Vec::get_mut']);
  function umethod(e,dest){
    lendArgs(e);
    const u=info.get(e).um,p=peel(e.recv);
    let ro,rest,inner;
    if(u.ref){
      if(u.adj==='copy'){
        const t=tyOf(e.recv);
        ro=put({k:'deref',x:argOp(e.recv)},e,undefined,t.k==='ref'?res(t.to):t);
      }else{
        const l=p.t==='Path'?lid(p):-1;
        // a `&mut` variable whose method hands back a borrow of it: the loan is on `*v`, a reborrow of the variable
        if(info.get(e).forMove)ro=moveOp(e.recv);
        else if(u.from===0&&l>=0&&L[l].ty.k==='ref'&&L[l].ty.mut){
          const mut=u.self==='&mut';
          ro=put({k:'ref',l,mut,implicit:true,deref:true},e,undefined,T.ref(mut,L[l].ty,0));
        }else ro=argOp(e.recv,u.adj==='reb'||u.self==='&');
      }
      rest=seq(e.args,stdArgs(u));
    }else if(u.adj==='val'){
      const nextArg=stdArgs(u);
      [ro,...rest]=seq([e.recv,...e.args],x=>x===e.recv?ex(x):nextArg(x));
    }else{
      const mut=u.adj==='&mut',c=classify(e.recv);
      let target=-1;
      if(c.k==='local'||c.k==='path')target=c.l;
      else if(c.k==='via'){
        // behind a reference the field is reached through the reference itself, so the call reuses it as it is
        const t=L[c.l].ty;
        ro=opnd(c.l,t.k==='ref'&&t.mut,!mut);
      }else if(c.k==='other'||u.kind==='temp'){
        const x=ex(e.recv);
        if(x.k!=='const')target=x.l;
        else{
          const t=put({k:'use',x},e.recv,undefined,tyOf(e.recv));
          target=t.k==='const'?-1:t.l;
        }
        if(target>=0)ownRecv(e,target);
      }else if(c.k==='idx'){
        ro=idxRef(e.recv,mut,e,true);
        if(!ro)return fin(NIL,e,dest);
      }else{un('borrow of a field',e);return fin(NIL,e,dest);}
      let early=null;
      if(ro===undefined){
        if(target<0){un('temporary borrow',e);return fin(NIL,e,dest);}
        if(mut){
          let q=p;
          while(q.t==='Field')q=peel(q.expr);
          const b=q.t==='Path'?info.get(q).bind:null;let again=false,shared=false,mutRef=false;
          // a shared reference local, or a closure holding shared captures, read in the arguments may be a loan of the receiver, which a reservation allows until the call starts
          RQ.walk(e.args,a=>{
            if(a.t!=='Path')return;
            if(b&&info.get(a)&&info.get(a).bind===b)again=true;
            else{const l=lid(a),t=l>=0&&L[l].ty;if(t&&t.k==='ref'){if(t.mut)mutRef=true;else shared=true;}else if(t&&t.k==='closure'){if(t.mutCap)mutRef=true;else if(t.sharedCap)shared=true;}}
          });
          if(shared&&!mutRef)again=true;
          // slice methods reach the Vec through DerefMut, which gets no two-phase borrow: the arguments run under a live `&mut`
          if(again&&!SLICE_MUT.has(u.key)){
            if(twoPhaseOk(e.args,b)){rebTwice(e.args,e);early=seq(e.args,stdArgs(u));}
            else un('two-phase borrow',e);
          }
        }
        ro=put({k:'ref',l:target,mut,implicit:true},e,undefined,T.ref(mut,L[target].ty,0));
        inner=target;
      }
      if(early)rest=early;
      else{rebTwice(e.args,e);rest=seq(e.args,stdArgs(u));}
    }
    // `next` on `&mut it` hands back items from what the iterator borrows, not from the borrow of the iterator itself
    return put({k:'call',fn:u.key,args:[ro,...rest],from:u.from,more:u.more||[],method:true,...u.inner&&inner!==undefined&&{src:inner}},e,dest,tyOf(e));
  }

  function method(e,dest){
    if(info.get(e).um)return umethod(e,dest);
    lendArgs(e);
    const r=info.get(e).recv;
    if(!r){un('method call',e);return fin(NIL,e,dest);}
    let ro,args;
    if(r.adj==='val'){
      rebTwice([e.recv,...e.args],e);
      // std method args are all `&str`, so only `&mut self` methods reborrow mutably
      [ro,...args]=seq([e.recv,...e.args],x=>argOp(x,x!==e.recv||e.name==='is_empty'||RQ.std.methods.get(e.name).self==='&'));
    }else{
      const mut=r.adj==='&mut',p=peel(e.recv);
      let target=-1;
      let text=null;
      if(r.kind==='place'){
        const c=classify(e.recv);
        if(c.k==='local'||c.k==='path')target=c.l;
        else if(c.k==='via'){
          // a field behind a reference is reached through the reference itself
          const t=L[c.l].ty;
          ro=opnd(c.l,t.k==='ref'&&t.mut,!mut);
          text=chainText(e.recv);
        }else if(c.k==='idx'){
          ro=idxRef(e.recv,mut,e,true);
          if(!ro)return fin(NIL,e,dest);
        }else{un(p.t==='Deref'?'reborrow':'borrow of a field',e);return fin(NIL,e,dest);}
        if(mut&&target>=0){
          let q=p;
          while(q.t==='Field')q=peel(q.expr);
          const b=info.get(q).bind;let again=false;
          RQ.walk(e.args,a=>{if(a.t==='Path'&&info.get(a)&&info.get(a).bind===b)again=true;});
          if(again)un('two-phase borrow',e);
        }
      }else{
        const x=ex(e.recv);
        if(x.k!=='const'){target=x.l;ownRecv(e,target);}
      }
      if(ro===undefined){
        if(target<0){un('temporary borrow',e);return fin(NIL,e,dest);}
        ro=put({k:'ref',l:target,mut,implicit:true},e,undefined,T.ref(mut,L[target].ty,0));
      }
      rebTwice(e.args,e);
      args=seq(e.args,x=>argOp(x,true));
      return put({k:'method',name:e.name,recv:ro,args,text},e,dest,tyOf(e));
    }
    return put({k:'method',name:e.name,recv:ro,args},e,dest,tyOf(e));
  }

  // a slice of a `&mut` parameter lent straight to a call is a reborrow that ends with the call, if the result keeps no reference
  const lendArgs=e=>{for(const a of e.recv&&e.recv.lent?[e.recv,...e.args]:e.args)if(peel(a).t==='Ref'){argRef.set(peel(a),e);if(!carries(tyOf(e)))rebArg.set(peel(a),e);}};
  // a base that is already a reference passes its loans on instead of making one
  function slice(e,x,dest){
    const rg=peel(x.index),b=peel(x.expr),c=classify(b),bounds=[rg.from,rg.to].filter(Boolean),mut=!!e.mut;
    const evalBounds=()=>{if(bounds.length)emit('eval',e,{rv:{k:'op',args:bounds.map(y=>ex(y))}});};
    // a row of a Vec of Vecs, `&v[i][a..b]`: the Vec is lent for the slice, as for `&v[i]`
    if(c.k==='idx'&&hasVecIdx(b)){
      const r=vecRoot(b),rc=r.c;
      if(rc.k!=='local'&&rc.k!=='path'&&rc.k!=='via'){un('temporary borrow',e);return fin(NIL,e,dest);}
      const rt=L[rc.l].ty;
      if(rc.k==='via'||rt.k==='ref'){
        if(mut||rt.mut){un('reborrow',e);return fin(NIL,e,dest);}
        emit('eval',e,{rv:{k:'op',args:r.idx.map(y=>ex(y))}});
        evalBounds();
        return put({k:'use',x:opnd(rc.l)},e,dest,tyOf(e));
      }
      if(mut){
        const ro=vecRef(rc,true,e,true,r,b);
        if(!ro)return fin(NIL,e,dest);
        emit('eval',e,{rv:{k:'op',args:[ro,...r.idx.map(y=>ex(y))]}});
        evalBounds();
        return put({k:'use',x:ro},e,dest,tyOf(e));
      }
      emit('eval',e,{rv:{k:'op',args:r.idx.map(y=>ex(y))}});
      evalBounds();
      return put({k:'ref',l:rc.l,mut:false,slice:true},e,dest,tyOf(e),b);
    }
    if(c.k==='idx'){
      const ro=elemRef(elemRoot(b),mut,e,false,b);
      if(!ro)return fin(NIL,e,dest);
      evalBounds();
      return put({k:'use',x:ro},e,dest,tyOf(e));
    }
    if(c.k!=='local'&&c.k!=='path'&&c.k!=='via'){un('temporary borrow',e);return fin(NIL,e,dest);}
    const l=c.l,t=L[l].ty;
    if(t.k==='ref'&&t.mut){
      // the other mentions of the reference in the call may read what the reborrow holds: not judged
      const call=rebArg.get(e);
      let n=0;
      if(call)RQ.walk([call.recv,...call.args].filter(Boolean),y=>{if(y.t==='Path'&&lid(y)===l)n++;});
      if(!call||n>1){un('reborrow',e);return fin(NIL,e,dest);}
      evalBounds();
      return put({k:'use',x:opnd(l,true,!mut)},e,dest,tyOf(e));
    }
    // IndexMut borrows the base before the bounds run, so a bound that reads it conflicts
    if(!(t.k==='ref'||t.k==='str'||c.k==='via')&&mut){
      const r=put({k:'ref',l,mut,slice:true},e,dest,tyOf(e),b);
      evalBounds();
      return r;
    }
    evalBounds();
    // a field behind a reference lives as long as the reference does
    if(c.k==='via')return put({k:'use',x:opnd(l)},e,dest,tyOf(e));
    return put(t.k==='ref'||t.k==='str'?{k:'use',x:opnd(l)}:{k:'ref',l,mut,slice:true},e,dest,tyOf(e),b);
  }

  // an array element is a place inside the array, so a write borrows nothing: it conflicts with a loan on the array or on a field above it
  function arrayWrite(e,lhs,compound,v){
    const idx=[],steps=[];
    let b=lhs,inner=null;
    for(;b.t==='Index'||b.t==='Field';b=peel(b.expr)){steps.unshift(b);if(b.t==='Index'){idx.unshift(b.index);inner=b;}}
    b=peel(inner.expr);
    const c=classify(b);
    if(c.k!=='local'&&c.k!=='path'&&c.k!=='via'){un('assignment target',e);return;}
    const ops=idx.map(x=>ex(x)),t=tyOf(lhs),name=stepText(steps,steps.indexOf(inner));
    if(c.k==='via'||L[c.l].ty.k==='ref'){
      const r=opnd(c.l,L[c.l].ty.k==='ref'&&L[c.l].ty.mut,false);
      if(ops.some(x=>x.k!=='const'))emit('eval',e,{rv:{k:'op',args:ops}});
      if(compound)v=put({k:'op',args:[put({k:'deref',x:r},e,undefined,t),v]},e,undefined,t);
      emit('store',e,{ref:r,x:v});
      return;
    }
    let root=c.l;
    while(L[root].parent!==undefined)root=L[root].parent;
    if(c.k==='path'&&uninit.has(root)){un('deferred initialization',e);return;}
    const args=[...(compound?[{k:'copy',l:c.l}]:[]),...ops,v].filter(x=>x.k!=='const');
    if(args.length)emit('eval',e,{rv:{k:'op',args}});
    emit('write',e,{l:c.l,name});
  }

  function assign(e){
    const lhs=peel(e.lhs),compound=e.op!=='=';
    if(!compound&&peel(e.rhs).t==='Ref')asgRef.add(peel(e.rhs));
    let v=ex(e.rhs);
    if(lhs.t==='Deref'){
      const r=argOp(lhs.expr);
      if(compound){
        const t=tyOf(lhs);
        v=put({k:'op',args:[put({k:'deref',x:r},e,undefined,t),v]},e,undefined,t);
      }
      emit('store',e,{ref:r,x:v});
      return;
    }
    if(hasIdx(lhs)&&hasVecIdx(lhs)){
      // IndexMut borrows first, then the index operands run: `v[v.len()-1] = 5` is E0502
      const r=vecRoot(lhs),ro=vecRef(r.c,true,e,true,r);
      if(ro)emit('eval',e,{rv:{k:'op',args:[ro,...r.idx.map(x=>ex(x)),v]}});
      return;
    }
    if(hasIdx(lhs)){arrayWrite(e,lhs,compound,v);return;}
    if(lhs.t==='Field'){
      const c=classify(lhs);
      if(c.k==='path'){
        let root=c.l;
        while(L[root].parent!==undefined)root=L[root].parent;
        if(uninit.has(root)){un('deferred initialization',e);return;}
        emit('assign',e,{l:c.l,rv:compound?{k:'op',args:[opnd(c.l),v]}:{k:'use',x:v}});
      }else if(c.k==='via'){
        const r=opnd(c.l,L[c.l].ty.k==='ref'&&L[c.l].ty.mut,false);
        if(compound){
          const t=tyOf(lhs);
          v=put({k:'op',args:[put({k:'deref',x:r},e,undefined,t),v]},e,undefined,t);
        }
        emit('store',e,{ref:r,x:v});
      }else un('assignment target',e);
      return;
    }
    const l=lid(e);
    if(l<0){un('assignment target',e);return;}
    emit('assign',e,{l,rv:compound?{k:'op',args:[opnd(l),v]}:{k:'use',x:v}});
  }

  // A name bound in a pattern is a path below the scrutinee place, so an arm that moves a String leaves the scrutinee partially moved, as in Rust
  function matchEx(e,dest){
    const mi=info.get(e).match,t=tyOf(e);
    if(dest===undefined&&!isUnit(t))dest=temp(t);
    const sc=peel(e.scrut);
    let root;
    if(mi.ref){
      const x=argOp(sc,true);
      if(x.k==='const'){un('temporary borrow',e);return NIL;}
      root=x.l;
    }else{
      const c=classify(sc);
      if(c.k==='local'||c.k==='path')root=c.l;
      else if(c.k==='via')root=c.l;
      else if(sc.t==='Deref'&&peel(sc.expr).t==='Path'&&lid(peel(sc.expr))>=0)root=lid(peel(sc.expr));
      else if(c.k==='idx'){un('borrow of a field',e);return fin(NIL,e,dest);}
      else{
        const x=ex(sc);
        root=x.k==='const'?temp(tyOf(sc)):x.l;
        if(x.k==='const')emit('assign',sc,{l:root,rv:{k:'use',x}});
      }
    }
    const viaRef=!mi.ref&&(classify(sc).k==='via'||sc.t==='Deref');
    if(mi.bindsMoved&&!mi.ref&&dropped(root)){un('partial move',e);return fin(NIL,e,dest);}
    // the places a pattern looks at to choose an arm (a variant, a number) are read here; a name or `_` reads nothing
    const looked=new Map();
    for(const a of e.arms)RQ.walk(a.pat,n=>{const o=info.get(n);if(o&&o.tests)looked.set(o.tests.map(q=>q.sel).join('/'),o.tests);});
    for(const path of looked.values())emit('eval',sc,{rv:{k:'peek',x:{k:'copy',l:mi.ref?root:path.reduce((b,q)=>pathLocal(b,q.sel,q.ty),root)}},grp:e.id});
    const arms=e.arms.map(()=>blk()),j=blk();
    B[cur].succ.push(...arms);
    e.arms.forEach((a,i)=>{
      cur=arms[i];
      scopes.push([]);
      const binds=[];
      RQ.walk(a.pat,n=>{if(n.t==='IdentPat'&&info.get(n)&&info.get(n).bpath!==undefined)binds.push(n);});
      const ids=binds.map(sp=>declare(sp,sp,false,info.get(sp).ty));
      // a guard reads the names before they take the value, so the move waits until the guard has passed
      const bindAll=peek=>binds.forEach((sp,k)=>{
        const o=info.get(sp);
        let x;
        if(o.bmode==='ref'||viaRef&&carries(o.ty))x=opnd(root);
        else if(viaRef)x=NIL;
        else{const l=o.bpath.reduce((b,q)=>pathLocal(b,q.sel,q.ty),root);x=peek?{k:'copy',l}:opnd(l);}
        emit('assign',sp,{l:ids[k],rv:{k:'use',x},grp:e.id});
      });
      bindAll(!!a.guard);
      if(a.guard){
        const first=cur,from=B[cur].instrs.length,nb=B.length;
        const g=ex(a.guard);
        const used=new Set(ids.filter(l=>!isCopy(L[l].ty)));
        const moves=n=>n&&typeof n==='object'&&(n.k==='move'&&used.has(n.l)||Object.values(n).some(moves));
        if(used.size&&[...B[first].instrs.slice(from),...B.slice(nb).flatMap(b=>b.instrs)].some(moves)){un('match guard',a.guard);return;}
        const ok=blk(),no=blk();
        emit('branch',a.guard,{x:g});
        B[cur].succ.push(ok,no);
        if(i+1<arms.length)edge(no,arms[i+1]);
        cur=ok;
        bindAll(false);
      }
      ex(a.body,dest);
      kill(scopes.pop(),a.body);
      edge(cur,j);
    });
    cur=j;
    return out(dest);
  }

  function ifEx(e,dest){
    if(isBool(e.cond))un('constant condition',e);
    const t=tyOf(e);
    if(dest===undefined&&!isUnit(t))dest=temp(t);
    emit('branch',e,{x:ex(e.cond)});
    const a=blk(),b=blk(),j=blk();
    B[cur].succ.push(a,b);
    cur=a;blockEx(e.then,dest);edge(cur,j);
    cur=b;
    if(e.els){if(e.els.t==='If')ifEx(e.els,dest);else blockEx(e.els,dest);}
    edge(cur,j);cur=j;
    return out(dest);
  }

  function whileEx(e){
    if(isBool(e.cond))un('constant condition',e);
    const h=blk(),body=blk(),x=blk();
    edge(cur,h);cur=h;
    emit('branch',e,{x:ex(e.cond)});
    B[cur].succ.push(body,x);
    loops.push({brk:x,cont:h,depth:scopes.length});
    cur=body;blockEx(e.body);edge(cur,h);
    loops.pop();cur=x;
    return NIL;
  }

  function loopEx(e,dest){
    const t=tyOf(e);
    if(dest===undefined&&!isUnit(t))dest=temp(t);
    const h=blk(),x=blk();
    edge(cur,h);cur=h;
    loops.push({brk:x,cont:h,depth:scopes.length,dest});
    blockEx(e.body);edge(cur,h);
    loops.pop();cur=x;
    return out(dest);
  }

  // `for i in a..b`: a hidden counter, a head that tests it, and an increment block that `continue` also reaches
  // every turn reads the iterator, so the loans it holds last as long as the loop
  function forIter(e){
    const x=ex(e.iter);
    if(x.k==='const'){un('for iterable',e);return NIL;}
    const it=temp(tyOf(e.iter));
    emit('assign',e,{l:it,rv:{k:'use',x}});
    const h=blk(),body=blk(),out=blk();
    edge(cur,h);cur=h;
    emit('branch',e,{x:put({k:'op',args:[{k:'copy',l:it}]},e,undefined,T.bool)});
    B[cur].succ.push(body,out);
    loops.push({brk:out,cont:h,depth:scopes.length});
    scopes.push([]);cur=body;
    const ty=tyOf(e.pat);
    if(e.pat.t==='IdentPat')emit('assign',e,{l:declare(e.pat,e,false,ty),rv:carries(ty)?{k:'use',x:{k:'copy',l:it}}:{k:'const'}});
    blockEx(e.body);
    kill(scopes.pop(),e);
    edge(cur,h);loops.pop();
    cur=out;
    return NIL;
  }
  function forEx(e){
    if(info.get(e).iterFor)return forIter(e);
    const fi=info.get(e).fi;
    if(fi)return forColl(e,fi);
    const r=peel(e.iter);
    if(r.t!=='Range'||!r.from||!r.to){un('for iterable',e);return NIL;}
    const a=ex(r.from),b=ex(r.to),ty=tyOf(r.from),it=temp(ty);
    emit('assign',e,{l:it,rv:{k:'use',x:a}});
    const h=blk(),body=blk(),inc=blk(),x=blk();
    edge(cur,h);cur=h;
    emit('branch',e,{x:put({k:'op',args:[opnd(it),b]},e,undefined,T.bool)});
    B[cur].succ.push(body,x);
    loops.push({brk:x,cont:inc,depth:scopes.length});
    scopes.push([]);cur=body;
    if(e.pat.t==='IdentPat')emit('assign',e,{l:declare(e.pat,e,false,ty),rv:{k:'use',x:opnd(it)}});
    blockEx(e.body);
    kill(scopes.pop(),e);
    edge(cur,inc);loops.pop();
    cur=inc;emit('assign',e,{l:it,rv:{k:'op',args:[opnd(it)]}});
    edge(cur,h);cur=x;
    return NIL;
  }

  // every turn reads the iterator, so a loan of the collection lasts as long as the loop
  function forColl(e,fi){
    const src=peel(fi.src);
    let ro,loopTemp=-1;
    if(fi.mode==='val'||fi.viaRef){
      const p=src,l=p.t==='Path'?lid(p):-1;
      // a `&mut` variable that is lent, not moved, is reborrowed: the loan is on the variable, and no `mut` is needed to make it
      if(l>=0&&fi.mode!=='val'&&peel(e.iter)!==src&&L[l].ty.k==='ref'&&L[l].ty.mut)ro=put({k:'ref',l,mut:fi.mode==='mut',implicit:true,deref:true},e,undefined,T.ref(fi.mode==='mut',L[l].ty,0));
      else ro=l>=0?opnd(l):ex(src);
      if(ro.k==='const'){un('temporary borrow',e);return NIL;}
    }else if(hasVecIdx(src)){
      const r=vecRoot(src);
      emit('eval',e,{rv:{k:'op',args:r.idx.map(x=>ex(x))}});
      ro=vecRef(r.c,fi.mode==='mut',e,peel(e.iter).t!=='Ref');
      if(!ro)return NIL;
    }else if(hasIdx(src)){
      ro=elemRef(elemRoot(src),fi.mode==='mut',e,peel(e.iter).t!=='Ref',peel(e.iter));
      if(!ro)return NIL;
    }else{
      const c=classify(src);
      if(c.k==='local'||c.k==='path')ro=put({k:'ref',l:c.l,mut:fi.mode==='mut',implicit:peel(e.iter).t!=='Ref'},e,undefined,T.ref(fi.mode==='mut',L[c.l].ty,0));
      else if(c.k==='via'){
        const t=L[c.l].ty;
        // the field is reached through the reference, so the loan goes on the reference like a `for` over `&mut` variable
        let loan=false;
        if(t.k==='ref'&&t.mut){
          const b=fieldChain(src),cs=chainsOn(e.body,c.l);
          if(!b||cs.some(q=>!related(q,b))&&cs.some(q=>related(q,b))){un('reborrow',e);return NIL;}
          loan=cs.some(q=>related(q,b));
        }
        ro=loan?put({k:'ref',l:c.l,mut:fi.mode==='mut',implicit:true,deref:true},e,undefined,T.ref(fi.mode==='mut',t,0)):opnd(c.l,t.k==='ref'&&t.mut,fi.mode!=='mut');
      }else if(c.k==='other'&&!['Path','Field','Index','Deref'].includes(src.t)){
        // the temporary lives as long as the loop; a constant is promoted to a static and lives forever
        const pr=fi.mode==='mut'?'no':promo(src);
        if(pr==='maybe'){un('temporary borrow',e);return NIL;}
        const v=ex(src),t=v.k==='const'?put({k:'use',x:v},src,undefined,tyOf(src)):v;
        ro=put({k:'ref',l:t.l,mut:fi.mode==='mut',implicit:true},e,undefined,T.ref(fi.mode==='mut',tyOf(src),0));
        if(pr==='no'){L[t.l].tmp=true;loopTemp=t.l;}
      }else{un(c.k==='idx'?'borrow of a field':'temporary borrow',e);return NIL;}
    }
    const it=temp(fi.mode==='val'?tyOf(src):T.ref(fi.mode==='mut',tyOf(src),0));
    emit('assign',e,{l:it,rv:{k:'use',x:ro}});
    const h=blk(),body=blk(),x=blk();
    edge(cur,h);cur=h;
    emit('branch',e,{x:put({k:'op',args:[{k:'copy',l:it}]},e,undefined,T.bool)});
    B[cur].succ.push(body,x);
    loops.push({brk:x,cont:h,depth:scopes.length});
    scopes.push([]);cur=body;
    if(e.pat.t==='IdentPat')emit('assign',e,{l:declare(e.pat,e,false,tyOf(e.pat)),rv:fi.mode==='val'?{k:'const'}:{k:'use',x:{k:'copy',l:it}}});
    blockEx(e.body);
    kill(scopes.pop(),e);
    edge(cur,h);loops.pop();
    cur=x;
    if(loopTemp>=0)emit('dead',e,{l:loopTemp});
    return NIL;
  }

  function blockEx(b,dest){
    scopes.push([]);
    for(const s of b.stmts)stmt(s);
    let x=NIL;
    if(b.tail){
      const t=tyOf(b.tail);
      if(dest===undefined&&!isUnit(t))dest=temp(t);
      x=ex(b.tail,dest);
    }
    kill(scopes.pop(),b);
    return x;
  }

  function stmt(s){
    const mark=stmtTemps.length;
    stmt1(s);
    for(let i=stmtTemps.length-1;i>=mark;i--)emit('dead',s,{l:stmtTemps[i]});
    stmtTemps.length=mark;
  }
  function stmt1(s){
    if(s.t==='Let'){
      const pt=s.pat;
      if(pt.t==='Wild'){
        // `let _ = place;` neither moves nor reads the place
        const k=s.init&&peel(s.init).t;
        if(s.init&&!['Path','Field','Index','Deref'].includes(k))ex(s.init);
      }else if(pt.t!=='IdentPat'||!info.get(pt)||!info.get(pt).bind)un('pattern',s);
      else if(!s.init)declare(pt,s,true,info.get(pt).ty);
      else{
        if(peel(s.init).t==='Ref')extRef.add(peel(s.init));
        ex(s.init,declare(pt,s,false,info.get(pt).ty));
      }
    }else if(s.t==='ExprStmt'){
      const x=ex(s.expr);
      if(['Path','Field','Index','Deref'].includes(peel(s.expr).t)&&x.k!=='const')emit('eval',s,{rv:{k:'use',x}});
    }else un('nested item',s);
  }

  function ex(e,dest){
    switch(e.t){
      case 'Paren':return ex(e.expr,dest);
      case 'Lit':return fin(NIL,e,dest);
      case 'Path':{
        const l=lid(e);
        if(l<0)return fin(NIL,e,dest);
        const t=L[l].ty;
        if(t.k==='ref'&&t.mut){un('reborrow',e);return fin(NIL,e,dest);}
        return fin(opnd(l),e,dest);
      }
      case 'Unary':case 'Cast':return put({k:'op',args:[ex(e.expr)]},e,dest,tyOf(e));
      case 'Binary':{
        if(e.op==='&&'||e.op==='||'){
          const d=dest===undefined?temp(T.bool):dest;
          ex(e.lhs,d);
          emit('branch',e,{x:opnd(d)});
          const r=blk(),j=blk();
          B[cur].succ.push(r,j);
          cur=r;ex(e.rhs,d);edge(cur,j);cur=j;
          return opnd(d);
        }
        // == and the others take their operands by reference, so comparing two Strings or structs moves neither
        if(['==','!=','<','>','<=','>='].includes(e.op)&&!isCopy(tyOf(e.lhs)))return put({k:'op',args:seq([e.lhs,e.rhs],x=>printArg(x,e))},e,dest,tyOf(e));
        return put({k:'op',args:seq([e.lhs,e.rhs],ex)},e,dest,tyOf(e));
      }
      case 'Assign':assign(e);return fin(NIL,e,dest);
      case 'Closure':return closureEx(e,dest);
      case 'Range':return put({k:'op',args:seq([e.from,e.to],ex)},e,dest,tyOf(e));
      case 'Call':{
        if((info.get(e)||{}).cc)return closureCall(e,dest);
        const c=e.callee;
        if(c.t!=='Path'){un('call',e);return fin(NIL,e,dest);}
        const fn=c.segs.map(s=>s.name).join('::');
        if((info.get(e)||{}).ctor)return put({k:'agg',args:seq(e.args,ex)},e,dest,tyOf(e));
        rebTwice(e.args,e);
        // a temporary lent to a call lives to the end of the statement; with a result that holds no reference it cannot be kept past that
        lendArgs(e);
        const sig=(info.get(e)||{}).sig;
        return put({k:'call',fn:sig&&sig.key||fn,args:seq(e.args,fn==='drop'&&!userDrop?moveOp:argOp),from:sig&&sig.from!==undefined?sig.from:-1,more:sig&&sig.more||[]},e,dest,tyOf(e));
      }
      case 'MethodCall':return method(e,dest);
      case 'Ref':{
        const x=peel(e.expr);
        if(x.t==='Index'&&peel(x.index).t==='Range')return slice(e,x,dest);
        if(hasVecIdx(x)&&(x.t==='Index'||x.t==='Field')){
          const r=vecRoot(x),c=r.c;
          if(c.k!=='local'&&c.k!=='path'&&c.k!=='via'){un('temporary borrow',e);return fin(NIL,e,dest);}
          const t=L[c.l].ty;
          if(e.mut&&c.k!=='via'&&t.k!=='ref'){
            const ro=vecRef(c,true,e,true,r,peel(r.inner.expr));
            if(!ro)return fin(NIL,e,dest);
            emit('eval',e,{rv:{k:'op',args:[ro,...r.idx.map(y=>ex(y))]}});
            return put({k:'use',x:ro},e,dest,tyOf(e));
          }
          emit('eval',e,{rv:{k:'op',args:r.idx.map(y=>ex(y))}});
          if(c.k==='via'||t.k==='ref'){
            if(e.mut&&t.k==='ref'){un('reborrow',e);return fin(NIL,e,dest);}
            if(c.k==='via'&&e.mut){un('reborrow',e);return fin(NIL,e,dest);}
            // a shared borrow through a `&mut` variable reborrows it; moving it would end its use
            if(t.k==='ref'&&t.mut)return put({k:'ref',l:c.l,mut:false,implicit:true,deref:true},e,dest,tyOf(e));
            return put({k:'use',x:opnd(c.l)},e,dest,tyOf(e));
          }
          return put({k:'ref',l:c.l,mut:e.mut,slice:true},e,dest,tyOf(e),peel(r.inner.expr));
        }
        if(x.t==='Path'&&lid(x)>=0)return put({k:'ref',l:lid(x),mut:e.mut},e,dest,tyOf(e));
        if((x.t==='Index'||x.t==='Field')&&hasIdx(x)){
          const r=elemRoot(x),ro=elemRef(r,e.mut,e,false);
          if(!ro)return fin(NIL,e,dest);
          return put({k:'use',x:ro},e,dest,tyOf(e));
        }
        if(x.t==='Field'){
          const c=classify(x);
          if(c.k==='path')return put({k:'ref',l:c.l,mut:e.mut},e,dest,tyOf(e));
          // a shared borrow of a field behind a shared reference lives as long as the reference does
          if(c.k==='via'&&!e.mut&&L[c.l].ty.k==='ref'&&!L[c.l].ty.mut)return put({k:'use',x:opnd(c.l)},e,dest,tyOf(e));
          if(c.k==='via'){un('reborrow',e);return fin(NIL,e,dest);}
        }
        if((argRef.has(e)||extRef.has(e)||asgRef.has(e))&&!['Path','Field','Index','Deref'].includes(x.t)){
          let pr=e.mut?'no':promo(x);
          // what is not promoted dies with the statement, and a call that gives back no reference cannot keep it past that
          if(pr==='maybe'&&argRef.has(e)&&!carries(tyOf(argRef.get(e))))pr='no';
          if(pr==='maybe'){un('temporary borrow',e);return fin(NIL,e,dest);}
          const v=ex(x),t=v.k==='const'?put({k:'use',x:v},x,undefined,tyOf(x)):v;
          if(pr==='no'){
            // `let r = &temp;` keeps the temporary as long as the block, any other borrow only until the end of the statement
            if(extRef.has(e)){L[t.l].tmp=true;scopes[scopes.length-1].push(t.l);}
            else ownTemp(t.l);
          }
          return put({k:'ref',l:t.l,mut:e.mut},e,dest,tyOf(e));
        }
        un(x.t==='Field'||x.t==='Index'?'borrow of a field':x.t==='Deref'?'reborrow':'temporary borrow',e);
        return fin(NIL,e,dest);
      }
      case 'Deref':{
        const t=tyOf(e);
        if(!isCopy(t)){un('move out of reference',e);return fin(NIL,e,dest);}
        return put({k:'deref',x:argOp(e.expr)},e,dest,t);
      }
      case 'Field':case 'Index':return place(e,dest);
      case 'Tuple':case 'Array':return put({k:'agg',args:seq(e.elems,ex)},e,dest,tyOf(e));
      case 'StructLit':return put({k:'agg',args:seq(e.fields.map(f=>f.expr),ex)},e,dest,tyOf(e));
      case 'ArrayRepeat':return put({k:'agg',args:[ex(e.elem)]},e,dest,tyOf(e));
      case 'Macro':{
        if(e.name==='vec'&&e.args)return put({k:'agg',args:seq(e.repeat?[...e.args,e.repeat]:e.args,ex)},e,dest,tyOf(e));
        if(e.name==='panic'&&e.args){
          seq([...e.args.slice(1),...e.named.map(x=>x.expr)],x=>printArg(x,e));
          emit('return',e,{x:null});
          cur=blk();
          return NIL;
        }
        if((e.name==='write'||e.name==='writeln')&&e.args&&e.args.length){
          const to=argOp(e.args[0],false);
          const rest=seq([...e.args.slice(2),...e.named.map(x=>x.expr)],x=>printArg(x,e));
          const caps=e.args[1]&&info.get(e.args[1])&&info.get(e.args[1]).caps||[];
          for(const c of caps)if(c.bind&&lm.has(c.bind))rest.push(printLocal(lm.get(c.bind),e));
          return put({k:'macro',name:e.name,args:[to,...rest]},e,dest,tyOf(e));
        }
        if(!(PRINT.has(e.name)||e.name==='format')||!e.args){un(e.name+'!',e);return fin(NIL,e,dest);}
        const args=seq([...e.args.slice(1),...e.named.map(x=>x.expr)],x=>printArg(x,e));
        const caps=e.args[0]&&info.get(e.args[0])&&info.get(e.args[0]).caps||[];
        for(const c of caps)if(c.bind&&lm.has(c.bind))args.push(printLocal(lm.get(c.bind),e));
        return put({k:'macro',name:e.name,args},e,dest,e.name==='format'?T.string:T.unit);
      }
      case 'Block':return blockEx(e,dest);
      case 'Match':return matchEx(e,dest);
      case 'If':return ifEx(e,dest);
      case 'While':whileEx(e);return fin(NIL,e,dest);
      case 'Loop':return loopEx(e,dest);
      case 'For':forEx(e);return fin(NIL,e,dest);
      case 'Break':case 'Continue':{
        const lp=loops[loops.length-1];
        if(!lp){un('break outside loop',e);return NIL;}
        if(e.t==='Break'&&e.expr)ex(e.expr,lp.dest);
        deads(lp.depth,e);edge(cur,e.t==='Break'?lp.brk:lp.cont);cur=blk();
        return NIL;
      }
      case 'Return':{
        if(e.expr){const t=tyOf(e.expr);ex(e.expr,isUnit(t)?undefined:retDest(t));}
        deads(0,e);
        emit('return',e,{x:retL===undefined?null:opnd(retL)});
        cur=blk();
        return NIL;
      }
      case 'Try':{
        const x=ex(e.expr),bad=blk(),good=blk();
        emit('branch',e,{x:NIL});
        B[cur].succ.push(bad,good);
        cur=bad;
        emit('assign',e,{l:retDest(tyOf(e.expr)),rv:{k:'const'}});
        deads(0,e);
        emit('return',e,{x:opnd(retL)});
        cur=good;
        return put({k:'use',x},e,dest,tyOf(e));
      }
      default:un(e.t,e);return fin(NIL,e,dest);
    }
  }

  const pl=[];
  try{
    cur=blk();
    scopes.push([]);
    const bound=p=>info.get(p)&&info.get(p).bind;
    if(f.selfParam)pl.push(bound(f.selfParam)?declare(f.selfParam,f,false,info.get(f.selfParam).ty,true):undefined);
    for(const p of f.params)pl.push(p.pat.t==='IdentPat'&&bound(p.pat)?declare(p.pat,f,false,info.get(p.pat).ty,true):undefined);
    const tl=f.body.tail,tt=tl&&tyOf(tl);
    blockEx(f.body,tl&&!isUnit(tt)?retDest(tt):undefined);
    kill(scopes.pop(),f);
    emit('return',f,{x:retL===undefined?null:opnd(retL)});
  }catch(x){
    if(x!==BIG)throw x;
    un('program too large',f);
    return null;
  }
  const seen=new Set([0]),st=[0];
  while(st.length)for(const s of B[st.pop()].succ)if(!seen.has(s)){seen.add(s);st.push(s);}
  for(const b of B)b.unreachable=!seen.has(b.id);
  return {name:fname||f.name,ast:f.id,line:f.line,locals:L,blocks:B,pl,reg:(info.get(f)||{}).reg,caps};
}

RQ.mir=(ast,info)=>{
  const unsupported=[],seen=new Set();
  const un=(feature,nd)=>{const k=feature+'@'+nd.line;if(!seen.has(k)){seen.add(k);unsupported.push({feature,line:nd.line});}};
  const fns=[],errors=[];
  const err=(code,nd,o)=>{const k=code+'@'+nd.line+':'+nd.col;if(!seen.has(k)){seen.add(k);errors.push(RQ.diag.make(code,nd.line,nd.col,o));}};
  const userDrop=hasUserDrop(ast);
  const dropTys=new Set(ast.items.filter(RQ.isDropImpl).map(i=>i.selfTy.segs&&i.selfTy.segs[0].name));
  const add=(f,name)=>{if(f.t==='Fn'&&f.body&&analysed(f,info,ast)){const m=lowerFn(f,info,un,err,userDrop,dropTys,name,fns);if(m)fns.push(m);}};
  for(const {f,name} of RQ.fnItems(ast))add(f,name);
  return {fns,unsupported,errors};
};
RQ.mir.analysed=analysed;
})();
