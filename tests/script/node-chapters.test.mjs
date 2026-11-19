// Chapters 21 to 23 of Script Quest on the real Node engine: each check is judged the way the page judges it,
// on the output after the synchronous part and again after every printed async line.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadEngine } from './harness.mjs';
import { loadScriptContent } from '../content-loader.mjs';

const ctx = loadEngine();
ctx.JSRealm = { runScript: (R, code) => { try { vm.runInContext(code, R.w); return null; } catch (e) { return e; } } };
const CH = loadScriptContent().CH;

const NOTES = 'x'.repeat(45);
const START = { 'hello.js': 'console.log("Welcome backstage!")\n', 'notes.txt': NOTES };
const bytes = s => new TextEncoder().encode(s).length;

// seeds are written only where the key is absent, as the page does
const seeded = (m, files) => {
  const f = { ...files };
  for (const [k, v] of Object.entries(m.seed || {})) if (!(k in f)) f[k] = v;
  return f;
};

// One `node <file>` run. `snaps` holds the ctx the page would judge: after the sync part, then after each async line.
function runFile(file, files, code = files[file]) {
  const vfs = { files: { ...files }, write: (k, v) => { vfs.files[k] = v; }, list: () => Object.keys(vfs.files), remove: k => { delete vfs.files[k]; }, hasModules: () => false, installed: () => false };
  const out = [], snaps = [];
  let ok = true, phase = 'sync', finish;
  const snap = () => ({ cmd: 'node', args: [file], src: 'node ' + file, ok, out: [...out], logs: [...out], files: { ...vfs.files }, ran: { file, code } });
  const R = { silent: false };
  const w = vm.createContext({ console: { log: (...a) => { out.push(a.join(' ')); if (phase === 'async') snaps.push(snap()); } } });
  w.Promise = vm.runInContext('Promise', w);
  w.Date = vm.runInContext('Date', w);
  R.w = w;
  const done = new Promise(r => { finish = r; });
  const io = { out: () => {}, hop: fn => setImmediate(fn), asyncErr: () => { ok = false; env.stop(); }, exit: c => { ok = c === 0; }, sys: () => {}, done: () => finish() };
  const env = ctx.NodeEnv.make(R, vfs, file, [], io);
  try { env.runMain(file, code); } catch (e) { ok = e && e.__exit !== undefined ? e.__exit === 0 : false; finish(); }
  snaps.push(snap());
  phase = 'async';
  return done.then(() => ({ snaps, final: snap() }));
}

const passes = (m, run) => m.check(run.final) && [...run.snaps, run.final].some(c => m.check(c));
const failsAlways = (m, run) => [...run.snaps, run.final].every(c => !m.check(c));

// the terminal's mkdir on a copy of the files, with the page's folder rules (app.js case 'mkdir')
function mkdir(argv, files0) {
  const files = { ...files0 }, has = k => k in files;
  const isDir = k => k === '' || has(k + '/') || Object.keys(files).some(f => f.startsWith(k + '/'));
  const parentOf = k => { const i = k.replace(/\/$/, '').lastIndexOf('/'); return i < 0 ? '' : k.slice(0, i); };
  const args = argv.split(' ').slice(1), out = [];
  let ok = true;
  const rec = args.some(x => x === '-p' || x === '--parents'), a = (args.find(x => x[0] !== '-') || '').replace(/\/+$/, '');
  const bad = t => { out.push(`mkdir: cannot create directory '${a}': ${t}`); ok = false; };
  if (!rec) { if (isDir(a) || has(a)) bad('File exists'); else if (!isDir(parentOf(a))) bad('No such file or directory'); else files[a + '/'] = ''; }
  else {
    const parts = a.split('/'); let p = '';
    for (const [i, s] of parts.entries()) { p += (p ? '/' : '') + s; if (has(p)) { bad('File exists'); break; } if (i === parts.length - 1 || !isDir(p)) files[p + '/'] = ''; }
  }
  return { cmd: 'mkdir', args, src: argv, ok, out, logs: out, files };
}

// a command that is not a node run
const other = (cmd, args, files, out = []) => ({ cmd, args, src: [cmd, ...args].join(' '), ok: true, out, logs: out, files });
const LAZY = files => [other('ls', [], files, ['hello.js  notes.txt']), other('node', ['-v'], files, ['v22.12.0']),
  { ...other('node', ['-e', '1'], files), ran: { file: '[eval]', code: '1' } }, other('npm', ['-v'], files, ['10.9.2']), other('echo', ['lazy'], files, ['lazy'])];

const ch = CH[20];
const M = ch.missions;
const BANNED = /\b(simply|just|obviously|easy|easily|parseInt|Array\.isArray|statement|branch)\b/i;
const TAKEN = ['read.js', 'todo.txt', 'math.js', 'app.js', 'greet.js', 'package.json', 'cow.js', 'hello.js', 'tally.js', 'ring.js', 'welcome.js', 'counter.js', 'prices.json', 'pair.js', 'gate.js', 'lane.js', 'tick.js', 'reader.js', 'turn.js', 'freeze.js', 'smooth.js'];
const SEED_LINE = 'Opening night: 120 tickets sold\n';

