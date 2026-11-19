import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadEngine } from './harness.mjs';

const read = p => fs.readFileSync(new URL(`../../programming/script-quest/${p}`, import.meta.url), 'utf8');
const keys = o => Object.keys(o).sort();
const KEYS = {
  JSRealm: ['init', 'makeRealm', 'killRealm', 'runScript', 'prepare', 'isIncomplete', 'method'],
  NodeEnv: ['NODE_VERSION', 'FakeBuffer', 'make', 'curl'],
  TSCheck: ['init', 'check', 'load'],
};

// app.js does not rebind Scheduler, so it stays out of KEYS (the loop below demands a rebinding line).
const SCHEDULER_KEYS = ['create', 'guardSource', 'COST', 'LOOP_LIMIT', 'MAX_VIRTUAL_MS', 'MAX_CALLBACKS', 'GUARD_NAME'];

describe('engine modules load in a bare context', () => {
  it('expose exactly their key lists', () => {
    const ctx = loadEngine();
    for (const [name, list] of Object.entries(KEYS)) assert.deepEqual(keys(ctx[name]), [...list].sort(), name);
    assert.deepEqual(keys(ctx.Scheduler), [...SCHEDULER_KEYS].sort(), 'Scheduler');
  });
});

describe('script-quest wiring', () => {
  it('index.html loads the shared files in order, before content and app.js', () => {
    const tags = [...read('index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = s => tags.indexOf(s);
    const order = ['jsrealm', 'nodeenv', 'tscheck'].map(n => at(`../../shared/${n}.js`));
    assert.ok(order[0] > at('../../shared/how.js') && order[0] < order[1] && order[1] < order[2]);
    assert.ok(order[2] < at('content/helpers.js') && order[2] < at('app.js'));
  });

  it('app.js rebinds only exposed keys, calls both inits, and declares no moved name', () => {
    const app = read('app.js');
    for (const [name, list] of Object.entries(KEYS)) {
      const m = app.match(new RegExp(`^const \\{([^}]*)\\}=window\\.${name};`, 'm'));
      assert.ok(m, `no rebinding line for ${name}`);
      for (const k of m[1].split(',').map(s => s.split(':')[0].trim())) assert.ok(list.includes(k), `${name} has no ${k}`);
    }
    assert.match(app, /^initRealm\(/m);
    assert.match(app, /^initTS\(/m);
    assert.doesNotMatch(app, /^(async )?function (makeRealm|killRealm|runScript|prepare|isIncomplete|tsCheck|loadTS|makeNodeEnv)\(|^class FakeBuffer|^const (TS_LIB|NODE_VERSION|COWSAY)=/m);
  });

  it('app.js wires mkdir, curl, the running-process model and the mission fields', () => {
    const app = read('app.js');
    assert.match(app, /case 'mkdir':/);
    assert.match(app, /case 'curl':/);
    assert.match(app, /^const \{[^}]*curl:nodeCurl[^}]*\}=window\.NodeEnv;/m);
    assert.match(app, /nodeCurl\(/);
    const fn = name => app.match(new RegExp(`function ${name}\\([^\\n]*`))?.[0] ?? '';
    assert.match(app.match(/function setChapter[\s\S]*?\n\}/)[0], /stopProc\(/);
    assert.match(app.match(/\$\('#fresh'\)\.onclick[\s\S]*?\n\};/)[0], /stopProc\(\)[\s\S]*ensureNeeds\(curMission\(\)\)/);
    assert.match(fn('goMission'), /stopProc\(/);
    assert.match(app, /m\.seed/);
    assert.match(app, /m\.then/);
    assert.match(app, /case 'help':out\('[^']*mkdir \[-p\] <dir>[^']*curl /);
    assert.doesNotMatch(app, /For folders and cd/);
    assert.match(app, /\}\)\(\);\s*$/);
    assert.doesNotMatch(app, /\bfetch\(/);
    assert.doesNotThrow(() => new vm.Script(app), 'app.js parses');
  });
});

describe('JSRealm without acorn', () => {
  const { JSRealm } = loadEngine();
  it('prepare echoes an expression and reports a declaration', () => {
    const e = JSRealm.prepare('1+1');
    assert.equal(e.echo, true);
    assert.match(e.code, /^__out\(\(1\+1/);
    const d = JSRealm.prepare('let a=1');
    assert.equal(d.echo, false);
    assert.equal(d.decls[0].name, 'a');
    assert.equal(d.decls[0].kind, 'let');
  });
  it('isIncomplete spots an open block', () => {
    assert.equal(JSRealm.isIncomplete('if (x) {'), true);
    assert.equal(JSRealm.isIncomplete('1+1'), false);
  });
  it('method() is null before any realm, and makeRealm needs init first', () => {
    assert.equal(JSRealm.method(), null);
    assert.throws(() => JSRealm.makeRealm());
  });
});

describe('NodeEnv.make', () => {
  const ctx = loadEngine();
  ctx.JSRealm = { runScript: (R, code) => { try { vm.runInContext(code, R.w); return null; } catch (e) { return e; } } };
  const mk = (files = {}, installed = []) => {
    const vfs = { files, write: (k, v) => { files[k] = v; }, remove: k => { delete files[k]; }, list: () => Object.keys(files), installed: n => installed.includes(n), hasModules: () => false };
    return ctx.NodeEnv.make({ w: vm.createContext({}) }, vfs, 'app.js', [], { out() {} });
  };

  it('fs.readFileSync on a missing file is ENOENT', () => {
    try { mk().require('fs').readFileSync('nope.txt'); assert.fail('should throw'); } catch (e) { assert.equal(e.code, 'ENOENT'); }
  });
  it('Object.prototype names are not files: ENOENT, and not modules', () => {
    for (const name of ['toString', 'constructor', '__proto__']) {
      assert.throws(() => mk().require('fs').readFileSync(name), { code: 'ENOENT' }, name);
      assert.throws(() => mk().require('./' + name), { code: 'MODULE_NOT_FOUND' }, name);
    }
  });
  it('a missing relative module is MODULE_NOT_FOUND', () => {
    try { mk().require('./nope'); assert.fail('should throw'); } catch (e) { assert.equal(e.code, 'MODULE_NOT_FOUND'); }
  });
  it('process.exit(2) sets __exit', () => {
    const env = mk({ 'a.js': 'process.exit(2)' });
    try { env.require('./a.js'); assert.fail('should throw'); } catch (e) { assert.equal(e.__exit, 2); }
  });
  it('cowsay needs vfs.installed', () => {
    try { mk().require('cowsay'); assert.fail('should throw'); } catch (e) { assert.equal(e.code, 'MODULE_NOT_FOUND'); }
    assert.match(mk({}, ['cowsay']).require('cowsay').say({ text: 'hi' }), /< hi >/);
  });
  it('path.join and basename work', () => {
    const path = mk().require('path');
    assert.equal(path.join('a', 'b.txt'), 'a/b.txt');
    assert.equal(path.basename('/x/y/z.js', '.js'), 'z');
  });
  it('exports NODE_VERSION and a FakeBuffer that round-trips', () => {
    assert.equal(ctx.NodeEnv.NODE_VERSION, 'v22.12.0');
    assert.equal(new ctx.NodeEnv.FakeBuffer('héllo').toString(), 'héllo');
  });
});

describe('TSCheck', () => {
  it('check is a function', () => {
    assert.equal(typeof loadEngine().TSCheck.check, 'function');
  });
  it('load() adds script tags through the injected document and resolves false when both fail', async () => {
    const { TSCheck } = loadEngine();
    const scripts = [];
    const document = {
      createElement: () => ({}),
      head: { appendChild: s => { scripts.push(s); queueMicrotask(() => s.onerror()); } },
    };
    TSCheck.init({ document });
    assert.equal(await TSCheck.load(), false);
    assert.equal(scripts.length, 2);
    assert.match(scripts[0].src, /typescript\.min\.js$/);
    assert.match(scripts[1].src, /typescript\.js$/);
  });
});
