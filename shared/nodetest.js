(function (root) {
'use strict';
const tagOf=v=>Object.prototype.toString.call(v).slice(8,-1);
const isErr=v=>tagOf(v)==='Error';
const isRe=v=>tagOf(v)==='RegExp';
const IDENT=/^[A-Za-z_$][\w$]*$/;

function quote(s){
  const q=!s.includes("'")?"'":!s.includes('"')?'"':!s.includes('`')?'`':"'";
  return q+s.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/\t/g,'\\t').split(q).join('\\'+q)+q;
}
// util.inspect for the values a message shows; multi puts every entry on its own line, as Node does inside a diff.
function inspect(v,multi,ind,anc,hit){
  ind=ind||'';anc=anc||[];hit=hit||new Set();
  switch(typeof v){
    case 'string':return quote(v);
    case 'number':return Object.is(v,-0)?'-0':String(v);
    case 'bigint':return v+'n';
    case 'symbol':return v.toString();
    case 'function':return v.name?'[Function: '+v.name+']':'[Function (anonymous)]';
    case 'object':break;
    default:return String(v);
  }
  if(v===null)return 'null';
  const t=tagOf(v);
  if(isRe(v))return String(v);
  if(t==='Date')return isNaN(v)?'Invalid Date':v.toISOString();
  if(t==='Error')return '['+String(v)+']';
  // shortcut: every cycle is numbered *1; Node numbers each distinct one.
  if(anc.includes(v)){hit.add(v);return '[Circular *1]'}
  const sub=x=>inspect(x,multi,ind+'  ',anc.concat([v]),hit);
  let ents,o='{',c='}',pre='';
  if(Array.isArray(v)){ents=Array.from(v,sub);o='[';c=']'}
  else if(t==='Map'){ents=[...v].map(([k,x])=>sub(k)+' => '+sub(x));pre='Map('+v.size+') '}
  else if(t==='Set'){ents=[...v].map(sub);pre='Set('+v.size+') '}
  else{
    ents=Object.keys(v).map(k=>(IDENT.test(k)?k:quote(k))+': '+sub(v[k]));
    const n=v.constructor&&v.constructor.name;if(n&&n!=='Object')pre=n+' ';
  }
  if(!ents.length)return pre+o+c;
  const ref=hit.has(v)?'<ref *1> ':'';
  const one=pre+o+' '+ents.join(', ')+' '+c;
  if(!multi&&one.length<=72&&!one.includes('\n'))return ref+one;
  return ref+pre+o+'\n'+ents.map(e=>ind+'  '+e).join(',\n')+'\n'+ind+c;
}

function deepEq(a,b,strict,seen){
  if(strict?Object.is(a,b):(a==b||(a!==a&&b!==b)))return true;
  if(typeof a!=='object'||typeof b!=='object'||!a||!b)return false;
  if(strict&&Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return false;
  const t=tagOf(a);
  if(t!==tagOf(b)||Array.isArray(a)!==Array.isArray(b))return false;
  if(t==='Date')return a.getTime()===b.getTime();
  if(isRe(a))return String(a)===String(b);
  if(t==='Error'&&(a.message!==b.message||a.name!==b.name))return false;
  seen=seen||[];
  if(seen.some(p=>p[0]===a&&p[1]===b))return true;
  seen=seen.concat([[a,b]]);
  if(t==='Set'){if(a.size!==b.size)return false;return [...a].every(x=>b.has(x)||[...b].some(y=>deepEq(x,y,strict,seen)))}
  if(t==='Map'){if(a.size!==b.size)return false;return [...a].every(([k,x])=>b.has(k)&&deepEq(x,b.get(k),strict,seen))}
  const ka=Object.keys(a),kb=Object.keys(b);
  if(ka.length!==kb.length)return false;
  return ka.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&deepEq(a[k],b[k],strict,seen));
}

// Prefix and suffix trimming only: enough for the common one-difference case, not Node's full diff.
function diff(a,b){
  const la=inspect(a,true).split('\n'),lb=inspect(b,true).split('\n');
  let p=0;while(p<la.length&&p<lb.length&&la[p]===lb[p])p++;
  let s=0;while(s<la.length-p&&s<lb.length-p&&la[la.length-1-s]===lb[lb.length-1-s])s++;
  return [...la.slice(0,p).map(x=>'  '+x),...la.slice(p,la.length-s).map(x=>'+ '+x),...lb.slice(p,lb.length-s).map(x=>'- '+x),...la.slice(la.length-s).map(x=>'  '+x)].join('\n');
}

function makeAssert(R){
  const Base=R.w.Error||Error;
  class AssertionError extends Base{
    constructor(o){
      super(o.message!==undefined?String(o.message):o.gen);
      this.generatedMessage=o.message===undefined;this.code='ERR_ASSERTION';
      this.actual=o.actual;this.expected=o.expected;this.operator=o.operator;
    }
    get name(){return 'AssertionError'}
  }
  const bad=(m,gen,actual,expected,operator)=>{
    if(isErr(m))throw m;
    throw new AssertionError({message:m,gen,actual,expected,operator});
  };
  // Node marks these messages as written by the caller, so generatedMessage is false even without one.
  const own=(m,text)=>isErr(m)?m:text;
  const typeErr=(code,text)=>{const e=new (R.w.TypeError||TypeError)(text);e.code=code;return e};
  const one=(a,b)=>!inspect(a).includes('\n')&&!inspect(b).includes('\n')&&typeof a!=='object'&&typeof b!=='object';
  const nameOf=x=>typeof x==='function'&&x.name?' ('+x.name+')':'';
  const msgOf=e=>e&&e.message!==undefined?e.message:e;

  function ok(...a){
    if(!a.length)return bad(undefined,'No value argument passed to `assert.ok()`',undefined,true,'==');
    if(!a[0])bad(a[1],'The expression evaluated to a falsy value:\n\n  assert.ok('+inspect(a[0])+')\n',a[0],true,'==');
  }
  const assert=(...a)=>ok(...a);
  const strictEqual=(a,b,m)=>{
    if(Object.is(a,b))return;
    const same=a&&b&&typeof a==='object'&&typeof b==='object'&&deepEq(a,b,true);
    bad(m,same?'Values have same structure but are not reference-equal:\n\n'+inspect(a,true)+'\n'
      :one(a,b)||typeof a!==typeof b&&!inspect(a).includes('\n')&&!inspect(b).includes('\n')?'Expected values to be strictly equal:\n\n'+inspect(a)+' !== '+inspect(b)+'\n'
      :'Expected values to be strictly equal:\n+ actual - expected\n\n'+diff(a,b)+'\n',a,b,'strictEqual');
  };
  const deepStrictEqual=(a,b,m)=>{
    if(deepEq(a,b,true))return;
    bad(m,one(a,b)?'Expected values to be strictly deep-equal:\n\n'+inspect(a)+' !== '+inspect(b)+'\n'
      :'Expected values to be strictly deep-equal:\n+ actual - expected\n\n'+diff(a,b)+'\n',a,b,'deepStrictEqual');
  };

  // Calls fn and returns the error it threw, or the marker NONE.
  const NONE={};
  const caught=fn=>{try{fn()}catch(e){return e}return NONE};
  function matches(err,expected,m,op){
    if(expected===undefined)return;
    if(isRe(expected)){
      if(expected.test(String(err)))return;
      bad(m,'The input did not match the regular expression '+expected+'. Input:\n\n'+inspect(String(err))+'\n',err,expected,op);
    }
    if(typeof expected==='function'){
      if(expected.prototype!==undefined&&err instanceof expected)return;
      const E=R.w.Error||Error;
      if(expected===E||E.prototype.isPrototypeOf(expected.prototype))
        bad(m,'The error is expected to be an instance of "'+expected.name+'". Received "'+(err&&err.constructor&&err.constructor.name)+'"\n\nError message:\n\n'+msgOf(err),err,expected,op);
      const r=expected.call({},err);
      if(r!==true)bad(m,'The '+(expected.name?'"'+expected.name+'" ':'')+'validation function is expected to return "true". Received '+inspect(r)+'\n\nCaught error:\n\n'+err,err,expected,op);
      return;
    }
    if(expected&&typeof expected==='object'){
      const keys=Object.keys(expected);if(isErr(expected))keys.push('name','message');
      const got={},want={};
      for(const k of keys){
        got[k]=err==null?undefined:err[k];want[k]=expected[k];
        if(isRe(expected[k])&&typeof got[k]==='string'?expected[k].test(got[k]):deepEq(got[k],expected[k],true))continue;
        bad(m,'Expected values to be strictly deep-equal:\n+ actual - expected\n\n'+diff(got,want)+'\n',err,expected,op);
      }
      return;
    }
    throw typeErr('ERR_INVALID_ARG_TYPE','The "expected" argument must be of type function or an instance of Error, RegExp, or Object. Received '+inspect(expected));
  }
  const split=(expected,m)=>typeof expected==='string'?[undefined,expected]:[expected,m];
  const missing=(what,expected,m)=>m===undefined?'Missing expected '+what+nameOf(expected)+'.':'Missing expected '+what+': '+m;
  const unwanted=(what,e,m)=>'Got unwanted '+what+(m===undefined?'.':': '+m)+'\nActual message: "'+msgOf(e)+'"';
  const regexp=(s,re,m,want,op)=>{
    if(typeof s!=='string')return bad(m,'The "string" argument must be of type string. Received '+(s==null?inspect(s):'type '+typeof s+' ('+inspect(s)+')'),s,re,op);
    if(!isRe(re))throw typeErr('ERR_INVALID_ARG_TYPE','The "regexp" argument must be an instance of RegExp. Received '+inspect(re));
    if(re.test(s)===want)return;
    bad(m,(want?'The input did not match the regular expression ':'The input was expected to not match the regular expression ')+re+'. Input:\n\n'+inspect(s)+'\n',s,re,op);
  };

  Object.assign(assert,{
    AssertionError,ok,
    equal:(a,b,m)=>{if(!(a==b||(a!==a&&b!==b)))bad(m,inspect(a)+' == '+inspect(b),a,b,'==')},
    notEqual:(a,b,m)=>{if(a==b||(a!==a&&b!==b))bad(m,inspect(a)+' != '+inspect(b),a,b,'!=')},
    strictEqual,
    notStrictEqual:(a,b,m)=>{if(Object.is(a,b))bad(m,'Expected "actual" to be strictly unequal to: '+inspect(b),a,b,'notStrictEqual')},
    deepEqual:(a,b,m)=>{if(!deepEq(a,b,false))bad(m,'Expected values to be loosely deep-equal:\n\n'+inspect(a,true)+'\n\nshould loosely deep-equal\n\n'+inspect(b,true),a,b,'deepEqual')},
    notDeepEqual:(a,b,m)=>{if(deepEq(a,b,false))bad(m,'Expected "actual" not to be loosely deep-equal to:\n\n'+inspect(b,true),a,b,'notDeepEqual')},
    deepStrictEqual,
    notDeepStrictEqual:(a,b,m)=>{if(deepEq(a,b,true))bad(m,'Expected "actual" not to be strictly deep-equal to:\n\n'+inspect(b,true)+'\n',a,b,'notDeepStrictEqual')},
    throws(fn,expected,m){
      [expected,m]=split(expected,m);
      const e=caught(fn);
      if(e===NONE)bad(own(m,missing('exception',expected,m)),'',undefined,expected,'throws');
      matches(e,expected,m,'throws');
    },
    doesNotThrow(fn,expected,m){
      [expected,m]=split(expected,m);
      const e=caught(fn);
      if(e!==NONE)bad(own(m,unwanted('exception',e,m)),'',e,expected,'doesNotThrow');
    },
    async rejects(p,expected,m){
      [expected,m]=split(expected,m);
      let e=NONE;
      try{await (typeof p==='function'?p():p)}catch(x){e=x}
      if(e===NONE)bad(own(m,missing('rejection',expected,m)),'',undefined,expected,'rejects');
      matches(e,expected,m,'rejects');
    },
    async doesNotReject(p,expected,m){
      [expected,m]=split(expected,m);
      try{await (typeof p==='function'?p():p)}catch(e){bad(own(m,unwanted('rejection',e,m)),'',e,expected,'doesNotReject')}
    },
    match:(s,re,m)=>regexp(s,re,m,true,'match'),
    doesNotMatch:(s,re,m)=>regexp(s,re,m,false,'doesNotMatch'),
    fail:m=>bad(m,'Failed',undefined,undefined,'fail'),
    ifError:v=>{if(v!=null)bad('ifError got unwanted exception: '+(v&&v.message!==undefined?v.message:inspect(v)),'',v,null,'ifError')},
  });
  const strict=(...a)=>ok(...a);
  Object.assign(strict,assert,{equal:strictEqual,notEqual:assert.notStrictEqual,deepEqual:deepStrictEqual,notDeepEqual:assert.notDeepStrictEqual});
  assert.strict=strict;strict.strict=strict;
  return {assert,strict};
}

const mkNode=(name,fn,suite)=>({name,fn,suite,kids:[],b:[],a:[],be:[],ae:[]});
const argsOf=(name,o,fn)=>typeof name==='function'?['<anonymous>',name]:[name,typeof o==='function'?o:fn];

// api: R, sch() (the scheduler), process, file, out(text), idle(fn). Tests run one after another from a setImmediate
// after the main file, and a hold on the scheduler keeps the loop alive until the summary is printed.
function makeTest(api){
  const {sch,process,file,out}=api;
  const top=mkNode('',null,true);
  let cur=top,armed=false,stuck=null;
  api.idle(()=>{if(stuck)stuck()});

  // The scheduler parks when nothing is queued; a test still waiting then can never finish.
  const guarded=fn=>new Promise((res,rej)=>{
    stuck=()=>{stuck=null;const e=new Error('Promise resolution is still pending but the event loop has already resolved');e.code='ERR_TEST_FAILURE';rej(e)};
    let r;try{r=fn()}catch(e){stuck=null;return rej(e)}
    Promise.resolve(r).then(v=>{stuck=null;res(v)},e=>{stuck=null;rej(e)});
  });
  const hooks=async(list,ctx)=>{for(const h of list)await guarded(()=>h.call(ctx,ctx))};
  const entry=(node,suite)=>({name:node.name,ok:true,err:null,dur:0,kids:[],suite,own:true});
  const settle=(e,t0)=>{e.dur=sch().now()-t0;return e};

  async function runTest(node,anc){
    const e=entry(node,false),t0=sch().now();
    const ctx={name:node.name,diagnostic(){},
      async test(n,o,f){
        [n,f]=argsOf(n,o,f);
        const k=await runTest(mkNode(n,f,false),[]);
        e.kids.push(k);return k;
      }};
    sch().resetGuard();
    try{
      for(const s of anc)await hooks(s.be,ctx);
      await guarded(()=>node.fn.call(ctx,ctx));
    }catch(x){e.ok=false;e.err=x}
    for(const s of [...anc].reverse()){
      try{await hooks(s.ae,ctx)}catch(x){if(e.ok){e.ok=false;e.err=x}}
    }
    if(e.ok&&e.kids.some(k=>!k.ok)){e.ok=false;e.own=false;e.err=new Error(e.kids.filter(k=>!k.ok).length+' subtest'+(e.kids.filter(k=>!k.ok).length>1?'s':'')+' failed')}
    return settle(e,t0);
  }
  async function runSuite(node,anc){
    const e=entry(node,true),t0=sch().now();
    try{await hooks(node.b,{name:node.name})}
    catch(x){e.ok=false;e.err=x;e.cancelled=count(node);return settle(e,t0)}
    for(const k of node.kids){
      const r=k.suite?await runSuite(k,[...anc,node]):await runTest(k,[...anc,node]);
      e.kids.push(r);if(!r.ok)e.ok=false;
    }
    try{await hooks(node.a,{name:node.name})}catch(x){e.ok=false;e.err=x}
    return settle(e,t0);
  }
  const count=n=>n.kids.reduce((s,k)=>s+(k.suite?count(k):1),0);

  const mark=e=>(e.ok?'✔':'✖');
  const show=(e,d,o)=>{
    const ind='  '.repeat(d);
    if(e.kids.length||e.suite)o.push(ind+'▶ '+e.name);
    e.kids.forEach(k=>show(k,d+1,o));
    o.push(ind+mark(e)+' '+e.name+' ('+e.dur+'ms)');
  };
  const walk=(e,f)=>{f(e);e.kids.forEach(k=>walk(k,f))};
  const errText=x=>{
    const head=isErr(x)?(x.name==='AssertionError'?'AssertionError [ERR_ASSERTION]':x.name)+': '+x.message:'Error: '+inspect(x);
    return head.split('\n').map(l=>'  '+l);
  };

  async function go(){
    const t0=sch().now();
    const res=await runSuite(top,[]);
    const lines=[];
    res.kids.forEach(k=>show(k,0,lines));
    let tests=0,suites=0,pass=0,fail=0,cancelled=res.cancelled||0;
    const failed=[];
    res.kids.forEach(k=>walk(k,e=>{
      cancelled+=e.cancelled||0;
      if(e.suite){suites++;return}
      tests++;if(e.ok)pass++;else fail++;
      if(!e.ok&&e.own)failed.push(e);
    }));
    lines.push('ℹ tests '+tests,'ℹ suites '+suites,'ℹ pass '+pass,'ℹ fail '+fail,'ℹ cancelled '+cancelled,'ℹ skipped 0','ℹ todo 0','ℹ duration_ms '+(sch().now()-t0));
    if(failed.length){
      lines.push('','✖ failing tests:','');
      for(const e of failed)lines.push('test at '+file,'✖ '+e.name+' ('+e.dur+'ms)',...errText(e.err),'');
      lines.pop();
    }
    lines.forEach(l=>out(l));
    if(fail||cancelled||res.kids.some(k=>!k.ok))process.exitCode=1;
    sch().unref();
  }
  const arm=()=>{if(armed)return;armed=true;sch().ref();sch().setImmediate(go)};

  const add=(name,o,fn)=>{[name,fn]=argsOf(name,o,fn);cur.kids.push(mkNode(name,fn,false));arm()};
  const describe=(name,o,fn)=>{
    [name,fn]=argsOf(name,o,fn);
    const n=mkNode(name,fn,true),prev=cur;
    cur.kids.push(n);cur=n;arm();
    try{fn()}finally{cur=prev}
  };
  const hook=k=>fn=>{cur[k].push(fn)};
  const test=add;
  return Object.assign(test,{test,it:add,describe,suite:describe,before:hook('b'),after:hook('a'),beforeEach:hook('be'),afterEach:hook('ae')});
}

function make(api){
  const {assert,strict}=makeAssert(api.R);
  return {assert,'assert/strict':strict,'node:test':makeTest(api)};
}
root.NodeTest={make};
})(typeof window !== 'undefined' ? window : globalThis);
