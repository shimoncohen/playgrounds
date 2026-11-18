(function (root) {
'use strict';
// looked up at call time so the load order of the realm file does not matter
const runScript=(R,code)=>root.JSRealm.runScript(R,code);
class FakeBuffer{constructor(s){this._s=String(s)}toString(){return this._s}get length(){return this._s.length}}

/* ---------- virtual Node.js ---------- */
const NODE_VERSION='v22.12.0';
const COWSAY=(text)=>{const t=String(text);const bar='_'.repeat(t.length+2),low='-'.repeat(t.length+2);
  return ' '+bar+'\n< '+t+' >\n '+low+'\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||'};
function makeNodeEnv(R,vfs,file,args,io){
  const cwd='/home/you/my-app';
  const cache={};
  const norm=p=>String(p).replace(/^\.\//,'').replace(/^\/home\/you\/my-app\//,'');
  const enoent=(p,op)=>{const e=new Error("ENOENT: no such file or directory, "+op+" '"+p+"'");e.code='ENOENT';return e};
  // The scheduler is created on first use, so a sync-only run needs no Scheduler global.
  let S=null;
  const sch=()=>S||(S=root.Scheduler.create({hop:io.hop,alive:()=>!R.silent,io}));
  const charge=ms=>{if(root.Scheduler)sch().charge(ms)};
  const COST=()=>root.Scheduler?root.Scheduler.COST:{FS_BASE_MS:0,BYTES_PER_MS:1,META_MS:0};
  const cost=bytes=>{const C=COST();return C.FS_BASE_MS+Math.ceil(bytes/C.BYTES_PER_MS)};
  const readRaw=(p,enc)=>{const k=norm(p);if(!(k in vfs.files))throw enoent(p,'open');const enc2=typeof enc==='object'&&enc?enc.encoding:enc;return enc2?vfs.files[k]:new FakeBuffer(vfs.files[k])};
  const writeRaw=(p,data)=>{const k=norm(p);if(k.includes('/'))throw enoent(p,'open');vfs.write(k,String(data))};
  const meta=v=>{charge(COST().META_MS);return v};
  const fs={
    readFileSync(p,enc){const r=readRaw(p,enc);charge(cost(vfs.files[norm(p)].length));return r},
    writeFileSync(p,data){writeRaw(p,data);charge(cost(String(data).length))},
    appendFileSync(p,data){const k=norm(p);vfs.write(k,(vfs.files[k]||'')+String(data));charge(cost(String(data).length))},
    existsSync(p){return meta(norm(p) in vfs.files||norm(p)==='node_modules'&&vfs.hasModules())},
    readdirSync(){return meta(vfs.list())},
    unlinkSync(p){const k=norm(p);if(!(k in vfs.files))throw enoent(p,'unlink');vfs.remove(k);meta()},
  };
  // Cost is fixed when the call is made, from the file's current size; the data is read or written at completion.
  const readCost=p=>{const f=vfs.files[norm(p)];return f===undefined?COST().META_MS:cost(f.length)};
  // The realm's own Promise: awaiting a promise from another realm costs extra microtask turns.
  const later=(ms,work)=>new (R.w.Promise||Promise)((res,rej)=>sch().queueIO(ms,()=>{try{res(work())}catch(er){rej(er)}}));
  fs.promises={
    readFile:(p,e)=>later(readCost(p),()=>readRaw(p,e||'utf8')),
    writeFile:(p,d)=>later(cost(String(d).length),()=>writeRaw(p,d)),
  };
  fs.readFile=(p,e,cb)=>{if(typeof e==='function'){cb=e;e=null}
    sch().queueIO(readCost(p),()=>{let r;try{r=readRaw(p,e)}catch(er){return cb(er)}cb(null,r)})};
  const path={join:(...a)=>a.join('/').replace(/\/+/g,'/').replace(/\/\.\//g,'/'),basename:(p,ext)=>{let b=String(p).split('/').pop();if(ext&&b.endsWith(ext))b=b.slice(0,-ext.length);return b},extname:p=>{const m=String(p).match(/\.[^./]+$/);return m?m[0]:''},dirname:p=>String(p).split('/').slice(0,-1).join('/')||'.',resolve:(...a)=>cwd+'/'+a.join('/'),sep:'/'};
  const os={platform:()=>'linux',homedir:()=>'/home/you',userInfo:()=>({username:'you'}),EOL:'\n',cpus:()=>[{model:'Playground CPU'}]};
  const process={argv:['/usr/local/bin/node',cwd+'/'+file,...args],env:{HOME:'/home/you',USER:'you',NODE_ENV:'development'},platform:'linux',version:NODE_VERSION,versions:{node:NODE_VERSION.slice(1)},cwd:()=>cwd,pid:4242,
    // the scheduler records the exit and drops its queues; silencing the realm drops promise jobs already queued
    exit:(c=0)=>{if(root.Scheduler)sch().exit(c);R.silent=true;const e=new Error('__exit__');e.__exit=c;throw e},
    nextTick:(f,...a)=>sch().nextTick(f,...a),
    stdout:{write:s=>{if(!R.silent)io.out('raw',[String(s).replace(/\n$/,'')]);return true}}};
  const fw=n=>(...a)=>sch()[n](...a);
  const RDate=R.w.Date||Date;
  const VDate=new Proxy(RDate,{
    construct:(t,a,nt)=>a.length?Reflect.construct(t,a,nt):new t(vnow()),
    get:(t,k)=>k==='now'?vnow:Reflect.get(t,k),
  });
  const vnow=()=>root.Scheduler?sch().dateNow():RDate.now();
  const shadows=[fw('setTimeout'),fw('setInterval'),fw('setImmediate'),fw('clearTimeout'),fw('clearInterval'),fw('clearImmediate'),VDate,process,fw('guardTick')];
  const builtins={fs,path,os,process};
  function require(spec){
    spec=String(spec).replace(/^node:/,'');
    if(spec in builtins)return builtins[spec];
    if(/^\.\.?\//.test(spec)){
      let k=norm(spec);if(!(k in vfs.files)&&(k+'.js') in vfs.files)k+='.js';
      if(!(k in vfs.files)&&(k+'.json') in vfs.files)k+='.json';
      if(!(k in vfs.files)){const e=new Error("Cannot find module '"+spec+"'");e.code='MODULE_NOT_FOUND';throw e}
      if(k.endsWith('.json'))return JSON.parse(vfs.files[k]);
      return loadModule(k);
    }
    if(spec==='cowsay'&&vfs.installed('cowsay'))return {say:o=>COWSAY(o&&o.text!==undefined?o.text:o),think:o=>COWSAY(o&&o.text!==undefined?o.text:o).replace(/\\/g,'o')};
    const e=new Error("Cannot find module '"+spec+"'"+(spec==='cowsay'?'\n(Install it first: npm install cowsay)':''));e.code='MODULE_NOT_FOUND';throw e;
  }
  function loadModule(k,code){
    if(cache[k])return cache[k].exports;
    const module={exports:{}};cache[k]=module;
    R.w.__defs=R.w.__defs||{};
    const src=code!==undefined?code:vfs.files[k];
    if(k.endsWith('.json')){module.exports=JSON.parse(src);return module.exports}
    const parse=root.acorn&&root.Scheduler?s=>root.acorn.parse(s,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true}):null;
    const body=root.Scheduler?root.Scheduler.guardSource(src,parse):src;
    // The shadows are parameters of an outer function so learner code can declare the same names; no newline keeps line numbers.
    const er=runScript(R,'__defs['+JSON.stringify(k)+']=function(setTimeout,setInterval,setImmediate,clearTimeout,clearInterval,clearImmediate,Date,process,'+(root.Scheduler?root.Scheduler.GUARD_NAME:'')+'){return function(require,module,exports,__filename,__dirname){'+body+'\n}}');
    if(er){delete cache[k];er.__file=k;throw er}
    R.w.__defs[k](...shadows)(require,module,module.exports,cwd+'/'+k,cwd);
    return module.exports;
  }
  function runMain(k,code){const s=sch();s.resetGuard();loadModule(k,code);s.drainTicks();s.start()}
  return {require,loadModule,process,runMain,stop:()=>{if(S)S.stop()}};
}
root.NodeEnv={NODE_VERSION,FakeBuffer,make:makeNodeEnv};
})(typeof window !== 'undefined' ? window : globalThis);
