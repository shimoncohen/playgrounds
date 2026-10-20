// Process substitution (Stage 3 Task 16): <( list ) runs the list, keeps its stdout in a hidden read-only file /dev/fd/63, /dev/fd/62, ...
// (listed by nothing, never saved, gone when the command that expanded it finishes) and expands to that path. >( list ) is unsupported.
// Expected texts were recorded with GNU bash 5.2.21 where bash is deterministic (see the Task 16 report for the differences kept on purpose).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const H = '/home/explorer/';
const put = (SQ, name, text) => { if (name.includes('/')) SQ.mkdirp(H + name.replace(/\/[^/]*$/, '')); SQ.writeFile(H + name, text, false, name); };
function shell() {
  const SQ = loadShell();
  put(SQ, 'a.txt', 'pear\napple\nfig');
  put(SQ, 'b.txt', 'fig\nkiwi\napple');
  put(SQ, 'inbox/a.txt', 'one\ntwo\nthree');
  return SQ;
}
const R = (SQ, line) => run(SQ, line);
const NOSUP = 'this practice shell does not support >( ) yet';
const EOFP = "bash: unexpected EOF while looking for matching ')'";

describe('process substitution: the brief', () => {
  it('diff <(sort a.txt) <(sort b.txt)', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'diff <(sort a.txt) <(sort b.txt)'), { out: '3c3\n< pear\n---\n> kiwi', code: 1 });
  });
  it('the diff equals the diff of sorted copies', () => {
    const SQ = shell();
    const a = R(SQ, 'diff <(sort a.txt) <(sort b.txt)');
    R(SQ, 'sort a.txt > /tmp/sa; sort b.txt > /tmp/sb');
    const b = R(SQ, 'diff /tmp/sa /tmp/sb');
    assert.deepEqual(a, b);
  });
  it('cat <(echo a) <(echo b)', () => {
    assert.deepEqual(R(shell(), 'cat <(echo a) <(echo b)'), { out: 'a\nb', code: 0 });
  });
  it('comm -12 <(sort a) <(sort b)', () => {
    assert.deepEqual(R(shell(), 'comm -12 <(sort a.txt) <(sort b.txt)'), { out: 'apple\nfig', code: 0 });
  });
  it('a while loop fed by < <(...) keeps its variable; the piped form does not (side by side)', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n'), { out: '3', code: 0 });
    assert.deepEqual(R(SQ, 'cat inbox/a.txt | while read l; do m=$((m+1)); done; echo "[$m]"'), { out: '[]', code: 0 });
    const SQ2 = shell();
    assert.deepEqual(R(SQ2, 'cat inbox/a.txt | while read l; do n=$((n+1)); done; echo $n'), { out: '', code: 0 });
  });
  it('wc -l < <(echo x)', () => {
    assert.deepEqual(R(shell(), 'wc -l < <(echo x)'), { out: '1', code: 0 });
  });
  it('the path is /dev/fd/63, then 62, 61 in one command', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'echo <(true)'), { out: '/dev/fd/63', code: 0 });
    assert.deepEqual(R(SQ, 'echo <(true) <(true) <(true)'), { out: '/dev/fd/63 /dev/fd/62 /dev/fd/61', code: 0 });
    assert.deepEqual(R(SQ, 'echo <(true); echo <(true)'), { out: '/dev/fd/63\n/dev/fd/63', code: 0 });
    assert.deepEqual(R(SQ, 'echo a<(true)b'), { out: 'a/dev/fd/63b', code: 0 });
  });
  it('nested <( <( ) ): each level numbers its own from 63', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'echo <(echo <(true))'), { out: '/dev/fd/63', code: 0 });
    assert.deepEqual(R(SQ, 'cat <(cat <(echo a))'), { out: 'a', code: 0 });
    assert.deepEqual(R(SQ, 'cat <(echo <(true) <(true))'), { out: '/dev/fd/63 /dev/fd/62', code: 0 });
    assert.deepEqual(R(SQ, 'cat <(cat <(echo in) <(echo ner)) <(echo out)'), { out: 'in\nner\nout', code: 0 });
  });
  it('a failing inner command passes its stderr through; the outer sees empty input; $? is the outer command\'s', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'cat <(qqqq); echo st=$?'), { out: 'bash: qqqq: command not found\nst=0', code: 0 });
    assert.deepEqual(R(SQ, 'wc -l <(false)'), { out: '0 /dev/fd/63', code: 0 });
    assert.deepEqual(R(SQ, 'cat <(echo a; echo err >&2; exit 3); echo $?'), { out: 'err\na\n0', code: 0 });
    assert.deepEqual(R(SQ, 'x=<(false); echo $?'), { out: '0', code: 0 });
  });
  it('unterminated <( is a syntax error, status 2, and nothing runs', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'echo <(true'), { out: EOFP, code: 2 });
    assert.deepEqual(R(SQ, 'echo first; cat <(echo a'), { out: EOFP, code: 2 });
    assert.deepEqual(R(SQ, 'echo $(true'), { out: EOFP, code: 2 }); // the same wording as $(
  });
  it('>( ) is unsupported (status 2, parsed before anything runs)', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'echo hi > >(cat)'), { out: NOSUP, code: 2 });
    assert.deepEqual(R(SQ, 'echo first; tee >(cat)'), { out: NOSUP, code: 2 });
    assert.deepEqual(R(SQ, 'echo ">(x)"'), { out: '>(x)', code: 0 });
  });
  it('<( stays literal inside quotes, [[ ]], $(( )) and (( ))', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, "echo '<(x)'"), { out: '<(x)', code: 0 });
    assert.deepEqual(R(SQ, 'echo "<(x)"'), { out: '<(x)', code: 0 });
    assert.deepEqual(R(SQ, 'echo $(( 1 <(2) ))'), { out: '1', code: 0 });
    assert.deepEqual(R(SQ, 'echo $(( 3 <(2) ))'), { out: '0', code: 0 });
    assert.deepEqual(R(SQ, '(( 1 <(2) )) && echo yes'), { out: 'yes', code: 0 });
    assert.deepEqual(R(SQ, 'x=5; echo $(( x <(9) ))'), { out: '1', code: 0 });
    assert.deepEqual(R(SQ, '[[ "<(x)" == "<(x)" ]] && echo same'), { out: 'same', code: 0 });
    assert.deepEqual(R(SQ, 'v=a; [[ $v < b ]] && echo lt'), { out: 'lt', code: 0 });
    assert.deepEqual(R(SQ, 'echo a\\<b'), { out: 'a<b', code: 0 });
    // [[ ]] is parsed as a conditional expression: <( is never run there (no /dev/fd path appears)
    assert.deepEqual(R(SQ, '[[ -n <(echo ran) ]] && echo y'), { out: 'bash: syntax error in conditional expression', code: 2 });
  });
  it('typed here-documents and here-strings are unaffected', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'cat <<EOF\n<(x) and $((1+1))\nEOF'), { out: '<(x) and 2', code: 0 });
    assert.deepEqual(R(SQ, "cat <<'E'\n<(echo hi)\nE"), { out: '<(echo hi)', code: 0 });
    assert.deepEqual(R(SQ, 'cat <<< hello'), { out: 'hello', code: 0 });
    assert.deepEqual(R(SQ, 'cat <<< <(true)'), { out: '/dev/fd/63', code: 0 });
    assert.deepEqual(R(SQ, 'cat < a.txt'), { out: 'pear\napple\nfig', code: 0 });
    assert.deepEqual(R(SQ, 'echo $(cat <<E\n(\nE\n)'), { out: '(', code: 0 });
  });
  it('caps: 20 substitutions per command and nesting 20 deep', () => {
    const SQ = shell();
    const many = (n) => 'echo' + ' <(true)'.repeat(n);
    const r20 = R(SQ, many(20));
    assert.equal(r20.code, 0);
    assert.equal(r20.out.split(' ').length, 20);
    assert.equal(r20.out.split(' ').pop(), '/dev/fd/44');
    const r21 = R(SQ, many(21) + '; echo next $?');
    assert.deepEqual(r21, { out: 'bash: too many process substitutions in one command (at most 20 in this practice shell)\nnext 1', code: 0 });
    let deep = 'echo x';
    for (let k = 0; k < 25; k++) deep = 'cat <(' + deep + ')';
    const rd = R(SQ, deep);
    assert.match(rd.out, /process substitution nested too deeply/);
    assert.deepEqual(R(SQ, 'echo ok'), { out: 'ok', code: 0 });
  });
});

