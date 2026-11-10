import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const { state } = RQ;
const CH = RQ.CH;

// Mirrors the `pristine` rule in shared/progress.js: a state with xp 0, nothing done and no notes is "no progress".
const pristine = (d) => !d || typeof d !== 'object' || (d.xp === 0 && (!d.done || Object.keys(d.done).length === 0) && (!d.notes || Object.values(d.notes).every((v) => !v)));
const L = (o) => state.load(typeof o === 'string' ? o : JSON.stringify(o), CH);

describe('saved state', () => {
  it('a fresh state is pristine', () => {
    const d = JSON.parse(state.serialize(state.fresh()));
    assert.equal(pristine(d), true);
    assert.equal(d.xp, 0);
    assert.deepEqual(d.done, {});
  });

  it('one done mission gives xp > 0', () => {
    const S = state.fresh();
    S.done['0.0'] = true;
    S.xp = state.xpFor(S.done);
    const d = JSON.parse(state.serialize(S));
    assert.equal(typeof d.xp, 'number');
    assert.ok(d.xp > 0);
    assert.equal(pristine(d), false);
  });

  it('a non-number, NaN or negative xp is replaced by xpFor of the valid done keys', () => {
    for (const xp of ['x', null, -5, NaN, undefined]) {
      const S = L({ done: { '0.0': true, '0.1': true, '9.9': true }, xp });
      assert.equal(S.xp, state.xpFor({ '0.0': true, '0.1': true }), String(xp));
    }
    assert.equal(state.load('{"done":{"0.0":true},"xp":1e999}', CH).xp, state.xpFor({ '0.0': true }));
  });

  it('a valid xp is kept as saved, even when every done key is invalid', () => {
    const S = L({ xp: 77, done: { '0-0': true, '0-1': true } });
    assert.equal(S.xp, 77);
    assert.deepEqual(JSON.parse(JSON.stringify(S.done)), {});
    assert.equal(L({ xp: 77, done: { '0.0': true } }).xp, 77);
    assert.equal(L({ xp: 0, done: { '0.0': true } }).xp, 0);
  });

  it('a codes entry over the cap is cut to the cap', () => {
    const S = L({ codes: { '0.0': 'a'.repeat(state.CAP + 500) } });
    assert.equal(S.codes['0.0'].length, state.CAP);
    assert.equal(state.CAP, 4000);
  });

  it('the export round trip keeps codes and the rest', () => {
    const S = state.fresh();
    S.done['0.1'] = true; S.xp = 10; S.best = 3; S.ch = 0; S.mi = 1; S.tab = 'guide';
    S.codes['0.0'] = 'fn main() {\n    println!("hi");\n}\n';
    S.codes['0.2'] = '';
    const back = L(state.serialize(S));
    assert.deepEqual(back, S);
  });

  it('wrong shapes load without throwing and give the fresh state', () => {
    for (const raw of ['{"done":5,"xp":"x"}', 'not json', 'null', '[]', '5', '"s"', '{"codes":7,"done":[1],"ch":"a","mi":-1,"tab":9,"best":-1}', '']) {
      const S = state.load(raw, CH);
      assert.deepEqual(S, state.fresh(), raw);
    }
    assert.deepEqual(state.load(null, CH), state.fresh());
  });

  it('unknown keys in done and codes are dropped, and non-string codes too', () => {
    const S = L({ done: { '0.0': true, '0.99': true, '99.0': true, 'x': true, '0.1': 'yes', '0.2': false }, codes: { '0.0': 'ok', '0.99': 'no', '99.1': 'no', '0.1': 5, '__proto__': 'no', 'a.b': 'no' }, extra: 1 });
    assert.deepEqual(Object.keys(S.done), ['0.0']);
    assert.deepEqual(Object.keys(S.codes), ['0.0']);
    assert.equal('extra' in S, false);
    assert.equal('extra' in JSON.parse(state.serialize(S)), false);
  });

  it('ch, mi and tab fall back one by one', () => {
    const S = L({ ch: 0, mi: 99, tab: 'nope', best: 12 });
    assert.equal(S.ch, 0);
    assert.equal(S.mi, 0);
    assert.equal(S.tab, 'quest');
    assert.equal(S.best, 12);
  });
});
