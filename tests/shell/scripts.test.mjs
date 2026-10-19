// Scripts with arguments, stdin, own scope, sandbox and check context (Task 8).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, loadContext, run } from './harness.mjs';

const H = '/home/explorer/';
const put = (SQ, name, text, exec = false) => {
  SQ.writeFile(H + name, text, false, name);
  if (exec) run(SQ, `chmod +x ${name}`);
};
const out = (SQ, line) => run(SQ, line).out;

describe('arguments and $0', () => {
  it('bash s.sh a "b c"', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo "arg1=$1 all=$@ n=$#"');
    assert.equal(out(SQ, 'bash s.sh a "b c"'), 'arg1=a all=a b c n=2');
  });
  it('sh s.sh a b', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo "$1-$2-$#"');
    assert.equal(out(SQ, 'sh s.sh a b'), 'a-b-2');
  });
  it('./s.sh after chmod +x, with arguments', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo "got $1 $2"');
    assert.match(out(SQ, './s.sh x'), /Permission denied/);
    run(SQ, 'chmod +x s.sh');
    assert.equal(out(SQ, './s.sh x y'), 'got x y');
  });
  it('$0 is the path as typed', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo "zero=$0"', true);
    assert.equal(out(SQ, './s.sh'), 'zero=./s.sh');
    assert.equal(out(SQ, 'bash s.sh'), 'zero=s.sh');
    assert.equal(out(SQ, 'bash ./s.sh'), 'zero=./s.sh');
    assert.equal(out(SQ, 'bash /home/explorer/s.sh'), 'zero=/home/explorer/s.sh');
  });
  it('the caller arguments are not visible and are back afterwards', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo "[$1]"');
    put(SQ, 'o.sh', 'echo "o=$1"; bash s.sh inner; echo "o=$1"');
    assert.equal(out(SQ, 'bash o.sh outer'), 'o=outer\n[inner]\no=outer');
  });
  it('nested script calling another script with args', () => {
    const SQ = loadShell();
    put(SQ, 'inner.sh', 'echo "inner $1 $2"');
    put(SQ, 'outer.sh', 'bash inner.sh "$1" two');
    assert.equal(out(SQ, 'bash outer.sh one'), 'inner one two');
  });
});

describe('exit status and shebang', () => {
  it('exit 4 ends the script, status 4', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo before\nexit 4\necho after');
    assert.equal(out(SQ, 'bash s.sh'), 'before');
    assert.equal(out(SQ, 'echo $?'), '4');
  });
  it('the last command status is the status', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'false');
    assert.equal(run(SQ, 'bash s.sh').code, 1);
  });
  it('shebang is a comment', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', '#!/bin/bash\necho hi', true);
    assert.equal(out(SQ, './s.sh'), 'hi');
  });
  it('return at script top level is an error', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'return 3');
    assert.equal(out(SQ, 'bash s.sh'), "bash: return: can only 'return' from a function or sourced script");
  });
});

describe('stdin', () => {
  it('echo Ada | bash s.sh', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'read n; echo "Hi $n"');
    assert.equal(out(SQ, 'echo Ada | bash s.sh'), 'Hi Ada');
  });
  it('bash s.sh < file', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'read n; echo "Hi $n"');
    put(SQ, 'in.txt', 'Zed\nsecond');
    assert.equal(out(SQ, 'bash s.sh < in.txt'), 'Hi Zed');
  });
  it('./s.sh gets piped stdin; several reads consume lines', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'read a; read b; echo "$b,$a"', true);
    assert.equal(out(SQ, 'printf x | ./s.sh').includes('internal'), false);
    put(SQ, 'in.txt', 'one\ntwo');
    assert.equal(out(SQ, './s.sh < in.txt'), 'two,one');
  });
  it('here-string and compound redirect still work', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'read n; echo "Hi $n"');
    assert.equal(out(SQ, 'bash s.sh <<< Bo'), 'Hi Bo');
    assert.equal(out(SQ, '{ echo A; } | bash s.sh'), 'Hi A');
  });
  it('execLine accepts an initial stdin string', () => {
    const SQ = loadShell();
    const r = SQ.execLine('read x; echo "got $x"', { stdin: 'hello' });
    assert.equal(r.out.map((o) => o.text).join('\n'), 'got hello');
  });
  it('without stdin, read in a script says it cannot wait', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'read n');
    assert.match(out(SQ, 'bash s.sh'), /cannot wait for typing/);
  });
});

