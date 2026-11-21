import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runNode } from './terminal-harness.mjs';

// The real node, as a child of this test run: NODE_TEST_CONTEXT is dropped so the child does not take this runner's
// serialized-output mode, and NO_COLOR keeps escape codes out.
const realNode = (files, file, args = []) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nrt-'));
  try {
    for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(dir, k), v);
    const env = { ...process.env, NO_COLOR: '1' };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, [...args, file], { cwd: dir, env, encoding: 'utf8' });
    return { stdout: r.stdout, stderr: r.stderr, status: r.status };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

// Real output with what the virtual Node cannot reproduce taken out: stack frames, the error's property block and the
// line and column in "test at"; durations become N.
const norm = text => {
  const out = [];
  let skip = false;
  for (const l of text.split('\n')) {
    if (skip) { if (l === '  }') skip = false; continue; }
    if (/^\s+at /.test(l)) { if (l.endsWith(' {')) skip = true; continue; }
    out.push(l.replace(/^test at (\S+?):\d+:\d+$/, 'test at $1').replace(/\(\d+(\.\d+)?ms\)/, '(Nms)').replace(/duration_ms [\d.]+/, 'duration_ms N'));
  }
  return out.join('\n').trimEnd();
};
const virtualText = r => norm(r.lines.join('\n'));

const TEST_CORPUS = {
  'passing, nested, hooks and console.log': `
    const { test, describe, it, before, after, beforeEach, afterEach } = require('node:test');
    const assert = require('node:assert');
    test('top', () => { console.log('inside top'); });
    describe('suite', () => {
      before(() => console.log('before'));
      after(() => console.log('after'));
      beforeEach(() => console.log('each in'));
      afterEach(() => console.log('each out'));
      it('a', () => assert.strictEqual(1, 1));
      describe('inner', () => { it('b', () => {}); });
    });`,
  'failing assert and a thrown error': `
    const { test, describe, it } = require('node:test');
    const assert = require('node:assert');
    describe('suite', () => {
      it('fails', () => { assert.strictEqual(1, 2); });
      it('passes', () => {});
    });
    test('boom', () => { throw new Error('boom'); });`,
  'async tests and a timer': `
    const { test } = require('node:test');
    const assert = require('node:assert');
    test('slow', async () => { await new Promise(r => setTimeout(r, 50)); assert.ok(true); });
    test('rejects', async () => { await Promise.reject(new Error('nope')); });
    test('fast', async () => {});`,
  'subtests': `
    const { test } = require('node:test');
    test('parent', async t => {
      await t.test('one', () => {});
      await t.test('two', () => {});
    });`,
  'every test passes': `
    const { it } = require('node:test');
    it('one', () => {});
    it('two', () => {});`,
};

describe('node:test against the real node', () => {
  for (const [name, src] of Object.entries(TEST_CORPUS)) {
    it(name, async () => {
      const real = realNode({ 'a.test.js': src }, 'a.test.js', ['--test-reporter=spec']);
      const virt = await runNode({ 'a.test.js': src }, { file: 'a.test.js' });
      assert.equal(virtualText(virt), norm(real.stdout));
      assert.equal(virt.exitCode ?? 0, real.status);
    });
  }

  it('prints the same through --test as through a direct run (real node)', () => {
    const src = TEST_CORPUS['failing assert and a thrown error'];
    const a = realNode({ 'a.test.js': src }, 'a.test.js', ['--test-reporter=spec']);
    const b = realNode({ 'a.test.js': src }, 'a.test.js', ['--test', '--test-reporter=spec']);
    assert.equal(norm(a.stdout), norm(b.stdout));
    assert.match(a.stdout, /^✖ boom/m);
  });
});

