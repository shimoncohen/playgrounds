// Shell options (Stage 3 Task 13): `set -e -u -x -o pipefail`, `set --`, `set -o`/`set +o`, `bash -c/-n/-x/-e/-u`, `sh` the same.
// Expected texts were recorded with GNU bash 5.2.21 (`bash s.sh` / `bash -c`) and are compared as this shell prints them: errors keep the
// typed-line `bash: ` form (bash prints `s.sh: line N: ` or `bash: line 1: ` inside a script or -c string), and an unbound variable is
// status 1 (bash -c gives 127 in 5.2, a script gives 1). See the report of Task 13 for the full comparison.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const H = '/home/explorer/';
const put = (SQ, name, text) => SQ.writeFile(H + name, text, false, name);
/* run TEXT as a script file (bash s.sh): stdout and stderr in the order they were written */
const script = (SQ, text, args = '') => { put(SQ, 's.sh', text); return run(SQ, 'bash s.sh' + (args ? ' ' + args : '')); };
const UNBOUND = (n) => `bash: ${n}: unbound variable`;

/* [script text, expected output (stdout and stderr in order), expected status] */
const ERREXIT = [
  ['set -e; false; echo after', '', 1],
  ['set -e\nfalse\necho after', '', 1],
  ['set -e; false || true; echo after', 'after', 0],
  ['set -e; if false; then :; fi; echo after', 'after', 0],
  ['set -e; ! true; echo after', 'after', 0],
  ['set -e; ! false; echo after', 'after', 0],
  ['set -e; false && true; echo after', 'after', 0],
  ['set -e; true && false; echo after', '', 1],
  ['set -e; { false && true; }; echo after', 'after', 0],
  ['set -e; f() { false && true; }; f; echo after', '', 1],
  ['set -e; f() { false; echo in; }; f || echo y; echo after', 'in\nafter', 0],
  ['set -e; f() { false; echo in; }; if f; then echo t; fi; echo after', 'in\nt\nafter', 0],
  ['set -e; f() { false; echo in; }; ! f; echo after', 'in\nafter', 0],
  ['set -e; f() { false; echo in; }; f && echo t; echo after', 'in\nt\nafter', 0],
  ['set -e; f() { false; echo in; }; while f; do break; done; echo after', 'in\nafter', 0],
  ['set -e; f() { false; echo in; }; f; echo after', '', 1],
  ['set -e; (false; echo no); echo after', '', 1],
  ['set -e; (false && true); echo after', '', 1],
  ['set -e; (false; echo in) || true; echo after', 'in\nafter', 0],
  ['set -e; x=$(false; echo x); echo "[$x]"; echo after', '[x]\nafter', 0],
  ['set -e; x=$(false); echo after', '', 1],
  ['set -e; x=$(false) || true; echo after', 'after', 0],
  ['set -e; echo $(false) after', 'after', 0],
  ['set -e; f() { false; echo in; }; x=$(f); echo "[$x]"', '[in]', 0],
  ['set -e; while false; do :; done; echo after', 'after', 0],
  ['set -e; until true; do :; done; echo after', 'after', 0],
  ['set -e; false | true; echo after', 'after', 0],
  ['set -e; true | false; echo after', '', 1],
  ['set -eo pipefail; false | true; echo after', '', 1],
  ['set -e; for i in 1 2; do false; done; echo after', '', 1],
  ['set -e; case a in a) false;; esac; echo after', '', 1],
  ['set -e; [[ 1 == 2 ]]; echo after', '', 1],
  ['set -e; (( 0 )); echo after', '', 1],
  ['set -e; x=1 false; echo after', '', 1],
  ['set -e; f() { return 3; }; f; echo after', '', 3],
  ['set -e; if true; then false; fi; echo after', '', 1],
  ['set -e; if false; then :; else false; fi; echo after', '', 1],
  ['set -e; { false; } || echo y; echo after', 'y\nafter', 0],
  ['set -e; ( set +e; false; echo in ); echo after', 'in\nafter', 0],
  ['set -e; f() { set +e; }; f; false; echo after', 'after', 0],
  ['set -e; (exit 3); echo after', '', 3],
  ['set -e; ! (exit 3); echo after', 'after', 0],
  ['set -e; (exit 3) | true; echo after', 'after', 0],
  ['set -e; cd /nope; echo after', 'bash: cd: /nope: No such file or directory', 1],
  ['set -e; nosuchcmd; echo after', 'bash: nosuchcmd: command not found', 127],
  ['set -e; set -o nope; echo after', 'bash: set: nope: invalid option name', 2],
  ['set -o nope; echo after', 'bash: set: nope: invalid option name\nafter', 0],
  ['set -e; echo a; false; echo b', 'a', 1],
  ['set -e; source t.sh; echo after', '', 1],
  ['set -e; false; echo after; exit 0', '', 1],
];

