
(()=>{
const HOME='/home/explorer', KEY='shell-quest-v1';
const D=(c={})=>({type:'dir',children:c});
const F=(s='',x=false)=>({type:'file',content:s,exec:x});

const README=`Welcome, explorer!
This world is made of folders and files.
Folders hold other things. Files hold text.
Type help any time to see the commands you can use.`;
const SECRET=`SECRET MAP
----------
The forest hides a cave.
The cave goes deeper than it looks.
Hidden files start with a dot. ls -a shows them.`;
const JOURNAL=[
'Day 1. Packed the bag and left the village at dawn.','The road to the forest was muddy.','Heard a wolf howling far away.','Made a fire and ate bread.',
'Day 2. Found a strange map in an old tree.','The map shows a cave north of the river.','Crossed the river on a fallen log.','A Wolf watched me from the hill.',
'I kept walking and did not look back.','Day 3. Rain all morning.','Dried my socks by the fire.','Counted my supplies: 4 apples, 2 bread, 1 rope.',
'Day 4. Reached the edge of the forest.','Owls everywhere. One seemed to talk.','The map says the treasure is deeper than it looks.','Found the cave entrance behind a waterfall.',
'Day 5. Went into the cave with a torch.','Bats! Hundreds of them.','Heard the WOLF again, closer this time.','Blocked the entrance with rocks.',
'Day 6. Followed a tunnel downward.','Marked the path on the map so I can find my way back.','The tunnel split in two. Chose the left.','Found a heavy chest.',
'Day 7. The chest is locked.','Tried every key on my ring. None fit.','Left a note for the next explorer.','Walked back to the village to rest.',
'The wolf followed me to the gate, then turned away.','Next time I will bring better tools. Maybe a terminal.'].join('\n');
const PEOPLE=['Mira','Tomas','Ada','Ben','Mira','Zoe','Ada','Lena','Ben','Mira','Omar','Kai'].join('\n');
const GOLD=`You found the gold!
Secret word: PENGUIN
(Tux the penguin is the mascot of Linux.)`;
const LOGS={'day1.log':'06:00 gate opened\n09:30 baker lit the oven\n20:00 gate closed','day2.log':'06:00 gate opened\n13:10 wolf seen near the river\n20:00 gate closed','day3.log':'06:00 gate opened\n11:45 explorer returned\n20:00 gate closed'};

function makeWorld(){
  return D({
    etc:D({hostname:F('basecamp'),motd:F('Welcome to basecamp. Be careful with rm.')}),
    home:D({explorer:D({
      'readme.txt':F(README),'.secret_map':F(SECRET),'journal.txt':F(JOURNAL),
      forest:D({'mushroom.txt':F('Red cap, white spots.\nDo not eat.'),'owl.txt':F('Hoo! The cave is right here. Try: cd cave'),
        cave:D({'echo.txt':F('hello... hello... hello...'),'.bats':F('312 bats live here. They hide, like this file.'),
          deeper:D({chest:D({'gold.txt':F(GOLD)})})})}),
      village:D({'shop.txt':F('apple 2\nbread 3\nrope 12\ntorch 8\nmap 20'),'people.txt':F(PEOPLE),
        logs:D({'day1.log':F(LOGS['day1.log']),'day2.log':F(LOGS['day2.log']),'day3.log':F(LOGS['day3.log']),'notes.txt':F('Logs are kept for three days.')})})
    })}),
    tmp:D({})
  });
}

function fresh(){return {fs:makeWorld(),cwd:HOME,oldpwd:HOME,vars:{},last:0,hist:[],ch:0,mi:0,done:{},xp:0,best:0,badges:{},seen:false}}
let S=fresh();
try{const raw=localStorage.getItem(KEY);if(raw){const o=JSON.parse(raw);if(o&&o.fs)S=Object.assign(fresh(),o)}}catch(e){}
function save(){try{S.hist=S.hist.slice(-200);localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}

/* ---------- filesystem ---------- */
function norm(p,base){base=base||S.cwd;if(p==null||p==='')return base;if(p==='~'||p.startsWith('~/'))p=HOME+p.slice(1);
  const parts=p.startsWith('/')?[]:base.split('/').filter(Boolean);
  for(const s of p.split('/')){if(!s||s==='.')continue;if(s==='..')parts.pop();else parts.push(s)}
  return '/'+parts.join('/')}
function getNode(abs){let n=S.fs;for(const s of abs.split('/').filter(Boolean)){if(!n||n.type!=='dir')return null;n=n.children[s];if(!n)return null}return n||null}
function parentOf(abs){const parts=abs.split('/').filter(Boolean);const name=parts.pop();const pp='/'+parts.join('/');return [getNode(pp),name,pp]}
function bname(abs){return abs.split('/').filter(Boolean).pop()||'/'}
function disp(abs){return abs===HOME?'~':abs.startsWith(HOME+'/')?'~'+abs.slice(HOME.length):abs}
function join(a,b){return (a==='/'?'':a)+'/'+b}
const clone=n=>JSON.parse(JSON.stringify(n));
let changed=new Set();
function markTree(abs,n){changed.add(abs);if(n.type==='dir')for(const k in n.children)markTree(join(abs,k),n.children[k])}
function mkdirp(abs){let n=S.fs,path='';for(const s of abs.split('/').filter(Boolean)){path+='/'+s;if(!n.children[s]){n.children[s]=D();changed.add(path)}n=n.children[s];if(n.type!=='dir')return path}return null}
function ensureDir(p){mkdirp(norm(p,HOME))}
function ensureFile(p,c){const abs=norm(p,HOME);if(getNode(abs))return;const [,,pp]=parentOf(abs);if(mkdirp(pp))return;const [par,name]=parentOf(abs);if(par&&par.type==='dir'){par.children[name]=F(c);changed.add(abs)}}
function writeFile(abs,text,append,shown){const n=getNode(abs);if(n&&n.type==='dir')return `bash: ${shown}: Is a directory`;
  const [par,name]=parentOf(abs);if(!par||par.type!=='dir')return `bash: ${shown}: No such file or directory`;
  if(n){n.content=append&&n.content?n.content+'\n'+text:text}else par.children[name]=F(text);changed.add(abs);return null}
const cmpName=(x,y)=>x.replace(/^\./,'').toLowerCase().localeCompare(y.replace(/^\./,'').toLowerCase());
function sortedKeys(n){return Object.keys(n.children).sort((a,b)=>{const da=n.children[a].type==='dir',db=n.children[b].type==='dir';return da!==db?(da?-1:1):cmpName(a,b)})}

/* ---------- shell engine ---------- */
const M=(c,s)=>'\x01'+c+s+'\x02';
const ok=(out='')=>({out,err:[],code:0});
const E=(m,c=1)=>({out:'',err:[m],code:c});
const lines=t=>t===''?[]:t.split('\n');
let LOG=[];
function getVar(k){if(k==='?')return String(S.last);if(k==='PWD')return S.cwd;if(k in S.vars)return S.vars[k];
  return ({HOME,USER:'explorer',SHELL:'/bin/bash',HOSTNAME:'basecamp',PATH:'/usr/local/bin:/usr/bin:/bin'})[k]||''}
const VRX=/^\$(\{(\w+)\}|(\w+|\?))/;
function tokenize(line){
  const toks=[];let i=0,cur=null;
  const push=()=>{if(cur){toks.push({t:'w',v:cur.v,glob:cur.glob});cur=null}};
  while(i<line.length){const c=line[i];
    if(c===' '||c==='\t'){push();i++;continue}
    if(c==='|'){push();if(line[i+1]==='|'){toks.push({t:'op',v:'||'});i+=2}else{toks.push({t:'op',v:'|'});i++}continue}
    if(c==='&'&&line[i+1]==='&'){push();toks.push({t:'op',v:'&&'});i+=2;continue}
    if(c===';'){push();toks.push({t:'op',v:';'});i++;continue}
    if(c==='>'){push();if(line[i+1]==='>'){toks.push({t:'op',v:'>>'});i+=2}else{toks.push({t:'op',v:'>'});i++}continue}
    if(c==='<'){push();toks.push({t:'op',v:'<'});i++;continue}
    if(c==='#'&&!cur)break;
    if(c==='~'&&!cur&&(i+1>=line.length||/[\s\/|;&<>]/.test(line[i+1]))){cur={v:HOME,glob:false};i++;continue}
    cur=cur||{v:'',glob:false};
    if(c==="'"){const j=line.indexOf("'",i+1);if(j<0)throw new Error("unclosed ' quote. Every opening quote needs a closing one.");cur.v+=line.slice(i+1,j);i=j+1;continue}
    if(c==='"'){let j=i+1,s='';while(j<line.length&&line[j]!=='"'){if(line[j]==='\\'&&j+1<line.length){s+=line[j+1];j+=2;continue}
        if(line[j]==='$'){const m=line.slice(j).match(VRX);if(m){s+=getVar(m[2]||m[3]);j+=m[0].length;continue}}s+=line[j];j++}
      if(j>=line.length)throw new Error('unclosed " quote. Every opening quote needs a closing one.');cur.v+=s;i=j+1;continue}
    if(c==='$'){const m=line.slice(i).match(VRX);if(m){cur.v+=getVar(m[2]||m[3]);i+=m[0].length;continue}}
    if(c==='\\'&&i+1<line.length){cur.v+=line[i+1];i+=2;continue}
    if(c==='*'||c==='?')cur.glob=true;
    cur.v+=c;i++}
  push();return toks}
function parse(toks){
  const seq=[];let pipe=[],op=null;const nc=()=>({words:[],out:null,inp:null});let cmd=nc();
  const bad=v=>{throw new Error(`syntax error near unexpected token '${v}'`)};
  for(let k=0;k<toks.length;k++){const t=toks[k];
    if(t.t==='w'){cmd.words.push(t);continue}
    if(t.v==='>'||t.v==='>>'||t.v==='<'){const nx=toks[k+1];if(!nx||nx.t!=='w')bad(nx?nx.v:'newline');if(t.v==='<')cmd.inp=nx.v;else cmd.out={path:nx.v,append:t.v==='>>'};k++;continue}
    if(t.v==='|'){if(!cmd.words.length)bad('|');pipe.push(cmd);cmd=nc();continue}
    if(!cmd.words.length&&!cmd.out)bad(t.v);
    pipe.push(cmd);seq.push({op,pipe});op=t.v;pipe=[];cmd=nc()}
  if(cmd.words.length||cmd.out)pipe.push(cmd);else if(pipe.length)bad('newline');
  if(pipe.length)seq.push({op,pipe});else if(op&&op!==';')bad('newline');
  return seq}
function globRe(p,ci){return new RegExp('^'+p.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.')+'$',ci?'i':'')}
function globExpand(pat){const idx=pat.lastIndexOf('/');const dp=idx>=0?pat.slice(0,idx+1):'';const b=pat.slice(idx+1);
  if(/[*?]/.test(dp)||!b)return [pat];const dn=getNode(norm(dp||'.'));if(!dn||dn.type!=='dir')return [pat];
  const rx=globRe(b);const m=Object.keys(dn.children).filter(k=>(b.startsWith('.')||!k.startsWith('.'))&&rx.test(k)).sort(cmpName).map(k=>dp+k);
  return m.length?m:[pat]}
function flags(a){const fl=new Set(),rest=[];let end=false;for(const x of a){if(!end&&x==='--'){end=true;continue}
  if(!end&&x.startsWith('-')&&x.length>1){if(x.startsWith('--'))fl.add(x);else for(const ch of x.slice(1))fl.add(ch)}else rest.push(x)}return {fl,rest}}
function readInputs(rest,io,cmd){const src=[],err=[];if(!rest.length){src.push({name:'',text:io.stdin});return {src,err}}
  for(const t of rest){const n=getNode(norm(t));if(!n)err.push(`${cmd}: ${t}: No such file or directory`);else if(n.type==='dir')err.push(`${cmd}: ${t}: Is a directory`);else src.push({name:t,text:n.content})}
  return {src,err}}
function paint(name,n,tty){if(!tty)return name;if(n.type==='dir')return M('d',name+'/');if(n.exec)return M('x',name);return name}
function parseN(a,cmd){let n=10;const rest=[];for(let i=0;i<a.length;i++){const x=a[i];
  if(x==='-n'){n=parseInt(a[++i],10)}else if(/^-n\d+$/.test(x))n=parseInt(x.slice(2),10);else if(/^-\d+$/.test(x))n=parseInt(x.slice(1),10);else rest.push(x)}
  return {n,rest,bad:isNaN(n)}}

const CMDS={
  pwd:()=>ok(S.cwd),
  ls(a,io){const {fl,rest}=flags(a);const all=fl.has('a')||fl.has('A'),long=fl.has('l');const targets=rest.length?rest:['.'];const err=[];let code=0;
    const fmt=(name,n)=>long?`${n.type==='dir'?'drwxr-xr-x':n.exec?'-rwxr-xr-x':'-rw-r--r--'}  explorer  ${String(n.type==='dir'?4096:n.content.length).padStart(5)}  ${paint(name,n,io.tty)}`:paint(name,n,io.tty);
    const jn=arr=>arr.join(long||!io.tty?'\n':'  ');const files=[],dirs=[],blocks=[];
    for(const t of targets){const n=getNode(norm(t));if(!n){err.push(`ls: cannot access '${t}': No such file or directory`);code=2;continue}(n.type==='dir'?dirs:files).push([t,n])}
    if(files.length)blocks.push(jn(files.map(([t,n])=>fmt(t,n))));
    for(const [t,n] of dirs){let ents=Object.keys(n.children).filter(k=>all||!k.startsWith('.')).sort(cmpName).map(k=>fmt(k,n.children[k]));
      if(fl.has('a'))ents=[fmt('.',n),fmt('..',D())].concat(ents);
      let body=jn(ents);if(targets.length>1)body=t+':'+(body?'\n'+body:'');blocks.push(body)}
    return {out:blocks.filter(b=>b!=='').join(targets.length>1?'\n\n':'\n'),err,code}},
  cd(a){if(a.length>1)return E('bash: cd: too many arguments');let t=a[0];if(t===undefined)t=HOME;let show='';if(t==='-'){t=S.oldpwd;show=t}
    const abs=norm(t),n=getNode(abs);if(!n)return E(`bash: cd: ${a[0]}: No such file or directory`);if(n.type!=='dir')return E(`bash: cd: ${a[0]}: Not a directory`);
    S.oldpwd=S.cwd;S.cwd=abs;return ok(show)},
  mkdir(a){const {fl,rest}=flags(a);if(!rest.length)return E('mkdir: missing operand');const err=[];
    for(const t of rest){const abs=norm(t);if(getNode(abs)){if(!fl.has('p'))err.push(`mkdir: cannot create directory '${t}': File exists`);continue}
      if(fl.has('p')){const bad=mkdirp(abs);if(bad)err.push(`mkdir: cannot create directory '${t}': Not a directory`);continue}
      const [par,name]=parentOf(abs);if(!par||par.type!=='dir'){err.push(`mkdir: cannot create directory '${t}': No such file or directory`);continue}
      par.children[name]=D();changed.add(abs)}
    const r={out:'',err,code:err.length?1:0};if(err.some(e=>e.endsWith('No such file or directory')))r.tips=['Tip: add -p to create the missing folders along the way.'];return r},
  touch(a){if(!a.length)return E('touch: missing file operand');const err=[];for(const t of a){const abs=norm(t);if(getNode(abs)){changed.add(abs);continue}
      const [par,name]=parentOf(abs);if(!par||par.type!=='dir'){err.push(`touch: cannot touch '${t}': No such file or directory`);continue}par.children[name]=F('');changed.add(abs)}
    return {out:'',err,code:err.length?1:0}},
  echo(a){let x=a.slice();while(x[0]==='-n'||x[0]==='-e')x.shift();return ok(x.join(' '))},
  cat(a,io){const {rest}=flags(a);const {src,err}=readInputs(rest,io,'cat');return {out:src.map(s=>s.text).join('\n'),err,code:err.length?1:0}},
  rm(a){const {fl,rest}=flags(a);const r=fl.has('r')||fl.has('R'),f=fl.has('f');if(!rest.length)return f?ok():E('rm: missing operand');const err=[];const tips=[];
    for(const t of rest){const abs=norm(t);
      if(abs==='/'||abs===HOME||HOME.startsWith(abs+'/')){err.push(`rm: refusing to remove '${t}': that would wipe out your whole world`);continue}
      if(S.cwd===abs||S.cwd.startsWith(abs+'/')){err.push(`rm: you are standing inside '${t}'. cd out of it first.`);continue}
      const n=getNode(abs);if(!n){if(!f)err.push(`rm: cannot remove '${t}': No such file or directory`);continue}
      if(n.type==='dir'&&!r){err.push(`rm: cannot remove '${t}': Is a directory`);tips.push(`Tip: folders need -r (recursive): rm -r ${t}`);continue}
      const [par,name,pp]=parentOf(abs);delete par.children[name];changed.add(pp)}
    return {out:'',err,code:err.length?1:0,tips}},
  rmdir(a){if(!a.length)return E('rmdir: missing operand');const err=[];for(const t of a){const abs=norm(t),n=getNode(abs);
      if(!n){err.push(`rmdir: failed to remove '${t}': No such file or directory`);continue}if(n.type!=='dir'){err.push(`rmdir: failed to remove '${t}': Not a directory`);continue}
      if(Object.keys(n.children).length){err.push(`rmdir: failed to remove '${t}': Directory not empty`);continue}
      if(S.cwd===abs||S.cwd.startsWith(abs+'/')){err.push(`rmdir: you are standing inside '${t}'. cd out of it first.`);continue}
      const [par,name,pp]=parentOf(abs);delete par.children[name];changed.add(pp)}return {out:'',err,code:err.length?1:0}},
  cp(a){return copyMove(a,false)},
  mv(a){return copyMove(a,true)},
  head(a,io){return headTail(a,io,'head')},
  tail(a,io){return headTail(a,io,'tail')},
  wc(a,io){const {fl,rest}=flags(a);const {src,err}=readInputs(rest,io,'wc');const out=[];
    const pick=['l','w','c'].filter(x=>fl.has(x)||(x==='c'&&fl.has('m')));
    for(const s of src){const L=lines(s.text).length,W=s.text.split(/\s+/).filter(Boolean).length,C=s.text.length+(s.text?1:0);
      const vals={l:L,w:W,c:C};const cols=(pick.length?pick:['l','w','c']).map(k=>pick.length===1?String(vals[k]):String(vals[k]).padStart(4));
      out.push(cols.join(pick.length===1?'':' ')+(s.name?' '+s.name:''))}
    return {out:out.join('\n'),err,code:err.length?1:0}},
  grep(a,io){const {fl,rest}=flags(a);if(!rest.length)return E('usage: grep [-i] [-n] [-c] [-v] PATTERN [FILE...]',2);const pat=rest.shift();
    const fg=fl.has('i')?'gi':'g';let re;try{re=new RegExp(pat,fg)}catch(e){re=new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),fg)}
    const {src,err}=readInputs(rest,io,'grep');const multi=src.length>1;const out=[];let total=0;
    for(const s of src){let cnt=0;lines(s.text).forEach((ln,i)=>{re.lastIndex=0;const hit=re.test(ln);if(hit!==fl.has('v')){cnt++;
        if(!fl.has('c')){let txt=ln;if(io.tty&&!fl.has('v')&&pat){re.lastIndex=0;txt=ln.replace(re,m=>M('m',m))}
          const pre=(multi?(io.tty?M('f',s.name):s.name)+':':'')+(fl.has('n')?(io.tty?M('n',String(i+1)):String(i+1))+':':'');out.push(pre+txt)}}});
      if(fl.has('c'))out.push((multi?s.name+':':'')+cnt);total+=cnt}
    return {out:out.join('\n'),err,code:err.length?2:total?0:1}},
  sort(a,io){const {fl,rest}=flags(a);const {src,err}=readInputs(rest,io,'sort');let L=[].concat(...src.map(s=>lines(s.text)));
    if(fl.has('n'))L.sort((x,y)=>(parseFloat(x)||0)-(parseFloat(y)||0)||x.localeCompare(y));else L.sort((x,y)=>x.localeCompare(y));
    if(fl.has('r'))L.reverse();if(fl.has('u'))L=L.filter((x,i)=>L.indexOf(x)===i);return {out:L.join('\n'),err,code:err.length?2:0}},
  uniq(a,io){const {fl,rest}=flags(a);const {src,err}=readInputs(rest.slice(0,1),io,'uniq');const L=src.length?lines(src[0].text):[];const g=[];
    for(const x of L){if(g.length&&g[g.length-1][0]===x)g[g.length-1][1]++;else g.push([x,1])}
    return {out:g.map(([x,n])=>fl.has('c')?String(n).padStart(7)+' '+x:x).join('\n'),err,code:err.length?1:0}},
  find(a){let start='.',i=0;if(a[0]&&!a[0].startsWith('-')){start=a[0];i=1}let rx=null,type=null;
    for(;i<a.length;i++){const p=a[i];if(p==='-name'||p==='-iname'){const v=a[++i];if(v==null)return E(`find: missing argument to '${p}'`);rx=globRe(v,p==='-iname')}
      else if(p==='-type'){type=a[++i];if(type!=='f'&&type!=='d')return E(`find: unknown argument to -type: ${type}`)}
      else{const r=E(`find: paths must come before the search options: '${p}'`);if(/[*?]/.test(a.join('')))r.tips=['Tip: put quotes around the pattern, like -name "*.txt", so the shell leaves the * for find.'];return r}}
    const root=getNode(norm(start));if(!root)return E(`find: '${start}': No such file or directory`);const out=[];
    (function walk(n,path,nm){if((!rx||rx.test(nm))&&(!type||(type==='d')===(n.type==='dir')))out.push(path);
      if(n.type==='dir')for(const k of Object.keys(n.children).sort(cmpName))walk(n.children[k],path.replace(/\/$/,'')+'/'+k,k)})(root,start,bname(norm(start)));
    return ok(out.join('\n'))},
  tree(a,io){const {fl,rest}=flags(a);const t=rest[0]||'.';const n=getNode(norm(t));if(!n)return E(`tree: '${t}': No such file or directory`);if(n.type!=='dir')return ok(t);
    const out=[io.tty?M('d',t):t];let dc=0,fc=0;
    (function rec(node,pre){const ks=sortedKeys(node).filter(k=>fl.has('a')||!k.startsWith('.'));ks.forEach((k,i)=>{const last=i===ks.length-1,c=node.children[k];
      out.push(pre+(last?'└── ':'├── ')+paint(k,c,io.tty));if(c.type==='dir'){dc++;rec(c,pre+(last?'    ':'│   '))}else fc++})})(n,'');
    out.push('',`${dc} director${dc===1?'y':'ies'}, ${fc} file${fc===1?'':'s'}`);return ok(out.join('\n'))},
  chmod(a){if(a.length<2)return E("chmod: missing operand. Example: chmod +x pack.sh");const mode=a[0];let x;
    if(/^[ugoa]*\+[rwx]*x[rwx]*$/.test(mode))x=true;else if(/^[ugoa]*-[rwx]*x[rwx]*$/.test(mode))x=false;else if(/^[0-7]{3}$/.test(mode))x=(parseInt(mode[0],10)&1)===1;
    else if(/^[ugoa]*[+-][rw]+$/.test(mode))return ok();else return E(`chmod: invalid mode: '${mode}'`);
    const err=[];for(const t of a.slice(1)){const abs=norm(t),n=getNode(abs);if(!n){err.push(`chmod: cannot access '${t}': No such file or directory`);continue}if(n.type==='file')n.exec=x;changed.add(abs)}
    return {out:'',err,code:err.length?1:0}},
  history:()=>ok(S.hist.map((h,i)=>String(i+1).padStart(4)+'  '+h).join('\n')),
  clear:()=>Object.assign(ok(),{clear:true}),
  whoami:()=>ok('explorer'),
  hostname:()=>ok('basecamp'),
  date(){const d=new Date(),p=d.toDateString().split(' ');return ok(`${p[0]} ${p[1]} ${p[2]} ${d.toTimeString().slice(0,8)} ${p[3]}`)},
  bash(a,io){if(!a[0])return E('You are already in bash. To run a script, give its name: bash pack.sh');return runPath(a[0],io,true)},
  sh(a,io){return CMDS.bash(a,io)},
  help:()=>ok(['Commands in this practice shell:',
    '  Look around   pwd  ls  cd  tree  cat',
    '  Create        mkdir  touch  echo',
    '  Organize      cp  mv  rm  rmdir',
    '  Read          head  tail  wc  grep  sort  uniq',
    '  Search        find',
    '  Scripts       NAME=value  chmod  bash  ./file  for … do … done',
    '  Other         history  clear  whoami  date  man <command>',
    'Symbols:  |  >  >>  <  &&  ;  *  ?  ~  .  ..',
    'Try: man grep'].join('\n')),
  man(a){if(!a[0])return E('What manual page do you want? For example: man ls');const g=GUIDE.find(x=>x.c===a[0]||x.c.split(' ')[0]===a[0]);
    if(!g)return E(`No manual entry for ${a[0]}`);
    return ok([`${g.c.toUpperCase()}`,'',`  ${g.what}`,'','EXAMPLES',...g.ex.map(([c,n])=>`  ${c}${n?'    # '+n:''}`),'',"(Short version. Real man pages are long; on a real computer press q to quit them.)"].join('\n'))}
};
function headTail(a,io,cmd){const {n,rest,bad}=parseN(a);if(bad)return E(`${cmd}: invalid number of lines`);const {src,err}=readInputs(rest,io,cmd);const out=[];
  src.forEach((s,i)=>{const L=lines(s.text);const part=cmd==='head'?L.slice(0,n):(n?L.slice(-n):[]);if(src.length>1)out.push((i?'\n':'')+`==> ${s.name} <==`);out.push(...part)});
  return {out:out.join('\n'),err,code:err.length?1:0}}
function copyMove(a,move){const nm=move?'mv':'cp';const {fl,rest}=flags(a);const r=move||fl.has('r')||fl.has('R');
  if(rest.length<2)return E(rest.length?`${nm}: missing destination file operand after '${rest[0]}'`:`${nm}: missing file operand`);
  const dest=rest.pop(),dabs=norm(dest),dn=getNode(dabs),into=!!dn&&dn.type==='dir';
  if(rest.length>1&&!into)return E(`${nm}: target '${dest}' is not a directory`);const err=[],tips=[];
  for(const s of rest){const sabs=norm(s),sn=getNode(sabs);
    if(!sn){err.push(`${nm}: cannot stat '${s}': No such file or directory`);continue}
    if(sn.type==='dir'&&!r){err.push(`cp: -r not specified; omitting directory '${s}'`);tips.push(`Tip: copying a folder needs -r: cp -r ${s} ${dest}`);continue}
    const tabs=into?join(dabs,bname(sabs)):dabs;
    if(tabs===sabs){err.push(`${nm}: '${s}' and '${dest}' are the same file`);continue}
    if(sn.type==='dir'&&(tabs+'/').startsWith(sabs+'/')){err.push(`${nm}: cannot ${move?'move':'copy'} '${s}' into itself`);continue}
    if(move&&(S.cwd===sabs||S.cwd.startsWith(sabs+'/'))){err.push(`mv: you are standing inside '${s}'. cd out of it first.`);continue}
    const ex=getNode(tabs);if(ex&&ex.type==='dir'){err.push(`${nm}: cannot overwrite directory '${disp(tabs)}'`);continue}
    const [par,name]=parentOf(tabs);if(!par||par.type!=='dir'){err.push(`${nm}: cannot create '${dest}': No such file or directory`);continue}
    const copy=move?sn:clone(sn);if(move){const [sp,sname,spp]=parentOf(sabs);delete sp.children[sname];changed.add(spp)}
    par.children[name]=copy;markTree(tabs,copy)}
  return {out:'',err,code:err.length?1:0,tips}}

const FRIENDLY={
  nano:'This practice shell has no text editor. Write files with echo and > (replace) or >> (add a line).',
  vim:'This practice shell has no text editor. Write files with echo and > (replace) or >> (add a line).',
  vi:'This practice shell has no text editor. Write files with echo and > (replace) or >> (add a line).',
  code:'This practice shell has no text editor. Write files with echo and > (replace) or >> (add a line).',
  sudo:'sudo runs a command as the all-powerful admin user. You don\'t need it here, and on a real computer use it only when you know why.',
  exit:'There is nowhere to exit to. Your progress saves automatically.',
  logout:'There is nowhere to exit to. Your progress saves automatically.',
  cls:'cls is the Windows command. In bash, use clear.',
  dir:'dir is the Windows command. In bash, use ls.',
  copy:'copy is the Windows command. In bash, use cp.',
  move:'move is the Windows command. In bash, use mv.',
  del:'del is the Windows command. In bash, use rm.',
  'cd..':'Bash needs a space between cd and the dots: cd ..',
  less:'less pages through long files. This practice shell doesn\'t have it; use head and tail instead.',
  more:'more pages through long files. This practice shell doesn\'t have it; use head and tail instead.'
};
function lev(a,b){const d=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){let p=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t}}return d[b.length]}
function suggest(n){let best=null,bd=3;for(const c of Object.keys(CMDS)){const d=lev(n.toLowerCase(),c);if(d<bd){bd=d;best=c}}return n.length>1&&bd<=(n.length<4?1:2)?best:null}

function runPath(name,io,force){const abs=norm(name),n=getNode(abs);
  if(!n)return E(`bash: ${name}: No such file or directory`,127);
  if(n.type==='dir')return E(`bash: ${name}: Is a directory`,126);
  if(!force&&!n.exec)return Object.assign(E(`bash: ${name}: Permission denied`,126),{tips:[`Tip: mark it as runnable with chmod +x ${bname(abs)}`]});
  const saveCwd=S.cwd,saveVars=Object.assign({},S.vars);const out=[],err=[];let code=0;
  for(const ln of n.content.split('\n')){const t=ln.trim();if(!t||t.startsWith('#'))continue;
    const r=execLine(t,{depth:io.depth+1,tty:io.tty,record:false});for(const o of r.out){if(o.clear)continue;(o.cls==='out'?out:err).push(o.text)}code=r.code}
  S.cwd=saveCwd;S.vars=saveVars;return {out:out.join('\n'),err,code}}

function runCmd(words,io){
  if(!words.length)return ok();
  const args=[];let globbed=false;
  for(const w of words){if(w.glob){globbed=true;args.push(...globExpand(w.v))}else args.push(w.v)}
  const name=args[0],a=args.slice(1);let r,lname=name;
  if(/^[A-Za-z_]\w*=/.test(name)&&args.length===1){const k=name.split('=')[0];S.vars[k]=name.slice(k.length+1);r=ok();lname='(assign)'}
  else if(args[1]==='='&&/^[A-Za-z_]\w*$/.test(name)){r=E(`bash: ${name}: command not found`,127);r.tips=[`Tip: no spaces around = when you set a variable. Try: ${name}="${a.slice(1).join(' ')||'value'}"`]}
  else if(name.includes('/'))r=runPath(name,io,false);
  else if(CMDS[name])r=CMDS[name](a,io);
  else if(FRIENDLY[name])r=E(FRIENDLY[name],127);
  else{r=E(`bash: ${name}: command not found`,127);const s=suggest(name);if(s)r.tips=[`Did you mean: ${s}?`]}
  if(io.record)LOG.push({name:lname,args:a,globbed,piped:io.pipeLen>1,redirect:io.redirect,code:r.code,out:r.out||''});
  return r}

const FOR_RE=/^for\s+([A-Za-z_]\w*)\s+in\s+(.*?)\s*;\s*do\s+(.*?)\s*;?\s*done\s*$/;
function execLine(line,o){o=Object.assign({depth:0,tty:true,record:true},o);const res=[];let code=0;
  if(o.depth>6)return {out:[{text:'bash: too many nested scripts',cls:'err'}],code:1};
  const t=line.trim();
  if(/^for\b/.test(t)){const fm=t.match(FOR_RE);
    if(!fm)return {out:[{text:'bash: for loop needs this shape: for x in a b c; do echo $x; done',cls:'err'}],code:2};
    let toks;try{toks=tokenize(fm[2])}catch(e){return {out:[{text:'bash: '+e.message,cls:'err'}],code:2}}
    const items=[];let globbed=false;for(const w of toks){if(w.t!=='w')continue;if(w.glob){globbed=true;items.push(...globExpand(w.v))}else items.push(w.v)}
    if(o.record)LOG.push({name:'for',args:items,globbed,piped:false,redirect:null,code:0,out:''});
    for(const it of items){S.vars[fm[1]]=it;const r=execLine(fm[3],o);res.push(...r.out);code=r.code}
    S.last=code;return {out:res,code}}
  let seq;try{seq=parse(tokenize(line))}catch(e){return {out:[{text:'bash: '+e.message,cls:'err'}],code:2}}
  for(const item of seq){if(item.op==='&&'&&code!==0)continue;if(item.op==='||'&&code===0)continue;
    let stdin='';const P=item.pipe;
    for(let i=0;i<P.length;i++){const c=P[i],last=i===P.length-1;
      if(c.inp){const n=getNode(norm(c.inp));if(!n||n.type!=='file'){res.push({text:`bash: ${c.inp}: No such file or directory`,cls:'err'});code=1;break}stdin=n.content}
      if(c.out&&!c.out.append){const e=writeFile(norm(c.out.path),'',false,c.out.path);if(e){res.push({text:e,cls:'err'});code=1;break}}
      const r=runCmd(c.words,{stdin,tty:o.tty&&last&&!c.out,depth:o.depth,pipeLen:P.length,record:o.record,redirect:c.out});
      if(r.clear)res.push({clear:true});
      r.err.forEach(e=>res.push({text:e,cls:'err'}));(r.tips||[]).forEach(e=>res.push({text:e,cls:'tip'}));
      code=r.code;
      if(c.out){const e=writeFile(norm(c.out.path),r.out,c.out.append,c.out.path);if(e){res.push({text:e,cls:'err'});code=1}stdin=''}
      else if(last){if(r.out!=='')res.push({text:r.out,cls:'out'})}
      else stdin=r.out}
    S.last=code}
  return {out:res,code}}

/* ---------- missions ---------- */
const CH=[
{name:'Where am I?',badge:'Pathfinder',intro:'Bash always has you standing inside one folder. First, learn to look around and walk between folders.',
 learned:['pwd','ls','ls -a','cat','cd','cd ..','cd ~'],
 setup(){ensureDir('~/forest/cave/deeper/chest');ensureFile('~/.secret_map',SECRET);ensureFile('~/readme.txt',README)},
 missions:[
 {title:'Ask where you are',goal:`Type <code>pwd</code> and press Enter.`,anat:[['pwd','cmd']],answer:'pwd',
  explain:`pwd stands for <b>print working directory</b>. It prints the full path of the folder you are in. Paths start at <code>/</code>, the root of everything, and each <code>/</code> after that goes one folder deeper.`,check:c=>c.ran('pwd')},
 {title:'Look around',goal:`List what is in this folder: <code>ls</code>`,anat:[['ls','cmd']],answer:'ls',
  explain:`ls <b>lists</b> what is inside the folder you are in. Folders show in teal with a <code>/</code> after the name; plain text is a file. Compare the list with the world map.`,check:c=>c.ran('ls')},
 {title:'Reveal hidden files',goal:`Show everything, hidden files included: <code>ls -a</code>`,anat:[['ls','cmd'],['-a','opt']],answer:'ls -a',
  explain:`Names that start with a dot are hidden from a plain <code>ls</code>. An <b>option</b> changes how a command behaves, and options usually start with a dash. <code>-a</code> means <b>all</b>. You will also see <code>.</code> (this folder) and <code>..</code> (the folder above).`,
  check:c=>c.ran('ls',e=>c.flag(e,'a')||c.flag(e,'A'))},
 {title:'Read the secret map',goal:`Print the hidden file: <code>cat .secret_map</code>`,anat:[['cat','cmd'],['.secret_map','arg']],answer:'cat .secret_map',
  explain:`cat prints what is inside a file. The file name is an <b>argument</b>: the thing the command works on. Try typing <code>cat .se</code> and pressing <kbd>Tab</kbd>. Bash finishes the name for you.`,
  check:c=>c.ran('cat',e=>e.args.some(x=>x.endsWith('secret_map')))},
 {title:'Walk into the forest',goal:`Move into the forest folder: <code>cd forest</code>`,anat:[['cd','cmd'],['forest','arg']],answer:'cd forest',
  explain:`cd means <b>change directory</b>. Watch the prompt change from <code>~</code> to <code>~/forest</code>, and watch the YOU pin move on the map.`,check:c=>c.cwd===HOME+'/forest'},
 {title:'Step back out',goal:`Go up one level: <code>cd ..</code>`,anat:[['cd','cmd'],['..','arg']],answer:'cd ..',
  explain:`Two dots <code>..</code> always mean <b>the folder above this one</b>. One dot <code>.</code> means <b>this folder</b>. Keep the space between cd and the dots.`,check:c=>c.ran('cd',e=>(e.args[0]||'').startsWith('..'))},
 {title:'Go deep in one jump',goal:`From home, travel two levels at once: <code>cd forest/cave</code>`,anat:[['cd','cmd'],['forest/cave','arg']],answer:'cd forest/cave',
  explain:`Join folder names with <code>/</code> to travel several levels in one go. This is a <b>relative path</b>: it starts from where you are right now. Lost? <code>cd ~</code> takes you home first.`,check:c=>c.cwd===HOME+'/forest/cave'},
 {title:'Teleport home',goal:`Return home from anywhere: <code>cd ~</code>`,anat:[['cd','cmd'],['~','arg']],answer:'cd ~',
  explain:`<code>~</code> (tilde) is a shortcut for your home folder, <code>/home/explorer</code>. Plain <code>cd</code> with nothing after it also goes home. A path that starts with <code>/</code> is an <b>absolute path</b>: it works no matter where you are.`,
  check:c=>c.cwd===HOME&&c.ran('cd')}
 ]},
{name:'Make things',badge:'Builder',intro:'Folders and files don\'t have to exist already. You can create them and write text into them.',
 learned:['mkdir','touch','echo','>','>>','mkdir -p'],setup(){},
 missions:[
 {title:'Build a camp',goal:`From home, create a folder: <code>mkdir camp</code>`,anat:[['mkdir','cmd'],['camp','arg']],answer:'mkdir camp',note:`Not at home? Run <code>cd ~</code> first.`,
  explain:`mkdir means <b>make directory</b>. Directory is the older word for folder; they mean the same thing. Watch the new folder flash onto the map.`,check:c=>c.isDir('~/camp')},
 {title:'Pitch a tent',goal:`Create an empty file inside camp: <code>touch camp/tent.txt</code>`,anat:[['touch','cmd'],['camp/tent.txt','arg']],answer:'touch camp/tent.txt',
  explain:`touch creates an empty file. Look at the path: you can make a file inside a folder without walking into it first.`,check:c=>c.isFile('~/camp/tent.txt')},
 {title:'Say something',goal:`Print a message: <code>echo "Hello, world"</code>`,anat:[['echo','cmd'],['"Hello, world"','arg']],answer:'echo "Hello, world"',
  explain:`echo prints back whatever you give it. The quotes keep <code>Hello, world</code> together as one argument, spaces included.`,check:c=>c.ran('echo',e=>!e.redirect)},
 {title:'Start a diary',goal:`Send text into a file: <code>echo "Day 1: made camp" &gt; camp/diary.txt</code>`,anat:[['echo','cmd'],['"Day 1: made camp"','arg'],['>','op'],['camp/diary.txt','arg']],answer:'echo "Day 1: made camp" > camp/diary.txt',
  explain:`<code>&gt;</code> <b>redirects</b> output: instead of printing on screen, the text goes into the file. If the file doesn't exist yet, bash creates it. Careful: <code>&gt;</code> replaces whatever the file held before.`,check:c=>c.read('~/camp/diary.txt').trim().length>0},
 {title:'Add a second entry',goal:`Append, don't replace: <code>echo "Day 2: found berries" &gt;&gt; camp/diary.txt</code>`,anat:[['echo','cmd'],['"Day 2: found berries"','arg'],['>>','op'],['camp/diary.txt','arg']],answer:'echo "Day 2: found berries" >> camp/diary.txt',
  explain:`<code>&gt;&gt;</code> <b>appends</b>: it adds a line to the end of the file and keeps what was there. One arrow replaces. Two arrows add.`,check:c=>c.read('~/camp/diary.txt').split('\n').filter(Boolean).length>=2},
 {title:'Read your diary',goal:`Check both entries are there: <code>cat camp/diary.txt</code>`,anat:[['cat','cmd'],['camp/diary.txt','arg']],answer:'cat camp/diary.txt',
  explain:`See only one line? Then the second echo used <code>&gt;</code> and replaced Day 1. Go back one mission and use <code>&gt;&gt;</code>.`,check:c=>c.ran('cat',e=>e.args.some(x=>x.includes('diary')))},
 {title:'Stack folders',goal:`Create three nested folders in one go: <code>mkdir -p camp/supplies/food</code>`,anat:[['mkdir','cmd'],['-p','opt'],['camp/supplies/food','arg']],answer:'mkdir -p camp/supplies/food',
  explain:`Without <code>-p</code>, mkdir refuses because <code>supplies</code> doesn't exist yet. <code>-p</code> (parents) creates every missing folder along the path. Try it without <code>-p</code> first to see the error.`,check:c=>c.isDir('~/camp/supplies/food')}
 ]},
{name:'Copy, move, delete',badge:'Mover',intro:'Rearrange your world. These commands do most everyday file work.',
 learned:['cp','mv','rm','cp -r','rm -r','rmdir'],
 setup(){ensureDir('~/camp/supplies/food');ensureFile('~/camp/tent.txt','');ensureFile('~/readme.txt',README);ensureDir('~/village');ensureDir('~/forest/cave')},
 missions:[
 {title:'Make a copy',goal:`<code>cp readme.txt camp/readme_copy.txt</code>`,anat:[['cp','cmd'],['readme.txt','arg'],['camp/readme_copy.txt','arg']],answer:'cp readme.txt camp/readme_copy.txt',
  explain:`cp means <b>copy</b>. The first argument is the <b>source</b> (what to copy). The last is the <b>destination</b> (where the copy goes). The original stays put.`,check:c=>c.isFile('~/camp/readme_copy.txt')},
 {title:'Rename the tent',goal:`<code>mv camp/tent.txt camp/big_tent.txt</code>`,anat:[['mv','cmd'],['camp/tent.txt','arg'],['camp/big_tent.txt','arg']],answer:'mv camp/tent.txt camp/big_tent.txt',
  explain:`mv means <b>move</b>. Bash has no separate rename command: moving a file to a new name in the same folder renames it. The old name is gone.`,check:c=>c.isFile('~/camp/big_tent.txt')&&!c.has('~/camp/tent.txt')},
 {title:'Move it to the village',goal:`<code>mv camp/big_tent.txt village/</code>`,anat:[['mv','cmd'],['camp/big_tent.txt','arg'],['village/','arg']],answer:'mv camp/big_tent.txt village/',
  explain:`When the destination is an existing folder, mv drops the file inside it and keeps its name. Watch it jump across the map.`,check:c=>c.isFile('~/village/big_tent.txt')},
 {title:'Delete the copy',goal:`<code>rm camp/readme_copy.txt</code>`,anat:[['rm','cmd'],['camp/readme_copy.txt','arg']],answer:'rm camp/readme_copy.txt',
  explain:`rm <b>removes</b> files. The terminal has no trash can: deleted means gone. Read the command twice before you press Enter.`,check:c=>!c.has('~/camp/readme_copy.txt')&&c.ran('rm')},
 {title:'Back up the forest',goal:`<code>cp -r forest forest_backup</code>`,anat:[['cp','cmd'],['-r','opt'],['forest','arg'],['forest_backup','arg']],answer:'cp -r forest forest_backup',
  explain:`Copying a folder needs <code>-r</code> (recursive): copy the folder, everything inside it, everything inside that, all the way down. Try it without <code>-r</code> to see the error.`,check:c=>c.isDir('~/forest_backup/cave')},
 {title:'Remove the backup',goal:`<code>rm -r forest_backup</code>`,anat:[['rm','cmd'],['-r','opt'],['forest_backup','arg']],answer:'rm -r forest_backup',
  explain:`Deleting a folder needs <code>-r</code> too. Online you'll often see <code>rm -rf</code>: <code>-f</code> (force) skips every warning. That is the most dangerous combination in bash, so use it rarely.`,check:c=>!c.has('~/forest_backup')&&c.ran('rm')},
 {title:'Remove an empty folder',goal:`<code>rmdir camp/supplies/food</code>`,anat:[['rmdir','cmd'],['camp/supplies/food','arg']],answer:'rmdir camp/supplies/food',
  explain:`rmdir only removes <b>empty</b> folders. If anything is inside, it refuses. That makes it the safe way to tidy up.`,check:c=>!c.has('~/camp/supplies/food')}
 ]},
{name:'Read files',badge:'Reader',intro:'Real files can be thousands of lines long. These commands show just the part you need.',
 learned:['head','tail -n','wc -l','grep','grep -i','grep -n'],setup(){ensureFile('~/journal.txt',JOURNAL)},
 missions:[
 {title:'Open the journal',goal:`From home: <code>cat journal.txt</code>`,anat:[['cat','cmd'],['journal.txt','arg']],answer:'cat journal.txt',
  explain:`That's 30 lines in one burst. With a big file, cat scrolls right past the part you wanted. The next missions fix that.`,check:c=>c.ran('cat',e=>e.args.some(x=>x.includes('journal')))},
 {title:'Read the beginning',goal:`<code>head journal.txt</code>`,anat:[['head','cmd'],['journal.txt','arg']],answer:'head journal.txt',
  explain:`head shows the first 10 lines of a file.`,check:c=>c.ran('head')},
 {title:'Read the ending',goal:`<code>tail -n 3 journal.txt</code>`,anat:[['tail','cmd'],['-n 3','opt'],['journal.txt','arg']],answer:'tail -n 3 journal.txt',
  explain:`tail shows the last lines. <code>-n 3</code> is an option that takes a value: how many lines you want. head understands <code>-n</code> too.`,check:c=>c.ran('tail',e=>/(^| )(-n ?3|-3)( |$)/.test(e.args.join(' ')))},
 {title:'Count the lines',goal:`<code>wc -l journal.txt</code>`,anat:[['wc','cmd'],['-l','opt'],['journal.txt','arg']],answer:'wc -l journal.txt',
  explain:`wc means <b>word count</b>, but it counts more than words. On its own it prints lines, words and characters. <code>-l</code> asks for lines only.`,check:c=>c.ran('wc',e=>c.flag(e,'l'))},
 {title:'Search for wolves',goal:`<code>grep wolf journal.txt</code>`,anat:[['grep','cmd'],['wolf','arg'],['journal.txt','arg']],answer:'grep wolf journal.txt',
  explain:`grep searches inside text and prints only the lines that match, with the match highlighted. Count how many lines you get.`,check:c=>c.ran('grep',e=>e.args.some(x=>x.toLowerCase()==='wolf'))},
 {title:'Ignore upper and lower case',goal:`<code>grep -i wolf journal.txt</code>`,anat:[['grep','cmd'],['-i','opt'],['wolf','arg'],['journal.txt','arg']],answer:'grep -i wolf journal.txt',
  explain:`grep is <b>case-sensitive</b>: wolf, Wolf and WOLF are different words to it. <code>-i</code> ignores case. You should find twice as many lines now.`,check:c=>c.ran('grep',e=>c.flag(e,'i'))},
 {title:'Find the line numbers',goal:`<code>grep -n map journal.txt</code>`,anat:[['grep','cmd'],['-n','opt'],['map','arg'],['journal.txt','arg']],answer:'grep -n map journal.txt',
  explain:`<code>-n</code> puts the line number in front of each match. Options combine: <code>grep -in map journal.txt</code> does both at once.`,check:c=>c.ran('grep',e=>c.flag(e,'n'))}
 ]},
{name:'Pipes',badge:'Plumber',intro:'The real power of bash: connect small commands so the output of one becomes the input of the next.',
 learned:['|','sort','uniq','uniq -c','> with any command'],setup(){ensureFile('~/journal.txt',JOURNAL);ensureFile('~/village/people.txt',PEOPLE)},
 missions:[
 {title:'Meet the villagers',goal:`<code>cat village/people.txt</code>`,anat:[['cat','cmd'],['village/people.txt','arg']],answer:'cat village/people.txt',
  explain:`A list of names. Some repeat, and nothing is in order. Let's clean it up.`,check:c=>c.ran('cat',e=>e.args.some(x=>x.includes('people')))},
 {title:'Your first pipe',goal:`<code>cat village/people.txt | sort</code>`,anat:[['cat','cmd'],['village/people.txt','arg'],['|','op'],['sort','cmd']],answer:'cat village/people.txt | sort',
  explain:`The <b>pipe</b> <code>|</code> takes what the left command prints and feeds it to the right command. Picture a conveyor belt between two machines. sort puts the lines in alphabetical order.`,check:c=>c.ran('sort',e=>e.piped)},
 {title:'Remove duplicates',goal:`<code>sort village/people.txt | uniq</code>`,anat:[['sort','cmd'],['village/people.txt','arg'],['|','op'],['uniq','cmd']],answer:'sort village/people.txt | uniq',
  explain:`uniq removes repeated lines, but only when the copies sit right next to each other. That's why you sort first. Run <code>uniq village/people.txt</code> alone to see the difference.`,check:c=>c.ran('uniq',e=>e.piped)},
 {title:'Count each name',goal:`<code>sort village/people.txt | uniq -c</code>`,anat:[['sort','cmd'],['village/people.txt','arg'],['|','op'],['uniq','cmd'],['-c','opt']],answer:'sort village/people.txt | uniq -c',
  explain:`<code>-c</code> counts how many times each line appeared. Which name is the most common? Add <code>| sort -n</code> on the end to rank them.`,check:c=>c.ran('uniq',e=>c.flag(e,'c'))},
 {title:'Count the wolves',goal:`<code>grep -i wolf journal.txt | wc -l</code>`,anat:[['grep','cmd'],['-i','opt'],['wolf','arg'],['journal.txt','arg'],['|','op'],['wc','cmd'],['-l','opt']],answer:'grep -i wolf journal.txt | wc -l',
  explain:`Search, then count. grep finds the lines, wc -l counts them. Small tools chained together answer real questions.`,check:c=>c.ran('wc',e=>e.piped)&&c.ran('grep')},
 {title:'Save any output',goal:`From home: <code>ls &gt; listing.txt</code>`,anat:[['ls','cmd'],['>','op'],['listing.txt','arg']],answer:'ls > listing.txt',
  explain:`<code>&gt;</code> works with every command, not just echo. Run <code>cat listing.txt</code> afterwards: listing.txt is in its own list, because bash creates the file before ls runs.`,check:c=>c.isFile('~/listing.txt')&&c.read('~/listing.txt').length>0},
 {title:'Save a search',goal:`<code>grep -i wolf journal.txt &gt; wolves.txt</code>`,anat:[['grep','cmd'],['-i','opt'],['wolf','arg'],['journal.txt','arg'],['>','op'],['wolves.txt','arg']],answer:'grep -i wolf journal.txt > wolves.txt',
  explain:`Now you have a file of only the wolf sightings. Check it with <code>cat wolves.txt</code>.`,check:c=>/wolf/i.test(c.read('~/wolves.txt'))}
 ]},
{name:'Wildcards & search',badge:'Tracker',intro:'Work with many files at once, and find anything, anywhere.',
 learned:['*','?','find -name','find -type','&&'],
 setup(){for(const k in LOGS)ensureFile('~/village/logs/'+k,LOGS[k]);ensureFile('~/forest/cave/deeper/chest/gold.txt',GOLD);ensureFile('~/readme.txt',README);ensureFile('~/journal.txt',JOURNAL)},
 missions:[
 {title:'Match with a star',goal:`<code>ls village/logs/*.log</code>`,anat:[['ls','cmd'],['village/logs/*.log','arg']],answer:'ls village/logs/*.log',
  explain:`<code>*</code> is a <b>wildcard</b> that matches any run of characters. <code>*.log</code> means every name ending in .log. notes.txt doesn't match, so it is left out.`,check:c=>c.ran('ls',e=>e.globbed)},
 {title:'See what the star becomes',goal:`<code>echo village/logs/*.log</code>`,anat:[['echo','cmd'],['village/logs/*.log','arg']],answer:'echo village/logs/*.log',
  explain:`The shell swaps the wildcard for the list of matching names <b>before</b> the command runs. echo prints what it receives, so you see the swap. <code>?</code> matches exactly one character: try <code>echo village/logs/day?.log</code>.`,check:c=>c.ran('echo',e=>e.globbed)},
 {title:'Find every text file',goal:`From home: <code>find . -name "*.txt"</code>`,anat:[['find','cmd'],['.','arg'],['-name','opt'],['"*.txt"','arg']],answer:'find . -name "*.txt"',
  explain:`find walks through a folder and every folder inside it. <code>.</code> means start here. Quote the pattern so the star reaches find instead of being expanded by the shell first.`,check:c=>c.ran('find',e=>e.args.includes('-name')||e.args.includes('-iname'))},
 {title:'Find only folders',goal:`<code>find . -type d</code>`,anat:[['find','cmd'],['.','arg'],['-type d','opt']],answer:'find . -type d',
  explain:`<code>-type d</code> keeps only directories. <code>-type f</code> keeps only files. Compare the result with the map.`,check:c=>c.ran('find',e=>e.args.includes('-type'))},
 {title:'Treasure hunt',goal:`A file named <code>gold.txt</code> is hidden somewhere in your world. Find it, then read it with cat.`,anat:[['find','cmd'],['.','arg'],['-name','opt'],['gold.txt','arg']],answer:'find . -name gold.txt',
  hint:`From home, run <code>find . -name gold.txt</code>. It prints the path. Then type <code>cat</code>, a space, and that path. Use <kbd>Tab</kbd> to save typing.`,
  explain:`Two steps, two commands: find tells you <b>where</b>, cat shows you <b>what</b>. Reading the secret word completes the mission.`,check:c=>c.ran('cat',e=>/PENGUIN/.test(e.out))},
 {title:'Clear old logs',goal:`<code>rm village/logs/*.log</code>`,anat:[['rm','cmd'],['village/logs/*.log','arg']],answer:'rm village/logs/*.log',
  explain:`Wildcards make bulk work fast, and bulk mistakes fast too. A good habit: run <code>ls</code> with the same pattern first, check the list, then swap ls for rm.`,
  check:c=>{const n=c.node('~/village/logs');return c.ran('rm')&&(!n||n.type!=='dir'||!Object.keys(n.children).some(k=>k.endsWith('.log')))}},
 {title:'Chain with &&',goal:`From home: <code>mkdir -p backup &amp;&amp; cp *.txt backup/</code>`,anat:[['mkdir','cmd'],['-p','opt'],['backup','arg'],['&&','op'],['cp','cmd'],['*.txt','arg'],['backup/','arg']],answer:'mkdir -p backup && cp *.txt backup/',
  explain:`<code>&amp;&amp;</code> runs the second command only if the first one worked. Here: make the folder, and only then copy every .txt file from home into it.`,
  check:c=>{const n=c.node('~/backup');return !!n&&n.type==='dir'&&Object.keys(n.children).filter(k=>k.endsWith('.txt')).length>=2}}
 ]},
{name:'Your first script',badge:'Scripter',intro:'A script is a file full of commands that bash runs for you, top to bottom. This is where bash turns into programming.',
 learned:['NAME=value','$NAME','chmod +x','./script.sh','for loops'],setup(){ensureDir('~/camp')},
 missions:[
 {title:'Store a value',goal:`<code>NAME="Ada"</code>`,anat:[['NAME','var'],['=','op'],['"Ada"','arg']],answer:'NAME="Ada"',
  explain:`A <b>variable</b> stores a value under a name. No spaces around the <code>=</code>. <code>NAME = "Ada"</code> fails, because bash thinks NAME is a command.`,check:c=>c.ran('(assign)')},
 {title:'Use the value',goal:`<code>echo "Hello, $NAME"</code>`,anat:[['echo','cmd'],['"Hello, $NAME"','arg']],answer:'echo "Hello, $NAME"',
  explain:`A <code>$</code> in front of a name reads the variable: bash swaps <code>$NAME</code> for its value before echo runs. Bash has built-in variables too. Try <code>echo $HOME</code> and <code>echo $USER</code>.`,check:c=>c.ran('echo')&&c.line.includes('$')},
 {title:'Write a script',goal:`From home: <code>echo 'echo "Packing for the trip..."' &gt; pack.sh</code>`,anat:[['echo','cmd'],[`'echo "Packing for the trip..."'`,'arg'],['>','op'],['pack.sh','arg']],answer:`echo 'echo "Packing for the trip..."' > pack.sh`,
  explain:`A script is a plain text file of commands. Single quotes keep everything inside exactly as typed, so a whole echo command, double quotes and all, lands in the file. Check it with <code>cat pack.sh</code>.`,check:c=>/echo/.test(c.read('~/pack.sh'))},
 {title:'Add a second command',goal:`<code>echo 'ls camp' &gt;&gt; pack.sh</code>`,anat:[['echo','cmd'],[`'ls camp'`,'arg'],['>>','op'],['pack.sh','arg']],answer:`echo 'ls camp' >> pack.sh`,
  explain:`Each line of the file is one command. Your script now prints a message, then lists the camp folder.`,check:c=>c.read('~/pack.sh').split('\n').filter(Boolean).length>=2},
 {title:'Try to run it',goal:`<code>./pack.sh</code>`,anat:[['./pack.sh','cmd']],answer:'./pack.sh',
  explain:`<code>./</code> means <b>the file right here, in this folder</b>. Expect an error this time. Read it: bash errors tell you what went wrong.`,check:c=>c.log.some(e=>e.name.endsWith('pack.sh'))},
 {title:'Make it runnable',goal:`<code>chmod +x pack.sh</code>`,anat:[['chmod','cmd'],['+x','opt'],['pack.sh','arg']],answer:'chmod +x pack.sh',
  explain:`<b>Permission denied</b> means the file isn't marked as a program. chmod changes permissions, and <code>+x</code> adds permission to <b>execute</b>. Run <code>ls -l</code> afterwards and spot the x's. The map shows an x badge too.`,check:c=>{const n=c.node('~/pack.sh');return !!n&&!!n.exec}},
 {title:'Run your script',goal:`<code>./pack.sh</code>`,anat:[['./pack.sh','cmd']],answer:'./pack.sh',
  explain:`Bash reads the file line by line and runs each command, as if you typed them. Anything you can type, you can put in a script.`,check:c=>c.log.some(e=>e.name.endsWith('pack.sh')&&e.code===0)},
 {title:'Repeat with a loop',goal:`<code>for c in red green blue; do echo "color: $c"; done</code>`,anat:[['for','kw'],['c','var'],['in red green blue;','arg'],['do echo "color: $c";','cmd'],['done','kw']],answer:'for c in red green blue; do echo "color: $c"; done',
  explain:`A <b>for loop</b> runs the commands between <code>do</code> and <code>done</code> once per item. Each time round, <code>$c</code> holds the next item. Semicolons separate the parts when it's all on one line.`,check:c=>c.ran('for')},
 {title:'Loop over files',goal:`From home: <code>for f in *.txt; do echo "Found $f"; done</code>`,anat:[['for','kw'],['f','var'],['in *.txt;','arg'],['do echo "Found $f";','cmd'],['done','kw']],answer:'for f in *.txt; do echo "Found $f"; done',
  explain:`Loops plus wildcards: do something to every matching file. Swap echo for <code>wc -l $f</code> or <code>cp $f backup/</code> and you have real automation.`,check:c=>c.ran('for',e=>e.globbed)}
 ]}
];

const GUIDE=[
 {c:'pwd',ch:0,what:'Print the full path of the folder you are in.',syn:[['pwd','cmd']],ex:[['pwd','prints /home/explorer']]},
 {c:'ls',ch:0,what:'List what is inside a folder. -a includes hidden files, -l shows details like permissions and size.',syn:[['ls','cmd'],['-a -l','opt'],['folder','arg']],ex:[['ls',''],['ls -a','include hidden files'],['ls -l forest','details for another folder']]},
 {c:'cd',ch:0,what:'Change directory: move into another folder.',syn:[['cd','cmd'],['folder','arg']],ex:[['cd forest','go in'],['cd ..','up one level'],['cd ~','home'],['cd -','back to the previous folder']]},
 {c:'cat',ch:0,what:'Print the contents of one or more files.',syn:[['cat','cmd'],['file','arg']],ex:[['cat readme.txt',''],['cat .secret_map','hidden files work too']]},
 {c:'mkdir',ch:1,what:'Make a new folder. -p also creates any missing folders along the path.',syn:[['mkdir','cmd'],['-p','opt'],['folder','arg']],ex:[['mkdir camp',''],['mkdir -p a/b/c','three levels at once']]},
 {c:'touch',ch:1,what:'Create an empty file, or update the time on one that exists.',syn:[['touch','cmd'],['file','arg']],ex:[['touch notes.txt','']]},
 {c:'echo',ch:1,what:'Print text. With > or >> it writes text into files.',syn:[['echo','cmd'],['text','arg']],ex:[['echo "hi there"',''],['echo $HOME','print a variable']]},
 {c:'> and >>',ch:1,what:'Redirect output into a file. > replaces the file\'s contents, >> adds to the end.',syn:[['command','cmd'],['>','op'],['file','arg']],ex:[['echo "first" > list.txt','create or replace'],['echo "second" >> list.txt','append']]},
 {c:'cp',ch:2,what:'Copy files. -r copies folders and everything inside them.',syn:[['cp','cmd'],['-r','opt'],['source','arg'],['destination','arg']],ex:[['cp readme.txt copy.txt',''],['cp -r forest forest_backup','copy a folder']]},
 {c:'mv',ch:2,what:'Move or rename files and folders.',syn:[['mv','cmd'],['source','arg'],['destination','arg']],ex:[['mv copy.txt notes.txt','rename'],['mv notes.txt village/','move into a folder']]},
 {c:'rm',ch:2,what:'Remove files for good. -r removes folders and everything in them. There is no undo.',syn:[['rm','cmd'],['-r','opt'],['target','arg']],ex:[['rm notes.txt',''],['rm -r forest_backup','a whole folder']]},
 {c:'rmdir',ch:2,what:'Remove an empty folder. Refuses if anything is inside.',syn:[['rmdir','cmd'],['folder','arg']],ex:[['rmdir camp/supplies','']]},
 {c:'head',ch:3,what:'Show the first lines of a file, 10 by default.',syn:[['head','cmd'],['-n 5','opt'],['file','arg']],ex:[['head journal.txt',''],['head -n 3 journal.txt','']]},
 {c:'tail',ch:3,what:'Show the last lines of a file, 10 by default.',syn:[['tail','cmd'],['-n 5','opt'],['file','arg']],ex:[['tail journal.txt',''],['tail -n 3 journal.txt','']]},
 {c:'wc',ch:3,what:'Count lines, words and characters. -l counts lines only.',syn:[['wc','cmd'],['-l','opt'],['file','arg']],ex:[['wc journal.txt',''],['wc -l journal.txt','']]},
 {c:'grep',ch:3,what:'Print lines that contain a pattern. -i ignores case, -n adds line numbers, -c counts, -v shows lines that do NOT match.',syn:[['grep','cmd'],['-i','opt'],['pattern','arg'],['file','arg']],ex:[['grep wolf journal.txt',''],['grep -in map journal.txt','ignore case, numbered'],['grep -v Day journal.txt','lines without "Day"']]},
 {c:'|',ch:4,what:'The pipe. Sends the output of one command into the next one.',syn:[['command','cmd'],['|','op'],['command','cmd']],ex:[['cat journal.txt | grep fire',''],['ls | wc -l','how many items are here']]},
 {c:'sort',ch:4,what:'Sort lines. -r reverses, -n sorts by number value.',syn:[['sort','cmd'],['-r -n','opt'],['file','arg']],ex:[['sort village/people.txt',''],['sort -r village/people.txt','Z to A']]},
 {c:'uniq',ch:4,what:'Collapse repeated lines that sit next to each other. -c counts them. Use it after sort.',syn:[['uniq','cmd'],['-c','opt']],ex:[['sort village/people.txt | uniq -c','']]},
 {c:'* and ?',ch:5,what:'Wildcards. * matches any characters, ? matches exactly one. The shell expands them into matching names.',syn:[['ls','cmd'],['*.txt','arg']],ex:[['ls *.txt',''],['ls village/logs/day?.log','']]},
 {c:'find',ch:5,what:'Search a folder and everything below it. -name matches names, -type f or -type d picks files or folders.',syn:[['find','cmd'],['.','arg'],['-name','opt'],['"*.txt"','arg']],ex:[['find . -name "*.txt"',''],['find . -type d','folders only']]},
 {c:'tree',ch:5,what:'Draw a folder and everything inside as a tree. On a real computer you may need to install it first.',syn:[['tree','cmd'],['folder','arg']],ex:[['tree',''],['tree forest','']]},
 {c:'&&',ch:5,what:'Run the next command only if the previous one succeeded.',syn:[['command','cmd'],['&&','op'],['command','cmd']],ex:[['mkdir -p notes && cd notes','']]},
 {c:'variables',ch:6,what:'Store a value with NAME=value (no spaces) and read it back with $NAME.',syn:[['NAME','var'],['=','op'],['value','arg']],ex:[['NAME="Ada"',''],['echo "Hi $NAME"','']]},
 {c:'chmod',ch:6,what:'Change permissions. +x makes a file executable, so you can run it.',syn:[['chmod','cmd'],['+x','opt'],['file','arg']],ex:[['chmod +x pack.sh','']]},
 {c:'./script',ch:6,what:'Run a script in this folder. bash script.sh runs it even without +x.',syn:[['./pack.sh','cmd']],ex:[['./pack.sh',''],['bash pack.sh','']]},
 {c:'for',ch:6,what:'Repeat commands once for each item in a list.',syn:[['for','kw'],['x','var'],['in a b c;','arg'],['do … ;','cmd'],['done','kw']],ex:[['for n in 1 2 3; do echo $n; done',''],['for f in *.txt; do wc -l $f; done','count lines in each text file']]},
 {c:'history',ch:7,what:'List the commands you typed. Press ↑ to bring the last ones back.',syn:[['history','cmd']],ex:[['history','']]},
 {c:'clear',ch:7,what:'Clear the screen. Ctrl+L does the same.',syn:[['clear','cmd']],ex:[['clear','']]},
 {c:'man',ch:7,what:'Show the manual for a command. On a real computer, press q to leave it.',syn:[['man','cmd'],['command','arg']],ex:[['man grep','']]},
 {c:'help',ch:7,what:'List every command this practice shell knows.',syn:[['help','cmd']],ex:[['help','']]}
];

const QF=[
 ['Show the folder you are in',['pwd']],['List the files here',['ls']],
 ['List files here, including hidden ones',['ls -a','ls -la','ls -al','ls -A']],
 ['Go into the folder "forest"',['cd forest','cd forest/','cd ./forest']],['Go up one folder',['cd ..','cd ../']],
 ['Go to your home folder',['cd','cd ~','cd ~/','cd $HOME']],['Make a folder called "tools"',['mkdir tools']],
 ['Create an empty file called list.txt',['touch list.txt']],['Print the word hi',['echo hi']],
 ['Show what is inside notes.txt',['cat notes.txt']],['Show the first 10 lines of log.txt',['head log.txt','head -n 10 log.txt','head -10 log.txt']],
 ['Show the last 5 lines of log.txt',['tail -n 5 log.txt','tail -5 log.txt','tail -n5 log.txt']],
 ['Count the lines in log.txt',['wc -l log.txt','cat log.txt | wc -l','wc -l < log.txt']],
 ['Show lines in log.txt that contain "error"',['grep error log.txt']],
 ['Same search, ignoring upper/lower case',['grep -i error log.txt']],
 ['Copy a.txt to b.txt',['cp a.txt b.txt']],['Rename old.txt to new.txt',['mv old.txt new.txt']],
 ['Delete the file junk.txt',['rm junk.txt']],['Delete the folder "old" and everything in it',['rm -r old','rm -rf old','rm -R old','rm -fr old']],
 ['Create folders a/b/c in one command',['mkdir -p a/b/c']],['Save the output of ls into files.txt',['ls > files.txt']],
 ['Add the line "done" to the end of todo.txt',['echo done >> todo.txt']],['Make run.sh executable',['chmod +x run.sh','chmod u+x run.sh','chmod 755 run.sh']],
 ['Run the script run.sh in this folder',['./run.sh','bash run.sh','sh run.sh']],
 ['Find every .txt file below this folder',['find . -name *.txt','find -name *.txt']],
 ['Sort the lines of names.txt',['sort names.txt','cat names.txt | sort']],['Clear the screen',['clear']],
 ['List only the .log files here',['ls *.log']],['Set a variable CITY to Paris',['CITY=Paris']],
 ['Print the value of the variable CITY',['echo $CITY','echo ${CITY}']],
 ['Count the repeats in names.txt (sort first)',['sort names.txt | uniq -c','cat names.txt | sort | uniq -c']]
];

/* ---------- UI ---------- */
const $=s=>document.querySelector(s);
const screen=$('#screen'),cmdIn=$('#cmd'),promptEl=$('#prompt'),term=$('#term'),mapEl=$('#map'),missionEl=$('#mission'),chaptersEl=$('#chapters'),crumbsEl=$('#crumbs');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const renderText=t=>esc(t).replace(/\x01(\w)([\s\S]*?)\x02/g,'<span class="c-$1">$2</span>');
const promptHTML=cwd=>`<span class="p-user">explorer@basecamp</span>:<span class="p-path">${esc(disp(cwd))}</span><span class="p-sym">$</span> `;
const KIND={cmd:'command',opt:'option',arg:'argument',op:'operator',var:'variable',kw:'keyword'};
const anatomy=t=>t&&t.length?`<div class="anat" aria-label="Command anatomy">${t.map(([v,k])=>`<div class="tok k-${k}"><b>${esc(v)}</b><span>${KIND[k]}</span></div>`).join('')}</div>`:'';
const ICON_DIR='<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3h4.3l1.6 1.7h7.1v8.8h-13z"/></svg>';
const ICON_FILE='<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/></svg>';
let histIdx=S.hist.length,pop=false;

function addLine(html,cls){const d=document.createElement('div');d.className='line'+(cls?' '+cls:'');d.innerHTML=html;screen.appendChild(d)}
function scrollDown(){term.scrollTop=term.scrollHeight}
function totalDone(i){return CH[i].missions.filter((m,j)=>S.done[i+'.'+j]).length}

function ctxFor(line){const nd=p=>getNode(norm(p,HOME));return {line,cwd:S.cwd,log:LOG,
  ran:(n,p)=>LOG.some(e=>e.name===n&&(!p||p(e))),has:p=>!!nd(p),node:nd,
  isDir:p=>{const n=nd(p);return !!n&&n.type==='dir'},isFile:p=>{const n=nd(p);return !!n&&n.type==='file'},
  read:p=>{const n=nd(p);return n&&n.type==='file'?n.content:''},
  flag:(e,ch)=>e.args.some(x=>/^-[A-Za-z]+$/.test(x)&&x.includes(ch))}}

function checkMission(line){const ch=CH[S.ch];if(S.mi>=ch.missions.length)return;const m=ch.missions[S.mi];let good=false;
  try{good=!!m.check(ctxFor(line))}catch(e){}if(!good)return;
  const key=S.ch+'.'+S.mi,isNew=!S.done[key];S.done[key]=1;if(isNew)S.xp+=10;
  addLine(renderText(`✓ Mission complete: ${m.title}${isNew?'   +10 XP':''}`),'win');
  const next=ch.missions.findIndex((x,j)=>j>S.mi&&!S.done[S.ch+'.'+j]);
  if(next>=0)S.mi=next;
  else{const firstOpen=ch.missions.findIndex((x,j)=>!S.done[S.ch+'.'+j]);
    if(firstOpen>=0)S.mi=firstOpen;
    else{S.mi=ch.missions.length;if(!S.badges[S.ch]){S.badges[S.ch]=1;S.xp+=25;addLine(renderText(`★ Chapter complete! Badge earned: ${ch.badge}   +25 XP`),'win big')}}}
  pop=true}

function run(line){const before=S.cwd;addLine(promptHTML(before)+esc(line));
  if(line.trim()){S.hist.push(line)}histIdx=S.hist.length;LOG=[];changed=new Set();
  if(line.trim()){const r=execLine(line,{});for(const o of r.out){if(o.clear){screen.innerHTML='';continue}addLine(renderText(o.text),o.cls)}S.last=r.code;checkMission(line)}
  renderAll();save();scrollDown()}

function rel(abs){const cw=S.cwd;if(abs===cw)return '.';const a=abs.split('/').filter(Boolean),b=cw.split('/').filter(Boolean);let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;
  const ups=b.length-i;if(ups===0)return a.slice(i).join('/');if(ups<=2)return [...Array(ups).fill('..'),...a.slice(i)].join('/')||'..';return disp(abs)}
function fill(v){cmdIn.value=v;cmdIn.focus();try{cmdIn.setSelectionRange(v.length,v.length)}catch(e){}}

function renderPrompt(){promptEl.innerHTML=promptHTML(S.cwd)}
function renderCrumbs(){const parts=S.cwd.split('/').filter(Boolean);let h='<span class="lbl">You are here:</span><button data-cd="/">/</button>';let p='';
  parts.forEach((s,i)=>{p+='/'+s;h+=`${i?'<span class="sep">/</span>':''}<button data-cd="${esc(p)}">${esc(s)}</button>`});crumbsEl.innerHTML=h}
function renderMap(){
  const node=(name,n,abs)=>{const isDir=n.type==='dir',here=abs===S.cwd;
    const cls=['row',isDir?'d':'f',name.startsWith('.')?'hid':'',here?'here':'',changed.has(abs)?'flash':''].filter(Boolean).join(' ');
    let h=`<li><button class="${cls}" data-path="${esc(abs)}" title="${esc(abs)}">${isDir?ICON_DIR:ICON_FILE}<span class="nm">${esc(name)}${isDir&&abs!=='/'?'/':''}</span>${n.exec?'<span class="tag">x</span>':''}${here?'<span class="pin">YOU</span>':''}</button>`;
    if(isDir){const ks=sortedKeys(n);if(ks.length)h+='<ul class="tree">'+ks.map(k=>node(k,n.children[k],join(abs,k))).join('')+'</ul>'}return h+'</li>'};
  mapEl.innerHTML='<ul class="tree root">'+node('/',S.fs,'/')+'</ul>';
  const here=mapEl.querySelector('.row.here');if(here){const sc=mapEl.closest('.mapscroll');if(sc&&sc.scrollWidth>sc.clientWidth)sc.scrollLeft=Math.max(0,here.offsetLeft-40)}}
function renderChapters(){chaptersEl.innerHTML=CH.map((c,i)=>`<button class="chap${S.badges[i]?' earned':''}" data-ch="${i}" aria-current="${i===S.ch}"><span class="num">${S.badges[i]?'★':i+1}</span><span class="nm">${esc(c.name)}</span><span class="ct">${totalDone(i)}/${c.missions.length}</span></button>`).join('')}
function renderMission(){const ch=CH[S.ch],n=ch.missions.length;
  const dots=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((m,i)=>`<button class="dot${S.done[S.ch+'.'+i]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(m.title)}" aria-label="Mission ${i+1}: ${esc(m.title)}">${i+1}</button>`).join('')}</div>`;
  let h;
  if(S.mi>=n){const all=totalDone(S.ch)===n,last=S.ch===CH.length-1;
    h=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art${all?'':' dim'}">${all?'★':S.ch+1}</div>
    <h2>${last?'You finished Shell Quest':all?'Badge earned: '+esc(ch.badge):'Chapter finished'}</h2>
    <p class="explain">${last?'You can move around a filesystem, build and reorganise it, search inside files, chain commands with pipes, and write scripts with loops. That is the core of everyday bash.':'You can now use these on any real Linux or Mac terminal:'}</p>
    <div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
    ${last?`<p class="note">Next: play Quick-fire until the commands come from memory, then open a real terminal. The field guide shows how on Mac, Windows and Linux.</p><div class="actions"><button class="btn" data-act="tab-fire">Play Quick-fire</button><button class="btn ghost" data-act="tab-guide">Open the field guide</button></div>`
      :`<div class="actions"><button class="btn" data-act="nextch">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button></div>`}${dots}`}
  else{const m=ch.missions[S.mi];const hint=m.hint||`Type exactly this, then press Enter: <code>${esc(m.answer)}</code>`;
    h=`<div class="eyebrow">Chapter ${S.ch+1} · Mission ${S.mi+1} of ${n}${S.done[S.ch+'.'+S.mi]?' · done before':''}</div>
    ${S.mi===0?`<p class="intro">${esc(ch.intro)}</p>`:''}
    <h2>${esc(m.title)}</h2>
    <div class="goal"><div class="label">Your goal</div><p>${m.goal}</p></div>
    ${anatomy(m.anat)}
    <p class="explain">${m.explain}</p>
    ${m.note?`<p class="note">${m.note}</p>`:''}
    <div class="where">Right now you are in <code>${esc(disp(S.cwd))}</code></div>
    <div class="actions"><button class="btn ghost" data-act="hint" aria-expanded="false">Show a hint</button><button class="btn" data-act="fill">Type it for me</button></div>
    <p class="hint" id="hintBox" hidden>${hint}</p>${dots}`}
  missionEl.innerHTML=h;if(pop){missionEl.classList.remove('pop');void missionEl.offsetWidth;missionEl.classList.add('pop');pop=false}}
