(function (HQ) { 'use strict';
const {hsh,now,hhex}=HQ;
const KEY='harbor-quest-v1';
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
HQ.S=S;
HQ.resetState=()=>{const f=fresh();Object.keys(S).forEach(k=>delete S[k]);Object.assign(S,f)};
Object.assign(HQ,{KEY,NODES,fresh,save,saveSoon});
})(window.HQ = window.HQ || {});
