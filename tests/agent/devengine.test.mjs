// Engine additions for the dev path: the default check from CLAUDE.md (E6), after-edit hooks (E3), connected tools (E4) and unattended runs (E5).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AQ, scenario, run } from './fixture.mjs';
import { J } from './harness.mjs';

const { CAP } = AQ.policy;
const LINT = 'npm run lint';
const HOOK = { '.claude/hooks.txt': `after edit src/ run ${LINT}` };
const fixed = (v) => v.read('src/price.js') === 'fixed';
const lintScn = (over = {}) => ({ ...scenario, hidden: [], commands: { ...scenario.commands, [LINT]: (v) => (fixed(v) ? { ok: true, out: 'clean' } : { ok: false, out: 'lint error' }) }, ...over });
const kinds = (o, type) => o.steps.filter((s) => s.type === type);
const snap = (o) => JSON.stringify({ ...o, vfs: o.vfs.files });

describe('E6: a Done when line in the root CLAUDE.md is the default check', () => {
  const DW = { 'CLAUDE.md': 'do not edit migrations/\nDone when: run npm test' };
  it('is used when the prompt has none, and the correction loop runs', () => {
    const { outcome } = run('Goal: fix it', { files: DW });
    assert.equal(outcome.status, 'done');
    assert.equal(kinds(outcome, 'act').filter((s) => s.tag === 'verify').length, 2);
    assert.equal(scenario.accept(outcome), true);
  });
  it('a typed Done when wins over it', () => {
    const { outcome } = run('Done when: read src/price.js', { files: DW });
    const verify = kinds(outcome, 'act').filter((s) => s.tag === 'verify');
    assert.deepEqual(J(verify.map((s) => [s.verb, s.target])), [['read', 'src/price.js']]);
  });
  it('folder memory and skill bodies never supply it', () => {
    const files = {
      'src/CLAUDE.md': 'Done when: run npm test',
      '.claude/skills/s.md': 'name: s\nwhen: bugfix\nDone when: run npm test',
    };
    const scn = { ...scenario, tag: 'bugfix', vfs: { ...scenario.vfs, 'src/CLAUDE.md': '' } };
    assert.equal(run('Files: src/', { scn, files }).outcome.status, 'unverified');
  });
  it('a line that does not parse leaves the run unverified', () => {
    assert.equal(run('Goal: x', { files: { 'CLAUDE.md': 'Done when: it is done' } }).outcome.status, 'unverified');
    assert.equal(run('Goal: x', { files: { 'CLAUDE.md': 'Done when: run ghost' } }).outcome.status, 'unverified');
  });
});

