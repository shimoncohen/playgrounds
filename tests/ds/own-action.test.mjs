// Data Structures Quest: a learner's pass must come from their own action on this mission.
import { it, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'programming', 'ds-quest');
const sandbox = {};
vm.createContext(sandbox);
for (const f of ['engine.js', 'scenes.js', 'content.js', 'visual.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
const D = sandbox.DSQ, V = D.visual, CH = D.CH;
const same = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, m);
const push = v => ({ op: 'push', arg: { value: v } });

const all = CH.flatMap((c, ci) => c.missions.map((m, mi) => ({ id: `${ci}.${mi}`, ci, mi, m }))).filter(x => x.m.visual);

// Reference input per kind: an operate mission's `ref` through V.apply, a predict mission's correct answers through V.answer.
const reference = vis => sess => {
  const out = [];
  if (vis.kind === 'operate') { for (const e of vis.ref) out.push(V.apply(sess, e)); return out; }
  for (const p of vis.pauses) {
    out.push(V.answer(sess, V.answerOf(vis, p.step)));
  }
  return out;
};
// Predict missions only open a pause once the walk reaches it.
const walkAll = (vis, sess) => {
  for (let guard = 0; guard < 99 && !V.passed(sess); guard++) {
    const r = V.advance(sess);
    if (r.ask) V.answer(sess, V.answerOf(vis, r.ask.step));
    else if (r.ok === false) break;
  }
};
const passes = (vis, id, sess) => { const S = { seen: {}, done: {} }; return V.pass1(S, id, sess) && S.seen[id] === true; };
const winOwn = (vis, id) => {
  const sess = V.start(vis, id);
  if (vis.kind === 'operate') reference(vis)(sess); else walkAll(vis, sess);
  return sess;
};

describe('step 1: own action', () => {
  it('walks both pilots', () => {
    assert.ok(all.some(x => x.id === '0.3') && all.some(x => x.id === '1.0'));
  });

  it('every mission passes on its own reference input', () => {
    for (const { id, m } of all) assert.ok(passes(m.visual, id, winOwn(m.visual, id)), id);
  });

  for (const a of all) for (const b of all) {
    if (a.id === b.id) continue;
    it(`${a.id}'s reference input does not pass ${b.id}`, () => {
      const sess = V.start(b.m.visual, b.id);
      const res = reference(a.m.visual)(sess);
      if (a.m.visual.kind !== b.m.visual.kind) {
        assert.ok(res.every(r => r.ok === false && typeof r.reason === 'string' && r.reason.length >= 10), 'wrong-kind input is refused with a reason');
      }
      assert.equal(passes(b.m.visual, b.id, sess), false);
    });
  }

  it('two missions of the same kind: one set of moves does not pass the other', () => {
    const base = { kind: 'operate', scene: 'pile', start: [], task: 'x', buttons: [{ label: 'push red', ...push('red') }, { label: 'push blue', ...push('blue') }], ref: [], wrong: [push('blue')], lazy: [push('red')] };
    const A = { ...base, goal: { snapshot: ['red'] }, ref: [push('red')] };
    const B = { ...base, goal: { snapshot: ['blue'] }, ref: [push('blue')] };
    same(V.validate(A), []);
    same(V.validate(B), []);
    const onB = V.start(B, 'b');
    reference(A)(onB);
    assert.equal(passes(B, 'b', onB), false);
    const onA = V.start(A, 'a');
    reference(A)(onA);
    assert.equal(passes(A, 'a', onA), true);
  });

  it('pass1 with an id that differs from the session id leaves seen unchanged', () => {
    for (const { id, m } of all) {
      const S = { seen: {}, done: {} };
      assert.equal(V.pass1(S, 'other', winOwn(m.visual, id)), false, id);
      same(S.seen, {}, id);
    }
  });

  it("pass1 with another id's passed session leaves seen unchanged", () => {
    for (const a of all) for (const b of all) {
      if (a.id === b.id) continue;
      const S = { seen: {}, done: {} };
      assert.equal(V.pass1(S, b.id, winOwn(a.m.visual, a.id)), false);
      same(S.seen, {});
    }
  });

  it('a session that has not passed does not set seen', () => {
    for (const { id, m } of all) {
      const S = { seen: {}, done: {} };
      assert.equal(V.pass1(S, id, V.start(m.visual, id)), false, id);
      same(S.seen, {}, id);
    }
  });

  it('seen or done of one id never opens another id\'s step 2', () => {
    for (const a of all) for (const b of all) {
      if (a.id === b.id) continue;
      assert.equal(V.stepOf({ seen: { [a.id]: true }, done: { [a.id]: true } }, b.m, b.id), 1, `${a.id} -> ${b.id}`);
    }
  });

  it('done needs both steps: step 2 alone is locked, and step 1 alone earns nothing', () => {
    for (const { id, ci, mi, m } of all) {
      const S = { seen: {}, done: {}, xp: 0, badges: {} };
      same(V.complete(S, ci, mi), { ok: false, locked: true }, id);
      assert.equal(S.xp, 0);
      assert.equal(V.pass1(S, id, winOwn(m.visual, id)), true);
      assert.equal(S.xp, 0, 'step 1 earns no XP');
      same(S.done, {});
      assert.equal(V.complete(S, ci, mi).ok, true, id);
      assert.equal(S.xp, 10);
    }
  });
});
