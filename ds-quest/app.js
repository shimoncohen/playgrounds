(()=>{
'use strict';
const {CH,RANKS,QF,GUIDE,DEMOS,qfOpen,run:runCode,makeCtx,tipFor}=DSQ;
const KEY='ds-quest-v1';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fresh(){return {ch:0,mi:0,done:{},xp:0,best:0,badges:{},code:{},free:null,tab:'quest'}}
let S=fresh();
try{const raw=localStorage.getItem(KEY);if(raw){const o=JSON.parse(raw);if(o&&typeof o==='object')S=Object.assign(fresh(),o)}}catch(e){}
let saveT=0;function save(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}},200)}
if(S.ch>=CH.length)S.ch=0;

const codeEl=$('#code'),hlEl=$('#hl'),gutEl=$('#gutter'),bandEl=$('#band'),consoleEl=$('#console'),mapEl=$('#map'),missionEl=$('#mission'),chaptersEl=$('#chapters');
const mkey=()=>S.free?'free':S.ch+'.'+S.mi;
const curMission=()=>S.free?null:(CH[S.ch].missions[S.mi]||null);

/* ---------- syntax highlight ---------- */
const KW=new Set(['break','case','catch','class','const','continue','do','else','extends','finally','for','function','if','in','instanceof','let','new','of','return','static','super','this','throw','try','typeof','var','while']);
const CONST=new Set(['true','false','null','undefined','NaN','Infinity']);
const BI=new Set(['print','console','Map','Set','Array','Math','Object','Number','String','JSON']);
function highlight(src){let h='';const re=/(\/\/[^\n]*)|(`(?:\\.|[^`\\])*`?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(\b\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?\b)|([A-Za-z_$][\w$]*)|([^\/'"`A-Za-z_$\d]+|.)/g;let m;
  while((m=re.exec(src))){if(m[1])h+=`<span class="sy-cm">${esc(m[1])}</span>`;else if(m[2])h+=`<span class="sy-str">${esc(m[2])}</span>`;else if(m[3])h+=`<span class="sy-num">${esc(m[3])}</span>`;
    else if(m[4]){const w=m[4],next=src.slice(re.lastIndex).match(/^\s*\(/);h+=KW.has(w)?`<span class="sy-kw">${w}</span>`:CONST.has(w)?`<span class="sy-const">${w}</span>`:(BI.has(w)||next)?`<span class="sy-fn">${w}</span>`:esc(w)}
    else h+=esc(m[5])}return h}

/* ---------- editor ---------- */
let lastRes=null,errLine=null;
function lh(){const d=gutEl.firstElementChild;return d?d.getBoundingClientRect().height||22:22}
function renderEditor(){const v=codeEl.value;hlEl.innerHTML=highlight(v)+'\n ';const n=v.split('\n').length;
  let g='';for(let i=1;i<=n;i++)g+=`<div class="${i===errLine?'bad':''}">${i}</div>`;gutEl.innerHTML=g;placeBand()}
function placeBand(){if(!errLine){bandEl.hidden=true;return}bandEl.hidden=false;bandEl.classList.add('err');bandEl.style.top=(12+(errLine-1)*lh())+'px';bandEl.style.height=lh()+'px'}
function scrollToLine(line){const ed=$('#editor');const y=12+(line-1)*lh();if(y<ed.scrollTop+10||y>ed.scrollTop+ed.clientHeight-40)ed.scrollTop=Math.max(0,y-ed.clientHeight/2)}
function setCode(v){codeEl.value=v;S.code[mkey()]=v;save();clearRun();renderEditor()}
function insertText(t){codeEl.focus();if(!document.execCommand||!document.execCommand('insertText',false,t)){const a=codeEl.selectionStart,b=codeEl.selectionEnd;codeEl.setRangeText(t,a,b,'end');codeEl.dispatchEvent(new Event('input'))}}
let tabEscape=false;
codeEl.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run();return}
  if(e.key==='Escape'){tabEscape=true;return}
  if(e.key==='Tab'){if(tabEscape){tabEscape=false;return}e.preventDefault();const v=codeEl.value,a=codeEl.selectionStart,b=codeEl.selectionEnd;
    if(a!==b&&v.slice(a,b).includes('\n')||e.shiftKey){const ls=v.lastIndexOf('\n',a-1)+1;const block=v.slice(ls,b);const nb=e.shiftKey?block.replace(/^ {1,2}/gm,''):block.replace(/^/gm,'  ');
      codeEl.setSelectionRange(ls,b);insertText(nb);codeEl.setSelectionRange(ls,ls+nb.length);return}
    insertText('  ');return}
  tabEscape=false;
  if(e.key==='Enter'&&!e.shiftKey){const v=codeEl.value,a=codeEl.selectionStart;const ls=v.lastIndexOf('\n',a-1)+1;const line=v.slice(ls,a);let ind=(line.match(/^ */)||[''])[0];
    if(/[{(\[]\s*(\/\/.*)?$/.test(line))ind+='  ';e.preventDefault();insertText('\n'+ind);return}
  if(e.key==='Backspace'&&codeEl.selectionStart===codeEl.selectionEnd){const v=codeEl.value,a=codeEl.selectionStart;const ls=v.lastIndexOf('\n',a-1)+1;const before=v.slice(ls,a);
    if(before.length>=2&&/^ +$/.test(before)){e.preventDefault();const k=before.length%2||2;codeEl.setSelectionRange(a-k,a);insertText('')}}
});
codeEl.addEventListener('input',()=>{S.code[mkey()]=codeEl.value;save();if(lastRes)clearRun(true);renderEditor()});
$('#keys').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;if(k==='TAB')insertText('  ');else insertText(k)});
let armReset=0;$('#resetCode').addEventListener('click',e=>{const b=e.currentTarget;if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to reset';clearTimeout(armReset);armReset=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset code'},3000);return}
  b.classList.remove('armed');b.textContent='Reset code';const m=curMission();setCode(S.free?S.free.code:m?m.starter:'');codeEl.focus()});

