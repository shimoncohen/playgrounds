/* DOM code only; the simulator stays in engine/. Everything a learner can type reaches the page as textContent or through esc(), never as raw
   markup. The run view is the one place that asks the simulated provider for narration and usage. Exposes window.AQUI. */
(()=>{
'use strict';
const UI=window.AQUI=window.AQUI||{};
const esc=UI.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
UI.el=el;

UI.rove=(list,sel)=>{
  const items=()=>[...list.querySelectorAll(sel)];
  list.addEventListener('keydown',e=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
    const xs=items();if(!xs.length)return;
    let i=Math.max(0,xs.indexOf(document.activeElement));
    if(e.key==='ArrowDown')i=Math.min(xs.length-1,i+1);else if(e.key==='ArrowUp')i=Math.max(0,i-1);else if(e.key==='Home')i=0;else i=xs.length-1;
    e.preventDefault();xs.forEach((x,j)=>{x.tabIndex=j===i?0:-1;});xs[i].focus();
  });
};

const TAGS={context:'context',skill:'skill',plan:'plan',approved:'plan',skip:'skipped',hook:'hook',stall:'stalled'};
const WHY={'not seen yet':'the agent has not read what it needs yet','not connected':'its server is not connected','no one to ask':'nobody is there to approve it'};
const describe=s=>{
  if(s.type==='hook')return 'Hook after edit '+s.target+': ran '+s.run+' ('+(s.ok?'passed':s.why||'failed')+')';
  if(s.type==='stall')return 'Waiting for approval, but nobody is there';
  if(s.type==='skill')return 'Skill '+s.name+(s.loaded?' loaded':' not loaded ('+s.why+')');
  if(s.type==='context')return 'Loaded instructions and your prompt: ~'+s.tokens+' tokens'+(s.dropped?' ('+s.dropped+' earlier message'+(s.dropped>1?'s':'')+' dropped to fit)':'');
  if(s.type==='plan')return 'Plan: '+(s.files.length?'change '+s.files.join(', '):'no files');
  if(s.type==='approved')return 'Plan approved';
  if(s.type==='skip')return s.verb+' '+s.target+' ('+(WHY[s.by]||'blocked by '+s.by)+')';
  return s.verb+' '+s.target+(s.ok?'':' (failed)');
};
const tagOf=s=>s.type==='act'?(s.violation?'violation':s.tag==='verify'?'check':s.tag==='fix'?'fix':'call'):TAGS[s.type];

UI.describe=describe;
UI.tagOf=tagOf;

UI.runView=host=>{
  const empty=()=>{host.textContent='';host.append(el('p','empty','Press Run the agent to watch each step here.'));};
  empty();
  return {
    clear:empty,
    show(outcome){
      host.textContent='';
      const ol=el('ol','steps');ol.setAttribute('aria-label','Steps the agent took');
      let inT=0,outT=0;
      outcome.steps.forEach((s,i)=>{
        const r=AQ.provider.sim.complete([{role:'user',content:describe(s)}],{step:s});
        inT+=r.usage.in;outT+=r.usage.out;
        const li=el('li',s.type==='skip'?'skip':s.violation?'bad':s.type==='act'&&s.ok?'ok':'');
        li.tabIndex=i?-1:0;
        li.append(el('span','tag',tagOf(s)),el('span','',describe(s)),el('span','nar',r.text));
        ol.append(li);
      });
      UI.rove(ol,'li');
      const sum=el('p','outcome');
      const waiting=outcome.status==='awaiting-approval';
      const b=el('b','',waiting?'Waiting for your approval':'Result: '+outcome.status);
      sum.append(b,document.createTextNode(' · '+outcome.violations.length+' mistake'+(outcome.violations.length===1?'':'s')+' · the agent held at most ~'+outcome.tokens.peak+' tokens · model use ~'+inT+' in, ~'+outT+' out (estimates)'));
      host.append(sum,ol);
      if(waiting){const a=el('button','btn','Approve plan');a.type='button';a.dataset.act='approve';host.append(a);}
    }
  };
};
})();
