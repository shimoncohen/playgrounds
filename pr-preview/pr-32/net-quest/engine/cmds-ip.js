/* Network Quest ip command: addr, route, neigh and link, printed the way iproute2 prints them. Each device keeps one
   address per interface. Errors are one line in err and leave the device untouched. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const IPX=NQ.ip,MACRE=/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
const ok=(...out)=>({out,err:[],code:0});
const bad=msg=>({out:[],err:[msg],code:1});
const USAGE=[
  'Usage: ip [ addr | route | neigh | link ] ...',
  '  ip addr [show] [dev IF]            ip addr add|del <addr/prefix> dev IF',
  '  ip route [show]                    ip route add <dst> via <ip> [dev IF] | dev IF',
  '  ip route del <dst>                 (<dst> is default or an address/prefix)',
  '  ip neigh [show] [dev IF]           ip neigh add <ip> lladdr <mac> dev IF | ip neigh del <ip> dev IF',
  '  ip link [show]                     ip link set IF up|down'
];
const OBJ={addr:'addr',address:'addr',a:'addr',route:'route',r:'route',neigh:'neigh',neighbor:'neigh',n:'neigh',link:'link',l:'link'};
const noDev=n=>bad('Cannot find device "'+n+'"');
const iface=(dev,n)=>Object.prototype.hasOwnProperty.call(dev.ifaces,n)?dev.ifaces[n]:null;
const cidrOf=i=>i.ip&&IPX.cidr(i.ip);
const bareIf=(s,p)=>p===32?s:s+'/'+p;
const badPrefix=a=>bad('Error: inet prefix is expected rather than "'+a+'".');
const badAddr=a=>bad('Error: inet address is expected rather than "'+a+'".');

/* the optional `[dev] IF` filter after show: returns {names} or an error result */
const names=(dev,args)=>{
  const all=Object.keys(dev.ifaces);
  if(!args.length)return {names:all};
  const n=args[0]==='dev'?args[1]:args[0];
  if(n===undefined||args.length>(args[0]==='dev'?2:1))return {error:bad('Usage: ip <addr|link|neigh> show [dev <interface>]')};
  return iface(dev,n)?{names:[n]}:{error:bad('Device "'+n+'" does not exist.')};
};
const head=(dev,n)=>{
  const i=dev.ifaces[n],idx=Object.keys(dev.ifaces).indexOf(n)+1;
  return [idx+': '+n+': <BROADCAST,MULTICAST'+(i.up?',UP,LOWER_UP':'')+'> mtu 1500 state '+(i.up?'UP':'DOWN'),'    link/ether '+i.mac+' brd ff:ff:ff:ff:ff:ff'];
};

const addrShow=(net,dev,args)=>{
  const f=names(dev,args);
  if(f.error)return f.error;
  const out=[];
  for(const n of f.names){
    out.push(...head(dev,n));
    const i=dev.ifaces[n],c=cidrOf(i);
    if(c)out.push('    inet '+i.ip+(c.prefix<31?' brd '+IPX.fmt(c.bcast):'')+' scope global '+n);
  }
  return ok(...out);
};
const addrChange=(add)=>(net,dev,args)=>{
  const use='Usage: ip addr '+(add?'add':'del')+' <addr/prefix> dev <interface>';
  if(args.length!==3||args[1]!=='dev')return bad(use);
  if(!IPX.cidr(args[0]))return badPrefix(args[0]);
  const i=iface(dev,args[2]);
  if(!i)return noDev(args[2]);
  if(add){
    if(i.ip)return bad('Error: '+args[2]+' already has '+i.ip+'; remove it first with: ip addr del '+i.ip+' dev '+args[2]);
    i.ip=args[0];
  }else{
    if(i.ip!==args[0])return bad('RTNETLINK answers: Cannot assign requested address');
    i.ip=null;
  }
  return ok();
};

/* a route destination: 'default' or a normalised CIDR (a bare address is a /32) */
const parseDst=a=>{
  if(a==='default')return {dst:'default'};
  const c=IPX.cidr(a.includes('/')?a:a+'/32');
  if(!c)return {error:badPrefix(a)};
  if(c.ip!==c.net)return {error:bad('Error: Invalid prefix for given prefix length.')};
  return {dst:c.prefix?IPX.fmt(c.net)+'/'+c.prefix:'default'};
};
const routeShow=(net,dev)=>{
  const out=[];
  for(const [n,i] of Object.entries(dev.ifaces)){
    const c=cidrOf(i);
    if(c&&i.up)out.push(bareIf(IPX.fmt(c.net),c.prefix)+' dev '+n+' proto kernel scope link src '+IPX.fmt(c.ip));
  }
  for(const r of dev.routes)out.push(r.dst.replace(/\/32$/,'')+(r.via?' via '+r.via+' dev '+r.dev:' dev '+r.dev+' scope link'));
  return ok(...out);
};
const ROUTE_ADD='Usage: ip route add <dst> via <ip> [dev <interface>]   or   ip route add <dst> dev <interface>';
const routeAdd=(net,dev,args)=>{
  if(!args.length)return bad(ROUTE_ADD);
  const o={};
  for(let k=1;k<args.length;k+=2){
    if((args[k]!=='via'&&args[k]!=='dev')||args[k+1]===undefined||o[args[k]]!==undefined)return bad(ROUTE_ADD);
    o[args[k]]=args[k+1];
  }
  if(o.via===undefined&&o.dev===undefined)return bad(ROUTE_ADD);
  const d=parseDst(args[0]);
  if(d.error)return d.error;
  let v=null;
  if(o.via!==undefined){
    v=IPX.parse(o.via);
    if(v===null)return badAddr(o.via);
  }
  if(o.dev!==undefined&&!iface(dev,o.dev))return noDev(o.dev);
  let out=o.dev;
  if(v!==null){
    const ifs=Object.entries(dev.ifaces).filter(([n,i])=>i.up&&cidrOf(i)&&(out===undefined||n===out));
    if(ifs.some(([,i])=>IPX.parse(i.ip.split('/')[0])===v))return bad('Error: Nexthop has invalid gateway.');
    const hit=ifs.find(([,i])=>IPX.inSubnet(v,cidrOf(i)));
    if(!hit)return bad('Error: Nexthop has invalid gateway.');
    out=hit[0];
  }
  if(dev.routes.some(r=>r.dst===d.dst))return bad('RTNETLINK answers: File exists');
  dev.routes.push({dst:d.dst,via:v===null?null:o.via,dev:out});
  return ok();
};
const routeDel=(net,dev,args)=>{
  if(!args.length)return bad('Usage: ip route del <dst>');
  const d=parseDst(args[0]);
  if(d.error)return d.error;
  const k=dev.routes.findIndex(r=>r.dst===d.dst);
  if(k<0)return bad('RTNETLINK answers: No such process');
  dev.routes.splice(k,1);
  return ok();
};

