// Skill matching (spec "Skill matching"): a skill whose when: equals the scenario tag loads its body; others stay one line.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AQ, scenario, run } from './fixture.mjs';
import { J } from './harness.mjs';

const { config, context, vfs, provider, tokens } = AQ;
const skill = (name, when, body = '') => `name: ${name}\ndescription: does ${name}\nwhen: ${when}\n${body}`;
const TRAP = 'do not edit migrations/\n';
const tagged = { ...scenario, tag: 'release' };
const setupOf = (files) => config.parseSetup(vfs.create({ ...scenario.vfs, ...files }));
const go = (files, scn = tagged) => run('Done when: run npm test', { scn, files }).outcome;
const idx = (o, f) => o.steps.findIndex(f);

describe('skillBody and skillIssues', () => {
  it('skillBody drops every frontmatter-shaped line, even a second when: in the body, and keeps the rest', () => {
    const text = 'name: a\ndescription: d\nwhen: docs\nmodel: small\nkeep me\n  when: release\n# heading\ndo not edit src/\n';
    assert.equal(config.skillBody(text), 'keep me\n# heading\ndo not edit src/\n');
  });
  it('skillIssues lists skills that never match the tag, and skills sharing a when: with an earlier one', () => {
    const s = setupOf({ '.claude/skills/a.md': skill('a', 'docs'), '.claude/skills/b.md': skill('b', 'release'), '.claude/skills/c.md': skill('c', 'release') });
    assert.deepEqual(J(config.skillIssues(s, 'release')), { unused: ['a'], duplicate: ['c'] });
    assert.deepEqual(J(config.skillIssues(s, undefined).unused), ['a', 'b', 'c']);
  });
  it('a second skill with an existing name is a setup error and is not added', () => {
    const s = setupOf({ '.claude/skills/a.md': skill('same', 'docs'), '.claude/skills/b.md': skill('same', 'release') });
    assert.deepEqual(J(s.skills.map((x) => x.path)), ['.claude/skills/a.md']);
    assert.ok(s.errors.some((e) => e.file === '.claude/skills/b.md' && /duplicate skill name/.test(e.msg)));
  });
});

describe('loadedSkills', () => {
  const files = { '.claude/skills/b.md': skill('second', 'release', 'later\n'), '.claude/skills/a.md': skill('first', 'release', 'earlier\n'), '.claude/skills/c.md': skill('other', 'docs', 'no\n') };
  const v = vfs.create({ ...scenario.vfs, ...files });
  const s = config.parseSetup(v);
  it('loads the first matching skill by path, skips the other as a duplicate, ignores non-matching ones', () => {
    const r = config.loadedSkills(s, v, 'release');
    assert.deepEqual(J(r.loaded), [{ name: 'first', path: '.claude/skills/a.md', body: 'earlier\n' }]);
    assert.deepEqual(J(r.skipped), [{ name: 'second', why: 'duplicate' }]);
  });
  it('loads nothing without a tag', () => assert.deepEqual(J(config.loadedSkills(s, v, undefined)), { loaded: [], skipped: [] }));
});

describe('agentCost', () => {
  it('sums the subagent costs', () => {
    const s = setupOf({ '.claude/agents/a.md': 'name: a\nmodel: small\n', '.claude/agents/b.md': 'name: b\nmodel: large\n' });
    assert.equal(config.agentCost(s), 11);
    assert.equal(config.agentCost(setupOf({})), 0);
  });
});

describe('context.build with skills', () => {
  const setup = setupOf({});
  const prompt = config.parsePrompt('Goal: g', scenario, setup);
  it('adds one Skill: segment per loaded skill and leaves a call without opts unchanged', () => {
    const c = context.build(setup, prompt, [], [], { skills: [{ name: 'guard', body: 'be careful' }] });
    const seg = c.segments.find((x) => x.label === 'Skill: guard');
    assert.equal(seg.kind, 'skills');
    assert.equal(seg.tokens, tokens.estimate('be careful'));
    assert.deepEqual(J(context.build(setup, prompt, [], []).segments.map((x) => x.label)), ['System prompt', 'CLAUDE.md', 'Skills (names and descriptions)', 'MCP servers', 'Files read', 'Your prompt']);
  });
});

