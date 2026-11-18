import test from 'node:test';
import assert from 'node:assert/strict';
import { CORPUS, NOTES, runRealNode, compareLines, isSpawnError } from './order-corpus.mjs';

test('corpus has at least 14 programs', () => {
  assert.ok(CORPUS.length >= 14, `only ${CORPUS.length} programs`);
});

for (const prog of CORPUS) {
  test(`real node matches expect: ${prog.name}`, t => {
    let actual;
    try { actual = runRealNode(prog); }
    catch (e) {
      if (isSpawnError(e)) { t.skip(`cannot spawn node: ${e.code}`); return; }
      throw e;
    }
    const msg = compareLines(`"${prog.name}" (real node vs expect: the corpus or the model is wrong)`, actual, prog.expect);
    assert.equal(msg, null, msg);
  });
}

const vm = (await import('node:vm')).default;
globalThis.JSRealm = { runScript: (R, code) => { try { vm.runInContext(code, R.w); return null; } catch (e) { return e; } } };
await import('../../shared/scheduler.js');
await import('../../shared/nodeenv.js');
const { NodeEnv, Scheduler } = globalThis;

function runVm(src, files = { 'notes.txt': NOTES }, watchRejections = false) {
  return new Promise(resolveRun => {
    const onRej = e => res.io.asyncErr(e);
    // the test runner's own listener would fail the test on the rejection this test provokes on purpose
    const runnerListeners = watchRejections ? process.listeners('unhandledRejection') : [];
    const resolve = r => {
      if (watchRejections) { process.off('unhandledRejection', onRej); runnerListeners.forEach(l => process.on('unhandledRejection', l)); }
      resolveRun(r);
    };
    if (watchRejections) { process.removeAllListeners('unhandledRejection'); process.on('unhandledRejection', onRej); }
    const out = [], errs = [], sys = [];
    const R = { silent: false };
    const ctx = vm.createContext({ console: { log: (...a) => { if (!R.silent) out.push(a.join(' ')); } } });
    ctx.Date = vm.runInContext('Date', ctx);
    ctx.Promise = vm.runInContext('Promise', ctx);
    R.w = ctx;
    const vfs = { files: { ...files }, write: (k, v) => { vfs.files[k] = v; }, list: () => Object.keys(vfs.files), remove: k => { delete vfs.files[k]; }, hasModules: () => false, installed: () => false };
    const res = { out, errs, sys, vfs, R, exitCode: undefined, thrown: null };
    const io = {
      out: () => {},
      hop: fn => setImmediate(fn),
      asyncErr: e => { errs.push(e); res.env.stop(); },
      exit: c => { res.exitCode = c; },
      sys: t => sys.push(t),
      done: () => resolve(res),
    };
    res.io = io;
    ctx.__fail = () => io.asyncErr(new Error('boom'), true);
    res.env = NodeEnv.make(R, vfs, 'main.js', [], io);
    try { res.env.runMain('main.js', src); } catch (e) { res.thrown = e; resolve(res); }
  });
}

for (const prog of CORPUS) {
  test(`vm matches expect: ${prog.name}`, { timeout: 5000 }, async () => {
    const r = await runVm(prog.src);
    assert.equal(r.thrown && !r.thrown.__exit ? r.thrown : null, null);
    const msg = compareLines(`"${prog.name}" (vm vs expect)`, r.out, prog.expect);
    assert.equal(msg, null, msg);
  });
}

test('fs completes in the poll phase without any host timer', { timeout: 5000 }, async () => {
  const orig = globalThis.setTimeout;
  globalThis.setTimeout = () => { throw new Error('host setTimeout used'); };
  try {
    const r = await runVm(`const fs = require('fs');
fs.readFile('notes.txt', 'utf8', (e, d) => console.log('cb ' + d.trim()));
fs.promises.readFile('notes.txt', 'utf8').then(d => console.log('promise ' + d.trim()));
fs.readFile('nope.txt', e => console.log(e.code));`);
    assert.deepEqual(r.errs, []);
    assert.deepEqual(r.out, ['ENOENT', 'cb hello notes', 'promise hello notes']);
  } finally { globalThis.setTimeout = orig; }
});