const NOUNSET = [
  ['set -u; echo "$nope"; echo after', UNBOUND('nope'), 1],
  ['set -u\necho "$nope"\necho after', UNBOUND('nope'), 1],
  ['set -u; echo ${nope:-d}; echo after', 'd\nafter', 0],
  ['set -u; echo "${nope-}"x; echo after', 'x\nafter', 0],
  ['set -u; echo "$@" "$#" "$?" "$*"; echo after', '0 0 \nafter', 0],
  ['set -u; echo $@ $* "${@}"x; echo after', 'x\nafter', 0],
  ['set -u; echo ${#@} ${#*} $$; echo after', '0 0 1234\nafter', 0],
  ['set -u; echo $1; echo after', UNBOUND('$1'), 1],
  ['set -u; echo ${#nope}; echo after', UNBOUND('nope'), 1],
  ['set -u; echo ${nope%x}; echo after', UNBOUND('nope'), 1],
  ['set -u; echo ${nope/a/b}; echo after', UNBOUND('nope'), 1],
  ['set -u; echo ${nope:1}; echo after', UNBOUND('nope'), 1],
  ['set -u; echo $((nope+1)); echo after', UNBOUND('nope'), 1],
  ['set -u; (( nope )); echo after', UNBOUND('nope'), 1],
  ['set -u; (( 0 && nope )); echo after', 'after', 0],
  ['set -u; echo ${nope:+x}y; echo after', 'y\nafter', 0],
  ['set -u; x=$nope; echo after', UNBOUND('nope'), 1],
  ['set -u; for i in $nope; do :; done; echo after', UNBOUND('nope'), 1],
  ['set -u; echo $!; echo after', UNBOUND('$!'), 1],
  ['set -u; echo ${nope:=v}; echo after', 'v\nafter', 0],
  ['set -u; [[ -n $nope ]]; echo after', UNBOUND('nope'), 1],
  ['set -u; if [ "$nope" ]; then :; fi; echo after', UNBOUND('nope'), 1],
  ['set -u; case $nope in *) :;; esac; echo after', UNBOUND('nope'), 1],
  ['set -u; echo $0; echo after', 's.sh\nafter', 0],
  ['set -u; f() { echo $1; }; f; echo after', UNBOUND('$1'), 1],
  ['set -u; f() { echo $1; }; f a; echo after', 'a\nafter', 0],
  ['set -u; echo $nope || echo y; echo after', UNBOUND('nope'), 1],
  ['set -u; echo $(echo $nope)x; echo after', UNBOUND('nope') + '\nx\nafter', 0],
  ['set -u; (echo $nope); echo after', UNBOUND('nope') + '\nafter', 0],
  ['set -u; x=1; echo $x ${x} "${x%1}"y; echo after', '1 1 y\nafter', 0],
  ['set -u; echo $PATH $HOME >/dev/null; echo after', 'after', 0],
  ['set -u; unset HOME; echo $HOME', UNBOUND('HOME'), 1],
];

