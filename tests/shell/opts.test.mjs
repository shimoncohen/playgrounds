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

/* ---------- Task 15: getopts, mktemp, command, type -t, readonly, printenv, realpath ----------
   GETOPTS: [script text, args, expected output (stdout and stderr in order), status], recorded with GNU bash 5.2.21 as `bash s.sh ARGS`.
   bash's `s.sh: line N: ` prefix on builtin errors is shown in this shell's typed-line `bash: ` form (the getopts option messages keep the
   script name, `s.sh: illegal option -- x`, as bash prints them). */
const GETOPTS = [
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-v -n Ada file", "opt=v OPTARG=unset OPTIND=2\nopt=n OPTARG=Ada OPTIND=4\nend 0 opt=? OPTIND=4\nrest=file", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-vn Ada", "opt=v OPTARG=unset OPTIND=1\nopt=n OPTARG=Ada OPTIND=3\nend 0 opt=? OPTIND=3\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-nAda x y", "opt=n OPTARG=Ada OPTIND=2\nend 0 opt=? OPTIND=2\nrest=x y", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-v -- -n x", "opt=v OPTARG=unset OPTIND=2\nend 0 opt=? OPTIND=3\nrest=-n x", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-n", "s.sh: option requires an argument -- n\nopt=? OPTARG=unset OPTIND=2\nend 0 opt=? OPTIND=2\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-v -n", "opt=v OPTARG=unset OPTIND=2\ns.sh: option requires an argument -- n\nopt=? OPTARG=unset OPTIND=3\nend 0 opt=? OPTIND=3\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-x", "s.sh: illegal option -- x\nopt=? OPTARG=unset OPTIND=2\nend 0 opt=? OPTIND=2\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-vx -n A", "opt=v OPTARG=unset OPTIND=1\ns.sh: illegal option -- x\nopt=? OPTARG=unset OPTIND=2\nopt=n OPTARG=A OPTIND=4\nend 0 opt=? OPTIND=4\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "a -v", "end 0 opt=? OPTIND=1\nrest=a -v", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "", "end 0 opt=? OPTIND=1\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-", "end 0 opt=? OPTIND=1\nrest=-", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-v - x", "opt=v OPTARG=unset OPTIND=2\nend 0 opt=? OPTIND=2\nrest=- x", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "--", "end 0 opt=? OPTIND=2\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-v --x", "opt=v OPTARG=unset OPTIND=2\ns.sh: illegal option -- -\nopt=? OPTARG=unset OPTIND=2\ns.sh: illegal option -- x\nopt=? OPTARG=unset OPTIND=3\nend 0 opt=? OPTIND=3\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-n -v", "opt=n OPTARG=-v OPTIND=3\nend 0 opt=? OPTIND=3\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-nv", "opt=n OPTARG=v OPTIND=2\nend 0 opt=? OPTIND=2\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-vvv", "opt=v OPTARG=unset OPTIND=1\nopt=v OPTARG=unset OPTIND=1\nopt=v OPTARG=unset OPTIND=2\nend 0 opt=? OPTIND=2\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-n ''", "opt=n OPTARG= OPTIND=3\nend 0 opt=? OPTIND=3\nrest=", 0],
  ["while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-v -n 'A B' c", "opt=v OPTARG=unset OPTIND=2\nopt=n OPTARG=A B OPTIND=4\nend 0 opt=? OPTIND=4\nrest=c", 0],
  ["while getopts \":vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-x", "opt=? OPTARG=x OPTIND=2\nend 0 opt=? OPTIND=2\nrest=", 0],
  ["while getopts \":vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-v -n", "opt=v OPTARG=unset OPTIND=2\nopt=: OPTARG=n OPTIND=3\nend 0 opt=? OPTIND=3\nrest=", 0],
  ["while getopts \":vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-vxn A", "opt=v OPTARG=unset OPTIND=1\nopt=? OPTARG=x OPTIND=1\nopt=n OPTARG=A OPTIND=3\nend 0 opt=? OPTIND=3\nrest=", 0],
  ["while getopts \":vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-n A -v b", "opt=n OPTARG=A OPTIND=3\nopt=v OPTARG=unset OPTIND=4\nend 0 opt=? OPTIND=4\nrest=b", 0],
  ["while getopts \":vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-xn", "opt=? OPTARG=x OPTIND=1\nopt=: OPTARG=n OPTIND=2\nend 0 opt=? OPTIND=2\nrest=", 0],
  ["OPTERR=0; while getopts \"vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-x -n", "opt=? OPTARG=unset OPTIND=2\nopt=? OPTARG=unset OPTIND=3\nend 0 opt=? OPTIND=3\nrest=", 0],
  ["OPTERR=0; while getopts \":vn:\" opt; do echo \"opt=$opt OPTARG=${OPTARG-unset} OPTIND=$OPTIND\"; done; echo \"end $? opt=$opt OPTIND=$OPTIND\"; shift $((OPTIND-1)); echo \"rest=$*\"", "-x -n", "opt=? OPTARG=x OPTIND=2\nopt=: OPTARG=n OPTIND=3\nend 0 opt=? OPTIND=3\nrest=", 0],
  ["while getopts \"vn:\" o -v -n Ada x; do echo \"$o ${OPTARG-u} $OPTIND\"; done; echo \"end $OPTIND $*\"", "ignored -n B", "v u 2\nn Ada 4\nend 4 ignored -n B", 0],
  ["f() { while getopts \"a\" o; do echo \"f $o $OPTIND\"; done; echo \"f end $OPTIND\"; }; f -a -a x; echo \"main $OPTIND\"; f -a", "-v", "f a 2\nf a 3\nf end 3\nmain 3\nf end 2", 0],
  ["f() { local OPTIND=1 o; while getopts \"a\" o; do echo \"f $o $OPTIND\"; done; echo \"f end $OPTIND\"; }; f -a; f -a -a; echo \"main $OPTIND\"", "", "f a 2\nf end 2\nf a 2\nf a 3\nf end 3\nmain 1", 0],
  ["getopts \"ab\" o -ab; echo \"$o $OPTIND\"; OPTIND=1; getopts \"ab\" o -ab; echo \"$o $OPTIND\"; getopts \"ab\" o -ab; echo \"$o $OPTIND\"; getopts \"ab\" o -ab; echo \"$? $o $OPTIND\"", "", "a 1\na 1\nb 2\n1 ? 2", 0],
  ["getopts; echo \"s=$?\"; getopts a; echo \"s=$?\"", "", "getopts: usage: getopts optstring name [arg ...]\ns=2\ngetopts: usage: getopts optstring name [arg ...]\ns=2", 0],
  ["getopts a 1x -a; echo \"s=$?\"; getopts a \"a b\" -a; echo \"s=$?\"", "", "bash: getopts: `1x': not a valid identifier\ns=1\nbash: getopts: `a b': not a valid identifier\ns=1", 0],
  ["while getopts \":a:\" o; do echo \"$o ${OPTARG-u}\"; done", "-: -a: -:", "? :\na :\n? :", 0],
  ["while getopts \"a?\" o; do echo \"$o ${OPTARG-u}\"; done", "-? -a", "? u\na u", 0],
  ["while getopts \"12\" o; do echo \"$o\"; done; echo \"$OPTIND $*\"", "-1 -2 x", "1\n2\n3 -1 -2 x", 0],
  ["getopts \"a\" o; echo \"s=$? o=$o OPTIND=$OPTIND OPTARG=${OPTARG-u}\"", "", "s=1 o=? OPTIND=1 OPTARG=u", 0],
  ["getopts \"a\" o; echo \"s=$? o=$o\"", "-x", "s.sh: illegal option -- x\ns=0 o=?", 0],
  ["while getopts \"abc\" o; do echo \"$o $OPTIND\"; done", "-abc -c", "a 1\nb 1\nc 2\nc 3", 0],
  ["OPTARG=keep; getopts \"v\" o; echo \"${OPTARG-unset}\"", "-v", "unset", 0],
  ["OPTARG=keep; getopts \"v\" o; echo \"${OPTARG-unset}\"", "-x", "s.sh: illegal option -- x\nunset", 0],
  ["OPTARG=keep; getopts \":v\" o; echo \"${OPTARG-unset}\"", "-x", "x", 0],
  ["OPTIND=9; getopts \"v\" o; echo \"s=$? o=$o $OPTIND\"", "-v", "s=1 o=? 2", 0],
  ["OPTIND=x; getopts \"v\" o; echo \"s=$? o=$o $OPTIND\"", "-v", "s=0 o=v 2", 0],
  ["OPTIND=0; getopts \"v\" o; echo \"s=$? o=$o $OPTIND\"", "-v", "s=0 o=v 2", 0],
  ["getopts \"\" o; echo \"s=$? o=$o ${OPTARG-u}\"", "-v", "s.sh: illegal option -- v\ns=0 o=? u", 0],
  ["getopts \":\" o; echo \"s=$? o=$o ${OPTARG-u}\"", "-v", "s=0 o=? v", 0],
  ["getopts \"v\" o; echo \"s=$? o=$o\"; getopts \"v\" o; echo \"s=$? o=$o $OPTIND\"", "-v", "s=0 o=v\ns=1 o=? 2", 0],
  ["set -- -v -n Z q; while getopts vn: o; do echo \"$o ${OPTARG-}\"; done; echo $OPTIND", "", "v \nn Z\n4", 0],
  ["getopts \"vn:\" o -n; echo \"s=$? o=$o ${OPTARG-u} $OPTIND\"", "", "s.sh: option requires an argument -- n\ns=0 o=? u 2", 0],
  ["getopts \":vn:\" o -n; echo \"s=$? o=$o ${OPTARG-u} $OPTIND\"", "", "s=0 o=: n 2", 0],
  ["getopts \"n:\" o -n --; echo \"s=$? o=$o ${OPTARG-u} $OPTIND\"", "", "s=0 o=n -- 3", 0],
  ["while getopts \"n:\" o; do echo \"$o $OPTARG\"; done; echo $OPTIND", "-n -n -n", "n -n\ns.sh: option requires an argument -- n\n? \n4", 0],
  ["while getopts \"v\" o; do echo \"$o\"; done; echo \"$OPTIND\"; while getopts \"v\" o; do echo \"again $o\"; done; echo \"$OPTIND\"", "-v -v", "v\nv\n3\n3", 0],
  ["unset OPTIND; getopts \"v\" o; echo \"s=$? $o $OPTIND\"", "-v", "s=0 v 2", 0],
  ["echo \"$OPTIND ${OPTERR-u}\"", "", "1 1", 0],
  ["while getopts \"v\" o; do case $o in v) echo V;; \\?) echo \"bad\"; exit 2;; esac; done", "-v -q", "V\ns.sh: illegal option -- q\nbad", 2],
  ["getopts \"v\" o 2>/dev/null; echo \"s=$? o=$o\"", "-q", "s=0 o=?", 0],
  ["while getopts \"a:\" o; do echo \"[$OPTARG]\"; done", "-a '' -a x", "[]\n[x]", 0],
  ["getopts \"a\" \"o\" -a; echo $o; getopts a o -a -a; echo \"$o $OPTIND\"", "", "a\na 3", 0],
];

