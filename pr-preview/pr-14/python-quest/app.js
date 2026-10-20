
/* Mini Python: a teaching subset of Python 3, with line tracing and memory snapshots. */
const PY=(()=>{
let OID=0;
class PyErr extends Error{constructor(type,msg,line){super(type+': '+msg);this.type=type;this.pymsg=msg;this.line=line}}
class Sig{constructor(k,v){this.k=k;this.v=v}}
class PyList{constructor(a){this.a=a;this.id=++OID}}
class PyTuple{constructor(a){this.a=a}}
class PyDict{constructor(){this.m=new Map();this.id=++OID}
  get(k){const e=this.m.get(hk(k));return e?e[1]:undefined}
  set(k,v){const h=hk(k),e=this.m.get(h);if(e)e[1]=v;else this.m.set(h,[k,v])}
  has(k){return this.m.has(hk(k))}
  del(k){return this.m.delete(hk(k))}
  keys(){return [...this.m.values()].map(e=>e[0])}
  vals(){return [...this.m.values()].map(e=>e[1])}
  items(){return [...this.m.values()].map(e=>[e[0],e[1]])}}
class PyFunc{constructor(name,params,body,locals,glob,line){this.name=name;this.params=params;this.body=body;this.locals=locals;this.glob=glob;this.line=line;this.id=++OID}}
class Builtin{constructor(name,fn,isType){this.name=name;this.fn=fn;this.isType=!!isType}}
class PyModule{constructor(name,attrs){this.name=name;this.attrs=attrs}}
class PyRange{constructor(a,b,s){this.start=a;this.stop=b;this.step=s}
  len(){const {start,stop,step}=this;if(step>0n)return stop>start?(stop-start+step-1n)/step:0n;return start>stop?(start-stop-step-1n)/(-step):0n}}
class Bound{constructor(self,name,fn){this.self=self;this.name=name;this.fn=fn}}
class PyIter{constructor(kind,arr){this.kind=kind;this.arr=arr}}
class PyView{constructor(kind,d){this.kind=kind;this.d=d}}
class PyExc{constructor(type,msg){this.type=type;this.msg=msg}}

const isInt=v=>typeof v==='bigint', isFloat=v=>typeof v==='number', isBool=v=>typeof v==='boolean', isStr=v=>typeof v==='string';
const isNum=v=>isInt(v)||isFloat(v)||isBool(v);
function tname(v){if(v===null)return 'NoneType';if(isBool(v))return 'bool';if(isInt(v))return 'int';if(isFloat(v))return 'float';if(isStr(v))return 'str';
  if(v instanceof PyList)return 'list';if(v instanceof PyTuple)return 'tuple';if(v instanceof PyDict)return 'dict';if(v instanceof PyFunc)return 'function';
  if(v instanceof Builtin)return v.isType?'type':'builtin_function_or_method';if(v instanceof Bound)return 'builtin_function_or_method';if(v instanceof PyModule)return 'module';if(v instanceof PyRange)return 'range';
  if(v instanceof PyIter)return v.kind;if(v instanceof PyView)return 'dict_'+v.kind;if(v instanceof PyExc)return v.type;return 'object'}
function hk(k){if(k===null)return 'N';if(isBool(k))return 'n'+(k?1:0);if(isInt(k))return 'n'+k;if(isFloat(k))return Number.isInteger(k)?'n'+BigInt(k):'f'+k;if(isStr(k))return 's'+k;
  if(k instanceof PyTuple)return 't('+k.a.map(hk).join(',')+')';if(k instanceof PyFunc||k instanceof Builtin)return 'o'+(k.id||k.name);
  throw new PyErr('TypeError',`unhashable type: '${tname(k)}'`)}
const chars=s=>Array.from(s);
function fmtFloat(x){if(Number.isNaN(x))return 'nan';if(x===Infinity)return 'inf';if(x===-Infinity)return '-inf';
  if(Object.is(x,-0))return '-0.0';const ax=Math.abs(x);
  if(ax>=1e16||(ax<1e-4&&ax!==0)){let s=x.toExponential();let [m,e]=s.split('e');let sign=e[0]==='-'?'-':'+';e=e.replace(/^[+-]/,'');if(e.length<2)e='0'+e;return m+'e'+sign+e}
  if(Number.isInteger(x))return x.toFixed(1);return String(x)}
function qstr(s){let q="'";if(s.includes("'")&&!s.includes('"'))q='"';
  let r=s.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/\t/g,'\\t').replace(/\r/g,'\\r');if(q==="'")r=r.replace(/'/g,"\\'");return q+r+q}
function repr(v,seen){seen=seen||new Set();if(v===null)return 'None';if(v===true)return 'True';if(v===false)return 'False';
  if(isInt(v))return v.toString();if(isFloat(v))return fmtFloat(v);if(isStr(v))return qstr(v);
  if(v instanceof PyList){if(seen.has(v))return '[...]';seen.add(v);const r='['+v.a.map(x=>repr(x,seen)).join(', ')+']';seen.delete(v);return r}
  if(v instanceof PyTuple)return v.a.length===1?'('+repr(v.a[0],seen)+',)':'('+v.a.map(x=>repr(x,seen)).join(', ')+')';
  if(v instanceof PyDict){if(seen.has(v))return '{...}';seen.add(v);const r='{'+v.items().map(([k,x])=>repr(k,seen)+': '+repr(x,seen)).join(', ')+'}';seen.delete(v);return r}
  if(v instanceof PyFunc)return `<function ${v.name}>`;if(v instanceof Builtin)return v.isType?`<class '${v.name}'>`:`<built-in function ${v.name}>`;
  if(v instanceof Bound)return `<built-in method ${v.name}>`;if(v instanceof PyModule)return `<module '${v.name}'>`;
  if(v instanceof PyRange)return v.step===1n?`range(${v.start}, ${v.stop})`:`range(${v.start}, ${v.stop}, ${v.step})`;
  if(v instanceof PyView)return `dict_${v.kind}(${repr(new PyList(viewArr(v)))})`;
  if(v instanceof PyIter)return `<${v.kind} object>`;if(v instanceof PyExc)return `${v.type}(${qstr(v.msg)})`;return '<object>'}
function str(v){if(isStr(v))return v;if(v instanceof PyExc)return v.msg;return repr(v)}
function viewArr(v){return v.kind==='keys'?v.d.keys():v.kind==='values'?v.d.vals():v.d.items().map(p=>new PyTuple(p))}
function truthy(v){if(v===null||v===false)return false;if(v===true)return true;if(isInt(v))return v!==0n;if(isFloat(v))return v!==0;if(isStr(v))return v.length>0;
  if(v instanceof PyList||v instanceof PyTuple)return v.a.length>0;if(v instanceof PyDict)return v.m.size>0;if(v instanceof PyRange)return v.len()>0n;return true}
const toI=v=>isBool(v)?(v?1n:0n):v;
function eq(a,b){if(isNum(a)&&isNum(b)){a=toI(a);b=toI(b);if(isInt(a)&&isInt(b))return a===b;return Number(a)===Number(b)}
  if(isStr(a)||isStr(b))return a===b;if(a===null||b===null)return a===b;
  if(a instanceof PyList&&b instanceof PyList||a instanceof PyTuple&&b instanceof PyTuple){if(a.a.length!==b.a.length)return false;for(let i=0;i<a.a.length;i++)if(!eq(a.a[i],b.a[i]))return false;return true}
  if(a instanceof PyDict&&b instanceof PyDict){if(a.m.size!==b.m.size)return false;for(const [h,[k,v]] of a.m){const e=b.m.get(h);if(!e||!eq(v,e[1]))return false}return true}
  if(a instanceof PyRange&&b instanceof PyRange)return a.start===b.start&&a.stop===b.stop&&a.step===b.step;
  return a===b}
function cmp(a,b,op){if(isNum(a)&&isNum(b)){a=toI(a);b=toI(b);if(!(isInt(a)&&isInt(b))){a=Number(a);b=Number(b)}return a<b?-1:a>b?1:0}
  if(isStr(a)&&isStr(b))return a<b?-1:a>b?1:0;
  if((a instanceof PyList&&b instanceof PyList)||(a instanceof PyTuple&&b instanceof PyTuple)){const n=Math.min(a.a.length,b.a.length);for(let i=0;i<n;i++){if(!eq(a.a[i],b.a[i]))return cmp(a.a[i],b.a[i],op)}return a.a.length-b.a.length}
  throw new PyErr('TypeError',`'${op}' not supported between instances of '${tname(a)}' and '${tname(b)}'`)}
function floordiv(a,b){let q=a/b;if(a%b!==0n&&((a<0n)!==(b<0n)))q-=1n;return q}
function binop(op,a,b){
  if(isNum(a)&&isNum(b)){a=toI(a);b=toI(b);
    if(isInt(a)&&isInt(b)){switch(op){case '+':return a+b;case '-':return a-b;case '*':return a*b;
      case '/':if(b===0n)throw new PyErr('ZeroDivisionError','division by zero');return Number(a)/Number(b);
      case '//':if(b===0n)throw new PyErr('ZeroDivisionError','integer division or modulo by zero');return floordiv(a,b);
      case '%':{if(b===0n)throw new PyErr('ZeroDivisionError','integer modulo by zero');let r=a%b;if(r!==0n&&((r<0n)!==(b<0n)))r+=b;return r}
      case '**':if(b<0n)return Math.pow(Number(a),Number(b));if(b>100000n)throw new PyErr('OverflowError','that power is too big for this playground');return a**b}}
    const x=Number(a),y=Number(b);switch(op){case '+':return x+y;case '-':return x-y;case '*':return x*y;
      case '/':if(y===0)throw new PyErr('ZeroDivisionError','float division by zero');return x/y;
      case '//':if(y===0)throw new PyErr('ZeroDivisionError','float floor division by zero');return Math.floor(x/y);
      case '%':if(y===0)throw new PyErr('ZeroDivisionError','float modulo');return x-y*Math.floor(x/y);
      case '**':return Math.pow(x,y)}}
  if(op==='+'){if(isStr(a)&&isStr(b))return a+b;if(a instanceof PyList&&b instanceof PyList)return new PyList(a.a.concat(b.a));if(a instanceof PyTuple&&b instanceof PyTuple)return new PyTuple(a.a.concat(b.a));
    if(isStr(a))throw new PyErr('TypeError',`can only concatenate str (not "${tname(b)}") to str`);
    if(a instanceof PyList)throw new PyErr('TypeError',`can only concatenate list (not "${tname(b)}") to list`)}
  if(op==='*'){let s=a,n=b;if(isNum(a)&&!isNum(b)){s=b;n=a}n=toI(n);
    if(isInt(n)){const k=n<0n?0:Number(n);if(k>1e6)throw new PyErr('MemoryError','that would make something huge');if(isStr(s))return s.repeat(k);
      if(s instanceof PyList){let r=[];for(let i=0;i<k;i++)r=r.concat(s.a);return new PyList(r)}if(s instanceof PyTuple){let r=[];for(let i=0;i<k;i++)r=r.concat(s.a);return new PyTuple(r)}}
    if((isStr(s)||s instanceof PyList)&&isFloat(n))throw new PyErr('TypeError',`can't multiply sequence by non-int of type 'float'`);
    if(isStr(a)&&isStr(b))throw new PyErr('TypeError',`can't multiply sequence by non-int of type 'str'`)}
  throw new PyErr('TypeError',`unsupported operand type(s) for ${op}: '${tname(a)}' and '${tname(b)}'`)}
function contains(c,x){if(isStr(c)){if(!isStr(x))throw new PyErr('TypeError',`'in <string>' requires string as left operand, not ${tname(x)}`);return c.includes(x)}
  if(c instanceof PyList||c instanceof PyTuple)return c.a.some(y=>eq(x,y));if(c instanceof PyDict)return c.has(x);if(c instanceof PyView)return viewArr(c).some(y=>eq(x,y));
  if(c instanceof PyRange){x=toI(x);if(!isInt(x))return false;const {start,stop,step}=c;if(step>0n?(x<start||x>=stop):(x>start||x<=stop))return false;return (x-start)%step===0n}
  throw new PyErr('TypeError',`argument of type '${tname(c)}' is not iterable`)}
function* iter(v){if(v instanceof PyList){for(let i=0;i<v.a.length;i++)yield v.a[i];return}if(isStr(v)){yield* chars(v);return}
  if(v instanceof PyTuple){yield* v.a.slice();return}if(v instanceof PyDict){yield* v.keys();return}
  if(v instanceof PyRange){const {start,stop,step}=v;if(step>0n)for(let i=start;i<stop;i+=step)yield i;else for(let i=start;i>stop;i+=step)yield i;return}
  if(v instanceof PyIter){yield* v.arr;return}if(v instanceof PyView){yield* viewArr(v);return}
  throw new PyErr('TypeError',`'${tname(v)}' object is not iterable`)}
const arr=v=>[...iter(v)];
function normIdx(i,n,what){i=toI(i);if(!isInt(i))throw new PyErr('TypeError',`${what} indices must be integers, not ${tname(i)}`);let k=Number(i);if(k<0)k+=n;
  if(k<0||k>=n)throw new PyErr('IndexError',`${what} index out of range`);return k}
function sliceIdx(n,s){let step=s.step===null?1:Number(toI(s.step));if(step===0)throw new PyErr('ValueError','slice step cannot be zero');
  const c=(v,d)=>{if(v===null)return d;v=toI(v);if(!isInt(v))throw new PyErr('TypeError','slice indices must be integers or None');let k=Number(v);if(k<0)k+=n;return k};
  let a,b;if(step>0){a=Math.min(Math.max(c(s.start,0),0),n);b=Math.min(Math.max(c(s.stop,n),0),n)}else{a=Math.min(Math.max(c(s.start,n-1),-1),n-1);b=Math.min(Math.max(c(s.stop,-1),-1),n-1)}
  const r=[];if(step>0)for(let i=a;i<b;i+=step)r.push(i);else for(let i=a;i>b;i+=step)r.push(i);return r}
function getitem(c,k){
  if(k&&k.slice===true){const s=k;if(isStr(c)){const ch=chars(c);return sliceIdx(ch.length,s).map(i=>ch[i]).join('')}
    if(c instanceof PyList)return new PyList(sliceIdx(c.a.length,s).map(i=>c.a[i]));if(c instanceof PyTuple)return new PyTuple(sliceIdx(c.a.length,s).map(i=>c.a[i]));
    if(c instanceof PyRange){const a=arr(c);return new PyList(sliceIdx(a.length,s).map(i=>a[i]))}
    throw new PyErr('TypeError',`'${tname(c)}' object is not subscriptable`)}
  if(isStr(c)){const ch=chars(c);return ch[normIdx(k,ch.length,'string')]}
  if(c instanceof PyList)return c.a[normIdx(k,c.a.length,'list')];if(c instanceof PyTuple)return c.a[normIdx(k,c.a.length,'tuple')];
  if(c instanceof PyDict){const v=c.get(k);if(v===undefined)throw new PyErr('KeyError',repr(k));return v}
  if(c instanceof PyRange){const a=arr(c);return a[normIdx(k,a.length,'range object')]}
  throw new PyErr('TypeError',`'${tname(c)}' object is not subscriptable`)}

/* ---------- format spec ---------- */
function fmtSpec(v,spec){if(!spec)return str(v);
  const m=/^(?:(.)?([<>^=]))?([+\- ])?(0)?(\d+)?([,_])?(?:\.(\d+))?([sdfeg%xXbo])?$/.exec(spec);
  if(!m)throw new PyErr('ValueError',`Invalid format specifier '${spec}'`);
  let [,fill,align,sign,zero,width,group,prec,type]=m;fill=fill||(zero&&!align?'0':' ');let s;
  const num=isNum(v);if(type&&type!=='s'&&!num)throw new PyErr('ValueError',`Unknown format code '${type}' for object of type '${tname(v)}'`);
  if(num){let x=toI(v);
    if(type==='d'){if(!isInt(x))throw new PyErr('ValueError',`Unknown format code 'd' for object of type 'float'`);s=(x<0n?-x:x).toString()}
    else if(type==='f'||(prec!==undefined&&!type)){s=Math.abs(Number(x)).toFixed(prec===undefined?6:+prec)}
    else if(type==='%'){s=(Math.abs(Number(x))*100).toFixed(prec===undefined?6:+prec)+'%'}
    else if(type==='e'){s=Math.abs(Number(x)).toExponential(prec===undefined?6:+prec).replace(/e([+-])(\d)$/,'e$10$2')}
    else if(type==='x'||type==='X'||type==='b'||type==='o'){s=(x<0n?-x:x).toString(type==='b'?2:type==='o'?8:16);if(type==='X')s=s.toUpperCase()}
    else s=isInt(x)?(x<0n?-x:x).toString():fmtFloat(Math.abs(x));
    if(group){const [ip,fp]=s.split('.');s=ip.replace(/\B(?=(\d{3})+(?!\d))/g,group)+(fp!==undefined?'.'+fp:'')}
    const neg=isInt(x)?x<0n:x<0||Object.is(x,-0);const sg=neg?'-':sign==='+'?'+':sign===' '?' ':'';
    if(zero&&!align&&width){const w=+width-sg.length;while(s.length<w)s='0'+s}s=sg+s;align=align||'>'}
  else{s=str(v);if(prec!==undefined)s=chars(s).slice(0,+prec).join('');align=align||'<'}
  const w=width?+width:0,n=chars(s).length;if(n<w){const pad=w-n;if(align==='<')s=s+fill.repeat(pad);else if(align==='>'||align==='=')s=fill.repeat(pad)+s;else{const l=Math.floor(pad/2);s=fill.repeat(l)+s+fill.repeat(pad-l)}}
  return s}

/* ---------- tokenizer ---------- */
const KW=new Set(['False','None','True','and','as','assert','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield']);
const OPS=['**=','//=','->','**','//','==','!=','<=','>=','+=','-=','*=','/=','%=',':=','+','-','*','/','%','<','>','=','(',')','[',']','{','}',',',':','.',';','@','&','|','^','~'];
function tokenize(src){const T=[];const lines=src.replace(/\r\n?/g,'\n').split('\n');const indents=[0];let depth=0,i=0,ln=0,openLine=0;
  const err=(t,m,l)=>{throw new PyErr(t,m,l)};
  let pos=0;const S=src.replace(/\r\n?/g,'\n');let line=1,atStart=true;
  const push=(t,v,l)=>T.push({t,v,line:l});
  while(pos<=S.length){
    if(atStart&&depth===0){let col=0,p=pos;while(p<S.length&&(S[p]===' '||S[p]==='\t')){col+=S[p]==='\t'?4:1;p++}
      if(p>=S.length){pos=p;break}
      if(S[p]==='\n'||S[p]==='#'){while(p<S.length&&S[p]!=='\n')p++;pos=p+1;line++;continue}
      pos=p;atStart=false;const top=indents[indents.length-1];
      if(col>top){indents.push(col);push('IND',col,line)}
      else if(col<top){while(indents[indents.length-1]>col){indents.pop();push('DED',col,line)}
        if(indents[indents.length-1]!==col)err('IndentationError','unindent does not match any outer indentation level',line)}}
    if(pos>=S.length)break;const c=S[pos];
    if(c==='\n'){if(depth===0){push('NL',null,line);atStart=true}line++;pos++;continue}
    if(c===' '||c==='\t'){pos++;continue}
    if(c==='#'){while(pos<S.length&&S[pos]!=='\n')pos++;continue}
    if(c==='\\'&&S[pos+1]==='\n'){pos+=2;line++;continue}
    let m=/^([rRfFbBuU]{0,2})('''|"""|'|")/.exec(S.slice(pos,pos+5));
    if(m&&(m[1]===''||/^[A-Za-z]/.test(c))&&/^(|[rR]|[fF]|[fF][rR]|[rR][fF]|[bB]|[uU])$/.test(m[1])){
      const pre=m[1].toLowerCase(),q=m[2],startLine=line;pos+=m[0].length;let s='',raw='';
      for(;;){if(pos>=S.length)err('SyntaxError',q.length===3?`unterminated triple-quoted string literal (detected at line ${line})`:`unterminated string literal (detected at line ${startLine})`,startLine);
        const ch=S[pos];
        if(q.length===1&&ch==='\n')err('SyntaxError',`unterminated string literal (detected at line ${startLine})`,startLine);
        if(S.startsWith(q,pos)){pos+=q.length;break}
        if(ch==='\\'&&!pre.includes('r')){const n=S[pos+1];raw+=ch+n;pos+=2;
          const map={n:'\n',t:'\t','\\':'\\',"'":"'",'"':'"',r:'\r','0':'\0','\n':''};if(n==='\n')line++;s+=n in map?map[n]:'\\'+n;continue}
        if(ch==='\n')line++;s+=ch;raw+=ch;pos++}
      push(pre.includes('f')?'FSTR':'STR',pre.includes('f')?{s,line:startLine}:s,startLine);continue}
    m=/^(?:\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?|\.\d[\d_]*(?:[eE][+-]?\d+)?)/.exec(S.slice(pos,pos+60));
    if(m&&/[\d.]/.test(c)&&m[0]!=='.'){let t=m[0].replace(/_/g,'');pos+=m[0].length;
      if(/[A-Za-z_]/.test(S[pos]||''))err('SyntaxError','invalid decimal literal',line);
      if(/[.eE]/.test(t))push('NUM',parseFloat(t),line);else{if(t.length>1&&t[0]==='0'&&/[1-9]/.test(t))err('SyntaxError','leading zeros in decimal integer literals are not permitted',line);push('NUM',BigInt(t),line)}continue}
    m=/^[A-Za-z_\u00C0-\uFFFF][\w\u00C0-\uFFFF]*/.exec(S.slice(pos,pos+80));
    if(m&&!/[\u2018\u2019\u201C\u201D\u2013\u2014\u00A0]/.test(m[0][0])){const w=m[0];pos+=w.length;push(KW.has(w)?'KW':'NAME',w,line);continue}
    let op=OPS.find(o=>S.startsWith(o,pos));
    if(op){pos+=op.length;if('([{'.includes(op)){if(depth===0)openLine=line;depth++}if(')]}'.includes(op)){depth=Math.max(0,depth-1)}push('OP',op,line);continue}
    const cp=S.codePointAt(pos),chs=String.fromCodePoint(cp);
    if('\u2018\u2019\u201C\u201D'.includes(chs))err('SyntaxError',`invalid character '${chs}' (U+${cp.toString(16).toUpperCase().padStart(4,'0')})`,line);
    if(chs==='!')err('SyntaxError',"invalid syntax. '!' on its own isn't Python; use 'not' (or '!=' for 'not equal')",line);
    err('SyntaxError',`invalid character '${chs}' (U+${cp.toString(16).toUpperCase().padStart(4,'0')})`,line)}
  if(depth>0)err('SyntaxError',"'(' was never closed",openLine);
  if(T.length&&T[T.length-1].t!=='NL'&&T[T.length-1].t!=='DED')push('NL',null,line);
  while(indents.length>1){indents.pop();push('DED',0,line)}push('EOF',null,line);return T}

/* ---------- parser ---------- */
function parse(src){const T=tokenize(src);let p=0;const ctx={fn:0,loop:0};
  const pk=(o=0)=>T[p+o],nx=()=>T[p++];
  const is=(t,v)=>{const k=T[p];return k.t===t&&(v===undefined||k.v===v)};
  const isOp=v=>is('OP',v),isKw=v=>is('KW',v);
  const E=(m,l,t='SyntaxError')=>{throw new PyErr(t,m,l===undefined?pk().line:l)};
  const want=(t,v,msg)=>{if(!is(t,v))E(msg||'invalid syntax');return nx()};
  function block(hdr,hl){if(isOp(':'))nx();else{if(isOp('='))E("invalid syntax. Maybe you meant '==' instead of '='?");E("expected ':'")}
    if(!is('NL')){const s=simpleLine();return s}nx();
    if(!is('IND'))E(`expected an indented block after ${hdr} on line ${hl}`,pk().line,'IndentationError');nx();
    const body=[];while(!is('DED')&&!is('EOF'))body.push(...stmt());if(is('DED'))nx();return body}
  function simpleLine(){const out=[small()];while(isOp(';')){nx();if(is('NL'))break;out.push(small())}
    if(!is('NL')&&!is('EOF')){const t=pk();if(t.t==='STR'||t.t==='NAME'||t.t==='NUM'||t.t==='FSTR'){const prev=T[p-1];
        if(prev&&prev.t==='NAME'&&prev.v==='print')E("Missing parentheses in call to 'print'. Did you mean print(...)?");
        E('invalid syntax. Perhaps you forgot a comma?')}
      E('invalid syntax')}if(is('NL'))nx();return out}
  function stmt(){const t=pk();if(t.t==='IND')E('unexpected indent',t.line,'IndentationError');
    if(t.t==='KW'){const l=t.line;
      if(t.v==='if'){nx();const node={k:'if',line:l,arms:[]};const c=expr();node.arms.push([c,block("'if' statement",l)]);
        while(isKw('elif')){const el=nx().line;const c2=expr();node.arms.push([c2,block("'elif' statement",el)])}
        if(isKw('else')){const el=nx().line;node.els=block("'else' statement",el)}return [node]}
      if(t.v==='while'){nx();const c=expr();ctx.loop++;const b=block("'while' statement",l);ctx.loop--;return [{k:'while',line:l,c,b}]}
      if(t.v==='for'){nx();const tg=targetList();if(!isKw('in'))E("invalid syntax. A for loop needs 'in': for item in things:");nx();const it=exprList();ctx.loop++;const b=block("'for' statement",l);ctx.loop--;return [{k:'for',line:l,tg,it,b}]}
      if(t.v==='def'){nx();const nm=want('NAME',undefined,'expected a function name after def').v;if(!isOp('('))E("expected '(' after the function name");nx();const params=[];
        while(!isOp(')')){if(isOp('*'))E('*args is not supported in this playground');const pn=want('NAME',undefined,'expected a parameter name').v;let d;if(isOp('=')){nx();d=expr()}else if(params.some(q=>q.d))E('parameter without a default follows parameter with a default');params.push({n:pn,d});if(isOp(','))nx();else break}
        want('OP',')',"expected ')'");const saveLoop=ctx.loop;ctx.fn++;ctx.loop=0;const b=block('function definition',l);ctx.fn--;ctx.loop=saveLoop;
        return [{k:'def',line:l,name:nm,params,b,locals:findLocals(b,params)}]}
      if(t.v==='try'){nx();const b=block("'try' statement",l);const hs=[];
        while(isKw('except')){const el=nx().line;let types=null,as=null;if(!isOp(':')){types=[];if(isOp('(')){nx();while(!isOp(')')){types.push(want('NAME').v);if(isOp(','))nx()}nx()}else types.push(want('NAME',undefined,'expected an exception name like ValueError').v);if(isKw('as')){nx();as=want('NAME').v}}
          hs.push({types,as,b:block("'except' statement",el)})}
        let fin=null,els=null;if(isKw('else')){const el=nx().line;els=block("'else' statement",el)}if(isKw('finally')){const el=nx().line;fin=block("'finally' statement",el)}
        if(!hs.length&&!fin)E("expected 'except' or 'finally' block");return [{k:'try',line:l,b,hs,els,fin}]}
      if(t.v==='class')E("classes are not part of this playground yet. Stick to functions, lists and dicts here.");
      if(t.v==='else'||t.v==='elif')E(`'${t.v}' needs a matching 'if' just above it, at the same indentation`);
      if(t.v==='except')E("'except' needs a matching 'try' just above it");}
    return simpleLine()}
  function small(){const t=pk(),l=t.line;
    if(t.t==='KW'){switch(t.v){
      case 'pass':nx();return {k:'pass',line:l};
      case 'break':nx();if(!ctx.loop)E("'break' outside loop",l);return {k:'break',line:l};
      case 'continue':nx();if(!ctx.loop)E("'continue' not properly in loop",l);return {k:'continue',line:l};
      case 'return':nx();if(!ctx.fn)E("'return' outside function",l);return {k:'return',line:l,v:(is('NL')||isOp(';')||is('EOF'))?null:exprList()};
      case 'global':{nx();const ns=[want('NAME').v];while(isOp(',')){nx();ns.push(want('NAME').v)}return {k:'global',line:l,ns}}
      case 'import':{nx();const ms=[];do{if(isOp(','))nx();const n=want('NAME',undefined,'expected a module name').v;let as=n;if(isKw('as')){nx();as=want('NAME').v}ms.push([n,as])}while(isOp(','));return {k:'import',line:l,ms}}
      case 'from':{nx();const m=want('NAME').v;if(!isKw('import'))E("expected 'import'");nx();const ns=[];if(isOp('*')){nx();ns.push('*')}else{do{if(isOp(','))nx();ns.push(want('NAME').v)}while(isOp(','))}return {k:'from',line:l,m,ns}}
      case 'del':{nx();const tg=targetList();return {k:'del',line:l,tg}}
      case 'raise':{nx();return {k:'raise',line:l,v:is('NL')?null:expr()}}
      case 'assert':{nx();const c=expr();let m=null;if(isOp(',')){nx();m=expr()}return {k:'assert',line:l,c,m}}
      case 'lambda':case 'with':case 'yield':case 'nonlocal':E(`'${t.v}' is not supported in this playground`)}}
    const e=exprList();
    if(isOp('=')){const tg=[e];let v;while(isOp('=')){nx();v=exprList();if(isOp('='))tg.push(v)}tg.forEach(x=>checkTarget(x,l));return {k:'assign',line:l,tg,v}}
    const aug=['+=','-=','*=','/=','//=','%=','**='];if(is('OP')&&aug.includes(pk().v)){const op=nx().v;checkTarget(e,l);if(e.k==='tuple')E("'tuple' is an illegal expression for augmented assignment");return {k:'aug',line:l,tg:e,op:op.slice(0,-1),v:exprList()}}
    return {k:'expr',line:l,e}}
  function checkTarget(e,l){if(e.k==='name'){if(['True','False','None'].includes(e.n))E(`cannot assign to ${e.n}`,l);return}if(e.k==='sub')return;
    if(e.k==='tuple'||e.k==='list'){e.items.forEach(x=>checkTarget(x,l));return}
    if(e.k==='call')E("cannot assign to function call here. Maybe you meant '==' instead of '='?",l);
    if(e.k==='attr')E('setting attributes is not supported in this playground',l);
    if(e.k==='const'||e.k==='fstr')E("cannot assign to literal here. Maybe you meant '==' instead of '='?",l);
    E("cannot assign to expression here. Maybe you meant '==' instead of '='?",l)}
  function targetList(){const l=pk().line;const items=[postfix()];let tup=false;while(isOp(',')){nx();tup=true;if(isKw('in')||isOp('='))break;items.push(postfix())}
    const r=tup?{k:'tuple',items,line:l}:items[0];checkTarget(r,l);return r}
  function exprList(){const l=pk().line;const first=expr();if(!isOp(','))return first;const items=[first];
    while(isOp(',')){nx();if(is('NL')||isOp('=')||isOp(')')||is('EOF')||isOp(':'))break;items.push(expr())}return {k:'tuple',items,line:l}}
  function expr(){const l=pk().line;if(isKw('lambda'))E("'lambda' is not supported in this playground");const a=orT();
    if(isKw('if')&&T[p-1]){const save=p;nx();const c=orT();if(isKw('else')){nx();const b=expr();return {k:'ifx',c,a,b,line:l}}p=save}return a}
  function orT(){let a=andT();while(isKw('or')){const l=nx().line;a={k:'or',a,b:andT(),line:l}}return a}
  function andT(){let a=notT();while(isKw('and')){const l=nx().line;a={k:'and',a,b:notT(),line:l}}return a}
  function notT(){if(isKw('not')){const l=nx().line;return {k:'not',a:notT(),line:l}}return comp()}
  function comp(){const l=pk().line;const first=arith();const ops=[],rest=[];
    for(;;){let op=null;if(is('OP')&&['<','>','==','!=','<=','>='].includes(pk().v))op=nx().v;
      else if(isKw('in')){nx();op='in'}else if(isKw('not')&&pk(1).t==='KW'&&pk(1).v==='in'){nx();nx();op='not in'}
      else if(isKw('is')){nx();if(isKw('not')){nx();op='is not'}else op='is'}
      if(!op)break;ops.push(op);rest.push(arith())}
    if(isOp('=')&&pk(1)&&!(pk(1).t==='OP'&&pk(1).v==='='))0;
    return ops.length?{k:'cmp',first,ops,rest,line:l}:first}
  function arith(){let a=term();while(is('OP')&&(pk().v==='+'||pk().v==='-')){const t=nx();a={k:'bin',op:t.v,a,b:term(),line:t.line}}return a}
  function term(){let a=factor();while(is('OP')&&['*','/','//','%'].includes(pk().v)){const t=nx();a={k:'bin',op:t.v,a,b:factor(),line:t.line}}return a}
  function factor(){if(is('OP')&&(pk().v==='-'||pk().v==='+')){const t=nx();return {k:'unary',op:t.v,a:factor(),line:t.line}}return power()}
  function power(){const a=postfix();if(isOp('**')){const l=nx().line;return {k:'bin',op:'**',a,b:factor(),line:l}}return a}
  function postfix(){let a=atom();for(;;){const t=pk();
      if(t.t==='OP'&&t.v==='('){nx();const args=[],kw=[];while(!isOp(')')){if(is('NAME')&&pk(1).t==='OP'&&pk(1).v==='='){const n=nx().v;nx();kw.push([n,expr()])}else{if(kw.length)E('positional argument follows keyword argument');if(isOp('*'))E('*args is not supported in this playground');args.push(expr())}
          if(isOp(','))nx();else if(!isOp(')')){if(is('NL')||is('EOF'))E("'(' was never closed",t.line);E('invalid syntax. Perhaps you forgot a comma?')}}nx();a={k:'call',f:a,args,kw,line:t.line};continue}
      if(t.t==='OP'&&t.v==='['){nx();let ix;const sl=()=>{const s={k:'slice',start:null,stop:null,step:null};if(!isOp(':'))s.start=expr();if(isOp(':')){nx();if(!isOp(']')&&!isOp(':'))s.stop=expr();if(isOp(':')){nx();if(!isOp(']'))s.step=expr()}return s}return s.start};
        ix=sl();if(isOp(',')){const items=[ix];while(isOp(',')){nx();if(isOp(']'))break;items.push(expr())}ix={k:'tuple',items}}want('OP',']',"expected ']'");a={k:'sub',a,ix,line:t.line};continue}
      if(t.t==='OP'&&t.v==='.'){nx();const n=pk();if(n.t!=='NAME'&&n.t!=='KW')E('expected a name after the dot');nx();a={k:'attr',a,n:n.v,line:t.line};continue}
      break}return a}
  function atom(){const t=pk(),l=t.line;
    if(t.t==='NUM'){nx();return {k:'const',v:t.v,line:l}}
    if(t.t==='STR'||t.t==='FSTR'){const parts=[];while(is('STR')||is('FSTR')){const s=nx();parts.push(s.t==='STR'?{k:'const',v:s.v}:fstr(s.v.s,s.v.line))}
      if(parts.length===1)return Object.assign(parts[0],{line:l});if(parts.every(x=>x.k==='const'))return {k:'const',v:parts.map(x=>x.v).join(''),line:l};
      return {k:'fstr',parts:parts.flatMap(x=>x.k==='fstr'?x.parts:[x.v]),line:l}}
    if(t.t==='NAME'){nx();return {k:'name',n:t.v,line:l}}
    if(t.t==='KW'){if(t.v==='True'||t.v==='False'||t.v==='None'){nx();return {k:'const',v:t.v==='True'?true:t.v==='False'?false:null,line:l}}
      E(`invalid syntax. '${t.v}' is a Python keyword and can't be used here`)}
    if(t.t==='OP'){
      if(t.v==='('){nx();if(isOp(')')){nx();return {k:'tuple',items:[],line:l}}const e=expr();if(isKw('for'))return comp2('gen',e,')',l);
        if(isOp(',')){const items=[e];while(isOp(',')){nx();if(isOp(')'))break;items.push(expr())}want('OP',')',"expected ')'");return {k:'tuple',items,line:l}}
        if(!isOp(')'))E(is('NL')||is('EOF')?"'(' was never closed":'invalid syntax. Perhaps you forgot a comma?',l);nx();return e}
      if(t.v==='['){nx();const items=[];if(!isOp(']')){const e=expr();if(isKw('for'))return comp2('list',e,']',l);items.push(e);while(isOp(',')){nx();if(isOp(']'))break;items.push(expr())}}
        if(!isOp(']'))E(is('NL')||is('EOF')?"'[' was never closed":'invalid syntax. Perhaps you forgot a comma?',l);nx();return {k:'list',items,line:l}}
      if(t.v==='{'){nx();const pairs=[];while(!isOp('}')){const k=expr();if(!isOp(':'))E("sets aren't part of this playground; a dict needs key: value pairs");nx();pairs.push([k,expr()]);if(isOp(','))nx();else break}
        if(!isOp('}'))E(is('NL')||is('EOF')?"'{' was never closed":'invalid syntax. Perhaps you forgot a comma?',l);nx();return {k:'dict',pairs,line:l}}}
    if(t.t==='NL'||t.t==='EOF')E('invalid syntax. The line ended too early. Is something missing?',l);
    if(t.t==='IND')E('unexpected indent',l,'IndentationError');
    E(`invalid syntax near '${t.v}'`)}
  function comp2(kind,e,close,l){const fors=[];while(isKw('for')){nx();const tg=targetList();if(!isKw('in'))E("expected 'in'");nx();const it=orT();const ifs=[];while(isKw('if')){nx();ifs.push(orT())}fors.push({tg,it,ifs})}
    want('OP',close,`expected '${close}'`);return {k:'comp',kind,e,fors,line:l}}
  function fstr(s,line){const parts=[];let i=0,lit='';
    while(i<s.length){const c=s[i];if(c==='{'&&s[i+1]==='{'){lit+='{';i+=2;continue}if(c==='}'&&s[i+1]==='}'){lit+='}';i+=2;continue}
      if(c==='}')throw new PyErr('SyntaxError',"f-string: single '}' is not allowed",line);
      if(c==='{'){if(lit){parts.push(lit);lit=''}let d=0,j=i+1,q=null;for(;j<s.length;j++){const ch=s[j];if(q){if(ch===q)q=null;continue}if(ch==='"'||ch==="'"){q=ch;continue}if('([{'.includes(ch))d++;else if(')]'.includes(ch))d--;else if(ch==='}'){if(d===0)break;d--}else if((ch===':'||ch==='!')&&d===0&&s[j+1]!=='=')break}
        let inner=s.slice(i+1,j),conv=null,spec='';if(s[j]==='!'){conv=s[j+1];j+=2}if(s[j]===':'){let k=j+1;while(k<s.length&&s[k]!=='}')k++;spec=s.slice(j+1,k);j=k}
        if(s[j]!=='}')throw new PyErr('SyntaxError',"f-string: expecting '}'",line);if(!inner.trim())throw new PyErr('SyntaxError','f-string: empty expression not allowed',line);
        let self=false;if(/=\s*$/.test(inner)&&!/[=!<>]=\s*$/.test(inner)){self=inner;inner=inner.replace(/=\s*$/,'')}
        let sub;try{sub=parseExpr(inner,line)}catch(e){if(e instanceof PyErr){e.line=line;throw e}throw e}
        if(self)parts.push(self);parts.push({e:sub,conv:self&&!conv&&!spec?'r':conv,spec});i=j+1;continue}
      lit+=c;i++}if(lit)parts.push(lit);return {k:'fstr',parts}}
  const body=[];while(!is('EOF')){if(is('NL')){nx();continue}if(is('DED')){nx();continue}body.push(...stmt())}return body}
function parseExpr(src,line){const sub=parse('('+src.replace(/\n/g,' ')+')');if(sub.length!==1||sub[0].k!=='expr')throw new PyErr('SyntaxError','f-string: invalid expression',line);
  const fix=n=>{if(n&&typeof n==='object'){if('line' in n)n.line=line;for(const k in n)if(k!=='line')fix(n[k])}};fix(sub[0].e);return sub[0].e}
function findLocals(body,params){const s=new Set(params.map(p=>p.n)),g=new Set();
  const tg=t=>{if(!t)return;if(t.k==='name')s.add(t.n);else if(t.k==='tuple'||t.k==='list')t.items.forEach(tg)};
  const walk=b=>b.forEach(st=>{switch(st.k){case 'assign':st.tg.forEach(tg);break;case 'aug':tg(st.tg);break;case 'for':tg(st.tg);walk(st.b);break;
    case 'if':st.arms.forEach(a=>walk(a[1]));if(st.els)walk(st.els);break;case 'while':walk(st.b);break;case 'def':s.add(st.name);break;
    case 'try':walk(st.b);st.hs.forEach(h=>{if(h.as)s.add(h.as);walk(h.b)});if(st.els)walk(st.els);if(st.fin)walk(st.fin);break;
    case 'import':st.ms.forEach(m=>s.add(m[1]));break;case 'global':st.ns.forEach(n=>g.add(n));break}});
  walk(body);g.forEach(n=>s.delete(n));return {s,g}}

/* ---------- builtins ---------- */
function toInt(v){if(isBool(v))return v?1n:0n;if(isInt(v))return v;if(isFloat(v)){if(!isFinite(v))throw new PyErr(Number.isNaN(v)?'ValueError':'OverflowError','cannot convert float '+fmtFloat(v)+' to integer');return BigInt(Math.trunc(v))}
  if(isStr(v)){const t=v.trim().replace(/_/g,'');if(/^[+-]?\d+$/.test(t))return BigInt(t);throw new PyErr('ValueError',`invalid literal for int() with base 10: ${qstr(v)}`)}
  throw new PyErr('TypeError',`int() argument must be a string or a number, not '${tname(v)}'`)}
function toFloat(v){if(isNum(v))return Number(toI(v));if(isStr(v)){const t=v.trim().toLowerCase();if(/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(t))return parseFloat(t);if(/^[+-]?(inf|infinity)$/.test(t))return t[0]==='-'?-Infinity:Infinity;if(/^[+-]?nan$/.test(t))return NaN}
  if(isStr(v))throw new PyErr('ValueError',`could not convert string to float: ${qstr(v)}`);throw new PyErr('TypeError',`float() argument must be a string or a real number, not '${tname(v)}'`)}
function needInt(v,fn){v=toI(v);if(!isInt(v))throw new PyErr('TypeError',`'${tname(v)}' object cannot be interpreted as an integer`);return v}
function argc(name,args,min,max){if(args.length<min)throw new PyErr('TypeError',`${name}() takes ${min===max?'exactly ':'at least '}${min} argument${min===1?'':'s'} (${args.length} given)`);
  if(max!==undefined&&args.length>max)throw new PyErr('TypeError',`${name}() takes at most ${max} argument${max===1?'':'s'} (${args.length} given)`)}
function round(x,n){if(n===undefined||n===null){if(isInt(toI(x)))return toI(x);const f=Math.floor(x),d=x-f;let r=d>0.5?f+1:d<0.5?f:(f%2===0?f:f+1);return BigInt(r)}
  n=Number(toI(n));if(isInt(toI(x))){if(n>=0)return toI(x);const p=10n**BigInt(-n);const q=toI(x);return (q*1n+(q>=0n?p/2n:-p/2n))/p*p}
  const s=Number(x).toFixed(Math.max(0,n));return n>=0?parseFloat(s):Math.round(x/10**-n)*10**-n}
function minmax(name,args,kw,I,sign){let items=args.length===1?arr(args[0]):args;const key=kw.key&&kw.key!==null?kw.key:null;
  if(!items.length){if('default' in kw)return kw.default;throw new PyErr('ValueError',`${name}() arg is an empty sequence`)}
  let best=items[0],bk=key?I.call(key,[best]):best;for(const x of items.slice(1)){const k=key?I.call(key,[x]):x;if(cmp(k,bk,'<')*sign>0){best=x;bk=k}}return best}
function sortArr(a,kw,I){const key=kw.key&&kw.key!==null?kw.key:null,rev=kw.reverse!==undefined&&truthy(kw.reverse);const ks=a.map(x=>key?I.call(key,[x]):x);
  const idx=a.map((_,i)=>i);idx.sort((i,j)=>{const c=cmp(ks[i],ks[j],'<');return rev?-c:c});return idx.map(i=>a[i])}
const EXC=['Exception','ValueError','TypeError','KeyError','IndexError','ZeroDivisionError','NameError','AttributeError','RuntimeError','StopIteration','AssertionError'];
function makeBuiltins(I){const B={};const def=(n,fn,t)=>B[n]=new Builtin(n,fn,t);
  def('print',(a,kw)=>{const sep=kw.sep!==undefined&&kw.sep!==null?str(kw.sep):' ',end=kw.end!==undefined&&kw.end!==null?str(kw.end):'\n';I.write(a.map(str).join(sep)+end);return null});
  def('input',(a)=>{const pr=a.length?str(a[0]):'';I.write(pr);if(!I.inputs.length)throw new PyErr('EOFError','EOF when reading a line');const v=I.inputs.shift();I.write(v+'\n',true);return v});
  def('len',(a)=>{argc('len',a,1,1);const v=a[0];if(isStr(v))return BigInt(chars(v).length);if(v instanceof PyList||v instanceof PyTuple)return BigInt(v.a.length);if(v instanceof PyDict)return BigInt(v.m.size);if(v instanceof PyRange)return v.len();if(v instanceof PyView)return BigInt(viewArr(v).length);
    throw new PyErr('TypeError',`object of type '${tname(v)}' has no len()`)});
  def('int',(a)=>{if(!a.length)return 0n;if(a.length>1){const b=Number(needInt(a[1]));const t=str(a[0]).trim().toLowerCase();const n=parseInt(t,b);if(Number.isNaN(n)||!/^[+-]?[0-9a-z]+$/.test(t))throw new PyErr('ValueError',`invalid literal for int() with base ${b}: ${qstr(a[0])}`);return BigInt(n)}return toInt(a[0])},true);
  def('float',(a)=>a.length?toFloat(a[0]):0,true);def('str',(a)=>a.length?str(a[0]):'',true);def('bool',(a)=>a.length?truthy(a[0]):false,true);
  def('list',(a)=>new PyList(a.length?arr(a[0]):[]),true);def('tuple',(a)=>new PyTuple(a.length?arr(a[0]):[]),true);
  def('dict',(a,kw)=>{const d=new PyDict();if(a.length){if(a[0] instanceof PyDict)a[0].items().forEach(([k,v])=>d.set(k,v));else for(const p of iter(a[0])){const q=arr(p);if(q.length!==2)throw new PyErr('ValueError','dictionary update sequence element has wrong length');d.set(q[0],q[1])}}for(const k in kw)d.set(k,kw[k]);return d},true);
  def('type',(a)=>{argc('type',a,1,1);const n=tname(a[0]);return B[n]&&B[n].isType?B[n]:new Builtin(n,()=>{throw new PyErr('TypeError',`cannot create '${n}' instances`)},true)},true);
  def('range',(a)=>{argc('range',a,1,3);let s=0n,e,st=1n;if(a.length===1)e=needInt(a[0]);else{s=needInt(a[0]);e=needInt(a[1]);if(a.length===3)st=needInt(a[2])}if(st===0n)throw new PyErr('ValueError','range() arg 3 must not be zero');return new PyRange(s,e,st)},true);
  def('abs',(a)=>{argc('abs',a,1,1);const v=toI(a[0]);if(isInt(v))return v<0n?-v:v;if(isFloat(v))return Math.abs(v);throw new PyErr('TypeError',`bad operand type for abs(): '${tname(v)}'`)});
  def('min',(a,kw)=>minmax('min',a,kw,I,-1));def('max',(a,kw)=>minmax('max',a,kw,I,1));
  def('sum',(a,kw)=>{argc('sum',a,1,2);let t=a.length>1?a[1]:kw.start!==undefined?kw.start:0n;for(const x of iter(a[0])){if(isStr(x))throw new PyErr('TypeError',"unsupported operand type(s) for +: 'int' and 'str'");t=binop('+',t,x)}return t});
  def('round',(a,kw)=>{argc('round',a,1,2);if(!isNum(a[0]))throw new PyErr('TypeError',`type ${tname(a[0])} doesn't define __round__ method`);return round(a[0],a.length>1?a[1]:kw.ndigits)});
  def('sorted',(a,kw)=>{argc('sorted',a,1,1);return new PyList(sortArr(arr(a[0]),kw,I))});
  def('reversed',(a)=>{argc('reversed',a,1,1);return new PyIter('list_reverseiterator',arr(a[0]).reverse())});
  def('enumerate',(a,kw)=>{argc('enumerate',a,1,2);let s=a.length>1?toI(a[1]):kw.start!==undefined?toI(kw.start):0n;return new PyIter('enumerate',arr(a[0]).map((x,i)=>new PyTuple([s+BigInt(i),x])))});
  def('zip',(a)=>{const as=a.map(arr);const n=as.length?Math.min(...as.map(x=>x.length)):0;const r=[];for(let i=0;i<n;i++)r.push(new PyTuple(as.map(x=>x[i])));return new PyIter('zip',r)});
  def('isinstance',(a)=>{argc('isinstance',a,2,2);const ts=a[1] instanceof PyTuple?a[1].a:[a[1]];const n=tname(a[0]);return ts.some(t=>t instanceof Builtin&&t.isType&&(t.name===n||(t.name==='int'&&n==='bool')||(t.name==='Exception'&&EXC.includes(n))))});
  def('chr',(a)=>String.fromCodePoint(Number(needInt(a[0]))));def('ord',(a)=>{if(!isStr(a[0])||chars(a[0]).length!==1)throw new PyErr('TypeError','ord() expected a character');return BigInt(a[0].codePointAt(0))});
  def('any',(a)=>{for(const x of iter(a[0]))if(truthy(x))return true;return false});def('all',(a)=>{for(const x of iter(a[0]))if(!truthy(x))return false;return true});
  def('id',(a)=>BigInt(a[0]&&a[0].id?140000000000+a[0].id*16:9000));def('help',()=>{I.write('help() is not available here. Try the Field guide tab.\n');return null});
  def('exit',()=>{throw new Sig('exit')});def('quit',()=>{throw new Sig('exit')});
  for(const n of EXC)def(n,(a)=>new PyExc(n,a.length?str(a[0]):''),true);
  return B}
const MODS={
  random:(I)=>new PyModule('random',{
    randint:new Builtin('randint',(a)=>{argc('randint',a,2,2);const lo=needInt(a[0]),hi=needInt(a[1]);if(hi<lo)throw new PyErr('ValueError',`empty range in randint(${lo}, ${hi})`);return lo+BigInt(Math.floor(I.rand()*Number(hi-lo+1n)))}),
    choice:new Builtin('choice',(a)=>{const x=arr(a[0]);if(!x.length)throw new PyErr('IndexError','Cannot choose from an empty sequence');return x[Math.floor(I.rand()*x.length)]}),
    random:new Builtin('random',()=>I.rand()),uniform:new Builtin('uniform',(a)=>{const x=Number(toI(a[0])),y=Number(toI(a[1]));return x+(y-x)*I.rand()}),
    randrange:new Builtin('randrange',(a)=>{let s=0n,e,st=1n;if(a.length===1)e=needInt(a[0]);else{s=needInt(a[0]);e=needInt(a[1]);if(a.length>2)st=needInt(a[2])}const n=Number(new PyRange(s,e,st).len());if(n<=0)throw new PyErr('ValueError','empty range for randrange()');return s+st*BigInt(Math.floor(I.rand()*n))}),
    shuffle:new Builtin('shuffle',(a)=>{const l=a[0];if(!(l instanceof PyList))throw new PyErr('TypeError','shuffle needs a list');for(let i=l.a.length-1;i>0;i--){const j=Math.floor(I.rand()*(i+1));[l.a[i],l.a[j]]=[l.a[j],l.a[i]]}return null}),
    sample:new Builtin('sample',(a)=>{const x=arr(a[0]).slice(),k=Number(needInt(a[1]));if(k>x.length)throw new PyErr('ValueError','Sample larger than population');for(let i=x.length-1;i>0;i--){const j=Math.floor(I.rand()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return new PyList(x.slice(0,k))}),
    seed:new Builtin('seed',(a)=>{I.seed(a.length?Number(hashNum(a[0])):Date.now());return null})}),
  math:()=>new PyModule('math',{pi:Math.PI,e:Math.E,inf:Infinity,
    sqrt:new Builtin('sqrt',(a)=>{const x=Number(toI(a[0]));if(x<0)throw new PyErr('ValueError','math domain error');return Math.sqrt(x)}),
    floor:new Builtin('floor',(a)=>BigInt(Math.floor(Number(toI(a[0]))))),ceil:new Builtin('ceil',(a)=>BigInt(Math.ceil(Number(toI(a[0]))))),
    pow:new Builtin('pow',(a)=>Math.pow(Number(toI(a[0])),Number(toI(a[1])))),fabs:new Builtin('fabs',(a)=>Math.abs(Number(toI(a[0])))),
    hypot:new Builtin('hypot',(a)=>Math.hypot(...a.map(x=>Number(toI(x))))),gcd:new Builtin('gcd',(a)=>{let x=toI(a[0]),y=toI(a[1]);x=x<0n?-x:x;y=y<0n?-y:y;while(y){[x,y]=[y,x%y]}return x})}),
  time:()=>new PyModule('time',{time:new Builtin('time',()=>Date.now()/1000),sleep:new Builtin('sleep',()=>null)})};
function hashNum(v){if(isNum(v))return Number(toI(v));let h=0;for(const c of str(v))h=(h*31+c.charCodeAt(0))|0;return h}

/* ---------- methods ---------- */
const SM={upper:s=>s.toUpperCase(),lower:s=>s.toLowerCase(),title:s=>s.toLowerCase().replace(/(^|[^A-Za-z])([a-z])/g,(m,a,b)=>a+b.toUpperCase()),
  capitalize:s=>s?s[0].toUpperCase()+s.slice(1).toLowerCase():s,swapcase:s=>[...s].map(c=>c===c.toUpperCase()?c.toLowerCase():c.toUpperCase()).join(''),
  strip:(s,a)=>a[0]!=null?strip(s,a[0],3):s.trim(),lstrip:(s,a)=>a[0]!=null?strip(s,a[0],1):s.replace(/^\s+/,''),rstrip:(s,a)=>a[0]!=null?strip(s,a[0],2):s.replace(/\s+$/,''),
  split:(s,a,kw)=>{const sep=a.length?a[0]:kw.sep!==undefined?kw.sep:null,mx=a.length>1?Number(toI(a[1])):kw.maxsplit!==undefined?Number(toI(kw.maxsplit)):-1;let r;
    if(sep===null){r=s.trim().split(/\s+/).filter(Boolean);if(mx>=0&&r.length>mx+1){const t=s.trim();let rest=t,out=[];for(let i=0;i<mx;i++){const m=/^(\S+)\s+/.exec(rest);out.push(m[1]);rest=rest.slice(m[0].length)}out.push(rest);r=out}}
    else{if(sep==='')throw new PyErr('ValueError','empty separator');r=s.split(sep);if(mx>=0&&r.length>mx+1)r=r.slice(0,mx).concat([r.slice(mx).join(sep)])}return new PyList(r)},
  join:(s,a)=>{const it=arr(a[0]);it.forEach((x,i)=>{if(!isStr(x))throw new PyErr('TypeError',`sequence item ${i}: expected str instance, ${tname(x)} found`)});return it.join(s)},
  replace:(s,a)=>{if(a.length>2){let n=Number(toI(a[2])),r=s;let out='',i=0;while(n-->0){const j=r.indexOf(a[0],i);if(j<0)break;out+=r.slice(i,j)+a[1];i=j+a[0].length}return out+r.slice(i)}return s.split(a[0]).join(a[1])},
  find:(s,a)=>{const i=s.indexOf(a[0]);return i<0?-1n:BigInt(chars(s.slice(0,i)).length)},
  index:(s,a)=>{const i=s.indexOf(a[0]);if(i<0)throw new PyErr('ValueError','substring not found');return BigInt(chars(s.slice(0,i)).length)},
  count:(s,a)=>BigInt(a[0]===''?chars(s).length+1:s.split(a[0]).length-1),startswith:(s,a)=>a[0] instanceof PyTuple?a[0].a.some(x=>s.startsWith(x)):s.startsWith(a[0]),endswith:(s,a)=>a[0] instanceof PyTuple?a[0].a.some(x=>s.endsWith(x)):s.endsWith(a[0]),
  isdigit:s=>/^\d+$/.test(s),isnumeric:s=>/^\d+$/.test(s),isalpha:s=>/^\p{L}+$/u.test(s),isalnum:s=>/^[\p{L}\d]+$/u.test(s),isspace:s=>/^\s+$/.test(s),isupper:s=>/[A-Z]/.test(s)&&s===s.toUpperCase(),islower:s=>/[a-z]/.test(s)&&s===s.toLowerCase(),
  center:(s,a)=>fmtSpec(s,(a[1]||' ')+'^'+toI(a[0])),ljust:(s,a)=>fmtSpec(s,(a[1]||' ')+'<'+toI(a[0])),rjust:(s,a)=>fmtSpec(s,(a[1]||' ')+'>'+toI(a[0])),zfill:(s,a)=>s.padStart(Number(toI(a[0])),'0'),
  format:(s,a,kw)=>{let auto=0;return s.replace(/\{\{|\}\}|\{([^{}]*)\}/g,(m,inner)=>{if(m==='{{')return '{';if(m==='}}')return '}';let [f,...sp]=inner.split(':');const spec=sp.join(':');let v;
      if(f==='')v=a[auto++];else if(/^\d+$/.test(f))v=a[+f];else v=kw[f];if(v===undefined)throw new PyErr(/^\d*$/.test(f)?'IndexError':'KeyError',/^\d*$/.test(f)?'Replacement index out of range':qstr(f));return fmtSpec(v,spec)})}};
function strip(s,c,side){const set=new Set(chars(c));let a=chars(s),i=0,j=a.length;if(side&1)while(i<j&&set.has(a[i]))i++;if(side&2)while(j>i&&set.has(a[j-1]))j--;return a.slice(i,j).join('')}
const LM={append:(l,a)=>{argc('append',a,1,1);l.a.push(a[0]);return null},extend:(l,a)=>{l.a.push(...arr(a[0]));return null},
  insert:(l,a)=>{argc('insert',a,2,2);let i=Number(toI(a[0])),n=l.a.length;if(i<0)i=Math.max(0,i+n);l.a.splice(Math.min(i,n),0,a[1]);return null},
  pop:(l,a)=>{if(!l.a.length)throw new PyErr('IndexError','pop from empty list');const i=a.length?normIdx(a[0],l.a.length,'pop'):l.a.length-1;return l.a.splice(i,1)[0]},
  remove:(l,a)=>{const i=l.a.findIndex(x=>eq(x,a[0]));if(i<0)throw new PyErr('ValueError','list.remove(x): x not in list');l.a.splice(i,1);return null},
  index:(l,a)=>{const i=l.a.findIndex(x=>eq(x,a[0]));if(i<0)throw new PyErr('ValueError',`${repr(a[0])} is not in list`);return BigInt(i)},
  count:(l,a)=>BigInt(l.a.filter(x=>eq(x,a[0])).length),reverse:l=>{l.a.reverse();return null},clear:l=>{l.a.length=0;return null},copy:l=>new PyList(l.a.slice()),
  sort:(l,a,kw,I)=>{const r=sortArr(l.a,kw,I);l.a.length=0;l.a.push(...r);return null}};
const DM={get:(d,a)=>{const v=d.get(a[0]);return v===undefined?(a.length>1?a[1]:null):v},keys:d=>new PyView('keys',d),values:d=>new PyView('values',d),items:d=>new PyView('items',d),
  pop:(d,a)=>{const v=d.get(a[0]);if(v===undefined){if(a.length>1)return a[1];throw new PyErr('KeyError',repr(a[0]))}d.del(a[0]);return v},
  update:(d,a,kw)=>{if(a.length){if(a[0] instanceof PyDict)a[0].items().forEach(([k,v])=>d.set(k,v));else for(const p of iter(a[0])){const q=arr(p);d.set(q[0],q[1])}}for(const k in kw)d.set(k,kw[k]);return null},
  setdefault:(d,a)=>{const v=d.get(a[0]);if(v!==undefined)return v;const nv=a.length>1?a[1]:null;d.set(a[0],nv);return nv},copy:d=>{const n=new PyDict();d.items().forEach(([k,v])=>n.set(k,v));return n},clear:d=>{d.m.clear();return null}};
const TM={count:(t,a)=>BigInt(t.a.filter(x=>eq(x,a[0])).length),index:(t,a)=>{const i=t.a.findIndex(x=>eq(x,a[0]));if(i<0)throw new PyErr('ValueError','tuple.index(x): x not in tuple');return BigInt(i)}};
const HINTS={push:'append',add:'append',length:'len()',size:'len()',len:'len()',toUpperCase:'upper',toLowerCase:'lower',trim:'strip',contains:'in',includes:'in',indexOf:'index',lenght:'len()'};
function getattr(o,n){let M=null;if(isStr(o))M=SM;else if(o instanceof PyList)M=LM;else if(o instanceof PyDict)M=DM;else if(o instanceof PyTuple)M=TM;
  if(M&&Object.prototype.hasOwnProperty.call(M,n))return new Bound(o,n,M[n]);
  if(o instanceof PyModule){if(n in o.attrs)return o.attrs[n];throw new PyErr('AttributeError',`module '${o.name}' has no attribute '${n}'`)}
  if(o instanceof PyExc&&n==='args')return new PyTuple([o.msg]);
  const h=HINTS[n];throw new PyErr('AttributeError',`'${tname(o)}' object has no attribute '${n}'`+(h?`. Did you mean: '${h}'?`:''))}

/* ---------- interpreter ---------- */
class Interp{constructor(opts){this.out='';this.inEcho=[];this.inputs=(opts.inputs||[]).slice();this.maxSteps=opts.maxSteps||200000;this.maxSnaps=opts.maxSnaps??1000;
    this.steps=[];this.count=0;this.depth=0;this.B=makeBuiltins(this);this.glob={vars:new Map(),name:'Global',isGlobal:true,order:[]};this.stack=[this.glob];this.curLine=1;this.mods={};
    let s=opts.seed!=null?opts.seed>>>0:(Math.random()*4294967296)>>>0;this._s=s;this.trace=opts.trace!==false}
  seed(n){this._s=(n>>>0)||1}
  rand(){let t=this._s+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296}
  write(s,isIn){const st=this.out.length;this.out+=s;if(isIn)this.inEcho.push([st,this.out.length]);if(this.out.length>200000)throw new PyErr('OutputLimit','your program printed more than 200,000 characters')}
  hook(line){this.curLine=line;this.count++;if(this.count>this.maxSteps)throw new PyErr('TooManySteps',`your program ran more than ${this.maxSteps.toLocaleString('en-US')} steps, so it was stopped`,line);
    if(this.trace&&this.steps.length<this.maxSnaps)this.steps.push(this.snap(line))}
  snap(line){const frames=this.stack.map(f=>({name:f.name,vars:[...f.vars.entries()].filter(([k,v])=>!(v instanceof PyModule)).map(([k,v])=>[k,ser(v,0)])}));return {line,out:this.out.length,frames}}
  frame(){return this.stack[this.stack.length-1]}
  lookup(n,line){const f=this.frame();
    if(!f.isGlobal&&f.locals.s.has(n)){if(f.vars.has(n))return f.vars.get(n);throw new PyErr('UnboundLocalError',`cannot access local variable '${n}' where it is not associated with a value`,line)}
    if(!f.isGlobal&&f.vars.has(n))return f.vars.get(n);
    if(this.glob.vars.has(n))return this.glob.vars.get(n);if(n in this.B)return this.B[n];
    const close=[...this.glob.vars.keys(),...(f.isGlobal?[]:f.vars.keys()),...Object.keys(this.B)].find(k=>k.toLowerCase()===n.toLowerCase()||lev(k,n)===1);
    throw new PyErr('NameError',`name '${n}' is not defined`+(close?`. Did you mean: '${close}'?`:''),line)}
  setName(n,v){const f=this.frame();if(!f.isGlobal&&f.locals.g.has(n)){this.glob.vars.set(n,v);return}f.vars.set(n,v)}
  run(body){this.block(body)}
  block(b){for(const s of b)this.exec(s)}
  exec(s){this.hook(s.line);switch(s.k){
    case 'expr':this.ev(s.e);return;
    case 'assign':{const v=this.ev(s.v);for(const t of s.tg)this.assign(t,v,s.line);return}
    case 'aug':{const t=s.tg;let cur;if(t.k==='name')cur=this.lookup(t.n,s.line);else{var c=this.ev(t.a),ix=this.ev(t.ix);cur=getitem(c,ix)}
      const r=this.wrap(()=>{const rhs=this.ev(s.v);if(s.op==='+'&&cur instanceof PyList){cur.a.push(...arr(rhs));return cur}return binop(s.op,cur,rhs)},s.line);
      if(t.k==='name')this.setName(t.n,r);else this.setitem(c,ix,r,s.line);return}
    case 'if':{for(const [c,b] of s.arms){if(truthy(this.ev(c))){this.block(b);return}}if(s.els)this.block(s.els);return}
    case 'while':{let first=true;for(;;){if(!first)this.hook(s.line);first=false;if(!truthy(this.ev(s.c)))return;try{this.block(s.b)}catch(e){if(e instanceof Sig){if(e.k==='break')return;if(e.k==='continue')continue}throw e}}}
    case 'for':{const it=this.ev(s.it);let first=true;for(const v of this.wrap(()=>iter(it),s.line)){if(!first)this.hook(s.line);first=false;this.assign(s.tg,v,s.line);
        try{this.block(s.b)}catch(e){if(e instanceof Sig){if(e.k==='break')return;if(e.k==='continue')continue}throw e}}return}
    case 'def':{const params=s.params.map(p=>({n:p.n,d:p.d?this.ev(p.d):undefined}));this.setName(s.name,new PyFunc(s.name,params,s.b,s.locals,this.glob,s.line));return}
    case 'return':throw new Sig('return',s.v?this.ev(s.v):null);
    case 'break':throw new Sig('break');case 'continue':throw new Sig('continue');case 'pass':return;
    case 'global':return;
    case 'import':for(const [n,as] of s.ms)this.setName(as,this.mod(n,s.line));return;
    case 'from':{const m=this.mod(s.m,s.line);if(s.ns[0]==='*'){for(const k in m.attrs)this.setName(k,m.attrs[k])}else for(const n of s.ns){if(!(n in m.attrs))throw new PyErr('ImportError',`cannot import name '${n}' from '${s.m}'`,s.line);this.setName(n,m.attrs[n])}return}
    case 'del':{const d=t=>{if(t.k==='name'){const f=this.frame();if(!f.vars.has(t.n))throw new PyErr('NameError',`name '${t.n}' is not defined`,s.line);f.vars.delete(t.n)}
        else if(t.k==='sub'){const c=this.ev(t.a),k=this.ev(t.ix);if(c instanceof PyList){if(k&&k.slice===true){const ids=new Set(sliceIdx(c.a.length,k));c.a=c.a.filter((_,i)=>!ids.has(i))}else c.a.splice(normIdx(k,c.a.length,'list assignment'),1)}else if(c instanceof PyDict){if(!c.del(k))throw new PyErr('KeyError',repr(k),s.line)}else throw new PyErr('TypeError',`'${tname(c)}' object doesn't support item deletion`,s.line)}
        else if(t.k==='tuple')t.items.forEach(d)};d(s.tg);return}
    case 'raise':{if(!s.v)throw new PyErr('RuntimeError','No active exception to reraise',s.line);let v=this.ev(s.v);if(v instanceof Builtin&&v.isType)v=new PyExc(v.name,'');if(!(v instanceof PyExc))throw new PyErr('TypeError','exceptions must derive from BaseException',s.line);const e=new PyErr(v.type,v.msg,s.line);e.raised=true;throw e}
    case 'assert':if(!truthy(this.ev(s.c)))throw new PyErr('AssertionError',s.m?str(this.ev(s.m)):'',s.line);return;
    case 'try':{let ok=false;try{this.block(s.b);ok=true}catch(e){if(!(e instanceof PyErr)||['TooManySteps','OutputLimit','RecursionError'].includes(e.type)&&!s.hs.some(h=>h.types&&h.types.includes(e.type))){if(s.fin)this.block(s.fin);throw e}
        const h=s.hs.find(h=>!h.types||h.types.some(t=>t===e.type||t==='Exception'||t==='BaseException'||(t==='LookupError'&&['KeyError','IndexError'].includes(e.type))||(t==='ArithmeticError'&&e.type==='ZeroDivisionError')));
        if(!h){if(s.fin)this.block(s.fin);throw e}if(h.as)this.setName(h.as,new PyExc(e.type,e.pymsg));try{this.block(h.b)}finally{if(s.fin)this.block(s.fin)}return}
      if(ok&&s.els)this.block(s.els);if(s.fin)this.block(s.fin);return}}}
  mod(n,line){if(!MODS[n])throw new PyErr('ModuleNotFoundError',`No module named '${n}'`+(['numpy','pandas','turtle','pygame','requests','os','sys'].includes(n)?` (this playground has random, math and time)`:''),line);return this.mods[n]||(this.mods[n]=MODS[n](this))}
  wrap(f,line){try{return f()}catch(e){if(e instanceof PyErr&&e.line===undefined)e.line=line;throw e}}
  assign(t,v,line){if(t.k==='name'){this.setName(t.n,v);return}
    if(t.k==='sub'){const c=this.ev(t.a),k=this.ev(t.ix);this.setitem(c,k,v,line);return}
    if(t.k==='tuple'||t.k==='list'){const a=this.wrap(()=>{if(isNum(v)||v===null)throw new PyErr('TypeError',`cannot unpack non-iterable ${tname(v)} object`);return arr(v)},line);
      if(a.length>t.items.length)throw new PyErr('ValueError',`too many values to unpack (expected ${t.items.length})`,line);
      if(a.length<t.items.length)throw new PyErr('ValueError',`not enough values to unpack (expected ${t.items.length}, got ${a.length})`,line);t.items.forEach((x,i)=>this.assign(x,a[i],line))}}
  setitem(c,k,v,line){this.wrap(()=>{if(c instanceof PyList){if(k&&k.slice===true){if(k.step!==null)throw new PyErr('ValueError','extended slice assignment is not supported here');const ids=sliceIdx(c.a.length,k);const st=ids.length?ids[0]:Math.min(Math.max(Number(toI(k.start??0n))<0?c.a.length+Number(toI(k.start)):Number(toI(k.start??0n)),0),c.a.length);c.a.splice(st,ids.length,...arr(v));return}
      c.a[normIdx(k,c.a.length,'list assignment')]=v}else if(c instanceof PyDict)c.set(k,v);
      else if(isStr(c))throw new PyErr('TypeError',"'str' object does not support item assignment");else if(c instanceof PyTuple)throw new PyErr('TypeError',"'tuple' object does not support item assignment");
      else throw new PyErr('TypeError',`'${tname(c)}' object does not support item assignment`)},line)}
  call(f,args,kw={},line){
    if(f instanceof Builtin||f instanceof Bound){return this.wrap(()=>f instanceof Bound?f.fn(f.self,args,kw,this):f.fn(args,kw,this),line)}
    if(f instanceof PyFunc){const ps=f.params;if(args.length>ps.length)throw new PyErr('TypeError',`${f.name}() takes ${ps.length} positional argument${ps.length===1?'':'s'} but ${args.length} ${args.length===1?'was':'were'} given`,line);
      const vars=new Map();ps.forEach((p,i)=>{if(i<args.length)vars.set(p.n,args[i])});
      for(const k in kw){if(!ps.some(p=>p.n===k))throw new PyErr('TypeError',`${f.name}() got an unexpected keyword argument '${k}'`,line);if(vars.has(k))throw new PyErr('TypeError',`${f.name}() got multiple values for argument '${k}'`,line);vars.set(k,kw[k])}
      const miss=ps.filter(p=>!vars.has(p.n)&&p.d===undefined).map(p=>p.n);if(miss.length)throw new PyErr('TypeError',`${f.name}() missing ${miss.length} required positional argument${miss.length>1?'s':''}: ${miss.map(m=>`'${m}'`).join(miss.length>2?', ':' and ').replace(/, ([^,]*)$/,', and $1')}`,line);
      ps.forEach(p=>{if(!vars.has(p.n))vars.set(p.n,p.d)});
      if(this.depth>=120)throw new PyErr('RecursionError','maximum recursion depth exceeded (the function kept calling itself)',line);
      const fr={vars,name:f.name+'()',isGlobal:false,locals:f.locals,callLine:line};this.stack.push(fr);this.depth++;
      try{this.block(f.body);return null}catch(e){if(e instanceof Sig&&e.k==='return')return e.v;if(e instanceof Sig&&e.k!=='exit')throw new PyErr('SyntaxError',`'${e.k}' outside loop`,line);throw e}finally{this.stack.pop();this.depth--}}
    if(f instanceof PyExc||isStr(f)||isNum(f)||f===null||f instanceof PyList||f instanceof PyDict)throw new PyErr('TypeError',`'${tname(f)}' object is not callable`+(isStr(f)||isNum(f)?'. Did you forget an operator such as * between two values?':''),line);
    throw new PyErr('TypeError',`'${tname(f)}' object is not callable`,line)}
  ev(e){switch(e.k){
    case 'const':return e.v;
    case 'name':return this.lookup(e.n,e.line);
    case 'fstr':return e.parts.map(p=>{if(isStr(p))return p;const v=this.ev(p.e);const s=p.conv==='r'?repr(v):p.conv==='s'?str(v):v;return this.wrap(()=>fmtSpec(s,p.spec),e.line)}).join('');
    case 'list':return new PyList(e.items.map(x=>this.ev(x)));case 'tuple':return new PyTuple(e.items.map(x=>this.ev(x)));
    case 'dict':{const d=new PyDict();for(const [k,v] of e.pairs){const kk=this.ev(k);this.wrap(()=>d.set(kk,this.ev(v)),e.line)}return d}
    case 'bin':{const a=this.ev(e.a),b=this.ev(e.b);return this.wrap(()=>binop(e.op,a,b),e.line)}
    case 'unary':{const a=this.ev(e.a);if(!isNum(a))throw new PyErr('TypeError',`bad operand type for unary ${e.op}: '${tname(a)}'`,e.line);const x=toI(a);return e.op==='-'?(isInt(x)?-x:-x):x}
    case 'not':return !truthy(this.ev(e.a));
    case 'and':{const a=this.ev(e.a);return truthy(a)?this.ev(e.b):a}
    case 'or':{const a=this.ev(e.a);return truthy(a)?a:this.ev(e.b)}
    case 'ifx':return truthy(this.ev(e.c))?this.ev(e.a):this.ev(e.b);
    case 'cmp':{let a=this.ev(e.first);for(let i=0;i<e.ops.length;i++){const b=this.ev(e.rest[i]),op=e.ops[i];let r;
        r=this.wrap(()=>{switch(op){case '==':return eq(a,b);case '!=':return !eq(a,b);case '<':return cmp(a,b,'<')<0;case '>':return cmp(a,b,'>')>0;case '<=':return cmp(a,b,'<=')<=0;case '>=':return cmp(a,b,'>=')>=0;
          case 'in':return contains(b,a);case 'not in':return !contains(b,a);case 'is':return a===b||(isInt(a)&&isInt(b)&&a===b);case 'is not':return !(a===b)}},e.line);
        if(!r)return false;a=b}return true}
    case 'sub':{const c=this.ev(e.a);const ix=e.ix.k==='slice'?{slice:true,start:e.ix.start?this.ev(e.ix.start):null,stop:e.ix.stop?this.ev(e.ix.stop):null,step:e.ix.step?this.ev(e.ix.step):null}:this.ev(e.ix);return this.wrap(()=>getitem(c,ix),e.line)}
    case 'slice':throw new PyErr('SyntaxError','invalid syntax',e.line);
    case 'attr':{const o=this.ev(e.a);return this.wrap(()=>getattr(o,e.n),e.line)}
    case 'call':{const f=this.ev(e.f);const args=e.args.map(x=>this.ev(x));const kw={};for(const [k,v] of e.kw)kw[k]=this.ev(v);
      if(f instanceof Builtin&&f.name==='print'&&this.trace){}
      const r=this.call(f,args,kw,e.line);if(f instanceof PyFunc)this.curLine=e.line;return r}
    case 'comp':{const out=[];const loop=(i)=>{if(i===e.fors.length){out.push(this.ev(e.e));return}const fo=e.fors[i];for(const v of this.wrap(()=>iter(this.ev(fo.it)),e.line)){this.assign(fo.tg,v,e.line);if(fo.ifs.every(c=>truthy(this.ev(c))))loop(i+1);this.count++;if(this.count>this.maxSteps)throw new PyErr('TooManySteps','your program ran too many steps',e.line)}};
      loop(0);return e.kind==='list'?new PyList(out):new PyIter('generator',out)}}
    throw new PyErr('SyntaxError','unsupported expression',e.line)}}
function lev(a,b){if(Math.abs(a.length-b.length)>1)return 9;const m=[...Array(a.length+1)].map((_,i)=>[i]);for(let j=1;j<=b.length;j++)m[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return m[a.length][b.length]}
/* serialize for the memory map */
function ser(v,d){const t=tname(v);
  if(v instanceof PyList||v instanceof PyTuple){if(d>2)return {t,r:repr(v),id:v.id};return {t,id:v.id,items:v.a.slice(0,24).map(x=>ser(x,d+1)),more:Math.max(0,v.a.length-24)}}
  if(v instanceof PyDict){if(d>2)return {t,r:repr(v),id:v.id};const it=v.items();return {t,id:v.id,pairs:it.slice(0,24).map(([k,x])=>[ser(k,d+1),ser(x,d+1)]),more:Math.max(0,it.length-24)}}
  if(v instanceof PyFunc)return {t,r:`${v.name}(${v.params.map(p=>p.d!==undefined?p.n+'='+repr(p.d):p.n).join(', ')})`};
  let r=repr(v);if(r.length>160)r=r.slice(0,157)+'…';return {t,r}}

function run(src,opts={}){const I=new Interp(opts);let error=null,ast=null;
  try{ast=parse(src)}catch(e){if(e instanceof PyErr)return {out:'',inEcho:[],steps:[],error:{type:e.type,msg:e.pymsg,line:e.line},interp:I,ok:false,parseError:true};throw e}
  try{I.run(ast)}catch(e){if(e instanceof Sig&&e.k==='exit'){}else if(e instanceof PyErr)error={type:e.type,msg:e.pymsg,line:e.line||I.curLine};
    else if(e instanceof RangeError)error={type:'RecursionError',msg:'maximum recursion depth exceeded',line:I.curLine};else throw e}
  while(I.stack.length>1)I.stack.pop();
  if(I.trace&&I.steps.length<I.maxSnaps+1)I.steps.push(Object.assign(I.snap(null),{end:true,error:!!error}));
  return {out:I.out,inEcho:I.inEcho,steps:I.steps,error,interp:I,ok:!error,truncated:I.count>I.steps.length}}
/* JS <-> Python helpers for mission checks */
function toPy(x){if(x===null||x===undefined)return null;if(typeof x==='number')return Number.isInteger(x)?BigInt(x):x;if(Array.isArray(x))return new PyList(x.map(toPy));if(typeof x==='object'){const d=new PyDict();for(const k in x)d.set(k,toPy(x[k]));return d}return x}
function toJS(v){if(isInt(v))return Number(v);if(v instanceof PyList||v instanceof PyTuple)return v.a.map(toJS);if(v instanceof PyDict){const o={};v.items().forEach(([k,x])=>o[str(k)]=toJS(x));return o}if(v instanceof PyView||v instanceof PyIter)return arr(v).map(toJS);return v}
function callUser(res,name,args){const I=res.interp;const f=I.glob.vars.get(name);if(!(f instanceof PyFunc))throw new Error('no function');
  const saveOut=I.out,saveTrace=I.trace;I.trace=false;I.count=0;I.out='';try{const r=I.call(f,args.map(toPy),{},0);return {v:toJS(r),py:r,out:I.out}}finally{I.out=saveOut;I.trace=saveTrace}}
return {run,parse,tokenize,repr,str,tname,toJS,toPy,callUser,PyList,PyDict,PyFunc,isInt}})();
if(typeof module!=='undefined')module.exports=PY;
/* Builds the helper object every mission check receives. */
function makeCtx(src,res,inputs){const I=res.interp;const g=I?I.glob.vars:new Map();
  const out=res.out||'';const lines=out.replace(/\n$/,'').split('\n').map(l=>l.replace(/\s+$/,'')).filter((l,i,a)=>!(a.length===1&&l===''));
  const code=src.split('\n').map(l=>{let q=null,o='';for(let i=0;i<l.length;i++){const ch=l[i];if(q){o+=ch;if(ch==='\\'){o+=l[++i]||'';continue}if(ch===q)q=null;continue}if(ch==='"'||ch==="'"){q=ch;o+=ch;continue}if(ch==='#')break;o+=ch}return o}).join('\n');
  const c={src,code,out,lines,err:res.error,inputs:inputs||[],
    has:n=>g.has(n),type:n=>g.has(n)?PY.tname(g.get(n)):null,val:n=>g.has(n)?PY.toJS(g.get(n)):undefined,
    fn:n=>g.has(n)&&g.get(n) instanceof PY.PyFunc,
    printed:t=>lines.some(l=>l.trim()===String(t)),printedI:t=>lines.some(l=>l.trim().toLowerCase()===String(t).toLowerCase()),
    call:(n,...a)=>PY.callUser(res,n,a)};
  return c}
if(typeof module!=='undefined')module.exports=makeCtx;
/* ---------- Python Quest: chapters and missions ---------- */
const CH=[
{name:'First words',badge:'Hello, World',intro:'Every program is a list of instructions that Python reads from top to bottom. The first instruction most people learn is print, which shows something on the screen.',
 learned:['print()','"text"','numbers','# comments','reading errors'],
 missions:[
 {title:'Say hello',goal:'Make Python show <code>Hello, world!</code> in the console.',
  anat:[['print','fn'],['(','br'],['"Hello, world!"','str'],[')','br']],
  explain:'<code>print</code> is a <b>function</b>: a built-in tool that does a job. The round brackets hold what you give it. The quotes tell Python this is <b>text</b> (Python calls text a <i>string</i>).',
  note:'Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (or the Run button) to run your code.',
  starter:'# Type your code below this line\n',answer:'print("Hello, world!")',
  check:c=>c.printed('Hello, world!')||(c.printedI('hello, world!')?'Close! Python is picky about capital letters and punctuation. Match it exactly: Hello, world!':'The console should show exactly: Hello, world!')},
 {title:'Introduce your hero',goal:'Print <b>two lines</b>: first <code>My hero is called:</code>, then your hero\'s name on the next line.',
  anat:[['print','fn'],['("My hero is called:")','str']],
  explain:'Each <code>print</code> puts its text on a new line. Python runs line 1, then line 2, in order. That order is how every program works.',
  starter:'print("My hero is called:")\n',answer:'print("My hero is called:")\nprint("Ada the Brave")',
  check:c=>c.lines.length>=2&&c.lines[0]==='My hero is called:'?true:c.lines[0]!=='My hero is called:'?'The first line should be exactly: My hero is called:':'Add a second print with your hero\'s name.'},
 {title:'Numbers do math',goal:'Print the answer to <code>7 + 5</code>. Let Python do the adding, so <b>no quotes</b> this time.',
  anat:[['print','fn'],['(','br'],['7','num'],['+','op'],['5','num'],[')','br']],
  explain:'Without quotes, <code>7</code> is a <b>number</b>, and Python calculates <code>7 + 5</code> before printing it. Python works out the inside of the brackets first.',
  starter:'',answer:'print(7 + 5)',
  check:c=>c.printed('12')&&/\+/.test(c.code)?true:c.printed('7 + 5')?'You printed the text "7 + 5". Remove the quotes so Python does the math.':'The console should show 12, calculated with +.'},
 {title:'Text is not a number',goal:'Run <code>print("7" + "5")</code> and see what happens.',
  anat:[['print','fn'],['"7"','str'],['+','op'],['"5"','str']],
  explain:'With quotes, <code>"7"</code> is text, not a number. Adding two pieces of text glues them together. Programmers call this <b>concatenation</b>. So you get <code>75</code>, not 12.',
  note:'Look at the memory map later: text boxes are green, whole numbers are blue.',
  starter:'',answer:'print("7" + "5")',
  check:c=>c.printed('75')||'The console should show 75 (two pieces of text joined).'},
 {title:'Leave a note',goal:'Write a <b>comment</b> (a line starting with <code>#</code>), then print anything you like below it.',
  anat:[['# this is a note','cm','comment'],['print','fn'],['("...")','str']],
  explain:'Python ignores everything after a <code>#</code> on a line. Comments are notes for humans: what the code does, or a reminder for later.',
  starter:'',answer:'# My first game starts here\nprint("Loading the adventure...")',
  check:c=>!/^\s*#/m.test(c.src)?'Add a line that starts with # .':c.lines.length?true:'Now add a print below your comment.'},
 {title:'Fix your first bug',goal:'This code crashes. Run it, read the red error, and fix it so it prints <code>Treasure!</code>.',
  anat:[['print','fn'],['(','br'],['"Treasure!"','str'],[')','br','missing?']],
  explain:'Errors are normal, and every programmer sees them all day. Python tells you <b>what</b> went wrong and <b>which line</b>. Here a bracket was opened and never closed.',
  starter:'print("Treasure!"\n',answer:'print("Treasure!")',
  check:c=>c.printed('Treasure!')||'Close the bracket so the line reads print("Treasure!")'}
 ]},
{name:'Variables',badge:'Box Keeper',intro:'A variable is a labelled box that stores a value so you can use it later. Watch the memory map: every variable you make appears there as a box.',
 learned:['name = value','int, float, str, bool','x = x + 1','+= and -=','f"...{x}..."','NameError'],
 missions:[
 {title:'Make a box',goal:'Store the text <code>"Ada"</code> in a variable called <code>hero</code>, then print <code>hero</code>.',
  anat:[['hero','var'],['=','op','assign'],['"Ada"','str']],
  explain:'The <code>=</code> sign means <b>put the value on the right into the box on the left</b>. It is not "equals" from math class. When you write <code>print(hero)</code> with no quotes, Python looks inside the box.',
  starter:'',answer:'hero = "Ada"\nprint(hero)',
  check:c=>c.type('hero')!=='str'?'Make a variable called hero that holds text, like hero = "Ada"':!c.printed(c.val('hero'))?'Now print(hero) so the name appears. No quotes around hero!':true},
 {title:'Number boxes',goal:'Make <code>hp</code> hold <code>100</code> and <code>gold</code> hold <code>25</code>. Print both.',
  anat:[['hp','var'],['=','op'],['100','num']],
  explain:'Whole numbers are called <b>integers</b> (<code>int</code>). Notice the memory map: two blue boxes with labels.',
  note:'Variable names: lowercase, no spaces (use_underscores), and they cannot start with a digit.',
  starter:'hp = 100\n',answer:'hp = 100\ngold = 25\nprint(hp)\nprint(gold)',
  check:c=>c.val('hp')!==100?'hp should hold 100':c.val('gold')!==25?'Make gold hold 25 (no quotes, it is a number)':!(c.printed('100')&&c.out.includes('25'))?'Print both hp and gold.':true},
 {title:'Change what\'s inside',goal:'Your hero found 10 coins. Use <code>gold = gold + 10</code> so gold goes from 25 to 35, then print it.',
  anat:[['gold','var'],['=','op'],['gold','var'],['+','op'],['10','num']],
  explain:'Python works out the right side first (<code>25 + 10</code>), then puts the result back into the same box. After running, drag the <b>Watch it run</b> slider to see the box change.',
  starter:'gold = 25\n',answer:'gold = 25\ngold = gold + 10\nprint(gold)',
  check:c=>c.val('gold')!==35?'gold should end at 35':!/gold\s*=\s*gold\s*\+|gold\s*\+=/.test(c.code)?'Use gold = gold + 10 instead of typing 35 directly.':!c.printed('35')?'Print gold at the end.':true},
 {title:'The shortcut',goal:'A goblin hits you for 30. Use <code>-=</code> to take 30 from <code>hp</code> (100 becomes 70) and print it.',
  anat:[['hp','var'],['-=','op','subtract & store'],['30','num']],
  explain:'<code>hp -= 30</code> is short for <code>hp = hp - 30</code>. There is also <code>+=</code>, <code>*=</code> and <code>/=</code>. You will use <code>+=</code> constantly for scores and counters.',
  starter:'hp = 100\n',answer:'hp = 100\nhp -= 30\nprint(hp)',
  check:c=>!/hp\s*-=/.test(c.code)?'Use the -= shortcut.':c.val('hp')!==70?'hp should end at 70.':c.printed('70')||'Print hp.'},
 {title:'Four kinds of value',goal:'Make <code>speed = 1.5</code> and <code>alive = True</code>. Then print <code>type(speed)</code> and <code>type(alive)</code>.',
  anat:[['type','fn'],['(','br'],['speed','var'],[')','br']],
  explain:'Every value has a <b>type</b>. <code>int</code> = whole number, <code>float</code> = number with a decimal point, <code>str</code> = text, <code>bool</code> = <code>True</code> or <code>False</code>. <code>type()</code> tells you which one a value is.',
  note:'True and False start with a capital letter and have no quotes.',
  starter:'',answer:'speed = 1.5\nalive = True\nprint(type(speed))\nprint(type(alive))',
  check:c=>c.type('speed')!=='float'?'speed should be 1.5 (a float).':c.type('alive')!=='bool'?'alive should be True (capital T, no quotes).':c.out.includes("<class 'float'>")&&c.out.includes("<class 'bool'>")?true:'Print type(speed) and type(alive).'},
 {title:'Mix text and values',goal:'Print the sentence <code>Ada has 70 HP and 35 gold</code> using an <b>f-string</b> and the three variables.',
  anat:[['f','kw','f-string'],['"','str'],['{hero}','var','slot'],[' has ','str'],['{hp}','var','slot'],['...','str'],['"','str']],
  explain:'Put an <code>f</code> before the quotes, then write variable names inside <code>{curly brackets}</code>. Python swaps each <code>{name}</code> for the value in that box.',
  starter:'hero = "Ada"\nhp = 70\ngold = 35\n',answer:'hero = "Ada"\nhp = 70\ngold = 35\nprint(f"{hero} has {hp} HP and {gold} gold")',
  check:c=>!/f["']/.test(c.code)?'Use an f-string: print(f"...")':c.printed(`${c.val('hero')} has ${c.val('hp')} HP and ${c.val('gold')} gold`)||'Make it read exactly: Ada has 70 HP and 35 gold'},
 {title:'Bug hunt: the missing box',goal:'This crashes with a <code>NameError</code>. Find out why and fix it.',
  anat:[['Hero','var','≠ hero']],
  explain:'Python is <b>case-sensitive</b>: <code>hero</code> and <code>Hero</code> are two different names. A <code>NameError</code> means "I have no box with that name".',
  starter:'hero = "Kai"\nprint("Welcome back,")\nprint(Hero)\n',answer:'hero = "Kai"\nprint("Welcome back,")\nprint(hero)',
  check:c=>c.printed('Kai')||'Print the hero variable so Kai appears.'}
 ]},
{name:'Math & text',badge:'Calculator',intro:'Python is a great calculator and a great text editor. This chapter covers the operators, then how to slice and change text.',
 learned:['+ - * /','// and %','**','len()','.upper()','s[0], s[-1]','s[1:4]','input()','int()'],
 missions:[
 {title:'Damage calculator',goal:'A sword does 7 damage and hits 3 times. Store <code>damage = 7 * 3</code> and print it.',
  anat:[['damage','var'],['=','op'],['7','num'],['*','op','times'],['3','num']],
  explain:'Math operators: <code>+</code> add, <code>-</code> subtract, <code>*</code> multiply, <code>/</code> divide. Python follows the usual order: <code>*</code> and <code>/</code> before <code>+</code> and <code>-</code>. Brackets go first.',
  starter:'',answer:'damage = 7 * 3\nprint(damage)',
  check:c=>c.val('damage')!==21?'damage should be 7 * 3.':!/\*/.test(c.code)?'Use * to multiply.':c.printed('21')||'Print damage.'},
 {title:'Three ways to divide',goal:'Split 17 coins between 5 players. Print <code>17 / 5</code>, <code>17 // 5</code> and <code>17 % 5</code> on three lines.',
  anat:[['17','num'],['//','op','whole part'],['5','num'],['%','op','remainder']],
  explain:'<code>/</code> gives an exact answer with decimals (3.4). <code>//</code> gives the whole part only: each player gets 3. <code>%</code> (modulo) gives what is left over: 2 coins.',
  note:'% is great for "every Nth time" checks: n % 2 == 0 means n is even.',
  starter:'',answer:'print(17 / 5)\nprint(17 // 5)\nprint(17 % 5)',
  check:c=>c.lines.join('|')==='3.4|3|2'||'The console should show 3.4, then 3, then 2.'},
 {title:'Power up',goal:'Your power doubles 10 times. Print <code>2 ** 10</code>.',
  anat:[['2','num'],['**','op','to the power'],['10','num']],
  explain:'<code>**</code> means "to the power of". <code>2 ** 10</code> is 2×2×2×2×2×2×2×2×2×2. Python integers can get as big as you like.',
  starter:'',answer:'print(2 ** 10)',check:c=>c.printed('1024')&&/\*\*/.test(c.code)||'Use ** to print 1024.'},
 {title:'Text tools',goal:'With <code>name = "python"</code>, print <code>name.upper()</code> and then <code>len(name)</code>.',
  anat:[['name','var'],['.','op','dot'],['upper','fn','method'],['()','br']],
  explain:'Text has built-in tools called <b>methods</b>. You use them with a dot: <code>name.upper()</code>. <code>len()</code> counts the characters.',
  note:'Try .lower(), .title() and .replace("p", "j") too.',
  starter:'name = "python"\n',answer:'name = "python"\nprint(name.upper())\nprint(len(name))',
  check:c=>c.printed('PYTHON')&&c.printed('6')||'You should see PYTHON and 6.'},
 {title:'Pick one letter',goal:'With <code>word = "dragon"</code>, print the first letter and the last letter.',
  anat:[['word','var'],['[','br'],['0','num','position'],[']','br']],
  explain:'Each character has a position number called an <b>index</b>. Counting starts at <b>0</b>, so <code>word[0]</code> is "d". Negative numbers count from the end: <code>word[-1]</code> is "n".',
  starter:'word = "dragon"\n',answer:'word = "dragon"\nprint(word[0])\nprint(word[-1])',
  check:c=>c.printed('d')&&c.printed('n')&&/\[/.test(c.code)||'Use word[0] and word[-1] to print d and n.'},
 {title:'Slice it',goal:'Print the first three letters of <code>word</code> (that is <code>dra</code>) using a <b>slice</b>.',
  anat:[['word','var'],['[','br'],['0','num','start'],[':','op'],['3','num','stop before'],[']','br']],
  explain:'<code>word[0:3]</code> means "from position 0 up to, but not including, 3". Leave a side out to go to the edge: <code>word[:3]</code> or <code>word[3:]</code>.',
  starter:'word = "dragon"\n',answer:'word = "dragon"\nprint(word[0:3])',
  check:c=>c.printed('dra')&&/\[[^\]]*:/.test(c.code)||'Use a slice like word[0:3] to print dra.'},
 {title:'Ask the player',goal:'Use <code>input()</code> to ask for a name, then print <code>Welcome, NAME!</code>. Your answers go in the <b>Answers tray</b> under the editor.',
  anat:[['name','var'],['=','op'],['input','fn'],['("Your name? ")','str','question']],
  explain:'<code>input()</code> pauses, shows the question, and waits for the player to type. Whatever they type is stored as text. In this playground, you type the answers ahead of time in the tray.',
  inputs:['Ada'],starter:'',answer:'name = input("What is your name? ")\nprint(f"Welcome, {name}!")',
  check:c=>!/input\(/.test(c.code)?'Use input() to ask for the name.':c.type('name')!=='str'?'Store the answer in a variable called name.':c.printed(`Welcome, ${c.val('name')}!`)||c.out.includes(`Welcome, ${c.val('name')}!`)||'Print Welcome, followed by the name and !'},
 {title:'Turn text into a number',goal:'Ask for a number with <code>input()</code>, turn it into an int with <code>int()</code>, and print double it.',
  anat:[['int','fn','convert'],['(','br'],['input("Pick a number: ")','fn'],[')','br']],
  explain:'<code>input()</code> always gives you text, even "21". Text times 2 would repeat it ("2121"). Wrap it in <code>int()</code> to turn it into a real number. <code>float()</code> and <code>str()</code> convert the same way.',
  inputs:['21'],starter:'number = input("Pick a number: ")\nprint(number * 2)\n',answer:'number = int(input("Pick a number: "))\nprint(number * 2)',
  check:c=>c.type('number')!=='int'?'number is still text. Wrap the input() in int(...).':c.printed(String(c.val('number')*2))||'Print number * 2.'}
 ]},
{name:'Decisions',badge:'Pathfinder',intro:'Games react to what happens: low health, enough gold, a locked door. if lets your program choose which lines to run.',
 learned:['== != < > <= >=','True / False','if','else','elif','and, or, not','indentation'],
 missions:[
 {title:'Yes or no questions',goal:'Print the results of <code>5 > 3</code>, <code>10 == 9</code> and <code>"a" != "b"</code>.',
  anat:[['5','num'],['>','op','greater than'],['3','num']],
  explain:'A comparison gives back <code>True</code> or <code>False</code>. <code>==</code> asks "are these equal?" (two signs, because one <code>=</code> means "store"). <code>!=</code> means "not equal".',
  starter:'',answer:'print(5 > 3)\nprint(10 == 9)\nprint("a" != "b")',
  check:c=>c.lines.join('|')==='True|False|True'||'You should see True, False, True.'},
 {title:'Your first if',goal:'With <code>hp = 20</code>, print <code>Low health! Drink a potion.</code> only if hp is below 30.',
  anat:[['if','kw'],['hp < 30','var','condition'],[':','op','colon!']],
  explain:'<code>if</code> runs the indented lines underneath only when the condition is True. Two things matter: the <b>colon</b> at the end and the <b>4-space indent</b> on the next line. Press <kbd>Tab</kbd> to indent.',
  starter:'hp = 20\n',answer:'hp = 20\nif hp < 30:\n    print("Low health! Drink a potion.")',
  check:c=>!/^\s*if\b/m.test(c.code)?'Use an if statement.':c.printed('Low health! Drink a potion.')||'Print the warning inside the if.'},
 {title:'Otherwise...',goal:'With <code>gold = 5</code>: if gold is at least 10, print <code>You buy a sword</code>, else print <code>Not enough gold</code>.',
  anat:[['if','kw'],['gold >= 10','var'],[':','op'],['else','kw'],[':','op']],
  explain:'<code>else</code> catches every case the <code>if</code> did not. Exactly one of the two blocks runs. <code>else</code> lines up with its <code>if</code>, not with the indented lines.',
  starter:'gold = 5\n',answer:'gold = 5\nif gold >= 10:\n    print("You buy a sword")\nelse:\n    print("Not enough gold")',
  check:c=>!/^\s*else\s*:/m.test(c.code)?'Add an else: block.':c.printed('Not enough gold')&&!c.printed('You buy a sword')?true:'With 5 gold, only "Not enough gold" should print.'},
 {title:'More than two paths',goal:'Give a medal for <code>score = 85</code>: 90 or more is <code>Gold</code>, 70 or more is <code>Silver</code>, anything else is <code>Bronze</code>.',
  anat:[['if','kw'],['elif','kw','else if'],['else','kw']],
  explain:'<code>elif</code> means "else if". Python checks each condition from top to bottom and runs only the <b>first</b> one that is True. That is why the order matters: check the biggest score first.',
  note:'Try changing score to 95 and 40 and run it again.',
  starter:'score = 85\n',answer:'score = 85\nif score >= 90:\n    print("Gold")\nelif score >= 70:\n    print("Silver")\nelse:\n    print("Bronze")',
  check:c=>!/^\s*elif\b/m.test(c.code)?'Use elif for the middle case.':c.val('score')===85&&c.lines.join('|')!=='Silver'?'With score 85 only Silver should print.':true},
 {title:'Two things at once',goal:'Print <code>The door opens</code> only if <code>has_key</code> is True <b>and</b> <code>hp</code> is above 0.',
  anat:[['has_key','var'],['and','kw','both'],['hp > 0','var']],
  explain:'<code>and</code> needs both sides True. <code>or</code> needs at least one. <code>not</code> flips True and False.',
  starter:'has_key = True\nhp = 40\n',answer:'has_key = True\nhp = 40\nif has_key and hp > 0:\n    print("The door opens")',
  check:c=>!/\band\b/.test(c.code)?'Join the two conditions with and.':c.printed('The door opens')||'Print The door opens inside the if.'},
 {title:'Bug hunt: indentation',goal:'This crashes with an <code>IndentationError</code>. Fix it so the warning prints.',
  anat:[['    ','op','4 spaces']],
  explain:'In Python, <b>indentation is part of the code</b>. The spaces tell Python which lines belong inside the if. Other languages use curly brackets; Python uses spaces.',
  starter:'traps = 3\nif traps > 0:\nprint("Watch your step!")\n',answer:'traps = 3\nif traps > 0:\n    print("Watch your step!")',
  check:c=>c.printed('Watch your step!')||'Indent the print line by 4 spaces.'}
 ]},
{name:'Lists',badge:'Collector',intro:'A list holds many values in order, inside one box. Inventories, high scores, enemies in a room: all lists.',
 learned:['[a, b, c]','list[0]','.append()','.remove()  .pop()','in','list[i] = x','len(list)'],
 missions:[
 {title:'Pack your bag',goal:'Make <code>inventory</code> a list with <code>"sword"</code>, <code>"shield"</code> and <code>"potion"</code>. Print it.',
  anat:[['inventory','var'],['=','op'],['[','br','list'],['"sword", "shield", "potion"','str','items'],[']','br']],
  explain:'Square brackets make a list. Commas separate the items. Look at the memory map: one box with numbered slots.',
  starter:'',answer:'inventory = ["sword", "shield", "potion"]\nprint(inventory)',
  check:c=>c.type('inventory')!=='list'?'Make inventory a list with square brackets.':JSON.stringify(c.val('inventory'))!=='["sword","shield","potion"]'?'The list should be ["sword", "shield", "potion"] in that order.':c.printed("['sword', 'shield', 'potion']")||'Print inventory.'},
 {title:'Reach into the bag',goal:'Print the first item and the last item of <code>inventory</code>.',
  anat:[['inventory','var'],['[0]','num','first'],['inventory','var'],['[-1]','num','last']],
  explain:'Lists use the same index numbers as text: 0 for the first item, -1 for the last. The memory map shows each slot\'s number.',
  starter:'inventory = ["sword", "shield", "potion"]\n',answer:'inventory = ["sword", "shield", "potion"]\nprint(inventory[0])\nprint(inventory[-1])',
  check:c=>c.printed('sword')&&c.printed('potion')||'Print sword and potion using indexes.'},
 {title:'Pick something up',goal:'You found a map. Use <code>.append()</code> to add <code>"map"</code> to the end, then print <code>len(inventory)</code>.',
  anat:[['inventory','var'],['.append','fn','add to end'],['("map")','str']],
  explain:'<code>.append()</code> adds one item to the end. Lists can grow and shrink, unlike text. Use the step slider to watch the new slot appear.',
  starter:'inventory = ["sword", "shield", "potion"]\n',answer:'inventory = ["sword", "shield", "potion"]\ninventory.append("map")\nprint(len(inventory))',
  check:c=>!/\.append\(/.test(c.code)?'Use inventory.append("map").':!(c.val('inventory')||[]).includes('map')?'Add "map" to the list.':c.printed(String(c.val('inventory').length))||'Print len(inventory).'},
 {title:'Use it up',goal:'Drink the potion: remove <code>"potion"</code> from the list with <code>.remove()</code> and print the list.',
  anat:[['inventory','var'],['.remove','fn'],['("potion")','str']],
  explain:'<code>.remove(x)</code> deletes the first item equal to x. <code>.pop()</code> removes the last item and hands it back to you, so you can store it: <code>item = inventory.pop()</code>.',
  starter:'inventory = ["sword", "shield", "potion", "map"]\n',answer:'inventory = ["sword", "shield", "potion", "map"]\ninventory.remove("potion")\nprint(inventory)',
  check:c=>(c.val('inventory')||[]).includes('potion')?'potion is still in the list.':!/\.remove\(|\.pop\(/.test(c.code)?'Use .remove("potion").':c.out.includes("['sword', 'shield', 'map']")||'Print the inventory.'},
 {title:'Check the bag',goal:'If <code>"sword"</code> is <b>in</b> the inventory, print <code>Ready to fight!</code>.',
  anat:[['"sword"','str'],['in','kw','is inside?'],['inventory','var']],
  explain:'<code>in</code> asks "is this item somewhere in the list?" and gives back True or False. It works on text too: <code>"dra" in "dragon"</code> is True.',
  starter:'inventory = ["sword", "shield", "map"]\n',answer:'inventory = ["sword", "shield", "map"]\nif "sword" in inventory:\n    print("Ready to fight!")',
  check:c=>!/\bin\b/.test(c.code.replace(/print\(.*\)/g,''))?'Use the in keyword.':c.printed('Ready to fight!')||'Print Ready to fight!'},
 {title:'Upgrade an item',goal:'Swap the shield for a better one: set <code>inventory[1]</code> to <code>"golden shield"</code> and print the list.',
  anat:[['inventory','var'],['[1]','num'],['=','op'],['"golden shield"','str']],
  explain:'You can replace any slot by assigning to its index. Text cannot do this (text is <b>immutable</b>), but lists can (they are <b>mutable</b>).',
  starter:'inventory = ["sword", "shield", "map"]\n',answer:'inventory = ["sword", "shield", "map"]\ninventory[1] = "golden shield"\nprint(inventory)',
  check:c=>(c.val('inventory')||[])[1]!=='golden shield'?'inventory[1] should be "golden shield".':!/inventory\[1\]\s*=/.test(c.code)?'Assign to inventory[1] directly.':c.out.includes('golden shield')||'Print the list.'}
 ]},
{name:'Loops',badge:'Looper',intro:'Loops repeat code so you do not have to copy it. A for loop goes through items one by one. A while loop keeps going as long as something is True.',
 learned:['for x in list','range(a, b)','total += x','while','break','infinite loops'],
 missions:[
 {title:'Check every item',goal:'Use a <code>for</code> loop to print each item in <code>inventory</code> on its own line.',
  anat:[['for','kw'],['item','var','each one'],['in','kw'],['inventory','var'],[':','op']],
  explain:'The loop takes each item in turn, puts it in the <code>item</code> box, and runs the indented lines. Then it moves to the next item. After running, step through it and watch the line marker jump back up.',
  starter:'inventory = ["sword", "shield", "map", "torch"]\n',answer:'inventory = ["sword", "shield", "map", "torch"]\nfor item in inventory:\n    print(item)',
  check:c=>!/^\s*for\b/m.test(c.code)?'Use a for loop.':c.lines.join('|')==='sword|shield|map|torch'||'Print each item, one per line.'},
 {title:'Count with range',goal:'Print the numbers 1 to 5 using <code>for</code> and <code>range()</code>.',
  anat:[['for','kw'],['i','var'],['in','kw'],['range','fn'],['(1, 6)','num','1 up to 6']],
  explain:'<code>range(1, 6)</code> gives 1, 2, 3, 4, 5. Like slices, it stops <b>before</b> the second number. <code>range(5)</code> alone gives 0 to 4.',
  starter:'',answer:'for i in range(1, 6):\n    print(i)',
  check:c=>!/range\(/.test(c.code)?'Use range().':c.lines.join('|')==='1|2|3|4|5'||'Print 1, 2, 3, 4, 5 on separate lines.'},
 {title:'Add it all up',goal:'Add up the coins in <code>coins</code> with a loop. Start <code>total = 0</code>, add each coin, then print the total.',
  anat:[['total','var'],['+=','op'],['coin','var']],
  explain:'This is the <b>accumulator pattern</b>: start a box at 0, then add to it each time around the loop. You will use it for scores, totals and counts.',
  note:'Python also has sum(coins), but writing the loop shows how it works.',
  starter:'coins = [5, 10, 20, 15]\ntotal = 0\n',answer:'coins = [5, 10, 20, 15]\ntotal = 0\nfor coin in coins:\n    total += coin\nprint(total)',
  check:c=>!/^\s*for\b/m.test(c.code)?'Use a for loop to add each coin.':c.val('total')!==50?'total should end at 50.':c.printed('50')||'Print total after the loop (not indented).'},
 {title:'Fight until it falls',goal:'A slime has <code>hp = 50</code>. Use <code>while hp > 0:</code> to hit it for 15 each time and print hp after every hit.',
  anat:[['while','kw'],['hp > 0','var','keep going if'],[':','op']],
  explain:'A <code>while</code> loop checks its condition, runs the body, then checks again. It stops the moment the condition is False. Something inside must change, or it never ends.',
  starter:'hp = 50\n',answer:'hp = 50\nwhile hp > 0:\n    hp -= 15\n    print(hp)',
  check:c=>!/^\s*while\b/m.test(c.code)?'Use a while loop.':c.val('hp')>0?'Keep hitting until hp is 0 or less.':c.lines.join('|')==='35|20|5|-10'||'Print hp after each hit: 35, 20, 5, -10.'},
 {title:'Stop early',goal:'Find the first number whose square is more than 50. Loop over <code>range(1, 100)</code>, and when <code>n * n > 50</code>, print n and <code>break</code>.',
  anat:[['if','kw'],['n * n > 50','var'],[':','op'],['break','kw','leave loop']],
  explain:'<code>break</code> jumps straight out of the loop, even if there are items left. <code>continue</code> skips to the next round.',
  starter:'for n in range(1, 100):\n',answer:'for n in range(1, 100):\n    if n * n > 50:\n        print(n)\n        break',
  check:c=>!/\bbreak\b/.test(c.code)?'Use break to stop the loop.':c.lines.join('|')==='8'||'Only 8 should print.'},
 {title:'Countdown',goal:'Count down from 5 to 1 with <code>range(5, 0, -1)</code>, then print <code>Liftoff!</code>.',
  anat:[['range','fn'],['(5,','num','start'],['0,','num','stop'],['-1)','num','step']],
  explain:'A third number in <code>range</code> is the <b>step</b>. A step of -1 counts backwards. A step of 2 skips every other number.',
  starter:'',answer:'for i in range(5, 0, -1):\n    print(i)\nprint("Liftoff!")',
  check:c=>c.lines.join('|')==='5|4|3|2|1|Liftoff!'||'You should see 5, 4, 3, 2, 1 then Liftoff! (print Liftoff! once, after the loop).'},
 {title:'Bug hunt: the endless loop',goal:'This loop never stops, so the playground halts it. Fix it so it prints 0 to 4.',
  anat:[['count','var'],['+=','op'],['1','num']],
  explain:'<code>count</code> never changes, so <code>count < 5</code> is True forever. This is an <b>infinite loop</b>. On a real computer, press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop one.',
  starter:'count = 0\nwhile count < 5:\n    print(count)\n',answer:'count = 0\nwhile count < 5:\n    print(count)\n    count += 1',
  check:c=>c.lines.join('|')==='0|1|2|3|4'||'Make count grow by 1 inside the loop.'}
 ]},
{name:'Functions',badge:'Spellcaster',intro:'A function is a named recipe. You write it once with def, then call it whenever you need it. Watch the memory map: each call gets its own frame of boxes.',
 learned:['def name():','parameters','return','default values','local vs global'],
 missions:[
 {title:'Your first spell',goal:'Define <code>greet()</code> that prints <code>Welcome, traveler!</code>, then call it <b>twice</b>.',
  anat:[['def','kw','define'],['greet','fn'],['()','br'],[':','op']],
  explain:'<code>def</code> creates the function but does not run it. Running it is called <b>calling</b> it: write its name with brackets, <code>greet()</code>. The call goes below the definition, not indented.',
  starter:'',answer:'def greet():\n    print("Welcome, traveler!")\n\ngreet()\ngreet()',
  check:c=>!c.fn('greet')?'Define a function called greet with def.':c.lines.filter(l=>l==='Welcome, traveler!').length!==2?'Call greet() two times so the message prints twice.':true},
 {title:'Give it something',goal:'Change greet to take a <code>name</code> parameter and print <code>Hello, NAME!</code>. Call it with "Ada" and with "Kai".',
  anat:[['def','kw'],['greet','fn'],['(name)','var','parameter']],
  explain:'A <b>parameter</b> is a box the function fills when you call it. <code>greet("Ada")</code> puts "Ada" into <code>name</code> for that call only.',
  starter:'def greet():\n    print("Welcome, traveler!")\n',answer:'def greet(name):\n    print(f"Hello, {name}!")\n\ngreet("Ada")\ngreet("Kai")',
  check:c=>{if(!c.fn('greet'))return 'Keep a function called greet.';try{const r=c.call('greet','Zed');if(!r.out.includes('Hello, Zed!'))return 'greet("Zed") should print Hello, Zed!'}catch(e){return 'greet should take one parameter, name.'}return c.printed('Hello, Ada!')&&c.printed('Hello, Kai!')||'Call greet("Ada") and greet("Kai").'}},
 {title:'Get an answer back',goal:'Write <code>double(n)</code> that <b>returns</b> n times 2. Store <code>result = double(21)</code> and print it.',
  anat:[['return','kw','send back'],['n * 2','var']],
  explain:'<code>print</code> shows a value on screen. <code>return</code> hands a value back to whoever called the function, so they can store it or use it in more math. Most useful functions return something.',
  starter:'',answer:'def double(n):\n    return n * 2\n\nresult = double(21)\nprint(result)',
  check:c=>{if(!c.fn('double'))return 'Define double(n).';let r;try{r=c.call('double',5)}catch(e){return 'double should take one number.'}if(r.v!==10)return 'double(5) should return 10. Did you use return?';return c.val('result')===42&&c.printed('42')||'Store double(21) in result and print it.'}},
 {title:'Optional extras',goal:'Write <code>attack(power, bonus=0)</code> that returns <code>power * 2 + bonus</code>. Print <code>attack(5)</code> and <code>attack(5, 3)</code>.',
  anat:[['attack','fn'],['(power,','var'],['bonus=0','var','default'],[')','br']],
  explain:'<code>bonus=0</code> is a <b>default value</b>. If the caller leaves it out, bonus is 0. If they pass a number, that is used instead.',
  starter:'',answer:'def attack(power, bonus=0):\n    return power * 2 + bonus\n\nprint(attack(5))\nprint(attack(5, 3))',
  check:c=>{if(!c.fn('attack'))return 'Define attack(power, bonus=0).';try{if(c.call('attack',5).v!==10)return 'attack(5) should return 10.';if(c.call('attack',5,3).v!==13)return 'attack(5, 3) should return 13.'}catch(e){return 'attack needs a default: bonus=0'}return c.printed('10')&&c.printed('13')||'Print both results.'}},
 {title:'Boxes inside functions',goal:'Write <code>heal(hp)</code> that adds 20 and returns the new value. Then do <code>hp = heal(hp)</code> and print hp (50 becomes 70).',
  anat:[['hp','var','global box'],['=','op'],['heal','fn'],['(hp)','var','copy goes in']],
  explain:'Variables made inside a function are <b>local</b>: they live in the function\'s own frame and disappear when it returns. Step through and watch the <code>heal()</code> frame appear, then vanish. The only way out is <code>return</code>.',
  starter:'hp = 50\n',answer:'hp = 50\n\ndef heal(hp):\n    hp = hp + 20\n    return hp\n\nhp = heal(hp)\nprint(hp)',
  check:c=>{if(!c.fn('heal'))return 'Define heal(hp).';try{if(c.call('heal',10).v!==30)return 'heal(10) should return 30.'}catch(e){return 'heal should take one number and return it plus 20.'}return c.val('hp')===70&&c.printed('70')||'Set hp = heal(hp) and print it.'}},
 {title:'Functions + lists',goal:'Write <code>total_gold(bags)</code> that uses a loop to add up a list of numbers and returns the total.',
  anat:[['def','kw'],['total_gold','fn'],['(bags)','var','a list']],
  explain:'A function can take a list, loop over it, and return one answer. This is the accumulator pattern from Loops, wrapped in a reusable name.',
  starter:'def total_gold(bags):\n    total = 0\n    # loop here\n    return total\n\nprint(total_gold([3, 7, 10]))\n',answer:'def total_gold(bags):\n    total = 0\n    for bag in bags:\n        total += bag\n    return total\n\nprint(total_gold([3, 7, 10]))',
  check:c=>{if(!c.fn('total_gold'))return 'Keep the total_gold function.';if(!/^\s*for\b/m.test(c.code))return 'Use a for loop inside the function.';try{if(c.call('total_gold',[1,2,3]).v!==6)return 'total_gold([1, 2, 3]) should return 6.';if(c.call('total_gold',[]).v!==0)return 'total_gold([]) should return 0.'}catch(e){return 'total_gold should return a number.'}return true}}
 ]},
{name:'Dictionaries',badge:'Archivist',intro:'A dictionary (dict) stores pairs: a key and its value. Instead of a position number, you look things up by name, like a real dictionary.',
 learned:['{"key": value}','d["key"]','d["new"] = x','.get(key, default)','.items()','in (keys)'],
 missions:[
 {title:'A character sheet',goal:'Make <code>hero = {"name": "Ada", "hp": 100, "gold": 25}</code> and print <code>hero["name"]</code>.',
  anat:[['{','br','dict'],['"name"','str','key'],[':','op'],['"Ada"','str','value'],['}','br']],
  explain:'Curly brackets make a dict. Each entry is <code>key: value</code>. To read a value, put its key in square brackets. In the memory map, each key points to its value.',
  starter:'',answer:'hero = {"name": "Ada", "hp": 100, "gold": 25}\nprint(hero["name"])',
  check:c=>c.type('hero')!=='dict'?'Make hero a dict with curly brackets.':(()=>{const h=c.val('hero');return h.name&&h.hp===100&&h.gold===25?(c.printed(h.name)||'Print hero["name"].'):'hero needs keys "name", "hp" (100) and "gold" (25).'})()},
 {title:'Level up',goal:'Add 50 to <code>hero["gold"]</code> and add a new key <code>"level"</code> with value 2. Print the dict.',
  anat:[['hero','var'],['["level"]','str','new key'],['=','op'],['2','num']],
  explain:'Assigning to a key that exists changes it. Assigning to a new key adds it. <code>hero["gold"] += 50</code> works just like with a normal variable.',
  starter:'hero = {"name": "Ada", "hp": 100, "gold": 25}\n',answer:'hero = {"name": "Ada", "hp": 100, "gold": 25}\nhero["gold"] += 50\nhero["level"] = 2\nprint(hero)',
  check:c=>{const h=c.val('hero')||{};return h.gold!==75?'hero["gold"] should become 75.':h.level!==2?'Add hero["level"] = 2.':c.out.includes("'level': 2")||'Print hero.'}},
 {title:'Safe lookups',goal:'Print <code>hero.get("mana", 0)</code>. The key does not exist, so you should see 0 instead of a crash.',
  anat:[['hero','var'],['.get','fn'],['("mana",','str','key'],['0)','num','if missing']],
  explain:'<code>hero["mana"]</code> would crash with a <code>KeyError</code> because there is no such key. <code>.get(key, default)</code> gives back the default instead. Use <code>"mana" in hero</code> to check first.',
  starter:'hero = {"name": "Ada", "hp": 100}\n',answer:'hero = {"name": "Ada", "hp": 100}\nprint(hero.get("mana", 0))',
  check:c=>!/\.get\(/.test(c.code)?'Use hero.get("mana", 0).':c.printed('0')||'Print the result of .get().'},
 {title:'Read the whole sheet',goal:'Loop over <code>hero.items()</code> and print each pair as <code>key: value</code>.',
  anat:[['for','kw'],['key, value','var','two boxes'],['in','kw'],['hero.items()','fn']],
  explain:'<code>.items()</code> gives each pair. Writing <code>key, value</code> unpacks the pair into two boxes at once. Looping over a dict on its own gives just the keys.',
  starter:'hero = {"name": "Ada", "hp": 100, "gold": 75}\n',answer:'hero = {"name": "Ada", "hp": 100, "gold": 75}\nfor key, value in hero.items():\n    print(f"{key}: {value}")',
  check:c=>!/\.items\(\)/.test(c.code)?'Loop over hero.items().':c.printed('name: Ada')&&c.printed('hp: 100')||'Print each line as key: value.'},
 {title:'The village shop',goal:'Ask which item to buy with <code>input()</code>. If it is in <code>prices</code>, print <code>That costs N gold</code>, otherwise print <code>We don\'t sell that</code>.',
  anat:[['if','kw'],['item','var'],['in','kw'],['prices','var'],[':','op']],
  explain:'This mixes everything so far: input, a dict lookup, and an if/else. <code>item in prices</code> checks the keys.',
  note:'Change the answer in the tray to "dragon" and run again to test the else path.',
  inputs:['sword'],starter:'prices = {"apple": 2, "torch": 8, "sword": 15}\n',answer:'prices = {"apple": 2, "torch": 8, "sword": 15}\nitem = input("What would you like? ")\nif item in prices:\n    print(f"That costs {prices[item]} gold")\nelse:\n    print("We don\'t sell that")',
  check:c=>{if(!/input\(/.test(c.code))return 'Ask with input().';if(!/^\s*else\s*:/m.test(c.code))return 'Add an else for items the shop does not sell.';const it=c.val('item'),p=c.val('prices')||{};
    return it in p?(c.out.includes(`That costs ${p[it]} gold`)||`Print That costs ${p[it]} gold`):(c.out.includes("We don't sell that")||"Print We don't sell that")}}
 ]},
{name:'Build a game',badge:'Game Maker',intro:'Time to combine it all. You will use the random module, catch bad input, and build a guessing game and a battle loop.',
 learned:['import random','random.randint()','random.choice()','try / except','while True + break','putting it together'],
 missions:[
 {title:'Roll the dice',goal:'Import random and store <code>roll = random.randint(1, 6)</code>. Print the roll. Run it a few times.',
  anat:[['import','kw'],['random','var','module'],['random.randint','fn'],['(1, 6)','num','1 to 6']],
  explain:'<code>import</code> loads extra tools. The <code>random</code> module picks random numbers. <code>randint(1, 6)</code> includes both ends, unlike range.',
  starter:'',answer:'import random\n\nroll = random.randint(1, 6)\nprint(f"You rolled a {roll}")',
  check:c=>!/import random|from random/.test(c.code)?'Start with import random.':c.type('roll')!=='int'||c.val('roll')<1||c.val('roll')>6?'roll should be random.randint(1, 6).':c.out.includes(String(c.val('roll')))||'Print the roll.'},
 {title:'Random loot',goal:'Make a list of loot and use <code>random.choice()</code> to pick one. Print <code>You found: ITEM</code>.',
  anat:[['random.choice','fn'],['(loot)','var','a list']],
  explain:'<code>random.choice(list)</code> picks one item at random. Games use it for loot drops, enemy moves and dialogue.',
  starter:'import random\n\nloot = ["gold coin", "old boot", "magic ring", "apple"]\n',answer:'import random\n\nloot = ["gold coin", "old boot", "magic ring", "apple"]\nfound = random.choice(loot)\nprint(f"You found: {found}")',
  check:c=>!/random\.choice\(|choice\(/.test(c.code)?'Use random.choice(loot).':/You found: /.test(c.out)||'Print You found: and the item.'},
 {title:'Catch bad input',goal:'Ask for a number. If the player types something that is not a number, print <code>That is not a number</code> instead of crashing.',
  anat:[['try','kw','attempt'],[':','op'],['except','kw'],['ValueError','fn','this error'],[':','op']],
  explain:'<code>int("abc")</code> crashes with a <code>ValueError</code>. Put risky code under <code>try:</code>. If that error happens, Python jumps to <code>except ValueError:</code> instead of stopping.',
  note:'The tray has "abc" in it. Change it to "12" to test the happy path.',
  inputs:['abc'],starter:'',answer:'try:\n    number = int(input("Enter a number: "))\n    print(f"Double that is {number * 2}")\nexcept ValueError:\n    print("That is not a number")',
  check:c=>!/^\s*try\s*:/m.test(c.code)||!/^\s*except\b/m.test(c.code)?'Use try: and except ValueError:':c.inputs[0]!==undefined&&!/^\s*-?\d+\s*$/.test(c.inputs[0])?(c.out.includes('That is not a number')||'Print That is not a number in the except block.'):true},
 {title:'Guess the number',goal:'Build the guessing game: the secret is 7. Keep asking until the guess is right. Say <code>Too low</code> or <code>Too high</code> each time, and <code>You got it!</code> at the end.',
  anat:[['while','kw'],['True','kw','forever...'],[':','op'],['break','kw','...until this']],
  explain:'<code>while True:</code> loops forever, so you need a <code>break</code> when the player wins. The tray holds three guesses: 3, 9, then 7.',
  note:'When it works, change secret = 7 to secret = random.randint(1, 10) and import random. Now it is a real game.',
  inputs:['3','9','7'],starter:'secret = 7\n\nwhile True:\n    guess = int(input("Guess (1-10): "))\n    # compare guess to secret here\n',answer:'secret = 7\n\nwhile True:\n    guess = int(input("Guess (1-10): "))\n    if guess < secret:\n        print("Too low")\n    elif guess > secret:\n        print("Too high")\n    else:\n        print("You got it!")\n        break',
  check:c=>{if(!/\bbreak\b/.test(c.code))return 'Use break when the guess is right.';if(c.err&&c.err.type==='EOFError')return 'The loop kept asking after the right guess. Add break after You got it!';
    return !/Too low/i.test(c.out)?'Print Too low when the guess is smaller.':!/Too high/i.test(c.out)?'Print Too high when the guess is bigger.':/You got it!/.test(c.out)||'Print You got it! when they guess right.'}},
 {title:'Boss battle',goal:'Finish the battle loop: while both are alive, the hero hits the dragon with <code>attack()</code>, then the dragon hits back for 8. Print who won.',
  anat:[['while','kw'],['hero["hp"] > 0','var'],['and','kw'],['dragon["hp"] > 0','var'],[':','op']],
  explain:'Two dicts, a function, a loop and decisions together. This is how real games are built: small pieces you already know, combined.',
  note:'Step through it with the slider and watch both hp values drop each round.',
  starter:'import random\n\nhero = {"name": "Ada", "hp": 40}\ndragon = {"name": "Dragon", "hp": 50}\n\ndef attack():\n    return random.randint(6, 12)\n\nround_number = 1\nwhile hero["hp"] > 0 and dragon["hp"] > 0:\n    damage = attack()\n    dragon["hp"] -= damage\n    print(f"Round {round_number}: you hit for {damage}. Dragon has {dragon[\'hp\']} HP")\n    # the dragon hits back for 8 here (only if it is still alive)\n\n    round_number += 1\n\n# print who won here\n',
  answer:'import random\n\nhero = {"name": "Ada", "hp": 40}\ndragon = {"name": "Dragon", "hp": 50}\n\ndef attack():\n    return random.randint(6, 12)\n\nround_number = 1\nwhile hero["hp"] > 0 and dragon["hp"] > 0:\n    damage = attack()\n    dragon["hp"] -= damage\n    print(f"Round {round_number}: you hit for {damage}. Dragon has {dragon[\'hp\']} HP")\n    if dragon["hp"] > 0:\n        hero["hp"] -= 8\n        print(f"The dragon breathes fire! You have {hero[\'hp\']} HP")\n    round_number += 1\n\nif hero["hp"] > 0:\n    print("You defeated the dragon!")\nelse:\n    print("The dragon wins this time.")',
  check:c=>{const h=c.val('hero')||{},d=c.val('dragon')||{};if(h.hp===40)return 'The dragon should hit back: hero["hp"] -= 8 inside the loop.';
    if(h.hp>0&&d.hp>0)return 'The loop should run until one of them reaches 0.';return /defeated|win|won|wins|lost|lose/i.test(c.lines.slice(-1)[0]||'')||'After the loop, print who won.'}},
 {title:'Make it yours',goal:'Free build: write your own small game or program, at least 8 lines, that uses a <b>function</b> and a <b>loop</b> and runs without errors.',
  anat:[['def','kw'],['for / while','kw'],['if','kw'],['print','fn']],
  explain:'Ideas: a dice duel against the computer, a shop where you spend gold until it runs out, a quiz that keeps score, a times-table trainer. Use the Field guide when you forget something.',
  starter:'# Your game goes here\n',answer:'import random\n\ndef roll():\n    return random.randint(1, 6)\n\nscore = 0\nfor turn in range(1, 4):\n    mine = roll()\n    theirs = roll()\n    print(f"Turn {turn}: you {mine}, computer {theirs}")\n    if mine > theirs:\n        score += 1\nprint(f"You won {score} of 3 turns")',
  check:c=>{const n=c.code.split('\n').filter(l=>l.trim()).length;return n<8?`Write at least 8 lines of code (you have ${n}).`:!/^\s*def\b/m.test(c.code)?'Include a function (def).':!/^\s*(for|while)\b/m.test(c.code)?'Include a loop (for or while).':!c.out.trim()?'Make it print something.':true}}
 ]}
];

/* ---------- Quick-fire: predict the output ---------- */
const QF=[
 {c:'print(3 + 4 * 2)',w:['14','10','34'],why:'* happens before +, so 4 * 2 = 8, then 3 + 8.'},
 {c:'print("3" + "4")',w:['7','3 + 4','TypeError'],why:'Quotes make text. + joins text.'},
 {c:'print(10 / 4)',w:['2','2.0','2.25'],why:'/ always gives a float with the exact answer.'},
 {c:'print(10 // 4)',w:['2.5','3','2.0'],why:'// keeps only the whole part.'},
 {c:'print(10 % 4)',w:['2.5','0','4'],why:'% is the remainder: 10 = 4 × 2 + 2.'},
 {c:'print(2 ** 3)',w:['6','5','23'],why:'** is power: 2 × 2 × 2.'},
 {c:'x = 5\nx = x + 2\nprint(x)',w:['5','x + 2','52'],why:'The right side is worked out first (5 + 2), then stored back in x.'},
 {c:'x = 10\nx -= 3\nx *= 2\nprint(x)',w:['17','4','20'],why:'10 - 3 = 7, then 7 × 2 = 14.'},
 {c:'name = "Kai"\nprint("Hi " + name)',w:['Hi name','Hi+Kai','HiKai'],why:'name without quotes means the value in the box.'},
 {c:'print("ha" * 3)',w:['ha3','ha ha ha','TypeError'],why:'Text times a number repeats it.'},
 {c:'word = "python"\nprint(word[1])',w:['p','t','py'],why:'Indexes start at 0, so [1] is the second letter.'},
 {c:'word = "python"\nprint(word[-1])',w:['p','o','IndexError'],why:'-1 is the last character.'},
 {c:'word = "python"\nprint(word[0:2])',w:['pyt','y','yt'],why:'A slice stops before the end number.'},
 {c:'print(len("hello"))',w:['4','6','hello'],why:'len counts characters: h e l l o.'},
 {c:'print(type(3.0))',w:["<class 'int'>","<class 'str'>",'3.0'],why:'A decimal point makes a float, even .0.'},
 {c:'print(int("7") + 1)',w:['71','"8"','TypeError'],why:'int() turns the text "7" into the number 7.'},
 {c:'print(str(7) + "1")',w:['8','7 1','TypeError'],why:'str(7) is the text "7", so + joins.'},
 {c:'print(5 > 3 and 2 > 4)',w:['True','5','None'],why:'and needs both sides True. 2 > 4 is False.'},
 {c:'print(5 > 3 or 2 > 4)',w:['False','3','None'],why:'or needs only one side True.'},
 {c:'print(not 5 == 5)',w:['True','5','None'],why:'5 == 5 is True, and not flips it.'},
 {c:'hp = 25\nif hp > 50:\n    print("Strong")\nelif hp > 20:\n    print("OK")\nelse:\n    print("Weak")',w:['Strong','Weak','OK\nWeak'],why:'Only the first True branch runs: 25 > 20.'},
 {c:'x = 0\nif x:\n    print("yes")\nelse:\n    print("no")',w:['yes','0','False'],why:'0, empty text and empty lists count as False.'},
 {c:'items = ["a", "b", "c"]\nprint(items[1])',w:['a','c','["b"]'],why:'Lists start counting at 0 too.'},
 {c:'items = ["a", "b"]\nitems.append("c")\nprint(len(items))',w:['2','4','c'],why:'append adds one item, so 3.'},
 {c:'items = [1, 2, 3]\nitems[0] = 9\nprint(items)',w:['[1, 2, 3]','[9, 1, 2, 3]','[1, 9, 3]'],why:'Index 0 is replaced. Lists can change.'},
 {c:'print("b" in ["a", "b", "c"])',w:['False','1','b'],why:'in checks if the item is anywhere in the list.'},
 {c:'nums = [4, 1, 3]\nprint(sorted(nums))',w:['[4, 1, 3]','[4, 3, 1]','[1, 4, 3]'],why:'sorted gives a new list, smallest first.'},
 {c:'for i in range(3):\n    print(i)',w:['1\n2\n3','0\n1\n2\n3','3'],why:'range(3) is 0, 1, 2. It stops before 3.'},
 {c:'total = 0\nfor n in [1, 2, 3]:\n    total += n\nprint(total)',w:['3','123','0'],why:'The loop adds 1, then 2, then 3.'},
 {c:'for c in "hi":\n    print(c)',w:['hi','h i','c\nc'],why:'A for loop over text gives one character at a time.'},
 {c:'n = 3\nwhile n > 0:\n    n -= 1\nprint(n)',w:['3','1','-1'],why:'The loop stops when n reaches 0.'},
 {c:'for i in range(10):\n    if i == 3:\n        break\nprint(i)',w:['10','9','2'],why:'break leaves the loop while i is 3.'},
 {c:'for i in range(1, 10, 3):\n    print(i)',w:['1\n2\n3','3\n6\n9','1\n3\n9'],why:'Start at 1, step by 3, stop before 10.'},
 {c:'def add(a, b):\n    return a + b\nprint(add(2, 3))',w:['23','a + b','None'],why:'return sends back 2 + 3.'},
 {c:'def say():\n    print("hi")\nx = say()\nprint(x)',w:['hi','hi\nhi','None'],why:'say prints hi but returns nothing, so x is None.'},
 {c:'def f(x=2):\n    return x * 10\nprint(f())',w:['0','x10','TypeError'],why:'No argument given, so the default 2 is used.'},
 {c:'d = {"a": 1, "b": 2}\nprint(d["b"])',w:['1','b','["b"]'],why:'Square brackets look up a key.'},
 {c:'d = {"a": 1}\nprint(d.get("z", 0))',w:['None','KeyError','z'],why:'.get returns the default when the key is missing.'},
 {c:'d = {"a": 1}\nd["a"] += 5\nprint(d)',w:["{'a': 1}","{'a': 15}","{'a': 1, 'a': 6}"],why:'Keys are unique. The value for "a" becomes 6.'},
 {c:'print(len({"x": 1, "y": 2}))',w:['4','1','3'],why:'len of a dict counts its keys.'},
 {c:'print(f"{2 + 3} cats")',w:['{2 + 3} cats','2 + 3 cats','23 cats'],why:'f-strings run the code inside the braces.'},
 {c:'print(round(3.7))',w:['3','3.7','4.0'],why:'round with no digits gives a whole number.'},
 {c:'a = [1, 2]\nb = a\nb.append(3)\nprint(a)',w:['[1, 2]','[3]','[1, 2, 3, 3]'],why:'b = a does not copy. Both names point to the same list.'},
 {c:'print("Hello".upper().lower())',w:['HELLO','Hello','hELLO'],why:'Methods run left to right: upper, then lower.'},
 {c:'print(max([3, 9, 2]))',w:['3','2','[9]'],why:'max returns the biggest item.'}
];

/* ---------- Field guide cards ---------- */
const GUIDE=[
 {ch:0,c:'print()',what:'Shows values in the console. Separate several values with commas.',syn:[['print','fn'],['(','br'],['"Score:", 10','str'],[')','br']],ex:[['print("Score:", 10)','Score: 10'],['print("a", "b", sep="-")','a-b'],['print("no newline", end="")','stays on the line']]},
 {ch:0,c:'# comments',what:'Python skips everything after # on a line.',syn:[['# note to self','cm','comment']],ex:[['# TODO: add a boss\nprint("ok")','only ok prints']]},
 {ch:1,c:'name = value',what:'Store a value in a variable. Using the name later reads the box.',syn:[['gold','var'],['=','op'],['25','num']],ex:[['gold = 25\ngold = gold + 5\nprint(gold)','30'],['a, b = 1, 2\nprint(a, b)','two at once']]},
 {ch:1,c:'types',what:'int (5), float (2.5), str ("hi"), bool (True/False), None.',syn:[['type','fn'],['(x)','var']],ex:[['print(type(5), type(2.5))',''],['print(type("hi"), type(True))','']]},
 {ch:1,c:'f"...{x}..."',what:'An f-string drops values into text. Add :.2f to round to 2 decimals.',syn:[['f','kw'],['"HP: {hp}"','str']],ex:[['hp = 72.456\nprint(f"HP: {hp:.1f}")','HP: 72.5'],['n = "Ada"\nprint(f"Hi {n}!")','Hi Ada!']]},
 {ch:2,c:'+  -  *  /  //  %  **',what:'Add, subtract, multiply, divide, whole divide, remainder, power.',syn:[['17','num'],['//','op'],['5','num']],ex:[['print(17 / 5, 17 // 5, 17 % 5)','3.4 3 2'],['print(2 ** 8)','256']]},
 {ch:2,c:'text methods',what:'.upper() .lower() .title() .strip() .replace(a, b) .split()',syn:[['s','var'],['.upper','fn'],['()','br']],ex:[['print("  hi ".strip())','hi'],['print("a,b,c".split(","))',"['a', 'b', 'c']"],['print("cat".replace("c", "b"))','bat']]},
 {ch:2,c:'s[i]  s[a:b]',what:'Index from 0, negative from the end. Slices stop before b.',syn:[['s','var'],['[1:4]','num']],ex:[['s = "dragon"\nprint(s[0], s[-1], s[1:4])','d n rag'],['print("dragon"[::-1])','reversed']]},
 {ch:2,c:'input()  int()',what:'input() always returns text. Convert with int() or float().',syn:[['age','var'],['=','op'],['int','fn'],['(input("Age? "))','fn']],ex:[['age = int(input("Age? "))\nprint(age + 1)','uses the tray']]},
 {ch:3,c:'comparisons',what:'== equal, != not equal, < > <= >=. Each gives True or False.',syn:[['hp','var'],['<=','op'],['0','num']],ex:[['print(3 == 3, 3 != 4, 2 >= 5)','True True False']]},
 {ch:3,c:'if / elif / else',what:'Run a block only when a condition is True. Colon at the end, indent 4 spaces.',syn:[['if','kw'],['x > 0','var'],[':','op']],ex:[['x = 7\nif x > 5:\n    print("big")\nelif x > 0:\n    print("small")\nelse:\n    print("zero or less")','big']]},
 {ch:3,c:'and  or  not',what:'Combine conditions. and = both, or = either, not = flip.',syn:[['a','var'],['and','kw'],['not','kw'],['b','var']],ex:[['print(True and False, True or False, not True)','False True False']]},
 {ch:4,c:'[a, b, c]',what:'A list keeps items in order. Index like text.',syn:[['bag','var'],['=','op'],['["a", "b"]','str']],ex:[['bag = ["sword", "map"]\nprint(bag[0], len(bag))','sword 2']]},
 {ch:4,c:'list methods',what:'.append(x) .remove(x) .pop() .insert(i, x) .sort() .index(x)',syn:[['bag','var'],['.append','fn'],['("rope")','str']],ex:[['bag = ["b", "a"]\nbag.append("c")\nbag.sort()\nprint(bag)',"['a', 'b', 'c']"],['bag = [1, 2, 3]\nlast = bag.pop()\nprint(last, bag)','3 [1, 2]']]},
 {ch:4,c:'in',what:'Is this item inside the list, text, or dict keys?',syn:[['"a"','str'],['in','kw'],['bag','var']],ex:[['print("map" in ["map", "rope"])','True'],['print("rag" in "dragon")','True']]},
 {ch:5,c:'for x in ...',what:'Repeat once per item in a list, text, range or dict.',syn:[['for','kw'],['x','var'],['in','kw'],['items','var'],[':','op']],ex:[['for item in ["a", "b"]:\n    print(item)',''],['for i, item in enumerate(["a", "b"]):\n    print(i, item)','with positions']]},
 {ch:5,c:'range()',what:'range(stop), range(start, stop), range(start, stop, step). Stops before stop.',syn:[['range','fn'],['(1, 10, 2)','num']],ex:[['print(list(range(5)))','[0, 1, 2, 3, 4]'],['print(list(range(10, 0, -3)))','[10, 7, 4, 1]']]},
 {ch:5,c:'while  break  continue',what:'while repeats as long as the condition is True. break leaves, continue skips ahead.',syn:[['while','kw'],['n < 3','var'],[':','op']],ex:[['n = 0\nwhile n < 3:\n    print(n)\n    n += 1',''],['for i in range(6):\n    if i % 2 == 0:\n        continue\n    print(i)','odd numbers']]},
 {ch:6,c:'def',what:'Define a function once, call it many times. return sends a value back.',syn:[['def','kw'],['area','fn'],['(w, h)','var'],[':','op']],ex:[['def area(w, h):\n    return w * h\nprint(area(3, 4))','12']]},
 {ch:6,c:'defaults & keywords',what:'Give parameters a default. Callers can name arguments.',syn:[['def','kw'],['hit','fn'],['(power=5)','var']],ex:[['def hit(power=5, crit=False):\n    return power * 2 if crit else power\nprint(hit(), hit(8, crit=True))','5 16']]},
 {ch:7,c:'{key: value}',what:'A dict maps keys to values. Look up, change or add by key.',syn:[['d','var'],['["hp"]','str']],ex:[['d = {"hp": 10}\nd["hp"] -= 3\nd["xp"] = 5\nprint(d)',"{'hp': 7, 'xp': 5}"]]},
 {ch:7,c:'dict methods',what:'.get(k, default) .keys() .values() .items() .pop(k)',syn:[['d','var'],['.items','fn'],['()','br']],ex:[['d = {"a": 1, "b": 2}\nfor k, v in d.items():\n    print(k, v)',''],['print({"a": 1}.get("z", "none"))','none']]},
 {ch:8,c:'import random',what:'randint(a, b) includes both ends. choice(list) picks one. shuffle(list) mixes in place.',syn:[['random','var'],['.randint','fn'],['(1, 6)','num']],ex:[['import random\nprint(random.randint(1, 6), random.choice(["a", "b"]))','random each run']]},
 {ch:8,c:'try / except',what:'Catch an error and handle it instead of crashing.',syn:[['try','kw'],[':','op'],['except','kw'],['ValueError','fn'],[':','op']],ex:[['try:\n    print(int("abc"))\nexcept ValueError:\n    print("not a number")','not a number']]}
];
const ERRS={
 SyntaxError:['Python could not read this line.','Check for a missing bracket, quote or colon, or a typo near the marked line.'],
 IndentationError:['The spaces at the start of a line are wrong.','Lines inside if, for, while and def need 4 spaces. Lines at the same level must line up exactly.'],
 NameError:['Python has no variable or function with that name.','Check the spelling and capital letters. Make sure the variable is created above the line that uses it.'],
 TypeError:['You used a value in a way its type does not allow.','A common one: joining text and a number with +. Use str(number), or an f-string.'],
 ValueError:['The type is right but the value is not usable.','Often int() on text that is not a whole number, like "abc" or "3.5".'],
 ZeroDivisionError:['You divided by zero.','Check the number after / or // or % before dividing.'],
 IndexError:['That position does not exist.','A list of 3 items has positions 0, 1 and 2. Check len() first.'],
 KeyError:['That key is not in the dictionary.','Check the spelling, or use .get(key, default) or "key in d" first.'],
 AttributeError:['That value does not have that method.','Check the spelling and the type. Lists use .append, text uses .upper, and so on.'],
 UnboundLocalError:['A function tried to change an outside variable.','Return the new value instead, or add "global name" at the top of the function.'],
 TooManySteps:['Your program kept running, so the playground stopped it.','This is usually an infinite loop: something in the while condition never changes.'],
 EOFError:['input() ran out of answers.','Add another line to the Answers tray below the editor, one answer per line.'],
 RecursionError:['A function kept calling itself with no end.','Make sure there is a case where it stops calling itself.'],
 ModuleNotFoundError:['That module is not available here.','This playground includes random, math and time.'],
 OutputLimit:['Your program printed a huge amount of text.','Check for a loop that prints more than you meant.']
};
/* ---------- Python Quest app ---------- */
(()=>{
const KEY='python-quest-v1';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fresh(){return {ch:0,mi:0,done:{},xp:0,best:0,badges:{},code:{},tray:{},free:null,tab:'quest'}}
let S=fresh();
try{const raw=localStorage.getItem(KEY);if(raw){const o=JSON.parse(raw);if(o&&typeof o==='object')S=Object.assign(fresh(),o)}}catch(e){}
let saveT=0;function save(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}},200)}
if(S.ch>=CH.length)S.ch=0;

const codeEl=$('#code'),hlEl=$('#hl'),gutEl=$('#gutter'),bandEl=$('#band'),consoleEl=$('#console'),mapEl=$('#map'),missionEl=$('#mission'),chaptersEl=$('#chapters');
const trayBox=$('#trayBox'),trayEl=$('#tray'),stepperEl=$('#stepper'),sRange=$('#sRange'),sInfo=$('#sInfo');
const mkey=()=>S.free?'free':S.ch+'.'+S.mi;
const curMission=()=>S.free?null:(CH[S.ch].missions[S.mi]||null);

/* ---------- syntax highlight ---------- */
const KW=new Set(['and','as','assert','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield']);
const CONST=new Set(['True','False','None']);
const BI=new Set(['print','input','len','int','float','str','bool','list','dict','tuple','range','type','abs','min','max','sum','round','sorted','reversed','enumerate','zip','isinstance','chr','ord','any','all']);
function highlight(src){let h='';const re=/(#[^\n]*)|([rRfFbB]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?))|(\b\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?\b)|([A-Za-z_]\w*)|([^#'"A-Za-z_\d]+|.)/g;let m;
  while((m=re.exec(src))){if(m[1])h+=`<span class="sy-cm">${esc(m[1])}</span>`;else if(m[2])h+=`<span class="sy-str">${esc(m[2])}</span>`;else if(m[3])h+=`<span class="sy-num">${esc(m[3])}</span>`;
    else if(m[4]){const w=m[4],next=src.slice(re.lastIndex).match(/^\s*\(/);h+=KW.has(w)?`<span class="sy-kw">${w}</span>`:CONST.has(w)?`<span class="sy-const">${w}</span>`:(BI.has(w)||next)?`<span class="sy-fn">${w}</span>`:esc(w)}
    else h+=esc(m[5])}return h}

/* ---------- editor ---------- */
let lastRes=null,stepIdx=0,errLine=null;
function lh(){const d=gutEl.firstElementChild;return d?d.getBoundingClientRect().height||22:22}
function renderEditor(){const v=codeEl.value;hlEl.innerHTML=highlight(v)+'\n ';const n=v.split('\n').length;
  let g='';const cur=stepLine();for(let i=1;i<=n;i++)g+=`<div class="${i===cur?'cur':i===errLine?'bad':''}">${i}</div>`;gutEl.innerHTML=g;placeBand()}
function stepLine(){if(!lastRes||stepperEl.hidden)return null;const st=lastRes.steps[stepIdx];return st&&!st.end?st.line:null}
function placeBand(){const cur=stepLine();const line=cur||errLine;if(!line){bandEl.hidden=true;return}bandEl.hidden=false;bandEl.classList.toggle('err',!cur);bandEl.style.top=(12+(line-1)*lh())+'px';
  bandEl.style.height=lh()+'px'}
function scrollToLine(line){const ed=$('#editor');const y=12+(line-1)*lh();if(y<ed.scrollTop+10||y>ed.scrollTop+ed.clientHeight-40)ed.scrollTop=Math.max(0,y-ed.clientHeight/2)}
function setCode(v,keepRes){codeEl.value=v;S.code[mkey()]=v;save();if(!keepRes)clearRun();renderEditor();updateTray()}
function insertText(t){codeEl.focus();if(!document.execCommand||!document.execCommand('insertText',false,t)){const a=codeEl.selectionStart,b=codeEl.selectionEnd;codeEl.setRangeText(t,a,b,'end');codeEl.dispatchEvent(new Event('input'))}}
let tabEscape=false;
codeEl.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run();return}
  if(e.key==='Escape'){tabEscape=true;return}
  if(e.key==='Tab'){if(tabEscape){tabEscape=false;return}e.preventDefault();const v=codeEl.value,a=codeEl.selectionStart,b=codeEl.selectionEnd;
    if(a!==b&&v.slice(a,b).includes('\n')||e.shiftKey){const ls=v.lastIndexOf('\n',a-1)+1;const block=v.slice(ls,b);const nb=e.shiftKey?block.replace(/^ {1,4}/gm,''):block.replace(/^/gm,'    ');
      codeEl.setSelectionRange(ls,b);insertText(nb);codeEl.setSelectionRange(ls,ls+nb.length);return}
    insertText('    ');return}
  tabEscape=false;
  if(e.key==='Enter'&&!e.shiftKey){const v=codeEl.value,a=codeEl.selectionStart;const ls=v.lastIndexOf('\n',a-1)+1;const line=v.slice(ls,a);let ind=(line.match(/^ */)||[''])[0];
    if(/:\s*(#.*)?$/.test(line))ind+='    ';else if(/^\s*(return|break|continue|pass)\b/.test(line))ind=ind.slice(4);e.preventDefault();insertText('\n'+ind);return}
  if(e.key==='Backspace'&&codeEl.selectionStart===codeEl.selectionEnd){const v=codeEl.value,a=codeEl.selectionStart;const ls=v.lastIndexOf('\n',a-1)+1;const before=v.slice(ls,a);
    if(before.length>=4&&/^ +$/.test(before)){e.preventDefault();const k=before.length%4||4;codeEl.setSelectionRange(a-k,a);insertText('')}}
});
codeEl.addEventListener('input',()=>{S.code[mkey()]=codeEl.value;save();if(lastRes)clearRun(true);renderEditor();updateTray()});
$('#keys').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;if(k==='TAB')insertText('    ');else insertText(k)});
trayEl.addEventListener('input',()=>{S.tray[mkey()]=trayEl.value;save()});
function updateTray(){const m=curMission();const need=/input\s*\(/.test(codeEl.value)||(m&&m.inputs);trayBox.hidden=!need;
  if(need&&document.activeElement!==trayEl){const k=mkey();trayEl.value=S.tray[k]!==undefined?S.tray[k]:(m&&m.inputs?m.inputs.join('\n'):'')}}
let armReset=0;$('#resetCode').addEventListener('click',e=>{const b=e.currentTarget;if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to reset';clearTimeout(armReset);armReset=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset code'},3000);return}
  b.classList.remove('armed');b.textContent='Reset code';const m=curMission();setCode(S.free?S.free.code:m?m.starter:'');delete S.tray[mkey()];updateTray();codeEl.focus()});

/* ---------- run ---------- */
function inputsNow(){return trayBox.hidden?[]:trayEl.value.split('\n').map(s=>s.replace(/\r/g,'')).filter((s,i,a)=>!(i===a.length-1&&s===''))}
let lastCheck=null;
function run(){stopPlay();const src=codeEl.value,inputs=inputsNow();let res;
  try{res=PY.run(src,{inputs})}catch(e){res={out:'',inEcho:[],steps:[],error:{type:'InternalError',msg:'the playground hit a problem running this code: '+e.message,line:1},ok:false}}
  lastRes=res;errLine=res.error?res.error.line:null;lastCheck=null;const m=curMission();
  if(m){let r;try{r=m.check(makeCtx(src,res,inputs))}catch(e){r='Something in your code made the check fail. Make sure the variables named in the goal exist.'}
    if(!res.error&&r===true){lastCheck={win:true,first:!S.done[mkey()]};if(!S.done[mkey()]){S.done[mkey()]=true;S.xp+=10;
        const ch=CH[S.ch];if(!S.badges[S.ch]&&ch.missions.every((_,i)=>S.done[S.ch+'.'+i])){S.badges[S.ch]=true;S.xp+=25;lastCheck.badge=true}}
      pop=true;save()}
    else lastCheck={win:false,tip:typeof r==='string'?r:null}}
  stepperEl.hidden=!res.steps||res.steps.length<2;sRange.max=Math.max(0,(res.steps||[]).length-1);stepIdx=+sRange.max;sRange.value=stepIdx;
  renderStep();renderEditor();if(errLine)scrollToLine(errLine);if(lastCheck&&lastCheck.win){renderChapters();renderMission();renderXP()}}
function clearRun(keepConsole){lastRes=null;errLine=null;stepperEl.hidden=true;stopPlay();if(!keepConsole){renderConsole();renderMap(null)}else{renderMap(null,true)}placeBand()}
$('#run').addEventListener('click',run);

/* ---------- console ---------- */
function outHTML(out,inEcho,upto){let h='',pos=0;const lim=upto===undefined?out.length:upto;
  for(const [a,b] of inEcho){if(a>=lim)break;h+=esc(out.slice(pos,Math.min(a,lim)));h+=`<span class="in">${esc(out.slice(a,Math.min(b,lim)).replace(/\n$/,''))}</span>`+(b<=lim&&out[b-1]==='\n'?'\n':'');pos=Math.min(b,lim)}
  return h+esc(out.slice(pos,lim))}
function renderConsole(){const r=lastRes;let h='<div class="ttl">Console</div>';
  if(!r){h+=`<pre class="sys">${S.free?'Free play. Write anything and press Run.':'Press Run to see what your code prints.'}</pre>`;consoleEl.innerHTML=h;return}
  const st=r.steps&&r.steps[stepIdx],final=!st||st.end||stepperEl.hidden;
  const body=outHTML(r.out,r.inEcho||[],final?undefined:st.out);
  h+=`<pre>${body||(final&&!r.error?'<span class="sys">(nothing was printed)</span>':'')}${final?'':'<span class="caret"></span>'}</pre>`;
  if(final&&r.error){const E=ERRS[r.error.type]||['Something went wrong while running.','Read the message above and check the marked line.'];const lineTxt=(codeEl.value.split('\n')[r.error.line-1]||'').trim();
    const nice={TooManySteps:'Stopped: too many steps',EOFError:'input() ran out of answers'}[r.error.type]||`${r.error.type} on line ${r.error.line}`;
    h+=`<div class="msg err"><span class="h">${esc(nice)}</span>${lineTxt?`<span class="py">line ${r.error.line}: ${esc(lineTxt)}</span>`:''}<span class="py">${esc(r.error.type)}: ${esc(r.error.msg)}</span><p><b>What it means:</b> ${esc(E[0])}</p><p><b>How to fix it:</b> ${esc(E[1])}</p></div>`}
  if(final&&lastCheck){if(lastCheck.win){const last=S.mi>=CH[S.ch].missions.length-1;
      h+=`<div class="msg win"><span class="h">${lastCheck.first?'Mission complete! +10 XP':'Mission complete'}${lastCheck.badge?' · Badge earned: '+esc(CH[S.ch].badge)+' +25 XP':''}</span><p>${winLine()}</p><button class="btn" data-act="next">${last?'Finish the chapter':'Next mission'} →</button></div>`}
    else if(lastCheck.tip)h+=`<div class="msg tip"><span class="h">${r.error?'Mission tip':'Not quite yet'}</span><p>${esc(lastCheck.tip)}</p></div>`}
  consoleEl.innerHTML=h;if(final)consoleEl.scrollTop=consoleEl.scrollHeight}
const WINS=['Nice work. Drag the step slider to replay exactly how it ran.','That runs perfectly. Try changing a value and running it again to see what changes.','Clean. Look at the memory map to see what your code left behind.','Solid. Every program you will ever write is made of pieces like this one.'];
function winLine(){return WINS[(S.ch*7+S.mi)%WINS.length]}
consoleEl.addEventListener('click',e=>{const b=e.target.closest('[data-act="next"]');if(b)gotoMission(S.ch,S.mi+1)});

/* ---------- stepper ---------- */
function renderStep(){const r=lastRes;if(!r)return;const st=r.steps[stepIdx];
  if(!stepperEl.hidden&&st){const n=r.steps.length;const lineTxt=st.end?'':(codeEl.value.split('\n')[st.line-1]||'').trim();
    sInfo.innerHTML=st.end?`Step <b>${n}</b> of ${n} · <b>${r.error?'stopped by an error':'finished'}</b>${r.truncated?` · replay shows the first ${n-1} steps`:''}`:`Step <b>${stepIdx+1}</b> of ${n} · about to run line <b>${st.line}</b>: <code>${esc(lineTxt.length>48?lineTxt.slice(0,46)+'…':lineTxt)}</code>`}
  renderConsole();renderMap(st,false,stepIdx>0?r.steps[stepIdx-1]:null);renderEditor();if(st&&!st.end)scrollToLine(st.line)}
function setStep(i){if(!lastRes)return;stepIdx=Math.max(0,Math.min(+sRange.max,i));sRange.value=stepIdx;renderStep()}
sRange.addEventListener('input',()=>{stopPlay();setStep(+sRange.value)});
$('#sFirst').onclick=()=>{stopPlay();setStep(0)};$('#sPrev').onclick=()=>{stopPlay();setStep(stepIdx-1)};$('#sNext').onclick=()=>{stopPlay();setStep(stepIdx+1)};$('#sLast').onclick=()=>{stopPlay();setStep(+sRange.max)};
let playT=0;function stopPlay(){clearInterval(playT);playT=0;const p=$('#sPlay');p.setAttribute('aria-pressed','false');p.textContent='▷';p.setAttribute('aria-label','Play')}
$('#sPlay').onclick=()=>{if(playT){stopPlay();return}if(stepIdx>=+sRange.max)setStep(0);const p=$('#sPlay');p.setAttribute('aria-pressed','true');p.textContent='❚❚';p.setAttribute('aria-label','Pause');
  playT=setInterval(()=>{if(stepIdx>=+sRange.max){stopPlay();return}setStep(stepIdx+1)},650)};

/* ---------- memory map ---------- */
function valHTML(v,nested){const cls='t-'+(['int','float','str','bool','NoneType','list','tuple','dict','function'].includes(v.t)?v.t:'other');
  if(v.items){const open=v.t==='tuple'?['(',')']:['[',']'];
    return `<div class="coll ${cls}"><em>${v.t} · ${v.items.length+v.more} item${v.items.length+v.more===1?'':'s'}${v.id&&aliases[v.id]?`<span class="alias" title="Several names point to this same ${v.t}">shared with ${esc(aliases[v.id])}</span>`:''}</em>${v.items.length?`<div class="cells">${v.items.map((x,i)=>`<div class="cell">${valHTML(x,true)}<i>${i}</i></div>`).join('')}${v.more?`<div class="cell"><span class="empty">+${v.more} more</span></div>`:''}</div>`:`<span class="empty">empty ${esc(open.join(''))}</span>`}</div>`}
  if(v.pairs){return `<div class="coll ${cls}"><em>dict · ${v.pairs.length+v.more} key${v.pairs.length+v.more===1?'':'s'}${v.id&&aliases[v.id]?`<span class="alias">shared with ${esc(aliases[v.id])}</span>`:''}</em>${v.pairs.length?v.pairs.map(([k,x])=>`<div class="pair">${valHTML(k,true)}<span class="ar">→</span>${valHTML(x,true)}</div>`).join(''):'<span class="empty">empty {}</span>'}${v.more?`<span class="empty">+${v.more} more</span>`:''}</div>`}
  const label=v.t==='function'?'def':v.t==='NoneType'?'':v.t;
  return `<span class="val ${cls}">${esc(v.t==='function'?v.r:v.r)}${label&&!nested?`<em>${esc(label)}</em>`:''}</span>`}
let aliases={};
function renderMap(st,stale,prev){$('#mapSub').textContent=st?(st.end?'What your program left in memory when it ended.':`Memory just before line ${st.line} runs.`):stale?'Code changed. Run it again to refresh the map.':'Every variable your program makes, drawn as a labelled box.';
  if(!st){mapEl.innerHTML=`<div class="mapEmpty"><p style="margin:0">Run your code and each variable appears here as a labelled box, coloured by its type. Lists show numbered slots. Function calls get their own frame.</p>
    <div class="demo" aria-hidden="true"><div class="var"><span class="vname">hero</span><div class="vbox"><span class="val t-str">'Ada'<em>str</em></span></div></div><div class="var"><span class="vname">hp</span><div class="vbox"><span class="val t-int">100<em>int</em></span></div></div><div class="var"><span class="vname">bag</span><div class="vbox"><div class="coll t-list"><em>list · 2 items</em><div class="cells"><div class="cell"><span class="val t-str">'sword'</span><i>0</i></div><div class="cell"><span class="val t-str">'map'</span><i>1</i></div></div></div></div></div></div></div>`;return}
  const names={};st.frames.forEach(f=>f.vars.forEach(([n,v])=>{if(v.id){(names[v.id]=names[v.id]||[]).push(n)}}));aliases={};
  const prevMap={};if(prev)prev.frames.forEach(f=>f.vars.forEach(([n,v])=>prevMap[f.name+'|'+n]=JSON.stringify(v)));
  mapEl.innerHTML=st.frames.map((f,fi)=>{const vars=f.vars;return `<div class="frame${fi?' fn':''}"><div class="fh"><span>${fi?'Inside '+esc(f.name):'Global'}</span><span>${vars.length} variable${vars.length===1?'':'s'}</span></div>${vars.length?vars.map(([n,v])=>{
      aliases={};if(v.id&&names[v.id]&&names[v.id].length>1)aliases[v.id]=names[v.id].filter(x=>x!==n).join(', ');
      const changed=prev&&prevMap[f.name+'|'+n]!==JSON.stringify(v);return `<div class="var${changed?' flash':''}"><span class="vname">${esc(n)}</span><div class="vbox">${valHTML(v)}</div></div>`}).join(''):`<span class="empty">${fi?'no local variables':'nothing stored yet'}</span>`}</div>`}).join('')}

/* ---------- mission panel ---------- */
let pop=false;
function anatomy(t){if(!t)return '';const L={fn:'function',str:'text',num:'number',var:'variable',kw:'keyword',op:'operator',br:'brackets',cm:'comment'};
  return `<div class="anat" aria-label="Parts of the code">${t.map(([s,k,l])=>`<div class="tok k-${k}"><b>${esc(s)}</b><span>${esc(l||L[k]||k)}</span></div>`).join('')}</div>`}
const totalDone=ci=>CH[ci].missions.filter((_,i)=>S.done[ci+'.'+i]).length;
function renderChapters(){chaptersEl.innerHTML=CH.map((c,i)=>`<button class="chap${S.badges[i]?' earned':''}" data-ch="${i}" aria-current="${i===S.ch&&!S.free}"><span class="num">${S.badges[i]?'★':i+1}</span><span class="nm">${esc(c.name)}</span><span class="ct">${totalDone(i)}/${c.missions.length}</span></button>`).join('')}
function renderMission(){
  if(S.free){missionEl.innerHTML=`<span class="freeTag">Free play</span><h2>Your sandbox</h2><p class="explain">Experiment with anything here. Nothing is checked and nothing can break. The memory map and the step slider still work.</p>
    <p class="note">Tip: change one thing at a time and run it again. Predict what will happen before you press Run.</p><div class="actions"><button class="btn" data-act="back">Back to Chapter ${S.ch+1}, mission ${Math.min(S.mi+1,CH[S.ch].missions.length)}</button></div>`;return}
  const ch=CH[S.ch],n=ch.missions.length;
  const dots=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((m,i)=>`<button class="dot${S.done[S.ch+'.'+i]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(m.title)}" aria-label="Mission ${i+1}: ${esc(m.title)}">${i+1}</button>`).join('')}</div>`;
  let h;
  if(S.mi>=n){const all=totalDone(S.ch)===n,last=S.ch===CH.length-1;
    h=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art${all?'':' dim'}">${all?'★':S.ch+1}</div>
    <h2>${last?'You finished Python Quest':all?'Badge earned: '+esc(ch.badge):'Chapter finished'}</h2>
    <p class="explain">${last?'You can store values, make decisions, loop over lists, write functions, organise data in dictionaries and build small games. That is the core of Python.':'You can now use these in any Python program:'}</p>
    <div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
    ${last?`<p class="note">Next: play Quick-fire until reading code feels easy, then install Python on your computer. The field guide shows how.</p><div class="actions"><button class="btn" data-act="tab-fire">Play Quick-fire</button><button class="btn ghost" data-act="tab-guide">Open the field guide</button></div>`
      :`<div class="actions"><button class="btn" data-act="nextch">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button><button class="btn ghost" data-act="free">Free play</button></div>`}${dots}`}
  else{const m=ch.missions[S.mi];
    h=`<div class="eyebrow">Chapter ${S.ch+1} · Mission ${S.mi+1} of ${n}${S.done[S.ch+'.'+S.mi]?' · done ✓':''}</div>
    ${S.mi===0?`<p class="intro">${esc(ch.intro)}</p>`:''}
    <h2>${esc(m.title)}</h2>
    <div class="goal"><div class="label">Your goal</div><p>${m.goal}</p></div>
    ${anatomy(m.anat)}
    <p class="explain">${m.explain}</p>
    ${m.note?`<p class="note">${m.note}</p>`:''}
    <div class="actions"><button class="btn ghost" data-act="hint" aria-expanded="false">Show a hint</button><button class="btn ghost" data-act="fill">Type it for me</button></div>
    <div class="hint" id="hintBox" hidden><span>One way to write it:</span><pre>${highlight(m.answer)}</pre></div>${dots}`}
  missionEl.innerHTML=h;if(pop){missionEl.classList.remove('pop');void missionEl.offsetWidth;missionEl.classList.add('pop');pop=false}}
missionEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mi!==undefined){gotoMission(S.ch,+b.dataset.mi);return}const a=b.dataset.act;
  if(a==='hint'){const hb=$('#hintBox');hb.hidden=!hb.hidden;b.setAttribute('aria-expanded',String(!hb.hidden));b.textContent=hb.hidden?'Show a hint':'Hide the hint'}
  else if(a==='fill'){const m=curMission();if(m){setCode(m.answer);codeEl.focus()}}
  else if(a==='nextch')gotoMission(S.ch+1,0);else if(a==='back'){S.free=null;loadMission()}
  else if(a==='free'){goFree('# Free play: try anything!\n')}else if(a&&a.startsWith('tab-'))showTab(a.slice(4))});
chaptersEl.addEventListener('click',e=>{const b=e.target.closest('.chap');if(!b)return;const ci=+b.dataset.ch;const ch=CH[ci];let mi=ch.missions.findIndex((_,i)=>!S.done[ci+'.'+i]);if(mi<0)mi=0;gotoMission(ci,mi)});
function gotoMission(ci,mi){S.free=null;S.ch=ci;S.mi=mi;save();loadMission();if(innerWidth<820)missionEl.scrollIntoView({behavior:'smooth',block:'start'})}
function loadMission(){const m=curMission();const k=mkey();codeEl.value=S.free?S.free.code:S.code[k]!==undefined?S.code[k]:m?m.starter:'';
  $('#fileName').textContent=S.free?'sandbox.py':m?`mission_${S.ch+1}_${S.mi+1}.py`:'quest.py';$('#edNote').textContent=S.free?'Free play':m?'Write your code here':'Chapter complete';
  clearRun();renderChapters();renderMission();renderEditor();updateTray()}
function goFree(code){S.free={code};S.code.free=code;save();showTab('quest');loadMission();codeEl.focus()}

/* ---------- XP ---------- */
const RANKS=[[0,'Hatchling'],[120,'Coder'],[280,'Builder'],[460,'Pythonista'],[640,'Python Wizard']];
function renderXP(){let i=0;while(i+1<RANKS.length&&S.xp>=RANKS[i+1][0])i++;const lo=RANKS[i][0],hi=i+1<RANKS.length?RANKS[i+1][0]:lo;
  $('#rank').textContent=RANKS[i][1];$('#xpText').textContent=S.xp+' XP';$('#xpFill').style.width=(hi>lo?Math.min(100,(S.xp-lo)/(hi-lo)*100):100)+'%'}

/* ---------- tabs ---------- */
function showTab(t){S.tab=t;save();document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  ['quest','fire','guide'].forEach(x=>$('#tab-'+x).hidden=x!==t);if(t!=='fire')stopFire(true);if(t==='guide'&&!$('#guide').innerHTML)renderGuide();if(t==='fire'&&!fireOn)fireIdle()}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)showTab(b.dataset.tab)});
document.querySelector('.tabs').addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const bs=[...document.querySelectorAll('.tabs button')];let i=bs.findIndex(b=>b.getAttribute('aria-selected')==='true');i=(i+(e.key==='ArrowRight'?1:bs.length-1))%bs.length;showTab(bs[i].dataset.tab);bs[i].focus()});

/* ---------- quick-fire ---------- */
const fStage=$('#fStage');let fireOn=false,fT=0,fLeft=75,fScore=0,fStreak=0,fQ=null,fDeck=[],fMiss=[],fLocked=false;
function setStats(){$('#fScore').textContent=fScore;$('#fStreak').textContent=fStreak;$('#fBest').textContent=S.best;$('#fTime').textContent=fLeft;$('#fTimer').style.width=(fLeft/75*100)+'%'}
function fireIdle(){const ex=QF[6];fStage.innerHTML=`<div class="example panel" style="padding:12px 14px;border-style:dashed;display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Example round</span><pre class="snippet">${highlight(ex.c)}</pre><p class="note" style="margin:0">Pick the output: <code>5</code>, <code>7</code> or <code>x + 2</code>? The answer is <code>7</code>. ${esc(ex.why)}</p></div>
  <div class="actions"><button class="btn" id="fStart">Start the clock</button><span class="note" style="align-self:center">Keys <kbd>1</kbd>–<kbd>4</kbd> pick an answer.</span></div>`;setStats()}
function answerOf(q){if(q.ans===undefined){const r=PY.run(q.c,{trace:false});q.ans=r.out.replace(/\n$/,'')}return q.ans}
function nextQ(){if(!fDeck.length)fDeck=QF.map((_,i)=>i).sort(()=>Math.random()-.5);fQ=QF[fDeck.pop()];const ans=answerOf(fQ);
  const opts=[ans,...fQ.w.filter(w=>w!==ans).slice(0,3)].sort(()=>Math.random()-.5);fQ.opts=opts;fLocked=false;
  fStage.innerHTML=`<div class="task">What does this print?</div><pre class="snippet">${highlight(fQ.c)}</pre><div class="opts">${opts.map((o,i)=>`<button class="opt" data-i="${i}"><span class="n">${i+1}</span><pre>${esc(o)}</pre></button>`).join('')}</div>
  <p class="fb" id="fFb" aria-live="polite"></p><div class="actions"><button class="btn ghost" id="fStop">End round</button></div>`;fStage.querySelector('.opt').focus({preventScroll:true})}
function pick(i){if(!fireOn||fLocked||!fQ)return;fLocked=true;const ans=fQ.ans,ok=fQ.opts[i]===ans;const bs=[...fStage.querySelectorAll('.opt')];
  bs.forEach((b,j)=>{b.disabled=true;if(fQ.opts[j]===ans)b.classList.add('right');else if(j===i)b.classList.add('wrong')});const fb=$('#fFb');
  if(ok){fStreak++;const pts=10+Math.min(fStreak-1,5)*2;fScore+=pts;fb.className='fb good';fb.textContent=`Correct! +${pts}${fStreak>1?` (streak ${fStreak})`:''}`}
  else{fStreak=0;fMiss.push(fQ);fb.className='fb bad';fb.textContent='Not this time. '+fQ.why}
  setStats();setTimeout(()=>{if(fireOn)nextQ()},ok?650:2200)}
function startFire(){fireOn=true;fLeft=75;fScore=0;fStreak=0;fMiss=[];setStats();nextQ();clearInterval(fT);fT=setInterval(()=>{fLeft--;setStats();if(fLeft<=0)stopFire()},1000)}
function stopFire(silent){if(!fireOn)return;fireOn=false;clearInterval(fT);if(silent){fireIdle();return}if(fScore>S.best){S.best=fScore;save()}setStats();
  fStage.innerHTML=`<div class="task">Round over: ${fScore} points</div><p class="note" style="margin:0">${fScore>=S.best&&fScore>0?'That is your best score so far.':`Your best is ${S.best}.`}</p>
  ${fMiss.length?`<div><p class="explain" style="margin:0 0 8px"><b>Review these:</b></p><ul class="misses">${fMiss.map((q,i)=>`<li><pre class="snippet">${highlight(q.c)}</pre><div class="row"><span>Prints <code>${esc(q.ans)}</code></span><span class="note">${esc(q.why)}</span><button class="try" data-miss="${i}">Try it</button></div></li>`).join('')}</ul></div>`:'<p class="explain" style="margin:0">No misses. Excellent reading.</p>'}
  <div class="actions"><button class="btn" id="fStart">Play again</button></div>`}
fStage.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='fStart')startFire();else if(b.id==='fStop')stopFire();else if(b.dataset.i!==undefined)pick(+b.dataset.i);else if(b.dataset.miss!==undefined)goFree(fMiss[+b.dataset.miss].c)});
document.addEventListener('keydown',e=>{if(!fireOn||$('#tab-fire').hidden)return;if(/^[1-4]$/.test(e.key)){e.preventDefault();pick(+e.key-1)}});

/* ---------- field guide ---------- */
function exHTML(g){return `<div class="ex">${g.ex.map(([c,n])=>`<div class="exrow"><pre class="snippet">${highlight(c)}</pre><div class="meta">${n?`<small># ${esc(n)}</small>`:''}<button class="try" data-code="${esc(c)}">Try it</button></div></div>`).join('')}</div>`}
function renderGuide(){const groups=CH.map(c=>c.name);
  const TY=[['int','Whole numbers','42, -7, 0'],['float','Decimal numbers','3.14, 2.0'],['str','Text, in quotes','"Ada", \'hi\''],['bool','Yes or no','True, False'],['list','Ordered items','["a", "b"]'],['dict','Key → value pairs','{"hp": 10}'],['function','Reusable code','def heal(hp):'],['NoneType','Nothing / no value','None']];
  $('#guide').innerHTML=`<div><h2>Field guide</h2><p class="lede">Everything from the quest on one page. Every example has a Try it button that opens it in the editor, where you can run it and step through it.</p></div>
  <section class="gsec"><h3>How to read a line of Python</h3><div class="panel bigan">${anatomy([['total','var'],['=','op'],['price','var'],['*','op'],['int','fn'],['(','br'],['input','fn'],['("How many? ")','str'],[')','br']])}
    <p class="explain" style="margin:0">Read it from the inside out. <code>input()</code> asks the question and gives back text. <code>int()</code> turns that text into a number. <code>price * …</code> multiplies. Finally <code>=</code> stores the result in the box called <code>total</code>.</p></div></section>
  <section class="gsec"><h3>Types at a glance</h3><div class="types">${TY.map(([t,d,e])=>`<article class="card panel t-${t}"><h4>${t}</h4><p>${esc(d)}</p><code>${esc(e)}</code></article>`).join('')}</div></section>
  <section class="gsec"><h3>Reading an error</h3><div class="errdemo"><div class="console"><div class="ttl">Console</div><div class="msg err" style="margin-top:4px"><span class="h">TypeError on line 3</span><span class="py">line 3: print("Gold: " + gold)</span><span class="py">TypeError: can only concatenate str (not "int") to str</span></div></div>
    <ol><li><b>Find the line number.</b> The editor marks it in red.</li><li><b>Read the error type.</b> TypeError means a value was the wrong kind for the job.</li><li><b>Read the message.</b> Here, text and a number were joined with +.</li><li><b>Fix and run again.</b> Use <code>str(gold)</code> or an f-string: <code>f"Gold: {gold}"</code>.</li></ol></div></section>
  <section class="gsec"><h3>Indentation rules</h3><ol class="panel rules"><li>A line ending in a colon (<code>if</code>, <code>elif</code>, <code>else</code>, <code>for</code>, <code>while</code>, <code>def</code>, <code>try</code>) starts a block.</li><li>Every line in the block is indented 4 spaces more than the line with the colon.</li><li>The block ends at the first line that goes back out to the earlier level.</li><li>Lines at the same level must line up exactly. Mixing 2 and 4 spaces causes an IndentationError.</li></ol></section>
  ${groups.map((gname,gi)=>{const items=GUIDE.filter(g=>g.ch===gi);return items.length?`<section class="gsec"><h3>Chapter ${gi+1}: ${esc(gname)}</h3><div class="cards">${items.map(g=>`<article class="card panel"><h4>${esc(g.c)}</h4><p>${esc(g.what)}</p>${anatomy(g.syn)}${exHTML(g)}</article>`).join('')}</div></section>`:''}).join('')}
  <section class="gsec"><h3>Run Python on your computer</h3><div class="os">
    <article class="card panel"><h4>Windows</h4><p>Download Python 3 from python.org and run the installer. Tick <b>Add python.exe to PATH</b> on the first screen. Then open <b>IDLE</b> from the Start menu, choose File → New File, paste your code and press F5.</p></article>
    <article class="card panel"><h4>Mac</h4><p>Download Python 3 from python.org and install it. Open <b>IDLE</b> from Applications → Python 3, or type <code>python3</code> in Terminal. Save files as <code>game.py</code> and run them with <code>python3 game.py</code>.</p></article>
    <article class="card panel"><h4>Linux</h4><p>Python 3 is usually installed already. In a terminal, type <code>python3</code> to try code line by line, or <code>python3 game.py</code> to run a file. Your Shell Quest skills apply here.</p></article>
    <article class="card panel"><h4>An editor to grow into</h4><p><b>Thonny</b> is built for beginners and has a debugger that works a lot like the step slider here. <b>VS Code</b> with the Python extension is what many professionals use.</p></article>
  </div></section>
  <section class="gsec"><h3>After this course</h3><div class="panel" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px"><p class="explain">Good next topics, roughly in order: list comprehensions (<code>[x * 2 for x in nums]</code>), tuples and sets, reading and writing files, classes and objects, then modules you install with <code>pip</code>. For games, try the <b>pygame</b> library or the built-in <b>turtle</b> module for drawing. Python Tutor (pythontutor.com) shows memory diagrams like this one for any code.</p>
   <div class="actions"><button class="linkbtn" id="resetProgress">Reset all progress</button></div></div></section>`}
let armProg=0;$('#guide').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.code!==undefined){goFree(b.dataset.code);run();return}
  if(b.id==='resetProgress'){if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to erase XP, badges and saved code';clearTimeout(armProg);armProg=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset all progress'},4000);return}
    S=fresh();save();renderXP();showTab('quest');loadMission()}});

/* ---------- boot ---------- */
window.addEventListener('resize',()=>placeBand());
renderXP();loadMission();showTab(S.tab==='guide'||S.tab==='fire'?S.tab:'quest');
})();
