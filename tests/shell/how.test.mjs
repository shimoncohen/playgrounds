import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadShell } from './harness.mjs';

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../../shared/how.js', import.meta.url), 'utf8'), ctx);
const { HowSteps } = ctx;

describe('HowSteps.html', () => {
  it('renders nothing without steps', () => {
    assert.equal(HowSteps.html(undefined), '');
    assert.equal(HowSteps.html([]), '');
  });
  it('renders an ordered list, one item per step', () => {
    const h = HowSteps.html(['whole', 'part one', 'part two']);
    assert.match(h, /^<div class="how">/);
    assert.equal((h.match(/<li>/g) || []).length, 3);
    assert.ok(h.indexOf('whole') < h.indexOf('part one'));
  });
});

// Whole-first rule (docs/tiers-guideline.md, "Explain the whole, then the parts"): a mission that
// has `how` opens with a step about the whole line, then ties each part back to it.
describe('Shell Quest missions with how steps', () => {
  const missions = loadShell().content.chapters.flatMap((ch, c) => ch.missions.map((m, i) => ({ m, at: `${c + 1}.${i + 1} ${m.title}` })));
  const withHow = missions.flatMap(({ m, at }) => (m.how ? [{ m, at }] : (m.steps || []).map((s, i) => ({ m: s, at: `${at} step ${i + 1}` })).filter(({ m: s }) => s.how)));
  it('Beginner tier is fully covered', () => {
    const beginner = loadShell().content.chapters.filter((c) => c.tier === 'beginner').flatMap((c) => c.missions);
    assert.ok(beginner.every((m) => m.how || (m.steps && m.steps.every((s) => s.how))), 'every Beginner mission needs how steps');
  });
  for (const { m, at } of withHow) {
    it(`${at}: steps are well formed`, () => {
      assert.ok(Array.isArray(m.how) && m.how.length >= 2, 'at least a whole-line step and one part step');
      assert.ok(m.how.every((s) => typeof s === 'string' && s.trim()), 'every step is non-empty text');
      assert.ok(!m.how.some((s) => /\$\{|\$[A-Za-z_]+\b(?![^<]*<\/code>)/.test(s)), 'show variables inside <code>');
    });
  }
});
