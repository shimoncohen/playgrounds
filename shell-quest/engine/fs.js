(function (SQ) {
const HOME='/home/explorer', KEY='shell-quest-v1';
/* children maps have no prototype, so a file named constructor, toString or __proto__ is an ordinary key (a JSON round trip gives plain objects back: fixTree rebuilds them) */
const D=(c={})=>({type:'dir',children:Object.assign(Object.create(null),c)});
function fixTree(n){if(n&&n.type==='dir'&&n.children){const c=Object.create(null);for(const k of Object.keys(n.children)){c[k]=n.children[k];fixTree(c[k])}n.children=c}return n}
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
SQ.resetState=next=>{for(const k of Object.keys(S))delete S[k];fixTree(next&&next.fs);Object.assign(S,next)};
SQ.rt={log:[],changed:new Set(),steps:0,outChars:0,grewBy:0,saveFailed:false,sandboxed:false,onSaveFail:null,frames:[]};
/* Call frames: Frame={name,args,kind:'script'|'function'|'source',locals:Map|null}. frame() is the top one, or the base shell frame.
   locals maps a name to the value it had before `local` (undefined = it was unset); the function's return restores them. */
const BASE_FRAME={name:'bash',args:[],kind:'script',locals:null};
SQ.frame=()=>{const f=SQ.rt.frames;return f.length?f[f.length-1]:BASE_FRAME};
/* Caps that stop runaway commands. TEXT: longest text one command, pipe stage or file may hold. LINES: screen lines per typed line.
   STEPS: command runs plus loop passes per typed line. TOTAL: all command output text per typed line. VAR: longest text one variable may hold. STATE: most file text the whole world may hold (keeps the save well inside localStorage).
   SLEEP: the longest virtual time (seconds) one sleep may ask for (procs.js). */
const LIM={VAR:1000000,TEXT:1000000,LINES:2000,STEPS:20000,STATE:1500000,PATTERN:200,TOTAL:5000000,SLEEP:3600};
/* Thrown to unwind a runaway line; execLine catches it at the outermost call. e.stop marks it so inner catch blocks rethrow it. */
class StepLimit extends Error{constructor(why){super('this practice shell stopped the command: '+(why||'too many steps'));this.stop=true}}
/* The saved-state cap. writeFile checks LIM.STATE itself only for a write that grows the world by more than 1,000 characters (so a small write stays O(1)).
   Every other growth adds its characters to SQ.rt.grewBy (writeFile, markTree for cp); once that passes GROW_CHECK (50,000) writeFile, cp and step()
   call checkState(), which walks the world once (stateText) and, when it is over LIM.STATE, stops the command with a StepLimit. execLine resets grewBy at the start of
   each typed line and calls checkState once more at its end, so a world can pass the cap by about GROW_CHECK plus one write. No rollback: the files written so far stay, as with any stopped command. */
const STATE_MSG='the files in this world grew too large (rm some to free space)',GROW_CHECK=50000;
function checkState(){if(!SQ.rt.grewBy)return;SQ.rt.grewBy=0;if(stateText(S.fs)>LIM.STATE)throw new StepLimit(STATE_MSG)}
const grewCheck=()=>{if(SQ.rt.grewBy>GROW_CHECK)checkState()};
function step(){if(++SQ.rt.steps>LIM.STEPS)throw new StepLimit();grewCheck()}
/* shared helpers: own(o,k) is a safe own-property test (S.vars, S.fns and the command tables are plain objects, so `constructor` or `__proto__` must not
   resolve through the prototype); errOf(e) is the one error line for a caught Error (a JS stack overflow reads like the parser's nesting error, never raw JS text);
   fatalText(e) is the line for an error that escaped to the outermost catch. */
const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
const NEST_DEEP='syntax error: nesting too deep';
const isOverflow=e=>!!e&&((e.name==='RangeError'&&/call stack/i.test(String(e.message)))||/too much recursion/i.test(String(e.message))); /* Chrome/Node, Firefox */
const TOO_BIG='this practice shell stopped the command: a value grew too large';
const isRange=e=>!!e&&e.name==='RangeError'&&!isOverflow(e); /* Invalid string/array length and the like */
const errOf=e=>isOverflow(e)?'bash: '+NEST_DEEP:isRange(e)?TOO_BIG:(e&&e.raw?'':'bash: ')+(e&&typeof e==='object'?e.message:String(e));
const fatalText=e=>e&&e.stop?e.message:isOverflow(e)?'bash: '+NEST_DEEP:isRange(e)?TOO_BIG:'bash: internal error: '+(e&&e.message||e);
/* safeRegex: compile a user regex, or throw an Error with .complex=true when it could hang the browser. Two rules, both deterministic.
   1. Shape (exponential backtracking): a group that is repeated (* + {n,} {n,m}) must not contain a quantifier (* + ? {..}) at any depth, and must not
      contain an alternation, with one exception: a flat group of plain literal alternatives whose first characters all differ, like (a|b)+ or (cat|dog)*,
      is safe because only one alternative can match at each position. Patterns over LIM.PATTERN characters are refused too.
   2. Cost (polynomial backtracking, see "regex cost model" below): JS tries every start position and, at each, every way to share the text between
      quantifiers that can match the same characters, so .*.*.*c costs about n^4/24 on n characters and even a*b is n^2/2. The model walks the pattern
      right to left and bounds the work of one match as a polynomial in the characters left: an unbounded quantifier whose characters can also begin
      what follows it adds what follows once per give-back point (summed over the shrinking rest, which gives the n^k/k! of ordered splits); when they
      cannot overlap (like [^:]*: or [0-9]+\.) the retries fail at once and only add n; when what follows always succeeds (a trailing .*, or .*$ on a
      line without line breaks) it adds nothing; a literal that cannot overlap itself (error) or a character the subject holds only k times (the : of
      .*:.*:.*) lets only that many give-back points pay for what follows. Mandatory passes ({1000}), counted groups whose passes vary (costed pass by
      pass, so (a|a){25} is 2^25) and lookbehinds (costed right to left, as V8 runs them) are included. safeRegex refuses a pattern whose bound passes
      RE_BUDGET already for a 16-character line (the exponential ones); SQ.reGuard(re, subject) refuses a subject too long for the pattern. RE_BUDGET
      is calibrated so the worst accepted case of thousands of fuzzed patterns and adversarial subjects takes under about 100 ms on a fresh
      (interpreted) V8 regex on this machine; ordinary 200-character lines fit four-wildcard patterns like (.*)-(.*)-(.*)-(.*), a*b fits about 4,500
      characters, \bwolf\b, ^[^:]*: and plain words fit any. The work is also charged to the step budget (one step per RE_CHUNK units; a match found
      at index i is charged i+1 attempts), so many lines that each fit cannot add up to a freeze. Invalid patterns still throw SyntaxError. */
function reShapeRisky(src){
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
/* ---- regex cost model ----
   Character sets are sorted lists of [lo, hi] UTF-16 code unit ranges; -1 stands for the end of the subject. Costs are polynomials in r, the number of
   characters left in the subject (arrays of coefficients, lowest first, all >= 0, so each is an upper bound that grows with r). A continuation K
   describes what follows a point in the pattern: F = the characters it can start with (ANY when a zero-width test like \b or a lookaround comes first),
   sure = it always matches at once (only optional items follow), end = it always matches at the end of the subject, f = the most work of one failing
   attempt, s = the extra work of one succeeding attempt beyond the characters it consumes, lit = the plain characters it must start with.
   Weights (work units, calibrated together with RE_BUDGET on first, interpreted V8 runs; a unit is roughly 0.5 ns native, 2 to 2.5 ns interpreted): W_BACK per give-back
   point of a quantifier, W_GRP/W_CAP to enter a group (a capturing one saves and restores its capture), W_PASS/W_PASSCAP per pass of a repeated group,
   W_CNT per pass of a counted quantifier like {2,5}, and W_UNROLL times the work of a counted group costed pass by pass. RE_CHUNK units are one step of
   the step budget (20,000 steps: about 1e9 units, under a second of the worst cumulative regex work). */
const RE_BUDGET=4e7,RE_CHUNK=5e4,RE_EXP_LINE=16,RMAX=0xFFFF;
const W_BACK=3,W_GRP=2,W_CAP=8,W_PASS=8,W_PASSCAP=60,W_CNT=8,W_UNROLL=8,RE_EMPTY_COUNT=1000;
const rsNorm=a=>{a=a.slice().sort((x,y)=>x[0]-y[0]);const o=[];for(const r of a){const l=o[o.length-1];if(l&&r[0]<=l[1]+1){if(r[1]>l[1])l[1]=r[1]}else o.push([r[0],r[1]])}return o};
const rsInv=a=>{const o=[];let lo=0;for(const [x,y] of a){if(y<0)continue;const xx=Math.max(x,0);if(xx>lo)o.push([lo,xx-1]);lo=Math.max(lo,y+1)}if(lo<=RMAX)o.push([lo,RMAX]);return o};
const rsMeets=(a,b)=>{let i=0,j=0;while(i<a.length&&j<b.length){if(a[i][1]<b[j][0])i++;else if(b[j][1]<a[i][0])j++;else return true}return false};
const rsHas=(a,c)=>{for(const [x,y] of a){if(c<x)return false;if(c<=y)return true}return false};
const rsFold=a=>{const o=a.slice();for(const [x,y] of a){
    const up=[Math.max(x,65),Math.min(y,90)],lo=[Math.max(x,97),Math.min(y,122)];
    if(up[0]<=up[1])o.push([up[0]+32,up[1]+32]);if(lo[0]<=lo[1])o.push([lo[0]-32,lo[1]-32]);if(y>=128)o.push([128,RMAX])}
  return rsNorm(o)};
const R_END=[[-1,-1]],R_ANY=[[-1,RMAX]],R_ALL=[[0,RMAX]],R_NL=[[10,10],[13,13],[0x2028,0x2029]],R_D=[[48,57]],R_W=[[48,57],[65,90],[95,95],[97,122]],
  R_S=rsNorm([[9,13],[32,32],[160,160],[0x1680,0x1680],[0x2000,0x200a],[0x2028,0x2029],[0x202f,0x202f],[0x205f,0x205f],[0x3000,0x3000],[0xfeff,0xfeff]]);
const R_CLS={d:R_D,D:rsInv(R_D),w:R_W,W:rsInv(R_W),s:R_S,S:rsInv(R_S)};
const R_ESC={n:10,t:9,r:13,f:12,v:11};
/* parse a pattern that new RegExp already accepted (non-unicode syntax) into alternatives of items */
function reParse(src,fl){let i=0;
  const hex=(k)=>{const h=src.slice(i,i+k);if(h.length===k&&/^[0-9a-fA-F]+$/.test(h)){i+=k;return parseInt(h,16)}return -1};
  const esc=(inCls)=>{const e=src[i++];if(e===undefined)return [[92,92]];
    if(R_CLS[e])return R_CLS[e];
    if(R_ESC[e])return [[R_ESC[e],R_ESC[e]]];
    if(e==='b'&&inCls)return [[8,8]];
    if(e==='x'){const c=hex(2);return c<0?[[120,120]]:[[c,c]]}
    if(e==='u'){if(src[i]==='{'){const k=src.indexOf('}',i);if(k>0){const c=parseInt(src.slice(i+1,k),16);if(c>=0&&c<=RMAX){i=k+1;return [[c,c]]}}}const c=hex(4);return c<0?[[117,117]]:[[c,c]]}
    if(e==='c'&&/[A-Za-z]/.test(src[i]||'')){const c=src.charCodeAt(i++)%32;return [[c,c]]}
    if(e>='0'&&e<='9'){while(/[0-7]/.test(src[i]||'')&&inCls)i++;return inCls||e==='0'?R_ALL:null} /* null: a back-reference */
    const c=e.charCodeAt(0);return [[c,c]]};
  const fold=a=>fl.i?rsFold(a):a;
  const cls=()=>{let neg=false;if(src[i]==='^'){neg=true;i++}const parts=[];
    while(i<src.length&&src[i]!==']'){let a;
      if(src[i]==='\\'){i++;a=esc(true)}else{const c=src.charCodeAt(i++);a=[[c,c]]}
      if(a.length===1&&a[0][0]===a[0][1]&&src[i]==='-'&&src[i+1]!==']'&&i+1<src.length){
        i++;let b;if(src[i]==='\\'){i++;b=esc(true)}else{const c=src.charCodeAt(i++);b=[[c,c]]}
        if(b.length===1&&b[0][0]===b[0][1]&&b[0][0]>=a[0][0])a=[[a[0][0],b[0][0]]];else{parts.push(a,[[45,45]]);a=b}}
      parts.push(a)}
    i++;const u=rsNorm([].concat(...parts));return fold(neg?rsInv(u):u)};
  const alt=()=>{const bs=[seq()];while(src[i]==='|'){i++;bs.push(seq())}return bs};
  const seq=()=>{const it=[];while(i<src.length&&src[i]!=='|'&&src[i]!==')'){const a=atom(),q=quant();if(q)a.q=q;it.push(a)}return it};
  const quant=()=>{const c=src[i];let q=null;
    if(c==='*')q={min:0,max:Infinity};else if(c==='+')q={min:1,max:Infinity};else if(c==='?')q={min:0,max:1};
    else if(c==='{'){const m=/^\{(\d+)(,(\d*))?\}/.exec(src.slice(i,i+40));if(m){q={min:+m[1],max:m[2]?(m[3]===''?Infinity:+m[3]):+m[1],cnt:true};i+=m[0].length-1}}
    if(!q)return null;i++;if(src[i]==='?'){i++;q.lazy=true}return q};
  /* rev: V8 runs a lookbehind from right to left, so its body is costed reversed */
  const rev=bs=>bs.map(s=>s.slice().reverse().map(x=>x.t==='grp'?Object.assign({},x,{b:rev(x.b)}):x));
  /* ovl: the alternatives of a group can start alike (or one is empty or starts with a non-character), so a counted pass may try several */
  const ovl=bs=>{if(bs.length<2)return false;const fs=[];
    for(const s of bs){const x=s[0];if(!x||x.t!=='set'||x.q)return true;for(const f of fs)if(rsMeets(f,x.s))return true;fs.push(x.s)}return false};
  const atom=()=>{const c=src[i++];
    if(c==='('){let t='grp',behind=false;const cap=src[i]!=='?'||(src[i+1]==='<'&&src[i+2]!=='='&&src[i+2]!=='!');
      if(src[i]==='?'){if(src[i+1]===':')i+=2;else if(src[i+1]==='='||src[i+1]==='!'){t='look';i+=2}
        else if(src[i+1]==='<'&&(src[i+2]==='='||src[i+2]==='!')){t='look';behind=true;i+=3}
        else{const k=src.indexOf('>',i);i=k<0?src.length:k+1}}
      let b=alt();i++;const n={t,cap,behind,ml:maxLen(b),mn:minLen(b),ovl:ovl(b)||b.some(s=>s.some(x=>x.t==='grp'&&x.ovl))};n.inner=b.some(s=>s.some(x=>x.q||x.inner));n.b=behind?rev(b):b;return n}
    if(c==='[')return {t:'set',s:cls()};
    if(c==='.')return {t:'set',s:fl.s?R_ALL:rsInv(R_NL)};
    if(c==='^')return {t:'bol'};
    if(c==='$')return {t:'eol'};
    if(c==='\\'){if(src[i]==='b'||src[i]==='B'){i++;return {t:'wb'}}
      if(src[i]==='k'&&src[i+1]==='<'){const k=src.indexOf('>',i);i=k<0?src.length:k+1;return {t:'ref'}}
      const a=esc(false);if(a===null){while(/[0-9]/.test(src[i]||''))i++;return {t:'ref'}}return {t:'set',s:fold(a)}}
    const k=src.charCodeAt(i-1);return {t:'set',s:fold([[k,k]])}};
  const minLen=bs=>{let best=Infinity;for(const s of bs){let t=0;for(const x of s){const r=x.q?x.q.min:1;
      t+=x.t==='set'?r:x.t==='grp'?x.mn*r:0}best=Math.min(best,t)}return best===Infinity?0:best};
  const maxLen=bs=>{let best=0;for(const s of bs){let t=0;for(const x of s){const r=x.q?x.q.max:1;
      t+=x.t==='set'?r:x.t==='grp'?x.ml*r:x.t==='ref'?Infinity:0}best=Math.max(best,t)}return best};
  return alt()}
/* polynomials in r */
const BINOM=[[1]];for(let k=1;k<48;k++){const p=BINOM[k-1],o=[1];for(let j=1;j<k;j++)o.push(p[j-1]+p[j]);o.push(1);BINOM.push(o)}
const PINF=[Infinity];
const pClean=a=>a.length>44||a.some(x=>x===Infinity||x!==x)?PINF:a;
const pAdd=(a,b)=>{const o=[];for(let i=0;i<Math.max(a.length,b.length);i++)o.push((a[i]||0)+(b[i]||0));return pClean(o)};
const pAddC=(a,c)=>pAdd(a,[c]);
const pMax=(a,b)=>{const o=[];for(let i=0;i<Math.max(a.length,b.length);i++)o.push(Math.max(a[i]||0,b[i]||0));return pClean(o)};
const pMul=(a,b)=>{if(a===PINF||b===PINF)return PINF;const o=new Array(a.length+b.length-1).fill(0);
  for(let i=0;i<a.length;i++)if(a[i])for(let j=0;j<b.length;j++)if(b[j])o[i+j]+=a[i]*b[j];return pClean(o)};
/* pSum(a)(r) >= a(0)+a(1)+...+a(r): sum of j^k for j <= r is at most (r+1)^(k+1)/(k+1) */
const pSum=a=>{if(a===PINF)return PINF;const o=new Array(a.length+1).fill(0);
  for(let k=0;k<a.length;k++)if(a[k])for(let j=0;j<=k+1;j++)o[j]+=a[k]*BINOM[k+1][j]/(k+1);return pClean(o)};
const pEv=(a,n)=>{if(a===PINF)return Infinity;let v=0;for(let i=a.length-1;i>=0;i--)v=v*n+a[i];return v};
const K_SURE={F:R_ANY,sure:true,end:true,f:[0],s:[0]},K_NONE={F:[],sure:false,f:[0],s:[0]},K_INF={F:R_ANY,sure:false,f:PINF,s:PINF};
/* reCost(m, n, nlFree, cnt) -> the bound on the work of matching a subject of n characters. nlFree: the subject has no line break. cnt(set): how many
   characters of the subject are in set (only when the subject is known). */
function reCost(m,n,nlFree,cnt,all){let wmax=1;
  const best=ps=>{let b=null,bv=0;for(const p of ps){const v=pEv(p,n);if(b===null||v<bv){b=p;bv=v}}return b};
  /* lit cannot overlap a copy of itself shifted by less than period(lit), so it matches at no more than r/period+1 positions */
  const period=lit=>{const k=lit.length;let d=1;for(;d<k;d++){let ok=true;for(let i=0;i+d<k;i++)if(!rsMeets(lit[i],lit[i+d])){ok=false;break}if(ok)break}return d};
  /* the work of running K at each of L give-back points (L = [count] or [1,1] = r+1): only points where K's leading literal matches pay K.f */
  const T=(Kf,L,lit)=>{const c=[pMul(L,Kf),pSum(Kf)];const k=lit.length;
    if(k>=2){const d=period(lit);if(d>1)c.push(pMul([1,1/d],Kf))}
    if(cnt&&k>=1)c.push(pMul([cnt(lit[0])+1],Kf));
    return best(c)};
  const alt=(bs,K)=>{if(bs.length===1)return seq(bs[0],K);let F=[],sure=false,end=false,f=[0],sm=[0];
    for(const b of bs){const r=seq(b,K);F=F.concat(r.F);sure=sure||r.sure;end=end||!!r.end;f=pAdd(f,r.f);sm=pMax(sm,r.s)}
    return {F:rsNorm(F),sure,end,f,s:pAdd(f,sm)}};
  /* covers(A): A matches every character the subject can hold (with nlFree, a subject without line breaks, . covers it all) */
  const covers=A=>!rsMeets(rsInv(A),nlFree?rsInv(R_NL):R_ALL);
  const seq=(it,K)=>{for(let k=it.length-1;k>=0;k--)K=item(it[k],K);return K};
  /* A repeated atom (first characters A, w = work of one pass) before K */
  const rep=(A,w,q,K,one)=>{
    const L=q.max!==Infinity&&q.max-q.min<1e4?[q.max-q.min+1]:[1,1],F=q.min===0?rsNorm(A.concat(K.F)):A,end=q.min===0&&!!K.end;
    if(q.cnt)w=pAddC(w,W_CNT);if(w.length===1)wmax=Math.max(wmax,w[0]);
    const mand=q.min===0?[0]:q.min<1e4?pMul([q.min],w):pMul([0,1],w); /* the passes it must make */
    if(K.sure)return {F,sure:q.min===0,end,f:pAdd(mand,w),s:K.s};
    if(one&&K.end&&!q.lazy&&q.max===Infinity&&covers(A))return {F,sure:false,end,f:pAdd(mand,w),s:K.s};
    const lit=K.lit||[];
    if(!rsMeets(A,K.F))return {F,sure:false,end,f:pAdd(pAdd(mand,pMul(L,pAddC(w,W_BACK))),K.f),s:K.s};
    const x=pAdd(pAdd(mand,pMul(L,pAddC(w,W_BACK+lit.length))),T(K.f,L,lit));return {F,sure:false,end,f:x,s:pAdd(x,K.s)}};
  const item=(it,K)=>{const q=it.q;if(q&&q.max===0)return K;
    /* a counted atom that can match empty (a back-reference, a lookaround, a group whose shortest match is 0) makes every one of its q.min passes
       even when nothing is consumed, so ()\1{1000000}x costs n x 1,000,000 (and deep counts overflow V8's stack): refused above RE_EMPTY_COUNT */
    if(q&&q.min>RE_EMPTY_COUNT&&(it.t==='ref'||it.t==='look'||(it.t==='grp'&&it.mn===0)))return K_INF;
    switch(it.t){
      case 'set':return q?rep(it.s,[1],q,K,true):{F:it.s,sure:false,f:pAddC(K.f,1),s:K.s,lit:[it.s].concat((K.lit||[]).slice(0,7))};
      case 'ref':return q?rep(R_ANY,[1,1],q,K):{F:R_ANY,sure:false,f:pAdd(K.f,[1,1]),s:pAdd(K.s,[1,1])};
      case 'bol':return {F:K.F,sure:false,f:pAddC(K.f,1),s:pAddC(K.s,1)};
      case 'eol':return {F:m.fl.m?rsNorm(R_END.concat(R_NL)):R_END,sure:false,end:K.end,f:pAddC(K.f,1),s:pAddC(K.s,1)};
      case 'wb':return {F:R_ANY,sure:false,f:pAddC(K.f,1),s:pAddC(K.s,1)};
      case 'look':{const b=alt(it.b,K_SURE);
        /* a lookahead sees the r characters left; a lookbehind sees the ones before, at most n */
        const c=it.behind?[1+pEv(b.f,n)+pEv(b.s,n)+Math.min(n,it.ml)]:pAdd(pAdd(b.f,b.s),it.ml===Infinity?[1,1]:[1+it.ml]);
        return {F:R_ANY,sure:false,f:pAdd(K.f,c),s:pAdd(K.s,c)}}
      default:{ /* grp */
        const e=it.cap?W_CAP:W_GRP;
        if(!q||(q.min===1&&q.max===1)){const g=alt(it.b,K);return {F:g.F,sure:g.sure,end:g.end,f:pAddC(g.f,e),s:pAddC(g.s,e),lit:it.b.length===1?g.lit:undefined}}
        if(q.max===1){const g=alt(it.b,K);return {F:rsNorm(g.F.concat(K.F)),sure:g.sure||K.sure,end:g.end||K.end,f:pAdd(pAddC(g.f,e),K.f),s:pAdd(pAddC(g.f,e),pMax(g.s,K.s))}}
        /* a counted group whose passes are not fixed work (inner quantifiers, or alternatives that start alike) is costed pass by pass */
        if(it.inner||it.ovl){if(q.min!==q.max||q.min>300)return K_INF;
          for(let r=0;r<q.min;r++){const g=alt(it.b,K);K={F:g.F,sure:g.sure,end:g.end,f:pAddC(g.f,e+W_CNT),s:pAddC(g.s,e+W_CNT)}}
          return {F:K.F,sure:K.sure,end:K.end,f:pMul([W_UNROLL],K.f),s:pMul([W_UNROLL],K.s)}} /* V8 saves and restores the pass counter on each retry */
        const g=alt(it.b,K_NONE);return rep(g.F.length?g.F:R_ANY,pAddC(pAdd(g.f,g.s),it.cap?W_PASSCAP:W_PASS),q,K)}}};
  const K=alt(m.ast,K_SURE),lit=K.lit||[];
  let c;
  if(m.anchored)c=pEv(K.f,n)+pEv(K.s,n);
  else{ /* every start position pays the leading literal; the rest are bounded like give-back points */
    let wins=n+1;if(lit.length>=2)wins=Math.min(wins,Math.floor(n/period(lit))+1);if(cnt&&lit.length)wins=Math.min(wins,cnt(lit[0])+1);
    c=(n+1)*(lit.length+1)+pEv(T(K.f,[1,1],lit),n)+(all?wins:1)*pEv(K.s,n)}
  const eat=(n+1)*(1+wmax); /* the characters a match consumes, at most once each over all matches */
  c+=eat;const att=pEv(K.f,n)+pEv(K.s,n)+eat; /* att: one attempt from one start position */
  return {c:c<=Number.MAX_VALUE?c:Infinity,att:att<=Number.MAX_VALUE?att:Infinity}}
/* reModel(src, flags) -> {cost(n, all, nlFree, cnt)}: the bound on the work of matching a subject of n characters once (all: every match, as a /g
   loop does). Results without cnt are memoised by length. */
function reModel(src,flags){
  const fl={i:flags.includes('i'),m:flags.includes('m'),s:flags.includes('s')};
  const ast=reParse(src,fl),m={fl,ast,anchored:!fl.m&&ast.every(s=>s.length&&s[0].t==='bol'&&!s[0].q)};
  const memo=new Map();
  m.cost=(n,all,nlFree,cnt)=>m.bound(n,all,nlFree,cnt).c;
  /* sets: the leading-literal sets whose counts in the subject the cost can use (the same for every n) */
  m.sets=[];reCost(m,RE_EXP_LINE,false,set=>{if(!m.sets.includes(set))m.sets.push(set);return 0},false);
  const memo2=new Map();
  /* boundIn(s, all, nlFree): the bound using s's counts of m.sets, memoised by length and counts */
  m.boundIn=(s,all,nlFree)=>{const k=m.sets.map(set=>{let c=0;for(let i=0;i<s.length;i++)if(rsHas(set,s.charCodeAt(i)))c++;return c});
    const key=(s.length*4+(all?1:0)+(nlFree?2:0))+':'+k.join(',');let b=memo2.get(key);if(b)return b;
    b=reCost(m,s.length,!!nlFree,set=>k[m.sets.indexOf(set)],!!all);if(memo2.size>=512)memo2.clear();memo2.set(key,b);return b};
  m.bound=(n,all,nlFree,cnt)=>{if(cnt)return reCost(m,n,!!nlFree,cnt,!!all);
    const key=n*4+(all?1:0)+(nlFree?2:0);let c=memo.get(key);if(c!==undefined)return c;
    c=reCost(m,n,!!nlFree,null,!!all);if(memo.size>=512)memo.clear();memo.set(key,c);return c};
  return m}
/* trimRun(s, chars, start): s without the run of chars at its end (and at its start too when start is true). A regex like /\n+$/ would retry the run
   from every position in it, which is quadratic on a long run (Task 9b). */
const trimRun=(s,chars,start)=>{let a=0,e=s.length;while(e>0&&chars.includes(s[e-1]))e--;if(start)while(a<e&&chars.includes(s[a]))a++;return a||e<s.length?s.slice(a,e):s};
const RE_MODELS=new WeakMap();
const tooComplex=()=>{const e=new Error('pattern too complex for this practice shell');e.complex=true;return e};
const RE_NL=/[\n\r\u2028\u2029]/;
const reFlags=f=>(f||'').replace(/[^ims]/g,'');
/* regexRisky(src, flags): would safeRegex refuse src? (rule 1, or rule 2 on a 16-character line: see the comment above reShapeRisky) */
function regexRisky(src,flags){if(reShapeRisky(src))return true;
  try{new RegExp(src,reFlags(flags))}catch(e){return false} /* invalid: the caller's new RegExp reports it */
  return reModel(src,reFlags(flags)).cost(RE_EXP_LINE,false,true)>RE_BUDGET}
/* watchRegex(re): remember re's cost model so reGuard can check subjects against it (safeRegex does this; grep calls it for the regex it wraps). */
function watchRegex(re){if(!RE_MODELS.has(re))RE_MODELS.set(re,reModel(re.source,reFlags(re.flags)));return re}
function safeRegex(src,flags){if(reShapeRisky(src))throw tooComplex();const re=new RegExp(src,flags);watchRegex(re);
  if(RE_MODELS.get(re).cost(RE_EXP_LINE,false,true)>RE_BUDGET)throw tooComplex();return re}
/* regexFits(re, n, all, nlFree): may re run on some subject of n characters (nlFree: one without line breaks)? It does not know the subject, so it
   cannot use the character counts reGuard uses. reGuard(re, s, all): throw the complex error when re may not run on s, else charge its work to the
   step budget. Call reGuard once before matching a subject (with all=true before a loop that finds every match). Unwatched regexes always fit. */
function regexFits(re,n,all,nlFree){const m=RE_MODELS.get(re);return !m||m.cost(n,!!all,!!nlFree)<=RE_BUDGET}
/* reBound(re, s, all) -> {c, att} or null for an unwatched regex; throws the complex error when re may not run on s */
function reBound(re,s,all){const m=RE_MODELS.get(re);if(!m)return null;const nl=!RE_NL.test(s);let b=m.bound(s.length,!!all,nl);
  if(b.c>RE_CHUNK&&m.sets.length){const b2=m.boundIn(s,all,nl);if(b2.c<b.c)b=b2} /* worth a closer look: count the subject's characters */
  if(b.c>RE_BUDGET)throw tooComplex();return b}
const reCharge=u=>{const rt=SQ.rt;rt.reWork=(rt.reWork||0)+u;if(rt.reWork>=RE_CHUNK){const k=Math.floor(rt.reWork/RE_CHUNK);rt.reWork-=k*RE_CHUNK;rt.steps+=k;if(rt.steps>LIM.STEPS)throw new StepLimit()}};
function reGuard(re,s,all){const b=reBound(re,s,all);if(b)reCharge(b.c)}
/* reExec(re, s): reGuard, then re.exec(s) from the start. A match at index i cost at most i+1 attempts, so only that much is charged. */
function reExec(re,s){const b=reBound(re,s,false);re.lastIndex=0;const m=re.exec(s);
  if(b)reCharge(m?Math.min(b.c,(m.index+1)*b.att):b.c);return m}

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
  while(i<parts.length){if(!n||n.type!=='dir')return null;let c=own(n.children,parts[i])?n.children[parts[i]]:null;if(!c)return null;
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
const clone=n=>fixTree(JSON.parse(JSON.stringify(n)));
/* grow=true (cp) also counts the file text it copied towards grewBy; a move (grow false) only marks the paths changed */
function markTree(abs,n,grow){SQ.rt.changed.add(abs);if(grow&&n.type==='file')SQ.rt.grewBy+=n.content.length;if(n.type==='dir')for(const k in n.children)markTree(join(abs,k),n.children[k],grow)}
function mkdirp(abs){let n=S.fs,path='';for(const s of abs.split('/').filter(Boolean)){path+='/'+s;if(!own(n.children,s)){n.children[s]=D();SQ.rt.changed.add(path)}n=n.children[s];if(n.type!=='dir')return path}return null}
function ensureDir(p){mkdirp(norm(p,HOME))}
function ensureFile(p,c){const abs=norm(p,HOME);if(getNode(abs))return;const [,,pp]=parentOf(abs);if(mkdirp(pp))return;const [par,name]=parentOf(abs);if(par&&par.type==='dir'){par.children[name]=F(c);SQ.rt.changed.add(abs)}}
const isNull=p=>norm(p)==='/dev/null';
function writeFile(abs,text,append,shown){if(abs==='/dev/null')return null;const wt=writeTarget(abs);if(wt===null)return `bash: ${shown}: Too many levels of symbolic links`;abs=wt;const n=getNode(abs);if(n&&n.type==='dir')return `bash: ${shown}: Is a directory`;
  const [par,name]=parentOf(abs);if(!par||par.type!=='dir')return `bash: ${shown}: No such file or directory`;
  const old=n&&n.type==='file'?n.content:'',newLen=append&&old?old.length+1+text.length:text.length,delta=newLen-old.length;
  if(newLen>LIM.TEXT||(delta>1000&&stateText(S.fs)+delta>LIM.STATE))return `bash: ${shown}: file too large for this practice shell`;
  if(n){n.content=append&&n.content?n.content+'\n'+text:text}else par.children[name]=F(text);SQ.rt.changed.add(abs);if(delta>0){SQ.rt.grewBy+=delta;grewCheck()}return null}
const cmpName=(x,y)=>x.replace(/^\./,'').toLowerCase().localeCompare(y.replace(/^\./,'').toLowerCase());
function sortedKeys(n){return Object.keys(n.children).sort((a,b)=>{const da=n.children[a].type==='dir',db=n.children[b].type==='dir';return da!==db?(da?-1:1):cmpName(a,b)})}
Object.assign(SQ,{stateText,LIM,StepLimit,step,checkState,own,errOf,fatalText,isOverflow,NEST_DEEP,fixTree,grewCheck,safeRegex,regexRisky,regexFits,reGuard,reExec,watchRegex,trimRun,HOME,KEY,D,F,README,SECRET,JOURNAL,PEOPLE,GOLD,LOGS,makeWorld,fresh,save,norm,getNode,realPath,lstat,isLoop,modeOf,defMode,modeString,parentOf,bname,disp,join,clone,markTree,mkdirp,ensureDir,ensureFile,writeFile,cmpName,sortedKeys,isNull});
})(window.SQ = window.SQ || {});
