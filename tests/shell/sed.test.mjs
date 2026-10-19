import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

/* Expected values were taken from GNU sed 4.9 on the same input. */
const SIX = 'one\ntwo\nthree\nfour\nfive\nsix';
function world() {
  const SQ = loadShell();
  run(SQ, "printf 'one\\ntwo\\nthree\\nfour\\nfive\\nsix\\n' > n");
  run(SQ, "printf 'a\\nb\\n' > f1");
  run(SQ, "printf 'c\\nd\\n' > f2");
  run(SQ, "printf 'a/b]c\\n' > s");
  return SQ;
}
const r = (line, SQ = world()) => run(SQ, line);
const out = (line, SQ) => r(line, SQ).out;
const lines = (...xs) => xs.join('\n');

describe('SQ.sedRun', () => {
  it('runs a script over a text and returns { out, code }', () => {
    const SQ = loadShell();
    assert.deepEqual({ ...SQ.sedRun('s/o/0/g', 'foo\nbar', {}) }, { out: 'f00\nbar', code: 0 });
    assert.equal(SQ.sedRun('$=', SIX, { n: true }).out, '6');
    assert.equal(SQ.sedRun('s/(o+)/[\\1]/', 'foo', { E: true }).out, 'f[oo]');
    const bad = SQ.sedRun('s/a/b', 'x', {});
    assert.equal(bad.code, 1);
    assert.equal(bad.err, "sed: -e expression #1, char 5: unterminated `s' command");
  });
});

describe('sed addresses', () => {
  for (const [line, want] of [
    ["sed -n '3p' n", 'three'],
    ["sed -n '$p' n", 'six'],
    ["sed -n '2,4p' n", lines('two', 'three', 'four')],
    ["sed -n '4,2p' n", 'four'],
    ["sed -n '/two/,+1p' n", lines('two', 'three')],
    ["sed -n '2,~4p' n", lines('two', 'three', 'four')],
    ["sed -n '/two/,/four/p' n", lines('two', 'three', 'four')],
    ["sed -n '0~2p' n", lines('two', 'four', 'six')],
    ["sed -n '2~3p' n", lines('two', 'five')],
    ["sed -n '1~0p' n", 'one'],
    ["sed -n '0,/o/p' n", 'one'],
    ["sed -n '1,/o/p' n", lines('one', 'two')],
    ["sed '$!d' n", 'six'],
    ["sed '1 ! d' n", 'one'],
    ["sed '2,1!d' n", 'two'],
    ["sed -n '/T/Ip' n", lines('two', 'three')],
    ["sed -n '\\,o,p' n", lines('one', 'two', 'four')],
    ["sed -n '/f/,$p' n", lines('four', 'five', 'six')],
  ]) it(line, () => assert.equal(out(line), want));
});

describe('sed s command', () => {
  for (const [line, want] of [
    ["echo hello | sed 's/l/L/'", 'heLlo'],
    ["echo hello | sed 's/l/L/g'", 'heLLo'],
    ["echo hello | sed 's/l/L/2'", 'helLo'],
    ["echo aaaa | sed 's/a/b/2g'", 'abbb'],
    ["echo Hello | sed 's/h/J/i'", 'Jello'],
    ["echo hello | sed -n 's/l/L/p'", 'heLlo'],
    ["echo hello | sed -n 's/z/L/p'", ''],
    ["echo hello | sed 's/l*/[&]/g'", '[]h[]e[ll]o[]'],
    ["echo 'a/b]c' | sed 's/x*/-/g'", '-a-/-b-]-c-'],
    ["echo 'a/b]c' | sed 's/b*/-/2'", 'a-/b]c'],
    ["echo abc | sed 's/\\(a\\)\\(b\\)/\\2\\1/'", 'bac'],
    ["echo abc | sed -E 's/(a)(b)/\\2\\1/'", 'bac'],
    ["echo abc | sed 's/(a)/x/'", 'abc'],
    ["echo 'a(b' | sed 's/(/[/'", 'a[b'],
    ["echo aab | sed 's/a\\+/X/'", 'Xb'],
    ["echo 'a+b' | sed 's/a+/X/'", 'Xb'],
    ["echo aaab | sed 's/a\\{2\\}/X/'", 'Xab'],
    ["echo aaab | sed -E 's/a{2,}/X/'", 'Xb'],
    ["echo 'a*b' | sed 's/*/X/'", 'aXb'],
    ["echo 'a^b$c' | sed 's/a^b/X/'", 'X$c'],
    ["echo 'a^b$c' | sed 's/b$c/X/'", 'a^X'],
    ["echo 'a^b$c' | sed 's/a^b$/X/'", 'a^b$c'],
    ["echo a/b | sed 's|/|-|'", 'a-b'],
    ["echo a/b | sed 's#/#-#'", 'a-b'],
    ["echo a/b | sed 's/\\//-/'", 'a-b'],
    ["echo 'a|b' | sed 's|a\\|b|X|'", 'X'],
    ["echo 'a.b' | sed 's.a\\.b.X.'", 'X'],
    ["echo 'axb' | sed 's.a\\.b.X.'", 'X'],
    ["echo ab | sed 's/a/x\\ny/'", 'x\nyb'],
    ["echo ab | sed 's/a/\\t/'", '\tb'],
    ["echo 'a/b]c' | sed 's/[/]/X/'", 'aXb]c'],
    ["echo 'a/b]c' | sed 's/[]]/Q/'", 'a/bQc'],
    ["echo 'a1b2' | sed 's/[[:digit:]]/#/g'", 'a#b#'],
    ["echo hello world | sed 's/\\w\\+/[&]/g'", '[hello] [world]'],
    ["echo hello world | sed 's/\\<./\\u&/g'", 'Hello World'],
    ["echo hello | sed 's/.*/\\U&/'", 'HELLO'],
    ["echo 'a/b]c' | sed 's/a/\\U&x\\E-y/'", 'AX-y/b]c'],
    ["echo cat | sed 's/cat/[\\&]/'", '[&]'],
    ["echo abc | sed 's/b/X/;s/c/Y/'", 'aXY'],
  ]) it(line, () => assert.equal(out(line), want));
});

