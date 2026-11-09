import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { loadRust, ROOT } from './harness.mjs';

const RQ = loadRust();
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/rust/corpus-1.json'), 'utf8'));
const byId = new Map(corpus.map((e) => [e.id, e]));

function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// The corpus is append-only: the first SHIPPED entries keep their ids and order. Raise SHIPPED and the hash only when entries are appended and shipped.
const SHIPPED = 1096, SHIPPED_IDS_SHA256 = '918027acdd26286032f42e75e72f753d3e9bae42e29e288b4d31266e1847c684';
describe('corpus v0: shape', () => {
  it('only grows: the shipped ids are still the first entries, in order', () => {
    assert.ok(corpus.length >= SHIPPED, `the corpus shrank to ${corpus.length}`);
    assert.equal(crypto.createHash('sha256').update(corpus.slice(0, SHIPPED).map((e) => e.id).join('\n')).digest('hex'), SHIPPED_IDS_SHA256);
  });

  it('ids are unique and every entry has its authored fields', () => {
    assert.equal(byId.size, corpus.length);
    for (const e of corpus) {
      assert.ok(e.id && e.src && e.why && e.pr, e.id);
      if (e.expect === 'ok') {
        assert.equal(typeof e.out, 'string', e.id);
        assert.equal(typeof e.err, 'string', e.id);
        assert.equal(typeof e.exit, 'number', e.id);
      } else {
        assert.ok(Boolean(e.expect.code) !== Boolean(e.expect.lint), `${e.id}: code or lint, never both`);
        assert.equal(typeof e.expect.line, 'number', e.id);
      }
    }
  });

  it('every reject has a paired accept that differs by a minimal edit', () => {
    const rejects = corpus.filter((e) => e.expect !== 'ok');
    assert.ok(rejects.length >= 3);
    for (const e of rejects) {
      const acc = byId.get(e.pair);
      assert.ok(acc && acc.expect === 'ok', `${e.id} has no paired accept`);
      assert.ok(distance(e.src, acc.src) <= 8, `${e.id} and ${e.pair} differ by more than a minimal edit`);
    }
  });

  it('covers println and {}, E0384, mut and shadowing', () => {
    const ids = corpus.map((e) => e.id).join(' ');
    for (const w of ['hole', 'immutable-assign', '-mut', 'shadow']) assert.match(ids, new RegExp(w));
  });

  it('P5: each borrow-check code has 3 or more rejects, each with a paired accept', () => {
    assert.ok(corpus.some((e) => e.pr === 'P5'));
    for (const code of ['E0381', 'E0382', 'E0499', 'E0502', 'E0505', 'E0506', 'E0596', 'E0597']) {
      const rs = corpus.filter((e) => e.expect !== 'ok' && e.expect.code === code);
      assert.ok(rs.length >= 3, `${code} has ${rs.length} rejects`);
      for (const e of rs) assert.equal(byId.get(e.pair)?.expect, 'ok', `${e.id} has no paired accept`);
    }
  });
});

describe('corpus v0: RQ.run agrees with every authored entry', () => {
  for (const e of corpus) {
    it(e.id, () => {
      const c = RQ.run(e.src);
      if (e.expect === 'ok') {
        assert.equal(c.status, e.exit === 101 ? 'panic' : 'ok');
        assert.equal(c.stdout, e.out);
        assert.equal(c.stderr, e.err);
        assert.equal(c.exit, e.exit);
      } else {
        const id = e.expect.code || e.expect.lint;
        assert.equal(c.status, 'error');
        assert.equal(c.errors.filter((x) => x.code || x.lint).length, 1, 'exactly one coded error');
        assert.equal(c.hasError(id, e.expect.line), true);
      }
    });
  }
});
