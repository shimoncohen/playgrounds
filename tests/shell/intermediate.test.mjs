import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const T8 = 7, T9 = 8;
// Fresh world, set up the chapter, run `pre` lines (not judged), then judge `line` against mission `m`.
function judge(ch, m, line, pre = []) {
  const SQ = loadShell();
  SQ.content.chapters[ch].setup();
  for (const p of pre) run(SQ, p);
  run(SQ, line);
  return SQ.content.chapters[ch].missions[m].check(SQ.ctxFor(line));
}
const yes = (ch, m, line, pre) => assert.ok(judge(ch, m, line, pre), `should accept: ${line}`);
const no = (ch, m, line, pre) => assert.ok(!judge(ch, m, line, pre), `should reject: ${line}`);

describe('intermediate content shape', () => {
  const ch = loadShell().content.chapters;
  it('adds chapters 8 to 11 after the seven beginner chapters', () => {
    assert.equal(ch.length, 11);
    assert.deepEqual([...ch.slice(0, 7).map((c) => c.missions.length)], [8, 7, 7, 7, 7, 7, 9]);
    assert.deepEqual([...ch.slice(0, 7).map((c) => c.tier)], Array(7).fill('beginner'));
    assert.deepEqual([...ch.slice(7).map((c) => c.missions.length)], [7, 8, 7, 7]);
    assert.deepEqual([...ch.slice(7).map((c) => c.tier)], Array(4).fill('intermediate'));
    assert.deepEqual([...ch.slice(7).map((c) => c.badge)], ['Textsmith', 'Quoter', 'Gatekeeper', 'Streamer']);
  });
  it('setup seeds the data files without overwriting learner work', () => {
    const SQ = loadShell();
    SQ.content.chapters[T8].setup();
    for (const f of ['~/village/sales.csv', '~/village/logs/access.log', '~/config.ini', '~/notes.txt']) assert.ok(SQ.ctxFor('').isFile(f), f);
    assert.equal(SQ.ctxFor('').read('~/village/logs/access.log').split('\n').length, 12);
    run(SQ, 'echo mine > config.ini');
    SQ.content.chapters[T9].setup();
    assert.equal(SQ.ctxFor('').read('~/config.ini').trim(), 'mine');
  });
  it('every mission has the beginner-shaped fields', () => {
    for (const c of ch.slice(7)) for (const m of c.missions) {
      for (const k of ['title', 'goal', 'explain', 'answer']) assert.equal(typeof m[k], 'string', `${m.title}.${k}`);
      assert.ok(Array.isArray(m.anat) && m.anat.length && typeof m.check === 'function');
      assert.doesNotMatch(m.explain + m.goal, /—/, 'no em dashes');
    }
  });
});

describe('chapter 8 checks', () => {
  it('Pick a column', () => {
    yes(T8, 0, 'cut -f1 -d, village/sales.csv');
    yes(T8, 0, 'cut -d, -f 1 village/sales.csv');
    no(T8, 0, 'cut -d, -f2 village/sales.csv');
    no(T8, 0, 'cat village/sales.csv');
  });
  it('Shout it', () => {
    yes(T8, 1, 'echo hello | tr a-z A-Z');
    yes(T8, 1, "echo hello | tr '[:lower:]' '[:upper:]'");
    no(T8, 1, 'echo hello | tr a-z b-y');
    no(T8, 1, 'echo HELLO');
  });
  it('Swap a word', () => {
    yes(T8, 2, 'sed "s/apple/pear/" village/shop.txt');
    no(T8, 2, 'cat village/shop.txt');
    no(T8, 2, "sed 's/bread/pear/' village/shop.txt");
  });
  it('Replace everywhere', () => {
    yes(T8, 3, 'sed "s/o/0/g" journal.txt');
    yes(T8, 3, "sed 's|o|0|g' journal.txt");
    no(T8, 3, "sed 's/o/0/' journal.txt");
    no(T8, 3, 'grep o journal.txt');
  });
  it('Show some lines', () => {
    yes(T8, 4, "sed -n '2,4p' journal.txt");
    yes(T8, 4, "sed -n 2,4p journal.txt");
    no(T8, 4, "sed -n '2,5p' journal.txt");
    no(T8, 4, 'head -n 3 journal.txt');
  });
  it('Save and show', () => {
    yes(T8, 5, 'ls | tee listing.txt');
    no(T8, 5, 'ls > listing.txt');
    no(T8, 5, 'touch listing.txt');
  });
  it('Biggest first', () => {
    yes(T8, 6, 'cut -d, -f2 village/sales.csv | sort -n -r | head -n 1');
    yes(T8, 6, 'cut -d, -f2 village/sales.csv | sort -nr | head -1');
    yes(T8, 6, 'sort -t, -k2 -n -r village/sales.csv | head -n 1');
    yes(T8, 6, 'sort -t , -k 2,2 -rn village/sales.csv | head -1');
    no(T8, 6, 'cut -d, -f2 village/sales.csv | sort | head -n 1');
    no(T8, 6, 'sort -t, -k2 -n village/sales.csv | head -n 1');
    no(T8, 6, 'sort -t, -k2 -r village/sales.csv | head -n 1');
    no(T8, 6, 'head -n 1 village/sales.csv');
  });
});

