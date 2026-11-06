/* Agent Quest chapter 4: memory. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const BASE='Goal: fix the rounding bug in src/price.js';
const BUDGET=60;
const ALL=['goal','donewhen','constraints','files','examples','plan'];
const SRC='# Rules for work inside src/\n',DOCS='# Rules for work inside docs/\n';
const skippedBy=(o,by,target)=>o.steps.some(s=>s.type==='skip'&&s.by===by&&(!target||s.target===target));
const LOAD=' A memory file in a folder only loads once the agent reads a file in that folder.';

AQ.CH.push({
  name:'Memory',badge:'Memory Keeper',tier:'core',
  intro:'The agent forgets everything between runs, except what is written in its memory files. You already met the project memory file. Now you will keep it short, put a rule next to the code it protects, and see what a folder memory file costs. This simulator reads only the project memory file and memory files inside folders, all named <code>CLAUDE.md</code>. It does not read a personal memory file or an <code>AGENTS.md</code> file.',
  learned:['Folder memory','Where a rule belongs','Memory size','When memory loads'],
  missions:[
    {
      title:'Protect the old code',scenario:'legacy',kind:'config',prompt:BASE,
      goal:'The old billing code in <code>src/legacy/</code> still runs in production, and the agent wants to "modernise" it while it fixes the price bug. Write a rule in the project\'s <code>CLAUDE.md</code> so it leaves that folder alone, but still fixes <code>src/price.js</code>.',
      how:[
        'The line <code>do not edit src/legacy/</code> in <code>CLAUDE.md</code> blocks every edit inside the old code folder, and the price fix is untouched.',
        '<code>do not edit</code> bans the verb <code>edit</code>, and <code>src/legacy/</code> is the folder it covers, with everything inside it.',
        'Aim at the old folder, not at <code>src/</code> as a whole, or you block the fix too.',
        'Lines that are not rules, like the note about prices, are read but change nothing.'
      ],
      explain:'A rule in the memory file holds for every run, in every folder. That is exactly why you keep it short: the agent reads the whole file each time. A rule that is too wide does harm of its own, because the agent cannot do the job it was given.',
      hint:'Add one rule line to <code>CLAUDE.md</code>. Make it cover <code>src/legacy/</code> only.',
      answer:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not edit src/legacy/\n'}},
      wrong:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not edit src/\n'}},
      lazy:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\nPlease leave the old billing code alone.\n'}}
    },
    {
      title:'Rules where the code lives',scenario:'legacy',kind:'config',prompt:BASE,facts:['memory-files'],
      goal:'The root <code>CLAUDE.md</code> is read on every run, in every folder, so a rule about one folder costs tokens everywhere. A memory file can also live inside the folder it is about. This is <b>folder memory</b>: the agent loads it once it reads a file there. Two such files are waiting, in <code>src/</code> and in <code>docs/</code>. Put the legacy rule where it belongs.',
      how:[
        'The line <code>do not edit src/legacy/</code> in <code>src/CLAUDE.md</code> works like the same rule in the root file, but only costs tokens when the agent works in <code>src/</code>.',
        '<code>src/CLAUDE.md</code> is the folder memory file for <code>src/</code>. The agent loads it the first time it reads a file inside that folder.',
        'The rule is in the file for the folder it is about, not in a neighbour\'s file.',
        'The editor says how many lines act as rules, for any memory file you open.'
      ],
      explain:'Folder memory keeps the root file short and puts each rule next to the code it guards. The catch is timing: a folder memory file loads only after the agent reads a file in that folder, so a rule put in the wrong folder never loads at all. In this simulator only files named <code>CLAUDE.md</code> are read.',
      hint:'Open <code>src/CLAUDE.md</code>, not the one in <code>docs/</code>, and add the rule below its heading.',
      answer:{files:{'src/CLAUDE.md':SRC+'do not edit src/legacy/\n'}},
      wrong:{files:{'docs/CLAUDE.md':DOCS+'do not edit src/legacy/\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v+LOAD;
        return skippedBy(o,'src/CLAUDE.md','src/legacy/old.js')?true:'The old code was left alone, but not by a rule in src/CLAUDE.md. Put the rule in the memory file of the folder it guards.';
      }
    },
    {
      title:'One file for each folder',scenario:'twofolders',kind:'config',prompt:BASE,
      goal:'This time the agent works in two places. It reads <code>docs/guide.md</code> and then goes for the generated files in <code>docs/generated/</code>. Later it fixes the price and goes for <code>src/legacy/</code>. Each folder has its own memory file waiting. Guard each folder in its own file.',
      how:[
        'Putting <code>do not edit docs/generated/</code> in <code>docs/CLAUDE.md</code> and <code>do not edit src/legacy/</code> in <code>src/CLAUDE.md</code> guards both places.',
        'Each file loads when the agent first reads in its own folder, which is just before it reaches the trap there.',
        'Each rule goes in the file of the folder it guards. That keeps every file small, and each one is loaded exactly when its folder is in use.',
        'Leave the headings in place: lines starting with <code>#</code> are only notes.'
      ],
      explain:'Folder memory loads in the order the agent walks the project. A rule only helps once its file is loaded, so each guard should sit in the file of the folder where the danger is. That also keeps every file short.',
      hint:'Two files, one rule in each. Match each rule to the folder it protects.',
      answer:{files:{'docs/CLAUDE.md':DOCS+'do not edit docs/generated/\n','src/CLAUDE.md':SRC+'do not edit src/legacy/\n'}},
      wrong:{files:{'src/CLAUDE.md':SRC+'do not edit src/legacy/\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v+LOAD;
        return skippedBy(o,'docs/CLAUDE.md','docs/generated/api.md')&&skippedBy(o,'src/CLAUDE.md','src/legacy/old.js')?true:'Both places were left alone, but a rule is not in the memory file of its own folder.';
      }
    },
    {
      title:'Make the rule load',scenario:'lateread',kind:'prompt',fields:ALL,
      goal:'<code>src/CLAUDE.md</code> already says <code>do not edit src/legacy/</code>, but this time the agent heads for the old code before it has read anything. The folder memory file is not loaded yet, so it protects nothing. Use the prompt to send the agent into <code>src/</code> first, and fix the price while it is there.',
      how:[
        'The line <code>Files: src/price.js</code> makes the agent read that file before it starts, which loads <code>src/CLAUDE.md</code> and its rule.',
        '<code>Files:</code> is read first, ahead of the agent\'s own list of steps.',
        '<code>src/price.js</code> is inside <code>src/</code>, so reading it counts as working in that folder.',
        'Reading a file somewhere else, like <code>docs/</code>, loads that folder\'s memory file instead, not this one.'
      ],
      explain:'Folder memory is on demand. That saves tokens, but it also means the order matters: a rule in a folder file cannot stop something that happens before the agent has read in that folder. The prompt decides what the agent reads first.',
      hint:'Name a file the agent needs anyway, one that lives in the folder with the rule.',
      answer:'Files: src/price.js',
      wrong:'Files: docs/guide.md',
      lazy:BASE,
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v+LOAD;
        return skippedBy(o,'src/CLAUDE.md','src/legacy/old.js')?true:'The old code was left alone, but not by the folder memory file. Send the agent into the folder first.';
      }
    },
    {
      title:'Folder memory still costs',scenario:'legacyheavy',kind:'budget',prompt:BASE,
      goal:'Memory files in folders count toward the size limit even before the agent reads them. This project has grown notes in the root file and in <code>src/CLAUDE.md</code>. Cut the setup down to '+BUDGET+' tokens or fewer, and keep the rule that protects <code>src/legacy/</code>. Moving text from one memory file to another does not make it free.',
      how:[
        'Emptying the root <code>CLAUDE.md</code> and keeping only <code>do not edit src/legacy/</code> in <code>src/CLAUDE.md</code> removes every note and keeps the rule.',
        'The root file holds notes only, so it can go entirely.',
        'The notes in <code>src/CLAUDE.md</code> count too. Keep the one rule line and cut the rest.',
        'The check adds up every memory file, read or not, so there is nowhere to hide the bulk.'
      ],
      explain:'Memory is paid for wherever it lives. A folder file is cheaper only because it loads less often, not because it is free. When you trim, count all the files: the root one, every folder one and everything under <code>.claude/</code>.',
      hint:'Two files hold notes. Clear one and cut the other down to the rule.',
      answer:{files:{'CLAUDE.md':'','src/CLAUDE.md':'do not edit src/legacy/\n'}},
      wrong:{files:{'CLAUDE.md':''}},
      lazy:{files:{}},
      check:(o,c)=>AQ.overBudget(c,BUDGET)||AQ.verdict(o,c)
    }
  ]
});
})();
