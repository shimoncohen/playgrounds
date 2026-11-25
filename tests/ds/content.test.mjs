// Data Structures Quest: every mission is solvable by its own answer, and its check is not fooled by the starter or by a lazy answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngines } from './practice-engines.mjs';

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
  assert.notEqual(check(m(5, 2), 'function insert(r, v) { return { value: v, left: null, right: null }; }'), true);
  assert.notEqual(check(m(5, 4), 'function contains(r, v) { return true; }'), true);
  assert.notEqual(check(m(5, 1), 'function height(n) { return n ? 1 : 0; }'), true);
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

const CONVERTED = ['0.0', '0.1', '0.2', '0.3', '0.4', '1.0', '1.1', '1.2', '1.3', '2.0', '2.1', '2.2', '3.0', '3.1', '3.2', '3.3', '4.0', '4.1', '4.2', '4.3', '4.4'];

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

test('the 1.0 and 1.1 goals name their function, and the 1.2 explain gives the -1 rule', () => {
  for (const mi of [0, 1]) {
    const m = D.CH[1].missions[mi];
    assert.ok(m.goal.includes(`<code>${m.practice.fn.name}(`), `1.${mi}: goal names ${m.practice.fn.name}`);
  }
  assert.ok(D.CH[1].missions[1].goal.includes('<code>[-1, 0]</code>'), '1.1: goal gives [-1, 0] for an empty stack');
  const b = D.CH[1].missions[2];
  assert.equal(b.practice.nothing, -1);
  assert.match(b.explain, /<code>-1<\/code>/);
  assert.doesNotMatch(b.explain, /give back <code>undefined<\/code>/);
});

test('the 2.0 goal names serveFirst(names) and the 2.1 explain gives -1, not undefined', () => {
  const g = D.CH[2].missions[0];
  assert.ok(g.goal.includes(`<code>${g.practice.fn.name}(names)</code>`));
  assert.match(g.goal, /<code>shift<\/code>/);
  const q = D.CH[2].missions[1];
  assert.equal(q.practice.nothing, -1);
  assert.match(q.explain, /should return <code>-1<\/code>/);
  assert.doesNotMatch(q.explain, /give back <code>undefined<\/code>/);
});

test('2.0 and 2.2: each want is recomputed from the input alone', () => {
  for (const t of D.CH[2].missions[0].practice.fn.tests) assert.deepEqual(t.want, t.args[0].slice(1));
  const potato = (names, n) => { const q = [...names]; let i = 0; while (q.length > 1) { i = (i + n) % q.length; q.splice(i, 1); } return q[0]; };
  for (const t of D.CH[2].missions[2].practice.fn.tests) assert.equal(t.want, potato(...t.args));
});

test('the 3.0 goal names linkThree(a, b, c), gives an example and keeps the null definition', () => {
  const m = D.CH[3].missions[0];
  assert.equal(m.practice.fn.name, 'linkThree');
  assert.ok(m.goal.includes(`<code>${m.practice.fn.name}(a, b, c)</code>`));
  assert.ok(m.goal.includes('<code>linkThree(1, 2, 3)</code>'));
  assert.match(m.goal, /null<\/code> means/);
});

test('3.0, 3.1 and 3.3: each want is recomputed from the input alone', () => {
  for (const t of D.CH[3].missions[0].practice.fn.tests) assert.deepEqual(t.want, t.args);
  for (const t of D.CH[3].missions[1].practice.fn.tests) assert.equal(t.want, t.args[0].length);
  for (const t of D.CH[3].missions[3].practice.fn.tests) assert.equal(JSON.stringify(t.want), JSON.stringify([...t.args[0]].reverse()));
});

const P4 = loadEngines({ content: false }).DSQ.practice;
const plain = v => JSON.parse(JSON.stringify(v));
const expanded = b => plain(b).fn.tests.map(c => plain(P4.expandCase(c, P4.EXPANDERS, b.fn.sig, b.nothing)));

test('the 4.x goals name their function; 4.0 gives -1 in its goal and explain; 4.3 and 4.4 say neither undefined nor null', () => {
  for (const mi of [0, 1, 2, 3, 4]) {
    const m = D.CH[4].missions[mi];
    assert.ok(m.goal.includes(`<code>${m.practice.fn.name}(`), `4.${mi}: goal names ${m.practice.fn.name}`);
  }
  const m = D.CH[4].missions[0];
  assert.ok(m.goal.includes('<code>lookupAll(keys, vals, queries)</code>'));
  assert.ok(m.goal.includes('<code>lookupAll([1, 2], [30, 70], [2, 9, 1])</code>'));
  assert.ok(m.goal.includes('<code>-1</code>'));
  assert.match(m.explain, /<code>-1<\/code>/);
  assert.ok(D.CH[4].missions[1].goal.includes('<code>countDistinct([3, 5, 3])</code>'));
  assert.ok(D.CH[4].missions[2].goal.includes('<code>countWords("the key the lock the key")</code>'));
  assert.match(D.CH[4].missions[2].explain, /first-seen order/);
  for (const mi of [3, 4]) assert.doesNotMatch(D.CH[4].missions[mi].goal, /undefined|null/, `4.${mi}`);
  assert.ok(D.CH[4].missions[3].goal.includes('<code>-1</code>'));
  assert.ok(D.CH[4].missions[4].goal.includes('<code>[]</code>'));
});

