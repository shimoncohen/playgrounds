// Interpreter core (Task 6a): compound commands, lists, pipelines, here-strings/here-docs, subshells, loop control.
// Functions, frames, local and return (Task 6b).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const out = (line, SQ = loadShell()) => run(SQ, line).out;

describe('compound commands', () => {
  it('if / else picks a branch by exit status', () => {
    assert.equal(out('if echo ok >/dev/null; then echo y; else echo n; fi'), 'y');
    assert.equal(out('if ls nothing 2>/dev/null; then echo y; else echo n; fi'), 'n');
  });
  it('elif runs the first true branch; no true branch and no else is status 0', () => {
    assert.equal(out('if ls nothing 2>/dev/null; then echo a; elif echo >/dev/null; then echo b; else echo c; fi'), 'b');
    const SQ = loadShell();
    assert.equal(out('if ls nothing 2>/dev/null; then echo a; fi; echo $?', SQ), '0');
  });
  it('until with break', () => {
    assert.equal(out('until ls nothing 2>/dev/null; do echo a; break; done'), 'a');
  });
  it('while with continue and break counts', () => {
    const SQ = loadShell();
    assert.equal(out('for i in 1 2 3; do if echo $i | grep 2 >/dev/null; then continue; fi; echo $i; done', SQ), '1\n3');
    assert.equal(out('for a in 1 2; do for b in x y; do echo $a$b; break 2; done; done', SQ), '1x');
    assert.equal(out('for a in 1 2; do for b in x y; do continue 2; echo no; done; echo no; done; echo end', SQ), 'end');
  });
  it('for loops pipe, chain and redirect', () => {
    assert.equal(out('for i in 1 2 3; do echo $i; done | wc -l'), '3');
    assert.equal(out('for x in a b; do echo $x; done && echo end'), 'a\nb\nend');
    const SQ = loadShell();
    assert.equal(out('for i in 1 2; do echo $i; done > loop.txt; cat loop.txt', SQ), '1\n2');
  });
  it('for logs one entry with the expanded items, and one step per pass', () => {
    const SQ = loadShell();
    run(SQ, 'for f in *.txt; do echo $f; done');
    const e = SQ.rt.log.filter((x) => x.name === 'for');
    assert.equal(e.length, 1);
    assert.deepEqual([...e[0].args], ['journal.txt', 'readme.txt']);
    assert.equal(e[0].globbed, true);
    assert.equal(SQ.rt.log.filter((x) => x.name === 'echo').length, 2);
  });
  it('case matches glob patterns and alternatives', () => {
    assert.equal(out('case apple in a*) echo A;; b*) echo B;; esac'), 'A');
    assert.equal(out('case x in a|x) echo m;; esac'), 'm');
    assert.equal(out('case "a*" in "a*") echo lit;; esac'), 'lit');
    assert.equal(out('case ab in "a*") echo lit;; *) echo other;; esac'), 'other');
  });
  it('keyword entries are logged after the compound completes', () => {
    const SQ = loadShell();
    run(SQ, 'if echo a >/dev/null; then echo b; fi; case x in x) echo c;; esac');
    const names = SQ.rt.log.map((e) => e.name);
    assert.deepEqual(names, ['echo', 'echo', 'if', 'echo', 'case']);
    assert.equal(SQ.rt.log[2].code, 0);
  });
  it('{ } groups share one output stream', () => {
    assert.equal(out('{ echo a; echo b; } | wc -l'), '2');
  });
  it('( ) subshell keeps cd and variables to itself', () => {
    const SQ = loadShell();
    assert.equal(out('( cd forest; pwd ); pwd', SQ), '/home/explorer/forest\n/home/explorer');
    assert.equal(out('( X=1 ); echo "[$X]"', SQ), '[]');
  });
  it('! negates the status', () => {
    assert.equal(out('! echo a >/dev/null; echo $?'), '1');
    assert.equal(out('! ls nothing 2>/dev/null && echo yes'), 'yes');
  });
  it('(( )) sets the status from the value', () => {
    assert.equal(out('(( 2 > 1 )) && echo big'), 'big');
    assert.equal(out('(( 0 )); echo $?'), '1');
  });
});

