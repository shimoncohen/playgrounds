(function (HQ) { 'use strict';
const S=HQ.S;
const {esc,insideBox,CH,fresh,D,K,age,endpoints,depStatus,depPods,appOf,ref,live,NODES,ensureFiles,execLine,tick,save,vfs,KRES,qfOpen,QF,canon,PZ_DF,PZ_Y,GUIDE,KEY,parseYaml}=HQ;
HQ.onTick=onTick;
const $=s=>document.querySelector(s);
const RANKS=[[0,'Deckhand'],[120,'Dockworker'],[300,'Rigger'],[520,'Shipwright'],[800,'Harbor Pilot'],[1080,'Fleet Captain']];
/* ---------- UI ---------- */
const screen=$('#screen'),cmdIn=$('#cmd'),termEl=$('#term');
let histIdx=S.hist.length,pop=false,known=null;
const colorIdx={};function appColor(a){if(!(a in colorIdx))colorIdx[a]=Object.keys(colorIdx).length%5;return `var(--app${colorIdx[a]+1})`}
function paint(o){let h=esc(o.t);
  if(o.c==='tbl'||o.c==='hd'||o.c===''){h=h.replace(/\b(Running|Completed|Ready|Active|Up (?:About )?(?:an? |\d+ )?\w+)\b/g,'<span class="c-x">$1</span>').replace(/\b(ErrImagePull|ImagePullBackOff|CrashLoopBackOff|Exited \(\d+\)[^ ]*|Terminating|Error)\b/g,'<span class="c-e">$1</span>').replace(/\b(Pending|ContainerCreating|Created)\b/g,'<span class="c-n">$1</span>')}
  if(o.c==='ls')h=h.replace(/\u0001([^\s]+)/g,'<span class="c-d">$1</span>');
  if(o.c==='okl')h=h.replace(/✔/g,'<span class="c-x">✔</span>');
  return h}
function addLine(html,cls){const d=document.createElement('div');d.className='line'+(cls?' '+cls:'');d.innerHTML=html||'';screen.appendChild(d);while(screen.childNodes.length>600)screen.removeChild(screen.firstChild)}
function scrollDown(){termEl.scrollTop=termEl.scrollHeight}
function promptHTML(){const b=insideBox();if(b){const host=b.isPod?b.name:b.id.slice(0,12);const cwd=b.cwd||'/';
    return (b.shell==='bash'||(!b.isPod&&['web','httpd','redis','pg'].includes(b.kind)))?`<span class="p-in">root@${esc(host)}</span>:<span class="p-path">${esc(cwd)}</span><span class="p-sym"># </span>`:`<span class="p-path">${esc(cwd)}</span><span class="p-sym"> # </span>`}
  return `<span class="p-user">you@harbor</span>:<span class="p-path">~/shop</span><span class="p-sym">$ </span>`}
function renderPrompt(){$('#prompt').innerHTML=promptHTML()}
function renderWhere(){const b=insideBox();const el=$('#where');
  el.innerHTML=b?`<span class="wpill in">Inside ${b.isPod?'pod':'container'} <code>${esc(b.name)}</code></span><span class="wnote">Type <code>exit</code> to return to your laptop</span>`:`<span class="wpill">On your laptop</span><span class="wnote">in <code>~/shop</code> · cluster <code>kind-harbor</code></span>`}
function renderXP(){let i=0;while(i+1<RANKS.length&&S.xp>=RANKS[i+1][0])i++;const lo=RANKS[i][0],hi=i+1<RANKS.length?RANKS[i+1][0]:lo;
  $('#rank').textContent=RANKS[i][1];$('#xpText').textContent=S.xp+' XP';$('#xpFill').style.width=(hi>lo?Math.min(100,(S.xp-lo)/(hi-lo)*100):100)+'%'}
const totalDone=i=>CH[i].missions.filter((m,j)=>S.done[i+'.'+j]).length;
function renderChapters(){$('#chapters').innerHTML=CH.map((c,i)=>`${i===0?'<div class="rail-lbl">Docker</div>':i===7?'<div class="rail-lbl">Kubernetes</div>':''}<button class="chap${S.badges[i]?' earned':''}" data-ch="${i}" aria-current="${i===S.ch}"><span class="num">${S.badges[i]?'★':i+1}</span><span class="nm">${esc(c.name)}</span><span class="ct">${totalDone(i)}/${c.missions.length}</span></button>`).join('')}
const LBL={cmd:'program',sub:'action',opt:'option',arg:'target',img:'image',val:'value',op:'joins'};
const KCL={cmd:'k-cmd',sub:'k-kw',opt:'k-opt',arg:'k-arg',img:'k-arg',val:'k-var',op:'k-op'};
function anatomy(a){return `<div class="anat">${a.map(([t,k,l])=>`<div class="tok ${KCL[k]}"><b>${esc(t)}</b><span>${esc(l||LBL[k])}</span></div>`).join('')}</div>`}
const ansOf=m=>typeof m.ans==='function'?m.ans():m.ans;
/* Ordered multi-step missions: m.steps=[{g,a?,h,ans,ok}] must be done in the order given; only the next open step is judged, and one command finishes at most one step.
   Progress is S.steps['<ch>.<mi>'] (indexes done), created lazily and dropped on completion, so old saves load unchanged. */
const stepsDone=key=>(S.steps&&S.steps[key])||[];
const curOf=(m,key)=>m.steps?m.steps[Math.min(stepsDone(key).length,m.steps.length-1)]:m;
const stepList=(m,key,all)=>{const d=stepsDone(key);return `<ul class="steps" aria-label="Steps">${m.steps.map((s,i)=>{const t=all||d.includes(i);return `<li class="${t?'done':''}"><span class="tick" aria-hidden="true">${t?'✓':''}</span><span>${s.g}${t?'<span class="sr"> (done)</span>':''}</span></li>`}).join('')}</ul>`};
let hintOpen=false;
function renderMission(){const ch=CH[S.ch],n=ch.missions.length;const el=$('#mission');
  const dotsH=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((m,i)=>`<button class="dot${S.done[S.ch+'.'+i]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(m.t)}" aria-label="Mission ${i+1}: ${esc(m.t)}">${i+1}</button>`).join('')}</div>`;
  const picH=open=>`<details class="picbox"${open?' open':''}><summary>Picture it</summary>${ch.pic}</details>`;
  let h;
  if(S.mi>=n){const all=totalDone(S.ch)===n,last=S.ch===CH.length-1;
    h=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art${all?'':' dim'}">${all?'★':S.ch+1}</div>
    <h2>${last&&all?'You finished Harbor Quest':all?'Badge earned: '+esc(ch.badge):'Chapter finished'}</h2>
    <p class="explain">${last&&all?'You can run, connect and persist containers, package your own app, start a whole stack with Compose, and run, heal, scale, expose, update and roll back apps on Kubernetes, both by command and from YAML.':'You can now use these on a real machine:'}</p>
    <div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
    ${last?`<p class="note">Next: play Quick-fire until the commands come from memory, solve the puzzles, then install Docker for real. The field guide shows how.</p><div class="actions"><button class="btn" data-act="tab-fire">Play Quick-fire</button><button class="btn ghost" data-act="tab-guide">Open the field guide</button></div>`
      :`<div class="actions"><button class="btn" data-act="nextch">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button></div>`}${picH(false)}${dotsH}`}
  else{const m=ch.missions[S.mi];const mk=S.ch+'.'+S.mi,done=S.done[mk],cur=curOf(m,mk),st=m.steps;
    h=`${Trail.html(ch.story)}<div class="eyebrow">Chapter ${S.ch+1} · Mission ${S.mi+1} of ${n}${st&&!done?` · ${stepsDone(mk).length} of ${st.length} steps done`:''}${done?' · done':''}</div><h2>${esc(m.t)}</h2><p class="intro">${m.i}</p>
    <div class="goal"><div class="label">Your move</div><p>${m.g}</p>${st?stepList(m,mk,!!done):''}</div>${cur.a?anatomy(cur.a):''}${HowSteps.html(m.how)}
    <div class="actions"><button class="btn ghost" data-act="hint">${hintOpen?'Hide hint':'Hint'}</button><button class="btn ghost" data-act="show">Fill it in for me</button>${done?`<button class="btn ghost" data-act="skip">Next mission</button>`:''}</div>
    ${hintOpen?`<p class="hint">${esc(cur.h)}</p>`:''}${picH(S.mi===0)}${dotsH}`}
  el.innerHTML=h;if(pop){el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');pop=false}}
/* live view */
const SHORT={Running:'running',Pending:'pending',ContainerCreating:'creating',ErrImagePull:'pull error',ImagePullBackOff:'back-off',Terminating:'stopping',CrashLoopBackOff:'crashing',Completed:'done'};
function viewMode(){return S.view==='auto'?CH[S.ch].view:S.view}
function cyl(){return `<svg class="cyl" viewBox="0 0 16 18" aria-hidden="true"><ellipse cx="8" cy="4" rx="6.5" ry="2.6"/><path d="M1.5 4v10c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6V4"/></svg>`}
function dockerView(fresh){const d=D();const imgs=Object.values(d.images).sort((a,b)=>a.created-b.created);const cs=d.containers;const ins=S.inside&&S.inside.type==='c'?S.inside.id:null;
  const nu=id=>fresh&&known&&!known.has(id)?' new':'';const seenIds=new Set();
  const imgH=imgs.length?`<div class="imgs">${imgs.map(i=>{seenIds.add('i'+i.key);const n=Math.min(8,Math.max(1,i.layers.filter(l=>l[1]!=='0B').length));return `<button class="img${nu('i'+i.key)}${i.built?' built':''}" data-fill="docker history ${esc(i.key)}" title="${esc(i.key)} · ${esc(i.size)} · click to see its layers"><span class="lay">${'<i></i>'.repeat(n)}</span><b>${esc(i.name)}<span>:${esc(i.tag)}</span></b><small>${esc(i.size)}${i.built?' · built by you':''}</small></button>`}).join('')}</div>`:`<div class="empty">No images yet. They arrive when you pull or run one.</div>`;
  const netName=n=>n==='bridge'?'':n;
  const ctrH=cs.length?`<div class="ctrs">${cs.slice().reverse().map(c=>{seenIds.add(c.id);const st=c.status==='running'?'run':c.status==='created'?'created':'exit';
    const chips=[];if(c.status==='running')c.ports.forEach(([h,p])=>chips.push(`<span class="chip port">:${h} → ${p}</span>`));if(netName(c.net))chips.push(`<span class="chip net" style="--c:${appColor('net:'+c.net)}">${esc(c.net)}</span>`);
    c.mounts.forEach(m=>chips.push(`<span class="chip vol">${esc(m.vol||m.src)} → ${esc(m.path)}</span>`));if(c.id===ins)chips.push('<span class="chip you">you are inside</span>');
    return `<button class="ctr ${st}${c.id===ins?' inside':''}${nu(c.id)}${HQ.HIT===c.id?' hit':''}" data-ctr="${esc(c.name)}" title="Click to fill a command for ${esc(c.name)}"><span class="st" aria-hidden="true"></span><span class="nm">${esc(c.name)}</span><span class="stt">${c.status==='running'?'running':c.status==='created'?'created':'exited ('+c.code+')'}</span><span class="im">${esc(c.image)}</span><span class="meta">${chips.join('')}</span></button>`}).join('')}</div>`:`<div class="empty">No containers. <code>docker run</code> creates one.</div>`;
  const nets=Object.entries(d.networks).filter(([n,x])=>!x.builtin);
  const netH=`<div class="nets"><div class="netrow"><b>bridge</b><span>default · no names · ${cs.filter(c=>c.status==='running'&&c.net==='bridge').length} running</span></div>${nets.map(([n])=>`<div class="netrow" style="--c:${appColor('net:'+n)}"><b>${esc(n)}</b><span>${cs.filter(c=>c.status==='running'&&c.net===n).map(c=>esc(c.alias||c.name)).join(', ')||'empty'}</span></div>`).join('')}</div>`;
  const vols=Object.entries(d.volumes);const volH=vols.length?`<div class="vols">${vols.map(([n,v])=>{const k=Object.keys(v.files).length;return `<div class="vol${nu('v'+n)}">${cyl()}<b>${esc(n.length>22?n.slice(0,20)+'…':n)}</b><small>${k} file${k===1?'':'s'}</small></div>`}).join('')}</div>`:`<div class="empty">No volumes yet.</div>`;
  vols.forEach(([n])=>seenIds.add('v'+n));
  const run=cs.filter(c=>c.status==='running').length;
  return {html:`<p class="mapsub">Everything Docker is holding on your laptop. Click a container or image to fill in a command for it.</p>
   <div class="vsec"><div class="vlab"><span>Containers</span><span>${run} running · ${cs.length} total</span></div>${ctrH}</div>
   <div class="vsec"><div class="vlab"><span>Images</span><span>${imgs.length}</span></div>${imgH}</div>
   <div class="vsec"><div class="vlab"><span>Networks</span></div>${netH}</div>
   <div class="vsec"><div class="vlab"><span>Volumes</span></div>${volH}</div>`,ids:seenIds}}
function k8sView(fresh){const ids=new Set();const nu=id=>fresh&&known&&!known.has(id)?' new':'';
  const userPods=K().pods.filter(p=>!p.sys);const ins=S.inside&&S.inside.type==='p'?S.inside.id:null;
  const evs=K().events.filter(e=>e.ns!=='kube-system').slice(-4).reverse();
  const cp=`<div class="cp"><div class="vlab"><span>Control plane</span><span>harbor-control-plane</span></div><div class="cpparts"><span class="chip">API server</span><span class="chip">scheduler</span><span class="chip">controllers</span><span class="chip">etcd</span></div>
   <div class="feed" aria-live="off">${evs.length?evs.map(e=>`<div${e.type==='Warning'?' class="warn"':''}><b>${esc(e.reason)}</b> ${esc(e.msg.length>78?e.msg.slice(0,76)+'…':e.msg)} <small>${age(e.t)}</small></div>`).join(''):'<div>Quiet. Waiting for your first kubectl command.</div>'}</div></div>`;
  const svcs=Object.values(K().svcs).filter(s=>!s.sys);const fw=Object.entries(K().fwd);
  const svcH=svcs.length?`<div class="svcs">${svcs.map(s=>{const e=endpoints(s).length;const f=fw.filter(([p,x])=>x.kind==='svc'&&x.name===s.name&&x.ns===s.ns).map(([p])=>`<span class="chip port">localhost:${p}</span>`).join('');const app=s.selector&&(s.selector.app||s.selector.run);
    return `<div class="svc" style="--c:${appColor(app||s.name)}"><b>svc/${esc(s.name)}</b>${s.ns!=='default'?`<span class="chip ns">${esc(s.ns)}</span>`:''}<span>${esc(s.type)} · port ${s.port} → ${e} pod${e===1?'':'s'}</span>${f}</div>`}).join('')}</div>`:'';
  const deps=Object.values(K().deps);
  const depH=deps.length?`<div class="deps">${deps.map(d=>{const s=depStatus(d);const roll=s.old>0;const bad=depPods(d).some(p=>/ErrImagePull|ImagePullBackOff/.test(p.phase));
    return `<div class="dep" style="--c:${appColor(d.labels.app)}"><b>deploy/${esc(d.name)}</b>${d.ns!=='default'?`<span class="chip ns">${esc(d.ns)}</span>`:''}<span class="want" title="${s.ready} ready of ${d.replicas} wanted">${Array.from({length:Math.max(d.replicas,s.ready)},(x,i)=>`<i class="${i<s.ready?'on':''}${i>=d.replicas?' extra':''}"></i>`).join('')}</span><small>${s.ready}/${d.replicas} ready · ${esc(d.image)}</small>${bad?'<span class="chip bad">rollout stuck</span>':roll?'<span class="chip roll">rolling out</span>':''}</div>`}).join('')}</div>`:'';
  const node=n=>{const ps=userPods.filter(p=>p.node===n.name);const sysn=K().pods.filter(p=>p.sys&&p.node===n.name).length;
    return `<div class="node"><h5>${esc(n.name.replace('harbor-',''))}</h5><div class="pods">${ps.length?ps.map(p=>{ids.add('p'+p.ns+p.name);const app=appOf(p)||p.name;const st=p.phase;
      const cls=st==='Running'?'ok':st==='Terminating'?'gone':/Err|BackOff/.test(st)?'bad':st==='Completed'?'ok':'pend';
      return `<button class="pod ${cls}${nu('p'+p.ns+p.name)}${HQ.HIT===p.name?' hit':''}${ins===p.name?' inside':''}" style="--c:${cls==='bad'?'var(--err)':appColor(app)}" data-pod="${esc(p.name)}" data-ns="${esc(p.ns)}" title="${esc(p.name)} · ${esc(st)} · ${esc(p.image)}"><b>${esc(app)}</b><small>${esc(p.name.slice(-5))} · ${esc(ref(p.image).tag)}</small><em>${esc(SHORT[st]||st)}</em>${p.ns!=='default'?`<span class="nst">${esc(p.ns)}</span>`:''}</button>`}).join(''):'<span class="nopods">no app pods</span>'}</div><small class="sysn">+ ${sysn} system pods</small></div>`};
  return {html:`<p class="mapsub">Your kind cluster, live. Pods appear, move through their states and get replaced as you type. Click a pod to fill in a command for it.</p>
    ${cp}${svcH?`<div class="vsec"><div class="vlab"><span>Services</span></div>${svcH}</div>`:''}${depH?`<div class="vsec"><div class="vlab"><span>Deployments</span></div>${depH}</div>`:''}
    <div class="vsec"><div class="vlab"><span>Worker nodes</span><span>${userPods.filter(live).length} app pods</span></div><div class="nodes">${node(NODES[1])}${node(NODES[2])}</div></div>
    <div class="legend"><span><span class="sw" style="background:var(--ok)"></span>running</span><span><span class="sw dash"></span>starting</span><span><span class="sw" style="background:var(--err)"></span>failing</span><span><span class="sw" style="background:var(--line)"></span>stopping</span></div>`,ids}}
function renderView(fresh){const mode=viewMode();$('#vDocker').setAttribute('aria-pressed',String(mode==='docker'));$('#vK8s').setAttribute('aria-pressed',String(mode==='k8s'));
  $('#vTitle').textContent=mode==='docker'?'Your laptop':'The cluster';
  const r=mode==='docker'?dockerView(fresh):k8sView(fresh);$('#view').innerHTML=r.html;known=r.ids;HQ.HIT=null}
function onTick(){if(!$('#tab-quest').hidden)renderView(true);if(HQ.insideLost){HQ.insideLost=false;addLine(esc('(The pod you were inside was deleted, so you are back on your laptop.)'),'sys');renderPrompt();renderWhere();scrollDown()}}
let landed=null;const setups=[];
function ensureNeeds(){const key=S.ch+'.'+S.mi;if(key===landed)return;landed=key;const m=CH[S.ch]?.missions[S.mi];if(!m||S.done[key])return;
  const miss=(m.files||[]).filter(f=>S.files[f]==null);ensureFiles(miss);
  const lines=m.pre?m.pre():[];const ran=[];
  const keep=S.inside,was=insideBox()?.name;S.inside=null;
  for(const l of lines){const c=typeof l==='function'?l():l;if(c){ran.push(c);execLine(c)}tick()}
  if(!S.inside)S.inside=keep;
  if(miss.length)addLine(esc(`(New file${miss.length>1?'s':''} in your folder: ${miss.join(', ')}.)`),'sys');
  if(ran.length){const msg=`(Set up for this mission${was&&S.inside!==keep?`: left the ${was} shell, then ran`:', as if you had run'}: ${ran.join('; ')}.)`;setups.push(msg);addLine(esc(msg),'sys')}}
function renderAll(){ensureNeeds();renderPrompt();renderWhere();renderChapters();renderMission();renderXP();renderView(true)}
function setupChapter(i){const ch=CH[i];const msgs=[];if(ch.files){const n=ensureFiles(ch.files);if(n)msgs.push(`(New file${n>1?'s':''} in your folder: ${ch.files.join(', ')}.)`)}if(ch.setup){const m=ch.setup();if(m)msgs.push(m)}return msgs}
function goChapter(i){S.ch=i;hintOpen=false;S.view='auto';const open=CH[i].missions.findIndex((m,j)=>!S.done[i+'.'+j]);S.mi=open<0?CH[i].missions.length:open;
  setupChapter(i).forEach(m=>addLine(esc(m),'sys'));known=null;renderAll();save();scrollDown()}
/* missions */
function checkMission(c){const ch=CH[S.ch];if(S.mi>=ch.missions.length)return;const m=ch.missions[S.mi];if(S.done[S.ch+'.'+S.mi])return; /* revisiting a finished mission never celebrates it again */
  const key=S.ch+'.'+S.mi;let good=false;
  if(m.steps){const d=stepsDone(key).slice();let fresh=0;
    {const i=d.length;let ok=false;try{ok=!!m.steps[i].ok(c)}catch(e){}if(ok){d.push(i);fresh++}}
    good=d.length>=m.steps.length;
    if(good){if(S.steps){delete S.steps[key];if(!Object.keys(S.steps).length)delete S.steps}}
    else{if(fresh){S.steps=S.steps||{};S.steps[key]=d;addLine(esc(`✓ Step done: ${m.t}. ${m.steps.length-d.length} more to go.`),'win')}return}}
  else{try{good=!!m.ok(c)}catch(e){}if(!good)return}
  const isNew=!S.done[key];S.done[key]=1;if(isNew)S.xp+=10;hintOpen=false;
  addLine(esc(`✓ Mission complete: ${m.t}${isNew?'   +10 XP':''}`),'win');if(m.after)addLine(HowSteps.tick(m.after,esc),'note');
  const next=ch.missions.findIndex((x,j)=>j>S.mi&&!S.done[S.ch+'.'+j]);
  if(next>=0)S.mi=next;else{const first=ch.missions.findIndex((x,j)=>!S.done[S.ch+'.'+j]);if(first>=0)S.mi=first;
    else{S.mi=ch.missions.length;if(!S.badges[S.ch]){S.badges[S.ch]=1;S.xp+=25;addLine(esc(`★ Chapter complete! Badge earned: ${ch.badge}   +25 XP`),'win big')}}}
  pop=true}
function run(line){addLine(promptHTML()+esc(line));if(line.trim())S.hist.push(line);histIdx=S.hist.length;
  if(line.trim()){const r=execLine(line);let text=[];for(const o of r.out){if(o.clear){screen.innerHTML='';continue}addLine(paint(o),o.c);text.push(o.t)}
    checkMission({line,out:text.join('\n'),code:r.code});
    if(HQ.pendingEdit){const f=HQ.pendingEdit;HQ.pendingEdit=null;setTimeout(()=>openEditor(f),30)}}
  renderAll();save();scrollDown()}
function fill(v){showTab('quest');cmdIn.value=v;cmdIn.focus();try{cmdIn.setSelectionRange(v.length,v.length)}catch(e){}}
/* editor */
let edFile=null;
function openEditor(f){edFile=f;$('#edName').textContent=f+(S.files[f]==null?' (new file)':'');$('#edText').value=S.files[f]??'';$('#editor').hidden=false;setTimeout(()=>$('#edText').focus(),0)}
function closeEditor(saveIt){if(edFile==null)return;const f=edFile;edFile=null;$('#editor').hidden=true;
  if(saveIt){S.files[f]=$('#edText').value.replace(/\s+$/,'');addLine(esc(`Saved ${f}.`),'sys');checkMission({line:'edit '+f,out:'',code:0});renderAll();save()}else addLine(esc(`Closed ${f} without saving.`),'sys');scrollDown();cmdIn.focus()}
$('#edSave').addEventListener('click',()=>closeEditor(true));$('#edCancel').addEventListener('click',()=>closeEditor(false));
$('#edText').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeEditor(false)}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();closeEditor(true)}
  if(e.key==='Tab'){e.preventDefault();const t=e.target,s=t.selectionStart;t.value=t.value.slice(0,s)+'  '+t.value.slice(t.selectionEnd);t.selectionStart=t.selectionEnd=s+2}});
