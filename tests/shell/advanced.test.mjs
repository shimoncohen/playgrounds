// Mission kinds: script and challenge missions, with two fake chapters injected through the harness (Task 10).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, loadShell, run } from './harness.mjs';
import { assertSolvable } from './solvability-lib.mjs';

const FAKE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/fake-advanced.js');
function withFake() {
  const ctx = loadContext();
  vm.runInContext(fs.readFileSync(FAKE, 'utf8'), ctx, { filename: FAKE });
  const SQ = ctx.SQ;
  const ch = SQ.content.chapters[SQ.content.chapters.length - 1];
  return { SQ, ch, hi: ch.missions[0], cnt: ch.missions[1] };
}
const put = (SQ, m, text) => assert.equal(SQ.writeFile(SQ.norm(m.file, SQ.HOME), text, false, m.file), null);

describe('mission kinds', () => {
  it('the fake chapter lands in the advanced tier at 20 XP per mission', () => {
    const { SQ, ch } = withFake();
    const i = SQ.content.chapters.indexOf(ch);
    assert.equal(SQ.tiers.tierOf(i).id, 'advanced');
    assert.equal(SQ.tiers.missionXp(i), 20);
  });

  it('the solvability rules pass the script mission and the challenge mission', () => {
    const { SQ, ch, hi, cnt } = withFake();
    assertSolvable(SQ, ch, hi);
    assertSolvable(SQ, ch, cnt);
  });

  it('setup writes the starter only when the file is absent', () => {
    const { SQ, ch, hi } = withFake();
    SQ.setupChapter(ch);
    assert.equal(SQ.getNode(SQ.norm(hi.file, SQ.HOME)).content, hi.starter);
    put(SQ, hi, 'echo mine\n');
    SQ.setupChapter(ch);
    assert.equal(SQ.getNode(SQ.norm(hi.file, SQ.HOME)).content, 'echo mine\n');
  });

  it('no check on a script mission: scriptPasses decides; wrong scripts give the failing case', () => {
    const { SQ, ch, hi } = withFake();
    assert.equal(hi.check, undefined);
    SQ.setupChapter(ch);
    assert.equal(SQ.ctxFor('').scriptPasses(hi).ok, false);
    put(SQ, hi, hi.wrong[0]);
    const r = SQ.ctxFor('').scriptPasses(hi);
    assert.equal(r.ok, false);
    assert.equal(r.failed.index, 1);
    assert.equal(SQ.scriptFailLine(hi, r.failed), 'Test 2 (no name) failed: expected "Hi nobody", got "Hi "');
    put(SQ, hi, hi.answer);
    assert.equal(SQ.ctxFor('').scriptPasses(hi).ok, true);
  });

  it('the failing-case line: first starter case, missing file, 120-character cut, one line', () => {
    const { SQ, ch, hi } = withFake();
    SQ.setupChapter(ch);
    const f = SQ.ctxFor('').scriptPasses(hi).failed;
    assert.equal(SQ.scriptFailLine(hi, f), 'Test 1 (with a name) failed: expected "Hi Ada", got "Hi"');
    assert.equal(SQ.scriptFailLine(hi, { index: -1, label: 'file' }), 'Save your script as scripts/hi.sh first (nano scripts/hi.sh).');
    const long = SQ.scriptFailLine(hi, { index: 0, label: 'x', expected: 'e'.repeat(200), got: 'a\nb' });
    assert.equal(long.length, 120);
    assert.ok(!long.includes('\n'));
  });

  it('challenge: the custom check wins over the test cases', () => {
    const { SQ, ch, cnt } = withFake();
    SQ.setupChapter(ch);
    put(SQ, cnt, cnt.wrong[1]);
    assert.equal(SQ.ctxFor('').scriptPasses(cnt).ok, false);
    put(SQ, cnt, '#!/bin/bash\n# read\necho 2\n');
    assert.equal(SQ.ctxFor('').scriptPasses(cnt).ok, true, 'cases alone pass this one');
    assert.equal(cnt.check(SQ.ctxFor('')), true);
    put(SQ, cnt, 'echo 2\n');
    assert.equal(cnt.check(SQ.ctxFor('')), false, 'cases pass but the check rejects it');
  });

  it('the solvability rules reject malformed script missions', () => {
    const { SQ, ch, hi } = withFake();
    const mk = (over) => Object.assign({}, hi, over);
    const bad = (m) => assert.throws(() => assertSolvable(SQ, ch, m));
    bad(mk({ tests: [] }));
    bad(mk({ tests: undefined }));
    bad(mk({ tests: [{ args: [], expectOut: 'x' }] }));
    bad(mk({ answer: '#!/bin/bash\necho no\n' }));
    bad(mk({ starter: hi.answer }));
    bad(mk({ wrong: [hi.answer] }));
    bad(mk({ file: undefined }));
  });

  it('a script that runs away is a failed case, not an exception', () => {
    const { SQ, ch, hi } = withFake();
    SQ.setupChapter(ch);
    put(SQ, hi, 'while true; do :; done\n');
    assert.equal(SQ.ctxFor('').scriptPasses(hi).ok, false);
  });
});

