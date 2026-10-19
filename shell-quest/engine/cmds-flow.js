(function (SQ) {
/* Task 7: conditions and stateful builtins. [ test and [[ share one expression parser (SQ.evalCond is the [[ entry point); true false : read shift unset exit source . live here too.
   break continue local return stay in exec.js / interp.js (they need the interpreter's loop and frame plumbing). */
const S=SQ.S;
const {CMDS,E,ok,norm,getNode,lstat,isLoop,modeOf,CTX,expandStr}=SQ;
const errL=text=>({text,cls:'err'});
const {errOf}=SQ;
const ce=(m,code=2)=>Object.assign(new Error(m),{raw:true,code});
const NAME=/^[A-Za-z_]\w*$/;
const BUILTIN_NAMES=['HOME','USER','SHELL','HOSTNAME','PATH']; /* the variables a fresh shell already has; `unset` hides them through S.unsetB (see getVar in parse.js) */

/* ---------- test expressions ----------
   Tokens are {raw}: for [ and test the raw text IS the already-expanded value; for [[ it is source text expanded lazily (no word splitting, no globbing) so && and || short-circuit.
   or := and (OR and)*   and := not (AND not)*   not := ! not | primary   primary := ( or ) | UNARY word | word BINARY word | word      (OR/AND: -o -a for [, || && for [[)
   or/and nodes hold a flat list of operands (a long chain is not a deep tree), and ! and ( ) nest at most NEST deep, so evaluation never overflows the JS stack. */
const NEST=100;
const UN=new Set(['-e','-f','-d','-r','-w','-x','-s','-L','-h','-z','-n']);
const BIN=new Set(['=','==','!=','<','>','-eq','-ne','-lt','-le','-gt','-ge']);
function parseTest(T,d,name){
  let p=0,dep=0;const OR=d?'||':'-o',AND=d?'&&':'-a',stop=new Set([')',OR,AND]);
  const deeper=f=>{if(dep>=NEST)throw ce('bash: '+SQ.NEST_DEEP);dep++;try{return f()}finally{dep--}};
  const bad=why=>{throw ce(d?'bash: syntax error in conditional expression':`bash: ${name}: ${why}`)};
  const at=i=>T[i]&&T[i].raw;
  const orE=()=>{const xs=[andE()];while(at(p)===OR){p++;xs.push(andE())}return xs.length>1?{k:'or',xs}:xs[0]};
  const andE=()=>{const xs=[notE()];while(at(p)===AND){p++;xs.push(notE())}return xs.length>1?{k:'and',xs}:xs[0]};
  const notE=()=>{if(at(p)==='!'&&p+1<T.length){p++;return {k:'not',e:deeper(notE)}}return prim()};
  function prim(){
    const a=T[p];if(!a)return bad('argument expected');
    if(a.raw==='('&&(d||p+1<T.length)){p++;const e=deeper(orE);if(at(p)!==')')return bad("')' expected");p++;return e}
    const b=T[p+1],c=T[p+2];
    if(b&&c&&(BIN.has(b.raw)||(d&&b.raw==='=~'))&&!(d&&stop.has(c.raw))){p+=3;return {k:'bin',op:b.raw,a,b:c}}
    if(UN.has(a.raw)&&b&&!stop.has(b.raw)){p+=2;return {k:'un',op:a.raw,a:b}}
    if(d&&(stop.has(a.raw)||a.raw==='<'||a.raw==='>'))return bad('');
    p++;return {k:'str',a}}
  const tree=orE();
  if(p<T.length){if(d)return bad('');
    if(T.length>4)return bad('too many arguments');
    return bad(BIN.has(T[p].raw)?`${T[p].raw}: unary operator expected`:`${T[p-1].raw}: binary operator expected`)}
  return tree}

/* [[ words: quotes, $ forms and backslashes are kept in raw; ( ) && || < > and blanks outside quotes separate tokens. The word after =~ runs to a blank outside quotes and balanced parentheses. */
function condTokens(raw){
  const T=[],n=raw.length,syn=()=>ce('bash: syntax error in conditional expression');let i=0,rxNext=false;
  while(i<n){const c=raw[i];
    if(/\s/.test(c)){i++;continue}
    if(!rxNext){
      if(c==='('||c===')'||c==='<'||c==='>'){T.push({raw:c});i++;continue}
      if((c==='&'||c==='|')&&raw[i+1]===c){T.push({raw:c+c});i+=2;continue}
      if(c==='&'||c==='|')throw syn()}
    let j=i,depth=0;
    try{while(j<n){const ch=raw[j];
      if(ch==="'"){const k=raw.indexOf("'",j+1);if(k<0)throw syn();j=k+1;continue}
      if(ch==='"'){j++;while(j<n&&raw[j]!=='"'){if(raw[j]==='\\')j++;else if(raw[j]==='$'&&raw[j+1]==='(')j=SQ.scanSub(raw,j);j++}if(j>=n)throw syn();j++;continue}
      if(ch==='\\'){j+=2;continue}
      if(ch==='$'&&raw[j+1]==='('){j=SQ.scanSub(raw,j)+1;continue}
      if(ch==='$'&&raw[j+1]==='{'){j=SQ.scanBrace(raw,j,false)+1;continue}
      if(rxNext){if(ch==='(')depth++;else if(ch===')'){if(depth===0)break;depth--}else if(/\s/.test(ch)&&depth===0)break}
      else if(/[\s()<>&|]/.test(ch))break;
      j++}}
    catch(e){if(e.raw)throw e;throw syn()}
    if(j>n)j=n;
    const w=raw.slice(i,j);T.push({raw:w});i=j;rxNext=!rxNext&&w==='=~'?true:false}
  return T}

function fileTest(op,p){
  if(p==='')return false;
  const abs=norm(p);
  if(op==='-L'||op==='-h'){const n=lstat(abs);return !!n&&n.type==='link'}
  const n=getNode(abs);if(!n)return false;
  switch(op){
    case '-e':return true;
    case '-f':return n.type==='file';
    case '-d':return n.type==='dir';
    case '-s':return n.type==='dir'||n.content.length>0;
    case '-r':return (modeOf(n)&0o400)!==0;
    case '-w':return (modeOf(n)&0o200)!==0;
    case '-x':return (modeOf(n)&0o100)!==0}
  return false}

/* the regex of [[ a =~ rx ]]: backslash escapes in unquoted parts stay regex escapes, quoted parts are literal text */
function regexSrc(raw){let o='',run='',i=0;const n=raw.length;
  const flush=()=>{if(run){o+=expandStr(run.replace(/\\/g,'\\\\'));run=''}};
  const lit=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  while(i<n){const c=raw[i];
    if(c==="'"||c==='"'){let k=i+1;while(k<n&&raw[k]!==c){if(c==='"'&&raw[k]==='\\')k++;k++}
      flush();o+=lit(expandStr(raw.slice(i,k+1)));i=k+1;continue}
    if(c==='\\'&&i+1<n){run+=raw.slice(i,i+2);i+=2;continue}
    run+=c;i++}
  flush();return o}

const INT=/^\s*[+-]?\d+\s*$/;
function evalTree(tree,d,name){
  const val=t=>d?expandStr(t.raw):t.raw;
  const num=t=>{if(d)return BigInt(SQ.arithVal(t.raw));
    if(!INT.test(t.raw))throw ce(`bash: ${name}: ${t.raw}: integer expression expected`);return BigInt(t.raw.trim())};
  const ev=n=>{switch(n.k){
    case 'or':return n.xs.some(ev);
    case 'and':return n.xs.every(ev);
    case 'not':return !ev(n.e);
    case 'str':return val(n.a)!=='';
    case 'un':{const v=val(n.a);
      if(n.op==='-z')return v==='';if(n.op==='-n')return v!=='';
      return fileTest(n.op,v)}
    case 'bin':{const op=n.op;
      if(op==='=~'){const a=val(n.a),pat=regexSrc(n.b.raw);let re;
        try{re=SQ.safeRegex(pat,'')}catch(e){throw ce(e.complex?`bash: [[: ${e.message}`:`bash: [[: invalid regular expression: ${pat}`)}
        return re.test(a)}
      if(op==='='||op==='=='||op==='!='){const a=val(n.a),m=d?SQ.patMatch(a,n.b.raw):a===val(n.b);return op==='!='?!m:m}
      if(op==='<'||op==='>'){const a=val(n.a),b=val(n.b);return op==='<'?a<b:a>b}
      const x=num(n.a),y=num(n.b);
      return op==='-eq'?x===y:op==='-ne'?x!==y:op==='-lt'?x<y:op==='-le'?x<=y:op==='-gt'?x>y:x>=y}}
    return false};
  return ev(tree)}

/* SQ.evalCond(raw): the text between [[ and ]] -> status 0/1, or 2 for a syntax or regex problem. stderr lines are left in CTX.pend for the caller. */
function evalCond(raw){SQ.step();
  try{return evalTree(parseTest(condTokens(raw),true,'[['),true,'[[')?0:1}
  catch(e){if(e&&e.stop)throw e;CTX.pend.push(errL(errOf(e)));return e.code||2}}

function testCmd(name,a){let args=a;
  if(name==='['){if(!a.length||a[a.length-1]!==']')return E("bash: [: missing ']'",2);args=a.slice(0,-1)}
  if(!args.length)return {out:'',err:[],code:1};
  try{return {out:'',err:[],code:evalTree(parseTest(args.map(raw=>({raw})),false,name),false,name)?0:1}}
  catch(e){if(e&&e.stop)throw e;return E(errOf(e),e.code||2)}}
CMDS['[']=a=>testCmd('[',a);
CMDS.test=a=>testCmd('test',a);

/* ---------- true false : ---------- */
CMDS.true=()=>ok();
CMDS.false=()=>({out:'',err:[],code:1});
CMDS[':']=()=>ok();

/* ---------- read ---------- */
const NOT_TYPING='read: this practice shell cannot wait for typing. Pipe input in (echo Ada | read name) or use a here-string: read name <<< Ada';
CMDS.read=function(a,io){let raw=false,i=0;
  for(;i<a.length;i++){const x=a[i];
    if(x==='--'){i++;break}
    if(x[0]!=='-'||x==='-')break;
    for(let k=1;k<x.length;k++){const ch=x[k];
      if(ch==='r')raw=true;
      else if(ch==='p'){if(k===x.length-1)i++;break} /* the prompt is only shown on a terminal: nothing to print here */
      else if('snNtdaeui'.includes(ch))return E(`this practice shell does not support read -${ch} yet`,2);
      else return E(`bash: read: -${ch}: invalid option`,2)}}
  const names=a.slice(i);
  for(const n of names)if(!NAME.test(n)||SQ.badName(n))return E(`bash: read: \`${n}': not a valid identifier`,1);
  const box=io.stdinBox;if(!box)return E(NOT_TYPING,1);
  const set=(n,v)=>{S.vars[n]=v};
  if(box.pos>=box.text.length){for(const n of names.length?names:['REPLY'])set(n,'');return {out:'',err:[],code:1}}
  let line='';
  for(;;){const k=box.text.indexOf('\n',box.pos);let seg=box.text.slice(box.pos,k<0?box.text.length:k);box.pos=k<0?box.text.length:k+1;
    if(!raw&&k>=0&&/(^|[^\\])(\\\\)*\\$/.test(seg)){line+=seg.slice(0,-1);if(box.pos<box.text.length)continue;break}
    line+=seg;break}
  const ch=[];
  for(let j=0;j<line.length;j++){if(!raw&&line[j]==='\\'&&j+1<line.length){ch.push({c:line[++j],e:true});continue}if(!raw&&line[j]==='\\')continue;ch.push({c:line[j],e:false})}
  const text=s=>s.map(x=>x.c).join(''),ws=x=>!x.e&&(x.c===' '||x.c==='\t'||x.c==='\n');
  if(!names.length){set('REPLY',text(ch));return ok()}
  let p=0;
  names.forEach((n,idx)=>{while(p<ch.length&&ws(ch[p]))p++;
    if(idx===names.length-1){let e=ch.length;while(e>p&&ws(ch[e-1]))e--;set(n,text(ch.slice(p,e)));p=ch.length;return}
    const s=p;while(p<ch.length&&!ws(ch[p]))p++;set(n,text(ch.slice(s,p)))});
  return ok()};

/* ---------- shift unset exit source ---------- */
CMDS.shift=function(a){
  if(a.length>1)return E('bash: shift: too many arguments',1);
  let n=1;
  if(a.length){if(!/^[+-]?\d+$/.test(a[0]))return E(`bash: shift: ${a[0]}: numeric argument required`,1);n=Number(a[0])}
  if(n<0)return E(`bash: shift: ${a[0]}: shift count out of range`,1);
  const f=SQ.frame();if(n>f.args.length)return {out:'',err:[],code:1};
  f.args=f.args.slice(n);return ok()};

CMDS.unset=function(a){let fn=false,i=0;
  for(;i<a.length;i++){const x=a[i];if(x==='--'){i++;break}if(!/^-[A-Za-z]+$/.test(x))break;
    for(const ch of x.slice(1)){if(ch==='f')fn=true;else if(ch==='v')fn=false;else return E(`bash: unset: -${ch}: invalid option`,2)}}
  const err=[];
  for(const n of a.slice(i)){
    if(!NAME.test(n)){err.push(`bash: unset: \`${n}': not a valid identifier`);continue}
    if(fn){if(S.fns)delete S.fns[n]}else{delete S.vars[n];if(S.exp)delete S.exp[n];if(BUILTIN_NAMES.includes(n))(S.unsetB=S.unsetB||{})[n]=1}}
  return {out:'',err,code:err.length?1:0}};

CMDS.exit=function(a){let n=S.last;
  if(a.length){
    if(!/^[+-]?\d+$/.test(a[0]))return Object.assign(E(`bash: exit: ${a[0]}: numeric argument required`,2),{ctl:{type:'exit',n:2}});
    if(a.length>1)return E('bash: exit: too many arguments',1);
    n=((Number(a[0])%256)+256)%256}
  return {out:'',err:[],code:n,ctl:{type:'exit',n}}};

/* source FILE [args] / . FILE [args]: with no args the file sees the caller's $1.. (as bash does) */
function sourceCmd(name,a,io){
  if(!a.length)return E(`bash: ${name}: filename argument required`,2);
  const p=a[0],abs=norm(p),n=getNode(abs);
  if(!n)return E(isLoop(abs)?`bash: ${name}: ${p}: Too many levels of symbolic links`:`bash: ${name}: ${p}: No such file or directory`,1);
  if(n.type==='dir')return E(`bash: ${name}: ${p}: is a directory`,1);
  return SQ.runSourced(p,n.content,a.length>1?a.slice(1):SQ.frame().args,io)}
CMDS.source=(a,io)=>sourceCmd('source',a,io);
CMDS['.']=(a,io)=>sourceCmd('.',a,io);

Object.assign(SQ,{evalCond});
})(window.SQ = window.SQ || {});
