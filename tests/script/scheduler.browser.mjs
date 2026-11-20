import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CORPUS, NOTES, compareLines } from './order-corpus.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = msg => { console.log(`ENV: ${msg}`); process.exit(1); };

let browser;
try {
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
} catch (e) { env(`chromium did not launch: ${String(e.message).split('\n')[0]}`); }

const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ path: path.join(ROOT, 'shared/jsrealm.js') });
await page.addScriptTag({ path: path.join(ROOT, 'shared/scheduler.js') });

const results = await page.evaluate(async ({ corpus, notes }) => {
  JSRealm.init({ host: document.body });
  const out = [];
  for (const prog of corpus) {
    const lines = [];
    const errors = [];
    let finish;
    const done = new Promise(r => { finish = r; });
    const timeout = new Promise(r => setTimeout(() => r('TIMEOUT'), 5000));
    const R = JSRealm.makeRealm({
      out: (lvl, a) => lines.push(a.join(' ')),
      asyncErr: e => errors.push(String(e && e.message || e)),
    });
    const sched = Scheduler.create({
      alive: () => !R.silent,
      io: { done: finish, exit: () => { R.silent = true; }, asyncErr: e => errors.push(String(e && e.message || e)) },
    });
    const cost = Scheduler.COST.FS_BASE_MS + Math.ceil(notes.length / Scheduler.COST.BYTES_PER_MS);
    const fs = {
      readFile: (p, enc, cb) => { if (typeof enc === 'function') cb = enc; sched.queueIO(cost, () => cb(null, notes)); },
      // the realm's own Promise: a host-realm promise would add microtask ticks to `await`
      promises: { readFile: () => new R.w.Promise(res => sched.queueIO(cost, () => res(notes))) },
    };
    const proc = { nextTick: sched.nextTick, exit(c = 0) { sched.exit(c); const e = new Error('__exit__'); e.__exit = c; throw e; } };
    const require = n => { if (n === 'fs') return fs; throw new Error('no module ' + n); };
    const er = JSRealm.runScript(R, '__fn=function(require,process,setTimeout,setInterval,setImmediate,clearTimeout,clearInterval,clearImmediate){' + prog.src + '\n}');
    if (er) { out.push({ name: prog.name, lines, errors: [String(er.message)] }); JSRealm.killRealm(R); continue; }
    const finished = Promise.race([done, timeout]);
    try {
      R.w.__fn(require, proc, sched.setTimeout, sched.setInterval, sched.setImmediate, sched.clearTimeout, sched.clearInterval, sched.clearImmediate);
    } catch (e) { if (!(e && e.__exit !== undefined)) errors.push(String(e && e.message || e)); }
    sched.drainTicks();
    sched.start();
    const how = await finished;
    if (how === 'TIMEOUT') errors.push('loop did not finish in 5 s');
    out.push({ name: prog.name, lines, errors });
    JSRealm.killRealm(R);
  }
  return out;
}, { corpus: CORPUS.map(({ name, src }) => ({ name, src })), notes: NOTES });

const rows = [];
CORPUS.forEach((prog, i) => {
  const r = results[i];
  const msg = compareLines(prog.name, r.lines, prog.expect);
  if (msg || r.errors.length) rows.push({ program: prog.name, expected: prog.expect.join(' | '), actual: r.lines.join(' | '), errors: r.errors.join('; ') });
});
if (pageErrors.length) rows.push({ program: '(page)', expected: 'no page errors', actual: pageErrors.join('; '), errors: '' });

if (rows.length) {
  console.log('SPIKE FAILED');
  console.table(rows);
  process.exit(1);
}
console.log(`spike: ${CORPUS.length}/${CORPUS.length} corpus programs print exactly their expect lines in Chromium`);

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

const HOOK = 'window.__t={CH,S,setChapter,runShell,get RUN(){return RUN}};})();';
const ctx = await browser.newContext();
await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
await ctx.route('**/script-quest/app.js', async r => {
  const body = (await r.fetch()).text();
  await r.fulfill({ contentType: 'text/javascript', body: (await body).replace(/\}\)\(\);\s*$/, HOOK) });
});
const qp = await ctx.newPage();
const qErrors = [];
qp.on('pageerror', e => qErrors.push(e.message));
await qp.goto(`http://localhost:${server.address().port}/programming/script-quest/`);
await qp.waitForSelector('#cmd');
if (!(await qp.evaluate(() => typeof window.acorn !== 'undefined'))) bail('acorn did not load from the CDN');
await qp.evaluate(() => window.__t.setChapter(window.__t.CH.findIndex(c => c.name === 'Node.js')));

