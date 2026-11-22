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

  it('chapters 1 to 5 are Beginner at 10 XP a mission, 6 to 10 Intermediate at 15, the rest Advanced at 20, and each tier is worth its missions plus 25 badge XP a chapter', () => {
    const tierAt = i => (i < 5 ? 'beginner' : i < 10 ? 'intermediate' : i < 14 ? 'advanced' : 'node');
    const xpAt = i => (i < 5 ? 10 : i < 10 ? 15 : i < 14 ? 20 : 25);
    CH.forEach((_, i) => {
      assert.equal(tiers.tierOf(i).id, tierAt(i), `chapter ${i + 1}`);
      assert.equal(tiers.missionXp(i), xpAt(i), `chapter ${i + 1}`);
    });
    assert.ok(CH.length > 10, 'chapters 11 and on exist');
    const worth = (from, to, per) => CH.slice(from, to).reduce((sum, c) => sum + c.missions.length * per + 25, 0);
    assert.equal(tiers.cumulativeXp('beginner'), worth(0, 5, 10));
    assert.equal(tiers.cumulativeXp('intermediate'), worth(0, 5, 10) + worth(5, 10, 15));
    assert.equal(tiers.cumulativeXp('advanced'), worth(0, 5, 10) + worth(5, 10, 15) + worth(10, 14, 20));
    assert.equal(tiers.cumulativeXp('node'), worth(0, 5, 10) + worth(5, 10, 15) + worth(10, 14, 20) + worth(14, CH.length, 25));
  });

  it('the real Intermediate tier-end threshold is 1030 XP: 455 for Beginner, then five chapters of six missions at 15 XP plus 25 badge XP each', () => {
    assert.deepEqual(CH.slice(5, 10).map(c => c.missions.length), [6, 6, 6, 6, 6]);
    assert.equal(tiers.cumulativeXp('beginner'), 455);
    assert.equal(tiers.cumulativeXp('intermediate'), 455 + 30 * 15 + 5 * 25);
    assert.equal(tiers.cumulativeXp('intermediate'), 1030);
    assert.deepEqual(tiers.ranks().find(r => r[1] === 'Chief Engineer'), [1030, 'Chief Engineer']);
  });

  it('the real Advanced tier-end threshold is 1630 XP: 1030 for the two tiers below, then 25 missions at 20 XP plus 25 badge XP for each of four chapters', () => {
    assert.deepEqual(CH.slice(10, 14).map(c => c.missions.length), [6, 6, 7, 6]);
    assert.equal(tiers.cumulativeXp('advanced'), 1030 + 25 * 20 + 4 * 25);
    assert.equal(tiers.cumulativeXp('advanced'), 1630);
    assert.deepEqual(tiers.ranks().find(r => r[1] === 'Tour Architect'), [1630, 'Tour Architect']);
  });

  it('the Node tier pays 25 XP a mission and 25 badge XP a chapter on top of 1630, and Timetable Master is the top rank', () => {
    const node = CH.slice(14);
    assert.deepEqual(node.map(c => c.missions.length), [6, 6, 6, 8]);
    assert.equal(tiers.cumulativeXp('node'), 1630 + 26 * 25 + 4 * 25);
    assert.equal(tiers.cumulativeXp('node'), 2380);
    assert.deepEqual(tiers.ranks().pop(), [tiers.cumulativeXp('node'), 'Timetable Master']);
  });

  it('ranks() is the base ladder plus the three tier-end names once those tiers have chapters', () => {
    const total = tiers.cumulativeXp('beginner');
    assert.deepEqual(tiers.ranks(), [...BASE, [tiers.cumulativeXp('intermediate'), 'Chief Engineer'], [tiers.cumulativeXp('advanced'), 'Tour Architect'], [tiers.cumulativeXp('node'), 'Timetable Master']]);
    assert.equal(tiers.rankFor(0).name, 'Stowaway');
    assert.equal(tiers.rankFor(49).name, 'Stowaway');
    assert.equal(tiers.rankFor(50).name, 'Ticket Clerk');
    assert.equal(tiers.rankFor(total).name, BASE.filter(r => r[0] <= total).pop()[1]);
    assert.equal(tiers.rankFor(tiers.cumulativeXp('intermediate')).name, 'Chief Engineer');
    assert.equal(tiers.rankFor(tiers.cumulativeXp('advanced')).name, 'Tour Architect');
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

  it('renderRail draws a Beginner, an Intermediate, an Advanced and a TypeScript with Node header and data-c buttons numbered from 1 with n/m counts', () => {
    const n = CH[0].missions.length;
    const S = { xp: 0, done: { '0.0': 1, '0.1': 1 }, chap: 0, cur: {}, best: 0 };
    const el = {};
    renderRail(el, S);
    assert.equal((el.innerHTML.match(/class="tierhead/g) || []).length, 4);
    assert.match(el.innerHTML, /data-tier="node"/);
    assert.match(el.innerHTML, /TypeScript with Node/);
    assert.match(el.innerHTML, /data-tier="beginner"/);
    assert.match(el.innerHTML, /data-tier="intermediate"/);
    assert.match(el.innerHTML, /data-tier="advanced"/);
    assert.match(el.innerHTML, /Beginner/);
    assert.match(el.innerHTML, /Intermediate/);
    assert.match(el.innerHTML, /Advanced/);
    assert.deepEqual([...el.innerHTML.matchAll(/data-c="(\d+)"/g)].map(m => +m[1]), CH.map((_, i) => i));
    assert.deepEqual([...el.innerHTML.matchAll(/class="num">([^<]+)</g)].map(m => m[1]), CH.map((_, i) => String(i + 1)));
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

  it('app.js carries no Script-only text: the SCQ namespace, the shell, stored project files or the virtual Node', () => {
    const app = read('programming/typescript-quest/app.js');
    assert.doesNotMatch(app, /SCQ|runNpm|INITIAL_FILES|NodeEnv|FakeBuffer|MODE===.sh./);
  });

  it('index.html loads nodeenv.js after scheduler.js and before tscheck.js, and project.js after tiers.js and before app.js', () => {
    const tags = [...read('programming/typescript-quest/index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = s => { const i = tags.indexOf(s); assert.ok(i >= 0, s); return i; };
    assert.ok(at('../../shared/scheduler.js') < at('../../shared/nodeenv.js'));
    assert.ok(at('../../shared/nodeenv.js') < at('../../shared/tscheck.js'));
    assert.ok(at('tiers.js') < at('project.js'));
    assert.ok(at('project.js') < at('app.js'));
    assert.ok(!read('programming/typescript-quest/project.js').includes('</script'));
  });

  it('the page has the editor markup, hidden until a project chapter shows it', () => {
    const html = read('programming/typescript-quest/index.html');
    assert.match(html, /<div class="editor" id="editor" hidden>/);
    assert.match(html, /<textarea id="ed"[^>]*aria-label="File editor"/);
    for (const id of ['gutter', 'edtab', 'edSave', 'edRun']) assert.ok(html.includes(`id="${id}"`), id);
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
    assert.deepEqual(tierView(S).badges, CH.map((_, i) => (i === 0 ? 1 : 0)));
    assert.equal(JSON.stringify(S), before);
    assert.deepEqual(Object.keys(S), ['xp', 'done', 'chap', 'cur', 'best']);
    assert.deepEqual(tierView({ ...S, done: { '0.0': 1 } }).badges, CH.map(() => 0));
  });

  it('app.js shows the Suggested first line on every mission, not only the first', () => {
    const app = read('programming/typescript-quest/app.js');
    const view = app.slice(app.indexOf('const m=ch.missions[j];'));
    assert.match(view, /Suggested first, in <a href="\.\.\/script-quest\/">Script Quest<\/a>/);
    assert.ok(view.indexOf('Suggested first') < view.indexOf("j===0?'<p class=\"intro\">'"), 'the line sits above the first-mission intro');
    assert.ok(view.indexOf('Suggested first') > view.indexOf('class="eyebrow">Chapter'), 'the line sits under the label');
    assert.doesNotMatch(app.slice(0, app.indexOf('const m=ch.missions[j];')), /Suggested first/, 'not on the chapter-complete card');
  });
});
