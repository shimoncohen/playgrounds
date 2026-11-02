/* A mission is checked by running the editor's code through RQ.evalMission, so the check never depends on UI state.
   Unlike the other quests this app writes the validated state once on boot, so a tampered save is replaced. */
(()=>{
'use strict';
const {CH,RANKS,QF,GUIDE,state}=RQ;
const XP=RQ.XP;
const KEY=window.PROGRESS.key;
const $=s=>document.querySelector(s);
const esc=RQUI.esc,tick=RQUI.tick;
const TABS=state.TABS;

let S=state.fresh();
try{const raw=localStorage.getItem(KEY);if(raw!==null)S=state.load(raw,CH);}catch(e){}
let saveT=0,pending=false;
const write=()=>{pending=false;try{localStorage.setItem(KEY,state.serialize(S));}catch(e){}};
function save(){pending=true;clearTimeout(saveT);saveT=setTimeout(write,200);}
addEventListener('pagehide',()=>{if(pending){clearTimeout(saveT);write();}});
write();

const mkey=()=>S.ch+'.'+S.mi;
const curMission=()=>CH[S.ch].missions[S.mi]||null;
// on a chapter's finish page the editor stays on the last mission, to play in
const sessionIndex=()=>Math.min(S.mi,CH[S.ch].missions.length-1);
const sessionMission=()=>CH[S.ch].missions[sessionIndex()];
const codeKey=()=>S.ch+'.'+sessionIndex();
const totalDone=ci=>CH[ci].missions.filter((_,i)=>S.done[ci+'.'+i]).length;
const chapterDone=ci=>totalDone(ci)===CH[ci].missions.length;

const missionEl=$('#mission'),chaptersEl=$('#chapters'),fbEl=$('#feedback'),resultEl=$('#result'),ta=$('#code');
ta.maxLength=state.CAP;
RQUI.editor({ta,keys:$('#keys'),onRun:run});

let won=false,ran=false;
function loadCode(){
  const m=sessionMission(),saved=S.codes[codeKey()];
  ta.value=saved!==undefined?saved:m.starter;
}
ta.addEventListener('input',()=>{S.codes[codeKey()]=ta.value.slice(0,state.CAP);save();});
function startSession(message){
  won=false;ran=false;loadCode();
  resultEl.textContent='';const p=document.createElement('p');p.className='note';p.textContent=message||'Press Run to see what your program prints, or what the compiler says.';resultEl.append(p);
  renderFeedback(null);
}
function run(){
  const m=sessionMission(),ev=RQ.evalMission(m,ta.value);
  ran=true;
  RQUI.result(resultEl,ev);
  if(!curMission())return;
  if(ev.result===true)complete();
  else renderFeedback(ev.c&&ev.c.status==='ok'?{tip:ev.result}:null);
}
$('#bRun').addEventListener('click',run);
$('#bReset').addEventListener('click',()=>{S.codes[codeKey()]=sessionMission().starter;save();startSession('Back to the starter code.');});
async function copyText(t){
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(t);return true;}}catch(e){}
  try{ta.focus();ta.select();return document.execCommand('copy');}catch(e){return false;}
}
async function doCopy(btn){
  const ok=await copyText(ta.value),old=btn.textContent;
  btn.textContent=ok?'Copied':'Select the code and copy it';
  setTimeout(()=>{btn.textContent=old;},1800);
}
$('#bCopy').addEventListener('click',e=>doCopy(e.currentTarget));
resultEl.addEventListener('click',e=>{const b=e.target.closest('[data-act="copy"]');if(b)doCopy(b);});

let pop=false;
function complete(){
  if(won){renderFeedback({win:true,first:false,badge:false});return;}
  won=true;
  const k=mkey(),first=!S.done[k],hadBadge=chapterDone(S.ch);
  let badge=false;
  if(first){S.done[k]=true;S.xp+=XP;badge=!hadBadge&&chapterDone(S.ch);pop=true;save();}
  renderFeedback({win:true,first,badge});
  renderChapters();renderMission();renderXP();
}
const nextBtn=()=>`<button type="button" class="btn" data-act="next">${S.mi>=CH[S.ch].missions.length-1?'Finish the chapter':'Next mission'} →</button>`;
const WINS=['Your program printed exactly what the mission asked for.','The compiler would accept that, and it does what the goal says.','That is a working Rust program.'];
function renderFeedback(f){
  if(!f){fbEl.innerHTML='';return;}
  if(f.win){fbEl.innerHTML=`<div class="msg win"><span class="h">${f.first?'Mission complete! +'+XP+' XP':'Mission complete (you had already earned this one)'}${f.badge?' · Badge earned: '+esc(CH[S.ch].badge):''}</span><p>${WINS[(S.ch*7+S.mi)%WINS.length]}</p><div class="actions">${nextBtn()}</div></div>`;return;}
  if(!ran)return;
  fbEl.innerHTML=`<div class="msg tip"><span class="h">Not quite yet</span><p>${tick(f.tip)}</p></div>`;
}
fbEl.addEventListener('click',e=>{const b=e.target.closest('[data-act="next"]');if(b)gotoMission(S.ch,S.mi+1,true);});

