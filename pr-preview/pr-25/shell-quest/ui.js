(function (SQ) {
const S=SQ.S;
const {disp,join,sortedKeys}=SQ;
const CH=SQ.content.chapters,GUIDE=SQ.content.guide;
const $=s=>document.querySelector(s);
const screen=$('#screen'),cmdIn=$('#cmd'),promptEl=$('#prompt'),term=$('#term'),mapEl=$('#map'),missionEl=$('#mission'),chaptersEl=$('#chapters'),crumbsEl=$('#crumbs');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const renderText=t=>esc(t).replace(/\x01(\w)([\s\S]*?)\x02/g,'<span class="c-$1">$2</span>');
const promptHTML=cwd=>`<span class="p-user">explorer@basecamp</span>:<span class="p-path">${esc(disp(cwd))}</span><span class="p-sym">$</span> `;
const KIND={cmd:'command',opt:'option',arg:'argument',op:'operator',var:'variable',kw:'keyword'};
const anatomy=t=>t&&t.length?`<div class="anat" aria-label="Command anatomy">${t.map(([v,k,l])=>`<div class="tok k-${k}"><b>${esc(v)}</b><span>${esc(l||KIND[k])}</span></div>`).join('')}</div>`:'';
/* the to-do list of a multi-step mission: every step is a goal of its own, ticked off as it is done, in any order */
const stepList=(st,sd)=>`<ul class="steps" aria-label="Steps">${st.map((s,i)=>`<li class="${sd.includes(i)?'done':''}"><span class="tick" aria-hidden="true">${sd.includes(i)?'✓':''}</span><span>${s.goal}${sd.includes(i)?'<span class="sr"> (done)</span>':''}</span></li>`).join('')}</ul>`;
const ICON_DIR='<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3h4.3l1.6 1.7h7.1v8.8h-13z"/></svg>';
const ICON_FILE='<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/></svg>';
let pop=false;
function addLine(html,cls){const d=document.createElement('div');d.className='line'+(cls?' '+cls:'');d.innerHTML=html;screen.appendChild(d)}
function scrollDown(){term.scrollTop=term.scrollHeight}
function totalDone(i){return CH[i].missions.filter((m,j)=>S.done[i+'.'+j]).length}
function fill(v){cmdIn.value=v;cmdIn.focus();try{cmdIn.setSelectionRange(v.length,v.length)}catch(e){}}

function renderPrompt(){promptEl.innerHTML=promptHTML(S.cwd)}
function renderCrumbs(){const parts=S.cwd.split('/').filter(Boolean);let h='<span class="lbl">You are here:</span><button data-cd="/">/</button>';let p='';
  parts.forEach((s,i)=>{p+='/'+s;h+=`${i?'<span class="sep">/</span>':''}<button data-cd="${esc(p)}">${esc(s)}</button>`});crumbsEl.innerHTML=h}
function renderMap(){
  const node=(name,n,abs)=>{const isDir=n.type==='dir',here=abs===S.cwd;
    const cls=['row',isDir?'d':'f',name.startsWith('.')?'hid':'',here?'here':'',SQ.rt.changed.has(abs)?'flash':''].filter(Boolean).join(' ');
    let h=`<li><button class="${cls}" data-path="${esc(abs)}" title="${esc(abs)}">${isDir?ICON_DIR:ICON_FILE}<span class="nm">${esc(name)}${isDir&&abs!=='/'?'/':''}</span>${n.exec?'<span class="tag">x</span>':''}${here?'<span class="pin">YOU</span>':''}</button>`;
    if(isDir){const ks=sortedKeys(n);if(ks.length)h+='<ul class="tree">'+ks.map(k=>node(k,n.children[k],join(abs,k))).join('')+'</ul>'}return h+'</li>'};
  /* the engine caps path depth (fs.js DEPTH_MAX), so this recursion stays shallow; the catch only keeps one bad tree from stopping the rest of the page (and the save) */
  let html;try{html='<ul class="tree root">'+node('/',S.fs,'/')+'</ul>'}catch(e){html='<p class="note">This world is too big to draw. Remove a deep folder with rm -r to bring the map back.</p>'}
  mapEl.innerHTML=html;
  const here=mapEl.querySelector('.row.here');if(here){const sc=mapEl.closest('.mapscroll');if(sc&&sc.scrollWidth>sc.clientWidth)sc.scrollLeft=Math.max(0,here.offsetLeft-40)}}
function renderChapters(){Tiers.renderRail(chaptersEl,{status:SQ.tiers.status(S),chapters:CH,S})}
function renderMission(){const ch=CH[S.ch],n=ch.missions.length;
  const dots=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((m,i)=>`<button class="dot${S.done[S.ch+'.'+i]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(m.title)}" aria-label="Mission ${i+1}: ${esc(m.title)}">${i+1}</button>`).join('')}</div>`;
  let h;
  if(S.mi>=n){const all=totalDone(S.ch)===n,last=S.ch===CH.length-1,tier=SQ.tiers.tierOf(S.ch),begin=tier.id==='beginner',tdone=SQ.tiers.status(S).some(x=>x.tier===tier&&x.complete);
    h=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art${all?'':' dim'}">${all?'★':S.ch+1}</div>
    <h2>${last?(begin?'You finished Shell Quest':(tdone?'You finished the '+esc(tier.name)+' tier':'You reached the last chapter')):all?'Badge earned: '+esc(ch.badge):'Chapter finished'}</h2>
    <p class="explain">${last?(begin?'You can move around a filesystem, create and reorganise it, search inside files, chain commands with pipes, and write scripts with loops. That is the core of everyday bash.':(tier.id==='expert'&&tdone?'You can take text apart with awk and sed, run and stop background jobs, build pipelines with find -exec, xargs and process substitution, and write scripts that fail safely: set -euo pipefail, set -x, trap and getopts. ':tier.id==='advanced'&&tdone?'You can write real bash scripts now: tests and if, loops and arithmetic, functions with arguments and local variables, here-documents, stderr and exit codes. ':'')+'That is every chapter there is. You can revisit any chapter from the list on the left.'):'You can now use these on any real Linux or Mac terminal:'}</p>
    <div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
    ${last?`<p class="note">Next: play Quick-fire until the commands come from memory, then open a real terminal. The field guide shows how on Mac, Windows and Linux.</p><div class="actions"><button class="btn" data-act="tab-fire">Play Quick-fire</button><button class="btn ghost" data-act="tab-guide">Open the field guide</button></div>`
      :`<div class="actions"><button class="btn" data-act="nextch">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button></div>`}${dots}`}
  else{const m=ch.missions[S.mi];const sc=(m.kind==='script'||m.kind==='challenge')&&m.file;
    const mk=S.ch+'.'+S.mi,st=m.steps,sd=st?SQ.stepsDone(mk):[],cur=st?st[SQ.stepNext(m,mk)]:m; /* a multi-step mission: hint, chips and how follow the first open step */
    const hint=cur.hint||m.hint||(sc?`Use nano ${esc(m.file)} to write it, then run it with bash ${esc(m.file)}.`:`Type exactly this, then press Enter: <code>${esc(cur.answer)}</code>`);
    h=`<div class="eyebrow">Chapter ${S.ch+1} · Mission ${S.mi+1} of ${n}${st?` · ${sd.length} of ${st.length} steps done`:''}${S.done[mk]?' · done before':''}</div>
    ${S.mi===0?`<p class="intro">${esc(ch.intro)}</p>`:''}
    <h2>${esc(m.title)}${m.kind==='challenge'?' <span class="mtag">Challenge</span>':''}</h2>
    ${sc?`<div class="where">Your file: <code>${esc(m.file)}</code></div>`:''}
    <div class="goal"><div class="label">Your goal</div><p>${m.goal}</p>${st?stepList(st,sd):''}</div>
    ${anatomy(cur.anat||m.anat)}
    ${HowSteps.html(cur.how||m.how)}
    <p class="explain">${m.explain}</p>
    ${m.note?`<p class="note">${m.note}</p>`:''}
    <div class="where">Right now you are in <code>${esc(disp(S.cwd))}</code></div>
    <div class="actions"><button class="btn ghost" data-act="hint" aria-expanded="false">Show a hint</button><button class="btn" data-act="fill">Type it for me</button></div>
    <p class="hint" id="hintBox" hidden>${hint}</p>${dots}`}
  missionEl.innerHTML=h;if(pop){missionEl.classList.remove('pop');void missionEl.offsetWidth;missionEl.classList.add('pop');pop=false}}
