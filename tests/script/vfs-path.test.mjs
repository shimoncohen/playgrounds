import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import nodePath from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadEngine } from './harness.mjs';

const ctx = loadEngine();
ctx.JSRealm = { runScript: (R, code) => { try { vm.runInContext(code, R.w); return null; } catch (e) { return e; } } };
const CWD = '/home/you/my-app';

function mk(files = {}, opts = {}) {
  const writes = [];
  const vfs = {
    files,
    write: (k, v) => { writes.push(k); files[k] = v; },
    remove: k => { delete files[k]; },
    list: () => Object.keys(files),
    installed: () => false,
    hasModules: () => !!opts.modules,
  };
  const w = vm.createContext({});
  w.Promise = vm.runInContext('Promise', w);
  const env = ctx.NodeEnv.make({ w }, vfs, 'main.js', [], { out() {}, hop: fn => setImmediate(fn) });
  return { env, vfs, files, writes, fs: env.require('fs'), path: env.require('path') };
}

const code = f => { try { f(); return null; } catch (e) { return e.code; } };

describe('path matches real path.posix', () => {
  const { path } = mk();
  const R = nodePath.posix;
  const joins = [[], [''], ['a'], ['a', 'b'], ['a', '..', 'b'], ['/a', 'b', '../c'], ['a/', '/b'], ['a', '', 'b'], ['.', 'a'], ['..', 'a'], ['a', 'b', '..', '..', '..'], ['/'], ['a//b'], ['./a/./b/'], ['a', 'b/']];
  for (const a of joins) it(`join(${JSON.stringify(a)})`, () => assert.equal(path.join(...a), R.join(...a)));

  const norms = ['', '.', './', '/', '//', 'a/b/../c', '/a/../..', '../a', 'a/./b', 'a//b///c/', '/a/b/', '../../a', 'a/..', 'a/../'];
  for (const p of norms) it(`normalize(${JSON.stringify(p)})`, () => assert.equal(path.normalize(p), R.normalize(p)));

  const resolves = [[], ['a'], ['a', 'b'], ['/a', 'b'], ['a', '/b'], ['..'], ['../x'], ['a', '..', '..'], ['/'], ['./a/'], ['', 'a']];
  for (const a of resolves) it(`resolve(${JSON.stringify(a)}) against the fixed cwd`, () => assert.equal(path.resolve(...a), R.resolve(CWD, ...a)));

  const rels = [['/a/b', '/a/b'], ['/a/b', '/a/c'], ['/a/b/c', '/a'], ['/a', '/a/b/c'], ['/', '/a'], ['a', 'b'], ['a/b', 'a'], ['/a/b', '/c/d']];
  for (const [f, t] of rels) it(`relative(${f}, ${t})`, () => assert.equal(path.relative(f, t), R.relative(R.resolve(CWD, f), R.resolve(CWD, t))));

  const parses = ['/a/b.txt', 'a/b.txt', 'b', '/', '', '/a', 'a/b/', '.bashrc', 'a.', 'a.b.c', '/x/y.tar.gz'];
  for (const p of parses) it(`parse(${JSON.stringify(p)})`, () => assert.deepEqual({ ...path.parse(p) }, { ...R.parse(p) }));

  const formats = [{ dir: 'a', base: 'b.txt' }, { root: '/', base: 'x' }, { dir: '/a', name: 'b', ext: '.js' }, { root: '/', dir: '/', base: 'x' }, { name: 'n' }];
  for (const o of formats) it(`format(${JSON.stringify(o)})`, () => assert.equal(path.format(o), R.format(o)));

  const bases = [['/x/y/z.js', '.js'], ['/x/y/z.js'], ['a.txt', '.md'], ['/a/b/'], ['', ''], ['.bashrc', '.bashrc'], ['a.js', 'a.js']];
  for (const a of bases) it(`basename(${JSON.stringify(a)})`, () => assert.equal(path.basename(...a), R.basename(...a)));

  const exts = ['a.txt', '.bashrc', 'a.', 'a.b.c', 'a', '', '..', '/x/y.js/', 'x/.hidden.md', 'a..'];
  for (const p of exts) it(`extname(${JSON.stringify(p)})`, () => assert.equal(path.extname(p), R.extname(p)));

  const dirs = ['/a/b', 'a/b', 'a', '/a', '/', '', 'a/b/', '/a//b', 'a//b'];
  for (const p of dirs) it(`dirname(${JSON.stringify(p)})`, () => assert.equal(path.dirname(p), R.dirname(p)));

  for (const p of ['/a', 'a', '', './a', '/']) it(`isAbsolute(${JSON.stringify(p)})`, () => assert.equal(path.isAbsolute(p), R.isAbsolute(p)));

  it('sep, delimiter and posix', () => {
    assert.equal(path.sep, '/');
    assert.equal(path.delimiter, ':');
    assert.equal(path.posix.join('a', 'b'), 'a/b');
  });
});