const RANKS=[[0,'Rookie'],[100,'Apprentice'],[250,'Navigator'],[420,'Operator'],[600,'Shell Wizard']];
function renderXP(){let i=0;while(i+1<RANKS.length&&S.xp>=RANKS[i+1][0])i++;const lo=RANKS[i][0],hi=i+1<RANKS.length?RANKS[i+1][0]:lo;
  $('#rank').textContent=RANKS[i][1];$('#xpText').textContent=S.xp+' XP';$('#xpFill').style.width=(hi>lo?Math.min(100,(S.xp-lo)/(hi-lo)*100):100)+'%'}
function renderAll(){renderPrompt();renderCrumbs();renderMap();renderChapters();renderMission();renderXP()}

function goChapter(i){S.ch=i;const open=CH[i].missions.findIndex((m,j)=>!S.done[i+'.'+j]);S.mi=open<0?CH[i].missions.length:open;
  changed=new Set();CH[i].setup();if(changed.size)addLine(renderText(`(Chapter ${i+1} set up: missing files were put back in place.)`),'sys');renderAll();save();scrollDown()}

/* tab completion */
function complete(){const v=cmdIn.value,pos=cmdIn.selectionStart??v.length,before=v.slice(0,pos),after=v.slice(pos);const word=before.match(/(\S*)$/)[1];
  const first=/^\s*\S*$/.test(before);let cands=[];
  if(first&&!word.includes('/'))cands=Object.keys(CMDS).filter(c=>c.startsWith(word)).map(c=>c+' ');
  else{const idx=word.lastIndexOf('/'),dp=idx>=0?word.slice(0,idx+1):'',b=word.slice(idx+1);const dn=getNode(norm(dp||'.'));
    if(dn&&dn.type==='dir')cands=Object.keys(dn.children).filter(k=>k.startsWith(b)&&(b.startsWith('.')||!k.startsWith('.'))).sort(cmpName).map(k=>dp+k+(dn.children[k].type==='dir'?'/':' '))}
  if(!cands.length)return;
  if(cands.length===1){const nv=before.slice(0,before.length-word.length)+cands[0];cmdIn.value=nv+after;cmdIn.setSelectionRange(nv.length,nv.length);return}
  let pre=cands[0];for(const c of cands)while(!c.startsWith(pre))pre=pre.slice(0,-1);
  if(pre.length>word.length){const nv=before.slice(0,before.length-word.length)+pre;cmdIn.value=nv+after;cmdIn.setSelectionRange(nv.length,nv.length)}
  else{addLine(promptHTML(S.cwd)+esc(v));addLine(esc(cands.map(c=>c.trim().split('/').filter(Boolean).pop()+(c.endsWith('/')?'/':'')).join('  ')));scrollDown()}}