const PIPEFAIL = [
  ['set -o pipefail; false | true; echo $?', '1', 0],
  ['set -o pipefail; true | false | true; echo $?', '1', 0],
  ['set -o pipefail; (exit 2) | (exit 3) | true; echo $?', '3', 0],
  ['set -o pipefail; ! false | true; echo $?', '0', 0],
  ['set -o pipefail; true | true; echo $?', '0', 0],
  ['false | true; echo $?', '0', 0],
  ['set -o pipefail; set +o pipefail; false | true; echo $?', '0', 0],
];

const XTRACE = [
  ['set -x; echo hi', '+ echo hi\nhi'],
  ["set -x; echo 'a b' \"c\" 'it'\\''s' '' x\\$y; set +x", "+ echo 'a b' c 'it'\\''s' '' 'x$y'\na b c it's  x$y\n+ set +x"],
  ['set -x; x=1; y=$x z=2; echo $x', '+ x=1\n+ y=1\n+ z=2\n+ echo 1\n1'],
  ['set -x; x="a b"', "+ x='a b'"],
  ['set -x; f() { echo in; }; f', '+ f\n+ echo in\nin'],
  ['set -x; f() { echo $1; }; f "a b"', "+ f 'a b'\n+ echo a b\na b"],
  ['set -x; (echo sub); echo $(echo cs)', '+ echo sub\nsub\n++ echo cs\n+ echo cs\ncs'],
  ['set -x; echo $(echo $(echo deep))', '+++ echo deep\n++ echo deep\n+ echo deep\ndeep'],
  ['set -x; y=$(echo q)', '++ echo q\n+ y=q'],
  ['set -x; f() { :; }; x=$(f)', '++ f\n++ :\n+ x='],
  ['set -x; [[ a == a ]]; (( 1+2 )); ((3)); echo done', '+ [[ a == a ]]\n+ ((  1+2  ))\n+ (( 3 ))\n+ echo done\ndone'],
  ['set -x; if true; then echo y; fi; for i in a; do echo $i; done; while false; do :; done', '+ true\n+ echo y\ny\n+ for i in a\n+ echo a\na\n+ false'],
  ['set -x; for i in a b; do :; done', '+ for i in a b\n+ :\n+ for i in a b\n+ :'],
  ['set -x; l="x y"; for i in $l; do :; done', "+ l='x y'\n+ for i in $l\n+ :\n+ for i in $l\n+ :"],
  ['set -x; set -- 1 2; for i; do :; done', '+ set -- 1 2\n+ for i in "$@"\n+ :\n+ for i in "$@"\n+ :'],
  ['set -x; v=a; case $v in a) :;; esac', '+ v=a\n+ case $v in\n+ :'],
  ['set -x; cat <<E\nhd\nE', '+ cat\nhd'],
  ["set -x; echo 'a\"b' \"a'b\" '*' 'a;b' 'a|b' a=b '~' 'a$' '#a' b# a~ % @ - '!' '{a' '^'",
    "+ echo 'a\"b' 'a'\\''b' '*' 'a;b' 'a|b' a=b '~' 'a$' '#a' b# a~ % @ - '!' '{a' '^'\na\"b a'b * a;b a|b a=b ~ a$ #a b# a~ % @ - ! {a ^"],
  ['set -x; echo "a  b"', "+ echo 'a  b'\na  b"],
  ['set -x; true | false; ! true', '+ true\n+ false\n+ true'],
  ['set -x; echo a | cat', '+ echo a\n+ cat\na'],
  ['set -x; ls nope 2>/dev/null; echo r', '+ ls nope\n+ echo r\nr'],
  ['set -x; { echo g; } 2>/dev/null', 'g'],
  ['set -x; x=1 echo hi', '+ x=1\n+ echo hi\nhi'],
  ['set -x; : $((1+2))', '+ : 3'],
  ['set -x; set -- a "b c"; echo "$@"', "+ set -- a 'b c'\n+ echo a 'b c'\na b c"],
  ['set -x; PS4="> "; echo hi; echo $(echo in)', "+ PS4='> '\n> echo hi\nhi\n>> echo in\n> echo in\nin"],
  ['set -x; set +x; echo quiet', '+ set +x\nquiet'],
  ['set -ex; echo hi', '+ echo hi\nhi'],
  ['set -o xtrace; echo hi', '+ echo hi\nhi'],
  ['set +x; echo hi', 'hi'],
];

