// Data Structures Quest known gaps (PENDING rows) and the script-step ordering guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngines } from './practice-engines.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const D = loadEngines().DSQ;
// Arrays from another vm realm fail deepStrictEqual on their prototype, so compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
const P = { ...D.practice, stalePending: (...a) => plain(D.practice.stalePending(...a)) };
const ids = D.CH.flatMap((ch, ci) => ch.missions.map((_, mi) => `${ci}.${mi}`));
const practiceIds = D.CH.flatMap((ch, ci) => ch.missions.flatMap((m, mi) => (m.practice ? [`${ci}.${mi}`] : [])));

const FN_MISSION = [0, 3]; // chapter, mission where `function` is first taught
const scriptStepsBefore = (CH, [fc, fm]) =>
  [...CH].flatMap((ch, ci) => ch.missions.flatMap((m, mi) => (m.scriptStep && (ci > fc || (ci === fc && mi >= fm)) ? [`${ci}.${mi}`] : [])));

const passesIn = (CH) => (id, lang) => {
  const [ci, mi] = id.split('.').map(Number);
  return D.practice.refPasses(CH[ci].missions[mi].practice, lang);
};

test('PENDING is empty and every row is valid and not stale', () => {
  assert.equal(P.PENDING.length, 0);
  for (const r of P.PENDING) assert.doesNotThrow(() => P.checkPendingRow(r, ids));
  assert.deepEqual(P.stalePending(P.PENDING, passesIn(D.CH), practiceIds), []);
});

const FIXTURE = [{ missions: [{ title: 'fixture', practice: {
  fn: { name: 'addUp', sig: { args: [['a', 'int'], ['b', 'int']], ret: 'int' }, tests: [{ args: [1, 2], want: 3 }, { args: [-4, 4], want: 0 }] },
  langs: {
    py: { answer: 'def add_up(a, b):\n    return a + b' },
    cpp: { answer: '#include <iostream>\nusing namespace std;\nint addUp(int a, int b) { return a - b; }' },
    rs: { answer: 'fn add_up(a: i32, b: i32) -> i32 { a + b }' },
  },
} }] }];

test('stale rows: a row whose pair now passes in the real runner is reported, one that still fails is not', () => {
  const passes = passesIn(FIXTURE);
  const rows = {
    pyExact: { mission: '0.0', lang: 'py', issue: 309 },
    pyStar: { mission: '*', lang: 'py', issue: 309 },
    rsExact: { mission: '0.0', lang: 'rs', issue: 311 },
    cppExact: { mission: '0.0', lang: 'cpp', issue: 310 },
    cppStar: { mission: '*', lang: 'cpp', issue: 310 },
    jsExact: { mission: '0.0', lang: 'js', issue: 309 },
  };
  assert.equal(passes('0.0', 'py'), true);
  assert.equal(passes('0.0', 'cpp'), false);
  assert.equal(passes('0.0', 'js'), false, 'no answer for a language is not a pass');
  const stale = (...rs) => P.stalePending(rs, passes, ['0.0']);
  assert.deepEqual(stale(rows.pyExact, rows.pyStar, rows.rsExact), [rows.pyExact, rows.pyStar, rows.rsExact]);
  assert.deepEqual(stale(rows.cppExact, rows.cppStar, rows.jsExact), []);
  assert.deepEqual(stale(rows.cppExact, rows.pyExact), [rows.pyExact]);
});

test('checkPendingRow rejects bad rows', () => {
  const bad = [
    [{ mission: '99.9', lang: 'py', issue: 1 }, /unknown mission/],
    [{ mission: '0.0', lang: 'go', issue: 1 }, /not a runner language/],
    [{ mission: '0.0', lang: 'ts', issue: 1 }, /not a runner language/],
    [{ mission: '0.0', lang: 'py', issue: 0 }, /positive integer/],
    [{ mission: '0.0', lang: 'py', issue: -3 }, /positive integer/],
    [{ mission: '0.0', lang: 'py', issue: 1.5 }, /positive integer/],
    [{ mission: '0.0', lang: 'py', issue: '12' }, /positive integer/],
    [null, /object/],
  ];
  for (const [row, re] of bad) assert.throws(() => P.checkPendingRow(row, ids), re, JSON.stringify(row));
  assert.doesNotThrow(() => P.checkPendingRow({ mission: '0.0', lang: 'rs', issue: 7 }, ids));
  assert.doesNotThrow(() => P.checkPendingRow({ mission: '*', lang: 'cpp', issue: 7 }, ids));
});

test('stalePending flags rows the runner now passes', () => {
  const exact = { mission: '1.2', lang: 'py', issue: 5 };
  const star = { mission: '*', lang: 'py', issue: 6 };
  const pids = ['1.2', '2.0'];
  assert.deepEqual(P.stalePending([exact], (m, l) => m === '1.2' && l === 'py'), [exact]);
  assert.deepEqual(P.stalePending([exact], () => false), []);
  assert.deepEqual(P.stalePending([star], () => true, pids), [star]);
  assert.deepEqual(P.stalePending([star], (m) => m === '1.2', pids), []);
  assert.deepEqual(P.stalePending([star], () => true, []), []);
  assert.deepEqual(P.stalePending([exact], (m, l) => l === 'js'), []);
});

test('no scriptStep mission sits at or after the mission that teaches function', () => {
  assert.deepEqual(scriptStepsBefore(D.CH, FN_MISSION), []);
  const fixture = [{ missions: [{}, {}, {}, { scriptStep: true }] }];
  assert.deepEqual(scriptStepsBefore(fixture, FN_MISSION), ['0.3']);
  assert.deepEqual(scriptStepsBefore([{ missions: [{}, {}, { scriptStep: true }, {}] }], FN_MISSION), []);
  assert.deepEqual(scriptStepsBefore([{ missions: [{}] }, { missions: [{ scriptStep: true }] }], FN_MISSION), ['1.0']);
});

test('teach.test.mjs still teaches function at chapter 0, mission 3', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tests', 'ds', 'teach.test.mjs'), 'utf8');
  const m = src.match(/^\s*function\s*:\s*\[[^\]]*,\s*(\d+)\s*,\s*(\d+)\s*\]/m);
  assert.ok(m, 'no function entry found in the FIRST table of teach.test.mjs');
  assert.deepEqual([Number(m[1]), Number(m[2])], FN_MISSION);
});
