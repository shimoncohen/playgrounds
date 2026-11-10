/* Agent Quest provider seam. complete(messages, opts) -> {text, usage:{in, out}}. The simulated provider narrates a step
   with canned text and estimates usage from the messages. It never decides an Outcome, and only the run view calls it. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const VERB={read:'read',edit:'edited',delete:'deleted',run:'ran',call:'called',send:'sent'};
// ui.js has a WHY map with the same keys for the Run panel; add a key to both.
const WHY={'not seen yet':'I had not read what it needs yet','not connected':'the tool is not connected','no one to ask':'nobody is there to approve it','hook':'a hook does not allow it','permission rule':'a permission rule does not allow it'};

function narrate(s){
  if(!s)return 'I read the task and planned my next step.';
  if(s.type==='context')return 'I loaded my instructions and your prompt'+(s.dropped?' (some earlier messages no longer fit).':'.');
  if(s.type==='plan')return 'Here is my plan'+(s.files.length?': I will change '+s.files.join(', ')+'.':'.');
  if(s.type==='skill')return s.loaded?'I loaded the skill "'+s.name+'" because it matches this task.':'I did not load the skill "'+s.name+'": another skill already matches this task.';
  if(s.type==='approved')return 'The plan is approved, so I start.';
  if(s.type==='command')return 'I expanded the saved command "'+s.name+'" into the prompt.';
  if(s.type==='delegate')return !s.files?'I handed the search to '+s.name+', but there was nothing for it to search.'
    :s.over?'I handed the search to '+s.name+', but it read more than fit in its window and lost track of some files.'
    :'I handed the search to '+s.name+'. It read '+s.files+' file'+(s.files===1?'':'s')+' in its own context and sent back what matters.';
  if(s.type==='stall')return 'I made a plan and waited for approval, but this run has nobody to give it, so I stopped.';
  if(s.type==='fire')return (s.entry?'The schedule starts the job at '+s.entry.at+' on '+s.due.join(', ')+': '+s.due.length+' run'+(s.due.length===1?'':'s')+' a week.':'No line in .claude/schedule.txt starts the job, so it never runs.')+(s.why?' One schedule line was ignored: '+s.why+'.':'');
  if(s.type==='hook')return 'The hook ran '+s.run+' after my edit of '+s.target+(s.ok?' and it passed.':s.why?', but '+s.why+'.':' and it failed.');
  const plain=s.verb+' '+s.target,did='I '+(VERB[s.verb]||s.verb)+' '+s.target+'.';
  if(s.type==='skip')return 'I wanted to '+plain+', but '+(WHY[s.by]||s.by+' does not allow it')+', so I skipped it.';
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