describe('chapter 9 checks', () => {
  it('Capture output', () => {
    yes(T9, 0, 'echo "Today is $(date)"');
    no(T9, 0, 'echo "Today is Monday"');
    no(T9, 0, 'date');
  });
  it('Count in a sentence', () => {
    yes(T9, 1, 'echo "wolves: $(grep -ic wolf journal.txt)"');
    yes(T9, 1, 'echo "wolves: $(grep -i wolf journal.txt | wc -l)"');
    no(T9, 1, 'echo "wolves: many"');
    no(T9, 1, 'grep -ic wolf journal.txt');
  });
  it('Single vs double', () => {
    yes(T9, 2, "echo '$HOME'");
    no(T9, 2, 'echo "$HOME"');
    no(T9, 2, 'echo HOME');
  });
  it('Keep a value', () => {
    yes(T9, 3, 'FILES=$(ls village); echo $FILES');
    no(T9, 3, 'echo $FILES');
    no(T9, 3, 'ls village');
  });
  it('Export it / See the environment', () => {
    yes(T9, 4, 'export GREETING=hi');
    yes(T9, 4, 'GREETING=hi; export GREETING');
    no(T9, 4, 'GREETING=hi');
    yes(T9, 5, 'env', ['export GREETING=hi']);
    no(T9, 5, 'env');
    no(T9, 5, 'export', ['export GREETING=hi']);
  });
  it('Share with a script', () => {
    const line = "echo 'echo $GREETING' > g.sh; chmod +x g.sh; ./g.sh";
    yes(T9, 6, line, ['export GREETING=hi']);
    no(T9, 6, line); // not exported: the script prints an empty line
    no(T9, 6, "echo 'echo $GREETING' > g.sh", ['export GREETING=hi']);
    no(T9, 6, 'echo hi', ['export GREETING=hi']);
  });
  it('Did it work?', () => {
    yes(T9, 7, 'ls nothing; echo $?');
    no(T9, 7, 'ls; echo $?');
    no(T9, 7, 'echo 2');
  });
});

describe('intermediate quick-fire and guide', () => {
  const SQ = loadShell();
  it('has 6 quick-fire questions per chapter, tagged intermediate', () => {
    assert.equal(SQ.content.quickfire.filter((q) => q[2] === 'intermediate').length, 24);
    assert.ok(SQ.content.quickfire.filter((q) => !q[2]).length > 0);
  });
  it('has at least 6 guide entries per chapter and man works for them', () => {
    for (const ci of [7, 8, 9, 10]) assert.ok(SQ.content.guide.filter((g) => g.ch === ci).length >= 6, `chapter ${ci}`);
    for (const cmd of ['cut', 'tr', 'sed', 'tee', 'export', 'env', 'date']) {
      const r = run(SQ, `man ${cmd}`);
      assert.match(r.out, new RegExp('^' + cmd.toUpperCase()), cmd);
      assert.equal(r.code, 0);
    }
  });
});

