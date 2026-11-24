// Data Structures Quest: every mission is solvable by its own answer, and its check is not fooled by the starter or by a lazy answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'programming', 'ds-quest');
const sandbox = {};
vm.createContext(sandbox);
for (const f of ['engine.js', 'content.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
const D = sandbox.DSQ;
const check = (m, src) => { const res = D.run(src); return res.error ? { err: res.error } : m.check(D.makeCtx(src, res)); };

for (const [ci, ch] of D.CH.entries()) {
  for (const [mi, m] of ch.missions.entries()) {
    const id = `${ci}.${mi} ${m.title}`;
    if (!m.check) continue;
    test(`${id}: the reference answer passes`, () => {
      assert.equal(check(m, m.answer), true);
    });
    test(`${id}: the starter code does not pass`, () => {
      assert.notEqual(check(m, m.starter), true);
    });
    test(`${id}: an empty program does not pass`, () => {
      assert.notEqual(check(m, ''), true);
    });
  }
}

test('lazy answers are caught', () => {
  const m = (c, i) => D.CH[c].missions[i];
  // printing the expected output without using the structure
  assert.notEqual(check(m(0, 0), 'const staff = [1,2,3];\nprint(3);'), true);
  assert.notEqual(check(m(0, 1), 'print("red");print("gold");'), true);
  assert.notEqual(check(m(2, 2), 'function hotPotato(n) { return n[0]; }'), true);
  assert.notEqual(check(m(3, 3), 'function reverse(h) { return h; }'), true);
  assert.notEqual(check(m(4, 2), 'function countWords(t) { return new Map(t.split(" ").map(w => [w, 1])); }'), true);
  assert.notEqual(check(m(5, 2), 'function insert(r, v) { return { value: v, left: null, right: null }; }'), true);
  assert.notEqual(check(m(5, 4), 'function contains(r, v) { return true; }'), true);
  assert.notEqual(check(m(5, 1), 'function height(n) { return n ? 1 : 0; }'), true);
});

test('too-slow answers get a hint about speed, not just "wrong"', () => {
  const slow = 'function twoSum(nums, t) {\n  for (let i = 0; i < nums.length; i++) {\n    for (let j = i + 1; j < nums.length; j++) {\n      if (nums[i] + nums[j] === t) return [i, j];\n    }\n  }\n  return null;\n}';
  const r = check(D.CH[4].missions[4], slow);
  assert.match(String(r), /too slow/);
});

test('endless loops stop with an error', () => {
  const res = D.run('while (true) {}');
  assert.equal(res.error.type, 'EndlessLoop');
});

test('errors report the learner\'s line number', () => {
  assert.equal(D.run('const a = 1;\nprint(a);\nnull.x;').error.line, 3);
});

test('quick-fire: each question has a real answer that differs from its wrong options', () => {
  for (const q of D.QF) {
    const res = D.run(q.c);
    assert.equal(res.error, null, q.c);
    const ans = res.out;
    assert.ok(ans.length > 0, q.c);
    assert.ok(q.w.length >= 3 && !q.w.includes(ans), `wrong options for: ${q.c} (answer ${ans})`);
  }
});

test('field guide: every example runs', () => {
  for (const g of D.GUIDE) for (const [code] of g.ex) assert.equal(D.run(code).error, null, g.c + ': ' + code);
});

test('ranks can be reached with the XP on offer', () => {
  const missions = D.CH.reduce((n, c) => n + c.missions.length, 0);
  assert.ok(10 * missions + 25 * D.CH.length >= D.RANKS.at(-1)[0]);
});

// Mirrors FIRST in teach.test.mjs (term -> [regex, chapter, mission]), plus peek (taught at 1.1).
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
  peek:        [/\bpeek\b/i, 1, 1],
};

// Missions already in their final shape; each batch of the Data Structures visual rework adds its ids.
const CONVERTED = ['0.0', '0.1', '0.2', '0.3', '0.4', '1.0', '1.1', '1.2', '1.3'];

// What a converted mission is missing, as messages (empty when it is whole).
const convertedProblems = m => {
  const out = [];
  if (!m.visual) out.push('no visual');
  if (!Array.isArray(m.how) || !m.how.length) out.push('how is empty');
  if (!m.practice && !m.scriptStep) out.push('neither practice nor scriptStep');
  if (m.practice) for (const k of ['starter', 'answer', 'check']) if (m[k] !== undefined) out.push(`practice mission still has a legacy ${k}`);
  if (m.scriptStep) for (const k of ['starter', 'answer', 'check']) if (m[k] === undefined) out.push(`scriptStep mission lost its ${k}`);
  return out;
};

test('the converted rule bites: no visual, an empty how and a legacy check on a practice mission are all rejected', () => {
  const whole = { visual: {}, how: ['a'], scriptStep: true, starter: 's', answer: 'a', check: () => true };
  assert.deepEqual(convertedProblems(whole), []);
  assert.deepEqual(convertedProblems({ ...whole, visual: undefined }), ['no visual']);
  assert.deepEqual(convertedProblems({ ...whole, how: [] }), ['how is empty']);
  assert.deepEqual(convertedProblems({ visual: {}, how: ['a'], practice: {}, check: () => true }), ['practice mission still has a legacy check']);
  assert.deepEqual(convertedProblems({ ...whole, check: undefined }), ['scriptStep mission lost its check']);
});

test('converted missions are whole and teach nothing before their mission', () => {
  for (const cm of CONVERTED) {
    const [ci, mi] = cm.split('.').map(Number), m = D.CH[ci].missions[mi];
    assert.deepEqual(convertedProblems(m), [], `${cm}: ${m.title}`);
    const v = m.visual;
    const texts = [v.task, ...(v.pauses || []).map(p => p.ask), ...(v.buttons || []).map(b => b.label), ...m.how];
    for (const [term, [re, c, n]] of Object.entries(FIRST)) {
      if (c < ci || (c === ci && n <= mi)) continue;
      for (const t of texts) assert.ok(!re.test(t), `${cm}: "${term}" is taught at ${c}.${n}, but appears in: ${t}`);
    }
  }
});

// The page escapes pause asks, pause choices and button labels (app.js), so a tag or entity would show as text.
test('converted missions hold no HTML in the visual fields the page escapes', () => {
  for (const cm of CONVERTED) {
    const [ci, mi] = cm.split('.').map(Number), v = D.CH[ci].missions[mi].visual;
    const escaped = [...(v.pauses || []).flatMap(p => [p.ask, ...p.choices]), ...(v.buttons || []).map(b => b.label)].map(String);
    for (const t of escaped) assert.ok(!/<\/?[a-z][^>]*>|&[#a-z0-9]+;/i.test(t), `${cm}: markup in an escaped field: ${t}`);
  }
});

test('0.0 to 0.2 keep their script step: scriptStep, legacy fields, no practice block', () => {
  for (const mi of [0, 1, 2]) {
    const m = D.CH[0].missions[mi];
    assert.equal(m.scriptStep, true, `0.${mi}`);
    assert.equal(m.practice, undefined, `0.${mi}`);
    assert.ok(m.how.length >= 3 && m.how.length <= 5, `0.${mi}: how has 3 to 5 steps`);
  }
});

test('1.1 peek(items): ints to ints, the want is [top, size], and every lazy answer takes the top with pop', () => {
  const b = D.CH[1].missions[1].practice;
  assert.equal(JSON.stringify(b.fn.sig), JSON.stringify({ args: [['items', 'ints']], ret: 'ints' }));
  assert.equal(b.nothing, -1);
  for (const t of b.fn.tests) {
    const items = t.args[0];
    assert.equal(t.want.length, 2);
    assert.equal(t.want[1], items.length);
    assert.equal(t.want[0], items.length ? items[items.length - 1] : -1);
  }
  const langs = Object.keys(b.langs);
  assert.equal(langs.sort().join(), 'cpp,js,py,rs');
  for (const l of langs) assert.match(b.langs[l].lazy, /\bpop(_back)?\b/, `1.1 lazy in ${l}`);
});

test('the chapter 0 intro says missions 0.0 to 0.2 use JavaScript and that the language is picked from 0.3', () => {
  assert.match(D.CH[0].intro, /first three missions/);
  assert.match(D.CH[0].intro, /JavaScript/);
  assert.match(D.CH[0].intro, /0\.3/);
});

test('every chapter has a badge, an intro, and anatomy tokens use known kinds', () => {
  for (const ch of D.CH) { assert.ok(ch.badge && ch.intro && ch.learned.length); for (const m of ch.missions) for (const [, k] of m.anat || []) assert.ok(['fn', 'str', 'num', 'var', 'kw', 'op', 'br', 'cm'].includes(k)); }
});
