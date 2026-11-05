// Agent Quest saved state. Every test passes its own small chapters list, so none depends on the live AQ.CH
// (the last describe covers the default list).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent, J } from './harness.mjs';

const AQ = loadAgent();
const { state } = AQ;
const WHITELIST = ['badges', 'best', 'ch', 'done', 'mi', 'tab', 'xp'];
const chapters = [
  { name: 'A', badge: 'a', tier: 'core', missions: [{}, {}, {}] },
  { name: 'B', badge: 'b', tier: 'core', missions: [{}, {}] },
];
const load = (raw) => state.load(raw, chapters);
// Copied from shared/progress.js:44: the predicate that decides whether a saved state counts as progress.
const pristine = (d) => !d || typeof d !== 'object' || (d.xp === 0 && (!d.done || Object.keys(d.done).length === 0));

describe('saved state', () => {
  it('a fresh serialized state is pristine for shared/progress.js', () => {
    assert.ok(pristine(JSON.parse(state.serialize(state.fresh()))));
  });
  it('one done mission gives a numeric xp above 0', () => {
    const S = load(JSON.stringify({ done: { '0.0': true } }));
    const xp = JSON.parse(state.serialize(S)).xp;
    assert.equal(typeof xp, 'number');
    assert.ok(xp > 0);
  });
  it('a tampered xp is replaced by the derived value', () => {
    const S = load(JSON.stringify({ xp: 999, done: { '0.0': true, '1.1': true } }));
    assert.equal(S.xp, state.xpFor({ '0.0': true, '1.1': true }, {}, chapters));
    assert.equal(JSON.parse(state.serialize(S)).xp, S.xp);
    assert.notEqual(S.xp, 999);
  });
  it('the saved keys are exactly the whitelist, so answers or any other key fails', () => {
    const S = load(JSON.stringify({ done: { '0.0': true }, answers: { '0.0': 'secret' }, extra: 1 }));
    S.answers = { '0.0': 'typed text' };
    assert.deepEqual(Object.keys(JSON.parse(state.serialize(S))).sort(), WHITELIST);
    assert.deepEqual(Object.keys(JSON.parse(state.serialize(state.fresh()))).sort(), WHITELIST);
  });
  it('wrong shapes load without throwing and give a fresh state', () => {
    for (const raw of ['{"done":5,"xp":"x"}', 'not json', null, '[]', '7', '"s"', '{"badges":[1],"done":"x"}', undefined]) {
      assert.deepEqual(J(load(raw)), J(state.fresh()), String(raw));
    }
  });
  it('a tab outside quest, fire and guide falls back to quest', () => {
    assert.equal(load(JSON.stringify({ tab: 'terminal' })).tab, 'quest');
    assert.equal(load(JSON.stringify({ tab: 'guide' })).tab, 'guide');
  });
  it('unknown mission keys and badges are dropped', () => {
    const S = load(JSON.stringify({ done: { '0.0': true, '0-1': true, '5.0': true, '1.9': true, '0.1': 'yes', 'x.y': true }, badges: { 0: true, 9: true, a: true } }));
    assert.deepEqual(Object.keys(S.done), ['0.0']);
    assert.deepEqual(Object.keys(S.badges), ['0']);
  });
  it('a badge adds the badge xp and ch, mi and best are range checked', () => {
    const S = load(JSON.stringify({ badges: { 1: true }, ch: 7, mi: 2, best: -4 }));
    assert.equal(S.xp, AQ.tiers.chapterBadgeXp);
    assert.deepEqual([S.ch, S.mi, S.best], [0, 0, 0]);
    const T = load(JSON.stringify({ ch: 1, mi: 2, best: 40.9 }));
    assert.deepEqual([T.ch, T.mi, T.best], [1, 2, 40]);
  });
  it('serialized done keys are sorted by chapter then mission', () => {
    const S = load(JSON.stringify({ done: { '1.1': true, '0.2': true, '0.0': true } }));
    assert.deepEqual(Object.keys(JSON.parse(state.serialize(S)).done), ['0.0', '0.2', '1.1']);
  });
  it('load then serialize is stable, so the boot write happens only once', () => {
    const once = state.serialize(load(JSON.stringify({ xp: 999, done: { '0.1': true } })));
    assert.equal(state.serialize(load(once)), once);
  });
});

describe('ranks', () => {
  it('thresholds start at 0 and strictly ascend', () => {
    const r = AQ.RANKS.map((x) => x[0]);
    assert.equal(r[0], 0);
    r.forEach((x, i) => i && assert.ok(x > r[i - 1], `${x} after ${r[i - 1]}`));
  });
  it('the ladder is the one the tier model returns', () => assert.deepEqual(J(AQ.RANKS), J(AQ.tiers.ranks())));
});

describe('the default chapters list', () => {
  it('load and xpFor agree on the live AQ.CH', () => {
    const done = { '0.0': true, '0.1': true, '9.9': true };
    assert.ok(AQ.CH.length >= 1);
    const S = state.load(JSON.stringify({ done, xp: 5 }));
    assert.equal(S.xp, state.xpFor(done, {}));
    assert.equal(S.xp, 2 * AQ.tierXp(AQ.CH[0].tier));
  });
});