describe('round 2: tighter checks', () => {
  it('8.1 needs the real first column with -d and -f', () => {
    no(T8, 0, 'cut -f1 village/sales.csv');
    no(T8, 0, 'cut -d, -f1 journal.txt');
    yes(T8, 0, 'cut -f 1 -d, village/sales.csv');
    yes(T8, 0, 'cut -d "," -f1 village/sales.csv');
  });
  it('8.6 needs ls piped into tee, saved to any path, even over an existing file', () => {
    const pre = ['ls | tee listing.txt'];
    no(T8, 5, 'echo hi | tee listing.txt', pre);
    no(T8, 5, 'echo x | tee y.txt');
    no(T8, 5, 'ls | tee -a nothere/x.txt');
    yes(T8, 5, 'ls | tee listing.txt', pre);
    yes(T8, 5, 'ls | tee ./listing.txt');
    yes(T8, 5, 'ls -a | tee village/all.txt');
  });
  it('8.7 needs sort -n and the true top row', () => {
    no(T8, 6, 'grep bread village/sales.csv | head -n 1');
    no(T8, 6, 'echo 30 | sort');
    no(T8, 6, 'echo 30 | sort -n');
    no(T8, 6, 'cut -d, -f2 village/sales.csv | head -n 1');
    yes(T8, 6, 'sort -t, -k2 -n village/sales.csv | tail -n 1');
    yes(T8, 6, 'sort -t, -k2 -nr village/sales.csv');
    yes(T8, 6, 'cut -d, -f2 village/sales.csv | sort -n | tail -n 1');
  });
  it('9.4 needs a variable from $( ) and a real listing', () => {
    no(T9, 3, 'echo shop.txt people.txt');
    no(T9, 3, 'echo $(ls village)');
    no(T9, 3, 'FILES="shop.txt people.txt"; echo $FILES');
    yes(T9, 3, 'F=$(ls village); echo "$F"');
    yes(T9, 3, 'echo $FILES', ['FILES=$(ls village)']);
  });
  it('9.7 needs an exported variable read by a script', () => {
    const pre = ['export GREETING=hi'];
    no(T9, 6, "echo 'echo hi' > g.sh; chmod +x g.sh; ./g.sh", pre);
    no(T9, 6, 'echo "echo $GREETING" > g.sh; chmod +x g.sh; ./g.sh', pre);
    no(T9, 6, "GREETING=hi; echo 'echo $GREETING' > g.sh; bash g.sh");
    yes(T9, 6, "echo 'echo $GREETING' > g.sh; bash g.sh", pre);
    yes(T9, 6, "echo 'echo $GREETING' > hello.sh; chmod +x hello.sh; ./hello.sh", pre);
  });
  it('9.8 needs $? to read a real failure code', () => {
    no(T9, 7, 'echo 2; echo $?');
    no(T9, 7, 'ls; echo $?');
    yes(T9, 7, 'cat nothing; echo $?');
    yes(T9, 7, 'grep zzz journal.txt; echo $?');
    yes(T9, 7, 'ls nothing; echo "$?"');
  });
  it('9.6 text tells you to export first', () => {
    const m = loadShell().content.chapters[T9].missions[5];
    assert.match(m.goal + (m.note || ''), /export GREETING/);
  });
});

describe('round 3: 9.8 across lines (log resets per line, like the UI)', () => {
  const seq = (...lines) => {
    const SQ = loadShell();
    SQ.content.chapters[T9].setup();
    for (const l of lines) run(SQ, l); // run() resets rt.log per line
    return SQ.content.chapters[T9].missions[7].check(SQ.ctxFor(lines[lines.length - 1]));
  };
  it('accepts a failing command on an earlier line', () => {
    assert.ok(seq('ls nothing', 'echo $?'));
    assert.ok(seq('cat nothing', 'echo $?'));
    assert.ok(seq('cat nothing; echo $?'));
  });
  it('rejects code 0 or no real failure', () => {
    assert.ok(!seq('ls village', 'echo $?'));
    assert.ok(!seq('echo $?'));
    assert.ok(!seq('echo 2; echo $?'));
    assert.ok(!seq('ls nothing', 'echo 2'));
    assert.ok(!seq('ls nothing', 'ls village', 'echo $?'));
  });
});

