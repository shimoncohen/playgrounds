(()=>{
'use strict';
const SCQ=window.SCQ=window.SCQ||{};
// shortcut: a `//` right after a non-colon character starts a comment even inside a string; upgrade if a mission needs such a string.
const strip=s=>String(s||'').replace(/\/\*[^]*?\*\//g,'').replace(/(^|[^:])\/\/[^\n]*/g,'$1');
const ran=(c,file)=>c.cmd==='node'&&!!c.ran&&c.ran.file===file&&c.ok;
const lines=c=>(c.out||[]).map(l=>l.trim());
const same=(c,want)=>{const o=lines(c);return o.length===want.length&&want.every((w,i)=>o[i]===w)};
const calls=(s,m)=>[...s.matchAll(new RegExp('\\.'+m+'\\s*\\(\\s*(["\'`])([^"\'`]+)\\1','g'))].map(x=>({name:x[2],at:x.index}));
const count=(s,re)=>(s.match(re)||[]).length;
const NEW=/\bnew\s+(?:\w+\.)?EventEmitter\b/;
SCQ.CH.push(
{name:'Events',tier:'intermediate',group:'Node in depth',badge:'Bell Ringer',story:'Beyond the ledger wagon hangs the old brass bell, wired to every tent. Ring it, send news along with the ring, take a listener off the wire and catch the bell\'s own errors, and win the bell ringer\'s badge.',mode:'sh',
 intro:'The circus runs on signals: one ring of the bell and the juggler, the cook and the ticket booth each do their own thing, without the bell knowing who is listening. Node has a tool for this, `EventEmitter`. You hang a function on a named event with `on`, and when something calls `emit` with that name, every function on it runs. This chapter rings a bell, passes news with the ring, runs a listener once, removes one, builds your own booth from the emitter, handles an `error` event and ends with the last word before the program closes.',
 learned:['new EventEmitter, on and emit','emit with arguments, listeners run in order','once and listenerCount','off with a named function','class extends EventEmitter','the error event','process.on("exit")'],
 missions:[
 {title:'Ring the bell',goal:'Write `bell.js` so it makes an `EventEmitter`, hangs a listener on the event `ring` that prints `Ding!`, and then emits `ring`. The program prints `Ding!` once.',code:'const EventEmitter = require("events")\nconst bell = new EventEmitter()\nbell.on("ring", () => {\n  console.log("Ding!")\n})\nbell.emit("ring")',
  how:['The whole file: <code>on</code> hangs a function on a named event, and <code>emit</code> with the same name runs it. An <code>EventEmitter</code> is an object that keeps those lists of functions.',
   '<code>const EventEmitter = require("events")</code> brings in the tool, and <code>const bell = new EventEmitter()</code> makes your own bell.',
   '<code>bell.on("ring", () => { … })</code> hangs a function on the event called <code>ring</code>. A function hung on an event is called a listener. Inside it print <code>Ding!</code>.',
   'Write <code>bell.emit("ring")</code> after the <code>on</code> line. Run it: <code>Ding!</code> appears once.'],
  anat:[['new EventEmitter()','fn','makes a bell'],['bell.on("ring", …)','fn','hangs a listener on ring'],['bell.emit("ring")','fn','runs the listeners'],['console.log("Ding!")','fn']],
  explain:'An event is a name and nothing more. <code>on</code> stores your function under that name and <code>emit</code> looks the name up and calls what it finds. The order matters: an <code>emit</code> that comes before the <code>on</code> finds nobody and nothing happens. The name is plain text, so <code>"ring"</code> and <code>"rang"</code> are two different events. The checker reads your file: <code>new EventEmitter</code> is there, and an <code>emit</code> of the same name comes after the <code>on</code>.',
  hint:'Write the <code>on</code> line first, with <code>console.log("Ding!")</code> inside its function, and the <code>emit</code> line after it.',
  editFile:'bell.js',
  check:c=>{
    if(!ran(c,'bell.js'))return false;
    const s=strip(c.ran.code),on=calls(s,'on'),em=calls(s,'emit');
    return same(c,['Ding!'])&&NEW.test(s)&&on.some(o=>em.some(e=>e.name===o.name&&e.at>o.at));
  }},
 {title:'News with the ring',goal:'Write `args.js` so the event `sale` carries news. Print `before`, emit `sale` with `"popcorn"` and `3`, and print `after`. Two listeners hang on `sale`: the first prints `Till: popcorn 3` and the second prints `Sign: popcorn x3`.',code:'const EventEmitter = require("events")\nconst box = new EventEmitter()\nbox.on("sale", (name, count) => {\n  console.log("Till: " + name + " " + count)\n})\nbox.on("sale", (name, count) => {\n  console.log("Sign: " + name + " x" + count)\n})\nconsole.log("before")\nbox.emit("sale", "popcorn", 3)\nconsole.log("after")',
  how:['The whole file: everything after the event name in <code>emit</code> is handed to each listener, and <code>emit</code> finishes every listener before the next line of your program runs.',
   'Make the emitter, then hang two listeners on <code>"sale"</code>. Each one is written <code>(name, count) => { … }</code>, so it can use the news.',
   'The first listener prints <code>"Till: " + name + " " + count</code>. The second prints <code>"Sign: " + name + " x" + count</code>.',
   'Print <code>before</code>, then <code>box.emit("sale", "popcorn", 3)</code>, then print <code>after</code>. Run it: <code>before</code>, the two listener lines, <code>after</code>.'],
  anat:[['box.on("sale", (name, count) => …)','fn','a listener that gets the news'],['box.emit("sale", "popcorn", 3)','fn','the name, then the news'],['console.log("before")','fn'],['console.log("after")','fn']],
  explain:'The listeners run in the order you hung them, and they run during the <code>emit</code> call, before the next line. That is why <code>after</code> prints last: <code>emit</code> is not a timer and nothing waits. The checker looks at the printed lines, which prove the order, and at your file for two <code>on</code> calls and an <code>emit</code> with news after the name.',
  hint:'The first <code>on</code> prints <code>Till: …</code>, so write it first, then the one that prints <code>Sign: …</code>. The <code>emit</code> goes between the two <code>console.log</code> lines.',
  editFile:'args.js',
  check:c=>{
    if(!ran(c,'args.js'))return false;
    const s=strip(c.ran.code);
    return same(c,['before','Till: popcorn 3','Sign: popcorn x3','after'])&&NEW.test(s)&&count(s,/\.on\s*\(/g)>=2&&/\.emit\s*\(\s*["'`][^"'`]+["'`]\s*,\s*\S/.test(s);
  }},
 {title:'Only the first time',goal:'Write `once.js` so a listener hung with `once` on the event `open` prints `Gates open!`. Emit `open` twice, then print what `listenerCount("open")` says. You see `Gates open!` once, then `0`.',code:'const EventEmitter = require("events")\nconst gate = new EventEmitter()\ngate.once("open", () => {\n  console.log("Gates open!")\n})\ngate.emit("open")\ngate.emit("open")\nconsole.log(gate.listenerCount("open"))',
  how:['The whole file: a listener hung with <code>once</code> runs the first time the event is emitted and is then taken off, so the second <code>emit</code> finds nobody.',
   '<code>gate.once("open", () => { … })</code> hangs the listener. Inside it print <code>Gates open!</code>.',
   'Write <code>gate.emit("open")</code> two times in a row.',
   '<code>gate.listenerCount("open")</code> gives how many listeners are hung on <code>open</code> right now. Print it with <code>console.log</code> after the emits. Run it: <code>Gates open!</code> once, then <code>0</code>.'],
  anat:[['gate.once("open", …)','fn','a listener for one run'],['gate.emit("open")','fn','runs the listeners'],['gate.listenerCount("open")','fn','how many are hung on open'],['console.log(…)','fn']],
  explain:'With <code>on</code> the same listener runs on every <code>emit</code>. With <code>once</code> Node takes it off before it calls it, so it can never run twice, and the count of listeners drops to zero. The checker reads your file for <code>once(</code>, two <code>emit</code> calls and <code>listenerCount(</code>, and the output must be exactly the two lines.',
  hint:'Change <code>on</code> to <code>once</code>, emit twice, and print the count last.',
  editFile:'once.js',
  check:c=>{
    if(!ran(c,'once.js'))return false;
    const s=strip(c.ran.code);
    return same(c,['Gates open!','0'])&&NEW.test(s)&&/\.once\s*\(/.test(s)&&count(s,/\.emit\s*\(/g)>=2&&/\.listenerCount\s*\(/.test(s);
  }},
 {title:'Unplug a listener',goal:'Write `unplug.js` so the function `ding` is hung on `ring`, `ring` is emitted, `ding` is taken off with `off`, and `ring` is emitted again. Print `quiet` at the end. You see `Ding!` once, then `quiet`.',code:'const EventEmitter = require("events")\nconst bell = new EventEmitter()\nfunction ding() {\n  console.log("Ding!")\n}\nbell.on("ring", ding)\nbell.emit("ring")\nbell.off("ring", ding)\nbell.emit("ring")\nconsole.log("quiet")',
  how:['The whole file: <code>off</code> takes a listener off an event, and it finds the listener by the very same function you gave to <code>on</code>, so the function needs a name.',
   'Write <code>function ding() { console.log("Ding!") }</code> and hang it with <code>bell.on("ring", ding)</code>.',
   'Emit <code>ring</code>, then <code>bell.off("ring", ding)</code>, then emit <code>ring</code> again. The second emit finds nobody.',
   'Print <code>quiet</code> at the end. Run it: <code>Ding!</code> once, then <code>quiet</code>.'],
  anat:[['function ding() { … }','fn','a listener with a name'],['bell.on("ring", ding)','fn','hangs it'],['bell.off("ring", ding)','fn','takes the same one off'],['console.log("quiet")','fn']],
  explain:'<code>off</code> compares functions, not what they do. A new arrow function that prints the same text is a different function, so it takes nothing off. That is why a listener you want to remove needs a name. <code>removeListener</code> is the older name for the same call, and the checker accepts it. The checker reads your file for the removal and two <code>emit</code> calls, and the output must be exactly <code>Ding!</code> and <code>quiet</code>.',
  hint:'Pass the same <code>ding</code> to <code>on</code> and to <code>off</code>. Both <code>emit</code> calls stay, one before the <code>off</code> and one after.',
  editFile:'unplug.js',
  check:c=>{
    if(!ran(c,'unplug.js'))return false;
    const s=strip(c.ran.code);
    return same(c,['Ding!','quiet'])&&NEW.test(s)&&/\.(?:off|removeListener)\s*\(/.test(s)&&count(s,/\.emit\s*\(/g)>=2;
  }},
 {title:'Your own booth',goal:'Write `booth.js` with a `class Booth extends EventEmitter` whose method `sell(name)` emits `sold` with the name. Hang a listener on `sold` that prints `Sold a ticket to ` and the name, then call `booth.sell("Mira")`.',code:'const EventEmitter = require("events")\nclass Booth extends EventEmitter {\n  sell(name) {\n    this.emit("sold", name)\n  }\n}\nconst booth = new Booth()\nbooth.on("sold", (name) => {\n  console.log("Sold a ticket to " + name)\n})\nbooth.sell("Mira")',
  how:['The whole file: a class that <code>extends EventEmitter</code> is an emitter with extra methods, and inside a method it calls <code>this.emit</code> on itself.',
   'Write <code>class Booth extends EventEmitter { … }</code>. A class that extends another one starts with everything the other has, so <code>on</code> and <code>emit</code> are already there.',
   'Inside it write the method <code>sell(name) { this.emit("sold", name) }</code>. <code>this</code> is the booth that <code>sell</code> was called on.',
   'Make <code>const booth = new Booth()</code>, hang <code>booth.on("sold", (name) => { … })</code> to print <code>Sold a ticket to </code> and the name, then call <code>booth.sell("Mira")</code>.'],
  anat:[['class Booth extends EventEmitter','kw','a booth that is also an emitter'],['this.emit("sold", name)','fn','the booth announces a sale'],['booth.on("sold", …)','fn','the listener from outside'],['booth.sell("Mira")','fn']],
  explain:'This is how Node\'s own tools use events: a server, a stream and a file watcher are all emitters, and their methods call <code>this.emit</code> when something happens. The caller only listens. The checker reads your file for <code>extends EventEmitter</code> and <code>this.emit(</code>, and the output must be <code>Sold a ticket to Mira</code>.',
  hint:'The <code>emit</code> belongs inside <code>sell</code>, written as <code>this.emit("sold", name)</code>. The <code>on</code> goes after you make the booth.',
  editFile:'booth.js',
  check:c=>{
    if(!ran(c,'booth.js'))return false;
    const s=strip(c.ran.code);
    return same(c,['Sold a ticket to Mira'])&&/\bclass\s+\w+\s+extends\s+(?:\w+\.)?EventEmitter\b/.test(s)&&/\bthis\.emit\s*\(/.test(s)&&/\.on\s*\(/.test(s);
  }},
 {title:'When it goes wrong',goal:'Write `error.js` so a listener on the event `error` prints `Handled: ` and the error\'s message. Emit `error` with `new Error("drawer jammed")`, then print `still running`. You see `Handled: drawer jammed`, then `still running`.',code:'const EventEmitter = require("events")\nconst till = new EventEmitter()\ntill.on("error", (err) => {\n  console.log("Handled: " + err.message)\n})\ntill.emit("error", new Error("drawer jammed"))\nconsole.log("still running")',
  how:['The whole file: <code>error</code> is the one event name Node treats as special. Emit it with no listener hung on it and the program stops with that error, so a listener on <code>error</code> is what keeps it running.',
   'Make the emitter, then hang <code>till.on("error", (err) => { … })</code>. Inside, print <code>"Handled: " + err.message</code>.',
   'Emit it with <code>till.emit("error", new Error("drawer jammed"))</code>. The listener gets that error as <code>err</code>.',
   'Print <code>still running</code> on the next line. Run it: the program reaches that line because the error was handled.'],
  anat:[['till.on("error", …)','fn','the listener that handles it'],['new Error("drawer jammed")','fn','the news is an error'],['err.message','name','the text of the error'],['console.log("still running")','fn']],
  explain:'Every other event name is ignored when nobody listens. An <code>error</code> event with no listener is thrown, like any other uncaught error, and the program ends. A listener turns it into an ordinary call. The checker wants a clean run, so a program that stops with an error fails, and it reads your file for an <code>on</code> and an <code>emit</code> of <code>"error"</code>.',
  hint:'Take the listener out and run the file to see the program stop, then put it back. The listener is named <code>"error"</code> exactly.',
  editFile:'error.js',
  check:c=>{
    if(!ran(c,'error.js'))return false;
    const s=strip(c.ran.code);
    return same(c,['Handled: drawer jammed','still running'])&&NEW.test(s)&&calls(s,'on').some(x=>x.name==='error')&&calls(s,'emit').some(x=>x.name==='error');
  }},
 {title:'The last word',goal:'Write `curtain.js` so it prints `Show starts`, hangs a listener on the process event `exit` that prints `Curtain down`, and starts a timer that prints `Last act`. The lines come out `Show starts`, `Last act`, `Curtain down`.',code:'process.on("exit", () => {\n  console.log("Curtain down")\n})\nsetTimeout(() => {\n  console.log("Last act")\n}, 100)\nconsole.log("Show starts")',
  how:['The whole file: <code>process</code> is an emitter too. Its <code>exit</code> event is emitted once, when the program has nothing left to do, so its listener runs after every timer.',
   'Write <code>process.on("exit", () => { … })</code> and print <code>Curtain down</code> inside it.',
   'Start a timer with <code>setTimeout(() => { … }, 100)</code> that prints <code>Last act</code>.',
   'End with <code>console.log("Show starts")</code>. Run it: <code>Show starts</code> now, <code>Last act</code> when the timer fires, and <code>Curtain down</code> last.'],
  anat:[['process.on("exit", …)','fn','runs when the program is done'],['setTimeout(…, 100)','fn','runs later'],['console.log("Show starts")','fn'],['"exit"','val','the event name']],
  explain:'The program is done when there are no timers or other jobs left, and only then does Node emit <code>exit</code>. The listener cannot start new waiting work, so keep it short and plain. The checker reads your file for <code>process.on("exit"</code> and <code>setTimeout(</code>, and wants all three lines: it judges the output as it grows, so only the full three lines in this order complete the mission.',
  hint:'The <code>exit</code> listener is written first in the file but runs last. The timer prints <code>Last act</code>.',
  editFile:'curtain.js',
  check:c=>{
    if(!ran(c,'curtain.js'))return false;
    const s=strip(c.ran.code);
    return same(c,['Show starts','Last act','Curtain down'])&&/\bprocess\.(?:on|once)\s*\(\s*["'`]exit["'`]/.test(s)&&/\bsetTimeout\s*\(/.test(s);
  }},
 ]},
);
})();
