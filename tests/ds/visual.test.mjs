// Data Structures Quest: the step 1 model (visual.js), its validator and the missions that carry `visual`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'programming', 'ds-quest');
const sandbox = {};
vm.createContext(sandbox);
for (const f of ['engine.js', 'scenes.js', 'content.js', 'visual.js']) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
const D = sandbox.DSQ, V = D.visual, S = D.SCENES;
const clone = o => JSON.parse(JSON.stringify(o));
const same = (a, b, m) => assert.deepStrictEqual(clone(a), clone(b), m);
const push = v => ({ op: 'push', arg: { value: v } });

const OP = {
  kind: 'operate', scene: 'pile', start: [], task: 'Stack red, green, blue.',
  buttons: [{ label: 'push red', ...push('red') }, { label: 'push green', ...push('green') }, { label: 'push blue', ...push('blue') }, { label: 'pop', op: 'pop' }],
  goal: { snapshot: ['red', 'green', 'blue'] },
  ref: [push('red'), push('green'), push('blue')],
  wrong: [push('blue'), push('green'), push('red')],
  lazy: [push('red'), push('red'), push('red')],
};
const read = i => ({ op: 'read', arg: { i } });
const PR = {
  kind: 'predict', scene: 'row', start: [3, 4, 5], task: 'Follow the totals.',
  steps: [read(0), read(1), read(2)],
  pauses: [{ step: 1, ask: 'Total after box 1?', of: 'total', choices: [4, 7, 12] }, { step: 2, ask: 'Box 2 holds?', of: 'result', choices: [5, 7] }],
};
const LK = {
  kind: 'operate', scene: 'chain', start: { chain: [], loose: ['a', 'b', 'c'] }, link: true, task: 'Link them.',
  buttons: [{ label: 'remove first', op: 'removeFirst' }],
  goal: { snapshot: { chain: ['a', 'b'], loose: ['c'] } },
  ref: [{ op: 'link', arg: { from: { head: true }, to: { l: 0 } } }], wrong: [{ op: 'link' }], lazy: [{ op: 'link' }],
};

const GR = {
  kind: 'operate', scene: 'row', start: [1, 2, 3], task: 'Read the last box.',
  buttons: [{ label: 'read box 0', ...read(0) }, { label: 'read box 2', ...read(2) }, { label: 'push 9', ...push(9) }, { label: 'pop', op: 'pop' }],
  goal: { snapshot: [1, 2, 3], result: 3 },
  ref: [read(2)], wrong: [read(0)], lazy: [{ op: 'pop' }],
};
const SZ = {
  kind: 'predict', scene: 'pile', start: [], task: 'Count the boxes.',
  steps: [push(4), push(5), { op: 'pop' }, { op: 'pop' }],
  pauses: [{ step: 1, ask: 'How many boxes?', of: 'size', choices: [0, 1, 2] }, { step: 2, ask: 'And now?', of: 'size', choices: [0, 1, 2] }, { step: 3, ask: 'Now?', of: 'size', choices: [0, 1, 2] }],
};
const MX = (start, pauses) => ({ kind: 'predict', scene: 'row', start, task: 'Biggest so far.', steps: start.map((_, i) => read(i)), pauses });

const errs = vis => V.validate(vis).join(' | ');
const mutate = (base, fn) => { const v = clone(base); fn(v); return v; };

