/* Checker types are plain objects {k:'int'|'bool'|'char'|'str'|'unit'|'never'|'any', ty?}; an int with ty null is a
   literal whose type is still open. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const range=(bits,signed)=>signed?[-(1n<<BigInt(bits-1)),(1n<<BigInt(bits-1))-1n]:[0n,(1n<<BigInt(bits))-1n];
const INT={i8:range(8,1),i16:range(16,1),i32:range(32,1),i64:range(64,1),isize:range(64,1),u8:range(8,0),u16:range(16,0),u32:range(32,0),u64:range(64,0),usize:range(64,0)};
const isInt=n=>Object.prototype.hasOwnProperty.call(INT,n);
const T={
  int:ty=>({k:'int',ty:ty||null}),bool:{k:'bool'},char:{k:'char'},str:{k:'str'},unit:{k:'unit'},never:{k:'never'},any:{k:'any'}
};
// null when they clash; any and never agree with everything, an open int takes the other's type
function unify(a,b){
  if(a.k==='any'||a.k==='never')return b;
  if(b.k==='any'||b.k==='never')return a;
  if(a.k!==b.k)return null;
  if(a.k==='int'){
    if(a.ty&&b.ty&&a.ty!==b.ty)return null;
    return T.int(a.ty||b.ty);
  }
  return a;
}
RQ.types={INT,isInt,T,unify,DEFAULT_INT:'i32',fits:(v,ty)=>{const r=INT[ty||'i32'];return v>=r[0]&&v<=r[1];},isSigned:ty=>ty==null||ty[0]==='i'};
})();
