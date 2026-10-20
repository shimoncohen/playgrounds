/* Network Quest extras: ranks, quick-fire and field guide. Plain data, loaded after the chapters. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};

/* [xp, title]: 10 XP a mission, about 30 missions in the full course */
NQ.RANKS=[[0,'Packet Rookie'],[50,'ARP Detective'],[110,'Subnet Scout'],[170,'Gateway Keeper'],[230,'NAT Navigator'],[280,'Packet Whisperer']];

/* c: the question, a: the answer, w: three wrong answers, why: shown after a miss */
NQ.QF=[
 {c:'How many layers does the OSI model have?',a:'7',w:['4','5','3'],why:'OSI names seven layers. The TCP/IP model folds them into four: link, internet, transport and application.'},
 {c:'What is wrapping one layer inside another called?',a:'encapsulation',w:['routing','broadcasting','resolution'],why:'Each layer wraps the one inside it with its own header, like a letter inside an envelope inside a parcel.'},
 {c:'A packet crosses two routers on its way. Which of its addresses are rewritten at each hop?',a:'the MAC addresses',w:['the IP addresses','both','neither'],why:'Each hop is a new wire, so the Ethernet header gets new MACs. The IP addresses name the two ends and stay the same.'},
 {c:'A packet leaves with TTL 10 and crosses two routers. What TTL does it arrive with?',a:'8',w:['10','12','9'],why:'Every router lowers the TTL by one: 10, then 9, then 8. A switch does not count.'},
 {c:'What does ARP find out?',a:'the MAC address that goes with an IP address',w:['the IP address that goes with a name','the route to another network','how long a packet may live'],why:'ARP asks "who has this IP address?" and the owner answers with its MAC.'},
 {c:'A switch receives a broadcast frame. Where does it send it?',a:'out of every other port',w:['back where it came from','only to the router','nowhere until ARP answers'],why:'A broadcast is for everyone on the wire, so the switch copies it out of every port except the one it came in on.'}
];

/* ch: chapter index, c: the topic, what: one line, syn: anatomy tokens, ex: [command, what to look at] pairs */
NQ.GUIDE=[
 {ch:0,c:'layers: OSI and TCP/IP',what:'OSI names seven layers, TCP/IP four. This simulator builds Ethernet and ARP (link layer), and IPv4 with ICMP inside it (internet layer).',syn:[['ping','cmd'],['10.0.0.3','arg','who to ping']],ex:[['ping -c 1 10.0.0.3','open any entry in the packet panel to see its layers']]},
 {ch:0,c:'encapsulation',what:'Each layer wraps the one inside it with its own header. A device reads only the layers it needs.',syn:[['ping','cmd'],['-c','opt','count'],['1','arg','how many']],ex:[['ping -c 1 10.0.0.3','the packet panel lists each packet\'s layers, outermost first']]},
 {ch:0,c:'MAC address',what:'The hardware address of a network card, six pairs like 02:00:00:00:00:01. It only matters on one wire.',syn:[['ip','cmd'],['link','arg','show the network cards']],ex:[['ip link','link/ether is the laptop\'s MAC']]},
 {ch:0,c:'ARP',what:'Asks everyone on the wire "who has this IP address?". The owner answers with its MAC, and the asker remembers it.',syn:[['arping','cmd'],['10.0.0.3','arg','who to ask about']],ex:[['arping 10.0.0.3','the phone answers with its MAC'],['ip neigh','the MACs the laptop has learned']]}
];
})();