cmdIn.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();const v=cmdIn.value;cmdIn.value='';run(v)}
  else if(e.key==='ArrowUp'){e.preventDefault();if(histIdx>0){histIdx--;fill(S.hist[histIdx]||'')}}
  else if(e.key==='ArrowDown'){e.preventDefault();if(histIdx<S.hist.length){histIdx++;fill(S.hist[histIdx]||'')}}
  else if(e.key==='Tab'){e.preventDefault();complete()}
  else if(e.ctrlKey&&(e.key==='l'||e.key==='L')){e.preventDefault();screen.innerHTML=''}
  else if(e.ctrlKey&&(e.key==='c'||e.key==='C')&&!String(window.getSelection())){e.preventDefault();addLine(promptHTML(S.cwd)+esc(cmdIn.value)+'^C');cmdIn.value='';scrollDown()}});
term.addEventListener('click',()=>{if(!String(window.getSelection()))cmdIn.focus()});
$('#keys').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;cmdIn.focus();
  if(k==='TAB')complete();else if(k==='UP'){if(histIdx>0){histIdx--;fill(S.hist[histIdx]||'')}}else if(k==='ENTER'){const v=cmdIn.value;cmdIn.value='';run(v)}
  else{const p=cmdIn.selectionStart??cmdIn.value.length;cmdIn.value=cmdIn.value.slice(0,p)+k+cmdIn.value.slice(p);cmdIn.setSelectionRange(p+k.length,p+k.length)}});
