/* Network Quest DNS model: name-server zones, the recursive resolver and its cache, built on the simulator's UDP seams.
   Device data (written by topology.js): stub {resolver, roots}, resolver {recursive, roots, now, cache}, name server
   {zones}. DOM-free, deterministic: ids, ports and query times come from hashes and counts. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const P=NQ.pkt,K=NQ.sim.kit,U=NQ.sim.udp;
/* the flat message fields hold at most AN_MAX, NS_MAX and AR_MAX records, so a longer CNAME chain arrives in pieces */
const AN_MAX=3,NS_MAX=2,AR_MAX=2,MAX_CNAME=8,MAX_HOPS=16,MS_PER_QUERY=12,TTL_ROOT_HINT=300;
const fq=n=>{n=String(n).toLowerCase();return n.endsWith('.')?n:n+'.';};
const inZone=(origin,name)=>origin==='.'||name===origin||name.endsWith('.'+origin);
const deepest=(a,b)=>b.name.length-a.name.length;
const addr=c=>c.split('/')[0];
const hash=s=>{let h=0x811c9dc5;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,0x01000193)>>>0;}return h;}; // FNV-1a, 32 bits
const ident=(name,type,server)=>{const h=hash(name+'|'+type+'|'+server);return (h^(h>>>16))&0xFFFF;};
const egress=(dev,dst)=>{const h=K.nextHop(dev,dst);return h&&addr(dev.ifaces[h.iface].ip);};

const ask=(id,rd,qname,qtype)=>({id,qr:0,opcode:'QUERY',aa:0,rd,ra:0,rcode:'NOERROR',qname,qtype,ancount:0,nscount:0,arcount:0});
const msg=(q,o)=>{
  const an=(o.an||[]).slice(0,AN_MAX),ns=(o.ns||[]).slice(0,NS_MAX),ar=(o.ar||[]).slice(0,AR_MAX);
  const f={...ask(q.id,q.rd,q.qname,q.qtype),qr:1,aa:o.aa?1:0,ra:o.ra?1:0,rcode:o.rcode||'NOERROR',ancount:an.length,nscount:ns.length,arcount:ar.length};
  [['an',an],['ns',ns],['ar',ar]].forEach(([k,rs])=>rs.forEach((r,i)=>{f[k+(i+1)]=P.fmtRR(r);}));
  return f;
};
const recs=(f,k)=>{const out=[];for(let i=1;f[k+i];i++)out.push(P.parseRR(f[k+i]));return out;};
const sendDns=(ctx,dev,src,dst,sport,dport,fields,verdict,o)=>K.ipSend(ctx,dev,[P.ipv4(src,dst,64,'UDP'),P.udp(sport,dport),P.dns(fields)],verdict,o);
const state=ctx=>ctx.ext.dns||(ctx.ext.dns={pending:{},up:0},ctx.idle.push(idle),ctx.ext.dns);

/* authoritative side: the longest-origin zone that holds the name answers; a cut (NS below the origin) gives a referral
   with glue; a CNAME is followed inside the zone; no data is NODATA, no name NXDOMAIN, both with the SOA; no zone REFUSED */
const soaRR=z=>({name:z.origin,type:'SOA',ttl:z.soa.ttl,data:[z.soa.mname,z.soa.rname,z.soa.serial,z.soa.refresh,z.soa.retry,z.soa.expire,z.soa.minimum].join(' ')});
const authAnswer=(zones,qname,qtype)=>{
  const z=zones.filter(x=>inZone(x.origin,qname)).sort((a,b)=>b.origin.length-a.origin.length)[0];
  if(!z)return {rcode:'REFUSED'};
  const cut=z.records.filter(r=>r.type==='NS'&&r.name!==z.origin&&inZone(r.name,qname)).sort(deepest)[0];
  if(cut){
    const ns=z.records.filter(r=>r.type==='NS'&&r.name===cut.name);
    return {ns,ar:z.records.filter(r=>r.type==='A'&&ns.some(n=>n.data===r.name))};
  }
  const an=[];
  let name=qname;
  for(;;){
    const own=z.records.filter(r=>r.name===name),hit=own.filter(r=>r.type===qtype),c=qtype!=='CNAME'&&own.find(r=>r.type==='CNAME');
    if(hit.length){an.push(...hit);break;}
    if(!c){
      if(an.length)break;
      const exists=z.records.some(r=>r.name===name||r.name.endsWith('.'+name));
      return {aa:true,rcode:exists?'NOERROR':'NXDOMAIN',ns:[soaRR(z)]};
    }
    if(an.length>=AN_MAX||an.includes(c))break;
    an.push(c);
    name=c.data;
    if(!inZone(z.origin,name))break;
  }
  const mx=an.filter(r=>r.type==='MX').map(r=>r.data.split(' ')[1]);
  return {aa:true,an,ar:z.records.filter(r=>r.type==='A'&&mx.includes(r.name))};
};

