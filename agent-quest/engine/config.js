/* Agent Quest setup and prompt grammar. A setup is read from the virtual files; a prompt is "Field: value" lines.
   A line that does not parse, or whose target does not resolve, becomes an error and has no effect. Nothing here throws. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const {own,valid,dir}=AQ.vfs;
const VERBS=['edit','read','run','call','send','delete'];
const TAGS=['bugfix','docs','review','test','release','refactor','schedule'];
const MODELS={small:1,standard:3,large:10};
const MAXLINE=300;
const FIELDS={goal:'goal',files:'files',examples:'examples',use:'use',plan:'plan',constraints:'constraints','done when':'donewhen',extra:'extra'};
const show=s=>s.length>60?s.slice(0,57)+'…':s;
const err=error=>({ok:false,error});

/* null when the target exists in the scenario for this verb, else the reason */
function resolveTarget(verb,target,scenario){
  const sc=scenario||{};
  if(!target)return 'there is no target';
  if(target.includes('..'))return '".." paths are not allowed';
  if(verb==='edit'||verb==='read'||verb==='delete'){
    const files=Object.keys(sc.vfs||{});
    return valid(target)&&(own(sc.vfs||{},target)||files.some(f=>f.startsWith(dir(target))))?null:'"'+show(target)+'" is not a file or folder in this project';
  }
  if(verb==='run')return own(sc.commands||{},target)?null:'"'+show(target)+'" is not a command this project has';
  return (sc.tools||[]).some(t=>t===target||t.startsWith(target+'.'))?null:'"'+show(target)+'" is not a tool the agent has';
}

const RULE_HELP='Use "do not VERB TARGET", "only VERB TARGET", "ask before VERB TARGET" or "max N files"';
function parseConstraint(line,scenario){
  const s=String(line??'').trim();
  if(!s)return err('the line is empty');
  if(s.length>MAXLINE)return err('the line is longer than '+MAXLINE+' characters');
  let m=/^max\s+(\d{1,3})\s+files?$/i.exec(s);
  if(m){const n=+m[1];return n>=1?{ok:true,c:{kind:'max',verb:'edit',target:'',n}}:err('max needs a number from 1');}
  m=/^(do not|only|ask before)\s+(\S+)\s+(.+)$/i.exec(s);
  if(!m)return err('"'+show(s)+'" is not a rule. '+RULE_HELP);
  const kind=m[1].toLowerCase(),verb=m[2].toLowerCase(),target=m[3].trim();
  if(!VERBS.includes(verb))return err('"'+show(m[2])+'" is not a verb. Pick one of '+VERBS.join(', '));
  const bad=resolveTarget(verb,target,scenario);
  return bad?err(bad):{ok:true,c:{kind,verb,target}};
}
function parseDoneWhen(line,scenario){
  const s=String(line??'').trim();
  if(!s)return err('the line is empty');
  if(s.length>MAXLINE)return err('the line is longer than '+MAXLINE+' characters');
  const m=/^(run|read|call)\s+(.+)$/i.exec(s);
  if(!m)return err('"'+show(s)+'" is not a check the agent can perform. Use "run COMMAND", "read PATH" or "call TOOL"');
  const verb=m[1].toLowerCase(),target=m[2].trim(),bad=resolveTarget(verb,target,scenario);
  return bad?err(bad):{ok:true,d:{verb,target}};
}

/* text -> {fields, bad}: fields.donewhen is null when no "Done when" line was seen */
function splitFields(text){
  const fields={goal:'',files:[],examples:[],use:[],plan:false,constraints:[],donewhen:null,extra:''},bad=[];
  const list=v=>v.split(',').map(x=>x.trim()).filter(Boolean);
  for(const raw of String(text??'').split('\n')){
    const line=raw.trim();
    if(!line)continue;
    if(line.length>MAXLINE){bad.push({line:show(line),error:'the line is longer than '+MAXLINE+' characters'});continue;}
    const m=/^([A-Za-z]+(?: [A-Za-z]+)?):\s*(.*)$/.exec(line),f=m&&own(FIELDS,m[1].toLowerCase())&&FIELDS[m[1].toLowerCase()];
    if(!f){bad.push({line:show(line),error:'does not start with a field name. Fields: Goal, Files, Examples, Use, Plan, Constraints, Done when, Extra'});continue;}
    const v=m[2].trim();
    if(f==='files'||f==='examples'||f==='use')fields[f].push(...list(v));
    else if(f==='constraints')fields.constraints.push(v);
    else if(f==='plan'){
      if(/^first$/i.test(v))fields.plan=true;
      else if(v&&!/^off$/i.test(v))bad.push({line:show(line),error:'Plan is "first" or left off'});
    }else fields[f]=v;
  }
  return {fields,bad};
}