describe('policy: skill matching', () => {
  const on = { '.claude/skills/g.md': skill('guard', 'release', TRAP + 'w'.repeat(400)) };
  it('a matching skill rule blocks the trap with no violation, and the skill step follows the context step', () => {
    const o = go(on);
    assert.deepEqual(J(o.violations), []);
    assert.ok(o.steps.some((s) => s.type === 'skip' && s.target === 'migrations/001.sql' && s.by === 'skill guard'));
    assert.deepEqual(J(o.steps[1]), { type: 'skill', name: 'guard', loaded: true });
    assert.equal(o.steps[0].type, 'context');
  });
  it('the first context step already counts the body tokens', () => {
    const body = go(on).steps[0].tokens, none = go({ '.claude/skills/g.md': skill('guard', 'release', TRAP) }).steps[0].tokens;
    assert.equal(body - none, tokens.estimate(TRAP + 'w'.repeat(400)) - tokens.estimate(TRAP));
  });
  it('a skill with another tag lets the trap run and its body never reaches the context', () => {
    const off = go({ '.claude/skills/g.md': skill('guard', 'docs', TRAP + 'w'.repeat(400)) });
    assert.deepEqual(J(off.violations), [{ verb: 'edit', target: 'migrations/001.sql' }]);
    assert.ok(!off.steps.some((s) => s.type === 'skill'));
    assert.equal(off.tokens.peak, go({ '.claude/skills/g.md': skill('guard', 'docs') }).tokens.peak);
  });
  it('two matching skills load once, and the other is a skipped duplicate step', () => {
    const o = go({ '.claude/skills/a.md': skill('first', 'release', TRAP), '.claude/skills/b.md': skill('second', 'release', 'do not edit src/\n') });
    assert.deepEqual(J(o.steps.filter((s) => s.type === 'skill')), [{ type: 'skill', name: 'first', loaded: true }, { type: 'skill', name: 'second', loaded: false, why: 'duplicate' }]);
    assert.ok(!o.steps.some((s) => s.type === 'skip' && s.by === 'skill second'));
    assert.deepEqual(J(o.violations), []);
  });
  it('a scenario with no tag ignores skills', () => {
    const o = go(on, scenario);
    assert.ok(!o.steps.some((s) => s.type === 'skill'));
    assert.equal(o.violations.length, 1);
  });
  it('the input order of the files does not change the outcome', () => {
    const rev = Object.fromEntries(Object.entries({ ...on, '.claude/skills/a.md': skill('first', 'release', 'x\n') }).reverse());
    assert.deepEqual(J(go(rev)), J(go({ '.claude/skills/a.md': skill('first', 'release', 'x\n'), ...on })));
  });
});

describe('provider narration of a skill step', () => {
  const say = (step) => provider.sim.complete([], { step }).text;
  it('says loaded or not loaded', () => {
    assert.match(say({ type: 'skill', name: 'guard', loaded: true }), /loaded the skill "guard"/);
    assert.match(say({ type: 'skill', name: 'guard', loaded: false, why: 'duplicate' }), /did not load the skill "guard"/);
  });
});

describe('style() and history plumbing', () => {
  const files = { 'docs/a.md': 'AAA\nx', 'docs/b.md': 'BBB' };
  const fmt = { ...scenario, vfs: { ...scenario.vfs, ...files }, style: (t) => t.split('\n')[0], script: [{ verb: 'edit', target: 'src/tax.js', write: (v, styles) => styles.join('|') + '!' }] };
  it('a function write gets the Examples styles in prompt order; a plain write is unchanged', () => {
    const o = run('Examples: docs/b.md, docs/a.md', { scn: fmt }).outcome;
    assert.equal(o.vfs.read('src/tax.js'), 'BBB|AAA!');
    assert.equal(run('Goal: g', { scn: fmt }).outcome.vfs.read('src/tax.js'), '!');
    assert.equal(run('Examples: docs/b.md', { scn: { ...fmt, style: undefined } }).outcome.vfs.read('src/tax.js'), '!');
  });
  it('scenario history reaches the context through evaluate', () => {
    AQ.scenarios.hist = { ...scenario, history: ['earlier one', 'earlier two'] };
    const m = { scenario: 'hist', kind: 'prompt', fields: ['goal'], prompt: 'Goal: g' };
    const r = AQ.evaluate(m, 'Goal: g');
    assert.ok(r.outcome.tokens.peak > run('Goal: g').outcome.tokens.peak);
    delete AQ.scenarios.hist;
  });
});
