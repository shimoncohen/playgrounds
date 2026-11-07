import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sandbox = {};
vm.createContext(sandbox);
for (const f of ['shared/catalog.js', 'shared/trophies.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
const T = sandbox.Trophies;
const plain = x => JSON.parse(JSON.stringify(x));

const SUBJECTS = [{ id: 'programming', name: 'Programming', href: 'programming/', unit: 'quests', icon: '💻' }, { id: 'math', name: 'Math', href: 'math/', unit: 'tracks', icon: '📐' }];
const Q = (key, subject, missions, sep = '.') => ({ key, name: key, subject, href: key + '/', sep, missions });
const store = data => ({ getItem: k => (k in data ? (typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k])) : null) });
const st = (subject, o = {}) => ({ subject, missionsDone: 0, chaptersDone: 0, started: false, complete: false, ...o });
const ach = (stats, id) => plain(T.achievements(stats, SUBJECTS)).find(a => a.id === id);

test('stats count done missions with either separator and a 1 or true value', () => {
  const dot = plain(T.questStats(Q('a', 'math', [2, 1]), { xp: 30, done: { '0.0': 1, '0.1': true, '1.0': false } }));
  assert.equal(dot.missionsDone, 2);
  assert.equal(dot.chaptersDone, 1);
  assert.equal(dot.started, true);
  assert.equal(dot.complete, false);
  assert.equal(dot.xp, 30);
  const dash = plain(T.questStats(Q('b', 'math', [1], '-'), { done: { '0-0': 1 } }));
  assert.equal(dash.complete, true);
  assert.equal(dash.chaptersTotal, 1);
});

test('stats ignore junk, out-of-range, padded and wrong-separator keys', () => {
  const s = plain(T.questStats(Q('a', 'math', [2]), { done: { '5.0': 1, '0.9': 1, 'a.b': 1, '00.0': 1, '0.0.0': 1, '0-0': 1, '-1.0': 1, ...JSON.parse('{"__proto__": 1}') } }));
  assert.equal(s.missionsDone, 0);
  assert.equal(s.started, false);
});

test('stats take xp only when it is a finite number of at least 0', () => {
  for (const xp of [NaN, -5, '10', Infinity, null]) assert.equal(T.questStats(Q('a', 'math', [1]), { xp }).xp, 0, String(xp));
  assert.equal(T.questStats(Q('a', 'math', [1]), null).missionsDone, 0);
});

test('a missing, broken or blocked save reads as no save', () => {
  const q = Q('a', 'math', [1]);
  assert.equal(T.readSave(store({}), q), null);
  assert.equal(T.readSave(store({ a: '{not json' }), q), null);
  assert.equal(T.readSave(store({ a: '[1]' }), q), null);
  assert.equal(T.readSave({ getItem() { throw new Error('blocked'); } }, q), null);
  assert.equal(T.readSave(null, q), null);
  assert.deepEqual(plain(T.readSave(store({ a: { xp: 1 } }), q)), { xp: 1 });
});

test('a Harbor save without v:1, d and k reads as no save, as Harbor itself treats it', () => {
  const q = Q('harbor-quest-v1', 'programming', [1]);
  assert.equal(T.readSave(store({ 'harbor-quest-v1': { xp: 10, done: { '0.0': 1 } } }), q), null);
  assert.equal(T.readSave(store({ 'harbor-quest-v1': { v: 1, d: {}, k: {}, xp: 10 } }), q).xp, 10);
});

test('level n starts at 20·(n-1)² XP, with a title every 5 levels', () => {
  const at = xp => plain(T.level(xp));
  assert.deepEqual(at(0), { n: 1, title: 'Visitor', lo: 0, hi: 20 });
  assert.equal(at(19).n, 1);
  assert.equal(at(20).n, 2);
  assert.equal(at(79).n, 2);
  assert.equal(at(80).n, 3);
  assert.equal(at(319).title, 'Visitor');
  assert.deepEqual(at(320), { n: 5, title: 'Explorer', lo: 320, hi: 500 });
  assert.equal(at(1620).title, 'Regular');
  assert.equal(at(3920).title, 'Veteran');
  assert.deepEqual(at(7220), { n: 20, title: 'Legend', lo: 7220, hi: 8000 });
  assert.equal(at(-5).n, 1);
});