const screenText = () => qp.evaluate(() => document.querySelector('#screen').innerText);
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
const run = async cmd => {
  await qp.evaluate(() => window.__t.setChapter(window.__t.CH.findIndex(c => c.name === 'Node.js')));
  await qp.fill('#cmd', cmd);
  await qp.press('#cmd', 'Enter');
  await stable();
  return qp.evaluate(() => [...document.querySelectorAll('#screen .line:not(.in)')].map(l => l.innerText.trim()));
};
const ok = () => qp.evaluate(() => window.__t.RUN.ok);
const checks = [];
const check = (name, cond, detail = '') => { checks.push({ name, pass: !!cond, detail }); };

const ORDER = ['sync', 'tick', 'promise', 'timer', 'immediate'];
let lines = await run(`node -e "console.log('sync');process.nextTick(()=>console.log('tick'));Promise.resolve().then(()=>console.log('promise'));setTimeout(()=>console.log('timer'),0);setImmediate(()=>console.log('immediate'))"`);
check('node -e prints sync, tick, promise, timer, immediate', JSON.stringify(lines.filter(l => ORDER.includes(l))) === JSON.stringify(ORDER), lines.join(' | '));

const AFTER = `node -e "console.log('next-ok')"`;
const GUARDED = {
  'while(true){}': 'while(true){}',
  'for(;;){}': 'for(;;){}',
  'braceless loop': 'let i=0;while(true)i++',
  'do...while': 'do{}while(true)',
};
for (const [name, body] of Object.entries(GUARDED)) {
  lines = await run(`node -e "${body}"`);
  check(`guard stops ${name}`, lines.some(l => l.includes('Loop guard')), lines.join(' | '));
  check(`next command works after ${name}`, (await run(AFTER)).includes('next-ok'));
}
lines = await run(`node -e "let c=0;for(let i=0;i<1000000;i++)c++;console.log('count '+c)"`);
check('a 1,000,000-iteration loop is not stopped', lines.includes('count 1000000') && !lines.some(l => l.includes('Loop guard')), lines.join(' | '));

lines = await run(`node -e "Promise.resolve().then(()=>process.exit(0))"`);
check('exit(0) inside a .then leaves RUN.ok true', (await ok()) === true && !lines.some(l => /error/i.test(l)), lines.join(' | '));
lines = await run(`node -e "Promise.reject(new Error('boom'));setTimeout(()=>console.log('late-timer'),10)"`);
check('Promise.reject: the later timer never runs, RUN.ok is false', !lines.includes('late-timer') && lines.some(l => l.includes('boom')) && (await ok()) === false, lines.join(' | '));
lines = await run(`node -e "const p=Promise.reject(new Error('handled'));Promise.resolve().then(()=>p.catch(()=>console.log('caught')));setTimeout(()=>console.log('timer-after'),10)"`);
check('a rejection handled later in the same drain does not stop the loop', lines.includes('caught') && lines.includes('timer-after') && !lines.some(l => l.includes('handled') && l.includes('Error')) && (await ok()) === true, lines.join(' | '));
lines = await run(`node -e "console.log('before');setTimeout(()=>{Promise.resolve().then(()=>console.log('late-job'));process.exit(0)},5)"`);
check('process.exit in a timer: a late promise job prints nothing', lines.includes('before') && !lines.includes('late-job'), lines.join(' | '));

