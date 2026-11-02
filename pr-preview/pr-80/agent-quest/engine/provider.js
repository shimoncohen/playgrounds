/* Agent Quest provider seam. complete(messages, opts) -> {text, usage:{in, out}}. The simulated provider narrates a step
   with canned text and estimates usage from the messages. It never decides an Outcome, and only the run view calls it. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const VERB={read:'read',edit:'edited',delete:'deleted',run:'ran',call:'called',send:'sent'};

function narrate(s){
  if(!s)return 'I read the task and planned my next step.';
  if(s.type==='context')return 'I loaded my instructions and your prompt'+(s.dropped?' (some earlier messages no longer fit).':'.');
  if(s.type==='plan')return 'Here is my plan'+(s.files.length?': I will change '+s.files.join(', ')+'.':'.');
  if(s.type==='approved')return 'The plan is approved, so I start.';
  const plain=s.verb+' '+s.target,did='I '+(VERB[s.verb]||s.verb)+' '+s.target+'.';
  if(s.type==='skip')return 'I wanted to '+plain+', but '+s.by+' does not allow it, so I skipped it.';
  if(s.tag==='verify')return (s.ok?'Check passed: ':'Check failed: ')+did;
  return s.ok?did:'I tried to '+plain+' and it failed.';
}

const sim={
  complete(messages,opts={}){
    const text=narrate(opts.step);
    return {text,usage:{in:AQ.tokens.estimate(messages.map(m=>m.content).join('\n')),out:AQ.tokens.estimate(text)}};
  }
};

AQ.provider={sim};
})();