const owner=(dev,ip)=>{
  const n=IPX.parse(ip),all=Object.entries(dev.ifaces);
  const hit=all.find(([,i])=>{const c=cidrOf(i);return c&&n!==null&&IPX.inSubnet(n,c);});
  return hit?hit[0]:all.length?all[0][0]:'';
};
const neighShow=(net,dev,args)=>{
  const f=names(dev,args);
  if(f.error)return f.error;
  const perm=dev.permanent||[];
  return ok(...Object.entries(dev.neigh).map(([ip,mac])=>[ip,owner(dev,ip),mac]).filter(e=>f.names.includes(e[1]))
    .map(([ip,n,mac])=>ip+' dev '+n+' lladdr '+mac.toLowerCase()+(perm.includes(ip)?' PERMANENT':' REACHABLE')));
};
const neighAdd=(net,dev,args)=>{
  if(args.length!==5||args[1]!=='lladdr'||args[3]!=='dev')return bad('Usage: ip neigh add <ip> lladdr <mac> dev <interface>');
  if(IPX.parse(args[0])===null)return badAddr(args[0]);
  if(!MACRE.test(args[2]))return bad('Error: lladdr is expected rather than "'+args[2]+'".');
  if(!iface(dev,args[4]))return noDev(args[4]);
  dev.permanent=dev.permanent||[];
  dev.neigh[args[0]]=args[2].toLowerCase();
  if(!dev.permanent.includes(args[0]))dev.permanent.push(args[0]);
  return ok();
};
const neighDel=(net,dev,args)=>{
  if(args.length!==3||args[1]!=='dev')return bad('Usage: ip neigh del <ip> dev <interface>');
  if(IPX.parse(args[0])===null)return badAddr(args[0]);
  if(!iface(dev,args[2]))return noDev(args[2]);
  if(!Object.prototype.hasOwnProperty.call(dev.neigh,args[0]))return bad('RTNETLINK answers: No such file or directory');
  delete dev.neigh[args[0]];
  dev.permanent=(dev.permanent||[]).filter(x=>x!==args[0]);
  return ok();
};

const linkShow=(net,dev,args)=>{
  const f=names(dev,args);
  return f.error||ok(...f.names.flatMap(n=>head(dev,n)));
};
const linkSet=(net,dev,args)=>{
  if(args[0]==='dev')args=args.slice(1);
  if(args.length!==2)return bad('Usage: ip link set <interface> up|down');
  const i=iface(dev,args[0]);
  if(!i)return noDev(args[0]);
  if(args[1]!=='up'&&args[1]!=='down')return bad('Error: argument "'+args[1]+'" is wrong: use "up" or "down"');
  i.up=args[1]==='up';
  return ok();
};

const VERBS={
  addr:{show:addrShow,list:addrShow,add:addrChange(true),del:addrChange(false),delete:addrChange(false)},
  route:{show:routeShow,list:routeShow,add:routeAdd,del:routeDel,delete:routeDel},
  neigh:{show:neighShow,list:neighShow,add:neighAdd,del:neighDel,delete:neighDel},
  link:{show:linkShow,list:linkShow,set:linkSet}
};
NQ.reg('ip','show and change addresses, routes, neighbours and links (try: ip help)',(net,dev,args)=>{
  if(!args.length||args[0]==='help')return ok(...USAGE);
  const obj=Object.prototype.hasOwnProperty.call(OBJ,args[0])?OBJ[args[0]]:null;
  if(!obj)return bad('Object "'+args[0]+'" is unknown, try "ip help".');
  const verb=args.length>1?args[1]:'show',rest=args.slice(2);
  if(verb==='help')return ok(...USAGE);
  const v=VERBS[obj];
  if(!Object.prototype.hasOwnProperty.call(v,verb))return bad('Command "'+verb+'" is unknown, try "ip help".');
  return v[verb](net,dev,rest);
});
})();