describe('chapter 21: Async fs and path, shape', () => {
  it('is the first chapter after the event loop, Intermediate, Node in depth, a shell chapter', () => {
    assert.equal(ch.tier, 'intermediate');
    assert.equal(ch.group, 'Node in depth');
    assert.equal(ch.mode, 'sh');
    assert.equal(M.length, 6);
    for (const k of ['name', 'badge', 'story', 'intro']) assert.ok(typeof ch[k] === 'string' && ch[k].trim(), k);
    assert.ok(ch.learned.length >= 3);
  });

  it('every mission has the fields, 3 to 5 how steps, and no banned word', () => {
    M.forEach(m => {
      for (const k of ['title', 'goal', 'explain', 'code']) assert.ok(typeof m[k] === 'string' && m[k].trim(), `${m.title}: ${k}`);
      assert.equal(typeof m.check, 'function');
      assert.ok(m.how.length >= 3 && m.how.length <= 5, `${m.title}: how`);
      assert.ok(m.anat.length >= 2);
      assert.ok(!m.need && !m.pre && !m.then, `${m.title}: need, pre or then`);
      assert.doesNotMatch([m.title, m.goal, m.explain, m.hint || '', ...m.how, ...m.anat.map(a => a.join(' '))].join(' '), BANNED, m.title);
    });
  });

  it('the editFiles are new names, and only mission 2 (a terminal command) has none', () => {
    assert.deepEqual(M.map(m => m.editFile), ['paths.js', undefined, 'shelve.js', 'addup.js', 'listing.js', 'clearout.js']);
    M.forEach(m => m.editFile && assert.ok(!TAKEN.includes(m.editFile), m.editFile));
    assert.ok(!M[1].run && !M[1].seed);
  });

  it('seeds are the folder for mission 3 and one line in ledger/day1.txt for missions 4 to 6', () => {
    assert.deepEqual(M[0].seed, undefined);
    assert.deepEqual(M[2].seed, { 'ledger/': '' });
    for (const i of [3, 4, 5]) assert.deepEqual(M[i].seed, { 'ledger/day1.txt': SEED_LINE });
  });

  it('the intro keeps code in backticks and has no markup', () => {
    assert.equal(ch.intro.split('`').length % 2, 1);
    assert.doesNotMatch(ch.intro.replace(/`[^`]*`/g, ''), /[<>]/);
  });
});

describe('chapter 21 checks: every mission rejects the unrelated inputs', () => {
  M.forEach((m, i) => it(`mission ${i + 1} (${m.title})`, () => {
    for (const c of LAZY(seeded(m, START))) assert.ok(!m.check(c), `${c.src}`);
  }));
});

describe('chapter 21 mission 1: paths.js', () => {
  const m = M[0], file = 'paths.js', go = code => runFile(file, { ...START, [file]: code });
  it('the reference prints the three lines and passes, twice', async () => {
    const first = await go(m.code);
    assert.deepEqual(first.final.out, ['ledger/day1.txt', 'day1.txt', '.txt']);
    assert.ok(passes(m, first));
    assert.ok(passes(m, await runFile(file, first.final.files)));
  });
  it('destructured require is a valid alternative', async () => {
    assert.ok(passes(m, await go('const { join, basename, extname } = require("path")\nconst p = join("ledger", "day1.txt")\nconsole.log(p)\nconsole.log(basename(p))\nconsole.log(extname(p))\n')));
  });
  it('the nearest wrong answers fail: wrong text, a call missing, calls only in comments, plain prints', async () => {
    const lines = 'console.log("ledger/day1.txt")\nconsole.log("day1.txt")\nconsole.log(".txt")\n';
    for (const code of [
      m.code.replace('day1.txt")\nconsole.log(file)', 'day2.txt")\nconsole.log(file)'),
      m.code.replace('path.extname(file)', '".txt"'),
      m.code.replace('path.basename(file)', '"day1.txt"'),
      lines + '// path.join path.basename path.extname\n',
      lines + '/* join( basename( extname( */\n',
      lines,
    ]) assert.ok(failsAlways(m, await go(code)), code);
  });
});

describe('chapter 21 mission 2: mkdir', () => {
  const m = M[1];
  it('mkdir ledger, mkdir -p ledger and a trailing slash complete it on a fresh project', () => {
    for (const cmd of ['mkdir ledger', 'mkdir -p ledger', 'mkdir ledger/']) {
      const c = mkdir(cmd, START);
      assert.ok(c.ok && 'ledger/' in c.files, cmd);
      assert.ok(m.check(c), cmd);
    }
  });
  it('plain mkdir on a folder that exists prints File exists and does not complete it', () => {
    for (const files of [{ ...START, 'ledger/': '' }, { ...START, 'ledger/day1.txt': 'x' }]) {
      const c = mkdir('mkdir ledger', files);
      assert.equal(c.ok, false);
      assert.match(c.out[0], /File exists/);
      assert.ok(!m.check(c));
    }
  });
  it('mkdir -p completes it on a folder implied only by a file, and writes the marker', () => {
    const c = mkdir('mkdir -p ledger', { ...START, 'ledger/day1.txt': 'x' });
    assert.ok(c.ok && 'ledger/' in c.files);
    assert.ok(m.check(c));
  });
  it('another folder, a nested one, touch and the other commands do not complete it', () => {
    assert.ok(!m.check(mkdir('mkdir vault', START)));
    assert.ok(!m.check(mkdir('mkdir -p vault/ledger', START)));
    assert.ok(!m.check({ ...other('touch', ['ledger'], { ...START, ledger: '' }) }));
    assert.ok(!m.check({ ...other('mkdir', ['ledger'], START), ok: false }));
    assert.ok(!m.check(other('mkdir', ['ledger'], START)), 'no marker, no folder');
  });
});

const day1 = SEED_LINE;
describe('chapter 21 mission 3: shelve.js', () => {
  const m = M[2], file = 'shelve.js', files0 = seeded(m, START);
  const go = (code, files = files0) => runFile(file, { ...files, [file]: code });
  it('the reference completes a fresh project (folder seed only) and a replay with its own leftovers', async () => {
    const first = await go(m.code);
    assert.ok(passes(m, first));
    assert.match(first.final.files['ledger/day1.txt'], /\n$/);
    assert.ok(passes(m, await runFile(file, first.final.files)));
  });
  it('another file text and a text kept in a variable are valid alternatives', async () => {
    assert.ok(passes(m, await go('const fs = require("fs")\nfs.writeFile("ledger/day1.txt", "Day 1\\nTickets: 120\\n", (err) => {\n  console.log("saved")\n})\n')));
    assert.ok(passes(m, await go('const fs = require("fs")\nconst text = "Day 1: 80 tickets\\n"\nfs.writeFile("ledger/day1.txt", text, err => console.log("saved"))\n')));
  });
  it('the nearest wrong answers fail: sync write, wrong file, saved before the write, no saved line', async () => {
    for (const code of [
      m.code.replace('fs.writeFile(', 'fs.writeFileSync(').replace(/\(err\) => \{\n {2}console.log\("saved"\)\n\}\)/, '"x")\nconsole.log("saved")'),
      m.code.replace('ledger/day1.txt', 'ledger/day2.txt'),
      'const fs = require("fs")\nconsole.log("saved")\nfs.writeFile("ledger/day1.txt", "Day 1: 120 tickets sold\\n", (err) => {})\n',
      m.code.replace('console.log("saved")', 'console.log("done")'),
    ]) assert.ok(failsAlways(m, await go(code)), code);
  });
  it('a replay with the old file and a program that only prints saved fails, as does one that hides writeFile in a comment', async () => {
    const old = (await go(m.code)).final.files;
    for (const code of ['console.log("saved")\n', '// fs.writeFile(\nconsole.log("saved")\n']) {
      assert.ok(failsAlways(m, await runFile(file, { ...old, [file]: code })), code);
    }
  });
  it('a runtime error fails it', async () => {
    assert.ok(failsAlways(m, await go(m.code + 'null.x\n')));
  });
});

describe('chapter 21 mission 4: addup.js', () => {
  const m = M[3], file = 'addup.js';
  const go = (code, files) => runFile(file, { ...files, [file]: code });
  const fresh = seeded(m, START);

  it('the reference completes a fresh project (seed line) and prints the earlier line first', async () => {
    const run = await go(m.code, fresh);
    assert.ok(passes(m, run));
    assert.equal(run.final.out.join('\n').trimEnd(), SEED_LINE + m.code.match(/Day 2: [^\\]*/)[0]);
  });

  it('it also completes when ledger/day1.txt holds the learner\'s own mission 3 text, whether or not that write had finished', async () => {
    const m3 = M[2];
    const own = await runFile('shelve.js', { ...seeded(m3, START), 'shelve.js': m3.code });
    const atSaved = own.snaps.find(c => c.out.includes('saved'));
    assert.ok(atSaved, 'mission 3 completes on its saved line');
    for (const files of [atSaved.files, own.final.files]) {
      const run = await go(m.code, { ...seeded(m, files), 'shelve.js': m3.code });
      assert.ok(passes(m, run), JSON.stringify(files));
      assert.match(run.final.out.join('\n'), /Day 1: 120 tickets sold/);
    }
    const noNewline = { ...START, 'ledger/day1.txt': 'Day 1: 80 tickets' };
    assert.ok(passes(m, await go(m.code.replace('"Day 2', '"\\nDay 2'), seeded(m, noNewline))), 'a leading newline in the appended text');
    assert.ok(failsAlways(m, await go(m.code, seeded(m, noNewline))), 'one run-together line has nothing before it');
  });

  it('a replay with the first run\'s leftovers completes it again', async () => {
    const first = await go(m.code, fresh);
    assert.ok(passes(m, await go(m.code, first.final.files)));
  });

  it('a valid alternative: promises with await', async () => {
    const alt = 'const fs = require("fs")\nasync function main() {\n  await fs.promises.appendFile("ledger/day1.txt", "Day 2: 70 tickets\\n")\n  const text = await fs.promises.readFile("ledger/day1.txt", "utf8")\n  console.log(text)\n}\nmain()\n';
    assert.ok(passes(m, await go(alt, fresh)));
  });

  it('the nearest wrong answers fail on the output and on every partial output', async () => {
    const readFirst = m.code.replace(/fs\.appendFile\([^]*$/, '') + 'fs.readFile("ledger/day1.txt", "utf8", (err, text) => {\n  console.log(text)\n  fs.appendFile("ledger/day1.txt", "Day 2: 95 tickets sold\\n", (err) => {})\n})\n';
    for (const code of [
      readFirst,
      m.code.replace('console.log(text)', 'console.log("Day 2: 95 tickets sold")'),
      m.code.replace('console.log(text)', 'console.log(text.length)'),
      m.code.replace('console.log(text)', 'console.log("working")\n    console.log(text + "extra")'),
      m.code.replace('console.log(text)', ''),
      'const fs = require("fs")\nconsole.log("Opening night: 120 tickets sold\\nDay 2: 95 tickets sold")\n',
      'const fs = require("fs")\nfs.readFile("ledger/day1.txt", "utf8", (err, text) => console.log(text))\n',
      '// fs.appendFile(\nconst fs = require("fs")\nfs.readFile("ledger/day1.txt", "utf8", (err, text) => console.log(text))\n',
    ]) assert.ok(failsAlways(m, await go(code, fresh)), code);
  });
});

describe('chapter 21 mission 5: listing.js', () => {
  const m = M[4], file = 'listing.js';
  const go = (code, files) => runFile(file, { ...files, [file]: code });
  const fresh = seeded(m, START);
  const size = bytes(SEED_LINE);

  it('the reference prints the name and the real size on a fresh project and on a replay', async () => {
    const run = await go(m.code, fresh);
    assert.deepEqual(run.final.out, [`day1.txt ${size}`]);
    assert.ok(passes(m, run));
    assert.ok(passes(m, await go(m.code, run.final.files)));
  });
  it('a file with a multi-byte character is measured in bytes, and two files are both listed', async () => {
    const files = { ...fresh, 'ledger/day1.txt': 'café\n', 'ledger/day2.txt': 'ok\n' };
    const run = await go(m.code, files);
    assert.deepEqual(run.final.out, ['day1.txt 6', 'day2.txt 3']);
    assert.ok(passes(m, run));
    assert.ok(failsAlways(m, await go(m.code.replace('for (const name of names) {', 'for (const name of names.slice(0, 1)) {'), files)));
  });
  it('callbacks, then, and string joining are valid alternatives', async () => {
    assert.ok(passes(m, await go('const fs = require("fs")\nfs.readdir("ledger", (err, names) => {\n  names.forEach(name => fs.stat("ledger/" + name, (err, info) => console.log(name + " " + info.size)))\n})\n', fresh)));
    assert.ok(passes(m, await go('const fs = require("fs")\nfs.promises.readdir("ledger").then(names => names.forEach(name => fs.promises.stat("ledger/" + name).then(info => console.log(name, info.size))))\n', fresh)));
  });
  it('the nearest wrong answers fail: Sync calls, a wrong size, no size, literals, comments', async () => {
    for (const code of [
      'const fs = require("fs")\nfor (const name of fs.readdirSync("ledger")) console.log(name, fs.statSync("ledger/" + name).size)\n',
      m.code.replace('info.size', 'name.length'),
      m.code.replace('console.log(name, info.size)', 'console.log(name)'),
      m.code.replace('info.size', 'info.size + 1'),
      `console.log("day1.txt ${size}")\n`,
      `// readdir( stat(\nconsole.log("day1.txt ${size}")\n`,
    ]) assert.ok(failsAlways(m, await go(code, fresh)), code);
  });
});

