/* Agent Quest chapter 11: hooks for lint, format and guards. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const BASE='Goal: fix the rounding bug in src/price.js';
const HEAD='# before VERB TARGET\n# after edit PATH run COMMAND\n';
const hooked=(o,run)=>o.steps.some(s=>s.type==='hook'&&s.when==='after'&&s.run===run&&s.ok);

AQ.CH.push({
  name:'Hooks for lint, format, guards',badge:'Tidy Cloth',tier:'dev',
  story:'Cog\'s work gets a polish after every edit; find the tidy cloth.',
  intro:'Cog\'s work gets a polish after every edit, and a tidy cloth hangs by the bench. A hook that stops an action is only half of what hooks can do. A hook can also run a command after the agent changes a file, to check the result or to tidy it, and it does so on every edit, whatever the agent planned. Here you will check each edit as it happens, let a command fix the file for the agent, and pair a hook that stops an action with one that checks the work.',
  learned:['After-edit hooks','Formatter hooks','Stopping and checking'],
  missions:[
    {
      title:'A check after every edit',scenario:'linty',kind:'config',prompt:BASE,facts:['hooks'],
      goal:'Cog polishes his work after every edit. The agent\'s fix works, but it leaves a stray <code>console.log</code> behind, and <code>npm run lint</code> rejects that. A hook can run a command <b>after</b> the agent edits a file. Add a hook so the lint check runs after every edit in <code>src/</code>, and the agent cleans up on the spot.',
      how:[
        'The line <code>after edit src/ run npm run lint</code> in <code>.claude/hooks.txt</code> runs the lint command after every edit of a file under <code>src/</code>.',
        '<code>after edit</code> says when: the hook fires once the agent has changed a file, where <code>before</code> fires ahead of an action.',
        '<code>src/</code> is the path the edit must be under. An edit somewhere else, such as <code>docs/</code>, does not fire it.',
        '<code>run npm run lint</code> is the command. When it fails, the agent repairs the file and the hook runs again, up to three times.'
      ],
      explain:'A <code>before</code> hook stops an action, and an <code>after edit</code> hook checks the result. It fires on every edit, whatever the agent planned, and a failure goes back to the agent to repair. No <code>Done when</code> is needed here: with none, the last result of the hook decides whether the run is done.',
      hint:'Open <code>.claude/hooks.txt</code> and add one line: <code>after edit</code>, the folder the fix is in, then <code>run</code> and the lint command.',
      answer:{files:{'.claude/hooks.txt':HEAD+'after edit src/ run npm run lint\n'}},
      wrong:{files:{'.claude/hooks.txt':HEAD+'after edit docs/ run npm run lint\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        return hooked(o,'npm run lint')?true:'The file was fixed, but no hook checked it. This mission is about a hook after the edit.';
      }
    },
    {
      title:'A hook that fixes the file',scenario:'messy',kind:'config',prompt:BASE,facts:['hooks'],
      goal:'The agent\'s edit leaves tabs in <code>src/price.js</code>, and <code>npm run lint</code> rejects tabs. A <b>formatter</b> is a command that rewrites a file into the project\'s style by itself, so nobody has to repair it by hand. Add a hook that runs the formatter, <code>npm run format</code>, after the edit, so the agent has nothing to repair.',
      how:[
        'The line <code>after edit src/ run npm run format</code> runs the formatter after every edit under <code>src/</code>, and the file comes out in the project\'s style.',
        'A formatter changes the file mechanically. A lint check only reports a problem, and then the agent has to repair the file itself.',
        'The Run panel shows the difference: with the formatter there is no repair step, and with lint there is one.',
        '<code>npm run lint</code> as the hook makes the run succeed, but only because the agent repaired the tabs on its own. The mission still wants the formatter hook.'
      ],
      explain:'Use a check when a person or the agent has to decide how to fix the problem, and use a formatter when the fix is mechanical. A formatter hook fixes the file the moment it changes, every time, with no repair left to the agent. That saves a round of the agent working it out.',
      hint:'The command that rewrites the file is <code>npm run format</code>. Hook it to edits under <code>src/</code>.',
      answer:{files:{'.claude/hooks.txt':HEAD+'after edit src/ run npm run format\n'}},
      wrong:{files:{'.claude/hooks.txt':HEAD+'after edit src/ run npm run lint\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        if(o.steps.some(s=>s.tag==='fix'))return 'The file was fixed, but the agent had to repair it itself. A formatter hook rewrites the file for it, so nothing is left to repair.';
        return hooked(o,'npm run format')?true:'The file was fixed, but no formatter hook did it. Add a hook that runs the formatter after the edit.';
      }
    },
    {
      title:'Stop it, then check it',scenario:'both',kind:'config',prompt:BASE,facts:['hooks'],
      goal:'The agent also wants to run <code>npm run deploy</code>, which nobody asked for, and its fix still leaves a stray <code>console.log</code>. Use both kinds of hook: one that stops the deploy before it happens, and one that checks the lint after every edit in <code>src/</code>.',
      how:[
        'The two lines <code>before run npm run deploy</code> and <code>after edit src/ run npm run lint</code> stop the deploy and check each edit.',
        '<code>before</code> keeps an action from happening at all. That suits a risk, like a deploy, that cannot be undone.',
        '<code>after edit</code> lets the edit happen, then checks it. That suits a fault the agent can still repair.',
        'The two hooks do different jobs, so one cannot stand in for the other. A <code>before</code> hook on the lint command only stops the agent from ever running it.'
      ],
      explain:'Choose by what can still be undone. An action you could not take back, such as a deploy, needs a hook that stops it first. An edit can be checked once it is made and repaired if it fails. A hook line counts only in one of two shapes, <code>before VERB TARGET</code> or <code>after edit PATH run COMMAND</code>. Any other shape is ignored, and the action goes ahead.',
      hint:'You need two lines in <code>.claude/hooks.txt</code>, one of each kind.',
      answer:{files:{'.claude/hooks.txt':HEAD+'before run npm run deploy\nafter edit src/ run npm run lint\n'}},
      wrong:{files:{'.claude/hooks.txt':HEAD+'before run npm run deploy\nbefore run npm run lint\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        if(!hooked(o,'npm run lint'))return 'The file was fixed, but no hook checked it. Add a hook that runs the lint after the edit.';
        return o.steps.some(s=>s.type==='skip'&&s.by==='hook'&&s.target==='npm run deploy')?true:'The deploy was stopped, but not by a hook. Add the line to the hooks file.';
      }
    }
  ]
});
})();
