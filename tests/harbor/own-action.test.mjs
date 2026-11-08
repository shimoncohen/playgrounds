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
function boot(saved, resetEl) {
  const store = new Map(saved ? [['harbor-quest-v1', JSON.stringify(saved)]] : []);
  const dom = stub();
  const win = { __hq: null, getSelection: () => ({ toString: () => '' }), addEventListener() {}, matchMedia: () => dom };
  const ctx = vm.createContext({
    window: win, document: resetEl ? new Proxy(dom, { get: (t, k) => k === 'querySelector' ? q => q === '#resetWorld' ? resetEl : dom : t[k] }) : dom, setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {},
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
const jump = (h, ci, mi) => { h.goChapter(ci); h.S.mi = mi; h.S.inside = null; h.land(); };

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

// the answer to these accumulates ("two or three times"), so it is typed as many times as the goal says
const REPEAT = { '6.3': 2, '9.5': 3 };

test('from a fresh jump, each answer counts the first time it is typed', () => {
  const bad = [];
  for (const { ci, mi, m, key } of all) {
    const h = boot();
    jump(h, ci, mi);
    const n = (m.steps || [m]).length;

    for (let i = 0; i < n && !h.S.done[key]; i++) {
      h.skip(30000);
      const a = stepAns(h, h.CH[ci].missions[mi], ci, mi);
      const times = REPEAT[key] || 1;
      for (let t = 0; t < times; t++) play(h, ci, mi);

      if (/^edit /.test(a)) i--;
    }
    if (!h.S.done[key]) bad.push(`${key} ${m.t}`);
  }
  assert.deepEqual(bad, []);
});

const counters = h => JSON.stringify([h.S.done, h.S.xp, h.S.hist.length, h.S.steps, h.S.flag.fwdHits, h.S.flag.fwdPods, h.S.badges]);

test('the setup for a jumped mission never completes it, earns XP, or touches steps, history or counters', () => {
  const played = boot();
  CH.forEach((ch, c) => {
    if (c > 0) played.goChapter(c);
    for (let i = 0; i < ch.missions.length; i++) for (let k = 0; k < 4 && !played.S.done[c + '.' + i]; k++) play(played, c, i);
  });
  const bad = [];
  for (const { ci, mi, key } of all) {
    const fromFresh = boot();
    const inBox = boot();
    inBox.run('docker run -it --name tmpbox alpine sh');
    const s = JSON.parse(JSON.stringify(played.S));
    delete s.done[key]; delete s.badges[ci]; delete s.steps;
    const fromPlayed = boot(s);
    for (const [name, h] of [['fresh', fromFresh], ['played', fromPlayed], ['inside', inBox]]) {
      const before = counters(h);
      h.goChapter(ci); h.S.mi = mi;
      if (name !== 'inside') h.S.inside = null;
      h.land();
      if (counters(h) !== before) bad.push(`${key} ${name}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('setup fires once per landing: removing what it made does not bring it back', () => {
  const h = boot();
  jump(h, 2, 1);
  assert.ok(h.S.d.containers.some(c => c.name === 'web'));
  h.run('docker rm -f web');
  h.run('docker ps');
  assert.ok(!h.S.d.containers.some(c => c.name === 'web'));
  assert.equal(h.setups.length, 1);
});

test('revisiting a finished mission does no setup', () => {
  const h = boot();
  jump(h, 2, 1);
  play(h, 2, 1);
  assert.ok(h.S.done['2.1']);
  h.run('docker rm -f web');
  const n = h.setups.length;
  h.S.mi = 1; h.land();
  assert.equal(h.setups.length, n);
  assert.ok(!h.S.d.containers.some(c => c.name === 'web'));
});

test('Reset world does not fire the current mission setup', () => {
  const handlers = [];
  const classes = new Set();
  const el = { classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) }, addEventListener: (_, f) => handlers.push(f), textContent: '' };
  const h = boot(undefined, el);
  jump(h, 2, 1);
  const n = h.setups.length;
  assert.equal(n, 1);
  handlers[0]({ currentTarget: el });
  handlers[0]({ currentTarget: el });
  assert.ok(!h.S.d.containers.some(c => c.name === 'web'));
  assert.equal(h.setups.length, n);
});

test('Spot the new crew passes on its answer right after landing', () => {
  const { ci, mi, key } = all.find(x => x.m.t === 'Spot the new crew');
  const h = boot();
  jump(h, ci, mi);
  h.run(stepAns(h, h.CH[ci].missions[mi], ci, mi));
  assert.ok(h.S.done[key]);
});

test('an unnamed container never reuses the name of an existing one', () => {
  const h = boot();
  const A = ['brave', 'calm', 'eager', 'jolly', 'keen', 'proud', 'quirky', 'zen', 'happy', 'gentle'];
  const B = ['turing', 'hopper', 'lovelace', 'curie', 'tesla', 'noether', 'ritchie', 'torvalds', 'hamilton', 'shannon'];
  h.run('docker run -d --name zz alpine');
  for (const a of A) for (const b of B) if (a + '_' + b !== 'eager_curie') h.S.d.containers.push({ ...h.S.d.containers[0], id: a + b, name: a + '_' + b, status: 'exited' });
  h.run('docker run -d alpine');
  const names = h.S.d.containers.map(c => c.name);
  assert.equal(new Set(names).size, names.length);
});

test('playing the whole course in order never prints a setup line', () => {
  const h = boot();
  CH.forEach((ch, c) => {
    if (c > 0) h.goChapter(c);
    for (let i = 0; i < ch.missions.length; i++) for (let k = 0; k < 4 && !h.S.done[c + '.' + i]; k++) play(h, c, i);
  });
  assert.equal(h.setups.length, 0, h.setups.join("\n"));
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

function playBefore(title) {
  const h = boot();
  for (let c = 0; c < CH.length; c++) {
    if (c > 0) h.goChapter(c);
    for (let i = 0; i < CH[c].missions.length; i++) {
      if (CH[c].missions[i].t === title) return { h, key: c + '.' + i };
      for (let k = 0; k < 4 && !h.S.done[c + '.' + i]; k++) play(h, c, i);
    }
  }
  throw new Error(title);
}
const webId = h => h.S.d.containers.find(x => x.name === 'web').id;
const VARIANTS = [
  ['Write in the logbook', 'echo "I survive" > /data/note.txt && cat /data/note.txt'],
  ['Repaint the shop sign', 'echo "fresh" > message.txt && cat message.txt'],
  ['Repaint the shop sign', 'echo "fresh" > "message.txt"'],
  ['A room for the shop', 'kubectl create ns shop && kubectl get ns'],
  ['A room for the shop', 'k create namespace shop -o yaml'],
  ['Scuttle the test crew', 'kubectl delete pod -n default hello'],
  ['Send out your own crew', 'kubectl run --image=nginx hello'],
  ['Ask for three', 'kubectl create deployment --image=nginx:1.26 web'],
  ['Hand it the missing setting', 'docker rm db && docker run -d --name db -e "POSTGRES_PASSWORD=secret" postgres'],
  ['Open the crew\'s web stall', 'docker run -d --name "web" nginx'],
  ['Open the crew\'s web stall', 'docker run -d --name=web nginx'],
  ['Open the crew\'s web stall', 'sudo docker run -d --name web nginx'],
  ['Build the shop\'s crate, version 1', 'docker build -t "shop:1.0" .'],
  ['Open a numbered door', 'docker run -d --name web -p 127.0.0.1:8080:80 nginx'],
  ['Two stalls, one door', 'docker run -d --name web3 -p 127.0.0.1:8080:80 nginx'],
  ['Order stock from the quay', 'docker pull -q nginx'],
  ['Order stock from the quay', 'docker pull nginx --quiet'],
  ['Take the stall down', 'docker container rm -f web'],
  ['Take the stall down', 'sudo docker rm -f web'],
  ['Take the stall down', 'false || docker rm -f web'],
  ['Close the stall for the night', h => 'docker stop ' + webId(h)],
  ['Close the stall for the night', 'docker container stop web'],
];

test('accepted variants of a command complete their mission', () => {
  const bad = [];
  for (const [title, v] of VARIANTS) {
    const { h, key } = playBefore(title);
    h.skip(30000);
    h.run(typeof v === 'function' ? v(h) : v);
    if (!h.S.done[key]) bad.push(`${title} <- ${typeof v === 'function' ? 'function' : v}`);
  }
  assert.deepEqual(bad, []);
});

test('a chain word inside quotes is not a command', () => {
  const { h, key } = playBefore('Take the stall down');
  h.run('docker rm -f web');
  assert.ok(h.S.done[key]);
  delete h.S.done[key];
  h.S.mi = Number(key.split('.')[1]);
  h.run('echo "a && docker rm web"');
  assert.ok(!h.S.done[key]);
});