describe('chapter 21 mission 6: clearout.js', () => {
  const m = M[5], file = 'clearout.js';
  const go = (code, files) => runFile(file, { ...files, [file]: code });
  const fresh = seeded(m, START);

  it('the reference removes the file, keeps the folder, prints removed then ENOENT', async () => {
    const run = await go(m.code, fresh);
    assert.ok(passes(m, run));
    assert.ok(!('ledger/day1.txt' in run.final.files));
    assert.ok('ledger/' in run.final.files, 'the folder survives through its marker');
    assert.equal(run.final.out.at(-1), 'ENOENT');
    assert.match(run.final.out[0], /removed/);
  });
  it('a replay completes once the seed brings the file back', async () => {
    const first = await go(m.code, fresh);
    assert.ok(passes(m, await go(m.code, seeded(m, first.final.files))));
    assert.ok(!('ledger/day1.txt' in first.final.files), 'without the seed there is no file to remove');
  });
  it('the promise chain with catch is a valid alternative', async () => {
    assert.ok(passes(m, await go('const fs = require("fs")\nfs.promises.unlink("ledger/day1.txt")\n  .then(() => console.log("removed"))\n  .then(() => fs.promises.stat("ledger/day1.txt"))\n  .catch(err => console.log(err.code))\n', fresh)));
  });
  it('the nearest wrong answers fail on the output and on every partial output', async () => {
    for (const code of [
      m.code.replace('unlink', 'unlinkSync').replace('await fs.promises.unlinkSync(', 'fs.unlinkSync('),
      m.code.replace('await fs.promises.unlink("ledger/day1.txt")\n', ''),
      m.code.replace('console.log(err.code)', 'console.log("ENOENT")'),
      m.code.replace('console.log("removed")\n', ''),
      'console.log("removed")\nconsole.log("ENOENT")\n',
      '// fs.promises.unlink( stat( .code\nconsole.log("removed")\nconsole.log("ENOENT")\n',
    ]) assert.ok(failsAlways(m, await go(code, fresh)), code);
  });
});

