/* Network Quest chapter 5: NAT and public networks, on the home network (laptop and phone on one switch, the router
   home, the provider's router isp, then the web server). Missions 3, 5 and 7 run the terminal on the router home and
   mission 4 on the server web (m.dev); the rest run on the laptop. Checks read outcomes (the NAT table, the routes and
   NAT state the devices end up with, probe pings, the entries the learner's own commands left in the log); the
   questions are computed from the network, never written here. Mission 6 and 7 start with NAT switched off on home
   (setup `nat off`); mission 3 starts with one translation already made (the phone pinged the server); mission 5 starts
   without home's default route. The reference answers of 4 and 6 use traceroute because a failed ping exits 1 and the
   UI checks a mission only after a command that exits 0, but the checks accept a ping too. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const IPX=NQ.ip;
const bare=ip=>ip?ip.split('/')[0]:null;
const WEB='198.51.100.10',FAR='8.8.8.8'; // FAR: an address no route on home covers, so only a default route can carry it
const addrOf=(c,d,i)=>bare(c.net.devices[d].ifaces[i||'eth0'].ip);
const home=c=>c.net.devices.home;
const NAT_TABLE=/^\s*nat\s+table\s*$/;
/* did the learner print a NAT table with a line in it? Their lines are replayed on a clone started over, because nat off
   forgets the table and the lines before it are what the learner saw. */
const sawTable=c=>{
  const n=c.net.clone();n.reset();
  return c.history.some(h=>{const r=n.exec(h.line,'home');return h.code===0&&NAT_TABLE.test(h.line)&&/^proto /.test(r.out[0]||'');});
};
/* the inside address of the first translation: from the table, or, if NAT was switched off since (which forgets the
   table), from a clone of the network started over, where the setup's ping makes the translation again */
const firstInside=c=>{
  let t=(home(c).nat&&home(c).nat.table)||[];
  if(!t.length){const n=c.net.clone();n.reset();t=(n.devices.home.nat&&n.devices.home.nat.table)||[];}
  return t.length?t[0].inside:'';
};
const RUN_PING=/^\s*ping(\s|$)/,RUN_TRACE=/^\s*traceroute\s+\S+\s*$/;
/* the last echo request that reached web, from the learner's own commands (the log holds nothing else) */
const reqAtWeb=c=>c.last(e=>e.dev==='web'&&e.dir==='rx'&&c.layers(e).includes('ICMP')&&e.packet.layers.find(l=>l.name==='ICMP').fields.type==='echo-request');
const privateVerdict=c=>c.last(e=>{
  if(e.dir!=='drop'||!/^no route to \d/.test(e.verdict))return false;
  const n=IPX.parse(e.verdict.split(' ')[3]);
  return n!==null&&IPX.isPrivate(n);
});
const dropPriv=c=>c.last(e=>e.dir==='drop'&&/private source address/.test(e.verdict));
const ranTrace=c=>c.history.some(h=>RUN_TRACE.test(h.line)||RUN_PING.test(h.line));
const TRACE=[['traceroute','cmd','list the routers on the way']];
const NAT=[['nat','cmd','show or switch address translation']];