/* tab completion */
const DSUB=['run','ps','images','pull','rmi','history','logs','stop','start','restart','rm','exec','inspect','network','volume','build','tag','push','login','compose','version','container','image','system'];
const KVERB=['get','describe','create','run','delete','scale','expose','set','rollout','logs','exec','port-forward','apply','cluster-info','version','config'];
function complete(){const v=cmdIn.value,pos=cmdIn.selectionStart??v.length,before=v.slice(0,pos),after=v.slice(pos);const words=before.split(/\s+/);const word=words[words.length-1];const prev=words.slice(0,-1);
  const b=insideBox();let cands=[];
  if(b){if(prev.length===0)cands=['ls','cat','echo','pwd','cd','hostname','whoami','env','ps','ping','curl','exit'];else{const v2=vfs(b);const idx=word.lastIndexOf('/');const dir=word.slice(0,idx+1);const base=word.slice(idx+1);const abs=dir?(dir.startsWith('/')?dir:(b.cwd||'/')+'/'+dir):(b.cwd||'/');const l=v2.list(abs)||[];cands=l.filter(([n])=>n.startsWith(base)).map(([n,k])=>dir+n+(k==='d'?'/':' '))}}
  else if(prev.length===0)cands=['docker','kubectl','curl','ls','cat','edit','echo','clear','help','history'].map(x=>x+' ');
  else if(prev.length===1&&prev[0]==='docker')cands=DSUB.map(x=>x+' ');
  else if(prev.length===1&&(prev[0]==='kubectl'||prev[0]==='k'))cands=KVERB.map(x=>x+' ');
  else if(prev[0]==='docker'&&prev[1]==='compose'&&prev.length===2)cands=['up','down','ps','logs','build'].map(x=>x+' ');
  else if(prev[0]==='docker'&&(prev[1]==='network'||prev[1]==='volume')&&prev.length===2)cands=['create','ls','rm','inspect'].map(x=>x+' ');
  else if((prev[0]==='kubectl'||prev[0]==='k')&&prev[1]==='rollout'&&prev.length===2)cands=['status','history','undo','restart'].map(x=>x+' ');
  else if((prev[0]==='kubectl'||prev[0]==='k')&&['get','describe','delete','scale','expose','logs'].includes(prev[1])&&prev.length===2&&!word.includes('/'))cands=(prev[1]==='scale'||prev[1]==='expose'?['deployment']:KRES).map(x=>x+' ');
  else{const pool=new Set();D().containers.forEach(c=>pool.add(c.name));Object.keys(D().images).forEach(k=>pool.add(k));Object.keys(D().volumes).forEach(k=>pool.add(k));Object.keys(D().networks).forEach(k=>pool.add(k));
    K().pods.filter(p=>!p.sys&&live(p)).forEach(p=>pool.add(p.name));Object.values(K().deps).forEach(d=>{pool.add(d.name);pool.add('deployment/'+d.name)});Object.values(K().svcs).filter(s=>!s.sys).forEach(s=>{pool.add(s.name);pool.add('svc/'+s.name)});
    Object.keys(S.files).forEach(f=>pool.add(f));Object.keys(K().nss).forEach(n=>pool.add(n));cands=[...pool].filter(x=>x.startsWith(word)).map(x=>x+' ')}
  cands=[...new Set(cands.filter(x=>x.startsWith(word)))];if(!cands.length)return;
  if(cands.length===1){const nv=before.slice(0,before.length-word.length)+cands[0];cmdIn.value=nv+after;try{cmdIn.setSelectionRange(nv.length,nv.length)}catch(e){}return}
  let pre=cands[0];for(const c of cands)while(!c.startsWith(pre))pre=pre.slice(0,-1);
  if(pre.length>word.length){const nv=before.slice(0,before.length-word.length)+pre;cmdIn.value=nv+after;try{cmdIn.setSelectionRange(nv.length,nv.length)}catch(e){}}
  else{addLine(promptHTML()+esc(v));addLine(esc(cands.map(c=>c.trim()).sort().join('   ')),'sys');scrollDown()}}