describe('sed commands', () => {
  for (const [line, want] of [
    ["sed '2,5d' n", lines('one', 'six')],
    ["sed -n '2{p;p}' n", lines('two', 'two')],
    ["sed '2q' n", lines('one', 'two')],
    ["sed '2Q' n", 'one'],
    ["sed -n '$=' n", '6'],
    ["sed '=' f1", lines('1', 'a', '2', 'b')],
    ["sed 'y/abc/xyz/' f1", lines('x', 'y')],
    ["echo 'a/b]c' | sed 'y/a\\/b/123/'", '123]c'],
    ["sed '1a hello world' f1", lines('a', 'hello world', 'b')],
    ["sed '1a\\  hi' f1", lines('a', '  hi', 'b')],
    ["sed '$a end' f1", lines('a', 'b', 'end')],
    ["sed '1i top' f1", lines('top', 'a', 'b')],
    ["sed 'a  x;p' f1", lines('a', 'x;p', 'b', 'x;p')],
    ["sed 'a foo\\nbar' f1", lines('a', 'foo', 'bar', 'b', 'foo', 'bar')],
    ["sed '2,4c changed' n", lines('one', 'changed', 'five', 'six')],
    ["sed '2,4!c changed' n", lines('changed', 'two', 'three', 'four', 'changed', 'changed')],
    ["sed '2c\\\nnew' f1", lines('a', 'new')],
    ["sed 's/e/E/;2d;=' n", lines('1', 'onE', '3', 'thrEe', '4', 'four', '5', 'fivE', '6', 'six')],
    ["sed -n '/t/{s/t/T/;p}' n", lines('Two', 'Three')],
    ["sed 'n;d' n", lines('one', 'three', 'five')],
    ["sed '$!n;s/^/>/' f1", lines('a', '>b')],
    ["sed ':a;s/^a/b/;ta' f1", lines('b', 'b')],
    ["sed -n '/a/{s/a/X/;tx};p;:x' f1", 'b'],
    ["sed '/a/bend;s/./Z/;:end' f1", lines('a', 'Z')],
    ["sed 's/a/A/;T;s/A/AA/' f1", lines('AA', 'b')],
    ["sed '2{s/t/T/;s/w/W/}' n", lines('one', 'TWo', 'three', 'four', 'five', 'six')],
    ["sed -n -e 1p -e '$p' n", lines('one', 'six')],
    ["sed -n '1p\n$p' n", lines('one', 'six')],
    ["sed '#n\np' f1", lines('a', 'b')],
    ["sed 's/a/b/ # comment' f1", lines('b', 'b')],
    ["sed -n '//p' f1 2>&1", "sed: -e expression #1, char 0: no previous regular expression"],
    ["sed -n '/a/p;//p' f1", lines('a', 'a')],
    ["sed '/o/s//0/g' n", lines('0ne', 'tw0', 'three', 'f0ur', 'five', 'six')],
  ]) it(JSON.stringify(line), () => assert.equal(out(line), want));
});

