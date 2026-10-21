// Data Structures Quest, "teach before use" (AGENTS.md rule 12): a key word must not appear in any mission text before the mission that
// teaches it, and Quick-fire only offers questions whose chapter the learner has finished.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ds-quest');
const sandbox = {};
vm.createContext(sandbox);
for (const f of ['engine.js', 'content.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
const D = sandbox.DSQ;

// term -> [regex that uses it, chapter, mission that first teaches or defines it in place (its own card may use it)]
const FIRST = {
  index:       [/\bindex\b/i, 0, 1],
  undefined:   [/\bundefined\b/, 0, 1],
  function:    [/\bfunction\b/i, 0, 3],
  if:          [/\bif \(/, 0, 4],
  object:      [/\bobject\b/i, 1, 3],
  'class/this':[/\bclass\b|<code>this|\bthis\.|\bconstructor\b/, 1, 2],
  shift:       [/\bshift\b/, 2, 0],
  while:       [/\bwhile\b/, 2, 2],
  spread:      [/\[\.\.\./, 2, 2],
  null:        [/\bnull\b/, 3, 0],
  pointer:     [/\bpointer\b/i, 3, 0],
  Map:         [/\bMap\b/, 4, 0],
  Set:         [/\bSet\b/, 4, 0],
  hashing:     [/\bhashing\b/i, 4, 0],
  split:       [/\bsplit\b|toLowerCase/, 4, 2],
  recursion:   [/\brecurs/i, 5, 1],
  'Math.max':  [/Math\.max/, 5, 1],
  subtree:     [/\bsubtree\b/i, 5, 3],
};

const texts = m => [m.goal, m.explain, m.note, m.starter, m.answer].filter(Boolean).join('\n');
const flat = [];
D.CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => flat.push({ ci, mi, text: texts(m) + (mi === 0 ? '\n' + ch.intro : '') })));
const before = (ci, mi) => flat.filter(x => x.ci < ci || (x.ci === ci && x.mi < mi));

for (const [term, [re, ci, mi]] of Object.entries(FIRST)) {
  test(`"${term}" is not used before ${ci}.${mi}`, () => {
    for (const x of before(ci, mi)) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}" before it is taught at ${ci}.${mi}`);
    assert.ok(flat.some(x => x.ci === ci && x.mi === mi && re.test(x.text)), `${ci}.${mi} should be where "${term}" is introduced`);
  });
  test(`quick-fire never asks about "${term}" before chapter ${ci} is done`, () => {
    for (const q of D.QF) if (re.test(q.c + '\n' + q.why)) assert.ok(q.ch >= ci, `QF "${q.c.slice(0, 40)}" needs chapter ${ci}`);
  });
}

test('terms are defined in place the first time they appear', () => {
  const m = (c, i) => D.CH[c].missions[i];
  assert.match(m(0, 3).explain, /function is a named recipe/);
  assert.match(m(0, 0).explain, /variable is a name for a value/);
  assert.match(m(5, 1).explain, /recursion: a function that calls itself/);
  assert.match(m(2, 2).explain, /repeats its block as long as its test is true/);
  assert.match(m(3, 0).goal, /null<\/code> means/);
  assert.match(m(1, 2).explain, /<code>this<\/code> means/);
});

test('quick-fire gating: every question has a chapter and the example question is open after chapter 1', () => {
  for (const q of D.QF) assert.ok(Number.isInteger(q.ch) && q.ch >= 0 && q.ch < D.CH.length, q.c);
  assert.equal(D.QF[1].ch, 0);
});

const doneThrough = n => { const d = {}; for (let c = 0; c < n; c++) D.CH[c].missions.forEach((_, i) => (d[c + '.' + i] = true)); return d; };

test('quick-fire gating: nothing is open on a fresh save', () => {
  assert.equal(D.qfOpen({}).length, 0);
  assert.equal(D.qfOpen(undefined).length, 0);
});

test('quick-fire gating: only entries whose chapter is done are offered', () => {
  for (let n = 0; n <= D.CH.length; n++) {
    const done = doneThrough(n), open = D.qfOpen(done);
    for (const q of open) assert.ok(q.ch < n, `chapter ${q.ch} is not done but offers "${q.c.slice(0, 40)}"`);
    assert.equal(open.length, D.QF.filter(q => q.ch < n).length);
  }
  assert.equal(D.qfOpen(doneThrough(D.CH.length)).length, D.QF.length);
});

test('quick-fire gating: one missing mission keeps the whole chapter locked, and a later chapter alone does not unlock an earlier one', () => {
  const d = doneThrough(1); delete d['0.2'];
  assert.equal(D.qfOpen(d).length, 0);
  const only3 = {}; D.CH[3].missions.forEach((_, i) => (only3['3.' + i] = true));
  assert.ok(D.qfOpen(only3).every(q => q.ch === 3));
});
