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
    const at = SQ.content.guide.find((g) => g.c === '"$@"');
    assert.match(at.what, /Always quote variables: bash splits an unquoted variable/, 'the "$@" entry warns that this shell does not split $var');
    assert.match(at.what, /for f in \$files loops once here but once per word in bash/);
  });
  it('every advanced quick-fire answer runs without an error in a set-up world', () => {
    for (const q of SQ.content.quickfire.filter((q) => q[2] === 'advanced'))
      for (const a of q[1]) {
        const S2 = loadShell();
        // the chapter 14 and 15 answers need their worlds too
        for (const ci of [D12, L13, 13, 14]) S2.setupChapter(S2.content.chapters[ci]);
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

// ---- Task 12: Advanced chapters 14 (Functions & arguments) and 15 (Real scripts), indexes 13 and 14 ----
const F14 = 13, R15 = 14;
const ALL_ADV = [D12, L13, F14, R15];
// a script mission: write text to its file in a world with the chapter set up, then ask the mission's own pass rule
function scriptJudge(ci, mi) {
  const SQ = loadShell();
  const ch = SQ.content.chapters[ci], m = ch.missions[mi];
  SQ.setupChapter(ch);
  const pass = () => (m.check ? !!m.check(SQ.ctxFor('')) : SQ.ctxFor('').scriptPasses(m).ok);
  const ok = (t) => { put(SQ, m, t); return pass(); };
  const why = (t) => { put(SQ, m, t); return SQ.scriptFailLine(m, SQ.ctxFor('').scriptPasses(m).failed); };
  return { SQ, ch, m, ok, why, pass };
}

describe('advanced chapters 14 and 15: shape', () => {
  const SQ = loadShell();
  const ch = SQ.content.chapters;
  it('sit at indexes 13 and 14, tier advanced, 7 missions each, after chapters 12 and 13', () => {
    assert.equal(ch.length, 15);
    assert.deepEqual([...ch.slice(11, 15).map((c) => c.tier)], Array(4).fill('advanced'));
    assert.deepEqual([...ch.slice(13, 15).map((c) => c.name)], ['Functions & arguments', 'Real scripts']);
    assert.deepEqual([...ch.slice(13, 15).map((c) => c.badge)], ['Function Maker', 'Scripter']);
    assert.deepEqual([...ch.slice(11, 15).map((c) => c.missions.length)], [7, 7, 7, 7]);
    assert.equal(SQ.tiers.missionXp(14), 20);
  });
  it('all 28 Advanced missions: cumulative XP 1230 + 28*20 + 4*25, Automator there, Intermediate still 1230', () => {
    const adv = ch.filter((c) => c.tier === 'advanced');
    assert.equal(adv.reduce((n, c) => n + c.missions.length, 0), 28);
    assert.equal(SQ.tiers.cumulativeXp('intermediate'), 1230);
    assert.equal(SQ.tiers.cumulativeXp('advanced'), 1230 + 28 * 20 + 4 * 25);
    assert.equal(SQ.tiers.cumulativeXp('advanced'), 1890);
    assert.equal(SQ.tiers.rankFor(1890).name, 'Automator');
    assert.ok(SQ.tiers.ranks().some((r) => r[1] === 'Automator' && r[0] === 1890));
  });
  it('missions have the shared fields, no em dashes, and the script missions sit where the table says', () => {
    for (const c of ch.slice(13, 15)) c.missions.forEach((m) => {
      for (const k of ['title', 'goal', 'explain', 'answer']) assert.equal(typeof m[k], 'string', `${m.title}.${k}`);
      assert.doesNotMatch(m.explain + m.goal + (m.note || '') + (m.hint || ''), /—/, 'no em dashes');
      if (!m.kind) assert.ok(Array.isArray(m.anat) && m.anat.length && typeof m.check === 'function', m.title);
    });
    const kinds = (c) => [...c.missions.map((m) => (m.kind ? `${m.kind}:${m.file}` : 'command'))];
    assert.deepEqual(kinds(ch[F14]), [...Array(6).fill('command'), 'script:scripts/greet.sh']);
    assert.deepEqual(kinds(ch[R15]), ['command', 'command', 'script:scripts/check.sh', 'script:scripts/ask.sh', 'script:scripts/mkconf.sh',
      'script:scripts/loglines.sh', 'challenge:scripts/backup.sh']);
    for (const c of ch.slice(13, 15)) for (const m of c.missions.filter((x) => x.kind)) {
      assert.equal(typeof m.starter, 'string', m.title);
      assert.ok(m.wrong.length >= 2, `${m.title}: at least two wrong scripts`);
      assert.ok(m.tests.length >= 2 && m.tests.every((t) => t.label), `${m.title}: labelled cases`);
      assert.equal(typeof m.hint, 'string', m.title);
    }
  });
  it('the case tables', () => {
    const t = (m) => m.tests.map((x) => [x.args || [], x.stdin, x.expectOut, x.expectCode, x.expectErrMatch]);
    assert.deepEqual(JSON.parse(JSON.stringify(t(ch[F14].missions[6]))), [[['Ada'], null, 'Hello, Ada!', null, null], [[], null, '', 1, 'usage'], [['Ada Lovelace'], null, 'Hello, Ada Lovelace!', null, null]]);
    const r = ch[R15].missions;
    const J = (x) => JSON.parse(JSON.stringify(x));
    assert.deepEqual(J(r[2].tests.map((x) => [x.args, x.expectCode])), [[['journal.txt'], 0], [['ghost'], 1], [['village'], 1]]);
    assert.equal(r[2].tests[2].expectErrMatch, 'village', 'a folder is not a file');
    assert.deepEqual(J(r[3].tests.map((x) => [x.stdin, x.expectOut])), [['Ada\n', 'Hello, Ada!'], ['Grace\n', 'Hello, Grace!']]);
    assert.deepEqual(J(r[4].tests.map((x) => x.expectFiles)), [{ 'app.conf': 'name=quest\nmode=fast' }, { 'app.conf': 'name=quest\nmode=fast' }]);
    assert.deepEqual(J(r[4].tests[1].files), { 'app.conf': 'name=quest\nmode=fast' }, 'the second case starts from a finished first run');
    const bk = r[6].tests;
    assert.deepEqual(J(bk.map((x) => [x.args, x.expectOut, x.expectCode || 0])), [
      [['docs'], 'backed up 3 files', 0], [['drafts'], 'backed up 0 files', 0], [['nowhere'], '', 1], [[], '', 1],
      [['docs'], 'backed up 3 files', 0], [['trip'], 'backed up 2 files', 0]]);
    assert.equal(bk[2].expectErrMatch, 'usage');
    assert.ok(Object.keys(bk[5].expectFiles).every((p) => p.includes(' ')), 'names with spaces');
    assert.ok(Object.keys(bk[4].files).some((p) => p.startsWith('backup/')), 'second run: backup/ already holds an old copy');
  });
  it('15.6 cases: the counts are the real line counts of the files, sorted by name', () => {
    const S2 = loadShell();
    const m = S2.content.chapters[R15].missions[5];
    S2.setupChapter(S2.content.chapters[R15]);
    for (const tc of m.tests) {
      const files = {};
      const logs = S2.getNode(S2.norm('~/logs')).children;
      for (const k of Object.keys(logs)) files['logs/' + k] = logs[k].content;
      Object.assign(files, tc.files || {});
      const want = Object.keys(files).filter((p) => p.endsWith('.log')).sort().map((p) => `${p.slice(5)}: ${files[p].split('\n').length}`).join('\n');
      assert.equal(tc.expectOut, want, tc.label);
    }
  });
  it('no explanation teaches an unquoted variable inside a test, or an unsupported construct', () => {
    for (const c of ch.slice(13, 15)) for (const m of c.missions) {
      const text = [m.goal, m.explain, m.note || '', m.hint || '', m.answer, m.starter || ''].join(' ').replace(/<[^>]+>/g, '');
      assert.doesNotMatch(text, /\[\s+\$\w/, `${m.title}: quote variables in [ ]`);
      assert.doesNotMatch(text, /IFS=|set --|BASH_REMATCH|local -r/, `${m.title}: unsupported here`);
    }
    for (const g of SQ.content.guide.filter((g) => g.ch === 13 || g.ch === 14)) for (const [e] of g.ex) {
      assert.doesNotMatch(e, /\[\s+\$\w/, `guide ${g.c}: ${e}`);
      assert.doesNotMatch(e, /IFS=|set --/, `guide ${g.c}: ${e}`);
    }
  });
});

describe('advanced chapters 14 and 15: world seeding', () => {
  it('chapter 15 seeds lib/strings.sh, logs/, docs/ and an empty drafts/; chapter 14 does not; setup twice changes nothing', () => {
    const S1 = loadShell();
    S1.setupChapter(S1.content.chapters[F14]);
    assert.ok(!S1.ctxFor('').has('~/lib/strings.sh') && !S1.ctxFor('').has('~/docs'));
    const SQ = loadShell();
    for (const ci of ALL_ADV) SQ.setupChapter(SQ.content.chapters[ci]);
    const c = SQ.ctxFor('');
    assert.match(c.read('~/lib/strings.sh'), /shout\(\) \{ echo "\$1" \| tr a-z A-Z; \}/);
    const kids = (p) => Object.keys(c.node(p).children).sort();
    assert.deepEqual(kids('~/docs').filter((k) => k.endsWith('.txt')).length, 3);
    assert.deepEqual(kids('~/docs').filter((k) => k.endsWith('.md')).length, 1);
    assert.equal(kids('~/docs').length, 4);
    assert.ok(kids('~/logs').filter((k) => k.endsWith('.log')).length >= 3);
    assert.ok(kids('~/logs').some((k) => !k.endsWith('.log')), 'a file that is not a log');
    assert.deepEqual(kids('~/drafts'), []);
    assert.ok(!c.has('~/backup'), 'backup/ is the script\'s job');
    assert.equal(c.read('~/village/people.txt'), SQ.PEOPLE, 'people.txt untouched');
    const snap = JSON.stringify(SQ.S.fs);
    for (const ci of ALL_ADV) SQ.setupChapter(SQ.content.chapters[ci]);
    assert.equal(JSON.stringify(SQ.S.fs), snap, 'second setup changes nothing');
  });
  it('never clobbers learner files', () => {
    const SQ = loadShell();
    SQ.setupChapter(SQ.content.chapters[R15]);
    for (const l of ['echo mine > lib/strings.sh', 'echo mine > docs/todo.txt', 'echo mine > logs/app.log', 'echo mine > scripts/backup.sh', 'echo mine > scripts/greet.sh'])
      run(SQ, l);
    SQ.setupChapter(SQ.content.chapters[R15]);
    SQ.setupChapter(SQ.content.chapters[F14]);
    const c = SQ.ctxFor('');
    for (const p of ['~/lib/strings.sh', '~/docs/todo.txt', '~/logs/app.log', '~/scripts/backup.sh', '~/scripts/greet.sh']) assert.equal(c.read(p), 'mine', p);
  });
  it('jump-in safe: each answer works in a fresh world with only its own chapter set up', () => {
    for (const ci of [F14, R15]) {
      const SQ = loadShell();
      const ch = SQ.content.chapters[ci];
      SQ.setupChapter(ch);
      for (const m of ch.missions) assertSolvable(SQ, ch, m);
    }
  });
  it('jump-in safe after the chapter files were deleted: setup puts them back', () => {
    const SQ = loadShell();
    SQ.setupChapter(SQ.content.chapters[R15]);
    run(SQ, 'rm -r journal.txt scripts lib logs docs drafts');
    const ch = SQ.content.chapters[R15];
    SQ.setupChapter(ch);
    for (const m of ch.missions) assertSolvable(SQ, ch, m);
  });
});

describe('chapter 14 (Functions & arguments) checks', () => {
  it('14.1 Define and call', () => {
    yes(F14, 0, 'greet() { echo "Hello, $1!"; }; greet Ada');
    yes(F14, 0, 'function greet { echo "Hello, $1!"; }; greet Ada');
    yes(F14, 0, 'hi() { echo "Hello, $1!"; }; hi "Ada"');
    yes(F14, 0, 'greet() { echo "Hello, $1!"; }', 'greet Ada');
    no(F14, 0, 'echo "Hello, Ada!"');
    no(F14, 0, 'greet() { echo "Hello, $1!"; }');
    no(F14, 0, 'greet() { echo "Hello, $1!"; }; echo "Hello, Ada!"');
    no(F14, 0, 'greet() { echo "Hello, Ada!"; }; greet Ada');
    no(F14, 0, 'greet() { echo "Hello, $1!"; }; greet Bob');
    no(F14, 0, 'greet() { echo "Hello, $1!"; }; echo greet; greet Ada');
  });
  it('14.2 Count the arguments', () => {
    yes(F14, 1, 'count() { echo $#; }; count a b c');
    yes(F14, 1, 'count() { echo "$#"; }; count x y z');
    yes(F14, 1, 'n() { echo "$#"; }; n "a b" c d');
    no(F14, 1, 'echo 3');
    no(F14, 1, 'count() { echo 3; }; count a b c');
    no(F14, 1, 'count() { echo $#; }; count a b');
    no(F14, 1, 'count() { echo $#; }; echo 3');
  });
  it('14.3 All the arguments', () => {
    yes(F14, 2, 'show() { for a in "$@"; do echo "- $a"; done; }; show x y');
    yes(F14, 2, 'show() { for a; do echo "- $a"; done; }; show x y');
    yes(F14, 2, 'list() { for w in "$@"; do echo "- $w"; done; }; list "x" "y"');
    no(F14, 2, 'echo "- x"; echo "- y"');
    no(F14, 2, 'for a in x y; do echo "- $a"; done');
    no(F14, 2, 'show() { echo "- x"; echo "- y"; }; show x y');
    no(F14, 2, 'show() { for a in "$1"; do echo "- $a"; done; }; show x y');
  });
  it('14.4 Return a status', () => {
    yes(F14, 3, 'is_big() { [ "$1" -gt 10 ]; }; is_big 20 && echo big');
    yes(F14, 3, 'is_big() { [ $1 -gt 10 ]; }; is_big 20 && echo big');
    yes(F14, 3, 'big() { if [ "$1" -gt 10 ]; then return 0; else return 1; fi; }; if big 50; then echo big; fi');
    yes(F14, 3, 'is_big() { (( $1 > 10 )); }; is_big 20 && echo big');
    no(F14, 3, 'echo big');
    no(F14, 3, 'is_big() { [ "$1" -gt 10 ]; }; echo big');
    no(F14, 3, 'is_big() { [ "$1" -gt 10 ]; }; is_big 20; echo big');
    no(F14, 3, 'is_big() { return 0; }; is_big 20 && echo big');
    no(F14, 3, 'is_big() { [ "$1" -gt 10 ]; }; is_big 5 || echo big');
    no(F14, 3, '[ 20 -gt 10 ] && echo big');
  });
  it('14.5 Keep it local', () => {
    yes(F14, 4, 'f() { local x=2; echo $x; }; x=1; f; echo $x');
    yes(F14, 4, 'f() { local x=2; echo "$x"; }; x=1; f; echo "$x"');
    yes(F14, 4, 'g() { local n; n=2; echo "$n"; }; n=1; g; echo "$n"');
    yes(F14, 4, 'x=1', 'f() { local x=2; echo "$x"; }; f; echo "$x"');
    no(F14, 4, 'echo 2; echo 1');
    no(F14, 4, 'f() { x=2; echo "$x"; }; x=1; f; echo "$x"');
    no(F14, 4, 'f() { local x=2; echo "$x"; }; f; echo 1');
    no(F14, 4, 'f() { local x=2; }; echo 2; x=1; echo "$x"');
  });
  it('14.6 Default values', () => {
    yes(F14, 5, 'echo ${NAME:-stranger}');
    yes(F14, 5, 'echo "${NAME:-stranger}"');
    yes(F14, 5, 'NAME=Ada', 'echo "${NAME:-stranger}"');
    yes(F14, 5, 'echo "${WHO:-friend}"');
    no(F14, 5, 'echo stranger');
    no(F14, 5, 'echo ${NAME:-}stranger');
    no(F14, 5, 'echo ${NAME-stranger} ${X:-y}');
    no(F14, 5, 'NAME=Ada', 'echo "${NAME:-stranger}"; echo stranger');
    no(F14, 5, 'echo "${NAME:-stranger}" stranger');
  });
  it('14.7 Script: greeter (answer, alternatives, wrong ones, failure lines)', () => {
    const { m, ok, why } = scriptJudge(F14, 6);
    assert.equal(ok(m.answer), true);
    assert.equal(ok('#!/bin/bash\nif [ "$#" -eq 0 ]; then\n  echo "usage: greet.sh NAME" 1>&2\n  exit 1\nfi\necho "Hello, $1!"\n'), true, '$# test, 1>&2');
    assert.equal(ok('#!/bin/bash\n[ -n "$1" ] || { echo "usage: greet.sh NAME" >&2; exit 1; }\necho "Hello, $1!"\n'), true, 'one-line guard');
    assert.equal(ok('#!/bin/bash\ngreet() { echo "Hello, $1!"; }\n[ -z "$1" ] && { echo "usage: greet.sh NAME" >&2; exit 1; }\ngreet "$1"\n'), true, 'with a function');
    assert.equal(ok(m.starter), false);
    for (const w of m.wrong) assert.equal(ok(w), false, w);
    assert.equal(ok('#!/bin/bash\nif [ -z "$1" ]; then\n  echo "usage: greet.sh NAME"\n  exit 1\nfi\necho "Hello, $1!"\n'), false, 'usage on stdout');
    assert.equal(ok('#!/bin/bash\nif [ -z "$1" ]; then\n  echo "usage: greet.sh NAME" >&2\nfi\necho "Hello, $1!"\n'), false, 'always exits 0');
    assert.equal(ok('#!/bin/bash\n[ -z "$1" ] && { echo "usage: greet.sh NAME" >&2; exit 1; }\nfor w in $@; do echo "Hello, $w!"; done\n'), false, 'ignores the quotes');
    assert.equal(why('#!/bin/bash\nif [ -z "$1" ]; then\n  echo "usage: greet.sh NAME"\n  exit 1\nfi\necho "Hello, $1!"\n'),
      'Test 2 (no name) failed: expected "", got "usage: greet.sh NAME"');
    assert.equal(why('#!/bin/bash\nif [ -z "$1" ]; then\n  echo "usage: greet.sh NAME" >&2\nfi\necho "Hello, $1!"\n'),
      'Test 2 (no name) failed: expected "", got "Hello, !"');
  });
});

describe('chapter 15 (Real scripts) checks', () => {
  it('15.1 Read from a string', () => {
    yes(R15, 0, 'read first rest <<< "alpha beta gamma"; echo $rest');
    yes(R15, 0, 'read first rest <<< "alpha beta gamma"; echo "$rest"');
    yes(R15, 0, 'read -r a b <<< "alpha beta gamma"; echo "$b"');
    no(R15, 0, 'echo beta gamma');
    no(R15, 0, 'read first rest <<< "alpha beta gamma"; echo beta gamma');
    no(R15, 0, 'read first rest <<< "alpha beta gamma"; echo "$first"');
    no(R15, 0, 'echo "alpha beta gamma" | cut -d" " -f2-');
    no(R15, 0, 'read line <<< "beta gamma"; echo "$line"');
  });
  it('15.2 Share a library', () => {
    yes(R15, 1, 'source lib/strings.sh; shout hello');
    yes(R15, 1, '. lib/strings.sh; shout hello');
    yes(R15, 1, 'source ~/lib/strings.sh; shout "hello"');
    yes(R15, 1, 'source lib/strings.sh', 'shout hello');
    no(R15, 1, 'echo HELLO');
    no(R15, 1, 'source lib/strings.sh; echo HELLO');
    no(R15, 1, 'echo hello | tr a-z A-Z');
    no(R15, 1, 'shout() { echo HELLO; }; shout hello');
    no(R15, 1, 'source lib/strings.sh; shout bye');
    no(R15, 1, 'bash lib/strings.sh; shout hello');
  });
  it('15.3 Script: exit codes', () => {
    const { m, ok, why } = scriptJudge(R15, 2);
    assert.equal(ok(m.answer), true);
    assert.equal(ok('#!/bin/bash\n[ -f "$1" ] && exit 0\necho "not a file: $1" >&2\nexit 1\n'), true, 'one-line test');
    assert.equal(ok('#!/bin/bash\nif test -f "$1"; then\n  exit 0\nelse\n  echo "missing: $1" 1>&2\n  exit 1\nfi\n'), true, 'test and else');
    assert.equal(ok(m.starter), false);
    for (const w of m.wrong) assert.equal(ok(w), false, w);
    assert.equal(ok('#!/bin/bash\n[ -f "$1" ] || echo "not a file: $1" >&2\nexit 0\n'), false, 'always exits 0');
    assert.equal(ok('#!/bin/bash\n[ -f "$1" ] && exit 0\nexit 1\n'), false, 'no message');
    assert.equal(why('#!/bin/bash\n[ -f "$1" ] || echo "not a file: $1" >&2\nexit 0\n'), 'Test 2 (a missing file) failed: expected "exit status 1", got "exit status 0 (not a file: ghost)"');
    // [ -e ] also says yes to a folder: the third case (village) catches it
    const withE = m.answer.replace('[ -f "$1" ]', '[ -e "$1" ]');
    assert.notEqual(withE, m.answer);
    assert.equal(ok(withE), false, '[ -e ] accepts a folder');
    assert.ok(m.wrong.includes(withE));
    assert.equal(why(withE), 'Test 3 (a folder, not a file) failed: expected "/village/", got ""');
  });
  it('15.4 Script: ask a question', () => {
    const { m, ok } = scriptJudge(R15, 3);
    assert.equal(ok(m.answer), true);
    assert.equal(ok('#!/bin/bash\nread -r who\necho "Hello, $who!"\n'), true, 'read -r');
    assert.equal(ok('#!/bin/bash\nread name\nprintf "Hello, %s!\\n" "$name"\n'), true, 'printf');
    assert.equal(ok(m.starter), false);
    for (const w of m.wrong) assert.equal(ok(w), false, w);
    assert.equal(ok('#!/bin/bash\necho "Hello, $1!"\n'), false, 'argument, not stdin');
    assert.equal(ok('#!/bin/bash\necho "Hello, Ada!"\n'), false, 'hardcoded');
  });
  it('15.5 Script: write a config', () => {
    const { SQ, m, ok, why } = scriptJudge(R15, 4);
    assert.equal(ok(m.answer), true);
    assert.equal(ok("#!/bin/bash\ncat <<'END' > app.conf\nname=quest\nmode=fast\nEND\n"), true, 'quoted delimiter, redirect after');
    assert.equal(ok('#!/bin/bash\ncat > app.conf <<EOF\nname=quest\nmode=fast\nEOF\nexit 0\n'), true);
    assert.equal(ok(m.starter), false);
    for (const w of m.wrong) assert.equal(ok(w), false, w);
    assert.equal(ok('#!/bin/bash\ncat >> app.conf <<EOF\nname=quest\nmode=fast\nEOF\n'), false, 'appends: the second run doubles the file');
    assert.equal(ok('#!/bin/bash\ncat > app.conf <<-EOF\n\tname=quest\n\tmode=fast\n\tEOF\n'), true, '<<- with tabs');
    assert.equal(ok('#!/bin/bash\ncat > app.conf << "END"\nname=quest\nmode=fast\nEND\n'), true, 'quoted delimiter after a space');
    const echoes = '#!/bin/bash\n# cat > app.conf <<EOF would be nicer\necho name=quest > app.conf\necho mode=fast >> app.conf\n';
    assert.equal(ok(echoes), false, 'no here-document (a comment does not count)');
    assert.equal(ok('#!/bin/bash\nprintf "name=quest\\nmode=fast\\n" > app.conf\n'), false, 'printf, no here-document');
    assert.equal(ok("#!/bin/bash\nprintf 'name=quest\\nmode=fast\\n' > app.conf # <<EOF\n"), false, 'a here-document only in a trailing comment');
    assert.equal(ok('#!/bin/bash\ncat > app.conf <<EOF # the two settings\nname=quest\nmode=fast\nEOF\n'), true, 'a comment after a real here-document');
    assert.equal(ok("#!/bin/bash\ncat <<'EOF' >app.conf\nname=quest\nmode=fast\nEOF\n"), true, 'quoted delimiter, no space before the file');
    put(SQ, m, echoes);
    const v = SQ.missionVerdict(m, SQ.ctxFor(''), true);
    assert.equal(v.good, false);
    assert.match(SQ.scriptFailLine(m, v.failed), /here-document: cat > app\.conf <<EOF/);
    assert.ok(why('#!/bin/bash\ncat >> app.conf <<EOF\nname=quest\nmode=fast\nEOF\n')
      .startsWith('Test 2 (running it a second time) failed: expected "name=quest\\nmode=fast", got "name=quest\\nmode=fast\\nname=quest'));
    // the real run: the answer writes the file the goal describes, and a second run leaves it the same
    put(SQ, m, m.answer);
    run(SQ, 'bash scripts/mkconf.sh');
    assert.equal(SQ.ctxFor('').read('~/app.conf'), 'name=quest\nmode=fast');
    run(SQ, 'bash scripts/mkconf.sh');
    assert.equal(run(SQ, 'cat app.conf').out, 'name=quest\nmode=fast');
  });
  it('15.6 Script: count lines', () => {
    const { SQ, m, ok } = scriptJudge(R15, 5);
    assert.equal(ok(m.answer), true);
    assert.equal(ok('#!/bin/bash\nfor f in logs/*.log; do\n  echo "${f##*/}: $(cat "$f" | wc -l)"\ndone\n'), true, '${f##*/} and cat | wc');
    assert.equal(ok('#!/bin/bash\ncd logs\nfor f in *.log; do\n  n=0\n  while read line; do n=$((n + 1)); done < "$f"\n  echo "$f: $n"\ndone\n'), true, 'cd and a read loop');
    assert.equal(ok(m.starter), false);
    for (const w of m.wrong) assert.equal(ok(w), false, w);
    assert.equal(ok('#!/bin/bash\nwc -l logs/*.log\n'), false, 'wc on its own');
    assert.equal(ok('#!/bin/bash\nfor f in logs/*; do echo "$(basename "$f"): $(wc -l < "$f")"; done\n'), false, 'counts the .txt too');
    assert.equal(ok('#!/bin/bash\nfor f in logs/*.log; do echo "$f: $(wc -l < "$f")"; done\n'), false, 'the path, not the name');
    assert.equal(ok('#!/bin/bash\nfor f in logs/*.log; do echo "$(basename "$f"): $(wc -w < "$f")"; done\n'), false, 'words, not lines');
    put(SQ, m, m.answer);
    assert.equal(run(SQ, 'bash scripts/loglines.sh').out, m.tests[0].expectOut, 'the seeded logs, through the terminal');
  });
  it('15.7 Capstone: backup script', () => {
    const { SQ, m, ok, why } = scriptJudge(R15, 6);
    assert.equal(typeof m.check, 'function');
    assert.equal(ok(m.answer), true);
    const alt = '#!/bin/bash\n[ -d "$1" ] || { echo "usage: backup.sh DIR" >&2; exit 1; }\nmkdir -p backup\ncount=0\nfor f in "$1"/*.txt; do\n  if [ -f "$f" ]; then cp "$f" backup/; count=$((count+1)); fi\ndone\necho "backed up $count files"\n';
    assert.equal(ok(alt), true, 'guard with ||, [ -f ] in the loop');
    assert.equal(ok(m.starter), false);
    for (const w of m.wrong) assert.equal(ok(w), false, w);
    const noMkdir = m.answer.replace('mkdir -p backup\n', '');
    assert.notEqual(noMkdir, m.answer);
    assert.equal(ok(noMkdir), false, 'does not create backup/');
    assert.equal(ok(m.answer.replace('"$1"/*.txt', '"$1"/*')), false, 'copies the .md file too');
    assert.equal(ok(m.answer.replace('exit 1', 'exit 0')), false, 'always exits 0');
    assert.equal(ok(m.answer.replace('for f in "$1"/*.txt', 'for f in $(ls "$1"/*.txt)')), false, 'looping over $(ls): names with spaces break');
    assert.equal(ok(m.answer.replace('  [ -e "$f" ] || continue\n', '')), false, 'an empty folder counts 1');
    assert.equal(ok(m.answer.replace('cp "$f" backup/', 'mv "$f" backup/')), false, 'mv empties docs/');
    assert.equal(ok(m.answer.replace('cp "$f" backup/', 'cp -- "$f" backup/')), true, 'cp --');
    assert.equal(ok(m.answer.replace('cp "$f" backup/', 'cp "$f" "backup/$(basename "$f")"')), true, 'cp to a full name');
    assert.equal(ok('#!/bin/bash\nif [ ! -d "$1" ]; then\n  echo "usage: backup.sh DIR" 1>&2\n  exit 1\nfi\n[ -d backup ] || mkdir backup\nn=0\nfor f in "$1"/*.txt; do\n  [ -f "$f" ] && cp "$f" backup/ && n=$((n+1))\ndone\necho "backed up $n files"\n'), true, 'mkdir without -p, && chain');
    assert.equal(ok('#!/bin/bash\nmkdir -p backup\ncp "$1"/*.txt backup/\necho "backed up 3 files"\n'), false, 'hardcoded count');
    // backup/ left over from an earlier run (Beginner mission 6.7 also makes one) does not hide a script that never creates it
    run(SQ, 'mkdir -p backup');
    assert.equal(ok(noMkdir), false, 'leftover backup/ in the world');
    // nor do learner edits to docs/ and drafts/ break the answer
    run(SQ, 'echo extra > docs/extra.txt; echo x > drafts/x.txt; rm docs/todo.txt');
    assert.equal(ok(m.answer), true, 'the check runs on the seeded docs/ and an empty drafts/');
    // the Save & run explanation judges the same clean world as the check, so it names the failing case
    put(SQ, m, noMkdir);
    const v = SQ.missionVerdict(m, SQ.ctxFor(''), true);
    assert.equal(v.good, false);
    assert.ok(v.failed, 'a failure line, not silence');
    assert.equal(SQ.scriptFailLine(m, v.failed), 'Test 1 (docs, in a world with no backup/ yet) failed: expected "A bridge over the river.", got "(missing)"');
    put(SQ, m, m.answer);
    assert.deepEqual(JSON.parse(JSON.stringify(SQ.missionVerdict(m, SQ.ctxFor(''), true))), { good: true, failed: null });
    // through the terminal: the answer backs up the seeded docs and keeps their contents
    const S2 = loadShell();
    S2.setupChapter(S2.content.chapters[R15]);
    put(S2, m, m.answer);
    assert.equal(run(S2, 'bash scripts/backup.sh docs').out, 'backed up 3 files');
    const c = S2.ctxFor('');
    for (const k of Object.keys(c.node('~/docs').children).filter((k) => k.endsWith('.txt'))) assert.equal(c.read('~/backup/' + k), c.read('~/docs/' + k));
    assert.ok(!c.has('~/backup/' + Object.keys(c.node('~/docs').children).find((k) => k.endsWith('.md'))));
    assert.equal(run(S2, 'bash scripts/backup.sh docs').out, 'backed up 3 files', 'second run');
    const r = S2.execLine('bash scripts/backup.sh nowhere');
    assert.deepEqual([...r.out.map((o) => o.cls === 'out')], [false], 'the usage line is on stderr');
    assert.match(r.out[0].text, /usage/);
    assert.equal(S2.S.last, 1);
  });
});

describe('advanced quick-fire and guide (chapters 14 and 15)', () => {
  const SQ = loadShell();
  it('has 6 more quick-fire questions per chapter (24 advanced in all)', () => {
    assert.equal(SQ.content.quickfire.filter((q) => q[2] === 'advanced').length, 24);
  });
  it('has 6 guide entries per chapter, covering the new keywords', () => {
    for (const ci of [13, 14]) assert.ok(SQ.content.guide.filter((g) => g.ch === ci).length >= 6, `chapter ${ci}`);
    const g = SQ.content.guide.filter((g) => g.ch === 13 || g.ch === 14);
    const text = g.map((x) => x.c + ' ' + x.what).join(' ');
    for (const k of ['function', 'local', 'shift', 'source', 'exit', 'return', 'nano', '<<EOF', '<<<', '>&2']) assert.ok(text.includes(k), `guide covers ${k}`);
    const cs = g.map((x) => x.c);
    for (const k of ['local', 'shift', 'source', 'exit', 'return', 'nano']) assert.ok(cs.includes(k), `guide entry ${k}`);
  });
  it('every advanced quick-fire answer runs without an error in a world with all four chapters set up', () => {
    for (const q of SQ.content.quickfire.filter((q) => q[2] === 'advanced'))
      for (const a of q[1]) {
        const S2 = loadShell();
        for (const ci of ALL_ADV) S2.setupChapter(S2.content.chapters[ci]);
        run(S2, 'touch notes.txt; mkdir -p logs');
        const r = run(S2, a);
        assert.doesNotMatch(r.out, /bash:|not support|command not found/, `${a}: ${r.out}`);
      }
  });
  it('guide examples for chapters 14 and 15 print what they say', () => {
    for (const g of SQ.content.guide.filter((g) => g.ch === 13 || g.ch === 14))
      for (const [e, note] of g.ex) {
        const S2 = loadShell();
        for (const ci of ALL_ADV) S2.setupChapter(S2.content.chapters[ci]);
        const r = run(S2, e);
        assert.doesNotMatch(r.out, /bash:|not support|command not found/, `${g.c}: ${e}: ${r.out}`);
        if (/^prints /.test(note)) assert.equal(r.out.replace(/\n/g, ' '), note.slice(7), `${g.c}: ${e}`);
      }
  });
});