describe('getopts', () => {
  for (const [text, args, out, code] of GETOPTS) {
    it(`${text.length > 70 ? text.slice(0, 67) + '...' : text} [${args}]`, () => {
      const SQ = loadShell();
      assert.deepEqual(script(SQ, text, args), { out, code });
    });
  }
  it('the plan loop: case on $opt over every argument shape, then shift $((OPTIND-1))', () => {
    const SQ = loadShell();
    const loop = 'V=0 N=none\nwhile getopts "vn:" opt; do\n  case $opt in\n    v) V=1;;\n    n) N=$OPTARG;;\n    \\?) echo "usage: s.sh [-v] -n NAME" >&2; exit 2;;\n  esac\ndone\nshift $((OPTIND-1))\necho "V=$V N=$N rest=$*"';
    assert.deepEqual(script(SQ, loop, '-v -n Ada file'), { out: 'V=1 N=Ada rest=file', code: 0 });
    assert.deepEqual(script(SQ, loop, '-vn Ada'), { out: 'V=1 N=Ada rest=', code: 0 });
    assert.deepEqual(script(SQ, loop, '-nAda'), { out: 'V=0 N=Ada rest=', code: 0 });
    assert.deepEqual(script(SQ, loop, '-v -- -n x'), { out: 'V=1 N=none rest=-n x', code: 0 });
    assert.deepEqual(script(SQ, loop, '-n'), { out: 's.sh: option requires an argument -- n\nusage: s.sh [-v] -n NAME', code: 2 });
    assert.deepEqual(script(SQ, loop, '-x'), { out: 's.sh: illegal option -- x\nusage: s.sh [-v] -n NAME', code: 2 });
    const silent = 'while getopts ":vn:" opt; do\n  case $opt in\n    n) N=$OPTARG;;\n    :) echo "missing $OPTARG"; exit 3;;\n    \\?) echo "bad $OPTARG"; exit 2;;\n  esac\ndone';
    assert.deepEqual(script(SQ, silent, '-n'), { out: 'missing n', code: 3 });
    assert.deepEqual(script(SQ, silent, '-x'), { out: 'bad x', code: 2 });
  });
  it('the message prefix is $0 of the script or bash -c (bash at the prompt); a function or sourced file keeps it', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'getopts v o -x; echo "s=$? o=$o"'), { out: 'bash: illegal option -- x\ns=0 o=?', code: 0 });
    assert.equal(run(SQ, "bash -c 'getopts v o -x'").out, 'bash: illegal option -- x');
    assert.equal(run(SQ, "bash -c 'getopts v o -x' nm").out, 'nm: illegal option -- x');
    assert.equal(run(SQ, "bash -c 'f() { getopts v o -x; }; f' myname").out, 'myname: illegal option -- x');
    run(SQ, 'mkdir -p scripts');
    put(SQ, 'scripts/o.sh', 'f() { getopts "n:" o; }\nf "$@"\necho "src" > /dev/null\nsource scripts/inner.sh');
    put(SQ, 'scripts/inner.sh', 'OPTIND=1; getopts v o -y');
    assert.equal(run(SQ, 'bash scripts/o.sh -n').out, 'scripts/o.sh: option requires an argument -- n\nscripts/o.sh: illegal option -- y');
    assert.equal(run(SQ, 'OPTIND=1; getopts "ab:" opt -a; echo $opt').out, 'a');
    assert.deepEqual(run(SQ, 'getopts'), { out: 'getopts: usage: getopts optstring name [arg ...]', code: 2 });
    assert.deepEqual(run(SQ, 'getopts -a x -a'), { out: 'bash: getopts: -a: invalid option\ngetopts: usage: getopts optstring name [arg ...]', code: 2 });
    assert.deepEqual(run(SQ, 'OPTIND=1; getopts -- a x -a; echo $x'), { out: 'a', code: 0 });
  });
  it('OPTIND: 1 in a new shell or script, kept by functions, copied into a subshell, reset by assignment and by local OPTIND', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo "$OPTIND $OPTERR"').out, '1 1');
    assert.equal(run(SQ, 'getopts a o -a -a; echo $OPTIND').out, '2');
    put(SQ, 's2.sh', 'echo "in $OPTIND"; getopts a o -a; echo "in $OPTIND"');
    assert.equal(run(SQ, 'bash s2.sh; echo "out $OPTIND"').out, 'in 1\nin 2\nout 2');
    assert.equal(run(SQ, '(getopts a o -a -a; echo "sub $OPTIND"); echo "main $OPTIND"').out, 'sub 3\nmain 2');
    assert.equal(run(SQ, 'echo $(getopts a o -a -a; echo $OPTIND) $OPTIND').out, '3 2');
    assert.equal(run(SQ, 'OPTIND=1; getopts ab o -ab; echo "$o $OPTIND"; OPTIND=1; getopts ab o -ab; echo "$o $OPTIND"').out, 'a 1\na 1');
    assert.equal(run(SQ, '(( OPTIND = 1 )); getopts ab o -ab; echo "$o $OPTIND"').out, 'a 1');
    assert.equal(run(SQ, 'f() { local OPTIND=1 o; while getopts a o "$@"; do echo "f $o $OPTIND"; done; }; OPTIND=1; f -a; f -a -a; echo "main $OPTIND"').out, 'f a 2\nf a 2\nf a 3\nmain 1');
  });
  it('a readonly name or OPTIND: the error and bash\'s statuses', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'readonly X=1; getopts a X -a; echo "s=$? X=$X"').out, 'bash: X: readonly variable\ns=2 X=1');
    assert.equal(run(SQ, 'readonly OPTIND=1; getopts a o -a; echo "s=$? $o"').out, 'bash: OPTIND: readonly variable\ns=0 a');
    assert.deepEqual(run(SQ, 'getopts a 1x -a; echo "s=$?"'), { out: "bash: getopts: `1x': not a valid identifier\ns=1", code: 0 });
  });
});

