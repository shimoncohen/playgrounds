// Background jobs, scheduler core (Stage 3 Task 12a): `&`, SQ.spawn, SQ.gen.run, SQ.tick, the 16-job and 200-process caps.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run as runN } from './harness.mjs';

/* The Task 12a suites below pin the scheduler; Task 12b's job notices ([1]+  Done ...) that now close a typed line are pinned in the 12b
   suites at the end of this file (runN keeps them), so here run() leaves them out. */
const NOTICE = /^\[\d+\][+\- ]  (Done|Exit \d+|Terminated|Killed|Stopped)\b/;
const run = (SQ, line) => { const r = runN(SQ, line); return { out: r.out.split('\n').filter((l) => !NOTICE.test(l)).join('\n'), code: r.code }; };

const FORK = 'bash: fork: retry: Resource temporarily unavailable';
const STOPPED = 'this practice shell stopped the job: too many steps';
const live = (SQ) => SQ.rt.jobs.filter((j) => j.state === 'Running');

describe('& parses as a list separator', () => {
  it('a trailing or separating & gives sep "&"; && |& >& &> keep their meaning', () => {
    const SQ = loadShell();
    const p = SQ.parseProgram('a & b');
    assert.equal(p.items.length, 2);
    assert.equal(p.items[0].sep, '&');
    assert.equal(p.items[0].andor.src, 'a');
    assert.equal(SQ.parseProgram('a && b &').items[0].sep, '&');
    assert.equal(SQ.parseProgram('a && b &').items[0].andor.rest.length, 1);
    assert.equal(SQ.parseProgram('{ a & }').items[0].andor.first.cmds[0].body.items[0].sep, '&');
    assert.equal(SQ.parseProgram('a &\nb').items.length, 2);
    assert.throws(() => SQ.parseProgram('a & ; b'), /near unexpected token ';'/);
    assert.throws(() => SQ.parseProgram('& a'), /near unexpected token '&'/);
    assert.throws(() => SQ.parseProgram('a | & b'), /near unexpected token '&'/);
    assert.throws(() => SQ.parseProgram('echo a |& cat'), /does not support \|& yet/);
    assert.throws(() => SQ.parseProgram('echo a &> f'), /does not support &> yet/);
  });
  it(': is a function name (the classic fork bomb parses)', () => {
    const SQ = loadShell();
    const p = SQ.parseProgram(':(){ :|:& };:');
    assert.equal(p.items[0].andor.first.cmds[0].type, 'func');
    assert.equal(p.items[0].andor.first.cmds[0].name, ':');
  });
});