test('4.0 to 4.4: each want is recomputed from the input alone, generated cases included', () => {
  const lookupAll = ([keys, vals, queries]) => { const m = new Map(); keys.forEach((k, i) => m.set(k, vals[i])); return queries.map(q => (m.has(q) ? m.get(q) : -1)); };
  const countWords = ([text]) => {
    if (text === '') return [];
    const counts = new Map();
    for (const w of text.toLowerCase().split(' ')) counts.set(w, (counts.get(w) || 0) + 1);
    return [...counts].map(([w, c]) => `${w} ${c}`);
  };
  const firstRepeat = ([items]) => { const seen = new Set(); for (const x of items) { if (seen.has(x)) return x; seen.add(x); } return -1; };
  // Brute force, and at most one pair may match, so every want is unambiguous.
  const twoSum = ([nums, target]) => {
    const pairs = [];
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === target) pairs.push([i, j]);
    assert.ok(pairs.length <= 1, `twoSum: ${pairs.length} pairs for target ${target}`);
    return pairs[0] || [];
  };
  for (const [mi, f] of [[0, lookupAll], [1, ([items]) => new Set(items).size], [2, countWords], [3, firstRepeat], [4, twoSum]]) {
    const cases = expanded(D.CH[4].missions[mi].practice);
    assert.ok(cases.length >= 5, `4.${mi}: cases`);
    for (const c of cases) assert.deepEqual(c.want, f(c.args), `4.${mi}: ${JSON.stringify(c.args).slice(0, 60)}`);
  }
});

// A generated size below the floor would let a nested scan fit the step limit.
test('4.0, 4.1, 4.3 and 4.4 speed proof: the lazy answer passes every literal case and reports limit on the generated one', () => {
  for (const [mi, floor] of [[0, 500], [1, 700], [3, 700], [4, 700]]) {
    const id = `4.${mi}`, b = plain(D.CH[4].missions[mi].practice), last = b.fn.tests.at(-1);
    const gens = [...last.args, last.want].filter(e => e && e.gen);
    assert.ok(gens.length > 0, `${id}: the last case is generated`);
    assert.ok(Math.min(...gens.flatMap(e => [e.n, e.q ?? e.n])) >= floor, `${id}: generated size is below ${floor}`);
    for (const lang of ['js', 'py', 'rs']) {
      if (P4.PENDING.some(r => r.mission === id && r.lang === lang)) continue;
      const got = plain(P4.RUNNERS[lang].run(b.langs[lang].lazy, b)).map(r => r.status);
      assert.deepEqual(got, [...b.fn.tests.slice(0, -1).map(() => 'pass'), 'limit'], `${id} ${lang}`);
    }
  }
});

// The learner's starter carries the page's own helpers, so a drifting copy would make the page's run and the starter disagree.
test('3.0, 3.1 and 3.3 ship both list helpers and the do-not-edit line in every language, equal to the page helpers', () => {
  const P = loadEngines({ content: false }).DSQ.practice;
  for (const mi of [0, 1, 3]) {
    const m = D.CH[3].missions[mi];
    for (const lang of ['js', 'py', 'cpp', 'rs']) {
      const L = m.practice.langs[lang];
      for (const key of ['starter', 'answer', 'wrong', 'lazy']) {
        for (const h of ['fromList', 'toList']) assert.ok(L[key].includes(P.HELPERS[lang][h]), `3.${mi} ${lang} ${key}: the ${h} helper text differs from practice.js`);
        assert.ok(L[key].includes('leave them as they are'), `3.${mi} ${lang} ${key}: no do-not-edit line`);
      }
      assert.equal(/index into the nodes table/.test(L.starter), lang === 'cpp' || lang === 'rs', `3.${mi} ${lang}: the index comment belongs to C++ and Rust`);
    }
  }
});

test('the chapter 0 intro says missions 0.0 to 0.2 use JavaScript and that the language is picked from 0.3', () => {
  assert.match(D.CH[0].intro, /first three missions/);
  assert.match(D.CH[0].intro, /JavaScript/);
  assert.match(D.CH[0].intro, /0\.3/);
});

test('every chapter has a badge, an intro, and anatomy tokens use known kinds', () => {
  for (const ch of D.CH) { assert.ok(ch.badge && ch.intro && ch.learned.length); for (const m of ch.missions) for (const [, k] of m.anat || []) assert.ok(['fn', 'str', 'num', 'var', 'kw', 'op', 'br', 'cm'].includes(k)); }
});