describe('mktemp', () => {
  const ls = (SQ, p) => run(SQ, `ls -A ${p}`).out;
  it('names come from a per-session counter: files and directories under /tmp, private modes', () => {
    const SQ = loadShell();
    run(SQ, 'mkdir camp');
    assert.deepEqual(run(SQ, 'mktemp'), { out: '/tmp/tmp.A00001', code: 0 });
    assert.deepEqual(run(SQ, 'mktemp'), { out: '/tmp/tmp.A00002', code: 0 });
    assert.deepEqual(run(SQ, 'mktemp -d'), { out: '/tmp/tmp.A00003', code: 0 });
    assert.equal(run(SQ, 'ls -l /tmp').out, '-rw-------  explorer      0  tmp.A00001\n-rw-------  explorer      0  tmp.A00002\ndrwx------  explorer   4096  tmp.A00003/');
    assert.equal(run(SQ, 't=$(mktemp); echo hi > "$t"; cat "$t"; echo $t').out, 'hi\n/tmp/tmp.A00004');
    assert.equal(run(SQ, 'mktemp /tmp/foo.XXXXXX').out, '/tmp/foo.A00005');
    assert.equal(run(SQ, 'mktemp fooXXX; ls fooA06').out, 'fooA06\nfooA06');
    assert.equal(run(SQ, 'mktemp -p camp').out, 'camp/tmp.A00007');
    assert.equal(run(SQ, 'mktemp -t bar.XXXX').out, '/tmp/bar.A008');
    assert.equal(run(SQ, 'mktemp -u; ls /tmp/tmp.A00009').out, "/tmp/tmp.A00009\nls: cannot access '/tmp/tmp.A00009': No such file or directory");
    assert.equal(run(SQ, 'mktemp --tmpdir=camp x.XXX; mktemp --tmpdir y.XXX').out, 'camp/x.A10\n/tmp/y.A11');
    assert.equal(run(SQ, 'mktemp -d -p camp/ dXXXXX').out, 'camp/dA0012');
    assert.equal(run(SQ, 'mktemp -- -XXX').out, '-A13');
    assert.equal(run(SQ, 'mktemp fooXXXbar').out, 'fooA14bar');
    assert.equal(run(SQ, 'export TMPDIR=camp; mktemp; unset TMPDIR; mktemp').out, 'camp/tmp.A00015\n/tmp/tmp.A00016');
  });
  it('GNU errors', () => {
    const SQ = loadShell();
    const TRY = "\nTry 'mktemp --help' for more information.";
    const cases = [
      ['mktemp abc', "mktemp: too few X's in template 'abc'"],
      ['mktemp XX', "mktemp: too few X's in template 'XX'"],
      ["mktemp ''", "mktemp: too few X's in template ''"],
      ['mktemp nodir/fooXXX', "mktemp: failed to create file via template 'nodir/fooXXX': No such file or directory"],
      ['mktemp -d nodir/fooXXX', "mktemp: failed to create directory via template 'nodir/fooXXX': No such file or directory"],
      ['mktemp -p nodir', "mktemp: failed to create file via template 'nodir/tmp.XXXXXXXXXX': No such file or directory"],
      ['mktemp -d -p nodir', "mktemp: failed to create directory via template 'nodir/tmp.XXXXXXXXXX': No such file or directory"],
      ['mktemp -p readme.txt', "mktemp: failed to create file via template 'readme.txt/tmp.XXXXXXXXXX': Not a directory"],
      ['mktemp readme.txt/XXX', "mktemp: failed to create file via template 'readme.txt/XXX': Not a directory"],
      ['mktemp -t foo/XXX', "mktemp: invalid template, 'foo/XXX', contains directory separator"],
      ['mktemp -p /tmp /abs/XXX', "mktemp: invalid template, '/abs/XXX'; with --tmpdir, it may not be absolute"],
      ['mktemp a b', 'mktemp: too many templates' + TRY],
      ['mktemp -z', "mktemp: invalid option -- 'z'" + TRY],
      ['mktemp --bogus', "mktemp: unrecognized option '--bogus'" + TRY],
      ['mktemp -p', "mktemp: option requires an argument -- 'p'" + TRY],
      ['mktemp -q', 'this practice shell does not support mktemp -q yet'],
      ['mktemp --suffix=.x', 'this practice shell does not support mktemp --suffix yet'],
    ];
    for (const [line, out] of cases) assert.deepEqual(run(SQ, line), { out, code: 1 }, line);
    assert.equal(ls(SQ, '/tmp'), '', 'nothing was created');
    assert.deepEqual(run(SQ, 'mktemp'), { out: '/tmp/tmp.A00001', code: 0 }, 'a failure does not use up a name');
  });
  it('an existing name is skipped; the counter restarts with Reset world and inside the sandbox', () => {
    const SQ = loadShell();
    run(SQ, 'touch /tmp/tmp.A00001; mkdir /tmp/tmp.A00002');
    assert.equal(run(SQ, 'mktemp').out, '/tmp/tmp.A00003');
    assert.equal(SQ.sandbox(() => run(SQ, 'mktemp; mktemp').out), '/tmp/tmp.A00004\n/tmp/tmp.A00005');
    assert.equal(run(SQ, 'mktemp').out, '/tmp/tmp.A00004', 'the sandbox used its own counter and world');
    SQ.resetProcs();
    run(SQ, 'rm -r /tmp/tmp.A0000*');
    assert.equal(run(SQ, 'mktemp').out, '/tmp/tmp.A00001');
  });
  it('flooding /tmp: 500 in one line works, 1000 entries in a folder is the limit, a runaway loop hits the step cap', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'for i in $(seq 1 500); do mktemp; done | wc -l'), { out: '500', code: 0 });
    const r = run(SQ, 'for i in $(seq 1 600); do mktemp > /dev/null; done 2>&1 | sort | uniq -c');
    assert.equal(r.out, "    100 mktemp: failed to create file via template '/tmp/tmp.XXXXXXXXXX': No space left on device");
    assert.equal(run(SQ, 'ls /tmp | wc -l').out, '1000');
    assert.equal(run(SQ, 'mktemp -d; echo $?').out, "mktemp: failed to create directory via template '/tmp/tmp.XXXXXXXXXX': No space left on device\n1");
    run(SQ, 'rm -r /tmp/tmp.*');
    assert.equal(run(SQ, 'while :; do mktemp -u > /dev/null; done').out, 'this practice shell stopped the command: too many steps');
    assert.equal(run(SQ, 'mktemp -p forest').out.startsWith('forest/tmp.A'), true, 'the next line works');
  });
  it("a script's trap 'rm -f \"$t\"' EXIT leaves /tmp empty", () => {
    const SQ = loadShell();
    assert.equal(script(SQ, 't=$(mktemp)\ntrap \'rm -f "$t"\' EXIT\necho data > "$t"\ncat "$t"').out, 'data');
    assert.equal(ls(SQ, '/tmp'), '');
    assert.equal(script(SQ, 'set -e\nt=$(mktemp -d)\ntrap \'rm -rf "$t"\' EXIT\ntouch "$t/a"\nfalse\necho no').code, 1);
    assert.equal(ls(SQ, '/tmp'), '');
  });
});