describe('set -e (errexit), compared with bash 5.2', () => {
  for (const [text, out, code] of ERREXIT) {
    it(JSON.stringify(text), () => {
      const SQ = loadShell();
      put(SQ, 't.sh', 'false\necho in-t');
      const r = script(SQ, text);
      assert.equal(r.out, out);
      assert.equal(r.code, code);
    });
  }
  it('the script returns the failing command status to its caller', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'set -e\necho start\n(exit 7)\necho never');
    assert.equal(run(SQ, 'bash s.sh; echo "status $?"').out, 'start\nstatus 7');
  });
});

describe('set -u (nounset), compared with bash 5.2', () => {
  for (const [text, out, code] of NOUNSET) {
    it(JSON.stringify(text), () => {
      const r = script(loadShell(), text);
      assert.equal(r.out, out);
      assert.equal(r.code, code);
    });
  }
});

describe('set -o pipefail', () => {
  for (const [text, out, code] of PIPEFAIL) {
    it(JSON.stringify(text), () => {
      const r = script(loadShell(), text);
      assert.equal(r.out, out);
      assert.equal(r.code, code);
    });
  }
});

describe('set -x (xtrace), compared with bash 5.2', () => {
  for (const [text, out] of XTRACE) {
    it(JSON.stringify(text), () => assert.equal(script(loadShell(), text).out, out));
  }
  it('trace lines go to stderr: a line check (stdout only) does not see them, and > redirects only stdout', () => {
    const SQ = loadShell();
    const r = SQ.execLine('set -x; echo hi > f.txt; echo two; set +x');
    assert.deepEqual(JSON.parse(JSON.stringify(r.out.map((o) => [o.cls, o.text]))), [['err', '+ echo hi'], ['err', '+ echo two'], ['out', 'two'], ['err', '+ set +x']]);
    assert.equal(SQ.rt.lastOut, 'two');
    assert.equal(run(SQ, 'cat f.txt').out, 'hi');
  });
  it('a typed line keeps the option for the next lines until set +x (mission 19.4)', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'set -x; echo hi; set +x').out, '+ echo hi\nhi\n+ set +x');
    run(SQ, 'set -x');
    assert.equal(run(SQ, 'echo a').out, '+ echo a\na');
    assert.equal(run(SQ, 'set +x').out, '+ set +x');
    assert.equal(run(SQ, 'echo b').out, 'b');
  });
  it('trace output counts toward the per-line output cap', () => {
    const SQ = loadShell();
    run(SQ, 'x=a; for i in $(seq 17); do x=$x$x; done');
    assert.equal(run(SQ, 'for i in $(seq 40); do : $x; done; echo fine').out, 'fine');
    const r = run(SQ, 'set -x; for i in $(seq 40); do : $x; done; echo never');
    assert.match(r.out, /this practice shell stopped the command: output too large$/);
    assert.ok(!/never/.test(r.out));
    assert.equal(run(SQ, 'set +x; echo ok').out, '+ set +x\nok');
  });
  it('a runaway traced loop ends with the step message and leaves a usable shell', () => {
    const SQ = loadShell();
    const r = run(SQ, 'set -x; while :; do :; done');
    assert.match(r.out, /this practice shell stopped the command: too many steps$/);
    assert.equal(r.code, 1);
    assert.equal(run(SQ, 'set +x; echo ok').out, '+ set +x\nok');
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
});

