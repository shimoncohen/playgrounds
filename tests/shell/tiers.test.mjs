import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext, run } from './harness.mjs';

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
    const mine = chapters.filter((c) => c.tier === 'beginner');
    assert.equal(b.chapters.length, mine.length);
    assert.equal(b.missionsTotal, mine.reduce((n, c) => n + c.missions.length, 0));
    S.badges = Object.fromEntries(chapters.map((c, i) => [i, 1]).filter(([i]) => chapters[i].tier === 'beginner'));
    b = SQ.tiers.status(S).find((s) => s.tier.id === 'beginner');
    assert.equal(b.chaptersDone, mine.length);
    assert.equal(b.complete, true);
    const im = SQ.tiers.status(S).find((s) => s.tier.id === 'intermediate');
    assert.equal(im.complete, false, 'beginner badges do not complete Intermediate');
    assert.equal(im.missionsDone, 0);
  });
  it('Intermediate adds the Script Smith rank at the cumulative XP computed from content', () => {
    const inter = SQ.content.chapters.filter((c) => c.tier === 'intermediate');
    assert.ok(inter.length >= 2);
    const expected = 695 + inter.reduce((n, c) => n + c.missions.length * 15 + 25, 0);
    assert.equal(SQ.tiers.cumulativeXp('intermediate'), expected);
    const r = SQ.tiers.ranks();
    assert.equal(r.length, 8); // + Automator and Shell Wizard, now that Advanced and Expert have chapters
    assert.deepEqual([...r[5]], [expected, 'Script Smith']);
    assert.equal(SQ.tiers.rankFor(expected).name, 'Script Smith');
    assert.equal(SQ.tiers.rankFor(695).name, 'Pipe Fitter');
    assert.equal(SQ.tiers.missionXp(7), 15);
  });
  it('Advanced adds the Automator rank (the top one) at the cumulative XP computed from content', () => {
    const adv = SQ.content.chapters.filter((c) => c.tier === 'advanced');
    assert.equal(adv.length, 4);
    const expected = SQ.tiers.cumulativeXp('intermediate') + adv.reduce((n, c) => n + c.missions.length * 20 + 25, 0);
    assert.equal(expected, 1890);
    assert.equal(SQ.tiers.cumulativeXp('advanced'), expected);
    const r = SQ.tiers.ranks();
    assert.deepEqual([...r[6]], [expected, 'Automator']);
    assert.equal(r[r.length - 1][1], 'Shell Wizard', 'Expert has chapters now, so Automator is no longer the top rank');
    assert.equal(SQ.tiers.rankFor(expected).name, 'Automator');
    assert.equal(SQ.tiers.rankFor(expected - 1).name, 'Script Smith');
    assert.equal(SQ.tiers.missionXp(11), 20);
    const S = { done: {}, badges: {} };
    SQ.content.chapters.forEach((c, i) => { S.badges[i] = 1; c.missions.forEach((m, j) => { S.done[`${i}.${j}`] = 1; }); });
    const st = SQ.tiers.status(S).filter((x) => x.chapters.length);
    assert.deepEqual(JSON.parse(JSON.stringify(st.map((s) => [s.tier.id, s.complete]))), [['beginner', true], ['intermediate', true], ['advanced', true], ['expert', true]]);
  });
  it('a tier without chapters adds no rank', () => {
    assert.equal(SQ.tiers.ranks().length, 8); // every tier has chapters now: 5 base ranks + Script Smith, Automator, Shell Wizard
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

// ---- Stage 3 Task 17: the Expert tier wiring, with the test-only Expert content (tests/fixtures/fake-expert.js) filling the tier
// up to 4 chapters x 7 missions while the real chapters (Tasks 18 and 19) are not there yet. ----
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const FAKE_EXPERT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/fake-expert.js');
function withExpert() {
  const c = loadContext();
  vm.runInContext(fs.readFileSync(FAKE_EXPERT, 'utf8'), c, { filename: FAKE_EXPERT });
  c.SQ.Tiers = c.Tiers;
  return c.SQ;
}

describe('Expert tier wiring (Task 17)', () => {
  it('declares Expert at 25 XP per mission with the end rank Shell Wizard', () => {
    const t = SQ.tiers.status({}).map((s) => s.tier);
    assert.deepEqual([...t.map((x) => x.id)], ['beginner', 'intermediate', 'advanced', 'expert']);
    assert.equal(t[3].name, 'Expert');
    assert.equal(t[3].missionXp, 25);
  });
  it('Expert chapters sit at indexes 15 to 18, after the untouched Advanced tier', () => {
    const X = withExpert();
    const ch = X.content.chapters;
    assert.equal(ch.length, 19);
    assert.deepEqual([...ch.slice(11, 15).map((c) => c.tier)], Array(4).fill('advanced'));
    for (let i = 15; i <= 18; i++) {
      assert.equal(X.tiers.tierOf(i).id, 'expert');
      assert.equal(X.tiers.missionXp(i), 25);
    }
    assert.equal(X.tiers.cumulativeXp('advanced'), 1890, 'Advanced is unchanged');
  });
  it('cumulativeXp("expert") is 1890 + 28*25 + 4*25 = 2690 and Shell Wizard is the top rank there', () => {
    const X = withExpert();
    assert.equal(X.content.chapters.filter((c) => c.tier === 'expert').reduce((n, c) => n + c.missions.length, 0), 28);
    assert.equal(X.tiers.cumulativeXp('expert'), 1890 + 28 * 25 + 4 * 25);
    assert.equal(X.tiers.cumulativeXp('expert'), 2690);
    const r = X.tiers.ranks();
    assert.equal(r.length, 8);
    assert.deepEqual([...r[r.length - 1]], [2690, 'Shell Wizard']);
    assert.deepEqual([...r[r.length - 2]], [1890, 'Automator']);
    assert.equal(X.tiers.rankFor(2690).name, 'Shell Wizard');
    assert.equal(X.tiers.rankFor(2689).name, 'Automator');
  });
  it('a save with chapters 0 to 18 badged has four complete tiers', () => {
    const X = withExpert();
    const S = { done: {}, badges: {} };
    X.content.chapters.forEach((c, i) => { S.badges[i] = 1; c.missions.forEach((m, j) => { S.done[`${i}.${j}`] = 1; }); });
    const st = X.tiers.status(S);
    assert.deepEqual(JSON.parse(JSON.stringify(st.map((s) => [s.tier.id, s.chaptersDone, s.chapters.length, s.complete]))),
      [['beginner', 7, 7, true], ['intermediate', 4, 4, true], ['advanced', 4, 4, true], ['expert', 4, 4, true]]);
    const el = { innerHTML: '' };
    Object.assign(S, { ch: 18 });
    X.Tiers.renderRail(el, { status: st, chapters: X.content.chapters, S });
    assert.equal((el.innerHTML.match(/class="tierhead complete"/g) || []).length, 4);
  });
  it('an Expert mission passes on its answer through SQ.missionVerdict', () => {
    const X = withExpert();
    X.setupChapter(X.content.chapters[15]);
    const m = X.content.chapters[15].missions[0];
    run(X, m.answer);
    assert.equal(X.missionVerdict(m, X.ctxFor(m.answer)).good, true);
    run(X, 'echo nope');
    assert.equal(X.missionVerdict(m, X.ctxFor('echo nope')).good, false);
  });
});