describe('command', () => {
  it('-v prints how a name would run: a path, or the name of a builtin, keyword or function; status 1 when none is found', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'command -v ls'), { out: '/usr/bin/ls', code: 0 });
    assert.equal(run(SQ, 'command -v cd if getopts readonly command type mktemp printenv realpath').out, 'cd\nif\ngetopts\nreadonly\ncommand\ntype\n/usr/bin/mktemp\n/usr/bin/printenv\n/usr/bin/realpath');
    assert.equal(run(SQ, 'f() { :; }; command -v f').out, 'f');
    assert.deepEqual(run(SQ, 'command -v nope; echo $?'), { out: '1', code: 0 });
    assert.deepEqual(run(SQ, 'command -v nope ls; echo $?'), { out: '/usr/bin/ls\n0', code: 0 });
    assert.deepEqual(run(SQ, "command -v ''; echo $?"), { out: '1', code: 0 });
    assert.deepEqual(run(SQ, 'command -v; echo $?'), { out: '0', code: 0 });
    put(SQ, 'run.sh', 'echo ran');
    assert.deepEqual(run(SQ, 'command -v ./run.sh; echo $?'), { out: '1', code: 0 });
    run(SQ, 'chmod +x run.sh');
    assert.equal(run(SQ, 'command -v ./run.sh').out, './run.sh');
    assert.equal(run(SQ, 'command -vp ls').out, '/usr/bin/ls');
  });
  it('-V describes it like type', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'command -V ls cd if').out, 'ls is /usr/bin/ls\ncd is a shell builtin\nif is a shell keyword');
    assert.deepEqual(run(SQ, 'command -V nope; echo $?'), { out: 'bash: command: nope: not found\n1', code: 0 });
    assert.deepEqual(run(SQ, 'command -V nope ls; echo $?'), { out: 'bash: command: nope: not found\nls is /usr/bin/ls\n0', code: 0 });
    assert.equal(run(SQ, 'f() { :; }; command -V f').out, 'f is a function');
  });
  it('command NAME ARGS skips functions and runs the builtin or command', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'f() { echo mine; }; command f; echo $?'), { out: 'bash: f: command not found\n127', code: 0 });
    assert.equal(run(SQ, 'f').out, 'mine');
    assert.equal(run(SQ, 'echo() { printf "fake\\n"; }; command echo real; echo also').out, 'real\nfake');
    assert.equal(run(SQ, 'unset -f echo; cd() { echo nope; }; command cd /; pwd; unset -f cd; cd').out, '/');
    assert.deepEqual(run(SQ, 'command; echo $?'), { out: '0', code: 0 });
    assert.equal(run(SQ, 'command -p echo hi; command -- echo x').out, 'hi\nx');
    assert.deepEqual(run(SQ, 'command -x'), { out: 'bash: command: -x: invalid option\ncommand: usage: command [-pVv] command [arg ...]', code: 2 });
    assert.deepEqual(run(SQ, 'command nosuchcmd'), { out: 'bash: nosuchcmd: command not found', code: 127 });
    assert.equal(run(SQ, 'g() { command local x=1; echo "[$x]"; }; g; echo "[${x-unset}]"').out, '[1]\n[unset]');
    assert.equal(run(SQ, 'command exit 3; echo no').code, 127);
  });
});

