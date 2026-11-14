/* Agent Quest scenarios for the tune tier (chapters 21 to 23). Like scenarios-personal.js, this file only adds keys and throws on a clash.
   The learner edits only CLAUDE.md and .claude/ files, all shipped here. Every script starts with a read: an all-skipped script would end
   blocked instead of failed (#126). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const S=AQ.scenarios;

/* The most the agent may hold at once ("peak", in tokens), or the most a setup may weigh, for each mission. The measured answer sits under
   its limit; the rows that fail on size alone sit at least 8 over it (tests/agent/content-tune.test.mjs asserts both). For rare and cmd the one
   duplicated rule line that must pass is the high point under the limit, so each checklist step is long enough for a single step left behind to clear it by 8. */
AQ.TUNE={desc:98,dead:20,mcp:60,dup:105,rare:97,cmd:90};

const LONGDESC='Loads for every release job. It blocks any edit to the migrations folder, so a release can never change the database tables or their history by accident, and it should be read before anything is shipped.';
const tuneDesc={...S.release,vfs:{...S.release.vfs,'.claude/skills/release-guard.md':'name: release-guard\ndescription: '+LONGDESC+'\nwhen: release\ndo not edit migrations/\n'}};

/* tuneDead: three rule-shaped lines point at folders and commands this project no longer has, so the rule reader rejects them and they only cost tokens. */
const tuneDead={...S.tidy,vfs:{...S.tidy.vfs,'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not delete data/\ndo not edit old-api/\nonly edit billing/\nask before run npm run legacy-build\n'}};

/* tuneMcp: the job needs one tool from two of five servers. */
const MCPTXT='calendar: list, create, delete, update, search, invite, decline, accept, reschedule, remind\nmail: read, send, search, archive, label, draft, reply, forward, snooze, unsubscribe\nbrowser: open, click, screenshot, scroll\ntracker: list_issues, create_issue, comment, close\nchat: post, read, react\n';
const tuneMcp={
  task:"Read today's calendar and the newest mail.",
  vfs:{'CLAUDE.md':'','notes/today.md':'Today: dentist at 10:00, then tea with Dana.\n','.claude/mcp.txt':MCPTXT},
  commands:{},tools:[],
  script:[{verb:'read',target:'notes/today.md'},{verb:'call',target:'calendar.list'},{verb:'call',target:'mail.read'}],
  hidden:[],
  accept:o=>['calendar.list','mail.read'].every(t=>o.calls.some(c=>c.target===t))||'The agent did not both read the calendar and read the mail.'
};

/* Chapter 22: the tidy script (read, fix, delete the backup) on a bugfix job. The delete is what the daily rule stops. */
const TIDY={...S.tidy,tag:'bugfix'};
const NOTES='# Shop notes\nPrices are in dollars.\n';
const skillFile=AQ.scenarioKit.skillFile;

const GUARD='do not delete data/\nWhy: data/ holds the backups the shop restores from after a crash.\n';
const tuneDup={...TIDY,vfs:{...S.tidy.vfs,'CLAUDE.md':NOTES+GUARD,'src/CLAUDE.md':GUARD,'.claude/skills/data-guard.md':skillFile('data-guard','bugfix',GUARD)}};

const CHORES=['Bump the version in package.json to the number the shop team agreed on for this release.','Update the changelog with the new entries, one short line for each change since the last release.','Tag the commit with the version number, so anyone can find exactly what was shipped.','Copy the build to the shop server, into the folder the checkout page is served from.','Restart the checkout service after copying, so shoppers get the new build right away.','Email the shop team that the release is out, and tell them what changed for the shoppers.'];
const rareVfs={...S.tidy.vfs,'migrations/001.sql':'create table totals;\n','.claude/notes.txt':'',
  'CLAUDE.md':NOTES+'do not delete data/\n## Release checklist\ndo not edit migrations/\n'+CHORES.join('\n')+'\n'};
const tuneRare={...TIDY,vfs:{...rareVfs,'.claude/skills/release-steps.md':skillFile('release-steps','release','')}};

/* tuneCmd: the same checklist, and a saved command that holds only a goal. The run does not call it, so the command costs nothing. */
const tuneCmd={...TIDY,vfs:{...rareVfs,'.claude/commands/release-prep.md':'Goal: prepare the release\n'}};

/* Chapter 23: three things the job does not need, each paid for on every run: standup notes in memory, an unused skill with a long description,
   and five MCP servers. The skill is asleep (when: docs) and no script step calls a tool, so only their lines are loaded. */
const STYLE='name: docs-style\ndescription: Style guide for every documentation page. It covers headings, tone, code samples, screenshots and the review steps, and it should be read before any page is edited or published.\nwhen: docs\n';
const SHOPMCP='calendar: list, create, delete\nmail: read, send, search\nbrowser: open, click, screenshot\ntracker: list_issues, create_issue\nchat: post, read\n';
const tuneMeasure={...TIDY,vfs:{...S.tidy.vfs,'CLAUDE.md':'do not delete data/\n'+AQ.scenarioKit.scraps('Standup note',5),'.claude/skills/docs-style.md':STYLE,'.claude/mcp.txt':SHOPMCP}};

const BIG=n=>'name: '+n+'\nmodel: large\n';
const tuneHelpers={...S.haystack,vfs:{...S.haystack.vfs,'.claude/agents/scout.md':BIG('scout'),'.claude/agents/architect.md':BIG('architect')}};

/* tuneBoth: the tidy script on a team-sized search. Not team itself, whose accept also caps the peak. */
const tuneBoth={...S.team,tag:'bugfix',script:S.tidy.script,hidden:S.tidy.hidden,accept:S.tidy.accept,
  vfs:{...S.tidy.vfs,'src/report.js':AQ.scenarioKit.filler('report',20),'src/export.js':AQ.scenarioKit.filler('export',20),'docs/notes.md':AQ.scenarioKit.filler('notes',20),'CLAUDE.md':tuneMeasure.vfs['CLAUDE.md'],'.claude/skills/docs-style.md':STYLE,'.claude/mcp.txt':SHOPMCP,
    '.claude/agents/scout.md':BIG('scout'),'.claude/agents/architect.md':BIG('architect')}};

const tune={tuneDesc,tuneDead,tuneMcp,tuneDup,tuneRare,tuneCmd,tuneMeasure,tuneHelpers,tuneBoth};
for(const k of Object.keys(tune))if(AQ.vfs.own(S,k))throw new Error('duplicate scenario key '+k);
Object.assign(S,tune);
})();
