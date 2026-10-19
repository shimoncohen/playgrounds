import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext } from './harness.mjs';

const ctx = loadContext();
const SQ = ctx.SQ;
const Tiers = ctx.Tiers;

describe('tiers', () => {
  it('beginner chapters give 10 XP per mission', () => {
    assert.equal(SQ.tiers.missionXp(0), 10);
  });
  it('keeps the old rank thresholds', () => {
    assert.deepEqual([...SQ.tiers.ranks().slice(0, 5).map((r) => r[0])], [0, 100, 250, 420, 600]);
  });
  it('renames the 600 XP rank', () => {
    assert.equal(SQ.tiers.rankFor(650).name, 'Pipe Fitter');
    assert.equal(SQ.tiers.rankFor(0).name, 'Rookie');
    assert.equal(SQ.tiers.rankFor(100).index, 1);
  });
  it('beginner cumulative XP is 695', () => {
    assert.equal(SQ.tiers.cumulativeXp('beginner'), 695);
  });
  it('status counts a tier complete when every chapter has a badge', () => {
    const chapters = SQ.content.chapters;
    const S = { done: { '0.0': 1, '0.1': 1 }, badges: {} };
    let b = SQ.tiers.status(S).find((s) => s.tier.id === 'beginner');
    assert.equal(b.missionsDone, 2);
    assert.equal(b.chaptersDone, 0);
    assert.equal(b.complete, false);
    assert.equal(b.chapters.length, chapters.length);
    assert.equal(b.missionsTotal, chapters.reduce((n, c) => n + c.missions.length, 0));
    S.badges = Object.fromEntries(chapters.map((_, i) => [i, 1]));
    b = SQ.tiers.status(S).find((s) => s.tier.id === 'beginner');
    assert.equal(b.chaptersDone, chapters.length);
    assert.equal(b.complete, true);
  });
  it('a tier without chapters adds no rank', () => {
    assert.equal(SQ.tiers.ranks().length, 5);
    const t = Tiers.create({
      tiers: [
        { id: 'a', name: 'A', blurb: '', missionXp: 10 },
        { id: 'b', name: 'B', blurb: '', missionXp: 20 },
      ],
      chapters: [{ tier: 'a', missions: [1, 2] }],
      baseRanks: [[0, 'Lo'], [30, 'Hi']],
      tierEndRanks: { b: 'Bee' },
    });
    assert.equal(t.ranks().length, 2);
    assert.equal(t.cumulativeXp('a'), 45);
  });
});

describe('Tiers.renderRail', () => {
  it('renders one header per status entry, in order, with chapter buttons', () => {
    const el = { innerHTML: '' };
    const mk = (id, name, chapters, done, complete) => ({ tier: { id, name }, chapters, chaptersDone: done, complete });
    const chapters = ['A', 'B', 'C'].map((name) => ({ name, missions: [{}] }));
    const S = { badges: {}, ch: 0, done: {} };
    Tiers.renderRail(el, {
      status: [mk('beginner', 'Beginner', [0, 1], 2, true), mk('intermediate', 'Intermediate', [2], 0, false)],
      chapters, S,
    });
    const heads = [...el.innerHTML.matchAll(/<div class="tierhead[^"]*"[^>]*data-tier="(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(heads, ['beginner', 'intermediate']);
    assert.equal((el.innerHTML.match(/data-ch="/g) || []).length, 3);
    assert.match(el.innerHTML, /2\/2/);
    assert.match(el.innerHTML, /★/);
  });
  it('skips tiers with no chapters', () => {
    const el = { innerHTML: '' };
    Tiers.renderRail(el, { status: [{ tier: { id: 'x', name: 'X' }, chapters: [], chaptersDone: 0, complete: false }], chapters: [], S: { badges: {}, done: {}, ch: 0 } });
    assert.equal(el.innerHTML, '');
  });
});
