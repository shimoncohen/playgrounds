import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHarborQuest } from '../content-loader.mjs';

const { CH, tiers } = loadHarborQuest();

const OLD_RANKS = [[0, 'Deckhand'], [120, 'Dockworker'], [300, 'Rigger'], [520, 'Shipwright'], [800, 'Harbor Pilot'], [1080, 'Fleet Captain']];

test('ranks() is the old rank table', () => assert.deepEqual(tiers.ranks(), OLD_RANKS));

test('rankFor at every threshold -1, 0, +1, and at the ends', () => {
  const rank = xp => tiers.rankFor(xp).name;
  assert.equal(rank(0), 'Deckhand');
  assert.equal(rank(1e9), 'Fleet Captain');
  OLD_RANKS.forEach(([at], i) => {
    if (i === 0) return;
    assert.equal(rank(at - 1), OLD_RANKS[i - 1][1], `${at - 1}`);
    assert.equal(rank(at), OLD_RANKS[i][1], `${at}`);
    assert.equal(rank(at + 1), OLD_RANKS[i][1], `${at + 1}`);
  });
  assert.deepEqual(tiers.rankFor(1e9), { name: 'Fleet Captain', index: 5, lo: 1080, hi: 1080 });
});

test('all 12 chapters are beginner, 10 XP a mission, 25 XP a badge', () => {
  assert.equal(CH.length, 12);
  CH.forEach((c, i) => {
    assert.equal(c.tier, 'beginner', `chapter ${i}`);
    assert.equal(tiers.missionXp(i), 10, `chapter ${i}`);
  });
  assert.equal(tiers.chapterBadgeXp, 25);
});

test('cumulativeXp(beginner) sums missions and badges from CH', () => {
  const sum = CH.reduce((n, c) => n + c.missions.length * 10 + 25, 0);
  assert.equal(tiers.cumulativeXp('beginner'), sum);
});

test('status is 0/12 for an empty save and 12/12 for a full one', () => {
  const empty = tiers.status({ done: {}, badges: {} })[0];
  assert.equal(empty.chaptersDone, 0);
  assert.equal(empty.chapters.length, 12);
  assert.equal(empty.complete, false);
  const done = {}, badges = {};
  CH.forEach((c, i) => { badges[i] = 1; c.missions.forEach((m, j) => { done[i + '.' + j] = 1; }); });
  const full = tiers.status({ done, badges });
  assert.equal(full.length, 1);
  assert.equal(full[0].chaptersDone, 12);
  assert.equal(full[0].missionsDone, full[0].missionsTotal);
  assert.equal(full[0].complete, true);
});

test('the Docker and Kubernetes rail labels sit on chapters 0 and 7', () => {
  assert.deepEqual(CH.map((c, i) => c.group && [i, c.group]).filter(Boolean), [[0, 'Docker'], [7, 'Kubernetes']]);
});
