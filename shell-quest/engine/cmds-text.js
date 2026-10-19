(function (SQ) {
const {norm,getNode,writeFile,ok,E,lines,readInputs,globRe,cmpName,M}=SQ;
const CMDS=SQ.CMDS;
const unsup=x=>E(`this practice shell does not support ${x} yet`);
const REAL={tee:'ip',cut:'bsnz',tr:'cCt',sed:'iszuNlbf',seq:'swf',xargs:'0PLstpdEaoeix',diff:'ucrywbBNaeisxUdlpT',printf:'',basename:'asz',dirname:'z'};
const badOpt=(cmd,ch)=>ch==='-'||(REAL[cmd]||'').includes(ch)?unsup(`${cmd} ${ch==='-'?'--long options':'-'+ch}`):E(`${cmd}: invalid option -- '${ch}'`);
const isOpt=x=>x.length>1&&x[0]==='-'&&x!=='--';
const MAX_SEQ=10000,MAX_OUT=200000,MAX_XARGS=1000,MAX_XDEPTH=3;

// ---- tee ----
CMDS.tee=function(a,io){let app=false,i=0;
  for(;i<a.length&&isOpt(a[i]);i++){for(const ch of a[i].slice(1)){if(ch==='a')app=true;else return badOpt('tee',ch)}}
  if(a[i]==='--')i++;
  const err=[];for(const f of a.slice(i)){const e=writeFile(norm(f),io.stdin,app,f);if(e)err.push(e.replace(/^bash: /,'tee: '))}
  return {out:io.stdin,err,code:err.length?1:0}};

// ---- cut ----
function parseList(s){if(!s)return null;const rs=[];for(const p of s.split(',')){const m=p.match(/^(\d*)(-?)(\d*)$/);if(!p||!m||(!m[1]&&!m[3]))return null;
    const lo=m[1]?+m[1]:1,hi=m[2]?(m[3]?+m[3]:Infinity):lo;if(lo<1||hi<lo&&m[3])return null;rs.push([lo,hi])}
  return n=>rs.some(([lo,hi])=>n>=lo&&n<=hi)}
CMDS.cut=function(a,io){let d='\t',f=null,c=null,i=0;const files=[];
  for(;i<a.length;i++){const x=a[i];if(x==='--'){files.push(...a.slice(i+1));break}
    if(!isOpt(x)){files.push(x);continue}
    const k=x[1];if(k!=='d'&&k!=='f'&&k!=='c')return badOpt('cut',k);
    let v=x.slice(2);if(v===''){if(i+1>=a.length)return E(`cut: option requires an argument -- '${k}'`);v=a[++i]}
    if(k==='d'){if([...v].length!==1)return E('cut: the delimiter must be a single character');d=v}else if(k==='f')f=v;else c=v}
  if(f===null&&c===null)return E('cut: you must specify a list of bytes, characters, or fields');
  if(f!==null&&c!==null)return E('cut: only one type of list may be specified');
  const pick=parseList(f!==null?f:c);if(!pick)return E('cut: invalid byte, character or field list');
  const {src,err}=readInputs(files,io,'cut');const out=[];
  for(const s of src)for(const ln of lines(s.text)){
    if(c!==null)out.push([...ln].filter((_,j)=>pick(j+1)).join(''));
    else if(!ln.includes(d))out.push(ln);
    else out.push(ln.split(d).filter((_,j)=>pick(j+1)).join(d))}
  return {out:out.join('\n'),err,code:err.length?1:0}};

// ---- tr ----
const CLASSES={upper:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',lower:'abcdefghijklmnopqrstuvwxyz',digit:'0123456789',
  alpha:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',alnum:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',space:' \t\n\r\f\v',punct:'!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'};
function expandSet(s){const ch=[];
  for(let i=0;i<s.length;i++){let c=s[i];
    if(c==='['&&s[i+1]===':'){const j=s.indexOf(':]',i+2);const nm=j>0?s.slice(i+2,j):'';if(CLASSES[nm]){ch.push(...CLASSES[nm]);i=j+1;continue}}
    if(c==='\\'&&i+1<s.length){const n=s[++i];c=n==='n'?'\n':n==='t'?'\t':n==='r'?'\r':n}
    if(s[i+1]==='-'&&i+2<s.length){let e=s[i+2],adv=2;if(e==='\\'&&i+3<s.length){const n=s[i+3];e=n==='n'?'\n':n==='t'?'\t':n;adv=3}
      if(e.charCodeAt(0)<c.charCodeAt(0))return {bad:`tr: range-endpoints of '${c}-${e}' are in reverse collating sequence order`};
      for(let k=c.charCodeAt(0);k<=e.charCodeAt(0);k++)ch.push(String.fromCharCode(k));i+=adv;continue}
    ch.push(c)}
  return {set:ch}}
CMDS.tr=function(a,io){let del=false,sq=false,i=0;
  for(;i<a.length&&isOpt(a[i]);i++){for(const ch of a[i].slice(1)){if(ch==='d')del=true;else if(ch==='s')sq=true;else return badOpt('tr',ch)}}
  if(a[i]==='--')i++;const ops=a.slice(i);
  if(!ops.length)return E("tr: missing operand");
  if(!del&&!sq&&ops.length<2)return E(`tr: missing operand after '${ops[0]}'`);
  if(ops.length>(del&&!sq?1:2))return E(`tr: extra operand '${ops[del&&!sq?1:2]}'`);
  const s1=expandSet(ops[0]);if(s1.bad)return E(s1.bad);let s2={set:[]};
  if(ops[1]!==undefined){s2=expandSet(ops[1]);if(s2.bad)return E(s2.bad)}
  const from=s1.set,to=s2.set;if(!del&&ops.length===2&&!to.length)return E('tr: when not truncating set1, string2 must be non-empty');
  const map=new Map();if(!del&&to.length)from.forEach((c,j)=>{if(!map.has(c))map.set(c,to[Math.min(j,to.length-1)])});
  const delSet=new Set(from),sqSet=new Set(ops.length>1&&!del?to:from);
  let res='',prev=null;
  for(const c of io.stdin){if(del&&delSet.has(c))continue;const o=(!del&&map.has(c))?map.get(c):c;
    if(sq&&sqSet.has(o)&&prev===o)continue;res+=o;prev=o}
  return ok(res)};

// ---- sed ----
const RE_SPECIAL=/[\\^$.*+?()[\]{}|\/-]/;
function sedParse(script){const bad=(n,m)=>({err:`sed: -e expression #1, char ${n}: ${m}`});
  let i=0;const n=script.length;const cmd={a1:null,a2:null,re:null};
  const num=()=>{let s='';while(i<n&&/\d/.test(script[i]))s+=script[i++];return s===''?null:+s};
  const addr=()=>{if(script[i]==='/'){i++;let s='';while(i<n&&script[i]!=='/'){if(script[i]==='\\'&&i+1<n){if(script[i+1]==='/'){s+='/';i+=2;continue}s+=script[i++]}s+=script[i++]}
      if(i>=n)return {bad:bad(i,'unterminated address regex')};i++;return {re:s}}
    if(script[i]==='$'){i++;return {last:true}}
    const v=num();return v===null?null:{n:v}};
  while(i<n&&script[i]===' ')i++;
  const A1=addr();if(A1&&A1.bad)return A1.bad;
  if(A1){cmd.a1=A1;if(script[i]===','){i++;const A2=addr();if(A2&&A2.bad)return A2.bad;if(!A2)return bad(i+1,'unexpected `,\'');if(A1.n===undefined||(A2.n===undefined&&!A2.last))return bad(i,'only N,M and N,$ line ranges are supported here');cmd.a2=A2}}
  while(i<n&&script[i]===' ')i++;
  if(i>=n)return bad(i,'missing command');
  if(script[i]==='!')return {err:'this practice shell does not support sed negated addresses (!) yet'};
  const c=script[i++];
  if(c==='d'||c==='p'){while(i<n&&script[i]===' ')i++;if(i<n)return bad(i+1,'extra characters after command');cmd.c=c;return {cmd}}
  if('yaicqnNDPhHgGx=lrwbtTe{'.includes(c))return {err:`this practice shell does not support sed command '${c}' yet`};
  if(c!=='s')return bad(i,`unknown command: \`${c}'`);
  const dl=script[i++];if(dl===undefined||dl==='\n'||dl==='\\')return bad(i,'unterminated `s\' command');
  const part=()=>{let s='';while(i<n&&script[i]!==dl){if(script[i]==='\\'&&i+1<n){if(script[i+1]===dl){s+=RE_SPECIAL.test(dl)&&dl!=='/'?'\\'+dl:dl;i+=2;continue}s+=script[i]+script[i+1];i+=2;continue}s+=script[i++]}
    if(i>=n)return null;i++;return s};
  const re=part();if(re===null)return bad(n,'unterminated `s\' command');
  const rp=part();if(rp===null)return bad(n,'unterminated `s\' command');
  let g=false,p=false,ic=false;while(i<n){const f=script[i++];if(f==='g')g=true;else if(f==='p')p=true;else if(f==='i'||f==='I')ic=true;else if(f===' ')continue;else return bad(i,'unknown option to `s\'')}
  cmd.c='s';cmd.pat=re;cmd.rp=rp;cmd.g=g;cmd.p=p;cmd.ic=ic;return {cmd}}
/* compile through SQ.safeRegex; returns the RegExp, or a string with the error text for the caller to print */
function mkRe(pat,fl){try{return SQ.safeRegex(pat,fl)}catch(e){return e.complex?'sed: '+e.message:'sed: invalid regular expression: '+pat}}
function expandRepl(rp,m){let o='';for(let i=0;i<rp.length;i++){const c=rp[i];
  if(c==='\\'&&i+1<rp.length){const d=rp[++i];if(d==='n')o+='\n';else if(d==='t')o+='\t';else if(/[1-9]/.test(d))o+=m[+d]===undefined?'':m[+d];else o+=d}
  else if(c==='&')o+=m[0];else o+=c}return o}
function sedSub(line,c){const rx=new RegExp(c.rx.source,'g'+(c.ic?'i':''));let o='',last=0,prevEnd=-1,m;
  while(last<=line.length&&(m=rx.exec(line))){
    if(m[0]===''){if(m.index===prevEnd){rx.lastIndex=m.index+1;if(m.index>=line.length)break;continue}}
    o+=line.slice(last,m.index)+expandRepl(c.rp,m);last=m.index+m[0].length;prevEnd=last;
    if(!c.g)break;if(m[0]==='')rx.lastIndex=m.index+1}
  return o+line.slice(last)}
CMDS.sed=function(a,io){let quiet=false,script=null;const files=[];
  for(let i=0;i<a.length;i++){const x=a[i];
    if(x==='--'){files.push(...a.slice(i+1));break}
    if(x==='-e'){if(i+1>=a.length)return E("sed: option requires an argument -- 'e'");script=script===null?a[++i]:script+'\n'+a[++i];continue}
    if(isOpt(x)){for(const ch of x.slice(1)){if(ch==='n')quiet=true;else if(ch==='E'||ch==='r'){}else return badOpt('sed',ch)}continue}
    if(script===null)script=x;else files.push(x)}
  if(script===null)return E('sed: no script given. Try: sed \'s/old/new/\' file',1);
  const cmds=[];for(const part of script.split('\n')){if(part.trim()==='')continue;const r=sedParse(part);if(r.err)return E(r.err);cmds.push(r.cmd)}
  for(const c of cmds){if(c.c==='s'){c.rx=mkRe(c.pat,(c.g?'g':'')+(c.ic?'i':''));if(typeof c.rx==='string')return E(c.rx)}
    for(const k of ['a1','a2'])if(c[k]&&c[k].re!==undefined){c[k].rx=mkRe(c[k].re,'');if(typeof c[k].rx==='string')return E(c[k].rx)}}
  const {src,err}=readInputs(files,io,'sed');const out=[];
  for(const s of src){const L=lines(s.text);
    L.forEach((ln,idx)=>{const no=idx+1;let line=ln,del=false;
      const test=(ad)=>ad.n!==undefined?no===ad.n:ad.last?no===L.length:ad.rx.test(line);
      for(const c of cmds){
        let hit=true;if(c.a1)hit=c.a2?no>=c.a1.n&&(c.a2.last||no<=c.a2.n):test(c.a1);
        if(!hit)continue;
        if(c.c==='d'){del=true;break}
        if(c.c==='p')out.push(line);
        else{const next=sedSub(line,c);
          const changed=next!==line;line=next;if(c.p&&changed)out.push(line)}}
      if(!del&&!quiet)out.push(line)})}
  return {out:out.join('\n'),err,code:err.length?1:0}};

// ---- seq ----
const NUM=/^[+-]?(\d+\.?\d*|\.\d+)$/;
CMDS.seq=function(a){const nums=[];
  for(const x of a){if(isOpt(x)&&!NUM.test(x))return badOpt('seq',x[1]);nums.push(x)}
  if(!nums.length)return E('seq: missing operand');
  if(nums.length>3)return E(`seq: extra operand '${nums[3]}'`);
  for(const x of nums)if(!NUM.test(x))return E(`seq: invalid floating point argument: '${x}'`);
  const dec=Math.max(...nums.map(x=>(x.split('.')[1]||'').length));
  let first=1,inc=1,last;const v=nums.map(Number);
  if(v.length===1)last=v[0];else if(v.length===2){first=v[0];last=v[1]}else{first=v[0];inc=v[1];last=v[2]}
  if(inc===0)return E(`seq: invalid Zero increment value: '${nums[nums.length===3?1:0]}'`);
  if((inc>0&&first>last)||(inc<0&&first<last))return ok('');
  if(Math.floor((last-first)/inc)+1>MAX_SEQ)return E('seq: too many numbers for this practice shell');
  const out=[];for(let k=0,x=first;inc>0?x<=last+1e-9:x>=last-1e-9;k++,x=first+k*inc)out.push(x.toFixed(dec));
  return ok(out.join('\n'))};

// ---- xargs ----
let xDepth=0,xBudget=MAX_XARGS;
CMDS.xargs=function(a,io){let n=0,repl=null,noRun=false,i=0;
  for(;i<a.length&&isOpt(a[i]);i++){const x=a[i];
    if(x==='-r')noRun=true;
    else if(x[1]==='n'){let v=x.slice(2);if(v==='')v=a[++i];if(!/^\d+$/.test(v||'')||+v<1)return E(`xargs: invalid number for -n option`);n=+v}
    else if(x[1]==='I'){let v=x.slice(2);if(v==='')v=a[++i];if(!v)return E("xargs: option requires an argument -- 'I'");repl=v}
    else return badOpt('xargs',x[1])}
  if(a[i]==='--')i++;
  const cmd=a.slice(i);if(!cmd.length)cmd.push('echo');
  if(xDepth>=MAX_XDEPTH)return E('xargs: too many nested xargs for this practice shell');
  const fn=SQ.own(CMDS,cmd[0])&&CMDS[cmd[0]];if(!fn)return E(`xargs: ${cmd[0]}: No such file or directory`,127);
  const items=repl!==null?lines(io.stdin).filter(l=>l.trim()!==''):io.stdin.split(/\s+/).filter(Boolean);
  let calls;
  if(repl!==null)calls=items.map(it=>cmd.map(w=>w.split(repl).join(it)));
  else if(!items.length)calls=noRun?[]:[cmd.slice()];
  else if(n){calls=[];for(let k=0;k<items.length;k+=n)calls.push(cmd.concat(items.slice(k,k+n)))}
  else calls=[cmd.concat(items)];
  const top=xDepth===0;if(top)xBudget=MAX_XARGS;
  const out=[],err=[],tips=[];let code=0;xDepth++;
  try{for(const w of calls){
      if(xBudget<=0){err.push('xargs: too many commands for this practice shell');code=1;break}
      xBudget--;SQ.step();const f=SQ.own(CMDS,w[0])&&CMDS[w[0]];
      if(!f){err.push(`xargs: ${w[0]}: No such file or directory`);code=127;continue}
      const r=f(w.slice(1),Object.assign({},io,{stdin:'',tty:false,pipeLen:1}));
      if(r.out!=='')out.push(r.out);err.push(...(r.err||[]));tips.push(...(r.tips||[]));if(r.code!==0&&code===0)code=123}}
  finally{xDepth--}
  return {out:out.join('\n'),err,code,tips}};

// ---- diff ----
CMDS.diff=function(a,io){let q=false;const ops=[];
  for(let i=0;i<a.length;i++){const x=a[i];if(x==='--'){ops.push(...a.slice(i+1));break}
    if(isOpt(x)){for(const ch of x.slice(1)){if(ch==='q')q=true;else return badOpt('diff',ch)}}else ops.push(x)}
  if(!ops.length)return E('diff: missing operand after \'diff\'',2);
  if(ops.length<2)return E(`diff: missing operand after '${ops[0]}'`,2);
  if(ops.length>2)return E(`diff: extra operand '${ops[2]}'`,2);
  const rd=[];const err=[];
  for(const t of ops){if(t==='-'){rd.push(lines(io.stdin));continue}const nd=getNode(norm(t));
    if(!nd)err.push(`diff: ${t}: No such file or directory`);else if(nd.type==='dir')err.push(`diff: ${t}: Is a directory`);else rd.push(lines(nd.content))}
  if(err.length)return {out:'',err,code:2};
  const [A,B]=rd;if(A.length>1500||B.length>1500)return E('diff: files too large for this practice shell',2);
  const n=A.length,m=B.length,T=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let x=n-1;x>=0;x--)for(let y=m-1;y>=0;y--)T[x][y]=A[x]===B[y]?T[x+1][y+1]+1:Math.max(T[x+1][y],T[x][y+1]);
  const hunks=[];let x=0,y=0,cur=null;
  while(x<n||y<m){if(x<n&&y<m&&A[x]===B[y]){cur=null;x++;y++;continue}
    if(!cur){cur={x0:x,y0:y,xs:[],ys:[]};hunks.push(cur)}
    if(y>=m||(x<n&&T[x+1][y]>=T[x][y+1])){cur.xs.push(A[x]);x++}else{cur.ys.push(B[y]);y++}}
  if(!hunks.length)return ok('');
  if(q)return {out:`Files ${ops[0]} and ${ops[1]} differ`,err:[],code:1};
  const rg=(s,c)=>c===1?String(s+1):`${s+1},${s+c}`;const out=[];
  for(const h of hunks){const na=h.xs.length,nb=h.ys.length;
    if(!na){out.push(`${h.x0}a${rg(h.y0,nb)}`);h.ys.forEach(l=>out.push('> '+l))}
    else if(!nb){out.push(`${rg(h.x0,na)}d${h.y0}`);h.xs.forEach(l=>out.push('< '+l))}
    else{out.push(`${rg(h.x0,na)}c${rg(h.y0,nb)}`);h.xs.forEach(l=>out.push('< '+l));out.push('---');h.ys.forEach(l=>out.push('> '+l))}}
  return {out:out.join('\n'),err:[],code:1}};

// ---- printf ---- (the formatting lives in printf.js: SQ.fmtPrintf, shared with awk)
CMDS.printf=function(a){let i=0,vname=null;
  for(;i<a.length&&isOpt(a[i]);){
    if(a[i][1]==='v'){if(a[i].length>2){vname=a[i].slice(2);i++}else{if(i+1>=a.length)return E("bash: printf: -v: option requires an argument",2);vname=a[i+1];i+=2}}
    else return badOpt('printf',a[i][1])}
  if(a[i]==='--')i++;
  if(i>=a.length)return E('printf: usage: printf format [arguments]');
  if(vname!==null&&(!/^[A-Za-z_]\w*$/.test(vname)||SQ.badName(vname)))return E(`bash: printf: \`${vname}': not a valid identifier`,2);
  const r=SQ.fmtPrintf(a[i],a.slice(i+1));
  const err=r.err?r.err.split('\n'):[];
  if(r.err&&r.text===''&&/printf: (width|precision|output) too large|invalid directive/.test(r.err))return {out:'',err,code:1};
  if(vname!==null){if(r.text.length>SQ.LIM.VAR)return E('bash: printf: value too large for this practice shell',1);SQ.S.vars[vname]=r.text;return {out:'',err,code:r.code}}
  return {out:r.text.endsWith('\n')?r.text.slice(0,-1):r.text,err,code:r.code}};

// ---- grep ----
/* -i -n -c -v -E -F -w -x -o -l -L -q -s -h -H -r -R, -e PAT (repeatable), -m N, -A/-B/-C N and -NUM, --include/--exclude=GLOB, --color=never|auto.
   Patterns are JS regexes through SQ.safeRegex (BRE and ERE are not told apart); several patterns match leftmost-longest. A pattern that does not
   compile is a literal, except an unclosed [ or a trailing backslash (and, with -E, an unclosed ( or {2,1}), which print GNU's message and exit 2.
   -r/-R walk directories in cmpName order and never follow symlinked directories, so a link cycle ends; -r skips symlinks, -R reads links to files.
   Unsupported: -f -P -z -a -U -T -V -Z -y -I -u -d, other long options and --color=always. */
const GREP_UNSUP='fPzaUTVZyIud';
const GREP_USAGE="Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.";
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\\/-]/g,'\\$&');
function grepBadRe(p,ere){ /* GNU's message for a pattern JS refuses, or '' to treat it as a literal */
  let depth=0,i=0,open=false,lastOpen=-1;
  for(;i<p.length;i++){const c=p[i];
    if(c==='\\'){if(i===p.length-1)return 'Trailing backslash';i++;continue}
    if(c==='['){open=true;lastOpen=i;i++;if(p[i]==='^')i++;if(p[i]===']')i++;
      while(i<p.length&&p[i]!==']'){if(p[i]==='['&&(p[i+1]===':'||p[i+1]==='.'||p[i+1]==='=')){const e=p.indexOf(p[i+1]+']',i+2);if(e<0)break;i=e+1}i++}
      if(i<p.length)open=false;else break;continue}
    if(ere){if(c==='(')depth++;else if(c===')'&&depth>0)depth--}}
  if(open)return lastOpen===p.length-1?'Invalid regular expression':'Unmatched [, [^, [:, [., or [=';
  if(ere&&depth>0)return 'Unmatched ( or \\(';
  if(ere){const m=/\{(\d+),(\d+)\}/.exec(p);if(m&&+m[1]>+m[2])return 'Invalid content of \\{\\}'}
  return ''}