const mq=q=>{try{return !!(window.matchMedia&&matchMedia(q).matches);}catch(e){return false;}};
const wide=()=>mq('(min-width:820px)'),reduced=()=>mq('(prefers-reduced-motion: reduce)');
function renderChapters(){chaptersEl.innerHTML=CH.map((c,i)=>{const all=chapterDone(i);return `<button class="chap${all?' earned':''}" data-ch="${i}" aria-current="${i===S.ch}"><span class="num">${all?'★':i+1}</span><span class="nm">${esc(c.name)}${all?'<span class="sr"> (badge earned: '+esc(c.badge)+')</span>':''}</span><span class="ct">${totalDone(i)}/${c.missions.length}</span></button>`;}).join('');}
function renderMission(){
  const ch=CH[S.ch],n=ch.missions.length;
  const dots=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((m,i)=>`<button class="dot${S.done[S.ch+'.'+i]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(m.title)}" aria-label="Mission ${i+1}: ${esc(m.title)}${S.done[S.ch+'.'+i]?' (done)':''}"${i===S.mi?' aria-current="step"':''}>${i+1}</button>`).join('')}</div>`;
  let h;
  if(S.mi>=n){const all=chapterDone(S.ch),last=S.ch===CH.length-1;
    h=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art${all?'':' dim'}" aria-hidden="true">${all?'★':S.ch+1}</div>
    <h2>${all?'Badge earned: '+esc(ch.badge):'Chapter finished'}</h2>
    <p class="explain">${all?'Every mission in this chapter is done. ':'A few missions are still open: the dots below show which. '}You can now use these in a real Rust program:</p>
    <div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
    <p class="note">The editor is still live, so keep trying things as long as you like.</p>
    ${last?`<p class="note">That is every chapter there is for now. Play Quick-fire to keep the facts fresh, or browse the field guide.</p><div class="actions"><button class="btn" data-act="tab-fire">Play Quick-fire</button><button class="btn ghost" data-act="tab-guide">Open the field guide</button></div>`
      :`<div class="actions"><button class="btn" data-act="nextch">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button></div>`}${dots}`;}
  else{const m=ch.missions[S.mi];
    h=`<div class="eyebrow">Chapter ${S.ch+1} · Mission ${S.mi+1} of ${n}${S.done[mkey()]?' · done ✓':''}</div>
    <h2>${esc(m.title)}</h2>
    <div class="goal"><div class="label">Your goal</div><p>${m.goal}</p></div>
    ${HowSteps.html(m.how)}
    <p class="explain">${m.explain}</p>
    <p class="note">${ch.toolbox}</p>
    <details class="hint"><summary>Show a hint</summary><p>${m.hint}</p></details>
    <div class="actions"><button class="btn ghost" data-act="fill">Type it for me</button></div>
    <details class="about"${S.mi===0&&!S.done[mkey()]&&wide()?' open':''}><summary>About this chapter</summary><p class="intro">${ch.intro}</p></details>${dots}`;}
  missionEl.innerHTML=h;
  if(pop){missionEl.classList.remove('pop');void missionEl.offsetWidth;missionEl.classList.add('pop');pop=false;}
}
missionEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mi!==undefined){gotoMission(S.ch,+b.dataset.mi);const d=missionEl.querySelector(`[data-mi="${S.mi}"]`);if(d)d.focus({preventScroll:true});return;}
  const a=b.dataset.act;
  if(a==='fill'){const m=curMission();if(!m)return;ta.value=m.answer;S.codes[codeKey()]=ta.value;save();ta.focus({preventScroll:true});}
  else if(a==='nextch')gotoMission(S.ch+1,0);
  else if(a&&a.startsWith('tab-'))showTab(a.slice(4),true);});
chaptersEl.addEventListener('click',e=>{const b=e.target.closest('.chap');if(!b)return;const ci=+b.dataset.ch;let mi=CH[ci].missions.findIndex((_,i)=>!S.done[ci+'.'+i]);if(mi<0)mi=0;gotoMission(ci,mi);const c=chaptersEl.querySelector(`[data-ch="${ci}"]`);if(c)c.focus({preventScroll:true});});
function gotoMission(ci,mi,focusCode){
  if(!CH[ci])return;
  S.ch=ci;S.mi=Math.max(0,Math.min(mi,CH[ci].missions.length));save();
  renderChapters();renderMission();startSession();
  if(innerWidth<820)missionEl.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});
  if(focusCode)ta.focus({preventScroll:innerWidth<820});
}

