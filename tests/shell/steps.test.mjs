import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

// Multi-step missions (m.steps): every step must be done, in any order, before the mission completes.
function setup() {
  const SQ = loadShell();
  const c = SQ.content.chapters.findIndex((ch) => ch.missions.some((m) => m.title === 'Find by type'));
  const ch = SQ.content.chapters[c];
  ch.setup();
  const i = ch.missions.findIndex((m) => m.title === 'Find by type');
  return { SQ, m: ch.missions[i], key: `${c}.${i}` };
}
const type = (SQ, m, key, line) => { run(SQ, line); return SQ.stepsApply(m, key, SQ.ctxFor(line)); };

describe('multi-step mission "Find by type"', () => {
  it('one step alone does not complete it', () => {
    const { SQ, m, key } = setup();
    const r = type(SQ, m, key, 'find . -type d');
    assert.equal(JSON.stringify(r), JSON.stringify({ newly: [0], all: false }));
    assert.equal(JSON.stringify(SQ.stepsDone(key)), '[0]');
    assert.equal(SQ.stepNext(m, key), 1);
  });
  it('completes when both are done, in either order, and drops its progress', () => {
    for (const order of [['find . -type d', 'find . -type f'], ['find . -type f', 'find . -type d']]) {
      const { SQ, m, key } = setup();
      assert.equal(type(SQ, m, key, order[0]).all, false);
      const r = type(SQ, m, key, order[1]);
      assert.equal(r.all, true);
      assert.equal(SQ.S.steps, undefined, 'no steps entry is left in the saved state');
    }
  });
  it('progress survives other lines and a repeated step', () => {
    const { SQ, m, key } = setup();
    type(SQ, m, key, 'find . -type d');
    assert.equal(type(SQ, m, key, 'ls').newly.length, 0);
    assert.equal(type(SQ, m, key, 'find . -type d').newly.length, 0);
    assert.equal(JSON.stringify(SQ.stepsDone(key)), '[0]');
  });
  it('rejects near misses', () => {
    for (const wrong of ['find . -type x', 'find . -name "*.txt"', 'find .', 'echo find . -type d', 'find . -type']) {
      const { SQ, m, key } = setup();
      assert.equal(type(SQ, m, key, wrong).newly.length, 0, wrong);
    }
  });
  it('one line with both types counts for both', () => {
    const { SQ, m, key } = setup();
    assert.equal(type(SQ, m, key, 'find . -type d; find . -type f').all, true);
  });
});
