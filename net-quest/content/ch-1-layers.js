/* Network Quest chapter 1: layers and packets, on the pair network (laptop 10.0.0.2 and phone 10.0.0.3 on one switch).
   Questions are answered from the learner's own log, so the expected value is always computed, never written here. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const ic=(e,type)=>e.packet.layers.some(l=>l.name==='ICMP'&&l.fields.type===type);
const arpReq=e=>e.packet.layers.some(l=>l.name==='ARP'&&l.fields.op==='request');
// the latest echo request / ARP request the terminal's device sent
const sentReq=c=>c.last(e=>e.dev===c.net.me&&e.dir==='tx'&&ic(e,'echo-request'));
const sentArp=c=>c.last(e=>e.dev===c.net.me&&e.dir==='tx'&&arpReq(e));
const pinged=c=>sentReq(c)?true:'Ping the phone first with <code>ping 10.0.0.3</code>, so there is an echo request to open.';
const isIp=v=>NQ.ip.parse(v)!==null;
/* the echo requests the latest ping put on the wire: ping numbers them from icmp_seq 1, so count from the last seq 1 */
const lastPingReqs=c=>{
  const s=c.entries.filter(e=>e.dev===c.net.me&&e.dir==='tx'&&ic(e,'echo-request'));
  let k=s.length-1;
  while(k>0&&s[k].packet.layers.find(l=>l.name==='ICMP').fields.seq!==1)k--;
  return s.slice(Math.max(k,0)).length;
};
const PING=[['ping','cmd'],['10.0.0.3','arg','who to ping']];
const PICK='In the packet panel next to the terminal, pick an entry marked <b>tx</b> (sent; <b>rx</b> means received) on <code>laptop</code> whose note says <b>echo request</b>.';