// ---- Task 11: Advanced chapters 12 (Decisions) and 13 (Loops & numbers), indexes 11 and 12 ----
const D12 = 11, L13 = 12;
// UI-style: fresh world, the chapter's setup (with starters), every line on its own log, judge the last line.
function ui(ci, mi, ...lines) {
  const SQ = loadShell();
  SQ.setupChapter(SQ.content.chapters[ci]);
  for (const l of lines) run(SQ, l);
  return SQ.content.chapters[ci].missions[mi].check(SQ.ctxFor(lines[lines.length - 1]));
}
const yes = (ci, mi, ...lines) => assert.ok(ui(ci, mi, ...lines), `should accept: ${lines.join(' / ')}`);
const no = (ci, mi, ...lines) => assert.ok(!ui(ci, mi, ...lines), `should reject: ${lines.join(' / ')}`);
const JOURNAL_GOT = () => loadShell().JOURNAL.split('\n').map((l) => 'got: ' + l).join('\n');

describe('advanced chapters 12 and 13: shape', () => {
  const SQ = loadShell();
  const ch = SQ.content.chapters;
  it('sit at indexes 11 and 12, tier advanced, 7 missions each, after the untouched Intermediate tier', () => {
    assert.ok(ch.length >= 13);
    assert.deepEqual([...ch.slice(7, 11).map((c) => c.tier)], Array(4).fill('intermediate'));
    assert.deepEqual([...ch.slice(7, 11).map((c) => c.missions.length)], [7, 8, 7, 7]);
    assert.deepEqual([...ch.slice(11, 13).map((c) => c.tier)], ['advanced', 'advanced']);
    assert.deepEqual([...ch.slice(11, 13).map((c) => c.name)], ['Decisions', 'Loops & numbers']);
    assert.deepEqual([...ch.slice(11, 13).map((c) => c.badge)], ['Decider', 'Looper']);
    assert.deepEqual([...ch.slice(11, 13).map((c) => c.missions.length)], [7, 7]);
    assert.equal(SQ.tiers.tierOf(11).id, 'advanced');
    assert.equal(SQ.tiers.missionXp(12), 20);
  });
  it('missions have the shared fields; 12.7 and 13.7 are script missions with starters, tests and wrong scripts', () => {
    for (const c of ch.slice(11, 13)) c.missions.forEach((m, i) => {
      for (const k of ['title', 'goal', 'explain', 'answer']) assert.equal(typeof m[k], 'string', `${m.title}.${k}`);
      assert.doesNotMatch(m.explain + m.goal + (m.note || '') + (m.hint || ''), /—/, 'no em dashes');
      if (i < 6) assert.ok(Array.isArray(m.anat) && m.anat.length && typeof m.check === 'function', m.title);
    });
    const ex = ch[D12].missions[6], sum = ch[L13].missions[6];
    assert.deepEqual([ex.kind, ex.file, sum.kind, sum.file], ['script', 'scripts/exists.sh', 'script', 'scripts/sum.sh']);
    for (const m of [ex, sum]) {
      assert.equal(typeof m.starter, 'string');
      assert.ok(m.wrong.length >= 2);
      assert.ok(m.tests.every((t) => t.label));
    }
    const cases = (m) => JSON.stringify(m.tests.map((t) => [t.args, t.expectOut]));
    assert.equal(cases(ex), JSON.stringify([[['journal.txt'], 'exists'], [['ghost.txt'], 'missing'], [['village'], 'exists']]));
    assert.equal(cases(sum), JSON.stringify([[['1', '2', '3'], '6'], [['10', '20'], '30'], [[], '0']]));
  });
  it('the Advanced tier so far: XP, Automator rank at the computed total, Intermediate still 1230', () => {
    assert.equal(SQ.tiers.cumulativeXp('intermediate'), 1230);
    const adv = ch.filter((c) => c.tier === 'advanced');
    const want = 1230 + adv.reduce((n, c) => n + c.missions.length * 20 + 25, 0);
    assert.equal(SQ.tiers.cumulativeXp('advanced'), want);
    assert.equal(SQ.tiers.rankFor(want).name, 'Automator');
  });
  it('no explanation teaches an unquoted variable inside a test', () => {
    for (const c of ch.slice(11, 13)) for (const m of c.missions) {
      const text = [m.goal, m.explain, m.note || '', m.hint || '', m.answer].join(' ').replace(/<[^>]+>/g, '');
      assert.doesNotMatch(text, /\[\s+\$\w/, `${m.title}: quote variables in [ ]`);
    }
    for (const g of SQ.content.guide.filter((g) => g.ch === 11 || g.ch === 12))
      for (const [e] of g.ex) assert.doesNotMatch(e, /\[\s+\$\w/, `guide ${g.c}: ${e}`);
    for (const q of SQ.content.quickfire.filter((q) => q[2] === 'advanced')) for (const a of q[1]) assert.doesNotMatch(a, /(^|[^[])\[\s+\$\w/, a); // unquoted is safe inside [[ ]], so only single [ is forbidden
  });
});

describe('advanced chapters 12 and 13: world seeding', () => {
  it('seeds scripts/, numbers.txt and the journal; does not seed lib/strings.sh; setup twice changes nothing', () => {
    const SQ = loadShell();
    for (const ci of [D12, L13]) SQ.setupChapter(SQ.content.chapters[ci]);
    const c = SQ.ctxFor('');
    assert.ok(c.isDir('~/scripts') && c.isDir('~/village') && c.isFile('~/journal.txt'));
    assert.ok(c.read('~/numbers.txt').split('\n').every((l) => /^-?\d+$/.test(l)));
    assert.ok(!c.has('~/lib/strings.sh'));
    assert.equal(c.read('~/scripts/exists.sh'), SQ.content.chapters[D12].missions[6].starter);
    assert.equal(c.read('~/scripts/sum.sh'), SQ.content.chapters[L13].missions[6].starter);
    const snap = JSON.stringify(SQ.S.fs);
    for (const ci of [D12, L13]) SQ.setupChapter(SQ.content.chapters[ci]);
    assert.equal(JSON.stringify(SQ.S.fs), snap, 'second setup changes nothing');
  });
  it('never clobbers learner files', () => {
    const SQ = loadShell();
    SQ.setupChapter(SQ.content.chapters[L13]);
    run(SQ, 'echo 1 > numbers.txt');
    run(SQ, 'echo mine > scripts/sum.sh');
    SQ.setupChapter(SQ.content.chapters[L13]);
    const c = SQ.ctxFor('');
    assert.equal(c.read('~/numbers.txt').trim(), '1');
    assert.equal(c.read('~/scripts/sum.sh').trim(), 'mine');
  });
  it('jump-in safe: each answer works in a fresh world with only its own chapter set up', () => {
    for (const ci of [D12, L13]) {
      const SQ = loadShell();
      const ch = SQ.content.chapters[ci];
      SQ.setupChapter(ch);
      for (const m of ch.missions) assertSolvable(SQ, ch, m);
    }
  });
  it('jump-in safe after the chapter files were deleted: setup puts them back', () => {
    const SQ = loadShell();
    run(SQ, 'rm -r journal.txt village scripts');
    const ch = SQ.content.chapters[D12];
    SQ.setupChapter(ch);
    for (const m of ch.missions) assertSolvable(SQ, ch, m);
  });
});

describe('chapter 12 (Decisions) checks', () => {
  it('12.1 Test a file', () => {
    yes(D12, 0, '[ -f journal.txt ] && echo yes');
    yes(D12, 0, 'test -f journal.txt && echo yes');
    yes(D12, 0, '[[ -f journal.txt ]] && echo yes');
    yes(D12, 0, 'if [ -f readme.txt ]; then echo yes; fi');
    no(D12, 0, 'echo yes');
    no(D12, 0, '[ -f journal.txt ]');
    no(D12, 0, '[ -f journal.txt ]; echo yes');
    no(D12, 0, '[ -f nothing.txt ] || echo yes');
    no(D12, 0, '[ -d village ] && echo yes');
  });
  it('12.2 One-line if', () => {
    yes(D12, 1, 'if [ -d village ]; then echo found; fi');
    yes(D12, 1, 'if test -d village; then echo found; fi');
    yes(D12, 1, 'if [[ -d ~/village ]]; then echo found; else echo lost; fi');
    no(D12, 1, 'echo found');
    no(D12, 1, '[ -d village ] && echo found');
    no(D12, 1, 'if [ -f journal.txt ]; then echo found; fi');
    no(D12, 1, 'if [ -d nowhere ]; then echo found; fi');
  });
  it('12.3 Else branch', () => {
    yes(D12, 2, 'if [ -f nothing.txt ]; then echo yes; else echo no; fi');
    yes(D12, 2, 'if test -e nothing.txt; then echo yes; else echo no; fi');
    yes(D12, 2, 'if [ -d nowhere ]; then echo yes; else echo no; fi');
    no(D12, 2, 'echo no');
    no(D12, 2, 'if [ -f journal.txt ]; then echo yes; else echo no; fi');
    no(D12, 2, 'if [ -f journal.txt ]; then echo no; else echo yes; fi');
    no(D12, 2, 'if [ -f nothing.txt ]; then echo yes; fi');
    no(D12, 2, '[ -f nothing.txt ] || echo no');
  });
  it('12.4 Compare numbers', () => {
    yes(D12, 3, '[ 5 -gt 3 ] && echo bigger');
    yes(D12, 3, 'test 10 -gt 2 && echo bigger');
    yes(D12, 3, 'if [ 5 -gt 3 ]; then echo bigger; fi');
    yes(D12, 3, '[[ 5 -gt 3 ]] && echo bigger');
    no(D12, 3, 'echo bigger');
    no(D12, 3, '[ 3 -gt 5 ] && echo bigger');
    no(D12, 3, '[ 5 > 3 ] && echo bigger');
    no(D12, 3, '[ 5 -lt 3 ] || echo bigger');
  });
  it('12.5 Match a pattern', () => {
    yes(D12, 4, 'case "$USER" in explorer) echo hello;; *) echo who;; esac');
    yes(D12, 4, 'case "$USER" in exp*) echo hello;; *) echo who;; esac');
    yes(D12, 4, 'case "${USER}" in root|explorer) echo hello;; esac');
    no(D12, 4, 'echo hello');
    no(D12, 4, 'case "$USER" in root) echo hello;; *) echo who;; esac');
    no(D12, 4, 'case explorer in explorer) echo hello;; esac');
    no(D12, 4, '[ "$USER" = explorer ] && echo hello');
  });
  it('12.6 Double brackets', () => {
    yes(D12, 5, '[[ "$USER" == exp* ]] && echo matches');
    yes(D12, 5, '[[ $USER == *plor* ]] && echo matches');
    yes(D12, 5, 'if [[ "$USER" = ex* ]]; then echo matches; fi');
    no(D12, 5, 'echo matches');
    no(D12, 5, '[ "$USER" == exp* ] && echo matches');
    no(D12, 5, '[[ "$USER" == "exp*" ]] && echo matches');
    no(D12, 5, '[[ "$USER" == root* ]] && echo matches');
    no(D12, 5, '[[ -f journal.txt ]] && echo matches');
  });
  it('12.7 Script: exists? (answer, an alternative, wrong ones)', () => {
    const SQ = loadShell();
    const ch = SQ.content.chapters[D12], m = ch.missions[6];
    SQ.setupChapter(ch);
    const ok = (t) => { put(SQ, m, t); return SQ.ctxFor('').scriptPasses(m).ok; };
    assert.equal(ok(m.answer), true);
    assert.equal(ok('#!/bin/bash\n[ -e "$1" ] && echo exists || echo missing\n'), true, 'one-line alternative');
    assert.equal(ok('#!/bin/bash\nif test -f "$1" || test -d "$1"; then\n  echo exists\nelse\n  echo missing\nfi\n'), true, '-f or -d');
    assert.equal(ok('#!/bin/bash\nif [ -f "$1" ]; then echo exists; else echo missing; fi\n'), false, '-f misses the folder');
    assert.equal(ok('#!/bin/bash\necho exists\n'), false);
    assert.equal(ok(m.starter), false);
    put(SQ, m, '#!/bin/bash\nif [ -f "$1" ]; then echo exists; else echo missing; fi\n');
    assert.equal(SQ.scriptFailLine(m, SQ.ctxFor('').scriptPasses(m).failed), 'Test 3 (a folder) failed: expected "exists", got "missing"');
  });
});

describe('chapter 13 (Loops & numbers) checks', () => {
  it('13.1 Count up', () => {
    yes(L13, 0, 'i=1; while [ "$i" -le 3 ]; do echo "$i"; i=$((i+1)); done');
    yes(L13, 0, 'i=1; while [ $i -le 3 ]; do echo $i; i=$((i+1)); done');
    yes(L13, 0, 'i=0; while (( i < 3 )); do i=$((i+1)); echo "$i"; done');
    yes(L13, 0, 'i=1', 'while [ "$i" -lt 4 ]; do echo "$i"; i=$((i+1)); done');
    no(L13, 0, 'echo 1; echo 2; echo 3');
    no(L13, 0, 'seq 3');
    no(L13, 0, 'for i in 1 2 3; do echo "$i"; done');
    no(L13, 0, 'i=1; while [ "$i" -lt 3 ]; do echo "$i"; i=$((i+1)); done');
  });
  it('13.2 Do the math', () => {
    yes(L13, 1, 'echo $((6*7))');
    yes(L13, 1, 'echo $(( 6 * 7 ))');
    yes(L13, 1, 'x=$((7*6)); echo "$x"');
    no(L13, 1, 'echo 42');
    no(L13, 1, 'echo $((6+7))');
    no(L13, 1, 'echo 6*7');
  });
  it('13.3 Add them up', () => {
    yes(L13, 2, 'sum=0; for n in 1 2 3 4; do sum=$((sum+n)); done; echo $sum');
    yes(L13, 2, 'sum=0; for n in 1 2 3 4; do ((sum+=n)); done; echo "$sum"');
    yes(L13, 2, 'total=0; for n in $(seq 4); do total=$((total+n)); done; echo "$total"');
    yes(L13, 2, 'sum=0', 'for n in 1 2 3 4; do sum=$((sum+n)); done; echo "$sum"');
    no(L13, 2, 'echo 10');
    no(L13, 2, 'echo $((1+2+3+4))');
    no(L13, 2, 'sum=0; for n in 1 2 3 4; do sum=$((sum+n)); done; echo "$n"');
    no(L13, 2, 'sum=0; for n in 1 2 3; do sum=$((sum+n)); done; echo "$sum"');
  });
  it('13.4 Count down', () => {
    yes(L13, 3, 'n=3; until [ "$n" -eq 0 ]; do echo "$n"; n=$((n-1)); done');
    yes(L13, 3, 'n=3; until [ "$n" -lt 1 ]; do echo "$n"; n=$((n-1)); done');
    yes(L13, 3, 'n=3; until (( n == 0 )); do echo "$n"; ((n--)); done');
    no(L13, 3, 'echo 3; echo 2; echo 1');
    no(L13, 3, 'n=3; while [ "$n" -gt 0 ]; do echo "$n"; n=$((n-1)); done');
    no(L13, 3, 'n=3; until [ "$n" -eq 1 ]; do echo "$n"; n=$((n-1)); done');
  });
  it('13.5 Stop early', () => {
    yes(L13, 4, 'for i in 1 2 3 4 5; do [ "$i" -eq 3 ] && break; echo "$i"; done');
    yes(L13, 4, 'for i in 1 2 3 4 5; do if [ "$i" -eq 3 ]; then break; fi; echo "$i"; done');
    yes(L13, 4, 'i=1; while true; do [ "$i" -eq 3 ] && break; echo "$i"; i=$((i+1)); done');
    no(L13, 4, 'for i in 1 2; do echo "$i"; done');
    no(L13, 4, 'for i in 1 2 3 4 5; do echo "$i"; [ "$i" -eq 3 ] && break; done');
    no(L13, 4, 'echo 1; echo 2; break');
  });
  it('13.6 Read a file line by line', () => {
    const want = JOURNAL_GOT();
    assert.ok(want.split('\n').length > 20);
    yes(L13, 5, 'while read line; do echo "got: $line"; done < journal.txt');
    yes(L13, 5, 'while read -r line; do echo "got: $line"; done < journal.txt');
    yes(L13, 5, 'cat journal.txt | while read l; do echo "got: $l"; done');
    yes(L13, 5, `while read -r line; do printf 'got: %s\\n' "$line"; done < journal.txt`);
    no(L13, 5, `sed 's/^/got: /' journal.txt`);
    no(L13, 5, 'cat journal.txt');
    no(L13, 5, 'while read line; do echo "$line"; done < journal.txt');
    no(L13, 5, 'while read line; do echo "got: $line"; done < readme.txt');
    no(L13, 5, 'while read line; do echo "got: $line"; done < journal.txt | head -n 3');
  });
  it('13.7 Script: sum (answer, alternatives, wrong ones)', () => {
    const SQ = loadShell();
    const ch = SQ.content.chapters[L13], m = ch.missions[6];
    SQ.setupChapter(ch);
    const ok = (t) => { put(SQ, m, t); return SQ.ctxFor('').scriptPasses(m).ok; };
    assert.equal(ok(m.answer), true);
    assert.equal(ok('#!/bin/bash\ntotal=0\nwhile [ "$#" -gt 0 ]; do\n  total=$((total + $1))\n  shift\ndone\necho "$total"\n'), true, 'shift loop');
    assert.equal(ok('#!/bin/bash\ns=0\nfor n; do ((s += n)); done\necho "$s"\n'), true, 'for n; with (( ))');
    assert.equal(ok('#!/bin/bash\necho $(($1 + $2))\n'), false, 'two arguments only');
    assert.equal(ok('#!/bin/bash\necho 6\n'), false);
    assert.equal(ok(m.starter), false);
    put(SQ, m, '#!/bin/bash\necho $(($1 + $2 + $3))\n');
    // like bash, $((10 + 20 + )) is an arithmetic syntax error, so the script prints nothing
    assert.equal(SQ.scriptFailLine(m, SQ.ctxFor('').scriptPasses(m).failed), 'Test 2 (two numbers) failed: expected "30", got ""');
  });
});

describe('advanced quick-fire and guide (chapters 12 and 13)', () => {
  const SQ = loadShell();
  it('has 6 quick-fire questions per chapter, tagged advanced', () => {
    assert.ok(SQ.content.quickfire.filter((q) => q[2] === 'advanced').length >= 12);
  });
  it('has 6 guide entries per chapter, covering the new keywords', () => {
    for (const ci of [11, 12]) assert.ok(SQ.content.guide.filter((g) => g.ch === ci).length >= 6, `chapter ${ci}`);
    const cs = SQ.content.guide.filter((g) => g.ch === 11 || g.ch === 12).map((g) => g.c);
    for (const k of ['[', 'test', '[[', 'if', 'case', 'while', 'until', 'break', 'read', '$(( ))']) assert.ok(cs.includes(k), `guide entry ${k}`);
  });
  it('every advanced quick-fire answer runs without an error in a set-up world', () => {
    for (const q of SQ.content.quickfire.filter((q) => q[2] === 'advanced'))
      for (const a of q[1]) {
        const S2 = loadShell();
        for (const ci of [D12, L13]) S2.setupChapter(S2.content.chapters[ci]);
        run(S2, 'touch notes.txt; mkdir -p logs');
        const r = run(S2, a);
        assert.doesNotMatch(r.out, /bash:|not support|command not found/, `${a}: ${r.out}`);
      }
  });
  it('guide examples for chapters 12 and 13 print what they say', () => {
    for (const g of SQ.content.guide.filter((g) => g.ch === 11 || g.ch === 12))
      for (const [e, note] of g.ex) {
        const S2 = loadShell();
        for (const ci of [D12, L13]) S2.setupChapter(S2.content.chapters[ci]);
        const r = run(S2, e);
        assert.doesNotMatch(r.out, /bash:|not support|command not found/, `${g.c}: ${e}: ${r.out}`);
        if (/^prints /.test(note)) assert.equal(r.out.replace(/\n/g, ' '), note.slice(7), `${g.c}: ${e}`);
      }
  });
});
