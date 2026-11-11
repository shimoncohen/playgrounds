import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pristine } from '../pristine.mjs';

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
