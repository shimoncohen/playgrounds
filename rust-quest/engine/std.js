(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const MAX_PAD=1000;
class Unmodeled extends Error{}
class Over extends Error{}
const SPECS=[[/^$/,()=>({debug:false,prec:null,width:null})],[/^\?$/,()=>({debug:true,prec:null,width:null})],
  [/^\.(\d{1,3})$/,m=>({debug:false,prec:+m[1],width:null})],[/^>(\d{1,3})$/,m=>({debug:false,prec:null,width:+m[1]})]];
const fmtOf=s=>{for(const [re,mk] of SPECS){const m=re.exec(s);if(m)return mk(m);}return null;};
// `spec` is set for a `:` spec outside {:?} {:.N} {:>N}, which is not modeled
function parseFormat(s){
  const parts=[];let lit='',next=0,spec=false;
  const flush=()=>{if(lit){parts.push({lit});lit='';}};
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(c==='{'){
      if(s[i+1]==='{'){lit+='{';i++;continue;}
      const end=s.indexOf('}',i);
      if(end<0)return {parts,spec,error:'invalid format string: expected `}` but string was terminated'};
      const inner=s.slice(i+1,end),colon=inner.indexOf(':');
      const arg=(colon<0?inner:inner.slice(0,colon)).trim();
      const fmt=colon<0?fmtOf(''):fmtOf(inner.slice(colon+1));
      flush();
      if(!fmt)spec=true;
      const f=fmt||fmtOf('');
      if(arg==='')parts.push({idx:next++,fmt:f});
      else if(/^\d+$/.test(arg))parts.push({idx:+arg,fmt:f});
      else if(/^[\p{L}_][\p{L}\p{N}_]*$/u.test(arg))parts.push({name:arg,fmt:f});
      else return {parts,spec,error:'invalid format string: invalid argument name `'+arg+'`'};
      i=end;
    }else if(c==='}'){
      if(s[i+1]==='}'){lit+='}';i++;continue;}
      return {parts,spec,error:'invalid format string: unmatched `}` found'};
    }else lit+=c;
  }
  flush();
  return {parts,spec,error:null};
}

function exact(x){
  const dv=new DataView(new ArrayBuffer(8));dv.setFloat64(0,x);
  const hi=dv.getUint32(0),lo=dv.getUint32(4),e=(hi>>>20)&0x7ff;
  let m=(BigInt(hi&0xfffff)<<32n)|BigInt(lo),exp=-1074;
  if(e){m|=1n<<52n;exp=e-1075;}
  return exp>=0?{d:m<<BigInt(exp),k:0}:{d:m*5n**BigInt(-exp),k:-exp};
}
const roundDiv=(d,s)=>{const q=d/s,r=d%s,h=s/2n;return r>h||(r===h&&(q&1n))?q+1n:q;};
function shortest(ax){
  const {d,k}=exact(ax),n=d.toString().length;
  for(let p=1;p<=17;p++){
    const q=n>p?roundDiv(d,10n**BigInt(n-p)):d,scale=n>p?n-p-k:-k;
    if(Number(q+'e'+scale)!==ax)continue;
    const qs=q.toString(),ds=qs.replace(/0+$/,'');
    return {ds,E:scale+(qs.length-ds.length)+ds.length};
  }
}
function fixed(ax,prec){
  const {d,k}=exact(ax);
  const q=k<=prec?d*10n**BigInt(prec-k):roundDiv(d,10n**BigInt(k-prec));
  const s=q.toString().padStart(prec+1,'0');
  return prec?s.slice(0,s.length-prec)+'.'+s.slice(s.length-prec):s;
}
// spec is '', '?' or '.N'; ties round to even on the exact binary value
function f64(x,spec){
  if(Number.isNaN(x))return 'NaN';
  const neg=x<0||Object.is(x,-0),sign=neg?'-':'',ax=Math.abs(x);
  if(ax===Infinity)return sign+'inf';
  if(spec&&spec[0]==='.')return sign+fixed(ax,+spec.slice(1));
  if(ax===0)return sign+(spec==='?'?'0.0':'0');
  const {ds,E}=shortest(ax);
  if(spec==='?'&&(ax>=1e16||ax<1e-4))return sign+ds[0]+(ds.length>1?'.'+ds.slice(1):'')+'e'+(E-1);
  const s=E<=0?'0.'+'0'.repeat(-E)+ds:E>=ds.length?ds+'0'.repeat(E-ds.length):ds.slice(0,E)+'.'+ds.slice(E);
  return sign+(spec==='?'&&!s.includes('.')?s+'.0':s);
}

const ESC={'\n':'\\n','\r':'\\r','\t':'\\t','\\':'\\\\'};
// the escapes Rust prints are modeled for plain ASCII text only; anything else is left to the real compiler
function quoted(s,q,room){
  let o=q;
  for(const c of s){
    if(c===q)o+='\\'+q;
    else if(ESC[c])o+=ESC[c];
    else if(c>=' '&&c<='~')o+=c;
    else throw new Unmodeled('debug text');
    if(o.length>room)throw new Over();
  }
  return o+q;
}
const unref=v=>{while(v.k==='ref')v=v.cell.val;return v;};
function display(v){
  v=unref(v);
  switch(v.k){
    case 'int':return v.v.toString();
    case 'float':return f64(v.v,'');
    case 'bool':return v.v?'true':'false';
    case 'char':case 'str':case 'String':return v.v;
    default:throw new Error('display of '+v.k);
  }
}
// tick is called once per value printed, so a big array counts against the step budget
// room is how many chars the text may still have; past it Over is thrown, so a nested value never builds far beyond the output cap
function debug(v,tick,room=Infinity){
  if(tick)tick();
  let used=0;
  const sub=x=>{const s=debug(x,tick,room-used);used+=s.length+2;if(used>room)throw new Over();return s;};
  v=unref(v);
  switch(v.k){
    case 'float':return f64(v.v,'?');
    case 'char':return quoted(v.v,"'",room);
    case 'str':case 'String':return quoted(v.v,'"',room);
    case 'unit':return '()';
    case 'tuple':return '('+v.v.map(sub).join(', ')+(v.v.length===1?',':'')+')';
    case 'array':return '['+v.v.map(sub).join(', ')+']';
    default:return display(v);
  }
}
// width counts characters, as Rust does
function render(v,fmt,tick,room){
  const s=fmt.debug?debug(v,tick,room):fmt.prec!==null?f64(unref(v).v,'.'+fmt.prec):display(v);
  if(fmt.width===null)return s;
  return ' '.repeat(Math.max(0,Math.min(fmt.width,MAX_PAD)-Array.from(s).length))+s;
}
// The methods the checker knows. The name is user text, so this is a Map (a plain object would answer `constructor`).
// recv: which receivers take it, as letters: o owned String, r &String, m &mut String, s &str. self: how an owned receiver is borrowed.
const {T}=RQ.types;
const methods=new Map([
  ['len',{recv:'orms',self:'&',args:[],ret:T.int('usize')}],
  ['clone',{recv:'orm',self:'&',args:[],ret:T.string}],
  ['as_str',{recv:'orm',self:'&',args:[],ret:T.str}], // on m it is a reborrow, which the checker reports
  ['push_str',{recv:'orm',self:'&mut',args:[T.str],ret:T.unit}]
]);
RQ.std={parseFormat,display,debug,render,f64,Unmodeled,Over,methods,unref};
})();
