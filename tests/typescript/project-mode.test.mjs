import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectRun, startRun } from './project-harness.mjs';

const THREE = {
  'greet.ts': 'export function greet(who: string): string { return `hello ${who}` }',
  'util/shout.ts': 'export const shout = (s: string): string => s.toUpperCase() + "!"',
  'main.ts': "import { greet } from './greet'\nimport { shout } from './util/shout'\nconsole.log(shout(greet('ts')))",
};

describe('projectRun: a program that compiles', () => {
  it('a 3-file program prints its line', async () => {
    const r = await projectRun(THREE);
    assert.deepEqual(r.diags, []);
    assert.deepEqual(r.out, ['HELLO TS!']);
    assert.equal(r.err, null);
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.js).sort(), ['greet.js', 'main.js', 'util/shout.js']);
  });

  it('returns a Promise, not a plain object', () => {
    const p = startRun(THREE);
    assert.equal(Object.prototype.toString.call(p), '[object Promise]');
    assert.equal(typeof p.then, 'function');
    assert.equal(typeof p.stop, 'function');
    return p;
  });

  it('the result holds the files it was given', async () => {
    assert.deepEqual((await projectRun(THREE)).files, THREE);
  });

  it('an empty main.ts runs, prints nothing and has no error', async () => {
    const r = await projectRun({ 'main.ts': '' });
    assert.deepEqual([r.diags, r.out, r.err, r.ok], [[], [], null, true]);
    assert.equal(r.out.length > 0 && r.ok, false, 'a check that needs a printed line completes nothing');
  });

  it('a plain type-only import also emits no require, so the emitted JS cannot tell it from import type', async () => {
    const r = await projectRun({
      't.ts': 'export interface T { x: number }',
      'main.ts': "import { T } from './t'\nconst v: T = { x: 1 }\nconsole.log(v.x)",
    });
    assert.deepEqual(r.diags, []);
    assert.doesNotMatch(r.js['main.js'], /require/);
    assert.deepEqual(r.out, ['1']);
  });
});

describe('projectRun: compile problems stop before anything runs', () => {
  it('a name that is not exported is TS2305 against the importing file, with its line and column', async () => {
    const r = await projectRun({ 'a.ts': 'export const a = 1', 'main.ts': "console.log('first')\nimport { b } from './a'\nconsole.log(b)" });
    assert.deepEqual(r.diags.map(d => [d.file, d.line, d.col, d.code]), [['main.ts', 2, 10, 2305]]);
    assert.deepEqual(r.out, []);
    assert.equal(r.ok, false);
  });

  it('a missing file is TS2307', async () => {
    const r = await projectRun({ 'main.ts': "import { x } from './nope'\nconsole.log(x)" });
    assert.deepEqual(r.diags.map(d => [d.file, d.line, d.code]), [['main.ts', 1, 2307]]);
    assert.deepEqual(r.out, []);
  });

  it('a compile error leaves out empty even when the program would print', async () => {
    const r = await projectRun({ 'main.ts': "console.log('hi')\nconst n: number = 'x'" });
    assert.deepEqual(r.diags.map(d => d.code), [2322]);
    assert.deepEqual(r.out, []);
    assert.equal(r.err, null);
    assert.equal(r.ok, false);
  });

  it('no main.ts gives a clear message and runs nothing', async () => {
    const r = await projectRun({ 'a.ts': "export const a = 1\nconsole.log('a')" });
    assert.match(r.msg, /main\.ts/);
    assert.deepEqual([r.diags, r.out, r.err, r.ok], [[], [], null, false]);
  });
});

describe('projectRun: runtime and asynchronous results', () => {
  it('a runtime throw comes back in err and does not reject', async () => {
    const r = await projectRun({ 'main.ts': "console.log('before')\nthrow new Error('boom')" });
    assert.deepEqual(r.err, { name: 'Error', message: 'boom' });
    assert.deepEqual(r.out, ['before']);
    assert.equal(r.ok, false);
  });

  it('a throw from a module main.ts imports comes back in err', async () => {
    const r = await projectRun({ 'a.ts': "export const a = 1\nthrow new TypeError('bad module')", 'main.ts': "import { a } from './a'\nconsole.log(a)" });
    assert.deepEqual(r.err, { name: 'TypeError', message: 'bad module' });
  });

  it('a setTimeout print is in out when the Promise resolves', async () => {
    const r = await projectRun({ 'main.ts': "setTimeout(() => console.log('later'), 50)\nconsole.log('now')" });
    assert.deepEqual(r.out, ['now', 'later']);
    assert.equal(r.ok, true);
  });

  it('an error thrown inside a timer is in err, and the output before it is kept', async () => {
    const r = await projectRun({ 'main.ts': "setTimeout(() => { console.log('tick'); throw new Error('late') }, 10)" });
    assert.deepEqual(r.err, { name: 'Error', message: 'late' });
    assert.deepEqual(r.out, ['tick']);
    assert.equal(r.ok, false);
  });

  it('a rejected promise nobody handles is in err', async () => {
    const r = await projectRun({ 'main.ts': "new Promise<void>((_, reject) => reject(new Error('nope')))\nconsole.log('sync')" });
    assert.deepEqual(r.err, { name: 'Error', message: 'nope' });
    assert.deepEqual(r.out, ['sync']);
    assert.equal(r.ok, false);
  });

  it('a promise that resolves later prints before the Promise resolves', async () => {
    const r = await projectRun({ 'main.ts': "const p = new Promise<string>(res => setTimeout(() => res('done'), 20))\np.then(v => console.log(v))" });
    assert.deepEqual(r.out, ['done']);
    assert.equal(r.err, null);
  });

  it('process.exit(1) ends the run as not ok, without an error', async () => {
    const r = await projectRun({ 'main.ts': "declare const process: { exit(code: number): never }\nconsole.log('x')\nprocess.exit(1)" });
    assert.deepEqual([r.out, r.err, r.ok], [['x'], null, false]);
  });

  it('the live hooks see each line and error as they arrive', async () => {
    const seen = [];
    await projectRun({ 'main.ts': "console.log('a')\nsetTimeout(() => { throw new Error('b') }, 5)" }, {
      onOut: (level, args, text) => seen.push(['out', text]),
      onErr: e => seen.push(['err', e.message]),
    });
    assert.deepEqual(seen, [['out', 'a'], ['err', 'b']]);
  });
});

describe('projectRun: what ends a program that never stops', () => {
  // The hand lib has no setInterval, so the program declares it; the run still gets the scheduler's own.
  const endless = { 'main.ts': "declare function setInterval(fn: () => void, ms: number): number\nlet n = 0\nsetInterval(() => { n++ }, 1)\nconsole.log('started')" };

  it('an endless setInterval is stopped by the scheduler ceiling and resolves with an err', async () => {
    const r = await projectRun(endless);
    assert.deepEqual(r.out, ['started']);
    assert.match(r.err.message, /^Stopped: this program ran more than 5,000 callbacks/);
    assert.equal(r.ok, false);
  });

  it('stop() resolves a run that is still going, with no error of its own', async () => {
    const p = startRun(endless);
    p.stop();
    const r = JSON.parse(JSON.stringify(await p));
    assert.equal(r.err, null);
  });
});
