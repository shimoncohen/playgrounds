import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';
import { assertSolvable } from './solvability-lib.mjs';

// Documented two-step override: the answer for this mission is only the `find` step; the UI/golden
// flow then types `cat <printed path>` (the check needs the secret word in a cat output).
const TWO_STEP = {
  'Treasure hunt': (SQ, m) => {
    const found = run(SQ, m.answer).out.split('\n').find((l) => l.trim());
    assert.ok(found, 'find printed no path');
    return `cat ${found.trim()}`;
  },
};

const chapters = loadShell().content.chapters;

describe('mission solvability', () => {
  chapters.forEach((ch, i) => {
    it(`chapter ${i + 1}: ${ch.title || ch.name || ''} is solvable by its answers`, () => {
      const SQ = loadShell();
      const ch = SQ.content.chapters[i];
      ch.setup();
      for (const m of ch.missions) assertSolvable(SQ, ch, m, TWO_STEP);
    });
  });
});
