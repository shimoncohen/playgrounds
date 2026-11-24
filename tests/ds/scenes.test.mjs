// Data Structures Quest scene models and field-guide demos: random operation sequences keep each structure valid, every selector points at something real, and the scene contract holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'programming', 'ds-quest');
const sandbox = { setTimeout };
vm.createContext(sandbox);
for (const f of ['engine.js', 'content.js', 'scenes.js', 'draw.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
const D = sandbox.DSQ;
const SC = D.SCENES;
const plain = x => JSON.parse(JSON.stringify(x));
// The scenes run in the vm realm, so their Map and Set are not this file's.
const XMap = vm.runInContext('Map', sandbox), XSet = vm.runInContext('Set', sandbox);
const size = (d, s) => d.id === 'list' ? D.listVals(s.v).length : d.id === 'tree' ? D.treeVals(s.v).length : s.v.size ?? s.v.length;

test('every chapter has at least one demo and ids are unique', () => {
  assert.equal(new Set(D.DEMOS.map(d => d.id)).size, D.DEMOS.length);
  for (let c = 0; c < D.CH.length; c++) assert.ok(D.DEMOS.some(d => d.ch === c), `chapter ${c} has no demo`);
});

for (const d of D.DEMOS) {
  test(`${d.id} demo: random operations stay valid and explained`, () => {
    for (let run = 0; run < 40; run++) {
      const s = { v: d.init() };
      for (let step = 0; step < 60; step++) {
        const op = d.ops[Math.floor(Math.random() * d.ops.length)];
        const r = op.run(s);
        assert.equal(typeof r.say, 'string', `${d.id}.${op.label} says nothing`);
        assert.ok(r.say.length > 10);
        assert.ok(Array.isArray(r.hi));
        const n = size(d, s);
        assert.ok(n <= 11, `${d.id} grew to ${n}`);
        for (const h of [...r.hi, ...(r.walk || []).flat()]) {
          assert.equal(Object.keys(h).length, 1, 'a highlight names one thing');
          if (h.i !== undefined) assert.ok(h.i >= 0 && h.i < n, `${d.id}.${op.label} highlights box ${h.i} of ${n}`);
        }
        if (d.id === 'tree') { const v = D.treeVals(s.v); assert.deepEqual(plain(v), [...v].sort((a, b) => a - b)); assert.equal(new Set(v).size, v.length); for (const h of r.hi) assert.ok(v.includes(h.v)); }
        if (d.id === 'list') assert.ok(n <= 7);
        if (d.id === 'stack' || d.id === 'queue') assert.ok(s.v.length <= 7);
        if (d.render) assert.equal(typeof d.render(s), 'string');
      }
    }
  });
}

test('stack pops the last push, queue serves the first', () => {
  const stack = D.DEMOS.find(d => d.id === 'stack'), queue = D.DEMOS.find(d => d.id === 'queue');
  const s = { v: [] }; s.v.push(1, 2); const n = s.v[1];
  stack.ops[1].run(s); assert.deepEqual(plain(s.v), [1]); assert.equal(n, 2);
  const q = { v: [4, 5, 6] }; queue.ops[1].run(q); assert.deepEqual(plain(q.v), [5, 6]);
});

test('linked list reverse reverses and keeps every value', () => {
  const list = D.DEMOS.find(d => d.id === 'list');
  const s = { v: list.init() }; const before = D.listVals(s.v);
  list.ops.find(o => o.label === 'reverse').run(s);
  assert.deepEqual(plain(D.listVals(s.v)), plain(before).reverse());
});

test('guide examples draw something and field guide covers every chapter with a demo', () => {
  for (const g of D.GUIDE) for (const [code] of g.ex) { const r = D.run(code); assert.ok(r.names.length || r.lines.length, 'example has nothing to show: ' + code); }
});


// [label, shape, start]: the chain starts with loose nodes so link gets exercised.
const KINDS = [['row', 'row'], ['pile', 'pile'], ['line', 'line'], ['chain', 'chain', { chain: [4, 7], loose: [1, 2] }], ['map', 'buckets'], ['set', 'buckets', { set: [2, 5] }], ['tree', 'tree']];
const pickR = a => a[Math.floor(Math.random() * a.length)];
const GARBAGE = ['x'.repeat(13), '', NaN, Infinity, {}, [], null, true, 1.5];
const SELS = [{ head: true }, { i: 0 }, { i: 1 }, { i: 3 }, { l: 0 }, { l: 1 }, { i: -1 }, { l: 9 }, { head: false }, { i: '0' }, { x: 1 }, { i: 0, l: 1 }, 'x', null, []];
function randArg() {
  if (Math.random() < .4) return pickR([undefined, {}]);
  if (Math.random() < .05) return pickR([5, 'x', [1], true]);
  const a = {};
  for (const k of ['value', 'key']) if (Math.random() < .4) a[k] = Math.random() < .25 ? pickR(GARBAGE) : pickR([1, 5, 9, 'ab', '<b>', -3, 'umbrella', 'hat', 'cape']);
  for (const k of ['i', 'j']) if (Math.random() < .4) a[k] = Math.random() < .25 ? pickR(GARBAGE) : pickR([0, 1, 2, 5, 9, 11, -1]);
  for (const k of ['from', 'to']) if (Math.random() < .4) a[k] = pickR(SELS);
  return a;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const has = (list, sel) => list.some(x => same(x, sel));
const rest = ({ kind, ...sel }) => sel;

function checkStep(sc, before, s, step, where) {
  const A = sc.items(before), B = sc.items(s);
  const after = (sel, what) => assert.ok(has(B, sel), `${where}: ${what} ${JSON.stringify(sel)} is not an item after`);
  for (const h of [...step.hi, ...(step.walk || []).flat()]) { assert.equal(Object.keys(h).length, 1, `${where}: a highlight names one thing`); after(h, 'highlight'); }
  assert.deepEqual(plain(step.ptrs), plain(sc.pointers(s)), `${where}: ptrs`);
  for (const p of step.ptrs) { const { name, ...sel } = p; assert.equal(typeof name, 'string'); after(sel, 'pointer'); }
  for (const c of step.changes) {
    if (c.kind === 'remove') assert.ok(has(A, rest(c)), `${where}: remove ${JSON.stringify(rest(c))} is not an item before`);
    else if (c.kind === 'move') { assert.ok(has(A, c.from), `${where}: move from ${JSON.stringify(c.from)} not before`); after(c.to, 'move to'); }
    else if (c.kind === 'add' || c.kind === 'set') after(rest(c), c.kind);
    else if (c.kind === 'swap') { after(c.from, 'swap from'); after(c.to, 'swap to'); }
    else if (c.kind === 'relink') { after(c.from, 'relink from'); if (c.to !== null) after(c.to, 'relink to'); }
    else assert.fail(`${where}: unknown change kind ${c.kind}`);
  }
}

for (const [label, shape, start] of KINDS) {
  const sc = SC[shape];
  test(`${label}: random and invalid args keep valid, selectors point at real items, refusals change nothing, snapshots round-trip`, () => {
    for (let run = 0; run < 40; run++) {
      const s = sc.create(start);
      for (let n = 0; n < 60; n++) {
        const list = s.v instanceof XSet ?sc.setOps : sc.ops;
        const op = pickR(list);
        assert.equal(sc.op(s, op.name).name, op.name);
        const before = sc.clone(s), snap = plain(sc.snapshot(s)), arg = randArg();
        const where = `${label}.${op.name}(${JSON.stringify(arg)})`;
        const step = op.run(s, arg);
        assert.equal(sc.valid(s), null, `${where}: ${sc.valid(s)}`);
        assert.ok(step.say.length >= 10, `${where}: say too short`);
        assert.equal(typeof step.ok, 'boolean');
        if (step.ok) checkStep(sc, before, s, step, where);
        else {
          assert.ok(step.reason.length >= 10, `${where}: reason too short`);
          assert.ok(step.say.includes(step.reason));
          assert.deepEqual(plain(step.hi), []); assert.deepEqual(plain(step.changes), []);
          assert.deepEqual(plain(sc.snapshot(s)), snap, `${where}: a refusal changed the state`);
        }
        const now = plain(sc.snapshot(s)), again = sc.create(sc.snapshot(s));
        assert.deepEqual(plain(sc.snapshot(again)), now, `${where}: snapshot does not round-trip`);
        if (shape === 'tree' || shape === 'chain') assert.deepEqual(plain(again.v), plain(s.v), `${where}: shape differs after round trip`);
      }
    }
  });
}

test('ptrs is empty on an empty pile, line, chain and tree', () => {
  for (const shape of ['pile', 'line', 'chain', 'tree']) assert.deepEqual(plain(SC[shape].pointers(SC[shape].create([]))), [], shape);
  const p = SC.pile.create([1]); assert.deepEqual(plain(SC.pile.op(p, 'pop').run(p).ptrs), []);
});

test('create: defaults, valid starts and invalid starts', () => {
  assert.deepEqual(plain(SC.row.snapshot(SC.row.create())), [4, 8, 2]);
  assert.deepEqual(plain(SC.pile.snapshot(SC.pile.create())), [3, 7]);
  assert.deepEqual(plain(SC.line.snapshot(SC.line.create())), [5, 2, 9]);
  assert.deepEqual(plain(SC.chain.snapshot(SC.chain.create())), { chain: [4, 7, 1], loose: [] });
  assert.ok(SC.buckets.create().v instanceof XMap);
  assert.deepEqual(plain(SC.buckets.snapshot(SC.buckets.create())), [['umbrella', 3], ['hat', 7]]);
  assert.ok(SC.buckets.create({ set: [2, 5] }).v instanceof XSet);
  assert.deepEqual(plain(SC.tree.snapshot(SC.tree.create())), [8, 3, 10]);
  assert.deepEqual(plain(SC.pile.snapshot(SC.pile.create(['red', 'green', 'blue']))), ['red', 'green', 'blue']);
  assert.equal(SC.pile.create(['red', 'green', 'blue']).v[2], 'blue', 'the last item is the top');
  assert.deepEqual(plain(SC.chain.snapshot(SC.chain.create({ chain: [], loose: ['a', 'b', 'c'] }))), { chain: [], loose: ['a', 'b', 'c'] });
  assert.deepEqual(plain(SC.chain.snapshot(SC.chain.create([1, 2]))), { chain: [1, 2], loose: [] });
  const bad = [
    ['row', Array(11).fill(1)], ['row', 'abc'], ['row', [{}]], ['row', [NaN]], ['row', ['x'.repeat(13)]],
    ['pile', Array(8).fill(1)], ['line', Array(8).fill(1)], ['line', [null]],
    ['chain', Array(8).fill(1)], ['chain', { chain: [1, 2, 3, 4, 5], loose: [1, 2, 3] }], ['chain', [NaN]], ['chain', { chain: 'x' }],
    ['buckets', Array(6).fill(0).map((_, i) => ['k' + i, i])], ['buckets', [[1, 2]]], ['buckets', [['a', 'b']]], ['buckets', [['a', 1], ['a', 2]]],
    ['buckets', { set: [1, 2, 3, 4, 5, 6, 7] }], ['buckets', { set: ['a'] }], ['buckets', { set: [1, 1] }], ['buckets', 'x'],
    ['tree', [1, 2, 1]], ['tree', ['a']], ['tree', Array.from({ length: 12 }, (_, i) => i)], ['tree', 5]
  ];
  for (const [shape, st] of bad) assert.throws(() => SC[shape].create(st), `${shape} accepted ${JSON.stringify(st)}`);
});

test('op finds each op by name, undefined for an unknown name, and the set ops on a Set', () => {
  for (const [label, shape, start] of KINDS) {
    const sc = SC[shape], s = sc.create(start);
    for (const o of s.v instanceof XSet ?sc.setOps : sc.ops) assert.equal(sc.op(s, o.name), o);
    assert.equal(sc.op(s, 'nope'), undefined, label);
  }
  const m = SC.buckets.create(), st = SC.buckets.create({ set: [1] });
  assert.equal(SC.buckets.op(m, 'add'), undefined);
  assert.equal(SC.buckets.op(st, 'add').name, 'add');
  assert.equal(SC.buckets.op(st, 'set'), undefined);
  assert.equal(SC.buckets.op(m, 'has'), SC.buckets.ops.at(-1), 'has is last in the map ops');
});

test('clone is independent and keeps the state type', () => {
  for (const [label, shape, start] of KINDS) {
    const sc = SC[shape], s = sc.create(start), snap = plain(sc.snapshot(s)), c = sc.clone(s);
    assert.equal(Object.getPrototypeOf(c.v) === Object.getPrototypeOf(s.v) || (c.v === null && s.v === null), true, `${label}: type changed`);
    assert.deepEqual(plain(sc.snapshot(c)), snap);
    for (let n = 0; n < 30; n++) pickR(c.v instanceof XSet ?sc.setOps : sc.ops).run(c, randArg());
    assert.deepEqual(plain(sc.snapshot(s)), snap, `${label}: changing the clone changed the original`);
  }
  const ch = SC.chain.create({ chain: [1], loose: [2] }), cc = SC.chain.clone(ch);
  assert.ok(Array.isArray(cc.loose) && cc.loose.length === 1 && cc.loose[0] !== ch.loose[0] && cc.v !== ch.v);
});

const CASES = [
  ['row', undefined, 'push', { value: 5 }], ['row', undefined, 'pop', {}], ['row', undefined, 'unshift', { value: 'ab' }], ['row', undefined, 'shift', {}],
  ['row', undefined, 'read', { i: 1 }], ['row', undefined, 'indexOf', { value: 8 }], ['row', undefined, 'swap', { i: 0, j: 2 }],
  ['pile', undefined, 'push', { value: 4 }], ['pile', undefined, 'pop', {}], ['pile', undefined, 'peek', {}],
  ['line', undefined, 'enqueue', { value: 4 }], ['line', undefined, 'dequeue', {}], ['line', undefined, 'front', {}],
  ['chain', undefined, 'addFirst', { value: 6 }], ['chain', undefined, 'addLast', { value: 6 }], ['chain', undefined, 'removeFirst', {}],
  ['chain', undefined, 'find', { value: 7 }], ['chain', undefined, 'reverse', {}], ['chain', undefined, 'flip', {}], ['chain', { chain: [1, 2], loose: [3, 4] }, 'link', { from: { i: 1 }, to: { l: 1 } }],
  ['buckets', undefined, 'set', { key: 'hat', value: 4 }], ['buckets', undefined, 'set', { key: 'boot', value: 4 }], ['buckets', undefined, 'get', { key: 'hat' }],
  ['buckets', undefined, 'get', { key: 'cape' }], ['buckets', undefined, 'delete', { key: 'hat' }], ['buckets', undefined, 'has', { key: 'hat' }],
  ['buckets', { set: [2, 5] }, 'add', { value: 3 }], ['buckets', { set: [2, 5] }, 'has', { value: 2 }], ['buckets', { set: [2, 5] }, 'delete', { value: 2 }],
  ['tree', undefined, 'insert', { value: 9 }], ['tree', undefined, 'contains', { value: 3 }], ['tree', undefined, 'contains', { value: 4 }], ['tree', undefined, 'inorder', {}]
];

test('a full arg means no randomness: same clone, same arg, same step and state', () => {
  const M = vm.runInContext('Math', sandbox), real = M.random;
  M.random = () => { throw new Error('operation used randomness'); };
  try {
    for (const [shape, start, name, arg] of CASES) {
      const sc = SC[shape], s0 = sc.create(start), a = sc.clone(s0), b = sc.clone(s0);
      const r1 = sc.op(a, name).run(a, arg), r2 = sc.op(b, name).run(b, arg);
      assert.ok(r1.ok, `${shape}.${name} was refused: ${r1.reason}`);
      assert.deepEqual(plain(r1), plain(r2)); assert.deepEqual(plain(sc.snapshot(a)), plain(sc.snapshot(b)));
    }
  } finally { M.random = real; }
});

test('refusals: ok:false, a reason, nothing highlighted or changed, state untouched, never a throw', () => {
  const ten = Array(10).fill(1), seven = Array(7).fill(1), eleven = Array.from({ length: 11 }, (_, i) => i + 1);
  const R = [
    ['row', ten, 'push', { value: 1 }], ['row', ten, 'unshift', { value: 1 }], ['row', [], 'pop'], ['row', [], 'shift'], ['row', [], 'read'], ['row', [], 'indexOf'],
    ['row', [1], 'swap', {}], ['row', [1, 2, 3], 'read', { i: 5 }], ['row', [1, 2, 3], 'read', { i: -1 }], ['row', [1, 2, 3], 'swap', { i: 0, j: 9 }], ['row', [1, 2, 3], 'swap', { i: 7, j: 1 }],
    ['row', [1, 2, 3], 'swap', { i: 1, j: 1 }], ['row', [1, 2, 3], 'swap', { i: 2, j: 2 }],
    ['row', [1], 'push', { value: {} }], ['row', [1], 'push', { value: NaN }], ['row', [1], 'push', { value: Infinity }], ['row', [1], 'push', { value: '' }],
    ['row', [1], 'push', { value: 'x'.repeat(13) }], ['row', [1], 'unshift', { value: [1] }], ['row', [1], 'read', { i: '0' }], ['row', [1], 'read', { i: 0.5 }],
    ['row', [1, 2], 'swap', { i: '0', j: 1 }], ['row', [1, 2], 'swap', { i: 0, j: NaN }], ['row', [1], 'indexOf', { value: {} }], ['row', [1], 'push', 5], ['row', [1], 'pop', [1]],
    ['pile', seven, 'push', { value: 1 }], ['pile', [], 'pop'], ['pile', [], 'peek'], ['pile', [1], 'push', { value: null }],
    ['line', seven, 'enqueue', { value: 1 }], ['line', [], 'dequeue'], ['line', [], 'front'], ['line', [1], 'enqueue', { value: {} }],
    ['chain', { chain: [1, 2, 3, 4], loose: [5, 6, 7] }, 'addFirst', { value: 1 }], ['chain', { chain: [1, 2, 3, 4], loose: [5, 6, 7] }, 'addLast', { value: 1 }],
    ['chain', { chain: [1, 2, 3, 4, 5, 6, 7], loose: [] }, 'addLast', { value: 1 }], ['chain', [], 'removeFirst'], ['chain', [], 'find'], ['chain', [], 'reverse'], ['chain', [1], 'reverse'], ['chain', [], 'flip'], ['chain', [1], 'flip'],
    ['chain', [1], 'addFirst', { value: {} }], ['chain', [1], 'find', { value: {} }],
    ['chain', { chain: [1, 2], loose: [3] }, 'link', { from: { i: 0 }, to: { l: 0 } }],
    ['chain', { chain: [1, 2], loose: [3] }, 'link', { from: { head: true }, to: { l: 0 } }],
    ['chain', { chain: [], loose: [3] }, 'link', { from: { head: true }, to: { l: 5 } }],
    ['chain', { chain: [1], loose: [3] }, 'link', { from: { i: 0 }, to: { i: 0 } }],
    ['chain', { chain: [1], loose: [] }, 'link', { from: { i: 0 }, to: { l: 0 } }], ['chain', { chain: [1], loose: [] }, 'link', {}],
    ['chain', { chain: [1], loose: [3] }, 'link', { from: 'x', to: { l: 0 } }], ['chain', { chain: [1], loose: [3] }, 'link', { from: { i: 0, l: 1 }, to: { l: 0 } }],
    ['chain', { chain: [1], loose: [3] }, 'link', { from: { i: '0' }, to: { l: 0 } }], ['chain', { chain: [1], loose: [3] }, 'link', { from: { i: 0 }, to: { l: '0' } }],
    ['chain', { chain: [1], loose: [3] }, 'link', { from: { i: 5 }, to: { l: 0 } }],
    ['chain', { chain: [], loose: [3] }, 'link', { from: { i: -1 }, to: { l: 0 } }],
    ['buckets', [['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 1]], 'set', { key: 'z', value: 1 }], ['buckets', [], 'get', {}], ['buckets', [], 'delete', {}],
    ['buckets', [['a', 1]], 'delete', { key: 'zz' }], ['buckets', [['a', 1]], 'set', { key: 'a', value: 'x' }], ['buckets', [['a', 1]], 'set', { key: 5, value: 1 }],
    ['buckets', [['a', 1]], 'get', { key: {} }], ['buckets', [['a', 1]], 'has', { key: NaN }],
    ['buckets', { set: [1, 2, 3, 4, 5, 6] }, 'add', { value: 9 }], ['buckets', { set: [] }, 'delete', {}], ['buckets', { set: [1] }, 'delete', { value: 4 }],
    ['buckets', { set: [1] }, 'add', { value: 'x' }], ['buckets', { set: [1] }, 'has', { value: {} }],
    ['tree', [8, 3], 'insert', { value: 3 }], ['tree', eleven, 'insert', { value: 99 }], ['tree', [8], 'insert', { value: 'x' }], ['tree', [8], 'insert', { value: NaN }],
    ['tree', [8], 'contains', { value: '8' }], ['tree', [], 'inorder'], ['tree', [], 'contains', {}], ['tree', [8], 'insert', true]
  ];
  for (const [shape, start, name, arg] of R) {
    const sc = SC[shape], s = sc.create(start), snap = plain(sc.snapshot(s));
    const step = sc.op(s, name).run(s, arg);
    const where = `${shape}.${name}(${JSON.stringify(arg)})`;
    assert.equal(step.ok, false, `${where} was not refused`);
    assert.ok(step.reason.length >= 10, where); assert.ok(step.say.includes(step.reason), where);
    assert.deepEqual(plain(step.hi), [], where); assert.deepEqual(plain(step.changes), [], where);
    assert.deepEqual(plain(sc.snapshot(s)), snap, `${where} changed the state`);
    assert.equal(sc.valid(s), null);
  }
});

test('swap exchanges two items and keeps the multiset', () => {
  const s = SC.row.create([1, 2, 3, 4]);
  const r = SC.row.op(s, 'swap').run(s, { i: 0, j: 3 });
  assert.deepEqual(plain(s.v), [4, 2, 3, 1]);
  assert.deepEqual(plain(r.changes), [{ kind: 'swap', from: { i: 0 }, to: { i: 3 } }]);
  assert.deepEqual(plain(r.hi), [{ i: 0 }, { i: 3 }]);
  for (let n = 0; n < 100; n++) {
    const t = SC.row.create([5, 'a', 5, 9, 'a']), before = [...t.v].sort();
    const q = SC.row.op(t, 'swap').run(t, {});
    assert.ok(q.ok); assert.deepEqual([...t.v].sort(), before);
    assert.notEqual(q.changes[0].from.i, q.changes[0].to.i);
  }
});

test('result carries the answer of each operation', () => {
  const row = SC.row.create([4, 8, 2]), res = (sc, s, n, a) => sc.op(s, n).run(s, a).result;
  assert.equal(res(SC.row, row, 'read', { i: 1 }), 8);
  assert.equal(res(SC.row, row, 'indexOf', { value: 2 }), 2);
  assert.equal(res(SC.row, row, 'indexOf', { value: 99 }), -1);
  assert.equal(res(SC.row, row, 'pop'), 2);
  assert.equal(res(SC.pile, SC.pile.create([1, 2]), 'peek'), 2);
  assert.equal(res(SC.pile, SC.pile.create([1, 2]), 'pop'), 2);
  assert.equal(res(SC.line, SC.line.create([5, 2]), 'front'), 5);
  assert.equal(res(SC.line, SC.line.create([5, 2]), 'dequeue'), 5);
  const m = SC.buckets.create();
  assert.equal(res(SC.buckets, m, 'get', { key: 'hat' }), 7);
  const miss = SC.buckets.op(m, 'get').run(m, { key: 'cape' });
  assert.equal(miss.ok, true); assert.equal(miss.result, undefined);
  assert.equal(res(SC.buckets, m, 'has', { key: 'hat' }), true);
  assert.equal(res(SC.buckets, m, 'has', { key: 'cape' }), false);
  const st = SC.buckets.create({ set: [2, 5] });
  assert.equal(res(SC.buckets, st, 'has', { value: 5 }), true);
  assert.equal(res(SC.buckets, st, 'has', { value: 6 }), false);
  const t = SC.tree.create([8, 3, 10, 1]);
  assert.equal(res(SC.tree, t, 'contains', { value: 3 }), true);
  assert.equal(res(SC.tree, t, 'contains', { value: 4 }), false);
  assert.deepEqual(plain(res(SC.tree, t, 'inorder')), [1, 3, 8, 10]);
  assert.equal(res(SC.chain, SC.chain.create(), 'find', { value: 1 }), 2);
});

test('chain link: three loose nodes join the chain in order, each step a move plus a relink', () => {
  const s = SC.chain.create({ chain: [], loose: ['a', 'b', 'c'] }), link = a => SC.chain.op(s, 'link').run(s, a);
  let r = link({ from: { head: true }, to: { l: 0 } });
  assert.ok(r.ok); assert.deepEqual(plain(r.changes), [{ kind: 'move', from: { l: 0 }, to: { i: 0 } }, { kind: 'relink', from: { head: true }, to: { i: 0 } }]);
  assert.deepEqual(plain(r.hi), [{ i: 0 }]); assert.equal(r.result, 1);
  r = link({ from: { i: 0 }, to: { l: 0 } });
  assert.deepEqual(plain(r.changes), [{ kind: 'move', from: { l: 0 }, to: { i: 1 } }, { kind: 'relink', from: { i: 0 }, to: { i: 1 } }]);
  r = link({ from: { i: 1 }, to: { l: 0 } });
  assert.ok(r.ok); assert.equal(r.result, 3);
  assert.deepEqual(plain(SC.chain.snapshot(s)), { chain: ['a', 'b', 'c'], loose: [] });
  assert.equal(SC.chain.valid(s), null);
  assert.deepEqual(plain(SC.chain.items(s)), [{ i: 0 }, { i: 1 }, { i: 2 }, { head: true }]);
});

test('chain link refusals each give their own reason, and the total of 7 holds', () => {
  const reasons = new Set();
  for (const [start, arg] of [
    [{ chain: [1, 2], loose: [3] }, { from: { i: 0 }, to: { l: 0 } }],
    [{ chain: [1], loose: [3] }, { from: { head: true }, to: { l: 0 } }],
    [{ chain: [1], loose: [3] }, { from: { i: 0 }, to: { l: 4 } }]
  ]) {
    const s = SC.chain.create(start), r = SC.chain.op(s, 'link').run(s, arg);
    assert.equal(r.ok, false); reasons.add(r.reason); assert.equal(SC.chain.valid(s), null);
  }
  assert.equal(reasons.size, 3);
  const s = SC.chain.create({ chain: [1, 2, 3], loose: [4, 5, 6, 7] });
  assert.equal(SC.chain.op(s, 'addFirst').run(s, { value: 1 }).ok, false);
  assert.equal(SC.chain.op(s, 'addLast').run(s, { value: 1 }).ok, false);
  assert.throws(() => SC.chain.create({ chain: [1, 2, 3, 4], loose: [5, 6, 7, 8] }));
  SC.chain.op(s, 'link').run(s, { to: { l: 0 } });
  assert.equal(SC.chain.op(s, 'addLast').run(s, { value: 1 }).ok, false, 'linking never frees room');
});

test('every argument value in say and reason is HTML-escaped', () => {
  const bad = '<i>x</i>', esc = '&lt;i&gt;x&lt;/i&gt;';
  const C = [
    ['row', [1], 'push', { value: bad }], ['row', [1], 'unshift', { value: bad }], ['row', [bad], 'pop'], ['row', [bad], 'shift'], ['row', [bad], 'read', { i: 0 }],
    ['row', [bad], 'indexOf', { value: bad }], ['row', [1], 'indexOf', { value: bad }], ['row', [bad, 2], 'swap', { i: 0, j: 1 }],
    ['pile', [1], 'push', { value: bad }], ['pile', [bad], 'pop'], ['pile', [bad], 'peek'],
    ['line', [1], 'enqueue', { value: bad }], ['line', [bad], 'dequeue'], ['line', [bad], 'front'],
    ['chain', [bad], 'removeFirst'], ['chain', [1], 'find', { value: bad }], ['chain', [bad], 'find', { value: bad }], ['chain', { chain: [], loose: [bad] }, 'link', { from: { head: true }, to: { l: 0 } }],
    ['chain', { chain: [1], loose: [bad] }, 'link', { from: { i: 0 }, to: { l: 0 } }],
    ['buckets', [], 'set', { key: bad, value: 1 }], ['buckets', [[bad, 1]], 'set', { key: bad, value: 2 }], ['buckets', [[bad, 1]], 'get', { key: bad }],
    ['buckets', [[bad, 1]], 'delete', { key: bad }], ['buckets', [], 'delete', { key: bad }], ['buckets', [[bad, 1]], 'has', { key: bad }], ['buckets', [], 'has', { key: bad }]
  ];
  for (const [shape, start, name, arg] of C) {
    const sc = SC[shape], s = sc.create(start), r = sc.op(s, name).run(s, arg), where = `${shape}.${name}`;
    for (const t of [r.say, r.reason].filter(Boolean)) assert.ok(!t.includes(bad), `${where} put a raw value in: ${t}`);
    assert.ok(r.say.includes(esc), `${where} does not show the escaped value: ${r.say}`);
  }
});

test('guide: row gains swap and map gains has at the end; ops keep their order; init gives the raw state', () => {
  const lab = id => plain(D.DEMOS.find(d => d.id === id).ops.map(o => o.label));
  assert.deepEqual(lab('array'), ['push', 'pop', 'unshift', 'shift', 'read', 'indexOf', 'swap']);
  assert.deepEqual(lab('stack'), ['push', 'pop', 'peek']);
  assert.deepEqual(lab('queue'), ['enqueue', 'dequeue', 'front']);
  assert.deepEqual(lab('list'), ['addFirst', 'add (end)', 'removeFirst', 'find', 'reverse']);
  assert.deepEqual(lab('map'), ['set', 'get', 'get missing', 'delete', 'has']);
  assert.deepEqual(lab('set'), ['add', 'has', 'delete']);
  assert.deepEqual(lab('tree'), ['insert', 'contains (found)', 'contains (missing)', 'in-order walk']);
  assert.deepEqual(plain(D.DEMOS.map(d => d.shape)),['row', 'pile', 'line', 'chain', 'buckets', 'buckets', 'tree']);
  for (const d of D.DEMOS) for (const o of d.ops) assert.ok(o.name && typeof o.run === 'function' && o.label);
  assert.ok(Array.isArray(D.DEMOS[0].init())); assert.ok(D.DEMOS.find(d => d.id === 'map').init() instanceof XMap);
  const set = D.DEMOS.find(d => d.id === 'set').init(); assert.ok(set instanceof XSet); assert.deepEqual(plain([...set]), [2, 5]);
  const list = D.DEMOS.find(d => d.id === 'list').init(); assert.deepEqual(plain(D.listVals(list)), [4, 7, 1]);
});

test('guide code: new swap and has lines are at most 39 characters, and no code line outgrows today\'s longest', () => {
  const lines = c => c.split('\n');
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    if (i === j) continue;
    const s = { v: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] };
    for (const l of lines(SC.row.op(s, 'swap').run(s, { i, j }).code)) assert.ok(l.length <= 39, l);
  }
  for (const k of ['umbrella', 'hat', 'scarf', 'boot', 'glove', 'x'.repeat(12)]) {
    const s = SC.buckets.create([[k, 1]]);
    for (const key of [k, 'x'.repeat(12)]) for (const l of lines(SC.buckets.op(s, 'has').run(s, { key }).code)) assert.ok(l.length <= 39, l);
  }
  for (const d of D.DEMOS) for (let run = 0; run < 30; run++) {
    const s = { v: d.init() };
    for (let n = 0; n < 40; n++) { const o = pickR(d.ops); const r = o.run(s); if (o.name !== 'inorder') for (const l of lines(r.code)) assert.ok(l.length <= 39, `${d.id}.${o.label}: ${l}`); }
  }
});

test('valid rejects hand-broken states', () => {
  const broken = [];
  broken.push([SC.row, { v: Array(11).fill(1) }], [SC.row, { v: 'x' }], [SC.row, { v: [{}] }], [SC.pile, { v: Array(8).fill(1) }], [SC.line, { v: Array(8).fill(1) }]);
  const cyc = SC.chain.create([1, 2]); cyc.v.next.next = cyc.v; broken.push([SC.chain, cyc]);
  const both = SC.chain.create({ chain: [1], loose: [2] }); both.loose.push(both.v); broken.push([SC.chain, both]);
  const dup = SC.chain.create({ chain: [1], loose: [2] }); dup.loose.push(dup.loose[0]); broken.push([SC.chain, dup]);
  const big = SC.chain.create({ chain: [1, 2, 3, 4], loose: [5, 6, 7] }); big.loose.push({ value: 8, next: null }); broken.push([SC.chain, big]);
  const linked = SC.chain.create({ chain: [1], loose: [2] }); linked.loose[0].next = linked.v; broken.push([SC.chain, linked]);
  broken.push([SC.buckets, { v: new XMap(Array.from({ length: 6 }, (_, i) => ['k' + i, i])) }], [SC.buckets, { v: [] }], [SC.buckets, { v: new XMap([['a', 'b']]) }], [SC.buckets, { v: new XSet([1, 2, 3, 4, 5, 6, 7]) }], [SC.buckets, { v: new XSet(['a']) }]);
  const unsorted = SC.tree.create([8, 3, 10]); unsorted.v.left.value = 9; broken.push([SC.tree, unsorted]);
  const tc = SC.tree.create([8, 3]); tc.v.left.left = tc.v; broken.push([SC.tree, tc]);
  const str = SC.tree.create([8]); str.v.value = '8'; broken.push([SC.tree, str]);
  const dupT = SC.tree.create([8, 3]); dupT.v.left.value = 8; broken.push([SC.tree, dupT]);
  const huge = SC.tree.create(Array.from({ length: 11 }, (_, i) => i)); let t = huge.v; while (t.right) t = t.right; t.right = { value: 99, left: null, right: null }; broken.push([SC.tree, huge]);
  for (const [sc, s] of broken) assert.equal(typeof sc.valid(s), 'string', `${sc.shape} accepted a broken state`);
  for (const [, shape, start] of KINDS) assert.equal(SC[shape].valid(SC[shape].create(start)), null);
});

test('tree values are numbers: a string value is refused with a reason', () => {
  const s = SC.tree.create(); const r = SC.tree.op(s, 'insert').run(s, { value: 'x' });
  assert.equal(r.ok, false); assert.ok(r.reason.length >= 10); assert.deepEqual(plain(SC.tree.snapshot(s)), [8, 3, 10]);
});


const escH = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hook = sel => { const k = Object.keys(sel)[0]; return `data-${k}="${k === 'head' ? 'true' : escH(sel[k])}"`; };
const plan = (shape, step, o) => plain(D.draw.plan(shape, step, o));
const run = (shape, start, name, arg) => { const sc = SC[shape], s = sc.create(start), before = sc.clone(s), step = sc.op(s, name).run(s, arg); return { s, before, step }; };

// The reduced-motion rule and the animations find items by the sc-item class, so every hook must sit on one.
const assertItemHooks = (html, where) => {
  for (const tag of html.match(/<[^>]*\sdata-(?:i|l|v|k|head)="[^>]*>/g) || []) assert.match(tag, /class="[^"]*\bsc-item\b/, `${where}: a hook is not on an sc-item: ${tag}`);
};

for (const [label, shape, start] of KINDS) {
  test(`draw ${label}: every item, highlight and pointer has a hook, before and after random operations`, () => {
    const sc = SC[shape];
    for (let r = 0; r < 20; r++) {
      const s = sc.create(start);
      for (let n = 0; n < 40; n++) {
        const before = sc.clone(s), step = pickR(s.v instanceof XSet ? sc.setOps : sc.ops).run(s, randArg());
        for (const [st, hl] of [[before, []], [s, [...step.hi, ...(step.walk || []).flat()]]]) {
          const html = D.draw[shape](st), where = `${label} after ${step.say}`;
          assert.equal(typeof html, 'string');
          assert.match(html, /^<div class="sc [^"]*" role="img" aria-label="[^"]+">/);
          for (const it of [...sc.items(st), ...hl]) assert.ok(html.includes(hook(it)), `${where}: no hook for ${JSON.stringify(it)}`);
          assertItemHooks(html, where);
          assert.ok((html.match(/\sdata-(?:i|l|v|k|head)="/g) || []).length >= sc.items(st).length, `${where}: fewer hooks than items`);
          for (const p of sc.pointers(st)) assert.ok(html.includes(`<span class="sc-ptr">${p.name}</span>`), `${where}: no label for ${p.name}`);
        }
      }
    }
  });
}

test('draw: the chain head hook is always there and loose nodes have data-l; empty structures say so', () => {
  const html = D.draw.chain(SC.chain.create({ chain: [], loose: ['a', 'b'] }));
  assert.ok(html.includes('data-head="true"') && html.includes('data-l="0"') && html.includes('data-l="1"') && !html.includes('data-i='));
  assert.ok(html.includes('>head<'));
  assert.ok(D.draw.pile(SC.pile.create([])).includes('empty stack'));
  assert.ok(D.draw.tree(SC.tree.create([])).includes('empty tree'));
  assert.ok(D.draw.buckets(SC.buckets.create({ set: [] })).includes('sc-slot'));
});

test('draw: pile shows the top first with a top label, line shows front and back', () => {
  const p = D.draw.pile(SC.pile.create(['red', 'green', 'blue']));
  assert.ok(p.indexOf('>blue<') < p.indexOf('>red<'));
  assert.ok(p.indexOf('>top<') < p.indexOf('>blue<') && p.indexOf('>top<') > p.indexOf('<div class="sc-col">'));
  const l = D.draw.line(SC.line.create([5, 2, 9]));
  assert.ok(l.includes('>front<') && l.includes('>back<'));
});

test('draw: every interpolated value is HTML-escaped, including the label', () => {
  const bad = '<i>x</i>';
  const states = [['row', [bad]], ['pile', [bad]], ['line', [bad]], ['chain', { chain: [bad], loose: [bad] }], ['buckets', [[bad, 1]]]];
  for (const [shape, start] of states) {
    const html = D.draw[shape](SC[shape].create(start));
    assert.ok(!html.includes(bad), `${shape} drew a raw value: ${html}`);
    assert.ok(html.includes('&lt;i&gt;x&lt;/i&gt;'), shape);
  }
  const t = SC.tree.create([8]); t.v.value = bad;
  assert.ok(!D.draw.tree(t).includes(bad) && D.draw.tree(t).includes('&lt;i&gt;'));
  const st = SC.buckets.create({ set: [1] }); st.v.add(bad);
  assert.ok(!D.draw.buckets(st).includes(bad));
});

test('draw: interactive gives a group with tabindex on every data-i, data-l and data-head item; otherwise role img and no tabindex', () => {
  const s = SC.chain.create({ chain: [1, 2], loose: [3] });
  const plainHtml = D.draw.chain(s), live = D.draw.chain(s, { interactive: true });
  assert.ok(plainHtml.includes('role="img"') && !plainHtml.includes('tabindex'));
  assert.ok(live.includes('role="group"') && !live.includes('role="img"'));
  const items = live.match(/<div class="sc-item[^>]*>/g);
  assert.equal(items.length, 4);
  for (const t of items) assert.ok(t.includes('tabindex="0"'), t);
  for (const shape of ['row', 'pile', 'line']) {
    const h = D.draw[shape](SC[shape].create(), { interactive: true });
    assert.ok(h.includes('role="group"') && h.match(/data-i="/g).length === h.match(/tabindex="0"/g).length, shape);
    assert.ok(D.draw[shape](SC[shape].create(), {}).includes('role="img"'));
  }
});

test('draw: the aria-label is escaped once, so a screen reader hears the value', () => {
  const html = D.draw.row(SC.row.create(['<', '&']));
  assert.ok(html.includes('aria-label="Row of 2 boxes: &lt;, &amp;"'), html);
  assert.ok(D.draw.buckets(SC.buckets.create([['<', 1]])).includes('aria-label="Map of 1 pairs: &lt; is 1"'));
  assert.ok(D.draw.tree(SC.tree.create([8])).includes('aria-label="Search tree of 1 nodes, in order: 8"'));
});

test('play: re-renders keep the interactive option, with and without a leave phase', async () => {
  for (const interactive of [true, false]) {
    const writes = [], box = { classList: { add() {}, remove() {} }, querySelectorAll: () => [] };
    Object.defineProperty(box, 'innerHTML', { set: h => writes.push(h), get: () => writes.at(-1) || '' });
    const { s, before, step } = run('row', [1, 2], 'pop');
    await new Promise(res => D.draw.play(box, 'row', before, s, step, { interactive, reduced: false, onDone: res }));
    assert.equal(writes.length, 2, 'the before picture, then the after picture');
    for (const h of writes) assert.ok(h.includes(interactive ? 'role="group"' : 'role="img"'), h);
    const r = run('row', [1, 2], 'push', { value: 3 }); writes.length = 0;
    await new Promise(res => D.draw.play(box, 'row', r.before, r.s, r.step, { interactive, reduced: true, onDone: res }));
    assert.equal(writes.length, 1); assert.ok(writes[0].includes(interactive ? 'role="group"' : 'role="img"'));
  }
});

// The box builds its elements from the HTML written to innerHTML and answers only [data-x] queries, so a wrong attribute name finds nothing.
const logBox = () => {
  const log = []; let els = [];
  const box = {
    classList: { add: c => log.push(`box+${c}`), remove: c => log.push(`box-${c}`) },
    querySelectorAll: sel => { const m = /^\[(data-[a-z]+)\]$/.exec(sel); return m ? els.filter(e => e.attrs[m[1]] !== undefined) : []; },
    get innerHTML() { return ''; },
    set innerHTML(h) {
      els = [...h.matchAll(/<[^>]*\sdata-(?:i|l|v|k|head)="[^>]*>/g)].map(([tag]) => {
        const attrs = Object.fromEntries([...tag.matchAll(/\s(data-[a-z]+)="([^"]*)"/g)].map(m => [m[1], m[2]])), id = Object.entries(attrs).map(([k, v]) => `${k}=${v}`).join(',');
        return { attrs, getAttribute: a => attrs[a] ?? null, style: { setProperty() {} }, getBoundingClientRect: () => ({ left: 0 }), classList: { add: c => log.push(`${id}+${c}`), remove: (...c) => log.push(`${id}-${c.join(',')}`) } };
      });
    },
  };
  return { box, log };
};

test('play: a refusal shakes the box, clears it after SHAKE_MS, then reports done', async () => {
  const { box, log } = logBox(), { s, before, step } = run('pile', [], 'pop');
  const t0 = Date.now();
  await new Promise(res => D.draw.play(box, 'pile', before, s, step, { reduced: false, onDone: res }));
  assert.ok(Date.now() - t0 >= D.draw.SHAKE_MS - 20);
  assert.deepEqual(log, ['box+sc-shake', 'box-sc-shake']);
});

test('play: the enter class is removed before the highlight is added', async () => {
  const { box, log } = logBox(), { s, before, step } = run('row', [1, 2], 'push', { value: 3 });
  await new Promise(res => D.draw.play(box, 'row', before, s, step, { reduced: false, onDone: res }));
  const added = log.findIndex(l => /^data-i=2\+(?!hi)/.test(l)), removed = log.findIndex(l => /^data-i=2-(?!hi)/.test(l)), hi = log.indexOf('data-i=2+hi');
  assert.ok(added >= 0 && removed > added && hi > removed, log.join(' '));
});

test('find and mark resolve every selector form against the rendered data-* hooks', () => {
  const { box, log } = logBox(), s = SC.chain.create({ chain: [1, 2], loose: [3] });
  box.innerHTML = D.draw.chain(s);
  for (const sel of [{ i: 1 }, { l: 0 }, { head: true }]) assert.ok(D.draw.find(box, sel), JSON.stringify(sel));
  assert.equal(D.draw.find(box, { i: 9 }), null);
  box.innerHTML = D.draw.pile(SC.pile.create([1, 2]));
  D.draw.mark(box, [{ i: 1 }], 'hi');
  assert.deepEqual(log, ['data-i=1+hi']);
  for (const [shape, st, sel] of [['buckets', SC.buckets.create([['hat', 1]]), { k: 'hat' }], ['buckets', SC.buckets.create({ set: [4] }), { v: 4 }], ['tree', SC.tree.create([8]), { v: 8 }]]) {
    box.innerHTML = D.draw[shape](st);
    assert.ok(D.draw.find(box, sel), `${shape} ${JSON.stringify(sel)}`);
  }
});

test('plan: reduced motion has no leave phase and no motion, and the highlights stay', () => {
  for (const [shape, start, name, arg] of CASES) {
    const { step } = run(shape, start, name, arg), p = plan(shape, step, { reduced: true });
    assert.deepEqual(p.leave, [], `${shape}.${name}`); assert.deepEqual(p.enter, []);
    assert.equal(p.leaveMs + p.enterMs, 0); assert.equal(p.shake, false);
    assert.deepEqual(p.hi, plain(step.hi));
  }
  const { step } = run('pile', [], 'pop');
  assert.equal(plan('pile', step, { reduced: true }).shake, false);
});

test('plan: drop, slide, swap, relink, loose node joins the chain, shake', () => {
  const kinds = (shape, start, name, arg) => { const p = plan(shape, run(shape, start, name, arg).step); return [...p.leave, ...p.enter].map(e => e.cls); };
  assert.deepEqual(kinds('pile', [1], 'push', { value: 4 }), ['sc-drop']);
  assert.deepEqual(kinds('pile', [1, 2], 'pop'), ['sc-out']);
  assert.deepEqual(kinds('row', [1, 2], 'push', { value: 4 }), ['sc-in']);
  assert.deepEqual(kinds('row', [1, 2], 'unshift', { value: 4 }), ['sc-slide-in', 'sc-slide-r', 'sc-slide-r']);
  assert.deepEqual(kinds('line', [1, 2, 3], 'dequeue'), ['sc-slide-out', 'sc-slide-l', 'sc-slide-l']);
  const sw = plan('row', run('row', [1, 2, 3], 'swap', { i: 0, j: 2 }).step);
  assert.deepEqual(sw.enter, [{ sel: { i: 0 }, cls: 'sc-swap', with: { i: 2 } }, { sel: { i: 2 }, cls: 'sc-swap', with: { i: 0 } }]);
  const rev = plan('chain', run('chain', [1, 2, 3], 'reverse').step);
  assert.deepEqual(rev.enter.map(e => e.cls), Array(4).fill('sc-repoint')); assert.deepEqual(rev.enter[0].sel, { head: true });
  const link = plan('chain', run('chain', { chain: [1], loose: [2] }, 'link', { from: { i: 0 }, to: { l: 0 } }).step);
  assert.deepEqual(link.enter, [{ sel: { i: 1 }, cls: 'sc-join' }, { sel: { i: 0 }, cls: 'sc-repoint' }]);
  const shake = plan('pile', run('pile', [], 'pop').step);
  assert.equal(shake.shake, true); assert.deepEqual(shake.hi, []);
  const slow = plan('row', run('row', [1], 'push', { value: 1 }).step);
  assert.ok(slow.leaveMs <= 300 && slow.enterMs <= 500);
  const pop = plan('row', run('row', [1], 'pop').step);
  assert.equal(pop.leaveMs, 300); assert.equal(pop.enterMs, 0);
  const read = plan('row', run('row', [1], 'read', { i: 0 }).step);
  assert.equal(read.leaveMs + read.enterMs, 0); assert.deepEqual(read.hi, [{ i: 0 }]);
});

const FLIP_STARTS = [[1, 2], [1, 2, 3], [4, 7, 1, 9], ['a', 'bb', 'c', 'd', 'e'], [3, 1, 4, 1, 5, 9], [1, 2, 3, 4, 5, 6, 7], ['x', 'y', 'z', 1, 2, 3, 4]];
const multiset = vals => vals.map(String).sort();
const flipAll = vals => {
  const s = SC.chain.create(vals), out = [];
  for (let k = 0; k < vals.length; k++) { const step = SC.chain.op(s, 'flip').run(s); out.push({ step, s: SC.chain.clone(s) }); }
  return { s, out };
};

test('flip: n flips give the same chain as reverse, and each flip keeps a valid chain', () => {
  for (const vals of FLIP_STARTS) {
    const { s, out } = flipAll(vals), r = SC.chain.create(vals);
    SC.chain.op(r, 'reverse').run(r);
    assert.equal(out.length, vals.length);
    assert.deepEqual(plain(SC.chain.snapshot(s)), plain(SC.chain.snapshot(r)), vals.join());
    assert.ok(!s.rest, 'rest is empty after the last flip');
    out.forEach(({ step, s: after }, k) => {
      const where = `${vals.join()} flip ${k}`;
      assert.ok(step.ok, where);
      assert.equal(SC.chain.valid(after), null, where);
      assert.deepEqual(multiset([...D.listVals(after.v), ...D.listVals(after.rest || null)]), multiset(vals), where);
      assert.equal('rest' in plain(SC.chain.snapshot(after)), k < vals.length - 1, `${where}: rest in the snapshot only mid-reversal`);
      const again = SC.chain.create(SC.chain.snapshot(after));
      assert.deepEqual(plain(SC.chain.snapshot(again)), plain(SC.chain.snapshot(after)), where);
      assert.deepEqual(plain(again.v), plain(after.v), where);
      assert.deepEqual(plain(again.rest ?? null), plain(after.rest ?? null), where);
    });
  }
});

test('flip: result, highlight, changes, pointers and plan for each flip', () => {
  const vals = [4, 7, 1, 9], { out } = flipAll(vals);
  out.forEach(({ step }, k) => {
    assert.equal(step.result, k === 0 ? undefined : vals[k - 1], `flip ${k} result`);
    assert.deepEqual(plain(step.hi), [{ i: 0 }]);
    assert.deepEqual(plain(step.changes), [{ kind: 'relink', from: { i: 0 }, to: k === 0 ? null : { i: 1 } }]);
    assert.deepEqual(plain(step.ptrs), [{ name: k === vals.length - 1 ? 'head' : 'prev', i: 0 }]);
    assert.ok(step.code.includes('cur.next = prev') && step.say.length >= 10);
    const p = plan('chain', step);
    assert.deepEqual(p.enter, [{ sel: { i: 0 }, cls: 'sc-repoint' }]); assert.deepEqual(p.leave, []);
  });
});

test('flip: create takes a rest list, counts it in the 7 nodes and checks its values', () => {
  const s = SC.chain.create({ chain: [2, 1], loose: [8], rest: [3, 4] });
  assert.deepEqual(plain(SC.chain.snapshot(s)), { chain: [2, 1], loose: [8], rest: [3, 4] });
  assert.throws(() => SC.chain.create({ chain: [1, 2, 3, 4], loose: [5, 6], rest: [7, 8] }), /rest/);
  assert.throws(() => SC.chain.create({ chain: [1], rest: [{}] }), /rest/);
  assert.throws(() => SC.chain.create({ chain: [1], rest: 'x' }), /rest/);
  const shared = { value: 1, next: null }, cyc = { value: 2, next: null };
  cyc.next = cyc;
  assert.equal(typeof SC.chain.valid({ v: shared, rest: shared, loose: [] }), 'string', 'a node in two places');
  assert.equal(typeof SC.chain.valid({ v: { value: 1, next: null }, rest: cyc, loose: [] }), 'string', 'a cycle in rest');
  assert.equal(typeof SC.chain.valid({ v: SC.chain.create([1, 2, 3, 4]).v, rest: SC.chain.create([5, 6, 7, 8]).v, loose: [] }), 'string', 'more than 7 nodes');
});

test('flip: refused on 0 or 1 nodes, and every other chain op is refused mid-reversal with the state untouched', () => {
  for (const start of [[], [5]]) {
    const s = SC.chain.create(start), step = SC.chain.op(s, 'flip').run(s);
    assert.equal(step.ok, false); assert.ok(step.reason.length >= 10); assert.deepEqual(plain(SC.chain.snapshot(s)), { chain: start, loose: [] });
  }
  const args = { addFirst: { value: 5 }, addLast: { value: 5 }, removeFirst: {}, find: { value: 1 }, reverse: {}, link: { from: { i: 0 }, to: { l: 0 } } };
  const reasons = new Set();
  for (const [name, arg] of Object.entries(args)) {
    const s = SC.chain.create({ chain: [1, 2, 3], loose: [9] });
    SC.chain.op(s, 'flip').run(s);
    const snap = plain(SC.chain.snapshot(s)), step = SC.chain.op(s, name).run(s, arg);
    assert.equal(step.ok, false, name); assert.match(step.reason, /finish flipping the arrows first/i, name);
    assert.ok(step.say.includes(step.reason)); assert.deepEqual(plain(step.hi), []); assert.deepEqual(plain(step.changes), []);
    assert.deepEqual(plain(SC.chain.snapshot(s)), snap, `${name} changed the state`);
    reasons.add(step.reason);
  }
  assert.equal(reasons.size, 1, 'one shared reason');
});

test('flip: clone mid-reversal is independent, and the unflipped nodes are not selectable', () => {
  const s = SC.chain.create([1, 2, 3, 4]); SC.chain.op(s, 'flip').run(s);
  const c = SC.chain.clone(s), snap = plain(SC.chain.snapshot(s));
  assert.deepEqual(plain(SC.chain.snapshot(c)), snap); assert.notEqual(c.rest, s.rest); assert.notEqual(c.v, s.v);
  SC.chain.op(c, 'flip').run(c);
  assert.deepEqual(plain(SC.chain.snapshot(s)), snap);
  assert.deepEqual(plain(SC.chain.items(s)), [{ i: 0 }, { head: true }]);
});

test('draw chain: a mid-reversal state draws the unflipped row without hooks, escaped, and lists it in the label', () => {
  const bad = '<i>x</i>', html = D.draw.chain(SC.chain.create({ chain: [1], rest: [bad, 'y'] }));
  const [flipped, unflipped] = html.split('<span class="sc-tag">not flipped yet</span>');
  assert.ok(unflipped, 'the unflipped row has its tag');
  assert.ok(flipped.includes('>prev<') && flipped.includes('data-head="true"') && flipped.includes('data-i="0"'));
  assert.ok(!unflipped.includes('sc-item') && !unflipped.includes('data-'), 'unflipped nodes cannot be picked');
  assert.ok(unflipped.includes('&lt;i&gt;x&lt;/i&gt;') && unflipped.includes('>y<') && !html.includes(bad));
  const label = html.match(/aria-label="([^"]+)"/)[1];
  assert.ok(label.includes('&lt;i&gt;x&lt;/i&gt;') && label.includes('y'), label);
  assert.ok(!D.draw.chain(SC.chain.create([1, 2])).includes('not flipped yet'));
  assert.ok(label.includes('not flipped yet'));
  for (const { s } of flipAll([4, 7, 1, 9]).out) assertItemHooks(D.draw.chain(s), 'flip state');
});
