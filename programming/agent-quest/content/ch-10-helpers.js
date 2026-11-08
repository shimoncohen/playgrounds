/* Agent Quest chapter 10: subagents, parallel work, worktrees. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const DEV=['goal','donewhen','constraints','files','examples','plan','use'];
const MOST=3;
const searched=o=>o.steps.some(s=>s.type==='delegate'&&s.files>0);
const NOBODY='Nobody searched for you. Hand the search to a helper.';
const tooDear=o=>{const n=AQ.helperCost(o);return n>MOST?'The helpers you used cost '+n+' units. The most allowed here is '+MOST+'.':null;};

AQ.CH.push({
  name:'Subagents, parallel work, worktrees',badge:'Tidy Summaries',tier:'dev',
  story:'The shop code needs many readers; send helpers into the shelves and find the stack of tidy summaries.',
  intro:'The shop code needs many readers, so Cog sends helpers into the shelves. Some jobs are too big for one agent to hold in mind. Here the agent hands the reading to helpers. A helper works in its own context, so what it reads never crowds the main agent. You will delegate a search, pay only for the helpers a run really uses (a setup lists the price of every helper, but a run pays only for the ones it hands work to), and split a search that is too big for one helper.',
  learned:['Delegating a search','Paying per helper','Splitting a search'],
  missions:[
    {
      title:'Send the search away',scenario:'haystack',kind:'prompt',fields:DEV,facts:['subagents'],
      goal:'Dana\'s shop code needs many readers. The rounding bug is hiding somewhere in ten files, and one of them is an old copy of the price code. Reading them all would fill the main agent\'s context. Instead, <b>delegate</b> the search: hand the job to a helper, which reads in its own context and sends back only what matters. The main agent may hold at most '+AQ.PEAK+' tokens at once.',
      how:[
        'The two lines <code>Use: scout</code> and <code>Done when: run npm test</code> hand the file search to the helper <code>scout</code>, then prove the fix with the tests.',
        '<code>Use</code> names a helper from <code>.claude/agents/</code>. The helper reads the project in its own context, so none of its reading counts toward what the main agent holds.',
        'The helper sends back the one file that matters, <code>src/price.js</code>, and the main agent reads only that.',
        'Leave the <code>Files</code> line out. With the file already named there is nothing left to search, and the helper has no work to do.'
      ],
      explain:'To delegate is to hand a job to a helper. A subagent has a context of its own, so the ten files it reads fill its window and not yours. What comes back is short: the file the fix is in. A helper only earns its keep while there is something to search. Name the file yourself and the search is already done.',
      hint:'Name the helper in a <code>Use</code> line, and do not name the file yourself.',
      answer:'Use: scout\nDone when: run npm test',
      wrong:'Files: src/\nDone when: run npm test',
      lazy:'Done when: run npm test',
      check:(o,c)=>searched(o)?AQ.verdict(o,c):NOBODY
    },
    {
      title:'Pay only for the helpers you use',scenario:'team',kind:'prompt',fields:DEV,facts:['subagents'],
      goal:'The shop keeps three helpers on call: <code>scout</code> (small), <code>analyst</code> (standard) and <code>architect</code> (large). The setup lists the price of all three, but a run pays only for the helpers it hands work to. Hand the search to a helper that fits, and keep what the run pays for helpers at '+MOST+' units or fewer.',
      how:[
        'The line <code>Use: scout</code> hands the search to the small helper, which costs 1 unit this run. The other two helpers stay idle and cost nothing.',
        'Every helper you name in <code>Use</code> costs its price, even if it finds nothing: small is 1 unit, standard 3 and large 10.',
        '<code>analyst</code> would fit as well, at 3 units. <code>architect</code> alone costs 10, far over the limit.',
        'Prices add up. <code>scout</code> and <code>analyst</code> together cost 4 units.'
      ],
      explain:'Chapters 2 and 6 priced a setup: what a run would cost if every helper ran. A run is cheaper than that. It pays only for the helpers you name in <code>Use</code>, so a large helper on the team costs nothing until you call on it. Match the helper to the job, and name only the ones it needs.',
      hint:'Pick one helper whose price fits the limit, and name it in a <code>Use</code> line.',
      answer:'Use: scout\nDone when: run npm test',
      wrong:'Use: architect\nDone when: run npm test',
      lazy:'Done when: run npm test',
      check:(o,c)=>searched(o)?(tooDear(o)||AQ.verdict(o,c)):NOBODY
    },
    {
      title:'Split a huge search',scenario:'huge',kind:'prompt',fields:DEV,facts:['subagents','worktrees'],
      goal:'Dana\'s shop code is so big that one helper cannot hold everything it reads. A helper has a window of '+AQ.context.WINDOW+' tokens too, and past it the helper loses track of files. Split the search over two small helpers, <code>scout</code> and <code>scout2</code>, and keep what the run pays for helpers at '+MOST+' units or fewer.',
      how:[
        'The line <code>Use: scout, scout2</code> hands the search to two helpers. The Run panel shows each helper and how many tokens it held.',
        'The files are shared out in order, so <code>scout</code> takes the first three of the five and <code>scout2</code> the last two. Each share fits a window.',
        'One helper alone would read all five files and hold about 2800 tokens, more than its window, so it would lose track of some.',
        'A third name such as <code>architect</code> cuts the search into three, but a large helper costs 10 units, far over the limit.',
        'Real agents can also run helpers in <b>parallel</b>, at the same time. Git can give each one its own <b>worktree</b>, a separate working folder for the same repository. This practice has no clock and no second folder, so it shows only how the reading is split.'
      ],
      explain:'A helper\'s window is as small as yours, so a job that is too big for one helper has to be cut in pieces. The practice hands the files to the helpers in order and each reads its share in its own window. Helpers that run in <b>parallel</b>, at the same time, also finish sooner. Their edits are the risky part, because two helpers changing the same files at once would collide. A <b>worktree</b> keeps their files apart. Here only the reading side is simulated.',
      hint:'One helper is too few. Name two small ones.',
      answer:'Use: scout, scout2',
      wrong:'Use: scout',
      lazy:'Done when: run npm test',
      check:(o,c)=>{
        if(!searched(o))return NOBODY;
        if(o.steps.some(s=>s.type==='delegate'&&s.over))return 'A helper held more than its window of '+AQ.context.WINDOW+' tokens and lost track of files. Split the search over two helpers.';
        return tooDear(o)||AQ.verdict(o,c);
      }
    }
  ]
});
})();
