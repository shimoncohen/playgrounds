/* Data Structures Quest: the step 1 quest model ("See it": operate a structure or predict a walk). DOM-free, so Node can test it.
   A mission's `visual` data is checked by validate() before use. A refusal is the scene's own ok:false step, or one made here with a reason. */
(()=>{
'use strict';
const D=globalThis.DSQ=globalThis.DSQ||{};
const V=D.visual={};

const deepEq=(a,b)=>{
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const ka=Object.keys(a),kb=Object.keys(b);
 return ka.length===kb.length&&ka.every(k=>Object.hasOwn(b,k)&&deepEq(a[k],b[k]));
};
const refuse=reason=>({ok:false,reason,say:reason,code:'',hi:[],changes:[],ptrs:[],result:undefined});
const scene=vis=>D.SCENES[vis.scene];
const isEntry=e=>!!e&&typeof e==='object'&&!Array.isArray(e)&&typeof e.op==='string';
const isPlain=s=>typeof s==='string'&&s.trim()!=='';

V.ANSWERS={
 result:(steps,k)=>steps[k].result,
 total:(steps,k)=>steps.slice(0,k+1).reduce((t,s)=>typeof s.result==='number'?t+s.result:t,0)
};

const record=vis=>{
 const sc=scene(vis),s=sc.create(vis.start);
 const steps=[],states=[sc.clone(s)];
 for(const e of vis.steps){const o=sc.op(s,e.op);steps.push(o?o.run(s,e.arg):refuse(`The scene has no ${e.op} operation.`));states.push(sc.clone(s))}
 return {steps,states};
};

const matches=(vis,e)=>isEntry(e)&&(vis.buttons.some(b=>b.op===e.op&&deepEq(b.arg??null,e.arg??null))||(vis.link===true&&e.op==='link'));

V.validate=vis=>{
 if(!vis||typeof vis!=='object')return ['visual must be an object'];
 const err=[],add=m=>err.push(m);
 if(!isPlain(vis.task))add('missing task');
 if(vis.kind!=='operate'&&vis.kind!=='predict')add('kind must be operate or predict');
 const sc=Object.hasOwn(D.SCENES,vis.scene)?D.SCENES[vis.scene]:null;
 if(!sc){add(`unknown scene ${vis.scene}`);return err}
 let st;
 try{st=sc.create(vis.start)}catch(e){add(`start rejected: ${e.message}`)}
 if(vis.kind==='operate'){
  const bs=vis.buttons;
  if(!Array.isArray(bs)||!bs.length)add('missing buttons');
  else bs.forEach((b,i)=>{
   if(!b||!isPlain(b.label))add(`button ${i} needs a label`);
   else if(typeof b.op!=='string'||!sc.op(st,b.op))add(`button ${b.label}: the scene has no operation ${b.op}`);
  });
  if(!vis.goal||typeof vis.goal!=='object'||!('snapshot' in vis.goal))add('goal must be {snapshot}');
  for(const k of ['ref','wrong','lazy']){
   const seq=vis[k];
   if(!Array.isArray(seq)||!seq.length)add(`missing or empty ${k}`);
   else if(Array.isArray(bs)&&seq.some(e=>!matches(vis,e)))add(`${k} has an entry that matches no button`);
  }
 }else if(vis.kind==='predict'){
  const steps=vis.steps,pauses=vis.pauses;
  let rec=null;
  if(!Array.isArray(steps)||!steps.length)add('missing steps');
  else if(!steps.every(isEntry))add('every step needs an op');
  else if(st){rec=record(vis);rec.steps.forEach((s,i)=>{if(!s.ok)add(`step ${i} is refused: ${s.reason}`)})}
  if(!Array.isArray(pauses)||!pauses.length)add('missing pauses');
  else{
   const seen=new Set();
   pauses.forEach((p,i)=>{
    if(!p||typeof p!=='object'){add(`pause ${i} must be an object`);return}
    if(!isPlain(p.ask))add(`pause ${i} needs an ask`);
    if(!Number.isInteger(p.step)||p.step<0||!Array.isArray(steps)||p.step>=steps.length)add(`pause ${i}: step out of range`);
    else if(seen.has(p.step))add(`pause ${i}: step ${p.step} is used twice`);
    else seen.add(p.step);
    const known=typeof p.of==='string'&&Object.hasOwn(V.ANSWERS,p.of);
    if(!known)add(`pause ${i}: unknown answer kind ${p.of}`);
    const ch=p.choices;
    if(!Array.isArray(ch)||ch.length<2||ch.length>4||new Set(ch.map(c=>JSON.stringify(c))).size!==ch.length)add(`pause ${i}: choices must be 2 to 4 different values`);
    else if(known&&rec&&rec.steps.every(s=>s.ok)&&Number.isInteger(p.step)&&p.step>=0&&p.step<steps.length&&!ch.some(c=>c===V.ANSWERS[p.of](rec.steps,p.step)))add(`pause ${i}: the right answer is not among the choices`);
   });
  }
 }
 return err;
};

V.start=(vis,id)=>{
 const sc=scene(vis);
 if(vis.kind==='predict'){
  const rec=record(vis);
  return {id,vis,kind:'predict',rec,pos:0,solved:new Set(),state:sc.clone(rec.states[0])};
 }
 return {id,vis,kind:'operate',state:sc.create(vis.start),hist:[],log:[],pending:null};
};

V.runSeq=(vis,seq)=>{const s=V.start(vis);for(const e of seq)V.apply(s,e);return s};

const operateOnly=(sess,what)=>sess.kind==='operate'?null:refuse(`${what} is for the do-it-yourself missions, and this one asks questions instead.`);
const predictOnly=(sess,what)=>sess.kind==='predict'?null:refuse(`${what} is for the question missions, and this one is hands-on.`);

V.apply=(sess,e)=>{
 const bad=operateOnly(sess,'Doing an operation');if(bad)return bad;
 if(!matches(sess.vis,e))return refuse('That is not one of the buttons on this page, so nothing was done.');
 const sc=scene(sess.vis),o=sc.op(sess.state,e.op),before=sc.clone(sess.state);
 const step=o.run(sess.state,e.arg);
 if(!step.ok)return step;
 sess.hist.push(before);sess.log.push(step);
 return step;
};
V.undo=sess=>{
 const bad=operateOnly(sess,'Undo');if(bad)return bad;
 if(!sess.hist.length)return refuse('There is nothing to undo yet.');
 sess.state=sess.hist.pop();sess.log.pop();sess.pending=null;
 return {ok:true};
};
V.reset=sess=>{
 const bad=operateOnly(sess,'Reset');if(bad)return bad;
 sess.state=scene(sess.vis).create(sess.vis.start);sess.hist=[];sess.log=[];sess.pending=null;
 return {ok:true};
};
V.moves=sess=>sess.hist?sess.hist.length:0;
V.fewest=sess=>sess.vis.ref.length;
V.won=sess=>sess.kind==='operate'&&deepEq(scene(sess.vis).snapshot(sess.state),sess.vis.goal.snapshot);

V.cancelPick=sess=>{sess.pending=null};
V.pick=(sess,sel)=>{
 const bad=operateOnly(sess,'Picking nodes');if(bad)return bad;
 if(sess.vis.link!==true)return refuse('This mission has no linking, so there is nothing to pick.');
 const first=sess.pending;
 const fail=m=>{sess.pending=null;return refuse(m)};
 if(!first){
  if(!sel||typeof sel!=='object'||!(sel.head===true||Number.isInteger(sel.i)))return fail('Start from the head or a node in the chain, then pick a loose node to join onto it.');
  sess.pending=sel;
  return {ok:true,pending:sel};
 }
 if(deepEq(first,sel)){sess.pending=null;return {ok:true,cancelled:true}}
 if(!sel||typeof sel!=='object'||!Number.isInteger(sel.l))return fail('The second pick must be a loose node, one that is not in the chain yet.');
 sess.pending=null;
 return V.apply(sess,{op:'link',arg:{from:first,to:sel}});
};

const open=sess=>sess.vis.pauses.find(p=>p.step===sess.pos&&!sess.solved.has(p.step));
const play=sess=>{const step=sess.rec.steps[sess.pos];sess.pos++;sess.state=scene(sess.vis).clone(sess.rec.states[sess.pos]);return step};

V.answerOf=(vis,k)=>{
 const p=vis.pauses.find(x=>x.step===k);
 return V.ANSWERS[p.of](record(vis).steps,k);
};
V.advance=sess=>{
 const bad=predictOnly(sess,'Stepping');if(bad)return bad;
 const p=open(sess);
 if(p)return {ask:p};
 if(sess.pos>=sess.rec.steps.length)return refuse('That was the last step.');
 return play(sess);
};
V.back=sess=>{
 const bad=predictOnly(sess,'Going back');if(bad)return bad;
 if(!sess.pos)return refuse('You are already at the start.');
 sess.pos--;sess.state=scene(sess.vis).clone(sess.rec.states[sess.pos]);
 return {ok:true,pos:sess.pos};
};
V.answer=(sess,choice)=>{
 const bad=predictOnly(sess,'Answering');if(bad)return bad;
 const p=open(sess);
 if(!p)return refuse('There is no question open right now.');
 if(choice!==V.ANSWERS[p.of](sess.rec.steps,p.step))return {ok:false,step:sess.rec.steps[p.step],pause:p};
 sess.solved.add(p.step);
 return {ok:true,step:play(sess)};
};
V.passed=sess=>sess.kind==='predict'&&sess.vis.pauses.every(p=>sess.solved.has(p.step))&&sess.pos>=sess.rec.steps.length;

V.gated=m=>!!(m&&m.visual);
V.seen=(S,id)=>!!((S.seen&&S.seen[id])||(S.done&&S.done[id]));
V.pass1=(S,id,sess)=>{
 if(!sess||sess.id!==id||!(sess.kind==='operate'?V.won(sess):V.passed(sess)))return false;
 (S.seen=S.seen||{})[id]=true;
 return true;
};
V.stepOf=(S,m,id)=>V.gated(m)&&!V.seen(S,id)?1:2;
V.complete=(S,ch,mi)=>{
 const id=ch+'.'+mi,c=D.CH[ch];
 if(V.gated(c.missions[mi])&&!V.seen(S,id))return {ok:false,locked:true};
 const first=!S.done[id],r={ok:true,first};
 if(first){
  S.done[id]=true;S.xp+=10;
  if(!S.badges[ch]&&c.missions.every((_,i)=>S.done[ch+'.'+i])){S.badges[ch]=true;S.xp+=25;r.badge=true}
 }
 return r;
};
})();
