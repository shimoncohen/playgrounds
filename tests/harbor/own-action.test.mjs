// Harbor Quest: a mission passes only on the learner's own typed action, never on sandbox state left by another mission.
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
// some answers are functions because they depend on the state (exit, then docker rm)
const stepAns = (h, m, c, i) => { const a = m.steps ? m.steps[h.S.steps?.[c + '.' + i]?.length ?? 0].ans : m.ans; return typeof a === 'function' ? a() : a; };

// the editor is DOM-bound: an `edit` answer is simulated by changing the file the way the goal asks (replicas: 4)
function play(h, c, i) {
  h.skip(30000);
  const a = stepAns(h, h.CH[c].missions[i], c, i), f = /^edit (\S+)$/.exec(a)?.[1];
  if (f) h.S.files[f] = h.S.files[f].replace(/replicas:\s*\d+/, 'replicas: 4');
  else h.run(a);
}
const UNRELATED = ['echo hi', 'ls', 'docker ps', 'kubectl get pods'];
const all = [];
CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => all.push({ ci, mi, m, key: ci + '.' + mi })));
const answers = m => (m.steps || [m]).map(s => (typeof s.ans === 'function' ? s.ans() : s.ans));
const jump = (h, ci, mi) => { h.goChapter(ci); h.S.mi = mi; h.S.inside = null; };

test('a fresh game: unrelated commands never finish a mission', () => {
  const bad = [];
  for (const { ci, mi, m, key } of all) for (const line of UNRELATED) {
    const h = boot();
    jump(h, ci, mi);
    if (answers(m).includes(line)) continue;
    h.run(line);
    if (h.S.done[key]) bad.push(`${key} ${m.t} <- ${line}`);
  }
  assert.deepEqual(bad, []);
});

test('after a full playthrough: unrelated commands do not re-finish any mission', () => {
  const h0 = boot();
  CH.forEach((ch, c) => {
    if (c > 0) h0.goChapter(c);
    for (let i = 0; i < ch.missions.length; i++) for (let k = 0; k < 4 && !h0.S.done[c + '.' + i]; k++) play(h0, c, i);
  });
  const snap = JSON.parse(JSON.stringify(h0.S));
  assert.ok(all.every(x => snap.done[x.key]), 'setup: the reference playthrough finishes every mission');
  const bad = [];
  for (const { ci, mi, m, key } of all) for (const line of UNRELATED) {
    const s = JSON.parse(JSON.stringify(snap));
    delete s.done[key]; delete s.badges[ci]; delete s.steps;
    const h = boot(s);
    jump(h, ci, mi);
    if (answers(m).includes(line)) continue;
    h.run(line);
    if (h.S.done[key]) bad.push(`${key} ${m.t} <- ${line}`);
  }
  assert.deepEqual(bad, []);
});

test('from a fresh jump, each answer counts the first time it is typed', () => {
  // stuck on the first answer = needs an earlier mission's leftover: allowed
  const bad = [];
  for (const { ci, mi, m, key } of all) {
    const h = boot();
    jump(h, ci, mi);
    const n = (m.steps || [m]).length;
    let lines = 0, stuck = false;
    for (let i = 0; i < n + 1 && !h.S.done[key] && !stuck; i++) {
      const before = h.S.steps?.[key]?.length ?? 0;
      play(h, ci, mi); lines++;
      stuck = !h.S.done[key] && (h.S.steps?.[key]?.length ?? 0) === before;
    }
    if (!stuck && lines > n) bad.push(`${key} ${m.t}`);
  }
  assert.deepEqual(bad, []);
});

test('every chapter completes in order with the reference answers', () => {
  const h = boot();
  CH.forEach((ch, c) => {
    if (c > 0) h.goChapter(c);
    for (let i = 0; i < ch.missions.length; i++) {
      for (let k = 0; k < 4 && !h.S.done[c + '.' + i]; k++) play(h, c, i);
      assert.ok(h.S.done[c + '.' + i], `${c}.${i} ${ch.missions[i].t}`);
    }
  });
});