const iv = await qp.evaluate(async () => {
  const { runShell, CH, setChapter } = window.__t;
  setChapter(CH.findIndex(c => c.name === 'Node.js'));
  const xs = () => [...document.querySelectorAll('#screen .line:not(.in)')].filter(l => l.innerText.trim() === 'x').length;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  runShell(`node -e "setInterval(()=>console.log('x'),10)"`);
  await wait(30);
  const a = xs();
  runShell('ls');
  await wait(30);
  const b = xs();
  runShell(`node -e "console.log('second')"`);
  await wait(30);
  const c = xs();
  await wait(300);
  return { a, b, c, d: xs(), budget: document.querySelector('#screen').innerText.includes('Stopped:') };
});
check('ls does not stop a running interval', iv.b > iv.a && iv.a > 0 && iv.a < 4000, JSON.stringify(iv));
check('a new node run stops it, with no budget line', iv.d === iv.c && !iv.budget, JSON.stringify(iv));

const beats = async (file, read) => {
  const body = `const fs=require('fs');let last=Date.now();const h=setInterval(()=>{const t=Date.now();console.log('beat '+(t-last));last=t},100);setTimeout(()=>{${read(file)}},150);setTimeout(()=>clearInterval(h),1500)`;
  const l = await run(`node -e "${body}"`);
  return Math.max(...l.filter(x => x.startsWith('beat ')).map(x => Number(x.slice(5))));
};
const syncRead = f => `fs.readFileSync('${f}','utf8')`;
const asyncRead = f => `fs.readFile('${f}','utf8',()=>{})`;
const gapSync = await beats('notes.txt', syncRead);
const gapAsync = await beats('notes.txt', asyncRead);
check('heartbeat: readFileSync leaves a gap', gapSync >= 250, `max gap ${gapSync} ms`);
check('heartbeat: fs.readFile leaves none', gapAsync < 150, `max gap ${gapAsync} ms`);

check('no pageerror', qErrors.length === 0, qErrors.join('; '));

// REPL loop guard: the JS console of each quest (JSRealm.prepare guards the code it runs).
const tp = await ctx.newPage();
const tErrors = [];
tp.on('pageerror', e => tErrors.push(e.message));
await tp.goto(`http://localhost:${server.address().port}/programming/typescript-quest/`);
await tp.waitForSelector('#cmd');
if (!(await tp.evaluate(() => typeof window.acorn !== 'undefined'))) bail('acorn did not load from the CDN (TypeScript page)');
// the first run on this page would otherwise wait for the CDN compiler while the screen looks idle
await tp.waitForFunction(() => /TypeScript compiler ready\./.test(document.querySelector('#screen').innerText), null, { timeout: 60000 })
  .catch(() => bail('the TypeScript compiler did not load'));
const consoleRun = async (page, cmd) => {
  await page.fill('#cmd', cmd);
  await page.press('#cmd', 'Enter');
  let prev = null, same = 0;
  for (let i = 0; i < 300 && same < 3; i++) {
    await new Promise(r => setTimeout(r, 100));
    const t = await page.evaluate(() => document.querySelector('#screen').innerText);
    same = t === prev ? same + 1 : 0;
    prev = t;
  }
  if (same < 3) bail('console output kept changing for 30 s');
  return page.evaluate(() => [...document.querySelectorAll('#screen .line:not(.in)')].map(l => l.innerText.trim()));
};
const REPL_LOOPS = {
  'while(true){}': 'while(true){}',
  'for(;;){}': 'for(;;){}',
  'braceless loop': 'let i=0;while(true)i++',
  'do...while': 'do{}while(true)',
  'loop in a setTimeout callback': 'setTimeout(()=>{while(true){}},0)',
};
await qp.evaluate(() => window.__t.setChapter(window.__t.CH.findIndex(c => c.name === 'Say hello')));
for (const [label, page] of [['Script console', qp], ['TypeScript console', tp]]) {
  let n = 0;
  for (const [name, body] of Object.entries(REPL_LOOPS)) {
    // let/const in the body would clash across runs in one console, so each run uses its own name
    const src = body.replace(/\bi\b/g, `i${++n}`);
    const out = await consoleRun(page, src);
    check(`${label}: guard stops ${name}`, out.some(l => l.includes('Loop guard')), out.join(' | '));
    const next = await consoleRun(page, `console.log('next-ok-${n}')`);
    check(`${label}: next line works after ${name}`, next.includes(`next-ok-${n}`), next.join(' | '));
  }
}
check('no pageerror on the TypeScript page', tErrors.length === 0, tErrors.join('; '));