describe('input to compounds and here-strings', () => {
  it('cat <<< feeds a here-string', () => {
    assert.equal(out('cat <<< "hi there"'), 'hi there');
    const SQ = loadShell();
    assert.equal(out('X=5; cat <<< "x is $X"', SQ), 'x is 5');
  });
  it('done < file feeds the loop body', () => {
    const SQ = loadShell();
    assert.equal(out('for l in a; do cat; done < journal.txt', SQ), out('cat journal.txt', SQ));
    assert.equal(out('for l in a b; do cat; done < readme.txt', SQ), out('cat readme.txt', SQ));
  });
  it('here-documents expand unless the delimiter is quoted', () => {
    const SQ = loadShell();
    assert.equal(out('X=7; cat <<EOF\nx=$X\nEOF', SQ), 'x=7');
    assert.equal(out("cat <<'EOF'\nx=$X\nEOF", SQ), 'x=$X');
    assert.equal(out('cat <<-EOF\n\t\tindented\n\tEOF', SQ), 'indented');
    assert.equal(out('cat <<EOF | wc -l\na\nb\nEOF', SQ), '2');
  });
  it('a here-document cut short by the end of input warns and still runs', () => {
    const r = run(loadShell(), 'cat <<EOF\nline');
    assert.equal(r.out, "bash: warning: here-document delimited by end-of-file (wanted 'EOF')\nline");
    assert.equal(r.code, 0);
  });
  it('a here-document inside $( ) may contain ) and quotes', () => {
    assert.equal(out('echo "$(cat <<EOF\na ) b \' c\nEOF\n)"'), "a ) b ' c");
  });
});

describe('parsing the whole text first', () => {
  it('a syntax error prints once and executes nothing', () => {
    const SQ = loadShell();
    const r = run(SQ, 'touch zz; if x');
    assert.equal(r.out, 'bash: syntax error: unexpected end of file');
    assert.equal(r.code, 2);
    assert.equal(SQ.getNode('/home/explorer/zz'), null);
  });
  it('& runs the command in the background (Stage 3 Task 12a; Task 12b adds the Done notice that closes the line)', () => {
    assert.equal(out('echo hi &'), '[1] 1235\nhi\n[1]+  Done                    echo hi');
  });
  it('backslash-newline joins the lines', () => {
    assert.equal(out('echo a \\\n b'), 'a b');
    assert.equal(out('echo ab\\\ncd'), 'abcd');
  });
  it('the for loop shape message is gone', () => {
    assert.equal(out('for i in a b; do echo $i; done; echo $i'), 'a\nb\nb');
  });
});

describe('caps still hold', () => {
  it('a for over 5000 items is cut at 2000 lines', () => {
    const r = run(loadShell(), 'for i in $(seq 1 5000); do echo $i; done');
    const lines = r.out.split('\n');
    assert.equal(lines.length, 2001);
    assert.match(lines[2000], /output cut off after 2000 lines/);
  });
  it('an endless until loop stops on the step budget and the shell stays usable', () => {
    const SQ = loadShell();
    const r = run(SQ, 'cd forest; until ls nothing 2>/dev/null; do echo >/dev/null; done');
    assert.equal(r.out, 'this practice shell stopped the command: too many steps');
    assert.equal(r.code, 1);
    assert.equal(out('pwd', SQ), '/home/explorer/forest');
    assert.equal(out('echo ok', SQ), 'ok');
  });
  it('deeply nested compounds through $( ) stop instead of overflowing the stack', () => {
    const wrap = (b) => { for (let i = 0; i < 90; i++) b = `if echo >/dev/null; then ${b}; fi`; return b; };
    let line = 'echo deep';
    for (let i = 0; i < 15; i++) line = wrap(`echo $(${line})`);
    const r = run(loadShell(), line);
    assert.equal(r.out, 'this practice shell stopped the command: nesting too deep');
    assert.equal(r.code, 1);
    let ok = 'echo deep';
    for (let i = 0; i < 19; i++) { for (let k = 0; k < 12; k++) ok = `if echo >/dev/null; then ${ok}; fi`; ok = `echo $(${ok})`; }
    assert.equal(run(loadShell(), ok).out, 'deep');
  });
  it('break outside a loop does nothing harmful', () => {
    const SQ = loadShell();
    assert.equal(out('break; echo after', SQ).split('\n').pop(), 'after');
  });
});