describe('process substitution: the hidden /dev/fd files', () => {
  it('are readable while the command runs and gone after it', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'x=<(echo hi); cat $x'), { out: 'cat: /dev/fd/63: No such file or directory', code: 1 });
    assert.deepEqual(R(SQ, 'cat <(echo hi) >/dev/null; test -e /dev/fd/63 || echo gone'), { out: 'gone', code: 0 });
    assert.deepEqual(R(SQ, '[ -r <(true) ] && echo r'), { out: 'r', code: 0 });
    assert.deepEqual(R(SQ, '[ -e <(true) ] && echo e'), { out: 'e', code: 0 });
  });
  it('are listed by nothing and never saved', () => {
    const SQ = shell();
    assert.match(R(SQ, 'cat <(echo x) <(ls /dev/fd)').out, /^ls: cannot access '\/dev\/fd': No such file or directory$/m);
    assert.match(R(SQ, 'cat <(echo x) <(ls /dev)').out, /^ls: cannot access '\/dev': No such file or directory$/m);
    assert.match(R(SQ, 'ls <(true)').out, /^\/dev\/fd\/63$/);
    assert.doesNotMatch(R(SQ, 'cat <(find / -name 63)').out, /fd/);
    R(SQ, 'cat <(echo secret) > keep.txt');
    assert.doesNotMatch(JSON.stringify(SQ.S), /dev\/fd/);
    assert.equal(SQ.S.fs.children.dev, undefined);
    assert.deepEqual(R(SQ, 'cat keep.txt'), { out: 'secret', code: 0 });
  });
  it('are read-only', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'f() { echo x > "$1"; cat "$1"; }; f <(echo orig)'), { out: 'bash: /dev/fd/63: Permission denied\norig', code: 0 });
    assert.deepEqual(R(SQ, 'rm <(true)'), { out: "rm: cannot remove '/dev/fd/63': Permission denied", code: 1 });
    assert.deepEqual(R(SQ, 'mv <(echo moved) m.txt; cat m.txt'), { out: "mv: cannot remove '/dev/fd/63': Permission denied\nmoved", code: 0 });
    assert.deepEqual(R(SQ, 'find <(true) -delete'), { out: "find: cannot delete '/dev/fd/63': Permission denied", code: 1 });
    assert.deepEqual(R(SQ, 'echo x > <(true)'), { out: 'bash: /dev/fd/63: Permission denied', code: 1 });
    assert.deepEqual(R(SQ, '[ -w <(true) ] || echo not-writable'), { out: 'not-writable', code: 0 });
    assert.deepEqual(R(SQ, "sed -i 's/a/b/' <(echo a)"), { out: 'sed: /dev/fd/63: Permission denied', code: 4 });
  });
  it('work with the file readers', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'paste <(echo a) <(echo b)'), { out: 'a\tb', code: 0 });
    assert.deepEqual(R(SQ, 'sort <(printf "b\\na\\n")'), { out: 'a\nb', code: 0 });
    assert.deepEqual(R(SQ, 'head -n 1 <(sort a.txt)'), { out: 'apple', code: 0 });
    assert.deepEqual(R(SQ, 'tail -n 1 <(sort a.txt)'), { out: 'pear', code: 0 });
    assert.deepEqual(R(SQ, 'grep p <(cat a.txt)'), { out: 'pear\napple', code: 0 });
    assert.deepEqual(R(SQ, "awk '{print NR\": \"$0}' <(echo x)"), { out: '1: x', code: 0 });
    assert.deepEqual(R(SQ, "sed 's/a/A/' <(echo abc)"), { out: 'Abc', code: 0 });
    assert.deepEqual(R(SQ, 'cp <(echo copied) c.txt; cat c.txt'), { out: 'copied', code: 0 });
    assert.match(R(SQ, 'cp <(echo x) ff; ls -l ff').out, /^-rw-r--r-- /);
    assert.deepEqual(R(SQ, 'echo y >> ff; cat ff'), { out: 'x\ny', code: 0 });
    assert.match(R(SQ, 'mv <(echo z) mm 2>/dev/null; ls -l mm').out, /^-rw-r--r-- /);
    assert.deepEqual(R(SQ, 'realpath <(true)'), { out: '/dev/fd/63', code: 0 });
    assert.deepEqual(R(SQ, 'x=<(true); realpath $x'), { out: 'realpath: /dev/fd/63: No such file or directory', code: 1 });
    assert.deepEqual(R(SQ, 'read -r line < <(printf "l1\\nl2\\n"); echo $line'), { out: 'l1', code: 0 });
    assert.deepEqual(R(SQ, 'source <(echo "v=7"); echo $v'), { out: '7', code: 0 });
    assert.deepEqual(R(SQ, 'bash <(echo "echo hi from bash")'), { out: 'hi from bash', code: 0 });
    assert.deepEqual(R(SQ, 'cat <(ls) | wc -l'), R(SQ, 'ls | wc -l'));
  });
});

