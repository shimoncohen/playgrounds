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

// Task 11b: >&2 and 1>&2 send a command's stdout to the stderr stream
describe('>&2 redirect', () => {
  // [stdout lines, stderr lines, code] from the raw result (the harness run() merges both)
  const split = (SQ, line) => {
    SQ.rt.log = [];
    SQ.rt.changed = new Set();
    const r = SQ.execLine(line);
    const f = (cls) => r.out.filter((o) => o.cls === cls).map((o) => o.text).join('\n');
    return { out: f('out'), err: f('err'), code: r.code };
  };
  it('echo hi >&2 prints on stderr, status 0', () => {
    assert.deepEqual(split(loadShell(), 'echo hi >&2'), { out: '', err: 'hi', code: 0 });
  });
  it('1>&2 is the same', () => {
    assert.deepEqual(split(loadShell(), 'echo hi 1>&2'), { out: '', err: 'hi', code: 0 });
    assert.deepEqual(split(loadShell(), 'echo hi >&2;echo ok'), { out: 'ok', err: 'hi', code: 0 });
  });
  it('in a pipeline the text goes to the screen and the next stage gets nothing', () => {
    assert.deepEqual(split(loadShell(), 'echo hi >&2 | cat'), { out: '', err: 'hi', code: 0 });
    assert.equal(split(loadShell(), 'echo hi >&2 | wc -c').out.trim(), '0');
  });
  it('2>/dev/null hides it (group and simple)', () => {
    const SQ = loadShell();
    assert.deepEqual(split(SQ, '{ echo a; echo b >&2; } 2>/dev/null'), { out: 'a', err: '', code: 0 });
    assert.deepEqual(split(SQ, 'echo hi >&2 2>/dev/null'), { out: '', err: 'hi', code: 0 });
  });
  it('2> file after >&2 leaves stdout on the screen; 2> file BEFORE it sends stdout to the file too', () => {
    const SQ = loadShell();
    assert.deepEqual(split(SQ, 'echo hi >&2 2>f'), { out: '', err: 'hi', code: 0 });
    assert.equal(run(SQ, 'cat f').out, '');
    assert.deepEqual(split(SQ, 'echo hi 2>g >&2'), { out: '', err: '', code: 0 });
    assert.equal(run(SQ, 'cat g').out, 'hi');
  });
  it('compound commands take >&2', () => {
    const SQ = loadShell();
    assert.deepEqual(split(SQ, '{ echo a; echo b; } >&2'), { out: '', err: 'a\nb', code: 0 });
    assert.deepEqual(split(SQ, 'if true; then echo y; fi >&2'), { out: '', err: 'y', code: 0 });
    assert.deepEqual(split(SQ, 'for i in 1 2; do echo $i; done >&2'), { out: '', err: '1\n2', code: 0 });
    assert.deepEqual(split(SQ, '{ echo a; echo b >&2; } >&2 | cat'), { out: '', err: 'a\nb', code: 0 });
  });
  it('the last stdout redirect wins', () => {
    const SQ = loadShell();
    assert.deepEqual(split(SQ, 'echo hi >&2 > f'), { out: '', err: '', code: 0 });
    assert.equal(run(SQ, 'cat f').out, 'hi');
    assert.deepEqual(split(SQ, 'echo yo > h >&2'), { out: '', err: 'yo', code: 0 });
  });
  it('2>&1 combinations follow bash left to right', () => {
    const SQ = loadShell();
    // both streams end up on the screen
    assert.deepEqual(split(SQ, 'ls nothing >&2 2>&1'), { out: '', err: "ls: cannot access 'nothing': No such file or directory", code: 2 });
    // 2>&1 >&2 swaps the two: the error goes down the pipe, stdout to the screen
    assert.deepEqual(split(SQ, 'ls nothing 2>&1 >&2 | wc -l'), { out: '1', err: '', code: 0 });
    assert.deepEqual(split(SQ, 'echo hi 2>&1 >&2 | wc -l'), { out: '0', err: 'hi', code: 0 });
    assert.deepEqual(split(SQ, 'echo hi >&2 2>&1 | wc -l'), { out: '0', err: 'hi', code: 0 });
  });
  it('the unsupported forms still say so', () => {
    const SQ = loadShell();
    for (const l of ['echo hi &> f', 'echo hi >&-', 'echo hi 3>&1', 'echo hi >&1', 'echo hi >&3', 'echo hi |& cat'])
      assert.equal(run(SQ, l).out.startsWith('this practice shell does not support'), true, l);
    assert.equal(run(SQ, 'echo hi >&1').out, 'this practice shell does not support >& yet');
    assert.equal(run(SQ, 'echo hi >&1').code, 2);
  });
  it('a script writing to stderr: err lines, exit code kept', () => {
    const SQ = loadShell();
    run(SQ, 'echo \'echo "usage: s.sh NAME" >&2; echo out; exit 1\' > s.sh');
    const r = SQ.runScript('s.sh', { force: true, tty: false });
    assert.deepEqual({ out: r.out, err: Array.from(r.err), code: r.code }, { out: 'out', err: ['usage: s.sh NAME'], code: 1 });
    const b = split(SQ, 'bash s.sh');
    assert.equal(b.code, 1);
    assert.equal(b.err, 'usage: s.sh NAME');
  });
});
