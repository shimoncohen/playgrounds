/* Network Quest app: state and saving, chapters and the mission card, the mission session (a fresh simulated network,
   the terminal, the packet inspector and the map), XP and ranks, quick-fire and the field guide. Missions are checked
   by replaying the session's lines on a fresh network (NQ.runMission), so the check never depends on UI state. */
(()=>{
'use strict';
const {CH,RANKS,QF,GUIDE,ASK,KINDS}=NQ;
const XP=NQ.XP||10;
const KEY=window.PROGRESS.key;
const $=s=>document.querySelector(s);
const esc=NQUI.esc;
const TABS=['quest','fire','guide'];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const isObj=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const isKey=k=>{const m=/^(\d+)\.(\d+)$/.exec(k);return !!m&&+m[1]<CH.length&&+m[2]<CH[+m[1]].missions.length;};
const validDone=d=>Object.keys(d).filter(k=>d[k]===true&&isKey(k));

/* ---------- state ---------- */
function fresh(){return {ch:0,mi:0,done:{},xp:0,best:0,tab:'quest',answers:{}};}
/* every field falls back on its own, so one bad value never costs the rest of a save */
function load(raw){
  const S=fresh();let o=null;
  try{o=JSON.parse(raw);}catch(e){return S;}
  if(!isObj(o))return S;
  if(isObj(o.done))for(const k of Object.keys(o.done))if(o.done[k]===true)S.done[k]=true;
  S.xp=typeof o.xp==='number'&&Number.isFinite(o.xp)&&o.xp>=0?o.xp:XP*validDone(S.done).length;
  S.best=typeof o.best==='number'&&Number.isFinite(o.best)&&o.best>=0?o.best:0;
  if(Number.isInteger(o.ch)&&o.ch>=0&&o.ch<CH.length){S.ch=o.ch;if(Number.isInteger(o.mi)&&o.mi>=0&&o.mi<=CH[o.ch].missions.length)S.mi=o.mi;}
  if(TABS.includes(o.tab))S.tab=o.tab;
  if(isObj(o.answers))for(const k of Object.keys(o.answers))if(typeof o.answers[k]==='string'&&isKey(k))S.answers[k]=o.answers[k].slice(0,200);
  return S;
}
let S=fresh();
try{const raw=localStorage.getItem(KEY);if(raw!==null)S=load(raw);}catch(e){}
let saveT=0,pending=false;
const write=()=>{pending=false;try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}};
function save(){pending=true;clearTimeout(saveT);saveT=setTimeout(write,200);}
addEventListener('pagehide',()=>{if(pending){clearTimeout(saveT);write();}});

const mkey=()=>S.ch+'.'+S.mi;
const curMission=()=>CH[S.ch].missions[S.mi]||null;
const totalDone=ci=>CH[ci].missions.filter((_,i)=>S.done[ci+'.'+i]).length;
const chapterDone=ci=>totalDone(ci)===CH[ci].missions.length;

const missionEl=$('#mission'),chaptersEl=$('#chapters'),fbEl=$('#feedback'),cmdIn=$('#cmd');
const askBox=$('#answerBox'),askText=$('#askText'),askIn=$('#answer'),afb=$('#afb');

/* ---------- mission session ---------- */
/* a session is one go at a mission: a fresh network, an empty terminal, inspector and history. ran: anything typed
   yet (no nagging before that); won: this session already completed the mission (never celebrate it twice). */
let net=null,dev=null,lines=[],groups=[],ran=false,won=false,asking=false,selEntry=null;
const term=NQUI.terminal({screen:$('#screen'),input:cmdIn,form:$('#cmdline'),prompt:$('#prompt'),onRun:runLine});
const insp=NQUI.inspector({list:$('#inspector'),detail:$('#pdetail'),onSelect:e=>{selEntry=e;drawMap();}});
const drawMap=()=>{if(net)NQUI.diagram($('#diagram'),net,selEntry?{dev:selEntry.dev,iface:selEntry.iface}:null,dev);};
// the network a session runs on: the mission's own, or on a chapter's finish page the last mission's, to play in
const sessionMission=()=>curMission()||CH[S.ch].missions[CH[S.ch].missions.length-1];
function startSession(){
  const m=sessionMission();
  net=NQ.createNet(m.scenario,m.setup);dev=m.dev||net.me;
  lines=[];groups=[];ran=false;won=false;asking=false;selEntry=null;
  term.reset();term.setPrompt(dev+':~$');
  term.print(`You are on ${dev}. Type help to see the commands you can use.`,'sys');
  insp.reset();drawMap();renderFeedback(null);renderAsk();
}
function runLine(line){
  term.echo(line);
  if(!line.trim())return;
  let r;
  try{r=net.exec(line,dev);}catch(e){r={out:[],err:['Something went wrong inside the simulator. Press Reset scenario to start this network again.'],code:1,entries:[]};}
  for(const l of r.out)term.print(l);
  for(const l of r.err)term.print(l,'err');
  lines.push(line);ran=true;
  if(r.entries.length){groups.push({line,entries:r.entries});insp.update(groups);}
  drawMap();evaluate(r.code);save();
}
function evaluate(code,answer){
  const m=curMission();if(!m)return;
  let r;try{r=NQ.runMission(m,lines,answer??null);}catch(e){r=null;}
  if(code!==0){if(typeof r==='string'&&r!==ASK&&!won)renderFeedback({tip:r});return;}
  if(r===true){complete(answer!==undefined);return;}
  if(won)return;
  if(answer!==undefined){afb.className='afb bad';afb.innerHTML=r===ASK?'Type your answer in the box first.':typeof r==='string'?r:'';return;}
  asking=r===ASK;renderAsk();
  renderFeedback(r===ASK?{ask:true}:typeof r==='string'?{tip:r}:null);
}
function complete(fromAnswer){
  if(won)return;won=true;
  const k=mkey(),first=!S.done[k],hadBadge=chapterDone(S.ch);
  let badge=false;
  if(first){S.done[k]=true;S.xp+=XP;badge=!hadBadge&&chapterDone(S.ch);pop=true;save();}
  const info={win:true,first,badge};
  renderFeedback(info);
  if(asking||fromAnswer){afb.className='afb good';afb.innerHTML=`<span>${first?'Correct! +'+XP+' XP':'Correct again!'}</span> ${nextBtn()}`;}
  renderChapters();renderMission();renderXP();
}
const nextBtn=()=>`<button type="button" class="btn" data-act="next">${S.mi>=CH[S.ch].missions.length-1?'Finish the chapter':'Next mission'} →</button>`;
const WINS=['Open a few more packets in the panel: every one of them is the real thing, field by field.','Nice. Every network tool you will ever use is built on packets like these.','That is how the pros check a network: send something, then read what happened.','Clean. You are reading the network like a map now.'];
function renderFeedback(f){
  if(!f){fbEl.innerHTML='';return;}
  if(f.win){fbEl.innerHTML=`<div class="msg win"><span class="h">${f.first?'Mission complete! +'+XP+' XP':'Mission complete (you had already earned this one)'}${f.badge?' · Badge earned: '+esc(CH[S.ch].badge):''}</span><p>${WINS[(S.ch*7+S.mi)%WINS.length]}</p><div class="actions">${nextBtn()}<button type="button" class="btn ghost narrow-only" data-act="pkts">See the packets</button></div></div>`;return;}
  if(!ran)return;
  if(f.ask){fbEl.innerHTML=`<div class="msg tip"><span class="h">Good, the packets are in</span><p>Now answer the question in the box above the packet list.</p><button type="button" class="btn ghost" data-act="ask">Go to the question</button></div>`;return;}
  fbEl.innerHTML=`<div class="msg tip"><span class="h">Not quite yet</span><p>${f.tip}</p></div>`;
}
function renderAsk(){
  const m=curMission(),show=!!(m&&m.question&&(asking||won&&askBox.dataset.k===mkey()));
  if(!show){askBox.hidden=true;askBox.dataset.k='';afb.textContent='';afb.className='afb';askIn.value='';return;}
  if(askBox.hidden){askText.innerHTML=m.question.ask;askIn.value=S.answers[mkey()]||'';afb.textContent='';afb.className='afb';askBox.dataset.k=mkey();askBox.hidden=false;}
}
askBox.addEventListener('submit',e=>{
  e.preventDefault();const m=curMission();if(!m||!m.question)return;
  const a=askIn.value;
  if(!a.trim()){afb.className='afb bad';afb.textContent='Type your answer in the box first.';return;}
  if(S.answers[mkey()]!==a){S.answers[mkey()]=a.slice(0,200);save();}
  if(won){afb.className='afb good';afb.innerHTML=`<span>You already solved this one.</span> ${nextBtn()}`;return;}
  evaluate(0,a);
});
const onAct=e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='next'){setView('term');gotoMission(S.ch,S.mi+1,true);}
  else if(a==='pkts'){setView('pkts');const t=$('#inspector [tabindex="0"]');if(t)t.focus();else $('#pktPanel').scrollIntoView({block:'nearest'});}
  else if(a==='ask'){setView('pkts');askIn.focus();askBox.scrollIntoView({block:'nearest'});}};
