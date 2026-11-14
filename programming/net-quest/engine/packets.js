/* Network Quest packets: layer builders and the hex view. A packet is {layers:[{name,fields}]}, outermost first.
   Hex is always derived from the fields, never stored, so the inspector and the simulator cannot disagree. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const eth=(src,dst,type)=>({name:'Ethernet',fields:{src,dst,type}});
const arp=(op,sha,spa,tha,tpa)=>({name:'ARP',fields:{op,sha,spa,tha,tpa}});
const ipv4=(src,dst,ttl,proto)=>({name:'IPv4',fields:{src,dst,ttl,proto}});
const icmp=(type,id,seq)=>({name:'ICMP',fields:{type,id,seq}});
const udp=(sport,dport)=>({name:'UDP',fields:{sport,dport}});
/* flat scalars for the inspector; records are an1.., ns1.., ar1.. as 'name ttl IN TYPE data', as many as the counts say */
const dns=fields=>({name:'DNS',fields});
const RR=/^(\S+) (\d+) IN (\S+) (.+)$/;
const parseRR=s=>{const m=RR.exec(s);return m&&{name:m[1],ttl:+m[2],type:m[3],data:m[4]};};
const fmtRR=r=>[r.name,r.ttl,'IN',r.type,r.data].join(' ');
const clone=p=>JSON.parse(JSON.stringify(p));
const stack=(...layers)=>({layers:layers.map(clone)});
const layerNames=p=>p.layers.map(l=>l.name);
const pick=(table,key,what)=>{
  if(!Object.prototype.hasOwnProperty.call(table,key))throw new Error('unknown '+what+': '+key);
  return table[key];
};
const macBytes=s=>{
  const p=typeof s==='string'?s.split(':'):[];
  if(p.length!==6||!p.every(x=>/^[0-9a-fA-F]{2}$/.test(x)))throw new Error('bad MAC address: '+s);
  return p.map(x=>parseInt(x,16));
};
const ipBytes=s=>{
  const n=NQ.ip.parse(s);
  if(n===null)throw new Error('bad IPv4 address: '+s);
  return [n>>>24,(n>>>16)&255,(n>>>8)&255,n&255];
};
const u16=n=>[(n>>>8)&255,n&255];
/* RFC 1071: ones'-complement sum of 16-bit words, complemented */
const checksum=b=>{
  let s=0;
  for(let i=0;i<b.length;i+=2)s+=(b[i]<<8)|(b[i+1]||0);
  while(s>0xFFFF)s=(s&0xFFFF)+(s>>>16);
  return ~s&0xFFFF;
};
const ETYPE={IPv4:[8,0],ARP:[8,6]},ARPOP={request:1,reply:2},PROTO={ICMP:1,UDP:17},ICMPTYPE={'echo-request':8,'echo-reply':0,'time-exceeded':11,'dest-unreachable':3};
const DNSTYPE={A:1,NS:2,CNAME:5,SOA:6,MX:15,TXT:16,AAAA:28},RCODE={NOERROR:0,SERVFAIL:2,NXDOMAIN:3,REFUSED:5};
const u32=n=>[n>>>24,(n>>>16)&255,(n>>>8)&255,n&255];
const dname=n=>{
  const out=[];
  for(const l of String(n).split('.').filter(Boolean)){
    if(l.length>63)throw new Error('DNS label too long: '+l);
    out.push(l.length,...[...l].map(c=>c.charCodeAt(0)));
  }
  return [...out,0];
};
const v6=s=>{
  const [a,b]=s.split('::'),h=x=>x?x.split(':').map(g=>parseInt(g,16)):[],l=h(a),r=b===undefined?[]:h(b);
  return (b===undefined?l:[...l,...Array(8-l.length-r.length).fill(0),...r]).flatMap(u16);
};
const RDATA={
  A:ipBytes,AAAA:v6,NS:dname,CNAME:dname,
  MX:d=>{const [p,n]=d.split(' ');return [...u16(+p),...dname(n)];},
  SOA:d=>{const [m,r,...n]=d.split(' ');return [...dname(m),...dname(r),...n.flatMap(x=>u32(+x))];}
};
const rrBytes=s=>{
  const r=parseRR(s);
  if(!r)throw new Error('bad DNS record: '+s);
  const d=pick(RDATA,r.type,'DNS record type')(r.data);
  return [...dname(r.name),...u16(DNSTYPE[r.type]),0,1,...u32(r.ttl),...u16(d.length),...d];
};
const ENC={
  Ethernet:(f,body)=>[...macBytes(f.dst),...macBytes(f.src),...pick(ETYPE,f.type,'Ethernet type'),...body],
  ARP:f=>[0,1,8,0,6,4,...u16(pick(ARPOP,f.op,'ARP op')),...macBytes(f.sha),...ipBytes(f.spa),...macBytes(f.tha),...ipBytes(f.tpa)],
  IPv4:(f,body)=>{
    const h=[0x45,0,...u16(20+body.length),0,0,0,0,f.ttl&255,pick(PROTO,f.proto,'IPv4 protocol'),0,0,...ipBytes(f.src),...ipBytes(f.dst)];
    h.splice(10,2,...u16(checksum(h)));
    return [...h,...body];
  },
  UDP:(f,body)=>[...u16(f.sport),...u16(f.dport),...u16(8+body.length),0,0,...body],
  DNS:f=>{
    const flags=(f.qr<<15)|(f.aa<<10)|(f.rd<<8)|(f.ra<<7)|pick(RCODE,f.rcode,'DNS rcode');
    const sec=(k,n)=>Array.from({length:n},(_,i)=>rrBytes(f[k+(i+1)])).flat();
    return [...u16(f.id),...u16(flags),0,1,...u16(f.ancount),...u16(f.nscount),...u16(f.arcount),...dname(f.qname),...u16(pick(DNSTYPE,f.qtype,'DNS type')),0,1,
      ...sec('an',f.ancount),...sec('ns',f.nscount),...sec('ar',f.arcount)];
  },
  ICMP:f=>{
    const t=pick(ICMPTYPE,f.type,'ICMP type');
    const m=[t,0,0,0,...(t===0||t===8?[...u16(f.id),...u16(f.seq)]:[0,0,0,0])];
    m.splice(2,2,...u16(checksum(m)));
    return m;
  }
};
/* encapsulate: encode the innermost layer first, each outer layer wraps the bytes so far */
const hex=p=>{
  let b=[];
  for(let i=p.layers.length-1;i>=0;i--){
    const l=p.layers[i];
    b=pick(ENC,l.name,'layer')(l.fields,b);
  }
  return b.map(x=>x.toString(16).padStart(2,'0')).join(' ');
};
NQ.pkt={eth,arp,ipv4,icmp,udp,dns,parseRR,fmtRR,stack,hex,layerNames,clone};
})();
