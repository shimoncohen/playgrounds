/* Network Quest chapter 1: layers and packets, on the pair network (laptop 10.0.0.2 and phone 10.0.0.3 on one switch).
   Questions are answered from the learner's own log, so the expected value is always computed, never written here. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const ic=(e,type)=>e.packet.layers.some(l=>l.name==='ICMP'&&l.fields.type===type);
const arpReq=e=>e.packet.layers.some(l=>l.name==='ARP'&&l.fields.op==='request');
// the echo requests the terminal's device put on the wire during the latest ping command (a traceroute never counts)
const pingReqs=c=>{const p=c.lastPing();return p?(p.entries||[]).filter(e=>e.dev===c.net.me&&e.dir==='tx'&&ic(e,'echo-request')):[];};
const sentReq=c=>pingReqs(c).at(-1)||null;
// the latest ARP request the terminal's device sent (ping or arping, either one asks)
const sentArp=c=>c.last(e=>e.dev===c.net.me&&e.dir==='tx'&&arpReq(e));
const pinged=c=>sentReq(c)?true:'Ping the phone with <code>ping 10.0.0.3</code>, so there is an echo request from your latest <code>ping</code> to open.';
const isIp=v=>NQ.ip.parse(v)!==null;
const PING=[['ping','cmd'],['10.0.0.3','arg','who to ping']];
const PICK='In the packet panel, pick an entry marked <b>tx</b> (sent; <b>rx</b> means received) on <code>laptop</code> whose note says <b>echo request</b>.';

NQ.CH.push({name:'Layers and packets',badge:'Layer Peeler',
 intro:'Everything that crosses a network travels as a <b>packet</b>: a small message wrapped in layers, like a letter inside an envelope. Each layer starts with a <b>header</b>, a labelled front part that says who the packet is from and where it goes. Every machine on the network has an <b>IP address</b>, four numbers joined by dots, so packets know where to go. You are on a laptop at <code>10.0.0.2</code>. It is wired to a phone at <code>10.0.0.3</code> through a <b>switch</b>, a box with a row of sockets called <b>ports</b> that passes packets between the machines plugged into it. You type short instructions called <b>commands</b> in the <b>terminal</b>, and the packets they cause appear in the <b>packet panel</b>. The layers get their names as you open them, one mission at a time.',
 learned:['ping','ping -c','Ethernet','ARP','IPv4','ICMP','TTL','MAC address','ip link','arping','ip neigh'],
 missions:[
 {title:'Send a ping',goal:'A <b>command</b> is a short instruction you type in the terminal and run with <kbd>Enter</kbd>. The phone is plugged into the same switch as your laptop, at <code>10.0.0.3</code>. Ping it with <code>ping 10.0.0.3</code>, then look at the packet panel: one row for every packet your laptop sent or received.',
  anat:PING,
  how:['<code>ping 10.0.0.3</code> asks the machine at <code>10.0.0.3</code> to answer, and prints one line for every answer that comes back.',
   '<code>ping</code> is the command. It sends a small <b>echo request</b> (a <b>packet</b>, one message sent over the network) and waits for an <b>echo reply</b>, like calling "hello?" across a room and hearing "hello!" back.',
   '<code>10.0.0.3</code> is the argument, the thing the command works on: the phone\'s IP address, where the request should go.',
   'Each line starting <code>64 bytes from 10.0.0.3</code> is one reply that made it home. In the packet panel, <b>tx</b> marks a packet your laptop sent and <b>rx</b> one it received, so the last row, marked <b>rx</b>, is that reply arriving.'],
  explain:'You may see a couple of rows before the echo request. Those are the laptop calling out to everyone on the switch to ask who owns <code>10.0.0.3</code>, and the phone answering. It is called ARP, and mission 4 opens one up so you can read it. A real <code>ping</code> keeps going until you press <kbd>Ctrl</kbd>+<kbd>C</kbd>; this one stops after four requests.',
  hint:'Type <code>ping 10.0.0.3</code> and press <kbd>Enter</kbd>.',
  scenario:'pair',answer:['ping 10.0.0.3'],
  check:c=>c.last(e=>e.dev===c.net.me&&e.dir==='rx'&&ic(e,'echo-reply'))?true:'No echo reply has reached the laptop yet. Ping the phone at <code>10.0.0.3</code>.'},
 {title:'Peel the layers',goal:'A packet is built from layers, outermost first. Ping the phone, click one of the laptop\'s <b>echo request</b> packets in the packet panel to open it, and name the layers it is stacked from, from the outside in.',
  anat:PING,
  how:['<code>ping 10.0.0.3</code> sends echo requests to the phone again, so the packet panel has fresh packets to open.',
   PICK,
   'The panel lists the packet\'s layers from the outside in. The outer layer is the one every device reads first; each layer below it rides inside the one above.',
   'Type the layer names in that order, separated by spaces, commas or arrows.'],
  explain:'Wrapping one layer inside another is called <b>encapsulation</b>. Each device reads only the layers it needs: the switch reads the outer header to pick which port to send it out of, and never opens the rest, while the phone unwraps layer after layer until it reaches the request itself. People describe the layers with two models: <b>OSI</b> has seven, and <b>TCP/IP</b> folds them into four. This simulator builds the ones you just read: <b>Ethernet</b> moves a packet across one wire, <b>IPv4</b> carries the addresses for the whole trip, and <b>ICMP</b>, the small messages <code>ping</code> sends, rides inside IPv4.',
  hint:'Open an echo request in the packet panel and read the layer names from the top down. ARP is a separate packet, not part of this one.',
  scenario:'pair',answer:['ping 10.0.0.3'],check:pinged,
  question:{ask:'Which layers is the echo request built from, from the outside in?',expect:c=>NQ.pkt.layerNames(sentReq(c).packet).join(','),accept:()=>['ethernet,ip,icmp']}},
 {title:'Time to live',goal:'Every IPv4 packet carries a <b>TTL</b> (time to live): a number each <b>router</b> (a device that passes packets from one network to another) lowers by one, so a lost packet cannot circle the network forever. Ping the phone, open an echo request in the packet panel, and find the TTL the laptop gave it.',
  anat:PING,
  how:['<code>ping 10.0.0.3</code> sends echo requests again, so you have one to inspect.',
   PICK,
   'Open its IPv4 layer and find the <code>ttl</code> field (a labelled slot in a layer): the starting value the laptop chose.',
   'Type that number. The <code>ttl=</code> in the <code>ping</code> output belongs to the reply, which the phone sent, so read the request in the panel instead.'],
  explain:'No router sits between the laptop and the phone (a switch is not a router), so the TTL arrives unchanged. In later chapters you will watch it drop by one at every router, and see what happens when it runs out.',
  hint:'Open an echo request the laptop sent and look for <code>ttl</code> in its IPv4 layer.',
  scenario:'pair',answer:['ping 10.0.0.3'],check:pinged,
  question:{ask:'What TTL does the laptop put on its echo request?',expect:c=>String(sentReq(c).packet.layers.find(l=>l.name==='IPv4').fields.ttl)}},
 {title:'Who has this address?',goal:'To put a <b>frame</b> on the wire (a packet wrapped for one trip across the local network), the laptop needs the phone\'s <b>MAC address</b>: the hardware address of its network card. It asks for it with an <b>ARP request</b>, a question sent to everyone on the wire: who has this IP address? A MAC is six pairs of characters joined by colons, like <code>0a:1b:2c:3d:4e:5f</code>. Ping the phone, open the laptop\'s ARP request in the packet panel, and find the frame\'s <b>destination MAC</b>, the address the frame is sent to. Copy that MAC exactly.',
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
 {title:'Where the IP addresses live',goal:'An echo request names its sender and receiver twice: with MAC addresses for the step across this wire, and with IP addresses for the whole journey. Ping the phone, open an echo request, and find the layer whose <code>src</code> and <code>dst</code> are IP addresses. What is that layer called?',
  anat:PING,
  how:['<code>ping 10.0.0.3</code> sends echo requests from <code>10.0.0.2</code> to <code>10.0.0.3</code>, and those two addresses must be written somewhere inside each packet.',
   PICK,
   'Look at each layer\'s <code>src</code> and <code>dst</code>. A MAC is six pairs of characters joined by colons; an IP address is four numbers joined by dots.',
   'Type the name of the layer that holds the IP addresses.'],
  explain:'Here the whole trip is one wire, so both pairs of addresses name the same two machines. On bigger networks (a later chapter) the MAC addresses change on every wire the packet crosses, while the IP addresses normally stay the same from start to finish. Local delivery below, the end-to-end address above: that split is what layering buys.',
  hint:'Open an echo request and find the layer whose <code>src</code> is <code>10.0.0.2</code>.',
  scenario:'pair',answer:['ping 10.0.0.3'],check:pinged,
  question:{ask:'Which layer carries the IP addresses?',expect:c=>{const l=sentReq(c).packet.layers.find(x=>isIp(x.fields.src)&&isIp(x.fields.dst));return l?l.name:'';},accept:()=>['ip','ipv4']}},
 {title:'Count the requests',goal:'A real <code>ping</code> keeps going until you stop it; this one stops after four requests. The <code>-c</code> option sets how many. Ping the phone with a count of two or more, then read the statistics at the end of the output: how many echo requests did your command put on the wire?',
  anat:[['ping','cmd'],['-c','opt','count'],['N','arg','how many'],['10.0.0.3','arg','who to ping']],
  how:['<code>ping -c N 10.0.0.3</code> sends exactly <code>N</code> echo requests to the phone, where <code>N</code> is a count you pick, and then stops.',
   '<code>-c</code> is an option, a setting that changes how the command behaves: <b>c</b>ount. It turns <code>ping</code> from "keep going" to "send this many".',
   '<code>N</code> stands for your number, so write a real one, like <code>-c 5</code>.',
   'The line <code>… packets transmitted, … received</code> at the end counts what went out and what came back. The packet panel shows the same requests one by one.'],
  explain:'In a real terminal you stop an endless <code>ping</code> with <kbd>Ctrl</kbd>+<kbd>C</kbd>, so <code>-c</code> is the polite way to send a few and get your prompt back. This practice <code>ping</code> treats any count above ten as ten.',
  hint:'Read the <code>packets transmitted</code> line at the end of your <code>ping</code> output, or count the echo requests the laptop sent in the packet panel.',
  scenario:'pair',answer:['ping -c 3 10.0.0.3'],
  check:c=>{
    const p=c.lastPing();
    if(!p)return 'Run <code>ping</code> with <code>-c</code> and a count, aimed at the phone at <code>10.0.0.3</code>.';
    if(!/(^|\s)-c/.test(p.line))return 'Add <code>-c</code> and a count to your <code>ping</code>, so you choose how many requests go out.';
    if(p.code!==0)return 'No replies came back. Aim your <code>ping</code> at the phone, <code>10.0.0.3</code>.';
    const n=pingReqs(c).length;
    if(!n)return 'That <code>ping</code> put nothing on the wire: a machine answers its own address by itself. Aim it at the phone, <code>10.0.0.3</code>.';
    return n>=2?true:'Pick a count of two or more, so there is something to count.';},
  question:{ask:'How many echo requests did your last <code>ping</code> send?',expect:c=>String(pingReqs(c).length)}},
 {title:'Your own card',goal:'Your laptop reaches the switch through a network card, and every card has a <b>MAC address</b> stamped on it. List the laptop\'s network cards with <code>ip link</code>, then read the MAC address of its card.',
  anat:[['ip','cmd','network settings tool'],['link','arg','show the network cards']],
  how:['<code>ip link</code> prints one entry for each network card the laptop has, with that card\'s MAC address.',
   '<code>ip</code> is the command: a tool for looking at and changing a computer\'s network settings.',
   '<code>link</code> is the argument that picks what to look at: the network cards (the links), not the addresses or routes.',
   'The first line names the card, <code>eth0</code>. The line under it starts with <code>link/ether</code>, and the six pairs after it are the card\'s MAC address, written like <code>0a:1b:2c:3d:4e:5f</code>.',
   'Ignore <code>brd</code> at the end of that line: it is the broadcast address from mission 4, the same on every card.'],
  explain:'A MAC address is stamped on the card at the factory, so it travels with the card. An IP address is different: whoever sets up the network hands it out. The switch and the other machines on this wire use the MAC to deliver a frame to the right card. The phone has its own card with its own MAC, and in the next mission the laptop learns it.',
  hint:'Type <code>ip link</code> and read the address after <code>link/ether</code>.',
  scenario:'pair',answer:['ip link'],
  check:c=>c.history.some(h=>h.code===0&&/^\s*ip\s+(link|l|addr|address|a)(\s|$)/.test(h.line))?true:'Run <code>ip link</code> to list the laptop\'s network cards.',
  question:{ask:'What is the MAC address of the laptop\'s card?',expect:c=>Object.values(c.net.devices[c.net.me].ifaces)[0].mac}},
 {title:'Who do I remember?',goal:'Once the laptop has asked for a MAC address, it remembers the answer in a small list so it need not ask again. Ask on purpose with <code>arping 10.0.0.3</code>, then read the laptop\'s list with <code>ip neigh</code>. Which MAC address does it now remember for the phone?',
  anat:[['arping','cmd','first command'],['10.0.0.3','arg','who to ask about'],['ip','cmd','second command'],['neigh','arg','the remembered MACs']],
  how:['<code>arping 10.0.0.3</code> asks the ARP question for <code>10.0.0.3</code> and prints the MAC that answers, then <code>ip neigh</code> lists the machines the laptop now remembers, each with its MAC.',
   '<code>arping</code> is the command: like <code>ping</code>, but it sends only the ARP question and never an echo request. <code>10.0.0.3</code> is the argument, the address to ask about.',
   '<code>ip</code> is the command from the last mission. <code>neigh</code> (short for neighbours) is its argument: show the machines on this wire that the laptop knows.',
   'Run them in this order, ask first and read second. The line <code>10.0.0.3 dev eth0 lladdr …</code> shows the phone\'s MAC after <code>lladdr</code> (link-layer address, another name for the MAC).'],
  explain:'This list is why the second <code>ping</code> in a row sends no ARP question: the laptop already knows the answer. A fresh laptop remembers nothing, so <code>ip neigh</code> is empty until something makes it ask. Real computers forget entries after a while, so the question gets asked again now and then.',
  hint:'Run <code>arping 10.0.0.3</code> first, then <code>ip neigh</code>, and read the address after <code>lladdr</code>.',
  scenario:'pair',answer:['arping 10.0.0.3','ip neigh'],
  check:c=>{
    const h=c.history,a=h.findIndex(x=>x.code===0&&/^\s*arping\b.*\b10\.0\.0\.3\s*$/.test(x.line));
    if(a<0)return 'Ask for the phone\'s MAC with <code>arping 10.0.0.3</code> first.';
    return h.some((x,i)=>i>a&&x.code===0&&/^\s*ip\s+(neigh|neighbor|n)(\s|$)/.test(x.line))?true:'Now list what the laptop remembers with <code>ip neigh</code>.';},
  question:{ask:'Which MAC address does the laptop remember for <code>10.0.0.3</code>?',expect:c=>c.net.devices[c.net.me].neigh['10.0.0.3']||''}}
 ]});
})();
