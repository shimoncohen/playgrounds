import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMath } from './harness.mjs';

const BASE = ['../math-quest/vendor/mathjs/math.js', 'rng.js', 'graph.js', 'scene/palette.js', 'scene/model.js', 'input/mathjs-setup.js', 'input/check.js'];
const plain = x => JSON.parse(JSON.stringify(x));
const TRACKS = ['arithmetic', 'algebra'];

const stateOf = (MQ, def, params) => {
  const m = MQ.scene.model(def);
  for (const [k, v] of Object.entries(params)) m.set(k, v);
  return m.state();
};
const judge = (MQ, ch, m, v) => m.kind === 'scene' ? m.check(stateOf(MQ, ch.scene, v)) : m.check(v);

for (const track of TRACKS) {
  const MQ = loadMath([...BASE, `${track}/content.js`]);
  const C = MQ.content;

  test(`${track}: chapter ids match graph.js, in order`, () => {
    assert.equal(C.track, track);
    assert.deepEqual(plain(C.chapters.map(c => c.id)), plain(MQ.graph.chapters[track].map(c => c.id)));
  });

  test(`${track}: every chapter has a scene, a badge, an intro and missions`, () => {
    for (const ch of C.chapters) {
      assert.ok(ch.scene && ch.scene.params && ch.scene.draw, `${ch.id} has no scene`);
      assert.ok(ch.name && ch.badge && ch.intro, ch.id);
      assert.ok(ch.missions.length >= 5, ch.id);
    }
  });

  C.chapters.forEach((ch, ci) => ch.missions.forEach((m, mi) => {
    const id = `${track} ${ci}.${mi} ${m.title}`;
    test(`${id}: answer passes, wrong and lazy fail`, () => {
      for (const f of ['title', 'goal', 'explain', 'hint', 'kind']) assert.ok(m[f], `${id} has no ${f}`);
      assert.ok(['number', 'expr', 'scene'].includes(m.kind), id);
      assert.ok(Array.isArray(m.how) && m.how.length >= 3 && m.how.length <= 5, `${id}: how has 3 to 5 steps`);
      for (const f of ['answer', 'wrong', 'lazy']) assert.ok(m[f] !== undefined, `${id} has no ${f}`);
      assert.equal(judge(MQ, ch, m, m.answer).ok, true, `${id}: answer fails: ${judge(MQ, ch, m, m.answer).why}`);
      assert.equal(judge(MQ, ch, m, m.wrong).ok, false, `${id}: wrong passes`);
      const lazy = judge(MQ, ch, m, m.lazy);
      assert.equal(lazy.ok, false, `${id}: lazy passes`);
      assert.ok(lazy.why, `${id}: lazy fails without saying why`);
    });

    if (m.kind === 'scene') test(`${id}: scene answers are params in range`, () => {
      for (const v of [m.answer, m.wrong, m.lazy]) for (const [k, x] of Object.entries(v)) {
        const p = ch.scene.params[k];
        assert.ok(p, `${id}: unknown param ${k}`);
        assert.ok(x >= p.min && x <= p.max, `${id}: ${k} = ${x} is out of range`);
      }
    });
    else test(`${id}: the lazy answer is the question, and the step checker agrees with the answer`, () => {
      assert.equal(m.lazy, m.question, id);
      const opts = { kind: m.kind, vars: m.vars };
      assert.equal(MQ.check.steps(m.question, [m.answer], opts)[0].ok, true, `${id}: the step checker rejects the answer`);
      assert.equal(MQ.check.steps(m.question, [m.wrong], opts)[0].ok, false, `${id}: the step checker accepts the wrong answer`);
      if (m.work === 'required') {
        assert.ok(m.steps && m.steps.length > 1, `${id}: work is required, so the mission lists reference steps`);
        assert.deepEqual(plain(MQ.check.steps(m.question, m.steps, opts).map(r => r.ok)), plain(m.steps.map(() => true)));
        assert.equal(m.check(m.steps.at(-1)).ok, true);
      }
    });
  }));

  test(`${track}: quick-fire templates are repeatable for a seed and answer correctly`, () => {
    assert.ok(C.quickfire.length >= 1);
    for (const t of C.quickfire) {
      assert.ok(C.chapters[t.ch], 'quick-fire names a chapter');
      const five = () => { const r = MQ.rng(1); return Array.from({ length: 5 }, () => t.make(r)); };
      const a = plain(five());
      assert.deepEqual(a, plain(five()));
      assert.ok(new Set(a.map(q => q.q)).size > 1, 'the template varies');
      for (const q of a) {
        assert.ok(q.q && q.why, JSON.stringify(q));
        assert.equal(MQ.check.number(String(q.a), q.q).ok, true, `${q.q} = ${q.a}`);
      }
    }
  });

  test(`${track}: the field guide has entries for every chapter`, () => {
    C.chapters.forEach((ch, ci) => assert.ok(C.guide.filter(g => g.ch === ci).length >= 2, ch.id));
    for (const g of C.guide) assert.ok(g.title && g.what, JSON.stringify(g));
  });

  test(`${track}: ranks start at 0 XP and climb`, () => {
    assert.equal(C.ranks[0][0], 0);
    for (let i = 1; i < C.ranks.length; i++) assert.ok(C.ranks[i][0] > C.ranks[i - 1][0]);
  });
}
