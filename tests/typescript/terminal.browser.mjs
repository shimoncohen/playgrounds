import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = msg => { console.log(`ENV: ${msg}`); process.exit(1); };

let browser;
try {
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
} catch (e) { env(`chromium did not launch: ${String(e.message).split('\n')[0]}`); }

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }).end(fs.readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const bail = msg => { server.close(); env(msg); };

const HOOK = 'window.__t={CH,S,setChapter,runShell,pfiles,get RUN(){return RUN}};})();';
const ctx = await browser.newContext();
await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
await ctx.route('**/typescript-quest/app.js', async r => {
  const body = await (await r.fetch()).text();
  await r.fulfill({ contentType: 'text/javascript', body: body.replace(/\}\)\(\);\s*$/, HOOK) });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://localhost:${server.address().port}/programming/typescript-quest/`);
await page.waitForSelector('#cmd');
if (!(await page.evaluate(() => typeof window.acorn !== 'undefined'))) bail('acorn did not load from the CDN');
await page.waitForFunction(() => /TypeScript compiler ready\./.test(document.querySelector('#screen').innerText), null, { timeout: 60000 })
  .catch(() => bail('the TypeScript compiler did not load'));

const screenText = () => page.evaluate(() => document.querySelector('#screen').innerText);
const stable = async () => {
  let prev = null, same = 0;
  for (let i = 0; i < 300 && same < 3; i++) {
    await new Promise(r => setTimeout(r, 100));
    const t = await screenText();
    same = t === prev ? same + 1 : 0;
    prev = t;
  }
  if (same < 3) bail('terminal output kept changing for 30 s');
};
const outLines = () => page.evaluate(() => [...document.querySelectorAll('#screen .line:not(.in)')].map(l => l.innerText.trim()));
const enter = async (chapter, term) => {
  await page.evaluate(([c, t]) => { const i = window.__t.CH.findIndex(x => x.name === c); window.__t.CH[i].terminal = t; window.__t.setChapter(i); }, [chapter, term]);
  await stable();
};
const type = async cmd => {
  await page.evaluate(() => { document.querySelector('#screen').innerHTML = ''; });
  await page.fill('#cmd', cmd);
  await page.press('#cmd', 'Enter');
  await stable();
  return outLines();
};
const setFiles = files => page.evaluate(f => {
  const o = window.__t.pfiles();
  for (const k of Object.keys(o)) delete o[k];
  Object.assign(o, f);
  window.__t.runShell('ls');
}, files);
const run = () => page.evaluate(() => ({ ...window.__t.RUN }));
const checks = [];
const check = (name, cond, detail = '') => { checks.push({ name, pass: !!cond, detail }); };
const visible = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; }, sel);

// Chapter 10 without the flag: the Run button and no terminal.
await enter('Modules', false);
check('no flag: the editor shows', await visible('#editor'));
check('no flag: no input line, key bar or terminal bar', !(await visible('.inputline')) && (await page.evaluate(() => document.querySelector('#keys').hidden)) && !(await visible('#termbar')));
check('no flag: the prompt is unchanged', (await page.textContent('#prompt')) === 'ts> ');
check('no flag: the terminal is not the short one', !(await page.evaluate(() => document.querySelector('#term').classList.contains('short'))));

// The same chapter as a terminal chapter.
await enter('Modules', true);
check('flag: the input line shows', await visible('.inputline'));
// The key bar is display:none on a fine pointer (desktop), so only its hidden flag is checked.
check('flag: the key bar is not hidden', await page.evaluate(() => !document.querySelector('#keys').hidden));
check('flag: the terminal bar shows', await visible('#termbar'));
check('flag: the editor shows', await visible('#editor'));
check('flag: the prompt reads ~/my-app $ ', (await page.textContent('#prompt')) === '~/my-app $ ');
check('flag: the input says it takes a terminal command', (await page.getAttribute('#cmd', 'aria-label')) === 'Type a terminal command');
check('flag: the terminal is the short one', await page.evaluate(() => document.querySelector('#term').classList.contains('short')));

