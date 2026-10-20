/* Network Quest simulator: frames move through an explicit FIFO queue, one delivery at a time, and every step is a
   log entry. A ping is one "session" (ctx) holding the queue, the packets parked while ARP resolves, and what came
   back. Part 1: ARP, switching and local delivery; routing and TTL arrive in Task 6, NAT in Task 7. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const P=NQ.pkt;
const BCAST='ff:ff:ff:ff:ff:ff',ZERO='00:00:00:00:00:00',STEP_LIMIT=500;
const REASONS={noRoute:'no route',ifDown:'interface down',unreachable:'host unreachable',ttl:'ttl exceeded',noAddr:'no address'};
const addr=c=>c.split('/')[0];
const layer=(p,name)=>p.layers.find(l=>l.name===name);

/* log: snapshot the packet, stamp it with the clock, append to net.log and to this session's entries */
const log=(ctx,dev,iface,dir,verdict,packet)=>{
  const e={t:ctx.net.clock++,dev,iface,dir,verdict,packet:P.clone(packet)};
  ctx.net.log.push(e);ctx.entries.push(e);
  return e;
};
const drop=(ctx,dev,iface,packet,verdict)=>log(ctx,dev,iface,'drop',verdict,packet);

/* put a frame on the wire: log it, then queue it for whatever is at the far end of the link. tag rides along off
   the wire: {path} on copies of this ping's echo request (never matched on header fields, which NAT may rewrite). */
const transmit=(ctx,dev,iface,packet,verdict,dir,tag)=>{
  log(ctx,dev.id,iface,dir||'tx',verdict,packet);
  const peer=dev.ifaces[iface].peer;
  if(!peer)return;
  const [d,i]=peer.split('.');
  ctx.queue.push({dev:d,iface:i,packet:P.clone(packet),tag:tag?{path:tag.path.slice()}:null});
};
/* the probe passed through devId: extend its path (unique ids, in order) */
const via=(tag,devId)=>tag&&{path:tag.path.includes(devId)?tag.path.slice():[...tag.path,devId]};

/* routing decision. Part 1: connected subnets only. Task 6 replaces this with the full route lookup. */
const nextHop=(dev,dstIp)=>{
  const n=NQ.ip.parse(dstIp);
  for(const [name,i] of Object.entries(dev.ifaces)){
    const c=i.ip&&NQ.ip.cidr(i.ip);
    if(c&&NQ.ip.inSubnet(n,c))return {iface:name,nextIp:dstIp};
  }
  return null;
};
const ownIface=(dev,ip)=>Object.keys(dev.ifaces).find(n=>dev.ifaces[n].up&&dev.ifaces[n].ip&&addr(dev.ifaces[n].ip)===ip)||null;

/* ARP: ask who has ip, and park packets until the answer comes (or never does) */
const arpRequest=(ctx,dev,iface,ip)=>{
  const i=dev.ifaces[iface];
  transmit(ctx,dev,iface,P.stack(P.eth(i.mac,BCAST,'ARP'),P.arp('request',i.mac,addr(i.ip),ZERO,ip)),'ARP request: who has '+ip+'?');
};
const pendingKey=(dev,ip)=>dev.id+'|'+ip;
/* send an IP packet (just the IPv4+ICMP layers) from a node: route, resolve the MAC, frame it. Returns a reason on a
   local failure (no route, interface down), else null; an unresolved ARP is reported when the session ends.
   o: {tag, inIface, quiet}. Unless quiet (the origin's first send, reported by ping itself), a failure is logged as a
   drop at this device (on the egress iface, or inIface when there is none) and becomes ctx.fail. */