function renderXP(){const r=SQ.tiers.rankFor(S.xp),lo=r.lo,hi=r.hi;
  $('#rank').textContent=r.name;$('#xpText').textContent=S.xp+' XP';$('#xpFill').style.width=(hi>lo?Math.min(100,(S.xp-lo)/(hi-lo)*100):100)+'%'}
function renderAll(){renderPrompt();renderCrumbs();renderMap();renderChapters();renderMission();renderXP()}


function renderGuide(){
  const tiers=[];CH.forEach((c,i)=>{const t=SQ.tiers.tierOf(i);if(!tiers.includes(t))tiers.push(t)});
  const ex=g=>`<div class="ex">${g.ex.map(([c,n])=>`<div class="exrow"><code>${esc(c)}</code>${n?`<small>${esc(n)}</small>`:''}<button class="try" data-try="${esc(c)}">Try</button></div>`).join('')}</div>`;
  const card=g=>`<article class="card panel"><h4>${esc(g.c)}</h4><p>${esc(g.what)}</p>${anatomy(g.syn)}${ex(g)}</article>`;
  const chapterSec=ci=>{const items=GUIDE.filter(g=>g.ch===ci);return items.length?`<section class="gsec"><h3>Chapter ${ci+1}: ${esc(CH[ci].name)}</h3><div class="cards">${items.map(card).join('')}</div></section>`:''};
  const tierSec=t=>`<section class="gsec gtier" data-tier="${t.id}"><h3 data-tier="${t.id}" class="tierh">${esc(t.name)}</h3>${CH.map((c,i)=>SQ.tiers.tierOf(i).id===t.id?chapterSec(i):'').join('')}</section>`;
  const extras=GUIDE.filter(g=>g.ch==='extras');
  const extrasSec=extras.length?`<section class="gsec" data-extras><h3>Handy extras</h3><div class="cards">${extras.map(card).join('')}</div></section>`:'';
  const filter=`<div class="gfilter" role="group" aria-label="Filter by tier"><button class="btn ghost" data-tier="all" aria-pressed="true">All</button>${tiers.map(t=>`<button class="btn ghost" data-tier="${t.id}" aria-pressed="false">${esc(t.name)}</button>`).join('')}</div>`;
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
  ${filter}${tiers.map(tierSec).join('')}${extrasSec}
  <section class="gsec gfoot"><h3>Open a real terminal</h3><div class="os">
   <article class="card panel"><h4>Mac</h4><p>Press <kbd>Cmd</kbd>+<kbd>Space</kbd>, type Terminal, press Enter. Macs use zsh by default, a close cousin of bash. Every command in this course works the same there.</p></article>
   <article class="card panel"><h4>Windows</h4><p>Install WSL: open PowerShell as administrator, run <code>wsl --install</code>, restart, then open Ubuntu from the Start menu. Git Bash is a lighter alternative.</p></article>
   <article class="card panel"><h4>Linux</h4><p>Press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> on most distributions, or find Terminal in your app menu.</p></article>
   <article class="card panel"><h4>First steps there</h4><p>Create a safe playground before experimenting: <code>mkdir ~/playground &amp;&amp; cd ~/playground</code>. Then rerun your favourite missions on real files.</p></article></div></section>
  <section class="gsec"><h3>After this course</h3><div class="panel" style="padding:14px 16px"><p class="explain">Good next topics, roughly in order: reading real <code>man</code> pages, permissions in depth (<code>ls -l</code> and <code>chmod 755</code>), the bash features this practice shell leaves out (arrays and <code>declare</code>, <code>fg</code> and <code>bg</code>, <code>&gt;( )</code>, <code>awk</code>'s <code>getline</code>, <code>sed</code>'s hold space), and then tools that run on top of bash, like <code>git</code> and <code>ssh</code>. If you have not yet, play every tier: Intermediate covers text tools, quoting and exit codes, Advanced <code>if</code>, loops, functions and real scripts written in <code>nano</code>, and Expert <code>awk</code>, <code>sed</code>, background jobs, <code>set -euo pipefail</code>, <code>trap</code> and <code>getopts</code>.</p>
   <div class="actions" style="margin-top:12px"><button class="linkbtn" id="resetProgress">Reset all progress</button></div></div></section>`;
  const gd=$('#guide');gd.querySelector('.gfilter').addEventListener('click',e=>{const b=e.target.closest('button[data-tier]');if(!b)return;const t=b.dataset.tier;
    gd.querySelectorAll('.gfilter button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    gd.querySelectorAll('.gtier').forEach(x=>{x.hidden=t!=='all'&&x.dataset.tier!==t});
    const xs=gd.querySelector('[data-extras]');if(xs)xs.hidden=t!=='all'})}
SQ.ui={renderAll,renderPrompt,renderCrumbs,renderMap,renderChapters,renderMission,renderXP,renderGuide,addLine,scrollDown,fill,esc,renderText,promptHTML,anatomy,setPop(){pop=true}};
})(window.SQ = window.SQ || {});