describe('process substitution: in the shell language', () => {
  it('the parser keeps <( list ) as one word piece, also as a redirect target', () => {
    const SQ = shell();
    const c = SQ.parseProgram('cat a<(echo "x)")b < <(sort (b)) ').items[0].andor.first.cmds[0];
    assert.equal(c.type, 'simple');
    assert.equal(JSON.stringify(c.words.map((w) => w.raw)), JSON.stringify(['cat', 'a<(echo "x)")b']));
    assert.equal(c.inp.raw, '<(sort (b))');
    const w = SQ.parseProgram('while read l; do :; done < <(cat x)').items[0].andor.first.cmds[0];
    assert.equal(w.type, 'while');
    assert.equal(w.redirs.inp.raw, '<(cat x)');
  });
  it('in a for list it is one word, alive for the whole loop', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'for f in <(echo a) <(echo b); do echo $f; cat $f; done'), { out: '/dev/fd/63\na\n/dev/fd/62\nb', code: 0 });
    assert.deepEqual(R(SQ, 'IFS=/; for f in <(true); do echo "[$f]"; done'), { out: '[/dev/fd/63]', code: 0 });
  });
  it('a case word', () => {
    assert.deepEqual(R(shell(), 'case <(true) in /dev/fd/*) echo m;; esac'), { out: 'm', code: 0 });
  });
  it('inside functions and scripts', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'f(){ cat <(echo b) "$1"; echo "$@"; }; f <(echo a)'), { out: 'b\na\n/dev/fd/63', code: 0 });
    put(SQ, 's.sh', 'diff <(sort "$1") <(sort "$2") && echo same || echo differ');
    assert.deepEqual(R(SQ, 'bash s.sh a.txt a.txt'), { out: 'same', code: 0 });
    assert.deepEqual(R(SQ, 'bash s.sh a.txt b.txt'), { out: '3c3\n< pear\n---\n> kiwi\ndiffer', code: 0 });
  });
  it('inside $( ) and in a pipeline stage', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'echo "$(cat <(echo q))"'), { out: 'q', code: 0 });
    assert.deepEqual(R(SQ, 'cat <(echo a) | tr a b; cat <(echo c) | wc -l'), { out: 'b\n1', code: 0 });
    assert.deepEqual(R(SQ, 'echo x | while read l; do cat <(echo $l$l); done'), { out: 'xx', code: 0 });
  });
  it('set -x shows the expanded path', () => {
    const SQ = shell();
    const r = R(SQ, 'set -x; cat <(echo a) >/dev/null; set +x');
    assert.match(r.out, /^\+\+ echo a$/m);
    assert.match(r.out, /^\+ cat \/dev\/fd\/63$/m);
  });
  it('set -e reaches the inner list (bash keeps errexit in a process substitution); pipefail ignores it', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'bash -ec \'cat <(false; echo after); echo st=$?\''), { out: 'st=0', code: 0 });
    assert.deepEqual(R(SQ, 'bash -c \'set -o pipefail; cat <(false); echo $?\''), { out: '0', code: 0 });
  });
  it('traps do not leak into the inner list', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'bash -c \'trap "echo T" EXIT; cat <(echo in); echo out\''), { out: 'in\nout\nT', code: 0 });
  });
  it('a background job', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'cat <(echo bg) &'), { out: '[1] 1235\nbg\n[1]+  Done                    cat <(echo bg)', code: 0 });
    assert.deepEqual(R(SQ, 'f() { sleep 1; cat "$1"; }; f <(echo later) & wait; echo done'), { out: '[1] 1236\nlater\ndone\n[1]+  Done                    f <(echo later)', code: 0 });
  });
  it('a job that loops over process substitutions does not hit the per-command cap', () => {
    const SQ = shell();
    R(SQ, 'for i in $(seq 30); do for f in <(echo $i); do :; done; done > /dev/null &');
    const r = R(SQ, 'wait; echo ok');
    assert.match(r.out, /ok$/);
    assert.doesNotMatch(r.out, /too many/);
  });
  it('large inner output within the caps works', () => {
    const SQ = shell();
    assert.deepEqual(R(SQ, 'wc -l <(for i in $(seq 10); do seq 10000; done)'), { out: '100000 /dev/fd/63', code: 0 });
    assert.deepEqual(R(SQ, 'wc -l <(for i in $(seq 30); do seq 10000; done); echo after'), { out: 'this practice shell stopped the command: a value grew too large', code: 1 });
    assert.deepEqual(R(SQ, 'echo next'), { out: 'next', code: 0 });
  });
});
