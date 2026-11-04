/* Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). Positions in comments are [chapter, mission], both 0-based;
   the cards say the in-game label, which is one more on each. Every scenario here is connected: a tool is usable only when .claude/mcp.txt lists it. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const skipOf=(o,target)=>o.steps.find(s=>s.type==='skip'&&s.target===target);

AQ.CH.push({
  name:'Personal MCP',badge:'Inbox Keeper',tier:'personal',
  intro:'Your notes, your mail and your calendar can be reached by the agent only through the tools you connect. In this chapter you connect the notes tools a job calls, let the agent read your mail without ever sending it, and ask the calendar itself to prove that an event was really added.',
  learned:['Connecting your own apps','Reading without sending','Proving a change with a read-back'],
  missions:[
    {
      title:'Connect your notes',scenario:'notesApp',kind:'config',prompt:"Goal: save a note about the dentist visit",facts:['mcp'],
      goal:'The agent will search your notes for the dentist visit and then add a note about it, with the tools <code>notes.search</code> and <code>notes.add</code>. But no notes server is connected: <code>.claude/mcp.txt</code> lists only <code>calendar</code>. Connect a notes server with the tools the job calls.',
      how:[
        'The line <code>notes: search, add</code> in <code>.claude/mcp.txt</code> connects a server named <code>notes</code> with two tools, which the agent calls as <code>notes.search</code> and <code>notes.add</code>. The <code>calendar</code> line can stay.',
        'As in mission 13.1, one line is one server: its name, a colon and its tools, separated by commas.',
        'A tool nobody connected is skipped, and the Run panel says it is not connected. The rest of the run goes on without it.',
        'The tools have to be the ones the agent calls. A notes server with only <code>read</code> is connected, but <code>search</code> and <code>add</code> still are not.'
      ],
      explain:'Your notes are reachable only through the tools a server lists. Leave one out and the agent skips that call and carries on, so a note may be searched but never saved. This practice only matches names. It does not start a server or log in to your notes app, as a real connection does.',
      hint:'Add one line for a server called <code>notes</code>, with the two tools the job calls.',
      answer:{files:{'.claude/mcp.txt':'calendar: list\nnotes: search, add\n'}},
      wrong:{files:{'.claude/mcp.txt':'calendar: list\nnotes: read\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const s=o.steps.find(x=>x.type==='skip'&&/^notes\./.test(x.target)&&x.by==='not connected');
        if(s)return 'The agent called '+s.target+', but that tool is not connected. Connect the notes tools the job calls.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Read the mail, never send it',scenario:'inboxApp',kind:'config',prompt:"Goal: summarise today's mail",facts:['mcp','permissions'],
      goal:'The agent will summarise today\'s mail. It reads the mail with <code>mail.read</code>, and it also plans to answer a message with <code>mail.send</code>, which you never want without checking. <code>.claude/mcp.txt</code> lists only <code>calendar</code>. Connect the mail tools the job needs, and make sure the agent cannot send.',
      how:[
        'The line <code>mail: read, search</code> in <code>.claude/mcp.txt</code> connects the tools that read and search the mail and leaves <code>send</code> out. The agent reads the mail, and <code>mail.send</code> is skipped because it is not connected.',
        'You may keep <code>send</code> on the line if you stop it another way: <code>deny call mail.send</code> in <code>.claude/permissions.txt</code> does it, and so does <code>do not call mail.send</code> in the root <code>CLAUDE.md</code>.',
        'A tool is used with the verb <code>call</code>, as in mission 5.5. A rule with the verb <code>send</code> matches nothing the agent does.',
        'Mind the target. A rule on <code>mail</code> alone covers every tool of the server, <code>mail.read</code> too, and then nothing reads the mail.'
      ],
      explain:'Leaving a tool out of the list and denying it are two ways to the same result: mission 13.3 used the list. Here the send must stay out of reach while the reads stay connected, so a rule on the wrong verb or on the whole server stops the wrong thing. A real mail server usually offers all of its tools, which is why a rule is the usual way to keep the send away.',
      hint:'Connect what the job reads, and keep the send out of reach, by the list or by a rule.',
      answer:{files:{'.claude/mcp.txt':'calendar: list\nmail: read, search\n'}},
      wrong:{files:{'.claude/mcp.txt':'calendar: list\nmail: read, send\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const r=skipOf(o,'mail.read');
        if(r&&r.by==='not connected')return 'The agent wanted to read the mail, but mail.read is not connected. Connect the mail tools the job needs.';
        const v=o.violations.find(x=>x.target==='mail.send');
        if(v)return 'The agent did call mail.send, and nothing told it not to. A tool is used with the verb call, so a rule that stops it has to say call.';
        if(r)return 'The agent could not read the mail: mail.read was skipped ('+r.by+'). A rule on a whole server stops its reading tools too.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Prove the event is there',scenario:'agenda',kind:'config',prompt:'Goal: put the dentist visit on my calendar\nDone when: call calendar.list',facts:['mcp'],
      goal:'The agent will read <code>notes/dentist.md</code> and put the dentist visit on your calendar with <code>calendar.create</code>. A call that returns is not proof, so the job ends with the check <code>call calendar.list</code>, which looks for the event on the calendar. But <code>.claude/mcp.txt</code> connects only <code>list</code>. Connect what the job needs, so the event is made and the check finds it.',
      how:[
        'The line <code>calendar: list, create</code> in <code>.claude/mcp.txt</code> connects the tool that adds the event as well as the one the check calls. Both calls are made, and the check finds the dentist visit.',
        'The check is a tool call, as in mission 13.2. If <code>calendar.list</code> is not connected it is skipped, nothing proved the event is there, and the run ends <code>unverified</code>.',
        'If <code>calendar.create</code> is not connected the event is never added. The check runs, finds nothing and fails, so the run ends <code>failed</code>.',
        'Connecting another tool, such as <code>delete</code>, changes nothing here. The job never calls it.'
      ],
      explain:'A call that went through says the agent tried, not that the work is done. The read-back asks the calendar itself, so it passes only when the event is really there. In this practice the calendar is a short list, and the check looks for the visit by name; times and titles are not graded. A real calendar server would answer for itself.',
      hint:'Keep the <code>calendar</code> line and add the tool that creates the event.',
      answer:{files:{'.claude/mcp.txt':'calendar: list, create\n'}},
      wrong:{files:{'.claude/mcp.txt':'calendar: create\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const made=o.calls.some(x=>x.target==='calendar.create');
        const back=skipOf(o,'calendar.list');
        if(back&&back.by==='not connected')return made?'The event was created, but nothing read the calendar back, so nothing proved it is there. Connect the tool the check calls.':'Nothing is connected for the check to call, and no event was made. Connect the calendar tools the job needs.';
        const make=skipOf(o,'calendar.create');
        if(make&&o.status==='failed')return 'The read-back found no dentist visit, because calendar.create was skipped ('+make.by+'). Let the agent make the call.';
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        return o.status==='done'&&o.steps.some(x=>x.type==='act'&&x.tag==='verify'&&x.target==='calendar.list'&&x.ok)?true:'The calendar was not read back after the event was made. Let the check run and find the event.';
      }
    }
  ]
});
})();
