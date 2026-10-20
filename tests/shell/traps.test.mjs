// trap and signals (Stage 3 Task 14): CMDS.trap, SQ.rt.traps (per process scope), EXIT/ERR/DEBUG, SQ.signal / SQ.signalShell delivery.
// Expected texts were recorded with GNU bash 5.2.21 (`bash -c`, `bash s.sh`, timing measured with real sleeps) and are compared in this
// shell's forms: messages keep the typed-line `bash: ` prefix (bash -c prints `bash: line 1: trap: ...`), a handler's syntax error prints
// one line (bash adds a second line quoting the text) and tokens are quoted 'x' like every other syntax error here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const H = '/home/explorer/';
const put = (SQ, name, text) => SQ.writeFile(H + name, text, false, name);
const script = (SQ, text, args = '') => { put(SQ, 's.sh', text); return run(SQ, 'bash s.sh' + (args ? ' ' + args : '')); };
const STEP = 'this practice shell stopped the command: too many steps';
const NOTE = (n, st, cmd, m = '+') => `[${n}]${m}  ${st.padEnd(24)}${cmd}`;
const USAGE = 'trap: usage: trap [-lp] [[arg] signal_spec ...]';
const count = (s, sub) => s.split(sub).length - 1;

describe('EXIT runs on every way a script ends, exactly once', () => {
  it('end of the text: hi then bye (mission 19.5)', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; echo hi"`), { out: 'hi\nbye', code: 0 });
    assert.deepEqual(script(SQ, "trap 'echo bye' EXIT\necho hi\n"), { out: 'hi\nbye', code: 0 });
  });
  it('exit 3 keeps the status and $? is 3 inside the handler', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye \\$?' EXIT; exit 3"; echo $?`), { out: 'bye 3\n3', code: 0 });
  });
  it('an error under set -e', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "set -e; trap 'echo bye \\$?' EXIT; false; echo no"`), { out: 'bye 1', code: 1 });
    assert.deepEqual(script(SQ, 'set -euo pipefail\ntrap \'echo bye $?\' EXIT\nfalse | true\necho no\n'), { out: 'bye 1', code: 1 });
  });
  it('kill $$ (TERM from itself): the handler, then the parent prints Terminated, status 143', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye \\$?' EXIT; kill \\$\\$; echo after"`), { out: 'bye 0\nTerminated', code: 143 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; kill -HUP \\$\\$; echo after"`), { out: 'bye\nHangup', code: 129 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; kill -USR1 \\$\\$; echo after"`), { out: 'bye\nUser defined signal 1', code: 138 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; kill -INT \\$\\$; echo after"`), { out: 'bye', code: 130 }, 'bash prints nothing for SIGINT');
  });
  it('kill -9 $$ ends it without the handler', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; kill -9 \\$\\$; echo after"`), { out: 'Killed', code: 137 });
  });
  it('a signal death keeps 128+n even when the EXIT handler calls exit', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'exit 7' EXIT; kill \\$\\$"`), { out: 'Terminated', code: 143 });
  });
  it('a step-cap abort: the message first, then the handler', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; while :; do :; done"`), { out: `${STEP}\nbye`, code: 1 });
    assert.equal(run(SQ, 'echo next').out, 'next');
  });
  it('a runaway handler after a step-cap abort is bounded by its own small allowance', () => {
    const SQ = loadShell();
    const r = run(SQ, `bash -c "trap 'while :; do :; done' EXIT; while :; do :; done"`);
    assert.equal(r.out, `${STEP}\n${STEP}`);
    assert.equal(r.code, 1);
    assert.equal(run(SQ, 'echo next').out, 'next');
  });
  it('a runaway handler at a normal end is stopped by the step cap; the next line works', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'while :; do :; done' EXIT; echo hi"`), { out: STEP, code: 1 });
    assert.equal(run(SQ, 'echo next').out, 'next');
  });
  it('a handler may call exit n to change the status', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye; exit 7' EXIT; exit 3"`), { out: 'bye', code: 7 });
    assert.deepEqual(run(SQ, `bash -c "trap 'false' EXIT; exit 0"`), { out: '', code: 0 }, 'the handler\'s last status is not the shell\'s');
  });
  it('never twice: exit inside functions, nested functions, the handler itself, after errexit', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; f() { exit 1; }; f; echo no"`), { out: 'bye', code: 1 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; g() { exit 2; }; f() { g; echo no; }; f"`), { out: 'bye', code: 2 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye; f' EXIT; f() { exit 4; }; exit 1"`), { out: 'bye', code: 4 });
    assert.deepEqual(run(SQ, `bash -c "set -e; trap 'echo bye; false; echo more' EXIT; false"`), { out: 'bye', code: 1 }, 'set -e still holds inside the handler (bash)');
  });
  it('never twice: a subshell runs its own EXIT trap at its end, not the parent\'s', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; (exit 1); echo mid"`), { out: 'mid\nbye', code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; (trap 'echo sub' EXIT; exit 1); echo \\$?"`), { out: 'sub\n1\nbye', code: 0 });
    assert.deepEqual(run(SQ, `(trap 'echo sub' EXIT; echo in); echo out`), { out: 'in\nsub\nout', code: 0 });
    assert.deepEqual(run(SQ, `x=$(trap 'echo inner' EXIT; echo a); echo "[$x]"`), { out: '[a\ninner]', code: 0 });
    assert.deepEqual(run(SQ, `{ trap 'echo e' EXIT; echo a; } | cat; echo b`), { out: 'a\ne\nb', code: 0 });
  });
  it('never twice: a sourced file shares the caller\'s traps', () => {
    const SQ = loadShell();
    put(SQ, 'lib.sh', "trap 'echo from lib' EXIT\n");
    assert.deepEqual(run(SQ, 'bash -c ". ./lib.sh; echo main"'), { out: 'main\nfrom lib', code: 0 });
    put(SQ, 'ex.sh', 'exit 1\n');
    const r = run(SQ, `bash -c "trap 'echo bye' EXIT; . ./ex.sh; echo after"`);
    assert.equal(count(r.out, 'bye'), 1);
  });
  it('never twice: a job\'s EXIT trap runs once when it ends (exit 1 inside it)', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `{ trap 'echo jbye' EXIT; echo job; exit 1; } & wait $!; echo $?`), { out: `[1] 1235\njob\njbye\n1\n${NOTE(1, 'Exit 1', "{ trap 'echo jbye' EXIT; echo job; exit 1; }")}`, code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; { echo job; exit 1; } & wait; echo \\$?"`), { out: 'job\n0\nbye', code: 0 }, 'a job does not inherit the EXIT trap');
  });
  it('set -u and ${X:?} aborts run it too', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye \\$?' EXIT; set -u; echo \\$nope; echo no"`), { out: 'bash: nope: unbound variable\nbye 1', code: 1 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; echo \\\${x:?boom}; echo no"`), { out: 'bash: x: boom\nbye', code: 1 });
  });
  it('timeout: TERM ends the script, its EXIT handler runs, status 124; -s KILL skips it', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `timeout 2 bash -c "trap 'echo bye' EXIT; sleep 5; echo no"`), { out: 'bye', code: 124 });
    assert.deepEqual(run(SQ, `timeout 2 bash -c "trap 'echo term' TERM; trap 'echo bye' EXIT; sleep 5; echo no"`), { out: 'term\nbye', code: 124 });
    assert.deepEqual(run(SQ, `timeout -s KILL 2 bash -c "trap 'echo bye' EXIT; sleep 5"`), { out: '', code: 137 });
  });
  it('at a typed prompt an EXIT trap does nothing visible (the page never exits)', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, "trap 'echo bye' EXIT"), { out: '', code: 0 });
    assert.equal(run(SQ, 'echo hi').out, 'hi');
    assert.equal(run(SQ, 'exit').out, 'There is nowhere to exit to. Your progress saves automatically.');
    assert.equal(run(SQ, 'trap -p EXIT').out, "trap -- 'echo bye' EXIT");
  });
  it('the mktemp-style cleanup: trap rm EXIT leaves the directory empty on every path', () => {
    const SQ = loadShell();
    const S = "set -euo pipefail\nt=/tmp/work.$$\ntrap 'rm -f \"$t\"' EXIT\necho x > \"$t\"\ncase ${1:-ok} in\n  fail) false ;;\n  two) exit 2 ;;\nesac\necho done\n";
    for (const [arg, code] of [['ok', 0], ['fail', 1], ['two', 2]]) {
      SQ.mkdirp('/tmp');
      assert.equal(script(SQ, S, arg).code, code, arg);
      assert.ok(!SQ.getNode('/tmp/work.1234'), arg);
    }
  });
});

