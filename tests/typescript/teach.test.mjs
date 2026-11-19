// TypeScript Quest, "teach before use" (AGENTS.md rule 12): a key word must not appear in any mission text before the mission that
// teaches it (or defines it in place), Quick-fire only offers questions whose chapter the learner has finished, and the
// Field guide, which is open from the start, defines each term where it uses it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptContent } from '../content-loader.mjs';
import { createSession } from './harness.mjs';

const TSQ = loadTypescriptContent();
const { CH, FIRE, qfOpen, BLOCKS, ERRS } = TSQ;
const guideSrc = String(TSQ.guideHTML);
const guideText = guideSrc + '\n' + BLOCKS.map(b => b.slice(0, 3).join('\n')).join('\n') + '\n' + ERRS.map(e => e.join('\n')).join('\n');

// term -> [regex that uses it, chapter, mission that first teaches or defines it in place (its own card may use it)]; null = never taught, so never used
const FIRST = {
  'error code':    [/error codes?\b|\bTS2322\b/i, 0, 0],
  'literal type':  [/literal types?/i, 0, 0],
  widening:        [/\bwiden/i, 0, 0],
  inference:       [/\binfer/i, 0, 0],
  annotation:      [/\bannotation/i, 0, 1],
  'any':           [/`any`|: any\b|\bthe type any\b|\bany type\b/, 0, 2],
  unknown:         [/\bunknown\b/i, 0, 3],
  TS18046:         [/\bTS18046\b/, 0, 3],
  'implicit any':  [/implicit\s+any/i, 0, 4],
  TS7006:          [/\bTS7006\b/, 0, 4],
  assertion:       [/\bassertion/i, 0, 5],
  as:              [/`as`|\bwith as\b|\bas (string|number)\b/, 0, 5],
  TS2352:          [/\bTS2352\b/, 0, 5],
  '|':             [/\s\|\s/, 0, 6],
  union:           [/\bunions?\b/i, null],
  narrowing:       [/\bnarrow(ing|ed|s)?\b/i, null],
  interface:       [/\binterfaces?\b/i, null],
  generic:         [/\bgenerics?\b/i, null],
  typeof:          [/\btypeof\b/, null],
  tsconfig:        [/tsconfig/i, null],
};

const noTags = t => String(t).replace(/<\/?[a-z][^>]*>/gi, '');
// a hint counts as use but not as teaching: it is hidden until asked for
const taught = m => noTags([m.title, m.goal, m.code, m.explain, ...(m.how || []), ...(m.anat || []).map(x => x[0] + ' ' + (x[2] || ''))].filter(Boolean).join('\n'));
const texts = m => noTags([taught(m), m.hint].filter(Boolean).join('\n'));
const flat = [];
CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => flat.push({ ci, mi, text: texts(m) + (mi === 0 ? '\n' + noTags(ch.intro) : ''), teach: taught(m) + (mi === 0 ? '\n' + noTags(ch.intro) : '') })));
const before = (ci, mi) => flat.filter(x => x.ci < ci || (x.ci === ci && x.mi < mi));
const qtext = q => q.c + '\n' + q.o.join('\n') + '\n' + q.w;

for (const [term, [re, ci, mi]] of Object.entries(FIRST)) {
  if (ci === null) {
    test(`"${term}" is never used (the quest does not teach it yet)`, () => {
      for (const x of flat) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}"`);
      for (const q of FIRE) assert.ok(!re.test(qtext(q)), `quick-fire "${q.c.slice(0, 40)}" uses "${term}"`);
      assert.ok(!re.test(noTags(guideText)), `the guide uses "${term}"`);
    });
    continue;
  }
  test(`"${term}" is not used before ${ci}.${mi}`, () => {
    for (const x of before(ci, mi)) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}" before it is taught at ${ci}.${mi}`);
    assert.ok(flat.some(x => x.ci === ci && x.mi === mi && re.test(x.teach)), `${ci}.${mi} should be where "${term}" is introduced`);
  });
  test(`quick-fire never asks about "${term}" before chapter ${ci} is done`, () => {
    for (const q of FIRE) if (re.test(qtext(q))) assert.ok(q.ch >= ci, `quick-fire "${q.c.slice(0, 40)}" needs chapter ${ci}`);
  });
}

test('terms are defined in place the first time they appear', () => {
  const m = i => CH[0].missions[i];
  assert.match(CH[0].intro, /TypeScript is JavaScript plus types/);
  assert.match(CH[0].intro, /\(inference\)/);
  assert.match(m(0).how.join(' '), /<b>literal type<\/b>/);
  assert.match(m(0).how.join(' '), /<b>inference<\/b>[^]*<b>widening<\/b>/);
  assert.match(m(0).how.join(' '), /error code <b>TS2322<\/b> \(the number names the kind of mistake\)/);
  assert.match(m(1).how.join(' '), /<b>type annotation<\/b>, a type you write yourself/);
  assert.match(m(4).how.join(' '), /<b>implicit any<\/b>/);
  assert.match(m(5).how.join(' '), /<b>type assertion<\/b>/);
  assert.match(m(6).how.join(' '), /joined by <code>\|<\/code> \(or\)/);
});

