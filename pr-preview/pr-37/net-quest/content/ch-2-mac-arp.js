/* Network Quest chapter 2: MAC and ARP, on the pair network (laptop 10.0.0.2, phone 10.0.0.3, one switch) and, for the
   switch mission, the office network. Chapter 1 already covered reading your own MAC (mission 7), the broadcast MAC
   (mission 4) and arping + ip neigh (mission 8), so this chapter edits the neighbour list and looks at the switch.
   Checks read outcomes (the neighbour list, a probe ping, the switch's MAC table); questions are computed, never written here. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const ic=(e,type)=>e.packet.layers.some(l=>l.name==='ICMP'&&l.fields.type===type);
const arpReq=e=>e.packet.layers.some(l=>l.name==='ARP'&&l.fields.op==='request');
const isPing=l=>/^\s*ping(\s|$)/.test(l);
const NEIGH_DEL=/^\s*ip\s+(neigh|neighbor|n)\s+(del|delete)\s+10\.0\.0\.3(\s|$)/;
// did the terminal's device put a packet matching pred on the wire during this command?
const sent=(c,h,pred)=>(h.entries||[]).some(e=>e.dev===c.net.me&&e.dir==='tx'&&pred(e));
const asked=(c,h)=>sent(c,h,arpReq);
// the ping commands (with their position in the history) that put an echo request on the wire
const pingRuns=c=>c.history.map((h,i)=>({h,i})).filter(r=>isPing(r.h.line)&&sent(c,r.h,e=>ic(e,'echo-request')));
const NEIGH_ADD=/^\s*ip\s+(neigh|neighbor|n)\s+add\s+10\.0\.0\.3(\s|$)/;
const PHONE='10.0.0.3',WRONG='02:00:00:00:00:99';
const phoneMac=c=>c.net.devices.phone.ifaces.eth0.mac;
const switchOf=c=>Object.values(c.net.devices).find(d=>d.kind==='switch');
const keeper=c=>Object.values(c.net.devices).filter(d=>d.kind==='switch'&&Object.keys(d.macTable).length).map(d=>d.id)[0]||''; // the switch that has learned a MAC
const PING1=[['ping','cmd'],['-c','opt','count'],['1','arg','how many'],[PHONE,'arg','who to ping']];

NQ.CH.push({name:'MAC and ARP',badge:'Neighbourhood Watch',
 intro:'Last chapter the laptop learned the phone\'s <b>MAC address</b> with ARP and kept it in a list, the one <code>ip neigh</code> prints. This chapter is about that list and about the switch in the middle. You will see the laptop ask once and then remember, make it forget on purpose, write an entry by hand (and break the network with a bad one), and find out which device in the middle keeps a table of MACs of its own.',
 learned:['ip neigh del','ip neigh add','PERMANENT','MAC table','flooding'],
 missions:[
 {title:'Ask once, remember',goal:'The first time the laptop talks to the phone it asks for the phone\'s MAC address with an ARP request, and then it remembers the answer in its neighbour list (the list <code>ip neigh</code> prints). Run <code>ping -c 1 10.0.0.3</code>, look in the packet panel for the ARP request, then run the very same line a second time and see whether the laptop asks again.',
  anat:PING1,
  how:['<code>ping -c 1 10.0.0.3</code>, run twice, sends one echo request each time, but only the first run starts with an ARP request: after that the laptop remembers the phone\'s MAC.',
   '<code>ping -c 1 10.0.0.3</code> is the line to run both times. <code>-c 1</code> sends a single echo request, so each run adds only a few rows to the packet panel.',
   'After the first run, find a row marked <b>tx</b> on <code>laptop</code> whose note starts with <b>ARP request</b>: the laptop asking who has <code>10.0.0.3</code>.',
   'After the second run, the newest rows start straight with the echo request. The laptop already knew the answer, so there is no new ARP request. <code>ip neigh</code> shows the entry it kept.'],
  explain:'The phone learned something too: the ARP request carried the laptop\'s own MAC, so the phone wrote it down at the same moment. Both sides remember, which keeps a conversation to one question. Real computers forget an entry after a while, and then the question gets asked again.',
  hint:'Run <code>ping -c 1 10.0.0.3</code>, then run it again, and compare the packet panel after each run.',
  scenario:'pair',answer:['ping -c 1 10.0.0.3','ping -c 1 10.0.0.3'],
  check:c=>{
    const runs=pingRuns(c);
    if(!runs.length)return 'Ping the phone with <code>ping -c 1 10.0.0.3</code>, then run the same line again.';
    if(runs.length<2)return 'Run the same <code>ping</code> a second time and compare it with the first.';
    const last=runs.at(-1);
    if(!runs.slice(0,-1).some(r=>asked(c,r.h)))return 'No ping had to ask, because the laptop already knew the phone. Use "Reset scenario" and ping the phone first.';
    if(last.h.code!==0)return 'Your latest ping got no reply. Aim it at the phone, <code>10.0.0.3</code>.';
    return asked(c,last.h)?'Your latest ping started with another ARP request. Run it once more now that the laptop remembers.':true;}},
 {title:'Forget and ask again',goal:'An entry in the neighbour list is only a memory, and you can wipe one. Ping the phone so the laptop has an entry, make it forget with <code>ip neigh del 10.0.0.3 dev eth0</code>, then <code>ping</code> the phone again and watch the ARP request come back.',
  anat:[['ip','cmd','network settings tool'],['neigh','arg','the remembered MACs'],['del','arg','forget one entry'],[PHONE,'arg','which entry'],['dev','arg','device'],['eth0','arg','the laptop\'s card']],
  how:['<code>ip neigh del 10.0.0.3 dev eth0</code> removes the laptop\'s remembered MAC for <code>10.0.0.3</code>, so the next <code>ping</code> has to ask for it again.',
   '<code>ip</code> is the command and <code>neigh</code> is the argument you know: the list of remembered MACs. <code>del</code> is short for delete: remove one entry from that list.',
   '<code>10.0.0.3</code> picks the entry to remove, by IP address. <code>dev eth0</code> says which network card the entry belongs to: <code>dev</code> is short for device, and <code>eth0</code> is the laptop\'s card.',
   'Run it in this order: <code>ping -c 1 10.0.0.3</code> to fill the list, <code>ip neigh del 10.0.0.3 dev eth0</code> to empty it, <code>ping -c 1 10.0.0.3</code> to ask again. If <code>del</code> says "No such file", there was no entry yet, so <code>ping</code> first.'],
  explain:'Deleting an entry does not break anything: the laptop forgot only the MAC, not the phone, and the next ARP request fetches a fresh answer. It is the first thing to try when a machine seems to be sending frames to the wrong card.',
  hint:'Ping the phone, run <code>ip neigh del 10.0.0.3 dev eth0</code>, then <code>ping</code> the phone again and look for an ARP request.',
  scenario:'pair',answer:['ping -c 1 10.0.0.3','ip neigh del 10.0.0.3 dev eth0','ping -c 1 10.0.0.3'],
  check:c=>{
    const dels=c.history.map((h,i)=>({h,i})).filter(r=>r.h.code===0&&NEIGH_DEL.test(r.h.line));
    if(!dels.length)return 'Make the laptop forget the phone with <code>ip neigh del 10.0.0.3 dev eth0</code>. Ping the phone first, so there is an entry to delete.';
    const after=pingRuns(c).filter(r=>r.h.code===0&&dels.some(d=>d.i<r.i));
    if(!after.length)return 'Now ping the phone again, <code>ping -c 1 10.0.0.3</code>, and see whether the laptop has to ask.';
    return after.some(r=>asked(c,r.h))?true:'That ping needed no ARP request, so the laptop still knew the phone. Delete the entry again, then ping.';}},
 {title:'A wrong entry',goal:'You can also write an entry by hand with <code>ip neigh add</code>. A hand-written entry is <b>static</b>: it stays until you delete it, and the laptop trusts it without asking. That is handy, and dangerous when it is wrong. Tell the laptop that the phone lives at a MAC no card owns, with <code>ip neigh add 10.0.0.3 lladdr 02:00:00:00:00:99 dev eth0</code>, then <code>ping</code> the phone and watch nothing come back.',
  anat:[['ip','cmd','network settings tool'],['neigh','arg','the remembered MACs'],['add','arg','write an entry by hand'],[PHONE,'arg','the phone\'s IP address'],['lladdr','arg','the MAC to store'],[WRONG,'arg','a made-up MAC'],['dev','arg','device'],['eth0','arg','the laptop\'s card']],
  how:['<code>ip neigh add 10.0.0.3 lladdr 02:00:00:00:00:99 dev eth0</code> tells the laptop that <code>10.0.0.3</code> lives at MAC <code>02:00:00:00:00:99</code>. No card has that MAC, so every frame for the phone goes to nobody.',
   '<code>add</code> writes an entry by hand, where <code>del</code> removed one. <code>lladdr</code> (link-layer address, another name for the MAC) is followed by the MAC to store. <code>10.0.0.3</code> and <code>dev eth0</code> mean what they meant in the last mission.',
   'Then run <code>ping 10.0.0.3</code>. The echo request leaves addressed to the made-up MAC, the switch has never seen that MAC, and the phone ignores a frame that is not addressed to it. No reply comes back, and the statistics line at the end shows it.',
   'Run <code>ip neigh</code> too: your entry ends in <code>PERMANENT</code>, the word <code>ip neigh</code> uses for a static entry. Permanent means ARP answers cannot overwrite it.'],
  explain:'The laptop never sent an ARP request, so nothing could correct the mistake: a static entry beats a real ARP answer. People who run networks use static entries for machines that matter, so nobody can pretend to be them, and the price is exactly this failure when an entry is wrong. The next mission is a repair job.',
  hint:'Type <code>ip neigh add 10.0.0.3 lladdr 02:00:00:00:00:99 dev eth0</code>, then <code>ping 10.0.0.3</code> and read the statistics at the end.',
  scenario:'pair',answer:['ip neigh add 10.0.0.3 lladdr 02:00:00:00:00:99 dev eth0','ping 10.0.0.3'],expectFail:['ping 10.0.0.3'],
  check:c=>{
    const lap=c.net.devices[c.net.me],mac=lap.neigh[PHONE];
    if(!mac||!(lap.permanent||[]).includes(PHONE))return 'Write the entry by hand with <code>ip neigh add</code>, for the phone\'s address <code>10.0.0.3</code>.';
    if(mac===phoneMac(c))return 'That is the phone\'s real MAC, so pings still work. Store a MAC no card owns, like <code>02:00:00:00:00:99</code>.';
    if(c.ping(c.net.me,PHONE).delivered)return 'That MAC still reaches the phone. Store a MAC no card owns, like <code>02:00:00:00:00:99</code>.';
    const add=c.history.map((h,i)=>({h,i})).filter(r=>r.h.code===0&&NEIGH_ADD.test(r.h.line)).at(-1);
    return add&&pingRuns(c).some(r=>r.i>add.i)?true:'The entry is in. Now ping the phone, <code>ping 10.0.0.3</code>, and watch nothing come back.';},
  question:{ask:'Ping the phone now. What packet loss does the last line of the statistics report?',expect:c=>{const m=/(\d+)% packet loss/.exec(c.net.clone().exec('ping '+PHONE).out.join('\n'));return m?m[1]+'%':'';},accept:()=>['100','100 percent','100 %','100% packet loss','100 percent packet loss']}},
 {title:'Repair the entry',goal:'Someone left a hand-written entry on the laptop, and now the phone at <code>10.0.0.3</code> does not answer. Find out what is wrong and fix it, so that <code>ping 10.0.0.3</code> works again. Two tools help: <code>ip neigh</code> shows what the laptop believes, and <code>arping 10.0.0.3</code> asks the phone itself.',
  anat:[['ip','cmd','network settings tool'],['neigh','arg','what the laptop remembers'],['arping','cmd','ask the phone itself'],[PHONE,'arg','who to ask about']],
  how:['<code>ip neigh</code>, then <code>arping 10.0.0.3</code>, then a fix, then <code>ping 10.0.0.3</code>: compare what the laptop remembers with the MAC the phone really answers with, repair the entry, and prove it with a <code>ping</code>.',
   '<code>ip neigh</code> lists the laptop\'s memory. The entry for <code>10.0.0.3</code> is marked <code>PERMANENT</code>, so the laptop trusts it without asking.',
   '<code>arping 10.0.0.3</code> asks the phone directly and prints the MAC that really answers. If it differs from the <code>lladdr</code> in the list, the list is wrong.',
   'Fix it one of two ways. <code>ip neigh del 10.0.0.3 dev eth0</code> removes the bad entry so ARP can fill in the right one. Or <code>ip neigh add 10.0.0.3 lladdr MAC dev eth0</code> writes it again, where <code>MAC</code> stands for the real address <code>arping</code> printed.',
   'Finish with <code>ping 10.0.0.3</code> and watch the replies come back.'],
  explain:'The <code>arping</code> answer did not fix the list by itself: the laptop heard the right MAC and ignored it, because a hand-written entry wins over what ARP learns. Deleting the entry hands the job back to ARP, which is why it is the usual repair. A hand-written entry is a promise you must keep up to date.',
  hint:'Compare the <code>lladdr</code> in <code>ip neigh</code> with the MAC <code>arping 10.0.0.3</code> prints, then delete or rewrite the entry.',
  scenario:'pair',setup:[{dev:'laptop',cmd:'ip neigh add 10.0.0.3 lladdr '+WRONG+' dev eth0'}],
  answer:['ip neigh del 10.0.0.3 dev eth0','ping -c 1 10.0.0.3'],
  check:c=>{
    const mac=c.net.devices[c.net.me].neigh[PHONE];
    if(mac&&mac!==phoneMac(c))return 'The laptop still remembers a MAC the phone does not have. Compare <code>ip neigh</code> with what <code>arping 10.0.0.3</code> prints, then delete or rewrite the entry.';
    return c.ping(c.net.me,PHONE).delivered?true:'The laptop still cannot reach the phone. Look at what it remembers with <code>ip neigh</code>, and ask the phone itself with <code>arping 10.0.0.3</code>.';}},
 {title:'What the switch learns',scenario:'office',
  goal:'This is a bigger wire: the laptop, a printer and a router all plug into one switch. The switch has no terminal and no IP address, but it keeps a table of its own. Every frame that arrives teaches it which <b>port</b> (a socket on the switch) the sender\'s MAC is behind, so it can send later frames out of one port instead of all of them. Ping the printer with <code>ping -c 1 192.168.1.20</code>, then use the packet panel to work out which device keeps that table.',
  anat:[['ping','cmd'],['-c','opt','count'],['1','arg','how many'],['192.168.1.20','arg','the printer']],
  how:['<code>ping -c 1 192.168.1.20</code> makes the laptop ask for the printer\'s MAC and then send the echo request, so the switch has frames to learn from and then to use.',
   'Look at the device name in each row of the packet panel: every row is named after the device that logged it. The ARP request is a broadcast, so the switch copies it out of every other port (the note says <b>flooded: broadcast</b>). The router hears it too and ignores it.',
   'Later frames are different. The switch has heard both the laptop and the printer by then, so the echo request goes out of one port only (the note says <b>forwarded out</b> and a port name).',
   'Only a device that remembers where each MAC lives can do that. Its list of MAC and port pairs is called a <b>MAC table</b>. Type the name of the device that keeps it, exactly as the packet panel shows it in its rows.'],
  explain:'A switch learns by listening: the laptop\'s ARP request taught it which port the laptop is behind, and the printer\'s ARP reply taught it the printer\'s. When it has no row for a destination MAC, it falls back to <b>flooding</b>: copying the frame out of every other port, as it does with a broadcast. That is slower but always works. A switch never reads IP addresses, only MACs and ports.',
  hint:'Open the rows whose note says <b>flooded</b> or <b>forwarded out</b>, and read the device name in each row.',
  answer:['ping -c 1 192.168.1.20'],
  check:c=>{
    const sw=switchOf(c),lap=c.net.devices[c.net.me],mac=lap.ifaces.eth0.mac;
    const at=re=>c.last(e=>e.dev===sw.id&&re.test(e.verdict));
    if(!at(/^flooded: broadcast/))return 'Ping the printer with <code>ping -c 1 192.168.1.20</code>, so the switch sees the laptop\'s ARP request.';
    if(!at(/^forwarded out/)||!sw.macTable[mac])return 'The switch has not seen enough yet. Ping the printer, <code>ping -c 1 192.168.1.20</code>, and let the answer come back.';
    return true;},
  question:{ask:'Which device keeps the MAC table?',expect:c=>keeper(c),
   accept:c=>{const k=keeper(c);return k?['the '+k,k.replace(/(\D)(\d)/,'$1 $2'),'"'+k+'"','\''+k+'\'','`'+k+'`']:[];}}}
 ]});
})();