// ---- folders and fs, differential against real node in a temp directory ----

const START = { 'a.txt': 'hello', 'dir/x.txt': 'xx', 'm/': '', 'caf.txt': 'café' };

// One program, three styles. `ops` run through show() so a result or an error code becomes one line.
const SYNC_PROGRAM = `
const fs = require('fs');
const out = [];
const show = (l, f) => { try { const v = f(); out.push(l + ' ' + JSON.stringify(v === undefined ? null : v)); } catch (e) { out.push(l + ' !' + e.code); } };
const ls = p => fs.readdirSync(p).sort();
const st = p => { const s = fs.statSync(p); return [s.isFile(), s.isDirectory(), s.isFile() ? s.size : 0]; };
show('read file', () => fs.readFileSync('a.txt', 'utf8'));
show('read missing', () => fs.readFileSync('nope.txt', 'utf8'));
show('read folder', () => fs.readFileSync('dir', 'utf8'));
show('read marker folder', () => fs.readFileSync('m', 'utf8'));
show('read in missing folder', () => fs.readFileSync('nodir/x.txt', 'utf8'));
show('readdir root', () => ls('.'));
show('readdir implied', () => ls('dir'));
show('readdir marker', () => ls('m'));
show('readdir file', () => ls('a.txt'));
show('readdir missing', () => ls('zz'));
show('stat file', () => st('a.txt'));
show('stat utf8 size', () => st('caf.txt'));
show('stat implied folder', () => st('dir'));
show('stat marker folder', () => st('m'));
show('stat missing', () => st('zz'));
show('exists', () => ['a.txt', 'dir', 'm', 'zz', 'dir/x.txt', 'dir/zz'].map(p => fs.existsSync(p)));
show('mkdir new', () => fs.mkdirSync('fresh'));
show('mkdir again', () => fs.mkdirSync('fresh'));
show('mkdir over implied', () => fs.mkdirSync('dir'));
show('mkdir over file', () => fs.mkdirSync('a.txt'));
show('mkdir missing parent', () => fs.mkdirSync('p/q'));
show('mkdir recursive', () => { fs.mkdirSync('p/q', { recursive: true }); });
show('readdir p', () => ls('p'));
show('mkdir recursive existing', () => { fs.mkdirSync('fresh', { recursive: true }); });
show('mkdir recursive over implied', () => { fs.mkdirSync('dir', { recursive: true }); });
show('mkdir recursive over file', () => { fs.mkdirSync('a.txt', { recursive: true }); });
show('write into folder', () => fs.writeFileSync('fresh/f.txt', 'one'));
show('write missing parent', () => fs.writeFileSync('zz/f.txt', 'one'));
show('write over folder', () => fs.writeFileSync('dir', 'one'));
show('append', () => fs.appendFileSync('fresh/f.txt', '+two'));
show('append missing parent', () => fs.appendFileSync('zz/f.txt', 'x'));
show('append new file', () => fs.appendFileSync('fresh/g.txt', 'g'));
show('read back', () => fs.readFileSync('fresh/f.txt', 'utf8'));
show('read back g', () => fs.readFileSync('fresh/g.txt', 'utf8'));
show('readdir fresh', () => ls('fresh'));
show('unlink folder', () => fs.unlinkSync('fresh'));
show('unlink missing', () => fs.unlinkSync('nope.txt'));
show('unlink file', () => fs.unlinkSync('fresh/f.txt'));
show('unlink last file', () => fs.unlinkSync('fresh/g.txt'));
show('folder survives', () => [fs.existsSync('fresh'), ls('fresh')]);
show('unlink last file of implied folder', () => fs.unlinkSync('dir/x.txt'));
show('implied folder survives', () => [fs.existsSync('dir'), ls('dir'), st('dir')]);
show('write again after', () => fs.writeFileSync('dir/y.txt', 'y'));
show('readdir root after', () => ls('.'));
console.log(out.join('\\n'));
`;

