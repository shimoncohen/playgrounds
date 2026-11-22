(function (HQ) { 'use strict';
const S=HQ.S;
const {table,ref,HUB,hhex,now,verOf,hubOk,stamp,clf,hex,ago,sizeNum,fmtSize,parseYaml,pad}=HQ;
/* ---------- output helpers ---------- */
const O=(t,c)=>({t:String(t),c:c||''});
function R(lines,code=0){return {out:(Array.isArray(lines)?lines:[lines]).flatMap(x=>typeof x==='string'?x.split('\n').map(l=>O(l)):[x]),code}}
function E(msg,tip){const out=String(msg).split('\n').map(l=>O(l,'err'));if(tip)out.push(O(tip,'tip'));return {out,code:1}}
const TB=rows=>table(rows).map((l,i)=>O(l,i===0?'hd':'tbl'));

/* ---------- Docker engine ---------- */
const D=()=>S.d;
function findC(x){if(!x)return null;const cs=D().containers;return cs.find(c=>c.name===x)||(x.length>=2?cs.filter(c=>c.id.startsWith(x)).length===1?cs.find(c=>c.id.startsWith(x)):null:null)}
function findImg(s){const r=ref(s);const im=D().images;if(im[r.key])return im[r.key];return Object.values(im).find(i=>i.id.startsWith(s)&&s.length>=4)||null}
function addHub(r){const h=HUB[r.name];const img={name:r.name,tag:r.tag,key:r.key,id:hhex(r.key,12),size:h.size,created:now()-86400e3*(4+(r.key.length*7)%40),kind:h.kind,port:h.port,os:h.os,shell:h.shell,runtime:h.runtime,layers:h.layers,ver:verOf(r.key),fs:{}};D().images[r.key]=img;return img}
function pullLines(r,implicit){const h=HUB[r.name];const out=[];if(implicit)out.push(O(`Unable to find image '${r.key}' locally`));
  if(!r.raw.includes(':')&&!implicit)out.push(O('Using default tag: latest'));
  out.push(O(`${r.tag}: Pulling from library/${r.name}`));
  const n=Math.max(1,h.layers.filter(l=>l[1]!=='0B').length);for(let i=0;i<n;i++)out.push(O(`${hhex(r.key+i,12)}: Pull complete`,'dim'));
  out.push(O(`Digest: sha256:${hhex(r.key+'d',64)}`,'dim'),O(`Status: Downloaded newer image for ${r.key}`));if(!implicit)out.push(O(`docker.io/library/${r.key}`));return out}
function pullMissing(r){return E(`Error response from daemon: pull access denied for ${r.name}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`,
  HUB[r.name]?`Tip: ${r.name} exists, but not with the tag "${r.tag}". Tags here: ${HUB[r.name].tags.join(', ')}.`:'Tip: check the spelling. This playground has: '+Object.keys(HUB).join(', ')+'.')}
function ensureImage(s,out){const r=ref(s);const have=D().images[r.key]||findImg(s);if(have)return have;
  if(!hubOk(r))return null;out.push(...pullLines(r,true));return addHub(r)}

const NGINX_HTML=`<!DOCTYPE html>
<html>
<head><title>Welcome to nginx!</title></head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and working.</p>
</body>
</html>`;
function baseFs(img){const f={'/etc/os-release':`PRETTY_NAME="${img.os||'Debian GNU/Linux 12 (bookworm)'}"\nNAME="${(img.os||'Debian GNU/Linux').split(' ')[0]}"`};
  if(img.kind==='web'){f['/usr/share/nginx/html/index.html']=NGINX_HTML;f['/usr/share/nginx/html/50x.html']='<h1>An error occurred.</h1>';f['/etc/nginx/nginx.conf']='user  nginx;\nworker_processes  auto;\nevents { worker_connections 1024; }\nhttp { include /etc/nginx/conf.d/*.conf; }'}
  if(img.kind==='httpd')f['/usr/local/apache2/htdocs/index.html']='<html><body><h1>It works!</h1></body></html>';
  Object.assign(f,img.fs||{});return f}
const SHELLS=['sh','bash','/bin/sh','/bin/bash','ash'];
function cmdLabel(c){const k=c.kind;if(c.cmd&&c.cmd.length)return '"'+c.cmd.join(' ').slice(0,19)+(c.cmd.join(' ').length>19?'…':'')+'"';
  return {hello:'"/hello"',web:'"/docker-entrypoint.…"',httpd:'"httpd-foreground"',redis:'"docker-entrypoint.s…"',pg:'"docker-entrypoint.s…"',app:'"docker-entrypoint.s…"',os:c.shell==='bash'?'"/bin/bash"':'"/bin/sh"'}[k]||'"/bin/sh"'}
function startLogs(kind,box){const T=stamp();
  if(kind==='web')return ['/docker-entrypoint.sh: Configuration complete; ready for start up',`${T} [notice] 1#1: nginx/${box.ver||'1.27.2'}`,`${T} [notice] 1#1: start worker processes`];
  if(kind==='httpd')return [`AH00558: httpd: Could not reliably determine the server's fully qualified domain name`,`[mpm_event:notice] AH00489: Apache/2.4.62 (Unix) configured -- resuming normal operations`];
  if(kind==='redis')return ['1:C Redis version=7.4.1, bits=64, just started','1:M Server initialized','1:M Ready to accept connections tcp'];
  if(kind==='pg')return box.env&&box.env.POSTGRES_PASSWORD?['PostgreSQL init process complete; ready for start up.',`${T} UTC [1] LOG:  database system is ready to accept connections`]
    :['Error: Database is uninitialized and superuser password is not specified.','       You must specify POSTGRES_PASSWORD to a non-empty value for the','       superuser. For example, "-e POSTGRES_PASSWORD=password" on "docker run".'];
  if(kind==='app')return ['Shop listening on port 3000'];
  return []}
const HELLO=`
Hello from Docker!
This message shows that your installation appears to be working correctly.

To generate this message, Docker took the following steps:
 1. The Docker client contacted the Docker daemon.
 2. The Docker daemon pulled the "hello-world" image from Docker Hub.
 3. The Docker daemon created a new container from that image, which runs
    the program that printed the text you are reading.
 4. The Docker daemon streamed that output to the Docker client, which sent
    it to your terminal.

To try something more ambitious, you can run an Ubuntu container with:
 $ docker run -it ubuntu bash
`;
function netAssign(c,netName){const n=D().networks[netName];if(!n||!n.sub){c.ip='';return}n.n=(n.n||1)+1;c.ip=n.sub+'.'+n.n}
function portUsed(p){if(D().containers.some(c=>c.status==='running'&&c.ports.some(x=>x[0]===p)))return true;return !!S.k.fwd[p]}
/* virtual filesystem for a container or pod, with volume mounts */
function vfs(box){const mounts=box.mounts||[];
  const norm=p=>{const parts=[];for(const s of p.split('/')){if(!s||s==='.')continue;if(s==='..')parts.pop();else parts.push(s)}return '/'+parts.join('/')};
  const mountOf=p=>mounts.find(m=>p===m.path||p.startsWith(m.path+'/'));
  const store=m=>m.type==='bind'?null:(D().volumes[m.vol]||(D().volumes[m.vol]={files:{},created:now()})).files;
  const api={norm,
    get(p){p=norm(p);const m=mountOf(p);if(m){const rel=p.slice(m.path.length+1);if(m.type==='bind')return S.files[rel]??null;return store(m)[rel]??null}return box.fs[p]??null},
    set(p,v){p=norm(p);const m=mountOf(p);if(m){const rel=p.slice(m.path.length+1);if(m.type==='bind'){S.files[rel]=v;return}store(m)[rel]=v;return}box.fs[p]=v},
    del(p){p=norm(p);const m=mountOf(p);if(m){const rel=p.slice(m.path.length+1);if(m.type==='bind')delete S.files[rel];else delete store(m)[rel];return}delete box.fs[p]},
    list(dir){dir=norm(dir);const set=new Map();const pre=dir==='/'?'/':dir+'/';
      if(dir==='/')['bin','dev','etc','home','lib','proc','root','sys','tmp','usr','var'].forEach(n=>set.set(n,'d'));
      for(const k of Object.keys(box.fs)){if(k.startsWith(pre)){const rest=k.slice(pre.length);const seg=rest.split('/')[0];if(rest.includes('/'))set.set(seg,'d');else if(!set.has(seg))set.set(seg,box.fs[k]==='\u0000dir'?'d':'f')}}
      for(const m of mounts){if(m.path.startsWith(pre)){set.set(m.path.slice(pre.length).split('/')[0],'d')}
        if(dir===m.path){const files=m.type==='bind'?S.files:store(m);Object.keys(files).forEach(n=>set.set(n,'f'))}}
      const exists=dir==='/'||set.size>0||Object.keys(box.fs).some(k=>k.startsWith(pre))||mounts.some(m=>(m.path+'/').startsWith(pre))||box.fs[dir]==='\u0000dir';
      return exists?[...set.entries()].sort((a,b)=>a[0].localeCompare(b[0])):null}};
  return api}

/* ---------- what answers when something is contacted over the network ---------- */
HQ.HIT=null; /* id of the box that answered the last request, for the live view flash */
function boxKind(b){return b.kind||(D().images[b.imgKey]||{}).kind}
function resolveFrom(box,host){host=host.replace(/^https?:\/\//,'').split('/')[0];const [h,pt]=host.split(':');const port=pt?+pt:null;
  if(box.isPod)return HQ.k8sResolve(box,h,port);
  if(h==='localhost'||h==='127.0.0.1')return {box,port};
  if(!box.net||box.net==='bridge'||box.net==='host'||box.net==='none')return null;
  const t=D().containers.find(c=>c.status==='running'&&c.net===box.net&&(c.name===h||c.alias===h||c.ip===h));return t?{box:t,port}:null}
function serve(target,path='/'){const kind=boxKind(target);HQ.HIT=target.id||target.name;
  const log=`172.17.0.1 - - [${clf()}] "GET ${path} HTTP/1.1" 200 615 "-" "curl/8.5.0" "-"`;
  if(kind==='web'){(target.logs=target.logs||[]).push(log);const f=vfs(target).get('/usr/share/nginx/html'+(path==='/'?'/index.html':path));return f==null?{ok:true,lines:['<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center></body></html>']}:{ok:true,lines:f.split('\n')}}
  if(kind==='httpd'){(target.logs=target.logs||[]).push(log.replace('"-" "curl/8.5.0" "-"','"curl/8.5.0"'));return {ok:true,lines:[vfs(target).get('/usr/local/apache2/htdocs/index.html')||'<html><body><h1>It works!</h1></body></html>']}}
  if(kind==='app'){const fs=target.fs||{};const mk=Object.keys(fs).find(k=>k.endsWith('/message.txt'));const msg=mk?String(fs[mk]).trim():'';
    let line='Hello from the shop! '+msg;const env=target.env||{};
    if(env.REDIS_HOST){const r=resolveFrom(target,env.REDIS_HOST);if(r&&boxKind(r.box)==='redis'){const v=vfs(r.box);const n=(+v.get('/data/dump.rdb')||0)+1;v.set('/data/dump.rdb',String(n));line+='  Visits: '+n}else line+='  Visits: (cannot reach redis at "'+env.REDIS_HOST+'")'}
    (target.logs=target.logs||[]).push('GET '+path);return {ok:true,lines:[line]}}
  if(kind==='redis'||kind==='pg')return {ok:false,lines:['curl: (52) Empty reply from server']};
  return {ok:false,lines:[`curl: (7) Failed to connect: nothing is listening on that port`]}}
function listens(box,port){const k=boxKind(box);const p={web:80,httpd:80,app:3000,redis:6379,pg:5432}[k];return port==null?(p===80):port===p}

/* ---------- commands inside a container or pod ---------- */
function boxExec(box,argv,redir){const v=vfs(box);const cwd=box.cwd||'/';const abs=p=>v.norm(p.startsWith('/')?p:cwd+'/'+p);const busy=(box.shell||'sh')!=='bash';
  const [c,...a]=argv;let out=[],code=0;const o=t=>out.push(...String(t).split('\n').map(l=>O(l)));const e=t=>{out.push(O(t,'err'));code=1};
  switch(c){
  case 'ls':{const t=a.filter(x=>!x.startsWith('-'));const dir=abs(t[0]||'.');const f=v.get(dir);if(f!=null&&f!=='\u0000dir'){o(t[0]);break}
    const l=v.list(dir);if(!l){e(`ls: ${t[0]}: No such file or directory`);break}
    out.push(O(l.map(([n,k])=>k==='d'?'\u0001'+n:n).join('  '),'ls'));break}
  case 'cat':{if(!a.length){e('cat: missing file name (the playground cannot read from the keyboard)');break}for(const p of a){const f=v.get(abs(p));if(f==null||f==='\u0000dir')e(busy?`cat: can't open '${p}': No such file or directory`:`cat: ${p}: No such file or directory`);else o(f)}break}
  case 'echo':{const text=a.join(' ');if(redir){const p=abs(redir.file);const old=v.get(p);v.set(p,redir.append&&old!=null?old+'\n'+text:text)}else o(text);break}
  case 'pwd':o(cwd);break;
  case 'cd':{const d=abs(a[0]||'/root');if(v.list(d))box.cwd=d;else e(`sh: cd: can't cd to ${a[0]}: No such file or directory`);break}
  case 'whoami':o('root');break;
  case 'id':o('uid=0(root) gid=0(root) groups=0(root)');break;
  case 'hostname':o(box.isPod?box.name:box.id.slice(0,12));break;
  case 'uname':o(a.includes('-a')?`Linux ${box.isPod?box.name:box.id.slice(0,12)} 6.10.14-linuxkit #1 SMP x86_64 Linux`:'Linux');break;
  case 'env':case 'printenv':{const env=Object.assign({PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',HOSTNAME:box.isPod?box.name:box.id.slice(0,12)},box.env||{},{HOME:'/root'});
    if(box.isPod)Object.assign(env,{KUBERNETES_SERVICE_HOST:'10.96.0.1',KUBERNETES_SERVICE_PORT:'443'});Object.entries(env).forEach(([k,x])=>o(k+'='+x));break}
  case 'ps':o('PID   USER     TIME  COMMAND');o('    1 root      0:00 '+({web:'nginx: master process nginx -g daemon off;',httpd:'httpd -DFOREGROUND',redis:'redis-server *:6379',pg:'postgres',app:'node app.js'}[boxKind(box)]||(box.shell||'sh')));if(S.inside)o('   '+(7+(box.name||'').length)+' root      0:00 ps');break;
  case 'touch':a.forEach(p=>{if(v.get(abs(p))==null)v.set(abs(p),'')});break;
  case 'mkdir':a.filter(x=>!x.startsWith('-')).forEach(p=>v.set(abs(p),'\u0000dir'));break;
  case 'rm':a.filter(x=>!x.startsWith('-')).forEach(p=>{if(v.get(abs(p))==null)e(`rm: can't remove '${p}': No such file or directory`);else v.del(abs(p))});break;
  case 'sleep':break;
  case 'date':o(new Date(now()).toUTCString());break;
  case 'nginx':if(boxKind(box)==='web'){out.push(O('nginx version: nginx/'+(box.ver||'1.27.2')))}else e('sh: nginx: not found');break;
  case 'node':if((box.runtime==='node')||boxKind(box)==='app'){o(a[0]==='-v'||a[0]==='--version'?'v20.18.0':'(the playground cannot run node interactively; try node -v)')}else{e('sh: node: not found')}break;
  case 'redis-cli':if(boxKind(box)==='redis'){if(a[0]==='ping'||!a.length)o('PONG');else if(a[0]==='get'||a[0]==='GET')o(v.get('/data/dump.rdb')?'"'+v.get('/data/dump.rdb')+'"':'(nil)');else o('OK')}else e('sh: redis-cli: not found');break;
  case 'ping':{const t=a.filter(x=>!x.startsWith('-')&&!/^\d+$/.test(x))[0];if(!t){e('ping: usage: ping [-c COUNT] HOST');break}
    const cnt=+(a[a.indexOf('-c')+1])||3;const r=resolveFrom(box,t);
    if(!r){e(busy?`ping: bad address '${t}'`:`ping: ${t}: Name or service not known`);break}
    const ip=r.box===box?'127.0.0.1':(r.box.ip||'172.18.0.9');o(`PING ${t} (${ip}): 56 data bytes`);for(let i=0;i<Math.min(cnt,5);i++)o(`64 bytes from ${ip}: seq=${i} ttl=64 time=0.0${7+i} ms`);
    o('',);o(`--- ${t} ping statistics ---`);o(`${Math.min(cnt,5)} packets transmitted, ${Math.min(cnt,5)} packets received, 0% packet loss`);break}
  case 'curl':case 'wget':{const t=a.filter(x=>!x.startsWith('-'))[0];if(!t){e(c+': no URL given');break}const r=resolveFrom(box,t);
    if(!r){e(c==='curl'?`curl: (6) Could not resolve host: ${t.replace(/^https?:\/\//,'').split(/[:/]/)[0]}`:`wget: bad address '${t}'`);break}
    if(r.svcErr){e(r.svcErr);break}
    if(!listens(r.box,r.port)){e(`curl: (7) Failed to connect to ${t} port ${r.port||80}: Connection refused`);break}
    const path='/'+(t.replace(/^https?:\/\//,'').split('/').slice(1).join('/'));const s=serve(r.box,path);s.lines.forEach(l=>out.push(O(l,s.ok?'':'err')));if(r.via)out.push(O(r.via,'sys'));break}
  case 'apt':case 'apt-get':case 'apk':o('(Installing packages works in a real container. The playground skips it.)');break;
  case 'help':o('Inside a container you can try: ls  cat  echo  pwd  cd  hostname  whoami  env  ps  ping  curl  touch  mkdir  rm  exit');break;
  case 'docker':case 'kubectl':e(`sh: ${c}: not found`);out.push(O('You are inside a container, which has no Docker or kubectl. Type exit to go back to your laptop.','tip'));code=127;break;
  case undefined:break;
  default:e(busy?`sh: ${c}: not found`:`bash: ${c}: command not found`);code=127}
  if(argv.length&&!['ls','cat','pwd','cd','help'].includes(c)&&box.logs&&box.attachedLogs)box.logs.push(...out.map(x=>x.t));
  return {out,code}}

/* ---------- docker ---------- */
function newC(o){const id=hex(64);const c=Object.assign({id,name:o.name,image:o.image,imgKey:o.img.key,kind:o.img.kind,ver:o.img.ver,os:o.img.os,shell:o.img.shell,runtime:o.img.runtime,
  status:'created',code:0,ports:o.ports||[],env:o.env||{},mounts:o.mounts||[],net:o.net||'bridge',ip:'',cmd:o.cmd||[],created:now(),started:0,finished:0,fs:baseFs(o.img),logs:[],rm:!!o.rm,alias:o.alias||'',project:o.project||'',cwd:'/'},{});
  D().containers.push(c);return c}
const pickName=()=>pickA(['brave','calm','eager','jolly','keen','proud','quirky','zen','happy','gentle'])+'_'+pickA(['turing','hopper','lovelace','curie','tesla','noether','ritchie','torvalds','hamilton','shannon']);
const autoName=()=>{let n;for(let i=0;i<1000;i++){n=pickName();if(!D().containers.some(c=>c.name===n))break}return n};
function pickA(a){return a[Math.random()*a.length|0]}
function startC(c){const out=[];
  for(const [h] of c.ports){if(portUsed(h)){c.status='created';return {err:`docker: Error response from daemon: driver failed programming external connectivity on endpoint ${c.name} (${hex(64)}): Bind for 0.0.0.0:${h} failed: port is already allocated.`}}}
  netAssign(c,c.net);c.status='running';c.started=now();c.code=0;
  const kind=c.kind;
  if(kind==='pg'&&!(c.env.POSTGRES_PASSWORD)){c.logs.push(...startLogs('pg',c));stopC(c,1);return {}}
  if(kind==='app'&&!Object.keys(c.fs).some(k=>k.endsWith('/app.js'))){c.logs.push(`node:internal/modules/cjs/loader:1228`,`Error: Cannot find module '/app/app.js'`);stopC(c,1);return {}}
  c.logs.push(...startLogs(kind,c));return {out}}
function stopC(c,code=0){c.status='exited';c.code=code;c.finished=now();if(S.inside&&S.inside.id===c.id)S.inside=null;if(c.rm)D().containers=D().containers.filter(x=>x!==c)}
function parseRunOpts(args,build){const o={ports:[],env:{},mounts:[],d:false,it:false,rm:false,name:null,net:null,rest:null};
  for(let i=0;i<args.length;i++){let a=args[i];
    const val=f=>{if(a.includes('=')&&a.startsWith('--'))return a.split('=').slice(1).join('=');const v=args[++i];if(v==null)throw new Error(`flag needs an argument: ${f}`);return v};
    if(!a.startsWith('-')||a==='-'){o.image=a;o.rest=args.slice(i+1);break}
    if(/^-[a-z]{2,}$/.test(a)&&!['-it','-ti'].includes(a)&&/^-[dit]+$/.test(a)){for(const ch of a.slice(1)){if(ch==='d')o.d=true;else o.it=true}continue}
    if(a==='-d'||a==='--detach')o.d=true;
    else if(['-i','-t','-it','-ti','--interactive','--tty'].includes(a))o.it=true;
    else if(a==='--rm')o.rm=true;
    else if(a==='--name'||a.startsWith('--name='))o.name=val('--name');
    else if(a==='-p'||a==='--publish'||a.startsWith('--publish=')){const v=val('-p');const m=v.match(/^(?:[\d.]+:)?(\d+):(\d+)(?:\/tcp)?$/);if(!m)throw new Error(`invalid port mapping "${v}". Use HOST:CONTAINER, for example 8080:80`);o.ports.push([+m[1],+m[2]])}
    else if(a==='-e'||a==='--env'||a.startsWith('--env=')){const v=val('-e');const j=v.indexOf('=');if(j<0)o.env[v]='';else o.env[v.slice(0,j)]=v.slice(j+1)}
    else if(a==='-v'||a==='--volume'||a.startsWith('--volume=')){const v=val('-v');const j=v.indexOf(':');if(j<1)throw new Error(`invalid volume "${v}". Use NAME:/path/in/container`);const src=v.slice(0,j),path=v.slice(j+1).split(':')[0];
      if(!path.startsWith('/'))throw new Error(`invalid volume "${v}": the container path must start with /`);
      if(/^[./~$]/.test(src))o.mounts.push({type:'bind',src,path});else o.mounts.push({type:'volume',vol:src,path})}
    else if(a==='--network'||a==='--net'||a.startsWith('--network=')||a.startsWith('--net='))o.net=val('--network');
    else if(a==='-w'||a==='--workdir'||a==='--restart'||a==='--hostname'||a==='-h'||a==='--user'||a==='-u'||a==='--platform'){val(a)}
    else if(a.startsWith('--restart=')||a.startsWith('--platform=')){}
    else throw new Error(`unknown flag: ${a}`)}
  return o}
function dRun(args){let o;try{o=parseRunOpts(args)}catch(x){return E('docker: '+x.message,'See \'docker run --help\'.')}
  if(!o.image)return E(`docker: 'docker run' requires at least 1 argument.`,'Tip: name the image to start, for example docker run hello-world');
  const out=[];const img=ensureImage(o.image,out);if(!img)return pullMissing(ref(o.image));
  if(o.name&&findC(o.name)&&findC(o.name).name===o.name)return E(`docker: Error response from daemon: Conflict. The container name "/${o.name}" is already in use by container "${findC(o.name).id}". You have to remove (or rename) that container to be able to reuse that name.`,`Tip: remove the old one first with docker rm -f ${o.name}, or pick another name.`);
  if(o.net&&!D().networks[o.net])return E(`docker: Error response from daemon: network ${o.net} not found.`,`Tip: create it first: docker network create ${o.net}`);
  for(const m of o.mounts)if(m.type==='volume'&&!D().volumes[m.vol])D().volumes[m.vol]={files:{},created:now()};
  const name=o.name||autoName();const c=newC({name,image:o.image,img,ports:o.ports,env:o.env,mounts:o.mounts,net:o.net||'bridge',cmd:o.rest,rm:o.rm});
  const r=startC(c);if(r.err){out.push(...E(r.err).out);if(c.rm)D().containers=D().containers.filter(x=>x!==c);return {out,code:125}}
  if(c.status!=='running'){if(o.d)out.push(O(c.id));else c.logs.forEach(l=>out.push(O(l)));return {out,code:c.code}}
  const kind=c.kind;const cmd=o.rest||[];
  if(kind==='hello'&&!cmd.length){HELLO.split('\n').forEach(l=>out.push(O(l)));c.logs=HELLO.split('\n');stopC(c,0);return {out,code:0}}
  if(cmd.length&&SHELLS.includes(cmd[0])&&cmd.length===1||(!cmd.length&&kind==='os')){
    if(o.it&&!o.d){c.attachedLogs=true;S.inside={id:c.id,main:true,type:'c'};c.cwd='/';out.push(O(`(You are now inside container ${c.name}. Your prompt changed. Type exit to leave, which also stops this container.)`,'sys'));return {out,code:0}}
    if(o.d&&o.it){out.push(O(c.id));out.push(O(`(The shell is waiting in the background. Step in with docker exec -it ${c.name} sh)`,'sys'));return {out,code:0}}
    if(o.d)out.push(O(c.id));stopC(c,0);if(!o.d)out.push(O('(The shell had no keyboard attached, so it exited at once. Add -it to talk to it.)','sys'));else out.push(O(`(${c.name} exited at once: a shell with no keyboard has nothing to do. Add -it, or give it a command.)`,'sys'));return {out,code:0}}
  if(cmd.length){if(cmd[0]==='sleep'){if(o.d){out.push(O(c.id));return {out,code:0}}stopC(c,0);return {out,code:0}}
    if(o.d){const r2=boxExec(c,cmd);c.logs.push(...r2.out.map(x=>x.t));out.push(O(c.id));stopC(c,r2.code);return {out,code:0}}
    const r2=boxExec(c,cmd);c.logs.push(...r2.out.map(x=>x.t));out.push(...r2.out);stopC(c,r2.code);return {out,code:r2.code}}
  if(o.d){out.push(O(c.id));return {out,code:0}}
  c.logs.forEach(l=>out.push(O(l)));out.push(O(`(A server runs until you stop it, so in a real terminal this would keep printing logs here and block your prompt. The playground moved it to the background for you. Next time add -d to start it detached.)`,'sys'));
  return {out,code:0}}
function statusText(c){if(c.status==='running')return 'Up '+ago(c.started).replace(/^About an?/,'About a');if(c.status==='created')return 'Created';return `Exited (${c.code}) ${ago(c.finished).toLowerCase()} ago`}
function portsText(c){if(c.status!=='running')return '';if(c.ports.length)return c.ports.map(([h,p])=>`0.0.0.0:${h}->${p}/tcp`).join(', ');const img=D().images[c.imgKey];return img&&img.port?img.port+'/tcp':''}
function dPs(args){const all=args.includes('-a')||args.includes('--all');const q=args.includes('-q')||args.includes('--quiet');
  const cs=D().containers.filter(c=>all||c.status==='running').slice().reverse();
  if(q)return R(cs.map(c=>c.id.slice(0,12)));
  const rows=[['CONTAINER ID','IMAGE','COMMAND','CREATED','STATUS','PORTS','NAMES']].concat(cs.map(c=>[c.id.slice(0,12),c.image,cmdLabel(c),ago(c.created)+' ago',statusText(c),portsText(c),c.name]));
  const out=TB(rows);if(!cs.length)out.push(O(all?'(No containers at all yet.)':'(Nothing is running right now. Add -a to also see stopped containers.)','sys'));return {out,code:0}}
function dImages(){const im=Object.values(D().images).sort((a,b)=>b.created-a.created);const out=TB([['REPOSITORY','TAG','IMAGE ID','CREATED','SIZE']].concat(im.map(i=>[i.name,i.tag,i.id,ago(i.created).toLowerCase()+' ago',i.size])));
  if(!im.length)out.push(O('(No images yet. They appear when you pull or run one.)','sys'));return {out,code:0}}
function dPull(args){const s=args.find(a=>!a.startsWith('-'));if(!s)return E(`"docker pull" requires exactly 1 argument.`,'Tip: docker pull nginx');const r=ref(s);
  if(D().images[r.key])return R([...(!r.raw.includes(':')?['Using default tag: latest']:[]),`${r.tag}: Pulling from library/${r.name}`,`Digest: sha256:${hhex(r.key+'d',64)}`,`Status: Image is up to date for ${r.key}`,`docker.io/library/${r.key}`]);
  if(!hubOk(r))return pullMissing(r);const out=pullLines(r,false);addHub(r);return {out,code:0}}
function dRmi(args){const f=args.includes('-f')||args.includes('--force');const names=args.filter(a=>!a.startsWith('-'));if(!names.length)return E(`"docker rmi" requires at least 1 argument.`);
  const out=[];let code=0;for(const n of names){const img=findImg(n);if(!img){out.push(...E(`Error response from daemon: No such image: ${ref(n).key}`).out);code=1;continue}
    const user=D().containers.find(c=>c.imgKey===img.key);if(user&&!f){out.push(...E(`Error response from daemon: conflict: unable to remove repository reference "${n}" (must force) - container ${user.id.slice(0,12)} is using its referenced image ${img.id}`,`Tip: remove the container first (docker rm -f ${user.name}), then the image.`).out);code=1;continue}
    delete D().images[img.key];out.push(O('Untagged: '+img.key));if(!Object.values(D().images).some(i=>i.id===img.id))out.push(O('Deleted: sha256:'+img.id+hhex(img.id,52)))}
  return {out,code}}
function dHistory(args){const s=args.find(a=>!a.startsWith('-'));if(!s)return E(`"docker history" requires exactly 1 argument.`);const img=findImg(s);if(!img)return E(`Error response from daemon: No such image: ${ref(s).key}`,'Tip: pull it first, or check docker images.');
  const rows=[['IMAGE','CREATED','CREATED BY','SIZE']];img.layers.forEach((l,i)=>rows.push([i===0?img.id:(l[2]?'<missing>':'<missing>'),ago(l[3]||img.created).toLowerCase()+' ago',l[0].length>52?l[0].slice(0,51)+'…':l[0],l[1]]));return {out:TB(rows),code:0}}
function dLogs(args){const n=args.filter(a=>!a.startsWith('-')).pop();const c=findC(n);if(!c)return E(`Error response from daemon: No such container: ${n||''}`);
  if(!c.logs.length)return R([O('(This container has not printed anything yet.)','sys')]);return R(c.logs.slice(-40))}
function dStop(args,verb){const names=args.filter(a=>!a.startsWith('-'));if(!names.length)return E(`"docker ${verb}" requires at least 1 argument.`);const out=[];let code=0;
  for(const n of names){const c=findC(n);if(!c){out.push(...E(`Error response from daemon: No such container: ${n}`).out);code=1;continue}
    if(verb==='stop'||verb==='kill'){if(c.status==='running'){c.logs.push(c.kind==='web'?`${stamp()} [notice] 1#1: signal 3 (SIGQUIT) received, shutting down`:'(stopped)');stopC(c,verb==='kill'?137:0)}out.push(O(n))}
    else if(verb==='start'||verb==='restart'){if(c.status==='running'&&verb==='start'){out.push(O(n));continue}if(c.status==='running')stopC(c,0);if(!D().containers.includes(c)){out.push(O(n));continue}
      const r=startC(c);if(r.err){out.push(...E(r.err.replace('docker: ','')).out,O(`Error: failed to start containers: ${n}`,'err'));code=1;continue}
      if(c.kind==='hello'){c.logs.push(...HELLO.split('\n'));stopC(c,0)}
      else if(c.kind==='os'&&!(c.cmd[0]==='sleep')){stopC(c,0)}
      out.push(O(n))}}
  return {out,code}}
function dRm(args){const f=args.includes('-f')||args.includes('--force');const names=args.filter(a=>!a.startsWith('-'));if(!names.length)return E(`"docker rm" requires at least 1 argument.`);const out=[];let code=0;
  for(const n of names){const c=findC(n);if(!c){out.push(...E(`Error response from daemon: No such container: ${n}`).out);code=1;continue}
    if(c.status==='running'&&!f){out.push(...E(`Error response from daemon: cannot remove container "/${c.name}": container is running: stop the container before removing or force remove`,`Tip: docker stop ${c.name} first, or use docker rm -f ${c.name}`).out);code=1;continue}
    if(S.inside&&S.inside.id===c.id)S.inside=null;D().containers=D().containers.filter(x=>x!==c);out.push(O(n))}
  return {out,code}}
function dExec(args){let it=false,i=0;for(;i<args.length;i++){const a=args[i];if(['-i','-t','-it','-ti','--interactive','--tty'].includes(a))it=true;else if(a==='-e'||a==='-w'||a==='-u')i++;else if(a.startsWith('-'))continue;else break}
  const n=args[i],cmd=args.slice(i+1);if(!n||!cmd.length)return E(`"docker exec" requires at least 2 arguments.`,'Tip: docker exec -it web sh   (container name, then the command to run inside it)');
  const c=findC(n);if(!c)return E(`Error response from daemon: No such container: ${n}`);if(c.status!=='running')return E(`Error response from daemon: container ${c.id} is not running`,`Tip: start it first with docker start ${c.name}`);
  if(SHELLS.includes(cmd[0])&&cmd.length===1){if(cmd[0].endsWith('bash')&&c.shell!=='bash'&&c.kind!=='web'&&c.kind!=='redis'&&c.kind!=='pg'&&c.kind!=='httpd'){return E(`OCI runtime exec failed: exec failed: unable to start container process: exec: "bash": executable file not found in $PATH: unknown`,'Tip: small Alpine-based images only have sh. Try sh instead.')}
    if(!it)return R([]);S.inside={id:c.id,main:false,type:'c'};c.cwd='/';return R([O(`(You are now inside ${c.name}. Type exit to come back. The container keeps running.)`,'sys')])}
  const redir=pullRedir(cmd);return boxExec(c,redir.argv,redir.r)}
function pullRedir(argv){const i=argv.findIndex(x=>x==='>'||x==='>>');if(i<0)return {argv,r:null};return {argv:argv.slice(0,i),r:{file:argv[i+1]||'',append:argv[i]==='>>'}}}
function dInspect(args){const n=args.filter(a=>!a.startsWith('-'))[0];const c=findC(n);if(c){const o={Id:c.id,Created:new Date(c.created).toISOString(),Name:'/'+c.name,State:{Status:c.status,Running:c.status==='running',ExitCode:c.code},
  Config:{Image:c.image,Env:Object.entries(c.env).map(([k,v])=>k+'='+v),Cmd:c.cmd.length?c.cmd:null},
  Mounts:c.mounts.map(m=>m.type==='volume'?{Type:'volume',Name:m.vol,Destination:m.path}:{Type:'bind',Source:m.src,Destination:m.path}),
  NetworkSettings:{Ports:Object.fromEntries(c.ports.map(([h,p])=>[p+'/tcp',[{HostIp:'0.0.0.0',HostPort:String(h)}]])),Networks:{[c.net]:{IPAddress:c.ip,Aliases:c.alias?[c.alias]:null}}}};
  return R(JSON.stringify([o],null,4))}const img=findImg(n||'');if(img)return R(JSON.stringify([{Id:'sha256:'+img.id,RepoTags:[img.key],Size:sizeNum(img.size),Config:{ExposedPorts:img.port?{[img.port+'/tcp']:{}}:null},RootFS:{Type:'layers',Layers:img.layers.filter(l=>l[1]!=='0B').map((l,i)=>'sha256:'+hhex(img.key+i,64))}}],null,4));
  return E(`Error: No such object: ${n||''}`)}
function dNetwork(args){const [sub,...a]=args;const N=D().networks;
  if(sub==='ls'||sub==='list')return {out:TB([['NETWORK ID','NAME','DRIVER','SCOPE']].concat(Object.entries(N).map(([n,x])=>[x.id,n,x.driver,'local']))),code:0};
  if(sub==='create'){const n=a.filter(x=>!x.startsWith('-')).pop();if(!n)return E('"docker network create" requires exactly 1 argument.');if(N[n])return E(`Error response from daemon: network with name ${n} already exists`);
    N[n]={id:hhex(n+now(),12),driver:'bridge',sub:'172.'+(D().subn++)+'.0',n:1,created:now()};return R(N[n].id+hhex(n,52))}
  if(sub==='rm'||sub==='remove'){const out=[];for(const n of a){if(!N[n]){out.push(...E(`Error response from daemon: network ${n} not found`).out);continue}if(N[n].builtin){out.push(...E(`Error response from daemon: ${n} is a pre-defined network and cannot be removed`).out);continue}
    if(D().containers.some(c=>c.net===n&&c.status==='running')){out.push(...E(`Error response from daemon: error while removing network: network ${n} id ${N[n].id} has active endpoints`).out);continue}delete N[n];out.push(O(n))}return {out,code:0}}
  if(sub==='inspect'){const n=a[0];if(!N[n])return E(`Error response from daemon: network ${n||''} not found`);return R(JSON.stringify([{Name:n,Id:N[n].id,Driver:N[n].driver,IPAM:{Config:N[n].sub?[{Subnet:N[n].sub+'.0/16'.replace('.0.0/','.0/')}]:[]},
    Containers:Object.fromEntries(D().containers.filter(c=>c.net===n&&c.status==='running').map(c=>[c.id,{Name:c.name,IPv4Address:c.ip+'/16'}]))}],null,4))}
  if(sub==='connect'){const [n,cn]=a;const c=findC(cn);if(!N[n]||!c)return E('Error response from daemon: network or container not found');c.net=n;netAssign(c,n);return R([])}
  return R(['Usage:  docker network COMMAND','','Commands:','  create      Create a network','  inspect     Show details of a network','  ls          List networks','  rm          Remove a network'])}
function dVolume(args){const [sub,...a]=args;const V=D().volumes;
  if(sub==='ls'||sub==='list')return {out:TB([['DRIVER','VOLUME NAME']].concat(Object.keys(V).map(n=>['local',n]))),code:0};
  if(sub==='create'){const n=a.filter(x=>!x.startsWith('-')).pop()||hhex('v'+now(),64);if(!V[n])V[n]={files:{},created:now()};return R(n)}
  if(sub==='rm'||sub==='remove'){const out=[];let code=0;for(const n of a.filter(x=>!x.startsWith('-'))){if(!V[n]){out.push(...E(`Error response from daemon: get ${n}: no such volume`).out);code=1;continue}
    const u=D().containers.find(c=>c.mounts.some(m=>m.vol===n));if(u){out.push(...E(`Error response from daemon: remove ${n}: volume is in use - [${u.id}]`).out);code=1;continue}delete V[n];out.push(O(n))}return {out,code}}
  if(sub==='inspect'){const n=a[0];if(!V[n])return E(`Error response from daemon: get ${n||''}: no such volume`);return R(JSON.stringify([{CreatedAt:new Date(V[n].created).toISOString(),Driver:'local',Mountpoint:`/var/lib/docker/volumes/${n}/_data`,Name:n,Scope:'local'}],null,4))}
  if(sub==='prune'){const gone=Object.keys(V).filter(n=>!D().containers.some(c=>c.mounts.some(m=>m.vol===n)));gone.forEach(n=>delete V[n]);return R(['Deleted Volumes:',...gone,'',`Total reclaimed space: 0B`])}
  return R(['Usage:  docker volume COMMAND','','Commands:','  create      Create a volume','  inspect     Show details of a volume','  ls          List volumes','  rm          Remove a volume'])}
const STEP=['FROM','RUN','COPY','ADD','WORKDIR'];
const DOPS=['FROM','RUN','CMD','COPY','ADD','WORKDIR','EXPOSE','ENV','ENTRYPOINT','ARG','LABEL','USER','VOLUME','HEALTHCHECK','STOPSIGNAL','SHELL'];
function dBuild(args,quiet){let tag=null,file='Dockerfile',ctx=null,noc=false;
  for(let i=0;i<args.length;i++){const a=args[i];if(a==='-t'||a==='--tag')tag=args[++i];else if(a.startsWith('--tag='))tag=a.slice(6);else if(a==='-f'||a==='--file')file=args[++i];else if(a==='--no-cache')noc=true;else if(!a.startsWith('-'))ctx=a}
  if(!ctx)return E(`ERROR: "docker buildx build" requires exactly 1 argument.\nSee 'docker buildx build --help'.`,'Tip: the dot at the end means "use this folder": docker build -t shop:1.0 .');
  if(ctx!=='.'&&ctx!=='./')return E(`ERROR: unable to prepare context: path "${ctx}" not found`,'Tip: everything is in this folder, so the context is a single dot.');
  const src=S.files[file];if(src==null)return E(`ERROR: failed to solve: failed to read dockerfile: open ${file}: no such file or directory`);
  const ins=[];src.replace(/\\\n/g,' ').split('\n').forEach((l,n)=>{const t=l.trim();if(!t||t.startsWith('#'))return;const m=t.match(/^(\S+)\s*(.*)$/);ins.push({op:m[1].toUpperCase(),arg:m[2],n:n+1})});
  if(!ins.length)return E('ERROR: failed to solve: the Dockerfile cannot be empty');
  for(const x of ins)if(!DOPS.includes(x.op))return E(`ERROR: failed to solve: dockerfile parse error on line ${x.n}: unknown instruction: ${x.op}`);
  if(ins[0].op!=='FROM')return E('ERROR: failed to solve: no build stage in current context','Tip: every Dockerfile starts with FROM, the base image to build on.');
  const b=ref(ins[0].arg.split(/\s+/)[0]);let base=D().images[b.key];
  if(!base&&!hubOk(b))return E(`ERROR: failed to solve: ${b.raw}: failed to resolve source metadata for docker.io/library/${b.key}: docker.io/library/${b.key}: not found`);
  const baseInfo=base||Object.assign({key:b.key},HUB[b.name],{fs:{}});
  const nsteps=ins.filter(x=>STEP.includes(x.op)).length;let k='base:'+b.key,idx=0,wd='/',cmd=null,port=baseInfo.port,env={},added=0;const fs=Object.assign({},baseInfo.fs||{});
  const lines=[O(`[+] Building ${(1+Math.random()*3).toFixed(1)}s (${nsteps+5}/${nsteps+5}) FINISHED`,'dim'),O(' => [internal] load build definition from '+file,'dim'),O(' => [internal] load metadata for docker.io/library/'+b.key,'dim'),O(' => [internal] load .dockerignore','dim'),O(' => [internal] load build context','dim')];
  const layers=[];
  for(const x of ins){if(STEP.includes(x.op)){idx++;let extra='';
      if(x.op==='COPY'||x.op==='ADD'){const parts=x.arg.split(/\s+/).filter(p=>!p.startsWith('--'));const dest=parts.pop()||'.';const srcs=parts;if(!srcs.length)return E(`ERROR: failed to solve: dockerfile parse error on line ${x.n}: COPY requires at least two arguments`);
        let destAbs=dest.startsWith('/')?dest:(wd==='/'?'':wd)+'/'+dest;const destDir=dest.endsWith('/')||dest==='.'||dest==='./'||srcs.length>1||srcs[0]==='.';
        const files=[];for(const s of srcs){if(s==='.'||s==='./'){Object.keys(S.files).forEach(f=>files.push(f))}else if(S.files[s]==null)return E(`ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref: "/${s}": not found`,`Tip: there is no file called ${s} in this folder. Check ls.`);else files.push(s)}
        for(const f of files){const p=destDir?vfs({fs:{}}).norm(destAbs+'/'+f):vfs({fs:{}}).norm(destAbs);fs[p]=S.files[f];extra+=f+'='+S.files[f]+';';added+=S.files[f].length}
      }
      if(x.op==='WORKDIR')wd=x.arg.startsWith('/')?x.arg:(wd==='/'?'':wd)+'/'+x.arg;
      k=hhex(k+'|'+x.op+' '+x.arg+'|'+extra,16);const cached=!noc&&S.d.cache[k];S.d.cache[k]=1;
      lines.push(O(` => ${cached?'CACHED ':''}[${idx}/${nsteps}] ${x.op==='FROM'?'FROM docker.io/library/'+b.key:x.op+' '+x.arg}`,cached?'dim':''));
      if(!cached&&x.op==='RUN'&&/npm (install|ci)/.test(x.arg))lines.push(O(' => => # added 10 packages, and audited 11 packages in 2s','dim'));
      if(!cached&&x.op==='RUN'&&/pip install/.test(x.arg))lines.push(O(' => => # Successfully installed flask-3.0.3','dim'));
      if(x.op!=='FROM')layers.unshift([x.op+' '+x.arg+' # buildkit',x.op==='RUN'?(/npm|pip/.test(x.arg)?'1.31MB':'4.1kB'):x.op==='WORKDIR'?'0B':fmtSize(Math.max(40,extra.length))])}
    else{if(x.op==='CMD'||x.op==='ENTRYPOINT'){try{cmd=JSON.parse(x.arg)}catch(e){cmd=x.arg.split(/\s+/)}}if(x.op==='EXPOSE')port=parseInt(x.arg);if(x.op==='ENV'){const m=x.arg.match(/^(\S+?)[= ](.*)$/);if(m)env[m[1]]=m[2]}
      layers.unshift([x.op+' '+x.arg,'0B'])}}
  const id=hhex(k+(tag||''),12);
  lines.push(O(' => exporting to image','dim'),O(' => => exporting layers','dim'),O(' => => writing image sha256:'+id+hhex(id,52),'dim'));
  const r=tag?ref(tag):{name:'<none>',tag:'<none>',key:'<none>:'+id};if(tag)lines.push(O(` => => naming to docker.io/library/${r.key}`));
  let kind=baseInfo.kind;const runtime=baseInfo.runtime;if(cmd&&cmd.some(c=>/node|python/.test(c)))kind='app';
  const layersAll=layers.map(l=>[l[0],l[1],0,now()]).concat((baseInfo.layers||[]).map(l=>[l[0],l[1],0,now()-86400e3*20]));
  D().images[r.key]={name:r.name,tag:r.tag,key:r.key,id,size:fmtSize(sizeNum(baseInfo.size)+(/npm|pip/.test(src)?1.31e6:0)+added),created:now(),kind,port,os:baseInfo.os,shell:baseInfo.shell,runtime,layers:layersAll,ver:r.tag,fs,built:1,cmd};
  if(quiet)return {out:[],code:0};
  if(!tag)lines.push(O('(No -t given, so the image has no name. Add -t name:tag to label it.)','sys'));
  return {out:lines,code:0}}
function dTag(args){const [a,b]=args;if(!a||!b)return E('"docker tag" requires exactly 2 arguments.','Tip: docker tag SOURCE NEW_NAME, for example docker tag shop:2.0 yourname/shop:2.0');const img=findImg(a);if(!img)return E(`Error response from daemon: No such image: ${ref(a).key}`);
  const r=ref(b);D().images[r.key]=Object.assign({},img,{name:r.name,tag:r.tag,key:r.key});return R([])}
function dPush(args){const n=args.find(a=>!a.startsWith('-'));if(!n)return E('"docker push" requires exactly 1 argument.');const r=ref(n);const img=D().images[r.key];
  if(!img)return E(`An image does not exist locally with the tag: ${r.name}`);
  if(!r.name.includes('/'))return E(`denied: requested access to the resource is denied`,`Tip: on Docker Hub, images live under your account name. Tag it first: docker tag ${r.key} yourname/${r.key}`);
  if(!D().login)return E(`denied: requested access to the resource is denied`,'Tip: log in first with docker login');
  return R([`The push refers to repository [docker.io/${r.name}]`,...img.layers.filter(l=>l[1]!=='0B').slice(0,4).map((l,i)=>`${hhex(r.key+i,12)}: Pushed`),`${r.tag}: digest: sha256:${hhex(r.key+'p',64)} size: 1574`,O('(Pretend push: nothing actually left your machine.)','sys')])}
function dPrune(){const gone=D().containers.filter(c=>c.status!=='running');D().containers=D().containers.filter(c=>c.status==='running');return R(['Deleted Containers:',...gone.map(c=>c.id),'','Total reclaimed space: 0B',O('(A real prune asks "Are you sure? [y/N]" first. The playground answers yes for you.)','sys')])}

/* ---------- docker compose ---------- */
function composeSpec(){const src=S.files['compose.yaml'];if(src==null)return {err:'no configuration file provided: not found'};
  try{const y=parseYaml(src)[0]||{};if(!y.services||typeof y.services!=='object')return {err:'validating compose.yaml: services must be a mapping'};return {y}}catch(e){return {err:`yaml: ${e.message}: could not read compose.yaml (check the indentation)`}}}
const PROJ='shop';
function cUp(args){const sp=composeSpec();if(sp.err)return E(sp.err);const y=sp.y;const out=[];const st=[];
  const net=PROJ+'_default';if(!D().networks[net]){D().networks[net]={id:hhex(net+now(),12),driver:'bridge',sub:'172.'+(D().subn++)+'.0',n:1,created:now()};st.push(['Network '+net,'Created'])}
  for(const v of Object.keys(y.volumes||{})){const vn=PROJ+'_'+v;if(!D().volumes[vn]){D().volumes[vn]={files:{},created:now()};st.push([`Volume "${vn}"`,'Created'])}}
  const names=Object.keys(y.services);const order=[];const visit=n=>{if(order.includes(n))return;const dep=y.services[n]&&y.services[n].depends_on;(Array.isArray(dep)?dep:Object.keys(dep||{})).forEach(visit);order.push(n)};names.forEach(visit);
  for(const sn of order){const s=y.services[sn]||{};const cname=`${PROJ}-${sn}-1`;const ex=findC(cname);
    if(ex&&ex.name===cname&&ex.status==='running'){st.push(['Container '+cname,'Running']);continue}
    if(ex&&ex.name===cname)D().containers=D().containers.filter(c=>c!==ex);
    let imgName=s.image||`${PROJ}-${sn}`;let img=D().images[ref(imgName).key];
    if(s.build&&!img){const r=dBuild(['-t',imgName,'.'],true);if(r.code)return {out:out.concat(r.out),code:1};img=D().images[ref(imgName).key];out.push(O(`[+] Building ${sn}: image ${ref(imgName).key} built from the Dockerfile`,'dim'))}
    if(!img){const o2=[];img=ensureImage(imgName,o2);if(!img)return pullMissing(ref(imgName));out.push(O(` ${sn} Pulled`,'dim'))}
    const ports=(s.ports||[]).map(p=>{const m=String(p).match(/^(\d+):(\d+)/);return m?[+m[1],+m[2]]:null}).filter(Boolean);
    const env=Array.isArray(s.environment)?Object.fromEntries(s.environment.map(x=>{const i=String(x).indexOf('=');return [x.slice(0,i),x.slice(i+1)]})):Object.assign({},s.environment||{});
    Object.keys(env).forEach(k=>env[k]=String(env[k]??''));
    const mounts=(s.volumes||[]).map(v=>{const [a,b]=String(v).split(':');return /^[./]/.test(a)?{type:'bind',src:a,path:b}:{type:'volume',vol:PROJ+'_'+a,path:b}});
    mounts.forEach(m=>{if(m.type==='volume'&&!D().volumes[m.vol])D().volumes[m.vol]={files:{},created:now()}});
    const c=newC({name:cname,image:ref(imgName).key,img,ports,env,mounts,net,alias:sn,project:PROJ});const r=startC(c);
    if(r.err){out.push(...E(r.err.replace('docker: ','Error response from daemon: ')).out);return {out,code:1}}
    st.push(['Container '+cname,'Started'])}
  const w=Math.max(...st.map(x=>x[0].length))+2;out.push(O(`[+] Running ${st.length}/${st.length}`));st.forEach(([a,b])=>out.push(O(` ✔ ${pad(a,w)}${b}`,'okl')));
  if(!args.includes('-d')&&!args.includes('--detach'))out.push(O('(Without -d, Compose would stay attached and stream logs. The playground detached for you.)','sys'));
  return {out,code:0}}
function cDown(args){const cs=D().containers.filter(c=>c.project===PROJ);const out=[];const st=[];
  cs.forEach(c=>{if(c.status==='running')stopC(c,0);st.push(['Container '+c.name,'Removed'])});D().containers=D().containers.filter(c=>c.project!==PROJ);
  if(D().networks[PROJ+'_default']){delete D().networks[PROJ+'_default'];st.push(['Network '+PROJ+'_default','Removed'])}
  if(args.includes('-v')||args.includes('--volumes'))Object.keys(D().volumes).filter(v=>v.startsWith(PROJ+'_')).forEach(v=>{delete D().volumes[v];st.push(['Volume '+v,'Removed'])});
  if(!st.length)return R([O('(Nothing from this project is running.)','sys')]);
  const w=Math.max(...st.map(x=>x[0].length))+2;out.push(O(`[+] Running ${st.length}/${st.length}`));st.forEach(([a,b])=>out.push(O(` ✔ ${pad(a,w)}${b}`,'okl')));S.flag.composeDown=1;return {out,code:0}}
function cPs(){const cs=D().containers.filter(c=>c.project===PROJ&&c.status==='running');
  return {out:TB([['NAME','IMAGE','COMMAND','SERVICE','CREATED','STATUS','PORTS']].concat(cs.map(c=>[c.name,c.image,cmdLabel(c),c.alias,ago(c.created)+' ago',statusText(c),portsText(c)]))),code:0}}
function cLogs(args){const sv=args.filter(a=>!a.startsWith('-'));const cs=D().containers.filter(c=>c.project===PROJ&&(!sv.length||sv.includes(c.alias)));if(!cs.length)return E(sv.length?`no such service: ${sv[0]}`:'(no containers)');
  const w=Math.max(...cs.map(c=>(c.alias+'-1').length));const out=[];cs.forEach(c=>c.logs.forEach(l=>out.push(O(pad(c.alias+'-1',w)+'  | '+l))));return {out,code:0}}
function dCompose(args){const [sub,...a]=args;
  if(sub==='up')return cUp(a);if(sub==='down')return cDown(a);if(sub==='ps')return cPs(a);if(sub==='logs')return cLogs(a);
  if(sub==='build'){const sp=composeSpec();if(sp.err)return E(sp.err);const s=Object.entries(sp.y.services).find(([n,x])=>x&&x.build);if(!s)return R('(no service has a build: section)');return dBuild(['-t',s[1].image||PROJ+'-'+s[0],'.'])}
  if(sub==='stop'){D().containers.filter(c=>c.project===PROJ&&c.status==='running').forEach(c=>stopC(c,0));return R(' ✔ stopped')}
  if(sub==='config'){const sp=composeSpec();if(sp.err)return E(sp.err);return R(S.files['compose.yaml'])}
  return R(['Usage:  docker compose COMMAND','','Commands:','  up        Create and start the services (add -d for background)','  ps        List the running services','  logs      Show service logs','  down      Stop and remove containers and networks','  build     Build the images'])}
function dHelp(){return R(['Usage:  docker [OPTIONS] COMMAND','','Common commands:','  run         Create and run a new container from an image','  exec        Execute a command in a running container','  ps          List containers','  build       Build an image from a Dockerfile','  pull        Download an image from a registry','  push        Upload an image to a registry','  images      List images','  login       Log in to a registry','  version     Show the Docker version information','','Management commands:','  compose     Docker Compose','  network     Manage networks','  volume      Manage volumes','','Commands:','  history  inspect  logs  rm  rmi  start  stop  restart  tag'])}
function docker(args){const [sub,...a]=args;
  switch(sub){
  case undefined:case '--help':case 'help':return dHelp();
  case 'version':return R(['Client:',' Version:           27.3.1',' API version:       1.47',' OS/Arch:           linux/amd64','','Server: Docker Engine - Community',' Engine:','  Version:          27.3.1','  API version:      1.47 (minimum version 1.24)',' containerd:','  Version:          1.7.22']);
  case '--version':case '-v':return R('Docker version 27.3.1, build ce12230');
  case 'info':return R(['Client:',' Context:    default','','Server:',` Containers: ${D().containers.length}`,`  Running: ${D().containers.filter(c=>c.status==='running').length}`,`  Stopped: ${D().containers.filter(c=>c.status!=='running').length}`,` Images: ${Object.keys(D().images).length}`,' Server Version: 27.3.1',' Storage Driver: overlay2',' Operating System: Docker Desktop']);
  case 'run':return dRun(a);
  case 'ps':return dPs(a);
  case 'images':return dImages(a);
  case 'pull':return dPull(a);
  case 'rmi':return dRmi(a);
  case 'history':return dHistory(a);
  case 'logs':return dLogs(a);
  case 'stop':case 'start':case 'restart':case 'kill':return dStop(a,sub);
  case 'rm':return dRm(a);
  case 'exec':return dExec(a);
  case 'inspect':return dInspect(a);
  case 'network':return dNetwork(a);
  case 'volume':return dVolume(a);
  case 'build':return dBuild(a);
  case 'tag':return dTag(a);
  case 'push':return dPush(a);
  case 'login':D().login=true;return R(['Login Succeeded',O('(Pretend login: no password needed in the playground. For real, use docker login and your Docker Hub account.)','sys')]);
  case 'logout':D().login=false;return R('Removing login credentials for https://index.docker.io/v1/');
  case 'compose':return dCompose(a);
  case 'container':{const [s2,...b]=a;if(s2==='ls'||s2==='list')return dPs(b);if(s2==='prune')return dPrune();if(['run','start','stop','rm','logs','exec','inspect','restart','kill'].includes(s2))return docker([s2,...b]);break}
  case 'image':{const [s2,...b]=a;if(s2==='ls'||s2==='list')return dImages(b);if(s2==='rm')return dRmi(b);if(['pull','push','history','inspect','build','tag'].includes(s2))return docker([s2,...b]);if(s2==='prune')return R(['Total reclaimed space: 0B']);break}
  case 'system':if(a[0]==='prune')return dPrune();if(a[0]==='df')return R(table([['TYPE','TOTAL','ACTIVE'],['Images',Object.keys(D().images).length,new Set(D().containers.map(c=>c.imgKey)).size],['Containers',D().containers.length,D().containers.filter(c=>c.status==='running').length],['Local Volumes',Object.keys(D().volumes).length,0]]));break;
  case 'buildx':if(a[0]==='build')return dBuild(a.slice(1));break;
  }
  return E(`docker: '${sub}' is not a docker command.\nSee 'docker --help'`)}
Object.assign(HQ,{O,R,E,TB,D,baseFs,SHELLS,startLogs,portUsed,vfs,serve,listens,boxExec,stopC,pullRedir,docker});
})(window.HQ = window.HQ || {});
