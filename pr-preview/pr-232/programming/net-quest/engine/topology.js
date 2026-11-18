/* Network Quest topology: devices, links and the starter scenarios. Specs are plain data; a Net is a deep copy of one
   plus its log and clock, and keeps the spec so reset() can restore it. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const copy=x=>JSON.parse(JSON.stringify(x));
/* spec builder: devs are [id,kind,[[iface,cidr|null],...],{routes,nat,dropPrivate,dns}], links are ['a.eth0','sw1.p1'] pairs.
   MACs count up in the order devices (then ifaces) are listed. dropPrivate: the device drops any packet it receives from
   a private (RFC 1918) source, as ISPs do. */
const spec=(me,devs,links)=>{
  let n=0;
  const devices={};
  for(const [id,kind,ifs,o] of devs){
    const ifaces={};
    for(const [name,ip] of ifs)ifaces[name]={mac:NQ.ip.mac(++n),ip,up:true,peer:null};
    devices[id]={id,kind,ifaces,routes:(o&&o.routes)||[],neigh:{},permanent:[],macTable:{},nat:(o&&o.nat)||null,dropPrivate:!!(o&&o.dropPrivate)};
    if(o&&o.dns)devices[id].dns=copy(o.dns);
  }
  const at=p=>{const [d,i]=p.split('.');return devices[d].ifaces[i];};
  for(const [a,b] of links){at(a).peer=b;at(b).peer=a;}
  return {me,devices};
};
const def=via=>({dst:'default',via,dev:'eth0'});
const E=ip=>[['eth0',ip]];
/* every record has TTL 300 and every SOA minimum is 60; a zone's NS records below its origin are delegations, and the
   A records of their targets in the same zone are the glue */
