// TypeScript Quest, "teach before use" (AGENTS.md rule 12): a key word must not appear in any mission text before the mission that
// teaches it (or defines it in place), Quick-fire only offers questions whose chapter the learner has finished, and the
// Field guide, which is open from the start, defines each term where it uses it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTypescriptContent } from '../content-loader.mjs';
import { createSession } from './harness.mjs';
import { projectRun, flatFiles as flatten, engine } from './project-harness.mjs';
import { playTerminal } from './terminal-harness.mjs';

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
  generic:         [/\bgenerics?\b/i, 5, 0],
  'type parameter': [/type parameters?/i, 5, 0],
  'generic function': [/generic function/i, 5, 0],
  'generic interface': [/generic interface/i, 5, 1],
  'generic constraint': [/\bconstraints?\b/i, 5, 2],
  'default type argument': [/default type argument/i, 5, 3],
  Promise:         [/\bPromise\b/, 5, 4],
  async:           [/\basync\b/, 5, 5],
  TS1064:          [/\bTS1064\b/, 5, 5],
  class:           [/\bclass(es)?\b/i, 6, 0],
  'class field':   [/\b(typed|class) fields?\b/i, 6, 0],
  TS2564:          [/\bTS2564\b/, 6, 0],
  private:         [/\bprivate\b/, 6, 1],
  public:          [/\bpublic\b/, 6, 1],
  TS2341:          [/\bTS2341\b/, 6, 1],
  protected:       [/\bprotected\b/, 6, 2],
  TS2445:          [/\bTS2445\b/, 6, 2],
  'parameter property': [/parameter propert(y|ies)/i, 6, 3],
  'readonly field': [/readonly fields?/i, 6, 3],
  abstract:        [/\babstract\b/, 6, 4],
  TS2511:          [/\bTS2511\b/, 6, 4],
  TS2515:          [/\bTS2515\b/, 6, 4],
  instanceof:      [/\binstanceof\b/, 6, 5],
  implements:      [/\bimplements\b/, 6, 5],
  'as const':      [/\bas const\b/, 7, 0],
  'readonly literal object': [/readonly literal object/i, 7, 0],
  enum:            [/\benums?\b/i, 7, 1],
  'string enum':   [/string enums?/i, 7, 2],
  'enum member type': [/enum member type/i, 7, 2],
  satisfies:       [/\bsatisfies\b/, 7, 4],
  TS1360:          [/\bTS1360\b/, 7, 4],
  'utility type':  [/utility types?/i, 8, 0],
  Partial:         [/\bPartial\b/, 8, 0],
  Required:        [/\bRequired\b/, 8, 1],
  Readonly:        [/\bReadonly\b/, 8, 2],
  Record:          [/\bRecord\b/, 8, 3],
  Pick:            [/\bPick\b/, 8, 4],
  Omit:            [/\bOmit\b/, 8, 5],
  export:          [/\bexport\b/i, 9, 0],
  import:          [/\bimport\b/i, 9, 0],
  'relative path': [/relative (import )?paths?/i, 9, 0],
  'default export': [/default export/i, 9, 1],
  TS2305:          [/\bTS2305\b/, 9, 2],
  'import type':   [/\bimport type\b/i, 9, 3],
  'export type':   [/\bexport type\b/i, 9, 3],
  TS2307:          [/\bTS2307\b/, 9, 4],
  keyof:           [/\bkeyof\b/, 10, 0],
  'typeof in a type': [/type\s+\w+(<[^>]*>)?\s*=\s*\(?\s*typeof\b|\(typeof\s+\w+\)\s*\[/, 10, 1],
  'indexed access': [/indexed access|\b[A-Z]\w*\[\s*"\w+"\s*\]/, 10, 2],
  'key constraint': [/key constraint|extends keyof/i, 10, 3],
  'T[keyof T]':    [/\[\s*keyof\s+\w+\s*\]/, 10, 4],
  'T[number]':     [/\[number\]/, 10, 5],
  'mapped type':   [/mapped types?/i, 11, 0],
  'K in keyof':    [/\[\s*K\s+in\s/, 11, 0],
  'optional modifier': [/\]\s*\?\s*:/, 11, 1],
  TS2300:          [/\bTS2300\b/, 11, 1],
  'readonly modifier': [/readonly\s+\[\s*K\b/, 11, 2],
  '-readonly and -?': [/-readonly|\]\s*-\?/, 11, 3],
  'Array<':        [/\bArray</, null],
  'conditional type': [/conditional types?/i, 12, 0],
  distribution:    [/distribut/i, 12, 1],
  infer:           [/\binfer\s+[A-Z]\b/, 12, 2],
  ReturnType:      [/\bReturnType\b/, 12, 3],
  Exclude:         [/\bExclude\b|\bNonNullable\b/, 12, 4],
  Awaited:         [/\bAwaited\b/, 12, 5],
  'key remapping': [/key remapping|\bkeyof\s+\w+\s+as\b/i, 12, 6],
  'template literal type': [/template literal/i, 13, 0],
  Uppercase:       [/\b(Uppercase|Lowercase|Capitalize|Uncapitalize)\b/, 13, 1],
  'typed event names': [/typed event names?/i, 13, 2],
  TS2820:          [/\bTS2820\b/, 13, 1],
  TS2561:          [/\bTS2561\b/, 13, 2],
  tsconfig:        [/tsconfig/i, 14, 0],
  'strict mode':   [/strict mode|`strict`|"strict"/i, 14, 0],
  noImplicitAny:   [/noImplicitAny/, 14, 1],
  strictNullChecks: [/strictNullChecks/, 14, 2],
  noUncheckedIndexedAccess: [/noUncheckedIndexedAccess/, 14, 3],
  noImplicitReturns: [/noImplicitReturns/, 14, 4],
  TS7030:          [/\bTS7030\b/, 14, 4],
  noUnusedLocals:  [/noUnusedLocals/, 14, 5],
  TS6133:          [/\bTS6133\b/, 14, 5],
  readFileSync:    [/readFileSync/, 15, 0],
  'JSON.parse':    [/JSON\.parse/, 15, 1],
  'fs.promises':   [/fs\.promises/, 15, 3],
  createServer:    [/createServer/, 15, 4],
  IncomingMessage: [/IncomingMessage|ServerResponse/, 15, 4],
  curl:            [/\bcurl\b/, 15, 4],
  writeHead:       [/writeHead/, 15, 4],
  'node:test':     [/node:test|node --test/, 16, 0],
  assert:          [/\bassert\b/, 16, 0],
  suite:           [/\bsuites?\b|\bdescribe\(/, 16, 2],
  deepEqual:       [/deepEqual/, 16, 3],
  rejects:         [/\brejects\b/, 16, 5],
  'exit code':     [/exit codes?/i, 16, 1],
  'process.argv':  [/process\.argv/, 17, 0],
  subcommand:      [/subcommands?/i, 17, 0],
  'process.exitCode': [/process\.exitCode/, 17, 1],
  'console.error': [/console\.error/, 17, 1],
  writeFileSync:   [/writeFileSync/, 17, 4],
  // the quest still teaches no loops, so no chapter claims a loop concept
  loop:            [/\bloops?\b|\b(while|for)\s*\(|\bdo\s*\{/i, null],
};

const noTags = t => String(t).replace(/<\/?[a-z][^>]*>/gi, '');
// a project mission's code and start are path-to-text objects: one text, each file after its path, so no word test skips them
// a hint counts as use but not as teaching: it is hidden until asked for
const taught = m => noTags([m.title, m.goal, flatten(m.code), flatten(m.start), m.explain, ...(m.how || []), ...(m.anat || []).map(x => x[0] + ' ' + (x[2] || ''))].filter(Boolean).join('\n'));
const texts = m => noTags([taught(m), m.hint].filter(Boolean).join('\n'));
const flat = [];
CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => flat.push({ ci, mi, text: texts(m) + (mi === 0 ? '\n' + noTags(ch.intro) : ''), teach: taught(m) + (mi === 0 ? '\n' + noTags(ch.intro) : '') })));
const before = (ci, mi) => flat.filter(x => x.ci < ci || (x.ci === ci && x.mi < mi));
const qtext = q => q.c + '\n' + q.o.join('\n') + '\n' + q.w;

test('the flattened chapter 10 text is not empty and names its files, so project missions are read by the word tests', () => {
  const text = flat.filter(x => x.ci === 9).map(x => x.teach).join('\n');
  assert.match(text, /wagon\.ts/);
  assert.match(text, /main\.ts/);
});

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

// REPL missions only: a quick-fire question is one REPL snippet, and no snippet produces a project-only code
const replCodes = () => {
  const codes = new Set();
  for (const ch of CH.filter(c => c.mode !== 'project')) for (const m of ch.missions.filter(x => x.expectError)) {
    const s = createSession();
    if (m.pre) s.run(m.pre);
    s.run(m.code).diags.forEach(d => codes.add('TS' + d.code));
  }
  return codes;
};
// REPL plus project missions: the project ones measured through the project harness, the terminal ones through the terminal
const allCodes = async () => {
  const codes = replCodes();
  for (const ch of CH.filter(c => c.mode === 'project')) for (const m of ch.missions.filter(x => x.expectError))
    (ch.terminal ? (await playTerminal({ ...m.start, ...m.code }, m.cmds)).run : await projectRun({ ...m.start, ...m.code })).diags.forEach(d => codes.add('TS' + d.code));
  return codes;
};

test('guide: each term it uses is glossed in place, the error decoder covers the chapter codes, and the lede does not over-claim', async () => {
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
  assert.deepEqual(ERRS.map(e => e[0].match(/TS\d+/)[0]).sort(), [...await allCodes()].sort());
});

test('guide: no card uses `as` before the card that glosses it', () => {
  const at = BLOCKS.findIndex(b => /^as is/.test(b[0]));
  assert.ok(at > 0, 'the as card exists and is not first');
  const inCode = /[\w)\]"'] as \w/;
  const inText = /<code>as<\/code>|\bwith as\b|\bas (string|number)\b/;
  BLOCKS.slice(0, at).forEach(b => assert.ok(!inCode.test(b[2]) && !inText.test(b[1]), `"${b[0]}" uses as before its card`));
});

test('guide: no card uses a chapter 11 or later term before its chapter, and each such term is glossed where the guide uses it', () => {
  const cardText = b => noTags(b.slice(0, 3).join('\n'));
  for (const [term, [re, ci]] of Object.entries(FIRST)) {
    if (ci === null || ci < 10) continue;
    for (const b of BLOCKS.filter(x => x[3] < ci)) assert.ok(!re.test(cardText(b)), `"${b[0]}" uses "${term}" before chapter ${ci + 1}`);
  }
  const g = noTags(guideText);
  assert.match(g, /keyof[^.]*union of the names/);
  assert.match(g, /typeof[^.]*type position[^.]*type of a value/);
  assert.match(g, /indexed access[^.]*type of that one property/);
  assert.match(g, /key constraint[^.]*names the type has/);
  assert.match(g, /mapped type[^.]*walks the keys/);
  assert.match(g, /readonly[^.]*locks each/);
  assert.match(g, /-readonly[^.]*take them away/);
  assert.match(g, /conditional type[^.]*fits[^.]*does not/);
  assert.match(g, /infer[^.]*names a piece/);
  assert.match(g, /Awaited[^.]*peels every promise/);
  assert.match(g, /key remapping[^.]*renames each key/);
  assert.match(g, /template literal type builds a text type from pieces/);
  assert.match(g, /Uppercase[^.]*Uncapitalize change the case/);
  assert.match(g, /infer[^.]*inside a template literal type catches a piece/);
  assert.match(g, /close to one the type allows[^.]*often in its case\. The checker suggests the spelling/);
  assert.match(g, /tsconfig\.json tells tsc how strict to be, and a flag left out is off\. "strict": true turns on the whole family at once/);
});

test('guide: each code card compiles clean, and each decoder code is one the missions measure', async () => {
  const strictConfig = '{\n  "compilerOptions": { "strict": true }\n}\n';
  for (const b of BLOCKS) {
    // a node-tier card shows real Node code, so it compiles through the terminal's checker with the Node typings
    const diags = CH[b[3]].tier === 'node'
      ? JSON.parse(JSON.stringify(engine.TSCheck.checkProject({ 'tsconfig.json': strictConfig, 'main.ts': b[2] }, { node: true }).diags))
      : createSession().run(b[2]).diags;
    assert.deepEqual(diags, [], `${b[0]}: ${b[2]}`);
  }
  const measured = await allCodes();
  for (const e of ERRS) assert.ok(measured.has(e[0].match(/TS\d+/)[0]), `${e[0]} is not produced by any mission answer`);
});

const guideWith = () => {
  if (!TSQ.tiers) {
    const win = { TSQ };
    for (const f of ['shared/tiers.js', 'programming/typescript-quest/tiers.js']) new Function('window', readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'))(win);
  }
  const tiers = TSQ.tiers, present = [];
  CH.forEach((_, i) => { const t = tiers.tierOf(i); if (!present.includes(t)) present.push(t); });
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return { present, tierOf: i => tiers.tierOf(i), html: TSQ.guideHTML({ esc, hl: esc, tiers: present, tierOf: i => tiers.tierOf(i) }), esc };
};
const sectionOf = (html, tierId) => {
  const re = tierId === 'beginner' ? /<section class="gsec"><h3>Building blocks<\/h3>[\s\S]*?<\/section>/ : new RegExp(`<section class="gsec gtier" data-tier="${tierId}">[\\s\\S]*?</section>`);
  return (html.match(re) || [''])[0];
};

test('guide filter: a button per present tier with aria-pressed, and the label for the group', () => {
  const { present, html } = guideWith();
  assert.ok(present.length > 1);
  assert.match(html, /<div class="gfilter" role="group" aria-label="Filter by tier">/);
  assert.match(html, /<button class="btn ghost" data-tier="all" aria-pressed="true">All<\/button>/);
  for (const t of present) assert.match(html, new RegExp(`<button class="btn ghost" data-tier="${t.id}" aria-pressed="false">${t.name}</button>`));
});

test('guide filter: every card sits in the section of its chapter tier, and the split-files section and decoder are tagged', () => {
  const { html, esc } = guideWith();
  for (const b of BLOCKS) {
    const own = CH[b[3]].tier, sec = sectionOf(html, own);
    assert.ok(sec.includes(`<h4>${esc(b[0])}</h4>`), `${b[0]} is not in the ${own} section`);
    for (const other of ['beginner', 'intermediate', 'advanced', 'node'].filter(x => x !== own))
      assert.ok(!sectionOf(html, other).includes(`<h4>${esc(b[0])}</h4>`), `${b[0]} also sits in ${other}`);
  }
  assert.match(html, /data-tier="intermediate"><h3>Intermediate: going deeper<\/h3>/);
  assert.match(html, /<section class="gsec" data-tier="intermediate"><h3>Split a program across files<\/h3>/);
  assert.match(html, /<section class="gsec" data-extras><h3>Error decoder<\/h3>/);
});

test('guide filter: a single tier shows no filter, and the old call shape still renders every card', () => {
  const { present, html, esc } = guideWith();
  const one = TSQ.guideHTML({ esc, hl: esc, tiers: [present[0]], tierOf: () => present[0] });
  assert.doesNotMatch(one, /gfilter/);
  const old = TSQ.guideHTML({ esc, hl: esc });
  assert.doesNotMatch(old, /gfilter/);
  for (const b of BLOCKS) assert.ok(old.includes(`<h4>${esc(b[0])}</h4>`), `${b[0]} missing from the old call`);
  assert.ok(html.includes('Error decoder'));
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
  for (const code of [...replCodes(), 'No error']) assert.ok(asked.has(code), code);
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
  assert.equal(qfOpen(doneThrough(CH.length), 'beginner').length, FIRE.filter(q => CH[q.ch].tier === 'beginner').length);
  assert.equal(qfOpen(doneThrough(CH.length), 'intermediate').length, FIRE.filter(q => CH[q.ch].tier === 'intermediate').length);
  assert.equal(qfOpen(doneThrough(CH.length), 'advanced').length, FIRE.filter(q => CH[q.ch].tier === 'advanced').length);
  assert.equal(qfOpen(doneThrough(CH.length), 'node').length, FIRE.filter(q => CH[q.ch].tier === 'node').length);
  assert.ok(FIRE.some(q => CH[q.ch].tier === 'advanced'), 'chapters 11 and on have quick-fire questions');
  assert.ok(FIRE.some(q => CH[q.ch].tier === 'node'), 'the node tier has quick-fire questions');
});
