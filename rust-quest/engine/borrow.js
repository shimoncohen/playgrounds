/* The move and initialisation analysis over the CFG that mir.js lowers. RQ.borrow(ast, info) gives {errors, unsupported, loans, analysed}:
   errors are E0381 (use of an uninitialised local), E0382 (use after a move) and E0384 on a deferred let; unsupported also carries what
   mir.js reported, and the analysis is skipped when it did; loans is empty until the loan pass; analysed names the lowered fns. DOM-free.
   Per local a forward may-dataflow tracks MOVED, UNINIT and EVER (assigned on some path). A use is any operand or borrow of the local;
   the destination of an assign and `dead` are not uses. A move reaching a use is E0382, else a missing initialisation is E0381. Blocks
   with no path from the entry are skipped, because the edges out of them stay in succ. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const MOVED=1,UNINIT=2,EVER=4;
const VISITS=50;

function uses(i,use){
  const o=x=>{if(x&&x.k!=='const')use(x.l,x.k==='move');};
  const rv=r=>{
    if(r.k==='ref')use(r.l,false);
    else if(r.k==='use'||r.k==='deref')o(r.x);
    else if(r.k==='method'){o(r.recv);r.args.forEach(o);}
    else if(r.args)r.args.forEach(o);
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

RQ.borrow=(ast,info)=>{
  const m=RQ.mir(ast,info),errors=[],unsupported=[...m.unsupported];
  if(!unsupported.length)for(const F of m.fns)if(!analyse(F,errors)){unsupported.push({feature:'program too large',line:F.line});break;}
  return {errors,unsupported,loans:[],analysed:m.fns.map(f=>f.name)};
};
})();