const rec=(name,type,data)=>({name,type,ttl:300,data});
const zone=(origin,mname,records)=>({origin,soa:{ttl:300,mname,rname:'hostmaster.'+mname.replace(/^[^.]+\./,''),serial:1,refresh:3600,retry:600,expire:86400,minimum:60},records});
const dnsSpec=cache=>spec('laptop',[
  ['laptop','host',E('192.168.1.10/24'),{routes:[def('192.168.1.1')],dns:{resolver:'192.168.1.53',roots:['192.0.2.10']}}],
  ['resolver','host',E('192.168.1.53/24'),{routes:[def('192.168.1.1')],dns:{recursive:true,roots:['192.0.2.10'],now:0,cache}}],
  ['sw1','switch',[['p1',null],['p2',null],['p3',null]]],
  ['r1','router',[['eth0','192.168.1.1/24'],['eth1','192.0.2.1/24'],['eth2','198.51.100.1/24'],['eth3','203.0.113.1/24']]],
  ['root','host',E('192.0.2.10/24'),{routes:[def('192.0.2.1')],dns:{zones:[zone('.','a.root-servers.test.',[
    rec('.','NS','a.root-servers.test.'),rec('a.root-servers.test.','A','192.0.2.10'),
    rec('test.','NS','a.nic.test.'),rec('a.nic.test.','A','198.51.100.10')])]}}],
  ['tld','host',E('198.51.100.10/24'),{routes:[def('198.51.100.1')],dns:{zones:[zone('test.','a.nic.test.',[
    rec('test.','NS','a.nic.test.'),rec('a.nic.test.','A','198.51.100.10'),
    rec('example.test.','NS','ns1.example.test.'),rec('ns1.example.test.','A','203.0.113.10')])]}}],
  ['auth','host',E('203.0.113.10/24'),{routes:[def('203.0.113.1')],dns:{zones:[zone('example.test.','ns1.example.test.',[
    rec('example.test.','NS','ns1.example.test.'),rec('ns1.example.test.','A','203.0.113.10'),
    rec('www.example.test.','A','198.18.0.80'),rec('www.example.test.','AAAA','2001:db8::80'),
    rec('shop.example.test.','CNAME','www.example.test.'),
    rec('example.test.','MX','10 mail.example.test.'),rec('mail.example.test.','A','198.18.0.25')])]}}]
],[['laptop.eth0','sw1.p1'],['resolver.eth0','sw1.p2'],['r1.eth0','sw1.p3'],['r1.eth1','root.eth0'],['r1.eth2','tld.eth0'],['r1.eth3','auth.eth0']]);
const SCENARIOS={
  pair:spec('laptop',[
    ['laptop','host',E('10.0.0.2/24')],
    ['phone','host',E('10.0.0.3/24')],
    ['sw1','switch',[['p1',null],['p2',null]]]
  ],[['laptop.eth0','sw1.p1'],['phone.eth0','sw1.p2']]),
  office:spec('laptop',[
    ['laptop','host',E('192.168.1.10/24'),{routes:[def('192.168.1.1')]}],
    ['printer','host',E('192.168.1.20/24')],
    ['sw1','switch',[['p1',null],['p2',null],['p3',null]]],
    ['r1','router',[['eth0','192.168.1.1/24'],['eth1','10.0.1.1/30']],{routes:[{dst:'172.16.0.0/24',via:'10.0.1.2',dev:'eth1'}]}],
    ['r2','router',[['eth0','10.0.1.2/30'],['eth1','172.16.0.1/24']],{routes:[def('10.0.1.1')]}],
    ['server','host',E('172.16.0.10/24'),{routes:[def('172.16.0.1')]}]
  ],[['laptop.eth0','sw1.p1'],['printer.eth0','sw1.p2'],['r1.eth0','sw1.p3'],['r1.eth1','r2.eth0'],['r2.eth1','server.eth0']]),
  home:spec('laptop',[
    ['laptop','host',E('192.168.1.10/24'),{routes:[def('192.168.1.1')]}],
    ['phone','host',E('192.168.1.11/24'),{routes:[def('192.168.1.1')]}],
    ['sw1','switch',[['p1',null],['p2',null],['p3',null]]],
    ['home','router',[['eth0','192.168.1.1/24'],['eth1','203.0.113.5/30']],{routes:[{dst:'default',via:'203.0.113.6',dev:'eth1'}],nat:{inside:'eth0',outside:'eth1',table:[]}}],
    ['isp','router',[['eth0','203.0.113.6/30'],['eth1','198.51.100.1/24']],{dropPrivate:true}],
    ['web','host',E('198.51.100.10/24'),{routes:[def('198.51.100.1')]}]
  ],[['laptop.eth0','sw1.p1'],['phone.eth0','sw1.p2'],['home.eth0','sw1.p3'],['home.eth1','isp.eth0'],['isp.eth1','web.eth0']]),
  dns:dnsSpec([]),
  'dns-stale':dnsSpec([{name:'www.example.test.',type:'A',expires:3600,rcode:'NOERROR',rrs:[rec('www.example.test.','A','198.18.0.99')]}])
};
/* build a Net from a spec; clone() copies the live state and keeps the same spec and setup; probe() is a clone with an
   empty log, for a check's own trial runs, which must not pay for the whole session's log. exec/clone/probe/reset are
   non-enumerable so {...net} or Object.assign cannot produce a copy still bound to the original. setup is a list of
   {dev, cmd} lines run through the shell on create and again after every reset(); they leave no log and no clock. */
const hide=(o,k,f)=>Object.defineProperty(o,k,{value:f,writable:true,configurable:true,enumerable:false});
const applySetup=(net,setup)=>{
  for(const s of setup||[]){
    const r=net.exec(s.cmd,s.dev);
    if(r.code!==0)throw new Error(`setup failed on ${s.dev}: ${s.cmd}: ${r.err.join(' ')}`);
  }
  if(setup&&setup.length){net.log=[];net.clock=0;}
};
const make=(name,sp,setup,state)=>{
  const net=Object.assign({name,me:sp.me},state||{devices:copy(sp.devices),log:[],clock:0});
  hide(net,'exec',(line,devId)=>NQ.exec(net,line,devId));
  hide(net,'clone',()=>make(name,sp,setup,copy({devices:net.devices,log:net.log,clock:net.clock})));
  hide(net,'probe',()=>make(name,sp,setup,{devices:copy(net.devices),log:[],clock:net.clock}));
  hide(net,'reset',()=>{net.devices=copy(sp.devices);net.log=[];net.clock=0;applySetup(net,setup);});
  return net;
};
const createNet=(name,setup)=>{
  if(!Object.prototype.hasOwnProperty.call(SCENARIOS,name))throw new Error('unknown scenario: '+name+' (valid: '+Object.keys(SCENARIOS).join(', ')+')');
  const net=make(name,SCENARIOS[name],setup?copy(setup):null);
  applySetup(net,setup);
  return net;
};
NQ.SCENARIOS=SCENARIOS;NQ.createNet=createNet;
})();