describe('type -t', () => {
  it('one word per name: builtin, file, function, keyword; nothing and status 1 when missing', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'type -t cd'), { out: 'builtin', code: 0 });
    assert.deepEqual(run(SQ, 'type -t ll; echo $?'), { out: '1', code: 0 });
    assert.deepEqual(run(SQ, 'type -t cd ls if nope; echo $?'), { out: 'builtin\nfile\nkeyword\n1', code: 0 });
    assert.equal(run(SQ, 'f() { :; }; type -t f getopts readonly command type').out, 'function\nbuiltin\nbuiltin\nbuiltin\nbuiltin');
    assert.deepEqual(run(SQ, 'type -t; echo $?'), { out: '0', code: 0 });
    assert.equal(run(SQ, 'type cd ls').out, 'cd is a shell builtin\nls is /usr/bin/ls');
    assert.equal(run(SQ, 'type getopts').out, 'getopts is a shell builtin');
  });
});

describe('readonly', () => {
  const RO = (n) => `bash: ${n}: readonly variable`;
  it('every way of assigning or unsetting is refused with status 1', () => {
    const SQ = loadShell();
    const cases = [
      ['readonly X=1; X=2; echo "s=$? X=$X"', `${RO('X')}\ns=1 X=1`],
      ['readonly X=1; X=2 echo hi; echo "s=$? X=$X"', `${RO('X')}\nhi\ns=0 X=1`],
      ['readonly X=1; X=2 Y=3; echo "s=$? Y=${Y-unset}"', `${RO('X')}\ns=1 Y=unset`],
      ['readonly X=1; export X=2; echo "s=$? X=$X"', `${RO('X')}\ns=1 X=1`],
      ['readonly X=1; unset X; echo "s=$? X=$X"', 'bash: unset: X: cannot unset: readonly variable\ns=1 X=1'],
      ['readonly X=1; read X <<< hi; echo "s=$? X=$X"', `${RO('X')}\ns=1 X=1`],
      ['readonly X=1; for X in a b; do echo in $X; done; echo "s=$?"', `${RO('X')}\ns=1`],
      ['readonly X=1; f() { local X=2; echo "f $X"; }; f; echo "s=$?"', 'bash: local: X: readonly variable\nf 1\ns=0'],
      ['readonly X=1; (( X=2 )); echo "s=$? $X"', `${RO('X')}\ns=1 1`],
      ['readonly X=1; (( X++ )); echo "s=$? $X"', `${RO('X')}\ns=1 1`],
      ['readonly X=1; echo $((X=2)); echo "s=$? $X"', `${RO('X')}\ns=1 1`],
      ['readonly Z; echo ${Z:=4}; echo "s=$?"', `${RO('Z')}\ns=1`],
      ['readonly X=1; echo ${X:=5}', '1'],
      ['readonly X=1; printf -v X hi; echo "s=$? $X"', `${RO('X')}\ns=1 1`],
      ['readonly X; echo "s=$?"; X=3; echo "s=$? X=$X"', `s=0\n${RO('X')}\ns=1 X=`],
      ['X=5; readonly X; X=6; echo $X', `${RO('X')}\n5`],
      ['readonly X=1 X=2; echo "s=$? $X"', `${RO('X')}\ns=1 1`],
      ['readonly X=1; readonly X; echo "s=$? $X"', 's=0 1'],
      ['readonly X=1; true; X=2 && echo yes || echo no', `${RO('X')}\nno`],
    ];
    for (const [line, out] of cases) assert.equal(run(loadShell(), line).out, out, line);
  });
  it('readonly -p and readonly list the names as declare -r, sorted; export adds -x', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'readonly; readonly -p'), { out: '', code: 0 });
    run(SQ, 'readonly B="a b" A=1 C; Q=\'say "hi" $x \\ `\'; readonly Q; export E=1; readonly E');
    const want = 'declare -r A="1"\ndeclare -r B="a b"\ndeclare -r C\ndeclare -rx E="1"\ndeclare -r Q="say \\"hi\\" \\$x \\\\ \\`"';
    assert.equal(run(SQ, 'readonly -p').out, want);
    assert.equal(run(SQ, 'readonly').out, want);
    assert.equal(run(SQ, 'export').out, 'declare -rx E="1"');
  });
  it('option and name errors', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'readonly 1x=3'), { out: "bash: readonly: `1x=3': not a valid identifier", code: 1 });
    assert.deepEqual(run(SQ, 'readonly -z'), { out: 'bash: readonly: -z: invalid option\nreadonly: usage: readonly [-aAf] [name[=value] ...] or readonly -p', code: 2 });
    assert.deepEqual(run(SQ, 'readonly -f; echo s=$?'), { out: 's=0', code: 0 });
    assert.deepEqual(run(SQ, 'readonly -f g'), { out: 'this practice shell does not support readonly -f yet', code: 2 });
    assert.deepEqual(run(SQ, 'readonly -a A'), { out: 'this practice shell does not support readonly -a yet', code: 2 });
    assert.deepEqual(run(SQ, 'readonly -- K=1; K=2'), { out: RO('K'), code: 1 });
  });
  it('per shell: subshells, $( ) and pipeline stages inherit it and keep their own; functions share it; a script starts without', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'readonly X=1; ( X=2; echo "sub $?" ); echo $X').out, `${RO('X')}\nsub 1\n1`);
    assert.equal(run(SQ, 'y=$(X=2; echo "in $?"); echo $y').out, `${RO('X')}\nin 1`);
    assert.equal(run(SQ, 'X=2 | cat; echo done').out, `${RO('X')}\ndone`);
    assert.equal(run(SQ, '( readonly S=1 ); S=2; echo $S').out, '2');
    assert.equal(run(SQ, 'echo | readonly P=1; P=2; echo $P').out, '2');
    assert.equal(run(SQ, 'f() { readonly L=1; }; f; L=2; echo $L').out, `${RO('L')}\n1`);
    assert.equal(run(SQ, 'g() { local Y=1; readonly Y; }; g; Y=2; echo $Y').out, '2', "a local's readonly goes with it (bash)");
    assert.equal(run(SQ, "export E=1; readonly E; bash -c 'E=2; echo $E'").out, '2');
    put(SQ, 'r.sh', 'readonly Q=1\nQ=2\necho "after $?"');
    assert.deepEqual(run(SQ, 'bash r.sh; Q=3; echo $Q'), { out: `${RO('Q')}\nafter 1\n3`, code: 0 });
    put(SQ, 'e.sh', 'set -e\nreadonly Q=1\nQ=2\necho after');
    assert.deepEqual(run(SQ, 'bash e.sh'), { out: RO('Q'), code: 1 });
    assert.equal(run(SQ, '{ X=2; echo "job $?"; } & wait').out.split('\n').slice(1, 3).join('\n'), `${RO('X')}\njob 1`, 'a background job inherits it');
  });
  it('Reset world and the sandbox clear it, and it is never saved', () => {
    const SQ = loadShell();
    run(SQ, 'readonly X=1');
    assert.equal(SQ.sandbox(() => run(SQ, 'X=3; echo $X').out), '3');
    assert.equal(run(SQ, 'X=4').out, RO('X'));
    assert.ok(!/readonly|"ro"/.test(JSON.stringify(SQ.S)));
    SQ.resetProcs();
    assert.equal(run(SQ, 'X=5; echo $X').out, '5');
  });
});

