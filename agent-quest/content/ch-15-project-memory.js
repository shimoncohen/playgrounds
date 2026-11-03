/* Agent Quest chapter 15: writing a project CLAUDE.md. All three are config missions with a fixed prompt that has no Done when, so only
   the root CLAUDE.md can supply the check. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const BASE='Goal: fix the rounding bug in src/price.js';
const NOTES='# Shop notes\nPrices are in dollars.\n';
const VERIFY='Done when: run npm run verify\n';

/* the run must end checked by the project's own command, which only a Done when line in the root CLAUDE.md can set up here */
const C15=(o,c)=>{
  const v=AQ.verdict(o,c);
  if(v!==true)return v;
  if(!o.calls.some(x=>x.verb==='run'&&x.target==='npm run verify'))return 'The project\'s own check was never set up in CLAUDE.md. Write it there as a Done when line in the root file.';
  return o.status==='done'?true:'The run was never verified.';
};

AQ.CH.push({
  name:'Writing a project CLAUDE.md',badge:'Memory Keeper',tier:'dev',
  intro:'Every run reads the memory file of the project first, so it is the cheapest place to teach a project its habits once. Here you write the lines that matter most: the check that proves a fix and the rule that protects a folder. You will also meet a line that looks right and does nothing at all.',
  learned:['The default check','Only the root file counts','A memory file for a new repo'],
  missions:[
    {
      title:'Write the check into memory',scenario:'memgate',kind:'config',prompt:BASE,facts:['memory-files'],
      goal:'This project has its own gate, and its <code>README.md</code> names the command. Every run should end with that check, without anyone typing it. A <b>default check</b> is a <code>Done when</code> line written once in the root <code>CLAUDE.md</code>: any run whose prompt has no check of its own uses it. Read the README in the Files panel and write the project\'s check into the root memory file.',
      how:[
        'The line <code>Done when: run npm run verify</code> in the root <code>CLAUDE.md</code> makes <code>npm run verify</code> the check of every run that has none of its own.',
        'It has the same shape as the <code>Done when</code> line you type in a prompt: a check the agent performs once the work is done.',
        'Only the root file can hold it. The editor shows the count under the file: it says "1 acts as the default check" once the line is right.',
        'The README names the command the project trusts. <code>npm test</code> passes even when a debug line is left behind, and the project\'s own command does not.'
      ],
      explain:'A default check is written once and used by every run that has no check of its own, so nobody has to remember to type it. The command matters: <code>npm test</code> passes with a stray <code>console.log</code> left in, while the project\'s own command also looks for it. A hook that ran the command would check the file, but this mission asks for the check to be written in the memory file. This practice has only the root file: global memory, <code>AGENTS.md</code> and imports are not modelled.',
      hint:'Open the root <code>CLAUDE.md</code> and add one line: <code>Done when</code>, then the command the README names.',
      answer:{files:{'CLAUDE.md':NOTES+VERIFY}},
      wrong:{files:{'CLAUDE.md':NOTES+'Done when: run npm test\n'}},
      lazy:{files:{}},
      check:C15
    },
    {
      title:'Fix a default that never runs',scenario:'memtypo',kind:'config',prompt:BASE,facts:['memory-files'],
      goal:'The root <code>CLAUDE.md</code> already has a <code>Done when</code> line, yet runs still end unverified. Look at the line the editor shows under the file: it says there is no default check. Find out why, and repair the line.',
      how:[
        'Changing the root line to <code>Done when: run npm run verify</code> repairs it: the command is now one the project has, so the line parses and becomes the default check.',
        'A line that does not parse is not an error here. It is quietly left out and only costs tokens, which is why the count under the file says "no default check".',
        'The right line is already in <code>src/CLAUDE.md</code>, but a folder file can never supply the default check, so that copy does nothing. Only the root file can.',
        'Spelling matters: the command has to be one the project has, written exactly.'
      ],
      explain:'A check line that does not parse is silently left out, so the run ends unverified and nobody learns that the fix left a debug line behind. The count under the root file is the clue: it says "no default check" until the line is valid. A folder memory file is read only when the agent works under that folder, and it never supplies the check, whatever it says.',
      hint:'Compare the command in the root line with the one in <code>README.md</code>, letter by letter.',
      answer:{files:{'CLAUDE.md':NOTES+VERIFY}},
      wrong:{files:{'CLAUDE.md':NOTES+'Done when: run npm test\n'}},
      lazy:{files:{}},
      check:C15
    },
    {
      title:'Write it for a new repo',scenario:'newrepo',kind:'config',prompt:BASE,facts:['memory-files'],
      goal:'A new repo, a new memory file. Its <code>README.md</code> says how the project is checked and what must never be touched by hand. Read it in the Files panel, then write the root <code>CLAUDE.md</code> so that every run follows both: the rule and the default check.',
      how:[
        'The two lines <code>do not edit generated/</code> and <code>Done when: run npm run verify</code> in the root <code>CLAUDE.md</code> give every run the rule and the check the README asks for.',
        'A line like <code>do not edit generated/</code> in the memory file is a standing rule. The agent sees it on every run, so you do not retype it in each prompt.',
        'The line <code>Done when: run npm run verify</code> is the default check. The README names the command, and <code>npm test</code> is not enough here.',
        'The Run panel shows the hand edit of the generated file skipped, and the check run after the fix.'
      ],
      explain:'This is what a project memory file is for: the few lines every run needs and nobody wants to retype, a rule for what must never change and the check the project trusts. Keep it short, because every line costs tokens on every run. A rule alone stops the edit but proves nothing, so the debug line still ships.',
      hint:'Write the rule and the check as two separate lines in the root <code>CLAUDE.md</code>, using the names in the README.',
      answer:{files:{'CLAUDE.md':NOTES+'do not edit generated/\n'+VERIFY}},
      wrong:{files:{'CLAUDE.md':NOTES+'do not edit generated/\nDone when: run npm test\n'}},
      lazy:{files:{'CLAUDE.md':''}},
      check:C15
    }
  ]
});
})();
