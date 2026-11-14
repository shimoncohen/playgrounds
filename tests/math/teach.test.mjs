// Math, "teach before use" (AGENTS.md rule 12): a term a learner reads on a card is explained at or before its first use.
// Position is a chapter intro (mission -1) or a mission's title, goal and how steps. A use is any learner-visible field, hint and explain included; only the title, goal and how steps teach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMath } from './harness.mjs';

const BASE = ['../math/vendor/mathjs/math.js', 'rng.js', 'graph.js', 'scene/palette.js', 'scene/model.js', 'scene/svg2d.js', 'input/mathjs-setup.js', 'input/check.js'];
const load = track => loadMath([...BASE, `${track}/content.js`]);
const taught = (m, ch) => (m < 0 ? ch.intro : [ch.missions[m].title, ch.missions[m].goal, ...(ch.missions[m].how || [])].join('\n'));
const seen = (m, ch) => (m < 0 ? ch.intro : [ch.missions[m].title, ch.missions[m].goal, ch.missions[m].hint, ch.missions[m].explain, ...(ch.missions[m].how || [])].join('\n'));

// [track, what it is, regex that uses it, chapter, mission (-1 is the intro) that first explains it, regex of the explanation there]
const FIRST = [
  ['geometry', 'perfect square', /perfect[ -]square/i, 2, 4, /whole number you get by squaring a whole number/],
  ['algebra', 'scale letters p q r s', /<code>[pqrs]<\/code>/, 2, -1, /<code>p<\/code> and <code>r<\/code> count boxes/],
  ['algebra', 'root', /(?<!square )\broots?\b/i, 4, -1, /also called a <b>root<\/b>/],
  ['trigonometry', 'multiplying both sides', /multipl(?:y|ying) both sides by/i, 0, 0, /cancels the <code>÷ hyp<\/code>/],
];

for (const [track, term, re, ci, mi, defined] of FIRST) {
  test(`${track}: "${term}" is explained at ${ci + 1}.${mi + 1}, before any card uses it`, () => {
    const { chapters } = load(track).content;
    chapters.forEach((ch, c) => {
      for (let m = -1; m < ch.missions.length; m++) {
        if (c > ci || (c === ci && m >= mi)) continue;
        assert.ok(!re.test(seen(m, ch)), `${ch.id} ${m < 0 ? 'intro' : m + 1} uses "${term}" before it is explained`);
      }
    });
    assert.match(taught(mi, chapters[ci]), defined);
  });
}

test('trigonometry: rearranging an equation is taught in place, since the chapter does not require linear equations', () => {
  const MQ = load('trigonometry');
  const needs = new Set();
  const walk = id => { for (const r of MQ.graph.chapter(id).requires) if (!needs.has(r)) { needs.add(r); walk(r); } };
  walk('trigonometry.ratios');
  if (needs.has('algebra.linear')) return;
  const first = MQ.content.chapters[0].missions[0];
  assert.match(first.how.join('\n'), /cancels the <code>÷ hyp<\/code>/);
});