describe('the set builtin', () => {
  const LIST = ['allexport      \toff', 'braceexpand    \ton', 'emacs          \toff', 'errexit        \toff', 'errtrace       \toff', 'functrace      \toff',
    'hashall        \ton', 'histexpand     \toff', 'history        \toff', 'ignoreeof      \toff', 'interactive-comments\ton', 'keyword        \toff',
    'monitor        \toff', 'noclobber      \toff', 'noexec         \toff', 'noglob         \toff', 'nolog          \toff', 'notify         \toff',
    'nounset        \toff', 'onecmd         \toff', 'physical       \toff', 'pipefail       \toff', 'posix          \toff', 'privileged     \toff',
    'verbose        \toff', 'vi             \toff', 'xtrace         \toff'];
  it('set -o lists every bash option in bash order (bash -c values); the four supported ones show their state', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'set -o').out, LIST.join('\n'));
    const on = LIST.map((l) => (/^(errexit|nounset|pipefail) /.test(l) ? l.replace('off', 'on') : l));
    assert.equal(run(SQ, 'set -euo pipefail; set -o').out, on.join('\n'));
    assert.equal(run(SQ, 'set -o | grep -E "errexit|pipefail|nounset|xtrace"').out, 'errexit        \ton\nnounset        \ton\npipefail       \ton\nxtrace         \toff');
  });
  it('set +o prints the commands that restore the options', () => {
    const SQ = loadShell();
    const want = LIST.map((l) => { const [n, v] = l.split(/\s+/); return `set ${v === 'on' ? '-' : '+'}o ${n}`; });
    assert.equal(run(SQ, 'set +o').out, want.join('\n'));
    assert.equal(run(SQ, 'set -e; set +o | grep errexit').out, 'set -o errexit');
  });
  it('-o NAME / +o NAME and combined letters', () => {
    const SQ = loadShell();
    const st = (l) => run(SQ, l + '; set -o | grep -E "^(errexit|nounset|pipefail|xtrace) "').out.split('\n').map((x) => x.split('\t')[1]).join(' ');
    assert.equal(st('set -o errexit -o nounset'), 'on on off off');
    assert.equal(st('set +o errexit +u -o pipefail'), 'off off on off');
    assert.equal(st('set -e +e'), 'off off on off');
    assert.equal(st('set +o pipefail -eu'), 'on on off off');
  });
  it('errors: an unknown letter, an unknown option name, a missing name', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'set -X'), { out: 'bash: set: -X: invalid option\nset: usage: set [-abefhkmnptuvxBCEHPT] [-o option-name] [--] [-] [arg ...]', code: 2 });
    assert.deepEqual(run(SQ, 'set -o nope'), { out: 'bash: set: nope: invalid option name', code: 2 });
    assert.deepEqual(run(SQ, 'set +o nope'), { out: 'bash: set: nope: invalid option name', code: 2 });
    assert.deepEqual(run(SQ, 'set -n'), { out: 'this practice shell does not support set -n yet', code: 2 });
    assert.deepEqual(run(SQ, 'set -o noclobber'), { out: 'this practice shell does not support set -o noclobber yet', code: 2 });
    assert.deepEqual(run(SQ, 'set -f; echo read*'), { out: 'this practice shell does not support set -f yet\nreadme.txt', code: 0 });
  });
  it('positional parameters: set --, set -- a b c, set a b, set - a b, options followed by words', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'set -- a b; echo $#').out, '2');
    assert.equal(run(SQ, 'echo $1 $2').out, 'a b');
    assert.equal(run(SQ, 'set --; echo $#').out, '0');
    assert.equal(run(SQ, 'set x "y z"; echo $# $2').out, '2 y z');
    assert.equal(run(SQ, 'set - a b; echo $# $1').out, '2 a');
    assert.equal(run(SQ, 'set -e q; echo $# $1; set +e').out, '1 q');
    assert.equal(run(SQ, 'set -- -e; echo "[$1]"').out, '[-e]');
    assert.equal(run(SQ, 'set --; f() { set -- x y z; echo $#; }; f a; echo $#').out, '3\n0');
    assert.equal(script(SQ, 'set -- "$@" c; echo $# $3', 'a b').out, '3 c');
    assert.equal(run(SQ, 'set -- a b c; echo ${@:2}').out, 'b c');
  });
  it('set with no arguments lists the variables as NAME=value, quoted as bash does', () => {
    const SQ = loadShell();
    const r = run(SQ, 'x=1; y="a b"; set');
    assert.equal(r.code, 0);
    const L = r.out.split('\n');
    assert.ok(L.includes('x=1'));
    assert.ok(L.includes("y='a b'"));
    assert.ok(L.includes('HOME=/home/explorer'));
    assert.deepEqual(L, L.slice().sort());
  });
});