function renderXP(){let i=0;while(i+1<RANKS.length&&S.xp>=RANKS[i+1][0])i++;const lo=RANKS[i][0],hi=i+1<RANKS.length?RANKS[i+1][0]:lo;
  $('#rank').textContent=RANKS[i][1];$('#xpText').textContent=S.xp+' XP';$('#xpFill').style.width=(hi>lo?Math.min(100,(S.xp-lo)/(hi-lo)*100):100)+'%';}

function showTab(t,user){if(!TABS.includes(t))t='quest';if(user&&S.tab!==t){S.tab=t;save();}else S.tab=t;
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  TABS.forEach(x=>{$('#tab-'+x).hidden=x!==t;});
  if(t!=='fire')stopFire(true);if(t==='guide'&&!$('#guide').dataset.ready)renderGuide();if(t==='fire'&&!fireOn)fireIdle();}
$('.tabs').addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(b)showTab(b.dataset.tab,true);});
$('.tabs').addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const bs=[...document.querySelectorAll('.tabs button[data-tab]')];let i=bs.findIndex(b=>b.getAttribute('aria-selected')==='true');i=(i+(e.key==='ArrowRight'?1:bs.length-1))%bs.length;showTab(bs[i].dataset.tab,true);bs[i].focus();});

// quick-fire gives no XP: ranks come from missions
const ROUND=75,fStage=$('#fStage');let fireOn=false,fT=0,fLeft=ROUND,fScore=0,fStreak=0,fQ=null,fDeck=[],fMiss=[],fLocked=false,fNext=0;
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
function setStats(){$('#fScore').textContent=fScore;$('#fStreak').textContent=fStreak;$('#fBest').textContent=S.best;$('#fTime').textContent=fLeft;$('#fTimer').style.width=(fLeft/ROUND*100)+'%';}
// a question is in the pool once every mission of its chapter is done, so nothing is asked before it was taught
const qfPool=()=>QF.filter(q=>chapterDone(q.ch|0));
function fireLocked(){const open=CH.map((c,i)=>i).filter(i=>!chapterDone(i)&&QF.some(q=>(q.ch|0)===i));
  return `<p class="explain">Quick-fire asks about things the missions have taught, so it opens once you finish them. ${open.length?'Finish '+open.map(i=>`<b>Chapter ${i+1}: ${esc(CH[i].name)}</b> (${totalDone(i)} of ${CH[i].missions.length} missions done)`).join(' and ')+' first.':''}</p>
  <div class="actions"><button class="btn" data-act="tab-quest">Back to the missions</button></div>`;}
function fireIdle(){if(!qfPool().length){fStage.innerHTML=fireLocked();setStats();return;}
  fStage.innerHTML=`<p class="explain">You will get one question at a time with four answers. Pick fast: the clock runs for ${ROUND} seconds, and every correct answer in a row adds a streak bonus. Your best score is kept, and nothing here changes your XP.</p>
  <div class="actions"><button class="btn" id="fStart">Start the clock</button><span class="note" style="align-self:center">Keys <kbd>1</kbd>–<kbd>4</kbd> pick an answer.</span></div>`;setStats();}
function nextQ(){const pool=qfPool();if(!fDeck.length)fDeck=shuffle(pool.map(q=>QF.indexOf(q)));fQ=QF[fDeck.pop()];
  fQ.opts=shuffle([fQ.a,...fQ.w.filter(w=>w!==fQ.a).slice(0,3)]);fLocked=false;
  fStage.innerHTML=`<div class="task">${fQ.c}</div><div class="opts">${fQ.opts.map((o,i)=>`<button class="opt" data-i="${i}"><span class="n">${i+1}</span><span class="ot">${tick(o)}</span></button>`).join('')}</div>
  <p class="fb" id="fFb" aria-live="polite"></p><div class="actions"><button class="btn ghost" id="fStop">End round</button></div>`;fStage.querySelector('.opt').focus({preventScroll:true});}
