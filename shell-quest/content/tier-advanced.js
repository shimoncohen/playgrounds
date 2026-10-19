(function (SQ) {
SQ.content=SQ.content||{chapters:[],guide:[],quickfire:[]};
const {JOURNAL,ensureDir,ensureFile}=SQ;
const NUMBERS=['4','8','15','16','23','42'].join('\n');
/* Chapters 12 and 13 need the journal, the village folder, an empty scripts/ folder and numbers.txt.
   village/people.txt is already in the starting world (names only) and is left alone. lib/strings.sh belongs to chapter 15. */
const seedAdvanced=()=>{ensureFile('~/journal.txt',JOURNAL);ensureDir('~/village');ensureDir('~/scripts');ensureFile('~/numbers.txt',NUMBERS)};
/* Chapter 15 adds a function library, a logs/ folder (three .log files and one that is not a log), docs/ (three .txt and one .md)
   and an empty drafts/ for the backup capstone. Files in this world have no trailing newline, so wc -l counts every line shown. */
const STRINGS_LIB=`# String helpers. Load them into your shell with: source lib/strings.sh
shout() { echo "$1" | tr a-z A-Z; }`;
const LOGS15={'app.log':'08:00 app started\n08:05 ada logged in\n08:20 report saved\n09:00 app stopped','db.log':'08:00 db opened\n09:00 db closed',
  'web.log':'08:01 GET /\n08:02 GET /map\n08:03 GET /cave'};
const DOCS={'ideas.txt':'A bridge over the river.','notes.txt':'Meet at the gate at dawn.\nBring the map.','todo.txt':'fix the lamp\nfeed the owl\nsharpen the axe',
  'readme.md':'# Docs\nPlain notes live in the .txt files.'};
const under=(dir,o)=>Object.fromEntries(Object.entries(o).map(([k,v])=>[dir+'/'+k,v]));
const seedDocs=()=>{for(const k in DOCS)ensureFile('~/docs/'+k,DOCS[k]);ensureDir('~/drafts')};
const seedReal=()=>{seedAdvanced();ensureFile('~/lib/strings.sh',STRINGS_LIB);
  for(const k in LOGS15)ensureFile('~/logs/'+k,LOGS15[k]);ensureFile('~/logs/readme.txt','One .log file per service.');seedDocs()};

/* A test that ran on this line ([, test or [[) and passed (exit 0) or failed. With op (such as -f) the test must use it on an operand.
   [[ is logged without its words, so for [[ the operator is read from the typed line. */
const TESTS=['[','test'];
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const tested=(c,op,passed)=>c.log.some(e=>{if((e.code===0)!==passed)return false;
  if(TESTS.includes(e.name)){if(!op)return true;const k=e.args.indexOf(op);return k>=0&&k+1<e.args.length&&e.args[k+1]!==']'}
  return e.name==='[['&&(!op||new RegExp('\\[\\[[^\\]]*\\s'+reEsc(op)+'\\s+[^\\]\\s]').test(c.line))});
/* everything the line printed, one trimmed line each, blank lines dropped */
const said=c=>c.out().split('\n').map(s=>s.trim()).filter(Boolean).join('\n');
const guarded=c=>/&&|\bif\b/.test(c.line);
const looped=c=>c.log.some(e=>e.name==='for'||e.name==='while'||e.name==='until');
const HOME_NOTE=`Not at home? Run <code>cd ~</code> first.`;

/* Functions (S.fns) that the line calls as a command. The definitions on the line (name, () and body) are cut out first,
   so a definition alone or `echo greet` never counts as a call. Function calls are not logged, hence the line. */
const fnsCalled=c=>{const F=SQ.S.fns||{};let rest=c.line;
  for(const n of Object.keys(F)){const i=rest.indexOf(F[n]);if(i<0)continue;
    rest=rest.slice(0,i).replace(new RegExp('(function\\s+)?'+reEsc(n)+'\\s*(\\(\\s*\\))?\\s*$'),'')+' ; '+rest.slice(i+F[n].length)}
  return Object.keys(F).filter(n=>new RegExp('(^|[;&|({]|\\b(then|do|else|if|while|until)\\s)\\s*'+reEsc(n)+'(?=[\\s;&|)]|$)').test(rest))};
/* call a function on a throwaway copy of the world: what it prints (trimmed lines, like said) and its status */
const fnRun=(n,args)=>SQ.sandbox(()=>{const r=SQ.execLine(n+' '+args);
  return {out:r.out.filter(o=>o.cls==='out').map(o=>o.text).join('\n').split('\n').map(s=>s.trim()).filter(Boolean).join('\n'),code:r.code}});
const callsFn=(c,ok)=>fnsCalled(c).some(n=>ok(n));

const EXISTS_ANSWER=`#!/bin/bash
# Say whether the path given as $1 is there.
if [ -e "$1" ]; then
  echo exists
else
  echo missing
fi
`;
const SUM_ANSWER=`#!/bin/bash
# Add up every number given as an argument.
sum=0
for n in "$@"; do
  sum=$((sum + n))
done
echo "$sum"
`;
const GREET_ANSWER=`#!/bin/bash
# Greet the name given as $1, or explain how to call the script.
if [ -z "$1" ]; then
  echo "usage: greet.sh NAME" >&2
  exit 1
fi
echo "Hello, $1!"
`;
const CHECK_ANSWER=`#!/bin/bash
# Succeed (exit 0) when $1 is a file. Otherwise say so on stderr and fail (exit 1).
if [ -f "$1" ]; then
  exit 0
fi
echo "check.sh: $1 is not a file" >&2
exit 1
`;
const ASK_ANSWER=`#!/bin/bash
# Read a name from the input (stdin) and greet it.
read name
echo "Hello, $name!"
`;
const MKCONF_ANSWER=`#!/bin/bash
# Write app.conf with a here-document: every line up to EOF goes into the file.
cat > app.conf <<EOF
name=quest
mode=fast
EOF
`;
const LOGLINES_ANSWER=`#!/bin/bash
# Print "NAME: N" for every .log file in logs/, N being its number of lines.
for f in logs/*.log; do
  n=$(wc -l < "$f")
  echo "$(basename "$f"): $n"
done
`;
const BACKUP_ANSWER=`#!/bin/bash
# Copy every .txt file in the folder given as $1 into backup/, then say how many.
if [ -z "$1" ] || [ ! -d "$1" ]; then
  echo "usage: backup.sh DIR" >&2
  exit 1
fi
mkdir -p backup
n=0
for f in "$1"/*.txt; do
  [ -e "$f" ] || continue
  cp "$f" backup/
  n=$((n + 1))
done
echo "backed up $n files"
`;
/* The capstone is judged on a known world: no backup/ yet (Beginner mission 6.7 makes one), the seeded docs/, an empty drafts/,
   and no trip/ or nowhere/ of the learner's that would change the counts. Like scriptPasses, nothing here touches the saved game. */
const backupWorld=fn=>SQ.sandbox(()=>{const h=SQ.getNode(SQ.HOME);
  if(h&&h.type==='dir')for(const k of ['backup','docs','drafts','trip','nowhere'])delete h.children[k];
  seedDocs();return fn()});
const LOG_CASE2={'logs/app.log':'started','logs/cache.log':'hit\nmiss\nhit','logs/db.log':'a\nb\nc\nd\ne','logs/web.log':'GET /\nGET /map'};
const TRIP={'trip/day one.txt':'Left the village at dawn.','trip/day two.txt':'Crossed the river.','trip/route.md':'north, then east'};
const DOCS_COPIED=Object.assign(under('backup',{'ideas.txt':DOCS['ideas.txt'],'notes.txt':DOCS['notes.txt'],'todo.txt':DOCS['todo.txt']}),
  {'backup/readme.md':'(missing)'},under('docs',DOCS)); /* scriptPasses reports an absent file as (missing): the .md must not be copied; the originals must stay (mv fails) */
const BACKUP={title:'Capstone: backup script',kind:'challenge',file:'scripts/backup.sh',
  goal:`Write <code>scripts/backup.sh</code>. Given a folder, it creates <code>backup/</code> if it is missing, copies every <code>.txt</code> file of that folder into it and prints <code>backed up N files</code>. With no argument, or one that is not a folder, it prints a usage line on stderr and exits with 1. Try <code>bash scripts/backup.sh docs</code>.`,
  anat:[['[ -d "$1" ]','cmd'],['>&2','op'],['exit 1','kw'],['mkdir -p backup','cmd'],['for','kw'],['f','var'],['in "$1"/*.txt','arg'],['cp "$f" backup/','cmd'],['n=$((n + 1))','var'],['echo "backed up $n files"','cmd']],
  answer:BACKUP_ANSWER,
  starter:`#!/bin/bash
# Back up the .txt files of the folder given as $1.
# 1. No argument, or not a folder? Print "usage: backup.sh DIR" on stderr, exit 1.
# 2. Make backup/ if it is missing.
# 3. Copy each "$1"/*.txt into backup/ and count it. Quote "$f": names can have spaces.
# 4. Print: backed up N files
`,
  wrong:[BACKUP_ANSWER.replace('"$1"/*.txt','"$1"/*'),BACKUP_ANSWER.replace('mkdir -p backup\n',''),BACKUP_ANSWER.replace('exit 1','exit 0'),
    BACKUP_ANSWER.replace('for f in "$1"/*.txt','for f in $(ls "$1"/*.txt)'),BACKUP_ANSWER.replace('cp "$f" backup/','mv "$f" backup/')],
  tests:[
    {label:'docs, in a world with no backup/ yet',args:['docs'],files:under('docs',DOCS),expectOut:'backed up 3 files',expectFiles:DOCS_COPIED},
    {label:'an empty folder',args:['drafts'],expectOut:'backed up 0 files'},
    {label:'a folder that does not exist',args:['nowhere'],expectOut:'',expectErrMatch:'usage',expectCode:1},
    {label:'no argument',args:[],expectOut:'',expectErrMatch:'usage',expectCode:1},
    {label:'a second run over an old backup',args:['docs'],files:Object.assign(under('docs',DOCS),{'backup/todo.txt':'an old copy'}),expectOut:'backed up 3 files',expectFiles:{'backup/todo.txt':DOCS['todo.txt']}},
    {label:'names with spaces',args:['trip'],files:TRIP,expectOut:'backed up 2 files',expectFiles:{'backup/day one.txt':TRIP['trip/day one.txt'],'backup/day two.txt':TRIP['trip/day two.txt']}}],
  world:backupWorld, /* the check and the Save & run failure line (SQ.missionVerdict) both judge this world */
  check:c=>backupWorld(()=>c.scriptPasses(BACKUP).ok),
  hint:`Start from the starter's four steps. Loop with <code>for f in "$1"/*.txt</code>, skip the pattern itself when nothing matched (<code>[ -e "$f" ] || continue</code>), and count with <code>n=$((n + 1))</code>. Save it, then run <code>bash scripts/backup.sh docs</code> and <code>bash scripts/backup.sh drafts</code>.`,
  explain:`This puts the whole Advanced tier together: a test on <code>$1</code> with a usage line on stderr and <code>exit 1</code>, <code>mkdir -p</code> (no error when the folder is already there), a loop over a wildcard and a running count. When a folder has no <code>.txt</code> files the pattern matches nothing and stays as it is, so the loop sees the text <code>drafts/*.txt</code> once: the <code>[ -e "$f" ]</code> test skips it. The wildcard hands the loop each name whole, spaces and all, while <code>for f in $(ls …)</code> would cut <code>day one.txt</code> in two. Always write <code>"$f"</code> with quotes: bash splits an unquoted variable at its spaces (this practice shell is more forgiving, but real bash is not). Each time you save, the script is tried on a world with no <code>backup/</code>: on <code>docs</code>, the empty <code>drafts</code>, a missing folder, no argument, a second run over an old copy and names with spaces. The originals must stay in <code>docs</code>: copy with <code>cp</code>, do not move them.`};

/* a here-document (<<WORD, <<-WORD, <<'WORD') outside comments; <<< is a here-string, not a here-document.
   codePart(line) drops a comment: the text from an unquoted # that starts a word (so `... > app.conf # <<EOF` does not count) */
const codePart=l=>{let q=null;
  for(let i=0;i<l.length;i++){const ch=l[i];
    if(q){if(ch===q)q=null;else if(ch==='\\'&&q==='"')i++;continue}
    if(ch==='\\'){i++;continue}
    if(ch==="'"||ch==='"'){q=ch;continue}
    if(ch==='#'&&(i===0||/\s/.test(l[i-1])))return l.slice(0,i)}
  return l};
const usesHereDoc=text=>text.split('\n').some(l=>/(^|[^<])<<-?\s*['"]?[A-Za-z_]\w*/.test(codePart(l)));
let MKCONF;
const CH=[
{tier:'advanced',name:'Decisions',badge:'Decider',intro:'Scripts have to choose: do this if a file is there, that if it is not. Every choice starts with a test, a command that answers yes or no through its exit code.',
 learned:['[ -f file ]','test','if … then … else … fi','-gt -lt -eq','case … esac','[[ == pattern ]]'],setup:seedAdvanced,
 missions:[
 {title:'Test a file',goal:`Ask whether <code>journal.txt</code> is a file, and say yes if it is: <code>[ -f journal.txt ] &amp;&amp; echo yes</code>`,note:HOME_NOTE,
  anat:[['[','cmd'],['-f','opt'],['journal.txt','arg'],[']','arg'],['&&','op'],['echo yes','cmd']],answer:'[ -f journal.txt ] && echo yes',
  explain:`<code>[</code> is a real command, another name for <code>test</code>, and <code>]</code> is its last argument. It prints nothing: it only <b>exits</b> with 0 for true or 1 for false, and <code>&amp;&amp;</code> runs echo only after a 0. <code>-f</code> asks "is this a file?". The spaces matter: <code>[-f journal.txt]</code> gives "command not found".`,
  check:c=>tested(c,'-f',true)&&guarded(c)&&said(c)==='yes'},
 {title:'One-line if',goal:`Make the same kind of choice with <code>if</code>, this time asking about a folder: <code>if [ -d village ]; then echo found; fi</code>`,note:HOME_NOTE,
  anat:[['if','kw'],['[ -d village ]','cmd'],[';','op'],['then','kw'],['echo found','cmd'],[';','op'],['fi','kw']],answer:'if [ -d village ]; then echo found; fi',
  explain:`<code>if</code> runs the test, and when it exits with 0 runs everything between <code>then</code> and <code>fi</code> (if spelled backwards). <code>-d</code> asks "is this a folder?". On one line, a semicolon goes before <code>then</code> and before <code>fi</code>.`,
  check:c=>c.ran('if')&&tested(c,'-d',true)&&said(c)==='found'},
 {title:'Else branch',goal:`Give the choice a second path for when the test fails: <code>if [ -f nothing.txt ]; then echo yes; else echo no; fi</code>`,
  anat:[['if','kw'],['[ -f nothing.txt ]','cmd'],[';','op'],['then','kw'],['echo yes','cmd'],[';','op'],['else','kw'],['echo no','cmd'],[';','op'],['fi','kw']],answer:'if [ -f nothing.txt ]; then echo yes; else echo no; fi',
  explain:`There is no <code>nothing.txt</code>, so the test exits with 1 and bash runs the <code>else</code> part instead. Exactly one of the two branches runs, every time. <code>elif</code> adds another test in between, and <code>-e</code> accepts files and folders alike.`,
  check:c=>c.ran('if')&&/\belse\b/.test(c.line)&&tested(c,null,false)&&said(c)==='no'},
 {title:'Compare numbers',goal:`Is 5 bigger than 3? <code>[ 5 -gt 3 ] &amp;&amp; echo bigger</code>`,
  anat:[['[','cmd'],['5','arg'],['-gt','opt'],['3','arg'],[']','arg'],['&&','op'],['echo bigger','cmd']],answer:'[ 5 -gt 3 ] && echo bigger',
  explain:`Inside <code>[ ]</code> whole numbers are compared with letters: <code>-gt</code> greater than, <code>-lt</code> less than, <code>-eq</code> equal, plus <code>-ge</code>, <code>-le</code> and <code>-ne</code>. Do not use <code>&gt;</code> there: bash reads it as a redirect, and <code>[ 5 &gt; 3 ]</code> quietly creates a file called <code>3</code>.`,
  check:c=>tested(c,'-gt',true)&&guarded(c)&&said(c)==='bigger'},
 {title:'Match a pattern',goal:`Pick a branch by matching your user name against patterns: <code>case "$USER" in explorer) echo hello;; *) echo who;; esac</code>`,
  anat:[['case','kw'],['"$USER"','var'],['in','kw'],['explorer)','arg'],['echo hello;;','cmd'],['*)','arg'],['echo who;;','cmd'],['esac','kw']],answer:'case "$USER" in explorer) echo hello;; *) echo who;; esac',
  explain:`case compares the value with each pattern in turn and runs the first branch that matches. <code>;;</code> ends a branch, <code>*</code> matches anything so it catches the rest, <code>|</code> joins alternatives (<code>root|admin)</code>), and <code>esac</code> (case backwards) closes it. Your user name here is <code>explorer</code>.`,
  check:c=>c.ran('case')&&/\$\{?USER\b/.test(c.line)&&said(c)==='hello'},
 {title:'Double brackets',goal:`Bash's own test, <code>[[ ]]</code>, can match patterns. Does your name start with exp? <code>[[ "$USER" == exp* ]] &amp;&amp; echo matches</code>`,
  anat:[['[[','kw'],['"$USER"','var'],['==','op'],['exp*','arg'],[']]','kw'],['&&','op'],['echo matches','cmd']],answer:'[[ "$USER" == exp* ]] && echo matches',
  explain:`Inside <code>[[ ]]</code>, an unquoted <code>*</code> or <code>?</code> on the right of <code>==</code> is a wildcard, so <code>exp*</code> means "starts with exp". Quote it as <code>"exp*"</code> and it only matches the exact text exp*. <code>[[</code> is part of bash itself, not a separate command like <code>[</code>.`,
  check:c=>c.log.some(e=>e.name==='[['&&e.code===0)&&/\[\[[^\]]*\s(==?|!=)\s[^\]]*[*?]/.test(c.line)&&said(c)==='matches'},
 {title:'Script: exists?',kind:'script',file:'scripts/exists.sh',
  goal:`Write <code>scripts/exists.sh</code>: it prints <code>exists</code> when the path given as its first argument is there, a file or a folder, and <code>missing</code> when it is not. Open it with <code>nano scripts/exists.sh</code>, save, then try <code>bash scripts/exists.sh village</code>.`,
  anat:[['if','kw'],['[ -e "$1" ]','cmd'],['then','kw'],['echo exists','cmd'],['else','kw'],['echo missing','cmd'],['fi','kw']],
  answer:EXISTS_ANSWER,
  starter:`#!/bin/bash
# Print "exists" when the path given as $1 is there (a file or a folder),
# and "missing" when it is not. Fill in the test:
# if [ ... "$1" ]; then
#   ...
# else
#   ...
# fi
`,
  wrong:[`#!/bin/bash
if [ -f "$1" ]; then
  echo exists
else
  echo missing
fi
`,`#!/bin/bash
echo exists
`,`#!/bin/bash
if [ -d "$1" ]; then echo exists; else echo missing; fi
`],
  tests:[{label:'a file',args:['journal.txt'],expectOut:'exists'},{label:'nothing there',args:['ghost.txt'],expectOut:'missing'},{label:'a folder',args:['village'],expectOut:'exists'}],
  hint:`Write an <code>if</code> around <code>[ -e "$1" ]</code> with an <code>else</code>. Save it, then run <code>bash scripts/exists.sh journal.txt</code> and <code>bash scripts/exists.sh ghost.txt</code>.`,
  explain:`Inside a script, <code>$1</code> is the first argument. Write it as <code>"$1"</code> in a test, with the quotes, so a name with spaces stays one word. <code>-e</code> is true for files and folders alike, while <code>-f</code> would say <code>missing</code> for <code>village</code>. Each time you save, the script is tried with a file, a missing name and a folder; Save &amp; run also tells you which one failed.`}
 ]},
{tier:'advanced',name:'Loops & numbers',badge:'Looper',intro:'Loops repeat work until a test says stop, and $(( )) lets bash do sums. Together they count, add things up and walk through a file one line at a time.',
 learned:['while','$(( ))','until','break','while read line','"$@"'],setup:seedAdvanced,
 missions:[
 {title:'Count up',goal:`Count from 1 to 3 with a loop that runs while a test passes: <code>i=1; while [ "$i" -le 3 ]; do echo "$i"; i=$((i+1)); done</code>`,
  anat:[['i=1','var'],[';','op'],['while','kw'],['[ "$i" -le 3 ]','cmd'],[';','op'],['do','kw'],['echo "$i"','cmd'],[';','op'],['i=$((i+1))','var'],[';','op'],['done','kw']],answer:'i=1; while [ "$i" -le 3 ]; do echo "$i"; i=$((i+1)); done',
  explain:`while runs the test, and as long as it exits with 0 runs the body between <code>do</code> and <code>done</code>, then tests again. <code>i=$((i+1))</code> adds one each turn. Forget it and the test never fails: this practice shell stops the loop with "too many steps", a real one runs until you press Ctrl+C.`,
  check:c=>c.ran('while')&&said(c)==='1\n2\n3'},
 {title:'Do the math',goal:`Let bash multiply: <code>echo $((6*7))</code>`,
  anat:[['echo','cmd'],['$((6*7))','arg']],answer:'echo $((6*7))',
  explain:`<code>$(( ))</code> is <b>arithmetic expansion</b>: bash works out the sum inside and pastes in the result. It knows <code>+ - * /</code>, <code>%</code> for the remainder and <code>**</code> for powers, with whole numbers only, so <code>$((7/2))</code> is 3. Variables inside need no <code>$</code>: <code>$((i+1))</code>.`,
  check:c=>/\$\(\(/.test(c.line)&&said(c)==='42'},
 {title:'Add them up',goal:`Add 1, 2, 3 and 4 in a loop, then print the total: <code>sum=0; for n in 1 2 3 4; do sum=$((sum+n)); done; echo "$sum"</code>`,note:`Keep the loop and the <code>echo</code> on the same line.`,
  anat:[['sum=0','var'],[';','op'],['for','kw'],['n','var'],['in 1 2 3 4','arg'],[';','op'],['do','kw'],['sum=$((sum+n))','var'],[';','op'],['done','kw'],[';','op'],['echo "$sum"','cmd']],answer:'sum=0; for n in 1 2 3 4; do sum=$((sum+n)); done; echo "$sum"',
  explain:`This is the <b>running total</b>: start at 0, add each item inside the loop, print once at the end. The variable keeps its value after <code>done</code>, so echo sees the final sum. <code>((sum+=n))</code> is a shorter way to write the same step.`,
  check:c=>looped(c)&&/\(\(/.test(c.line)&&said(c)==='10'},
 {title:'Count down',goal:`until is while turned around: it loops as long as the test fails. <code>n=3; until [ "$n" -eq 0 ]; do echo "$n"; n=$((n-1)); done</code>`,
  anat:[['n=3','var'],[';','op'],['until','kw'],['[ "$n" -eq 0 ]','cmd'],[';','op'],['do','kw'],['echo "$n"','cmd'],[';','op'],['n=$((n-1))','var'],[';','op'],['done','kw']],answer:'n=3; until [ "$n" -eq 0 ]; do echo "$n"; n=$((n-1)); done',
  explain:`The loop stops the first time the test passes, here when n reaches 0, so you see 3, 2 and 1. Any until can be written as a while with the opposite test: <code>while [ "$n" -gt 0 ]</code>.`,
  check:c=>c.ran('until')&&said(c)==='3\n2\n1'},
 {title:'Stop early',goal:`Leave a loop before its list runs out: <code>for i in 1 2 3 4 5; do [ "$i" -eq 3 ] &amp;&amp; break; echo "$i"; done</code>`,
  anat:[['for','kw'],['i','var'],['in 1 2 3 4 5','arg'],[';','op'],['do','kw'],['[ "$i" -eq 3 ]','cmd'],['&&','op'],['break','kw'],[';','op'],['echo "$i"','cmd'],[';','op'],['done','kw']],answer:'for i in 1 2 3 4 5; do [ "$i" -eq 3 ] && break; echo "$i"; done',
  explain:`<code>break</code> jumps straight out of the loop, so the echo for 3, 4 and 5 never runs. Its sibling <code>continue</code> skips only the rest of this turn and carries on with the next item.`,
  check:c=>c.ran('break')&&looped(c)&&said(c)==='1\n2'},
 {title:'Read a file line by line',goal:`Walk through the journal one line at a time: <code>while read line; do echo "got: $line"; done &lt; journal.txt</code>`,note:HOME_NOTE,
  anat:[['while','kw'],['read','cmd'],['line','var'],[';','op'],['do','kw'],['echo "got: $line"','cmd'],[';','op'],['done','kw'],['<','op'],['journal.txt','arg']],answer:'while read line; do echo "got: $line"; done < journal.txt',
  explain:`<code>&lt; journal.txt</code> feeds the file to the whole loop. Each turn, <code>read</code> puts the next line into <code>line</code>; at the end of the file it fails and the loop stops. Add <code>-r</code> to keep backslashes as they are. Try the same loop on <code>numbers.txt</code> and add the numbers up.`,
  check:c=>{const want=c.read('~/journal.txt').split('\n').map(s=>s.trim()).filter(Boolean).map(l=>'got: '+l).join('\n');
    return !!want&&c.ran('read')&&looped(c)&&said(c)===want}},
 {title:'Script: sum',kind:'script',file:'scripts/sum.sh',
  goal:`Write <code>scripts/sum.sh</code>: it prints the sum of all its arguments, so <code>bash scripts/sum.sh 1 2 3</code> prints <code>6</code>, and with no arguments at all it prints <code>0</code>.`,
  anat:[['sum=0','var'],['for','kw'],['n','var'],['in "$@"','arg'],['do','kw'],['sum=$((sum + n))','var'],['done','kw'],['echo "$sum"','cmd']],
  answer:SUM_ANSWER,
  starter:`#!/bin/bash
# Print the sum of all the arguments: 1 2 3 gives 6, no arguments gives 0.
# Start a total at 0, loop over "$@" and add each number with $(( )).
`,
  wrong:[`#!/bin/bash
echo $(($1 + $2))
`,`#!/bin/bash
echo $(($1 + $2 + $3))
`,`#!/bin/bash
sum=1
for n in "$@"; do
  sum=$((sum + n))
done
echo "$sum"
`],
  tests:[{label:'three numbers',args:['1','2','3'],expectOut:'6'},{label:'two numbers',args:['10','20'],expectOut:'30'},{label:'no arguments',args:[],expectOut:'0'}],
  hint:`Use the running total from mission 3, but loop over <code>"$@"</code>. Save it, then run <code>bash scripts/sum.sh 1 2 3</code>.`,
  explain:`<code>"$@"</code> is every argument, each kept whole, so <code>for n in "$@"</code> visits them in turn. With no arguments the loop body never runs and the total stays 0. Each time you save, the script is tried with <code>1 2 3</code>, <code>10 20</code> and nothing.`}
 ]},
{tier:'advanced',name:'Functions & arguments',badge:'Function Maker',intro:'A function gives a few commands one name, so you can run them again with different arguments. Inside it, $1, $# and "$@" describe the call, local keeps its variables to itself, and its exit status answers yes or no.',
 learned:['name() { … }','$1 and $#','"$@"','return status','local','${VAR:-default}'],setup:seedAdvanced,
 missions:[
 {title:'Define and call',goal:`Give a group of commands a name, then use it: <code>greet() { echo "Hello, $1!"; }; greet Ada</code>`,
  anat:[['greet()','kw'],['{','kw'],['echo "Hello, $1!";','cmd'],['}','kw'],[';','op'],['greet','cmd'],['Ada','arg']],answer:'greet() { echo "Hello, $1!"; }; greet Ada',
  explain:`<code>greet() { …; }</code> defines a <b>function</b>: from now on <code>greet</code> works like a command in this shell. Inside it, <code>$1</code> is the first argument of the call, so <code>greet Ada</code> prints Hello, Ada! and <code>greet Grace</code> prints Hello, Grace!. The spaces inside the braces and the <code>;</code> before <code>}</code> are required. <code>type greet</code> tells you greet is a function.`,
  check:c=>said(c)==='Hello, Ada!'&&callsFn(c,n=>fnRun(n,'Grace').out==='Hello, Grace!')},
 {title:'Count the arguments',goal:`<code>$#</code> is how many arguments a call got: <code>count() { echo "$#"; }; count a b c</code>`,
  anat:[['count()','kw'],['{','kw'],['echo "$#";','cmd'],['}','kw'],[';','op'],['count','cmd'],['a b c','arg']],answer:'count() { echo "$#"; }; count a b c',
  explain:`Each word after the function name is one argument, so <code>count a b c</code> prints 3. Quotes make one argument out of several words: <code>count "a b" c</code> prints 2. Outside any function, <code>$#</code> counts the arguments of the shell itself, 0 here.`,
  check:c=>said(c)==='3'&&callsFn(c,n=>fnRun(n,'p q').out==='2')},
 {title:'All the arguments',goal:`Loop over every argument of a call with <code>"$@"</code>: <code>show() { for a in "$@"; do echo "- $a"; done; }; show x y</code>`,
  anat:[['show()','kw'],['{','kw'],['for','kw'],['a','var'],['in "$@"','arg'],[';','op'],['do','kw'],['echo "- $a"','cmd'],[';','op'],['done;','kw'],['}','kw'],[';','op'],['show x y','cmd']],
  answer:'show() { for a in "$@"; do echo "- $a"; done; }; show x y',
  explain:`<code>"$@"</code> stands for all the arguments, each kept whole, so <code>show "big map" key</code> prints two lines, not three. Without the quotes, <code>$@</code> splits every argument at its spaces again. <code>for a; do</code> is short for <code>for a in "$@"; do</code>.`,
  check:c=>said(c)==='- x\n- y'&&looped(c)&&callsFn(c,n=>fnRun(n,'one two three').out==='- one\n- two\n- three')},
 {title:'Return a status',goal:`A function answers yes or no through its exit status: <code>is_big() { [ "$1" -gt 10 ]; }; is_big 20 &amp;&amp; echo big</code>`,
  anat:[['is_big()','kw'],['{','kw'],['[ "$1" -gt 10 ];','cmd'],['}','kw'],[';','op'],['is_big 20','cmd'],['&&','op'],['echo big','cmd']],answer:'is_big() { [ "$1" -gt 10 ]; }; is_big 20 && echo big',
  explain:`A function's status is the status of the last command it ran, here the test: 0 when the number is bigger than 10, 1 when it is not. So <code>is_big 20 &amp;&amp; echo big</code> prints big and <code>is_big 5 &amp;&amp; echo big</code> prints nothing. <code>return 1</code> leaves a function early with a status of your choice.`,
  check:c=>said(c)==='big'&&guarded(c)&&callsFn(c,n=>fnRun(n,'20').code===0&&fnRun(n,'5').code!==0)},
 {title:'Keep it local',goal:`Give a function its own variable that leaves the caller's alone: <code>f() { local x=2; echo "$x"; }; x=1; f; echo "$x"</code>`,
  anat:[['f()','kw'],['{','kw'],['local x=2;','cmd'],['echo "$x";','cmd'],['}','kw'],[';','op'],['x=1','var'],[';','op'],['f','cmd'],[';','op'],['echo "$x"','cmd']],answer:'f() { local x=2; echo "$x"; }; x=1; f; echo "$x"',
  explain:`<code>local x=2</code> makes an x that belongs to this call only. The function prints 2, and when it returns the outer x is back, so the last echo prints 1. Leave out <code>local</code> and the function overwrites the caller's x: both echoes print 2. <code>local</code> works only inside a function.`,
  check:c=>said(c)==='2\n1'&&c.ran('local')&&c.log.some(e=>e.name==='local'&&e.args.some(a=>SQ.S.vars[a.split('=')[0]]==='1'))&&callsFn(c,n=>fnRun(n,'').out==='2')},
 {title:'Default values',goal:`Print a variable, with a fallback for when it is unset or empty: <code>echo "\${NAME:-stranger}"</code>`,
  anat:[['echo','cmd'],['"${NAME:-stranger}"','var']],answer:'echo "${NAME:-stranger}"',
  explain:`<code>\${NAME:-stranger}</code> gives the value of NAME, or the word after <code>:-</code> when NAME is unset or empty. NAME itself does not change. Set it with <code>NAME=Ada</code> and the same line prints Ada. In a script, <code>\${1:-world}</code> gives the first argument a default.`,
  check:c=>{const m=/\$\{([A-Za-z_]\w*):-([^}]*)\}/.exec(c.line);if(!m)return false;const v=Object.prototype.hasOwnProperty.call(SQ.S.vars,m[1])?SQ.S.vars[m[1]]:'';const want=v?String(v):m[2].replace(/^["']|["']$/g,'');
    return !!want&&said(c)===want}},
 {title:'Script: greeter',kind:'script',file:'scripts/greet.sh',
  goal:`Write <code>scripts/greet.sh</code>: <code>bash scripts/greet.sh Ada</code> prints <code>Hello, Ada!</code>. Run with no name, it prints <code>usage: greet.sh NAME</code> on stderr (<code>&gt;&amp;2</code>) and exits with 1. Open it with <code>nano scripts/greet.sh</code>.`,
  anat:[['if','kw'],['[ -z "$1" ]','cmd'],['then','kw'],['echo "usage: greet.sh NAME"','cmd'],['>&2','op'],['exit 1','kw'],['fi','kw'],['echo "Hello, $1!"','cmd']],
  answer:GREET_ANSWER,
  starter:`#!/bin/bash
# Print "Hello, NAME!" for the name given as $1.
# With no name at all, print "usage: greet.sh NAME" on stderr (>&2)
# and stop with exit 1.
`,
  wrong:[`#!/bin/bash
if [ -z "$1" ]; then
  echo "usage: greet.sh NAME"
  exit 1
fi
echo "Hello, $1!"
`,`#!/bin/bash
if [ -z "$1" ]; then
  echo "usage: greet.sh NAME" >&2
fi
echo "Hello, $1!"
`,`#!/bin/bash
[ -z "$1" ] && { echo "usage: greet.sh NAME" >&2; exit 1; }
for word in $@; do
  echo "Hello, $word!"
done
`],
  tests:[{label:'a name',args:['Ada'],expectOut:'Hello, Ada!'},{label:'no name',args:[],expectOut:'',expectErrMatch:'usage',expectCode:1},
    {label:'a name with a space',args:['Ada Lovelace'],expectOut:'Hello, Ada Lovelace!'}],
  hint:`Test for a missing name with <code>[ -z "$1" ]</code>, print the usage line with <code>&gt;&amp;2</code> at the end and stop with <code>exit 1</code>. Save it, then try <code>bash scripts/greet.sh Ada</code> and <code>bash scripts/greet.sh; echo $?</code>.`,
  explain:`<code>&gt;&amp;2</code> sends echo's text to <b>stderr</b>, the error stream: a pipe or <code>&gt; file</code> passes it by and it still reaches the screen. <code>exit 1</code> ends the script with status 1, which tells the caller something went wrong: <code>bash scripts/greet.sh || echo failed</code>. Each time you save, the script is tried with <code>Ada</code>, with nothing, and with <code>"Ada Lovelace"</code>, one argument with a space that must stay whole.`}
 ]},
{tier:'advanced',name:'Real scripts',badge:'Scripter',intro:'Real scripts read input, share code through libraries, write files and report success or failure through their exit status. The chapter ends with a capstone: a backup script you could use for real.',
 learned:['read <<< string','source','exit status','read from stdin','here-documents','wc -l < file','the backup capstone'],setup:seedReal,
 missions:[
 {title:'Read from a string',goal:`Split a string into variables with read and a here-string: <code>read first rest &lt;&lt;&lt; "alpha beta gamma"; echo "$rest"</code>`,
  anat:[['read','cmd'],['first rest','var'],['<<<','op'],['"alpha beta gamma"','arg'],[';','op'],['echo "$rest"','cmd']],answer:'read first rest <<< "alpha beta gamma"; echo "$rest"',
  explain:`<code>&lt;&lt;&lt;</code>, a <b>here-string</b>, feeds the text to read as its input. read puts one word in each variable and the rest of the line in the last one, so first is alpha and rest is <code>beta gamma</code>. A pipe would not work here: in <code>echo "alpha beta" | read first rest</code> each part of the pipe runs in its own copy of the shell, so the variables are empty afterwards.`,
  check:c=>{const e=c.log.find(e=>e.name==='read'&&e.code===0&&e.args.filter(a=>!a.startsWith('-')).length>=2);if(!e)return false;
    const names=e.args.filter(a=>!a.startsWith('-')),last=names[names.length-1];
    return /<<</.test(c.line)&&said(c)==='beta gamma'&&SQ.S.vars[last]==='beta gamma'&&new RegExp('\\$\\{?'+reEsc(last)+'\\b').test(c.line)}},
 {title:'Share a library',goal:`<code>lib/strings.sh</code> holds a function. Load it into your shell and use it: <code>source lib/strings.sh; shout hello</code>`,note:HOME_NOTE,
  anat:[['source','cmd'],['lib/strings.sh','arg'],[';','op'],['shout','cmd'],['hello','arg']],answer:'source lib/strings.sh; shout hello',
  explain:`<code>source</code>, or its short name <code>.</code>, runs a file in <b>this</b> shell, so the functions it defines stay: <code>shout</code> now works like a command. <code>bash lib/strings.sh</code> would run it in a separate shell, and shout would be gone when that ended. Look inside with <code>cat lib/strings.sh</code>: shout pipes its argument through <code>tr a-z A-Z</code>.`,
  check:c=>{const F=SQ.S.fns||{},lib=c.read('~/lib/strings.sh');
    const sourced=c.log.some(e=>(e.name==='source'||e.name==='.')&&e.code===0&&e.args.some(a=>/(^|\/)lib\/strings\.sh$/.test(a)));
    return said(c)==='HELLO'&&!!F.shout&&lib.includes(F.shout)&&fnsCalled(c).includes('shout')&&(sourced||!c.ran('(fn)'))}},
 {title:'Script: exit codes',kind:'script',file:'scripts/check.sh',
  goal:`Write <code>scripts/check.sh</code>: it exits with 0 when its argument is a file. Otherwise it prints a message naming it on stderr and exits with 1. Try <code>bash scripts/check.sh journal.txt; echo $?</code>.`,
  anat:[['if','kw'],['[ -f "$1" ]','cmd'],['then','kw'],['exit 0','kw'],['fi','kw'],['echo "check.sh: $1 is not a file"','cmd'],['>&2','op'],['exit 1','kw']],
  answer:CHECK_ANSWER,
  starter:`#!/bin/bash
# Exit with 0 when $1 is a file.
# Otherwise print a message that names $1 on stderr (>&2) and exit with 1.
`,
  wrong:[`#!/bin/bash
[ -f "$1" ] || echo "not a file: $1" >&2
exit 0
`,`#!/bin/bash
[ -f "$1" ] && exit 0
exit 1
`,`#!/bin/bash
if [ -d "$1" ]; then exit 0; fi
echo "not a folder: $1" >&2
exit 1
`,CHECK_ANSWER.replace('[ -f "$1" ]','[ -e "$1" ]')],
  tests:[{label:'a file',args:['journal.txt'],files:{'journal.txt':JOURNAL},expectCode:0},{label:'a missing file',args:['ghost'],expectErrMatch:'ghost',expectCode:1},
    {label:'a folder, not a file',args:['village'],files:{'village/shop.txt':'apple 2'},expectErrMatch:'village',expectCode:1}],
  hint:`Use <code>[ -f "$1" ]</code> and <code>exit 0</code>, then <code>echo … &gt;&amp;2</code> and <code>exit 1</code>. Save it, then try <code>bash scripts/check.sh ghost; echo $?</code>.`,
  explain:`Every command ends with an <b>exit status</b>, and a script's status is the number given to <code>exit</code>, or else that of its last command. 0 means success and anything else failure, and that is what <code>if</code>, <code>&amp;&amp;</code> and <code>||</code> read: <code>bash scripts/check.sh ghost || echo no file</code>. Messages for people go to stderr, so a caller that only wants the status can drop them with <code>2&gt;/dev/null</code>.`},
 {title:'Script: ask a question',kind:'script',file:'scripts/ask.sh',
  goal:`Write <code>scripts/ask.sh</code>: it reads a name from its input and prints <code>Hello, NAME!</code>. Try <code>bash scripts/ask.sh &lt;&lt;&lt; Ada</code>, or type the name in the editor's input box and use Save &amp; run.`,
  anat:[['read','cmd'],['name','var'],['echo "Hello, $name!"','cmd']],
  answer:ASK_ANSWER,
  starter:`#!/bin/bash
# Read one line (a name) from the input, then print "Hello, NAME!".
`,
  wrong:[`#!/bin/bash
echo "Hello, $1!"
`,`#!/bin/bash
echo "Hello, Ada!"
`,`#!/bin/bash
read name
echo "Hello, name!"
`],
  tests:[{label:'Ada on stdin',stdin:'Ada\n',expectOut:'Hello, Ada!'},{label:'Grace on stdin',stdin:'Grace\n',expectOut:'Hello, Grace!'}],
  hint:`One <code>read name</code>, then an echo with <code>"$name"</code> in it. Save it, then try <code>bash scripts/ask.sh &lt;&lt;&lt; Ada</code>.`,
  explain:`read takes the next line of the script's input (stdin): whatever is piped or redirected into the script, or what you put in the editor's input box. That is not the same as arguments: <code>$1</code> is typed after the script's name, input arrives on its own. Each time you save, the script is given Ada and then Grace as input.`},
 MKCONF={title:'Script: write a config',kind:'script',file:'scripts/mkconf.sh',
  goal:`Write <code>scripts/mkconf.sh</code>: with a here-document, it writes <code>app.conf</code> holding the two lines <code>name=quest</code> and <code>mode=fast</code>. Running it again must leave the same file.`,
  anat:[['cat','cmd'],['> app.conf','op'],['<<EOF','op'],['name=quest','arg'],['mode=fast','arg'],['EOF','kw']],
  answer:MKCONF_ANSWER,
  starter:`#!/bin/bash
# Write app.conf with a here-document:
# cat > app.conf <<EOF
# ...the two lines...
# EOF
`,
  wrong:[`#!/bin/bash
cat >> app.conf <<EOF
name=quest
mode=fast
EOF
`,`#!/bin/bash
cat > app.conf <<EOF
name=quest
mode=slow
EOF
`,`#!/bin/bash
cat <<EOF
name=quest
mode=fast
EOF
`],
  check:c=>usesHereDoc(c.read('~/scripts/mkconf.sh'))&&c.scriptPasses(MKCONF).ok,
  checkFail:'The file is right, but write it with a here-document: cat > app.conf <<EOF, the two lines, then EOF.',
  tests:[{label:'a first run',expectFiles:{'app.conf':'name=quest\nmode=fast'}},{label:'running it a second time',files:{'app.conf':'name=quest\nmode=fast'},expectFiles:{'app.conf':'name=quest\nmode=fast'}}],
  hint:`Put <code>cat &gt; app.conf &lt;&lt;EOF</code> on one line, the two settings on the next two, and <code>EOF</code> alone on the last. Save it, run <code>bash scripts/mkconf.sh</code> twice, then <code>cat app.conf</code>.`,
  explain:`A <b>here-document</b> feeds the lines after the command, up to a line holding only the end word (EOF here), to the command as its input. With <code>cat &gt; app.conf</code> they land in the file. <code>&gt;</code> starts the file afresh each time, so a second run leaves the same two lines, while <code>&gt;&gt;</code> would add them again. Variables inside are expanded; write <code>&lt;&lt;'EOF'</code> to keep a <code>$</code> as it is. Here-documents go in scripts: this practice shell runs one typed line at a time.`},
 {title:'Script: count lines',kind:'script',file:'scripts/loglines.sh',
  goal:`Write <code>scripts/loglines.sh</code>: for every <code>.log</code> file in <code>logs/</code>, it prints the file's name and its number of lines, like <code>app.log: 4</code>, in name order.`,
  anat:[['for','kw'],['f','var'],['in logs/*.log','arg'],['n=$(wc -l < "$f")','var'],['echo "$(basename "$f"): $n"','cmd'],['done','kw']],
  answer:LOGLINES_ANSWER,
  starter:`#!/bin/bash
# For every .log file in logs/, print "NAME: N" (N = its number of lines).
# Loop over logs/*.log, count with wc -l, strip the folder with basename.
`,
  wrong:[`#!/bin/bash
wc -l logs/*.log
`,`#!/bin/bash
echo "app.log: 4"
echo "db.log: 2"
echo "web.log: 3"
`,`#!/bin/bash
for f in logs/*; do
  echo "$(basename "$f"): $(wc -l < "$f")"
done
`],
  tests:[{label:'the logs here',files:under('logs',LOGS15),expectOut:'app.log: 4\ndb.log: 2\nweb.log: 3'},
    {label:'other logs',files:LOG_CASE2,expectOut:'app.log: 1\ncache.log: 3\ndb.log: 5\nweb.log: 2'}],
  hint:`Loop with <code>for f in logs/*.log</code>. Inside, <code>n=$(wc -l &lt; "$f")</code> and <code>echo "$(basename "$f"): $n"</code>. Save it, then run <code>bash scripts/loglines.sh</code>.`,
  explain:`<code>wc -l &lt; "$f"</code> prints just the number, because wc reads its input and never sees a file name; <code>wc -l "$f"</code> would print <code>4 logs/app.log</code>. <code>$( )</code> captures the number, and <code>basename</code> (or <code>\${f##*/}</code>) drops the folder. A wildcard lists names in order, so the lines come out sorted. Each time you save, the script is tried on the logs here and on a different set of logs.`},
 BACKUP
 ]}
];
SQ.content.chapters.push(...CH);
})(window.SQ = window.SQ || {});
