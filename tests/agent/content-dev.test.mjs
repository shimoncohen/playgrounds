import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent } from './harness.mjs';
import { kit, runCases } from './cases.mjs';

const AQ = loadAgent();
const { M, go } = kit(AQ);
const F = (files) => ({ files });
const P = (prompt, files) => ({ prompt, files });
// chapter indexes written so far; the last batch freezes all of 7 to 14
const DEV = [7, 8];
const inDev = (c) => DEV.includes(c);

const CASES = [
  { at: [7, 0],
    pass: ['Constraints: only edit NOTES.md', 'Constraints: only edit NOTES.md\nDone when: read NOTES.md', 'Constraints: only edit NOTES.md\nFiles: src/cart/total.js, NOTES.md'],
    fail: ['Done when: read NOTES.md', 'Constraints: do not edit src/cart/total.js', 'Constraints: only edit src/cart/total.js', 'Constraints: only edit src/', 'Goal: look around', '',
      'Constraints: only edit NOTES.md\nFiles: NOTES.md', F({ 'CLAUDE.md': 'only edit NOTES.md' }), F({ 'CLAUDE.md': 'only edit NOTES.md\nDone when: read NOTES.md' })],
    refused: ['Constraints: only edit ghost.md', 'Constraints: be careful'] },
  { at: [7, 1],
    pass: ['Constraints: max 2 files\nDone when: run npm test', 'Constraints: max 2 files', 'Constraints: max 2 files\nDone when: run npm test\nFiles: src/price.js, src/tax.js'],
    fail: ['Constraints: max 1 files', 'Constraints: max 3 files', 'Constraints: max 3 files\nDone when: run npm test', 'Done when: run npm test', 'Constraints: only edit src/price.js\nDone when: run npm test', '',
      F({ 'CLAUDE.md': 'max 2 files\nDone when: run npm test' }), P('Done when: run npm test', { 'CLAUDE.md': 'max 2 files' })],
    refused: ['Constraints: max 0 files', 'Constraints: max two files'] },
  { at: [7, 2],
    pass: ['Files: NOTES.md, src/cart/total.js\nDone when: run npm test', 'Files: src/cart/total.js, NOTES.md\nDone when: run npm test', 'Files: NOTES.md\nFiles: src/cart/total.js\nDone when: run npm test', P('Files: NOTES.md, src/cart/total.js', { 'CLAUDE.md': 'Done when: run npm test' })],
    fail: ['Files: src/cart/total.js\nDone when: run npm test', 'Done when: run npm test', 'Files: NOTES.md\nDone when: run npm test', 'Files: src/cart/\nDone when: run npm test', 'Files: NOTES.md, src/cart/total.js',
      'Files: NOTES.md, src/cart/\nDone when: run npm test', 'Files: NOTES.md', ''],
    refused: ['Files: src/cart/ghost.js', 'Files: ../x'] },

  { at: [8, 0],
    pass: ['Constraints: only edit src/\nDone when: run npm test', 'Constraints: do not edit tests/\nConstraints: do not edit package.json\nDone when: run npm test', 'Constraints: only edit src/price.js\nDone when: run npm test',
      'Constraints: ask before edit tests/\nConstraints: ask before edit package.json\nDone when: run npm test', P('Constraints: only edit src/', { 'CLAUDE.md': 'Done when: run npm test' })],
    fail: ['Constraints: do not edit tests/\nDone when: run npm test', 'Constraints: do not edit package.json\nDone when: run npm test', 'Done when: run npm test', 'Constraints: only edit src/', 'Constraints: do not edit src/\nDone when: run npm test', '',
      P('Done when: run npm test', { 'CLAUDE.md': 'only edit src/' }), P('Done when: run npm test', { 'CLAUDE.md': 'do not edit tests/\ndo not edit package.json' }), F({ 'CLAUDE.md': 'only edit src/\nDone when: run npm test' }),
      P('Done when: run npm test', { '.claude/permissions.txt': 'deny edit tests/\ndeny edit package.json' })],
    refused: ['Constraints: only edit ghost/\nDone when: run npm test', 'Done when: run ghost'] },
  { at: [8, 1],
    pass: ['Done when: run npm run check', 'Done when: run npm run check\nFiles: src/price.js', 'Constraints: do not edit tests/\nDone when: run npm run check', P('Done when: run npm run check', { 'CLAUDE.md': 'Done when: run npm test' })],
    fail: ['Done when: run npm test', 'Goal: fix the rounding bug', 'Done when: run npm run lint', 'Done when: read README.md', 'Done when: run npm run check\nConstraints: do not edit src/', '',
      F({ 'CLAUDE.md': 'Done when: run npm run check' }), P('Goal: fix the rounding bug', { 'CLAUDE.md': 'Done when: run npm run check' })],
    refused: ['Done when: run ghost', 'Done when: run npm run verify'] },
  { at: [8, 2],
    pass: ['Constraints: do not run git push origin main', 'Constraints: ask before run git push origin main', 'Constraints: do not run git push origin main\nDone when: run npm test'],
    fail: ['Constraints: do not run gh pr create', 'Done when: run npm test', 'Constraints: do not run git push origin fix-rounding', 'Constraints: do not run git push origin main\nConstraints: do not run git push origin fix-rounding',
      'Constraints: do not run git push origin main\nConstraints: do not run gh pr create', 'Constraints: do not run git push origin main\nConstraints: do not edit src/price.js', '',
      F({ 'CLAUDE.md': 'do not run git push origin main' }), F({ '.claude/permissions.txt': 'deny run git push origin main' }), F({ '.claude/hooks.txt': 'before run git push origin main' })],
    refused: ['Constraints: do not run git push', 'Constraints: do not run git push origin dev'] },
];

