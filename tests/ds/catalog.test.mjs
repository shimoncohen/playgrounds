// Every catalog entry names its practice language, and each language has a runner or a PENDING row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (file, sandbox) => vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
const catSandbox = vm.createContext({});
run('shared/catalog.js', catSandbox);
const pracSandbox = vm.createContext({});
run('programming/ds-quest/practice.js', pracSandbox);
// Arrays from another vm realm fail deepStrictEqual on their prototype, so compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
const { QUESTS, SUBJECTS } = plain(catSandbox.Catalog);
const { RUNNERS, PENDING } = pracSandbox.DSQ.practice;

const ALLOWED = ['js', 'py', 'cpp', 'rs', 'ts', null];
const EXPECTED = {
  'script-quest-v1': 'js', 'python-quest-v1': 'py', 'cpp-quest-v1': 'cpp', 'rust-quest-v1': 'rs',
  'typescript-quest-v1': null, 'shell-quest-v1': null, 'harbor-quest-v1': null, 'ds-quest-v1': null,
  'net-quest-v1': null, 'agent-quest-v1': null, 'math-arithmetic-v1': null, 'math-algebra-v1': null,
  'math-geometry-v1': null, 'math-trigonometry-v1': null,
};
const covered = (entry, registry, rows) =>
  entry.lang === null || Object.hasOwn(registry, entry.lang) || rows.some((r) => r.lang === entry.lang);

test('every entry has a lang in the allowed set, with the expected value', () => {
  assert.deepEqual(QUESTS.map((q) => q.key).sort(), Object.keys(EXPECTED).sort());
  for (const q of QUESTS) {
    assert.ok(Object.hasOwn(q, 'lang') && ALLOWED.includes(q.lang), `${q.key}: bad lang ${JSON.stringify(q.lang)}`);
    assert.equal(q.lang, EXPECTED[q.key], q.key);
  }
});

test('every non-null lang has a runner or a covering PENDING row', () => {
  for (const q of QUESTS) assert.ok(covered(q, RUNNERS, PENDING), `${q.key}: lang ${q.lang} has no runner and no PENDING row`);
});

test('the coverage lookup bites on a fixture', () => {
  const fake = { key: 'ts-fake', lang: 'ts' };
  assert.equal(covered(fake, RUNNERS, []), false);
  assert.equal(covered(fake, RUNNERS, [{ mission: '*', lang: 'ts', issue: 1 }]), true);
});

test('lang is not a subject field', () => {
  for (const s of SUBJECTS) assert.ok(!Object.hasOwn(s, 'lang'), s.id);
});
