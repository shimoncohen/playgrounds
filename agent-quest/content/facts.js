/* Agent Quest dated facts: claims about real agent tools change quickly, so each one lives here with the page it comes from
   and the day it was last checked. Chapters name facts by id. Nothing here reads the clock: the page passes "now" in. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const STALE_DAYS=90;
const list=[
  {id:'tool-use',text:'A language model asks for an action by naming a tool and its arguments; the application runs it and sends the result back.',docUrl:'https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview',checked:'2026-11-01'},
  {id:'memory-files',text:'Claude Code reads CLAUDE.md memory files into its context at the start of a session; a CLAUDE.md in a subfolder loads once Claude reads, writes or edits a file in that folder.',docUrl:'https://docs.claude.com/en/docs/claude-code/memory',checked:'2026-11-02'},
  {id:'skills',text:'Claude Code skills are folders with a SKILL.md file: their names and descriptions are available up front, and the full instructions load when a skill is used.',docUrl:'https://docs.claude.com/en/docs/claude-code/skills',checked:'2026-11-02'},
  {id:'mcp',text:'The Model Context Protocol (MCP) lets Claude Code connect to outside tools and data sources through servers.',docUrl:'https://docs.claude.com/en/docs/claude-code/mcp',checked:'2026-11-02'},
  {id:'hooks',text:'Claude Code hooks run your own commands at set points, such as before a tool is used, and can stop that tool use.',docUrl:'https://docs.claude.com/en/docs/claude-code/hooks-guide',checked:'2026-11-02'},
  {id:'subagents',text:'Claude Code subagents are assistants with their own instructions and context window, and each one can use its own model.',docUrl:'https://docs.claude.com/en/docs/claude-code/sub-agents',checked:'2026-11-02'},
  {id:'plugins',text:'A Claude Code plugin bundles skills, subagents, hooks and MCP servers so Claude Code installs and loads them as one unit.',docUrl:'https://docs.claude.com/en/docs/claude-code/plugins',checked:'2026-11-02'},
  {id:'permissions',text:'Claude Code asks for permission before many actions, and permission rules can allow or deny specific tools and commands.',docUrl:'https://docs.claude.com/en/docs/claude-code/permissions',checked:'2026-11-02'}
];
const byId=id=>list.find(f=>f.id===id)||null;
const oldest=facts=>facts.reduce((a,f)=>(!a||f.checked<a.checked?f:a),null);
/* now: milliseconds since 1970 (the caller's clock) */
const stale=(facts,now,days=STALE_DAYS)=>{const o=oldest(facts);return !!o&&(now-Date.parse(o.checked+'T00:00:00Z'))/864e5>days;};

AQ.FACTS=list;
AQ.facts={byId,oldest,stale,STALE_DAYS};
})();
