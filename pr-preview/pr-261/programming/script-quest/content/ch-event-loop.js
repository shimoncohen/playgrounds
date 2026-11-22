(()=>{
'use strict';
const SCQ=window.SCQ=window.SCQ||{};
// shortcut: strings are skipped up to their closing quote (no ${} nesting) and regex literals are not parsed; upgrade if a mission needs either.
const KW=/^(async|function|if|for|while|switch|catch|return|await|typeof)$/;
const scan=src=>{
  const st=[],calls=[],logs=[];
  const near=()=>{for(let k=st.length-1;k>=0;k--)if(st[k].n)return st[k].n;return null};
  for(let i=0;i<src.length;i++){
    const ch=src[i],nx=src[i+1];
    if(ch==='/'&&nx==='/'){const e=src.indexOf('\n',i);if(e<0)break;i=e;continue}
    if(ch==='/'&&nx==='*'){const e=src.indexOf('*/',i+2);if(e<0)break;i=e+1;continue}
    if(ch==="'"||ch==='"'||ch==='`'){for(i++;i<src.length&&src[i]!==ch;i++)if(src[i]==='\\')i++;continue}
    if(ch==='('){
      const head=src.slice(Math.max(0,i-40),i),w=/([A-Za-z_$][\w$]*)\s*$/.exec(head);
      const n=w&&!KW.test(w[1])?w[1]:null;
      if(n){
        calls.push({name:n,pos:i,parent:near()});
        if(n==='log'&&/console\s*\.\s*log\s*$/.test(head)){
          const m=/^\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/.exec(src.slice(i+1));
          logs.push({inner:near(),label:m?m[2]:null});
        }
      }
      st.push({t:'(',n});
    }else if(ch==='{'||ch==='[')st.push({t:ch});
    else if(ch===')'||ch==='}'||ch===']'){const open=ch===')'?'(':ch==='}'?'{':'[';while(st.length&&st.pop().t!==open);}
  }
  return {calls,logs};
};
SCQ.evScan=scan;
const PROMISE=['then','queueMicrotask'];
const at=(s,ns)=>{const p=s.calls.filter(x=>ns.includes(x.name)).map(x=>x.pos);return p.length?Math.min(...p):-1};
const before=(s,a,b)=>{const x=at(s,a),y=at(s,b);return x>=0&&y>=0&&x<y};
const inFile=(s,n)=>{const l=s.calls.filter(x=>x.name===n);return l.length>0&&l.every(x=>x.parent==='readFile')};
const puzzle=(file,want,own,more)=>c=>{
  if(!(c.cmd==='node'&&c.args[0]===file&&c.ok))return false;
  if(JSON.stringify(c.out||[])!==JSON.stringify(want))return false;
  const s=scan(c.files[file]||'');
  return s.logs.length===want.length&&want.every(w=>s.logs.some(l=>l.label===w&&own[w].includes(l.inner)))&&(!more||more(s));
};
const FS='const fs = require("fs")\n';
const HEART=FS+'const start = Date.now()\nlet count = 0\nconst id = setInterval(() => {\n  count++\n  console.log("beat " + (Date.now() - start))\n  if (count === 7) clearInterval(id)\n}, 100)\n';
const beats=out=>out.every(l=>/^beat \d+$/.test(l))?out.map(l=>+l.slice(5)):null;
const gapOf=b=>Math.max(...b.map((t,i)=>t-(i?b[i-1]:0)));
const names=(src,need,ban)=>{const n=scan(src||'').calls.map(x=>x.name);return need.every(x=>n.includes(x))&&!ban.some(x=>n.includes(x))};
SCQ.CH.push(
{name:'The event loop',tier:'intermediate',group:'Node in depth',badge:'Gate Whistle',story:'The gate is where the whole ticket line meets the show. Work out who goes first, who waits and who jumps the line, then blow the gate whistle.',mode:'sh',
 intro:'At the gate, people do not all go through in the order they arrived: Node keeps several lines, and it always serves them in the same order. In this chapter you write small programs and predict, then check, what they print and in what order. The files you write run in Node, and the later missions read `notes.txt` from chapter 12. If it was deleted, the Reset project button brings it back.',
 learned:['plain code first','microtasks','queueMicrotask','process.nextTick','setImmediate','poll and check phases','the timers phase'],
 missions:[
 {title:'Jump the line',goal:'Write `gate.js` so it prints `sync`, then `promise`, then `timer`: a plain line, a promise that is already finished, and a `setTimeout`. Write the `setTimeout` before the promise.',code:'console.log("sync")\nsetTimeout(() => console.log("timer"), 0)\nPromise.resolve().then(() => console.log("promise"))',
  how:['The whole file: the lines are written as sync, timer, promise but print as sync, promise, timer. Plain lines run first, then the <b>microtasks</b> (small jobs that a promise leaves for the moment the current code finishes), then timers.',
   '<code>console.log("sync")</code> is a plain line. It runs at once, so it prints first.',
   '<code>setTimeout(() => console.log("timer"), 0)</code> asks for the timer line "after 0 milliseconds". Even then it waits until the plain code and the microtasks are done. Write it before the promise.',
   '<code>Promise.resolve()</code> makes a promise that is already finished, and <code>.then(...)</code> gives it a function to run. That function is a microtask. Write it as an arrow function inside the <code>.then(</code> call, so the checker can see the line is printed from there.',
   'Run it with ▶ Run. You see <code>sync</code>, <code>promise</code>, <code>timer</code>, although the timer was written first.'],
  anat:[['console.log("sync")','fn','plain line, runs first'],['setTimeout(…, 0)','fn','waits for its turn'],['Promise.resolve().then(…)','fn','leaves a microtask']],
  explain:'Node finishes the plain code first, then empties the microtask line: the <code>.then</code> function of a finished promise waits there. Only after that does it look at timers, even one set to <code>0</code>. Real Node prints the same order. The checker reads your file: each line must be printed from the call it names, and the timer is written before the promise, so writing the lines in the order they print does not pass.',
  hint:'Write three things in this order: <code>console.log("sync")</code>, then the <code>setTimeout</code> line, then the <code>Promise.resolve().then(...)</code> line.',
  editFile:'gate.js',
  check:puzzle('gate.js',['sync','promise','timer'],{sync:[null],promise:PROMISE,timer:['setTimeout']},s=>before(s,['setTimeout'],PROMISE))},
 {title:'First in, first out',goal:'Write `lane.js` so it prints `sync`, `then`, `queued`, `timer`. The `then` line comes from `.then`, and the `queued` line from `queueMicrotask`.',code:'console.log("sync")\nsetTimeout(() => console.log("timer"), 0)\nPromise.resolve().then(() => console.log("then"))\nqueueMicrotask(() => console.log("queued"))',
  how:['The whole file: two microtasks wait in one line, and the one that joined first runs first. A timer waits behind both.',
   '<code>Promise.resolve().then(...)</code> joins the microtask line first, so its function runs first.',
   '<code>queueMicrotask(...)</code> puts a function in the same line without a promise. It joins second, so it runs second.',
   '<code>setTimeout(..., 0)</code> is a timer. Timers run after the microtask line is empty, so <code>timer</code> prints last.',
   'Write each line as an arrow function inside its own call. You see <code>sync</code>, <code>then</code>, <code>queued</code>, <code>timer</code>.'],
  anat:[['.then(…)','fn','joins the line first'],['queueMicrotask(…)','fn','joins the line second'],['setTimeout(…, 0)','fn','after the line']],
  explain:'<code>queueMicrotask</code> is the plain way to add a microtask: it takes one function and runs it after the current code, in the same line as promise callbacks. Whichever was written first prints first. Swap the two lines and <code>queued</code> prints before <code>then</code>.',
  editFile:'lane.js',
  check:puzzle('lane.js',['sync','then','queued','timer'],{sync:[null],then:['then'],queued:['queueMicrotask'],timer:['setTimeout']})},
 {title:'Cutting in line',goal:'Write `tick.js` so it prints `sync`, `tick`, `promise`, `timer`, with a `process.nextTick` line. Write the promise before the `nextTick`.',code:'console.log("sync")\nsetTimeout(() => console.log("timer"), 0)\nPromise.resolve().then(() => console.log("promise"))\nprocess.nextTick(() => console.log("tick"))',
  how:['The whole file: <code>process.nextTick</code> is Node\'s own queue, and it runs before the microtask line, even when it was written after the promise.',
   '<code>Promise.resolve().then(...)</code> joins the microtask line. Write it first.',
   '<code>process.nextTick(...)</code> takes a function and runs it as soon as the current code ends, before any microtask. Write it second.',
   '<code>setTimeout(..., 0)</code> still runs last. You see <code>sync</code>, <code>tick</code>, <code>promise</code>, <code>timer</code>.'],
  anat:[['.then(…)','fn','microtask line'],['process.nextTick(…)','fn','jumps ahead of it'],['setTimeout(…, 0)','fn','last']],
  explain:'<code>process.nextTick</code> exists only in Node, not in a browser. Node empties the <code>nextTick</code> queue after each piece of code finishes, and only then the microtask line. So <code>tick</code> prints before <code>promise</code> although the promise was written first. The checker wants the promise written first for that reason.',
  hint:'Write the <code>.then</code> line first and the <code>process.nextTick</code> line after it.',
  editFile:'tick.js',
  check:puzzle('tick.js',['sync','tick','promise','timer'],{sync:[null],tick:['nextTick'],promise:PROMISE,timer:['setTimeout']},s=>before(s,PROMISE,['nextTick']))},
 {title:'Immediate or timer?',goal:'Write `reader.js` to read `notes.txt` with `fs.readFile`. Inside the callback print `read`, then start a `setTimeout` that prints `timer` and a `setImmediate` that prints `immediate`. Write the `setTimeout` first.',code:FS+'fs.readFile("notes.txt", "utf8", (err, data) => {\n  console.log("read")\n  setTimeout(() => console.log("timer"), 0)\n  setImmediate(() => console.log("immediate"))\n})',
  how:['The whole file: it reads a file, and when the read is done Node calls your function. Inside that function, <code>setImmediate</code> always prints before a <code>setTimeout</code> of <code>0</code>.',
   '<code>fs.readFile("notes.txt", "utf8", (err, data) => { ... })</code> reads in the background and calls your function with <code>err</code> and <code>data</code> when it is done. Write the function inside the call, as an arrow function.',
   'Node runs its loop in turns, with phases: the <b>timers</b> phase runs due timers, the <b>poll</b> phase runs file callbacks like yours, and the <b>check</b> phase runs <code>setImmediate</code> callbacks.',
   'Your function runs in the poll phase, and the check phase comes next, so <code>immediate</code> prints before <code>timer</code>. Write the <code>setTimeout</code> line before the <code>setImmediate</code> line, both inside the function.',
   'You see <code>read</code>, <code>immediate</code>, <code>timer</code>.'],
  anat:[['fs.readFile(…)','fn','read, then call back'],['setTimeout(…, 0)','fn','timers phase'],['setImmediate(…)','fn','check phase']],
  explain:'<code>setImmediate</code> runs its function in the check phase, right after the poll phase where your file callback ran. A timer has to wait for the next turn, so inside a file callback the immediate always goes first. Outside a file callback, real Node does not guarantee the order of the two, so this chapter never asks you to predict it. The checker reads the callback written inside the <code>readFile(</code> call: a function declared elsewhere and passed by name puts its lines outside, and fails. The mission reads <code>notes.txt</code> from chapter 12; if it was deleted, Reset project brings it back.',
  hint:'Put the <code>console.log("read")</code>, <code>setTimeout</code> and <code>setImmediate</code> lines inside the <code>readFile</code> function.',
  editFile:'reader.js',
  check:puzzle('reader.js',['read','immediate','timer'],{read:['readFile'],immediate:['setImmediate'],timer:['setTimeout']},s=>inFile(s,'setTimeout')&&inFile(s,'setImmediate')&&before(s,['setTimeout'],['setImmediate']))},
 {title:'One full turn',goal:'Write `turn.js` so that one `fs.readFile` callback prints `poll`, then starts a `nextTick` (`tick`), a promise (`promise`), a `setImmediate` (`immediate`) and a `setTimeout` (`timer`). The order printed is `poll`, `tick`, `promise`, `immediate`, `timer`.',code:FS+'fs.readFile("notes.txt", "utf8", (err, data) => {\n  console.log("poll")\n  setTimeout(() => console.log("timer"), 0)\n  setImmediate(() => console.log("immediate"))\n  Promise.resolve().then(() => console.log("promise"))\n  process.nextTick(() => console.log("tick"))\n})',
  how:['The whole file: one file callback starts four things, and you can read the loop in the order they print: the callback itself, then ticks, then microtasks, then the check phase, then the next turn\'s timers phase.',
   '<code>console.log("poll")</code> runs inside the callback, so it belongs to the poll phase and prints first.',
   'When the callback ends, Node empties the <code>nextTick</code> queue (<code>tick</code>), then the microtask line (<code>promise</code>).',
   'Then comes the check phase (<code>immediate</code>). The <b>timers</b> phase is back at the start of the next turn, so <code>timer</code> prints last.',
   'Write all four starts inside the callback, each as an arrow function inside its call.'],
  anat:[['console.log("poll")','fn','poll phase'],['process.nextTick(…)','fn','after the callback'],['Promise.resolve().then(…)','fn','then microtasks'],['setImmediate(…)','fn','check phase'],['setTimeout(…, 0)','fn','timers phase, next turn']],
  explain:'Each turn of the loop visits the timers phase, the poll phase and the check phase in that order, and after every callback Node empties the <code>nextTick</code> queue and then the microtask line. Real Node prints the same order for this file. The order of the four lines you write does not matter for the result here, but all four must sit inside the <code>readFile</code> callback.',
  editFile:'turn.js',
  check:puzzle('turn.js',['poll','tick','promise','immediate','timer'],{poll:['readFile'],tick:['nextTick'],promise:PROMISE,immediate:['setImmediate'],timer:['setTimeout']},s=>inFile(s,'setTimeout')&&inFile(s,'setImmediate'))},
 {title:'Freeze the ticket line',goal:'Write `freeze.js` with a heartbeat that prints `beat` and the milliseconds since the program started, every 100 ms, and stops itself after 7 beats. Then, 250 ms in, read `notes.txt` with `fs.readFileSync`, and watch the beats stop for a while.',code:HEART+'setTimeout(() => {\n  fs.readFileSync("notes.txt", "utf8")\n}, 250)',
  how:['The whole file: a heartbeat prints <code>beat</code> and a time every 100 ms, a timer reads a file the blocking way, and the gap in the beats shows how long the line was frozen.',
   '<code>setInterval(fn, 100)</code> runs <code>fn</code> again and again, every 100 ms, and hands back an id. <code>clearInterval(id)</code> stops that interval. Count the beats, and call <code>clearInterval(id)</code> after the 7th, or the heartbeat never ends.',
   '<code>Date.now()</code> gives the time in milliseconds. Save it once at the start, and print <code>"beat " + (Date.now() - start)</code> so each beat shows how long the program has run.',
   'Start the read from a <code>setTimeout(…, 250)</code>, and read with <code>fs.readFileSync("notes.txt", "utf8")</code>. <b>Sync</b> means the program waits until the read is done, and nothing else runs meanwhile.',
   'Run it with ▶ Run. The first two beats come on time, then there is a big jump before the next one.'],
  anat:[['setInterval(…, 100)','fn','beats every 100 ms'],['clearInterval(id)','fn','stops the beats'],['Date.now()','fn','time in milliseconds'],['fs.readFileSync(…)','fn','freezes everything until done']],
  explain:'While <code>readFileSync</code> waits, Node cannot run anything else, not even a timer that is due, so the heartbeat skips beats and prints one late beat afterwards. The file read costs a fixed pretend time in this playground, so even a small file freezes the line. On a real machine a tiny file reads in a blink, and the freeze shows with a big file or a slow disk. A loop that keeps checking <code>Date.now()</code> until time is up blocks the thread in the same way. The checker looks for a gap of 200 ms or more and for <code>readFileSync</code> in your file. The mission reads <code>notes.txt</code> from chapter 12; if it was deleted, Reset project brings it back.',
  hint:'Keep the heartbeat as it is and put <code>fs.readFileSync("notes.txt", "utf8")</code> inside a <code>setTimeout</code> of 250.',
  editFile:'freeze.js',
  check:c=>{
    if(!(c.cmd==='node'&&c.args[0]==='freeze.js'&&c.ok))return false;
    const b=beats(c.out||[]);
    return !!b&&b.length>=3&&gapOf(b)>=200&&names(c.files['freeze.js'],['setInterval','clearInterval','now','readFileSync'],[]);
  }},
 {title:'Keep the line moving',goal:'Write `smooth.js` with the same heartbeat, but read `notes.txt` with `fs.readFile` from a `setTimeout` of 250. Print `read done` in the callback, and see the beats keep coming.',code:HEART+'setTimeout(() => {\n  fs.readFile("notes.txt", "utf8", (err, data) => {\n    console.log("read done")\n  })\n}, 250)',
  how:['The whole file: the same heartbeat as before, but the read is the callback kind, so the beats go on while the file is read and <code>read done</code> shows up between them.',
   'Write the heartbeat as in the last mission: <code>setInterval(…, 100)</code>, a beat count, and <code>clearInterval(id)</code> after the 7th beat.',
   'Start the read from a <code>setTimeout(…, 250)</code>, with <code>fs.readFile("notes.txt", "utf8", (err, data) => { … })</code> and <code>console.log("read done")</code> inside the function.',
   'Run it with ▶ Run. The beats come every 100 ms with no big gap, and <code>read done</code> lands among them.'],
  anat:[['setInterval(…, 100)','fn','beats every 100 ms'],['fs.readFile(…)','fn','reads in the background'],['console.log("read done")','fn','runs when the read ends']],
  explain:'<code>fs.readFile</code> hands the read to the system and goes on, so the timers keep running and the beats stay 100 ms apart. When the read is done, Node calls your function in between two beats. That is why servers use the callback kind: one slow read does not make everyone else wait. The checker wants <code>readFile</code> and no <code>readFileSync</code> in the file, at least 3 beats before <code>read done</code>, and no gap over 150 ms. If <code>notes.txt</code> was deleted, the read ends at once, after only 2 beats, so Reset project brings it back.',
  hint:'Take the last file, and swap <code>fs.readFileSync(…)</code> for <code>fs.readFile(…, (err, data) => { … })</code> with the <code>console.log("read done")</code> inside.',
  editFile:'smooth.js',
  check:c=>{
    if(!(c.cmd==='node'&&c.args[0]==='smooth.js'&&c.ok))return false;
    const o=c.out||[],i=o.indexOf('read done');
    const b=beats(o.filter(l=>l!=='read done'));
    return !!b&&b.length===o.length-1&&i>=3&&i<o.length-1&&gapOf(b)<=150&&names(c.files['smooth.js'],['setInterval','clearInterval','now','readFile'],['readFileSync']);
  }},
 ]},
);
})();