/* ---------- run ---------- */
let lastCheck=null,pop=false;
function run(){const src=codeEl.value;const res=runCode(src);
  lastRes=res;errLine=res.error?res.error.line:null;lastCheck=null;const m=curMission();
  if(m){let r;try{r=m.check(makeCtx(src,res))}catch(e){r=tipFor(e)}
    if(!res.error&&r===true){lastCheck={win:true,first:!S.done[mkey()]};if(!S.done[mkey()]){S.done[mkey()]=true;S.xp+=10;
        const ch=CH[S.ch];if(!S.badges[S.ch]&&ch.missions.every((_,i)=>S.done[S.ch+'.'+i])){S.badges[S.ch]=true;S.xp+=25;lastCheck.badge=true}}
      pop=true;save()}
    else lastCheck={win:false,tip:typeof r==='string'?r:null}}
  renderConsole();renderMap(res);renderEditor();if(errLine)scrollToLine(errLine);if(lastCheck&&lastCheck.win){renderChapters();renderMission();renderXP()}}
function clearRun(keepMap){lastRes=null;errLine=null;lastCheck=null;renderConsole();if(keepMap)mapEl.classList.add('stale');else renderMap(null);placeBand()}
$('#run').addEventListener('click',run);

/* ---------- console ---------- */
const ERRS={
 ReferenceError:['A name was used that does not exist yet.','Check the spelling and the capital letters, and make sure the line that creates it (const x = ...) comes first.'],
 TypeError:['Something was used in a way its type does not allow. Very often a method or field was used on null or undefined.','If the message says reading "next" (or "left", "value") of null, you walked past the end of a chain or tree. Check for null before you step.'],
 SyntaxError:['The code is not written in a shape JavaScript understands.','Look for a missing bracket, brace, quote or comma, usually just before the place the message points to.'],
 RangeError:['A number went out of range. Often a function called itself so many times that it ran out of room.','Recursion needs a base case that stops it. Check what your function does for null or an empty array.'],
 EndlessLoop:['A loop kept going and never finished, or did far too much work.','Make sure something inside the loop changes so its condition becomes false, like moving on to node.next.']};
function renderConsole(){const r=lastRes;let h='<div class="ttl">Console</div>';
  if(!r){h+=`<pre class="sys">${S.free?'Free play. Write anything and press Run.':'Press Run to see what your code prints.'}</pre>`;consoleEl.innerHTML=h;return}
  h+=`<pre>${r.lines.length?esc(r.out):(!r.error?'<span class="sys">(nothing was printed)</span>':'')}</pre>`;
  if(r.error){const E=ERRS[r.error.type]||['Something went wrong while running.','Read the message and check the marked line.'];const lineTxt=r.error.line?(codeEl.value.split('\n')[r.error.line-1]||'').trim():'';
    const nice=r.error.type==='EndlessLoop'?'Stopped: too many steps':r.error.line?`${r.error.type} on line ${r.error.line}`:r.error.type;
    h+=`<div class="msg err"><span class="h">${esc(nice)}</span>${lineTxt?`<span class="py">line ${r.error.line}: ${esc(lineTxt)}</span>`:''}${r.error.type==='EndlessLoop'?'':`<span class="py">${esc(r.error.type)}: ${esc(r.error.msg)}</span>`}<p><b>What it means:</b> ${esc(E[0])}</p><p><b>How to fix it:</b> ${esc(E[1])}</p></div>`}
  if(lastCheck){if(lastCheck.win){const last=S.mi>=CH[S.ch].missions.length-1;
      h+=`<div class="msg win"><span class="h">${lastCheck.first?'Mission complete! +10 XP':'Mission complete'}${lastCheck.badge?' · Badge earned: '+esc(CH[S.ch].badge)+' +25 XP':''}</span><p>${winLine()}</p><button class="btn" data-act="next">${last?'Finish the chapter':'Next mission'} →</button></div>`}
    else if(lastCheck.tip)h+=`<div class="msg tip"><span class="h">${r.error?'Mission tip':'Not quite yet'}</span><p>${esc(lastCheck.tip)}</p></div>`}
  consoleEl.innerHTML=h;consoleEl.scrollTop=consoleEl.scrollHeight}