test('fs.promises.writeFile writes at completion, so a read right after still sees the old content', { timeout: 5000 }, async () => {
  const r = await runVm(`const fs = require('fs');
fs.promises.writeFile('notes.txt', 'new').then(() => console.log('written ' + fs.readFileSync('notes.txt', 'utf8')));
console.log('before ' + fs.readFileSync('notes.txt', 'utf8').trim());`);
  assert.deepEqual(r.out, ['before hello notes', 'written new']);
  assert.equal(r.vfs.files['notes.txt'], 'new');
});

const charged = async stmt => {
  const r = await runVm(`const fs = require('fs'); const a = Date.now(); ${stmt}; console.log(Date.now() - a - 1);`, { 'notes.txt': NOTES, 'f40': 'x'.repeat(40) });
  assert.deepEqual(r.errs, []);
  return Number(r.out[0]);
};

test('sync fs charges FS_BASE_MS + ceil(bytes / 4), and meta calls charge META_MS', { timeout: 5000 }, async () => {
  const { FS_BASE_MS, META_MS } = Scheduler.COST;
  assert.equal(FS_BASE_MS, 250);
  assert.equal(await charged(`fs.readFileSync('f40')`), 260);
  assert.equal(await charged(`fs.readFileSync('notes.txt')`), 253);
  assert.equal(await charged(`fs.writeFileSync('w', '')`), 250);
  assert.equal(await charged(`fs.writeFileSync('w', 'abcde')`), 252);
  assert.equal(await charged(`fs.appendFileSync('notes.txt', 'abcd')`), 251);
  assert.equal(await charged(`fs.existsSync('notes.txt')`), META_MS);
  assert.equal(await charged(`fs.readdirSync()`), META_MS);
  assert.equal(await charged(`fs.unlinkSync('notes.txt')`), META_MS);
  assert.equal(await charged(`try { fs.readFileSync('nope') } catch (e) {}`), 0);
});

const maxGap = async (readCall, files) => {
  const r = await runVm(`const fs = require('fs'); const T = [];
const id = setInterval(() => { T.push(Date.now()); if (T.length === 6) { clearInterval(id); console.log(T.slice(1).map((t, i) => t - T[i]).join(',')); } }, 100);
setTimeout(() => { ${readCall} }, 250);`, files);
  assert.deepEqual(r.errs, []);
  return Math.max(...r.out[0].split(',').map(Number));
};

test('a sync read stalls a heartbeat, a bigger file stalls it longer, and fs.readFile leaves no gap', { timeout: 5000 }, async () => {
  const files = { 'notes.txt': NOTES, 'big.txt': 'x'.repeat(2000) };
  const small = await maxGap(`fs.readFileSync('notes.txt')`, files);
  const big = await maxGap(`fs.readFileSync('big.txt')`, files);
  const async = await maxGap(`fs.readFile('big.txt', () => {})`, files);
  assert.ok(small >= 250, `small ${small}`);
  assert.ok(big > small, `big ${big} small ${small}`);
  assert.ok(async < 130, `async ${async}`);
});

test('an async read is charged once: it completes between timers at 200 and 300 ms', { timeout: 5000 }, async () => {
  const r = await runVm(`const fs = require('fs');
fs.readFile('notes.txt', () => console.log('read'));
setTimeout(() => console.log('t200'), 200);
setTimeout(() => console.log('t300'), 300);`);
  assert.deepEqual(r.out, ['t200', 'read', 't300']);
});

