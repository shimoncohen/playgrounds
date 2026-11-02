import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent, sources, J } from './harness.mjs';

const AQ = loadAgent();
const { provider, tokens } = AQ;
const messages = [{ role: 'user', content: 'Fix the bug in src/price.js.' }, { role: 'assistant', content: 'On it.' }];

describe('provider seam', () => {
  it('usage.in is the estimate of the joined messages and usage.out of the text', () => {
    const r = provider.sim.complete(messages, {});
    assert.equal(r.usage.in, tokens.estimate(messages.map((m) => m.content).join('\n')));
    assert.equal(r.usage.out, tokens.estimate(r.text));
  });
  it('the same input gives the same text and usage', () => {
    const step = { type: 'act', verb: 'edit', target: 'src/price.js', ok: true };
    assert.deepEqual(J(provider.sim.complete(messages, { step })), J(provider.sim.complete(messages, { step })));
  });
  it('narrates reads, skips, checks and plans', () => {
    const say = (step) => provider.sim.complete(messages, { step }).text;
    assert.match(say({ type: 'act', verb: 'read', target: 'a.js', ok: true }), /read a\.js/);
    assert.match(say({ type: 'skip', verb: 'delete', target: 'data/x', by: 'your constraint' }), /skipped/);
    assert.match(say({ type: 'act', verb: 'run', target: 'npm test', ok: false, tag: 'verify' }), /Check failed/);
    assert.match(say({ type: 'plan', files: ['a.js'] }), /a\.js/);
    assert.equal(typeof say(undefined), 'string');
  });
  it('the Outcome never depends on it: no content file, policy or shell mentions the provider', () => {
    for (const [f, src] of [...sources('content'), ['engine/policy.js', sources('engine').find(([n]) => n === 'engine/policy.js')[1]], ['engine/shell.js', sources('engine').find(([n]) => n === 'engine/shell.js')[1]]]) {
      assert.doesNotMatch(src, /provider/i, f);
    }
  });
});
