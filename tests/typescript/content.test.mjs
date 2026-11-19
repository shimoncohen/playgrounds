import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptContent } from '../content-loader.mjs';
import { createSession } from './harness.mjs';

const { CH } = loadTypescriptContent();
const ch1 = CH[0];

// Measured against typescript@5.9.3. null: the line compiles clean and the check reads the run-time error instead.
const CODES = [2322, 2322, null, 18046, 7006, 2352, null];
const ALLOWED_C = ['src', 'diags', 'ok', 'err', 'has', 'types'];

const play = (m, src) => {
  const s = createSession();
  if (m.pre) s.run(m.pre);
  const rec = s.run(src);
  return { rec, passed: !!m.check(s.ctx(rec)) };
};

describe('typescript-quest chapter 1', () => {
  it('is Types and inference: 7 beginner ts missions with a story, intro, badge and learned list', () => {
    assert.equal(CH.length, 1);
    assert.equal(ch1.name, 'Types and inference');
    assert.equal(ch1.badge, 'Booking Stamp');
    assert.equal(ch1.tier, 'beginner');
    assert.equal(ch1.mode, 'ts');
    assert.equal(ch1.missions.length, 7);
    for (const k of ['story', 'intro']) assert.ok(ch1[k].trim(), k);
    assert.ok(ch1.learned.length > 0);
  });

  ch1.missions.forEach((m, i) => {
    describe(`mission ${i + 1}: ${m.title}`, () => {
      it('has every field, and its check reads only the allowed context members', () => {
        for (const k of ['title', 'goal', 'code', 'explain', 'hint', 'wrong']) assert.equal(typeof m[k], 'string', k);
        assert.equal(typeof m.check, 'function');
        assert.ok(Array.isArray(m.anat) && m.anat.length > 0, 'anat');
        assert.ok(Array.isArray(m.how) && m.how.length >= 3 && m.how.length <= 5, 'how: 3 to 5 steps');
        assert.match(m.how[0], /^The whole (line|code)/, 'how step 1 says what the whole line does');
        const used = new Set([...m.check.toString().matchAll(/\bc\.(\w+)/g)].map(x => x[1]));
        for (const u of used) assert.ok(ALLOWED_C.includes(u), `c.${u}`);
      });

      it('is solved by its reference answer', () => {
        const { rec, passed } = play(m, m.code);
        assert.equal(passed, true, JSON.stringify(rec));
      });

      it(CODES[i] ? `reports TS${CODES[i]}` : 'compiles clean and fails at run time', () => {
        const { rec } = play(m, m.code);
        if (CODES[i]) {
          assert.equal(!!m.expectError, true);
          assert.deepEqual(Array.from(rec.diags, d => d.code), [CODES[i]]);
        } else if (i === 2) {
          assert.equal(rec.diags.length, 0);
          assert.equal(rec.err.name, 'TypeError');
        } else {
          assert.equal(rec.diags.length, 0);
          assert.equal(rec.ok, true);
        }
      });

      it('is not solved by its near-miss or by a lazy line', () => {
        assert.equal(play(m, m.wrong).passed, false, 'wrong');
        assert.equal(play(m, 'void 0').passed, false, 'void 0');
      });
    });
  });

  it('every chapter-1 mission carries its own world values, not foo or bar', () => {
    for (const m of ch1.missions) assert.doesNotMatch(m.code, /\b(foo|bar|baz)\b/);
  });
});
