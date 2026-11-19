(()=>{
'use strict';
const SCQ=window.SCQ=window.SCQ||{};
// shortcut: a `//` right after a non-colon character starts a comment even inside a string; upgrade if a mission needs such a string.
const strip=s=>String(s||'').replace(/\/\*[^]*?\*\//g,'').replace(/(^|[^:])\/\/[^\n]*/g,'$1');
// the curl run that follows `node <file>`: the code snapshot is the one that started the server, a server is up on 3000
const asked=(c,file)=>c.cmd==='curl'&&!!c.ran&&c.ran.file===file&&c.ok&&(c.server||[]).includes(3000)&&Array.isArray(c.reqs);
const serving=s=>/\bcreateServer\s*\(/.test(s)&&/\.listen\s*\(/.test(s);
const body=c=>c.reqs.length===1&&c.reqs[0].status===200?c.reqs[0].body:null;
const TARGET='Welcome to the circus!';
const slowest=c=>Math.max(...c.reqs.map(q=>q.ms));
SCQ.CH.push(
{name:'A small HTTP server',tier:'intermediate',group:'Node in depth',badge:'Tour Sign',story:'Beyond the bell the lane ends at the front gate, where the box office window opens onto the road. Serve the first visitor, answer with a status, send tickets as data, hand out the notes and keep two visitors from waiting on each other, and you find Bellamy\'s tour sign.',mode:'sh',
 intro:'A server is a program that stays running and answers whoever asks. Node has `http` for it: `createServer` takes a function that runs for every request, and `listen` opens a port, a numbered door on this computer, for visitors to knock on. Because the program keeps running, you use two commands here. Type `node` and the file first, and the server starts and stays up. Then type `curl` and an address: `curl` is a tool that asks a server for a page and prints the answer. Press Stop when you are done. This chapter serves a page, sets a status and a header, routes by address, serves a file, and shows what one slow handler does to everyone waiting.',
 learned:['createServer and listen','res.end and writeHead','writeHead and curl -i','routes with req.url','sending JSON','a slow sync handler holds everyone up'],
 missions:[
 {title:'Open the box office',goal:'Write `server.js` so it creates an `http` server that answers every request with `Welcome to the circus!` and listens on port `3000`. Run `node server.js`, then type `curl localhost:3000` to see the answer.',code:'const http = require("http")\nconst server = http.createServer((req, res) => {\n  res.end("Welcome to the circus!")\n})\nserver.listen(3000, () => {\n  console.log("Box office open")\n})',
  how:['The whole file: <code>createServer</code> takes a function that Node calls for every request, and <code>server.listen(3000)</code> opens the door numbered 3000. The program then keeps running, which is what a server does.',
   '<code>const http = require("http")</code>, then <code>http.createServer((req, res) => { … })</code>. <code>req</code> is the request that came in and <code>res</code> is the answer you send back.',
   'Inside the function call <code>res.end("Welcome to the circus!")</code>. <code>res.end</code> sends the text and finishes the answer.',
   'After it write <code>server.listen(3000)</code>. Run <code>node server.js</code>: it prints nothing more and stays running. In the same terminal type <code>curl localhost:3000</code> and the text appears. Then press Stop (or Ctrl+C) to end the server.'],
  anat:[['http.createServer(…)','fn','a function for every request'],['(req, res)','name','the request and the answer'],['res.end("…")','fn','sends the text and finishes'],['server.listen(3000)','fn','opens port 3000']],
  explain:'A port is a numbered door on your computer, and <code>localhost</code> means this computer. <code>listen</code> keeps the program alive until you stop it, so the terminal does not give the prompt back in a real shell. Here the page lets you type the next command and shows the Stop button. While the server runs, another <code>node</code> command is refused, but <code>curl</code>, <code>ls</code> and <code>cat</code> work. The checker looks at your file for <code>createServer</code> and <code>listen(3000</code>, and at what <code>curl</code> got back: status 200 and exactly the welcome text.',
  hint:'Type <code>node server.js</code> first and <code>curl localhost:3000</code> after it. Stop the server when the answer shows.',
  editFile:'server.js',then:'curl localhost:3000',
  check:c=>{
    if(!asked(c,'server.js'))return false;
    return serving(strip(c.ran.code))&&body(c)===TARGET;
  }},
 {title:'Say what happened',goal:'Write `status.js` so every answer has the status `404 Not Found`, one header of your own, and the text `No such tent`. Run `node status.js`, then type `curl -i localhost:3000` to see the status line and the headers.',code:'const http = require("http")\nhttp.createServer((req, res) => {\n  res.writeHead(404, { "X-Show": "closed" })\n  res.end("No such tent")\n}).listen(3000)',
  how:['The whole file: <code>res.writeHead</code> sets the status number and the headers before the body, and <code>curl -i</code> prints them so you can see them.',
   'Make the server as before, and in the function write <code>res.writeHead(404, { "X-Show": "closed" })</code>. The first number is the status, and the object holds your header name and its value.',
   'After it call <code>res.end("No such tent")</code>, then <code>.listen(3000)</code> at the end.',
   'Run <code>node status.js</code>, then <code>curl -i localhost:3000</code>. The first line is <code>HTTP/1.1 404 Not Found</code>, then your header, then the text. Press Stop when you are done.'],
  anat:[['res.writeHead(404, { … })','fn','status, then headers'],['{ "X-Show": "closed" }','val','a header: name and value'],['res.end("No such tent")','fn','the body'],['curl -i','kw','shows the status and headers']],
  explain:'A status is a number that tells the visitor how it went: 200 means fine and 404 means not found. A header is a name and a value sent before the body, such as the kind of content. Because you call <code>writeHead</code> and then <code>end</code> with the body, Node sends the body in pieces, so <code>-i</code> also shows a <code>Transfer-Encoding: chunked</code> line. That one is Node\'s own, not yours. The checker needs the 404 status line and a header of yours in what <code>curl -i</code> printed.',
  hint:'<code>writeHead</code> comes before <code>end</code>. Run <code>curl -i</code> with the dash and the letter i, or the status line stays hidden.',
  editFile:'status.js',then:'curl -i localhost:3000',
  check:c=>{
    if(!asked(c,'status.js'))return false;
    const text=c.out.join('\n'),head=text.split('\n\n')[0];
    return serving(strip(c.ran.code))&&c.reqs.length===1&&c.reqs[0].status===404&&/^HTTP\/1\.1 404 Not Found$/m.test(head)&&/^(?!transfer-encoding:|content-length:)[A-Za-z][\w-]*: .+$/im.test(head);
  }},
 {title:'Two doors, one server',goal:'Write `routes.js` so the address `/tickets` answers with the JSON `{"tickets":120}` and every other address answers `Welcome to the circus!`. Run `node routes.js`, then type `curl localhost:3000/tickets`.',code:'const http = require("http")\nhttp.createServer((req, res) => {\n  if (req.url === "/tickets") {\n    res.writeHead(200, { "Content-Type": "application/json" })\n    res.end(JSON.stringify({ tickets: 120 }))\n  } else {\n    res.end("Welcome to the circus!")\n  }\n}).listen(3000)',
  how:['The whole file: <code>req.url</code> holds the address that was asked for, so an <code>if</code> on it lets one server answer different things. JSON is data written as text, and <code>JSON.stringify</code> turns an object into it.',
   'Make the server as before. Inside the function write <code>if (req.url === "/tickets") { … } else { … }</code>.',
   'In the first part write <code>res.writeHead(200, { "Content-Type": "application/json" })</code> to say the answer is JSON, then <code>res.end(JSON.stringify({ tickets: 120 }))</code>.',
   'In the else part call <code>res.end("Welcome to the circus!")</code>. Run <code>node routes.js</code>, then <code>curl localhost:3000/tickets</code>. Press Stop when you are done.'],
  anat:[['req.url','name','the address that was asked for'],['"Content-Type"','val','says what kind of data comes'],['JSON.stringify({ … })','fn','an object as JSON text'],['else { … }','kw','every other address']],
  explain:'This is how one program becomes many pages: look at <code>req.url</code> and choose the answer. The content type header tells the visitor the text is JSON, so a browser or another program can read it as data. The checker runs one <code>curl</code>, so it judges that one answer: status 200 and a body that reads as JSON with 120 tickets, and it looks in your file for <code>JSON.stringify</code>.',
  hint:'<code>req.url</code> starts with a slash, so write <code>"/tickets"</code> with it. Type the address after <code>localhost:3000</code> with no space.',
  editFile:'routes.js',then:'curl localhost:3000/tickets',
  check:c=>{
    if(!asked(c,'routes.js'))return false;
    const s=strip(c.ran.code),b=body(c);let j=null;
    try{j=JSON.parse(b)}catch(e){return false}
    return serving(s)&&/\bJSON\.stringify\s*\(/.test(s)&&/\/tickets$/.test(c.reqs[0].url)&&!!j&&j.tickets===120;
  }},
 {title:'Hand out the notes',goal:'Write `office.js` so every request is answered with the text of `notes.txt`, read with `readFile` inside the handler. Run `node office.js`, then type `curl localhost:3000`.',code:'const http = require("http")\nconst fs = require("fs")\nhttp.createServer((req, res) => {\n  fs.readFile("notes.txt", "utf8", (err, text) => {\n    res.end(text)\n  })\n}).listen(3000)',
  how:['The whole file: the handler reads <code>notes.txt</code> with <code>readFile</code>, which hands the text to a callback when it is ready, and the callback sends it with <code>res.end</code>.',
   'Make the server as before and add <code>const fs = require("fs")</code> at the top.',
   'Inside the handler write <code>fs.readFile("notes.txt", "utf8", (err, text) => { … })</code>. The callback gets the text in <code>text</code>.',
   'Inside the callback call <code>res.end(text)</code>. Run <code>node office.js</code>, then <code>curl localhost:3000</code>. Press Stop when you are done.'],
  anat:[['fs.readFile(…, callback)','fn','reads, then calls you'],['"utf8"','val','gives text, not raw bytes'],['(err, text) => { … }','fn','the callback'],['res.end(text)','fn','sends what was read']],
  explain:'While <code>readFile</code> waits for the file, the server is free to take the next visitor, because the answer is sent later from the callback. That is the same callback pattern you wrote with timers and with <code>writeFile</code>. The checker compares the answer with the text of <code>notes.txt</code> and wants <code>readFile(</code> in your file and no <code>readFileSync</code>. It assumes the starting <code>notes.txt</code> is still there: with the file missing the read fails and there is nothing to send.',
  hint:'The <code>res.end</code> goes inside the <code>readFile</code> callback, where <code>text</code> exists.',
  editFile:'office.js',then:'curl localhost:3000',
  check:c=>{
    if(!asked(c,'office.js'))return false;
    const s=strip(c.ran.code),b=body(c),f=c.files['notes.txt'];
    return serving(s)&&/\breadFile\s*\(/.test(s)&&!/readFileSync/.test(s)&&typeof f==='string'&&f.length>0&&b===f;
  }},
 {title:'Freeze the box office',goal:'Write `jam.js` so every request is answered with the text of `notes.txt`, read with `readFileSync` inside the handler. Run `node jam.js`, then type `curl --parallel localhost:3000 localhost:3000` and watch the second visitor wait.',code:'const http = require("http")\nconst fs = require("fs")\nhttp.createServer((req, res) => {\n  const text = fs.readFileSync("notes.txt", "utf8")\n  res.end(text)\n}).listen(3000)',
  how:['The whole file: <code>readFileSync</code> makes the whole program wait for the file, so while one visitor is being served the next one cannot start.',
   'Make the server as before with <code>const fs = require("fs")</code> at the top.',
   'Inside the handler write <code>const text = fs.readFileSync("notes.txt", "utf8")</code> and then <code>res.end(text)</code>.',
   'Run <code>node jam.js</code>, then <code>curl --parallel localhost:3000 localhost:3000</code>. Two <code>(took N ms, virtual)</code> lines appear and the second number is about double the first. Press Stop when you are done.'],
  anat:[['fs.readFileSync(…)','fn','waits, then gives the text'],['const text = …','kw','the whole text, right here'],['res.end(text)','fn','sends it'],['curl --parallel','kw','asks both at the same moment']],
  explain:'Real <code>curl</code> fetches one URL at a time unless you give <code>--parallel</code>, so that flag is how two visitors arrive together. The <code>(took N ms, virtual)</code> line is a playground extra: real <code>curl</code> does not print it. Reading takes about 263 milliseconds here, so the first visitor waits that long and the second waits twice as long, about 525, because Node can do only one thing at a time. The checker needs two requests, the slower one at 500 milliseconds or more, and <code>readFileSync(</code> in your file.',
  hint:'Two addresses after <code>--parallel</code>, both <code>localhost:3000</code>. Reading with <code>readFileSync</code> is what makes the second one wait.',
  editFile:'jam.js',then:'curl --parallel localhost:3000 localhost:3000',
  check:c=>{
    if(!asked(c,'jam.js'))return false;
    const s=strip(c.ran.code);
    return serving(s)&&/\breadFileSync\s*\(/.test(s)&&c.reqs.length===2&&slowest(c)>=500;
  }},
 {title:'Let both through',goal:'Write `flow.js` so the same server reads `notes.txt` with `readFile` and a callback, and the two parallel visitors are served together. Run `node flow.js`, then type `curl --parallel localhost:3000 localhost:3000`. Both times come out the same.',code:'const http = require("http")\nconst fs = require("fs")\nhttp.createServer((req, res) => {\n  fs.readFile("notes.txt", "utf8", (err, text) => {\n    res.end(text)\n  })\n}).listen(3000)',
  how:['The whole file: <code>readFile</code> with a callback lets Node start the second visitor while the first file is still being read, so both finish together.',
   'Make the server as before with <code>const fs = require("fs")</code> at the top.',
   'Inside the handler write <code>fs.readFile("notes.txt", "utf8", (err, text) => { … })</code> and call <code>res.end(text)</code> inside the callback.',
   'Run <code>node flow.js</code>, then <code>curl --parallel localhost:3000 localhost:3000</code>. Both <code>(took N ms, virtual)</code> lines show the same number. Press Stop when you are done.'],
  anat:[['fs.readFile(…, callback)','fn','reads without holding the line'],['res.end(text)','fn','sent from the callback'],['curl --parallel','kw','two visitors at once'],['both times equal','val','nobody waited']],
  explain:'Both visitors take about 263 milliseconds, because the waiting for the file happens off to the side and the server keeps taking requests. That is why a server never reads files with a <code>Sync</code> call inside a handler: one slow read is every visitor\'s wait. The checker needs two requests, the slower one at 350 milliseconds or less, and <code>readFile(</code> without <code>readFileSync</code> in your file. It is built for the short starting <code>notes.txt</code>: a long file takes longer to read, so the time would pass the limit. With the file missing the read fails and the mission cannot pass. Bellamy\'s tour sign hangs over the gate: the circus is ready to tour.',
  hint:'Use the same server as the last mission but swap <code>readFileSync</code> for <code>readFile</code> with a callback, and move <code>res.end</code> inside the callback.',
  editFile:'flow.js',then:'curl --parallel localhost:3000 localhost:3000',
  check:c=>{
    if(!asked(c,'flow.js'))return false;
    const s=strip(c.ran.code);
    return serving(s)&&/\breadFile\s*\(/.test(s)&&!/readFileSync/.test(s)&&c.reqs.length===2&&slowest(c)<=350&&!!c.files['notes.txt']&&c.reqs.every(q=>q.body===c.files['notes.txt']);
  }},
 ]},
);
})();
