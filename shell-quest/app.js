(()=>{
const SQ=window.SQ;
const S=SQ.S;
const {HOME,README,SECRET,JOURNAL,PEOPLE,GOLD,LOGS,makeWorld,fresh,save,norm,getNode,disp,join,ensureDir,ensureFile,cmpName,sortedKeys,lines,CMDS,execLine,ctxFor}=SQ;

const CH=SQ.content.chapters,GUIDE=SQ.content.guide,QF=SQ.content.quickfire;
/* ---------- UI ---------- */
const $=s=>document.querySelector(s);
const screen=$('#screen'),cmdIn=$('#cmd'),promptEl=$('#prompt'),term=$('#term'),mapEl=$('#map'),missionEl=$('#mission'),chaptersEl=$('#chapters'),crumbsEl=$('#crumbs');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const renderText=t=>esc(t).replace(/\x01(\w)([\s\S]*?)\x02/g,'<span class="c-$1">$2</span>');
const promptHTML=cwd=>`<span class="p-user">explorer@basecamp</span>:<span class="p-path">${esc(disp(cwd))}</span><span class="p-sym">$</span> `;
const KIND={cmd:'command',opt:'option',arg:'argument',op:'operator',var:'variable',kw:'keyword'};
const anatomy=t=>t&&t.length?`<div class="anat" aria-label="Command anatomy">${t.map(([v,k])=>`<div class="tok k-${k}"><b>${esc(v)}</b><span>${KIND[k]}</span></div>`).join('')}</div>`:'';
const ICON_DIR='<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3h4.3l1.6 1.7h7.1v8.8h-13z"/></svg>';
const ICON_FILE='<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/></svg>';
let histIdx=S.hist.length,pop=false;

function addLine(html,cls){const d=document.createElement('div');d.className='line'+(cls?' '+cls:'');d.innerHTML=html;screen.appendChild(d)}
function scrollDown(){term.scrollTop=term.scrollHeight}
function totalDone(i){return CH[i].missions.filter((m,j)=>S.done[i+'.'+j]).length}


function checkMission(line){const ch=CH[S.ch];if(S.mi>=ch.missions.length)return;const m=ch.missions[S.mi];let good=false;
  try{good=!!m.check(ctxFor(line))}catch(e){}if(!good)return;
  const key=S.ch+'.'+S.mi,isNew=!S.done[key];S.done[key]=1;if(isNew)S.xp+=10;
  addLine(renderText(`✓ Mission complete: ${m.title}${isNew?'   +10 XP':''}`),'win');
  const next=ch.missions.findIndex((x,j)=>j>S.mi&&!S.done[S.ch+'.'+j]);
  if(next>=0)S.mi=next;
  else{const firstOpen=ch.missions.findIndex((x,j)=>!S.done[S.ch+'.'+j]);
    if(firstOpen>=0)S.mi=firstOpen;
    else{S.mi=ch.missions.length;if(!S.badges[S.ch]){S.badges[S.ch]=1;S.xp+=25;addLine(renderText(`★ Chapter complete! Badge earned: ${ch.badge}   +25 XP`),'win big')}}}
  pop=true}

function run(line){const before=S.cwd;addLine(promptHTML(before)+esc(line));
  if(line.trim()){S.hist.push(line)}histIdx=S.hist.length;SQ.rt.log=[];SQ.rt.changed=new Set();
  if(line.trim()){const r=execLine(line,{});for(const o of r.out){if(o.clear){screen.innerHTML='';continue}addLine(renderText(o.text),o.cls)}S.last=r.code;checkMission(line)}
  renderAll();save();scrollDown()}

function rel(abs){const cw=S.cwd;if(abs===cw)return '.';const a=abs.split('/').filter(Boolean),b=cw.split('/').filter(Boolean);let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;
  const ups=b.length-i;if(ups===0)return a.slice(i).join('/');if(ups<=2)return [...Array(ups).fill('..'),...a.slice(i)].join('/')||'..';return disp(abs)}
function fill(v){cmdIn.value=v;cmdIn.focus();try{cmdIn.setSelectionRange(v.length,v.length)}catch(e){}}

function renderPrompt(){promptEl.innerHTML=promptHTML(S.cwd)}
function renderCrumbs(){const parts=S.cwd.split('/').filter(Boolean);let h='<span class="lbl">You are here:</span><button data-cd="/">/</button>';let p='';
  parts.forEach((s,i)=>{p+='/'+s;h+=`${i?'<span class="sep">/</span>':''}<button data-cd="${esc(p)}">${esc(s)}</button>`});crumbsEl.innerHTML=h}
function renderMap(){
  const node=(name,n,abs)=>{const isDir=n.type==='dir',here=abs===S.cwd;
    const cls=['row',isDir?'d':'f',name.startsWith('.')?'hid':'',here?'here':'',SQ.rt.changed.has(abs)?'flash':''].filter(Boolean).join(' ');
    let h=`<li><button class="${cls}" data-path="${esc(abs)}" title="${esc(abs)}">${isDir?ICON_DIR:ICON_FILE}<span class="nm">${esc(name)}${isDir&&abs!=='/'?'/':''}</span>${n.exec?'<span class="tag">x</span>':''}${here?'<span class="pin">YOU</span>':''}</button>`;
    if(isDir){const ks=sortedKeys(n);if(ks.length)h+='<ul class="tree">'+ks.map(k=>node(k,n.children[k],join(abs,k))).join('')+'</ul>'}return h+'</li>'};
  mapEl.innerHTML='<ul class="tree root">'+node('/',S.fs,'/')+'</ul>';
  const here=mapEl.querySelector('.row.here');if(here){const sc=mapEl.closest('.mapscroll');if(sc&&sc.scrollWidth>sc.clientWidth)sc.scrollLeft=Math.max(0,here.offsetLeft-40)}}
function renderChapters(){chaptersEl.innerHTML=CH.map((c,i)=>`<button class="chap${S.badges[i]?' earned':''}" data-ch="${i}" aria-current="${i===S.ch}"><span class="num">${S.badges[i]?'★':i+1}</span><span class="nm">${esc(c.name)}</span><span class="ct">${totalDone(i)}/${c.missions.length}</span></button>`).join('')}
function renderMission(){const ch=CH[S.ch],n=ch.missions.length;
  const dots=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((m,i)=>`<button class="dot${S.done[S.ch+'.'+i]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(m.title)}" aria-label="Mission ${i+1}: ${esc(m.title)}">${i+1}</button>`).join('')}</div>`;
  let h;
  if(S.mi>=n){const all=totalDone(S.ch)===n,last=S.ch===CH.length-1;
    h=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art${all?'':' dim'}">${all?'★':S.ch+1}</div>
    <h2>${last?'You finished Shell Quest':all?'Badge earned: '+esc(ch.badge):'Chapter finished'}</h2>
    <p class="explain">${last?'You can move around a filesystem, build and reorganise it, search inside files, chain commands with pipes, and write scripts with loops. That is the core of everyday bash.':'You can now use these on any real Linux or Mac terminal:'}</p>
    <div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
    ${last?`<p class="note">Next: play Quick-fire until the commands come from memory, then open a real terminal. The field guide shows how on Mac, Windows and Linux.</p><div class="actions"><button class="btn" data-act="tab-fire">Play Quick-fire</button><button class="btn ghost" data-act="tab-guide">Open the field guide</button></div>`
      :`<div class="actions"><button class="btn" data-act="nextch">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button></div>`}${dots}`}
  else{const m=ch.missions[S.mi];const hint=m.hint||`Type exactly this, then press Enter: <code>${esc(m.answer)}</code>`;
    h=`<div class="eyebrow">Chapter ${S.ch+1} · Mission ${S.mi+1} of ${n}${S.done[S.ch+'.'+S.mi]?' · done before':''}</div>
    ${S.mi===0?`<p class="intro">${esc(ch.intro)}</p>`:''}
    <h2>${esc(m.title)}</h2>
    <div class="goal"><div class="label">Your goal</div><p>${m.goal}</p></div>
    ${anatomy(m.anat)}
    <p class="explain">${m.explain}</p>
    ${m.note?`<p class="note">${m.note}</p>`:''}
    <div class="where">Right now you are in <code>${esc(disp(S.cwd))}</code></div>
    <div class="actions"><button class="btn ghost" data-act="hint" aria-expanded="false">Show a hint</button><button class="btn" data-act="fill">Type it for me</button></div>
    <p class="hint" id="hintBox" hidden>${hint}</p>${dots}`}
  missionEl.innerHTML=h;if(pop){missionEl.classList.remove('pop');void missionEl.offsetWidth;missionEl.classList.add('pop');pop=false}}