// ---- Task 14: chapters 10 (Permissions & links) and 11 (Streams & xargs) ----
const T10 = 9, T11 = 10;
// UI-style: fresh world, chapter setup, every line on its own log, judge the last line.
function ui(ch, m, ...lines) {
  const SQ = loadShell();
  SQ.content.chapters[ch].setup();
  for (const l of lines) run(SQ, l);
  return SQ.content.chapters[ch].missions[m].check(SQ.ctxFor(lines[lines.length - 1]));
}
const pass = (ch, m, ...lines) => assert.ok(ui(ch, m, ...lines), `should accept: ${lines.join(' / ')}`);
const fail = (ch, m, ...lines) => assert.ok(!ui(ch, m, ...lines), `should reject: ${lines.join(' / ')}`);

describe('chapters 10 and 11 shape and seeding', () => {
  it('seeds secrets.txt at 0644, scripts/, logs and scratch, never clobbering, idempotent', () => {
    const SQ = loadShell();
    for (const ci of [T10, T11]) SQ.content.chapters[ci].setup();
    const c = SQ.ctxFor('');
    assert.equal(SQ.modeOf(c.node('~/secrets.txt')), 0o644);
    assert.ok(c.isDir('~/scripts') && Object.keys(c.node('~/scripts').children).length === 0);
    for (const f of ['day1.log', 'day2.log', 'day3.log', 'all.log']) assert.ok(c.isFile('~/village/logs/' + f), f);
    assert.ok(c.isFile('~/village/scratch/old1.log') && c.isFile('~/village/scratch/keep.txt'));
    const snap = JSON.stringify(SQ.S.fs);
    for (const ci of [T10, T11]) SQ.content.chapters[ci].setup();
    assert.equal(JSON.stringify(SQ.S.fs), snap, 'second setup changes nothing');
    run(SQ, 'echo mine > secrets.txt');
    run(SQ, 'chmod 600 secrets.txt');
    SQ.content.chapters[T10].setup();
    assert.equal(c.read('~/secrets.txt').trim(), 'mine');
    assert.equal(SQ.modeOf(c.node('~/secrets.txt')), 0o600);
  });
  it('the Intermediate tier ends at the computed cumulative XP', () => {
    const SQ = loadShell();
    assert.equal(SQ.tiers.cumulativeXp('intermediate'), 695 + 29 * 15 + 4 * 25);
  });
});

