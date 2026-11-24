// Data Structures Quest practice contract: sig and tree rules, nothing rule, runner registry, generators, and the walk over real missions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngines } from './practice-engines.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'programming', 'ds-quest');
const load = (...files) => {
  const sandbox = {};
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
  return sandbox;
};
const P = load('practice.js').DSQ.practice;
const plain = (v) => JSON.parse(JSON.stringify(v));
const sig = (args, ret) => ({ args, ret });

test('sig: valid and invalid shapes', () => {
  const ok = [
    ['fn', sig([['a', 'int'], ['b', 'strs']], 'bool')],
    ['fn', sig([], 'void')],
    ['fn', sig([['t', 'tree']], 'tree')],
    ['fn', sig([['l', 'list']], 'list')],
    ['method', sig([['x', 'int']], 'void')],
  ];
  for (const [k, s] of ok) assert.doesNotThrow(() => P.checkSig(s, k), JSON.stringify(s));
  const bad = [
    ['fn', sig([['a', 'float']], 'int'), /bad type/],
    ['fn', sig([['a', 'void']], 'int'), /bad type/],
    ['fn', sig([['a', 'int']], 'nope'), /return type/],
    ['fn', sig([['a', 'int'], ['a', 'int']], 'int'), /duplicate/],
    ['fn', sig([['a']], 'int'), /\[name,type\]/],
    ['fn', sig([['l', 'list']], 'void'), /must return it/],
    ['fn', sig([['t', 'tree']], 'void'), /must return it/],
    ['method', sig([['l', 'list']], 'int'), /cannot take a list/],
    ['method', sig([['t', 'tree']], 'int'), /cannot take a tree/],
    ['method', sig([], 'list'), /cannot return a list/],
    ['method', sig([], 'tree'), /cannot return a tree/],
  ];
  for (const [k, s, re] of bad) assert.throws(() => P.checkSig(s, k), re, JSON.stringify(s));
});

test('tree: round trips, empty tree, and rejected encodings', () => {
  for (const t of [[], [8], [8, -1, 10, -1, 12], [5, 3, 8, 1, 4, 7, 9], [1, 2, -1, 3]]) {
    assert.deepEqual(plain(P.encodeTree(P.decodeTree(t))), t);
  }
  assert.equal(P.decodeTree([]), null);
  assert.throws(() => P.decodeTree([8, -1, 10, -1, -1, -1, 12]), /heap-style/);
  assert.throws(() => P.decodeTree([8, -1]), /trailing -1/);
  assert.throws(() => P.decodeTree([-1]), /start with -1/);
  assert.throws(() => P.decodeTree([-1, 3]), /start with -1/);
  assert.throws(() => P.decodeTree([8, -2]), /-1, or 0|-1 or 0/);
  assert.throws(() => P.decodeTree([8, 1.5]), /integers/);
  assert.throws(() => P.decodeTree('8'), /array/);
});

const FN = (tests, extra = {}) => ({ fn: { name: 'f', sig: sig([['xs', 'ints'], ['k', 'int']], 'int'), tests }, ...extra });

test('values: each type accepts its own and rejects others', () => {
  const good = { int: 3, bool: false, str: 'a', ints: [-1, 2], strs: ['a'], list: [0, 4], tree: [8, -1, 10], void: undefined };
  for (const [t, v] of Object.entries(good)) assert.doesNotThrow(() => P.checkValue(v, t), t);
  const bad = { int: 1.5, bool: 0, str: 1, ints: [1, 'a'], strs: [1], list: [-1], tree: [8, -1], void: 3 };
  for (const [t, v] of Object.entries(bad)) assert.throws(() => P.checkValue(v, t), /is not a|tree/, t);
});

test('nothing rule: never an input for int, ints, str, strs; skipped for list and tree', () => {
  const blk = (args, types, nothing) => ({ nothing, fn: { name: 'f', sig: sig(types.map((t, i) => ['a' + i, t]), 'int'), tests: [{ args, want: 0 }] } });
  assert.doesNotThrow(() => P.checkBlock(blk([3], ['int'], -1)));
  assert.throws(() => P.checkBlock(blk([-1], ['int'], -1)), /nothing/);
  assert.throws(() => P.checkBlock(blk([[1, -1]], ['ints'], -1)), /nothing/);
  assert.throws(() => P.checkBlock(blk([''], ['str'], '')), /nothing/);
  assert.throws(() => P.checkBlock(blk([['a', '']], ['strs'], '')), /nothing/);
  assert.doesNotThrow(() => P.checkBlock(blk([[1, 2]], ['ints'], 0)));
  // list holds 0 or more, so the nothing value -1 never collides; a negative entry fails on its own rule
  assert.doesNotThrow(() => P.checkBlock(blk([[0, 3]], ['list'], -1)));
  assert.throws(() => P.checkBlock(blk([[0, -1]], ['list'], -1)), /not a list/);
  assert.doesNotThrow(() => P.checkBlock(blk([[8, -1, 10]], ['tree'], -1)));
  assert.throws(() => P.checkBlock(blk([[-1, 3]], ['tree'], -1)), /tree/);
});

test('block: fn and class forms, call sequences', () => {
  assert.doesNotThrow(() => P.checkBlock(FN([{ args: [[1, 2], 1], want: 2 }])));
  assert.throws(() => P.checkBlock(FN([{ args: [[1, 2]], want: 2 }])), /expects 2 args/);
  assert.throws(() => P.checkBlock(FN([{ args: [[1, 2], 1], want: 'x' }])), /not a int/);
  assert.throws(() => P.checkBlock({}), /exactly one/);
  assert.throws(() => P.checkBlock(FN([])), /needs tests/);
  const cls = (tests, methods = { add: sig([['x', 'int']], 'void'), size: sig([], 'int') }) => ({ cls: { name: 'Box', methods, tests } });
  assert.doesNotThrow(() => P.checkBlock(cls([[{ m: 'add', args: [1] }, { m: 'size', args: [], want: 1 }]])));
  assert.throws(() => P.checkBlock(cls([[{ m: 'pop', args: [] }]])), /unknown method 'pop'/);
  assert.throws(() => P.checkBlock(cls([[{ m: 'size', args: [], want: 'a' }]])), /not a int/);
  assert.throws(() => P.checkBlock(cls([[{ m: 'a', args: [] }]], { a: sig([['l', 'list']], 'int') })), /cannot take a list/);
});

test('registry: real scripts decide availability, lazily, and never throw', () => {
  const sb = load('practice.js');
  const R = sb.DSQ.practice.runnerAvailable;
  for (const l of ['js', 'py', 'cpp', 'rs', 'ts', 'nope']) assert.equal(R(l), false, l);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'engine.js'), 'utf8'), sb, { filename: 'engine.js' });
  assert.equal(R('js'), true);
  vm.runInContext('const PY={}', sb);
  assert.equal(R('py'), true);
  assert.equal(R('cpp'), false);
  vm.runInContext('const CPP={}', sb);
  assert.equal(R('cpp'), true);
  assert.equal(R('rs'), false);
  vm.runInContext('globalThis.RQ={}', sb);
  assert.equal(R('rs'), true);
  assert.equal(R('ts'), false);
  assert.equal(R('constructor'), false);
});