test('First Steps needs one mission anywhere', () => {
  assert.equal(ach([st('math')], 'first-steps').earned, false);
  assert.equal(ach([st('math', { missionsDone: 1, started: true })], 'first-steps').earned, true);
});

test('Curious needs 3 playgrounds started and shows how close you are', () => {
  const two = [st('math', { started: true }), st('math', { started: true }), st('math')];
  assert.deepEqual(ach(two, 'curious').progress, { have: 2, need: 3 });
  assert.equal(ach(two, 'curious').earned, false);
  const three = [st('math', { started: true }), st('math', { started: true }), st('programming', { started: true })];
  assert.equal(ach(three, 'curious').earned, true);
  assert.equal(ach(three, 'curious').progress, undefined);
});

test('Wanderer needs every playground started', () => {
  assert.equal(ach([st('math', { started: true }), st('math')], 'wanderer').earned, false);
  assert.equal(ach([st('math', { started: true }), st('math', { started: true })], 'wanderer').earned, true);
});

test('Chapter Chaser wins bronze at 10, silver at 25 and gold at 50 chapters', () => {
  const at = n => ach([st('math', { chaptersDone: n })], 'chapter-chaser');
  assert.equal(at(9).earned, false);
  assert.deepEqual(at(9).progress, { have: 9, need: 10 });
  assert.equal(at(10).earned, true);
  assert.equal(at(10).name, 'Chapter Chaser (bronze)');
  assert.deepEqual(at(10).progress, { have: 10, need: 25 });
  assert.equal(at(25).name, 'Chapter Chaser (silver)');
  assert.equal(at(50).name, 'Chapter Chaser (gold)');
  assert.equal(at(50).progress, undefined);
});

test('Finisher needs one playground complete', () => {
  assert.equal(ach([st('math', { complete: false })], 'finisher').earned, false);
  assert.equal(ach([st('math', { complete: true })], 'finisher').earned, true);
});

test('Playground Master is per subject and needs every playground in it complete', () => {
  const stats = [st('programming', { complete: true }), st('programming', { complete: true }), st('math', { complete: true }), st('math')];
  assert.equal(ach(stats, 'master-programming').earned, true);
  assert.equal(ach(stats, 'master-programming').name, 'Playground Master: Programming');
  assert.equal(ach(stats, 'master-math').earned, false);
  assert.deepEqual(ach(stats, 'master-math').progress, { have: 1, need: 2 });
  assert.equal(ach([st('programming', { complete: true })], 'master-math').earned, false, 'a subject with no playgrounds is never mastered');
});

test('Polymath needs a chapter in both subjects', () => {
  assert.equal(ach([st('programming', { chaptersDone: 3 }), st('math')], 'polymath').earned, false);
  assert.equal(ach([st('programming', { chaptersDone: 1 }), st('math', { chaptersDone: 1 })], 'polymath').earned, true);
});

test('Grand Master needs every playground complete', () => {
  assert.equal(ach([st('programming', { complete: true }), st('math')], 'grand-master').earned, false);
  assert.equal(ach([st('programming', { complete: true }), st('math', { complete: true })], 'grand-master').earned, true);
});

test('there are nine achievements, in page order', () => {
  assert.deepEqual(plain(T.achievements([st('math')], SUBJECTS)).map(a => a.id),
    ['first-steps', 'curious', 'wanderer', 'chapter-chaser', 'finisher', 'master-programming', 'master-math', 'polymath', 'grand-master']);
});

test('summary sums XP over the real catalog and works out level, subjects and quests', () => {
  const s = plain(T.summary(store({
    'python-quest-v1': { xp: 85, done: { '0.0': 1, '0.1': 1, '0.2': 1, '0.3': 1, '0.4': 1, '0.5': 1 } },
    'math-trigonometry-v1': { xp: 75, done: { '0.0': true, '0.1': true, '0.2': true, '0.3': true, '0.4': true } },
  }), sandbox.Catalog));
  assert.equal(s.xp, 160);
  assert.equal(s.level.n, 3);
  assert.equal(s.quests.length, 13);
  assert.deepEqual(s.subjects.map(x => [x.id, x.started, x.complete, x.chaptersDone]), [['programming', 1, 0, 1], ['math', 1, 1, 1]]);
  assert.deepEqual(s.achievements.filter(a => a.earned).map(a => a.id), ['first-steps', 'finisher', 'polymath']);
});