CMDS.grep=function(a,io){
  const o={i:0,n:0,c:0,v:0,E:0,F:0,w:0,x:0,o:0,l:0,L:0,q:0,s:0,h:0,H:0,r:0,R:0};
  const pats=[],files=[],filt=[];let A=-1,B=-1,Cx=-1,mMax=-1,color='auto',end=false,havePat=false;
  const need=ch=>Object.assign(E(`grep: option requires an argument -- '${ch}'\n${GREP_USAGE}`,2));
  for(let i=0;i<a.length;i++){const x=a[i];
    if(end||x.length<2||x[0]!=='-'){files.push(x);continue}
    if(x==='--'){end=true;continue}
    if(x[1]==='-'){const eq=x.indexOf('='),name=eq<0?x.slice(2):x.slice(2,eq);
      if(name==='include'||name==='exclude'){let v;if(eq>=0)v=x.slice(eq+1);else if(i+1<a.length)v=a[++i];else return E(`grep: option '--${name}' requires an argument\n${GREP_USAGE}`,2);filt.push([name,v]);continue}
      if((name==='color'||name==='colour')&&eq>=0){const v=x.slice(eq+1);if(v==='never'||v==='auto'){color=v;continue}return unsup(`grep ${x}`)}
      return unsup('grep --long options')}
    let digits='';
    for(let j=1;j<x.length;j++){const ch=x[j];
      if(ch>='0'&&ch<='9'){digits+=ch;continue}
      if(digits){Cx=parseInt(digits,10);digits=''}
      if('inclvEFwxoLqshHrR'.includes(ch)){o[ch]=1;continue}
      if('ABCme'.includes(ch)){let v=x.slice(j+1);if(!v){if(i+1>=a.length)return need(ch);v=a[++i]}
        if(ch==='e'){pats.push(v);havePat=true}
        else if(ch==='m'){if(!/^-?\d+$/.test(v))return E('grep: invalid max count',2);mMax=parseInt(v,10);if(mMax<0)mMax=-1}
        else{if(!/^\d+$/.test(v))return E(`grep: ${v}: invalid context length argument`,2);const n=parseInt(v,10);if(ch==='A')A=n;else if(ch==='B')B=n;else Cx=n}
        break}
      if(GREP_UNSUP.includes(ch))return unsup(`grep -${ch}`);
      return E(`grep: invalid option -- '${ch}'`,2)}
    if(digits)Cx=parseInt(digits,10)}
  if(!havePat){if(!files.length)return E('usage: grep [-i] [-n] [-c] [-v] PATTERN [FILE...]',2);pats.push(files.shift())}
  const bef=B>=0?B:Cx,aft=A>=0?A:Cx,ctxOn=bef>=0||aft>=0,nB=Math.max(bef,0),nA=Math.max(aft,0);
  if(mMax===0)return {out:'',err:[],code:1};
  /* compile */
  const res=[];let compiled=0;
  for(const raw of pats)for(const p of raw.split('\n')){
    if(++compiled%100===0)SQ.step();
    let src;
    if(o.F)src=reEsc(p);
    else{try{SQ.safeRegex(p,'');src=p}catch(e){if(e.complex)return E('grep: '+e.message,2);const m=grepBadRe(p,o.E);if(m)return E('grep: '+m,2);src=reEsc(p)}}
    if(o.x)src='^(?:'+src+')$';else if(o.w)src='(?<![A-Za-z0-9_])(?:'+src+')(?![A-Za-z0-9_])';
    try{res.push(new RegExp(src,o.i?'gi':'g'))}catch(e){return E('grep: Invalid regular expression',2)}}
  let work=0;
  const hit=ln=>{work+=res.length;if(work>=100){SQ.step();work=0}for(const r of res){r.lastIndex=0;if(r.test(ln))return true}return false};
  const spans=ln=>{const sp=[];let pos=0;while(pos<=ln.length){let best=null;
      for(const r of res){r.lastIndex=pos;const m=r.exec(ln);if(m&&(best===null||m.index<best.index||(m.index===best.index&&m[0].length>best[0].length)))best=m}
      if(!best)break;if(best[0].length===0){pos=best.index+1;continue}sp.push([best.index,best.index+best[0].length]);pos=best.index+best[0].length}
    return sp};
  const paintOn=io.tty&&color!=='never';
  const out=[],err=[];let anyOut=false,matchedAny=false,quit=false,dirSeen=false;
  const keep=name=>{ /* --include / --exclude: the last matching option wins; none matching keeps the file unless the first option is --include */
    if(!filt.length)return true;const b=name.slice(name.lastIndexOf('/')+1);let verdict=null;
    for(const [k,g] of filt)if(globRe(g).test(b)||globRe(g).test(name))verdict=k==='include';
    return verdict===null?filt[0][0]!=='include':verdict};
  const scan=(name,text,withName)=>{
    const L=lines(text),listing=o.l||o.L,quiet=o.q||listing,showName=o.H?true:o.h?false:withName;
    const nm=s=>paintOn?M('f',s):s;
    let cnt=0,last=-1,pend=0,stopped=false;
    const emit=(i,sepc,txt)=>{out.push((showName?nm(name)+sepc:'')+(o.n?(paintOn?M('n',String(i+1)):String(i+1))+sepc:'')+txt)};
    for(let i=0;i<L.length;i++){const ln=L[i];
      if(stopped){if(pend>0){pend--;if(!o.o)emit(i,'-',ln);last=i;continue}break}
      if(hit(ln)!==!!o.v){cnt++;matchedAny=true;
        if(o.q){quit=true;return}
        if(listing)break;
        if(!o.c){
          if(ctxOn){const from=Math.max(i-nB,last+1);if(anyOut&&(last<0?from>=0:from>last+1))out.push('--');anyOut=true;
            if(!o.o)for(let k=from;k<i;k++)emit(k,'-',L[k]);last=i;pend=nA}
          if(o.o){for(const [s,e] of spans(ln))emit(i,':',paintOn?M('m',ln.slice(s,e)):ln.slice(s,e))}
          else{let txt=ln;if(paintOn&&!o.v&&res.length){const sp=spans(ln);let q='',at=0;for(const [s,e] of sp){q+=ln.slice(at,s)+M('m',ln.slice(s,e));at=e}txt=q+ln.slice(at)}emit(i,':',txt)}}
        if(mMax>=0&&cnt>=mMax){stopped=true;if(o.c||pend===0)break}}
      else if(pend>0&&!o.c){pend--;if(!o.o)emit(i,'-',ln);last=i}}
    if(o.l){if(cnt)out.push(nm(name))}else if(o.L){if(!cnt)out.push(nm(name))}
    else if(o.c&&!o.q)out.push((showName?name+':':'')+cnt)};
  const walk=(disp,abs,node)=>{SQ.step();const pre=disp===''?'':disp.endsWith('/')?disp:disp+'/';
    for(const k of Object.keys(node.children).sort(cmpName)){if(quit)return;const c=node.children[k],ca=abs==='/'?'/'+k:abs+'/'+k;
      if(c.type==='dir'){walk(pre+k,ca,c);continue}
      if(c.type==='link'){if(!o.R)continue;const t=SQ.realPath(ca,true);const tn=t&&getNode(t);if(!tn){err.push(`grep: ${pre+k}: No such file or directory`);continue}if(tn.type==='dir')continue;
        if(keep(k))scan(pre+k,tn.content,true);continue}
      if(keep(k))scan(pre+k,c.content,true)}};
  const rec=o.r||o.R;
  if(!files.length){
    if(rec){dirSeen=true;walk('',norm('.'),getNode(norm('.')))}
    else scan('(standard input)',io.stdin,false)}
  else for(const t of files){if(quit)break;
    if(SQ.isNull(t)){scan(t,'',files.length>1);continue}
    const abs=norm(t),n=getNode(abs);
    if(!n){if(!o.s)err.push(SQ.isLoop(abs)?`grep: ${t}: Too many levels of symbolic links`:`grep: ${t}: No such file or directory`);else err.push(null);continue}
    if(n.type==='dir'){if(!rec){if(!o.s)err.push(`grep: ${t}: Is a directory`);else err.push(null);continue}dirSeen=true;walk(t,abs,n);continue}
    if(keep(t))scan(t,n.content,files.length>1)}
  const errs=err.filter(e=>e!==null);
  return {out:out.join('\n'),err:errs,code:o.q&&matchedAny?0:err.length?2:matchedAny?0:1}};

// ---- basename / dirname ----
CMDS.basename=function(a){let i=0;if(a[0]==='--')i=1;else if(a[0]&&isOpt(a[0]))return badOpt('basename',a[0][1]);
  const p=a[i];if(p===undefined)return E('basename: missing operand');if(a.length>i+2)return E(`basename: extra operand '${a[i+2]}'`);
  const t=p.replace(/\/+$/,'');if(t==='')return ok(p.startsWith('/')?'/':'');
  let b=t.slice(t.lastIndexOf('/')+1);const sfx=a[i+1];if(sfx&&b!==sfx&&b.endsWith(sfx))b=b.slice(0,-sfx.length);return ok(b)};
CMDS.dirname=function(a){let i=0;if(a[0]==='--')i=1;else if(a[0]&&isOpt(a[0]))return badOpt('dirname',a[0][1]);
  if(a.length<=i)return E('dirname: missing operand');
  return ok(a.slice(i).map(p=>{const t=p.replace(/\/+$/,'');if(t==='')return p.startsWith('/')?'/':'.';const k=t.lastIndexOf('/');if(k<0)return '.';
    const d=t.slice(0,k).replace(/\/+$/,'');return d===''?'/':d}).join('\n'))};
})(window.SQ = window.SQ || {});
