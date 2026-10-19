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
    assert.match(out('printf "%q" x'), /printf: %q: invalid directive/);
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