cmdIn.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();const v=cmdIn.value;cmdIn.value='';run(v)}
  else if(e.key==='Tab'){e.preventDefault();complete()}
  else if(e.key==='ArrowUp'){e.preventDefault();if(histIdx>0){histIdx--;cmdIn.value=S.hist[histIdx]||''}}
  else if(e.key==='ArrowDown'){e.preventDefault();if(histIdx<S.hist.length){histIdx++;cmdIn.value=S.hist[histIdx]||''}}
  else if(e.key==='l'&&e.ctrlKey){e.preventDefault();screen.innerHTML=''}
  else if(e.key==='c'&&e.ctrlKey&&!window.getSelection().toString()){e.preventDefault();addLine(promptHTML()+esc(cmdIn.value)+'^C');cmdIn.value='';scrollDown()}});
termEl.addEventListener('click',()=>{if(!window.getSelection().toString())cmdIn.focus()});
$('#keys').addEventListener('click',e=>{const b=e.target.closest('[data-k]');if(!b)return;const k=b.dataset.k;
  if(k==='TAB')complete();else if(k==='UP'){if(histIdx>0){histIdx--;cmdIn.value=S.hist[histIdx]||''}}else if(k==='ENTER'){const v=cmdIn.value;cmdIn.value='';run(v)}else{const s=cmdIn.selectionStart??cmdIn.value.length;cmdIn.value=cmdIn.value.slice(0,s)+k+cmdIn.value.slice(cmdIn.selectionEnd??s);try{cmdIn.setSelectionRange(s+k.length,s+k.length)}catch(x){}}cmdIn.focus()});
