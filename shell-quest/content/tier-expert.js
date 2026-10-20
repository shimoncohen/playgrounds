(function (SQ) {
SQ.content=SQ.content||{chapters:[],guide:[],quickfire:[]};
const {ensureDir,ensureFile}=SQ;
/* The Expert chapters reuse the Intermediate village data (tier-intermediate.js exposes it as SQ.VILLAGE), so a learner who opens
   chapter 16 or 17 first still finds village/sales.csv, village/logs/access.log and config.ini. ensureFile never overwrites. */
const V=SQ.VILLAGE;
const seedExpert=()=>{ensureDir('~/scripts');ensureFile('~/village/sales.csv',V.SALES);ensureFile('~/village/logs/access.log',V.ACCESS);ensureFile('~/config.ini',V.CONFIG)};
const HOME_NOTE=`Not at home? Run <code>cd ~</code> first.`;
/* everything the line printed, one trimmed line each, blank lines dropped */
const said=c=>c.out().split('\n').map(s=>s.trim()).filter(Boolean).join('\n');
const rows=text=>text.split('\n').map(s=>s.trim()).filter(Boolean);
/* the program text of a logged awk command: the first word that is not an option (-F x, -F, -v k=v, -vk=v) */
const awkProg=e=>{const a=e.args;for(let i=0;i<a.length;i++){const x=a[i];
  if(x==='-F'||x==='-v'||x==='-f'){i++;continue}if(x==='--')return a[i+1]==null?null:a[i+1];if(x.length>1&&x[0]==='-')continue;return x}return null};
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
# Every line after the first, and the first only when its quantity is a number (not a header row).
awk -F, 'NR > 1 || $2 ~ /^[0-9]/ {printf "%-8s %7.2f\\n", $1, $2*$3}' "$1"
`;
const HEADER_CSV='name,qty,price\nlamp,2,7.5\noil,10,1.25';
const REPORT={title:'Script: report',kind:'script',file:'scripts/report.sh',
  goal:`Write <code>scripts/report.sh</code>: given a CSV file of <code>name,quantity,price</code> rows, it prints each name and its total (quantity times price) with <code>printf "%-8s %7.2f\\n"</code>. A first row that is a header (<code>name,qty,price</code>) is skipped. A file it cannot read gives <code>report.sh: cannot read FILE</code> on stderr and exit status 1. Try <code>bash scripts/report.sh village/sales.csv</code>.`,
  anat:[['[ ! -r "$1" ]','cmd'],['>&2','op'],['exit 1','kw'],['awk','cmd'],['-F,','opt'],["'NR > 1 || $2 ~ /^[0-9]/","arg"],['{printf "%-8s %7.2f\\n", $1, $2*$3}\'','arg'],['"$1"','var']],
  answer:REPORT_ANSWER,
  starter:`#!/bin/bash
# Print "NAME  TOTAL" for each row of the CSV file given as $1 (name,quantity,price).
# 1. Cannot read "$1"? Print "report.sh: cannot read $1" on stderr, exit 1.
# 2. awk -F, with printf "%-8s %7.2f\\n", $1, $2*$3
# 3. Skip a first row that is a header: NR is the line number.
`,
  wrong:[REPORT_ANSWER.replace("NR > 1 || $2 ~ /^[0-9]/ ",'NR > 1 '),REPORT_ANSWER.replace("NR > 1 || $2 ~ /^[0-9]/ ",''),
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
  hint:`Guard first: <code>if [ ! -r "$1" ]; then echo "report.sh: cannot read $1" &gt;&amp;2; exit 1; fi</code>. Then one awk line: <code>-F,</code>, the pattern <code>NR &gt; 1 || $2 ~ /^[0-9]/</code> and the action <code>{printf "%-8s %7.2f\\n", $1, $2*$3}</code>. Save it, then run <code>bash scripts/report.sh village/sales.csv</code>.`,
  explain:`<code>[ -r "$1" ]</code> is true when the file is there and you may read it, so <code>!</code> turns it into "cannot read". awk's <code>printf</code> works like the shell's: <code>%-8s</code> puts the name in 8 columns, lined up on the left, and <code>%7.2f</code> prints the number with 2 decimals, lined up on the right in 7 columns. No newline is added: end the format with <code>\\n</code>. <code>NR</code> is the line number, <code>~</code> matches a regular expression and <code>||</code> means or, so the pattern keeps every line after the first, and the first line only when its quantity starts with a digit. A plain <code>NR &gt; 1</code> would also drop apple, the first row of the sales file. Each time you save, the script is tried on the sales file, a one-row file, a file with a header row and a missing file.`};

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
    {label:'one job',args:['1'],expectOut:'1 done',expectClock:1}],
  hint:`Check <code>"$#"</code> first. In the loop, put the two steps in parentheses and the <code>&amp;</code> after them: <code>(sleep "$n"; echo "$n done") &amp;</code>. After <code>done</code>, one <code>wait</code>. Save it, then run <code>bash scripts/fanout.sh 3 1 2</code>.`,
  explain:`The parentheses make <code>sleep</code> and <code>echo</code> one job, so each <code>echo</code> runs only after its own sleep, and <code>&amp;</code> starts that job without waiting for it. All the jobs sleep at the same time: the 1-second one reports first, and the whole run takes as long as the longest job, 3 seconds. <code>wait</code> at the end keeps the script alive until every job is done; without it the script ends at once and the jobs report after it is gone. Run the steps one after the other, without <code>&amp;</code>, and it takes 6 seconds and prints 3, 1, 2. Each time you save, the script is tried with <code>3 1 2</code> (the virtual clock must end at 3), with no arguments and with <code>1</code>.`};

const CH=[
{tier:'expert',name:'awk & sed craft',badge:'Text Wrangler',intro:'awk reads text one line at a time, splits each line into fields and runs a small program on them. sed -i edits a file where it lies. Together they turn raw data into reports.',
 learned:["awk '{print $1}'",'awk -F,','pattern {action}','END {…}','awk arrays','sed -i','printf in awk'],setup:seedExpert,
 missions:[
 {title:'First column',goal:`Print the first field of every line of the access log: <code>awk '{print $1}' village/logs/access.log</code>`,note:HOME_NOTE,
  anat:[['awk','cmd'],["'{print $1}'",'arg'],['village/logs/access.log','arg']],answer:"awk '{print $1}' village/logs/access.log",
  explain:`awk splits each line at its spaces into <b>fields</b>: <code>$1</code> is the first, <code>$2</code> the second, <code>$NF</code> the last and <code>$0</code> the whole line. The program between the braces runs once for every line. Here field 1 is the address that made the request. The single quotes keep bash from reading <code>$1</code> itself: in double quotes it would be bash's first argument, which is empty.`,
  check:c=>{const want=rows(c.read('~/village/logs/access.log')).map(l=>l.split(/\s+/)[0]).join('\n');return !!want&&ranAwk(c)&&said(c)===want}},
 {title:'Pick a separator',goal:`<code>village/sales.csv</code> separates its fields with commas. Print the names in the first column: <code>awk -F, '{print $1}' village/sales.csv</code>`,note:HOME_NOTE,
  anat:[['awk','cmd'],['-F,','opt'],["'{print $1}'",'arg'],['village/sales.csv','arg']],answer:"awk -F, '{print $1}' village/sales.csv",
  explain:`<code>-F,</code> sets the <b>field separator</b> to a comma, so <code>$1</code> is the name, <code>$2</code> the quantity and <code>$3</code> the price. Without it awk splits at spaces, and a line with no spaces is one big field: <code>$1</code> would be the whole line, <code>apple,12,2</code>. <code>-F:</code> splits at colons, <code>-F'\\t'</code> at tabs.`,
  check:c=>{const want=rows(c.read('~/village/sales.csv')).map(l=>l.split(',')[0]).join('\n');return !!want&&ranAwk(c,(e,p)=>e.args.some(a=>a.startsWith('-F')||/^FS=/.test(a))||/\bFS\s*=/.test(p))&&said(c)===want}},
 {title:'Filter rows',goal:`Print the names of the items that sold more than 10: <code>awk -F, '$2 &gt; 10 {print $1}' village/sales.csv</code>`,note:HOME_NOTE,
  anat:[['awk','cmd'],['-F,','opt'],["'$2 > 10",'arg'],["{print $1}'",'arg'],['village/sales.csv','arg']],answer:"awk -F, '$2 > 10 {print $1}' village/sales.csv",
  explain:`An awk rule is <code>pattern {action}</code>: the action runs only on the lines where the pattern is true. <code>$2 &gt; 10</code> compares the quantity as a number, so apple (12) and bread (30) pass and rope (4) does not. Inside the quotes <code>&gt;</code> belongs to awk, not to bash, so no file is made. Leave the action out and awk prints the whole line: <code>awk -F, '$2 &gt; 10' village/sales.csv</code>. A pattern can also be a regular expression: <code>awk '/404/' village/logs/access.log</code>.`,
  check:c=>{const want=rows(c.read('~/village/sales.csv')).map(l=>l.split(',')).filter(r=>+r[1]>10).map(r=>r[0]).join('\n');
    return !!want&&ranAwk(c,(e,p)=>{const pat=p.split('{')[0];return /\$/.test(pat)&&!/^\s*(BEGIN|END)\b/.test(pat)})&&said(c)===want}},
 {title:'Add it up',goal:`Add up quantity times price over every row and print the total once, at the end: <code>awk -F, '{s += $2 * $3} END {print s}' village/sales.csv</code>`,note:HOME_NOTE,
  anat:[['awk','cmd'],['-F,','opt'],["'{s += $2 * $3}",'arg'],['END','kw'],["{print s}'",'arg'],['village/sales.csv','arg']],answer:"awk -F, '{s += $2 * $3} END {print s}' village/sales.csv",
  explain:`The first rule runs on every line and adds that row's quantity times price to <code>s</code>. awk variables need no <code>$</code> and start out empty, which counts as 0. <code>END {…}</code> runs once, after the last line, so the total is printed once: 274. Its partner <code>BEGIN {…}</code> runs once before the first line, for a title or a starting value: <code>awk -F, 'BEGIN {print "sold:"} {s += $2} END {print s}' village/sales.csv</code> prints <code>sold:</code> and then 57.`,
  check:c=>{const want=rows(c.read('~/village/sales.csv')).map(l=>l.split(',')).reduce((n,r)=>n+r[1]*r[2],0);
    return !!want&&ranAwk(c,(e,p)=>/\bEND\b/.test(p)&&/\$2\b/.test(p)&&/\$3\b/.test(p))&&said(c)===String(want)}},
 {title:'Count with an array',goal:`Count how many requests got each status code, the fourth field of the access log: <code>awk '{c[$4]++} END {for (k in c) print k, c[k]}' village/logs/access.log</code>`,note:HOME_NOTE,
  anat:[['awk','cmd'],["'{c[$4]++}",'arg'],['END','kw'],['{for (k in c)','kw'],["print k, c[k]}'",'arg'],['village/logs/access.log','arg']],answer:"awk '{c[$4]++} END {for (k in c) print k, c[k]}' village/logs/access.log",
  explain:`<code>c[$4]</code> is an element of the <b>array</b> <code>c</code>, and its key is the status code. <code>++</code> adds one, and a key awk has not seen yet starts at 0. In <code>END</code>, <code>for (k in c)</code> visits every key once, and <code>print k, c[k]</code> puts a space between the key and its count. awk does not promise any order for the keys, so add <code>| sort</code> when the order matters. <code>sort | uniq -c</code> counts too, but an array can also add up: <code>awk -F, '{t[$1] += $2} END {for (k in t) print k, t[k]}' village/sales.csv</code>.`,
  check:c=>{const want={};for(const l of rows(c.read('~/village/logs/access.log'))){const k=l.split(/\s+/)[3];if(k!=null)want[k]=(want[k]||0)+1}
    const keys=Object.keys(want);if(!keys.length)return false;
    const got=said(c).split('\n').sort().join('\n'),exp=keys.map(k=>k+' '+want[k]).sort().join('\n');
    return got===exp&&ranAwk(c,(e,p)=>/\w\s*\[[^\]]+\]/.test(p)&&/\bEND\b/.test(p))}},
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
  check:c=>myJobs(c).some(j=>j.state==='Running')&&c.ran('jobs',e=>e.code===0&&/Running\s+sleep \d+ &/.test(e.out))},
 {title:'Wait for it',goal:`Start a 5-second job and wait until it has finished, both on one line: <code>sleep 5 &amp; wait</code>`,
  anat:[['sleep','cmd'],['5','arg'],['&','op'],['wait','cmd']],answer:'sleep 5 & wait',
  explain:`<code>wait</code> holds the prompt until every background job has ended, and then bash reports each one <code>Done</code>. Here the virtual clock jumps ahead by the 5 seconds instead of making you sit there. <code>wait %1</code> or <code>wait PID</code> waits for one job only. Scripts start several jobs, then <code>wait</code> for all of them before they go on.`,
  check:c=>c.ran('wait',e=>e.code===0)&&c.elapsed()>=5&&!myJobs(c).some(j=>j.state==='Running')&&myJobs(c).some(j=>j.reaped&&j.state==='Done')},
 {title:'Kill it',goal:`Start a long job, then stop it before it ends: <code>sleep 100 &amp; kill %1</code>`,
  note:`Other jobs still running? The new one may not be number 1: kill it with <code>kill %N</code> (its number) or <code>kill $!</code>.`,
  anat:[['sleep','cmd'],['100','arg'],['&','op'],['kill','cmd'],['%1','arg']],answer:'sleep 100 & kill %1',
  explain:`<code>kill</code> sends a <b>signal</b> to a process. The default one, TERM, asks it to stop, and bash reports the job <code>Terminated</code>. <code>%1</code> names job 1; a PID works too, such as <code>kill $!</code> for the job you started last. <code>kill -9</code> sends KILL, which a process cannot refuse, and the job is reported <code>Killed</code>.`,
  check:c=>myJobs(c).some(j=>j.reaped&&j.state==='Terminated'&&c.ran('kill',e=>e.code===0&&e.args.some(a=>a==='%'+j.id||a===String(j.pid))))},
 {title:"The last job's PID",goal:`<code>$!</code> holds the PID of the last background job. Keep it, wait for that job, then report: <code>sleep 2 &amp; pid=$!; wait $pid; echo "finished $pid"</code>`,
  anat:[['sleep 2','cmd'],['&','op'],['pid=$!','var'],[';','op'],['wait','cmd'],['$pid','var'],[';','op'],['echo "finished $pid"','cmd']],answer:'sleep 2 & pid=$!; wait $pid; echo "finished $pid"',
  explain:`Right after a job starts, <code>$!</code> is its PID, the number bash printed in <code>[1] 1235</code>. Save it in a variable before you start another job, which would change it. <code>wait $pid</code> waits for that one process and returns its exit status, so <code>sleep 2 &amp; pid=$!; wait $pid; echo $?</code> prints 0. <code>kill $pid</code> would stop it instead.`,
  check:c=>{const b=SQ.rt.bang;return b!=null&&said(c)==='finished '+b&&/\$\{?!/.test(c.line)&&c.ran('wait',e=>e.code===0)&&!myJobs(c).some(j=>String(j.pid)===String(b)&&j.state==='Running')}},
 FANOUT
 ]}
];
SQ.content.chapters.push(...CH);
})(window.SQ = window.SQ || {});