test('registry: an engine that failed while starting reads as unavailable', () => {
  const sb = load('practice.js');
  assert.throws(() => vm.runInContext("const PY=(()=>{throw new Error('x')})()", sb), /x/);
  assert.equal(sb.DSQ.practice.runnerAvailable('py'), false);
});

const ramp = { gen: 'ramp', n: 5 };
const pairs = (part, extra = {}) => ({ gen: 'pairs', n: 3, q: 2, part, ...extra });
const words = (part, extra = {}) => ({ gen: 'words', n: 4, part, ...extra });
const gcase = (args, want, types, ret) => P.checkCase({ args, want }, sig(types.map((t, i) => ['a' + i, t]), ret));

test('generators: bad kind, parameters and parts give clear errors', () => {
  assert.throws(() => P.checkGen({ gen: 'spiral', n: 1 }, 'ints'), /unknown generator kind 'spiral'/);
  assert.throws(() => P.checkGen({ gen: 'toString' }, 'ints'), /unknown generator kind/);
  assert.throws(() => P.checkGen({ gen: 'ramp' }, 'ints'), /needs parameter 'n'/);
  assert.throws(() => P.checkGen({ gen: 'ramp', n: 0 }, 'ints'), /ramp.n must be/);
  assert.throws(() => P.checkGen({ gen: 'ramp', n: 2.5 }, 'ints'), /ramp.n must be/);
  assert.throws(() => P.checkGen({ gen: 'ramp', n: 3, step: 'a' }, 'ints'), /ramp.step must be/);
  assert.throws(() => P.checkGen({ gen: 'ramp', n: 3, q: 1 }, 'ints'), /no parameter 'q'/);
  assert.throws(() => P.checkGen({ gen: 'ramp', n: 3, part: 'x' }, 'ints'), /takes no part/);
  assert.throws(() => P.checkGen({ gen: 'pairs', n: 3, q: 2 }, 'ints'), /needs a part/);
  assert.throws(() => P.checkGen(pairs('rows'), 'ints'), /no part 'rows'/);
  assert.throws(() => P.checkGen({ gen: 'pairs', n: 3, part: 'keys' }, 'ints'), /needs parameter 'q'/);
  assert.throws(() => P.checkGen(words('text', { n: -1 }), 'str'), /words.n must be/);
  assert.doesNotThrow(() => P.checkGen({ gen: 'ramp', n: 3, start: -2, step: 2 }, 'ints'));
});

test('generators: the kind type must match the slot type', () => {
  assert.throws(() => P.checkGen(ramp, 'str'), /gives ints, but the slot is str/);
  assert.throws(() => P.checkGen(words('text'), 'strs'), /gives str, but the slot is strs/);
  assert.throws(() => P.checkGen(words('want'), 'ints'), /gives strs/);
  assert.throws(() => P.checkGen(pairs('keys'), 'bool'), /gives ints or strs/);
  assert.doesNotThrow(() => P.checkGen(words('want'), 'strs'));
  assert.doesNotThrow(() => P.checkGen(pairs('keys'), 'strs'));
});

test('generators: slots of one case share one expansion', () => {
  const types = ['ints', 'ints', 'ints'];
  assert.doesNotThrow(() => gcase([pairs('keys'), pairs('vals'), pairs('queries')], pairs('want'), types, 'ints'));
  assert.doesNotThrow(() => gcase([words('text')], words('want'), ['str'], 'strs'));
  assert.throws(() => gcase([pairs('keys'), pairs('vals', { n: 4 }), pairs('queries')], pairs('want'), types, 'ints'), /same parameters/);
  assert.throws(() => gcase([words('text', { n: 9 })], words('want'), ['str'], 'strs'), /same parameters/);
  assert.throws(() => gcase([pairs('keys'), pairs('keys'), pairs('queries')], undefined, types, 'ints'), /used twice/);
  assert.throws(() => gcase([words('text'), words('text')], undefined, ['str', 'str'], 'int'), /used twice/);
  assert.throws(() => gcase([pairs('keys'), pairs('vals'), pairs('queries')], pairs('want'), ['ints', 'ints', 'strs'], 'ints'), /queries must be the same type/);
  assert.doesNotThrow(() => gcase([ramp, ramp], undefined, ['ints', 'ints'], 'int'));
});

test('generators: pairs vals and want must have the same type', () => {
  const ok = [pairs('keys'), pairs('vals'), pairs('queries')];
  assert.doesNotThrow(() => gcase(ok, pairs('want'), ['ints', 'strs', 'ints'], 'strs'));
  assert.throws(() => gcase(ok, pairs('want'), ['ints', 'strs', 'ints'], 'ints'), /want must be the same type as vals/);
  assert.throws(() => gcase(ok, pairs('want'), ['ints', 'ints', 'ints'], 'strs'), /want must be the same type as vals/);
});

test('generators: expansion is checked against the value set', () => {
  assert.doesNotThrow(() => P.checkExpanded([1, 2], 'ints'));
  assert.throws(() => P.checkExpanded([1, 'a'], 'ints'), /not a ints/);
  assert.throws(() => P.checkExpanded('x', 'strs'), /not a strs/);
  const fake = { ramp: (g) => Array.from({ length: g.n }, (_, i) => i), pairs: () => [1], words: () => 'a b' };
  const c = { args: [ramp, [9]], want: ramp };
  const a = plain(P.expandCase(c, fake));
  assert.deepEqual(a, plain(P.expandCase(c, fake)));
  assert.deepEqual(a, { args: [[0, 1, 2, 3, 4], [9]], want: [0, 1, 2, 3, 4] });
  assert.doesNotThrow(() => P.checkExpanded(a.args[0], 'ints'));
});

test('walk: real missions pass (every practice block in the content); fixtures prove it bites', () => {
  const D = load('engine.js', 'content.js', 'practice.js').DSQ;
  assert.doesNotThrow(() => D.practice.checkAll(D.CH));
  const good = FN([{ args: [[1, 2], 1], want: 2 }]);
  const wrap = (practice) => [{ missions: [{ title: 'a' }, { title: 'b', practice }] }];
  assert.doesNotThrow(() => D.practice.checkAll(wrap(good)));
  assert.throws(() => D.practice.checkAll(wrap(FN([{ args: [[1, 2]], want: 2 }]))), /mission 0\.1: .*expects 2 args/);
  assert.throws(() => D.practice.checkAll(wrap(FN([{ args: [ramp, 1], want: 'x' }]))), /mission 0\.1/);
  assert.throws(() => D.practice.checkAll(wrap(FN([{ args: [{ gen: 'zig' }, 1], want: 2 }]))), /unknown generator kind/);
});

