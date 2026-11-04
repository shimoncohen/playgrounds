/* Agent Quest scenarios for the personal path. The core and dev scenarios stay in scenarios.js; this file only adds keys and throws on a
   clash, so a later chapter cannot silently replace a shipped scenario. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};

/* The most one week of the digest job may cost, in tokens. One Monday run is about 100 (T), so it fits, and a second day already goes over.
   tests/agent/content-personal.test.mjs asserts T < WEEK < 5T for the measured one-run total, and 2T > WEEK. */
const WEEK=150;

/* Schedules and reminders. Every scenario here is scheduled: a schedule line must start the saved command the prompt uses, and the run
   is then unattended (anything but a read needs an allow line) and tagged schedule. The learner edits only schedule.txt,
   permissions.txt and the saved commands, all shipped here. */
const HEAD='# When each saved command starts, one line each: WHEN HH:MM use NAME\n';
const SCHEDULE='.claude/schedule.txt',ALLOW='.claude/permissions.txt';
const DIGESTCMD="Goal: write this week's digest into digest.md\nDone when: read digest.md\n";
const BACKUPCMD='Goal: copy the inbox note into a backup\n';
const DIGEST='Digest for this week:\n- call the dentist on Tuesday\n- buy tea for Friday\n';
const digestVfs=schedule=>({
  'CLAUDE.md':'# Home notes\nI keep my notes in notes/.\n',
  'notes/inbox.md':'Call the dentist on Tuesday.\nBuy tea for Friday.\n',
  'digest.md':'',
  '.claude/commands/weekly-digest.md':DIGESTCMD,
  '.claude/commands/backup-note.md':BACKUPCMD,
  [ALLOW]:'# what the scheduled jobs may do, one per line\nallow edit digest.md\n',
  [SCHEDULE]:HEAD+schedule
});
const writeDigest={
  task:"Write this week's digest from the inbox, as a scheduled job. Nobody is at the keyboard.",
  commands:{},tools:[],scheduled:true,
  script:[{verb:'read',target:'notes/inbox.md'},{verb:'edit',target:'digest.md',needs:['notes/inbox.md'],write:DIGEST}],
  hidden:[],
  accept:o=>(o.vfs.read('digest.md')||'').trim()?true:'The digest is still empty.'
};
const digest={...writeDigest,vfs:digestVfs('monday 09:00 use backup-note\n')};
const digestDaily={...writeDigest,vfs:digestVfs('daily 07:30 use weekly-digest\n')};

const remind={
  task:"Remind me about today's plan, as a scheduled job. Nobody is at the keyboard.",
  vfs:{
    'CLAUDE.md':'# Home notes\nI keep my notes in notes/.\n',
    'notes/today.md':'Today: dentist at 10:00, then tea with Dana.\n',
    '.claude/commands/morning-reminder.md':"Goal: remind me about today's plan\nPlan: first\nDone when: read notes/today.md\n",
    [ALLOW]:'# what the scheduled jobs may do, one per line\n',
    [SCHEDULE]:HEAD+'daily 08:00 use morning-reminder\n'
  },
  commands:{},tools:['calendar.list','calendar.create','calendar.delete'],scheduled:true,
  script:[{verb:'read',target:'notes/today.md'},{verb:'call',target:'calendar.create'},{verb:'call',target:'calendar.delete'}],
  hidden:[{verb:'call',target:'calendar.delete'}],
  accept:o=>o.calls.some(c=>c.target==='calendar.create')||'The reminder never reached the calendar.'
};

const personal={digest,digestDaily,remind};
for(const k of Object.keys(personal))if(AQ.vfs.own(AQ.scenarios,k))throw new Error('duplicate scenario key '+k);
Object.assign(AQ.scenarios,personal);
AQ.WEEK=WEEK;
})();