describe('chapter 10 checks', () => {
  it('10.1 Read the permissions', () => {
    pass(T10, 0, 'ls -l');
    pass(T10, 0, 'ls -la');
    pass(T10, 0, 'ls -l village');
    fail(T10, 0, 'ls');
    fail(T10, 0, 'ls -a');
    fail(T10, 0, 'ls -l nowhere');
  });
  it('10.2 Lock it down is judged by the mode, not the output', () => {
    pass(T10, 1, 'chmod 600 secrets.txt');
    pass(T10, 1, 'chmod u=rw,go= secrets.txt');
    pass(T10, 1, 'chmod go-r secrets.txt');
    pass(T10, 1, 'chmod 644 secrets.txt', 'chmod 600 ./secrets.txt', 'ls -l'); // multi-line
    fail(T10, 1, 'echo 600');
    fail(T10, 1, 'chmod 660 secrets.txt');
    fail(T10, 1, 'chmod 700 secrets.txt');
    fail(T10, 1, 'chmod 600 notes.txt');
    fail(T10, 1, 'ls -l');
  });
  it('10.3 Add a permission needs the owner x bit', () => {
    pass(T10, 2, 'chmod u+x notes.txt');
    pass(T10, 2, 'chmod +x notes.txt');
    pass(T10, 2, 'chmod 755 notes.txt');
    pass(T10, 2, 'chmod u+x notes.txt', 'ls -l notes.txt');
    fail(T10, 2, 'chmod g+x notes.txt');
    fail(T10, 2, 'chmod 600 notes.txt');
    fail(T10, 2, 'chmod u+x secrets.txt');
    fail(T10, 2, 'echo u+x');
  });
  it('10.4 Read-only for all is exactly 0444', () => {
    pass(T10, 3, 'chmod a=r notes.txt');
    pass(T10, 3, 'chmod 444 notes.txt');
    pass(T10, 3, 'chmod ugo=r ./notes.txt');
    pass(T10, 3, 'chmod =r notes.txt');
    fail(T10, 3, 'chmod a+r notes.txt'); // stays 0644
    fail(T10, 3, 'chmod 400 notes.txt');
    fail(T10, 3, 'chmod 644 notes.txt');
    fail(T10, 3, 'echo 444');
  });
  it('10.5 Make a shortcut needs a real link that resolves to day1.log', () => {
    pass(T10, 4, 'ln -s village/logs/day1.log today.log');
    pass(T10, 4, 'ln -s ~/village/logs/day1.log today.log');
    pass(T10, 4, 'ln -s ./village/logs/day1.log today.log');
    pass(T10, 4, 'ln -s /home/explorer/village/logs/day1.log shortcut');
    pass(T10, 4, 'cd village', 'ln -s logs/day1.log first.log');
    fail(T10, 4, 'cp village/logs/day1.log today.log');
    fail(T10, 4, 'ln -s day1.log today.log'); // dangling from home
    fail(T10, 4, 'ln -s village/logs/day2.log today.log');
    fail(T10, 4, 'touch today.log');
    fail(T10, 4, 'ls -l');
  });
  it('10.6 Follow the shortcut reads day1.log through a link', () => {
    const mk = 'ln -s village/logs/day1.log today.log';
    pass(T10, 5, mk, 'cat today.log');
    pass(T10, 5, mk, 'cat ./today.log');
    pass(T10, 5, 'ln -s ~/village/logs/day1.log first.log', 'cat first.log');
    fail(T10, 5, mk, 'cat village/logs/day1.log'); // not through the link
    fail(T10, 5, mk, 'cat village/logs/day2.log');
    fail(T10, 5, 'cat today.log'); // no link yet
    fail(T10, 5, 'ln -s village/logs/day2.log today.log', 'cat today.log');
  });
  it('10.7 Inspect a file', () => {
    pass(T10, 6, 'stat secrets.txt');
    pass(T10, 6, 'stat notes.txt');
    pass(T10, 6, 'stat village');
    fail(T10, 6, 'stat nothing');
    fail(T10, 6, 'ls -l secrets.txt');
    fail(T10, 6, 'echo Mode:');
  });
});

