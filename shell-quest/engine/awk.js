/* awk.js: the awk interpreter and CMDS.awk (DOM-free). SQ.awkParse (awk-parse.js) parses the whole program first; nothing runs on a
   syntax error. SQ.awkRun(prog, inputs, o) -> { out, err, code } runs it:
     prog    the program text
     inputs  operands in order: { name, text } (a file's text), { assign: name, value } (a name=value operand, applied when reached),
             { name, error } (fatal: `awk: <error>`, exit 2, when reached) or { name, warn } (a warning on stderr, the operand is skipped).
             With no { name, text } / { name, error } entry at all, o.stdin is read.
     o       { FS?, vars: { name: value }, stdin?, argv?: string[], env?: { name: value } }. FS and vars get awk string escapes (\t, \n, ...).
   out is the raw text (a final newline is kept: the command trims one), err is '' or the message lines joined by '\n'.

   Semantics (POSIX awk; mawk 1.3.4 was the reference, gawk where noted):
   - Values are numbers, strings, numeric strings (fields, split() pieces, -v and name=value values that look like numbers) or
     uninitialised (both "" and 0). A comparison is numeric when both sides are numbers, numeric strings or uninitialised, else a string
     comparison ("10" < "9" is true for constants, false for fields 10 and 9). A number becomes a string through CONVFMT (OFMT in print);
     an integral value in [-2^63, 2^63) prints whole with exact digits; an unusable OFMT/CONVFMT (not one numeric conversion) means %.6g. inf, -inf and nan print as those words (BWK style; mawk/gawk print -nan), never as
     JS text. Strings never parse as nan/inf ("nan"+0 is 0, as in gawk). Array keys are strings; a missing field is "".
   - Records: RS is a newline only (anything else: the practice-shell message); a final newline ends the last record. FS " " splits on
     runs of blanks and trims; another single character is literal; "" splits into characters; longer is an ERE. Assigning a field or NF
     rebuilds $0 with OFS. $0 and NF keep the last record in END. getline, system(), close(), output redirection and pipes are refused by
     the parser.
   - for (k in a) visits keys in insertion order (real awk leaves the order unspecified). Array parameters are passed by reference;
     an uninitialised variable passed to a function becomes an array when the function uses it as one.
   - substr rounds start and length half to even and takes positions [start, start+length) (gawk/POSIX: substr("hello",0,2) is "h").
     index("x","") is 1 (mawk). rand() is a 31-bit LCG (state = state*1103515245 + 12345 mod 2^31, rand = state/2^31), seed 0 at start;
     srand(x) returns the previous seed and srand() seeds from SQ.rt.clock (0 when there is none): deterministic, no Date/Math.random.
   - printf/sprintf go through SQ.fmtPrintf: awk turns each argument into what the conversion needs (%d/%i/%o/%x/%X/%u truncate the
     number, %c of a number is that character, %e/%f/%g take the number, %s the string), backslashes in the format are literal (the
     lexer already did the escapes), an unknown conversion such as %b is printed as typed, missing arguments are an error.
   - Regexes are EREs translated here to JS (bracket expressions, [:classes:], {n,m}, a leading * or + is literal, \< \> \y \w \s) and
     compiled through SQ.safeRegex. Matching is JS's leftmost-first, not POSIX leftmost-longest (an alternation takes its first
     matching branch). Regex literals are compiled before anything runs.
   Errors (exit 2, BWK wording): `awk: division by zero`, `awk: division by zero in %`, `awk: trying to access out of range field N`
   (negative, or above 1,000 and above NF: $1000001 and $1000000 = 1 are refused), `awk: can't use scalar x as array`, `awk: can't use
   array x in scalar context`, `awk: not enough args in printf(FMT)`, `awk: can't open file F`, followed by ` source line number N`
   for errors inside the program. Output printed before an error is kept.
   Caps: SQ.step() per record, per loop pass and per user function call (an endless loop ends with the step-limit message; a call
   costs a step by design, so a doubly recursive fib(20), about 22,000 calls, stops at LIM.STEPS while fib(15) runs), function calls
   nest at most 100 deep, an expression nested so deep that JS runs out of stack (a chain of thousands of + or concatenations) ends
   with `awk: nesting too deep` (exit 2), a string longer than LIM.VAR stops the command (`a value grew too large`), output beyond LIM.TEXT stops with
   `awk: output too large for this practice shell` (exit 1), the screen shows LIM.LINES lines as for every command. */
