(function (SQ) {
SQ.content=SQ.content||{chapters:[],guide:[],quickfire:[]};
const {ensureDir,ensureFile}=SQ;
/* The Expert chapters reuse the Intermediate village data (tier-intermediate.js exposes it as SQ.VILLAGE), so a learner who opens
   any Expert chapter first still finds village/sales.csv, village/logs/access.log, village/logs/all.log and config.ini. Chapter 18 adds
   inbox/ (three .txt files and a readme.md the *.txt pattern leaves out), lists/ (two unsorted, overlapping word lists) and an empty
   archive/. ensureFile and ensureDir never overwrite, so every chapter can seed it all. */
const V=SQ.VILLAGE;
const INBOX={'a.txt':'Buy rope\nMend the gate\nFeed the owl','b.txt':'Call Mira\nSweep the yard',
  'c.txt':'Light the torch\nCount the sheep\nOil the hinges\nRead the map','readme.md':'Notes for the inbox.'};
const LISTS={'a.txt':'pear\napple\nplum\nfig','b.txt':'fig\nkiwi\napple\npear'};
const seedExpert=()=>{ensureDir('~/scripts');ensureFile('~/village/sales.csv',V.SALES);ensureFile('~/village/logs/access.log',V.ACCESS);
  ensureFile('~/village/logs/all.log',V.ALLLOG);ensureFile('~/config.ini',V.CONFIG);
  for(const k of Object.keys(INBOX))ensureFile('~/inbox/'+k,INBOX[k]);for(const k of Object.keys(LISTS))ensureFile('~/lists/'+k,LISTS[k]);ensureDir('~/archive')};
SQ.EXPERT_SEED={INBOX,LISTS}; /* for the tests */
const HOME_NOTE=`Not at home? Run <code>cd ~</code> first.`;
/* everything the line printed, one trimmed line each, blank lines dropped */
const said=c=>c.out().split('\n').map(s=>s.trim()).filter(Boolean).join('\n');
const rows=text=>text.split('\n').map(s=>s.trim()).filter(Boolean);
/* the program text of a logged awk command: the first word that is not an option (-F x, -F, -v k=v, -vk=v) */
const awkProg=e=>{const a=e.args;for(let i=0;i<a.length;i++){const x=a[i];
  if(x==='-F'||x==='-v'||x==='-f'){i++;continue}if(x==='--')return a[i+1]==null?null:a[i+1];if(x.length>1&&x[0]==='-')continue;return x}return null};
/* the programs of every awk that ran on this line (a pipeline of two awks counts as one job) */
const awkProgs=c=>c.log.filter(e=>e.name==='awk'&&e.code===0).map(e=>awkProg(e)||'');
const ranAwk=(c,ok)=>c.ran('awk',e=>e.code===0&&(!ok||ok(e,awkProg(e)||'')));
/* the learner's own jobs only: c.jobs() also lists jobs started inside scripts and bash -c (owner != 0) */
const myJobs=c=>c.jobs().filter(j=>j.owner===0);
/* jobs started on this line: bash printed their "[N] PID" notice on stderr */
const startedHere=c=>{const e=c.err();return myJobs(c).filter(j=>new RegExp('(^|\\n)\\['+j.id+'\\] '+j.pid+'(\\n|$)').test(e))};

const REPORT_ANSWER=`#!/bin/bash
# Print each row's name and total (quantity times price) from the CSV file given as $1.
if [ ! -r "$1" ]; then
  echo "report.sh: cannot read $1" >&2
  exit 1
fi
# Skip line 1 when it is a header row (its quantity is not a number), then print every row.
awk -F, 'NR == 1 && $2 !~ /^[0-9]/ {next} {printf "%-8s %7.2f\\n", $1, $2*$3}' "$1"
`;
const HEADER_CSV='name,qty,price\nlamp,2,7.5\noil,10,1.25';
const REPORT={title:'Script: report',kind:'script',file:'scripts/report.sh',
  goal:`Write <code>scripts/report.sh</code>: given a CSV file of <code>name,quantity,price</code> rows, it prints each name and its total (quantity times price) with <code>printf "%-8s %7.2f\\n"</code>. A first row that is a header (<code>name,qty,price</code>) is skipped. A file it cannot read gives <code>report.sh: cannot read FILE</code> on stderr and exit status 1. Try <code>bash scripts/report.sh village/sales.csv</code>.`,
  anat:[['[ ! -r "$1" ]','cmd'],['>&2','op'],['exit 1','kw'],['awk','cmd'],['-F,','opt'],["'NR == 1 && $2 !~ /^[0-9]/ {next}","arg"],['{printf "%-8s %7.2f\\n", $1, $2*$3}\'','arg'],['"$1"','var']],
  answer:REPORT_ANSWER,
  starter:`#!/bin/bash
# Print "NAME  TOTAL" for each row of the CSV file given as $1 (name,quantity,price).
# 1. Cannot read "$1"? Print "report.sh: cannot read $1" on stderr, exit 1.
# 2. awk -F, with printf "%-8s %7.2f\\n", $1, $2*$3
# 3. Skip line 1 only when it is a header row (its quantity is not a number).
#    village/sales.csv has no header: its first line is a real row, keep it.
#    NR is the line number, and next skips to the next line.
`,
  wrong:[REPORT_ANSWER.replace("NR == 1 && $2 !~ /^[0-9]/ {next} ",'NR > 1 '),REPORT_ANSWER.replace("NR == 1 && $2 !~ /^[0-9]/ {next} ",''),
    REPORT_ANSWER.replace(' >&2',''),REPORT_ANSWER.replace('exit 1','exit 0'),
    REPORT_ANSWER.replace('%7.2f','%d'),
    `#!/bin/bash
awk -F, '{print $1, $2*$3}' "$1"
`],
  tests:[
    {label:'the sales file',args:['village/sales.csv'],files:{'village/sales.csv':V.SALES},expectOut:'apple      24.00\nbread      90.00\nrope       48.00\ntorch      72.00\nmap        40.00'},
    {label:'a one-row file',args:['one.csv'],files:{'one.csv':'rope,4,12'},expectOut:'rope       48.00'},
    {label:'a file with a header row',args:['shop.csv'],files:{'shop.csv':HEADER_CSV},expectOut:'lamp       15.00\noil        12.50'},
    {label:'a missing file',args:['ghost.csv'],expectOut:'',expectErr:'report.sh: cannot read ghost.csv',expectCode:1}],
  hint:`Guard first: <code>if [ ! -r "$1" ]; then echo "report.sh: cannot read $1" &gt;&amp;2; exit 1; fi</code>. Then one awk line: <code>-F,</code>, a first rule <code>NR == 1 &amp;&amp; $2 !~ /^[0-9]/ {next}</code> that skips a header, and a second rule with the action <code>{printf "%-8s %7.2f\\n", $1, $2*$3}</code>. Save it, then run <code>bash scripts/report.sh village/sales.csv</code>.`,
  explain:`<code>[ -r "$1" ]</code> is true when the file is there and you may read it, so <code>!</code> turns it into "cannot read". awk's <code>printf</code> works like the shell's: <code>%-8s</code> puts the name in 8 columns, lined up on the left, and <code>%7.2f</code> prints the number with 2 decimals, lined up on the right in 7 columns. No newline is added: end the format with <code>\\n</code>. <code>NR</code> is the line number, <code>!~</code> means "does not match" a regular expression, <code>&amp;&amp;</code> means and, and <code>next</code> skips straight to the next line. So the first rule drops line 1 only when its quantity does not start with a digit, as in <code>name,qty,price</code>. A plain <code>NR &gt; 1</code> would always drop line 1, and with it apple, the first row of the sales file. Each time you save, the script is tried on the sales file, a one-row file, a file with a header row and a missing file.`};

const FANOUT_ANSWER=`#!/bin/bash
# Start one background job per argument: it sleeps that many seconds, then says so. Wait for all of them.
if [ "$#" -eq 0 ]; then
  echo "usage: fanout.sh SECONDS..." >&2
  exit 1
fi
for n in "$@"; do
  (sleep "$n"; echo "$n done") &
done
wait
`;
/* outside comments, a background & (not &&, >&, &>) and a wait command */
const codeLines=t=>t.split('\n').map(l=>l.replace(/(^|\s)#.*$/,''));
const bgAndWait=t=>{const L=codeLines(t);return L.some(l=>/(^|[^&>|])&(?![&>])/.test(l.replace(/'[^']*'|"[^"]*"/g,'""')))&&L.some(l=>/(^|[;&|({]|\bthen|\bdo)\s*wait\b/.test(l))};
const FANOUT={title:'Script: fan out',kind:'script',file:'scripts/fanout.sh',
  goal:`Write <code>scripts/fanout.sh</code>: for every argument N it starts a background job that sleeps N seconds and then prints <code>N done</code>, and it waits until all of them have finished. <code>bash scripts/fanout.sh 3 1 2</code> prints <code>1 done</code>, <code>2 done</code>, <code>3 done</code> after 3 seconds, not 6. With no arguments it prints <code>usage: fanout.sh SECONDS...</code> on stderr and exits with 1.`,
  anat:[['[ "$#" -eq 0 ]','cmd'],['>&2','op'],['exit 1','kw'],['for','kw'],['n','var'],['in "$@"','arg'],['(sleep "$n"; echo "$n done")','cmd'],['&','op'],['done','kw'],['wait','cmd']],
  answer:FANOUT_ANSWER,
  starter:`#!/bin/bash
# Fan out: one background job per argument.
# 1. No arguments? Print "usage: fanout.sh SECONDS..." on stderr, exit 1.
# 2. For each "$@": ( sleep "$n"; echo "$n done" ) &
# 3. wait for them all.
`,
  wrong:[FANOUT_ANSWER.replace('done\nwait\n','done\n'),FANOUT_ANSWER.replace('(sleep "$n"; echo "$n done") &','sleep "$n"; echo "$n done"'),
    FANOUT_ANSWER.replace('(sleep "$n"; echo "$n done") &','sleep "$n" & echo "$n done"'),
    FANOUT_ANSWER.replace('  (sleep "$n"; echo "$n done") &\n','  (sleep "$n"; echo "$n done") &\n  wait\n').replace('done\nwait\n','done\n'),
    FANOUT_ANSWER.replace(' >&2',''),FANOUT_ANSWER.replace('exit 1','exit 0')],
  tests:[
    {label:'3 1 2',args:['3','1','2'],expectOut:'1 done\n2 done\n3 done',expectClock:3},
    {label:'no arguments',args:[],expectOut:'',expectErr:'usage: fanout.sh SECONDS...',expectCode:1},
    {label:'one job',args:['1'],expectOut:'1 done',expectClock:1},
    {label:'1 3',args:['1','3'],expectOut:'1 done\n3 done',expectClock:3}],
  /* the cases alone pass a script that sleeps the longest time once and prints the sorted list: ask for real jobs and a wait */
  check:c=>bgAndWait(c.read('~/scripts/fanout.sh'))&&c.scriptPasses(FANOUT).ok,
  checkFail:'The output is right, but start a background job (&) for every argument and wait for them.',
  hint:`Check <code>"$#"</code> first. In the loop, put the two steps in parentheses and the <code>&amp;</code> after them: <code>(sleep "$n"; echo "$n done") &amp;</code>. After <code>done</code>, one <code>wait</code>. Save it, then run <code>bash scripts/fanout.sh 3 1 2</code>.`,
  explain:`The parentheses make <code>sleep</code> and <code>echo</code> one job, so each <code>echo</code> runs only after its own sleep, and <code>&amp;</code> starts that job without waiting for it. All the jobs sleep at the same time: the 1-second one reports first, and the whole run takes as long as the longest job, 3 seconds. <code>wait</code> at the end keeps the script alive until every job is done; without it the script ends at once and the jobs report after it is gone. Run the steps one after the other, without <code>&amp;</code>, and it takes 6 seconds and prints 3, 1, 2. Each time you save, the script is tried with <code>3 1 2</code> (the virtual clock must end at 3), with no arguments, with <code>1</code> and with <code>1 3</code>, where waiting for job 1 alone is not enough.`};

/* ---- chapter 18: pipeline mastery ---- */
/* lines as wc -l counts them in this practice shell (a last line without a newline counts too) */
const lineCount=t=>t===''?0:t.replace(/\n$/,'').split('\n').length;
/* the .txt files of ~/inbox as absolute paths, sorted; deep: also in subfolders, as find walks them */
const inboxTxt=deep=>{const root=SQ.norm('~/inbox',SQ.HOME),out=[];
  const walk=(n,p)=>{if(!n||n.type!=='dir')return;for(const k of Object.keys(n.children)){const ch=n.children[k],q=p+'/'+k;
    if(ch.type==='dir'){if(deep)walk(ch,q)}else if(ch.type==='file'&&k.endsWith('.txt'))out.push(q)}};
  walk(SQ.getNode(root),root);return out.sort()};
/* the output of a command line run from the home folder on a throwaway copy of the world */
const homeRun=line=>SQ.sandbox(()=>{SQ.S.cwd=SQ.HOME;const r=SQ.execLine(line);return r.out.filter(o=>o.cls==='out').map(o=>o.text).join('\n')});

const TOPN_ANSWER=`#!/bin/bash
# Print the N most frequent first fields of FILE as "COUNT VALUE": the biggest count first, ties in sort order of the value.
if [ "$#" -ne 2 ]; then
  echo "usage: topn.sh FILE N" >&2
  exit 2
fi
if [ ! -r "$1" ]; then
  echo "topn.sh: cannot read $1" >&2
  exit 1
fi
awk '{print $1}' "$1" | sort | uniq -c | sort -k1,1nr -k2,2 | head -n "$2" | awk '{print $1, $2}'
`;
const FRUIT='pear\nfig\npear\napple\nfig\nkiwi';
const TOPN={title:'Script: top N',kind:'script',file:'scripts/topn.sh',
  goal:`Write <code>scripts/topn.sh FILE N</code>: it prints the N most frequent first fields of FILE as <code>COUNT VALUE</code>, the biggest count first, and values with the same count in sort order. <code>bash scripts/topn.sh village/logs/access.log 2</code> prints <code>4 10.0.0.5</code> and <code>3 10.0.0.7</code>. A file it cannot read gives <code>topn.sh: cannot read FILE</code> on stderr and status 1; not exactly two arguments gives <code>usage: topn.sh FILE N</code> on stderr and status 2.`,
  anat:[['[ "$#" -ne 2 ]','cmd'],['exit 2','kw'],['[ ! -r "$1" ]','cmd'],["awk '{print $1}' \"$1\"",'cmd'],['|','op'],['sort | uniq -c','cmd'],['sort -k1,1nr -k2,2','cmd'],['head -n "$2"','cmd'],["awk '{print $1, $2}'",'cmd']],
  answer:TOPN_ANSWER,
  starter:`#!/bin/bash
# topn.sh FILE N: the N most frequent first fields of FILE, printed as "COUNT VALUE".
# 1. Not exactly two arguments? Print "usage: topn.sh FILE N" on stderr, exit 2.
# 2. Cannot read "$1"? Print "topn.sh: cannot read $1" on stderr, exit 1.
# 3. The first fields | sort | uniq -c | the biggest count first, a tie by value | the first "$2" lines.
#    sort -k1,1nr sorts by field 1 as a number, biggest first; add -k2,2 to sort a tie by field 2.
# 4. uniq -c pads the count with spaces: print each line as "COUNT VALUE".
`,
  wrong:[TOPN_ANSWER.replace('sort -k1,1nr -k2,2','sort -k2,2'),TOPN_ANSWER.replace('sort -k1,1nr -k2,2','sort -rn'),
    TOPN_ANSWER.replace(" | awk '{print $1, $2}'",''),TOPN_ANSWER.replace(' | head -n "$2"',''),
    TOPN_ANSWER.replace('exit 2','exit 1'),TOPN_ANSWER.replace(/if \[ ! -r "\$1" \]; then\n[^\n]*\n[^\n]*\nfi\n/,'')],
  tests:[
    {label:'the access log, N 2',args:['village/logs/access.log','2'],files:{'village/logs/access.log':V.ACCESS},expectOut:'4 10.0.0.5\n3 10.0.0.7'},
    {label:'ties, N bigger than the values',args:['fruit.txt','10'],files:{'fruit.txt':FRUIT},expectOut:'2 fig\n2 pear\n1 apple\n1 kiwi'},
    {label:'an empty file',args:['empty.txt','3'],files:{'empty.txt':''},expectOut:''},
    {label:'a missing file',args:['ghost.txt','3'],expectOut:'',expectErr:'topn.sh: cannot read ghost.txt',expectCode:1},
    {label:'no arguments',args:[],expectOut:'',expectErrMatch:'usage: topn\\.sh',expectCode:2}],
  hint:`Two guards first: <code>[ "$#" -ne 2 ]</code> (usage, <code>exit 2</code>) and <code>[ ! -r "$1" ]</code> (cannot read, <code>exit 1</code>). Then one pipeline: <code>awk '{print $1}' "$1" | sort | uniq -c | sort -k1,1nr -k2,2 | head -n "$2" | awk '{print $1, $2}'</code>. Save it, then run <code>bash scripts/topn.sh village/logs/access.log 2</code>.`,
  explain:`This is the pipeline of the last mission made into a tool. <code>sort -k1,1nr</code> sorts by field 1 only, as a number (<code>n</code>), biggest first (<code>r</code>), and <code>-k2,2</code> then sorts lines with the same count by field 2, the value. A plain <code>sort -rn</code> also reverses the order of a tie: <code>3 10.0.0.9</code> would come before <code>3 10.0.0.7</code>. <code>uniq -c</code> pads its counts with spaces, and the last <code>awk '{print $1, $2}'</code> prints them as <code>COUNT VALUE</code>. An empty file goes through the pipeline and prints nothing. By habit, status 2 means "you called me wrong" and 1 "it went wrong". Each time you save, the script is tried on the access log with N 2, on a file with ties and N 10, on an empty file, on a missing file and with no arguments.`};

/* ---- chapter 19: safe, debuggable scripts ---- */
const OPT_LONG={e:'errexit',u:'nounset',x:'xtrace'};
/* the options a text turns on with set: set -e, set -euo pipefail, set -o nounset, ... (names: errexit, nounset, xtrace, pipefail) */
const setOpts=t=>{const on=new Set();
  for(const m of String(t).matchAll(/(?:^|[;&|({\s'"])set((?:[ \t]+(?:-[a-zA-Z]*o[ \t]+\w+|-[a-zA-Z]+))+)/g)){const w=m[1].trim().split(/\s+/);
    for(let i=0;i<w.length;i++){if(w[i]==='-o'){on.add(w[++i]);continue}for(const ch of w[i].slice(1)){if(ch==='o')on.add(w[++i]);else on.add(OPT_LONG[ch]||ch)}}}
  return on};
/* the bash -c runs on this line: {e, script, on}, with the options its flags (bash -euc, bash -o pipefail -c) and its own set commands turn on */
const bashRuns=c=>c.log.filter(e=>e.name==='bash').map(e=>{const a=e.args,on=new Set();let isC=false,i=0;
  for(;i<a.length;i++){const x=a[i];if(/^-[a-zA-Z]+$/.test(x)){for(const ch of x.slice(1)){if(ch==='c')isC=true;else if(ch==='o')on.add(a[++i]);else on.add(OPT_LONG[ch]||ch)}continue}break}
  if(!isC)return null;const script=a[i]==null?'':a[i];for(const o of setOpts(script))on.add(o);return {e,script,on}}).filter(Boolean);
/* the simple commands of a small script other than set, split at ; && || | and newlines (rough: enough to tell "set -e; false; echo after"
   from "set -e; exit 1") */
const cmdCount=t=>String(t).split(/;|&&|\|\||\||\n/).filter(s=>s.trim()&&!/^\s*set\s/.test(s)).length;
/* a pipe (not ||) somewhere on the line */
const hasPipe=t=>/(^|[^|])\|(?![|&])/.test(t);

const OPTS_ANSWER=`#!/bin/bash
# opts.sh [-v] -n NAME: greet NAME; -v says "verbose on" first.
usage() {
  echo "usage: opts.sh [-v] -n NAME" >&2
  exit 2
}
verbose=0
name=""
while getopts "vn:" opt; do
  case "$opt" in
    v) verbose=1 ;;
    n) name="$OPTARG" ;;
    *) usage ;;
  esac
done
if [ -z "$name" ]; then
  usage
fi
if [ "$verbose" -eq 1 ]; then
  echo "verbose on"
fi
echo "Hello, $name!"
`;
/* getopts as a command, outside comments */
const usesGetopts=t=>codeLines(t).some(l=>/(^|[\s;&|({])getopts\s/.test(l));
const OPTS_USAGE='usage: opts.sh [-v] -n NAME',OPTS_RE='usage: opts\\.sh \\[-v\\] -n NAME';
const OPTS={title:'Script: options',kind:'script',file:'scripts/opts.sh',
  goal:`Write <code>scripts/opts.sh</code> and read its options with <code>getopts "vn:"</code>: <code>-n NAME</code> prints <code>Hello, NAME!</code>, and <code>-v</code> prints <code>verbose on</code> before it. <code>-v -n Ada</code> and <code>-vn Ada</code> both work. No name, an unknown option or <code>-n</code> without a name prints <code>${OPTS_USAGE}</code> on stderr and exits with 2. Try <code>bash scripts/opts.sh -v -n Ada</code>.`,
  anat:[['usage()','kw'],['while','kw'],['getopts "vn:" opt','cmd'],['case "$opt" in','kw'],['v)','kw'],['n) name="$OPTARG"','var'],['*) usage','kw'],['[ -z "$name" ]','cmd'],['echo "Hello, $name!"','cmd']],
  answer:OPTS_ANSWER,
  starter:`#!/bin/bash
# opts.sh [-v] -n NAME: greet NAME; -v says "verbose on" first.
# 1. A usage function: print "${OPTS_USAGE}" on stderr, exit 2.
# 2. while getopts "vn:" opt; do case "$opt" in ... esac; done
#    v sets a flag, n keeps "$OPTARG", anything else (?) calls usage.
# 3. No name after the loop? usage.
# 4. "verbose on" when -v was given, then "Hello, NAME!".
`,
  wrong:[OPTS_ANSWER.replace('getopts "vn:"','getopts "vn"'),OPTS_ANSWER.replace(' >&2',''),OPTS_ANSWER.replace('exit 2','exit 1'),
    OPTS_ANSWER.replace('if [ -z "$name" ]; then\n  usage\nfi\n',''),
    OPTS_ANSWER.replace('if [ "$verbose" -eq 1 ]; then\n  echo "verbose on"\nfi\necho "Hello, $name!"\n','echo "Hello, $name!"\nif [ "$verbose" -eq 1 ]; then\n  echo "verbose on"\nfi\n'),
    OPTS_ANSWER.replace('name="$OPTARG"','name="$2"')],
  tests:[
    {label:'-n Ada',args:['-n','Ada'],expectOut:'Hello, Ada!'},
    {label:'-v -n Ada',args:['-v','-n','Ada'],expectOut:'verbose on\nHello, Ada!'},
    {label:'-vn Ada',args:['-vn','Ada'],expectOut:'verbose on\nHello, Ada!'},
    {label:'no arguments',args:[],expectOut:'',expectErr:OPTS_USAGE,expectCode:2},
    {label:'-x',args:['-x'],expectOut:'',expectErrMatch:OPTS_RE,expectCode:2},
    {label:'-n alone',args:['-n'],expectOut:'',expectErrMatch:OPTS_RE,expectCode:2}],
  /* the cases alone pass a hand-made parser of "$1" and "$2" that knows the -vn spelling: the lesson is getopts */
  check:c=>usesGetopts(c.read('~/scripts/opts.sh'))&&c.scriptPasses(OPTS).ok,
  checkFail:'The output is right, but read the options with getopts "vn:" in a while loop.',
  hint:`Loop with <code>while getopts "vn:" opt; do</code> and a <code>case "$opt" in</code>: <code>v) verbose=1 ;;</code>, <code>n) name="$OPTARG" ;;</code> and <code>*) usage ;;</code>. After <code>done</code>, call usage when <code>[ -z "$name" ]</code>. Save it, then run <code>bash scripts/opts.sh -vn Ada</code> and <code>bash scripts/opts.sh -x</code>.`,
  explain:`<code>getopts "vn:" opt</code> reads one option each time round the loop and puts its letter in <code>opt</code>. Each letter in <code>"vn:"</code> is an option, and the colon after <code>n</code> means it takes a value, which getopts puts in <code>$OPTARG</code>. It reads <code>-v -n Ada</code> and <code>-vn Ada</code> alike. For a letter it does not know, or <code>-n</code> with nothing after it, getopts prints its own message first, such as <code>scripts/opts.sh: illegal option -- x</code>, and sets <code>opt</code> to <code>?</code>, which <code>*)</code> catches. When the options end, <code>shift $((OPTIND - 1))</code> drops them, so <code>$1</code> is the first word after them. Status 2 is the usual answer to a bad command line. Each time you save, the script is tried with <code>-n Ada</code>, <code>-v -n Ada</code>, <code>-vn Ada</code>, no arguments, <code>-x</code> and <code>-n</code> alone.`};

const LOGTOOL_ANSWER=`#!/bin/bash
# logtool.sh [-l LEVEL] [-n N] FILE: the top N source IPs (field 1) of the lines of FILE that contain LEVEL.
set -euo pipefail
usage() {
  echo "usage: logtool.sh [-l LEVEL] [-n N] FILE" >&2
  exit 2
}
level=ERROR
n=3
while getopts "l:n:" opt; do
  case "$opt" in
    l) level="$OPTARG" ;;
    n) n="$OPTARG" ;;
    *) usage ;;
  esac
done
shift $((OPTIND - 1))
if [ "$#" -ne 1 ]; then
  usage
fi
file="$1"
if [ ! -r "$file" ]; then
  echo "error: cannot read $file" >&2
  exit 1
fi
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
# grep finds nothing for an unknown level and fails; under set -e that would end the script, so the failure is expected here
grep -- "$level" "$file" > "$tmp" || true
awk '{print $1}' "$tmp" | sort | uniq -c | sort -k1,1nr -k2,2 | head -n "$n" | awk '{print $1, $2}'
`;
const LOGTOOL_USAGE='usage: logtool.sh [-l LEVEL] [-n N] FILE';
/* a trap ... EXIT (or 0) outside comments */
const usesExitTrap=t=>codeLines(t).some(l=>/(^|[\s;&|({])trap\s+\S.*\s(EXIT|0)(\s|;|$)/i.test(l));
/* the capstone's must-haves, read from the file: set -e, -u and -o pipefail, getopts, mktemp and a trap on EXIT */
const robust=t=>{const code=codeLines(t).join('\n'),on=setOpts(code);
  return on.has('errexit')&&on.has('nounset')&&on.has('pipefail')&&usesGetopts(t)&&/(^|[\s;&|($])mktemp\b/.test(code)&&usesExitTrap(t)};
const ALL_FILES={'village/logs/all.log':V.ALLLOG},TMP=['/tmp'];
const LOGTOOL={title:'Capstone: a robust log tool',kind:'challenge',file:'scripts/logtool.sh',
  goal:`Write <code>scripts/logtool.sh [-l LEVEL] [-n N] FILE</code>. It prints the top N source addresses (field 1) of the lines of FILE that contain LEVEL, as <code>COUNT IP</code>, the biggest count first and a tie in sort order, like topn.sh. The defaults are <code>ERROR</code> and 3. Make it robust: <code>set -euo pipefail</code>, the options read with <code>getopts</code>, and a <code>mktemp</code> work file that a <code>trap … EXIT</code> removes on every way out. A file it cannot read gives <code>error: cannot read FILE</code> on stderr and status 1; a bad option gives <code>${LOGTOOL_USAGE}</code> on stderr and status 2. Try <code>bash scripts/logtool.sh village/logs/all.log</code>.`,
  anat:[['set -euo pipefail','cmd'],['getopts "l:n:" opt','cmd'],['shift $((OPTIND - 1))','cmd'],['[ ! -r "$file" ]','cmd'],['tmp=$(mktemp)','var'],["trap 'rm -f \"$tmp\"' EXIT",'cmd'],['grep -- "$level" "$file" > "$tmp" || true','cmd'],['awk | sort | uniq -c | sort | head','cmd']],
  answer:LOGTOOL_ANSWER,
  starter:`#!/bin/bash
# logtool.sh [-l LEVEL] [-n N] FILE: the top N source IPs (field 1) of the lines of FILE that contain LEVEL.
# Defaults: LEVEL ERROR, N 3. Print "COUNT IP", the biggest count first, a tie in sort order (as in topn.sh).
# 1. set -euo pipefail
# 2. while getopts "l:n:" opt; a bad option prints "${LOGTOOL_USAGE}" on stderr, exit 2.
#    Then shift $((OPTIND - 1)): "$1" is the file.
# 3. Cannot read the file? Print "error: cannot read FILE" on stderr, exit 1.
# 4. tmp=$(mktemp), and trap 'rm -f "$tmp"' EXIT so it goes on every way out.
# 5. grep the level into "$tmp". grep fails when nothing matches, and set -e would stop there: add || true.
# 6. Count field 1 of "$tmp" and keep the first "$n" lines.
`,
  wrong:[LOGTOOL_ANSWER.replace(`trap 'rm -f "$tmp"' EXIT\n`,''),
    LOGTOOL_ANSWER.replace('head -n "$n"','head -n 3'),
    LOGTOOL_ANSWER.replace('  exit 1\n','  exit 0\n'),
    LOGTOOL_ANSWER.replace('set -euo pipefail\n','').replace(/if \[ ! -r "\$file" \]; then\n[^\n]*\n[^\n]*\nfi\n/,'')
      .replace(/grep -- [^\n]*\nawk '\{print \$1\}' "\$tmp"/,()=>`awk -v lvl="$level" 'index($0, lvl) {print $1}' "$file" > "$tmp"\nsort "$tmp"`),
    LOGTOOL_ANSWER.replace('"$tmp" || true','"$tmp"'),
    LOGTOOL_ANSWER.replace('sort -k1,1nr -k2,2','sort -rn'),
    LOGTOOL_ANSWER.replace(' >&2\n  exit 2',' >&2\n  exit 1')],
  tests:[
    {label:'all.log, the defaults',args:['village/logs/all.log'],files:ALL_FILES,expectOut:'3 10.0.0.5\n3 10.0.0.7\n1 10.0.0.12',expectEmpty:TMP},
    {label:'-l WARN -n 1',args:['-l','WARN','-n','1','village/logs/all.log'],files:ALL_FILES,expectOut:'1 10.0.0.12',expectEmpty:TMP},
    {label:'-n 2',args:['-n','2','village/logs/all.log'],files:ALL_FILES,expectOut:'3 10.0.0.5\n3 10.0.0.7',expectEmpty:TMP},
    {label:'a level with no lines',args:['-l','DEBUG','village/logs/all.log'],files:ALL_FILES,expectOut:'',expectCode:0,expectEmpty:TMP},
    {label:'a missing file',args:['nowhere.log'],expectOut:'',expectErr:'error: cannot read nowhere.log',expectCode:1,expectEmpty:TMP},
    {label:'a bad option',args:['-x','village/logs/all.log'],files:ALL_FILES,expectOut:'',expectErrMatch:'usage: logtool\\.sh',expectCode:2,expectEmpty:TMP}],
  /* the cases test the behaviour; the file must also show the habits the tier teaches */
  check:c=>robust(c.read('~/scripts/logtool.sh'))&&c.scriptPasses(LOGTOOL).ok,
  checkFail:'The tests pass, but a robust tool also needs set -euo pipefail, getopts, a mktemp work file and a trap ... EXIT.',
  hint:`Start from the starter's six steps; the options loop is the one from opts.sh with <code>"l:n:"</code>, and the counting pipeline is the one from topn.sh, reading <code>"$tmp"</code>. Save it, then run <code>bash scripts/logtool.sh village/logs/all.log</code>, <code>bash scripts/logtool.sh -l WARN -n 1 village/logs/all.log</code> and <code>bash scripts/logtool.sh -l DEBUG village/logs/all.log; echo $?</code>.`,
  explain:`This puts the whole tier together. <code>set -euo pipefail</code> stops the script at the first error, on an unset variable and on a failing pipeline, so it never carries on with half its data. getopts reads <code>-l</code> and <code>-n</code>, and <code>shift $((OPTIND - 1))</code> leaves the file in <code>$1</code>. The read test comes before any work, so a missing file gets a clear message and status 1. <code>mktemp</code> makes a new empty file in <code>/tmp</code>, and <code>trap 'rm -f "$tmp"' EXIT</code> removes it however the script ends: a normal end, an <code>exit</code> or a stop by <code>set -e</code>. <code>grep</code> exits with 1 when no line matches, which <code>set -e</code> treats as an error: without <code>|| true</code> an unknown level would end the script with status 1 instead of printing nothing. Each time you save, the script is tried on all.log with the defaults, with <code>-l WARN -n 1</code>, with <code>-n 2</code>, with a level that has no lines, on a missing file and with a bad option, and <code>/tmp</code> must be empty after every run.`};

const CH=[
{tier:'expert',name:'awk & sed craft',badge:'Text Wrangler',intro:'awk reads text one line at a time, splits each line into fields and runs a small program on them. sed -i edits a file where it lies. Together they turn raw data into reports.',
 learned:["awk '{print $1}'",'awk -F,','pattern {action}','END {…}','awk arrays','sed -i','printf in awk'],setup:seedExpert,
 missions:[
 {title:'First column',goal:`Print the first field of every line of the access log: <code>awk '{print $1}' village/logs/access.log</code>`,note:HOME_NOTE,
  anat:[['awk','cmd'],["'{print $1}'",'arg'],['village/logs/access.log','arg']],answer:"awk '{print $1}' village/logs/access.log",
  explain:`awk splits each line at its spaces into <b>fields</b>: <code>$1</code> is the first, <code>$2</code> the second, <code>$NF</code> the last and <code>$0</code> the whole line. The program between the braces runs once for every line. Here field 1 is the address that made the request. The single quotes keep bash from reading <code>$1</code> itself: in double quotes it would be bash's first argument, which is empty.`,
  check:c=>{const want=rows(c.read('~/village/logs/access.log')).map(l=>l.split(/\s+/)[0]).join('\n');return !!want&&ranAwk(c,(e,p)=>/\$1\b/.test(p))&&said(c)===want}},
 {title:'Pick a separator',goal:`<code>village/sales.csv</code> separates its fields with commas. Print the names in the first column: <code>awk -F, '{print $1}' village/sales.csv</code>`,note:HOME_NOTE,
  anat:[['awk','cmd'],['-F,','opt'],["'{print $1}'",'arg'],['village/sales.csv','arg']],answer:"awk -F, '{print $1}' village/sales.csv",
  explain:`<code>-F,</code> sets the <b>field separator</b> to a comma, so <code>$1</code> is the name, <code>$2</code> the quantity and <code>$3</code> the price. Without it awk splits at spaces, and a line with no spaces is one big field: <code>$1</code> would be the whole line, <code>apple,12,2</code>. <code>-F:</code> splits at colons, <code>-F'\\t'</code> at tabs.`,
  check:c=>{const want=rows(c.read('~/village/sales.csv')).map(l=>l.split(',')[0]).join('\n');return !!want&&ranAwk(c,(e,p)=>/\$1\b/.test(p)&&(e.args.some(a=>a.startsWith('-F')||/^FS=/.test(a))||/\bFS\s*=/.test(p)))&&said(c)===want}},
 {title:'Filter rows',goal:`Print the names of the items that sold more than 10: <code>awk -F, '$2 &gt; 10 {print $1}' village/sales.csv</code>`,note:HOME_NOTE,
  anat:[['awk','cmd'],['-F,','opt'],["'$2 > 10",'arg'],["{print $1}'",'arg'],['village/sales.csv','arg']],answer:"awk -F, '$2 > 10 {print $1}' village/sales.csv",
  explain:`An awk rule is <code>pattern {action}</code>: the action runs only on the lines where the pattern is true. <code>$2 &gt; 10</code> compares the quantity as a number, so apple (12) and bread (30) pass and rope (4) does not. Inside the quotes <code>&gt;</code> belongs to awk, not to bash, so no file is made. Leave the action out and awk prints the whole line: <code>awk -F, '$2 &gt; 10' village/sales.csv</code>. A pattern can also be a regular expression: <code>awk '/404/' village/logs/access.log</code>.`,
  check:c=>{const want=rows(c.read('~/village/sales.csv')).map(l=>l.split(',')).filter(r=>+r[1]>10).map(r=>r[0]).join('\n');
    return !!want&&ranAwk(c,(e,p)=>{const pat=p.split('{')[0];return /\$/.test(pat)&&!/^\s*(BEGIN|END)\b/.test(pat)})&&said(c)===want}},
 {title:'Add it up',goal:`Add up quantity times price over every row and print the total once, at the end: <code>awk -F, '{s += $2 * $3} END {print s}' village/sales.csv</code>`,note:HOME_NOTE,
  anat:[['awk','cmd'],['-F,','opt'],["'{s += $2 * $3}",'arg'],['END','kw'],["{print s}'",'arg'],['village/sales.csv','arg']],answer:"awk -F, '{s += $2 * $3} END {print s}' village/sales.csv",
  explain:`The first rule runs on every line and adds that row's quantity times price to <code>s</code>. awk variables need no <code>$</code> and start out empty, which counts as 0. <code>END {…}</code> runs once, after the last line, so the total is printed once: 274. Its partner <code>BEGIN {…}</code> runs once before the first line, for a title or a starting value: <code>awk -F, 'BEGIN {print "sold:"} {s += $2} END {print s}' village/sales.csv</code> prints <code>sold:</code> and then 57.`,
  check:c=>{const want=rows(c.read('~/village/sales.csv')).map(l=>l.split(',')).reduce((n,r)=>n+r[1]*r[2],0);
    const p=awkProgs(c).join('\n');
    return !!want&&/\bEND\b/.test(p)&&/\$2\b/.test(p)&&/\$3\b/.test(p)&&!new RegExp('\\b'+want+'\\b').test(p)&&said(c)===String(want)}},
 {title:'Count with an array',goal:`Count how many requests got each status code, the fourth field of the access log: <code>awk '{c[$4]++} END {for (k in c) print k, c[k]}' village/logs/access.log</code>`,note:HOME_NOTE,
  anat:[['awk','cmd'],["'{c[$4]++}",'arg'],['END','kw'],['{for (k in c)','kw'],["print k, c[k]}'",'arg'],['village/logs/access.log','arg']],answer:"awk '{c[$4]++} END {for (k in c) print k, c[k]}' village/logs/access.log",
  explain:`<code>c[$4]</code> is an element of the <b>array</b> <code>c</code>, and its key is the status code. <code>++</code> adds one, and a key awk has not seen yet starts at 0. In <code>END</code>, <code>for (k in c)</code> visits every key once, and <code>print k, c[k]</code> puts a space between the key and its count. awk does not promise any order for the keys, so add <code>| sort</code> when the order matters. <code>sort | uniq -c</code> counts too, but an array can also add up: <code>awk -F, '{t[$1] += $2} END {for (k in t) print k, t[k]}' village/sales.csv</code>.`,
  check:c=>{const want={};for(const l of rows(c.read('~/village/logs/access.log'))){const k=l.split(/\s+/)[3];if(k!=null)want[k]=(want[k]||0)+1}
    const keys=Object.keys(want);if(!keys.length)return false;
    const got=said(c).split('\n').sort().join('\n'),exp=keys.map(k=>k+' '+want[k]).sort().join('\n');
    return got===exp&&ranAwk(c,(e,p)=>/\w\s*\[[^\]]+\]/.test(p)&&/\bEND\b/.test(p)&&/for\s*\(\s*\w+\s+in\s+\w+\s*\)/.test(p)&&!/"[^"]*\d[^"]*"/.test(p))}},
 {title:'Edit in place',goal:`Turn debug on in <code>config.ini</code> by editing the file itself: <code>sed -i 's/debug=false/debug=true/' config.ini</code>`,
  note:`${HOME_NOTE} Changed <code>config.ini</code> already? Delete it and click the chapter again for a fresh copy.`,
  anat:[['sed','cmd'],['-i','opt'],["'s/debug=false/debug=true/'",'arg'],['config.ini','arg']],answer:"sed -i 's/debug=false/debug=true/' config.ini",
  explain:`Plain sed prints the edited text and leaves the file as it was. <code>-i</code> (in place) writes the result back into the file instead and prints nothing, so check with <code>grep debug config.ini</code>. An <b>address</b> picks the lines a command works on: a line number, a range like <code>2,4</code> or a pattern between slashes. <code>sed -n '/debug/p' config.ini</code> prints only the debug line, and <code>sed -i '/^$/d' config.ini</code> would delete the empty line. On a Mac, write <code>sed -i ''</code>.`,
  check:c=>{const want=V.CONFIG.replace('debug=false','debug=true');
    return c.read('~/config.ini')===want&&c.ran('sed',e=>e.code===0&&e.args.some(x=>/^-[a-zA-Z]*i/.test(x)||x.startsWith('--in-place'))&&e.args.some(a=>/true/.test(a)))}},
 REPORT
 ]},
{tier:'expert',name:'Processes & jobs',badge:'Job Controller',intro:'Every running program is a process with a number, its PID. Put a command in the background with & and the prompt comes straight back; jobs, wait and kill keep track of it. Time here is virtual: sleep 30 moves the clock, not your afternoon.',
 learned:['ps','sleep','command &','jobs','wait','kill %1','$!'],setup:seedExpert,
 missions:[
 {title:'See the processes',goal:`List the processes running in this terminal: <code>ps</code>`,
  anat:[['ps','cmd']],answer:'ps',
  explain:`Each row is a <b>process</b>, a running program. <code>PID</code> is its number, <code>TTY</code> the terminal it belongs to, <code>TIME</code> the processor time it has used and <code>CMD</code> the command. <code>bash</code> is your shell itself, and <code>ps</code> lists itself too, because it is running while it looks. Start a job with <code>sleep 30 &amp;</code> and run <code>ps</code> again: a <code>sleep</code> row joins them.`,
  check:c=>{const o=c.out();return c.ran('ps',e=>e.code===0)&&/^\s*PID\s+TTY\s+TIME\s+CMD\s*$/m.test(o)&&/^\s*\d+\s+\S+\s+[\d:]+\s+bash\s*$/m.test(o)}},
 {title:'Run in the background',goal:`Start a 30-second sleep in the background and get the prompt back at once: <code>sleep 30 &amp;</code>`,
  anat:[['sleep','cmd'],['30','arg'],['&','op']],answer:'sleep 30 &',
  explain:`<code>&amp;</code> at the end runs the command as a background <b>job</b>. bash prints the job number in brackets and the process's PID, like <code>[1] 1235</code>, and gives the prompt back while the job runs. Without the <code>&amp;</code>, <code>sleep 30</code> holds the prompt until it ends. The clock here is virtual: <code>sleep 30</code> moves it on by 30 seconds at once, and every line you type adds 1 second.`,
  check:c=>{const s=startedHere(c);return s.length===1&&s[0].state==='Running'}},
 {title:'List the jobs',goal:`With the sleep from the last mission still running, list your jobs: <code>jobs</code>`,
  note:`Jumped straight here, or did the job end? Start one first with <code>sleep 30 &amp;</code>, or do both on one line: <code>sleep 30 &amp; jobs</code>.`,
  anat:[['jobs','cmd']],answer:'jobs',
  explain:`<code>jobs</code> lists the background jobs of this shell: the job number, <code>+</code> for the most recent job and <code>-</code> for the one before, the state and the command. <code>Running</code> means it has not finished yet. A job that ends is reported once as <code>Done</code> and then leaves the list. <code>jobs -l</code> adds each job's PID.`,
  check:c=>myJobs(c).some(j=>j.state==='Running')&&c.ran('jobs',e=>e.code===0&&/Running\s+.*\bsleep \d+.*&\s*$/m.test(e.out))},
 {title:'Wait for it',goal:`Start a 5-second job and wait until it has finished: <code>sleep 5 &amp; wait</code>`,
  anat:[['sleep','cmd'],['5','arg'],['&','op'],['wait','cmd']],answer:'sleep 5 & wait',
  explain:`<code>wait</code> holds the prompt until every background job has ended, and then bash reports each one <code>Done</code>. Here the virtual clock jumps ahead by the 5 seconds instead of making you sit there. <code>wait %1</code> or <code>wait PID</code> waits for one job only. Scripts start several jobs, then <code>wait</code> for all of them before they go on.`,
  /* the job may start on an earlier line (sleep 5 &, then wait): that line's 1-second cost leaves 4 seconds to wait, so a waited
     job of at least 5 seconds counts too */
  check:c=>{const my=myJobs(c),long=j=>{const m=/^\(?\s*sleep (\d+)\s*\)?$/.exec(j.cmd);return !!m&&+m[1]>=5};
    return c.ran('wait',e=>e.code===0)&&c.elapsed()>0&&!my.some(j=>j.state==='Running')
      &&my.some(j=>j.reaped&&j.state==='Done'&&(c.elapsed()>=5||long(j)))}},
 {title:'Kill it',goal:`Start a long job, then stop it before it ends: <code>sleep 100 &amp; kill %1</code>`,
  note:`Other jobs still running? The new one may not be number 1: kill it with <code>kill %N</code> (its number) or <code>kill $!</code>.`,
  anat:[['sleep','cmd'],['100','arg'],['&','op'],['kill','cmd'],['%1','arg']],answer:'sleep 100 & kill %1',
  explain:`<code>kill</code> sends a <b>signal</b> to a process. The default one, TERM, asks it to stop, and bash reports the job <code>Terminated</code>. <code>%1</code> names job 1; a PID works too, such as <code>kill $!</code> for the job you started last. <code>kill -9</code> sends KILL, which a process cannot refuse, and the job is reported <code>Killed</code>.`,
  check:c=>myJobs(c).some(j=>j.reaped&&j.state==='Terminated'&&c.ran('kill',e=>e.code===0&&e.args.some(a=>a.startsWith('%')||a===String(j.pid))))},
 {title:"The last job's PID",goal:`<code>$!</code> holds the PID of the last background job. Keep it, wait for that job, then report: <code>sleep 2 &amp; pid=$!; wait $pid; echo "finished $pid"</code>`,
  anat:[['sleep 2','cmd'],['&','op'],['pid=$!','var'],[';','op'],['wait','cmd'],['$pid','var'],[';','op'],['echo "finished $pid"','cmd']],answer:'sleep 2 & pid=$!; wait $pid; echo "finished $pid"',
  explain:`Right after a job starts, <code>$!</code> is its PID, the number bash printed in <code>[1] 1235</code>. Save it in a variable before you start another job, which would change it. <code>wait $pid</code> waits for that one process and returns its exit status, so <code>sleep 2 &amp; pid=$!; wait $pid; echo $?</code> prints 0. <code>kill $pid</code> would stop it instead.`,
  check:c=>{const b=SQ.rt.bang;return b!=null&&said(c)==='finished '+b&&/\$\{?!/.test(c.line)&&c.ran('wait',e=>e.code===0)&&!myJobs(c).some(j=>String(j.pid)===String(b)&&j.state==='Running')}},
 FANOUT
 ]},
{tier:'expert',name:'Pipeline mastery',badge:'Pipeline Architect',intro:'Small commands get strong when you chain them. find -exec and xargs run a command on every file you find, <( ) hands a command\'s output over as if it were a file, and a pipeline of sort, uniq and head turns a log into a report.',
 learned:['find -exec','xargs -I{}','xargs -n1 -P3','<( )','done < <( )','sort | uniq -c | sort -rn','sort -k1,1nr -k2,2'],setup:seedExpert,
 missions:[
 {title:'Run a command on every match',goal:`Count the lines of every <code>.txt</code> file in <code>inbox</code>, one <code>wc -l</code> per file: <code>find inbox -name '*.txt' -exec wc -l {} \\;</code>`,note:HOME_NOTE,
  anat:[['find','cmd'],['inbox','arg'],["-name '*.txt'",'opt'],['-exec','opt'],['wc -l','cmd'],['{}','arg'],['\\;','op']],answer:"find inbox -name '*.txt' -exec wc -l {} \\;",
  explain:`find walks a folder and all its subfolders. <code>-name '*.txt'</code> keeps the names that end in .txt, so <code>inbox/readme.md</code> is left out; quote the pattern, or bash expands it before find sees it. <code>-exec</code> runs a command on each match: <code>{}</code> stands for the path, and <code>\\;</code> ends the command. The backslash keeps bash from taking the <code>;</code> for itself. End with <code>{} +</code> instead, and find hands all the paths to one command, the way xargs does: <code>find inbox -name '*.txt' -exec echo {} +</code> prints them on one line.`,
  check:c=>{const want=inboxTxt(true);if(!want.length)return false;
    if(!c.ran('find',e=>e.code===0&&e.args.includes('-exec')&&e.args.slice(e.args.indexOf('-exec')+1).includes('wc')))return false;
    const got=rows(c.out()).filter(l=>!/^\d+\s+total$/.test(l)).map(l=>{const m=/^(\d+)\s+(\S.*)$/.exec(l);return m?m[1]+' '+SQ.norm(m[2],c.cwd):null});
    if(got.some(x=>x===null))return false;
    return got.sort().join('\n')===want.map(p=>lineCount(SQ.getNode(p).content)+' '+p).sort().join('\n')}},
 {title:'Feed a command with xargs',goal:`Copy the <code>.txt</code> files of <code>inbox</code> into <code>archive/</code>, one <code>cp</code> for each name <code>ls</code> prints: <code>ls inbox/*.txt | xargs -I{} cp {} archive/</code>`,note:HOME_NOTE,
  anat:[['ls','cmd'],['inbox/*.txt','arg'],['|','op'],['xargs','cmd'],['-I{}','opt'],['cp {} archive/','cmd']],answer:'ls inbox/*.txt | xargs -I{} cp {} archive/',
  explain:`xargs reads words from its input and turns them into arguments for a command. <code>-I{}</code> runs the command once per input line, with the line in place of <code>{}</code>, so this runs <code>cp inbox/a.txt archive/</code>, then the same for b and c. Without <code>-I</code>, xargs adds all the words to the end of one command: <code>ls inbox/*.txt | xargs wc -l</code> runs one <code>wc</code> on the three files. Add <code>-t</code> and xargs prints each command on stderr before it runs it: a good way to see what it builds.`,
  check:c=>{const want=inboxTxt(false);if(!want.length)return false;
    const xi=c.ran('xargs',e=>e.code===0&&e.args.some(a=>/^-\w*I/.test(a))&&e.args.includes('cp'));
    return xi&&want.every(p=>{const n=SQ.getNode(SQ.norm('~/archive/'+p.split('/').pop(),SQ.HOME));return !!n&&n.type==='file'&&n.content===SQ.getNode(p).content})}},
 {title:'Work in parallel',goal:`Run <code>echo job N</code> for 1, 2 and 3, with up to three running at once: <code>echo 1 2 3 | xargs -n1 -P3 echo job</code>`,
  anat:[['echo 1 2 3','cmd'],['|','op'],['xargs','cmd'],['-n1','opt'],['-P3','opt'],['echo job','cmd']],answer:'echo 1 2 3 | xargs -n1 -P3 echo job',
  explain:`<code>-n1</code> gives each command one word, so <code>echo job</code> runs three times. <code>-P3</code> lets up to three of them run at the same time, which saves time when each one is slow. On a real computer the lines can then come out in any order; this practice shell has only one process, so it runs them one after another, in order. Without <code>-n1</code>, xargs puts all three words on one command: <code>echo 1 2 3 | xargs -P3 echo job</code> prints <code>job 1 2 3</code>.`,
  check:c=>said(c).split('\n').sort().join('\n')==='job 1\njob 2\njob 3'&&c.ran('xargs',e=>e.code===0&&e.args.some(a=>/^-\w*P/.test(a)))},
 {title:'Compare without temp files',goal:`Show how <code>lists/a.txt</code> and <code>lists/b.txt</code> differ once both are sorted, without saving sorted copies: <code>diff &lt;(sort lists/a.txt) &lt;(sort lists/b.txt)</code>`,note:HOME_NOTE,
  anat:[['diff','cmd'],['<(sort lists/a.txt)','arg'],['<(sort lists/b.txt)','arg']],answer:'diff <(sort lists/a.txt) <(sort lists/b.txt)',
  explain:`<code>&lt;( )</code> is <b>process substitution</b>: bash runs the command and hands over its output as a file name such as <code>/dev/fd/63</code> (try <code>echo &lt;(true)</code>). So diff reads two sorted files that were never saved. In its output, <code>&lt;</code> marks a line only in the first file and <code>&gt;</code> a line only in the second: <code>2a3</code> means "after line 2 of the first, add line 3 of the second" (kiwi), and <code>4d4</code> means "delete line 4 of the first" (plum). Compare the unsorted files with <code>diff lists/a.txt lists/b.txt</code> and nearly every line differs, because the same words are in another order.`,
  check:c=>{if(!c.isFile('~/lists/a.txt')||!c.isFile('~/lists/b.txt'))return false;
    const want=rows(homeRun('diff <(sort lists/a.txt) <(sort lists/b.txt)')).join('\n');
    return !!want&&c.ran('diff',e=>e.args.some(a=>/^\/dev\/fd\//.test(a)))&&said(c)===want}},
 {title:'Keep the variable',goal:`Count the lines of <code>inbox/a.txt</code> in a while loop, and print the count after the loop: <code>while read l; do n=$((n+1)); done &lt; &lt;(cat inbox/a.txt); echo $n</code>`,
  note:`${HOME_NOTE} Ran it before? <code>n</code> still holds the old count: start the line with <code>n=0;</code> or run <code>unset n</code> first.`,
  anat:[['while','kw'],['read l','cmd'],['do','kw'],['n=$((n+1))','var'],['done','kw'],['<','op'],['<(cat inbox/a.txt)','arg'],['echo $n','cmd']],answer:'while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n',
  explain:`Every part of a pipeline runs in a <b>subshell</b>, a copy of the shell. So in <code>cat inbox/a.txt | while read l; do n=$((n+1)); done; echo "$n"</code> the loop counts in a copy, the copy goes away with the pipeline, and <code>echo</code> prints an empty line. <code>done &lt; &lt;(cat inbox/a.txt)</code> feeds the loop from a process substitution instead: the loop runs in this shell, and <code>n</code> keeps its value, 3. The first <code>&lt;</code> is a plain redirect, the second starts the <code>&lt;( )</code>. For a plain file, <code>done &lt; inbox/a.txt</code> works too; <code>&lt;( )</code> is for the output of a command.`,
  check:c=>{const t=c.read('~/inbox/a.txt');
    return !!t&&c.ran('while')&&c.ran('read')&&/\bdone\s*<(?!<)/.test(c.line)&&!/\|\s*while\b/.test(c.line)&&said(c)===String(lineCount(t))}},
 {title:'Top three',goal:`Find the three addresses with the most requests in the access log, with their counts: <code>sort village/logs/access.log | awk '{print $1}' | uniq -c | sort -rn | head -3</code>`,note:HOME_NOTE,
  anat:[['sort','cmd'],['village/logs/access.log','arg'],['|','op'],["awk '{print $1}'",'cmd'],['uniq -c','cmd'],['sort -rn','cmd'],['head -3','cmd']],answer:"sort village/logs/access.log | awk '{print $1}' | uniq -c | sort -rn | head -3",
  explain:`Read it from left to right. <code>sort</code> puts equal lines next to each other, <code>awk</code> keeps the address, <code>uniq -c</code> counts each run of equal lines, <code>sort -rn</code> sorts by that count as a number (<code>-n</code>), biggest first (<code>-r</code>), and <code>head -3</code> keeps three lines. uniq only compares a line with the one before it, so leave out the first sort and every address counts 1. 10.0.0.5 made 4 requests; 10.0.0.7 and 10.0.0.9 made 3 each.`,
  check:c=>{const cnt=Object.create(null);for(const l of rows(c.read('~/village/logs/access.log'))){const k=l.split(/\s+/)[0];cnt[k]=(cnt[k]||0)+1}
    const vals=Object.values(cnt).sort((a,b)=>b-a),k=Math.min(3,vals.length);if(!k)return false;
    const got=rows(c.out()).map(l=>/^(\d+)\s+(\S+)$/.exec(l));if(got.length!==k||got.some(m=>!m))return false;
    const counted=c.ran('uniq',e=>c.flag(e,'c'))||ranAwk(c,(e,p)=>/\w\s*\[[^\]]+\]/.test(p));
    return counted&&new Set(got.map(m=>m[2])).size===k&&got.every((m,i)=>cnt[m[2]]===+m[1]&&+m[1]===vals[i])}},
 TOPN
 ]},
{tier:'expert',name:'Safe, debuggable scripts',badge:'Toolsmith',intro:'A script that carries on after an error can do real damage. set -e, set -u and set -o pipefail make it stop instead, set -x shows every step, trap cleans up on the way out, and getopts reads options the way real tools do.',
 learned:['bash -c','set -e','set -u','set -o pipefail','set -x','trap … EXIT','getopts','mktemp'],setup:seedExpert,
 missions:[
 {title:'Stop on error',note:`Typed <code>set -e</code> at the prompt? It stays on: a command that fails stops the rest of every line you type until you run <code>set +e</code> (here a chapter switch or Reset world turns it off too; a real terminal would close).`,goal:`Make a small script stop at the first command that fails. Run it with <code>bash -c</code>, then print its exit status: <code>bash -c 'set -e; false; echo after'; echo $?</code>`,
  anat:[['bash -c','cmd'],["'set -e;",'arg'],['false;','arg'],["echo after'",'arg'],[';','op'],['echo $?','cmd']],answer:"bash -c 'set -e; false; echo after'; echo $?",
  explain:`<code>bash -c '…'</code> runs the text as a small script in a new bash. <code>set -e</code> (errexit) makes that script stop at the first command that fails, so <code>echo after</code> never runs, and its exit status is the failing command's: <code>false</code> returns 1. Leave out <code>set -e</code> and it carries on: <code>bash -c 'false; echo after'; echo $?</code> prints <code>after</code> and 0. A command that is tested does not stop it: <code>bash -c 'set -e; false || echo saved; echo after'</code> prints both lines.`,
  check:c=>{const L=rows(c.out());
    return bashRuns(c).some(b=>b.on.has('errexit')&&b.e.code!==0&&cmdCount(b.script)>=2)&&L.every(l=>/^\d+$/.test(l))&&(!L.length||L[L.length-1]!=='0')}},
 {title:'No unset variables',note:`Typed <code>set -u</code> at the prompt? It stays on: reading any unset variable is an error until you run <code>set +u</code> (here a chapter switch or Reset world turns it off too).`,goal:`Make a small script stop when it reads a variable that was never set: <code>bash -c 'set -u; echo "$nope"'</code>`,
  anat:[['bash -c','cmd'],["'set -u;",'arg'],['echo "$nope"\'','arg']],answer:`bash -c 'set -u; echo "$nope"'`,
  explain:`Without <code>set -u</code> an unset variable is just empty, so a typo such as <code>"$fiel"</code> for <code>"$file"</code> slips through, and <code>rm -rf "$dir/"</code> with an empty <code>dir</code> becomes <code>rm -rf /</code>. <code>set -u</code> (nounset) makes it an error: this practice shell prints <code>bash: nope: unbound variable</code> on stderr and stops the script with status 1, as a real script file does. Real bash 5.1 and newer add the line number, <code>bash: line 1: nope: unbound variable</code>, and stop a <code>bash -c</code> script with status 127. A default still works: <code>bash -c 'set -u; echo "\${nope:-none}"'</code> prints <code>none</code>.`,
  check:c=>{const m=/(?:^|\n)bash: (\w+): unbound variable/.exec(c.err());if(!m||!new RegExp('\\$\\{?'+m[1]+'\\b').test(c.line))return false;
    const runs=bashRuns(c).filter(b=>b.on.has('nounset')&&b.e.code===1);
    return runs.length>0||(setOpts(c.line).has('nounset')&&c.status()===1)}},
 {title:"See the whole pipeline's status",goal:`A pipeline's status is normally its last command's. Make a failure anywhere in it count: <code>bash -c 'set -o pipefail; false | true; echo $?'</code>`,
  anat:[['bash -c','cmd'],["'set -o pipefail;",'arg'],['false | true;','arg'],["echo $?'",'arg']],answer:"bash -c 'set -o pipefail; false | true; echo $?'",
  explain:`<code>$?</code> after a pipeline is the status of its last command, so <code>false | true; echo $?</code> prints 0, and the failure of <code>false</code> is lost. With <code>set -o pipefail</code> the status is that of the last command that failed, here 1. Put the three together at the top of a script: <code>set -euo pipefail</code> stops it on an error, on an unset variable and on a failing pipeline. <code>bash -c 'set -euo pipefail; false | true; echo after'</code> prints nothing.`,
  check:c=>{const L=rows(c.out());if(!hasPipe(c.line))return false;
    const runs=bashRuns(c).filter(b=>b.on.has('pipefail')&&hasPipe(b.script)),typed=setOpts(c.line).has('pipefail');
    if(!runs.length&&!typed)return false;
    if(L.length===1&&/^[1-9]\d*$/.test(L[0]))return true;
    return !L.length&&runs.some(b=>b.e.code!==0)}},
 {title:'Trace it',goal:`Watch the commands as they run: turn tracing on, run one command, then turn it off again: <code>set -x; echo hi; set +x</code>`,
  note:`Tracing still on? Every line you type is traced until you run <code>set +x</code>.`,
  anat:[['set -x','cmd'],[';','op'],['echo hi','cmd'],[';','op'],['set +x','cmd']],answer:'set -x; echo hi; set +x',
  explain:`<code>set -x</code> (xtrace) prints each command on stderr before it runs, after bash has expanded it, with a <code>+</code> in front: <code>name=Ada; set -x; echo "hi $name"; set +x</code> shows <code>+ echo 'hi Ada'</code>. <code>set +x</code> turns it off, and is traced itself on the way. To trace a whole script, run it with <code>bash -x</code>, as in <code>bash -x scripts/opts.sh -n Ada</code> once you have written it, or put <code>set -x</code> on one of its lines.`,
  check:c=>{const tr=c.err().split('\n').filter(l=>/^\++ \S/.test(l)&&!/^\++ set [-+](x|o xtrace)$/.test(l));
    const xOn=setOpts(c.line).has('xtrace')||bashRuns(c).some(b=>b.on.has('xtrace'))||!!SQ.rt.opts.x;
    return tr.length>0&&xOn&&c.out().trim()!==''}},
 {title:'Clean up after yourself',goal:`Have a small script run a command when it ends, however it ends: <code>bash -c "trap 'echo bye' EXIT; echo hi"</code>`,
  anat:[['bash -c','cmd'],['"trap','arg'],["'echo bye'",'arg'],['EXIT;','arg'],['echo hi"','arg']],answer:`bash -c "trap 'echo bye' EXIT; echo hi"`,
  explain:`<code>trap 'command' EXIT</code> sets a command to run when the shell exits: at the end of the script, after an <code>exit</code>, or when <code>set -e</code> stops it. <code>bash -c "trap 'echo bye' EXIT; exit 3"; echo $?</code> prints <code>bye</code>, then 3. The double quotes outside hold the single quotes inside. Scripts use it to clean up: <code>tmp=$(mktemp)</code> makes a new empty file such as <code>/tmp/tmp.A00001</code> (the letters are random on a real computer), and <code>trap 'rm -f "$tmp"' EXIT</code> removes it on every way out.`,
  check:c=>{const m=/\btrap\s+(\S.*?)\s+(?:EXIT|0)(?=[\s;'"\\)]|$)/i.exec(c.line);
    return !!m&&/bye/.test(m[1])&&said(c)==='hi\nbye'&&(SQ.rt.exitFired||[]).length>0}}, /* an EXIT handler really ran: the prompt's own trap never fires, so typing the output does not count */
 OPTS,
 LOGTOOL
 ]}
];
SQ.content.chapters.push(...CH);
})(window.SQ = window.SQ || {});
