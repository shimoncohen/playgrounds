import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

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

describe('beginner solvability', () => {
  chapters.forEach((ch, i) => {
    it(`chapter ${i + 1}: ${ch.title || ch.name || ''} is solvable by its answers`, () => {
      const SQ = loadShell();
      SQ.content.chapters[i].setup();
      for (const m of SQ.content.chapters[i].missions) {
        let last = m.answer;
        if (TWO_STEP[m.title]) last = TWO_STEP[m.title](SQ, m);
        run(SQ, last);
        assert.ok(m.check(SQ.ctxFor(last)), `mission "${m.title}" not solved by: ${last}`);
      }
    });
  });
});
