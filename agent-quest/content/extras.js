/* Agent Quest extras: ranks (defined once, in tiers.js), quick-fire and the field guide. Plain data, loaded after the chapters. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};

AQ.RANKS=AQ.tiers.ranks();

/* ch: the chapter whose missions must all be done before the question is played (quick-fire is gated on it)
   c: the question (HTML), a: the answer (plain text), w: three wrong answers, why: shown after a miss */
AQ.QF=[
 {ch:0,c:'What are the three parts of the agent loop?',a:'read, act, check',w:['plan, build, ship','ask, wait, answer','type, save, run'],why:'The agent reads what it needs, acts by editing or running something, then checks whether that worked. A check sends it round again.'},
 {ch:0,c:'An agent changes the code but never runs a check. How is the run marked?',a:'unverified',w:['failed','blocked','done'],why:'Nothing proved the change works, so the run is unverified, even if the change happened to be right.'},
 {ch:0,c:'What is one step the agent takes, such as editing a file or running a command?',a:'a tool call',w:['a token','a memory file','a context'],why:'Every step is a tool call: a verb and a target. The agent can do nothing else.'},
 {ch:0,c:'A rule says <code>do not delete data/</code>. The agent wants to delete <code>data/backup.csv</code>. What happens?',a:'the call is skipped',w:['the file is deleted and an error is shown','the agent asks you first','the file is deleted and then restored'],why:'A blocked call is skipped. Nothing is deleted and nothing counts as a mistake.'},
 {ch:0,c:'Everything the agent holds in mind at once, like your prompt, its instructions and the files it read, is its...',a:'context',w:['loop','verdict','target'],why:'The context is measured in tokens, and it has a limit, so reading every file is rarely a good idea.'},
 {ch:0,c:'Which text does the agent read at the start of every run?',a:'its memory file',w:['the last file it edited','the test results','your earlier prompts'],why:'The memory file holds standing instructions. It is loaded each time, so every line in it costs tokens each time.'}
];

/* ch: chapter index, c: the topic, what: one line (HTML), ex: [text, note] pairs. Examples are read-only: there is no terminal to run them in. */
AQ.GUIDE=[
 {ch:0,c:'Done when: the last step of the loop',what:'Tells the agent how to prove it is finished. It can <code>run</code> a command or <code>read</code> a file. Without it the run is unverified.',ex:[['Done when: run npm test','The agent finishes by running the tests. A failed test sends it round the loop again.']]},
 {ch:0,c:'Constraints: rules for the agent',what:'One rule per line, in the shape <code>do not</code>, a verb, a target. The verbs here are <code>edit</code>, <code>read</code>, <code>run</code> and <code>delete</code>. A blocked call is skipped.',ex:[['Constraints: do not delete data/','Blocks every delete inside the folder.'],['Constraints: do not edit src/','Also a valid rule, but it blocks the fix this project needs.']]},
 {ch:0,c:'Files: where to look',what:'Paths the agent reads before it starts. Fewer files means a smaller context, but the agent can only change what it has read.',ex:[['Files: src/price.js','Reads one file and holds very little.']]},
 {ch:0,c:'CLAUDE.md: standing instructions',what:'A memory file loaded into every run. Lines in the rule shape act as standing rules; other lines only cost tokens.',ex:[['do not delete data/','A rule that holds even when the prompt says nothing about it.']]}
];
})();
