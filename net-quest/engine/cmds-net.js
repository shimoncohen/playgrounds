/* Network Quest network tools: ping, traceroute, arping and ipcalc, printed the way the real ones print. Probes run on
   NQ.sim; times are made up but deterministic (half a millisecond per hop). Argument and connect errors go in err, the
   probe lines in out. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const IPX=NQ.ip,R=NQ.sim.REASONS;
const ret=(out,err,code)=>({out,err,code});
const fail=(code,...err)=>ret([],err,code);
const addr=c=>c.split('/')[0];
const MAXC=10;

/* [-c N] destination: returns {n, dst} or {error}. n defaults to def and is clamped to 10 */
const parse=(cmd,args,def)=>{
  const usage='Usage: '+cmd+' [-c count] destination';
  let n=def,dst=null;
  for(let k=0;k<args.length;k++){
    const a=args[k];
    if(a==='-c'||(a.startsWith('-c')&&a.length>2)){
      const v=a==='-c'?args[++k]:a.slice(2);
      if(v===undefined)return {error:fail(2,usage)};
      if(!/^\d+$/.test(v)||+v<1)return {error:fail(2,cmd+": invalid argument: '"+v+"'")};
      n=Math.min(+v,MAXC);
    }else if(a.length>1&&a[0]==='-')return {error:fail(2,cmd+": invalid option -- '"+a[1]+"'",usage)};
    else if(dst===null)dst=a;
    else return {error:fail(2,usage)};
  }
  if(dst===null)return {error:fail(2,usage)};
  if(IPX.parse(dst)===null)return {error:fail(2,cmd+': '+dst+': Name or service not known')};
  return {n,dst};
};
const own=dev=>{const i=Object.values(dev.ifaces).find(x=>x.ip);return i?addr(i.ip):'0.0.0.0';};
const ICMP=(e,type)=>e.packet.layers.some(l=>l.name==='ICMP'&&l.fields.type===type);
/* the ttl the echo reply had when it reached the origin (64 when the target was the origin itself) */
const replyTtl=(r,dev)=>{
  const e=r.entries.find(x=>x.dev===dev.id&&x.dir==='rx'&&ICMP(x,'echo-reply'));
  return e?e.packet.layers.find(l=>l.name==='IPv4').fields.ttl:64;
};
const LOCAL={[R.noRoute]:1,[R.noAddr]:1,[R.ifDown]:1};

const ping=(net,dev,args)=>{
  const p=parse('ping',args,4);
  if(p.error)return p.error;
  const out=['PING '+p.dst+' ('+p.dst+') 56(84) bytes of data.'];
  let got=0,errs=0;
  for(let i=1;i<=p.n;i++){
    const r=NQ.sim.ping(net,dev.id,p.dst,{seq:i}),why=r.reason;
    if(r.delivered){
      got++;
      out.push('64 bytes from '+r.replyFrom+': icmp_seq='+i+' ttl='+replyTtl(r,dev)+' time='+(0.5*(r.hops.length-1)).toFixed(2)+' ms');
      continue;
    }
    if(LOCAL[why]&&!r.replyFrom)return fail(2,'ping: connect: Network is '+(why===R.ifDown?'down':'unreachable'));
    const msg=why===R.noRoute||why===R.ifDown||why===R.noAddr?'Destination Net Unreachable':why===R.unreachable?'Destination Host Unreachable':why===R.ttl?'Time to live exceeded':null;
    if(!msg)continue; // no reply: a real ping prints nothing for a timeout
    errs++;
    out.push('From '+(r.replyFrom||own(dev))+' icmp_seq='+i+' '+msg);
  }
  out.push('','--- '+p.dst+' ping statistics ---',p.n+' packets transmitted, '+got+' received, '+(errs?'+'+errs+' errors, ':'')+Math.round(100*(p.n-got)/p.n)+'% packet loss');
  return ret(out,[],got?0:1);
};

const traceroute=(net,dev,args)=>{
  const dst=args[0];
  if(args.length!==1||dst[0]==='-')return fail(2,'Usage: traceroute destination');
  if(IPX.parse(dst)===null)return fail(2,'traceroute: unknown host '+dst);
  const t=NQ.sim.traceroute(net,dev.id,dst),h1=t.hops[0];
  if(h1&&h1.from===null&&LOCAL[h1.reason]&&!t.entries.length)return fail(2,'traceroute: connect: Network is unreachable');
  const out=['traceroute to '+dst+' ('+dst+'), 30 hops max, 60 byte packets'];
  for(const h of t.hops){
    const ms=(0.5*h.ttl).toFixed(2)+' ms',flag=h.reason===R.unreachable?' !H':h.reason&&LOCAL[h.reason]?' !N':'';
    out.push(String(h.ttl).padStart(2)+'  '+(h.from===null?'* * *':h.from+'  '+ms+'  '+ms+'  '+ms+flag));
  }
  return ret(out,[],0);
};

const arping=(net,dev,args)=>{
  const p=parse('arping',args,1);
  if(p.error)return p.error;
  const first=NQ.sim.arping(net,dev.id,p.dst);
  if(!first.ifaceName)return fail(2,'arping: Network is unreachable');
  const out=['ARPING '+p.dst+' from '+addr(dev.ifaces[first.ifaceName].ip)+' '+first.ifaceName];
  let got=0;
  for(let i=1;i<=p.n;i++){
    const r=i===1?first:NQ.sim.arping(net,dev.id,p.dst);
    if(r.mac){got++;out.push('Unicast reply from '+p.dst+' ['+r.mac.toUpperCase()+']  1.000ms');}
  }
  out.push('Sent '+p.n+' probes ('+p.n+' broadcast(s))','Received '+got+' response(s)');
  return ret(out,[],got?0:1);
};

const ipcalc=(net,dev,args)=>{
  if(args.length!==1)return fail(2,'Usage: ipcalc address/prefix');
  const a=args[0],c=IPX.cidr(a);
  if(!c)return IPX.parse(a)!==null?fail(1,'ipcalc: missing prefix, try something like 192.168.1.0/24'):fail(1,'ipcalc: invalid address: '+a);
  const p=c.prefix,lo=p>=31?c.net:c.net+1,hi=p>=31?c.bcast:c.bcast-1;
  const hosts=p===32?1:p===31?2:c.bcast-c.net-1;
  return ret([
    'Address:   '+IPX.fmt(c.ip),
    'Netmask:   '+IPX.fmt(c.mask)+' = '+p,
    'Network:   '+IPX.fmt(c.net)+'/'+p,
    'Broadcast: '+IPX.fmt(p===32?c.ip:c.bcast),
    'HostMin:   '+IPX.fmt(p===32?c.ip:lo),
    'HostMax:   '+IPX.fmt(p===32?c.ip:hi),
    'Hosts/Net: '+hosts],[],0);
};

NQ.reg('ping','check that another machine answers',ping);
NQ.reg('traceroute','list the routers on the way to an address',traceroute);
NQ.reg('arping','ask who owns an address on this network (ARP)',arping);
NQ.reg('ipcalc','work out the network, broadcast and host range of an address/prefix',ipcalc);
})();
