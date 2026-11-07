import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadMath, FILES_GRAPH } from './harness.mjs';

const MQ = loadMath(FILES_GRAPH);
const G = MQ.graph;
// vm-realm arrays/objects fail strict deepEqual's prototype check.
const plain = x => JSON.parse(JSON.stringify(x));
const ch = (id, requires = []) => ({ id, title: id, requires });
const graph = chapters => ({ tracks: [{ id: 't', name: 'T', key: 'k' }], chapters: { t: chapters } });

test('the shipped graph is valid', () => assert.deepEqual(plain(G.validate()), []));

test('validate names each kind of error', () => {
  const one = (chapters, re) => {
    const errs = G.validate(graph(chapters));
    assert.equal(errs.length, 1, errs.join('; '));
    assert.match(errs[0], re);
  };
  one([ch('a', ['b']), ch('b', ['a'])], /cycle.*a/);
  one([ch('a', ['zzz'])], /unknown.*zzz/);
  one([ch('a'), ch('a')], /duplicate.*a/);
  one([ch('a', ['a'])], /a requires itself/);
});

test('doneFrom reads badges by chapter position and tolerates bad state', () => {
  assert.deepEqual([...G.doneFrom({ arithmetic: { badges: { 0: true } }, algebra: null })], ['arithmetic.order']);
  for (const bad of ['garbage', {}, null, 5, { badges: 'x' }, undefined]) assert.equal(G.doneFrom({ arithmetic: bad, algebra: bad }).size, 0);
  assert.equal(G.doneFrom({}).size, 0);
});

test('hint lists missing direct prerequisites', () => {
  const h = G.hint('algebra.expressions', new Set());
  assert.equal(h.ready, false);
  assert.equal(h.missing.length, 1);
  assert.equal(h.missing[0].id, 'arithmetic.order');
  assert.equal(h.missing[0].track, 'arithmetic');
  assert.equal(h.missing[0].title, 'Order of operations');
  assert.ok(h.missing[0].why);
  assert.deepEqual(plain(G.hint('algebra.expressions', new Set(['arithmetic.order']))), { ready: true, missing: [] });
});

test('layers put a chapter one layer after its deepest prerequisite', () => {
  const g = graph([ch('a'), ch('b', ['a']), ch('c'), ch('d', ['a', 'b'])]);
  assert.deepEqual(plain(G.layers('t', g)), [['a', 'c'], ['b'], ['d']]);
  assert.deepEqual(plain(G.layers('algebra')), [['algebra.expressions'], ['algebra.expanding'], ['algebra.linear', 'algebra.factoring'], ['algebra.quadratics']]);
  assert.deepEqual(plain(G.layers('arithmetic')), [['arithmetic.order'], ['arithmetic.negatives', 'arithmetic.fractions'], ['arithmetic.powers', 'arithmetic.ratios']]);
  assert.deepEqual(plain(G.layers('geometry')), [['geometry.area', 'geometry.angles'], ['geometry.pythagoras', 'geometry.circles']], 'prerequisites in other tracks do not add layers');
  assert.deepEqual(plain(G.layers('trigonometry')), [['trigonometry.ratios']]);
});

test('trackMap puts tracks in columns by depth and drops links implied through another track', () => {
  assert.deepEqual(plain(G.trackMap()), {
    cols: [['arithmetic'], ['algebra', 'geometry'], ['trigonometry']],
    links: [['arithmetic', 'algebra'], ['arithmetic', 'geometry'], ['geometry', 'trigonometry']],
  });
});

test('trackEdges and nextUp', () => {
  assert.deepEqual(plain(G.trackEdges()), [['arithmetic', 'algebra'], ['arithmetic', 'geometry'], ['geometry', 'trigonometry'], ['arithmetic', 'trigonometry']]);
  assert.deepEqual(plain(G.nextUp(new Set())), ['arithmetic.order', 'geometry.angles']);
  assert.deepEqual(plain(G.nextUp(new Set(['arithmetic.order']))), ['arithmetic.negatives', 'arithmetic.fractions', 'algebra.expressions'], 'at most 3, in graph order');
  assert.deepEqual(plain(G.nextUp(new Set(['arithmetic.order', 'arithmetic.negatives', 'arithmetic.fractions', 'algebra.expressions']))),
    ['arithmetic.powers', 'arithmetic.ratios', 'algebra.expanding']);
  const every = G.tracks.flatMap(t => G.chapters[t.id].map(c => c.id));
  assert.deepEqual(plain(G.nextUp(new Set(every))), []);
});

test('labelLines wraps on a word boundary and truncates with an ellipsis', () => {
  assert.deepEqual(plain(G.labelLines('Order of operations', 22)), ['Order of operations']);
  const two = plain(G.labelLines('Solving linear equations and inequalities', 22));
  assert.equal(two.length, 2);
  assert.ok(two.every(l => l.length <= 22) && (two[1].endsWith('…') || two.join(' ') === 'Solving linear equations and inequalities'));
  const long = plain(G.labelLines('Supercalifragilistic expialidocious mathematics everywhere', 22));
  assert.ok(long.length <= 2 && long.every(l => l.length <= 22) && long.at(-1).endsWith('…'));
  assert.deepEqual(plain(G.labelLines('Antidisestablishmentarianism', 22)).map(l => l.length), [22]);
});

test('landing card keys match the tracks', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(/<a class="card" href="math\/"[^>]*data-subject="math"/.test(html), 'math card with data-subject');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'shared/catalog.js'), 'utf8'), sandbox);
  assert.deepEqual(plain(sandbox.Catalog.QUESTS.filter(q => q.subject === 'math').map(q => q.key)), plain(G.tracks.map(t => t.key)));
});
