/* Lowers the fns the move and borrow pass analyses to a control-flow graph. RQ.mir.analysed(fn, info, ast) is the skip rule: a fn
   without a reference, a String or a deferred let is never lowered, so old programs keep their results. DOM-free.
   RQ.mir(ast, info) gives {fns, unsupported}. A fn is {name, ast (the Fn node id), line, locals, blocks}; blocks[0] is the entry.
     local  {id, name (null for a temp), src (the named local a temp was copied from), bind (the checker's binding), ty, mut, param, line}
     block  {id, instrs, succ (block ids), unreachable (no path from the entry; the analysis skips it)}
     instr  {op, ast (node id), line, col, ...}:
       decl   {l, uninit}     the local comes alive; uninit for `let x: T;`. Params have no decl, they are set on entry.
       assign {l, rv}         whole-local write. Compound `x += v` is `x = op(copy x, v)`.
       eval   {rv}            rv whose result is unit or unused
       store  {ref, x}        `*r = v`: ref is an operand for the reference local, x the value
       dead   {l}             StorageDead of a named local, in reverse declaration order. Temps get none.
       branch {x}             the block has two succ: then, else (loop body, loop exit)
       return {x}             x is null for a unit fn
     rv     {k:'use',x} | {k:'const'} | {k:'ref',l,mut,implicit?} | {k:'call',fn,args,from} | {k:'method',name,recv,args} | {k:'op',args}
            | {k:'agg',args} | {k:'deref',x} | {k:'macro',name,args}.  `ref` borrows the local l (`&l[a..b]` of an owned l too); from is the argument index a returned reference borrows from, or -1; a method call on an owned String
            gets a ref temp as recv, and `as_str` on it carries that ref in its result.
     operand {k:'copy'|'move',l} by isCopy of the value's type, or {k:'const'}. A `&mut` local passed to a call or a method
            is an implicit reborrow, not a move (except std drop): {k:'copy',l,reb:true,sh} (sh: the callee takes `&`). Reading a Field or Index is a copy of the root local. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
RQ.BORROW_FEATURES=['borrow of a field','temporary borrow','partial move','move out of reference','two-phase borrow','constant condition','program too large'];
const MAX_INSTRS=5000,MAX_LOCALS=300;
const PRINT=new Set(['println','print','eprintln','eprint']);
const peel=e=>e.t==='Paren'?peel(e.expr):e;
const NIL={k:'const'};
const BIG={};

const hasUserDrop=ast=>!!ast&&ast.items.some(i=>i.t==='Fn'&&i.name==='drop');

function analysed(fn,info,ast){
  const {isCopy,hasRef}=RQ.types;
  const userDrop=hasUserDrop(ast);
  let hit=false;
  RQ.walk(fn,n=>{
    if(hit)return false;
    if(n.t==='Ref'&&n.expr||n.t==='Deref'||n.t==='MethodCall'||n.t==='Let'&&!n.init)hit=true;
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

function lowerFn(f,info,un,userDrop){
  const {T,res,isCopy}=RQ.types;
  const L=[],B=[],lm=new Map(),scopes=[],loops=[];
  let cur,count=0,retL;
  const tyOf=e=>{const o=info.get(e);return res(o&&o.ty||T.any);};
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
  const lid=p=>{const o=info.get(p),b=o&&o.bind;return b&&lm.has(b)?lm.get(b):-1;};
  const put=(rv,nd,dest,ty)=>{
    if(dest===undefined){
      if(isUnit(res(ty))){emit('eval',nd,{rv});return NIL;}
      dest=temp(ty);
    }
    emit('assign',nd,{l:dest,rv});
    return opnd(dest);
  };
  const fin=(x,nd,dest)=>dest===undefined?x:put({k:'use',x},nd,dest);
  const out=(dest)=>dest===undefined?NIL:opnd(dest);
  const declare=(pat,nd,uninit,ty,param)=>{
    const b=info.get(pat).bind;
    const id=local(pat.name,ty,{bind:b,mut:!!pat.mut,param:!!param,line:pat.line});
    lm.set(b,id);scopes[scopes.length-1].push(id);
    if(!param)emit('decl',nd,{l:id,uninit});
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
    if(p.t==='Field'||p.t==='Index'){
      const r=rootOf(p);
      if(r.l>=0){
        if(r.idx.length)emit('eval',p,{rv:{k:'op',args:r.idx.map(x=>ex(x))}});
        return put({k:'ref',l:r.l,mut:false,implicit:true},p,undefined,T.ref(false,L[r.l].ty,0));
      }
    }
    return ex(x);
  }

  function place(e,dest){
    if(!isCopy(tyOf(e))){un('partial move',e);return fin(NIL,e,dest);}
    const r=rootOf(e);
    let base;
    if(r.l>=0)base={k:'copy',l:r.l};
    else{const x=ex(r.base);base=x.k==='const'?x:{k:'copy',l:x.l};}
    return r.idx.length?put({k:'op',args:[base,...r.idx.map(x=>ex(x))]},e,dest,tyOf(e)):fin(base,e,dest);
  }

  function method(e,dest){
    const r=info.get(e).recv;
    if(!r){un('method call',e);return fin(NIL,e,dest);}
    let ro,args;
    if(r.adj==='val'){
      rebTwice([e.recv,...e.args],e);
      // std method args are all `&str`, so only `&mut self` methods reborrow mutably
      [ro,...args]=seq([e.recv,...e.args],x=>argOp(x,x!==e.recv||RQ.std.methods.get(e.name).self==='&'));
    }else{
      const mut=r.adj==='&mut',p=peel(e.recv);
      let target=-1;
      if(r.kind==='place'){
        if(p.t==='Path')target=lid(p);
        else{un(p.t==='Deref'?'reborrow':'borrow of a field',e);return fin(NIL,e,dest);}
        if(mut){
          const b=info.get(p).bind;let again=false;
          RQ.walk(e.args,a=>{if(a.t==='Path'&&info.get(a)&&info.get(a).bind===b)again=true;});
          if(again)un('two-phase borrow',e);
        }
      }else if(e.name==='as_str'){un('temporary borrow',e);return fin(NIL,e,dest);}
      else{const x=ex(e.recv);if(x.k!=='const')target=x.l;}
      if(target<0){un('temporary borrow',e);return fin(NIL,e,dest);}
      ro=put({k:'ref',l:target,mut,implicit:true},e,undefined,T.ref(mut,L[target].ty,0));
      rebTwice(e.args,e);
      args=seq(e.args,x=>argOp(x,true));
    }
    return put({k:'method',name:e.name,recv:ro,args},e,dest,tyOf(e));
  }

  // `&base[a..b]`: a shared loan on an owned base; a base that is already a reference is passed on, so the slice carries its loans
  function slice(e,x,dest){
    const rg=peel(x.index),b=peel(x.expr),l=b.t==='Path'?lid(b):-1;
    if(l<0){un(b.t==='Field'||b.t==='Index'?'borrow of a field':'temporary borrow',e);return fin(NIL,e,dest);}
    const bounds=[rg.from,rg.to].filter(Boolean).map(y=>ex(y));
    if(bounds.length)emit('eval',e,{rv:{k:'op',args:bounds}});
    const t=L[l].ty;
    return put(t.k==='ref'||t.k==='str'?{k:'use',x:opnd(l)}:{k:'ref',l,mut:false},e,dest,tyOf(e));
  }

  function assign(e){
    const lhs=peel(e.lhs),compound=e.op!=='=';
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
    const l=lid(e);
    if(l<0){un('assignment target',e);return;}
    emit('assign',e,{l,rv:compound?{k:'op',args:[opnd(l),v]}:{k:'use',x:v}});
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
  function forEx(e){
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
    if(s.t==='Let'){
      const pt=s.pat;
      if(pt.t==='Wild'){
        // `let _ = place;` neither moves nor reads the place
        const k=s.init&&peel(s.init).t;
        if(s.init&&!['Path','Field','Index','Deref'].includes(k))ex(s.init);
      }else if(pt.t!=='IdentPat'||!info.get(pt)||!info.get(pt).bind)un('pattern',s);
      else if(!s.init)declare(pt,s,true,info.get(pt).ty);
      else ex(s.init,declare(pt,s,false,info.get(pt).ty));
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
        return put({k:'op',args:seq([e.lhs,e.rhs],ex)},e,dest,tyOf(e));
      }
      case 'Assign':assign(e);return fin(NIL,e,dest);
      case 'Call':{
        const c=e.callee;
        if(c.t!=='Path'){un('call',e);return fin(NIL,e,dest);}
        const fn=c.segs.map(s=>s.name).join('::');
        rebTwice(e.args,e);
        const sig=(info.get(e)||{}).sig;
        return put({k:'call',fn,args:seq(e.args,fn==='drop'&&!userDrop?moveOp:argOp),from:sig&&sig.from!==undefined?sig.from:-1},e,dest,tyOf(e));
      }
      case 'MethodCall':return method(e,dest);
      case 'Ref':{
        const x=peel(e.expr);
        if(x.t==='Index'&&peel(x.index).t==='Range')return slice(e,x,dest);
        if(x.t==='Path'&&lid(x)>=0)return put({k:'ref',l:lid(x),mut:e.mut},e,dest,tyOf(e));
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
        if(!(PRINT.has(e.name)||e.name==='format')||!e.args){un(e.name+'!',e);return fin(NIL,e,dest);}
        const args=seq([...e.args.slice(1),...e.named.map(x=>x.expr)],x=>printArg(x,e));
        const caps=e.args[0]&&info.get(e.args[0])&&info.get(e.args[0]).caps||[];
        for(const c of caps)if(c.bind&&lm.has(c.bind))args.push(printLocal(lm.get(c.bind),e));
        return put({k:'macro',name:e.name,args},e,dest,e.name==='format'?T.string:T.unit);
      }
      case 'Block':return blockEx(e,dest);
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
      default:un(e.t,e);return fin(NIL,e,dest);
    }
  }

  try{
    cur=blk();
    scopes.push([]);
    for(const p of f.params)if(p.pat.t==='IdentPat'&&info.get(p.pat)&&info.get(p.pat).bind)declare(p.pat,f,false,info.get(p.pat).ty,true);
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
  return {name:f.name,ast:f.id,line:f.line,locals:L,blocks:B};
}

RQ.mir=(ast,info)=>{
  const unsupported=[],seen=new Set();
  const un=(feature,nd)=>{const k=feature+'@'+nd.line;if(!seen.has(k)){seen.add(k);unsupported.push({feature,line:nd.line});}};
  const fns=[];
  const userDrop=hasUserDrop(ast);
  for(const it of ast.items)if(it.t==='Fn'&&it.body&&analysed(it,info,ast)){const m=lowerFn(it,info,un,userDrop);if(m)fns.push(m);}
  return {fns,unsupported};
};
RQ.mir.analysed=analysed;
})();
