import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTypescriptContent } from '../content-loader.mjs';

const root = new URL('../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

const TSQ = loadTypescriptContent();
const win = { TSQ };
for (const f of ['shared/tiers.js', 'programming/typescript-quest/tiers.js']) new Function('window', read(f))(win);
const { tiers, tierCfg, badgePay, tierView, renderRail, CH } = TSQ;

const BASE = [[0, 'Stowaway'], [50, 'Ticket Clerk'], [130, 'Wagon Hand'], [240, 'Signalman'], [360, 'Rail Engineer']];
const synthetic = shape => Object.entries(shape).flatMap(([tier, counts]) => counts.map(n => ({ tier, missions: Array(n).fill({}) })));
const cumulative = (shape, perMission) => {
  let sum = 0;
  const out = {};
  for (const t of ['beginner', 'intermediate', 'advanced', 'node']) {
    for (const n of shape[t] || []) sum += n * perMission[t] + 25;
    out[t] = sum;
  }
  return out;
};

describe('typescript-quest tiers', () => {
  it('index.html loads tiers.js after guide.js and before app.js, and tiers.css after style.css', () => {
    const html = read('programming/typescript-quest/index.html');
    const tags = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = s => { const i = tags.indexOf(s); assert.ok(i >= 0, s); return i; };
    assert.ok(at('../../shared/tiers.js') > at('../../shared/tscheck.js'));
    assert.ok(at('../../shared/tiers.js') < at('content/helpers.js'));
    assert.ok(at('content/guide.js') < at('tiers.js'));
    assert.ok(at('tiers.js') < at('app.js'));
    const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
    assert.ok(links.indexOf('../../shared/tiers.css') > links.indexOf('style.css'));
  });

  it('the page names its save key and has no stored defaults', () => {
    const line = read('programming/typescript-quest/index.html').match(/<script>(window\.PROGRESS=.*?)<\/script>/)[1];
    assert.equal(line, 'window.PROGRESS={key:"typescript-quest-v1",name:"TypeScript Quest"}');
  });

  it('four tiers pay 10, 15, 20 and 25 XP a mission, with the default badge XP and a header on every tier', () => {
    assert.deepEqual(tierCfg.tiers.map(t => [t.id, t.missionXp]), [['beginner', 10], ['intermediate', 15], ['advanced', 20], ['node', 25]]);
    for (const t of tierCfg.tiers) {
      assert.equal(t.badgeXp, undefined, `${t.id} badgeXp`);
      assert.equal(t.showHeader, undefined, `${t.id} showHeader`);
    }
    assert.equal(tierCfg.doneSep, '.');
  });

  it('the base ranks and the three tier-end names are exact', () => {
    assert.deepEqual(tierCfg.baseRanks, BASE);
    assert.deepEqual(tierCfg.tierEndRanks, { intermediate: 'Chief Engineer', advanced: 'Tour Architect', node: 'Timetable Master' });
  });

  it('chapter 1 is Beginner at 10 XP a mission, so a chapter is worth 95 XP', () => {
    assert.equal(tiers.tierOf(0).id, 'beginner');
    assert.equal(tiers.missionXp(0), 10);
    assert.equal(tiers.cumulativeXp('beginner'), CH[0].missions.length * 10 + 25);
    assert.equal(tiers.cumulativeXp('beginner'), 95);
  });

  it('ranks() is the base ladder while only Beginner has chapters', () => {
    assert.deepEqual(tiers.ranks(), BASE);
    assert.equal(tiers.rankFor(0).name, 'Stowaway');
    assert.equal(tiers.rankFor(49).name, 'Stowaway');
    assert.equal(tiers.rankFor(50).name, 'Ticket Clerk');
    assert.equal(tiers.rankFor(95).name, 'Ticket Clerk');
  });

  it('with chapters in every tier, each tier-end threshold is that tier\'s cumulative XP', () => {
    const shape = { beginner: [7, 7], intermediate: [8, 8], advanced: [6, 6], node: [8, 8] };
    const t = win.Tiers.create({ ...tierCfg, chapters: synthetic(shape) });
    const per = { beginner: 10, intermediate: 15, advanced: 20, node: 25 };
    const cum = cumulative(shape, per);
    assert.deepEqual(t.ranks(), [...BASE, [cum.intermediate, 'Chief Engineer'], [cum.advanced, 'Tour Architect'], [cum.node, 'Timetable Master']]);
    assert.equal(t.rankFor(cum.advanced - 1).name, 'Chief Engineer');
    assert.equal(t.rankFor(cum.advanced).name, 'Tour Architect');
  });

  it('badgePay pays 25 once, on the last mission even out of order, and 0 on a replay', () => {
    const n = CH[0].missions.length;
    const S = { done: {} };
    S.done['0.0'] = 1;
    assert.equal(badgePay(S, 0, true), 0, 'first mission');
    for (let j = 2; j < n; j++) S.done[`0.${j}`] = 1;
    assert.equal(badgePay(S, 0, true), 0, 'chapter incomplete');
    S.done['0.1'] = 1;
    assert.equal(badgePay(S, 0, true), 25, 'out-of-order last mission');
    assert.equal(badgePay(S, 0, false), 0, 'replay');
    assert.equal(badgePay(S, 0, undefined), 0);
  });

  it('renderRail draws one Beginner header and data-c buttons numbered from 1 with n/m counts', () => {
    const n = CH[0].missions.length;
    const S = { xp: 0, done: { '0.0': 1, '0.1': 1 }, chap: 0, cur: {}, best: 0 };
    const el = {};
    renderRail(el, S);
    assert.equal((el.innerHTML.match(/class="tierhead/g) || []).length, 1);
    assert.match(el.innerHTML, /data-tier="beginner"/);
    assert.match(el.innerHTML, /Beginner/);
    assert.deepEqual([...el.innerHTML.matchAll(/data-c="(\d+)"/g)].map(m => +m[1]), [0]);
    assert.deepEqual([...el.innerHTML.matchAll(/class="num">([^<]+)</g)].map(m => m[1]), ['1']);
    assert.match(el.innerHTML, new RegExp(`<span class="ct">2/${n}</span>`));
    assert.doesNotMatch(el.innerHTML, /class="chapgroup"/);
  });

  it('app.js has no RANKS or badges, keeps the saved-state line and pays the badge through badgePay', () => {
    const app = read('programming/typescript-quest/app.js');
    assert.doesNotMatch(app, /RANKS|badges/);
    assert.ok(app.includes('let S={xp:0,done:{},chap:0,cur:{},best:0};'));
    assert.ok(app.includes("const mk=(i,j)=>i+'.'+j;"));
    assert.ok(app.includes('TSQ.badgePay('));
    assert.ok(app.includes('Trail.html('));
    assert.ok(!app.includes('</script'));
  });

  it('app.js carries no Script-only text: the SCQ namespace, project panel, editor, VFS or shell', () => {
    const app = read('programming/typescript-quest/app.js');
    assert.doesNotMatch(app, /SCQ|VFS|runShell|runNpm|procbar|INITIAL_FILES|NodeEnv|FakeBuffer|#editor|#ed\b|renderProject|MODE===.sh./);
  });

  it('a failed compiler load says to run the line again, and submit, Fresh console and boot each retry it', () => {
    const app = read('programming/typescript-quest/app.js');
    assert.match(app, /Could not load the TypeScript compiler\. Check your internet connection, then run the line again\./);
    assert.doesNotMatch(app, /press Fresh console/);
    assert.match(app, /async function submit\(\)[\s\S]*?await loadTS\(\)/);
    assert.match(app, /\$\('#fresh'\)\.onclick=[\s\S]*?bootCompiler\(\)/);
    assert.match(app, /function setChapter\([\s\S]*?bootCompiler\(\)/);
  });

  it('quick-fire shows the real answer and asks what TypeScript says', () => {
    const app = read('programming/typescript-quest/app.js');
    assert.ok(app.includes('What does TypeScript say?'));
    assert.doesNotMatch(app, /What does this print\?|<code>22<\/code>/);
  });

  it('tierView derives the badge from done and does not mutate the save', () => {
    const S = { xp: 0, done: {}, chap: 0, cur: {}, best: 0 };
    CH[0].missions.forEach((_, j) => { S.done[`0.${j}`] = 1; });
    const before = JSON.stringify(S);
    assert.deepEqual(tierView(S).badges, [1]);
    assert.equal(JSON.stringify(S), before);
    assert.deepEqual(Object.keys(S), ['xp', 'done', 'chap', 'cur', 'best']);
    assert.deepEqual(tierView({ ...S, done: { '0.0': 1 } }).badges, [0]);
  });
});
