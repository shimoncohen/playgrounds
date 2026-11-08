/* Agent Quest chapter 5: skills and MCP. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const BUDGET=60,MCP_BUDGET=6;
const ALL=['goal','donewhen','constraints','files','examples','plan'];
const GUARD=(when)=>'name: release-guard\ndescription: release-guard skill\nwhen: '+when+'\ndo not edit migrations/\n';
const skippedBy=(o,by)=>o.steps.some(s=>s.type==='skip'&&s.by===by);
const loaded=(o,name)=>o.steps.some(s=>s.type==='skill'&&s.name===name&&s.loaded===true);

AQ.CH.push({
  name:'Skills and MCP',badge:'Pantry Key',tier:'core',
  story:'Dusty pantry crates hold rarely-needed advice and a rack of tools; wake only the right one, and find the pantry key.',
  intro:'Dusty pantry crates hold rarely-needed advice, and a rack beside them holds tools; only the right one should wake. Memory is loaded every time. A <b>skill</b> is an instruction file the agent loads only when the job matches it, so rarely-needed advice costs nothing the rest of the time. An <b>MCP</b> server hands the agent extra tools. Both are good, until you have too many. You will wake a skill up, trim skills that do not earn their place, trim a tool list, and let the agent use a tool.',
  learned:['Skills','when:','MCP servers','call'],
  missions:[
    {
      title:'Wake the skill up',scenario:'release',kind:'config',prompt:'Goal: ship the rounding fix in this release\nDone when: run npm test',facts:['skills'],
      goal:'A dusty pantry crate holds advice for releases. A <b>skill</b> is a short instruction file the agent loads only when the job matches it. The skill <code>release-guard</code> protects the database, but its <code>when:</code> line names the wrong kind of job. This job is a <code>release</code>. Fix the line so the skill loads and its rule holds.',
      how:[
        'Changing <code>when: docs</code> to <code>when: release</code> in <code>.claude/skills/release-guard.md</code> makes the skill load for this job, so its rule <code>do not edit migrations/</code> applies.',
        '<code>name:</code> and <code>description:</code> are always in the agent\'s head, so the agent knows the skill exists.',
        '<code>when:</code> names the kind of job the skill is for. When it matches, the rest of the file, the body, is loaded.',
        'The body lines in the rule shape then hold like the rules in <code>CLAUDE.md</code>. A skill that is loaded shows as a step in the Run panel.'
      ],
      explain:'A skill costs very little until it is needed: only its name and description are always loaded. The job kind is one of <code>bugfix</code>, <code>docs</code>, <code>review</code>, <code>test</code>, <code>release</code>, <code>refactor</code> or <code>schedule</code>. A skill whose <code>when:</code> never matches is dead weight: it is never loaded, and its rules never apply.',
      hint:'Open <code>.claude/skills/release-guard.md</code> and change only the <code>when:</code> line.',
      answer:{files:{'.claude/skills/release-guard.md':GUARD('release')}},
      wrong:{files:{'.claude/skills/release-guard.md':GUARD('bugfix')}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v+' A skill only loads when its when: line matches the job.';
        if(!loaded(o,'release-guard')||!skippedBy(o,'skill release-guard'))return 'The old code was safe, but not because the release-guard skill loaded. Make its when: line match this job.';
        return true;
      }
    },
    {
      title:'Two skills, one job',scenario:'twoskills',kind:'budget',prompt:'Goal: ship the rounding fix in this release\nDone when: run npm test',
      goal:'Two skills now claim the same job: <code>release-guard</code> and <code>release-notes</code>. The agent loads only the first one by file name and skips the other, yet the second still sits in the setup and costs tokens. Remove the one that never loads, and get the setup down to '+BUDGET+' tokens or fewer, with the guard still working.',
      how:[
        'Clearing <code>.claude/skills/release-notes.md</code> leaves one skill for the job, and the setup falls under the limit.',
        'Skills are ordered by file name, and only the first match loads. <code>release-guard</code> comes before <code>release-notes</code>, so it is the one that works.',
        'A skill that is skipped as a duplicate does nothing, but its file still counts toward the size.',
        'Keep the skill that loads. Clearing the first one would let the second take its place without the rule.'
      ],
      explain:'When two skills match the same job, only the first one loads, so the second is clutter. Spotting duplicates is a structural check: two skills with the same <code>when:</code> value. Remove one, and keep the one that carries the rule.',
      hint:'Clear the file of the skill that is not the first one by name.',
      answer:{files:{'.claude/skills/release-notes.md':''}},
      wrong:{files:{'.claude/skills/release-notes.md':'name: release-notes\ndescription: release-notes skill\nwhen: docs\n'+'Release note 1: we talked about packaging, shipping and tea samples.\n'.repeat(10)}},
      lazy:{files:{}},
      check:(o,c)=>{
        if(AQ.config.skillIssues(c.setup,c.scenario.tag).duplicate.length)return 'Two skills still match this job, so only one loads and the other is waste. Remove the duplicate.';
        return AQ.overBudget(c,BUDGET)||AQ.verdict(o,c);
      }
    },
    {
      title:'A skill that never matches',scenario:'unusedskill',kind:'budget',prompt:'Goal: ship the rounding fix in this release\nDone when: run npm test',
      goal:'The skill <code>docs-style</code> is for writing docs, but this job is a release, so it never matches. All the agent ever holds of it is its name and description, and its file still counts toward the size. Remove it and get the setup down to '+BUDGET+' tokens or fewer, with the guard still working.',
      how:[
        'Clearing <code>.claude/skills/docs-style.md</code> removes the skill that never loads, and the setup falls under the limit.',
        'The skill\'s <code>when: docs</code> does not match a release, so its body is never loaded and its rules never apply.',
        'Its name and description are still in the agent\'s head on every run, so it costs tokens for nothing.',
        'Leave <code>release-guard</code> alone: it is the skill that matches, and it carries the rule.'
      ],
      explain:'A skill nobody uses is the easiest saving in a setup. If its <code>when:</code> never matches your jobs, it only adds weight. Check every skill against the jobs you really give the agent, and cut the ones that never match.',
      hint:'Look at the <code>when:</code> line of each skill. Clear the file of the one that is not for a release.',
      answer:{files:{'.claude/skills/docs-style.md':''}},
      wrong:{files:{'.claude/skills/release-guard.md':''}},
      lazy:{files:{}},
      check:(o,c)=>{
        if(c.setup.skills.some(s=>s.name==='docs-style'))return 'The docs-style skill is still in the setup. Remove it, do not change it.';
        if(AQ.config.skillIssues(c.setup,c.scenario.tag).unused.length)return 'A skill that never matches this job is still in the setup. Remove it.';
        return AQ.overBudget(c,BUDGET)||AQ.verdict(o,c);
      }
    },
    {
      title:'Trim the tool list',scenario:'mcpTrim',kind:'budget',prompt:'Goal: list what is on the calendar',facts:['mcp'],
      goal:'An <b>MCP</b> server gives the agent extra tools, like a calendar or a mailbox. The names of all those tools are loaded into the agent\'s context on every run. The list in <code>.claude/mcp.txt</code> has grown to five servers, but today\'s job only needs to read the calendar. Cut the list down to '+MCP_BUDGET+' tokens or fewer, and keep the tool the job needs.',
      how:[
        'Keeping the single line <code>calendar: list</code> in <code>.claude/mcp.txt</code> leaves just the server and the tool the job needs.',
        'Each line is a server name, a colon and its tools, separated by commas.',
        'Every server and tool you leave costs tokens on every run, used or not.',
        'Dropping everything would save the most, but then the agent has no way to read the calendar.'
      ],
      explain:'MCP is the way real agents reach outside tools: a calendar, a mailbox, a browser, an issue tracker. Each server adds tools, and the tool names and descriptions take room in the context even when the job never touches them. Connect what the job needs, and no more.',
      hint:'Keep the calendar line and delete the other servers. The calendar can stay with fewer tools.',
      answer:{files:{'.claude/mcp.txt':'calendar: list\n'}},
      wrong:{files:{'.claude/mcp.txt':'mail: send\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        if(!c.setup.mcp.some(m=>m.name==='calendar'&&m.tools.includes('list')))return 'The calendar tool the job needs is gone from the list. Keep it.';
        return AQ.overBudget(c,MCP_BUDGET)||AQ.verdict(o,c);
      }
    },
    {
      title:'Let the agent call a tool',scenario:'calendar',kind:'prompt',fields:ALL,
      goal:'The agent will move Friday\'s 1:1 to Monday: delete the old event, create the new one, then email the attendees. You want the first two and not the email. Tools from an MCP server are used with a verb of their own, <code>call</code>. Stop the email, and make the agent read the calendar back at the end to prove the move.',
      how:[
        'The two lines <code>Constraints: do not call mail.send</code> and <code>Done when: call calendar.list</code> stop the email and make the agent read the calendar back last.',
        '<code>call</code> is the verb for a tool, and <code>mail.send</code> is the tool: the server <code>mail</code>, a dot, then the tool <code>send</code>.',
        '<code>do not call mail.send</code> bans only that one tool. The calendar tools still run.',
        '<code>Done when: call calendar.list</code> is a check made by calling a tool, instead of running a command.'
      ],
      explain:'A tool call is a verb and a target like any other action. A rule can ban one tool and leave the rest of its server alone. A check can call a tool too, which is how an agent reads back what it changed. Be careful not to ban the tool the job needs, or the move never happens.',
      hint:'Ban the email tool by its full name, and check by listing the calendar.',
      answer:'Constraints: do not call mail.send\nDone when: call calendar.list',
      wrong:'Constraints: do not call calendar.create\nDone when: call calendar.list',
      lazy:'Goal: move the 1:1 to Monday',
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        return o.status==='done'?true:'The agent moved the event but never read the calendar back, so nothing proves the move.';
      }
    }
  ]
});
})();
