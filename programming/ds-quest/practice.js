/* Data Structures Quest practice contract: value types, sig and tree rules, generator shapes and the runner registry. DOM-free. */
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
    const v=mine.find(g=>g.part==='vals'),w=mine.find(g=>g.part==='want');
    if(v&&w&&v.slotType!==w.slotType)fail(`${where}: pairs want must be the same type as vals`);
  }
}
function checkExpanded(value,type,where='expansion'){checkValue(value,type,where)}

/* Expanders are deterministic: no randomness, no date. Each gets (gen, {type, types, nothing}): the slot's own type,
   the types of the case's slots of the same kind by part, and the block's nothing value, which no output may equal. */
const take=(n,f,skip)=>{const out=[];for(let j=0;out.length<n;j++){const v=f(j);if(v!==skip)out.push(v)}return out};
const gcd=(a,b)=>b?gcd(b,a%b):a;
const stride=n=>{let s=7;while(gcd(s,n)!==1)s++;return s};
const SEQ={
  ints:{key:j=>3*j+1,miss:j=>3*j+3,val:j=>10+(j*13)%97},
  strs:{key:j=>'k'+j,miss:j=>'m'+j,val:j=>'v'+j},
};
function pairsOf(g,{types,nothing}){
  const K=SEQ[types.keys||types.queries||'ints'],V=SEQ[types.vals||types.want||'ints'];
  const s=stride(g.n),base=take(g.n,K.key,nothing);
  const keys=base.map((_,i)=>base[(i*s+2)%g.n]),vals=take(g.n,V.val,nothing);
  const miss=take(g.q,K.miss,nothing),queries=[],want=[];
  let m=0;
  for(let k=0;k<g.q;k++){
    if(nothing!==undefined&&k%4===3){queries.push(miss[m++]);want.push(nothing)}
    else{const h=(k*s+1)%g.n;queries.push(keys[h]);want.push(vals[h])}
  }
  return {keys,vals,queries,want};
}
const letters=i=>{let s='';do{s=String.fromCharCode(97+i%26)+s;i=Math.floor(i/26)-1}while(i>=0);return s};
function wordsOf(g,{nothing}){
  const ws=take(g.n,letters,nothing),seq=[];
  for(let p=0;p<3;p++)ws.forEach((w,i)=>{if(i%3>=p)seq.push(w)});
  return {text:seq.join(' '),want:ws.map((w,i)=>`${w} ${i%3+1}`)};
}
const EXPANDERS={
  ramp:g=>Array.from({length:g.n},(_,i)=>(g.start||0)+i*(g.step===undefined?1:g.step)),
  pairs:(g,ctx={})=>pairsOf(g,{types:{},...ctx})[g.part],
  words:(g,ctx={})=>wordsOf(g,ctx)[g.part],
};
/* sig and nothing are optional: they only feed the expanders' context.
   A literal is copied, because learner code may change the array it is given (xs.pop()) and the block must stay as written. */