describe('sed options, files and stdin', () => {
  it('-n with p prints once; without -n twice', () => {
    assert.equal(out("sed -n p f1"), lines('a', 'b'));
    assert.equal(out("sed p f1"), lines('a', 'a', 'b', 'b'));
    assert.equal(out("sed 'p;p' -n f1"), lines('a', 'a', 'b', 'b'));
  });
  it('files are one stream; -s keeps them separate', () => {
    assert.equal(out("sed -n '1p;$p' f1 f2"), lines('a', 'd'));
    assert.equal(out("sed -s -n '1p;$p' f1 f2"), lines('a', 'b', 'c', 'd'));
    assert.equal(out("sed -s '1d;=' f1 f2"), lines('2', 'b', '2', 'd'));
  });
  it('stdin when no file, and - as stdin', () => {
    assert.equal(out("printf 'x\\ny\\n' | sed -n '$='"), '2');
    assert.equal(out("echo z | sed p - f1"), lines('z', 'z', 'a', 'a', 'b', 'b'));
  });
  it('-E, -r and --long forms', () => {
    assert.equal(out("echo ab12 | sed -E 's/[0-9]+/N/'"), 'abN');
    assert.equal(out("echo ab12 | sed -r 's/[0-9]+/N/'"), 'abN');
    assert.equal(out("echo ab12 | sed 's/[0-9]+/N/'"), 'ab12');
    assert.equal(out("sed --quiet --expression=2p f1"), 'b');
    assert.equal(out("sed -ne 2p f1"), 'b');
  });
  it('missing and directory inputs use GNU wording and exit codes', () => {
    const a = r('sed p nosuch f1');
    assert.equal(a.out, lines("sed: can't read nosuch: No such file or directory", 'a', 'a', 'b', 'b'));
    assert.equal(a.code, 2);
    const SQ = world();
    run(SQ, 'mkdir dd');
    const b = run(SQ, 'sed p dd f1');
    assert.equal(b.out, 'sed: read error on dd: Is a directory');
    assert.equal(b.code, 4);
  });
  it('q and Q take an exit code', () => {
    assert.deepEqual(r("sed '2q5' f1"), { out: lines('a', 'b'), code: 5 });
    assert.deepEqual(r("sed '1Q7' f1"), { out: '', code: 7 });
  });
});

describe('sed -i', () => {
  it('edits the file in place and prints nothing', () => {
    const SQ = world();
    assert.deepEqual(run(SQ, "sed -i 's/o/0/g' n"), { out: '', code: 0 });
    assert.equal(run(SQ, 'cat n').out, lines('0ne', 'tw0', 'three', 'f0ur', 'five', 'six'));
  });
  it('-i.bak keeps a backup; -n with p keeps only the printed lines', () => {
    const SQ = world();
    assert.equal(run(SQ, "sed -i.bak -n '2p' n").out, '');
    assert.equal(run(SQ, 'cat n').out, 'two');
    assert.equal(run(SQ, 'cat n.bak').out, SIX);
  });
  it('a * in the suffix is the file name', () => {
    const SQ = world();
    run(SQ, "sed '-ibk_*' 's/a/A/' f1");
    assert.equal(run(SQ, 'cat bk_f1').out, lines('a', 'b'));
    assert.equal(run(SQ, 'cat f1').out, lines('A', 'b'));
  });
  it('q stops: the file keeps only what was printed', () => {
    const SQ = world();
    run(SQ, 'sed -i 2q n');
    assert.equal(run(SQ, 'cat n').out, lines('one', 'two'));
  });
  it('a missing file is reported, the others are still edited', () => {
    const SQ = world();
    const x = run(SQ, "sed -i 's/a/A/' nosuch f1");
    assert.equal(x.out, "sed: can't read nosuch: No such file or directory");
    assert.equal(x.code, 2);
    assert.equal(run(SQ, 'cat f1').out, lines('A', 'b'));
  });
  it('a read-only file is still edited (GNU sed replaces the file)', () => {
    const SQ = world();
    run(SQ, 'chmod 444 f1');
    assert.equal(run(SQ, "sed -i 's/a/A/' f1").code, 0);
    assert.equal(run(SQ, 'cat f1').out, lines('A', 'b'));
  });
  it('no files, or a directory', () => {
    assert.deepEqual(r("echo a | sed -i 's/a/b/'"), { out: 'sed: no input files', code: 4 });
    const SQ = world();
    run(SQ, 'mkdir dd');
    assert.deepEqual(run(SQ, "sed -i p dd"), { out: "sed: couldn't edit dd: not a regular file", code: 4 });
  });
});

