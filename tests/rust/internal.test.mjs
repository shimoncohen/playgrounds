import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadRust, ROOT } from './harness.mjs';

const RQ = loadRust();
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/rust/corpus-1.json'), 'utf8'));
const SEEDS = [...corpus.map((e) => e.src), ...RQ.missionPrograms().map((p) => p.src)];

describe('internal is not unsupported', () => {
  it('an engine exception on valid code gives status internal, never unsupported', () => {
    const c = RQ.run('fn main() {\n    println!("hi");\n}\n', { testFault: () => { throw new Error('boom'); } });
    assert.equal(c.status, 'internal');
    assert.match(c.message, /boom/);
    assert.equal(c.unsupported, null);
    assert.equal(c.compiles(), false);
  });
  it('a non-Error throw is still caught', () => {
    assert.equal(RQ.run('fn main() {}', { testFault: () => { throw 'plain'; } }).status, 'internal');
  });
  it('no corpus or mission program returns internal', () => {
    assert.ok(SEEDS.length > 15);
    for (const src of SEEDS) assert.notEqual(RQ.run(src).status, 'internal', src);
  });
});

// mulberry32: a fixed-seed generator, so a failing mutation reproduces
const rng = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const BITS = ['{', '}', '(', ')', ';', '"', "'", '!', 'let ', 'mut ', 'fn ', '&', '*', '::', '<', '>', '=', '1', '0', '-', 'if ', '/*', '//', '\n', '{}', 'struct ', 'x', '255u8', '.', ',', '#'];
function mutate(src, rand) {
  const cs = Array.from(src);
  const n = 1 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const i = Math.floor(rand() * (cs.length + 1)), op = Math.floor(rand() * 5);
    if (op === 0) cs.splice(i, 1);
    else if (op === 1) cs.splice(i, 0, BITS[Math.floor(rand() * BITS.length)]);
    else if (op === 2) cs.splice(i, 0, ...cs.slice(i, i + 1 + Math.floor(rand() * 8)));
    else if (op === 3 && i < cs.length - 1) [cs[i], cs[i + 1]] = [cs[i + 1], cs[i]];
    else cs.length = i;
  }
  return cs.join('');
}

describe('fuzz: mutated sources never throw, never go internal, return within the cap', () => {
  it('runs 40 fixed-seed mutations of every seed program', () => {
    const rand = rng(20261101);
    const t0 = Date.now();
    let runs = 0;
    for (const seed of SEEDS) {
      for (let k = 0; k < 40; k++) {
        const src = mutate(seed, rand);
        let c;
        assert.doesNotThrow(() => { c = RQ.run(src, { maxSteps: 5000 }); }, src);
        assert.notEqual(c.status, 'internal', `${c.message}\n${src}`);
        assert.ok(['ok', 'error', 'unsupported', 'limit'].includes(c.status), c.status);
        runs++;
      }
    }
    assert.ok(runs >= 600);
    assert.ok(Date.now() - t0 < 60000, 'fuzz took too long');
  });
});
