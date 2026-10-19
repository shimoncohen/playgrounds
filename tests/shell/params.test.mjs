// Parameter expansion, special parameters and frames (Stage 2, Task 3).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const withFrame = (args, name = 'f') => {
  const SQ = loadShell();
  SQ.rt.frames.push({ name, args, kind: 'function', locals: null });
  return SQ;
};

describe('frames', () => {
  it('base frame is bash with no args', () => {
    const SQ = loadShell();
    assert.equal(SQ.rt.frames.length, 0);
    const f = SQ.frame();
    assert.equal(f.name, 'bash');
    assert.equal(f.args.length, 0);
    assert.equal(f.kind, 'script');
    assert.equal(f.locals, null);
  });
  it('frame() is the top of the stack', () => {
    const SQ = withFrame(['x'], 'g');
    assert.equal(SQ.frame().name, 'g');
  });
});

describe('special parameters', () => {
  it('positional parameters', () => {
    const SQ = withFrame(['a b', 'c']);
    assert.equal(run(SQ, 'echo $1').out, 'a b');
    assert.equal(run(SQ, 'echo $2').out, 'c');
    assert.equal(run(SQ, 'echo "[$3]"').out, '[]');
    assert.equal(run(SQ, 'echo ${1}').out, 'a b');
  });
  it('$10 is ${1} followed by 0; ${10} is the tenth', () => {
    const SQ = withFrame(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    assert.equal(run(SQ, 'echo $10').out, 'a0');
    assert.equal(run(SQ, 'echo ${10}').out, 'j');
  });
  it('"$@" is one word per argument', () => {
    const SQ = withFrame(['a b', 'c']);
    assert.equal(run(SQ, "printf '[%s]' \"$@\"").out, '[a b][c]');
  });
  it('unquoted $@ splits on spaces', () => {
    const SQ = withFrame(['a b', 'c']);
    assert.equal(run(SQ, "printf '[%s]' $@").out, '[a][b][c]');
  });
  it('"$@" with no arguments yields no word', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "printf '[%s]' \"$@\" end").out, '[end]');
    assert.equal(run(SQ, 'echo "$@"').out, '');
  });
  it('"$*" joins with a space; "x$@y" glues the ends', () => {
    const SQ = withFrame(['a b', 'c']);
    assert.equal(run(SQ, "printf '[%s]' \"$*\"").out, '[a b c]');
    assert.equal(run(SQ, "printf '[%s]' \"x$@y\"").out, '[xa b][cy]');
  });
  it('$# $0 $$', () => {
    const SQ = withFrame(['a b', 'c']);
    assert.equal(run(SQ, 'echo $#').out, '2');
    assert.equal(run(SQ, 'echo $0').out, 'f');
    assert.equal(run(SQ, 'echo $$').out, '1234');
    assert.equal(run(SQ, 'echo ${#}').out, '2');
    assert.equal(run(loadShell(), 'echo $0').out, 'bash');
  });
  it('assignment with $@ keeps one word', () => {
    const SQ = withFrame(['a b', 'c']);
    run(SQ, 'X=$@');
    assert.equal(SQ.S.vars.X, 'a b c');
  });
});