const WINS=['Look at the Structure view: that is the shape your code just built.','That works. Try changing a value and running again to see the picture change.','Clean. Every big program is made of small structures like this one.','Solid. You now know how this structure thinks.'];
function winLine(){return WINS[(S.ch*7+S.mi)%WINS.length]}
consoleEl.addEventListener('click',e=>{const b=e.target.closest('[data-act="next"]');if(b)gotoMission(S.ch,S.mi+1)});

/* ---------- structure view ---------- */
const MAXN=40;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function prim(v){const t=v===null?'NoneType':typeof v==='number'?'int':typeof v==='string'?'str':typeof v==='boolean'?'bool':typeof v==='function'?'function':'other';
  const txt=v===null?'null':v===undefined?'undefined':typeof v==='string'?JSON.stringify(v):typeof v==='function'?(v.name||'fn'):String(v);
  return `<span class="val t-${v===undefined?'NoneType':t}">${esc(txt)}</span>`}
const isNode=o=>o&&typeof o==='object'&&!Array.isArray(o)&&!(o instanceof Map)&&!(o instanceof Set);
const isLink=o=>isNode(o)&&own(o,'next')&&!own(o,'left')&&!own(o,'right');
const isTree=o=>isNode(o)&&(own(o,'left')||own(o,'right'));
const labelOf=o=>{for(const k of ['value','val','data','item','key','name'])if(own(o,k))return k;return null};
function nodeFace(n,d,seen){const k=labelOf(n);if(k)return view(n[k],d+1,seen);
  const ks=Object.keys(n).filter(x=>!['next','left','right'].includes(x));return ks.length?ks.map(x=>`<span class="pair"><b class="k">${esc(x)}</b>${view(n[x],d+1,seen)}</span>`).join(''):'<span class="empty">node</span>'}
function chain(n,d,seen){const nodes=[];let cur=n,loop=-1;const order=new Map();
  while(isLink(cur)&&nodes.length<MAXN){if(order.has(cur)){loop=order.get(cur);break}order.set(cur,nodes.length);nodes.push(cur);cur=cur.next}
  const more=isLink(cur)&&loop<0;
  const cells=nodes.map((x,i)=>`<div class="lnode" data-i="${i}"><div class="lv">${nodeFace(x,d,seen)}</div><span class="lp" aria-hidden="true">●</span></div><span class="arrow" aria-hidden="true">→</span>`).join('');
  const end=loop>=0?`<span class="loopback">↺ back to node ${loop+1}</span>`:more?'<span class="empty">… more</span>':cur===null||cur===undefined?'<span class="val t-NoneType">null</span>':view(cur,d+1,seen);
  return `<div class="coll t-list"><em>linked list · ${nodes.length} node${nodes.length===1?'':'s'}</em><div class="chain" role="img" aria-label="Linked list of ${nodes.length} nodes">${cells}${end}</div></div>`}
function tree(n,d,seen,budget){
  if(!isTree(n))return `<span class="nil">∅</span>`;
  if(budget.n<=0)return '<span class="empty">…</span>';budget.n--;
  const kids=[n.left,n.right],showKids=kids.some(isTree);
  return `<div class="tnode"><div class="tv" data-v="${esc(labelOf(n)?n[labelOf(n)]:'')}">${nodeFace(n,d,seen)}</div>${showKids?`<div class="tkids">${kids.map(k=>`<div class="tkid">${tree(k,d,seen,budget)}</div>`).join('')}</div>`:''}</div>`}