fbEl.addEventListener('click',onAct);afb.addEventListener('click',onAct);
$('#resetNet').addEventListener('click',()=>{startSession();cmdIn.focus();});

/* ---------- narrow screens: one panel at a time ---------- */
const VIEWS=['term','pkts','map'];
function setView(v){if(!VIEWS.includes(v))v='term';$('.quest').dataset.view=v;document.querySelectorAll('.seg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===v)));}
$('.seg').addEventListener('click',e=>{const b=e.target.closest('button[data-view]');if(b)setView(b.dataset.view);});

/* ---------- chapters and the mission card ---------- */
let pop=false;
const mq=q=>{try{return !!(window.matchMedia&&matchMedia(q).matches);}catch(e){return false;}};
const wide=()=>mq('(min-width:820px)'),reduced=()=>mq('(prefers-reduced-motion: reduce)');
function anatomy(t){if(!t||!t.length)return '';return `<div class="anat" aria-label="Parts of the command">${t.map(([s,k,l])=>`<div class="tok k-${esc(k)}"><b>${esc(s)}</b><span>${esc(l||KINDS[k]||k)}</span></div>`).join('')}</div>`;}
function renderChapters(){chaptersEl.innerHTML=CH.map((c,i)=>{const all=chapterDone(i);return `<button class="chap${all?' earned':''}" data-ch="${i}" aria-current="${i===S.ch}"><span class="num">${all?'★':i+1}</span><span class="nm">${esc(c.name)}${all?'<span class="sr"> (badge earned: '+esc(c.badge)+')</span>':''}</span><span class="ct">${totalDone(i)}/${c.missions.length}</span></button>`;}).join('');}
function renderMission(){
  const ch=CH[S.ch],n=ch.missions.length;
  const dots=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((m,i)=>`<button class="dot${S.done[S.ch+'.'+i]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(m.title)}" aria-label="Mission ${i+1}: ${esc(m.title)}${S.done[S.ch+'.'+i]?' (done)':''}"${i===S.mi?' aria-current="step"':''}>${i+1}</button>`).join('')}</div>`;
  let h;
  if(S.mi>=n){const all=chapterDone(S.ch),last=S.ch===CH.length-1;
    h=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art${all?'':' dim'}" aria-hidden="true">${all?'★':S.ch+1}</div>
    <h2>${all?'Badge earned: '+esc(ch.badge):'Chapter finished'}</h2>
    <p class="explain">${all?'Every mission in this chapter is done. ':'A few missions are still open: the dots below show which. '}You can now use these on a real network:</p>
    <div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
    <p class="note">The terminal is still live, so keep poking at this network as long as you like.</p>
    ${last?`<p class="note">That is every chapter there is for now. Play Quick-fire to keep the facts fresh, or browse the field guide.</p><div class="actions"><button class="btn" data-act="tab-fire">Play Quick-fire</button><button class="btn ghost" data-act="tab-guide">Open the field guide</button></div>`
      :`<div class="actions"><button class="btn" data-act="nextch">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button></div>`}${dots}`;}
  else{const m=ch.missions[S.mi];
    h=`<div class="eyebrow">Chapter ${S.ch+1} · Mission ${S.mi+1} of ${n}${S.done[mkey()]?' · done ✓':''}</div>
    <h2>${esc(m.title)}</h2>
    <div class="goal"><div class="label">Your goal</div><p>${m.goal}</p></div>
    <button type="button" class="btn ghost narrow-only" data-act="toterm">Open the terminal ↓</button>
    ${anatomy(m.anat)}
    ${HowSteps.html(m.how)}
    <p class="explain">${m.explain}</p>
    ${m.note?`<p class="note">${m.note}</p>`:''}
    <details class="hint"><summary>Show a hint</summary><p>${m.hint}</p></details>
    <div class="actions"><button class="btn ghost" data-act="fill">Type it for me</button></div>
    <details class="about"${S.mi===0&&!S.done[mkey()]&&wide()?' open':''}><summary>About this chapter</summary><p class="intro">${ch.intro}</p></details>${dots}`;}
  missionEl.innerHTML=h;
  if(pop){missionEl.classList.remove('pop');void missionEl.offsetWidth;missionEl.classList.add('pop');pop=false;}
}
missionEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mi!==undefined){gotoMission(S.ch,+b.dataset.mi);const d=missionEl.querySelector(`[data-mi="${S.mi}"]`);if(d)d.focus({preventScroll:true});return;}
  const a=b.dataset.act;
  if(a==='toterm'){setView('term');$('#termPanel').scrollIntoView({block:'start',behavior:reduced()?'auto':'smooth'});cmdIn.focus({preventScroll:true});}
  else if(a==='fill'){const m=curMission();if(!m)return;const ans=m.answer||[];term.fill(ans.find(x=>!lines.includes(x))||ans[ans.length-1]||'');setView('term');}
  else if(a==='nextch')gotoMission(S.ch+1,0);
  else if(a&&a.startsWith('tab-'))showTab(a.slice(4),true);});
