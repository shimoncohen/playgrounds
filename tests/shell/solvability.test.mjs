import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell } from './harness.mjs';
import { assertSolvable } from './solvability-lib.mjs';

const chapters = loadShell().content.chapters;

describe('mission solvability', () => {
  chapters.forEach((ch, i) => {
    it(`chapter ${i + 1}: ${ch.title || ch.name || ''} is solvable by its answers`, () => {
      const SQ = loadShell();
      const ch = SQ.content.chapters[i];
      ch.setup();
      for (const m of ch.missions) assertSolvable(SQ, ch, m);
    });
  });
});