/* resolver cache entries {name, type, expires, rcode, rrs, ar?}: rcode NOERROR is an answer, NXDOMAIN and NODATA are
   negative (rrs holds the SOA), DELEGATION is a zone cut (rrs holds the NS records and their glue) */
const live=(d,e)=>e.expires>d.now;
const hit=(d,name,type)=>d.cache.find(e=>e.rcode!=='DELEGATION'&&live(d,e)&&e.name===name&&(e.type===type||e.rcode==='NXDOMAIN'));
const deleg=(d,name)=>d.cache.filter(e=>e.rcode==='DELEGATION'&&live(d,e)&&inZone(e.name,name)).sort(deepest)[0];
const remember=(d,e)=>{d.cache=d.cache.filter(x=>live(d,x)&&!(x.name===e.name&&x.type===e.type&&(x.rcode==='DELEGATION')===(e.rcode==='DELEGATION')));d.cache.push(e);};
/* a cache entry as a reply: every record counts its TTL down to the entry's expiry */
const fromCache=(d,e)=>{
  const rr=r=>({...r,ttl:e.expires-d.now});
  if(e.rcode==='NOERROR')return {ra:true,an:e.rrs.map(rr),ar:(e.ar||[]).map(rr)};
  return {ra:true,rcode:e.rcode==='NXDOMAIN'?'NXDOMAIN':'NOERROR',ns:e.rrs.map(rr)};
};
/* the simulated root hints name each root a.root-servers.test., b..., in the order of dns.roots */
const rootName=i=>String.fromCharCode(97+i)+'.root-servers.test.';
const hintRRs=d=>{
  const names=d.roots.map((ip,i)=>rootName(i));
  return {ns:names.map(n=>({name:'.',type:'NS',ttl:TTL_ROOT_HINT,data:n})),ar:names.map((n,i)=>({name:n,type:'A',ttl:TTL_ROOT_HINT,data:d.roots[i]}))};
};

const reply=(ctx,dev,c,o)=>sendDns(ctx,dev,c.dst,c.ip,53,c.port,msg(c,o),'DNS reply to '+c.ip+': '+(o.rcode||'NOERROR'));
const servfail=(ctx,dev,st)=>reply(ctx,dev,st.client,{ra:true,rcode:'SERVFAIL'});
const finish=(ctx,dev,st,e)=>{remember(dev.dns,e);reply(ctx,dev,st.client,fromCache(dev.dns,e));};
const negative=(ctx,dev,st,rcode,soa)=>{
  const d=dev.dns,ttl=soa?Math.min(soa.ttl,+soa.data.split(' ').at(-1)):0;
  finish(ctx,dev,st,{name:st.client.name,type:st.type,expires:d.now+ttl,rcode,rrs:soa?[soa]:[]});
};

/* one resolution on a resolver: ask the nearest cached delegation (else a root), follow referrals and CNAMEs, answer the
   client. Every upstream query is one pending entry, keyed resolver|serverIp|id, and one claim on its source port. */