test('walk: expands generators, so a real or fake expansion is checked', () => {
  const D = load('engine.js', 'content.js', 'practice.js').DSQ;
  const wrap = (practice) => [{ missions: [{ title: 'a', practice }] }];
  const blk = wrap(FN([{ args: [{ gen: 'ramp', n: 3 }, 1], want: 2 }]));
  assert.doesNotThrow(() => D.practice.checkAll(blk));
  assert.doesNotThrow(() => D.practice.checkAll(blk, { ramp: () => [0, 1, 2] }));
  assert.throws(() => D.practice.checkAll(blk, { ramp: () => 'x' }), /mission 0\.0: .*not a ints/);
  assert.throws(() => D.practice.checkAll(blk, { ramp: () => [0.5] }), /not a ints/);
});

const ex = (g, types, nothing) => P.EXPANDERS[g.gen](g, { type: types && types[g.part], types: types || {}, nothing });
const NOTHINGS = [undefined, -1, 0, 1, 4, 7, '', 'k0', 'm0', 'v0', 'a', 'b', 'none'];

test('expanders: ramp gives n values from start by step, defaulting to 0 and 1', () => {
  assert.deepEqual(plain(ex({ gen: 'ramp', n: 5 })), [0, 1, 2, 3, 4]);
  assert.deepEqual(plain(ex({ gen: 'ramp', n: 3, start: 10 })), [10, 11, 12]);
  assert.deepEqual(plain(ex({ gen: 'ramp', n: 4, start: 5, step: -2 })), [5, 3, 1, -1]);
  assert.deepEqual(plain(ex({ gen: 'ramp', n: 3, step: 0 })), [0, 0, 0]);
  assert.equal(ex({ gen: 'ramp', n: 2000 }).length, 2000);
});

const pairsParts = (g, types, nothing) => Object.fromEntries(['keys', 'vals', 'queries', 'want'].map((p) => [p, plain(ex({ ...g, part: p }, types, nothing))]));
const T = (keys, vals) => ({ keys, queries: keys, vals, want: vals });

test('expanders: pairs gives distinct keys, vals, queries that hit a key, and the want for each query', () => {
  for (const [kt, vt] of [['ints', 'ints'], ['ints', 'strs'], ['strs', 'ints'], ['strs', 'strs']]) {
    for (const [n, q] of [[1, 1], [5, 9], [30, 30], [12, 3]]) {
      const r = pairsParts({ gen: 'pairs', n, q }, T(kt, vt));
      assert.equal(r.keys.length, n);
      assert.equal(new Set(r.keys).size, n, 'keys are distinct');
      assert.equal(r.vals.length, n);
      assert.equal(r.queries.length, q);
      if (kt === 'ints') assert.ok(r.keys.every((k) => Number.isInteger(k) && k >= 0));
      else assert.ok(r.keys.every((k) => typeof k === 'string' && k.length > 0));
      if (vt === 'strs') assert.ok(r.vals.every((v) => typeof v === 'string' && v.length > 0));
      r.queries.forEach((x, i) => assert.deepEqual(r.want[i], r.vals[r.keys.indexOf(x)], `query ${i} hits a key`));
      P.checkExpanded(r.keys, kt); P.checkExpanded(r.vals, vt); P.checkExpanded(r.queries, kt); P.checkExpanded(r.want, vt);
    }
  }
});

test('expanders: pairs with a nothing value misses on every fourth query and wants nothing there', () => {
  const r = pairsParts({ gen: 'pairs', n: 6, q: 10 }, T('ints', 'ints'), -1);
  assert.equal(r.queries.length, 10);
  r.queries.forEach((x, i) => {
    if (i % 4 === 3) { assert.equal(r.keys.includes(x), false, `query ${i} misses`); assert.equal(r.want[i], -1); } else assert.equal(r.want[i], r.vals[r.keys.indexOf(x)]);
  });
  const s = pairsParts({ gen: 'pairs', n: 4, q: 8 }, T('strs', 'strs'), '');
  assert.deepEqual(s.want.filter((_, i) => i % 4 === 3), ['', '']);
  assert.ok(s.queries.every((x, i) => i % 4 === 3 || s.keys.includes(x)));
  const none = pairsParts({ gen: 'pairs', n: 6, q: 10 }, T('ints', 'ints'), undefined);
  assert.ok(none.queries.every((x) => none.keys.includes(x)), 'no nothing means no miss queries');
});

test('expanders: pairs and words never produce the nothing value, in any slot', () => {
  for (const nothing of NOTHINGS) {
    for (const [kt, vt] of [['ints', 'ints'], ['strs', 'strs'], ['ints', 'strs']]) {
      const r = pairsParts({ gen: 'pairs', n: 9, q: 12 }, T(kt, vt), nothing);
      for (const p of ['keys', 'vals', 'queries']) assert.equal(r[p].includes(nothing), false, `${p} ${kt}/${vt} nothing=${JSON.stringify(nothing)}`);
      r.want.forEach((w, i) => { if (w === nothing) assert.equal(i % 4, 3, 'only a miss query wants nothing'); });
    }
    const text = ex({ gen: 'words', n: 30, part: 'text' }, { text: 'str', want: 'strs' }, nothing);
    assert.notEqual(text, nothing);
    assert.equal(text.split(' ').includes(nothing), false, `words nothing=${JSON.stringify(nothing)}`);
  }
  // a block with a nothing value passes the walk's nothing rule on the real expansion
  const blk = { nothing: -1, fn: { name: 'lookup', sig: sig([['keys', 'ints'], ['vals', 'ints'], ['queries', 'ints']], 'ints'),
    tests: [{ args: [pairs('keys', { n: 20, q: 20 }), pairs('vals', { n: 20, q: 20 }), pairs('queries', { n: 20, q: 20 })], want: pairs('want', { n: 20, q: 20 }) }] } };
  assert.doesNotThrow(() => P.checkBlock(blk));
  assert.doesNotThrow(() => P.checkBlock({ ...blk, nothing: 1 }), 'keys that would be 1 skip it');
});

test('expanders: words are distinct lowercase words, word i appears (i % 3) + 1 times, first seen in index order', () => {
  const n = 40, ty = { text: 'str', want: 'strs' };
  const text = ex({ gen: 'words', n, part: 'text' }, ty), want = plain(ex({ gen: 'words', n, part: 'want' }, ty));
  const ws = text.split(' ');
  const order = [...new Set(ws)];
  assert.equal(order.length, n);
  assert.ok(order.every((w) => /^[a-z]+$/.test(w)));
  const counts = order.map((w) => ws.filter((x) => x === w).length);
  assert.deepEqual(counts, order.map((_, i) => (i % 3) + 1));
  assert.deepEqual(want, order.map((w, i) => `${w} ${(i % 3) + 1}`));
  assert.deepEqual(plain(ex({ gen: 'words', n: 4, part: 'want' }, ty)), ['a 1', 'b 2', 'c 3', 'd 1']);
  assert.equal(ex({ gen: 'words', n: 4, part: 'text' }, ty), 'a b c d b c c');
  assert.equal(new Set(plain(ex({ gen: 'words', n: 800, part: 'want' }, ty))).size, 800, 'distinct past 26 and 702');
  P.checkExpanded(text, 'str'); P.checkExpanded(want, 'strs');
});

