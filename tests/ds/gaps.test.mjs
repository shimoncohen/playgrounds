// Data Structures Quest known gaps (PENDING rows) and the script-step ordering guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'programming', 'ds-quest');
const sandbox = {};
vm.createContext(sandbox);
for (const f of ['engine.js', 'content.js', 'practice.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
const D = sandbox.DSQ;
// Arrays from another vm realm fail deepStrictEqual on their prototype, so compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
const P = { ...D.practice, stalePending: (...a) => plain(D.practice.stalePending(...a)) };
const ids = D.CH.flatMap((ch, ci) => ch.missions.map((_, mi) => `${ci}.${mi}`));
const practiceIds = D.CH.flatMap((ch, ci) => ch.missions.flatMap((m, mi) => (m.practice ? [`${ci}.${mi}`] : [])));

const FN_MISSION = [0, 3]; // chapter, mission where `function` is first taught
const scriptStepsBefore = (CH, [fc, fm]) =>
  [...CH].flatMap((ch, ci) => ch.missions.flatMap((m, mi) => (m.scriptStep && (ci > fc || (ci === fc && mi >= fm)) ? [`${ci}.${mi}`] : [])));

test('PENDING is empty and every row is valid and not stale', () => {
  assert.equal(P.PENDING.length, 0);
  for (const r of P.PENDING) assert.doesNotThrow(() => P.checkPendingRow(r, ids));
  assert.deepEqual(P.stalePending(P.PENDING, () => true, practiceIds), []);
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
