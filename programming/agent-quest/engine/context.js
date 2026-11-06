/* Agent Quest context: what the pretend agent holds in mind. Segments are measured with the token estimate; when they do
   not fit the (teaching-scale) window, the oldest chat messages drop first. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const WINDOW=2000;
const SYSTEM='You are a coding agent. Read files, make edits, run commands, and say what you did.';
const KINDS=['system','memory','skills','mcp','files','history','prompt'];
const seg=(kind,label,text)=>({kind,label,text,tokens:AQ.tokens.estimate(text)});

/* folders: loaded folder memory files; skills: loaded skill bodies [{name, body}] */
function setupSegments(setup,folders=[],skills=[]){
  return [
    seg('memory','CLAUDE.md',setup.memory),
    ...folders.map(f=>seg('memory',f.path,f.text)),
    seg('skills','Skills (names and descriptions)',setup.skills.map(s=>s.name+': '+s.description).join('\n')),
    ...skills.map(s=>seg('skills','Skill: '+s.name,s.body)),
    seg('mcp','MCP servers',setup.mcp.map(m=>m.name+': '+m.tools.join(', ')).join('\n'))
  ];
}
/* folder memory counts whether or not the agent has read it yet, so bulk cannot be hidden there */
const setupTokens=setup=>AQ.tokens.estimate(setup.memory)+AQ.tokens.estimate(setup.raw)+setup.memoryFolders.reduce((n,f)=>n+AQ.tokens.estimate(f.text),0);

/* readFiles: [{path, text}]; opts.skills: loaded skills. Returns kept segments, dropped ones, and totals; peak is what the window was asked to hold */
function build(setup,prompt,history=[],readFiles=[],opts={}){
  const folders=AQ.config.folderMemory(setup,readFiles.map(f=>f.path));
  const asMemory=new Set(folders.map(f=>f.path));
  const all=[seg('system','System prompt',SYSTEM),...setupSegments(setup,folders,opts.skills||[]),
    seg('files','Files read',readFiles.filter(f=>!asMemory.has(f.path)).map(f=>f.path+'\n'+f.text).join('\n')),
    ...history.map((h,i)=>seg('history','Earlier message '+(i+1),String(h))),
    seg('prompt','Your prompt',prompt?prompt.raw:'')];
  let demand=all.reduce((n,s)=>n+s.tokens,0),total=demand;
  const dropped=[];
  while(total>WINDOW){
    const i=all.findIndex(s=>s.kind==='history');
    if(i<0)break;
    const [d]=all.splice(i,1);dropped.push(d);total-=d.tokens;
  }
  return {segments:all,dropped,total,peak:demand,limit:WINDOW};
}

function rules(ctx,scenario){
  const out=[];
  for(const s of ctx.segments)if(s.kind==='history')for(const l of s.text.split('\n')){const r=AQ.config.parseConstraint(l,scenario);if(r.ok)out.push(r.c);}
  return out;
}

AQ.context={WINDOW,KINDS,build,rules,setupSegments,setupTokens};
})();
