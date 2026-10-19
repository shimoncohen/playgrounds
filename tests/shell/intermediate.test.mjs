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
  it('adds chapters 8 and 9 after the seven beginner chapters', () => {
    assert.equal(ch.length, 9);
    assert.deepEqual([...ch.slice(0, 7).map((c) => c.missions.length)], [8, 7, 7, 7, 7, 7, 9]);
    assert.deepEqual([...ch.slice(0, 7).map((c) => c.tier)], Array(7).fill('beginner'));
    assert.deepEqual([...ch.slice(7).map((c) => c.missions.length)], [7, 8]);
    assert.deepEqual([...ch.slice(7).map((c) => c.tier)], ['intermediate', 'intermediate']);
    assert.deepEqual([...ch.slice(7).map((c) => c.badge)], ['Textsmith', 'Quoter']);
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
    assert.equal(SQ.content.quickfire.filter((q) => q[2] === 'intermediate').length, 12);
    assert.ok(SQ.content.quickfire.filter((q) => !q[2]).length > 0);
  });
  it('has 6 guide entries per chapter and man works for them', () => {
    for (const ci of [7, 8]) assert.equal(SQ.content.guide.filter((g) => g.ch === ci).length, 6, `chapter ${ci}`);
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
