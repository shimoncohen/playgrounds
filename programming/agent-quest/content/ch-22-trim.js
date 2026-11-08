/* Agent Quest chapter 22 (array index 21): Trim, dedupe, move rare rules. Missions are append-only once shipped (saves are keyed '<chapter>.<mission>'). */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const SKILL='.claude/skills/release-steps.md',CMD='release-prep';
const BACKUP='data/backup.csv',RULE='do not edit migrations/';
/* the six steps: the prose under the heading of the shipped CLAUDE.md, without the rule line */
const chores=sc=>{const l=sc.vfs['CLAUDE.md'].split('\n');return l.slice(l.indexOf('## Release checklist')+1).filter(x=>x.trim()&&!AQ.config.parseConstraint(x,sc).ok);};
const howMany=(miss,what)=>miss.length===6?'all six '+what+' are missing':miss.length===1?'one of the six '+what+' is missing':miss.length+' of the six '+what+' are missing';
const covers=(text,sc)=>AQ.config.memoryRules({memory:AQ.config.skillBody(text)},sc,false).rules.some(r=>r.verb==='delete'&&AQ.permissions.matches(r.target,BACKUP));
/* the files that hold a delete rule for data/backup.csv. Counted from the files, not from setup.skills, which drops a skill with a bad when: or no name: */
const holders=(o,c)=>[['CLAUDE.md',c.setup.memory],...c.setup.memoryFolders.map(f=>[f.path,f.text]),
  ...o.vfs.list('.claude/skills/').filter(p=>p.endsWith('.md')).map(p=>[p,o.vfs.read(p)])].filter(([,t])=>covers(t,c.scenario)).map(([p])=>p);
const bare=l=>l.replace(/^(?:extra|goal):\s*/i,'').trim();

