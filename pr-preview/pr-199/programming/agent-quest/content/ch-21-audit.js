/* Agent Quest chapter 21 (array index 20): Audit what is loaded. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const SKILL='.claude/skills/release-guard.md',MCP='.claude/mcp.txt';
const guard=desc=>'name: release-guard\ndescription: '+desc+'\nwhen: release\ndo not edit migrations/\n';
const skippedBy=(o,by)=>o.steps.some(s=>s.type==='skip'&&s.by===by);
const loaded=(o,name)=>o.steps.some(s=>s.type==='skill'&&s.name===name&&s.loaded===true);
/* the bare name in any spelling: letters only, so release, release-guard, "release guard skill" all collapse */
const BARE=['release','releaseguard','releaseguardskill'];
const RULEISH=/^(do not|only|ask before)\s+\S+\s+\S/i;
const notConnected=(o,target)=>o.steps.some(s=>s.type==='skip'&&s.target===target&&s.by==='not connected');

AQ.CH.push({
  name:'Audit what is loaded',badge:'Old Inventory',tier:'tune',
  story:'The attic is cluttered; list what Cog carries every run, and find the old inventory.',
  intro:'The stockroom attic is cluttered, so first list what Cog carries on every run. A setup grows a little with every job, and the agent pays for all of it on every run. Before you cut anything, look at what is loaded: the words that pick a skill, the rule lines that stop nothing, and the tools a job never calls. In this chapter you shorten a description, delete rules that point at things that are gone, and keep only the tools the job calls.',
  learned:['What a skill description is for','Rule lines that stop nothing','Trimming the tools inside a server'],
  missions:[
    {
      title:'What the agent reads to pick a skill',scenario:'tuneDesc',kind:'config',prompt:'Goal: ship the rounding fix in this release\nDone when: run npm test',facts:['skills'],
      goal:'The stockroom attic is cluttered. The skill <code>release-guard</code> has a <code>description:</code> of about forty words, and the agent carries it on every run. In real Claude Code the agent reads the name and description of a skill to decide whether to load it. In this practice the <code>when:</code> line does the loading, but the description still has to do its job: say when the skill applies and what it guards. Rewrite it in 10 words or fewer, keep the guard working, and get the most the agent holds at once down to '+AQ.TUNE.desc+' tokens or fewer. The Meter shows it after a run.',
      how:[
        'A line such as <code>description: Use during a release: blocks edits to migrations</code> says in eight words when the skill applies (a release) and what it guards (the migrations). It does the same job as the long one, and the agent holds far less.',
        'The description is always loaded, used or not, so every word of it is paid for on every run. The body of the skill loads only when <code>when:</code> matches the job.',
        'Short is not enough. <code>description: release</code> or <code>description: release-guard skill</code> only repeats the name, and tells the agent nothing about the job.',
        'Leave <code>name:</code>, <code>when: release</code> and the rule line alone. The skill has to load for this job, and its rule <code>do not edit migrations/</code> has to stop the edit, or the guard is gone.'
      ],
      explain:'A description is the label a skill is picked by, so a good one is short and specific: when it applies, and what it guards. A long one costs tokens on every run and adds little, and a one-word one gives the agent nothing to choose by. This practice cannot judge your wording, so it checks the shape: 10 words or fewer, a mention of the release and of the migrations, and more than the bare name. Real Claude Code does read the description to choose a skill, which is why it is the one line of the file that is always loaded.',
      hint:'Open <code>.claude/skills/release-guard.md</code> and rewrite only the <code>description:</code> line: when the skill applies, and what it guards.',
      answer:{files:{[SKILL]:guard('Use during a release: blocks edits to migrations')}},
      wrong:{files:{[SKILL]:guard('release-guard skill')}},
      lazy:{files:{}},
      check:(o,c)=>{
        if(!loaded(o,'release-guard'))return 'The release-guard skill never loaded, so its rule could not guard the migrations. Keep name: and when: release as they are.';
        if(!skippedBy(o,'skill release-guard'))return 'The release-guard skill loaded, but its rule stopped nothing. Keep its do not edit migrations/ line.';
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        const d=(c.setup.skills.find(s=>s.name==='release-guard')||{}).description||'',words=d.split(/\s+/).filter(Boolean).length;
        if(words>10)return 'The description is '+words+' words. Cut it to 10 or fewer, and keep what matters: when the skill applies and what it guards.';
        if(BARE.includes(d.toLowerCase().replace(/[^a-z]/g,'')))return 'The description only repeats the name of the skill. Say when the skill applies and what it guards.';
        if(!/release/i.test(d)||!/migration/i.test(d))return 'The description must say when the skill applies and what it guards: name the release and the migrations.';
        return o.tokens.peak<=AQ.TUNE.desc?true:'The description is short, but the agent still held about '+o.tokens.peak+' tokens at once. The goal is '+AQ.TUNE.desc+' or fewer. Use fewer and shorter words.';
      }
    },
    {
      title:'Lines the agent ignores',scenario:'tuneDead',kind:'budget',prompt:'Goal: fix the rounding bug in src/price.js',facts:['memory-files'],
      goal:'Mr. Ledbury never cleared the old lines out of the attic. A line in <code>CLAUDE.md</code> only acts as a rule when the folder or command it names is in the project. Three lines in this shop\'s file name things that are gone: <code>old-api/</code>, <code>billing/</code> and the command <code>npm run legacy-build</code>. The agent cannot place them, so they stop nothing, and they are still loaded on every run. Delete the lines that do nothing, keep the rule that guards <code>data/</code>, and get the whole setup down to '+AQ.TUNE.dead+' tokens or fewer.',
      how:[
        'Deleting the three lines <code>do not edit old-api/</code>, <code>only edit billing/</code> and <code>ask before run npm run legacy-build</code> leaves the notes and the live rule <code>do not delete data/</code>. The file falls under the limit.',
        'A rule line counts only when its target exists. These targets are gone, so the lines are read and then ignored. Under the file, the editor says how many other lines only cost tokens: the notes are in that number too, so look at which lines look like rules.',
        'Check each rule against the project before you cut it. <code>data/</code> is a real folder with the backups in it, so its rule stays.',
        'A <code>#</code> in front of a line hides it from the rules in this practice, but the line is still in the file and still counted. Delete a line you do not need; do not comment it out.'
      ],
      explain:'Rules pile up in a memory file, and nobody checks them again. A rule for something that is gone stops nothing, but it is loaded on every run, and a real agent that reads ordinary sentences may be misled by it too. Auditing a file is simple: for every rule line, ask whether the thing it names is still there. If not, delete it. Delete the line, because a commented-out line still sits in the file and still costs.',
      hint:'Delete the three lines whose folder or command is gone. Keep <code>do not delete data/</code>.',
      answer:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not delete data/\n'}},
      wrong:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const stale=String(c.setup.memory).split('\n').map(l=>l.trim()).find(l=>l&&!l.startsWith('#')&&RULEISH.test(l)&&!AQ.config.parseConstraint(l,c.scenario).ok);
        if(stale)return '"'+stale+'" names something this project does not have, so it stops nothing and still costs tokens. Delete it.';
        const hidden=/^#\s*(do not|only|ask before)\s/im.test(c.setup.memory);
        const big=AQ.overBudget(c,AQ.TUNE.dead);
        if(big)return big+(hidden?' A line that starts with # is hidden from the rules, but it is still counted. Delete it.':'');
        return AQ.verdict(o,c);
      }
    },
    {
      title:'Only the tools the job calls',scenario:'tuneMcp',kind:'config',prompt:'Goal: read today\'s calendar and the newest mail',facts:['mcp'],
      goal:'Dana\'s morning job for Cog reads today\'s calendar and the newest mail: one tool from each of two servers, <code>calendar.list</code> and <code>mail.read</code>. The list in <code>.claude/mcp.txt</code> connects five servers with all their tools, and every tool name is loaded on every run, as in mission 5.4. There one server was enough. Here the job needs two, so trim the tools inside each line as well. Keep both tools connected, and get the most the agent holds at once down to '+AQ.TUNE.mcp+' tokens or fewer.',
      how:[
        'The two lines <code>calendar: list</code> and <code>mail: read</code> keep exactly the two tools the job calls. The other three servers go, and so do the tools of these two that the job never touches.',
        'A line is a server name, a colon and its tools. Deleting a line removes the whole server. Shortening the list keeps the server and loads fewer names.',
        'Keeping a server whole is the easy way to overspend. The <code>calendar</code> line lists ten tools, and the job calls one of them.',
        'Both tools must stay in the list. A tool that no line lists is not connected, and the call is skipped. The Run panel shows it, and the mail or the calendar is never read.'
      ],
      explain:'A connected tool costs tokens on every run, called or not. A real server usually offers all of its tools, so the saving is in choosing which ones the job gets. Audit the list by the job: keep each tool the job calls, and cut the rest. Cut a whole server only when no tool of it is called. Here the lists are long on purpose: a server you keep whole costs more than you can spare.',
      hint:'Keep a line for <code>calendar</code> with only <code>list</code> on it, and a line for <code>mail</code> with only <code>read</code> on it.',
      answer:{files:{[MCP]:'calendar: list\nmail: read\n'}},
      wrong:{files:{[MCP]:'calendar: list\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        for(const t of ['calendar.list','mail.read'])if(notConnected(o,t))return 'The agent called '+t+', but that tool is not connected. Keep the tools the job calls in the list.';
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        return o.tokens.peak<=AQ.TUNE.mcp?true:'Both tools are connected, but the agent held about '+o.tokens.peak+' tokens at once. The goal is '+AQ.TUNE.mcp+' or fewer. Cut the tools the job never calls, inside the lines you keep.';
      }
    }
  ]
});
})();
