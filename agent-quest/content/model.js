/* Agent Quest mission model. A mission is {title, goal, how[], explain, hint, scenario, kind, prompt?, answer, wrong, lazy, check?,
   facts?}. Its input is a prompt string, or {prompt, files} where files holds edits to setup files. runMission builds the
   scenario, runs the policy and grades the Outcome, so a check never depends on UI state. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const KINDS=['prompt','config','budget'];
const isObj=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
/* only the agent's own setup is editable; the project files are the scenario */
const editable=p=>p==='CLAUDE.md'||p.startsWith('.claude/')||AQ.isFolderMemory(p);

const norm=input=>typeof input==='string'?{prompt:input,files:{}}
  :isObj(input)?{prompt:typeof input.prompt==='string'?input.prompt:'',files:isObj(input.files)?input.files:{}}
  :{prompt:'',files:{}};

/* true, or a plain-text reason the run does not pass */
function verdict(o,c){
  if(o.steps.some(s=>s.type==='stall'))return 'The run stopped to wait for approval, and nobody was there to give it.';
  if(o.status==='failed')return 'The agent checked its work and the check failed, and it could not repair it. Look at the Run panel for the step that failed.';
  if(o.violations.length){const v=o.violations[0];return 'The agent did '+v.verb+' '+v.target+', and nothing told it not to.';}
  return c.scenario.accept(o);
}

/* the scenario, the learner's files, the parsed setup and the parsed prompt for a mission and an input */
function prepare(m,input){
  const sc=AQ.scenarios[m.scenario],inp=norm(input),vfs=AQ.vfs.create(sc.vfs);
  /* a folder memory file is editable only where the scenario ships one, so an input cannot invent it */
  for(const p of Object.keys(inp.files))if(editable(p)&&typeof inp.files[p]==='string'&&(!AQ.isFolderMemory(p)||AQ.vfs.own(sc.vfs,p)))vfs.write(p,inp.files[p]);
  const setup=AQ.config.parseSetup(vfs);
  /* config and budget missions send their own prompt: the learner's work is the setup files */
  const prompt=AQ.config.parsePrompt([m.prompt,m.kind==='prompt'?inp.prompt:''].filter(Boolean).join('\n'),sc,setup);
  return {scenario:sc,vfs,setup,prompt};
}

const REFUSED='Some of your lines did not parse, so the agent was not run. Fix the lines listed under the form first.';
const WAITING='The agent made a plan and is waiting for you to approve it.';

/* opts.approved continues a run that paused on Plan: first. A prompt with a rejected line is never run. */
function evaluate(m,input,opts={}){
  const {scenario,vfs,setup,prompt}=prepare(m,input);
  if(prompt.errors.length)return {result:REFUSED,refused:true,outcome:null,prompt,setup};
  const outcome=AQ.policy.run(scenario,setup,prompt,{vfs,approved:!!opts.approved,history:scenario.history||[]});
  if(outcome.status==='awaiting-approval')return {result:WAITING,awaiting:true,outcome,prompt,setup};
  const c={prompt,setup,scenario};
  return {result:m.check?m.check(outcome,c):verdict(outcome,c),outcome,prompt,setup};
}

/* null when the whole setup fits the budget, else the reason */
AQ.overBudget=(c,limit)=>{const n=AQ.context.setupTokens(c.setup);return n>limit?'Your setup still takes about '+n+' tokens. The goal is '+limit+' or fewer.':null;};
/* what a run paid for helpers: every delegate step counts, including one that had nothing to read */
AQ.helperCost=o=>o.steps.reduce((n,s)=>n+(s.type==='delegate'?s.cost:0),0);
AQ.KINDS=KINDS;
AQ.verdict=verdict;
AQ.editable=editable;
AQ.prepare=prepare;
AQ.evaluate=evaluate;
AQ.runMission=(m,input,opts)=>evaluate(m,input,opts).result;
})();
