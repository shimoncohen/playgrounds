import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadRust, ROOT } from './harness.mjs';
import { programs } from './stamp-lib.mjs';

// verify-rustc.mjs holds each listed program to this pair of positions; this keeps the RQ half honest without a rustc.
const RQ = loadRust();
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/rust/corpus-1.json'), 'utf8'));
const gaps = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/rust/column-gaps.json'), 'utf8'));
const byId = new Map(programs(RQ, corpus).map((p) => [p.id, p]));

describe('programs whose error column differs from rustc', () => {
  for (const [id, gap] of Object.entries(gaps)) {
    it(`${id} is where the list says`, () => {
      assert.ok(byId.has(id), `${id} is not a corpus, mission or guide program`);
      assert.ok(gap.why && gap.rustc !== gap.rq);
      const e = RQ.run(byId.get(id).src).errors.filter((x) => x.code || x.lint);
      assert.equal(e.length, 1);
      assert.equal(`${e[0].line}:${e[0].col}`, gap.rq);
    });
  }
});
