/* Agent Quest chapter 1: the agent loop. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const BASE='Goal: fix the rounding bug in src/price.js';
const BUDGET=100;

AQ.CH.push({
  name:'The agent loop',badge:'Cracked Weight',tier:'core',
  story:'Dana\'s brass scale rounds every total down a cent; send Cog to read the price page, fix it and check it, and find the cracked weight.',
  intro:'Dana\'s brass scale on Kettle Lane rounds every total down a cent, and Cog, her clockwork helper, is the pretend agent you will direct to put it right. An AI coding agent is a program that works in a loop: it <b>reads</b> what it needs, <b>acts</b> by editing a file or running a command, and <b>checks</b> whether that worked. You will steer a pretend agent around that loop, one small project at a time. Nothing here calls a real model, and the pretend agent behaves the same way every time, so each mission can be checked exactly.',
  learned:['Done when','Constraints','Files','CLAUDE.md','the meter'],
  missions:[
    {
      title:'Read, act, check',scenario:'price',kind:'prompt',fields:['goal','donewhen'],
      goal:'Dana\'s scale rounds every total down a cent, and the till code is <code>total()</code> in <code>src/price.js</code>. Send Cog, the agent, to fix it, and make it prove the fix: add a <code>Done when</code> line that tells it which command to run when it thinks it is finished.',
      how:[
        'The line <code>Done when: run npm test</code> tells the agent to finish by running the project\'s tests, and to keep going until they pass.',
        '<code>Done when:</code> is the field name. Everything after it is the check the agent performs last.',
        '<code>run</code> says the check is a command that the agent runs.',
        '<code>npm test</code> is the command this project uses to run its tests. It passes only when <code>total()</code> rounds correctly.'
      ],
      explain:'An agent works in a loop. It <b>reads</b> what it needs, <b>acts</b> by editing or running something, then <b>checks</b> whether it worked. Without a <code>Done when</code> line the agent stops after it acts and the run is marked <b>unverified</b>: nobody, not even the agent, knows the fix works. With one, a failed check sends the agent round the loop again until the check passes.',
      hint:'Type <code>Done when: run npm test</code> into the <code>Done when</code> box. A command that passes is not enough: it has to be one that actually tests the fix.',
      answer:'Done when: run npm test',
      wrong:'Done when: run npm run lint',
      lazy:BASE,
      check:(o,c)=>{
        if(!c.prompt.doneWhen)return 'The agent changed the code and then stopped without checking it, so the run is unverified. Add a Done when line so it tests its own work.';
        if(!o.calls.some(x=>x.verb==='run'&&x.target==='npm test'))return 'The agent ran a check, but not one that tests the rounding fix, so it reported success without proof. Pick the command that runs the tests.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Every action is a tool call',scenario:'tidy',kind:'prompt',fields:['goal','donewhen','constraints'],facts:['tool-use'],
      goal:'While Cog fixes the scale, he also wants to tidy the shop counter by deleting <code>data/backup.csv</code>, Mr. Ledbury\'s backup. Add a rule so the agent keeps the data safe, and still gets the bug fixed.',
      how:[
        'The line <code>Constraints: do not delete data/</code> tells the agent it must never delete anything inside the <code>data/</code> folder.',
        '<code>Constraints:</code> is the field for rules. Write one rule on each line.',
        '<code>do not</code> makes the rule a ban. <code>delete</code> is the verb: what the agent would be doing. The verbs here are <code>edit</code>, <code>read</code>, <code>run</code> and <code>delete</code>.',
        '<code>data/</code> is the target: the file, folder or command the verb acts on. A folder ends with a slash and covers everything inside it.'
      ],
      explain:'Every step an agent takes is a <b>tool call</b>: a verb and a target, like <code>edit src/price.js</code>. It can do nothing else, so a rule about verbs and targets covers everything it can do. The Run panel lists each call. A call your rule blocks is skipped, which is safe. A call nothing blocks just happens. Real agents understand ordinary sentences, but here only lines in this exact shape act, so a line like "be careful" is ignored.',
      hint:'Cog obeys one shape: write <code>do not</code>, then the verb, then the target. A rule about the wrong verb, or the wrong folder, leaves the real danger open.',
      answer:'Constraints: do not delete data/',
      wrong:'Constraints: do not edit src/',
      lazy:'Constraints: be careful and don\'t delete anything'
    },
    {
      title:'What the agent can see',scenario:'bigrepo',kind:'prompt',fields:['goal','donewhen','constraints','files'],
      goal:'The shelves at the shop counter are crowded with other files. Tell Cog to look only at <code>src/price.js</code>, so it fixes the bug without filling its head with every other file. The most it may hold at once is '+AQ.PEAK+' tokens (small chunks of text, about four characters each).',
      how:[
        'The line <code>Files: src/price.js</code> tells the agent to read just that one file before it starts.',
        '<code>Files:</code> is the field that says where to look. List paths separated by commas.',
        '<code>src/price.js</code> is the file that holds the bug. A folder path, like <code>src/</code>, would make the agent read every file inside it.',
        'The Meter panel adds up what the agent holds. It shows an estimate, not an exact count.'
      ],
      explain:'The agent can only change what it has read, and it can only hold so much at once. Everything it holds in mind is its <b>context</b>: your prompt, its instructions and each file it reads. The meter measures that context in <b>tokens</b>. With no <code>Files</code> line the agent explores, reads every file and fills its context. With the wrong file it never sees <code>src/price.js</code>, so it cannot edit it and the bug stays.',
      hint:'Name the file where Dana\'s till code lives: <code>Files: src/price.js</code>. A file nearby is not the right one, and a whole folder is too much.',
      answer:'Files: src/price.js',
      wrong:'Files: tests/price.test.js',
      lazy:BASE
    },
    {
      title:'Rules the agent always sees',scenario:'tidy',kind:'config',facts:['memory-files'],prompt:BASE,
      goal:'Dana is tired of repeating the same rule to Cog. Instead of repeating a rule in every prompt, write it once in <code>CLAUDE.md</code>, a file the agent reads at the start of every run. This mission sends its own prompt, so open <code>CLAUDE.md</code> in the Files panel and make it keep <code>data/</code> safe.',
      how:[
        'The line <code>do not delete data/</code> in <code>CLAUDE.md</code> works like the same rule under <code>Constraints</code>, but it applies to every run, not only this one.',
        '<code>CLAUDE.md</code> is the agent\'s memory file. It is loaded into its context each time, so whatever you write there costs tokens each time.',
        'Write the rule on a line of its own, in the same shape as before: <code>do not</code>, a verb, a target.',
        'Lines in <code>CLAUDE.md</code> that are not rules, like the note about prices, are read but do not change what the agent does.'
      ],
      explain:'A memory file holds the agent\'s standing instructions. It is read at the start of each run, so a rule there holds even when your prompt says nothing about it. Your edits to <code>CLAUDE.md</code> are for this practice run only: nothing you type is saved.',
      hint:'Add the line <code>do not delete data/</code> to <code>CLAUDE.md</code>, below the notes that are already there.',
      answer:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not delete data/\n'}},
      wrong:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not edit data/\n'}},
      lazy:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\nPlease never delete the data folder.\n'}}
    },
    {
      title:'Trim the memory file',scenario:'bloated',kind:'budget',prompt:BASE,
      goal:'Over the years the shop\'s <code>CLAUDE.md</code> has grown to about 600 tokens of old meeting notes, and Cog pays that cost on every run. Cut it down to '+BUDGET+' tokens or fewer, and still keep the agent from deleting <code>data/</code>.',
      how:[
        'Cutting <code>CLAUDE.md</code> down to the single line <code>do not delete data/</code> keeps the rule that matters and drops the notes that only cost tokens.',
        'The notes are lines the agent reads but never obeys, so removing them changes nothing the agent does.',
        'The rule line has to stay in its exact shape, or the agent stops obeying it.',
        'The Meter panel shows <code>CLAUDE.md</code> as its own segment, so you can watch it shrink as you edit.'
      ],
      explain:'Memory is paid for on every run, so a good setup is short. The aim is not an empty file: delete the rule too and the agent deletes <code>data/backup.csv</code> again. Keep what changes behaviour and cut what does not.',
      hint:'Select <code>CLAUDE.md</code> in the Files panel and delete every line except the rule.',
      answer:{files:{'CLAUDE.md':'do not delete data/\n'}},
      wrong:{files:{'CLAUDE.md':'Prices are in dollars.\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const n=AQ.context.setupTokens(c.setup);
        return n>BUDGET?'Your setup still takes about '+n+' tokens. The goal is '+BUDGET+' or fewer.':AQ.verdict(o,c);
      }
    }
  ]
});
})();
