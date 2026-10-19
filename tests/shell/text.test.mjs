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
      ["echo a | sed 's/(/x/'", /^sed: invalid regular expression/],
      ["echo aaaa | sed 's/(a+)+$/x/'", /^sed: pattern too complex for this practice shell/],
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
  it('sed -i', () => U("echo a | sed -i 's/a/b/'", 'sed -i'));
  it('sed negation', () => assert.match(out("echo a | sed '1!d'"), /^this practice shell does not support .*yet$/));
  it('seq -s', () => U('seq -s, 3', 'seq -s'));
  it('tr -c', () => U('echo a | tr -cd a', 'tr -c'));
  it('cut -s', () => U('echo a | cut -s -d, -f1', 'cut -s'));
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
