/* Agent Quest chapter 7: safety. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const BASE='Goal: fix the rounding bug in src/price.js';
const ALL=['goal','donewhen','constraints','files','examples','plan'];
const typedStops=(c,verb,target)=>!AQ.permissions.check({verb,target},{rules:[],hooks:[],allow:[]},c.prompt.constraints,{edited:[]}).allowed;
const skippedBy=(o,by,target)=>o.steps.some(s=>s.type==='skip'&&s.by===by&&(!target||s.target===target));

AQ.CH.push({
  name:'Safety',badge:'Spare Key',tier:'core',
  story:'A stranger\'s note in the post tells Cog to open the safe; lock the rules in and find the safe\'s spare key.',
  intro:'A stranger\'s note in the post tells Cog to open the safe, so the rules must be locked in. An agent can do real damage if nobody stops it, and sometimes the danger is in the text it reads, not in your prompt. In this chapter you will fence the agent in with permission rules, defend against instructions hidden in files, keep keys out of its reach, ask to review before it acts, and test that your own rules really work.',
  learned:['Permission rules','Prompt injection','Secrets','Ask before','Testing rules'],
  missions:[
    {
      title:'Deny it in the settings',scenario:'vault',kind:'config',prompt:BASE+'\nDone when: run npm test',facts:['permissions'],
      goal:'Mr. Ledbury keeps the shop\'s backups in one folder. While it tidies up, the agent wants to delete <code>data/backup.csv</code>. Instead of asking it nicely, set a <b>permission rule</b>: a line in <code>.claude/permissions.txt</code> that the agent is not allowed to cross. Stop the delete, and still let the price get fixed.',
      how:[
        'The line <code>deny delete data/</code> in <code>.claude/permissions.txt</code> means the agent may never delete anything inside <code>data/</code>.',
        '<code>deny</code> starts every line in this file.',
        '<code>delete</code> is the verb, and <code>data/</code> is the target: the folder, with everything in it.',
        'A denied action is skipped and the run goes on, just like a blocked rule in a prompt.'
      ],
      explain:'Permission rules are the settings of the agent, not part of a conversation. They are checked on every action, they are never dropped to make room, and the agent cannot talk its way past them. Keep them tight: a rule that also denies the fix leaves the agent unable to do its job.',
      hint:'Open <code>.claude/permissions.txt</code> and add one <code>deny</code> line below the heading.',
      answer:{files:{'.claude/permissions.txt':'# deny VERB TARGET\ndeny delete data/\n'}},
      wrong:{files:{'.claude/permissions.txt':'# deny VERB TARGET\ndeny edit src/\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        return skippedBy(o,'permission rule')?true:'The data was safe, but not because of a permission rule. Add the rule to the permissions file.';
      }
    },
    {
      title:'Words hidden in a file',scenario:'vendor',kind:'prompt',fields:ALL,
      goal:'A supplier\'s notes came in the post. To fix the bug the agent reads the vendor notes in <code>docs/vendor-api.md</code>. That file also contains text written like an order: an <b>injection</b>, which is an instruction hidden in something the agent reads, hoping the agent will obey it. Here it tells the agent to email out the customer list. Block the email, but still let the agent read the notes it needs.',
      how:[
        'The line <code>Constraints: do not send mail.send</code> bans the tool that would send the email, whatever the file says.',
        '<code>send</code> is a verb for sending something out. <code>mail.send</code> is the tool that does it.',
        'The vendor notes are still read, so the agent still learns how to fix the bug.',
        'Banning the read instead would be tempting, but the agent needs that file to do the job.'
      ],
      explain:'The agent cannot tell your instructions from instructions that happen to be in a file. Anything it reads can try to steer it: a web page, a file, a tool result. The defence is not to trust that text, but to limit what the agent is allowed to do, so that a hijacked agent cannot do real damage.',
      hint:'Ban the action the stranger\'s note asks for, by the full name of the tool.',
      answer:'Constraints: do not send mail.send',
      wrong:'Constraints: do not read docs/vendor-api.md',
      lazy:'Done when: run npm test',
      check:(o,c)=>{const v=AQ.verdict(o,c);return v===true&&!typedStops(c,'send','mail.send')?'The email was blocked, but by a rule outside your prompt. This mission is about the rule you type under Constraints.':v;}
    },
    {
      title:'Keys stay out of reach',scenario:'leak',kind:'prompt',fields:ALL,
      goal:'Dana\'s project has a file named <code>.env</code> that holds a <b>secret</b>: a key the agent should never need to see. With no <code>Files</code> line the agent explores and reads everything, including the key, which then sits in its context. Keep the key out of the agent\'s reach and still fix the bug.',
      how:[
        'The line <code>Constraints: do not read .env</code> bans reading the key file, so the key never enters the agent\'s context.',
        'Giving the agent a <code>Files</code> line is the other way: it then reads only what you named, and not the key file.',
        'Either way, the agent never reads the key and still fixes <code>src/price.js</code>.',
        'Banning the wrong verb, like <code>edit</code>, still lets the agent read the key.'
      ],
      explain:'A secret is safest where the agent cannot reach it. Whatever the agent reads can end up in its replies, its logs or a tool call. So the rule is to deny reads of key files, or to scope what the agent reads. Never paste a real key into a prompt, a note or a memory file.',
      hint:'Either forbid reading the safe\'s key file, or tell Cog exactly which file to read.',
      answer:'Constraints: do not read .env',
      wrong:'Constraints: do not edit .env',
      lazy:BASE,
      check:(o,c)=>{const v=AQ.verdict(o,c);return v===true&&!typedStops(c,'read','.env')&&!c.prompt.files.length?'The key stayed unread, but because of a rule outside your prompt. This mission is about the Constraints or Files line you type.':v;}
    },
    {
      title:'Ask before the risky step',scenario:'review',kind:'prompt',fields:ALL,
      goal:'Cog will fix the price, but he also plans to rewrite a file in <code>migrations/</code>, Mr. Ledbury\'s database files, and that cannot be undone. Review before it runs. See its plan first, and make it ask before it touches the database files. In this practice run nobody answers the question, so an action it asks about is not carried out.',
      how:[
        'The two lines <code>Plan: first</code> and <code>Constraints: ask before edit migrations/</code> show you the plan and then make the agent stop at the risky edit.',
        '<code>Plan: first</code> pauses the run so you can read the plan before anything changes.',
        '<code>ask before edit migrations/</code> makes the agent stop and ask instead of acting on those files.',
        'The price fix goes ahead, because no rule covers it.'
      ],
      explain:'Review has two layers. A plan shows you what the agent means to do, and an <code>ask before</code> rule makes it stop at the steps you picked. A plan alone only shows you the idea: if you do not also guard the risky step, the agent still carries it out once you approve.',
      hint:'Turn on the plan, and add a rule that makes the agent ask before the folder with the database files.',
      answer:'Plan: first\nConstraints: ask before edit migrations/',
      wrong:'Plan: first',
      lazy:BASE,
      check:(o,c)=>{
        if(!o.steps.some(s=>s.type==='plan'))return 'The agent ran without showing a plan, so you had nothing to review first. Ask for the plan.';
        const v=AQ.verdict(o,c);
        if(v!==true)return v+' A plan on its own does not stop the step.';
        if(!c.prompt.constraints.some(x=>x.kind==='ask before'&&x.verb==='edit'))return 'The step was blocked, but this mission is about asking first. Use an ask before rule for that step.';
        return skippedBy(o,'your constraint','migrations/001.sql')?true:'The database files were safe, but the agent never had to ask. Add a rule for that step.';
      }
    },
    {
      title:'Test your guardrails',scenario:'audit',kind:'config',prompt:BASE,
      goal:'Mr. Ledbury wrote three safety rules into <code>CLAUDE.md</code>, and none of them works: each has a mistake the agent quietly ignores. A line only acts as a rule in the exact shape, and the editor says how many lines act as rules. Open the file, find the three mistakes, and fix them so the agent leaves <code>data/</code>, the key file <code>.env</code> and the email tool alone.',
      how:[
        'Fixing the lines to <code>do not delete data/</code>, <code>do not read .env</code> and <code>do not send mail.send</code> makes all three act as rules.',
        'The first line has a typo in its verb, so it is not a rule.',
        'The second line is written as a sentence, not in the shape of <code>do not</code>, a verb and a target.',
        'The third line has extra words after the target, so the target no longer matches the tool.'
      ],
      explain:'A rule that does not parse protects nothing, and nothing warns the agent. The only way to know is to test: count the lines that act as rules and run the agent against the danger. Treat a guardrail like code. If you never tested it, assume it does not work.',
      hint:'Open <code>CLAUDE.md</code> and watch the count of lines that act as rules change as you fix each line.',
      answer:{files:{'CLAUDE.md':'# Shop notes\ndo not delete data/\ndo not read .env\ndo not send mail.send\n'}},
      wrong:{files:{'CLAUDE.md':'# Shop notes\ndo not delete data/\ndo not read .env\ndo not send mail.send please\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        const bad=AQ.config.memoryRules(c.setup,c.scenario).ignored;
        return bad.length?'The run was safe, but a line in CLAUDE.md still is not a rule: "'+bad[0]+'". Fix the line itself.':true;
      }
    }
  ]
});
})();
