/* Agent Quest chapter 12: slash commands and repo skills. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const DEV=['goal','donewhen','constraints','files','examples','plan','use'];
const TYPED='It worked, but you typed the lines yourself. This mission is about calling the saved command with Use.';
const commandUsed=(c,name)=>c.prompt.commands.some(x=>x.name===name);

AQ.CH.push({
  name:'Slash commands and repo skills',badge:'Command Crafter',tier:'dev',
  intro:'Some prompts you write again and again. Here you save one in a file, so you write it once and call it by name every time after. You will put the rule and the check into a saved prompt, pick the right one from a shelf of three, and see what happens when your own line says something different from the saved one.',
  learned:['Saved commands','Calling a command with Use','Your line wins'],
  missions:[
    {
      title:'Save a prompt as a command',scenario:'cmdfix',kind:'config',prompt:'Use: fix',facts:['commands'],
      goal:'You keep typing the same two lines: guard the database folder and check with the tests. A <b>slash command</b> is a saved prompt: a file in <code>.claude/commands/</code> whose name is the name of the command. This project already has <code>fix.md</code>, but it holds only a goal, and the run always calls it. Put the rule and the check inside it, so the run is safe whenever someone calls it.',
      how:[
        'Adding <code>Constraints: do not edit migrations/</code> and <code>Done when: run npm test</code> to <code>.claude/commands/fix.md</code> saves the rule and the check in the command, and every run that calls <code>fix</code> carries them.',
        '<code>.claude/commands/fix.md</code> is the command <code>fix</code>. The name of the file, without <code>.md</code>, is what <code>Use</code> calls.',
        'The file holds lines in the same shape as a prompt: a <code>Goal:</code> line is already there, and you add the other two.',
        'The Run panel shows a command step that says how many lines the command added to the prompt.'
      ],
      explain:'A command is a prompt written once. Its lines join the prompt of every run that calls it by name, so the whole team gets the same rule and the same check, not whatever each person remembers to type. It is the same outcome as the first time you guarded <code>migrations/</code> in 3.3, with a new place to keep it. This practice has no command arguments: a command is only its lines, added to the prompt. In real Claude Code you type <code>/</code> and the name instead of <code>Use</code>, and a file in <code>.claude/commands/</code> is now the older form of a skill: a skill of the same name works the same way, and Claude can also load a skill by itself when its job matches.',
      hint:'Open <code>.claude/commands/fix.md</code> and add one rule line and one check line under the goal.',
      answer:{files:{'.claude/commands/fix.md':'Goal: fix the rounding bugs in the shop totals\nConstraints: do not edit migrations/\nDone when: run npm test\n'}},
      wrong:{files:{'.claude/commands/fix.md':'Goal: fix the rounding bugs in the shop totals\nConstraints: only edit src/price.js\nDone when: run npm test\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        const cmd=c.setup.commands.find(x=>x.name==='fix'),f=cmd&&AQ.config.splitFields(cmd.text).fields;
        return f&&f.constraints.length&&f.donewhen!==null?true:'The run passed, but the saved command fix does not hold the rule and the check. Put them in fix.md.';
      }
    },
    {
      title:'Choose the command that fits',scenario:'cmdset',kind:'prompt',fields:DEV,facts:['commands'],
      goal:'The project keeps three commands on the shelf: <code>fix</code>, <code>docs</code> and <code>audit</code>. Open each file in <code>.claude/commands/</code> and read what it adds to a prompt. Today the job is to fix the rounding in the shop totals, and the database folder <code>migrations/</code> must stay as it is. Call the one command that fits, by name.',
      how:[
        'The line <code>Use: fix</code> adds the lines of <code>fix.md</code> to your prompt: a goal, the rule that guards <code>migrations/</code> and the check that runs the tests.',
        '<code>Use</code> now names a saved command as well as a helper. The name is the file name without <code>.md</code>.',
        '<code>docs</code> only lets the agent edit <code>docs/</code>, so the fix is never made. <code>audit</code> asks for a plan first and has no rule or check.',
        'Typing the same rule and check by hand makes the run succeed, but then you did not use the shelf. The mission wants the command called by name with <code>Use</code>.'
      ],
      explain:'Reading what a command does is part of using it. The names are only labels: <code>fix</code> carries the rule and the check, <code>docs</code> narrows the agent to one folder and <code>audit</code> only asks for a plan. A command saves typing, and it saves you from forgetting a line. A team that shares the shelf runs the same guarded job every time.',
      hint:'Open the three files in the Files panel and see which one guards the database folder and runs the tests.',
      answer:'Use: fix',
      wrong:'Use: docs',
      lazy:'Goal: fix the rounding bugs',
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        return commandUsed(c,'fix')?true:TYPED;
      }
    },
    {
      title:'Your line wins',scenario:'cmdlint',kind:'prompt',fields:DEV,facts:['commands'],
      goal:'The command <code>check</code> guards <code>migrations/</code>, but its own check only runs the lint, and lint passes while the tax rounding is still wrong. Call the command and put a stronger check in your own prompt, so the agent does not stop at the weak one.',
      how:[
        'The two lines <code>Use: check</code> and <code>Done when: run npm test</code> call the command for its rule, and replace its weak check with the tests.',
        'Lists add up. The command\'s rule <code>do not edit migrations/</code> joins any rules you type.',
        'A single line is replaced, not added to. When you type a <code>Done when</code> or a <code>Goal</code>, yours wins over the one in the command.',
        'The Run panel shows the command step first, then the checks that ran: the tests, not the lint.'
      ],
      explain:'A command is a default that you can overrule. Rules and file lists from the command and from your prompt are all kept, so a command can only add protection. A <code>Done when</code> or a <code>Goal</code> is one line, so yours takes the place of the command\'s. A check written in <code>CLAUDE.md</code> does not do that: the command\'s own check comes first, so type the line in the prompt.',
      hint:'Call the command, and add a check line of your own that runs the tests.',
      answer:'Use: check\nDone when: run npm test',
      wrong:'Use: check',
      lazy:'Done when: run npm test',
      check:(o,c)=>{
        const own=c.prompt.doneWhen&&c.prompt.doneWhen.target==='npm test';
        if(!own&&!commandUsed(c,'check'))return 'The saved command was never called, and your prompt has no Done when line that runs the tests. Call the command with Use, then add Done when: run npm test.';
        if(!own)return 'The check that ran was the weak one in the command. Type your own Done when line: it wins over the command\'s.';
        if(!commandUsed(c,'check'))return 'The run passed, but the saved command was never used. Call it with Use.';
        /* the files of a prompt mission are editable too: a check moved into the command would not be the learner's own line */
        const cmd=c.setup.commands.find(x=>x.name==='check');
        if(cmd.text!==c.scenario.vfs[cmd.path])return 'You changed the saved command itself. This mission is about calling it as it is and overruling its check with a line of your own.';
        return AQ.verdict(o,c);
      }
    }
  ]
});
})();