describe('ERR', () => {
  it('fires where set -e would exit, set -e on or off', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo err \\$?' ERR; false; echo after"`), { out: 'err 1\nafter', code: 0 });
    assert.deepEqual(run(SQ, `bash -c "set -e; trap 'echo err \\$?' ERR; false; echo after"`), { out: 'err 1', code: 1 });
  });
  it('the same suppression as set -e: conditions, && / || lists, !; a function body does not inherit it (no set -E)', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo err' ERR; false || true; if false; then :; fi; ! false; while false; do :; done; f() { false; }; f; echo after"`), { out: 'err\nafter', code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo err' ERR; f() { false; echo in; }; f; echo after"`), { out: 'in\nafter', code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo err' ERR; (false; echo insub); x=\\$(false); echo after"`), { out: 'insub\nerr\nafter', code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo err' ERR; false | true; true | false; { false; }; echo after"`), { out: 'err\nerr\nafter', code: 0 });
  });
  it('the handler may exit; otherwise $? is left as it was', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo err; exit 9' ERR; false; echo after"`), { out: 'err', code: 9 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo err \\$?; true' ERR; false; echo \\$?"`), { out: 'err 1\n1', code: 0 });
  });
  it('at the prompt too', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, "trap 'echo oops' ERR; ls nope; echo after"), { out: "ls: cannot access 'nope': No such file or directory\noops\nafter", code: 0 });
  });
});