describe('spawning and the scheduler', () => {
  it('sleep 3 & echo started prints [1] 1235 then started', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, 'sleep 3 & echo started'), { out: '[1] 1235\nstarted', code: 0 });
    assert.equal(SQ.rt.jobs.length, 1);
    const J = SQ.rt.jobs[0];
    assert.equal(J.id, 1);
    assert.equal(J.pid, 1235);
    assert.equal(J.cmd, 'sleep 3');
    assert.equal(J.state, 'Running');
    assert.equal(J.wake, 3);
  });
  it('$? after & is 0; the job number counts up while jobs remain (Task 12b: and starts at [1] again once they are reaped)', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'false & echo $?').out, '[1] 1235\n0');
    assert.equal(run(SQ, 'sleep 9 &').out, '[1] 1236', 'the false job ended and its notice was shown');
    assert.equal(run(SQ, 'sleep 9 &').out, '[2] 1237');
  });
  it('(sleep 2; echo hi) & shows hi after the second following line and not before', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, '(sleep 2; echo hi) &').out, '[1] 1235');
    assert.equal(run(SQ, 'echo a').out, 'a');
    assert.equal(run(SQ, 'echo b').out, 'b\nhi');
    assert.equal(run(SQ, 'echo c').out, 'c');
  });
  it('a for loop job prints one number per virtual second while other lines are typed', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'for i in 1 2 3; do sleep 1; echo $i; done &').out, '[1] 1235');
    const J = SQ.rt.jobs[0];
    assert.equal(run(SQ, 'echo x').out, 'x\n1');
    assert.equal(run(SQ, 'echo y').out, 'y\n2');
    assert.equal(run(SQ, 'echo z').out, 'z\n3');
    assert.equal(run(SQ, 'echo w').out, 'w');
    assert.equal(J.state, 'Done');
  });
  it('a foreground sleep lets the job run: its output appears at that point in the line', () => {
    const SQ = loadShell();
    run(SQ, 'for i in 1 2 3; do sleep 1; echo $i; done &');
    assert.equal(run(SQ, 'echo before; sleep 5; echo after').out, 'before\n1\n2\n3\nafter');
    assert.equal(SQ.rt.clock, 7);
  });
  it('two jobs interleave by wake time, then by job number', () => {
    const SQ = loadShell();
    run(SQ, '(sleep 2; echo a) & (sleep 1; echo b; sleep 2; echo c) &');
    assert.equal(run(SQ, 'sleep 5').out, 'b\na\nc');
    const S2 = loadShell();
    run(S2, '(sleep 1; echo one) & (sleep 1; echo two) & (sleep 1; echo three) &');
    assert.equal(run(S2, 'sleep 3').out, 'one\ntwo\nthree');
  });
  it('a job runs lazily: echo a & echo b prints b, then a when the line ends', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo a & echo b').out, '[1] 1235\nb\na');
  });
  it("a job's variables and directory do not leak into the shell", () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'x=1; x=2 & sleep 1; echo $x').out, '[1] 1235\n1');
    assert.equal(run(SQ, 'cd forest & sleep 1; pwd').out, '[1] 1236\n/home/explorer');
    assert.equal(run(SQ, 'y=5; (echo $y; y=6) & sleep 1; echo $y').out, '[1] 1237\n5\n5');
    assert.equal(run(SQ, '(z=1; sleep 1; echo z=$z) & z=9; sleep 2').out, '[1] 1238\nz=1');
    assert.equal(run(SQ, 'g() { echo g; }; (unset -f g; h() { :; }) & sleep 1; type g >/dev/null && echo still; type h 2>/dev/null || echo noh').out, '[1] 1239\nstill\nnoh');
  });
  it('positional parameters and shift inside a job do not reach the shell', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'f() { (shift; echo in $1) & sleep 1; echo out $1; }; f a b').out, '[1] 1235\nin b\nout a');
  });
  it('a job writes a file at its own virtual time', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, '(sleep 3; echo a > f) & cat f').out, '[1] 1235\ncat: f: No such file or directory');
    assert.equal(run(SQ, 'cat f').out, 'cat: f: No such file or directory');
    assert.equal(run(SQ, 'sleep 4; cat f').out, 'a');
  });
  it('a job may call a function (a sleep inside it yields) and run sourced code', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'greet() { echo hi $1; }; greet ada & sleep 1').out, '[1] 1235\nhi ada');
    assert.equal(run(SQ, 'g() { sleep 1; echo in-g; }; g & echo now').out, '[1] 1236\nnow');
    assert.equal(run(SQ, 'echo next').out, 'next\nin-g');
    run(SQ, "echo 'echo from lib' > lib.sh");
    assert.equal(run(SQ, 'source lib.sh & sleep 1').out, '[1] 1237\nfrom lib');
    run(SQ, "echo 'lf() { echo lf $1; }' > l2.sh");
    assert.equal(run(SQ, '. l2.sh; lf x & sleep 1').out, '[1] 1238\nlf x');
    assert.equal(run(SQ, 'r() { return 4; }; (r; echo st=$?) & sleep 1').out, '[1] 1239\nst=4');
  });
  it('control flow inside a job: if, while, until, case, groups, break, &&/||', () => {
    const SQ = loadShell();
    const line = 'n=0; { while [ $n -lt 5 ]; do n=$((n+1)); sleep 1; case $n in 2) continue;; 4) break;; esac; if [ $n -eq 3 ]; then echo three; else echo n$n; fi; done; until true; do :; done; false || echo or; true && echo and; } &';
    assert.equal(run(SQ, line).out, '[1] 1235');
    assert.equal(run(SQ, 'sleep 10').out, 'n1\nthree\nor\nand');
    assert.equal(run(SQ, 'echo $n').out, '0');
  });
  it('exit status of a job is kept in its record; exit ends the job', () => {
    const SQ = loadShell();
    run(SQ, '(sleep 1; exit 3) & { exit 4; echo no; } & a=$(jobs -p); for j in $(jobs -p); do eval "J$j=1"; done; sleep 2');
    const [A, B] = SQ.rt.reaped.slice(-2);
    assert.deepEqual([A.pid, A.code, B.pid, B.code], [1235, 3, 1236, 4], 'the records went with the notices; the statuses stay for wait PID');
  });
  it('a finished job keeps its record (state Done) until its Done notice is shown (Task 12b: at the end of the line that ended it)', () => {
    const SQ = loadShell();
    run(SQ, 'sleep 1 &');
    const J = SQ.rt.jobs[0];
    assert.equal(J.state, 'Running');
    SQ.advance(1);
    assert.equal(J.state, 'Done');
    assert.equal(J.code, 0);
    assert.ok(SQ.rt.notices.includes(J) && SQ.rt.jobs.includes(J), 'ended inside a line: kept until the line ends');
    assert.equal(runN(SQ, 'echo b').out, 'b\n[1]+  Done                    sleep 1');
    assert.ok(!SQ.rt.jobs.includes(J) && !SQ.rt.notices.length);
  });
  it('job output reaches the screen even when the foreground command is redirected', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, '(sleep 1; echo bg) & sleep 2 > f; cat f').out, '[1] 1235\nbg');
    assert.equal(run(SQ, '(sleep 1; echo bg2) & { sleep 2; } > g; cat g').out, '[1] 1236\nbg2');
  });
  it('a job spawned in a script, a subshell or a $( ) prints no [N] PID notice', () => {
    const SQ = loadShell();
    run(SQ, "printf 'sleep 1 &\\necho s\\n' > s.sh");
    assert.equal(run(SQ, 'bash s.sh').out, 's');
    assert.equal(run(SQ, '(echo in &); echo out').out, 'out\nin');
    assert.equal(run(SQ, 'x=$(echo inner & echo outer); echo $x').out, 'outer\ninner');
  });
  it('ps lists a running job and forgets it when it ends', () => {
    const SQ = loadShell();
    const o = run(SQ, 'sleep 30 & ps').out;
    assert.match(o, / 1235 pts\/0    00:00:00 sleep\n/);
    run(SQ, 'sleep 40');
    assert.doesNotMatch(run(SQ, 'ps').out, /sleep/);
  });
  it('a sleep inside a pipeline or timeout in a job costs the job its time', () => {
    const SQ = loadShell();
    run(SQ, '(sleep 2 | cat; echo piped) & (timeout 1 sleep 5; echo st=$?) &');
    assert.equal(run(SQ, 'echo a').out, 'a\nst=124');
    assert.equal(run(SQ, 'echo b').out, 'b\npiped');
  });
  it('a long sleep in a job is allowed (it only waits); the clock does not move', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'sleep 99999999 &').out, '[1] 1235');
    assert.equal(run(SQ, 'sleep infinity &').out, '[2] 1236');
    assert.equal(SQ.rt.clock, 2);
    assert.equal(live(SQ).length, 2);
  });
});

