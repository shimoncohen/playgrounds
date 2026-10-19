// Conditions and stateful builtins (Task 7): [ test [[ (( true false : read shift unset source exit echo -e.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const out = (line, SQ = loadShell()) => run(SQ, line).out;
const code = (line, SQ = loadShell()) => run(SQ, line).code;
const TAB = '\t';
const NOT_TYPING =
  'read: this practice shell cannot wait for typing. Pipe input in (echo Ada | read name) or use a here-string: read name <<< Ada';

describe('[ and test', () => {
  it('file tests', () => {
    assert.equal(out('[ -f journal.txt ] && echo yes'), 'yes');
    assert.equal(out('[ -d nothing ] || echo no'), 'no');
    assert.equal(out('[ -d . ] && echo dir'), 'dir');
    assert.equal(out('[ -e journal.txt ] && echo e'), 'e');
    assert.equal(code('test -s journal.txt'), 0);
    assert.equal(code('touch empty.txt; test -s empty.txt'), 1);
    assert.equal(out('[ ! -d nothing ] && echo ok'), 'ok');
    assert.equal(out('[ ! -d journal.txt ] && echo ok'), 'ok');
  });
  it('-L, -r -w -x use the virtual node', () => {
    const SQ = loadShell();
    run(SQ, 'ln -s journal.txt sl; touch plain.txt');
    assert.equal(code('[ -L sl ]', SQ), 0);
    assert.equal(code('[ -L journal.txt ]', SQ), 1);
    assert.equal(code('[ -f sl ]', SQ), 0, 'tests follow the link');
    assert.equal(code('[ -x plain.txt ]', SQ), 1);
    run(SQ, 'chmod +x plain.txt');
    assert.equal(code('[ -x plain.txt ]', SQ), 0);
    assert.equal(code('[ -r plain.txt ]', SQ), 0);
    run(SQ, 'chmod 444 plain.txt');
    assert.equal(code('[ -w plain.txt ]', SQ), 1);
    assert.equal(code('[ -r nothing ]', SQ), 1);
  });
  it('strings and integers', () => {
    assert.equal(out('[ 5 -gt 3 ] && echo big'), 'big');
    assert.equal(code('[ "a" = "a" ]'), 0);
    assert.equal(code('[ a == b ]'), 1);
    assert.equal(code('[ a != b ]'), 0);
    assert.equal(code('[ 3 -le 3 ] && [ 3 -ge 3 ] && [ 2 -lt 3 ] && [ 2 -ne 3 ] && [ 3 -eq 3 ]'), 0);
    assert.equal(code('[ -z "" ]'), 0);
    assert.equal(code('[ -n "" ]'), 1);
    assert.equal(code('[ -n x ]'), 0);
    assert.equal(code('[ abc ]'), 0);
    assert.equal(code('[ "" ]'), 1);
    assert.equal(code('[ a = a -a b = b ]'), 0);
    assert.equal(code('[ a = a -a b = c ]'), 1);
    assert.equal(code('[ a = b -o b = b ]'), 0);
    assert.equal(code('[ \\( a = a \\) ]'), 0);
  });
  it('errors: integer expression, missing ], too many', () => {
    assert.deepEqual(run(loadShell(), '[ 3 -gt abc ]'), { out: 'bash: [: abc: integer expression expected', code: 2 });
    assert.deepEqual(run(loadShell(), '[ 3 -eq 3'), { out: "bash: [: missing ']'", code: 2 });
    assert.equal(code('[ a b c d e ]'), 2);
    assert.match(out('[ a b c d e ]'), /^bash: \[: too many arguments$/);
    assert.match(out('test 3 -gt abc'), /^bash: test: abc: integer expression expected$/);
  });
  it('empty and one-argument forms', () => {
    assert.equal(code('[ ]'), 1);
    assert.equal(code('test'), 1);
    assert.equal(code('[ -f ]'), 0, 'real bash: one argument is a string test, -f is non-empty');
    assert.equal(code('[ ! ]'), 0);
  });
  it('while / until loops with [', () => {
    assert.equal(out('i=0; while [ $i -lt 3 ]; do echo $i; i=$((i+1)); done'), '0\n1\n2');
    assert.equal(out('n=3; until [ $n -eq 0 ]; do echo $n; n=$((n-1)); done'), '3\n2\n1');
  });
  it('break, continue and break 2', () => {
    assert.equal(out('for i in 1 2 3 4 5; do [ $i -eq 3 ] && break; echo $i; done'), '1\n2');
    assert.equal(out('for i in 1 2 3; do [ $i -eq 2 ] && continue; echo $i; done'), '1\n3');
    assert.equal(out('for a in 1 2; do for b in x y; do [ $b = y ] && break 2; echo $a$b; done; done'), '1x');
  });
});

describe('[[ ]]', () => {
  it('glob and literal right-hand sides', () => {
    assert.equal(out('[[ "$USER" == exp* ]] && echo m'), 'm');
    assert.equal(code('[[ abc == a?c ]]'), 0);
    assert.equal(code('[[ abc != a* ]]'), 1);
    assert.equal(code('[[ "a*" == "a*" ]]'), 0);
    assert.equal(code('[[ abc == "a*" ]]'), 1, 'quoted RHS is literal');
    assert.equal(code('[[ a = a ]]'), 0);
  });
  it('no word splitting of an unquoted variable', () => {
    assert.equal(code('x="a b"; [[ $x == "a b" ]]'), 0);
    assert.equal(code('x="a b"; [[ "$x" == "a b" ]]'), 0);
    assert.equal(code('x="a b"; [[ $x ]]'), 0);
    assert.equal(code('x=; [[ $x ]]'), 1);
  });
  it('logic, grouping, string tests', () => {
    assert.equal(code('[[ -n x && -z "" ]]'), 0);
    assert.equal(code('[[ -n x && -n "" ]]'), 1);
    assert.equal(code('[[ -z x || -n x ]]'), 0);
    assert.equal(code('[[ ! -z x ]]'), 0);
    assert.equal(code('[[ ( a == b || a == a ) && c == c ]]'), 0);
    assert.equal(code('[[ a < b ]]'), 0);
    assert.equal(code('[[ b < a ]]'), 1);
    assert.equal(code('[[ b > a ]]'), 0);
    assert.equal(code('[[ 3 -lt 10 ]]'), 0);
    assert.equal(code('x=5; [[ x -eq 5 ]]'), 0);
  });
  it('short-circuits: the skipped side does not run', () => {
    assert.equal(out('[[ a == a || $(echo ran >&2) ]]; echo done'), 'done');
    assert.equal(out('c=0; [[ a == b && $((c=1)) -eq 1 ]]; echo $c'), '0');
  });
  it('file tests', () => {
    assert.equal(code('[[ -e journal.txt && -f journal.txt ]]'), 0);
    assert.equal(code('[[ -d journal.txt ]]'), 1);
    assert.equal(code('[[ -s journal.txt ]]'), 0);
  });
  it('=~ uses a guarded JavaScript regex', () => {
    assert.equal(code('[[ abc =~ ^a.c$ ]]'), 0);
    assert.equal(out('[[ abd =~ ^a.c$ ]]; echo $?'), '1');
    assert.equal(code('[[ a.c =~ ^a\\.c$ ]]'), 0);
    assert.equal(code('[[ abc =~ ^a\\.c$ ]]'), 1);
    assert.equal(code('[[ abab =~ ^(ab)+$ ]]'), 0);
    assert.equal(code('[[ abc =~ "a.c" ]]'), 1, 'quoted part is literal');
    assert.match(out('[[ aaaa =~ (a+)+$ ]]'), /too complex/);
  });
  it('BASH_REMATCH is unsupported', () => {
    assert.equal(out('[[ abc =~ b ]]; echo $BASH_REMATCH'), 'this practice shell does not support BASH_REMATCH yet');
    assert.equal(out('echo ${BASH_REMATCH[1]}'), 'this practice shell does not support BASH_REMATCH yet');
  });
  it('syntax errors are one message, status 2', () => {
    for (const l of ['[[ a == ]]', '[[ ]]', '[[ ( a == a ]]', '[[ a == a ) ]]', '[[ a b ]]', '[[ a == b && ]]'])
      assert.deepEqual(run(loadShell(), l), { out: 'bash: syntax error in conditional expression', code: 2 }, l);
  });
  it('works in if and while', () => {
    assert.equal(out('if [[ -f journal.txt ]]; then echo has; fi'), 'has');
    assert.equal(out('i=0; while [[ $i -lt 2 ]]; do echo $i; ((i++)); done'), '0\n1');
  });
});

describe('(( ))', () => {
  it('status and assignment', () => {
    assert.equal(out('(( 3 > 2 )) && echo y'), 'y');
    assert.equal(out('(( x=5 )); echo $x'), '5');
    assert.equal(out('x=7; echo $((x))'), '7');
    assert.equal(code('(( 0 ))'), 1);
  });
  it('errors print ((: reason with status 1', () => {
    const r = run(loadShell(), '(( 1 / 0 ))');
    assert.equal(r.code, 1);
    assert.match(r.out, /^bash: \(\(: .*division by 0/);
  });
});

describe('true false :', () => {
  it('statuses', () => {
    assert.equal(out('true; echo $?'), '0');
    assert.equal(out('false; echo $?'), '1');
    assert.equal(out(': ; echo $?'), '0');
    assert.equal(out('! true; echo $?'), '1');
    assert.equal(out('! false && echo ok'), 'ok');
    assert.equal(out('if true; then echo t; fi'), 't');
    assert.equal(out('false || echo f'), 'f');
    assert.equal(out(': ignored args $(echo x)'), '');
  });
  it('until false is stopped by the steps cap and the shell stays usable', () => {
    const SQ = loadShell();
    const r = run(SQ, 'until false; do :; done');
    assert.match(r.out, /stopped the command/);
    assert.equal(r.code, 1);
    assert.equal(run(SQ, 'echo fine').out, 'fine');
    assert.equal(SQ.rt.frames.length, 0);
  });
});

describe('read', () => {
  it('reads lines from a redirected file', () => {
    const SQ = loadShell();
    const j = run(SQ, 'cat journal.txt').out.split('\n');
    assert.equal(run(SQ, 'while read l; do echo "got: $l"; done < journal.txt').out, j.map((l) => 'got: ' + l).join('\n'));
  });
  it('splits on whitespace; the last name gets the rest', () => {
    assert.equal(out("printf 'a b\\n' | { read x y; echo $y; }"), 'b');
    assert.equal(out('read first rest <<< "alpha beta gamma"; echo $rest'), 'beta gamma');
    assert.equal(out('read a b c <<< "  one   two  "; echo "[$a][$b][$c]"'), '[one][two][]');
    assert.equal(out('read a b <<< "  x   y   z  "; echo "[$a][$b]"'), '[x][y   z]');
  });
  it('REPLY when no name', () => {
    assert.equal(out('read <<< "  hello  world "; echo "[$REPLY]"'), '[  hello  world ]');
  });
  it('-r keeps backslashes, plain read removes them', () => {
    assert.equal(out("read -r x <<< 'a\\tb'; echo $x"), 'a\\tb');
    assert.equal(out("read x <<< 'a\\tb'; echo $x"), 'atb');
    assert.equal(out("read x y <<< 'a\\ b c'; echo \"[$x][$y]\""), '[a b][c]');
  });
  it('-p prompt prints nothing', () => {
    assert.equal(out('read -p "Name: " n <<< Ada; echo $n'), 'Ada');
  });
  it('unsupported options', () => {
    assert.match(out('read -s x <<< a'), /this practice shell does not support read -s yet/);
    assert.match(out('read -n 1 x <<< a'), /does not support read -n yet/);
  });
  it('invalid name', () => {
    const r = run(loadShell(), 'read 1x <<< a');
    assert.equal(r.code, 1);
    assert.match(r.out, /read: `1x': not a valid identifier/);
  });
  it('bare typed line: cannot wait for typing, status 1', () => {
    assert.deepEqual(run(loadShell(), 'read x'), { out: NOT_TYPING, code: 1 });
  });
  it('EOF returns 1, the variable is emptied, and the loop ends', () => {
    const SQ = loadShell();
    run(SQ, 'x=old');
    assert.equal(run(SQ, 'read x < /dev/null; echo "$? [$x]"').out, '1 []');
    assert.equal(out('printf "a\\nb\\n" | while read l; do echo "<$l>"; done; echo end'), '<a>\n<b>\nend');
  });
  it('last line without a trailing newline is still read (status 0)', () => {
    const SQ = loadShell();
    run(SQ, 'printf "one\\ntwo" > t.txt');
    assert.equal(run(SQ, 'while read l; do echo "[$l]"; done < t.txt').out, '[one]\n[two]');
    assert.equal(out('read x <<< "tail"; echo $?'), '0');
  });
  it('shares the stdin box with other commands in the loop', () => {
    const SQ = loadShell();
    run(SQ, 'printf "1\\n2\\n3\\n4\\n" > n.txt');
    assert.equal(run(SQ, 'while read a; do read b; echo "$a$b"; done < n.txt').out, '12\n34');
  });
});

describe('shift', () => {
  it('shifts function arguments', () => {
    assert.equal(out('f() { shift; echo $# $1; }; f a b c'), '2 b');
    assert.equal(out('f() { shift 2; echo "$# $1"; }; f a b c'), '1 c');
    assert.equal(out('f() { shift 0; echo $#; }; f a b'), '2');
  });
  it('too far is status 1 and leaves the arguments', () => {
    assert.equal(out('f() { shift 5; echo "$? $#"; }; f a b'), '1 2');
  });
  it('at the base shell: status 1, args stay empty', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'shift; echo $?').out, '1');
    assert.equal(run(SQ, 'echo $#').out, '0');
  });
  it('a loop over arguments with shift', () => {
    assert.equal(out('f() { while [ $# -gt 0 ]; do echo $1; shift; done; }; f x y z'), 'x\ny\nz');
  });
  it('errors for a non-number', () => {
    const r = run(loadShell(), 'shift abc');
    assert.equal(r.code, 1);
    assert.match(r.out, /^bash: shift: abc: numeric argument required$/);
  });
});

describe('unset', () => {
  it('removes a variable', () => {
    assert.equal(out('V=1; unset V; echo "[$V]"'), '[]');
    assert.equal(out('V=1; unset -v V; echo "[${V-gone}]"'), '[gone]');
    assert.equal(code('unset NOPE'), 0);
  });
  it('-f removes a function; plain unset leaves it', () => {
    assert.equal(out('f() { echo hi; }; unset -f f; f 2>&1 | head -1'), 'bash: f: command not found');
    assert.equal(out('f() { echo hi; }; unset -v f; f'), 'hi');
  });
  it('invalid identifier', () => {
    const r = run(loadShell(), 'unset 1x');
    assert.equal(r.code, 1);
    assert.match(r.out, /unset: `1x': not a valid identifier/);
  });
  it('unsets an exported variable', () => {
    assert.equal(out('export V=1; unset V; export | grep -c V; echo "[$V]"'), '0\n[]');
  });
});

describe('source and .', () => {
  it('runs the file in the current shell: variables and functions persist', () => {
    const SQ = loadShell();
    run(SQ, "echo 'greet() { echo \"hello $1\"; }' > lib.sh");
    run(SQ, "echo 'X=42' >> lib.sh");
    assert.equal(run(SQ, 'source lib.sh; greet Ada; echo $X').out, 'hello Ada\n42');
    assert.equal(run(SQ, '. lib.sh; greet Bo').out, 'hello Bo');
    assert.equal(run(SQ, '. ./lib.sh; greet Cy').out, 'hello Cy');
  });
  it('arguments become $1.. and are restored afterwards', () => {
    const SQ = loadShell();
    run(SQ, "echo 'echo \"$# $1 $2 $0\"' > a.sh");
    assert.equal(run(SQ, 'source a.sh one two').out, '2 one two a.sh');
    assert.equal(run(SQ, 'f() { source a.sh x; echo "$# $1"; }; f p q').out, '1 x  a.sh\n2 p');
    assert.equal(SQ.rt.frames.length, 0);
  });
  it('return ends the sourced file with its status', () => {
    const SQ = loadShell();
    run(SQ, "echo 'echo before' > r.sh; echo 'return 7' >> r.sh; echo 'echo after' >> r.sh");
    assert.deepEqual(run(SQ, 'source r.sh'), { out: 'before', code: 7 });
    assert.equal(run(SQ, 'source r.sh; echo $?').out, 'before\n7');
  });
  it('exit n inside a sourced file ends that script only', () => {
    const SQ = loadShell();
    run(SQ, "echo 'echo in' > e.sh; echo 'exit 3' >> e.sh; echo 'echo no' >> e.sh");
    assert.deepEqual(run(SQ, 'source e.sh'), { out: 'in', code: 3 });
    assert.equal(run(SQ, 'source e.sh; echo after $?').out, 'in\nafter 3');
  });
  it('local at the top of a sourced file is an error; inside a function it works', () => {
    const SQ = loadShell();
    run(SQ, "echo 'local z=1' > l.sh; echo 'echo $z' >> l.sh");
    assert.match(run(SQ, 'source l.sh').out, /bash: local: can only be used in a function/);
    assert.equal(run(SQ, 'z=out; f() { source l.sh; }; f; echo $z').out, '1\nout');
  });
  it('missing, directory, and no argument', () => {
    assert.deepEqual(run(loadShell(), 'source nothing'), { out: 'bash: source: nothing: No such file or directory', code: 1 });
    assert.deepEqual(run(loadShell(), '. nothing'), { out: 'bash: .: nothing: No such file or directory', code: 1 });
    assert.equal(run(loadShell(), 'source forest 2>&1; echo $?').out, 'bash: source: forest: is a directory\n1');
    assert.equal(run(loadShell(), 'source').code, 2);
  });
  it('recursion is bounded', () => {
    const SQ = loadShell();
    run(SQ, "echo 'source self.sh' > self.sh");
    const r = run(SQ, 'source self.sh');
    assert.equal(r.out, 'bash: source: maximum source nesting level exceeded');
    assert.equal(r.code, 1);
    assert.equal(SQ.rt.frames.length, 0);
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
  it('a syntax error prints once and runs nothing from the file', () => {
    const SQ = loadShell();
    run(SQ, "echo 'echo first' > s.sh; echo 'if then' >> s.sh");
    const r = run(SQ, 'source s.sh');
    assert.equal(r.code, 2);
    assert.match(r.out, /^bash: syntax error/);
    assert.ok(!r.out.includes('first'));
    assert.equal(r.out.split('\n').length, 1);
  });
  it('whole-file execution keeps the step cap', () => {
    const SQ = loadShell();
    run(SQ, "echo 'while true; do :; done' > loop.sh");
    const r = run(SQ, 'source loop.sh');
    assert.match(r.out, /stopped the command/);
    assert.equal(run(SQ, 'echo fine').out, 'fine');
  });
  it('multi-line files with compounds work', () => {
    const SQ = loadShell();
    run(SQ, "printf 'for i in 1 2\\ndo\\n  echo n$i\\ndone\\n' > m.sh");
    assert.equal(run(SQ, 'source m.sh').out, 'n1\nn2');
  });
  it('commands inside are logged', () => {
    const SQ = loadShell();
    run(SQ, "echo 'echo hi' > q.sh");
    run(SQ, 'source q.sh');
    assert.deepEqual(SQ.rt.log.map((e) => e.name), ['echo', 'source']);
  });
});

describe('exit', () => {
  it('on a typed line it prints the friendly message', () => {
    assert.match(run(loadShell(), 'exit').out, /There is nowhere to exit to\. Your progress saves automatically\./);
    assert.equal(run(loadShell(), 'echo hi; exit 3').out, 'hi\nThere is nowhere to exit to. Your progress saves automatically.');
  });
  it('inside a subshell it sets the subshell status', () => {
    assert.equal(out('(exit 4); echo $?'), '4');
    assert.equal(out('echo "[$(exit 2; echo no)]"'), '[]');
  });
  it('inside a script run with bash it ends the script', () => {
    const SQ = loadShell();
    run(SQ, "echo 'echo one' > x.sh; echo 'exit 3' >> x.sh; echo 'echo two' >> x.sh");
    assert.deepEqual(run(SQ, 'bash x.sh'), { out: 'one', code: 3 });
  });
  it('argument checks', () => {
    const SQ = loadShell();
    run(SQ, "echo 'exit abc' > y.sh");
    const r = run(SQ, 'bash y.sh');
    assert.equal(r.code, 2);
    assert.match(r.out, /bash: exit: abc: numeric argument required/);
    assert.match(out('echo "exit 1 2" > z.sh; bash z.sh'), /bash: exit: too many arguments/);
  });
  it('exit n wraps modulo 256; a function in a sourced file can exit it', () => {
    const SQ = loadShell();
    run(SQ, "echo 'f() { exit 257; }' > w.sh; echo 'f; echo no' >> w.sh");
    assert.equal(run(SQ, 'source w.sh').code, 1);
  });
});

describe('echo flags', () => {
  it('-e expands escapes', () => {
    assert.equal(out('echo -e "a\\tb"'), `a${TAB}b`);
    assert.equal(out('echo -e "a\\nb"'), 'a\nb');
    assert.equal(out('echo -e "a\\\\b"'), 'a\\b');
    assert.equal(out('echo -e "\\x41\\0102"'), 'AB');
  });
  it('without -e escapes stay; -E too', () => {
    assert.equal(out('echo "a\\tb"'), 'a\\tb');
    assert.equal(out('echo -E "a\\tb"'), 'a\\tb');
    assert.equal(out('echo -eE "a\\tb"'), 'a\\tb');
    assert.equal(out('echo -Ee "a\\tb"'), `a${TAB}b`);
  });
  it('-n and combined flags are removed from the output', () => {
    assert.equal(out('echo -n hi'), 'hi');
    assert.equal(out('echo -ne "a\\nb"'), 'a\nb');
    assert.equal(out('echo -n -e "a\\tb"'), `a${TAB}b`);
  });
  it('unknown flags stay literal', () => {
    assert.equal(out('echo -x hi'), '-x hi');
    assert.equal(out('echo -nx hi'), '-nx hi');
    assert.equal(out('echo -n -x hi'), '-x hi');
    assert.equal(out('echo -- hi'), '-- hi');
  });
});

describe('builtin list: type, which, suggest', () => {
  it('type and which', () => {
    assert.equal(out('type ['), '[ is a shell builtin');
    assert.equal(out('type test'), 'test is a shell builtin');
    for (const b of ['read', 'shift', 'unset', 'exit', 'true', 'false', ':', '.', 'source', 'local', 'return', 'break', 'continue'])
      assert.equal(out(`type ${b}`), `${b} is a shell builtin`, b);
    assert.equal(out('which test'), '/usr/bin/test');
    assert.equal(out('f() { :; }; type f'), 'f is a function');
  });
  it('suggest still finds the old commands', () => {
    assert.match(out('lss'), /Did you mean: ls\?/);
    assert.match(out('hed'), /Did you mean: head\?/);
  });
});