(function (SQ) {
const MAX_FIELD=1000,MAX_CALLS=100,CACHE_MAX=200;
const BRK=1,CONT=2,RET=3;
class SN{constructor(s,n){this.s=s;this.n=n}}            /* a numeric string */
class Arr{constructor(){this.m=new Map()}}
class Lazy{constructor(scope,name){this.scope=scope;this.name=name;this.arr=null}} /* an uninitialised argument that may become an array */
class AwkErr extends Error{constructor(msg,line){super(msg);this.line=line||0}}
const NEXT_SIG={sig:'next'},EXIT_SIG={sig:'exit'},OUT_CAP={sig:'out'},RS_SIG={sig:'rs'};
const BLANK='[ \\t\\n\\r\\f\\v]*';
const NUMRE=new RegExp('^'+BLANK+'[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?'+BLANK+'$');
const PREFIX=/^[ \t\n\r\f\v]*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/;
const mkInput=s=>NUMRE.test(s)?new SN(s,Number(s.trim())):s;
const strToNum=s=>{const m=PREFIX.exec(s);return m?Number(m[1]):0};
const isNumish=v=>v===undefined||typeof v==='number'||v instanceof SN;
const jsRepr=x=>Number.isNaN(x)?'nan':x===Infinity?'inf':x===-Infinity?'-inf':Object.is(x,-0)?'-0':String(x);
const intText=n=>Number.isFinite(n)?BigInt(Math.trunc(n)).toString():jsRepr(n);
const NEST='awk: nesting too deep';
const USABLE_FMT=/^(?:[^%]|%%)*%[-+#0 ]*\d*(?:\.\d*)?[eEfFgGdiouxX](?:[^%]|%%)*$/;
const roundHE=x=>Math.abs(x%1)===0.5?2*Math.round(x/2):Math.round(x);

/* awk string escapes, as the lexer does them (for -v, -F and name=value operands) */
const ESC={n:'\n',t:'\t',r:'\r',b:'\b',f:'\f',v:'\v',a:'\x07','"':'"','\\':'\\','/':'/'};
function unesc(s){if(s.indexOf('\\')<0)return s;let o='';
  for(let i=0;i<s.length;i++){const c=s[i];if(c!=='\\'||i+1>=s.length){o+=c;continue}
    const e=s[i+1];
    if(e>='0'&&e<='7'){let j=i+1,v=0;while(j<i+4&&s[j]>='0'&&s[j]<='7'){v=v*8+(s.charCodeAt(j)-48);j++}o+=String.fromCharCode(v&255);i=j-1;continue}
    if(SQ.own(ESC,e)){o+=ESC[e];i++;continue}
    o+='\\'+e;i++}
  return o}

/* ---- ERE -> JS ---- */
const CLASS={alpha:'a-zA-Z',digit:'0-9',alnum:'a-zA-Z0-9',upper:'A-Z',lower:'a-z',space:' \\t\\n\\r\\f\\v',blank:' \\t',
  punct:'!-\\/:-@\\[-`{-~',xdigit:'0-9A-Fa-f',cntrl:'\\x00-\\x1f\\x7f',print:' -~',graph:'!-~'};
const RE_ESC={n:'\\n',t:'\\t',r:'\\r',f:'\\f',v:'\\v',a:'\\x07',b:'\\x08','/':'\\/','"':'"'};
const jsLit=c=>/[\\^$.*+?()[\]{}|\/-]/.test(c)?'\\'+c:c;
const clsLit=c=>/[\\\]\[^-]/.test(c)?'\\'+c:c;
const isAlnum=c=>/[A-Za-z0-9]/.test(c);
function bracketJs(p,i){let j=i+1,o='[';
  if(p[j]==='^'){o+='^';j++}
  if(p[j]===']'){o+='\\]';j++}
  for(;;){if(j>=p.length)return null;const c=p[j];
    if(c===']')return {src:o+']',end:j+1};
    if(c==='['&&(p[j+1]===':'||p[j+1]==='.'||p[j+1]==='=')){const k=p[j+1],e=p.indexOf(k+']',j+2);
      if(e>=0){const nm=p.slice(j+2,e);
        if(k===':'){if(!SQ.own(CLASS,nm))return null;o+=CLASS[nm]}else o+=nm.split('').map(clsLit).join('');
        j=e+2;continue}}
    if(c==='\\'&&j+1<p.length){const d=p[j+1];o+=SQ.own(RE_ESC,d)?RE_ESC[d]:isAlnum(d)?d:'\\'+d;j+=2;continue}
    o+=c==='-'?'-':clsLit(c);j++}}
/* JS source for an awk ERE, or null when it is malformed */
function ereToJs(p){let o='',i=0,atom=-1,quant=false;const open=[],n=p.length;
  const put=s=>{atom=o.length;o+=s;quant=false};
  const anchor=s=>{o+=s;atom=-1;quant=false};
  const q=s=>{if(quant)o=o.slice(0,atom)+'(?:'+o.slice(atom)+')';o+=s;quant=true};
  while(i<n){const c=p[i];
    if(c==='\\'){if(i+1>=n){put('\\\\');i++;continue}
      const d=p[i+1];i+=2;
      if(SQ.own(RE_ESC,d)){put(RE_ESC[d]);continue}
      if(d==='y'){anchor('\\b');continue}
      if(d==='B'){anchor('\\B');continue}
      if(d==='<'){anchor('\\b(?=\\w)');continue}
      if(d==='>'){anchor('\\b(?<=\\w)');continue}
      if('wWsS'.includes(d)){put('\\'+d);continue}
      if(d>='0'&&d<='7'){let v=d.charCodeAt(0)-48,k=0;while(k<2&&p[i]>='0'&&p[i]<='7'){v=v*8+p.charCodeAt(i)-48;i++;k++}put(jsLit(String.fromCharCode(v&255)));continue}
      put(jsLit(d));continue}
    if(c==='['){const r=bracketJs(p,i);if(!r)return null;put(r.src);i=r.end;continue}
    i++;
    if(c==='('){open.push(o.length);o+='(?:';atom=-1;quant=false;continue}
    if(c===')'){if(!open.length)return null;const a=open.pop();o+=')';atom=a;quant=false;continue}
    if(c==='|'){anchor('|');continue}
    if(c==='*'||c==='+'||c==='?'){if(atom<0){put('\\'+c);continue}q(c);continue}
    if(c==='{'){const m=/^(\d+)(,(\d*))?\}/.exec(p.slice(i));
      if(m&&atom>=0){if(m[3]&&+m[3]<+m[1])return null;if(+m[1]>255||(m[3]&&+m[3]>255))return null;q('{'+m[0]);i+=m[0].length;continue}
      put('\\{');continue}
    if(c==='^'||c==='$'){anchor(c);continue}
    if(c==='.'){put('.');continue}
    put(jsLit(c))}
  if(open.length)return null;
  return o}

/* ---- the interpreter ---- */
function awkRun(progText,inputs,o){o=o||{};inputs=inputs||[];
  let prog;
  try{prog=SQ.awkParse(progText)}catch(e){if(e&&e.awkErr)return {out:'',err:e.message,code:e.code||2};if(SQ.isOverflow(e))return {out:'',err:NEST,code:2};throw e}
  const LIM=SQ.LIM,step=SQ.step;
  const out=[];let outLen=0;
  const G=Object.create(null);let frame=null,depth=0,curLine=0,retVal,exitCode=0;
  let rec0='',flds=[null],nf=0,seed=0,lcg=0;
  const fail=(msg,line)=>new AwkErr(msg,line===undefined?curLine:line);
  const chk=s=>{if(s.length>LIM.VAR)throw new SQ.StepLimit('a value grew too large');return s};
  const emit=s=>{outLen+=s.length;if(outLen>LIM.TEXT)throw OUT_CAP;out.push(s)};

  /* regexes: literals compiled up front (below), dynamic ones cached by source */
  const cache=new Map();
  function compile(src,line){
    if(cache.has(src))return cache.get(src);
    const js=ereToJs(src);
    if(js===null)throw new AwkErr(`syntax error in regular expression ${src} at source line ${line===undefined?curLine:line}`,-1);
    let re;
    try{re=SQ.safeRegex(js,'gs')}
    catch(e){if(e&&e.complex)throw new AwkErr(e.message,-1);throw new AwkErr(`syntax error in regular expression ${src} at source line ${line===undefined?curLine:line}`,-1)}
    if(cache.size>=CACHE_MAX)cache.clear();
    cache.set(src,re);return re}
  const reOf=(node)=>node.type==='regex'?node.re:compile(toStr(ev(node)));
  const test=(re,s)=>{re.lastIndex=0;return re.test(s)};

  /* ---- values ---- */
  /* OFMT/CONVFMT: one numeric conversion (and any %%); anything else is unusable and %.6g is used instead */
  const fmtOf=name=>{const f=G[name],s=typeof f==='string'?f:f instanceof SN?f.s:'';return USABLE_FMT.test(s)?s:'%.6g'};
  function numStr(x,fmtName){
    if(Number.isInteger(x)&&x>=-9223372036854775808&&x<9223372036854775808)return Math.abs(x)<9007199254740992?String(x):BigInt(x).toString();
    if(!Number.isFinite(x))return jsRepr(x);
    return format(fmtOf(fmtName),[x],true)}
  function toStr(v){if(v===undefined)return '';if(typeof v==='string')return v;if(v instanceof SN)return v.s;return numStr(v,'CONVFMT')}
  function toNum(v){if(v===undefined)return 0;if(typeof v==='number')return v;if(v instanceof SN)return v.n;return strToNum(v)}
  const outStr=v=>typeof v==='number'?numStr(v,'OFMT'):toStr(v);
  function truthy(v){if(v===undefined)return false;if(typeof v==='number')return v!==0;if(v instanceof SN)return v.n!==0;return v!==''}

  /* printf/sprintf through SQ.fmtPrintf */
  const DIR=/%([-+#0]*)(\*|\d+)?(?:\.(\*|\d*))?([hlLj]*)([a-zA-Z%])/g;
  function format(fmt,vals,quiet){
    let f='',last=0,ai=0;const args=[];
    const take=()=>{if(ai>=vals.length){if(quiet)return 0;throw fail(`not enough args in printf(${fmt})`)}return vals[ai++]};
    const intArg=v=>{const n=Math.trunc(toNum(v));return Number.isFinite(n)?BigInt(n).toString():null};
    for(const m of fmt.matchAll(DIR)){ /* matchAll: format is re-entrant (a %s of a number formats it through CONVFMT) */
      f+=fmt.slice(last,m.index).replace(/\\/g,'\\\\');last=m.index+m[0].length;
      let [all,fl,w,pr,lm,cv]=m;
      if(cv==='%'){f+=all;continue}
      if(!'cdiouxXeEfFgGs'.includes(cv)){f+=all.replace('%','%%');continue}
      if(w==='*'){const n=intArg(take());args.push(n===null?'0':n)}
      if(pr==='*'){const n=intArg(take());args.push(n===null?'0':n)}
      const v=take();
      if(cv==='c'){
        if(typeof v==='number'||v instanceof SN){const n=Math.trunc(toNum(v));args.push(n>=0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'')}
        else args.push(toStr(v))}
      else if('diouxX'.includes(cv)){const n=intArg(v);if(n===null){cv='f';pr=undefined;args.push(jsRepr(toNum(v)))}else args.push(n);if(cv==='i')cv='d'}
      else if(cv==='s')args.push(quiet&&typeof v==='number'?jsRepr(v):toStr(v));
      else args.push(jsRepr(toNum(v)));
      f+='%'+fl+(w||'')+(pr!==undefined?'.'+pr:'')+lm+cv}
    f+=fmt.slice(last).replace(/\\/g,'\\\\');
    const r=SQ.fmtPrintf(f,args);
    if(r.err&&!quiet&&/too large/.test(r.err))throw fail(r.err.split('\n')[0].replace(/^(bash: )?printf: /,'printf: '));
    return chk(r.text)}

  /* ---- records and fields ---- */
  function splitStr(s,fs,isRe){
    if(!isRe&&fs===' '){const t=s.replace(/^[ \t\n]+|[ \t\n]+$/g,'');return t===''?[]:t.split(/[ \t\n]+/)}
    if(s==='')return [];
    if(!isRe&&fs==='')return Array.from(s);
    if(!isRe&&fs.length===1)return s.split(fs);
    const re=isRe?fs:compile(fs),parts=[];let pos=0,lastEnd=0,work=0;
    while(pos<=s.length){re.lastIndex=pos;const mm=re.exec(s);if(!mm)break;
      if(++work%1000===0)step();
      if(mm[0].length===0){pos=mm.index+1;continue}
      parts.push(s.slice(lastEnd,mm.index));pos=lastEnd=mm.index+mm[0].length}
    parts.push(s.slice(lastEnd));return parts}
  function setRecord(s){rec0=mkInput(s);const parts=splitStr(s,toStr(G.FS),false);flds=[null];for(const p of parts)flds.push(mkInput(p));nf=parts.length}
  function rebuild(){const ofs=toStr(G.OFS);let s='';for(let i=1;i<=nf;i++){if(i>1)s+=ofs;s+=toStr(flds[i]);if(s.length>LIM.VAR)chk(s)}rec0=mkInput(s)}
  function fieldIndex(v){const n=toNum(v);
    if(!Number.isFinite(n))throw fail(`trying to access out of range field ${jsRepr(n)}`);
    const i=Math.trunc(n);
    if(i<0||(i>MAX_FIELD&&i>nf))throw fail(`trying to access out of range field ${intText(i)}`);
    return i}
  const getField=i=>i===0?rec0:i<=nf?flds[i]:'';
  function setField(i,v){
    if(i===0){setRecord(chk(toStr(v)));return}
    while(nf<i)flds[++nf]='';
    flds[i]=v;rebuild()}
  function setNF(v){const n=Math.trunc(toNum(v));
    if(!(n>=0))throw fail('cannot set NF to a negative value');
    if(n>MAX_FIELD&&n>nf)throw fail(`trying to access out of range field ${intText(n)}`);
    while(nf<n)flds[++nf]='';
    nf=n;flds.length=n+1;rebuild()}

  /* ---- variables and arrays ---- */
  const scopeOf=name=>frame&&name in frame?frame:G;
  function getVar(name){const sc=scopeOf(name),v=sc[name];
    if(v instanceof Arr||(v instanceof Lazy&&v.arr))throw fail(`can't use array ${name} in scalar context`);
    if(v instanceof Lazy)return undefined;
    if(sc===G&&name==='NF')return nf;
    return v}
  function setVar(name,v){const sc=scopeOf(name),cur=sc[name];
    if(cur instanceof Arr||(cur instanceof Lazy&&cur.arr))throw fail(`can't assign to ${name}; it's an array name.`);
    if(sc===G&&name==='NF'){setNF(v);return}
    sc[name]=v}
  function materialize(lz){if(lz.arr)return lz.arr;
    const cur=lz.scope[lz.name];let arr;
    if(cur instanceof Arr)arr=cur;else if(cur instanceof Lazy)arr=materialize(cur);
    else if(cur===undefined){arr=new Arr();lz.scope[lz.name]=arr}else arr=new Arr();
    return lz.arr=arr}
  function getArr(name){const sc=scopeOf(name),v=sc[name];
    if(v instanceof Arr)return v;
    if(v instanceof Lazy){const a=materialize(v);sc[name]=a;return a}
    if(v===undefined&&!(sc===G&&name==='NF')){const a=new Arr();sc[name]=a;return a}
    throw fail(`can't use scalar ${name} as array`)}
  const isArrVar=name=>{const v=scopeOf(name)[name];return v instanceof Arr||(v instanceof Lazy&&!!v.arr)};
  function subKey(subs){if(subs.length===1)return toStr(ev(subs[0]));const sep=toStr(G.SUBSEP);return chk(subs.map(s=>toStr(ev(s))).join(sep))}
  function arrGet(arr,key){if(!arr.m.has(key)){arr.m.set(key,undefined);return undefined}return arr.m.get(key)}
  function ref(t){
    if(t.type==='var')return {get:()=>getVar(t.name),set:v=>setVar(t.name,v)};
    if(t.type==='field'){const i=fieldIndex(ev(t.expr));return {get:()=>getField(i),set:v=>setField(i,v)}}
    const arr=getArr(t.name),key=subKey(t.subs);return {get:()=>arrGet(arr,key),set:v=>{arr.m.set(key,v)}}}

  /* ---- expressions ---- */
  function arith(op,a,b,assignOp){
    switch(op){
      case '+':return a+b;case '-':return a-b;case '*':return a*b;
      case '/':if(b===0)throw fail(assignOp?'division by zero in /=':'division by zero');return a/b;
      case '%':if(b===0)throw fail(assignOp?'division by zero in %=':'division by zero in %');return a%b;
      default:return Math.pow(a,b)}}
  function compare(op,a,b){let x,y;
    if(isNumish(a)&&isNumish(b)){x=toNum(a);y=toNum(b)}else{x=toStr(a);y=toStr(b)}
    switch(op){case '<':return x<y;case '<=':return x<=y;case '==':return x===y;case '!=':return x!==y;case '>':return x>y;default:return x>=y}}
  function ev(e){
    switch(e.type){
      case 'num':case 'str':return e.value;
      case 'regex':return test(e.re,toStr(rec0))?1:0;
      case 'grouping':{let v;for(const x of e.exprs)v=ev(x);return v}
      case 'var':return getVar(e.name);
      case 'field':return getField(fieldIndex(ev(e.expr)));
      case 'index':{const arr=getArr(e.name);return arrGet(arr,subKey(e.subs))}
      case 'assign':{
        if(e.op==='='){const v=ev(e.value);const r=ref(e.target);r.set(v);return v}
        const r=ref(e.target),cur=toNum(r.get()),v=arith(e.op[0],cur,toNum(ev(e.value)),true);r.set(v);return v}
      case 'cond':return truthy(ev(e.test))?ev(e.yes):ev(e.no);
      case 'logical':return e.op==='&&'?(truthy(ev(e.left))&&truthy(ev(e.right))?1:0):(truthy(ev(e.left))||truthy(ev(e.right))?1:0);
      case 'in':{const arr=getArr(e.name);return arr.m.has(subKey(e.subs))?1:0}
      case 'match':{const s=toStr(ev(e.left)),re=reOf(e.right);return test(re,s)===(e.op==='~')?1:0}
      case 'compare':{const a=ev(e.left),b=ev(e.right);return compare(e.op,a,b)?1:0}
      case 'concat':{const a=toStr(ev(e.left)),b=toStr(ev(e.right));if(a.length+b.length>LIM.VAR)chk(a+b);return a+b}
      case 'binary':{const a=toNum(ev(e.left)),b=toNum(ev(e.right));return arith(e.op,a,b,false)}
      case 'unary':{const v=ev(e.expr);return e.op==='!'?(truthy(v)?0:1):e.op==='-'?-toNum(v):toNum(v)}
      case 'incdec':{const r=ref(e.target),old=toNum(r.get()),nv=e.op==='++'?old+1:old-1;r.set(nv);return e.prefix?nv:old}
      case 'call':return e.builtin?builtin(e):callUser(e);
    }
    throw fail('internal error: unknown expression '+e.type)}

  function subst(e,global){
    const re=reOf(e.args[0]),repl=toStr(ev(e.args[1]));
    const r=e.args.length>2?ref(e.args[2]):{get:()=>rec0,set:v=>setField(0,v)};
    const s=toStr(r.get());let res='',pos=0,lastEnd=-1,count=0,work=0;
    const expand=mt=>{let t='';for(let i=0;i<repl.length;i++){const c=repl[i];
        if(c==='\\'&&(repl[i+1]==='&'||repl[i+1]==='\\')){t+=repl[++i];continue}
        t+=c==='&'?mt:c}return t};
    while(pos<=s.length){re.lastIndex=pos;const mm=re.exec(s);if(!mm)break;
      if(++work%1000===0)step();
      const at=mm.index,len=mm[0].length;
      if(len===0&&at===lastEnd){if(at<s.length)res+=s[at];pos=at+1;continue}
      res+=s.slice(pos,at)+expand(mm[0]);count++;
      if(res.length>LIM.VAR)chk(res);
      if(len===0){if(at<s.length)res+=s[at];pos=at+1}else pos=lastEnd=at+len;
      if(!global)break}
    if(!count)return 0;
    if(pos<s.length)res+=s.slice(pos);
    r.set(chk(res));return count}

  function builtin(e){const a=e.args;
    switch(e.name){
      case 'length':
        if(!a.length)return toStr(rec0).length;
        if(a[0].type==='var'&&isArrVar(a[0].name))return getArr(a[0].name).m.size;
        return toStr(ev(a[0])).length;
      case 'substr':{const s=toStr(ev(a[0]));const m=roundHE(toNum(ev(a[1])));
        let end=Infinity;if(a.length>2){const n=toNum(ev(a[2]));end=m+roundHE(n)}
        if(Number.isNaN(m)||Number.isNaN(end))return '';
        const start=Math.max(m,1),stop=Math.min(end,s.length+1);
        return stop<=start?'':s.slice(start-1,stop-1)}
      case 'index':{const s=toStr(ev(a[0])),t=toStr(ev(a[1]));return s.indexOf(t)+1}
      case 'split':{const s=toStr(ev(a[0]));let parts;
        if(a.length<3)parts=splitStr(s,toStr(G.FS),false);
        else if(a[2].type==='regex')parts=s===''?[]:splitStr(s,a[2].re,true);
        else parts=splitStr(s,toStr(ev(a[2])),false);
        const arr=getArr(a[1].name);arr.m.clear();parts.forEach((p,i)=>arr.m.set(String(i+1),mkInput(p)));return parts.length}
      case 'sub':return subst(e,false);
      case 'gsub':return subst(e,true);
      case 'match':{const s=toStr(ev(a[0])),re=reOf(a[1]);re.lastIndex=0;const mm=re.exec(s);
        if(mm){G.RSTART=mm.index+1;G.RLENGTH=mm[0].length}else{G.RSTART=0;G.RLENGTH=-1}return G.RSTART}
      case 'sprintf':{const vals=a.map(ev);return format(toStr(vals[0]),vals.slice(1),false)}
      case 'sin':return Math.sin(toNum(ev(a[0])));
      case 'cos':return Math.cos(toNum(ev(a[0])));
      case 'atan2':{const y=toNum(ev(a[0]));return Math.atan2(y,toNum(ev(a[1])))}
      case 'exp':return Math.exp(toNum(ev(a[0])));
      case 'log':return Math.log(toNum(ev(a[0])));
      case 'sqrt':return Math.sqrt(toNum(ev(a[0])));
      case 'int':return Math.trunc(toNum(ev(a[0])));
      case 'rand':lcg=(Math.imul(lcg,1103515245)+12345)&0x7fffffff;return lcg/2147483648;
      case 'srand':{const prev=seed;const n=a.length?Math.trunc(toNum(ev(a[0]))):Math.trunc(SQ.rt.clock||0);
        seed=Number.isFinite(n)?n:0;lcg=seed&0x7fffffff;return prev}
      case 'tolower':return toStr(ev(a[0])).toLowerCase();
      case 'toupper':return toStr(ev(a[0])).toUpperCase();
    }
    throw fail('internal error: unknown builtin '+e.name)}

  function callUser(e){const f=prog.funcs[e.name];
    if(e.args.length>f.params.length)throw fail(`function ${e.name} called with ${e.args.length} args, uses only ${f.params.length}`);
    if(depth>=MAX_CALLS)throw fail(`function calls nested too deeply (over ${MAX_CALLS}) in this practice shell`);
    step();
    const nfr=Object.create(null);
    f.params.forEach((p,i)=>{const x=e.args[i];
      if(!x){nfr[p]=undefined;return}
      if(x.type==='var'){const sc=scopeOf(x.name),v=sc[x.name];
        if(v instanceof Arr||v instanceof Lazy)nfr[p]=v;
        else if(v===undefined&&!(sc===G&&x.name==='NF'))nfr[p]=new Lazy(sc,x.name);
        else nfr[p]=getVar(x.name);
        return}
      nfr[p]=ev(x)});
    const saved=frame,line=curLine;frame=nfr;depth++;
    try{retVal=undefined;const r=execList(f.body);const v=r===RET?retVal:undefined;retVal=undefined;return v}
    finally{frame=saved;depth--;curLine=line}}

  /* ---- statements ---- */
  function execList(list){for(const s of list){const r=execStmt(s);if(r)return r}return 0}
  function loopBody(body){const r=execList(body);return r===CONT?0:r}
  function execStmt(s){curLine=s.line;
    switch(s.type){
      case 'print':{let line;
        if(!s.args.length)line=toStr(rec0);
        else{const parts=s.args.map(x=>outStr(ev(x)));line=parts.join(toStr(G.OFS))}
        emit(line+toStr(G.ORS));return 0}
      case 'printf':{const vals=s.args.map(ev);emit(format(toStr(vals[0]),vals.slice(1),false));return 0}
      case 'expr':ev(s.expr);return 0;
      case 'if':return truthy(ev(s.test))?execList(s.then):s.else?execList(s.else):0;
      case 'while':while(truthy(ev(s.test))){step();const r=loopBody(s.body);if(r===BRK)break;if(r)return r}return 0;
      case 'do':do{step();const r=loopBody(s.body);if(r===BRK)break;if(r)return r}while(truthy(ev(s.test)));return 0;
      case 'for':if(s.init)ev(s.init);
        for(;;){if(s.test&&!truthy(ev(s.test)))break;step();const r=loopBody(s.body);if(r===BRK)break;if(r)return r;if(s.step)ev(s.step)}
        return 0;
      case 'forin':{const arr=getArr(s.name);
        for(const k of Array.from(arr.m.keys())){if(!arr.m.has(k))continue;step();setVar(s.var,k);const r=loopBody(s.body);if(r===BRK)break;if(r)return r}
        return 0}
      case 'delete':{const arr=getArr(s.name);if(s.subs)arr.m.delete(subKey(s.subs));else arr.m.clear();return 0}
      case 'next':throw NEXT_SIG;
      case 'exit':if(s.value){const n=Math.trunc(toNum(ev(s.value)));exitCode=Number.isFinite(n)?((n%256)+256)%256:0}throw EXIT_SIG;
      case 'return':retVal=s.value?ev(s.value):undefined;return RET;
      case 'block':return execList(s.body);
      case 'break':return BRK;
      case 'continue':return CONT;
    }
    throw fail('internal error: unknown statement '+s.type)}

  /* compile every regex literal before anything runs */
  function precompile(node,line){
    if(Array.isArray(node)){for(const x of node)precompile(x,line);return}
    if(!node||typeof node!=='object')return;
    if(typeof node.line==='number')line=node.line;
    if(node.type==='regex'&&typeof node.source==='string'){node.re=compile(node.source,line);return}
    for(const k of Object.keys(node))if(k!=='re'&&node[k]&&typeof node[k]==='object')precompile(node[k],line)}

  /* ---- set up ---- */
  Object.assign(G,{FS:o.FS!==undefined?unesc(String(o.FS)):' ',OFS:' ',ORS:'\n',RS:'\n',NR:0,FNR:0,FILENAME:'',SUBSEP:'\x1c',
    RSTART:0,RLENGTH:-1,CONVFMT:'%.6g',OFMT:'%.6g'});
  const argv=new Arr();argv.m.set('0','awk');(o.argv||[]).forEach((x,i)=>argv.m.set(String(i+1),mkInput(x)));G.ARGV=argv;G.ARGC=argv.m.size;
  const env=new Arr();for(const [k,v] of Object.entries(o.env||{}))env.m.set(k,mkInput(String(v)));G.ENVIRON=env;
  const errs=[];let code=0;
  const runBlocks=(blocks)=>{for(const b of blocks){try{execList(b)}catch(e){if(e===NEXT_SIG)throw fail('next used in a BEGIN or END action');throw e}}};
  function runRules(){
    try{prog.rules.forEach((r,ri)=>{curLine=r.line;let hit;
        if(r.pat2){if(inRange[ri]){hit=true;if(truthy(ev(r.pat2)))inRange[ri]=false}
          else if(truthy(ev(r.pat))){hit=true;if(!truthy(ev(r.pat2)))inRange[ri]=true}
          else hit=false}
        else hit=!r.pat||truthy(ev(r.pat));
        if(!hit)return;
        if(!r.action)emit(toStr(rec0)+toStr(G.ORS));else execList(r.action)})}
    catch(e){if(e!==NEXT_SIG)throw e}}
  const inRange=prog.rules.map(()=>false);
  function feed(name,text){G.FILENAME=name;G.FNR=0;
    if(text==='')return;
    const ls=(text.endsWith('\n')?text.slice(0,-1):text).split('\n');
    for(const line of ls){step();
      if(toStr(G.RS)!=='\n')throw RS_SIG;
      G.NR=toNum(G.NR)+1;G.FNR=toNum(G.FNR)+1;setRecord(line);runRules()}}
  try{
    precompile(prog);
    for(const [k,v] of Object.entries(o.vars||{}))setVar(k,mkInput(unesc(String(v))));
    let exiting=false;
    try{runBlocks(prog.begin)}catch(e){if(e===EXIT_SIG)exiting=true;else throw e}
    if(!exiting&&(prog.rules.length||prog.end.length)){
      try{let files=false;
        for(const inp of inputs){
          if(inp.assign!==undefined){setVar(inp.assign,mkInput(unesc(String(inp.value))));continue}
          if(inp.warn!==undefined){errs.push('awk: '+inp.warn);continue}
          files=true;
          if(inp.error!==undefined)throw new AwkErr(inp.error,-1);
          feed(inp.name,inp.text)}
        if(!files)feed('',o.stdin||'')}
      catch(e){if(e===EXIT_SIG)exiting=true;else throw e}}
    try{runBlocks(prog.end)}catch(e){if(e!==EXIT_SIG)throw e}
    code=exitCode}
  catch(e){
    if(e===OUT_CAP)return {out:'',err:errs.concat('awk: output too large for this practice shell').join('\n'),code:1};
    if(e===RS_SIG)return {out:out.join(''),err:errs.concat('this practice shell does not support awk RS other than a newline yet').join('\n'),code:2};
    if(SQ.isOverflow(e))return {out:out.join(''),err:errs.concat(NEST).join('\n'),code:2};
    if(!(e instanceof AwkErr))throw e;
    errs.push('awk: '+e.message+(e.line>0?'\n source line number '+e.line:''));code=2}
  return {out:out.join(''),err:errs.join('\n'),code}}

/* ---- the command ---- */
/* awk [-F fs] [-v name=value]... [-f progfile]... [--] ['program'] [file | name=value]...  ('-' is stdin) */
const USAGE='usage: awk [-F fs][-v var=value][prog | -f progfile][file ...]';
const NAME=/^[A-Za-z_][A-Za-z0-9_]*$/;
SQ.CMDS.awk=function(a,io){
  const {E,norm,getNode}=SQ;
  let FS;const vars=Object.create(null),progFiles=[];let i=0;
  for(;i<a.length;i++){const x=a[i];
    if(x==='--'){i++;break}
    if(x.length<2||x[0]!=='-')break;
    if(x[1]==='-')return E(`this practice shell does not support awk ${x.split('=')[0]} yet`,2);
    const k=x[1];
    if(k!=='F'&&k!=='v'&&k!=='f')return E(`this practice shell does not support awk -${k} yet`,2);
    let v=x.slice(2);
    if(v===''){if(i+1>=a.length)return E(`awk: option requires an argument -- ${k}\n${USAGE}`,2);v=a[++i]}
    if(k==='F')FS=v;
    else if(k==='f')progFiles.push(v);
    else{const eq=v.indexOf('=');if(eq<1||!NAME.test(v.slice(0,eq)))return E(`awk: improper assignment: -v ${v}`,2);vars[v.slice(0,eq)]=v.slice(eq+1)}}
  const rest=a.slice(i);
  let prog;
  if(progFiles.length){const parts=[];
    for(const f of progFiles){
      if(f==='-'){parts.push(io.stdin);continue}
      const nd=SQ.isNull(f)?{type:'file',content:''}:getNode(norm(f));
      if(!nd||nd.type!=='file')return E(`awk: can't open file ${f}`,2);
      parts.push(nd.content)}
    prog=parts.join('\n')}
  else{if(!rest.length)return E(USAGE,2);prog=rest.shift()}
  const inputs=[];
  for(const x of rest){const eq=x.indexOf('=');
    if(eq>0&&NAME.test(x.slice(0,eq))){inputs.push({assign:x.slice(0,eq),value:x.slice(eq+1)});continue}
    if(x==='-'){inputs.push({name:'-',text:io.stdin});continue}
    if(SQ.isNull(x)){inputs.push({name:x,text:''});continue}
    const abs=norm(x),nd=getNode(abs);
    if(!nd)inputs.push({name:x,error:`can't open file ${x}`});
    else if(nd.type==='dir')inputs.push({name:x,warn:`warning: command line argument \`${x}' is a directory: skipped`});
    else inputs.push({name:x,text:nd.content})}
  const env={};for(const k of ['HOME','USER','SHELL','HOSTNAME','PATH','PWD'])if(SQ.isSet(k))env[k]=SQ.getVar(k);
  for(const k of Object.keys(SQ.S.exp||{}))if(SQ.own(SQ.S.vars,k))env[k]=SQ.S.vars[k];
  const r=awkRun(prog,inputs,{FS,vars,stdin:io.stdin,argv:rest,env});
  return {out:r.out.endsWith('\n')?r.out.slice(0,-1):r.out,err:r.err?r.err.split('\n'):[],code:r.code}};

Object.assign(SQ,{awkRun,awkEreToJs:ereToJs});
})(window.SQ = window.SQ || {});
