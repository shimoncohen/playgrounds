// Harbor Quest ordered multi-step missions: every step must be done, in the order given, and a step done early does not count.
// app.js is one DOM-bound IIFE, so run it in a vm against a do-nothing DOM stub and drive it through window.__hq.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'programming', 'harbor-quest', 'app.js'), 'utf8');

const stub = () => {
  const p = new Proxy(function () {}, {
    get: (_, k) => k === Symbol.iterator ? function* () {} : k === Symbol.toPrimitive ? () => '' : typeof k === 'symbol' ? undefined : p,
    set: () => true,
    apply: () => p,
    construct: () => p,
  });
  return p;
};
function boot(saved) {
  const store = new Map(saved ? [['harbor-quest-v1', JSON.stringify(saved)]] : []);
  const dom = stub();
  const win = { __hq: null, getSelection: () => ({ toString: () => '' }), addEventListener() {}, matchMedia: () => dom };
  const ctx = vm.createContext({
    window: win, document: dom, setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {},
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: {}, requestAnimationFrame() {}, Image: stub(), URL, Blob, console, HowSteps: stub(), location: { hash: '' },
  });
  vm.runInContext(src, ctx);
  return win.__hq;
}

const { CH } = boot();
const find = t => { for (let ci = 0; ci < CH.length; ci++) { const mi = CH[ci].missions.findIndex(m => m.t === t); if (mi >= 0) return { ci, mi, m: CH[ci].missions[mi] }; } throw new Error(t); };
// some answers are functions because they depend on the state (exit, then docker rm)
const typeIt = (h, m, c, i) => { const a = m.steps ? m.steps[h.S.steps?.[c + '.' + i]?.length ?? 0].ans : m.ans; return typeof a === 'function' ? a() : a; };

function playTo(ci, mi) {
  const h = boot();
  for (let c = 0; c <= ci; c++) {
    if (c > 0) h.goChapter(c);
    for (let i = 0; i < (c < ci ? CH[c].missions.length : mi); i++) {
      for (let k = 0; k < 4 && !h.S.done[c + '.' + i]; k++) h.run(typeIt(h, h.CH[c].missions[i], c, i));
      assert.ok(h.S.done[c + '.' + i], `setup: mission ${c}.${i} (${CH[c].missions[i].t}) did not complete`);
    }
  }
  return h;
}
const CONVERTED = ['One image, many containers', 'A second server', 'Save a note', 'A container that crashes', 'Ship it'];

test('the converted missions have two or more steps, each with its own answer, hint and goal', () => {
  for (const t of CONVERTED) {
    const { m } = find(t);
    assert.ok(m.steps && m.steps.length >= 2, t);
    m.steps.forEach(s => { assert.ok(s.g && s.h && s.ans && typeof s.ok === 'function', t); });
  }
});

test('every step answer passes its check in sequence and finishes the mission', () => {
  for (const t of CONVERTED) {
    const { ci, mi, m } = find(t);
    const h = playTo(ci, mi), key = ci + '.' + mi;
    m.steps.forEach((s, i) => { assert.ok(!h.S.done[key], `${t}: done before step ${i + 1}`); h.run(s.ans); });
    assert.ok(h.S.done[key], `${t}: not done after all steps`);
    assert.equal(h.S.steps, undefined, `${t}: progress is dropped on completion`);
  }
});

test('the first command alone does not finish a converted mission, and is remembered', () => {
  for (const t of CONVERTED) {
    const { ci, mi, m } = find(t);
    const h = playTo(ci, mi), key = ci + '.' + mi;
    h.run(m.steps[0].ans);
    assert.ok(!h.S.done[key], `${t}: done after the first command`);
    assert.deepEqual([...h.S.steps[key]], [0], t);
  }
});

test('the last command first does not count; the first command then still needs the last', () => {
  for (const t of CONVERTED) {
    const { ci, mi, m } = find(t);
    const h = playTo(ci, mi), key = ci + '.' + mi;
    h.run(m.steps.at(-1).ans);
    assert.ok(!h.S.done[key], `${t}: done by the last command alone`);
    assert.equal(h.S.steps, undefined, `${t}: a later step done early was recorded`);
    h.run(m.steps[0].ans);
    assert.ok(!h.S.done[key], `${t}: done without the last command after the first`);
    h.run(m.steps.at(-1).ans);
    assert.ok(h.S.done[key], `${t}: not done once both ran in order`);
  }
});

test('One image, many containers needs docker ps -a, not just docker ps', () => {
  const { ci, mi } = find('One image, many containers');
  const h = playTo(ci, mi);
  h.run('docker run hello-world');
  h.run('docker ps');
  assert.ok(!h.S.done[ci + '.' + mi]);
  h.run('docker ps -a');
  assert.ok(h.S.done[ci + '.' + mi]);
});

test('A second server: a curl before the server runs does not count', () => {
  const { ci, mi } = find('A second server');
  const h = playTo(ci, mi);
  h.run('curl localhost:8081');
  h.run('docker run -d --name web2 -p 8081:80 httpd');
  assert.ok(!h.S.done[ci + '.' + mi]);
});

test('a save without S.steps loads and plays on', () => {
  const { ci, mi, m } = find('Save a note');
  const base = playTo(ci, mi).S;
  assert.equal(base.steps, undefined);
  const h = boot(JSON.parse(JSON.stringify(base)));
  m.steps.forEach(s => h.run(s.ans));
  assert.ok(h.S.done[ci + '.' + mi]);
});
