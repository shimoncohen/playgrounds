import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { host, projectRun } from './project-harness.mjs';
import { makeTerminal, makeTs, playTerminal, ts } from './terminal-harness.mjs';

const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
// Waits (at most 1 s) until the output has not grown for 10 ms: timers and tests finish on later hops.
const settle = async T => { for (let n = -1, i = 0; n !== T.st.lines.length && i < 100; i++) { n = T.st.lines.length; await wait(10); } };
const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 't' ? undefined : v)));

const HELLO = 'console.log("Welcome backstage!")\n';
const BASE = { 'hello.js': HELLO, 'notes.txt': 'Sweep the ring\nFeed Mumbles\n', 'dir/': '', 'dir/a.js': 'console.log("a")\n', 'sub/': '' };
const PKG = JSON.stringify({ name: 'my-app', version: '1.0.0', scripts: { start: 'node hello.js', test: 'echo "Error: no test specified" && exit 1', both: 'node hello.js && echo done', bad: 'node boom.js && echo never', ext: 'tsc' } }, null, 2);
const SERVER = 'const http=require("http");http.createServer((q,s)=>s.end("hi")).listen(3000,()=>console.log("up"))\n';

const CASES = {
  'ls root': { files: BASE, steps: ['ls'] },
  'ls root with node_modules': { files: BASE, pkgs: ['cowsay'], steps: ['ls'] },
  'ls folders and files': { files: BASE, steps: ['ls dir', 'ls dir/', 'ls nope', 'ls hello.js', 'ls -l', 'ls .', 'ls sub', 'ls ./'] },
  'cat': { files: BASE, steps: ['cat', 'cat hello.js', 'cat notes.txt', 'cat dir', 'cat dir/', 'cat nope'] },
  'touch': { files: BASE, steps: ['touch', 'touch a.js', 'touch nope/a.js', 'touch dir/b.js', 'touch hello.js', 'touch dir', 'ls', 'ls dir'] },
  'rm': { files: { ...BASE, 'x/y.js': '1' }, steps: ['rm', 'rm hello.js', 'rm dir/a.js', 'rm dir', 'rm nope', 'rm x/y.js', 'ls', 'ls x'] },
  'mkdir': { files: BASE, steps: ['mkdir', 'mkdir d', 'mkdir d', 'mkdir a/b', 'mkdir -p a/b/c', 'mkdir -p hello.js/x', 'mkdir dir/', 'ls', 'ls a/b'] },
  'pwd help clear': { files: BASE, steps: ['pwd', 'help', 'clear'] },
  'node runs a file': { files: BASE, steps: ['node hello.js', 'node hello', 'node nope', 'node nope.js'] },
  'node -e -p -v and bare': { files: BASE, steps: ['node -e "console.log(1+1)"', 'node --eval "console.log(2)"', 'node -p "1+2"', 'node -e', 'node -v', 'node --version', 'node'] },
  'node refuses non JS and warns when unsaved': { files: { ...BASE, 'x.ts': 'let a: number = 1\n', 'data.json': '{"a":1}' }, file: 'hello.js', dirty: true, steps: ['node x.ts', 'node data.json', 'node hello.js', 'node notes.txt'] },
  'node errors': { files: { 'boom.js': 'throw new Error("kaboom")\n', 'ref.js': 'nope()\n', 'fs.js': 'require("fs").readFileSync("missing.txt")\n', 'exit.js': 'process.exit(2)\n', 'ok.js': 'process.exit(0)\n', 'late.js': 'setTimeout(()=>{throw new TypeError("late")},0)\n' }, steps: ['node boom.js', 'node ref.js', 'node fs.js', 'node exit.js', 'node ok.js', { s: 'node late.js', wait: true }] },
  'node builtins off': { files: BASE, steps: ['node -e "require(\'assert\')"', 'node -e "require(\'node:test\')"', 'node -e "require(\'nope\')"'] },
  'npm basics': { files: BASE, steps: ['npm', 'npm -v', 'npm init', 'npm init -y', 'npm init --yes', 'npm foo', 'npm start'] },
  'npm install': { files: BASE, steps: ['npm install', 'npm install nope', 'npm install cowsay', 'npm i', 'npm add cowsay -D', 'ls', 'cat package.json'] },
  'npm install with a package.json': { files: { 'package.json': '{"name":"z","version":"2.0.0"}' }, steps: ['npm install cowsay', 'cat package.json'] },
  'npm scripts': { files: { ...BASE, 'package.json': PKG, 'boom.js': 'throw new Error("x")\n' }, steps: ['npm start', 'npm test', 'npm t', 'npm run', 'npm run nope', 'npm run both', 'npm run bad', 'npm run ext', 'npm run-script start', 'npm -v'] },
  'npm start tip without a script': { files: { ...BASE, 'package.json': '{"name":"z","version":"1.0.0","scripts":{}}' }, steps: ['npm start', 'npm run', 'npm test'] },
  'npm without package.json': { files: BASE, steps: ['npm start', 'npm test'] },
  'npm with a broken package.json': { files: { 'package.json': '{' }, steps: ['npm start'] },
  'npx tsc cd': { files: BASE, steps: ['npx tsc', 'tsc', 'cd dir', 'cd'] },
  'not found and javascript-looking': { files: BASE, steps: ['foo', '', 'let a = 1', 'console.log(1)', 'const x', 'function f(){}', 'echo "hi"'] },
  'quotes in the command': { files: BASE, steps: ['cat "notes.txt"', "cat 'notes.txt'", 'node -e "console.log(\\"hi\\")"', 'touch "a b.js"', 'ls'] },
  'a server, curl and the refusal': { files: { ...BASE, 'server.js': SERVER, 'package.json': PKG }, steps: [{ s: 'node server.js', wait: true }, { s: 'curl localhost:3000', wait: true }, { s: 'curl -i http://localhost:3000/', wait: true }, 'node hello.js', 'npm start', 'npm test', 'npm run', 'ls', 'STOP', 'STOP'] },
  'ctrl+c stops a server': { files: { 'server.js': SERVER }, steps: [{ s: 'node server.js', wait: true }, 'CTRLC', 'CTRLC'] },
  'curl without a server': { files: BASE, steps: [{ s: 'curl localhost:3000', wait: true }, { s: 'curl', wait: true }] },
  'curl superseded by a newer run': { files: { 'server.js': SERVER }, steps: [{ s: 'node server.js', wait: true }, 'curl localhost:3000', 'pwd'] },
  'server file that throws asynchronously': { files: { 's.js': 'require("http").createServer(()=>{}).listen(3000,()=>{throw new Error("in listen")})\n' }, steps: [{ s: 'node s.js', wait: true }] },
};

