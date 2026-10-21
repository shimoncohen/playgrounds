/* Network Quest chapter 4: routing and the gateway, on the office network (laptop and printer on one switch, router r1,
   router r2, then the server). Mission 2 runs the terminal on the printer and mission 5 on the router r1 (m.dev); the rest run on the laptop.
   Checks read outcomes (the routes a device ends up with, probe pings both ways, the traceroute the learner ran); the
   questions are computed from the network, never written here. Traceroute runs are re-run on a clone of the final net,
   so what a question expects is what that traceroute prints. Loops: mission 6's setup gives r1 a default route towards r2,
   while r2's default already points back at r1, so a packet for an unknown address ping-pongs until its TTL runs out. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const bare=ip=>ip?ip.split('/')[0]:null;
const SERVER='172.16.0.10',FAR='8.8.8.8'; // FAR: an address no route in the office covers, so only a default route can carry it
const gw=c=>bare(c.net.devices.r1.ifaces.eth0.ip); // the office router's address on the laptop's wire
const addrOf=(c,d)=>bare(c.net.devices[d].ifaces.eth0.ip);
const SHOW_ROUTE=/^\s*ip\s+(r|route)(\s+(show|list))?\s*$/;
/* the latest traceroute the learner ran that worked, re-run on a clone of the final network from the terminal's device:
   {ip, hops}, or null */
const traced=c=>{
  const h=c.history.filter(x=>x.code===0&&/^\s*traceroute\s+\S+\s*$/.test(x.line)).at(-1);
  if(!h)return null;
  const ip=h.line.trim().split(/\s+/)[1];
  return {ip,hops:NQ.sim.traceroute(c.net.clone(),c.net.me,ip).hops};
};
const reached=t=>!!t&&t.hops.length>0&&t.hops.at(-1).reached;
const looped=t=>!!t&&t.hops.length>=5&&!t.hops[4].reached&&t.hops[1].from&&t.hops[1].from===t.hops[3].from&&t.hops[2].from&&t.hops[2].from===t.hops[4].from;
const ROUTE=[['ip','cmd','network settings tool'],['route','arg','the routing table']];
const DEFAULT_ADD=[...ROUTE,['add','arg','put a route in the table'],['default','arg','the catch-all route'],['via','arg','the gateway comes next'],['192.168.1.1','arg','the gateway']];

