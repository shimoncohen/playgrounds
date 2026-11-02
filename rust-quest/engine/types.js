/* Checker types are plain objects: {k:'int',ty}, 'float' (f64), 'bool', 'char', 'str', 'unit', 'never', 'any', tuple {els},
   array {el,n}, and the inference variables ivar and fvar, which stand for an int or float literal whose type is still open
   and get bound by unify. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const range=(bits,signed)=>signed?[-(1n<<BigInt(bits-1)),(1n<<BigInt(bits-1))-1n]:[0n,(1n<<BigInt(bits))-1n];
const INT={i8:range(8,1),i16:range(16,1),i32:range(32,1),i64:range(64,1),isize:range(64,1),u8:range(8,0),u16:range(16,0),u32:range(32,0),u64:range(64,0),usize:range(64,0)};
const isInt=n=>Object.prototype.hasOwnProperty.call(INT,n);
const bitsOf=ty=>ty.endsWith('size')?64:+ty.slice(1);
const T={
  int:ty=>({k:'int',ty}),float:{k:'float'},bool:{k:'bool'},char:{k:'char'},str:{k:'str'},unit:{k:'unit'},never:{k:'never'},any:{k:'any'},
  ivar:()=>({k:'ivar',ref:null}),fvar:()=>({k:'fvar',ref:null}),tuple:els=>({k:'tuple',els}),array:(el,n)=>({k:'array',el,n})
};
const res=t=>{while(t.ref)t=t.ref;return t;};
// any and never agree with everything; a variable binds to a concrete type of its own family
function unify(a,b){
  a=res(a);b=res(b);
  if(a===b||a.k==='any'||b.k==='any'||a.k==='never'||b.k==='never')return true;
  if(a.k==='ivar'||a.k==='fvar'){
    if(b.k===a.k||b.k===(a.k==='ivar'?'int':'float')){a.ref=b;return true;}
    return false;
  }
  if(b.k==='ivar'||b.k==='fvar')return unify(b,a);
  if(a.k!==b.k)return false;
  if(a.k==='int')return a.ty===b.ty;
  if(a.k==='tuple')return a.els.length===b.els.length&&a.els.every((x,i)=>unify(x,b.els[i]));
  if(a.k==='array')return a.n===b.n&&unify(a.el,b.el);
  return true;
}
function show(t){
  t=res(t);
  switch(t.k){
    case 'int':return t.ty;
    case 'ivar':return 'integer';
    case 'fvar':return 'floating-point number';
    case 'float':return 'f64';
    case 'str':return '&str';
    case 'unit':return '()';
    case 'tuple':return '('+t.els.map(show).join(', ')+(t.els.length===1?',':'')+')';
    case 'array':return '['+show(t.el)+'; '+t.n+']';
    default:return t.k;
  }
}
RQ.types={INT,isInt,T,unify,res,show,DEFAULT_INT:'i32',
  fits:(v,ty)=>{const r=INT[ty||'i32'];return v>=r[0]&&v<=r[1];},
  wrap:(v,ty)=>(ty[0]==='i'?BigInt.asIntN:BigInt.asUintN)(bitsOf(ty),v),
  isSigned:ty=>ty[0]==='i'};
})();
