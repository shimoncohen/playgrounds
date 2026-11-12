/* A mission is checked by AQ.evaluate on a fresh simulated run, so the check never depends on UI state. Nothing a learner
   types is saved: the state holds only chapter, mission, done, xp, badges, best and tab. */
(()=>{
'use strict';
const {CH,QF,GUIDE,FACTS,state}=AQ;
const KEY=window.PROGRESS.key;
const $=s=>document.querySelector(s);
const esc=AQUI.esc,el=AQUI.el;
const TABS=state.TABS;
const xpOf=ci=>AQ.tierXp(CH[ci].tier);

/* the stored value is replaced at once when it is absent, damaged, out of date or tampered with, so the landing card and
   shared/progress.js never keep reading it */
let raw=null;
try{raw=localStorage.getItem(KEY);}catch(e){}
let S=state.load(raw);
let saveT=0,pending=false;
const write=()=>{pending=false;try{localStorage.setItem(KEY,state.serialize(S));}catch(e){}};
function save(){pending=true;clearTimeout(saveT);saveT=setTimeout(write,200);}
addEventListener('pagehide',()=>{if(pending){clearTimeout(saveT);write();}});
if(raw===null||raw!==state.serialize(S))write();

const mkey=()=>S.ch+'.'+S.mi;
const curMission=()=>CH[S.ch].missions[S.mi]||null;
const sessionMission=()=>curMission()||CH[S.ch].missions[CH[S.ch].missions.length-1];
const totalDone=ci=>CH[ci].missions.filter((_,i)=>S.done[ci+'.'+i]).length;
const chapterDone=ci=>totalDone(ci)===CH[ci].missions.length;

const cardEl=$('#mission'),bodyEl=$('#missionBody'),tailEl=$('#missionTail'),chaptersEl=$('#chapters');
const fb=()=>$('#feedback');
const runv=AQUI.runView($('#run'));
let pop=false,lastPeak=null;

const ed=AQED.create({tree:$('#tree'),fileEl:$('#fileEditor'),host:$('#promptHost'),onChange:changed});
$('#run').addEventListener('click',e=>{if(e.target.closest('button[data-act="approve"]'))runAgent(true);});
function refresh(){
  const m=sessionMission();
  if(!m)return;
  const p=AQ.prepare(m,ed.getInput());
  ed.showErrors([...p.prompt.errors,...p.setup.errors]);
  const scope=[...new Set(p.prompt.files.flatMap(f=>p.vfs.read(f)!==null?[f]:p.vfs.list(AQ.vfs.dir(f))))];
  const skills=AQ.config.loadedSkills(p.setup,p.vfs,p.scenario.tag||(AQ.config.fired(p.scenario,p.setup,p.prompt)?'schedule':undefined)).loaded;
  const ctx=AQ.context.build(p.setup,p.prompt,p.scenario.history||[],scope.map(f=>({path:f,text:p.vfs.read(f)||''})),{skills});
  AQMETER.render({panel:$('#meter'),strip:$('#meterStrip')},ctx,lastPeak);
}
function startSession(){
  lastPeak=null;awaitingRun=null;
  ed.load(sessionMission());runv.clear();refresh();
}
let awaitingRun=null;
function changed(){
  if(awaitingRun){awaitingRun=null;runv.clear();renderFeedback(null);}
  refresh();
}
function runAgent(approve){
  const m=sessionMission();
  const input=approve&&awaitingRun?awaitingRun.input:ed.getInput();
  const r=AQ.evaluate(m,input,{approved:!!approve});
  if(r.refused){ed.focusErrors();return;}
  runv.show(r.outcome);
  awaitingRun=r.awaiting?{input}:null;
  lastPeak=r.outcome.tokens.peak;refresh();
  if(r.awaiting){renderFeedback({wait:true});return;}
  if(r.result!==true){renderFeedback({tip:r.result});return;}
  if(curMission())complete();else renderFeedback({win:true,first:false});
}
function complete(){
  const k=mkey(),first=!S.done[k];let badge=false;
  if(first){
    S.done[k]=true;
    if(chapterDone(S.ch)&&!S.badges[S.ch]){S.badges[S.ch]=true;badge=true;}
    S.xp=state.xpFor(S.done,S.badges);pop=true;save();
  }
  renderFeedback({win:true,first,badge});
  renderChapters();renderMission();renderXP();
}
const WINS=['The agent read, acted and checked, and your lines are what made that safe.','That is how you steer an agent: say what to check, what to avoid and where to look.','Clean. Small, exact instructions beat long vague ones.'];
function renderFeedback(f){
  const host=fb();if(!host)return;
  host.textContent='';
  if(!f)return;
  const box=el('div','msg '+(f.win?'win':'tip')),h=el('span','h'),p=el('p');
  if(f.win){
    h.textContent=f.first?'Mission complete! +'+xpOf(S.ch)+' XP'+(f.badge?' · Badge earned: '+CH[S.ch].badge:''):'Mission complete (you had already earned this one)';
    p.textContent=WINS[(S.ch*7+S.mi)%WINS.length];
    const acts=el('div','actions');
    if(curMission()){const b=el('button','btn',(S.mi>=CH[S.ch].missions.length-1?'Finish the chapter':'Next mission')+' →');b.type='button';b.dataset.act='next';acts.append(b);}
    box.append(h,p,acts);
  }else if(f.wait){
    h.textContent='Waiting for your approval';p.textContent='The agent made a plan and has not touched anything yet. Read the plan in the Run panel, then approve it.';
    box.append(h,p);
  }else{
    h.textContent='Not quite yet';p.textContent=f.tip;
    box.append(h,p);
  }
  const steps=el('button','btn ghost narrow-only','See the steps');steps.type='button';steps.dataset.act='torun';
  box.append(steps);
  host.append(box);
}

const PANES=['mission','files','meter','run'];
function setPane(p){
  if(!PANES.includes(p))p='mission';
  $('.quest').dataset.pane=p;
  document.querySelectorAll('.paneSwitch button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pane===p)));
}
$('.paneSwitch').addEventListener('click',e=>{const b=e.target.closest('button[data-pane]');if(b)setPane(b.dataset.pane);});

const mq=q=>{try{return !!(window.matchMedia&&matchMedia(q).matches);}catch(e){return false;}};
const wide=()=>mq('(min-width:721px)');
let railRO;
function renderChapters(){
  Tiers.renderRail(chaptersEl,{status:AQ.tiers.status(S),chapters:CH,S,onPick:ci=>{
    let mi=CH[ci].missions.findIndex((_,i)=>!S.done[ci+'.'+i]);if(mi<0)mi=0;
    gotoMission(ci,mi);
    const c=chaptersEl.querySelector(`[data-ch="${ci}"]`);if(c)c.focus({preventScroll:true});
  }});
  revealCurrent();
  // Web fonts swap in after the first paint and resize the chips, so scroll again once any of them changes size.
  if(window.ResizeObserver){railRO=railRO||new ResizeObserver(revealCurrent);railRO.disconnect();railRO.observe(chaptersEl);for(const k of chaptersEl.children)railRO.observe(k);}
}
// scrollIntoView would also scroll the page at 390 px, so only the rail scrolls
function revealCurrent(){
  const a=chaptersEl.querySelector('[aria-current="true"]');if(!a)return;
  const r=a.getBoundingClientRect(),c=chaptersEl.getBoundingClientRect();
  if(r.bottom>c.bottom)chaptersEl.scrollTop+=r.bottom-c.bottom;else if(r.top<c.top)chaptersEl.scrollTop-=c.top-r.top;
  if(r.right>c.right)chaptersEl.scrollLeft+=r.right-c.right;else if(r.left<c.left)chaptersEl.scrollLeft-=c.left-r.left;
}
function renderMission(){
  const ch=CH[S.ch],n=ch.missions.length;
  const dots=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((m,i)=>`<button class="dot${S.done[S.ch+'.'+i]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(m.title)}" aria-label="Mission ${i+1}: ${esc(m.title)}${S.done[S.ch+'.'+i]?' (done)':''}"${i===S.mi?' aria-current="step"':''}>${i+1}</button>`).join('')}</div>`;
  if(S.mi>=n){
    const all=chapterDone(S.ch),last=S.ch===CH.length-1;
    bodyEl.innerHTML=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art${all?'':' dim'}" aria-hidden="true">${all?'★':S.ch+1}</div>
    <h2>${all?'Badge earned: '+esc(ch.badge):'Chapter finished'}</h2>
    <p class="explain">${all?'Every mission in this chapter is done. ':'A few missions are still open: the dots below show which. '}You can now use these:</p>
    <div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
    <p class="note">The practice area is still live, so keep trying lines as long as you like.</p>
    ${last?`<p class="note">That is every chapter there is for now. Play Quick-fire to keep the facts fresh, or browse the field guide.</p><div class="actions"><button class="btn" data-act="tab-fire">Play Quick-fire</button><button class="btn ghost" data-act="tab-guide">Open the field guide</button></div>`
      :`<div class="actions"><button class="btn" data-act="nextch">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button></div>`}`;
    tailEl.innerHTML=dots;
  }else{
    const m=ch.missions[S.mi];
    const srcs=(m.facts||[]).map(id=>AQ.facts.byId(id)).filter(Boolean).map(f=>`<p class="srcs">${esc(f.text)} <a href="${esc(f.docUrl)}" target="_blank" rel="noopener noreferrer">Read the docs</a> (checked ${esc(f.checked)}).</p>`).join('');
    bodyEl.innerHTML=`${Trail.html(ch.story)}<div class="eyebrow">Chapter ${S.ch+1} · Mission ${S.mi+1} of ${n}${S.done[mkey()]?' · done ✓':''}</div>
    <h2>${esc(m.title)}</h2>
    <div class="goal"><div class="label">Your goal</div><p>${m.goal}</p></div>
    ${HowSteps.html(m.how)}
    <p class="explain">${m.explain}</p>
    <details class="hint"><summary>Show a hint</summary><p>${m.hint}</p></details>${srcs}`;
    tailEl.innerHTML=`<details class="about"${S.mi===0&&!S.done[mkey()]&&wide()?' open':''}><summary>About this chapter</summary><p class="intro">${ch.intro}</p></details>${dots}`;
  }
  if(pop){cardEl.classList.remove('pop');void cardEl.offsetWidth;cardEl.classList.add('pop');pop=false;}
}
cardEl.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mi!==undefined){gotoMission(S.ch,+b.dataset.mi);const d=tailEl.querySelector(`[data-mi="${S.mi}"]`);if(d)d.focus({preventScroll:true});return;}
  const a=b.dataset.act;
  if(a==='run')runAgent();
  else if(a==='fill'){const m=sessionMission();if(m){ed.setInput(m.answer);setPane('mission');}}
  else if(a==='next')gotoMission(S.ch,S.mi+1);
  else if(a==='nextch')gotoMission(S.ch+1,0);
  else if(a==='torun')setPane('run');
  else if(a&&a.startsWith('tab-'))showTab(a.slice(4),true);
});
function gotoMission(ci,mi){
  if(!CH[ci])return;
  S.ch=ci;S.mi=Math.max(0,Math.min(mi,CH[ci].missions.length));save();
  renderChapters();renderMission();startSession();setPane('mission');
}

