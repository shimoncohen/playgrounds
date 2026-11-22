(function (HQ) { 'use strict';
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
 pic(row(grp('container',bx('writable layer','deleted with the container','dim')),ar('-v logbook:/data'),bx('volume: logbook','lives outside, survives','v')),
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
Object.assign(HQ,{PICS});
})(window.HQ = window.HQ || {});
