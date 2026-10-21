/* Network Quest chapter 3: IP addressing. Missions 1 and 2 run the terminal on the phone (m.dev), 3 and 6 on the laptop,
   4 on the router `home` (the only scenario with a public address) and 5 on the printer. Checks read outcomes: the devices'
   addresses, probe pings both ways and a scan for two devices on one address. Questions are computed, never written here.
   Authors of duplicate-address setups: the engine answers ARP for a shared IP from every owner and a cache keeps the LAST
   reply's MAC, so a clash gives no stable symptom from one device's ping; teach it with arping and ip link instead. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const IPX=NQ.ip;
const bare=ip=>ip?ip.split('/')[0]:null;
const addrOf=(c,d)=>bare(c.net.devices[d].ifaces.eth0.ip);
// every address two or more interfaces hold
const dups=c=>{const seen={},out=[];for(const d of Object.values(c.net.devices))for(const i of Object.values(d.ifaces)){const a=bare(i.ip);if(a){if(seen[a]&&!out.includes(a))out.push(a);seen[a]=true;}}return out;};
// ipcalc runs the learner made (one argument, exit 0), with the prefix typed
const calcs=c=>c.history.filter(h=>h.code===0&&/^\s*ipcalc\s+\S+\/\d+\s*$/.test(h.line)).map(h=>({line:h.line,prefix:+/\/(\d+)\s*$/.exec(h.line)[1]}));
const ran=(c,p)=>calcs(c).some(r=>r.prefix===p);
// the Hosts/Net number ipcalc printed for the latest run with that prefix (re-run on a clone), or null
const hosts=(c,p)=>{const r=calcs(c).filter(x=>x.prefix===p).at(-1);if(!r)return null;const m=/Hosts\/Net:\s+(\d+)/.exec(c.net.clone().exec(r.line).out.join('\n'));return m?+m[1]:null;};
const SHOW_ADDR=/^\s*ip\s+(a|addr|address)(\s+show)?(\s+(dev\s+)?\w+)?\s*$/;
// the pair network: laptop 10.0.0.2/24 and the phone, which must end up with an address on the laptop's wire
const phoneUp=(c,miss,off,stuck)=>{
  const p=addrOf(c,'phone');
  if(!p)return miss;
  if(dups(c).length)return 'Another device already has that address. Give the phone one nobody uses, on the laptop\'s wire: it starts <code>10.0.0.</code> and ends <code>/24</code>.';
  if(!c.ping('phone',addrOf(c,'laptop')).delivered)return stuck;
  return c.ping('laptop',p).delivered?true:off;
};
const SET=(ip)=>[{dev:'phone',cmd:'ip addr del 10.0.0.3/24 dev eth0'},...(ip?[{dev:'phone',cmd:'ip addr add '+ip+' dev eth0'}]:[])];
const IP_ADDR=[['ip','cmd','network settings tool'],['addr','arg','the addresses']];

NQ.CH.push({name:'IP addressing',badge:'Address Keeper',
 intro:'A MAC address only matters on one wire. The <b>IP address</b> is the name you use for a device from anywhere, so a network is only as healthy as its addresses. This chapter is about giving devices addresses and mending them when they go wrong. You will hand the phone its address back, repair a typo, count how many devices fit on a network with a small calculator, sort addresses into the kinds the internet uses, and catch two devices fighting over one address.',
 learned:['ip addr add','ip addr del','prefix','subnet','mask','ipcalc','usable hosts','private address','public address','duplicate address','/31 and /32'],
 missions:[
 {title:'Give the phone an address',scenario:'pair',dev:'phone',setup:SET(),
  goal:'An <b>IP address</b> is the number other devices use to find a device, like a house number on a street. The phone has lost its address, so the laptop cannot find it. This terminal now runs <b>on the phone</b> (look at the prompt). Give it its old address back with <code>ip addr add 10.0.0.3/24 dev eth0</code>, then check with <code>ping -c 1 10.0.0.2</code> that it can reach the laptop.',
  anat:[...IP_ADDR,['add','arg','give a card an address'],['10.0.0.3/24','arg','address, slash, prefix'],['dev','arg','device'],['eth0','arg','the phone\'s card']],
  how:['<code>ip addr add 10.0.0.3/24 dev eth0</code> gives the phone\'s network card the address <code>10.0.0.3</code>, so other devices can find it again.',
   '<code>ip</code> is the command you know from <code>ip link</code> and <code>ip neigh</code>. <code>addr</code> says you are working with addresses (<code>ip addr</code> on its own lists them), and <code>add</code> puts one on a card. <code>dev eth0</code> names the card (<code>dev</code> is short for device); the phone has just one.',
   'The <code>/24</code> after the address is the <b>prefix</b>. It says which part of the address names the wire (the first three numbers, <code>10.0.0</code>) and which part names the device. Devices that share a wire and a prefix form a <b>subnet</b>. The laptop is <code>10.0.0.2/24</code>, so the phone must use <code>/24</code> and start with <code>10.0.0</code> too.',
   '<code>ping -c 1 10.0.0.2</code> checks the work: the phone asks the laptop to answer, and a reply proves the phone can both send and receive. <code>ip addr</code> shows the address you added on its <code>inet</code> line.'],
  explain:'Before, <code>ip addr</code> on the phone showed a card and its MAC but no <code>inet</code> line: the card existed, but there was nothing to find it by. A MAC only works on one wire, while the IP address is what you type to say who you mean. Any free address starting <code>10.0.0.</code> with <code>/24</code> would have worked, as long as nobody else uses it (a later mission shows why).',
  hint:'Type <code>ip addr add 10.0.0.3/24 dev eth0</code> and press <kbd>Enter</kbd>, then <code>ping -c 1 10.0.0.2</code>.',
  answer:['ip addr add 10.0.0.3/24 dev eth0','ping -c 1 10.0.0.2'],
  check:c=>phoneUp(c,'The phone still has no address. Add one with <code>ip addr add 10.0.0.3/24 dev eth0</code>.',
    'The laptop cannot reach the phone at that address. Give it one that starts <code>10.0.0.</code> and ends <code>/24</code>, like the laptop\'s.',
    'The phone cannot reach the laptop with that address. Give it one that starts <code>10.0.0.</code> and ends <code>/24</code>, like the laptop\'s.')},
 {title:'A typo in the mask',scenario:'pair',dev:'phone',setup:[...SET('10.0.0.200/25')],
  goal:'Someone gave the phone an address, but a typo crept into the number after the slash, and now the phone and the laptop cannot talk. That number is the prefix, also called the <b>mask</b>: it is how a device decides which addresses sit on its own wire. This terminal runs on the phone. Run <code>ip addr</code> to read what it was given, compare it with the laptop\'s <code>10.0.0.2/24</code>, and repair it so that <code>ping -c 1 10.0.0.2</code> works.',
  anat:[...IP_ADDR,['del','arg','remove an address'],['10.0.0.200/25','arg','address, wrong prefix'],['add','arg','give a card an address'],['dev','arg','device'],['eth0','arg','the phone\'s card']],
  how:['<code>ip addr del 10.0.0.200/25 dev eth0</code> followed by <code>ip addr add 10.0.0.200/24 dev eth0</code> swaps the phone\'s address for the same one with the right prefix.',
   '<code>del</code> is short for delete: it removes an address from a card, and you must name it exactly as <code>ip addr</code> shows it, prefix included. <code>ip addr add</code> refuses to put a second address on a card, which is why the old one has to go first.',
   'The prefix was the wrong part. <code>/25</code> told the phone that only <code>10.0.0.128</code> to <code>10.0.0.255</code> are on its wire, so it believed the laptop at <code>10.0.0.2</code> was out of reach and did not even try. <code>/24</code> covers every address that starts <code>10.0.0.</code>. A mask is the same prefix written as four numbers (<code>/24</code> is <code>255.255.255.0</code>); the next mission shows both.',
   'Finish with <code>ping -c 1 10.0.0.2</code> and watch the reply come back.'],
  explain:'The phone had no way to send an answer back: a device talks straight to the addresses inside its own subnet, and one wrong digit in the prefix moved the laptop outside it. Prefix typos are among the most common address mistakes, and <code>ip addr</code> is the first place to look.',
  hint:'Read the prefix on the phone with <code>ip addr</code>, delete that address with <code>ip addr del</code>, then add it again with <code>/24</code>.',
  answer:['ip addr del 10.0.0.200/25 dev eth0','ip addr add 10.0.0.200/24 dev eth0','ping -c 1 10.0.0.2'],
  check:c=>phoneUp(c,'The phone has no address at all now. Finish the swap with <code>ip addr add</code>, then ping the laptop.',
    'The laptop still cannot reach the phone. Compare the number after the slash on the phone (<code>ip addr</code>) with the laptop\'s <code>/24</code>.',
    'The phone still cannot reach the laptop. Compare the number after the slash on the phone (<code>ip addr</code>) with the laptop\'s <code>/24</code>.')},
 {title:'How many hosts fit?',scenario:'pair',
  goal:'A subnet is a fixed block of addresses, and its size comes from the prefix. A <b>host</b> is any device with an address, such as the laptop, the phone or a printer. The block\'s first address is the name of the subnet and its last is the <b>broadcast address</b> (a message sent to it reaches everyone), so neither can go to a host. Run <code>ipcalc 10.0.0.0/26</code> to see a subnet worked out, then type how many usable hosts fit in a <code>/26</code> subnet.',
  anat:[['ipcalc','cmd','subnet calculator'],['10.0.0.0/26','arg','address, slash, prefix']],
  how:['<code>ipcalc 10.0.0.0/26</code> works out the details of a subnet from one address and prefix: where it starts, where it ends and how many hosts fit. It changes nothing on the network.',
   '<code>ipcalc</code> is the command and <code>10.0.0.0/26</code> is its argument: an address, a slash and the prefix. Any address inside the subnet gives the same answer.',
   'In the output, <code>Netmask</code> is the mask (the prefix as four numbers), <code>Network</code> is the subnet\'s own name, <code>Broadcast</code> is its last address, and <code>HostMin</code> and <code>HostMax</code> are the first and last addresses a host can use.',
   '<code>Hosts/Net</code> counts the addresses from <code>HostMin</code> to <code>HostMax</code>. Type that number as your answer.'],
  explain:'An address is built from 32 binary digits, called <b>bits</b>. The prefix says how many of them name the subnet, and the rest are left for hosts: a <code>/26</code> keeps six bits, so the block holds two to the power of six addresses, and taking away the subnet\'s name and the broadcast address leaves the usable hosts. Each extra bit in the prefix halves the block, so a bigger number after the slash means a smaller subnet.',
  hint:'Run <code>ipcalc 10.0.0.0/26</code> and read its <code>Hosts/Net</code> line.',
  answer:['ipcalc 10.0.0.0/26'],
  check:c=>ran(c,26)?true:'Run <code>ipcalc</code> on a <code>/26</code> subnet first, for example <code>ipcalc 10.0.0.0/26</code>.',
  question:{ask:'How many usable hosts fit in a <code>/26</code> subnet?',expect:()=>{const k=IPX.cidr('10.0.0.0/26');return String(k.bcast-k.net-1);}}},
 {title:'Private or public?',scenario:'home',dev:'home',
  goal:'Some addresses are <b>private</b>: they are reserved for use inside homes and offices, so countless networks can each have their own <code>192.168.1.10</code> without clashing. Private addresses start with <code>10.</code> or <code>192.168.</code>, or lie between <code>172.16.</code> and <code>172.31.</code>. Every other address is <b>public</b>: it is unique in the whole world, which is what lets the internet find it. This terminal runs on <code>home</code>, a router that joins a house to the internet. Run <code>ip addr</code> and name the one address on it that is public.',
  anat:IP_ADDR,
  how:['<code>ip addr</code> lists the network cards of <code>home</code> and the address on each, which is all you need to sort them into private and public.',
   '<code>ip addr</code> is the same listing you met at the start of this chapter. Look at the <code>inet</code> lines: each one is an address, a slash and a prefix. A router has one card for each network it joins, so <code>home</code> has two.',
   'Read each address against the rules in the goal: does it start with <code>10.</code> or <code>192.168.</code>, or lie between <code>172.16.</code> and <code>172.31.</code>? Then it is private. Anything else is public.',
   'Type the public address as your answer, with or without its prefix.'],
  explain:'The address on the house side, <code>192.168.1.1</code>, is private: thousands of homes use that very number, so it cannot identify one machine for the whole internet. The other address is public, and it is the only one the rest of the world can find. A few other ranges are special too (<code>127.0.0.1</code> always means this machine itself), but these are the ones you will meet most.',
  hint:'Run <code>ip addr</code> and check each address against the three private ranges in the goal.',
  answer:['ip addr'],
  check:c=>c.history.some(h=>h.code===0&&SHOW_ADDR.test(h.line))?true:'Run <code>ip addr</code> on <code>home</code> to see its addresses first.',
  question:{ask:'Which address on <code>home</code> is public?',
   expect:c=>Object.values(c.net.devices.home.ifaces).map(i=>i.ip).filter(ip=>{const n=ip&&IPX.parse(bare(ip));return n!==null&&n!==undefined&&!IPX.isPrivate(n)&&IPX.isPublic(n);}).map(bare)[0]||'',
   accept:c=>Object.values(c.net.devices.home.ifaces).map(i=>i.ip).filter(ip=>ip&&!IPX.isPrivate(IPX.parse(bare(ip)))&&IPX.isPublic(IPX.parse(bare(ip))))}},
 {title:'Two devices, one address',scenario:'office',dev:'printer',
  setup:[{dev:'printer',cmd:'ip addr del 192.168.1.20/24 dev eth0'},{dev:'printer',cmd:'ip addr add 192.168.1.10/24 dev eth0'}],
  goal:'Every address must belong to exactly one device on a wire. Someone typed the laptop\'s address, <code>192.168.1.10</code>, into the printer, so two devices now claim it: a <b>duplicate address</b>. This terminal runs on the printer. Ask who answers for that address with <code>arping -c 1 192.168.1.10</code>, compare the reply with the printer\'s own MAC from <code>ip link</code>, then move the printer to a free address on the same wire and check that it still reaches the router at <code>192.168.1.1</code>.',
  anat:[['arping','cmd','ask who owns an address'],['-c','opt','count'],['1','arg','how many'],['192.168.1.10','arg','the shared address']],
  how:['<code>arping -c 1 192.168.1.10</code> asks the wire who owns <code>192.168.1.10</code>, which is how you catch a duplicate address in the act. Then <code>ip addr del</code> and <code>ip addr add</code> move the printer to an address of its own.',
   'The printer asking about its own address should get no reply at all. If a reply comes back from a MAC that differs from the one <code>ip link</code> shows for the printer, another device is using the address.',
   'Fix it with the two commands from the last missions: <code>ip addr del</code> removes the shared address from the printer, and <code>ip addr add</code> gives it a new one. Choose an address nobody uses and keep <code>/24</code>: <code>192.168.1.1</code> is the router and <code>192.168.1.10</code> the laptop.',
   'Finish with <code>ping -c 1 192.168.1.1</code>. The router is another device on this wire, so a reply shows the printer is back on the network.'],
  explain:'Two devices on one address confuse everyone who asks for it: each ARP request is answered twice, and the asker keeps one of the answers, so traffic meant for one device can end up at the other. In real networks that shows up as connections that work, then fail, then work again. The cure is always the same: give one of the two an address nobody else has.',
  hint:'Compare the MAC in the <code>arping</code> reply with the printer\'s own from <code>ip link</code>, then use <code>ip addr del</code> and <code>ip addr add</code> to give the printer a different address.',
  answer:['ip addr del 192.168.1.10/24 dev eth0','ip addr add 192.168.1.20/24 dev eth0','ping -c 1 192.168.1.1'],
  check:c=>{
    const p=addrOf(c,'printer');
    if(!p)return 'The printer has no address now. Add one that nobody uses with <code>ip addr add</code>.';
    if(dups(c).length)return 'Two devices still share an address. Give the printer one nobody uses (the router has <code>192.168.1.1</code>, the laptop <code>192.168.1.10</code>).';
    if(!c.ping('printer',addrOf(c,'laptop')).delivered)return 'The printer cannot reach the laptop. Keep it on the same wire: an address starting <code>192.168.1.</code> and ending <code>/24</code>.';
    return c.ping('laptop',p).delivered?true:'The laptop cannot reach the printer at its new address. Keep it on the same wire: an address starting <code>192.168.1.</code> and ending <code>/24</code>.';}},
 {title:'Tiny subnets',scenario:'pair',
  goal:'When you used <code>ipcalc</code> on a <code>/26</code>, two addresses were lost to the subnet\'s name and the broadcast address. Two special prefixes bend that rule. A <code>/31</code> subnet holds only two addresses, which would leave none after losing two, and a <code>/32</code> holds exactly one. Run <code>ipcalc 10.0.0.0/31</code> and <code>ipcalc 10.0.0.1/32</code>, then add up the two <code>Hosts/Net</code> numbers.',
  anat:[['ipcalc','cmd','subnet calculator'],['10.0.0.0/31','arg','a subnet of two addresses'],['10.0.0.1/32','arg','a subnet of one address']],
  how:['<code>ipcalc 10.0.0.0/31</code> and <code>ipcalc 10.0.0.1/32</code> show how the smallest subnets count their hosts, so you can compare them with the rule you used for the <code>/26</code>.',
   '<code>ipcalc</code> is the same calculator as before, and each argument is an address, a slash and a prefix. Run it twice, once for each prefix.',
   'Read <code>Hosts/Net</code> in each output. A <code>/31</code> is made for a cable that joins exactly two machines, such as two routers, so it keeps both of its addresses for them. A <code>/32</code> is one address for one machine, a way to name a single device on its own, so nothing is lost there either.',
   'Add the two numbers together and type the total.'],
  explain:'Normally a subnet loses its first and last address. A cable with two ends has no use for a subnet name or a broadcast address, so on a <code>/31</code> both addresses go to machines. A <code>/32</code> is a subnet of one, used when a single device needs a name of its own with no neighbours.',
  hint:'Run <code>ipcalc 10.0.0.0/31</code>, then <code>ipcalc 10.0.0.1/32</code>, read both <code>Hosts/Net</code> lines and add the numbers.',
  answer:['ipcalc 10.0.0.0/31','ipcalc 10.0.0.1/32'],
  check:c=>ran(c,31)&&ran(c,32)?true:'Run <code>ipcalc</code> once with a <code>/31</code> and once with a <code>/32</code>, for example <code>ipcalc 10.0.0.0/31</code> and <code>ipcalc 10.0.0.1/32</code>.',
  question:{ask:'What do the two <code>Hosts/Net</code> numbers add up to?',expect:c=>{const a=hosts(c,31),b=hosts(c,32);return a===null||b===null?'':String(a+b);}}}
 ]});
})();