describe('signals to the shell itself', () => {
  it('a trapped USR1: the handler runs at the next command boundary', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo got USR1' USR1; kill -USR1 \\$\\$; echo after"`), { out: 'got USR1\nafter', code: 0 });
    assert.deepEqual(run(SQ, "trap 'echo got USR1' USR1; kill -USR1 $$; echo after"), { out: 'got USR1\nafter', code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo in' USR1; f() { kill -USR1 \\$\\$; echo f-after; }; f; echo after"`), { out: 'in\nf-after\nafter', code: 0 });
  });
  it('a trapped TERM keeps the script alive; a handler may exit', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo e \\$?' EXIT; trap 'echo t' TERM; kill \\$\\$; echo after \\$?"`), { out: 't\nafter 0\ne 0', code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo t; exit 5' TERM; trap 'echo e \\$?' EXIT; kill \\$\\$; echo no"`), { out: 't\ne 5', code: 5 });
  });
  it('the handler leaves $? alone; its errors are reported each time it runs', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo \\$?; false' USR1; (exit 4); kill -USR1 \\$\\$; echo after \\$?"`), { out: '0\nafter 0', code: 0 });
  });
  it('a subshell\'s kill $$ reaches the script after the subshell ends', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo e' EXIT; (kill \\$\\$; echo sub); echo after"`), { out: 'sub\ne\nTerminated', code: 143 });
  });
  it('the interactive shell ignores TERM, INT and QUIT and never exits (kill -9 $$ does nothing)', () => {
    const SQ = loadShell();
    for (const l of ['kill $$', 'kill -INT $$', 'kill -9 $$', 'kill -HUP $$', 'kill -USR1 $$', 'kill -STOP $$']) assert.deepEqual(run(SQ, l), { out: '', code: 0 }, l);
    assert.equal(run(SQ, 'echo still here').out, 'still here');
  });
  it('a job signalling the interactive shell: the trap runs when the shell next gets control', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "trap 'echo got it' USR1; { sleep 1; kill -USR1 $$; } &").out, '[1] 1235');
    assert.equal(run(SQ, 'sleep 3; echo after').out, `got it\nafter\n${NOTE(1, 'Done', '{ sleep 1; kill -USR1 $$; }')}`);
  });
  it('wait is interrupted by a trapped signal: status 128+n, then the handler', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, `bash -c "trap 'echo usr' USR1; { sleep 1; kill -USR1 \\$\\$; } & wait; echo after \\$?"`).out, 'usr\nafter 138');
    assert.equal(SQ.rt.clock, 2, 'the wait ended at the kill time (1) plus the line');
  });
});

