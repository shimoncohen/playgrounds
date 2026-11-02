// Agent Quest, "teach before use" (AGENTS.md rule 12): a key term must not appear on any mission card before the mission that
// teaches it (or defines it in place), and quick-fire and the field guide only use a term once their chapter taught it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent } from './harness.mjs';

const AQ = loadAgent();
const plain = (t) => String(t).replace(/<\/?[a-z][^>]*>/gi, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
// everything a learner reads on a mission card (the answer key is not teaching text)
const cardText = (m) => plain([m.title, m.goal, m.hint, m.explain, ...(m.how || [])].join('\n'));
const flat = [];
AQ.CH.forEach((c, ci) => c.missions.forEach((m, mi) => flat.push({ ci, mi, text: cardText(m) })));
const before = (ci, mi) => flat.filter((x) => x.ci < ci || (x.ci === ci && x.mi < mi));

// term -> [regex that uses it, chapter, mission (0-based) that first teaches it or defines it in place (its own card may use it)]
const FIRST = {
  'Done when': [/Done when/, 0, 0],
  'npm test': [/npm test/, 0, 0],
  unverified: [/unverified/i, 0, 0],
  'tool call': [/tool call/i, 0, 1],
  verb: [/\bverbs?\b/i, 0, 1],
  target: [/\btargets?\b/i, 0, 1],
  Constraints: [/Constraints/, 0, 1],
  'Run panel': [/Run panel/, 0, 1],
  Files: [/\bFiles\b/, 0, 2],
  token: [/\btokens?\b/i, 0, 2],
  context: [/\bcontext\b/i, 0, 2],
  meter: [/\bmeter\b/i, 0, 2],
  'CLAUDE.md': [/CLAUDE\.md/, 0, 3],
  'memory file': [/memory file/i, 0, 3],
};
const extras = () => [
  ...AQ.QF.map((q) => ({ ch: q.ch, where: 'quick-fire', text: plain([q.c, q.a, ...q.w, q.why].join('\n')) })),
  ...AQ.GUIDE.map((g) => ({ ch: g.ch, where: 'the field guide', text: plain([g.c, g.what, ...g.ex.flat()].join('\n')) })),
];

for (const [term, [re, ci, mi]] of Object.entries(FIRST)) {
  describe(`"${term}"`, () => {
    it(`is not used before ${ci}.${mi}, where it is introduced`, () => {
      for (const x of before(ci, mi)) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}" before it is taught at ${ci}.${mi}`);
      assert.ok(flat.some((x) => x.ci === ci && x.mi === mi && re.test(x.text)), `${ci}.${mi} should be where "${term}" is introduced`);
    });
    it('is not used in quick-fire or the field guide before its chapter', () => {
      for (const x of extras()) if (x.ch < ci) assert.ok(!re.test(x.text), `${x.where} for chapter ${x.ch + 1} uses "${term}" before chapter ${ci + 1}`);
    });
  });
}

describe('verbs no chapter 1 mission uses are not taught yet', () => {
  it('call and send appear as code nowhere in chapter 1 text', () => {
    const raw = [...AQ.CH[0].missions.flatMap((m) => [m.goal, m.explain, m.hint, ...m.how]), ...AQ.QF.flatMap((q) => [q.c, q.a, ...q.w, q.why]), ...AQ.GUIDE.flatMap((g) => [g.what, ...g.ex.flat()])].join('\n');
    assert.doesNotMatch(raw, /<code>(?:call|send)<\/code>/);
  });
});

describe('a mission card does not lean on a later mission', () => {
  it('the chapter intro uses none of the terms', () => {
    for (const [term, [re]] of Object.entries(FIRST)) assert.ok(!re.test(plain(AQ.CH[0].intro)), `the chapter intro uses "${term}" before any mission teaches it`);
  });
});
