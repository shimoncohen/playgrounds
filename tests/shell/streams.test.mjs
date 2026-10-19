import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

describe('command substitution', () => {
  it('works inside double quotes', () => {
    assert.equal(run(loadShell(), 'echo "today: $(echo hi)"').out, 'today: hi');
  });
  it('nests', () => {
    assert.equal(run(loadShell(), 'echo $(echo $(echo deep))').out, 'deep');
  });
  it('is literal inside single quotes', () => {
    assert.equal(run(loadShell(), "echo '$(echo no)'").out, '$(echo no)');
  });
  it('works in assignments and later lines see the value', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'X=$(echo a b); echo $X').out, 'a b');
  });
  it('strips trailing newlines and splits unquoted results', () => {
    const SQ = loadShell();
    run(SQ, 'echo one > f1.txt');
    run(SQ, 'echo two > f2.txt');
    assert.equal(run(SQ, 'ls $(echo f1.txt f2.txt) | wc -l').out, '2');
    assert.equal(run(SQ, 'echo "[$(cat f1.txt)]"').out, '[one]');
  });
  it('reports an unterminated substitution without throwing', () => {
    const r = run(loadShell(), 'echo $(echo');
    assert.equal(r.out, "bash: unexpected EOF while looking for matching ')'");
    assert.equal(r.code, 2);
  });
  it('respects quotes when matching parens', () => {
    assert.equal(run(loadShell(), 'echo $(echo ")")').out, ')');
  });
  it('caps runaway nesting cleanly', () => {
    const SQ = loadShell();
    let s = 'echo x';
    for (let i = 0; i < 40; i++) s = `echo $(${s})`;
    const r = run(SQ, s);
    assert.ok(r.out.includes('nested too deeply'));
  });
});

describe('stderr redirects', () => {
  it('2> file captures errors', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'ls missing 2> err.txt').out, '');
    assert.ok(run(SQ, 'cat err.txt').out.includes('No such file or directory'));
  });
  it('2>> appends', () => {
    const SQ = loadShell();
    run(SQ, 'ls m1 2> e.txt');
    run(SQ, 'ls m2 2>> e.txt');
    assert.equal(run(SQ, 'wc -l e.txt').out.trim().split(' ')[0], '2');
  });
  it('2>/dev/null discards', () => {
    assert.equal(run(loadShell(), 'ls missing 2>/dev/null').out, '');
  });
  it('2>&1 merges into the pipe', () => {
    assert.equal(run(loadShell(), 'ls missing 2>&1 | wc -l').out, '1');
  });
  it('without 2>&1 errors skip the pipe', () => {
    assert.ok(run(loadShell(), 'ls missing | wc -l').out.includes('No such file'));
  });
  it('> /dev/null discards stdout', () => {
    assert.equal(run(loadShell(), 'cat readme.txt > /dev/null').out, '');
  });
  it('/dev/null reads empty and is not a real file', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'cat /dev/null').out, '');
    assert.equal(run(SQ, 'cat < /dev/null').out, '');
    run(SQ, 'echo hi > /dev/null');
    assert.equal(SQ.getNode('/dev'), null);
    assert.equal(JSON.stringify(SQ.S).includes('null'), false);
  });
  it('unsupported syntax says so', () => {
    assert.equal(run(loadShell(), 'echo hi &> f').out, 'this practice shell does not support &> yet');
  });
  it('here-strings feed stdin (Task 6a)', () => {
    assert.equal(run(loadShell(), 'cat <<< hi').out, 'hi');
    assert.equal(run(loadShell(), 'wc -l <<< hi').out, '1');
  });
});

describe('export and env', () => {
  it('env lists exported vars, not plain ones', () => {
    const SQ = loadShell();
    run(SQ, 'export Z=1');
    run(SQ, 'Y=2');
    const env = run(SQ, 'env').out.split('\n');
    assert.ok(env.includes('Z=1'));
    assert.ok(!env.some((l) => l.startsWith('Y=')));
    for (const k of ['HOME', 'USER', 'SHELL', 'HOSTNAME', 'PATH', 'PWD']) assert.ok(env.some((l) => l.startsWith(k + '=')));
    assert.deepEqual(env, [...env].sort());
  });
  it('export NAME exports an existing variable; S.exp is created lazily', () => {
    const SQ = loadShell();
    assert.equal('exp' in SQ.S, false); // lazily created: saved shape unchanged until first export
    run(SQ, 'Q=7');
    run(SQ, 'export Q');
    assert.ok(run(SQ, 'env').out.split('\n').includes('Q=7'));
    assert.equal(run(SQ, 'export 1x=2').code, 1);
  });
  it('scripts see only exported variables', () => {
    const SQ = loadShell();
    run(SQ, 'echo \'echo "[$Z][$Y]"\' > s.sh');
    run(SQ, 'chmod +x s.sh');
    run(SQ, 'Y=2');
    assert.equal(run(SQ, 'bash s.sh').out, '[][]');
    run(SQ, 'export Z=1');
    assert.equal(run(SQ, './s.sh').out, '[1][]');
    assert.equal(run(SQ, 'echo $Y').out, '2');
  });
  it('state without exp works; first export creates {NAME:1}', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'env').out.includes('HOME='), true);
    run(SQ, 'export A=1');
    assert.deepEqual(JSON.parse(JSON.stringify(SQ.S.exp)), { A: 1 });
  });
});

describe('substitution is a subshell', () => {
  it('does not leak cwd', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo $(cd forest; pwd); pwd').out, '/home/explorer/forest\n/home/explorer');
  });
  it('does not leak variables', () => {
    assert.equal(run(loadShell(), 'echo $(X=5); echo $X').out, '');
  });
  it('does not leak exports', () => {
    const SQ = loadShell();
    run(SQ, 'echo $(export Q=1)');
    assert.ok(!run(SQ, 'env').out.split('\n').includes('Q=1'));
  });
  it('filesystem changes persist', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo $(touch f; echo ok)').out, 'ok');
    assert.equal(run(SQ, 'ls f').out, 'f');
  });
  it('for-list substitution errors do not leak into the next command', () => {
    const SQ = loadShell();
    let s = 'echo x';
    for (let i = 0; i < 40; i++) s = `echo $(${s})`;
    run(SQ, `for a in $(${s}); do echo $a; done`);
    assert.equal(run(SQ, 'echo clean').out, 'clean');
  });
});