describe('E3: after-edit hooks', () => {
  const scn = lintScn();
  it('a hook runs after an executed edit, outside the agent: not in calls, its output in total', () => {
    const base = run('Goal: x', { scn });
    const { outcome } = run('Goal: x', { scn, files: HOOK });
    const hooks = kinds(outcome, 'hook');
    assert.deepEqual(J(hooks[0]), { type: 'hook', when: 'after', target: 'src/price.js', run: LINT, ok: false });
    assert.ok(!outcome.calls.some((c) => c.target === LINT));
    assert.ok(outcome.tokens.total > base.outcome.tokens.total);
    const at = outcome.steps.indexOf(hooks[0]);
    assert.equal(outcome.steps[at - 1].verb, 'edit');
    assert.equal(outcome.steps[at - 1].target, 'src/price.js');
  });
  it('a hook skips the permission check: a rule against its command does not stop it', () => {
    const { outcome } = run(`Constraints: do not run ${LINT}`, { scn, files: HOOK });
    assert.ok(kinds(outcome, 'hook').length > 0);
    assert.equal(kinds(outcome, 'skip').length, 0);
  });
  it('a failing hook is repaired by the correction, which fires no hooks, then the hook runs again', () => {
    const { outcome } = run('Goal: x', { scn, files: HOOK });
    assert.deepEqual(J(kinds(outcome, 'hook').map((s) => s.ok)), [false, true]);
    assert.equal(outcome.steps.filter((s) => s.tag === 'fix').length, 1);
    assert.equal(outcome.vfs.read('src/price.js'), 'fixed');
  });
  it('a hook on a path the edit does not match never fires', () => {
    assert.equal(kinds(run('Goal: x', { scn, files: { '.claude/hooks.txt': `after edit docs/ run ${LINT}` } }).outcome, 'hook').length, 0);
  });
  it('no recursion: a correction that never fixes stops after the cap, and the run fails', () => {
    const bad = lintScn({ correction: () => ({ verb: 'edit', target: 'src/price.js', write: 'bad' }) });
    const { outcome } = run('Goal: x', { scn: bad, files: HOOK });
    assert.equal(kinds(outcome, 'hook').length, 1 + CAP);
    assert.equal(outcome.steps.filter((s) => s.tag === 'fix').length, CAP);
    assert.equal(outcome.status, 'failed');
  });
  it('a hook whose command is missing fails with a reason and is not repaired', () => {
    const { outcome } = run('Goal: x', { scn, files: { '.claude/hooks.txt': 'after edit src/ run npm run ghost' } });
    const [h] = kinds(outcome, 'hook');
    assert.equal(h.ok, false);
    assert.equal(h.why, 'no such command');
    assert.equal(outcome.steps.filter((s) => s.tag === 'fix').length, 0);
    assert.equal(outcome.status, 'failed');
  });
  it('a hook fires on a fix edit of the verify loop too', () => {
    const calm = lintScn({ commands: { ...scenario.commands, [LINT]: () => ({ ok: true, out: 'clean' }) } });
    const { outcome } = run('Done when: run npm test', { scn: calm, files: HOOK });
    const fix = outcome.steps.findIndex((s) => s.tag === 'fix');
    assert.ok(fix > 0);
    assert.equal(outcome.steps[fix + 1].type, 'hook');
    assert.equal(kinds(outcome, 'hook').length, 2);
    assert.equal(outcome.status, 'done');
  });
  it('the hook repair loop and the verify loop count up to the cap separately', () => {
    const bad = lintScn({ correction: () => ({ verb: 'edit', target: 'src/price.js', write: 'bad' }) });
    const { outcome } = run('Done when: run npm test', { scn: bad, files: HOOK });
    const verify = kinds(outcome, 'act').filter((s) => s.tag === 'verify');
    assert.equal(verify.length, 1 + CAP);
    assert.equal(outcome.steps.filter((s) => s.tag === 'fix').length, CAP + CAP * (1 + CAP));
    assert.equal(outcome.status, 'failed');
  });
  it('without a Done when the last run of every hook decides; with one, the Done when decides', () => {
    assert.equal(run('Goal: x', { scn, files: HOOK }).outcome.status, 'done');
    assert.equal(run('Goal: x', { scn: lintScn({ correction: undefined }), files: HOOK }).outcome.status, 'failed');
    assert.equal(run('Goal: x', { scn, files: { '.claude/hooks.txt': `after edit docs/ run ${LINT}` } }).outcome.status, 'unverified');
    const never = lintScn({ commands: { ...scenario.commands, [LINT]: () => ({ ok: false, out: 'no' }) } });
    assert.equal(run('Done when: run npm test', { scn: never, files: HOOK }).outcome.status, 'done');
  });
  it('every scenario correction is idempotent: the same fix twice, and nothing left to fix afterwards', () => {
    for (const [name, sc] of Object.entries(AQ.scenarios)) {
      if (!sc.correction) continue;
      const v = AQ.vfs.create(sc.vfs), f = sc.correction(v, 0);
      assert.deepEqual(J(sc.correction(v, 0)), J(f), name);
      if (f) { AQ.shell.exec(sc, f, v); assert.equal(sc.correction(v, 0), null, name); }
    }
  });
});

describe('E4: connected tools', () => {
  const CALL = { verb: 'call', target: 'tracker.close' };
  const scn = { ...scenario, hidden: [], connected: true, tools: ['tracker.close', 'tracker.open'], script: [CALL] };
  const skip = (o) => kinds(o, 'skip').find((s) => s.verb === 'call');
  it('a call is skipped not connected unless a setup server provides the tool', () => {
    const o = run('Goal: x', { scn }).outcome;
    assert.equal(skip(o).by, 'not connected');
    assert.equal(o.status, 'blocked');
    assert.equal(skip(run('Goal: x', { scn, files: { '.claude/mcp.txt': 'tracker: open' } }).outcome).by, 'not connected');
    for (const mcp of ['tracker: close', 'tracker: open, close']) {
      const ok = run('Goal: x', { scn, files: { '.claude/mcp.txt': mcp } }).outcome;
      assert.equal(skip(ok), undefined, mcp);
      assert.ok(ok.calls.some((c) => c.verb === 'call' && c.target === 'tracker.close'), mcp);
    }
  });
  it('without the flag a call needs no server', () => assert.equal(skip(run('Goal: x', { scn: { ...scn, connected: undefined } }).outcome), undefined));
  it('a permission rule shows first: deny call tracker.close is never reported as not connected', () => {
    const o = run('Goal: x', { scn, files: { '.claude/permissions.txt': 'deny call tracker.close' } }).outcome;
    assert.equal(skip(o).by, 'permission rule');
  });
  it('a missing file the call needs is reported before the connection', () => {
    const needy = { ...scn, script: [{ ...CALL, needs: ['src/price.js'] }] };
    assert.equal(skip(run('Files: src/tax.js', { scn: needy }).outcome).by, 'not seen yet');
  });
  it('a Done when that calls an unconnected tool ends unverified', () => {
    const o = run('Done when: call tracker.open', { scn: { ...scn, script: [{ verb: 'read', target: 'src/price.js' }] } }).outcome;
    assert.equal(o.status, 'unverified');
    assert.deepEqual(J(kinds(o, 'skip').map((s) => [s.tag, s.by])), [['verify', 'not connected']]);
  });
});

