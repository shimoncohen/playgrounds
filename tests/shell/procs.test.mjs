// Virtual clock, process table, sleep, ps, timeout, virtual date (Stage 3 Task 11).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const TRY_SLEEP = "Try 'sleep --help' for more information.";
const TRY_TIMEOUT = "Try 'timeout --help' for more information.";

describe('virtual clock and $SECONDS', () => {
  it('starts at 0; each outermost line costs one second at its end', () => {
    const SQ = loadShell();
    assert.equal(SQ.rt.clock, 0);
    assert.equal(run(SQ, 'echo $SECONDS').out, '0');
    assert.equal(SQ.rt.clock, 1);
    assert.equal(run(SQ, 'echo $SECONDS').out, '1');
  });
  it('sleep 2; echo $SECONDS prints 2 inside the line, the next line sees 3', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'sleep 2; echo $SECONDS'), { out: '2', code: 0 });
    assert.equal(run(SQ, 'echo $SECONDS').out, '3');
  });
  it('a failing or stopped line still costs its second; $( ) does not cost one of its own', () => {
    const SQ = loadShell();
    run(SQ, 'nosuch_zz');
    run(SQ, 'echo (');
    run(SQ, 'x=$(echo a); y=$(echo b)');
    assert.equal(SQ.rt.clock, 3);
  });
  it('SQ.advance moves the clock and returns Out[]; SQ.newPid hands out 1235, 1236, ...', () => {
    const SQ = loadShell();
    assert.deepEqual(Array.from(SQ.advance(2.5, {})), []);
    assert.equal(SQ.rt.clock, 2.5);
    assert.equal(SQ.newPid(), 1235);
    assert.equal(SQ.newPid(), 1236);
    assert.equal(SQ.rt.procs[0].pid, 1234);
    assert.equal(SQ.rt.procs[0].cmd, 'bash');
  });
  it('$SECONDS is a whole number; SECONDS=N restarts the count from N', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'sleep 0.5; echo $SECONDS').out, '0');
    assert.equal(run(SQ, 'SECONDS=7; echo $SECONDS').out, '7');
    assert.equal(run(SQ, 'echo $SECONDS').out, '8');
    assert.equal(run(SQ, 'SECONDS=0; sleep 3; echo $SECONDS').out, '3');
    assert.equal(run(SQ, '(( SECONDS = 100 )); sleep 2; echo $SECONDS').out, '102');
  });
});

describe('special pids', () => {
  it('$$ is 1234 at top level, in functions and in subshells; $BASHPID is 1234 always; $PPID is 1233', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo $$').out, '1234');
    assert.equal(run(SQ, 'f() { echo $$; }; f').out, '1234');
    assert.equal(run(SQ, '(echo $$ $BASHPID)').out, '1234 1234');
    assert.equal(run(SQ, 'echo $BASHPID').out, '1234');
    assert.equal(run(SQ, 'echo $PPID').out, '1233');
    assert.equal(run(SQ, 'echo $(echo $BASHPID)').out, '1234');
  });
});

