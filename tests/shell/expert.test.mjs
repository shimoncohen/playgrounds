// Stage 3 Tasks 18 and 19: the Expert tier, chapters 16 (awk & sed craft), 17 (Processes & jobs), 18 (Pipeline mastery) and
// 19 (Safe, debuggable scripts), at indexes 15 to 18.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';
import { assertSolvable } from './solvability-lib.mjs';

const A16 = 15, P17 = 16, PM18 = 17, SS19 = 18;
const EXPERT = [A16, P17, PM18, SS19];
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

describe('expert chapters: shape', () => {
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
  it('chapters 18 and 19 sit at indexes 17 and 18, tier expert, 7 missions each; 19 chapters in all, the Expert tier is the last', () => {
    assert.equal(ch.length, 19);
    assert.deepEqual([...ch.slice(17, 19).map((c) => c.tier)], ['expert', 'expert']);
    assert.deepEqual([...ch.slice(17, 19).map((c) => c.name)], ['Pipeline mastery', 'Safe, debuggable scripts']);
    assert.deepEqual([...ch.slice(17, 19).map((c) => c.badge)], ['Pipeline Architect', 'Toolsmith']);
    assert.deepEqual([...ch.slice(15, 19).map((c) => c.missions.length)], [7, 7, 7, 7]);
  });
  it('all 28 Expert missions exist: cumulativeXp("expert") is 1890 + 28*25 + 4*25, the rank Shell Wizard, Advanced still 1890', () => {
    const ex = ch.filter((c) => c.tier === 'expert');
    assert.equal(ex.length, 4);
    assert.equal(ex.reduce((n, c) => n + c.missions.length, 0), 28);
    assert.equal(SQ.tiers.cumulativeXp('expert'), 1890 + 28 * 25 + 4 * 25);
    assert.equal(SQ.tiers.cumulativeXp('expert'), 2690);
    assert.equal(SQ.tiers.cumulativeXp('advanced'), 1890);
    const r = SQ.tiers.ranks();
    assert.deepEqual([...r[r.length - 1]], [2690, 'Shell Wizard']);
    assert.equal(SQ.tiers.rankFor(2690).name, 'Shell Wizard');
    assert.equal(SQ.tiers.rankFor(2689).name, 'Automator');
    for (const i of [PM18, SS19]) {
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
    for (const c of ch.slice(15, 19)) c.missions.forEach((m, i) => {
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
    for (const c of ch.slice(15, 19)) for (const m of c.missions) {
      const text = [m.goal, m.explain, m.note || '', m.hint || '', m.answer, m.starter || ''].join(' ').replace(/<[^>]+>/g, '');
      assert.doesNotMatch(text, /\[\s+!?\s*\$\w/, `${m.title}: quote variables in [ ]`);
    }
    for (const g of SQ.content.guide.filter((g) => EXPERT.includes(g.ch))) for (const [e] of g.ex) assert.doesNotMatch(e, /\[\s+\$\w/, `guide ${g.c}: ${e}`);
  });
});

describe('expert chapters: world seeding', () => {
  it('seed scripts/, village/sales.csv, village/logs/access.log and config.ini with the Intermediate data; setup twice changes nothing', () => {
    const SQ = loadShell();
    for (const ci of EXPERT) SQ.setupChapter(SQ.content.chapters[ci]);
    const c = SQ.ctxFor('');
    assert.ok(c.isDir('~/scripts'));
    assert.equal(c.read('~/village/sales.csv'), SQ.VILLAGE.SALES);
    assert.equal(c.read('~/village/logs/access.log'), SQ.VILLAGE.ACCESS);
    assert.equal(c.read('~/village/logs/all.log'), SQ.VILLAGE.ALLLOG);
    assert.equal(c.read('~/config.ini'), SQ.VILLAGE.CONFIG);
    assert.equal(c.read('~/scripts/report.sh'), SQ.content.chapters[A16].missions[6].starter);
    assert.equal(c.read('~/scripts/fanout.sh'), SQ.content.chapters[P17].missions[6].starter);
    assert.equal(c.read('~/scripts/topn.sh'), SQ.content.chapters[PM18].missions[6].starter);
    assert.equal(c.read('~/scripts/opts.sh'), SQ.content.chapters[SS19].missions[5].starter);
    assert.equal(c.read('~/scripts/logtool.sh'), SQ.content.chapters[SS19].missions[6].starter);
    // chapter 18's world: three .txt files and a readme.md in inbox/, two unsorted lists, an empty archive/
    assert.deepEqual([...c.node('~/inbox') && Object.keys(c.node('~/inbox').children).sort()], ['a.txt', 'b.txt', 'c.txt', 'readme.md']);
    for (const [k, v] of Object.entries(SQ.EXPERT_SEED.INBOX)) assert.equal(c.read(`~/inbox/${k}`), v);
    for (const [k, v] of Object.entries(SQ.EXPERT_SEED.LISTS)) assert.equal(c.read(`~/lists/${k}`), v);
    assert.ok(c.isDir('~/archive'));
    assert.equal(Object.keys(c.node('~/archive').children).length, 0);
    const snap = JSON.stringify(SQ.S.fs);
    for (const ci of EXPERT) SQ.setupChapter(SQ.content.chapters[ci]);
    assert.equal(JSON.stringify(SQ.S.fs), snap, 'second setup changes nothing');
  });
  it('the same data as the Intermediate chapters seed (a learner coming from chapter 8 sees the same files)', () => {
    const a = loadShell(), b = loadShell();
    a.content.chapters[7].setup();
    b.setupChapter(b.content.chapters[A16]);
    for (const p of ['~/village/sales.csv', '~/village/logs/access.log', '~/config.ini']) assert.equal(b.ctxFor('').read(p), a.ctxFor('').read(p), p);
    const d = loadShell(), e = loadShell();
    d.content.chapters[9].setup(); // Intermediate chapter 10 (Permissions & links) seeds village/logs/all.log
    e.setupChapter(e.content.chapters[SS19]);
    assert.equal(e.ctxFor('').read('~/village/logs/all.log'), d.ctxFor('').read('~/village/logs/all.log'));
  });
  it('never clobbers learner files', () => {
    const SQ = loadShell();
    SQ.setupChapter(SQ.content.chapters[A16]);
    run(SQ, "sed -i 's/debug=false/debug=true/' config.ini");
    run(SQ, 'echo mine > scripts/report.sh');
    run(SQ, 'echo 1,2,3 > village/sales.csv');
    run(SQ, 'echo mine > inbox/a.txt; echo kept > archive/x.txt; rm lists/b.txt; echo mine > scripts/logtool.sh');
    for (const ci of EXPERT) SQ.setupChapter(SQ.content.chapters[ci]);
    const c = SQ.ctxFor('');
    assert.equal(c.read('~/inbox/a.txt'), 'mine');
    assert.equal(c.read('~/archive/x.txt'), 'kept');
    assert.equal(c.read('~/lists/b.txt'), SQ.EXPERT_SEED.LISTS['b.txt'], 'a deleted seed file comes back');
    assert.equal(c.read('~/scripts/logtool.sh'), 'mine');
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
      run(SQ, 'rm -r village scripts config.ini inbox lists archive');
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

describe('expert quick-fire and guide (chapters 16 to 19)', () => {
  const SQ = loadShell();
  const QF = SQ.content.quickfire.filter((q) => q[2] === 'expert');
  it('has 6 quick-fire questions per chapter, tagged expert', () => {
    assert.equal(QF.length, 24);
  });
  it('chapter 18 and 19 questions cover find -exec, xargs, <( ), set -euo pipefail, -x, trap, mktemp and $?', () => {
    const all = QF.slice(12).flatMap((q) => q[1]).join('\n');
    for (const k of ['-exec', 'xargs -I', '-P3', '<(', 'set -euo pipefail', 'set -x', 'trap', 'mktemp', 'echo $?', 'set -e', 'sort -k1,1nr']) assert.ok(all.includes(k), k);
  });
  it('chapter 18 and 19 quick-fire answers accept the common spellings', () => {
    const accepts = (q, v) => { const nm = q[3] && q[3].exact ? (t) => t.trim().replace(/\s+/g, ' ') : (s) => s.trim().replace(/\s+/g, ' ').replace(/['"]/g, ''); return q[1].some((x) => nm(x) === nm(v)); };
    const q = (t) => QF.find((x) => x[0].startsWith(t));
    for (const v of ["find inbox -name '*.txt' -exec wc -l {} \\;", "find inbox -name '*.txt' -exec wc -l {} +", 'find inbox -name "*.txt" -exec wc -l {} \\;']) assert.ok(accepts(q('With find -exec'), v), v);
    for (const v of ['find inbox -name *.txt -exec wc -l {} \\;', "find inbox -exec wc -l {} \\;"]) assert.ok(!accepts(q('With find -exec'), v), v);
    for (const v of ['set -euo pipefail', 'set -eu -o pipefail', 'set -o errexit -o nounset -o pipefail']) assert.ok(accepts(q('Turn on errexit'), v), v);
    for (const v of ['set -eu', 'set -e -o pipefail']) assert.ok(!accepts(q('Turn on errexit'), v), v);
    for (const v of ["trap 'rm -f \"$tmp\"' EXIT", "trap 'rm -f \"$tmp\"' 0"]) assert.ok(accepts(q('Remove the file named'), v), v);
    for (const v of ['trap "rm -f $tmp" EXIT', "trap 'rm -f $tmp' EXIT"]) assert.ok(!accepts(q('Remove the file named'), v), v);
    for (const v of ['tmp=$(mktemp)', 'tmp="$(mktemp)"']) assert.ok(accepts(q('Make a new empty temporary'), v), v);
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
    const g2 = SQ.content.guide.filter((g) => g.ch === PM18 || g.ch === SS19);
    const t2 = g2.map((x) => x.c + ' ' + x.what + ' ' + x.ex.map((e) => e[0]).join(' ')).join(' ');
    for (const k of ['find', '-exec', 'xargs', '-I{}', '-P', '<(', 'set -euo pipefail', 'set -e', 'set -u', 'pipefail', 'set -x', 'trap', 'getopts', 'mktemp', '$?', 'exit status', 'OPTARG', 'uniq -c', 'sort -k'])
      assert.ok(t2.includes(k), `guide covers ${k}`);
    for (const k of ['find -exec', 'xargs', 'xargs -n -P', '<( )', 'uniq -c', 'sort -k', 'set -e', 'set -u', 'set -o pipefail', 'set -x', 'trap', 'getopts']) assert.ok(g2.some((x) => x.c === k), `guide entry ${k}`);
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
      assert.equal(r.code, /^diff /.test(a) ? 1 : 0, a); // diff exits with 1 when the files differ, and the sorted lists do
    }
  });
  it('guide examples for the Expert chapters run cleanly and print what they say', () => {
    for (const g of SQ.content.guide.filter((g) => EXPERT.includes(g.ch)))
      for (const [e, note] of g.ex) {
        const S2 = loadShell();
        for (const ci of EXPERT) S2.setupChapter(S2.content.chapters[ci]);
        const r = run(S2, e);
        // a note that says what is printed is compared exactly (set -u's example prints bash's own error on purpose)
        if (/^prints /.test(note)) assert.equal(r.out.replace(/\n/g, ' '), note.slice(7), `${g.c}: ${e}`);
        else assert.doesNotMatch(r.out, /bash:|not support|command not found|awk:|sed:/, `${g.c}: ${e}: ${r.out}`);
        assert.doesNotMatch(r.out, /not support|command not found/, `${g.c}: ${e}: ${r.out}`);
      }
  });
  it('the chapter 18 and 19 guide notes that are not "prints" hold too', () => {
    const go = (line) => { const S2 = loadShell(); S2.setupChapter(S2.content.chapters[SS19]); return run(S2, line).out; };
    assert.equal(go('ls inbox/*.txt | xargs -t wc -l').split('\n')[0], 'wc -l inbox/a.txt inbox/b.txt inbox/c.txt', 'xargs: one wc for the three files');
    { // -n2: two commands, echo 1 2 and echo 3 (-t shows them on stderr)
      const S2 = loadShell(); const l = 'echo 1 2 3 | xargs -t -n2 echo'; run(S2, l); const c = S2.ctxFor(l);
      assert.deepEqual([c.err(), c.out()], ['echo 1 2\necho 3', '1 2\n3']);
    }
    assert.equal(go("awk '{print $1}' village/logs/access.log | sort | uniq -c | sort -rn | head -1").trim(), '4 10.0.0.5');
    assert.equal(go("printf 'a\\nb\\na\\n' | sort | uniq -c"), '      2 a\n      1 b');
    assert.equal(go('mktemp'), '/tmp/tmp.A00001');
    assert.equal(go("bash -c 'while getopts \"vn:\" o; do echo \"$o $OPTARG\"; done' x -v -n Ada"), 'v \nn Ada');
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

describe('chapter 18 (Pipeline mastery) checks', () => {
  it('18.1 Run a command on every match', () => {
    yes(PM18, 0, "find inbox -name '*.txt' -exec wc -l {} \\;");
    yes(PM18, 0, "find inbox -name '*.txt' -exec wc -l {} +");
    yes(PM18, 0, 'find ./inbox -name "*.txt" -exec wc -l {} \\;');
    yes(PM18, 0, "find inbox -type f -name '*.txt' -exec wc -l '{}' ';'");
    yes(PM18, 0, "find ~/inbox -name '*.txt' -exec wc -l {} \\;");
    yes(PM18, 0, 'cd inbox', "find . -name '*.txt' -exec wc -l {} \\;");
    yes(PM18, 0, "find inbox -name '*.txt' -exec wc -l {} \\; | sort -r");
    no(PM18, 0, 'wc -l inbox/*.txt');
    no(PM18, 0, "find inbox -name '*.txt' | xargs wc -l");
    no(PM18, 0, 'find inbox -exec wc -l {} \\;'); // readme.md (and the folder itself) too
    no(PM18, 0, "find inbox -name '*.txt' -exec cat {} \\;");
    no(PM18, 0, "find inbox -name '*.txt' -exec wc -c {} \\;");
    no(PM18, 0, "find inbox -name 'a.txt' -exec wc -l {} \\;");
    no(PM18, 0, "echo '3 inbox/a.txt'; echo '2 inbox/b.txt'; echo '4 inbox/c.txt'");
    no(PM18, 0, "find inbox -name '*.txt' -exec echo {} \\; ; wc -l inbox/*.txt");
  });
  it('18.1 a file added to inbox (also in a subfolder) is expected too; GNU wc\'s "total" line is allowed', () => {
    yes(PM18, 0, 'mkdir -p inbox/old; echo x > inbox/old/d.txt', "find inbox -name '*.txt' -exec wc -l {} \\;");
    no(PM18, 0, 'mkdir -p inbox/old; echo x > inbox/old/d.txt', "find inbox -maxdepth 1 -name '*.txt' -exec wc -l {} \\;");
    const { SQ, go } = world(PM18);
    const r = go("find inbox -name '*.txt' -exec wc -l {} \\;");
    assert.equal(r.out, '3 inbox/a.txt\n2 inbox/b.txt\n4 inbox/c.txt');
    SQ.rt.lastOut = r.out + '\n9 total';
    assert.ok(SQ.content.chapters[PM18].missions[0].check(r.c));
  });
  it('18.2 Feed a command with xargs', () => {
    yes(PM18, 1, 'ls inbox/*.txt | xargs -I{} cp {} archive/');
    yes(PM18, 1, 'ls inbox/*.txt | xargs -I {} cp {} archive/');
    yes(PM18, 1, "find inbox -name '*.txt' | xargs -I{} cp {} archive/");
    yes(PM18, 1, "printf '%s\\n' inbox/*.txt | xargs -I % cp % archive");
    yes(PM18, 1, 'ls inbox/*.txt | xargs -t -I{} cp {} archive/');
    yes(PM18, 1, 'cd inbox', 'ls *.txt | xargs -I{} cp {} ../archive/');
    no(PM18, 1, 'cp inbox/*.txt archive/');
    no(PM18, 1, 'ls inbox/*.txt | xargs -I{} echo {}');
    no(PM18, 1, 'ls inbox/a.txt | xargs -I{} cp {} archive/');
    no(PM18, 1, 'ls inbox/*.txt | xargs -I{} mv {} archive/'); // the inbox copies are gone, nothing to compare with
    no(PM18, 1, 'ls inbox/*.txt | xargs -I{} cp {} inbox/');
    // leftovers: archive/ already full from an earlier line does not count without an xargs -I cp on this line
    no(PM18, 1, 'cp inbox/*.txt archive/', 'echo x | xargs -I{} echo {}');
    no(PM18, 1, 'ls inbox/*.txt | xargs -I{} cp {} archive/', 'ls archive');
  });
  it('18.3 Work in parallel (any order)', () => {
    yes(PM18, 2, 'echo 1 2 3 | xargs -n1 -P3 echo job');
    yes(PM18, 2, 'echo 1 2 3 | xargs -P3 -n1 echo job');
    yes(PM18, 2, 'echo 1 2 3 | xargs -n 1 -P 3 echo job');
    yes(PM18, 2, 'seq 3 | xargs -P 3 -I{} echo job {}');
    yes(PM18, 2, 'echo 3 2 1 | xargs -n1 -P3 echo job');
    no(PM18, 2, 'echo 1 2 3 | xargs -n1 echo job');
    no(PM18, 2, 'echo 1 2 3 | xargs -P3 echo job');
    no(PM18, 2, 'echo job 1; echo job 2; echo job 3');
    no(PM18, 2, 'echo 1 2 | xargs -n1 -P3 echo job');
    no(PM18, 2, 'echo 1 2 3 | xargs -n1 -P3 echo task');
  });
  it('18.4 Compare without temp files', () => {
    yes(PM18, 3, 'diff <(sort lists/a.txt) <(sort lists/b.txt)');
    yes(PM18, 3, 'diff <(sort < lists/a.txt) <(cat lists/b.txt | sort)');
    yes(PM18, 3, 'cd lists', 'diff <(sort a.txt) <(sort b.txt)');
    yes(PM18, 3, 'diff <(sort -u lists/a.txt) <(sort lists/b.txt)');
    no(PM18, 3, 'diff lists/a.txt lists/b.txt');
    no(PM18, 3, 'sort lists/a.txt > /tmp/a; sort lists/b.txt > /tmp/b; diff /tmp/a /tmp/b');
    no(PM18, 3, 'diff <(sort lists/b.txt) <(sort lists/a.txt)');
    no(PM18, 3, 'diff <(sort lists/a.txt) lists/b.txt');
    no(PM18, 3, 'diff -u <(sort lists/a.txt) <(sort lists/b.txt)'); // another format: the goal shows plain diff
    no(PM18, 3, 'comm -3 <(sort lists/a.txt) <(sort lists/b.txt)');
    no(PM18, 3, "printf '2a3\\n> kiwi\\n4d4\\n< plum\\n'");
  });
  it('18.4 the expected diff follows the lists: an edited list changes it', () => {
    yes(PM18, 3, 'echo melon >> lists/b.txt', 'diff <(sort lists/a.txt) <(sort lists/b.txt)');
    const { go } = world(PM18);
    assert.equal(go('diff <(sort lists/a.txt) <(sort lists/b.txt)').out, '2a3\n> kiwi\n4d4\n< plum');
  });
  it('18.5 Keep the variable', () => {
    yes(PM18, 4, 'while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n');
    yes(PM18, 4, 'n=0; while read -r l; do n=$((n+1)); done < <(cat inbox/a.txt); echo "$n"');
    yes(PM18, 4, 'while IFS= read -r line; do n=$((n + 1)); done < inbox/a.txt; echo "$n"');
    yes(PM18, 4, 'count=0; while read x; do count=$((count+1)); done < <(cat inbox/a.txt) ; echo $count');
    // the planned wrong answer: the loop counts in a pipeline's subshell, so n is empty afterwards
    no(PM18, 4, 'cat inbox/a.txt | while read l; do n=$((n+1)); done; echo $n');
    // ... and it stays wrong when an earlier run left n=3 behind
    no(PM18, 4, 'while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n', 'cat inbox/a.txt | while read l; do n=$((n+1)); done; echo $n');
    no(PM18, 4, 'wc -l < inbox/a.txt');
    no(PM18, 4, 'echo 3');
    no(PM18, 4, 'while read l; do n=$((n+1)); done < <(cat inbox/b.txt); echo $n');
    no(PM18, 4, 'cat inbox/a.txt | { while read l; do n=$((n+1)); done; echo $n; }'); // right number, but no redirect into the loop
    // a second run counts on from 3 (6): the note says to start with n=0; and that form passes
    no(PM18, 4, 'while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n', 'while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n');
    yes(PM18, 4, 'while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n', 'n=0; while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n');
    yes(PM18, 4, 'while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n', 'unset n', 'while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n');
  });
  it('18.6 Top three', () => {
    yes(PM18, 5, "sort village/logs/access.log | awk '{print $1}' | uniq -c | sort -rn | head -3");
    yes(PM18, 5, "awk '{print $1}' village/logs/access.log | sort | uniq -c | sort -rn | head -n 3");
    yes(PM18, 5, "cut -d' ' -f1 village/logs/access.log | sort | uniq -c | sort -nr | head -3");
    yes(PM18, 5, "awk '{c[$1]++} END {for (k in c) print c[k], k}' village/logs/access.log | sort -rn | head -3");
    yes(PM18, 5, "awk '{print $1}' village/logs/access.log | sort | uniq -c | sort -k1,1nr -k2,2 | head -3"); // the tie in the other order
    no(PM18, 5, "awk '{print $1}' village/logs/access.log | uniq -c | sort -rn | head -3"); // no sort first: every count is 1
    no(PM18, 5, "awk '{print $1}' village/logs/access.log | sort | uniq -c | sort -n | head -3");
    no(PM18, 5, "awk '{print $1}' village/logs/access.log | sort | uniq -c | sort -rn");
    no(PM18, 5, "awk '{print $1}' village/logs/access.log | sort | uniq -c | sort -rn | head -2");
    no(PM18, 5, "awk '{print $1}' village/logs/access.log | sort | uniq -c | sort -rn | head -3 | awk '{print $2}'");
    no(PM18, 5, "echo '4 10.0.0.5'; echo '3 10.0.0.9'; echo '3 10.0.0.7'");
    no(PM18, 5, "awk '{print $1}' village/sales.csv | sort | uniq -c | sort -rn | head -3");
  });
  it('18.7 Script: top N (answer, alternatives, wrong ones, failure lines)', () => {
    const { SQ, m, ok, why } = scriptJudge(PM18, 6);
    assert.equal(m.check, undefined, 'the cases use files no answer can hard-code');
    assert.equal(ok(m.answer), true);
    assert.equal(ok('#!/bin/bash\n[ "$#" -eq 2 ] || { echo "usage: topn.sh FILE N" >&2; exit 2; }\n[ -r "$1" ] || { echo "topn.sh: cannot read $1" >&2; exit 1; }\ncut -d" " -f1 "$1" | sort | uniq -c | sort -k1,1nr -k2 | head -n "$2" | sed \'s/^ *//\'\n'), true, 'cut, -k2, sed');
    assert.equal(ok('#!/bin/bash\nif [[ $# -ne 2 ]]; then\n  echo "usage: topn.sh FILE N" 1>&2\n  exit 2\nfi\nif [[ ! -r $1 ]]; then\n  echo "topn.sh: cannot read $1" 1>&2\n  exit 1\nfi\nawk \'{c[$1]++} END {for (k in c) print c[k], k}\' "$1" | sort -k1,1nr -k2,2 | head -n "$2"\n'), true, 'an awk array');
    assert.equal(ok(m.starter), false);
    for (const w of m.wrong) assert.equal(ok(w), false, w);
    assert.equal(ok("#!/bin/bash\nprintf '4 10.0.0.5\\n3 10.0.0.7\\n'\n"), false, 'hardcoded');
    assert.equal(why(m.wrong[0]), 'Test 1 (the access log, N 2) failed: expected "4 10.0.0.5\\n3 10.0.0.7", got "2 10.0.0.12\\n4 10.0.0.5"', 'sorted by value');
    assert.equal(why(m.wrong[1]), 'Test 1 (the access log, N 2) failed: expected "4 10.0.0.5\\n3 10.0.0.7", got "4 10.0.0.5\\n3 10.0.0.9"', 'sort -rn turns a tie round');
    assert.equal(why(m.wrong[5]), 'Test 4 (a missing file) failed: expected "topn.sh: cannot read ghost.txt", got "awk: can\'t open file ghost.txt"');
    assert.equal(why(m.answer.replace('exit 2', 'exit 1')), 'Test 5 (no arguments) failed: expected "exit status 2", got "exit status 1 (usage: topn.sh FILE N)"');
    // the cases do not depend on the learner's copy of the access log
    run(SQ, 'echo 10.0.0.1 > village/logs/access.log');
    assert.equal(ok(m.answer), true);
    // through the terminal
    run(SQ, 'rm village/logs/access.log');
    SQ.setupChapter(SQ.content.chapters[PM18]);
    put(SQ, m, m.answer);
    assert.equal(run(SQ, 'bash scripts/topn.sh village/logs/access.log 3').out, '4 10.0.0.5\n3 10.0.0.7\n3 10.0.0.9');
    const r = SQ.execLine('bash scripts/topn.sh');
    assert.deepEqual([...r.out.map((o) => o.cls === 'out')], [false], 'the usage line is on stderr');
    assert.equal(SQ.S.last, 2);
  });
  it('chapter 18 missions pass in order in one world (each line judged on its own), as a learner plays them', () => {
    const SQ = loadShell();
    const ch = SQ.content.chapters[PM18];
    SQ.setupChapter(ch);
    for (const m of ch.missions.slice(0, 6)) {
      run(SQ, m.answer);
      assert.ok(m.check(SQ.ctxFor(m.answer)), m.title);
    }
  });
});

describe('chapter 19 (Safe, debuggable scripts) checks', () => {
  it('19.1 Stop on error', () => {
    yes(SS19, 0, "bash -c 'set -e; false; echo after'; echo $?");
    yes(SS19, 0, "bash -c 'set -e; false; echo after'"); // on its own line: no output, status 1; echo $? can follow
    yes(SS19, 0, "bash -c 'set -o errexit; false; echo after'; echo \"$?\"");
    yes(SS19, 0, "bash -ec 'false; echo after'; echo $?");
    yes(SS19, 0, "bash -c 'set -e; ls nope; echo after'; echo $?");
    yes(SS19, 0, "bash -c 'set -euo pipefail; false; echo after'; echo $?");
    no(SS19, 0, "bash -c 'false; echo after'; echo $?");
    no(SS19, 0, 'echo 1');
    no(SS19, 0, 'false; echo $?');
    no(SS19, 0, "bash -c 'set -e; true; echo after'; echo $?");
    no(SS19, 0, "bash -c 'set -e; false'; echo $?"); // nothing after the failure to skip
    no(SS19, 0, "bash -c 'set -e; exit 1'; echo $?");
    no(SS19, 0, "bash -c 'set -e; false; echo after'; echo $?; echo after");
    no(SS19, 0, "bash -c 'false; echo after'", 'echo 1');
  });
  it('19.2 No unset variables', () => {
    yes(SS19, 1, "bash -c 'set -u; echo \"$nope\"'");
    yes(SS19, 1, "bash -uc 'echo \"$nope\"'");
    yes(SS19, 1, "bash -c 'set -o nounset; echo \"$typo\"'");
    yes(SS19, 1, "bash -c 'set -u; echo \"$nope\"'; echo $?");
    yes(SS19, 1, "bash -c 'set -eu; echo \"${nope}\"; echo after'");
    yes(SS19, 1, 'set -u; echo "$nope"'); // at the prompt: the error, status 1
    no(SS19, 1, "bash -c 'echo \"$nope\"'");
    no(SS19, 1, "echo 'bash: nope: unbound variable' >&2; false");
    no(SS19, 1, "bash -c \"echo 'bash: nope: unbound variable' >&2; exit 1\"");
    no(SS19, 1, "bash -c 'set -u; echo \"${nope:-x}\"'");
    no(SS19, 1, "bash -c 'set -u; nope=1; echo \"$nope\"'");
  });
  it('19.3 See the whole pipeline\'s status', () => {
    yes(SS19, 2, "bash -c 'set -o pipefail; false | true; echo $?'");
    yes(SS19, 2, "bash -c 'set -o pipefail; false | true'; echo $?");
    yes(SS19, 2, "bash -o pipefail -c 'false | true'; echo $?");
    yes(SS19, 2, "bash -c 'set -o pipefail; false | true'"); // no output, status 1
    yes(SS19, 2, 'set -o pipefail; false | true; echo $?');
    yes(SS19, 2, "bash -c 'set -euo pipefail; ls nope | cat; echo after'; echo $?");
    no(SS19, 2, "bash -c 'false | true; echo $?'");
    no(SS19, 2, 'false | true; echo $?');
    no(SS19, 2, 'echo 1');
    no(SS19, 2, "bash -c 'set -o pipefail; false; echo $?'");
    no(SS19, 2, "bash -c 'set -o pipefail; true | true; echo $?'");
    no(SS19, 2, "bash -c 'set -o pipefail; false || true; echo $?'");
  });
  it('19.4 Trace it', () => {
    yes(SS19, 3, 'set -x; echo hi; set +x');
    yes(SS19, 3, 'set -x; echo hello; set +x');
    yes(SS19, 3, 'set -o xtrace; ls inbox; set +o xtrace');
    yes(SS19, 3, "bash -xc 'echo hi'");
    yes(SS19, 3, "bash -x -c 'echo hi'");
    yes(SS19, 3, 'set -x', 'echo hi'); // tracing still on from the line before
    no(SS19, 3, 'echo hi');
    no(SS19, 3, "echo '+ echo hi' >&2; echo hi");
    no(SS19, 3, 'set -x; set +x');
    no(SS19, 3, 'set +x; echo hi');
    no(SS19, 3, 'set -x; true; set +x');
    no(SS19, 3, 'set -x; echo hi; set +x', 'echo hi');
  });
  it('19.4 tracing is off again after the answer, and a chapter switch turns it off too', () => {
    const { SQ, go } = world(SS19);
    go('set -x; echo hi; set +x');
    assert.equal(SQ.rt.opts.x, false);
    go('set -x');
    assert.equal(SQ.rt.opts.x, true);
    SQ.resetProcs();
    assert.ok(!SQ.rt.opts.x);
  });
  it('19.5 Clean up after yourself', () => {
    yes(SS19, 4, "bash -c \"trap 'echo bye' EXIT; echo hi\"");
    yes(SS19, 4, "bash -c 'trap \"echo bye\" EXIT; echo hi'");
    yes(SS19, 4, "(trap 'echo bye' EXIT; echo hi)");
    yes(SS19, 4, "bash -c \"trap 'echo bye' 0; echo hi\"");
    yes(SS19, 4, "bash -c \"trap 'echo bye' EXIT; echo hi; exit 3\"");
    yes(SS19, 4, "bash -c 'bye() { echo bye; }; trap bye EXIT; echo hi'");
    no(SS19, 4, 'echo hi; echo bye');
    no(SS19, 4, "bash -c \"trap '' EXIT; echo hi; echo bye\"");
    no(SS19, 4, "trap 'echo bye' EXIT; echo hi"); // the prompt's shell does not exit: only hi
    no(SS19, 4, "bash -c 'echo hi; echo bye'");
    no(SS19, 4, "bash -c \"trap 'echo bye' EXIT; echo hi\"; echo extra");
    no(SS19, 4, "bash -c \"trap 'echo hi' EXIT; echo bye\"");
  });
  it('19.6 Script: options (answer, alternatives, wrong ones, failure lines)', () => {
    const { SQ, m, ok, why } = scriptJudge(SS19, 5);
    assert.equal(ok(m.answer), true);
    // the silent form: a leading colon, no message of getopts' own
    assert.equal(ok('#!/bin/bash\nverbose=0\nname=""\nwhile getopts ":vn:" opt; do\n  case "$opt" in\n    v) verbose=1 ;;\n    n) name="$OPTARG" ;;\n    \\?|:) echo "usage: opts.sh [-v] -n NAME" >&2; exit 2 ;;\n  esac\ndone\n[ -n "$name" ] || { echo "usage: opts.sh [-v] -n NAME" >&2; exit 2; }\n[ "$verbose" = 1 ] && echo "verbose on"\necho "Hello, $name!"\n'), true, 'silent getopts');
    assert.equal(ok('#!/bin/bash\nusage() { echo "usage: opts.sh [-v] -n NAME" >&2; exit 2; }\nv=""\nwhile getopts "vn:" o; do\n  case $o in\n    v) v=yes ;;\n    n) name=$OPTARG ;;\n    ?) usage ;;\n  esac\ndone\nshift $((OPTIND - 1))\n[[ -z ${name:-} ]] && usage\nif [[ -n $v ]]; then echo "verbose on"; fi\nprintf "Hello, %s!\\n" "$name"\n'), true, '[[ ]], ?) and printf');
    assert.equal(ok(m.starter), false);
    for (const w of m.wrong) assert.equal(ok(w), false, w);
    // a hand-made parser passes every case, but the lesson is getopts
    const hand = '#!/bin/bash\nusage() { echo "usage: opts.sh [-v] -n NAME" >&2; exit 2; }\nv=0\nname=""\nwhile [ "$#" -gt 0 ]; do\n  case "$1" in\n    -v) v=1 ;;\n    -vn) v=1; [ "$#" -ge 2 ] || usage; name="$2"; shift ;;\n    -n) [ "$#" -ge 2 ] || usage; name="$2"; shift ;;\n    *) usage ;;\n  esac\n  shift\ndone\n[ -n "$name" ] || usage\n[ "$v" -eq 1 ] && echo "verbose on"\necho "Hello, $name!"\n';
    put(SQ, m, hand);
    assert.equal(SQ.ctxFor('').scriptPasses(m).ok, true, 'the cases alone pass the hand-made parser');
    assert.equal(ok(hand), false);
    put(SQ, m, hand);
    const v = SQ.missionVerdict(m, SQ.ctxFor(''), true);
    assert.equal(SQ.scriptFailLine(m, v.failed), 'The output is right, but read the options with getopts "vn:" in a while loop.');
    assert.equal(ok(hand.replace('#!/bin/bash\n', '#!/bin/bash\n# getopts "vn:" would be shorter\n')), false, 'getopts only in a comment');
    assert.equal(why(m.wrong[0]), 'Test 1 (-n Ada) failed: expected "Hello, Ada!", got ""');
    assert.equal(why(m.wrong[1]), 'Test 4 (no arguments) failed: expected "", got "usage: opts.sh [-v] -n NAME"');
    assert.equal(why(m.wrong[3]), 'Test 4 (no arguments) failed: expected "", got "Hello, !"');
    assert.equal(why(m.wrong[5]), 'Test 2 (-v -n Ada) failed: expected "verbose on\\nHello, Ada!", got "verbose on\\nHello, -n!"');
    // through the terminal: getopts' own message comes first, then the usage line, both on stderr
    put(SQ, m, m.answer);
    assert.equal(run(SQ, 'bash scripts/opts.sh -vn Ada').out, 'verbose on\nHello, Ada!');
    const r = SQ.execLine('bash scripts/opts.sh -x');
    assert.ok(r.out.every((o) => o.cls !== 'out'), 'both lines are on stderr');
    assert.equal(r.out.map((o) => o.text.replace(/\n$/, '')).join('\n'), 'scripts/opts.sh: illegal option -- x\nusage: opts.sh [-v] -n NAME');
    assert.equal(SQ.S.last, 2);
    assert.equal(run(SQ, 'bash scripts/opts.sh -n').out, 'scripts/opts.sh: option requires an argument -- n\nusage: opts.sh [-v] -n NAME');
  });
  it('19.7 Capstone: a robust log tool (answer, alternatives, wrong ones, failure lines)', () => {
    const { SQ, m, ok, why } = scriptJudge(SS19, 6);
    assert.equal(m.kind, 'challenge');
    assert.ok(m.tests.every((t) => JSON.stringify(t.expectEmpty) === '["/tmp"]'), 'expectEmpty /tmp on every case');
    assert.deepEqual(JSON.parse(JSON.stringify(m.tests.map((t) => [t.args, t.expectOut, t.expectCode ?? 0]))), [
      [['village/logs/all.log'], '3 10.0.0.5\n3 10.0.0.7\n1 10.0.0.12', 0],
      [['-l', 'WARN', '-n', '1', 'village/logs/all.log'], '1 10.0.0.12', 0],
      [['-n', '2', 'village/logs/all.log'], '3 10.0.0.5\n3 10.0.0.7', 0],
      [['-l', 'DEBUG', 'village/logs/all.log'], '', 0],
      [['nowhere.log'], '', 1],
      [['-x', 'village/logs/all.log'], '', 2]]);
    assert.equal(ok(m.answer), true);
    // Task 15's logtool.sh (opts.test.mjs), with the tie order of topn.sh: ${1:?} and a function-free trap
    const t15 = ['#!/bin/bash', 'set -euo pipefail', 'level=ERROR', 'n=3', 'usage() { echo "usage: logtool.sh [-l LEVEL] [-n N] FILE" >&2; exit 2; }',
      'while getopts "l:n:" opt; do', '  case $opt in', '    l) level=$OPTARG ;;', '    n) n=$OPTARG ;;', '    *) usage ;;', '  esac', 'done',
      'shift $((OPTIND - 1))', 'file=${1:?usage: logtool.sh [-l LEVEL] [-n N] FILE}', 'if [ ! -r "$file" ]; then echo "error: cannot read $file" >&2; exit 1; fi',
      'tmp=$(mktemp)', 'trap \'rm -f "$tmp"\' EXIT', 'grep -- "$level" "$file" > "$tmp" || true',
      'awk \'{ print $1 }\' "$tmp" | sort | uniq -c | sort -k1,1nr -k2,2 | head -n "$n" | sed \'s/^ *//\''].join('\n');
    assert.equal(ok(t15), true, 'Task 15 logtool with the tie order');
    assert.equal(ok(t15.replace('sort -k1,1nr -k2,2', 'sort -rn')), false, 'Task 15 logtool as it was: sort -rn turns the ties round');
    // set -e -u -o pipefail apart, a cleanup function, awk doing the filtering
    const alt = '#!/bin/bash\nset -e\nset -u\nset -o pipefail\ncleanup() {\n  rm -f "$work"\n}\nlevel=ERROR\nn=3\nwhile getopts ":l:n:" o; do\n  case "$o" in\n    l) level="$OPTARG" ;;\n    n) n="$OPTARG" ;;\n    *) echo "usage: logtool.sh [-l LEVEL] [-n N] FILE" >&2; exit 2 ;;\n  esac\ndone\nshift $((OPTIND - 1))\nif [[ ! -r ${1:-} ]]; then echo "error: cannot read ${1:-}" >&2; exit 1; fi\nwork=$(mktemp)\ntrap cleanup EXIT\nawk -v l="$level" \'index($0, l) {print $1}\' "$1" > "$work"\nsort "$work" | uniq -c | sort -k1,1nr -k2,2 | head -n "$n" | awk \'{print $1, $2}\'\n';
    assert.equal(ok(alt), true, 'separate set lines, a cleanup function, awk filtering');
    assert.equal(ok(m.starter), false);
    for (const w of m.wrong) assert.equal(ok(w), false, w);
    assert.equal(why(m.wrong[0]), 'Test 1 (all.log, the defaults) failed: expected "/tmp empty", got "/tmp holds tmp.A00001"', 'no trap: the temp file stays');
    assert.equal(why(m.wrong[1]), 'Test 2 (-l WARN -n 1) failed: expected "1 10.0.0.12", got "1 10.0.0.12\\n1 10.0.0.9"', '-n ignored');
    assert.equal(why(m.wrong[2]), 'Test 5 (a missing file) failed: expected "exit status 1", got "exit status 0 (error: cannot read nowhere.log)"');
    assert.equal(why(m.wrong[3]), 'Test 5 (a missing file) failed: expected "error: cannot read nowhere.log", got "awk: can\'t open file nowhere.log"', 'no set -e: awk fails and the script carries on');
    assert.equal(why(m.wrong[4]), 'Test 4 (a level with no lines) failed: expected "exit status 0", got "exit status 1"', 'grep without || true under set -e');
    // the cases pass but the habits are missing: the check names them
    const loose = [m.answer.replace('set -euo pipefail\n', ''), m.answer.replace('tmp=$(mktemp)', 'tmp=/tmp/logtool.work; : > "$tmp"'),
      m.answer.replace('set -euo pipefail', 'set -eu'), m.answer.replace('trap \'rm -f "$tmp"\' EXIT\n', '').replace(/\n$/, '\nrm -f "$tmp"\n')];
    for (const t of loose) {
      put(SQ, m, t);
      assert.equal(SQ.ctxFor('').scriptPasses(m).ok, true, `cases pass: ${t}`);
      assert.equal(ok(t), false, t);
      put(SQ, m, t);
      const v = SQ.missionVerdict(m, SQ.ctxFor(''), true);
      assert.equal(SQ.scriptFailLine(m, v.failed), 'The tests pass, but a robust tool also needs set -euo pipefail, getopts, a mktemp work file and a trap ... EXIT.');
    }
    // the learner's own /tmp leftovers and an edited all.log do not matter: each case starts clean
    run(SQ, 'mktemp; mktemp; echo junk > village/logs/all.log');
    assert.equal(ok(m.answer), true);
    assert.equal(SQ.ctxFor('').tmpFiles().length, 2, 'the learner\'s /tmp is left as it was');
  });
  it('19.7 through the terminal: the report, a clean /tmp, the error and usage paths', () => {
    const { SQ, m } = scriptJudge(SS19, 6);
    put(SQ, m, m.answer);
    assert.equal(run(SQ, 'bash scripts/logtool.sh village/logs/all.log').out, '3 10.0.0.5\n3 10.0.0.7\n1 10.0.0.12');
    assert.deepEqual([...SQ.ctxFor('').tmpFiles()], []);
    assert.equal(run(SQ, 'bash scripts/logtool.sh -l WARN village/logs/all.log').out, '1 10.0.0.12\n1 10.0.0.9');
    assert.equal(run(SQ, 'bash scripts/logtool.sh -l DEBUG village/logs/all.log; echo "status $?"').out, 'status 0');
    assert.equal(run(SQ, 'bash scripts/logtool.sh nowhere.log; echo "status $?"').out, 'error: cannot read nowhere.log\nstatus 1');
    assert.equal(run(SQ, 'bash scripts/logtool.sh -q village/logs/all.log; echo "status $?"').out, 'scripts/logtool.sh: illegal option -- q\nusage: logtool.sh [-l LEVEL] [-n N] FILE\nstatus 2');
    assert.deepEqual([...SQ.ctxFor('').tmpFiles()], [], 'no path leaves a work file');
  });
  it('chapter 19 missions pass in order in one world (each line judged on its own), as a learner plays them', () => {
    const SQ = loadShell();
    const ch = SQ.content.chapters[SS19];
    SQ.setupChapter(ch);
    for (const m of ch.missions.slice(0, 5)) {
      run(SQ, m.answer);
      assert.ok(m.check(SQ.ctxFor(m.answer)), m.title);
    }
  });
});

describe('expert explanations, chapters 18 and 19: every claim re-run in the harness', () => {
  it('18.1: the pattern leaves readme.md out; {} + hands every path to one command', () => {
    const { go } = world(PM18);
    assert.doesNotMatch(go("find inbox -name '*.txt'").out, /readme/);
    assert.match(go('find inbox').out, /readme\.md/);
    assert.equal(go("find inbox -name '*.txt' -exec echo {} +").out, 'inbox/a.txt inbox/b.txt inbox/c.txt');
    assert.equal(go("find inbox -name '*.txt' -exec echo {} \\;").out, 'inbox/a.txt\ninbox/b.txt\ninbox/c.txt');
  });
  it('18.2: -I runs cp once per line; without -I one wc gets every file; -t shows the commands', () => {
    const { go } = world(PM18);
    const r = go('ls inbox/*.txt | xargs -t -I{} cp {} archive/');
    assert.equal(r.c.err(), 'cp inbox/a.txt archive/\ncp inbox/b.txt archive/\ncp inbox/c.txt archive/');
    assert.equal(go('ls inbox/*.txt | xargs -t wc -l').c.err(), 'wc -l inbox/a.txt inbox/b.txt inbox/c.txt');
  });
  it('18.3: -n1 gives one word per command; without it, job 1 2 3; this shell runs -P jobs in order', () => {
    const { go } = world(PM18);
    assert.equal(go('echo 1 2 3 | xargs -n1 -P3 echo job').out, 'job 1\njob 2\njob 3');
    assert.equal(go('echo 1 2 3 | xargs -P3 echo job').out, 'job 1 2 3');
    assert.equal(go('echo 3 1 2 | xargs -n1 -P3 echo job').out, 'job 3\njob 1\njob 2', 'one after another, in input order');
  });
  it('18.4: <( ) is a /dev/fd name; 2a3 adds kiwi, 4d4 deletes plum; unsorted, nearly every line differs', () => {
    const { go } = world(PM18);
    assert.equal(go('echo <(true)').out, '/dev/fd/63');
    const r = go('diff <(sort lists/a.txt) <(sort lists/b.txt)');
    assert.equal(r.out, '2a3\n> kiwi\n4d4\n< plum');
    assert.equal(r.c.status(), 1);
    assert.ok(go('diff lists/a.txt lists/b.txt').out.split('\n').filter((l) => /^[<>]/.test(l)).length >= 6);
  });
  it('18.5: the piped loop counts in a copy (empty); fed by < <( ) or < file it keeps 3', () => {
    const { go } = world(PM18);
    assert.equal(go('cat inbox/a.txt | while read l; do n=$((n+1)); done; echo "$n"').out, '');
    assert.equal(go('while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo "$n"').out, '3');
    assert.equal(go('unset n; while read l; do n=$((n+1)); done < inbox/a.txt; echo "$n"').out, '3');
  });
  it('18.6: without the first sort every address counts 1; 4 for 10.0.0.5, 3 each for .7 and .9', () => {
    const { go } = world(PM18);
    assert.ok(go("awk '{print $1}' village/logs/access.log | uniq -c").out.split('\n').every((l) => /^\s*1 /.test(l)));
    assert.equal(go("sort village/logs/access.log | awk '{print $1}' | uniq -c | sort -rn | head -3").out, '      4 10.0.0.5\n      3 10.0.0.9\n      3 10.0.0.7');
  });
  it('18.7: sort -rn turns a tie round, -k1,1nr -k2,2 keeps it in order; uniq -c pads; an empty file prints nothing', () => {
    const { go } = world(PM18);
    assert.equal(go("awk '{print $1}' village/logs/access.log | sort | uniq -c | sort -rn | head -n 3 | awk '{print $1, $2}'").out, '4 10.0.0.5\n3 10.0.0.9\n3 10.0.0.7');
    assert.equal(go("awk '{print $1}' village/logs/access.log | sort | uniq -c | sort -k1,1nr -k2,2 | head -n 3 | awk '{print $1, $2}'").out, '4 10.0.0.5\n3 10.0.0.7\n3 10.0.0.9');
    assert.match(go("echo a | uniq -c").out, /^ +1 a$/);
    assert.equal(go(": > empty.txt; awk '{print $1}' empty.txt | sort | uniq -c").out, '');
  });
  it('19.1: set -e stops after false with status 1; without it, after and 0; a tested command does not stop it', () => {
    const { go } = world(SS19);
    assert.equal(go("bash -c 'set -e; false; echo after'; echo $?").out, '1');
    assert.equal(go("bash -c 'false; echo after'; echo $?").out, 'after\n0');
    assert.equal(go("bash -c 'set -e; false || echo saved; echo after'").out, 'saved\nafter');
  });
  it('19.2: the error text, status 1, the script stops; an unset variable is empty without -u; a default still works', () => {
    const { go } = world(SS19);
    const r = go("bash -c 'set -u; echo \"$nope\"; echo after'");
    assert.equal(r.out, 'bash: nope: unbound variable');
    assert.equal(r.c.status(), 1);
    assert.equal(r.c.err(), 'bash: nope: unbound variable');
    assert.equal(go("bash -c 'echo \"[$nope]\"'").out, '[]');
    assert.equal(go("bash -c 'set -u; echo \"${nope:-none}\"'").out, 'none');
  });
  it('19.3: false | true is 0; with pipefail 1; set -euo pipefail stops on it', () => {
    const { go } = world(SS19);
    assert.equal(go('false | true; echo $?').out, '0');
    assert.equal(go("bash -c 'set -o pipefail; false | true; echo $?'").out, '1');
    const r = go("bash -c 'set -euo pipefail; false | true; echo after'");
    assert.equal(r.out, '');
    assert.equal(r.c.status(), 1);
  });
  it('19.4: the trace shows the expanded command; set +x is traced; bash -x traces a script', () => {
    const { SQ, go } = world(SS19);
    assert.equal(go('name=Ada; set -x; echo "hi $name"; set +x').out, "+ echo 'hi Ada'\nhi Ada\n+ set +x");
    put(SQ, SQ.content.chapters[SS19].missions[5], SQ.content.chapters[SS19].missions[5].answer);
    const r = go('bash -x scripts/opts.sh -n Ada');
    assert.match(r.c.err(), /^\+ /m);
    assert.match(r.c.err(), /\+ echo 'Hello, Ada!'/);
    assert.equal(r.c.out(), 'Hello, Ada!');
  });
  it('19.5: the trap runs after exit 3 and after a set -e stop; mktemp + trap leave /tmp empty', () => {
    const { SQ, go } = world(SS19);
    assert.equal(go("bash -c \"trap 'echo bye' EXIT; exit 3\"; echo $?").out, 'bye\n3');
    assert.equal(go("bash -c \"set -e; trap 'echo bye' EXIT; false; echo after\"").out, 'bye');
    assert.equal(go('bash -c \'tmp=$(mktemp); trap "rm -f \\"$tmp\\"" EXIT; echo "made $tmp"\'').out, 'made /tmp/tmp.A00001');
    assert.deepEqual([...SQ.ctxFor('').tmpFiles()], []);
  });
  it('19.6: shift $((OPTIND - 1)) leaves the first word after the options in $1', () => {
    const { go } = world(SS19);
    assert.equal(go("bash -c 'while getopts \"v\" o; do :; done; shift $((OPTIND - 1)); echo \"$1\"' x -v file.txt").out, 'file.txt');
  });
});
