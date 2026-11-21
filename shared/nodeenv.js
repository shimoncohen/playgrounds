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
  const cache=Object.create(null);
  const norm=p=>String(p).replace(/^\.\//,'').replace(/^\/home\/you\/my-app\//,'');
  const ioErr=(code,text,op,p)=>{const e=new Error(code+': '+text+', '+op+(p===undefined?'':" '"+p+"'"));e.code=code;return e};
  const enoent=(p,op)=>ioErr('ENOENT','no such file or directory',op,p);
  // The scheduler is created on first use, so a sync-only run needs no Scheduler global.
  let S=null,bad=false,exited=false;
  const servers=new Map(),pend=new Set();
  const failPend=code=>{for(const p of [...pend])p.settle({code})};
  const teardown=()=>{failPend(28);servers.clear()};
  // Exit listeners run only after a clean end: not after Stop, an uncaught error or a loop-guard stop.
  const sio={...io,
    asyncErr(e){bad=true;if(io.asyncErr)io.asyncErr(e)},
    sys(t){bad=true;if(io.sys)io.sys(t)},
    idle(b){if(b){failPend(28);idleFns.forEach(f=>f())}if(io.idle)io.idle(b)},
    done(){if(!bad&&!exited&&!R.silent){runExit(process.exitCode||0);if(io.exit&&process.exitCode)io.exit(process.exitCode)}teardown();if(io.done)io.done()}};
  const idleFns=[];
  const sch=()=>S||(S=root.Scheduler.create({hop:io.hop,alive:()=>!R.silent,io:sio}));
  const charge=ms=>{if(root.Scheduler)sch().charge(ms)};
  const COST=()=>root.Scheduler?root.Scheduler.COST:{FS_BASE_MS:0,BYTES_PER_MS:1,META_MS:0};
  const cost=bytes=>{const C=COST();return C.FS_BASE_MS+Math.ceil(bytes/C.BYTES_PER_MS)};
  // POSIX path, ported from Node's algorithms so edge cases match.
  const segs=(p,above)=>{const o=[];for(const s of p.split('/')){if(!s||s==='.')continue;if(s==='..'){if(o.length&&o[o.length-1]!=='..')o.pop();else if(above)o.push('..')}else o.push(s)}return o.join('/')};
  const path={sep:'/',delimiter:':',
    normalize(p){p=String(p);if(!p)return '.';const abs=p[0]==='/',r=segs(p,!abs);if(!r)return abs?'/':p.endsWith('/')?'./':'.';return (abs?'/':'')+r+(p.endsWith('/')?'/':'')},
    join(...a){const j=a.map(String).filter(Boolean).join('/');return j?path.normalize(j):'.'},
    isAbsolute:p=>String(p)[0]==='/',
    resolve(...a){let r='';for(let i=a.length-1;i>=0&&r[0]!=='/';i--){const s=String(a[i]);if(s)r=s+(r?'/'+r:'')}if(r[0]!=='/')r=cwd+(r?'/'+r:'');return '/'+segs(r,false)},
    relative(f,t){const a=path.resolve(f).split('/').filter(Boolean),b=path.resolve(t).split('/').filter(Boolean);let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;return [...a.slice(i).map(()=>'..'),...b.slice(i)].join('/')},
    dirname(p){p=String(p);if(!p)return '.';const abs=p[0]==='/';let end=-1,m=true;for(let i=p.length-1;i>=1;i--){if(p[i]==='/'){if(!m){end=i;break}}else m=false}if(end===-1)return abs?'/':'.';if(abs&&end===1)return '//';return p.slice(0,end)},
    basename(p,ext){p=String(p);const t=p.replace(/\/+$/,''),b=t.slice(t.lastIndexOf('/')+1);if(ext===undefined||ext===''||ext===p)return ext===p&&ext?'':b;return b!==ext&&b.endsWith(ext)?b.slice(0,-ext.length):b},
    extname(p){const t=String(p).replace(/\/+$/,''),b=t.slice(t.lastIndexOf('/')+1),i=b.lastIndexOf('.');return i<=0||b==='..'?'':b.slice(i)},
    parse(p){p=String(p);const r={root:'',dir:'',base:'',ext:'',name:''};if(!p)return r;const abs=p[0]==='/';if(abs)r.root='/';
      const t=p.replace(/\/+$/,'');if(!t){r.dir=abs?'/':'';return r}
      const i=t.lastIndexOf('/');r.base=t.slice(i+1);r.dir=i<0?'':i===0?'/':t.slice(0,i);r.ext=path.extname(r.base);r.name=r.base.slice(0,r.base.length-r.ext.length);return r},
    format(o){const d=o.dir||o.root,b=o.base||(o.name||'')+(o.ext?(o.ext[0]==='.'?'':'.')+o.ext:'');return !d?b:d===o.root?d+b:d+'/'+b},
  };
  path.posix=path;
  // Folders are marker keys 'name/' or implied by any key 'name/…'; the root always exists.
  const key=p=>{const a=path.resolve(p);return a===cwd?'':a.startsWith(cwd+'/')?a.slice(cwd.length+1):a};
  const has=k=>Object.prototype.hasOwnProperty.call(vfs.files,k);
  const isFileK=k=>k!==''&&!k.endsWith('/')&&has(k);
  const isDirK=k=>k===''||(k==='node_modules'&&vfs.hasModules())||has(k+'/')||Object.keys(vfs.files).some(x=>x.startsWith(k+'/'));
  const parentOf=k=>k.includes('/')?k.slice(0,k.lastIndexOf('/')):'';
  const byteLen=s=>{let n=0;for(const c of s){const x=c.codePointAt(0);n+=x<128?1:x<2048?2:x<65536?3:4}return n};
  const isDirErr=(k,op,p)=>{if(isDirK(k))throw ioErr('EISDIR','illegal operation on a directory',op,p)};
  const readRaw=(p,enc)=>{const k=key(p);isDirErr(k,'read');if(!isFileK(k))throw enoent(p,'open');const enc2=typeof enc==='object'&&enc?enc.encoding:enc;return enc2?vfs.files[k]:new FakeBuffer(vfs.files[k])};
  const writeRaw=(p,data)=>{const k=key(p);isDirErr(k,'open',p);if(!isDirK(parentOf(k)))throw enoent(p,'open');vfs.write(k,String(data))};
  const appendRaw=(p,data)=>{const k=key(p);isDirErr(k,'open',p);if(!isDirK(parentOf(k)))throw enoent(p,'open');vfs.write(k,(isFileK(k)?vfs.files[k]:'')+String(data))};
  // The default '.' keeps the earlier no-argument readdirSync() working.
  const listDir=(p='.')=>{const k=key(p);if(!isDirK(k))throw isFileK(k)?ioErr('ENOTDIR','not a directory','scandir',p):enoent(p,'scandir');
    const pre=k?k+'/':'',names=new Set();
    for(const x of Object.keys(vfs.files))if(x.startsWith(pre)&&x!==pre)names.add(x.slice(pre.length).split('/')[0]);
    if(k===''&&vfs.hasModules())names.add('node_modules');
    return [...names].sort()};
  const statOf=p=>{const k=key(p);
    if(isDirK(k))return {size:4096,isFile:()=>false,isDirectory:()=>true};
    if(!isFileK(k))throw enoent(p,'stat');
    return {size:byteLen(vfs.files[k]),isFile:()=>true,isDirectory:()=>false}};
  // The marker keeps a folder that would vanish with its last file, as on a real disk.
  const unlinkRaw=p=>{const k=key(p);isDirErr(k,'unlink',p);if(!isFileK(k))throw enoent(p,'unlink');vfs.remove(k);const par=parentOf(k);if(par&&!isDirK(par))vfs.write(par+'/','')};
  const mkdirRaw=(p,o)=>{const k=key(p),rec=!!(o&&o.recursive),eexist=()=>ioErr('EEXIST','file already exists','mkdir',p);
    if(isFileK(k))throw eexist();
    if(isDirK(k)){if(!rec)throw eexist();if(k!==''&&!has(k+'/'))vfs.write(k+'/','');return}
    if(!rec&&!isDirK(parentOf(k)))throw enoent(p,'mkdir');
    vfs.write(k+'/','')};
  const meta=v=>{charge(COST().META_MS);return v};
  // Cost is fixed when the call is made, from the file's current size; the effect applies at completion.
  const readCost=p=>{const f=vfs.files[key(p)];return typeof f!=='string'?COST().META_MS:cost(byteLen(f))};
  const dataCost=(p,d)=>cost(byteLen(String(d)));
  const OPS={readFile:[readRaw,readCost],writeFile:[writeRaw,dataCost],appendFile:[appendRaw,dataCost],readdir:[listDir],stat:[statOf],unlink:[unlinkRaw],mkdir:[mkdirRaw]};
  // The realm's own Promise: awaiting a promise from another realm costs extra microtask turns.
  const later=(ms,work)=>new (R.w.Promise||Promise)((res,rej)=>sch().queueIO(ms,()=>{try{res(work())}catch(er){rej(er)}}));
  const fs={existsSync(p){const k=key(p);return meta(isFileK(k)||isDirK(k))},promises:{}};
  for(const n of Object.keys(OPS)){
    const [run,price]=OPS[n],ms=(...a)=>price?price(...a):COST().META_MS;
    fs[n+'Sync']=(...a)=>{const c=ms(...a),r=run(...a);charge(c);return r};
    fs.promises[n]=(...a)=>later(ms(...a),()=>run(...a));
    fs[n]=(...a)=>{const cb=a.pop();
      if(typeof cb!=='function'){const e=new TypeError('The "cb" argument must be of type function.');e.code='ERR_INVALID_ARG_TYPE';throw e}
      sch().queueIO(ms(...a),()=>{let r;try{r=run(...a)}catch(er){return cb(er)}if(r===undefined)cb(null);else cb(null,r)})};
  }
  fs.promises.readFile=(p,e)=>later(readCost(p),()=>readRaw(p,e||'utf8'));
  const os={platform:()=>'linux',homedir:()=>'/home/you',userInfo:()=>({username:'you'}),EOL:'\n',cpus:()=>[{model:'Playground CPU'}]};
  // ---- events ----
  const RA=R.w.Array||Array,lm=new WeakMap();
  const isErr=e=>Object.prototype.toString.call(e)==='[object Error]';
  const lst=(o,n,mk)=>{let m=lm.get(o);if(!m){m=new Map();lm.set(o,m)}let l=m.get(n);if(!l&&mk){l=[];m.set(n,l)}return l};
  const add=(o,n,fn,once,front)=>{
    if(typeof fn!=='function'){const e=new TypeError('The "listener" argument must be of type function.');e.code='ERR_INVALID_ARG_TYPE';throw e}
    const l=lst(o,n,true),x={fn,once};if(front)l.unshift(x);else l.push(x);return o};
  const drop=(o,n,x)=>{const m=lm.get(o),l=m&&m.get(n);if(!l)return;const i=l.indexOf(x);if(i>=0)l.splice(i,1);if(!l.length)m.delete(n)};
  class EventEmitter{
    on(n,f){return add(this,n,f,false,false)}
    addListener(n,f){return add(this,n,f,false,false)}
    once(n,f){return add(this,n,f,true,false)}
    prependListener(n,f){return add(this,n,f,false,true)}
    prependOnceListener(n,f){return add(this,n,f,true,true)}
    off(n,f){return this.removeListener(n,f)}
    removeListener(n,f){const l=lst(this,n);if(l)for(let i=l.length-1;i>=0;i--)if(l[i].fn===f){drop(this,n,l[i]);break}return this}
    removeAllListeners(n){if(n===undefined)lm.delete(this);else{const m=lm.get(this);if(m)m.delete(n)}return this}
    emit(n,...a){
      const l=lst(this,n);
      if(!l||!l.length){
        if(n!=='error')return false;
        const er=a[0];if(isErr(er))throw er;
        const e=new Error('Unhandled error. ('+(typeof er==='string'?"'"+er+"'":String(er))+')');e.code='ERR_UNHANDLED_ERROR';e.context=er;throw e;
      }
      for(const x of l.slice()){if(x.once)drop(this,n,x);x.fn.apply(this,a)}
      return true}
    listenerCount(n){const l=lst(this,n);return l?l.length:0}
    listeners(n){const l=lst(this,n);return RA.from(l?l.map(x=>x.fn):[])}
    eventNames(){const m=lm.get(this);return RA.from(m?m.keys():[])}
  }
  EventEmitter.EventEmitter=EventEmitter;
  // ---- http: servers live in `servers` (port to server) and requests come from curl ----
  const STATUS_CODES={200:'OK',201:'Created',204:'No Content',301:'Moved Permanently',302:'Found',400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',500:'Internal Server Error',503:'Service Unavailable'};
  const hdrSent=()=>{const e=new Error('Cannot set headers after they are sent to the client');e.code='ERR_HTTP_HEADERS_SENT';return e};
  const HS=new WeakMap();
  class ServerResponse extends EventEmitter{
    constructor(done){super();this.statusCode=200;this.statusMessage=undefined;this.headersSent=false;this.writableEnded=false;HS.set(this,{h:new Map(),body:'',wrote:false,done})}
    setHeader(n,v){if(this.headersSent)throw hdrSent();HS.get(this).h.set(String(n).toLowerCase(),[String(n),Array.isArray(v)?v.join(', '):String(v)]);return this}
    getHeader(n){const x=HS.get(this).h.get(String(n).toLowerCase());return x&&x[1]}
    hasHeader(n){return HS.get(this).h.has(String(n).toLowerCase())}
    removeHeader(n){if(this.headersSent)throw hdrSent();HS.get(this).h.delete(String(n).toLowerCase())}
    writeHead(code,a,b){
      if(this.headersSent)throw hdrSent();
      this.statusCode=code;let h=b;if(typeof a==='string')this.statusMessage=a;else h=a;
      if(h)for(const k of Object.keys(h))this.setHeader(k,h[k]);
      this.headersSent=true;return this}
    write(c){const s=HS.get(this);if(this.writableEnded)return false;this.headersSent=true;s.wrote=true;s.body+=String(c);return true}
    end(c){
      const s=HS.get(this);if(this.writableEnded)return this;
      if(c!==undefined&&c!==null&&typeof c!=='function')s.body+=String(c);
      // headers fixed earlier (writeHead or a write) cannot learn the length, so the body goes out chunked
      if(!s.h.has('content-length')){
        if(!this.headersSent&&!s.wrote)s.h.set('content-length',['Content-Length',String(byteLen(s.body))]);
        else s.h.set('transfer-encoding',['Transfer-Encoding','chunked'])}
      this.headersSent=true;this.writableEnded=true;
      s.done({status:this.statusCode,message:this.statusMessage||STATUS_CODES[this.statusCode]||'unknown',headers:[...s.h.values()],body:s.body});
      sch().nextTick(()=>this.emit('finish'));return this}
  }
  const SP=new WeakMap();
  const listenErr=(code,text)=>{const e=new Error(text);e.code=code;return e};
  class Server extends EventEmitter{
    constructor(l){super();if(typeof l==='function')this.on('request',l)}
    get listening(){return SP.has(this)}
    listen(...a){
      const cb=a.find(x=>typeof x==='function');let port=Number(a[0]&&typeof a[0]==='object'?a[0].port:a[0])||0;
      if(SP.has(this))throw listenErr('ERR_SERVER_ALREADY_LISTEN','Listen method has been called more than once without closing.');
      if(port===0){port=49152;while(servers.has(port))port++}
      if(servers.has(port)){
        const e=listenErr('EADDRINUSE','listen EADDRINUSE: address already in use :::'+port);e.errno=-98;e.syscall='listen';e.address='::';e.port=port;
        sch().nextTick(()=>this.emit('error',e));return this}
      servers.set(port,this);SP.set(this,port);sch().ref();
      if(cb)this.once('listening',cb);
      sch().nextTick(()=>this.emit('listening'));return this}
    close(cb){
      const p=SP.get(this);
      if(p===undefined){if(cb)sch().nextTick(cb,listenErr('ERR_SERVER_NOT_RUNNING','Server is not running.'));return this}
      servers.delete(p);SP.delete(this);sch().unref();
      if(cb)this.once('close',cb);
      sch().nextTick(()=>this.emit('close'));return this}
    address(){const p=SP.get(this);return p===undefined?null:{address:'::',family:'IPv6',port:p}}
  }
  const http={STATUS_CODES,createServer:(...a)=>new Server(a.find(x=>typeof x==='function'))};
  // curl hands a request here; t0 is when the user issued it, so parallel requests share one start time.
  const dispatch=(port,rq,t0,cb)=>{
    const srv=servers.get(port);if(!srv)return cb({code:7});
    const p={};pend.add(p);
    p.settle=(e,r)=>{if(pend.delete(p))cb(e,r)};
    sch().queueIO(0,()=>{
      if(!pend.has(p))return;
      const req=new EventEmitter();Object.assign(req,{method:rq.method,url:rq.url,headers:rq.headers,httpVersion:'1.1'});
      const res=new ServerResponse(r=>p.settle(null,{...r,ms:sch().now()-t0}));
      try{srv.emit('request',req,res)}catch(e){p.settle({code:52});throw e}
      sch().nextTick(()=>req.emit('end'))});
  };
  const pe=new EventEmitter();
  const runExit=c=>{if(exited)return;exited=true;process.exitCode=c;try{pe.emit('exit',c)}catch(e){if(io.asyncErr)io.asyncErr(e)}};
  const process={argv:['/usr/local/bin/node',cwd+'/'+file,...args],env:{HOME:'/home/you',USER:'you',NODE_ENV:'development'},platform:'linux',version:NODE_VERSION,versions:{node:NODE_VERSION.slice(1)},cwd:()=>cwd,pid:4242,exitCode:undefined,
    on:(n,f)=>{pe.on(n,f);return process},once:(n,f)=>{pe.once(n,f);return process},off:(n,f)=>{pe.off(n,f);return process},
    uptime:()=>S?S.now()/1000:0,
    // the scheduler records the exit and drops its queues; silencing the realm drops promise jobs already queued
    exit:(c)=>{if(c===undefined)c=process.exitCode||0;runExit(c);if(root.Scheduler)sch().exit(c);R.silent=true;const e=new Error('__exit__');e.__exit=c;throw e},
    nextTick:(f,...a)=>sch().nextTick(f,...a),
    stdout:{write:s=>{if(!R.silent)io.out('raw',[String(s).replace(/\n$/,'')]);return true}},
    stderr:{write:s=>{if(!R.silent)io.out('raw',[String(s).replace(/\n$/,''),'stderr']);return true}}};
  const fw=n=>(...a)=>sch()[n](...a);
  const RDate=R.w.Date||Date;
  const VDate=new Proxy(RDate,{
    construct:(t,a,nt)=>a.length?Reflect.construct(t,a,nt):new t(vnow()),
    get:(t,k)=>k==='now'?vnow:Reflect.get(t,k),
  });
  const vnow=()=>root.Scheduler?sch().dateNow():RDate.now();
  const shadows=[fw('setTimeout'),fw('setInterval'),fw('setImmediate'),fw('clearTimeout'),fw('clearInterval'),fw('clearImmediate'),VDate,process,fw('guardTick')];
  const builtins={fs,path,os,process,events:EventEmitter,http};
  // io.builtins(api) adds modules: keys with their own 'node:' prefix resolve only with it, the rest with or without.
  let extra=null;
  const hasOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function require(spec){
    spec=String(spec);
    const bare=spec.replace(/^node:/,'');
    if(hasOwn(builtins,bare))return builtins[bare];
    if(io.builtins){
      if(!extra)extra=io.builtins({R,sch,process,file,out:t=>{if(!R.silent)io.out('raw',[t])},idle:f=>idleFns.push(f)});
      if(hasOwn(extra,spec))return extra[spec];
      if(hasOwn(extra,bare))return extra[bare];
    }
    spec=bare;
    if(/^\.\.?\//.test(spec)){
      let k=norm(spec);if(!has(k)&&has(k+'.js'))k+='.js';
      if(!has(k)&&has(k+'.json'))k+='.json';
      if(!has(k)&&io.transform&&has(k+'.ts'))k+='.ts';
      if(!has(k)){const e=new Error("Cannot find module '"+spec+"'");e.code='MODULE_NOT_FOUND';throw e}
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
    let src=code!==undefined?code:vfs.files[k];
    if(io.transform&&k.endsWith('.ts'))src=io.transform(k,src);
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
  return {require,loadModule,process,runMain,servers,dispatch,now:()=>S?S.now():0,stop:()=>{bad=true;if(S)S.stop();teardown()}};
}

// curl against the virtual servers only; hooks: out(text), req({url,status,ms,body}), done().
function curl(env,argv,h){
  h=h||{};
  let inc=false,silent=false,par=false,method='GET';const urls=[];
  const finish=()=>{if(h.done)h.done()};
  const say=t=>{if(h.out)h.out(t)};
  const bad=t=>{const f=h.err||h.out;if(f)f(t)};
  for(let i=0;i<argv.length;i++){
    const a=String(argv[i]);
    if(a==='-X'||a==='--request')method=String(argv[++i]||'GET');
    else if(/^-X./.test(a))method=a.slice(2);
    else if(a==='--parallel')par=true;
    else if(a==='--include')inc=true;
    else if(a==='--silent')silent=true;
    else if(/^-[isZ]+$/.test(a)){for(const c of a.slice(1)){if(c==='i')inc=true;else if(c==='s')silent=true;else par=true}}
    else if(a[0]==='-'&&a.length>1){bad('curl: option '+a+": is unknown\ncurl: try 'curl --help' for more information");return finish()}
    else urls.push(a);
  }
  if(!urls.length){bad('curl: no URL specified');return finish()}
  const fail=t=>{if(!silent)bad(t)};
  const t0=env?env.now():0;
  const one=(u,next)=>{
    const m=/^(?:http:\/\/)?([^/:?#]+)(?::(\d+))?(.*)$/.exec(u);
    if(!m){fail('curl: (3) URL rejected: Malformed input to a URL function');return next()}
    const host=m[1],port=m[2]?+m[2]:80,rest=m[3],path=!rest?'/':rest[0]==='/'?rest:'/'+rest;
    if(host!=='localhost'&&host!=='127.0.0.1'){fail('curl: (6) Could not resolve host: '+host);return next()}
    if(!env||!env.servers.has(port)){fail('curl: (7) Failed to connect to '+host+' port '+port+" after 0 ms: Couldn't connect to server");return next()}
    const start=par?t0:env.now();
    env.dispatch(port,{method,url:path,headers:{host:host+(m[2]?':'+m[2]:''),'user-agent':'curl/8.5.0',accept:'*/*'}},start,(e,r)=>{
      if(e)fail(e.code===52?'curl: (52) Empty reply from server':'curl: (28) Operation timed out');
      else{
        if(h.req)h.req({url:u,status:r.status,ms:r.ms,body:r.body});
        say((inc?'HTTP/1.1 '+r.status+' '+r.message+'\n'+r.headers.map(x=>x[0]+': '+x[1]).join('\n')+'\n\n':'')+r.body);
      }
      next()});
  };
  if(par){let left=urls.length;for(const u of urls)one(u,()=>{if(--left===0)finish()})}
  else{let i=0;const go=()=>{if(i>=urls.length)return finish();one(urls[i++],go)};go()}
}
root.NodeEnv={NODE_VERSION,FakeBuffer,make:makeNodeEnv,curl};
})(typeof window !== 'undefined' ? window : globalThis);