chaptersEl.addEventListener('click',e=>{const b=e.target.closest('.chap');if(!b)return;const ci=+b.dataset.ch;let mi=CH[ci].missions.findIndex((_,i)=>!S.done[ci+'.'+i]);if(mi<0)mi=0;gotoMission(ci,mi);const c=chaptersEl.querySelector(`[data-ch="${ci}"]`);if(c)c.focus({preventScroll:true});});
function gotoMission(ci,mi,focusCmd){
  if(!CH[ci])return;
  S.ch=ci;S.mi=Math.max(0,Math.min(mi,CH[ci].missions.length));save();
  renderChapters();renderMission();startSession();
  if(innerWidth<820)missionEl.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});
  if(focusCmd)cmdIn.focus({preventScroll:innerWidth<820});
}

/* ---------- XP ---------- */
function renderXP(){let i=0;while(i+1<RANKS.length&&S.xp>=RANKS[i+1][0])i++;const lo=RANKS[i][0],hi=i+1<RANKS.length?RANKS[i+1][0]:lo;
  $('#rank').textContent=RANKS[i][1];$('#xpText').textContent=S.xp+' XP';$('#xpFill').style.width=(hi>lo?Math.min(100,(S.xp-lo)/(hi-lo)*100):100)+'%';}

/* ---------- tabs ---------- */
function showTab(t,user){if(!TABS.includes(t))t='quest';if(user&&S.tab!==t){S.tab=t;save();}else S.tab=t;
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  TABS.forEach(x=>{$('#tab-'+x).hidden=x!==t;});
  if(t!=='fire')stopFire(true);if(t==='guide'&&!$('#guide').dataset.ready)renderGuide();if(t==='fire'&&!fireOn)fireIdle();}