$('#chapters').addEventListener('click',e=>{const b=e.target.closest('[data-ch]');if(b)goChapter(+b.dataset.ch)});
$('#mission').addEventListener('click',e=>{const d=e.target.closest('[data-mi]');if(d){S.mi=+d.dataset.mi;hintOpen=false;renderAll();scrollDown();save();return}
  const a=e.target.closest('[data-act]');if(!a)return;const act=a.dataset.act;const m=CH[S.ch].missions[S.mi];
  if(act==='hint'){hintOpen=!hintOpen;renderMission()}else if(act==='show'&&m){fill(ansOf(curOf(m,S.ch+'.'+S.mi)))}else if(act==='skip'){S.mi=Math.min(S.mi+1,CH[S.ch].missions.length);hintOpen=false;renderAll();scrollDown();save()}
  else if(act==='nextch')goChapter(S.ch+1);else if(act==='tab-fire')showTab('fire');else if(act==='tab-guide')showTab('guide')});
$('#view').addEventListener('click',e=>{const m=CH[S.ch].missions[S.mi]||{};const p=e.target.closest('[data-pod]');
  if(p){const pd={name:p.dataset.pod,ns:p.dataset.ns};fill(m.fill&&m.fill.pod?m.fill.pod(pd):`kubectl describe pod ${pd.name}${pd.ns!=='default'?' -n '+pd.ns:''}`);return}
  const c=e.target.closest('[data-ctr]');if(c){fill(m.fill&&m.fill.ctr?m.fill.ctr(c.dataset.ctr):`docker logs ${c.dataset.ctr}`);return}
  const f=e.target.closest('[data-fill]');if(f)fill(f.dataset.fill)});
