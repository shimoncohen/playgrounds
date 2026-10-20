// Stage 3 Task 18: the Expert tier, chapters 16 (awk & sed craft) and 17 (Processes & jobs), at indexes 15 and 16.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, loadShell, run } from './harness.mjs';
import { assertSolvable } from './solvability-lib.mjs';

const A16 = 15, P17 = 16;
const EXPERT = [A16, P17];
const put = (SQ, m, text) => assert.equal(SQ.writeFile(SQ.norm(m.file, SQ.HOME), text, false, m.file), null);

// UI-style: fresh world, the chapter's setup (with starters), every line on its own log, judge the last line.
function ui(ci, mi, ...lines) {
  const SQ = loadShell();
  SQ.setupChapter(SQ.content.chapters[ci]);
  for (const l of lines) run(SQ, l);
  return SQ.content.chapters[ci].missions[mi].check(SQ.ctxFor(lines[lines.length - 1]));
}
const yes = (ci, mi, ...lines) => assert.ok(ui(ci, mi, ...lines), `should accept: ${lines.join(' / ')}`);
const no = (ci, mi, ...lines) => assert.ok(!ui(ci, mi, ...lines), `should reject: ${lines.join(' / ')}`);

// a script mission: write text to its file in a world with the chapter set up, then ask the mission's own pass rule
function scriptJudge(ci, mi) {
  const SQ = loadShell();
  const ch = SQ.content.chapters[ci], m = ch.missions[mi];
  SQ.setupChapter(ch);
  const pass = () => (m.check ? !!m.check(SQ.ctxFor('')) : SQ.ctxFor('').scriptPasses(m).ok);
  const ok = (t) => { put(SQ, m, t); return pass(); };
  const why = (t) => { put(SQ, m, t); return SQ.scriptFailLine(m, SQ.ctxFor('').scriptPasses(m).failed); };
  return { SQ, ch, m, ok, why };
}
// a world with one Expert chapter set up; run lines and give back the output and the ctx of the last one
function world(ci = A16) {
  const SQ = loadShell();
  SQ.setupChapter(SQ.content.chapters[ci]);
  const go = (line) => { const r = run(SQ, line); return { ...r, c: SQ.ctxFor(line) }; };
  return { SQ, go };
}
const sortedLines = (t) => t.split('\n').filter(Boolean).sort().join('\n');

