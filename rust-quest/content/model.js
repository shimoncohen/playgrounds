/* Chapters push into RQ.CH in order; a mission's key is '<chapter>.<mission>', so shipped missions are never reordered.
   Mission shape: {title, goal, how, explain, hint, kind, starter?, starterErr?, harness?, answer, alts[],
   wrong[{src,wrongWhy}], lazy[{src,wrongWhy}], defines[], previews[{tag,wording,home?}], expect?, check(c)}.
   expect is absent or 'panic': a mission about a runtime panic, whose answer is meant to end in one. On any other mission a
   panic never reaches check and the learner gets the panic text instead.
   wrongWhy is a rustc id (the program must fail with it) or 'check' (it compiles and the check says no).
   A hidden `harness` is appended to the learner's code. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
RQ.CH=RQ.CH||[];

const program=(m,input)=>m.harness?input+'\n'+m.harness:input;

// result is true or one friendly sentence; c is null for an empty editor. unsupported and internal never complete a mission.
RQ.evalMission=(m,input)=>{
  const src=String(input??'');
  if(!src.trim())return {c:null,result:'Write some code first, then press Run.'};
  const c=RQ.run(program(m,src));
  let result;
  if(c.status==='error'){
    const e=c.errors[0];
    result=e.code||e.lint?'The compiler would stop here: '+e.msg+' (line '+e.line+').':'The compiler would not accept this: '+e.msg+' (line '+e.line+').';
  }else if(c.status==='unsupported')result='Rust Quest does not model `'+c.unsupported.feature+'`. '+RQ.diag.hint(c.unsupported.feature);
  else if(c.status==='internal')result='This is a Rust Quest bug, not your code.';
  else if(c.status==='limit')result=c.limit==='string size'?'The program made a string too long for the practice runner and was stopped. Is a loop making it longer every time round?':'The program ran for too long and was stopped. Is something calling itself forever?';
  else if(c.status==='panic'&&m.expect!=='panic')result='The program stopped with a panic: '+c.panic.msg+' (line '+c.panic.line+').';
  else result=m.check(c);
  return {c,result};
};
RQ.runMission=(m,input)=>RQ.evalMission(m,input).result;

const keyOf=m=>{for(let ci=0;ci<RQ.CH.length;ci++){const mi=RQ.CH[ci].missions.indexOf(m);if(mi>=0)return ci+'.'+mi;}return '?';};
// with no argument, the programs of every mission
RQ.missionPrograms=m=>{
  if(!m)return RQ.CH.flatMap(ch=>ch.missions.flatMap(x=>RQ.missionPrograms(x)));
  const k=keyOf(m),out=[{id:k+':answer',role:'answer',src:program(m,m.answer)}];
  if(m.starter)out.push({id:k+':starter',role:'starter',src:program(m,m.starter)});
  (m.alts||[]).forEach((s,i)=>out.push({id:k+':alt'+i,role:'alt',src:program(m,s)}));
  (m.wrong||[]).forEach((w,i)=>out.push({id:k+':wrong'+i,role:'wrong',src:program(m,w.src)}));
  (m.lazy||[]).forEach((w,i)=>out.push({id:k+':lazy'+i,role:'lazy',src:program(m,w.src)}));
  return out;
};
})();
