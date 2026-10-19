(function (SQ) {
SQ.content=SQ.content||{chapters:[],guide:[],quickfire:[]};
const {HOME,JOURNAL,LOGS,ensureDir,ensureFile,norm,getNode,lstat,modeOf,isNull,join}=SQ;
const SHOP='apple 2\nbread 3\nrope 12\ntorch 8\nmap 20';
const SALES=['apple,12,2','bread,30,3','rope,4,12','torch,9,8','map,2,20'].join('\n');
const ACCESS=[
'10.0.0.5 GET /index.html 200','10.0.0.7 GET /shop 200','10.0.0.5 GET /missing 404','10.0.0.9 POST /order 500',
'10.0.0.7 GET /index.html 200','10.0.0.5 GET /shop 200','10.0.0.12 GET /old 404','10.0.0.9 GET /index.html 200',
'10.0.0.7 POST /order 200','10.0.0.5 GET /map 404','10.0.0.12 GET /shop 200','10.0.0.9 POST /order 500'].join('\n');
const CONFIG='[village]\nname=Oakford\nport=8080\ndebug=false\n\n[shop]\nopen=09:00\nclose=18:00';
const NOTES='Buy Bread and rope\nCheck the Wolf tracks\nfeed the OWL\nWrite to Mira\nlight the torch';
const seedVillage=()=>{ensureFile('~/village/shop.txt',SHOP);ensureFile('~/journal.txt',JOURNAL);
  ensureFile('~/village/sales.csv',SALES);ensureFile('~/village/logs/access.log',ACCESS);
  ensureFile('~/config.ini',CONFIG);ensureFile('~/notes.txt',NOTES)};

const SECRETS='The vault code is 4242.';
const ALLLOG=[
'10.0.0.5 INFO gate opened','10.0.0.7 ERROR disk full','10.0.0.5 ERROR bad login','10.0.0.9 WARN slow reply',
'10.0.0.7 ERROR timeout','10.0.0.12 INFO baker lit the oven','10.0.0.5 ERROR timeout','10.0.0.9 ERROR bad login',
'10.0.0.7 INFO wolf seen','10.0.0.5 ERROR disk full','10.0.0.12 WARN gate stuck','10.0.0.7 ERROR bad login',
'10.0.0.12 ERROR gate jammed'].join('\n');
const seedLogs=()=>{for(const k of Object.keys(LOGS))ensureFile('~/village/logs/'+k,LOGS[k]);ensureFile('~/village/logs/all.log',ALLLOG)};
const seedPerms=()=>{ensureFile('~/notes.txt',NOTES);ensureFile('~/secrets.txt',SECRETS);ensureDir('~/scripts');seedLogs()};
const seedStreams=()=>{seedPerms();ensureFile('~/village/scratch/old1.log','old line 1');ensureFile('~/village/scratch/old2.log','old line 2');
  ensureFile('~/village/scratch/keep.txt','Keep me.')};
const FP=/^file: \S/;
const baseName=s=>s.split('/').filter(Boolean).pop()||'';
const homeNode=p=>getNode(norm(p,HOME));
function allLinks(n,path,out){if(!n||n.type!=='dir')return out;for(const k of Object.keys(n.children)){const c=n.children[k],p=join(path,k);
  if(c.type==='link')out.push(p);else if(c.type==='dir')allLinks(c,p,out)}return out}
function logsIn(abs,end){const d=getNode(abs);return d&&d.type==='dir'?Object.keys(d.children).filter(k=>d.children[k].type==='file'&&k.endsWith(end)):[]}
function wantCounts(text){const m={};for(const l of text.split('\n'))if(l.includes('ERROR')){const k=l.split(' ')[0];m[k]=(m[k]||0)+1}return m}
function reportCounts(text){const m={};let n=0;for(const l of text.split('\n')){if(!l.trim())continue;const r=/^\s*(\d+)\s+(\S+)\s*$/.exec(l);if(!r)return null;m[r[2]]=(m[r[2]]||0)+ +r[1];n++}return {m,n}}
const argLine=e=>e.args.join(' ');
const CH=[
{tier:'intermediate',name:'Text tools',badge:'Textsmith',intro:'Files are mostly text, and a few small tools can cut, swap and reshape it. Learn them and you can pull out or reshape exactly the bit you need.',
 learned:['cut','tr','sed s///','sed -n','tee','sort -t -k'],setup:seedVillage,
 missions:[
 {title:'Pick a column',goal:`The file <code>village/sales.csv</code> has columns split by commas. Print only the first column: <code>cut -d, -f1 village/sales.csv</code>`,
  anat:[['cut','cmd'],['-d,','opt'],['-f1','opt'],['village/sales.csv','arg']],answer:'cut -d, -f1 village/sales.csv',
  explain:`cut slices each line into <b>fields</b>. <code>-d,</code> says the fields are separated by commas, and <code>-f1</code> keeps field number 1. Try <code>-f2</code> for the quantities.`,
  check:c=>{const col=c.read('~/village/sales.csv').split('\n').filter(Boolean).map(l=>l.split(',')[0]).join('\n');
    return !!col&&c.ran('cut',e=>/(^|\s)-d/.test(argLine(e))&&/(^|\s)-f\s*1(\s|$)/.test(argLine(e))&&e.out.trim()===col)}},
 {title:'Shout it',goal:`Turn lowercase into uppercase: <code>echo hello | tr a-z A-Z</code>`,
  anat:[['echo','cmd'],['hello','arg'],['|','op'],['tr','cmd'],['a-z','arg'],['A-Z','arg']],answer:'echo hello | tr a-z A-Z',
  explain:`tr <b>translates</b> characters: every character in the first set becomes the matching one in the second. It reads text from a pipe, never from a file name.`,
  check:c=>c.ran('tr',e=>e.out.trim()==='HELLO')},
 {title:'Swap a word',goal:`Print the shop list with apple swapped for pear: <code>sed 's/apple/pear/' village/shop.txt</code>`,
  anat:[['sed','cmd'],[`'s/apple/pear/'`,'arg'],['village/shop.txt','arg']],answer:`sed 's/apple/pear/' village/shop.txt`,
  explain:`sed is a <b>stream editor</b>. The script <code>s/old/new/</code> means <b>substitute</b>: find old, put new. The file itself does not change, sed only prints the edited text.`,
  check:c=>c.ran('sed',e=>/pear/.test(e.out)&&!/apple/.test(e.out))},
 {title:'Replace everywhere',goal:`Change every <code>o</code> in the journal to a zero: <code>sed 's/o/0/g' journal.txt</code>`,
  anat:[['sed','cmd'],[`'s/o/0/g'`,'arg'],['journal.txt','arg']],answer:`sed 's/o/0/g' journal.txt`,
  explain:`Without <code>g</code>, <code>s</code> only replaces the <b>first</b> match on each line. The <code>g</code> at the end means <b>global</b>: replace every match on the line.`,
  check:c=>c.ran('sed',e=>e.args.some(x=>/^s(.).*\1.*\1[a-zA-Z0-9]*g[a-zA-Z0-9]*$/.test(x)))},
 {title:'Show some lines',goal:`Print only lines 2 to 4 of the journal: <code>sed -n '2,4p' journal.txt</code>`,
  anat:[['sed','cmd'],['-n','opt'],[`'2,4p'`,'arg'],['journal.txt','arg']],answer:`sed -n '2,4p' journal.txt`,
  explain:`<code>-n</code> turns off sed's automatic printing, and <code>p</code> prints the lines you pick. <code>2,4</code> is a line range. Together: show only those lines.`,
  check:c=>c.ran('sed',e=>e.out.split('\n').length===3&&e.out.trim().length>0)},
 {title:'Save and show',goal:`See the list <b>and</b> keep a copy: <code>ls | tee listing.txt</code>`,note:`Not at home? Run <code>cd ~</code> first.`,
  anat:[['ls','cmd'],['|','op'],['tee','cmd'],['listing.txt','arg']],answer:'ls | tee listing.txt',
  explain:`tee is a T-junction for pipes: the text goes to the screen <b>and</b> into the file. Plain <code>&gt;</code> saves it but shows nothing. <code>tee -a</code> adds to the end instead of replacing.`,
  check:c=>c.log.some((e,k)=>{if(e.name!=='tee'||k===0)return false;const p=c.log[k-1],want=p.out.trim();
    if(p.name!=='ls'||!want||e.out.trim()!==want)return false;
    return e.args.filter(x=>!x.startsWith('-')).some(f=>{const n=SQ.getNode(SQ.norm(f));return !!n&&n.type==='file'&&n.content.trim()===want})})},
 {title:'Biggest first',goal:`Which item sold the most? Sort the sales by the quantity column, biggest first, and keep one line: <code>sort -t, -k2 -n -r village/sales.csv | head -n 1</code>`,
  anat:[['sort','cmd'],['-t,','opt'],['-k2','opt'],['-n','opt'],['-r','opt'],['village/sales.csv','arg'],['|','op'],['head -n 1','cmd']],answer:'sort -t, -k2 -n -r village/sales.csv | head -n 1',
  explain:`<code>-t,</code> sets the separator, <code>-k2</code> sorts by field 2, <code>-n</code> compares as numbers so 30 beats 4, and <code>-r</code> reverses the order. Then head keeps only the top row.`,
  check:c=>{const rows=c.read('~/village/sales.csv').split('\n').filter(Boolean).map(l=>l.split(','));
    if(!rows.length)return false;const top=rows.reduce((a,b)=>+b[1]>+a[1]?b:a);
    if(!c.log.some(e=>e.name==='sort'&&c.flag(e,'n')))return false;const cut=c.ran('cut');
    return c.log.some(e=>{const t=e.out.trim();return (e.name==='head'||e.name==='tail'||e.name==='sort')&&(t===top.join(',')||(e.name==='sort'&&t.split('\n')[0]===top.join(','))||(cut&&t===top[1]))})}}
 ]},
{tier:'intermediate',name:'Substitution & quoting',badge:'Quoter',intro:'Bash can paste the output of one command into another, and quotes decide what it is allowed to touch. Then you will hand values on to scripts.',
 learned:['$(command)','"double" vs \'single\'','export','env','$?'],setup:seedVillage,
 missions:[
 {title:'Capture output',goal:`Put a command's output inside a sentence: <code>echo "Today is $(date)"</code>`,
  anat:[['echo','cmd'],['"Today is $(date)"','arg']],answer:'echo "Today is $(date)"',
  explain:`<code>$(command)</code> is <b>command substitution</b>. Bash runs what is inside, then swaps in its output before echo runs.`,
  check:c=>c.ran('echo',e=>/^Today is\s+\S/.test(e.out))&&c.line.includes('$(')},
 {title:'Count in a sentence',goal:`How many lines mention a wolf? <code>echo "wolves: $(grep -ic wolf journal.txt)"</code>`,
  anat:[['echo','cmd'],['"wolves: $(grep -ic wolf journal.txt)"','arg']],answer:'echo "wolves: $(grep -ic wolf journal.txt)"',
  explain:`Any command can go inside <code>$( )</code>. Here <code>grep -ic</code> counts matching lines, ignoring case, and the number lands in the sentence.`,
  check:c=>c.ran('echo',e=>/^wolves: \d+$/.test(e.out.trim()))&&c.line.includes('$(')},
 {title:'Single vs double',goal:`Stop bash from reading the dollar sign: <code>echo '$HOME'</code>`,
  anat:[['echo','cmd'],[`'$HOME'`,'arg']],answer:`echo '$HOME'`,
  explain:`<b>Double quotes</b> still let <code>$</code> work. <b>Single quotes</b> keep everything exactly as typed. Compare <code>echo "$HOME"</code> with <code>echo '$HOME'</code>.`,
  check:c=>c.ran('echo',e=>e.out.trim()==='$HOME')},
 {title:'Keep a value',goal:`Store output in a variable, then print it: <code>FILES=$(ls village); echo $FILES</code>`,
  anat:[['FILES','var'],['=','op'],['$(ls village)','arg'],[';','op'],['echo','cmd'],['$FILES','arg']],answer:'FILES=$(ls village); echo $FILES',
  explain:`The semicolon runs one command after the other. The variable holds the output of <code>ls village</code>, so echo can print it any time later.`,
  check:c=>{const v=c.node('~/village'),names=v&&v.type==='dir'?Object.keys(v.children):[],V=SQ.S.vars;if(!names.length)return false;
    return c.ran('echo',e=>names.every(n=>e.out.includes(n)))&&Object.keys(V).some(k=>new RegExp('\\$\\{?'+k+'\\b').test(c.line)&&names.every(n=>V[k].includes(n))&&(/\$\(|`/.test(c.line)||V[k].includes('\n')))}},
 {title:'Export it',goal:`Mark a variable for sharing: <code>export GREETING=hi</code>`,
  anat:[['export','cmd'],['GREETING','var'],['=','op'],['hi','arg']],answer:'export GREETING=hi',
  explain:`A plain variable is private to your shell. <code>export</code> marks it for <b>sharing</b>, so programs and scripts you start can read it too.`,
  check:c=>!!(SQ.S.exp&&SQ.S.exp.GREETING)},
 {title:'See the environment',goal:`After exporting GREETING in the last mission, list the shared variables: <code>env</code>`,note:`Jumped straight here? Run <code>export GREETING=hi</code> first.`,
  anat:[['env','cmd']],answer:'env',
  explain:`env prints the <b>environment</b>: every exported variable, one NAME=value per line, in alphabetical order. Find GREETING near the top of the list, among built-in ones like HOME and USER.`,
  check:c=>c.ran('env',e=>/^GREETING=\S/m.test(e.out))},
 {title:'Share with a script',goal:`Write a script that uses it, then run it: <code>echo 'echo $GREETING' &gt; g.sh; chmod +x g.sh; ./g.sh</code>`,note:`Not at home? Run <code>cd ~</code> first.`,
  anat:[['echo','cmd'],[`'echo $GREETING'`,'arg'],['>','op'],['g.sh','arg'],[';','op'],['chmod +x g.sh','cmd'],[';','op'],['./g.sh','cmd']],answer:`echo 'echo $GREETING' > g.sh; chmod +x g.sh; ./g.sh`,
  explain:`Single quotes put the text <code>$GREETING</code> into the file untouched. When the script runs it reads the <b>exported</b> variable. Remove the export and the script would print an empty line.`,
  check:c=>{const v=SQ.S.vars.GREETING;if(!v||!(SQ.S.exp&&SQ.S.exp.GREETING))return false;
    return c.log.some(e=>{const f=e.name.includes('/')?e.name:(e.name==='bash'||e.name==='sh')?e.args[0]:null;if(!f)return false;
      const n=SQ.getNode(SQ.norm(f));return !!n&&n.type==='file'&&/\$\{?GREETING\b/.test(n.content)&&e.code===0&&e.out.trim()===v})}},
 {title:'Did it work?',goal:`Every command leaves an exit code. Make one fail, then read it: <code>ls nothing; echo $?</code>`,
  anat:[['ls','cmd'],['nothing','arg'],[';','op'],['echo','cmd'],['$?','var']],answer:'ls nothing; echo $?',
  explain:`<code>$?</code> holds the exit code of the last command. <code>0</code> means success and anything else means failure. Scripts use it to decide what to do next.`,
  check:c=>/\$\?/.test(c.line)&&c.log.some((e,k)=>{if(e.name!=='echo')return false;const code=k>0?c.log[k-1].code:SQ.rt.prevLast;return !!code&&e.out.trim()===String(code)})}
 ]},
{tier:'intermediate',name:'Permissions & links',badge:'Gatekeeper',intro:'Every file says who may read it, change it or run it. Learn to read those marks, change them, and make shortcuts to files.',
 learned:['ls -l','chmod 600','chmod u+x','chmod a=r','ln -s','stat'],setup:seedPerms,
 missions:[
 {title:'Read the permissions',goal:`Show the details of each file, including its permissions: <code>ls -l</code>`,note:`Not at home? Run <code>cd ~</code> first.`,
  anat:[['ls','cmd'],['-l','opt']],answer:'ls -l',
  explain:`The first column is the <b>mode</b>. After the type (<code>-</code> file, <code>d</code> folder, <code>l</code> link) come three groups of <code>rwx</code>: what the <b>owner</b>, the <b>group</b> and <b>everyone else</b> may do. <code>r</code> read, <code>w</code> write, <code>x</code> run, and <code>-</code> means not allowed.`,
  check:c=>c.ran('ls',e=>c.flag(e,'l')&&e.code===0)},
 {title:'Lock it down',goal:`Make <code>secrets.txt</code> private, so only you can read and write it: <code>chmod 600 secrets.txt</code>`,note:`Not at home? Run <code>cd ~</code> first.`,
  anat:[['chmod','cmd'],['600','arg'],['secrets.txt','arg']],answer:'chmod 600 secrets.txt',
  explain:`A number mode has one digit for the owner, the group and everyone else. Read is 4, write is 2, run is 1, and you add them up. So <code>6</code> is read plus write and <code>0</code> is nothing. Check it with <code>ls -l secrets.txt</code>: you will see <code>-rw-------</code>.`,
  check:c=>{const n=homeNode('~/secrets.txt');return !!n&&n.type==='file'&&modeOf(n)===0o600}},
 {title:'Add a permission',goal:`Let yourself run <code>notes.txt</code>, without touching any other permission: <code>chmod u+x notes.txt</code>`,note:`Not at home? Run <code>cd ~</code> first.`,
  anat:[['chmod','cmd'],['u+x','opt'],['notes.txt','arg']],answer:'chmod u+x notes.txt',
  explain:`The letter form says <b>who</b> (<code>u</code> owner, <code>g</code> group, <code>o</code> others, <code>a</code> all), then <code>+</code> to add or <code>-</code> to remove, then what (<code>r</code>, <code>w</code>, <code>x</code>). Everything you do not mention stays as it was.`,
  check:c=>{const n=homeNode('~/notes.txt');return !!n&&n.type==='file'&&(modeOf(n)&0o100)!==0}},
 {title:'Read-only for all',goal:`Make <code>notes.txt</code> read-only for everyone: <code>chmod a=r notes.txt</code>`,note:`Not at home? Run <code>cd ~</code> first.`,
  anat:[['chmod','cmd'],['a=r','opt'],['notes.txt','arg']],answer:'chmod a=r notes.txt',
  explain:`With <code>=</code> you <b>set</b> exactly what is allowed, instead of adding or removing. <code>a=r</code> gives everybody read and nothing else, so the run permission you added a moment ago is gone. The number for it is <code>444</code>.`,
  check:c=>{const n=homeNode('~/notes.txt');return !!n&&n.type==='file'&&modeOf(n)===0o444}},
 {title:'Make a shortcut',goal:`Make <code>today.log</code> point at the first day's log: <code>ln -s village/logs/day1.log today.log</code>`,note:`Not at home? Run <code>cd ~</code> first.`,
  anat:[['ln','cmd'],['-s','opt'],['village/logs/day1.log','arg'],['today.log','arg']],answer:'ln -s village/logs/day1.log today.log',
  explain:`<code>ln -s TARGET NAME</code> makes a <b>symbolic link</b>: a small file that just says where the real one is. The target comes first, the new name second. In <code>ls -l</code> a link shows as <code>today.log -&gt; village/logs/day1.log</code>.`,
  check:c=>{const d1=homeNode('~/village/logs/day1.log');if(!d1||d1.type!=='file')return false;
    return allLinks(SQ.S.fs,'',[]).some(p=>{const l=lstat(p);return l&&l.type==='link'&&getNode(p)===d1})}},
 {title:'Follow the shortcut',goal:`Read the log through the shortcut: <code>cat today.log</code>`,note:`Needs the link from the last mission. Not there? Run <code>ln -s village/logs/day1.log today.log</code> first, from your home folder.`,
  anat:[['cat','cmd'],['today.log','arg']],answer:'cat today.log',
  explain:`Programs follow a link as if you had named the real file, so <code>cat</code> prints what is in <code>day1.log</code>. If you move or delete the target, the link is left pointing at nothing.`,
  check:c=>{const d1=homeNode('~/village/logs/day1.log');if(!d1||d1.type!=='file')return false;
    return c.ran('cat',e=>e.code===0&&e.out===d1.content&&e.args.some(a=>{const l=lstat(norm(a));return !!l&&l.type==='link'}))}},
 {title:'Inspect a file',goal:`Show the facts about a file in one go: <code>stat secrets.txt</code>`,note:`Not at home? Run <code>cd ~</code> first.`,
  anat:[['stat','cmd'],['secrets.txt','arg']],answer:'stat secrets.txt',
  explain:`<code>stat</code> prints the size, the kind of file and the mode in both forms, number and letters, such as <code>0600/-rw-------</code>.`,
  check:c=>c.ran('stat',e=>e.code===0&&/Mode:/.test(e.out))}
 ]},
{tier:'intermediate',name:'Streams & xargs',badge:'Streamer',intro:'A command has an output stream and an error stream, and you can send each one somewhere different. Then you will turn lists into arguments and finish with a small cleanup job.',
 learned:['2>','2>/dev/null','2>&1','xargs','diff','sort | uniq -c'],setup:seedStreams,
 missions:[
 {title:'Silence errors',goal:`Run a command that fails and hide its error message: <code>ls missing 2&gt;/dev/null</code>`,
  anat:[['ls','cmd'],['missing','arg'],['2&gt;','op'],['/dev/null','arg']],answer:'ls missing 2>/dev/null',
  explain:`Stream number 2 is the <b>error</b> stream (1 is the normal output). <code>2&gt;</code> sends it somewhere, and <code>/dev/null</code> is the bin that throws everything away. The command still fails, you just do not see the complaint.`,
  check:c=>c.log.some(e=>e.code!==0&&e.errRedirect&&!e.errRedirect.dup&&e.errRedirect.path&&isNull(e.errRedirect.path))},
 {title:'Keep errors',goal:`Save the error message in a file instead: <code>ls missing 2&gt; errors.txt</code>`,note:`Not at home? Run <code>cd ~</code> first.`,
  anat:[['ls','cmd'],['missing','arg'],['2&gt;','op'],['errors.txt','arg']],answer:'ls missing 2> errors.txt',
  explain:`The same <code>2&gt;</code> can point at a real file. Read it back with <code>cat errors.txt</code>. Use <code>2&gt;&gt;</code> to add to the end instead of starting over.`,
  check:c=>c.log.some(e=>{const r=e.errRedirect;if(e.code===0||!r||r.dup||!r.path||isNull(r.path))return false;const n=getNode(norm(r.path));return !!n&&n.type==='file'&&n.content.trim().length>0})},
 {title:'Merge streams',goal:`Send the error down the pipe and count it: <code>ls missing 2&gt;&amp;1 | wc -l</code>`,
  anat:[['ls','cmd'],['missing','arg'],['2&gt;&amp;1','op'],['|','op'],['wc -l','cmd']],answer:'ls missing 2>&1 | wc -l',
  explain:`A pipe only carries normal output. <code>2&gt;&amp;1</code> means <b>send errors to wherever the output goes</b>, so the error message travels down the pipe too. Without it <code>wc</code> would count 0 lines.`,
  check:c=>c.log.some(e=>e.code!==0&&e.errRedirect&&e.errRedirect.dup&&e.piped)&&c.ran('wc',e=>e.out.trim()==='1')||c.log.some(e=>e.code!==0&&e.errRedirect&&e.errRedirect.dup&&e.piped)&&c.log.some(e=>e.piped&&e.name!=='ls'&&e.out.trim()==='1')},
 {title:'Pipe into arguments',goal:`Run a command once for each name in a list: <code>ls village/logs | xargs -n1 echo file:</code>`,note:`The logs are put back whenever you click the chapter again.`,
  anat:[['ls','cmd'],['village/logs','arg'],['|','op'],['xargs','cmd'],['-n1','opt'],['echo file:','cmd']],answer:'ls village/logs | xargs -n1 echo file:',
  explain:`Some commands read arguments, not piped text. <code>xargs</code> turns the lines it receives into arguments for the command you give it. <code>-n1</code> means one name per run, so you get one <code>file:</code> line for each name.`,
  check:c=>{const want=logsIn(norm('~/village/logs'),'.log');if(!want.length)return false;
    return c.log.some(e=>{if(e.name!=='xargs'||e.code!==0)return false;const L=e.out.split('\n').filter(Boolean);
      return L.length>=want.length&&L.every(l=>FP.test(l))&&want.every(w=>L.some(l=>baseName(l.slice(6).trim())===w))})}},
 {title:'Delete what you found',goal:`Remove every <code>.log</code> file in the scratch folder: <code>find village/scratch -name "*.log" | xargs rm</code>`,note:`Only the scratch folder, not <code>village/logs</code>. Run the <code>find</code> part alone first to see what it lists.`,
  anat:[['find','cmd'],['village/scratch','arg'],['-name','opt'],['"*.log"','arg'],['|','op'],['xargs rm','cmd']],answer:'find village/scratch -name "*.log" | xargs rm',
  explain:`<code>find</code> lists the matching paths, and <code>xargs rm</code> hands them all to <code>rm</code>. It is the same as typing <code>rm</code> followed by every name. Always look at the find output alone before you let rm loose on it.`,
  check:c=>{const d=getNode(norm('~/village/scratch'));if(!d||d.type!=='dir')return false;
    return c.log.some(e=>e.name==='xargs'&&e.args.includes('rm'))&&logsIn(norm('~/village/scratch'),'.log').length===0&&!!d.children['keep.txt']}},
 {title:'Compare two files',goal:`See what changed between two days: <code>diff village/logs/day1.log village/logs/day2.log</code>`,note:`Needs both logs. If they are gone, click the chapter again.`,
  anat:[['diff','cmd'],['village/logs/day1.log','arg'],['village/logs/day2.log','arg']],answer:'diff village/logs/day1.log village/logs/day2.log',
  explain:`<code>diff</code> prints only the lines that differ. <code>&lt;</code> marks lines from the first file and <code>&gt;</code> from the second, and <code>2c2</code> means line 2 changed. No output at all means the files are identical.`,
  check:c=>c.ran('diff',e=>e.code<2&&e.args.filter(a=>!a.startsWith('-')).length===2)},
 {title:'Capstone: log janitor',goal:`Count the ERROR lines per address in <code>village/logs/all.log</code> and save the report in <code>report.txt</code>: <code>grep ERROR village/logs/all.log 2&gt;/dev/null | cut -d' ' -f1 | sort | uniq -c &gt; report.txt</code>`,note:`Run it from your home folder. The logs are put back whenever you click the chapter again.`,
  anat:[['grep','cmd'],['ERROR','arg'],['village/logs/all.log','arg'],['2&gt;/dev/null','op'],['|','op'],["cut -d' ' -f1",'cmd'],['|','op'],['sort','cmd'],['|','op'],['uniq -c','cmd'],['&gt;','op'],['report.txt','arg']],
  answer:`grep ERROR village/logs/all.log 2>/dev/null | cut -d' ' -f1 | sort | uniq -c > report.txt`,
  explain:`Each stage does one small job: <code>grep</code> keeps the ERROR lines, <code>cut</code> keeps the address, <code>sort</code> puts equal addresses side by side, <code>uniq -c</code> counts each group, and <code>&gt;</code> saves the report. Read it with <code>cat report.txt</code>.`,
  check:c=>{const log=homeNode('~/village/logs/all.log');if(!log||log.type!=='file')return false;const want=wantCounts(log.content),keys=Object.keys(want);if(!keys.length)return false;
    return [norm('~/report.txt'),norm('report.txt')].some(p=>{const r=getNode(p);if(!r||r.type!=='file')return false;const got=reportCounts(r.content);
      return !!got&&got.n===keys.length&&keys.every(k=>got.m[k]===want[k])})}}
 ]}
];
SQ.content.chapters.push(...CH);
})(window.SQ = window.SQ || {});
