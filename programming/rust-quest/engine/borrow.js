/* The move, initialisation and loan analyses over the CFG that mir.js lowers. RQ.borrow(ast, info) gives {errors, unsupported, loans, moves, maxLive, analysed}:
   errors are E0381 (use of an uninitialised local), E0382 (use after a move), E0384 on a deferred let, and E0499, E0502, E0505 and E0506
   from the loans; unsupported also carries what mir.js reported, and the analysis is skipped when it did; analysed names the lowered fns;
   moves is [{name, line}] for every by-value move of a named local. loans is [{id, ast (the borrow node), local (name, null for a temp), mut, line, implicit (made by the compiler for a print argument or a method receiver, not written by the learner), span ([first, last] line where it is live), live (ast ids of the instrs where it is live)}]. DOM-free.
   Per local a forward may-dataflow tracks MOVED, UNINIT and EVER (assigned on some path). A use is any operand or borrow of the local;
   the destination of an assign and `dead` are not uses. A move reaching a use is E0382, else a missing initialisation is E0381. Blocks
   with no path from the entry are skipped, because the edges out of them stay in succ.
   A field is a local of its own (a path, see mir.js). A path is moved when it, or an ancestor, was moved; using a path whose descendant
   was moved is a use of a partially moved value; assigning to a path puts it and its descendants back. Two paths overlap when one is an
   ancestor of the other, and a loan on a path conflicts with an access to any path that overlaps it, never with a sibling.
   Loans: every `ref` assign is a loan. A second forward may-dataflow gives holds[local], the loans a local carries: a copy or move of a
   local passes them on, `as_str` passes its receiver's, a call, op or macro result carries none. A backward liveness pass gives the
   locals live at each instr (its own uses count). A loan is live at an instr iff a live local holds it, and an access to the loan's
   local then conflicts: see access(). Locals are bits of a BigInt mask, loans are bits of a BigInt mask.
   A fn whose result carries a lifetime has a reg (check.js fnSig): the params its result may borrow from. A second, order-free pass finds which params
   each local may point into; a returned value reaching another param is E0621 (a plain `&T` param, a named result) or the unsupported `lifetime mismatch`
   (rustc's error with no code). */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
RQ.BORROW_FEATURES.push('use while borrowed','reference in aggregate','repeated error','lifetime mismatch');
const MOVED=1,UNINIT=2,EVER=4;
const VISITS=50;

// use(local, isMove, kind): kind is copy, move, reb (implicit reborrow of a `&mut` local), ref (shared borrow) or mut (&mut borrow)
function uses(i,use){
  const o=x=>{if(x&&x.k!=='const')use(x.l,x.k==='move',x.k);};
  // a call or method operand that reborrows a `&mut` local needs it unborrowed; reading or writing through it (deref, store) does not
  const a=x=>{if(x&&x.reb)use(x.l,false,x.sh?'rebs':'reb');else o(x);};
  const rv=r=>{
    if(r.k==='ref')use(r.l,false,r.mut?'mut':'ref');
    else if(r.k==='use'||r.k==='deref'||r.k==='peek')o(r.x);
    else if(r.k==='method'){a(r.recv);r.args.forEach(a);}
    else if(r.args)r.args.forEach(a);
  };
  if(i.rv)rv(i.rv);
  else if(i.op==='store'){o(i.ref);o(i.x);}
  else if(i.op==='branch'||i.op==='return')o(i.x);
}

function relations(L){
  const kids=L.map(()=>[]);
  for(const l of L)if(l.parent!==undefined)kids[l.parent].push(l.id);
  const A=L.map(l=>{const a=[];for(let p=l.parent;p!==undefined;p=L[p].parent)a.push(p);return a;});
  const D=L.map(l=>{const d=[],st=[...kids[l.id]];while(st.length){const x=st.pop();d.push(x);st.push(...kids[x]);}return d;});
  const R=L.map((l,k)=>A[k].length?A[k][A[k].length-1]:k);
  return {A,D,R};
}
const BORROWS=new Set(['ref','mut','reb','rebs']);

