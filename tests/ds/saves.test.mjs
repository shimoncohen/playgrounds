// Data Structures Quest: the saved fields (seen, lang, codes), old saves, and the XP rules of V.complete.
import { it, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'programming', 'ds-quest');
const sandbox = {};
vm.createContext(sandbox);
for (const f of ['engine.js', 'scenes.js', 'content.js', 'visual.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
const D = sandbox.DSQ, V = D.visual, CH = D.CH;
const same = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, m);
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const fresh = () => new Function(`${read('app.js').match(/function fresh\(\)\{.*\}/)[0]};return fresh()`)();
const progress = () => new Function('window', `${read('index.html').match(/<script>(window\.PROGRESS=.*?)<\/script>/)[1]};return window.PROGRESS`)({});
const ids = CH.flatMap((c, ci) => c.missions.map((_, mi) => `${ci}.${mi}`));
const visualIds = ids.filter(id => CH[+id.split('.')[0]].missions[+id.split('.')[1]].visual);
const at = id => id.split('.').map(Number);

describe('fresh() and the PROGRESS line', () => {
  it('fresh() holds the defaults and the new text map', () => {
    const f = fresh(), d = progress().defaults;
    assert.deepEqual(f.seen, d.seen);
    assert.equal(f.lang, d.lang);
    assert.deepEqual(f.codes, {});
    assert.deepEqual(f.code, {});
  });

  it('PROGRESS holds only seen and lang, on one line', () => {
    const p = progress();
    assert.deepEqual(p.defaults, { seen: {}, lang: 'js' });
    assert.equal(p.key, 'ds-quest-v1');
    assert.equal(read('index.html').split('\n').filter(l => l.includes('window.PROGRESS=')).length, 1);
  });

  it('visual.js loads between draw.js and app.js', () => {
    const html = read('index.html');
    assert.ok(html.indexOf('src="draw.js"') < html.indexOf('src="visual.js"'));
    assert.ok(html.indexOf('src="visual.js"') < html.indexOf('src="app.js"'));
  });
});

describe('an old save', () => {
  const old = () => Object.assign(fresh(), { done: Object.fromEntries(ids.map(id => [id, true])), xp: 999, code: { '0.0': 'let a = 1' } });

  it('shows every mission done, per chapter, and opens step 2 on the visual ones', () => {
    const S = old();
    same(CH.map((c, ci) => c.missions.filter((_, mi) => S.done[`${ci}.${mi}`]).length), [5, 4, 3, 4, 5, 5]);
    assert.ok(visualIds.length >= 2);
    for (const id of visualIds) assert.equal(V.stepOf(S, CH[at(id)[0]].missions[at(id)[1]], id), 2, id);
  });

  it('a save without seen does not throw', () => {
    const S = { done: {}, xp: 0, badges: {} };
    assert.equal(V.seen(S, '1.0'), false);
    assert.equal(V.stepOf(S, CH[1].missions[0], '1.0'), 1);
  });

  it('complete leaves the old typed code alone', () => {
    const S = old();
    S.done['1.0'] = false;
    V.complete(S, 1, 0);
    same(S.code, { '0.0': 'let a = 1' });
    same(S.seen, {});
  });
});

describe('V.complete', () => {
  const blank = () => Object.assign(fresh(), { xp: 0 });

  it('gives 10 XP once for an ungated mission, with no seen', () => {
    const S = blank();
    const plain = { title: 'Plain', goal: 'No picture.' };
    const mi = CH[0].missions.push(plain) - 1;
    try {
      assert.ok(!V.gated(plain));
      same(V.complete(S, 0, mi), { ok: true, first: true });
      assert.equal(S.xp, 10);
      same(V.complete(S, 0, mi), { ok: true, first: false });
      assert.equal(S.xp, 10);
    } finally { CH[0].missions.pop(); }
  });

  it('refuses a gated mission that is not seen, and changes nothing', () => {
    const S = blank();
    assert.ok(V.gated(CH[1].missions[0]));
    same(V.complete(S, 1, 0), { ok: false, locked: true });
    assert.equal(S.xp, 0);
    same(S.done, {});
  });

  it('completes a gated mission once it is seen', () => {
    const S = blank();
    S.seen['1.0'] = true;
    same(V.complete(S, 1, 0), { ok: true, first: true });
    assert.equal(S.done['1.0'], true);
    assert.equal(S.xp, 10);
    V.complete(S, 1, 0);
    assert.equal(S.xp, 10);
  });

  it('adds the chapter badge once, when the last mission is done', () => {
    const S = blank();
    for (const id of ids.filter(i => i.startsWith('0.'))) S.seen[id] = true;
    const n = CH[0].missions.length;
    let last;
    for (let mi = 0; mi < n; mi++) last = V.complete(S, 0, mi);
    assert.equal(last.badge, true);
    assert.equal(S.badges[0], true);
    assert.equal(S.xp, 10 * n + 25);
    assert.equal(V.complete(S, 0, n - 1).badge, undefined);
    assert.equal(S.xp, 10 * n + 25);
  });
});
