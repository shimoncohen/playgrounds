(function (SQ) {
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
const S=fresh();
SQ.S=S;
/* S.fns (function name -> body source text) is lazy like S.exp: absent until the first definition, always read as S.fns||{}. It is saved with S. */
SQ.fresh=fresh;
SQ.resetState=next=>{for(const k of Object.keys(S))delete S[k];Object.assign(S,next)};
SQ.rt={log:[],changed:new Set(),steps:0,outChars:0,saveFailed:false,sandboxed:false,onSaveFail:null,frames:[]};
/* Call frames: Frame={name,args,kind:'script'|'function'|'source',locals:Map|null}. frame() is the top one, or the base shell frame.
   locals maps a name to the value it had before `local` (undefined = it was unset); the function's return restores them. */
const BASE_FRAME={name:'bash',args:[],kind:'script',locals:null};
SQ.frame=()=>{const f=SQ.rt.frames;return f.length?f[f.length-1]:BASE_FRAME};
/* Caps that stop runaway commands. TEXT: longest text one command, pipe stage or file may hold. LINES: screen lines per typed line.
   STEPS: command runs plus loop passes per typed line. TOTAL: all command output text per typed line. STATE: most file text the whole world may hold (keeps the save well inside localStorage). */
const LIM={TEXT:1000000,LINES:2000,STEPS:20000,STATE:1500000,PATTERN:200,TOTAL:5000000};
/* Thrown to unwind a runaway line; execLine catches it at the outermost call. e.stop marks it so inner catch blocks rethrow it. */
class StepLimit extends Error{constructor(why){super('this practice shell stopped the command: '+(why||'too many steps'));this.stop=true}}
function step(){if(++SQ.rt.steps>LIM.STEPS)throw new StepLimit()}
/* safeRegex: compile a user regex, or throw an Error with .complex=true when it could hang the browser (catastrophic backtracking).
   Rule: a group that is repeated (* + {n,} {n,m}) must not contain a quantifier (* + ? {..}) at any depth, and must not contain an alternation,
   with one exception: a flat group of plain literal alternatives whose first characters all differ, like (a|b)+ or (cat|dog)*, is safe
   because only one alternative can match at each position. Patterns over LIM.PATTERN characters are refused too. Invalid patterns still throw SyntaxError. */
function regexRisky(src){
  if(src.length>LIM.PATTERN)return true;
  const mk=()=>({q:false,alt:false,lit:true,kids:false,firsts:[],want:true});
  const st=[mk()];let i=0;
  const atom=(f,c,plain)=>{if(f.want){f.firsts.push(plain?c:null);f.want=false}if(!plain)f.lit=false};
  const endAlt=f=>{if(f.want)f.firsts.push(null)};
  while(i<src.length){const c=src[i],f=st[st.length-1];
    if(c==='\\'){atom(f,c,false);i+=2;continue}
    if(c==='['){atom(f,c,false);i++;if(src[i]==='^')i++;if(src[i]===']')i++;while(i<src.length&&src[i]!==']'){if(src[i]==='\\')i++;i++}i++;continue}
    if(c==='('){st.push(mk());i++;
      if(src[i]==='?'){i++;if(src[i]==='<'&&src[i+1]!=='='&&src[i+1]!=='!'){while(i<src.length&&src[i]!=='>')i++;i++}else{if(src[i]==='<')i++;i++}}
      continue}
    if(c===')'){if(st.length===1){i++;continue}
      endAlt(f);st.pop();const par=st[st.length-1];let j=i+1,quant=false;
      if(src[j]==='*'||src[j]==='+')quant=true;else{const m=/^\{\d+,\d*\}/.exec(src.slice(j));if(m)quant=true}
      const flat=f.lit&&!f.kids&&new Set(f.firsts).size===f.firsts.length&&!f.firsts.includes(null);
      if(quant&&(f.q||(f.alt&&!flat)))return true;
      atom(par,c,false);par.kids=true;if(f.q||quant)par.q=true;if(f.alt)par.alt=true;i++;continue}
    if(c==='|'){endAlt(f);f.alt=true;f.want=true;i++;continue}
    if(c==='*'||c==='+'||c==='?'){f.q=true;f.lit=false;i++;continue}
    if(c==='{'){const m=/^\{\d+(,\d*)?\}/.exec(src.slice(i));if(m){f.q=true;f.lit=false;i+=m[0].length;continue}}
    atom(f,c,!/[.^$]/.test(c));i++}
  return false}
function safeRegex(src,flags){if(regexRisky(src)){const e=new Error('pattern too complex for this practice shell');e.complex=true;throw e}return new RegExp(src,flags)}

try{const raw=localStorage.getItem(KEY);if(raw){const o=JSON.parse(raw);if(o&&o.fs)SQ.resetState(Object.assign(fresh(),o))}}catch(e){}
/* A failed save (quota, blocked storage) is no longer silent: SQ.rt.saveFailed is set and the UI is told once through SQ.rt.onSaveFail. */
function save(){if(SQ.rt.sandboxed)return;try{S.hist=S.hist.slice(-200);localStorage.setItem(KEY,JSON.stringify(S));SQ.rt.saveFailed=false}
  catch(e){if(!SQ.rt.saveFailed){SQ.rt.saveFailed=true;if(SQ.rt.onSaveFail)SQ.rt.onSaveFail(e)}}}
function stateText(n){if(!n)return 0;if(n.type==='file')return n.content.length;let t=0;if(n.type==='dir')for(const k of Object.keys(n.children))t+=stateText(n.children[k]);return t}

/* ---------- filesystem ---------- */
function norm(p,base){base=base||S.cwd;if(p==null||p==='')return base;if(p==='~'||p.startsWith('~/'))p=HOME+p.slice(1);
  const parts=p.startsWith('/')?[]:base.split('/').filter(Boolean);
  for(const s of p.split('/')){if(!s||s==='.')continue;if(s==='..')parts.pop();else parts.push(s)}
  return '/'+parts.join('/')}
const MAX_HOPS=20;
/* walk the tree; links in the path are followed, and the final one only when follow is true. Sets walk.loop when too many hops. */
function walk(abs,follow){let parts=abs.split('/').filter(Boolean),hops=0;walk.loop=false;
  let n=S.fs,path='',i=0;
  while(i<parts.length){if(!n||n.type!=='dir')return null;let c=n.children[parts[i]];if(!c)return null;
    if(c.type==='link'&&(follow||i<parts.length-1)){if(++hops>MAX_HOPS){walk.loop=true;return null}
      const t=norm(c.target,path||'/');parts=t.split('/').filter(Boolean).concat(parts.slice(i+1));n=S.fs;path='';i=0;continue}
    path+='/'+parts[i];n=c;i++}
  walk.path=path||'/';return n||null}
function realPath(abs,follow){const n=walk(abs,follow);return n?walk.path:null}
function getNode(abs){return walk(abs,true)}
function lstat(abs){return walk(abs,false)}
function isLoop(abs){walk(abs,true);return walk.loop}
/* where a write to abs lands: follows a link chain even when it dangles */
function writeTarget(abs){for(let h=0;h<=MAX_HOPS;h++){const l=lstat(abs);if(!l||l.type!=='link')return abs;abs=norm(l.target,abs.replace(/\/[^/]*$/,'')||'/')}return null}
const defMode=n=>n.type==='dir'||n.exec?0o755:0o644;
const modeOf=n=>n.type==='link'?0o777:n.mode!=null?n.mode:defMode(n);
function modeString(n){const m=modeOf(n);let s=n.type==='dir'?'d':n.type==='link'?'l':'-';
  for(let i=8;i>=0;i--)s+=(m>>i)&1?'rwx'[(8-i)%3]:'-';return s}
function parentOf(abs){const parts=abs.split('/').filter(Boolean);const name=parts.pop();const pp='/'+parts.join('/');return [getNode(pp),name,pp]}
function bname(abs){return abs.split('/').filter(Boolean).pop()||'/'}
function disp(abs){return abs===HOME?'~':abs.startsWith(HOME+'/')?'~'+abs.slice(HOME.length):abs}
function join(a,b){return (a==='/'?'':a)+'/'+b}
const clone=n=>JSON.parse(JSON.stringify(n));
function markTree(abs,n){SQ.rt.changed.add(abs);if(n.type==='dir')for(const k in n.children)markTree(join(abs,k),n.children[k])}
function mkdirp(abs){let n=S.fs,path='';for(const s of abs.split('/').filter(Boolean)){path+='/'+s;if(!n.children[s]){n.children[s]=D();SQ.rt.changed.add(path)}n=n.children[s];if(n.type!=='dir')return path}return null}
function ensureDir(p){mkdirp(norm(p,HOME))}
function ensureFile(p,c){const abs=norm(p,HOME);if(getNode(abs))return;const [,,pp]=parentOf(abs);if(mkdirp(pp))return;const [par,name]=parentOf(abs);if(par&&par.type==='dir'){par.children[name]=F(c);SQ.rt.changed.add(abs)}}
const isNull=p=>norm(p)==='/dev/null';
function writeFile(abs,text,append,shown){if(abs==='/dev/null')return null;const wt=writeTarget(abs);if(wt===null)return `bash: ${shown}: Too many levels of symbolic links`;abs=wt;const n=getNode(abs);if(n&&n.type==='dir')return `bash: ${shown}: Is a directory`;
  const [par,name]=parentOf(abs);if(!par||par.type!=='dir')return `bash: ${shown}: No such file or directory`;
  const old=n&&n.type==='file'?n.content:'',newLen=append&&old?old.length+1+text.length:text.length,delta=newLen-old.length;
  if(newLen>LIM.TEXT||(delta>1000&&stateText(S.fs)+delta>LIM.STATE))return `bash: ${shown}: file too large for this practice shell`;
  if(n){n.content=append&&n.content?n.content+'\n'+text:text}else par.children[name]=F(text);SQ.rt.changed.add(abs);return null}
const cmpName=(x,y)=>x.replace(/^\./,'').toLowerCase().localeCompare(y.replace(/^\./,'').toLowerCase());
function sortedKeys(n){return Object.keys(n.children).sort((a,b)=>{const da=n.children[a].type==='dir',db=n.children[b].type==='dir';return da!==db?(da?-1:1):cmpName(a,b)})}
Object.assign(SQ,{stateText,LIM,StepLimit,step,safeRegex,regexRisky,HOME,KEY,D,F,README,SECRET,JOURNAL,PEOPLE,GOLD,LOGS,makeWorld,fresh,save,norm,getNode,realPath,lstat,isLoop,modeOf,defMode,modeString,parentOf,bname,disp,join,clone,markTree,mkdirp,ensureDir,ensureFile,writeFile,cmpName,sortedKeys,isNull});
})(window.SQ = window.SQ || {});
