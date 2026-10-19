(()=>{
const SQ=window.SQ;
const S=SQ.S;
const {HOME,makeWorld,fresh,save,norm,getNode,disp,join,cmpName,CMDS,execLine,ctxFor}=SQ;

const CH=SQ.content.chapters,GUIDE=SQ.content.guide,QF=SQ.content.quickfire;
const $=s=>document.querySelector(s);
const screen=$('#screen'),cmdIn=$('#cmd'),promptEl=$('#prompt'),term=$('#term'),mapEl=$('#map'),missionEl=$('#mission'),chaptersEl=$('#chapters'),crumbsEl=$('#crumbs');
const {renderAll,renderMission,renderGuide,addLine,scrollDown,fill,esc,renderText,promptHTML}=SQ.ui;
let histIdx=S.hist.length;

/* opts ({feedback}) is consumed by script missions (Task 10) */
function checkMission(line,opts){const ch=CH[S.ch];if(S.mi>=ch.missions.length)return;const m=ch.missions[S.mi];let good=false;
  try{good=!!m.check(ctxFor(line))}catch(e){}if(!good)return;
  const key=S.ch+'.'+S.mi,isNew=!S.done[key];S.done[key]=1;const mx=SQ.tiers.missionXp(S.ch);if(isNew)S.xp+=mx;
  addLine(renderText(`✓ Mission complete: ${m.title}${isNew?'   +'+mx+' XP':''}`),'win');
  const next=ch.missions.findIndex((x,j)=>j>S.mi&&!S.done[S.ch+'.'+j]);
  if(next>=0)S.mi=next;
  else{const firstOpen=ch.missions.findIndex((x,j)=>!S.done[S.ch+'.'+j]);
    if(firstOpen>=0)S.mi=firstOpen;
    else{S.mi=ch.missions.length;if(!S.badges[S.ch]){S.badges[S.ch]=1;S.xp+=SQ.tiers.chapterBadgeXp;addLine(renderText(`★ Chapter complete! Badge earned: ${ch.badge}   +${SQ.tiers.chapterBadgeXp} XP`),'win big')}}}
  SQ.ui.setPop()}

/* One typed or generated line: echo it (unless echo:false), run it (optional stdin text), show the output, check the mission.
   opts.feedback is for script missions (a failed test case is explained); the typed prompt never sets it. */
function runLine(line,opts){opts=opts||{};const before=S.cwd;let edit=null;
  if(opts.echo!==false)addLine(promptHTML(before)+esc(line));
  if(line.trim()){S.hist.push(line)}histIdx=S.hist.length;SQ.rt.log=[];SQ.rt.changed=new Set();
  if(line.trim()){const r=execLine(line,typeof opts.stdin==='string'?{stdin:opts.stdin}:{});for(const o of r.out){if(o.clear){screen.innerHTML='';continue}addLine(renderText(o.text),o.cls)}S.last=r.code;if(r.ui&&r.ui.edit)edit=r.ui;checkMission(line,{feedback:!!opts.feedback})}
  renderAll();save();scrollDown();
  if(edit)openFor(edit.edit,edit.isNew)}
const run=line=>runLine(line,{echo:true});

/* the editor panel: nano/edit/vi/vim ask for it, Save writes through the same writeFile the shell uses */
function openFor(abs,isNew){const n=getNode(abs);SQ.ui.openEditor(abs,n&&n.type==='file'?n.content:'#!/bin/bash\n',{isNew:!n})}
const shownPath=abs=>{const r=rel(abs);return r==='.'?disp(abs):r};
SQ.editorSave=function(abs,text){text=String(text).replace(/\r\n?/g,'\n');const shown=shownPath(abs);SQ.rt.changed=new Set();
  const e=text.length>SQ.LIM.TEXT?`bash: ${shown}: file too large for this practice shell`:SQ.writeFile(abs,text,false,shown);
  if(e){addLine(renderText(e),'err');scrollDown();return false}
  addLine(renderText('Saved '+shown),'sys');checkMission('(saved '+shown+')');renderAll();save();scrollDown();return true};
const quoteArg=p=>/^[\w@%+=:,./-]+$/.test(p)&&!p.startsWith('-')?p:"'"+p.replace(/'/g,"'\\''")+"'";
SQ.editorRun=function(abs,args,stdin){let p=shownPath(abs);if(p.startsWith('~')||p.startsWith('-'))p=abs;
  runLine('bash '+quoteArg(p)+(args?' '+args:''),{echo:true,stdin,feedback:true})};

function rel(abs){const cw=S.cwd;if(abs===cw)return '.';const a=abs.split('/').filter(Boolean),b=cw.split('/').filter(Boolean);let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;
  const ups=b.length-i;if(ups===0)return a.slice(i).join('/');if(ups<=2)return [...Array(ups).fill('..'),...a.slice(i)].join('/')||'..';return disp(abs)}

function goChapter(i){S.ch=i;const open=CH[i].missions.findIndex((m,j)=>!S.done[i+'.'+j]);S.mi=open<0?CH[i].missions.length:open;
  SQ.rt.changed=new Set();CH[i].setup();if(SQ.rt.changed.size)addLine(renderText(`(Chapter ${i+1} set up: missing files were put back in place.)`),'sys');renderAll();save();scrollDown()}

/* tab completion */
function complete(){const v=cmdIn.value,pos=cmdIn.selectionStart??v.length,before=v.slice(0,pos),after=v.slice(pos);const word=before.match(/(\S*)$/)[1];
  const first=/^\s*\S*$/.test(before);let cands=[];
  if(first&&!word.includes('/'))cands=Object.keys(CMDS).filter(c=>/^[A-Za-z]/.test(c)&&c.startsWith(word)).map(c=>c+' ');
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
/* the extra keys type into whichever of the terminal input or the editor's fields was used last */
let lastField=cmdIn;
for(const el of [cmdIn,$('#edText'),$('#edArgs'),$('#edStdin')])el.addEventListener('focusin',()=>{lastField=el});
function typeInto(el,k){el.focus();const p=el.selectionStart??el.value.length,q=el.selectionEnd??p;el.setRangeText(k,p,q,'end');el.dispatchEvent(new Event('input',{bubbles:true}))}
$('#keys').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;const edOpen=!$('#editor').hidden;const f=(lastField===cmdIn||edOpen)?lastField:cmdIn;(['TAB','UP','ENTER'].includes(k)?cmdIn:f).focus();
  if(k==='TAB')complete();else if(k==='UP'){if(histIdx>0){histIdx--;fill(S.hist[histIdx]||'')}}else if(k==='ENTER'){const v=cmdIn.value;cmdIn.value='';run(v)}
  else typeInto(f,k)});
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
  clearTimeout(armT);rw.classList.remove('armed');rw.textContent='Reset world';S.fs=makeWorld();S.cwd=HOME;S.oldpwd=HOME;S.vars={};delete S.exp;SQ.rt.changed=new Set();CH[S.ch].setup();SQ.rt.changed=new Set();
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
const qTier=q=>q[2]||'beginner';
/* tier picker: one option per tier that has quick-fire questions; the pool is derived lazily at run start */
(function buildTierPicker(){const sel=$('#fTier');for(const {tier:t} of SQ.tiers.status({})){if(!QF.some(q=>qTier(q)===t.id))continue;const o=document.createElement('option');o.value=t.id;o.textContent=t.name;sel.appendChild(o)}})();
function startFire(){const pick=$('#fTier').value;const order=QF.map((q,i)=>i).filter(i=>pick==='mixed'||qTier(QF[i])===pick).sort(()=>Math.random()-.5);if(!order.length)return;QS={order,i:0,score:0,streak:0,left:LEN,misses:[],t0:Date.now()};
  fStage.innerHTML=`<div class="task" id="fTask"></div><div class="fterm"><span class="p-sym" style="color:var(--term-prompt)">$ </span><input id="fIn" aria-label="Your answer" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
  <p class="fb" id="fFb" aria-live="polite"></p><div class="actions"><button class="btn ghost" id="fSkip">Skip</button><button class="btn ghost" id="fStop">End round</button></div>`;
  showQ();$('#fIn').focus();clearInterval(qT);qT=setInterval(()=>{QS.left=Math.max(0,LEN-(Date.now()-QS.t0)/1000);setStats();if(QS.left<=0)stopFire(true)},100)}
function showQ(){if(QS.i>=QS.order.length){QS.order=QS.order.sort(()=>Math.random()-.5);QS.i=0}$('#fTask').textContent=QF[QS.order[QS.i]][0];setStats()}
function answer(v,skip){const q=QF[QS.order[QS.i]];const nm=q[3]&&q[3].exact?(t=>t.trim().replace(/\s+/g,' ')):normA;const good=!skip&&q[1].some(x=>nm(x)===nm(v));const fb=$('#fFb');
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
let armP=null;
$('#guide').addEventListener('click',e=>{const t=e.target.closest('[data-try]');if(t){showTab('quest');fill(t.dataset.try);return}
  if(e.target.id==='resetProgress'){const b=e.target;if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to erase progress, XP and world';clearTimeout(armP);armP=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset all progress'},3500);return}
    clearTimeout(armP);SQ.resetState(fresh());S.seen=true;screen.innerHTML='';welcome();CH[0].setup();SQ.rt.changed=new Set();histIdx=0;renderAll();save();b.classList.remove('armed');b.textContent='Progress reset. Back to chapter 1.';showTab('quest')}});

function welcome(){addLine(renderText('Welcome to Shell Quest, a practice bash shell that runs in your browser.'),'sys');
  addLine('Nothing you type here can touch your real computer, so experiment freely.','sys');
  addLine('Your mission is on the left. Type help to list commands, or man ls to learn about one.','sys');addLine('')}

/* a save the browser refused (storage full or blocked) is reported once in the terminal instead of failing silently */
SQ.rt.onSaveFail=()=>{addLine(renderText('Warning: this browser would not store your progress (its storage is full or blocked). Use Progress, then Export to file, to keep a copy. Reset world frees space if big files are the cause.'),'err');scrollDown()};

/* boot */
if(!S.seen){CH[S.ch].setup();S.seen=true}
SQ.rt.changed=new Set();
welcome();if(S.hist.length)addLine(renderText(`Welcome back. You are on chapter ${S.ch+1}: ${CH[S.ch].name}.`),'tip');
renderAll();renderGuide();fireIdle();save();
const h=(location.hash||'').slice(1);if(h==='guide'||h==='quickfire'||h==='fire')showTab(h==='guide'?'guide':'fire');
else if(matchMedia('(pointer:fine)').matches)cmdIn.focus({preventScroll:true});
})();
