// Every step type the policy can push must be narrated, tagged and described, so a new type cannot reach the Run panel half-finished.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent, read } from './harness.mjs';

const AQ = loadAgent();
const UI = new Function('window', 'AQ', `${read('ui.js')}\nreturn window.AQUI;`)({}, AQ);
const SAMPLE = {
  context: { type: 'context', tokens: 12, dropped: 0 },
  skill: { type: 'skill', name: 'guard', loaded: true },
  command: { type: 'command', name: 'fix', lines: 2 },
  plan: { type: 'plan', files: ['src/price.js'] },
  approved: { type: 'approved' },
  delegate: { type: 'delegate', name: 'scout', model: 'small', cost: 1, files: 3, tokens: 380, over: false },
  act: { type: 'act', verb: 'edit', target: 'src/price.js', ok: true, tag: 'script' },
  skip: { type: 'skip', verb: 'edit', target: 'src/price.js', by: 'your constraint' },
  hook: { type: 'hook', when: 'after', target: 'src/price.js', run: 'npm run lint', ok: false },
  stall: { type: 'stall' },
};
const say = (step) => AQ.provider.sim.complete([], { step }).text;

describe('step type registry', () => {
  it('lists exactly the types the samples cover', () => assert.deepEqual([...AQ.policy.STEP_TYPES].sort(), Object.keys(SAMPLE).sort()));
  it('every type has its own narration, not the generic fallback', () => {
    for (const t of AQ.policy.STEP_TYPES) {
      const text = say(SAMPLE[t]);
      assert.doesNotMatch(text, /undefined/, t);
      assert.notEqual(text, say(undefined), t);
    }
  });
  it('every type except act is a TAGS key of ui.js and has a describe branch', () => {
    const tags = /const TAGS=\{([^}]*)\}/.exec(read('ui.js'))[1];
    for (const t of AQ.policy.STEP_TYPES.filter((x) => x !== 'act')) {
      assert.match(tags, new RegExp(`\\b${t}:`), `TAGS ${t}`);
      assert.doesNotMatch(UI.describe(SAMPLE[t]), /undefined/, `describe ${t}`);
    }
  });
  it('tagOf gives a string for a sample of every type', () => {
    for (const t of AQ.policy.STEP_TYPES) assert.equal(typeof UI.tagOf(SAMPLE[t]), 'string', t);
  });
  it('a helper that overflows or has nothing to read says so in the panel and the narration', () => {
    const over = { ...SAMPLE.delegate, over: true, tokens: 2800 }, idle = { ...SAMPLE.delegate, files: 0, tokens: 0 };
    assert.match(UI.describe(over), /more than its window \(2000\)/);
    assert.match(say(over), /lost track of some files/);
    assert.match(UI.describe(idle), /nothing to search/);
    assert.match(say(idle), /nothing for it to search/);
    assert.match(say(SAMPLE.delegate), /3 files in its own context/);
    assert.deepEqual([UI.tagOf(SAMPLE.delegate), UI.tagOf(SAMPLE.command)], ['helper', 'command']);
  });
  it('a skip reason shows as words in the Run panel and the narration', () => {
    for (const by of ['not seen yet', 'not connected', 'no one to ask']) {
      const s = { ...SAMPLE.skip, by };
      assert.doesNotMatch(say(s), /does not allow it/, by);
      assert.ok(say(s).includes('I wanted to edit src/price.js, but '), by);
      assert.ok(UI.describe(s).length > 0 && !UI.describe(s).includes(`blocked by ${by}`), by);
    }
    assert.match(say(SAMPLE.skip), /your constraint does not allow it/);
    assert.match(UI.describe(SAMPLE.skip), /blocked by your constraint/);
  });
});