AQ.CH.push({
  name:'Trim, dedupe, move rare rules',badge:'Lean Pack',tier:'tune',
  story:'Same rule three times, one rare chore: move it and find the lean pack.',
  intro:'In the attic the same rule sits in three places and one rare chore rides along on every run. Once you know what is loaded, you can make it lighter. A rule written three times is paid for three times, and a checklist that one job in twenty needs is paid for by the other nineteen. In this chapter you keep a rule in one place, move a rare checklist into a skill, and move a chore into a saved command.',
  learned:['One place for each rule','Rare rules in a skill','A chore as a saved command'],
  missions:[
    {
      title:'The same rule three times',scenario:'tuneDup',kind:'config',prompt:'Goal: fix the rounding bug in src/price.js',facts:['memory-files'],
      goal:'Mr. Ledbury keeps copying the same rule into the attic files. The rule <code>do not delete data/</code> and its reason on a <code>Why:</code> line are written in three places: <code>CLAUDE.md</code>, <code>src/CLAUDE.md</code> and the skill <code>data-guard</code>. This job reads all three, so the agent pays for every copy, and one copy guards <code>data/</code> equally well. Keep the rule in exactly one place, remove the others, and get the most the agent holds at once down to '+AQ.TUNE.dup+' tokens or fewer. The Meter shows it after a run.',
      how:[
        'Pick one home for the rule, such as <code>CLAUDE.md</code>, and remove the rule and its <code>Why:</code> line from the other two files. The <code>Why:</code> line is plain text, so it is paid for like any other line.',
        'Remove the copy; do not put it to sleep. A skill whose <code>when:</code> names another kind of job is not loaded here, but it is still a second copy of the rule to keep up to date. A skill with a <code>when:</code> that is not one of the kinds is not loaded at all, and still holds the rule.',
        'Removing only the rule line from two places leaves the reason behind, and the reason is most of the weight. Take both lines out.',
        'Do not remove the last copy. Without the rule the agent deletes <code>data/backup.csv</code>, and the Run panel shows the delete going through.'
      ],
      explain:'A rule written in many places has many owners. When one copy changes, the others go stale, and the agent reads every one of them on every job that loads them. Keep the rule where the most jobs need it, and keep the reason next to it once. This practice finds the copies by reading the files, so a copy that never loads still counts: a copy you cannot see working is the one that goes wrong later.',
      hint:'Keep the two lines in one file and empty them out of the other two: <code>CLAUDE.md</code>, <code>src/CLAUDE.md</code> and <code>.claude/skills/data-guard.md</code>.',
      answer:{files:{'src/CLAUDE.md':'','.claude/skills/data-guard.md':'name: data-guard\ndescription: data-guard skill\nwhen: bugfix\n'}},
      wrong:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\n','src/CLAUDE.md':'','.claude/skills/data-guard.md':'name: data-guard\ndescription: data-guard skill\nwhen: bugfix\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        const h=holders(o,c);
        if(h.length>1)return 'The rule do not delete data/ is still written in '+h.length+' places: '+h.join(', ')+'. Keep it in one and remove the rest, even a copy that does not load.';
        return o.tokens.peak<=AQ.TUNE.dup?true:'The rule is in one place, but the agent still held about '+o.tokens.peak+' tokens at once. The goal is '+AQ.TUNE.dup+' or fewer. Remove the Why: lines of the copies you took out too.';
      }
    },
    {
      title:'Move the rare rule into a skill',scenario:'tuneRare',kind:'config',prompt:'Goal: fix the rounding bug in src/price.js',facts:['skills'],
      goal:'Cog hauls a rare checklist around the attic. Now and then the shop ships a release, and its checklist sits in <code>CLAUDE.md</code>: the rule <code>do not edit migrations/</code> and six lines of steps. Every job reads them, and today\'s job only fixes a rounding bug. The skill <code>release-steps</code> loads for a release and nothing else, and its body is empty. Move the rule and the six lines into the body of that skill, keep the everyday rule <code>do not delete data/</code> in <code>CLAUDE.md</code>, and get the most the agent holds at once down to '+AQ.TUNE.rare+' tokens or fewer.',
      how:[
        'Cut the heading <code>## Release checklist</code>, the line <code>do not edit migrations/</code> and the six lines of steps from <code>CLAUDE.md</code>, and paste the line and the steps in <code>.claude/skills/release-steps.md</code> below its header lines. A rare rule belongs in a skill: it loads only when a release starts.',
        'The header lines <code>name:</code>, <code>description:</code> and <code>when: release</code> are not the body. Text on one of those lines is not instructions, so a checklist squeezed onto the <code>description:</code> line moves nothing.',
        'Keep <code>when: release</code>. The kind <code>bugfix</code> is this job, so the skill would load now and the agent would carry the checklist again.',
        'Move the rule with the steps. A release that edits <code>migrations/</code> is guarded by the skill the same way as by <code>CLAUDE.md</code>. And leave the everyday rule: a delete can come up in any job.'
      ],
      explain:'A memory file is read on every job, so keep in it what every job needs. A skill body is read only when a job of its kind starts, so it is the place for what only one kind of job needs, the way a release checklist is. The rule moves with the steps: from the skill it still holds on every release. Then a rounding fix carries none of it.',
      hint:'Open <code>.claude/skills/release-steps.md</code>, add the rule and the six lines under its header, and delete them from <code>CLAUDE.md</code>.',
      answer:{files:{
        'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not delete data/\n',
        [SKILL]:'name: release-steps\ndescription: release-steps skill\nwhen: release\n## Release checklist\ndo not edit migrations/\n'+chores(AQ.scenarios.tuneRare).join('\n')+'\n'}},
      wrong:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not delete data/\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        const sk=c.setup.skills.find(s=>s.path===SKILL);
        if(!sk)return 'The file '+SKILL+' is not a working skill any more. It needs a name: line and when: release.';
        if(sk.when!=='release')return sk.when==='bugfix'?'The skill release-steps loads for this job, so the agent carries the checklist again. Keep when: release.':'The checklist belongs to a release, so the skill release-steps must keep when: release.';
        const body=AQ.config.skillBody(o.vfs.read(SKILL)).split('\n').map(l=>l.trim());
        const miss=chores(c.scenario).filter(l=>!body.includes(l));
        if(miss.length)return 'In the body of the skill, '+howMany(miss,'checklist lines')+', such as "'+miss[0]+'". Move them below the header lines, not onto one of them.';
        if(!AQ.config.memoryRules({memory:body.join('\n')},c.scenario,false).rules.some(r=>r.verb==='edit'&&AQ.permissions.matches(r.target,'migrations/001.sql')))return 'The rule '+RULE+' is not in the body of the skill, so a release would not be guarded. Move that line with the steps.';
        return o.tokens.peak<=AQ.TUNE.rare?true:'The skill holds the checklist, but the agent still held about '+o.tokens.peak+' tokens at once. The goal is '+AQ.TUNE.rare+' or fewer. Take the checklist out of CLAUDE.md, not only copy it.';
      }
    },
    {
      title:'Move the chore into a command',scenario:'tuneCmd',kind:'config',prompt:'Goal: fix the rounding bug in src/price.js',facts:['commands'],
      goal:'Back in the attic, the release checklist still sits in <code>CLAUDE.md</code>. A <b>slash command</b> is a saved prompt in <code>.claude/commands/</code>, as in missions 12.1 and 20.1, and here it takes weight off memory: a job that does not call it never carries it. The command <code>release-prep</code> holds only <code>Goal: prepare the release</code>. Move the rule and the six lines of steps into it, and keep <code>do not delete data/</code> in <code>CLAUDE.md</code>. Lines in a command must look like prompt lines, so the rule becomes <code>Constraints: do not edit migrations/</code>, and each plain step goes after <code>Extra:</code>, a field that adds one line of context to the prompt and enforces nothing. Get the most the agent holds at once down to '+AQ.TUNE.cmd+' tokens or fewer.',
      how:[
        'In <code>.claude/commands/release-prep.md</code>, under the goal line, write <code>Constraints: do not edit migrations/</code> and one <code>Extra:</code> line for each of the six steps, then delete them and the heading <code>## Release checklist</code> from <code>CLAUDE.md</code>. A job that does not call <code>release-prep</code> carries none of it.',
        'A command holds prompt lines, one field per line. A bare rule or a plain sentence does not parse, and a run that calls the command is refused. The label <code>Extra:</code> fixes the sentence and <code>Constraints:</code> fixes the rule.',
        'Leave the <code>## Release checklist</code> heading out: it does not parse either. Keep the words of the steps as they are.',
        'The rule must be inside the command, because a run that calls <code>release-prep</code> gets its rule from there. Pasted into <code>.claude/notes.txt</code>, it guards nothing.'
      ],
      explain:'A command is a chore written once, and it is called only when you need it. Moving the checklist there is the same saving as moving it into a skill, with a different trigger: you call a command by name, while a skill loads by itself. The labels matter because the command is read as a prompt: the rule keeps its force on a <code>Constraints:</code> line, and an <code>Extra:</code> line is only context, so it costs a line and stops nothing.',
      hint:'Write a <code>Constraints:</code> line for the rule and an <code>Extra:</code> line for each step in <code>release-prep.md</code>, then delete them from <code>CLAUDE.md</code>.',
      answer:{files:{
        'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not delete data/\n',
        ['.claude/commands/'+CMD+'.md']:'Goal: prepare the release\nConstraints: do not edit migrations/\n'+chores(AQ.scenarios.tuneCmd).map(l=>'Extra: '+l).join('\n')+'\n'}},
      wrong:{files:{'CLAUDE.md':'# Shop notes\nPrices are in dollars.\ndo not delete data/\n'}},
      lazy:{files:{}},
      check:(o,c)=>{
        const v=AQ.verdict(o,c);
        if(v!==true)return v;
        const p=AQ.config.parsePrompt('Use: '+CMD,c.scenario,c.setup);
        if(p.errors.length)return 'Calling the command '+CMD+' would be refused: '+p.errors[0].line+' '+p.errors[0].msg+'. Put plain text after Extra: and a rule after Constraints:.';
        if(!p.constraints.some(k=>k.kind==='do not'&&k.verb==='edit'&&AQ.permissions.matches(k.target,'migrations/001.sql')))return 'The command '+CMD+' holds no Constraints: '+RULE+' line, so a release run would not be guarded.';
        const cmd=c.setup.commands.find(x=>x.name===CMD),have=cmd.text.split('\n').map(bare);
        const miss=chores(c.scenario).filter(l=>!have.includes(l));
        if(miss.length)return 'In the command, '+howMany(miss,'steps')+', such as "'+miss[0]+'". Move them after Extra: lines.';
        return o.tokens.peak<=AQ.TUNE.cmd?true:'The command holds the steps, but the agent still held about '+o.tokens.peak+' tokens at once. The goal is '+AQ.TUNE.cmd+' or fewer. Take the steps out of CLAUDE.md, not only copy them.';
      }
    }
  ]
});
})();
