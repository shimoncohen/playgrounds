/* Agent Quest chapter 9: test, review, PR. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const ALL=['goal','donewhen','constraints','files','examples','plan'];
const JUDGES=['tests/price.test.js','package.json'];
const PUSH='git push origin main';

AQ.CH.push({
  name:'Test, review, PR',badge:'Inspector\'s Stamp',tier:'dev',
  story:'A green light is not proof; guard the scale\'s test and ask for a review, and find the inspector\'s stamp.',
  intro:'A green light is not proof, and the inspector\'s stamp has to be earned. A passing test is not proof. An agent can make a test pass by cheating, and a green test is not always everything a project asks for. This chapter makes you the gatekeeper: you will fence off the tests so they cannot be gamed, run the project\'s own full check, and make the agent open a pull request instead of pushing straight to <code>main</code>.',
  learned:['Protecting the tests','The project gate','Pull requests'],
  missions:[
    {
      title:'Protect the judge',scenario:'gamed',kind:'prompt',fields:ALL,
      goal:'Dana wants proof, not a green light. The tests judge the fix, but the agent can also make them pass by cheating. It can switch a test off in <code>tests/price.test.js</code>, or change the <code>test</code> script in <code>package.json</code> so that it only prints "ok". Fence off both ways, and still let the real fix through.',
      how:[
        'The two lines <code>Constraints: only edit src/</code> and <code>Done when: run npm test</code> let the agent change code under <code>src/</code> only, then prove the fix with the tests.',
        '<code>only edit src/</code> skips every edit outside the code folder, so both the test file and <code>package.json</code> are out of reach.',
        'Banning each file with <code>do not edit</code> works too, but both need a rule. Banning only the test file leaves <code>package.json</code> open.',
        'Without <code>Done when</code> nothing checks the price, and the agent never gets the chance to fix it.'
      ],
      explain:'A test only judges the code if the agent cannot touch the judge. An agent told to make the tests pass can take a shortcut: edit the test, or edit the script that runs it. Here the fence has to be typed in your prompt, so that this one job carries its own protection.',
      hint:'Two files can be edited to fake a pass. Either allow edits in the code folder only, or ban both files.',
      answer:'Constraints: only edit src/\nDone when: run npm test',
      wrong:'Constraints: do not edit tests/\nDone when: run npm test',
      lazy:'Done when: run npm test',
      check:(o,c)=>{
        const setup=AQ.config.parseSetup(AQ.vfs.create({}));
        const open=JUDGES.filter(t=>AQ.permissions.check({verb:'edit',target:t},setup,c.prompt.constraints,{edited:[]}).allowed);
        if(open.length)return 'Your prompt does not stop the agent from editing '+open.join(' and ')+'. The fence has to be in the prompt itself.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Run the repo\'s own gate',scenario:'gate',kind:'prompt',fields:ALL,
      goal:'A passing test is not always the whole <b>gate</b>: the set of checks a project demands before a change may join. This project keeps its gate in one command, and its README names it. Read the README in the Files panel, and make the agent finish by running that command.',
      how:[
        'The line <code>Done when: run npm run check</code> makes the agent finish with the project\'s own gate, the command the README names.',
        '<code>npm run check</code> is more than <code>npm test</code>: it runs the tests and also makes sure no <code>console.log</code> is left in <code>src/</code>.',
        'If the gate fails, the agent repairs the problem and runs it again, like any other check.',
        '<code>npm test</code> alone would pass while a debug line ships, so the gate command is the one that counts.'
      ],
      explain:'Tests are one check among several. A project often wraps them in one command with more checks, such as a ban on leftover debug lines. Anything less than that command can pass while the project would still turn the change down. Read the README to learn the command instead of guessing it. Here the gate has to come from your prompt.',
      hint:'The README in the Files panel has the exact command. Put it in a <code>Done when</code> line.',
      answer:'Done when: run npm run check',
      wrong:'Done when: run npm test',
      lazy:'Goal: fix the rounding bug',
      check:(o,c)=>{
        if(c.prompt.doneWhen&&c.prompt.doneWhen.target==='npm run check')return AQ.verdict(o,c);
        if(o.calls.some(x=>x.target==='npm run check'))return 'The gate ran, but not from a Done when line in your prompt.';
        const v=AQ.verdict(o,c);
        return v!==true?v:'The project\'s own gate never ran. The README says which command it is.';
      }
    },
    {
      title:'Open the PR, never push to main',scenario:'ship',kind:'prompt',fields:ALL,
      goal:'The agent has fixed the bug and wants to share it. Pushing straight to <code>main</code>, the branch everybody builds from, skips the review. Stop that, and let the rest of its work go through: it should push to its own branch and open a pull request (PR).',
      how:[
        'The line <code>Constraints: do not run '+PUSH+'</code> blocks the one command that pushes straight to <code>main</code>.',
        'The Run panel shows the order: the tests run first, then <code>git push origin fix-rounding</code> to the agent\'s own branch, then <code>gh pr create</code> opens the PR.',
        'A rule must name the exact command. <code>do not run git push</code> alone is not a command this project has.',
        '<code>ask before run '+PUSH+'</code> stops the push too. In this practice run nobody answers, so the push is not carried out.'
      ],
      explain:'The tests run before the push, so the pull request carries a change that already passed them. The agent never pushes to <code>main</code> directly, because the pull request is where someone else reads the change before it lands. Type the rule in your prompt: this mission looks for it there, not in the files of chapter 7.',
      hint:'Ban the exact command that pushes to <code>main</code>. The push to its own branch and the PR command must stay allowed.',
      answer:'Constraints: do not run '+PUSH,
      wrong:'Constraints: do not run gh pr create',
      lazy:'Done when: run npm test',
      check:(o,c)=>{
        if(!c.prompt.constraints.some(x=>(x.kind==='do not'||x.kind==='ask before')&&x.verb==='run'&&x.target===PUSH))return 'Nothing in your prompt stopped the agent from pushing straight to main. Fence that push off.';
        return AQ.verdict(o,c);
      }
    }
  ]
});
})();
