/* Agent Quest policy: run(scenario, setup, prompt, opts) -> Outcome. Deterministic. It walks the scenario's script as the
   pretend agent would. A blocked action is skipped (no violation); an executed action that matches the scenario's hidden
   list logs one violation. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const CAP=3;

function run(scenario,setup,prompt,opts={}){
  const vfs=(opts.vfs||AQ.vfs.create(scenario.vfs)).clone(),history=opts.history||[];
  const steps=[],calls=[],violations=[],read=[],edited=[];
  let peak=0,total=0,ctx=null;
  const refresh=()=>{ctx=AQ.context.build(setup,prompt,history,read.map(p=>({path:p,text:vfs.read(p)||''})));peak=Math.max(peak,ctx.peak);};
  const rules=()=>[
    ...prompt.constraints.map(c=>({...c,by:'your constraint'})),
    ...AQ.config.memoryRules(setup,scenario).rules.map(c=>({...c,by:'CLAUDE.md'})),
    ...AQ.context.rules(ctx,scenario).map(c=>({...c,by:'an earlier message'}))
  ];
  const hidden=a=>(scenario.hidden||[]).some(h=>h.verb===a.verb&&AQ.permissions.matches(h.target,a.target));
  /* returns false when skipped, else the shell result */
  const act=(a,tag)=>{
    const p=AQ.permissions.check(a,setup,rules(),{edited});
    const base={verb:a.verb,target:a.target,tag};
    if(!p.allowed){steps.push({type:'skip',...base,by:p.by});return false;}
    if(a.needs&&a.needs.some(n=>!read.includes(n))){steps.push({type:'skip',...base,by:'not seen yet'});return false;}
    const r=AQ.shell.exec(scenario,a,vfs),bad=hidden(a);
    calls.push({verb:a.verb,target:a.target});
    total+=AQ.tokens.estimate(a.verb+' '+a.target+' '+r.out);
    steps.push({type:'act',...base,ok:r.ok,violation:bad});
    if(bad)violations.push({verb:a.verb,target:a.target});
    if(r.ok&&a.verb==='read'&&!read.includes(a.target))read.push(a.target);
    if(r.ok&&a.verb==='edit'&&!edited.includes(a.target))edited.push(a.target);
    refresh();
    return r;
  };

  refresh();
  total+=ctx.total;
  steps.push({type:'context',tokens:ctx.total,dropped:ctx.dropped.length});
  const script=scenario.script||[];
  if(prompt.plan){
    steps.push({type:'plan',files:script.filter(a=>a.verb==='edit').map(a=>a.target)});
    if(!opts.approved)return {status:'awaiting-approval',vfs,calls,steps,violations,tokens:{peak,total}};
    steps.push({type:'approved'});
  }
  const scope=prompt.files.length?prompt.files.flatMap(f=>vfs.read(f)!==null?[f]:vfs.list(AQ.vfs.dir(f))):(scenario.explore||[]);
  for(const p of [...new Set(scope)])act({verb:'read',target:p},'explore');
  let ran=0;
  for(const a of script)if(act(a,'script'))ran++;

  let status='unverified';
  if(prompt.doneWhen){
    const v={verb:prompt.doneWhen.verb,target:prompt.doneWhen.target};
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
  }
  if(script.length&&!ran)status='blocked';
  return {status,vfs,calls,steps,violations,tokens:{peak,total}};
}

AQ.policy={CAP,run};
})();