crumbsEl.addEventListener('click',e=>{const b=e.target.closest('[data-cd]');if(b)fill('cd '+b.dataset.cd)});
mapEl.addEventListener('click',e=>{const b=e.target.closest('[data-path]');if(!b)return;const abs=b.dataset.path,n=getNode(abs);if(!n)return;fill((n.type==='dir'?'cd ':'cat ')+rel(abs))});
chaptersEl.addEventListener('click',e=>{const b=e.target.closest('[data-ch]');if(b)goChapter(+b.dataset.ch)});
missionEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mi!=null){S.mi=+b.dataset.mi;renderMission();save();return}
  const a=b.dataset.act;const m=CH[S.ch].missions[S.mi];
  if(a==='hint'){const h=$('#hintBox');h.hidden=!h.hidden;b.setAttribute('aria-expanded',String(!h.hidden));b.textContent=h.hidden?'Show a hint':'Hide the hint'}
  else if(a==='fill'&&m)fill(m.answer);
  else if(a==='nextch')goChapter(S.ch+1);
  else if(a==='tab-fire')showTab('fire');else if(a==='tab-guide')showTab('guide')});
let armT=null;const rw=$('#resetWorld');
rw.addEventListener('click',()=>{if(!rw.classList.contains('armed')){rw.classList.add('armed');rw.textContent='Click again to reset the world';clearTimeout(armT);armT=setTimeout(()=>{rw.classList.remove('armed');rw.textContent='Reset world'},3500);return}
  clearTimeout(armT);rw.classList.remove('armed');rw.textContent='Reset world';S.fs=makeWorld();S.cwd=HOME;S.oldpwd=HOME;S.vars={};changed=new Set();CH[S.ch].setup();changed=new Set();
  addLine('World reset to its starting state. Your progress and XP are kept.','sys');renderAll();save();scrollDown()});