describe('runaway jobs and caps', () => {
  it('while :; do :; done & is stopped by the step cap and does not hang the line', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'while :; do :; done &').out, `[1] 1235\n${STOPPED}`);
    assert.deepEqual(Array.from(SQ.rt.reaped, (x) => [x.pid, x.code]), [[1235, 143]]);
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
  it('while :; do sleep 0; done & is stopped too; the foreground line keeps going', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'x=1; while :; do sleep 0; done & sleep 1; echo after $x').out, `[1] 1235\n${STOPPED}\nafter 1`);
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
  it('jobs have their own step budget: busy jobs never stop the foreground line; a stopped job does not starve the others', () => {
    const SQ = loadShell();
    const jobs = [], spawn = SQ.spawn;
    SQ.spawn = (...a) => { const J = spawn(...a); jobs.push(J); return J; };
    assert.equal(run(SQ, 'while true; do sleep 1; done & while :; do :; done & for i in 1 2 3; do sleep 1; echo $i; done &').out, `[1] 1235\n[2] 1236\n[3] 1237\n${STOPPED}`);
    const o = run(SQ, 'for i in $(seq 10); do sleep 3600; done; echo fg-done').out.split('\n');
    assert.deepEqual(o, ['1', '2', '3', STOPPED, 'fg-done']);
    assert.deepEqual(Array.from(jobs, (j) => j.state), ['Terminated', 'Terminated', 'Done']);
  });
  it('a stopped line keeps the job output it already showed, capped at LIM.LINES', () => {
    const SQ = loadShell();
    run(SQ, '(sleep 1; echo early) &');
    assert.equal(run(SQ, 'sleep 2; while :; do :; done').out, 'early\nthis practice shell stopped the command: too many steps');
    const r = run(SQ, 'r() { r & r; }; r');
    assert.ok(r.out.split('\n').length <= SQ.LIM.LINES + 1);
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
  it('total job work per typed line is bounded (never refunded): one-line spawners of runaway jobs', () => {
    for (const line of ['(while :; do (while :; do :; done) & sleep 0.001; done) &', 'b(){ while :; do :; done; }; s(){ while :; do b & sleep 0.001; done; }; s &']) {
      const SQ = loadShell();
      for (let k = 0; k < 2; k++) {
        const t0 = performance.now();
        run(SQ, k ? 'echo next' : line);
        const ms = performance.now() - t0;
        assert.ok(SQ.rt.jobWork <= SQ.JOB_WORK, `${line}: job work ${SQ.rt.jobWork} > ${SQ.JOB_WORK}`);
        assert.ok(ms < 1500, `${line}: ${ms.toFixed(0)} ms`);
      }
      assert.equal(run(SQ, 'echo ok').out.split('\n')[0], 'ok');
    }
  });
  it('16 busy jobs in one line stay within the job-work bound; the rest wait for the next line', () => {
    const SQ = loadShell();
    const t0 = performance.now();
    run(SQ, 'for i in $(seq 16); do (while :; do sleep 0.0001; done) & done');
    assert.ok(SQ.rt.jobWork <= SQ.JOB_WORK, `job work ${SQ.rt.jobWork}`);
    assert.ok(performance.now() - t0 < 1500);
    assert.ok(SQ.rt.jobs.some((j) => j.state === 'Running'), 'some jobs left due for the next line');
    for (let k = 0; k < 8; k++) { run(SQ, 'echo x'); assert.ok(SQ.rt.jobWork <= SQ.JOB_WORK); }
    assert.equal(SQ.rt.jobs.filter((j) => j.state === 'Running').length, 0);
  });
  it('each job has its own step allowance: two honest 5,000-pass loops both finish; 16 polling jobs survive', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, '(for i in $(seq 5000); do :; done; echo A) & (for i in $(seq 5000); do :; done; echo B) &').out, '[1] 1235\n[2] 1236\nA\nB');
    const S2 = loadShell();
    run(S2, 'for i in $(seq 16); do (while :; do sleep 0.001; done) & done');
    run(S2, 'echo x');
    assert.equal(S2.rt.jobs.filter((j) => j.state === 'Running').length, 16);
  });
  it("a script keeps only its own jobs' output; the interactive shell's jobs still reach the screen", () => {
    const SQ = loadShell();
    run(SQ, "printf 'sleep 3\\n' > s1.sh; printf 'sleep 3 > x\\n' > s2.sh; printf '{ sleep 3; } > x\\n' > s3.sh; printf '(echo mine) &\\nsleep 1\\n' > s4.sh");
    for (const s of ['s1.sh', 's2.sh', 's3.sh']) {
      run(SQ, '(sleep 1; echo J) &');
      assert.equal(run(SQ, `bash ${s} > o.txt; echo [; cat o.txt; echo ]`).out, 'J\n[\n]', s);
    }
    assert.equal(run(SQ, 'bash s4.sh > o.txt; echo [; cat o.txt; echo ]').out, '[\nmine\n]');
  });
  it('at most 16 live jobs: the 17th fork fails', () => {
    const SQ = loadShell();
    const o = run(SQ, 'for i in $(seq 20); do sleep 100 & done').out.split('\n');
    assert.equal(o.length, 20);
    assert.equal(o[0], '[1] 1235');
    assert.equal(o[15], '[16] 1250');
    assert.deepEqual(o.slice(16), [FORK, FORK, FORK, FORK]);
    assert.equal(live(SQ).length, 16);
    assert.equal(run(SQ, 'sleep 1 & echo still').out, `${FORK}\nstill`);
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
  it('f() { f & }; f runs into the 200-process cap; the shell stays usable', () => {
    const SQ = loadShell();
    const o = run(SQ, 'f() { f & }; f').out;
    assert.match(o, /^\[1\] 1235\n/);
    assert.ok(o.includes(FORK));
    assert.equal(SQ.rt.forks, 200);
    assert.equal(live(SQ).length, 0);
    assert.equal(run(SQ, 'echo ok; pwd').out, 'ok\n/home/explorer');
    assert.equal(run(SQ, 'sleep 1 &').out, FORK);
    assert.equal(run(SQ, 'ps').out, FORK);
  });
  it(':(){ :|:& };: hits the 16-job and 200-process caps; the shell stays usable', () => {
    const SQ = loadShell();
    let maxLive = 0;
    SQ.onAdvance.unshift(() => { maxLive = Math.max(maxLive, live(SQ).length); return []; });
    const origSpawn = SQ.spawn;
    SQ.spawn = (...a) => { const J = origSpawn(...a); maxLive = Math.max(maxLive, live(SQ).length); return J; };
    const r = run(SQ, ':(){ :|:& };:');
    assert.match(r.out, /^\[1\] 1235\n/);
    assert.ok(r.out.split('\n').filter((l) => l === FORK).length > 10);
    assert.ok(maxLive <= 16, `live jobs reached ${maxLive}`);
    assert.equal(SQ.rt.forks, 200);
    assert.equal(live(SQ).length, 0);
    assert.equal(run(SQ, 'echo ok; cd forest; pwd').out, 'ok\n/home/explorer/forest');
  });
  it('a job that recurses through functions stops at the nesting limit', () => {
    const SQ = loadShell();
    const o = run(SQ, 'r() { r; }; r &').out;
    assert.equal(o, '[1] 1235\nbash: r: maximum function nesting level exceeded');
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
  it('pids never repeat within a session (ps runs, jobs, sandboxes)', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'sleep 1 &').out, '[1] 1235');
    run(SQ, 'ps');
    assert.equal(SQ.sandbox(() => run(SQ, 'sleep 1 &').out), '[1] 1235');
    assert.equal(run(SQ, 'sleep 1 &').out, '[1] 1237');
    run(SQ, 'sleep 5');
    assert.equal(run(SQ, 'sleep 1 &').out, '[1] 1238');
    const pids = Array.from(SQ.rt.jobs, (j) => j.pid).concat(Array.from(SQ.rt.reaped, (x) => x.pid));
    assert.deepEqual(pids.sort(), [1235, 1237, 1238]);
    assert.equal(new Set(pids).size, pids.length);
  });
});