describe('printenv', () => {
  it('the environment, or the named exported variables; status 1 when one is missing', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'printenv HOME'), { out: '/home/explorer', code: 0 });
    assert.deepEqual(run(SQ, 'printenv NOPE; echo $?'), { out: '1', code: 0 });
    assert.deepEqual(run(SQ, 'printenv NOPE HOME; echo $?'), { out: '/home/explorer\n1', code: 0 });
    assert.equal(run(SQ, 'FOO=bar printenv FOO').out, 'bar');
    assert.deepEqual(run(SQ, 'FOO=bar; printenv FOO; echo $?'), { out: '1', code: 0 });
    assert.equal(run(SQ, 'export FOO; printenv FOO USER').out, 'bar\nexplorer');
    assert.equal(run(SQ, 'printenv').out, run(SQ, 'env').out);
    assert.deepEqual(run(SQ, 'printenv -z'), { out: "printenv: invalid option -- 'z'\nTry 'printenv --help' for more information.", code: 2 });
    assert.deepEqual(run(SQ, 'printenv -0 HOME'), { out: 'this practice shell does not support printenv -0 yet', code: 2 });
  });
});

describe('realpath', () => {
  it('resolves . .. and links; GNU rules for what must exist (-e all, -m none, default all but the last); -s keeps links', () => {
    const SQ = loadShell();
    run(SQ, 'mkdir -p d/e; touch d/f; ln -s d/e le; ln -s nowhere dang; ln -s loop2 loop1; ln -s loop1 loop2');
    const H = '/home/explorer';
    const cases = [
      ['realpath readme.txt', `${H}/readme.txt`, 0],
      ['realpath d/../d/f', `${H}/d/f`, 0],
      ['realpath le/..', `${H}/d`, 0],
      ['realpath -s le/..', H, 0],
      ['realpath le', `${H}/d/e`, 0],
      ['realpath -s le', `${H}/le`, 0],
      ['realpath --no-symlinks le', `${H}/le`, 0],
      ['realpath dang', `${H}/nowhere`, 0],
      ['realpath -e dang', 'realpath: dang: No such file or directory', 1],
      ['realpath nope/x', 'realpath: nope/x: No such file or directory', 1],
      ['realpath -m nope/x/../y', `${H}/nope/y`, 0],
      ['realpath d/f/x', 'realpath: d/f/x: Not a directory', 1],
      ['realpath -m d/f/x', `${H}/d/f/x`, 0],
      ['realpath loop1', 'realpath: loop1: Too many levels of symbolic links', 1],
      ['realpath -e nope a', 'realpath: nope: No such file or directory\nrealpath: a: No such file or directory', 1],
      ['realpath d/new', `${H}/d/new`, 0],
      ['realpath . .. /', `${H}\n/home\n/`, 0],
      ['realpath -e d/f nope d', `${H}/d/f\nrealpath: nope: No such file or directory\n${H}/d`, 1],
      ['cd le; realpath .; cd', `${H}/d/e`, 0],
      ["realpath ''", "realpath: '': No such file or directory", 1],
      ['realpath', "realpath: missing operand\nTry 'realpath --help' for more information.", 1],
      ['realpath -x', "realpath: invalid option -- 'x'\nTry 'realpath --help' for more information.", 1],
      ['realpath -q nope', 'this practice shell does not support realpath -q yet', 1],
      ['realpath --relative-to=d d', 'this practice shell does not support realpath --relative-to yet', 1],
    ];
    for (const [line, out, code] of cases) assert.deepEqual(run(SQ, line), { out, code }, line);
  });
});

