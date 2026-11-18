import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext } from './harness.mjs';

const ctx = loadContext();
const { SQ, Tiers } = ctx;
const J = (x) => JSON.parse(JSON.stringify(x));

describe('Shell defaults (literal pins)', () => {
  it('ranks, cumulative XP, mission XP and badge XP', () => {
    assert.deepEqual(J(SQ.tiers.ranks()), [[0, 'Rookie'], [100, 'Apprentice'], [250, 'Navigator'], [420, 'Operator'], [600, 'Pipe Fitter'],
      [1230, 'Script Smith'], [1890, 'Automator'], [2690, 'Shell Wizard']]);
    assert.deepEqual(['beginner', 'intermediate', 'advanced', 'expert'].map((t) => SQ.tiers.cumulativeXp(t)), [695, 1230, 1890, 2690]);
    assert.deepEqual(Array.from({ length: 19 }, (_, i) => SQ.tiers.missionXp(i)), [10, 10, 10, 10, 10, 10, 10, 15, 15, 15, 15, 20, 20, 20, 20, 25, 25, 25, 25]);
    assert.equal(SQ.tiers.chapterBadgeXp, 25);
  });
  it('status of a mixed save', () => {
    const st = SQ.tiers.status({ done: { '0.0': 1, '0.1': 1, '7.0': 1 }, badges: { 0: 1 } });
    assert.deepEqual(J(st.map((s) => [s.tier.id, s.chapters, s.chaptersDone, s.missionsDone, s.missionsTotal, s.complete])), [
      ['beginner', [0, 1, 2, 3, 4, 5, 6], 1, 2, 52, false],
      ['intermediate', [7, 8, 9, 10], 0, 1, 29, false],
      ['advanced', [11, 12, 13, 14], 0, 0, 28, false],
      ['expert', [15, 16, 17, 18], 0, 0, 28, false]]);
  });
});

const chs = [{ name: 'A', missions: [1, 2] }, { name: 'B', missions: [1] }, { name: 'C', missions: [1] }];
const rail = (o) => { const el = { innerHTML: '' }; Tiers.renderRail(el, o); return el; };
const stat = (id, name, chapters, extra = {}) => ({ tier: { id, name, ...extra }, chapters, chaptersDone: 0, complete: false });
const S0 = () => ({ done: {}, badges: {}, ch: 0 });
const BTN = (i, name, n, num = i + 1, cls = 'chap', attr = 'data-ch') => `<button class="${cls}" ${attr}="${i}" aria-current="${i === 0}"><span class="num">${num}</span><span class="nm">${name}</span><span class="ct">0/${n}</span></button>`;
const HEAD = (id, name, n) => `<div class="tierhead" data-tier="${id}"><span class="tn">${name}</span><span class="tc">0/${n}</span></div>`;

describe('renderRail defaults (literal HTML)', () => {
  it('one tier without showHeader draws its header (Math shape)', () => {
    assert.equal(rail({ status: [stat('t', 'T', [0, 1, 2])], chapters: chs, S: S0() }).innerHTML,
      HEAD('t', 'T', 3) + BTN(0, 'A', 2) + BTN(1, 'B', 1) + BTN(2, 'C', 1));
  });
  it('two tiers draw both headers', () => {
    assert.equal(rail({ status: [stat('a', 'A1', [0]), stat('b', 'B1', [1, 2])], chapters: chs, S: S0() }).innerHTML,
      HEAD('a', 'A1', 1) + BTN(0, 'A', 2) + HEAD('b', 'B1', 2) + BTN(1, 'B', 1) + BTN(2, 'C', 1));
  });
});

describe('tier fields and create options', () => {
  const mk = (tiers, extra = {}) => Tiers.create({ tiers, chapters: [{ tier: 'a', missions: [1, 2] }, { tier: 'b', missions: [1, 2] }],
    baseRanks: [[0, 'Lo']], tierEndRanks: { a: 'Ra', b: 'Rb' }, ...extra });
  it('badgeXp 0 on one tier, default on another', () => {
    const t = mk([{ id: 'a', name: 'A', missionXp: 10, badgeXp: 0 }, { id: 'b', name: 'B', missionXp: 10 }]);
    assert.equal(t.cumulativeXp('a'), 20);
    assert.equal(t.cumulativeXp('b'), 20 + 20 + 25);
    assert.deepEqual(J(t.ranks()), [[0, 'Lo'], [20, 'Ra'], [65, 'Rb']]);
    assert.equal(t.chapterBadgeXp, 25);
  });
  it('doneSep on create counts - keys and not . keys', () => {
    const tiers = [{ id: 'a', name: 'A', missionXp: 10 }, { id: 'b', name: 'B', missionXp: 10 }];
    const dash = mk(tiers, { doneSep: '-' }).status({ done: { '0-0': 1, '0-1': 1 }, badges: {} })[0];
    assert.equal(dash.missionsDone, 2);
    assert.equal(mk(tiers, { doneSep: '-' }).status({ done: { '0.0': 1 }, badges: {} })[0].missionsDone, 0);
    assert.equal(mk(tiers).status({ done: { '0-0': 1 }, badges: {} })[0].missionsDone, 0);
  });
  it('create after the chapters are filled gives the same result as before', () => {
    const chapters = [];
    const t = Tiers.create({ tiers: [{ id: 'a', name: 'A', missionXp: 10 }], chapters, baseRanks: [[0, 'Lo']], tierEndRanks: {} });
    chapters.push({ tier: 'a', missions: [1] });
    assert.equal(t.cumulativeXp('a'), 35);
  });
});

