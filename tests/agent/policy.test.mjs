import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AQ, scenario, run } from './fixture.mjs';
import { J, sources, code } from './harness.mjs';

const NO_TRAP = 'Constraints: do not edit migrations/';
const idx = (o, f) => o.steps.findIndex(f);

describe('violation versus skip', () => {
  it('a blocked trap edit is skipped and logs no violation', () => {
    const { outcome } = run(NO_TRAP);
    assert.deepEqual(J(outcome.violations), []);
    assert.ok(outcome.steps.some((s) => s.type === 'skip' && s.target === 'migrations/001.sql' && s.by === 'your constraint'));
    assert.equal(outcome.vfs.read('migrations/001.sql'), 'old');
  });
  it('an executed trap edit logs exactly one violation', () => {
    const { outcome } = run('Goal: fix it');
    assert.deepEqual(J(outcome.violations), [{ verb: 'edit', target: 'migrations/001.sql' }]);
    assert.equal(outcome.steps.filter((s) => s.violation).length, 1);
    assert.equal(outcome.vfs.read('migrations/001.sql'), 'new');
  });
  it('a skipped required action fails accept without a violation', () => {
    const { outcome } = run(`${NO_TRAP}\nConstraints: do not edit src/`);
    assert.deepEqual(J(outcome.violations), []);
    assert.equal(typeof scenario.accept(outcome), 'string');
  });
  it('a read of the hidden folder is not a violation, because hidden names the verb', () => {
    const scn = { ...scenario, script: [{ verb: 'read', target: 'migrations/001.sql' }] };
    assert.deepEqual(J(run('Goal: x', { scn }).outcome.violations), []);
  });
  it('a standing CLAUDE.md rule, a permission rule and a hook block like a constraint', () => {
    for (const [files, by] of [[{ 'CLAUDE.md': 'do not edit migrations/' }, 'CLAUDE.md'], [{ '.claude/permissions.txt': 'deny edit migrations/' }, 'permission rule'], [{ '.claude/hooks.txt': 'before edit migrations/' }, 'hook']]) {
      const { outcome } = run('Goal: x', { files });
      assert.deepEqual(J(outcome.violations), [], by);
      assert.ok(outcome.steps.some((s) => s.type === 'skip' && s.by === by), by);
    }
  });
  it('a star in a hook, a permission rule and a CLAUDE.md rule blocks the trap like the plain path', () => {
    for (const [files, by] of [[{ '.claude/hooks.txt': 'before edit migrations/*' }, 'hook'], [{ '.claude/permissions.txt': 'deny edit migrations/*' }, 'permission rule'], [{ 'CLAUDE.md': 'do not edit migrations/*' }, 'CLAUDE.md']]) {
      const { outcome } = run('Goal: x', { files });
      assert.deepEqual(J(outcome.violations), [], by);
      assert.ok(outcome.steps.some((s) => s.type === 'skip' && s.target === 'migrations/001.sql' && s.by === by), by);
    }
  });
  it('an unresolved target is rejected, so the trap still runs', () => {
    const { outcome, prompt } = run('Constraints: do not edit nonexistent/\nConstraints: be careful');
    assert.equal(prompt.errors.length, 2);
    assert.equal(outcome.violations.length, 1);
  });
  it('max 1 files lets the first edit through and skips the next', () => {
    const { outcome } = run('Constraints: max 1 files');
    assert.ok(outcome.steps.some((s) => s.type === 'skip' && s.target === 'src/price.js'));
  });
});

