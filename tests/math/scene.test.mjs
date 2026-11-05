import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMath } from './harness.mjs';
import { contrast, deltaE2000, minPairDE, MODES } from './colorlib.mjs';

const MQ = loadMath(['scene/palette.js', 'scene/model.js', 'scene/svg2d.js']);
const plain = x => JSON.parse(JSON.stringify(x));
const box = () => MQ.scene.model({
  params: {
    a: { min: 1, max: 6, step: 1, value: 2, label: 'length' },
    b: { min: 1, max: 6, step: 1, value: 3, label: 'width' },
    c: { min: 1, max: 6, step: 1, value: 4, label: 'height' },
  },
  derived: p => ({ V: p.a * p.b * p.c }),
  live: 'V = {a}·{b}·{c} = {V}',
});

test('set clamps to the range and snaps to the step', () => {
  const m = box();
  m.set('a', 99);
  assert.equal(m.state().params.a, 6);
  m.set('a', 2.4);
  assert.equal(m.state().params.a, 2);
  m.set('a', -5);
  assert.equal(m.state().params.a, 1);
  m.set('a', NaN);
  m.set('nope', 3);
  assert.equal(m.state().params.a, 1);
});

test('derived, live and describe follow the params', () => {
  const m = box();
  assert.equal(m.live(), 'V = 2·3·4 = 24');
  m.set('a', 5);
  assert.equal(m.state().derived.V, 60);
  assert.equal(m.live(), 'V = 5·3·4 = 60');
  const d = m.describe();
  for (const s of ['length 5', 'width 3', 'height 4', 'V = 60']) assert.ok(d.includes(s), d);
});

test('colorOf follows the order of params', () => {
  const m = box();
  assert.equal(m.colorOf('b'), MQ.palette[1]);
  assert.equal(m.colorOf('c'), MQ.palette[2]);
});

test('extra terms take the colors after the params', () => {
  const m = MQ.scene.model({ params: { a: { min: 0, max: 1, value: 0, label: 'a' } }, terms: ['add', 'mul'], live: '' });
  assert.equal(m.colorOf('add'), MQ.palette[1]);
  assert.equal(m.colorOf('mul'), MQ.palette[2]);
});

test('live can be a function of the state, so it can follow t', () => {
  const m = MQ.scene.model({
    params: { a: { min: 0, max: 9, value: 2, label: 'a' } }, t: { min: 0, max: 3, step: 1, value: 0 },
    derived: p => ({ d: p.a * 2 }), live: s => `${s.params.a} ${s.derived.d} ${s.t}`,
  });
  m.set('t', 2);
  assert.equal(m.live(), '2 4 2');
});

test('t is 0 without a t param, and snaps when there is one', () => {
  assert.equal(box().state().t, 0);
  const m = MQ.scene.model({ params: {}, t: { min: 0, max: 1, step: 0.25, value: 0 }, live: '{t}' });
  m.set('t', 0.6);
  assert.equal(m.state().t, 0.5);
});

test('sample splits 1/x into two segments and drops non-finite points', () => {
  for (const n of [100, 101]) {
    const segs = plain(MQ.svg2d.sample(x => 1 / x, -1, 1, n));
    assert.equal(segs.length, 2, `n=${n}`);
    assert.ok(segs[0].every(q => q[0] < 0) && segs[1].every(q => q[0] > 0));
  }
  const sqrt = plain(MQ.svg2d.sample(Math.sqrt, -1, 1, 100));
  assert.equal(sqrt.length, 1);
  assert.ok(sqrt[0].every(q => Number.isFinite(q[1])));
  assert.equal(MQ.svg2d.sample(x => x, -1, 1, 100).length, 1);
});

test('palette: 3:1 on both themes, and every pair is 12 apart in CIEDE2000 under each vision mode', () => {
  const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'math-quest', 'style.css'), 'utf8');
  const block = re => css.match(re)[1];
  const bgs = [block(/:root\{([^}]*)\}/), block(/:root\[data-theme="dark"\]\{([^}]*)\}/)]
    .flatMap(b => ['--bg', '--surface', '--surface-2'].map(v => b.match(new RegExp(v + ':(#[0-9A-Fa-f]{6})'))[1]));
  assert.equal(bgs.length, 6);
  assert.equal(MQ.palette.length, 6);
  assert.equal(new Set(MQ.palette).size, 6);
  for (const c of MQ.palette) for (const bg of bgs) assert.ok(contrast(c, bg) >= 3, `${c} on ${bg} is ${contrast(c, bg).toFixed(2)}`);
  for (const m of MODES) assert.ok(minPairDE(MQ.palette, m) >= 12, `${m}: min pair dE ${minPairDE(MQ.palette, m).toFixed(2)}`);
});

test('deltaE2000 matches the Sharma reference pair', () => {
  assert.ok(Math.abs(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]) - 2.0425) < 1e-3);
});

test('forMission: a mission picks its own scene and start values; fill starts a scene mission on its answer', () => {
  const P = { a: { min: 0, max: 9, value: 1, label: 'a' }, b: { min: 0, max: 9, value: 2, label: 'b' } };
  const ch = { scene: { id: 'ch', params: P } }, own = { id: 'own', params: { c: { min: 0, max: 9, value: 5, label: 'c' } } };
  const vals = d => Object.fromEntries(Object.entries(d.params).map(([k, p]) => [k, p.value]));
  assert.deepEqual(vals(MQ.scene.forMission(ch, { kind: 'number' })), { a: 1, b: 2 });
  assert.deepEqual(vals(MQ.scene.forMission(ch, { kind: 'number', at: { b: 7 } })), { a: 1, b: 7 });
  const m = { kind: 'scene', at: { a: 3 }, answer: { b: 8 } };
  assert.deepEqual(vals(MQ.scene.forMission(ch, m)), { a: 3, b: 2 });
  assert.deepEqual(vals(MQ.scene.forMission(ch, m, true)), { a: 3, b: 8 });
  assert.equal(MQ.scene.forMission(ch, { kind: 'number', scene: own }).id, 'own');
  assert.equal(P.b.value, 2, 'the chapter scene is not changed');
});

test('forMission hides worked-out values until a typed mission is solved, then reveals', () => {
  const P = { a: { min: 0, max: 9, value: 1, label: 'a' } };
  const ch = { scene: { id: 'ch', params: P, derived: p => ({ twice: p.a * 2 }), live: '' } };
  const own = { id: 'own', params: P, derived: p => ({ twice: p.a * 2 }), live: '' };
  const m = { kind: 'number', scene: own, at: { a: 4 }, reveal: true };
  const desc = d => MQ.scene.model(d).describe();
  assert.doesNotMatch(desc(MQ.scene.forMission(ch, m)), /twice = 8/);
  const after = MQ.scene.forMission(ch, m, false, true);
  assert.equal(after.id, 'ch');
  assert.match(desc(after), /twice = 8/);
  assert.equal(MQ.scene.forMission(ch, { ...m, reveal: own }, false, true).id, 'own');
  assert.equal(MQ.scene.forMission(ch, { ...m, reveal: undefined }, false, true).id, 'own', 'without reveal the own scene stays');
  assert.match(desc(MQ.scene.forMission(ch, { kind: 'scene' })), /twice = 2/, 'a scene mission keeps its values');
  const moved = { ...m, revealAt: { a: 6 } };
  assert.equal(MQ.scene.forMission(ch, moved).params.a.value, 4, 'revealAt waits for the solve');
  assert.equal(MQ.scene.forMission(ch, moved, false, true).params.a.value, 6, 'once solved, the reveal opens on revealAt');
});
