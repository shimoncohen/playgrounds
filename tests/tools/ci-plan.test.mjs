import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scope, plan } from '../../tools/ci-plan.mjs';

const repo = { all: ['cpp', 'ds', 'net', 'shell'], withTests: ['cpp', 'net', 'shell'] };
const names = jobs => jobs.map(j => j.name);

test('docs-only changes run no test job', () => {
  assert.deepEqual(plan(['docs/a.md', 'README.md', '.claude/skills/x/SKILL.md', '.github/ISSUE_TEMPLATE/bug.yml'], repo), []);
});

test('quest folders and their test folders select that quest', () => {
  assert.deepEqual(scope(['net-quest/app.js', 'tests/cpp/teach.test.mjs', 'docs/x.md']), ['cpp', 'net']);
});

test('shared code, tools, fixtures, config and unknown files select everything', () => {
  for (const f of ['shared/how.js', 'index.html', 'tools/build.py', 'tests/fixtures/shell-corpus.json', 'tests/smoke.mjs', 'tests/tools/x.test.mjs', 'package.json', '.github/workflows/ci.yml', 'commitlint.config.mjs'])
    assert.equal(scope(['net-quest/app.js', f]), null, f);
});

test('a non-shell quest skips the other quests and every shell-only job', () => {
  const jobs = plan(['net-quest/app.js'], repo);
  assert.deepEqual(names(jobs), ['engine tests (net)', 'browser smoke tests (net)']);
  assert.deepEqual(jobs[0].args, ['--test', 'tests/net/*.test.mjs']);
  assert.deepEqual(jobs[1].args, ['--test-skip-pattern=^(cpp|ds|shell)-quest\\b', 'tests/smoke.mjs']);
});

test('a quest without an engine test folder gets only the browser job', () => {
  assert.deepEqual(names(plan(['ds-quest/app.js'], repo)), ['browser smoke tests (ds)']);
});

test('shell changes add the full course and golden jobs, and the smoke job leaves the course to them', () => {
  const jobs = plan(['shell-quest/engine/interp.js'], repo);
  assert.deepEqual(names(jobs), ['engine tests (shell)', 'browser smoke tests (shell)', 'shell-quest full course', 'shell-quest golden']);
  assert.deepEqual(jobs[1].args, ['--test-skip-pattern=^(cpp|ds|net)-quest\\b', '--test-skip-pattern=^shell-quest full course', 'tests/smoke.mjs']);
  assert.deepEqual(jobs[2].args, ['--test-name-pattern=^shell-quest full course', 'tests/smoke.mjs']);
});

test('--all runs every suite, split so the course runs once', () => {
  const jobs = plan(null, repo);
  assert.deepEqual(names(jobs), ['engine tests', 'browser smoke tests', 'shell-quest full course', 'shell-quest golden']);
  assert.deepEqual(jobs[0].args, ['--run', 'test:engine']);
  assert.deepEqual(jobs[1].args, ['--test-skip-pattern=^shell-quest full course', 'tests/smoke.mjs']);
});