describe('expert chapters 16 and 17: shape', () => {
  const SQ = loadShell();
  const ch = SQ.content.chapters;
  it('sit at indexes 15 and 16, tier expert, 7 missions each, 25 XP per mission', () => {
    assert.deepEqual([...ch.slice(15, 17).map((c) => c.tier)], ['expert', 'expert']);
    assert.deepEqual([...ch.slice(15, 17).map((c) => c.name)], ['awk & sed craft', 'Processes & jobs']);
    assert.deepEqual([...ch.slice(15, 17).map((c) => c.badge)], ['Text Wrangler', 'Job Controller']);
    assert.deepEqual([...ch.slice(15, 17).map((c) => c.missions.length)], [7, 7]);
    for (const i of EXPERT) {
      assert.equal(SQ.tiers.tierOf(i).id, 'expert');
      assert.equal(SQ.tiers.missionXp(i), 25);
    }
  });
  it('earlier tiers are untouched: 15 chapters before, with the same tiers, missions and XP', () => {
    assert.deepEqual([...ch.slice(0, 15).map((c) => c.tier)], [...Array(7).fill('beginner'), ...Array(4).fill('intermediate'), ...Array(4).fill('advanced')]);
    assert.deepEqual([...ch.slice(0, 15).map((c) => c.missions.length)], [8, 7, 7, 7, 7, 7, 9, 7, 8, 7, 7, 7, 7, 7, 7]);
    assert.equal(SQ.tiers.cumulativeXp('beginner'), 695);
    assert.equal(SQ.tiers.cumulativeXp('intermediate'), 1230);
    assert.equal(SQ.tiers.cumulativeXp('advanced'), 1890);
    const expected = 1890 + ch.filter((c) => c.tier === 'expert').reduce((n, c) => n + c.missions.length * 25 + 25, 0);
    assert.equal(SQ.tiers.cumulativeXp('expert'), expected);
    assert.equal(SQ.tiers.rankFor(expected).name, 'Shell Wizard');
    assert.equal(SQ.tiers.rankFor(expected - 1).name, 'Automator');
  });
  it('missions have the shared fields, no em dashes; 16.7 and 17.7 are script missions with starters, cases and wrong scripts', () => {
    for (const c of ch.slice(15, 17)) c.missions.forEach((m, i) => {
      for (const k of ['title', 'goal', 'explain', 'answer']) assert.equal(typeof m[k], 'string', `${m.title}.${k}`);
      assert.doesNotMatch(m.explain + m.goal + (m.note || '') + (m.hint || ''), /—/, 'no em dashes');
      assert.ok(Array.isArray(m.anat) && m.anat.length, `${m.title}: anat`);
      if (i < 6) assert.equal(typeof m.check, 'function', m.title);
    });
    const rep = ch[A16].missions[6], fan = ch[P17].missions[6];
    assert.deepEqual([rep.kind, rep.file, fan.kind, fan.file], ['script', 'scripts/report.sh', 'script', 'scripts/fanout.sh']);
    for (const m of [rep, fan]) {
      assert.equal(typeof m.starter, 'string');
      assert.ok(m.wrong.length >= 5);
      assert.ok(m.tests.every((t) => t.label));
    }
    assert.deepEqual([...rep.tests.map((t) => t.label)], ['the sales file', 'a one-row file', 'a file with a header row', 'a missing file']);
    assert.equal(rep.tests[3].expectErr, 'report.sh: cannot read ghost.csv');
    assert.equal(rep.tests[3].expectCode, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(fan.tests.map((t) => [t.args, t.expectOut, t.expectClock ?? null, t.expectCode ?? 0]))),
      [[['3', '1', '2'], '1 done\n2 done\n3 done', 3, 0], [[], '', null, 1], [['1'], '1 done', 1, 0], [['1', '3'], '1 done\n3 done', 3, 0]]);
    assert.equal(fan.tests[1].expectErr, 'usage: fanout.sh SECONDS...');
  });
  it('the answers are the ones the plan names', () => {
    assert.deepEqual([...ch[A16].missions.slice(0, 6).map((m) => m.answer)], [
      "awk '{print $1}' village/logs/access.log", "awk -F, '{print $1}' village/sales.csv", "awk -F, '$2 > 10 {print $1}' village/sales.csv",
      "awk -F, '{s += $2 * $3} END {print s}' village/sales.csv", "awk '{c[$4]++} END {for (k in c) print k, c[k]}' village/logs/access.log",
      "sed -i 's/debug=false/debug=true/' config.ini"]);
    assert.deepEqual([...ch[P17].missions.slice(0, 6).map((m) => m.answer)], ['ps', 'sleep 30 &', 'jobs', 'sleep 5 & wait', 'sleep 100 & kill %1', 'sleep 2 & pid=$!; wait $pid; echo "finished $pid"']);
    assert.match(ch[A16].missions[6].answer, /awk -F, '[^']*\{printf "%-8s %7\.2f\\n", \$1, \$2\*\$3\}' "\$1"/);
    assert.match(ch[P17].missions[6].answer, /\(sleep "\$n"; echo "\$n done"\) &\ndone\nwait\n/);
  });
  it('no text teaches an unquoted variable inside a test', () => {
    for (const c of ch.slice(15, 17)) for (const m of c.missions) {
      const text = [m.goal, m.explain, m.note || '', m.hint || '', m.answer, m.starter || ''].join(' ').replace(/<[^>]+>/g, '');
      assert.doesNotMatch(text, /\[\s+!?\s*\$\w/, `${m.title}: quote variables in [ ]`);
    }
    for (const g of SQ.content.guide.filter((g) => g.ch === A16 || g.ch === P17)) for (const [e] of g.ex) assert.doesNotMatch(e, /\[\s+\$\w/, `guide ${g.c}: ${e}`);
  });
});

describe('expert chapters 16 and 17: world seeding', () => {
  it('seed scripts/, village/sales.csv, village/logs/access.log and config.ini with the Intermediate data; setup twice changes nothing', () => {
    const SQ = loadShell();
    for (const ci of EXPERT) SQ.setupChapter(SQ.content.chapters[ci]);
    const c = SQ.ctxFor('');
    assert.ok(c.isDir('~/scripts'));
    assert.equal(c.read('~/village/sales.csv'), SQ.VILLAGE.SALES);
    assert.equal(c.read('~/village/logs/access.log'), SQ.VILLAGE.ACCESS);
    assert.equal(c.read('~/config.ini'), SQ.VILLAGE.CONFIG);
    assert.equal(c.read('~/scripts/report.sh'), SQ.content.chapters[A16].missions[6].starter);
    assert.equal(c.read('~/scripts/fanout.sh'), SQ.content.chapters[P17].missions[6].starter);
    const snap = JSON.stringify(SQ.S.fs);
    for (const ci of EXPERT) SQ.setupChapter(SQ.content.chapters[ci]);
    assert.equal(JSON.stringify(SQ.S.fs), snap, 'second setup changes nothing');
  });
  it('the same data as the Intermediate chapters seed (a learner coming from chapter 8 sees the same files)', () => {
    const a = loadShell(), b = loadShell();
    a.content.chapters[7].setup();
    b.setupChapter(b.content.chapters[A16]);
    for (const p of ['~/village/sales.csv', '~/village/logs/access.log', '~/config.ini']) assert.equal(b.ctxFor('').read(p), a.ctxFor('').read(p), p);
  });
  it('never clobbers learner files', () => {
    const SQ = loadShell();
    SQ.setupChapter(SQ.content.chapters[A16]);
    run(SQ, "sed -i 's/debug=false/debug=true/' config.ini");
    run(SQ, 'echo mine > scripts/report.sh');
    run(SQ, 'echo 1,2,3 > village/sales.csv');
    for (const ci of EXPERT) SQ.setupChapter(SQ.content.chapters[ci]);
    const c = SQ.ctxFor('');
    assert.match(c.read('~/config.ini'), /debug=true/);
    assert.equal(c.read('~/scripts/report.sh').trim(), 'mine');
    assert.equal(c.read('~/village/sales.csv').trim(), '1,2,3');
  });
  it('jump-in safe: each answer works in a fresh world with only its own chapter set up', () => {
    for (const ci of EXPERT) {
      const SQ = loadShell();
      const ch = SQ.content.chapters[ci];
      SQ.setupChapter(ch);
      for (const m of ch.missions) assertSolvable(SQ, ch, m);
    }
  });
  it('jump-in safe after the chapter files were deleted: setup puts them back', () => {
    for (const ci of EXPERT) {
      const SQ = loadShell();
      run(SQ, 'rm -r village scripts config.ini');
      const ch = SQ.content.chapters[ci];
      SQ.setupChapter(ch);
      for (const m of ch.missions) assertSolvable(SQ, ch, m);
    }
  });
  it('chapter 17 missions pass in order in one world (each line judged on its own), as a learner plays them', () => {
    const SQ = loadShell();
    const ch = SQ.content.chapters[P17];
    SQ.setupChapter(ch);
    for (const m of ch.missions.slice(0, 6)) {
      run(SQ, m.answer);
      assert.ok(m.check(SQ.ctxFor(m.answer)), m.title);
    }
  });
  it('the test fixture fills only the missing Expert chapters: 15 and 16 stay real', () => {
    const ctx = loadContext();
    const FAKE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/fake-expert.js');
    vm.runInContext(fs.readFileSync(FAKE, 'utf8'), ctx, { filename: FAKE });
    const ch = ctx.SQ.content.chapters;
    assert.equal(ch.length, 19);
    assert.deepEqual([...ch.slice(15, 19).map((c) => c.name)], ['awk & sed craft', 'Processes & jobs', 'Fake expert 3', 'Fake expert 4']);
  });
});

describe('chapter 16 (awk & sed craft) checks', () => {
  it('16.1 First column', () => {
    // fix round 1: awk must do the field work ($1 in its program), not act as cat
    no(A16, 0, "awk '{print}' village/logs/access.log | cut -d' ' -f1");
    no(A16, 0, "awk 1 village/logs/access.log | cut -d' ' -f1");
    yes(A16, 0, "awk '{print $1}' village/logs/access.log");
    yes(A16, 0, "awk '{ print $1 }' < village/logs/access.log");
    yes(A16, 0, "cat village/logs/access.log | awk '{print $1}'");
    yes(A16, 0, 'cd village/logs', "awk '{print $1}' access.log");
    no(A16, 0, "cut -d' ' -f1 village/logs/access.log");
    no(A16, 0, "awk '{print $2}' village/logs/access.log");
    no(A16, 0, "awk '{print $1}' village/logs/access.log | head -n 3");
    no(A16, 0, "awk '{print $1}' village/sales.csv");
    no(A16, 0, 'echo 10.0.0.5');
  });
  it('16.2 Pick a separator', () => {
    no(A16, 1, "awk -F, '{print}' village/sales.csv | cut -d, -f1");
    no(A16, 1, "awk -F x '{print}' village/sales.csv | cut -d, -f1");
    yes(A16, 1, "awk -v FS=, '{print $1}' village/sales.csv");
    yes(A16, 1, "awk -F, '{print $1}' village/sales.csv");
    yes(A16, 1, "awk -F ',' '{print $1}' village/sales.csv");
    yes(A16, 1, "awk -F',' '{ print $1 }' < village/sales.csv");
    yes(A16, 1, "awk 'BEGIN {FS=\",\"} {print $1}' village/sales.csv");
    no(A16, 1, 'cut -d, -f1 village/sales.csv');
    no(A16, 1, "awk '{print $1}' village/sales.csv");
    no(A16, 1, "awk -F, '{print $2}' village/sales.csv");
    no(A16, 1, "awk -F, '{print $1}' village/sales.csv | sort");
  });
  it('16.3 Filter rows', () => {
    yes(A16, 2, "awk -F, '$2 > 10 {print $1}' village/sales.csv");
    yes(A16, 2, "awk -F, '$2 > 10 { print $1 }' village/sales.csv");
    yes(A16, 2, "awk -F, '$2 >= 11 {print $1}' village/sales.csv");
    yes(A16, 2, "awk -F, -v min=10 '$2 > min {print $1}' village/sales.csv");
    no(A16, 2, "awk -F, '{print $1}' village/sales.csv | head -n 2");
    no(A16, 2, "awk -F, 'NR <= 2 {print $1}' village/sales.csv");
    no(A16, 2, "awk -F, '{if ($2 > 10) print $1}' village/sales.csv"); // the lesson is the pattern
    no(A16, 2, "awk -F, '$2 > 10' village/sales.csv");
    no(A16, 2, "awk -F, '$3 > 10 {print $1}' village/sales.csv");
    no(A16, 2, 'echo apple; echo bread');
  });
  it('16.4 Add it up', () => {
    // fix round 1: the requirements hold across every awk of the line, and the total must not be typed in
    yes(A16, 3, "awk -F, '{print $2*$3}' village/sales.csv | awk '{s+=$1} END {print s}'");
    no(A16, 3, "awk -F, '{x=$2;y=$3} END {print 274}' village/sales.csv");
    no(A16, 3, "awk -F, '{print $2, $3}' village/sales.csv | awk 'END {print 274}'");
    no(A16, 3, "awk -F, '{print $2*$3}' village/sales.csv | awk '{s+=$1} {print s}'");
    yes(A16, 3, "awk -F, '{s += $2 * $3} END {print s}' village/sales.csv");
    yes(A16, 3, "awk -F, '{s += $3 * $2} END {print s}' village/sales.csv");
    yes(A16, 3, "awk -F, 'BEGIN {s = 0} {s = s + $2 * $3} END {printf \"%d\\n\", s}' village/sales.csv");
    yes(A16, 3, "cat village/sales.csv | awk -F, '{t += $2*$3} END {print t}'");
    no(A16, 3, 'echo 274');
    no(A16, 3, "awk -F, '{s += $2 * $3; print s}' village/sales.csv");
    no(A16, 3, "awk -F, '{s += $2} END {print s}' village/sales.csv");
    no(A16, 3, "awk 'END {print 274}' village/sales.csv");
  });
  it('16.5 Count with an array (any order)', () => {
    // fix round 1: a dummy array with the counts typed in fails; a for-in over the array is required
    no(A16, 4, "awk '{x[1]=1} END {print \"200 7\"; print \"404 3\"; print \"500 2\"}' village/logs/access.log");
    no(A16, 4, "awk '{c[$4]++} END {print \"200\", c[200]; print \"404\", c[404]; print \"500\", c[500]}' village/logs/access.log");
    yes(A16, 4, "awk '{c[$4]++} END {for (k in c) print k \" \" c[k]}' village/logs/access.log");
    yes(A16, 4, "awk '{c[$4]++} END {for (k in c) print k, c[k]}' village/logs/access.log");
    yes(A16, 4, "awk '{c[$4]++} END {for (k in c) print k, c[k]}' village/logs/access.log | sort -r");
    yes(A16, 4, "awk '{n[$NF]++} END {for (s in n) print s, n[s]}' village/logs/access.log");
    yes(A16, 4, "awk '{ c[$4] += 1 } END { for (k in c) { print k, c[k] } }' village/logs/access.log");
    no(A16, 4, "awk '{print $4}' village/logs/access.log | sort | uniq -c");
    no(A16, 4, "awk '{print $4}' village/logs/access.log | sort | uniq -c | awk '{print $2, $1}'");
    no(A16, 4, "awk '{c[$4]++} END {for (k in c) print k}' village/logs/access.log");
    no(A16, 4, "awk '{c[$1]++} END {for (k in c) print k, c[k]}' village/logs/access.log");
    no(A16, 4, 'echo 200 7; echo 404 3; echo 500 2');
  });
  it('16.5 the expected counts are the real ones: 200 7, 404 3, 500 2', () => {
    const { go } = world();
    assert.equal(sortedLines(go("awk '{c[$4]++} END {for (k in c) print k, c[k]}' village/logs/access.log").out), '200 7\n404 3\n500 2');
  });
  it('16.6 Edit in place', () => {
    yes(A16, 5, "sed -i 's/debug=false/debug=true/' config.ini");
    yes(A16, 5, "sed -i 's/=false/=true/' config.ini");
    yes(A16, 5, "sed -i 's/false/true/' config.ini");
    yes(A16, 5, "sed -i -e 's/debug=false/debug=true/' config.ini");
    yes(A16, 5, "sed -i '/^debug/s/false/true/' config.ini");
    yes(A16, 5, "sed -i.bak 's/debug=false/debug=true/' config.ini");
    no(A16, 5, "sed 's/debug=false/debug=true/' config.ini");
    no(A16, 5, "sed -i 's/debug/debug=true/' config.ini");
    no(A16, 5, "sed -i '/debug/d' config.ini");
    no(A16, 5, 'echo debug=true > config.ini');
    no(A16, 5, "sed -i 's/debug=false/debug=true/g; s/8080/9090/' config.ini");
    // leftovers: once debug is on, a later sed -i that does not turn it on does not count, nor does reading the file
    no(A16, 5, "sed -i 's/debug=false/debug=true/' config.ini", "sed -i 's/x/y/' config.ini");
    no(A16, 5, "sed -i 's/debug=false/debug=true/' config.ini", 'cat config.ini');
  });
  it('16.6 every other line stays as it was', () => {
    const { SQ, go } = world();
    go("sed -i 's/debug=false/debug=true/' config.ini");
    assert.equal(SQ.ctxFor('').read('~/config.ini'), '[village]\nname=Oakford\nport=8080\ndebug=true\n\n[shop]\nopen=09:00\nclose=18:00');
  });
  it('16.7 Script: report (answer, alternatives, wrong ones, failure lines)', () => {
    const { SQ, m, ok, why } = scriptJudge(A16, 6);
    assert.equal(ok(m.answer), true);
    assert.equal(ok('#!/bin/bash\n[ -r "$1" ] || { echo "report.sh: cannot read $1" >&2; exit 1; }\nawk -F, \'NR > 1 || $2 ~ /^[0-9]/ {printf "%-8s %7.2f\\n", $1, $2 * $3}\' "$1"\n'), true, 'NR > 1 || a number on line 1');
    assert.equal(ok('#!/bin/bash\nif [ ! -f "$1" ]; then\n  echo "report.sh: cannot read $1" 1>&2\n  exit 1\nfi\nawk -F, \'$2 ~ /^[0-9]/ {printf "%-8s %7.2f\\n", $1, $2*$3}\' < "$1"\n'), true, '-f, every row with a number, stdin');
    assert.equal(ok(m.starter), false);
    for (const w of m.wrong) assert.equal(ok(w), false, w);
    assert.equal(ok("#!/bin/bash\nprintf 'apple      24.00\\nbread      90.00\\nrope       48.00\\ntorch      72.00\\nmap        40.00\\n'\n"), false, 'hardcoded');
    assert.equal(ok(m.answer.replace("NR == 1 && $2 !~ /^[0-9]/ {next} ", 'NR > 1 ')), false, 'NR > 1 drops the first row');
    assert.ok(why(m.answer.replace("NR == 1 && $2 !~ /^[0-9]/ {next} ", 'NR > 1 ')).startsWith('Test 1 (the sales file) failed: expected "apple      24.00\\nbread'));
    assert.ok(why(m.answer.replace("NR == 1 && $2 !~ /^[0-9]/ {next} ", '')).startsWith('Test 3 (a file with a header row) failed: expected "lamp       15.00\\noil        12.50", got "name        0.00'));
    assert.equal(why(m.answer.replace(' >&2', '')), 'Test 4 (a missing file) failed: expected "", got "report.sh: cannot read ghost.csv"');
    // through the terminal
    put(SQ, m, m.answer);
    assert.equal(run(SQ, 'bash scripts/report.sh village/sales.csv').out, m.tests[0].expectOut);
    const r = SQ.execLine('bash scripts/report.sh nowhere.csv');
    assert.deepEqual([...r.out.map((o) => o.cls === 'out')], [false], 'the message is on stderr');
    assert.equal(r.out[0].text.replace(/\n$/, ''), 'report.sh: cannot read nowhere.csv');
    assert.equal(SQ.S.last, 1);
  });
});

describe('chapter 17 (Processes & jobs) checks', () => {
  it('17.1 See the processes', () => {
    yes(P17, 0, 'ps');
    yes(P17, 0, 'ps -e');
    yes(P17, 0, 'ps | cat');
    yes(P17, 0, 'sleep 30 & ps');
    no(P17, 0, 'echo "  PID TTY          TIME CMD"; echo " 1234 pts/0    00:00:00 bash"');
    no(P17, 0, 'jobs');
    no(P17, 0, 'ps | grep sleep');
  });
  it('17.2 Run in the background', () => {
    yes(P17, 1, 'sleep 30 &');
    yes(P17, 1, 'sleep 60 &');
    yes(P17, 1, '(sleep 30) &');
    yes(P17, 1, 'sleep 30 & echo started');
    yes(P17, 1, 'ps', 'sleep 30 &');
    no(P17, 1, 'sleep 30');
    no(P17, 1, 'echo "[1] 1235"');
    no(P17, 1, 'echo "[1] 1235" >&2');
    no(P17, 1, "bash -c 'sleep 30 &'");
    no(P17, 1, 'sleep 30 & sleep 40 &');
    no(P17, 1, 'sleep 30 & kill %1');
    no(P17, 1, 'sleep 30 &', 'jobs');
  });
  it('17.2 the notice reads [1] 1235 in a fresh world and goes to stderr', () => {
    const { go } = world(P17);
    const r = go('sleep 30 &');
    assert.equal(r.out, '[1] 1235');
    assert.equal(r.c.err(), '[1] 1235');
    assert.equal(r.c.out(), '');
  });
  it('17.3 List the jobs (the job from 17.2, or both on one line for a jump-in)', () => {
    // fix round 1: the (sleep 30) & job that 17.2 accepts is listed as Running (sleep 30) &
    yes(P17, 2, '(sleep 30) &', 'jobs');
    yes(P17, 2, '{ sleep 30; } &', 'jobs');
    no(P17, 2, '(echo hi) &', 'jobs');
    yes(P17, 2, 'sleep 30 &', 'jobs');
    yes(P17, 2, 'sleep 30 & jobs');
    yes(P17, 2, 'sleep 30 &', 'jobs -l');
    yes(P17, 2, 'sleep 30 &', 'echo a', 'jobs');
    no(P17, 2, 'jobs');
    no(P17, 2, 'echo "[1]+  Running                 sleep 30 &"');
    no(P17, 2, 'sleep 30 &', 'ps');
    no(P17, 2, 'sleep 1 &', 'echo a', 'echo b', 'jobs');
    no(P17, 2, 'sleep 30 & kill %1; jobs');
  });
  it('17.4 Wait for it', () => {
    yes(P17, 3, 'sleep 5 & wait');
    yes(P17, 3, 'sleep 6 & wait %1');
    yes(P17, 3, 'sleep 5 & wait $!');
    yes(P17, 3, 'sleep 30 &', 'sleep 5 & wait');
    no(P17, 3, 'sleep 5');
    no(P17, 3, 'sleep 5; wait');
    no(P17, 3, 'sleep 5 &');
    no(P17, 3, 'sleep 1 & wait');
    no(P17, 3, 'wait');
    no(P17, 3, 'sleep 5 & sleep 30 & wait %1'); // a job is left running
    // on two lines the first line's 1-second cost leaves 4 seconds to wait: a waited 5-second job still counts
    yes(P17, 3, 'sleep 5 &', 'wait');
    yes(P17, 3, 'sleep 5 &', 'wait %1');
    yes(P17, 3, '(sleep 5) & wait');
    no(P17, 3, 'sleep 5 &', 'sleep 9', 'wait'); // nothing left to wait for
    no(P17, 3, 'sleep 2 &', 'wait');
    no(P17, 3, "bash -c 'sleep 5 & wait'");
  });
  it('17.5 Kill it', () => {
    // fix round 1: other job specs
    yes(P17, 4, 'sleep 100 & kill %%');
    yes(P17, 4, 'sleep 100 & kill %+');
    yes(P17, 4, 'sleep 100 & kill %sleep');
    yes(P17, 4, 'sleep 100 & kill -s TERM %1');
    no(P17, 4, 'sleep 100 & kill %2');
    no(P17, 4, 'kill %%');
    yes(P17, 4, 'sleep 100 & kill %1');
    yes(P17, 4, 'sleep 100 & kill $!');
    yes(P17, 4, 'sleep 100 &', 'kill %1');
    yes(P17, 4, 'sleep 100 & kill -9 %1');
    yes(P17, 4, 'sleep 30 &', 'sleep 100 & kill %2');
    yes(P17, 4, 'sleep 100 &', 'kill 1235');
    no(P17, 4, 'sleep 100 &');
    no(P17, 4, 'kill %1');
    no(P17, 4, "bash -c 'sleep 100 & kill $!'");
    no(P17, 4, 'sleep 100 & wait');
    no(P17, 4, 'sleep 100 & echo Terminated');
    no(P17, 4, 'sleep 100 & kill %1', 'jobs');
  });
  it('17.6 The last job\'s PID', () => {
    yes(P17, 5, 'sleep 2 & pid=$!; wait $pid; echo "finished $pid"');
    yes(P17, 5, 'sleep 2 & pid=$!; wait "$pid"; echo "finished $pid"');
    yes(P17, 5, 'sleep 3 & wait $!; echo "finished $!"');
    yes(P17, 5, 'sleep 2 &', 'pid=$!; wait $pid; echo "finished $pid"');
    yes(P17, 5, 'sleep 30 &', 'sleep 2 & pid=$!; wait $pid; echo "finished $pid"');
    no(P17, 5, 'sleep 2 & echo "finished $!"');
    no(P17, 5, 'sleep 2 & wait; echo "finished 1235"');
    no(P17, 5, 'sleep 2 & pid=$!; echo "finished $pid"');
    no(P17, 5, 'echo "finished 1235"');
    no(P17, 5, 'sleep 2 & pid=$!; wait $pid; echo "finished 1234"');
  });
  it('17.6 prints finished 1235 in a fresh world', () => {
    const { go } = world(P17);
    assert.equal(go('sleep 2 & pid=$!; wait $pid; echo "finished $pid"').c.out(), 'finished 1235');
  });
  it('17.7 Script: fan out (answer, alternatives, wrong ones, failure lines)', () => {
    const { SQ, m, ok, why } = scriptJudge(P17, 6);
    // fix round 1: output alone is not enough (a check asks for & and wait), and wait %1 fails on the 1 3 case
    assert.equal(typeof m.check, 'function');
    const noJobs = '#!/bin/bash\nif [ "$#" -eq 0 ]; then\n  echo "usage: fanout.sh SECONDS..." >&2\n  exit 1\nfi\nmax=0\nfor n in "$@"; do [ "$n" -gt "$max" ] && max=$n; done\nsleep "$max"\nfor n in $(printf "%s\\n" "$@" | sort -n); do echo "$n done"; done\n';
    put(SQ, m, noJobs);
    assert.equal(SQ.ctxFor('').scriptPasses(m).ok, true, 'the cases alone pass the no-jobs script');
    assert.equal(ok(noJobs), false, 'no background job');
    put(SQ, m, noJobs);
    const v = SQ.missionVerdict(m, SQ.ctxFor(''), true);
    assert.equal(v.good, false);
    assert.match(SQ.scriptFailLine(m, v.failed), /background job \(&\) for every argument and wait/);
    assert.equal(ok(noJobs.replace('sleep "$max"', 'sleep "$max" &\nwait # & and wait, but no fan-out')), true, 'contrived: a single job plus wait passes (accepted)');
    assert.equal(ok(m.answer.replace('done\nwait\n', 'done\nwait %1\n')), false, 'wait %1 only');
    assert.equal(why(m.answer.replace('done\nwait\n', 'done\nwait %1\n')), 'Test 4 (1 3) failed: expected "1 done\\n3 done", got "1 done"');
    assert.equal(ok(m.answer.replace(/\nwait\n$/, '\n# wait\n')), false, 'wait only in a comment');
    assert.equal(ok('#!/bin/bash\n[ "$#" -gt 0 ] || { echo "usage: fanout.sh SECONDS..." >&2; exit 1; }\nfor n; do sleep "$n" && echo "$n done" & done\nwait\n'), true, 'an and-list in the background');
    assert.equal(ok(m.answer), true);
    assert.equal(ok('#!/bin/bash\n[ "$#" -gt 0 ] || { echo "usage: fanout.sh SECONDS..." >&2; exit 1; }\nwhile [ "$#" -gt 0 ]; do\n  (sleep "$1"; echo "$1 done") &\n  shift\ndone\nwait\n'), true, 'a shift loop');
    assert.equal(ok('#!/bin/bash\nif [ -z "$1" ]; then echo "usage: fanout.sh SECONDS..." 1>&2; exit 1; fi\nfor n; do\n  ( sleep "$n" && echo "$n done" ) &\ndone\nwait\n'), true, 'for n; && inside');
    assert.equal(ok(m.starter), false);
    for (const w of m.wrong) assert.equal(ok(w), false, w);
    assert.equal(why(m.answer.replace('done\nwait\n', 'done\n')), 'Test 1 (3 1 2) failed: expected "1 done\\n2 done\\n3 done", got ""');
    assert.ok(why(m.answer.replace('(sleep "$n"; echo "$n done") &', 'sleep "$n"; echo "$n done"')).startsWith('Test 1 (3 1 2) failed: expected "1 done\\n2 done\\n3 done", got "3 done\\n1 done\\n2 done'));
    // through the terminal: the jobs report in wake order and the clock moves 3 seconds (plus the line's 1)
    put(SQ, m, m.answer);
    const t0 = SQ.rt.clock;
    assert.equal(run(SQ, 'bash scripts/fanout.sh 3 1 2').out, '1 done\n2 done\n3 done');
    assert.equal(SQ.rt.clock - t0, 4);
    const r = SQ.execLine('bash scripts/fanout.sh');
    assert.deepEqual([...r.out.map((o) => o.cls === 'out')], [false], 'the usage line is on stderr');
    assert.equal(SQ.S.last, 1);
  });
});

describe('expert explanations: every claim re-run in the harness', () => {
  it('16.1: $NF, $0, and $1 in double quotes', () => {
    const { go } = world();
    assert.equal(go("awk '{print $NF}' village/logs/access.log | head -n 1").out, '200');
    assert.equal(go("awk '{print $0}' village/logs/access.log | head -n 1").out, '10.0.0.5 GET /index.html 200');
    assert.equal(go('awk "{print $1}" village/logs/access.log | head -n 1').out, '10.0.0.5 GET /index.html 200', 'bash empties $1: {print } prints the line');
  });
  it('16.2: no -F gives the whole line; -F: and -F\'\\t\'', () => {
    const { go } = world();
    assert.equal(go("awk '{print $1}' village/sales.csv | head -n 1").out, 'apple,12,2');
    assert.equal(go("echo a:b | awk -F: '{print $2}'").out, 'b');
    assert.equal(go("printf 'a\\tb\\n' | awk -F'\\t' '{print $2}'").out, 'b');
  });
  it('16.3: > makes no file; no action prints the line; a regex pattern', () => {
    const { SQ, go } = world();
    go("awk -F, '$2 > 10 {print $1}' village/sales.csv");
    assert.ok(!SQ.ctxFor('').has('~/10'));
    assert.equal(go("awk -F, '$2 > 10' village/sales.csv").out, 'apple,12,2\nbread,30,3');
    assert.equal(go("awk '/404/' village/logs/access.log").out.split('\n').length, 3);
  });
  it('16.4: 274; BEGIN prints before the first line', () => {
    const { go } = world();
    assert.equal(go("awk -F, '{s += $2 * $3} END {print s}' village/sales.csv").out, '274');
    assert.equal(go("awk -F, 'BEGIN {print \"sold:\"} {s += $2} END {print s}' village/sales.csv").out, 'sold:\n57');
    assert.equal(go("awk 'END {print x + 0, \"[\" x \"]\"}' village/sales.csv").out, '0 []', 'a new variable is empty, and 0 as a number');
  });
  it('16.5: | sort, and an array that adds up', () => {
    const { go } = world();
    assert.equal(go("awk '{c[$4]++} END {for (k in c) print k, c[k]}' village/logs/access.log | sort").out, '200 7\n404 3\n500 2');
    assert.equal(sortedLines(go("awk -F, '{t[$1] += $2} END {for (k in t) print k, t[k]}' village/sales.csv").out), 'apple 12\nbread 30\nmap 2\nrope 4\ntorch 9');
  });
  it('16.6: plain sed leaves the file; -i prints nothing; addresses', () => {
    const { SQ, go } = world();
    const before = SQ.ctxFor('').read('~/config.ini');
    assert.match(go("sed 's/debug=false/debug=true/' config.ini").out, /debug=true/);
    assert.equal(SQ.ctxFor('').read('~/config.ini'), before);
    assert.equal(go("sed -n '/debug/p' config.ini").out, 'debug=false');
    assert.equal(go("sed -n '2,4p' config.ini").out, 'name=Oakford\nport=8080\ndebug=false');
    assert.equal(go("sed -i 's/debug=false/debug=true/' config.ini").out, '');
    assert.equal(go('grep debug config.ini').out, 'debug=true');
    go("sed -i '/^$/d' config.ini");
    assert.equal(SQ.ctxFor('').read('~/config.ini').split('\n').length, before.split('\n').length - 1);
    assert.ok(!SQ.ctxFor('').read('~/config.ini').split('\n').includes(''));
  });
  it('16.7: printf columns, no newline without \\n', () => {
    const { go } = world();
    assert.equal(go("awk -F, '{printf \"%-8s %7.2f\\n\", $1, $2*$3}' village/sales.csv | head -n 1").out, 'apple      24.00');
    assert.equal(go("awk 'BEGIN {printf \"a\"; printf \"b\\n\"}'").out, 'ab');
    assert.equal(go('[ -r village/sales.csv ] && echo yes; [ -r nothing.csv ] || echo no').out, 'yes\nno');
  });
  it('17.1: ps lists bash and itself; a job adds a sleep row', () => {
    const { go } = world(P17);
    const o = go('ps').out;
    assert.match(o, /^\s*PID TTY\s+TIME CMD$/m);
    assert.match(o, / bash$/m);
    assert.match(o, / ps$/m);
    go('sleep 30 &');
    assert.match(go('ps').out, / sleep$/m);
  });
  it('17.2: sleep 30 moves the clock 30 seconds; every line adds 1', () => {
    const { SQ, go } = world(P17);
    const t0 = SQ.rt.clock;
    assert.equal(go('sleep 30').c.elapsed(), 30);
    assert.equal(SQ.rt.clock - t0, 31);
    go('echo hi');
    assert.equal(SQ.rt.clock - t0, 32);
  });
  it('17.3: jobs -l adds the PID; a finished job shows Done once and leaves the list', () => {
    const { go } = world(P17);
    assert.match(go('sleep 30 & jobs -l').out, /\[1\]\+\s+1235 Running\s+sleep 30 &/);
    go('kill %1');
    const w = world(P17);
    w.go('sleep 1 &');
    assert.match(w.go('sleep 2').out, /\[1\]\+\s+Done\s+sleep 1/);
    assert.equal(w.go('jobs').out, '');
    const z = world(P17);
    assert.match(z.go('sleep 30 & sleep 40 & jobs').out, /\[1\]-\s+Running\s+sleep 30 &\n\[2\]\+\s+Running\s+sleep 40 &/);
  });
  it('17.4: wait reports Done after the 5 seconds; wait %1 waits for one job only', () => {
    const { go } = world(P17);
    const r = go('sleep 5 & wait');
    assert.match(r.out, /Done\s+sleep 5/);
    assert.equal(r.c.elapsed(), 5);
    const r2 = go('sleep 5 & sleep 9 & wait %1');
    assert.equal(r2.c.elapsed(), 5);
    assert.ok(r2.c.jobs().some((j) => j.cmd === 'sleep 9' && j.state === 'Running'));
  });
  it('17.5: Terminated by default, by PID with $!, Killed with -9', () => {
    const { go } = world(P17);
    assert.match(go('sleep 100 & kill %1').out, /Terminated\s+sleep 100/);
    assert.match(go('sleep 100 & kill $!').out, /Terminated\s+sleep 100/);
    assert.match(go('sleep 100 & kill -9 %1').out, /Killed\s+sleep 100/);
  });
  it('17.6: $! is the notice\'s PID, a new job changes it, wait returns the status, kill $pid stops it', () => {
    const { go } = world(P17);
    const r = go('sleep 1 & a=$!; sleep 1 & echo "$a $!"');
    assert.match(r.out, /^\[1\] 1235\n\[2\] 1236\n1235 1236/);
    go('wait');
    assert.match(go('sleep 2 & pid=$!; wait $pid; echo $?').c.out(), /^0$/);
    assert.match(go('sleep 9 & pid=$!; kill $pid').out, /Terminated\s+sleep 9/);
  });
  it('17.7: without wait the script ends at once and the jobs report after it; one after the other takes 6 seconds, in 3 1 2 order', () => {
    const { SQ, m } = scriptJudge(P17, 6);
    const tryIt = (text, tests) => { put(SQ, m, text); return SQ.ctxFor('').scriptPasses({ ...m, tests }).ok; };
    const noWait = m.answer.replace('done\nwait\n', 'done\n');
    assert.ok(tryIt(noWait, [{ label: 'at once', args: ['3', '1', '2'], expectOut: '', expectClock: 0 }]));
    assert.ok(tryIt(noWait, [{ label: 'after', args: ['3', '1', '2'], advance: 3, expectOut: '1 done\n2 done\n3 done' }]));
    const serial = m.answer.replace('(sleep "$n"; echo "$n done") &', 'sleep "$n"; echo "$n done"');
    assert.ok(tryIt(serial, [{ label: 'serial', args: ['3', '1', '2'], expectOut: '3 done\n1 done\n2 done', expectClock: 6 }]));
  });
});

describe('expert quick-fire and guide (chapters 16 and 17)', () => {
  const SQ = loadShell();
  const QF = SQ.content.quickfire.filter((q) => q[2] === 'expert');
  it('has 6 quick-fire questions per chapter, tagged expert', () => {
    assert.equal(QF.length, 12);
  });
  it('awk and sed questions compare exactly (the quotes are the lesson)', () => {
    for (const q of QF) if (q[1].some((a) => /^(awk|sed)\b/.test(a))) assert.deepEqual({ ...q[3] }, { exact: true }, q[0]);
  });
  it('job quick-fire questions accept the common spellings (fix round 1)', () => {
    // the same normalisation as app.js answer(): exact collapses spaces, otherwise quotes are dropped too
    const accepts = (q, v) => { const nm = q[3] && q[3].exact ? (t) => t.trim().replace(/\s+/g, ' ') : (s) => s.trim().replace(/\s+/g, ' ').replace(/['"]/g, ''); return q[1].some((x) => nm(x) === nm(v)); };
    const bg = QF.find((q) => q[0] === 'Run sleep 30 in the background');
    const kill = QF.find((q) => q[0] === 'Stop job number 1');
    for (const v of ['sleep 30 &', 'sleep 30&', ' sleep  30 & ']) assert.ok(accepts(bg, v), v);
    for (const v of ['sleep 30', 'sleep 30 && wait', 'sleep 3 &']) assert.ok(!accepts(bg, v), v);
    for (const v of ['kill %1', 'kill -TERM %1', 'kill -15 %1', 'kill -s TERM %1']) assert.ok(accepts(kill, v), v);
    for (const v of ['kill %2', 'kill -s TERM %2', 'kill -9 %1', 'kill']) assert.ok(!accepts(kill, v), v);
  });
  it('has 6 guide entries per chapter, covering the new keywords', () => {
    for (const ci of EXPERT) assert.equal(SQ.content.guide.filter((g) => g.ch === ci).length, 6, `chapter ${ci}`);
    const g = SQ.content.guide.filter((g) => EXPERT.includes(g.ch));
    const text = g.map((x) => x.c + ' ' + x.what).join(' ');
    for (const k of ['awk', '-F', 'BEGIN', 'END', 'c[key]', 'printf', 'sed -i', 'address', 'sleep', '&', 'jobs', 'wait', 'kill', 'ps', '$!', '$1', '$NF', 'NR'])
      assert.ok(text.includes(k), `guide covers ${k}`);
    const cs = g.map((x) => x.c);
    for (const k of ['awk', 'awk -F', 'BEGIN END', 'awk arrays', 'awk printf', 'sed -i', 'ps', 'sleep', '&', 'jobs', 'wait', 'kill']) assert.ok(cs.includes(k), `guide entry ${k}`);
  });
  it('every expert quick-fire answer runs without an error in a set-up world with a job running', () => {
    for (const q of QF) for (const a of q[1]) {
      const S2 = loadShell();
      for (const ci of EXPERT) S2.setupChapter(S2.content.chapters[ci]);
      run(S2, 'sleep 50 &');
      const r = run(S2, a);
      assert.doesNotMatch(r.out, /bash:|not support|command not found|awk:|sed:/, `${a}: ${r.out}`);
      assert.equal(r.code, 0, a);
    }
  });
  it('guide examples for chapters 16 and 17 run cleanly and print what they say', () => {
    for (const g of SQ.content.guide.filter((g) => EXPERT.includes(g.ch)))
      for (const [e, note] of g.ex) {
        const S2 = loadShell();
        for (const ci of EXPERT) S2.setupChapter(S2.content.chapters[ci]);
        const r = run(S2, e);
        assert.doesNotMatch(r.out, /bash:|not support|command not found|awk:|sed:/, `${g.c}: ${e}: ${r.out}`);
        if (/^prints /.test(note)) assert.equal(r.out.replace(/\n/g, ' '), note.slice(7), `${g.c}: ${e}`);
      }
  });
  it('the job guide examples show what their notes say', () => {
    const go = (line) => { const S2 = loadShell(); S2.setupChapter(S2.content.chapters[P17]); return run(S2, line).out; };
    assert.match(go('ps'), / bash$/m);
    assert.match(go('sleep 30 & ps'), / sleep$/m);
    assert.match(go('sleep 30 & echo "pid $!"'), /^\[1\] 1235\npid 1235$/);
    assert.match(go('sleep 30 & jobs'), /^\[1\] 1235\n\[1\]\+\s+Running\s+sleep 30 &$/);
    assert.match(go('sleep 30 & jobs -l'), /1235 Running/);
    assert.match(go('sleep 3 & wait'), /Done\s+sleep 3/);
    assert.match(go('sleep 2 & pid=$!; wait "$pid"; echo "status $?"'), /status 0/);
    assert.match(go('sleep 100 & kill %1'), /Terminated/);
    assert.match(go('sleep 100 & kill -9 $!'), /Killed/);
  });
});