function pick(i){if(!fireOn||fLocked||!fQ)return;fLocked=true;const ok=fQ.opts[i]===fQ.a;const bs=[...fStage.querySelectorAll('.opt')];
  bs.forEach((b,j)=>{b.disabled=true;if(fQ.opts[j]===fQ.a)b.classList.add('right');else if(j===i)b.classList.add('wrong');});const fb=$('#fFb');
  if(ok){fStreak++;const pts=10+Math.min(fStreak-1,5)*2;fScore+=pts;fb.className='fb good';fb.textContent=`Correct! +${pts}${fStreak>1?` (streak ${fStreak})`:''}`;}
  else{fStreak=0;fMiss.push(fQ);fb.className='fb bad';fb.textContent='Not this time. The answer is “'+fQ.a.replace(/`/g,'')+'”. '+fQ.why.replace(/`/g,'');}
  setStats();clearTimeout(fNext);fNext=setTimeout(()=>{if(fireOn)nextQ();},ok?700:2600);}
function startFire(){if(!qfPool().length){fireIdle();return;}fDeck=[];fireOn=true;fLeft=ROUND;fScore=0;fStreak=0;fMiss=[];setStats();nextQ();clearInterval(fT);fT=setInterval(()=>{fLeft--;setStats();if(fLeft<=0)stopFire();},1000);}
function stopFire(silent){if(!fireOn)return;fireOn=false;clearInterval(fT);clearTimeout(fNext);if(silent){fLeft=ROUND;fScore=0;fStreak=0;fireIdle();return;}if(fScore>S.best){S.best=fScore;save();}setStats();
  fStage.innerHTML=`<div class="task">Round over: ${fScore} points</div><p class="note" style="margin:0">${fScore>=S.best&&fScore>0?'That is your best score so far.':`Your best is ${S.best}.`}</p>
  ${fMiss.length?`<div><p class="explain" style="margin:0 0 8px"><b>Worth another look:</b></p><ul class="misses">${fMiss.map(q=>`<li><span>${q.c}</span><span>Answer: <b>${tick(q.a)}</b></span><span class="note">${tick(q.why)}</span></li>`).join('')}</ul></div>`:'<p class="explain" style="margin:0">No misses. Your Rust is in good shape.</p>'}
  <div class="actions"><button class="btn" id="fStart">Play again</button></div>`;}
fStage.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.act==='tab-quest')showTab('quest',true);else if(b.id==='fStart')startFire();else if(b.id==='fStop')stopFire();else if(b.dataset.i!==undefined)pick(+b.dataset.i);});
document.addEventListener('keydown',e=>{if(!fireOn||$('#tab-fire').hidden)return;if(/^[1-4]$/.test(e.key)&&fQ&&+e.key<=fQ.opts.length){e.preventDefault();pick(+e.key-1);}});

function renderGuide(){const g=$('#guide');g.dataset.ready='1';
  g.innerHTML=`<div><h2>Field guide</h2><p class="lede">A quick reference for the words and error codes the missions teach. Copy an example, paste it into the editor and press <kbd>Run</kbd>.</p></div>
  ${CH.map((c,ci)=>{const items=GUIDE.filter(x=>x.ch===ci);return items.length?`<section class="gsec"><h3>Chapter ${ci+1}: ${esc(c.name)}</h3><div class="cards">${items.map(x=>`<article class="card panel"><h4>${esc(x.c)}</h4><p>${x.what}</p><div class="ex">${x.ex.map(([code,note],k)=>`<div class="exrow"><button class="excmd" data-ex="${GUIDE.indexOf(x)}.${k}" title="Copy this example"><pre>${esc(code)}</pre><span class="try">Copy</span></button>${note?`<small>${note}</small>`:''}</div>`).join('')}</div></article>`).join('')}</div></section>`:'';}).join('')}
  <section class="gsec"><h3>Your progress</h3><div class="panel" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px"><p class="explain">Your code is saved in this browser with the rest of your progress, and goes into the progress backup file too.</p>
   <div class="actions"><button class="linkbtn" id="resetProgress">Reset all progress</button></div></div></section>`;}
let armProg=0;
$('#guide').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.ex!==undefined){const [gi,k]=b.dataset.ex.split('.').map(Number);const ok=await copyText(GUIDE[gi].ex[k][0]);const t=b.querySelector('.try');t.textContent=ok?'Copied':'Select it and copy';setTimeout(()=>{t.textContent='Copy';},1800);return;}
  if(b.id==='resetProgress'){if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to erase your XP, finished missions and saved code';clearTimeout(armProg);armProg=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset all progress';},4000);return;}
    S=state.fresh();write();renderXP();showTab('quest',true);gotoMission(0,0);}});

const banner=$('#banner');
if(RQ.verified){banner.hidden=false;banner.textContent='Error codes and line numbers in this quest are checked against a real rustc ('+RQ.verified.rustc+', edition '+RQ.verified.edition+').';}
renderXP();renderChapters();renderMission();startSession();showTab(S.tab);
})();
