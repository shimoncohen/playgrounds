(()=>{
'use strict';
const SCQ=window.SCQ=window.SCQ||{};
// ================= FIELD GUIDE =================
const BLOCKS=[
['Variables','<code>const</code> for boxes that keep their value, <code>let</code> for boxes that change.','const name = "Ada"\nlet lives = 3\nlives = lives - 1\nconsole.log(name, "has", lives, "lives")'],
['Template strings','Backticks plus <code>${ }</code> drop values into text.','const item = "coffee"\nconst price = 4.5\n`One ${item} costs $${price}`'],
['if / else','Run code only when a condition is true.','const temp = 31\nif (temp > 30) {\n  console.log("Hot! 🥵")\n} else {\n  console.log("Nice out")\n}'],
['for loop','Repeat with a counter.','for (let i = 1; i <= 3; i++) {\n  console.log("Round", i)\n}'],
['Arrays','Ordered lists, numbered from 0.','const pets = ["cat", "dog"]\npets.push("fish")\nconsole.log(pets[0], pets.length)'],
['Objects','Named values grouped together.','const book = { title: "Dune", pages: 412 }\nbook.read = true\nbook'],
['Functions','Reusable recipes with inputs and an output.','function area(w, h) {\n  return w * h\n}\narea(3, 4)'],
['Arrow functions','Short functions, perfect for callbacks.','const shout = text => text + "!"\nshout("hey")'],
['Destructuring','Unpack objects and arrays into variables.','const user = { id: 7, city: "Lyon" }\nconst { city } = user\nconst [first, second] = ["gold", "silver"]\nconsole.log(city, first)'],
['Spread','Copy or combine arrays and objects.','const a = [1, 2]\nconst b = [...a, 3, 4]\nconst base = { size: "M" }\nconsole.log(b, { ...base, color: "red" })'],
['Classes','A blueprint for creating many similar objects.','class Monster {\n  constructor(name) {\n    this.name = name\n    this.hp = 10\n  }\n  hit() { this.hp -= 3 }\n}\nconst m = new Monster("Slime")\nm.hit()\nm'],
['async / await','Wait for slow things without freezing everything.','const wait = ms => new Promise(r => setTimeout(r, ms))\nasync function go() {\n  console.log("loading…")\n  await wait(800)\n  console.log("done ✅")\n}\ngo()'],
['try / catch','Handle errors instead of crashing.','try {\n  null.length\n} catch (err) {\n  console.log("Handled:", err.name)\n}'],
['Map and Set','A Map is a dictionary with any keys. A Set holds unique values.','const tags = new Set(["js", "ts", "js"])\nconst ages = new Map([["Ada", 36]])\nconsole.log(tags.size, ages.get("Ada"))'],
['Closures','A function remembers the variables around where it was made.','function makeCounter() {\n  let n = 0\n  return () => ++n\n}\nconst next = makeCounter()\nnext()\nconsole.log(next())',12],
['Nested destructuring','Reach into an object inside an object, and gather the rest.','const act = { name: "Pepper", stunt: { prop: "rope", height: 4 } }\nconst { stunt: { prop } } = act\nconst [first, ...others] = ["a", "b", "c"]\nconsole.log(prop, others)',13],
['Class inheritance','A class can extend another and reuse its methods.','class Animal {\n  sound() { return "..." }\n}\nclass Parrot extends Animal {\n  sound() { return "squawk" }\n}\nconsole.log(new Parrot().sound())',14],
['finally and error types','finally always runs. The error name tells you what went wrong.','try {\n  JSON.parse("{oops")\n} catch (err) {\n  console.log(err.name)\n} finally {\n  console.log("cleaned up")\n}',15],
['module.exports','A file puts what it shares on module.exports, and require hands it back.','const module = { exports: {} }\nmodule.exports.double = n => n * 2\nconsole.log(module.exports.double(4))',16],
['Map and Set in depth','Loop over a Map in the order you added things.','const seats = new Map([["A1", "Ada"], ["A2", "Bo"]])\nfor (const [seat, who] of seats) {\n  console.log(seat, who)\n}\nconsole.log(new Set([1, 2, 2]).has(2))',17],
['JSON.stringify options','Pretty-print, or pick only the keys you want.','const ticket = { id: 7, seat: "A1", paid: true }\nconsole.log(JSON.stringify(ticket, ["id", "seat"], 2))',18],
['Event loop order','Plain code first, then the microtask line (promises and queueMicrotask), then timers. Node adds nextTick and setImmediate, shown in the picture below.','setTimeout(() => console.log("timer"), 0)\nPromise.resolve().then(() => console.log("promise"))\nqueueMicrotask(() => console.log("queued"))\nconsole.log("sync")',19],
['Callback to promise','A function that takes a callback can be wrapped in a promise: call <code>resolve</code> from the callback, then <code>.then</code> or <code>await</code> waits for it.','const wait = ms => new Promise(resolve => setTimeout(resolve, ms))\nwait(300).then(() => console.log("callback done, promise kept"))\nconsole.log("waiting…")',20],
['A tiny emitter','An emitter is a list of listeners per event name. <code>on</code> adds one and <code>emit</code> calls them all, in order.','const listeners = new Map()\nconst on = (name, fn) => listeners.set(name, [...(listeners.get(name) || []), fn])\nconst emit = (name, ...args) => (listeners.get(name) || []).forEach(fn => fn(...args))\non("ring", who => console.log("Ding for", who))\non("ring", () => console.log("Second listener"))\nemit("ring", "Mira")',21],
['A handler by hand','A server handler is a plain function of a request and a response. Call it with a fake pair to see what it answers.','const handler = (req, res) => {\n  if (req.url === "/tickets") res.end("120 tickets")\n  else res.end("Welcome!")\n}\nconst res = { end: text => console.log("answer:", text) }\nhandler({ url: "/tickets" }, res)\nhandler({ url: "/" }, res)',22],
];
const PICS={intermediate:`<h4>One turn of the loop in Node</h4><p>After every callback, Node empties the <code>nextTick</code> queue and then the <b>microtask</b> line (small jobs left by promises and <code>queueMicrotask</code>). Each turn then visits three phases in order.</p>
    <div class="loop">
      <div class="lbox panel"><span class="eyebrow">1 · Code box</span><h4>Your code</h4><div class="stack"><span>console.log("sync")</span><span>your file</span></div><p>Runs first, to the end.</p></div>
      <div class="lbox panel"><span class="eyebrow">2 · After every callback</span><h4>Ticks, then microtasks</h4><div class="q"><span>process.nextTick</span><span>.then · queueMicrotask</span></div><p>The tick lane drains first, then the microtask lane.</p></div>
      <div class="lbox panel"><span class="eyebrow">3 · Timers phase</span><h4>Due timers</h4><div class="q"><span>⏱ setTimeout</span></div><p>Runs the timers that are due.</p></div>
      <div class="lbox panel"><span class="eyebrow">4 · Poll phase</span><h4>Finished reads</h4><div class="q"><span>fs.readFile callback</span></div><p>Runs callbacks of work that has finished.</p></div>
      <div class="lbox panel"><span class="eyebrow">5 · Check phase</span><h4>Immediates</h4><div class="q"><span>setImmediate</span></div><p>Runs right after poll, then the loop turns again.</p></div>
    </div>`};
const ERRS=[
['ReferenceError: x is not defined','You used a name that does not exist. Usually a typo or a capital letter: <code>Score</code> and <code>score</code> are different names.'],
['TypeError: x is not a function','You put brackets after something that is not a function. Check the method name, for example <code>.lenght()</code> or <code>.Push()</code>.'],
["TypeError: Cannot read properties of undefined (reading 'name')",'The thing before <code>.name</code> is undefined. Print it to see what it really is.'],
['SyntaxError: Unexpected token','JavaScript could not read the code. Look for a missing comma, bracket or quote just before the spot it mentions.'],
['TypeError: Assignment to constant variable','You tried to assign a new value to a <code>const</code>. Use <code>let</code> if it needs to change.'],
["SyntaxError: Identifier 'x' has already been declared",'You used let or const twice with the same name in the same place. Drop the second <code>let</code> and assign with <code>=</code> instead.'],
["Error: Cannot find module './math'",'Node could not find the file. Check the path, the spelling, and that you are in the right folder.'],
["error TS2322: Type 'string' is not assignable to type 'number'",'TypeScript caught a value of the wrong type. Fix the value, or the type if the type was wrong.'],
];
SCQ.guideHTML=({esc,hl,tiers=[],tierOf=()=>({id:'beginner'})})=>{
const tierId=b=>b[3]==null?'beginner':tierOf(b[3]).id;
const card=(b,i)=>`<div class="card panel"><h4>${esc(b[0])}</h4><p>${b[1]}</p><pre>${hl(b[2])}</pre><div class="runrow"><button class="btn small" data-run="${i}">▶ Run</button></div><div class="runout" id="ro${i}"></div></div>`;
const cards=id=>BLOCKS.map((b,i)=>tierId(b)===id?card(b,i):'').join('');
const filter=tiers.length>1?`<div class="gfilter" role="group" aria-label="Filter by tier"><button class="btn ghost" data-tier="all" aria-pressed="true">All</button>${tiers.map(t=>`<button class="btn ghost" data-tier="${t.id}" aria-pressed="false">${esc(t.name)}</button>`).join('')}</div>`:'';
const extra=tiers.filter(t=>t.id!=='beginner').map(t=>cards(t.id)?`<section class="gsec gtier" data-tier="${t.id}"><h3>${esc(t.name)}: going deeper</h3><div class="cards">${cards(t.id)}</div>${PICS[t.id]||''}</section>`:'').join('');
return `
  <div><h2>Field guide</h2><p class="lede">Most of the quest on one page, plus a few extras (classes, Map and Set, <code>.some()</code>), with pictures. Every code card has a Run button, so you can try it right here.</p></div>
  ${filter}

  <section class="gsec"><h3>Who's who</h3><p>Three names, one language. Here is how they fit together.</p>
    <div class="flow">
      <div class="fstep panel"><span class="eyebrow">You write</span><span class="big">TypeScript</span><p>JavaScript plus type labels. A checker finds mistakes before anything runs. Files end in <code>.ts</code>.</p></div>
      <span class="farrow">→ tsc →</span>
      <div class="fstep panel"><span class="eyebrow">Becomes</span><span class="big">JavaScript</span><p>The language itself. The labels are stripped away and plain JavaScript is left. Files end in <code>.js</code>.</p></div>
      <span class="farrow">→</span>
      <div class="fstep panel"><span class="eyebrow">Runs in</span><span class="big">Browser or Node.js</span><p>A browser runs it inside web pages. Node.js runs it on your computer or a server, with access to files and the network.</p></div>
    </div></section>

  <section class="gsec"><h3>Building blocks</h3><p>The core pieces of the language. Press Run to see each one work.</p>
    <div class="cards">${cards('beginner')}</div></section>

  <section class="gsec"><h3>Types at a glance</h3><p>The same colours as the Memory panel.</p>
    <div class="panel tblwrap" style="padding:6px 8px"><table class="cmp"><tr><th>Type</th><th>Examples</th><th><code>typeof</code> says</th></tr>
      <tr><td><span class="ty ty-number" style="margin:0">number</span></td><td><code>42</code> <code>3.14</code> <code>-7</code> <code>NaN</code> (Not a Number)</td><td><code>"number"</code></td></tr>
      <tr><td><span class="ty ty-string" style="margin:0">string</span></td><td><code>"hi"</code> <code>'hi'</code> <code>\`hi \${x}\`</code></td><td><code>"string"</code></td></tr>
      <tr><td><span class="ty ty-boolean" style="margin:0">boolean</span></td><td><code>true</code> <code>false</code></td><td><code>"boolean"</code></td></tr>
      <tr><td><span class="ty ty-undefined" style="margin:0">undefined</span></td><td><code>let x</code> with no value</td><td><code>"undefined"</code></td></tr>
      <tr><td><span class="ty ty-null" style="margin:0">null</span></td><td><code>null</code>, empty on purpose</td><td><code>"object"</code> (an old bug)</td></tr>
      <tr><td><span class="ty ty-array" style="margin:0">array</span></td><td><code>[1, 2, 3]</code></td><td><code>"object"</code>, use <code>Array.isArray()</code> (a built-in yes/no check for arrays)</td></tr>
      <tr><td><span class="ty ty-object" style="margin:0">object</span></td><td><code>{ name: "Ada" }</code></td><td><code>"object"</code></td></tr>
      <tr><td><span class="ty ty-function" style="margin:0">function</span></td><td><code>x =&gt; x * 2</code></td><td><code>"function"</code></td></tr>
    </table></div></section>

  <section class="gsec"><h3>Truthy or falsy?</h3><p>In an <code>if</code>, every value counts as true or false. Only these six are false. Everything else is true.</p>
    <div class="chips">${['false','0','""','null','undefined','NaN'].map(x=>`<span class="chip f">${x}</span>`).join('')}</div>
    <p>Some surprises that count as <b>true</b>:</p>
    <div class="chips">${['"0"','"false"','" "','[]','{}','-1'].map(x=>`<span class="chip t">${esc(x)}</span>`).join('')}</div></section>

  <section class="gsec"><h3><code>===</code> or <code>==</code>?</h3><p>Always use <code>===</code>. Here is why.</p>
    <div class="panel tblwrap" style="padding:6px 8px"><table class="cmp"><tr><th>Comparison</th><th>===</th><th>==</th></tr>
      ${[['5 vs "5"',0,1],['0 vs ""',0,1],['null vs undefined',0,1],['0 vs false',0,1],['"a" vs "a"',1,1]].map(r=>`<tr><td><code>${esc(r[0])}</code></td><td class="${r[1]?'yes':'no'}">${r[1]?'true':'false'}</td><td class="${r[2]?'yes':'no'}">${r[2]?'true':'false'}</td></tr>`).join('')}
    </table></div></section>

  <section class="gsec"><h3>Array methods, pictured</h3><p>Each one takes a function and runs it on every item of <code>[1, 2, 3, 4]</code>.</p>
    <div class="panel pipe" style="padding:16px">
      <div class="pipeRow"><code>.map(n =&gt; n * 2)</code><div class="belt"><span class="ball a">1</span><span class="ball b">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="to">→</span><span class="ball a">2</span><span class="ball b">4</span><span class="ball c">6</span><span class="ball d">8</span><span class="note">same count, each changed</span></div></div>
      <div class="pipeRow"><code>.filter(n =&gt; n &gt; 2)</code><div class="belt"><span class="ball a">1</span><span class="ball b">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="to">→</span><span class="ball ghost">1</span><span class="ball ghost">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="note">only the ones that pass</span></div></div>
      <div class="pipeRow"><code>.find(n =&gt; n &gt; 2)</code><div class="belt"><span class="ball a">1</span><span class="ball b">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="to">→</span><span class="ball c">3</span><span class="note">the first that passes, not an array</span></div></div>
      <div class="pipeRow"><code>.reduce((t, n) =&gt; t + n, 0)</code><div class="belt"><span class="ball a">1</span><span class="ball b">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="to">→</span><span class="ball a" style="width:38px;height:38px">10</span><span class="note">everything boiled down to one value</span></div></div>
      <div class="pipeRow"><code>.some(n =&gt; n &gt; 3)</code><div class="belt"><span class="ball a">1</span><span class="ball b">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="to">→</span><code>true</code><span class="note">does at least one pass?</span></div></div>
    </div></section>

  <section class="gsec"><h3>The event loop</h3><p>JavaScript does one thing at a time. Slow jobs wait in a waiting room, and their callbacks queue up to run once the current code has finished.</p>
    <div class="loop">
      <div class="lbox panel"><span class="eyebrow">1 · Call stack</span><h4>Running now</h4><div class="stack"><span>console.log("1: first")</span><span>your script</span></div><p>Runs your code line by line, to the end, without stopping.</p></div>
      <div class="lbox panel"><span class="eyebrow">2 · Waiting room</span><h4>Timers, files, network</h4><div class="q"><span>⏱ setTimeout 0 ms</span><span>🍕 pizza promise</span></div><p>Handled by the browser or Node, outside your code.</p></div>
      <div class="lbox panel"><span class="eyebrow">3 · Queue</span><h4>Callbacks ready to run</h4><div class="q"><span>() =&gt; log("3: last")</span></div><p>When the stack is empty, the next callback in line moves onto it.</p></div>
    </div></section>

  <section class="gsec" data-extras><h3>Error decoder</h3><p>Errors are messages, not failures. Learn these and you can fix most bugs yourself.</p>
    <div class="errs">${ERRS.map(e=>`<div class="card panel"><code class="e">${esc(e[0])}</code><p>${e[1]}</p></div>`).join('')}</div></section>

  <section class="gsec"><h3>Set up your own computer</h3><p>When you are ready to leave the playground, this is the path every professional setup starts with.</p>
    <ol class="steps">
      <li class="panel"><div><b>Install Node.js</b><p>Download the LTS version (long-term support, the stable one) from nodejs.org. npm comes with it. Then open a terminal and check:</p><pre>node -v\nnpm -v</pre></div></li>
      <li class="panel"><div><b>Install an editor</b><p>VS Code is free and the most common choice. It understands JavaScript and TypeScript out of the box, with autocomplete and red squiggles for errors.</p></div></li>
      <li class="panel"><div><b>Start a project</b><p>Create a folder (<code>mkdir</code>), step into it (<code>cd</code>), and create a package.json, just like in chapter 12.</p><pre>mkdir my-app\ncd my-app\nnpm init -y</pre></div></li>
      <li class="panel"><div><b>Write and run a file</b><p>Create index.js in VS Code with a console.log in it, then:</p><pre>node index.js</pre></div></li>
      <li class="panel"><div><b>Add TypeScript</b><p>Install the compiler into the project, create its settings file, then check and compile your .ts files. Recent Node versions can also run a .ts file directly by stripping the types, but only tsc checks them.</p><pre>npm install -D typescript\nnpx tsc --init\nnpx tsc</pre></div></li>
      <li class="panel"><div><b>Keep going</b><p>Good next steps: the browser DOM (make web pages react to clicks), Git for saving versions of your work, a web server with Express, and later a UI library like React.</p></div></li>
    </ol></section>
  ${extra}`;
};
SCQ.BLOCKS=BLOCKS;
SCQ.ERRS=ERRS;
})();