describe('job state is runtime only', () => {
  it('SQ.sandbox runs with no jobs and puts the jobs back afterwards', () => {
    const SQ = loadShell();
    run(SQ, '(sleep 2; echo late) &');
    const inside = SQ.sandbox(() => ({ n: SQ.rt.jobs.length, out: run(SQ, 'sleep 5; echo x').out }));
    assert.deepEqual(inside, { n: 0, out: 'x' });
    assert.equal(SQ.rt.jobs.length, 1);
    assert.equal(run(SQ, 'sleep 3').out, 'late');
  });
  it('Reset world (resetProcs) clears jobs, notices and the clock', () => {
    const SQ = loadShell();
    run(SQ, 'sleep 30 & sleep 1 &');
    run(SQ, 'sleep 2');
    SQ.resetProcs();
    assert.equal(SQ.rt.jobs.length, 0);
    assert.equal(SQ.rt.notices.length, 0);
    assert.equal(SQ.rt.clock, 0);
    assert.equal(run(SQ, 'sleep 1 &').out, '[1] 1235');
  });
  it('jobs are never saved', () => {
    const SQ = loadShell();
    run(SQ, 'sleep 30 &');
    assert.ok(!('jobs' in SQ.S));
    assert.ok(!JSON.stringify(SQ.S).includes('sleep 30'));
  });
});

describe('SQ.gen.run and SQ.tick directly', () => {
  it('gen.run yields { wake } at a sleep and returns the status', () => {
    const SQ = loadShell();
    const J = SQ.spawn(SQ.parseProgram('sleep 2; false').items[0].andor, {}, 'sleep 2');
    assert.equal(J.state, 'Running');
    const out = SQ.tick(1);
    assert.deepEqual(Array.from(out), []);
    assert.equal(J.wake, 2);
    SQ.tick(3);
    assert.equal(J.state, 'Done');
    assert.equal(J.code, 0);
  });
});

/* ---------------- Task 12b: jobs, wait, kill, $!, notices ---------------- */
const DONE = (n, cmd, m = '+') => `[${n}]${m}  ${'Done'.padEnd(24)}${cmd}`;
const NOTE = (n, st, cmd, m = '+') => `[${n}]${m}  ${st.padEnd(24)}${cmd}`;
const KILL_L = [
  ' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 4) SIGILL\t 5) SIGTRAP',
  ' 6) SIGABRT\t 7) SIGBUS\t 8) SIGFPE\t 9) SIGKILL\t10) SIGUSR1',
  '11) SIGSEGV\t12) SIGUSR2\t13) SIGPIPE\t14) SIGALRM\t15) SIGTERM',
  '16) SIGSTKFLT\t17) SIGCHLD\t18) SIGCONT\t19) SIGSTOP\t20) SIGTSTP',
  '21) SIGTTIN\t22) SIGTTOU\t23) SIGURG\t24) SIGXCPU\t25) SIGXFSZ',
  '26) SIGVTALRM\t27) SIGPROF\t28) SIGWINCH\t29) SIGIO\t30) SIGPWR',
  '31) SIGSYS\t34) SIGRTMIN\t35) SIGRTMIN+1\t36) SIGRTMIN+2\t37) SIGRTMIN+3',
  '38) SIGRTMIN+4\t39) SIGRTMIN+5\t40) SIGRTMIN+6\t41) SIGRTMIN+7\t42) SIGRTMIN+8',
  '43) SIGRTMIN+9\t44) SIGRTMIN+10\t45) SIGRTMIN+11\t46) SIGRTMIN+12\t47) SIGRTMIN+13',
  '48) SIGRTMIN+14\t49) SIGRTMIN+15\t50) SIGRTMAX-14\t51) SIGRTMAX-13\t52) SIGRTMAX-12',
  '53) SIGRTMAX-11\t54) SIGRTMAX-10\t55) SIGRTMAX-9\t56) SIGRTMAX-8\t57) SIGRTMAX-7',
  '58) SIGRTMAX-6\t59) SIGRTMAX-5\t60) SIGRTMAX-4\t61) SIGRTMAX-3\t62) SIGRTMAX-2',
  '63) SIGRTMAX-1\t64) SIGRTMAX\t',
].join('\n');