$('#vseg').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;const v=b.dataset.v;S.view=v===CH[S.ch].view?'auto':v;known=null;renderView(false);save()});
let armT=null;$('#resetWorld').addEventListener('click',e=>{const b=e.currentTarget;if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to wipe all containers, images and the cluster';clearTimeout(armT);armT=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset world'},4000);return}
  b.classList.remove('armed');b.textContent='Reset world';const f=fresh();S.d=f.d;S.k=f.k;S.files={};S.inside=null;S.flag={};landed=S.ch+'.'+S.mi;const msgs=setupChapter(S.ch);screen.innerHTML='';addLine(esc('(World reset: no containers, no images, a fresh cluster. Your XP and badges are kept.)'),'sys');msgs.forEach(m=>addLine(esc(m),'sys'));known=null;renderAll();save()});
/* tabs */
const TABS=['quest','fire','puz','guide'];
function showTab(t){for(const id of TABS){$('#tab-'+id).hidden=id!==t;$('#t-'+id).setAttribute('aria-selected',String(id===t))}if(t==='quest'){renderView(false);if(matchMedia('(pointer:fine)').matches)setTimeout(()=>cmdIn.focus(),0)}if(t!=='fire')stopFire(false);else if(!QS)fireIdle();if(t==='puz')renderPuz();if(t==='guide')renderGuide()}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});
/* quick-fire */
const fStage=$('#fStage');const LEN=75;let QS=null,qT=null;
function setStats(){$('#fScore').textContent=QS?QS.score:0;$('#fStreak').textContent=QS?QS.streak:0;$('#fBest').textContent=S.best||0;$('#fTime').textContent=QS?Math.ceil(QS.left):LEN;$('#fTimer').style.width=(QS?QS.left/LEN*100:100)+'%'}
function fireIdle(){const open=qfOpen(S.done).length;
  if(!open){fStage.innerHTML=`<div class="example"><div class="label">Locked for now</div><p class="fb">Quick-fire only asks about things the quest has already taught. Finish all of <b>Chapter 1: ${esc(CH[0].name)}</b> first, and the first tasks open up. Each later chapter you finish adds more.</p></div>
  <div class="actions" style="margin-top:12px"><button class="btn" id="fGoQuest">Go to the quest</button></div>`;setStats();return}
  fStage.innerHTML=`<div class="example"><div class="label">Example task</div><div class="task">List the running containers</div><p class="fb">Answer: <code>docker ps</code></p></div>${open<QF.length?'<p class="lede">Tasks from the chapters you have finished are open. Finish more chapters to unlock the rest.</p>':''}
  <div class="actions"><button class="btn" id="fStart">Start the clock</button></div>`;setStats()}