test('guide: each term it uses is glossed in place, the error decoder covers the chapter codes, and the lede does not over-claim', () => {
  const g = noTags(guideText);
  assert.match(g, /Guessing a type from the value is inference/);
  assert.match(g, /literal type/);
  assert.match(g, /widens/);
  assert.match(g, /type annotation/);
  assert.match(g, /\bany\b[^.]*checking off|switches the checker off/);
  assert.match(g, /\bunknown\b[^.]*prove/);
  assert.match(g, /implicit any/);
  assert.match(g, /a promise from you, not a conversion/);
  assert.match(guideSrc, /Chapter 1 of the quest on one page/);
  assert.deepEqual(ERRS.map(e => e[0].match(/TS\d+/)[0]).sort(), ['TS18046', 'TS2322', 'TS2352', 'TS7006']);
});

test('guide: no card uses `as` before the card that glosses it', () => {
  const at = BLOCKS.findIndex(b => /^as is/.test(b[0]));
  assert.ok(at > 0, 'the as card exists and is not first');
  const inCode = /[\w)\]"'] as \w/;
  const inText = /<code>as<\/code>|\bwith as\b|\bas (string|number)\b/;
  BLOCKS.slice(0, at).forEach(b => assert.ok(!inCode.test(b[2]) && !inText.test(b[1]), `"${b[0]}" uses as before its card`));
});

test('guide: each code card compiles clean, and each decoder code is one the missions measure', () => {
  for (const b of BLOCKS) {
    const rec = createSession().run(b[2]);
    assert.deepEqual(rec.diags, [], `${b[0]}: ${b[2]}`);
  }
  const measured = new Set();
  for (const m of CH[0].missions.filter(x => x.expectError)) {
    const rec = createSession().run(m.code);
    rec.diags.forEach(d => measured.add('TS' + d.code));
  }
  for (const e of ERRS) assert.ok(measured.has(e[0].match(/TS\d+/)[0]), `${e[0]} is not produced by any mission answer`);
});

test('quick-fire: every question has chapter 0, 4 distinct options, a valid right answer, and the answer the real compiler gives', () => {
  assert.ok(FIRE.length >= 8, `only ${FIRE.length} questions`);
  for (const q of FIRE) {
    assert.ok(Number.isInteger(q.ch) && q.ch >= 0 && q.ch < CH.length, q.c);
    assert.equal(q.o.length, 4, q.c);
    assert.equal(new Set(q.o).size, 4, `${q.c}: duplicate options`);
    assert.ok(q.a >= 0 && q.a < 4, q.c);
    const rec = createSession().run(q.c);
    const said = rec.diags.length ? 'TS' + rec.diags[0].code : 'No error';
    assert.equal(q.o[q.a], said, `quick-fire "${q.c.slice(0, 40)}": the compiler says ${said}`);
  }
});

test('quick-fire: the answers do not sit in one slot, and every error code of the chapter is asked about', () => {
  assert.ok(new Set(FIRE.map(q => q.a)).size >= 3);
  const asked = new Set(FIRE.map(q => q.o[q.a]));
  for (const code of ['TS2322', 'TS18046', 'TS7006', 'TS2352', 'No error']) assert.ok(asked.has(code), code);
});

test('quick-fire: the example question (FIRE[0]) is open after Chapter 1 alone', () => {
  assert.equal(FIRE[0].ch, 0);
  assert.equal(FIRE[0].o[FIRE[0].a], 'TS2322');
});

const doneThrough = n => { const d = {}; for (let c = 0; c < n; c++) CH[c].missions.forEach((_, i) => (d[c + '.' + i] = 1)); return d; };

test('quick-fire gating: nothing is open on a fresh save', () => {
  assert.equal(qfOpen({}).length, 0);
  assert.equal(qfOpen(undefined).length, 0);
});

test('quick-fire gating: the whole bank opens with chapter 1, and one missing mission keeps it locked', () => {
  assert.equal(qfOpen(doneThrough(1)).length, FIRE.length);
  const d = doneThrough(1); delete d['0.2'];
  assert.equal(qfOpen(d).length, 0);
  assert.equal(qfOpen(doneThrough(1), 'beginner').length, FIRE.length);
  assert.equal(qfOpen(doneThrough(1), 'advanced').length, 0);
});
