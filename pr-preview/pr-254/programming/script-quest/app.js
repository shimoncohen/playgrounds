
(()=>{
"use strict";
// ================= ENGINE =================
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tagOf=v=>Object.prototype.toString.call(v).slice(8,-1);
const decl=(src,n)=>new RegExp('\\b(?:let|const|var)\\b[^;\\n]*\\b'+n+'\\b|\\b(?:function|class)\\s+'+n+'\\b').test(src||'');
const SCQ=window.SCQ;
SCQ.engine={decl,tagOf};
const {CH,FIRE,qfOpen,BLOCKS,tiers}=SCQ;
const realmsHost=$('#realms');
const {init:initRealm,makeRealm,killRealm,runScript,prepare,isIncomplete,method}=window.JSRealm;
const {NODE_VERSION,FakeBuffer,make:makeNodeEnv,curl:nodeCurl}=window.NodeEnv;
const {init:initTS,check:tsCheck,load:loadTS}=window.TSCheck;
initRealm({host:realmsHost});
initTS({document});


/* ---------- value formatting ---------- */
let refIds=new WeakMap(),refN=0;
const refId=o=>{if(!refIds.has(o))refIds.set(o,++refN);return refIds.get(o)};
const promState=new WeakMap();
let onPromSettle=()=>{};
function pstate(p){
  if(!promState.has(p)){const st={s:'pending'};promState.set(p,st);
    try{p.then(v=>{st.s='fulfilled';st.v=v;onPromSettle()},e=>{st.s='rejected';st.v=e;onPromSettle()})}catch(e){}}
  return promState.get(p);
}
function fnSig(f){
  let s='';try{s=Function.prototype.toString.call(f)}catch(e){}
  if(/^class\b/.test(s))return {cls:true,txt:'class '+(f.name||'')};
  const asy=/^async\b/.test(s)?'async ':'';
  let m=s.match(/^(?:async\s*)?(?:function\s*\*?\s*[\w$]*\s*)?\(([^)]*)\)/);
  let params=m?m[1]:(s.match(/^(?:async\s+)?([\w$]+)\s*=>/)||[])[1]||'';
  params=params.replace(/\s+/g,' ').trim();
  const arrow=/=>/.test(s.split('{')[0])&&!/^(async\s*)?function/.test(s);
  return {cls:false,txt:asy+(arrow?'('+params+') => …':'ƒ '+(f.name||'anonymous')+'('+params+')')};
}
function fmt(v,depth=0,raw=false){
  const t=typeof v;
  if(v===undefined)return '<span class="v-u">undefined</span>';
  if(v===null)return '<span class="v-u">null</span>';
  if(t==='string')return raw?esc(v):'<span class="v-s">'+esc(JSON.stringify(v))+'</span>';
  if(t==='number'||t==='bigint')return '<span class="v-n">'+esc(Object.is(v,-0)?'-0':String(v)+(t==='bigint'?'n':''))+'</span>';
  if(t==='boolean')return '<span class="v-b">'+v+'</span>';
  if(t==='symbol')return '<span class="v-c">'+esc(String(v))+'</span>';
  if(t==='function'){const s=fnSig(v);return '<span class="v-f">'+esc(s.cls?s.txt:s.txt)+'</span>'}
  if(v instanceof FakeBuffer){const hex=[...v._s].slice(0,12).map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(' ');return '<span class="v-c">&lt;Buffer '+hex+(v._s.length>12?' …':'')+'&gt;</span>'}
  const tg=tagOf(v);
  if(tg==='Error'||(v&&typeof v.message==='string'&&typeof v.name==='string'&&'stack' in v))return '<span class="v-e">'+esc(v.name+': '+v.message)+'</span>';
  if(tg==='Promise'){const st=pstate(v);return '<span class="v-c">Promise</span> {'+(st.s==='pending'?'<span class="v-u">&lt;pending&gt;</span>':(st.s==='rejected'?'<span class="v-e">&lt;rejected&gt;</span> ':'')+fmt(st.v,depth+1))+'}'}
  if(tg==='Date')return '<span class="v-c">'+esc(isNaN(v)?'Invalid Date':v.toISOString())+'</span>';
  if(tg==='RegExp')return '<span class="v-c">'+esc(String(v))+'</span>';
  if(tg==='Map'){if(depth>2)return 'Map('+v.size+')';return 'Map('+v.size+') {'+[...v].slice(0,10).map(([k,x])=>fmt(k,depth+1)+' =&gt; '+fmt(x,depth+1)).join(', ')+'}'}
  if(tg==='Set'){if(depth>2)return 'Set('+v.size+')';return 'Set('+v.size+') {'+[...v].slice(0,15).map(x=>fmt(x,depth+1)).join(', ')+'}'}
  if(Array.isArray(v)){
    if(depth>2)return '[Array('+v.length+')]';
    const items=[];for(let i=0;i<Math.min(v.length,25);i++)items.push(i in v?fmt(v[i],depth+1):'<span class="v-u">empty</span>');
    if(v.length>25)items.push('<span class="v-u">… '+(v.length-25)+' more</span>');
    return '['+items.join(', ')+']';
  }
  if(t==='object'){
    let ctor='';try{const p=Object.getPrototypeOf(v);ctor=p&&p.constructor&&p.constructor.name!=='Object'?p.constructor.name+' ':''}catch(e){}
    if(depth>2)return ctor+'{…}';
    let keys=[];try{keys=Object.keys(v)}catch(e){}
    const parts=keys.slice(0,20).map(k=>'<span class="v-k">'+esc(/^[A-Za-z_$][\w$]*$/.test(k)?k:JSON.stringify(k))+'</span>: '+fmt(v[k],depth+1));
    if(keys.length>20)parts.push('…');
    return esc(ctor)+(parts.length?'{ '+parts.join(', ')+' }':'{}');
  }
  return esc(String(v));
}
const toText=html=>{const d=document.createElement('div');d.innerHTML=html;return d.textContent};
function fmtArgs(a){return a.map(x=>fmt(x,0,typeof x==='string')).join(' ')}
function tableHTML(v){
  if(!v||typeof v!=='object')return fmt(v);
  const rows=Array.isArray(v)?v.map((x,i)=>[i,x]):Object.keys(v).map(k=>[k,v[k]]);
  const cols=[];rows.forEach(([,x])=>{if(x&&typeof x==='object')Object.keys(x).forEach(k=>{if(!cols.includes(k))cols.push(k)})});
  const prim=rows.some(([,x])=>!x||typeof x!=='object');
  let h='<div class="tblwrap"><table class="ctable"><tr><th>(index)</th>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+(prim?'<th>Values</th>':'')+'</tr>';
  rows.forEach(([k,x])=>{h+='<tr><td>'+esc(k)+'</td>'+cols.map(c=>'<td>'+(x&&typeof x==='object'&&c in x?fmt(x[c],2):'')+'</td>').join('')+(prim?'<td>'+(!x||typeof x!=='object'?fmt(x,2):'')+'</td>':'')+'</tr>'});
  return h+'</table></div>';
}




// ================= UI =================
const KEY='script-quest-v1';
const RUNS={'greet.js':'node greet.js Pepper','package.json':'npm start','math.js':null};
CH.forEach(ch=>ch.missions.forEach(m=>{if(m.editFile&&!('run' in m))m.run=m.editFile in RUNS?RUNS[m.editFile]:'node '+m.editFile}));
/* the starter files live in window.PROGRESS so shared/progress.js can tell an untouched project from an edited one */
const INITIAL_FILES=window.PROGRESS.defaults.files;
let S={xp:0,done:{},chap:0,cur:{},best:0,files:null,pkgs:[]};
try{const raw=localStorage.getItem(KEY);if(raw)S=Object.assign(S,JSON.parse(raw))}catch(e){}
if(!S.files)S.files={...INITIAL_FILES};
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const mk=(i,j)=>i+'-'+j;
const hasF=k=>Object.prototype.hasOwnProperty.call(S.files,k);

/* ---------- console screen ---------- */
const screen=$('#screen'),term=$('#term'),cmd=$('#cmd'),promptEl=$('#prompt');
function line(html,cls=''){const d=document.createElement('div');d.className='line '+cls;d.innerHTML=html;screen.appendChild(d);
  while(screen.childNodes.length>600)screen.firstChild.remove();term.scrollTop=term.scrollHeight;return d}
function clearScreen(){screen.innerHTML=''}
const KW=/^(const|let|var|function|return|if|else|for|while|of|in|new|class|async|await|try|catch|throw|typeof|interface|type|true|false|null|undefined|break|continue|this|export|import|require|switch|case|default)$/;
function hl(src){
  return src.replace(/(\/\/[^\n]*)|(`(?:\\.|[^`\\])*`?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([^])/g,(m,c,s,n,id,o)=>{
    if(c)return '<span class="v-u">'+esc(c)+'</span>';if(s)return '<span class="v-s">'+esc(s)+'</span>';if(n)return '<span class="v-n">'+esc(n)+'</span>';
    if(id)return KW.test(id)?'<span class="v-b">'+id+'</span>':esc(id);return esc(o)});
}
function echoInput(src,pr){const ls=src.split('\n');const pad=' '.repeat(Math.max(0,pr.length-4))+'... ';
  line(ls.map((l,i)=>'<span class="pr">'+esc(i?pad:pr)+'</span>'+(MODE==='sh'?esc(l):hl(l))).join('\n'),'in')}

/* ---------- JS / TS runtime ---------- */
let MODE='js',REALM=null,HIST=[],DECLS=new Map(),TYPES=new Map(),RUN=null,SYNC=false;
const hooks={
  out(level,args){
    let html,text;
    if(level==='table'){html=tableHTML(args[0]);text=toText(fmt(args[0]))}
    else if(level==='echo'){html='<span class="arrow">← </span>'+fmt(args[0]);text=toText(fmt(args[0]));line(html,'echo');afterAsync();return}
    else if(level==='raw'){html=esc(args[0]);text=args[0]}
    else{html=fmtArgs(args);text=toText(html)}
    line(html,level==='warn'?'warn':level==='error'?'err':'');
    if(RUN){RUN.logs.push(text);if(RUN.out)RUN.out.push(text)}
    afterAsync();
  },
  asyncErr(e,prom){line('Uncaught'+(prom?' (in promise)':'')+' '+esc(errName(e)),'err');afterAsync()},
  clear(){clearScreen()},
};
function errName(e){if(e&&typeof e==='object'&&'message' in e)return (e.name||'Error')+': '+e.message;return String(e)}
function afterAsync(){if(!SYNC){schedMem();if(RUN&&Date.now()-RUN.t<20000)tryComplete()}}
window.__asyncOutHook=v=>hooks.out('echo',[v]);
function bootRealm(){const R=makeRealm(hooks);R.w.__asyncOut=v=>{if(v!==undefined)hooks.out('echo',[v])};return R}
function freshConsole(){killRealm(REALM);REALM=bootRealm();HIST=[];DECLS=new Map();TYPES=new Map();prevSnap={}}
const REPLAY_BAD=/setTimeout|setInterval|\.then\s*\(|\.catch\s*\(|\bawait\b|console\.clear/;
function rebuild(entries){
  const old=REALM;REALM=bootRealm();REALM.silent=true;
  const w=REALM.w,st=w.setTimeout,si=w.setInterval;w.setTimeout=()=>0;w.setInterval=()=>0;
  HIST=[];DECLS=new Map();TYPES=new Map();
  for(const e of entries){
    if(!e.replay)continue;
    const er=e.code?runScript(REALM,e.code):null;
    if(!er){HIST.push(e);e.decls.forEach(d=>DECLS.set(d.name,d.kind));(e.types||[]).forEach(t=>TYPES.set(t.name,t))}
  }
  w.setTimeout=st;w.setInterval=si;REALM.silent=false;killRealm(old);
}
function constAssign(ast){
  let bad=null;
  (function walk(n){if(!n||bad||typeof n.type!=='string')return;
    if((n.type==='AssignmentExpression'&&n.left.type==='Identifier'&&DECLS.get(n.left.name)==='const')||(n.type==='UpdateExpression'&&n.argument.type==='Identifier'&&DECLS.get(n.argument.name)==='const'))bad=n.left?n.left.name:n.argument.name;
    for(const k in n){const v=n[k];if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v.type==='string')walk(v)}})(ast);
  return bad;
}
// run JS source in the console realm. meta: {ts, types}
function execJS(src,meta={}){
  const p=prepare(src);
  if(p.error)return {err:p.error};
  const names=p.decls.map(d=>d.name).concat((meta.types||[]).map(t=>t.name));
  const clash=names.filter(n=>DECLS.has(n)||TYPES.has(n));
  if(clash.length&&method()==='insert')rebuild(HIST.filter(h=>!h.decls.some(d=>clash.includes(d.name))&&!(h.types||[]).some(t=>clash.includes(t.name))));
  if(method()==='eval'){
    clash.forEach(n=>{try{Object.defineProperty(REALM.w,n,{writable:true})}catch(e){}});
    if(p.ast){const b=constAssign(p.ast);if(b&&!clash.includes(b)){const e=new TypeError('Assignment to constant variable.');return {err:e}}}
  }
  SYNC=true;let er;
  try{er=runScript(REALM,p.code)}finally{SYNC=false}
  if(er){
    if(method()==='insert'&&p.decls.some(d=>d.kind==='let'||d.kind==='const'||d.kind==='class'))rebuild(HIST.slice());
    return {err:er};
  }
  const value=REALM.last,hasValue=REALM.hasLast&&p.echo;
  p.decls.forEach(d=>DECLS.set(d.name,d.kind));
  (meta.types||[]).forEach(t=>TYPES.set(t.name,t));
  if(method()==='eval')p.decls.filter(d=>d.kind==='const').forEach(d=>{try{Object.defineProperty(REALM.w,d.name,{writable:false})}catch(e){}});
  HIST.push({code:p.code,decls:p.decls,ts:meta.ts,types:meta.types||[],replay:!REPLAY_BAD.test(src)&&!p.async});
  return {ok:true,value,hasValue};
}
function execTS(src){
  const prev=()=>HIST.filter(h=>h.ts).map(h=>h.ts);
  let r=tsCheck(prev(),src);
  const p0=prepare(r.js);
  const names=(p0.decls||[]).map(d=>d.name).concat(r.types.map(t=>t.name));
  const clash=names.filter(n=>DECLS.has(n)||TYPES.has(n));
  if(clash.length){rebuild(HIST.filter(h=>!h.decls.some(d=>clash.includes(d.name))&&!(h.types||[]).some(t=>clash.includes(t.name))));r=tsCheck(prev(),src)}
  if(r.diags.length)return {diags:r.diags};
  return execJS(r.js,{ts:src,types:r.types});
}
function peek(n){
  if(!/^[A-Za-z_$][\w$]*$/.test(n)||!REALM)return undefined;
  if(method()==='eval')return REALM.w[n];
  REALM.peek={};const keepErr=REALM.err,last=REALM.last,hl=REALM.hasLast;
  runScript(REALM,'try{__p('+JSON.stringify(n)+','+n+')}catch(e){__p('+JSON.stringify(n)+',undefined,true)}');
  REALM.err=keepErr;REALM.last=last;REALM.hasLast=hl;
  const r=REALM.peek[n];return r&&!r.tdz?r.v:undefined;
}

/* ---------- error tips ---------- */
function errTip(e){
  const m=(e&&e.message)||'';let x;
  if((x=m.match(/^(\w+) is not defined/)))return `<b>${esc(x[1])}</b> does not exist yet. Check the spelling and capital letters, or create it first with let or const.`;
  if((x=m.match(/(\S+) is not a function/)))return `<b>${esc(x[1])}</b> is not a function, so you cannot call it with brackets. Check the spelling of the method name.`;
  if(/Cannot read propert/.test(m))return 'You asked for a property of something that is undefined or null. Check the variable before the dot.';
  if(/Unexpected end of input|Unterminated/.test(m))return 'Something was opened but never closed: a quote, bracket or brace.';
  if(/Unexpected token|Unexpected identifier|missing \)|Invalid or unexpected/i.test(m))return 'JavaScript could not read this line. Compare it character by character with the example: quotes, commas and brackets.';
  if(/constant/.test(m))return 'That box was made with const, so it is locked.';
  return '';
}

/* ---------- submitting input ---------- */
const H={list:[],i:0};
async function submit(){
  const src=cmd.value.replace(/\s+$/,'');cmd.value='';sizeCmd();
  if(!src.trim()){echoInput('',promptEl.textContent);return}
  H.list.push(src);H.i=H.list.length;
  echoInput(src,promptEl.textContent);
  if(MODE==='sh')return runShell(src);
  const t=src.trim();
  if(t==='clear'||t==='.clear'||t==='cls'){clearScreen();return}
  if(t==='help'||t==='.help'){line('Type any JavaScript and press Enter. Shift+Enter adds a new line.\nThe console shows the value of the last expression after ←.\nclear empties the screen. The Memory panel shows every variable you make.','sys');return}
  if(/^(ls|cd|pwd|node|npm)\b/.test(t)&&!/[=(]/.test(t)){line('That is a terminal command, and this is a '+(MODE==='ts'?'TypeScript':'JavaScript')+' console. You will use the terminal in the Node.js chapter.','tip');return}
  RUN={src,mode:MODE,t:Date.now(),logs:[],diags:[],ok:false,err:null};
  let r;
  if(MODE==='ts'){
    if(!(await loadTS())){line('Could not load the TypeScript compiler. Check your internet connection, then press Fresh console.','err');return}
    try{r=execTS(src)}catch(e){r={err:e}}
  }else r=execJS(src);
  if(r.diags){
    RUN.diags=r.diags;
    r.diags.forEach(d=>line('<span class="loc">'+(d.line)+':'+d.col+' </span>error TS'+d.code+': '+esc(d.msg),'diag'));
    line('Nothing ran. TypeScript stopped it before it could cause trouble.','sys');
  }else if(r.err){
    RUN.err={name:r.err.name||'Error',message:r.err.message||String(r.err)};
    line('Uncaught '+esc(errName(r.err)),'err');
    const m=curMission();const tip=errTip(r.err);
    if(tip&&!(m&&m.expectError))line('Tip: '+tip.replace(/<\/?b>/g,''),'tip');
  }else{
    RUN.ok=true;RUN.value=r.value;RUN.hasValue=r.hasValue;
    if(r.hasValue)line('<span class="arrow">← </span>'+fmt(r.value),'echo');
  }
  renderMem();tryComplete();
}

/* ---------- missions ---------- */
function curIdx(){const c=S.chap;if(S.cur[c]!==undefined)return S.cur[c];const j=CH[c].missions.findIndex((_,j)=>!S.done[mk(c,j)]);return j}
function curMission(){const j=curIdx();return j>=0?CH[S.chap].missions[j]:null}
function ctx(){
  if(MODE==='sh')return {...RUN,files:S.files,logs:RUN.out||[]};
  return {...RUN,has:n=>DECLS.has(n),kind:n=>DECLS.get(n),val:n=>DECLS.has(n)?peek(n):undefined,types:[...TYPES.keys()]};
}
function tryComplete(){
  if(!RUN||RUN.mode!==MODE)return;
  const c=S.chap,j=curIdx();if(j<0)return;const m=CH[c].missions[j];
  let ok=false;try{ok=!!m.check(ctx())}catch(e){ok=false}
  if(!ok)return;
  const k=mk(c,j),first=!S.done[k];
  S.done[k]=1;const bonus=SCQ.badgePay(S,c,first);if(first)S.xp+=tiers.missionXp(c)+bonus;
  delete S.cur[c];save();RUN=null;
  line('✓ Mission complete: '+esc(m.title)+(first?'   +'+tiers.missionXp(c)+' XP':'')+(bonus?' · badge "'+esc(CH[c].badge)+'" +'+bonus+' XP':''),'win');
  stopProc();
  renderTop();renderChapters();renderMission(true);
  const nj=curIdx();if(nj>=0)ensureNeeds(CH[c].missions[nj]);
}
async function ensureNeeds(m){
  if(m&&MODE==='sh'){
    const add=Object.keys(m.seed||{}).filter(k=>!hasF(k));
    if(add.length){for(const k of add)S.files[k]=m.seed[k];save();renderProject();line('Set up for this mission: '+esc(add.join(', ')),'sys')}
    return}
  if(!m||!m.need||!m.pre)return;
  const missing=m.need.some(n=>n[0]==='@'?!TYPES.has(n.slice(1)):!DECLS.has(n));
  if(!missing)return;
  if(MODE==='ts'&&!(await loadTS()))return;
  // drop anything the setup code would redeclare, then run it quietly
  const R=MODE==='ts'?execTS(m.pre):execJS(m.pre);
  if(R&&R.ok){line('Set up for this mission: '+esc(m.pre.split('\n').join('  ')),'sys');renderMem()}
}
function goMission(j){stopProc();S.cur[S.chap]=j;save();renderMission();renderChapters();ensureNeeds(CH[S.chap].missions[j]);cmd.focus({preventScroll:true})}

const missionEl=$('#mission');
function anatHTML(a){return '<div class="anat">'+a.map(([t,k,l])=>`<div class="tok k-${k}"><b>${esc(t)}</b><span>${l?esc(l):({kw:'keyword',name:'name',op:'symbol',val:'value',fn:'function',type:'type',cmd:'command',arg:'argument',opt:'option'})[k]}</span></div>`).join('')+'</div>'}
function dotsHTML(c,j){return '<div class="dots" aria-label="Missions in this chapter">'+CH[c].missions.map((m,i)=>`<button class="dot${S.done[mk(c,i)]?' done':''}${i===j?' cur':''}" data-m="${i}" aria-label="Mission ${i+1}: ${esc(m.title)}" title="${esc(m.title)}">${i+1}</button>`).join('')+'</div>'}
function renderMission(pop){
  const c=S.chap,ch=CH[c],j=curIdx();
  if(j<0){
    missionEl.innerHTML=`<div class="eyebrow">Chapter ${c+1} complete</div>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div class="badge-art">${c+1}</div><div><h2>${esc(ch.badge)}</h2><p class="intro">Badge earned for finishing <b>${esc(ch.name)}</b>.</p></div></div>
      <div><div class="goal"><div class="label">You can now use</div><div class="learned" style="margin-top:6px">${ch.learned.map(x=>'<code>'+esc(x)+'</code>').join('')}</div></div></div>
      <div class="actions">${c<CH.length-1?`<button class="btn" id="nextChap">Next: ${esc(CH[c+1].name)} →</button>`:'<button class="btn" id="toFire">Play Quick-fire</button>'}<button class="btn ghost" id="toGuide">Field guide</button></div>
      ${ch.pointer?`<p class="note">${ch.pointer}</p>`:''}<p class="note">Click any numbered dot to replay a mission. Replays do not add XP, but the practice counts.</p>${dotsHTML(c,-1)}`;
  }else{
    const m=ch.missions[j];
    missionEl.innerHTML=`${Trail.html(ch.story)}<div class="eyebrow">Chapter ${c+1} · Mission ${j+1} of ${ch.missions.length}${S.done[mk(c,j)]?' · replay':''}</div>
      <h2>${esc(m.title)}</h2>
      ${j===0?'<p class="intro">'+HowSteps.tick(ch.intro,esc)+'</p>':''}
      <div class="goal"><div class="label">${m.editFile?'Your mission · edit '+esc(m.editFile):'Your mission'}</div><p>${HowSteps.tick(m.goal,esc)}</p><pre>${MODE==='sh'&&!m.editFile?esc(m.code):hl(m.code)}</pre></div>
      ${m.expectError?'<span class="errgoal">Goal: get an error</span>':''}
      ${anatHTML(m.anat)}
      ${HowSteps.html(m.how)}
      <p class="explain">${m.explain}</p>
      <div class="actions"><button class="btn" id="fill">${m.editFile?'Put it in the editor':'Type it for me'}</button><button class="btn ghost" id="hintBtn">Hint</button><button class="btn ghost" id="skip">Skip</button></div>
      <p class="hint" id="hint" hidden>${m.hint||(m.editFile?'Click <b>'+esc(m.editFile)+'</b> in the Project panel (or press the button above), type the code, press Save, then run it in the terminal'+(m.run?' with <code>'+esc(m.run)+'</code>'+(m.then?', then <code>'+esc(m.then)+'</code>':''):'')+'.':MODE==='sh'?'Type the command exactly as shown, then press Enter.':'Type the code exactly as shown, then press Enter. For several lines, use Shift+Enter between them.')}</p>
      ${dotsHTML(c,j)}`;
  }
  if(pop){missionEl.classList.remove('pop');void missionEl.offsetWidth;missionEl.classList.add('pop')}
}
missionEl.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.m!==undefined)return goMission(+b.dataset.m);
  if(b.id==='nextChap')return setChapter(S.chap+1);
  if(b.id==='toFire')return showTab('fire');
  if(b.id==='toGuide')return showTab('guide');
  if(b.id==='hintBtn'){$('#hint').hidden=!$('#hint').hidden;return}
  if(b.id==='skip'){stopProc();const n=CH[S.chap].missions.length,j=curIdx();if(j+1<n)goMission(j+1);else{delete S.cur[S.chap];save();renderMission()}return}
  if(b.id==='fill'){const m=curMission();if(!m)return;
    if(m.editFile){
      let code=m.code;
      if(m.editFile==='package.json'){try{const pj=JSON.parse(S.files['package.json']||'{}');pj.scripts=Object.assign({start:'node cow.js'},pj.scripts||{});pj.scripts.start='node cow.js';code=JSON.stringify(pj,null,2)+'\n'}catch(er){line('package.json is not valid JSON right now. Fix it or run npm init -y again.','err');return}}
      else if(m.editFile==='hello.js'){code=(S.files['hello.js']||'').replace(/\s*$/,'\n')+'console.log("I edited this file")\n'}
      else code=m.code+'\n';
      openFile(m.editFile,code);
      if(m.run){cmd.value=m.run;sizeCmd()}
      $('#ed').focus({preventScroll:true});
    }else{cmd.value=m.code;sizeCmd();cmd.focus({preventScroll:true});cmd.setSelectionRange(cmd.value.length,cmd.value.length)}
  }
});

/* ---------- chapters rail, header ---------- */
function renderChapters(){SCQ.renderRail($('#chapters'),S)}
$('#chapters').addEventListener('click',e=>{const b=e.target.closest('.chap');if(b)setChapter(+b.dataset.c)});
function renderTop(){
  const r=tiers.rankFor(S.xp),nx=tiers.ranks()[r.index+1];
  $('#rank').textContent=r.name;$('#xpText').textContent=S.xp+' XP';
  $('#xpFill').style.width=(nx?Math.min(100,(S.xp-r.lo)/(nx[0]-r.lo)*100):100)+'%';
  $('#xpFill').parentElement.title=nx?(nx[0]-S.xp)+' XP to '+nx[1]:'Top rank';
}

/* ---------- memory map ---------- */
const mapPanel=$('#mapPanel');let prevSnap={},memTimer=null;
function schedMem(){clearTimeout(memTimer);memTimer=setTimeout(()=>{if(MODE!=='sh')renderMem()},120)}
onPromSettle=schedMem;
function tyOf(v){if(v===null)return 'null';if(Array.isArray(v))return 'array';const t=typeof v;if(t==='function')return fnSig(v).cls?'class':'function';if(t==='object')return tagOf(v)==='Promise'?'promise':'object';return t}
function shortV(v,owners){
  const t=typeof v;
  if(v===undefined)return '<span class="u">undefined</span>';if(v===null)return '<span class="u">null</span>';
  if(t==='string')return '<span class="s">'+esc(JSON.stringify(v.length>40?v.slice(0,40)+'…':v))+'</span>';
  if(t==='number'||t==='bigint')return '<span class="n">'+esc(String(v))+'</span>';
  if(t==='boolean')return '<span class="b">'+v+'</span>';
  if(t==='function')return '<span class="f">'+esc(fnSig(v).txt)+'</span>';
  if(t==='object'){const id=refId(v);const o=owners[id]||[];return `<span class="ref${o.length>1?' shared':''}">${Array.isArray(v)?'[…]':'{…}'} #${id}${o.length?' '+esc(o.join(', ')):''}</span>`}
  return esc(String(v));
}
function boxBody(v,owners){
  const ty=tyOf(v);
  if(ty==='array'){if(!v.length)return '<div class="boxval"><span class="u">[ ] empty</span></div>';
    return '<div class="cells">'+v.slice(0,30).map((x,i)=>`<span class="cell"><b>${shortV(x,owners)}</b><i>${i}</i></span>`).join('')+(v.length>30?'<span class="cell"><b>…</b><i>+'+(v.length-30)+'</i></span>':'')+'</div>'}
  if(ty==='promise'){const st=pstate(v);return `<div class="boxval"><span class="pill ${st.s}">${st.s}</span>${st.s!=='pending'?' '+shortV(st.s==='rejected'&&st.v&&st.v.message?st.v.message:st.v,owners):''}</div>`}
  if(ty==='object'){let ks=[];try{ks=Object.keys(v)}catch(e){}
    if(tagOf(v)==='Map'||tagOf(v)==='Set'||tagOf(v)==='Date')return '<div class="boxval">'+fmt(v)+'</div>';
    if(!ks.length)return '<div class="boxval"><span class="u">{ } empty</span></div>';
    return '<div class="kv">'+ks.slice(0,14).map(k=>`<span class="k">${esc(k)}</span><span class="v">${shortV(v[k],owners)}</span>`).join('')+'</div>'}
  return '<div class="boxval">'+shortV(v,owners)+'</div>';
}
function renderMem(){
  if(MODE==='sh')return renderProject();
  const names=[...DECLS.keys()];const vals={};names.forEach(n=>vals[n]=peek(n));
  const owners={};names.forEach(n=>{const v=vals[n];if(v&&typeof v==='object'){const id=refId(v);(owners[id]=owners[id]||[]).push(n)}});
  const snap={};let boxes='';
  for(const n of names.slice().reverse()){
    const v=vals[n],kind=DECLS.get(n),ty=tyOf(v);
    const id=v&&typeof v==='object'?refId(v):0;
    let s;try{s=ty+'|'+toText(fmt(v,0))}catch(e){s=ty}
    snap[n]=s;const chg=prevSnap[n]!==undefined&&prevSnap[n]!==s;
    const sh=id&&owners[id].length>1;
    boxes+=`<div class="box${chg?' chg':''}"><div class="boxhead"><span class="boxname">${esc(n)}</span><span class="kind ${kind==='const'?'const':''}">${kind==='const'?'🔒 const':esc(kind)}</span>${id?`<span class="ref${sh?' shared':''}">#${id}</span>`:''}<span class="ty ty-${ty}">${ty}</span></div>${boxBody(v,owners)}${sh?`<div class="sharednote">Same object as ${esc(owners[id].filter(x=>x!==n).join(', '))}</div>`:''}</div>`;
  }
  prevSnap=snap;
  const types=[...TYPES.values()];
  mapPanel.innerHTML=`<h3>Memory</h3><p class="mapsub">Every variable you create appears here as a labelled box. A box flashes when its value changes.</p>
   <div class="mem">${boxes||'<div class="memempty">Empty for now. Make a variable, like <code>let coins = 0</code>, and a box will appear here.</div>'}
   ${types.length?'<div class="memsec">Type blueprints (TypeScript only)</div>'+types.map(t=>`<div class="blueprint"><div class="boxhead"><span class="boxname">${esc(t.name)}</span><span class="ty ty-number">${t.kind}</span></div><pre>${esc(t.text)}</pre></div>`).join(''):''}</div>
   <div class="legend"><span><span class="kind const">🔒 const</span> locked box</span><span><span class="ref">#2</span> object ID</span><span><span class="ref shared">#2</span> two names, one object</span></div>`;
}

/* ---------- Node: virtual project + terminal ---------- */
const VFS={
  get files(){return S.files},
  write(k,v){const isNew=!hasF(k);S.files[k]=v;save();renderProject(k);if(ED.file===k&&!ED.dirty){$('#ed').value=v;edSync()}void isNew},
  remove(k){delete S.files[k];save();if(ED.file===k)openFile(null);renderProject()},
  list(){return Object.keys(S.files).concat(S.pkgs.length?['node_modules']:[]).sort()},
  installed:p=>S.pkgs.includes(p),hasModules:()=>S.pkgs.length>0,
};
let NODE=null,PROC=null;
const procOn=()=>!!PROC&&PROC.env.servers.size>0;
function syncBar(){
  const on=procOn();$('#procbar').hidden=!on;
  if(on)$('#procTxt').textContent='● '+PROC.label+' is running on port '+[...PROC.env.servers.keys()].join(', ');
}
function stopProc(ctrlC){
  if(!procOn())return false;
  const p=PROC;PROC=null;p.env.stop();syncBar();
  if(ctrlC)line('^C','sys');
  line('Stopped '+esc(p.label),'sys');return true}
function nodeHooks(){const hk={
  out(level,args){const html=level==='table'?tableHTML(args[0]):level==='raw'?esc(args[0]):fmtArgs(args);const text=level==='raw'?args[0]:toText(html);
    line(html,level==='warn'?'warn':level==='error'?'err':'');if(RUN&&RUN.out)RUN.out.push(text);if(!SYNC&&RUN&&Date.now()-RUN.t<20000)tryComplete()},
  asyncErr(e){printNodeErr(e);if(RUN)RUN.ok=false;if(hk.env)hk.env.stop();syncBar()},clear(){clearScreen()},idle:syncBar,done:syncBar,
  exit(c){if(RUN)RUN.ok=c===0},sys(t){line(esc(t),'sys')}};return hk}
function printNodeErr(e,file){
  if(e&&e.__exit!==undefined)return;
  if(e&&(e.__file||file))line('/home/you/my-app/'+esc(e.__file||file),'sys');
  line(esc(errName(e)),'err');
  if(e&&e.code)line("  code: '"+esc(e.code)+"'",'err');
  line('Node.js '+NODE_VERSION,'sys');
  const tip=errTip(e);if(tip)line('Tip: '+tip.replace(/<\/?b>/g,''),'tip');
}
function runNode(file,args,code){
  killRealm(NODE);const hk=nodeHooks();NODE=makeRealm(hk);
  const env=hk.env=makeNodeEnv(NODE,VFS,file,args,hk);
  PROC={env,label:RUN.src,ran:{file,code:code!==undefined?code:S.files[file]}};RUN.ran=PROC.ran;
  SYNC=true;
  try{env.runMain(file,code)}catch(e){if(e&&e.__exit!==undefined){RUN.ok=e.__exit===0}else{printNodeErr(e,file);RUN.ok=false}}
  finally{SYNC=false}
  RUN.server=[...env.servers.keys()];syncBar();
}
function tokenize(s){const out=[];let cur='',q=null,has=false;
  for(let i=0;i<s.length;i++){const c=s[i];
    if(q){if(c==='\\'&&q==='"'&&(s[i+1]==='"'||s[i+1]==='\\')){cur+=s[++i]}else if(c===q)q=null;else cur+=c}
    else if(c==='"'||c==="'"){q=c;has=true}
    else if(/\s/.test(c)){if(cur||has){out.push(cur);cur='';has=false}}
    else cur+=c}
  if(cur||has)out.push(cur);return out}
const NPM_INIT=()=>JSON.stringify({name:'my-app',version:'1.0.0',description:'',main:'index.js',scripts:{test:'echo "Error: no test specified" && exit 1'},keywords:[],author:'',license:'ISC'},null,2)+'\n';
// A folder is a marker key "name/" or any key under "name/"; root is always one.
function isDir(k){return k===''||hasF(k+'/')||Object.keys(S.files).some(f=>f.startsWith(k+'/'))}
function parentOf(k){const i=k.replace(/\/$/,'').lastIndexOf('/');return i<0?'':k.slice(0,i)}
function lsNames(dir){
  const pre=dir?dir+'/':'',set=new Set();
  for(const f of VFS.list()){if(!f.startsWith(pre)||f===pre)continue;const r=f.slice(pre.length),i=r.indexOf('/');set.add(i<0?r:r.slice(0,i+1))}
  return [...set].sort()}
function runShell(src){
  const a=tokenize(src),c=a[0]||'',args=a.slice(1);
  RUN={src,mode:'sh',t:Date.now(),cmd:c,args,ok:true,out:[],logs:[]};
  const out=(t,cls='')=>{line(esc(t),cls);RUN.out.push(t)};
  const fail=(t)=>{out(t,'err');RUN.ok=false};
  if(procOn()&&(c==='node'||(c==='npm'&&/^(start|test|t|run|run-script)$/.test(args[0]||'')))){
    fail('A program is still running. Press Stop (or Ctrl+C) first. In a real terminal you would open a second tab for curl.');return}
  switch(c){
    case 'help':out('Commands here: ls [dir], cat <file>, pwd, touch <file>, rm <file>, mkdir [-p] <dir>, clear,\nnode <file> [words…], node -e "code", node -v,\nnpm init -y, npm install <package>, npm start, npm run <script>, npm test,\ncurl [-i] [-s] [-X METHOD] [-Z] <url>…','sys');break;
    case 'clear':clearScreen();break;
    case 'pwd':out('/home/you/my-app');break;
    case 'ls':{const d=(args.find(x=>x[0]!=='-')||'').replace(/^\.\/?$/,'').replace(/\/$/,'');
      if(d&&hasF(d)){out(d);break}
      if(d&&!isDir(d)){fail('ls: cannot access \''+d+'\': No such file or directory');break}
      const l=lsNames(d);line(l.map(f=>f==='node_modules'||f.endsWith('/')?'<span class="c-d" style="color:var(--term-dir);font-weight:600">'+esc(f==='node_modules'?'node_modules/':f)+'</span>':/\.js$/.test(f)?'<span style="color:var(--term-prompt)">'+esc(f)+'</span>':esc(f)).join('  ')||'<span class="v-u">(empty folder)</span>');RUN.out.push(l.join('  '));break}
    case 'cat':if(!args[0])fail('cat: which file? Try: cat notes.txt');else if(isDir(args[0].replace(/\/$/,'')))fail('cat: '+args[0]+': Is a directory');else if(hasF(args[0]))out(S.files[args[0]].replace(/\n$/,''));else fail('cat: '+args[0]+': No such file or directory');break;
    case 'touch':if(!args[0])fail('touch: missing file name');else if(!isDir(parentOf(args[0])))fail('touch: cannot touch \''+args[0]+'\': No such file or directory');else{if(!hasF(args[0])&&!isDir(args[0]))VFS.write(args[0],'')}break;
    case 'rm':{const a=args[0]||'';
      if(isDir(a.replace(/\/$/,''))&&a)fail('rm: cannot remove \''+a+'\': Is a directory');
      else if(!hasF(a))fail('rm: cannot remove \''+a+'\': No such file or directory');
      else{VFS.remove(a);const p=parentOf(a);if(p&&!isDir(p))VFS.write(p+'/','')}break}
    case 'mkdir':{
      const rec=args.some(x=>x==='-p'||x==='--parents'),a=(args.find(x=>x[0]!=='-')||'').replace(/\/+$/,'');
      const bad=m=>fail('mkdir: cannot create directory \''+a+'\': '+m);
      if(!a){fail('mkdir: missing operand');break}
      if(!rec){if(isDir(a)||hasF(a))bad('File exists');else if(!isDir(parentOf(a)))bad('No such file or directory');else VFS.write(a+'/','');break}
      const parts=a.split('/');let p='';
      for(const [i,s] of parts.entries()){p+=(p?'/':'')+s;
        if(hasF(p)){bad('File exists');break}
        if(i===parts.length-1||!isDir(p))VFS.write(p+'/','')}
      break}
    case 'curl':{
      const run=RUN;run.reqs=[];if(PROC){run.ran=PROC.ran;run.server=[...PROC.env.servers.keys()]}
      nodeCurl(procOn()?PROC.env:null,args,{
        out(t){if(RUN===run)out(t)},
        err(t){if(RUN===run)out(t,'err')},
        req(r){run.reqs.push(r);if(RUN===run)line('(took '+r.ms+' ms, virtual)','sys')},
        done(){if(!run.reqs.length)run.ok=false;if(RUN===run)tryComplete()}});
      break}
    case 'node':
      if(!args.length){out('This would open Node\'s interactive console (the REPL). You already know it: it is the > console from chapters 1–10.\nHere, run a file instead: node hello.js','tip');break}
      if(args[0]==='-v'||args[0]==='--version'){out(NODE_VERSION);break}
      if(args[0]==='-e'||args[0]==='--eval'||args[0]==='-p'){if(!args[1]){fail('node: '+args[0]+' requires an argument');break}
        runNode('[eval]',args.slice(2),args[0]==='-p'?'console.log('+args[1]+')':args[1]);break}
      if(!hasF(args[0])){
        if(hasF(args[0]+'.js')){runNode(args[0]+'.js',args.slice(1));break}
        out('node:internal/modules/cjs/loader','sys');fail("Error: Cannot find module '/home/you/my-app/"+args[0]+"'");line('Tip: check the file name with ls. Names are case-sensitive.','tip');break}
      if(!/\.(c?js|json)$/.test(args[0])){fail('That is not a JavaScript file. Node runs .js files.');break}
      if(ED.file===args[0]&&ED.dirty)line('Heads up: '+esc(args[0])+' has unsaved changes in the editor, so Node runs the last saved version. Press Save (Ctrl+S) first.','tip');
      runNode(args[0],args.slice(1));break;
    case 'npm':runNpm(args,out,fail);break;
    case 'npx':out('npx runs a package\'s command without installing it globally. You will use it for things like npx tsc. Not available in this playground.','tip');break;
    case 'tsc':out('tsc is the TypeScript compiler. On your computer: npm install -D typescript, then npx tsc. See the Field guide.','tip');break;
    case 'cd':out('This playground keeps you in ~/my-app. To move between folders, play Shell Quest.','tip');break;
    default:
      if(/[=(){};"'`]|^(let|const|var|console|function)\b/.test(src)){fail('bash: syntax error');line('That looks like JavaScript, but this is the terminal. Put the code in a file and run node file.js, or try: node -e "your code"','tip')}
      else{fail('bash: '+c+': command not found');line('Type help to see the commands this terminal knows.','tip')}
  }
  renderProject();tryComplete();
}
function runNpm(args,out,fail){
  const sub=args[0];
  const pj=()=>{try{return JSON.parse(S.files['package.json'])}catch(e){return null}};
  if(!sub){out('npm <command>\n\nUsage:\nnpm init -y        create package.json\nnpm install <pkg>  add a package\nnpm start          run the "start" script\nnpm run <name>     run any script','sys');return}
  if(sub==='-v'||sub==='--version'){out('10.9.2');return}
  if(sub==='init'){if(!args.includes('-y')&&!args.includes('--yes')){out('npm init normally asks you questions (name, version, …). Add -y to accept the defaults: npm init -y','tip');RUN.ok=false;return}
    VFS.write('package.json',NPM_INIT());out('Wrote to /home/you/my-app/package.json:\n\n'+S.files['package.json']);return}
  if(sub==='install'||sub==='i'||sub==='add'){
    const pkgs=args.slice(1).filter(x=>!x.startsWith('-'));
    if(!pkgs.length){out(S.pkgs.length?'up to date, audited '+S.pkgs.length+' package in 1s':'up to date, audited 0 packages in 1s');return}
    for(const p of pkgs){if(p!=='cowsay'){fail('npm error 404 Not Found - '+p+'\nThis playground only has the cowsay package. On your own computer, npm can install any public package.');return}}
    if(!S.pkgs.includes('cowsay'))S.pkgs.push('cowsay');
    let j=pj();if(!j){j=JSON.parse(NPM_INIT())}
    j.dependencies=Object.assign(j.dependencies||{},{cowsay:'^1.6.0'});VFS.write('package.json',JSON.stringify(j,null,2)+'\n');
    out('\nadded 1 package, and audited 2 packages in 1s\n\nfound 0 vulnerabilities');return}
  if(sub==='start'||sub==='test'||sub==='t'||sub==='run'||sub==='run-script'){
    const j=pj();if(!j){fail('npm error enoent Could not read package.json\nRun npm init -y first.');return}
    const name=(sub==='run'||sub==='run-script')?args[1]:(sub==='t'?'test':sub);
    const sc=j.scripts||{};
    if(!name){out('Scripts available in my-app via `npm run`:\n'+Object.keys(sc).map(k=>'  '+k+'\n    '+sc[k]).join('\n'));return}
    if(!(name in sc)){fail('npm error Missing script: "'+name+'"');if(name==='start')line('Tip: add "start": "node cow.js" inside "scripts" in package.json, then save.','tip');return}
    out('\n> '+j.name+'@'+j.version+' '+name+'\n> '+sc[name]+'\n','sys');
    const parts=sc[name].split('&&').map(s=>s.trim());
    for(const p of parts){const t=tokenize(p);
      if(t[0]==='node'){const keep=RUN;runNode(t[1],t.slice(2));if(!keep.ok)return}
      else if(t[0]==='echo'){out(t.slice(1).join(' '))}
      else if(t[0]==='exit'){if(t[1]!=='0'){RUN.ok=false;fail('npm error Lifecycle script `'+name+'` failed with error:\nnpm error code '+(t[1]||1))}return}
      else{fail('sh: '+t[0]+': not available in this playground');return}}
    return}
  fail('npm error Unknown command: "'+sub+'"');
}

/* project panel + editor */
const ED={file:null,dirty:false};
function fileKind(f){return f==='node_modules'||f.endsWith('/')?'dir':/\.json$/.test(f)?'json':/\.js$/.test(f)?'js':'txt'}
function renderProject(flash){
  if(MODE!=='sh')return;
  const rows=VFS.list().map(f=>{const k=fileKind(f);const size=k!=='dir'&&hasF(f)?S.files[f].split('\n').filter((l,i,a)=>i<a.length-1||l).length:0;
    return `<button class="frow${ED.file===f?' open':''}${flash===f?' flash':''}" data-f="${esc(f)}"${k==='dir'?' disabled':''}><span class="fi ${k}">${k==='dir'?'DIR':k.toUpperCase()}</span>${esc(f)}${k==='dir'&&!f.endsWith('/')?'/':''}<span class="sz">${k==='dir'?f==='node_modules'?S.pkgs.join(', '):'':size+' line'+(size===1?'':'s')}</span></button>`}).join('');
  mapPanel.innerHTML=`<h3>Project</h3><p class="mapsub"><code>~/my-app</code>. Click a file to open it in the editor below the terminal.</p>
    <div class="files">${rows}</div>
    <form class="newfile" id="newfile"><input id="nfName" placeholder="new-file.js" aria-label="New file name" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn small" type="submit">New file</button></form>
    <div class="legend"><span><span class="fi js" style="font-size:9.5px;font-weight:700;padding:0 4px;border-radius:4px">JS</span> runs with node</span><span><span class="fi json" style="font-size:9.5px;font-weight:700;padding:0 4px;border-radius:4px">JSON</span> settings and data</span><span>Files are saved in this browser.</span></div>`;
}
mapPanel.addEventListener('click',e=>{const b=e.target.closest('.frow');if(b&&!b.disabled)openFile(b.dataset.f)});
mapPanel.addEventListener('submit',e=>{e.preventDefault();const inp=$('#nfName');let n=(inp.value||'').trim();
  if(!/^[\w.-]+$/.test(n)){inp.setCustomValidity('Use letters, numbers, dots, dashes or underscores. No folders.');inp.reportValidity();return}
  inp.setCustomValidity('');if(!hasF(n))VFS.write(n,'');openFile(n);$('#ed').focus()});
mapPanel.addEventListener('input',e=>{if(e.target.id==='nfName')e.target.setCustomValidity('')});
const ed=$('#ed'),gutter=$('#gutter');
function edSync(){const n=ed.value.split('\n').length;gutter.textContent=Array.from({length:n},(_,i)=>i+1).join('\n');ed.style.height='auto';ed.style.height=ed.scrollHeight+'px';
  $('#edtab').innerHTML=ED.file?esc(ED.file)+(ED.dirty?' <span class="dirty" title="Unsaved changes">●</span>':''):'no file open'}
function openFile(f,content){
  ED.file=f;ED.dirty=false;
  const has=f&&hasF(f);
  if(f&&!has&&content===undefined){S.files[f]='';save()}
  ed.disabled=!f;ed.value=f?(content!==undefined?content:S.files[f]||''):'';
  if(f&&content!==undefined&&content!==S.files[f])ED.dirty=true;
  if(f&&!hasF(f)){S.files[f]='';save()}
  $('#edRun').hidden=!(f&&/\.js$/.test(f)||f==='package.json');
  $('#edRun').textContent=f==='package.json'?'▶ npm start':'▶ Run';
  edSync();renderProject();
}
function saveFile(){if(!ED.file)return false;S.files[ED.file]=ed.value;ED.dirty=false;save();edSync();renderProject(ED.file);
  if(ED.file==='package.json'){try{JSON.parse(ed.value)}catch(e){line('Saved, but package.json is not valid JSON: '+e.message.split('\n')[0],'warn')}}
  const m=curMission();if(m&&m.editFile===ED.file&&!m.run){RUN={mode:'sh',cmd:'(save)',args:[ED.file],ok:true,out:[],logs:[],t:Date.now()};tryComplete()}
  return true}
ed.addEventListener('input',()=>{ED.dirty=true;edSync()});
ed.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveFile();line('Saved '+esc(ED.file),'sys');return}
  if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();const s=ed.selectionStart;ed.setRangeText('  ',s,ed.selectionEnd,'end');ED.dirty=true;edSync()}
  if(e.key==='Enter'){const s=ed.selectionStart,ln=ed.value.slice(0,s).split('\n').pop();const ind=ln.match(/^\s*/)[0]+(/[{(\[]\s*$/.test(ln)?'  ':'');if(ind){e.preventDefault();ed.setRangeText('\n'+ind,s,ed.selectionEnd,'end');ED.dirty=true;edSync()}}
});
$('#edSave').onclick=()=>{if(saveFile())line('Saved '+esc(ED.file),'sys')};
$('#edRun').onclick=()=>{if(!ED.file)return;saveFile();const c=ED.file==='package.json'?'npm start':(curMission()&&curMission().run&&curMission().editFile===ED.file?curMission().run:'node '+ED.file);echoInput(c,promptEl.textContent);H.list.push(c);H.i=H.list.length;runShell(c)};

/* ---------- chapter / mode switching ---------- */
function setChapter(i){
  S.chap=i;save();
  const ch=CH[i];MODE=ch.mode;
  clearScreen();RUN=null;stopProc();killRealm(NODE);NODE=null;
  const termEl=$('#term');termEl.classList.toggle('short',MODE==='sh');$('#editor').hidden=MODE!=='sh';
  promptEl.textContent=MODE==='sh'?'~/my-app $ ':MODE==='ts'?'ts> ':'> ';
  cmd.setAttribute('aria-label',MODE==='sh'?'Type a terminal command':'Type '+(MODE==='ts'?'TypeScript':'JavaScript')+' and press Enter');
  $('#crumbs').innerHTML=`<span class="modepill">${MODE==='sh'?'terminal':MODE==='ts'?'TypeScript':'JavaScript'}</span><span>${MODE==='sh'?'A simulated terminal in the folder <code>~/my-app</code>. Commands, not code.':MODE==='ts'?'Real TypeScript type-checking, then the code runs.':'Live console. Your code really runs, right here in the page.'}</span>`;
  $('#fresh').textContent=MODE==='sh'?'Reset project':'Fresh console';$('#fresh').classList.remove('armed');
  freshConsole();
  line('Chapter '+(i+1)+': '+esc(ch.name),'tip');
  if(MODE==='sh'){
    line('Type <b>ls</b> to see the files, or help for the command list.','sys');
    if(!ED.file||!hasF(ED.file))openFile(hasF('hello.js')?'hello.js':null);else edSync();
    renderProject();
  }else{
    line(MODE==='ts'?'Type TypeScript and press Enter. Loading the compiler…':'Type JavaScript and press Enter. Shift+Enter adds a new line.','sys');
    renderMem();
    if(MODE==='ts')loadTS().then(ok=>{if(MODE!=='ts')return;line(ok?'TypeScript compiler ready.':'Could not load the TypeScript compiler. Check your connection and try Fresh console.',ok?'sys':'err');const m=curMission();if(ok&&m)ensureNeeds(m)});
  }
  renderChapters();renderMission();
  const m=curMission();if(m&&MODE!=='ts')ensureNeeds(m);
  if(method()==='none')line('This browser blocked running code inside the page, so the console cannot run anything here. Try a different browser.','err');
}
$('#procStop').onclick=()=>{stopProc(true);cmd.focus()};
$('#fresh').onclick=e=>{
  const b=e.currentTarget;
  if(MODE==='sh'){
    if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to reset all files';setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset project'},3500);return}
    b.classList.remove('armed');b.textContent='Reset project';stopProc();S.files={...INITIAL_FILES};S.pkgs=[];save();openFile('hello.js');line('Project reset to its starting files.','sys');renderProject();ensureNeeds(curMission());return}
  freshConsole();clearScreen();line('Fresh console: all variables cleared.','sys');renderMem();const m=curMission();if(m)ensureNeeds(m);cmd.focus();
};

