// Script Quest, "teach before use" (AGENTS.md rule 12): a key word must not appear in any mission text before the mission that
// teaches it (or defines it in place), and Quick-fire only offers questions whose chapter the learner has finished.
// The course lives in script-quest/content/*.js (DOM-free), loaded in the order index.html lists them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScriptContent } from '../content-loader.mjs';

const SCQ = loadScriptContent();
const { CH, FIRE, qfOpen, BLOCKS, ERRS } = SCQ;
const guideSrc = String(SCQ.guideHTML);

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
  shadow:          [/\bshadow(s|ed|ing)?\b/i, 12, 1],
  closure:         [/\bclosures?\b/i, 12, 2],
  'rest syntax':   [/\.\.\.rest\b|\brest (syntax|operator|parameter|element|property)/i, 13, 4],
  class:           [/\bclass(es)?\b/i, 14, 0],
  constructor:     [/\bconstructor\b/i, 14, 0],
  instance:        [/\binstances?\b/i, 14, 0],
  extends:         [/\bextends\b/i, 14, 2],
  super:           [/\bsuper\b/i, 14, 2],
  inherit:         [/\binherit/i, 14, 2],
  getter:          [/\bgetters?\b/i, 14, 3],
  static:          [/\bstatic\b/i, 14, 4],
  'private field': [/#code\b|\bprivate field/i, 14, 5],
  finally:         [/\bfinally\b/i, 15, 0],
  RangeError:      [/RangeError/, 15, 2],
  rethrow:         [/\brethrow/i, 15, 3],
  instanceof:      [/\binstanceof\b/, 15, 3],
  CommonJS:        [/CommonJS/, 16, 0],
  cache:           [/\bcache\b/i, 16, 3],
  MODULE_NOT_FOUND:[/MODULE_NOT_FOUND/, 16, 5],
  ESM:             [/\bESM\b|\bES modules?\b/, 16, 6],
  Set:             [/\bnew Set\b|\bSets?\b(?! up)/, 17, 0],
  Map:             [/\bnew Map\b|\bMaps?\b/, 17, 0],
  stringify:       [/stringify/, 18, 0],
  reviver:         [/\brevivers?\b/i, 18, 5],
  microtask:       [/microtask/i, 19, 0],
  queueMicrotask:  [/queueMicrotask/, 19, 1],
  nextTick:        [/nextTick/, 19, 2],
  setImmediate:    [/setImmediate/, 19, 3],
  'readFile callback': [/\breadFile\b/, 19, 3],
  'poll phase':    [/\bpoll\b/i, 19, 3],
  'check phase':   [/\bcheck phase\b/i, 19, 3],
  'timers phase':  [/\btimers phase\b/i, 19, 3],
  setInterval:     [/setInterval/, 19, 5],
  clearInterval:   [/clearInterval/, 19, 5],
  'Date.now':      [/Date\.now/, 19, 5],
  'path.join':     [/path\.join/, 20, 0],
  basename:        [/\bbasename\b/, 20, 0],
  extname:         [/\bextname\b/, 20, 0],
  mkdir:           [/\bmkdir\b/, 20, 1],
  'mkdir -p':      [/mkdir -p/, 20, 1],
  writeFile:       [/\bwriteFile\b/, 20, 2],
  appendFile:      [/\bappendFile\b/, 20, 3],
  readdir:         [/\breaddir\b/, 20, 4],
  stat:            [/\bstat\b/, 20, 4],
  unlink:          [/\bunlink\b/, 20, 5],
  EventEmitter:    [/\bEventEmitter\b/, 21, 0],
  emit:            [/\bemit\b/, 21, 0],
  once:            [/\.once\(|\bonce\b.*\blistener/i, 21, 2],
  listenerCount:   [/listenerCount/, 21, 2],
  off:             [/\.off\(/, 21, 3],
  'error event':   [/\.on\("error"|emit\("error"/, 21, 5],
  'process.on':    [/process\.on\(/, 21, 6],
  createServer:    [/createServer/, 22, 0],
  listen:          [/\.listen\(/, 22, 0],
  curl:            [/\bcurl\b/, 22, 0],
  writeHead:       [/writeHead/, 22, 1],
  'req.url':       [/req\.url/, 22, 2],
  'res.end':       [/res\.end/, 22, 0],
  '--parallel':    [/--parallel/, 22, 4],
  parseInt:        [/parseInt/, null],
  'Array.isArray': [/Array\.isArray/, null],
  statement:       [/\bstatements?\b/i, null],
  branch:          [/\bbranch/i, null],
};

const noTags = t => String(t).replace(/<\/?[a-z][^>]*>/gi, '');
// a hint counts as use but not as teaching: it is hidden until asked for
const taught = m => noTags([m.title, m.goal, m.code, m.explain, ...(m.anat || []).map(x => x[0] + ' ' + (x[2] || ''))].filter(Boolean).join('\n'));
const texts = m => noTags([taught(m), m.hint].filter(Boolean).join('\n'));
const flat = [];
CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => flat.push({ ci, mi, text: texts(m) + (mi === 0 ? '\n' + ch.intro : ''), teach: taught(m) + (mi === 0 ? '\n' + ch.intro : '') })));
const before = (ci, mi) => flat.filter(x => x.ci < ci || (x.ci === ci && x.mi < mi));
const SYNTAX = {
  'dot (console.log)':   [/\w\.\w/, /\bdot\b/],
  'call brackets':       [/\w\(/, /Round brackets/],
  '< > <= >=':           [/\s[<>]=?\s|[\w)][<>]=?[\w(]/, /less than/],
  'dot (.length)':       [/\.length\b/, /fact about/],
  '+ 1 after floor':     [/Math\.floor\([^\n]*\)\s*\+\s*\d|\d\s*\+\s*Math\.floor/, /shifts it/],
  'const in for...of':   [/for\s*\(\s*const\s/, /fresh wagon/],
  'generic <T>':         [/\w<[A-Za-z]\w*(\[\])?>/, /introduces T/],
  'empty () call':       [/\w\(\s*\)/, /Empty brackets/],
  'empty () definition': [/(function\s+\w+|\w+)\(\s*\)\s*\{|\(\s*\)\s*=>/, /takes nothing/],
  'shorthand { add }':   [/(?<=[=(,:]\s*|return\s+)\{\s*\w+\s*[,}]/, /add: add/],
  'braces destructure':  [/(const|let)\s*\{\s*\w+/, /match property names/],
  'event loop':          [/setTimeout\(.*, 0\)/, /waiting jobs/],
  'terminal':            [/^(node|npm)\s/m, /terminal is where/],
  'quotes in node -e':   [/^node\s+-e\s+["']/m, /one piece/],
  'single in double':    [/\w\('/, /single quotes/],
  'require without .js': [/require\(\s*["']\.\/[\w-]+["']\s*\)/, /adds \.js/],
  'class block':         [/\bclass\s+\w+/, /blueprint/],
  'rest in a pattern':   [/\{[^}]*\.\.\.\w+\s*\}\s*=/, /gathers/],
  'getter':              [/\bget\s+\w+\s*\(/, /read like a property/],
  'static method':       [/\bstatic\s+\w+/, /called on the class/],
  '#private field':      [/#\w+\s*=/, /exists only inside the class/],
  'finally block':       [/\bfinally\s*\{/, /whatever happens/],
  'throw':               [/\bthrow\s+(new|err)/, /stops the function right there/],
  'instanceof':          [/\binstanceof\b/, /it answers true or false/],
  'error cause':         [/\bcause\s*:/, /as cause/],
  'Promise.reject':      [/Promise\.reject/, /already failed/],
  'Promise.resolve':     [/Promise\.resolve/, /already finished/],
};
for (const [name, [use, say]] of Object.entries(SYNTAX)) {
  test(`syntax "${name}" is explained by the first mission that uses it`, () => {
    const i = flat.findIndex((x, k) => use.test(CH[x.ci].missions[x.mi].code));
    assert.ok(i >= 0, `no mission code uses it`);
    const upto = flat.slice(0, i + 1).map(x => x.teach).join('\n');
    assert.ok(say.test(upto), `${flat[i].ci}.${flat[i].mi} uses "${name}" before any card explains it`);
  });
}

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
    assert.ok(flat.some(x => x.ci === ci && x.mi === mi && re.test(x.teach)), `${ci}.${mi} should be where "${term}" is introduced`);
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
  assert.match(m(12, 1).explain, /<b>shadows<\/b>/);
  assert.match(m(12, 2).explain, /called a <b>closure<\/b>/);
  assert.match(m(13, 4).explain, /<b>rest syntax<\/b>/);
  assert.match(CH[14].intro, /Each stamped object is called an instance/);
  assert.match(m(14, 2).explain, /<b>extends<\/b>[^]*<b>inherits<\/b>/);
  assert.match(m(14, 3).explain, /<b>getter<\/b> is a method/);
  assert.match(m(14, 4).explain, /<b>static<\/b> method/);
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

test('quick-fire: chapters 21 to 23 have at least 3 questions each', () => {
  for (const ci of [20, 21, 22]) assert.ok(FIRE.filter(q => q.ch === ci).length >= 3, `chapter ${ci + 1}: ${FIRE.filter(q => q.ch === ci).length}`);
});

test('quick-fire: chapter 20 has at least 4 questions, and an immediate against a timer only inside a readFile callback', () => {
  const mine = FIRE.filter(q => q.ch === 19);
  assert.ok(mine.length >= 4, `only ${mine.length}`);
  for (const q of FIRE) {
    if (!/setTimeout/.test(q.c) || !/setImmediate/.test(q.c)) continue;
    const calls = SCQ.evScan(q.c).calls.filter(x => x.name === 'setTimeout' || x.name === 'setImmediate');
    assert.ok(calls.length > 0 && calls.every(x => x.parent === 'readFile'), `quick-fire "${q.c.slice(0, 40)}" races a timer and an immediate outside a readFile callback`);
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