describe('${...} expansion', () => {
  it(':- uses the default and leaves the variable unset', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo ${X:-dflt}').out, 'dflt');
    assert.ok(!('X' in SQ.S.vars));
  });
  it(':- keeps a set value, - only checks unset', () => {
    const SQ = loadShell();
    run(SQ, 'X=hi; E=');
    assert.equal(run(SQ, 'echo ${X:-d}').out, 'hi');
    assert.equal(run(SQ, 'echo ${E:-d}').out, 'd');
    assert.equal(run(SQ, 'echo "[${E-d}]"').out, '[]');
  });
  it(':= sets the variable', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo ${X:=dflt}').out, 'dflt');
    assert.equal(SQ.S.vars.X, 'dflt');
  });
  it(':+ uses the alternative only when set', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo "[${X:+alt}]"').out, '[]');
    run(SQ, 'X=1');
    assert.equal(run(SQ, 'echo ${X:+alt}').out, 'alt');
  });
  it(':? stops with a message', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'echo ${X:?oops}'), { out: 'bash: X: oops', code: 1 });
    run(SQ, 'X=ok');
    assert.equal(run(SQ, 'echo ${X:?oops}').out, 'ok');
  });
  it('operand expands variables and quotes', () => {
    const SQ = loadShell();
    run(SQ, 'D=deep');
    assert.equal(run(SQ, 'echo ${X:-$D}').out, 'deep');
    assert.equal(run(SQ, "echo \"${X:-it's}\"").out, "it's");
    assert.equal(run(SQ, 'echo ${X:-$(echo sub)}').out, 'sub');
  });
  it('${#V} length', () => {
    const SQ = loadShell();
    run(SQ, 'V=hello');
    assert.equal(run(SQ, 'echo ${#V}').out, '5');
  });
  it('prefix and suffix removal', () => {
    const SQ = loadShell();
    run(SQ, 'V=file.tar.gz');
    assert.equal(run(SQ, 'echo ${V%.*}').out, 'file.tar');
    assert.equal(run(SQ, 'echo ${V%%.*}').out, 'file');
    assert.equal(run(SQ, 'echo ${V#*.}').out, 'tar.gz');
    assert.equal(run(SQ, 'echo ${V##*.}').out, 'gz');
    assert.equal(run(SQ, 'echo ${V#zzz}').out, 'file.tar.gz');
  });
  it('replacement', () => {
    const SQ = loadShell();
    run(SQ, 'V=file.tar.gz');
    assert.equal(run(SQ, 'echo ${V/tar/zip}').out, 'file.zip.gz');
    assert.equal(run(SQ, 'echo ${V/./_}').out, 'file_tar.gz');
    assert.equal(run(SQ, 'echo ${V//./_}').out, 'file_tar_gz');
    assert.equal(run(SQ, 'echo ${V/tar}').out, 'file..gz');
    assert.equal(run(SQ, 'echo ${V/t*r/X}').out, 'file.X.gz');
  });
  it('substring', () => {
    const SQ = loadShell();
    run(SQ, 'V=abcdef');
    assert.equal(run(SQ, 'echo ${V:2}').out, 'cdef');
    assert.equal(run(SQ, 'echo ${V:1:3}').out, 'bcd');
    assert.equal(run(SQ, 'echo ${V: -2}').out, 'ef');
    assert.equal(run(SQ, 'echo ${V:1:-1}').out, 'bcde');
  });
  it('works inside double quotes and as part of a word', () => {
    const SQ = loadShell();
    run(SQ, 'V=abc');
    assert.equal(run(SQ, 'echo "x${V}y ${#V}"').out, 'xabcy 3');
    assert.equal(run(SQ, 'echo pre${V:-z}post').out, 'preabcpost');
  });
  it('bad substitution', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'echo ${X@Q}'), { out: 'bash: ${X@Q}: bad substitution', code: 1 });
  });
  it('unterminated', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'echo ${X'), { out: "bash: unexpected EOF while looking for matching '}'", code: 2 });
  });
});

describe('$(( ))', () => {
  it('evaluates', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo $((2+3))').out, '5');
    assert.equal(run(SQ, 'echo $(( ))').out, '0');
    assert.equal(run(SQ, 'echo $(( (1+2)*3 ))').out, '9');
    assert.equal(run(SQ, 'echo "n=$((2*4))"').out, 'n=8');
  });
  it('reads and assigns variables', () => {
    const SQ = loadShell();
    run(SQ, 'N=4');
    assert.equal(run(SQ, 'echo $((N+1)) $(($N*2))').out, '5 8');
    run(SQ, 'echo $((N=7))');
    assert.equal(SQ.S.vars.N, '7');
  });
  it('nests with $( )', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo $(( $(echo 5) + 1 ))').out, '6');
    assert.equal(run(SQ, 'echo $(echo $((1+1)))').out, '2');
  });
  it('division by zero', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'echo $((1/0))'), { out: 'bash: 1/0: division by 0', code: 1 });
  });
  it('unterminated', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'echo $((1+'), { out: "bash: unexpected EOF while looking for matching '))'", code: 2 });
  });
});

describe('quoting keeps it literal', () => {
  it('single quotes', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "echo '$((1+2)) ${X:-d} $1'").out, '$((1+2)) ${X:-d} $1');
  });
  it('dry pass has no side effects', () => {
    const SQ = loadShell();
    run(SQ, 'echo ok || echo ${X:=set}');
    assert.ok(!('X' in SQ.S.vars));
    run(SQ, 'echo ok && echo ${Y:=set}');
    assert.equal(SQ.S.vars.Y, 'set');
  });
});

