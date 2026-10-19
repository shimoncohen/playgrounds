(function (SQ) {
SQ.content=SQ.content||{chapters:[],guide:[],quickfire:[]};
const {HOME,JOURNAL,ensureDir,ensureFile}=SQ;
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
const argLine=e=>e.args.join(' ');
const CH=[
{tier:'intermediate',name:'Text tools',badge:'Textsmith',intro:'Files are mostly text, and a few small tools can cut, swap and reshape it. Learn them and you can answer almost any question about a file.',
 learned:['cut','tr','sed s///','sed -n','tee','sort -n -r'],setup:seedVillage,
 missions:[
 {title:'Pick a column',goal:`The file <code>village/sales.csv</code> has columns split by commas. Print only the first column: <code>cut -d, -f1 village/sales.csv</code>`,
  anat:[['cut','cmd'],['-d,','opt'],['-f1','opt'],['village/sales.csv','arg']],answer:'cut -d, -f1 village/sales.csv',
  explain:`cut slices each line into <b>fields</b>. <code>-d,</code> says the fields are separated by commas, and <code>-f1</code> keeps field number 1. Try <code>-f2</code> for the quantities.`,
  check:c=>c.ran('cut',e=>/(^|\s)-f\s*1(\s|$)/.test(argLine(e))&&/\S/.test(e.out))},
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
  explain:`Without help, <code>s</code> only replaces the <b>first</b> match on each line. The <code>g</code> at the end means <b>global</b>: replace every match on the line.`,
  check:c=>c.ran('sed',e=>e.args.some(x=>/^s(.).*\1.*\1[a-zA-Z0-9]*g[a-zA-Z0-9]*$/.test(x)))},
 {title:'Show some lines',goal:`Print only lines 2 to 4 of the journal: <code>sed -n '2,4p' journal.txt</code>`,
  anat:[['sed','cmd'],['-n','opt'],[`'2,4p'`,'arg'],['journal.txt','arg']],answer:`sed -n '2,4p' journal.txt`,
  explain:`<code>-n</code> turns off sed's automatic printing, and <code>p</code> prints the lines you pick. <code>2,4</code> is a line range. Together: show only those lines.`,
  check:c=>c.ran('sed',e=>e.out.split('\n').length===3&&e.out.trim().length>0)},
 {title:'Save and show',goal:`See the list <b>and</b> keep a copy: <code>ls | tee listing.txt</code>`,note:`Not at home? Run <code>cd ~</code> first.`,
  anat:[['ls','cmd'],['|','op'],['tee','cmd'],['listing.txt','arg']],answer:'ls | tee listing.txt',
  explain:`tee is a T-junction for pipes: the text goes to the screen <b>and</b> into the file. Plain <code>&gt;</code> saves it but shows nothing. <code>tee -a</code> adds to the end instead of replacing.`,
  check:c=>c.ran('tee')&&c.read('~/listing.txt').trim().length>0},
 {title:'Biggest first',goal:`Which item sold the most? Cut out the quantity column, sort it biggest first, and keep one line: <code>cut -d, -f2 village/sales.csv | sort -n -r | head -n 1</code>`,
  anat:[['cut','cmd'],['-d,','opt'],['-f2','opt'],['village/sales.csv','arg'],['|','op'],['sort','cmd'],['-n','opt'],['-r','opt'],['|','op'],['head -n 1','cmd']],answer:'cut -d, -f2 village/sales.csv | sort -n -r | head -n 1',
  explain:`Three small tools in a row. cut keeps field 2, the quantities. <code>sort -n</code> compares them as <b>numbers</b>, so 30 beats 4, and <code>-r</code> reverses the order. head keeps only the top line.`,
  check:c=>{const rows=c.read('~/village/sales.csv').split('\n').filter(Boolean).map(l=>l.split(','));
    if(!rows.length)return false;const top=rows.reduce((a,b)=>+b[1]>+a[1]?b:a);
    return c.log.some(e=>(e.name==='head'||e.name==='sort')&&[top[1],top.join(',')].includes(e.out.trim()))}}
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
  check:c=>c.ran('echo',e=>/shop\.txt/.test(e.out)&&/people\.txt/.test(e.out))},
 {title:'Export it',goal:`Mark a variable for sharing: <code>export GREETING=hi</code>`,
  anat:[['export','cmd'],['GREETING','var'],['=','op'],['hi','arg']],answer:'export GREETING=hi',
  explain:`A plain variable is private to your shell. <code>export</code> marks it for <b>sharing</b>, so programs and scripts you start can read it too.`,
  check:c=>!!(SQ.S.exp&&SQ.S.exp.GREETING)},
 {title:'See the environment',goal:`List the shared variables: <code>env</code>`,
  anat:[['env','cmd']],answer:'env',
  explain:`env prints the <b>environment</b>: every exported variable, one NAME=value per line. Find GREETING in the list, next to HOME and USER.`,
  check:c=>c.ran('env',e=>/^GREETING=\S/m.test(e.out))},
 {title:'Share with a script',goal:`Write a script that uses it, then run it: <code>echo 'echo $GREETING' &gt; g.sh; chmod +x g.sh; ./g.sh</code>`,note:`Not at home? Run <code>cd ~</code> first.`,
  anat:[['echo','cmd'],[`'echo $GREETING'`,'arg'],['>','op'],['g.sh','arg'],[';','op'],['chmod +x g.sh','cmd'],[';','op'],['./g.sh','cmd']],answer:`echo 'echo $GREETING' > g.sh; chmod +x g.sh; ./g.sh`,
  explain:`Single quotes put the text <code>$GREETING</code> into the file untouched. When the script runs it reads the <b>exported</b> variable. Remove the export and the script would print an empty line.`,
  check:c=>{const v=SQ.S.vars.GREETING;return !!v&&c.log.some(e=>e.name.endsWith('g.sh')&&e.code===0&&e.out.trim()===v)}},
 {title:'Did it work?',goal:`Every command leaves an exit code. Make one fail, then read it: <code>ls nothing; echo $?</code>`,
  anat:[['ls','cmd'],['nothing','arg'],[';','op'],['echo','cmd'],['$?','var']],answer:'ls nothing; echo $?',
  explain:`<code>$?</code> holds the exit code of the last command. <code>0</code> means success and anything else means failure. Scripts use it to decide what to do next.`,
  check:c=>c.ran('echo',e=>/(^|\n)2$/.test(e.out.trim()))&&/\$\?/.test(c.line)}
 ]}
];
SQ.content.chapters.push(...CH);
})(window.SQ = window.SQ || {});