runCases(AQ, 'chapters 8 to 15: lazy and nearby answers are caught', CASES, (c) => !inDev(c));

describe('dev chapters so far', () => {
  it('have 3 missions each, in tier dev, after the 7 core chapters', () => {
    assert.deepEqual([...DEV.map((c) => AQ.CH[c].missions.length)], DEV.map(() => 3));
    assert.ok(DEV.every((c) => AQ.CH[c].tier === 'dev'));
    assert.ok(AQ.CH.slice(0, 7).every((ch) => ch.tier === 'core'));
  });
  it('the starting setup of every mission fails its own check', () => {
    for (const c of DEV) AQ.CH[c].missions.forEach((m, i) => assert.equal(typeof AQ.runMission(m, {}, { approved: true }), 'string', `[${c}, ${i}]`));
  });
  it('the answer, wrong and lazy inputs and the passing table inputs only edit files their scenario ships', () => {
    const ships = (m, x) => { if (x && typeof x === 'object') for (const p of Object.keys(x.files || {})) assert.ok(Object.prototype.hasOwnProperty.call(AQ.scenarios[m.scenario].vfs, p), `${m.title}: ${p}`); };
    for (const k of CASES) { const m = M(...k.at); [m.answer, m.wrong, m.lazy, ...k.pass].forEach((x) => ships(m, x)); }
  });
});

describe('dev missions that use Plan wait for approval', () => {
  it('a Plan: first answer pauses the run, and approving finishes it', () => {
    for (const c of DEV) AQ.CH[c].missions.forEach((m, i) => {
      if (!AQ.prepare(m, m.answer).prompt.plan) return;
      const r = AQ.evaluate(m, m.answer);
      assert.equal(r.awaiting, true, `[${c}, ${i}]`);
      assert.equal(typeof r.result, 'string');
      assert.equal(AQ.runMission(m, m.answer, { approved: true }), true);
    });
  });
});

describe('dev scenarios are valid', () => {
  const used = [...new Set(DEV.flatMap((c) => AQ.CH[c].missions.map((m) => m.scenario)))];
  it('focus is a subset of explore, and the flags are booleans', () => {
    for (const name of used) {
      const s = AQ.scenarios[name];
      for (const f of s.focus || []) assert.ok((s.explore || []).includes(f), `${name}: ${f}`);
      for (const f of ['unattended', 'connected']) assert.ok(s[f] === undefined || typeof s[f] === 'boolean', `${name}.${f}`);
    }
  });
  it('every correction is idempotent: it fixes once, then has nothing left to fix', () => {
    for (const name of used) {
      const s = AQ.scenarios[name];
      if (!s.correction) continue;
      const v = AQ.vfs.create(s.vfs), fix = s.correction(v, 0);
      if (fix) assert.ok(v.write(fix.target, fix.write), name);
      assert.equal(s.correction(v, 0), null, name);
      const m = DEV.flatMap((c) => AQ.CH[c].missions).find((x) => x.scenario === name);
      assert.equal(s.correction(AQ.evaluate(m, m.answer).outcome.vfs, 0), null, `${name} after the answer`);
    }
  });
  it('a script step that needs a file is never given a read step for it', () => {
    for (const name of ['survey', 'handoff']) assert.ok(!AQ.scenarios[name].script.some((a) => a.verb === 'read'), name);
  });
});