const ch22 = CH[21];
const E = ch22.missions;
const EV_FILES = ['bell.js', 'args.js', 'once.js', 'unplug.js', 'booth.js', 'error.js', 'curtain.js'];
const EVENTS = 'const EventEmitter = require("events")\n';

describe('chapter 22: Events, shape', () => {
  it('is the second Node in depth chapter, Intermediate, a shell chapter, with 7 missions', () => {
    assert.equal(ch22.tier, 'intermediate');
    assert.equal(ch22.group, 'Node in depth');
    assert.equal(ch22.mode, 'sh');
    assert.equal(E.length, 7);
    for (const k of ['name', 'badge', 'story', 'intro']) assert.ok(typeof ch22[k] === 'string' && ch22[k].trim(), k);
    assert.ok(ch22.learned.length >= 3);
  });
  it('every mission has the fields, 3 to 5 how steps, no seed, then, need or pre, and no banned word', () => {
    E.forEach(m => {
      for (const k of ['title', 'goal', 'explain', 'code']) assert.ok(typeof m[k] === 'string' && m[k].trim(), `${m.title}: ${k}`);
      assert.equal(typeof m.check, 'function');
      assert.ok(m.how.length >= 3 && m.how.length <= 5, `${m.title}: how`);
      assert.ok(m.anat.length >= 2);
      assert.ok(!m.need && !m.pre && !m.then && !m.seed, `${m.title}: need, pre, then or seed`);
      assert.doesNotMatch([m.title, m.goal, m.explain, m.hint || '', ...m.how, ...m.anat.map(a => a.join(' '))].join(' '), BANNED, m.title);
    });
  });
  it('the editFiles are new names, one per mission', () => {
    assert.deepEqual(E.map(m => m.editFile), EV_FILES);
    E.forEach(m => assert.ok(!TAKEN.includes(m.editFile) && !M.some(x => x.editFile === m.editFile), m.editFile));
  });
  it('the intro keeps code in backticks and has no markup', () => {
    assert.equal(ch22.intro.split('`').length % 2, 1);
    assert.doesNotMatch(ch22.intro.replace(/`[^`]*`/g, ''), /[<>]/);
  });
});

describe('chapter 22 checks: every mission rejects the unrelated inputs', () => {
  E.forEach((m, i) => it(`mission ${i + 1} (${m.title})`, () => {
    for (const c of LAZY(START)) assert.ok(!m.check(c), `${c.src}`);
  }));
});

// every mission: the reference gives the lines the goal names, passes (twice), and the wrong answers fail on every partial output
const EXPECT = [
  ['Ding!'],
  ['before', 'Till: popcorn 3', 'Sign: popcorn x3', 'after'],
  ['Gates open!', '0'],
  ['Ding!', 'quiet'],
  ['Sold a ticket to Mira'],
  ['Handled: drawer jammed', 'still running'],
  ['Show starts', 'Last act', 'Curtain down'],
];
const evRun = (i, code) => runFile(EV_FILES[i], { ...START, [EV_FILES[i]]: code });
const evOk = async (i, code) => passes(E[i], await evRun(i, code));
const evBad = async (i, codes) => { for (const code of codes) assert.ok(failsAlways(E[i], await evRun(i, code)), code); };

describe('chapter 22: the references', () => {
  E.forEach((m, i) => it(`mission ${i + 1} (${m.title}) prints its lines and passes, also on a replay`, async () => {
    const run = await evRun(i, m.code);
    assert.deepEqual(run.final.out, EXPECT[i]);
    assert.ok(passes(m, run));
    assert.ok(passes(m, await runFile(EV_FILES[i], run.final.files)));
  }));
});

describe('chapter 22 mission 1: bell.js', () => {
  it('a destructured require and another name for the emitter are valid alternatives', async () => {
    assert.ok(await evOk(0, 'const { EventEmitter } = require("events")\nconst alarm = new EventEmitter()\nalarm.on("clang", () => console.log("Ding!"))\nalarm.emit("clang")\n'));
  });
  it('the nearest wrong answers fail: emit before on, two different event names, no emitter, comments only', async () => {
    await evBad(0, [
      EVENTS + 'const bell = new EventEmitter()\nbell.emit("ring")\nbell.on("ring", () => console.log("Ding!"))\n',
      EVENTS + 'const bell = new EventEmitter()\nbell.on("ring", () => console.log("Ding!"))\nbell.emit("rang")\n',
      EVENTS + 'const bell = new EventEmitter()\nconsole.log("Ding!")\n',
      'console.log("Ding!")\n',
      '// new EventEmitter .on( .emit(\nconsole.log("Ding!")\n',
    ]);
  });
  it('a different printed text fails', async () => {
    await evBad(0, [E[0].code.replace('Ding!', 'Dong!')]);
  });
});

describe('chapter 22 mission 2: args.js', () => {
  it('the nearest wrong answers fail: emit after "after", listeners in the other order, one listener, no arguments', async () => {
    const code = E[1].code;
    const emit = 'box.emit("sale", "popcorn", 3)\n';
    const till = 'box.on("sale", (name, count) => {\n  console.log("Till: " + name + " " + count)\n})\n';
    const sign = 'box.on("sale", (name, count) => {\n  console.log("Sign: " + name + " x" + count)\n})\n';
    assert.ok(code.includes(till + sign) && code.includes(emit + 'console.log("after")'), 'the reference has the shape this test edits');
    await evBad(1, [
      code.replace(emit + 'console.log("after")', 'console.log("after")\n' + emit),
      code.replace(till + sign, sign + till),
      code.replace(sign, ''),
      code.replace(emit, 'box.emit("sale")\n'),
      'console.log("before")\nconsole.log("Till: popcorn 3")\nconsole.log("Sign: popcorn x3")\nconsole.log("after")\n',
    ]);
  });
  it('a variable holding the arguments and template strings are valid alternatives', async () => {
    assert.ok(await evOk(1, EVENTS + 'const box = new EventEmitter()\nbox.on("sale", (name, count) => console.log(`Till: ${name} ${count}`))\nbox.on("sale", (name, count) => console.log(`Sign: ${name} x${count}`))\nconsole.log("before")\nbox.emit("sale", "popcorn", 3)\nconsole.log("after")\n'));
  });
});

describe('chapter 22 mission 3: once.js', () => {
  it('a counted line printed after the emits is a valid alternative', async () => {
    assert.ok(await evOk(2, EVENTS + 'const gate = new EventEmitter()\ngate.once("open", () => console.log("Gates open!"))\ngate.emit("open")\ngate.emit("open")\ngate.emit("open")\nconsole.log(gate.listenerCount("open"))\n'));
  });
  it('the nearest wrong answers fail: on instead of once, one emit, no listenerCount, the count before the emits', async () => {
    await evBad(2, [
      E[2].code.replace('gate.once(', 'gate.on('),
      E[2].code.replace('gate.emit("open")\n', ''),
      E[2].code.replace('console.log(gate.listenerCount("open"))', 'console.log(0)'),
      E[2].code.replace('gate.emit("open")\ngate.emit("open")\nconsole.log(gate.listenerCount("open"))', 'console.log(gate.listenerCount("open"))\ngate.emit("open")\ngate.emit("open")'),
      'console.log("Gates open!")\nconsole.log(0)\n',
    ]);
  });
});

describe('chapter 22 mission 4: unplug.js', () => {
  it('removeListener is a valid alternative', async () => {
    assert.ok(await evOk(3, E[3].code.replace('bell.off(', 'bell.removeListener(')));
  });
  it('the nearest wrong answers fail: off with a new function, off before the first emit, no off, one emit', async () => {
    await evBad(3, [
      E[3].code.replace('bell.off("ring", ding)', 'bell.off("ring", () => console.log("Ding!"))'),
      E[3].code.replace('bell.emit("ring")\nbell.off("ring", ding)', 'bell.off("ring", ding)\nbell.emit("ring")'),
      E[3].code.replace('bell.off("ring", ding)\n', ''),
      E[3].code.replace('bell.off("ring", ding)\nbell.emit("ring")\n', ''),
      'console.log("Ding!")\nconsole.log("quiet")\n',
    ]);
  });
});

describe('chapter 22 mission 5: booth.js', () => {
  it('a destructured require and a longer method are valid alternatives', async () => {
    assert.ok(await evOk(4, 'const { EventEmitter } = require("events")\nclass TicketBooth extends EventEmitter {\n  sell(name) {\n    this.emit("sold", name)\n  }\n}\nconst b = new TicketBooth()\nb.on("sold", name => console.log("Sold a ticket to " + name))\nb.sell("Mira")\n'));
  });
  it('the nearest wrong answers fail: a plain emitter, emit from outside the class, no extends, no emit in the method', async () => {
    await evBad(4, [
      EVENTS + 'const booth = new EventEmitter()\nbooth.on("sold", name => console.log("Sold a ticket to " + name))\nbooth.emit("sold", "Mira")\n',
      E[4].code.replace('this.emit("sold", name)', '').replace('booth.sell("Mira")', 'booth.emit("sold", "Mira")'),
      E[4].code.replace(' extends EventEmitter', ''),
      E[4].code.replace('this.emit("sold", name)', 'console.log("Sold a ticket to " + name)').replace(/booth\.on\([^]*?\n(?=booth\.sell)/, ''),
      '// class Booth extends EventEmitter { this.emit(\nconsole.log("Sold a ticket to Mira")\n',
    ]);
  });
});

describe('chapter 22 mission 6: error.js', () => {
  it('the nearest wrong answers fail: no error listener (the program stops), a listener for another event, no still running line', async () => {
    const code = E[5].code;
    await evBad(5, [
      code.replace(/till\.on\("error"[^]*?\n\}\)\n/, ''),
      code.replace('till.on("error"', 'till.on("fault"'),
      code.replace('console.log("still running")', ''),
      code.replace('till.emit("error", new Error("drawer jammed"))', 'console.log("Handled: drawer jammed")'),
    ]);
  });
  it('the unhandled error really stops the program (so a listener is what keeps it alive)', async () => {
    const run = await evRun(5, EVENTS + 'const till = new EventEmitter()\ntill.emit("error", new Error("drawer jammed"))\nconsole.log("still running")\n');
    assert.deepEqual(run.final.out, []);
    assert.equal(run.final.ok, false);
  });
  it('a listener that prints the whole error and a string message are valid alternatives', async () => {
    assert.ok(await evOk(5, EVENTS + 'const till = new EventEmitter()\ntill.on("error", err => { console.log("Handled: " + err.message) })\ntill.emit("error", new Error("drawer jammed"))\nconsole.log("still running")\n'));
  });
});

describe('chapter 22 mission 7: curtain.js', () => {
  const m = E[6];
  it('the reference passes only once the exit line is out: no earlier partial output passes', async () => {
    const run = await evRun(6, m.code);
    const outs = [...run.snaps, run.final].map(c => c.out.join('|'));
    assert.deepEqual(outs.at(0), 'Show starts');
    assert.ok(outs.includes('Show starts|Last act'), 'a partial output with the timer line and no exit line exists');
    const passing = [...run.snaps, run.final].filter(c => m.check(c));
    assert.ok(passing.length >= 1 && passing.every(c => c.out.join('|') === EXPECT[6].join('|')));
  });
  it('a longer timer and once are valid alternatives', async () => {
    assert.ok(await evOk(6, 'process.once("exit", () => {\n  console.log("Curtain down")\n})\nsetTimeout(() => console.log("Last act"), 500)\nconsole.log("Show starts")\n'));
  });
  it('the nearest wrong answers fail on every partial output: the exit line first or in the timer, no exit listener, a lone exit line', async () => {
    await evBad(6, [
      'console.log("Curtain down")\nsetTimeout(() => console.log("Last act"), 100)\nconsole.log("Show starts")\n',
      'setTimeout(() => {\n  console.log("Last act")\n  console.log("Curtain down")\n}, 100)\nconsole.log("Show starts")\n',
      'process.on("exit", () => console.log("Curtain down"))\nconsole.log("Show starts")\nconsole.log("Last act")\n',
      m.code.replace('Last act', 'Final act'),
      m.code.replace('Show starts', 'Opening'),
      m.code.replace('setTimeout(', 'setImmediate(').replace(', 100)', ')'),
      m.code.replace('process.on("exit"', 'process.on("beforeExit"'),
      'process.on("exit", () => console.log("Curtain down"))\n',
    ]);
  });
  it('an exit listener with the timer only in a comment fails', async () => {
    await evBad(6, ['process.on("exit", () => console.log("Curtain down"))\n// setTimeout(\nconsole.log("Show starts")\nconsole.log("Last act")\n']);
  });
});

const ch23 = CH[22];
const H = ch23.missions;
const HTTP_FILES = ['server.js', 'status.js', 'routes.js', 'office.js', 'jam.js', 'flow.js'];
const THEN = ['curl localhost:3000', 'curl -i localhost:3000', 'curl localhost:3000/tickets', 'curl localhost:3000', 'curl --parallel localhost:3000 localhost:3000', 'curl --parallel localhost:3000 localhost:3000'];
const HTTP = 'const http = require("http")\n';

// `node file`, then right after runMain the mission's `then` through NodeEnv.curl. It builds the ctx the page builds
// for the node run (a server stays up) and for the curl run (app.js case 'curl'). `ranCode` is the snapshot taken when node starts.
function serveRun(file, code, then, files = START, ranCode = code) {
  const vfs = { files: { ...files, [file]: code }, write: (k, v) => { vfs.files[k] = v; }, list: () => Object.keys(vfs.files), remove: k => { delete vfs.files[k]; }, hasModules: () => false, installed: () => false };
  const out = [];
  const R = { silent: false };
  const w = vm.createContext({ console: { log: (...a) => { out.push(a.join(' ')); } } });
  w.Promise = vm.runInContext('Promise', w);
  w.Date = vm.runInContext('Date', w);
  R.w = w;
  let finish, ok = true;
  const done = new Promise(r => { finish = r; });
  const io = { out: () => {}, hop: fn => setImmediate(fn), asyncErr: () => { ok = false; env.stop(); }, exit: c => { ok = c === 0; }, sys: () => {}, done: () => finish() };
  const env = ctx.NodeEnv.make(R, vfs, file, [], io);
  try { env.runMain(file, ranCode); } catch (e) { ok = e && e.__exit !== undefined ? e.__exit === 0 : false; }
  const ran = { file, code: ranCode };
  const nodeCtx = { cmd: 'node', args: [file], src: 'node ' + file, ok, out: [...out], logs: [...out], files: { ...vfs.files }, ran, server: [...env.servers.keys()] };
  const argv = then.split(' ').slice(1), reqs = [], texts = [];
  return new Promise(resolve => {
    ctx.NodeEnv.curl(env, argv, { out: t => texts.push(t), err: t => texts.push(t), req: r => reqs.push(r), done: () => {
      const curlCtx = { cmd: 'curl', args: argv, src: then, ok: reqs.length > 0, out: texts, logs: texts, files: { ...vfs.files }, ran, server: [...env.servers.keys()], reqs };
      env.stop();
      done.then(() => resolve({ nodeCtx, curlCtx }));
    } });
  });
}
const hRef = i => serveRun(HTTP_FILES[i], H[i].code, THEN[i]);
const hPass = async (i, code, files) => { const r = await serveRun(HTTP_FILES[i], code, THEN[i], files); return H[i].check(r.curlCtx) && !H[i].check(r.nodeCtx); };
const hFail = async (i, codes, then = THEN[i]) => { for (const code of codes) { const r = await serveRun(HTTP_FILES[i], code, then); assert.ok(!H[i].check(r.curlCtx) && !H[i].check(r.nodeCtx), code); } };
const NO_NOTES = { 'hello.js': START['hello.js'] };

describe('chapter 23: A small HTTP server, shape', () => {
  it('is the last Node in depth chapter, Intermediate, a shell chapter, with 6 missions', () => {
    assert.equal(CH.indexOf(ch23), 22);
    assert.equal(ch23.tier, 'intermediate');
    assert.equal(ch23.group, 'Node in depth');
    assert.equal(ch23.mode, 'sh');
    assert.equal(H.length, 6);
    for (const k of ['name', 'badge', 'story', 'intro']) assert.ok(typeof ch23[k] === 'string' && ch23[k].trim(), k);
    assert.ok(ch23.learned.length >= 3);
  });
  it('every mission has the fields, 3 to 5 how steps, a then, no seed, need or pre, and no banned word', () => {
    H.forEach((m, i) => {
      for (const k of ['title', 'goal', 'explain', 'code']) assert.ok(typeof m[k] === 'string' && m[k].trim(), `${m.title}: ${k}`);
      assert.equal(typeof m.check, 'function');
      assert.ok(m.how.length >= 3 && m.how.length <= 5, `${m.title}: how`);
      assert.ok(m.anat.length >= 2);
      assert.ok(!m.need && !m.pre && !m.seed && !('run' in m), `${m.title}: need, pre, seed or run`);
      assert.equal(m.then, THEN[i]);
      assert.doesNotMatch([m.title, m.goal, m.explain, m.hint || '', ...m.how, ...m.anat.map(a => a.join(' '))].join(' '), BANNED, m.title);
    });
  });
  it('the editFiles are new names, one per mission', () => {
    assert.deepEqual(H.map(m => m.editFile), HTTP_FILES);
    H.forEach(m => assert.ok(!TAKEN.includes(m.editFile) && !M.some(x => x.editFile === m.editFile) && !E.some(x => x.editFile === m.editFile), m.editFile));
  });
  it('the intro keeps code in backticks and has no markup', () => {
    assert.equal(ch23.intro.split('`').length % 2, 1);
    assert.doesNotMatch(ch23.intro.replace(/`[^`]*`/g, ''), /[<>]/);
  });
  it('the first how ends with pressing Stop', () => {
    assert.match(H[0].how.at(-1), /Stop/);
  });
  it('the explains carry the honest limits: one URL at a time and a playground time line, notes.txt, no length after writeHead', () => {
    assert.match(H[4].explain, /one URL at a time/);
    assert.match(H[4].explain, /--parallel/);
    assert.match(H[4].explain, /playground/);
    assert.match(H[3].explain, /notes\.txt/);
    assert.match(H[5].explain, /notes\.txt/);
    assert.doesNotMatch(H[1].explain, /Content-Length/);
  });
});

describe('chapter 23 checks: every mission rejects the unrelated inputs', () => {
  H.forEach((m, i) => it(`mission ${i + 1} (${m.title})`, () => {
    for (const c of LAZY(START)) assert.ok(!m.check(c), `${c.src}`);
  }));
});

describe('chapter 23: the references', () => {
  H.forEach((m, i) => it(`mission ${i + 1} (${m.title}): node keeps running and completes nothing, then the curl completes`, async () => {
    const r = await hRef(i);
    assert.deepEqual(r.nodeCtx.server, [3000]);
    assert.ok(!m.check(r.nodeCtx), 'the node run alone completes nothing');
    assert.ok(m.check(r.curlCtx), JSON.stringify(r.curlCtx.reqs) + r.curlCtx.out);
  }));
  it('a replay on the files the first run left behind completes again', async () => {
    for (let i = 0; i < H.length; i++) {
      const first = await hRef(i);
      const again = await serveRun(HTTP_FILES[i], H[i].code, THEN[i], first.curlCtx.files);
      assert.ok(H[i].check(again.curlCtx), H[i].title);
    }
  });
});

describe('chapter 23 mission 1: server.js', () => {
  const m = H[0];
  it('the reference serves the target body with status 200', async () => {
    const r = await hRef(0);
    assert.equal(r.curlCtx.reqs.length, 1);
    assert.equal(r.curlCtx.reqs[0].status, 200);
    assert.equal(r.curlCtx.reqs[0].body, 'Welcome to the circus!');
  });
  it('a destructured createServer and a variable for the server are valid alternatives', async () => {
    assert.ok(await hPass(0, 'const { createServer } = require("http")\nconst s = createServer((req, res) => {\n  res.statusCode = 200\n  res.end("Welcome to the circus!")\n})\ns.listen(3000)\n'));
  });
  it('a PORT variable passed to listen is a valid alternative', async () => {
    assert.ok(await hPass(0, 'const http = require("http")\nconst PORT = 3000\nconst server = http.createServer((req, res) => {\n  res.end("Welcome to the circus!")\n})\nserver.listen(PORT)\n'));
  });
  it('the nearest wrong answers fail: another body, another port, no listen, no server at all', async () => {
    await hFail(0, [
      m.code.replace('Welcome to the circus!', 'Welcome!'),
      m.code.replace('listen(3000', 'listen(3001'),
      HTTP + 'http.createServer((req, res) => {\n  res.end("Welcome to the circus!")\n})\n',
      'console.log("Welcome to the circus!")\n',
    ]);
  });
  it('a curl with no server (the program printed and ended) fails', async () => {
    const r = await serveRun('server.js', 'console.log("hi")\n', THEN[0]);
    assert.equal(r.curlCtx.ok, false);
    assert.ok(!m.check(r.curlCtx));
  });
  it('another command, a missing ran and an empty server list fail', async () => {
    const r = await hRef(0);
    assert.ok(!m.check({ ...r.curlCtx, cmd: 'ls' }));
    assert.ok(!m.check({ ...r.curlCtx, ran: undefined }), 'c.ran may be undefined on a curl run with no process');
    assert.ok(!m.check({ ...r.curlCtx, server: [] }));
    assert.ok(!m.check({ ...r.curlCtx, server: undefined }));
  });
  it('the code that ran is judged, not the file as edited after the server started', async () => {
    const lazy = 'console.log("Welcome to the circus!")\n';
    const ranReference = await serveRun('server.js', lazy, THEN[0], START, m.code);
    assert.ok(m.check(ranReference.curlCtx), 'the server that ran is the reference, the file now holds something else');
    assert.equal(ranReference.curlCtx.files['server.js'], lazy);
    const ranLazy = await serveRun('server.js', m.code, THEN[0], START, lazy);
    assert.ok(!m.check(ranLazy.curlCtx), 'the file holds the reference, the code that ran was lazy');
  });
});

describe('chapter 23 mission 2: status.js', () => {
  const m = H[1];
  it('curl -i prints the 404 status line, the learner\'s header and the chunked line', async () => {
    const r = await hRef(1);
    const text = r.curlCtx.out.join('\n');
    assert.equal(r.curlCtx.reqs[0].status, 404);
    assert.match(text, /^HTTP\/1\.1 404 Not Found$/m);
    assert.match(text, /^X-Show: closed$/m);
    assert.match(text, /^Transfer-Encoding: chunked$/m);
  });
  it('another header name, and statusCode with setHeader, are valid alternatives', async () => {
    assert.ok(await hPass(1, HTTP + 'http.createServer((req, res) => {\n  res.statusCode = 404\n  res.setHeader("X-Tent", "shut")\n  res.end("No such tent")\n}).listen(3000)\n'));
    assert.ok(await hPass(1, HTTP + 'http.createServer((req, res) => {\n  res.writeHead(404, { "X-Tent": "shut" })\n  res.end("Nothing here")\n}).listen(3000)\n'));
  });
  it('the nearest wrong answers fail: 200, another status, no header of your own, a body that only looks like headers', async () => {
    await hFail(1, [
      m.code.replace('404', '200'),
      m.code.replace('404', '403'),
      m.code.replace(', { "X-Show": "closed" }', ''),
      HTTP + 'http.createServer((req, res) => {\n  res.end("HTTP/1.1 404 Not Found\\nX-Show: closed")\n}).listen(3000)\n',
    ]);
  });
  it('plain curl without -i fails', async () => {
    await hFail(1, [m.code], 'curl localhost:3000');
  });
});

describe('chapter 23 mission 3: routes.js', () => {
  const m = H[2];
  it('the reference answers /tickets with JSON', async () => {
    const r = await hRef(2);
    assert.equal(r.curlCtx.reqs[0].status, 200);
    assert.deepEqual(JSON.parse(r.curlCtx.reqs[0].body), { tickets: 120 });
  });
  it('a header set with setHeader and another route layout are valid alternatives', async () => {
    assert.ok(await hPass(2, HTTP + 'http.createServer((req, res) => {\n  if (req.url === "/tickets") {\n    res.setHeader("Content-Type", "application/json")\n    res.end(JSON.stringify({ tickets: 120 }))\n  } else {\n    res.end("Hello")\n  }\n}).listen(3000)\n'));
  });
  it('the nearest wrong answers fail: no JSON.stringify, another number, the wrong route, a comment', async () => {
    await hFail(2, [
      m.code.replace('JSON.stringify({ tickets: 120 })', '\'{"tickets":120}\''),
      m.code.replace('tickets: 120', 'tickets: 99'),
      m.code.replace('req.url === "/tickets"', 'req.url === "/other"'),
      HTTP + 'http.createServer((req, res) => {\n  res.end(\'{"tickets":120}\')\n}).listen(3000)\n// JSON.stringify(\n',
    ]);
  });
  it('curl of another path fails even for the reference', async () => {
    await hFail(2, [m.code], 'curl localhost:3000');
  });
});

describe('chapter 23 mission 4: office.js', () => {
  const m = H[3];
  it('the reference serves the text of notes.txt, read asynchronously', async () => {
    const r = await hRef(3);
    assert.equal(r.curlCtx.reqs[0].body, NOTES);
  });
  it('an error branch in the callback is a valid alternative', async () => {
    assert.ok(await hPass(3, HTTP + 'const fs = require("fs")\nhttp.createServer((req, res) => {\n  fs.readFile("notes.txt", "utf8", (err, text) => {\n    if (err) { res.statusCode = 500; res.end("Error"); return }\n    res.end(text)\n  })\n}).listen(3000)\n'));
  });
  it('the nearest wrong answers fail: readFileSync, a fixed string, the wrong file, a comment', async () => {
    await hFail(3, [
      HTTP + 'const fs = require("fs")\nhttp.createServer((req, res) => {\n  res.end(fs.readFileSync("notes.txt", "utf8"))\n}).listen(3000)\n',
      HTTP + 'http.createServer((req, res) => {\n  res.end("' + NOTES + '")\n}).listen(3000)\n',
      m.code.replace('"notes.txt"', '"hello.js"'),
      HTTP + 'http.createServer((req, res) => {\n  res.end("' + NOTES + '")\n}).listen(3000)\n// fs.readFile(\n',
    ]);
  });
  it('a missing notes.txt fails the mission: the read errors and the server stops', async () => {
    const r = await serveRun('office.js', m.code, THEN[3], NO_NOTES);
    assert.ok(!m.check(r.curlCtx));
  });
});

describe('chapter 23 mission 5: jam.js', () => {
  const m = H[4];
  it('the reference freezes: the two parallel requests finish 263 and 525 ms after dispatch', async () => {
    const r = await hRef(4);
    assert.deepEqual(r.curlCtx.reqs.map(q => q.ms).sort((a, b) => a - b), [263, 525]);
  });
  it('the thresholds keep a clear gap from the measured numbers', () => {
    assert.ok(500 - 263 >= 100 && 525 - 500 >= 20 && 350 - 263 >= 50 && 525 - 350 >= 100);
  });
  it('a synchronous read in a variable is a valid alternative', async () => {
    assert.ok(await hPass(4, HTTP + 'const fs = require("fs")\nhttp.createServer((req, res) => {\n  const text = fs.readFileSync("notes.txt", "utf8")\n  res.end(text)\n}).listen(3000)\n'));
  });
  it('the nearest wrong answers fail: async readFile (no freeze), no read at all, readFileSync only in a comment', async () => {
    await hFail(4, [
      H[5].code,
      HTTP + 'http.createServer((req, res) => {\n  res.end("ok")\n}).listen(3000)\n',
      H[5].code + '// fs.readFileSync(\n',
    ]);
  });
  it('a single request, or plain curl, fails', async () => {
    await hFail(4, [m.code], 'curl localhost:3000');
    await hFail(4, [m.code], 'curl --parallel localhost:3000');
  });
  it('a missing notes.txt stops the server and fails', async () => {
    const r = await serveRun('jam.js', m.code, THEN[4], NO_NOTES);
    assert.ok(!m.check(r.curlCtx));
  });
});

describe('chapter 23 mission 6: flow.js', () => {
  const m = H[5];
  it('the reference does not freeze: both requests finish 263 ms after dispatch', async () => {
    const r = await hRef(5);
    assert.deepEqual(r.curlCtx.reqs.map(q => q.ms), [263, 263]);
    assert.deepEqual(r.curlCtx.reqs.map(q => q.body), [NOTES, NOTES]);
  });
  it('readFile with an error branch is a valid alternative', async () => {
    assert.ok(await hPass(5, HTTP + 'const fs = require("fs")\nhttp.createServer((req, res) => {\n  fs.readFile("notes.txt", "utf8", (err, text) => res.end(text))\n}).listen(3000)\n'));
  });
  it('the nearest wrong answers fail: readFileSync (still frozen), no read at all, readFileSync only in a comment on top of readFile', async () => {
    await hFail(5, [
      H[4].code,
      HTTP + 'http.createServer((req, res) => {\n  res.end("ok")\n}).listen(3000)\n',
      H[4].code + '// fs.readFile(\n',
    ]);
  });
  it('one URL fails', async () => {
    await hFail(5, [m.code], 'curl --parallel localhost:3000');
  });
  it('a missing notes.txt fails the mission, as the explain says', async () => {
    const r = await serveRun('flow.js', m.code, THEN[5], NO_NOTES);
    assert.ok(!m.check(r.curlCtx));
  });
  it('a notes.txt of 380 bytes still passes and one of 800 bytes does not', async () => {
    assert.ok(m.check((await serveRun('flow.js', m.code, THEN[5], { ...START, 'notes.txt': 'x'.repeat(380) })).curlCtx));
    assert.ok(!m.check((await serveRun('flow.js', m.code, THEN[5], { ...START, 'notes.txt': 'x'.repeat(800) })).curlCtx));
  });
});