// The same operations through the callback and the promise forms, one after another.
const ASYNC_PROGRAM = form => `
const fs = require('fs');
const out = [];
const C = (n, ...a) => new Promise(r => fs[n](...a, (e, v) => r(e ? { e: e.code } : { v })));
const P = (n, ...a) => fs.promises[n](...a).then(v => ({ v }), e => ({ e: e.code }));
const call = ${form === 'cb' ? 'C' : 'P'};
const sorted = v => v && v.v ? { v: v.v.slice().sort() } : v;
const norm = r => r.e ? '!' + r.e : JSON.stringify(r.v === undefined ? null : r.v);
const show = async (l, p, f) => out.push(l + ' ' + norm((f || (x => x))(await p)));
(async () => {
  await show('read file', call('readFile', 'a.txt', 'utf8'));
  await show('read missing', call('readFile', 'nope.txt', 'utf8'));
  await show('read folder', call('readFile', 'dir', 'utf8'));
  await show('readdir root', call('readdir', '.'), sorted);
  await show('readdir implied', call('readdir', 'dir'), sorted);
  await show('readdir marker', call('readdir', 'm'), sorted);
  await show('readdir missing', call('readdir', 'zz'), sorted);
  await show('stat file', call('stat', 'a.txt'), r => r.e ? r : { v: [r.v.isFile(), r.v.isDirectory(), r.v.size] });
  await show('stat folder', call('stat', 'dir'), r => r.e ? r : { v: [r.v.isFile(), r.v.isDirectory()] });
  await show('stat missing', call('stat', 'zz'), r => r.e ? r : { v: 1 });
  await show('mkdir new', call('mkdir', 'fresh'));
  await show('mkdir again', call('mkdir', 'fresh'));
  await show('mkdir missing parent', call('mkdir', 'p/q'));
  await show('mkdir recursive', call('mkdir', 'p/q', { recursive: true }), r => r.e ? r : { v: 0 });
  await show('write', call('writeFile', 'fresh/f.txt', 'one'));
  await show('write missing parent', call('writeFile', 'zz/f.txt', 'one'));
  await show('append', call('appendFile', 'fresh/f.txt', '+two'));
  await show('read back', call('readFile', 'fresh/f.txt', 'utf8'));
  await show('unlink folder', call('unlink', 'fresh'));
  await show('unlink missing', call('unlink', 'nope.txt'));
  await show('unlink file', call('unlink', 'fresh/f.txt'));
  await show('folder survives', call('readdir', 'fresh'), sorted);
  console.log(out.join('\\n'));
})();
`;