/* ---------- input box behaviour ---------- */
function sizeCmd(){cmd.rows=Math.max(1,cmd.value.split('\n').length)}
cmd.addEventListener('input',sizeCmd);
cmd.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){
    if(MODE!=='sh'&&isIncomplete(cmd.value)){e.preventDefault();const s=cmd.selectionStart;const ln=cmd.value.slice(0,s).split('\n').pop();const ind=ln.match(/^\s*/)[0]+(/[{(\[]\s*$/.test(ln)?'  ':'');cmd.setRangeText('\n'+ind,s,cmd.selectionEnd,'end');sizeCmd();return}
    e.preventDefault();submit();return}
  if(e.key==='Tab'){e.preventDefault();
    if(MODE==='sh'){const v=cmd.value,s=cmd.selectionStart;const pre=v.slice(0,s).split(/\s/).pop();const hits=VFS.list().filter(f=>f.startsWith(pre)&&f!==pre);
      if(hits.length===1)cmd.setRangeText(hits[0].slice(pre.length)+' ',s,s,'end');else if(hits.length>1)line(hits.join('  '),'sys');return}
    cmd.setRangeText('  ',cmd.selectionStart,cmd.selectionEnd,'end');sizeCmd();return}
  if(e.key==='ArrowUp'&&!cmd.value.slice(0,cmd.selectionStart).includes('\n')){if(H.i>0){e.preventDefault();H.i--;cmd.value=H.list[H.i];sizeCmd()}return}
  if(e.key==='ArrowDown'&&!cmd.value.slice(cmd.selectionEnd).includes('\n')){if(H.i<H.list.length){e.preventDefault();H.i++;cmd.value=H.list[H.i]||'';sizeCmd()}return}
  if(e.key.toLowerCase()==='c'&&e.ctrlKey&&cmd.selectionStart===cmd.selectionEnd&&procOn()){e.preventDefault();stopProc(true);return}
  if(e.key.toLowerCase()==='l'&&e.ctrlKey){e.preventDefault();clearScreen()}
});
term.addEventListener('click',()=>{if(!getSelection().toString())cmd.focus({preventScroll:true})});
$('#keys').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;
  if(k==='ENTER'){submit()}else if(k==='UP'){if(H.i>0){H.i--;cmd.value=H.list[H.i];sizeCmd()}}
  else{const ins=k==='TAB'?'  ':k==='NL'?'\n':k;cmd.setRangeText(ins,cmd.selectionStart,cmd.selectionEnd,'end');sizeCmd()}
  cmd.focus({preventScroll:true})});

