/* Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). Positions in comments are [chapter, mission], both 0-based;
   the cards say the in-game label, which is one more on each. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const FIELDS=['goal','donewhen','constraints','files','examples','plan','use'];
const SIGNED=['documents/lease-signed.txt','documents/will-signed.txt'];

AQ.CH.push({
  name:'Files and documents',badge:'Desk Clearer',tier:'personal',
  intro:'Files pile up, and an agent that tidies them can delete the wrong ones. In this chapter you protect every PDF in a folder with one pattern, lock every signed copy by its name, and try a big batch on three files before you let it run on all of them.',
  learned:['One rule for many files','Locking files by name','Trying a batch on three first'],
  missions:[
    {
      title:'Sort the downloads',scenario:'downloads',kind:'prompt',fields:FIELDS,
      goal:'Your <code>downloads/</code> folder holds an old draft and two PDFs: an invoice and a receipt you must keep. The agent sorts the folder by moving every file into <code>archive/</code>. A move is two actions: the agent writes a copy into <code>archive/</code>, then deletes the original. Let it move the draft, and stop it deleting the PDFs, these two and any that land here later. One rule can do that, because in a path <code>*</code> stands for any text: <code>reports/*.csv</code> would mean every path that starts with <code>reports/</code> and ends in <code>.csv</code>.',
      how:[
        'The line <code>Constraints: do not delete downloads/*.pdf</code> stops the agent deleting any file in <code>downloads/</code> whose name ends in <code>.pdf</code>, and the draft is still moved.',
        '<code>do not delete</code> is the rule and <code>downloads/*.pdf</code> is the target. The <code>*</code> stands for any text, so the pattern covers the invoice, the receipt and any PDF that arrives next month.',
        'The star may stand for a folder name too: <code>*.pdf</code> on its own covers every PDF in the project, in any folder.',
        'A pattern that is too wide stops the draft as well: <code>downloads/*</code> covers the draft, so it is never moved. Writing each PDF out by name also keeps these two, but it is not the one rule this mission is about, and the next PDF would be deleted.'
      ],
      explain:'A star saves you from listing files one by one, and it keeps working when new files arrive. It also reaches across folders, so the pattern decides how much it covers: too narrow and a PDF slips through, too wide and the draft cannot be moved either. The practice refuses a pattern that matches no file in the project, so a typo shows up before the agent runs.',
      hint:'Write a rule against deleting, and end the target with the part every PDF shares, <code>.pdf</code>.',
      answer:'Constraints: do not delete downloads/*.pdf',
      wrong:'Constraints: do not delete downloads/*.txt',
      lazy:'',
      check:(o,c)=>{
        const moved=c.scenario.accept(o);
        if(moved!==true)return moved;
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        return c.prompt.constraints.some(x=>x.verb==='delete'&&x.target.includes('*'))?true:'The PDFs are safe, but this mission is about one rule that covers every .pdf: a path with a * in a rule you type under Constraints. Anything else would miss the next PDF.';
      }
    },
    {
      title:'Lock every signed copy',scenario:'contracts',kind:'config',prompt:'Goal: tidy up documents/',
      goal:'The folder <code>documents/</code> holds a lease and a will. Each has a draft you may still change and a signed copy you must never touch. The agent is tidying the folder, and it wants to rewrite and then delete every file in it, signed copies included. Stop it changing or deleting any signed copy, and let it tidy the drafts. New contracts will arrive, so write the rules once, by the part of the name that every signed copy shares.',
      how:[
        'The two lines <code>deny edit *-signed.txt</code> and <code>deny delete *-signed.txt</code> in <code>.claude/permissions.txt</code> stop the agent changing or deleting any file whose name ends in <code>-signed.txt</code>, and leave the drafts alone.',
        '<code>deny</code> starts each line, <code>edit</code> and <code>delete</code> are the two verbs, and <code>*-signed.txt</code> is the target: any text, then <code>-signed.txt</code>.',
        'You need both lines. A rule stops one verb, so with only the edit line the agent can still delete the signed copies.',
        'A rule on the whole folder, <code>deny edit documents/</code>, is tempting but wrong: it stops the agent tidying the drafts too.'
      ],
      explain:'A pattern protects files that do not exist yet: next year\'s signed contract is covered by the rules you write today. Each rule stops one verb, so every verb the agent might use needs a line of its own. This mission accepts only the permission list, because permission rules are checked on every action and never dropped to make room.',
      hint:'Open <code>.claude/permissions.txt</code>. The agent both edits and deletes the signed copies, so each of those verbs needs its own <code>deny</code> line.',
      answer:{files:{'.claude/permissions.txt':'# deny VERB TARGET\ndeny edit *-signed.txt\ndeny delete *-signed.txt\n'}},
      wrong:{files:{'.claude/permissions.txt':'# deny VERB TARGET\ndeny edit *-signed.txt\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const s=o.steps.find(x=>x.type==='skip'&&SIGNED.includes(x.target)&&x.by!=='permission rule');
        if(s)return s.target+' was stopped by '+s.by+', not by a permission rule. This mission is about the list in .claude/permissions.txt.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Try the batch on three first',scenario:'stamp',kind:'prompt',fields:FIELDS,
      goal:'The folder <code>notes/</code> holds eight weekly notes, and the agent will stamp each one as reviewed. A stamp is a small change, but if it were wrong, eight notes would carry it. Try the batch on three first: say how many files the agent may change at most, and check the first few before you let it do the rest.',
      how:[
        'The line <code>Constraints: max 3 files</code> lets the agent change three different files at most, and then it stops.',
        '<code>max 3 files</code> is a rule about size. It counts different files, not edits: changing one file twice counts once.',
        'The agent stamps the notes in order, week 1 first, so the first three get the stamp and the other five stay as they were.',
        'A smaller number also keeps the batch to three or fewer. A cap of thirty is no cap at all: there are only eight notes.'
      ],
      explain:'A cap turns a big job into a trial run. You look at the first few stamped notes and, if they are right, you raise the cap for the rest. The cap does not choose the files; it counts them in the order the agent works, and the agent stops once the count is full.',
      hint:'Decide how many notes you want to try first, and write a rule with that number.',
      answer:'Constraints: max 3 files',
      wrong:'Constraints: max 30 files',
      lazy:'',
      check:(o,c)=>{
        if(!c.prompt.constraints.some(x=>x.kind==='max'))return 'Nothing capped how many files the agent may change, so it stamped every note. Write a rule that limits the batch.';
        const n=new Set(o.calls.filter(x=>x.verb==='edit').map(x=>x.target)).size;
        if(n>3)return 'The agent changed '+n+' files, and you asked for a batch of three first. Cap it at three or fewer.';
        return AQ.verdict(o,c);
      }
    }
  ]
});
})();
