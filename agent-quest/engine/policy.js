/* Agent Quest policy: run(scenario, setup, prompt, opts) -> Outcome. Deterministic. It walks the scenario's script as the
   pretend agent would. A blocked action is skipped (no violation); an executed action that matches the scenario's hidden
   list logs one violation. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const CAP=3;
/* every type of step a run can push; each needs narration, a ui.js TAGS key and a ui.js describe branch (tests/agent/registry.test.mjs) */
const STEP_TYPES=['context','skill','command','plan','approved','delegate','act','skip','hook','stall','fire'];

function run(scenario,setup,prompt,opts={}){
  const vfs=(opts.vfs||AQ.vfs.create(scenario.vfs)).clone(),history=opts.history||[];
  const steps=[],calls=[],violations=[],read=[],edited=[],hookLast=new Map();
  let peak=0,total=0,ctx=null;
  /* a scheduled scenario is started by a schedule line: that makes the run unattended and tags it "schedule" unless it has a tag of its own */
  const sched=AQ.config.fired(scenario,setup,prompt),unattended=!!scenario.unattended||!!sched,tag=scenario.tag||(sched?'schedule':undefined);
  const {loaded,skipped}=AQ.config.loadedSkills(setup,vfs,tag);
  const styles=scenario.style?prompt.examples.map(p=>scenario.style(vfs.read(p)||'')):[];
  const refresh=()=>{ctx=AQ.context.build(setup,prompt,history,read.map(p=>({path:p,text:vfs.read(p)||''})),{skills:loaded});peak=Math.max(peak,ctx.peak);};
  const memRules=(text,by)=>AQ.config.memoryRules({memory:text},scenario,false).rules.map(c=>({...c,by}));
  /* only the root CLAUDE.md can supply a default check; a typed Done when wins */
  const memCheck=AQ.config.memoryRules(setup,scenario).check;
  const rules=()=>[
    ...prompt.constraints.map(c=>({...c,by:'your constraint'})),
    ...memRules(setup.memory,'CLAUDE.md'),
    ...AQ.config.folderMemory(setup,read).flatMap(f=>memRules(f.text,f.path)),
    ...loaded.flatMap(s=>memRules(s.body,'skill '+s.name)),
    ...AQ.context.rules(ctx,scenario).map(c=>({...c,by:'an earlier message'}))
  ];
  const hidden=a=>(scenario.hidden||[]).some(h=>h.verb===a.verb&&AQ.permissions.matches(h.target,a.target));
  /* returns false when skipped, else the shell result. The order of the gates is the order a skip reason can win. */
  const act=(a,tag,o={})=>{
    const p=AQ.permissions.check(a,setup,rules(),{edited,unattended});
    const base={verb:a.verb,target:a.target,tag};
    const skip=by=>{steps.push({type:'skip',...base,by});return false;};
    if(!p.allowed)return skip(p.by);
    /* a whole-file read also covers a section of it */
    if(a.needs&&a.needs.some(n=>!read.some(r=>r===n||n.startsWith(r+'#'))))return skip('not seen yet');
    if(scenario.connected&&a.verb==='call'&&!AQ.config.hasTool(setup,a.target))return skip('not connected');
    const r=AQ.shell.exec(scenario,a,vfs,styles),bad=hidden(a);
    calls.push({verb:a.verb,target:a.target});
    total+=AQ.tokens.estimate(a.verb+' '+a.target+' '+r.out);
    steps.push({type:'act',...base,ok:r.ok,violation:bad});
    if(bad)violations.push({verb:a.verb,target:a.target});
    if(r.ok&&a.verb==='read'&&!read.includes(a.target))read.push(a.target);
    if(r.ok&&a.verb==='edit'&&!edited.includes(a.target))edited.push(a.target);
    refresh();
    if(r.ok&&a.verb==='edit'&&!o.noHooks)afterEdit(a.target);
    return r;
  };

  /* A hook is the harness, not the agent: no permission check, not in calls, its output counts in total. */
  const fire=(h,target)=>{
    const known=AQ.vfs.own(scenario.commands||{},h.run),r=known?AQ.shell.exec(scenario,{verb:'run',target:h.run},vfs):{ok:false,out:''};
    total+=AQ.tokens.estimate(h.run+' '+r.out);
    hookLast.set(h,r.ok);
    steps.push({type:'hook',when:'after',target,run:h.run,ok:r.ok,...(known?{}:{why:'no such command'})});
    return {ok:r.ok,known};
  };
  /* A failed hook is repaired by the scenario's correction, up to CAP rounds; a repair edit fires no hooks, so this cannot recurse. */
  const afterEdit=target=>{
    for(const h of setup.afterHooks.filter(h=>AQ.permissions.matches(h.target,target))){
      let r=fire(h,target);
      for(let round=0;!r.ok&&r.known&&round<CAP;round++){
        const fix=scenario.correction&&scenario.correction(vfs,round);
        if(!fix||!act(fix,'fix',{noHooks:true}))break;
        r=fire(h,target);
      }
    }
  };
  const outcome=status=>({status,vfs,calls,steps,violations,tokens:{peak,total}});

  if(scenario.scheduled){
    const why=(setup.errors.find(e=>e.file==='.claude/schedule.txt')||{}).msg;
    steps.push({type:'fire',entry:sched?sched.entry:null,due:sched?sched.due:[],...(why?{why}:{})});
    if(!sched)return outcome('blocked');
  }
  refresh();
  total+=ctx.total;
  steps.push({type:'context',tokens:ctx.total,dropped:ctx.dropped.length});
  for(const s of loaded)steps.push({type:'skill',name:s.name,loaded:true});
  for(const s of skipped)steps.push({type:'skill',name:s.name,loaded:false,why:s.why});
  for(const c of prompt.commands)steps.push({type:'command',name:c.name,lines:c.lines});
  const script=scenario.script||[];
  if(prompt.plan&&unattended){steps.push({type:'stall'});return outcome('blocked');}
  if(prompt.plan){
    steps.push({type:'plan',files:script.filter(a=>a.verb==='edit').map(a=>a.target)});
    if(!opts.approved)return outcome('awaiting-approval');
    steps.push({type:'approved'});
  }
  /* Each Use name that is a subagent takes a contiguous chunk of the explore list (the first m mod n chunks one file longer) and reads it
     in its own context: obeying the same rules, counting in total but never in peak. The agent then reads only the focus files. */
  const subs=[...new Set(prompt.use)].map(n=>setup.subagents.find(a=>a.name===n)).filter(Boolean);
  const explore=[...new Set(scenario.explore||[])],focus=scenario.focus||[],delegated=!prompt.files.length&&explore.length>0&&focus.length>0;
  let at=0;
  subs.forEach((s,i)=>{
    const size=delegated?Math.floor(explore.length/subs.length)+(i<explore.length%subs.length?1:0):0;
    let files=0,tokens=0;
    for(const p of explore.slice(at,at+size)){
      const a={verb:'read',target:p};
      if(!AQ.permissions.check(a,setup,rules(),{edited,unattended}).allowed)continue;
      const r=AQ.shell.exec(scenario,a,vfs,styles);
      if(!r.ok)continue;
      files++;tokens+=AQ.tokens.estimate(a.verb+' '+p+' '+r.out);
      if(hidden(a))violations.push(a);
    }
    at+=size;total+=tokens;
    steps.push({type:'delegate',name:s.name,model:s.model,cost:s.cost,files,tokens,over:tokens>AQ.context.WINDOW});
  });
  const scope=prompt.files.length?prompt.files.flatMap(f=>vfs.read(f)!==null?[f]:vfs.list(AQ.vfs.dir(f))):subs.length&&delegated?focus:explore;
  for(const p of [...new Set(scope)])act({verb:'read',target:p},'explore');
  let ran=0;
  for(const a of script)if(act(a,'script'))ran++;

  let status='unverified';
  const check=prompt.doneWhen||memCheck;
  if(check){
    const v={verb:check.verb,target:check.target};
    let r=act(v,'verify');
    if(r){
      for(let round=0;!r.ok&&round<CAP;round++){
        const fix=scenario.correction&&scenario.correction(vfs,round);
        if(!fix||!act(fix,'fix'))break;
        r=act(v,'verify');
        if(!r)break;
      }
      status=r&&r.ok?'done':'failed';
    }
  }else if(hookLast.size)status=[...hookLast.values()].every(Boolean)?'done':'failed';
  if(script.length&&!ran)status='blocked';
  return outcome(status);
}

AQ.policy={CAP,STEP_TYPES,run};
})();
