(function (root) {
'use strict';
const COST={FS_BASE_MS:250,BYTES_PER_MS:4,META_MS:1};
const START_EPOCH=1700000000000;
const LOOP_LIMIT=5000000,MAX_VIRTUAL_MS=60000,MAX_CALLBACKS=5000;
const GUARD_NAME='__loopGuard__';
const LOOPS=new Set(['WhileStatement','DoWhileStatement','ForStatement','ForInStatement','ForOfStatement']);
const fmt=n=>n.toLocaleString('en-US');
const byDue=(a,b)=>a.due-b.due||a.seq-b.seq;

function guardError(){
  const e=new Error('Loop guard: this loop ran more than '+fmt(LOOP_LIMIT)+' times in one go, so it was stopped. Does its exit condition ever become true?');
  e.code='ERR_LOOP_GUARD';return e;
}

function guardSource(src,parse){
  if(typeof parse!=='function')return src;
  let ast;try{ast=parse(src)}catch(e){return src}
  const call=GUARD_NAME+'();',ins=[];
  (function walk(n){
    if(Array.isArray(n))return n.forEach(walk);
    if(!n||typeof n.type!=='string')return;
    if(LOOPS.has(n.type)&&n.body){
      const b=n.body;
      if(b.type==='BlockStatement')ins.push([b.start+1,call]);
      else{ins.push([b.start,'{'+call]);ins.push([b.end,'}'])}
    }
    for(const k of Object.keys(n))if(k!=='type')walk(n[k]);
  })(ast);
  ins.sort((a,b)=>a[0]-b[0]);
  let out='',at=0;
  for(const [p,t] of ins){out+=src.slice(at,p)+t;at=p}
  return out+src.slice(at);
}

// The first tick after a reset asks `defer` to reset again, so the count restarts when control returns to the event loop.
function makeGuard(defer){
  let n=0,armed=false;
  function reset(){n=0;armed=false}
  function tick(){
    if(!armed){armed=true;defer(reset)}
    if(++n>LOOP_LIMIT)throw guardError();
  }
  return {tick,reset};
}

function defaultHop(){
  if(typeof root.MessageChannel==='function'){
    const ch=new root.MessageChannel();let f=null;
    ch.port1.onmessage=()=>f();
    return {hop:fn=>{f=fn;ch.port2.postMessage(0)},close:()=>ch.port1.close()};
  }
  if(typeof root.setTimeout==='function')return {hop:fn=>root.setTimeout(fn,0),close(){}};
  throw new Error('Scheduler: this host has no way to schedule a macrotask (MessageChannel or setTimeout).');
}

function create(opts){
  const io=(opts&&opts.io)||{};
  const alive=(opts&&opts.alive)||(()=>true);
  let hop=(opts&&opts.hop)||null,closeHop=null;
  let now=0,seq=0,running=false,stopped=false,phase=0,clockT=0,batch=[],guard=0,callbacks=0;
  let ticks=[],timers=[],immediates=[],ios=[];
  let holds=0,idle=false;

  const live=()=>!stopped&&alive();
  // A held loop with nothing queued parks (no hop) until new work arrives.
  function wake(){if(idle&&running&&!stopped){idle=false;if(io.idle)io.idle(false);next()}}
  function timerOf(fn,delay,args,every){
    let d=Number(delay);if(!(d>=1&&d<=2147483647))d=1;
    const t={id:++seq,seq,fn,args,due:now+d,every:every?d:0,dead:false};
    timers.push(t);wake();return t;
  }
  function clearTimer(t){if(t&&typeof t==='object'){t.dead=true;timers=timers.filter(x=>x!==t)}}
  function setImmediate(fn,...args){const j={seq:++seq,fn,args,dead:false};immediates.push(j);wake();return j}
  function clearImmediate(j){if(j){j.dead=true;immediates=immediates.filter(x=>x!==j)}}
  function nextTick(fn,...args){ticks.push({fn,args});wake()}
  function queueIO(costMs,fn){ios.push({seq:++seq,due:now+Math.max(0,costMs),fn,args:[],dead:false});wake()}
  function ref(){holds++}
  function unref(){if(holds>0)holds--;if(!holds&&idle)end()}
  function guardTick(){if(++guard>LOOP_LIMIT)throw guardError()}
  function drainTicks(){while(ticks.length&&live()){guardTick();const t=ticks.shift();t.fn(...t.args)}}

  function end(){
    stopped=true;running=false;idle=false;ticks=[];timers=[];immediates=[];ios=[];batch=[];
    if(closeHop){closeHop();closeHop=null}
    if(io.done)io.done();
  }
  function stop(){if(running)end();else{stopped=true}}
  function exit(code){
    stopped=true;ticks=[];timers=[];immediates=[];ios=[];batch=[];
    if(io.exit)io.exit(code);
    if(idle)end();
  }

  function nextJob(){
    for(;;){
      while(batch.length){const j=batch.shift();if(!j.dead)return j}
      if(phase===0){now+=1;clockT=now;batch=timers.filter(t=>t.due<=clockT).sort(byDue);timers=timers.filter(t=>t.due>clockT);phase=1}
      else if(phase===1){batch=ios.filter(x=>x.due<=now).sort(byDue);ios=ios.filter(x=>x.due>now);phase=2}
      else if(phase===2){batch=immediates;immediates=[];phase=3}
      else{
        phase=0;
        if(!timers.length&&!ios.length&&!immediates.length)return null;
        if(!immediates.length){
          const e=Math.min(...timers.map(t=>t.due),...ios.map(x=>x.due));
          if(e-1>now)now=e-1;
        }
      }
    }
  }

  function step(){
    if(!live()){if(running)end();return}
    try{
      if(ticks.length){drainTicks()}
      else{
        const j=nextJob();
        if(!j){
          if(holds>0){idle=true;if(io.idle)io.idle(true);return}
          end();return;
        }
        if(now>MAX_VIRTUAL_MS||callbacks>=MAX_CALLBACKS){
          if(io.sys)io.sys(now>MAX_VIRTUAL_MS
            ?'Stopped: this program ran for more than '+fmt(MAX_VIRTUAL_MS)+' ms of virtual time. Does a timer or interval ever end?'
            :'Stopped: this program ran more than '+fmt(MAX_CALLBACKS)+' callbacks. Does a timer or interval ever end?');
          end();return;
        }
        callbacks++;guard=0;
        try{j.fn(...j.args)}
        finally{if(j.every&&!j.dead&&live()){j.due=clockT+j.every;j.seq=++seq;timers.push(j)}}
        drainTicks();
      }
    }catch(e){
      if(!(e&&e.__exit!==undefined)&&io.asyncErr)io.asyncErr(e);
      if(running)end();else stopped=true;
      return;
    }
    if(running)next();
  }
  // Two hops: the host queues unhandledrejection behind the first hop, so a rejection reports before the next callback.
  function next(){hop(()=>{if(running)hop(step)})}

  function start(){
    if(running||stopped)return;
    if(!hop){const d=defaultHop();hop=d.hop;closeHop=d.close}
    running=true;
    next();
  }

  return {
    setTimeout:(fn,delay,...args)=>timerOf(fn,delay,args,false),
    setInterval:(fn,delay,...args)=>timerOf(fn,delay,args,true),
    clearTimeout:clearTimer,clearInterval:clearTimer,
    setImmediate,clearImmediate,nextTick,queueIO,drainTicks,start,exit,stop,guardTick,ref,unref,wake,
    resetGuard:()=>{guard=0},
    charge:ms=>{now+=ms},now:()=>now,
    dateNow:()=>{now+=1;return START_EPOCH+now},
  };
}
root.Scheduler={create,guardSource,makeGuard,COST,LOOP_LIMIT,MAX_VIRTUAL_MS,MAX_CALLBACKS,GUARD_NAME};
})(typeof window !== 'undefined' ? window : globalThis);
