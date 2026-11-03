/* Agent Quest chapter 14: CI and headless. Every scenario here is unattended: a Plan stalls and anything but a read needs an allow line.
   Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const JOB='Use: nightly-fix';
const JOBFILE='.claude/commands/nightly-fix.md';
const GOAL='Goal: fix the rounding bug in src/price.js\n';

AQ.CH.push({
  name:'CI and headless',badge:'Night Shift',tier:'dev',
  intro:'So far someone was always at the keyboard to approve a plan or answer a question. Teams also start the agent by itself, at night, to fix a small bug before the morning. Nobody is there to say yes. In this chapter you set up a job that can finish on its own: it waits for nothing, does only what it was allowed to do, and knows where to look.',
  learned:['Jobs with nobody there','Pre-approved actions','Pointing the job at the failure'],
  missions:[
    {
      title:'Nobody there to approve',scenario:'nightly',kind:'config',prompt:JOB,facts:['headless','ci'],
      goal:'A <b>headless</b> run starts from a command line, with no chat window. Teams often start one from a <b>CI</b> job, a task that a build server runs by itself, say every night. Nobody is there, so the run is <b>unattended</b>. Your nightly job calls the saved command <code>nightly-fix</code>, and that command asks the agent for a plan first. Change the command so the job can finish.',
      how:[
        'Deleting the line <code>Plan: first</code> from <code>.claude/commands/nightly-fix.md</code> lets the job go straight to the fix, with nobody needed to approve a plan.',
        '<code>Plan: first</code> makes the agent stop and wait for approval. In an unattended run nobody answers, so the Run panel shows the job stalled, and it ends blocked.',
        'The permissions file of the job, <code>.claude/permissions.txt</code>, already lists the two actions the job may take. Anything not listed is skipped, because nobody is there to say yes. The next mission has you write such a list.',
        'Keep the <code>Done when</code> line: it is how the job knows the fix works.'
      ],
      explain:'A plan waits for a person. At the keyboard you read it and say yes. In an unattended job nobody can, so the run stops at the plan and does nothing at all. A job that runs at night has to be written so it never needs to ask. This practice has no runner, no secrets and no exit codes: the job only stalls where a person would be needed.',
      hint:'Open <code>.claude/commands/nightly-fix.md</code> and take out the line that asks for a plan.',
      answer:{files:{[JOBFILE]:GOAL+'Done when: run npm test\n'}},
      wrong:{files:{[JOBFILE]:GOAL+'Plan: first\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        if(o.steps.some(s=>s.type==='stall'))return 'The job stopped at its plan and waited for an approval nobody could give. Take away what makes it wait.';
        if(o.status!=='done')return 'The job never finished a checked fix. Keep the check in the command.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Pre-approve exactly what it needs',scenario:'nightly-allow',kind:'config',prompt:JOB,facts:['permissions','headless'],
      goal:'With nobody to ask, the nightly job may only do what its permissions list says. The list in <code>.claude/permissions.txt</code> is empty, so the job can read files and do nothing else. The job has to change <code>src/price.js</code> and run <code>npm test</code>. It also tends to wander: it will try to rewrite <code>src/legacy/old.js</code> and run <code>npm run deploy</code>, which are not its job. Write the list.',
      how:[
        'The two lines <code>allow edit src/price.js</code> and <code>allow run npm test</code> in <code>.claude/permissions.txt</code> let the job change that one file and run the tests, and nothing else.',
        'A line is <code>allow</code>, a verb and a target, in the same shape as the <code>deny</code> lines of chapter 7. Reading files needs no line.',
        'A target covers itself and everything under it. A line <code>allow edit src/</code> would also let the job rewrite <code>src/legacy/old.js</code>, and <code>allow run npm</code> would let it deploy.',
        'Without a line for the check, the fix is written but nobody may run <code>npm test</code>, and the run ends <code>unverified</code>. The Run panel names the reason of each skipped action.'
      ],
      explain:'In a chat you answer each question the agent asks. A job cannot be asked, so you answer in advance: a list of exactly the actions it may take. Anything off the list is skipped, which is the safe default. Keep each line as narrow as the job: a file, not a folder, and one command, not a family of them. A real job has more kinds of permission than this practice shows.',
      hint:'Write one line for the edit and one for the check, each as narrow as it can be.',
      answer:{files:{'.claude/permissions.txt':'allow edit src/price.js\nallow run npm test\n'}},
      wrong:{files:{'.claude/permissions.txt':'allow edit src/\nallow run npm\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        if(!o.calls.some(x=>x.verb==='edit'&&x.target==='src/price.js'))return 'No edit was allowed, so nothing was fixed.';
        if(o.status!=='done'&&o.steps.some(s=>s.type==='skip'&&s.verb==='run'&&s.target==='npm test'&&s.by==='no one to ask'))return 'The fix was written but nobody allowed the check to run.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Tell the unattended job where to look',scenario:'nightly-scope',kind:'config',prompt:JOB,facts:['ci'],
      goal:'The nightly job must fix the rounding bug in <code>src/tax.js</code>. The failure of the last run is in <code>ci/last-run.log</code>. At the keyboard you would point the agent at it, but at night nobody does. The project is big: a job that reads all of it holds more than 400 tokens at once. Stay under that limit, and let the agent read the log before it edits.',
      how:[
        'The line <code>Files: ci/last-run.log, src/tax.js</code> in <code>.claude/commands/nightly-fix.md</code> tells the job to read the log of the last run and the file it must fix, and nothing else.',
        'A person would point the agent at the failure. A job at night has no person, so the command file carries the pointer.',
        'Without a <code>Files</code> line the job reads the whole project to find its way, which goes over 400 tokens. Naming only <code>src/tax.js</code> is small, but the agent never saw the log, so its edit is skipped as not seen yet.',
        'The Run panel shows which files were read before the edit.'
      ],
      explain:'A person at the keyboard can say "look at the log". A job at night cannot, so the command file says it with a <code>Files</code> line: the failure first, then the file to change. Naming the right files also keeps the run small, because the agent reads only those. This practice has no runner and no real log: the log is a file the job reads.',
      hint:'Add one <code>Files</code> line to the command that names the log and the file to fix.',
      answer:{files:{[JOBFILE]:'Goal: fix the rounding bug in src/tax.js\nFiles: ci/last-run.log, src/tax.js\nDone when: run npm test\n'}},
      wrong:{files:{[JOBFILE]:'Goal: fix the rounding bug in src/tax.js\nFiles: src/tax.js\nDone when: run npm test\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        if(o.steps.some(s=>s.type==='skip'&&s.by==='not seen yet'&&s.target==='src/tax.js'))return 'The agent never read the log the last run left. Point the job at it.';
        return AQ.verdict(o,c);
      }
    }
  ]
});
})();
