// C++ Quest, "teach before use" (AGENTS.md rule 12): a key term must not appear in any mission text before the mission that
// teaches it (or defines it in place), and Quick-fire only offers questions whose chapter the learner has finished.
// The course lives in cpp-quest/app.js next to the DOM app, so load the DOM-free head of it (interpreter, CH, QT, qfOpen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../content-loader.mjs';

const { CPP, CH, QT, P, qfOpen } = loadContent('cpp-quest', { parts: [[null, '(()=>{\nconst KEY=']], returns: ['CPP', 'CH', 'QT', 'P', 'qfOpen'], mustInclude: ['const QT=[', 'const qfOpen=', 'const CH=['] });

// term -> [regex that uses it, chapter, mission (0-based) that first teaches or defines it in place (its own card may use it)]; null = never taught, so never used
const FIRST = {
  'comment //':         [/(^|\s)\/\//m, 0, 3],
  'comment gloss':      [/are comments:/, 0, 3],
  'prefix/postfix':     [/(?!g\+\+)\b[a-z]+\+\+|\+\+[a-z]/, 1, 6],
  'char is a number':   [/grade \+= 1|'A' is 65/, 1, 2],
  'int a, b;':          [/int a, b;/, 2, 2],
  'several strings':    [/adjective, animal, verb;/, 2, 5],
  '"function"':         [/\bfunctions?\b/i, 2, 3],
  'substr':             [/substr/, 2, 4],
  'name[0] index':      [/\w\[0\]/, 2, 4],
  '?: ternary':         [/ \? /, 3, 1],
  'braceless body':     [/braces are optional/, 3, 0],
  'time(0)':            [/time\(0\)/, 3, 5],
  'frame':              [/\bframes?\b/, 5, 3],
  'stack':              [/\bstack\b/, 5, 3],
  'bare return;':       [/return;/, 5, 7],
  'byte':               [/\bbytes?\b/, 6, 0],
  'vector of strings':  [/vector of strings/, 6, 3],
  'do...while':         [/do … while|do\.\.\.while|do \{/, null],
  'arrow ->':           [/-&gt;|->/, null],
  'dice jargon':        [/\bd20\b|\b2d6\b/, null],
};

const noTags = t => t.replace(/<\/?[a-z][^>]*>/gi, '');
const prose = m => noTags([m.title, m.goal, m.explain, m.note, m.hint, ...(m.anat || []).map(a => a[2] || '')].filter(Boolean).join('\n'));
const code = m => [m.start, m.ans].filter(Boolean).join('\n');
const flat = [];
CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => flat.push({ ci, mi, text: prose(m) + '\n' + code(m) + (mi === 0 ? '\n' + noTags(ch.intro) : '') })));
const before = (ci, mi) => flat.filter(x => x.ci < ci || (x.ci === ci && x.mi < mi));
const samples = q => Array.from({ length: 25 }, () => { const t = q.gen(); return [t.body, t.pre || '', t.why].join('\n'); });

for (const [term, [re, ci, mi]] of Object.entries(FIRST)) {
  if (ci === null) {
    test(`"${term}" is never used (the quest does not teach it)`, () => {
      for (const x of flat) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}"`);
      for (const q of QT) for (const s of samples(q)) assert.ok(!re.test(s), `quick-fire uses "${term}": ${s.slice(0, 50)}`);
    });
    continue;
  }
  test(`"${term}" is not used before ${ci}.${mi}`, () => {
    for (const x of before(ci, mi)) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}" before it is taught at ${ci}.${mi}`);
    assert.ok(flat.some(x => x.ci === ci && x.mi === mi && re.test(x.text)), `${ci}.${mi} should be where "${term}" is introduced`);
  });
  test(`quick-fire never asks about "${term}" before chapter ${ci} is done`, () => {
    for (const q of QT) for (const s of samples(q)) if (re.test(s)) assert.ok(q.ch >= ci, `quick-fire "${s.slice(0, 40)}" needs chapter ${ci}`);
  });
}

