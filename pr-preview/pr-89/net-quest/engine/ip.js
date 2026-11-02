/* Network Quest addressing helpers: IPv4 as unsigned 32-bit numbers, CIDR math, MACs. DOM-free, so Node can test it. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const OCT=/^(0|[1-9]\d{0,2})$/;
const parse=s=>{
  if(typeof s!=='string')return null;
  const p=s.split('.');
  if(p.length!==4)return null;
  let n=0;
  for(const o of p){if(!OCT.test(o)||+o>255)return null;n=n*256+ +o}
  return n;
};
const fmt=n=>[n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.');
const cidr=s=>{
  if(typeof s!=='string')return null;
  const p=s.split('/');
  if(p.length!==2||!OCT.test(p[1])||+p[1]>32)return null;
  const ip=parse(p[0]);
  if(ip===null)return null;
  const prefix=+p[1],mask=prefix?(0xFFFFFFFF<<(32-prefix))>>>0:0,net=(ip&mask)>>>0;
  return{ip,prefix,mask,net,bcast:(net|~mask)>>>0};
};
const inSubnet=(ip,c)=>((ip&c.mask)>>>0)===c.net;
const P10=cidr('10.0.0.0/8'),P172=cidr('172.16.0.0/12'),P192=cidr('192.168.0.0/16');
/* RFC 1918 only; isPublic also excludes loopback, link-local, 0/8 and multicast/reserved (224/4 and up) */
const isPrivate=n=>inSubnet(n,P10)||inSubnet(n,P172)||inSubnet(n,P192);
const isPublic=n=>!(isPrivate(n)||n>>>24===127||n>>>16===0xA9FE||n>>>24===0||n>>>28>=14);
const mac=n=>{
  if(!Number.isInteger(n)||n<0||n>255)throw new RangeError('mac(n): n must be an integer 0..255');
  return '02:00:00:00:00:'+n.toString(16).padStart(2,'0');
};
NQ.ip={parse,fmt,cidr,inSubnet,isPrivate,isPublic,mac};
})();