const ipSend=(ctx,dev,ipLayers,verdict,o)=>{
  o=o||{};
  const ip=ipLayers[0].fields,h=nextHop(dev,ip.dst);
  const fail=reason=>{
    if(!o.quiet){
      drop(ctx,dev.id,h?h.iface:o.inIface,P.stack(...ipLayers),'cannot send to '+ip.dst+': '+reason);
      if(!ctx.fail)ctx.fail=reason;
    }
    return reason;
  };
  if(!h)return fail(REASONS.noRoute);
  const i=dev.ifaces[h.iface];
  if(!i.up)return fail(REASONS.ifDown);
  const mac=dev.neigh[h.nextIp];
  if(mac){transmit(ctx,dev,h.iface,P.stack(P.eth(i.mac,mac,'IPv4'),...ipLayers),verdict,'tx',o.tag);return null;}
  const k=pendingKey(dev,h.nextIp);
  if(!ctx.pending[k]){ctx.pending[k]={dev:dev.id,iface:h.iface,ip:h.nextIp,items:[]};arpRequest(ctx,dev,h.iface,h.nextIp);}
  ctx.pending[k].items.push({ipLayers,verdict,tag:o.tag||null});
  return null;
};
/* an ARP reply arrived: send whatever was waiting for that address */
const flush=(ctx,dev,ip)=>{
  const k=pendingKey(dev,ip),w=ctx.pending[k];
  if(!w)return;
  delete ctx.pending[k];
  for(const it of w.items)ipSend(ctx,dev,it.ipLayers,it.verdict,{tag:it.tag,inIface:w.iface});
};

/* switch: learn the source MAC, then forward known unicast out one port or flood out every other up port */
const switchRx=(ctx,dev,iface,p,tag)=>{
  const e=p.layers[0].fields;
  dev.macTable[e.src]=iface;
  const out=e.dst===BCAST?null:dev.macTable[e.dst];
  if(out===iface)return drop(ctx,dev.id,iface,p,'filtered: destination is on the port it came from');
  if(out){
    if(!dev.ifaces[out].up)return drop(ctx,dev.id,out,p,REASONS.ifDown);
    return transmit(ctx,dev,out,p,'forwarded out '+out,'fwd',via(tag,dev.id));
  }
  const ports=Object.keys(dev.ifaces).filter(n=>n!==iface&&dev.ifaces[n].up);
  if(!ports.length)return drop(ctx,dev.id,iface,p,'no other port to flood to');
  const why=e.dst===BCAST?'flooded: broadcast':'flooded: destination MAC unknown';
  for(const n of ports)transmit(ctx,dev,n,p,why,'fwd',via(tag,dev.id));
};

/* host or router NIC: ARP for us gets an answer, IP for us gets handled, the rest is dropped.
   ARP is per segment: only the receiving iface's own address is answered; IP accepts any of the device's addresses. */
const arpRx=(ctx,dev,iface,p)=>{
  const a=layer(p,'ARP').fields;
  if(a.op==='request'){
    const ri=dev.ifaces[iface];
    if(!ri.ip||addr(ri.ip)!==a.tpa)return drop(ctx,dev.id,iface,p,'not addressed to this host');
    dev.neigh[a.spa]=a.sha;
    log(ctx,dev.id,iface,'rx','ARP request: '+a.tpa+' is me, learned '+a.spa+' is at '+a.sha,p);
    const m=dev.ifaces[iface].mac;
    return transmit(ctx,dev,iface,P.stack(P.eth(m,a.sha,'ARP'),P.arp('reply',m,a.tpa,a.sha,a.spa)),'ARP reply: '+a.tpa+' is at '+m);
  }
  if(a.tha!==dev.ifaces[iface].mac)return drop(ctx,dev.id,iface,p,'not addressed to this host');
  dev.neigh[a.spa]=a.sha;
  log(ctx,dev.id,iface,'rx','ARP reply: learned '+a.spa+' is at '+a.sha,p);
  flush(ctx,dev,a.spa);
};
/* not for any of our addresses. Task 6: routers forward here; hosts never do. */
const forward=(ctx,dev,iface,p,tag)=>drop(ctx,dev.id,iface,p,'not addressed to this host');
const ipRx=(ctx,dev,iface,p,tag)=>{
  const ip=layer(p,'IPv4').fields,ic=layer(p,'ICMP');
  if(!ownIface(dev,ip.dst))return forward(ctx,dev,iface,p,tag);
  if(tag)ctx.hops=via(tag,dev.id).path;
  if(!ic)return drop(ctx,dev.id,iface,p,'no one is listening for this protocol');
  const f=ic.fields;
  if(f.type==='echo-request'){
    log(ctx,dev.id,iface,'rx','delivered: echo request from '+ip.src,p);
    return ipSend(ctx,dev,[P.ipv4(ip.dst,ip.src,64,'ICMP'),P.icmp('echo-reply',f.id,f.seq)],'echo reply to '+ip.src,{inIface:iface});
  }
  if(f.type==='echo-reply'){
    log(ctx,dev.id,iface,'rx','delivered: echo reply from '+ip.src,p);
    if(dev.id===ctx.from&&f.id===ctx.id&&f.seq===ctx.seq&&ctx.replyFrom===null)ctx.replyFrom=ip.src;
    return;
  }
  log(ctx,dev.id,iface,'rx','delivered: ICMP '+f.type+' from '+ip.src,p);
};
const nodeRx=(ctx,dev,iface,p,tag)=>{
  const e=p.layers[0].fields;
  if(e.dst!==BCAST&&e.dst!==dev.ifaces[iface].mac)return drop(ctx,dev.id,iface,p,'not addressed to this host');
  return e.type==='ARP'?arpRx(ctx,dev,iface,p):ipRx(ctx,dev,iface,p,tag);
};
const RX={switch:switchRx,host:nodeRx,router:nodeRx};