describe('validate', () => {
  test('whole fixtures give no errors', () => {
    same(V.validate(OP), []);
    same(V.validate(PR), []);
    same(V.validate(LK), []);
    same(V.validate(GR), []);
    same(V.validate(SZ), []);
    same(V.validate(MX([7, 3, 12], [{ step: 1, ask: 'Biggest?', of: 'max', choices: [3, 7, 12] }])), []);
  });
  test('goal.result accepts a number, zero, a negative and a 12-character text', () => {
    for (const r of [0, -3, 2.5, 'x', 'abcdefghijkl']) same(V.validate(mutate(GR, v => { v.goal.result = r; })), [], String(r));
  });
  test('goal.result accepts true and false, and the message names the three kinds', () => {
    for (const r of [true, false]) same(V.validate(mutate(GR, v => { v.goal.result = r; })), [], String(r));
    assert.match(errs(mutate(GR, v => { v.goal.result = {}; })), /number.*text.*true or false/);
  });
  test('a link mission on a scene with no link operation is rejected', () => {
    assert.match(errs(mutate(OP, v => { v.link = true; })), /link/);
    assert.match(errs(mutate(GR, v => { v.link = true; })), /link/);
  });
  const bad = [
    ['missing task', OP, v => delete v.task, /task/],
    ['unknown scene', OP, v => { v.scene = 'nope'; }, /unknown scene/],
    ['start the scene rejects', OP, v => { v.start = 'x'; }, /start rejected/],
    ['button op the scene lacks', OP, v => { v.buttons[3].op = 'peekaboo'; }, /no operation peekaboo/],
    ['missing goal', OP, v => delete v.goal, /goal/],
    ['malformed goal', OP, v => { v.goal = []; }, /goal/],
    ['unknown goal key', GR, v => { v.goal.extra = 1; }, /goal.*extra/],
    ['goal result an object', GR, v => { v.goal.result = { a: 1 }; }, /goal\.result/],
    ['goal result an array', GR, v => { v.goal.result = [3]; }, /goal\.result/],
    ['goal result empty text', GR, v => { v.goal.result = ''; }, /goal\.result/],
    ['goal result 13-character text', GR, v => { v.goal.result = 'abcdefghijklm'; }, /goal\.result/],
    ['goal result NaN', GR, v => { v.goal.result = NaN; }, /goal\.result/],
    ['goal result Infinity', GR, v => { v.goal.result = Infinity; }, /goal\.result/],
    ['goal result null', GR, v => { v.goal.result = null; }, /goal\.result/],
    ['size on a row predict', MX([1, 2], [{ step: 0, ask: 'How many?', of: 'size', choices: [0, 1] }]), v => {}, /pause 0.*size/],
    ['size on a line predict', { kind: 'predict', scene: 'line', start: [], task: 't', steps: [{ op: 'enqueue', arg: { value: 1 } }], pauses: [{ step: 0, ask: 'How many?', of: 'size', choices: [0, 1] }] }, v => {}, /pause 0.*size/],
    ['max answer not in choices', MX([7, 3], [{ step: 1, ask: 'Biggest?', of: 'max', choices: [3, 4] }]), v => {}, /right answer is not among/],
    ['size answer not in choices', SZ, v => { v.pauses[0].choices = [0, 1, 3]; }, /right answer is not among/],
    ['missing ref', OP, v => delete v.ref, /ref/],
    ['empty wrong', OP, v => { v.wrong = []; }, /wrong/],
    ['missing lazy', OP, v => delete v.lazy, /lazy/],
    ['sequence entry that matches no button', OP, v => { v.ref.push(push('purple')); }, /ref has an entry/],
    ['link entry without link:true', OP, v => { v.lazy.push({ op: 'link' }); }, /lazy has an entry/],
    ['missing steps', PR, v => delete v.steps, /steps/],
    ['empty pauses', PR, v => { v.pauses = []; }, /pauses/],
    ['recorded step the scene refuses', PR, v => { v.steps.push(read(9)); }, /step 3 is refused/],
    ['of not in ANSWERS', PR, v => { v.pauses[0].of = 'mood'; }, /unknown answer kind/],
    ['one choice', PR, v => { v.pauses[0].choices = [7]; }, /2 to 4/],
    ['five choices', PR, v => { v.pauses[0].choices = [1, 2, 3, 4, 7]; }, /2 to 4/],
    ['duplicate choices', PR, v => { v.pauses[0].choices = [7, 7, 4]; }, /2 to 4/],
    ['answer not in choices', PR, v => { v.pauses[0].choices = [1, 2, 3]; }, /right answer is not among/],
    ['step out of range', PR, v => { v.pauses[0].step = 3; }, /out of range/],
    ['duplicated step', PR, v => { v.pauses[1].step = 1; }, /used twice/],
  ];
  for (const [name, base, fn, re] of bad) test(`fails: ${name}`, () => assert.match(errs(mutate(base, fn)), re));
  test('a non-object is refused without throwing', () => assert.equal(V.validate(null).length, 1));
});

describe('operate model', () => {
  test('ref reaches the goal in fewest moves, wrong and lazy do not', () => {
    const s = V.runSeq(OP, OP.ref);
    assert.equal(V.won(s), true);
    assert.equal(V.moves(s), V.fewest(s));
    assert.equal(V.fewest(s), 3);
    assert.equal(V.won(V.runSeq(OP, OP.wrong)), false);
    assert.equal(V.won(V.runSeq(OP, OP.lazy)), false);
  });
  test('undo restores the exact snapshot and reset empties everything', () => {
    const s = V.runSeq(OP, [push('red'), push('green')]);
    const snap = S.pile.snapshot(s.state);
    V.apply(s, push('blue'));
    same(V.undo(s), { ok: true });
    same(S.pile.snapshot(s.state), snap);
    assert.equal(s.log.length, 2);
    assert.equal(V.moves(s), 2);
    V.reset(s);
    same(S.pile.snapshot(s.state), []);
    assert.equal(V.moves(s), 0);
    assert.equal(s.log.length, 0);
  });
  test('undo with nothing done is refused with a reason', () => {
    const r = V.undo(V.start(OP, 'x'));
    assert.equal(r.ok, false);
    assert.ok(r.reason.length >= 10);
  });
  test('a refused operation changes nothing and carries a reason', () => {
    const s = V.runSeq(OP, [push('red')]);
    const before = JSON.stringify([S.pile.snapshot(s.state), s.hist, s.log]);
    const empty = V.start(OP, 'x');
    const r = V.apply(empty, { op: 'pop' });
    assert.equal(r.ok, false);
    assert.ok(r.reason.length >= 10);
    assert.equal(V.moves(empty), 0);
    assert.equal(empty.log.length, 0);
    const r2 = V.apply(s, push('purple'));
    assert.equal(r2.ok, false);
    assert.ok(r2.reason.length >= 10);
    assert.equal(JSON.stringify([S.pile.snapshot(s.state), s.hist, s.log]), before);
  });
  test('an operate session refuses predict input', () => {
    const s = V.start(OP, 'x');
    for (const r of [V.answer(s, 1), V.advance(s), V.back(s)]) { assert.equal(r.ok, false); assert.ok(r.reason.length >= 10); }
    assert.equal(V.passed(s), false);
    same(S.pile.snapshot(s.state), []);
  });
});

describe('goal.result', () => {
  const won = (vis, seq) => V.won(V.runSeq(vis, seq));
  const NOR = mutate(GR, v => { delete v.goal.result; });
  test('the right read wins; no press, a wrong read and a pop do not', () => {
    assert.equal(won(GR, GR.ref), true);
    assert.equal(won(GR, []), false);
    assert.equal(won(GR, GR.wrong), false);
    assert.equal(won(GR, GR.lazy), false);
  });
  test('a wrong read, a pop or a push after the right read does not win', () => {
    assert.equal(won(GR, [read(2), read(0)]), false);
    assert.equal(won(GR, [read(2), { op: 'pop' }]), false);
    assert.equal(won(GR, [read(2), push(9)]), false);
  });
  test('a push then pop restores the snapshot but the result is not the goal result', () => {
    assert.equal(won(GR, [read(2), push(9), { op: 'pop' }]), false);
  });
  test('the right read after a wrong one wins; undoing the right read does not', () => {
    assert.equal(won(GR, [read(0), read(2)]), true);
    const s = V.runSeq(GR, [read(2)]);
    V.undo(s);
    assert.equal(V.won(s), false);
    const t = V.runSeq(GR, [read(2), read(0)]);
    V.undo(t);
    assert.equal(V.won(t), true);
  });
  test('without goal.result the rule is the snapshot alone, as before', () => {
    assert.equal(won(NOR, []), true);
    assert.equal(won(NOR, [read(0)]), true);
    assert.equal(won(NOR, [{ op: 'pop' }]), false);
  });
});

