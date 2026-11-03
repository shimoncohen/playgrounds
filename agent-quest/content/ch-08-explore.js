/* Agent Quest chapter 8: explore, plan, implement. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const ALL=['goal','donewhen','constraints','files','examples','plan'];
const skippedNotSeen=(o,target)=>o.steps.some(s=>s.type==='skip'&&s.by==='not seen yet'&&s.target===target);

AQ.CH.push({
  name:'Explore, plan, implement',badge:'Scope Setter',tier:'dev',
  intro:'Good work on a code project goes in three steps: explore, plan, then change. This chapter drills the habits around them. You will send an agent to look around without letting it touch the code, cap how many files a change may reach, and hand the notes of one run to the next so it does not start from nothing.',
  learned:['Read-only exploration','Capping a change','Hand-off notes'],
  missions:[
    {
      title:'Look without touching',scenario:'survey',kind:'prompt',fields:ALL,
      goal:'Send the agent to <b>explore</b>: to read around the cart code, find out why the cart total is off, and write what it finds into <code>NOTES.md</code>. It also wants to "just fix" the code it finds. Limit it so the notes file is the only file it may change.',
      how:[
        'The line <code>Constraints: only edit NOTES.md</code> lets the agent change one file, the notes, and skips every other edit.',
        '<code>only</code> is the opposite of <code>do not</code>: instead of listing what is banned, it names the one thing that is allowed.',
        '<code>edit NOTES.md</code> is the verb and the target, as in every rule. Edits to the notes go ahead, and an edit to a code file is skipped.',
        'Leave the <code>Files</code> line out. The agent then reads the cart folder by itself, so it knows enough to write a real finding.'
      ],
      explain:'An exploration run may change nothing but its notes. A goal such as "only look" is a wish, but a rule blocks the edit. The notes then hold what the agent learned, ready for the next run. The finding can only be written after the agent has read the code, so do not shrink what it reads too far.',
      hint:'Name the one file the agent may change, with a rule that starts with <code>only</code>, and let it read the cart code.',
      answer:'Constraints: only edit NOTES.md',
      wrong:'Constraints: only edit src/',
      lazy:'Goal: look around',
      check:(o,c)=>{
        if(!c.prompt.constraints.some(x=>x.kind==='only'&&x.verb==='edit'))return 'Nothing limited what the agent could edit. Name the one file it may change.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Cap the change',scenario:'creep',kind:'prompt',fields:ALL,
      goal:'The agent should fix the rounding bugs in <code>src/price.js</code> and <code>src/tax.js</code>, and then it wants to tidy <code>src/format.js</code> too. A change that keeps growing is harder to check. Cap it: say how many files the agent may change at most, and prove the fixes work.',
      how:[
        'The two lines <code>Constraints: max 2 files</code> and <code>Done when: run npm test</code> let the agent change two different files at most, then run the tests.',
        '<code>max 2 files</code> is a rule about size. It counts different files, not edits: changing one file twice still counts once.',
        'Two bugs in two files need a cap of two. A cap of one would stop the second fix, and a cap of three would let the tidy-up in.',
        '<code>Done when: run npm test</code> checks that both fixes work.'
      ],
      explain:'A cap does not know which file matters. The agent spends it on files in the order it works, so here the price fix and the tax fix come first and the tidy-up is cut off. Too tight a cap leaves the job half done, and too loose a cap lets the extra changes in.',
      hint:'Count the files the two fixes need, and write a rule with that number.',
      answer:'Constraints: max 2 files\nDone when: run npm test',
      wrong:'Constraints: max 1 files',
      lazy:'Done when: run npm test',
      check:(o,c)=>{
        if(!c.prompt.constraints.some(x=>x.kind==='max'))return 'Nothing capped how many files it may change.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Hand the notes to the next run',scenario:'handoff',kind:'prompt',fields:ALL,
      goal:'The last run left notes in <code>NOTES.md</code> about a bug in the cart. Read them in the Files panel, then start a new run that fixes the bug. The cart folder is big: a run that reads all of it holds more than 400 tokens at once. Stay under that limit, and have the agent prove the fix.',
      how:[
        'The two lines <code>Files: NOTES.md, src/cart/total.js</code> and <code>Done when: run npm test</code> give the agent the notes and the one file they point to, then check the result.',
        'The agent can change a file only if it has read it. The notes tell it where the bug is, and reading that file lets it change the file.',
        'Naming the whole cart folder would read big files the notes do not need, and push the run over 400 tokens.',
        '<code>Done when: run npm test</code> runs the tests at the end, so the fix is verified.'
      ],
      explain:'Notes are how one run hands work to the next. A run that starts from good notes reads only what matters, so it stays small and still knows where to edit. A run that ignores them has to explore all over again. When the work is done, a change usually goes to a pull request (PR): the page where teammates read your change before it joins the main code.',
      hint:'Give the agent the notes and the file they point to, and nothing else.',
      answer:'Files: NOTES.md, src/cart/total.js\nDone when: run npm test',
      wrong:'Files: src/cart/total.js\nDone when: run npm test',
      lazy:'Done when: run npm test',
      check:(o,c)=>{
        if(skippedNotSeen(o,'src/cart/total.js'))return o.calls.some(x=>x.verb==='read'&&x.target==='NOTES.md')
          ?'The agent read the notes but never opened src/cart/total.js, so it could not edit it. Give it that file too.'
          :'The agent never read the notes the last run left, so it did not know where to edit. Give it the notes.';
        if(o.tokens.peak>AQ.PEAK)return 'The agent held about '+o.tokens.peak+' tokens at once. The most allowed here is '+AQ.PEAK+'. Read only what the notes point to.';
        if(o.status!=='done')return 'The fix was never verified. Say how to check it.';
        return AQ.verdict(o,c);
      }
    }
  ]
});
})();
