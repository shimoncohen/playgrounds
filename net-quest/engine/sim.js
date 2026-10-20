/* Network Quest simulator: frames move through an explicit FIFO queue, one delivery at a time, and every step is a
   log entry. A ping is one "session" (ctx) holding the queue, the packets parked while ARP resolves, and what came
   back. ARP, switching, local delivery, routing with TTL and ICMP errors, traceroute; NAT arrives in Task 7. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const P=NQ.pkt;
const BCAST='ff:ff:ff:ff:ff:ff',ZERO='00:00:00:00:00:00',STEP_LIMIT=500;
const REASONS={noRoute:'no route',ifDown:'interface down',unreachable:'host unreachable',ttl:'ttl exceeded',noAddr:'no address'};
const addr=c=>c.split('/')[0];
const layer=(p,name)=>p.layers.find(l=>l.name===name);
const ERRTYPES=['time-exceeded','dest-unreachable'];

/* log: snapshot the packet, stamp it with the clock, append to net.log and to this session's entries */
const log=(ctx,dev,iface,dir,verdict,packet)=>{
  const e={t:ctx.net.clock++,dev,iface,dir,verdict,packet:P.clone(packet)};
  ctx.net.log.push(e);ctx.entries.push(e);
  return e;
};
const drop=(ctx,dev,iface,packet,verdict)=>log(ctx,dev,iface,'drop',verdict,packet);

/* put a frame on the wire: log it, then queue it for whatever is at the far end of the link. tag rides along off
   the wire: {path} on copies of this ping's echo request (never matched on header fields, which NAT may rewrite), and
   {path, reason} on an ICMP error a router sends back about it (path: the request's path up to that router). */
const transmit=(ctx,dev,iface,packet,verdict,dir,tag)=>{
  log(ctx,dev.id,iface,dir||'tx',verdict,packet);
  const peer=dev.ifaces[iface].peer;
  if(!peer)return;
  const [d,i]=peer.split('.');
  ctx.queue.push({dev:d,iface:i,packet:P.clone(packet),tag:tag?{...tag,path:tag.path.slice()}:null});
};
/* the probe passed through devId: extend its path (unique ids, in order). An error's path stays as the router set it. */
const via=(tag,devId)=>tag&&(tag.reason?{...tag,path:tag.path.slice()}:{path:tag.path.includes(devId)?tag.path.slice():[...tag.path,devId]});

/* route lookup, longest prefix wins: connected subnets (derived from iface addresses, via null), then static routes
   (explicit CIDR), then default. On a prefix tie connected beats static, then the first listed wins. A route on a down
   iface is returned only when nothing up matches (nextHop's caller then reports interface down). Malformed routes
   (unknown or address-less iface, bad dst or via) never match. */
