import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadScriptContent } from '../content-loader.mjs';

const root = new URL('../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const json = p => JSON.parse(read(p));

const SCQ = loadScriptContent();
const win = { SCQ };
for (const f of ['shared/tiers.js', 'programming/script-quest/tiers.js']) new Function('window', read(f))(win);
const { tiers, tierView, renderRail } = SCQ;
const CH = SCQ.CH;

const OLD_RANKS = [[0, 'Newbie'], [60, 'Tinkerer'], [180, 'Coder'], [340, 'Builder'], [520, 'Engineer'], [700, 'Wizard']];
const oldRank = xp => {
  let r = OLD_RANKS[0], nx = null;
  for (let i = 0; i < OLD_RANKS.length; i++) if (xp >= OLD_RANKS[i][0]) { r = OLD_RANKS[i]; nx = OLD_RANKS[i + 1] || null; }
  return { r, nx };
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// The pre-tiers app.js renderChapters, kept as the oracle.
const oldRail = S => {
  let h = '', g = '';
  CH.forEach((ch, i) => {
    if (ch.group !== g) { g = ch.group; h += `<div class="chapgroup">${esc(g)}</div>`; }
    const n = ch.missions.length;
    const d = ch.missions.filter((_, j) => S.done[`${i}-${j}`]).length;
    h += `<button class="chap${d === n ? ' earned' : ''}" data-c="${i}" aria-current="${i === S.chap}"><span class="num">${i + 1}</span><span class="nm">${esc(ch.name)}</span><span class="ct">${d}/${n}</span></button>`;
  });
  return h;
};

const saveWith = (chap, upTo) => {
  const done = {};
  CH.forEach((ch, i) => ch.missions.forEach((_, j) => { if (i < upTo || (i === upTo && j < 2)) done[`${i}-${j}`] = 1; }));
  return { xp: 0, done, chap, cur: {}, best: 0, files: null, pkgs: [] };
};
const rendered = S => { const el = {}; renderRail(el, S); return el.innerHTML; };

describe('script-quest tiers', () => {
  it('index.html loads the model after tscheck, before helpers, and tiers.js after guide and before app.js', () => {
    const tags = [...read('programming/script-quest/index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = s => { const i = tags.indexOf(s); assert.ok(i >= 0, s); return i; };
    assert.ok(at('../../shared/tiers.js') > at('../../shared/tscheck.js'));
    assert.ok(at('../../shared/tiers.js') < at('content/helpers.js'));
    assert.ok(at('content/guide.js') < at('tiers.js'));
    assert.ok(at('tiers.js') < at('app.js'));
  });

  it('all 12 chapters are beginner, 10 XP a mission, 930 XP in total', () => {
    assert.equal(CH.length, 12);
    CH.forEach((_, i) => { assert.equal(tiers.tierOf(i).id, 'beginner'); assert.equal(CH[i].tier, 'beginner'); assert.equal(tiers.missionXp(i), 10); });
    assert.equal(CH.reduce((n, c) => n + c.missions.length, 0), 93);
    assert.equal(tiers.cumulativeXp('beginner'), 930);
    const t = tiers.tierOf(0);
    assert.equal(t.badgeXp, 0);
    assert.equal(t.showHeader, false);
  });

  it('ranks and rankFor match the old ladder for 0..1000 XP', () => {
    assert.deepEqual(tiers.ranks(), OLD_RANKS);
    for (let x = 0; x <= 1000; x++) {
      const { r, nx } = oldRank(x);
      const got = tiers.rankFor(x);
      assert.equal(got.name, r[1], `name at ${x}`);
      assert.equal(got.lo, r[0], `lo at ${x}`);
      assert.equal(got.hi, nx ? nx[0] : r[0], `hi at ${x}`);
      assert.equal(OLD_RANKS[got.index + 1] ? OLD_RANKS[got.index + 1][0] : null, nx ? nx[0] : null);
    }
  });

  it('the complete save marks every chapter earned and the tier complete', () => {
    const d = json('tests/fixtures/script-progress-complete.json').data;
    const v = tierView(d);
    assert.deepEqual(v.badges.slice(0, 12), Array(12).fill(1));
    const st = tiers.status(v);
    assert.equal(st.length, 1);
    assert.equal(st[0].complete, true);
    assert.equal(st[0].missionsDone, 93);
    assert.equal(tiers.rankFor(930).name, 'Wizard');
  });

  it('renderRail equals the old renderChapters for fresh, partial, complete and mid-chapter saves', () => {
    const complete = json('tests/fixtures/script-progress-complete.json').data;
    for (const S of [saveWith(0, -1), saveWith(3, 3), complete, saveWith(7, 7)]) {
      const html = rendered(S);
      assert.equal(html, oldRail(S));
      assert.ok(!html.includes('tierhead'));
    }
  });

  it('renderRail equals the golden rail', () => {
    const g = json('tests/fixtures/script-golden.json').rail;
    assert.equal(rendered(saveWith(0, -1)), g.fresh.join(''));
    const complete = json('tests/fixtures/script-progress-complete.json').data;
    assert.equal(rendered(complete), g.complete.join(''));
  });

  it('tierView does not mutate the save', () => {
    const S = saveWith(2, 2);
    const before = JSON.stringify(S);
    tierView(S);
    assert.equal(JSON.stringify(S), before);
    assert.deepEqual(Object.keys(S), ['xp', 'done', 'chap', 'cur', 'best', 'files', 'pkgs']);
  });

  it('app.js has no RANKS or badges and keeps the saved-state line', () => {
    const app = read('programming/script-quest/app.js');
    assert.doesNotMatch(app, /RANKS|badges/);
    assert.ok(app.includes('let S={xp:0,done:{},chap:0,cur:{},best:0,files:null,pkgs:[]};'));
  });
});
