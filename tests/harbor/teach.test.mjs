// Harbor Quest, "teach before use" (AGENTS.md rule 12): a key term must not appear in any mission text before the mission that
// teaches it (or defines it in place), and Quick-fire only offers tasks whose chapter the learner has finished.
// harbor-quest/app.js is one DOM-bound IIFE, so load the data blocks (CH, QF + qfOpen, puzzles, GUIDE) by their markers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../content-loader.mjs';

const { CH, QF, PZ_DF, PZ_Y, GUIDE, qfOpen } = loadContent('harbor-quest', {
  parts: [['const CH=[', '\nCH.forEach'], ['const QF=[', 'const VALUED_D'], ['const PZ_DF=[', 'const RANKS'], ['const GUIDE=[', '/* ---------- UI']],
  returns: ['CH', 'QF', 'PZ_DF', 'PZ_Y', 'GUIDE', 'qfOpen'],
});

const plain = t => String(t).replace(/<\/?[a-z][^>]*>/gi, '').replace(/`/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const cardText = m => plain([m.t, m.i, m.g, m.h, (m.a || []).map(x => x[0]).join(' '), m.after].filter(Boolean).join('\n'));
const flat = [];
CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => flat.push({ ci, mi, text: cardText(m) })));
const before = (ci, mi) => flat.filter(x => x.ci < ci || (x.ci === ci && x.mi < mi));

// term -> [regex that uses it, chapter, mission (0-based) that first teaches or defines it in place (its own card may use it)]
const FIRST = {
  container: [/\bcontainers?\b/i, 0, 0],
  image: [/\bimages?\b/i, 0, 1],
  daemon: [/\bdaemon\b/i, 0, 1],
  layer: [/\blayers?\b/i, 1, 0],
  tag: [/\btags?\b/i, 1, 0],
  port: [/\bports?\b/i, 2, 1],
  shell: [/\bshell\b/i, 2, 3],
  root: [/\broot\b/i, 2, 3],
  cat: [/\bcat\b/, 2, 4],
  localhost: [/localhost/, 3, 1],
  'IP address': [/\bIPs?\b/, 3, 5],
  hostname: [/hostname/i, 3, 5],
  ping: [/\bping\b/, 3, 6],
  DNS: [/\bDNS\b/, 3, 6],
  echo: [/\becho\b/, 4, 1],
  '&&': [/&&/, 4, 2],
  'environment variable': [/environment variable/i, 4, 8],
  Dockerfile: [/Dockerfile/, 5, 0],
  CACHED: [/\bCACHED\b/, 5, 7],
  YAML: [/YAML/, 6, 0],
  cluster: [/\bclusters?\b/i, 7, 0],
  'control plane': [/control plane/i, 7, 0],
  pod: [/\bpods?\b/i, 7, 2],
  namespace: [/namespace/i, 7, 2],
  replicas: [/\breplicas?\b/i, 8, 0],
  ReplicaSet: [/ReplicaSet/, 8, 7],
  NodePort: [/NodePort/, 9, 1],
  ClusterIP: [/ClusterIP/, 9, 1],
  label: [/\blabels?\b/i, 9, 3],
  rollout: [/rollout/i, 10, 0],
  object: [/\bobjects?\b/, 10, 99, true],
  manifest: [/manifest/i, 11, 1],
  ConfigMap: [/ConfigMap/, 11, 1],
};

for (const [term, [re, ci, mi, soft]] of Object.entries(FIRST)) {
  if (soft) continue;
  test(`"${term}" is not used before ${ci}.${mi}`, () => {
    for (const x of before(ci, mi)) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}" before it is taught at ${ci}.${mi}`);
    assert.ok(flat.some(x => x.ci === ci && x.mi === mi && re.test(x.text)), `${ci}.${mi} should be where "${term}" is introduced`);
  });
  test(`quick-fire never asks about "${term}" before chapter ${ci + 1} (which teaches it) is done`, () => {
    for (const q of QF) if (re.test(q[0])) assert.ok(q[2] >= ci, `"${q[0]}" needs chapter ${ci}`);
  });
}

test('"object" is only used where it is defined (11.1)', () => {
  for (const x of flat) if (/\bobjects?\b/.test(x.text)) assert.ok(x.ci === 11, `${x.ci}.${x.mi} uses "object" before 11`);
});

