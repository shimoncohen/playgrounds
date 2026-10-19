(function (SQ) {
SQ.content=SQ.content||{chapters:[],guide:[],quickfire:[]};
const {JOURNAL,ensureDir,ensureFile}=SQ;
const NUMBERS=['4','8','15','16','23','42'].join('\n');
/* Chapters 12 and 13 need the journal, the village folder, an empty scripts/ folder and numbers.txt.
   village/people.txt is already in the starting world (names only) and is left alone. lib/strings.sh belongs to chapter 15. */
const seedAdvanced=()=>{ensureFile('~/journal.txt',JOURNAL);ensureDir('~/village');ensureDir('~/scripts');ensureFile('~/numbers.txt',NUMBERS)};

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
 ]}
];
SQ.content.chapters.push(...CH);
})(window.SQ = window.SQ || {});
