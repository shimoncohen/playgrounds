// Script Quest, "teach before use" (AGENTS.md rule 12): a key word must not appear in any mission text before the mission that
// teaches it (or defines it in place), and Quick-fire only offers questions whose chapter the learner has finished.
// The course lives in script-quest/app.js next to the DOM app, so load its DOM-free parts (CH, FIRE, qfOpen, the guide data) by slicing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readApp, cut, loadContent } from '../content-loader.mjs';

const tagOf = 'const tagOf=v=>Object.prototype.toString.call(v).slice(8,-1);\n';
const { CH, FIRE, qfOpen } = loadContent('script-quest', { prelude: tagOf, parts: [['const isArr=', '// ================= UI =================']], returns: ['CH', 'FIRE', 'qfOpen'], mustInclude: ['const qfOpen='] });
const { BLOCKS, ERRS } = loadContent('script-quest', { parts: [['const BLOCKS=[', 'function renderGuide']], returns: ['BLOCKS', 'ERRS'] });
const guideSrc = cut(readApp('script-quest'), 'function renderGuide', 'const guideRealms');

// term -> [regex that uses it, chapter, mission that first teaches or defines it in place (its own card may use it)]; null = never taught, so never used
const FIRST = {
  operator:        [/\boperators?\b/i, 1, 2],
  TypeError:       [/TypeError/, 1, 5],
  NaN:             [/\bNaN\b/, 2, 4],
  '||':            [/\|\|/, 2, 5],
  '??':            [/\?\?/, 2, 6],
  condition:       [/\bconditions?\b/i, 3, 0],
  loop:            [/\bloops?\b/i, 4, 0],
  'array/list':    [/\barrays?\b|\blists?\b/i, 4, 3],
  'array literal': [/\[\s*["'\d🍎]/, 4, 3],
  '.length':       [/\.length\b/, 5, 2],
  function:        [/\bfunctions?\b/i, 6, 0],
  return:          [/\breturns?\b/i, 6, 0],
  argument:        [/\barguments?\b/i, 6, 1],
  callback:        [/\bcallbacks?\b/i, 6, 5],
  scope:           [/\bscope\b/i, 6, 6],
  object:          [/\bobjects?\b/i, 7, 0],
  property:        [/\bpropert(y|ies)\b/i, 7, 0],
  spread:          [/\bspread\b/i, 7, 6],
  destructuring:   [/destructuring/i, 7, 7],
  method:          [/\bmethods?\b/i, 7, 8],
  'compare fn':    [/compare function/i, 8, 6],
  'new Promise':   [/new (Promise|Error)/, 9, 2],
  resolve:         [/\bresolve\b/, 9, 2],
  async:           [/\basync\b/, 9, 4],
  JSON:            [/\bJSON\b/, 9, 5],
  throws:          [/\bthrows?\b/i, 9, 5],
  reject:          [/\brejected?\b/i, 9, 6],
  'type alias':    [/type Direction =/, 10, 7],
  'T[]':           [/T\[\]/, 10, 9],
  toUpperCase:     [/toUpperCase/, 10, 9],
  module:          [/\bmodules?\b/i, 11, 4],
  cat:             [/\bcat\b/, 11, 5],
  package:         [/\bpackages?\b(?!\.json)/i, 11, 7],
  'package.json':  [/package\.json/, 11, 9],
  parseInt:        [/parseInt/, null],
  'Array.isArray': [/Array\.isArray/, null],
  statement:       [/\bstatements?\b/i, null],
  branch:          [/\bbranch/i, null],
};

const noTags = t => String(t).replace(/<\/?[a-z][^>]*>/gi, '');
const texts = m => noTags([m.title, m.goal, m.code, m.explain, m.hint, ...(m.anat || []).map(x => x[0] + ' ' + (x[2] || ''))].filter(Boolean).join('\n'));
const flat = [];
CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => flat.push({ ci, mi, text: texts(m) + (mi === 0 ? '\n' + ch.intro : '') })));
const before = (ci, mi) => flat.filter(x => x.ci < ci || (x.ci === ci && x.mi < mi));
const qtext = q => q.c + '\n' + q.o.join('\n') + '\n' + q.w;

for (const [term, [re, ci, mi]] of Object.entries(FIRST)) {
  if (ci === null) {
    test(`"${term}" is never used (the quest does not teach it)`, () => {
      for (const x of flat) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}"`);
      for (const q of FIRE) assert.ok(!re.test(qtext(q)), `quick-fire "${q.c.slice(0, 40)}" uses "${term}"`);
    });
    continue;
  }
  test(`"${term}" is not used before ${ci}.${mi}`, () => {
    for (const x of before(ci, mi)) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}" before it is taught at ${ci}.${mi}`);
    assert.ok(flat.some(x => x.ci === ci && x.mi === mi && re.test(x.text)), `${ci}.${mi} should be where "${term}" is introduced`);
  });
  test(`quick-fire never asks about "${term}" before chapter ${ci} is done`, () => {
    for (const q of FIRE) if (re.test(qtext(q))) assert.ok(q.ch >= ci, `quick-fire "${q.c.slice(0, 40)}" needs chapter ${ci}`);
  });
}

