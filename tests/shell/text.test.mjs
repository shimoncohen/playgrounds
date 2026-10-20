import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const out = (line, SQ = loadShell()) => run(SQ, line).out;

describe('tee', () => {
  it('passes through and writes the file', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo hi | tee a.txt').out, 'hi');
    assert.equal(run(SQ, 'cat a.txt').out, 'hi');
  });
  it('-a appends', () => {
    const SQ = loadShell();
    run(SQ, 'echo one | tee a.txt');
    run(SQ, 'echo two | tee -a a.txt');
    assert.equal(run(SQ, 'cat a.txt').out, 'one\ntwo');
  });
  it('reports bad directory and bad option', () => {
    const SQ = loadShell();
    assert.match(run(SQ, 'echo x | tee nodir/f').out, /^tee: nodir\/f: No such file or directory/);
    assert.match(run(SQ, 'echo x | tee -z').out, /tee: invalid option -- 'z'/);
  });
});

describe('cut', () => {
  it('fields', () => {
    assert.equal(out('echo a,b,c | cut -d, -f2'), 'b');
    assert.equal(out('echo a,b,c,d | cut -d, -f1,3'), 'a,c');
    assert.equal(out('echo a,b,c,d | cut -d , -f2-3'), 'b,c');
  });
  it('characters', () => {
    assert.equal(out('echo hello | cut -c2-4'), 'ell');
    assert.equal(out('echo hello | cut -c1,5'), 'ho');
  });
  it('errors', () => {
    const SQ = loadShell();
    assert.match(run(SQ, 'cut -d, nofile').out, /cut: you must specify a list/);
    assert.match(run(SQ, 'cut -c1 nofile').out, /cut: nofile: No such file or directory/);
    assert.match(run(SQ, 'echo a | cut -c1 -q').out, /cut: invalid option -- 'q'/);
    assert.match(run(SQ, 'echo a | cut -cx').out, /cut: invalid byte, character or field list/);
  });
});

describe('tr', () => {
  it('translates ranges and classes', () => {
    assert.equal(out('echo hello | tr a-z A-Z'), 'HELLO');
    assert.equal(out("echo hello | tr '[:lower:]' '[:upper:]'"), 'HELLO');
  });
  it('-s squeezes, -d deletes', () => {
    assert.equal(out('echo "a  b" | tr -s \' \''), 'a b');
    assert.equal(out('echo a1b22 | tr -d "[:digit:]"'), 'ab');
  });
  it('errors', () => {
    assert.match(out('echo a | tr'), /tr: missing operand/);
    assert.match(out('echo a | tr a'), /tr: missing operand after 'a'/);
    assert.match(out('echo a | tr -q a b'), /tr: invalid option -- 'q'/);
  });
});

