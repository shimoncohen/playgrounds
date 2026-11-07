import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

// Multi-step missions (m.steps): every step must be done, in the order given, before the mission completes.
function setup(title = 'Find by type') {
  const SQ = loadShell();
  const c = SQ.content.chapters.findIndex((ch) => ch.missions.some((m) => m.title === title));
  const ch = SQ.content.chapters[c];
  ch.setup();
  const i = ch.missions.findIndex((m) => m.title === title);
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
  it('completes when both are done in order, and drops its progress', () => {
    const { SQ, m, key } = setup();
    assert.equal(type(SQ, m, key, 'find . -type d').all, false);
    assert.equal(type(SQ, m, key, 'find . -type f').all, true);
    assert.equal(SQ.S.steps, undefined, 'no steps entry is left in the saved state');
  });
  it('the second step first does not count; the first, then the second, completes', () => {
    const { SQ, m, key } = setup();
    assert.equal(type(SQ, m, key, 'find . -type f').newly.length, 0);
    assert.equal(SQ.stepsDone(key).length, 0);
    assert.equal(type(SQ, m, key, 'find . -type d').all, false);
    assert.equal(JSON.stringify(SQ.stepsDone(key)), '[0]');
    assert.equal(type(SQ, m, key, 'find . -type f').all, true);
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
  it('one line finishes at most one step, so both commands on one line never complete the mission', () => {
    for (const line of ['find . -type d; find . -type f', 'find . -type f; find . -type d']) {
      const { SQ, m, key } = setup();
      assert.equal(JSON.stringify(type(SQ, m, key, line)), JSON.stringify({ newly: [0], all: false }), line);
      assert.equal(type(SQ, m, key, 'find . -type f').all, true, line);
    }
  });
  it('an old save with an out-of-order index still finishes', () => {
    const { SQ, m, key } = setup();
    SQ.S.steps = { [key]: [1] };
    assert.equal(SQ.stepNext(m, key), 0);
    assert.equal(type(SQ, m, key, 'find . -type d').all, true);
  });
});

describe('multi-step mission "Treasure hunt"', () => {
  it('cat alone does not complete it', () => {
    const { SQ, m, key } = setup('Treasure hunt');
    const r = type(SQ, m, key, 'cat forest/cave/deeper/chest/gold.txt');
    assert.equal(r.newly.length, 0);
    assert.equal(r.all, false);
    assert.equal(SQ.stepsDone(key).length, 0);
  });
  it('find, then cat completes it', () => {
    const { SQ, m, key } = setup('Treasure hunt');
    assert.equal(type(SQ, m, key, 'find . -name gold.txt').all, false);
    assert.equal(type(SQ, m, key, 'cat forest/cave/deeper/chest/gold.txt').all, true);
  });
  it('find without the file name does not count as step 1', () => {
    const { SQ, m, key } = setup('Treasure hunt');
    assert.equal(type(SQ, m, key, 'find . -name nosuch.txt').newly.length, 0);
  });
});
