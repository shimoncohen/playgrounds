/* Network Quest DNS commands: dig, sleep, resolvectl and rndc, printed the way the real ones print. Queries run on
   NQ.dns; sleep only moves the devices' dns.now, it never waits. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const IPX=NQ.ip,P=NQ.pkt;
const ret=(out,err,code)=>({out,err,code});
const fail=(code,...err)=>ret([],err,code);
const TYPES=['A','AAAA','CNAME','NS','MX','TXT'];
const DIG_USAGE='Usage: dig [@server] name [type] [+short] [+norecurse] [+trace]';
const MAX_HOPS=10;
const NAME=/^[A-Za-z0-9_*-]{1,63}(\.[A-Za-z0-9_*-]{1,63})*\.?$/;
const tab=(...c)=>c.join('\t');
const rrLine=r=>tab(r.name,r.ttl,'IN',r.type,r.data);
const size=m=>P.hex(P.stack({name:'DNS',fields:m})).split(' ').length;
const timeout=(server,head)=>ret([...head,';; communications error to '+server+'#53: timed out',';; no servers could be reached'],[],9);

const parse=args=>{
  const o={server:null,name:null,type:'A',short:false,rd:true,trace:false};
  for(const a of args){
    if(a[0]==='@')o.server=a.slice(1);
    else if(a==='+short')o.short=true;
    else if(a==='+norecurse')o.rd=false;
    else if(a==='+trace')o.trace=true;
    else if(a[0]==='+')return {error:fail(1,'Invalid option: '+a)};
    else if(o.name===null)o.name=a;
    else if(TYPES.includes(a.toUpperCase()))o.type=a.toUpperCase();
    else return {error:fail(1,"dig: '"+a+"' is not a record type this dig knows ("+TYPES.join(', ')+')')};
  }
  if(o.name===null)return {error:fail(2,DIG_USAGE)};
  if(!NAME.test(o.name)||o.name.length>253)return {error:fail(1,"dig: '"+o.name+"' is not a legal name")};
  return o;
};

const section=(title,rrs)=>rrs.length?['',';; '+title+' SECTION:',...rrs.map(rrLine)]:[];
const full=(m,server,ms)=>{
  const flags=[['qr',m.qr],['aa',m.aa],['rd',m.rd],['ra',m.ra]].filter(f=>f[1]).map(f=>f[0]).join(' ');
  return [';; Got answer:',
    ';; ->>HEADER<<- opcode: '+m.opcode+', status: '+m.rcode+', id: '+m.id,
    ';; flags: '+flags+'; QUERY: 1, ANSWER: '+m.ancount+', AUTHORITY: '+m.nscount+', ADDITIONAL: '+m.arcount,
    ...(m.rd&&!m.ra?[';; WARNING: recursion requested but not available']:[]),
    '',';; QUESTION SECTION:',';'+tab(m.qname,'','IN',m.qtype),
    ...section('ANSWER',NQ.dns.recs(m,'an')),...section('AUTHORITY',NQ.dns.recs(m,'ns')),...section('ADDITIONAL',NQ.dns.recs(m,'ar')),
    '',';; Query time: '+ms+' msec',';; SERVER: '+server+'#53('+server+') (UDP)',';; MSG SIZE  rcvd: '+size(m)];
};

/* the client walks the delegations itself from dns.roots, one question per server with recursion off; the sim skips the
   first query for the root's own NS list */
const trace=(net,dev,o,head)=>{
  const out=[...head];
  let server=(dev.dns.roots||[])[0],name=NQ.dns.rootName(0).replace(/\.$/,'');
  for(let hop=0;hop<MAX_HOPS&&server;hop++){
    const r=NQ.dns.query(net,dev.id,{server,name:o.name,type:o.type,rd:false});
    if(r.status!=='ok')return timeout(server,out);
    const m=r.msg,an=NQ.dns.recs(m,'an'),ns=NQ.dns.recs(m,'ns'),ar=NQ.dns.recs(m,'ar'),cut=ns.find(x=>x.type==='NS');
    out.push(...(an.length?an:ns).map(rrLine),';; Received '+size(m)+' bytes from '+server+'#53('+name+') in '+r.ms+' ms','');
    if(an.length||m.rcode!=='NOERROR'||!cut)break;
    const glue=ar.find(x=>x.type==='A'&&x.name===cut.data);
    server=glue&&glue.data;
    name=cut.data.replace(/\.$/,'');
  }
  return ret(out,[],0);
};

const dig=(net,dev,args)=>{
  const o=parse(args);
  if(o.error)return o.error;
  const head=['; <<>> DiG <<>> '+args.filter(a=>a[0]!=='@'&&a!=='+short'&&a!=='+norecurse').join(' '),';; global options: +cmd'];
  if(o.trace)return trace(net,dev,o,head);
  const server=o.server===null?dev.dns.resolver||'127.0.0.1':o.server;
  if(IPX.parse(server)===null)return ret([";; couldn't get address for '"+server+"': not found"],[],9);
  const r=NQ.dns.query(net,dev.id,{server,name:o.name,type:o.type,rd:o.rd});
  if(r.status!=='ok')return timeout(server,o.short?[]:head);
  if(o.short)return ret(NQ.dns.recs(r.msg,'an').map(x=>x.data),[],0);
  return ret([...head,...full(r.msg,server,r.ms)],[],0);
};

const sleep=(net,dev,args)=>{
  if(!args.length)return fail(1,'sleep: missing operand');
  if(!/^\d{1,9}$/.test(args[0]))return fail(1,"sleep: invalid time interval '"+args[0]+"'");
  if(args.length>1)return fail(1,"sleep: extra operand '"+args[1]+"'");
  for(const d of Object.values(net.devices))if(d.dns)d.dns.now=(d.dns.now||0)+ +args[0];
  return ret([],[],0);
};

const resolvectl=(net,dev,args)=>{
  if(args[0]!=='dns'||args.length!==3)return fail(2,'Usage: resolvectl dns <interface> <ip-address>');
  if(!Object.prototype.hasOwnProperty.call(dev.ifaces,args[1]))return fail(1,'Failed to resolve interface "'+args[1]+'": No such device');
  if(IPX.parse(args[2])===null)return fail(1,'Failed to parse DNS server address: '+args[2]);
  dev.dns.resolver=args[2];
  return ret([],[],0);
};

const rndc=(net,dev,args)=>{
  if(!args.length)return fail(1,'Usage: rndc flush');
  if(args[0]!=='flush'||args.length>1)return fail(1,"rndc: '"+args[0]+"' failed: unknown command");
  dev.dns.cache=[];
  return ret([],[],0);
};

NQ.AVAIL.dig=NQ.AVAIL.sleep=dev=>!!dev.dns;
NQ.AVAIL.resolvectl=dev=>!!(dev.dns&&dev.dns.resolver);
NQ.AVAIL.rndc=dev=>!!(dev.dns&&dev.dns.recursive);
NQ.reg('dig','look up the address behind a name (try: dig www.example.test)',dig);
NQ.reg('sleep','let some seconds pass (try: sleep 60)',sleep);
NQ.reg('resolvectl','choose which server this computer asks to look up names',resolvectl);
NQ.reg('rndc','forget what this server remembered (try: rndc flush)',rndc);
NQ.dnsCmds={dig,sleep,resolvectl,rndc};
})();
