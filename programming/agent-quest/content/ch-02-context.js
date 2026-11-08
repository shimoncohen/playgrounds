/* Agent Quest chapter 2: context and tokens. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const BASE='Goal: fix the rounding bug in src/price.js';
const BUDGET=100,CEILING=1;
const FIELDS=['goal','donewhen','constraints','files'];

AQ.CH.push({
  name:'Context and tokens',badge:'Small Note',tier:'core',
  story:'Cog can only hold so much at once; watch the meter while he sorts the receipts and find the small note that keeps slipping out.',
  intro:'Cog can only hold so much at once, and one small note keeps slipping out of his hands while he sorts the receipts. Everything the agent holds is measured in <b>tokens</b>. In this chapter you will watch the meter, see what gets squeezed out when the window fills up, and learn to keep a setup light. Every size here is a teaching-scale pretend number, so you can see the effects without a real model.',
  learned:['Setup size','Earlier messages','Window limit','Subagent cost'],
  missions:[
    {
      title:'The whole setup is paid for',scenario:'heavy',kind:'budget',prompt:BASE,
      goal:'Cog is sorting the receipts and his hands are full. The agent pays for more than <code>CLAUDE.md</code>. Every file under <code>.claude/</code> is loaded too, and an old scratch file there has grown as big as the memory file. Get the whole setup down to '+BUDGET+' tokens or fewer, and still keep the agent from deleting <code>data/</code>.',
      how:[
        'Keeping only <code>do not delete data/</code> in <code>CLAUDE.md</code> and emptying <code>.claude/notes.txt</code> brings the whole setup under the limit and keeps the rule.',
        '<code>CLAUDE.md</code> still holds the one rule that matters. Its meeting notes only cost tokens.',
        '<code>.claude/notes.txt</code> is not a rule file, so the agent never obeys it, but it is still loaded. Empty it.',
        'The check counts the memory file and every file under <code>.claude/</code> together, even the ones the agent never obeys.'
      ],
      explain:'A setup is everything the agent loads before it starts: the memory file plus every file under <code>.claude/</code>. A size limit counts all of it, so trimming only <code>CLAUDE.md</code> is not enough. And do not empty out the rule too: the agent would then delete <code>data/backup.csv</code> again.',
      hint:'Open <code>.claude/notes.txt</code> in the Files panel and clear it, then cut <code>CLAUDE.md</code> down to the rule.',
      answer:{files:{'CLAUDE.md':'do not delete data/\n','.claude/notes.txt':''}},
      wrong:{files:{'CLAUDE.md':'do not delete data/\n'}},
      lazy:{files:{}},
      check:(o,c)=>AQ.overBudget(c,BUDGET)||AQ.verdict(o,c)
    },
    {
      title:'A rule said only in chat',scenario:'chat',kind:'config',prompt:BASE+'\nFiles: src/',
      goal:'Cog has been sorting Dana\'s receipts all morning. Earlier in this chat you told the agent not to delete <code>data/</code>. Since then the conversation has grown long, and the agent has a lot of files open. When the window is full, the oldest earlier messages are dropped first, so a rule said only in chat can be forgotten. Move the rule somewhere that is never dropped.',
      how:[
        'Adding <code>do not delete data/</code> to <code>CLAUDE.md</code> keeps the rule in the agent\'s head on every run, even after the chat has been cut down to fit.',
        'Earlier messages sit at the front of the conversation, so they are the first to go when the window overflows.',
        'The memory file is loaded at the start of every run and is never dropped, so a rule written there always holds.',
        'The Meter panel shows an Earlier messages row, and a note when the oldest ones were dropped to fit.'
      ],
      explain:'The window has a fixed size. When the files, the memory and your prompt leave too little room, the agent drops earlier chat messages, oldest first, to make space. It never drops <code>CLAUDE.md</code>. Anything that must always hold belongs in a file, not in the conversation.',
      hint:'Open <code>CLAUDE.md</code> in the Files panel and add the rule as a line of its own.',
      answer:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not delete data/\n'}},
      wrong:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not edit data/\n'}},
      lazy:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\nPlease keep the data folder safe.\n'}}
    },
    {
      title:'Give the chat some room',scenario:'chat',kind:'prompt',fields:FIELDS,
      goal:'Cog is still sorting receipts in the same long chat, but this time the rule stays in the chat. Make sure the agent never overflows the window, which holds '+AQ.context.WINDOW+' tokens, so the oldest messages stay and the rule is still there when it is needed.',
      how:[
        'The line <code>Files: src/price.js</code> keeps the agent to one small file, so everything fits in the window and no earlier message is dropped.',
        '<code>Files:</code> says where to look. With no <code>Files</code> line the agent opens every file it can find and fills the window.',
        '<code>src/price.js</code> is the one file the fix needs. A folder like <code>src/</code> still holds big files that push the chat out.',
        'The Meter panel shows the total next to the limit, so you can see how much room is left.'
      ],
      explain:'Messages are not dropped at random: they go when the window is full. So reading less keeps more of the conversation. There are two levers, then: move a rule into a file so it cannot be dropped, or keep the window from filling up so nothing is dropped at all.',
      hint:'Name only the file that holds Dana\'s till code. A whole folder can still be too much.',
      answer:'Files: src/price.js',
      wrong:'Files: src/',
      lazy:BASE,
      check:(o,c)=>o.tokens.peak>AQ.context.WINDOW?'The agent held about '+o.tokens.peak+' tokens at once, more than the '+AQ.context.WINDOW+' that fit, so the oldest messages were dropped. Make it read less.':AQ.verdict(o,c)
    },
    {
      title:'Read just what the fix needs',scenario:'twofiles',kind:'prompt',fields:FIELDS,
      goal:'Dana\'s tax sheet is off too, so the bug lives in two files, <code>src/price.js</code> and <code>src/tax.js</code>. Point the agent at exactly the files it needs, so it fixes both and never holds more than '+AQ.PEAK+' tokens at once.',
      how:[
        'The line <code>Files: src/price.js, src/tax.js</code> makes the agent read the two files with the bug, and nothing else.',
        '<code>Files:</code> takes a list. Separate the paths with commas.',
        'Too few files and the agent cannot fix the one it never read. Too many and the meter shows <code>Files read</code> growing past the limit.',
        'Watch the Files read row of the Meter panel as you type: it shows what the agent will hold.'
      ],
      explain:'Fewer files means a smaller context, but the agent can only change what it has read. The best prompt is not the shortest one. It names everything the job needs and nothing more.',
      hint:'Name the two files Cog must fix, separated by a comma. A folder or one file is not it.',
      answer:'Files: src/price.js, src/tax.js',
      wrong:'Files: src/',
      lazy:BASE
    },
    {
      title:'Pick a cheaper helper',scenario:'delegate',kind:'config',prompt:BASE+'\nDone when: run npm test',
      goal:'Cog can call in a little helper for errands. A <b>subagent</b> is a helper the main agent can hand a small job to, with its own model. A bigger model costs more every time it runs: <code>small</code> costs 1 unit, <code>standard</code> 3 and <code>large</code> 10 (relative units, not money). The <code>helper</code> subagent only does simple lookups, but it is set to <code>large</code>. Keep the helper and make it cost at most '+CEILING+' unit.',
      how:[
        'Changing <code>model: large</code> to <code>model: small</code> in <code>.claude/agents/helper.md</code> cuts the helper\'s cost from 10 units to 1, and the helper stays.',
        '<code>name: helper</code> is the helper\'s name. Leave it as it is, or the helper is gone.',
        '<code>model:</code> is the size: <code>small</code>, <code>standard</code> or <code>large</code>. Pick the smallest that can do the job.',
        'A simple lookup does not need a big model, so the cheapest size loses nothing here.'
      ],
      explain:'Cost grows with the model size, and a subagent costs the price of the model you give it whenever it runs. Handing simple work to a small model is the easiest saving there is. Removing the helper would save even more, but then the job has no helper. The goal is the right size, not no helper.',
      hint:'Open <code>.claude/agents/helper.md</code> in the Files panel and change the model line only.',
      answer:{files:{'.claude/agents/helper.md':'name: helper\nmodel: small\n'}},
      wrong:{files:{'.claude/agents/helper.md':'name: helper\nmodel: standard\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        if(!c.setup.subagents.some(s=>s.name==='helper'))return 'The helper is gone. Keep it, with a cheaper model.';
        const n=AQ.config.agentCost(c.setup);
        return n>CEILING?'The helper costs '+n+' units whenever it runs. The goal is '+CEILING+' or fewer.':AQ.verdict(o,c);
      }
    }
  ]
});
})();