describe('wait (Task 12b)', () => {
  it('sleep 5 & wait; echo $SECONDS advances the clock to the job end', () => {
    const SQ = loadShell();
    assert.deepEqual(runN(SQ, 'sleep 5 & wait; echo $SECONDS'), { out: `[1] 1235\n5\n${DONE(1, 'sleep 5')}`, code: 0 });
    assert.equal(SQ.rt.clock, 6);
  });
  it('wait %1 and wait $! return the job status', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'sleep 2 & wait %1; echo $?').out, `[1] 1235\n0\n${DONE(1, 'sleep 2')}`);
    assert.equal(runN(SQ, '(sleep 1; exit 3) & wait $!; echo $?').out, `[1] 1236\n3\n${NOTE(1, 'Exit 3', '(sleep 1; exit 3)')}`);
    assert.equal(runN(SQ, 'wait 1236; echo $?').out, '3', 'a reaped job status stays known to wait PID');
  });
  it('wait with no jobs returns 0 at once; output a job makes appears during the wait', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'wait; echo $? $SECONDS').out, '0 0');
    assert.equal(runN(SQ, '(sleep 2; echo hi) & wait; echo after').out, `[1] 1237`.replace('1237', '1235') + `\nhi\nafter\n${DONE(1, '(sleep 2; echo hi)')}`);
  });
  it('a job whose wake equals the target finishes during the wait (inclusive tick)', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'sleep 3 & sleep 3 & wait %2; echo $? $SECONDS').out, `[1] 1235\n[2] 1236\n0 3\n${DONE(1, 'sleep 3', '-')}\n${DONE(2, 'sleep 3')}`);
  });
  it('wait errors: unknown pid, unknown job, bad id, bad option', () => {
    const SQ = loadShell();
    assert.deepEqual(runN(SQ, 'wait 999'), { out: 'bash: wait: pid 999 is not a child of this shell', code: 127 });
    assert.deepEqual(runN(SQ, 'wait %5'), { out: 'bash: wait: %5: no such job', code: 127 });
    assert.deepEqual(runN(SQ, 'wait abc'), { out: "bash: wait: `abc': not a pid or valid job spec", code: 1 });
    assert.deepEqual(runN(SQ, 'wait -x'), { out: 'bash: wait: -x: invalid option\nwait: usage: wait [-fn] [-p var] [id ...]', code: 2 });
  });
  it('wait -n waits for the next job to finish and returns its status', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, '(sleep 3; exit 4) & (sleep 1; exit 5) & wait -n; echo $? $SECONDS').out.split('\n').slice(2, 3).join(), '5 1');
    assert.deepEqual(runN(SQ, 'wait; wait -n'), { out: `${NOTE(1, 'Exit 4', '(sleep 3; exit 4)')}`, code: 127 });
  });
  it('wait on a runaway job: the job is stopped by the step cap and wait returns its status', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'while :; do :; done & wait $!; echo st=$?').out, `[1] 1235\n${STOPPED}\nst=143\n${NOTE(1, 'Terminated', 'while :; do :; done')}`);
    assert.equal(runN(SQ, 'echo ok').out, 'ok');
  });
  it('wait when the line has spent its job work stops with the step message; the next line works', () => {
    const SQ = loadShell();
    const o = runN(SQ, 'for i in 1 2 3 4 5; do (while :; do sleep 0.001; done) & done; wait; echo never').out;
    assert.match(o, /this practice shell stopped the (command|job): too many steps/);
    assert.doesNotMatch(o, /never/);
    assert.equal(runN(SQ, 'echo ok').out.split('\n')[0], 'ok');
  });
  it('wait for a job that never ends stops instead of hanging', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'sleep infinity & wait').out, '[1] 1235\nthis practice shell stopped the command: that wait is too long');
    assert.equal(runN(SQ, 'echo ok').out, 'ok');
  });
  it('wait inside a background job waits for that job\'s own children', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, '(sleep 2 & wait; echo waited $SECONDS) &').out, '[1] 1235');
    assert.equal(runN(SQ, 'echo a').out, 'a');
    assert.equal(runN(SQ, 'echo b').out, `b\nwaited 2\n${DONE(1, '(sleep 2 & wait; echo waited $SECONDS)')}`);
  });
  it('wait inside a script: its own job output is the script\'s, the shell\'s job output reaches the screen', () => {
    const SQ = loadShell();
    runN(SQ, "printf '(sleep 2; echo mine) &\\nwait\\necho end\\n' > w.sh");
    runN(SQ, '(sleep 1; echo J) &');
    assert.equal(runN(SQ, 'bash w.sh > o.txt; cat o.txt').out, `J\nmine\nend\n${DONE(1, '(sleep 1; echo J)')}`);
  });
});