describe('node:test in the virtual Node', () => {
  it('sets the exit code to 1 when a test fails and leaves it alone when all pass', async () => {
    const fail = await runNode({ 'a.js': "require('node:test')('x', () => { throw new Error('no'); });" }, { file: 'a.js' });
    assert.equal(fail.exitCode, 1);
    const ok = await runNode({ 'a.js': "require('node:test')('x', () => {});" }, { file: 'a.js' });
    assert.equal(ok.exitCode, undefined);
  });

  it('runs tests one after another and waits for each one timer', async () => {
    const r = await runNode({ 'a.js': `
      const { test } = require('node:test');
      test('one', async () => { console.log('one start'); await new Promise(r => setTimeout(r, 50)); console.log('one end'); });
      test('two', () => console.log('two'));` }, { file: 'a.js' });
    assert.deepEqual(r.lines.slice(0, 3), ['one start', 'one end', 'two']);
  });

  it('fails a test whose promise can never settle, and the run ends', async () => {
    const r = await runNode({ 'a.js': `
      const { test } = require('node:test');
      test('stuck', () => new Promise(() => {}));
      test('after', () => {});` }, { file: 'a.js' });
    const text = r.lines.join('\n');
    assert.match(text, /✖ stuck/);
    assert.match(text, /Promise resolution is still pending but the event loop has already resolved/);
    assert.match(text, /✔ after/);
    assert.equal(r.exitCode, 1);
  });

  it('runs hooks around each test, outer beforeEach first and inner afterEach first', async () => {
    const r = await runNode({ 'a.js': `
      const { describe, it, beforeEach, afterEach } = require('node:test');
      beforeEach(() => console.log('root in'));
      afterEach(() => console.log('root out'));
      describe('s', () => {
        beforeEach(() => console.log('s in'));
        afterEach(() => console.log('s out'));
        it('t', () => console.log('t'));
      });` }, { file: 'a.js' });
    assert.deepEqual(r.lines.slice(0, 5), ['root in', 's in', 't', 's out', 'root out']);
  });

  it('a failing beforeEach fails the test and counts nothing as passed', async () => {
    const r = await runNode({ 'a.js': `
      const { it, beforeEach } = require('node:test');
      beforeEach(() => { throw new Error('hook'); });
      it('t', () => {});` }, { file: 'a.js' });
    assert.match(r.lines.join('\n'), /✖ t[\s\S]*ℹ pass 0[\s\S]*ℹ fail 1/);
  });

  it('exports test, describe, it, suite and the hooks, as properties and as the default', async () => {
    const r = await runNode({ 'a.js': `
      const t = require('node:test');
      console.log(['test', 'describe', 'it', 'suite', 'before', 'after', 'beforeEach', 'afterEach'].map(k => typeof t[k]).join());
      console.log(t.test === t, typeof t.default);` }, { file: 'a.js' });
    assert.deepEqual(r.lines, ['function,function,function,function,function,function,function,function', 'true undefined']);
  });
});

const ASSERT_CASES = [
  ['ok', 'assert.ok(false)'], ['ok with a message', "assert.ok(0, 'hi')"], ['ok with no value', 'assert.ok()'],
  ['equal', 'assert.equal(1, 2)'], ['notEqual', 'assert.notEqual(1, 1)'],
  ['strictEqual numbers', 'assert.strictEqual(1, 2)'], ['strictEqual types', "assert.strictEqual(1, '1')"], ['strictEqual strings', "assert.strictEqual('a', 'b')"],
  ['notStrictEqual', 'assert.notStrictEqual(1, 1)'], ['notStrictEqual strings', "assert.notStrictEqual('a', 'a')"],
  ['deepEqual', 'assert.deepEqual({ a: 1 }, { a: 2 })'], ['deepEqual passes loosely', "assert.deepEqual({ a: 1 }, { a: '1' })"],
  ['deepStrictEqual object', 'assert.deepStrictEqual({ a: 1 }, { a: 2 })'], ['deepStrictEqual array', 'assert.deepStrictEqual([1, 2], [1, 3])'],
  ['deepStrictEqual primitives', 'assert.deepStrictEqual(1, 2)'], ['deepStrictEqual passes', 'assert.deepStrictEqual({ a: [1, { b: new Set([1]) }] }, { a: [1, { b: new Set([1]) }] })'],
  ['deepStrictEqual prototypes', 'assert.deepStrictEqual(Object.create(null), {})'],
  ['notDeepStrictEqual', 'assert.notDeepStrictEqual({ a: 1 }, { a: 1 })'],
  ['throws nothing', 'assert.throws(() => {})'], ['throws a class', "assert.throws(() => { throw new Error('x'); }, TypeError)"],
  ['throws a regexp', "assert.throws(() => { throw new Error('x'); }, /y/)"], ['throws a matching regexp', "assert.throws(() => { throw new Error('x'); }, /x/)"],
  ['throws an object', "assert.throws(() => { throw new Error('x'); }, { message: 'x' })"],
  ['throws a validator', "assert.throws(() => { throw new Error('x'); }, e => e.message === 'x')"],
  ['throws a message', "assert.throws(() => {}, 'text')"], ['throws an expected class name', 'assert.throws(() => {}, TypeError)'],
  ['doesNotThrow', "assert.doesNotThrow(() => { throw new Error('x'); })"],
  ['match', "assert.match('abc', /x/)"], ['match a number', 'assert.match(1, /x/)'], ['doesNotMatch', "assert.doesNotMatch('abc', /b/)"],
  ['fail', 'assert.fail()'], ['fail with a message', "assert.fail('boo')"], ['fail with an Error', "assert.fail(new RangeError('r'))"],
  ['ifError', "assert.ifError(new Error('e'))"], ['assert itself', 'assert(false, "m")'],
  ['strict mode equal', "assert.strict.equal(1, '1')"],
];
const ASYNC_ASSERT_CASES = [
  ['rejects nothing', 'assert.rejects(Promise.resolve())'], ['rejects a regexp', "assert.rejects(Promise.reject(new Error('a')), /b/)"],
  ['rejects a function', "assert.rejects(async () => { throw new Error('a'); }, /a/)"],
  ['doesNotReject', "assert.doesNotReject(Promise.reject(new Error('a')))"],
];
// Shape-only: the real message shows the call's source text, or a diff by Node's own algorithm.
const HEADER_ONLY = new Set(['ok', 'deepStrictEqual object', 'deepStrictEqual array', 'throws an object', 'ok with no value', 'deepStrictEqual prototypes']);

