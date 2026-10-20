/* Network Quest topology: devices, links and the starter scenarios. Specs are plain data; a Net is a deep copy of one
   plus its log and clock, and keeps the spec so reset() can restore it. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const copy=x=>JSON.parse(JSON.stringify(x));
/* spec builder: devs are [id,kind,[[iface,cidr|null],...],{routes,nat}], links are ['a.eth0','sw1.p1'] pairs.
   MACs count up in the order devices (then ifaces) are listed. */
const spec=(me,devs,links)=>{
  let n=0;
  const devices={};
  for(const [id,kind,ifs,o] of devs){
    const ifaces={};
    for(const [name,ip] of ifs)ifaces[name]={mac:NQ.ip.mac(++n),ip,up:true,peer:null};
    devices[id]={id,kind,ifaces,routes:(o&&o.routes)||[],neigh:{},macTable:{},nat:(o&&o.nat)||null};
  }
  const at=p=>{const [d,i]=p.split('.');return devices[d].ifaces[i];};
  for(const [a,b] of links){at(a).peer=b;at(b).peer=a;}
  return {me,devices};
};
const def=via=>({dst:'default',via,dev:'eth0'});
const E=ip=>[['eth0',ip]];
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
    ['isp','router',[['eth0','203.0.113.6/30'],['eth1','198.51.100.1/24']]],
    ['web','host',E('198.51.100.10/24'),{routes:[def('198.51.100.1')]}]
  ],[['laptop.eth0','sw1.p1'],['phone.eth0','sw1.p2'],['home.eth0','sw1.p3'],['home.eth1','isp.eth0'],['isp.eth1','web.eth0']])
};
/* build a Net from a spec; clone() copies the live state and keeps the same spec */
const make=(name,sp,state)=>{
  const net=Object.assign({name,me:sp.me},state||{devices:copy(sp.devices),log:[],clock:0});
  net.clone=()=>make(name,sp,copy({devices:net.devices,log:net.log,clock:net.clock}));
  net.reset=()=>{net.devices=copy(sp.devices);net.log=[];net.clock=0;};
  return net;
};
const createNet=(name,setup)=>{
  if(!Object.prototype.hasOwnProperty.call(SCENARIOS,name))throw new Error('unknown scenario: '+name+' (valid: '+Object.keys(SCENARIOS).join(', ')+')');
  if(setup&&setup.length)throw new Error('setup needs the shell (Task 8)');
  return make(name,SCENARIOS[name]);
};
NQ.SCENARIOS=SCENARIOS;NQ.createNet=createNet;
})();