describe('kill (Task 12b)', () => {
  it('sleep 100 & kill %1; jobs shows Terminated once, then nothing', () => {
    const SQ = loadShell();
    assert.deepEqual(runN(SQ, 'sleep 100 & kill %1; jobs'), { out: `[1] 1235\n${NOTE(1, 'Terminated', 'sleep 100')}`, code: 0 });
    assert.equal(runN(SQ, 'echo x').out, 'x');
    assert.equal(runN(SQ, 'jobs').out, '');
    assert.equal(SQ.rt.jobs.length, 0);
  });
  it('kill PID, kill -9, kill -s SIG, -SIGNAL, -n N: notices name the signal like bash', () => {
    const SQ = loadShell();
    runN(SQ, 'sleep 100 & sleep 100 & sleep 100 & sleep 100 & sleep 100 &');
    assert.deepEqual(runN(SQ, 'kill -9 1235; kill -s INT %2; kill -HUP %3; kill -n 15 1238; kill -SIGUSR1 %5'), { out: [NOTE(1, 'Killed', 'sleep 100', ' '), NOTE(2, 'Interrupt', 'sleep 100', ' '), NOTE(3, 'Hangup', 'sleep 100', ' '), NOTE(4, 'Terminated', 'sleep 100', '-'), NOTE(5, 'User defined signal 1', 'sleep 100')].join('\n'), code: 0 });
    assert.equal(runN(SQ, 'sleep 100 & kill -9 $!; wait $!; echo $?').out, `[1] 1240\n137\n${NOTE(1, 'Killed', 'sleep 100')}`);
  });
  it('kill errors use bash wording', () => {
    const SQ = loadShell();
    assert.deepEqual(runN(SQ, 'kill 999'), { out: 'bash: kill: (999) - No such process', code: 1 });
    assert.deepEqual(runN(SQ, 'kill abc'), { out: 'bash: kill: abc: arguments must be process or job IDs', code: 1 });
    assert.deepEqual(runN(SQ, 'kill %5'), { out: 'bash: kill: %5: no such job', code: 1 });
    assert.deepEqual(runN(SQ, 'kill -s SIGFOO 1235'), { out: 'bash: kill: SIGFOO: invalid signal specification', code: 1 });
    assert.deepEqual(runN(SQ, 'kill -FOO 1235'), { out: 'bash: kill: FOO: invalid signal specification', code: 1 });
    assert.deepEqual(runN(SQ, 'kill -s'), { out: 'bash: kill: -s: option requires an argument', code: 1 });
    const U = 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]';
    assert.deepEqual(runN(SQ, 'kill'), { out: U, code: 2 });
    assert.deepEqual(runN(SQ, 'kill -9'), { out: U, code: 2 });
    assert.deepEqual(runN(SQ, 'kill %%'), { out: 'bash: kill: %%: no such job', code: 1 });
    assert.deepEqual(runN(SQ, "kill ''"), { out: "bash: kill: `': not a pid or valid job spec", code: 1 });
  });
  it('kill -l lists the signals; kill -l N / NAME convert', () => {
    const SQ = loadShell();
    assert.deepEqual(runN(SQ, 'kill -l'), { out: KILL_L, code: 0 });
    assert.equal(runN(SQ, 'kill -l 9').out, 'KILL');
    assert.equal(runN(SQ, 'kill -l KILL').out, '9');
    assert.equal(runN(SQ, 'kill -l SIGTERM').out, '15');
    assert.equal(runN(SQ, 'kill -l 137').out, 'KILL');
    assert.equal(runN(SQ, 'kill -l 0').out, 'EXIT');
    assert.deepEqual(runN(SQ, 'kill -l 1 x 2'), { out: 'HUP\nbash: kill: x: invalid signal specification\nINT', code: 1 });
  });
  it('killing a finished job: No such process (pid) / no such job (%N)', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'sleep 1 & p=$!; sleep 2; kill $p; echo $?').out, `[1] 1235\nbash: kill: (1235) - No such process\n1\n${DONE(1, 'sleep 1')}`);
    assert.equal(runN(SQ, 'sleep 1 & sleep 2; kill %1').out, `[1] 1236\nbash: kill: %1: no such job\n${DONE(1, 'sleep 1')}`);
  });
  it('kill succeeds when any target was signalled (status 0), like bash', () => {
    const SQ = loadShell();
    assert.deepEqual(runN(SQ, 'sleep 9 & kill 999 $!'), { out: `[1] 1235\nbash: kill: (999) - No such process\n${NOTE(1, 'Terminated', 'sleep 9')}`, code: 0 });
  });
  it('kill -0 checks a job exists without signalling it', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'sleep 9 & kill -0 %1; echo $?; jobs').out, '[1] 1235\n0\n[1]+  Running                 sleep 9 &');
  });
  it('kill $$ is not supported yet (Task 14)', () => {
    const SQ = loadShell();
    assert.deepEqual(runN(SQ, 'kill $$'), { out: 'this practice shell does not support signals to the shell itself yet', code: 2 });
    assert.equal(runN(SQ, 'kill -0 $$; echo $?').out, '0');
  });
  it('kill %1 on a job suspended inside function -> subshell -> loop leaves the foreground state intact', () => {
    const SQ = loadShell();
    runN(SQ, 'x=out; f() { local v=in; ( cd forest; y=sub; while :; do sleep 1; echo tick; done ); }');
    assert.equal(runN(SQ, 'f &').out, '[1] 1235');
    assert.equal(runN(SQ, 'echo $x').out, 'x'.replace('x', 'out') + '\ntick');
    const before = { cwd: SQ.S.cwd, frames: SQ.rt.frames.length, scope: SQ.rt.scope };
    assert.equal(runN(SQ, 'g() { local w=1; cd village; kill %1; echo w=$w v=$v y=$y; }; g; pwd; cd ~').out, `w=1 v= y=\n/home/explorer/village\n${NOTE(1, 'Terminated', 'f')}`);
    assert.deepEqual({ cwd: SQ.S.cwd, frames: SQ.rt.frames.length, scope: SQ.rt.scope }, before);
    assert.equal(runN(SQ, 'echo $x $v $y; type f >/dev/null && echo f-still').out, 'out\nf-still');
    assert.equal(runN(SQ, 'sleep 3').out, '', 'the killed job prints nothing more');
  });
  it('fork-bomb style cleanup: kill %1 and kill $(jobs -p)', () => {
    const SQ = loadShell();
    runN(SQ, 'for i in 1 2 3 4; do (while :; do sleep 1; done) & done');
    assert.equal(runN(SQ, 'jobs -p').out, '1235\n1236\n1237\n1238');
    const o = runN(SQ, 'kill $(jobs -p); jobs').out.split('\n');
    assert.equal(o.length, 4);
    assert.ok(o.every((l) => / Terminated {14}\(while :; do sleep 1; done\)$/.test(l)), o.join('\n'));
    assert.equal(live(SQ).length, 0);
    assert.equal(runN(SQ, 'sleep 1 &').out, '[1] 1239', 'after every job is reaped the next job is [1]');
    const S2 = loadShell();
    runN(S2, 'b() { while :; do sleep 1 & sleep 1; done; }; b &');
    runN(S2, 'echo x');
    assert.equal(runN(S2, 'kill %1').out, NOTE(1, 'Terminated', 'b'));
    runN(S2, 'sleep 5');
    assert.equal(S2.rt.jobs.filter((j) => j.state === 'Running').length, 0, 'the spawner is gone; its children finished');
    assert.equal(runN(S2, 'echo ok').out, 'ok');
  });
  it('kill -STOP / -CONT: a stopped job does not run, jobs lists it, CONT resumes it', () => {
    const SQ = loadShell();
    runN(SQ, 'for i in 1 2 3; do sleep 1; echo $i; done &');
    assert.equal(runN(SQ, 'kill -STOP %1').out, NOTE(1, 'Stopped', 'for i in 1 2 3; do sleep 1; echo $i; done'));
    assert.equal(runN(SQ, 'sleep 5; jobs').out, NOTE(1, 'Stopped', 'for i in 1 2 3; do sleep 1; echo $i; done'));
    assert.equal(runN(SQ, 'wait %1; echo $?').out, '147');
    assert.equal(runN(SQ, 'kill -CONT %1; wait; echo w').out, `1\n2\n3\nw\n${DONE(1, 'for i in 1 2 3; do sleep 1; echo $i; done')}`);
  });
  it('a job may kill another job, and itself', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'sleep 50 & (sleep 1; kill %1 2>/dev/null; kill 1235; echo k=$?) & sleep 2').out, `[1] 1235\n[2] 1236\nk=0\n${NOTE(1, 'Terminated', 'sleep 50', '-')}\n${DONE(2, '(sleep 1; kill %1 2>/dev/null; kill 1235; echo k=$?)')}`);
    assert.equal(runN(SQ, '(sleep 1; kill 1237; echo never) & sleep 2').out, `[1] 1237\n${NOTE(1, 'Terminated', '(sleep 1; kill 1237; echo never)')}`);
  });
});

