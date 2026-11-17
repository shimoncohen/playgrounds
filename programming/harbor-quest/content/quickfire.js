(function (HQ) { 'use strict';
const {CH,tokenize,RT}=HQ;
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
['Create a volume called logbook',['docker volume create logbook'],4],
['List volumes',['docker volume ls'],4],
['Start an interactive alpine shell with the volume logbook at /data',['docker run -it -v logbook:/data alpine sh'],4],
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
Object.assign(HQ,{QF,qfOpen,canon});
})(window.HQ = window.HQ || {});