describe('where the options live', () => {
  it('options set in a function persist after it, as in bash', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'f() { set -e; }; f; set -o | grep errexit').out, 'errexit        \ton');
  });
  it('a subshell, $( ) or pipeline stage does not leak its options', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, '(set -e); x=$(set -u); set -x | cat; set -o | grep -E "^(errexit|nounset|xtrace) "').out, 'errexit        \toff\nnounset        \toff\nxtrace         \toff');
  });
  it('a script starts with the options off and they are back to the caller\'s afterwards', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'set -o | grep -E "^(errexit|pipefail) "\nset -euo pipefail');
    assert.equal(run(SQ, 'set -o pipefail; bash s.sh; set -o | grep -E "^(errexit|pipefail) "').out,
      'errexit        \toff\npipefail       \toff\nerrexit        \toff\npipefail       \ton');
  });
  it('a sourced file shares the caller\'s options', () => {
    const SQ = loadShell();
    put(SQ, 'o.sh', 'set -u');
    assert.equal(run(SQ, 'source o.sh; set -o | grep nounset').out, 'nounset        \ton');
  });
  it('typed lines: set -e stops the failing line only (bash would close the shell)', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'set -e').code, 0);
    assert.deepEqual(run(SQ, 'false; echo after'), { out: '', code: 1 });
    assert.deepEqual(run(SQ, 'echo still here'), { out: 'still here', code: 0 });
    assert.deepEqual(run(SQ, 'cat nope; echo x'), { out: 'cat: nope: No such file or directory', code: 1 });
    assert.deepEqual(run(SQ, 'false || echo rescued'), { out: 'rescued', code: 0 });
    run(SQ, 'set +e');
    assert.deepEqual(run(SQ, 'false; echo after'), { out: 'after', code: 0 });
  });
  it('typed lines: set -u ends the line at an unbound variable', () => {
    const SQ = loadShell();
    run(SQ, 'set -u');
    assert.deepEqual(run(SQ, 'echo $nope; echo after'), { out: UNBOUND('nope'), code: 1 });
    assert.deepEqual(run(SQ, 'echo next'), { out: 'next', code: 0 });
  });
  it('a sandboxed script check and "Reset world" start with the options off', () => {
    const SQ = loadShell();
    run(SQ, 'set -eux');
    put(SQ, 'c.sh', 'false; echo ran');
    assert.equal(SQ.sandbox(() => SQ.runScript('c.sh', { force: true, tty: false, depth: 1 })).out, 'ran');
    SQ.resetProcs();
    assert.deepEqual(run(SQ, 'echo $nope x'), { out: 'x', code: 0 });
  });
});

describe('background jobs inherit the options', () => {
  it('set -e inside a script: a job\'s subshell stops at its failing command', () => {
    const SQ = loadShell();
    const r = script(SQ, 'set -e\n(false; echo no) &\nwait\necho done');
    assert.equal(r.out, 'done');
    assert.equal(r.code, 0);
  });
  it('set -e ends a job whose own list fails (its status is the failing one)', () => {
    const SQ = loadShell();
    const r = script(SQ, 'set -e\n{ echo a; false; echo no; } &\nwait $! || echo "st $?"');
    assert.equal(r.out, 'a\nst 1');
  });
  it('set -e is ignored inside a job where it is ignored in the foreground', () => {
    const SQ = loadShell();
    assert.equal(script(SQ, 'set -e\n{ false || echo r; if false; then :; fi; echo b; } &\nwait').out, 'r\nb');
  });
  it('xtrace inside a job', () => {
    const SQ = loadShell();
    const r = script(SQ, 'set -x\n{ echo a; } &\nwait');
    assert.equal(r.out, '+ wait\n+ echo a\na');
  });
  it('pipefail and nounset in a job', () => {
    const SQ = loadShell();
    assert.equal(script(SQ, 'set -o pipefail\n{ false | true; echo "p $?"; } &\nwait').out, 'p 1');
    assert.equal(script(SQ, 'set -u\n{ echo $nope; echo no; } &\nwait $!; echo "st $?"').out, UNBOUND('nope') + '\nst 1');
  });
  it('a typed job started after set -x is traced', () => {
    const SQ = loadShell();
    run(SQ, 'set -x');
    const r = run(SQ, '(echo bg) & wait');
    assert.ok(r.out.includes('+ echo bg\nbg'), r.out);
  });
});