const copy=v=>v===undefined?v:JSON.parse(JSON.stringify(v));
function expandCase(c,expanders=EXPANDERS,sig,nothing){
  const slots=sig?slotsOf(c,sig):[],types={};
  slots.forEach(([v,t])=>{if(isGen(v))(types[v.gen]=types[v.gen]||{})[v.part]=t});
  const ex=(g,i)=>isGen(g)?expanders[g.gen](g,{type:slots[i]&&slots[i][1],types:types[g.gen]||{},nothing}):copy(g);
  const out={...c,args:(c.args||[]).map(ex)};
  if('want' in c)out.want=ex(c.want,out.args.length);
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
function checkNothingCase(c,sig,nothing,where){
  (c.args||[]).forEach((v,i)=>{
    const t=sig.args[i][1];
    if(isGen(v)||t==='list'||t==='tree')return;
    const hit=t==='ints'||t==='strs'?v.includes(nothing):(t==='int'||t==='str')&&v===nothing;
    if(hit)fail(`${where} arg ${i}: the nothing value ${JSON.stringify(nothing)} is used as an input`);
  });
}
function checkNothing(block,nothing){
  if(nothing===undefined)return;
  for(const {c,sig,where} of casesOf(block))checkNothingCase(c,sig,nothing,where);
}
const goodName=(n,re)=>typeof n==='string'&&re.test(n);
function checkBlock(block,where='practice',expanders=EXPANDERS){
  if(!isObj(block))fail(`${where}: practice must be an object`);
  if(!block.fn===!block.cls)fail(`${where}: needs exactly one of fn or cls`);
  if(block.fn){
    if(!goodName(block.fn.name,/^[a-z][A-Za-z0-9]*$/))fail(`${where}: fn needs a camelCase name`);
    if(!Array.isArray(block.fn.tests)||!block.fn.tests.length)fail(`${where}: fn needs tests`);
    checkSig(block.fn.sig,'fn',`${where} fn`);
  }else{
    const {methods,ctor,tests}=block.cls;
    if(!goodName(block.cls.name,/^[A-Z][A-Za-z0-9]*$/))fail(`${where}: cls needs a PascalCase name`);
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
    const a=expandCase(c,expanders,sig,block.nothing);
    if(JSON.stringify(a)!==JSON.stringify(expandCase(c,expanders,sig,block.nothing)))fail(`${where} ${w}: generator is not deterministic`);
    slotsOf(a,sig).forEach(([v,t],i)=>checkExpanded(v,t,`${where} ${w} slot ${i}`));
    if(block.nothing!==undefined)checkNothingCase(a,sig,block.nothing,`${where} ${w} (expanded)`);
  }
}
function checkAll(CH,expanders=EXPANDERS){
  let n=0;
  CH.forEach((ch,ci)=>ch.missions.forEach((m,mi)=>{
    if(!m.practice)return;
    try{checkBlock(m.practice,'practice',expanders)}catch(e){fail(`mission ${ci}.${mi}: ${e.message}`)}
    n++;
  }));
  return n;
}

const camelToSnake=s=>s.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
const R=(status,msg='')=>({ok:status==='pass',status,msg});
const fmt=v=>{const s=v===undefined?'undefined':JSON.stringify(v);return s.length>120?s.slice(0,117)+'...':s};
const callText=(name,args)=>`${name}(${args.map(fmt).join(', ')})`;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const wrongAnswer=(call,want,got)=>R('wrong',`${call} should give ${fmt(want)}, but gave ${fmt(got)}`);
const inHelper=t=>t==='list'?'fromList':t==='tree'?'fromTree':null;
const outHelper=t=>t==='list'?'toList':t==='tree'?'toTree':null;
const helpersOf=sig=>[...sig.args.map(a=>inHelper(a[1])),outHelper(sig.ret)].filter((h,i,all)=>h&&all.indexOf(h)===i);
const missingHelper=h=>R('missing',`keep the starter's helper \`${h}\``);

function unitsOf(block,expanders){
  const ex=(c,sig)=>{try{return {c:expandCase(c,expanders,sig,block.nothing)}}catch(e){return {err:e.message}}};
  if(block.fn)return block.fn.tests.map(c=>ex(c,block.fn.sig));
  return block.cls.tests.map(seq=>{const steps=seq.map(c=>ex(c,block.cls.methods[c.m]));const bad=steps.find(s=>s.err);return bad?{err:bad.err}:{steps:steps.map(s=>s.c)}});
}
function drive(block,opts,prep,exec){
  const units=unitsOf(block,opts&&opts.expanders);
  const bad=prep();
  return units.map(u=>u.err?R('error',u.err):bad||exec(u));
}

function runJs(src,block,opts){
  const res=D.run(src),{fn,cls}=block,name=fn?fn.name:cls.name,V=res.vars;
  const limit=()=>R('limit','the code ran for too many steps');
  return drive(block,opts,()=>{
    if(!res.ok)return res.error.type==='EndlessLoop'?limit():R('error',`${res.error.type}: ${res.error.msg}`);
    if(typeof V[name]!=='function')return R('missing',`${fn?'function':'class'} ${name} not found in your code`);
    const h=fn&&helpersOf(fn.sig).find(x=>typeof V[x]!=='function');
    return h?missingHelper(h):null;
  },u=>{
    res.reset();
    try{
      if(fn){
        const {c}=u,args=c.args.map((v,i)=>inHelper(fn.sig.args[i][1])?V[inHelper(fn.sig.args[i][1])](v):v);
        let got=V[name](...args);
        if(outHelper(fn.sig.ret))got=V[outHelper(fn.sig.ret)](got);
        return c.want===undefined||same(got,c.want)?R('pass'):wrongAnswer(callText(name,c.args),c.want,got);
      }
      const o=new V[name]();
      for(let j=0;j<u.steps.length;j++){
        const st=u.steps[j],args=st.args||[];
        if(typeof o[st.m]!=='function')return R('missing',`class ${name} has no method ${st.m}`);
        const got=o[st.m](...args);
        if(st.want!==undefined&&!same(got,st.want))return R('wrong',`step ${j}: ${wrongAnswer(callText(st.m,args),st.want,got).msg}`);
      }
      return R('pass');
    }catch(e){
      return e&&e.message==='LOOP_LIMIT'?limit():R('error',`${e&&e.name||'Error'}: ${e&&e.message||e}`);
    }
  });
}

/* PY.callUser takes only JS values, so a node case goes through a generated wrapper that builds and unwraps the nodes */
function pyWrapper(fn,name){
  const ps=fn.sig.args.map((_,i)=>'a'+i);
  const ins=fn.sig.args.map((a,i)=>inHelper(a[1])?`${camelToSnake(inHelper(a[1]))}(a${i})`:'a'+i);
  const out=outHelper(fn.sig.ret);
  return `\n\ndef _ds_case(${ps.join(', ')}):\n    r = ${name}(${ins.join(', ')})\n    return ${out?`${camelToSnake(out)}(r)`:'r'}\n`;
}
function runPy(src,block,opts){
  if(block.cls)return drive(block,opts,()=>R('unsupported','Python runs functions only, not classes'),null);
  const {fn}=block,name=camelToSnake(fn.name),helpers=helpersOf(fn.sig).map(camelToSnake);
  const entry=helpers.length?'_ds_case':name;
  const res=PY.run(src+(helpers.length?pyWrapper(fn,name):''),{trace:false});
  const defined=n=>res.interp.glob.vars.get(n) instanceof PY.PyFunc;
  return drive(block,opts,()=>{
    if(res.error)return res.error.type==='TooManySteps'?R('limit',res.error.msg):R('error',`${res.error.type}: ${res.error.msg}`);
    if(!defined(name))return R('missing',`function ${name} not found in your code`);
    const h=helpers.find(x=>!defined(x));
    return h?missingHelper(h):null;
  },({c})=>{
    try{
      const got=PY.callUser(res,entry,c.args).v;
      return c.want===undefined||same(got,c.want)?R('pass'):wrongAnswer(callText(name,c.args),c.want,got);
    }catch(e){
      if(e&&e.type==='TooManySteps')return R('limit',e.pymsg);
      if(e instanceof RangeError)return R('error','RecursionError: maximum recursion depth exceeded');
      return R('error',e&&e.type?`${e.type}: ${e.pymsg}`:String(e&&e.message||e));
    }
  });
}
/* C++ and Rust: one generated main per case. The result is printed between marker lines, so the learner's own
   output cannot change the verdict. A node argument goes through the helpers; arguments are passed by value. */
const MARK='@@ds',MARK_END='@@ds-end';
const NTYPES={
  cpp:{int:'int',bool:'bool',str:'string',ints:'vector<int>',strs:'vector<string>',list:'List',tree:'Tree'},
  rs:{int:'i32',bool:'bool',str:'String',ints:'Vec<i32>',strs:'Vec<String>',list:'List',tree:'Tree'},
};
const nlit=(lang,t,v)=>{
  if(t==='int'||t==='bool')return String(v);
  if(t==='str')return lang==='rs'?`${JSON.stringify(v)}.to_string()`:JSON.stringify(v);
  const items=(t==='strs'?v.map(x=>nlit(lang,'str',x)):v).join(', ');
  return lang==='rs'?`vec![${items}]`:`{${items}}`;
};
const nname=(lang,s)=>lang==='rs'?camelToSnake(s):s;
const say=(lang,s)=>lang==='rs'?`println!("${s}");`:`cout << "${s}\\n";`;
function nargDecl(lang,t,i,v){
  const T=NTYPES[lang];
  if(t!=='list'&&t!=='tree')return lang==='rs'?`let a${i}: ${T[t]} = ${nlit(lang,t,v)};`:`${T[t]} a${i} = ${nlit(lang,t,v)};`;
  const h=nname(lang,inHelper(t));
  return lang==='rs'?`let a${i} = ${h}(${nlit(lang,'ints',v)});`:`vector<int> v${i} = ${nlit(lang,'ints',v)};\n  ${T[t]} a${i} = ${h}(v${i});`;
}
/* statements that print variable x of type t between the markers; the start marker begins with a newline because
   the engines pass stdout through raw, so a learner's unterminated print would otherwise glue onto it */
function nshow(lang,t,x){
  const o=t==='list'||t==='tree'?'o':x,rs=lang==='rs';
  const conv=o===x?'':rs?`let o = ${nname(lang,outHelper(t))}(&${x});`:`vector<int> o = ${outHelper(t)}(${x});`;
  const kind=o===x?t:'ints';
  const body=kind==='int'||kind==='str'?(rs?`println!("{}", ${o});`:`cout << ${o} << "\\n";`)
    :kind==='bool'?(rs?`println!("{}", ${o});`:`cout << (${o} ? "true" : "false") << "\\n";`)
    :kind==='void'?''
    :rs?`for x in ${o}.iter() { println!("{}", x); }`:`for (int i = 0; i < ${o}.size(); i++) { cout << ${o}[i] << "\\n"; }`;
  return [say(lang,'\\n'+MARK),conv,body,say(lang,MARK_END)].filter(Boolean).join('\n  ');
}
const nmain=(lang,lines)=>lang==='rs'?`\nfn main() {\n  ${lines.join('\n  ')}\n}\n`:`\nint main() {\n  ${lines.join('\n  ')}\n  return 0;\n}\n`;
function fnMain(lang,fn,c){
  const decls=fn.sig.args.map(([,t],i)=>nargDecl(lang,t,i,c.args[i]));
  const call=`${nname(lang,fn.name)}(${fn.sig.args.map((_,i)=>'a'+i).join(', ')})`;
  const get=fn.sig.ret==='void'?`${call};`:lang==='rs'?`let r = ${call};`:`${NTYPES.cpp[fn.sig.ret]} r = ${call};`;
  return nmain(lang,[...decls,get,nshow(lang,fn.sig.ret,'r')]);
}
function clsMain(cls,steps){
  const lines=[`let mut s = ${cls.name}::new();`];
  steps.forEach((st,j)=>{
    const m=cls.methods[st.m],call=`s.${camelToSnake(st.m)}(${(st.args||[]).map((a,i)=>nlit('rs',m.args[i][1],a)).join(', ')})`;
    if(st.want===undefined||m.ret==='void')lines.push(`${call};`);
    else lines.push(`let r${j} = ${call};`,nshow('rs',m.ret,'r'+j));
  });
  return nmain('rs',lines);
}
function blocksOf(out){
  const bs=[];let cur=null;
  for(const l of out.split('\n')){
    if(l===MARK)cur=[];
    else if(l===MARK_END){if(cur)bs.push(cur);cur=null}
    else if(cur)cur.push(l);
  }
  return bs;
}
const decode=(t,ls)=>t==='int'?Number(ls[0]):t==='bool'?ls[0]==='true':t==='str'?ls.join('\n'):t==='strs'?ls:ls.map(Number);
const engineText=(e,line)=>`${e&&e.message||e}${line?` (line ${line})`:''}`;
function execCpp(text){
  let r;
  try{r=CPP.runAll(text)}catch(e){return {err:R('error',engineText(e))}}
  if(r.ok)return {out:r.out};
  const e=r.error;
  return {err:e&&e.head==='loop'?R('limit',e.message):R('error',engineText(e,e&&e.line))};
}
function execRs(text){
  let r;
  try{r=RQ.run(text)}catch(e){return {err:R('error',engineText(e))}}
  if(r.status==='limit')return {err:R('limit','the code ran for too many steps')};
  if(r.status==='panic')return {err:R('error',`panicked at line ${r.panic.line}: ${r.panic.msg}`)};
  if(r.status==='unsupported')return {err:R('error',`not supported by this quest: ${r.unsupported.feature} (line ${r.unsupported.line})`)};
  if(r.status==='error'){const d=r.errors[0];return {err:R('error',`${d.code?d.code+': ':''}${d.msg} (line ${d.line})`)}}
  if(r.status!=='ok')return {err:R('error',r.message||`the engine stopped with status ${r.status}`)};
  if(r.orderDependent)return {err:R('error','the result depends on HashMap iteration order, so it can change between runs')};
  return {out:r.stdout};
}
function runNative(lang,src,block,opts){
  const rs=lang==='rs',exec=rs?execRs:execCpp,{fn,cls}=block;
  if(cls&&!rs)return drive(block,opts,()=>R('unsupported','C++ runs functions only, not classes'),null);
  const bare=src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'');
  const declared=(kind,name)=>new RegExp(rs?(kind==='class'?`\\bstruct\\s+${name}\\b`:`\\bfn\\s+${name}\\b`):`(?:^|[;{}])\\s*[A-Za-z_][\\w:<>,\\s&*]*[\\s&*]${name}\\s*\\([^)]*\\)\\s*\\{`).test(bare);
  const name=fn?nname(lang,fn.name):cls.name;
  return drive(block,opts,()=>{
    if(!declared(fn?'fn':'class',name))return R('missing',`${fn?'function':'class'} ${name} not found in your code`);
    if(fn){const h=helpersOf(fn.sig).find(x=>!declared('fn',nname(lang,x)));return h?missingHelper(nname(lang,h)):null}
    const m=Object.keys(cls.methods).find(x=>!declared('fn',camelToSnake(x)));
    return m?R('missing',`class ${name} has no method ${m}`):null;
  },u=>{
    const r=exec(src+(fn?fnMain(lang,fn,u.c):clsMain(cls,u.steps)));
    if(r.err)return r.err;
    const bs=blocksOf(r.out);
    if(fn){
      const c=u.c;
      if(!bs.length)return R('error','the program printed no result');
      const got=fn.sig.ret==='void'?undefined:decode(fn.sig.ret==='list'||fn.sig.ret==='tree'?'ints':fn.sig.ret,bs[bs.length-1]);
      return c.want===undefined||same(got,c.want)?R('pass'):wrongAnswer(callText(name,c.args),c.want,got);
    }
    const shown=u.steps.map((st,j)=>({st,j})).filter(({st})=>st.want!==undefined&&cls.methods[st.m].ret!=='void');
    if(bs.length!==shown.length)return R('error','the program printed an unexpected number of results');
    for(let k=0;k<shown.length;k++){
      const {st,j}=shown[k],got=decode(cls.methods[st.m].ret,bs[k]);
      if(!same(got,st.want))return R('wrong',`step ${j}: ${wrongAnswer(callText(st.m,st.args||[]),st.want,got).msg}`);
    }
    return R('pass');
  });
}