/* ---------- tabs ---------- */
function showTab(t){
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  ['quest','fire','guide'].forEach(x=>$('#tab-'+x).hidden=x!==t);
  if(t==='fire')fireIdle();
  if(t!=='fire')fireStop();
  if(t==='guide'&&!$('#guide').innerHTML)renderGuide();
}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

// ================= QUICK-FIRE =================
const F={on:false,score:0,streak:0,time:75,tick:null,q:null,order:[],misses:[],locked:false,paused:false};
const fStage=$('#fStage');
function fStats(){$('#fScore').textContent=F.score;$('#fStreak').textContent=F.streak;$('#fBest').textContent=S.best||0;$('#fTime').textContent=Math.ceil(F.time);$('#fTimer').style.width=(F.time/75*100)+'%'}
function fireIdle(){
  if(F.on)return;fStats();
  const all=qfOpen(S.done),openTiers=[];all.forEach(q=>{const t=tiers.tierOf(q.ch);if(!openTiers.includes(t))openTiers.push(t)});
  if(!openTiers.some(t=>t.id===F.tier))F.tier=undefined;
  const open=qfOpen(S.done,F.tier);
  const picker=openTiers.length>1?`<div class="gfilter qpick" role="group" aria-label="Question pool"><button class="btn ghost" data-qt="" aria-pressed="${!F.tier}">Mixed</button>${openTiers.map(t=>`<button class="btn ghost" data-qt="${t.id}" aria-pressed="${F.tier===t.id}">${esc(t.name)}</button>`).join('')}</div>`:'';
  if(!open.length){
    fStage.innerHTML=`<div class="example"><div class="eyebrow">Locked for now</div><p class="note" style="margin-top:8px">Quick-fire only asks about things the quest has already taught. Finish all of <b>Chapter 1: ${esc(CH[0].name)}</b> first, and the first questions open up. Each later chapter you finish adds more.</p></div>
    <div class="actions" style="margin-top:12px"><button class="btn" id="fGo">Go to the quest</button></div>`;
    $('#fGo').onclick=()=>showTab('quest');return;
  }
  const ex=FIRE[0];
  fStage.innerHTML=`<div class="example"><div class="eyebrow">Example</div><pre class="snip">${hl(ex.c)}</pre><p class="note" style="margin-top:8px">Answer: <code>22</code>. ${esc(ex.w)}</p></div>
    ${picker}
    ${all.length<FIRE.length?`<p class="note">${all.length} of ${FIRE.length} questions are open. Finish more chapters to unlock the rest.</p>`:''}
    <div class="actions"><button class="btn" id="fGo">Start the clock</button></div>`;
  $('#fGo').onclick=fireStart;
  const pk=fStage.querySelector('.qpick');if(pk)pk.onclick=e=>{const b=e.target.closest('button[data-qt]');if(!b)return;F.tier=b.dataset.qt||undefined;fireIdle()};
}
function fireStart(){
  if(!qfOpen(S.done,F.tier).length){fireIdle();return}
  Object.assign(F,{on:true,score:0,streak:0,time:75,misses:[],locked:false,paused:false});
  F.order=qfOpen(S.done,F.tier).sort(()=>Math.random()-.5);
  clearInterval(F.tick);let last=performance.now();
  F.tick=setInterval(()=>{const now=performance.now();if(!F.paused)F.time-=(now-last)/1000;last=now;if(F.time<=0){F.time=0;fireEnd()}fStats()},100);
  fireNext();
}
function fireStop(){clearInterval(F.tick);F.on=false}
function fireNext(){
  if(!F.order.length)F.order=qfOpen(S.done,F.tier).sort(()=>Math.random()-.5);
  const q=F.order.pop();
  const opts=q.o.map((t,i)=>({t,right:i===q.a})).sort(()=>Math.random()-.5);
  F.q={...q,opts};F.locked=false;F.paused=false;
  fStage.innerHTML=`<div class="task">What does this print?</div><pre class="snip">${hl(q.c)}</pre>
    <div class="opts">${opts.map((o,i)=>`<button class="opt" data-i="${i}"><kbd>${i+1}</kbd><span>${esc(o.t)}</span></button>`).join('')}</div><p class="fb" id="fb" aria-live="polite"></p>`;
  fStats();
}
function fireAnswer(i){
  if(!F.on||F.locked||!F.q)return;F.locked=true;
  const btns=fStage.querySelectorAll('.opt');const o=F.q.opts[i];const right=F.q.opts.findIndex(x=>x.right);
  btns[right].classList.add('right');const fb=$('#fb');
  if(o.right){F.streak++;const pts=10+Math.min(F.streak-1,5)*2;F.score+=pts;fb.className='fb good';fb.textContent='Correct! +'+pts+(F.streak>1?'  (streak ×'+F.streak+')':'');fStats();setTimeout(()=>F.on&&fireNext(),650)}
  else{btns[i].classList.add('wrong');F.streak=0;F.paused=true;F.misses.push(F.q);fb.className='fb bad';fb.innerHTML=esc(F.q.w)+' <button class="btn small ghost" id="fNext">Next →</button>';fStats();$('#fNext').onclick=()=>F.on&&fireNext();$('#fNext').focus()}
}
fStage.addEventListener('click',e=>{const b=e.target.closest('.opt');if(b)fireAnswer(+b.dataset.i)});
document.addEventListener('keydown',e=>{if($('#tab-fire').hidden||!F.on)return;if(/^[1-4]$/.test(e.key))fireAnswer(+e.key-1);else if(e.key==='Enter'&&F.locked&&F.paused)fireNext()});
function fireEnd(){
  fireStop();const best=F.score>(S.best||0);if(best){S.best=F.score;save()}
  fStats();
  fStage.innerHTML=`<div class="task">Time! You scored ${F.score}${best?' — a new best':''}.</div>
    ${F.misses.length?'<div class="eyebrow">Worth another look</div><ul class="misses">'+F.misses.map(q=>`<li><pre>${hl(q.c)}</pre><span>Prints <code>${esc(q.o[q.a])}</code>. ${esc(q.w)}</span></li>`).join('')+'</ul>':'<p class="note">No misses. Impressive.</p>'}
    <div class="actions"><button class="btn" id="fGo">Play again</button></div>`;
  $('#fGo').onclick=fireStart;
}

