(function (HQ) { 'use strict';
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
Object.assign(HQ,{HUB,ref,hubOk,verOf,MSG0,FILES,parseYaml});
})(window.HQ = window.HQ || {});