describe('goal.result on the script-step missions', () => {
  const vis = id => { const [c, m] = id.split('.'); return D.CH[c].missions[m].visual; };
  const won = (id, seq) => V.won(V.runSeq(vis(id), seq));
  const unshift = v => ({ op: 'unshift', arg: { value: v } });
  test('0.0: the ref wins; the wrong order, the lazy pushes and no press do not', () => {
    const v = vis('0.0');
    assert.equal(won('0.0', v.ref), true);
    assert.equal(won('0.0', v.wrong), false);
    assert.equal(won('0.0', v.lazy), false);
    assert.equal(won('0.0', []), false);
  });
  test('0.1: only box 3 wins, and the last read counts', () => {
    assert.equal(won('0.1', [read(3)]), true);
    for (const i of [0, 1, 2]) assert.equal(won('0.1', [read(i)]), false, `box ${i}`);
    assert.equal(won('0.1', [read(3), read(0)]), false);
    assert.equal(won('0.1', []), false);
    assert.equal(won('0.1', vis('0.1').wrong), false);
    assert.equal(won('0.1', vis('0.1').lazy), false);
  });
  test('0.2: push lantern then pop wins; the other ways do not', () => {
    assert.equal(won('0.2', [push('lantern'), { op: 'pop' }]), true);
    assert.equal(won('0.2', [push('candle'), { op: 'pop' }]), false);
    assert.equal(won('0.2', [{ op: 'pop' }]), false);
    assert.equal(won('0.2', [push('lantern')]), false);
    assert.equal(won('0.2', [unshift('lantern'), { op: 'pop' }]), false);
    assert.equal(won('0.2', []), false);
  });
  test('0.2 offers an unshift button besides push and pop', () => {
    same(vis('0.2').buttons.map(b => b.op).sort(), ['pop', 'push', 'push', 'unshift']);
  });
});

describe('goal.result on the chapter 1 pile missions', () => {
  const vis = id => { const [c, m] = id.split('.'); return D.CH[c].missions[m].visual; };
  const won = (id, seq) => V.won(V.runSeq(vis(id), seq));
  const pop = { op: 'pop' }, peek = { op: 'peek' };
  test('1.0: the ref wins; the wrong order, the lazy pushes and no press do not', () => {
    assert.equal(won('1.0', vis('1.0').ref), true);
    assert.equal(won('1.0', vis('1.0').wrong), false);
    assert.equal(won('1.0', vis('1.0').lazy), false);
    assert.equal(won('1.0', []), false);
  });
  test('1.1: only peek wins; pop, pop twice and peek then pop do not', () => {
    assert.equal(won('1.1', [peek]), true);
    assert.equal(won('1.1', [pop]), false);
    assert.equal(won('1.1', [pop, pop]), false);
    assert.equal(won('1.1', [peek, pop]), false);
    assert.equal(won('1.1', []), false);
    assert.equal(won('1.1', vis('1.1').wrong), false);
    assert.equal(won('1.1', vis('1.1').lazy), false);
  });
  test('1.2: push 5, push 8, pop wins; the other orders and presses do not', () => {
    const p = n => ({ op: 'push', arg: { value: n } });
    assert.equal(won('1.2', [p(5), p(8), pop]), true);
    assert.equal(won('1.2', [p(8), p(5), pop]), false);
    assert.equal(won('1.2', [p(5), p(8), peek]), false);
    assert.equal(won('1.2', [p(5), p(8)]), false);
    assert.equal(won('1.2', []), false);
    assert.equal(won('1.2', vis('1.2').wrong), false);
    assert.equal(won('1.2', vis('1.2').lazy), false);
  });
  test('1.1 has only the peek and pop buttons', () => {
    same(vis('1.1').buttons.map(b => b.op).sort(), ['peek', 'pop']);
  });
});

