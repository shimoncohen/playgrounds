/* Agent Quest chapter 20 (array index 19): Personal skills and commands. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>').
   Positions in comments are [chapter, mission], both 0-based; the cards say the in-game label, which is one more on each. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const DEV=['goal','donewhen','constraints','files','examples','plan','use'];
const REVIEW='.claude/commands/weekly-review.md',TONE='.claude/skills/tone.md',QUIET='.claude/skills/quiet-hours.md';
const ARCHIVE='archive/2024-w44.md',LAST='notes/last-week.md';
const FILLED="Goal: archive last week's notes\nConstraints: do not delete notes/this-week.md\nDone when: read archive/2024-w44.md\n";
const quietHours=when=>AQ.scenarioKit.skillFile('quiet-hours',when,'do not call calendar.delete\n');
const cmdOf=(c,name)=>c.setup.commands.find(x=>x.name===name);
const commandUsed=(c,name)=>c.prompt.commands.some(x=>x.name===name);
const skipBy=(o,by)=>o.steps.some(s=>s.type==='skip'&&s.by===by);

AQ.CH.push({
  name:'Personal skills and commands',badge:'Pocket Toolsmith',tier:'personal',
  intro:'Some chores come round every week, and some rules should follow a job wherever it goes. In this chapter you save a weekly chore as a command, give a scheduled job a skill that keeps it quiet, and tell a command from a skill by who starts it.',
  learned:['A weekly chore saved as a command','A skill for a scheduled job','Command or skill'],
  missions:[
    {
      title:'Save the weekly chore as a command',scenario:'weeklyReview',kind:'config',prompt:'Use: weekly-review',facts:['commands'],
      goal:'Every week you archive last week\'s notes and clear the old note out, and you never touch this week\'s note. A <b>slash command</b> is a saved prompt: a file in <code>.claude/commands/</code> whose name is the name of the command, as in mission 12.1. Your chore is the command <code>weekly-review</code>, and the run calls it with <code>Use: weekly-review</code>. But its file is empty, so nothing guards <code>notes/this-week.md</code> and nothing checks the archive. Put the goal, the rule and the check inside the command.',
      how:[
        'The three lines <code>Goal: archive last week\'s notes</code>, <code>Constraints: do not delete notes/this-week.md</code> and <code>Done when: read archive/2024-w44.md</code> in <code>.claude/commands/weekly-review.md</code> save the whole chore. Every run that calls <code>weekly-review</code> carries its rule and its check.',
        'The file holds lines in the same shape as a prompt, one field to a line. The name of the file, without <code>.md</code>, is what <code>Use</code> calls.',
        'Mind how wide the rule is. <code>do not delete notes/</code> also stops the delete of last week\'s note, so the old note is never cleared out. Name the one note to keep.',
        'The Run panel shows the command step first. Then last week\'s note goes, this week\'s note is skipped, and the check reads the archive back.'
      ],
      explain:'A command is a chore written once. The rule that keeps this week\'s note safe now travels with the chore: whoever calls <code>weekly-review</code>, whenever they do, gets the same rule and the same check. It is the guard of mission 12.1 on your own chore. This practice has no command arguments: a command is only its lines, added to the prompt. In real Claude Code you type <code>/</code> and the name, and a file in <code>.claude/commands/</code> is now the older form of a skill.',
      hint:'Open <code>.claude/commands/weekly-review.md</code> and add a goal line, a rule line that names the one note to keep, and a check line that reads the archive.',
      answer:{files:{[REVIEW]:FILLED}},
      wrong:{files:{[REVIEW]:"Goal: archive last week's notes\nConstraints: do not delete notes/\nDone when: read archive/2024-w44.md\n"}},
      lazy:{files:{}},
      check:(o,c)=>{
        const cmd=cmdOf(c,'weekly-review'),f=cmd&&AQ.config.splitFields(cmd.text).fields;
        if(!f||!f.constraints.some(l=>AQ.config.parseConstraint(l,c.scenario).ok))return 'The saved command weekly-review holds no rule. Put the rule that keeps this week\'s note inside weekly-review.md.';
        if(f.donewhen===null)return 'The saved command weekly-review holds no Done when line, so nothing checks the archive. Put the check inside weekly-review.md.';
        if(o.vfs.read(LAST)!==null)return 'Last week\'s note is still in notes/: its delete was skipped. The rule must keep this week\'s note and nothing else.';
        if(!(o.vfs.read(ARCHIVE)||'').trim())return 'The archive is still empty: the agent could not write last week\'s note into it.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'A skill for the scheduled job',scenario:'quiet',kind:'config',prompt:'Use: weekly-review',facts:['skills'],
      goal:'Every evening at 20:00 a scheduled job runs the saved command <code>weekly-review</code>. It adds this week\'s reminders to your calendar with <code>calendar.create</code>, and it also tries <code>calendar.delete</code>, which is never part of the job. Nobody is at the keyboard, so the run is <b>unattended</b>, and it may do only what <code>.claude/permissions.txt</code> lists. The leftover line <code>allow call calendar</code> in that list allows the whole calendar, delete included. The skill <code>quiet-hours</code> holds the rule that stops the delete, but its <code>when:</code> line names the wrong kind of job. Fix the line so the skill loads for this job.',
      how:[
        'Changing <code>when: docs</code> to <code>when: schedule</code> in <code>.claude/skills/quiet-hours.md</code> loads the skill for this job, so its rule <code>do not call calendar.delete</code> holds. The reminder is still made and the delete is skipped.',
        'A run that a schedule line starts counts as a <code>schedule</code> job, whatever the saved command does. A skill with <code>when: schedule</code> loads on every such run, and the Run panel shows a step that says the skill loaded.',
        'The list is not the lever here. Narrowing <code>allow call calendar</code> to <code>allow call calendar.create</code> would also stop the delete, because nobody is there to approve it, but this mission asks for the skill. The rule of a loaded skill is checked first.',
        'A wrong kind keeps the skill asleep. <code>when: review</code> never matches a scheduled run, so the delete goes ahead.'
      ],
      explain:'A rule can live in a skill, and the skill loads only for the kind of job it names. A scheduled run is the kind <code>schedule</code>, so one skill can keep every scheduled job quiet, whatever command the schedule starts. The rule of a loaded skill is checked before the permission list, which is why the delete is skipped although the list allows it. This practice matches the <code>when:</code> line exactly, and it has no clock: Run plays the moment the schedule line starts the job, once.',
      hint:'Open <code>.claude/skills/quiet-hours.md</code> and change only the <code>when:</code> line, to the kind of job a schedule starts.',
      answer:{files:{[QUIET]:quietHours('schedule')}},
      wrong:{files:{[QUIET]:quietHours('review')}},
      lazy:{files:{}},
      check:(o,c)=>{
        const f=o.steps.find(s=>s.type==='fire');
        if(!f||!f.entry)return 'No line in .claude/schedule.txt starts weekly-review, so the job never ran.'+(f&&f.why?' The reader ignored a line: '+f.why+'.':' Keep the line that starts it.');
        if(!o.steps.some(s=>s.type==='skill'&&s.name==='quiet-hours'&&s.loaded===true))return 'The quiet-hours skill never loaded. A scheduled run counts as a schedule job, so the when: line of the skill has to name that kind.';
        if(!skipBy(o,'skill quiet-hours'))return 'The quiet-hours skill loaded, but its rule stopped nothing. Keep its do not call calendar.delete line.';
        if(o.violations.length)return AQ.verdict(o,c);
        const make=o.steps.find(s=>s.type==='skip'&&s.target==='calendar.create');
        if(!o.calls.some(x=>x.target==='calendar.create'))return 'Nothing created the reminder: calendar.create was skipped ('+(make?make.by:'never called')+'). A scheduled run needs an allow line for the call it must make.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Command or skill?',scenario:'chores',kind:'prompt',fields:DEV,facts:['commands','skills'],
      goal:'Your chores now live in two kinds of file. The saved command <code>weekly-review</code> in <code>.claude/commands/</code> holds the weekly chore, and you call it by name, as a slash command. The skill <code>tone</code> in <code>.claude/skills/</code> holds a house rule, and it loads by itself when its <code>when:</code> line matches the job. Today the agent archives last week\'s notes, and it must not delete <code>notes/this-week.md</code>. It also wants to edit <code>notes/index.md</code>. Open both files, see what each one guards, and call the one you need, by name.',
      how:[
        'The line <code>Use: weekly-review</code> adds the lines of the command to your prompt: the rule that guards <code>notes/this-week.md</code> and the check that reads the archive. The skill needs no call. This is a <code>docs</code> job, so it loads by itself and its rule keeps the agent away from <code>notes/index.md</code>.',
        'A command is called by name with <code>Use</code>. A skill is picked by its <code>when:</code> line. <code>Use: tone</code> is accepted, but it does nothing here: the skill loads with or without it, and it says nothing about this week\'s note.',
        'Typing the rule and the check into the prompt yourself would guard the note, but the mission wants the saved command called. Leave both files as they are: they are the choice, not the task.',
        'The Run panel shows the skill step, then the command step. Then the delete of this week\'s note and the edit of the index are skipped, each by the file that holds its rule.'
      ],
      explain:'Both kinds of file hold rules, and they differ in who starts them. A command is a chore you start by name, so it suits a job you repeat. A skill is advice that loads when the job matches, so it suits a rule that should follow many jobs without anyone remembering to call it. Here the chore is the command and the house rule is the skill. This practice has no command arguments, and it matches the <code>when:</code> line of a skill exactly.',
      hint:'Read what each file guards, then call the one that guards <code>notes/this-week.md</code>.',
      answer:'Use: weekly-review',
      wrong:'Use: tone',
      lazy:'',
      check:(o,c)=>{
        if(!commandUsed(c,'weekly-review'))return c.prompt.constraints.length?'You typed the rule yourself. This mission is about calling the saved command weekly-review with Use.':'The saved command weekly-review was never called, so nothing guards notes/this-week.md. Call the command by name with Use: a skill is not called by name.';
        const same=p=>o.vfs.read(p)===c.scenario.vfs[p];
        if(!same(REVIEW)||!same(TONE))return 'You changed the saved command or the skill. This mission is about choosing between them as they are.';
        if(!o.steps.some(s=>s.type==='skill'&&s.name==='tone'&&s.loaded===true))return 'The skill tone never loaded, so its rule did not keep the agent away from notes/index.md.';
        return AQ.verdict(o,c);
      }
    }
  ]
});
})();