describe('a capstone-style script in the sandbox (getopts, mktemp, trap EXIT, set -euo pipefail, awk, sed, ${1:?})', () => {
  const LOGTOOL = [
    '#!/bin/bash',
    'set -euo pipefail',
    'level=ERROR',
    'n=3',
    'usage() { echo "usage: logtool.sh [-l LEVEL] [-n N] FILE" >&2; exit 2; }',
    'while getopts "l:n:" opt; do',
    '  case $opt in',
    '    l) level=$OPTARG ;;',
    '    n) n=$OPTARG ;;',
    '    *) usage ;;',
    '  esac',
    'done',
    'shift $((OPTIND - 1))',
    'file=${1:?usage: logtool.sh [-l LEVEL] [-n N] FILE}',
    'if [ ! -r "$file" ]; then echo "error: cannot read $file" >&2; exit 1; fi',
    'tmp=$(mktemp)',
    'trap \'rm -f "$tmp"\' EXIT',
    'grep -- "$level" "$file" > "$tmp" || true',
    'awk \'{ print $1 }\' "$tmp" | sort | uniq -c | sort -rn | head -n "$n" | sed \'s/^ *//\'',
  ].join('\n');
  const LOG = ['10.0.0.2 ERROR w', '10.0.0.1 ERROR disk', '10.0.0.2 WARN slow', '10.0.0.1 ERROR disk', '10.0.0.3 ERROR net', '10.0.0.2 ERROR x', '10.0.0.2 ERROR y', '10.0.0.4 ERROR z', '10.0.0.2 WARN q'].join('\n');
  const setup = () => {
    const SQ = loadShell();
    run(SQ, 'mkdir -p scripts logs');
    put(SQ, 'scripts/logtool.sh', LOGTOOL);
    put(SQ, 'logs/all.log', LOG);
    return SQ;
  };
  it('every path gives the right output and status and leaves /tmp empty inside the sandbox', () => {
    const SQ = setup();
    const cases = [
      [['logs/all.log'], '3 10.0.0.2\n2 10.0.0.1\n1 10.0.0.4', [], 0],
      [['-l', 'WARN', '-n', '1', 'logs/all.log'], '2 10.0.0.2', [], 0],
      [['-n', '2', 'logs/all.log'], '3 10.0.0.2\n2 10.0.0.1', [], 0],
      [['-l', 'NOPE', 'logs/all.log'], '', [], 0],
      [['logs/missing.log'], '', ['error: cannot read logs/missing.log'], 1],
      [['-x', 'logs/all.log'], '', ['scripts/logtool.sh: illegal option -- x', 'usage: logtool.sh [-l LEVEL] [-n N] FILE'], 2],
      [['-n'], '', ['scripts/logtool.sh: option requires an argument -- n', 'usage: logtool.sh [-l LEVEL] [-n N] FILE'], 2],
      [[], '', ['bash: 1: usage: logtool.sh [-l LEVEL] [-n N] FILE'], 1],
    ];
    for (const [args, out, err, code] of cases) {
      const got = SQ.sandbox(() => {
        SQ.S.cwd = '/home/explorer';
        const r = SQ.runScript('scripts/logtool.sh', { args, depth: 1, tty: false, force: true, record: false });
        return JSON.stringify({ out: r.out, err: r.err, code: r.code, tmp: Object.keys(SQ.getNode('/tmp').children) });
      });
      assert.deepEqual(JSON.parse(got), { out, err, code, tmp: [] }, args.join(' '));
    }
  });
  it('ctx.runScript and scriptPasses do not move the learner\'s world, counter or state', () => {
    const SQ = setup();
    run(SQ, 'cd logs; X=keep; readonly R=1');
    const before = JSON.stringify(SQ.S);
    const c = SQ.ctxFor('x');
    assert.deepEqual(JSON.parse(JSON.stringify(c.runScript('scripts/logtool.sh', ['-n', '1', 'logs/all.log']))), { out: '3 10.0.0.2', err: [], code: 0 });
    const m = { kind: 'challenge', file: 'scripts/logtool.sh', tests: [{ args: ['logs/all.log'], expectOut: '3 10.0.0.2\n2 10.0.0.1\n1 10.0.0.4' }, { args: ['-q', 'logs/all.log'], expectCode: 2, expectErrMatch: 'usage' }] };
    assert.deepEqual(JSON.parse(JSON.stringify(c.scriptPasses(m))), { ok: true });
    assert.equal(JSON.stringify(SQ.S), before);
    assert.equal(run(SQ, 'mktemp; echo $X; R=2').out, '/tmp/tmp.A00001\nkeep\n' + 'bash: R: readonly variable');
  });
});