describe('goal.result and the walk on the chapter 2 line missions', () => {
  const vis = id => { const [c, m] = id.split('.'); return D.CH[c].missions[m].visual; };
  const won = (id, seq) => V.won(V.runSeq(vis(id), seq));
  const enq = v => ({ op: 'enqueue', arg: { value: v } }), deq = { op: 'dequeue' }, front = { op: 'front' };
  test('2.0: the ref wins; the wrong order, the lazy joins and no press do not', () => {
    assert.equal(won('2.0', vis('2.0').ref), true);
    assert.equal(won('2.0', [enq('Mo'), enq('Juno'), enq('Clatter'), deq]), false);
    assert.equal(won('2.0', [enq('Juno'), enq('Mo'), enq('Clatter')]), false);
    assert.equal(won('2.0', [enq('Juno'), enq('Mo'), enq('Clatter'), front]), false);
    assert.equal(won('2.0', []), false);
    assert.equal(won('2.0', vis('2.0').wrong), false);
    assert.equal(won('2.0', vis('2.0').lazy), false);
  });
  test('2.1: enqueue 5, enqueue 8, dequeue wins; the other orders and presses do not', () => {
    assert.equal(won('2.1', [enq(5), enq(8), deq]), true);
    assert.equal(won('2.1', [enq(8), enq(5), deq]), false);
    assert.equal(won('2.1', [enq(5), enq(8), front]), false);
    assert.equal(won('2.1', [enq(5), enq(8)]), false);
    assert.equal(won('2.1', []), false);
    assert.equal(won('2.1', vis('2.1').wrong), false);
    assert.equal(won('2.1', vis('2.1').lazy), false);
  });
  test('2.0 and 2.1 offer different buttons, so one ref wins only its own mission', () => {
    assert.equal(won('2.1', vis('2.0').ref), false);
    assert.equal(won('2.0', vis('2.1').ref), false);
  });
  test('2.2: the three questions are who leaves, replayed on a plain array', () => {
    const v = vis('2.2'), line = [...v.start], leavers = [];
    v.steps.forEach((e, k) => {
      if (e.op === 'enqueue') line.push(e.arg.value);
      else { const out = line.shift(); if (v.pauses.some(p => p.step === k)) leavers.push(out); }
    });
    same(v.pauses.map(p => p.step), [4, 9, 14]);
    same(leavers, ['Clatter', 'Juno', 'Pip']);
    same(v.pauses.map(p => V.answerOf(v, p.step)), leavers);
    same(line, ['Mo']);
  });
});

describe('goal.result and the walk on the chapter 3 chain missions', () => {
  const vis = id => { const [c, m] = id.split('.'); return D.CH[c].missions[m].visual; };
  const won = (id, seq) => V.won(V.runSeq(vis(id), seq));
  const link = (from, l) => ({ op: 'link', arg: { from, to: { l } } });
  const head = { head: true };
  test('3.0: the ref wins; the reversed order, the lazy two links and no press do not', () => {
    assert.equal(won('3.0', vis('3.0').ref), true);
    assert.equal(won('3.0', [link(head, 0), link({ i: 0 }, 0), link({ i: 1 }, 0)]), false);
    assert.equal(won('3.0', [link(head, 1), link({ i: 0 }, 1)]), false);
    assert.equal(won('3.0', []), false);
    assert.equal(won('3.0', vis('3.0').wrong), false);
    assert.equal(won('3.0', vis('3.0').lazy), false);
  });
  test('3.0: the ref builds 1 → 2 → 3 and the walk to 3 then finds it at index 2', () => {
    const v = vis('3.0'), s = V.runSeq(v, v.ref);
    same(S.chain.snapshot(s.state), { chain: [1, 2, 3], loose: [] });
    const r = V.apply(s, { op: 'find', arg: { value: 3 } });
    assert.equal(r.ok, true);
    assert.equal(r.result, 2);
  });
  test('3.0: the walk button is refused on the empty chain, with a reason, and the state stays', () => {
    const s = V.start(vis('3.0'), '3.0'), before = JSON.stringify(s.state);
    const r = V.apply(s, { op: 'find', arg: { value: 3 } });
    assert.equal(r.ok, false);
    assert.ok(r.reason.length >= 10);
    assert.equal(JSON.stringify(s.state), before);
  });
  test('3.0 is searched with link presses: 1 button and 12 links, every sequence up to depth 2', () => {
    assert.equal(pressesOf(vis('3.0')).length, 13);
    const { winners, tried } = shorterWinners(vis('3.0'));
    same(winners, []);
    assert.equal(tried, 1 + 13 + 13 ** 2);
  });
  test('3.2: addFirst 1, add (end) 9, removeFirst wins; the other orders and presses do not', () => {
    const op = (o, value) => ({ op: o, arg: { value } });
    assert.equal(won('3.2', vis('3.2').ref), true);
    assert.equal(won('3.2', [op('addLast', 1), op('addLast', 9), { op: 'removeFirst' }]), false);
    assert.equal(won('3.2', [op('addFirst', 1), op('addLast', 9)]), false);
    assert.equal(won('3.2', []), false);
    assert.equal(won('3.2', vis('3.2').wrong), false);
    assert.equal(won('3.2', vis('3.2').lazy), false);
  });
  test('3.2: the ref leaves 4 → 7 → 9 and removeFirst gives back 1', () => {
    const v = vis('3.2'), s = V.runSeq(v, v.ref);
    same(S.chain.snapshot(s.state), { chain: [4, 7, 9], loose: [] });
    assert.equal(s.log.at(-1).result, 1);
  });
  test('3.1: each pause answer is the index of the value in [5, 8, 2, 6], or -1', () => {
    const v = vis('3.1');
    same(v.steps.map(e => e.arg.value), [8, 6, 9]);
    same(v.pauses.map(p => V.answerOf(v, p.step)), v.steps.map(e => v.start.indexOf(e.arg.value)));
    same(v.pauses.map(p => V.answerOf(v, p.step)), [1, 3, -1]);
  });
  test('3.3: flip k points back at start[k-1], and find 1 after four flips gives index 3, worked out from start alone', () => {
    const v = vis('3.3');
    same(v.start, [1, 2, 3, 4]);
    same(v.steps.map(e => e.op), ['flip', 'flip', 'flip', 'flip', 'find']);
    same(v.steps.map(e => e.arg), [undefined, undefined, undefined, undefined, { value: 1 }]);
    same(v.pauses.map(p => p.step), [1, 2, 3, 4]);
    same(v.pauses.map(p => V.answerOf(v, p.step)), [1, 2, 3, [...v.start].reverse().indexOf(1)]);
    for (const p of v.pauses.slice(0, 3)) assert.equal(V.answerOf(v, p.step), v.start[p.step - 1]);
    assert.equal(V.answerOf(v, 4), 3);
    const st = S.chain.create(v.start);
    for (const e of v.steps) S.chain.op(st, e.op).run(st, e.arg);
    same(S.chain.snapshot(st), { chain: [4, 3, 2, 1], loose: [] });
  });
});