const assertScript = `
  const assert = require('assert');
  const sync = ${JSON.stringify(ASSERT_CASES.map(c => c[1]))};
  const async_ = ${JSON.stringify(ASYNC_ASSERT_CASES.map(c => c[1]))};
  const rec = e => e ? [e.name, e.code, e.message, e.generatedMessage, e.operator, JSON.stringify([e.actual, e.expected])] : null;
  (async () => {
    const out = [];
    for (const src of sync) { let e = null; try { new Function('assert', src)(assert); } catch (x) { e = x; } out.push(rec(e)); }
    for (const src of async_) { let e = null; try { await new Function('assert', 'return ' + src)(assert); } catch (x) { e = x; } out.push(rec(e)); }
    console.log(JSON.stringify(out));
  })();`;

describe('assert against the real node', () => {
  it('matches name, code, message, generatedMessage, operator, actual and expected for every method', async () => {
    const real = JSON.parse(realNode({ 'a.js': assertScript }, 'a.js').stdout);
    const virt = JSON.parse((await runNode({ 'a.js': assertScript }, { file: 'a.js' })).lines.join(''));
    const names = [...ASSERT_CASES, ...ASYNC_ASSERT_CASES].map(c => c[0]);
    assert.equal(virt.length, real.length);
    virt.forEach((v, i) => {
      const r = real[i];
      if (HEADER_ONLY.has(names[i]) && r) {
        assert.equal(v && v[2].split('\n')[0], r[2].split('\n')[0], names[i]);
        assert.deepEqual(v.slice(0, 2).concat(v.slice(4)), r.slice(0, 2).concat(r.slice(4)), names[i]);
        assert.equal(v[3], r[3], names[i]);
        if (names[i].startsWith('deepStrictEqual')) assert.match(v[2], /\n\+ actual - expected\n\n/, names[i]);
      } else assert.deepEqual(v, r, names[i]);
    });
  });

  it('exposes AssertionError with its properties', async () => {
    const r = await runNode({ 'a.js': `
      const assert = require('node:assert');
      try { assert.strictEqual(1, 2); } catch (e) {
        console.log(e instanceof assert.AssertionError, e instanceof Error, e.name, e.code, e.actual, e.expected, e.operator, e.generatedMessage);
      }
      console.log(typeof assert.strict, assert.strict === require('assert/strict'), require('node:assert/strict').equal === assert.strictEqual);` }, { file: 'a.js' });
    assert.deepEqual(r.lines, ['true true AssertionError ERR_ASSERTION 1 2 strictEqual true', 'function true true']);
  });

  it('a custom message is the whole message (node 24 appends the diff to it, node 22 does not: the virtual Node says v22)', async () => {
    const r = await runNode({ 'a.js': "try { require('assert').strictEqual(1, 2, 'custom'); } catch (e) { console.log(e.message, e.generatedMessage); }" }, { file: 'a.js' });
    assert.deepEqual(r.lines, ['custom false']);
  });

  it('strict mode maps equal and deepEqual to the strict forms', async () => {
    const r = await runNode({ 'a.js': `
      const assert = require('assert/strict');
      const t = f => { try { f(); return 'ok'; } catch (e) { return e.operator; } };
      console.log(t(() => assert.equal(1, '1')), t(() => assert.deepEqual([1], ['1'])), t(() => assert.notEqual(1, 1)));` }, { file: 'a.js' });
    assert.deepEqual(r.lines, ['strictEqual deepStrictEqual notStrictEqual']);
  });
});

