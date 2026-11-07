import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

describe('corpus v0: shape', () => {
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
