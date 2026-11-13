/* Network Quest mission model: the check context and the mission runner. Chapters (content/ch-*.js) push into NQ.CH in
   order; a mission's key is '<chapter>.<mission>', so shipped missions are never reordered. Plain data and small
   functions, loaded after the engine. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
NQ.CH=NQ.CH||[];
NQ.XP=10; // per mission
NQ.KINDS={cmd:'command',opt:'option',arg:'argument',op:'operator'}; // anatomy chip kinds and their default labels
/* answers compare as lowercase words: spaces, commas, semicolons, pipes, slashes, arrows, = and - all separate, and a
   word's trailing . ! ? is dropped, so "Ethernet → IPv4 → ICMP", "ethernet ipv4 icmp" and "Ethernet, IPv4, ICMP." are
   equal. Dots and colons inside a word stay, so addresses and MACs compare exactly. */
NQ.norm=s=>String(s??'').toLowerCase().split(/[\s,;|\/>→=-]+/).map(w=>w.replace(/[.!?]+$/,'')).filter(Boolean).join(',');
NQ.PING=/^\s*ping(\s|$)/;
// the verifying ping must hit the host the mission names: a nearby host such as the gateway answers as soon as the fix is in
NQ.pingTo=ip=>new RegExp('^\\s*ping\\s(.*\\s)?'+ip.replace(/\./g,'\\.')+'\\s*$');
NQ.ASK='Now type your answer in the box under the question.'; // runMission's "check passed, waiting for the answer"
/* the check context. history: [{line, code, entries}] the learner ran, entries being the log slice that line added
   (net.exec's r.entries); answered: their answer to the question, or null. lastPing() is the
   latest history item whose command is ping, or null. ping runs on a probe copy, so a check's probe never changes the
   learner's ARP caches, NAT table or log. */
NQ.makeCtx=(net,history,answered)=>({
  net,history:history||[],answered:answered??null,entries:net.log,
  ping:(from,ip)=>{const r=NQ.sim.ping(net.probe(),from,ip);return {delivered:r.delivered,reason:r.reason,replyFrom:r.replyFrom,hops:r.hops};},
  route:(dev,ip)=>NQ.sim.route(net.devices[dev],ip),
  addr:dev=>Object.fromEntries(Object.entries(net.devices[dev].ifaces).map(([k,i])=>[k,i.ip])),
  last:pred=>{for(let i=net.log.length-1;i>=0;i--)if(pred(net.log[i]))return net.log[i];return null;},
  layers:e=>NQ.pkt.layerNames(e.packet),
  lastPing:()=>(history||[]).filter(h=>NQ.PING.test(h.line)).at(-1)||null,
  // exit-0 lines only, matched in order as a subsequence: other lines may sit between
  inOrder:(...res)=>{let i=0;for(const h of history||[])if(i<res.length&&h.code===0&&res[i].test(h.line))i++;return i===res.length;}
});
/* a session is one go at a mission: a fresh network of the mission's own (m.scenario, m.setup), the lines run on its
   terminal device (m.dev, else the scenario's own) and what they did. run(line) is net.exec plus the history, check(answered)
   is the mission's check. The UI keeps one session per mission start and reset, so a check costs what the check costs,
   never a replay of every line typed so far; runMission builds the same thing from a list of lines. A question is asked
   only once the check passes; question.accept(ctx) may list more accepted answers. check returns true, NQ.ASK (passed,
   answer still to type) or a friendly one-sentence hint. The network must start fresh each time: on a warm ARP cache,
   chapter 1's ping sends no ARP request at all.
   The UI checks a mission only after a command that exits 0, or when an answer is submitted, so a mission's reference
   answer must end on a line that exits 0 (tests/net/content.test.mjs 'every reference line succeeds' enforces it for
   every line of the answer; a mission whose point is a failing command, like a ping that gets no reply, lists that line in
   m.expectFail, and the test then requires it to exit 1; the UI shows the question once the check passes, whatever the exit code). */
/* the commands a mission's learner has met by then: those no mission answer uses, plus those first used by this mission or
   an earlier one (an unknown mission, such as a test's copy, sees every command). help lists only these. */
const known=m=>{
  const flat=NQ.CH.flatMap(c=>c.missions),at=flat.indexOf(m);
  if(at<0)return null;
  const later=new Set(),used=new Set();
  flat.forEach((x,i)=>[...x.answer,...(x.expectFail||[])].forEach(l=>{const w=l.trim().split(/\s+/)[0];if(!used.has(w)){used.add(w);if(i>at)later.add(w);}}));
  return new Set(Object.keys(NQ.CMDS).filter(n=>!later.has(n)));
};
NQ.session=m=>{
  const net=NQ.createNet(m.scenario,m.setup),history=[];
  Object.defineProperty(net,'known',{value:known(m),writable:true});
  return {net,dev:m.dev||net.me,history,
    run(line){const r=net.exec(line,m.dev);history.push({line,code:r.code,entries:r.entries});return r;},
    check(answered){
      const ctx=NQ.makeCtx(net,history,answered??null),r=m.check(ctx);
      if(r!==true)return r;
      if(!m.question)return true;
      const a=NQ.norm(answered);
      if(!a)return NQ.ASK;
      const ok=[m.question.expect(ctx),...(m.question.accept?m.question.accept(ctx):[])].map(NQ.norm);
      return ok.includes(a)?true:'Not quite yet. '+m.hint;
    }};
};
NQ.runMission=(m,lines,answered)=>{
  const s=NQ.session(m);
  for(const line of lines||[])s.run(line);
  return s.check(answered);
};
})();
