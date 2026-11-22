/* Agent Quest context meter: a segmented bar with a text table of the same segments. Every part has its own pattern and a
   name in the table, so no meaning is colour-only. The bar is an estimate (chars/4) on a teaching-scale limit. Exposes window.AQMETER. */
(()=>{
'use strict';
const M=window.AQMETER=window.AQMETER||{};
const {el}=AQUI;
const NAMES={system:'System prompt',memory:'Memory file',skills:'Skills',mcp:'MCP servers',files:'Files read',history:'Earlier messages',prompt:'Your prompt'};

const bar=(parts,ctx,label,hidden)=>{
  const b=el('div','mbar');
  if(hidden)b.setAttribute('aria-hidden','true');
  else{
    b.setAttribute('role','meter');b.setAttribute('aria-label','Context used');
    b.setAttribute('aria-valuemin','0');b.setAttribute('aria-valuemax',String(ctx.limit));
    b.setAttribute('aria-valuenow',String(Math.min(ctx.total,ctx.limit)));b.setAttribute('aria-valuetext',label);
  }
  for(const p of parts)if(p.tokens>0){
    const s=el('span','s-'+p.kind);
    s.style.width=Math.min(100,p.tokens/ctx.limit*100)+'%';
    s.title=NAMES[p.kind]+': ~'+p.tokens+' tokens';
    b.append(s);
  }
  return b;
};

/* ctx: AQ.context.build(...) result; lastPeak: tokens held at the most recent run, or null */
M.render=({panel,strip},ctx,lastPeak)=>{
  const parts=AQ.context.KINDS.map(k=>({kind:k,tokens:ctx.segments.filter(s=>s.kind===k).reduce((n,s)=>n+s.tokens,0)}));
  const label='~'+ctx.total+' of '+ctx.limit+' tokens (estimate, chars/4)';
  panel.textContent='';
  panel.append(bar(parts,ctx,label,false),el('p','mlabel',label));
  const t=el('table','mtable');
  const head=el('tr');
  for(const h of ['Part','Tokens','Share'])head.append(el('th','',h));
  const thead=el('thead');
  thead.append(head);
  t.append(thead);
  const body=el('tbody');
  for(const p of parts){
    const tr=el('tr');
    const td=el('td');
    td.append(el('span','swatch s-'+p.kind),document.createTextNode(NAMES[p.kind]));
    tr.append(td,el('td','n','~'+p.tokens),el('td','n',Math.round(p.tokens/ctx.limit*100)+'%'));
    body.append(tr);
  }
  t.append(body);
  panel.append(t);
  if(ctx.dropped.length)panel.append(el('p','msim','Too much for the window: the oldest earlier messages were dropped.'));
  if(lastPeak!==null&&lastPeak!==undefined)panel.append(el('p','msim','Last run: the agent held at most ~'+lastPeak+' tokens.'));
  panel.append(el('p','msim','Simulated: this limit is teaching scale, not a real model\'s. Counts are estimates.'));
  strip.textContent='';
  strip.append(bar(parts,ctx,label,true),el('p','mlabel',label));
};
})();