test('terms are defined in place the first time they appear', () => {
  const m = (c, i) => CH[c].missions[i];
  assert.match(m(1, 2).goal, /operator is a symbol/);
  assert.match(m(2, 4).explain, /"Not a Number"/);
  assert.match(m(2, 6).explain, /<code>\|\|<\/code> works as a fallback too/);
  assert.match(CH[3].intro, /condition is a yes-or-no question/);
  assert.match(m(4, 3).explain, /hold a <b>list<\/b> of items/);
  assert.match(m(7, 0).explain, /called a <b>property<\/b>/);
  assert.match(m(9, 2).explain, /helper called <code>resolve<\/code>/);
  assert.match(m(9, 4).explain, /<code>async<\/code> in front of a function is what allows/);
  assert.match(m(9, 5).explain, /JSON \(a plain-text format for data\)/);
  assert.match(m(9, 6).explain, /<code>reject<\/code>[^]*<b>rejected<\/b>[^]*<code>new Error/);
  assert.match(m(10, 7).explain, /gives your own name to a type/);
  assert.match(m(10, 9).explain, /<code>T\[\]<\/code> means "a list of T"/);
  assert.match(m(11, 4).explain, /a <b>module<\/b> is a bundle of ready-made tools/);
  assert.match(m(11, 5).explain, /<code>cat<\/code> is a terminal command/);
  assert.match(m(11, 9).explain, /<b>JSON<\/b>, a plain-text data format/);
});

test('guide: no string method the quest never taught, NaN and Array.isArray are glossed, the lede does not over-claim', () => {
  for (const b of BLOCKS) assert.doesNotMatch(b[2], /toUpperCase/, b[0]);
  assert.match(guideSrc, /NaN<\/code> \(Not a Number\)/);
  assert.match(guideSrc, /Array\.isArray\(\)<\/code> \(a built-in yes\/no check/);
  assert.match(guideSrc, /Most of the quest on one page, plus a few extras/);
  assert.match(guideSrc, /\(<code>mkdir<\/code>\)[^]*\(<code>cd<\/code>\)/);
  assert.ok(ERRS.length > 0);
});

test('quick-fire: every question has a chapter, 4 distinct options and a valid right answer', () => {
  for (const q of FIRE) {
    assert.ok(Number.isInteger(q.ch) && q.ch >= 0 && q.ch < CH.length, q.c);
    assert.equal(q.o.length, 4, q.c);
    assert.equal(new Set(q.o).size, 4, `${q.c}: duplicate options`);
    assert.ok(q.a >= 0 && q.a < 4, q.c);
  }
});

test('quick-fire: the example question (FIRE[0]) is open after Chapter 1 alone', () => {
  assert.equal(FIRE[0].ch, 0);
  assert.match(FIRE[0].c, /^console\.log\("2" \+ 2\)$/);
});

const doneThrough = n => { const d = {}; for (let c = 0; c < n; c++) CH[c].missions.forEach((_, i) => (d[c + '-' + i] = 1)); return d; };

test('quick-fire gating: nothing is open on a fresh save', () => {
  assert.equal(qfOpen({}).length, 0);
  assert.equal(qfOpen(undefined).length, 0);
});

test('quick-fire gating: only entries whose chapter is done are offered', () => {
  for (let n = 0; n <= CH.length; n++) {
    const open = qfOpen(doneThrough(n));
    for (const q of open) assert.ok(q.ch < n, `chapter ${q.ch} is not done but offers "${q.c.slice(0, 40)}"`);
    assert.equal(open.length, FIRE.filter(q => q.ch < n).length);
  }
  assert.equal(qfOpen(doneThrough(CH.length)).length, FIRE.length);
});

test('quick-fire gating: one missing mission keeps the whole chapter locked, and a later chapter alone does not unlock an earlier one', () => {
  const d = doneThrough(1); delete d['0-2'];
  assert.equal(qfOpen(d).length, 0);
  const only3 = {}; CH[3].missions.forEach((_, i) => (only3['3-' + i] = 1));
  assert.ok(qfOpen(only3).every(q => q.ch === 3));
});