NQ.CH.push({name:'NAT and public networks',badge:'NAT Navigator',
 intro:'Your laptop has a private address, yet it reaches servers all over the world. This chapter is about the trick that makes that possible and the line between the private network at home and the public internet outside: how a router swaps private addresses for a public one on the way out, why nobody outside can start a conversation back, and what breaks when the router loses its way out or its translation is switched off. You will watch a packet change its source address, read the table that remembers every swap, and mend a home router twice.',
 learned:['NAT','translation','NAT table','nat','nat on','nat off','public side','private source address'],
 missions:[
 {title:'Out to the internet',scenario:'home',
  goal:'The laptop\'s address, <code>192.168.1.10</code>, is private, so nothing on the internet can send anything to it. Yet it wants to reach <code>web</code>, a server on the public internet at <code>198.51.100.10</code>. The trick is <b>NAT</b>, short for network address translation: the router <code>home</code>, which joins the house to the outside, swaps the laptop\'s private address for its own public one as the packet leaves (a <b>translation</b>), and swaps it back when the reply returns. In between sits <code>isp</code>, the router of the <b>ISP</b>, the internet service provider that sells the connection. Run <code>ping -c 1 198.51.100.10</code> and watch the laptop reach the server.',
  anat:[['ping','cmd','send a test packet'],['-c','opt','count'],['1','arg','how many'],[WEB,'arg','the web server']],
  how:['<code>ping -c 1 198.51.100.10</code> sends one echo request to the web server and waits for its reply, so you can see a laptop with a private address reach a public one.',
   'You know all three parts: <code>ping</code> is the command, <code>-c 1</code> asks for one try and <code>198.51.100.10</code> is the destination.',
   'The packet leaves the laptop with the laptop\'s private address as its source. When it reaches <code>home</code>, an entry marked translated (<code>nat</code>) appears in the packet panel: the source is now <code>home</code>\'s public address. The reply gets the opposite translation on its way back.',
   'A line saying <code>1 received</code> means the translation worked both ways.'],
  explain:'Without NAT the server would see packets from <code>192.168.1.10</code> and could never answer: countless home networks use that same private address. With NAT a whole house shares one public address, and <code>home</code> remembers what it swapped so it can hand each reply to the right device.',
  hint:'Type <code>ping -c 1 198.51.100.10</code> and look for a reply from the web server.',
  answer:['ping -c 1 198.51.100.10'],
  check:c=>{
    const n=home(c).nat;
    if(!n||!(n.table||[]).some(e=>e.inside===addrOf(c,'laptop')&&e.dst===WEB))return 'Ping the web server from the laptop first: <code>ping -c 1 198.51.100.10</code>.';
    return c.ping('laptop',WEB).delivered?true:'The ping did not get a reply from the web server. Look at the packet panel for where it stopped.';}},
 {title:'Whose address does the server see?',scenario:'home',
  goal:'A server can only answer the address it receives. Ping it again with <code>ping -c 1 198.51.100.10</code>, then open the echo request that arrived at <code>web</code> in the packet panel (the entry on <code>web</code> marked received, <code>rx</code>) and read the IPv4 <b>source address</b>, the address the packet says it came from. Type that address.',
  anat:[['ping','cmd','send a test packet'],['-c','opt','count'],['1','arg','how many'],[WEB,'arg','the web server']],
  how:['<code>ping -c 1 198.51.100.10</code> sends the echo request again, so the packet panel has fresh entries from every device on the path, including the server.',
   'The command is the same as before. What is new is where you look: find the entry whose device is <code>web</code> and whose direction is <code>rx</code>, and open it.',
   'Under the IPv4 layer, <code>src</code> is the source address and <code>dst</code> the destination. The destination is the server itself. The source is the address the server will send its reply to.',
   'Type the source address as your answer, and compare it with the laptop\'s own address.'],
  explain:'The laptop wrote its own private address as the source, but that address never reached the server: <code>home</code> replaced it on the way out. That is why the reply can find its way back: it is sent to a public address that belongs to <code>home</code>, which then hands it to the laptop. To the whole internet, the laptop, the phone and everything else in the house look like one machine.',
  hint:'Ping the server, open the received entry on <code>web</code>, and read <code>src</code> under IPv4.',
  answer:['ping -c 1 198.51.100.10'],
  check:c=>reqAtWeb(c)?true:'Ping the web server first, then open the echo request that arrived at <code>web</code>: <code>ping -c 1 198.51.100.10</code>.',
  question:{ask:'What source address does the echo request have when it arrives at <code>web</code>?',expect:c=>{const e=reqAtWeb(c);return e?e.packet.layers.find(l=>l.name==='IPv4').fields.src:'';}}},
 {title:'The translation table',scenario:'home',dev:'home',setup:[{dev:'phone',cmd:'ping -c 1 198.51.100.10'}],
  goal:'To send each reply to the right device, <code>home</code> keeps a list of what it has translated: the <b>NAT table</b>. This terminal runs <b>on <code>home</code></b> (look at the prompt), and a moment ago a device in the house pinged the web server. Run <code>nat table</code> to print the table. Each line shows the inside address (the private one), the outside address (the public one that replaced it) and the remote address (where the packet was going). Next to each address is an <b>id</b>, a ticket number that a <code>ping</code> carries so replies can be matched to requests. Type the inside address on the line.',
  anat:[...NAT,['table','arg','the list of translations']],
  how:['<code>nat table</code> prints the NAT table of <code>home</code>, one line for every translation it is remembering.',
   '<code>nat</code> is a command of this simulator for routers that translate addresses, and <code>table</code> says you want the list. With nothing after it, <code>nat</code> only says whether NAT is on.',
   'Read a line from left to right: <code>icmp</code> is the kind of packet, then the inside address with its id, then the outside address with the new id it was given on the way out, then the remote address. When a reply arrives for the outside address and that new id, <code>home</code> finds this line and knows which inside device it belongs to.',
   'Type the inside address as your answer.'],
  explain:'This is how many devices share one public address. Two devices can send a <code>ping</code> at the same time, because each gets its own outside id: the reply with that id picks the line, and the line says where to deliver. A packet that matches no line is thrown away, which is also why nobody outside can start a conversation with a device behind NAT. There is no line for it yet.',
  hint:'Run <code>nat table</code> and read the first address on the line.',
  answer:['nat table'],
  check:c=>sawTable(c)?true:'Run <code>nat table</code> on <code>home</code> while NAT is on, to print the table first.',
  question:{ask:'Which inside address is in the NAT table?',expect:firstInside}},
 {title:'A one-way street',scenario:'home',dev:'web',
  goal:'Now stand on the other side. This terminal runs <b>on <code>web</code></b>, the server on the public internet. Try to reach the laptop\'s private address with <code>traceroute 192.168.1.10</code>. The path ends at the provider\'s router, <code>isp</code>, which sends back an error. Open the packet panel and find the entry on <code>isp</code> that says why it cannot deliver the packet. Its note starts with two words. Type them.',
  anat:[...TRACE,['192.168.1.10','arg','the laptop\'s private address']],
  how:['<code>traceroute 192.168.1.10</code> follows a packet from the server towards the laptop\'s private address and shows where it stops.',
   'It is the command from the last chapter, and the destination is the laptop\'s address. The list is short: the same address answers twice, and the last line ends with <code>!N</code>, a flag for "no such network".',
   'Routers on the public internet have no entry for private addresses: every home uses the same ones, so nobody advertises them. <code>isp</code> has nothing to match, drops the packet and sends an error back to the server.',
   'In the packet panel, open the dropped entry on <code>isp</code> that mentions <code>192.168.1.10</code> and type the first two words of its note.'],
  explain:'The wall works in this direction too. A private address cannot be reached from the internet, and NAT only creates a table line when a device inside sends first. That is why nothing outside can open a conversation with your laptop on its own. A machine that must be found from outside, like this server, lives at a public address.',
  hint:'Run <code>traceroute 192.168.1.10</code> and open the dropped entry on <code>isp</code>; type the first two words of its note.',
  answer:['traceroute 192.168.1.10'],
  check:c=>privateVerdict(c)?true:'Run <code>traceroute 192.168.1.10</code> from the server and look for the dropped entry on <code>isp</code>.',
  question:{ask:'What are the first two words of the note where <code>isp</code> drops the packet?',
   expect:c=>{const e=privateVerdict(c);return e?e.verdict.split(' ').slice(0,2).join(' '):'';},
   accept:()=>['no route to host','no route to it','no routes','no route found']}},
 {title:'Lost the way out',scenario:'home',dev:'home',setup:[{dev:'home',cmd:'ip route del default'}],
  goal:'This terminal runs <b>on <code>home</code></b>. Someone deleted its default route, so it no longer knows where to send packets for the internet, and pings from the house fail. Run <code>ip route</code> to see that the <code>default</code> line is gone, then put it back. The gateway is the provider\'s router <code>isp</code>, which has the address <code>203.0.113.6</code> on the short wire between the two routers. Check with <code>ping -c 1 198.51.100.10</code>.',
  anat:[['ip','cmd','network settings tool'],['route','arg','the routing table'],['add','arg','put a route in the table'],['default','arg','the catch-all route'],['via','arg','the gateway comes next'],['203.0.113.6','arg','the provider\'s router']],
  how:['<code>ip route add default via 203.0.113.6</code> tells <code>home</code>: for any address you have no other route for, hand the packet to <code>isp</code> at <code>203.0.113.6</code>.',
   'It is the command from the last chapter. <code>add</code> puts a route in the table, <code>default</code> is the catch-all destination and <code>via</code> names the gateway.',
   'The gateway has to be on a wire <code>home</code> is directly on. <code>203.0.113.6</code> is the other end of the short wire that joins the two routers, so it is accepted.',
   'Check with <code>ping -c 1 198.51.100.10</code>. Once packets can leave, the laptop\'s pings work again too, because NAT is still switched on.'],
  explain:'NAT only swaps addresses. The router still needs a route to know where the packet leaves. A home router has one default route, to its provider, and it carries everything from the house to the internet. When a router loses it, every device in the house loses the internet at once while the house network itself looks fine.',
  hint:'Type <code>ip route add default via 203.0.113.6</code>, then <code>ping -c 1 198.51.100.10</code>.',
  answer:['ip route add default via 203.0.113.6','ping -c 1 198.51.100.10'],
  check:c=>{
    const r=c.route('home',FAR);
    if(!r)return '<code>home</code> still has no route towards the internet. Add the default route with <code>ip route add default via 203.0.113.6</code>.';
    if(r.via!==addrOf(c,'isp'))return 'The default route does not point at the provider\'s router. Its address on the wire to <code>home</code> is <code>203.0.113.6</code>.';
    if(!home(c).nat)return 'The route is back, but NAT is off on <code>home</code>. Switch it on with <code>nat on</code>.';
    return c.ping('laptop',WEB).delivered?true:'The laptop still cannot reach the web server. Compare the gateway in <code>ip route</code> with <code>203.0.113.6</code>.';}},
 {title:'A packet nobody wants',scenario:'home',setup:[{dev:'home',cmd:'nat off'}],
  goal:'Someone switched NAT off on <code>home</code>. Run <code>traceroute 198.51.100.10</code> from the laptop. Hop 1 answers, and then there are only stars, <code>* * *</code>: nothing comes back. Open the packet panel. <code>home</code> now forwards the laptop\'s packet with its private source address unchanged, and a router on the public side throws it away without sending any error. Providers do this on purpose, because a private source address can never be answered over the internet. Find the dropped entry that mentions the private source address and type the name of the device that dropped the packet.',
  anat:[...TRACE,[WEB,'arg','the web server']],
  how:['<code>traceroute 198.51.100.10</code> follows the laptop\'s packets towards the web server and shows how far they get.',
   'It is the same command as before. The first line is <code>home</code>, which answers because the TTL ran out on it. From the second line on there are only stars: the packet got past <code>home</code> and then vanished.',
   'In the packet panel, look for an entry marked dropped (<code>drop</code>) whose note mentions a private source address. The device name on that line is the one that threw the packet away.',
   'Type that device\'s name as your answer.'],
  explain:'With NAT off, the packet still says it comes from <code>192.168.1.10</code>. Even if the server received it, its reply would be sent to a private address and lost, so the first router on the public side refuses it. NAT is what lets a private network use the internet at all. The next mission switches it back on.',
  hint:'Run <code>traceroute 198.51.100.10</code>, open the dropped entry that mentions a private source address, and read the device name in the row.',
  answer:['traceroute 198.51.100.10'],
  check:c=>{
    if(!ranTrace(c))return 'Run <code>traceroute 198.51.100.10</code> from the laptop first.';
    return dropPriv(c)?true:'Nothing was dropped for a private source address. Trace the web server: <code>traceroute 198.51.100.10</code>.';},
  question:{ask:'Which device dropped the packet?',expect:c=>{const e=dropPriv(c);return e?e.dev:'';}}},
 {title:'Turn NAT back on',scenario:'home',dev:'home',setup:[{dev:'home',cmd:'nat off'}],
  goal:'This terminal runs <b>on <code>home</code></b>, and NAT is still off. Run <code>nat</code> to see its status, then switch translation on with <code>nat on</code>. The router has two sides: the <b>inside</b> faces the house and the <b>outside</b> faces the internet, and NAT translates packets that cross from the inside to the outside. When it is on, the laptop and the phone can reach the web server again; the check tries both for you.',
  anat:[...NAT,['on','arg','turn translation on']],
  how:['<code>nat on</code> switches address translation on for <code>home</code>, so packets leaving the house get the public source address again.',
   '<code>nat</code> is the command and <code>on</code> its argument. <code>nat off</code> would switch it off, and with nothing after it <code>nat</code> shows the status.',
   'Run <code>nat</code> first. It tells you whether NAT is on, and once it is, which card faces the house (<code>eth0</code>) and which faces the internet (<code>eth1</code>).',
   'After <code>nat on</code>, every device in the house can reach the server again, and each <code>ping</code> adds a line to the NAT table.'],
  explain:'A home router needs three things to give a house the internet: a card on each side, a default route to the provider, and NAT switched on. You have now repaired two of them. When a house loses the internet, checking them in that order finds most faults.',
  hint:'Type <code>nat on</code>.',
  answer:['nat','nat on'],
  check:c=>{
    if(!home(c).nat)return 'NAT is still off on <code>home</code>. Switch it on with <code>nat on</code>.';
    if(!c.ping('laptop',WEB).delivered)return 'NAT is on, but the laptop still cannot reach the web server. Check the default route with <code>ip route</code>.';
    return c.ping('phone',WEB).delivered?true:'The laptop gets through, but the phone does not. Look at <code>home</code> with <code>ip route</code> and <code>nat</code>.';}}
 ]});
})();
