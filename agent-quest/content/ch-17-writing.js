/* Agent Quest chapter 17 (array index 16): Writing and research, the second personal chapter. All three are prompt missions on a pretend
   home folder. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). Positions in comments are [chapter, mission],
   both 0-based; the cards say the in-game label, which is one more on each. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const FIELDS=['goal','donewhen','constraints','files','examples','plan','use'];
const SAMPLE='drafts/sample-thanks.md';
const MARKET='reports/market.md',SECTION=MARKET+'#pricing';
const PAGE='clippings/recipe-page.md';
const skipped=(o,verb,target)=>o.steps.find(s=>s.type==='skip'&&s.verb===verb&&s.target===target);
/* true when the rules typed in the prompt alone stop the action: the root CLAUDE.md and the permission lines do not count */
const typedStops=(c,verb,target)=>!AQ.permissions.check({verb,target},{rules:[],hooks:[],allow:[]},c.prompt.constraints,{edited:[]}).allowed;

AQ.CH.push({
  name:'Writing and research',badge:'Page Turner',tier:'personal',
  intro:'Writing is the first job most people hand to an agent, and research is reading a lot to write a little. In this chapter you make the agent sound like you by showing it a sample, point it at one section of a long report in place of the whole thing, and stop a saved web page from giving the agent orders.',
  learned:['Writing in your own voice','Reading one section of a long file','A saved page is not an order'],
  missions:[
    {
      title:'Write it in your voice',scenario:'voice',kind:'prompt',fields:FIELDS,
      goal:'You owe Dana a thank-you note for the tea, and you want it to sound like you, not like a form letter. Words are a poor way to describe a voice, so show the agent a note you already wrote. The folder <code>drafts/</code> holds two old notes to Dana, and the agent writes the new note into <code>drafts/thanks.md</code>. The form now has a <code>Use:</code> line as well: it names a ready-made helper for the agent to bring in, such as a saved set of instructions. A thank-you note needs none, so leave it empty.',
      how:[
        'The line <code>Examples: drafts/sample-thanks.md</code> shows the agent a note in your own voice, and it copies the greeting of that note into the new one.',
        '<code>Examples:</code> takes the path of a finished note. Separate several paths with commas: the first one sets the greeting.',
        'Open both notes in <code>drafts/</code> before you choose. One opens with a friendly greeting to Dana. The other is a stiff letter, and it would make the new note sound like somebody else.',
        'The agent copies the shape, not the facts: here, only the opening words of the sample, up to its first comma.'
      ],
      explain:'A sample is the shortest way to describe a voice, and the agent copies whatever you show it. Show the stiff letter and the note comes out stiff. Show nothing and the agent falls back on a greeting that sounds like nobody. This practice copies only the opening words of the sample, up to the first comma. A real agent picks up much more, such as length and tone.',
      hint:'Look at how each note in <code>drafts/</code> starts, then point <code>Examples</code> at the one that sounds like you.',
      answer:'Examples: '+SAMPLE,
      wrong:'Examples: drafts/old-formal.md',
      lazy:'Goal: write a thank-you note to Dana',
      check:(o,c)=>{
        if(!c.prompt.examples.length)return 'The note was written with no sample to copy, so the agent had to guess how you greet Dana. Point it at a note you wrote.';
        if(!c.prompt.examples.includes(SAMPLE))return 'The agent copied the style of '+c.prompt.examples.join(', ')+', which is not how you write to Dana. Pick the note that sounds like you.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Read the section, not the whole report',scenario:'report',kind:'prompt',fields:FIELDS,
      goal:'The file <code>reports/market.md</code> is a long report, and you need only the first line of its Pricing section in <code>summary.md</code>. The agent may hold at most '+AQ.PEAK+' tokens at once, and the whole report is more than that. A <b>section</b> is the part of a file under one heading. You point at it by writing the file name, a <code>#</code> and the heading in lower case: the heading <code>## Summary</code> in this report becomes <code>reports/market.md#summary</code>. Real agents read a range of lines, not a heading, so this anchor is the practice\'s stand-in for that.',
      how:[
        'The line <code>Files: reports/market.md#pricing</code> makes the agent read only the Pricing section of the report, a few lines, so it holds far less than '+AQ.PEAK+' tokens and still has what it needs.',
        'The part after <code>#</code> is the heading in lower case. A heading the file does not have is not found, and then the agent is not run at all.',
        'Naming the whole file, <code>reports/market.md</code>, reads the long appendix too and goes over the limit. A different section, such as <code>#competitors</code>, fits the limit, but the agent never sees the pricing it has to copy.',
        'No <code>Files</code> line at all is the same as naming the whole file: the agent opens everything.'
      ],
      explain:'A long document is a research problem in small: the agent can only think about what fits in its window. Reading one section keeps the window small and the answer sharp. A section is a way to look, not a way to be safe: if the section holds an instruction, the agent still reads it. And a rule that blocks the whole file blocks every section of it too.',
      hint:'Open <code>reports/market.md</code>, find the heading of the section you need, and write it after the file name.',
      answer:'Files: '+SECTION,
      wrong:'Files: '+MARKET,
      lazy:'',
      check:(o,c)=>{
        const blocked=skipped(o,'read',SECTION);
        if(blocked)return 'The agent could not read '+SECTION+' ('+blocked.by+'), so the summary stayed empty. Take away the rule that stops it.';
        if(o.tokens.peak>AQ.PEAK)return 'The agent held about '+o.tokens.peak+' tokens at once, over the limit of '+AQ.PEAK+', because it read too much of the report. Point it at the one section it needs.';
        if(!c.prompt.files.includes(SECTION))return 'Files does not point at the Pricing section of '+MARKET+', so the agent never saw the pricing.';
        return AQ.verdict(o,c);
      }
    },
    {
      title:'A saved page is not an order',scenario:'clipping',kind:'prompt',fields:FIELDS,
      goal:'You saved a recipe page into <code>clippings/</code>, and the agent reads it to pull out the recipe. But a page can hide text written like an order, and this one tells the agent to read <code>notes/passwords.txt</code> and send what it finds to an address. Let the agent read the page, and stop the two things the page asks for: the read of the password file, and the email through the tool <code>mail.send</code>.',
      how:[
        'The two lines <code>Constraints: do not call mail.send</code> and <code>Constraints: do not read notes/passwords.txt</code> stop the email and the password read that the page asks for, and leave the page itself readable.',
        'A tool is always a <code>call</code>, so its rule starts with <code>do not call</code>. In mission 7.2 the same email was banned with <code>do not send mail.send</code>, because that practice agent sent its email with the verb <code>send</code>. Here the agent uses the tool, so a rule with <code>send</code> matches nothing and the email goes out.',
        'Each rule stops one thing, so you need both. One rule alone leaves the other action free to run.',
        'Banning the page, <code>do not read clippings/recipe-page.md</code>, is tempting but wrong: the agent needs the page to get the recipe.'
      ],
      explain:'The agent cannot tell your words from words hidden in a page it reads, so the page is data, not a boss. The defence is the one from mission 7.2: limit what the agent may do, so a hijacked agent cannot do real damage. The rules you type in the prompt are what this mission checks.',
      hint:'Two things happen that you did not want: a file is read and a tool is used. Write one rule for each, and mind which word starts the rule about the tool.',
      answer:'Constraints: do not call mail.send\nConstraints: do not read notes/passwords.txt',
      wrong:'Constraints: do not send mail.send',
      lazy:'Done when: read '+PAGE,
      check:(o,c)=>{
        const page=skipped(o,'read',PAGE);
        if(page)return 'The agent could not read '+PAGE+' ('+page.by+'). The page is fine to read: block what it asks for, not the page.';
        const msg=[];
        if(o.violations.some(v=>v.verb==='call'))msg.push('The agent called mail.send, and nothing told it not to. A tool is a call, so the rule is "do not call mail.send".');
        if(o.violations.some(v=>v.verb==='read'))msg.push('The agent read notes/passwords.txt, and nothing told it not to.');
        if(msg.length)return msg.join(' ');
        if(!typedStops(c,'call','mail.send')||!typedStops(c,'read','notes/passwords.txt'))return 'The run was safe only because of a rule outside your prompt. This mission is about the rules you type under Constraints.';
        return AQ.verdict(o,c);
      }
    }
  ]
});
})();