describe('sleep', () => {
  it('advances the clock by its argument; fractions and suffixes; several arguments add up', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'sleep 0.5'), { out: '', code: 0 });
    assert.equal(SQ.rt.clock, 1.5);
    run(SQ, 'sleep 1s 1m');
    assert.equal(SQ.rt.clock, 1.5 + 61 + 1);
    const B = loadShell();
    run(B, 'sleep 0.1; sleep 0.2');
    assert.equal(B.rt.clock, 1.3);
    run(B, 'sleep .5h');
    assert.equal(B.rt.clock, 1.3 + 1800 + 1);
    const C = loadShell();
    run(C, 'sleep 0');
    assert.equal(C.rt.clock, 1);
  });
  it('errors use GNU wording', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'sleep abc'), { out: `sleep: invalid time interval 'abc'\n${TRY_SLEEP}`, code: 1 });
    assert.deepEqual(run(SQ, 'sleep'), { out: `sleep: missing operand\n${TRY_SLEEP}`, code: 1 });
    assert.deepEqual(run(SQ, 'sleep 1x'), { out: `sleep: invalid time interval '1x'\n${TRY_SLEEP}`, code: 1 });
    assert.deepEqual(run(SQ, 'sleep -5'), { out: `sleep: invalid option -- '5'\n${TRY_SLEEP}`, code: 1 });
    assert.equal(SQ.rt.clock, 4, 'a refused sleep costs nothing beyond its line');
  });
  it('sleep 99999999 stops at once, the clock moves at most LIM.SLEEP, the next line works', () => {
    const SQ = loadShell();
    assert.equal(SQ.LIM.SLEEP, 3600);
    const r = run(SQ, 'echo before; sleep 99999999; echo after');
    assert.deepEqual(r, { out: 'this practice shell stopped the command: that sleep is too long', code: 1 });
    assert.ok(SQ.rt.clock <= 3600 + 1);
    assert.deepEqual(run(SQ, 'echo next'), { out: 'next', code: 0 });
    const B = loadShell();
    assert.match(run(B, 'sleep 3601').out, /that sleep is too long/);
    assert.match(run(B, 'sleep 3000 601').out, /that sleep is too long/);
    assert.match(run(B, 'sleep inf').out, /that sleep is too long/);
    assert.deepEqual(run(B, 'sleep 3600'), { out: '', code: 0 });
  });
});

describe('date', () => {
  it('prints the fixed epoch plus the clock in the old format', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'date').out, 'Thu Jan 15 09:00:00 2026');
    run(SQ, 'sleep 59');
    assert.equal(run(SQ, 'date').out, 'Thu Jan 15 09:01:01 2026');
    assert.equal(run(SQ, 'date | wc -w').out, '5');
    assert.equal(run(SQ, 'echo "Today is $(date)"').out, 'Today is Thu Jan 15 09:01:03 2026');
  });
  it('+FORMAT supported subset', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'date +%s').out, '1768467600');
    assert.equal(run(SQ, 'date +%H:%M:%S').out, '09:00:01');
    assert.equal(run(SQ, 'date +%Y-%m-%d').out, '2026-01-15');
    assert.equal(run(SQ, 'date "+%F %T"').out, '2026-01-15 09:00:03');
    assert.equal(run(SQ, 'date "+%A %a %B %b %d %e %y %j %u %w"').out, 'Thursday Thu January Jan 15 15 26 015 4 4');
    assert.equal(run(SQ, 'date "+%I %p %Z %z %D %R %%"').out, '09 AM UTC +0000 01/15/26 09:00 %');
    assert.equal(run(SQ, 'date +%Q').out, '%Q');
    assert.equal(run(SQ, 'date +%Y | wc -c').out, '5');
    assert.equal(run(SQ, 'date -u +%H').out, '09');
  });
  it('day rollover', () => {
    const SQ = loadShell();
    run(SQ, 'for i in $(seq 1 15); do sleep 3600; done');
    assert.equal(run(SQ, 'date').out, 'Fri Jan 16 00:00:01 2026');
  });
  it('unsupported options and operands', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'date -d tomorrow'), { out: 'this practice shell does not support date -d yet', code: 1 });
    assert.deepEqual(run(SQ, 'date foo'), { out: "date: invalid date 'foo'", code: 1 });
  });
});