test('virtual Date: now() and new Date() move 1 ms per call, other forms are the realm Date', { timeout: 5000 }, async () => {
  const r = await runVm(`const a = Date.now(), b = Date.now();
console.log(b - a, new Date().getTime() - b, a >= 1700000000000);
let n = 0; const t0 = Date.now(); while (Date.now() - t0 < 2000) n++;
console.log(n >= 1990 && n <= 2010);
console.log(typeof Date(), new Date(0).getTime(), Date.parse('2020-01-01T00:00:00Z'), Date.UTC(2020, 0, 1), new Date(0) instanceof Date);`);
  assert.deepEqual(r.errs, []);
  assert.deepEqual(r.out, ['1 1 true', 'true', 'string 0 1577836800000 1577836800000 true']);
});

test('learner code may declare the shadowed names; line numbers are unchanged', { timeout: 5000 }, async () => {
  const r = await runVm(`const setTimeout = 1; let Date = 2; const process = require('process');
console.log(setTimeout, Date, typeof process.nextTick);
console.log(new Error('x').stack.split('\\n')[1]);`);
  assert.equal(r.thrown, null);
  assert.equal(r.out[0], '1 2 function');
  assert.match(r.out[1], /:3:/);
});

test('an unhandled rejection reaching asyncErr ends the loop: no later timer runs', { timeout: 5000 }, async () => {
  const r = await runVm(`setTimeout(() => { console.log('first'); __fail(); }, 10);
setTimeout(() => console.log('later'), 30);
setInterval(() => console.log('beat'), 50);`);
  assert.deepEqual(r.out, ['first']);
  assert.equal(r.errs.length, 1);
  assert.equal(r.errs[0].message, 'boom');
});

test('a real unhandled rejection in the main script ends the loop before any timer', { timeout: 5000 }, async () => {
  const r = await runVm(`Promise.reject(new Error('boom'));
setTimeout(() => console.log('late-timer'), 10);
setImmediate(() => console.log('late-immediate'));`, undefined, true);
  assert.deepEqual(r.out, []);
  assert.deepEqual(r.errs.map(e => e.message), ['boom']);
});

test('a rejection handled later in the same microtask drain does not stop the loop', { timeout: 5000 }, async () => {
  const r = await runVm(`const p = Promise.reject(new Error('handled'));
Promise.resolve().then(() => p.catch(() => console.log('caught')));
setTimeout(() => console.log('timer'), 10);`, undefined, true);
  assert.deepEqual(r.out, ['caught', 'timer']);
  assert.deepEqual(r.errs, []);
});

test('process.exit in a timer: later ticks, promise jobs, immediates and timers print nothing', { timeout: 5000 }, async () => {
  const r = await runVm(`setTimeout(() => {
  Promise.resolve().then(() => console.log('late promise'));
  process.nextTick(() => console.log('late tick'));
  setImmediate(() => console.log('late immediate'));
  console.log('before'); process.stdout.write('raw before\\n'); process.exit(3);
}, 10);
setTimeout(() => console.log('later timer'), 30);`);
  assert.deepEqual(r.out, ['before']);
  assert.equal(r.exitCode, 3);
  assert.equal(r.R.silent, true);
  assert.deepEqual(r.errs, []);
});

test('process.exit in a tick of the main script goes silent and reports the code', { timeout: 5000 }, async () => {
  const r = await runVm(`Promise.resolve().then(() => console.log('p'));
process.nextTick(() => { console.log('tick'); process.exit(2); });`);
  assert.deepEqual(r.out, ['tick']);
  assert.equal(r.exitCode, 2);
  assert.equal(r.thrown.__exit, 2);
});

test('compareLines reports a mismatch and names the program and both outputs', () => {
  const msg = compareLines('prog X', ['a', 'b'], ['b', 'a']);
  assert.match(msg, /prog X/);
  assert.match(msg, /expected \["b","a"\] but got \["a","b"\]/);
  assert.equal(compareLines('same', ['a'], ['a']), null);
  assert.notEqual(compareLines('short', ['a'], ['a', 'b']), null);
});