describe('signals to jobs', () => {
  it("trap '' TERM makes a job survive kill %1 (still Running) but not kill -9", () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "{ trap '' TERM; sleep 10; echo done; } &").out, '[1] 1235');
    assert.equal(run(SQ, 'kill %1; jobs').out, "[1]+  Running                 { trap '' TERM; sleep 10; echo done; } &");
    assert.equal(run(SQ, 'kill -9 %1').out, NOTE(1, 'Killed', "{ trap '' TERM; sleep 10; echo done; }"));
  });
  it('a job killed while sleeping runs its EXIT trap at the kill time', () => {
    const SQ = loadShell();
    run(SQ, "{ trap 'echo bye $?' EXIT; sleep 10; echo done; } &");
    assert.equal(run(SQ, 'kill %1; echo t=$SECONDS').out, `bye 0\nt=1\n${NOTE(1, 'Terminated', "{ trap 'echo bye $?' EXIT; sleep 10; echo done; }")}`);
    assert.equal(run(SQ, 'sleep 20').out, '', 'nothing more from the job');
  });
  it('a trapped TERM to a sleeping job: the handler runs when its sleep ends, then it goes on (bash defers it)', () => {
    const SQ = loadShell();
    run(SQ, "{ trap 'echo t at $SECONDS' TERM; sleep 4; echo done; } &");
    assert.equal(run(SQ, 'kill %1').out, '');
    assert.equal(run(SQ, 'jobs').out, "[1]+  Running                 { trap 'echo t at $SECONDS' TERM; sleep 4; echo done; } &");
    assert.equal(run(SQ, 'sleep 5').out, `t at 4\ndone\n${NOTE(1, 'Done', "{ trap 'echo t at $SECONDS' TERM; sleep 4; echo done; }")}`);
  });
  it('a trapped TERM handler that exits sets the job status', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "{ trap 'echo jt; exit 5' TERM; sleep 3; echo done; } & sleep 1; kill $!; wait $!; echo st $?").out, `[1] 1235\njt\nst 5\n${NOTE(1, 'Exit 5', "{ trap 'echo jt; exit 5' TERM; sleep 3; echo done; }")}`);
  });
  it('a job signalling itself ($BASHPID is the job\'s pid inside it)', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "{ echo $BASHPID; trap 'echo self' USR1; kill -USR1 $BASHPID; echo after; } & wait $!; echo $?").out, `[1] 1235\n1235\nself\nafter\n0\n${NOTE(1, 'Done', "{ echo $BASHPID; trap 'echo self' USR1; kill -USR1 $BASHPID; echo after; }")}`);
    assert.equal(run(SQ, "{ trap 'echo jb' EXIT; kill $BASHPID; echo no; } & wait $!; echo $?").out, `[1] 1236\njb\n143\n${NOTE(1, 'Terminated', "{ trap 'echo jb' EXIT; kill $BASHPID; echo no; }")}`);
    assert.equal(run(SQ, 'echo $BASHPID').out, '1234');
  });
  it('a job blocked in wait is interrupted by a trapped signal', () => {
    const SQ = loadShell();
    run(SQ, "{ trap 'echo intr' USR1; sleep 9 & wait; echo w=$?; } &");
    assert.equal(run(SQ, 'kill -USR1 %1; sleep 1').out, `intr\nw=138\n${NOTE(1, 'Done', "{ trap 'echo intr' USR1; sleep 9 & wait; echo w=$?; }")}`);
  });
  it('a job\'s step-cap stop: the message, then its EXIT handler', () => {
    const SQ = loadShell();
    const r = run(SQ, "{ trap 'echo jbye' EXIT; while :; do :; done; } &");
    assert.equal(r.out.split('\n').slice(0, 3).join('\n'), '[1] 1235\nthis practice shell stopped the job: too many steps\njbye');
  });
  it('a job does not inherit traps, only ignored signals', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "trap 'echo t' TERM; { sleep 5; echo no; } & kill %1").out, `[1] 1235\n${NOTE(1, 'Terminated', '{ sleep 5; echo no; }')}`);
    run(SQ, "trap - TERM; trap '' USR1; { sleep 5; echo yes; } &");
    assert.equal(run(SQ, 'kill -USR1 %1; sleep 6').out, `yes\n${NOTE(1, 'Done', '{ sleep 5; echo yes; }')}`);
  });
  it('fork bomb with traps: bounded, the next line works', () => {
    const SQ = loadShell();
    const r = run(SQ, ":(){ trap 'echo x' EXIT; :|:& };:");
    assert.ok(r.out.split('\n').length <= 2100);
    run(SQ, 'sleep 1');
    assert.equal(run(SQ, 'echo next').out.split('\n').includes('next'), true);
  });
});

