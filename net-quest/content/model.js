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
NQ.ASK='Now type your answer in the box under the question.'; // runMission's "check passed, waiting for the answer"
/* the check context. history: [{line, code, entries}] the learner ran, entries being the log slice that line added
   (net.exec's r.entries); answered: their answer to the question, or null. lastPing() is the
   latest history item whose command is ping, or null. ping runs on a clone, so a check's probe never changes the
   learner's ARP caches, NAT table or log. */
NQ.makeCtx=(net,history,answered)=>({
  net,history:history||[],answered:answered??null,entries:net.log,
  ping:(from,ip)=>{const r=NQ.sim.ping(net.clone(),from,ip);return {delivered:r.delivered,reason:r.reason,replyFrom:r.replyFrom,hops:r.hops};},
  route:(dev,ip)=>NQ.sim.route(net.devices[dev],ip),
  addr:dev=>Object.fromEntries(Object.entries(net.devices[dev].ifaces).map(([k,i])=>[k,i.ip])),
  last:pred=>{for(let i=net.log.length-1;i>=0;i--)if(pred(net.log[i]))return net.log[i];return null;},
  layers:e=>NQ.pkt.layerNames(e.packet),
  lastPing:()=>(history||[]).filter(h=>/^\s*ping(\s|$)/.test(h.line)).at(-1)||null
});
/* build the mission's network, run the lines on its terminal device (m.dev, else the scenario's own), then check.
   A question is asked only once the check passes; question.accept(ctx) may list more accepted answers. Returns true,
   NQ.ASK (passed, answer still to type) or a friendly one-sentence hint. It replays on a FRESH net, so the UI's live
   terminal net must also be createNet(m.scenario, m.setup) at each mission start and reset: on a warm ARP cache,
   chapter 1's ping sends no ARP request at all.
   The UI checks a mission only after a command that exits 0, or when an answer is submitted, so a mission's reference
   answer must end on a line that exits 0 (tests/net/content.test.mjs 'every reference line succeeds' enforces it for
   every line of the answer; a mission whose point is a failing command, like a ping that gets no reply, lists that line in
   m.expectFail, and the test then requires it to exit 1; the UI shows the question once the check passes, whatever the exit code). */
NQ.runMission=(m,lines,answered)=>{
  const net=NQ.createNet(m.scenario,m.setup),history=[];
  for(const line of lines||[]){const r=net.exec(line,m.dev);history.push({line,code:r.code,entries:r.entries});}
  const ctx=NQ.makeCtx(net,history,answered??null),r=m.check(ctx);
  if(r!==true)return r;
  if(!m.question)return true;
  const a=NQ.norm(answered);
  if(!a)return NQ.ASK;
  const ok=[m.question.expect(ctx),...(m.question.accept?m.question.accept(ctx):[])].map(NQ.norm);
  return ok.includes(a)?true:'Not quite yet. '+m.hint;
};
})();