const RANKS=[[0,'Rookie'],[100,'Apprentice'],[250,'Navigator'],[420,'Operator'],[600,'Shell Wizard']];
function renderXP(){let i=0;while(i+1<RANKS.length&&S.xp>=RANKS[i+1][0])i++;const lo=RANKS[i][0],hi=i+1<RANKS.length?RANKS[i+1][0]:lo;
  $('#rank').textContent=RANKS[i][1];$('#xpText').textContent=S.xp+' XP';$('#xpFill').style.width=(hi>lo?Math.min(100,(S.xp-lo)/(hi-lo)*100):100)+'%'}
function renderAll(){renderPrompt();renderCrumbs();renderMap();renderChapters();renderMission();renderXP()}

function goChapter(i){S.ch=i;const open=CH[i].missions.findIndex((m,j)=>!S.done[i+'.'+j]);S.mi=open<0?CH[i].missions.length:open;
  SQ.rt.changed=new Set();CH[i].setup();if(SQ.rt.changed.size)addLine(renderText(`(Chapter ${i+1} set up: missing files were put back in place.)`),'sys');renderAll();save();scrollDown()}

/* tab completion */
function complete(){const v=cmdIn.value,pos=cmdIn.selectionStart??v.length,before=v.slice(0,pos),after=v.slice(pos);const word=before.match(/(\S*)$/)[1];
  const first=/^\s*\S*$/.test(before);let cands=[];
  if(first&&!word.includes('/'))cands=Object.keys(CMDS).filter(c=>c.startsWith(word)).map(c=>c+' ');
  else{const idx=word.lastIndexOf('/'),dp=idx>=0?word.slice(0,idx+1):'',b=word.slice(idx+1);const dn=getNode(norm(dp||'.'));
    if(dn&&dn.type==='dir')cands=Object.keys(dn.children).filter(k=>k.startsWith(b)&&(b.startsWith('.')||!k.startsWith('.'))).sort(cmpName).map(k=>dp+k+(dn.children[k].type==='dir'?'/':' '))}
  if(!cands.length)return;
  if(cands.length===1){const nv=before.slice(0,before.length-word.length)+cands[0];cmdIn.value=nv+after;cmdIn.setSelectionRange(nv.length,nv.length);return}
  let pre=cands[0];for(const c of cands)while(!c.startsWith(pre))pre=pre.slice(0,-1);
  if(pre.length>word.length){const nv=before.slice(0,before.length-word.length)+pre;cmdIn.value=nv+after;cmdIn.setSelectionRange(nv.length,nv.length)}
  else{addLine(promptHTML(S.cwd)+esc(v));addLine(esc(cands.map(c=>c.trim().split('/').filter(Boolean).pop()+(c.endsWith('/')?'/':'')).join('  ')));scrollDown()}}