function view(v,d=0,seen=new Set()){
  if(v===null||typeof v!=='object')return prim(v);
  if(seen.has(v))return '<span class="loopback">↺ itself</span>';
  if(d>5)return '<span class="empty">…</span>';
  seen.add(v);let h;
  if(Array.isArray(v)){const shown=v.slice(0,MAXN);h=v.length?`<div class="coll t-list"><em>array · ${v.length}</em><div class="cells">${shown.map((x,i)=>`<div class="cell" data-i="${i}"><i>${i}</i>${view(x,d+1,seen)}</div>`).join('')}${v.length>MAXN?`<span class="empty">… ${v.length-MAXN} more</span>`:''}</div></div>`:'<span class="empty">empty array</span>'}
  else if(v instanceof Map){h=`<div class="coll t-dict"><em>map · ${v.size}</em>${v.size?[...v].slice(0,MAXN).map(([k,x])=>`<div class="pair" data-k="${esc(k)}">${view(k,d+1,seen)}<span class="ar">→</span>${view(x,d+1,seen)}</div>`).join(''):'<span class="empty">empty map</span>'}</div>`}
  else if(v instanceof Set){h=`<div class="coll t-bool"><em>set · ${v.size}</em>${v.size?`<div class="cells">${[...v].slice(0,MAXN).map(x=>`<div class="cell" data-v="${esc(x)}">${view(x,d+1,seen)}</div>`).join('')}</div>`:'<span class="empty">empty set</span>'}</div>`}
  else if(isLink(v))h=chain(v,d,seen);
  else if(isTree(v))h=`<div class="coll t-dict"><em>binary tree</em><div class="tree" role="img" aria-label="Binary tree">${tree(v,d,seen,{n:31})}</div></div>`;
  else{const ks=Object.keys(v),cn=v.constructor&&v.constructor!==Object?v.constructor.name:'object';
    h=`<div class="coll t-other"><em>${esc(cn)}</em>${ks.length?ks.map(k=>`<div class="pair"><b class="k">${esc(k)}</b>${view(v[k],d+1,seen)}</div>`).join(''):'<span class="empty">no fields</span>'}</div>`}
  seen.delete(v);return h}
function varsHTML(res){
  const vars=res.names.filter(n=>res.vars[n]!==undefined&&typeof res.vars[n]!=='function');
  const fns=res.names.filter(n=>typeof res.vars[n]==='function');
  let h='';
  if(vars.length)h+=`<div class="frame">${vars.map(n=>`<div class="var"><span class="vname">${esc(n)}</span><div class="vbox">${view(res.vars[n])}</div></div>`).join('')}</div>`;
  if(fns.length)h+=`<div class="frame fn"><div class="fh"><span>Defined</span></div><div class="defs">${fns.map(n=>`<span class="val t-function"><em>${/^class\b/.test(Function.prototype.toString.call(res.vars[n]))?'class':'fn'}</em>${esc(n)}</span>`).join('')}</div></div>`;
  return h}
function renderMap(res){mapEl.classList.remove('stale');
  if(!res){$('#mapSub').textContent='Whatever your code builds is drawn here: rows, chains, maps and trees.';
    mapEl.innerHTML='<div class="mapEmpty"><p>Press Run and your variables appear here as pictures.</p><div class="demo"><div class="coll t-list"><em>array · 3</em><div class="cells"><div class="cell"><i>0</i><span class="val t-int">7</span></div><div class="cell"><i>1</i><span class="val t-int">8</span></div><div class="cell"><i>2</i><span class="val t-int">9</span></div></div></div></div></div>';return}
  const h=varsHTML(res);
  $('#mapSub').textContent=res.error?'Your code stopped early. These are the names it defines.':h?'What your program left behind when it finished.':'Nothing to draw yet.';
  mapEl.innerHTML=h||'<div class="mapEmpty"><p>No variables to draw. Make one with <code>const</code> and run again.</p></div>'}

/* ---------- mission panel ---------- */
function anatomy(t){if(!t)return '';const L={fn:'function',str:'text',num:'number',var:'variable',kw:'keyword',op:'operator',br:'brackets',cm:'comment'};
  return `<div class="anat" aria-label="Parts of the code">${t.map(([s,k,l])=>`<div class="tok k-${k}"><b>${esc(s)}</b><span>${esc(l||L[k]||k)}</span></div>`).join('')}</div>`}
