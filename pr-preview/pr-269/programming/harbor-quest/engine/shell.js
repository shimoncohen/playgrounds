(function (HQ) { 'use strict';
const S=HQ.S;
const {E,D,listens,serve,O,K,viaFwd,docker,kubectl,R,now,live,podBox,stopC,boxExec}=HQ;
/* ---------- your laptop's shell ---------- */
const HOME_DIR='/home/you/shop';
function hostCurl(a){const t=a.filter(x=>!x.startsWith('-'))[0];if(!t)return E('curl: try \'curl localhost:8080\'');
  const u=t.replace(/^https?:\/\//,'');const [hp,...rest]=u.split('/');const path='/'+rest.join('/');const [h,pt]=hp.split(':');const port=pt?+pt:80;
  if(['localhost','127.0.0.1','0.0.0.0'].includes(h)){
    const c=D().containers.find(x=>x.status==='running'&&x.ports.some(p=>p[0]===port));
    if(c){const cport=c.ports.find(p=>p[0]===port)[1];if(!listens(c,cport))return E(`curl: (56) Recv failure: Connection reset by peer`,`Tip: port ${port} leads to port ${cport} inside ${c.name}, but nothing listens on ${cport} there.`);
      const s=serve(c,path);return {out:s.lines.map(l=>O(l,s.ok?'':'err')),code:s.ok?0:52}}
    const fw=K().fwd[port];if(fw){const r=viaFwd(fw);if(r.err)return E(r.err);const s=serve(r.pod,path);S.flag.fwdHits=(S.flag.fwdHits||0)+1;(S.flag.fwdPods=S.flag.fwdPods||{})[r.pod.name]=1;
      return {out:s.lines.map(l=>O(l,s.ok?'':'err')).concat([O(`↳ answered by pod ${r.pod.name} (${r.pod.image}) on ${r.pod.node}`,'sys')]),code:0}}
    return E(`curl: (7) Failed to connect to ${h} port ${port} after 0 ms: Couldn't connect to server`,D().containers.some(x=>x.status==='running')?`Tip: nothing on your laptop listens on port ${port}. docker ps shows which ports are published (the PORTS column).`:'Tip: nothing is running that publishes this port. Start a container with -p first.')}
  if(D().containers.some(c=>c.name===h||c.alias===h))return E(`curl: (6) Could not resolve host: ${h}`,'Tip: container names only resolve between containers on the same network. From your laptop, use localhost and the published port.');
  if(Object.values(K().svcs).some(s=>s.name===h))return E(`curl: (6) Could not resolve host: ${h}`,'Tip: service names only resolve inside the cluster. From your laptop, use kubectl port-forward, then curl localhost.');
  if(/\./.test(h))return E(`curl: (6) Could not resolve host: ${h}`,'Tip: the playground has no internet. Try localhost with a published port.');
  return E(`curl: (6) Could not resolve host: ${h}`)}
HQ.pendingEdit=null;
function hostCmd(argv,redir){const [c,...a]=argv;
  switch(c){
  case 'docker':return docker(a);
  case 'kubectl':case 'k':return kubectl(a);
  case 'help':return R([O('Commands this playground understands:','hd'),'  docker ...       run and manage containers, images, networks, volumes, compose','  kubectl ...      talk to the Kubernetes cluster (k is a shortcut)','  curl URL         make a web request, for example curl localhost:8080','  ls, cat FILE     look at the files in this folder','  edit FILE        open a file in the editor (also nano, vim)','  echo TEXT > FILE write a file','  clear            clear the screen (or Ctrl+L)','  history          show what you typed',O('Tip: press Tab to complete names, and ↑ to repeat a command.','tip')]);
  case 'clear':return {out:[{clear:1}],code:0};
  case 'ls':{const names=Object.keys(S.files).sort();if(a.includes('-l')||a.includes('-la')||a.includes('-al'))return R(names.map(n=>`-rw-r--r--  1 you  staff  ${String(S.files[n].length).padStart(5)}  ${n}`));return R([O(names.join('  '),'ls')])}
  case 'cat':{if(!a.length)return E('cat: which file? For example: cat Dockerfile');const out=[];let code=0;for(const n of a){if(S.files[n]==null){out.push(O(`cat: ${n}: No such file or directory`,'err'));code=1}else S.files[n].split('\n').forEach(l=>out.push(O(l,'file')))}return {out,code}}
  case 'echo':{const t=a.join(' ');if(redir){if(!redir.file)return E('bash: syntax error near unexpected token `newline\'');const old=S.files[redir.file];S.files[redir.file]=redir.append&&old!=null?old+'\n'+t:t;return R([])}return R(t)}
  case 'edit':case 'nano':case 'vim':case 'vi':case 'code':case 'open':{const n=a[0];if(!n)return E(`${c}: which file? For example: edit message.txt`);HQ.pendingEdit=n;return R([O(`(Opening ${n} in the editor…)`,'sys')])}
  case 'touch':a.forEach(n=>{if(S.files[n]==null)S.files[n]=''});return R([]);
  case 'rm':{const out=[];a.filter(x=>!x.startsWith('-')).forEach(n=>{if(S.files[n]==null)out.push(O(`rm: ${n}: No such file or directory`,'err'));else delete S.files[n]});return {out,code:out.length?1:0}}
  case 'curl':case 'wget':return hostCurl(a);
  case 'pwd':return R(HOME_DIR);
  case 'whoami':return R('you');
  case 'hostname':return R('harbor-laptop');
  case 'cd':return R([O('(This playground keeps you in ~/shop. Moving around folders was Shell Quest. Here we move containers instead.)','sys')]);
  case 'history':return R(S.hist.slice(-30).map((h,i,arr)=>`${String(S.hist.length-arr.length+i+1).padStart(5)}  ${h}`));
  case 'kind':if(a[0]==='get'&&a[1]==='clusters')return R('harbor');if(a[0]==='create')return R([O('(Your cluster "harbor" already exists. On a real machine, kind create cluster --name harbor makes one in about a minute.)','sys')]);return R('kind creates local Kubernetes clusters using Docker containers as nodes.');
  case 'minikube':return R([O('(This playground uses a kind cluster called harbor. minikube is another good way to run Kubernetes locally; the kubectl commands are the same.)','sys')]);
  case 'sudo':return hostCmd(a,redir);
  case 'exit':return R([O('(You are already on your laptop. exit is for leaving a container shell.)','sys')]);
  case 'sleep':case 'true':return R([]);
  case 'date':return R(new Date(now()).toString());
  case 'uname':return R('Darwin');
  case 'ping':return R([O('(Try ping from inside a container, where container names resolve. For example: docker exec -it NAME sh, then ping OTHER_NAME)','sys')]);
  case 'nginx':case 'node':case 'redis-cli':case 'psql':case 'python':return E(`bash: ${c}: command not found`,`Tip: ${c} is not installed on your laptop. That is the point of containers: it lives inside an image instead. Try docker exec.`);
  }
  return {out:[O(`bash: ${c}: command not found`,'err'),...(/^(dokcer|doker|dcoker|docekr|dockr)$/.test(c)?[O('Tip: did you mean docker?','tip')]:/^(kubect|kubctl|kubeclt|kubetcl|kuebctl)$/.test(c)?[O('Tip: did you mean kubectl?','tip')]:[O('Tip: type help to see what works here.','tip')])],code:127}}
function tokenize(s){const out=[];let cur='',q=null,has=false;for(let i=0;i<s.length;i++){const ch=s[i];
  if(q){if(ch===q)q=null;else cur+=ch;continue}
  if(ch==='"'||ch==="'"){q=ch;has=true;continue}
  if(/\s/.test(ch)){if(cur||has){out.push(cur);cur='';has=false}continue}
  if(ch==='>'){if(cur||has){out.push(cur);cur='';has=false}if(s[i+1]==='>'){out.push('>>');i++}else out.push('>');continue}
  if(ch==='\\'&&i+1<s.length){cur+=s[++i];continue}
  cur+=ch}
  if(q)return null;if(cur||has)out.push(cur);return out}
function splitChain(s){const parts=[];let cur='',q=null,op=null;for(let i=0;i<s.length;i++){const ch=s[i];if(q){cur+=ch;if(ch===q)q=null;continue}if(ch==='"'||ch==="'"){q=ch;cur+=ch;continue}
  if(ch==='&'&&s[i+1]==='&'){parts.push({cmd:cur,op});op='&&';cur='';i++;continue}if(ch==='|'&&s[i+1]==='|'){parts.push({cmd:cur,op});op='||';cur='';i++;continue}if(ch===';'){parts.push({cmd:cur,op});op=';';cur='';continue}cur+=ch}
  parts.push({cmd:cur,op});return parts.filter(p=>p.cmd.trim())}
function insideBox(){if(!S.inside)return null;if(S.inside.type==='c'){const c=D().containers.find(x=>x.id===S.inside.id);if(!c||c.status!=='running'){S.inside=null;return null}return c}
  const p=K().pods.find(x=>x.name===S.inside.id&&x.ns===S.inside.ns&&live(x));if(!p){S.inside=null;return null}return podBox(p)}
function execLine(line){const out=[];let code=0;
  for(const seg of splitChain(line)){if(seg.op==='&&'&&code!==0)continue;if(seg.op==='||'&&code===0)continue;
    if(/(^|[^|])\|([^|]|$)/.test(seg.cmd.replace(/(["']).*?\1/g,''))){out.push(O('(Pipes like | are Shell Quest territory. This playground runs one command at a time.)','sys'));code=1;continue}
    const t=tokenize(seg.cmd);if(t===null){out.push(O('bash: unexpected EOF while looking for matching quote','err'));code=2;continue}
    const ri=t.findIndex(x=>x==='>'||x==='>>');let redir=null,argv=t;if(ri>=0){redir={file:t[ri+1],append:t[ri]==='>>'};argv=t.slice(0,ri)}
    const box=insideBox();let r;
    if(box){if(argv[0]==='exit'){const wasMain=S.inside.main;const nm=box.isPod?box.name:box.name;S.inside=null;
        if(wasMain&&!box.isPod){stopC(box,0);out.push(O('exit'),O(`(Back on your laptop. The shell was the container's main process, so ${nm} stopped${box.rm?' and, because of --rm, was removed':''}.)`,'sys'))}
        else out.push(O('exit'),O(`(Back on your laptop. ${nm} is still running.)`,'sys'));code=0;continue}
      r=boxExec(box,argv,redir)}
    else r=hostCmd(argv,redir);
    out.push(...r.out);code=r.code}
  return {out,code}}
Object.assign(HQ,{tokenize,splitChain,insideBox,execLine});
})(window.HQ = window.HQ || {});