describe('pattern operators stay fast and exact', () => {
  const timed = (SQ, line) => { const t = Date.now(); const r = run(SQ, line); return { ...r, ms: Date.now() - t }; };
  it('pathological patterns finish quickly', () => {
    const SQ = loadShell();
    run(SQ, 'V=' + 'a'.repeat(60));
    let r = timed(SQ, 'echo ${V##*a*a*a*a*a*b}');
    assert.equal(r.out, 'a'.repeat(60));
    assert.ok(r.ms < 1000, `60: ${r.ms}ms`);
    run(SQ, 'V=' + 'a'.repeat(120));
    r = timed(SQ, 'echo ${V##*a*a*a*a*a*a*a*b}');
    assert.equal(r.out, 'a'.repeat(120));
    assert.ok(r.ms < 1000, `120: ${r.ms}ms`);
  });
  it('5000-char values', () => {
    const SQ = loadShell();
    run(SQ, 'V=' + 'a'.repeat(4999) + 'b');
    let r = timed(SQ, 'echo ${V//*a/x}');
    assert.equal(r.out, 'xb');
    assert.ok(r.ms < 1500, `${r.ms}ms`);
    r = timed(SQ, 'echo ${V%%*b*c}');
    assert.equal(r.out.length, 5000);
    assert.ok(r.ms < 1500, `${r.ms}ms`);
  });
  it('limits pattern length', () => {
    const SQ = loadShell();
    run(SQ, 'V=abc');
    assert.equal(run(SQ, 'echo ${V#' + 'a'.repeat(300) + '}').code, 1);
  });
  it('sets, ranges, negation, ?', () => {
    const SQ = loadShell();
    run(SQ, 'V=abc123');
    assert.equal(run(SQ, 'echo ${V#[a-c]}').out, 'bc123');
    assert.equal(run(SQ, 'echo ${V##[a-c]*[a-c]}').out, '123');
    assert.equal(run(SQ, 'echo ${V%[!a-z]}').out, 'abc12');
    assert.equal(run(SQ, 'echo ${V%%[0-9]*}').out, 'abc');
    assert.equal(run(SQ, 'echo ${V#??}').out, 'c123');
    assert.equal(run(SQ, 'echo ${V//[0-9]/#}').out, 'abc###');
  });
  it('quoted and escaped glob characters are literal', () => {
    const SQ = loadShell();
    run(SQ, "V='a*b'");
    assert.equal(run(SQ, 'echo ${V//\\*/-}').out, 'a-b');
    assert.equal(run(SQ, 'echo ${V#"*"}').out, 'a*b');
    assert.equal(run(SQ, "echo ${V#a'*'}").out, 'b');
  });
});

describe('expandHeredoc', () => {
  it('expands $VAR, ${ }, $( ) and $(( ))', () => {
    const SQ = loadShell();
    run(SQ, 'X=hi');
    assert.equal(SQ.expandHeredoc('a $X ${X}! $(echo z) $((1+2))\n'), 'a hi hi! z 3\n');
  });
  it('honours \\$, \\` and \\\; other backslashes and quotes stay literal', () => {
    const SQ = loadShell();
    run(SQ, 'X=hi');
    assert.equal(SQ.expandHeredoc('\\$X \\` \\\\ \\n "q" \'s\'\n'), '$X ` \\ \\n "q" \'s\'\n');
  });
  it('backslash-newline joins lines', () => {
    assert.equal(loadShell().expandHeredoc('a\\\nb\n'), 'ab\n');
  });
});

