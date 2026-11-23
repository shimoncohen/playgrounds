// Data Structures Quest practice contract: sig and tree rules, nothing rule, runner registry, generators, and the walk over real missions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const FN = (tests, extra = {}) => ({ fn: { sig: sig([['xs', 'ints'], ['k', 'int']], 'int'), tests }, ...extra });

test('values: each type accepts its own and rejects others', () => {
  const good = { int: 3, bool: false, str: 'a', ints: [-1, 2], strs: ['a'], list: [0, 4], tree: [8, -1, 10], void: undefined };
  for (const [t, v] of Object.entries(good)) assert.doesNotThrow(() => P.checkValue(v, t), t);
  const bad = { int: 1.5, bool: 0, str: 1, ints: [1, 'a'], strs: [1], list: [-1], tree: [8, -1], void: 3 };
  for (const [t, v] of Object.entries(bad)) assert.throws(() => P.checkValue(v, t), /is not a|tree/, t);
});

test('nothing rule: never an input for int, ints, str, strs; skipped for list and tree', () => {
  const blk = (args, types, nothing) => ({ nothing, fn: { sig: sig(types.map((t, i) => ['a' + i, t]), 'int'), tests: [{ args, want: 0 }] } });
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
  const cls = (tests, methods = { add: sig([['x', 'int']], 'void'), size: sig([], 'int') }) => ({ cls: { methods, tests } });
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

test('generators: expansion is checked against the value set; stubs throw', () => {
  assert.doesNotThrow(() => P.checkExpanded([1, 2], 'ints'));
  assert.throws(() => P.checkExpanded([1, 'a'], 'ints'), /not a ints/);
  assert.throws(() => P.checkExpanded('x', 'strs'), /not a strs/);
  for (const g of [ramp, pairs('keys'), words('text')]) assert.throws(() => P.expandCase({ args: [g] }), /not implemented/, g.gen);
  const fake = { ramp: (g) => Array.from({ length: g.n }, (_, i) => i), pairs: () => [1], words: () => 'a b' };
  const c = { args: [ramp, [9]], want: ramp };
  const a = plain(P.expandCase(c, fake));
  assert.deepEqual(a, plain(P.expandCase(c, fake)));
  assert.deepEqual(a, { args: [[0, 1, 2, 3, 4], [9]], want: [0, 1, 2, 3, 4] });
  assert.doesNotThrow(() => P.checkExpanded(a.args[0], 'ints'));
});

test('walk: real missions pass (zero practice blocks today); fixtures prove it bites', () => {
  const D = load('engine.js', 'content.js', 'practice.js').DSQ;
  assert.doesNotThrow(() => D.practice.checkAll(D.CH));
  const good = FN([{ args: [[1, 2], 1], want: 2 }]);
  const wrap = (practice) => [{ missions: [{ title: 'a' }, { title: 'b', practice }] }];
  assert.doesNotThrow(() => D.practice.checkAll(wrap(good)));
  assert.throws(() => D.practice.checkAll(wrap(FN([{ args: [[1, 2]], want: 2 }]))), /mission 0\.1: .*expects 2 args/);
  assert.throws(() => D.practice.checkAll(wrap(FN([{ args: [ramp, 1], want: 'x' }]))), /mission 0\.1/);
  assert.throws(() => D.practice.checkAll(wrap(FN([{ args: [{ gen: 'zig' }, 1], want: 2 }]))), /unknown generator kind/);
});

test('walk: expands generators, so a stub fails loudly and a fake expansion is checked', () => {
  const D = load('engine.js', 'content.js', 'practice.js').DSQ;
  const wrap = (practice) => [{ missions: [{ title: 'a', practice }] }];
  const blk = wrap(FN([{ args: [{ gen: 'ramp', n: 3 }, 1], want: 2 }]));
  assert.throws(() => D.practice.checkAll(blk), /mission 0\.0: .*not implemented/);
  assert.doesNotThrow(() => D.practice.checkAll(blk, { ramp: () => [0, 1, 2] }));
  assert.throws(() => D.practice.checkAll(blk, { ramp: () => 'x' }), /mission 0\.0: .*not a ints/);
  assert.throws(() => D.practice.checkAll(blk, { ramp: () => [0.5] }), /not a ints/);
});

test('block: a fn case needs a want unless it returns void; bad class steps fail clearly', () => {
  assert.throws(() => P.checkBlock(FN([{ args: [[1, 2], 1] }])), /needs a want/);
  const listFn = { fn: { sig: sig([['l', 'list']], 'list'), tests: [{ args: [[1]] }] } };
  assert.throws(() => P.checkBlock(listFn), /needs a want/);
  const cls = (tests) => ({ cls: { methods: { size: sig([], 'int') }, tests } });
  assert.throws(() => P.checkBlock(cls([null])), /must be a list of steps/);
  assert.throws(() => P.checkBlock(cls([[null]])), /step 0 must be an object/);
  assert.doesNotThrow(() => P.checkBlock(cls([[{ m: 'size', args: [] }]])));
});
