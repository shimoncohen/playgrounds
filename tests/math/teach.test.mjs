// Math, "teach before use" (AGENTS.md rule 12): a term is explained at its position and used on no card before it, in its own
// track or in any chapter the position requires. Scanned: intro, title, goal, how, hint, explain, question, tex and answer.
// Not scanned: quick-fire, the guide, live scene text and slider labels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMath } from './harness.mjs';

const BASE = ['../math/vendor/mathjs/math.js', 'rng.js', 'graph.js', 'scene/palette.js', 'scene/model.js', 'scene/svg2d.js', 'input/mathjs-setup.js', 'input/check.js'];
const cache = {};
const load = track => cache[track] ||= loadMath([...BASE, `${track}/content.js`]);
const str = x => (typeof x === 'string' ? x : '');
const seen = (m, ch) => (m < 0 ? ch.intro : [ch.missions[m].title, ch.missions[m].goal, ch.missions[m].hint, ch.missions[m].explain, ch.missions[m].question, ch.missions[m].tex, str(ch.missions[m].answer), ...(ch.missions[m].how || [])].join('\n'));
// only the title and goal teach: how steps, hint and explain show only after the learner asks or solves
const taught = (m, ch) => (m < 0 ? ch.intro : [ch.missions[m].title, ch.missions[m].goal].join('\n'));

// [track, what it is, regex that uses it, chapter, mission (-1 is the intro) that first explains it, regex of the explanation there]
const FIRST = [
  ['geometry', 'perfect square', /perfect[ -]square/i, 2, 4, /whole number you get by squaring a whole number/],
  ['algebra', 'scale letters p q r s', /<code>[pqrs]<\/code>/, 2, 0, /<code>q<\/code> 1-weights on the left, <code>r<\/code> boxes and <code>s<\/code> 1-weights on the right/],
  ['algebra', 'root', /(?<!square )\broots?\b(?! that is zero or more)/i, 4, -1, /also called a <b>root<\/b>/],
];

for (const [track, term, re, ci, mi, defined] of FIRST) {
  test(`${track}: "${term}" is explained at ${ci + 1}.${mi + 1}, before any card uses it`, () => {
    const { chapters } = load(track).content;
    const needs = new Set();
    const walk = id => { for (const r of load(track).graph.chapter(id).requires) if (!needs.has(r)) { needs.add(r); walk(r); } };
    walk(chapters[ci].id);
    for (const id of needs) {
      const other = load(load(track).graph.trackOf(id)).content.chapters.find(c => c.id === id);
      for (let m = -1; m < other.missions.length; m++) assert.ok(!re.test(seen(m, other)), `${id} ${m < 0 ? 'intro' : m + 1} uses "${term}" before it is explained`);
    }
    chapters.forEach((ch, c) => {
      for (let m = -1; m < ch.missions.length; m++) {
        if (c > ci || (c === ci && m >= mi)) continue;
        assert.ok(!re.test(seen(m, ch)), `${ch.id} ${m < 0 ? 'intro' : m + 1} uses "${term}" before it is explained`);
      }
    });
    assert.match(taught(mi, chapters[ci]), defined);
  });
}

test('trigonometry requires linear equations, which teach "do the same to both sides", before it rearranges ratios', () => {
  const needs = new Set();
  const walk = id => { for (const r of load('trigonometry').graph.chapter(id).requires) if (!needs.has(r)) { needs.add(r); walk(r); } };
  walk('trigonometry.ratios');
  assert.ok(needs.has('algebra.linear'));
  const linear = load('algebra').content.chapters.find(c => c.id === 'algebra.linear');
  assert.match(linear.intro, /same thing to both sides/);
  assert.match(load('trigonometry').content.chapters[0].missions[0].how[0], /Multiply both sides by/);
});