describe('plan, verification and the correction step', () => {
  it('Plan: first puts a plan step, naming the files, before any edit', () => {
    const { outcome } = run(`${NO_TRAP}\nPlan: first`, { approved: true });
    const plan = idx(outcome, (s) => s.type === 'plan');
    assert.ok(plan >= 0);
    assert.ok(plan < idx(outcome, (s) => s.type === 'approved'));
    assert.ok(plan < idx(outcome, (s) => s.type === 'act' && s.verb === 'edit'));
    assert.deepEqual(J(outcome.steps[plan].files), ['migrations/001.sql', 'src/price.js']);
    assert.equal(run(NO_TRAP).outcome.steps.some((s) => s.type === 'plan'), false);
  });
  it('Plan: first pauses before any action, and it is not a pass', () => {
    const { outcome } = run(`${NO_TRAP}\nPlan: first\nDone when: run npm test`);
    assert.equal(outcome.status, 'awaiting-approval');
    assert.deepEqual(J(outcome.steps.map((s) => s.type)), ['context', 'plan']);
    assert.deepEqual(J(outcome.calls), []);
    assert.deepEqual(J(outcome.violations), []);
    assert.equal(outcome.vfs.read('src/price.js'), 'bug');
    assert.equal(outcome.vfs.read('migrations/001.sql'), 'old');
    assert.notEqual(scenario.accept(outcome), true);
  });
  it('approving continues to the same result an unplanned run gives, behind the plan steps', () => {
    for (const extra of [NO_TRAP, `${NO_TRAP}\nDone when: run npm test`, '']) {
      const paused = run(`${extra}\nPlan: first`).outcome;
      const resumed = run(`${extra}\nPlan: first`, { approved: true }).outcome;
      const plain = run(extra).outcome;
      assert.deepEqual(J(resumed.steps.slice(0, paused.steps.length)), J(paused.steps), 'the pause is a prefix of the resumed run');
      const acts = (o) => J(o.steps.filter((s) => s.type === 'act' || s.type === 'skip'));
      assert.deepEqual(acts(resumed), acts(plain));
      assert.deepEqual([resumed.status, J(resumed.calls), J(resumed.violations), resumed.vfs.files], [plain.status, J(plain.calls), J(plain.violations), plain.vfs.files]);
      assert.equal(JSON.stringify(run(`${extra}\nPlan: first`, { approved: true }).outcome.steps), JSON.stringify(resumed.steps), 'deterministic');
    }
  });
  it('a failed check triggers the correction step, then passes', () => {
    const { outcome } = run(`${NO_TRAP}\nDone when: run npm test`);
    assert.equal(outcome.status, 'done');
    assert.equal(outcome.steps.filter((s) => s.tag === 'fix').length, 1);
    assert.equal(outcome.steps.filter((s) => s.tag === 'verify').length, 2);
    assert.equal(scenario.accept(outcome), true);
  });
  it('the correction step runs at most the cap, then the run fails', () => {
    const scn = { ...scenario, correction: () => ({ verb: 'edit', target: 'src/price.js', write: 'bad' }) };
    const { outcome } = run(`${NO_TRAP}\nDone when: run npm test`, { scn });
    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.steps.filter((s) => s.tag === 'fix').length, AQ.policy.CAP);
  });
  it('a failed check with no correction fails', () => {
    const scn = { ...scenario, correction: undefined };
    assert.equal(run(`${NO_TRAP}\nDone when: run npm test`, { scn }).outcome.status, 'failed');
  });
  it('no Done when line means unverified, and a Done when that does not parse does too', () => {
    assert.equal(run(NO_TRAP).outcome.status, 'unverified');
    assert.equal(run(`${NO_TRAP}\nDone when: it is done`).outcome.status, 'unverified');
  });
  it('a check the learner blocks never runs', () => {
    const { outcome } = run(`${NO_TRAP}\nConstraints: do not run npm test\nDone when: run npm test`);
    assert.equal(outcome.status, 'unverified');
    assert.deepEqual(J(outcome.violations), []);
  });
  it('every action blocked gives blocked', () => {
    const { outcome } = run('Constraints: do not edit src/\nConstraints: do not edit migrations/\nConstraints: do not read src/');
    assert.equal(outcome.status, 'blocked');
  });
});

describe('what the agent has seen', () => {
  const edit = { verb: 'edit', target: 'src/price.js', needs: ['src/price.js'], write: 'fixed' };
  const scn = { ...scenario, script: [edit], explore: ['src/tax.js', 'docs/big.md', 'src/price.js'], hidden: [] };
  it('an edit waits until its file was read', () => {
    const lost = run('Files: src/tax.js', { scn }).outcome;
    assert.ok(lost.steps.some((s) => s.type === 'skip' && s.by === 'not seen yet'));
    assert.equal(lost.vfs.read('src/price.js'), 'bug');
    assert.equal(run('Files: src/price.js', { scn }).outcome.vfs.read('src/price.js'), 'fixed');
  });
  it('with no Files line the agent explores and the peak grows', () => {
    const wide = run('Goal: x', { scn }).outcome, narrow = run('Files: src/price.js', { scn }).outcome;
    assert.ok(wide.tokens.peak > narrow.tokens.peak + 1000);
  });
  it('a Files folder reads everything under it', () => {
    const o = run('Files: src/', { scn }).outcome;
    assert.deepEqual(J(o.calls.filter((c) => c.verb === 'read').map((c) => c.target)), ['src/price.js', 'src/tax.js']);
  });
});

describe('determinism', () => {
  const snap = (o) => JSON.stringify({ ...o, vfs: o.vfs.files });
  it('the same inputs give the same Outcome', () => {
    for (const p of ['Goal: x', `${NO_TRAP}\nDone when: run npm test\nPlan: first`, 'Files: src/', 'Constraints: do not edit src/']) {
      assert.equal(snap(run(p).outcome), snap(run(p).outcome), p);
    }
  });
  it('a run does not change the scenario it ran on', () => {
    const before = JSON.stringify(scenario.vfs);
    run('Goal: x');
    assert.equal(JSON.stringify(scenario.vfs), before);
  });
  it('engine and content never touch the clock, randomness or the browser', () => {
    for (const [f, src] of [...sources('engine'), ...sources('content')]) {
      assert.doesNotMatch(code(src), /Math\.random|Date\.now|\bwindow\b|\bdocument\b|localStorage/, f);
    }
  });
});