describe('ps', () => {
  it('lists bash and itself; each ps run takes the next pid', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'ps'), { out: '  PID TTY          TIME CMD\n 1234 pts/0    00:00:00 bash\n 1235 pts/0    00:00:00 ps', code: 0 });
    assert.equal(run(SQ, 'ps').out.split('\n')[2], ' 1236 pts/0    00:00:00 ps');
  });
  it('ps aux and ps -ef print the richer headers and the same rows', () => {
    const SQ = loadShell();
    run(SQ, 'sleep 120');
    assert.equal(run(SQ, 'ps aux').out,
      'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n' +
      'explorer  1234  0.0  0.1   8960  5120 pts/0    Ss   09:00   0:00 bash\n' +
      'explorer  1235  0.0  0.0  10072  3328 pts/0    R+   09:02   0:00 ps aux');
    assert.equal(run(SQ, 'ps -ef').out,
      'UID        PID  PPID  C STIME TTY          TIME CMD\n' +
      'explorer  1234  1233  0 09:00 pts/0    00:00:00 bash\n' +
      'explorer  1236  1234  0 09:02 pts/0    00:00:00 ps -ef');
    assert.equal(run(SQ, 'ps ax').out, '  PID TTY      STAT   TIME COMMAND\n 1234 pts/0    Ss     0:00 bash\n 1237 pts/0    R+     0:00 ps ax');
    assert.equal(run(SQ, 'ps -e').out.split('\n')[0], '  PID TTY          TIME CMD');
  });
  it('ps in a pipeline and an unsupported option', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'ps | wc -l').out, '3');
    assert.deepEqual(run(SQ, 'ps --forest'), { out: 'this practice shell does not support ps --forest yet', code: 1 });
  });
  it('the 200-process cap: the 201st process cannot start, state stays sane', () => {
    const SQ = loadShell();
    for (let i = 0; i < 199; i++) SQ.newPid();
    assert.equal(run(SQ, 'ps').out.split('\n').pop(), ' 1434 pts/0    00:00:00 ps');
    assert.deepEqual(run(SQ, 'ps'), { out: 'bash: fork: retry: Resource temporarily unavailable', code: 1 });
    assert.throws(() => SQ.newPid(), /fork: retry: Resource temporarily unavailable/);
    assert.deepEqual(run(SQ, 'echo still here'), { out: 'still here', code: 0 });
  });
});

describe('timeout', () => {
  it('timeout 2 sleep 5: status 124 after exactly 2 seconds', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'timeout 2 sleep 5; echo $? $SECONDS'), { out: '124 2', code: 0 });
    assert.equal(SQ.rt.clock, 3);
  });
  it('a command that finishes first keeps its own output and status', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'timeout 5 echo hi'), { out: 'hi', code: 0 });
    assert.deepEqual(run(SQ, 'timeout 5 sleep 1; echo $? $SECONDS'), { out: '0 2', code: 0 });
    assert.deepEqual(run(SQ, 'timeout 5 false; echo $?'), { out: '1', code: 0 });
    assert.deepEqual(run(SQ, 'timeout 5 ls nosuch; echo $?'), { out: "ls: cannot access 'nosuch': No such file or directory\n2", code: 0 });
  });
  it('a script that sleeps past the deadline stops there', () => {
    const SQ = loadShell();
    run(SQ, 'printf "sleep 1\\nsleep 1\\nsleep 1\\necho never > done.txt\\n" > s.sh; chmod +x s.sh');
    assert.deepEqual(run(SQ, 't=$SECONDS; timeout 2.5 ./s.sh; echo $? $((SECONDS - t))'), { out: '124 2', code: 0 });
    assert.equal(SQ.rt.clock, 1 + 2.5 + 1);
    assert.match(run(SQ, 'cat done.txt').out, /No such file/);
    assert.deepEqual(run(SQ, 'timeout 5 ./s.sh; echo $?'), { out: '0', code: 0 });
  });
  it('nested timeouts: the earliest deadline wins and its timeout reports', () => {
    const SQ = loadShell();
    run(SQ, 'printf "timeout 10 sleep 20\\necho inner=\\$?\\n" > n.sh; chmod +x n.sh');
    assert.deepEqual(run(SQ, 'timeout 3 ./n.sh; echo outer=$?'), { out: 'outer=124', code: 0 });
    run(SQ, 'printf "timeout 1 sleep 20\\necho inner=\\$?\\n" > m.sh; chmod +x m.sh');
    assert.deepEqual(run(SQ, 'timeout 3 ./m.sh; echo outer=$?'), { out: 'inner=124\nouter=0', code: 0 });
  });
  it('options: -s KILL gives 137, --preserve-status gives 143, -k and -v', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'timeout -s KILL 1 sleep 5; echo $?').out, '137');
    assert.equal(run(SQ, 'timeout -s 9 1 sleep 5; echo $?').out, '137');
    assert.equal(run(SQ, 'timeout --preserve-status 1 sleep 5; echo $?').out, '143');
    assert.equal(run(SQ, 'timeout -k 5 1 sleep 5; echo $?').out, '124');
    assert.equal(run(SQ, 'timeout -v 1 sleep 5; echo $?').out, "timeout: sending signal TERM to command 'sleep'\n124");
    assert.equal(run(SQ, 'timeout 0 sleep 5; echo $?').out, '0');
    assert.equal(run(SQ, 'timeout 1 sleep 99999999; echo $?').out, '124', 'the deadline comes first: no "too long" stop');
  });
  it('usage errors are status 125, a missing command 127, a shell builtin cannot be run', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'timeout'), { out: `timeout: missing operand\n${TRY_TIMEOUT}`, code: 125 });
    assert.deepEqual(run(SQ, 'timeout 5'), { out: `timeout: missing operand\n${TRY_TIMEOUT}`, code: 125 });
    assert.deepEqual(run(SQ, 'timeout abc sleep 1'), { out: `timeout: invalid time interval 'abc'\n${TRY_TIMEOUT}`, code: 125 });
    assert.deepEqual(run(SQ, 'timeout -s FOO 1 sleep 1'), { out: `timeout: FOO: invalid signal\n${TRY_TIMEOUT}`, code: 125 });
    assert.deepEqual(run(SQ, 'timeout -x 1 sleep 1'), { out: `timeout: invalid option -- 'x'\n${TRY_TIMEOUT}`, code: 125 });
    assert.deepEqual(run(SQ, 'timeout 1 nosuch_zz'), { out: "timeout: failed to run command 'nosuch_zz': No such file or directory", code: 127 });
    assert.deepEqual(run(SQ, 'f() { echo x; }; timeout 1 f'), { out: "timeout: failed to run command 'f': No such file or directory", code: 127 });
    assert.deepEqual(run(SQ, 'timeout 1 cd /'), { out: "timeout: failed to run command 'cd': No such file or directory", code: 127 });
  });
  it('a busy loop under timeout is stopped by the step cap, not by time', () => {
    const SQ = loadShell();
    run(SQ, 'printf "while true; do :; done\\n" > spin.sh; chmod +x spin.sh');
    assert.match(run(SQ, 'timeout 1 ./spin.sh').out, /this practice shell stopped the command: too many steps/);
    assert.deepEqual(run(SQ, 'echo ok'), { out: 'ok', code: 0 });
  });
});