function startFire(){const pool=qfOpen(S.done);if(!pool.length){fireIdle();return}const order=pool.map((q,i)=>i).sort(()=>Math.random()-.5);QS={pool,order,i:0,score:0,streak:0,left:LEN,misses:[],t0:Date.now()};
  fStage.innerHTML=`<div class="task" id="fTask"></div><div class="fterm"><span class="p-sym">$ </span><input id="fIn" aria-label="Your answer" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
  <p class="fb" id="fFb" aria-live="polite"></p><div class="actions"><button class="btn ghost" id="fSkip">Skip</button><button class="btn ghost" id="fStop">End round</button></div>`;
  showQ();$('#fIn').focus();clearInterval(qT);qT=setInterval(()=>{QS.left=Math.max(0,LEN-(Date.now()-QS.t0)/1000);setStats();if(QS.left<=0)stopFire(true)},100)}
function showQ(){if(QS.i>=QS.order.length){QS.order.sort(()=>Math.random()-.5);QS.i=0}$('#fTask').textContent=QS.pool[QS.order[QS.i]][0];setStats()}
function answer(v,skip){const q=QS.pool[QS.order[QS.i]];const good=!skip&&q[1].some(x=>canon(x)===canon(v));const fb=$('#fFb');
  if(good){QS.score+=10+Math.min(QS.streak,5)*2;QS.streak++;fb.className='fb good';fb.textContent=`Correct${QS.streak>1?` · streak ${QS.streak}`:''}`}
  else{QS.streak=0;QS.misses.push([q[0],q[1][0],v]);fb.className='fb bad';fb.innerHTML=`${skip?'Skipped':'Not quite'}. One right answer: <code>${esc(q[1][0])}</code>`}
  QS.i++;showQ();const inp=$('#fIn');inp.value='';inp.focus()}
