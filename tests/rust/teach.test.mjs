// A tag in any program of a mission passes if an earlier or this mission `defines` it, or if it is `previews`-ed here or
// earlier and the first mission to use it carries the preview (AGENTS.md rule 12).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const plain = (t) => String(t).replace(/<\/?[a-z][^>]*>/gi, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const flat = [];
RQ.CH.forEach((c, ci) => c.missions.forEach((m, mi) => flat.push({ ci, mi, m })));
const tagsOf = (m) => new Set(RQ.missionPrograms(m).flatMap((p) => [...RQ.features(p.src)]));

describe('feature tags follow the course order', () => {
  const defined = new Set(), previewed = new Set(), used = new Set();
  for (const { ci, mi, m } of flat) {
    it(`${ci}.${mi} ${m.title}`, () => {
      m.defines.forEach((t) => defined.add(t));
      m.previews.forEach((p) => previewed.add(p.tag));
      for (const tag of tagsOf(m)) {
        if (defined.has(tag)) { used.add(tag); continue; }
        assert.ok(previewed.has(tag), `tag "${tag}" is used before it is taught or previewed`);
        if (!used.has(tag)) assert.ok(m.previews.some((p) => p.tag === tag), `tag "${tag}" is first used here, so this mission must carry its preview`);
        used.add(tag);
      }
    });
  }
});

describe('previews', () => {
  for (const { ci, m } of flat) for (const p of m.previews) {
    it(`${p.tag} is explained in the card text${p.home ? ' and names its home chapter' : ''}`, () => {
      assert.ok(p.wording);
      assert.ok(m.how.some((h) => h.includes(p.wording)) || m.explain.includes(p.wording), 'the preview wording must appear on the mission card');
      if (p.home) {
        assert.match(plain(p.wording), new RegExp(`Chapter ${p.home}\\b`));
        assert.ok(p.home - 1 > ci, 'the home chapter must come later in the course');
        assert.ok(RQ.CH[p.home - 1]?.missions.some((h) => h.defines.includes(p.tag)), `chapter ${p.home} must define "${p.tag}"`);
      } else assert.match(plain(p.wording), /macro/);
    });
  }
});

describe('terms on a mission card are not used before the mission that teaches them', () => {
  const text = (m) => plain([m.title, m.goal, m.hint, m.explain, ...m.how].join('\n'));
  // term -> [regex, chapter, mission (0-based) that first teaches it]
  const FIRST = {
    hole: [/\bholes?\b/i, 0, 1],
    variable: [/\bvariables?\b/i, 0, 2],
    immutable: [/\bimmutable\b|\bunchangeable\b/i, 0, 3],
    E0384: [/E0384/, 0, 3],
    mut: [/\bmut\b/, 0, 3],
    shadowing: [/\bshadow/i, 0, 5],
    macro: [/\bmacro\b/i, 0, 0],
    tuple: [/\btuples?\b/i, 1, 3],
    array: [/\barrays?\b/i, 1, 4],
    arithmetic_overflow: [/arithmetic_overflow/, 1, 6],
    overflowing_literals: [/overflowing_literals/, 1, 6],
    unconditional_panic: [/unconditional_panic/, 1, 7],
    panic: [/\bpanics?\b/i, 1, 7],
    E0308: [/E0308/, 2, 1],
    E0425: [/E0425/, 2, 7],
    range: [/\branges?\b/i, 2, 6],
  };
  for (const [term, [re, ci, mi]] of Object.entries(FIRST)) {
    it(`"${term}" first appears in ${ci}.${mi}`, () => {
      for (const f of flat) {
        const used = re.test(text(f.m));
        if (f.ci < ci || (f.ci === ci && f.mi < mi)) assert.equal(used, false, `${f.ci}.${f.mi} uses "${term}" before ${ci}.${mi} teaches it`);
      }
      assert.equal(re.test(text(RQ.CH[ci].missions[mi])), true, `${ci}.${mi} should teach "${term}"`);
    });
  }
  it('chapter 1 does not lean on terms of later chapters', () => {
    const later = /\b(struct|enum|trait|closure|lifetime|borrow|borrowing|ownership|iterator|generic|Vec|String|HashMap|Option|Result)\b/;
    for (const f of flat.filter((x) => x.ci === 0)) assert.doesNotMatch(text(f.m), later, `${f.ci}.${f.mi}`);
    assert.doesNotMatch(plain(RQ.CH[0].intro + RQ.CH[0].toolbox), later);
  });
  it('quick-fire and the field guide only use chapter 1 terms for chapter 1', () => {
    const later = /\b(struct|enum|trait|closure|lifetime|borrow|ownership|iterator|generic|Vec|HashMap|Option|Result)\b/;
    for (const q of RQ.QF.filter((x) => x.ch === 0)) assert.doesNotMatch(plain([q.c, q.a, ...q.w, q.why].join(' ')), later);
    for (const g of RQ.GUIDE.filter((x) => x.ch === 0)) assert.doesNotMatch(plain(g.what), later);
  });
});
