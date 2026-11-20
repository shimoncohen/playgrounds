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
  union:           [/\bunions?\b/i, 1, 0],
  narrowing:       [/\bnarrow(ing|ed|s)?\b/i, 1, 0],
  typeof:          [/\btypeof\b/, 1, 0],
  TS2339:          [/\bTS2339\b/, 1, 0],
  undefined:       [/\bundefined\b|\bnull\b/, 1, 2],
  truthiness:      [/\btruthy\b|\btruthiness\b/i, 1, 2],
  TS18048:         [/\bTS18048\b/, 1, 2],
  in:              [/`in`|["']\w+["']\s+in\s+\w/, 1, 3],
  switch:          [/\bswitch\b/i, 1, 4],
  'default branch': [/`default`|\bdefault:|default branch/i, 1, 4],
  'discriminated union': [/\bdiscriminated\b|\btags?\b|\btagged\b/i, 1, 4],
  never:           [/`never`|:\s*never\b|=>\s*never|the type never/, 1, 5],
  'exhaustive check': [/exhaustive/i, 1, 5],
  'type alias':    [/\btype alias(es)?\b|\btype\s+[A-Z]\w*\s*=/, 2, 0],
  interface:       [/\binterfaces?\b/i, 2, 1],
  'optional property': [/optional propert(y|ies)|\b\w+\?\s*:/i, 2, 1],
  readonly:        [/\breadonly\b/, 2, 2],
  TS2540:          [/\bTS2540\b/, 2, 2],
  'excess property': [/excess propert|object literal may only/i, 2, 3],
  TS2353:          [/\bTS2353\b/, 2, 3],
  extends:         [/\bextends\b/, 2, 4],
  TS2741:          [/\bTS2741\b/, 2, 4],
  // a single & between two types; never && and never an HTML entity such as &amp; (the test strips tags, not entities)
  intersection:    [/\bintersection\b|(?<!&)&(?![&\w#])/i, 2, 5],
  'structural typing': [/\bstructur(al|e)\b/i, 2, 6],
  'return type':   [/return types?\b/i, 3, 0],
  TS2554:          [/\bTS2554\b/, 3, 1],
  'optional parameter': [/optional parameter/i, 3, 1],
  'default parameter': [/default (parameter|value)|\([^)]*:\s*\w+\s*=\s*\w/i, 3, 1],
  'rest parameter': [/rest parameter|\.\.\.\w+\s*:/i, 3, 2],
  'array type':    [/\b\w+\[\]/, 3, 2],
  TS2345:          [/\bTS2345\b/, 3, 2],
  'callback type': [/callback/i, 3, 3],
  void:            [/\bvoid\b/i, 3, 4],
  throw:           [/\bthrow\b/, 3, 5],
  'new Error':     [/new Error/, 3, 5],
  'type predicate': [/type predicate|\b[a-z]\w*\s+is\s+[A-Z]\w*/, 3, 6],
  push:            [/\bpush\b/, 4, 0],
  'readonly list': [/readonly (list|array)|\breadonly\s+\w+\[\]/i, 4, 1],
  tuple:           [/\btuples?\b/i, 4, 2],
  'labelled element': [/\blabell?ed (tuple|element|slot)|\[\s*\w+\s*:\s*\w+\s*,\s*\w+\s*:\s*\w+\s*\]/i, 4, 3],
  'optional tuple element': [/optional tuple|\w\?\]/i, 4, 4],
  TS2493:          [/\bTS2493\b/, 4, 5],
  'Array<':        [/\bArray</, null],
  Promise:         [/\bPromise\b/, null],
  class:           [/\bclass(es)?\b/i, null],
  generic:         [/\bgenerics?\b/i, null],
  tsconfig:        [/tsconfig/i, null],
  // the quest still teaches no loops, so no chapter claims a loop concept
  loop:            [/\bloops?\b|\b(while|for)\s*\(|\bdo\s*\{/i, null],
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

const measuredCodes = () => {
  const codes = new Set();
  for (const ch of CH) for (const m of ch.missions.filter(x => x.expectError)) {
    const s = createSession();
    if (m.pre) s.run(m.pre);
    s.run(m.code).diags.forEach(d => codes.add('TS' + d.code));
  }
  return codes;
};

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
  assert.match(guideSrc, /The quest on one page/);
  assert.doesNotMatch(guideSrc, /Chapter \d+ of the quest|Learn these (four|five|six)/);
  assert.deepEqual(ERRS.map(e => e[0].match(/TS\d+/)[0]).sort(), [...measuredCodes()].sort());
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
  const measured = measuredCodes();
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

test('quick-fire: the answers do not sit in one slot, and every error code of an expectError mission is asked about', () => {
  assert.ok(new Set(FIRE.map(q => q.a)).size >= 3);
  const asked = new Set(FIRE.map(q => q.o[q.a]));
  for (const code of [...measuredCodes(), 'No error']) assert.ok(asked.has(code), code);
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

test('quick-fire gating: a chapter\'s questions open with that chapter, and one missing mission keeps them locked', () => {
  CH.forEach((_, c) => {
    const upTo = n => FIRE.filter(q => q.ch < n).length;
    assert.equal(qfOpen(doneThrough(c + 1)).length, upTo(c + 1), `chapters 1 to ${c + 1} done`);
    const d = doneThrough(c + 1); delete d[`${c}.0`];
    assert.equal(qfOpen(d).length, upTo(c), `chapter ${c + 1} one mission short`);
  });
  assert.equal(qfOpen(doneThrough(CH.length)).length, FIRE.length);
  assert.equal(qfOpen(doneThrough(CH.length), 'beginner').length, FIRE.length);
  assert.equal(qfOpen(doneThrough(CH.length), 'advanced').length, 0);
});