const route=(dev,dstIp)=>{
  const n=NQ.ip.parse(dstIp);
  if(n===null)return null;
  const best={up:null,down:null};
  const offer=(prefix,rank,via,name)=>{
    const i=dev.ifaces[name];
    if(!i||!i.ip||!NQ.ip.cidr(i.ip))return;
    const k=i.up?'up':'down',b=best[k];
    if(!b||prefix>b.prefix||(prefix===b.prefix&&rank<b.rank))best[k]={prefix,rank,via,dev:name};
  };
  for(const [name,i] of Object.entries(dev.ifaces)){
    const c=i.ip&&NQ.ip.cidr(i.ip);
    if(c&&NQ.ip.inSubnet(n,c))offer(c.prefix,0,null,name);
  }
  for(const r of dev.routes||[]){
    if(!r||typeof r!=='object')continue;
    const via=r.via==null?null:r.via;
    if(via!==null&&NQ.ip.parse(via)===null)continue;
    if(r.dst==='default'){offer(0,2,via,r.dev);continue;}
    const c=NQ.ip.cidr(r.dst);
    if(c&&NQ.ip.inSubnet(n,c))offer(c.prefix,1,via,r.dev);
  }
  const b=best.up||best.down;
  return b&&{via:b.via,dev:b.dev};
};
/* routing decision: which iface, and whose MAC to ask for (the gateway, or the target itself when on-link) */
const nextHop=(dev,dstIp)=>{
  const r=route(dev,dstIp);
  return r&&{iface:r.dev,nextIp:r.via||dstIp,via:r.via};
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
   o: {tag, inIface, quiet, dir, back}. dir is the log direction ('fwd' at a router); back is what a router needs to
   send an ICMP error if the ARP for the next hop is never answered ({iface, ip, ic}: ingress iface, the original
   IPv4 and ICMP fields). Unless quiet (the origin's first send, reported by ping itself), a failure is logged as a
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
  if(mac){transmit(ctx,dev,h.iface,P.stack(P.eth(i.mac,mac,'IPv4'),...ipLayers),verdict,o.dir||'tx',o.tag);return null;}
  const k=pendingKey(dev,h.nextIp);
  if(!ctx.pending[k]){ctx.pending[k]={dev:dev.id,iface:h.iface,ip:h.nextIp,items:[]};arpRequest(ctx,dev,h.iface,h.nextIp);}
  ctx.pending[k].items.push({ipLayers,verdict,tag:o.tag||null,dir:o.dir||'tx',back:o.back||null});
  return null;
};
/* an ARP reply arrived: send whatever was waiting for that address */
const flush=(ctx,dev,ip)=>{
  const k=pendingKey(dev,ip),w=ctx.pending[k];
  if(!w)return;
  delete ctx.pending[k];
  for(const it of w.items)ipSend(ctx,dev,it.ipLayers,it.verdict,{tag:it.tag,inIface:w.iface,dir:it.dir,back:it.back});
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
/* a router tells the original sender why its packet died: time-exceeded for TTL, dest-unreachable otherwise, from the
   ingress iface's address. The echo's id/seq ride along so the sender can match it; the tag maps it to a result.
   Never an error about an error. ip/ic: the dropped packet's IPv4 and ICMP fields; tag: the probe's tag at this router. */
const icmpError=(ctx,dev,inIface,ip,ic,tag,reason)=>{
  const src=dev.ifaces[inIface]&&dev.ifaces[inIface].ip;
  if(!src||(ic&&ERRTYPES.includes(ic.type)))return;
  const type=reason===REASONS.ttl?'time-exceeded':'dest-unreachable';
  const verdict='ICMP '+(reason===REASONS.ttl?'time exceeded':'destination unreachable ('+reason+')')+' to '+ip.src;
  ipSend(ctx,dev,[P.ipv4(addr(src),ip.src,64,'ICMP'),P.icmp(type,ic?ic.id:0,ic?ic.seq:0)],verdict,{inIface,tag:tag&&{path:tag.path.slice(),reason}});
};
/* the probe died here (dropped on iface; it came in on inIface): the first failure is the ping's reason, and hops end
   here unless the target already took a copy */
const died=(ctx,dev,iface,p,verdict,reason,ip,ic,tag,inIface)=>{
  drop(ctx,dev.id,iface,p,verdict);
  if(!ctx.fail)ctx.fail=reason;
  if(tag&&!ctx.hit)ctx.hops=tag.path;
  icmpError(ctx,dev,inIface||iface,ip,ic,tag,reason);
};
/* not for any of our addresses: hosts drop it; a router checks TTL, looks up the route and sends it on with a new
   Ethernet header (its egress MAC to the next hop's MAC) and ttl - 1. The IPv4 addresses never change here: NAT
   (Task 7) hooks in at this point, between the route lookup and the send. */
const forward=(ctx,dev,iface,p,tag)=>{
  if(dev.kind!=='router')return drop(ctx,dev.id,iface,p,'not addressed to this host');
  const ip=layer(p,'IPv4').fields,icl=layer(p,'ICMP'),ic=icl&&icl.fields,t=via(tag,dev.id);
  if(!(ip.ttl>1))return died(ctx,dev,iface,p,'TTL expired, packet discarded',REASONS.ttl,ip,ic,t);
  const h=nextHop(dev,ip.dst);
  if(!h)return died(ctx,dev,iface,p,'no route to '+ip.dst,REASONS.noRoute,ip,ic,t);
  if(!dev.ifaces[h.iface].up)return died(ctx,dev,iface,p,'cannot send to '+ip.dst+': '+REASONS.ifDown,REASONS.ifDown,ip,ic,t);
  const layers=p.layers.slice(1).map(P.clone),ttl=ip.ttl-1;
  layers[0].fields.ttl=ttl;
  const verdict='forwarded out '+h.iface+(h.via?' via '+h.via:' to '+ip.dst+' (directly connected)')+', ttl '+ttl;
  ipSend(ctx,dev,layers,verdict,{tag:t,inIface:iface,dir:'fwd',back:{iface,ip,ic}});
};
const ipRx=(ctx,dev,iface,p,tag)=>{
  const ip=layer(p,'IPv4').fields,ic=layer(p,'ICMP');
  if(!ownIface(dev,ip.dst))return forward(ctx,dev,iface,p,tag);
  if(tag&&!tag.reason){ctx.hops=via(tag,dev.id).path;ctx.hit=true;}
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
  if(ERRTYPES.includes(f.type)){
    log(ctx,dev.id,iface,'rx','delivered: ICMP '+f.type+' from '+ip.src+(tag&&tag.reason?' ('+tag.reason+')':''),p);
    if(tag&&tag.reason&&dev.id===ctx.from&&!ctx.err)ctx.err={from:ip.src,reason:tag.reason};
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
/* the queue is empty and some ARPs were never answered: a router drops what it was forwarding and reports host
   unreachable to the sender. Returns true if anything was handled (so the queue may have work again). */
const lost=ctx=>{
  let any=false;
  for(const k of Object.keys(ctx.pending)){
    const w=ctx.pending[k],dev=ctx.net.devices[w.dev];
    delete ctx.pending[k];
    for(const it of w.items){
      if(!it.back)continue;
      any=true;
      died(ctx,dev,w.iface,P.stack(...it.ipLayers),'no ARP answer from '+w.ip+', packet discarded',REASONS.unreachable,it.back.ip,it.back.ic,it.tag,it.back.iface);
    }
  }
  return any;
};
/* run, then settle unanswered ARPs, until nothing is left to do. Each round only adds ICMP errors, which never cause
   errors of their own, so this ends; the step limit still caps the whole session. */
const settle=ctx=>{do run(ctx);while(!ctx.limited&&lost(ctx));};

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
  const ctx={net,from,id,seq,queue:[],pending:{},entries:[],hops:[],steps:0,limited:false,fail:null,replyFrom:null,err:null,hit:false};
  const done=(reason)=>({delivered:reason===null,reason,replyFrom:ctx.replyFrom??(ctx.err&&ctx.err.from),hops:ctx.hops,entries:ctx.entries});
  if(!Object.values(dev.ifaces).some(i=>i.ip))return done(REASONS.noAddr);
  if(ownIface(dev,dstIp)){ctx.replyFrom=dstIp;ctx.hops.push(from);return done(null);}
  const h=nextHop(dev,dstIp);
  if(!h)return done(REASONS.noRoute);
  const src=dev.ifaces[h.iface].ip;
  if(!src)return done(REASONS.noAddr);
  const err=ipSend(ctx,dev,[P.ipv4(addr(src),dstIp,ttl,'ICMP'),P.icmp('echo-request',id,seq)],'echo request to '+dstIp,{tag:{path:[from]},quiet:true});
  if(err)return done(err);
  ctx.hops=[from];
  settle(ctx);
  return done(ctx.replyFrom!==null?null:(ctx.err&&ctx.err.reason)||ctx.fail||REASONS.unreachable);
};
/* traceroute: ping with ttl 1, 2, ... ; each router on the way answers time-exceeded. Stops at the target, or at any
   other failure (the simulation is deterministic, so a larger TTL cannot learn more), or at maxHops. */
const traceroute=(net,from,dstIp,maxHops)=>{
  const max=int(maxHops,1,64,'maxHops')??30,hops=[],entries=[];
  for(let ttl=1;ttl<=max;ttl++){
    const r=ping(net,from,dstIp,{ttl,seq:ttl});
    entries.push(...r.entries);
    if(r.delivered){hops.push({ttl,from:r.replyFrom,reached:true});break;}
    if(r.reason===REASONS.ttl){hops.push({ttl,from:r.replyFrom,reached:false});continue;}
    hops.push({ttl,from:r.replyFrom||null,reached:false,reason:r.reason});
    break;
  }
  return {hops,entries};
};
NQ.sim={ping,traceroute,route,nextHop,REASONS,STEP_LIMIT};
})();