NQ.CH.push({name:'Layers and packets',badge:'Layer Peeler',
 intro:'Everything that crosses a network travels as a <b>packet</b>: a message wrapped in layers, like a letter inside an envelope inside a parcel. People describe the layers with two models. The <b>OSI model</b> has seven: physical, data link, network, transport, session, presentation and application. The <b>TCP/IP model</b> folds them into four: link, internet, transport and application. This simulator builds four kinds of layer you can open and read: <b>Ethernet</b> and <b>ARP</b> on the link layer, <b>IPv4</b> on the internet (network) layer, and <b>ICMP</b>, the small messages <code>ping</code> sends, which rides inside IPv4 and belongs to the same layer. It does not build the upper layers (like TCP or web pages), so you will not see them here. You are on a laptop at <code>10.0.0.2</code>, wired through a switch to a phone at <code>10.0.0.3</code>.',
 learned:['ping','ping -c','Ethernet','ARP','IPv4','ICMP','TTL','MAC address'],
 missions:[
 {title:'Send a ping',goal:'The phone sits on the same wire as your laptop, at <code>10.0.0.3</code>. Ping it with <code>ping 10.0.0.3</code> and watch the packets appear in the packet panel next to the terminal.',
  anat:PING,
  how:['<code>ping 10.0.0.3</code> asks the machine at <code>10.0.0.3</code> to answer, and prints one line for every answer that comes back.',
   '<code>ping</code> is the command. It sends a small <b>echo request</b> packet and waits for an <b>echo reply</b>, like calling "hello?" across a room and hearing "hello!" back.',
   '<code>10.0.0.3</code> is the argument: the phone\'s IP address, where the request should go.',
   'Each line starting <code>64 bytes from 10.0.0.3</code> is one reply that made it home. In the packet panel, the newest entry is that reply arriving at the laptop.'],
  explain:'Before the first request, the laptop calls out to everyone on the wire with an <b>ARP</b> question: who has <code>10.0.0.3</code>? The phone answers with its MAC address, and only then can the echo request go out. That is why ARP entries come first in the panel. A real <code>ping</code> keeps going until you press <kbd>Ctrl</kbd>+<kbd>C</kbd>; this one stops after four requests.',
  hint:'Type <code>ping 10.0.0.3</code> and press <kbd>Enter</kbd>.',
  scenario:'pair',answer:['ping 10.0.0.3'],
  check:c=>c.last(e=>e.dev===c.net.me&&e.dir==='rx'&&ic(e,'echo-reply'))?true:'No echo reply has reached the laptop yet. Ping the phone at <code>10.0.0.3</code>.'},
 {title:'Peel the layers',goal:'A packet is built from layers, outermost first. Ping the phone, open one of the laptop\'s <b>echo request</b> packets in the packet panel, and name the layers it is stacked from, from the outside in.',
  anat:PING,
  how:['<code>ping 10.0.0.3</code> sends echo requests to the phone again, so the packet panel has fresh packets to open.',
   PICK,
   'The panel lists the packet\'s layers from the outside in. The outer layer is the one every device reads first; each layer below it rides inside the one above.',
   'Type the layer names in that order, separated by spaces, commas or arrows.'],
  explain:'Wrapping one layer inside another is called <b>encapsulation</b>. Each device reads only the layers it needs: the switch looks at the outer header to pick a port and never opens the rest, while the phone unwraps layer after layer until it reaches the request itself.',
  hint:'Open an echo request in the packet panel and read the layer names from the top down. ARP is a separate packet, not part of this one.',
  scenario:'pair',answer:['ping 10.0.0.3'],check:pinged,
  question:{ask:'Which layers is the echo request built from, from the outside in?',expect:c=>NQ.pkt.layerNames(sentReq(c).packet).join(',')}},
 {title:'Time to live',goal:'Every IPv4 packet carries a <b>TTL</b> (time to live): a number each router lowers by one, so a lost packet cannot circle the network forever. Ping the phone, open an echo request in the packet panel, and find the TTL the laptop gave it.',
  anat:PING,
  how:['<code>ping 10.0.0.3</code> sends echo requests again, so you have one to inspect.',
   PICK,
   'Open its IPv4 layer and find the <code>ttl</code> field: the starting value the laptop chose.',
   'Type that number. The <code>ttl=</code> in the <code>ping</code> output belongs to the reply, which the phone sent, so read the request in the panel instead.'],
  explain:'No router sits between the laptop and the phone (a switch is not a router), so the TTL arrives unchanged. In later chapters you will watch it drop by one at every router, and see what happens when it runs out.',
  hint:'Open an echo request the laptop sent and look for <code>ttl</code> in its IPv4 layer.',
  scenario:'pair',answer:['ping 10.0.0.3'],check:pinged,
  question:{ask:'What TTL does the laptop put on its echo request?',expect:c=>String(sentReq(c).packet.layers.find(l=>l.name==='IPv4').fields.ttl)}},
 {title:'Who has this address?',goal:'To put a frame on the wire, the laptop needs the phone\'s <b>MAC address</b>: the hardware address of its network card. It asks for it with an <b>ARP request</b>. Ping the phone, open the laptop\'s ARP request in the packet panel, and find the frame\'s <b>destination MAC</b>. Who is it addressed to?',
  anat:PING,
  how:['<code>ping 10.0.0.3</code> makes the laptop look up the phone\'s MAC address first, so an ARP request appears in the packet panel before any echo request.',
   'In the packet panel, pick the entry the laptop sent (<b>tx</b> on <code>laptop</code>) whose note starts with <b>ARP request</b>.',
   'In its Ethernet layer, <code>src</code> is the sender\'s MAC and <code>dst</code> is the destination MAC. Copy <code>dst</code> exactly.',
   'Careful: the ARP layer inside has a <code>tha</code> field too. That is the MAC the laptop is asking about, still unknown, so it is not the answer.'],
  explain:'The laptop cannot address the frame to the phone, because it does not know the phone\'s MAC yet. So it uses a special MAC that means <b>everyone on this wire</b>: a <b>broadcast</b>. The switch copies a broadcast out of every other port, and only the machine that owns <code>10.0.0.3</code> answers. The laptop then remembers the answer, so the next <code>ping</code> needs no ARP at all.',
  hint:'Open the laptop\'s ARP request and read <code>dst</code> in the Ethernet layer, not a field of the ARP layer.',
  scenario:'pair',answer:['ping 10.0.0.3'],
  check:c=>sentArp(c)?true:'No ARP request yet. Ping the phone at <code>10.0.0.3</code>, and the laptop will ask for its MAC address first.',
  question:{ask:'What is the destination MAC of the ARP request?',expect:c=>sentArp(c).packet.layers[0].fields.dst}},
 {title:'Where the IP addresses live',goal:'An echo request names its sender and receiver twice: with MAC addresses for the hop across this wire, and with IP addresses for the whole journey. Ping the phone, open an echo request, and find the layer whose <code>src</code> and <code>dst</code> are IP addresses. What is that layer called?',
  anat:PING,
  how:['<code>ping 10.0.0.3</code> sends echo requests from <code>10.0.0.2</code> to <code>10.0.0.3</code>, and those two addresses must be written somewhere inside each packet.',
   PICK,
   'Look at each layer\'s <code>src</code> and <code>dst</code>. A MAC is six pairs of characters joined by colons; an IP address is four numbers joined by dots.',
   'Type the name of the layer that holds the IP addresses.'],
  explain:'The MAC addresses are rewritten at every router, because each hop is a new wire with new neighbours. The IP addresses normally stay the same from start to finish (NAT, which you will meet later, is the exception). Local delivery below, the end-to-end address above: that split is what layering buys.',
  hint:'Open an echo request and find the layer whose <code>src</code> is <code>10.0.0.2</code>.',
  scenario:'pair',answer:['ping 10.0.0.3'],check:pinged,
  question:{ask:'Which layer carries the IP addresses?',expect:c=>{const l=sentReq(c).packet.layers.find(x=>isIp(x.fields.src)&&isIp(x.fields.dst));return l?l.name:'';}}},
 {title:'Count the probes',goal:'On its own, <code>ping</code> sends request after request. The <code>-c</code> option sets how many. Ping the phone with a count of two or more, then read the statistics at the end of the output: how many echo requests did your command put on the wire?',
  anat:[['ping','cmd'],['-c','opt','count'],['N','arg','how many'],['10.0.0.3','arg','who to ping']],
  how:['<code>ping -c N 10.0.0.3</code> sends exactly <code>N</code> echo requests to the phone, where <code>N</code> is a count you pick, and then stops.',
   '<code>-c</code> is an option: <b>c</b>ount. It changes <code>ping</code> from "keep going" to "send this many".',
   '<code>N</code> stands for your number, so write a real one, like <code>-c 5</code>.',
   'The line <code>… packets transmitted, … received</code> at the end counts what went out and what came back. The packet panel shows the same requests one by one.'],
  explain:'In a real terminal, <code>ping</code> without <code>-c</code> runs until you stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd>, so <code>-c</code> is the polite way to send a few and get your prompt back. This practice <code>ping</code> treats any count above ten as ten.',
  hint:'Read the <code>packets transmitted</code> line at the end of your <code>ping</code> output, or count the echo requests the laptop sent in the packet panel.',
  scenario:'pair',answer:['ping -c 3 10.0.0.3'],
  check:c=>{
    const p=c.history.filter(h=>/^\s*ping(\s|$)/.test(h.line)).at(-1);
    if(!p)return 'Run <code>ping</code> with <code>-c</code> and a count, aimed at the phone at <code>10.0.0.3</code>.';
    if(!/(^|\s)-c/.test(p.line))return 'Add <code>-c</code> and a count to your <code>ping</code>, so you choose how many requests go out.';
    if(p.code!==0)return 'No replies came back. Aim your <code>ping</code> at the phone, <code>10.0.0.3</code>.';
    return lastPingReqs(c)>=2?true:'Pick a count of two or more, so there is something to count.';},
  question:{ask:'How many echo requests did your last <code>ping</code> send?',expect:c=>String(lastPingReqs(c))}}
 ]});
})();