const totalDone=ci=>CH[ci].missions.filter((_,i)=>S.done[ci+'.'+i]).length;
function renderChapters(){chaptersEl.innerHTML=CH.map((c,i)=>`<button class="chap${S.badges[i]?' earned':''}" data-ch="${i}" aria-current="${i===S.ch&&!S.free}"><span class="num">${S.badges[i]?'★':i+1}</span><span class="nm">${esc(c.name)}</span><span class="ct">${totalDone(i)}/${c.missions.length}</span></button>`).join('')}
function renderMission(){
  if(S.free){missionEl.innerHTML=`<span class="freeTag">Free play</span><h2>Your sandbox</h2><p class="explain">Experiment with anything here. Nothing is checked and nothing can break. The Structure view draws whatever you build.</p>
    <p class="note">Tip: build a small structure, run it, then change one thing and run again. Predict the picture first.</p><div class="actions"><button class="btn" data-act="back">Back to Chapter ${S.ch+1}, mission ${Math.min(S.mi+1,CH[S.ch].missions.length)}</button></div>`;return}
  const ch=CH[S.ch],n=ch.missions.length;
  const dots=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((m,i)=>`<button class="dot${S.done[S.ch+'.'+i]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(m.title)}" aria-label="Mission ${i+1}: ${esc(m.title)}">${i+1}</button>`).join('')}</div>`;
  let h;
  if(S.mi>=n){const all=totalDone(S.ch)===n,last=S.ch===CH.length-1;
    h=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art${all?'':' dim'}">${all?'★':S.ch+1}</div>
    <h2>${last?'You finished Data Structures Quest':all?'Badge earned: '+esc(ch.badge):'Chapter finished'}</h2>
    <p class="explain">${last?'You have built arrays, stacks, queues, linked lists, maps, sets and trees by hand. You know what each one is good at, and that is the heart of choosing the right tool.':'You can now use these in your own programs:'}</p>
    <div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
    ${last?`<p class="note">Next: play Quick-fire until you can picture the data at a glance, then check the field guide for which structure to pick and what each costs.</p><div class="actions"><button class="btn" data-act="tab-fire">Play Quick-fire</button><button class="btn ghost" data-act="tab-guide">Open the field guide</button></div>`
      :`<div class="actions"><button class="btn" data-act="nextch">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button><button class="btn ghost" data-act="free">Free play</button></div>`}${dots}`}
  else{const m=ch.missions[S.mi];
    h=`<div class="eyebrow">Chapter ${S.ch+1} · Mission ${S.mi+1} of ${n}${S.done[S.ch+'.'+S.mi]?' · done ✓':''}</div>
    ${S.mi===0?`<p class="intro">${ch.intro}</p>`:''}
    <h2>${esc(m.title)}</h2>
    <div class="goal"><div class="label">Your goal</div><p>${m.goal}</p></div>
    ${anatomy(m.anat)}
    ${HowSteps.html(m.how)}
    <p class="explain">${m.explain}</p>
    ${m.note?`<p class="note">${m.note}</p>`:''}
    <div class="actions"><button class="btn ghost" data-act="hint" aria-expanded="false">Show a hint</button><button class="btn ghost" data-act="fill">Type it for me</button>${DEMOS.some(d=>d.ch===S.ch)?'<button class="btn ghost" data-act="watch">Watch it work</button>':''}</div>
    <div class="hint" id="hintBox" hidden><span>One way to write it:</span><pre>${highlight(m.answer)}</pre></div>${dots}`}
  missionEl.innerHTML=h;if(pop){missionEl.classList.remove('pop');void missionEl.offsetWidth;missionEl.classList.add('pop');pop=false}}
missionEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mi!==undefined){gotoMission(S.ch,+b.dataset.mi);return}const a=b.dataset.act;
  if(a==='hint'){const hb=$('#hintBox');hb.hidden=!hb.hidden;b.setAttribute('aria-expanded',String(!hb.hidden));b.textContent=hb.hidden?'Show a hint':'Hide the hint'}
  else if(a==='fill'){const m=curMission();if(m){setCode(m.answer);codeEl.focus()}}
  else if(a==='watch')watchDemo(S.ch);
  else if(a==='nextch')gotoMission(S.ch+1,0);else if(a==='back'){S.free=null;loadMission()}
  else if(a==='free'){goFree('// Free play: try anything!\n')}else if(a&&a.startsWith('tab-'))showTab(a.slice(4))});
chaptersEl.addEventListener('click',e=>{const b=e.target.closest('.chap');if(!b)return;const ci=+b.dataset.ch;const ch=CH[ci];let mi=ch.missions.findIndex((_,i)=>!S.done[ci+'.'+i]);if(mi<0)mi=0;gotoMission(ci,mi)});
function gotoMission(ci,mi){S.free=null;S.ch=ci;S.mi=mi;save();loadMission();if(innerWidth<820)missionEl.scrollIntoView({behavior:'smooth',block:'start'})}
function loadMission(){const m=curMission();const k=mkey();codeEl.value=S.free?S.free.code:S.code[k]!==undefined?S.code[k]:m?m.starter:'';
  $('#fileName').textContent=S.free?'sandbox.js':m?`mission_${S.ch+1}_${S.mi+1}.js`:'quest.js';$('#edNote').textContent=S.free?'Free play':m?'Write your code here':'Chapter complete';
  clearRun();renderChapters();renderMission();renderEditor()}
function goFree(code){S.free={code};S.code.free=code;save();showTab('quest');loadMission();codeEl.focus()}

/* ---------- XP ---------- */
function renderXP(){let i=0;while(i+1<RANKS.length&&S.xp>=RANKS[i+1][0])i++;const lo=RANKS[i][0],hi=i+1<RANKS.length?RANKS[i+1][0]:lo;
  $('#rank').textContent=RANKS[i][1];$('#xpText').textContent=S.xp+' XP';$('#xpFill').style.width=(hi>lo?Math.min(100,(S.xp-lo)/(hi-lo)*100):100)+'%'}

/* ---------- tabs ---------- */
function showTab(t){S.tab=t;save();document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  ['quest','fire','guide'].forEach(x=>$('#tab-'+x).hidden=x!==t);if(t!=='fire')stopFire(true);if(t==='guide'&&!$('#guide').innerHTML)renderGuide();if(t==='fire'&&!fireOn)fireIdle()}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)showTab(b.dataset.tab)});
document.querySelector('.tabs').addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const bs=[...document.querySelectorAll('.tabs button')];let i=bs.findIndex(b=>b.getAttribute('aria-selected')==='true');i=(i+(e.key==='ArrowRight'?1:bs.length-1))%bs.length;showTab(bs[i].dataset.tab);bs[i].focus()});