describe('scope', () => {
  it('exported variables are visible, plain ones are not', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo "[$Z][$Y]"', true);
    run(SQ, 'Y=2');
    assert.equal(out(SQ, 'bash s.sh'), '[][]');
    run(SQ, 'export Z=1');
    assert.equal(out(SQ, './s.sh'), '[1][]');
    assert.equal(out(SQ, 'echo $Y'), '2');
  });
  it('export Y=1 inside a script does not leak into env', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'export Y=1\nQ=5\necho "in:$Y"');
    assert.equal(out(SQ, 'bash s.sh'), 'in:1');
    assert.equal(out(SQ, 'env').split('\n').includes('Y=1'), false);
    assert.equal(out(SQ, 'echo "[$Y][$Q]"'), '[][]');
  });
  it('cd inside a script does not move the caller', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'cd forest\npwd');
    assert.equal(out(SQ, 'bash s.sh; pwd'), '/home/explorer/forest\n/home/explorer');
  });
  it('files the script writes stay', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo data > made.txt');
    run(SQ, 'bash s.sh');
    assert.equal(out(SQ, 'cat made.txt'), 'data');
  });
  it('functions of the caller are not visible, the script own are not leaked', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'g() { echo "g:$1"; }\ng a\nf');
    run(SQ, 'f() { echo F; }');
    const r = out(SQ, 'bash s.sh');
    assert.match(r, /g:a/);
    assert.match(r, /f: command not found/);
    assert.equal(out(SQ, 'f'), 'F');
    assert.match(out(SQ, 'g a'), /command not found/);
  });
});

describe('whole-file parsing', () => {
  it('if/while/functions spanning lines run', () => {
    const SQ = loadShell();
    put(
      SQ,
      's.sh',
      '#!/bin/bash\nsay() {\n  echo "say $1"\n}\ni=0\nwhile [ $i -lt 3 ]; do\n  i=$((i+1))\ndone\nif [ $i -eq 3 ]; then\n  say three\nelse\n  say other\nfi\nfor w in a b; do say $w; done\n',
    );
    assert.equal(out(SQ, 'bash s.sh'), 'say three\nsay a\nsay b');
  });
  it('a script defines a function and uses it', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'hello() { echo "hello $1"; }\nhello World');
    assert.equal(out(SQ, 'bash s.sh'), 'hello World');
  });
  it('heredoc inside a script', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'cat <<EOF\nline1\nline2\nEOF\necho done');
    assert.equal(out(SQ, 'bash s.sh'), 'line1\nline2\ndone');
  });
  it('a syntax error in line 9 prints once and runs nothing', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'touch first.txt\necho a\necho b\necho c\necho d\necho e\necho f\necho g\nif then fi\necho z');
    const r = run(SQ, 'bash s.sh');
    assert.match(r.out, /^bash: .*syntax error/);
    assert.equal(r.out.split('\n').length, 1);
    assert.equal(r.code, 2);
    assert.equal(out(SQ, 'ls first.txt'), "ls: cannot access 'first.txt': No such file or directory");
  });
  it('plain scripts keep running every line, ignoring failures', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'nosuchcmd\necho still here');
    assert.equal(out(SQ, 'bash s.sh'), 'bash: nosuchcmd: command not found\nstill here');
  });
  it('a script calling itself stops at the existing depth cap', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo hi\nbash s.sh');
    const r = out(SQ, 'bash s.sh');
    assert.match(r, /bash: too many nested scripts/);
    assert.equal(r.split('\n').filter((l) => l === 'hi').length, 6);
  });
});

describe('unchanged errors', () => {
  it('missing file, directory, permission', () => {
    const SQ = loadShell();
    assert.equal(out(SQ, 'bash nope.sh'), 'bash: nope.sh: No such file or directory');
    assert.equal(out(SQ, 'bash forest'), 'bash: forest: Is a directory');
    assert.equal(out(SQ, './forest'), 'bash: ./forest: Is a directory');
    put(SQ, 's.sh', 'echo x');
    const r = run(SQ, './s.sh');
    assert.match(r.out, /bash: .\/s.sh: Permission denied/);
    assert.equal(r.code, 126);
    assert.equal(out(SQ, 'bash s.sh'), 'x');
  });
});