function runReal(program) {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'vfs-path-'));
  try {
    for (const [k, v] of Object.entries(START)) {
      if (k.endsWith('/')) fs.mkdirSync(nodePath.join(dir, k), { recursive: true });
      else { fs.mkdirSync(nodePath.dirname(nodePath.join(dir, k)), { recursive: true }); fs.writeFileSync(nodePath.join(dir, k), v); }
    }
    const r = spawnSync(process.execPath, ['-e', program], { cwd: dir, encoding: 'utf8', timeout: 10000 });
    if (r.error) { if (['ENOENT', 'EACCES', 'EPERM'].includes(r.error.code)) return null; throw r.error; }
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim().split('\n');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function runVm(program) {
  return new Promise((resolve, reject) => {
    const lines = [];
    const files = { ...START };
    const vfs = { files, write: (k, v) => { files[k] = v; }, remove: k => { delete files[k]; }, list: () => Object.keys(files), installed: () => false, hasModules: () => false };
    const w = vm.createContext({ console: { log: (...a) => lines.push(a.join(' ')) } });
    w.Promise = vm.runInContext('Promise', w);
    const io = { out() {}, hop: fn => setImmediate(fn), asyncErr: reject, done: () => resolve(lines.join('\n').split('\n')) };
    const env = ctx.NodeEnv.make({ w }, vfs, 'main.js', [], io);
    try { env.runMain('main.js', program); } catch (e) { reject(e); }
  });
}

describe('folders and fs match real node', () => {
  it('sync forms', async () => {
    const real = runReal(SYNC_PROGRAM);
    const mine = await runVm(SYNC_PROGRAM);
    if (real) assert.deepEqual(mine, real);
    assert.ok(mine.length > 40);
    assert.ok(mine.includes('unlink folder !EISDIR'));
  });
  for (const form of ['cb', 'promise']) {
    it(`${form} forms`, async () => {
      const real = runReal(ASYNC_PROGRAM(form));
      const mine = await runVm(ASYNC_PROGRAM(form));
      if (real) assert.deepEqual(mine, real);
      assert.ok(mine.length >= 20);
    });
  }
  it('the callback and promise forms agree with each other', async () => {
    assert.deepEqual(await runVm(ASYNC_PROGRAM('cb')), await runVm(ASYNC_PROGRAM('promise')));
  });
});

describe('marker rules', () => {
  it('mkdir writes the marker', () => {
    const t = mk({});
    t.fs.mkdirSync('ledger');
    assert.equal(t.files['ledger/'], '');
  });

  it('recursive mkdir over a folder implied only by a file writes the marker', () => {
    const t = mk({ 'ledger/day1.txt': 'x' });
    assert.equal(t.fs.mkdirSync('ledger', { recursive: true }), undefined);
    assert.equal(t.files['ledger/'], '');
    assert.equal(t.files['ledger/day1.txt'], 'x');
  });

  it('mkdir over a marker that is already there writes nothing more', () => {
    const t = mk({ 'ledger/': '' });
    t.fs.mkdirSync('ledger', { recursive: true });
    assert.deepEqual(t.writes, []);
  });

  it('unlink of the last file in a marker-less folder leaves the marker', () => {
    const t = mk({ 'ledger/day1.txt': 'x' });
    t.fs.unlinkSync('ledger/day1.txt');
    assert.deepEqual(Object.keys(t.files), ['ledger/']);
    assert.equal(t.fs.existsSync('ledger'), true);
    assert.deepEqual([...t.fs.readdirSync('ledger')], []);
  });

  it('unlink with the marker already there, or with other files left, writes nothing', () => {
    const a = mk({ 'ledger/': '', 'ledger/d.txt': 'x' });
    a.fs.unlinkSync('ledger/d.txt');
    assert.deepEqual(a.writes, []);
    const b = mk({ 'ledger/d.txt': 'x', 'ledger/e.txt': 'y' });
    b.fs.unlinkSync('ledger/d.txt');
    assert.deepEqual(b.writes, []);
  });

  it('a file in a nested marker-less folder keeps its folder', () => {
    const t = mk({ 'a/b/c.txt': 'x' });
    t.fs.unlinkSync('a/b/c.txt');
    assert.deepEqual([...t.fs.readdirSync('a')], ['b']);
    assert.deepEqual([...t.fs.readdirSync('a/b')], []);
  });

  it('the project file list is not touched: readdir of root hides marker slashes', () => {
    const t = mk({ 'hello.js': '', 'ledger/': '', 'ledger/d.txt': 'x' }, { modules: true });
    assert.deepEqual([...t.fs.readdirSync('.')], ['hello.js', 'ledger', 'node_modules']);
  });
});

describe('fs details', () => {
  it('error messages name the call and the path', () => {
    const t = mk({ 'dir/x.txt': 'x' });
    assert.throws(() => t.fs.readFileSync('nope.txt'), /ENOENT: no such file or directory, open 'nope.txt'/);
    assert.throws(() => t.fs.mkdirSync('dir'), /EEXIST: file already exists, mkdir 'dir'/);
    assert.throws(() => t.fs.mkdirSync('a/b'), /ENOENT: no such file or directory, mkdir 'a\/b'/);
    assert.throws(() => t.fs.readFileSync('dir'), /EISDIR/);
  });

  it('paths with ./ and the full cwd prefix reach the same file', () => {
    const t = mk({ 'ledger/d.txt': 'x' });
    assert.equal(t.fs.readFileSync('./ledger/d.txt', 'utf8'), 'x');
    assert.equal(t.fs.readFileSync(CWD + '/ledger/d.txt', 'utf8'), 'x');
    assert.equal(t.fs.readFileSync('ledger/../ledger/d.txt', 'utf8'), 'x');
  });

  it('stat size counts UTF-8 bytes', () => {
    assert.equal(mk({ 'a.txt': 'café' }).fs.statSync('a.txt').size, 5);
  });

  it('a callback without a function is a TypeError', () => {
    assert.throws(() => mk({}).fs.readdir('.'), { name: 'TypeError' });
  });

  it('the vfs needs no new method: only files, write and remove are used', () => {
    const t = mk({ 'a/b.txt': 'x' });
    t.fs.mkdirSync('c');
    t.fs.unlinkSync('a/b.txt');
    assert.deepEqual(Object.keys(t.files).sort(), ['a/', 'c/']);
  });
});

describe('async completions run in the poll phase', () => {
  // runs `src` and returns the order of the log lines
  const order = src => new Promise((resolve, reject) => {
    const log = [];
    const files = { 'a.txt': 'hi' };
    const vfs = { files, write: (k, v) => { files[k] = v; }, remove: k => { delete files[k]; }, list: () => Object.keys(files), installed: () => false, hasModules: () => false };
    const w = vm.createContext({ console: { log: (...a) => log.push(a.join(' ')) }, queueMicrotask });
    w.Promise = vm.runInContext('Promise', w);
    const io = { out() {}, hop: fn => setImmediate(fn), asyncErr: reject, done: () => resolve(log) };
    const env = ctx.NodeEnv.make({ w }, vfs, 'main.js', [], io);
    try { env.runMain('main.js', src); } catch (e) { reject(e); }
  });

  for (const [name, call] of [
    ['mkdir (callback)', "fs.mkdir('d', () => console.log('fs'))"],
    ['stat (callback)', "fs.stat('a.txt', () => console.log('fs'))"],
    ['unlink (promise)', "fs.promises.unlink('a.txt').then(() => console.log('fs'))"],
    ['readdir (promise)', "fs.promises.readdir('.').then(() => console.log('fs'))"],
  ]) {
    it(`${name}: after nextTick and microtasks, before setImmediate's later turn`, async () => {
      const log = await order(`const fs = require('fs');
${call};
process.nextTick(() => console.log('tick'));
Promise.resolve().then(() => console.log('micro'));
setImmediate(() => console.log('imm'));
setTimeout(() => console.log('timer'), 50);`);
      assert.deepEqual(log.slice(0, 2), ['tick', 'micro']);
      assert.ok(log.indexOf('fs') > 1 && log.indexOf('fs') < log.indexOf('timer'), log.join());
      assert.ok(log.indexOf('fs') < log.indexOf('imm'), log.join());
    });
  }

  it('a data op costs 250 ms plus bytes/4, so a short timer fires first', async () => {
    const log = await order(`const fs = require('fs');
fs.readFile('a.txt', 'utf8', () => console.log('fs'));
setTimeout(() => console.log('t100'), 100);
setTimeout(() => console.log('t400'), 400);`);
    assert.deepEqual(log, ['t100', 'fs', 't400']);
  });

  it('completion errors reach the callback and rejections reach catch', async () => {
    const log = await order(`const fs = require('fs');
fs.readFile('nope', 'utf8', e => console.log('cb ' + e.code));
fs.promises.mkdir('x/y').catch(e => console.log('p ' + e.code));`);
    assert.deepEqual(log.sort(), ['cb ENOENT', 'p ENOENT']);
  });
});
