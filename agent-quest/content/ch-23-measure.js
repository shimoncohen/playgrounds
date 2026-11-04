/* Agent Quest chapter 23 (array index 22): Measure, then cut. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const KEEP=0.6,COST1=3,COST2=5;
const FIX='Goal: fix the rounding bug in src/price.js',FIND='Use: scout\nDone when: run npm test',BOTH='Goal: fix the rounding bug in the shop totals\nUse: scout, architect';
const SKILL='.claude/skills/docs-style.md',RULE='do not delete data/\n';
const asleep='name: docs-style\ndescription: docs-style skill\nwhen: docs\n';
const agent=(n,m)=>({['.claude/agents/'+n+'.md']:'name: '+n+'\nmodel: '+m+'\n'});

/* The run of the scenario as shipped, before the learner edits anything: the start the chapter measures against. The goals read it at load
   (no DOM, so it works in the browser too), the checks read it again from the graded run's own scenario. */
const run0=(sc,prompt)=>AQ.policy.run(sc,AQ.config.parseSetup(AQ.vfs.create(sc.vfs)),prompt,{vfs:AQ.vfs.create(sc.vfs),history:sc.history||[]});
const before=c=>run0(c.scenario,c.prompt);
const start=(key,text)=>{const sc=AQ.scenarios[key];return run0(sc,AQ.config.parsePrompt(text,sc,AQ.config.parseSetup(AQ.vfs.create(sc.vfs))));};
const cap=n=>Math.floor(n*KEEP);
const saved=(b,a)=>Math.round(100*(b-a)/b);
const peakLine=(b,a)=>'Start ~'+b+', yours ~'+a+', saved '+saved(b,a)+'%.';
const searched=o=>o.steps.some(s=>s.type==='delegate'&&s.files>0);
/* the run calls a helper by name and takes the first file with that name, so exactly one helper may carry it, and in its own file */
const homeless=(c,n)=>{const s=c.setup.subagents.filter(a=>a.name===n);return s.length===1&&s[0].path==='.claude/agents/'+n+'.md'?null:'The run names '+n+', so exactly one helper must be called '+n+', in .claude/agents/'+n+'.md. Do not rename a helper or copy it to another file.';};

const S0=start('tuneMeasure',FIX).tokens.peak,H0=AQ.helperCost(start('tuneHelpers',FIND));
const B0=start('tuneBoth',BOTH),S2=B0.tokens.peak,H2=AQ.helperCost(B0);

