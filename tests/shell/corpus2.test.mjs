// Second differential corpus guard (Stage 2 engine, recorded BEFORE any Stage 3 change): every entry of
// tests/fixtures/shell-corpus2.json is replayed in a fresh world (the setup() of chapters 0..14, or 0..N for a mission entry) and must
// still produce the recorded out/code/cwd/vars/files/gone. An intentional change is declared in tests/fixtures/shell-corpus2-allow.json:
// { "<key>": { reason, out?, code?, vars?, files?, cwd?, gone? } } where <key> is keyOf(entry). Only entries marked expectChange
// (the lines Stage 3 plans to change) may be overridden; an allowed entry must equal ITS override (fields it does not override still
// match the fixture). Never regenerate the fixture to make a failure go away.
// Generated once on the Stage 2 engine: UPDATE_CORPUS2=1 node --test tests/shell/corpus2.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIXTURE, ALLOW, runSpec, keyOf, specLines, writeFixture, ADVANCED_FIRST } from './corpus2-generate.mjs';
import { loadShell } from './harness.mjs';

if (process.env.UPDATE_CORPUS2) {
  const n = writeFixture();
  console.log(`corpus2: wrote ${n} entries to ${FIXTURE}`);
}

const FIELDS = ['out', 'code', 'cwd', 'vars', 'files', 'gone'];
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

describe('differential corpus 2 (Stage 2 engine)', () => {
  const have = fs.existsSync(FIXTURE);
  it('fixture exists', () => assert.ok(have, `fixture missing: ${FIXTURE} (generate with UPDATE_CORPUS2=1)`));
  const corpus = have ? readJson(FIXTURE) : [];
  const allow = fs.existsSync(ALLOW) ? readJson(ALLOW) : {};

  it('has at least 700 entries with unique keys', () => {
    assert.ok(corpus.length >= 700, `only ${corpus.length} entries`);
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

  it('every expectChange entry carries a changeNote', () => {
    for (const e of corpus.filter((x) => x.expectChange)) assert.ok(typeof e.changeNote === 'string' && e.changeNote.length > 0, `no changeNote: ${JSON.stringify(specLines(e))}`);
  });

  it('contains every Advanced command-mission answer, script answer and wrong script', () => {
    const SQ = loadShell();
    SQ.content.chapters.forEach((c, ci) => {
      if (ci < ADVANCED_FIRST) return;
      for (const m of c.missions) {
        if (m.kind === 'script' || m.kind === 'challenge') {
          for (const s of [m.answer, ...(m.wrong || [])]) assert.ok(corpus.some((e) => e.put && e.put[m.file] === s && e.setupUpTo === ci), `chapter ${ci} "${m.title}": script variant missing`);
        } else assert.ok(corpus.some((e) => e.setupUpTo === ci && e.line === m.answer), `chapter ${ci} "${m.title}": answer missing`);
      }
    });
  });

  it('contains every Advanced quick-fire answer', () => {
    const SQ = loadShell();
    const lines = new Set(corpus.filter((e) => e.line !== undefined).map((e) => e.line));
    for (const qf of SQ.content.quickfire.filter((x) => x[2] === 'advanced')) for (const a of qf[1]) assert.ok(lines.has(a), `quick-fire answer missing: ${a}`);
  });

  it('marks the Stage 3 feature lines expectChange', () => {
    const marked = corpus.filter((e) => e.expectChange);
    assert.ok(marked.length >= 150, `only ${marked.length} expectChange entries`);
    for (const word of ['awk', 'sleep', 'trap', 'getopts', 'sed -i', 'find . -name "*.txt" -exec', 'xargs -P', '<(', 'set -e', '%5.2f', 'grep -o']) assert.ok(marked.some((e) => specLines(e).join('\n').includes(word)), `no expectChange entry mentions ${word}`);
  });

  it('marks grep -A/-B/-C/-r/-rn/-l/-L/-q/-h/-m/-s and find -maxdepth lines expectChange', () => {
    for (const line of ['grep -A1 wolf forest/notes.txt', 'grep -B1 wolf forest/notes.txt', 'grep -C1 wolf forest/notes.txt', 'grep -rn wolf forest', 'grep -rl wolf .', 'grep -r wolf .', 'grep -l wolf forest/notes.txt', 'grep -L wolf forest/notes.txt', 'grep -q wolf forest/notes.txt; echo $?', 'grep -h wolf forest/notes.txt', 'grep -m1 a readme.txt', 'grep -s wolf nosuch.txt; echo $?', 'find . -maxdepth 1']) {
      const e = corpus.find((x) => x.line === line);
      assert.ok(e && e.expectChange, `not marked expectChange: ${line}`);
    }
    for (const e of corpus.filter((x) => x.setupUpTo === undefined && /^this practice shell does not support (grep|find) /m.test(x.out))) assert.ok(e.expectChange, `Stage 2 'does not support' grep/find output not marked: ${JSON.stringify(specLines(e))}`);
  });

  for (const e of corpus) {
    const key = keyOf(e);
    const label = JSON.stringify(specLines(e).join(' ⏎ ')) + (e.put ? ` (script ${Object.keys(e.put).pop()})` : '') + (e.prefix && e.prefix.length ? ` (after ${e.prefix.length} prefix lines, setup 0..${e.setupUpTo})` : e.setupUpTo !== undefined ? ` (setup 0..${e.setupUpTo})` : '');
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