test('terms are defined in place the first time they appear', () => {
  const m = (c, i) => plain(CH[c].missions[i].i + ' ' + (CH[c].missions[i].after || ''));
  assert.match(m(0, 0), /containers: programs running in their own little box/);
  assert.match(m(0, 1), /images \(a program plus everything it needs to run\)/);
  assert.match(m(0, 1), /"daemon", which is just another word for the engine/);
  assert.match(m(2, 1), /A port is a numbered door/);
  assert.match(m(2, 3), /A shell is a text prompt/);
  assert.match(m(2, 4), /cat prints a file's text/);
  assert.match(m(3, 1), /localhost means "this computer"/);
  assert.match(m(3, 5), /IP address on shopnet/);
  assert.match(m(3, 6), /ping sends a few tiny test messages/);
  assert.match(m(3, 6), /DNS is the phone book/);
  assert.match(m(4, 1), /echo prints the text you give it/);
  assert.match(plain(CH[4].missions[2].h), /&& means "and then/);
  assert.match(m(4, 3), /docker volume ls lists your volumes/);
  assert.match(m(4, 8), /named settings handed to a program when it starts/);
  assert.match(m(6, 0), /YAML, a simple indented text format/);
  assert.match(m(7, 0), /group of machines working together is a cluster/);
  assert.match(m(7, 2), /A pod is Kubernetes' wrapper around a container/);
  assert.match(m(7, 2), /separate area called a namespace/);
  assert.match(m(8, 0), /N copies \(replicas\)/);
  assert.match(m(9, 1), /NodePort also opens a door on every machine/);
  assert.match(m(9, 1), /ClusterIP, works only inside it/);
  assert.match(m(10, 0), /rolling update/);
});

test('puzzle intros gloss the YAML and Compose keys they use', () => {
  assert.match(PZ_Y[0].intro, /apiVersion says.*kind is the type.*spec is.*matchLabels.*template is the recipe/);
  assert.match(PZ_Y[1].intro, /targetPort is the port inside the pod/);
  assert.match(PZ_Y[2].intro, /depends_on says which service to start first/);
  assert.match(PZ_DF[0].intro, /requirements\.txt and installed by pip/);
});

// ---- quick-fire: every task is tagged with the chapter that teaches its command, and gated by saved progress
const sig = ans => {
  const t = ans.split(' ');
  const n = t[0] === 'docker' ? (['network', 'volume', 'compose'].includes(t[1]) ? 3 : 2) : (['get', 'create', 'rollout', 'set', 'describe', 'delete'].includes(t[1]) ? 3 : 2);
  return t.slice(0, n).join(' ');
};
test('quick-fire: every task has a chapter that has already taught its command', () => {
  assert.ok(QF.length >= 40);
  for (const q of QF) {
    assert.ok(Number.isInteger(q[2]) && q[2] >= 0 && q[2] < CH.length, `bad chapter on "${q[0]}"`);
    const s = sig(q[1][0]);
    const taught = flat.find(x => x.text.includes(s));
    assert.ok(taught && taught.ci <= q[2], `"${q[0]}" (${s}) is first taught at ${taught ? taught.ci + '.' + taught.mi : 'never'}, tagged chapter ${q[2]}`);
  }
});
test('quick-fire: `kubectl logs` is not asked (no mission teaches it)', () => {
  assert.ok(!QF.some(q => q[1].some(a => /kubectl logs/.test(a)) || /logs of the pod/.test(q[0])));
});
test('quick-fire: the example round command (docker ps) is taught in chapter 1', () => {
  assert.ok(QF.some(q => q[1].includes('docker ps') && q[2] === 0));
});

const doneThrough = n => { const d = {}; for (let c = 0; c < n; c++) CH[c].missions.forEach((_, i) => (d[c + '.' + i] = true)); return d; };
test('quick-fire gating: nothing is open on a fresh save', () => {
  assert.equal(qfOpen({}).length, 0);
  assert.equal(qfOpen(undefined).length, 0);
});
test('quick-fire gating: chapter 1 alone opens only what it teaches (the example round is valid)', () => {
  const open = qfOpen(doneThrough(1));
  assert.ok(open.length >= 5 && open.every(q => q[2] === 0));
});
test('quick-fire gating: only tasks whose chapter is done are offered', () => {
  for (let n = 0; n <= CH.length; n++) {
    const open = qfOpen(doneThrough(n));
    for (const q of open) assert.ok(q[2] < n, `chapter ${q[2]} is not done but is offered`);
    assert.equal(open.length, QF.filter(q => q[2] < n).length);
  }
  assert.equal(qfOpen(doneThrough(CH.length)).length, QF.length);
});
test('quick-fire gating: Kubernetes and namespace tasks stay locked until their chapters are done', () => {
  const docker = qfOpen(doneThrough(7)).map(q => q[0]).join('\n');
  assert.doesNotMatch(docker, /namespace|pod|deployment|service/i);
});
test('quick-fire gating: one missing mission keeps the chapter locked; a later chapter alone does not unlock an earlier one', () => {
  const d = doneThrough(1); delete d['0.2'];
  assert.equal(qfOpen(d).length, 0);
  const only3 = {}; CH[3].missions.forEach((_, i) => (only3['3.' + i] = true));
  assert.ok(qfOpen(only3).every(q => q[2] === 3));
});

test('guide: Docker Hub is glossed where the guide mentions it', () => {
  assert.ok(GUIDE.flat().some(([c, n]) => /Docker Hub/.test(n) && /public image shelf/.test(n)));
});
