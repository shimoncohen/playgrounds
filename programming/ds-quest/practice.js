/* Data Structures Quest practice contract: value types, sig and tree rules, generator shapes and the runner registry. DOM-free; no page loads it yet. */
(()=>{
'use strict';
const D=globalThis.DSQ=globalThis.DSQ||{};

const VALUE_TYPES=['int','bool','str','ints','strs','list','tree','void'];
const isInt=v=>Number.isInteger(v);
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=m=>{throw new Error(m)};

function checkArgs(args,where,{noStructures}={}){
  if(!Array.isArray(args))fail(`${where}: args must be a list of [name,type]`);
  const seen=new Set();
  for(const a of args){
    if(!Array.isArray(a)||a.length!==2||typeof a[0]!=='string'||!a[0])fail(`${where}: each arg must be [name,type]`);
    if(seen.has(a[0]))fail(`${where}: duplicate arg name '${a[0]}'`);
    seen.add(a[0]);
    if(!VALUE_TYPES.includes(a[1])||a[1]==='void')fail(`${where}: arg '${a[0]}' has bad type '${a[1]}'`);
    if(noStructures&&(a[1]==='list'||a[1]==='tree'))fail(`${where}: a method cannot take a ${a[1]}`);
  }
}
function checkSig(sig,kind='fn',where='sig'){
  if(!isObj(sig))fail(`${where}: sig must be an object`);
  checkArgs(sig.args,where,{noStructures:kind==='method'});
  if(!VALUE_TYPES.includes(sig.ret))fail(`${where}: bad return type '${sig.ret}'`);
  if(kind==='method'&&(sig.ret==='list'||sig.ret==='tree'))fail(`${where}: a method cannot return a ${sig.ret}`);
  if(kind==='fn'&&sig.ret==='void'&&sig.args.some(a=>a[1]==='list'||a[1]==='tree'))
    fail(`${where}: a function that takes a list or tree must return it, not void`);
}

/* level order, -1 for an absent child, trailing -1s trimmed */
function decodeTree(arr){
  if(!Array.isArray(arr))fail('tree must be an array');
  if(!arr.length)return null;
  if(!arr.every(v=>isInt(v)&&v>=-1))fail('tree values must be integers, -1 or 0 and up');
  if(arr[0]===-1)fail('tree cannot start with -1');
  if(arr[arr.length-1]===-1)fail('tree has untrimmed trailing -1');
  const node=v=>v===-1||v===undefined?null:{v,l:null,r:null};
  const root=node(arr[0]);const q=[root];let i=1;
  while(q.length&&i<arr.length){const n=q.shift();n.l=node(arr[i++]);n.r=node(arr[i++]);if(n.l)q.push(n.l);if(n.r)q.push(n.r)}
  if(i<arr.length)fail('tree has elements after its last node (heap-style encoding)');
  return root;
}
function encodeTree(root){
  const out=[];const q=[root];
  while(q.length){const n=q.shift();if(!n){out.push(-1);continue}out.push(n.v);q.push(n.l,n.r)}
  while(out.length&&out[out.length-1]===-1)out.pop();
  return out;
}

function checkValue(v,type,where='value'){
  const bad=()=>fail(`${where}: ${JSON.stringify(v)} is not a ${type}`);
  const all=(a,f)=>Array.isArray(a)&&a.every(f);
  switch(type){
    case'int':if(!isInt(v))bad();break;
    case'bool':if(typeof v!=='boolean')bad();break;
    case'str':if(typeof v!=='string')bad();break;
    case'ints':if(!all(v,isInt))bad();break;
    case'strs':if(!all(v,x=>typeof x==='string'))bad();break;
    case'list':if(!all(v,x=>isInt(x)&&x>=0))bad();break;
    case'tree':try{decodeTree(v)}catch(e){fail(`${where}: ${e.message}`)}break;
    case'void':if(v!==undefined)bad();break;
    default:fail(`${where}: unknown type '${type}'`);
  }
}

/* one {gen,...} object stands in for one args entry or the want */
const posInt={test:v=>isInt(v)&&v>=1,say:'a whole number of 1 or more'};
const anyInt={test:isInt,say:'a whole number'};
const GEN_KINDS={
  ramp:{params:{n:posInt,start:anyInt,step:anyInt},required:['n'],parts:null,types:['ints']},
  pairs:{params:{n:posInt,q:posInt},required:['n','q'],
    parts:{keys:['ints','strs'],vals:['ints','strs'],queries:['ints','strs'],want:['ints','strs']}},
  words:{params:{n:posInt},required:['n'],parts:{text:['str'],want:['strs']}},
};
const isGen=v=>isObj(v)&&'gen' in v;
function slotTypes(kind,gen){return kind.parts?kind.parts[gen.part]:kind.types}
function checkGen(g,type,where='generator'){
  const kind=Object.hasOwn(GEN_KINDS,g.gen)?GEN_KINDS[g.gen]:fail(`${where}: unknown generator kind '${g.gen}'`);
  for(const k of Object.keys(g)){
    if(k!=='gen'&&k!=='part'&&!kind.params[k])fail(`${where}: ${g.gen} has no parameter '${k}'`);
  }
  for(const k of kind.required)if(!(k in g))fail(`${where}: ${g.gen} needs parameter '${k}'`);
  for(const [k,p] of Object.entries(kind.params))if(k in g&&!p.test(g[k]))fail(`${where}: ${g.gen}.${k} must be ${p.say}`);
  if(kind.parts){
    if(!g.part)fail(`${where}: ${g.gen} needs a part (${Object.keys(kind.parts).join(', ')})`);
    if(!Object.hasOwn(kind.parts,g.part))fail(`${where}: ${g.gen} has no part '${g.part}'`);
  }else if('part' in g)fail(`${where}: ${g.gen} takes no part`);
  if(!slotTypes(kind,g).includes(type))
    fail(`${where}: ${g.gen}${g.part?'.'+g.part:''} gives ${slotTypes(kind,g).join(' or ')}, but the slot is ${type}`);
}
/* the slots of one case that come from one expansion must agree */
function checkGenGroup(gens,where){
  for(const [name,kind] of Object.entries(GEN_KINDS)){
    if(!kind.parts)continue;
    const mine=gens.filter(g=>g.gen===name);
    const parts=new Set();
    for(const g of mine){
      if(parts.has(g.part))fail(`${where}: ${name} part '${g.part}' is used twice`);
      parts.add(g.part);
      const key=o=>JSON.stringify(Object.entries(o).filter(([k])=>k!=='part'&&k!=='slotType').sort());
      if(key(g)!==key(mine[0]))
        fail(`${where}: ${name} slots of one case must use the same parameters`);
    }
    const k=mine.find(g=>g.part==='keys'),q=mine.find(g=>g.part==='queries');
    if(k&&q&&k.slotType!==q.slotType)fail(`${where}: pairs queries must be the same type as keys`);
  }
}
function checkExpanded(value,type,where='expansion'){checkValue(value,type,where)}
const notImpl=n=>()=>{throw new Error(`generator '${n}' not implemented`)};
const EXPANDERS={ramp:notImpl('ramp'),pairs:notImpl('pairs'),words:notImpl('words')};
function expandCase(c,expanders=EXPANDERS){
  const ex=g=>isGen(g)?expanders[g.gen](g):g;
  const out={...c,args:(c.args||[]).map(ex)};
  if('want' in c)out.want=ex(c.want);
  return out;
}

function slotsOf(c,sig){
  const s=(c.args||[]).map((v,i)=>[v,sig.args[i]&&sig.args[i][1]]);
  if(c.want!==undefined)s.push([c.want,sig.ret]);
  return s;
}
function checkCase(c,sig,where='case'){
  if(!isObj(c))fail(`${where}: a case must be an object`);
  const args=c.args||[];
  if(args.length!==sig.args.length)fail(`${where}: expects ${sig.args.length} args, got ${args.length}`);
  const gens=[];
  slotsOf(c,sig).forEach(([v,t],i)=>{
    const w=i<args.length?`${where} arg ${i}`:`${where} want`;
    if(isGen(v)){checkGen(v,t,w);gens.push({...v,slotType:t})}else checkValue(v,t,w);
  });
  checkGenGroup(gens,where);
}
/* every case of a block, with the sig that governs it */
function casesOf(block){
  const out=[];
  if(block.fn)(block.fn.tests||[]).forEach((c,i)=>out.push({c,sig:block.fn.sig,where:`fn test ${i}`}));
  if(block.cls)(block.cls.tests||[]).forEach((seq,i)=>(seq||[]).forEach((st,j)=>{
    const sig=block.cls.methods&&block.cls.methods[st.m];
    out.push({c:st,sig,where:`cls test ${i} step ${j}`});
  }));
  return out;
}
/* nothing is a value the learner's code could use for "no answer", so it may not be an input */
function checkNothing(block,nothing){
  if(nothing===undefined)return;
  for(const {c,sig,where} of casesOf(block)){
    (c.args||[]).forEach((v,i)=>{
      const t=sig.args[i][1];
      if(isGen(v)||t==='list'||t==='tree')return;
      const hit=t==='ints'||t==='strs'?v.includes(nothing):(t==='int'||t==='str')&&v===nothing;
      if(hit)fail(`${where} arg ${i}: the nothing value ${JSON.stringify(nothing)} is used as an input`);
    });
  }
}
function checkBlock(block,where='practice',expanders=EXPANDERS){
  if(!isObj(block))fail(`${where}: practice must be an object`);
  if(!block.fn===!block.cls)fail(`${where}: needs exactly one of fn or cls`);
  if(block.fn){
    if(!Array.isArray(block.fn.tests)||!block.fn.tests.length)fail(`${where}: fn needs tests`);
    checkSig(block.fn.sig,'fn',`${where} fn`);
  }else{
    const {methods,ctor,tests}=block.cls;
    if(!isObj(methods)||!Object.keys(methods).length)fail(`${where}: cls needs methods`);
    if(ctor!==undefined)checkArgs(ctor,`${where} ctor`);
    for(const [m,s] of Object.entries(methods))checkSig(s,'method',`${where} method ${m}`);
    if(!Array.isArray(tests)||!tests.length)fail(`${where}: cls needs tests`);
    tests.forEach((seq,i)=>{
      if(!Array.isArray(seq))fail(`${where}: cls test ${i} must be a list of steps`);
      seq.forEach((st,j)=>{
        if(!isObj(st))fail(`${where}: cls test ${i} step ${j} must be an object`);
        if(!Object.hasOwn(methods,st.m))fail(`${where}: step calls unknown method '${st.m}'`);
      });
    });
  }
  for(const {c,sig,where:w} of casesOf(block)){
    if(block.fn&&sig.ret!=='void'&&isObj(c)&&c.want===undefined)fail(`${where} ${w}: a fn case needs a want`);
    checkCase(c,sig,`${where} ${w}`);
  }
  checkNothing(block,block.nothing);
  for(const {c,sig,where:w} of casesOf(block)){
    if(!slotsOf(c,sig).some(([v])=>isGen(v)))continue;
    const done=slotsOf(expandCase(c,expanders),sig);
    done.forEach(([v,t],i)=>checkExpanded(v,t,`${where} ${w} slot ${i}`));
  }
}
function checkAll(CH,expanders=EXPANDERS){
  CH.forEach((ch,ci)=>ch.missions.forEach((m,mi)=>{
    if(!m.practice)return;
    try{checkBlock(m.practice,'practice',expanders)}catch(e){fail(`mission ${ci}.${mi}: ${e.message}`)}
  }));
}

/* availability only, read at call time */
const RUNNERS={
  js:{available:()=>typeof D.run==='function'},
  py:{available:()=>typeof PY!=='undefined'},
  cpp:{available:()=>typeof CPP!=='undefined'},
  rs:{available:()=>typeof RQ!=='undefined'},
};
function runnerAvailable(lang){
  if(!Object.hasOwn(RUNNERS,lang))return false;
  try{return !!RUNNERS[lang].available()}catch{return false}
}

const PENDING=[];
/* ids: every mission id 'ch.mi' */
function checkPendingRow(row,ids){
  if(!isObj(row))fail('pending row must be an object');
  if(row.mission!=='*'&&!ids.includes(row.mission))fail(`pending row: unknown mission ${JSON.stringify(row.mission)}`);
  if(!Object.hasOwn(RUNNERS,row.lang))fail(`pending row: lang ${JSON.stringify(row.lang)} is not a runner language`);
  if(!Number.isInteger(row.issue)||row.issue<1)fail(`pending row: issue ${JSON.stringify(row.issue)} must be a positive integer`);
}
/* practiceIds: ids of missions with a practice block; a '*' row is stale when it covers some and all pass */
function stalePending(rows,passes,practiceIds=[]){
  return rows.filter(r=>r.mission==='*'
    ?practiceIds.length>0&&practiceIds.every(id=>passes(id,r.lang))
    :passes(r.mission,r.lang));
}

D.practice={VALUE_TYPES,checkSig,decodeTree,encodeTree,checkValue,checkCase,checkNothing,checkBlock,checkAll,
  RUNNERS,runnerAvailable,GEN_KINDS,checkGen,checkExpanded,expandCase,EXPANDERS,PENDING,checkPendingRow,stalePending};
})();
