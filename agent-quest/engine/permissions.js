/* Agent Quest permissions: decides whether the pretend agent may take an action. Learner constraints, standing CLAUDE.md
   rules, permission rules and hooks all block the same way. A blocked action is skipped and is never a violation. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};

/* a pattern covers itself, anything under it (a folder, a tool's namespace) and a command with more words after it */
const matches=(pat,t)=>t===pat||t.startsWith(pat.endsWith('/')?pat:pat+'/')||t.startsWith(pat+'.')||t.startsWith(pat+' ');

/* constraints: [{kind, verb, target, n?, by}]; state.edited: the files edited so far */
function check(action,setup,constraints,state){
  const edited=(state&&state.edited)||[];
  for(const c of constraints){
    if(c.kind==='max'){
      if(action.verb==='edit'&&!edited.includes(action.target)&&edited.length>=c.n)return {allowed:false,by:c.by||'constraint'};
    }else if(c.verb===action.verb){
      const hit=matches(c.target,action.target);
      if(c.kind==='only'?!hit:hit)return {allowed:false,by:c.by||'constraint'};
    }
  }
  for(const r of setup.rules)if(r.verb===action.verb&&matches(r.target,action.target))return {allowed:false,by:'permission rule'};
  for(const h of setup.hooks)if(h.verb===action.verb&&matches(h.target,action.target))return {allowed:false,by:'hook'};
  return {allowed:true,by:null};
}

AQ.permissions={check,matches};
})();
