/* Agent Quest chapter 16 (array index 15): Schedules and reminders, the first personal chapter. All three are config missions with a fixed
   prompt that uses one saved command. The scenarios are scheduled: the run starts only when a line in .claude/schedule.txt starts that
   command. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const SCHEDULE='.claude/schedule.txt',ALLOW='.claude/permissions.txt';
const HEAD='# When each saved command starts, one line each: WHEN HH:MM use NAME\n';
const fireOf=o=>o.steps.find(s=>s.type==='fire');
const cmdOf=(c,name)=>c.setup.commands.find(x=>x.name===name);
const badLine=c=>(c.setup.errors.find(e=>e.file===SCHEDULE)||{}).msg;
/* the saved command is not the lever of these missions: it must read as shipped, or an emptied command could still pass */
const edited=(c,name)=>{const x=cmdOf(c,name);return !x||x.text!==c.scenario.vfs['.claude/commands/'+name+'.md'];};
const skipOf=(o,target)=>o.steps.find(s=>s.type==='skip'&&s.target===target);

const WEEKDAYS='mon,tue,wed,thu,fri';
const DIGEST_ERR='The schedule reader ignored a line in .claude/schedule.txt: ';
const CHANGED='The saved command weekly-digest was changed. This mission is about when it starts, not what it does.';