describe('trap per process', () => {
  it('a function sees and may change the caller\'s traps', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "f() { trap 'echo fexit' EXIT; }; f; echo main"`), { out: 'main\nfexit', code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo it' EXIT; f() { trap -p EXIT; trap - EXIT; }; f; trap -p; echo end"`), { out: "trap -- 'echo it' EXIT\nend", code: 0 });
  });
  it('a sourced file shares them', () => {
    const SQ = loadShell();
    put(SQ, 'lib.sh', "trap 'echo usr' USR1\n");
    assert.deepEqual(run(SQ, `bash -c ". ./lib.sh; trap -p"`), { out: "trap -- 'echo usr' SIGUSR1", code: 0 });
  });
  it('a subshell inherits nothing but ignored signals (it shows the parent\'s until it changes one, as bash does)', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo it' EXIT; trap '' INT; (trap -p); echo ---; x=\\$(trap -p); echo \\"[\\$x]\\""`),
      { out: "trap -- 'echo it' EXIT\ntrap -- '' SIGINT\n---\n[trap -- 'echo it' EXIT\ntrap -- '' SIGINT]\nit", code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo it' EXIT; (trap 'echo y' INT; trap -p)"`), { out: "trap -- 'echo y' SIGINT\nit", code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap '' INT; (trap -p; trap - INT; trap -p)"`), { out: "trap -- '' SIGINT", code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo it' EXIT; (echo sub); echo main"`), { out: 'sub\nmain\nit', code: 0 });
  });
  it('a script starts with none but the ignored ones, which it cannot change', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "trap 'echo t' USR1; trap '' INT").out, '');
    assert.deepEqual(run(SQ, `bash -c "trap 'echo x' INT; trap -p"`), { out: "trap -- '' SIGINT", code: 0 });
    run(SQ, 'trap - INT USR1');
    assert.equal(run(SQ, 'trap').out, '');
  });
  it('Reset world and the sandbox clear them; a sandboxed run leaves the shell\'s alone', () => {
    const SQ = loadShell();
    run(SQ, "trap 'echo t' USR1");
    put(SQ, 'm.sh', "trap 'echo in' USR2\ntrap -p\n");
    const c = SQ.ctxFor('x');
    assert.equal(JSON.stringify(c.runScript('m.sh')), JSON.stringify({ out: "trap -- 'echo in' SIGUSR2", err: [], code: 0 }));
    assert.equal(SQ.sandbox(() => run(SQ, 'trap -p').out), '');
    assert.equal(run(SQ, 'trap -p').out, "trap -- 'echo t' SIGUSR1");
    SQ.resetProcs();
    assert.equal(run(SQ, 'trap -p').out, '');
    assert.equal(SQ.rt.traps, null);
  });
});