// No await between the runs, so only runScript's reset (not the deferred one) can clear the count: 2 x 3M would pass 5M.
const resetErr = await qp.evaluate(() => {
  const R = JSRealm.makeRealm({ out() {}, asyncErr() {} });
  const p = JSRealm.prepare('for(let i=0;i<3000000;i++){}');
  const errs = [JSRealm.runScript(R, p.code), JSRealm.runScript(R, p.code)].map(e => e && String(e.message));
  JSRealm.killRealm(R);
  return errs;
});
check('runScript resets the loop count: two 3,000,000-iteration scripts in a row both finish', resetErr.every(e => !e), resetErr.join(' | '));

const replPerf = await qp.evaluate(() => {
  let best = Infinity, err = null;
  for (let k = 0; k < 3; k++) {
    const R = JSRealm.makeRealm({ out() {}, asyncErr() {} });
    const p = JSRealm.prepare('for(let i=0;i<1000000;i++){}');
    const t = performance.now();
    err = JSRealm.runScript(R, p.code) || err;
    best = Math.min(best, performance.now() - t);
    JSRealm.killRealm(R);
  }
  return { best, err: err && String(err.message) };
});
console.log(`PERF console loop 1,000,000 iterations (guarded): ${replPerf.best.toFixed(1)} ms (limit: <= 150 ms)`);
check('perf: a 1,000,000-iteration console loop is not stopped and takes <= 150 ms', !replPerf.err && replPerf.best <= 150, `${replPerf.best.toFixed(1)} ms ${replPerf.err || ''}`);

const perf = await qp.evaluate(async () => {
  const { runShell, CH, setChapter, S } = window.__t;
  setChapter(CH.findIndex(c => c.name === 'Node.js'));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const best = f => { let m = Infinity; for (let i = 0; i < 3; i++) { const t = performance.now(); f(); m = Math.min(m, performance.now() - t); } return m; };
  const loop = new Function('for(let i=0;i<1000000;i++){}');
  const unguarded = best(loop);
  const guarded = best(() => runShell(`node -e "for(let i=0;i<1000000;i++){}"`));
  setChapter(CH.findIndex(c => c.name === 'Node.js'));
  const t0 = performance.now();
  runShell(`node -e "let n=0;function f(){if(++n<1000)setTimeout(f,1);else console.log('chain '+n)}f()"`);
  while (!document.querySelector('#screen').innerText.includes('chain 1000')) { if (performance.now() - t0 > 20000) break; await wait(5); }
  const chain = performance.now() - t0;
  S.files['f100.txt'] = 'x'.repeat(100);
  S.files['f1k.txt'] = 'x'.repeat(1024);
  return { unguarded, guarded, chain };
});
const gap100 = await beats('f100.txt', syncRead);
const gap1k = await beats('f1k.txt', syncRead);
const sched = fs.statSync(path.join(ROOT, 'shared/scheduler.js')).size;
console.log(`PERF loop 1,000,000 iterations: unguarded ${perf.unguarded.toFixed(1)} ms, guarded ${perf.guarded.toFixed(1)} ms, ratio ${(perf.guarded / perf.unguarded).toFixed(1)}x (limit: guarded <= 150 ms)`);
console.log(`PERF 1,000-timer chain: ${perf.chain.toFixed(0)} ms real time (limit: < 2000 ms)`);
console.log(`PERF shared/scheduler.js: ${sched} bytes`);
console.log(`PERF virtual stall, 100-byte file: ${gap100 - 100} ms, beats lost ${Math.floor(gap100 / 100) - 1}`);
console.log(`PERF virtual stall, 1 KB file: ${gap1k - 100} ms, beats lost ${Math.floor(gap1k / 100) - 1}`);
check('perf: guarded 1,000,000-iteration loop <= 150 ms', perf.guarded <= 150, `${perf.guarded.toFixed(1)} ms`);
check('perf: 1,000-timer chain < 2 s', perf.chain < 2000, `${perf.chain.toFixed(0)} ms`);

await browser.close();
server.close();
const failed = checks.filter(c => !c.pass);
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.pass ? '' : ` -- ${c.detail}`}`);
if (failed.length) { console.log(`page: ${failed.length}/${checks.length} checks failed`); process.exit(1); }
console.log(`page: ${checks.length}/${checks.length} checks passed`);