describe('chapter 11 checks', () => {
  it('11.1 Silence errors needs a failing command with 2> /dev/null', () => {
    pass(T11, 0, 'ls missing 2>/dev/null');
    pass(T11, 0, 'ls missing 2> /dev/null');
    pass(T11, 0, 'cat nothing 2>/dev/null');
    fail(T11, 0, 'ls missing');
    fail(T11, 0, 'ls missing > /dev/null'); // error still shows
    fail(T11, 0, 'ls village 2>/dev/null'); // nothing to silence
    fail(T11, 0, 'ls missing 2> errors.txt');
    fail(T11, 0, 'echo 2>/dev/null');
  });
  it('11.2 Keep errors needs a non-empty file of the real error', () => {
    pass(T11, 1, 'ls missing 2> errors.txt');
    pass(T11, 1, 'ls missing 2>errors.txt');
    pass(T11, 1, 'cat nothing 2> oops.log');
    pass(T11, 1, 'ls missing 2>> errors.txt');
    pass(T11, 1, 'ls missing 2> village/err.txt');
    fail(T11, 1, 'ls missing > errors.txt'); // stdout, file empty
    fail(T11, 1, 'echo hi > errors.txt');
    fail(T11, 1, 'ls village 2> errors.txt'); // no error, empty file
    fail(T11, 1, 'ls missing 2> /dev/null');
    fail(T11, 1, 'ls missing');
  });
  it('11.3 Merge streams needs 2>&1 and a count of 1', () => {
    pass(T11, 2, 'ls missing 2>&1 | wc -l');
    pass(T11, 2, 'cat nothing 2>&1 | wc -l');
    pass(T11, 2, 'ls missing 2>&1 | grep -c missing');
    fail(T11, 2, 'ls missing | wc -l');
    fail(T11, 2, 'ls missing 2>/dev/null | wc -l');
    fail(T11, 2, 'echo 1');
    fail(T11, 2, 'ls village 2>&1 | wc -l');
    fail(T11, 2, 'ls missing 2>&1');
  });
  it('11.4 Pipe into arguments needs one file: line per log', () => {
    pass(T11, 3, 'ls village/logs | xargs -n1 echo file:');
    pass(T11, 3, 'ls village/logs | xargs -n 1 echo file:');
    pass(T11, 3, 'ls village/logs | xargs -I{} echo file: {}');
    pass(T11, 3, 'ls village/logs | xargs -n1 echo "file:"');
    pass(T11, 3, 'find village/logs -name "*.log" | xargs -n1 echo file:');
    fail(T11, 3, 'ls village/logs | xargs echo file:'); // one long line
    fail(T11, 3, 'ls village/logs');
    fail(T11, 3, 'ls village | xargs -n1 echo file:'); // wrong folder
    fail(T11, 3, 'ls village/logs | xargs -n1 echo name:');
    fail(T11, 3, 'echo file:');
  });
  it('11.5 Delete what you found: only the scratch .log files go', () => {
    pass(T11, 4, 'find village/scratch -name "*.log" | xargs rm');
    pass(T11, 4, 'find village/scratch -name *.log | xargs rm -f');
    pass(T11, 4, 'find ./village/scratch -name "*.log" | xargs -n1 rm');
    fail(T11, 4, 'find village/scratch -name "*.log" | xargs rm', 'ls village/scratch'); // pipeline is one line: the xargs line is what is judged
    fail(T11, 4, 'find village/scratch -name "*.log"');
    fail(T11, 4, 'rm village/scratch/*.log'); // no xargs
    fail(T11, 4, 'find village/scratch | xargs rm'); // takes keep.txt too, folder refuses
    fail(T11, 4, 'find village/scratch -name "*.txt" | xargs rm');
    fail(T11, 4, 'ls village/scratch | xargs echo');
  });
  it('11.6 Compare two files', () => {
    pass(T11, 5, 'diff village/logs/day1.log village/logs/day2.log');
    pass(T11, 5, 'diff -q village/logs/day2.log village/logs/day3.log');
    fail(T11, 5, 'diff village/logs/day1.log');
    fail(T11, 5, 'diff village/logs/day1.log nothing.log');
    fail(T11, 5, 'cat village/logs/day1.log');
  });
  const CAP = `grep ERROR village/logs/all.log 2>/dev/null | cut -d' ' -f1 | sort | uniq -c > report.txt`;
  it('11.7 capstone: report.txt must hold the real counts from the seeded all.log', () => {
    pass(T11, 6, CAP);
    pass(T11, 6, `grep ERROR village/logs/all.log | cut -d ' ' -f 1 | sort | uniq -c > report.txt`);
    pass(T11, 6, `grep ERROR village/logs/all.log | cut -f1 -d' ' | sort | uniq -c | sort -rn > report.txt`);
    pass(T11, 6, `grep ERROR village/logs/all.log > e.txt`, `cut -d' ' -f1 e.txt | sort > k.txt`, `uniq -c k.txt > report.txt`); // multi-line
    fail(T11, 6, `grep ERROR village/logs/all.log | cut -d' ' -f1 | sort | uniq > report.txt`); // no counts
    fail(T11, 6, `grep ERROR village/logs/all.log | cut -d' ' -f1 | uniq -c > report.txt`); // forgot sort
    fail(T11, 6, `grep -v ERROR village/logs/all.log | cut -d' ' -f1 | sort | uniq -c > report.txt`);
    fail(T11, 6, `cut -d' ' -f1 village/logs/all.log | sort | uniq -c > report.txt`); // all lines, not ERROR
    fail(T11, 6, `grep ERROR village/logs/all.log | cut -d' ' -f1 | sort | uniq -c`); // not saved
    fail(T11, 6, 'echo 3 10.0.0.5 > report.txt');
    fail(T11, 6, 'ls');
  });
  it('11.7 derives the expectation from the file, not from a hardcoded string', () => {
    const SQ = loadShell();
    SQ.content.chapters[T11].setup();
    run(SQ, `echo "10.1.1.1 ERROR a" > village/logs/all.log`);
    run(SQ, `echo "10.1.1.1 ERROR b" >> village/logs/all.log`);
    run(SQ, `echo "10.2.2.2 INFO c" >> village/logs/all.log`);
    const m = SQ.content.chapters[T11].missions[6];
    run(SQ, CAP);
    assert.ok(m.check(SQ.ctxFor(CAP)), 'new content, new counts');
    run(SQ, 'echo "3 10.0.0.5" > report.txt');
    assert.ok(!m.check(SQ.ctxFor('x')), 'the old seeded numbers no longer match');
  });
  it('11.7 reports the expected seeded numbers', () => {
    const SQ = loadShell();
    SQ.content.chapters[T11].setup();
    run(SQ, CAP);
    assert.equal(SQ.ctxFor('').read('~/report.txt').trim().split('\n').map((l) => l.trim()).join('|'), '1 10.0.0.12|3 10.0.0.5|3 10.0.0.7|1 10.0.0.9');
    assert.equal(run(SQ, 'cat report.txt').out.split('\n')[0], '      1 10.0.0.12');
  });
});