/* one delivery: a frame arriving on dev.iface */
const deliverFrame=(ctx,devId,iface,p,tag)=>{
  const dev=ctx.net.devices[devId],i=dev&&dev.ifaces[iface];
  if(!i)return;
  if(!i.up)return drop(ctx,devId,iface,p,REASONS.ifDown);
  RX[dev.kind](ctx,dev,iface,p,tag);
};
/* drain the queue in order; a switch loop would never drain, so stop after STEP_LIMIT deliveries */
const run=ctx=>{
  while(ctx.queue.length){
    if(ctx.steps>=STEP_LIMIT){
      const q=ctx.queue[0];
      drop(ctx,q.dev,q.iface,q.packet,'simulation step limit');
      ctx.queue.length=0;ctx.limited=true;
      return;
    }
    const q=ctx.queue.shift();
    ctx.steps++;
    deliverFrame(ctx,q.dev,q.iface,q.packet,q.tag);
  }
};

const int=(v,lo,hi,what)=>{
  if(v===undefined)return null;
  if(!Number.isInteger(v)||v<lo||v>hi)throw new RangeError(what+' must be an integer '+lo+'..'+hi);
  return v;
};
const ping=(net,from,dstIp,opts)=>{
  const o=opts||{},dev=net.devices[from];
  if(!dev)throw new Error('unknown device: '+from);
  if(NQ.ip.parse(dstIp)===null)throw new Error('bad IPv4 address: '+dstIp);
  const ttl=int(o.ttl,0,255,'ttl')??64,seq=int(o.seq,0,65535,'seq')??1,id=int(o.id,0,65535,'id')??1;
  const ctx={net,from,id,seq,queue:[],pending:{},entries:[],hops:[],steps:0,limited:false,fail:null,replyFrom:null};
  const done=(reason)=>({delivered:reason===null,reason,replyFrom:ctx.replyFrom,hops:ctx.hops,entries:ctx.entries});
  if(!Object.values(dev.ifaces).some(i=>i.ip))return done(REASONS.noAddr);
  if(ownIface(dev,dstIp)){ctx.replyFrom=dstIp;ctx.hops.push(from);return done(null);}
  const h=nextHop(dev,dstIp);
  if(!h)return done(REASONS.noRoute);
  const src=dev.ifaces[h.iface].ip;
  if(!src)return done(REASONS.noAddr);
  const err=ipSend(ctx,dev,[P.ipv4(addr(src),dstIp,ttl,'ICMP'),P.icmp('echo-request',id,seq)],'echo request to '+dstIp,{tag:{path:[from]},quiet:true});
  if(err)return done(err);
  ctx.hops=[from];
  run(ctx);
  return done(ctx.replyFrom!==null?null:ctx.fail||REASONS.unreachable);
};
NQ.sim={ping,nextHop,REASONS,STEP_LIMIT};
})();
