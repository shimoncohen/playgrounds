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