NQ.CH.push({name:'Routing and the gateway',badge:'Pathfinder',
 intro:'So far every conversation stayed on one wire. Real networks are many wires joined by routers, and this chapter is about leaving your own wire: how a device decides where to send a packet bound for somewhere else, what breaks when those directions are missing or wrong, and how to follow a packet through the routers on its way. You will read directions, mend them on a printer, a laptop and a router, and catch a packet running in circles.',
 learned:['ip route','routing table','default route','gateway','ip route add','ip route del','static route','traceroute','hop','TTL expiry','routing loop'],
 missions:[
 {title:'Read the routing table',scenario:'office',
  goal:'Every device keeps a list of rules for where to send a packet, called its <b>routing table</b>, and each rule is a <b>route</b>. Run <code>ip route</code> on the laptop to print its table. One route says that addresses on the laptop\'s own wire are delivered straight to their owner. Another starts with the word <code>default</code>: the <b>default route</b>, the rule for every address that no other route fits. It names a <b>gateway</b>, the router the laptop hands those packets to. Type the gateway\'s address.',
  anat:[...ROUTE],
  how:['<code>ip route</code> prints the laptop\'s routing table, one route per line, so you can see where it sends packets for each destination.',
   '<code>ip</code> is the command you know from <code>ip addr</code> and <code>ip neigh</code>; <code>route</code> says you want the routes. On its own it only lists them.',
   'The line that starts with a subnet and ends with <code>scope link</code> is a wire the laptop is directly on: it delivers there without help. The line that starts with <code>default</code> is the catch-all, and the address after <code>via</code> is its gateway.',
   'Type that gateway address as your answer.'],
  explain:'A laptop does not need to know the whole internet, only two things: who is on its own wire, and which router to give everything else to. The gateway is that router, which is why a laptop with a broken gateway can still talk to its neighbours but nobody farther away.',
  hint:'Run <code>ip route</code> and read the address after <code>via</code> on the <code>default</code> line.',
  answer:['ip route'],
  check:c=>c.history.some(h=>h.code===0&&SHOW_ROUTE.test(h.line))?true:'Run <code>ip route</code> on the laptop to print its routing table first.',
  question:{ask:'What is the gateway address in the laptop\'s default route?',expect:c=>{const r=c.route('laptop',FAR);return r&&r.via?r.via:'';}}},
 {title:'No way out',scenario:'office',dev:'printer',
  goal:'The printer can talk to its neighbours, but it has never been told about a gateway. This terminal runs <b>on the printer</b> (look at the prompt). Run <code>ping -c 1 172.16.0.10</code> to try to reach the server: it fails because the printer has no route that fits. Fix it by adding a default route whose gateway is the office router, which has the address <code>192.168.1.1</code> on this wire (the laptop\'s table named it). Then run the same <code>ping</code> again.',
  anat:DEFAULT_ADD,
  how:['<code>ip route add default via 192.168.1.1</code> tells the printer: for any address you have no other route for, hand the packet to the router at <code>192.168.1.1</code>.',
   '<code>ip route</code> is the same pair you used to read the table, and <code>add</code> puts a new route into it. <code>default</code> is the destination: the catch-all that matches everything else.',
   '<code>via 192.168.1.1</code> names the gateway. It has to be an address on the printer\'s own wire, because the printer can only hand a packet to something it can reach directly.',
   'Check with <code>ping -c 1 172.16.0.10</code>. The server is on another network, so the packet crosses the router to get there and the reply comes back the same way.'],
  explain:'Before the fix, <code>ip route</code> on the printer listed only its own wire, so the printer answered <code>Network is unreachable</code> without sending anything: it had no rule to follow. A host with no default route is stuck on its own wire. Printers and cameras are often set up this way by accident.',
  hint:'Type <code>ip route add default via 192.168.1.1</code>, then <code>ping -c 1 172.16.0.10</code>.',
  answer:['ip route add default via 192.168.1.1','ping -c 1 172.16.0.10'],
  check:c=>{
    const r=c.route('printer',FAR);
    if(!r)return 'The printer still has no default route. Add one with <code>ip route add default via 192.168.1.1</code>.';
    if(r.via!==gw(c))return 'The printer has a default route, but its gateway is not the office router. The router is at <code>192.168.1.1</code>.';
    return c.ping('printer',SERVER).delivered?true:'The printer still cannot reach the server. Check that the gateway is the router\'s address, <code>192.168.1.1</code>.';}},
 {title:'The wrong gateway',scenario:'office',setup:[{dev:'laptop',cmd:'ip route del default'},{dev:'laptop',cmd:'ip route add default via 192.168.1.2'}],
  goal:'The laptop has a default route, but someone typed its gateway wrong. Run <code>ping -c 1 172.16.0.10</code> and watch it fail with <code>Destination Host Unreachable</code>. Then open the packet panel and look at the ARP request: the laptop is not asking who has the server\'s address. It is asking for the <b>gateway\'s</b> MAC, because the frame must go to the router, and nobody answers. Fix the default route with <code>ip route del default</code> and then <code>ip route add default via</code> the real router, <code>192.168.1.1</code>, and run the same <code>ping</code> again.',
  anat:[...ROUTE,['del','arg','remove a route'],['default','arg','the catch-all route'],['add','arg','put a route in the table'],['via','arg','the gateway comes next'],['192.168.1.1','arg','the real gateway']],
  how:['<code>ip route del default</code> followed by <code>ip route add default via 192.168.1.1</code> swaps the laptop\'s broken gateway for the real router\'s address.',
   '<code>del</code> is short for delete, the same word you used on addresses: it removes the route that is named. <code>ip route add</code> refuses a second default route, which is why the old one has to go first.',
   'The server\'s IP address stays the same all the way, but each wire needs a MAC, so the first frame is addressed to the gateway\'s MAC. That is why the ARP request asks about the gateway\'s address, and why a gateway that does not exist leaves the request unanswered.',
   'Finish with <code>ping -c 1 172.16.0.10</code>. Once the right router is the gateway, the ARP request is answered and the reply comes back.'],
  explain:'The packet was addressed to the server the whole time, but the laptop first needs the next stop\'s MAC. With a typo in the gateway there was no next stop, so nothing left the laptop. Whenever far-away addresses fail and near ones work, check the gateway first.',
  hint:'Run <code>ip route</code> to read the gateway, delete the default route with <code>ip route del default</code>, then add it again with <code>192.168.1.1</code>.',
  answer:['ip route del default','ip route add default via 192.168.1.1','ping -c 1 172.16.0.10'],
  check:c=>{
    const r=c.route('laptop',FAR);
    if(!r)return 'The laptop has no default route now. Add one with <code>ip route add default via 192.168.1.1</code>.';
    if(r.via!==gw(c))return 'The laptop\'s gateway is still not the router. In the packet panel, the ARP request asks for the gateway and nobody answers: use the router\'s address, <code>192.168.1.1</code>.';
    return c.ping('laptop',SERVER).delivered?true:'The laptop still cannot reach the server. Compare its gateway in <code>ip route</code> with the router\'s address.';}},
 {title:'Follow the hops',scenario:'office',
  goal:'Each router a packet passes through is one <b>hop</b>. <code>traceroute</code> lists them by sending probes with a growing TTL. The first probe gets TTL 1, so the first router lowers it to 0, throws the packet away (<b>TTL expiry</b>) and sends back a "time exceeded" message that reveals its address. The next probe gets TTL 2, and so on until the server itself answers. Run <code>traceroute 172.16.0.10</code>, then type the address that answers on hop 2.',
  anat:[['traceroute','cmd','list the routers on the way'],['172.16.0.10','arg','the server']],
  how:['<code>traceroute 172.16.0.10</code> prints every router between the laptop and the server, one numbered line each, so you can see the path a packet takes.',
   '<code>traceroute</code> is the command and <code>172.16.0.10</code> its argument, the destination. The number at the start of each line is the TTL of the probe that found it, which is also the hop number.',
   'Each line shows the address that answered and three round-trip times. A router answers with the address of the card the probe arrived on. The last line is the server itself, which is not a router but answers because the probe reached it.',
   'Find the line that starts with <code>2</code> and type the address on it.'],
  explain:'This is the TTL from chapter 1 put to work. Every router lowers it by one, and the router that lowers it to 0 gives itself away. Network engineers use <code>traceroute</code> to find where a path is slow or stops: the last router that answers is the last place the packet got to.',
  hint:'Run <code>traceroute 172.16.0.10</code> and read the address on the line that starts with <code>2</code>.',
  answer:['traceroute 172.16.0.10'],
  check:c=>{
    const t=traced(c);
    if(!t)return 'Run <code>traceroute 172.16.0.10</code> to list the hops first.';
    return t.ip===SERVER&&reached(t)?true:'Trace the path to the server: <code>traceroute 172.16.0.10</code>.';},
  question:{ask:'Which address answers on hop 2?',expect:c=>{const t=traced(c);return t&&t.hops[1]&&t.hops[1].from?t.hops[1].from:'';}}},
 {title:'A route r1 forgot',scenario:'office',dev:'r1',setup:[{dev:'r1',cmd:'ip route del 172.16.0.0/24'}],
  goal:'Routers have terminals too, and this one runs <b>on r1</b>, the office router (look at the prompt). Nobody can reach the server now, because r1 has lost the route to the server\'s network, <code>172.16.0.0/24</code>, which hangs off the router r2 at <code>10.0.1.2</code> on the middle wire. Run <code>ip route</code> to see what r1 knows, then add a <b>static route</b>, one you write by hand, with <code>ip route add 172.16.0.0/24 via 10.0.1.2</code>. Check it with <code>ping -c 1 172.16.0.10</code>.',
  anat:[...ROUTE,['add','arg','put a route in the table'],['172.16.0.0/24','arg','the network the route covers'],['via','arg','the gateway comes next'],['10.0.1.2','arg','the next router, r2']],
  how:['<code>ip route add 172.16.0.0/24 via 10.0.1.2</code> tells r1: for any address in <code>172.16.0.0/24</code>, hand the packet to r2 at <code>10.0.1.2</code>.',
   'This is the same <code>ip route add</code> as before, but the destination is a subnet instead of <code>default</code>. The address after <code>via</code> is the gateway for this route, the neighbour to hand packets to. It must sit on a wire r1 is directly on.',
   'Routers usually know their own wires and a few routes like this one. Adding just the server\'s network is better than adding a <code>default</code> route here, because r2 hands any address it does not know straight back to r1.',
   'Check with <code>ping -c 1 172.16.0.10</code>. Replies find their own way home through r2\'s default route.'],
  explain:'A router only forwards packets it has a route for. With the route missing, r1 had to turn the laptop\'s packets away with a "network unreachable" message. Adding a route for exactly the server\'s network fixes the laptop and the printer in one go, since both send their far-away packets through r1.',
  hint:'Type <code>ip route add 172.16.0.0/24 via 10.0.1.2</code>, then <code>ping -c 1 172.16.0.10</code>.',
  answer:['ip route add 172.16.0.0/24 via 10.0.1.2','ping -c 1 172.16.0.10'],
  check:c=>{
    if(c.route('r1',FAR))return 'r1 now has a catch-all route. That reaches the server, but r2 would hand every unknown address straight back to r1. Add a route for just the server\'s network, <code>172.16.0.0/24</code>.';
    if(!c.route('r1',SERVER))return 'r1 still has no route that covers the server. Add one for <code>172.16.0.0/24</code> with <code>ip route add</code>.';
    if(!c.ping('laptop',SERVER).delivered)return 'The laptop still cannot reach the server. The gateway of the new route must be r2\'s address on the middle wire, <code>10.0.1.2</code>.';
    return c.ping('server',addrOf(c,'laptop')).delivered?true:'The server cannot answer the laptop. Check the route\'s gateway with <code>ip route</code>.';}},
 {title:'Round and round',scenario:'office',setup:[{dev:'r1',cmd:'ip route add default via 10.0.1.2'}],
  goal:'Someone gave r1 a default route that hands unknown addresses to r2, but r2\'s default route already hands them back to r1. A packet for an address neither knows would bounce between them: a <b>routing loop</b>. Only its TTL stops it. Run <code>traceroute 8.8.8.8</code> from the laptop (an address outside the office that no route covers) and read the list: the same addresses keep answering. Then type the address that answers on hop 3 and again on hop 5.',
  anat:[['traceroute','cmd','list the routers on the way'],['8.8.8.8','arg','an address outside the office']],
  how:['<code>traceroute 8.8.8.8</code> follows a packet towards an address that no router in the office can deliver, so you can watch where it ends up.',
   'It is the same command as last time. The probes do not reach a destination here: every line is a router answering "time exceeded" because the TTL ran out on it.',
   'Read the addresses down the list. After the first hop they alternate between the same two, because the packet goes r2, r1, r2, r1 and never gets any closer. The list ends at hop 30, the most <code>traceroute</code> tries by default.',
   'Type the address that answers on hop 3 and again on hop 5.'],
  explain:'Without a TTL the packet would circle forever and the two routers would be kept busy by it. Every router lowers the TTL, so the packet dies after at most 64 hops and the sender hears "time exceeded". The cure is to remove the default route on r1 (<code>ip route del default</code>), or to give r1 a route for just the server\'s network as in the last mission.',
  hint:'Run <code>traceroute 8.8.8.8</code> and compare the address on the line that starts with <code>3</code> with the one on the line that starts with <code>5</code>.',
  answer:['traceroute 8.8.8.8'],
  check:c=>{
    const t=traced(c);
    if(!t)return 'Run <code>traceroute 8.8.8.8</code> to follow a packet that has nowhere to go.';
    return looped(t)?true:'That traceroute does not loop. Try an address outside the office, like <code>8.8.8.8</code>.';},
  question:{ask:'Which address answers on hop 3 and again on hop 5?',expect:c=>{const t=traced(c);return looped(t)?t.hops[2].from:'';}}}
 ]});
})();