AQ.CH.push({
  name:'Measure, then cut',badge:'Cost Cutter',tier:'tune',
  intro:'You have audited a setup and made it lighter. This chapter adds the habit that keeps it honest: measure first, cut, and measure again. A cut you did not measure may have saved nothing, or cut the wrong thing. You will cut a setup by a share of its starting size, resize the helper a run really calls, and then tune a setup and its helpers together.',
  learned:['Measuring before and after','Resizing the helper that runs','Tuning memory and helpers together'],
  missions:[
    {
      title:'Measure before you cut',scenario:'tuneMeasure',kind:'config',prompt:FIX,facts:['memory-files'],
      goal:'Run this job before you change anything: the agent holds about '+S0+' tokens at once, and that is your starting number. Three things in the setup fill it that this job does not need: the five <code>Standup note</code> lines in <code>CLAUDE.md</code>, the skill <code>docs-style</code> with its long <code>description:</code> (it is asleep for this job, but its description is loaded anyway) and the five servers in <code>.claude/mcp.txt</code>. Cut the setup until the most the agent holds at once is 60% of the start or less: '+cap(S0)+' tokens or fewer. Keep the rule <code>do not delete data/</code>.',
      how:[
        'Read the Meter after a run: it shows the most the agent held at once. Note the start, about '+S0+', then change <code>CLAUDE.md</code>, <code>.claude/skills/docs-style.md</code> or <code>.claude/mcp.txt</code> and run again. Each time, compare the new number with the start.',
        'The five <code>Standup note</code> lines are the biggest piece. Delete them from <code>CLAUDE.md</code> and keep <code>do not delete data/</code>. That alone is not enough: the number stays above '+cap(S0)+'.',
        'Then cut one more thing. Either shorten the <code>description:</code> line of <code>.claude/skills/docs-style.md</code> and leave the other lines, or empty <code>.claude/mcp.txt</code>, since this job calls no tool. The skill and the servers on their own do not get you there either.',
        'Keep the rule. Without it the agent deletes <code>data/backup.csv</code>, and the Run panel shows the delete going through.'
      ],
      explain:'A cut is worth what it measures. Without the starting number you cannot say how much you saved, or which cut did it: here the notes save the most, and the description and the servers each save a little less. A share of the start (60% or less) is a fair goal because it stays true when the setup grows. The message shows the start, your number and the share saved, the same three numbers you would write in a pull request.',
      hint:'Delete the <code>Standup note</code> lines from <code>CLAUDE.md</code>, then also shorten one <code>description:</code> or empty <code>.claude/mcp.txt</code>.',
      answer:{files:{'CLAUDE.md':RULE,[SKILL]:asleep}},
      wrong:{files:{'CLAUDE.md':RULE}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        const b=before(c).tokens.peak,a=o.tokens.peak;
        return a<=cap(b)?true:peakLine(b,a)+' The goal is '+cap(b)+' or fewer. Look at what is still loaded: the notes, the description of the skill and the server lines.';
      }
    },
    {
      title:'Size the helper the run uses',scenario:'tuneHelpers',kind:'config',prompt:FIND,facts:['subagents'],
      goal:'This job hands its search to the helper <code>scout</code>, as in missions 2.5, 6.4 and 10.2. Both helpers in <code>.claude/agents/</code> are <code>large</code>, and the run pays '+H0+' units for <code>scout</code> (<code>small</code> costs 1 unit, <code>standard</code> 3 and <code>large</code> 10). Looking for a file does not need a big model. Change the model of the helper the run names so the run pays '+COST1+' units or fewer, and keep the search working.',
      how:[
        'The run names <code>scout</code> in its <code>Use</code> line, so <code>scout</code> is the helper it pays for. Change <code>model: large</code> to <code>model: small</code> (1 unit) or <code>model: standard</code> (3 units) in <code>.claude/agents/scout.md</code>.',
        'The other helper, <code>architect</code>, is not named, so this run pays nothing for it. Changing it saves nothing: measure the helpers the run paid for, not the ones in the folder.',
        'Keep <code>name: scout</code> in <code>scout.md</code>. The run finds a helper by its name, and the practice wants the helper that carries the name in that file. Giving the name to another file does not move the helper.',
        '<code>model:</code> takes <code>small</code>, <code>standard</code> or <code>large</code>. Any other word is a helper the practice cannot read, and the run is refused.'
      ],
      explain:'A run pays for the helpers it names, at the price of their model, so the saving is in the helper that actually runs. A different helper cut to the smallest size changes nothing, and a measurement before and after is what shows it. Looking for a file is a simple job, so a small or a standard model does it here as well as a large one.',
      hint:'Open <code>.claude/agents/scout.md</code> and change only the <code>model:</code> line.',
      answer:{files:agent('scout','small')},
      wrong:{files:agent('architect','small')},
      lazy:{files:{}},
      check:(o,c)=>{
        if(!searched(o))return 'Nobody searched for you. Keep the helper scout, so it can read the files.';
        const h=homeless(c,'scout');
        if(h)return h;
        const n=AQ.helperCost(o),b=AQ.helperCost(before(c));
        if(n>COST1)return 'The helpers cost '+b+' units at the start and '+n+' now. The run named scout, and the goal is '+COST1+' or fewer. Change the model of scout, the helper the run names.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Tune the whole setup',scenario:'tuneBoth',kind:'config',prompt:BOTH,facts:['memory-files','subagents'],
      goal:'Now both cuts at once. This job names two helpers, <code>scout</code> and <code>architect</code>, both <code>large</code>, so the run pays '+H2+' units for them. The setup has the same three extras as in mission 23.1: standup notes, an unused skill with a long description and five servers, so the agent holds about '+S2+' tokens at once. Get both numbers down: the most the agent holds at once to 60% of the start ('+cap(S2)+' tokens or fewer) and the helpers to '+COST2+' units or fewer. Keep <code>do not delete data/</code>. And keep <code>architect</code> above <code>small</code>: it decides what to change, and in this practice a helper that decides is not shrunk to the smallest size.',
      how:[
        'Do the two earlier cuts together. For the memory, delete the <code>Standup note</code> lines of <code>CLAUDE.md</code> and shorten one other source, as in 23.1. For the helpers, change the models in <code>.claude/agents/</code>, as in 23.2.',
        'The run names both helpers, so it pays for both. <code>scout</code> only looks for files, so <code>small</code> (1 unit) is enough. <code>architect</code> at <code>standard</code> (3 units) brings the two to 4 units.',
        'One cut is not enough. The notes alone leave the helpers at '+H2+' units, and the models alone leave the agent holding about '+S2+' tokens. Each message shows both numbers, so read the line that is still over.',
        'Keep the rule, and keep each helper in its own file under its own name. <code>architect</code> at <code>small</code> costs less but is not what this goal asks for.'
      ],
      explain:'A setup has two costs that do not move together: what the agent holds at once, and what the helpers cost. A cut to one does nothing for the other, so measure both before and after. A model should follow the work: a helper that only looks something up can be small, and the one that decides is worth a bigger size. This practice cannot tell whether a model is clever enough. It only knows what each size costs, and keeps the deciding helper off the smallest as a rule of thumb.',
      hint:'Delete the <code>Standup note</code> lines and shorten one more source, then set <code>scout</code> to <code>small</code> and <code>architect</code> to <code>standard</code>.',
      answer:{files:{'CLAUDE.md':RULE,[SKILL]:asleep,...agent('scout','small'),...agent('architect','standard')}},
      wrong:{files:{...agent('scout','small'),...agent('architect','standard')}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        if(!searched(o))return 'Nobody searched for you. Keep the helpers, so they can read the files.';
        const h=homeless(c,'scout')||homeless(c,'architect');
        if(h)return h;
        const b=before(c),pb=b.tokens.peak,pa=o.tokens.peak,hb=AQ.helperCost(b),ha=AQ.helperCost(o);
        const both='Held at once: '+peakLine(pb,pa)+' Helpers: from '+hb+' to '+ha+' units.';
        if(pa>cap(pb))return both+' The most the agent holds at once must be '+cap(pb)+' or fewer.';
        if(ha>COST2)return both+' The helpers must cost '+COST2+' units or fewer. Make the models smaller.';
        return c.setup.subagents.find(a=>a.name==='architect').model==='small'?'architect decides what to change, so it must stay above small. Use standard.':true;
      }
    }
  ]
});
})();