describe('jobs and job specs (Task 12b)', () => {
  it('jobs, jobs -l, jobs -p, -r, -s; + current, - previous; the command as typed with &', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'sleep 30 & sleep 40 & (exit 3) & jobs').out, ['[1] 1235', '[2] 1236', '[3] 1237', '[1]   Running                 sleep 30 &', '[2]-  Running                 sleep 40 &', '[3]+  Running                 (exit 3) &', NOTE(3, 'Exit 3', '(exit 3)')].join('\n'), 'the job only runs at the line\'s cost: jobs still sees it running, the notice closes the line');
    assert.equal(runN(SQ, '(exit 3) & sleep 1; jobs').out, ['[3] 1238', '[1]   Running                 sleep 30 &', '[2]-  Running                 sleep 40 &', `${NOTE(3, 'Exit 3', '(exit 3)')}`].join('\n'), 'jobs shows an ended job once (no notice follows)');
    assert.equal(runN(SQ, 'jobs').out, ['[1]-  Running                 sleep 30 &', '[2]+  Running                 sleep 40 &'].join('\n'));
    assert.equal(runN(SQ, 'jobs -l').out, ['[1]-  1235 Running                 sleep 30 &', '[2]+  1236 Running                 sleep 40 &'].join('\n'));
    assert.equal(runN(SQ, 'jobs -p').out, '1235\n1236');
    assert.equal(runN(SQ, 'jobs -r %2').out, '[2]+  Running                 sleep 40 &');
    assert.equal(runN(SQ, 'jobs -s').out, '');
    assert.deepEqual(runN(SQ, 'jobs %3'), { out: 'bash: jobs: %3: no such job', code: 1 });
    assert.deepEqual(runN(SQ, 'jobs -z'), { out: 'bash: jobs: -z: invalid option\njobs: usage: jobs [-lnprs] [jobspec ...] or jobs -x command [args]', code: 2 });
  });
  it('job specs %% %+ %- %N %string %?string, ambiguous and missing', () => {
    const SQ = loadShell();
    runN(SQ, 'nap() { sleep 60; }; sleep 30 & sleep 40 & nap &');
    assert.equal(runN(SQ, 'jobs -p %%; jobs -p %+; jobs -p %; jobs -p %-; jobs -p %1; jobs -p %nap; jobs -p %?40; jobs -p 2').out, '1237\n1237\n1237\n1236\n1235\n1237\n1236\n1236');
    assert.deepEqual(runN(SQ, 'kill %sl'), { out: 'bash: kill: sl: ambiguous job spec', code: 1 });
    assert.deepEqual(runN(SQ, 'kill %?ee'), { out: 'bash: kill: ee: ambiguous job spec', code: 1 });
    assert.deepEqual(runN(SQ, 'kill %?xyz'), { out: 'bash: kill: %?xyz: no such job', code: 1 });
    assert.deepEqual(runN(SQ, 'wait %nope'), { out: 'bash: wait: %nope: no such job', code: 127 });
  });
  it('jobs inside a script lists the script\'s own jobs (not the shell\'s)', () => {
    const SQ = loadShell();
    runN(SQ, "printf 'sleep 5 &\\njobs\\n' > j.sh");
    runN(SQ, 'sleep 50 &');
    assert.equal(runN(SQ, 'bash j.sh').out, '[1]+  Running                 sleep 5 &');
    assert.equal(runN(SQ, '(jobs)').out, '', 'a ( ) subshell has no jobs of its own');
    assert.equal(runN(SQ, 'jobs | cat; x=$(jobs -p); echo $x').out, '[1]+  Running                 sleep 50 &\n1235', 'a pipeline stage and $( ) see the shell\'s jobs');
  });
  it('job numbers: max+1 while jobs remain, back to [1] once all are reaped', () => {
    const SQ = loadShell();
    runN(SQ, 'sleep 1 & sleep 30 &');
    runN(SQ, 'sleep 2');
    assert.equal(runN(SQ, 'sleep 30 &').out, '[3] 1237');
    runN(SQ, 'kill %2 %3');
    assert.equal(runN(SQ, 'sleep 30 &').out, '[1] 1238');
  });
});

