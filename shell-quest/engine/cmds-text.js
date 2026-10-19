(function (SQ) {
const {norm,getNode,writeFile,ok,E,lines,readInputs}=SQ;
const CMDS=SQ.CMDS;
const unsup=x=>E(`this practice shell does not support ${x} yet`);
const REAL={tee:'ip',cut:'bsnz',tr:'cCt',sed:'iszuNlbf',seq:'swf',xargs:'0PLstpdEaoeix',diff:'ucrywbBNaeisxUdlpT',printf:'v',basename:'asz',dirname:'z'};
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
  const fn=CMDS[cmd[0]];if(!fn)return E(`xargs: ${cmd[0]}: No such file or directory`,127);
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
      xBudget--;SQ.step();const f=CMDS[w[0]];
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

// ---- printf ----
function unesc(s){return s.replace(/\\(n|t|r|\\|"|'|a|0)/g,(_,c)=>({n:'\n',t:'\t',r:'\r','\\':'\\','"':'"',"'":"'",a:'\x07','0':'\0'}[c]))}
CMDS.printf=function(a){let i=0;if(a[0]==='--')i=1;else if(a[0]&&isOpt(a[0]))return badOpt('printf',a[0][1]);
  if(i>=a.length)return E('printf: usage: printf format [arguments]');
  const fmt=a[i],args=a.slice(i+1);const err=[];let ai=0,out='',bad=false,used;
  const DIR=/%([-0]*)(\d*)([a-zA-Z%])/g;
  const once=()=>{used=false;let last=0,res='';DIR.lastIndex=0;let m;
    while((m=DIR.exec(fmt))){res+=unesc(fmt.slice(last,m.index));last=DIR.lastIndex;const [,fl,w,cv]=m;
      if(cv==='%'){res+='%';continue}
      if(+w>1000){err.push('printf: width too large for this practice shell');bad=true;return null}
      let v;
      if(cv==='s'){used=true;v=ai<args.length?args[ai++]:''}
      else if(cv==='d'||cv==='i'){used=true;const raw=ai<args.length?args[ai++]:'0';if(!/^[+-]?\d+$/.test(raw)){err.push(`printf: ${raw}: invalid number`);bad=true;v='0'}else v=String(parseInt(raw,10))}
      else{err.push(`printf: %${cv}: invalid directive`);bad=true;return null}
      const W=+w;if(v.length<W)v=fl.includes('-')?v.padEnd(W):(fl.includes('0')&&cv!=='s'?v.padStart(W,'0'):v.padStart(W));res+=v}
    res+=unesc(fmt.slice(last));return res};
  let guard=0;
  do{const r=once();if(r===null)break;out+=r;if(out.length>MAX_OUT)return E('printf: output too large for this practice shell');if(++guard>10000)break}while(used&&ai<args.length);
  if(bad&&out===''&&err.length&&/invalid directive|too large/.test(err[0]))return {out:'',err,code:1};
  return {out:out.endsWith('\n')?out.slice(0,-1):out,err,code:bad?1:0}};

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
