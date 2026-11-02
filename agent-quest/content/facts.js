/* Agent Quest dated facts: claims about real agent tools change quickly, so each one lives here with the page it comes from
   and the day it was last checked. Chapters name facts by id. Nothing here reads the clock: the page passes "now" in. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const STALE_DAYS=90;
const list=[
  {id:'tool-use',text:'A language model asks for an action by naming a tool and its arguments; the application runs it and sends the result back.',docUrl:'https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview',checked:'2026-11-01'},
  {id:'memory-files',text:'Claude Code reads CLAUDE.md memory files into its context at the start of a session.',docUrl:'https://docs.claude.com/en/docs/claude-code/memory',checked:'2026-11-01'}
];
const byId=id=>list.find(f=>f.id===id)||null;
const oldest=facts=>facts.reduce((a,f)=>(!a||f.checked<a.checked?f:a),null);
/* now: milliseconds since 1970 (the caller's clock) */
const stale=(facts,now,days=STALE_DAYS)=>{const o=oldest(facts);return !!o&&(now-Date.parse(o.checked+'T00:00:00Z'))/864e5>days;};

AQ.FACTS=list;
AQ.facts={byId,oldest,stale,STALE_DAYS};
})();