describe('pipeline stages are subshells', () => {
  it('echo Ada | read x; echo $x prints empty', () => {
    const SQ = loadShell();
    assert.equal(out(SQ, 'echo Ada | read x; echo "[$x]"'), '[]');
  });
  it('a loop variable set in a piped stage does not leak', () => {
    const SQ = loadShell();
    assert.equal(out(SQ, 'for i in 1 2; do echo $i; done | wc -l; echo "[$i]"'), '2\n[]');
  });
  it('assignments in a stage do not leak, files still do, status is the last stage', () => {
    const SQ = loadShell();
    assert.equal(out(SQ, 'echo hi | { X=1; cat > made.txt; }; echo "[$X]"; cat made.txt'), '[]\nhi');
    assert.equal(run(SQ, 'true | false').code, 1);
  });
  it('single commands are not affected', () => {
    const SQ = loadShell();
    assert.equal(out(SQ, 'X=1; echo $X'), '1');
  });
});

describe('sandbox', () => {
  it('leaves S and the log byte-identical', () => {
    const SQ = loadShell();
    run(SQ, 'export K=1; V=2; f() { echo F; }; mkdir keep');
    put(SQ, 's.sh', 'echo hi > a.txt\ncd forest\nX=9\nexport Z=3\ng() { :; }\nmkdir -p q/r\nrm /home/explorer/readme.txt');
    const ctx = SQ.ctxFor('x');
    const before = JSON.stringify(SQ.S),
      logLen = SQ.rt.log.length,
      log = SQ.rt.log;
    const r = ctx.runScript('s.sh');
    assert.equal(r.code, 0);
    assert.equal(JSON.stringify(SQ.S), before);
    assert.equal(SQ.rt.log.length, logLen);
    assert.equal(SQ.rt.log, log);
    ctx.scriptPasses({ file: 's.sh', tests: [{ expectOut: '' }] });
    assert.equal(JSON.stringify(SQ.S), before);
  });
  it('SQ.sandbox returns the value and restores, also when fn throws', () => {
    const SQ = loadShell();
    const before = JSON.stringify(SQ.S);
    const v = SQ.sandbox(() => {
      run(SQ, 'cd forest; Q=1; touch zz');
      return 42;
    });
    assert.equal(v, 42);
    assert.equal(JSON.stringify(SQ.S), before);
    assert.throws(
      () =>
        SQ.sandbox(() => {
          run(SQ, 'cd forest; Q=1; touch zz');
          throw new Error('boom');
        }),
      /boom/,
    );
    assert.equal(JSON.stringify(SQ.S), before);
    assert.equal(SQ.rt.sandboxed, false);
    assert.equal(SQ.rt.frames.length, 0);
  });
  it('restores rt.log, lastOut and counters', () => {
    const SQ = loadShell();
    run(SQ, 'echo visible');
    const log = SQ.rt.log.slice();
    const lastOut = SQ.rt.lastOut;
    SQ.sandbox(() => {
      SQ.rt.log.push({ name: 'x' });
      SQ.rt.lastOut = 'changed';
      SQ.rt.steps = 999;
    });
    assert.deepEqual(JSON.parse(JSON.stringify(SQ.rt.log)), JSON.parse(JSON.stringify(log)));
    assert.equal(SQ.rt.lastOut, lastOut);
  });
  it('a runaway script is restored and reported, not thrown', () => {
    const SQ = loadShell();
    put(SQ, 'loop.sh', 'cd forest\nZ=1\nn=0\nwhile true; do n=$((n+1)); echo $n > f$n; done');
    const before = JSON.stringify(SQ.S);
    const ctx = SQ.ctxFor('x');
    const r = ctx.scriptPasses({ file: 'loop.sh', tests: [{ expectOut: '' }] });
    assert.equal(r.ok, false);
    assert.equal(r.failed.index, 0);
    assert.match(r.failed.got, /too many steps|too large/);
    assert.equal(JSON.stringify(SQ.S), before);
    const r2 = ctx.runScript('loop.sh');
    assert.notEqual(r2.code, 0);
    assert.equal(JSON.stringify(SQ.S), before);
    // the shell is usable afterwards
    assert.equal(out(SQ, 'echo ok'), 'ok');
  });
  it('never touches localStorage', () => {
    const ctx = loadContext();
    const SQ = ctx.SQ;
    let calls = 0;
    ctx.localStorage.setItem = () => void calls++;
    ctx.localStorage.getItem = () => void calls++;
    put(SQ, 's.sh', 'echo hi > a.txt');
    const c = SQ.ctxFor('x');
    c.scriptPasses({ file: 's.sh', tests: [{ expectOut: '' }] });
    c.runScript('s.sh');
    SQ.sandbox(() => run(SQ, 'touch q'));
    assert.equal(calls, 0);
  });
  it('save() is a no-op while sandboxed', () => {
    const ctx = loadContext();
    const SQ = ctx.SQ;
    let calls = 0;
    ctx.localStorage.setItem = () => void calls++;
    SQ.sandbox(() => SQ.save());
    assert.equal(calls, 0);
    SQ.save();
    assert.equal(calls, 1);
  });
  it('a near-cap state sandboxes in under a second', () => {
    const SQ = loadShell();
    const big = 'x'.repeat(100000);
    for (let i = 0; i < 14; i++) SQ.writeFile(H + 'big' + i, big, false, 'big' + i);
    assert.ok(SQ.stateText(SQ.S.fs) > 1.3e6);
    put(SQ, 's.sh', 'echo hi');
    const ctx = SQ.ctxFor('x');
    const t = Date.now();
    const r = ctx.scriptPasses({ file: 's.sh', tests: Array.from({ length: 20 }, () => ({ expectOut: 'hi' })) });
    assert.equal(r.ok, true);
    assert.ok(Date.now() - t < 1000, 'took ' + (Date.now() - t));
  });
});