describe('the trap builtin', () => {
  it('trap -p, trap alone and the listing format', () => {
    const SQ = loadShell();
    run(SQ, "trap 'echo x' USR2 ERR DEBUG EXIT TERM 1");
    const L = "trap -- 'echo x' EXIT\ntrap -- 'echo x' SIGHUP\ntrap -- 'echo x' SIGUSR2\ntrap -- 'echo x' SIGTERM\ntrap -- 'echo x' DEBUG\ntrap -- 'echo x' ERR";
    assert.equal(run(SQ, "trap - DEBUG; trap 'echo x' DEBUG; trap -p").out, 'x\nx\n' + L, 'DEBUG runs before trap - DEBUG and before trap -p');
    assert.equal(run(SQ, 'trap - DEBUG; trap').out, 'x\n' + L.replace("\ntrap -- 'echo x' DEBUG", ''));
    assert.equal(run(SQ, 'trap - ERR; trap -p EXIT').out, "trap -- 'echo x' EXIT");
    assert.deepEqual(run(SQ, 'trap -p INT EXIT FOO EXIT; echo $?'), { out: "trap -- 'echo x' EXIT\nbash: trap: FOO: invalid signal specification\ntrap -- 'echo x' EXIT\n1", code: 0 });
  });
  it('quotes the handler with single quotes', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, `trap "echo it's" EXIT; trap -p EXIT`).out, "trap -- 'echo it'\\''s' EXIT");
    assert.equal(run(SQ, "trap -- '' INT; trap -p INT").out, "trap -- '' SIGINT");
    assert.equal(run(SQ, "trap -- -p HUP; trap -p HUP").out, "trap -- '-p' SIGHUP");
  });
  it('trap - SIG, trap SIG and trap N... reset; trap - EXIT removes it', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; trap - EXIT; echo hi"`), { out: 'hi', code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'echo bye' EXIT; trap EXIT; trap -p"`), { out: '', code: 0 });
    assert.deepEqual(run(SQ, "trap 'echo x' INT HUP; trap -- INT; trap 1 HUP; echo $?; trap -p"), { out: '0', code: 0 });
  });
  it('signal names with or without SIG, any case; numbers; 0 is EXIT; pseudo signals without SIG', () => {
    const SQ = loadShell();
    for (const [spec, name] of [['sigint', 'SIGINT'], ['int', 'SIGINT'], ['2', 'SIGINT'], ['SigTerm', 'SIGTERM'], ['1', 'SIGHUP'], ['3', 'SIGQUIT'], ['9', 'SIGKILL'], ['10', 'SIGUSR1'], ['12', 'SIGUSR2'], ['15', 'SIGTERM'], ['0', 'EXIT'], ['exit', 'EXIT'], ['Err', 'ERR']]) {
      assert.equal(run(SQ, `trap 'echo x' ${spec}; trap -p ${spec}; trap - ${spec}`).out, `trap -- 'echo x' ${name}`, spec);
    }
    for (const bad of ['SIGFOO', 'sigexit', 'SIGERR', '99', '-1']) {
      assert.deepEqual(run(SQ, `trap -- 'echo x' ${bad}; echo $?`), { out: `bash: trap: ${bad}: invalid signal specification\n1`, code: 0 }, bad);
    }
  });
  it('usage errors', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'trap -z; echo $?'), { out: `bash: trap: -z: invalid option\n${USAGE}\n2`, code: 0 });
    assert.deepEqual(run(SQ, "trap 'x'; echo $?"), { out: `${USAGE}\n2`, code: 0 });
    assert.deepEqual(run(SQ, "trap ''; echo $?"), { out: `${USAGE}\n2`, code: 0 });
    assert.deepEqual(run(SQ, 'trap -; echo $?'), { out: `${USAGE}\n2`, code: 0 });
  });
  it('trap -l and kill -l list the signals (HUP INT QUIT KILL USR1 USR2 TERM CHLD among them)', () => {
    const SQ = loadShell();
    const t = run(SQ, 'trap -l').out;
    assert.equal(t, run(SQ, 'kill -l').out);
    for (const n of ['1) SIGHUP', '2) SIGINT', '3) SIGQUIT', '9) SIGKILL', '10) SIGUSR1', '12) SIGUSR2', '15) SIGTERM', '17) SIGCHLD']) assert.ok(t.includes(n), n);
    assert.equal(run(SQ, 'trap -lp').out, t);
    assert.equal(run(SQ, 'trap -l INT').out, t);
  });
  it('KILL and STOP: accepted and listed, with no effect', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, "trap 'echo k' KILL STOP; echo $?; trap -p"), { out: "0\ntrap -- 'echo k' SIGKILL\ntrap -- 'echo k' SIGSTOP", code: 0 });
    run(SQ, "trap - KILL STOP; { trap '' KILL; sleep 9; } &");
    assert.equal(run(SQ, 'kill -9 %1').out, NOTE(1, 'Killed', "{ trap '' KILL; sleep 9; }"));
  });
  it('a handler\'s syntax error is reported once, when it runs', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, `bash -c "trap 'if then' EXIT; echo hi"`), { out: "hi\nbash: exit trap: line 1: syntax error near unexpected token 'then'", code: 0 });
    assert.deepEqual(run(SQ, `bash -c "trap 'if then' ERR; false; echo after \\$?"`), { out: "bash: error trap: line 1: syntax error near unexpected token 'then'\nafter 1", code: 0 });
    assert.deepEqual(run(SQ, "trap 'if then' USR1; kill -USR1 $$; kill -USR1 $$; echo after $?"), { out: "bash: trap: line 1: syntax error near unexpected token 'then'\nbash: trap: line 1: syntax error near unexpected token 'then'\nafter 0", code: 0 });
  });
  it('RETURN is not supported; DEBUG runs before each simple command (not inside functions)', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, "trap 'echo r' RETURN"), { out: 'this practice shell does not support trap RETURN yet', code: 2 });
    assert.equal(run(SQ, 'trap -p RETURN; trap - RETURN; echo $?').out, '0');
    assert.deepEqual(run(SQ, `bash -c "trap 'echo d' DEBUG; f() { echo inf; }; f; x=1; echo a > /dev/null; (echo sub)"`), { out: 'd\ninf\nd\nd\nsub', code: 0 });
    assert.equal(run(SQ, `bash -c "trap -p DEBUG; trap 'echo x' DEBUG; trap -p DEBUG"`).out, "x\ntrap -- 'echo x' DEBUG");
    assert.deepEqual(run(SQ, `bash -c "trap 'exit 3' DEBUG; echo a; echo b"; echo $?`), { out: '3', code: 0 }, 'exit in DEBUG ends the shell before the command');
  });
  it('kill 0 and negative pids name no process here (a safe choice; bash signals the process group)', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'kill 0'), { out: 'bash: kill: (0) - No such process', code: 1 });
    assert.deepEqual(run(SQ, 'kill -9 -1'), { out: 'bash: kill: (-1) - No such process', code: 1 });
  });
});