describe('modules and process through NodeEnv', () => {
  const notFound = name => `Cannot find module '${name}'`;

  it('require resolves only own properties, on a plain env and with the extra modules', async () => {
    for (const node of [false, true]) {
      const r = await runNode({ 'a.js': `
        for (const n of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'node:constructor', 'valueOf', 'test']) {
          try { require(n); console.log('LOADED', n); } catch (e) { console.log(e.code, e.message); }
        }` }, { file: 'a.js', node });
      assert.deepEqual(r.lines, ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'constructor', 'valueOf', 'test'].map(n => 'MODULE_NOT_FOUND ' + notFound(n)));
    }
  });

  it('require returns no object from the host realm', async () => {
    const r = await runNode({ 'a.js': "try { require('__proto__'); console.log('LOADED'); } catch (e) { console.log(e.constructor === Error); }" }, { file: 'a.js' });
    assert.deepEqual(r.lines, ['false']);
  });

  it('a project file named like an Object.prototype member loads through require', async () => {
    for (const name of ['constructor', '__proto__', 'toString']) {
      const r = await runNode({ 'a.js': `console.log(require('./${name}').v, require('./${name}').v);`, [`${name}.js`]: 'exports.v = 7;' }, { file: 'a.js' });
      assert.deepEqual(r.lines, ['7 7'], name);
      assert.equal(r.thrown, null);
    }
  });

  it('a failing deepStrictEqual on a self-referencing object prints a diff instead of overflowing the stack', async () => {
    const r = await runNode({ 'a.js': `
      const assert = require('assert');
      const a = { n: 1 }; a.self = a;
      const b = { n: 2 }; b.self = b;
      try { assert.deepStrictEqual(a, b); } catch (e) { console.log(e.name, e.code); console.log(e.message); }` }, { file: 'a.js' });
    assert.equal(r.lines[0], 'AssertionError ERR_ASSERTION');
    assert.match(r.lines[1], /strictly deep-equal/);
    assert.match(r.lines[1], /<ref \*1> \{/);
    assert.match(r.lines[1], /self: \[Circular \*1\]/);
  });

  it('assert and node:test stay unavailable without the hooks', async () => {
    for (const n of ['assert', 'node:assert', 'assert/strict', 'node:test']) {
      const r = await runNode({ 'a.js': `try { require('${n}'); console.log('LOADED'); } catch (e) { console.log(e.code); }` }, { file: 'a.js', node: false });
      assert.deepEqual(r.lines, ['MODULE_NOT_FOUND'], n);
    }
  });

  it('node:test needs its prefix; assert works with or without it', async () => {
    const r = await runNode({ 'a.js': `
      const t = n => { try { require(n); return 'yes'; } catch (e) { return e.code; } };
      console.log(['test', 'node:test', 'assert', 'node:assert', 'assert/strict', 'node:assert/strict'].map(t).join());` }, { file: 'a.js' });
    assert.deepEqual(r.lines, ['MODULE_NOT_FOUND,yes,yes,yes,yes,yes']);
  });

  it('process.stderr.write is a raw line with a stderr marker; stdout.write has none', async () => {
    const r = await runNode({ 'a.js': "process.stdout.write('out\\n'); process.stderr.write('err\\n');" }, { file: 'a.js' });
    assert.deepEqual(r.out, [{ level: 'raw', text: 'out', marker: undefined }, { level: 'raw', text: 'err', marker: 'stderr' }]);
  });

  it('process.exitCode and process.exit reach the exit hook', async () => {
    const code = async src => (await runNode({ 'a.js': src }, { file: 'a.js' })).exitCode;
    assert.equal(await code('process.exitCode = 3;'), 3);
    assert.equal(await code('process.exit(2);'), 2);
    assert.equal(await code("setTimeout(() => { process.exitCode = 4; }, 5);"), 4);
    assert.equal(await code('console.log(1);'), undefined);
  });
});