describe('sed errors (GNU wording)', () => {
  for (const [script, msg] of [
    ["s/a/b", "char 5: unterminated `s' command"],
    ["s/a/b/q", "char 7: unknown option to `s'"],
    ['k', "char 1: unknown command: `k'"],
    ['y/abc/xy/', "char 9: strings for `y' command are different lengths"],
    ['y/a/', "char 4: unterminated `y' command"],
    ['y/a/b/g', 'char 7: extra characters after command'],
    ['s/a/\\1/', "char 7: invalid reference \\1 on `s' command's RHS"],
    ['/a', 'char 2: unterminated address regex'],
    ['1,', "char 2: unexpected `,'"],
    ['a', "char 1: expected \\ after `a', `c' or `i'"],
    ['{p', "char 0: unmatched `{'"],
    ['p}', "char 2: unexpected `}'"],
    ['dp', 'char 2: extra characters after command'],
    ['s/a/b/gg', "char 8: multiple `g' options to `s' command"],
    ['s/a/b/pp', "char 8: multiple `p' options to `s' command"],
    ['s/a/b/0', "char 7: number option to `s' command may not be zero"],
    ['s/a/b/2g3', "char 9: multiple number options to `s' command"],
    ['1!!d', "char 3: multiple `!'s"],
    ['0p', 'char 2: invalid usage of line address 0'],
    ['1,2q', 'char 4: command only uses one address'],
    ['1:a', "char 2: : doesn't want any addresses"],
    [':', 'char 1: ":" lacks a label'],
    ['s/\\(a/x/', 'char 8: Unmatched ( or \\('],
    ['s/\\)/x/', 'char 7: Unmatched ) or \\)'],
    ['s/[a/x/', "char 7: unterminated `s' command"],
    ['s/a\\{2,1\\}/x/', 'char 13: Invalid content of \\{\\}'],
    ['s/\\(a\\)\\2/x/', 'char 12: Invalid back reference'],
    ['s//x/', 'char 0: no previous regular expression'],
  ]) it(script, () => {
    const x = r(`sed '${script}' f1`);
    assert.equal(x.out, `sed: -e expression #1, char ${msg.replace(/^char /, '')}`);
    assert.equal(x.code, 1);
  });
  it('the expression number follows -e', () => {
    assert.equal(out("sed -e p -e k f1"), "sed: -e expression #2, char 1: unknown command: `k'");
  });
  it('ERE errors', () => {
    assert.equal(out("sed -E 's/(a/x/' f1"), 'sed: -e expression #1, char 7: Unmatched ( or \\(');
    assert.equal(out("sed -E 's/+a/x/' f1"), 'sed: -e expression #1, char 7: Invalid preceding regular expression');
    assert.equal(out("sed -E 's/a{/x/' f1"), 'sed: -e expression #1, char 7: Unmatched \\{');
  });
  it('a missing label', () => {
    assert.deepEqual(r("sed 'b foo' f1"), { out: "sed: can't find label for jump to `foo'", code: 4 });
  });
  it('the script is parsed before anything runs', () => {
    const SQ = world();
    assert.match(run(SQ, "sed -i 's/a/A/;k' f1").out, /unknown command/);
    assert.equal(run(SQ, 'cat f1').out, lines('a', 'b'));
  });
});

describe('sed unsupported and caps', () => {
  for (const c of ['N', 'D', 'P', 'h', 'H', 'g', 'G', 'x', 'l']) it(`command ${c}`, () => {
    assert.deepEqual(r(`sed '${c}' f1`), { out: `this practice shell does not support sed command '${c}' yet`, code: 1 });
  });
  it('w r e', () => {
    for (const c of ['w out', 'r f2', 'e']) assert.match(out(`sed '${c}' f1`), /^this practice shell does not support sed command '[wre]' yet$/);
    assert.equal(out("sed 's/a/b/w out' f1"), 'this practice shell does not support sed s///w yet');
  });
  it('an endless branch loop stops with the step message', () => {
    const t = Date.now();
    const x = r("sed ':a;ba' f1");
    assert.match(x.out, /this practice shell stopped the command/);
    assert.ok(Date.now() - t < 3000);
    assert.equal(r('echo ok').out, 'ok');
  });
  it('a pattern space that keeps doubling is stopped', () => {
    const x = r("sed ':a;s/.*/&&/;ta' f1");
    assert.match(x.out, /this practice shell stopped the command/);
  });
  it('s/x*/y/g on a huge line and y with a huge set finish quickly', () => {
    const SQ = world();
    SQ.S.vars.big = 'ab'.repeat(200000);
    run(SQ, 'echo "$big" > big');
    const t = Date.now();
    const x = run(SQ, "sed 's/x*/y/g' big | wc -c");
    assert.equal(x.code, 0);
    const set = 'abcdefghij'.repeat(500);
    run(SQ, `sed 'y/${set}/${set.toUpperCase()}/' big | wc -l`);
    assert.ok(Date.now() - t < 5000, `took ${Date.now() - t}ms`);
  });
  it('risky regexes are refused', () => {
    assert.equal(out("echo aaaa | sed -E 's/(a+)+$/x/'"), 'sed: pattern too complex for this practice shell');
    assert.equal(out("echo aaaa | sed 's/\\(a*\\)*$/x/'"), 'sed: pattern too complex for this practice shell');
  });
});