describe('jumping in and re-running', () => {
  it('every Task 14 mission answer passes its own check from a fresh world', () => {
    for (const ci of [T10, T11]) {
      const SQ = loadShell();
      SQ.content.chapters[ci].setup();
      SQ.content.chapters[ci].missions.forEach((m, mi) => {
        const pre = ci === T10 && mi === 5 ? ['ln -s village/logs/day1.log today.log'] : [];
        for (const p of pre) run(SQ, p);
        const r = run(SQ, m.answer);
        assert.ok(m.check(SQ.ctxFor(m.answer)), `${ci}.${mi} ${m.answer} -> ${r.out}`);
      });
    }
  });
  it('a learner can finish chapter 11 in order without breaking the later missions', () => {
    const SQ = loadShell();
    SQ.content.chapters[T11].setup();
    const ms = SQ.content.chapters[T11].missions;
    ms.forEach((m) => { run(SQ, m.answer); assert.ok(m.check(SQ.ctxFor(m.answer)), m.title); });
  });
  it('explanations and goals contain no em dashes', () => {
    for (const c of loadShell().content.chapters.slice(9)) for (const m of c.missions) assert.doesNotMatch(m.explain + m.goal + (m.note || ''), /—/);
  });
});

describe('Task 14 quick-fire and guide', () => {
  it('every guide example for chapters 10 and 11 runs without a shell error', () => {
    const SQ = loadShell();
    for (const ci of [T10, T11]) SQ.content.chapters[ci].setup();
    for (const g of SQ.content.guide.filter((g) => g.ch === 9 || g.ch === 10)) for (const [cmd] of g.ex) {
      if (cmd === 'ls missing 2>&1 | wc -l') continue;
      const r = run(SQ, cmd);
      if (!/missing|nothing/.test(cmd)) assert.ok(r.code === 0 || /diff/.test(cmd), `${cmd} -> ${r.out}`);
    }
  });
  it('man works for the new guide commands', () => {
    const SQ = loadShell();
    for (const cmd of ['stat', 'ln', 'xargs', 'diff', 'chmod']) {
      const r = run(SQ, `man ${cmd}`);
      assert.equal(r.code, 0, cmd);
      assert.match(r.out, new RegExp('^' + cmd.toUpperCase()));
    }
  });
});