describe('notices (Task 12b)', () => {
  it('printed once, in job order, after the line that ended them', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'sleep 3 & sleep 2 &').out, '[1] 1235\n[2] 1236');
    assert.equal(runN(SQ, 'echo a').out, 'a');
    assert.equal(runN(SQ, 'sleep 5; echo b').out, `b\n${DONE(1, 'sleep 3', '-')}\n${DONE(2, 'sleep 2')}`);
    assert.equal(runN(SQ, 'echo c').out, 'c');
    assert.equal(SQ.rt.jobs.length, 0);
    assert.equal(SQ.rt.notices.length, 0);
  });
  it('never inside $( ) output; not for jobs finished inside scripts or subshells', () => {
    const SQ = loadShell();
    runN(SQ, 'sleep 1 &');
    assert.equal(runN(SQ, 'y=$(sleep 3; echo got); echo "[$y]"').out, `[got]\n${DONE(1, 'sleep 1')}`);
    assert.equal(runN(SQ, 'x=$(true & sleep 1; echo in); echo "[$x]"').out, '[in]');
    assert.equal(runN(SQ, '(true & sleep 1); echo out').out, 'out');
    runN(SQ, "printf 'true &\\nsleep 1\\necho s\\n' > s.sh");
    assert.equal(runN(SQ, 'bash s.sh').out, 's');
  });
  it('a job that ends during the line\'s own 1-second cost gets its notice at the end of that line', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'echo hi &').out, `[1] 1235\nhi\n${DONE(1, 'echo hi')}`);
  });
});

describe('$! (Task 12b)', () => {
  it('is empty before any job, then the pid of the newest job of this shell', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'echo "[$!]" "[${!}]"').out, '[] []');
    assert.equal(runN(SQ, 'sleep 9 & echo $!').out, '[1] 1235\n1235');
  });
  it('is per shell: a subshell, $( ) or job that starts a job does not change the shell\'s $!', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'sleep 1 & a=$!; (sleep 1 & echo sub=$!); echo $! $a').out, '[1] 1235\nsub=1236\n1235 1235');
    assert.equal(runN(SQ, 'sleep 9 & b=$(sleep 1 & echo $!); echo $! $b').out, `[2] 1237\n1237 1238\n${DONE(1, 'sleep 1', '-')}`);
    assert.equal(runN(SQ, '(sleep 1 & echo in=$!) & sleep 2; echo $!').out, `[3] 1239\nin=1240\n1239\n${DONE(3, '(sleep 1 & echo in=$!)')}`);
    assert.equal(runN(SQ, '(echo inherit=$!)').out, 'inherit=1239');
    runN(SQ, "printf 'echo script=$!\\nsleep 1 &\\necho now=$!\\n' > b.sh");
    assert.equal(runN(SQ, 'bash b.sh; echo $!').out, 'script=\nnow=1241\n1239');
  });
  it('is not saved', () => {
    const SQ = loadShell();
    runN(SQ, 'sleep 9 &');
    assert.ok(!JSON.stringify(SQ.S).includes('1235'));
    SQ.resetProcs();
    assert.equal(runN(SQ, 'echo "[$!]"').out, '[]');
  });
});

describe('more of jobs/wait/kill (Task 12b)', () => {
  it('wait -p VAR, jobs -n, type kill', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, '(sleep 2; exit 6) & (sleep 1; exit 7) & wait -n -p who; echo $? $who').out.split('\n')[2], '7 1236');
    assert.equal(runN(SQ, 'type kill wait jobs').out, `kill is a shell builtin\nwait is a shell builtin\njobs is a shell builtin\n${NOTE(1, 'Exit 6', '(sleep 2; exit 6)')}`);
    const S2 = loadShell();
    runN(S2, 'sleep 30 & sleep 40 &');
    assert.equal(runN(S2, 'jobs -n').out.split('\n').length, 2);
    assert.equal(runN(S2, 'jobs -n').out, '', 'nothing changed since jobs last showed them');
    assert.equal(runN(S2, 'kill -STOP %1; jobs -n').out, '[1]+  Stopped                 sleep 30');
  });
  it('wait inside a function inside a job; a wait the job cannot pause at says so', () => {
    const SQ = loadShell();
    runN(SQ, 'f() { sleep 2 & wait; echo fw $SECONDS; }; f &');
    assert.equal(runN(SQ, 'sleep 3').out, `fw 2\n${DONE(1, 'f')}`);
    assert.equal(runN(SQ, '(sleep 5 & wait | cat; echo st=$?) &').out.split('\n')[1], 'st=0', 'a pipeline stage has no children of its own: wait returns 0 at once, as in bash');
    assert.equal(runN(SQ, '{ sleep 5 & wait; echo st=$?; } > w.txt &').out.split('\n')[1], 'this practice shell does not support wait inside that part of a background job yet');
    assert.equal(runN(SQ, 'cat w.txt').out, 'st=2');
  });
  it('timeout around a script that waits fires as usual', () => {
    const SQ = loadShell();
    runN(SQ, "printf 'sleep 100 &\\nwait\\necho never\\n' > tw.sh");
    assert.deepEqual(runN(SQ, 'timeout 3 bash tw.sh; echo st=$? $SECONDS'), { out: 'st=124 4', code: 0 });
  });
  it('a function called inside a redirected compound in a job runs (it is not deferred and lost)', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'f() { echo hi; }; { f; } > o.txt & sleep 1; cat o.txt').out, `[1] 1235\nhi\n${DONE(1, '{ f; } > o.txt')}`);
  });
  it('a sandbox (mission checks) starts with no $! and puts it back', () => {
    const SQ = loadShell();
    runN(SQ, 'sleep 30 &');
    assert.equal(SQ.sandbox(() => runN(SQ, 'echo "[$!]"').out), '[]');
    assert.equal(runN(SQ, 'echo $!').out, '1235');
  });
  it('a line stopped by a cap keeps the [N] PID lines it already printed', () => {
    const SQ = loadShell();
    assert.equal(runN(SQ, 'sleep 30 & while :; do :; done').out, '[1] 1235\nthis practice shell stopped the command: too many steps');
  });
});