/* ---------- quick-fire ---------- */
const fStage=$('#fStage');let fireOn=false,fT=0,fLeft=75,fScore=0,fStreak=0,fQ=null,fDeck=[],fMiss=[],fLocked=false;
function setStats(){$('#fScore').textContent=fScore;$('#fStreak').textContent=fStreak;$('#fBest').textContent=S.best;$('#fTime').textContent=fLeft;$('#fTimer').style.width=(fLeft/75*100)+'%'}
function fireIdle(){const open=qfOpen(S.done);
  if(!open.length){fStage.innerHTML=`<div class="example panel" style="padding:12px 14px;border-style:dashed;display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Locked for now</span><p class="explain" style="margin:0">Quick-fire only asks about things the quest has already taught. Finish all of <b>Chapter 1: ${esc(CH[0].name)}</b> first, and the first questions open up. Each later chapter you finish adds more.</p></div>
  <div class="actions"><button class="btn" id="fGo">Go to the quest</button></div>`;setStats();return}
  const ex=QF[1],more=open.length<QF.length;
  fStage.innerHTML=`<div class="example panel" style="padding:12px 14px;border-style:dashed;display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Example round</span><pre class="snippet">${highlight(ex.c)}</pre><p class="note" style="margin:0">Pick the output: <code>3</code>, <code>4</code> or <code>5</code>? The answer is <code>4</code>. ${esc(ex.why)}</p></div>
  ${more?`<p class="note" style="margin:0">${open.length} of ${QF.length} questions are open. Finish more chapters to unlock the rest.</p>`:''}
  <div class="actions"><button class="btn" id="fStart">Start the clock</button><span class="note" style="align-self:center">Keys <kbd>1</kbd>–<kbd>4</kbd> pick an answer.</span></div>`;setStats()}
function answerOf(q){if(q.ans===undefined)q.ans=runCode(q.c).out;return q.ans}
function nextQ(){if(!fDeck.length)fDeck=qfOpen(S.done).sort(()=>Math.random()-.5);fQ=fDeck.pop();const ans=answerOf(fQ);
  const opts=[ans,...fQ.w.filter(w=>w!==ans).slice(0,3)].sort(()=>Math.random()-.5);fQ.opts=opts;fLocked=false;
  fStage.innerHTML=`<div class="task">What does this print?</div><pre class="snippet">${highlight(fQ.c)}</pre><div class="opts">${opts.map((o,i)=>`<button class="opt" data-i="${i}"><span class="n">${i+1}</span><pre>${esc(o)}</pre></button>`).join('')}</div>
  <p class="fb" id="fFb" aria-live="polite"></p><div class="actions"><button class="btn ghost" id="fStop">End round</button></div>`;fStage.querySelector('.opt').focus({preventScroll:true})}
function pick(i){if(!fireOn||fLocked||!fQ)return;fLocked=true;const ans=fQ.ans,ok=fQ.opts[i]===ans;const bs=[...fStage.querySelectorAll('.opt')];
  bs.forEach((b,j)=>{b.disabled=true;if(fQ.opts[j]===ans)b.classList.add('right');else if(j===i)b.classList.add('wrong')});const fb=$('#fFb');
  if(ok){fStreak++;const pts=10+Math.min(fStreak-1,5)*2;fScore+=pts;fb.className='fb good';fb.textContent=`Correct! +${pts}${fStreak>1?` (streak ${fStreak})`:''}`}
  else{fStreak=0;fMiss.push(fQ);fb.className='fb bad';fb.textContent='Not this time. '+fQ.why}
  setStats();setTimeout(()=>{if(fireOn)nextQ()},ok?650:2200)}
function startFire(){if(!qfOpen(S.done).length){fireIdle();return}fDeck=[];fireOn=true;fLeft=75;fScore=0;fStreak=0;fMiss=[];setStats();nextQ();clearInterval(fT);fT=setInterval(()=>{fLeft--;setStats();if(fLeft<=0)stopFire()},1000)}
function stopFire(silent){if(!fireOn)return;fireOn=false;clearInterval(fT);if(silent){fireIdle();return}if(fScore>S.best){S.best=fScore;save()}setStats();
  fStage.innerHTML=`<div class="task">Round over: ${fScore} points</div><p class="note" style="margin:0">${fScore>=S.best&&fScore>0?'That is your best score so far.':`Your best is ${S.best}.`}</p>
  ${fMiss.length?`<div><p class="explain" style="margin:0 0 8px"><b>Review these:</b></p><ul class="misses">${fMiss.map((q,i)=>`<li><pre class="snippet">${highlight(q.c)}</pre><div class="row"><span>Prints <code>${esc(q.ans)}</code></span><span class="note">${esc(q.why)}</span><button class="try" data-miss="${i}">Try it</button></div></li>`).join('')}</ul></div>`:'<p class="explain" style="margin:0">No misses. Excellent reading.</p>'}
  <div class="actions"><button class="btn" id="fStart">Play again</button></div>`}
