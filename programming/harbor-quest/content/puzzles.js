(function (HQ) { 'use strict';
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
Object.assign(HQ,{PZ_DF,PZ_Y});
})(window.HQ = window.HQ || {});
