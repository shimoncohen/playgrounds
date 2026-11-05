import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AQ, scenario, run } from './fixture.mjs';
import { J } from './harness.mjs';

const { context, tokens, config, vfs } = AQ;
const setupOf = (files = {}) => config.parseSetup(vfs.create({ ...scenario.vfs, ...files }));
const prompt = config.parsePrompt('Goal: g', scenario, setupOf());
const kinds = (c) => J(c.segments.map((s) => s.kind));

describe('context.build', () => {
  it('lists the system prompt, setup, files read, history and prompt as measured segments', () => {
    const setup = setupOf({ 'CLAUDE.md': 'Prices are in dollars.', '.claude/mcp.txt': 'calendar: list' });
    const c = context.build(setup, prompt, ['hello'], [{ path: 'src/price.js', text: 'bug' }]);
    assert.deepEqual(kinds(c), ['system', 'memory', 'skills', 'mcp', 'files', 'history', 'prompt']);
    assert.equal(c.total, c.segments.reduce((n, s) => n + s.tokens, 0));
    assert.equal(c.segments.find((s) => s.kind === 'memory').tokens, tokens.estimate('Prices are in dollars.'));
    assert.deepEqual(J(c.dropped), []);
    assert.equal(c.limit, context.WINDOW);
  });
  it('setupTokens adds the memory file and every file under .claude/, parsed or not', () => {
    assert.equal(context.setupTokens(setupOf({ 'CLAUDE.md': 'x'.repeat(40) })), 10);
    assert.equal(context.setupTokens(setupOf({ 'CLAUDE.md': 'x'.repeat(40), '.claude/notes.txt': 'y'.repeat(80) })), 30);
  });
  it('overflow drops the oldest history first, and only history', () => {
    const base = context.build(setupOf(), prompt, ['']).total;
    const big = (n) => 'x'.repeat(4 * n);
    const c = context.build(setupOf(), prompt, [big(900), big(900), big(900)]);
    assert.ok(base + 2700 > context.WINDOW);
    assert.deepEqual(J(c.dropped.map((d) => d.label)), ['Earlier message 1']);
    assert.ok(c.total <= context.WINDOW);
    assert.equal(c.peak, base + 2700);
    assert.ok(c.segments.some((s) => s.kind === 'system') && c.segments.some((s) => s.kind === 'prompt'));
  });
  it('without history to drop, the demand stays above the window', () => {
    const c = context.build(setupOf({ 'CLAUDE.md': 'x'.repeat(4 * 2500) }), prompt, []);
    assert.ok(c.total > context.WINDOW);
    assert.deepEqual(J(c.dropped), []);
  });
});

describe('a constraint stated only in chat', () => {
  const rule = 'do not edit migrations/';
  const base = context.build(setupOf(), prompt, ['']).total;
  const fill = 'x'.repeat(4 * (context.WINDOW - base - tokens.estimate(rule) + 2));
  it('is remembered while it fits and forgotten once it is dropped', () => {
    assert.equal(context.rules(context.build(setupOf(), prompt, [rule]), scenario).length, 1);
    const c = context.build(setupOf(), prompt, [rule, fill]);
    assert.equal(c.dropped.length, 1);
    assert.equal(context.rules(c, scenario).length, 0);
  });
  it('decides whether the trap runs', () => {
    assert.equal(run('Goal: g', { history: [rule] }).outcome.violations.length, 0);
    assert.equal(run('Goal: g', { history: [rule, fill] }).outcome.violations.length, 1);
  });
});