test('terms in every starter are defined in the first mission (0.0 note)', () => {
  const note = CH[0].missions[0].note;
  assert.match(note, /<code>endl<\/code> ends the line/);
  assert.match(note, /<code>using namespace std;<\/code> lets you type <code>cout<\/code> instead of <code>std::cout<\/code>/);
  assert.match(note, /<code>return 0;<\/code> at the end of <code>main<\/code>/);
  assert.match(note, /<code>g\+\+<\/code> line is the compile step/);
});

test('terms are defined in place the first time they appear', () => {
  const m = (c, i) => CH[c].missions[i];
  assert.match(m(1, 6).explain, /<code>cout &lt;&lt; level\+\+<\/code> prints the old value/);
  assert.match(m(3, 1).explain, /<b>ternary<\/b> <code>condition \? a : b<\/code>/);
  assert.match(m(2, 3).explain, /programmers say <b>function<\/b>/);
  assert.match(m(2, 4).explain, /starts at position 0 and takes 3 letters/);
  assert.match(m(6, 0).explain, /<b>bytes<\/b> \(a byte is the smallest piece of memory/);
  assert.match(m(6, 3).explain, /the part in <code>&lt; &gt;<\/code> is the type of each item/);
});

test('chapter reward lists only name things a mission teaches', () => {
  const learned = CH.flatMap(c => c.learned).join(' | ');
  assert.doesNotMatch(learned, /do …|->|substr/);
});

test('quick-fire: every question has a chapter, runs, and prints one line', () => {
  assert.ok(QT.length >= 20);
  for (const q of QT) {
    assert.ok(Number.isInteger(q.ch) && q.ch >= 0 && q.ch < CH.length);
    for (let i = 0; i < 10; i++) {
      const t = q.gen();
      const r = CPP.runAll(P(t.body, { inc: t.inc, pre: t.pre }), null, 20000);
      assert.ok(r.ok, `${t.body}: ${r.error && r.error.msg}`);
      assert.ok(r.out.trim().length > 0 && !r.out.trim().includes('\n'), `${t.body}: answer must be one line`);
    }
  }
});

test('quick-fire: no question uses braceless bodies or several names in one declaration', () => {
  for (const q of QT) for (const s of samples(q)) {
    assert.doesNotMatch(s, /\)\s*cout|else\s+cout|\bint \w+ = \d+, /, s.slice(0, 60));
  }
});

const doneThrough = n => { const d = {}; for (let c = 0; c < n; c++) CH[c].missions.forEach((_, i) => (d[c + '-' + i] = true)); return d; };

test('quick-fire gating: nothing is open on a fresh save', () => {
  assert.equal(qfOpen({}).length, 0);
  assert.equal(qfOpen(undefined).length, 0);
});

test('quick-fire gating: chapter 1 alone opens only the questions it teaches (the example round is valid)', () => {
  const open = qfOpen(doneThrough(1));
  assert.ok(open.length >= 3);
  assert.ok(open.every(q => q.ch === 0));
});

test('quick-fire gating: only questions whose chapter is done are offered', () => {
  for (let n = 0; n <= CH.length; n++) {
    const open = qfOpen(doneThrough(n));
    for (const q of open) assert.ok(q.ch < n, `chapter ${q.ch} is not done but is offered`);
    assert.equal(open.length, QT.filter(q => q.ch < n).length);
  }
  assert.equal(qfOpen(doneThrough(CH.length)).length, QT.length);
});

test('quick-fire gating: pointer and function questions stay locked until their chapters are done', () => {
  const upTo4 = qfOpen(doneThrough(5)).map(q => q.gen()).map(t => t.body + (t.pre || '')).join('\n');
  assert.doesNotMatch(upTo4, /int\*|\*p|&\w|bump|twice/);
});

test('quick-fire gating: one missing mission keeps the whole chapter locked, and a later chapter alone does not unlock an earlier one', () => {
  const d = doneThrough(1); delete d['0-2'];
  assert.equal(qfOpen(d).length, 0);
  const only3 = {}; CH[3].missions.forEach((_, i) => (only3['3-' + i] = true));
  assert.ok(qfOpen(only3).every(q => q.ch === 3));
});
