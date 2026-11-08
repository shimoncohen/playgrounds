/* Which values a match leaves out, found the way rustc finds them (usefulness over a pattern matrix), so the witnesses printed in E0004
   and E0005 are the ones rustc prints. DOM-free.
   Types: {k:'bool'} {k:'int',lo,hi,ty,open} (open: usize and isize, shown with a half-open range) {k:'char'} {k:'opaque'} (a string or a float: only `_` covers it)
   {k:'enum',prefix,variants:[{name,kind,names,tys()}]} {k:'struct',name,kind,names,tys()} {k:'tuple',tys()} {k:'ref',to()}.
   Patterns: WILD, {or:[pat]}, {c:'v',i,args}, {c:'single',args}, {c:'bool',v}, {c:'range',lo,hi} (BigInt, inclusive), {c:'opaque'}.
   Two rules are rustc's and look odd: a column with a missing constructor reports only the missing ones (the present ones are not dug
   into), and a missing constructor is reported by name only at the scrutinee or when some other constructor of that column is present. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const WILD={w:true};
const MAX_STEPS=40000;
const CHAR_SEGS=[[0n,0xD7FFn],[0xE000n,0x10FFFFn]];

class Limit extends Error{}

const fieldTys=(ty,c)=>ty.k==='enum'?ty.variants[c.i].tys():ty.k==='struct'||ty.k==='tuple'?ty.tys():ty.k==='ref'?[ty.to()]:[];
const segs=ty=>ty.k==='char'?CHAR_SEGS:[[ty.lo,ty.hi]];

function splitRanges(ty,heads){
  const cuts=new Set();
  for(const h of heads){cuts.add(h.lo);cuts.add(h.hi+1n);}
  const present=[],missing=[];
  for(const [a,b] of segs(ty)){
    const pts=[a,...[...cuts].filter(x=>x>a&&x<=b).sort((x,y)=>x<y?-1:x>y?1:0),b+1n];
    let gap=null;
    for(let i=0;i+1<pts.length;i++){
      const lo=pts[i],hi=pts[i+1]-1n;
      if(heads.some(h=>h.lo<=lo&&hi<=h.hi)){
        if(gap){missing.push(gap);gap=null;}
        present.push({c:'range',lo,hi});
      }else if(gap)gap.hi=hi;
      else gap={c:'range',lo,hi};
    }
    if(gap)missing.push(gap);
  }
  return {present,missing};
}

function split(ty,heads){
  switch(ty.k){
    case 'enum':{
      const seen=new Set(heads.map(h=>h.i)),all=ty.variants.map((v,i)=>({c:'v',i}));
      return {present:all.filter(c=>seen.has(c.i)),missing:all.filter(c=>!seen.has(c.i))};
    }
    case 'bool':{
      const seen=new Set(heads.map(h=>h.v)),all=[{c:'bool',v:true},{c:'bool',v:false}];
      return {present:all.filter(c=>seen.has(c.v)),missing:all.filter(c=>!seen.has(c.v))};
    }
    case 'int':case 'char':return splitRanges(ty,heads);
    case 'opaque':return {present:[],missing:[{c:'opaque'}]};
    default:return heads.length?{present:[{c:'single'}],missing:[]}:{present:[],missing:[{c:'single'}]};
  }
}

const covers=(h,c)=>c.c==='range'?h.lo<=c.lo&&c.hi<=h.hi:c.c==='v'?h.i===c.i:c.c==='bool'?h.v===c.v:true;

function expand(rows){
  const out=[];
  const go=r=>{
    const h=r.c[0];
    if(h.or)for(const a of h.or)go({c:[a,...r.c.slice(1)],g:r.g});
    else out.push(r);
  };
  rows.forEach(go);
  return out;
}

function search(rows,tys,top,st){
  if(++st.n>MAX_STEPS)throw new Limit();
  if(!tys.length)return rows.some(r=>!r.g)?[]:[[]];
  rows=expand(rows);
  const ty=tys[0],rest=tys.slice(1);
  if(ty.k==='int'||ty.k==='char'){
    const [mn,mx]=ty.k==='char'?[0n,0x10FFFFn]:[ty.lo,ty.hi];
    rows=rows.map(r=>r.c[0].c==='range'&&(r.c[0].lo===null||r.c[0].hi===null)?{c:[{...r.c[0],lo:r.c[0].lo??mn,hi:r.c[0].hi??mx},...r.c.slice(1)],g:r.g}:r);
  }
  const heads=rows.map(r=>r.c[0]).filter(h=>!h.w);
  const {present,missing}=split(ty,heads);
  const spec=c=>{
    const n=fieldTys(ty,c).length;
    return rows.filter(r=>r.c[0].w||covers(r.c[0],c)).map(r=>({c:[...(r.c[0].w?Array(n).fill(WILD):r.c[0].args||[]),...r.c.slice(1)],g:r.g}));
  };
  if(missing.length){
    const sub=search(rows.filter(r=>r.c[0].w).map(r=>({c:r.c.slice(1),g:r.g})),rest,false,st);
    if(sub.length){
      const individual=top&&ty.k!=='int'&&ty.k!=='char'||present.length>0;
      const shown=individual&&ty.k!=='opaque'?missing.map(c=>({ty,c,args:fieldTys(ty,c).map(()=>WILD)})):[WILD];
      return shown.flatMap(p=>sub.map(w=>[p,...w]));
    }
  }
  const out=[];
  for(const c of present){
    const ftys=fieldTys(ty,c),n=ftys.length;
    for(const w of search(spec(c),[...ftys,...rest],false,st))out.push([{ty,c,args:w.slice(0,n)},...w.slice(n)]);
  }
  return out;
}

const esc=cp=>{
  const ch=String.fromCodePoint(Number(cp));
  if(ch==='\0')return '\\0';
  if(ch==='\t')return '\\t';
  if(ch==='\n')return '\\n';
  if(ch==='\r')return '\\r';
  if(ch==="'")return "\\'";
  if(ch==='\\')return '\\\\';
  return cp<32n||cp>=127n?'\\u{'+cp.toString(16)+'}':ch;
};

function range(ty,lo,hi){
  if(ty.k==='char')return lo===hi?"'"+esc(lo)+"'":"'"+esc(lo)+"'..='"+esc(hi)+"'";
  const s=ty.ty,signed=s[0]==='i',atMin=lo===ty.lo,atMax=hi===ty.hi;
  const L=signed&&atMin?(ty.open?'':s+'::MIN'):lo+'_'+s,H=atMax?(ty.open?'':s+'::MAX'):hi+'_'+s;
  if(lo===hi)return lo+'_'+s;
  if(ty.open)return (signed&&atMin?'':L)+(atMax?'..':'..='+H);
  return L+'..='+H;
}

function show(p){
  if(p.w)return '_';
  const {ty,c,args}=p,a=args.map(show);
  switch(ty.k){
    case 'bool':return String(c.v);
    case 'int':case 'char':return range(ty,c.lo,c.hi);
    case 'ref':return '&'+a[0];
    case 'tuple':return '('+a.join(', ')+(a.length===1?',':'')+')';
    case 'enum':case 'struct':{
      const v=ty.k==='enum'?ty.variants[c.i]:ty,name=(ty.k==='enum'?ty.prefix:'')+(ty.k==='enum'?v.name:ty.name);
      if(v.kind==='unit')return name;
      if(v.kind==='tuple')return name+'('+a.join(', ')+')';
      const parts=v.names.map((f,i)=>args[i].w?null:f+': '+a[i]).filter(Boolean);
      return name+' { '+parts.concat(parts.length<v.names.length?['..']:[]).join(', ')+' }';
    }
    default:return '_';
  }
}

/* rows: {p, g} per arm (g: the arm has a guard, so it counts for the constructors it names but covers nothing). Returns the printed witnesses, or null when the search got too big. */
RQ.exhaust={
  WILD,
  missing(ty,rows){
    try{return search(rows.map(r=>({c:[r.p],g:r.g})),[ty],true,{n:0}).map(w=>show(w[0]));}
    catch(e){if(e instanceof Limit)return null;throw e;}
  }
};
})();