describe('answer kinds max and size', () => {
  const ask = (vis, of, k, choices) => ({ ...vis, pauses: [{ step: k, ask: 'q', of, choices }] });
  test('max is the biggest number read so far, recomputed from the row', () => {
    for (const start of [[7, 3, 12, 5], [-4, -2, -8], [0, -1], [5]]) {
      const vis = MX(start, [0, 1, 2, 3].filter(k => k < start.length).map(k => ({ step: k, ask: 'q', of: 'max', choices: [Math.max(...start.slice(0, k + 1)), 99] })));
      same(V.validate(vis), []);
      for (let k = 0; k < start.length; k++) assert.equal(V.answerOf(vis, k), Math.max(...start.slice(0, k + 1)), `${start} at ${k}`);
    }
  });
  test('size is the pile size after the step, recomputed by counting push and pop', () => {
    const ops = [push(4), push(5), { op: 'pop' }, { op: 'pop' }, push(1)];
    const plain = [];
    ops.forEach((e, k) => {
      if (e.op === 'push') plain.push(e.arg.value); else plain.pop();
      const vis = { ...SZ, steps: ops, pauses: [{ step: k, ask: 'q', of: 'size', choices: [plain.length, plain.length + 1] }] };
      same(V.validate(vis), [], `step ${k}`);
      assert.equal(V.answerOf(vis, k), plain.length, `step ${k}`);
    });
  });
  test('size on a pile that starts with boxes needs no start length', () => {
    const vis = { ...SZ, start: [8, 9], steps: [{ op: 'pop' }, { op: 'pop' }], pauses: [{ step: 1, ask: 'q', of: 'size', choices: [0, 1] }] };
    same(V.validate(vis), []);
    assert.equal(V.answerOf(vis, 1), 0);
  });
  test('a pile predict with size is accepted and a row predict with size is rejected', () => {
    same(V.validate(SZ), []);
    assert.match(errs(ask(MX([1, 2], []), 'size', 0, [0, 1])), /size/);
  });
});

const pressesOf = vis => {
  const presses = vis.buttons.map(b => (b.arg === undefined ? { op: b.op } : { op: b.op, arg: b.arg }));
  if (vis.link === true) for (const from of [{ head: true }, { i: 0 }, { i: 1 }, { i: 2 }]) for (const l of [0, 1, 2]) presses.push({ op: 'link', arg: { from, to: { l } } });
  return presses;
};
const shorterWinners = vis => {
  const presses = pressesOf(vis), winners = [];
  let level = [[]], tried = 0;
  for (let len = 0; len < vis.ref.length; len++) {
    for (const seq of level) { tried++; if (V.won(V.runSeq(vis, seq))) winners.push(seq); }
    level = level.flatMap(seq => presses.map(p => [...seq, p]));
  }
  return { winners, tried };
};

describe('shortest ref', () => {
  D.CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => {
    const vis = m.visual;
    if (!vis || vis.kind !== 'operate') return;
    test(`${ci}.${mi}: no sequence shorter than ref wins`, () => {
      same(shorterWinners(vis).winners, [], `${ci}.${mi}: a shorter sequence wins, ref has ${vis.ref.length}`);
    });
  }));
  const link = (from, l) => ({ op: 'link', arg: { from, to: { l } } });
  const FIND = { label: 'walk to 3', op: 'find', arg: { value: 3 } };
  const LINK3 = { kind: 'operate', scene: 'chain', link: true, start: { chain: [], loose: [3, 1, 2] }, task: 't', buttons: [FIND],
    goal: { snapshot: { chain: [1, 2, 3], loose: [] } },
    ref: [link({ head: true }, 1), link({ i: 0 }, 1), link({ i: 1 }, 0)], wrong: [link({ head: true }, 0)], lazy: [link({ head: true }, 1)] };
  test('the search tries link presses: it counts every sequence of the press list up to depth ref - 1', () => {
    same(V.validate(LINK3), []);
    const presses = 1 + 4 * 3;
    assert.equal(pressesOf(LINK3).length, presses);
    const { winners, tried } = shorterWinners(LINK3);
    same(winners, []);
    assert.equal(tried, 1 + presses + presses ** 2);
  });
  test('the search can fail: a link mission that one link already wins is reported', () => {
    const quick = { ...LINK3, goal: { snapshot: { chain: [1], loose: [3, 2] } }, ref: [link({ head: true }, 1), { op: 'find', arg: { value: 3 } }] };
    same(V.validate(quick), []);
    same(shorterWinners(quick).winners, [[link({ head: true }, 1)]]);
  });
  test('the search ignores link presses on a mission with no link flag', () => {
    assert.equal(pressesOf({ ...LINK3, link: false }).length, 1);
  });
});