describe('E5: unattended runs', () => {
  const un = { ...scenario, hidden: [], unattended: true };
  it('Plan: first stalls instead of waiting for approval, even when approved', () => {
    for (const approved of [false, true]) {
      const { outcome } = run('Plan: first\nDone when: run npm test', { scn: un, approved });
      assert.equal(outcome.status, 'blocked');
      assert.deepEqual(J(outcome.steps.map((s) => s.type)), ['context', 'stall']);
      assert.deepEqual(J(outcome.steps[1]), { type: 'stall', what: 'plan' });
      assert.deepEqual(J(outcome.calls), []);
    }
  });
  it('the stall comes after the skill steps', () => {
    const files = { '.claude/skills/s.md': 'name: s\nwhen: bugfix' };
    const types = run('Plan: first', { scn: { ...un, tag: 'bugfix' }, files }).outcome.steps.map((s) => s.type);
    assert.deepEqual(J(types), ['context', 'skill', 'stall']);
  });
  it('the verdict for a stall says nobody was there to approve', () => {
    const r = AQ.verdict(run('Plan: first', { scn: un }).outcome, { scenario: un });
    assert.match(r, /nobody was there to give it/);
  });
  it('an attended scenario still waits for approval', () => assert.equal(run('Plan: first', { scn: { ...un, unattended: false } }).outcome.status, 'awaiting-approval'));
  it('a non-read action with no matching allow is skipped no one to ask; reads and allowed edits go through', () => {
    const o = run('Goal: x', { scn: un, files: { '.claude/permissions.txt': 'allow edit src/' } }).outcome;
    const asks = kinds(o, 'skip').filter((s) => s.by === 'no one to ask').map((s) => s.target);
    assert.deepEqual(J(asks), ['migrations/001.sql']);
    assert.equal(o.vfs.read('src/price.js'), 'bad');
    assert.ok(o.calls.some((c) => c.verb === 'read'));
    const none = run('Goal: x', { scn: un }).outcome;
    assert.equal(none.vfs.read('src/price.js'), 'bug');
    assert.equal(none.status, 'unverified');
  });
  it('allow does nothing in an attended scenario', () => {
    const a = run('Goal: x', { files: { '.claude/permissions.txt': 'allow edit src/' } }).outcome;
    const b = run('Goal: x').outcome;
    const seen = (o) => [o.status, J(o.calls), ...['src/price.js', 'migrations/001.sql'].map((p) => o.vfs.read(p)), kinds(o, 'skip').length];
    assert.deepEqual(seen(a), seen(b));
    assert.equal(kinds(a, 'skip').length, 0);
  });
  it('the check itself needs an allow line too', () => {
    const allowed = { '.claude/permissions.txt': 'allow edit src/\nallow run npm test' };
    assert.equal(run('Done when: run npm test', { scn: un, files: allowed }).outcome.status, 'done');
    assert.equal(run('Done when: run npm test', { scn: un, files: { '.claude/permissions.txt': 'allow edit src/' } }).outcome.status, 'unverified');
  });
});

describe('determinism of the dev engine', () => {
  it('hooks, a stall and a connection gate give the same Outcome every time', () => {
    const cases = [
      ['Goal: x', { scn: lintScn(), files: HOOK }],
      ['Done when: run npm test', { scn: lintScn(), files: HOOK }],
      ['Plan: first', { scn: { ...scenario, unattended: true } }],
      ['Goal: x', { scn: { ...scenario, connected: true, tools: ['tracker.close'], script: [{ verb: 'call', target: 'tracker.close' }] } }],
      ['Goal: x', { files: { 'CLAUDE.md': 'Done when: run npm test' } }],
    ];
    for (const [p, o] of cases) assert.equal(snap(run(p, o).outcome), snap(run(p, o).outcome), p);
  });
});