test('expanders: two expansions of the same arguments are equal, with no random or date input', () => {
  const cases = [{ gen: 'ramp', n: 50 }, ...['keys', 'vals', 'queries', 'want'].map((p) => ({ gen: 'pairs', n: 25, q: 25, part: p })), ...['text', 'want'].map((p) => ({ gen: 'words', n: 25, part: p }))];
  const ty = { ...T('ints', 'strs'), text: 'str' };
  for (const g of cases) assert.deepEqual(plain(ex(g, ty, -1)), plain(ex(g, ty, -1)), `${g.gen}.${g.part}`);
  const realRandom = Math.random, realNow = Date.now;
  Math.random = () => { throw new Error('random used'); }; Date.now = () => { throw new Error('date used'); };
  try { for (const g of cases) ex(g, ty, -1); } finally { Math.random = realRandom; Date.now = realNow; }
});

test('expandCase: gives each expander its slot type, the types of the case and the nothing value', () => {
  const seen = [];
  const spy = { pairs: (g, ctx) => { seen.push([g.part, ctx.type, plain(ctx.types), ctx.nothing]); return g.part === 'want' ? ['x'] : g.part === 'vals' ? ['x'] : [1]; }, ramp: () => [0] };
  const s = sig([['k', 'ints'], ['v', 'strs'], ['q', 'ints']], 'strs');
  P.expandCase({ args: [pairs('keys'), pairs('vals'), pairs('queries')], want: pairs('want') }, spy, s, -1);
  assert.deepEqual(seen.map((x) => x.slice(0, 2)), [['keys', 'ints'], ['vals', 'strs'], ['queries', 'ints'], ['want', 'strs']]);
  assert.deepEqual(seen[0][2], { keys: 'ints', vals: 'strs', queries: 'ints', want: 'strs' });
  assert.ok(seen.every((x) => x[3] === -1));
});

test('expandCase: a literal is copied, so learner code that changes its argument cannot change the block', () => {
  const blk = fn('top', [['xs', 'ints']], 'int', [{ args: [[3, 1, 2]], want: 2 }]);
  const popper = 'function top(xs){const t=xs.pop();return t}';
  assert.deepEqual(statuses(run('js', popper, blk)), ['pass']);
  assert.deepEqual(statuses(run('js', popper, blk)), ['pass'], 'a second run sees the same args');
  assert.deepEqual(blk.fn.tests[0].args, [[3, 1, 2]]);
});

test('expanders: the real ones run through the walk and a runner on a block', () => {
  const blk = { fn: { name: 'f', sig: sig([['xs', 'ints']], 'ints'), tests: [{ args: [{ gen: 'ramp', n: 4, start: 2 }], want: { gen: 'ramp', n: 4, start: 2 } }] } };
  assert.doesNotThrow(() => P.checkBlock(blk));
  assert.deepEqual(statuses(run('js', 'function f(xs){return xs}', blk)), ['pass']);
  assert.deepEqual(statuses(run('js', 'function f(xs){return xs.slice(1)}', blk)), ['wrong']);
});

test('walk #312: the nothing rule runs on each expanded case, and names the slot', () => {
  const blk = (ret, type, ex) => [{ nothing: -1, fn: { name: 'f', sig: sig([['xs', type]], ret), tests: [{ args: [ramp], want: 0 }] } }, { ramp: () => ex }];
  const [ints, fakeInts] = blk('int', 'ints', [3, -1, 4]);
  assert.throws(() => P.checkBlock(ints, 'practice', fakeInts), /fn test 0 \(expanded\) arg 0: the nothing value -1 is used as an input/);
  // a generator cannot sit in a list slot (checkGen), so a negative there never reaches the walk; a bad value in an ints slot does
  const [bad, fakeBad] = blk('int', 'ints', [3, 4.5]);
  assert.throws(() => P.checkBlock(bad, 'practice', fakeBad), /fn test 0 slot 0: .*not a ints/);
  const [list] = blk('int', 'list', [3]);
  assert.throws(() => P.checkBlock(list, 'practice'), /ramp gives ints, but the slot is list/);
  const [ok, fakeOk] = blk('int', 'ints', [3, 4]);
  assert.doesNotThrow(() => P.checkBlock(ok, 'practice', fakeOk));
});

test('walk #313: a generator whose output changes between expansions is rejected', () => {
  const blk = FN([{ args: [{ gen: 'ramp', n: 2 }, 1], want: 2 }]);
  let calls = 0;
  assert.throws(() => P.checkBlock(blk, 'practice', { ramp: () => [calls++, 1] }), /fn test 0: generator is not deterministic/);
  assert.doesNotThrow(() => P.checkBlock(blk, 'practice', { ramp: () => [1, 1] }));
});

test('block: a fn case needs a want unless it returns void; bad class steps fail clearly', () => {
  assert.throws(() => P.checkBlock(FN([{ args: [[1, 2], 1] }])), /needs a want/);
  const listFn = { fn: { name: 'f', sig: sig([['l', 'list']], 'list'), tests: [{ args: [[1]] }] } };
  assert.throws(() => P.checkBlock(listFn), /needs a want/);
  const cls = (tests) => ({ cls: { name: 'Box', methods: { size: sig([], 'int') }, tests } });
  assert.throws(() => P.checkBlock(cls([null])), /must be a list of steps/);
  assert.throws(() => P.checkBlock(cls([[null]])), /step 0 must be an object/);
  assert.doesNotThrow(() => P.checkBlock(cls([[{ m: 'size', args: [] }]])));
});

test('block: fn and cls need a well-formed name', () => {
  const t = [{ args: [[1, 2], 1], want: 2 }];
  const withName = (name) => ({ fn: { name, sig: sig([['xs', 'ints'], ['k', 'int']], 'int'), tests: t } });
  assert.doesNotThrow(() => P.checkBlock(withName('isEven2')));
  for (const bad of [undefined, '', 'Reverse', 'my_fn', '2x', 7]) assert.throws(() => P.checkBlock(withName(bad)), /fn needs a camelCase name/, String(bad));
  const cls = (name) => ({ cls: { name, methods: { size: sig([], 'int') }, tests: [[{ m: 'size', args: [] }]] } });
  assert.doesNotThrow(() => P.checkBlock(cls('LinkedList')));
  for (const bad of [undefined, '', 'stack', 'Linked_List', 7]) assert.throws(() => P.checkBlock(cls(bad)), /cls needs a PascalCase name/, String(bad));
});

const E = loadEngines({ content: false });
const EP = E.DSQ.practice;
const run = (lang, src, block, opts) => plain(EP.RUNNERS[lang].run(src, block, opts));
const statuses = (rs) => rs.map((r) => r.status);
const H = (lang, ...names) => names.map((n) => EP.HELPERS[lang][n]).join('\n');
const fn = (name, args, ret, tests) => ({ fn: { name, sig: sig(args, ret), tests } });