describe('runtime state', () => {
  it('the sandbox runs with a clean clock and pid counter and restores both', () => {
    const SQ = loadShell();
    run(SQ, 'sleep 10; ps');
    const before = { clock: SQ.rt.clock, procs: JSON.stringify(SQ.rt.procs) };
    const inside = SQ.sandbox(() => {
      const c0 = SQ.rt.clock;
      const r = run(SQ, 'sleep 5; ps | tail -n 1');
      return { c0, out: r.out, c1: SQ.rt.clock };
    });
    assert.deepEqual(inside, { c0: 0, out: ' 1235 pts/0    00:00:00 ps', c1: 6 });
    assert.equal(SQ.rt.clock, before.clock);
    assert.equal(JSON.stringify(SQ.rt.procs), before.procs);
    assert.equal(run(SQ, 'ps | tail -n 1').out, ' 1236 pts/0    00:00:00 ps');
  });
  it('the sandbox restores the clock when fn throws', () => {
    const SQ = loadShell();
    run(SQ, 'sleep 3');
    assert.throws(() => SQ.sandbox(() => { SQ.advance(100, {}); throw new Error('x'); }));
    assert.equal(SQ.rt.clock, 4);
  });
  it('SQ.resetProcs puts the clock to 0 and the pid counter back; nothing is saved', () => {
    const SQ = loadShell();
    run(SQ, 'sleep 3; ps');
    SQ.resetProcs();
    assert.equal(SQ.rt.clock, 0);
    assert.equal(SQ.newPid(), 1235);
    assert.ok(!('clock' in SQ.S) && !('procs' in SQ.S));
  });
});