cmdIn.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();const v=cmdIn.value;cmdIn.value='';run(v)}
  else if(e.key==='ArrowUp'){e.preventDefault();if(histIdx>0){histIdx--;fill(S.hist[histIdx]||'')}}
  else if(e.key==='ArrowDown'){e.preventDefault();if(histIdx<S.hist.length){histIdx++;fill(S.hist[histIdx]||'')}}
  else if(e.key==='Tab'){e.preventDefault();complete()}
  else if(e.ctrlKey&&(e.key==='l'||e.key==='L')){e.preventDefault();screen.innerHTML=''}
  else if(e.ctrlKey&&(e.key==='c'||e.key==='C')&&!String(window.getSelection())){e.preventDefault();addLine(promptHTML(S.cwd)+esc(cmdIn.value)+'^C');cmdIn.value='';scrollDown()}});
term.addEventListener('click',()=>{if(!String(window.getSelection()))cmdIn.focus()});
$('#keys').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;cmdIn.focus();
  if(k==='TAB')complete();else if(k==='UP'){if(histIdx>0){histIdx--;fill(S.hist[histIdx]||'')}}else if(k==='ENTER'){const v=cmdIn.value;cmdIn.value='';run(v)}
  else{const p=cmdIn.selectionStart??cmdIn.value.length;cmdIn.value=cmdIn.value.slice(0,p)+k+cmdIn.value.slice(p);cmdIn.setSelectionRange(p+k.length,p+k.length)}});