fStage.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='fStart')startFire();else if(b.id==='fGo')showTab('quest');else if(b.id==='fStop')stopFire();else if(b.dataset.i!==undefined)pick(+b.dataset.i);else if(b.dataset.miss!==undefined)goFree(fMiss[+b.dataset.miss].c)});
document.addEventListener('keydown',e=>{if(!fireOn||$('#tab-fire').hidden)return;if(/^[1-4]$/.test(e.key)){e.preventDefault();pick(+e.key-1)}});

/* ---------- field guide ---------- */
function exViz(c){const r=runCode(c);const h=varsHTML(r);const out=r.lines.length?`<div class="exout"><span>prints</span><pre>${esc(r.out)}</pre></div>`:'';
  return h||out?`<div class="exviz" role="group" aria-label="What this code builds">${h}${out}</div>`:''}
function exHTML(g){return `<div class="ex">${g.ex.map(([c,n])=>`<div class="exrow"><pre class="snippet">${highlight(c)}</pre>${exViz(c)}<div class="meta">${n?`<small>// ${esc(n)}</small>`:''}<button class="try" data-code="${esc(c)}">Try it</button></div></div>`).join('')}</div>`}
const PICK=[['Array','a numbered row','read by position, add and remove at the end','array[i], push, pop'],['Stack','a pile of plates','undo, back button, matching brackets','push, pop, peek'],['Queue','a line at the shop','fair turns, jobs waiting to run','enqueue, dequeue'],['Linked list','a chain of nodes','add or remove at the front, walk in order','head, next'],['Map','labelled boxes','look something up by a key','set, get, has'],['Set','a bag of unique things','"seen it before?" and removing duplicates','add, has'],['Binary search tree','a branching decision','keeping values sorted and searching fast','insert, contains']];
const COST=[['Read array[i]','instant'],['Push or pop at the end','instant'],['Shift from the front of an array','slow for big arrays: everything moves'],['Add at the front of a linked list','instant'],['Find a value in a linked list','walk the chain: time grows with its length'],['Map or Set lookup','almost instant'],['Search a search tree that is not lopsided','halves the work each step']];
function renderGuide(){const groups=CH.map(c=>c.name);
  $('#guide').innerHTML=`<div><h2>Field guide</h2><p class="lede">Everything from the quest on one page. Every example has a Try it button that opens it in the editor and runs it, so you can see the structure.</p></div>
  <section class="gsec"><h3>Which structure when?</h3><div class="panel" style="padding:6px 10px;overflow-x:auto"><table class="gtable"><thead><tr><th>Structure</th><th>Think of</th><th>Use it for</th><th>Main actions</th></tr></thead><tbody>${PICK.map(r=>`<tr>${r.map((x,i)=>`<td>${i===0?'<b>'+esc(x)+'</b>':esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
  <section class="gsec" id="demos"><h3>See each structure work</h3><p class="explain" style="margin:0 0 10px">Press the buttons. Each one runs a real operation on a real structure, plays what the computer does step by step, and says what happened.</p><div class="demos">${DEMOS.map(d=>`<article class="panel demo" id="demo-${d.id}" data-d="${d.id}"></article>`).join('')}</div></section>
  <section class="gsec"><h3>What things cost</h3><div class="panel" style="padding:6px 10px;overflow-x:auto"><table class="gtable"><thead><tr><th>Action</th><th>How fast</th></tr></thead><tbody>${COST.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
  <section class="gsec"><h3>Reading an error</h3><div class="errdemo"><div class="console"><div class="ttl">Console</div><div class="msg err" style="margin-top:4px"><span class="h">TypeError on line 4</span><span class="py">line 4: node = node.next.next;</span><span class="py">TypeError: Cannot read properties of null (reading 'next')</span></div></div>
    <ol><li><b>Find the line number.</b> The editor marks it in red.</li><li><b>Read the error type.</b> TypeError means a value was the wrong kind for the job.</li><li><b>Read the message.</b> "Reading 'next' of null" means the thing before the dot is null: you stepped off the end of the chain.</li><li><b>Guard the step.</b> Check <code>node !== null</code> before you read <code>node.next</code>.</li></ol></div></section>
  ${groups.map((gname,gi)=>{const items=GUIDE.filter(g=>g.ch===gi);return items.length?`<section class="gsec"><h3>Chapter ${gi+1}: ${esc(gname)}</h3><div class="cards">${items.map(g=>`<article class="card panel"><h4>${esc(g.c)}</h4><p>${esc(g.what)}</p>${anatomy(g.syn)}${exHTML(g)}</article>`).join('')}</div></section>`:''}).join('')}
  <section class="gsec"><h3>Run JavaScript on your computer</h3><div class="os">
    <article class="card panel"><h4>In your browser</h4><p>Press <kbd>F12</kbd> (or Cmd+Option+J on a Mac) and open the <b>Console</b> tab. Paste your code there. Use <code>console.log</code> instead of <code>print</code>.</p></article>
    <article class="card panel"><h4>With Node.js</h4><p>Install Node.js from nodejs.org, save your code as <code>game.js</code> and run <code>node game.js</code> in a terminal. Replace <code>print</code> with <code>console.log</code>.</p></article>
  </div></section>
  <section class="gsec"><h3>After this course</h3><div class="panel" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px"><p class="explain">Good next topics, roughly in order: sorting and binary search, heaps and priority queues, graphs (nodes joined by any number of edges, like a map of roads), and tries for fast word lookup. Visualgo.net animates many of these. The Python Quest and Script Quest playgrounds on the home page teach the languages themselves.</p>
   <div class="actions"><button class="linkbtn" id="resetProgress">Reset all progress</button></div></div></section>`;
  for(const id in DTIMER)clearTimeout(DTIMER[id]);for(const id in DTIMER)delete DTIMER[id];initDemos()}
/* ---------- explainer demos ---------- */
const DST={},DTIMER={};
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const sel=h=>h.i!==undefined?`[data-i="${h.i}"]`:h.v!==undefined?`[data-v="${h.v}"]`:`[data-k="${h.k}"]`;
function demoBody(d){const st=DST[d.id];return d.render?d.render(st):`<div class="var"><span class="vname">${esc(d.name)}</span><div class="vbox">${view(st.v)}</div></div>`}
function paintDemo(el,d,hi,cls){const box=el.querySelector('.demoView');box.querySelectorAll('.hi,.walk').forEach(x=>x.classList.remove('hi','walk'));
  for(const h of hi||[])box.querySelectorAll(sel(h)).forEach(x=>x.classList.add(cls))}
function renderDemo(d,msg){const el=document.getElementById('demo-'+d.id);if(!el)return;const busy=!!DTIMER[d.id];
  el.innerHTML=`<h4>${esc(d.title)}</h4><p class="explain">${d.about}</p><div class="demoView">${demoBody(d)}</div>
  <div class="demobar" role="group" aria-label="Operations">${d.ops.map((o,i)=>`<button class="dbtn" data-demo="${d.id}" data-op="${i}"${busy?' disabled':''}>${esc(o.label)}</button>`).join('')}<button class="linkbtn" data-demo="${d.id}" data-op="reset"${busy?' disabled':''}>Reset</button></div>
  <pre class="democode" aria-label="Code that ran">${msg&&msg.code?highlight(msg.code):'<span class="sy-cm">// press a button to run an operation</span>'}</pre>
  <p class="demosay" aria-live="polite">${msg?msg.say:'Pick an operation above. Try them in different orders and watch what happens.'}</p>`}
function runDemo(id,op){const d=DEMOS.find(x=>x.id===id);if(!d||DTIMER[id])return;
  if(op==='reset'||!DST[id]){DST[id]={v:d.init()};renderDemo(d);return}
  const r=d.ops[+op].run(DST[id]);renderDemo(d,r);const el=document.getElementById('demo-'+id);
  const fin=()=>{DTIMER[id]=0;paintDemo(el,d,r.hi,'hi');el.querySelectorAll('.dbtn,[data-op="reset"]').forEach(b=>b.disabled=false)};
  if(r.walk&&r.walk.length&&!reduced()){let k=0;DTIMER[id]=1;el.querySelectorAll('.dbtn,[data-op="reset"]').forEach(b=>b.disabled=true);
    const step=()=>{if(k>=r.walk.length){fin();return}paintDemo(el,d,r.walk[k++],'walk');DTIMER[id]=setTimeout(step,420)};step()}
  else paintDemo(el,d,r.hi,'hi')}
function initDemos(){for(const d of DEMOS){DST[d.id]={v:d.init()};renderDemo(d)}}
function watchDemo(ch){showTab('guide');const d=DEMOS.find(x=>x.ch===ch);const el=d&&document.getElementById('demo-'+d.id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
let armProg=0;$('#guide').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.demo){runDemo(b.dataset.demo,b.dataset.op);return}if(b.dataset.code!==undefined){goFree(b.dataset.code);run();return}
  if(b.id==='resetProgress'){if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to erase XP, badges and saved code';clearTimeout(armProg);armProg=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset all progress'},4000);return}
    S=fresh();save();renderXP();showTab('quest');loadMission()}});

/* ---------- boot ---------- */
window.addEventListener('resize',()=>placeBand());
renderXP();loadMission();showTab(S.tab==='guide'||S.tab==='fire'?S.tab:'quest');
})();
