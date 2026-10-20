// Data Structures Quest: every mission is solvable by its own answer, and its check is not fooled by the starter or by a lazy answer.
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
const check = (m, src) => { const res = D.run(src); return res.error ? { err: res.error } : m.check(D.makeCtx(src, res)); };

for (const [ci, ch] of D.CH.entries()) {
  for (const [mi, m] of ch.missions.entries()) {
    const id = `${ci}.${mi} ${m.title}`;
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
  assert.notEqual(check(m(0, 0), 'const crew = [1,2,3];\nprint(3);'), true);
  assert.notEqual(check(m(0, 1), 'print("red");print("gold");'), true);
  assert.notEqual(check(m(1, 1), 'const stack = [10, 20, 30];\nprint(stack.pop());\nprint(30);\nprint(3);'), true);
  assert.notEqual(check(m(1, 3), 'function balanced(t) { return true; }'), true);
  assert.notEqual(check(m(1, 3), 'function balanced(t) { return t.length % 2 === 0; }'), true);
  assert.notEqual(check(m(0, 4), 'function largest(n) { let b = 0; for (const x of n) if (x > b) b = x; return b; }'), true);
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

test('every chapter has a badge, an intro, and anatomy tokens use known kinds', () => {
  for (const ch of D.CH) { assert.ok(ch.badge && ch.intro && ch.learned.length); for (const m of ch.missions) for (const [, k] of m.anat || []) assert.ok(['fn', 'str', 'num', 'var', 'kw', 'op', 'br', 'cm'].includes(k)); }
});