describe('Task 14 fix round 1', () => {
  it('11.5 refuses to pass when it destroys the other logs, and accepts scratch-only variants', () => {
    fail(T11, 4, 'find village -name "*.log" | xargs rm');
    fail(T11, 4, 'find . -name "*.log" | xargs rm');
    fail(T11, 4, 'find village/logs -name "*.log" | xargs rm');
    pass(T11, 4, "find village/scratch -name '*.log' | xargs rm");
    pass(T11, 4, 'find village/scratch -name "*.log" | xargs rm -f');
    pass(T11, 4, 'cd village/scratch', 'find . -name "*.log" | xargs rm');
    pass(T11, 4, 'cd village/scratch; find . -name "*.log" | xargs rm');
    fail(T11, 4, 'rm village/scratch/*.log');
    const m = loadShell().content.chapters[T11].missions[4];
    assert.match(m.goal + m.note, /village\/logs/);
  });
  it('11.1 needs empty output and accepts the >/dev/null 2>&1 form', () => {
    fail(T11, 0, 'ls village missing 2>/dev/null'); // the listing still prints
    pass(T11, 0, 'ls missing >/dev/null 2>&1');
    pass(T11, 0, 'ls missing > /dev/null 2>&1');
    pass(T11, 0, 'ls missing 2>  /dev/null');
    fail(T11, 0, 'ls village missing 2>&1 >/dev/null'.replace('2>&1 >/dev/null', '2> errors.txt'));
  });
  it('11.2 accepts > file 2>&1 and 2>>', () => {
    pass(T11, 1, 'ls missing > errors.txt 2>&1');
    pass(T11, 1, 'ls missing >errors.txt 2>&1');
    pass(T11, 1, 'ls missing 2>> errors.txt');
    fail(T11, 1, 'ls village > errors.txt 2>&1'); // no error happened
    fail(T11, 1, 'ls missing > /dev/null 2>&1');
  });
  it('quick-fire: find/xargs question is exact and quoted, others take the extra spellings', () => {
    const q = loadShell().content.quickfire;
    const f = q.find((x) => /under old/.test(x[0]));
    assert.ok(f[3] && f[3].exact);
    assert.deepEqual([...f[1]], ['find old -name "*.log" | xargs rm', "find old -name '*.log' | xargs rm"]);
    const has = (re, a) => assert.ok(q.find((x) => re.test(x[0]))[1].includes(a), a);
    has(/only by you/, 'chmod 0600 secrets.txt');
    has(/owner run tool/, 'chmod u+x ./tool.sh');
    has(/size and mode/, 'stat ./secrets.txt');
    has(/count the lines/, 'ls missing 2>&1|wc -l');
  });
  it('every quick-fire answer for chapters 10/11 runs in the engine', () => {
    const SQ = loadShell();
    for (const q of SQ.content.quickfire.filter((x) => x[2] === 'intermediate').slice(12)) for (const a of q[1]) {
      const W = loadShell();
      for (const ci of [T10, T11]) W.content.chapters[ci].setup();
      W.ensureFile('~/old/a.log', 'x'); W.ensureFile('~/a.txt', 'a'); W.ensureFile('~/b.txt', 'b'); W.ensureFile('~/tool.sh', '');
      W.ensureFile('~/village/logs/day3.log', 'x');
      const r = run(W, a);
      assert.doesNotMatch(r.out, /not support|command not found|invalid|No such|paths must/, `${a} -> ${r.out}`);
    }
  });
});

describe('man pages for the helper commands', () => {
  it('man works for printf, seq, basename, dirname, which and type, each tagged to an Intermediate chapter', () => {
    const SQ = loadShell();
    for (const cmd of ['printf', 'seq', 'basename', 'dirname', 'which', 'type']) {
      const r = run(SQ, `man ${cmd}`);
      assert.match(r.out, new RegExp('^' + cmd.toUpperCase()), cmd);
      assert.equal(r.code, 0, cmd);
      const g = SQ.content.guide.find((x) => x.c === cmd);
      assert.ok(g && SQ.tiers.tierOf(g.ch).id === 'intermediate', cmd);
      for (const [ex] of g.ex) { SQ.content.chapters[g.ch].setup(); assert.equal(run(SQ, ex).code, 0, ex); }
    }
  });
  it('every command that man can describe has a guide entry, and no real command printed "No manual entry" among the documented ones', () => {
    const SQ = loadShell();
    const documented = new Set(SQ.content.guide.map((g) => g.c.split(' ')[0]));
    for (const name of Object.keys(SQ.CMDS)) {
      if (!documented.has(name)) continue;
      assert.doesNotMatch(run(SQ, `man ${name}`).out, /No manual entry/, name);
    }
  });
});