test('loader: all four engines are available in one sandbox', () => {
  for (const l of ['js', 'py', 'cpp', 'rs']) assert.equal(EP.runnerAvailable(l), true, l);
  assert.equal(typeof E.DSQ.run, 'function');
  assert.equal(typeof E.RQ.run, 'function');
});

test('names: camelCase maps to snake_case, and the helpers map to theirs', () => {
  for (const [a, b] of [['isEven', 'is_even'], ['x', 'x'], ['fromList', 'from_list'], ['toTree', 'to_tree'], ['heightAt2', 'height_at2']]) {
    assert.equal(EP.camelToSnake(a), b);
  }
});

const SCALARS = [
  { name: 'addUp', args: [['a', 'int'], ['b', 'int']], ret: 'int', tests: [{ args: [1, 2], want: 3 }, { args: [-4, 4], want: 0 }],
    js: 'function addUp(a,b){return a+b}', py: 'def add_up(a, b):\n    return a + b' },
  { name: 'isEven', args: [['n', 'int']], ret: 'bool', tests: [{ args: [4], want: true }, { args: [7], want: false }],
    js: 'const isEven=n=>n%2===0', py: 'def is_even(n):\n    return n % 2 == 0' },
  { name: 'shout', args: [['s', 'str']], ret: 'str', tests: [{ args: ['hi'], want: 'HI!' }, { args: [''], want: '!' }],
    js: 'function shout(s){return s.toUpperCase()+"!"}', py: 'def shout(s):\n    return s.upper() + "!"' },
  { name: 'doubled', args: [['xs', 'ints']], ret: 'ints', tests: [{ args: [[1, -2, 3]], want: [2, -4, 6] }, { args: [[]], want: [] }],
    js: 'function doubled(xs){return xs.map(x=>x*2)}', py: 'def doubled(xs):\n    out = []\n    for x in xs:\n        out.append(x * 2)\n    return out' },
  { name: 'longOnes', args: [['ws', 'strs']], ret: 'strs', tests: [{ args: [['a', 'abc', 'zz', 'xyz']], want: ['abc', 'xyz'] }],
    js: 'function longOnes(ws){return ws.filter(w=>w.length>2)}', py: 'def long_ones(ws):\n    return [w for w in ws if len(w) > 2]' },
  { name: 'peek', args: [['xs', 'ints']], ret: 'void', tests: [{ args: [[1]] }],
    js: 'function peek(xs){xs.push(9)}', py: 'def peek(xs):\n    xs.append(9)' },
];

for (const lang of ['js', 'py']) {
  test(`${lang} runner: int, bool, str, ints, strs and void functions pass; a wrong one fails with its own message`, () => {
    for (const s of SCALARS) {
      const block = fn(s.name, s.args, s.ret, s.tests);
      assert.deepEqual(statuses(run(lang, s[lang], block)), s.tests.map(() => 'pass'), s.name);
    }
    const block = fn('addUp', SCALARS[0].args, 'int', SCALARS[0].tests);
    const wrong = lang === 'js' ? 'function addUp(a,b){return a-b}' : 'def add_up(a, b):\n    return a - b';
    const [r0, r1] = run(lang, wrong, block);
    assert.equal(r0.status, 'wrong');
    assert.equal(r0.msg, `${lang === 'js' ? 'addUp' : 'add_up'}(1, 2) should give 3, but gave -1`);
    assert.equal(r1.status, 'wrong', 'a-b happens to be -8 for the second case');
  });
}

const LIST_FN = (tests) => fn('reverse', [['head', 'list']], 'list', tests);
const TREE_H = fn('height', [['root', 'tree']], 'int', [{ args: [[]], want: 0 }, { args: [[5]], want: 1 }, { args: [[5, 3, 8, -1, 4]], want: 3 }]);
const INSERT = fn('insert', [['root', 'tree'], ['value', 'int']], 'tree', [
  { args: [[5, 3, 8], 4], want: [5, 3, 8, -1, 4] }, { args: [[], 7], want: [7] }, { args: [[5], 9], want: [5, -1, 9] }]);
const REVERSE = LIST_FN([{ args: [[1, 2, 3]], want: [3, 2, 1] }, { args: [[]], want: [] }, { args: [[7]], want: [7] }]);
const NODE_JS = {
  reverse: 'function reverse(head){let prev=null;while(head){const nx=head.next;head.next=prev;prev=head;head=nx}return prev}',
  height: 'function height(n){return n?1+Math.max(height(n.left),height(n.right)):0}',
  insert: `function insert(root,v){
  const n={value:v,left:null,right:null};
  if(!root)return n;
  let c=root;
  while(true){
    if(v<c.value){if(!c.left){c.left=n;break}c=c.left}
    else{if(!c.right){c.right=n;break}c=c.right}
  }
  return root;
}`,
};
const NODE_PY = {
  reverse: 'def reverse(head):\n    prev = None\n    while head is not None:\n        nx = head["next"]\n        head["next"] = prev\n        prev = head\n        head = nx\n    return prev',
  height: 'def height(n):\n    if n is None:\n        return 0\n    return 1 + max(height(n["left"]), height(n["right"]))',
  insert: `def insert(root, v):
    n = {"value": v, "left": None, "right": None}
    if root is None:
        return n
    c = root
    while True:
        if v < c["value"]:
            if c["left"] is None:
                c["left"] = n
                return root
            c = c["left"]
        else:
            if c["right"] is None:
                c["right"] = n
                return root
            c = c["right"]`,
};

test('js runner: list and tree values go through the helpers both ways', () => {
  const list = H('js', 'fromList', 'toList'), tree = H('js', 'fromTree', 'toTree');
  assert.deepEqual(statuses(run('js', `${list}\n${NODE_JS.reverse}`, REVERSE)), ['pass', 'pass', 'pass']);
  assert.deepEqual(statuses(run('js', `${tree}\n${NODE_JS.height}`, TREE_H)), ['pass', 'pass', 'pass']);
  assert.deepEqual(statuses(run('js', `${tree}\n${NODE_JS.insert}`, INSERT)), ['pass', 'pass', 'pass']);
});

test('py runner: list and tree values go through a generated wrapper and the helpers', () => {
  const list = H('py', 'fromList', 'toList'), tree = H('py', 'fromTree', 'toTree');
  assert.deepEqual(statuses(run('py', `${list}\n\n${NODE_PY.reverse}`, REVERSE)), ['pass', 'pass', 'pass']);
  assert.deepEqual(statuses(run('py', `${tree}\n\n${NODE_PY.height}`, TREE_H)), ['pass', 'pass', 'pass']);
  assert.deepEqual(statuses(run('py', `${tree}\n\n${NODE_PY.insert}`, INSERT)), ['pass', 'pass', 'pass']);
  const rs = run('py', `${list}\n\ndef reverse(head):\n    return head`, REVERSE);
  assert.equal(rs[0].msg, 'reverse([1,2,3]) should give [3,2,1], but gave [1,2,3]');
});