/* tabs */
function showTab(t){for(const id of ['quest','fire','guide']){$('#tab-'+id).hidden=id!==t;$('#t-'+id).setAttribute('aria-selected',String(id===t))}
  if(t==='quest'&&matchMedia('(pointer:fine)').matches)setTimeout(()=>cmdIn.focus(),0);if(t!=='fire')stopFire(false)}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});

/* quick-fire */
const fStage=$('#fStage');const LEN=75;let QS=null,qT=null;
const normA=s=>s.trim().replace(/\s+/g,' ').replace(/['"]/g,'');
function setStats(){$('#fScore').textContent=QS?QS.score:0;$('#fStreak').textContent=QS?QS.streak:0;$('#fBest').textContent=S.best||0;$('#fTime').textContent=QS?Math.ceil(QS.left):LEN;$('#fTimer').style.width=(QS?QS.left/LEN*100:100)+'%'}
function fireIdle(){fStage.innerHTML=`<div class="example"><div class="label" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Example task</div>
  <div class="task">Show the folder you are in</div><p class="fb" style="margin-top:4px">Answer: <code>pwd</code></p></div>
  <div class="actions"><button class="btn" id="fStart">Start the clock</button></div>`;setStats()}
function startFire(){const order=QF.map((q,i)=>i).sort(()=>Math.random()-.5);QS={order,i:0,score:0,streak:0,left:LEN,misses:[],t0:Date.now()};
  fStage.innerHTML=`<div class="task" id="fTask"></div><div class="fterm"><span class="p-sym" style="color:var(--term-prompt)">$ </span><input id="fIn" aria-label="Your answer" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
  <p class="fb" id="fFb" aria-live="polite"></p><div class="actions"><button class="btn ghost" id="fSkip">Skip</button><button class="btn ghost" id="fStop">End round</button></div>`;
  showQ();$('#fIn').focus();clearInterval(qT);qT=setInterval(()=>{QS.left=Math.max(0,LEN-(Date.now()-QS.t0)/1000);setStats();if(QS.left<=0)stopFire(true)},100)}
function showQ(){if(QS.i>=QS.order.length){QS.order=QS.order.sort(()=>Math.random()-.5);QS.i=0}$('#fTask').textContent=QF[QS.order[QS.i]][0];setStats()}
function answer(v,skip){const q=QF[QS.order[QS.i]];const good=!skip&&q[1].some(x=>normA(x)===normA(v));const fb=$('#fFb');
  if(good){QS.score+=10+Math.min(QS.streak,5)*2;QS.streak++;fb.className='fb good';fb.textContent=`Correct${QS.streak>1?` · streak ${QS.streak}`:''}`}
  else{QS.streak=0;QS.misses.push([q[0],q[1][0],v]);fb.className='fb bad';fb.innerHTML=`${skip?'Skipped':'Not quite'}. One answer: <code>${esc(q[1][0])}</code>`}
  QS.i++;showQ();const inp=$('#fIn');inp.value='';inp.focus()}
function stopFire(show){clearInterval(qT);if(!QS)return;const R=QS;QS=null;if(R.score>(S.best||0)){S.best=R.score;save()}
  if(!show){fireIdle();return}
  fStage.innerHTML=`<div class="task">Time! You scored ${R.score}.</div><p class="fb">${R.score>=S.best&&R.score>0?'That is your best score so far.':`Your best is ${S.best}.`}</p>
  ${R.misses.length?`<div><div class="label" style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Review what you missed</div><ul class="misses">${R.misses.map(([q,a,v])=>`<li><span>${esc(q)}</span><code>${esc(a)}</code>${v?`<span style="color:var(--muted)">you typed <code>${esc(v)}</code></span>`:''}</li>`).join('')}</ul></div>`:'<p>No misses. Clean round.</p>'}
  <div class="actions"><button class="btn" id="fStart">Play again</button></div>`;setStats()}
fStage.addEventListener('click',e=>{const id=e.target.id;if(id==='fStart')startFire();else if(id==='fSkip'&&QS)answer('',true);else if(id==='fStop')stopFire(true)});
fStage.addEventListener('keydown',e=>{if(e.target.id==='fIn'&&e.key==='Enter'&&QS){e.preventDefault();const v=e.target.value;if(v.trim())answer(v,false)}});

/* guide */
function renderGuide(){const groups=CH.map(c=>c.name).concat(['Handy extras']);
  const ex=g=>`<div class="ex">${g.ex.map(([c,n])=>`<div class="exrow"><code>${esc(c)}</code>${n?`<small>${esc(n)}</small>`:''}<button class="try" data-try="${esc(c)}">Try</button></div>`).join('')}</div>`;
  $('#guide').innerHTML=`<div><h2>Field guide</h2><p class="lede">Everything from the quest in one place. Press Try on any example to drop it into the practice terminal.</p></div>
  <section class="gsec"><h3>How to read a command</h3><div class="panel bigan">${anatomy([['grep','cmd'],['-i','opt'],['wolf','arg'],['journal.txt','arg'],['|','op'],['wc','cmd'],['-l','opt']])}
   <p class="explain" style="margin-top:12px">The <b>command</b> comes first and says what to do. <b>Options</b> start with a dash and change how it behaves. <b>Arguments</b> are the things it works on, usually files or folders. <b>Operators</b> like <code>|</code>, <code>&gt;</code> and <code>&amp;&amp;</code> connect commands. Spaces separate everything, so put quotes around text that contains spaces.</p></div></section>
  <section class="gsec"><h3>Paths in one table</h3><div class="panel paths">
   <code>/</code><span>The root. Every path on the system starts here.</span>
   <code>~</code><span>Your home folder. Here that is /home/explorer.</span>
   <code>.</code><span>The folder you are in right now.</span>
   <code>..</code><span>The folder one level up.</span>
   <code>/home/explorer/forest</code><span>An <b>absolute</b> path. Starts with / and works from anywhere.</span>
   <code>forest/cave</code><span>A <b>relative</b> path. Starts from where you are.</span></div></section>
  <section class="gsec"><h3>Safety rules</h3><ol class="panel rules">
   <li><code>rm</code> has no undo and no trash can. Read the command before you press Enter.</li>
   <li>Before deleting with a wildcard, run <code>ls</code> with the same pattern and check the list.</li>
   <li>Don't paste commands from the internet that you don't understand, especially ones with <code>sudo</code> or <code>rm -rf</code>.</li>
   <li><kbd>Ctrl</kbd>+<kbd>C</kbd> stops a command that is running. <kbd>q</kbd> exits man pages and other viewers.</li>
   <li>Lost? <code>pwd</code> tells you where you are and <code>cd ~</code> takes you home.</li></ol></section>
  ${groups.map((gname,gi)=>{const items=GUIDE.filter(g=>g.ch===gi);return items.length?`<section class="gsec"><h3>${gi<CH.length?`Chapter ${gi+1}: `:''}${esc(gname)}</h3><div class="cards">${items.map(g=>`<article class="card panel"><h4>${esc(g.c)}</h4><p>${esc(g.what)}</p>${anatomy(g.syn)}${ex(g)}</article>`).join('')}</div></section>`:''}).join('')}
  <section class="gsec"><h3>Open a real terminal</h3><div class="os">
   <article class="card panel"><h4>Mac</h4><p>Press <kbd>Cmd</kbd>+<kbd>Space</kbd>, type Terminal, press Enter. Macs use zsh by default, a close cousin of bash. Every command in this course works the same there.</p></article>
   <article class="card panel"><h4>Windows</h4><p>Install WSL: open PowerShell as administrator, run <code>wsl --install</code>, restart, then open Ubuntu from the Start menu. Git Bash is a lighter alternative.</p></article>
   <article class="card panel"><h4>Linux</h4><p>Press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> on most distributions, or find Terminal in your app menu.</p></article>
   <article class="card panel"><h4>First steps there</h4><p>Make a safe playground before experimenting: <code>mkdir ~/playground &amp;&amp; cd ~/playground</code>. Then rerun your favourite missions on real files.</p></article></div></section>
  <section class="gsec"><h3>After this course</h3><div class="panel" style="padding:14px 16px"><p class="explain">Good next topics, roughly in order: editing files with <code>nano</code>, <code>if</code> statements and exit codes, functions in scripts, reading <code>man</code> pages, permissions in depth (<code>ls -l</code> and <code>chmod 755</code>), and then tools that run on top of bash, like <code>git</code> and <code>ssh</code>.</p>
   <div class="actions" style="margin-top:12px"><button class="linkbtn" id="resetProgress">Reset all progress</button></div></div></section>`}
let armP=null;
$('#guide').addEventListener('click',e=>{const t=e.target.closest('[data-try]');if(t){showTab('quest');fill(t.dataset.try);return}
  if(e.target.id==='resetProgress'){const b=e.target;if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to erase progress, XP and world';clearTimeout(armP);armP=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset all progress'},3500);return}
    clearTimeout(armP);S=fresh();S.seen=true;screen.innerHTML='';welcome();CH[0].setup();changed=new Set();histIdx=0;renderAll();save();b.classList.remove('armed');b.textContent='Progress reset. Back to chapter 1.';showTab('quest')}});

function welcome(){addLine(renderText('Welcome to Shell Quest, a practice bash shell that runs in your browser.'),'sys');
  addLine('Nothing you type here can touch your real computer, so experiment freely.','sys');
  addLine('Your mission is on the left. Type help to list commands, or man ls to learn about one.','sys');addLine('')}

/* boot */
if(!S.seen){CH[S.ch].setup();S.seen=true}
changed=new Set();
welcome();if(S.hist.length)addLine(renderText(`Welcome back. You are on chapter ${S.ch+1}: ${CH[S.ch].name}.`),'tip');
renderAll();renderGuide();fireIdle();save();
const h=(location.hash||'').slice(1);if(h==='guide'||h==='quickfire'||h==='fire')showTab(h==='guide'?'guide':'fire');
else if(matchMedia('(pointer:fine)').matches)cmdIn.focus({preventScroll:true});
})();