describe('.ts through the io hooks', () => {
  const FILES = {
    'main.ts': "import { add } from './util';\nimport fs from 'fs';\nconst n: number = add(1, 2);\nconsole.log(n, fs.readFileSync('util.ts', 'utf8').split('\\n')[0]);",
    'util.ts': "export const add = (a: number, b: number): number => a + b;",
  };

  it('runs a .ts main and requires ./util as the transpiled module; fs sees the .ts source', async () => {
    const r = await runNode(FILES, { file: 'main.ts', ts: true });
    assert.deepEqual(r.lines, ['3 export const add = (a: number, b: number): number => a + b;']);
    assert.deepEqual(r.errs, []);
  });

  it('resolves exact key, then .js, then .json, then .ts', async () => {
    const run = (files, spec) => runNode({ 'm.js': `try { console.log(JSON.stringify(require('${spec}'))); } catch (e) { console.log(e.code); }`, ...files }, { file: 'm.js', ts: true });
    const x = "export const v = 'ts';";
    assert.deepEqual((await run({ 'x.ts': x }, './x')).lines, ['{"v":"ts"}']);
    assert.deepEqual((await run({ 'x.ts': x }, './x.ts')).lines, ['{"v":"ts"}']);
    assert.deepEqual((await run({ 'x.ts': x, 'x.js': 'exports.v = "js";' }, './x')).lines, ['{"v":"js"}']);
    assert.deepEqual((await run({ 'x.ts': x, 'x.json': '{"v":"json"}' }, './x')).lines, ['{"v":"json"}']);
    assert.deepEqual((await run({ 'x.json': '{"v":"json"}', 'x.js': 'exports.v = "js";' }, './x')).lines, ['{"v":"js"}']);
  });

  it('is off without the hook: a .ts file is not found and not run as JavaScript', async () => {
    const r = await runNode({ 'm.js': "try { require('./x'); } catch (e) { console.log(e.code); }", 'x.ts': 'export const v = 1;' }, { file: 'm.js' });
    assert.deepEqual(r.lines, ['MODULE_NOT_FOUND']);
  });

  it('hands the transform the key and the source and caches the module', async () => {
    const seen = [];
    const rec = (key, src) => { seen.push([key, src]); return 'exports.n = ' + seen.length + ';'; };
    const r = await runNode({ 'm.js': "console.log(require('./x').n, require('./x.ts').n);", 'x.ts': 'SRC' }, { file: 'm.js', ts: rec });
    assert.deepEqual(seen, [['x.ts', 'SRC']]);
    assert.deepEqual(r.lines, ['1 1']);
  });

  it('a type error does not stop a .ts run', async () => {
    const r = await runNode({ 'a.ts': "const n: number = 'x' as any; console.log(typeof n);" }, { file: 'a.ts', ts: true });
    assert.deepEqual(r.lines, ['string']);
  });

  it('runs a .test.ts file under node:test with esModuleInterop imports', async () => {
    const r = await runNode({ 'a.test.ts': "import { test } from 'node:test';\nimport assert from 'node:assert';\ntest('adds', () => { assert.strictEqual(1 + 1, 2); });" }, { file: 'a.test.ts', ts: true });
    assert.match(r.lines.join('\n'), /ℹ pass 1\nℹ fail 0/);
  });
});

describe('timing', () => {
  it('a file of 10 tests with one 50 ms virtual timer finishes well under 500 ms of wall time', async () => {
    const tests = Array.from({ length: 10 }, (_, i) => i === 4
      ? "test('t4', async () => { await new Promise(r => setTimeout(r, 50)); });"
      : `test('t${i}', () => assert.ok(true));`).join('\n');
    const src = `const { test } = require('node:test'); const assert = require('node:assert');\n${tests}`;
    const t0 = performance.now();
    const r = await runNode({ 'a.test.js': src }, { file: 'a.test.js' });
    const ms = performance.now() - t0;
    console.log(`# 10 tests, wall ${ms.toFixed(1)} ms, node ${process.version}`);
    assert.match(r.lines.join('\n'), /ℹ tests 10\nℹ suites 0\nℹ pass 10/);
    assert.ok(ms < 500, `took ${ms} ms`);
  });
});