$('.tabs').addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(b)showTab(b.dataset.tab,true);});
$('.tabs').addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const bs=[...document.querySelectorAll('.tabs button[data-tab]')];let i=bs.findIndex(b=>b.getAttribute('aria-selected')==='true');i=(i+(e.key==='ArrowRight'?1:bs.length-1))%bs.length;showTab(bs[i].dataset.tab,true);bs[i].focus();});

/* ---------- quick-fire (no XP: ranks come from missions) ---------- */
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
  fStage.innerHTML=`<div class="task">${fQ.c}</div><div class="opts">${fQ.opts.map((o,i)=>`<button class="opt" data-i="${i}"><span class="n">${i+1}</span><span class="ot">${esc(o)}</span></button>`).join('')}</div>
  <p class="fb" id="fFb" aria-live="polite"></p><div class="actions"><button class="btn ghost" id="fStop">End round</button></div>`;fStage.querySelector('.opt').focus({preventScroll:true});}
function pick(i){if(!fireOn||fLocked||!fQ)return;fLocked=true;const ok=fQ.opts[i]===fQ.a;const bs=[...fStage.querySelectorAll('.opt')];
  bs.forEach((b,j)=>{b.disabled=true;if(fQ.opts[j]===fQ.a)b.classList.add('right');else if(j===i)b.classList.add('wrong');});const fb=$('#fFb');
  if(ok){fStreak++;const pts=10+Math.min(fStreak-1,5)*2;fScore+=pts;fb.className='fb good';fb.textContent=`Correct! +${pts}${fStreak>1?` (streak ${fStreak})`:''}`;}
  else{fStreak=0;fMiss.push(fQ);fb.className='fb bad';fb.textContent='Not this time. The answer is “'+fQ.a+'”. '+fQ.why;}
  setStats();clearTimeout(fNext);fNext=setTimeout(()=>{if(fireOn)nextQ();},ok?700:2600);}