describe('renderRail options', () => {
  it('doneSep - counts - keys', () => {
    const ct = (done, doneSep) => rail({ status: [stat('t', 'T', [0])], chapters: chs, S: { done, badges: {}, ch: 0 }, doneSep }).innerHTML.match(/<span class="ct">(\d\/\d)<\/span>/)[1];
    assert.equal(ct({ '0-0': 1 }, '-'), '1/2');
    assert.equal(ct({ '0.0': 1 }, '-'), '0/2');
    assert.equal(ct({ '0-0': 1 }), '0/2');
    assert.equal(ct({ '0.0': 1 }), '1/2');
  });
  it('chAttr renames the index attribute', () => {
    const html = rail({ status: [stat('t', 'T', [0, 1, 2], { showHeader: false })], chapters: chs, S: S0(), chAttr: 'data-c' }).innerHTML;
    assert.equal(html, BTN(0, 'A', 2, 1, 'chap', 'data-c') + BTN(1, 'B', 1, 2, 'chap', 'data-c') + BTN(2, 'C', 1, 3, 'chap', 'data-c'));
    assert.ok(!html.includes('data-ch='));
  });
  it('earnedStar false shows the number on an earned chapter', () => {
    const S = { done: {}, badges: { 0: 1 }, ch: 0 };
    const star = rail({ status: [stat('t', 'T', [0])], chapters: chs, S }).innerHTML;
    const num = rail({ status: [stat('t', 'T', [0])], chapters: chs, S, earnedStar: false }).innerHTML;
    assert.match(star, /<span class="num">★<\/span>/);
    assert.match(num, /<button class="chap earned"[^>]*><span class="num">1<\/span>/);
    assert.ok(!num.includes('★'));
  });
  it('groups draw a chapgroup div on group change and reset per tier', () => {
    const g = [{ name: 'A', group: 'G1', missions: [1] }, { name: 'B', group: 'G1', missions: [1] }, { name: 'C', group: 'G2', missions: [1] }, { name: 'D', group: 'G2', missions: [1] }];
    const html = rail({ status: [stat('a', 'A1', [0, 1, 2], { showHeader: false }), stat('b', 'B1', [3], { showHeader: false })], chapters: g, S: S0(), groups: true }).innerHTML;
    assert.deepEqual([...html.matchAll(/<div class="chapgroup">([^<]*)<\/div>/g)].map((m) => m[1]), ['G1', 'G2', 'G2']);
    assert.ok(!rail({ status: [stat('a', 'A1', [0, 1, 2])], chapters: g, S: S0() }).innerHTML.includes('chapgroup'));
  });
  it('showHeader false hides only that tier heading; true and missing draw it', () => {
    const heads = (a, b) => [...rail({ status: [stat('a', 'A1', [0], a), stat('b', 'B1', [1, 2], b)], chapters: chs, S: S0() }).innerHTML.matchAll(/data-tier="(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(heads({ showHeader: false }, { showHeader: true }), ['b']);
    assert.deepEqual(heads({ showHeader: false }, {}), ['b']);
    assert.deepEqual(heads({ showHeader: true }, {}), ['a', 'b']);
    const html = rail({ status: [stat('a', 'A1', [0], { showHeader: false })], chapters: chs, S: S0() }).innerHTML;
    assert.equal(html, BTN(0, 'A', 2));
  });
  it('onPick reads chAttr', () => {
    const el = {}; const picked = [];
    Tiers.renderRail(Object.assign(el, { innerHTML: '' }), { status: [], chapters: chs, S: S0(), chAttr: 'data-c', onPick: (i) => picked.push(i) });
    const b = { getAttribute: (n) => (n === 'data-c' ? '2' : null) };
    el.onclick({ target: { closest: (sel) => (sel === '[data-c]' ? b : null) } });
    assert.deepEqual(picked, [2]);
  });
});
