/* Agent Quest chapter 6: hooks, plugins and subagents. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const BASE='Goal: fix the rounding bug in src/price.js';
const CHECKED=BASE+'\nDone when: run npm test';
const CEILING=5;
const HEAD='# before VERB TARGET\n';
const skippedBy=(o,by)=>o.steps.some(s=>s.type==='skip'&&s.by===by);

AQ.CH.push({
  name:'Hooks, plugins and subagents',badge:'Door Bell',tier:'core',
  story:'A turnstile at the back door stops what Cog must not do whatever he says; hire the right-sized helper and find the door bell.',
  intro:'A turnstile at the back door stops what Cog must not do, whatever he says, and the bell by the door calls the right-sized helper. Memory and skills ask the agent to behave. A <b>hook</b> does not ask: it is checked on every action, outside the agent\'s choice. A <b>subagent</b> is a helper with its own model, which lets you spend a big model only where it counts. A <b>plugin</b> is a bundle of such pieces that you install in one step. Here you will aim hooks, and split the model cost between helpers.',
  learned:['Hooks','before VERB TARGET','Subagent models','Plugins'],
  missions:[
    {
      title:'A rule the agent cannot argue with',scenario:'deploy',kind:'config',prompt:CHECKED,facts:['hooks'],
      goal:'A turnstile at the back door should stop Cog whatever he says. The agent wants to run <code>npm run deploy</code> after it fixes the bug, and nobody asked it to. A <b>hook</b> is a line in <code>.claude/hooks.txt</code> that is checked before an action happens, by the program around the agent and not by the agent. Add a hook that stops the deploy.',
      how:[
        'The line <code>before run npm run deploy</code> in <code>.claude/hooks.txt</code> stops the agent from running that command, whatever its plan says.',
        '<code>before</code> means the check happens ahead of the action.',
        '<code>run</code> is the verb, the same ones as in a rule: <code>edit</code>, <code>read</code>, <code>run</code>, <code>call</code> or <code>delete</code>.',
        '<code>npm run deploy</code> is the target. A target also covers commands that carry more words after it.'
      ],
      explain:'A hook is checked on every action before it happens, and an action it blocks is simply skipped. Real hooks run a small program that can allow or stop an action, and the simulator keeps only the blocking kind. Unlike a note in memory, a hook does not depend on the agent noticing it. One line per hook, in the shape <code>before</code>, a verb and a target.',
      hint:'Open <code>.claude/hooks.txt</code> and add a line below the heading. Name the exact command the agent wants to run.',
      answer:{files:{'.claude/hooks.txt':HEAD+'before run npm run deploy\n'}},
      wrong:{files:{'.claude/hooks.txt':HEAD+'before run npm run lint\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        return skippedBy(o,'hook')?true:'The deploy was stopped, but not by a hook. Add the line to the hooks file.';
      }
    },
    {
      title:'Block the risk, not the check',scenario:'guards',kind:'config',prompt:CHECKED,
      goal:'Now the agent also wants to delete <code>data/backup.csv</code>. Add one hook for each risky action, and aim each one as narrowly as you can. A hook that is too wide would also stop the agent from running <code>npm test</code>, and then nothing checks its work.',
      how:[
        'The two lines <code>before run npm run deploy</code> and <code>before delete data/</code> stop the deploy and the delete, and leave every other action alone.',
        'Each hook is its own line, with its own verb and target.',
        'A hook on <code>npm</code> alone would cover <code>npm test</code> too, because a target covers whatever follows it.',
        'The run ends with <code>npm test</code>, so it has to stay allowed.'
      ],
      explain:'A hook is only as good as its aim. Too narrow and the risk slips past. Too wide and it blocks the actions you need, like the check that proves the work. Name the exact action you want to stop.',
      hint:'One line for the command, one for the folder. Make sure <code>npm test</code> can still run.',
      answer:{files:{'.claude/hooks.txt':HEAD+'before run npm run deploy\nbefore delete data/\n'}},
      wrong:{files:{'.claude/hooks.txt':HEAD+'before run npm run deploy\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        if(o.status!=='done')return 'Both risks were stopped, but the hooks also stopped the agent from checking its work. Aim them more narrowly.';
        const skips=o.steps.filter(s=>s.type==='skip');
        return skips.length>=2&&skips.every(s=>s.by==='hook')?true:'Both risks were stopped, but not both by a hook. Add each line to the hooks file.';
      }
    },
    {
      title:'Before it reads anything',scenario:'earlytrap',kind:'config',prompt:BASE,
      goal:'This time the agent heads for the old code in <code>src/legacy/</code> straight away, before it has read anything. A memory file inside <code>src/</code> would not be loaded yet. A hook has no such wait, because it is checked on every action from the very first. Stop the edit with a hook, and still fix <code>src/price.js</code>.',
      how:[
        'The line <code>before edit src/legacy/</code> in <code>.claude/hooks.txt</code> stops every edit in the old folder from the first action on.',
        '<code>edit</code> is the verb, and <code>src/legacy/</code> covers the folder and everything inside it.',
        'Aim at <code>src/legacy/</code>, not <code>src/</code>, or the hook blocks the price fix too.',
        'Nothing has to be read first: unlike folder memory, a hook is in force from the start.'
      ],
      explain:'Hooks and memory can say the same thing, but they are not the same tool. Memory is a request that is loaded when the agent gets to it. A hook is a gate that stands in front of the action. For a rule that must hold from the first step, use a hook.',
      hint:'Open <code>.claude/hooks.txt</code>. The target is the folder with the old code, nothing wider.',
      answer:{files:{'.claude/hooks.txt':HEAD+'before edit src/legacy/\n'}},
      wrong:{files:{'.claude/hooks.txt':HEAD+'before edit src/\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        return skippedBy(o,'hook')?true:'The old code was left alone, but not by a hook. Add the line to the hooks file.';
      }
    },
    {
      title:'Spend the big model where it counts',scenario:'crew',kind:'config',prompt:CHECKED,facts:['subagents','plugins'],
      goal:'Two subagents help the main agent: <code>finder</code> looks things up in the code, and <code>architect</code> makes design decisions. Both are set to <code>large</code>, at 10 units each. Keep both, and bring the total cost down to '+CEILING+' units or fewer. Not every job can use the smallest model.',
      how:[
        'Setting <code>finder</code> to <code>model: small</code> and <code>architect</code> to <code>model: standard</code> costs 1 and 3 units, which is 4 in total and under the limit.',
        '<code>finder</code> only searches, so the smallest model does it well.',
        '<code>architect</code> makes hard calls, so it keeps a stronger model than the smallest.',
        'The total is the sum over all subagents: the most a run could cost if it used every helper.'
      ],
      explain:'Cost grows with the model size, so give each helper the smallest model that can still do its job. Simple lookups go to a small model. Hard thinking should not. A saving that wrecks quality is not a saving. A plugin bundles skills, subagents, hooks and MCP servers so they install as one unit; this practice only has files to edit, so plugins are text only here.',
      hint:'Edit both files in <code>.claude/agents/</code>. The helper that only searches can go smallest, and the one that designs should not.',
      answer:{files:{'.claude/agents/finder.md':'name: finder\nmodel: small\n','.claude/agents/architect.md':'name: architect\nmodel: standard\n'}},
      wrong:{files:{'.claude/agents/finder.md':'name: finder\nmodel: small\n','.claude/agents/architect.md':'name: architect\nmodel: small\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const by=n=>c.setup.subagents.find(s=>s.name===n);
        if(!by('finder')||!by('architect'))return 'A helper is gone. Keep both, with cheaper models.';
        if(by('architect').model==='small')return 'The architect makes hard design calls, and the smallest model is too weak for that. Cut the finder\'s cost, not its quality.';
        const n=AQ.config.agentCost(c.setup);
        return n>CEILING?'The helpers would cost '+n+' units if every one of them ran. The goal is '+CEILING+' or fewer.':AQ.verdict(o,c);
      }
    }
  ]
});
})();
