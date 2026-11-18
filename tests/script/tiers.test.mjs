import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadScriptContent } from '../content-loader.mjs';

const root = new URL('../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const json = p => JSON.parse(read(p));

const load = () => {
  const SCQ = loadScriptContent();
  const win = { SCQ };
  for (const f of ['shared/tiers.js', 'programming/script-quest/tiers.js']) new Function('window', read(f))(win);
  return SCQ;
};

const SCQ = load();
const { tiers, tierView, renderRail } = SCQ;
const CH = SCQ.CH;
const BEGINNER = CH.filter(c => c.tier === 'beginner');
const NB = BEGINNER.length;

const INTER = CH.filter(c => c.tier === 'intermediate');
const IM = INTER.reduce((n, c) => n + c.missions.length, 0);
const IC = INTER.length;

const OLD_RANKS = [[0, 'Newbie'], [60, 'Tinkerer'], [180, 'Coder'], [340, 'Builder'], [520, 'Engineer'], [700, 'Wizard']];
const oldRank = xp => {
  let r = OLD_RANKS[0], nx = null;
  for (let i = 0; i < OLD_RANKS.length; i++) if (xp >= OLD_RANKS[i][0]) { r = OLD_RANKS[i]; nx = OLD_RANKS[i + 1] || null; }
  return { r, nx };
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// The pre-tiers app.js renderChapters, kept as the oracle (Beginner chapters only).
const oldRail = S => {
  let h = '', g = '';
  BEGINNER.forEach((ch, i) => {
    if (ch.group !== g) { g = ch.group; h += `<div class="chapgroup">${esc(g)}</div>`; }
    const n = ch.missions.length;
    const d = ch.missions.filter((_, j) => S.done[`${i}-${j}`]).length;
    h += `<button class="chap${d === n ? ' earned' : ''}" data-c="${i}" aria-current="${i === S.chap}"><span class="num">${i + 1}</span><span class="nm">${esc(ch.name)}</span><span class="ct">${d}/${n}</span></button>`;
  });
  return h;
};

const saveWith = (chap, upTo, ch = CH) => {
  const done = {};
  ch.forEach((c, i) => c.missions.forEach((_, j) => { if (i < upTo || (i === upTo && j < 2)) done[`${i}-${j}`] = 1; }));
  return { xp: 0, done, chap, cur: {}, best: 0, files: null, pkgs: [] };
};
const rendered = (S, api = SCQ) => { const el = {}; api.renderRail(el, S); return el.innerHTML; };
// The golden's rule: the Beginner rail is everything up to and including the 12th chapter button.
const cutAt12 = html => { let i = -1; for (let n = 0; n < 12; n++) i = html.indexOf('</button>', i + 1); return html.slice(0, i + '</button>'.length); };

describe('script-quest tiers', () => {
  it('index.html loads the model after tscheck, before helpers, and tiers.js after guide and before app.js', () => {
    const tags = [...read('programming/script-quest/index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = s => { const i = tags.indexOf(s); assert.ok(i >= 0, s); return i; };
    assert.ok(at('../../shared/tiers.js') > at('../../shared/tscheck.js'));
    assert.ok(at('../../shared/tiers.js') < at('content/helpers.js'));
    assert.ok(at('content/guide.js') < at('tiers.js'));
    assert.ok(at('tiers.js') < at('app.js'));
    const inter = ['scope-and-closures', 'destructuring-and-spread', 'classes', 'errors', 'modules', 'map-and-set', 'json', 'event-loop'].map(n => at(`content/ch-${n}.js`));
    assert.deepEqual(inter, [...inter].sort((a, b) => a - b));
    assert.ok(at('content/ch-beyond-the-browser.js') < inter[0]);
    assert.ok(inter[inter.length - 1] < at('content/quickfire.js'));
  });

  it('index.html links tiers.css after style.css', () => {
    const links = [...read('programming/script-quest/index.html').matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
    assert.ok(links.indexOf('../../shared/tiers.css') > links.indexOf('style.css'));
  });

  it('the first 12 chapters are beginner, 10 XP a mission, 930 XP in total', () => {
    assert.equal(NB, 12);
    CH.slice(0, 12).forEach((c, i) => { assert.equal(tiers.tierOf(i).id, 'beginner'); assert.equal(c.tier, 'beginner'); assert.equal(tiers.missionXp(i), 10); });
    assert.equal(BEGINNER.reduce((n, c) => n + c.missions.length, 0), 93);
    assert.equal(tiers.cumulativeXp('beginner'), 930);
    const t = tiers.tierOf(0);
    assert.equal(t.badgeXp, 0);
    assert.equal(t.showHeader, false);
  });

  it('ranks start with the old ladder and rankFor matches it below Wizard', () => {
    assert.deepEqual(tiers.ranks().slice(0, 6), OLD_RANKS);
    for (let x = 0; x < 700; x++) {
      const { r, nx } = oldRank(x);
      const got = tiers.rankFor(x);
      assert.equal(got.name, r[1], `name at ${x}`);
      assert.equal(got.lo, r[0], `lo at ${x}`);
      assert.equal(got.hi, nx ? nx[0] : r[0], `hi at ${x}`);
    }
    for (const x of [700, 930, 1000]) assert.equal(tiers.rankFor(x).name, 'Wizard', `name at ${x}`);
  });

  it('the Intermediate tier is 15 XP a mission with a Sorcerer end rank', () => {
    const t = tiers.tierOf(12);
    assert.equal(t.id, 'intermediate');
    assert.equal(t.missionXp, 15);
    CH.slice(12).forEach((c, i) => { assert.equal(c.group, i < 7 ? 'JavaScript in depth' : 'Node in depth'); assert.equal(tiers.missionXp(12 + i), 15); });
    assert.equal(tiers.missionXp(0), 10);
    const r = tiers.ranks();
    assert.deepEqual(r.slice(0, 6), OLD_RANKS);
    assert.deepEqual(r[6], [930 + 15 * IM + 25 * IC, 'Sorcerer']);
    assert.equal(r.length, 7);
    assert.equal(tiers.rankFor(r[6][0] - 1).name, 'Wizard');
    assert.equal(tiers.rankFor(r[6][0]).name, 'Sorcerer');
    assert.equal(tiers.rankFor(930).name, 'Wizard');
  });

  it('the pinned counts: 20 chapters, 54 Intermediate missions in 8 chapters, Sorcerer at 1940 XP', () => {
    assert.equal(CH.length, 20);
    assert.equal(IC, 8);
    assert.equal(IM, 54);
    assert.deepEqual(INTER.map(c => c.missions.length), [6, 7, 6, 7, 7, 7, 7, 7]);
    assert.deepEqual(tiers.ranks()[6], [1940, 'Sorcerer']);
    CH.forEach(c => assert.ok(c.badge && c.badge.trim(), `${c.name} has a badge name`));
  });

  it('the complete save marks the beginner chapters earned and the tier complete', () => {
    const d = json('tests/fixtures/script-progress-complete.json').data;
    const v = tierView(d);
    assert.deepEqual(v.badges.slice(0, 12), Array(12).fill(1));
    v.badges.slice(12).forEach(b => assert.equal(b, 0));
    const st = tiers.status(v);
    assert.equal(st[0].complete, true);
    assert.equal(st[0].missionsDone, 93);
    assert.equal(tiers.rankFor(930).name, 'Wizard');
  });

  it('with an Intermediate tier the complete save leaves it unfinished', () => {
    const d = json('tests/fixtures/script-progress-complete.json').data;
    const st = tiers.status(tierView(d));
    assert.equal(st.length, 2);
    assert.equal(st[0].complete, true);
    assert.equal(st[1].complete, false);
    assert.equal(st[1].missionsTotal, IM);
  });

  it('the beginner part of renderRail equals the old renderChapters', () => {
    const complete = json('tests/fixtures/script-progress-complete.json').data;
    for (const S of [saveWith(0, -1), saveWith(3, 3), complete, saveWith(7, 7)]) {
      const html = rendered(S);
      assert.equal(cutAt12(html), oldRail(S));
      assert.ok(!cutAt12(html).includes('tierhead'));
    }
  });

  it('the beginner part of renderRail equals the golden rail', () => {
    const g = json('tests/fixtures/script-golden.json').rail;
    assert.equal(cutAt12(rendered(saveWith(0, -1))), g.fresh.join(''));
    const complete = json('tests/fixtures/script-progress-complete.json').data;
    assert.equal(cutAt12(rendered(complete)), g.complete.join(''));
  });

  it('the Intermediate rail part: one header, two groups, buttons numbered 13 and up', () => {
    const complete = json('tests/fixtures/script-progress-complete.json').data;
    const partial = { ...saveWith(12, -1), done: { ...complete.done, '12-0': 1 } };
    const full = { ...complete, done: { ...complete.done } };
    INTER.forEach((c, k) => c.missions.forEach((_, j) => { full.done[`${12 + k}-${j}`] = 1; }));
    const cases = [[{ ...complete, chap: 12 }, '0', false], [partial, '0', false], [full, String(IC), true]];
    for (const [S, count, done] of cases) {
      const html = rendered(S);
      const tail = html.slice(cutAt12(html).length);
      assert.equal(cutAt12(html).includes('tierhead'), false);
      assert.equal((tail.match(/class="tierhead/g) || []).length, 1);
      assert.match(tail, /data-tier="intermediate"/);
      assert.match(tail, /Intermediate/);
      assert.deepEqual([...tail.matchAll(/class="chapgroup">([^<]*)</g)].map(m => m[1]), ['JavaScript in depth', 'Node in depth']);
      assert.deepEqual([...tail.matchAll(/data-c="(\d+)"/g)].map(m => +m[1]), INTER.map((_, k) => 12 + k));
      assert.deepEqual([...tail.matchAll(/class="num">(\d+)</g)].map(m => +m[1]), INTER.map((_, k) => 13 + k));
      assert.match(tail, new RegExp(`<span class="tc">${count}/${IC}</span>`));
      assert.equal(/tierhead[^"]*complete/.test(tail), done);
    }
  });

  it('tierView does not mutate the save', () => {
    const S = saveWith(2, 2);
    const before = JSON.stringify(S);
    tierView(S);
    assert.equal(JSON.stringify(S), before);
    assert.deepEqual(Object.keys(S), ['xp', 'done', 'chap', 'cur', 'best', 'files', 'pkgs']);
  });

  it('badgePay pays the tier badge once, when the last mission first completes', () => {
    const { badgePay } = SCQ;
    const S = { done: {} };
    const mark = (c, j) => { S.done[`${c}-${j}`] = 1; };
    const n = CH[12].missions.length;
    mark(12, 0);
    assert.equal(badgePay(S, 12, true), 0, 'non-last mission');
    for (let j = 2; j < n; j++) mark(12, j);
    assert.equal(badgePay(S, 12, true), 0, 'chapter still incomplete');
    mark(12, 1);
    assert.equal(badgePay(S, 12, true), 25, 'out-of-order last mission');
    assert.equal(badgePay(S, 12, false), 0, 'replay');
    assert.equal(badgePay(S, 12, undefined), 0);
    BEGINNER.forEach((c, i) => c.missions.forEach((_, j) => mark(i, j)));
    assert.equal(badgePay(S, 0, true), 0, 'beginner badgeXp is 0');
  });

  it('badgePay pays the chapter 20 badge once, on its last mission', () => {
    const { badgePay } = SCQ;
    const S = { done: {} };
    const n = CH[19].missions.length;
    assert.equal(n, 7);
    for (let j = 0; j < n - 1; j++) { S.done[`19-${j}`] = 1; assert.equal(badgePay(S, 19, true), 0, `mission ${j + 1}`); }
    S.done[`19-${n - 1}`] = 1;
    assert.equal(badgePay(S, 19, true), 25);
    assert.equal(badgePay(S, 19, false), 0, 'replay');
  });

  it('app.js has no RANKS or badges, keeps the saved-state line and pays the badge through badgePay', () => {
    const app = read('programming/script-quest/app.js');
    assert.doesNotMatch(app, /RANKS|badges/);
    assert.ok(app.includes('let S={xp:0,done:{},chap:0,cur:{},best:0,files:null,pkgs:[]};'));
    assert.match(app, /SCQ\.badgePay\(S,c,first\)/);
  });
});