function renderXP(){
  const r=AQ.tiers.rankFor(S.xp);
  $('#rank').textContent=r.name;$('#xpText').textContent=S.xp+' XP';
  $('#xpFill').style.width=(r.hi>r.lo?Math.min(100,(S.xp-r.lo)/(r.hi-r.lo)*100):100)+'%';
}

function showTab(t,user){
  if(!TABS.includes(t))t='quest';
  if(user&&S.tab!==t){S.tab=t;save();}else S.tab=t;
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  TABS.forEach(x=>{$('#tab-'+x).hidden=x!==t;});
  if(t!=='fire')stopFire(true);
  if(t==='guide'&&!$('#guide').dataset.ready)renderGuide();
  if(t==='fire'&&!fireOn)fireIdle();
}
$('.tabs').addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(b)showTab(b.dataset.tab,true);});
$('.tabs').addEventListener('keydown',e=>{
  if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;
  const bs=[...document.querySelectorAll('.tabs button[data-tab]')];
  let i=bs.findIndex(b=>b.getAttribute('aria-selected')==='true');
  i=(i+(e.key==='ArrowRight'?1:bs.length-1))%bs.length;showTab(bs[i].dataset.tab,true);bs[i].focus();
});

const ROUND=75,fStage=$('#fStage');
let fireOn=false,fT=0,fLeft=ROUND,fScore=0,fStreak=0,fQ=null,fDeck=[],fMiss=[],fLocked=false,fNext=0;
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
function setStats(){$('#fScore').textContent=fScore;$('#fStreak').textContent=fStreak;$('#fBest').textContent=S.best;$('#fTime').textContent=fLeft;$('#fTimer').style.width=(fLeft/ROUND*100)+'%';}
/* a question is in the pool once every mission of its chapter is done, so nothing is asked before it was taught */
const qfPool=()=>QF.filter(q=>chapterDone(q.ch|0));
function fireLocked(){
  const open=CH.map((c,i)=>i).filter(i=>!chapterDone(i)&&QF.some(q=>(q.ch|0)===i));
  return `<p class="explain">Quick-fire asks about things the missions have taught, so it opens once you finish them. ${open.length?'Finish '+open.map(i=>`<b>Chapter ${i+1}: ${esc(CH[i].name)}</b> (${totalDone(i)} of ${CH[i].missions.length} missions done)`).join(' and ')+' first.':''}</p>
  <div class="actions"><button class="btn" data-act="tab-quest">Back to the missions</button></div>`;
}
function fireIdle(){
  if(!qfPool().length){fStage.innerHTML=fireLocked();setStats();return;}
  fStage.innerHTML=`<p class="explain">You will get one question at a time with four answers. Pick fast: the clock runs for ${ROUND} seconds, and every correct answer in a row adds a streak bonus. Your best score is kept, and nothing here changes your XP.</p>
  <div class="actions"><button class="btn" id="fStart">Start the clock</button><span class="note" style="align-self:center">Keys <kbd>1</kbd>–<kbd>4</kbd> pick an answer.</span></div>`;
  setStats();
}
function nextQ(){
  const pool=qfPool();
  if(!fDeck.length)fDeck=shuffle(pool.map(q=>QF.indexOf(q)));
  fQ=QF[fDeck.pop()];
  fQ.opts=shuffle([fQ.a,...fQ.w.filter(w=>w!==fQ.a).slice(0,3)]);fLocked=false;
  fStage.innerHTML=`<div class="task">${fQ.c}</div><div class="opts">${fQ.opts.map((o,i)=>`<button class="opt" data-i="${i}"><span class="n">${i+1}</span><span class="ot">${o}</span></button>`).join('')}</div>
  <p class="fb" id="fFb" aria-live="polite"></p><div class="actions"><button class="btn ghost" id="fStop">End round</button></div>`;
  fStage.querySelector('.opt').focus({preventScroll:true});
}
function pick(i){
  if(!fireOn||fLocked||!fQ)return;
  fLocked=true;
  const ok=fQ.opts[i]===fQ.a,bs=[...fStage.querySelectorAll('.opt')];
  bs.forEach((b,j)=>{b.disabled=true;if(fQ.opts[j]===fQ.a)b.classList.add('right');else if(j===i)b.classList.add('wrong');});
  const f=$('#fFb');
  if(ok){fStreak++;const pts=10+Math.min(fStreak-1,5)*2;fScore+=pts;f.className='fb good';f.textContent=`Correct! +${pts}${fStreak>1?` (streak ${fStreak})`:''}`;}
  else{fStreak=0;fMiss.push(fQ);f.className='fb bad';f.innerHTML='Not this time. The answer is “'+fQ.a+'”. '+fQ.why;}
  setStats();clearTimeout(fNext);fNext=setTimeout(()=>{if(fireOn)nextQ();},ok?700:2600);
}
function startFire(){
  if(!qfPool().length){fireIdle();return;}
  fDeck=[];fireOn=true;fLeft=ROUND;fScore=0;fStreak=0;fMiss=[];setStats();nextQ();
  clearInterval(fT);fT=setInterval(()=>{fLeft--;setStats();if(fLeft<=0)stopFire();},1000);
}
function stopFire(silent){
  if(!fireOn)return;
  fireOn=false;clearInterval(fT);clearTimeout(fNext);
  if(silent){fLeft=ROUND;fScore=0;fStreak=0;fireIdle();return;}
  if(fScore>S.best){S.best=fScore;save();}
  setStats();
  fStage.innerHTML=`<div class="task">Round over: ${fScore} points</div><p class="note" style="margin:0">${fScore>=S.best&&fScore>0?'That is your best score so far.':`Your best is ${S.best}.`}</p>
  ${fMiss.length?`<div><p class="explain" style="margin:0 0 8px"><b>Worth another look:</b></p><ul class="misses">${fMiss.map(q=>`<li><span>${q.c}</span><span>Answer: <b>${q.a}</b></span><span class="note">${q.why}</span></li>`).join('')}</ul></div>`:'<p class="explain" style="margin:0">No misses. Your loop is in good shape.</p>'}
  <div class="actions"><button class="btn" id="fStart">Play again</button></div>`;
}
fStage.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.act==='tab-quest')showTab('quest',true);
  else if(b.id==='fStart')startFire();
  else if(b.id==='fStop')stopFire();
  else if(b.dataset.i!==undefined)pick(+b.dataset.i);
});
document.addEventListener('keydown',e=>{
  if(!fireOn||$('#tab-fire').hidden)return;
  if(/^[1-4]$/.test(e.key)&&fQ&&+e.key<=fQ.opts.length){e.preventDefault();pick(+e.key-1);}
});

