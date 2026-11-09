/* Checker types are plain objects: {k:'int',ty}, 'float' (f64), 'bool', 'char', 'str' (a &str), 'String', 'unit', 'never', 'any',
   tuple {els}, array {el,n}, slice {el} (only ever behind a ref), struct {name,der,lt (it has a lifetime parameter, so it holds a reference)}, enum {name,args,der,builtin} (Option and Result are builtin enums with
   type arguments; der lists the traits a user type derives), coll {name:'Vec'|'HashMap',args} (a Vec owns its elements; no element holds a reference), ref {mut,to,rg} (rg is a number the checker makes new for every reference type it creates), and
   the inference variables ivar, fvar and tvar: an int literal, a float literal or any type that is still open; unify binds them. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const range=(bits,signed)=>signed?[-(1n<<BigInt(bits-1)),(1n<<BigInt(bits-1))-1n]:[0n,(1n<<BigInt(bits))-1n];
const INT={i8:range(8,1),i16:range(16,1),i32:range(32,1),i64:range(64,1),isize:range(64,1),u8:range(8,0),u16:range(16,0),u32:range(32,0),u64:range(64,0),usize:range(64,0)};
const isInt=n=>Object.prototype.hasOwnProperty.call(INT,n);
const bitsOf=ty=>ty.endsWith('size')?64:+ty.slice(1);
const T={
  int:ty=>({k:'int',ty}),float:{k:'float'},bool:{k:'bool'},char:{k:'char'},str:{k:'str'},string:{k:'String'},unit:{k:'unit'},never:{k:'never'},any:{k:'any'},
  ivar:()=>({k:'ivar',ref:null}),fvar:()=>({k:'fvar',ref:null}),tuple:els=>({k:'tuple',els}),array:(el,n)=>({k:'array',el,n}),slice:el=>({k:'slice',el}),
  ref:(mut,to,rg)=>({k:'ref',mut,to,rg}),struct:(name,der,lt)=>({k:'struct',name,der:der||[],lt:!!lt}),
  enum:(name,args,der,builtin)=>({k:'enum',name,args:args||[],der:der||[],builtin:!!builtin}),tvar:()=>({k:'tvar',ref:null}),coll:(name,args)=>({k:'coll',name,args}),param:(name,bounds)=>({k:'param',name,bounds}),fmtr:{k:'fmtr'}
};
const res=t=>{while(t.ref)t=t.ref;return t;};
// Copy: scalars, &str, &T, tuples and arrays of Copy, and a user type that derives Copy. String and &mut T move. any stands for an error already reported
function isCopy(t){
  t=res(t);
  switch(t.k){
    case 'String':case 'coll':case 'fmtr':return false;
    case 'struct':return t.der.includes('Copy');
    case 'enum':return t.builtin?t.args.every(isCopy):t.der.includes('Copy');
    case 'ref':return !t.mut;
    case 'param':return t.bounds.has('Copy');
    case 'tuple':return t.els.every(isCopy);
    case 'array':return isCopy(t.el);
    default:return true;
  }
}
// whether a type implements a builtin trait: Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Default, Hash or IntoIterator. Display is never derived.
// A HashMap has no ordering or hash; its equality needs a key that is Eq and Hash
function has(t,tr){
  t=res(t);
  const all=xs=>xs.every(x=>has(x,tr));
  switch(t.k){
    case 'float':case 'fvar':return tr!=='Eq'&&tr!=='Ord'&&tr!=='Hash'&&tr!=='IntoIterator';
    case 'String':return tr!=='Copy'&&tr!=='IntoIterator';
    case 'ref':{
      if(tr==='Copy'||tr==='Clone')return !t.mut;
      if(tr==='IntoIterator'){const to=res(t.to);return to.k==='coll'||to.k==='array'||to.k==='slice';}
      return tr!=='Default'&&has(t.to,tr);
    }
    case 'tuple':return tr!=='IntoIterator'&&all(t.els);
    case 'array':return tr==='IntoIterator'||(tr==='Default'?t.n===0||t.n<=32&&has(t.el,tr):has(t.el,tr));
    case 'slice':return tr!=='Copy'&&tr!=='Clone'&&tr!=='Default'&&has(t.el,tr);
    case 'struct':return t.der.includes(tr);
    case 'enum':
      if(tr==='IntoIterator'||tr==='Default'&&t.builtin)return t.builtin&&t.name==='Option';
      return t.der.includes(tr)&&all(t.args);
    case 'coll':{
      const [k,v]=t.args;
      if(tr==='Copy')return false;
      if(tr==='Default'||tr==='IntoIterator')return true;
      if(t.name==='Vec')return has(k,tr);
      if(tr==='Clone'||tr==='Debug')return has(k,tr)&&has(v,tr);
      if(tr==='PartialEq'||tr==='Eq')return has(k,'Eq')&&has(k,'Hash')&&has(v,tr);
      return false;
    }
    case 'tvar':return false;
    case 'param':return t.bounds.has(tr);
    default:return tr!=='IntoIterator';
  }
}
// a type that mentions a reference anywhere, so it can carry a loan
function hasRef(t){
  t=res(t);
  return t.k==='ref'||(t.k==='tuple'&&t.els.some(hasRef))||t.k==='struct'&&t.lt||(t.k==='array'&&hasRef(t.el))||((t.k==='enum'||t.k==='coll')&&t.args.some(hasRef));
}
// any and never agree with everything; a variable binds to a concrete type of its own family
function unify(a,b){
  a=res(a);b=res(b);
  if(a===b||a.k==='any'||b.k==='any'||a.k==='never'||b.k==='never')return true;
  if(a.k==='tvar'){a.ref=b;return true;}
  if(b.k==='tvar'){b.ref=a;return true;}
  if(a.k==='ivar'||a.k==='fvar'){
    if(b.k===a.k||b.k===(a.k==='ivar'?'int':'float')){a.ref=b;return true;}
    return false;
  }
  if(b.k==='ivar'||b.k==='fvar')return unify(b,a);
  if(a.k!==b.k||a.k==='param')return false;
  if(a.k==='int')return a.ty===b.ty;
  if(a.k==='tuple')return a.els.length===b.els.length&&a.els.every((x,i)=>unify(x,b.els[i]));
  if(a.k==='array')return a.n===b.n&&unify(a.el,b.el);
  if(a.k==='slice')return unify(a.el,b.el);
  if(a.k==='ref')return a.mut===b.mut&&unify(a.to,b.to);
  if(a.k==='struct')return a.name===b.name;
  if(a.k==='enum'||a.k==='coll')return a.name===b.name&&a.args.every((x,i)=>unify(x,b.args[i]));
  return true;
}
// rustc writes an open number type as `integer` on its own and as `{integer}` inside another type
function show(t,nested){
  t=res(t);
  const sub=x=>show(x,true);
  switch(t.k){
    case 'int':return t.ty;
    case 'ivar':return nested===true?'{integer}':'integer';
    case 'fvar':return nested===true?'{float}':'floating-point number';
    case 'float':return 'f64';
    case 'str':return '&str';
    case 'unit':return '()';
    case 'tuple':return '('+t.els.map(sub).join(', ')+(t.els.length===1?',':'')+')';
    case 'array':return '['+sub(t.el)+'; '+t.n+']';
    case 'slice':return '['+sub(t.el)+']';
    case 'ref':return '&'+(t.mut?'mut ':'')+sub(t.to);
    case 'struct':return t.name;
    case 'enum':case 'coll':return t.name+(t.args.length?'<'+t.args.map(sub).join(', ')+'>':'');
    case 'tvar':return '_';
    case 'param':return t.name;
    case 'fmtr':return "Formatter<'_>";
    default:return t.k;
  }
}
function subst(t,map){
  t=res(t);
  const f=x=>subst(x,map);
  switch(t.k){
    case 'param':return map.get(t)||t;
    case 'tuple':return T.tuple(t.els.map(f));
    case 'array':return T.array(f(t.el),t.n);
    case 'slice':return T.slice(f(t.el));
    case 'ref':return T.ref(t.mut,f(t.to),t.rg);
    case 'enum':return t.args.length?T.enum(t.name,t.args.map(f),t.der,t.builtin):t;
    case 'coll':return T.coll(t.name,t.args.map(f));
    default:return t;
  }
}
RQ.types={INT,subst,isInt,T,unify,res,show,isCopy,has,hasRef,DEFAULT_INT:'i32',
  fits:(v,ty)=>{const r=INT[ty||'i32'];return v>=r[0]&&v<=r[1];},
  wrap:(v,ty)=>(ty[0]==='i'?BigInt.asIntN:BigInt.asUintN)(bitsOf(ty),v),
  isSigned:ty=>ty[0]==='i'};
})();
