(()=>{
"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tagOf=v=>Object.prototype.toString.call(v).slice(8,-1);
const TSQ=window.TSQ;
const {CH,FIRE,qfOpen,tiers}=TSQ;
const realmsHost=$('#realms');
const {init:initRealm,makeRealm,killRealm,runScript,prepare,isIncomplete,method}=window.JSRealm;
const {init:initTS,check:tsCheck,load:loadTS}=window.TSCheck;
initRealm({host:realmsHost});
initTS({document});
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
  if(t==='function'){const s=fnSig(v);return '<span class="v-f">'+esc(s.txt)+'</span>'}
  const tg=tagOf(v);
  if(tg==='Error'||(v&&typeof v.message==='string'&&typeof v.name==='string'&&'stack' in v))return '<span class="v-e">'+esc(v.name+': '+v.message)+'</span>';
  if(tg==='Promise'){const st=pstate(v);return '<span class="v-c">Promise</span> {'+(st.s==='pending'?'<span class="v-u">&lt;pending&gt;</span>':(st.s==='rejected'?'<span class="v-e">&lt;rejected&gt;</span> ':'')+fmt(st.v,depth+1))+'}'}
  if(tg==='RegExp')return '<span class="v-c">'+esc(String(v))+'</span>';
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

const KEY='typescript-quest-v1';
let S={xp:0,done:{},chap:0,cur:{},best:0};
try{const raw=localStorage.getItem(KEY);if(raw)S=Object.assign(S,JSON.parse(raw))}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const mk=(i,j)=>i+'.'+j;

const screen=$('#screen'),term=$('#term'),cmd=$('#cmd'),promptEl=$('#prompt');
function line(html,cls=''){const d=document.createElement('div');d.className='line '+cls;d.innerHTML=html;screen.appendChild(d);
  while(screen.childNodes.length>600)screen.firstChild.remove();term.scrollTop=term.scrollHeight;return d}
function clearScreen(){screen.innerHTML=''}
const KW=/^(const|let|var|function|return|if|else|for|while|of|in|new|class|async|await|try|catch|throw|typeof|interface|type|keyof|infer|extends|readonly|as|true|false|null|undefined|break|continue|this|export|import|require|switch|case|default)$/;
function hl(src){
  return src.replace(/(\/\/[^\n]*)|(`(?:\\.|[^`\\])*`?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([^])/g,(m,c,s,n,id,o)=>{
    if(c)return '<span class="v-u">'+esc(c)+'</span>';if(s)return '<span class="v-s">'+esc(s)+'</span>';if(n)return '<span class="v-n">'+esc(n)+'</span>';
    if(id)return KW.test(id)?'<span class="v-b">'+id+'</span>':esc(id);return esc(o)});
}
function echoInput(src,pr){const ls=src.split('\n');const pad=' '.repeat(Math.max(0,pr.length-4))+'... ';
  line(ls.map((l,i)=>'<span class="pr">'+esc(i?pad:pr)+'</span>'+hl(l)).join('\n'),'in')}

let MODE='ts';
const TERM=()=>MODE==='project'&&!!CH[S.chap].terminal;
let REALM=null,HIST=[],DECLS=new Map(),TYPES=new Map(),RUN=null,SYNC=false;
const hooks={
  out(level,args){
    let html,text;
    if(level==='table'){html=tableHTML(args[0]);text=toText(fmt(args[0]))}
    else if(level==='echo'){html='<span class="arrow">← </span>'+fmt(args[0]);text=toText(fmt(args[0]));line(html,'echo');afterAsync();return}
    else if(level==='raw'){html=esc(args[0]);text=args[0]}
    else{html=fmtArgs(args);text=toText(html)}
    line(html,level==='warn'?'warn':level==='error'?'err':'');
    if(RUN)RUN.logs.push(text);
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

function errTip(e){
  const m=(e&&e.message)||'';let x;
  if((x=m.match(/^(\w+) is not defined/)))return `<b>${esc(x[1])}</b> does not exist yet. Check the spelling and capital letters, or create it first with let or const.`;
  if((x=m.match(/(\S+) is not a function/)))return `<b>${esc(x[1])}</b> is not a function, so the call has nothing to run. Either the name is misspelled, or the value has no such method. An <b>any</b> lets the checker miss that, so only running it shows the error.`;
  if(/Cannot read propert/.test(m))return 'You asked for a property of something that is undefined or null. Check the variable before the dot.';
  if(/Unexpected end of input|Unterminated/.test(m))return 'Something was opened but never closed: a quote, bracket or brace.';
  if(/Unexpected token|Unexpected identifier|missing \)|Invalid or unexpected/i.test(m))return 'JavaScript could not read this line. Compare it character by character with the example: quotes, commas and brackets.';
  if(/constant/.test(m))return 'That box was made with const, so it is locked.';
  return '';
}

const H={list:[],i:0};
const COMPILER_FAILED='Could not load the TypeScript compiler. Check your internet connection, then run the line again.';
async function submit(){
  const src=cmd.value.replace(/\s+$/,'');cmd.value='';sizeCmd();
  if(!src.trim()){echoInput('',promptEl.textContent);return}
  H.list.push(src);H.i=H.list.length;
  echoInput(src,promptEl.textContent);
  if(TERM()){runShell(src.trim());return}
  const t=src.trim();
  if(t==='clear'||t==='.clear'||t==='cls'){clearScreen();return}
  if(t==='help'||t==='.help'){line('Type any TypeScript and press Enter. Shift+Enter adds a new line.\nThe console shows the value of the last expression after ←.\nclear empties the screen. The Memory panel shows every variable you make.','sys');return}
  if(/^(ls|cd|pwd|node|npm)\b/.test(t)&&!/[=(]/.test(t)){line('That is a terminal command, and this is a TypeScript console. Type TypeScript here.','tip');return}
  RUN={src,mode:MODE,t:Date.now(),logs:[],diags:[],ok:false,err:null};
  let r;
  if(!(await loadTS())){line(COMPILER_FAILED,'err');return}
  try{r=execTS(src)}catch(e){r={err:e}}
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

function curIdx(){const c=S.chap;if(S.cur[c]!==undefined)return S.cur[c];const j=CH[c].missions.findIndex((_,j)=>!S.done[mk(c,j)]);return j}
function curMission(){const j=curIdx();return j>=0?CH[S.chap].missions[j]:null}
function ctx(){return MODE==='project'?{...RUN}:{...RUN,has:n=>DECLS.has(n),types:[...TYPES.keys()]}}
function tryComplete(){
  if(!RUN||(RUN.mode!==MODE&&!(TERM()&&RUN.mode==='sh')))return;
  const c=S.chap,j=curIdx();if(j<0)return;const m=CH[c].missions[j];
  let ok=false;try{ok=!!m.check(ctx())}catch(e){ok=false}
  if(!ok)return;
  const k=mk(c,j),first=!S.done[k];
  S.done[k]=1;const bonus=TSQ.badgePay(S,c,first);if(first)S.xp+=tiers.missionXp(c)+bonus;
  delete S.cur[c];save();RUN=null;
  line('✓ Mission complete: '+esc(m.title)+(first?'   +'+tiers.missionXp(c)+' XP':'')+(bonus?' · badge "'+esc(CH[c].badge)+'" +'+bonus+' XP':''),'win');
  renderTop();renderChapters();renderMission(true);
  const nj=curIdx();if(nj>=0)ensureNeeds(CH[c].missions[nj]);
}
async function ensureNeeds(m){
  if(!m||!m.need||!m.pre)return;
  const missing=m.need.some(n=>n[0]==='@'?!TYPES.has(n.slice(1)):!DECLS.has(n));
  if(!missing)return;
  if(!(await loadTS()))return;
  const R=execTS(m.pre);
  if(R&&R.ok){line('Set up for this mission: '+esc(m.pre.split('\n').join('  ')),'sys');renderMem()}
}
function goMission(j){S.cur[S.chap]=j;save();renderMission();renderChapters();ensureNeeds(CH[S.chap].missions[j]);cmd.focus({preventScroll:true})}

const missionEl=$('#mission');
function anatHTML(a){return '<div class="anat">'+a.map(([t,k,l])=>`<div class="tok k-${k}"><b>${esc(t)}</b><span>${l?esc(l):({kw:'keyword',name:'name',op:'symbol',val:'value',fn:'function',type:'type',arg:'argument'})[k]}</span></div>`).join('')+'</div>'}
function dotsHTML(c,j){return '<div class="dots" aria-label="Missions in this chapter">'+CH[c].missions.map((m,i)=>`<button class="dot${S.done[mk(c,i)]?' done':''}${i===j?' cur':''}" data-m="${i}" aria-label="Mission ${i+1}: ${esc(m.title)}" title="${esc(m.title)}">${i+1}</button>`).join('')+'</div>'}
function renderMission(pop){
  const c=S.chap,ch=CH[c],j=curIdx();
  if(j<0){
    missionEl.innerHTML=`<div class="eyebrow">Chapter ${c+1} complete</div>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div class="badge-art">${c+1}</div><div><h2>${esc(ch.badge)}</h2><p class="intro">Badge earned for finishing <b>${esc(ch.name)}</b>.</p></div></div>
      <div><div class="goal"><div class="label">You can now use</div><div class="learned" style="margin-top:6px">${ch.learned.map(x=>'<code>'+esc(x)+'</code>').join('')}</div></div></div>
      <div class="actions">${c<CH.length-1?`<button class="btn" id="nextChap">Next: ${esc(CH[c+1].name)} →</button>`:'<button class="btn" id="toFire">Play Quick-fire</button>'}<button class="btn ghost" id="toGuide">Field guide</button></div>
      <p class="note">Click any numbered dot to replay a mission. Replays do not add XP, but the practice counts.</p>${dotsHTML(c,-1)}`;
  }else{
    const m=ch.missions[j];
    missionEl.innerHTML=`${Trail.html(ch.story)}<div class="eyebrow">Chapter ${c+1} · Mission ${j+1} of ${ch.missions.length}${S.done[mk(c,j)]?' · replay':''}</div>
      ${ch.first?`<p class="note">Suggested first, in <a href="../script-quest/">Script Quest</a>: ${ch.first.map(([n,t])=>esc(t)+' (chapter '+n+')').join(' and ')}. Nothing is locked.</p>`:''}
      <h2>${esc(m.title)}</h2>
      ${j===0?'<p class="intro">'+HowSteps.tick(ch.intro,esc)+'</p>':''}
      <div class="goal"><div class="label">Your mission</div><p>${HowSteps.tick(m.goal,esc)}</p>${typeof m.code==='string'?'<pre>'+hl(m.code)+'</pre>':''}</div>
      ${m.expectError?'<span class="errgoal">Goal: get an error</span>':''}
      ${anatHTML(m.anat)}
      ${HowSteps.html(m.how)}
      <p class="explain">${m.explain}</p>
      <div class="actions"><button class="btn" id="fill">Type it for me</button><button class="btn ghost" id="hintBtn">Hint</button><button class="btn ghost" id="skip">Skip</button></div>
      <p class="hint" id="hint" hidden>${m.hint||(MODE==='project'?'Change the files as the goal says, then press Run.':'Type the code exactly as shown, then press Enter. For several lines, use Shift+Enter between them.')}</p>
      ${dotsHTML(c,j)}`;
  }
  if(MODE==='project')projEnter();
  if(pop){missionEl.classList.remove('pop');void missionEl.offsetWidth;missionEl.classList.add('pop')}
}
missionEl.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.m!==undefined)return goMission(+b.dataset.m);
  if(b.id==='nextChap')return setChapter(S.chap+1);
  if(b.id==='toFire')return showTab('fire');
  if(b.id==='toGuide')return showTab('guide');
  if(b.id==='hintBtn'){$('#hint').hidden=!$('#hint').hidden;return}
  if(b.id==='skip'){const n=CH[S.chap].missions.length,j=curIdx();if(j+1<n)goMission(j+1);else{delete S.cur[S.chap];save();renderMission()}return}
  if(b.id==='fill'){const m=curMission();if(!m)return;
    if(MODE==='project')return fillFile(m);
    cmd.value=m.code;sizeCmd();cmd.focus({preventScroll:true});cmd.setSelectionRange(cmd.value.length,cmd.value.length)
  }
});

function renderChapters(){TSQ.renderRail($('#chapters'),S)}
$('#chapters').addEventListener('click',e=>{const b=e.target.closest('.chap');if(b)setChapter(+b.dataset.c)});
function renderTop(){
  const r=tiers.rankFor(S.xp),nx=tiers.ranks()[r.index+1];
  $('#rank').textContent=r.name;$('#xpText').textContent=S.xp+' XP';
  $('#xpFill').style.width=(nx?Math.min(100,(S.xp-r.lo)/(nx[0]-r.lo)*100):100)+'%';
  $('#xpFill').parentElement.title=nx?(nx[0]-S.xp)+' XP to '+nx[1]:'Top rank';
}

const mapPanel=$('#mapPanel');let prevSnap={},memTimer=null;
function schedMem(){clearTimeout(memTimer);memTimer=setTimeout(renderMem,120)}
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
  if(MODE==='project')return;
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

// loadTS() starts a fresh load after a failure, so calling this again is the retry
function bootCompiler(){
  loadTS().then(ok=>{line(ok?'TypeScript compiler ready.':COMPILER_FAILED,ok?'sys':'err');const m=curMission();if(ok&&m)ensureNeeds(m)});
}
const ED={file:null,dirty:false};
const ed=$('#ed'),gutter=$('#gutter'),edRun=$('#edRun');
/* project files are never saved, so a reload loses them */
let PKEY=null,PFILES={},RUNID=0,PR=null,PEND=false,NODE=null,tabFree=false;
const pfiles=()=>PFILES[PKEY];
const PPK={};
const PSTORE={
  get files(){return pfiles()},get pkgs(){return PPK[PKEY]||(PPK[PKEY]=[])},
  write(k,v){pfiles()[k]=v;if(ED.file===k&&!ED.dirty){ed.value=v;edSync()}renderFiles(k)},
  remove(k){delete pfiles()[k];if(ED.file===k)openFile(null);renderFiles()},
  list(){return Object.keys(pfiles()).concat(PSTORE.pkgs.length?['node_modules']:[]).sort()},
  installed:p=>PSTORE.pkgs.includes(p),hasModules:()=>PSTORE.pkgs.length>0,
};
const T=window.Terminal.create({line,esc,tableHTML,fmtArgs,toText,errName,errTip,clearScreen,tryComplete,ts:true,
  getRun:()=>RUN,setRun:r=>{RUN=r},isSync:()=>SYNC,setSync:v=>{SYNC=v},syncBar,store:PSTORE,editor:{file:()=>ED.file,dirty:()=>ED.dirty},
  makeRealm,killRealm,renderProject:()=>renderFiles()});
function syncBar(s){$('#procbar').hidden=!s.on;if(s.on)$('#procTxt').textContent='● '+s.label+' is running on port '+s.ports.join(', ')}
$('#procStop').onclick=()=>{T.stop(true);cmd.focus()};
function runShell(src){const r=T.run(src);if(r&&r.catch)r.catch(e=>line('Uncaught '+esc(errName(e)),'err'));return r}
function projCancel(){
  RUNID++;if(PR)PR.stop();PR=null;PEND=false;edRun.disabled=false;killRealm(NODE);NODE=null;T.reset();
}
function projEnter(){
  const j=curIdx();
  if(j<0){
    if(!PKEY){$('#editor').hidden=$('#edbar').hidden=true;mapPanel.innerHTML='<h3>Files</h3><p class="mapsub">Chapter complete. Pick a mission dot to replay it and get its files back.</p>'}
    return;
  }
  $('#editor').hidden=$('#edbar').hidden=false;
  const key=S.chap+'.'+j,m=CH[S.chap].missions[j];
  if(key===PKEY)return renderFiles();
  if(ED.dirty)saveFile();
  projCancel();PKEY=key;ED.file=null;ED.dirty=false;
  if(!PFILES[key])PFILES[key]={...m.start};
  openFile(m.open in PFILES[key]?m.open:Object.keys(PFILES[key])[0]||null);
}
function renderFiles(flash){
  const f=pfiles(),rows=Object.keys(f).sort().map(n=>{const dir=n.endsWith('/'),k=dir?'dir':/\.json$/.test(n)?'json':/\.txt$/.test(n)?'txt':'js',tag=dir?'DIR':k==='js'?/\.js$/.test(n)?'JS':'TS':k.toUpperCase();const size=f[n].split('\n').filter((l,i,a)=>i<a.length-1||l).length;
    return `<button class="frow${ED.file===n?' open':''}${flash===n?' flash':''}" data-f="${esc(n)}"${dir?' disabled':''}><span class="fi ${k}">${tag}</span>${esc(n)}<span class="sz">${dir?'':size+' line'+(size===1?'':'s')}</span></button>`}).join('');
  mapPanel.innerHTML=`<h3>Files</h3><p class="mapsub">The project for this mission. Click a file to open it, change it, then press <b>Run</b>: ${TERM()?'that runs <code>node</code> on the open file, or <code>node --test</code> on a <code>.test.ts</code> file':'that compiles every file and runs <code>main.ts</code>'}. The files stay in this tab until you reload.</p>
    <div class="files">${rows}</div>
    <form class="newfile" id="newfile"><input id="nfName" placeholder="new-file.ts" aria-label="New file name" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn small" type="submit">New file</button></form>
    <div class="legend"><button class="linkbtn" id="resetFiles" type="button">Reset files</button></div>`;
}
function edSync(){
  const n=ed.value.split('\n').length;gutter.textContent=Array.from({length:n},(_,i)=>i+1).join('\n');
  ed.style.height='auto';ed.style.height=ed.scrollHeight+'px';
  $('#edtab').innerHTML=ED.file?esc(ED.file)+(ED.dirty?' <span class="dirty" title="Unsaved changes">●</span>':''):'no file open';
}
function openFile(f){
  if(ED.file&&ED.dirty)saveFile();
  ED.file=f;ED.dirty=false;ed.disabled=!f;ed.value=f?pfiles()[f]:'';
  edSync();renderFiles();
}
function saveFile(){
  if(!ED.file)return false;
  pfiles()[ED.file]=ed.value;ED.dirty=false;edSync();renderFiles(ED.file);return true;
}
function fillFile(m){
  const f=ED.file||m.open;
  if(m.code[f]===undefined){line('There is no example text for '+esc(f||'this file')+'. Open another file.','sys');return}
  if(f!==ED.file)openFile(f);
  ed.value=m.code[f];ED.dirty=true;edSync();ed.focus();
}
async function runProject(){
  if(MODE!=='project'||PEND||!pfiles())return;
  saveFile();
  if(TERM()){
    if(!ED.file)return;
    const src=ED.file==='tsconfig.json'?'tsc':(/\.test\.ts$/.test(ED.file)?'node --test ':'node ')+ED.file;
    H.list.push(src);H.i=H.list.length;echoInput(src,promptEl.textContent);runShell(src);return;
  }
  const my=++RUNID,files={...pfiles()};
  PEND=true;edRun.disabled=true;clearScreen();
  const live=fn=>(...a)=>{if(my===RUNID)fn(...a)};
  try{
    if(!(await loadTS())){if(my===RUNID)line(COMPILER_FAILED,'err');return}
    if(my!==RUNID)return;
    const t=Date.now();
    PR=TSQ.projectRun(files,{
      makeRealm:hk=>{killRealm(NODE);NODE=makeRealm(hk);return NODE},
      fmt:a=>toText(fmtArgs(a)),
      onOut:live((level,args)=>line(level==='raw'?esc(args[0]):level==='table'?tableHTML(args[0]):fmtArgs(args),level==='warn'?'warn':level==='error'?'err':'')),
      onErr:live((e,prom)=>line('Uncaught'+(prom?' (in promise)':'')+' '+esc(errName(e)),'err')),
      onSys:live(s=>line(esc(s),'sys')),
      onClear:live(clearScreen),
    });
    const res=await PR;
    if(my!==RUNID)return;
    RUN={...res,src:'main.ts',mode:'project',t,logs:res.out};
    res.diags.forEach(d=>line('<span class="loc">'+esc(d.file)+':'+d.line+':'+d.col+' </span>error TS'+d.code+': '+esc(d.msg),'diag'));
    if(res.diags.length)line('Nothing ran. TypeScript stopped it before it could cause trouble.','sys');
    else if(res.msg)line(esc(res.msg),'tip');
    else if(res.ok&&!res.out.length)line('main.ts ran and printed nothing.','sys');
    tryComplete();
  }finally{if(my===RUNID){PEND=false;PR=null;edRun.disabled=false}}
}
mapPanel.addEventListener('click',e=>{
  if(MODE!=='project')return;
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.f!==undefined)openFile(b.dataset.f);
  else if(b.id==='resetFiles'){
    const[c,j]=PKEY.split('.'),m=CH[c].missions[j];
    projCancel();PFILES[PKEY]={...m.start};delete PPK[PKEY];ED.dirty=false;
    openFile(m.open in PFILES[PKEY]?m.open:Object.keys(PFILES[PKEY])[0]||null);
    line('Files reset to the starting files.','sys');
  }
});
mapPanel.addEventListener('submit',e=>{
  e.preventDefault();const inp=$('#nfName'),n=(inp.value||'').trim();
  if(TERM()?!/^(?:[\w-]+\/)*[\w-]+(?:\.[\w-]+)*\.(?:ts|json|txt)$/.test(n):!/^[\w-]+(?:\/[\w-]+)*\.ts$/.test(n)){inp.setCustomValidity(TERM()?'Use a name that ends in .ts, .json or .txt, with letters, numbers, dashes or underscores. A folder is fine: util/shout.ts, and so is a dot in the name: a.test.ts':'Use a name that ends in .ts, with letters, numbers, dashes or underscores. A folder is fine: util/shout.ts');inp.reportValidity();return}
  inp.setCustomValidity('');const f=pfiles();if(!(n in f))f[n]='';openFile(n);ed.focus();
});
mapPanel.addEventListener('input',e=>{if(e.target.id==='nfName')e.target.setCustomValidity('')});
ed.addEventListener('input',()=>{ED.dirty=true;edSync()});
ed.addEventListener('blur',()=>{tabFree=false});
ed.addEventListener('keydown',e=>{
  const mod=e.ctrlKey||e.metaKey;
  if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();if(saveFile())line('Saved '+esc(ED.file),'sys');return}
  if(mod&&e.key==='Enter'){e.preventDefault();runProject();return}
  if(e.key==='Escape'){tabFree=true;return}
  if(e.key==='Tab'&&!e.shiftKey&&!tabFree){e.preventDefault();ed.setRangeText('  ',ed.selectionStart,ed.selectionEnd,'end');ED.dirty=true;edSync();return}
  if(e.key==='Enter'){const s=ed.selectionStart,ln=ed.value.slice(0,s).split('\n').pop();const ind=ln.match(/^\s*/)[0]+(/[{(\[]\s*$/.test(ln)?'  ':'');if(ind){e.preventDefault();ed.setRangeText('\n'+ind,s,ed.selectionEnd,'end');ED.dirty=true;edSync()}}
});
$('#edSave').onclick=()=>{if(saveFile())line('Saved '+esc(ED.file),'sys')};
edRun.onclick=runProject;

function setChapter(i){
  if(PKEY&&ED.dirty)saveFile();
  projCancel();PKEY=null;ED.file=null;ED.dirty=false;ed.value='';ed.disabled=true;edSync();
  S.chap=i;save();
  const ch=CH[i];MODE=ch.mode;
  const pj=MODE==='project';
  $('#editor').hidden=!pj;$('#edbar').hidden=!pj;
  const tm=TERM();
  $('.inputline').hidden=pj&&!tm;$('#keys').hidden=pj&&!tm;$('#termbar').hidden=pj&&!tm;
  $('#term').classList.toggle('short',tm);
  clearScreen();RUN=null;
  promptEl.textContent=tm?'~/my-app $ ':'ts> ';
  cmd.setAttribute('aria-label',tm?'Type a terminal command':'Type TypeScript and press Enter');
  $('#crumbs').innerHTML='<span class="modepill">TypeScript</span><span>'+(tm?'Edit the files, then press Run or type commands. <code>tsc</code> checks, <code>node file.ts</code> runs.':pj?'Edit the files, then press Run. Real TypeScript type-checking, then <code>main.ts</code> runs.':'Real TypeScript type-checking, then the code runs.')+'</span>';
  $('#fresh').textContent='Fresh console';
  freshConsole();
  line('Chapter '+(i+1)+': '+esc(ch.name),'tip');
  line(pj?'Edit the files and press Run. Loading the compiler…':'Type TypeScript and press Enter. Loading the compiler…','sys');
  renderMem();
  bootCompiler();
  renderChapters();renderMission();
  if(method()==='none')line('This browser blocked running code inside the page, so the console cannot run anything here. Try a different browser.','err');
}
$('#fresh').onclick=()=>{
  T.reset();freshConsole();clearScreen();line(TERM()?'Fresh console: the screen is cleared and any running program stopped. Your files are kept.':'Fresh console: all variables cleared.','sys');renderMem();bootCompiler();cmd.focus();
};

function sizeCmd(){cmd.rows=Math.max(1,cmd.value.split('\n').length)}
cmd.addEventListener('input',sizeCmd);
cmd.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){
    if(!TERM()&&isIncomplete(cmd.value)){e.preventDefault();const s=cmd.selectionStart;const ln=cmd.value.slice(0,s).split('\n').pop();const ind=ln.match(/^\s*/)[0]+(/[{(\[]\s*$/.test(ln)?'  ':'');cmd.setRangeText('\n'+ind,s,cmd.selectionEnd,'end');sizeCmd();return}
    e.preventDefault();submit();return}
  if(e.key==='Tab'&&TERM()){e.preventDefault();const s=cmd.selectionStart,pre=cmd.value.slice(0,s).split(/\s/).pop(),hits=PSTORE.list().filter(f=>f.startsWith(pre)&&f!==pre);
    if(hits.length===1)cmd.setRangeText(hits[0].slice(pre.length)+' ',s,s,'end');else if(hits.length>1)line(esc(hits.join('  ')),'sys');return}
  if(e.key==='Tab'){e.preventDefault();cmd.setRangeText('  ',cmd.selectionStart,cmd.selectionEnd,'end');sizeCmd();return}
  if(e.key==='ArrowUp'&&!cmd.value.slice(0,cmd.selectionStart).includes('\n')){if(H.i>0){e.preventDefault();H.i--;cmd.value=H.list[H.i];sizeCmd()}return}
  if(e.key==='ArrowDown'&&!cmd.value.slice(cmd.selectionEnd).includes('\n')){if(H.i<H.list.length){e.preventDefault();H.i++;cmd.value=H.list[H.i]||'';sizeCmd()}return}
  if(e.key.toLowerCase()==='c'&&e.ctrlKey&&cmd.selectionStart===cmd.selectionEnd&&TERM()&&T.procOn()){e.preventDefault();T.stop(true);return}
  if(e.key.toLowerCase()==='l'&&e.ctrlKey){e.preventDefault();clearScreen()}
});
term.addEventListener('click',()=>{if(!getSelection().toString())cmd.focus({preventScroll:true})});
$('#keys').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;
  if(k==='ENTER'){submit()}else if(k==='UP'){if(H.i>0){H.i--;cmd.value=H.list[H.i];sizeCmd()}}
  else{const ins=k==='TAB'?'  ':k==='NL'?'\n':k;cmd.setRangeText(ins,cmd.selectionStart,cmd.selectionEnd,'end');sizeCmd()}
  cmd.focus({preventScroll:true})});

function showTab(t){
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  ['quest','fire','guide'].forEach(x=>$('#tab-'+x).hidden=x!==t);
  if(t==='fire')fireIdle();
  if(t!=='fire')fireStop();
  if(t==='guide'&&!$('#guide').innerHTML)renderGuide();
}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

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
  fStage.innerHTML=`<div class="example"><div class="eyebrow">Example</div><pre class="snip">${hl(ex.c)}</pre><p class="note" style="margin-top:8px">Answer: <code>${esc(ex.o[ex.a])}</code>. ${esc(ex.w)}</p></div>
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
  fStage.innerHTML=`<div class="task">What does TypeScript say?</div><pre class="snip">${hl(q.c)}</pre>
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
    ${F.misses.length?'<div class="eyebrow">Worth another look</div><ul class="misses">'+F.misses.map(q=>`<li><pre>${hl(q.c)}</pre><span>TypeScript says <code>${esc(q.o[q.a])}</code>. ${esc(q.w)}</span></li>`).join('')+'</ul>':'<p class="note">No misses. Impressive.</p>'}
    <div class="actions"><button class="btn" id="fGo">Play again</button></div>`;
  $('#fGo').onclick=fireStart;
}

function renderGuide(){
  const g=$('#guide');
  const present=[];CH.forEach((_,i)=>{const t=tiers.tierOf(i);if(!present.includes(t))present.push(t)});
  g.innerHTML=TSQ.guideHTML({esc,hl,tiers:present,tierOf:i=>tiers.tierOf(i)});
  const f=g.querySelector('.gfilter');if(!f)return;
  f.addEventListener('click',e=>{const b=e.target.closest('button[data-tier]');if(!b)return;const t=b.dataset.tier;
    f.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    g.querySelectorAll('.gsec').forEach(s=>{s.hidden=t!=='all'&&('extras' in s.dataset||(s.dataset.tier||'beginner')!==t)})});
}

renderTop();
setChapter(Math.min(S.chap||0,CH.length-1));
if(location.hash==='#fire')showTab('fire');else if(location.hash==='#guide')showTab('guide');

})();