test('helpers: a program that returns its input round-trips lists and trees in both languages', () => {
  const lists = LIST_FN([{ args: [[]], want: [] }, { args: [[4]], want: [4] }, { args: [[3, 1, 2]], want: [3, 1, 2] }]);
  const trees = fn('same', [['root', 'tree']], 'tree', [[], [8], [5, 3, 8, 1, 4, 7, 9], [1, 2, -1, 3], [5, 3, 8, -1, 4]].map((t) => ({ args: [t], want: t })));
  const js = (name, helpers) => `${H('js', ...helpers)}\nfunction ${name}(x){return x}`;
  const py = (name, helpers) => `${H('py', ...helpers)}\n\ndef ${name}(x):\n    return x`;
  assert.deepEqual(statuses(run('js', js('reverse', ['fromList', 'toList']), lists)), ['pass', 'pass', 'pass']);
  assert.deepEqual(statuses(run('py', py('reverse', ['fromList', 'toList']), lists)), ['pass', 'pass', 'pass']);
  assert.deepEqual(statuses(run('js', js('same', ['fromTree', 'toTree']), trees)), Array(5).fill('pass'));
  assert.deepEqual(statuses(run('py', py('same', ['fromTree', 'toTree']), trees)), Array(5).fill('pass'));
});

test('helpers: the export has a template for every helper in js and py, and a slot for cpp and rs', () => {
  for (const l of ['js', 'py']) assert.deepEqual(Object.keys(EP.HELPERS[l]).sort(), ['fromList', 'fromTree', 'toList', 'toTree']);
  assert.deepEqual(Object.keys(EP.HELPERS).sort(), ['cpp', 'js', 'py', 'rs']);
});

test('cycles: a list or tree with a cycle fails its case as wrong, and the run finishes', () => {
  const jsCycle = `${H('js', 'fromList', 'toList')}\nfunction reverse(head){if(head)head.next=head;return head}`;
  const pyCycle = `${H('py', 'fromList', 'toList')}\n\ndef reverse(head):\n    if head is not None:\n        head["next"] = head\n    return head`;
  const one = LIST_FN([{ args: [[1, 2]], want: [2, 1] }]);
  for (const [lang, src] of [['js', jsCycle], ['py', pyCycle]]) assert.deepEqual(statuses(run(lang, src, one)), ['wrong'], lang);
  const loop = fn('same', [['root', 'tree']], 'tree', [{ args: [[1, 2]], want: [1, 2] }]);
  const jsTree = `${H('js', 'fromTree', 'toTree')}\nfunction same(r){r.left=r;return r}`;
  const pyTree = `${H('py', 'fromTree', 'toTree')}\n\ndef same(r):\n    r["left"] = r\n    return r`;
  for (const [lang, src] of [['js', jsTree], ['py', pyTree]]) assert.deepEqual(statuses(run(lang, src, loop)), ['wrong'], lang);
});

test('failures: a throw fails its case with the language\'s own text, and the other cases still run', () => {
  const block = fn('pick', [['k', 'int']], 'int', [{ args: [0], want: 0 }, { args: [1], want: 1 }, { args: [2], want: 2 }]);
  const js = run('js', 'function pick(k){if(k===1)throw new Error("boom");return k}', block);
  assert.deepEqual(statuses(js), ['pass', 'error', 'pass']);
  assert.equal(js[1].msg, 'Error: boom');
  const py = run('py', 'def pick(k):\n    if k == 1:\n        return [][5]\n    return k', block);
  assert.deepEqual(statuses(py), ['pass', 'error', 'pass']);
  assert.match(py[1].msg, /^IndexError: /);
});

test('failures: an endless loop reports limit in js and py, only for its own case', () => {
  const block = fn('pick', [['k', 'int']], 'int', [{ args: [0], want: 0 }, { args: [1], want: 1 }, { args: [2], want: 2 }]);
  const js = run('js', 'function pick(k){if(k===1){while(true){}}return k}', block);
  assert.deepEqual(statuses(js), ['pass', 'limit', 'pass']);
  const py = run('py', 'def pick(k):\n    if k == 1:\n        while True:\n            pass\n    return k', block);
  assert.deepEqual(statuses(py), ['pass', 'limit', 'pass']);
  const top = run('js', 'while(true){}', block);
  assert.deepEqual(statuses(top), ['limit', 'limit', 'limit']);
});

test('failures: a missing function, an empty program and a missing helper fail with a message that names it', () => {
  for (const [lang, empty, other] of [['js', '', 'function other(){}'], ['py', '', 'def other():\n    pass']]) {
    for (const src of [empty, other]) {
      const rs = run(lang, src, REVERSE);
      assert.deepEqual(statuses(rs), ['missing', 'missing', 'missing'], lang);
      assert.match(rs[0].msg, /function reverse not found/);
    }
  }
  const noHelper = run('js', `${H('js', 'fromList')}\n${NODE_JS.reverse}`, REVERSE);
  assert.equal(noHelper[0].status, 'missing');
  assert.equal(noHelper[0].msg, "keep the starter's helper `toList`");
  const noPyHelper = run('py', `${H('py', 'toList')}\n\n${NODE_PY.reverse}`, REVERSE);
  assert.equal(noPyHelper[0].msg, "keep the starter's helper `from_list`");
  const noTree = run('js', NODE_JS.height, TREE_H);
  assert.equal(noTree[0].msg, "keep the starter's helper `fromTree`");
});

test('failures: a program that does not run fails every case with the engine\'s own text', () => {
  const block = fn('pick', [['k', 'int']], 'int', [{ args: [0], want: 0 }, { args: [1], want: 1 }]);
  const js = run('js', 'function pick(k){return k', block);
  assert.deepEqual(statuses(js), ['error', 'error']);
  assert.match(js[0].msg, /^SyntaxError: /);
  const py = run('py', 'def pick(k)\n    return k', block);
  assert.deepEqual(statuses(py), ['error', 'error']);
  assert.ok(py[0].msg.length > 0);
  const ref = run('js', 'throw new Error("at load")', block);
  assert.equal(ref[0].msg, 'Error: at load');
});

test('budget: it resets per case, so two heavy cases that each fit do not add up', () => {
  const block = fn('count', [['k', 'int']], 'int', [{ args: [60000], want: 60000 }, { args: [60000], want: 60000 }, { args: [60000], want: 60000 }]);
  const js = 'function count(k){let n=0;for(let i=0;i<k;i++){n++}return n}';
  const py = 'def count(k):\n    n = 0\n    while n < k:\n        n = n + 1\n    return n';
  assert.deepEqual(statuses(run('js', js, block)), ['pass', 'pass', 'pass']);
  assert.deepEqual(statuses(run('py', py, block)), ['pass', 'pass', 'pass']);
  const big = fn('count', [['k', 'int']], 'int', [{ args: [250000], want: 250000 }]);
  assert.deepEqual(statuses(run('js', js, big)), ['limit']);
  assert.deepEqual(statuses(run('py', py, big)), ['limit']);
});

