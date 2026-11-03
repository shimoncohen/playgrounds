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

describe('E1: helpers take the search', () => {
  const DOCS = ['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md'];
  const big = Object.fromEntries(DOCS.map((p) => [p, 'w'.repeat(2400)]));
  const hs = { ...scenario, hidden: [], vfs: { ...scenario.vfs, ...big }, explore: ['src/price.js', ...DOCS], focus: ['src/price.js'], script: [{ verb: 'edit', target: 'src/price.js', needs: ['src/price.js'], write: 'fixed' }] };
  const team = (...names) => ({ files: Object.fromEntries(names.map((n) => [`.claude/agents/${n}.md`, `name: ${n}\nmodel: ${n === 'big' ? 'large' : 'small'}`])) });
  const use = (names, o = {}) => run(`Use: ${names.join(', ')}`, { scn: hs, ...team(...names), ...o }).outcome;
  const sizes = (o) => kinds(o, 'delegate').map((s) => s.files);
  const explored = (o) => o.steps.filter((s) => s.tag === 'explore').map((s) => s.target);

  it('the split is contiguous in Use order: the first m mod n chunks get one more file; extra chunks are empty and still cost', () => {
    assert.deepEqual(J(sizes(use(['a', 'b']))), [3, 2]);
    assert.deepEqual(J(sizes(use(['a', 'b', 'c']))), [2, 2, 1]);
    assert.deepEqual(J(sizes(use(['a']))), [5]);
    const many = use(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    assert.deepEqual(J(sizes(many)), [1, 1, 1, 1, 1, 0, 0]);
    assert.equal(AQ.helperCost(many), 7);
    assert.deepEqual(J(kinds(use(['b', 'a']), 'delegate').map((s) => s.name)), ['b', 'a']);
  });
  it('the main agent then reads only the focus, and the helpers add to total but not to peak', () => {
    const o = use(['a', 'b']), wide = run('Goal: x', { scn: hs }).outcome;
    assert.deepEqual(J(explored(o)), ['src/price.js']);
    assert.deepEqual(J(explored(wide)), hs.explore);
    assert.ok(o.tokens.peak < wide.tokens.peak / 2);
    assert.ok(o.tokens.total > kinds(o, 'delegate').reduce((n, s) => n + s.tokens, 0));
    assert.equal(o.steps.indexOf(kinds(o, 'delegate')[0]) < o.steps.findIndex((s) => s.tag === 'explore'), true);
    assert.ok(!o.calls.some((c) => c.target.startsWith('docs/')));
  });
  it('a helper over its window is marked over; two helpers that split the files are not', () => {
    assert.deepEqual(J(kinds(use(['a']), 'delegate').map((s) => s.over)), [true]);
    assert.deepEqual(J(kinds(use(['a', 'b']), 'delegate').map((s) => s.over)), [false, false]);
    assert.ok(kinds(use(['a']), 'delegate')[0].tokens > AQ.context.WINDOW);
  });
  it('AQ.helperCost sums cost over all delegate steps, and is 0 without helpers', () => {
    assert.equal(AQ.helperCost(use(['a', 'big'])), 11);
    assert.equal(AQ.helperCost(run('Goal: x', { scn: hs }).outcome), 0);
  });
  it('a Files line makes the helpers inert, but they still cost', () => {
    const f = run('Use: a, b\nFiles: src/price.js', { scn: hs, ...team('a', 'b') }).outcome;
    assert.deepEqual(J(kinds(f, 'delegate').map((s) => [s.files, s.tokens, s.over])), [[0, 0, false], [0, 0, false]]);
    assert.equal(AQ.helperCost(f), 2);
    assert.deepEqual(J(explored(f)), ['src/price.js']);
  });
  it('an empty explore or an empty focus gives files:0 and the agent reads the explore list itself', () => {
    for (const scn of [{ ...hs, focus: [] }, { ...hs, explore: [] }, { ...hs, focus: undefined }]) {
      const o = run('Use: a', { scn, ...team('a') }).outcome;
      assert.deepEqual(J(sizes(o)), [0]);
      assert.deepEqual(J(explored(o)), scn.explore || hs.explore);
    }
  });
  it('a name that is not a subagent starts no helper', () => {
    const o = run('Use: tracker', { scn: { ...hs, tools: ['tracker.close'] }, files: { '.claude/mcp.txt': 'tracker: close' } }).outcome;
    assert.equal(kinds(o, 'delegate').length, 0);
    assert.deepEqual(J(explored(o)), hs.explore);
  });
  it('helper reads obey the rules: a blocked read is not read; a hidden read logs a violation', () => {
    const blocked = use(['a', 'b'], {}), ruled = run('Use: a, b\nConstraints: do not read docs/a.md', { scn: hs, ...team('a', 'b') }).outcome;
    assert.equal(blocked.violations.length, 0);
    assert.equal(kinds(ruled, 'delegate').reduce((n, s) => n + s.files, 0), 4);
    assert.ok(ruled.tokens.total < blocked.tokens.total);
    const spy = { ...hs, hidden: [{ verb: 'read', target: 'docs/c.md' }] };
    assert.deepEqual(J(run('Use: a, b', { scn: spy, ...team('a', 'b') }).outcome.violations), [{ verb: 'read', target: 'docs/c.md' }]);
    assert.equal(run('Use: a, b\nConstraints: do not read docs/c.md', { scn: spy, ...team('a', 'b') }).outcome.violations.length, 0);
    const mem = run('Use: a, b', { scn: spy, files: { ...team('a', 'b').files, 'CLAUDE.md': 'do not read docs/c.md' } }).outcome;
    assert.equal(mem.violations.length, 0);
  });
});

describe('E2: saved commands', () => {
  const FIX = 'Files: src/tax.js\nConstraints: do not edit migrations/\nDone when: run npm test';
  const cmd = (name, text) => ({ [`.claude/commands/${name}.md`]: text });
  const parse = (prompt, files, scn = scenario) => AQ.config.parsePrompt(prompt, scn, AQ.config.parseSetup(AQ.vfs.create({ ...scn.vfs, ...files })));

  it('.claude/commands/NAME.md becomes a command; other files there are not commands', () => {
    const s = AQ.config.parseSetup(AQ.vfs.create({ ...cmd('fix', FIX), '.claude/commands/notes.txt': 'x', '.claude/commands/a b.md': 'x', '.claude/commands/sub/deep.md': 'x' }));
    assert.deepEqual(J(s.commands), [{ name: 'fix', path: '.claude/commands/fix.md', text: FIX }]);
    assert.equal(s.errors.length, 0);
  });
  it('Use expands a command: lists concatenate after the typed ones, and the text joins the prompt', () => {
    const p = parse('Files: src/price.js\nUse: fix', cmd('fix', FIX));
    assert.deepEqual(J(p.files), ['src/price.js', 'src/tax.js']);
    assert.deepEqual(J(p.constraints), [{ kind: 'do not', verb: 'edit', target: 'migrations/' }]);
    assert.deepEqual(J(p.doneWhen), { verb: 'run', target: 'npm test' });
    assert.deepEqual(J(p.use), ['fix']);
    assert.deepEqual(J(p.commands), [{ name: 'fix', lines: 3 }]);
    assert.ok(p.raw.includes(FIX) && p.raw.startsWith('Files: src/price.js'));
    assert.equal(p.errors.length, 0);
    assert.deepEqual(J(parse('Use: ghost', {}).commands), []);
  });
  it('plan is ORed; a typed Goal or Done when wins over the command; otherwise the command supplies them', () => {
    const c = cmd('fix', 'Goal: from the command\nPlan: first\nDone when: read src/tax.js');
    const bare = parse('Use: fix', c);
    assert.equal(bare.plan, true);
    assert.equal(bare.fields.goal, 'from the command');
    assert.deepEqual(J(bare.doneWhen), { verb: 'read', target: 'src/tax.js' });
    const typed = parse('Goal: mine\nDone when: run npm test\nUse: fix', c);
    assert.equal(typed.fields.goal, 'mine');
    assert.deepEqual(J(typed.doneWhen), { verb: 'run', target: 'npm test' });
    assert.equal(parse('Use: fix', cmd('fix', 'Goal: g')).plan, false);
    assert.equal(parse('Plan: first\nUse: fix', cmd('fix', 'Goal: g')).plan, true);
  });
  it('two commands: lists concatenate in Use order and the first Done when wins; one command used twice expands once', () => {
    const c = { ...cmd('one', 'Files: src/tax.js\nDone when: read src/tax.js'), ...cmd('two', 'Files: src/price.js\nDone when: run npm test') };
    const p = parse('Use: two, one, two', c);
    assert.deepEqual(J(p.files), ['src/price.js', 'src/tax.js']);
    assert.deepEqual(J(p.doneWhen), { verb: 'run', target: 'npm test' });
    assert.deepEqual(J(p.commands.map((x) => x.name)), ['two', 'one']);
  });
  it('a Use line inside a command, a bad line and an unresolved target are errors shown as Command NAME', () => {
    const p = parse('Use: fix', cmd('fix', 'Use: other\nnonsense\nFiles: ghost.js\nConstraints: do not edit nowhere/\nDone when: run ghost'));
    assert.equal(p.errors.length, 5);
    assert.ok(p.errors.every((e) => e.line.startsWith('Command fix: ')), JSON.stringify(p.errors));
    assert.ok(p.errors.some((e) => /Use: other/.test(e.line)));
  });
  it('an error in a command refuses the whole run', () => {
    const m = { scenario: 'price', kind: 'prompt', prompt: '' };
    assert.equal(AQ.evaluate(m, { prompt: 'Use: fix', files: cmd('fix', 'Use: other') }).refused, true);
    assert.equal(AQ.evaluate(m, { prompt: 'Use: fix', files: cmd('fix', 'Done when: run npm test') }).refused, undefined);
  });
  it('the run shows a command step after the context and skills, before the plan', () => {
    const files = { ...cmd('fix', 'Plan: first\nDone when: run npm test'), '.claude/skills/s.md': 'name: s\nwhen: bugfix' };
    const o = run('Use: fix', { scn: { ...scenario, tag: 'bugfix' }, files }).outcome;
    assert.deepEqual(J(o.steps.map((s) => s.type)), ['context', 'skill', 'command', 'plan']);
    assert.deepEqual(J(o.steps[2]), { type: 'command', name: 'fix', lines: 2 });
    assert.equal(o.status, 'awaiting-approval');
  });
  it('the context counts the command text', () => {
    const text = 'Goal: ' + 'x'.repeat(800);
    const plain = run('Use: fix', { files: cmd('fix', 'Goal: x') }).outcome.steps[0].tokens;
    assert.ok(run('Use: fix', { files: cmd('fix', text) }).outcome.steps[0].tokens >= plain + 190);
  });
  it('a command Done when beats the CLAUDE.md default check, and a typed one beats the command', () => {
    const files = { 'CLAUDE.md': 'Done when: read src/tax.js', ...cmd('fix', 'Done when: read src/price.js') };
    const verify = (o) => J(kinds(o, 'act').filter((s) => s.tag === 'verify').map((s) => s.target));
    assert.deepEqual(verify(run('Use: fix', { files }).outcome), ['src/price.js']);
    assert.deepEqual(verify(run('Use: fix\nDone when: read docs/big.md', { files }).outcome), ['docs/big.md']);
    assert.deepEqual(verify(run('Goal: x', { files }).outcome), ['src/tax.js']);
  });
  it('a name used by two kinds is a setup error and the later kind is dropped; names in different kinds that differ are fine', () => {
    const skill = { '.claude/skills/s.md': 'name: dup\nwhen: bugfix' };
    const agent = { '.claude/agents/a.md': 'name: dup\nmodel: small' };
    const mcp = { '.claude/mcp.txt': 'dup: open' };
    const setup = (files) => AQ.config.parseSetup(AQ.vfs.create(files));
    for (const [what, files, kind] of [['command and skill', { ...skill, ...cmd('dup', 'Goal: g') }, 'skill'], ['command and subagent', { ...agent, ...cmd('dup', 'Goal: g') }, 'subagent'], ['command and server', { ...mcp, ...cmd('dup', 'Goal: g') }, 'MCP server']]) {
      const s = setup(files);
      assert.equal(s.commands.length, 0, what);
      assert.deepEqual(J(s.errors.map((e) => [e.file, e.msg])), [['.claude/commands/dup.md', `the name "dup" is already used by a ${kind}`]], what);
    }
    const sa = setup({ ...skill, ...agent });
    assert.equal(sa.subagents.length, 0);
    assert.equal(sa.skills.length, 1);
    assert.deepEqual(J(sa.errors.map((e) => [e.file, e.msg])), [['.claude/agents/a.md', 'the name "dup" is already used by a skill']]);
    const ok = setup({ ...skill, '.claude/agents/a.md': 'name: scout\nmodel: small', '.claude/mcp.txt': 'tracker: open', ...cmd('fix', 'Goal: g') });
    assert.equal(ok.errors.length, 0);
    assert.deepEqual(J([ok.skills.length, ok.subagents.length, ok.mcp.length, ok.commands.length]), [1, 1, 1, 1]);
  });
  it('a clashing command name is not a Use name, so Use dup stays a skill or helper name only', () => {
    const p = parse('Use: dup', { '.claude/skills/s.md': 'name: dup\nwhen: bugfix', ...cmd('dup', 'Files: src/tax.js') });
    assert.deepEqual(J(p.commands), []);
    assert.deepEqual(J(p.files), []);
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
