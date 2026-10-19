// Differential corpus guard: every entry of tests/fixtures/shell-corpus.json is replayed in a fresh world and must
// still produce the recorded out/code/cwd/vars/files. An intentional behaviour change is declared in
// tests/fixtures/shell-corpus-allow.json: { "<key>": { reason, out?, code?, vars?, files?, cwd? } } where <key> is keyOf(entry): the
// prefix lines then the entry's lines joined with "\n", headed by "[setup 0..N]\n" (or "[setup 0..N session]\n" for a whole-chapter answer session) for mission-answer entries. An allowed entry must equal ITS override (fields it does not
// override still match the fixture). Entries marked expectChange in the fixture are the ones Stage 2 plans to change;
// today they pin current behaviour. Regenerate (only when told to): UPDATE_CORPUS=1 node --test tests/shell/corpus.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIXTURE, ALLOW, runSpec, keyOf, specLines, writeFixture, PINNED_QF } from './corpus-generate.mjs';
import { loadShell } from './harness.mjs';

if (process.env.UPDATE_CORPUS) {
  const n = writeFixture();
  console.log(`corpus: wrote ${n} entries to ${FIXTURE}`);
}

const FIELDS = ['out', 'code', 'cwd', 'vars', 'files', 'gone'];
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

describe('differential corpus', () => {
  const have = fs.existsSync(FIXTURE);
  it('fixture exists', () => assert.ok(have, `fixture missing: ${FIXTURE} (generate with UPDATE_CORPUS=1)`));
  const corpus = have ? readJson(FIXTURE) : [];
  const allow = fs.existsSync(ALLOW) ? readJson(ALLOW) : {};

  it('has at least 250 entries with unique keys', () => {
    assert.ok(corpus.length >= 250, `only ${corpus.length} entries`);
    const keys = corpus.map(keyOf);
    assert.equal(new Set(keys).size, keys.length, 'duplicate corpus keys');
  });

  it('every allow-list key names an expectChange corpus entry and carries a reason', () => {
    const marked = new Set(corpus.filter((e) => e.expectChange).map(keyOf));
    for (const [k, v] of Object.entries(allow)) {
      assert.ok(marked.has(k), `allow-list key is not a corpus entry marked expectChange: ${JSON.stringify(k)}`);
      assert.ok(typeof v.reason === 'string' && v.reason.length > 0, `allow entry needs a reason: ${JSON.stringify(k)}`);
    }
  });

  it('contains every beginner and intermediate mission answer (chapters 0..10)', () => {
    const SQ = loadShell();
    const have = new Set(corpus.filter((e) => e.line !== undefined && e.setupUpTo !== undefined).map((e) => e.line));
    let n = 0;
    SQ.content.chapters.slice(0, 11).forEach((c, ci) =>
      c.missions.forEach((m, mi) => {
        n++;
        assert.ok(have.has(m.answer), `chapter ${ci} mission ${mi} answer missing: ${m.answer}`);
        assert.ok(corpus.some((e) => e.setupUpTo === ci && e.line === m.answer && (e.prefix || []).length === mi), `chapter ${ci} mission ${mi}: no entry with its prefix`);
      }));
    assert.ok(n >= 70, `expected the full answer set, saw ${n}`);
  });

  it('contains every Beginner and Intermediate quick-fire answer variant', () => {
    const SQ = loadShell();
    const lines = new Set(corpus.filter((e) => e.line !== undefined).map((e) => e.line));
    for (const q of SQ.content.quickfire.filter(PINNED_QF)) for (const a of q[1]) assert.ok(lines.has(a), `quick-fire answer missing: ${a}`);
  });

  for (const e of corpus) {
    const key = keyOf(e);
    const label = JSON.stringify(specLines(e).join(' ⏎ ')) + (e.prefix && e.prefix.length ? ` (after ${e.prefix.length} prefix lines, setup 0..${e.setupUpTo})` : e.setupUpTo !== undefined ? ` (setup 0..${e.setupUpTo})` : '');
    it(label, () => {
      const got = runSpec(e);
      const ov = Object.prototype.hasOwnProperty.call(allow, key) ? allow[key] : null;
      for (const f of FIELDS) {
        const want = ov && f in ov ? ov[f] : e[f];
        assert.deepEqual(got[f], want, `${f} differs for ${JSON.stringify(specLines(e))}${ov ? ' (allow-listed override: ' + ov.reason + ')' : e.expectChange ? ' (expectChange: ' + e.changeNote + ')' : ''}`);
      }
    });
  }
});