describe('predict model', () => {
  const to = (sess, n) => { for (let i = 0; i < n; i++) V.advance(sess); };
  test('a pause opens when its step steps have run, before that step runs', () => {
    const s = V.start(PR, 'x');
    assert.equal(V.advance(s).result, 3);
    assert.equal(s.pos, 1);
    assert.equal(V.advance(s).ask.step, 1);
    assert.equal(s.pos, 1);
  });
  test('answerOf computes from the recorded steps', () => {
    assert.equal(V.answerOf(PR, 1), 7);
    assert.equal(V.answerOf(PR, 2), 5);
  });
  test('a wrong answer returns the real step and keeps the pause; the retry works', () => {
    const s = V.start(PR, 'x');
    to(s, 1);
    const r = V.answer(s, 4);
    assert.equal(r.ok, false);
    assert.equal(r.step.result, 4);
    assert.equal(s.pos, 1);
    assert.equal(V.advance(s).ask.step, 1);
    const ok = V.answer(s, 7);
    assert.equal(ok.ok, true);
    assert.equal(ok.step.result, 4);
    assert.equal(s.pos, 2);
  });
  test('back restores the earlier state from the recorded snapshots', () => {
    const s = V.start(PR, 'x');
    to(s, 1);
    V.answer(s, 7);
    assert.equal(V.back(s).ok, true);
    assert.equal(s.pos, 1);
    same(s.state.v, [3, 4, 5]);
    V.back(s);
    assert.equal(V.back(s).ok, false);
  });
  test('passed needs every pause solved and the end reached', () => {
    const s = V.start(PR, 'x');
    to(s, 1);
    assert.equal(V.passed(s), false);
    V.answer(s, 7);
    assert.equal(V.passed(s), false);
    assert.equal(V.advance(s).ask.step, 2);
    V.answer(s, 5);
    assert.equal(V.passed(s), true);
    assert.equal(V.advance(s).ok, false);
  });
  test('missed starts false, a wrong answer sets it and a right retry keeps it', () => {
    const s = V.start(PR, 'x');
    assert.equal(s.missed, false);
    to(s, 1);
    V.answer(s, 7);
    assert.equal(s.missed, false);
    V.advance(s);
    V.answer(s, 7);
    assert.equal(s.missed, true);
    V.answer(s, 5);
    assert.equal(s.missed, true);
    assert.equal(V.passed(s), true);
  });
  test('answering with no open question is refused', () => {
    const r = V.answer(V.start(PR, 'x'), 3);
    assert.equal(r.ok, false);
    assert.ok(r.reason.length >= 10);
  });
  test('a predict session refuses operate input', () => {
    const s = V.start(PR, 'x');
    for (const r of [V.apply(s, push('red')), V.undo(s), V.reset(s), V.pick(s, { head: true })]) { assert.equal(r.ok, false); assert.ok(r.reason.length >= 10); }
    assert.equal(s.pos, 0);
    assert.equal(V.won(s), false);
  });
});

describe('pick (link gesture)', () => {
  const snap = s => S.chain.snapshot(s.state);
  const link = V.runSeq(LK, [{ op: 'link', arg: { from: { head: true }, to: { l: 0 } } }]);
  test('pick then pick equals the link step', () => {
    const s = V.start(LK, 'x');
    assert.equal(V.pick(s, { head: true }).ok, true);
    same(s.pending, { head: true });
    const r = V.pick(s, { l: 0 });
    assert.equal(r.ok, true);
    assert.equal(s.pending, null);
    same(snap(s), snap(link));
    assert.equal(r.code, V.apply(V.start(LK, 'y'), { op: 'link', arg: { from: { head: true }, to: { l: 0 } } }).code);
  });
  test('two links in a row build the chain', () => {
    const s = V.start(LK, 'x');
    V.pick(s, { head: true }); V.pick(s, { l: 0 });
    V.pick(s, { i: 0 }); V.pick(s, { l: 0 });
    same(snap(s), { chain: ['a', 'b'], loose: ['c'] });
    assert.equal(V.won(s), true);
  });
  test('a first pick on a loose node is refused with a reason and nothing pending', () => {
    const s = V.start(LK, 'x');
    const r = V.pick(s, { l: 0 });
    assert.equal(r.ok, false);
    assert.ok(r.reason.length >= 10);
    assert.equal(s.pending, null);
  });
  test('a second pick on a chain node is refused and clears the pending pick', () => {
    const s = V.start(LK, 'x');
    V.pick(s, { head: true });
    const r = V.pick(s, { i: 0 });
    assert.equal(r.ok, false);
    assert.ok(r.reason.length >= 10);
    assert.equal(s.pending, null);
  });
  test('a repeated pick and cancelPick clear the pending pick', () => {
    const s = V.start(LK, 'x');
    V.pick(s, { head: true });
    assert.equal(V.pick(s, { head: true }).cancelled, true);
    assert.equal(s.pending, null);
    V.pick(s, { head: true });
    V.cancelPick(s);
    assert.equal(s.pending, null);
  });
  test('a link the scene refuses leaves state unchanged, carries its reason and clears the pick', () => {
    const s = V.start(LK, 'x');
    V.pick(s, { head: true }); V.pick(s, { l: 0 });
    const before = JSON.stringify([snap(s), s.hist, s.log]);
    V.pick(s, { head: true });
    const r = V.pick(s, { l: 0 });
    assert.equal(r.ok, false);
    assert.match(r.reason, /already has a head/);
    assert.equal(s.pending, null);
    assert.equal(JSON.stringify([snap(s), s.hist, s.log]), before);
  });
  test('pick is refused on a mission without link:true', () => {
    const r = V.pick(V.start(OP, 'x'), { head: true });
    assert.equal(r.ok, false);
    assert.ok(r.reason.length >= 10);
  });
});