function renderGuide(){
  const g=$('#guide');g.dataset.ready='1';
  g.innerHTML=`<div><h2>Field guide</h2><p class="lede">A quick reference for the lines and words the missions teach. The examples are for reading; type your own lines in the prompt form on the Quest tab.</p></div>
  ${CH.map((c,ci)=>{const items=GUIDE.filter(x=>x.ch===ci);return items.length?`<section class="gsec"><h3>Chapter ${ci+1}: ${esc(c.name)}</h3><div class="cards">${items.map(x=>`<article class="card panel"><h4>${esc(x.c)}</h4><p>${x.what}</p><div class="ex">${x.ex.map(([t,note])=>`<div class="exrow"><div class="excode">${esc(t)}</div>${note?`<small>${note}</small>`:''}</div>`).join('')}</div></article>`).join('')}</div></section>`:'';}).join('')}
  <section class="gsec"><h3>About this quest</h3><div class="panel" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px"><p class="explain">Nothing here calls a real model or the network. A pretend agent follows a fixed script and your lines decide what it may do, so the same lines always give the same run. Real agents read ordinary sentences and their config files are richer than the ones used here.</p>
   <div class="actions"><button class="linkbtn" id="resetProgress">Reset all progress</button></div></div></section>`;
}
let armProg=0;
$('#guide').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.id!=='resetProgress')return;
  if(!b.classList.contains('armed')){
    b.classList.add('armed');b.textContent='Click again to erase your XP and finished missions';
    clearTimeout(armProg);armProg=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset all progress';},4000);
    return;
  }
  S=state.fresh();write();renderXP();showTab('quest',true);gotoMission(0,0);
});

function renderFooter(){
  const o=AQ.facts.oldest(FACTS);
  if(!o)return;
  const stale=AQ.facts.stale(FACTS,Date.now());
  $('#aqFoot').innerHTML=`<span>Facts about real agent tools were last checked on ${esc(o.checked)}.${stale?' <span class="stale">That was over '+AQ.facts.STALE_DAYS+' days ago, so some of it may be out of date.</span>':''}</span>
  <span>${FACTS.map(f=>`<a href="${esc(f.docUrl)}" target="_blank" rel="noopener noreferrer">${esc(f.id)}</a>`).join(' · ')}</span>`;
}

setPane('mission');renderXP();renderChapters();renderMission();startSession();showTab(S.tab);renderFooter();
})();
