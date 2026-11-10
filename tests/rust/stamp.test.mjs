// Fails when the corpus, a mission program or an engine result changes without a fresh tests/rust/verify-rustc.mjs run.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadRust, ROOT } from './harness.mjs';
import { programs, inputsHash, resultsHash, record, verifiedJs, sortGroups } from './stamp-lib.mjs';

const RQ = loadRust();
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/rust/corpus-1.json'), 'utf8'));
const VERIFIED = path.join(ROOT, 'tests/fixtures/rust/verified.json');
const progs = programs(RQ, corpus);

describe('the verify record matches the tree', () => {
  const v = () => JSON.parse(fs.readFileSync(VERIFIED, 'utf8'));
  it('has rustc, edition and date', () => {
    assert.match(v().rustc, /^\d+\.\d+\.\d+/);
    assert.equal(v().edition, '2024');
    assert.match(v().date, /^\d{4}-\d{2}-\d{2}/);
    assert.match(v().image, /^rust@sha256:[0-9a-f]{64}$/);
  });
  it('inputsHash covers the corpus and every mission program', () => assert.equal(inputsHash(corpus, progs), v().inputsHash));
  it('resultsHash covers what RQ.run returns for each of them', () => assert.equal(resultsHash(RQ.run, progs), v().resultsHash));
  it('the program counts equal what the tree holds', () => {
    assert.deepEqual(v().counts, record(RQ, corpus).counts);
    assert.equal(v().counts.missions, RQ.missionPrograms().length);
    assert.equal(v().counts.guide, RQ.GUIDE.reduce((n, g) => n + g.ex.length, 0));
  });
  it('verified.js carries exactly verified.json', () => {
    const sandbox = {};
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const js = fs.readFileSync(path.join(ROOT, 'programming/rust-quest/content/verified.js'), 'utf8');
    vm.runInContext(js, sandbox);
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.RQ.verified)), v());
    assert.equal(js, verifiedJs(sandbox.RQ.verified));
  });
});

describe('the hashes catch drift', () => {
  const base = { i: inputsHash(corpus, progs), r: resultsHash(RQ.run, progs) };
  it('a changed corpus entry changes inputsHash', () => {
    const c2 = corpus.map((e, i) => (i === 0 ? { ...e, out: e.out + 'x' } : e));
    assert.notEqual(inputsHash(c2, progs), base.i);
    const c3 = corpus.map((e, i) => (i === 0 ? { ...e, src: e.src + ' ' } : e));
    assert.notEqual(inputsHash(c3, programs(RQ, c3)), base.i);
  });
  it('a changed mission program changes inputsHash', () => {
    const p2 = progs.map((p) => (p.id.startsWith('mission:') ? { ...p, src: p.src + '\n' } : p));
    assert.notEqual(inputsHash(corpus, p2), base.i);
  });
  it('a new mission program is in missionPrograms and in inputsHash', () => {
    const RQ2 = loadRust();
    const n = RQ2.missionPrograms().length;
    RQ2.CH[0].missions[0].wrong.push({ src: 'fn main() {}\n', wrongWhy: 'check' });
    assert.equal(RQ2.missionPrograms().length, n + 1);
    assert.notEqual(inputsHash(corpus, programs(RQ2, corpus)), base.i);
  });
  it('a changed guide example changes inputsHash', () => {
    const RQ2 = loadRust();
    RQ2.GUIDE[0].ex[0][0] += '// x\n';
    assert.notEqual(inputsHash(corpus, programs(RQ2, corpus)), base.i);
  });
  it('a changed engine result changes resultsHash', () => {
    const run2 = (src) => { const c = RQ.run(src); return src === corpus[0].src ? { ...c, stdout: c.stdout + '!' } : c; };
    assert.notEqual(resultsHash(run2, progs), base.r);
  });
  it('resultsHash is deterministic', () => {
    const run2 = (src) => RQ.run(src);
    assert.equal(resultsHash(run2, progs), base.r);
  });
});

describe('sortGroups, the any-order comparison for HashMap output', () => {
  it('ignores the order of entries but not their values', () => {
    assert.equal(sortGroups('{"b": 2, "a": 1}'), sortGroups('{"a": 1, "b": 2}'));
    assert.notEqual(sortGroups('{"a": 1, "b": 2}'), sortGroups('{"a": 2, "b": 1}'));
  });
  it('keeps tuples whole, handles nesting and quoted commas', () => {
    assert.equal(sortGroups('{(3, 4), (1, 2)}'), sortGroups('{(1, 2), (3, 4)}'));
    assert.notEqual(sortGroups('{(1, 4), (3, 2)}'), sortGroups('{(1, 2), (3, 4)}'));
    assert.equal(sortGroups('x [{"b": 0, "a": 1}]'), sortGroups('x [{"a": 1, "b": 0}]'));
    assert.equal(sortGroups('{"k": {2, 1}}'), sortGroups('{"k": {1, 2}}'));
  });
  it('keeps a Vec in order, so a wrong-order Vec does not pass', () => {
    assert.notEqual(sortGroups('[2, 1]'), sortGroups('[1, 2]'));
    assert.notEqual(sortGroups('x [{"k": [2, 1]}, {"a": 0}]'), sortGroups('x [{"a": 0}, {"k": [2, 1]}]'));
  });
  it('leaves order outside brackets alone', () => assert.notEqual(sortGroups('a, b'), sortGroups('b, a')));
});