test('failures: unbounded recursion in py gives status error with a RecursionError message, and the next case still passes', () => {
  const block = fn('pick', [['k', 'int']], 'int', [{ args: [1], want: 1 }, { args: [0], want: 0 }]);
  const rs = run('py', 'def pick(k):\n    if k == 1:\n        return pick(k)\n    return k', block);
  assert.deepEqual(statuses(rs), ['error', 'pass']);
  assert.match(rs[0].msg, /^RecursionError/);
});

test('failures: a wrong answer on a long input gives a short message', () => {
  const n = 2000;
  const block = fn('same', [['xs', 'ints']], 'ints', [{ args: [{ gen: 'ramp', n }], want: { gen: 'ramp', n } }]);
  const [r] = run('js', 'function same(xs){return xs.slice(1)}', block);
  assert.equal(r.status, 'wrong');
  assert.ok(r.msg.length < 500, String(r.msg.length));
  assert.match(r.msg, /\.\.\./);
});

const STACK = {
  cls: {
    name: 'Stack',
    methods: { push: sig([['x', 'int']], 'void'), pop: sig([], 'int'), size: sig([], 'int') },
    tests: [
      [{ m: 'push', args: [1] }, { m: 'push', args: [2] }, { m: 'pop', args: [], want: 2 }, { m: 'size', args: [], want: 1 }, { m: 'size', args: [] }],
      [{ m: 'pop', args: [], want: -1 }, { m: 'size', args: [], want: 0 }],
    ],
  },
};
const STACK_JS = 'class Stack{constructor(){this.items=[]}push(x){this.items.push(x)}pop(){return this.items.length?this.items.pop():-1}size(){return this.items.length}}';

test('js runner: a class runs a call sequence on a fresh object, ignores an absent want and handles void', () => {
  assert.deepEqual(statuses(run('js', STACK_JS, STACK)), ['pass', 'pass']);
  const lowPop = STACK_JS.replace('this.items.pop()', 'this.items.shift()');
  const rs = run('js', lowPop, STACK);
  assert.deepEqual(statuses(rs), ['wrong', 'pass']);
  assert.equal(rs[0].msg, 'step 2: pop() should give 2, but gave 1');
  const noMethod = run('js', 'class Stack{push(x){}}', STACK);
  assert.deepEqual(statuses(noMethod), ['missing', 'missing']);
  assert.equal(noMethod[0].msg, 'class Stack has no method pop');
  assert.equal(run('js', '', STACK)[0].msg, 'class Stack not found in your code');
});

test('runners: Python and C++ report a class block as unsupported (not a failure)', () => {
  for (const [lang, src] of [['py', 'class Stack:\n    pass'], ['cpp', 'class Stack {};']]) {
    const rs = run(lang, src, STACK);
    assert.deepEqual(statuses(rs), ['unsupported', 'unsupported'], lang);
    assert.equal(rs[0].ok, false);
  }
});

const CPP_HEAD = '#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n';
const NATIVE = [
  { name: 'addUp', args: [['a', 'int'], ['b', 'int']], ret: 'int', tests: [{ args: [1, 2], want: 3 }, { args: [-4, 4], want: 0 }],
    cpp: 'int addUp(int a, int b) { return a + b; }', rs: 'fn add_up(a: i32, b: i32) -> i32 { a + b }' },
  { name: 'isEven', args: [['n', 'int']], ret: 'bool', tests: [{ args: [4], want: true }, { args: [7], want: false }],
    cpp: 'bool isEven(int n) { return n % 2 == 0; }', rs: 'fn is_even(n: i32) -> bool { n % 2 == 0 }' },
  { name: 'shout', args: [['s', 'str']], ret: 'str', tests: [{ args: ['hi'], want: 'hi!' }, { args: [''], want: '!' }, { args: ['say "x"'], want: 'say "x"!' }],
    cpp: 'string shout(string s) { return s + "!"; }', rs: 'fn shout(s: String) -> String { format!("{}!", s) }' },
  { name: 'doubled', args: [['xs', 'ints']], ret: 'ints', tests: [{ args: [[1, -2, 3]], want: [2, -4, 6] }, { args: [[]], want: [] }],
    cpp: 'vector<int> doubled(vector<int> xs) { vector<int> out; for (int i = 0; i < xs.size(); i++) { out.push_back(xs[i] * 2); } return out; }',
    rs: 'fn doubled(xs: Vec<i32>) -> Vec<i32> { let mut out: Vec<i32> = Vec::new(); for x in xs.iter() { out.push(*x * 2); } out }' },
  { name: 'longOnes', args: [['ws', 'strs']], ret: 'strs', tests: [{ args: [['a', 'abc', 'zz', 'xyz']], want: ['abc', 'xyz'] }, { args: [[]], want: [] }, { args: [['', 'abcd']], want: ['abcd'] }, { args: [['x', '']], want: [] }],
    cpp: 'vector<string> longOnes(vector<string> ws) { vector<string> out; for (int i = 0; i < ws.size(); i++) { if (ws[i].size() > 2) { out.push_back(ws[i]); } } return out; }',
    rs: 'fn long_ones(ws: Vec<String>) -> Vec<String> { let mut out: Vec<String> = Vec::new(); for w in ws.iter() { if w.len() > 2 { out.push(w.clone()); } } out }' },
  { name: 'peek', args: [['xs', 'ints']], ret: 'void', tests: [{ args: [[1]] }],
    cpp: 'void peek(vector<int> xs) { xs.push_back(9); }', rs: 'fn peek(mut xs: Vec<i32>) { xs.push(9); }' },
];
const nsrc = (lang, body) => (lang === 'cpp' ? CPP_HEAD : '') + body;

