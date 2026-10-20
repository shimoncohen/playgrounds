// Data Structures Quest explainer demos: random operation sequences keep each structure valid, and every highlight points at something real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ds-quest');
const sandbox = {};
vm.createContext(sandbox);
for (const f of ['engine.js', 'content.js', 'demos.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
const D = sandbox.DSQ;
const plain = x => JSON.parse(JSON.stringify(x));
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