describe('functions (Task 6b)', () => {
  it('a function gets its arguments', () => {
    assert.equal(out('greet() { echo "Hello, $1!"; }; greet Ada'), 'Hello, Ada!');
    assert.equal(out('count() { echo $#; }; count a b c'), '3');
  });
  it('a function persists to the next typed line and in the saved state', () => {
    const SQ = loadShell();
    run(SQ, 'greet() { echo "Hello, $1!"; }');
    assert.equal(out('greet Bo', SQ), 'Hello, Bo!');
    assert.ok(JSON.parse(JSON.stringify(SQ.S)).fns.greet);
  });
  it('the function keyword form works', () => {
    assert.equal(out('function f { echo hi; }; f'), 'hi');
    assert.equal(out('function f() { echo hi2; }; f'), 'hi2');
  });
  it('local scopes a variable to the call and restores it on return', () => {
    const SQ = loadShell();
    assert.equal(out('f() { local x=2; echo $x; }; x=1; f; echo $x', SQ), '2\n1');
    assert.equal(out('f() { local y=5; }; f; echo "[$y]"', SQ), '[]');
    assert.equal(out('g() { echo $x; }; h() { local x=in; g; }; x=out; h; echo $x', SQ), 'in\nout');
    assert.equal(out('k() { local x; x=3; echo $x; }; x=9; k; echo $x', SQ), '3\n9');
  });
  it('local outside a function is an error', () => {
    const r = run(loadShell(), 'local x=1');
    assert.equal(r.out, 'bash: local: can only be used in a function');
    assert.equal(r.code, 1);
  });
  it('return sets the status; with no number it keeps the last status', () => {
    assert.equal(out('f() { return 3; }; f; echo $?'), '3');
    assert.equal(out('f() { echo a; return 4; echo b; }; f; echo $?'), 'a\n4');
    const SQ = loadShell();
    const want = out('ls nothing 2>/dev/null; echo $?', SQ);
    assert.equal(out('f() { ls nothing 2>/dev/null; return; }; f; echo $?', SQ), want);
    assert.equal(out('f() { for i in 1 2 3; do if echo $i | grep 2 >/dev/null; then return 7; fi; echo $i; done; }; f; echo $?', SQ), '1\n7');
  });
  it('return outside a function is an error', () => {
    const r = run(loadShell(), 'return 3');
    assert.equal(r.out, "bash: return: can only 'return' from a function or sourced script");
    assert.equal(r.code, 1);
  });
  it('endless recursion stops at the nesting limit and unwinds', () => {
    const SQ = loadShell();
    const r = run(SQ, 'f() { f; }; f');
    assert.equal(r.out, 'bash: f: maximum function nesting level exceeded');
    assert.equal(SQ.rt.frames.length, 0);
    assert.equal(out('echo ok', SQ), 'ok');
  });
  it('recursion inside the limit works; past it stops', () => {
    const SQ = loadShell();
    run(SQ, 'down() { if (( $1 > 0 )); then down $(( $1 - 1 )); else echo done; fi; }');
    assert.equal(out('down 50', SQ), 'done');
    assert.equal(out('down 150', SQ), 'bash: down: maximum function nesting level exceeded');
    assert.equal(SQ.rt.frames.length, 0);
    assert.equal(out('down 3', SQ), 'done');
  });
  it('nested for inside if inside a function', () => {
    assert.equal(out('f() { if echo >/dev/null; then for i in $@; do echo "<$i>"; done; fi; }; f a b'), '<a>\n<b>');
  });
  it('for with no list walks the function arguments', () => {
    assert.equal(out('f() { for i; do echo $i; done; }; f a b'), 'a\nb');
  });
  it('a function beats a builtin of the same name', () => {
    assert.equal(out('pwd() { echo mine; }; pwd'), 'mine');
  });
  it('functions read stdin from pipes and redirects', () => {
    assert.equal(out('f() { cat; }; echo hi | f'), 'hi');
    assert.equal(out('f() { cat; } <<< hi; f'), 'hi');
    assert.equal(out('f() { echo a; echo b; }; f | wc -l'), '2');
    const SQ = loadShell();
    assert.equal(out('f() { echo saved; }; f > o.txt; cat o.txt', SQ), 'saved');
  });
  it('output and errors keep their order', () => {
    const lines = out('f() { echo a; ls nope; echo b; }; f').split('\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[0], 'a');
    assert.match(lines[1], /nope/);
    assert.equal(lines[2], 'b');
  });
  it('a definition logs (fn); a call logs only its inner commands', () => {
    const SQ = loadShell();
    run(SQ, 'f() { echo a; }; f');
    assert.deepEqual(SQ.rt.log.map((e) => e.name), ['(fn)', 'echo']);
    const fn = SQ.rt.log[0];
    assert.deepEqual([...fn.args], []);
    assert.equal(fn.code, 0);
  });
  it('a function defined in $( ) or ( ) does not leak', () => {
    const SQ = loadShell();
    assert.equal(out('echo $(g() { echo in; }; g)', SQ), 'in');
    assert.match(out('g', SQ), /g: command not found/);
    assert.match(out('( h() { echo in; }; h ); h', SQ), /^in\nbash: h: command not found/);
  });
  it('local values come back when the step budget stops a function', () => {
    const SQ = loadShell();
    const r = run(SQ, 'x=1; f() { local x=2; until ls nothing 2>/dev/null; do echo >/dev/null; done; }; f');
    assert.equal(r.out, 'this practice shell stopped the command: too many steps');
    assert.equal(SQ.rt.frames.length, 0);
    assert.equal(out('echo $x', SQ), '1');
  });
  it('the parse cache stays bounded', () => {
    const SQ = loadShell();
    for (let i = 0; i < 200; i++) run(SQ, `f${i}() { echo ${i}; }; f${i}`);
    assert.equal(out('f199', SQ), '199');
    assert.ok(SQ.fnParseCache.size <= 64, `cache grew to ${SQ.fnParseCache.size}`);
  });
  it('function text counts toward the state cap', () => {
    const SQ = loadShell();
    const r = run(SQ, `big() { echo "${'A'.repeat(1100000)}"; }`);
    assert.equal(r.out, 'bash: big: function too large for this practice shell');
    assert.equal(r.code, 1);
    assert.ok(!(SQ.S.fns && SQ.S.fns.big));
    SQ.getNode('/home/explorer/readme.txt').content = 'x'.repeat(1000000);
    const r2 = run(SQ, `big2() { echo "${'B'.repeat(600000)}"; }`);
    assert.equal(r2.out, 'bash: big2: function too large for this practice shell');
    assert.ok(!(SQ.S.fns && SQ.S.fns.big2));
    assert.equal(out('small() { echo s; }; small', SQ), 's');
  });
});

describe('Task 6a review carry-overs', () => {
  it('<< inside (( )) in $( ) is not a here-document', () => {
    assert.equal(out('echo "$(x=1; (( x << 2 ))\necho in\n)"'), 'in');
  });
  it('a syntax error sets $? to 2', () => {
    const SQ = loadShell();
    run(SQ, 'if x');
    assert.equal(out('echo $?', SQ), '2');
  });
});

describe('Stage 3 leftovers: each pipeline stage is a full subshell', () => {
  const o = (line, SQ = loadShell()) => run(SQ, line).out;
  it('cd in a stage does not move the shell', () => {
    const SQ = loadShell();
    assert.equal(o('cd forest | cat; pwd', SQ), '/home/explorer');
    assert.equal(o('cd forest | cat; echo $PWD', SQ), '/home/explorer');
    assert.equal(o('echo hi | cd forest; pwd', SQ), '/home/explorer');
    assert.equal(o('cd forest | cat; cd ..; pwd', SQ), '/home');
    assert.equal(o('cd forest; cd - >/dev/null | cat; pwd'), '/home/explorer/forest');
  });
  it('a later stage starts in the shell directory; a subshell inside a stage may cd', () => {
    const SQ = loadShell();
    assert.equal(o('cd forest | pwd', SQ), '/home/explorer');
    assert.equal(o('(cd forest; pwd) | cat', SQ), '/home/explorer/forest');
  });
  it('shift in a stage leaves the positional parameters alone', () => {
    const SQ = loadShell();
    assert.equal(o('f() { echo a | shift; echo $# $1; }; f x y z', SQ), '3 x');
    assert.equal(o('f() { shift; echo $# $1; }; f x y z', SQ), '2 y');
  });
  it('variables, functions and exports stay inside the stage; files and $? come out', () => {
    const SQ = loadShell();
    assert.equal(o('x=1 | cat; echo "[$x]"', SQ), '[]');
    assert.equal(o('g() { echo hi; } | cat; type g', SQ), 'bash: type: g: not found');
    assert.equal(o('export E1=1 | cat; echo "[$E1]"; env | grep -c E1', SQ), '[]\n0');
    assert.equal(o('echo data | tee out.txt > /dev/null; cat out.txt', SQ), 'data');
    assert.equal(o('echo a | cd nosuchdir; echo $?', SQ), 'bash: cd: nosuchdir: No such file or directory\n1');
    assert.equal(o('true | false; echo $?', SQ), '1');
    assert.equal(o('mkdir newd | cat; [ -d newd ] && echo yes', SQ), 'yes');
  });
  it('a one-command line is not a subshell: cd, shift and assignments still apply', () => {
    const SQ = loadShell();
    assert.equal(o('cd forest; pwd', SQ), '/home/explorer/forest');
    assert.equal(o('y=2; echo $y', SQ), '2');
  });
});