function stopFire(show){clearInterval(qT);if(!QS){return}const q=QS;QS=null;if(!show){fireIdle();return}
  const best=q.score>(S.best||0);if(best)S.best=q.score;const bonus=Math.min(30,Math.floor(q.score/20));if(bonus){S.xp+=bonus}save();renderXP();
  fStage.innerHTML=`<div class="task">Round over: ${q.score} points${best?' · new best!':''}</div>${bonus?`<p class="fb good">+${bonus} XP for the quest bar</p>`:''}
  ${q.misses.length?`<div><div class="label">Worth another look</div><ul class="misses">${q.misses.slice(0,8).map(([t,a,y])=>`<li><span>${esc(t)}</span><code>${esc(a)}</code>${y?`<small>you typed <code>${esc(y)}</code></small>`:''}</li>`).join('')}</ul></div>`:'<p class="fb good">No misses at all.</p>'}
  <div class="actions"><button class="btn" id="fStart">Play again</button></div>`;setStats()}
fStage.addEventListener('click',e=>{if(e.target.id==='fStart')startFire();else if(e.target.id==='fGoQuest')showTab('quest');else if(e.target.id==='fSkip'&&QS)answer('',true);else if(e.target.id==='fStop')stopFire(true)});
fStage.addEventListener('keydown',e=>{if(e.target.id==='fIn'&&e.key==='Enter'&&QS){e.preventDefault();const v=e.target.value;if(v.trim())answer(v,false)}});
/* puzzles */
let PD={lv:0,placed:[],pool:[],res:null},PY={lv:0,picks:{},res:null,opts:null};
const shuf=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(x=>x[1]);
function loadDf(i){const p=PZ_DF[i];PD={lv:i,placed:[],pool:shuf(p.lines.concat(p.extra||[])),res:null}}
function loadY(i){const p=PZ_Y[i];PY={lv:i,picks:{},res:null,opts:p.blanks.map(b=>shuf(b))}}
loadDf(0);loadY(0);
function award(key){if(S.puz[key])return false;S.puz[key]=1;S.xp+=15;save();renderXP();return true}
function lvChips(kind,arr,cur){return `<div class="lvls" role="tablist">${arr.map((p,i)=>`<button class="lvl${i===cur?' cur':''}${S.puz[kind+i]?' solved':''}" data-${kind}lv="${i}">${S.puz[kind+i]?'✓ ':''}${i+1}. ${esc(p.t)}</button>`).join('')}</div>`}
function renderPuz(){const p=PZ_DF[PD.lv];const okAt=i=>PD.res&&PD.placed[i]===p.lines[i];
  $('#pzDf').innerHTML=`${lvChips('df',PZ_DF,PD.lv)}<p class="explain">${esc(p.intro)}</p>
   <div class="pz-board"><div class="pz-col panel"><div class="vlab"><span>Pieces</span><span>tap to add</span></div><div class="pz-lines">${PD.pool.map((l,i)=>`<button class="pz-line" data-pool="${i}">${esc(l)}</button>`).join('')||'<span class="empty">All pieces placed.</span>'}</div></div>
   <div class="pz-col panel"><div class="vlab"><span>Dockerfile</span><span>tap to remove</span></div><div class="pz-lines">${PD.placed.map((l,i)=>`<button class="pz-line${PD.res?(okAt(i)?' ok':' no'):''}" data-placed="${i}"><span class="ln">${i+1}</span>${esc(l)}</button>`).join('')||'<span class="empty">Your Dockerfile is empty. Start with the base image.</span>'}</div></div></div>
   <div class="actions"><button class="btn" data-pz="dfcheck">Check</button><button class="btn ghost" data-pz="dfreset">Shuffle again</button></div>
   ${PD.res?`<p class="fb ${PD.res==='win'?'good':'bad'}">${PD.res==='win'?'Solved! '+esc(p.why):'Not yet. Green lines are in the right spot. '+(PD.placed.length!==p.lines.length?'Check the number of lines too.':'')}</p>`:''}`;
  const y=PZ_Y[PY.lv];let i=0;const body=esc(y.src).replace(/\{\{(\d)\}\}/g,(m,k)=>{k=+k;const st=PY.res?(PY.picks[k]===y.answer[k]?' ok':' no'):'';return `<select id="pzsel${k}" data-yb="${k}" class="${st}" aria-label="Blank ${k+1}"><option value="">choose…</option>${PY.opts[k].map(o=>`<option${PY.picks[k]===o?' selected':''}>${esc(o)}</option>`).join('')}</select>`});
  $('#pzY').innerHTML=`${lvChips('y',PZ_Y,PY.lv)}<p class="explain">${esc(y.intro)}</p><div class="yamlwrap"><pre class="yaml">${body}</pre></div>
   <div class="actions"><button class="btn" data-pz="ycheck">Check</button></div>${PY.res?`<p class="fb ${PY.res==='win'?'good':'bad'}">${PY.res==='win'?'Solved! '+esc(y.why):'Some blanks are off (red). Think about what each field means.'}</p>`:''}`}
$('#tab-puz').addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;const ds=t.dataset;
  if(ds.dflv!=null){loadDf(+ds.dflv);renderPuz();return}if(ds.ylv!=null){loadY(+ds.ylv);renderPuz();return}
  if(ds.pool!=null){PD.placed.push(PD.pool.splice(+ds.pool,1)[0]);PD.res=null;renderPuz();return}
  if(ds.placed!=null){PD.pool.push(PD.placed.splice(+ds.placed,1)[0]);PD.res=null;renderPuz();return}
  if(ds.pz==='dfreset'){loadDf(PD.lv);renderPuz();return}
  if(ds.pz==='dfcheck'){const p=PZ_DF[PD.lv];const win=PD.placed.length===p.lines.length&&PD.placed.every((l,i)=>l===p.lines[i]);PD.res=win?'win':'lose';if(win&&award('df'+PD.lv))PD.xp=1;renderPuz();return}
  if(ds.pz==='ycheck'){const y=PZ_Y[PY.lv];const win=y.answer.every((a,i)=>PY.picks[i]===a);PY.res=win?'win':'lose';if(win)award('y'+PY.lv);renderPuz()}});