describe('8.1 Look without touching', () => {
  it('the finding is written only after the cart code was read, and the code stays untouched', () => {
    const { outcome } = go(7, 0, 'Constraints: only edit NOTES.md');
    assert.match(outcome.vfs.read('NOTES.md'), /total\(\)/);
    assert.equal(outcome.vfs.read('src/cart/total.js'), AQ.scenarios.survey.vfs['src/cart/total.js']);
    assert.equal(outcome.violations.length, 0);
  });
  it('a scope of the notes alone skips the edit as not seen yet, and the messages name the gap', () => {
    const r = go(7, 0, 'Constraints: only edit NOTES.md\nFiles: NOTES.md');
    assert.ok(r.outcome.steps.some((s) => s.type === 'skip' && s.by === 'not seen yet' && s.target === 'NOTES.md'));
    assert.match(r.result, /no finding/);
    assert.match(go(7, 0, 'Goal: look around').result, /Nothing limited/);
  });
});

describe('8.2 Cap the change', () => {
  it('the tidy-up edit comes last, so a cap of two keeps both fixes and a cap of one drops the tax fix', () => {
    assert.equal(AQ.scenarios.creep.script.at(-1).target, 'src/format.js');
    assert.equal(go(7, 1, M(7, 1).answer).outcome.violations.length, 0);
    assert.match(go(7, 1, M(7, 1).wrong).result, /src\/tax\.js still rounds/);
    assert.match(go(7, 1, M(7, 1).lazy).result, /Nothing capped/);
  });
});

describe('8.3 Hand the notes to the next run', () => {
  it('the goal states the limit, the answer stays under it and reading the whole folder does not', () => {
    assert.ok(M(7, 2).goal.includes(` ${AQ.PEAK} tokens`));
    assert.ok(go(7, 2, M(7, 2).answer).outcome.tokens.peak <= AQ.PEAK);
    assert.ok(go(7, 2, M(7, 2).lazy).outcome.tokens.peak > AQ.PEAK);
  });
  it('each gap in the input gets its own message', () => {
    assert.match(go(7, 2, M(7, 2).wrong).result, /never read the notes/);
    assert.match(go(7, 2, 'Files: NOTES.md\nDone when: run npm test').result, /read the notes but never opened/);
    assert.match(go(7, 2, M(7, 2).lazy).result, /most allowed here is/);
    assert.match(go(7, 2, 'Files: NOTES.md, src/cart/total.js').result, /never verified/);
  });
  it('AQ.verdict does not itself require done: the status check is the mission\'s own', () => {
    const { outcome, prompt, setup } = AQ.evaluate(M(7, 2), 'Files: NOTES.md, src/cart/total.js');
    assert.equal(outcome.status, 'unverified');
    assert.equal(AQ.verdict(outcome, { prompt, setup, scenario: AQ.scenarios.handoff }), true);
  });
  it('defines the pull request in one sentence', () => assert.match(M(7, 2).explain, /pull request \(PR\): the page where teammates read your change before it joins the main code/));
});

describe('9.1 Protect the judge', () => {
  it('both cheats pass npm test on their own, so each needs a fence', () => {
    for (const files of [{ 'tests/price.test.js': "test.skip('adds cents', () => {});\n" }, { 'package.json': '{ "scripts": { "test": "echo ok" } }\n' }]) {
      const v = AQ.vfs.create({ ...AQ.scenarios.gamed.vfs, ...files });
      assert.equal(AQ.scenarios.gamed.commands['npm test'](v).ok, true, Object.keys(files)[0]);
    }
    assert.equal(AQ.scenarios.gamed.commands['npm test'](AQ.vfs.create(AQ.scenarios.gamed.vfs)).ok, false);
  });
  it('the lazy run edits both judges, and the fence is read from the prompt only', () => {
    assert.equal(go(8, 0, M(8, 0).lazy).outcome.violations.length, 2);
    assert.match(go(8, 0, P('Done when: run npm test', { 'CLAUDE.md': 'only edit src/' })).result, /does not stop the agent/);
  });
});

describe('9.2 Run the repo\'s own gate', () => {
  it('the gate command rejects a leftover console.log, and only the typed line passes', () => {
    assert.equal(AQ.scenarios.gate.commands['npm run check'](AQ.vfs.create({ ...AQ.scenarios.gate.vfs, 'src/price.js': 'console.log(1);\nMath.round(' })).ok, false);
    assert.match(go(8, 1, M(8, 1).wrong).result, /console\.log/);
    assert.equal(go(8, 1, F({ 'CLAUDE.md': 'Done when: run npm run check' })).result, 'The gate ran, but not from a Done when line in your prompt.');
  });
});

describe('9.3 Open the PR, never push to main', () => {
  it('the branch is pushed before the PR opens, and a ban on the branch push leaves no PR', () => {
    const { outcome } = go(8, 2, M(8, 2).answer);
    const runs = outcome.calls.filter((x) => x.verb === 'run').map((x) => x.target);
    assert.deepEqual([...runs], ['npm test', 'git push origin fix-rounding', 'gh pr create']);
    assert.match(go(8, 2, 'Constraints: do not run git push origin main\nConstraints: do not run git push origin fix-rounding').result, /No pull request/);
  });
});