const RUNNERS={
  js:{available:()=>typeof D.run==='function',run:runJs},
  py:{available:()=>typeof PY!=='undefined',run:runPy},
  cpp:{available:()=>typeof CPP!=='undefined',run:(s,b,o)=>runNative('cpp',s,b,o)},
  rs:{available:()=>typeof RQ!=='undefined',run:(s,b,o)=>runNative('rs',s,b,o)},
};
function refPasses(block,lang,opts){
  const L=block.langs&&block.langs[lang];
  return !!L&&typeof L.answer==='string'&&RUNNERS[lang].run(L.answer,block,opts).every(r=>r.ok);
}

const HELPERS={
  js:{
    fromList:`function fromList(v){
  let head=null;
  for(let i=v.length-1;i>=0;i--){head={value:v[i],next:head}}
  return head;
}`,
    toList:`function toList(head){
  const out=[];
  let n=head;
  while(n&&out.length<10000){out.push(n.value);n=n.next}
  return out;
}`,
    fromTree:`function fromTree(v){
  if(!v.length)return null;
  const mk=x=>x===-1||x===undefined?null:{value:x,left:null,right:null};
  const root=mk(v[0]);
  const q=[root];
  let h=0,i=1;
  while(h<q.length&&i<v.length){
    const n=q[h++];
    n.left=mk(v[i++]);
    n.right=mk(v[i++]);
    if(n.left)q.push(n.left);
    if(n.right)q.push(n.right);
  }
  return root;
}`,
    toTree:`function toTree(root){
  const out=[];
  const q=[root];
  let h=0,seen=0;
  while(h<q.length&&seen<10000){
    const n=q[h++];
    if(!n){out.push(-1);continue}
    seen++;
    out.push(n.value);
    q.push(n.left||null,n.right||null);
  }
  while(out.length&&out[out.length-1]===-1)out.pop();
  return out;
}`,
  },
  py:{
    fromList:`def from_list(v):
    head = None
    i = len(v) - 1
    while i >= 0:
        head = {"value": v[i], "next": head}
        i = i - 1
    return head`,
    toList:`def to_list(head):
    out = []
    n = head
    while n is not None and len(out) < 10000:
        out.append(n["value"])
        n = n["next"]
    return out`,
    fromTree:`def from_tree(v):
    if len(v) == 0:
        return None
    root = {"value": v[0], "left": None, "right": None}
    q = [root]
    h = 0
    i = 1
    while h < len(q) and i < len(v):
        n = q[h]
        h = h + 1
        if i < len(v) and v[i] != -1:
            n["left"] = {"value": v[i], "left": None, "right": None}
            q.append(n["left"])
        i = i + 1
        if i < len(v) and v[i] != -1:
            n["right"] = {"value": v[i], "left": None, "right": None}
            q.append(n["right"])
        i = i + 1
    return root`,
    toTree:`def to_tree(root):
    out = []
    q = [root]
    h = 0
    seen = 0
    while h < len(q) and seen < 10000:
        n = q[h]
        h = h + 1
        if n is None:
            out.append(-1)
        else:
            seen = seen + 1
            out.append(n["value"])
            q.append(n["left"])
            q.append(n["right"])
    while len(out) > 0 and out[-1] == -1:
        out.pop()
    return out`,
  },
  /* the node types sit with the from-helper; the to-helpers stop after nodes.size() visits, so a cycle gives a wrong answer */
  cpp:{
    fromList:`struct Node { int value; int next; };
struct List { vector<Node> nodes; int head; };

List fromList(vector<int> v) {
    List l;
    l.head = -1;
    for (int i = 0; i < v.size(); i++) {
        Node n;
        n.value = v[i];
        n.next = -1;
        if (i + 1 < v.size()) { n.next = i + 1; }
        l.nodes.push_back(n);
    }
    if (v.size() > 0) { l.head = 0; }
    return l;
}`,
    toList:`vector<int> toList(List l) {
    vector<int> out;
    int i = l.head;
    int seen = 0;
    while (i != -1 && seen < l.nodes.size()) {
        out.push_back(l.nodes[i].value);
        i = l.nodes[i].next;
        seen++;
    }
    return out;
}`,
    fromTree:`struct Node { int value; int left; int right; };
struct Tree { vector<Node> nodes; int root; };

Tree fromTree(vector<int> v) {
    Tree t;
    t.root = -1;
    if (v.size() == 0) { return t; }
    Node r;
    r.value = v[0];
    r.left = -1;
    r.right = -1;
    t.nodes.push_back(r);
    t.root = 0;
    vector<int> q;
    q.push_back(0);
    int h = 0;
    int i = 1;
    while (h < q.size() && i < v.size()) {
        int p = q[h];
        h++;
        for (int side = 0; side < 2; side++) {
            if (i < v.size()) {
                if (v[i] != -1) {
                    Node c;
                    c.value = v[i];
                    c.left = -1;
                    c.right = -1;
                    t.nodes.push_back(c);
                    int k = t.nodes.size() - 1;
                    if (side == 0) { t.nodes[p].left = k; } else { t.nodes[p].right = k; }
                    q.push_back(k);
                }
                i++;
            }
        }
    }
    return t;
}`,
    toTree:`vector<int> toTree(Tree t) {
    vector<int> out;
    vector<int> q;
    q.push_back(t.root);
    int h = 0;
    int seen = 0;
    while (h < q.size() && seen < t.nodes.size()) {
        int i = q[h];
        h++;
        if (i == -1) {
            out.push_back(-1);
        } else {
            seen++;
            out.push_back(t.nodes[i].value);
            q.push_back(t.nodes[i].left);
            q.push_back(t.nodes[i].right);
        }
    }
    while (out.size() > 0 && out[out.size() - 1] == -1) { out.pop_back(); }
    return out;
}`,
  },
  rs:{
    fromList:`struct Node { value: i32, next: Option<usize> }
struct List { nodes: Vec<Node>, head: Option<usize> }

fn from_list(v: Vec<i32>) -> List {
    let mut nodes: Vec<Node> = Vec::new();
    for i in 0..v.len() {
        let mut next: Option<usize> = None;
        if i + 1 < v.len() { next = Some(i + 1); }
        nodes.push(Node { value: v[i], next: next });
    }
    let mut head: Option<usize> = None;
    if v.len() > 0 { head = Some(0); }
    List { nodes: nodes, head: head }
}`,
    toList:`fn to_list(l: &List) -> Vec<i32> {
    let mut out: Vec<i32> = Vec::new();
    let mut cur = l.head;
    let mut seen = 0;
    while let Some(i) = cur {
        if seen >= l.nodes.len() { break; }
        out.push(l.nodes[i].value);
        cur = l.nodes[i].next;
        seen += 1;
    }
    out
}`,
    fromTree:`struct Node { value: i32, left: Option<usize>, right: Option<usize> }
struct Tree { nodes: Vec<Node>, root: Option<usize> }

fn from_tree(v: Vec<i32>) -> Tree {
    let mut nodes: Vec<Node> = Vec::new();
    if v.len() == 0 { return Tree { nodes: nodes, root: None }; }
    nodes.push(Node { value: v[0], left: None, right: None });
    let mut q: Vec<usize> = Vec::new();
    q.push(0);
    let mut h = 0;
    let mut i = 1;
    while h < q.len() && i < v.len() {
        let p = q[h];
        h += 1;
        for side in 0..2 {
            if i < v.len() {
                if v[i] != -1 {
                    nodes.push(Node { value: v[i], left: None, right: None });
                    let k = nodes.len() - 1;
                    if side == 0 { nodes[p].left = Some(k); } else { nodes[p].right = Some(k); }
                    q.push(k);
                }
                i += 1;
            }
        }
    }
    Tree { nodes: nodes, root: Some(0) }
}`,
    toTree:`fn to_tree(t: &Tree) -> Vec<i32> {
    let mut out: Vec<i32> = Vec::new();
    let mut q: Vec<Option<usize>> = Vec::new();
    q.push(t.root);
    let mut h = 0;
    let mut seen = 0;
    while h < q.len() && seen < t.nodes.len() {
        let cur = q[h];
        h += 1;
        if let Some(i) = cur {
            seen += 1;
            out.push(t.nodes[i].value);
            q.push(t.nodes[i].left);
            q.push(t.nodes[i].right);
        } else {
            out.push(-1);
        }
    }
    while out.len() > 0 && out[out.len() - 1] == -1 { out.pop(); }
    out
}`,
  },
};
function runnerAvailable(lang){
  if(!Object.hasOwn(RUNNERS,lang))return false;
  try{return !!RUNNERS[lang].available()}catch{return false}
}