let lines = await type('ls');
check('ls lists the project files', lines.some(l => l.includes('main.ts') && l.includes('wagon.ts')), lines.join(' | '));

const TSCONFIG = '{"compilerOptions":{"strict":true}}';
await setFiles({ 'tsconfig.json': TSCONFIG, 'main.ts': 'const n: number = 1\nconsole.log(n)\n' });
lines = await type('tsc');
check('tsc on a clean project prints nothing', lines.length === 0, lines.join(' | '));
let r = await run();
check('a clean tsc leaves exitCode 0 and ok true', r.exitCode === 0 && r.ok === true && r.diags.length === 0, JSON.stringify(r));
check('tsc wrote main.js beside main.ts', (await page.evaluate(() => 'main.js' in window.__t.pfiles())) === true);

await setFiles({ 'tsconfig.json': TSCONFIG, 'main.ts': 'const n: number = "a"\n' });
lines = await type('tsc');
check('tsc prints the exact diagnostic line', lines.length === 1 && lines[0] === "main.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.", lines.join(' | '));
r = await run();
check('a failing tsc gives exitCode 2 and ok false', r.exitCode === 2 && r.ok === false && r.diags.length === 1, JSON.stringify(r));

await setFiles({ 'main.ts': 'const n: number = "a"\nconsole.log("ran " + (1 + 2))\n' });
lines = await type('node main.ts');
check('node main.ts runs even with a type error', lines.includes('ran 3'), lines.join(' | '));

const TEST = "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('adds', () => { assert.equal(1 + 1, 2) })\n";
await setFiles({ 'main.ts': 'console.log(1)\n' });
await type('touch a.test.ts');
await page.evaluate(src => { window.__t.pfiles()['a.test.ts'] = src; }, TEST);
lines = await type('node --test');
r = await run();
check('node --test runs a.test.ts and prints the spec lines', lines.some(l => l.startsWith('✔ adds')) && lines.includes('ℹ pass 1'), lines.join(' | '));
check('node --test sets RUN.tests and exitCode 0', r.tests && r.tests.pass === 1 && r.tests.fail === 0 && r.exitCode === 0 && r.ok === true, JSON.stringify(r.tests));

await page.evaluate(src => { window.__t.pfiles()['a.test.ts'] = src.replace('1 + 1, 2', '1 + 1, 3'); }, TEST);
lines = await type('node --test');
r = await run();
check('a failing test gives ✖, exitCode 1 and ok false', lines.some(l => l.startsWith('✖ adds')) && r.exitCode === 1 && r.ok === false && r.tests.fail === 1, lines.join(' | '));

await page.evaluate(src => { window.__t.pfiles()['a.test.ts'] = src; }, TEST);
await page.click('.frow[data-f="a.test.ts"]');
await page.click('#edRun');
await stable();
const echoed = await page.evaluate(() => [...document.querySelectorAll('#screen .line.in')].map(l => l.innerText.trim()).pop());
check('Run on a .test.ts echoes and runs node --test <file>', /node --test a\.test\.ts$/.test(echoed || '') && (await outLines()).some(l => l.startsWith('✔ adds')), `${echoed} | ${(await outLines()).join(' | ')}`);

await page.click('.frow[data-f="main.ts"]');
await page.click('#edRun');
await stable();
check('Run on main.ts runs node main.ts and prints', (await outLines()).includes('1'), (await outLines()).join(' | '));

await type('node -e "{"');
check('Enter does not continue a line: an open brace still submits', (await page.inputValue('#cmd')) === '' && (await run()).src === 'node -e "{"');

