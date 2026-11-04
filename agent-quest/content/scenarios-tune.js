/* Agent Quest scenarios for the tune tier (chapters 21 to 23). Like scenarios-personal.js, this file only adds keys and throws on a clash.
   The learner edits only CLAUDE.md and .claude/ files, all shipped here. Every script starts with a read: an all-skipped script would end
   blocked instead of failed (#126). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const S=AQ.scenarios;

/* The most the agent may hold at once ("peak", in tokens), or the most a setup may weigh, for each mission. The measured answer sits under
   its limit; the rows that fail on size alone sit at least 8 over it (tests/agent/content-tune.test.mjs asserts both). */
AQ.TUNE={desc:98,dead:20,mcp:60};

/* 21.0 tuneDesc: the release-guard skill loads by when:, and its long description is paid for on every run. */
const LONGDESC='Loads for every release job. It blocks any edit to the migrations folder, so a release can never change the database tables or their history by accident, and it should be read before anything is shipped.';
const tuneDesc={...S.release,vfs:{...S.release.vfs,'.claude/skills/release-guard.md':'name: release-guard\ndescription: '+LONGDESC+'\nwhen: release\ndo not edit migrations/\n'}};

/* 21.1 tuneDead: three rule-shaped lines point at folders and commands this project no longer has, so the rule reader rejects them and they only cost tokens. */
const tuneDead={...S.tidy,vfs:{...S.tidy.vfs,'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not delete data/\ndo not edit old-api/\nonly edit billing/\nask before run npm run legacy-build\n'}};

/* 21.2 tuneMcp: the job needs one tool from two of five servers. Every listed tool is also in tools, so a kept tool is connected. */
const MCPTXT='calendar: list, create, delete, update, search, invite, decline, accept, reschedule, remind\nmail: read, send, search, archive, label, draft, reply, forward, snooze, unsubscribe\nbrowser: open, click, screenshot, scroll\ntracker: list_issues, create_issue, comment, close\nchat: post, read, react\n';
const MCPTOOLS=MCPTXT.trim().split('\n').flatMap(l=>{const [s,t]=l.split(': ');return t.split(', ').map(x=>s+'.'+x);});
const tuneMcp={
  task:"Read today's calendar and the newest mail.",
  vfs:{'CLAUDE.md':'','notes/today.md':'Today: dentist at 10:00, then tea with Dana.\n','.claude/mcp.txt':MCPTXT},
  commands:{},tools:MCPTOOLS,connected:true,
  script:[{verb:'read',target:'notes/today.md'},{verb:'call',target:'calendar.list'},{verb:'call',target:'mail.read'}],
  hidden:[],
  accept:o=>['calendar.list','mail.read'].every(t=>o.calls.some(c=>c.target===t))||'The agent did not both read the calendar and read the mail.'
};

const tune={tuneDesc,tuneDead,tuneMcp};
for(const k of Object.keys(tune))if(AQ.vfs.own(S,k))throw new Error('duplicate scenario key '+k);
Object.assign(S,tune);
})();