$('#tab-puz').addEventListener('change',e=>{const s=e.target.closest('[data-yb]');if(s){PY.picks[+s.dataset.yb]=s.value;PY.res=null}});
/* guide */
function renderGuide(){const ex=list=>`<div class="ex">${list.map(([c,n])=>`<div class="exrow"><code>${esc(c)}</code><small>${esc(n)}</small><button class="try" data-try="${esc(c)}">Try</button></div>`).join('')}</div>`;
  $('#guide').innerHTML=`<div><h2>Field guide</h2><p class="lede">Everything from the quest in one place. Press Try to drop a command into the playground terminal.</p></div>
  <section class="gsec"><h3>How to read a command</h3><div class="panel bigan">${anatomy([['docker','cmd'],['run','sub'],['-d','opt'],['--name web','opt'],['-p 8080:80','opt'],['nginx:1.27','img']])}
   <div style="height:12px"></div>${anatomy([['kubectl','cmd'],['scale','sub'],['deployment web','arg'],['--replicas=5','opt']])}
   <p class="explain" style="margin-top:12px">The <b>program</b> comes first (docker or kubectl), then the <b>action</b>. <b>Options</b> start with dashes and change how it behaves; some take a value, like <code>--name web</code>. The <b>image</b> or <b>target</b> says what to act on. In <code>docker run</code>, everything after the image name is the command to run inside the container, so options must come before it.</p></div></section>
  <section class="gsec"><h3>Docker words, Kubernetes words</h3><div class="panel tblwrap"><table class="map"><thead><tr><th>Idea</th><th>Docker</th><th>Kubernetes</th></tr></thead><tbody>
   <tr><td>The packaged app</td><td>image</td><td>the same image</td></tr><tr><td>One running copy</td><td>container</td><td>pod (wraps one or more containers)</td></tr>
   <tr><td>Start it</td><td><code>docker run</code></td><td><code>kubectl create deployment</code></td></tr><tr><td>Keep N copies alive</td><td>you, by hand</td><td>Deployment + ReplicaSet</td></tr>
   <tr><td>Reach it from outside</td><td><code>-p 8080:80</code></td><td>Service (+ port-forward or NodePort)</td></tr><tr><td>Find others by name</td><td>user-defined network</td><td>Service name via cluster DNS</td></tr>
   <tr><td>Settings</td><td><code>-e KEY=value</code></td><td>env, ConfigMap</td></tr><tr><td>Keep data</td><td>volume</td><td>PersistentVolume</td></tr><tr><td>Whole app in a file</td><td>compose.yaml</td><td>manifests + <code>kubectl apply</code></td></tr>
   <tr><td>Upgrade</td><td>remove and run the new image</td><td>rolling update, with undo</td></tr></tbody></table></div></section>
  ${CH.map((c,i)=>`<section class="gsec"><h3>${i+1}. ${esc(c.name)}</h3><div class="gcols"><div class="panel gpic">${c.pic}</div><div class="panel card">${ex(GUIDE[i])}</div></div></section>`).join('')}
  <section class="gsec"><h3>Try it on your own computer</h3><div class="os">
   <div class="panel card"><h4>Mac or Windows</h4><p>Install <b>Docker Desktop</b> from docker.com. It includes the docker command, Compose and an optional one-node Kubernetes (turn it on in Settings → Kubernetes).</p></div>
   <div class="panel card"><h4>Linux</h4><p>Install <b>Docker Engine</b> with your distribution's packages or Docker's install script, then add yourself to the docker group so you can run it without sudo.</p></div>
   <div class="panel card"><h4>A cluster like this one</h4><p><b>kind</b> runs Kubernetes nodes as Docker containers, which is what this playground imitates. After installing kind and kubectl:</p>${ex([['kind create cluster --name harbor','three minutes to your own cluster'],['kubectl get nodes','check it']])}</div>
   <div class="panel card"><h4>Clean up</h4>${ex([['docker container prune','remove stopped containers'],['docker system df','what is using disk'],['docker compose down -v','stop a project and its volumes']])}</div></div></section>
  <section class="gsec"><div class="panel card"><h4>Start over</h4><p>Clears XP, badges, puzzles and the world. The quest starts again at chapter 1.</p><div class="actions"><button class="btn ghost" id="wipeAll">Reset all progress</button></div></div></section>`}
$('#guide').addEventListener('click',e=>{const t=e.target.closest('[data-try]');if(t){fill(t.dataset.try);return}
  if(e.target.id==='wipeAll'){const b=e.target;if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to erase everything';return}
    HQ.resetState();landed=null;screen.innerHTML='';setupChapter(0);try{localStorage.removeItem(KEY)}catch(x){}save();known=null;showTab('quest');renderAll();addLine(esc('(Fresh start. Welcome aboard.)'),'sys')}});
/* boot */
function boot(){
  for(const p of K().pods)if(!p.sys&&p.phase!=='Running'&&p.phase!=='Terminating')p.t=0;
  const msgs=setupChapter(S.ch);
  if(!S.hist.length){addLine(esc('Welcome to Harbor Quest. This terminal pretends to be a laptop with Docker installed and a small Kubernetes cluster called harbor.'),'big');
    addLine(esc('Nothing here touches your real computer. Break things freely; "Reset world" puts it all back.'),'sys');addLine(esc('Follow the mission on the left. Type help any time.'),'sys')}
  else addLine(esc('Welcome back. Your containers and cluster are where you left them.'),'sys');
  msgs.forEach(m=>addLine(esc(m),'sys'));
  fireIdle();renderAll();save();setInterval(tick,250);
  if(location.hash&&TABS.includes(location.hash.slice(1)))showTab(location.hash.slice(1));
  window.__hq={run,goChapter,land:renderAll,setups,get S(){return S},skip:HQ.skip,tick,canon,CH,parseYaml};
}
boot();
})(window.HQ = window.HQ || {});
