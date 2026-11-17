(function (HQ) { 'use strict';
/* ---------- field guide data ---------- */
const GUIDE=[
 [['docker version','is Docker installed and running?'],['docker run hello-world','test run'],['docker ps','running containers'],['docker ps -a','all containers, stopped too'],['docker images','images on this machine']],
 [['docker pull nginx','download, tag latest'],['docker pull nginx:1.26','a specific version'],['docker history nginx','see the layers'],['docker rmi nginx:1.26','remove an image']],
 [['docker run -d --name web nginx','background, with a name'],['docker logs web','what it printed'],['docker exec -it web sh','a shell inside'],['docker stop web','stop it'],['docker start web','start it again'],['docker rm -f web','delete, even if running']],
 [['docker run -d -p 8080:80 nginx','laptop 8080 → container 80'],['curl localhost:8080','request the page'],['docker network create shopnet','a network with names'],['docker run -d --network shopnet --name cache redis','join the network'],['docker network ls','list networks']],
 [['docker volume create logbook','create storage that survives'],['docker run -it --rm -v logbook:/data alpine sh','mount it at /data'],['docker volume ls','list volumes'],['docker run -d -e POSTGRES_PASSWORD=secret postgres','pass a setting']],
 [['cat Dockerfile','the recipe'],['docker build -t shop:1.0 .','build and name it'],['docker history shop:1.0','your layers'],['docker run -d -p 3000:3000 shop:1.0','run your image'],['docker tag shop:1.0 yourname/shop:1.0','name it for Docker Hub (the public image shelf)'],['docker push yourname/shop:1.0','upload it']],
 [['docker compose up -d','start everything in compose.yaml'],['docker compose ps','this project\'s containers'],['docker compose logs web','one service\'s logs'],['docker compose down','stop and remove (volumes stay)'],['docker compose down -v','also delete the volumes']],
 [['kubectl cluster-info','where the API server is'],['kubectl get nodes','the machines'],['kubectl get pods -A','pods in every namespace'],['kubectl run hello --image=nginx','one bare pod'],['kubectl describe pod hello','details and events'],['kubectl delete pod hello','delete it']],
 [['kubectl create deployment web --image=nginx:1.26 --replicas=3','keep 3 copies running'],['kubectl get deploy','deployments'],['kubectl get pods -o wide','pods with IPs and nodes'],['kubectl scale deployment web --replicas=5','change the count'],['kubectl get rs','the ReplicaSets']],
 [['kubectl expose deployment web --port=80 --type=NodePort','one address for all pods'],['kubectl get svc','services'],['kubectl describe svc web','selector and endpoints'],['kubectl port-forward svc/web 9090:80','tunnel from your laptop'],['kubectl get pods --show-labels','see the labels'],['kubectl get pods -l app=web','filter by label']],
 [['kubectl set image deployment/web nginx=nginx:1.27','start a rolling update'],['kubectl rollout status deployment/web','is it done?'],['kubectl rollout history deployment/web','past revisions'],['kubectl rollout undo deployment/web','go back one'],['kubectl rollout restart deployment/web','replace all pods, same version']],
 [['kubectl create namespace shop','a separate area'],['kubectl apply -f shop.yaml','create or update from a file'],['kubectl get all -n shop','everything in a namespace'],['kubectl exec POD -n shop -- env','run a command in a pod'],['kubectl logs POD','a pod\'s output'],['kubectl delete -f shop.yaml','delete what the file made']],
];
Object.assign(HQ,{GUIDE});
})(window.HQ = window.HQ || {});
