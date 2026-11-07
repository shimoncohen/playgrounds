import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scope, plan } from '../../tools/ci-plan.mjs';

const repo = { all: ['cpp', 'ds', 'net', 'shell'], withTests: ['cpp', 'net', 'shell'] };
const names = jobs => jobs.map(j => j.name);

test('docs-only changes run no test job', () => {
  assert.deepEqual(plan(['docs/a.md', 'README.md', '.claude/skills/x/SKILL.md', '.github/ISSUE_TEMPLATE/bug.yml'], repo), []);
});

test('quest folders and their test folders select that quest', () => {
  assert.deepEqual(scope(['programming/net-quest/app.js', 'tests/cpp/teach.test.mjs', 'docs/x.md']), ['cpp', 'net']);
  assert.deepEqual(scope(['math/track.js', 'math/geometry/content.js']), ['math']);
});

test('shared code, tools, fixtures, config and unknown files select everything', () => {
  for (const f of ['shared/how.js', 'index.html', 'programming/index.html', 'tools/build.py', 'tests/fixtures/shell-corpus.json', 'tests/smoke.mjs', 'tests/tools/x.test.mjs', 'package.json', '.github/workflows/ci.yml', 'commitlint.config.mjs', 'tests/trophy/trophies.test.mjs', 'trophy-room/app.js'])
    assert.equal(scope(['programming/net-quest/app.js', f]), null, f);
});

test('a non-shell quest skips the other quests and every shell-only job, and re-checks the catalog', () => {
  const jobs = plan(['programming/net-quest/app.js'], repo);
  assert.deepEqual(names(jobs), ['engine tests (net, catalog)', 'browser smoke tests (net)']);
  assert.deepEqual(jobs[0].args, ['--test', 'tests/net/*.test.mjs', 'tests/trophy/catalog.test.mjs']);
  assert.deepEqual(jobs[1].args, ['--test-skip-pattern=^(cpp|ds|shell)[- ]', 'tests/smoke.mjs']);
});

test('a quest without an engine test folder gets the catalog check and the browser job', () => {
  const jobs = plan(['programming/ds-quest/app.js'], repo);
  assert.deepEqual(names(jobs), ['engine tests (catalog)', 'browser smoke tests (ds)']);
  assert.deepEqual(jobs[0].args, ['--test', 'tests/trophy/catalog.test.mjs']);
});

test('shell changes add the full course and golden jobs, and the smoke job leaves the course to them', () => {
  const jobs = plan(['programming/shell-quest/engine/interp.js'], repo);
  assert.deepEqual(names(jobs), ['engine tests (shell, catalog)', 'browser smoke tests (shell)', 'shell-quest full course', 'shell-quest golden']);
  assert.deepEqual(jobs[1].args, ['--test-skip-pattern=^(cpp|ds|net)[- ]', '--test-skip-pattern=^shell-quest full course', 'tests/smoke.mjs']);
  assert.deepEqual(jobs[2].args, ['--test-name-pattern=^shell-quest full course', 'tests/smoke.mjs']);
});

test('--all runs every suite, split so the course runs once', () => {
  const jobs = plan(null, repo);
  assert.deepEqual(names(jobs), ['engine tests', 'browser smoke tests', 'shell-quest full course', 'shell-quest golden']);
  assert.deepEqual(jobs[0].args, ['--run', 'test:engine']);
  assert.deepEqual(jobs[1].args, ['--test-skip-pattern=^shell-quest full course', 'tests/smoke.mjs']);
});

test('a quest with browser suites in its test folder gets a job that runs them, on its own changes and on --all', () => {
  const withMath = { all: ['math', 'net'], withTests: ['math', 'net'], browser: { math: ['tests/math/a.browser.mjs', 'tests/math/b.browser.mjs'] } };
  const job = plan(['math/track.js'], withMath).find(j => j.name === 'math browser tests');
  assert.deepEqual(job, { name: 'math browser tests', args: ['--test', 'tests/math/a.browser.mjs', 'tests/math/b.browser.mjs'], browser: true });
  assert.ok(names(plan(null, withMath)).includes('math browser tests'));
  assert.ok(!names(plan(['programming/net-quest/app.js'], withMath)).includes('math browser tests'));
});

test('the smoke skip pattern catches every way a quest names its tests, and nothing shared', () => {
  const [skip] = plan(['programming/net-quest/app.js'], { all: ['math', 'net', 'shell'], withTests: [] }).at(-1).args;
  const re = new RegExp(skip.replace('--test-skip-pattern=', ''));
  for (const n of ['shell-quest loads cleanly', 'math hub loads cleanly', 'math-algebra: missions open their scene', 'math-arithmetic loads cleanly']) assert.match(n, re, n);
  for (const n of ['net-quest loads cleanly', 'landing page sums Math XP', 'theme button cycles auto, light, dark', 'mathematics']) assert.doesNotMatch(n, re, n);
});