describe('JS object names are ordinary shell names', () => {
  it('an unset variable named like an Object property is empty', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'echo $constructor'), { out: '', code: 0 });
    assert.deepEqual(run(SQ, 'echo "[$toString][$hasOwnProperty][${valueOf}]"'), { out: '[][][]', code: 0 });
    assert.deepEqual(run(SQ, 'echo ${constructor:-unset} ${#toString}'), { out: 'unset 0', code: 0 });
    assert.deepEqual(run(SQ, 'echo $((constructor + 1))'), { out: '1', code: 0 });
    assert.deepEqual(run(SQ, 'constructor=5; echo $constructor'), { out: '5', code: 0 });
  });
  it('constructor and toString as commands are not found', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'constructor'), { out: 'bash: constructor: command not found', code: 127 });
    assert.deepEqual(run(SQ, 'toString'), { out: 'bash: toString: command not found', code: 127 });
    assert.deepEqual(run(SQ, 'seq 1 2 | xargs constructor'), { out: 'xargs: constructor: No such file or directory', code: 127 });
    assert.deepEqual(run(SQ, 'type valueOf'), { out: 'bash: type: valueOf: not found', code: 1 });
  });
  it('__proto__ is refused as a variable name and never reads as [object Object]', () => {
    const SQ = loadShell();
    const bad = "bash: read: `__proto__': not a valid identifier";
    assert.deepEqual(run(SQ, 'read __proto__ <<< hi; echo "[$__proto__]"'), { out: bad + '\n[]', code: 0 });
    assert.deepEqual(run(SQ, '__proto__=5; echo "[$__proto__]"'), { out: "bash: `__proto__': not a valid identifier\n[]", code: 0 });
    assert.equal(run(SQ, 'for __proto__ in a; do echo x; done').out, "bash: `__proto__': not a valid identifier");
    assert.equal(run(SQ, 'export __proto__=1').code, 1);
    assert.equal(run(SQ, 'f(){ local __proto__=1; }; f').code, 1);
    assert.equal(run(SQ, '__proto__() { echo x; }').code, 1);
    assert.equal(Object.keys(SQ.S.vars).includes('__proto__'), false);
    assert.equal(typeof SQ.S.vars.hasOwnProperty, 'function', 'the variable table keeps its prototype');
    assert.deepEqual(run(SQ, 'echo ok'), { out: 'ok', code: 0 });
  });
});

// Stage 3, Task 3: shell semantics left over from Stage 2.
describe('Stage 3 leftovers: parameters and status', () => {
  const o = (line, SQ = loadShell()) => run(SQ, line).out;
  it('an assignment-only line takes the status of its last $( )', () => {
    assert.equal(o('x=$(false); echo $?'), '1');
    assert.equal(o('x=$(true); echo $?'), '0');
    assert.equal(o('x=plain; echo $?'), '0');
    assert.equal(o('x=$(exit 3); echo $?'), '3');
    assert.equal(o('false; x=1; echo $?'), '0');
    assert.equal(o('x=$(false) && echo yes || echo no'), 'no');
    const SQ = loadShell();
    assert.equal(run(SQ, 'x=$(echo hi; false)').code, 1);
    assert.equal(o('echo $x', SQ), 'hi');
  });
  it('a variable text is evaluated as an expression inside $(( ))', () => {
    assert.equal(o('a="1+2"; echo $((a*2))'), '6');
    assert.equal(o('a=b; b=4; echo $((a+1))'), '5');
    assert.equal(o('a=5; echo $((a*2))'), '10');
    assert.equal(o('echo $((nosuch+1))'), '1');
    assert.equal(o('a="b=7"; echo $((a)) $b'), '7 7');
  });
  it('a cycle or a chain deeper than 10 stops with the recursion error', () => {
    assert.equal(o('a=b; b=a; echo $((a))'), 'bash: expression recursion level exceeded');
    assert.equal(o('a=a; echo $((a+1))'), 'bash: expression recursion level exceeded');
    const SQ = loadShell();
    run(SQ, 'v0=1; v1=v0; v2=v1; v3=v2; v4=v3; v5=v4; v6=v5; v7=v6; v8=v7; v9=v8');
    assert.equal(o('echo $((v9))', SQ), '1');
    run(SQ, 'v10=v9; v11=v10; v12=v11');
    assert.equal(o('echo $((v12))', SQ), 'bash: expression recursion level exceeded');
  });
  it('unset HOME makes $HOME empty and cd without an argument complain', () => {
    const SQ = loadShell();
    run(SQ, 'unset HOME');
    assert.equal(o('echo "[$HOME]"', SQ), '[]');
    const r = run(SQ, 'cd forest; cd');
    assert.equal(r.out, 'bash: cd: HOME not set');
    assert.equal(r.code, 1);
    assert.equal(o('pwd', SQ), '/home/explorer/forest');
    assert.equal(o('echo ${HOME:-none}', SQ), 'none');
    run(SQ, 'HOME=/home/explorer');
    assert.equal(o('echo $HOME', SQ), '/home/explorer');
    assert.equal(o('cd; pwd', SQ), '/home/explorer');
  });
  it('unset HOME stays inside a subshell and does not show in env', () => {
    const SQ = loadShell();
    assert.equal(o('(unset HOME; echo "[$HOME]"); echo "[$HOME]"', SQ), '[]\n[/home/explorer]');
    run(SQ, 'unset USER');
    assert.ok(!/^USER=/m.test(o('env', SQ)));
  });
});