describe('sed', () => {
  it('substitutes', () => {
    assert.equal(out('echo hi | sed \'s/h/H/\''), 'Hi');
    assert.equal(out("echo aaa | sed 's/a/b/g'"), 'bbb');
    assert.equal(out("echo aaa | sed 's/a/b/'"), 'baa');
  });
  it('custom delimiter', () => {
    assert.equal(out("echo a/b | sed 's|/|-|'"), 'a-b');
    assert.equal(out("echo a/b | sed 's/\\//-/'"), 'a-b');
  });
  it('& is the match and \\& is literal', () => {
    assert.equal(out("echo cat | sed 's/cat/[&]/'"), '[cat]');
    assert.equal(out("echo cat | sed 's/cat/[\\&]/'"), '[&]');
  });
  it('empty input gives empty output', () => {
    assert.equal(out("printf '' | sed 's/a/b/'"), '');
  });
  it('line addresses', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "printf '1\\n2\\n3\\n' | sed 2d").out, '1\n3');
    assert.equal(run(SQ, "printf 'a\\nb\\nc\\n' | sed '/b/d'").out, 'a\nc');
    assert.equal(run(SQ, "printf '1\\n2\\n3\\n' | sed -n 2p").out, '2');
    assert.equal(run(SQ, "printf '1\\n2\\n3\\n' | sed -n '/3/p'").out, '3');
    assert.equal(run(SQ, "cat journal.txt | sed -n '2,3p' | wc -l").out, '2');
  });
  it('-E accepted', () => {
    assert.equal(out("echo ab12 | sed -E 's/[0-9]+/N/'"), 'abN');
  });
  it('bad scripts print errors, never throw', () => {
    const SQ = loadShell();
    for (const [s, re] of [
      ["echo a | sed 's/a/b'", /^sed: -e expression #1, char \d+: unterminated `s' command/],
      ["echo a | sed 's/a/b/q'", /^sed: -e expression #1, char \d+: unknown option to `s'/],
      ["echo a | sed 'k'", /^sed: -e expression #1, char \d+: unknown command: `k'/],
      ["echo a | sed", /^sed: no script given|usage/i],
      ["echo a | sed 's/\\(/x/'", /^sed: -e expression #1, char 7: Unmatched \( or \\\(/],
      ["echo aaaa | sed -E 's/(a+)+$/x/'", /^sed: pattern too complex for this practice shell/],
      ["echo a | sed -q p", /sed: invalid option -- 'q'/],
      ["sed p nofile", /sed: .*nofile.*No such file or directory/],
    ]) {
      const r = run(SQ, s);
      assert.match(r.out, re, s);
      assert.notEqual(r.code, 0, s);
    }
  });
});

describe('seq', () => {
  it('counts', () => {
    assert.equal(out('seq 3'), '1\n2\n3');
    assert.equal(out('seq 2 4'), '2\n3\n4');
    assert.equal(out('seq 1 2 7'), '1\n3\n5\n7');
    assert.equal(out('seq 3 1'), '');
  });
  it('caps huge ranges', () => {
    const r = run(loadShell(), 'seq 1 1000000');
    assert.equal(r.out, 'seq: too many numbers for this practice shell');
    assert.notEqual(r.code, 0);
  });
  it('errors', () => {
    assert.match(out('seq'), /seq: missing operand/);
    assert.match(out('seq x'), /seq: invalid floating point argument: 'x'/);
    assert.match(out('seq 1 0 5'), /seq: invalid Zero increment/);
  });
});

describe('xargs', () => {
  it('appends args', () => {
    assert.equal(out('echo a b | xargs echo x'), 'x a b');
  });
  it('empty input runs once, -r runs never', () => {
    assert.equal(out("printf '' | xargs echo x"), 'x');
    assert.equal(out("printf '' | xargs -r echo x"), '');
  });
  it('-n and -I', () => {
    assert.equal(out("printf '1\\n2\\n' | xargs -n1 echo n"), 'n 1\nn 2');
    assert.equal(out("printf 'a\\nb\\n' | xargs -I{} echo [{}]"), '[a]\n[b]');
  });
  it('unknown command and option', () => {
    assert.match(out('echo a | xargs nosuch'), /xargs: nosuch: No such file or directory/);
    assert.match(out('echo a | xargs -q echo'), /xargs: invalid option -- 'q'/);
  });
  it('caps invocations and recursion', () => {
    const SQ = loadShell();
    const r = run(SQ, 'seq 5000 | xargs -n1 echo');
    assert.match(r.out, /xargs: too many commands for this practice shell/);
    const d = run(SQ, 'echo a | xargs xargs xargs xargs xargs xargs echo');
    assert.match(d.out, /xargs: too many nested xargs/);
  });
});

describe('printf', () => {
  it('formats', () => {
    assert.equal(out('printf "%s-%d\\n" a 1'), 'a-1');
    assert.equal(out("printf '%5s|%-5s|%%\\t.' a b"), '    a|b    |%\t.');
  });
  it('reuses the format for extra args', () => {
    assert.equal(out('printf "%s\\n" a b c'), 'a\nb\nc');
  });
  it('errors and caps', () => {
    assert.match(out('printf'), /printf: usage/);
    assert.match(out('printf "%d" x'), /printf: x: invalid number/);
    assert.match(out('printf "%99999999s" x'), /printf: .*too (large|long)/);
    assert.match(out('printf "%z" x'), /printf: %z: invalid directive/);
    assert.equal(out('printf "%q" x'), 'x', '%q is a real conversion now');
  });
});

describe('basename / dirname', () => {
  it('basename', () => {
    assert.equal(out('basename /a/b.txt .txt'), 'b');
    assert.equal(out('basename /a/b.txt'), 'b.txt');
    assert.equal(out('basename /a/b/'), 'b');
    assert.match(out('basename'), /basename: missing operand/);
  });
  it('dirname', () => {
    assert.equal(out('dirname /a/b.txt'), '/a');
    assert.equal(out('dirname b.txt'), '.');
    assert.equal(out('dirname /a'), '/');
    assert.match(out('dirname'), /dirname: missing operand/);
  });
});

describe('diff', () => {
  it('differing files give code 1 and < > lines', () => {
    const SQ = loadShell();
    run(SQ, "printf 'a\\nb\\nc\\n' > x.txt");
    run(SQ, "printf 'a\\nB\\nc\\nd\\n' > y.txt");
    const r = run(SQ, 'diff x.txt y.txt');
    assert.equal(r.code, 1);
    assert.equal(r.out, '2c2\n< b\n---\n> B\n3a4\n> d');
    assert.equal(run(SQ, 'diff -q x.txt y.txt').out, 'Files x.txt and y.txt differ');
  });
  it('deletion hunk', () => {
    const SQ = loadShell();
    run(SQ, "printf 'a\\nb\\nc\\n' > x.txt");
    run(SQ, "printf 'a\\nc\\n' > y.txt");
    assert.equal(run(SQ, 'diff x.txt y.txt').out, '2d1\n< b');
  });
  it('equal files give code 0 and no output', () => {
    const SQ = loadShell();
    run(SQ, 'echo same > x.txt');
    run(SQ, 'echo same > y.txt');
    const r = run(SQ, 'diff x.txt y.txt');
    assert.equal(r.out, '');
    assert.equal(r.code, 0);
  });
  it('errors', () => {
    const SQ = loadShell();
    assert.match(run(SQ, 'diff').out, /diff: missing operand/);
    assert.match(run(SQ, 'diff nofile readme.txt').out, /diff: nofile: No such file or directory/);
    assert.match(run(SQ, 'diff -z a b').out, /diff: invalid option -- 'z'/);
  });
});

describe('sed g with empty matches follows sed, not JS', () => {
  for (const [line, want] of [
    ["echo baaac | sed 's/a*/X/g'", 'XbXcX'],
    ["echo a | sed 's/a*/X/g'", 'X'],
    ['echo "a  b" | sed \'s/ */_/g\'', '_a_b_'],
    ['echo abc123 | sed \'s/[0-9]*/N/g\'', 'NaNbNcN'],
    ["echo baaac | sed 's/a*/X/'", 'Xbaaac'],
  ]) it(line, () => assert.equal(out(line), want));
});

describe('unsupported real options say so', () => {
  const U = (l, x) => assert.equal(out(l), `this practice shell does not support ${x} yet`);
  it('sed -z', () => U("echo a | sed -z 's/a/b/'", 'sed -z'));
  it('sed hold space', () => U("echo a | sed 'h;G'", "sed command 'h'"));
  it('seq -s', () => U('seq -s, 3', 'seq -s'));
  it('tr -c', () => U('echo a | tr -cd a', 'tr -c'));
  it('cut -z', () => U('echo a | cut -z -d, -f1', 'cut -z'));
  it('nonexistent letter stays invalid option', () => assert.match(out('echo a | sed -j p'), /sed: invalid option -- 'j'/));
});

describe('grep flags (Stage 3)', () => {
  /* expected values were taken from GNU grep 3.11 on the same data */
  const world = () => {
    const SQ = loadShell();
    for (const l of [
      "printf 'a1\\nb\\nc\\na2\\nd\\ne\\nf\\na3\\n' > f",
      "printf 'x\\na9\\nz\\n' > g",
      'mkdir -p d/sub',
      'echo hi > d/a.txt',
      'echo hi > d/sub/b.c',
      'echo hi > d/z.md',
      'ln -s .. d/sub/up',
      'ln -s a.txt d/lnk',
    ]) run(SQ, l);
    return SQ;
  };
  const g = (l) => run(world(), l);
  const eq = (l, out, code) => {
    const r = g(l);
    assert.equal(r.out, out, l);
    if (code !== undefined) assert.equal(r.code, code, l + ' (status)');
  };

  it('-o prints each match on its own line, with -n, -i and -c', () => {
    eq("echo 'foo bar foo' | grep -o foo", 'foo\nfoo', 0);
    eq('grep -on a f', '1:a\n4:a\n8:a');
    eq("echo 'Foo foo' | grep -oi foo", 'Foo\nfoo');
    eq('grep -co a f', '3');
    eq('echo abc | grep -o "x*"', '', 0);
    eq('grep -ov a f', '', 0);
    eq('grep -e a -e b -n -o f | head -3', '1:a\n2:b\n4:a');
  });
  it('-w matches whole words, -x whole lines, -F is literal, -e repeats', () => {
    eq("echo 'foo foobar bar' | grep -ow 'foo\\w*'", 'foo\nfoobar');
    eq("echo 'foo-bar foo_bar' | grep -ow foo", 'foo');
    eq("echo 'foobar' | grep -w foo", '', 1);
    eq("grep -x -e a1 -e d f", 'a1\nd');
    eq("echo 'a.b axb' | grep -oF 'a.b'", 'a.b');
    eq("echo 'axb' | grep -F 'a.b'", '', 1);
    eq('grep -e a1 -e a3 f', 'a1\na3');
  });
  it('-l -L -q -c -h -H', () => {
    eq('grep -l a f g', 'f\ng', 0);
    eq('grep -L zzz f', 'f', 1); /* GNU 3.11: status follows line selection, not the listing */
    eq('grep -L a f', '', 0);
    eq('grep -q a f; echo $?', '0');
    eq('grep -q zzz f; echo $?', '1');
    eq('grep -q a nofile f; echo $?', 'grep: nofile: No such file or directory\n0');
    eq('grep -c a f g', 'f:3\ng:1');
    eq('grep -lc a f g', 'f\ng');
    eq('grep -h a f g | head -2', 'a1\na2');
    eq('grep -H a f | head -1', 'f:a1');
    eq('grep -Hc a f', 'f:3');
    eq('echo a | grep -H a', '(standard input):a');
  });
  it('-s hides file errors but keeps the status', () => {
    eq('grep a nofile', 'grep: nofile: No such file or directory', 2);
    eq('grep -s a nofile; echo $?', '2');
    eq('grep -s a nofile f | head -1', 'f:a1');
  });
  it('-m stops after N selected lines', () => {
    eq('grep -m1 a f', 'a1', 0);
    eq('grep -c -m2 a f g', 'f:2\ng:1');
    eq('grep -cv -m2 a f', '2');
    eq('grep -m0 a f', '', 1);
    eq('grep -m1 -A3 a f', 'a1\nb\nc\na2');
    eq('grep -m x a f', 'grep: invalid max count', 2);
  });
  it('-A -B -C context groups with -- and -n marks', () => {
    eq('grep -A0 a f', 'a1\n--\na2\n--\na3');
    eq('grep -A1 a f', 'a1\nb\n--\na2\nd\n--\na3');
    eq('grep -B1 a f', 'a1\n--\nc\na2\n--\nf\na3');
    eq('grep -nC1 a f g', 'f:1:a1\nf-2-b\nf-3-c\nf:4:a2\nf-5-d\n--\nf-7-f\nf:8:a3\n--\ng-1-x\ng:2:a9\ng-3-z');
    eq('grep -n -A1 a f g', 'f:1:a1\nf-2-b\n--\nf:4:a2\nf-5-d\n--\nf:8:a3\n--\ng:2:a9\ng-3-z');
    eq('grep -2 d f', 'c\na2\nd\ne\nf');
    eq('grep -E -v -n -A1 "a|b|c" f', '5:d\n6:e\n7:f\n8-a3');
    eq('grep -A x a f', 'grep: x: invalid context length argument', 2);
  });
  it('-r searches in sorted order, prefixes names, skips links', () => {
    eq('grep -r hi d', 'd/a.txt:hi\nd/sub/b.c:hi\nd/z.md:hi', 0);
    eq('grep -r hi d/', 'd/a.txt:hi\nd/sub/b.c:hi\nd/z.md:hi');
    eq('cd d; grep -r hi', 'a.txt:hi\nsub/b.c:hi\nz.md:hi');
    eq('cd d; grep -r hi .', './a.txt:hi\n./sub/b.c:hi\n./z.md:hi');
    eq('cd d; grep -R hi', 'a.txt:hi\nlnk:hi\nsub/b.c:hi\nz.md:hi');
    eq('grep -r hi d/a.txt', 'hi');
    eq('grep -rh hi d', 'hi\nhi\nhi');
    eq('grep -rc hi d', 'd/a.txt:1\nd/sub/b.c:1\nd/z.md:1');
    eq('grep -rl hi d', 'd/a.txt\nd/sub/b.c\nd/z.md');
    eq('grep -rn hi d/sub', 'd/sub/b.c:1:hi');
    eq("grep -r --include='*.c' hi d", 'd/sub/b.c:hi');
    eq("grep -r --exclude='*.c' hi d", 'd/a.txt:hi\nd/z.md:hi');
    eq("grep -r --include='*.c' --include='*.md' hi d", 'd/sub/b.c:hi\nd/z.md:hi');
    eq('grep hi d', 'grep: d: Is a directory', 2);
  });
  it('a link cycle ends', () => {
    const SQ = world();
    run(SQ, 'ln -s . d/self');
    run(SQ, 'ln -s /home d/sub/home');
    assert.equal(run(SQ, 'grep -rc hi d | wc -l').out, '3');
    assert.equal(run(SQ, 'grep -Rc hi d | wc -l').out, '4');
  });
  it('-E kept, -v with context, no match status 1', () => {
    eq('grep -E "a1|d" f', 'a1\nd');
    eq('echo ab | grep -E "a|b" -o', 'a\nb');
    eq('grep zzz f', '', 1);
  });
  it('bad patterns use GNU messages and status 2', () => {
    eq('grep -E "(" f', 'grep: Unmatched ( or \\(', 2);
    eq('grep "[abc" f', 'grep: Unmatched [, [^, [:, [., or [=', 2);
    eq("grep 'a\\' f", 'grep: Trailing backslash', 2);
    eq('grep -E "a{2,1}" f', 'grep: Invalid content of \\{\\}', 2);
    eq('grep -e', 'grep: option requires an argument -- \'e\'\nUsage: grep [OPTION]... PATTERNS [FILE]...\nTry \'grep --help\' for more information.', 2);
  });
  it('still-unsupported options keep the unsupported message', () => {
    for (const f of ['-P', '-z', '-f', '-a']) eq(`grep ${f} wolf f`, `this practice shell does not support grep ${f} yet`);
    eq('grep --color=always a f', 'this practice shell does not support grep --color=always yet');
    eq('grep --bogus a f', 'this practice shell does not support grep --long options yet');
    eq('grep --color=never a f | head -1', 'a1');
    eq('grep --color a f', 'this practice shell does not support grep --long options yet');
  });
  it('terminal colouring: matches and names are marked, --color=never turns it off', () => {
    const SQ = world();
    const raw = (l) => SQ.execLine(l).out.map((o) => o.text).join('\n');
    assert.match(raw('grep -o a1 f'), /\x01ma1\x02/);
    assert.match(raw('grep -H a1 f'), /\x01ff\x02:/);
    assert.equal(raw('grep -H --color=never a1 f'), 'f:a1');
    assert.equal(raw('grep -v a f | head -1'), 'b');
  });
  it('a missing file after a match still reports, -q after a match stops', () => {
    eq('grep a f nofile', 'grep: nofile: No such file or directory\nf:a1\nf:a2\nf:a3', 2); /* the shell prints a command's errors before its output, as it always has */
    eq('grep -q a f nofile; echo $?', '0');
  });
  it('output and step caps hold on big inputs', () => {
    const SQ = world();
    run(SQ, 'for i in $(seq 1 3000); do echo "line $i"; done > big');
    const r = run(SQ, 'grep -n line big');
    assert.match(r.out, /output cut off after 2000 lines/);
    assert.equal(run(SQ, 'grep -c line big').out, '3000');
    assert.equal(run(SQ, 'grep -o 1 big | wc -l').out, '1900');
    assert.equal(run(SQ, 'grep -A2 line big | wc -l').out.length > 0, true);
  });
});

// ---- Task 10: find -exec / -delete / depth options, xargs options, tac nl paste comm, cut -s, head/tail -c, uniq -d -u ----
// Expected values were taken from GNU findutils 4.9 / coreutils on the same data (names in this practice shell come out sorted, GNU's in directory order).
describe('find actions and depth options (Task 10)', () => {
  const world = () => {
    const SQ = loadShell();
    for (const l of ['mkdir -p t/d/e t/d/empty t/sp', 'cd t', 'echo hi > a.txt', "printf 'x\\ny\\n' > b.log", 'touch e0 d/e/z.txt', 'echo x > d/b.txt', "echo q > 'sp/f g.txt'", 'ln -s d ld', 'ln -s a.txt lf']) run(SQ, l);
    return SQ;
  };
  const eq = (l, out, code = 0, SQ = world()) => assert.deepEqual(run(SQ, l), { out, code }, l);

  it('-exec CMD {} \\; runs once per match, in find order, with {} replaced inside words', () => {
    eq("find . -name '*.txt' -exec wc -l {} \\;", '1 ./a.txt\n1 ./d/b.txt\n0 ./d/e/z.txt\n1 ./sp/f g.txt');
    eq("find d -name '*.txt' -exec echo a{}b {} \\;", 'ad/b.txtb d/b.txt\nad/e/z.txtb d/e/z.txt');
    eq('find d -type f -exec cat {} \\;', 'x');
    eq('find d -name b.txt -exec echo one {} \\; -exec echo two {} \\;', 'one d/b.txt\ntwo d/b.txt');
  });
  it('-exec ... {} + runs once with every match, and not at all without one', () => {
    eq("find d -name '*.txt' -exec echo hi {} +", 'hi d/b.txt d/e/z.txt');
    eq("find d -name '*.txt' -exec echo {} +", 'd/b.txt d/e/z.txt');
    eq('find d -name zzz -exec echo hi {} +', '');
  });
  it('the status of \\; is only a test, a failing + run makes find fail, a missing command is reported', () => {
    eq("find d -name '*.txt' -exec false {} \\;", '');
    eq('find d -type f -exec false {} \\; -print', '');
    eq('find d -type f -exec true {} \\; -print', 'd/b.txt\nd/e/z.txt');
    eq("find d -name '*.txt' -exec false {} +", '', 1);
    eq('find d -name b.txt -exec nosuch {} \\;', "find: 'nosuch': No such file or directory");
    eq('find d -name b.txt -exec nosuch {} +', "find: 'nosuch': No such file or directory", 1);
  });
  it('-exec argument errors', () => {
    eq('find d -exec', "find: missing argument to '-exec'", 1);
    eq('find d -exec echo {}', "find: missing argument to '-exec'", 1);
    eq('find d -exec echo {} x +', "find: missing argument to '-exec'", 1);
    eq('find d -exec echo a{} +', "find: In '-exec ... {} +' the '{}' must appear by itself, but you specified 'a{}'", 1);
    eq('find d -exec echo {} {} +', 'find: Only one instance of {} is supported with -exec ... +', 1);
    eq('find d -type f -exec echo + \\;', '+\n+');
  });
  it('-exec can run a function and a script', () => {
    const SQ = world();
    run(SQ, 'shout() { echo "<$1>"; }');
    assert.deepEqual(run(SQ, "find d -name '*.txt' -exec shout {} \\;"), { out: '<d/b.txt>\n<d/e/z.txt>', code: 0 });
    run(SQ, "printf 'echo script $1\\n' > s.sh");
    assert.deepEqual(run(SQ, 'find d -name b.txt -exec bash s.sh {} \\;'), { out: 'script d/b.txt', code: 0 });
  });
  it('-print0 ends each name with NUL; xargs -0 reads it back', () => {
    assert.equal(run(world(), 'find d -type f -print0').out, 'd/b.txt\0d/e/z.txt\0');
    eq('find d -type f -print0 | xargs -0 -n1 echo', 'd/b.txt\nd/e/z.txt');
    eq('find . -name "*.txt" -print0 | xargs -0 echo', './a.txt ./d/b.txt ./d/e/z.txt ./sp/f g.txt');
  });
  it('-mindepth / -maxdepth', () => {
    eq('find . -maxdepth 1', '.\n./a.txt\n./b.log\n./d\n./e0\n./ld\n./lf\n./sp');
    eq('find . -maxdepth 0', '.');
    eq('find . -mindepth 1 -maxdepth 1 -type d', './d\n./sp');
    eq('find . -mindepth 2', './d/b.txt\n./d/e\n./d/e/z.txt\n./d/empty\n./sp/f g.txt');
    eq("find . -name '*.txt' -maxdepth 1", './a.txt');
    eq('find . -maxdepth x', "find: Expected a positive decimal integer argument to -maxdepth, but got 'x'", 1);
    eq('find . -maxdepth -1', "find: Expected a positive decimal integer argument to -maxdepth, but got '-1'", 1);
    eq('find . -maxdepth', "find: missing argument to '-maxdepth'", 1);
    eq('find . -mindepth', "find: missing argument to '-mindepth'", 1);
  });
  it('-empty matches empty files and empty folders, not links', () => {
    eq('find . -empty', './d/e/z.txt\n./d/empty\n./e0');
    eq('find . -empty -type d', './d/empty');
    eq('find . -empty -type f', './d/e/z.txt\n./e0');
  });
  it('a start point that is a link is listed as itself; with a trailing / it is followed', () => {
    eq('find ld', 'ld');
    eq('find ld/ -maxdepth 1', 'ld/\nld/b.txt\nld/e\nld/empty');
    eq('find lf', 'lf');
  });
  it('-name sees the start point under the name you typed', () => {
    eq('find . -name .', '.');
    eq('find d/ -name d', 'd/');
  });
  it('-newer and the boolean operators stay unsupported', () => {
    for (const x of ['-newer', '-o', '-not', '-path', '-prune', '-size', '-mtime', '-perm', '-execdir', '-a', '-depth']) eq(`find . ${x} x`, `this practice shell does not support find ${x} yet`, 1);
    eq('find . ! -name x', 'this practice shell does not support find ! yet', 1);
  });
  it('-delete removes files, links and empty folders, children first, and never .', () => {
    const SQ = world();
    assert.deepEqual(run(SQ, "find . -name '*.txt' -delete -print"), { out: './a.txt\n./d/b.txt\n./d/e/z.txt\n./sp/f g.txt', code: 0 });
    assert.equal(run(SQ, 'find .').out, '.\n./b.log\n./d\n./d/e\n./d/empty\n./e0\n./ld\n./lf\n./sp');
    assert.deepEqual(run(SQ, 'find . -empty -delete'), { out: '', code: 0 });
    assert.equal(run(SQ, 'find .').out, '.\n./b.log\n./ld\n./lf'); /* d emptied out while it was visited, so it went too */
  });
  it('-delete prints the children before their folder and keeps a folder that is not empty', () => {
    const SQ = world();
    assert.deepEqual(run(SQ, 'find d -delete -print'), { out: 'd/b.txt\nd/e/z.txt\nd/e\nd/empty\nd', code: 0 });
    const S2 = world();
    assert.deepEqual(run(S2, 'find . -type d -name d -delete'), { out: "find: cannot delete './d': Directory not empty", code: 1 });
    assert.equal(run(S2, 'ls d').out, 'b.txt  e/  empty/');
    assert.deepEqual(run(S2, 'find . -delete'), { out: '', code: 0 });
    assert.equal(run(S2, 'ls -a').out, './  ../');
  });
  it("-delete and -exec rm keep rm's safety rules", () => {
    const SQ = loadShell();
    assert.match(run(SQ, 'find / -maxdepth 0 -delete').out, /find: cannot delete '\/': that would wipe out your whole world/);
    assert.match(run(SQ, 'find ~ -maxdepth 0 -delete').out, /find: cannot delete '\/home\/explorer': that would wipe out your whole world/);
    assert.match(run(SQ, 'find /home -maxdepth 0 -delete').out, /find: cannot delete '\/home': that would wipe out your whole world/);
    assert.ok(run(SQ, 'ls').out.includes('journal.txt'));
    run(SQ, 'mkdir -p w/in');
    run(SQ, 'cd w/in');
    assert.match(run(SQ, 'find /home/explorer/w -delete').out, /find: cannot delete '\/home\/explorer\/w\/in': you are standing inside it/);
    assert.match(run(SQ, 'find ~ -maxdepth 1 -name w -exec rm -r {} \\;').out, /rm: you are standing inside/);
    assert.equal(run(SQ, 'pwd').out, '/home/explorer/w/in');
  });
  it('a folder that -exec just removed is not entered', () => {
    const SQ = world();
    const r = run(SQ, "find . -name d -exec rm -r {} \\; -print");
    assert.deepEqual(r, { out: "find: './d': No such file or directory\n./d", code: 1 }); /* as GNU: -print still sees ./d, then find fails to enter it */
    assert.equal(run(SQ, 'ls').out, 'a.txt  b.log  e0  ld  lf  sp/');
  });
  it('-exec rm {} + and -exec rmdir remove what matched', () => {
    const SQ = world();
    assert.deepEqual(run(SQ, "find . -name 'b.*' -exec rm {} +"), { out: '', code: 0 });
    assert.equal(run(SQ, 'find . -name "b.*"').out, '');
    assert.deepEqual(run(SQ, 'find . -type d -empty -exec rmdir {} \\;'), { out: "find: './d/empty': No such file or directory", code: 1 }); /* as GNU: it then tries to enter the folder it removed */
    assert.equal(run(SQ, 'ls d').out, 'e/');
  });
  it('a runaway -exec stops with the friendly step message and the shell stays usable', () => {
    const SQ = loadShell();
    run(SQ, 'seq 1 5000 | xargs -n 1000 touch');
    const r = run(SQ, 'find / -exec true {} \\; -exec true {} \\; -exec true {} \\; -exec true {} \\;');
    assert.match(r.out, /this practice shell stopped the command: too many steps/);
    assert.deepEqual(run(SQ, 'echo still here'), { out: 'still here', code: 0 });
    assert.match(run(SQ, 'find . -exec echo {} \\; | wc -l').out, /too many steps|^\d+$/);
    assert.deepEqual(run(SQ, 'echo ok'), { out: 'ok', code: 0 });
  });
});

describe('xargs options (Task 10)', () => {
  const eq = (l, out, code = 0, SQ = loadShell()) => assert.deepEqual(run(SQ, l), { out, code }, l);
  const TRY = "\nTry 'xargs --help' for more information.";
  it('-0 splits on NUL only', () => {
    eq("printf 'a\\0b c\\0' | xargs -0 echo", 'a b c');
    eq("printf 'a\\0b c\\0' | xargs -0 -n1 echo", 'a\nb c');
    eq("printf 'a\\0b' | xargs -0 -n1 echo", 'a\nb');
    eq("printf 'a b\\0c\\0' | xargs -0 -I{} echo '<{}>'", '<a b>\n<c>');
  });
  it('-n N groups items', () => {
    eq("printf 'a b c d e' | xargs -n 2 echo", 'a b\nc d\ne');
    eq("printf 'a b c' | xargs -n 1 -n 2 echo", 'a b\nc');
    eq("printf 'a b c' | xargs -n0 echo", 'xargs: value 0 for -n option should be >= 1' + TRY, 1);
    eq("printf 'a b c' | xargs -n x echo", 'xargs: invalid number "x" for -n option' + TRY, 1);
    eq("printf 'a b c' | xargs -n", "xargs: option requires an argument -- 'n'" + TRY, 1);
  });
  it('-I replaces every {} (or any string) in the arguments after the command, one run per line', () => {
    eq("printf 'a b\\nc\\n' | xargs -I{} echo '[{}]' {}", '[a b] a b\n[c] c');
    eq("printf 'a b\\nc\\n' | xargs -I % echo '%'", 'a b\nc');
    eq("printf 'a b c\\n' | xargs -I{} echo {}{}{}", 'a b ca b ca b c');
    eq("printf '  a b \\n\\nc\\n' | xargs -I{} echo '[{}]'", '[a b ]\n[c]');
    eq("printf 'a b\\nc\\n' | xargs -I{} -n1 echo '[{}]'", '[a b]\n[c]');
    eq("printf 'a' | xargs -I{} {} x", 'xargs: {}: No such file or directory', 127);
    eq("printf 'a b c' | xargs -I", "xargs: option requires an argument -- 'I'" + TRY, 1);
  });
  it('quotes and backslashes group words (not with -0)', () => {
    eq("printf '\"a b\" c' | xargs -n1 echo", 'a b\nc');
    eq("printf \"'a b' c\" | xargs -n1 echo", 'a b\nc');
    eq("printf 'a\\\\ b c' | xargs -n1 echo", 'a b\nc');
    eq("printf 'a\"b c' | xargs -n1 echo", 'xargs: unmatched double quote; by default quotes are special to xargs unless you use the -0 option', 1);
    eq("printf \"a'b c\" | xargs echo", 'xargs: unmatched single quote; by default quotes are special to xargs unless you use the -0 option', 1);
  });
  it('-P N is accepted and runs the batches one after another, in order', () => {
    eq("printf 'a b c' | xargs -P 2 -n1 echo", 'a\nb\nc');
    eq("printf 'a b c' | xargs -P 0 -n1 echo", 'a\nb\nc');
    eq("printf 'a b c' | xargs -P x -n1 echo", 'xargs: invalid number "x" for -P option' + TRY, 1);
  });
  it('-t prints each command to stderr, quoted', () => {
    eq("printf 'a b' | xargs -t echo", 'echo a b\na b');
    eq("printf 'a b c' | xargs -t -n2 echo", 'echo a b\necho c\na b\nc'); // stderr (the trace) first: this shell keeps the two streams apart
    eq("printf 'a b c' | xargs -t -I{} echo '{}'", "echo 'a b c'\na b c");
    eq("printf 'a' | xargs -t echo 'x y' \"it's\" '$HOME' ''", "echo 'x y' \"it's\" '$HOME' '' a\nx y it's $HOME  a");
    assert.equal(run(loadShell(), "printf 'a b' | xargs -t echo 2>/dev/null").out, 'a b');
  });
  it('-r skips the run on empty input; combined flags work', () => {
    eq("printf '' | xargs -r echo hi", '');
    eq("printf '\\n\\n' | xargs echo hi", 'hi');
    eq("printf 'a b c' | xargs -rn2 echo", 'a b\nc');
    eq("printf 'a b c' | xargs -n2r echo", 'xargs: invalid number "2r" for -n option' + TRY, 1);
  });
  it('-- ends the options', () => {
    eq("printf 'a b c' | xargs -n1 -- echo", 'a\nb\nc');
    eq("printf 'a b c' | xargs -- -n1 echo", 'xargs: -n1: No such file or directory', 127);
  });
  it('exit status: 123 when a run fails, 127 for a missing command (and it stops)', () => {
    eq("printf 'a b' | xargs -n1 false", '', 123);
    eq("printf 'a b' | xargs nosuch", 'xargs: nosuch: No such file or directory', 127);
    const SQ = loadShell();
    run(SQ, 'echo hi > a.txt');
    eq("printf 'a.txt\\nnope' | xargs -n1 cat", 'cat: nope: No such file or directory\nhi', 123, SQ); // stderr first: the two streams are kept apart
  });
  it('can call a function and a script', () => {
    const SQ = loadShell();
    run(SQ, 'shout() { echo "<$*>"; }');
    assert.deepEqual(run(SQ, "printf 'a b c' | xargs -n2 shout"), { out: '<a b>\n<c>', code: 0 });
    run(SQ, "printf 'echo got $1 $2\\n' > s.sh");
    assert.deepEqual(run(SQ, "printf 'a b c' | xargs -n2 bash s.sh"), { out: 'got a b\ngot c', code: 0 });
    assert.deepEqual(run(SQ, "printf 'a b' | xargs -n1 ./nosuch.sh"), { out: 'bash: ./nosuch.sh: No such file or directory\nbash: ./nosuch.sh: No such file or directory', code: 123 });
  });
  it('the other real options still say so', () => {
    for (const o of ['-L', '-d', '-s', '-E', '-a', '-p', '-x', '-i', '-e']) assert.equal(out(`echo a | xargs ${o} 1 echo`), `this practice shell does not support xargs ${o} yet`, o);
  });
  it('caps: runs per line, huge replacement lists, nesting', () => {
    const SQ = loadShell();
    assert.match(run(SQ, 'seq 5000 | xargs -n1 echo').out, /xargs: too many commands for this practice shell/);
    assert.deepEqual(run(SQ, 'echo ok'), { out: 'ok', code: 0 });
    run(SQ, "printf '%0999d' 0 > s");
    // a 999-character item copied into 900 words, again and again, is far beyond the text cap
    const r = run(SQ, `seq 1 3000 | xargs -I{} echo ${'{} '.repeat(900)}`);
    assert.match(r.out, /too large|stopped the command/);
    assert.deepEqual(run(SQ, 'echo ok'), { out: 'ok', code: 0 });
    assert.match(run(SQ, 'echo a | xargs xargs xargs xargs xargs xargs echo').out, /xargs: too many nested xargs/);
  });
});

describe('tac, nl, paste, comm (Task 10)', () => {
  const world = () => {
    const SQ = loadShell();
    for (const l of ["printf '1\\n2\\n3\\n' > n1", "printf 'one\\ntwo\\n' > t1", "printf 'b\\na\\nc\\n' > u1", "printf 'a\\nb\\nd\\n' > s1", "printf 'a\\nc\\nd\\ne\\n' > s2", "printf 'x\\n\\ny\\n \\nz\\n' > bl", 'touch e0']) run(SQ, l);
    return SQ;
  };
  const eq = (l, out, code = 0) => assert.deepEqual(run(world(), l), { out, code }, l);
  it('they are real commands: type, which and tab completion see them', () => {
    const SQ = loadShell();
    for (const c of ['tac', 'nl', 'paste', 'comm']) {
      assert.equal(run(SQ, `type ${c}`).out, `${c} is /usr/bin/${c}`);
      assert.equal(run(SQ, `which ${c}`).out, `/usr/bin/${c}`);
      assert.ok(Object.keys(SQ.CMDS).includes(c));
    }
  });
  it('a typo for them gets "Did you mean", and they do not steal other suggestions', () => {
    const SQ = loadShell();
    assert.match(run(SQ, 'pastee a').out, /Did you mean: paste\?/);
    assert.match(run(SQ, 'tca a').out, /command not found/);
    assert.match(run(SQ, 'lss').out, /Did you mean: ls\?/);
    assert.match(run(SQ, 'cmm').out, /Did you mean: comm\?/);
  });
  it('tac prints lines last to first, file by file', () => {
    eq('tac n1', '3\n2\n1');
    eq('tac n1 t1', '3\n2\n1\ntwo\none');
    eq('cat n1 | tac', '3\n2\n1');
    eq('tac - < n1', '3\n2\n1');
    eq('tac e0', '');
    eq('tac nope', "tac: failed to open 'nope' for reading: No such file or directory", 1);
    eq('tac nope n1', "tac: failed to open 'nope' for reading: No such file or directory\n3\n2\n1", 1);
    eq('tac -s, n1', 'this practice shell does not support tac -s yet', 1);
    eq('tac -j n1', "tac: invalid option -- 'j'", 1);
  });
  it('nl numbers non-empty lines by default; -ba numbers all', () => {
    eq('nl bl', '     1\tx\n       \n     2\ty\n     3\t \n     4\tz');
    eq('nl -ba bl', '     1\tx\n     2\t\n     3\ty\n     4\t \n     5\tz');
    eq('nl -b a bl', '     1\tx\n     2\t\n     3\ty\n     4\t \n     5\tz');
    eq('nl -bt bl', '     1\tx\n       \n     2\ty\n     3\t \n     4\tz');
    eq('nl -bn bl', '       x\n       \n       y\n        \n       z');
    eq('nl -b q bl', "nl: invalid body numbering style: 'q'\nTry 'nl --help' for more information.", 1);
    eq('nl n1 t1', '     1\t1\n     2\t2\n     3\t3\n     4\tone\n     5\ttwo');
    eq('cat n1 | nl', '     1\t1\n     2\t2\n     3\t3');
    eq('nl -n rz n1', '000001\t1\n000002\t2\n000003\t3');
    eq('nl -n ln n1', '1     \t1\n2     \t2\n3     \t3');
    eq('nl -v 5 n1', '     5\t1\n     6\t2\n     7\t3');
    eq('nl -i 2 n1', '     1\t1\n     3\t2\n     5\t3');
    eq('nl -w3 -s: n1', '  1:1\n  2:2\n  3:3');
    eq('nl nope', 'nl: nope: No such file or directory', 1);
    eq('nl -v x n1', "nl: invalid starting line number: 'x'", 1);
    eq('nl -p n1', 'this practice shell does not support nl -p yet', 1);
  });
  it('paste joins lines side by side', () => {
    eq('paste n1 t1', '1\tone\n2\ttwo\n3\t');
    eq('paste -d, n1 t1', '1,one\n2,two\n3,');
    eq("paste -d'|-' n1 t1 n1", '1|one-1\n2|two-2\n3|-3');
    eq("paste -d '' n1 t1", '1one\n2two\n3');
    eq("paste -d '\\n' n1 t1", '1\none\n2\ntwo\n3');
    eq('paste n1 n1 n1', '1\t1\t1\n2\t2\t2\n3\t3\t3');
    eq('paste -s n1', '1\t2\t3');
    eq('paste -sd, n1', '1,2,3');
    eq('paste -d, -s n1 t1', '1,2,3\none,two');
    eq('paste - - < n1', '1\t2\n3\t');
    eq('paste -s - < n1', '1\t2\t3');
    eq('paste n1 - < t1', '1\tone\n2\ttwo\n3\t');
    eq("cat n1 | paste -s -d '+'", '1+2+3');
    eq('paste n1 nope', 'paste: nope: No such file or directory', 1);
    eq('paste -z n1', 'this practice shell does not support paste -z yet', 1);
    eq('paste -d', "paste: option requires an argument -- 'd'", 1);
  });
  it('comm compares two sorted files in three columns', () => {
    eq('comm s1 s2', '\t\ta\nb\n\tc\n\t\td\n\te');
    eq('comm -1 s1 s2', '\ta\nc\n\td\ne');
    eq('comm -2 s1 s2', '\ta\nb\n\td');
    eq('comm -3 s1 s2', 'b\n\tc\n\te');
    eq('comm -12 s1 s2', 'a\nd');
    eq('comm -23 s1 s2', 'b');
    eq('comm -123 s1 s2', '');
    eq('comm -1 -3 s1 s2', 'c\ne');
    eq('comm - s2 < s1', '\t\ta\nb\n\tc\n\t\td\n\te');
    eq('sort u1 | comm - s1', '\t\ta\n\t\tb\nc\n\td');
    eq('comm s1 nope', 'comm: nope: No such file or directory', 1);
    eq('comm s1', "comm: missing operand after 's1'\nTry 'comm --help' for more information.", 1);
    eq('comm s1 s2 s1', "comm: extra operand 's1'\nTry 'comm --help' for more information.", 1);
    eq('comm e0 s1', '\ta\n\tb\n\td');
  });
  it('comm warns once per file when a line comes before the one above it, and exits 1', () => {
    const W = (n) => `comm: file ${n} is not in sorted order\ncomm: input is not in sorted order`;
    eq('comm u1 s2', W(1) + '\n\ta\nb\na\n\t\tc\n\td\n\te', 1); // stderr first: the two streams are kept apart
    eq('comm s2 u1', W(2) + '\na\n\tb\n\ta\n\t\tc\nd\ne', 1);
    eq('comm u1 u1', '\t\tb\n\t\ta\n\t\tc');
    eq('comm -12 u1 s2', W(1) + '\nc', 1);
  });
});

describe('cut -s, head -c, tail -c, uniq -d -u (Task 10)', () => {
  const world = () => {
    const SQ = loadShell();
    for (const l of ["printf 'a:b:c\\nnodelim\\n:x\\n' > c1", "printf 'hello world\\nsecond line\\n' > h1", "printf 'one\\ntwo\\n' > t1", "printf 'a\\na\\nb\\nc\\nc\\nc\\nd\\n' > uq"]) run(SQ, l);
    return SQ;
  };
  const eq = (l, out, code = 0) => assert.deepEqual(run(world(), l), { out, code }, l);
  it('cut -s drops lines without the delimiter', () => {
    eq('cut -d: -f1 c1', 'a\nnodelim');
    eq('cut -s -d: -f1 c1', 'a');
    eq('cut -sd: -f2 c1', 'b\nx');
    eq('cut -d: -f2 -s c1', 'b\nx');
    eq('cut -s -f1 c1', '');
    eq('cut -s -c1-2 c1', "cut: suppressing non-delimited lines makes sense\n\tonly when operating on fields\nTry 'cut --help' for more information.", 1);
  });
  it('head -c N', () => {
    eq('head -c 5 h1', 'hello');
    eq('head -c5 h1', 'hello');
    eq('head -c 0 h1', '');
    eq('head -c 100 h1', 'hello world\nsecond line');
    eq('head -c 12 h1', 'hello world');
    eq('head -c -3 h1', 'hello world\nsecond li');
    eq('head -c 3 h1 t1', '==> h1 <==\nhel\n==> t1 <==\none');
    eq('head -c 3 -n 1 h1', 'hello world');
    eq('head -n 1 -c 3 h1', 'hel');
    eq('cat h1 | head -c 4', 'hell');
    eq('head -c x h1', "head: invalid number of bytes: 'x'", 1);
    eq('head -c', "head: option requires an argument -- 'c'", 1);
    eq('head -c 3K h1', 'this practice shell does not support head -c with a size suffix yet', 1);
    eq('head -n 1 h1', 'hello world');
  });
  it('tail -c N', () => {
    eq('tail -c 5 h1', 'line');
    eq('tail -c5 h1', 'line');
    eq('tail -c 0 h1', '');
    eq('tail -c 100 h1', 'hello world\nsecond line');
    eq('tail -c 12 h1', 'second line');
    eq('tail -c +3 h1', 'llo world\nsecond line');
    eq('tail -c -3 h1', 'ne');
    eq('tail -c 3 h1 t1', '==> h1 <==\nne\n\n==> t1 <==\nwo');
    eq('cat h1 | tail -c 4', 'ine');
    eq('tail -c x h1', "tail: invalid number of bytes: 'x'", 1);
  });
  it('uniq -d / -u (and with -c)', () => {
    eq('uniq uq', 'a\nb\nc\nd');
    eq('uniq -d uq', 'a\nc');
    eq('uniq -u uq', 'b\nd');
    eq('uniq -c uq', '      2 a\n      1 b\n      3 c\n      1 d');
    eq('uniq -cd uq', '      2 a\n      3 c');
    eq('uniq -cu uq', '      1 b\n      1 d');
    eq('uniq -du uq', '');
    eq('cat uq | uniq -d', 'a\nc');
  });
});
