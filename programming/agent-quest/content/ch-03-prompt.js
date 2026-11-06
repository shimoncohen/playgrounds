/* Agent Quest chapter 3: prompt structure. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const BASE='Goal: fix the rounding bug in src/price.js';
const EXAMPLES=['goal','donewhen','constraints','files','examples'];
const ALL=['goal','donewhen','constraints','files','examples','plan'];

AQ.CH.push({
  name:'Prompt structure',badge:'Prompt Writer',tier:'core',
  intro:'A good prompt is a few small, exact lines. You will show the agent a sample instead of describing it, decide how narrowly to point it, learn when too much detail backfires, and ask to see a plan before anything changes. Each mission runs the pretend agent, so you can see what every line does.',
  learned:['Examples','Specific versus general','Constraints that leave room','Plan'],
  missions:[
    {
      title:'Show, do not describe',scenario:'changelog',kind:'prompt',fields:EXAMPLES,
      goal:'The agent must add a changelog entry for the rounding fix, in the same style as the entries the project already has. Words are a poor way to describe a format, so show it one: point the agent at a file that already has the right style. Look in <code>docs/</code> for the sample.',
      how:[
        'The line <code>Examples: docs/changelog-sample.md</code> shows the agent a finished sample, and it copies the format of that sample.',
        '<code>Examples:</code> is the field for sample files. Separate several paths with commas.',
        '<code>docs/changelog-sample.md</code> is a file whose entries already look right. A file in the wrong style teaches the wrong format.',
        'The agent copies the shape, not the content: here, a dash and a short label before the colon.'
      ],
      explain:'An example beats a description. One sample shows the length, wording and layout in one go. But the agent copies <i>whatever</i> you show it, so a sample in the wrong style gives you the wrong format. Every path in <code>Examples</code> has to exist in the project.',
      hint:'There are two candidates in <code>docs/</code>. Pick the one that looks like a changelog.',
      answer:'Examples: docs/changelog-sample.md',
      wrong:'Examples: docs/old-notes.md',
      lazy:'Examples: see above'
    },
    {
      title:'Name the file, not the folder',scenario:'scope',kind:'prompt',fields:EXAMPLES,
      goal:'The shop total rounds down. The project has many files, and the agent may hold at most '+AQ.PEAK+' tokens at once. Find the file that holds <code>total()</code> in the Files panel, and point the agent at it and nothing else.',
      how:[
        'The line <code>Files: src/price.js</code> makes the agent read the one file with the bug, so it fixes it and holds very little.',
        '<code>Files:</code> scopes what the agent reads. The narrower the scope, the smaller the context.',
        'A folder is too general: <code>src/</code> pulls in every report file. A neighbour is too specific in the wrong way: <code>src/util.js</code> is small, but the bug is not in it.',
        'No <code>Files</code> line at all is the most general of all: the agent opens everything.'
      ],
      explain:'Specific beats general when you know where the work is. A vague scope makes the agent read the whole project and fill its window. But specific has to be right: the narrowest path that still holds the fix. A tight scope on the wrong file means the bug stays.',
      hint:'Open the files in the Files panel and look for the one with <code>total()</code> in it.',
      answer:'Files: src/price.js',
      wrong:'Files: src/',
      lazy:BASE
    },
    {
      title:'When not to be specific',scenario:'ledger',kind:'prompt',fields:EXAMPLES,
      goal:'Some jobs are bigger than you know. Fixing the rounding in the shop\'s totals may take more than one file, and you were not told which. Guard the one thing that must not change, the database files in <code>migrations/</code>, and let the agent find out for itself what else needs fixing.',
      how:[
        'The two lines <code>Constraints: do not edit migrations/</code> and <code>Done when: run npm test</code> guard the one risky folder and leave the agent free to follow the tests wherever they lead.',
        '<code>do not edit migrations/</code> names what must never happen, instead of listing what may.',
        '<code>Done when: run npm test</code> sends the agent round the loop again until the tests pass, so it finds the second fix itself.',
        'There is no <code>Files</code> line: you do not know every file, so you do not guess.'
      ],
      explain:'Too much detail backfires. A rule like <code>only edit src/price.js</code> is exact, but when the fix spans a second file the agent is stopped from finishing. Name what must never happen, and let a check tell the agent what is left to do. Without the check, nobody knows the second file is still broken.',
      hint:'One line for the folder to protect, and one for a check that fails until every file is right.',
      answer:'Constraints: do not edit migrations/\nDone when: run npm test',
      wrong:'Constraints: only edit src/price.js\nDone when: run npm test',
      lazy:'Constraints: do not edit migrations/'
    },
    {
      title:'Plan first',scenario:'rollout',kind:'prompt',fields:ALL,
      goal:'Before an agent changes anything, you can ask to see its plan. Ask for the plan, read which files it wants to change, then approve it. The plan costs one extra step, and it is the cheapest moment to catch a wrong idea. Finish with a check, so the run is verified too.',
      how:[
        'The line <code>Plan: first</code> makes the agent write down which files it will change, and wait for you to approve before it edits anything.',
        '<code>Plan:</code> is the field, and <code>first</code> is the only setting. Leave the field off for no plan.',
        'The Run panel shows the plan and an Approve plan button. Nothing is edited until you press it.',
        '<code>Done when: run npm test</code> still goes last, so the approved run ends with a check.'
      ],
      explain:'With <code>Plan: first</code> the run pauses. A plan you never read protects nothing, so look at the files it lists before you approve. Planning does not make the agent smarter. It makes mistakes cheap, because nothing has changed yet.',
      hint:'Tick the Plan box in the form, add the check, run, then approve the plan in the Run panel.',
      answer:'Plan: first\nDone when: run npm test',
      wrong:'Plan: first\nConstraints: do not edit src/',
      lazy:'Done when: run npm test',
      check:(o,c)=>{
        const i=o.steps.findIndex(s=>s.type==='plan');
        if(i<0)return 'The agent started editing with no plan, so you had nothing to read first. Ask for the plan.';
        if(o.steps.slice(0,i).some(s=>s.type==='act'&&s.verb==='edit'))return 'The agent edited a file before it showed its plan.';
        const missing=['src/price.js','src/tax.js'].filter(f=>!o.steps[i].files.includes(f));
        if(missing.length)return 'The plan left out '+missing.join(' and ')+', so approving it would not fix everything.';
        return AQ.verdict(o,c);
      }
    }
  ]
});
})();
