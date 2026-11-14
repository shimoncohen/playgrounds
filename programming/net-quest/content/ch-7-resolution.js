(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const WWW='www.example.test.';
const RES='192.168.1.53',ROOT='192.0.2.10',TLD='198.51.100.10',AUTH='203.0.113.10';
const dnsOf=e=>{const l=e.packet.layers.find(x=>x.name==='DNS');return l&&l.fields;};
const ipOf=(e,k)=>{const l=e.packet.layers.find(x=>x.name==='IPv4');return l&&l.fields[k];};
const got=e=>{const f=e.dev==='laptop'&&e.dir==='rx'&&dnsOf(e);return f&&f.qr===1?f:null;};
const ans=(f,type)=>NQ.dns.recs(f,'an').find(r=>r.type===type)||null;
const stripped=s=>String(s).replace(/\.$/,'');
// +short and +trace replies are skipped: the questions here are about the full output a learner read
const fullDig=(c,srv,pred)=>{
  for(let i=c.history.length-1;i>=0;i--){
    const h=c.history[i];
    if(h.code!==0||!/^\s*dig\s/.test(h.line)||/\+(short|trace)(\s|$)/.test(h.line))continue;
    const e=h.entries.find(x=>{const f=got(x);return f&&ipOf(x,'src')===srv&&f.qname===WWW&&f.qtype==='A'&&(!pred||pred(f));});
    if(e)return {f:dnsOf(e),h,i};
  }
  return null;
};
const viaResolver=f=>f.rd===1;
const qtime=h=>{const m=/Query time: (\d+) msec/.exec(h.out.join('\n'));return m?m[1]:'';};
const DIG=[['dig','cmd','look a name up']];
const WWW_ANAT=[...DIG,['www.example.test','arg','the name to look up']];
const at=(ip,label)=>[...DIG,['@'+ip,'arg',label],['www.example.test','arg','the name to look up']];

NQ.CH.push({name:'Resolvers and caches',badge:'Chart Room Key',
 story:'The Name Board only says where the chart room is, so you follow the name down the chain of servers, clear an old address and trace the whole route, to earn the Chart Room Key.',
 intro:'Last chapter the resolver always came back with an answer, and you never saw how. This chapter looks behind it. You will watch where a lookup starts, ask each server of the chain yourself, find out why the second lookup of a name is quicker than the first, see how long an old answer can linger, and clear one that has gone stale. At the end you follow a whole lookup with a single command.',
 learned:['recursive resolver','root server','dig @server','referral','rd and ra','TLD','glue','authoritative','DNS cache','dig +norecurse','DNS TTL','sleep','rndc flush','dig +trace'],
 missions:[
 {title:'Who does the legwork?',scenario:'dns',
  goal:'Your laptop sent one question and got one answer, but the resolver did more than it showed. A <b>recursive</b> resolver does the whole search for you: it asks other servers, one after another, until it has the answer, and hands you only the result. Nobody knows every name, so where does it start? At the top, with a <b>root server</b>: a server that knows which servers look after each last part of a name. Run <code>dig www.example.test</code>, then look in the packet panel at the entries on <code>resolver</code> marked sent (<code>tx</code>) whose note starts <code>DNS query</code>. Type the address of the server it asked first.',
  anat:WWW_ANAT,
  how:['<code>dig www.example.test</code> asks the resolver for an address, and the resolver then asks other servers before it answers; the packet panel records every question it sends.',
   'The command and the name are as before. What is new is where you look: the entries on <code>resolver</code> marked sent (<code>tx</code>) whose note starts <code>DNS query</code> are the resolver\'s own questions. The first one goes to the root server.',
   'Open that entry and read the IPv4 layer: <code>dst</code> is the address the question was sent to.',
   'Type that address as your answer.'],
  explain:'The laptop asked once, and the resolver asked several times. That is what recursive means: the work of searching is done by the resolver, so every device on the network can stay simple. The search always starts at a root server, because the root is the one place every resolver knows about before it has asked anything.',
  hint:'Run <code>dig www.example.test</code>, find the first <code>DNS query</code> entry sent by <code>resolver</code> and read <code>dst</code> in its IPv4 layer.',
  answer:['dig www.example.test'],
  check:c=>c.last(e=>{const f=got(e);return f&&f.qname===WWW&&f.qtype==='A';})?true:'Run <code>dig www.example.test</code> first and wait for the answer.',
  question:{ask:'Which address did the resolver send its first question to?',
   expect:c=>{const e=c.entries.find(x=>{const f=x.dev==='resolver'&&x.dir==='tx'&&dnsOf(x);return f&&f.qr===0;});return e?ipOf(e,'dst'):'';}}},
 {title:'Asking the root directly',scenario:'dns',
  goal:'Now do the resolver\'s first step yourself. Put <code>@</code> and an address right after <code>dig</code>, and <code>dig</code> asks that server instead of the resolver: <code>dig @192.0.2.10 www.example.test</code> asks the root server. The root does not hold the record for <code>www.example.test</code>, so it sends a <b>referral</b>: not an answer but a pointer, "I do not know, ask this server next". Look at the <code>AUTHORITY SECTION</code>: it holds an NS record naming the next server. Also look at the flags: <code>rd</code> means recursion desired, a request that the server do the whole search for you. Your laptop sets it on every question. A root server does not do that search, so <code>dig</code> prints a warning. Type the name of the next server.',
  anat:at(ROOT,'the server to ask instead of the resolver'),
  how:['<code>dig @192.0.2.10 www.example.test</code> asks the root server for the address of <code>www.example.test</code> and prints the referral it sends back.',
   '<code>dig</code> and the name are as before. <code>@192.0.2.10</code> is new: the server to ask, instead of the resolver. Leave out <code>+short</code>, because a referral has no answer line to print.',
   'In the reply, the <code>AUTHORITY SECTION</code> holds an NS record whose data is the name of the next server to ask. The <code>ADDITIONAL SECTION</code> holds that server\'s address. On the flags line, <code>rd</code> is there because your laptop asked for recursion, and the warning below says the root server does not offer it.',
   'Type the name from the NS record as your answer.'],
  explain:'A root server does not know every name. It only knows who looks after each last part of a name, and it passes the question on. A referral is how DNS shares the work: each server knows a little and points to the next. A server that refuses the search is not broken; it is doing the one job it has.',
  hint:'Run <code>dig @192.0.2.10 www.example.test</code> and read the data of the NS record under <code>AUTHORITY SECTION</code>.',
  answer:['dig @192.0.2.10 www.example.test'],
  check:c=>fullDig(c,ROOT)?true:'Run <code>dig @192.0.2.10 www.example.test</code> without <code>+short</code> and look at the <code>AUTHORITY SECTION</code>.',
  question:{ask:'What is the name of the server the root points you to?',
   expect:c=>{const d=fullDig(c,ROOT),r=d&&NQ.dns.recs(d.f,'ns').find(x=>x.type==='NS');return r?r.data:'';}}},
 {title:'The next server down',scenario:'dns',
  goal:'The root pointed to the server for the last part of the name, <code>test</code>. That is a <b>TLD</b> server, short for top-level domain: the server that looks after every name ending in one last part such as <code>test</code>. Its address was in the <code>ADDITIONAL SECTION</code> of the last reply, so ask it: <code>dig @198.51.100.10 www.example.test</code>. It does not hold the record either, so it sends another referral, to the server that looks after <code>example.test</code>. This time the reply also carries the address of that server in the <code>ADDITIONAL SECTION</code>. That record is called <b>glue</b>: the reply names the next server, and glue hands you its address too, so you do not have to look the name up first. Type that address.',
  anat:at(TLD,'the TLD server'),
  how:['<code>dig @198.51.100.10 www.example.test</code> asks the TLD server for the address of <code>www.example.test</code> and prints the referral it sends back.',
   'You know <code>dig</code>, the <code>@</code> server and the name. Only the server has changed: it is the one the root pointed to.',
   'The <code>AUTHORITY SECTION</code> holds an NS record naming the next server. Under <code>ADDITIONAL SECTION</code> is the glue: an A record giving that server\'s address.',
   'Type the glue\'s address as your answer.'],
  explain:'Glue solves a chicken-and-egg problem. The next server is named, but to find a server\'s address you would have to ask a server, and you cannot ask one until you have its address. So the server that points to it writes the address into the same reply. Without glue every referral would need a second lookup before the search could go on.',
  hint:'Run <code>dig @198.51.100.10 www.example.test</code> and read the address on the A record under <code>ADDITIONAL SECTION</code>.',
  answer:['dig @198.51.100.10 www.example.test'],
  check:c=>fullDig(c,TLD)?true:'Run <code>dig @198.51.100.10 www.example.test</code> without <code>+short</code> and look at the <code>ADDITIONAL SECTION</code>.',
  question:{ask:'Which address does the glue record give?',
   expect:c=>{const d=fullDig(c,TLD),r=d&&NQ.dns.recs(d.f,'ar').find(x=>x.type==='A');return r?r.data:'';}}},
 {title:'The server that owns the answer',scenario:'dns',
  goal:'The glue gave the address of the last server: <code>dig @203.0.113.10 www.example.test</code> asks it. This one is <b>authoritative</b> for <code>example.test</code>: it holds the records itself, instead of passing questions on or remembering what others said. So at last you get an answer, and the reply says so with a flag. Read the <code>flags:</code> line. You know <code>qr</code> (this is a reply) and <code>rd</code> (your request for a search). Two more matter here. <code>ra</code> means recursion available: your resolver\'s replies carry it, because it does the search, and this server\'s reply has none, because it only answers for what it owns. And one flag, whose two letters stand for authoritative answer, marks a reply from the owner. Type that flag.',
  anat:at(AUTH,'the authoritative server'),
  how:['<code>dig @203.0.113.10 www.example.test</code> asks the server that holds the records of <code>example.test</code> and prints its answer.',
   'The command, the <code>@</code> server and the name are as before. The server is the one the glue pointed to.',
   'This reply has an <code>ANSWER SECTION</code> with the address. The flags line shows which flags are set: compare it with the flags of <code>dig www.example.test</code>, the reply from your resolver, which has <code>ra</code> and no flag for an authoritative answer.',
   'Type the two-letter flag for an authoritative answer as your answer.'],
  explain:'Authoritative means the last word: this server is where the record is written down, so nobody has to check with anyone else. A resolver\'s reply passes along what it learned, which is why it has <code>ra</code> and the owner\'s flag is missing. When two answers disagree, the authoritative one is right.',
  hint:'Run <code>dig @203.0.113.10 www.example.test</code> and read the flags after <code>flags:</code>. One of them stands for authoritative answer.',
  answer:['dig @203.0.113.10 www.example.test'],
  check:c=>fullDig(c,AUTH,f=>f.ancount>0)?true:'Run <code>dig @203.0.113.10 www.example.test</code> without <code>+short</code> and read the flags of the reply.',
  question:{ask:'Which flag marks the reply as an authoritative answer?',
   expect:c=>{const d=fullDig(c,AUTH,f=>f.ancount>0);return d&&d.f.aa?'aa':'';}}},
 {title:'Asking twice',scenario:'dns',
  goal:'Every lookup so far made the resolver ask three servers. Does it do that every time? Run <code>dig www.example.test</code>, then run it again, and read <code>Query time</code> near the bottom of each reply: how long the answer took, in milliseconds (msec). The resolver keeps what it learns in a <b>DNS cache</b>: its memory of answers, so the next time somebody asks the same question it can answer at once without asking anyone. Type the second query time as a number.',
  anat:WWW_ANAT,
  how:['<code>dig www.example.test</code> twice asks the resolver the same question two times, so you can compare how long each answer took.',
   'You know the command and the name. What is new is the line <code>Query time</code> at the bottom of each reply, in msec.',
   'The first reply has a long query time: the resolver asked the root, the TLD and the authoritative server. Watch the packet panel too: see what the resolver sends the second time.',
   'Type the second query time as your answer, as a number.'],
  explain:'A cache trades a little memory for a lot of speed. Most questions are asked again and again, so the resolver pays for the long search once and answers every later question from memory. That also spares the servers above it: the root would be flooded if every lookup in the world started there.',
  hint:'Run <code>dig www.example.test</code> twice and read the number before <code>msec</code> in the second reply.',
  answer:['dig www.example.test','dig www.example.test'],
  check:c=>{
    const n=c.history.filter(h=>h.code===0&&/^\s*dig\s/.test(h.line)&&!/\+(short|trace)(\s|$)/.test(h.line)&&h.entries.some(e=>{const f=got(e);return f&&ipOf(e,'src')===RES&&f.qname===WWW&&f.qtype==='A';})).length;
    return n>=2?true:'Run <code>dig www.example.test</code> twice, without <code>+short</code>, and compare the two query times.';},
  question:{ask:'What query time does the second reply show, as a number?',
   expect:c=>{const d=fullDig(c,RES,viaResolver);return d?qtime(d.h):'';},
   accept:()=>['zero']}},
 {title:'Peeking at the memory',scenario:'dns',
  goal:'Can you see what the resolver remembers without making it search? Add the option <code>+norecurse</code>: <code>dig +norecurse www.example.test</code> sends the question without <code>rd</code>, so the resolver may only answer from its own memory and must not go and ask anyone. On a fresh resolver it has nothing to say, so it points you at where to start asking, as a referral. Run it once to see that, then run <code>dig www.example.test</code> normally to make it learn the answer, then run <code>dig +norecurse www.example.test</code> again. Type the address the last reply gives.',
  anat:[...DIG,['+norecurse','opt','do not ask the resolver to search'],['www.example.test','arg','the name to look up']],
  how:['<code>dig +norecurse www.example.test</code> asks the resolver only what it already remembers, and prints the answer or a pointer to where to ask.',
   '<code>dig</code> and the name are as before. <code>+norecurse</code> is the option that turns off <code>rd</code>, so the resolver does no searching.',
   'The first time the reply has no answer: the resolver remembers nothing yet. After the normal <code>dig www.example.test</code> it remembers the answer, and the same peek now shows it, with no questions sent upstream.',
   'Type the address from the last reply as your answer.'],
  explain:'A peek proves what the memory holds without changing it. It is how an administrator checks whether a resolver already knows a name. If the peek finds nothing, the resolver will have to go and search when somebody asks for real.',
  hint:'Run <code>dig +norecurse www.example.test</code>, then <code>dig www.example.test</code>, then <code>dig +norecurse www.example.test</code> again, and read the address on the answer line.',
  answer:['dig +norecurse www.example.test','dig www.example.test','dig +norecurse www.example.test'],
  check:c=>{
    if(fullDig(c,RES,f=>f.rd===0&&f.ancount>0))return true;
    return fullDig(c,RES,f=>f.rd===0)?'The resolver remembers nothing yet, so it only points you at where to start. Ask it normally with <code>dig www.example.test</code>, then peek again with <code>dig +norecurse www.example.test</code>.':'Run <code>dig +norecurse www.example.test</code>: the option goes right after <code>dig</code>.';},
  question:{ask:'Which address does the peek give once the resolver remembers the answer?',
   expect:c=>{const d=fullDig(c,RES,f=>f.rd===0&&f.ancount>0),r=d&&ans(d.f,'A');return r?r.data:'';}}},
 {title:'Answers do not last forever',scenario:'dns',setup:[{dev:'laptop',cmd:'dig www.example.test'}],
  goal:'A resolver that remembered every answer forever would never notice when a name moves to a new address. So each record carries a time limit, the number of seconds you read in chapter 6. For the resolver\'s memory that limit is the <b>DNS TTL</b>, short for time to live. Do not mix it up with the TTL of a packet from chapter 1: that one counts routers, this one counts seconds. The resolver counts the DNS TTL down while it holds the answer, and throws the answer away when it runs out. A moment ago the laptop looked up <code>www.example.test</code>, so the resolver already remembers it. Run <code>sleep 120</code> to let two minutes pass, then run <code>dig www.example.test</code> and read the number on the answer line. The practice shell skips the wait: <code>sleep</code> moves the clock on at once. Type that number.',
  anat:[['sleep','cmd','let some seconds pass'],['120','arg','how many seconds']],
  how:['<code>sleep 120</code> lets two minutes pass, and <code>dig www.example.test</code> then shows what is left of the time limit on the resolver\'s copy of the answer.',
   '<code>sleep</code> is the command and <code>120</code> is how many seconds to wait. A real <code>sleep</code> really waits; here it only moves the clock on, so you do not have to.',
   '<code>dig www.example.test</code> is as before. The number on the answer line is no longer the one you read the first time: it has been counting down since the resolver learned the answer.',
   'Type the number on the answer line as your answer.'],
  explain:'The countdown is how a resolver stays fresh without asking all the time. While the time is left, it answers from memory; when it runs out, the next question goes upstream again and learns whatever is true by then. If you sleep longer than the whole limit, the next answer starts from the full number again, because it is a new copy.',
  hint:'Run <code>sleep 120</code>, then <code>dig www.example.test</code> (without <code>+short</code>) and read the number on the answer line.',
  answer:['sleep 120','dig www.example.test'],
  check:c=>{
    const s=c.history.findLastIndex(h=>h.code===0&&/^\s*sleep\s/.test(h.line)),d=fullDig(c,RES,viaResolver);
    if(s<0)return 'Let some time pass first: run <code>sleep 120</code>, then <code>dig www.example.test</code>.';
    if(!d||d.i<s)return 'Now ask again: run <code>dig www.example.test</code>, without <code>+short</code>, after the sleep.';
    const top=ans(c.dig('laptop',WWW,'A',{server:AUTH}).msg,'A');
    return top&&ans(d.f,'A').ttl<top.ttl?true:'The answer shows its full time again: so much time passed that the resolver\'s copy ran out and it asked afresh. Try a shorter <code>sleep</code>, such as <code>sleep 120</code>, and ask once more.';},
  question:{ask:'What time limit does the answer line show now?',
   expect:c=>{const d=fullDig(c,RES,viaResolver),r=d&&ans(d.f,'A');return r?String(r.ttl):'';}}},
 {title:'The stale address',scenario:'dns-stale',dev:'resolver',
  goal:'Wren has moved her notes: the owner of <code>example.test</code> gave <code>www.example.test</code> a new address. Yet the laptop still gets the old one, <code>198.18.0.99</code>, because the resolver remembers its old answer and has an hour of its time limit left. This terminal runs <b>on <code>resolver</code></b> (look at the prompt). Make the resolver forget with <code>rndc flush</code>: <code>rndc</code> controls a name server, and <code>flush</code> tells it to empty its memory. The next question then has to go to the owner. If you want to see what the owner says first, <code>dig @203.0.113.10 www.example.test</code> asks it.',
  anat:[['rndc','cmd','control the name server'],['flush','arg','forget everything it remembers']],
  how:['<code>rndc flush</code> tells the resolver to forget every answer it remembers, so the next lookup of any name goes to the servers that own it.',
   '<code>rndc</code> is the command that controls a name server, and it only exists on a machine that runs one: that is why this terminal is on <code>resolver</code>. <code>flush</code> says what to do: empty the memory.',
   'It prints nothing when it works. You cannot see the old answer from here; the laptop would be the one to notice it, and the game checks what the laptop would be told.',
   'Run <code>rndc flush</code>. The mission is done when the laptop would get the owner\'s answer.'],
  explain:'Waiting is the other cure: the old answer disappears when its time limit runs out, which here would take an hour. Flushing is the quick fix after a change, for example when you move a website and want everyone to see it now. It costs a little speed, because every name has to be looked up again, one search at a time.',
  hint:'This terminal runs on <code>resolver</code>. Type <code>rndc flush</code>.',
  answer:['rndc flush'],
  check:c=>{
    const now=ans(c.dig('laptop',WWW,'A').msg||{},'A'),owner=ans(c.dig('laptop',WWW,'A',{server:AUTH}).msg||{},'A');
    return now&&owner&&now.data===owner.data?true:'The laptop would still be told the old address, because the resolver still remembers it. Make it forget with <code>rndc flush</code>.';}},
 {title:'The whole chain in one go',scenario:'dns',
  goal:'You have now asked the root, the TLD server and the authoritative server one by one. <code>dig +trace www.example.test</code> does all of it with one command: <code>+trace</code> makes <code>dig</code> do the resolver\'s job itself, starting at the root and following each referral down until a server answers, and it prints what each server said. Run it and read the lines that start <code>;; Received</code>: each one ends with the name of the server that sent that part of the reply. Type the name of the last server it asked.',
  anat:[...DIG,['+trace','opt','follow the whole chain'],['www.example.test','arg','the name to look up']],
  how:['<code>dig +trace www.example.test</code> follows the lookup from the root down to the owner and prints the reply of every server on the way.',
   '<code>dig</code> and the name are as before. <code>+trace</code> is the option that asks for the whole chain instead of one answer.',
   'Each block ends with a <code>;; Received</code> line. It says how many bytes came back, the address and name of the server that sent them, and how long it took.',
   'The last block holds the answer itself. Type the name in brackets on its <code>;; Received</code> line as your answer.'],
  explain:'This is the whole chapter in one command: a root server that refers, a TLD server that refers with glue and an authoritative server that answers. It is also the tool to reach for when a name misbehaves: the first server in the chain that says something wrong is where to look.',
  hint:'Type <code>dig +trace www.example.test</code> and read the name in brackets on the last <code>;; Received</code> line.',
  answer:['dig +trace www.example.test'],
  check:c=>c.history.some(h=>h.code===0&&/^\s*dig\s(.*\s)?\+trace(\s|$)/.test(h.line)&&/;; Received/.test(h.out.join('\n')))?true:'Run <code>dig +trace www.example.test</code>: the option goes right after <code>dig</code>.',
  question:{ask:'What is the name of the last server the trace asked?',
   expect:c=>{const h=c.history.findLast(x=>x.code===0&&/\+trace(\s|$)/.test(x.line)),m=h&&[...h.out.join('\n').matchAll(/;; Received \d+ bytes from \S+#53\((\S+)\)/g)].at(-1);return m?stripped(m[1]):'';}}}
 ]});
})();