const PENDING=[{mission:'1.2',lang:'py',issue:309},{mission:'1.2',lang:'cpp',issue:310},{mission:'2.1',lang:'py',issue:309},{mission:'2.1',lang:'cpp',issue:310},{mission:'3.2',lang:'py',issue:309},{mission:'3.2',lang:'cpp',issue:310},{mission:'4.0',lang:'cpp',issue:310},{mission:'4.1',lang:'cpp',issue:310},{mission:'4.2',lang:'cpp',issue:310},{mission:'4.0',lang:'rs',issue:311},{mission:'4.1',lang:'rs',issue:311},{mission:'4.2',lang:'rs',issue:311},{mission:'4.3',lang:'cpp',issue:310},{mission:'4.4',lang:'cpp',issue:310},{mission:'4.3',lang:'rs',issue:311},{mission:'4.4',lang:'rs',issue:311}];
function checkPendingRow(row,ids){
  if(!isObj(row))fail('pending row must be an object');
  if(row.mission!=='*'&&!ids.includes(row.mission))fail(`pending row: unknown mission ${JSON.stringify(row.mission)}`);
  if(!Object.hasOwn(RUNNERS,row.lang))fail(`pending row: lang ${JSON.stringify(row.lang)} is not a runner language`);
  if(!Number.isInteger(row.issue)||row.issue<1)fail(`pending row: issue ${JSON.stringify(row.issue)} must be a positive integer`);
}
/* a '*' row is stale when it covers some practice missions and all pass */
function stalePending(rows,passes,practiceIds=[]){
  return rows.filter(r=>r.mission==='*'
    ?practiceIds.length>0&&practiceIds.every(id=>passes(id,r.lang))
    :passes(r.mission,r.lang));
}

D.practice={VALUE_TYPES,checkSig,decodeTree,encodeTree,checkValue,checkCase,checkNothing,checkBlock,checkAll,
  RUNNERS,runnerAvailable,refPasses,HELPERS,camelToSnake,GEN_KINDS,checkGen,checkExpanded,expandCase,EXPANDERS,PENDING,checkPendingRow,stalePending};
})();