describe('check context', () => {
  it('c.out() is the typed line stdout, exists() aliases has()', () => {
    const SQ = loadShell();
    run(SQ, 'echo one; echo two');
    const c = SQ.ctxFor('echo one; echo two');
    assert.equal(c.out(), 'one\ntwo');
    assert.equal(c.exists('journal.txt'), true);
    assert.equal(c.exists('nothing'), false);
    run(SQ, 'cat nothing');
    assert.equal(SQ.ctxFor('cat nothing').out(), '');
  });
  it('c.runScript(path,args,stdin) is sandboxed and never logged', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'read n; echo "$1 $n"; touch made');
    const c = SQ.ctxFor('x');
    const r = c.runScript('s.sh', ['A'], 'Bob');
    assert.deepEqual(JSON.parse(JSON.stringify(r)), { out: 'A Bob', err: [], code: 0 });
    assert.equal(c.exists('made'), false);
    assert.equal(SQ.rt.log.length, 0);
  });
  it('c.runScript on a missing file reports the bash error', () => {
    const SQ = loadShell();
    const r = SQ.ctxFor('x').runScript('nope.sh');
    assert.equal(r.code, 127);
    assert.deepEqual([...r.err], ['bash: nope.sh: No such file or directory']);
  });
});

describe('scriptPasses', () => {
  const setup = () => {
    const SQ = loadShell();
    put(SQ, 'greet.sh', 'name=${1:-nobody}\nread w\necho "Hello $name $w"');
    return { SQ, c: SQ.ctxFor('x') };
  };
  it('passes a correct script', () => {
    const { c } = setup();
    const r = c.scriptPasses({
      file: 'greet.sh',
      tests: [
        { args: ['Ada'], stdin: 'there', expectOut: 'Hello Ada there' },
        { stdin: 'x', expectOut: 'Hello nobody x', label: 'default' },
      ],
    });
    assert.deepEqual(JSON.parse(JSON.stringify(r)), { ok: true });
  });
  it('reports the first failing case', () => {
    const { c } = setup();
    const r = c.scriptPasses({
      file: 'greet.sh',
      tests: [
        { args: ['Ada'], stdin: 'a', expectOut: 'Hello Ada a' },
        { args: ['Bo'], stdin: 'b', expectOut: 'Hello Bob b' },
        { args: ['Cy'], stdin: 'c', expectOut: 'nope' },
      ],
    });
    assert.equal(r.ok, false);
    assert.deepEqual(JSON.parse(JSON.stringify(r.failed)), { index: 1, label: 'case 2', expected: 'Hello Bob b', got: 'Hello Bo b' });
  });
  it('uses the case label when given', () => {
    const { c } = setup();
    const r = c.scriptPasses({ file: 'greet.sh', tests: [{ stdin: 'x', expectOut: 'bad', label: 'default name' }] });
    assert.equal(r.failed.label, 'default name');
  });
  it('trims exactly one trailing newline of stdout', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo a\necho');
    const c = SQ.ctxFor('x');
    assert.equal(c.scriptPasses({ file: 's.sh', tests: [{ expectOut: 'a' }] }).ok, true);
    put(SQ, 't.sh', 'echo a');
    assert.equal(SQ.ctxFor('x').scriptPasses({ file: 't.sh', tests: [{ expectOut: 'a\n' }] }).ok, false);
  });
  it('expectMatch uses a safe regex', () => {
    const { c } = setup();
    assert.equal(c.scriptPasses({ file: 'greet.sh', tests: [{ args: ['Ada'], stdin: 'q', expectMatch: '^Hello A.a' }] }).ok, true);
    const bad = c.scriptPasses({ file: 'greet.sh', tests: [{ args: ['Ada'], stdin: 'q', expectMatch: '^Bye' }] });
    assert.equal(bad.ok, false);
    assert.equal(bad.failed.index, 0);
    const risky = c.scriptPasses({ file: 'greet.sh', tests: [{ stdin: 'q', expectMatch: '(a+)+$' }] });
    assert.equal(risky.ok, false);
  });
  it('expectCode defaults to 0', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo hi\nexit 3');
    const c = SQ.ctxFor('x');
    const r = c.scriptPasses({ file: 's.sh', tests: [{ expectOut: 'hi' }] });
    assert.equal(r.ok, false);
    assert.equal(r.failed.expected, 'exit status 0');
    assert.equal(r.failed.got, 'exit status 3');
    assert.equal(c.scriptPasses({ file: 's.sh', tests: [{ expectOut: 'hi', expectCode: 3 }] }).ok, true);
  });
  it('files seed the case and expectFiles is exact', () => {
    const SQ = loadShell();
    put(SQ, 'cp.sh', 'cat "$1" | tr a-z A-Z > out.txt');
    const c = SQ.ctxFor('x');
    const ok = c.scriptPasses({
      file: 'cp.sh',
      tests: [{ args: ['in.txt'], files: { 'in.txt': 'abc', 'sub/deep.txt': 'z' }, expectOut: '', expectFiles: { 'out.txt': 'ABC' } }],
    });
    assert.deepEqual(JSON.parse(JSON.stringify(ok)), { ok: true });
    const bad = c.scriptPasses({
      file: 'cp.sh',
      tests: [{ args: ['in.txt'], files: { 'in.txt': 'abc' }, expectFiles: { 'out.txt': 'abc' } }],
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.failed.expected, 'abc');
    assert.equal(bad.failed.got, 'ABC');
    assert.equal(c.exists('in.txt'), false, 'seeded files do not leak');
    const miss = c.scriptPasses({ file: 'cp.sh', tests: [{ args: ['in.txt'], files: { 'in.txt': 'a' }, expectFiles: { 'nope.txt': 'x' } }] });
    assert.equal(miss.ok, false);
    assert.equal(miss.failed.got, '(missing)');
  });
  it('a missing or non-file script', () => {
    const { c } = setup();
    const expect = (f) => ({ ok: false, failed: { index: -1, label: 'file', expected: f, got: 'missing' } });
    const j = (x) => JSON.parse(JSON.stringify(x));
    assert.deepEqual(j(c.scriptPasses({ file: 'nope.sh', tests: [{ expectOut: '' }] })), expect('nope.sh'));
    assert.deepEqual(j(c.scriptPasses({ file: 'forest', tests: [{ expectOut: '' }] })), expect('forest'));
  });
  it('a script that hangs or has a syntax error is a failed case, not an exception', () => {
    const SQ = loadShell();
    put(SQ, 'h.sh', 'while true; do :; done');
    put(SQ, 'b.sh', 'if then');
    const c = SQ.ctxFor('x');
    const r = c.scriptPasses({ file: 'h.sh', tests: [{ expectOut: '' }] });
    assert.equal(r.ok, false);
    assert.equal(r.failed.index, 0);
    assert.match(r.failed.got, /too many steps/);
    const r2 = c.scriptPasses({ file: 'b.sh', tests: [{ expectOut: '' }] });
    assert.equal(r2.ok, false);
    assert.match(r2.failed.got, /syntax error/);
  });
  it('caps the number of cases and the size of the reported text', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'echo hi');
    const c = SQ.ctxFor('x');
    const tests = Array.from({ length: 25 }, () => ({ expectOut: 'hi' }));
    tests[22] = { expectOut: 'bad' };
    assert.equal(c.scriptPasses({ file: 's.sh', tests }).ok, true, 'cases past the cap are not run');
    put(SQ, 'long.sh', 'for i in $(seq 1 2000); do echo line$i; done');
    const r = c.scriptPasses({ file: 'long.sh', tests: [{ expectOut: 'x' }] });
    assert.equal(r.ok, false);
    assert.ok(r.failed.got.length <= 2100);
  });
  it('each case starts from the same world', () => {
    const SQ = loadShell();
    put(SQ, 's.sh', 'if [ -e marker ]; then echo seen; else echo fresh; fi\ntouch marker');
    const r = SQ.ctxFor('x').scriptPasses({ file: 's.sh', tests: [{ expectOut: 'fresh' }, { expectOut: 'fresh' }] });
    assert.deepEqual(JSON.parse(JSON.stringify(r)), { ok: true });
  });
});