describe('goal.result and the walk on the chapter 4 map and set missions', () => {
  const vis = id => { const [c, m] = id.split('.'); return D.CH[c].missions[m].visual; };
  const won = (id, seq) => V.won(V.runSeq(vis(id), seq));
  const set = (key, value) => ({ op: 'set', arg: { key, value } });
  const get = key => ({ op: 'get', arg: { key } });
  const add = value => ({ op: 'add', arg: { value } });
  const has = value => ({ op: 'has', arg: { value } });
  test('4.0: set umbrella 3, set hat 7, get umbrella wins; a wrong pair, no lookup, the wrong order and no press do not', () => {
    assert.equal(won('4.0', vis('4.0').ref), true);
    assert.equal(won('4.0', [set('umbrella', 3), set('scarf', 2), get('umbrella')]), false);
    assert.equal(won('4.0', [set('umbrella', 3), set('hat', 7)]), false);
    assert.equal(won('4.0', [set('hat', 7), set('umbrella', 3), get('umbrella')]), false);
    assert.equal(won('4.0', [set('umbrella', 3), set('hat', 7), get('hat')]), false);
    assert.equal(won('4.0', []), false);
    assert.equal(won('4.0', vis('4.0').wrong), false);
    assert.equal(won('4.0', vis('4.0').lazy), false);
  });
  test('4.1: add 5 then has 5 wins; a duplicate add, asking before adding and no press do not', () => {
    assert.equal(won('4.1', vis('4.1').ref), true);
    assert.equal(won('4.1', [add(7), has(5)]), false);
    assert.equal(won('4.1', [add(5), has(4)]), false);
    assert.equal(won('4.1', [has(5), add(5)]), false);
    assert.equal(won('4.1', [add(3), add(5)]), false);
    assert.equal(won('4.1', []), false);
    assert.equal(won('4.1', vis('4.1').wrong), false);
    assert.equal(won('4.1', vis('4.1').lazy), false);
  });
  test('4.1: the ref is the shortest winner, and the second add of 3 changes nothing', () => {
    const v = vis('4.1'), s = V.runSeq(v, v.ref);
    assert.equal(V.moves(s), 2);
    same(S.buckets.snapshot(s.state), { set: [3, 5] });
    assert.equal(s.log.at(-1).result, true);
    const t = V.runSeq(v, [add(3)]);
    same(S.buckets.snapshot(t.state), { set: [3] });
  });
  test('4.2: each pause answer is how often the word has appeared up to and including that step', () => {
    const v = vis('4.2'), words = v.steps.map(e => e.arg.key);
    same(words, ['the', 'key', 'the', 'lock', 'the', 'key']);
    same(v.pauses.map(p => V.answerOf(v, p.step)), v.pauses.map(p => words.slice(0, p.step + 1).filter(w => w === words[p.step]).length));
    same(v.pauses.map(p => V.answerOf(v, p.step)), [2, 3, 2]);
  });
  test('4.3: each pause answer is whether the word at that step was added by an earlier step', () => {
    const v = vis('4.3');
    same(v.steps.map(e => `${e.op} ${e.arg.value}`), ['has hat', 'add hat', 'has scarf', 'add scarf', 'has boot', 'add boot', 'has scarf']);
    const added = step => v.steps.slice(0, step).some(e => e.op === 'add' && e.arg.value === v.steps[step].arg.value);
    same(v.pauses.map(p => V.answerOf(v, p.step)), v.pauses.map(p => added(p.step)));
    same(v.pauses.map(p => V.answerOf(v, p.step)), [false, false, true]);
  });
  test('4.4: each pause answer is the target minus the number, and the last step finds the pair 8 + 4', () => {
    const v = vis('4.4'), nums = v.steps.map(e => e.arg.value);
    same(nums, [5, 2, 8, 4]);
    assert.ok(v.steps.every(e => e.op === 'partner' && e.arg.target === 12));
    same(v.pauses.map(p => V.answerOf(v, p.step)), v.pauses.map(p => 12 - nums[p.step]));
    same(v.pauses.map(p => V.answerOf(v, p.step)), [10, 4, 8]);
    assert.equal(nums[2] + nums[3], 12);
    const sc = S[v.scene], st = sc.create(v.start), last = v.steps.map(e => sc.op(st, e.op).run(st, e.arg)).at(-1);
    assert.equal(last.result, 8);
    assert.equal(last.changes.length, 0);
  });
});