AQ.CH.push({
  name:'Schedules and reminders',badge:'Clockwork',tier:'personal',
  intro:'So far you started every run yourself and watched it. A scheduled job starts by itself, at a time you choose, and then nobody is at the keyboard. In this chapter you write the line that sets the time, count what a job that repeats costs over a week, and get a reminder job ready to run alone.',
  learned:['Starting a job on a schedule','What a repeating job costs','A reminder that can run alone'],
  missions:[
    {
      title:'Set the schedule',scenario:'digest',kind:'config',prompt:'Use: weekly-digest',facts:['ci','permissions'],
      goal:'A <b>scheduled job</b> is a saved command that starts by itself at a set time. Your digest job is the saved command <code>weekly-digest</code> in <code>.claude/commands</code>: it writes this week\'s digest from your inbox. The file <code>.claude/schedule.txt</code> starts only <code>backup-note</code>, on Mondays, so the digest never runs. Nobody is at the keyboard when a scheduled job runs, which makes the run <b>unattended</b>: nobody can approve anything, so the job may do only what <code>.claude/permissions.txt</code> lists ahead of time. Its list already has <code>allow edit digest.md</code>. Make the digest start every weekday morning at 07:30.',
      how:[
        'The line <code>weekdays 07:30 use weekly-digest</code> in <code>.claude/schedule.txt</code> starts the saved command <code>weekly-digest</code> at 07:30 on every weekday, Monday to Friday.',
        'One line is one start: when, a time and a saved command. The first word is <code>daily</code>, <code>weekdays</code> or a day name such as <code>monday</code>. The time has two digits for the hour and two for the minutes. The word <code>use</code> comes before the name of the command.',
        'The line that is already there, <code>monday 09:00 use backup-note</code>, starts a different command. A command that no line starts never runs, and the schedule step in the Run panel says so.',
        'A line the reader cannot make sense of is ignored. The Run panel shows the first such line, with the reason, under the schedule step. Compare the name with the files in <code>.claude/commands</code>.'
      ],
      explain:'A scheduled job is a saved command plus a time. This practice has no clock and starts nothing by itself: when you press Run, it plays the moment a schedule line starts the job, once. That run is unattended, so the edit of <code>digest.md</code> went ahead only because <code>allow edit digest.md</code> was already in the list. Real tools start such jobs from a scheduler or a build server, and their file formats differ from this one.',
      hint:'Add one line to <code>.claude/schedule.txt</code>: the days, the time, <code>use</code> and the name of the digest command.',
      answer:{files:{[SCHEDULE]:HEAD+'monday 09:00 use backup-note\nweekdays 07:30 use weekly-digest\n'}},
      wrong:{files:{[SCHEDULE]:HEAD+'monday 09:00 use backup-note\ndaily 07:30 use weekly-digest\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const bad=badLine(c),f=fireOf(o);
        if(bad)return DIGEST_ERR+bad+'.';
        if(!f||!f.entry)return 'No line in .claude/schedule.txt starts weekly-digest, so the job never ran. Add one.';
        if(edited(c,'weekly-digest'))return CHANGED;
        if(f.due.join()!==WEEKDAYS)return 'The digest should start on the five weekdays, but this schedule starts it on '+f.due.length+' day'+(f.due.length===1?'':'s')+' ('+f.due.join(', ')+').';
        const late=c.setup.schedule.find(s=>s.use==='weekly-digest'&&s.at!=='07:30');
        if(late)return 'The digest should be ready at 07:30, but a line starts it at '+late.at+'.';
        const skip=skipOf(o,'digest.md');
        if(skip)return skip.by==='no one to ask'?'The edit of digest.md was skipped because nobody was there to approve it. The job\'s permissions file already lists it, so put that line back.':'The edit of digest.md was skipped ('+skip.by+'), so the digest stayed empty.';
        if(o.status!=='done'||!(o.vfs.read('digest.md')||'').trim())return 'The job did not finish a checked digest. Look at the Run panel for the step that failed.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'A job that runs every day adds up',scenario:'digestDaily',kind:'config',prompt:'Use: weekly-digest',facts:['ci'],
      goal:'The digest only has to run once a week, on Monday. But the line in <code>.claude/schedule.txt</code> says <code>daily</code>, so it runs seven times a week. Every run costs tokens, and nobody is there to notice the bill grow: a week costs about the tokens of one run times the number of runs. Keep a week of the digest under '+AQ.WEEK+' tokens.',
      how:[
        'The line <code>monday 07:30 use weekly-digest</code> in <code>.claude/schedule.txt</code> starts the digest once a week, on Monday, in place of every day.',
        'The first word says on which days a line starts the job: <code>daily</code> is seven days, <code>weekdays</code> is five and a day name such as <code>monday</code> is one. Each of those days is one run.',
        'The schedule step in the Run panel counts the runs a week. A week costs about as much as one run times that number, so seven runs cost seven times as much.',
        'Change the daily line instead of adding to it. The days of every line that starts a command add up, so a Monday line below a daily one still runs seven times. The command in <code>.claude/commands/weekly-digest.md</code> stays as it is.'
      ],
      explain:'A schedule makes a cheap job expensive by repetition. A run of about a hundred tokens costs seven times that when it fires every day, and nobody sees it happen because nobody is there. The days of every line that starts the same command are added together, so a second line does not replace the first. Pick the least often that still does the job. The token counts here are this practice\'s own estimate, not a real price.',
      hint:'Change the first word of the line so the digest starts on one day only.',
      answer:{files:{[SCHEDULE]:HEAD+'monday 07:30 use weekly-digest\n'}},
      wrong:{files:{[SCHEDULE]:HEAD+'weekdays 07:30 use weekly-digest\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const bad=badLine(c),f=fireOf(o);
        if(bad)return DIGEST_ERR+bad+'.';
        if(!f||!f.entry)return 'No line in .claude/schedule.txt starts weekly-digest, so the digest never runs. It has to run on Mondays.';
        if(edited(c,'weekly-digest'))return CHANGED;
        const week=AQ.weekTokens(o);
        if(f.due.length>1)return 'The digest runs '+f.due.length+' times a week ('+f.due.join(', ')+'), about '+week+' tokens'+(week>AQ.WEEK?'. The limit is '+AQ.WEEK:'')+'. It only has to run on Monday.';
        if(f.due[0]!=='mon')return 'The digest has to run on Monday, but this schedule starts it on '+f.due[0]+'.';
        if(week>AQ.WEEK)return 'Even one run a week costs about '+week+' tokens here, over the limit of '+AQ.WEEK+'. Trim what the setup carries.';
        if(o.status!=='done'||!(o.vfs.read('digest.md')||'').trim())return 'The job did not finish a checked digest. Look at the Run panel for the step that failed.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Ready to run with nobody there',scenario:'remind',kind:'config',prompt:'Use: morning-reminder',facts:['permissions','ci'],
      goal:'Every morning at 08:00 a scheduled job should add a reminder for today\'s plan to your calendar. The job is the saved command <code>morning-reminder</code> in <code>.claude/commands</code>, and <code>.claude/schedule.txt</code> already starts it every day. But the command asks for a plan first, and nobody is there to approve one. Fix the command so the job can finish, and give it permission to add the event. It also tries to delete an event, which is not its job.',
      how:[
        'Two changes make the job finish: delete the line <code>Plan: first</code> from <code>.claude/commands/morning-reminder.md</code>, and add <code>allow call calendar.create</code> to <code>.claude/permissions.txt</code>.',
        'The schedule starts the job with nobody at the keyboard, so the run is unattended. A plan waits for a person, and none comes: the job stalls at the plan and does nothing.',
        'An unattended job may read on its own, but anything that changes something needs an <code>allow</code> line. A tool is written as <code>call</code> and the server and tool names, so <code>allow call calendar.create</code> lets the job add an event and nothing else.',
        'A shorter line, <code>allow call calendar</code>, covers every tool of the calendar server, delete included. Keep the <code>Done when</code> line in the command: it is how the job knows it read the plan.'
      ],
      explain:'The schedule line only decides when the job starts. What the job may do is decided as in chapter 14: no plan to wait on, and a list of the actions it may take. Allow the one tool the job needs, not the whole server. This practice has no clock and no real calendar: a call is only recorded.',
      hint:'Take out the line that asks for a plan, then add one <code>allow</code> line for the one tool that adds the event.',
      answer:{files:{'.claude/commands/morning-reminder.md':"Goal: remind me about today's plan\nDone when: read notes/today.md\n",[ALLOW]:'# what the scheduled jobs may do, one per line\nallow call calendar.create\n'}},
      wrong:{files:{'.claude/commands/morning-reminder.md':"Goal: remind me about today's plan\nDone when: read notes/today.md\n"}},
      lazy:{files:{}},
      check:(o,c)=>{
        if(o.steps.some(s=>s.type==='stall'))return 'The job stopped at its plan and waited for an approval nobody could give. Take away what makes it wait.';
        const bad=badLine(c),f=fireOf(o);
        if(bad)return DIGEST_ERR+bad+'.';
        if(!f||!f.entry)return 'No line in .claude/schedule.txt starts morning-reminder, so the job never ran. Keep the line that starts it.';
        const cmd=cmdOf(c,'morning-reminder'),fields=cmd?AQ.config.splitFields(cmd.text).fields:null;
        if(!fields||fields.plan)return 'The saved command still asks for a plan first.';
        if(fields.donewhen===null)return 'The saved command lost its Done when line, so the job has no way to know it read the plan. Keep it in the command.';
        const skip=skipOf(o,'calendar.create');
        if(!o.calls.some(x=>x.target==='calendar.create'))return skip&&skip.by==='no one to ask'?'The job wanted to call calendar.create, but nobody was there to approve it. List the permission ahead of time.':'The job never added the event to the calendar.'+(skip?' The call was skipped ('+skip.by+').':'');
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        return o.status==='done'?true:'The job did not finish a checked run.';
      }
    }
  ]
});
})();
