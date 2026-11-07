// Python Quest, "teach before use" (AGENTS.md rule 12): a key word must not appear in any mission text before the mission that
// teaches it (or defines it in place), and Quick-fire only offers questions whose chapter the learner has finished.
// The course lives in python-quest/app.js, which also holds the DOM app, so load the DOM-free head of it (interpreter, CH, QF, GUIDE, qfOpen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../content-loader.mjs';

const { PY, CH, QF, GUIDE, qfOpen } = loadContent('python-quest', { parts: [[null, 'const ERRS={']], returns: ['PY', 'CH', 'QF', 'GUIDE', 'qfOpen'], mustInclude: ['const QF=[', 'const qfOpen='] });

// term -> [regex that uses it, chapter, mission that first teaches or defines it in place (its own card may use it)]; null = never taught, so never used
const FIRST = {
  '==':           [/==/, 3, 0],
  '<= >=':        [/&lt;=|&gt;=|(?<![-+*\/%!=])[<>]=/, 3, 0],
  truthiness:     [/counts as False/, 3, 1],
  '*= /=':        [/\*=|\/=/, 2, 0],
  'f-string':     [/f-string|\bf"/, 1, 5],
  'f-string sum': [/\{2 \+ 3\}/, 1, 5],
  '.pop':         [/\.pop\(/, 4, 3],
  mutable:        [/mutable/, 4, 5],
  aliasing:       [/does not copy|same list/, 4, 5],
  sum:            [/\bsum\(/, 5, 2],
  frame:          [/\bframe\b/, 6, 4],
  argument:       [/\bargument/, 6, 1],
  None:           [/\bNone\b/, 6, 2],
  'f-string key': [/\{\w+\[/, 7, 4],
  module:         [/\bmodule\b/, 8, 0],
  sorted:         [/\bsorted\(/, null],
  round:          [/\bround\(/, null],
  'max/min':      [/\b(max|min)\(/, null],
  global:         [/\bglobal\b/, null],
  'happy path':   [/happy path/, null],
  'if statement': [/\bstatement\b|\bkeyword\b/, null],
};

const noTags = t => t.replace(/<\/?[a-z][^>]*>/gi, '');
const texts = m => noTags([m.title, m.goal, m.explain, m.note, m.starter, m.answer, ...(m.anat || []).map(a => a[2] || '')].filter(Boolean).join('\n')) + '\n' + String(m.check).match(/'[^']*'/g)?.join('\n');
const flat = [];
CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => flat.push({ ci, mi, text: texts(m) + (mi === 0 ? '\n' + ch.intro : '') })));
const before = (ci, mi) => flat.filter(x => x.ci < ci || (x.ci === ci && x.mi < mi));
const qtext = q => q.c + '\n' + q.why + '\n' + q.w.join('\n');

for (const [term, [re, ci, mi]] of Object.entries(FIRST)) {
  if (ci === null) {
    test(`"${term}" is never used (the quest does not teach it)`, () => {
      for (const x of flat) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}"`);
      for (const q of QF) assert.ok(!re.test(qtext(q)), `quick-fire "${q.c.slice(0, 40)}" uses "${term}"`);
    });
    continue;
  }
  test(`"${term}" is not used before ${ci}.${mi}`, () => {
    for (const x of before(ci, mi)) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}" before it is taught at ${ci}.${mi}`);
    assert.ok(flat.some(x => x.ci === ci && x.mi === mi && re.test(x.text)), `${ci}.${mi} should be where "${term}" is introduced`);
  });
  test(`quick-fire never asks about "${term}" before chapter ${ci} is done`, () => {
    for (const q of QF) if (re.test(qtext(q))) assert.ok(q.ch >= ci, `quick-fire "${q.c.slice(0, 40)}" needs chapter ${ci}`);
  });
}

test('terms are defined in place the first time they appear', () => {
  const m = (c, i) => CH[c].missions[i];
  assert.match(m(3, 0).explain, /&lt;=<\/code> less than or equal/);
  assert.match(m(3, 1).explain, /0<\/code> or empty text/);
  assert.match(m(2, 0).explain, /<code>x \*= 2<\/code> means <code>x = x \* 2<\/code>/);
  assert.match(m(4, 5).explain, /same list/);
  assert.match(m(6, 2).explain, /None<\/code>, Python's word for "nothing here"/);
  assert.match(m(6, 1).explain, /called an <b>argument<\/b>/);
  assert.match(m(8, 0).explain, /module<\/b> is a bundle of extra tools/);
  assert.match(m(8, 4).explain, /use single quotes for the key/);
});

test('guide cards: the None row points at Functions, and the types card does not use None', () => {
  assert.doesNotMatch(GUIDE.find(g => g.c === 'types').what, /None/);
  assert.match(GUIDE.find(g => g.c === 'def').what, /None/);
});

test('quick-fire: every question has a chapter, a runnable program and a right answer that is not among the wrong ones', () => {
  for (const q of QF) {
    assert.ok(Number.isInteger(q.ch) && q.ch >= 0 && q.ch < CH.length, q.c);
    const r = PY.run(q.c, { trace: false });
    assert.ok(!r.error, `${q.c}: ${r.error && r.error.msg}`);
    const ans = r.out.replace(/\n$/, '');
    assert.ok(!q.w.includes(ans), `${q.c}: the right answer is also a wrong option`);
    assert.ok(q.w.filter(w => w !== ans).length >= 3, `${q.c}: needs 3 wrong options`);
  }
});

test('quick-fire: the example question (QF[1]) is open after Chapter 1 alone', () => {
  assert.equal(QF[1].ch, 0);
  assert.equal(PY.run(QF[1].c, { trace: false }).out.trim(), '34');
});

const doneThrough = n => { const d = {}; for (let c = 0; c < n; c++) CH[c].missions.forEach((_, i) => (d[c + '.' + i] = true)); return d; };

test('quick-fire gating: nothing is open on a fresh save', () => {
  assert.equal(qfOpen({}).length, 0);
  assert.equal(qfOpen(undefined).length, 0);
});

test('quick-fire gating: only entries whose chapter is done are offered', () => {
  for (let n = 0; n <= CH.length; n++) {
    const open = qfOpen(doneThrough(n));
    for (const q of open) assert.ok(q.ch < n, `chapter ${q.ch} is not done but offers "${q.c.slice(0, 40)}"`);
    assert.equal(open.length, QF.filter(q => q.ch < n).length);
  }
  assert.equal(qfOpen(doneThrough(CH.length)).length, QF.length);
});

test('quick-fire gating: one missing mission keeps the whole chapter locked, and a later chapter alone does not unlock an earlier one', () => {
  const d = doneThrough(1); delete d['0.2'];
  assert.equal(qfOpen(d).length, 0);
  const only3 = {}; CH[3].missions.forEach((_, i) => (only3['3.' + i] = true));
  assert.ok(qfOpen(only3).every(q => q.ch === 3));
});
