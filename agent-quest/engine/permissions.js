/* Agent Quest permissions: decides whether the pretend agent may take an action. Learner constraints, standing CLAUDE.md
   rules, permission rules and hooks all block the same way. A blocked action is skipped and is never a violation. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};

/* "*" stands for any text, "/" included. Whole-target match, greedy and leftmost, so it is linear and never builds a RegExp from input;
   the length check keeps the prefix and the suffix from overlapping (a*a does not match a). */
function glob(pat,t){
  const parts=pat.split('*'),first=parts[0],last=parts[parts.length-1],end=t.length-last.length;
  if(end<first.length||!t.startsWith(first)||!t.endsWith(last))return false;
  let at=first.length;
  for(const mid of parts.slice(1,-1)){const i=t.indexOf(mid,at);if(i<0||i+mid.length>end)return false;at=i+mid.length;}
  return true;
}
/* a pattern covers itself, anything under it (a folder, a tool's namespace), a command with more words after it, and a section of it (X#anchor) */
const matches=(pat,t)=>pat.includes('*')?glob(pat,t)||(t.includes('#')&&glob(pat,t.slice(0,t.indexOf('#'))))
  :t===pat||t.startsWith(pat.endsWith('/')?pat:pat+'/')||t.startsWith(pat+'.')||t.startsWith(pat+' ')||t.startsWith(pat+'#');

/* constraints: [{kind, verb, target, n?, by}]; state.edited: the files edited so far; state.unattended: the scenario has nobody to approve */
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
  /* an unattended run has nobody to ask, so anything but a read needs an allow line; attended runs ignore allow */
  if(state&&state.unattended&&action.verb!=='read'&&!setup.allow.some(r=>r.verb===action.verb&&matches(r.target,action.target)))return {allowed:false,by:'no one to ask'};
  return {allowed:true,by:null};
}

AQ.permissions={check,matches};
})();