describe('the chapter 5 tree missions', () => {
  const vis = id => { const [c, m] = id.split('.'); return D.CH[c].missions[m].visual; };
  const won = (id, seq) => V.won(V.runSeq(vis(id), seq));
  const attach = (value, side) => ({ op: 'attach', arg: { value, parent: 8, side } });
  const insert = value => ({ op: 'insert', arg: { value } });
  test('5.0: put 3 on the left and 10 on the right wins; the swapped sides are refused and change nothing; the rest do not win', () => {
    assert.equal(won('5.0', vis('5.0').ref), true);
    same(vis('5.0').ref, [attach(3, 'left'), attach(10, 'right')]);
    assert.equal(won('5.0', [attach(10, 'right'), attach(3, 'left')]), true);
    for (const seq of [vis('5.0').wrong, vis('5.0').lazy, [], [attach(3, 'right'), attach(10, 'right')], [attach(3, 'left'), attach(10, 'left')]]) assert.equal(won('5.0', seq), false);
    const s = V.start(vis('5.0'), '5.0'), before = JSON.stringify(s.state);
    for (const e of vis('5.0').wrong) {
      const r = V.apply(s, e);
      assert.equal(r.ok, false);
      assert.match(r.reason, /smaller values go left and bigger values go right/);
    }
    assert.equal(JSON.stringify(s.state), before);
    assert.equal(V.moves(s), 0);
  });
  test('5.2: insert 1, 4 and 7 wins; 9 in place of 7, a missing insert and no press do not; the duplicate 3 is refused and changes nothing', () => {
    assert.equal(won('5.2', vis('5.2').ref), true);
    same(vis('5.2').ref, [insert(1), insert(4), insert(7)]);
    assert.equal(won('5.2', [insert(7), insert(4), insert(1)]), true);
    for (const seq of [vis('5.2').wrong, vis('5.2').lazy, [], [insert(1), insert(4), insert(9)], [insert(1), insert(7)]]) assert.equal(won('5.2', seq), false);
    const s = V.start(vis('5.2'), '5.2'), before = JSON.stringify(s.state);
    const r = V.apply(s, insert(3));
    assert.equal(r.ok, false);
    assert.match(r.reason, /already in the tree/);
    assert.equal(JSON.stringify(s.state), before);
    assert.equal(V.moves(s), 0);
  });
  test('5.1: each pause answer is the height of the node at that step, computed from the start values', () => {
    const v = vis('5.1');
    // A search tree built from the start values in order: 8 first, then each value goes left or right of the nodes on its way down.
    const root = { value: v.start[0], left: null, right: null };
    for (const x of v.start.slice(1)) { let c = root; for (;;) { const side = x < c.value ? 'left' : 'right'; if (!c[side]) { c[side] = { value: x, left: null, right: null }; break; } c = c[side]; } }
    const height = n => (n ? 1 + Math.max(height(n.left), height(n.right)) : 0);
    const find = (n, x) => (n.value === x ? n : find(x < n.value ? n.left : n.right, x));
    same(v.steps.map(e => e.arg.value), [1, 6, 3, 14, 10, 8]);
    assert.ok(v.steps.every(e => e.op === 'height'));
    same(v.pauses.map(p => V.answerOf(v, p.step)), v.pauses.map(p => height(find(root, v.steps[p.step].arg.value))));
    same(v.pauses.map(p => V.answerOf(v, p.step)), [2, 2, 3]);
  });
  test('5.3: each pause answer is the next value of the sorted start values', () => {
    const v = vis('5.3'), sorted = [...v.start].sort((a, b) => a - b);
    same(v.steps.map(e => e.arg.n), [1, 2, 3, 4, 5, 6, 7]);
    assert.ok(v.steps.every(e => e.op === 'visit'));
    same(sorted, [1, 3, 4, 6, 8, 10, 14]);
    same(v.pauses.map(p => V.answerOf(v, p.step)), v.pauses.map(p => sorted[p.step]));
    same(v.pauses.map(p => V.answerOf(v, p.step)), [4, 6, 8]);
  });
  test('5.4: each pause answer follows the comparison of the target with the node at that step, and the last step is found', () => {
    const v = vis('5.4'), target = 4;
    same(v.steps.map(e => e.arg.at), [8, 3, 6, 4]);
    assert.ok(v.steps.every(e => e.op === 'turn' && e.arg.value === target));
    const turn = at => (target === at ? 'found' : target < at ? 'left' : 'right');
    same(v.pauses.map(p => V.answerOf(v, p.step)), v.pauses.map(p => turn(v.steps[p.step].arg.at)));
    same(v.pauses.map(p => V.answerOf(v, p.step)), ['right', 'left', 'found']);
    assert.equal(turn(v.steps.at(-1).arg.at), 'found');
  });
});

describe('missions with visual', () => {
  const walked = [];
  D.CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => {
    if (!m.visual) return;
    const id = `${ci}.${mi}`;
    walked.push(id);
    test(`${id} ${m.title}: visual data is whole`, () => same(V.validate(m.visual), [], `${id}: validate`));
    if (m.visual.kind === 'operate') {
      test(`${id}: ref reaches the goal within the star, wrong and lazy do not`, () => {
        const vis = m.visual, s = V.runSeq(vis, vis.ref);
        assert.equal(V.won(s), true, `${id}: ref does not reach the goal`);
        assert.ok(V.moves(s) <= V.fewest(s), `${id}: ref is longer than the star`);
        assert.equal(V.won(V.runSeq(vis, vis.wrong)), false, `${id}: wrong reaches the goal`);
        assert.equal(V.won(V.runSeq(vis, vis.lazy)), false, `${id}: lazy reaches the goal`);
      });
      test(`${id}: a refused operation leaves the state unchanged with a reason`, () => {
        const vis = m.visual, s = V.start(vis, id), before = JSON.stringify(s.state);
        const r = V.apply(s, { op: 'not-a-button' });
        assert.equal(r.ok, false);
        assert.ok(r.reason.length >= 10, `${id}: reason too short`);
        assert.equal(JSON.stringify(s.state), before);
        assert.equal(V.moves(s), 0);
      });
    } else {
      test(`${id}: every pause answer equals an independent recomputation`, () => {
        const vis = m.visual, sc = S[vis.scene], st = sc.create(vis.start), res = [];
        for (const e of vis.steps) res.push(sc.op(st, e.op).run(st, e.arg).result);
        for (const p of vis.pauses) {
          let want = res[p.step];
          if (p.of === 'total') want = res.slice(0, p.step + 1).reduce((a, b) => a + b, 0);
          if (p.of === 'max') want = Math.max(...res.slice(0, p.step + 1).filter(r => typeof r === 'number'));
          if (p.of === 'size') {
            const plain = [...vis.start];
            vis.steps.slice(0, p.step + 1).forEach(e => { if (e.op === 'push') plain.push(0); else if (e.op === 'pop') plain.pop(); });
            want = plain.length;
          }
          assert.equal(V.answerOf(vis, p.step), want, `${id}: pause at step ${p.step}`);
          assert.ok(p.choices.includes(want), `${id}: choices lack the answer at step ${p.step}`);
        }
      });
      test(`${id}: answering every pause rightly passes the session`, () => {
        const vis = m.visual, s = V.start(vis, id);
        for (let guard = 0; guard < 100 && !V.passed(s); guard++) {
          const r = V.advance(s);
          if (r.ask) assert.equal(V.answer(s, V.answerOf(vis, r.ask.step)).ok, true);
        }
        assert.equal(V.passed(s), true, `${id}: never passed`);
      });
    }
  }));
  test('all 26 missions of chapters 0 to 5 are walked', () => {
    const ids = D.CH.flatMap((ch, ci) => ch.missions.map((_, mi) => `${ci}.${mi}`));
    same(ids, walked);
    assert.equal(ids.length, 26);
    assert.equal(walked.length, 26);
  });
});