// A stuck run stops on Fresh, on a chapter switch and on Ctrl+C.
const SERVER = 'import http from "http"\nhttp.createServer((q: any, s: any) => s.end("hi")).listen(3000, () => console.log("up"))\n';
const SERVING = () => page.evaluate(() => /still running/.test(document.querySelector('#screen').innerText));
await setFiles({ 's.ts': SERVER });
lines = await type('node s.ts');
check('a server run stays up', lines.includes('up'), lines.join(' | '));
lines = await type('node -e "1"');
check('a second node while it runs is refused', await SERVING());
await page.click('#fresh');
lines = await type('node -e "console.log(\'after-fresh\')"');
check('Fresh console stops the run', lines.includes('after-fresh') && !(await SERVING()), lines.join(' | '));

await setFiles({ 's.ts': SERVER });
await type('node s.ts');
await enter('Modules', true);
lines = await type('node -e "console.log(\'after-switch\')"');
check('switching chapter stops the run', lines.includes('after-switch') && !(await SERVING()), lines.join(' | '));

await setFiles({ 's.ts': SERVER });
await type('node s.ts');
await page.focus('#cmd');
await page.keyboard.press('Control+c');
await stable();
check('Ctrl+C stops the run', (await outLines()).some(l => l.startsWith('Stopped node s.ts')), (await outLines()).join(' | '));

await setFiles({ 's.ts': SERVER });
await type('node s.ts');
await page.click('#resetFiles');
lines = await type('node -e "console.log(\'after-reset\')"');
check('Reset files stops the run', lines.includes('after-reset') && !(await SERVING()), lines.join(' | '));

// Tab completes file names.
await setFiles({ 'main.ts': 'console.log(1)\n', 'notes.txt': 'x\n' });
await page.evaluate(() => { document.querySelector('#screen').innerHTML = ''; });
await page.fill('#cmd', 'cat ma');
await page.press('#cmd', 'Tab');
check('Tab completes a single match', (await page.inputValue('#cmd')) === 'cat main.ts ', await page.inputValue('#cmd'));
await setFiles({ 'main.ts': 'console.log(1)\n', 'math.ts': 'x\n' });
await page.evaluate(() => { document.querySelector('#screen').innerHTML = ''; });
await page.fill('#cmd', 'cat ma');
await page.press('#cmd', 'Tab');
lines = await outLines();
check('Tab with several matches lists them and keeps the input', lines.includes('main.ts  math.ts') && (await page.inputValue('#cmd')) === 'cat ma', `${lines.join(' | ')} | ${await page.inputValue('#cmd')}`);
await page.fill('#cmd', '');

// New file names in a terminal chapter.
const nf = async name => {
  await page.fill('#nfName', name);
  await page.click('#newfile button[type=submit]');
  return page.evaluate(n => n in window.__t.pfiles(), name);
};
check('New file accepts a.test.ts, util/x.json and notes.txt', (await nf('a2.test.ts')) && (await nf('util/x.json')) && (await nf('notes.txt')));
check('New file rejects .., an empty segment and a bad ending', !(await nf('../x.ts')) && !(await nf('a//b.ts')) && !(await nf('x.js')));
check('the file panel badges .json, .txt and .ts files', await page.evaluate(() => ['x.json', 'notes.txt', 'a2.test.ts'].every((n, i) => { const row = [...document.querySelectorAll('.frow')].find(b => b.textContent.includes(n)); return row && row.querySelector('.fi').textContent === ['JSON', 'TXT', 'TS'][i]; })));

// Back to the flagless chapter.
await enter('Modules', false);
check('without the flag again: Run button, no terminal', (await visible('#edRun')) && !(await visible('.inputline')));

check('no pageerror', errors.length === 0, errors.join('; '));

await browser.close();
server.close();
const failed = checks.filter(c => !c.pass);
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.pass ? '' : ` -- ${c.detail}`}`);
if (failed.length) { console.log(`terminal page: ${failed.length}/${checks.length} checks failed`); process.exit(1); }
console.log(`terminal page: ${checks.length}/${checks.length} checks passed`);
