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
const SCHEDULE='.claude/schedule.txt';
const DAYS=['mon','tue','wed','thu','fri','sat','sun'];
const WHEN={daily:DAYS,weekdays:DAYS.slice(0,5),monday:['mon'],tuesday:['tue'],wednesday:['wed'],thursday:['thu'],friday:['fri'],saturday:['sat'],sunday:['sun']};
const show=s=>s.length>60?s.slice(0,57)+'…':s;
const err=error=>({ok:false,error});

/* null when the target exists in the scenario for this verb, else the reason.
   opts.glob is for rules only: Files, Examples and Done when expand a scope to one file or folder, and a pattern there would read nothing. */
function resolveTarget(verb,target,scenario,opts={}){
  const setup=opts.setup;
  const sc=scenario||{};
  if(!target)return 'there is no target';
  if(target.includes('..'))return '".." paths are not allowed';
  if(verb==='edit'||verb==='read'||verb==='delete'){
    const files=Object.keys(sc.vfs||{}),bad='"'+show(target)+'" is not a file or folder in this project';
    if(opts.glob&&target.includes('*')){
      if(!/^[\w.@/*-]+$/.test(target)||target.split('*').length>4)return bad;
      return files.some(f=>AQ.permissions.matches(target,f))?null:'"'+show(target)+'" matches no file in this project';
    }
    const i=target.indexOf('#');
    if(verb==='read'&&i>0)return own(sc.vfs||{},target.slice(0,i))&&AQ.vfs.section(sc.vfs[target.slice(0,i)],target.slice(i+1))!==null?null:bad;
    return valid(target)&&(own(sc.vfs||{},target)||files.some(f=>f.startsWith(dir(target))))?null:bad;
  }
  if(verb==='run')return own(sc.commands||{},target)?null:'"'+show(target)+'" is not a command this project has';
  return hasTool(setup,sc,target)||(opts.allow&&opts.allow.has(target))?null:'"'+show(target)+'" is not a tool the agent has';
}

const RULE_HELP='Use "do not VERB TARGET", "only VERB TARGET", "ask before VERB TARGET" or "max N files"';
function parseConstraint(line,scenario,setup,allow){
  const s=String(line??'').trim();
  if(!s)return err('the line is empty');
  if(s.length>MAXLINE)return err('the line is longer than '+MAXLINE+' characters');
  let m=/^max\s+(\d{1,3})\s+files?$/i.exec(s);
  if(m){const n=+m[1];return n>=1?{ok:true,c:{kind:'max',verb:'edit',target:'',n}}:err('max needs a number from 1');}
  m=/^(do not|only|ask before)\s+(\S+)\s+(.+)$/i.exec(s);
  if(!m)return err('"'+show(s)+'" is not a rule. '+RULE_HELP);
  const kind=m[1].toLowerCase(),verb=m[2].toLowerCase(),target=m[3].trim();
  if(!VERBS.includes(verb))return err('"'+show(m[2])+'" is not a verb. Pick one of '+VERBS.join(', '));
  const bad=resolveTarget(verb,target,scenario,{glob:true,setup,allow});
  return bad?err(bad):{ok:true,c:{kind,verb,target}};
}
function parseDoneWhen(line,scenario,setup,allow){
  const s=String(line??'').trim();
  if(!s)return err('the line is empty');
  if(s.length>MAXLINE)return err('the line is longer than '+MAXLINE+' characters');
  const m=/^(run|read|call)\s+(.+)$/i.exec(s);
  if(!m)return err('"'+show(s)+'" is not a check the agent can perform. Use "run COMMAND", "read PATH" or "call TOOL"');
  const verb=m[1].toLowerCase(),target=m[2].trim(),bad=resolveTarget(verb,target,scenario,{setup,allow});
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

/* A Use name that is a saved command is expanded into the prompt: its lines join the typed ones (lists concatenate, Plan is ORed,
   a typed Goal or Done when wins). A bad line, or a Use line, inside a command is an error, and an error refuses the whole run. */
function parsePrompt(text,scenario,setup,allow){
  const {fields,bad}=splitFields(text),errors=bad.map(b=>({line:b.line,msg:b.error}));
  const cmds=[];
  for(const name of new Set(fields.use)){
    const cmd=setup&&setup.commands.find(c=>c.name===name);
    if(!cmd)continue;
    const sp=splitFields(cmd.text),tag='Command '+name+': ';
    for(const b of sp.bad)errors.push({line:tag+b.line,msg:b.error});
    if(sp.fields.use.length)errors.push({line:tag+'Use: '+show(sp.fields.use.join(', ')),msg:'a command cannot use other names'});
    cmds.push({name,tag,f:sp.fields,lines:String(cmd.text).split('\n').filter(l=>l.trim()).length,text:cmd.text});
  }
  const src=[{tag:'',f:fields},...cmds],all=k=>src.flatMap(s=>s.f[k].map(v=>({tag:s.tag,v})));
  const constraints=[];let doneWhen=null;
  for(const {tag,v} of all('constraints')){const r=parseConstraint(v,scenario,setup,allow);if(r.ok)constraints.push(r.c);else errors.push({line:tag+'Constraints: '+show(v),msg:r.error});}
  const dw=src.find(s=>s.f.donewhen!==null);
  if(dw){const r=parseDoneWhen(dw.f.donewhen,scenario,setup,allow);if(r.ok)doneWhen=r.d;else errors.push({line:dw.tag+'Done when: '+show(dw.f.donewhen),msg:r.error});}
  const known=names(setup,scenario);
  const keep=(name,list,ok)=>list.filter(({tag,v})=>ok(v)?true:(errors.push({line:tag+name+': '+show(v),msg:'"'+show(v)+'" '+(name==='Use'?'is not in the setup':'is not a file or folder in this project')}),false)).map(x=>x.v);
  const pathOk=p=>!p.includes('..')&&resolveTarget('read',p,scenario)===null;
  const files=keep('Files',all('files'),pathOk),examples=keep('Examples',all('examples'),pathOk),use=keep('Use',fields.use.map(v=>({tag:'',v})),x=>known.has(x));
  const plan=src.some(s=>s.f.plan);
  const merged={...fields,goal:src.map(s=>s.f.goal).find(Boolean)||'',files:all('files').map(x=>x.v),examples:all('examples').map(x=>x.v),constraints:all('constraints').map(x=>x.v),plan,donewhen:dw?dw.f.donewhen:null};
  return {raw:[String(text??''),...cmds.map(c=>c.text)].join('\n'),fields:merged,errors,constraints,doneWhen,files,examples,use,plan,commands:cmds.map(c=>({name:c.name,lines:c.lines}))};
}

/* every name "Use" may mention: skills, MCP servers and their tools, subagents, saved commands, scenario tools */
function names(setup,scenario){
  const out=new Set(((scenario||{}).tools)||[]);
  if(setup){
    for(const s of setup.skills)out.add(s.name);
    for(const m of setup.mcp){out.add(m.name);for(const t of m.tools)out.add(m.name+'.'+t);}
    for(const a of setup.subagents)out.add(a.name);
    for(const c of setup.commands)out.add(c.name);
  }
  return out;
}

const frontmatter=text=>{const o={};for(const l of String(text).split('\n')){const m=/^(name|description|when|model):\s*(.*)$/.exec(l.trim());if(m&&!(m[1] in o))o[m[1]]=m[2].trim();}return o;};
const lines=t=>String(t??'').split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));

/* a CLAUDE.md inside a folder (src/CLAUDE.md); the root file and .claude/ paths are not folder memory */
const isFolderMemory=p=>typeof p==='string'&&valid(p)&&/^(?:[\w.@-]+\/)+CLAUDE\.md$/.test(p)&&!p.startsWith('.claude/');

function parseSetup(vfs){
  /* raw: every setup file under .claude/, so a size budget counts text the parsers ignore too */
  const setup={memory:vfs.read('CLAUDE.md')||'',raw:vfs.list('.claude/').map(p=>vfs.read(p)).join('\n'),skills:[],mcp:[],rules:[],allow:[],hooks:[],afterHooks:[],subagents:[],commands:[],schedule:[],errors:[],
    memoryFolders:vfs.list().filter(isFolderMemory).map(path=>({path,dir:path.slice(0,-'CLAUDE.md'.length),text:vfs.read(path)}))};
  /* the editor has no delete: a file emptied to nothing is a removed file, not a malformed one */
  const blank=p=>!String(vfs.read(p)).trim();
  for(const p of vfs.list('.claude/skills/').filter(f=>f.endsWith('.md')&&!blank(f))){
    const f=frontmatter(vfs.read(p));
    if(!f.name){setup.errors.push({file:p,msg:'a skill needs a name: line'});continue;}
    if(!TAGS.includes(f.when)){setup.errors.push({file:p,msg:'when: must be one of '+TAGS.join(', ')});continue;}
    if(setup.skills.some(s=>s.name===f.name)){setup.errors.push({file:p,msg:'duplicate skill name "'+show(f.name)+'"'});continue;}
    setup.skills.push({path:p,name:f.name,description:f.description||'',when:f.when});
  }
  for(const l of lines(vfs.read('.claude/mcp.txt'))){
    const m=/^([\w-]+):\s*([\w-]+(?:\s*,\s*[\w-]+)*)$/.exec(l);
    if(m)setup.mcp.push({name:m[1],tools:m[2].split(',').map(x=>x.trim())});else setup.errors.push({file:'.claude/mcp.txt',msg:'"'+show(l)+'" is not "server: tool, tool"'});
  }
  const verbRule=(file,forms,extra)=>{for(const l of lines(vfs.read(file))){
    let done=false;
    for(const [head,out] of forms){
      const m=new RegExp('^'+head+'\\s+('+VERBS.join('|')+')\\s+(\\S.*)$').exec(l);
      if(m){out.push({verb:m[1],target:m[2].trim()});done=true;break;}
    }
    if(done||(extra&&extra(l)))continue;
    const said=forms.map(([h])=>'"'+h+' VERB TARGET"').concat(extra?['"after edit PATH run COMMAND"']:[]);
    setup.errors.push({file,msg:'"'+show(l)+'" is not '+said.join(' or ')});
  }};
  verbRule('.claude/permissions.txt',[['deny',setup.rules],['allow',setup.allow]]);
  verbRule('.claude/hooks.txt',[['before',setup.hooks]],l=>{
    const m=/^after\s+edit\s+(\S+)\s+run\s+(\S.*)$/.exec(l);
    if(m)setup.afterHooks.push({target:m[1],run:m[2].trim()});
    return !!m;
  });
  const kinds={skill:setup.skills,subagent:setup.subagents,'MCP server':setup.mcp};
  const clash=(name,of)=>{const k=of.find(k=>kinds[k].some(x=>x.name===name));return k?'the name "'+show(name)+'" is already used by a '+k:'';};
  for(const p of vfs.list('.claude/agents/').filter(f=>f.endsWith('.md')&&!blank(f))){
    const f=frontmatter(vfs.read(p));
    if(!(f.name&&own(MODELS,f.model)))setup.errors.push({file:p,msg:'a subagent needs name: and model: small, standard or large'});
    else if(clash(f.name,['skill']))setup.errors.push({file:p,msg:clash(f.name,['skill'])});
    else setup.subagents.push({path:p,name:f.name,model:f.model,cost:MODELS[f.model]});
  }
  /* parsed last, so Use never has two meanings: helpers claim subagent names, commands claim command names */
  for(const p of vfs.list('.claude/commands/')){
    const m=/^\.claude\/commands\/([\w-]+)\.md$/.exec(p);
    if(!m)continue;
    const why=clash(m[1],['skill','subagent','MCP server']);
    if(why)setup.errors.push({file:p,msg:why});else setup.commands.push({name:m[1],path:p,text:vfs.read(p)});
  }
  /* after the commands, so NAME can resolve: one line is "WHEN HH:MM use NAME" */
  for(const l of lines(vfs.read(SCHEDULE))){
    const bad=msg=>setup.errors.push({file:SCHEDULE,msg}),m=/^(\S+)\s+(\S+)\s+use\s+(\S+)$/i.exec(l),day=m&&m[1].toLowerCase();
    if(!m)bad('"'+show(l)+'" is not "WHEN HH:MM use NAME"');
    else if(!own(WHEN,day))bad('"'+show(m[1])+'" is not daily, weekdays or a day name');
    else if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(m[2]))bad('"'+show(m[2])+'" is not a time: use two digits, like 07:30');
    else if(!setup.commands.some(c=>c.name===m[3]))bad('"'+show(m[3])+'" is not a saved command');
    else setup.schedule.push({line:l,day,days:WHEN[day],at:m[2],use:m[3]});
  }
  return setup;
}

/* A scheduled scenario runs only when a schedule line starts a command the prompt uses: the first such line, and the days of all of them
   (the runs per week). null for any other scenario and for a scheduled one nothing starts. */
function fired(scenario,setup,prompt){
  if(!scenario||!scenario.scheduled)return null;
  const hits=setup.schedule.filter(s=>prompt.use.includes(s.use));
  return hits.length?{entry:hits[0],due:DAYS.filter(d=>hits.some(h=>h.days.includes(d)))}:null;
}

/* CLAUDE.md lines in the prompt grammar act as standing rules; any other line only costs tokens. In the root file (root=true)
   the first "Done when: …" line that parses is the default check, so it is not ignored; folder memory and skill bodies pass root=false. */
function memoryRules(setup,scenario,root=true){
  const rules=[],ignored=[];
  let check=null;
  for(const l of lines(setup.memory)){
    const r=parseConstraint(l,scenario,setup);
    if(r.ok){rules.push(r.c);continue;}
    const m=root&&!check&&/^done when:\s*(.*)$/i.exec(l),d=m&&parseDoneWhen(m[1],scenario,setup);
    if(d&&d.ok)check=d.d;else ignored.push(l);
  }
  return {rules,ignored,check};
}

/* .claude/mcp.txt is the only source of MCP tools; scenario.tools holds only tools that no server provides */
function hasTool(setup,scenario,target){
  if(((scenario||{}).tools||[]).some(t=>t===target||t.startsWith(target+'.')))return true;
  return !!setup&&!!setup.mcp&&setup.mcp.some(m=>m.name===target||m.tools.some(t=>m.name+'.'+t===target));
}

const folderMemory=(setup,readPaths)=>setup.memoryFolders.filter(f=>readPaths.some(p=>p.startsWith(f.dir)));

/* strips frontmatter-shaped lines anywhere, so a second when: in the body cannot act as a rule or a tag */
const skillBody=text=>String(text??'').split('\n').filter(l=>!/^(name|description|when|model):/.test(l.trim())).join('\n');

/* the skills whose when: equals the scenario tag; only the first by path loads, the rest are duplicates */
function loadedSkills(setup,vfs,tag){
  const hits=tag?[...setup.skills].filter(s=>s.when===tag).sort((a,b)=>a.path<b.path?-1:1):[];
  return {loaded:hits.slice(0,1).map(s=>({name:s.name,path:s.path,body:skillBody(vfs.read(s.path))})),skipped:hits.slice(1).map(s=>({name:s.name,why:'duplicate'}))};
}

/* names of skills that never match the tag, and of skills that share a when: with an earlier one */
function skillIssues(setup,tag){
  const seen=new Set(),duplicate=[];
  for(const s of setup.skills){if(seen.has(s.when))duplicate.push(s.name);seen.add(s.when);}
  return {unused:setup.skills.filter(s=>s.when!==tag).map(s=>s.name),duplicate};
}

const agentCost=setup=>setup.subagents.reduce((n,s)=>n+s.cost,0);

AQ.isFolderMemory=isFolderMemory;
AQ.config={TAGS,fired,parseConstraint,parseDoneWhen,splitFields,parsePrompt,parseSetup,memoryRules,hasTool,folderMemory,skillBody,loadedSkills,skillIssues,agentCost};
})();
