(function (HQ) { 'use strict';
const S=HQ.S;
const {ref,HUB,hubOk,now,NODES,baseFs,verOf,rnd,startLogs,saveSoon,R,O,E,age,TB,table,hsh,hhex,SHELLS,pullRedir,boxExec,D,parseYaml}=HQ;
/* ---------- Kubernetes engine ---------- */
const K=()=>S.k;
const kindOfImage=img=>{const r=ref(img);const h=HUB[r.name];return h?h.kind:'none'};
const pullable=img=>hubOk(ref(img));
function ev(reason,obj,msg,from,type='Normal'){K().events.push({t:now(),type,reason,obj,msg,from:from||'',ns:obj.ns||'default'});if(K().events.length>80)K().events.splice(0,K().events.length-80)}
function evo(reason,kind,name,ns,msg,from,type){K().events.push({t:now(),type:type||'Normal',reason,obj:kind+'/'+name,ns,msg,from:from||''});if(K().events.length>80)K().events.shift()}
const live=p=>p.phase!=='Terminating';
const appOf=p=>p.labels&&(p.labels.app||p.labels.run)||'';
function pickNode(){const ws=NODES.filter(n=>n.sub);const load=n=>K().pods.filter(p=>p.node===n.name&&live(p)&&!p.sys).length;return ws.slice().sort((a,b)=>load(a)-load(b)||(Math.random()-.5))[0]}
function cmData(ns,name){const c=K().cms[ns+'/'+name];return c?c.data||{}:null}
function resolveEnv(ns,spec){const env={};(spec&&spec.envFrom||[]).forEach(x=>{const r=x&&x.configMapRef;if(r){Object.assign(env,cmData(ns,r.name)||{})}});(spec&&spec.env||[]).forEach(x=>{if(x&&x.name)env[x.name]=String(x.value??'')});return env}
function mkPod(o){const n=pickNode();const ipc=K().ipc;ipc[n.sub]=(ipc[n.sub]||1)+1;
  const p={name:o.name,ns:o.ns||'default',labels:o.labels||{},image:o.image,cname:o.cname||ref(o.image).name.split('/').pop(),owner:o.owner||null,node:n.name,ip:`10.244.${n.sub}.${ipc[n.sub]}`,phase:'Pending',t:now(),born:now(),restarts:0,logs:[],env:resolveEnv(o.ns||'default',o.envspec),isPod:true,fs:null,cwd:'/'};
  K().pods.push(p);evo('Scheduled','pod',p.name,p.ns,`Successfully assigned ${p.ns}/${p.name} to ${p.node}`,'default-scheduler');return p}
function podBox(p){if(!p.fs){const r=ref(p.image);const h=HUB[r.name]||{};p.fs=baseFs({kind:h.kind,os:h.os,fs:{}});p.kind=h.kind;p.shell=h.shell;p.ver=verOf(p.image);p.runtime=h.runtime}if(!p.id)p.id=p.name;return p}
function term(p,why){if(!live(p))return;p.phase='Terminating';p.t=now();evo('Killing','pod',p.name,p.ns,`Stopping container ${p.cname}`,'kubelet');if(why)why()}
function depPods(d){return K().pods.filter(p=>p.owner&&p.owner.dep===d.name&&p.ns===d.ns)}
function spawn(d){const p=mkPod({name:`${d.name}-${d.rs}-${rnd(5)}`,ns:d.ns,labels:Object.assign({},d.labels,{'pod-template-hash':d.rs}),image:d.image,cname:d.cname,owner:{dep:d.name,rs:d.rs},envspec:d.envspec});
  evo('SuccessfulCreate','replicaset',d.name+'-'+d.rs,d.ns,`Created pod: ${p.name}`,'replicaset-controller');return p}
function reconcile(d){const mine=depPods(d).filter(live);const ready=p=>p.phase==='Running';
  const nw=mine.filter(p=>p.owner.rs===d.rs),old=mine.filter(p=>p.owner.rs!==d.rs);
  if(old.length){const nwReady=nw.filter(ready).length;
    if(nwReady>=d.replicas){term(old.find(p=>!ready(p))||old[0]);if(!old.slice(1).length)evo('ScalingReplicaSet','deployment',d.name,d.ns,`Scaled down replica set ${old[0].owner.dep}-${old[0].owner.rs} to 0`,'deployment-controller');return true}
    const avail=nwReady+old.filter(ready).length;
    if(avail>d.replicas){term(old.find(p=>!ready(p))||old[0]);return true}
    const notReadyOld=old.filter(p=>!ready(p));if(notReadyOld.length&&mine.length>d.replicas){term(notReadyOld[0]);return true}
    if(nw.length<d.replicas&&mine.length<d.replicas+1){if(!nw.length)evo('ScalingReplicaSet','deployment',d.name,d.ns,`Scaled up replica set ${d.name}-${d.rs} to 1`,'deployment-controller');spawn(d);return true}
    return false}
  if(nw.length<d.replicas){spawn(d);return true}
  if(nw.length>d.replicas){const v=nw.slice().sort((a,b)=>(ready(a)-ready(b))||(b.born-a.born))[0];term(v);return true}
  return false}
let lastRec=0;
function tick(){let ch=false;const T=now();
  for(const p of K().pods.slice()){if(p.sys)continue;const dt=T-p.t;const kind=kindOfImage(p.image);
    if(p.phase==='Pending'&&dt>450){p.phase='ContainerCreating';p.t=T;evo('Pulling','pod',p.name,p.ns,`Pulling image "${p.image}"`,'kubelet');ch=true}
    else if(p.phase==='ContainerCreating'&&dt>900){p.t=T;ch=true;
      if(pullable(p.image)){p.phase='Running';podBox(p);p.logs=startLogs(kind,p);
        evo('Pulled','pod',p.name,p.ns,`Successfully pulled image "${p.image}"`,'kubelet');evo('Started','pod',p.name,p.ns,`Started container ${p.cname}`,'kubelet')}
      else{p.phase='ErrImagePull';evo('Failed','pod',p.name,p.ns,`Failed to pull image "${p.image}": ${ref(p.image).raw} not found`,'kubelet','Warning')}}
    else if(p.phase==='ErrImagePull'&&dt>1800){p.phase='ImagePullBackOff';p.t=T;evo('BackOff','pod',p.name,p.ns,`Back-off pulling image "${p.image}"`,'kubelet','Normal');ch=true}
    else if(p.phase==='ImagePullBackOff'&&dt>6000){p.phase='ErrImagePull';p.t=T;ch=true}
    else if(p.phase==='Running'&&(kind==='os'||kind==='hello')&&!p.keep&&dt>1300){p.phase='Completed';p.t=T;ch=true}
    else if(p.phase==='Completed'&&dt>900&&!p.never){p.phase='CrashLoopBackOff';p.restarts++;p.t=T;evo('BackOff','pod',p.name,p.ns,'Back-off restarting failed container '+p.cname,'kubelet','Warning');ch=true}
    else if(p.phase==='CrashLoopBackOff'&&dt>5000){p.phase='Running';p.t=T;ch=true}
    else if(p.phase==='Terminating'&&dt>1400){K().pods=K().pods.filter(x=>x!==p);if(S.inside&&S.inside.id===p.name){S.inside=null;HQ.insideLost=true}ch=true}}
  if(T-lastRec>600){lastRec=T;for(const d of Object.values(K().deps))if(reconcile(d))ch=true}
  if(ch){HQ.onTick();saveSoon()}}
HQ.insideLost=false;
function nsArg(f){return f.n||'default'}
/* flags */
function kParse(args){const f={pos:[],raw:args};let i=0;const take=a=>{const v=args[++i];return v};
  for(;i<args.length;i++){const a=args[i];
    if(a==='--'){f.after=args.slice(i+1);break}
    if(a==='-n'||a==='--namespace'){f.n=take()}else if(a.startsWith('--namespace=')){f.n=a.slice(12)}
    else if(a==='-A'||a==='--all-namespaces')f.A=true;
    else if(a==='-o'||a==='--output'){f.o=take()}else if(a.startsWith('-o=')||a.startsWith('--output=')){f.o=a.split('=')[1]}else if(/^-o(wide|yaml|json|name)$/.test(a))f.o=a.slice(2);
    else if(a==='-l'||a==='--selector'){f.l=take()}else if(a.startsWith('--selector=')||a.startsWith('-l=')){f.l=a.split('=').slice(1).join('=')}
    else if(a==='-f'||a==='--filename'){f.f=take()}else if(a.startsWith('--filename=')||a.startsWith('-f=')){f.f=a.split('=')[1]}
    else if(a==='-w'||a==='--watch')f.w=true;
    else if(a==='--show-labels')f.sl=true;
    else if(a==='--all')f.all=true;
    else if(a==='-it'||a==='-ti'||a==='-i'||a==='-t'||a==='--stdin'||a==='--tty')f.it=true;
    else if(a==='--rm')f.rm=true;
    else if(a.startsWith('--')){const j=a.indexOf('=');if(j>0)f[a.slice(2,j)]=a.slice(j+1);else{const nx=args[i+1];if(nx!=null&&!nx.startsWith('-')&&['image','replicas','port','target-port','type','name','from-literal','revision','to-revision','restart','dry-run'].includes(a.slice(2))){f[a.slice(2)]=nx;i++}else f[a.slice(2)]=true}
      if(a.startsWith('--from-literal')){(f.lits=f.lits||[]).push(a.includes('=')?a.slice(a.indexOf('=')+1):f['from-literal'])}}
    else f.pos.push(a)}
  return f}
const RT={po:'pods',pod:'pods',pods:'pods',deploy:'deployments',deployment:'deployments',deployments:'deployments','deployment.apps':'deployments',rs:'replicasets',replicaset:'replicasets',replicasets:'replicasets',
  svc:'services',service:'services',services:'services',no:'nodes',node:'nodes',nodes:'nodes',ns:'namespaces',namespace:'namespaces',namespaces:'namespaces',cm:'configmaps',configmap:'configmaps',configmaps:'configmaps',
  all:'all',ep:'endpoints',endpoints:'endpoints',events:'events',ev:'events',event:'events'};
function splitRes(pos){if(!pos.length)return {};let [t,...rest]=pos;let name=rest[0];if(t.includes('/')){const [a,b]=t.split('/');t=a;name=b;rest=[b,...rest]}return {type:RT[t.toLowerCase()],rawType:t,name,names:rest}}
function labelMatch(labels,sel){if(!sel)return true;return sel.split(',').every(s=>{const [k,v]=s.split('=');return labels&&labels[k]===v})}
const ready=p=>p.phase==='Running';
function podStatus(p){return p.phase}
function podsIn(f){return K().pods.filter(p=>(f.A||p.ns===nsArg(f))&&labelMatch(p.labels,f.l))}
function noRes(f,what){return R([O(f.A?'No resources found':`No resources found in ${nsArg(f)} namespace.`,'')],0)}
function getPods(f,names){let ps=podsIn(f);if(names&&names.length){const miss=names.filter(n=>!ps.some(p=>p.name===n));if(miss.length)return E(`Error from server (NotFound): pods "${miss[0]}" not found`,suggestPod(miss[0],f));ps=ps.filter(p=>names.includes(p.name))}
  if(!ps.length)return noRes(f);
  if(f.o==='yaml'&&ps.length===1)return R(podYaml(ps[0]));if(f.o==='name')return R(ps.map(p=>'pod/'+p.name));
  const hdr=['NAME','READY','STATUS','RESTARTS','AGE'];if(f.A)hdr.unshift('NAMESPACE');if(f.o==='wide')hdr.push('IP','NODE');if(f.sl)hdr.push('LABELS');
  const rows=[hdr].concat(ps.map(p=>{const r=[p.name,ready(p)?'1/1':'0/1',podStatus(p),p.restarts?`${p.restarts} (${age(p.t)} ago)`:'0',age(p.born)];if(f.A)r.unshift(p.ns);if(f.o==='wide')r.push(p.phase==='Pending'?'<none>':p.ip,p.node);if(f.sl)r.push(Object.entries(p.labels).map(([k,v])=>k+'='+v).join(',')||'<none>');return r}));
  const out=TB(rows);if(f.w)out.push(O('(Watch mode keeps the screen updating in a real terminal. The playground shows one snapshot; run the command again, or watch the live view.)','sys'));return {out,code:0}}
function suggestPod(n,f){const all=K().pods.filter(p=>p.ns===nsArg(f));if(!all.length)return '';const near=all.find(p=>p.name.startsWith(n.split('-')[0]));return near?`Tip: pod names have random endings. Try kubectl get pods, or click a pod in the live view. Did you mean ${near.name}?`:'Tip: run kubectl get pods to see the exact names.'}
function depStatus(d){const ps=depPods(d).filter(live);const nw=ps.filter(p=>p.owner.rs===d.rs);return {ready:ps.filter(ready).length,upd:nw.length,avail:ps.filter(ready).length,old:ps.length-nw.length,nwReady:nw.filter(ready).length,total:ps.length}}
function depsIn(f){return Object.values(K().deps).filter(d=>f.A||d.ns===nsArg(f))}
function getDeps(f,names){let ds=depsIn(f);if(names&&names.length){if(!ds.some(d=>d.name===names[0]))return E(`Error from server (NotFound): deployments.apps "${names[0]}" not found`);ds=ds.filter(d=>names.includes(d.name))}
  if(!ds.length)return noRes(f);if(f.o==='yaml'&&ds.length===1)return R(depYaml(ds[0]));
  const hdr=['NAME','READY','UP-TO-DATE','AVAILABLE','AGE'];if(f.A)hdr.unshift('NAMESPACE');if(f.o==='wide')hdr.push('CONTAINERS','IMAGES','SELECTOR');
  return {out:TB([hdr].concat(ds.map(d=>{const s=depStatus(d);const r=[d.name,`${s.ready}/${d.replicas}`,s.upd,s.avail,age(d.born)];if(f.A)r.unshift(d.ns);if(f.o==='wide')r.push(d.cname,d.image,'app='+d.labels.app);return r}))),code:0}}
function rsList(f){const rows=[];depsIn(f).forEach(d=>{d.revs.forEach(rv=>{const ps=depPods(d).filter(p=>live(p)&&p.owner.rs===rv.rs);const hasOld=depPods(d).some(p=>live(p)&&p.owner.rs!==d.rs);const des=rv.rs===d.rs&&!hasOld?d.replicas:ps.length;rows.push({d,rv,name:d.name+'-'+rv.rs,des,cur:ps.length,ready:ps.filter(ready).length,born:rv.born})})});return rows}
function getRs(f){const rows=rsList(f);if(!rows.length)return noRes(f);const hdr=['NAME','DESIRED','CURRENT','READY','AGE'];if(f.A)hdr.unshift('NAMESPACE');if(f.o==='wide')hdr.push('IMAGES');
  return {out:TB([hdr].concat(rows.map(x=>{const r=[x.name,x.des,x.cur,x.ready,age(x.born)];if(f.A)r.unshift(x.d.ns);if(f.o==='wide')r.push(x.rv.image);return r}))),code:0}}
function svcPorts(s){return s.type==='NodePort'||s.type==='LoadBalancer'?`${s.port}:${s.nodePort}/TCP`:`${s.port}/TCP`}
function svcsIn(f){return Object.values(K().svcs).filter(s=>f.A||s.ns===nsArg(f))}
function getSvcs(f,names){let ss=svcsIn(f);if(names&&names.length){if(!ss.some(s=>s.name===names[0]))return E(`Error from server (NotFound): services "${names[0]}" not found`);ss=ss.filter(s=>names.includes(s.name))}
  if(!ss.length)return noRes(f);if(f.o==='yaml'&&ss.length===1)return R(svcYaml(ss[0]));
  const hdr=['NAME','TYPE','CLUSTER-IP','EXTERNAL-IP','PORT(S)','AGE'];if(f.A)hdr.unshift('NAMESPACE');if(f.o==='wide')hdr.push('SELECTOR');
  return {out:TB([hdr].concat(ss.map(s=>{const r=[s.name,s.type,s.ip,s.type==='LoadBalancer'?'<pending>':'<none>',svcPorts(s),age(s.born)];if(f.A)r.unshift(s.ns);if(f.o==='wide')r.push(s.selector?Object.entries(s.selector).map(([k,v])=>k+'='+v).join(','):'<none>');return r}))),code:0}}
function endpoints(s){if(!s.selector)return [{ip:'172.18.0.2',port:6443}];return K().pods.filter(p=>p.ns===s.ns&&ready(p)&&labelMatch(p.labels,Object.entries(s.selector).map(([k,v])=>k+'='+v).join(','))).map(p=>({ip:p.ip,port:s.tport||s.port,pod:p}))}
function getEp(f){const ss=svcsIn(f);if(!ss.length)return noRes(f);return {out:TB([['NAME','ENDPOINTS','AGE']].concat(ss.map(s=>{const e=endpoints(s);return [s.name,e.length?e.slice(0,3).map(x=>x.ip+':'+x.port).join(',')+(e.length>3?` + ${e.length-3} more...`:''):'<none>',age(s.born)]}))),code:0}}
function getNodes(f){const hdr=['NAME','STATUS','ROLES','AGE','VERSION'];if(f.o==='wide')hdr.push('INTERNAL-IP','OS-IMAGE','CONTAINER-RUNTIME');
  return {out:TB([hdr].concat(NODES.map(n=>{const r=[n.name,'Ready',n.role,age(K().pods[0]?K().pods[0].born:now()),'v1.31.0'];if(f.o==='wide')r.push(n.ip,'Debian GNU/Linux 12 (bookworm)','containerd://1.7.18');return r}))),code:0}}
function getNs(){return {out:TB([['NAME','STATUS','AGE']].concat(Object.entries(K().nss).sort().map(([n,t])=>[n,'Active',age(t)]))),code:0}}
function getCms(f,names){const list=[];Object.entries(K().nss).forEach(([ns])=>{if(f.A||ns===nsArg(f))list.push({name:'kube-root-ca.crt',ns,data:{'ca.crt':'…'},born:K().nss[ns]})});Object.values(K().cms).forEach(c=>{if(f.A||c.ns===nsArg(f))list.push(c)});
  let ls=list;if(names&&names.length){ls=list.filter(c=>names.includes(c.name));if(!ls.length)return E(`Error from server (NotFound): configmaps "${names[0]}" not found`)}
  if(f.o==='yaml'&&ls.length===1){const c=ls[0];return R(['apiVersion: v1','kind: ConfigMap','metadata:',`  name: ${c.name}`,`  namespace: ${c.ns}`,'data:',...Object.entries(c.data||{}).map(([k,v])=>`  ${k}: ${JSON.stringify(v)}`)])}
  const hdr=['NAME','DATA','AGE'];if(f.A)hdr.unshift('NAMESPACE');return {out:TB([hdr].concat(ls.map(c=>{const r=[c.name,Object.keys(c.data||{}).length,age(c.born)];if(f.A)r.unshift(c.ns);return r}))),code:0}}
function getEvents(f){const es=K().events.filter(e=>f.A||e.ns===nsArg(f)).slice(-25);if(!es.length)return noRes(f);return {out:TB([['LAST SEEN','TYPE','REASON','OBJECT','MESSAGE']].concat(es.map(e=>[age(e.t),e.type,e.reason,e.obj,e.msg]))),code:0}}
function getAll(f){const out=[];const add=r=>{if(r&&r.out&&!(r.out.length===1&&/^No resources/.test(r.out[0].t))){if(out.length)out.push(O(''));out.push(...r.out)}};
  const pre=(r,p)=>{if(!r||!r.out)return r;r.out=r.out.map((o,i)=>i===0?o:O((f.A?o.t.replace(/^(\S+\s+)/,'$1'+p):p+o.t),o.c));return r};
  const fixHdr=r=>r;
  add(pre(getPods(Object.assign({},f,{sl:false})),'pod/'));add(pre(getSvcs(f),'service/'));add(pre(getDeps(f),'deployment.apps/'));add(pre(getRs(f),'replicaset.apps/'));
  if(!out.length)return noRes(f);return {out:realign(out),code:0}}
function realign(out){/* re-pad table blocks after prefixes were added */const blocks=[];let cur=[];out.forEach(o=>{if(o.t===''){blocks.push(cur);cur=[]}else cur.push(o)});blocks.push(cur);
  const res=[];blocks.forEach((b,bi)=>{if(bi)res.push(O(''));const rows=b.map(o=>o.t.split(/\s{2,}/));table(rows).forEach((l,i)=>res.push(O(l,i===0?'hd':'tbl')))});return res}
function kGet(f){const {type,names}=splitRes(f.pos);if(!f.pos.length)return E('You must specify the type of resource to get. Use "kubectl api-resources" for a complete list of supported resources.','Tip: try kubectl get pods, kubectl get nodes or kubectl get all');
  if(!type)return E(`error: the server doesn't have a resource type "${f.pos[0]}"`,'Tip: common types are pods, deployments, services, nodes, namespaces, configmaps.');
  if(f.n&&!K().nss[f.n]&&type!=='nodes'&&type!=='namespaces')return R([O(`No resources found in ${f.n} namespace.`)]);
  switch(type){case 'pods':return getPods(f,names);case 'deployments':return getDeps(f,names);case 'replicasets':return getRs(f);case 'services':return getSvcs(f,names);case 'nodes':return getNodes(f);
    case 'namespaces':return getNs(f);case 'configmaps':return getCms(f,names);case 'endpoints':return getEp(f);case 'events':return getEvents(f);case 'all':return getAll(f)}}
/* yaml views */
function depYaml(d){return ['apiVersion: apps/v1','kind: Deployment','metadata:',`  name: ${d.name}`,`  namespace: ${d.ns}`,'  labels:',`    app: ${d.labels.app}`,'spec:',`  replicas: ${d.replicas}`,'  selector:','    matchLabels:',`      app: ${d.labels.app}`,'  template:','    metadata:','      labels:',`        app: ${d.labels.app}`,'    spec:','      containers:',`      - name: ${d.cname}`,`        image: ${d.image}`,'status:',`  readyReplicas: ${depStatus(d).ready}`,`  replicas: ${depStatus(d).total}`]}
function svcYaml(s){return ['apiVersion: v1','kind: Service','metadata:',`  name: ${s.name}`,`  namespace: ${s.ns}`,'spec:',`  type: ${s.type}`,`  clusterIP: ${s.ip}`,'  selector:',...Object.entries(s.selector||{}).map(([k,v])=>`    ${k}: ${v}`),'  ports:',`  - port: ${s.port}`,`    targetPort: ${s.tport}`,...(s.nodePort?[`    nodePort: ${s.nodePort}`]:[])]}
function podYaml(p){return ['apiVersion: v1','kind: Pod','metadata:',`  name: ${p.name}`,`  namespace: ${p.ns}`,'  labels:',...Object.entries(p.labels).map(([k,v])=>`    ${k}: ${v}`),...(p.owner?['  ownerReferences:','  - kind: ReplicaSet',`    name: ${p.owner.dep}-${p.owner.rs}`]:[]),'spec:','  containers:',`  - name: ${p.cname}`,`    image: ${p.image}`,`  nodeName: ${p.node}`,'status:',`  phase: ${['Running','Completed','CrashLoopBackOff'].includes(p.phase)?'Running':'Pending'}`,`  podIP: ${p.ip}`]}
/* describe */
function evTable(kind,name,ns){const es=K().events.filter(e=>e.obj===kind+'/'+name&&e.ns===ns);if(!es.length)return ['Events:                   <none>'];
  return ['Events:',...table([['Type','Reason','Age','From','Message'],['----','------','----','----','-------']].concat(es.map(e=>[e.type,e.reason,age(e.t),e.from,e.msg]))).map(l=>'  '+l)]}
function dt(t){const d=new Date(t);return d.toUTCString().replace('GMT','+0000')}
function kDescribe(f){const {type,name}=splitRes(f.pos);const ns=nsArg(f);if(!type)return E(f.pos.length?`error: the server doesn't have a resource type "${f.pos[0]}"`:'error: You must specify the type of resource to describe.','Tip: kubectl describe pod NAME');
  if(type==='pods'){const ps=K().pods.filter(p=>p.ns===ns&&(!name||p.name===name||p.name.startsWith(name)));if(!ps.length)return E(`Error from server (NotFound): pods "${name}" not found`,suggestPod(name||'',f));const p=ps[0];
    const st=p.phase==='Running'?['    State:          Running',`      Started:      ${dt(p.t)}`,'    Ready:          True']:p.phase==='Terminating'?['    State:          Terminated','    Ready:          False']:['    State:          Waiting',`      Reason:       ${p.phase==='Pending'?'ContainerCreating':p.phase}`,'    Ready:          False'];
    return R([`Name:             ${p.name}`,`Namespace:        ${p.ns}`,`Node:             ${p.node}/${(NODES.find(n=>n.name===p.node)||{}).ip}`,`Start Time:       ${dt(p.born)}`,`Labels:           ${Object.entries(p.labels).map(([k,v])=>k+'='+v).join('\n                  ')||'<none>'}`,
      `Status:           ${p.phase==='Running'?'Running':p.phase==='Terminating'?'Terminating':'Pending'}`,`IP:               ${p.ip}`,`Controlled By:    ${p.owner?'ReplicaSet/'+p.owner.dep+'-'+p.owner.rs:'<none>'}`,'Containers:',`  ${p.cname}:`,`    Image:          ${p.image}`,...st,`    Restart Count:  ${p.restarts}`,
      `    Environment:    ${Object.keys(p.env||{}).length?'':'<none>'}`,...Object.entries(p.env||{}).map(([k,v])=>`      ${k}:  ${v}`),...evTable('pod',p.name,p.ns)].map(x=>typeof x==='string'?x:x))}
  if(type==='deployments'){const d=K().deps[ns+'/'+name];if(!d)return E(`Error from server (NotFound): deployments.apps "${name||''}" not found`);const s=depStatus(d);const olds=rsList({n:ns}).filter(x=>x.d===d&&x.rv.rs!==d.rs&&x.cur>0);
    return R([`Name:                   ${d.name}`,`Namespace:              ${d.ns}`,`CreationTimestamp:      ${dt(d.born)}`,`Labels:                 app=${d.labels.app}`,`Selector:               app=${d.labels.app}`,`Replicas:               ${d.replicas} desired | ${s.upd} updated | ${s.total} total | ${s.avail} available | ${Math.max(0,s.total-s.avail)} unavailable`,
      'StrategyType:           RollingUpdate','RollingUpdateStrategy:  25% max unavailable, 25% max surge','Pod Template:',`  Labels:  app=${d.labels.app}`,'  Containers:',`   ${d.cname}:`,`    Image:        ${d.image}`,
      `OldReplicaSets:  ${olds.length?olds.map(x=>`${x.name} (${x.cur}/${x.cur} replicas created)`).join(', '):'<none>'}`,`NewReplicaSet:   ${d.name}-${d.rs} (${s.upd}/${d.replicas} replicas created)`,...evTable('deployment',d.name,d.ns)])}
  if(type==='services'){const s=K().svcs[ns+'/'+name];if(!s)return E(`Error from server (NotFound): services "${name||''}" not found`);const e=endpoints(s);
    return R([`Name:                     ${s.name}`,`Namespace:                ${s.ns}`,`Selector:                 ${s.selector?Object.entries(s.selector).map(([k,v])=>k+'='+v).join(','):'<none>'}`,`Type:                     ${s.type}`,`IP:                       ${s.ip}`,`Port:                     <unset>  ${s.port}/TCP`,`TargetPort:               ${s.tport}/TCP`,
      ...(s.nodePort?[`NodePort:                 <unset>  ${s.nodePort}/TCP`]:[]),`Endpoints:                ${e.length?e.map(x=>x.ip+':'+x.port).join(','):'<none>'}`,'Session Affinity:         None','Events:                   <none>'])}
  if(type==='nodes'){const n=NODES.find(x=>x.name===name)||NODES[1];const ps=K().pods.filter(p=>p.node===n.name&&live(p));
    return R([`Name:               ${n.name}`,`Roles:              ${n.role}`,'Conditions:','  Ready   True   KubeletReady   kubelet is posting ready status',`Addresses:`,`  InternalIP:  ${n.ip}`,'Capacity:','  cpu:     4','  memory:  8025096Ki','  pods:    110',`Non-terminated Pods:  (${ps.length} in total)`,...table([['  Namespace','Name','Age']].concat(ps.map(p=>['  '+p.ns,p.name,age(p.born)])))])}
  if(type==='configmaps'){const c=K().cms[ns+'/'+name];if(!c)return E(`Error from server (NotFound): configmaps "${name||''}" not found`);return R([`Name:         ${c.name}`,`Namespace:    ${c.ns}`,'','Data','====',...Object.entries(c.data||{}).flatMap(([k,v])=>[k+':','----',String(v),''])])}
  if(type==='namespaces'){if(!K().nss[name])return E(`Error from server (NotFound): namespaces "${name}" not found`);return R([`Name:         ${name}`,'Status:       Active'])}
  return E('error: describe is not supported for that type in the playground')}
/* create / run / delete */
const svcIp=()=>`10.96.${50+Math.floor(Math.random()*200)}.${2+Math.floor(Math.random()*250)}`;
function newDep(o){const d={name:o.name,ns:o.ns,replicas:o.replicas,labels:{app:o.app||o.name},cname:o.cname,image:o.image,envspec:o.envspec||{},rs:'',rev:0,revs:[],born:now()};setTemplate(d,{image:o.image,envspec:d.envspec},true);K().deps[o.ns+'/'+o.name]=d;
  evo('ScalingReplicaSet','deployment',d.name,d.ns,`Scaled up replica set ${d.name}-${d.rs} to ${d.replicas}`,'deployment-controller');lastRec=0;return d}
function setTemplate(d,t,first){const nr=hsh(d.name+'|'+t.image+'|'+JSON.stringify(t.envspec||{})+'|'+(t.restartAt||''),10);if(nr===d.rs&&!first)return false;
  const prev=d.revs.find(x=>x.rs===nr);d.revs=d.revs.filter(x=>x.rs!==nr);d.rev++;d.revs.push({rev:d.rev,image:t.image,rs:nr,envspec:t.envspec||{},born:prev?prev.born:now(),restartAt:t.restartAt||''});d.image=t.image;d.envspec=t.envspec||{};d.rs=nr;d.restartAt=t.restartAt||'';
  if(!first)evo('ScalingReplicaSet','deployment',d.name,d.ns,`Rolling out new replica set ${d.name}-${nr} with image ${t.image}`,'deployment-controller');lastRec=0;return true}
function nsMissing(ns){return !K().nss[ns]?E(`Error from server (NotFound): namespaces "${ns}" not found`,`Tip: create it first with kubectl create namespace ${ns}`):null}
function kCreate(f){const [what,name]=f.pos;const ns=nsArg(f);
  if(f.f)return kApply(f,'create');
  if(what==='deployment'||what==='deploy'){if(!name)return E('error: exactly one NAME is required, got 0','Tip: kubectl create deployment web --image=nginx');if(!f.image)return E('error: required flag(s) "image" not set','Tip: say which image to run, for example --image=nginx');
    const m=nsMissing(ns);if(m)return m;if(K().deps[ns+'/'+name])return E(`error: failed to create deployment: deployments.apps "${name}" already exists`,`Tip: change it with kubectl scale or kubectl set image, or delete it first with kubectl delete deployment ${name}`);
    const reps=f.replicas!=null?+f.replicas:1;if(!(reps>=0))return E('error: invalid argument for --replicas');newDep({name,ns,replicas:reps,image:f.image,cname:ref(f.image).name.split('/').pop()});return R(`deployment.apps/${name} created`)}
  if(what==='namespace'||what==='ns'){if(!name)return E('error: exactly one NAME is required, got 0');if(K().nss[name])return E(`Error from server (AlreadyExists): namespaces "${name}" already exists`);K().nss[name]=now();return R(`namespace/${name} created`)}
  if(what==='configmap'||what==='cm'){if(!name)return E('error: exactly one NAME is required, got 0');const m=nsMissing(ns);if(m)return m;if(K().cms[ns+'/'+name])return E(`error: failed to create configmap: configmaps "${name}" already exists`);
    const data={};(f.lits||[]).forEach(l=>{const i=l.indexOf('=');if(i>0)data[l.slice(0,i)]=l.slice(i+1)});K().cms[ns+'/'+name]={name,ns,data,born:now()};return R(`configmap/${name} created`)}
  return E(`error: unknown command "${what||''}" for "kubectl create"`,'Tip: kubectl create deployment | namespace | configmap')}
function kRun(f){const name=f.pos[0];const ns=nsArg(f);if(!name)return E('error: NAME is required for run','Tip: kubectl run hello --image=nginx');if(!f.image)return E('error: required flag(s) "image" not set','Tip: kubectl run hello --image=nginx');
  const m=nsMissing(ns);if(m)return m;if(K().pods.some(p=>p.ns===ns&&p.name===name&&live(p)))return E(`Error from server (AlreadyExists): pods "${name}" already exists`);
  const p=mkPod({name,ns,labels:{run:name},image:f.image});if(f.restart==='Never')p.never=true;if(f.after&&f.after[0]==='sleep')p.keep=true;return R(`pod/${name} created`)}
function kDelete(f){if(f.f)return kApply(f,'delete');const {type,names}=splitRes(f.pos);const ns=nsArg(f);if(!type)return E(f.pos.length?`error: the server doesn't have a resource type "${f.pos[0]}"`:'error: You must provide one or more resources by argument or filename.','Tip: kubectl delete pod NAME');
  const out=[];let code=0;
  if(type==='pods'){let targets=f.all?K().pods.filter(p=>p.ns===ns&&!p.sys&&live(p)):f.l?K().pods.filter(p=>p.ns===ns&&labelMatch(p.labels,f.l)&&live(p)):names.map(n=>K().pods.find(p=>p.ns===ns&&p.name===n&&live(p))||n);
    if(!targets.length)return R(`No resources found`);
    for(const t of targets){if(typeof t==='string'){out.push(...E(`Error from server (NotFound): pods "${t}" not found`,suggestPod(t,f)).out);code=1;continue}
      if(t.sys)S.flag.sysDel=1;term(t);S.flag.lastDeleted={name:t.name,dep:t.owner&&t.owner.dep,t:now()};out.push(O(`pod "${t.name}" deleted`))}
    return {out,code}}
  if(type==='deployments'){for(const n of (f.all?depsIn(f).map(d=>d.name):names)){const d=K().deps[ns+'/'+n];if(!d){out.push(...E(`Error from server (NotFound): deployments.apps "${n}" not found`).out);code=1;continue}
      delete K().deps[ns+'/'+n];depPods(d).forEach(p=>term(p));out.push(O(`deployment.apps "${n}" deleted`))}return {out,code}}
  if(type==='services'){for(const n of names){const s=K().svcs[ns+'/'+n];if(!s){out.push(...E(`Error from server (NotFound): services "${n}" not found`).out);code=1;continue}delete K().svcs[ns+'/'+n];Object.keys(K().fwd).forEach(p=>{if(K().fwd[p].name===n)delete K().fwd[p]});out.push(O(`service "${n}" deleted`))}return {out,code}}
  if(type==='configmaps'){for(const n of names){if(!K().cms[ns+'/'+n]){out.push(...E(`Error from server (NotFound): configmaps "${n}" not found`).out);code=1;continue}delete K().cms[ns+'/'+n];out.push(O(`configmap "${n}" deleted`))}return {out,code}}
  if(type==='namespaces'){for(const n of names){if(!K().nss[n]){out.push(...E(`Error from server (NotFound): namespaces "${n}" not found`).out);code=1;continue}if(['default','kube-system','kube-public','kube-node-lease'].includes(n)){out.push(...E(`Error from server (Forbidden): namespaces "${n}" is forbidden: this namespace may not be deleted`).out);code=1;continue}
      delete K().nss[n];Object.keys(K().deps).filter(k=>k.startsWith(n+'/')).forEach(k=>delete K().deps[k]);Object.keys(K().svcs).filter(k=>k.startsWith(n+'/')).forEach(k=>delete K().svcs[k]);Object.keys(K().cms).filter(k=>k.startsWith(n+'/')).forEach(k=>delete K().cms[k]);K().pods.filter(p=>p.ns===n).forEach(p=>term(p));out.push(O(`namespace "${n}" deleted`))}return {out,code}}
  return E('error: the playground cannot delete that type')}
function kScale(f){const {type,name}=splitRes(f.pos);const ns=nsArg(f);if(type!=='deployments'||!name)return E('error: resource(s) were provided, but no name was specified','Tip: kubectl scale deployment web --replicas=5');
  if(f.replicas==null||f.replicas===true)return E('error: required flag(s) "replicas" not set','Tip: add --replicas=N');const d=K().deps[ns+'/'+name];if(!d)return E(`Error from server (NotFound): deployments.apps "${name}" not found`);
  const n=+f.replicas;if(!(n>=0))return E('error: invalid argument for --replicas');const was=d.replicas;d.replicas=n;if(n!==was)evo('ScalingReplicaSet','deployment',d.name,d.ns,`Scaled ${n>was?'up':'down'} replica set ${d.name}-${d.rs} from ${was} to ${n}`,'deployment-controller');lastRec=0;return R(`deployment.apps/${name} scaled`)}
function kExpose(f){const {type,name}=splitRes(f.pos);const ns=nsArg(f);if(!type||!name)return E('error: You must provide one or more resources by argument or filename.','Tip: kubectl expose deployment web --port=80 --type=NodePort');
  let sel;if(type==='deployments'){const d=K().deps[ns+'/'+name];if(!d)return E(`Error from server (NotFound): deployments.apps "${name}" not found`);sel={app:d.labels.app}}
  else if(type==='pods'){const p=K().pods.find(p=>p.ns===ns&&p.name===name);if(!p)return E(`Error from server (NotFound): pods "${name}" not found`);sel=Object.assign({},p.labels);delete sel['pod-template-hash']}else return E('error: cannot expose that type in the playground');
  if(f.port==null||f.port===true)return E("error: couldn't find port via --port flag or introspection",'Tip: add --port=80 to say which port the service listens on');
  const sname=f.name&&f.name!==true?f.name:name;if(K().svcs[ns+'/'+sname])return E(`Error from server (AlreadyExists): services "${sname}" already exists`);const type2=f.type&&f.type!==true?f.type:'ClusterIP';
  if(!['ClusterIP','NodePort','LoadBalancer'].includes(type2))return E(`error: Unsupported service type: "${type2}". Use ClusterIP, NodePort or LoadBalancer`);
  const s={name:sname,ns,type:type2,ip:svcIp(),port:+f.port,tport:+(f['target-port']&&f['target-port']!==true?f['target-port']:f.port),selector:sel,born:now()};if(type2!=='ClusterIP')s.nodePort=30000+(parseInt(hhex(sname+ns,4),16)%2768);
  K().svcs[ns+'/'+sname]=s;return R(`service/${sname} exposed`)}
function kSetImage(f){if(f.pos[0]!=='image')return E('error: unknown command "'+(f.pos[0]||'')+'" for "kubectl set"','Tip: kubectl set image deployment/web nginx=nginx:1.27');
  const rest=f.pos.slice(1);const {type,name}=splitRes(rest.filter(x=>!x.includes('=')||x.includes('/')).filter(x=>!/=/.test(x)));const pairs=rest.filter(x=>x.includes('=')&&!x.startsWith('-'));const ns=nsArg(f);
  if(type!=='deployments'||!name)return E('error: the playground supports kubectl set image deployment/NAME CONTAINER=IMAGE');const d=K().deps[ns+'/'+name];if(!d)return E(`Error from server (NotFound): deployments.apps "${name}" not found`);
  if(!pairs.length)return E('error: at least one image update is required','Tip: CONTAINER=IMAGE, for example nginx=nginx:1.27');
  for(const pr of pairs){const [cn,img]=pr.split('=');if(cn!==d.cname&&cn!=='*')return E(`error: unable to find container named "${cn}"`,`Tip: the container inside deployment ${name} is called "${d.cname}". Run kubectl describe deployment ${name} to see it.`);
    if(setTemplate(d,{image:img,envspec:d.envspec}))return R(`deployment.apps/${name} image updated`)}return R([])}
function kRollout(f){const [sub,...rest]=f.pos;const {type,name}=splitRes(rest);const ns=nsArg(f);
  if(!['status','history','undo','restart'].includes(sub))return E(`error: unknown command "${sub||''}" for "kubectl rollout"`,'Tip: kubectl rollout status | history | undo | restart deployment/NAME');
  if(type!=='deployments'||!name)return E('error: required resource not specified','Tip: kubectl rollout '+sub+' deployment/web');const d=K().deps[ns+'/'+name];if(!d)return E(`Error from server (NotFound): deployments.apps "${name}" not found`);
  const s=depStatus(d);
  if(sub==='status'){const nw=depPods(d).filter(p=>live(p)&&p.owner.rs===d.rs);const bad=nw.find(p=>/ErrImagePull|ImagePullBackOff/.test(p.phase));
    if(s.nwReady>=d.replicas&&!s.old)return R(`deployment "${name}" successfully rolled out`);
    const line=s.upd<d.replicas?`Waiting for deployment "${name}" rollout to finish: ${s.upd} out of ${d.replicas} new replicas have been updated...`:s.old?`Waiting for deployment "${name}" rollout to finish: ${s.old} old replicas are pending termination...`:`Waiting for deployment "${name}" rollout to finish: ${s.nwReady} of ${d.replicas} updated replicas are available...`;
    return R([line,O(bad?`(Stuck: ${bad.name} is in ${bad.phase}. The old pods keep serving, so nothing is down. Try kubectl describe pod ${bad.name}.)`:'(kubectl keeps watching here until it finishes. Run it again in a moment, or watch the live view.)','sys')])}
  if(sub==='history'){if(f.revision){const rv=d.revs.find(x=>x.rev===+f.revision);if(!rv)return E(`error: unable to find the specified revision`);return R([`deployment.apps/${name} with revision #${rv.rev}`,'Pod Template:',`  Labels:       app=${d.labels.app}`,`                pod-template-hash=${rv.rs}`,'  Containers:',`   ${d.cname}:`,`    Image:      ${rv.image}`])}
    return R([`deployment.apps/${name}`,...table([['REVISION','CHANGE-CAUSE']].concat(d.revs.slice().sort((a,b)=>a.rev-b.rev).map(r=>[r.rev,'<none>']))),O('(Tip: add --revision=N to see which image a revision used.)','sys')])}
  if(sub==='undo'){const sorted=d.revs.slice().sort((a,b)=>b.rev-a.rev);const target=f['to-revision']?d.revs.find(x=>x.rev===+f['to-revision']):sorted[1];if(!target)return E(`error: no rollout history found for deployment "${name}"`);
    setTemplate(d,{image:target.image,envspec:target.envspec,restartAt:target.restartAt});return R(`deployment.apps/${name} rolled back`)}
  if(sub==='restart'){setTemplate(d,{image:d.image,envspec:d.envspec,restartAt:String(now())});return R(`deployment.apps/${name} restarted`)}}
function kLogs(f){let {type,name}=splitRes(f.pos.length===1?['pod',f.pos[0]]:f.pos);if(f.pos.length===1&&f.pos[0].includes('/'))({type,name}=splitRes(f.pos));const ns=nsArg(f);let p;const pre=[];
  if(type==='deployments'){const d=K().deps[ns+'/'+name];if(!d)return E(`error: error from server (NotFound): deployments.apps "${name}" not found`);const ps=depPods(d).filter(live);p=ps.find(ready)||ps[0];if(p)pre.push(O(`Found ${ps.length} pods, using pod/${p.name}`))}
  else p=K().pods.find(x=>x.ns===ns&&x.name===name);
  if(!name)return E('error: expected POD or TYPE/NAME is a required argument for the logs command','Tip: kubectl logs POD_NAME');
  if(!p)return E(`Error from server (NotFound): pods "${name}" not found`,suggestPod(name,f));
  if(/ErrImagePull|ImagePullBackOff/.test(p.phase))return E(`Error from server (BadRequest): container "${p.cname}" in pod "${p.name}" is waiting to start: trying and failing to pull image`);
  if(p.phase==='Pending'||p.phase==='ContainerCreating')return E(`Error from server (BadRequest): container "${p.cname}" in pod "${p.name}" is waiting to start: ContainerCreating`);
  return R(pre.concat((p.logs||[]).slice(-30).map(l=>O(l))))}
function kExec(f){const name=f.pos[0];const ns=nsArg(f);if(!name)return E('error: pod or type/name must be specified','Tip: kubectl exec POD -- env');if(!f.after||!f.after.length)return E('error: you must specify at least one command for the container','Tip: put the command after a double dash: kubectl exec '+name+' -- env');
  const p=K().pods.find(x=>x.ns===ns&&x.name===name);if(!p)return E(`Error from server (NotFound): pods "${name}" not found`,suggestPod(name,f));
  if(p.phase!=='Running')return E(`error: unable to upgrade connection: container not found ("${p.cname}")`,'Tip: the pod is not Running yet. Check kubectl get pods.');podBox(p);
  if(SHELLS.includes(f.after[0])&&f.after.length===1){if(!f.it)return R([]);S.inside={id:p.name,ns:p.ns,main:false,type:'p'};p.cwd='/';return R([O(`(You are now inside pod ${p.name}. Type exit to come back.)`,'sys')])}
  const r=pullRedir(f.after);return boxExec(p,r.argv,r.r)}
function kPortForward(f){const [tgt,spec]=f.pos;const ns=nsArg(f);if(!tgt||!spec)return E('error: TYPE/NAME and list of ports are required for port-forward','Tip: kubectl port-forward svc/web 9090:80');
  const {type,name}=splitRes([tgt]);const [lp,rp]=spec.includes(':')?spec.split(':').map(Number):[+spec,+spec];if(!lp||!rp)return E(`error: invalid port "${spec}"`);
  let target;if(type==='services'){const s=K().svcs[ns+'/'+name];if(!s)return E(`Error from server (NotFound): services "${name}" not found`);if(!endpoints(s).length)return E('error: unable to forward port because pod is not running. Current status=Pending');target={kind:'svc',name,ns,port:rp}}
  else if(type==='pods'){const p=K().pods.find(x=>x.ns===ns&&x.name===name);if(!p)return E(`Error from server (NotFound): pods "${name}" not found`);target={kind:'pod',name,ns,port:rp}}
  else if(type==='deployments'){const d=K().deps[ns+'/'+name];if(!d)return E(`Error from server (NotFound): deployments.apps "${name}" not found`);target={kind:'dep',name,ns,port:rp}}else return E('error: use svc/NAME, pod/NAME or deployment/NAME');
  if(D().containers.some(c=>c.status==='running'&&c.ports.some(x=>x[0]===lp)))return E(`Unable to listen on port ${lp}: Listeners failed to create with the following errors: [unable to create listener: Error listen tcp4 127.0.0.1:${lp}: bind: address already in use]`,'Tip: a Docker container already uses that port. Pick another local port, like 9090.');
  K().fwd[lp]=target;const tp=type==='services'?(K().svcs[ns+'/'+name].tport):rp;
  return R([`Forwarding from 127.0.0.1:${lp} -> ${tp}`,`Forwarding from [::1]:${lp} -> ${tp}`,O(`(In a real terminal this command keeps running until you press Ctrl+C, so you'd open a second terminal for curl. Here it runs in the background. Try curl localhost:${lp})`,'sys')])}
function k8sResolve(box,h,port){const ns=box.ns;const parts=h.split('.');const sname=parts[0],sns=parts[1]&&parts[1]!=='svc'?parts[1]:ns;
  if(h==='localhost'||h==='127.0.0.1')return {box,port};const s=K().svcs[sns+'/'+sname];if(s){const e=endpoints(s);if(!e.length)return {box,svcErr:`curl: (7) Failed to connect to ${h} port ${port||s.port}: Connection refused`};const pick=e[Math.random()*e.length|0];return {box:podBox(pick.pod),port:s.tport,via:`↳ answered by pod ${pick.pod.name}`}}
  const p=K().pods.find(x=>x.ip===h&&ready(x));if(p)return {box:podBox(p),port};return null}
let lastPick='';
function viaFwd(fw){const ns=fw.ns;let pods=[];
  if(fw.kind==='svc'){const s=K().svcs[ns+'/'+fw.name];if(!s)return {err:'Handling connection for '+fw.port+'\nE1018 portforward.go: error forwarding: service is gone'};pods=endpoints(s).map(e=>e.pod);if(pods.length>1){const pick=pods.filter(p=>p.name!==lastPick);pods=[pick[Math.random()*pick.length|0]]}else pods=pods.slice(0,1)}
  else if(fw.kind==='pod'){pods=K().pods.filter(p=>p.ns===ns&&p.name===fw.name&&ready(p))}else{const d=K().deps[ns+'/'+fw.name];pods=d?depPods(d).filter(ready).slice(0,1):[]}
  if(!pods.length)return {err:'curl: (52) Empty reply from server\n(the port-forward has no running pod to talk to)'};const p=podBox(pods[0]);lastPick=p.name;return {pod:p}}
const KRES=['pods','deployments','services','nodes','namespaces','configmaps','replicasets','all','events','endpoints'];
function kHelp(){return R(['kubectl controls the Kubernetes cluster manager.','','Basic commands:','  create        Create a resource (deployment, namespace, configmap)','  expose        Make a deployment reachable as a service','  run           Run a single pod','  get           List resources','  describe      Show details and events of a resource','  delete        Delete resources','','Deploy commands:','  rollout       Check, undo or restart a rollout','  scale         Set the number of replicas','  set image     Change the image of a deployment','','Debugging:','  logs  exec  port-forward  cluster-info','','Declarative:','  apply -f FILE   Create or update everything described in a YAML file'])}
function kubectl(args){const [verb,...a]=args;const f=kParse(a);
  switch(verb){
  case undefined:case 'help':case '--help':return kHelp();
  case 'version':return R(['Client Version: v1.31.0','Kustomize Version: v5.4.2','Server Version: v1.31.0']);
  case 'cluster-info':return R(['Kubernetes control plane is running at https://127.0.0.1:6443','CoreDNS is running at https://127.0.0.1:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy','',"To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'."]);
  case 'config':if(f.pos[0]==='current-context')return R('kind-harbor');if(f.pos[0]==='get-contexts')return R(table([['CURRENT','NAME','CLUSTER','AUTHINFO','NAMESPACE'],['*','kind-harbor','kind-harbor','kind-harbor','']]));return R('(The playground has one cluster: kind-harbor.)');
  case 'get':return kGet(f);
  case 'describe':return kDescribe(f);
  case 'create':return kCreate(f);
  case 'run':return kRun(f);
  case 'delete':return kDelete(f);
  case 'scale':return kScale(f);
  case 'expose':return kExpose(f);
  case 'set':return kSetImage(f);
  case 'rollout':return kRollout(f);
  case 'logs':return kLogs(f);
  case 'exec':return kExec(f);
  case 'port-forward':return kPortForward(f);
  case 'apply':return kApply(f,'apply');
  case 'api-resources':return R(table([['NAME','SHORTNAMES','KIND'],['configmaps','cm','ConfigMap'],['namespaces','ns','Namespace'],['nodes','no','Node'],['pods','po','Pod'],['services','svc','Service'],['deployments','deploy','Deployment'],['replicasets','rs','ReplicaSet']]));
  case 'edit':return E('error: kubectl edit is not in the playground.','Tip: change the YAML file with edit FILE, then kubectl apply -f FILE. That is the declarative way anyway.');
  case 'top':return E('error: Metrics API not available');
  }
  return E(`error: unknown command "${verb}" for "kubectl"`,'Tip: run kubectl with no arguments to see the commands.')}
/* apply -f */
function kApply(f,mode){const file=f.f;if(!file||file===true)return E('error: must specify one of -f and -k');if(S.files[file]==null)return E(`error: the path "${file}" does not exist`,'Tip: ls shows the files in this folder.');
  let docs;try{docs=parseYaml(S.files[file])}catch(e){return E(`error: error parsing ${file}: error converting YAML to JSON: yaml: ${e.message}: could not find expected ':' (check the indentation)`)}
  const out=[];let code=0;
  for(const o of docs){const kind=o.kind,md=o.metadata||{},name=md.name;const ns=md.namespace||f.n||'default';
    if(!kind||!name){out.push(...E(`error: error validating "${file}": kind and metadata.name are required`).out);code=1;continue}
    if(mode==='delete'){const r=kDelete(Object.assign(kParse([]),{pos:[kind.toLowerCase(),name],n:ns}));if(r.code){out.push(...r.out);code=1}else out.push(...r.out.map(x=>O(x.t.replace(/^pod "/,'pod "'))));continue}
    if(kind!=='Namespace'&&!K().nss[ns]){out.push(...E(`Error from server (NotFound): error when creating "${file}": namespaces "${ns}" not found`,`Tip: create the namespace first: kubectl create namespace ${ns}`).out);code=1;continue}
    const say=(label,st)=>out.push(O(`${label}/${name} ${st}`));
    if(kind==='Namespace'){if(K().nss[name]){if(mode==='create'){out.push(...E(`Error from server (AlreadyExists): namespaces "${name}" already exists`).out);code=1}else say('namespace','unchanged')}else{K().nss[name]=now();say('namespace','created')}continue}
    if(kind==='ConfigMap'){const key=ns+'/'+name;const data=Object.fromEntries(Object.entries(o.data||{}).map(([k,v])=>[k,String(v)]));const ex=K().cms[key];
      if(ex&&mode==='create'){out.push(...E(`Error from server (AlreadyExists): error when creating "${file}": configmaps "${name}" already exists`).out);code=1;continue}
      if(ex){const same=JSON.stringify(ex.data)===JSON.stringify(data);ex.data=data;say('configmap',same?'unchanged':'configured')}else{K().cms[key]={name,ns,data,born:now()};say('configmap','created')}continue}
    if(kind==='Deployment'){const sp=o.spec||{};const tl=(sp.template&&sp.template.metadata&&sp.template.metadata.labels)||{};const sel=(sp.selector&&sp.selector.matchLabels)||{};const c=((sp.template&&sp.template.spec&&sp.template.spec.containers)||[])[0];
      if(!c||!c.image){out.push(...E(`error: error validating "${file}": spec.template.spec.containers[0].image is required`).out);code=1;continue}
      if(!Object.keys(sel).length||!Object.entries(sel).every(([k,v])=>tl[k]===v)){out.push(...E(`The Deployment "${name}" is invalid: spec.template.metadata.labels: Invalid value: map[string]string{${Object.entries(tl).map(([k,v])=>`"${k}":"${v}"`).join(', ')}}: \`selector\` does not match template \`labels\``,'Tip: the labels under selector.matchLabels must also appear under template.metadata.labels.').out);code=1;continue}
      const envspec={env:c.env||[],envFrom:c.envFrom||[]};const reps=sp.replicas==null?1:+sp.replicas;const key=ns+'/'+name;const ex=K().deps[key];
      if(ex&&mode==='create'){out.push(...E(`Error from server (AlreadyExists): error when creating "${file}": deployments.apps "${name}" already exists`).out);code=1;continue}
      if(ex){let changed=false;if(ex.replicas!==reps){const was=ex.replicas;ex.replicas=reps;changed=true;evo('ScalingReplicaSet','deployment',name,ns,`Scaled ${reps>was?'up':'down'} replica set ${name}-${ex.rs} from ${was} to ${reps}`,'deployment-controller')}
        if(setTemplate(ex,{image:c.image,envspec}))changed=true;ex.cname=c.name||ex.cname;lastRec=0;say('deployment.apps',changed?'configured':'unchanged')}
      else{newDep({name,ns,replicas:reps,image:c.image,cname:c.name||ref(c.image).name,app:sel.app||Object.values(sel)[0],envspec});K().deps[key].labels=Object.assign({},sel);say('deployment.apps','created')}continue}
    if(kind==='Service'){const sp=o.spec||{};const pt=(sp.ports||[])[0]||{};const key=ns+'/'+name;const ex=K().svcs[key];const type=sp.type||'ClusterIP';
      if(ex&&mode==='create'){out.push(...E(`Error from server (AlreadyExists): error when creating "${file}": services "${name}" already exists`).out);code=1;continue}
      const s={name,ns,type,ip:ex?ex.ip:svcIp(),port:+pt.port||80,tport:+(pt.targetPort||pt.port||80),selector:sp.selector||{},born:ex?ex.born:now()};if(type!=='ClusterIP')s.nodePort=+pt.nodePort||(ex&&ex.nodePort)||30000+(parseInt(hhex(name+ns,4),16)%2768);
      const same=ex&&JSON.stringify([ex.type,ex.port,ex.tport,ex.selector])===JSON.stringify([s.type,s.port,s.tport,s.selector]);K().svcs[key]=s;say('service',ex?(same?'unchanged':'configured'):'created');continue}
    if(kind==='Pod'){const c=((o.spec&&o.spec.containers)||[])[0];if(!c){out.push(...E('error: spec.containers is required').out);code=1;continue}if(K().pods.some(p=>p.ns===ns&&p.name===name&&live(p))){say('pod','unchanged');continue}
      mkPod({name,ns,labels:md.labels||{},image:c.image,cname:c.name,envspec:{env:c.env,envFrom:c.envFrom}});say('pod','created');continue}
    out.push(...E(`error: resource mapping not found for name: "${name}" namespace: "" from "${file}": no matches for kind "${kind}"`).out);code=1}
  return {out,code}}
HQ.skip=ms=>{HQ.skewBy(ms);tick();lastRec=0;tick()};
Object.assign(HQ,{K,live,appOf,podBox,depPods,tick,RT,depStatus,endpoints,newDep,k8sResolve,viaFwd,KRES,kubectl});
})(window.HQ = window.HQ || {});