function analyse(F,errors,un){
  const B=F.blocks,L=F.locals,n=L.length,{A,D,R}=relations(L);
  const deferred=new Set(),found=[],binds=new Map();
  for(const b of B)for(const i of b.instrs){
    if(i.op==='decl'&&i.uninit)deferred.add(i.l);
    if(i.grp!==undefined&&i.op==='assign'&&i.rv.k==='use'&&i.rv.x.k==='move'&&L[i.rv.x.l].path){
      if(!binds.has(i.grp))binds.set(i.grp,new Set());
      binds.get(i.grp).add(i.rv.x.l);
    }
  }
  const bad=(s,l)=>{
    if(s[l]&MOVED)return {code:'E0382',at:l};
    for(const a of A[l])if(s[a]&MOVED)return {code:'E0382',at:a};
    for(const d of D[l])if(s[d]&MOVED)return {code:'E0382',at:l,partial:true,part:d};
    return s[R[l]]&UNINIT?{code:'E0381',at:R[l]}:null;
  };
  const step=(s,i,rep)=>{
    uses(i,(l,mv,kind)=>{
      if(rep&&L[l].name!==null){
        const b=bad(s,l);
        if(b){
          if(b.partial&&kind==='copy'&&i.grp!==undefined&&binds.has(i.grp)&&D[l].some(d=>s[d]&MOVED&&binds.get(i.grp).has(d)))rep('AMBIG',l,i);
          else rep(b.code,l,i,{at:b.at,partial:b.partial,borrow:BORROWS.has(kind)});
        }
      }
      if(mv)s[l]|=MOVED;
    });
    if(i.op==='decl'){s[i.l]=i.uninit?UNINIT:0;for(const d of D[i.l])s[d]=0;}
    else if(i.op==='assign'){
      if(rep&&deferred.has(i.l)&&!L[i.l].mut&&s[i.l]&EVER)rep('E0384',i.l,i);
      if(rep&&L[i.l].path&&A[i.l].some(a=>s[a]&MOVED))rep('E0382',i.l,i,{at:A[i.l].find(a=>s[a]&MOVED),assign:true});
      s[i.l]=L[i.l].path?0:EVER;
      for(const d of D[i.l])s[d]=0;
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
    for(const i of b.instrs)step(s,i,(code,l,at,o)=>{if(code)found.push({code,l,line:at.line,col:at.col,grp:at.grp,...o});});
  }
  found.sort((a,b)=>a.line-b.line||a.col-b.col);
  const once=new Set(),seen=new Set(),grpDone=new Set();
  for(const f of found){
    if(f.code==='AMBIG'){un('partial move',f);continue;}
    const k=f.code+'@'+f.line+':'+f.col;
    if(seen.has(k)||f.code!=='E0384'&&once.has(f.l))continue;
    // one error per match: its scrutinee and the names it binds are the same mistake
    if(f.code==='E0382'&&f.grp!==undefined){if(grpDone.has(f.grp))continue;grpDone.add(f.grp);}
    seen.add(k);
    if(f.code!=='E0384')once.add(f.l);
    errors.push(RQ.diag.make(f.code,f.line,f.col,{name:L[f.partial||f.at===undefined?f.l:f.at].name,kind:'let',borrow:f.borrow,partial:f.partial,assign:f.assign}));
  }
  return true;
}

// E0596: a `&mut` borrow of a named local that is not `mut` (a ref temp for an autoref has no name), or push_str through a `&` receiver
function mutability(F,errors,un){
  const L=F.locals,seen=new Set(),{R}=relations(L);
  const err=(i,name,ref,root)=>{
    const k=i.line+':'+i.col;
    if(seen.has(k))return;
    seen.add(k);
    errors.push(RQ.diag.make('E0596',i.line,i.col,{name,ref,root}));
  };
  const roots=new Map();
  for(const b of F.blocks){
    if(b.unreachable)continue;
    for(const i of b.instrs){
      const r=i.rv;
      if(!r)continue;
      if(r.k==='ref'&&r.mut&&!r.deref&&!r.cap&&L[r.l].name!==null&&!L[r.l].mut){
        // rustc folds several of these on one variable into a single error, reported elsewhere than at each borrow
        const root=R[r.l];
        if(roots.has(root)&&roots.get(root)!==i.line+':'+i.col)un('repeated error',i);
        roots.set(root,i.line+':'+i.col);
        err(i,L[r.l].name,false,L[r.l].path?L[R[r.l]].name:null);
      }
      else if(r.k==='method'&&r.recv.k!=='const'&&RQ.std.methods.get(r.name).self==='&mut'){
        const t=L[r.recv.l].ty;
        if(t.k==='ref'&&!t.mut)err(i,r.text||'*'+(L[r.recv.l].name||L[r.recv.l].src||'value'),true,null);
      }
    }
  }
}

const bit=k=>1n<<BigInt(k);
const refy=t=>t.k==='ref'||t.k==='str';

function loanPass(F,errors,un,loans,stats){
  const B=F.blocks,L=F.locals,n=L.length,{A,D,R}=relations(L);
  const cap=VISITS*B.length+500;
  const lo=[],at=new Map();
  for(const b of B)if(!b.unreachable)for(const i of b.instrs)if(i.op==='assign'&&i.rv.k==='ref'){at.set(i,lo.length);lo.push({i,l:i.rv.l,mut:i.rv.mut,implicit:!!i.rv.implicit,deref:!!i.rv.deref,cap:!!i.rv.cap,live:new Set(),span:[i.line,i.line]});}
  const onS=L.map(()=>0n),onM=L.map(()=>0n),sub=L.map(()=>0n),lb=lo.map((_,k)=>bit(k)),nb=L.map((_,k)=>bit(R[k]));
  // onS/onM: the loans an access to l conflicts with (on l, an ancestor or a descendant); sub: the loans on l and below, which a write to l ends
  lo.forEach((x,k)=>{
    for(const r of [x.l,...A[x.l],...D[x.l]])(x.mut?onM:onS)[r]|=lb[k];
    for(const r of [x.l,...A[x.l]])sub[r]|=lb[k];
  });

  // the loans the value assigned by i carries; a call gives back its `from` argument's, a slice of a reference its base's
  // a field carries what its root carries
  // a struct literal carries what its fields carry; a result tied to several arguments (`more`) carries them all
  const flow=(o,i)=>{
    const r=i.rv,g=x=>x&&x.k!=='const'?o[R[x.l]]:0n;
    return r.k==='use'?g(r.x):r.k==='method'&&r.name==='as_str'?g(r.recv):r.k==='agg'?r.args.reduce((m,x)=>m|g(x),0n)
      :r.k==='call'&&r.from>=0?[r.from,...r.more||[]].reduce((m,k)=>m|g(r.args[k]),0n):0n;
  };
  const val=(s,i)=>i.rv.k==='ref'?lb[at.get(i)]|s[R[i.rv.l]]:flow(s,i);
  // a new value in l (decl, assign) or its death ends every loan on l, so no other local may carry them on
  const hold=(s,i)=>{
    if(i.op!=='decl'&&i.op!=='assign'&&i.op!=='dead')return;
    const v=i.op==='assign'?val(s,i):0n;
    const kill=~sub[i.l];
    for(let k=0;k<n;k++)s[k]&=kill;
    if(i.op!=='dead')s[i.l]=v&kill;
    for(const d of D[i.l])s[d]=0n;
    if(i.op==='assign'&&L[i.l].path)s[R[i.l]]|=v&kill;
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
    if((i.op==='assign'||i.op==='decl')&&!L[i.l].path)m&=~nb[i.l];
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

  // the parameters a value may point into, in no order: rustc checks a returned reference against the signature without following the flow
  const reg=F.reg,pbit=k=>1n<<BigInt(k),orig=L.map(()=>0n);
  const ro=i=>i.rv.k==='ref'?orig[R[i.rv.l]]:flow(orig,i);
  if(reg){
    F.pl.forEach((l,k)=>{if(l!==undefined&&(refy(L[l].ty)||RQ.types.hasRef(L[l].ty)))orig[l]=pbit(k);});
    for(let ch=true,w=0;ch;){
      ch=false;
      if(++w>VISITS)return false;
      for(const b of B)if(!b.unreachable)for(const i of b.instrs)if(i.op==='assign'){
        const d=R[i.l],v=ro(i);
        if((orig[d]|v)!==orig[d]){orig[d]|=v;ch=true;}
      }
    }
  }
  const seen=new Set();
  let lm=0n;
  // star: the access goes through the reference local `l`, so rustc names `*l`
  const access=(l,kind,i,star)=>{
    const sh=lm&onS[l],mu=lm&onM[l];
    if(!(sh|mu))return;
    const ownMut=!!mu&&lo.every((x,k)=>!(mu&lb[k])||x.deref);
    let code='';
    if(kind==='ref'){if(mu)code='E0502';}
    else if(kind==='mut')code=mu?'E0499':'E0502';
    // a loan made by a `for` over a reference local (`deref`) is modelled; any other live `&mut` loan on a reference local is not
    else if(kind==='reb'){if(mu&&!ownMut)un('reborrow',i);else code=mu?'E0499':'E0502';}
    else if(kind==='rebs'){if(mu&&!ownMut)un('reborrow',i);else if(mu)code='E0502';}
    else if(kind==='move')code='E0505';
    else if(kind==='write')code='E0506';
    // the `reborrow` arm is a backstop: no source shape reaches it (`&r` is a reference to a reference, which the checker rejects)
    else if(mu)un(refy(L[l].ty)?'reborrow':'use while borrowed',i);
    const k=code+'@'+i.line+':'+i.col;
    if(!code||seen.has(k))return;
    seen.add(k);
    errors.push(RQ.diag.make(code,i.line,i.col,{name:(star||kind==='reb'||kind==='rebs'?'*':'')+(L[l].name||L[l].src||'value'),mut:kind==='mut'||kind==='reb'}));
  };
  for(const b of B){
    if(!inn[b.id])continue;
    const lv=[];
    let m=out(b);
    for(let j=b.instrs.length-1;j>=0;j--)lv[j]=m=back(m,b.instrs[j]);
    const s=inn[b.id].slice();
    b.instrs.forEach((i,j)=>{
      lm=0n;
      for(let l=0;l<n;l++)if(s[l]&&lv[j]&nb[l]&&!L[l].ret)lm|=s[l];
      if(lm){
        const cnt=new Map();
        lo.forEach((x,k)=>{
          if(!(lm&lb[k]))return;
          x.live.add(i.ast);
          x.span=[Math.min(x.span[0],i.line),Math.max(x.span[1],i.line)];
          if(x.implicit||refy(L[x.l].ty))return;
          const key=x.l+(x.mut?'m':'s'),c=(cnt.get(key)||0)+1,kind=x.mut?'mut':'shared';
          cnt.set(key,c);
          if(c>stats[kind])stats[kind]=c;
        });
      }
      if(i.op==='assign'&&L[i.l].ret){
        const held=val(s,i);
        const k=lo.findIndex((x,q)=>held&lb[q]&&!refy(L[x.l].ty)&&!L[x.l].cap);
        if(k>=0&&lo[k].cap){
          const key='E0373@'+lo[k].i.line+':'+lo[k].i.col;
          if(!seen.has(key)){seen.add(key);errors.push(RQ.diag.make('E0373',lo[k].i.line,lo[k].i.col,{name:L[lo[k].l].name}));}
        }else if(k>=0){
          const key='E0515@'+i.line+':'+i.col;
          if(!seen.has(key)){seen.add(key);errors.push(RQ.diag.make('E0515',i.line,i.col,{name:L[lo[k].l].name||L[lo[k].l].src||'value',direct:i.rv.k==='ref'&&!i.rv.slice,param:L[lo[k].l].param,path:!!L[lo[k].l].path}));}
        }
      }
      if(reg&&i.op==='assign'&&L[i.l].ret){
        const o=ro(i);
        F.pl.forEach((l,k)=>{
          const key='R'+k+'@'+i.line+':'+i.col;
          if(l===undefined||!(o&pbit(k))||reg.allowed.includes(k)||seen.has(key))return;
          seen.add(key);
          if(reg.ret&&reg.plain[k])errors.push(RQ.diag.make('E0621',i.line,i.col,{name:reg.names[k]}));
          else un('lifetime mismatch',i);
        });
      }
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
        if(i.rv.k==='agg'&&!(L[i.l].ty.k==='struct'&&L[i.l].ty.lt))for(const x of i.rv.args)if(x.k!=='const'&&(s[x.l]||refy(L[x.l].ty)||RQ.types.hasRef(L[x.l].ty)))un('reference in aggregate',i);
      }
      hold(s,i);
    });
  }
  // a print's `&r` of a reference local guards r for the call; it is not a borrow the user wrote
  for(const x of lo)if(!refy(L[x.l].ty))loans.push({id:loans.length,ast:x.i.ast,local:L[x.l].name,mut:x.mut,implicit:x.implicit,line:x.i.line,span:x.span,live:[...x.live].sort((a,b)=>a-b)});
  return true;
}

RQ.borrow=(ast,info)=>{
  const m=RQ.mir(ast,info),errors=[...(m.errors||[])],loans=[],moves=[],maxLive={shared:0,mut:0},unsupported=[...m.unsupported],seen=new Set();
  const un=(feature,nd)=>{const k=feature+'@'+nd.line;if(!seen.has(k)){seen.add(k);unsupported.push({feature,line:nd.line});}};
  if(!unsupported.length)for(const F of m.fns){
    const ok=analyse(F,errors,un);
    for(const b of F.blocks)if(!b.unreachable)for(const i of b.instrs)uses(i,(l,mv)=>{if(mv&&F.locals[l].name!==null)moves.push({name:F.locals[l].name,line:i.line});});
    if(ok)mutability(F,errors,un);
    if(!ok||!loanPass(F,errors,un,loans,maxLive)){unsupported.push({feature:'program too large',line:F.line});break;}
  }
  return {errors,unsupported,loans,moves,maxLive,analysed:m.fns.map(f=>f.name)};
};
})();