const EXPECTED = {
  "ls root": {"lines":[["<span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">dir/</span>  <span style=\"color:var(--term-prompt)\">hello.js</span>  notes.txt  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">sub/</span>",""]],"run":{"src":"ls","mode":"sh","cmd":"ls","args":[],"ok":true,"out":["dir/  hello.js  notes.txt  sub/"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":[],"stops":[]},
  "ls root with node_modules": {"lines":[["<span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">dir/</span>  <span style=\"color:var(--term-prompt)\">hello.js</span>  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">node_modules/</span>  notes.txt  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">sub/</span>",""]],"run":{"src":"ls","mode":"sh","cmd":"ls","args":[],"ok":true,"out":["dir/  hello.js  node_modules  notes.txt  sub/"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":["cowsay"],"stops":[]},
  "ls folders and files": {"lines":[["<span style=\"color:var(--term-prompt)\">a.js</span>",""],["<span style=\"color:var(--term-prompt)\">a.js</span>",""],["ls: cannot access 'nope': No such file or directory","err"],["hello.js",""],["<span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">dir/</span>  <span style=\"color:var(--term-prompt)\">hello.js</span>  notes.txt  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">sub/</span>",""],["<span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">dir/</span>  <span style=\"color:var(--term-prompt)\">hello.js</span>  notes.txt  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">sub/</span>",""],["<span class=\"v-u\">(empty folder)</span>",""],["<span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">dir/</span>  <span style=\"color:var(--term-prompt)\">hello.js</span>  notes.txt  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">sub/</span>",""]],"run":{"src":"ls ./","mode":"sh","cmd":"ls","args":["./"],"ok":true,"out":["dir/  hello.js  notes.txt  sub/"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":[],"stops":[]},
  "cat": {"lines":[["cat: which file? Try: cat notes.txt","err"],["console.log(&quot;Welcome backstage!&quot;)",""],["Sweep the ring\nFeed Mumbles",""],["cat: dir: Is a directory","err"],["cat: dir/: Is a directory","err"],["cat: nope: No such file or directory","err"]],"run":{"src":"cat nope","mode":"sh","cmd":"cat","args":["nope"],"ok":false,"out":["cat: nope: No such file or directory"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":[],"stops":[]},
  "touch": {"lines":[["touch: missing file name","err"],["touch: cannot touch 'nope/a.js': No such file or directory","err"],["<span style=\"color:var(--term-prompt)\">a.js</span>  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">dir/</span>  <span style=\"color:var(--term-prompt)\">hello.js</span>  notes.txt  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">sub/</span>",""],["<span style=\"color:var(--term-prompt)\">a.js</span>  <span style=\"color:var(--term-prompt)\">b.js</span>",""]],"run":{"src":"ls dir","mode":"sh","cmd":"ls","args":["dir"],"ok":true,"out":["a.js  b.js"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":"","a.js":"","dir/b.js":""},"pkgs":[],"stops":[]},
  "rm": {"lines":[["rm: cannot remove '': No such file or directory","err"],["rm: cannot remove 'dir': Is a directory","err"],["rm: cannot remove 'nope': No such file or directory","err"],["<span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">dir/</span>  notes.txt  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">sub/</span>  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">x/</span>",""],["<span class=\"v-u\">(empty folder)</span>",""]],"run":{"src":"ls x","mode":"sh","cmd":"ls","args":["x"],"ok":true,"out":[""],"logs":[]},"files":{"notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","sub/":"","x/":""},"pkgs":[],"stops":[]},
  "mkdir": {"lines":[["mkdir: missing operand","err"],["mkdir: cannot create directory 'd': File exists","err"],["mkdir: cannot create directory 'a/b': No such file or directory","err"],["mkdir: cannot create directory 'hello.js/x': File exists","err"],["mkdir: cannot create directory 'dir': File exists","err"],["<span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">a/</span>  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">d/</span>  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">dir/</span>  <span style=\"color:var(--term-prompt)\">hello.js</span>  notes.txt  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">sub/</span>",""],["<span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">c/</span>",""]],"run":{"src":"ls a/b","mode":"sh","cmd":"ls","args":["a/b"],"ok":true,"out":["c/"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":"","d/":"","a/":"","a/b/":"","a/b/c/":""},"pkgs":[],"stops":[]},
  "pwd help clear": {"lines":[["/home/you/my-app",""],["Commands here: ls [dir], cat &lt;file&gt;, pwd, touch &lt;file&gt;, rm &lt;file&gt;, mkdir [-p] &lt;dir&gt;, clear,\nnode &lt;file&gt; [words…], node -e &quot;code&quot;, node -v,\nnpm init -y, npm install &lt;package&gt;, npm start, npm run &lt;script&gt;, npm test,\ncurl [-i] [-s] [-X METHOD] [-Z] &lt;url&gt;…","sys"],["CLEAR",""]],"run":{"src":"clear","mode":"sh","cmd":"clear","args":[],"ok":true,"out":[],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":[],"stops":[]},
  "node runs a file": {"lines":[["Welcome backstage!",""],["Welcome backstage!",""],["node:internal/modules/cjs/loader","sys"],["Error: Cannot find module '/home/you/my-app/nope'","err"],["Tip: check the file name with ls. Names are case-sensitive.","tip"],["node:internal/modules/cjs/loader","sys"],["Error: Cannot find module '/home/you/my-app/nope.js'","err"],["Tip: check the file name with ls. Names are case-sensitive.","tip"]],"run":{"src":"node nope.js","mode":"sh","cmd":"node","args":["nope.js"],"ok":false,"out":["node:internal/modules/cjs/loader","Error: Cannot find module '/home/you/my-app/nope.js'"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":[],"stops":[]},
  "node -e -p -v and bare": {"lines":[["2",""],["2",""],["3",""],["node: -e requires an argument","err"],["v22.12.0",""],["v22.12.0",""],["This would open Node's interactive console (the REPL). You already know it: it is the &gt; console from chapters 1–10.\nHere, run a file instead: node hello.js","tip"]],"run":{"src":"node","mode":"sh","cmd":"node","args":[],"ok":true,"out":["This would open Node's interactive console (the REPL). You already know it: it is the > console from chapters 1–10.\nHere, run a file instead: node hello.js"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":[],"stops":[]},
  "node refuses non JS and warns when unsaved": {"lines":[["That is not a JavaScript file. Node runs .js files.","err"],["Heads up: hello.js has unsaved changes in the editor, so Node runs the last saved version. Press Save (Ctrl+S) first.","tip"],["Welcome backstage!",""],["That is not a JavaScript file. Node runs .js files.","err"]],"run":{"src":"node notes.txt","mode":"sh","cmd":"node","args":["notes.txt"],"ok":false,"out":["That is not a JavaScript file. Node runs .js files."],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":"","x.ts":"let a: number = 1\n","data.json":"{\"a\":1}"},"pkgs":[],"stops":[]},
  "node errors": {"lines":[["/home/you/my-app/boom.js","sys"],["Error: kaboom","err"],["Node.js v22.12.0","sys"],["/home/you/my-app/ref.js","sys"],["ReferenceError: nope is not defined","err"],["Node.js v22.12.0","sys"],["/home/you/my-app/fs.js","sys"],["Error: ENOENT: no such file or directory, open 'missing.txt'","err"],["  code: 'ENOENT'","err"],["Node.js v22.12.0","sys"],["Tip: check the path with ls","tip"],["TypeError: late","err"],["Node.js v22.12.0","sys"]],"run":{"src":"node late.js","mode":"sh","cmd":"node","args":["late.js"],"ok":false,"out":[],"logs":[],"ran":{"file":"late.js","code":"setTimeout(()=>{throw new TypeError(\"late\")},0)\n"},"server":[]},"files":{"boom.js":"throw new Error(\"kaboom\")\n","ref.js":"nope()\n","fs.js":"require(\"fs\").readFileSync(\"missing.txt\")\n","exit.js":"process.exit(2)\n","ok.js":"process.exit(0)\n","late.js":"setTimeout(()=>{throw new TypeError(\"late\")},0)\n"},"pkgs":[],"stops":[]},
  "node builtins off": {"lines":[["/home/you/my-app/[eval]","sys"],["Error: Cannot find module 'assert'","err"],["  code: 'MODULE_NOT_FOUND'","err"],["Node.js v22.12.0","sys"],["/home/you/my-app/[eval]","sys"],["Error: Cannot find module 'test'","err"],["  code: 'MODULE_NOT_FOUND'","err"],["Node.js v22.12.0","sys"],["/home/you/my-app/[eval]","sys"],["Error: Cannot find module 'nope'","err"],["  code: 'MODULE_NOT_FOUND'","err"],["Node.js v22.12.0","sys"]],"run":{"src":"node -e \"require('nope')\"","mode":"sh","cmd":"node","args":["-e","require('nope')"],"ok":false,"out":[],"logs":[],"ran":{"file":"[eval]","code":"require('nope')"},"server":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":[],"stops":[]},
  "npm basics": {"lines":[["npm &lt;command&gt;\n\nUsage:\nnpm init -y        create package.json\nnpm install &lt;pkg&gt;  add a package\nnpm start          run the &quot;start&quot; script\nnpm run &lt;name&gt;     run any script","sys"],["10.9.2",""],["npm init normally asks you questions (name, version, …). Add -y to accept the defaults: npm init -y","tip"],["Wrote to /home/you/my-app/package.json:\n\n{\n  &quot;name&quot;: &quot;my-app&quot;,\n  &quot;version&quot;: &quot;1.0.0&quot;,\n  &quot;description&quot;: &quot;&quot;,\n  &quot;main&quot;: &quot;index.js&quot;,\n  &quot;scripts&quot;: {\n    &quot;test&quot;: &quot;echo \\&quot;Error: no test specified\\&quot; &amp;&amp; exit 1&quot;\n  },\n  &quot;keywords&quot;: [],\n  &quot;author&quot;: &quot;&quot;,\n  &quot;license&quot;: &quot;ISC&quot;\n}\n",""],["Wrote to /home/you/my-app/package.json:\n\n{\n  &quot;name&quot;: &quot;my-app&quot;,\n  &quot;version&quot;: &quot;1.0.0&quot;,\n  &quot;description&quot;: &quot;&quot;,\n  &quot;main&quot;: &quot;index.js&quot;,\n  &quot;scripts&quot;: {\n    &quot;test&quot;: &quot;echo \\&quot;Error: no test specified\\&quot; &amp;&amp; exit 1&quot;\n  },\n  &quot;keywords&quot;: [],\n  &quot;author&quot;: &quot;&quot;,\n  &quot;license&quot;: &quot;ISC&quot;\n}\n",""],["npm error Unknown command: &quot;foo&quot;","err"],["npm error Missing script: &quot;start&quot;","err"],["Tip: add \"start\": \"node cow.js\" inside \"scripts\" in package.json, then save.","tip"]],"run":{"src":"npm start","mode":"sh","cmd":"npm","args":["start"],"ok":false,"out":["npm error Missing script: \"start\""],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":"","package.json":"{\n  \"name\": \"my-app\",\n  \"version\": \"1.0.0\",\n  \"description\": \"\",\n  \"main\": \"index.js\",\n  \"scripts\": {\n    \"test\": \"echo \\\"Error: no test specified\\\" && exit 1\"\n  },\n  \"keywords\": [],\n  \"author\": \"\",\n  \"license\": \"ISC\"\n}\n"},"pkgs":[],"stops":[]},
  "npm install": {"lines":[["up to date, audited 0 packages in 1s",""],["npm error 404 Not Found - nope\nThis playground only has the cowsay package. On your own computer, npm can install any public package.","err"],["\nadded 1 package, and audited 2 packages in 1s\n\nfound 0 vulnerabilities",""],["up to date, audited 1 package in 1s",""],["\nadded 1 package, and audited 2 packages in 1s\n\nfound 0 vulnerabilities",""],["<span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">dir/</span>  <span style=\"color:var(--term-prompt)\">hello.js</span>  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">node_modules/</span>  notes.txt  package.json  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">sub/</span>",""],["{\n  &quot;name&quot;: &quot;my-app&quot;,\n  &quot;version&quot;: &quot;1.0.0&quot;,\n  &quot;description&quot;: &quot;&quot;,\n  &quot;main&quot;: &quot;index.js&quot;,\n  &quot;scripts&quot;: {\n    &quot;test&quot;: &quot;echo \\&quot;Error: no test specified\\&quot; &amp;&amp; exit 1&quot;\n  },\n  &quot;keywords&quot;: [],\n  &quot;author&quot;: &quot;&quot;,\n  &quot;license&quot;: &quot;ISC&quot;,\n  &quot;dependencies&quot;: {\n    &quot;cowsay&quot;: &quot;^1.6.0&quot;\n  }\n}",""]],"run":{"src":"cat package.json","mode":"sh","cmd":"cat","args":["package.json"],"ok":true,"out":["{\n  \"name\": \"my-app\",\n  \"version\": \"1.0.0\",\n  \"description\": \"\",\n  \"main\": \"index.js\",\n  \"scripts\": {\n    \"test\": \"echo \\\"Error: no test specified\\\" && exit 1\"\n  },\n  \"keywords\": [],\n  \"author\": \"\",\n  \"license\": \"ISC\",\n  \"dependencies\": {\n    \"cowsay\": \"^1.6.0\"\n  }\n}"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":"","package.json":"{\n  \"name\": \"my-app\",\n  \"version\": \"1.0.0\",\n  \"description\": \"\",\n  \"main\": \"index.js\",\n  \"scripts\": {\n    \"test\": \"echo \\\"Error: no test specified\\\" && exit 1\"\n  },\n  \"keywords\": [],\n  \"author\": \"\",\n  \"license\": \"ISC\",\n  \"dependencies\": {\n    \"cowsay\": \"^1.6.0\"\n  }\n}\n"},"pkgs":["cowsay"],"stops":[]},
  "npm install with a package.json": {"lines":[["\nadded 1 package, and audited 2 packages in 1s\n\nfound 0 vulnerabilities",""],["{\n  &quot;name&quot;: &quot;z&quot;,\n  &quot;version&quot;: &quot;2.0.0&quot;,\n  &quot;dependencies&quot;: {\n    &quot;cowsay&quot;: &quot;^1.6.0&quot;\n  }\n}",""]],"run":{"src":"cat package.json","mode":"sh","cmd":"cat","args":["package.json"],"ok":true,"out":["{\n  \"name\": \"z\",\n  \"version\": \"2.0.0\",\n  \"dependencies\": {\n    \"cowsay\": \"^1.6.0\"\n  }\n}"],"logs":[]},"files":{"package.json":"{\n  \"name\": \"z\",\n  \"version\": \"2.0.0\",\n  \"dependencies\": {\n    \"cowsay\": \"^1.6.0\"\n  }\n}\n"},"pkgs":["cowsay"],"stops":[]},
  "npm scripts": {"lines":[["\n&gt; my-app@1.0.0 start\n&gt; node hello.js\n","sys"],["Welcome backstage!",""],["\n&gt; my-app@1.0.0 test\n&gt; echo &quot;Error: no test specified&quot; &amp;&amp; exit 1\n","sys"],["Error: no test specified",""],["npm error Lifecycle script `test` failed with error:\nnpm error code 1","err"],["\n&gt; my-app@1.0.0 test\n&gt; echo &quot;Error: no test specified&quot; &amp;&amp; exit 1\n","sys"],["Error: no test specified",""],["npm error Lifecycle script `test` failed with error:\nnpm error code 1","err"],["Scripts available in my-app via `npm run`:\n  start\n    node hello.js\n  test\n    echo &quot;Error: no test specified&quot; &amp;&amp; exit 1\n  both\n    node hello.js &amp;&amp; echo done\n  bad\n    node boom.js &amp;&amp; echo never\n  ext\n    tsc",""],["npm error Missing script: &quot;nope&quot;","err"],["\n&gt; my-app@1.0.0 both\n&gt; node hello.js &amp;&amp; echo done\n","sys"],["Welcome backstage!",""],["done",""],["\n&gt; my-app@1.0.0 bad\n&gt; node boom.js &amp;&amp; echo never\n","sys"],["/home/you/my-app/boom.js","sys"],["Error: x","err"],["Node.js v22.12.0","sys"],["\n&gt; my-app@1.0.0 ext\n&gt; tsc\n","sys"],["sh: tsc: not available in this playground","err"],["\n&gt; my-app@1.0.0 start\n&gt; node hello.js\n","sys"],["Welcome backstage!",""],["10.9.2",""]],"run":{"src":"npm -v","mode":"sh","cmd":"npm","args":["-v"],"ok":true,"out":["10.9.2"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":"","package.json":"{\n  \"name\": \"my-app\",\n  \"version\": \"1.0.0\",\n  \"scripts\": {\n    \"start\": \"node hello.js\",\n    \"test\": \"echo \\\"Error: no test specified\\\" && exit 1\",\n    \"both\": \"node hello.js && echo done\",\n    \"bad\": \"node boom.js && echo never\",\n    \"ext\": \"tsc\"\n  }\n}","boom.js":"throw new Error(\"x\")\n"},"pkgs":[],"stops":[]},
  "npm start tip without a script": {"lines":[["npm error Missing script: &quot;start&quot;","err"],["Tip: add \"start\": \"node cow.js\" inside \"scripts\" in package.json, then save.","tip"],["Scripts available in my-app via `npm run`:\n",""],["npm error Missing script: &quot;test&quot;","err"]],"run":{"src":"npm test","mode":"sh","cmd":"npm","args":["test"],"ok":false,"out":["npm error Missing script: \"test\""],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":"","package.json":"{\"name\":\"z\",\"version\":\"1.0.0\",\"scripts\":{}}"},"pkgs":[],"stops":[]},
  "npm without package.json": {"lines":[["npm error enoent Could not read package.json\nRun npm init -y first.","err"],["npm error enoent Could not read package.json\nRun npm init -y first.","err"]],"run":{"src":"npm test","mode":"sh","cmd":"npm","args":["test"],"ok":false,"out":["npm error enoent Could not read package.json\nRun npm init -y first."],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":[],"stops":[]},
  "npm with a broken package.json": {"lines":[["npm error enoent Could not read package.json\nRun npm init -y first.","err"]],"run":{"src":"npm start","mode":"sh","cmd":"npm","args":["start"],"ok":false,"out":["npm error enoent Could not read package.json\nRun npm init -y first."],"logs":[]},"files":{"package.json":"{"},"pkgs":[],"stops":[]},
  "npx tsc cd": {"lines":[["npx runs a package's command without installing it globally. You will use it for things like npx tsc. Not available in this playground.","tip"],["tsc is the TypeScript compiler. On your computer: npm install -D typescript, then npx tsc. See the Field guide.","tip"],["This playground keeps you in ~/my-app. To move between folders, play Shell Quest.","tip"],["This playground keeps you in ~/my-app. To move between folders, play Shell Quest.","tip"]],"run":{"src":"cd","mode":"sh","cmd":"cd","args":[],"ok":true,"out":["This playground keeps you in ~/my-app. To move between folders, play Shell Quest."],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":[],"stops":[]},
  "not found and javascript-looking": {"lines":[["bash: foo: command not found","err"],["Type help to see the commands this terminal knows.","tip"],["bash: : command not found","err"],["Type help to see the commands this terminal knows.","tip"],["bash: syntax error","err"],["That looks like JavaScript, but this is the terminal. Put the code in a file and run node file.js, or try: node -e \"your code\"","tip"],["bash: syntax error","err"],["That looks like JavaScript, but this is the terminal. Put the code in a file and run node file.js, or try: node -e \"your code\"","tip"],["bash: syntax error","err"],["That looks like JavaScript, but this is the terminal. Put the code in a file and run node file.js, or try: node -e \"your code\"","tip"],["bash: syntax error","err"],["That looks like JavaScript, but this is the terminal. Put the code in a file and run node file.js, or try: node -e \"your code\"","tip"],["bash: syntax error","err"],["That looks like JavaScript, but this is the terminal. Put the code in a file and run node file.js, or try: node -e \"your code\"","tip"]],"run":{"src":"echo \"hi\"","mode":"sh","cmd":"echo","args":["hi"],"ok":false,"out":["bash: syntax error"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":[],"stops":[]},
  "quotes in the command": {"lines":[["Sweep the ring\nFeed Mumbles",""],["Sweep the ring\nFeed Mumbles",""],["hi",""],["<span style=\"color:var(--term-prompt)\">a b.js</span>  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">dir/</span>  <span style=\"color:var(--term-prompt)\">hello.js</span>  notes.txt  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">sub/</span>",""]],"run":{"src":"ls","mode":"sh","cmd":"ls","args":[],"ok":true,"out":["a b.js  dir/  hello.js  notes.txt  sub/"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":"","a b.js":""},"pkgs":[],"stops":[]},
  "a server, curl and the refusal": {"lines":[["up",""],["(took 1 ms, virtual)","sys"],["hi",""],["(took 1 ms, virtual)","sys"],["HTTP/1.1 200 OK\nContent-Length: 2\n\nhi",""],["A program is still running. Press Stop (or Ctrl+C) first. In a real terminal you would open a second tab for curl.","err"],["A program is still running. Press Stop (or Ctrl+C) first. In a real terminal you would open a second tab for curl.","err"],["A program is still running. Press Stop (or Ctrl+C) first. In a real terminal you would open a second tab for curl.","err"],["A program is still running. Press Stop (or Ctrl+C) first. In a real terminal you would open a second tab for curl.","err"],["<span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">dir/</span>  <span style=\"color:var(--term-prompt)\">hello.js</span>  notes.txt  package.json  <span style=\"color:var(--term-prompt)\">server.js</span>  <span class=\"c-d\" style=\"color:var(--term-dir);font-weight:600\">sub/</span>",""],["Stopped node server.js","sys"]],"run":{"src":"ls","mode":"sh","cmd":"ls","args":[],"ok":true,"out":["dir/  hello.js  notes.txt  package.json  server.js  sub/"],"logs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":"","server.js":"const http=require(\"http\");http.createServer((q,s)=>s.end(\"hi\")).listen(3000,()=>console.log(\"up\"))\n","package.json":"{\n  \"name\": \"my-app\",\n  \"version\": \"1.0.0\",\n  \"scripts\": {\n    \"start\": \"node hello.js\",\n    \"test\": \"echo \\\"Error: no test specified\\\" && exit 1\",\n    \"both\": \"node hello.js && echo done\",\n    \"bad\": \"node boom.js && echo never\",\n    \"ext\": \"tsc\"\n  }\n}"},"pkgs":[],"stops":[true,false]},
  "ctrl+c stops a server": {"lines":[["up",""],["^C","sys"],["Stopped node server.js","sys"]],"run":{"src":"node server.js","mode":"sh","cmd":"node","args":["server.js"],"ok":true,"out":["up"],"logs":[],"ran":{"file":"server.js","code":"const http=require(\"http\");http.createServer((q,s)=>s.end(\"hi\")).listen(3000,()=>console.log(\"up\"))\n"},"server":[3000]},"files":{"server.js":"const http=require(\"http\");http.createServer((q,s)=>s.end(\"hi\")).listen(3000,()=>console.log(\"up\"))\n"},"pkgs":[],"stops":[true,false]},
  "curl without a server": {"lines":[["curl: (7) Failed to connect to localhost port 3000 after 0 ms: Couldn't connect to server","err"],["curl: no URL specified","err"]],"run":{"src":"curl","mode":"sh","cmd":"curl","args":[],"ok":false,"out":["curl: no URL specified"],"logs":[],"reqs":[]},"files":{"hello.js":"console.log(\"Welcome backstage!\")\n","notes.txt":"Sweep the ring\nFeed Mumbles\n","dir/":"","dir/a.js":"console.log(\"a\")\n","sub/":""},"pkgs":[],"stops":[]},
  "curl superseded by a newer run": {"lines":[["up",""],["/home/you/my-app",""]],"run":{"src":"pwd","mode":"sh","cmd":"pwd","args":[],"ok":true,"out":["/home/you/my-app"],"logs":[]},"files":{"server.js":"const http=require(\"http\");http.createServer((q,s)=>s.end(\"hi\")).listen(3000,()=>console.log(\"up\"))\n"},"pkgs":[],"stops":[]},
  "server file that throws asynchronously": {"lines":[["/home/you/my-app/s.js","sys"],["Error: in listen","err"],["Node.js v22.12.0","sys"]],"run":{"src":"node s.js","mode":"sh","cmd":"node","args":["s.js"],"ok":false,"out":[],"logs":[],"ran":{"file":"s.js","code":"require(\"http\").createServer(()=>{}).listen(3000,()=>{throw new Error(\"in listen\")})\n"},"server":[3000]},"files":{"s.js":"require(\"http\").createServer(()=>{}).listen(3000,()=>{throw new Error(\"in listen\")})\n"},"pkgs":[],"stops":[]}
};

async function drive(name) {
  const c = CASES[name];
  const { T, st } = makeTerminal({ files: c.files, pkgs: c.pkgs, file: c.file, dirty: c.dirty });
  const stops = [];
  for (const step of c.steps) {
    const s = typeof step === 'string' ? step : step.s;
    if (s === 'STOP') stops.push(T.stop(false));
    else if (s === 'CTRLC') stops.push(T.stop(true));
    else { const r = T.run(s); if (r && typeof r.then === 'function') await r; }
    if (step.wait) await settle(T);
  }
  await settle(T);
  const out = clean({ lines: st.lines, run: st.run, files: st.files, pkgs: st.pkgs, stops });
  T.reset();
  return out;
}

describe('Terminal in a bare context', () => {
  it('loads with no document and exposes create', () => {
    const src = fs.readFileSync(new URL('../../shared/terminal.js', import.meta.url), 'utf8');
    makeTerminal();
    assert.equal(typeof host.Terminal.create, 'function');
    assert.equal(host.document, undefined);
    assert.doesNotMatch(src, /\bdocument\b|\$\(['"]/);
    assert.match(src, /root\.Terminal\s*=/);
  });
  it('returns run, stop, procOn, reset, label and ports', () => {
    const { T } = makeTerminal();
    for (const k of ['run', 'stop', 'procOn', 'reset', 'label', 'ports']) assert.equal(typeof T[k], 'function', k);
    assert.equal(T.procOn(), false);
    assert.equal(T.label(), '');
    assert.deepEqual([...T.ports()], []);
  });
});

describe('Script terminal parity (ts off)', () => {
  for (const name of Object.keys(CASES)) {
    it(name, async () => {
      assert.ok(EXPECTED[name], 'no captured expectation for ' + name);
      assert.deepEqual(await drive(name), EXPECTED[name]);
    });
  }
});

describe('the running-process bar state', () => {
  it('syncBar gets {on, label, ports} and the label is RUN.src', async () => {
    const { T, st } = makeTerminal({ files: { 'server.js': SERVER } });
    T.run('node server.js');
    await settle(T);
    const last = st.syncs.at(-1);
    assert.equal(last.on, true);
    assert.equal(last.label, 'node server.js');
    assert.deepEqual([...last.ports], [3000]);
    assert.equal(st.run.src, 'node server.js');
    assert.equal(T.label(), 'node server.js');
    assert.deepEqual([...T.ports()], [3000]);
    assert.equal(T.procOn(), true);
    assert.equal(T.stop(true), true);
    const off = st.syncs.at(-1);
    assert.equal(off.on, false);
    assert.equal(T.procOn(), false);
    assert.equal(T.label(), '');
    assert.deepEqual([...T.ports()], []);
    assert.deepEqual(st.lines.slice(-2), [['^C', 'sys'], ['Stopped node server.js', 'sys']]);
    assert.equal(T.stop(), false);
    T.reset();
  });
  it('a program with no server is not a running process', () => {
    const { T, st } = makeTerminal({ files: { 'hello.js': HELLO } });
    T.run('node hello.js');
    assert.equal(st.syncs.at(-1).on, false);
    assert.equal(T.procOn(), false);
    T.reset();
  });
});

describe('the SYNC flag', () => {
  it('is set while the main file runs and cleared after, and only then does the out hook skip tryComplete', async () => {
    const { T, st } = makeTerminal({ files: { 'a.js': 'console.log("now");setTimeout(()=>console.log("late"),0)\n' } });
    T.run('node a.js');
    assert.deepEqual(st.syncTrace, [true, false]);
    assert.equal(st.sync, false);
    const nowIdx = st.lines.findIndex(l => l[0] === 'now');
    assert.equal(st.syncAtLine[nowIdx], true);
    assert.equal(st.completes, 1, 'only the shell wrap-up completes while the main file runs');
    for (let i = 0; i < 200 && !st.lines.some(l => l[0] === 'late'); i++) await wait(10);
    const lateIdx = st.lines.findIndex(l => l[0] === 'late');
    assert.ok(lateIdx > nowIdx);
    assert.equal(st.syncAtLine[lateIdx], false);
    assert.equal(st.completes, 2, 'the late line asks for completion');
    T.reset();
  });
});

describe('reset', () => {
  it('stops the process, kills the realm and prints nothing', async () => {
    const { T, st } = makeTerminal({ files: { 'server.js': SERVER } });
    T.run('node server.js');
    await settle(T);
    const n = st.lines.length;
    T.reset();
    assert.equal(T.procOn(), false);
    assert.equal(st.lines.length, n);
  });
});

// ---- TypeScript commands (ts on) ----
const texts = st => st.lines.map(l => l[0]);
const exec = async (T, ...cmds) => {
  for (const c of cmds) {
    const r = T.run(c); if (r && r.then) await r;
    await settle(T);
  }
};
const durations = s => s.replace(/\(\d+(\.\d+)?ms\)/g, '(Nms)').replace(/(duration_ms) [\d.]+/g, '$1 N');
const PRIMARY = '<span style="color:var(--term-prompt)">';
const FAILING = "const test = require('node:test'); test('boom', () => { throw new Error('x') });\n";

// Real tsc and node run in a temp folder outside the repo, without NODE_TEST_CONTEXT (set when this file runs under node --test).
const TSC_BIN = fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url));
const REAL_ENV = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
delete REAL_ENV.NODE_TEST_CONTEXT;
function real(files, args, tsc = false) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'term-real-'));
  try {
    for (const [k, v] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, k)), { recursive: true }); fs.writeFileSync(path.join(d, k), v); }
    const r = spawnSync(process.execPath, tsc ? [TSC_BIN, '--pretty', 'false', ...args] : args, { cwd: d, env: REAL_ENV, encoding: 'utf8', timeout: 60000 });
    const made = fs.readdirSync(d, { recursive: true }).filter(f => f.endsWith('.js') && !(f in files)).sort();
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, made };
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
}

describe('.ts files in the shell (ts on)', () => {
  it('touch, ls, cat, mkdir and rm work on .ts and .json files in folders, and ls colours .ts like .js', async () => {
    const { T, st } = makeTs({ files: { 'a.js': '1' } });
    await exec(T, 'mkdir src', 'touch src/util.ts', 'touch src/data.json', 'touch main.ts', 'ls', 'ls src', 'cat src/util.ts', 'rm src/data.json', 'ls src', 'rm main.ts', 'ls');
    const t = texts(st);
    assert.ok(t[0].includes(PRIMARY + 'a.js</span>') && t[0].includes(PRIMARY + 'main.ts</span>'));
    assert.equal(t[1], 'data.json  ' + PRIMARY + 'util.ts</span>');
    assert.equal(t[3], PRIMARY + 'util.ts</span>');
    assert.deepEqual(Object.keys(st.files).sort(), ['a.js', 'src/', 'src/util.ts']);
    T.reset();
  });
  it('with ts off, .ts is not coloured', async () => {
    const { T, st } = makeTerminal({ files: { 'x.ts': '1' } });
    T.run('ls');
    assert.deepEqual(st.lines, [['x.ts', '']]);
  });
  it('a sync command returns no Promise', () => {
    const { T } = makeTs({ files: { 'x.ts': '1' } });
    assert.equal(T.run('ls'), undefined);
    assert.equal(T.run('cat x.ts'), undefined);
  });
  it('help lists tsc and node --test', () => {
    const { T, st } = makeTs();
    T.run('help');
    assert.match(st.lines[0][0], /\ntsc \[files\], node --test \[files\]$/);
  });
});

describe('node file.ts (ts on)', () => {
  it('runs through transpileModule with no type check, so a type error does not stop it', async () => {
    const { T, st } = makeTs({ files: { 'x.ts': 'const a: number = "s" as any;\nconst b: string = a as unknown as string;\nconsole.log(b, typeof a)\n' } });
    await exec(T, 'node x.ts');
    assert.deepEqual(st.lines, [['s string', '']]);
    assert.equal(st.run.ok, true);
    assert.equal(st.run.exitCode, 0);
    T.reset();
  });
  it('a real type error is not reported by node', async () => {
    const { T, st } = makeTs({ files: { 'x.ts': 'const a: number = "s";\nconsole.log(a)\n' } });
    await exec(T, 'node x.ts');
    assert.deepEqual(st.lines, [['s', '']]);
    assert.deepEqual(clean(st.run.diags), []);
    T.reset();
  });
  it('a runtime throw prints Node\'s error block with the file name, exit code 1', async () => {
    const { T, st } = makeTs({ files: { 'x.ts': 'const f = (n: number): number => { throw new Error("boom " + n) }\nf(1)\n' } });
    await exec(T, 'node x.ts');
    assert.deepEqual(st.lines, [['/home/you/my-app/x.ts', 'sys'], ['Error: boom 1', 'err'], ['Node.js v22.12.0', 'sys']]);
    assert.equal(st.run.ok, false);
    assert.equal(st.run.exitCode, 1);
    T.reset();
  });
  it('enums and other non-erasable syntax run (the real node refuses them, by design)', async () => {
    const { T, st } = makeTs({ files: { 'x.ts': 'enum E { A, B }\nconsole.log(E.B, E[0])\n' } });
    await exec(T, 'node x.ts');
    assert.deepEqual(st.lines, [['1 A', '']]);
    T.reset();
  });
  it('node x.ts needs the compiler and says so once, never touching the file map', async () => {
    const { T, st } = makeTs({ files: { 'x.ts': 'console.log(1)\n' } }, { compiler: null, loadTS: () => Promise.resolve(false) });
    await exec(T, 'node x.ts');
    assert.deepEqual(st.lines.at(-1), ['Could not load the TypeScript compiler. Check your internet connection, then run the command again.', 'err']);
    assert.equal(st.run.ok, false);
    assert.equal(st.run.exitCode, 1);
  });
  it('a .js file runs with no compiler at all', async () => {
    let loads = 0;
    const { T, st } = makeTs({ files: { 'x.js': 'console.log(2)\n' } }, { compiler: null, loadTS: () => { loads++; return Promise.resolve(false); } });
    await exec(T, 'node x.js');
    assert.deepEqual(st.lines, [['2', '']]);
    assert.equal(loads, 0);
    T.reset();
  });
  it('the fs and require case: reads its own JSON and source, requires a .ts module, writes a file ls shows', async () => {
    const files = {
      'main.ts': "import fs from 'fs'\nimport { total } from './util'\nimport { total as again } from './util.ts'\nconst t = JSON.parse(fs.readFileSync('timetable.json', 'utf8'))\nconst self: string = fs.readFileSync('main.ts', 'utf8')\nconst listing: string[] = fs.readdirSync('.')\nfs.writeFileSync('out.json', JSON.stringify({ total: total(t.slots), again: again(t.slots), lines: self.split('\\n').length, listing }))\nconsole.log('wrote', total(t.slots), listing.join(','))\n",
      'util.ts': 'export const total = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)\n',
      'timetable.json': '{"slots":[1,2,3]}',
    };
    const { T, st } = makeTs({ files });
    await exec(T, 'node main.ts', 'ls', 'cat out.json');
    assert.deepEqual(texts(st).slice(0, 1), ['wrote 6 main.ts,timetable.json,util.ts']);
    assert.deepEqual(JSON.parse(st.files['out.json']), { total: 6, again: 6, lines: 9, listing: ['main.ts', 'timetable.json', 'util.ts'] });
    assert.match(texts(st)[1], /out\.json/);
    assert.equal(texts(st).at(-1), '{&quot;total&quot;:6,&quot;again&quot;:6,&quot;lines&quot;:9,&quot;listing&quot;:[&quot;main.ts&quot;,&quot;timetable.json&quot;,&quot;util.ts&quot;]}');
    T.reset();
  });
  it('require resolves the exact key, then .js, .json, then .ts; a stale .js wins over a changed .ts', async () => {
    const { T, st } = makeTs({ files: { 'main.ts': "console.log(require('./m').v, require('./j').v, require('./only').v)\n", 'm.js': 'exports.v = "js"', 'm.ts': 'export const v = "ts"', 'j.json': '{"v":"json"}', 'j.ts': 'export const v = "ts"', 'only.ts': 'export const v = "ts"' } });
    await exec(T, 'node main.ts');
    assert.deepEqual(st.lines, [['js json ts', '']]);
    T.reset();
  });
  it('prints the same lines as projectRun for the clean 3-file project', async () => {
    const THREE = {
      'greet.ts': 'export function greet(who: string): string { return `hello ${who}` }',
      'util/shout.ts': 'export const shout = (s: string): string => s.toUpperCase() + "!"',
      'main.ts': "import { greet } from './greet'\nimport { shout } from './util/shout'\nconsole.log(shout(greet('ts')))",
    };
    const { T, st } = makeTs({ files: THREE });
    await exec(T, 'node main.ts');
    assert.deepEqual(texts(st), (await projectRun(THREE)).out);
    T.reset();
  });
  it('tsc reports the same diags as projectRun for a project with a type error', async () => {
    const BAD = { 'tsconfig.json': '{"compilerOptions":{"strict":true}}', 'main.ts': 'const n: number = "a"\n' };
    const { T, st } = makeTs({ files: BAD });
    await exec(T, 'tsc');
    const want = (await projectRun(BAD)).diags;
    assert.equal(want.length, 1);
    assert.equal(want[0].code, 2322);
    assert.deepEqual(clean(st.run.diags), clean(want));
    T.reset();
  });
  it('every command calls renderProject once', async () => {
    const { T, st } = makeTs({ files: { 'a.ts': 'console.log(1)\n' } });
    for (const c of ['ls', 'pwd', 'touch b.ts', 'cat a.ts', 'cat nope']) {
      const before = st.renders;
      T.run(c);
      assert.equal(st.renders - before, 1, c);
    }
    const before = st.renders;
    await exec(T, 'node a.ts');
    assert.equal(st.renders - before, 1, 'node a.ts');
    T.reset();
  });
  it('sets the RUN fields of the ts shape', async () => {
    const { T, st } = makeTs({ files: { 'x.ts': 'console.log(1)\n' } });
    await exec(T, 'node x.ts');
    assert.deepEqual(Object.keys(st.run).sort(), ['args', 'cmd', 'diags', 'exitCode', 'files', 'logs', 'mode', 'ok', 'out', 'ran', 'server', 'src', 't', 'tests']);
    assert.equal(st.run.logs, st.run.out);
    assert.deepEqual(clean(st.run.out), ['1']);
    assert.equal(st.run.tests, null);
    T.reset();
  });
});

describe('exit codes and stderr (ts on)', () => {
  const exitOf = async code => {
    const { T, st } = makeTs({ files: { 'x.js': code } });
    await exec(T, 'node x.js');
    const r = { code: st.run.exitCode, ok: st.run.ok, lines: st.lines };
    T.reset();
    return r;
  };
  it('process.exit(3) gives 3', async () => { const r = await exitOf('process.exit(3)'); assert.equal(r.code, 3); assert.equal(r.ok, false); });
  it('process.exit(0) gives 0', async () => { const r = await exitOf('process.exit(0)'); assert.equal(r.code, 0); assert.equal(r.ok, true); });
  it('process.exitCode = 2 at a clean end gives 2', async () => { const r = await exitOf('process.exitCode = 2'); assert.equal(r.code, 2); assert.equal(r.ok, false); });
  it('an uncaught throw gives 1', async () => { const r = await exitOf('throw new Error("x")'); assert.equal(r.code, 1); });
  it('an uncaught error in a timer gives 1', async () => { const r = await exitOf('setTimeout(() => { throw new Error("late") }, 0)'); assert.equal(r.code, 1); assert.equal(r.ok, false); });
  it('a clean run gives 0', async () => { assert.equal((await exitOf('console.log(1)')).code, 0); });
  it('a failing shell command gives 1', () => {
    const { T, st } = makeTs();
    T.run('cat nope');
    assert.equal(st.run.exitCode, 1);
  });
  it('process.stderr.write prints with the err class and is recorded, with ts on and off', async () => {
    for (const mk of [makeTs, makeTerminal]) {
      const { T, st } = mk({ files: { 'x.js': 'process.stderr.write("oops\\n");process.stdout.write("fine\\n")' } });
      await exec(T, 'node x.js');
      assert.deepEqual(st.lines, [['oops', 'err'], ['fine', '']]);
      assert.deepEqual(clean(st.run.out), ['oops', 'fine']);
      T.reset();
    }
  });
});

describe('npm run with names that are not own scripts', () => {
  it('prints the missing-script line, with ts on and off, and never throws', async () => {
    const pkg = '{"name":"z","version":"1.0.0","scripts":{"num":5,"ok":"echo hi"}}';
    for (const mk of [makeTs, makeTerminal]) {
      for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'num', 'nope']) {
        const { T, st } = mk({ files: { 'package.json': pkg } });
        await exec(T, 'npm run ' + name);
        assert.deepEqual(st.lines, [['npm error Missing script: &quot;' + name + '&quot;', 'err']], name);
        assert.equal(st.run.ok, false);
        T.reset();
      }
    }
  });
});

describe('tsc (ts on)', () => {
  const TSCONFIG = '{"compilerOptions":{"strict":true}}';
  it('a folder marker made by mkdir and touch does not stop tsc, and the folder gets its .js', async () => {
    const { T, st } = makeTs({ files: { 'tsconfig.json': TSCONFIG } });
    await exec(T, 'mkdir src', 'touch src/a.ts', 'tsc');
    assert.ok('src/' in st.files);
    assert.deepEqual(st.lines, []);
    assert.equal(st.run.exitCode, 0);
    assert.ok('src/a.js' in st.files, Object.keys(st.files).join(','));
    T.reset();
  });
  it('with no tsconfig and no files prints the version and help, exit 1', async () => {
    const { T, st } = makeTs({ files: { 'a.ts': 'export const a = 1\n' } });
    await exec(T, 'tsc');
    assert.equal(st.run.exitCode, 1);
    assert.equal(st.run.ok, false);
    assert.equal(st.lines.length, 1);
    assert.match(st.lines[0][0], new RegExp('^Version ' + ts.version.replace(/\./g, '\\.') + '\ntsc: The TypeScript Compiler - Version '));
    assert.deepEqual(clean(st.run.diags), []);
  });
  it('reads tsconfig.json: a clean project is silent and writes a .js beside each .ts', async () => {
    const { T, st } = makeTs({ files: { 'tsconfig.json': TSCONFIG, 'a.ts': 'export const a: number = 1\n', 'src/b.ts': 'export const b = 2\n' } });
    await exec(T, 'tsc');
    assert.deepEqual(st.lines, []);
    assert.equal(st.run.exitCode, 0);
    assert.equal(st.run.ok, true);
    assert.deepEqual(Object.keys(st.files).sort(), ['a.js', 'a.ts', 'src/b.js', 'src/b.ts', 'tsconfig.json']);
    assert.match(st.files['a.js'], /exports\.a = 1/);
  });
  it('prints file(line,col): error TSnnnn: message, one per line, still writes .js, exit 2', async () => {
    const { T, st } = makeTs({ files: { 'tsconfig.json': TSCONFIG, 'a.ts': 'export const a: number = "x"\n' } });
    await exec(T, 'tsc');
    assert.deepEqual(st.lines, [["a.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.", 'err']]);
    assert.equal(st.run.exitCode, 2);
    assert.equal(st.run.ok, false);
    assert.deepEqual(clean(st.run.out), [st.lines[0][0]]);
    assert.deepEqual(clean(st.run.diags), [{ file: 'a.ts', line: 1, col: 14, code: 2322, msg: "Type 'string' is not assignable to type 'number'." }]);
    assert.ok('a.js' in st.files);
  });
  it('noEmit writes nothing', async () => {
    const { T, st } = makeTs({ files: { 'tsconfig.json': '{"compilerOptions":{"noEmit":true}}', 'a.ts': 'export const a = 1\n' } });
    await exec(T, 'tsc');
    assert.deepEqual(Object.keys(st.files).sort(), ['a.ts', 'tsconfig.json']);
    assert.equal(st.run.exitCode, 0);
  });
  it('outDir is ignored: the .js lands beside the .ts', async () => {
    const { T, st } = makeTs({ files: { 'tsconfig.json': '{"compilerOptions":{"outDir":"dist"}}', 'a.ts': 'export const a = 1\n' } });
    await exec(T, 'tsc');
    assert.deepEqual(Object.keys(st.files).sort(), ['a.js', 'a.ts', 'tsconfig.json']);
  });
  it('module: esnext still emits CommonJS that node runs', async () => {
    const { T, st } = makeTs({ files: { 'tsconfig.json': '{"compilerOptions":{"module":"esnext"}}', 'main.ts': "import { n } from './n'\nconsole.log(n)\n", 'n.ts': 'export const n = 7\n' } });
    await exec(T, 'tsc', 'node main.js');
    assert.deepEqual(st.lines, [['7', '']]);
    T.reset();
  });
  it('tsc <files> checks the named files and what they import, with non-strict defaults, ignoring tsconfig.json', async () => {
    const files = { 'tsconfig.json': TSCONFIG, 'a.ts': "import { b } from './b'\nexport const a: number = b\nfunction f(x) { return x }\n", 'b.ts': 'export const b: string = 1\n', 'other.ts': 'export const o: number = "bad"\n' };
    const { T, st } = makeTs({ files });
    await exec(T, 'tsc a.ts');
    assert.deepEqual(texts(st), ["a.ts(2,14): error TS2322: Type 'string' is not assignable to type 'number'.", "b.ts(1,14): error TS2322: Type 'number' is not assignable to type 'string'."]);
    assert.equal(st.run.exitCode, 2);
    assert.equal(st.files['tsconfig.json'], TSCONFIG, 'the real tsconfig is never written over');
    assert.ok('a.js' in st.files && 'b.js' in st.files && !('other.js' in st.files));
  });
  it('a named file that does not exist is TS6053, exit 2, nothing written', async () => {
    const { T, st } = makeTs({ files: { 'a.ts': '1' } });
    await exec(T, 'tsc nope.ts', 'tsc ../a.ts');
    assert.deepEqual(texts(st), ["error TS6053: File 'nope.ts' not found.\n  The file is in the program because:\n    Root file specified for compilation", "error TS6053: File '../a.ts' not found.\n  The file is in the program because:\n    Root file specified for compilation"]);
    assert.equal(st.run.exitCode, 2);
    assert.deepEqual(Object.keys(st.files), ['a.ts']);
  });
  it('flags are ignored', async () => {
    const { T, st } = makeTs({ files: { 'a.ts': 'export const a = 1\n' } });
    await exec(T, 'tsc --noEmit a.ts');
    assert.deepEqual(st.lines, []);
    assert.equal(st.run.exitCode, 0);
  });
  it('the compiler loads on demand, a load failure says so, and the next tsc retries', async () => {
    let calls = 0;
    const { T, st } = makeTs({ files: { 'tsconfig.json': TSCONFIG, 'a.ts': 'export const a: number = "x"\n' } }, { compiler: null, loadTS: () => { calls++; if (calls === 2) host.ts = ts; return Promise.resolve(calls === 2); } });
    try {
      await exec(T, 'tsc');
      assert.deepEqual(texts(st), ['Loading the TypeScript compiler…', 'Could not load the TypeScript compiler. Check your internet connection, then run the command again.']);
      assert.equal(st.run.exitCode, 1);
      assert.equal(st.run.ok, false);
      assert.deepEqual(Object.keys(st.files).sort(), ['a.ts', 'tsconfig.json']);
      await exec(T, 'tsc');
      assert.equal(calls, 2);
      assert.equal(texts(st).at(-1), "a.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.");
      await exec(T, 'tsc');
      assert.equal(calls, 2, 'a loaded compiler is not loaded again');
    } finally { delete host.ts; }
  });
  it('a run superseded while the compiler loads drops its late result', async () => {
    let release;
    const { T, st } = makeTs({ files: { 'tsconfig.json': TSCONFIG, 'a.ts': 'export const a: number = "x"\n' } }, { compiler: null, loadTS: () => new Promise(r => { release = r; }) });
    try {
      const p = T.run('tsc');
      T.run('pwd');
      host.ts = ts;
      release(true);
      await p;
      await wait(5);
      assert.deepEqual(texts(st), ['Loading the TypeScript compiler…', '/home/you/my-app']);
      assert.equal(st.run.src, 'pwd');
      assert.deepEqual(Object.keys(st.files).sort(), ['a.ts', 'tsconfig.json']);
      assert.equal(st.completes, 1, 'only the shell wrap-up of pwd completes');
    } finally { delete host.ts; }
  });
});

describe('tsc matches the pinned real tsc', () => {
  const NONSTRICT = '{"compilerOptions":{}}', STRICT = '{"compilerOptions":{"strict":true}}';
  const cfg = (c, a, extra = {}) => ({ 'tsconfig.json': c, 'a.ts': a, ...extra });
  const CORPUS = {
    'TS2322': [cfg(NONSTRICT, 'export const a: number = "x"\n'), []],
    'TS2345': [cfg(NONSTRICT, 'function f(n: number) { return n }\nf("s")\n'), []],
    'TS2339': [cfg(NONSTRICT, 'const o = { a: 1 }\no.b\n'), []],
    'TS2307': [cfg(NONSTRICT, 'import { x } from "./nope"\nexport { x }\n'), []],
    'TS7006 under strict': [cfg(STRICT, 'function f(a) { return a }\nexport { f }\n'), []],
    'TS2304': [cfg(NONSTRICT, 'export const a = nope\n'), []],
    'TS1005': [cfg(NONSTRICT, 'const a = {;\n'), []],
    'clean': [cfg(NONSTRICT, 'export const a: number = 1\n'), []],
    'two files, the error is in the imported one': [{ 'a.ts': 'import { b } from "./b"\nexport const a: number = b\n', 'b.ts': 'export const b: string = 1\n' }, ['a.ts']],
    'noEmit with an error': [cfg('{"compilerOptions":{"noEmit":true}}', 'export const a: number = "x"\n'), []],
    'noEmit clean': [cfg('{"compilerOptions":{"noEmit":true}}', 'export const a = 1\n'), []],
    'files named next to a strict tsconfig (the tsconfig is ignored)': [cfg(STRICT, 'function f(a) { return a }\nexport { f }\n'), ['a.ts']],
    'a named file that is missing': [{ 'a.ts': '1' }, ['nope.ts']],
    'only the named file and its imports': [{ 'src/a.ts': 'export const a = 1\n', 'src/b.ts': 'export const b: number = "x"\n' }, ['src/a.ts']],
  };
  for (const [name, [files, args]] of Object.entries(CORPUS)) {
    it(name, async () => {
      const r = real(files, args, true);
      const { T, st } = makeTs({ files });
      await exec(T, 'tsc ' + args.join(' '));
      assert.equal(st.run.exitCode, r.status, 'exit status');
      assert.equal(texts(st).join('\n') + (st.lines.length ? '\n' : ''), r.stdout);
      assert.deepEqual(Object.keys(st.files).filter(f => f.endsWith('.js')).sort(), r.made, 'emitted files');
    });
  }
  it('with no tsconfig and no files, real tsc prints its help and exits 1, and ours starts the same way', async () => {
    const files = { 'a.ts': 'export const a = 1\n' };
    const r = real(files, [], true);
    const { T, st } = makeTs({ files });
    await exec(T, 'tsc');
    assert.equal(r.status, 1);
    assert.equal(st.run.exitCode, 1);
    assert.ok(r.stdout.startsWith(texts(st)[0] + '\n'), 'ours is a leading part of the real help');
    assert.deepEqual(Object.keys(st.files), ['a.ts']);
  });
});

describe('node --test and test files (ts on)', () => {
  const T1 = n => `const test = require('node:test'); test('${n}', () => {});\n`;
  const FAIL = "const test = require('node:test'); test('boom', () => { throw new Error('x') });\n";
  const SUMMARY = ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
  const block = (o, d) => SUMMARY.map(k => `ℹ ${k} ${o[k] || 0}`).concat('ℹ duration_ms ' + d);
  it('node a.test.js and node a.test.ts print the spec lines and RUN.tests', async () => {
    for (const f of ['a.test.js', 'a.test.ts']) {
      const { T, st } = makeTs({ files: { [f]: "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('adds', () => { assert.equal(1 + 1, 2) })\n".replace(/import (\w+) from '([^']+)'/g, f.endsWith('.js') ? 'const $1 = require(\'$2\')' : '$&') } });
      await exec(T, 'node ' + f);
      const t = durations(texts(st).join('\n')).split('\n');
      assert.deepEqual(t, ['✔ adds (Nms)', ...block({ tests: 1, pass: 1 }, 'N')], f);
      assert.equal(st.run.exitCode, 0);
      assert.equal(st.run.ok, true);
      assert.deepEqual({ ...st.run.tests, duration_ms: 0 }, { tests: 1, suites: 0, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0, duration_ms: 0 });
      T.reset();
    }
  });
  it('a failing test gives exit code 1, ok false and the failing section', async () => {
    const { T, st } = makeTs({ files: { 'a.test.ts': FAIL } });
    await exec(T, 'node a.test.ts');
    assert.equal(st.run.exitCode, 1);
    assert.equal(st.run.ok, false);
    assert.equal(st.run.tests.fail, 1);
    assert.ok(texts(st).includes('✖ failing tests:'));
    assert.ok(texts(st).some(l => l === '  Error: x'));
    T.reset();
  });
  it('node --test a b runs each file in its own realm and prints one summed block', async () => {
    const { T, st } = makeTs({ files: { 'a.test.js': T1('in-a'), 'b.test.ts': T1('in-b') } });
    await exec(T, 'node --test a.test.js b.test.ts');
    assert.deepEqual(durations(texts(st).join('\n')).split('\n'), ['✔ in-a (Nms)', '✔ in-b (Nms)', ...block({ tests: 2, pass: 2 }, 'N')]);
    assert.equal(st.run.exitCode, 0);
    assert.equal(st.run.ok, true);
    assert.equal(st.run.tests.tests, 2);
    assert.equal(st.run.tests.pass, 2);
    assert.equal(typeof st.run.tests.duration_ms, 'number');
    assert.equal(st.run.logs, st.run.out);
    T.reset();
  });
  it('a failing file gives one summed block, then the failing sections, exit 1', async () => {
    const { T, st } = makeTs({ files: { 'a.test.js': FAIL, 'b.test.js': T1('in-b') } });
    await exec(T, 'node --test a.test.js b.test.js');
    const t = durations(texts(st).join('\n')).split('\n');
    assert.deepEqual(t.slice(0, 2 + 8), ['✖ boom (Nms)', '✔ in-b (Nms)', ...block({ tests: 2, pass: 1, fail: 1 }, 'N')]);
    assert.deepEqual(t.slice(10, 15), ['', '✖ failing tests:', '', 'test at a.test.js', '✖ boom (Nms)']);
    assert.equal(st.run.exitCode, 1);
    assert.equal(st.run.ok, false);
    assert.deepEqual(clean(st.run.tests), { ...clean(st.run.tests), tests: 2, pass: 1, fail: 1 });
    T.reset();
  });
  it('a test file that throws before any test counts as one failed test', async () => {
    const { T, st } = makeTs({ files: { 'a.test.js': 'throw new Error("early")\n', 'b.test.js': T1('in-b') } });
    await exec(T, 'node --test');
    assert.ok(texts(st).includes('/home/you/my-app/a.test.js'));
    assert.ok(texts(st).includes('✖ a.test.js (0ms)'));
    assert.equal(st.run.tests.tests, 2);
    assert.equal(st.run.tests.fail, 1);
    assert.equal(st.run.exitCode, 1);
    T.reset();
  });
  it('a test file with no tests of its own counts as one passing test', async () => {
    const { T, st } = makeTs({ files: { 'a.test.js': 'console.log("only a log")\n' } });
    await exec(T, 'node --test');
    assert.equal(texts(st)[0], 'only a log');
    assert.match(texts(st)[1], /^✔ a\.test\.js \(\d+ms\)$/);
    assert.equal(st.run.tests.tests, 1);
    assert.equal(st.run.tests.pass, 1);
    T.reset();
  });
  it('node --test with no file names finds the files Node 24 finds', async () => {
    const names = ['x.test.js', 'x.test.ts', 'test/foo.js', 'test/sub/bar.js', 'lib/z.test.js', 'a-test.js', 'b_test.js', 'test-c.js', 'test.js'];
    const skip = ['lib/helper.js', 'a.spec.js', 'node_modules/y.test.js', 'test/data.json', 'test/n.txt', 'mytest.js', 'main.ts'];
    const files = {};
    for (const n of [...names, 'lib/helper.js', 'a.spec.js', 'node_modules/y.test.js', 'mytest.js', 'main.ts']) files[n] = T1(n);
    files['test/data.json'] = '{}'; files['test/n.txt'] = 'hi';
    const { T, st } = makeTs({ files });
    await exec(T, 'node --test');
    const ran = texts(st).filter(l => l.startsWith('✔ ')).map(l => l.replace(/^✔ | \(\d+ms\)$/g, ''));
    assert.deepEqual(ran, [...names].sort());
    assert.ok(!skip.some(s => ran.includes(s)));
    T.reset();
  });
  it('node --test with no test files prints an all-zero block, exit 0', async () => {
    const { T, st } = makeTs({ files: { 'a.js': 'console.log(1)\n' } });
    await exec(T, 'node --test');
    assert.deepEqual(durations(texts(st).join('\n')).split('\n'), block({}, 'N'));
    assert.equal(st.run.exitCode, 0);
    assert.equal(st.run.ok, true);
  });
  it('node --test nope.test.js is one stderr-style line and exit 1', async () => {
    const { T, st } = makeTs({ files: { 'a.js': '1' } });
    await exec(T, 'node --test nope.test.js');
    assert.deepEqual(st.lines, [["Could not find 'nope.test.js'", 'err']]);
    assert.equal(st.run.exitCode, 1);
  });
  it('a test file may log, and its lines show up before the summary', async () => {
    const { T, st } = makeTs({ files: { 'a.test.js': "console.log('hi from a');" + T1('t') } });
    await exec(T, 'node --test');
    assert.equal(texts(st)[0], 'hi from a');
    assert.match(texts(st)[1], /^✔ t \(\d+ms\)$/);
    T.reset();
  });
  it('a describe/it file reports its suites', async () => {
    const { T, st } = makeTs({ files: { 'a.test.js': "const { describe, it } = require('node:test'); describe('S', () => { it('one', () => {}); it('two', () => {}) })\n" } });
    await exec(T, 'node --test');
    assert.equal(st.run.tests.suites, 1);
    assert.equal(st.run.tests.tests, 2);
    T.reset();
  });
  it('node --test after a failing run still works (the realm is reused cleanly)', async () => {
    const { T, st } = makeTs({ files: { 'a.test.js': FAIL } });
    await exec(T, 'node --test', 'node --test');
    assert.equal(st.run.exitCode, 1);
    assert.equal(texts(st).filter(l => l === '✖ failing tests:').length, 2);
    T.reset();
  });
  it('npm test with "node --test" runs the tests and takes their exit code', async () => {
    const pkg = s => JSON.stringify({ name: 'my-app', version: '1.0.0', scripts: { test: 'node --test', both: 'node --test && echo after', run: 'node x.ts' } });
    const ok = makeTs({ files: { 'package.json': pkg(), 'a.test.ts': T1('t') } });
    await exec(ok.T, 'npm test');
    assert.ok(texts(ok.st)[0].includes('my-app@1.0.0 test'));
    assert.equal(ok.st.run.exitCode, 0);
    assert.equal(ok.st.run.tests.pass, 1);
    const bad = makeTs({ files: { 'package.json': pkg(), 'a.test.ts': FAIL } });
    await exec(bad.T, 'npm test', 'npm run both');
    assert.equal(bad.st.run.exitCode, 1);
    assert.ok(!texts(bad.st).includes('after'), 'a failing node stops the && chain');
    const chain = makeTs({ files: { 'package.json': pkg(), 'a.test.ts': T1('t') } });
    await exec(chain.T, 'npm run both');
    assert.equal(texts(chain.st).at(-1), 'after');
    const x = makeTs({ files: { 'package.json': pkg(), 'x.ts': 'console.log("from ts")\n' } });
    await exec(x.T, 'npm run run');
    assert.equal(texts(x.st).at(-1), 'from ts');
    for (const m of [ok, bad, chain, x]) m.T.reset();
  });
  it('require(assert) works with ts on', async () => {
    const { T, st } = makeTs({ files: { 'x.ts': "import assert from 'node:assert/strict'\nassert.equal(1, 1)\nconsole.log('ok')\n" } });
    await exec(T, 'node x.ts');
    assert.deepEqual(st.lines, [['ok', '']]);
    T.reset();
  });
  it('a run superseded during node --test stops printing', async () => {
    const { T, st } = makeTs({ files: { 'a.test.js': T1('a'), 'b.test.js': T1('b') } });
    const p = T.run('node --test');
    T.run('pwd');
    await p;
    await wait(5);
    assert.deepEqual(texts(st), ['/home/you/my-app']);
    assert.equal(st.run.src, 'pwd');
    T.reset();
  });
});

describe('real node differentials', () => {
  const T1 = n => `const test = require('node:test'); test('${n}', () => {});\n`;
  const node = real({ 'x.ts': 'const a: number = 1\nconsole.log(a)\n' }, ['x.ts']);
  const canRunTs = node.status === 0 && node.stdout === '1\n';
  const norm = s => durations(s).replace(/\n\n✖ failing tests:[\s\S]*$/, '').trimEnd();

  it('node file.ts: an erasable file and a file with a type error print what real node prints', { skip: canRunTs ? false : 'this machine\'s node cannot run .ts by default' }, async () => {
    for (const code of ['const a: number = 1\nconsole.log(a)\n', 'const a: number = "s"\nconsole.log(a)\n', 'interface I { a: number }\nconst o: I = { a: 2 }\nconsole.log(o.a)\n']) {
      const r = real({ 'x.ts': code }, ['x.ts']);
      const { T, st } = makeTs({ files: { 'x.ts': code } });
      await exec(T, 'node x.ts');
      assert.equal(texts(st).join('\n') + '\n', r.stdout);
      assert.equal(st.run.exitCode, r.status);
      T.reset();
    }
  });
  it('an enum: real node refuses it, the terminal runs it', { skip: canRunTs ? false : 'this machine\'s node cannot run .ts by default' }, async () => {
    const code = 'enum E { A }\nconsole.log(E.A)\n';
    const r = real({ 'x.ts': code }, ['x.ts']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/);
    const { T, st } = makeTs({ files: { 'x.ts': code } });
    await exec(T, 'node x.ts');
    assert.deepEqual(texts(st), ['0']);
    T.reset();
  });
  it('real node exit codes: process.exit(3) is 3 and an uncaught throw is 1', async () => {
    for (const [code, want] of [['process.exit(3)', 3], ['throw new Error("b")', 1], ['process.exitCode = 2', 2]]) {
      const r = real({ 'x.js': code }, ['x.js']);
      const { T, st } = makeTs({ files: { 'x.js': code } });
      await exec(T, 'node x.js');
      assert.equal(r.status, want);
      assert.equal(st.run.exitCode, want);
      T.reset();
    }
  });
  it('node --test a b: the layout matches real node after normalising durations', async () => {
    const files = { 'a.test.js': T1('in-a'), 'b.test.js': T1('in-b') };
    const r = real(files, ['--test', 'a.test.js', 'b.test.js']);
    const { T, st } = makeTs({ files });
    await exec(T, 'node --test a.test.js b.test.js');
    assert.equal(norm(texts(st).join('\n')), norm(r.stdout));
    assert.equal(st.run.exitCode, r.status);
    T.reset();
  });
  it('node --test with a failing file: the lines before the failing section match real node, and so does the exit code', async () => {
    const files = { 'a.test.js': FAILING, 'b.test.js': T1('in-b') };
    const r = real(files, ['--test', 'a.test.js', 'b.test.js']);
    const { T, st } = makeTs({ files });
    await exec(T, 'node --test a.test.js b.test.js');
    assert.equal(norm(texts(st).join('\n')), norm(r.stdout));
    assert.equal(st.run.exitCode, r.status);
    assert.match(r.stdout, /\n✖ failing tests:\n\ntest at a\.test\.js:\d+:\d+\n✖ boom \(/);
    T.reset();
  });
  it('node --test with no names: the same files run in the same order', async () => {
    const names = ['x.test.js', 'x.test.ts', 'test/foo.js', 'test/sub/bar.js', 'lib/z.test.js', 'a-test.js', 'b_test.js', 'test-c.js', 'test.js', 'lib/helper.js', 'a.spec.js', 'node_modules/y.test.js', 'mytest.js'];
    const files = Object.fromEntries(names.map(n => [n, T1(n)]));
    files['test/data.json'] = '{}';
    const r = real(files, ['--test']);
    const { T, st } = makeTs({ files });
    await exec(T, 'node --test');
    assert.equal(norm(texts(st).join('\n')), norm(r.stdout));
    T.reset();
  });
  it('node --test with a file that has no tests: a log line, then the file counted as one passing test', async () => {
    const files = { 'a.test.js': 'console.log("only a log")\n' };
    const r = real(files, ['--test']);
    const { T, st } = makeTs({ files });
    await exec(T, 'node --test');
    assert.equal(norm(texts(st).join('\n')), norm(r.stdout));
    T.reset();
  });
  it('node --test with no test files: the same all-zero block and exit 0', async () => {
    const r = real({ 'a.js': 'console.log(1)\n' }, ['--test']);
    const { T, st } = makeTs({ files: { 'a.js': 'console.log(1)\n' } });
    await exec(T, 'node --test');
    assert.equal(norm(texts(st).join('\n')), norm(r.stdout));
    assert.equal(st.run.exitCode, r.status);
  });
  it('node --test with a missing file: real node prints one stderr line, exit 1', async () => {
    const r = real({ 'a.js': '1' }, ['--test', 'nope.test.js']);
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "Could not find 'nope.test.js'\n");
  });
});

describe('hostile names (ts on)', () => {
  const protoKeys = () => vm.runInContext('Object.getOwnPropertyNames(Object.prototype).join()', host);
  it('__proto__, constructor and .. as names: no crash, no prototype change, nothing written outside the map', async () => {
    const before = protoKeys();
    const { T, st } = makeTs({ files: { 'a.ts': 'export const a = 1\n' } });
    const cmds = ['touch __proto__', 'touch constructor', 'touch ../x.ts', 'touch a/../b', 'mkdir ..', 'mkdir ../x', 'mkdir -p ../x', 'mkdir -p a/../b', 'mkdir __proto__', 'mkdir -p constructor/x', 'cat __proto__', 'cat constructor', 'cat ../a.ts', 'ls __proto__', 'ls constructor', 'ls ..', 'rm __proto__', 'rm ..', 'rm ../a.ts',
      'tsc __proto__', 'tsc ../a.ts', 'tsc constructor', 'node __proto__', 'node ../a.ts', 'node --test __proto__', 'node --test ../a.ts', 'node -e "require(\'__proto__\')"', 'node -e "require(\'../a\')"', 'tsc', 'ls'];
    for (const c of cmds) await exec(T, c);
    assert.equal(protoKeys(), before);
    assert.equal(({}).polluted, undefined);
    assert.equal(Object.keys(st.files).some(k => k.includes('..')), false, 'no key with ..');
    assert.equal(st.files.a, undefined);
    assert.equal(st.files['a.ts'], 'export const a = 1\n');
    T.reset();
  });
  it('a file named __proto__.ts or constructor.ts is checked, emitted and run like any other', async () => {
    const before = protoKeys();
    const files = { 'tsconfig.json': '{"compilerOptions":{}}', '__proto__.ts': 'export const p: number = 1\n', 'constructor.ts': 'export const c = 2\n', 'main.ts': "import { p } from './__proto__'\nimport { c } from './constructor'\nconsole.log(p + c)\n" };
    const { T, st } = makeTs({ files });
    await exec(T, 'tsc', 'node main.js', 'node main.ts');
    assert.deepEqual(texts(st), ['3', '3']);
    assert.ok('constructor.js' in st.files && '__proto__.js' in st.files);
    assert.equal(protoKeys(), before);
    T.reset();
  });
  it('a tsconfig with __proto__ keys and paths outside the map does not crash or read the disk', async () => {
    const before = protoKeys();
    const files = { 'tsconfig.json': '{"__proto__":{"polluted":1},"compilerOptions":{"__proto__":{"polluted":2},"typeRoots":["/etc"],"baseUrl":"/","paths":{"*":["/etc/*"]}},"extends":"/etc/passwd","include":["../**/*"]}', 'a.ts': 'export const a = 1\n' };
    const { T, st } = makeTs({ files });
    await exec(T, 'tsc');
    assert.equal(protoKeys(), before);
    assert.equal(({}).polluted, undefined);
    assert.equal(vm.runInContext('({}).polluted', host), undefined);
    assert.ok(st.lines.every(l => typeof l[0] === 'string'));
    T.reset();
  });
});

describe('RUN.files (TypeScript terminal)', () => {
  const files = { ['__proto__']: 'p', constructor: 'c', 'a.ts': 'export const a = 1\n' };
  it('is a copy of the map taken when the command starts', () => {
    const { T, st } = makeTs({ files });
    T.run('pwd');
    const f = st.run.files;
    assert.notEqual(f, st.files);
    assert.deepEqual(Object.keys(f).sort(), ['__proto__', 'a.ts', 'constructor']);
    assert.equal(Object.getOwnPropertyDescriptor(f, '__proto__').value, 'p');
    st.files['a.ts'] = 'changed';
    assert.equal(f['a.ts'], 'export const a = 1\n');
    T.reset();
  });
  it('is absent with ts off, so the Script run is unchanged', () => {
    const { T, st } = makeTerminal({ files });
    T.run('pwd');
    assert.equal('files' in st.run, false);
    T.reset();
  });
});

describe('the exit hook judges a TypeScript run again (process.exitCode)', () => {
  const exits = r => r.snaps.map(s => s.run.exitCode);
  it('a sync program that sets process.exitCode is judged twice, the last time with the code', async () => {
    const r = await playTerminal({ 'a.ts': 'console.error("bad file")\nprocess.exitCode = 1\n' }, ['node a.ts']);
    assert.deepEqual(exits(r), [0, 1]);
    assert.equal(r.run.exitCode, 1);
  });
  it('a sync program with no exit code is judged once', async () => {
    const r = await playTerminal({ 'a.ts': 'console.log("fine")\n' }, ['node a.ts']);
    assert.deepEqual(exits(r), [0]);
  });
  it('process.exit(1) in the sync phase is judged once, already with the code', async () => {
    const r = await playTerminal({ 'a.ts': 'process.exit(1)\n' }, ['node a.ts']);
    assert.deepEqual(exits(r), [1]);
  });
  it('Script (ts off) is judged once and its run keeps its fields', async () => {
    const { T, st } = makeTerminal({ files: { 'a.js': 'process.exitCode = 1\n' } });
    T.run('node a.js');
    await settle(T);
    await wait(50);
    assert.equal(st.completes, 1);
    assert.equal(st.run.exitCode, undefined);
    assert.equal(st.run.ok, false);
    T.reset();
  });
});
