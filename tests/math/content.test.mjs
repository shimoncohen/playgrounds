import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMath } from './harness.mjs';

const BASE = ['../math-quest/vendor/mathjs/math.js', 'rng.js', 'graph.js', 'scene/palette.js', 'scene/model.js', 'input/mathjs-setup.js', 'input/check.js'];
const plain = x => JSON.parse(JSON.stringify(x));
const TRACKS = ['arithmetic', 'algebra', 'geometry'];

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

const GEO = {
  'geometry.area': [
    { yes: ['84', ' 84 ', '84.0'], no: ['38', '19', '84 squares', '12+7'] },
    { yes: ['45', '45.0', ' 45'], no: ['90', '19', '10*9/2'] },
    { yes: ['68', '68.0'], no: ['80', '36', '56'] },
    { yes: ['6', '6.0', ' 6 '], no: ['45', '63', '486'] },
    { yes: [{ b: 4, h: 6 }, { b: 6, h: 4, p: 7 }, { b: 6, h: 4, p: 0 }], no: [{ b: 8, h: 3 }, { b: 5, h: 5 }, { b: 6, h: 5 }] },
  ],
  'geometry.angles': [
    { yes: ['133', '133°', ' 133 °', '133.0'], no: ['43', '227', '47°', '°133', '133°°'] },
    { yes: ['75', '75°'], no: ['285', '-105', '105°'] },
    { yes: ['51', '51°'], no: ['231', '129', '129°'] },
    { yes: ['38', '38°'], no: ['76', '104', '142°'] },
    { yes: [{ r1: 60, r2: 120 }, { r1: 120, r2: 60 }], no: [{ r1: 60, r2: 100 }, { r1: 90, r2: 90 }, { r1: 60, r2: 60 }] },
  ],
};
{
  const MQ = loadMath([...BASE, 'geometry/content.js']);
  for (const ch of MQ.content.chapters) GEO[ch.id].forEach((alt, mi) => {
    const m = ch.missions[mi];
    test(`geometry ${ch.id} ${mi} ${m.title}: other right answers pass and slips fail`, () => {
      for (const v of alt.yes) assert.equal(judge(MQ, ch, m, v).ok, true, `${JSON.stringify(v)} should pass: ${judge(MQ, ch, m, v).why}`);
      for (const v of alt.no) {
        const r = judge(MQ, ch, m, v);
        assert.equal(r.ok, false, `${JSON.stringify(v)} should fail`);
        assert.ok(r.why, `${JSON.stringify(v)} fails without saying why`);
      }
    });
  });
}