describe('bash -c / -n / -x / -e / -u and sh', () => {
  it('bash -c CMD [name args...] sets $0 and $1..', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "bash -c 'echo $0 $1 $#' name arg").out, 'name arg 1');
    assert.equal(run(SQ, "bash -c 'echo $0 $#'").out, 'bash 0');
    assert.equal(run(SQ, "sh -c 'echo $0'").out, 'sh');
    assert.equal(run(SQ, "bash -c 'echo \"$@\"' n a 'b c'").out, 'a b c');
  });
  it('the exit status and isolation of the child shell', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "bash -c 'exit 3'; echo $?").out, '3');
    assert.equal(run(SQ, "bash -c 'false'; echo $?").out, '1');
    assert.equal(run(SQ, "x=0; bash -c 'x=1; cd /tmp; f() { :; }'; echo \"[$x]\"; pwd; type f >/dev/null 2>&1 || echo nofn").out, '[0]\n/home/explorer\nnofn');
    assert.equal(run(SQ, "export E=1; bash -c 'echo $E'").out, '1');
    assert.equal(run(SQ, "bash -c 'echo hi > made.txt'; cat made.txt").out, 'hi');
    assert.equal(run(SQ, "echo piped | bash -c 'cat'").out, 'piped');
  });
  it('the Toolsmith missions 19.1 to 19.3', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, "bash -c 'set -e; false; echo after'; echo $?"), { out: '1', code: 0 });
    assert.deepEqual(run(SQ, "bash -c 'set -u; echo \"$nope\"'"), { out: UNBOUND('nope'), code: 1 });
    assert.deepEqual(run(SQ, "bash -c 'set -o pipefail; false | true; echo $?'"), { out: '1', code: 0 });
  });
  it('bash -c errors', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'bash -c'), { out: 'bash: -c: option requires an argument', code: 2 });
    assert.deepEqual(run(SQ, "bash -c 'echo \"${x'"), { out: "bash: -c: line 1: unexpected EOF while looking for matching '}'", code: 2 });
    assert.deepEqual(run(SQ, "bash -c 'echo a\nfi'"), { out: "bash: -c: line 2: syntax error near unexpected token 'fi'", code: 2 });
    assert.deepEqual(run(SQ, 'bash -Q'), { out: 'bash: -Q: invalid option\nUsage:\tbash [GNU long option] [option] ...\n\tbash [GNU long option] [option] script-file ...', code: 2 });
    assert.deepEqual(run(SQ, 'bash -i'), { out: 'this practice shell does not support bash -i yet', code: 2 });
    assert.deepEqual(run(SQ, 'bash --posix s.sh'), { out: 'this practice shell does not support bash --posix yet', code: 2 });
    assert.deepEqual(run(SQ, 'bash -o nope -c :'), { out: 'bash: nope: invalid option name', code: 2 });
    assert.equal(run(SQ, 'bash').out, 'You are already in bash. To run a script, give its name: bash pack.sh');
  });
  it('combined option letters and -o NAME', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, "bash -eu -c 'echo $x; echo no'; echo $?"), { out: UNBOUND('x') + '\n1', code: 0 });
    assert.equal(run(SQ, "bash -x -c 'echo hi'").out, '+ echo hi\nhi');
    assert.equal(run(SQ, "x=$(bash -x -c 'echo a'); echo $x").out, '+ echo a\na'); // a child shell's trace starts at one + inside $( )
    assert.equal(run(SQ, "bash -o pipefail -c 'false | true'; echo $?").out, '1');
    assert.equal(run(SQ, "bash -e -c 'false; echo no'; echo $?").out, '1');
    assert.equal(run(SQ, "bash -c -e 'false; echo no'; echo $?").out, '1');
  });
  it('bash -n FILE parses only: nothing runs, status 0, or the syntax error with status 2', () => {
    const SQ = loadShell();
    put(SQ, 'good.sh', 'echo hi > ran.txt');
    assert.deepEqual(run(SQ, 'bash -n good.sh; echo $?'), { out: '0', code: 0 });
    assert.equal(run(SQ, 'ls ran.txt 2>&1').out, "ls: cannot access 'ran.txt': No such file or directory");
    put(SQ, 'bad.sh', 'echo hi > ran.txt\necho b\nfi\necho c');
    assert.deepEqual(run(SQ, 'bash -n bad.sh'), { out: "bad.sh: line 3: syntax error near unexpected token 'fi'", code: 2 });
    assert.equal(run(SQ, 'ls ran.txt 2>&1').out, "ls: cannot access 'ran.txt': No such file or directory");
    assert.deepEqual(run(SQ, 'bash -n nope.sh'), { out: 'bash: nope.sh: No such file or directory', code: 127 });
    assert.deepEqual(run(SQ, "bash -n -c 'echo hi'; echo $?"), { out: '0', code: 0 });
    assert.deepEqual(run(SQ, "sh -n bad.sh"), { out: "bad.sh: line 3: syntax error near unexpected token 'fi'", code: 2 });
  });
  it('bash -x FILE traces the script; stdout keeps its order and interleaves with the trace', () => {
    const SQ = loadShell();
    put(SQ, 'x.sh', 'echo a\necho b "c d"\nf() { echo in; }\nf');
    assert.equal(run(SQ, 'bash -x x.sh').out, "+ echo a\na\n+ echo b 'c d'\nb c d\n+ f\n+ echo in\nin");
    assert.equal(run(SQ, 'bash -x x.sh > o.txt').out, "+ echo a\n+ echo b 'c d'\n+ f\n+ echo in");
    assert.equal(run(SQ, 'cat o.txt').out, 'a\nb c d\nin');
    assert.equal(run(SQ, 'bash x.sh').out, 'a\nb c d\nin');
    put(SQ, 'y.sh', 'echo a\nset -x\necho b');
    assert.equal(run(SQ, 'bash y.sh').out, 'a\n+ echo b\nb');
  });
  it('bash -e FILE and bash -u FILE; args after the file', () => {
    const SQ = loadShell();
    put(SQ, 'e.sh', 'echo $1\nfalse\necho no');
    assert.deepEqual(run(SQ, 'bash -e e.sh arg'), { out: 'arg', code: 1 });
    put(SQ, 'u.sh', 'echo $nope\necho no');
    assert.deepEqual(run(SQ, 'bash -u u.sh'), { out: UNBOUND('nope'), code: 1 });
    assert.deepEqual(run(SQ, 'sh -eu u.sh'), { out: UNBOUND('nope'), code: 1 });
  });
});

describe('hot path with the options off', () => {
  it('5,000 loop iterations stay fast', () => {
    const SQ = loadShell();
    const line = 'n=0; for i in $(seq 5000); do n=$((n+i)); done; echo $n';
    for (let k = 0; k < 3; k++) run(SQ, line);
    const times = [];
    for (let k = 0; k < 5; k++) { const t = performance.now(); assert.equal(run(SQ, line).out, '12502500'); times.push(performance.now() - t); }
    times.sort((a, b) => a - b);
    assert.ok(times[2] < 400, `median ${times[2].toFixed(1)} ms (about 55 ms before Task 13 on the dev machine)`);
  });
});
