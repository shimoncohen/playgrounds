// Background jobs, scheduler core (Stage 3 Task 12a): `&`, SQ.spawn, SQ.gen.run, SQ.tick, the 16-job and 200-process caps.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

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
  it('$? after & is 0; the job number counts up', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'false & echo $?').out, '[1] 1235\n0');
    assert.equal(run(SQ, 'sleep 9 &').out, '[2] 1236');
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
    assert.equal(run(SQ, 'echo x').out, 'x\n1');
    assert.equal(run(SQ, 'echo y').out, 'y\n2');
    assert.equal(run(SQ, 'echo z').out, 'z\n3');
    assert.equal(run(SQ, 'echo w').out, 'w');
    assert.equal(SQ.rt.jobs[0].state, 'Done');
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
    assert.equal(run(SQ, 'cd forest & sleep 1; pwd').out, '[2] 1236\n/home/explorer');
    assert.equal(run(SQ, 'y=5; (echo $y; y=6) & sleep 1; echo $y').out, '[3] 1237\n5\n5');
    assert.equal(run(SQ, '(z=1; sleep 1; echo z=$z) & z=9; sleep 2').out, '[4] 1238\nz=1');
    assert.equal(run(SQ, 'g() { echo g; }; (unset -f g; h() { :; }) & sleep 1; type g >/dev/null && echo still; type h 2>/dev/null || echo noh').out, '[5] 1239\nstill\nnoh');
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
    assert.equal(run(SQ, 'g() { sleep 1; echo in-g; }; g & echo now').out, '[2] 1236\nnow');
    assert.equal(run(SQ, 'echo next').out, 'next\nin-g');
    run(SQ, "echo 'echo from lib' > lib.sh");
    assert.equal(run(SQ, 'source lib.sh & sleep 1').out, '[3] 1237\nfrom lib');
    run(SQ, "echo 'lf() { echo lf $1; }' > l2.sh");
    assert.equal(run(SQ, '. l2.sh; lf x & sleep 1').out, '[4] 1238\nlf x');
    assert.equal(run(SQ, 'r() { return 4; }; (r; echo st=$?) & sleep 1').out, '[5] 1239\nst=4');
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
    run(SQ, '(sleep 1; exit 3) & { exit 4; echo no; } & sleep 2');
    assert.equal(SQ.rt.jobs[0].code, 3);
    assert.equal(SQ.rt.jobs[1].code, 4);
    assert.equal(SQ.rt.jobs[1].state, 'Done');
  });
  it('a finished job keeps its record (state Done) until its Done notice is shown', () => {
    const SQ = loadShell();
    run(SQ, 'sleep 1 &');
    run(SQ, 'echo a');
    run(SQ, 'echo b');
    const J = SQ.rt.jobs[0];
    assert.equal(J.state, 'Done');
    assert.equal(J.code, 0);
    assert.ok(SQ.rt.notices.includes(J));
  });
  it('job output reaches the screen even when the foreground command is redirected', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, '(sleep 1; echo bg) & sleep 2 > f; cat f').out, '[1] 1235\nbg');
    assert.equal(run(SQ, '(sleep 1; echo bg2) & { sleep 2; } > g; cat g').out, '[2] 1236\nbg2');
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
    assert.equal(SQ.rt.jobs[0].state, 'Terminated');
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
  it('while :; do sleep 0; done & is stopped too; the foreground line keeps going', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'x=1; while :; do sleep 0; done & sleep 1; echo after $x').out, `[1] 1235\n${STOPPED}\nafter 1`);
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
  it('jobs have their own step budget: busy jobs never stop the foreground line; a stopped job does not starve the others', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'while true; do sleep 1; done & while :; do :; done & for i in 1 2 3; do sleep 1; echo $i; done &').out, `[1] 1235\n[2] 1236\n[3] 1237\n${STOPPED}`);
    const o = run(SQ, 'for i in $(seq 10); do sleep 3600; done; echo fg-done').out.split('\n');
    assert.deepEqual(o, ['1', '2', '3', STOPPED, 'fg-done']);
    assert.deepEqual(Array.from(SQ.rt.jobs, (j) => j.state), ['Terminated', 'Terminated', 'Done']);
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
    assert.equal(run(SQ, 'sleep 1 &').out, '[2] 1237');
    run(SQ, 'sleep 5');
    assert.equal(run(SQ, 'sleep 1 &').out, '[3] 1238');
    const pids = SQ.rt.jobs.map((j) => j.pid);
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
