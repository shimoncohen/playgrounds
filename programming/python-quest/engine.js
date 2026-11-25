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
