/* The move, initialisation and loan analyses over the CFG that mir.js lowers. RQ.borrow(ast, info) gives {errors, unsupported, loans, analysed}:
   errors are E0381 (use of an uninitialised local), E0382 (use after a move), E0384 on a deferred let, and E0499, E0502, E0505 and E0506
   from the loans; unsupported also carries what mir.js reported, and the analysis is skipped when it did; analysed names the lowered fns;
   loans is [{id, ast (the borrow node), local (name, null for a temp), mut, line, live (ast ids of the instrs where it is live)}]. DOM-free.
   Per local a forward may-dataflow tracks MOVED, UNINIT and EVER (assigned on some path). A use is any operand or borrow of the local;
   the destination of an assign and `dead` are not uses. A move reaching a use is E0382, else a missing initialisation is E0381. Blocks
   with no path from the entry are skipped, because the edges out of them stay in succ.
   Loans: every `ref` assign is a loan. A second forward may-dataflow gives holds[local], the loans a local carries: a copy or move of a
   local passes them on, `as_str` passes its receiver's, a call, op or macro result carries none. A backward liveness pass gives the
   locals live at each instr (its own uses count). A loan is live at an instr iff a live local holds it, and an access to the loan's
   local then conflicts: see access(). Locals are bits of a BigInt mask, loans are bits of a BigInt mask. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
RQ.BORROW_FEATURES.push('use while borrowed','reference in aggregate');
const MOVED=1,UNINIT=2,EVER=4;
const VISITS=50;

// use(local, isMove, kind): kind is copy, move, reb (implicit reborrow of a `&mut` local), ref (shared borrow) or mut (&mut borrow)
function uses(i,use){
  const o=x=>{if(x&&x.k!=='const')use(x.l,x.k==='move',x.k);};
  // a call or method operand that reborrows a `&mut` local needs it unborrowed; reading or writing through it (deref, store) does not
  const a=x=>{if(x&&x.reb)use(x.l,false,x.sh?'rebs':'reb');else o(x);};
  const rv=r=>{
    if(r.k==='ref')use(r.l,false,r.mut?'mut':'ref');
    else if(r.k==='use'||r.k==='deref')o(r.x);
    else if(r.k==='method'){a(r.recv);r.args.forEach(a);}
    else if(r.args)r.args.forEach(a);
  };
  if(i.rv)rv(i.rv);
  else if(i.op==='store'){o(i.ref);o(i.x);}
  else if(i.op==='branch'||i.op==='return')o(i.x);
}

function analyse(F,errors){
  const B=F.blocks,L=F.locals,n=L.length;
  const deferred=new Set(),found=[];
  for(const b of B)for(const i of b.instrs)if(i.op==='decl'&&i.uninit)deferred.add(i.l);
  const step=(s,i,rep)=>{
    uses(i,(l,mv)=>{
      if(rep&&L[l].name!==null)rep(s[l]&MOVED?'E0382':s[l]&UNINIT?'E0381':'',l,i);
      if(mv)s[l]|=MOVED;
    });
    if(i.op==='decl')s[i.l]=i.uninit?UNINIT:0;
    else if(i.op==='assign'){
      if(rep&&deferred.has(i.l)&&!L[i.l].mut&&s[i.l]&EVER)rep('E0384',i.l,i);
      s[i.l]=EVER;
    }
  };
  const inn=B.map(()=>null),q=[0],queued=new Set(q);
  inn[0]=new Uint8Array(n);
  const cap=VISITS*B.length+500;
  for(let h=0,visits=0;h<q.length;h++){
    if(++visits>cap)return false;
    const b=B[q[h]];
    queued.delete(b.id);
    const s=inn[b.id].slice();
    for(const i of b.instrs)step(s,i);
    for(const t of b.succ){
      const o=inn[t];
      let changed=!o;
      if(!o)inn[t]=s.slice();
      else for(let k=0;k<n;k++)if((o[k]|s[k])!==o[k]){o[k]|=s[k];changed=true;}
      if(changed&&!queued.has(t)){queued.add(t);q.push(t);}
    }
  }
  for(const b of B){
    if(!inn[b.id])continue;
    const s=inn[b.id].slice();
    for(const i of b.instrs)step(s,i,(code,l,at)=>{if(code)found.push({code,l,line:at.line,col:at.col});});
  }
  found.sort((a,b)=>a.line-b.line||a.col-b.col);
  const once=new Set(),seen=new Set();
  for(const f of found){
    const k=f.code+'@'+f.line+':'+f.col;
    if(seen.has(k)||f.code!=='E0384'&&once.has(f.l))continue;
    seen.add(k);
    if(f.code!=='E0384')once.add(f.l);
    errors.push(RQ.diag.make(f.code,f.line,f.col,{name:L[f.l].name,kind:'let'}));
  }
  return true;
}

// E0596: a `&mut` borrow of a named local that is not `mut` (a ref temp for an autoref has no name), or push_str through a `&` receiver
function mutability(F,errors){
  const L=F.locals,seen=new Set();
  const err=(i,name,ref)=>{
    const k=i.line+':'+i.col;
    if(seen.has(k))return;
    seen.add(k);
    errors.push(RQ.diag.make('E0596',i.line,i.col,{name,ref}));
  };
  for(const b of F.blocks){
    if(b.unreachable)continue;
    for(const i of b.instrs){
      const r=i.rv;
      if(!r)continue;
      if(r.k==='ref'&&r.mut&&L[r.l].name!==null&&!L[r.l].mut)err(i,L[r.l].name,false);
      else if(r.k==='method'&&r.recv.k!=='const'&&RQ.std.methods.get(r.name).self==='&mut'){
        const t=L[r.recv.l].ty;
        if(t.k==='ref'&&!t.mut)err(i,'*'+(L[r.recv.l].name||L[r.recv.l].src||'value'),true);
      }
    }
  }
}

const bit=k=>1n<<BigInt(k);
const refy=t=>t.k==='ref'||t.k==='str';

function loanPass(F,errors,un,loans){
  const B=F.blocks,L=F.locals,n=L.length;
  const cap=VISITS*B.length+500;
  const lo=[],at=new Map();
  for(const b of B)if(!b.unreachable)for(const i of b.instrs)if(i.op==='assign'&&i.rv.k==='ref'){at.set(i,lo.length);lo.push({i,l:i.rv.l,mut:i.rv.mut,live:new Set()});}
  const onS=L.map(()=>0n),onM=L.map(()=>0n),lb=lo.map((_,k)=>bit(k)),nb=L.map((_,k)=>bit(k));
  lo.forEach((x,k)=>{(x.mut?onM:onS)[x.l]|=lb[k];});

  const hold=(s,i)=>{
    if(i.op==='decl')s[i.l]=0n;
    else if(i.op==='assign'){
      const r=i.rv;
      s[i.l]=r.k==='ref'?lb[at.get(i)]|s[r.l]:r.k==='use'&&r.x.k!=='const'?s[r.x.l]:r.k==='method'&&r.name==='as_str'&&r.recv.k!=='const'?s[r.recv.l]:0n;
    }
  };
  const inn=B.map(()=>null),q=[0],queued=new Set(q);
  inn[0]=L.map(()=>0n);
  for(let h=0,visits=0;h<q.length;h++){
    if(++visits>cap)return false;
    const b=B[q[h]];
    queued.delete(b.id);
    const s=inn[b.id].slice();
    for(const i of b.instrs)hold(s,i);
    for(const t of b.succ){
      const o=inn[t];
      let changed=!o;
      if(!o)inn[t]=s.slice();
      else for(let k=0;k<n;k++)if((o[k]|s[k])!==o[k]){o[k]|=s[k];changed=true;}
      if(changed&&!queued.has(t)){queued.add(t);q.push(t);}
    }
  }

  const back=(m,i)=>{
    if(i.op==='assign'||i.op==='decl')m&=~nb[i.l];
    uses(i,l=>{m|=nb[l];});
    return m;
  };
  const out=b=>b.succ.reduce((m,t)=>m|liveIn[t],0n);
  const liveIn=B.map(()=>0n);
  for(let changed=true,work=0;changed;){
    changed=false;
    for(let k=B.length-1;k>=0;k--){
      const b=B[k];
      if(b.unreachable)continue;
      if(++work>cap)return false;
      let m=out(b);
      for(let j=b.instrs.length-1;j>=0;j--)m=back(m,b.instrs[j]);
      if(m!==liveIn[k]){liveIn[k]=m;changed=true;}
    }
  }

  const seen=new Set();
  let lm=0n;
  // star: the access goes through the reference local `l`, so rustc names `*l`
  const access=(l,kind,i,star)=>{
    const sh=lm&onS[l],mu=lm&onM[l];
    if(!(sh|mu))return;
    let code='';
    if(kind==='ref'){if(mu)code='E0502';}
    else if(kind==='mut')code=mu?'E0499':'E0502';
    else if(kind==='reb'){if(mu)un('reborrow',i);else code='E0502';}
    // a shared reborrow (callee takes `&`) only conflicts with a live `&mut` loan, which is not modelled for a reference local
    else if(kind==='rebs'){if(mu)un('reborrow',i);}
    else if(kind==='move')code='E0505';
    else if(kind==='write')code='E0506';
    // the `reborrow` arm is a backstop: no source shape reaches it (`&r` is a reference to a reference, which the checker rejects)
    else if(mu)un(refy(L[l].ty)?'reborrow':'use while borrowed',i);
    const k=code+'@'+i.line+':'+i.col;
    if(!code||seen.has(k))return;
    seen.add(k);
    errors.push(RQ.diag.make(code,i.line,i.col,{name:(star||kind==='reb'?'*':'')+(L[l].name||L[l].src||'value'),mut:kind==='mut'||kind==='reb'}));
  };
  for(const b of B){
    if(!inn[b.id])continue;
    const lv=[];
    let m=out(b);
    for(let j=b.instrs.length-1;j>=0;j--)lv[j]=m=back(m,b.instrs[j]);
    const s=inn[b.id].slice();
    b.instrs.forEach((i,j)=>{
      lm=0n;
      for(let l=0;l<n;l++)if(s[l]&&lv[j]&nb[l])lm|=s[l];
      if(lm)lo.forEach((x,k)=>{if(lm&lb[k])x.live.add(i.ast);});
      uses(i,(l,_mv,kind)=>access(l,kind,i));
      if(i.op==='store'&&i.ref.k!=='const')access(i.ref.l,'write',i,true);
      if(i.op==='dead'){
        const hit=lm&(onS[i.l]|onM[i.l]);
        if(hit)lo.forEach((x,k)=>{
          const key='E0597@'+x.i.line+':'+x.i.col;
          if(hit&lb[k]&&!seen.has(key)){seen.add(key);errors.push(RQ.diag.make('E0597',x.i.line,x.i.col,{name:L[i.l].name}));}
        });
      }
      if(i.op==='assign'){
        access(i.l,'write',i);
        if(i.rv.k==='agg')for(const x of i.rv.args)if(x.k!=='const'&&(s[x.l]||refy(L[x.l].ty)||RQ.types.hasRef(L[x.l].ty)))un('reference in aggregate',i);
      }
      hold(s,i);
    });
  }
  // a print's `&r` of a reference local guards r for the call; it is not a borrow the user wrote
  for(const x of lo)if(!refy(L[x.l].ty))loans.push({id:loans.length,ast:x.i.ast,local:L[x.l].name,mut:x.mut,line:x.i.line,live:[...x.live].sort((a,b)=>a-b)});
  return true;
}

RQ.borrow=(ast,info)=>{
  const m=RQ.mir(ast,info),errors=[],loans=[],unsupported=[...m.unsupported],seen=new Set();
  const un=(feature,nd)=>{const k=feature+'@'+nd.line;if(!seen.has(k)){seen.add(k);unsupported.push({feature,line:nd.line});}};
  if(!unsupported.length)for(const F of m.fns){
    const ok=analyse(F,errors);
    if(ok)mutability(F,errors);
    if(!ok||!loanPass(F,errors,un,loans)){unsupported.push({feature:'program too large',line:F.line});break;}
  }
  return {errors,unsupported,loans,analysed:m.fns.map(f=>f.name)};
};
})();