const resolve=(ctx,dev,st)=>{
  const d=dev.dns,e=hit(d,st.name,st.type);
  if(e)return reply(ctx,dev,st.client,fromCache(d,e));
  const dl=deleg(d,st.name),servers=dl?dl.rrs.filter(r=>r.type==='A').map(r=>r.data):d.roots,ip=servers[0],src=ip&&egress(dev,ip);
  if(!src||++st.hops>MAX_HOPS)return servfail(ctx,dev,st);
  const S=state(ctx),id=ident(st.name,st.type,ip),key=[dev.id,ip,id].join('|');
  let port=33000+hash(dev.id+'|'+st.name+'|'+st.type+'|'+ip)%1000;
  while(ctx.claims[dev.id+'|'+port])port=33000+(port-32999)%1000;
  S.pending[key]={st,port};
  S.up++;
  U.expect(ctx,dev.id,port,upstreamReply);
  if(sendDns(ctx,dev,src,ip,port,53,ask(id,0,st.name,st.type),'DNS query '+st.name+' '+st.type+' to '+ip)){
    delete S.pending[key];
    servfail(ctx,dev,st);
  }
};
const upstreamReply=(ctx,dev,iface,p)=>{
  const ip=K.layer(p,'IPv4').fields,u=K.layer(p,'UDP').fields,m=K.layer(p,'DNS').fields,S=state(ctx),key=[dev.id,ip.src,m.id].join('|'),w=S.pending[key];
  if(m.qr!==1||u.sport!==53||!w||w.port!==u.dport)return false;
  delete S.pending[key];
  K.log(ctx,dev.id,iface,'rx','delivered: DNS reply from '+ip.src+': '+m.rcode,p);
  gotReply(ctx,dev,w.st,m);
  return true;
};
const gotReply=(ctx,dev,st,m)=>{
  const d=dev.dns,an=recs(m,'an'),ns=recs(m,'ns'),ar=recs(m,'ar'),soa=ns.find(r=>r.type==='SOA');
  if(m.rcode==='NXDOMAIN')return negative(ctx,dev,st,'NXDOMAIN',soa);
  if(m.rcode!=='NOERROR')return servfail(ctx,dev,st);
  if(!an.length){
    const cut=ns.filter(r=>r.type==='NS');
    if(soa)return negative(ctx,dev,st,'NODATA',soa);
    if(!cut.length)return servfail(ctx,dev,st);
    remember(d,{name:cut[0].name,type:'NS',expires:d.now+cut[0].ttl,rcode:'DELEGATION',rrs:[...cut,...ar.filter(r=>r.type==='A')]});
    return resolve(ctx,dev,st);
  }
  const all=[...st.cnames,...an];
  if(all.filter(r=>r.type==='CNAME').length>MAX_CNAME)return servfail(ctx,dev,st);
  if(!an.some(r=>r.type===st.type)){
    st.cnames=all;
    st.name=an.at(-1).data;
    return resolve(ctx,dev,st);
  }
  finish(ctx,dev,st,{name:st.client.name,type:st.type,expires:d.now+Math.min(...all.map(r=>r.ttl)),rcode:'NOERROR',rrs:all.slice(-AN_MAX),ar});
};
/* the queue ran dry with resolutions still waiting for an answer: the resolver gives up on each and tells its client */
const idle=ctx=>{
  const S=ctx.ext.dns,keys=Object.keys(S.pending);
  for(const k of keys){
    const w=S.pending[k];
    delete S.pending[k];
    servfail(ctx,ctx.net.devices[k.split('|')[0]],w.st);
  }
  return keys.length>0;
};

/* port 53 on a name server or resolver; every other device returns false and the datagram is dropped */
const service=(ctx,dev,iface,p)=>{
  const d=dev.dns,q=K.layer(p,'DNS');
  if(!d||!(d.zones||d.recursive)||!q||q.fields.qr!==0)return false;
  const ip=K.layer(p,'IPv4').fields,u=K.layer(p,'UDP').fields,f=q.fields;
  const c={ip:ip.src,port:u.sport,dst:ip.dst,id:f.id,rd:f.rd,qname:f.qname,qtype:f.qtype,name:fq(f.qname)};
  K.log(ctx,dev.id,iface,'rx','delivered: DNS query '+f.qname+' '+f.qtype+' from '+ip.src,p);
  if(d.zones)reply(ctx,dev,c,authAnswer(d.zones,c.name,c.qtype));
  else if(c.rd)resolve(ctx,dev,{client:c,name:c.name,type:c.qtype,cnames:[],hops:0});
  else{
    const e=hit(d,c.name,c.qtype),dl=deleg(d,c.name),h=dl?{ns:dl.rrs.filter(r=>r.type==='NS'),ar:dl.rrs.filter(r=>r.type==='A')}:hintRRs(d);
    reply(ctx,dev,c,e?fromCache(d,e):{ra:true,...h});
  }
  return true;
};
U.listen(53,service);

/* one question from `from` to a server over UDP, run on net itself (caches and log change). status is 'timeout' when no
   matching reply came back; ms is 12 per upstream query the server sent while answering, 0 from its own data or cache */
const query=(net,from,o)=>{
  const dev=net.devices[from],name=fq(o.name),type=o.type||'A',rd=o.rd===false?0:1;
  const ctx=K.session(net,from,0,0),S=state(ctx),id=ident(name,type,o.server),sport=33000+hash(from+'|'+name+'|'+type+'|'+o.server)%1000,src=egress(dev,o.server);
  let got=null;
  U.expect(ctx,from,sport,(c,d,iface,p)=>{
    const ip=K.layer(p,'IPv4').fields,m=K.layer(p,'DNS').fields;
    if(got||ip.src!==o.server||m.qr!==1||m.id!==id)return false;
    got=m;
    K.log(ctx,from,iface,'rx','delivered: DNS reply from '+ip.src+': '+m.rcode,p);
    return true;
  });
  if(src){
    sendDns(ctx,dev,src,o.server,sport,53,ask(id,rd,name,type),'DNS query '+name+' '+type+' to '+o.server,{quiet:true});
    K.settle(ctx);
  }
  return {status:got?'ok':'timeout',msg:got,server:o.server,entries:ctx.entries,steps:ctx.steps,ms:got?MS_PER_QUERY*S.up:0};
};
NQ.dns={query,recs,fq,rootName};
})();
