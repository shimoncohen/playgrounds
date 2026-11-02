/* Agent Quest context: what the pretend agent holds in mind. Segments are measured with the token estimate; when they do
   not fit the (teaching-scale) window, the oldest chat messages drop first. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const WINDOW=2000;
const SYSTEM='You are a coding agent. Read files, make edits, run commands, and say what you did.';
const KINDS=['system','memory','skills','mcp','files','history','prompt'];
const seg=(kind,label,text)=>({kind,label,text,tokens:AQ.tokens.estimate(text)});

function setupSegments(setup){
  return [
    seg('memory','CLAUDE.md',setup.memory),
    seg('skills','Skills (names and descriptions)',setup.skills.map(s=>s.name+': '+s.description).join('\n')),
    seg('mcp','MCP servers',setup.mcp.map(m=>m.name+': '+m.tools.join(', ')).join('\n'))
  ];
}
const setupTokens=setup=>AQ.tokens.estimate(setup.memory)+AQ.tokens.estimate(setup.raw);

/* readFiles: [{path, text}]. Returns kept segments, dropped ones, and totals; peak is what the window was asked to hold */
function build(setup,prompt,history=[],readFiles=[]){
  const all=[seg('system','System prompt',SYSTEM),...setupSegments(setup),
    seg('files','Files read',readFiles.map(f=>f.path+'\n'+f.text).join('\n')),
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