crumbsEl.addEventListener('click',e=>{const b=e.target.closest('[data-cd]');if(b)fill('cd '+b.dataset.cd)});
mapEl.addEventListener('click',e=>{const b=e.target.closest('[data-path]');if(!b)return;const abs=b.dataset.path,n=getNode(abs);if(!n)return;fill((n.type==='dir'?'cd ':'cat ')+rel(abs))});
chaptersEl.addEventListener('click',e=>{const b=e.target.closest('[data-ch]');if(b)goChapter(+b.dataset.ch)});
missionEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mi!=null){S.mi=+b.dataset.mi;renderMission();save();return}
  const a=b.dataset.act;const m=CH[S.ch].missions[S.mi];
  if(a==='hint'){const h=$('#hintBox');h.hidden=!h.hidden;b.setAttribute('aria-expanded',String(!h.hidden));b.textContent=h.hidden?'Show a hint':'Hide the hint'}
  else if(a==='fill'&&m)fill(m.answer);
  else if(a==='nextch')goChapter(S.ch+1);
  else if(a==='tab-fire')showTab('fire');else if(a==='tab-guide')showTab('guide')});
let armT=null;const rw=$('#resetWorld');
rw.addEventListener('click',()=>{if(!rw.classList.contains('armed')){rw.classList.add('armed');rw.textContent='Click again to reset the world';clearTimeout(armT);armT=setTimeout(()=>{rw.classList.remove('armed');rw.textContent='Reset world'},3500);return}
  clearTimeout(armT);rw.classList.remove('armed');rw.textContent='Reset world';S.fs=makeWorld();S.cwd=HOME;S.oldpwd=HOME;S.vars={};SQ.rt.changed=new Set();CH[S.ch].setup();SQ.rt.changed=new Set();
  addLine('World reset to its starting state. Your progress and XP are kept.','sys');renderAll();save();scrollDown()});

/* tabs */
function showTab(t){for(const id of ['quest','fire','guide']){$('#tab-'+id).hidden=id!==t;$('#t-'+id).setAttribute('aria-selected',String(id===t))}
  if(t==='quest'&&matchMedia('(pointer:fine)').matches)setTimeout(()=>cmdIn.focus(),0);if(t!=='fire')stopFire(false)}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});