function parsePrompt(text,scenario,setup){
  const {fields,bad}=splitFields(text),errors=bad.map(b=>({line:b.line,msg:b.error}));
  const constraints=[];let doneWhen=null;
  for(const l of fields.constraints){const r=parseConstraint(l,scenario);if(r.ok)constraints.push(r.c);else errors.push({line:'Constraints: '+show(l),msg:r.error});}
  if(fields.donewhen!==null){const r=parseDoneWhen(fields.donewhen,scenario);if(r.ok)doneWhen=r.d;else errors.push({line:'Done when: '+show(fields.donewhen),msg:r.error});}
  const known=names(setup,scenario);
  const keep=(name,list,ok)=>list.filter(x=>ok(x)?true:(errors.push({line:name+': '+show(x),msg:'"'+show(x)+'" '+(name==='Use'?'is not in the setup':'is not a file or folder in this project')}),false));
  const pathOk=p=>!p.includes('..')&&resolveTarget('read',p,scenario)===null;
  const files=keep('Files',fields.files,pathOk),examples=keep('Examples',fields.examples,pathOk),use=keep('Use',fields.use,x=>known.has(x));
  return {raw:String(text??''),fields,errors,constraints,doneWhen,files,examples,use,plan:fields.plan};
}

/* every name "Use" may mention: skills, MCP servers and their tools, subagents, scenario tools */
function names(setup,scenario){
  const out=new Set(((scenario||{}).tools)||[]);
  if(setup){
    for(const s of setup.skills)out.add(s.name);
    for(const m of setup.mcp){out.add(m.name);for(const t of m.tools)out.add(m.name+'.'+t);}
    for(const a of setup.subagents)out.add(a.name);
  }
  return out;
}

const frontmatter=text=>{const o={};for(const l of String(text).split('\n')){const m=/^(name|description|when|model):\s*(.*)$/.exec(l.trim());if(m&&!(m[1] in o))o[m[1]]=m[2].trim();}return o;};
const lines=t=>String(t??'').split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));

function parseSetup(vfs){
  /* raw: every setup file under .claude/, so a size budget counts text the parsers ignore too */
  const setup={memory:vfs.read('CLAUDE.md')||'',raw:vfs.list('.claude/').map(p=>vfs.read(p)).join('\n'),skills:[],mcp:[],rules:[],hooks:[],subagents:[],errors:[]};
  for(const p of vfs.list('.claude/skills/').filter(f=>f.endsWith('.md'))){
    const f=frontmatter(vfs.read(p));
    if(!f.name){setup.errors.push({file:p,msg:'a skill needs a name: line'});continue;}
    if(!TAGS.includes(f.when)){setup.errors.push({file:p,msg:'when: must be one of '+TAGS.join(', ')});continue;}
    setup.skills.push({path:p,name:f.name,description:f.description||'',when:f.when});
  }
  for(const l of lines(vfs.read('.claude/mcp.txt'))){
    const m=/^([\w-]+):\s*([\w-]+(?:\s*,\s*[\w-]+)*)$/.exec(l);
    if(m)setup.mcp.push({name:m[1],tools:m[2].split(',').map(x=>x.trim())});else setup.errors.push({file:'.claude/mcp.txt',msg:'"'+show(l)+'" is not "server: tool, tool"'});
  }
  const verbRule=(file,head,out)=>{for(const l of lines(vfs.read(file))){
    const m=new RegExp('^'+head+'\\s+('+VERBS.join('|')+')\\s+(\\S.*)$').exec(l);
    if(m)out.push({verb:m[1],target:m[2].trim()});else setup.errors.push({file,msg:'"'+show(l)+'" is not "'+head+' VERB TARGET"'});
  }};
  verbRule('.claude/permissions.txt','deny',setup.rules);
  verbRule('.claude/hooks.txt','before',setup.hooks);
  for(const p of vfs.list('.claude/agents/').filter(f=>f.endsWith('.md'))){
    const f=frontmatter(vfs.read(p));
    if(f.name&&own(MODELS,f.model))setup.subagents.push({path:p,name:f.name,model:f.model,cost:MODELS[f.model]});
    else setup.errors.push({file:p,msg:'a subagent needs name: and model: small, standard or large'});
  }
  return setup;
}

/* CLAUDE.md lines in the prompt grammar act as standing rules; any other line only costs tokens */
function memoryRules(setup,scenario){
  const rules=[],ignored=[];
  for(const l of lines(setup.memory)){const r=parseConstraint(l,scenario);if(r.ok)rules.push(r.c);else ignored.push(l);}
  return {rules,ignored};
}

AQ.config={TAGS,parseConstraint,parseDoneWhen,splitFields,parsePrompt,parseSetup,memoryRules};
})();
