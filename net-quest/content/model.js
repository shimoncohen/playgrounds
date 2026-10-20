/* Network Quest mission model: the check context and the mission runner. Chapters (content/ch-*.js) push into NQ.CH in
   order; a mission's key is '<chapter>.<mission>', so shipped missions are never reordered. Plain data and small
   functions, loaded after the engine. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
NQ.CH=NQ.CH||[];
NQ.XP=10; // per mission
NQ.KINDS={cmd:'command',opt:'option',arg:'argument',op:'operator'}; // anatomy chip kinds and their default labels
/* answers compare as lowercase words: spaces, commas, semicolons, pipes and arrows all separate, so
   "Ethernet → IPv4 → ICMP", "ethernet ipv4 icmp" and "Ethernet,IPv4,ICMP" are equal */
NQ.norm=s=>String(s??'').toLowerCase().split(/[\s,;|>→]+/).filter(Boolean).join(',');
/* the check context. history: [{line, code}] the learner ran; answered: their answer to the question, or null.
   ping runs on a clone, so a check's probe never changes the learner's ARP caches, NAT table or log. */
NQ.makeCtx=(net,history,answered)=>({
  net,history:history||[],answered:answered??null,entries:net.log,
  ping:(from,ip)=>{const r=NQ.sim.ping(net.clone(),from,ip);return {delivered:r.delivered,reason:r.reason,replyFrom:r.replyFrom,hops:r.hops};},
  route:(dev,ip)=>NQ.sim.route(net.devices[dev],ip),
  addr:dev=>Object.fromEntries(Object.entries(net.devices[dev].ifaces).map(([k,i])=>[k,i.ip])),
  last:pred=>{for(let i=net.log.length-1;i>=0;i--)if(pred(net.log[i]))return net.log[i];return null;},
  layers:e=>NQ.pkt.layerNames(e.packet)
});
/* build the mission's network, run the lines on its terminal device (m.dev, else the scenario's own), then check.
   A question is asked only once the check passes. Returns true or a friendly one-sentence hint. */
NQ.runMission=(m,lines,answered)=>{
  const net=NQ.createNet(m.scenario,m.setup),history=[];
  for(const line of lines||[])history.push({line,code:net.exec(line,m.dev).code});
  const ctx=NQ.makeCtx(net,history,answered??null),r=m.check(ctx);
  if(r!==true)return r;
  if(!m.question)return true;
  if(!NQ.norm(answered))return 'Now type your answer in the box under the question.';
  return NQ.norm(answered)===NQ.norm(m.question.expect(ctx))?true:'Not quite yet. '+m.hint;
};
})();