/* quick-fire */
const fStage=$('#fStage');const LEN=75;let QS=null,qT=null;
const normA=s=>s.trim().replace(/\s+/g,' ').replace(/['"]/g,'');
function setStats(){$('#fScore').textContent=QS?QS.score:0;$('#fStreak').textContent=QS?QS.streak:0;$('#fBest').textContent=S.best||0;$('#fTime').textContent=QS?Math.ceil(QS.left):LEN;$('#fTimer').style.width=(QS?QS.left/LEN*100:100)+'%'}
function fireIdle(){fStage.innerHTML=`<div class="example"><div class="label" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Example task</div>
  <div class="task">Show the folder you are in</div><p class="fb" style="margin-top:4px">Answer: <code>pwd</code></p></div>
  <div class="actions"><button class="btn" id="fStart">Start the clock</button></div>`;setStats()}
function startFire(){const order=QF.map((q,i)=>i).sort(()=>Math.random()-.5);QS={order,i:0,score:0,streak:0,left:LEN,misses:[],t0:Date.now()};
  fStage.innerHTML=`<div class="task" id="fTask"></div><div class="fterm"><span class="p-sym" style="color:var(--term-prompt)">$ </span><input id="fIn" aria-label="Your answer" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
  <p class="fb" id="fFb" aria-live="polite"></p><div class="actions"><button class="btn ghost" id="fSkip">Skip</button><button class="btn ghost" id="fStop">End round</button></div>`;
  showQ();$('#fIn').focus();clearInterval(qT);qT=setInterval(()=>{QS.left=Math.max(0,LEN-(Date.now()-QS.t0)/1000);setStats();if(QS.left<=0)stopFire(true)},100)}
function showQ(){if(QS.i>=QS.order.length){QS.order=QS.order.sort(()=>Math.random()-.5);QS.i=0}$('#fTask').textContent=QF[QS.order[QS.i]][0];setStats()}
function answer(v,skip){const q=QF[QS.order[QS.i]];const good=!skip&&q[1].some(x=>normA(x)===normA(v));const fb=$('#fFb');
  if(good){QS.score+=10+Math.min(QS.streak,5)*2;QS.streak++;fb.className='fb good';fb.textContent=`Correct${QS.streak>1?` · streak ${QS.streak}`:''}`}
  else{QS.streak=0;QS.misses.push([q[0],q[1][0],v]);fb.className='fb bad';fb.innerHTML=`${skip?'Skipped':'Not quite'}. One answer: <code>${esc(q[1][0])}</code>`}
  QS.i++;showQ();const inp=$('#fIn');inp.value='';inp.focus()}
function stopFire(show){clearInterval(qT);if(!QS)return;const R=QS;QS=null;if(R.score>(S.best||0)){S.best=R.score;save()}
  if(!show){fireIdle();return}
  fStage.innerHTML=`<div class="task">Time! You scored ${R.score}.</div><p class="fb">${R.score>=S.best&&R.score>0?'That is your best score so far.':`Your best is ${S.best}.`}</p>
  ${R.misses.length?`<div><div class="label" style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Review what you missed</div><ul class="misses">${R.misses.map(([q,a,v])=>`<li><span>${esc(q)}</span><code>${esc(a)}</code>${v?`<span style="color:var(--muted)">you typed <code>${esc(v)}</code></span>`:''}</li>`).join('')}</ul></div>`:'<p>No misses. Clean round.</p>'}
  <div class="actions"><button class="btn" id="fStart">Play again</button></div>`;setStats()}
fStage.addEventListener('click',e=>{const id=e.target.id;if(id==='fStart')startFire();else if(id==='fSkip'&&QS)answer('',true);else if(id==='fStop')stopFire(true)});
fStage.addEventListener('keydown',e=>{if(e.target.id==='fIn'&&e.key==='Enter'&&QS){e.preventDefault();const v=e.target.value;if(v.trim())answer(v,false)}});

/* guide */
function renderGuide(){const groups=CH.map(c=>c.name).concat(['Handy extras']);
  const ex=g=>`<div class="ex">${g.ex.map(([c,n])=>`<div class="exrow"><code>${esc(c)}</code>${n?`<small>${esc(n)}</small>`:''}<button class="try" data-try="${esc(c)}">Try</button></div>`).join('')}</div>`;
  $('#guide').innerHTML=`<div><h2>Field guide</h2><p class="lede">Everything from the quest in one place. Press Try on any example to drop it into the practice terminal.</p></div>
  <section class="gsec"><h3>How to read a command</h3><div class="panel bigan">${anatomy([['grep','cmd'],['-i','opt'],['wolf','arg'],['journal.txt','arg'],['|','op'],['wc','cmd'],['-l','opt']])}
   <p class="explain" style="margin-top:12px">The <b>command</b> comes first and says what to do. <b>Options</b> start with a dash and change how it behaves. <b>Arguments</b> are the things it works on, usually files or folders. <b>Operators</b> like <code>|</code>, <code>&gt;</code> and <code>&amp;&amp;</code> connect commands. Spaces separate everything, so put quotes around text that contains spaces.</p></div></section>
  <section class="gsec"><h3>Paths in one table</h3><div class="panel paths">
   <code>/</code><span>The root. Every path on the system starts here.</span>
   <code>~</code><span>Your home folder. Here that is /home/explorer.</span>
   <code>.</code><span>The folder you are in right now.</span>
   <code>..</code><span>The folder one level up.</span>
   <code>/home/explorer/forest</code><span>An <b>absolute</b> path. Starts with / and works from anywhere.</span>
   <code>forest/cave</code><span>A <b>relative</b> path. Starts from where you are.</span></div></section>
  <section class="gsec"><h3>Safety rules</h3><ol class="panel rules">
   <li><code>rm</code> has no undo and no trash can. Read the command before you press Enter.</li>
   <li>Before deleting with a wildcard, run <code>ls</code> with the same pattern and check the list.</li>
   <li>Don't paste commands from the internet that you don't understand, especially ones with <code>sudo</code> or <code>rm -rf</code>.</li>
   <li><kbd>Ctrl</kbd>+<kbd>C</kbd> stops a command that is running. <kbd>q</kbd> exits man pages and other viewers.</li>
   <li>Lost? <code>pwd</code> tells you where you are and <code>cd ~</code> takes you home.</li></ol></section>
  ${groups.map((gname,gi)=>{const items=GUIDE.filter(g=>g.ch===gi);return items.length?`<section class="gsec"><h3>${gi<CH.length?`Chapter ${gi+1}: `:''}${esc(gname)}</h3><div class="cards">${items.map(g=>`<article class="card panel"><h4>${esc(g.c)}</h4><p>${esc(g.what)}</p>${anatomy(g.syn)}${ex(g)}</article>`).join('')}</div></section>`:''}).join('')}
  <section class="gsec"><h3>Open a real terminal</h3><div class="os">
   <article class="card panel"><h4>Mac</h4><p>Press <kbd>Cmd</kbd>+<kbd>Space</kbd>, type Terminal, press Enter. Macs use zsh by default, a close cousin of bash. Every command in this course works the same there.</p></article>
   <article class="card panel"><h4>Windows</h4><p>Install WSL: open PowerShell as administrator, run <code>wsl --install</code>, restart, then open Ubuntu from the Start menu. Git Bash is a lighter alternative.</p></article>
   <article class="card panel"><h4>Linux</h4><p>Press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> on most distributions, or find Terminal in your app menu.</p></article>
   <article class="card panel"><h4>First steps there</h4><p>Make a safe playground before experimenting: <code>mkdir ~/playground &amp;&amp; cd ~/playground</code>. Then rerun your favourite missions on real files.</p></article></div></section>
  <section class="gsec"><h3>After this course</h3><div class="panel" style="padding:14px 16px"><p class="explain">Good next topics, roughly in order: editing files with <code>nano</code>, <code>if</code> statements and exit codes, functions in scripts, reading <code>man</code> pages, permissions in depth (<code>ls -l</code> and <code>chmod 755</code>), and then tools that run on top of bash, like <code>git</code> and <code>ssh</code>.</p>
   <div class="actions" style="margin-top:12px"><button class="linkbtn" id="resetProgress">Reset all progress</button></div></div></section>`}
let armP=null;
$('#guide').addEventListener('click',e=>{const t=e.target.closest('[data-try]');if(t){showTab('quest');fill(t.dataset.try);return}
  if(e.target.id==='resetProgress'){const b=e.target;if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to erase progress, XP and world';clearTimeout(armP);armP=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset all progress'},3500);return}
    clearTimeout(armP);SQ.resetState(fresh());S.seen=true;screen.innerHTML='';welcome();CH[0].setup();SQ.rt.changed=new Set();histIdx=0;renderAll();save();b.classList.remove('armed');b.textContent='Progress reset. Back to chapter 1.';showTab('quest')}});

function welcome(){addLine(renderText('Welcome to Shell Quest, a practice bash shell that runs in your browser.'),'sys');
  addLine('Nothing you type here can touch your real computer, so experiment freely.','sys');
  addLine('Your mission is on the left. Type help to list commands, or man ls to learn about one.','sys');addLine('')}

/* boot */
if(!S.seen){CH[S.ch].setup();S.seen=true}
SQ.rt.changed=new Set();
welcome();if(S.hist.length)addLine(renderText(`Welcome back. You are on chapter ${S.ch+1}: ${CH[S.ch].name}.`),'tip');
renderAll();renderGuide();fireIdle();save();
const h=(location.hash||'').slice(1);if(h==='guide'||h==='quickfire'||h==='fire')showTab(h==='guide'?'guide':'fire');
else if(matchMedia('(pointer:fine)').matches)cmdIn.focus({preventScroll:true});
})();