for (const lang of ['cpp', 'rs']) {
  test(`${lang} runner: int, bool, str, ints, strs and void functions pass`, () => {
    for (const s of NATIVE) {
      const block = fn(s.name, s.args, s.ret, s.tests);
      assert.deepEqual(statuses(run(lang, nsrc(lang, s[lang]), block)), s.tests.map(() => 'pass'), s.name);
    }
  });

  test(`${lang} runner: a wrong answer, a missing function and a missing helper fail with their own message`, () => {
    const block = fn('addUp', NATIVE[0].args, 'int', NATIVE[0].tests);
    const wrong = lang === 'cpp' ? 'int addUp(int a, int b) { return a - b; }' : 'fn add_up(a: i32, b: i32) -> i32 { a - b }';
    const [r0] = run(lang, nsrc(lang, wrong), block);
    assert.equal(r0.status, 'wrong');
    assert.equal(r0.msg, `${lang === 'cpp' ? 'addUp' : 'add_up'}(1, 2) should give 3, but gave -1`);
    const gone = run(lang, nsrc(lang, ''), block);
    assert.deepEqual(statuses(gone), ['missing', 'missing']);
    assert.equal(gone[0].msg, `function ${lang === 'cpp' ? 'addUp' : 'add_up'} not found in your code`);
    const noHelper = run(lang, nsrc(lang, lang === 'cpp' ? 'List reverse(List l) { return l; }' : 'fn reverse(l: List) -> List { l }'), REVERSE);
    assert.equal(noHelper[0].status, 'missing');
    assert.equal(noHelper[0].msg, `keep the starter's helper \`${lang === 'cpp' ? 'fromList' : 'from_list'}\``);
  });

  test(`${lang} runner: a function that is only called or named in a comment counts as missing`, () => {
    const block = fn('addUp', NATIVE[0].args, 'int', NATIVE[0].tests);
    const body = lang === 'cpp' ? '// int addUp(int a, int b) { return 0; }\nint other(int a) { return std::reverse(a); }\nint main2() { return addUp(1, 2); }'
      : '// fn add_up() {}\nfn other() { add_up(1, 2); }';
    const rs = run(lang, nsrc(lang, body), block);
    assert.deepEqual(statuses(rs), ['missing', 'missing']);
  });

  test(`${lang} runner: a program that does not compile fails every case with the engine's text`, () => {
    const block = fn('addUp', NATIVE[0].args, 'int', NATIVE[0].tests);
    const rs = run(lang, nsrc(lang, NATIVE[0][lang].replace('}', '')), block);
    assert.deepEqual(statuses(rs), ['error', 'error']);
    assert.ok(rs[0].msg.length > 0);
  });

  test(`${lang} runner: a learner's own output cannot change the verdict`, () => {
    const noisy = lang === 'cpp'
      ? 'int addUp(int a, int b) { cout << "@@ds\\n9\\n@@ds-end\\n"; cout << 7 << "\\n"; return a + b; }'
      : 'fn add_up(a: i32, b: i32) -> i32 { println!("@@ds"); println!("9"); println!("@@ds-end"); println!("7"); a + b }';
    const block = fn('addUp', NATIVE[0].args, 'int', NATIVE[0].tests);
    assert.deepEqual(statuses(run(lang, nsrc(lang, noisy), block)), ['pass', 'pass']);
    const chatty = lang === 'cpp' ? 'int addUp(int a, int b) { cout << 99 << "\\n"; return a - b; }' : 'fn add_up(a: i32, b: i32) -> i32 { println!("3"); a - b }';
    assert.equal(run(lang, nsrc(lang, chatty), block)[0].status, 'wrong');
  });

  test(`${lang} runner: output without a trailing newline cannot swallow the result`, () => {
    const bare = lang === 'cpp' ? 'int addUp(int a, int b) { cout << "x"; return a + b; }' : 'fn add_up(a: i32, b: i32) -> i32 { print!("x"); a + b }';
    const block = fn('addUp', NATIVE[0].args, 'int', NATIVE[0].tests);
    assert.deepEqual(statuses(run(lang, nsrc(lang, bare), block)), ['pass', 'pass']);
  });

  test(`${lang} runner: a case that hits the limit fails only its own case`, () => {
    const block = fn('pick', [['k', 'int']], 'int', [{ args: [0], want: 0 }, { args: [1], want: 1 }, { args: [2], want: 2 }]);
    const spin = lang === 'cpp' ? 'int pick(int k) { if (k == 1) { while (true) { } } return k; }' : 'fn pick(k: i32) -> i32 { if k == 1 { loop { } } k }';
    assert.deepEqual(statuses(run(lang, nsrc(lang, spin), block)), ['pass', 'limit', 'pass']);
  });
}

test('rs runner: a panic fails only its own case, with the panic message', () => {
  const block = fn('pick', [['k', 'int']], 'int', [{ args: [0], want: 0 }, { args: [1], want: 1 }, { args: [2], want: 2 }]);
  const rs = run('rs', 'fn pick(k: i32) -> i32 { if k == 1 { panic!("boom"); } k }', block);
  assert.deepEqual(statuses(rs), ['pass', 'error', 'pass']);
  assert.match(rs[1].msg, /boom/);
});

test('rs runner: a result that depends on HashMap order is a failed case with its own message', () => {
  const block = fn('first', [['xs', 'ints']], 'int', [{ args: [[1, 2, 3, 4, 5, 6, 7, 8]], want: 1 }]);
  const src = `use std::collections::HashMap;
fn first(xs: Vec<i32>) -> i32 {
    let mut m: HashMap<i32, i32> = HashMap::new();
    for x in xs.iter() { m.insert(*x, *x); }
    for (k, _v) in m.iter() { return *k; }
    0
}`;
  const [r] = run('rs', src, block);
  assert.equal(r.ok, false);
  assert.match(r.msg, /HashMap iteration order/);
});

test('rs runner: a class block runs one sequence per main; a call without a want is made and not printed', () => {
  const src = `struct Stack { items: Vec<i32> }
impl Stack {
    fn new() -> Stack { Stack { items: Vec::new() } }
    fn push(&mut self, x: i32) { self.items.push(x); }
    fn pop(&mut self) -> i32 { match self.items.pop() { Some(v) => v, None => -1 } }
    fn size(&self) -> i32 { self.items.len() as i32 }
}`;
  assert.deepEqual(statuses(run('rs', src, STACK)), ['pass', 'pass']);
  const low = run('rs', src.replace('self.items.pop()', 'self.items.pop().map(|v| v - 1)'), STACK);
  assert.deepEqual(statuses(low), ['wrong', 'pass'], 'the second sequence pops an empty stack, which is still -1');
  assert.equal(low[0].msg, 'step 2: pop() should give 2, but gave 1');
  assert.equal(run('rs', 'struct Stack {}', STACK)[0].msg, 'class Stack has no method push');
  assert.equal(run('rs', '', STACK)[0].msg, 'class Stack not found in your code');
});

test('runners: generators are expanded first, and a failed expansion fails its own case', () => {
  const block = fn('total', [['xs', 'ints']], 'int', [{ args: [{ gen: 'ramp', n: 3 }], want: 3 }, { args: [[1, 2]], want: 3 }]);
  const sum = 'function total(xs){return xs.reduce((a,b)=>a+b,0)}';
  assert.deepEqual(statuses(run('js', sum, block)), ['pass', 'pass'], 'the real ramp');
  const expanders = { ramp: () => { throw new Error('boom'); } };
  const rs = run('js', sum, block, { expanders });
  assert.equal(rs[0].status, 'error');
  assert.match(rs[0].msg, /boom/);
  assert.equal(rs[1].status, 'pass');
});

test('refPasses: true only when the reference answer for the language passes every case', () => {
  const block = { ...fn('addUp', SCALARS[0].args, 'int', SCALARS[0].tests), langs: { js: { answer: SCALARS[0].js }, py: { answer: 'def add_up(a, b):\n    return a - b' } } };
  assert.equal(EP.refPasses(block, 'js'), true);
  assert.equal(EP.refPasses(block, 'py'), false);
  assert.equal(EP.refPasses(block, 'cpp'), false);
  assert.equal(EP.refPasses({ ...block, langs: undefined }, 'js'), false);
});
