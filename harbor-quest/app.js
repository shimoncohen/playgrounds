
(()=>{
'use strict';
const KEY='harbor-quest-v1';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let skew=0;const now=()=>Date.now()+skew;
const AL='bcdfghjklmnpqrstvwxz2456789';
const rnd=n=>{let s='';while(s.length<n)s+=AL[Math.random()*AL.length|0];return s};
const hex=n=>{let s='';while(s.length<n)s+='0123456789abcdef'[Math.random()*16|0];return s};
function hsh(str,n,al=AL){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0}let s='';while(s.length<n){h^=h>>>15;h=Math.imul(h,0x2c1b3c6d)>>>0;h^=h>>>12;h=Math.imul(h,0x297a2d39)>>>0;h^=h>>>15;h=(h+0x9e3779b9)>>>0;s+=al[h%al.length]}return s}
const hhex=(s,n)=>hsh(s,n,'0123456789abcdef');
const pad=(s,n)=>String(s)+' '.repeat(Math.max(0,n-String(s).length));
function table(rows,gap=3){const w=[];rows.forEach(r=>r.forEach((c,i)=>w[i]=Math.max(w[i]||0,String(c).length)));return rows.map(r=>r.map((c,i)=>i<r.length-1?pad(c,w[i]+gap):String(c)).join('').replace(/\s+$/,''))}
function secs(t){return Math.max(0,Math.round((now()-t)/1000))}
function age(t){const s=secs(t);if(s<120)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m';const h=Math.floor(m/60);if(h<48)return h+'h';return Math.floor(h/24)+'d'}
function ago(t){const s=Math.max(1,secs(t));if(s<60)return s+(s===1?' second':' seconds');const m=Math.floor(s/60);if(m<60)return (m===1?'About a minute':m+' minutes');const h=Math.floor(m/60);if(h<48)return (h===1?'About an hour':h+' hours');return Math.floor(h/24)+' days'}
const p2=n=>String(n).padStart(2,'0');
function stamp(){const d=new Date(now());return `${d.getFullYear()}/${p2(d.getMonth()+1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`}
function clf(){const d=new Date(now());const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `${p2(d.getUTCDate())}/${M[d.getUTCMonth()]}/${d.getUTCFullYear()}:${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} +0000`}
function sizeNum(s){const m=String(s).match(/([\d.]+)\s*(B|kB|MB|GB)/);if(!m)return 0;return +m[1]*({B:1,kB:1e3,MB:1e6,GB:1e9}[m[2]])}
function fmtSize(n){if(n<1e3)return Math.round(n)+'B';if(n<1e6)return (n/1e3).toFixed(1)+'kB';if(n<1e9)return (n/1e6).toFixed(n<1e7?2:1).replace(/\.0+$/,'')+'MB';return (n/1e9).toFixed(2)+'GB'}

/* ---------- the pretend Docker Hub ---------- */
const DEB='# debian.sh --arch amd64 bookworm';
const HUB={
 'hello-world':{tags:['latest'],size:'13.3kB',kind:'hello',layers:[['CMD ["/hello"]','0B'],['COPY hello / # buildkit','13.3kB']]},
 nginx:{tags:['latest','1.27','1.26','1.25','alpine'],size:'192MB',kind:'web',port:80,ver:{latest:'1.27.2','1.27':'1.27.2','1.26':'1.26.2','1.25':'1.25.5',alpine:'1.27.2'},
  layers:[['CMD ["nginx" "-g" "daemon off;"]','0B'],['STOPSIGNAL SIGQUIT','0B'],['EXPOSE map[80/tcp:{}]','0B'],['ENTRYPOINT ["/docker-entrypoint.sh"]','0B'],['COPY docker-entrypoint.sh / # buildkit','1.62kB'],['RUN /bin/sh -c set -x && apt-get install nginx … # buildkit','118MB'],['ENV NGINX_VERSION=1.27.2','0B'],[DEB,'74.8MB']]},
 httpd:{tags:['latest','2.4'],size:'148MB',kind:'httpd',port:80,layers:[['CMD ["httpd-foreground"]','0B'],['EXPOSE map[80/tcp:{}]','0B'],['RUN /bin/sh -c set -eux; apt-get install … # buildkit','66.1MB'],['ENV HTTPD_VERSION=2.4.62','0B'],[DEB,'74.8MB']]},
 alpine:{tags:['latest','3.20'],size:'7.8MB',kind:'os',os:'Alpine Linux v3.20',shell:'sh',layers:[['CMD ["/bin/sh"]','0B'],['ADD alpine-minirootfs-3.20.3-x86_64.tar.gz / # buildkit','7.8MB']]},
 busybox:{tags:['latest'],size:'4.27MB',kind:'os',os:'BusyBox v1.36.1',shell:'sh',layers:[['CMD ["sh"]','0B'],['ADD busybox.tar.xz / # buildkit','4.27MB']]},
 ubuntu:{tags:['latest','24.04','22.04'],size:'78.1MB',kind:'os',os:'Ubuntu 24.04.1 LTS',shell:'bash',layers:[['CMD ["/bin/bash"]','0B'],['ADD file:ubuntu-noble-rootfs in / ','78.1MB']]},
 redis:{tags:['latest','7'],size:'117MB',kind:'redis',port:6379,layers:[['CMD ["redis-server"]','0B'],['EXPOSE map[6379/tcp:{}]','0B'],['WORKDIR /data','0B'],['VOLUME [/data]','0B'],['RUN /bin/sh -c set -eux; make install … # buildkit','42.2MB'],[DEB,'74.8MB']]},
 postgres:{tags:['latest','16','17'],size:'435MB',kind:'pg',port:5432,layers:[['CMD ["postgres"]','0B'],['EXPOSE map[5432/tcp:{}]','0B'],['ENTRYPOINT ["docker-entrypoint.sh"]','0B'],['VOLUME [/var/lib/postgresql/data]','0B'],['RUN /bin/sh -c set -ex; apt-get install postgresql … # buildkit','360MB'],[DEB,'74.8MB']]},
 node:{tags:['20-alpine','22-alpine','20','latest'],size:'135MB',kind:'os',os:'Alpine Linux v3.20',shell:'sh',runtime:'node',layers:[['CMD ["node"]','0B'],['ENTRYPOINT ["docker-entrypoint.sh"]','0B'],['RUN /bin/sh -c addgroup -g 1000 node && … # buildkit','127MB'],['ENV NODE_VERSION=20.18.0','0B'],['ADD alpine-minirootfs-3.20.3-x86_64.tar.gz / # buildkit','7.8MB']]},
 python:{tags:['3.12-slim','3.12','latest'],size:'130MB',kind:'os',os:'Debian GNU/Linux 12 (bookworm)',shell:'bash',runtime:'python',layers:[['CMD ["python3"]','0B'],['RUN /bin/sh -c set -eux; install python … # buildkit','55.2MB'],['ENV PYTHON_VERSION=3.12.7','0B'],[DEB,'74.8MB']]},
};
function ref(s){s=String(s||'').replace(/^docker\.io\/(library\/)?/,'');let name=s,tag='latest';const i=s.lastIndexOf(':');if(i>0&&!s.slice(i).includes('/')){name=s.slice(0,i);tag=s.slice(i+1)}return {name,tag,key:name+':'+tag,raw:s}}
const hubOk=r=>{const h=HUB[r.name];return !!(h&&h.tags.includes(r.tag))};
const verOf=key=>{const r=ref(key),h=HUB[r.name];return (h&&h.ver&&h.ver[r.tag])||r.tag};

/* ---------- project files ---------- */
const MSG0='Fresh coffee beans, roasted daily.';
const FILES={
'README.md':`# The harbor shop

This folder is your workspace. Over the quest you will:
  1. run other people's images (nginx, redis, alpine)
  2. package this shop app into your own image
  3. start the shop and its database together with Compose
  4. ship it all to a Kubernetes cluster

Type help to see the commands this playground understands.`,
'Dockerfile':`# Start from a small official Node.js image
FROM node:20-alpine

# Work inside /app in the image
WORKDIR /app

# Copy the dependency list first. It changes rarely, so this layer caches well.
COPY package.json .
RUN npm install

# Now copy the app code and the message
COPY app.js message.txt ./

# Document the port the app listens on, and say how to start it
EXPOSE 3000
CMD ["node", "app.js"]`,
'app.js':`const http = require('http');
const fs = require('fs');

const message = fs.readFileSync('message.txt', 'utf8').trim();

http.createServer((req, res) => {
  // When REDIS_HOST is set, the real app also counts visits in Redis.
  res.end('Hello from the shop! ' + message + '\\n');
}).listen(3000, () => console.log('Shop listening on port 3000'));`,
'package.json':`{
  "name": "shop",
  "version": "1.0.0",
  "main": "app.js",
  "dependencies": {
    "redis": "^4.7.0"
  }
}`,
'message.txt':MSG0,
'compose.yaml':`# Two services that start together with one command
services:
  web:
    build: .              # build the image from the Dockerfile here
    image: shop:compose
    ports:
      - "4000:3000"       # laptop port : container port
    environment:
      REDIS_HOST: cache   # reach the other service by its name
    depends_on:
      - cache
  cache:
    image: redis:7
    volumes:
      - cache-data:/data  # keep the visit counter on a volume

volumes:
  cache-data:`,
'shop.yaml':`# Three Kubernetes objects in one file, separated by ---
apiVersion: v1
kind: ConfigMap
metadata:
  name: shop-config
  namespace: shop
data:
  GREETING: "Welcome to the harbor shop"
  CURRENCY: "EUR"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: shop
  template:
    metadata:
      labels:
        app: shop
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          envFrom:
            - configMapRef:
                name: shop-config
---
apiVersion: v1
kind: Service
metadata:
  name: shop
  namespace: shop
spec:
  type: ClusterIP
  selector:
    app: shop
  ports:
    - port: 80
      targetPort: 80`
};

/* ---------- tiny YAML reader (enough for compose files and manifests) ---------- */
function parseYaml(src){
  return String(src).split(/^---\s*$/m).map((d,di)=>{
    const lines=[];d.split('\n').forEach((l,n)=>{const t=l.replace(/(^|\s)#.*$/,'');if(t.trim())lines.push({ind:t.match(/^ */)[0].length,t:t.trim(),n})});
    if(!lines.length)return null;let i=0;
    const scalar=v=>{v=v.trim();if(/^".*"$|^'.*'$/.test(v))return v.slice(1,-1);if(/^-?\d+$/.test(v))return +v;if(v==='true')return true;if(v==='false')return false;if(v==='null'||v==='~')return null;
      if(/^\[.*\]$/.test(v)){const inner=v.slice(1,-1).trim();return inner?inner.split(',').map(scalar):[]}if(v==='{}')return {};return v};
    const isItem=t=>t==='-'||t.startsWith('- ');
    function block(ind){
      if(i>=lines.length)return null;
      if(isItem(lines[i].t)){const arr=[];
        while(i<lines.length&&lines[i].ind===ind&&isItem(lines[i].t)){const rest=lines[i].t.slice(1).trim();
          if(!rest){i++;arr.push(i<lines.length&&lines[i].ind>ind?block(lines[i].ind):null)}
          else if(/^[\w.\-\/]+:(\s|$)/.test(rest)){lines[i]={ind:ind+2,t:rest,n:lines[i].n};arr.push(block(ind+2))}
          else{arr.push(scalar(rest));i++}}
        if(i<lines.length&&lines[i].ind>ind)throw new Error('line '+(lines[i].n+1));
        return arr}
      const obj={};
      while(i<lines.length&&lines[i].ind===ind&&!isItem(lines[i].t)){
        const m=lines[i].t.match(/^([^:]+):(?:\s+(.*))?$/);if(!m)throw new Error('line '+(lines[i].n+1));i++;
        const k=m[1].trim().replace(/^["']|["']$/g,'');
        if(m[2]!=null&&m[2]!=='')obj[k]=scalar(m[2]);
        else if(i<lines.length&&(lines[i].ind>ind||(lines[i].ind===ind&&isItem(lines[i].t))))obj[k]=block(lines[i].ind);
        else obj[k]=null}
      if(i<lines.length&&lines[i].ind>ind)throw new Error('line '+(lines[i].n+1));
      return obj}
    const r=block(lines[0].ind);if(i<lines.length)throw new Error('line '+(lines[i].n+1));return r}).filter(Boolean)}

/* ---------- state ---------- */
const NODES=[{name:'harbor-control-plane',role:'control-plane',ip:'172.18.0.2'},{name:'harbor-worker',role:'<none>',ip:'172.18.0.3',sub:1},{name:'harbor-worker2',role:'<none>',ip:'172.18.0.4',sub:2}];
function sysPods(T){const b=T-26*60e3,cd=hsh('coredns',10),cp='harbor-control-plane';
  const mk=(name,node,ns='kube-system',ip)=>({name,ns,node,phase:'Running',born:b,t:b,ip:ip||'172.18.0.'+(node===cp?2:node==='harbor-worker'?3:4),labels:{},sys:1,restarts:0,image:'registry.k8s.io/'+name.split('-').slice(0,2).join('-'),logs:[]});
  return [mk(`coredns-${cd}-${hsh('a',5)}`,cp,'kube-system','10.244.0.2'),mk(`coredns-${cd}-${hsh('b',5)}`,cp,'kube-system','10.244.0.3'),mk('etcd-'+cp,cp),mk('kube-apiserver-'+cp,cp),mk('kube-controller-manager-'+cp,cp),mk('kube-scheduler-'+cp,cp),
   mk('kube-proxy-'+hsh('p0',5),cp),mk('kube-proxy-'+hsh('p1',5),'harbor-worker'),mk('kube-proxy-'+hsh('p2',5),'harbor-worker2'),mk('kindnet-'+hsh('n0',5),cp),mk('kindnet-'+hsh('n1',5),'harbor-worker'),mk('kindnet-'+hsh('n2',5),'harbor-worker2'),
   mk(`local-path-provisioner-${hsh('lp',10)}-${hsh('lq',5)}`,cp,'local-path-storage','10.244.0.4')]}
function fresh(){const T=now(),b=T-26*60e3;return {v:1,xp:0,ch:0,mi:0,done:{},badges:{},hist:[],best:0,puz:{},flag:{},view:'auto',files:{},inside:null,
  d:{images:{},containers:[],volumes:{},networks:{bridge:{id:hhex('bridge',12),driver:'bridge',sub:'172.17.0',n:1,builtin:1},host:{id:hhex('host',12),driver:'host',builtin:1},none:{id:hhex('none',12),driver:'null',builtin:1}},cache:{},login:false,subn:18},
  k:{pods:sysPods(T),deps:{},svcs:{'default/kubernetes':{name:'kubernetes',ns:'default',type:'ClusterIP',ip:'10.96.0.1',port:443,tport:6443,sys:1,selector:null,born:b}},cms:{},
    nss:{default:b,'kube-node-lease':b,'kube-public':b,'kube-system':b,'local-path-storage':b},fwd:{},events:[],ipc:{1:1,2:1}}}}
let S=fresh();
try{const raw=localStorage.getItem(KEY);if(raw){const o=JSON.parse(raw);if(o&&o.v===1&&o.d&&o.k)S=Object.assign(fresh(),o)}}catch(e){}
let saveT=null;
function save(){try{S.hist=S.hist.slice(-200);localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
function saveSoon(){clearTimeout(saveT);saveT=setTimeout(save,400)}

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
let HIT=null; /* id of the box that answered the last request, for the live view flash */
function boxKind(b){return b.kind||(D().images[b.imgKey]||{}).kind}
function resolveFrom(box,host){host=host.replace(/^https?:\/\//,'').split('/')[0];const [h,pt]=host.split(':');const port=pt?+pt:null;
  if(box.isPod)return k8sResolve(box,h,port);
  if(h==='localhost'||h==='127.0.0.1')return {box,port};
  if(!box.net||box.net==='bridge'||box.net==='host'||box.net==='none')return null;
  const t=D().containers.find(c=>c.status==='running'&&c.net===box.net&&(c.name===h||c.alias===h||c.ip===h));return t?{box:t,port}:null}
function serve(target,path='/'){const kind=boxKind(target);HIT=target.id||target.name;
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
const autoName=()=>pickA(['brave','calm','eager','jolly','keen','proud','quirky','zen','happy','gentle'])+'_'+pickA(['turing','hopper','lovelace','curie','tesla','noether','ritchie','torvalds','hamilton','shannon']);
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
    else if(p.phase==='Terminating'&&dt>1400){K().pods=K().pods.filter(x=>x!==p);if(S.inside&&S.inside.id===p.name){S.inside=null;insideLost=true}ch=true}}
  if(T-lastRec>600){lastRec=T;for(const d of Object.values(K().deps))if(reconcile(d))ch=true}
  if(ch){onTick();saveSoon()}}
let insideLost=false;
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
let pendingEdit=null;
function hostCmd(argv,redir){const [c,...a]=argv;
  switch(c){
  case 'docker':return docker(a);
  case 'kubectl':case 'k':return kubectl(a);
  case 'help':return R([O('Commands this playground understands:','hd'),'  docker ...       run and manage containers, images, networks, volumes, compose','  kubectl ...      talk to the Kubernetes cluster (k is a shortcut)','  curl URL         make a web request, for example curl localhost:8080','  ls, cat FILE     look at the files in this folder','  edit FILE        open a file in the editor (also nano, vim)','  echo TEXT > FILE write a file','  clear            clear the screen (or Ctrl+L)','  history          show what you typed',O('Tip: press Tab to complete names, and ↑ to repeat a command.','tip')]);
  case 'clear':return {out:[{clear:1}],code:0};
  case 'ls':{const names=Object.keys(S.files).sort();if(a.includes('-l')||a.includes('-la')||a.includes('-al'))return R(names.map(n=>`-rw-r--r--  1 you  staff  ${String(S.files[n].length).padStart(5)}  ${n}`));return R([O(names.join('  '),'ls')])}
  case 'cat':{if(!a.length)return E('cat: which file? For example: cat Dockerfile');const out=[];let code=0;for(const n of a){if(S.files[n]==null){out.push(O(`cat: ${n}: No such file or directory`,'err'));code=1}else S.files[n].split('\n').forEach(l=>out.push(O(l,'file')))}return {out,code}}
  case 'echo':{const t=a.join(' ');if(redir){if(!redir.file)return E('bash: syntax error near unexpected token `newline\'');const old=S.files[redir.file];S.files[redir.file]=redir.append&&old!=null?old+'\n'+t:t;return R([])}return R(t)}
  case 'edit':case 'nano':case 'vim':case 'vi':case 'code':case 'open':{const n=a[0];if(!n)return E(`${c}: which file? For example: edit message.txt`);pendingEdit=n;return R([O(`(Opening ${n} in the editor…)`,'sys')])}
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

/* ---------- pictures for each chapter ---------- */
const bx=(t,s,c='')=>`<div class="pbox ${c}"><b>${t}</b>${s?`<small>${s}</small>`:''}</div>`;
const ar=(l='')=>`<div class="parr"><span aria-hidden="true">→</span>${l?`<small>${l}</small>`:''}</div>`;
const row=(...x)=>{const out=[];for(let i=0;i<x.length;i++){if(x[i].startsWith('<div class="parr"')&&i+1<x.length){out.push(`<div class="pseg">${x[i]}${x[i+1]}</div>`);i++}else out.push(x[i])}return `<div class="pflow">${out.join('')}</div>`};
const grp=(label,inner,c='')=>`<div class="pgrp ${c}"><span class="lbl">${label}</span>${inner}</div>`;
const fan=(...x)=>`<div class="pfan">${x.join('')}</div>`;
const cap=t=>`<p class="pcap">${t}</p>`;
const pic=(...x)=>`<div class="pic">${x.join('')}</div>`;
const pod=(c='g',t='pod')=>bx(t,'',c+' mini');
const dots=(o,n)=>`<span class="rdots">${'<i class="o"></i>'.repeat(o)}${'<i class="n"></i>'.repeat(n)}</span>`;
const PICS=[
 pic(row(bx('You','type a command','a'),ar(),bx('docker','the client'),ar('asks'),bx('Docker engine','does the work','t'),ar('pulls from'),bx('Docker Hub','a library of images')),
   row(bx('Image','a frozen package: an app plus everything it needs','v'),ar('docker run'),fan(bx('Container','a running copy','g'),bx('Container','another copy','g'))),
   cap('An image is a recipe card. A container is a dish cooked from it. One recipe, as many dishes as you like, and each dish is separate.')),
 pic(`<div class="pstack"><span class="pl" style="--i:3">COPY app.js ./ <small>your code</small></span><span class="pl" style="--i:2">RUN npm install <small>libraries</small></span><span class="pl" style="--i:1">WORKDIR /app</span><span class="pl" style="--i:0">node:20-alpine <small>base image, shared</small></span></div>`,
   `<div class="ptag"><span class="k-arg">nginx</span><span>:</span><span class="k-var">1.26</span><small>name : tag. The tag is usually a version. Leave it out and Docker uses <b>latest</b>.</small></div>`,
   cap('Images are stacks of read-only layers. Two images built on the same base share those layers on disk, so pulling the second one is fast.')),
 pic(row(bx('Created','made, not started'),ar('start'),bx('Running','its process is alive','g'),ar('stop'),bx('Exited','stopped, still on disk'),ar('rm'),bx('Removed','gone','dim')),
   row(grp('running container',row(bx('docker logs','read what it printed'),bx('docker exec','run a command inside','a')))),
   cap('docker run is create plus start in one go. A stopped container stays around (docker ps -a shows it) until you remove it.')),
 pic(grp('your laptop',row(bx('localhost:8080','a door on your laptop','a'),ar('-p 8080:80'),grp('container web',bx('port 80','nginx listens here','t')))),
   grp('network shopnet',row(bx('api','container','g'),ar('ping cache'),bx('cache','container','g'))),
   cap('A container is sealed off until you publish a port with -p HOST:CONTAINER. Containers on the same network you created can find each other by name.')),
 pic(row(grp('container',bx('writable layer','deleted with the container','dim')),ar('-v notes:/data'),bx('volume: notes','lives outside, survives','v')),
   row(bx('-e KEY=value','a setting handed in at start','a'),ar(),bx('the app reads it','like POSTGRES_PASSWORD','t')),
   cap('Treat containers as throwaway. Anything worth keeping goes in a volume. Anything that differs between laptop and server goes in an environment variable.')),
 pic(row(bx('Dockerfile','the recipe','a'),ar('docker build'),bx('Image shop:1.0','layers, ready to ship','v'),ar('docker run'),bx('Container','your app, running','g')),
   cap('Docker reuses a layer from cache when its instruction and inputs have not changed. Put things that change rarely (dependencies) above things that change often (your code).')),
 pic(row(bx('compose.yaml','the whole app in one file','a'),ar('docker compose up')),grp('project: shop',row(bx('web','shop-web-1','g'),ar('REDIS_HOST=cache'),bx('cache','shop-cache-1','g'),ar(),bx('cache-data','volume','v'))),
   cap('Compose creates a private network for the project, so services reach each other by their service name. One command starts it all; one command tears it down.')),
 pic(grp('control plane',row(bx('API server','the front door','a'),bx('scheduler','picks a node'),bx('controllers','fix differences'),bx('etcd','the memory'))),
   row(grp('worker node',row(pod(),pod())),grp('worker node',row(pod()))),
   cap('You never touch nodes directly. kubectl sends requests to the API server; the scheduler places pods on worker nodes; each pod wraps one or more containers.')),
 pic(row(bx('Deployment web','"3 copies of nginx:1.26"','a'),ar('owns'),bx('ReplicaSet','keeps the count','t'),ar('creates'),fan(pod(),pod(),pod())),
   cap('This is the control loop. Desired 3, actual 2? Create one. Desired 3, actual 4? Delete one. It never stops checking, which is why deleted pods come back.')),
 pic(row(bx('Service web','a fixed name and IP','a'),ar('selects app=web'),fan(pod('g','app=web'),pod('g','app=web'),pod('dim','app=db'))),
   row(bx('kubectl port-forward','a tunnel from your laptop','t'),ar('localhost:9090'),bx('the Service','then one pod','a')),
   cap('Pods come and go and get new IPs each time. A Service finds the current ones by label and spreads requests across them.')),
 pic(`<div class="roll"><div><span>start</span>${dots(3,0)}</div><div><span>add 1 new</span>${dots(3,1)}</div><div><span>remove 1 old</span>${dots(2,1)}</div><div><span>…repeat</span>${dots(1,2)}</div><div><span>done</span>${dots(0,3)}</div></div><p class="pcap"><i class="lego o"></i> old version <i class="lego n"></i> new version</p>`,
   cap('A rolling update swaps pods one at a time and only removes an old pod once a new one is ready. If the new version cannot start, the old pods keep serving.')),
 pic(row(bx('shop.yaml','the state you want, written down','a'),ar('kubectl apply'),bx('API server','stores it','t'),ar('controllers'),bx('the cluster','made to match','g')),
   cap('Imperative: you type each change. Declarative: you change the file and apply it again. Files can live in git, get reviewed, and be re-applied anywhere.')),
];

/* ---------- missions ---------- */
const NL=s=>s.trim().replace(/\s+/g,' ');
const has=(c,re)=>re.test(NL(c.line));
const C=n=>D().containers.find(x=>x.name===n);
const Crun=n=>{const x=C(n);return !!x&&x.status==='running'};
const Dep=(n,ns='default')=>K().deps[ns+'/'+n];
const Pods=(app,ns='default')=>K().pods.filter(p=>p.ns===ns&&appOf(p)===app&&live(p));
const Img=k=>!!D().images[k];
const inside=()=>insideBox();
function ensureFiles(names){let n=0;for(const f of names)if(S.files[f]==null){S.files[f]=FILES[f];n++}return n}
function ensureWebDep(img){let d=Dep('web');if(!d){newDep({name:'web',ns:'default',replicas:3,image:img||'nginx:1.26',cname:'nginx'});return 1}return 0}
const CH=[
{name:'Hello, Docker',badge:'First Contact',view:'docker',files:['README.md'],learned:['docker version','docker run','docker ps','docker ps -a','docker images'],missions:[
 {t:'Is Docker there?',i:'Docker runs as a background service on your computer called the engine. Its job is to run <b>containers</b>: programs running in their own little box, separate from the rest of your computer. The <code>docker</code> command is how you talk to it. First, check that both answer.',g:'Type <code>docker version</code>',a:[['docker','cmd'],['version','sub']],h:'Exactly as written: docker, a space, version.',ans:'docker version',ok:c=>has(c,/^docker (version|--version|-v)$/),after:'Two parts answered: the Client (the `docker` command you type) and the Server (the engine that runs containers).'},
 {t:'Your first container',i:'<b>hello-world</b> is a tiny program whose only job is to print a message. Programs come packed as <b>images</b> (a program plus everything it needs to run), and <code>docker run</code> starts a container from one. You don\'t have this image yet, so Docker will download it first.',g:'Run <code>docker run hello-world</code>',a:[['docker','cmd'],['run','sub'],['hello-world','img']],h:'docker run, then the image name: hello-world',ans:'docker run hello-world',ok:c=>D().containers.some(x=>x.imgKey==='hello-world:latest'),after:'Read the numbered steps it printed. That is the whole Docker workflow in four lines: client → engine → pull image → run container. (The output says "daemon", which is just another word for the engine. "Pull" means download, and Docker Hub is the public online shelf of images.)'},
 {t:'What is running?',i:'<code>docker ps</code> lists running containers. Before you look: hello-world printed its message and then stopped. What do you expect to see?',g:'Type <code>docker ps</code>',a:[['docker','cmd'],['ps','sub']],h:'ps is short for "process status".',ans:'docker ps',ok:c=>has(c,/^docker (ps|container ls|container list)$/),after:'Empty. A container lives only as long as the program it was started to run. hello-world finished its job, so the container stopped.'},
 {t:'See stopped ones too',i:'Stopped containers are not deleted. They wait on disk until you remove them. The <code>-a</code> option means <b>all</b>.',g:'Type <code>docker ps -a</code>',a:[['docker','cmd'],['ps','sub'],['-a','opt']],h:'Add -a after ps.',ans:'docker ps -a',ok:c=>has(c,/^docker (ps|container ls) (-a|--all)$/),after:'There it is, with STATUS "Exited (0)". Exit code 0 means it finished without errors. Docker also gave it a random two-word name.'},
 {t:'The image stays behind',i:'The download is kept as an <b>image</b> on your machine. Next time it starts instantly.',g:'Type <code>docker images</code>',a:[['docker','cmd'],['images','sub']],h:'docker images, plural.',ans:'docker images',ok:c=>has(c,/^docker (images|image ls|image list)$/),after:'Look at the size: hello-world is tiny. Most images are tens or hundreds of MB.'},
 {t:'One image, many containers',i:'Every <code>docker run</code> creates a brand-new container. Run hello-world again and compare. Watch the live view on the right.',g:'Run <code>docker run hello-world</code> once more, then <code>docker ps -a</code>',a:[['docker','cmd'],['run','sub'],['hello-world','img']],h:'Same command as before. Press ↑ to bring it back.',ans:'docker run hello-world',ok:c=>D().containers.filter(x=>x.imgKey==='hello-world:latest').length>=2,after:'No "Unable to find image" this time: the image was already here. And now there are two separate containers made from the same image.'},
]},
{name:'Images',badge:'Image Collector',view:'docker',learned:['docker pull','name:tag','docker history','docker rmi'],missions:[
 {t:'Download without running',i:'<code>docker pull</code> fetches an image and stops there. <b>nginx</b> is a popular web server (a program that hands out web pages). Images are built from pieces called layers, and you will see them download one by one.',g:'Type <code>docker pull nginx</code>',a:[['docker','cmd'],['pull','sub'],['nginx','img']],h:'docker pull nginx',ans:'docker pull nginx',ok:c=>Img('nginx:latest'),after:'"Using default tag: latest". A tag is a version name (more on that next); with none given, Docker picks the one called latest. Each "Pull complete" line was one layer.'},
 {t:'Pick a version',i:'A <b>tag</b> follows the colon and usually names a version. Pinning a version means everyone gets exactly the same thing.',g:'Pull version 1.26: <code>docker pull nginx:1.26</code>',a:[['docker','cmd'],['pull','sub'],['nginx','img'],[':1.26','val']],h:'No spaces around the colon: nginx:1.26',ans:'docker pull nginx:1.26',ok:c=>Img('nginx:1.26'),after:'In real projects, pin a tag. "latest" moves over time, and a surprise upgrade can break things.'},
 {t:'Compare what you have',i:'Now list your images. Spot the two nginx rows.',g:'Type <code>docker images</code>',a:[['docker','cmd'],['images','sub']],h:'docker images',ans:'docker images',ok:c=>has(c,/^docker (images|image ls|image list)$/)&&Img('nginx:latest')&&Img('nginx:1.26'),after:'Same REPOSITORY, different TAG and IMAGE ID: they are different images.'},
 {t:'Look at the layers',i:'An image is a stack of read-only layers, one per step used to make the image. <code>docker history</code> shows the stack, newest on top.',g:'Type <code>docker history nginx</code>',a:[['docker','cmd'],['history','sub'],['nginx','img']],h:'docker history nginx',ans:'docker history nginx',ok:c=>has(c,/^docker (image )?history \S*nginx/),after:'The bottom layer is a whole Debian Linux. Big layers come from installing software. Lines with 0B only record settings, not files.'},
 {t:'A tiny Linux',i:'<b>alpine</b> is a very small Linux image, popular as a base for other images.',g:'Pull it: <code>docker pull alpine</code>',a:[['docker','cmd'],['pull','sub'],['alpine','img']],h:'docker pull alpine',ans:'docker pull alpine',ok:c=>Img('alpine:latest'),after:'Run `docker images` and compare sizes: about 8MB for alpine against about 190MB for nginx.'},
 {t:'Clean up an image',i:'Images take disk space. <code>docker rmi</code> removes one (rmi = remove image). Remove the 1.26 one; you will pull it again later.',g:'Type <code>docker rmi nginx:1.26</code>',a:[['docker','cmd'],['rmi','sub'],['nginx:1.26','img']],h:'docker rmi nginx:1.26',ans:'docker rmi nginx:1.26',ok:c=>!Img('nginx:1.26')&&has(c,/^docker (rmi|image rm)/),after:'"Untagged" removes the name; "Deleted" frees the layers no other image uses.'},
]},
{name:'Containers',badge:'Captain of Containers',view:'docker',learned:['docker run -d --name','docker logs','docker exec -it','docker stop','docker start','docker rm -f'],missions:[
 {t:'Run a server in the background',i:'A web server is meant to keep running. <code>-d</code> (detached) starts it in the background and gives your prompt back. <code>--name</code> gives it a name you choose.',g:'Type <code>docker run -d --name web nginx</code>',a:[['docker','cmd'],['run','sub'],['-d','opt'],['--name web','opt'],['nginx','img']],h:'Options go before the image name.',ans:'docker run -d --name web nginx',ok:c=>Crun('web'),after:'The long code it printed is the container ID. Look at the live view: web is running (green light).'},
 {t:'Check on it',i:'List running containers again.',g:'Type <code>docker ps</code>',a:[['docker','cmd'],['ps','sub']],h:'docker ps',ans:'docker ps',ok:c=>has(c,/^docker (ps|container ls)/)&&Crun('web'),after:'STATUS says "Up …" and PORTS says 80/tcp: nginx listens on port 80, but only inside the container for now. A port is a numbered door on a program, and web servers wait at door 80.'},
 {t:'Read its logs',i:'Whatever the program inside prints goes to the container\'s log. This is your first stop when something goes wrong.',g:'Type <code>docker logs web</code>',a:[['docker','cmd'],['logs','sub'],['web','arg']],h:'docker logs, then the container name.',ans:'docker logs web',ok:c=>has(c,/^docker (container )?logs (-f )?web$/),after:'nginx reported it is ready. In a real terminal, `docker logs -f` keeps following new lines.'},
 {t:'Step inside',i:'<code>docker exec</code> runs a command inside a running container. A <b>shell</b> is a text prompt where you type commands, and <code>sh</code> is the simplest one. With <code>-it</code> and <code>sh</code> you get a shell in there.',g:'Type <code>docker exec -it web sh</code>',a:[['docker','cmd'],['exec','sub'],['-it','opt'],['web','arg'],['sh','arg']],h:'-i keeps input open, -t gives you a terminal. Together: -it',ans:'docker exec -it web sh',ok:c=>{const b=inside();return !!b&&b.name==='web'},after:'Your prompt changed. You are now in the container\'s own files, as root (the all-powerful admin user). Your laptop\'s files are not here.'},
 {t:'Find the web page',i:'nginx serves files from <code>/usr/share/nginx/html</code>. <code>cat</code> prints a file\'s text, so use it to look at the default page from inside.',g:'Type <code>cat /usr/share/nginx/html/index.html</code>',a:[['cat','cmd'],['/usr/share/nginx/html/index.html','arg']],h:'Use Tab to complete the path piece by piece.',ans:'cat /usr/share/nginx/html/index.html',ok:c=>{const b=inside();return !!b&&has(c,/^cat \S*index\.html$/)},after:'That is the page nginx sends to visitors. Try `ls /` too: `ls` lists the files in a folder, and `/` is the top one.'},
 {t:'Come back out',i:'Leave the container shell. Because you came in with exec, the container keeps running.',g:'Type <code>exit</code>',a:[['exit','cmd']],h:'Type exit.',ans:'exit',ok:c=>!S.inside&&has(c,/^exit$/)&&Crun('web'),after:'Back on your laptop, and web is still up.'},
 {t:'Stop it',i:'<code>docker stop</code> asks the program inside to shut down politely.',g:'Type <code>docker stop web</code>',a:[['docker','cmd'],['stop','sub'],['web','arg']],h:'docker stop web',ans:'docker stop web',ok:c=>{const x=C('web');return !!x&&x.status==='exited'},after:'The light went grey. The container still exists; `docker ps -a` would show it as Exited.'},
 {t:'Start it again',i:'A stopped container can be started again with the same settings and name.',g:'Type <code>docker start web</code>',a:[['docker','cmd'],['start','sub'],['web','arg']],h:'docker start web',ans:'docker start web',ok:c=>Crun('web')&&has(c,/^docker (container )?(start|restart) web/),after:'Up again. start reuses the existing container; run would make a new one.'},
 {t:'Remove it',i:'<code>docker rm</code> deletes a container. It refuses while it is running unless you add <code>-f</code> (force), which stops it first.',g:'Type <code>docker rm -f web</code>',a:[['docker','cmd'],['rm','sub'],['-f','opt'],['web','arg']],h:'docker rm -f web',ans:'docker rm -f web',ok:c=>!C('web'),after:'Gone, along with anything that was changed inside it. The nginx image is still here, ready for the next container.'},
]},
{name:'Ports & networks',badge:'Harbor Master',view:'docker',learned:['-p HOST:CONTAINER','curl localhost:PORT','docker network create','--network','container names as hostnames'],missions:[
 {t:'Open a door',i:'A container\'s ports are private. <code>-p 8080:80</code> connects port 8080 on your laptop to port 80 inside the container. Read it as <b>laptop : container</b>.',g:'Type <code>docker run -d --name web -p 8080:80 nginx</code>',a:[['docker','cmd'],['run','sub'],['-d','opt'],['--name web','opt'],['-p 8080:80','opt'],['nginx','img']],h:'If the name web is taken, remove the old one first: docker rm -f web',ans:'docker run -d --name web -p 8080:80 nginx',ok:c=>{const x=C('web');return !!x&&x.status==='running'&&x.ports.some(p=>p[0]===8080&&p[1]===80)},after:'The live view shows the published port on the card: 8080 → 80.'},
 {t:'Visit it',i:'<code>curl</code> fetches a web page in the terminal, like a browser without the pictures. <code>localhost</code> means "this computer", so <code>localhost:8080</code> is port 8080 on your laptop.',g:'Type <code>curl localhost:8080</code>',a:[['curl','cmd'],['localhost:8080','arg']],h:'curl localhost:8080',ans:'curl localhost:8080',ok:c=>has(c,/^curl (http:\/\/)?(localhost|127\.0\.0\.1):8080\/?$/)&&c.code===0,after:'That HTML came from nginx inside the container. On a real machine you could open http://localhost:8080 in your browser too.'},
 {t:'A second server',i:'Run a different web server, Apache (<b>httpd</b>), next to it. It also listens on port 80 inside its own container. That is fine: each container has its own ports.',g:'Type <code>docker run -d --name web2 -p 8081:80 httpd</code>, then curl port 8081',a:[['docker','cmd'],['run','sub'],['-d','opt'],['--name web2','opt'],['-p 8081:80','opt'],['httpd','img']],h:'Same shape as before, with a new name, a new laptop port, and the httpd image.',ans:'docker run -d --name web2 -p 8081:80 httpd',ok:c=>Crun('web2')&&C('web2').ports.some(p=>p[0]===8081),after:'Two servers, both on port 80 inside, reachable on 8080 and 8081 outside.'},
 {t:'Cause a clash',i:'Only one thing on your laptop can hold a port. Try to give a third server port 8080 and read the error.',g:'Type <code>docker run -d --name web3 -p 8080:80 nginx</code>',a:[['docker','cmd'],['run','sub'],['-p 8080:80','opt'],['nginx','img']],h:'Use the same -p 8080:80 again on purpose.',ans:'docker run -d --name web3 -p 8080:80 nginx',ok:c=>/port is already allocated/.test(c.out),after:'"port is already allocated". web3 was created but could not start (check `docker ps -a`). Clean up with `docker rm` web3 when you like.'},
 {t:'Build a private network',i:'Containers you put on a network that <b>you</b> created can find each other by name. Create one for the shop.',g:'Type <code>docker network create shopnet</code>',a:[['docker','cmd'],['network','sub'],['create','sub'],['shopnet','arg']],h:'docker network create shopnet',ans:'docker network create shopnet',ok:c=>!!D().networks.shopnet,after:'`docker network ls` lists it next to the built-in ones. The one called bridge is the default network every container joins unless you say otherwise; host and none are special cases you can ignore for now.'},
 {t:'Put a database on it',i:'<b>redis</b> is a fast little database. Start it on shopnet with the name <b>cache</b>. No <code>-p</code> needed: only other containers will talk to it.',g:'Type <code>docker run -d --name cache --network shopnet redis</code>',a:[['docker','cmd'],['run','sub'],['-d','opt'],['--name cache','opt'],['--network shopnet','opt'],['redis','img']],h:'--network goes before the image name, like every option.',ans:'docker run -d --name cache --network shopnet redis',ok:c=>{const x=C('cache');return !!x&&x.status==='running'&&x.net==='shopnet'},after:'cache got an IP address on shopnet (its number on the network, a bit like a phone number). A hostname is a name that stands for such a number, and cache\'s name now works as one on that network.'},
 {t:'Call it by name',i:'Start a throwaway alpine on the same network and ping <b>cache</b> by name. <code>ping</code> sends a few tiny test messages to a name and waits for replies; <code>-c 3</code> means "send 3". <code>--rm</code> deletes the container as soon as it exits.',g:'Type <code>docker run --rm --network shopnet alpine ping -c 3 cache</code>',a:[['docker','cmd'],['run','sub'],['--rm','opt'],['--network shopnet','opt'],['alpine','img'],['ping -c 3 cache','arg']],h:'Everything after the image name is the command to run inside the container.',ans:'docker run --rm --network shopnet alpine ping -c 3 cache',ok:c=>/ping/.test(c.line)&&/cache/.test(c.line)&&/packets received/.test(c.out),after:'The name "cache" turned into an IP. Docker runs a small DNS server for every network you create (DNS is the phone book that turns names into IP addresses).'},
 {t:'Now without the network',i:'Try the same thing on the default network to see the difference.',g:'Type <code>docker run --rm alpine ping -c 1 cache</code>',a:[['docker','cmd'],['run','sub'],['--rm','opt'],['alpine','img'],['ping -c 1 cache','arg']],h:'Leave out --network this time.',ans:'docker run --rm alpine ping -c 1 cache',ok:c=>/bad address 'cache'|Name or service not known/.test(c.out),after:'"bad address". The default bridge network has no names. Lesson: create a network for containers that need to talk.'},
]},
{name:'Volumes & settings',badge:'Data Keeper',view:'docker',learned:['docker volume create','-v NAME:/path','--rm','-e KEY=value','docker logs for crashes'],missions:[
 {t:'Write something inside',i:'Start an alpine shell called <b>temp</b>. With <code>-it</code> and no <code>-d</code>, you land straight inside.',g:'Type <code>docker run -it --name temp alpine sh</code>',a:[['docker','cmd'],['run','sub'],['-it','opt'],['--name temp','opt'],['alpine','img'],['sh','arg']],h:'docker run -it --name temp alpine sh',ans:'docker run -it --name temp alpine sh',ok:c=>{const b=inside();return !!b&&b.name==='temp'},after:'This shell is the program the container was started to run. When you exit it, the container stops.'},
 {t:'Save a note',i:'Write a file inside the container. <code>echo</code> prints the text you give it, and <code>&gt;</code> sends that text into a file instead of the screen.',g:'Type <code>echo "remember me" &gt; /note.txt</code>, then <code>cat /note.txt</code>',a:[['echo','cmd'],['"remember me"','arg'],['>','op'],['/note.txt','arg']],h:'echo "remember me" > /note.txt',ans:'echo "remember me" > /note.txt',ok:c=>{const b=inside();return !!b&&b.name==='temp'&&b.fs['/note.txt']!=null},after:'The note lives in the container\'s own writable layer, a thin scratch space on top of the read-only image layers.'},
 {t:'Throw the container away',i:'Leave, then delete the container. What happens to the note?',g:'Type <code>exit</code>, then <code>docker rm temp</code>',a:[['exit','cmd'],['&&','op'],['docker rm temp','cmd']],h:'You can do both in one line: exit, then on your laptop docker rm temp. In a line like that, && means "and then, if that worked".',ans:()=>S.inside?'exit':'docker rm temp',ok:c=>!S.inside&&!C('temp'),after:'The note is gone with it. A container\'s own files are disposable.'},
 {t:'Make a volume',i:'A <b>volume</b> is storage that Docker keeps outside any container.',g:'Type <code>docker volume create notes</code>',a:[['docker','cmd'],['volume','sub'],['create','sub'],['notes','arg']],h:'docker volume create notes',ans:'docker volume create notes',ok:c=>!!D().volumes.notes,after:'It shows up in the live view as a drum. It is empty for now. `docker volume ls` lists your volumes.'},
 {t:'Mount it',i:'<code>-v notes:/data</code> plugs the volume in at the folder /data inside the container. <code>--rm</code> removes the container when you exit.',g:'Type <code>docker run -it --rm -v notes:/data alpine sh</code>',a:[['docker','cmd'],['run','sub'],['-it','opt'],['--rm','opt'],['-v notes:/data','opt'],['alpine','img'],['sh','arg']],h:'-v VOLUME:/path/inside',ans:'docker run -it --rm -v notes:/data alpine sh',ok:c=>{const b=inside();return !!b&&!b.isPod&&b.mounts.some(m=>m.vol==='notes'&&m.path==='/data')},after:'Anything written under /data now goes into the notes volume.'},
 {t:'Save to the volume',i:'Write the note into /data this time.',g:'Type <code>echo "I survive" &gt; /data/note.txt</code>',a:[['echo','cmd'],['"I survive"','arg'],['>','op'],['/data/note.txt','arg']],h:'Same as before, with /data/ in front of the file name.',ans:'echo "I survive" > /data/note.txt',ok:c=>!!(D().volumes.notes&&D().volumes.notes.files['note.txt']!=null),after:'The volume in the live view now holds 1 file.'},
 {t:'Prove it survived',i:'Exit (the container is deleted thanks to <code>--rm</code>). Then read the note from a brand-new container.',g:'Type <code>exit</code>, then <code>docker run --rm -v notes:/data alpine cat /data/note.txt</code>',a:[['docker','cmd'],['run','sub'],['--rm','opt'],['-v notes:/data','opt'],['alpine','img'],['cat /data/note.txt','arg']],h:'After exit, run the cat command in a new container with the same -v.',ans:()=>S.inside?'exit':'docker run --rm -v notes:/data alpine cat /data/note.txt',ok:c=>!S.inside&&/I survive/.test(c.out),after:'Different container, same data. This is how databases keep their data in Docker.'},
 {t:'A container that crashes',i:'Some images need settings before they will start. Run the <b>postgres</b> database without any, and see what happens.',g:'Type <code>docker run -d --name db postgres</code>, then <code>docker ps -a</code>',a:[['docker','cmd'],['run','sub'],['-d','opt'],['--name db','opt'],['postgres','img']],h:'docker run -d --name db postgres',ans:'docker run -d --name db postgres',ok:c=>{const x=C('db');return !!x&&x.status==='exited'&&x.code===1},after:'It printed an ID, so it seemed fine, but it exited with code 1 right away (any code other than 0 means something went wrong). Time to find out why.'},
 {t:'Ask the logs why',i:'When a container dies, its logs usually say why.',g:'Type <code>docker logs db</code>',a:[['docker','cmd'],['logs','sub'],['db','arg']],h:'docker logs db',ans:'docker logs db',ok:c=>has(c,/^docker (container )?logs db$/),after:'It needs POSTGRES_PASSWORD. Settings like that are passed as environment variables: named settings handed to a program when it starts.'},
 {t:'Fix it with -e',i:'<code>-e KEY=value</code> sets an environment variable inside the container. Remove the broken one and start again with a password.',g:'Type <code>docker rm db &amp;&amp; docker run -d --name db -e POSTGRES_PASSWORD=secret postgres</code>',a:[['docker rm db','cmd'],['&&','op'],['docker run -d --name db','cmd'],['-e POSTGRES_PASSWORD=secret','opt'],['postgres','img']],h:'&& runs the second command only if the first one worked.',ans:'docker rm db && docker run -d --name db -e POSTGRES_PASSWORD=secret postgres',ok:c=>Crun('db')&&C('db').env.POSTGRES_PASSWORD,after:'Running. Check `docker logs` db again: "ready to accept connections".'},
]},
{name:'Build an image',badge:'Shipwright',view:'docker',files:['Dockerfile','app.js','package.json','message.txt'],learned:['Dockerfile','docker build -t name:tag .','build cache','docker history','shipping a new version'],missions:[
 {t:'Meet the project',i:'New files appeared in your folder: a small web app (written for Node.js, a tool that runs JavaScript programs) and a <b>Dockerfile</b>, the recipe for packaging it. <code>ls</code> lists the files in the current folder.',g:'Type <code>ls</code>',a:[['ls','cmd']],h:'Type ls.',ans:'ls',ok:c=>has(c,/^ls( -l| -la| -al)?$/),after:'`app.js` is the program, `package.json` lists its libraries (code written by other people), `message.txt` is what it says, and Dockerfile packages it all.'},
 {t:'Read the recipe',i:'Each line of a Dockerfile is an instruction. Read the comments: they explain each step.',g:'Type <code>cat Dockerfile</code>',a:[['cat','cmd'],['Dockerfile','arg']],h:'cat Dockerfile (capital D)',ans:'cat Dockerfile',ok:c=>has(c,/^cat Dockerfile$/),after:'FROM picks a base, WORKDIR sets the folder, COPY brings files in, RUN executes a step, EXPOSE documents a port, CMD says what runs at start.'},
 {t:'Build it',i:'<code>docker build</code> follows the recipe and produces an image. <code>-t</code> gives it a name:tag. The final <code>.</code> means "the files in this folder".',g:'Type <code>docker build -t shop:1.0 .</code>',a:[['docker','cmd'],['build','sub'],['-t shop:1.0','opt'],['.','arg']],h:'Don\'t forget the dot at the end.',ans:'docker build -t shop:1.0 .',ok:c=>Img('shop:1.0'),after:'Each [n/5] line was one layer being built. Your image is in the live view now, next to the ones you pulled.'},
 {t:'See your layers',i:'Your image is a stack too: your layers on top of the node base.',g:'Type <code>docker history shop:1.0</code>',a:[['docker','cmd'],['history','sub'],['shop:1.0','img']],h:'docker history shop:1.0',ans:'docker history shop:1.0',ok:c=>has(c,/^docker (image )?history shop:1\.0$/),after:'The top rows are your Dockerfile lines. Below them is everything that came with node:20-alpine.'},
 {t:'Run your own image',i:'Your image works like any other. The app listens on port 3000.',g:'Type <code>docker run -d --name shop -p 3000:3000 shop:1.0</code>',a:[['docker','cmd'],['run','sub'],['-d','opt'],['--name shop','opt'],['-p 3000:3000','opt'],['shop:1.0','img']],h:'Port 3000 outside, 3000 inside.',ans:'docker run -d --name shop -p 3000:3000 shop:1.0',ok:c=>Crun('shop')&&C('shop').imgKey==='shop:1.0',after:'It started. The image holds Node.js, the libraries and the code, so this would run the same on any machine with Docker.'},
 {t:'Visit the shop',i:'Ask your app for its page.',g:'Type <code>curl localhost:3000</code>',a:[['curl','cmd'],['localhost:3000','arg']],h:'curl localhost:3000',ans:'curl localhost:3000',ok:c=>has(c,/^curl (http:\/\/)?localhost:3000\/?$/)&&/Hello from the shop/.test(c.out),after:'That text came from `message.txt`, baked into the image at build time.'},
 {t:'Change the message',i:'Time for version 2. Change what the shop says. You can open the editor, or overwrite the file in one line.',g:'Type <code>edit message.txt</code> and change the text, or <code>echo "Now with fresh pastries!" &gt; message.txt</code>',a:[['echo','cmd'],['"Now with fresh pastries!"','arg'],['>','op'],['message.txt','arg']],h:'Any new text works. Then cat message.txt to check.',ans:'echo "Now with fresh pastries!" > message.txt',ok:c=>S.files['message.txt']!=null&&S.files['message.txt'].trim()!==MSG0,after:'Changing the file does not change the running container. The old text is sealed inside shop:1.0.'},
 {t:'Build version 2',i:'Build again with a new tag. Docker reuses any step whose input has not changed since last time (its <b>cache</b>) and marks it <b>CACHED</b>. Watch which steps say that.',g:'Type <code>docker build -t shop:2.0 .</code>',a:[['docker','cmd'],['build','sub'],['-t shop:2.0','opt'],['.','arg']],h:'Same as before with 2.0 as the tag.',ans:'docker build -t shop:2.0 .',ok:c=>Img('shop:2.0'),after:'npm install (the step that downloads the libraries) was CACHED because `package.json` did not change. Only the last COPY ran again. That is why the Dockerfile copies `package.json` first.'},
 {t:'Ship it',i:'Replace the running 1.0 container with a 2.0 one. Containers are not upgraded in place: you swap them.',g:'Type <code>docker rm -f shop &amp;&amp; docker run -d --name shop -p 3000:3000 shop:2.0</code>, then curl it',a:[['docker rm -f shop','cmd'],['&&','op'],['docker run -d --name shop -p 3000:3000','cmd'],['shop:2.0','img']],h:'Remove, then run with the new tag.',ans:'docker rm -f shop && docker run -d --name shop -p 3000:3000 shop:2.0',ok:c=>Crun('shop')&&C('shop').imgKey==='shop:2.0',after:'curl localhost:3000 shows the new message. Want to go back? Run shop:1.0 again. Both versions still exist.'},
]},
{name:'Compose',badge:'Conductor',view:'docker',files:['compose.yaml'],learned:['compose.yaml','docker compose up -d','docker compose ps','docker compose logs','docker compose down'],missions:[
 {t:'One file for the whole app',i:'Typing long <code>docker run</code> commands for every part gets old. <b>Compose</b> describes the app in a file instead (written in YAML, a simple indented text format): the shop and a redis cache to count visits.',g:'Type <code>cat compose.yaml</code>',a:[['cat','cmd'],['compose.yaml','arg']],h:'cat compose.yaml',ans:'cat compose.yaml',ok:c=>has(c,/^cat compose\.ya?ml$/),after:'Every `docker run` option has a place in the file: ports, environment, volumes. Indentation matters in YAML.'},
 {t:'Start everything',i:'One command builds what is missing, creates a network and volume, and starts both <b>services</b> (the parts of the app: web and cache) in the right order.',g:'Type <code>docker compose up -d</code>',a:[['docker','cmd'],['compose','sub'],['up','sub'],['-d','opt']],h:'docker compose up -d',ans:'docker compose up -d',ok:c=>Crun('shop-web-1')&&Crun('shop-cache-1'),after:'Look at the names: project-service-number (the project is the app, here shop). The live view shows the new shop_default network with both on it.'},
 {t:'What did Compose start?',i:'<code>docker compose ps</code> lists only this project\'s containers.',g:'Type <code>docker compose ps</code>',a:[['docker','cmd'],['compose','sub'],['ps','sub']],h:'docker compose ps',ans:'docker compose ps',ok:c=>has(c,/^docker compose ps/),after:'The SERVICE column shows the names from the file: web and cache. Those are also their hostnames on the project network.'},
 {t:'Count the visits',i:'The shop now talks to redis (REDIS_HOST: cache) and counts visits. It is published on port 4000.',g:'Type <code>curl localhost:4000</code> two or three times',a:[['curl','cmd'],['localhost:4000','arg']],h:'Press ↑ and Enter to repeat.',ans:'curl localhost:4000',ok:c=>/Visits: [2-9]|Visits: \d\d/.test(c.out),after:'The counter goes up. web found cache by its service name, just like the ping earlier.'},
 {t:'Read the logs',i:'Logs from a service, prefixed with its name.',g:'Type <code>docker compose logs web</code>',a:[['docker','cmd'],['compose','sub'],['logs','sub'],['web','arg']],h:'docker compose logs web',ans:'docker compose logs web',ok:c=>has(c,/^docker compose logs/),after:'Leave out the service name to see every service interleaved.'},
 {t:'Tear it down',i:'<code>docker compose down</code> stops and removes the containers and the network. Volumes stay unless you add <code>-v</code>.',g:'Type <code>docker compose down</code>',a:[['docker','cmd'],['compose','sub'],['down','sub']],h:'docker compose down',ans:'docker compose down',ok:c=>!C('shop-web-1')&&!C('shop-cache-1')&&S.flag.composeDown,after:'Containers and network: gone. The cache-data volume is still in the live view.'},
 {t:'Bring it back',i:'Start it again and check the counter. Did the visits survive?',g:'Type <code>docker compose up -d &amp;&amp; curl localhost:4000</code>',a:[['docker compose up -d','cmd'],['&&','op'],['curl localhost:4000','cmd']],h:'Up, then curl.',ans:'docker compose up -d && curl localhost:4000',ok:c=>S.flag.composeDown&&/Visits: ([3-9]|\d\d)/.test(c.out),after:'The count picked up where it left off, because redis keeps its data on the volume. New containers, same data.'},
]},
{name:'Meet the cluster',badge:'Cluster Cadet',view:'k8s',learned:['kubectl cluster-info','kubectl get nodes','kubectl get pods -A','kubectl run','kubectl describe','kubectl delete pod'],missions:[
 {t:'Say hello to the cluster',i:'Docker runs containers on one machine. <b>Kubernetes</b> runs them across many machines and keeps them healthy. A group of machines working together is a <b>cluster</b>, and you have a small one called <b>harbor</b>; <code>kubectl</code> is how you talk to it.',g:'Type <code>kubectl cluster-info</code>',a:[['kubectl','cmd'],['cluster-info','sub']],h:'kubectl cluster-info',ans:'kubectl cluster-info',ok:c=>has(c,/^(kubectl|k) cluster-info$/),after:'The control plane (the cluster\'s brain) answers at an address on port 6443. That is the API server, its front door: `kubectl` only ever talks to it.'},
 {t:'Count the machines',i:'Each machine in a cluster is a <b>node</b>. This local cluster fakes three of them with Docker containers.',g:'Type <code>kubectl get nodes</code>',a:[['kubectl','cmd'],['get','sub'],['nodes','arg']],h:'kubectl get nodes',ans:'kubectl get nodes',ok:c=>has(c,/^(kubectl|k) get (nodes|node|no)( -o wide)?$/),after:'One control-plane (the brain) and two workers (where your apps run). All Ready.'},
 {t:'Peek at the brain',i:'A <b>pod</b> is Kubernetes\' wrapper around a container (you will start one in a moment). The cluster\'s own parts run as pods too, kept in a separate area called a <b>namespace</b>, here <b>kube-system</b>. <code>-A</code> shows the pods of every namespace.',g:'Type <code>kubectl get pods -A</code>',a:[['kubectl','cmd'],['get','sub'],['pods','arg'],['-A','opt']],h:'-A is short for --all-namespaces',ans:'kubectl get pods -A',ok:c=>has(c,/^(kubectl|k) get (pods|pod|po) (-A|--all-namespaces)/),after:'etcd (its notebook), kube-apiserver (its front door), kube-scheduler (picks a machine for each pod) and kube-controller-manager (keeps things as asked) make up the control plane. coredns is the cluster\'s name service, like the DNS you met with Docker networks.'},
 {t:'Your first pod',i:'Time to make your first pod, the smallest thing Kubernetes runs: it wraps one (sometimes more) containers. Start one from nginx.',g:'Type <code>kubectl run hello --image=nginx</code>',a:[['kubectl','cmd'],['run','sub'],['hello','arg'],['--image=nginx','opt']],h:'kubectl run NAME --image=IMAGE',ans:'kubectl run hello --image=nginx',ok:c=>K().pods.some(p=>p.name==='hello'&&p.ns==='default'&&live(p)),after:'Watch the live view: the scheduler (the part that chooses a machine) picks a worker, then the pod goes Pending → ContainerCreating → Running.'},
 {t:'Watch it come up',i:'List the pods in the <b>default</b> namespace, where your things go unless you say otherwise. Repeat until STATUS says Running.',g:'Type <code>kubectl get pods</code>',a:[['kubectl','cmd'],['get','sub'],['pods','arg']],h:'Press ↑ to repeat it.',ans:'kubectl get pods',ok:c=>has(c,/^(kubectl|k) get (pods|pod|po)/)&&K().pods.some(p=>p.name==='hello'&&p.phase==='Running'),after:'READY 1/1 means its one container is up.'},
 {t:'Read its story',i:'<code>describe</code> shows everything about a pod (or other thing in the cluster), and at the bottom, the <b>Events</b>: what happened, in order.',g:'Type <code>kubectl describe pod hello</code>',a:[['kubectl','cmd'],['describe','sub'],['pod','arg'],['hello','arg']],h:'kubectl describe pod hello',ans:'kubectl describe pod hello',ok:c=>has(c,/^(kubectl|k) describe (pod|pods|po) hello$|^(kubectl|k) describe (pod|po)\/hello$/),after:'Scheduled → Pulling → Pulled → Started. When a pod misbehaves, these events are where you look first.'},
 {t:'Delete it',i:'Delete the pod and watch the live view. Does anything replace it?',g:'Type <code>kubectl delete pod hello</code>',a:[['kubectl','cmd'],['delete','sub'],['pod','arg'],['hello','arg']],h:'kubectl delete pod hello',ans:'kubectl delete pod hello',ok:c=>!K().pods.some(p=>p.name==='hello'&&p.ns==='default'&&live(p)),after:'It terminated and nothing took its place. A bare pod has nobody looking after it. The next chapter fixes that.'},
]},
{name:'Deployments',badge:'Self-Healer',view:'k8s',learned:['kubectl create deployment','--replicas','self-healing','kubectl scale','kubectl get rs'],missions:[
 {t:'Ask for three',i:'A <b>Deployment</b> says "I want N copies (<b>replicas</b>) of this pod, always". Kubernetes then works to make it true.',g:'Type <code>kubectl create deployment web --image=nginx:1.26 --replicas=3</code>',a:[['kubectl','cmd'],['create','sub'],['deployment','arg'],['web','arg'],['--image=nginx:1.26','opt'],['--replicas=3','opt']],h:'One line. Flags in any order.',ans:'kubectl create deployment web --image=nginx:1.26 --replicas=3',ok:c=>!!Dep('web'),after:'Three pods appear in the live view, spread across both workers.'},
 {t:'Check the deployment',i:'List deployments. READY shows how many of the wanted pods are up.',g:'Type <code>kubectl get deployments</code>',a:[['kubectl','cmd'],['get','sub'],['deployments','arg']],h:'deploy is a short form: kubectl get deploy',ans:'kubectl get deployments',ok:c=>has(c,/^(kubectl|k) get (deployments|deployment|deploy)/),after:'3/3 means three wanted, three ready.'},
 {t:'Where did they land?',i:'<code>-o wide</code> adds the pod IP and the node.',g:'Type <code>kubectl get pods -o wide</code>',a:[['kubectl','cmd'],['get','sub'],['pods','arg'],['-o wide','opt']],h:'-o wide at the end',ans:'kubectl get pods -o wide',ok:c=>has(c,/^(kubectl|k) get (pods|pod|po) .*-o ?wide|^(kubectl|k) get (pods|po) -owide/),after:'Each pod has its own IP inside the cluster. Notice the names: web-, then a short code for the pod recipe, then a random bit.'},
 {t:'Break one on purpose',i:'Delete one of the web pods. Click a web pod in the live view to fill in its name.',g:'Type <code>kubectl delete pod web-…</code> with a real pod name',a:[['kubectl','cmd'],['delete','sub'],['pod','arg'],['web-xxxxxxxxxx-xxxxx','arg']],h:'Click any web pod on the right, then press Enter.',ans:()=>{const p=Pods('web')[0];return p?'kubectl delete pod '+p.name:'kubectl get pods'},ok:c=>S.flag.lastDeleted&&S.flag.lastDeleted.dep==='web'&&has(c,/delete/),fill:{pod:p=>`kubectl delete pod ${p.name}${p.ns!=='default'?' -n '+p.ns:''}`},after:'Watch the live view: as soon as the count dropped to 2, Kubernetes created a replacement.'},
 {t:'Spot the newcomer',i:'List the pods again and look at the AGE column.',g:'Type <code>kubectl get pods</code>',a:[['kubectl','cmd'],['get','sub'],['pods','arg']],h:'kubectl get pods',ans:'kubectl get pods',ok:c=>has(c,/^(kubectl|k) get (pods|pod|po)/)&&S.flag.lastDeleted&&Pods('web').length>=3,after:'One pod is only seconds old, with a new name. That is self-healing: you describe what you want, and the cluster keeps it true.'},
 {t:'Scale up',i:'More visitors? Ask for more copies.',g:'Type <code>kubectl scale deployment web --replicas=5</code>',a:[['kubectl','cmd'],['scale','sub'],['deployment web','arg'],['--replicas=5','opt']],h:'kubectl scale deployment web --replicas=5',ans:'kubectl scale deployment web --replicas=5',ok:c=>Dep('web')&&Dep('web').replicas===5,after:'Two more pods start. The scheduler puts them on the less busy worker.'},
 {t:'Scale down',i:'Quiet night. Go down to 2.',g:'Type <code>kubectl scale deployment web --replicas=2</code>',a:[['kubectl','cmd'],['scale','sub'],['deployment web','arg'],['--replicas=2','opt']],h:'Same command, smaller number.',ans:'kubectl scale deployment web --replicas=2',ok:c=>Dep('web')&&Dep('web').replicas===2,after:'Extra pods terminate until exactly 2 are left.'},
 {t:'The layer in between',i:'A deployment does not create pods itself. It manages a <b>ReplicaSet</b>, and the ReplicaSet keeps the pod count.',g:'Type <code>kubectl get rs</code>',a:[['kubectl','cmd'],['get','sub'],['rs','arg']],h:'rs is short for replicasets',ans:'kubectl get rs',ok:c=>has(c,/^(kubectl|k) get (rs|replicasets?)/),after:'One ReplicaSet, named after the deployment plus the template hash, the same hash that appears in each pod name.'},
]},
{name:'Services',badge:'Traffic Controller',view:'k8s',setup:()=>ensureWebDep()?'(A web deployment with 3 replicas was created so this chapter has something to route to.)':'',learned:['kubectl expose','Service types','Endpoints','kubectl port-forward','labels and selectors'],missions:[
 {t:'Back to three',i:'First, three web pods again, so there is traffic to spread.',g:'Type <code>kubectl scale deployment web --replicas=3</code>',a:[['kubectl','cmd'],['scale','sub'],['deployment web','arg'],['--replicas=3','opt']],h:'kubectl scale deployment web --replicas=3',ans:'kubectl scale deployment web --replicas=3',ok:c=>Dep('web')&&Dep('web').replicas===3,after:'Three pods, three different IPs. Which one should a visitor use? None of them directly.'},
 {t:'Give them one address',i:'A <b>Service</b> is a stable name and IP in front of a changing set of pods. <code>kubectl expose</code> creates one for a deployment. The <b>type</b> says who can reach it: <code>NodePort</code> also opens a door on every machine in the cluster, while the default, <code>ClusterIP</code>, works only inside it.',g:'Type <code>kubectl expose deployment web --port=80 --type=NodePort</code>',a:[['kubectl','cmd'],['expose','sub'],['deployment web','arg'],['--port=80','opt'],['--type=NodePort','opt']],h:'kubectl expose deployment web --port=80 --type=NodePort',ans:'kubectl expose deployment web --port=80 --type=NodePort',ok:c=>!!K().svcs['default/web'],after:'The live view draws the service above the pods it selects.'},
 {t:'List services',i:'Look at TYPE, CLUSTER-IP and <code>PORT(S)</code>.',g:'Type <code>kubectl get svc</code>',a:[['kubectl','cmd'],['get','sub'],['svc','arg']],h:'svc is short for services',ans:'kubectl get svc',ok:c=>has(c,/^(kubectl|k) get (svc|services?)/),after:'ClusterIP works inside the cluster. NodePort also opens a port (numbered 30000 or higher) on every node. "kubernetes" is the API server\'s own service.'},
 {t:'Who is behind it?',i:'The service picks pods by <b>label</b> (a key=value tag stuck on a pod), and the matching pod IPs are its <b>Endpoints</b>.',g:'Type <code>kubectl describe svc web</code>',a:[['kubectl','cmd'],['describe','sub'],['svc','arg'],['web','arg']],h:'kubectl describe svc web',ans:'kubectl describe svc web',ok:c=>has(c,/^(kubectl|k) describe (svc|service|services) web$|^(kubectl|k) describe (svc|service)\/web$/),after:'Selector app=web (the label it looks for), and Endpoints lists three IPs. Delete a pod and the list updates by itself.'},
 {t:'Open a tunnel',i:'Your laptop is outside the cluster. <code>port-forward</code> opens a tunnel from a laptop port to the service.',g:'Type <code>kubectl port-forward svc/web 9090:80</code>',a:[['kubectl','cmd'],['port-forward','sub'],['svc/web','arg'],['9090:80','arg']],h:'Same LAPTOP:REMOTE order as docker -p.',ans:'kubectl port-forward svc/web 9090:80',ok:c=>!!K().fwd[9090],after:'Port 9090 on your laptop now leads to the web service.'},
 {t:'Load balancing, live',i:'Send a few requests and watch which pod answers each time. The live view flashes the one that served you.',g:'Type <code>curl localhost:9090</code> three times',a:[['curl','cmd'],['localhost:9090','arg']],h:'↑ and Enter to repeat.',ans:'curl localhost:9090',ok:c=>Object.keys(S.flag.fwdPods||{}).length>=2&&(S.flag.fwdHits||0)>=3,after:'Different pods answered. Behind one address, the work is shared. (A real port-forward sticks to one pod; we let it rotate so you can see the spreading a Service does.)'},
 {t:'Labels are the glue',i:'Labels are simple key=value tags. The service matches pods with <b>app=web</b>.',g:'Type <code>kubectl get pods --show-labels</code>',a:[['kubectl','cmd'],['get','sub'],['pods','arg'],['--show-labels','opt']],h:'kubectl get pods --show-labels',ans:'kubectl get pods --show-labels',ok:c=>has(c,/--show-labels/),after:'app=web links deployment, pods and service. Try `kubectl get` pods `-l` app=web to filter by label.'},
]},
{name:'Rolling updates',badge:'Smooth Sailor',view:'k8s',setup:()=>ensureWebDep()?'(A web deployment running nginx:1.26 was created for this chapter.)':'',learned:['kubectl set image','kubectl rollout status','kubectl rollout history','ImagePullBackOff','kubectl rollout undo'],missions:[
 {t:'Ship a new version',i:'Upgrade the running site from nginx 1.26 to 1.27 with no downtime. This is a <b>rolling update</b>: Kubernetes swaps the pods a few at a time, and one such update from start to finish is a <b>rollout</b>. The container inside the deployment is called <b>nginx</b>.',g:'Type <code>kubectl set image deployment/web nginx=nginx:1.27</code>',a:[['kubectl','cmd'],['set image','sub'],['deployment/web','arg'],['nginx','arg'],['=nginx:1.27','val']],h:'CONTAINER=IMAGE, so nginx=nginx:1.27',ans:'kubectl set image deployment/web nginx=nginx:1.27',ok:c=>Dep('web')&&Dep('web').image==='nginx:1.27',after:'Watch the live view: one new pod starts, then one old pod goes, again and again.'},
 {t:'Follow the rollout',i:'Ask how the rollout is going.',g:'Type <code>kubectl rollout status deployment/web</code>',a:[['kubectl','cmd'],['rollout','sub'],['status','sub'],['deployment/web','arg']],h:'kubectl rollout status deployment/web',ans:'kubectl rollout status deployment/web',ok:c=>has(c,/^(kubectl|k) rollout status (deployment|deploy)[ /]web$/),after:'Run it again until "successfully rolled out". At every moment, at least 3 pods were serving.'},
 {t:'The history book',i:'Each template change is a numbered <b>revision</b>.',g:'Type <code>kubectl rollout history deployment/web</code>',a:[['kubectl','cmd'],['rollout','sub'],['history','sub'],['deployment/web','arg']],h:'kubectl rollout history deployment/web',ans:'kubectl rollout history deployment/web',ok:c=>has(c,/^(kubectl|k) rollout history (deployment|deploy)[ /]web/),after:'Revision 1 was nginx:1.26, revision 2 is 1.27. `kubectl get` rs shows the old ReplicaSet scaled to 0, kept for rollbacks.'},
 {t:'Ship a broken version',i:'Mistakes happen. Deploy a version that does not exist: <b>nginx:1.99</b>.',g:'Type <code>kubectl set image deployment/web nginx=nginx:1.99</code>',a:[['kubectl','cmd'],['set image','sub'],['deployment/web','arg'],['nginx=nginx:1.99','val']],h:'Same as before with 1.99.',ans:'kubectl set image deployment/web nginx=nginx:1.99',ok:c=>Dep('web')&&Dep('web').image==='nginx:1.99',after:'Watch the live view for a red pod.'},
 {t:'Spot the trouble',i:'List the pods and look at STATUS.',g:'Type <code>kubectl get pods</code>',a:[['kubectl','cmd'],['get','sub'],['pods','arg']],h:'kubectl get pods',ans:'kubectl get pods',ok:c=>has(c,/^(kubectl|k) get (pods|pod|po)/)&&K().pods.some(p=>/ErrImagePull|ImagePullBackOff/.test(p.phase)),after:'ErrImagePull, then ImagePullBackOff. The rollout stopped at one bad pod, and the three old pods are still serving. Nobody saw an outage.'},
 {t:'Ask it why',i:'Describe the broken pod. Click the red pod in the live view to fill its name.',g:'Type <code>kubectl describe pod web-…</code> with the broken pod\'s name',a:[['kubectl','cmd'],['describe','sub'],['pod','arg'],['web-…','arg']],h:'Click the red pod on the right.',ans:()=>{const p=K().pods.find(p=>/ErrImagePull|ImagePullBackOff/.test(p.phase));return p?'kubectl describe pod '+p.name:'kubectl get pods'},ok:c=>has(c,/describe (pod|po)/)&&/Failed to pull image/.test(c.out),fill:{pod:p=>`kubectl describe pod ${p.name}${p.ns!=='default'?' -n '+p.ns:''}`},after:'The Events section says it plainly: the image was not found.'},
 {t:'Roll back',i:'Go back to the last good revision with one command.',g:'Type <code>kubectl rollout undo deployment/web</code>',a:[['kubectl','cmd'],['rollout','sub'],['undo','sub'],['deployment/web','arg']],h:'kubectl rollout undo deployment/web',ans:'kubectl rollout undo deployment/web',ok:c=>Dep('web')&&Dep('web').image==='nginx:1.27',after:'Back on nginx:1.27, and the red pod is cleaned up. Check `kubectl rollout` history: the good version got a new revision number.'},
]},
{name:'Declarative YAML',badge:'Fleet Admiral',view:'k8s',files:['shop.yaml'],learned:['kubectl create namespace','kubectl apply -f','kubectl get all -n','ConfigMaps','edit, apply, repeat','kubectl delete -f'],missions:[
 {t:'A room of its own',i:'<b>Namespaces</b> split one cluster into separate areas, for example per team or per app. Create one for the shop.',g:'Type <code>kubectl create namespace shop</code>',a:[['kubectl','cmd'],['create','sub'],['namespace','arg'],['shop','arg']],h:'kubectl create namespace shop',ans:'kubectl create namespace shop',ok:c=>!!K().nss.shop,after:'Names only need to be unique inside a namespace, so the shop can have its own "web" without clashing.'},
 {t:'Read the manifest',i:'So far you typed commands one by one. Real teams write the <b>desired state</b> in YAML files, called manifests. This one holds three things (Kubernetes calls each one an <b>object</b>).',g:'Type <code>cat shop.yaml</code>',a:[['cat','cmd'],['shop.yaml','arg']],h:'cat shop.yaml',ans:'cat shop.yaml',ok:c=>has(c,/^cat shop\.ya?ml$/),after:'A ConfigMap (settings), a Deployment (2 replicas, loading the ConfigMap as environment variables), and a Service. Each says which namespace it belongs to.'},
 {t:'Apply it',i:'<code>kubectl apply -f</code> sends the whole file. Kubernetes creates whatever is missing.',g:'Type <code>kubectl apply -f shop.yaml</code>',a:[['kubectl','cmd'],['apply','sub'],['-f shop.yaml','opt']],h:'kubectl apply -f shop.yaml',ans:'kubectl apply -f shop.yaml',ok:c=>!!Dep('shop','shop'),after:'Three objects created at once. The shop pods carry a "shop" tag in the live view.'},
 {t:'See the whole set',i:'<code>-n</code> picks the namespace. Without it, <code>kubectl</code> looks in "default".',g:'Type <code>kubectl get all -n shop</code>',a:[['kubectl','cmd'],['get','sub'],['all','arg'],['-n shop','opt']],h:'kubectl get all -n shop',ans:'kubectl get all -n shop',ok:c=>has(c,/^(kubectl|k) get all (-n|--namespace)[ =]shop$/),after:'Pods, service, deployment and replicaset. Try `kubectl get` all without `-n` and see they are not in default.'},
 {t:'Check the settings arrived',i:'Run <code>env</code> inside a shop pod to see the ConfigMap values: it prints a program\'s environment variables. The lone <code>--</code> separates kubectl\'s own options from the command to run in the pod. Click a shop pod in the live view to fill the command.',g:'Type <code>kubectl exec POD -n shop -- env</code>',a:[['kubectl','cmd'],['exec','sub'],['POD','arg'],['-n shop','opt'],['--','op'],['env','cmd']],h:'Click a pod tagged shop on the right.',ans:()=>{const p=Pods('shop','shop').find(p=>p.phase==='Running');return p?`kubectl exec ${p.name} -n shop -- env`:'kubectl get pods -n shop'},ok:c=>has(c,/exec/)&&/GREETING=/.test(c.out),fill:{pod:p=>`kubectl exec ${p.name}${p.ns!=='default'?' -n '+p.ns:''} -- env`},after:'GREETING and CURRENCY came from the ConfigMap. Change settings without rebuilding the image.'},
 {t:'Change the file, not the cluster',i:'This is the declarative way: edit the file, apply again. Change <b>replicas: 2</b> to <b>replicas: 4</b>.',g:'Type <code>edit shop.yaml</code>, change replicas to 4, save, then <code>kubectl apply -f shop.yaml</code>',a:[['edit','cmd'],['shop.yaml','arg'],['&&','op'],['kubectl apply -f shop.yaml','cmd']],h:'In the editor, find "replicas: 2" under spec. Change the number, press Save, then apply.',ans:()=>/replicas:\s*4/.test(S.files['shop.yaml']||'')?'kubectl apply -f shop.yaml':'edit shop.yaml',ok:c=>Dep('shop','shop')&&Dep('shop','shop').replicas===4,after:'Only the deployment said "configured". The rest was "unchanged". apply works out the difference for you.'},
 {t:'Clean up by file',i:'The same file that created everything can delete everything.',g:'Type <code>kubectl delete -f shop.yaml</code>',a:[['kubectl','cmd'],['delete','sub'],['-f shop.yaml','opt']],h:'kubectl delete -f shop.yaml',ans:'kubectl delete -f shop.yaml',ok:c=>!Dep('shop','shop')&&has(c,/delete -f/),after:'Every object in the file is gone. You now know the full loop: write it down, apply it, change it, apply again.'},
]},
];
CH.forEach((ch,i)=>{ch.pic=PICS[i]});

/* ---------- quick-fire ---------- */
const QF=[
['Check which Docker version you have',['docker version'],0],
['Run the hello-world image',['docker run hello-world'],0],
['List running containers',['docker ps','docker container ls'],0],
['List all containers, including stopped ones',['docker ps -a','docker ps --all','docker container ls -a'],0],
['List the images on your machine',['docker images','docker image ls'],0],
['Download the redis image without running it',['docker pull redis','docker pull redis:latest'],1],
['Download version 1.26 of nginx',['docker pull nginx:1.26'],1],
['Delete the alpine image',['docker rmi alpine','docker image rm alpine'],1],
['Show the layers of the nginx image',['docker history nginx','docker image history nginx'],1],
['Start nginx in the background, named web',['docker run -d --name web nginx'],2],
['Show the logs of the container web',['docker logs web'],2],
['Stop the container web',['docker stop web'],2],
['Start the stopped container web',['docker start web'],2],
['Remove the stopped container web',['docker rm web'],2],
['Force-remove the running container web',['docker rm -f web','docker rm --force web'],2],
['Open a shell inside the running container web',['docker exec -it web sh','docker exec -it web bash'],2],
['Run nginx in the background with laptop port 8080 going to container port 80',['docker run -d -p 8080:80 nginx'],3],
['Fetch the page served on port 8080 of your laptop',['curl localhost:8080','curl http://localhost:8080'],3],
['Create a network called shopnet',['docker network create shopnet'],3],
['Create a volume called notes',['docker volume create notes'],4],
['List volumes',['docker volume ls'],4],
['Start an interactive alpine shell with the volume notes at /data',['docker run -it -v notes:/data alpine sh'],4],
['Run postgres in the background with POSTGRES_PASSWORD set to secret',['docker run -d -e POSTGRES_PASSWORD=secret postgres'],4],
['Build an image named shop:1.0 from this folder',['docker build -t shop:1.0 .'],5],
['Start everything in compose.yaml in the background',['docker compose up -d'],6],
['Stop and remove everything Compose started',['docker compose down'],6],
['List the nodes in the cluster',['kubectl get nodes'],7],
['List the pods in the default namespace',['kubectl get pods'],7],
['List pods in every namespace',['kubectl get pods -A','kubectl get pods --all-namespaces'],7],
['Start a single pod named hello from nginx',['kubectl run hello --image=nginx'],7],
['Show the details and events of the pod hello',['kubectl describe pod hello'],7],
['Create a deployment web from nginx with 3 replicas',['kubectl create deployment web --image=nginx --replicas=3'],8],
['Scale the deployment web to 5 replicas',['kubectl scale deployment web --replicas=5'],8],
['Expose the deployment web on port 80 as a NodePort service',['kubectl expose deployment web --port=80 --type=NodePort'],9],
['List services',['kubectl get svc','kubectl get services'],9],
['Change the nginx container in deployment web to nginx:1.27',['kubectl set image deployment/web nginx=nginx:1.27'],10],
['Roll the deployment web back to its previous version',['kubectl rollout undo deployment/web'],10],
['Show the rollout history of the deployment web',['kubectl rollout history deployment/web'],10],
['Create or update everything in shop.yaml',['kubectl apply -f shop.yaml'],11],
['Create a namespace called dev',['kubectl create namespace dev','kubectl create ns dev'],11],
['Delete the pod hello',['kubectl delete pod hello'],7],
['Forward laptop port 9090 to port 80 of the service web',['kubectl port-forward svc/web 9090:80','kubectl port-forward service/web 9090:80'],9],

];
/* Quick-fire only asks what the quest has taught: each entry carries the chapter that teaches it (q[2]) and opens once every mission of that chapter is done */
const qfOpen=done=>QF.filter(q=>CH[q[2]].missions.every((_,j)=>done&&done[q[2]+'.'+j]));
const VALUED_D=new Set(['--name','-p','--publish','-e','--env','-v','--volume','--network','--net','-f','--file','-w']);
function canon(s){let t=tokenize(String(s).trim());if(!t)return '';t=t.flatMap(x=>/^--[\w-]+=/.test(x)?[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]:[x]);
  if(t[0]==='k')t[0]='kubectl';const isBuild=t[0]==='docker'&&t[1]==='build';
  t=t.flatMap(x=>/^-[a-zA-Z]{2,}$/.test(x)&&!['-it','-ti'].includes(x)&&t[0]==='docker'?x.slice(1).split('').map(c=>'-'+c):['-it','-ti'].includes(x)?['-i','-t']:x.includes('/')&&RT[x.split('/')[0]]&&t[0]==='kubectl'?[x.split('/')[0],x.split('/')[1]]:[x]);
  t=t.map(x=>RT[x]&&t[0]==='kubectl'?RT[x]:x).map(x=>({'--all':'-a','--force':'-f','--all-namespaces':'-A','--detach':'-d','--publish':'-p','--env':'-e','--volume':'-v','--net':'--network','ns':'namespaces'}[x]||x));
  const head=t.slice(0,2),flags=[],pos=[];for(let i=2;i<t.length;i++){const x=t[i];if(x.startsWith('-')&&x!=='-'){const valued=t[0]==='kubectl'?(i+1<t.length&&/^--(image|replicas|port|type|target-port|name|to-revision|revision)$|^(-n|-o|-l|-f)$/.test(x)):((isBuild&&x==='-t')||VALUED_D.has(x));if(valued){flags.push(x+'='+t[++i])}else flags.push(x)}else pos.push(x)}
  return head.concat(flags.sort(),pos).join(' ')}

/* ---------- puzzles ---------- */
const PZ_DF=[
 {t:'Python web app',intro:'Put the lines in order so the image builds and starts the app. Dependencies (the libraries the app needs, listed in requirements.txt and installed by pip) should install before the code is copied, so the cache helps on rebuilds.',lines:['FROM python:3.12-slim','WORKDIR /app','COPY requirements.txt .','RUN pip install -r requirements.txt','COPY . .','EXPOSE 5000','CMD ["python", "app.py"]'],
  why:'FROM is always first. requirements.txt is copied and installed before the rest of the code, so changing app.py does not re-run pip install. CMD goes last because it only says what to run when a container starts.'},
 {t:'Static website on nginx',intro:'This image only serves HTML files. Order the lines.',lines:['FROM nginx:1.27-alpine','COPY index.html /usr/share/nginx/html/','COPY style.css /usr/share/nginx/html/','EXPOSE 80'],
  why:'Start from nginx, copy the files into the folder nginx serves from, and document port 80. No CMD needed: the nginx base image already has one.'},
 {t:'Node API, with a trap',intro:'One of these lines does not belong in a Dockerfile at all. Leave it out and order the rest.',lines:['FROM node:20-alpine','WORKDIR /app','COPY package.json .','RUN npm install','COPY . .','CMD ["node", "server.js"]'],extra:['RUN docker run -p 3000:3000 node'],
  why:'docker run is something you type on your laptop to start a container. It never goes inside a Dockerfile, because the Dockerfile only describes how to build the image.'},
];
const PZ_Y=[
 {t:'A Deployment',intro:'Fill the blanks so this creates 3 nginx pods that the deployment can find. apiVersion says which version of Kubernetes\' file format this is, kind is the type of object, spec is what you want, matchLabels says which pods belong to it, and template is the recipe for each pod.',src:`apiVersion: apps/v1
kind: {{0}}
metadata:
  name: web
spec:
  replicas: {{1}}
  selector:
    matchLabels:
      app: {{2}}
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: {{3}}`,blanks:[['Deployment','Pod','Service','Container'],['3','"three"','3 pods','[3]'],['web','nginx','pod','app'],['nginx:1.27','docker pull nginx','nginx 1.27','http://nginx']],
  answer:['Deployment','3','web','nginx:1.27'],why:'kind says what the object is. replicas is a plain number. The selector must match the template labels (app: web) or Kubernetes rejects it. image uses the same name:tag you use with docker.'},
 {t:'A Service',intro:'Route port 80 to the web pods, reachable on a port of every node. targetPort is the port inside the pod that traffic is sent on to.',src:`apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: {{0}}
  selector:
    app: {{1}}
  ports:
    - port: {{2}}
      targetPort: 80`,blanks:[['NodePort','Public','Docker','Deployment'],['web','nginx','service','all'],['80','"eighty"','web','nginx']],
  answer:['NodePort','web','80'],why:'NodePort opens a port on every node. The selector picks pods by their label app: web. port is what the service listens on; targetPort is where the pod listens.'},
 {t:'A Compose file',intro:'Publish the site on laptop port 8080 and let it reach the database by name. depends_on says which service to start first.',src:`services:
  site:
    image: nginx:1.27
    ports:
      - "{{0}}"
    environment:
      DB_HOST: {{1}}
    depends_on:
      - db
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: secret
    volumes:
      - {{2}}`,blanks:[['8080:80','80:8080','8080','localhost:8080'],['db','localhost','postgres:16','172.17.0.1'],['dbdata:/var/lib/postgresql/data','/var/lib/postgresql/data','dbdata','postgres']],
  answer:['8080:80','db','dbdata:/var/lib/postgresql/data'],why:'Ports read HOST:CONTAINER, the same as docker run -p. Services reach each other by service name, here db. A named volume is NAME:/path/in/container. (You would also list dbdata under a top-level volumes: key, as compose.yaml does.)'},
];
const RANKS=[[0,'Deckhand'],[120,'Dockworker'],[300,'Rigger'],[520,'Shipwright'],[800,'Harbor Pilot'],[1080,'Fleet Captain']];

/* ---------- field guide data ---------- */
const GUIDE=[
 [['docker version','is Docker installed and running?'],['docker run hello-world','test run'],['docker ps','running containers'],['docker ps -a','all containers, stopped too'],['docker images','images on this machine']],
 [['docker pull nginx','download, tag latest'],['docker pull nginx:1.26','a specific version'],['docker history nginx','see the layers'],['docker rmi nginx:1.26','remove an image']],
 [['docker run -d --name web nginx','background, with a name'],['docker logs web','what it printed'],['docker exec -it web sh','a shell inside'],['docker stop web','stop it'],['docker start web','start it again'],['docker rm -f web','delete, even if running']],
 [['docker run -d -p 8080:80 nginx','laptop 8080 → container 80'],['curl localhost:8080','request the page'],['docker network create shopnet','a network with names'],['docker run -d --network shopnet --name cache redis','join the network'],['docker network ls','list networks']],
 [['docker volume create notes','create storage that survives'],['docker run -it --rm -v notes:/data alpine sh','mount it at /data'],['docker volume ls','list volumes'],['docker run -d -e POSTGRES_PASSWORD=secret postgres','pass a setting']],
 [['cat Dockerfile','the recipe'],['docker build -t shop:1.0 .','build and name it'],['docker history shop:1.0','your layers'],['docker run -d -p 3000:3000 shop:1.0','run your image'],['docker tag shop:1.0 yourname/shop:1.0','name it for Docker Hub (the public image shelf)'],['docker push yourname/shop:1.0','upload it']],
 [['docker compose up -d','start everything in compose.yaml'],['docker compose ps','this project\'s containers'],['docker compose logs web','one service\'s logs'],['docker compose down','stop and remove (volumes stay)'],['docker compose down -v','also delete the volumes']],
 [['kubectl cluster-info','where the API server is'],['kubectl get nodes','the machines'],['kubectl get pods -A','pods in every namespace'],['kubectl run hello --image=nginx','one bare pod'],['kubectl describe pod hello','details and events'],['kubectl delete pod hello','delete it']],
 [['kubectl create deployment web --image=nginx:1.26 --replicas=3','keep 3 copies running'],['kubectl get deploy','deployments'],['kubectl get pods -o wide','pods with IPs and nodes'],['kubectl scale deployment web --replicas=5','change the count'],['kubectl get rs','the ReplicaSets']],
 [['kubectl expose deployment web --port=80 --type=NodePort','one address for all pods'],['kubectl get svc','services'],['kubectl describe svc web','selector and endpoints'],['kubectl port-forward svc/web 9090:80','tunnel from your laptop'],['kubectl get pods --show-labels','see the labels'],['kubectl get pods -l app=web','filter by label']],
 [['kubectl set image deployment/web nginx=nginx:1.27','start a rolling update'],['kubectl rollout status deployment/web','is it done?'],['kubectl rollout history deployment/web','past revisions'],['kubectl rollout undo deployment/web','go back one'],['kubectl rollout restart deployment/web','replace all pods, same version']],
 [['kubectl create namespace shop','a separate area'],['kubectl apply -f shop.yaml','create or update from a file'],['kubectl get all -n shop','everything in a namespace'],['kubectl exec POD -n shop -- env','run a command in a pod'],['kubectl logs POD','a pod\'s output'],['kubectl delete -f shop.yaml','delete what the file made']],
];

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
  else{const m=ch.missions[S.mi];const done=S.done[S.ch+'.'+S.mi];
    h=`<div class="eyebrow">Chapter ${S.ch+1} · Mission ${S.mi+1} of ${n}${done?' · done':''}</div><h2>${esc(m.t)}</h2><p class="intro">${m.i}</p>
    <div class="goal"><div class="label">Your move</div><p>${m.g}</p></div>${m.a?anatomy(m.a):''}${HowSteps.html(m.how)}
    <div class="actions"><button class="btn ghost" data-act="hint">${hintOpen?'Hide hint':'Hint'}</button><button class="btn ghost" data-act="show">Fill it in for me</button>${done?`<button class="btn ghost" data-act="skip">Next mission</button>`:''}</div>
    ${hintOpen?`<p class="hint">${esc(m.h)}</p>`:''}${picH(S.mi===0)}${dotsH}`}
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
    return `<button class="ctr ${st}${c.id===ins?' inside':''}${nu(c.id)}${HIT===c.id?' hit':''}" data-ctr="${esc(c.name)}" title="Click to fill a command for ${esc(c.name)}"><span class="st" aria-hidden="true"></span><span class="nm">${esc(c.name)}</span><span class="stt">${c.status==='running'?'running':c.status==='created'?'created':'exited ('+c.code+')'}</span><span class="im">${esc(c.image)}</span><span class="meta">${chips.join('')}</span></button>`}).join('')}</div>`:`<div class="empty">No containers. <code>docker run</code> creates one.</div>`;
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
      return `<button class="pod ${cls}${nu('p'+p.ns+p.name)}${HIT===p.name?' hit':''}${ins===p.name?' inside':''}" style="--c:${cls==='bad'?'var(--err)':appColor(app)}" data-pod="${esc(p.name)}" data-ns="${esc(p.ns)}" title="${esc(p.name)} · ${esc(st)} · ${esc(p.image)}"><b>${esc(app)}</b><small>${esc(p.name.slice(-5))} · ${esc(ref(p.image).tag)}</small><em>${esc(SHORT[st]||st)}</em>${p.ns!=='default'?`<span class="nst">${esc(p.ns)}</span>`:''}</button>`}).join(''):'<span class="nopods">no app pods</span>'}</div><small class="sysn">+ ${sysn} system pods</small></div>`};
  return {html:`<p class="mapsub">Your kind cluster, live. Pods appear, move through their states and get replaced as you type. Click a pod to fill in a command for it.</p>
    ${cp}${svcH?`<div class="vsec"><div class="vlab"><span>Services</span></div>${svcH}</div>`:''}${depH?`<div class="vsec"><div class="vlab"><span>Deployments</span></div>${depH}</div>`:''}
    <div class="vsec"><div class="vlab"><span>Worker nodes</span><span>${userPods.filter(live).length} app pods</span></div><div class="nodes">${node(NODES[1])}${node(NODES[2])}</div></div>
    <div class="legend"><span><span class="sw" style="background:var(--ok)"></span>running</span><span><span class="sw dash"></span>starting</span><span><span class="sw" style="background:var(--err)"></span>failing</span><span><span class="sw" style="background:var(--line)"></span>stopping</span></div>`,ids}}
function renderView(fresh){const mode=viewMode();$('#vDocker').setAttribute('aria-pressed',String(mode==='docker'));$('#vK8s').setAttribute('aria-pressed',String(mode==='k8s'));
  $('#vTitle').textContent=mode==='docker'?'Your laptop':'The cluster';
  const r=mode==='docker'?dockerView(fresh):k8sView(fresh);$('#view').innerHTML=r.html;known=r.ids;HIT=null}
function onTick(){if(!$('#tab-quest').hidden)renderView(true);if(insideLost){insideLost=false;addLine(esc('(The pod you were inside was deleted, so you are back on your laptop.)'),'sys');renderPrompt();renderWhere();scrollDown()}}
function renderAll(){renderPrompt();renderWhere();renderChapters();renderMission();renderXP();renderView(true)}
function setupChapter(i){const ch=CH[i];const msgs=[];if(ch.files){const n=ensureFiles(ch.files);if(n)msgs.push(`(New file${n>1?'s':''} in your folder: ${ch.files.join(', ')}.)`)}if(ch.setup){const m=ch.setup();if(m)msgs.push(m)}return msgs}
function goChapter(i){S.ch=i;hintOpen=false;S.view='auto';const open=CH[i].missions.findIndex((m,j)=>!S.done[i+'.'+j]);S.mi=open<0?CH[i].missions.length:open;
  setupChapter(i).forEach(m=>addLine(esc(m),'sys'));known=null;renderAll();save();scrollDown()}
/* missions */
function checkMission(c){const ch=CH[S.ch];if(S.mi>=ch.missions.length)return;const m=ch.missions[S.mi];if(S.done[S.ch+'.'+S.mi])return; /* revisiting a finished mission never celebrates it again */
  let good=false;try{good=!!m.ok(c)}catch(e){}if(!good)return;
  const key=S.ch+'.'+S.mi,isNew=!S.done[key];S.done[key]=1;if(isNew)S.xp+=10;hintOpen=false;
  addLine(esc(`✓ Mission complete: ${m.t}${isNew?'   +10 XP':''}`),'win');if(m.after)addLine(HowSteps.tick(m.after,esc),'note');
  const next=ch.missions.findIndex((x,j)=>j>S.mi&&!S.done[S.ch+'.'+j]);
  if(next>=0)S.mi=next;else{const first=ch.missions.findIndex((x,j)=>!S.done[S.ch+'.'+j]);if(first>=0)S.mi=first;
    else{S.mi=ch.missions.length;if(!S.badges[S.ch]){S.badges[S.ch]=1;S.xp+=25;addLine(esc(`★ Chapter complete! Badge earned: ${ch.badge}   +25 XP`),'win big')}}}
  pop=true}
function run(line){addLine(promptHTML()+esc(line));if(line.trim())S.hist.push(line);histIdx=S.hist.length;
  if(line.trim()){const r=execLine(line);let text=[];for(const o of r.out){if(o.clear){screen.innerHTML='';continue}addLine(paint(o),o.c);text.push(o.t)}
    checkMission({line,out:text.join('\n'),code:r.code});
    if(pendingEdit){const f=pendingEdit;pendingEdit=null;setTimeout(()=>openEditor(f),30)}}
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
$('#mission').addEventListener('click',e=>{const d=e.target.closest('[data-mi]');if(d){S.mi=+d.dataset.mi;hintOpen=false;renderMission();save();return}
  const a=e.target.closest('[data-act]');if(!a)return;const act=a.dataset.act;const m=CH[S.ch].missions[S.mi];
  if(act==='hint'){hintOpen=!hintOpen;renderMission()}else if(act==='show'&&m){fill(ansOf(m))}else if(act==='skip'){S.mi=Math.min(S.mi+1,CH[S.ch].missions.length);hintOpen=false;renderMission();save()}
  else if(act==='nextch')goChapter(S.ch+1);else if(act==='tab-fire')showTab('fire');else if(act==='tab-guide')showTab('guide')});
$('#view').addEventListener('click',e=>{const m=CH[S.ch].missions[S.mi]||{};const p=e.target.closest('[data-pod]');
  if(p){const pd={name:p.dataset.pod,ns:p.dataset.ns};fill(m.fill&&m.fill.pod?m.fill.pod(pd):`kubectl describe pod ${pd.name}${pd.ns!=='default'?' -n '+pd.ns:''}`);return}
  const c=e.target.closest('[data-ctr]');if(c){fill(m.fill&&m.fill.ctr?m.fill.ctr(c.dataset.ctr):`docker logs ${c.dataset.ctr}`);return}
  const f=e.target.closest('[data-fill]');if(f)fill(f.dataset.fill)});
$('#vseg').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(!b)return;const v=b.dataset.v;S.view=v===CH[S.ch].view?'auto':v;known=null;renderView(false);save()});
let armT=null;$('#resetWorld').addEventListener('click',e=>{const b=e.currentTarget;if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to wipe all containers, images and the cluster';clearTimeout(armT);armT=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset world'},4000);return}
  b.classList.remove('armed');b.textContent='Reset world';const f=fresh();S.d=f.d;S.k=f.k;S.files={};S.inside=null;S.flag={};const msgs=setupChapter(S.ch);screen.innerHTML='';addLine(esc('(World reset: no containers, no images, a fresh cluster. Your XP and badges are kept.)'),'sys');msgs.forEach(m=>addLine(esc(m),'sys'));known=null;renderAll();save()});
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
    S=fresh();screen.innerHTML='';setupChapter(0);try{localStorage.removeItem(KEY)}catch(x){}save();known=null;showTab('quest');renderAll();addLine(esc('(Fresh start. Welcome aboard.)'),'sys')}});
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
  window.__hq={run,get S(){return S},skip:ms=>{skew+=ms;tick();lastRec=0;tick()},tick,canon,CH,parseYaml};
}
boot();
})();

