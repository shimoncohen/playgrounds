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
SQ.fresh=fresh;
SQ.resetState=next=>{for(const k of Object.keys(S))delete S[k];Object.assign(S,next)};
SQ.rt={log:[],changed:new Set()};
try{const raw=localStorage.getItem(KEY);if(raw){const o=JSON.parse(raw);if(o&&o.fs)SQ.resetState(Object.assign(fresh(),o))}}catch(e){}
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
function markTree(abs,n){SQ.rt.changed.add(abs);if(n.type==='dir')for(const k in n.children)markTree(join(abs,k),n.children[k])}
function mkdirp(abs){let n=S.fs,path='';for(const s of abs.split('/').filter(Boolean)){path+='/'+s;if(!n.children[s]){n.children[s]=D();SQ.rt.changed.add(path)}n=n.children[s];if(n.type!=='dir')return path}return null}
function ensureDir(p){mkdirp(norm(p,HOME))}
function ensureFile(p,c){const abs=norm(p,HOME);if(getNode(abs))return;const [,,pp]=parentOf(abs);if(mkdirp(pp))return;const [par,name]=parentOf(abs);if(par&&par.type==='dir'){par.children[name]=F(c);SQ.rt.changed.add(abs)}}
function writeFile(abs,text,append,shown){const n=getNode(abs);if(n&&n.type==='dir')return `bash: ${shown}: Is a directory`;
  const [par,name]=parentOf(abs);if(!par||par.type!=='dir')return `bash: ${shown}: No such file or directory`;
  if(n){n.content=append&&n.content?n.content+'\n'+text:text}else par.children[name]=F(text);SQ.rt.changed.add(abs);return null}
const cmpName=(x,y)=>x.replace(/^\./,'').toLowerCase().localeCompare(y.replace(/^\./,'').toLowerCase());
function sortedKeys(n){return Object.keys(n.children).sort((a,b)=>{const da=n.children[a].type==='dir',db=n.children[b].type==='dir';return da!==db?(da?-1:1):cmpName(a,b)})}
Object.assign(SQ,{HOME,KEY,D,F,README,SECRET,JOURNAL,PEOPLE,GOLD,LOGS,makeWorld,fresh,save,norm,getNode,parentOf,bname,disp,join,clone,markTree,mkdirp,ensureDir,ensureFile,writeFile,cmpName,sortedKeys});
})(window.SQ = window.SQ || {});
