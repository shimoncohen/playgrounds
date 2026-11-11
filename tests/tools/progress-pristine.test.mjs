import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pristine, pristineFor } from '../pristine.mjs';

const base = { ch: 0, mi: 0, done: {}, xp: 0, best: 0 };

describe('shared/progress.js pristine', () => {
  it('untouched default saves are pristine', () => {
    for (const extra of [
      { codes: {} },
      { codes: {}, sandbox: null, inSandbox: false },
      { code: {}, free: null },
      { notes: {}, work: {} },
      { answers: {} },
    ]) assert.equal(pristine({ ...base, ...extra }), true, JSON.stringify(extra));
  });

  it('typed text at xp 0 is progress, per field', () => {
    for (const extra of [
      { codes: { '0.0': 'fn main() {}' } },
      { sandbox: 'int main(){}' },
      { code: { '0.0': 'print(1)' } },
      { code: { free: 'x = 1' }, free: { code: 'x = 1' } },
      { notes: { 0: 'hello' } },
      { answers: { '0.0': 'tcp' } },
    ]) assert.equal(pristine({ ...base, ...extra }), false, JSON.stringify(extra));
  });

  it('empty strings do not count as typed text', () => {
    assert.equal(pristine({ ...base, codes: { '0.0': '' }, sandbox: '' }), true);
  });

  it('done missions or xp still count', () => {
    assert.equal(pristine({ ...base, xp: 10, done: { '0.0': true } }), false);
  });
});

const pageRule = dir => pristineFor(new Function('window', readFileSync(new URL(`../../${dir}/index.html`, import.meta.url), 'utf8').match(/<script>(window\.PROGRESS=.*?)<\/script>/)[1] + ';return window.PROGRESS')({}));

describe('per-playground rule from each page config', () => {
  const scriptFiles = { 'hello.js': 'console.log("Welcome backstage!")\n', 'notes.txt': 'Sweep the ring\nFeed Mumbles\nHang the posters\n' };
  const cases = [
    ['programming/script-quest', { chap: 0, cur: { 0: 2 }, files: scriptFiles, pkgs: [] }, [{ files: { ...scriptFiles, 'a.js': '' } }, { files: { ...scriptFiles, 'hello.js': 'x' } }, { files: { 'notes.txt': scriptFiles['notes.txt'] } }, { pkgs: ['cowsay'] }]],
    ['programming/harbor-quest', { v: 1, hist: [], files: { 'README.md': '# The harbor shop' }, puz: {}, flag: {}, inside: null }, [{ hist: ['docker ps'] }]],
    ['programming/shell-quest', { fs: {}, cwd: '/home', vars: {}, hist: [], seen: false }, [{ hist: ['ls'] }]],
    ['programming/python-quest', { code: {}, tray: {}, free: null }, [{ tray: { '0.0': '5' } }, { free: { code: 'x' } }]],
    ['programming/ds-quest', { code: {}, free: null }, [{ code: { '0.0': 'x' } }]],
    ['programming/cpp-quest', { codes: {}, sandbox: null, inSandbox: false }, [{ sandbox: 'int x;' }]],
    ['programming/net-quest', { answers: {} }, [{ answers: { '0.0': 'tcp' } }]],
    ['programming/rust-quest', { codes: {} }, [{ codes: { '0.0': 'fn' } }]],
    ['programming/agent-quest', { badges: {} }, []],
    ['math/algebra', { notes: {}, work: {} }, [{ notes: { 0: 'hi' } }, { work: { '0.0': ['x = 2'] } }]],
  ];
  const base = { xp: 0, done: {} };
  for (const [dir, fresh, worked] of cases) {
    it(`${dir}: untouched is pristine, learner work is not`, () => {
      const rule = pageRule(dir);
      assert.equal(rule({ ...base, ...fresh }), true);
      for (const w of worked) assert.equal(rule({ ...base, ...fresh, ...w }), false, JSON.stringify(w));
    });
  }

  it('math work with only empty steps is pristine', () => {
    assert.equal(pageRule('math/algebra')({ ...base, work: { '0.0': [] } }), true);
  });
});