function startFire(){if(!qfPool().length){fireIdle();return;}fDeck=[];fireOn=true;fLeft=ROUND;fScore=0;fStreak=0;fMiss=[];setStats();nextQ();clearInterval(fT);fT=setInterval(()=>{fLeft--;setStats();if(fLeft<=0)stopFire();},1000);}
function stopFire(silent){if(!fireOn)return;fireOn=false;clearInterval(fT);clearTimeout(fNext);if(silent){fLeft=ROUND;fScore=0;fStreak=0;fireIdle();return;}if(fScore>S.best){S.best=fScore;save();}setStats();
  fStage.innerHTML=`<div class="task">Round over: ${fScore} points</div><p class="note" style="margin:0">${fScore>=S.best&&fScore>0?'That is your best score so far.':`Your best is ${S.best}.`}</p>
  ${fMiss.length?`<div><p class="explain" style="margin:0 0 8px"><b>Worth another look:</b></p><ul class="misses">${fMiss.map(q=>`<li><span>${q.c}</span><span>Answer: <b>${esc(q.a)}</b></span><span class="note">${esc(q.why)}</span></li>`).join('')}</ul></div>`:'<p class="explain" style="margin:0">No misses. Your packets are in order.</p>'}
  <div class="actions"><button class="btn" id="fStart">Play again</button></div>`;}
fStage.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.act==='tab-quest')showTab('quest',true);else if(b.id==='fStart')startFire();else if(b.id==='fStop')stopFire();else if(b.dataset.i!==undefined)pick(+b.dataset.i);});
document.addEventListener('keydown',e=>{if(!fireOn||$('#tab-fire').hidden)return;if(/^[1-4]$/.test(e.key)&&fQ&&+e.key<=fQ.opts.length){e.preventDefault();pick(+e.key-1);}});

/* ---------- field guide ---------- */
function renderGuide(){const g=$('#guide');g.dataset.ready='1';
  g.innerHTML=`<div><h2>Field guide</h2><p class="lede">A quick reference for the commands and words the missions teach. Click a command to put it in the terminal, then press <kbd>Enter</kbd> to run it.</p></div>
  <section class="gsec"><h3>Reading the packet panel</h3><p class="note" style="margin:0 0 8px">You meet <code>tx</code> and <code>rx</code> in your first mission; the other words are reference for later chapters.</p><div class="panel" style="padding:6px 10px;overflow-x:auto"><table class="gtable"><thead><tr><th>Word</th><th>What happened to the packet</th></tr></thead><tbody>
  <tr><td><b>sent</b> <code>tx</code></td><td>a device put it on the wire</td></tr><tr><td><b>received</b> <code>rx</code></td><td>it arrived at a device, which read it</td></tr><tr><td><b>forwarded</b> <code>fwd</code></td><td>a switch or router passed it on towards where it is going (later chapters)</td></tr><tr><td><b>dropped</b> <code>drop</code></td><td>a device threw it away; the note says why (later chapters)</td></tr><tr><td><b>translated</b> <code>nat</code></td><td>a router rewrote its addresses on the way through (later chapters)</td></tr></tbody></table></div></section>
  ${CH.map((c,ci)=>{const items=GUIDE.filter(x=>x.ch===ci);return items.length?`<section class="gsec"><h3>Chapter ${ci+1}: ${esc(c.name)}</h3><div class="cards">${items.map(x=>`<article class="card panel"><h4>${esc(x.c)}</h4><p>${x.what}</p>${anatomy(x.syn)}<div class="ex">${x.ex.map(([cmd,note])=>`<div class="exrow"><button class="excmd" data-cmd="${esc(cmd)}" title="Put this in the terminal"><code>${esc(cmd)}</code><span class="try">Try it</span></button>${note?`<small>${note}</small>`:''}</div>`).join('')}</div></article>`).join('')}</div></section>`:'';}).join('')}
  <section class="gsec"><h3>On a real computer</h3><div class="panel" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px"><p class="explain">Reference for later, when more commands arrive. Most commands in this quest work in a real Linux terminal (<code>arping</code> may need installing first); <code>ping</code> works on a Mac too, and the <code>ip</code> command is Linux only. On Windows, open PowerShell and try <code>ping</code> and <code>arp -a</code>. Only ever test networks that are yours, or that you are allowed to test.</p>
   <div class="actions"><button class="linkbtn" id="resetProgress">Reset all progress</button></div></div></section>`;}
let armProg=0;
$('#guide').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.cmd!==undefined){showTab('quest',true);setView('term');term.fill(b.dataset.cmd);return;}
  if(b.id==='resetProgress'){if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to erase your XP and finished missions';clearTimeout(armProg);armProg=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset all progress';},4000);return;}
    S=fresh();save();renderXP();showTab('quest',true);gotoMission(0,0);}});

/* ---------- boot (reads the save, never writes it) ---------- */
setView('term');renderXP();renderChapters();renderMission();startSession();showTab(S.tab);
})();