function renderGuide(){
  const g=$('#guide');
  const present=[];CH.forEach((_,i)=>{const t=tiers.tierOf(i);if(!present.includes(t))present.push(t)});
  g.innerHTML=SCQ.guideHTML({esc,hl,tiers:present,tierOf:i=>tiers.tierOf(i)});
  const f=g.querySelector('.gfilter');if(!f)return;
  f.addEventListener('click',e=>{const b=e.target.closest('button[data-tier]');if(!b)return;const t=b.dataset.tier;
    f.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    g.querySelectorAll('.gsec').forEach(s=>{s.hidden=t!=='all'&&('extras' in s.dataset||(s.dataset.tier||'beginner')!==t)})});
}
const guideRealms={};
$('#guide').addEventListener('click',e=>{
  const b=e.target.closest('[data-run]');if(!b)return;const i=+b.dataset.run;const out=$('#ro'+i);out.innerHTML='';
  killRealm(guideRealms[i]);
  const add=(h,cls)=>{const d=document.createElement('div');d.className='line '+(cls||'');d.innerHTML=h;out.appendChild(d)};
  const R=makeRealm({out(l,a){add(l==='table'?tableHTML(a[0]):l==='echo'?'<span class="v-u">← </span>'+fmt(a[0]):fmtArgs(a),l==='error'?'err':'')},asyncErr(er){add(esc('Uncaught '+errName(er)),'err')},clear(){out.innerHTML=''}});
  R.w.__asyncOut=v=>{if(v!==undefined)add('<span class="v-u">← </span>'+fmt(v))};
  guideRealms[i]=R;
  const p=prepare(BLOCKS[i][2]);if(p.error){add(esc(errName(p.error)),'err');return}
  const er=runScript(R,p.code);
  if(er)add(esc('Uncaught '+errName(er)),'err');else if(R.hasLast&&p.echo)add('<span class="v-u">← </span>'+fmt(R.last));
  setTimeout(()=>{if(guideRealms[i]===R){killRealm(R);delete guideRealms[i]}},15000);
});

// ================= BOOT =================
renderTop();
setChapter(Math.min(S.chap||0,CH.length-1));
if(location.hash==='#fire')showTab('fire');else if(location.hash==='#guide')showTab('guide');

})();
