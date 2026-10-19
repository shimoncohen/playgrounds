// Caps that stop runaway commands (output, file size, steps, regex backtracking) and the save warning.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, loadContext, run } from './harness.mjs';

const fast = (SQ, line, ms = 3000) => {
  const t = Date.now();
  const r = run(SQ, line);
  assert.ok(Date.now() - t < ms, `took ${Date.now() - t} ms: ${line}`);
  return r;
};
const stateSize = (SQ) => JSON.stringify(SQ.S).length;

describe('output and file size caps', () => {
  it('(a) xargs cannot grow a file past the cap, and the state stays small enough to save', () => {
    const SQ = loadShell();
    run(SQ, 'seq 10000 > f');
    const r = fast(SQ, 'seq 300 | xargs -I{} cat f > g');
    assert.match(r.out, /too large for this practice shell/);
    const g = SQ.ctxFor('').read('~/g');
    assert.ok(g.length <= SQ.LIM.TEXT, 'g is ' + g.length);
    assert.ok(stateSize(SQ) < 2000000, 'state is ' + stateSize(SQ));
  });
  it('writing or appending beyond the cap is refused, small writes still work', () => {
    const SQ = loadShell();
    run(SQ, 'seq 10000 > f');
    let refused = false;
    for (let i = 0; i < 40 && !refused; i++) refused = /file too large for this practice shell/.test(run(SQ, 'cat f f f f >> f').out);
    assert.ok(refused, 'append eventually refused');
    assert.ok(SQ.ctxFor('').read('~/f').length <= SQ.LIM.TEXT);
    assert.equal(run(SQ, 'echo hi > small.txt; cat small.txt').out, 'hi');
  });
  it('the whole world may not hold more file text than LIM.STATE', () => {
    const SQ = loadShell();
    run(SQ, 'seq 10000 > f');
    for (let i = 0; i < 40; i++) run(SQ, `cat f f f f f f f f f f f f f f f f f f f f > big${i}`);
    assert.ok(stateSize(SQ) < 2000000, 'state is ' + stateSize(SQ));
  });
  it('(b) millions of output lines are cut off quickly, with one notice', () => {
    const SQ = loadShell();
    const r = fast(SQ, 'seq 200 | xargs -I{} seq 10000');
    assert.match(r.out, /output too large for this practice shell/);
    const r2 = fast(SQ, 'seq 10000');
    const lines = r2.out.split('\n');
    assert.equal(lines.length, SQ.LIM.LINES + 1);
    assert.match(lines[lines.length - 1], /output cut off after 2000 lines/);
    assert.equal(lines[SQ.LIM.LINES - 1], String(SQ.LIM.LINES));
  });
  it('(b) a huge pipe into wc is refused before counting', () => {
    const SQ = loadShell();
    const r = fast(SQ, 'seq 200 | xargs -I{} seq 10000 | wc -l');
    assert.match(r.out, /too large/);
  });
  it('ordinary output is untouched: 2000 lines and under print in full', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'seq 2000').out.split('\n').length, 2000);
    assert.equal(run(SQ, 'seq 100 | wc -l').out.trim(), '100');
  });
});

describe('step budget', () => {
  it('(c) nested loops stop with a message instead of hanging', () => {
    const SQ = loadShell();
    const r = fast(SQ, 'for a in $(seq 10000); do for b in $(seq 10000); do X=1; done; done');
    assert.equal(r.out, 'this practice shell stopped the command: too many steps');
    assert.equal(r.code, 1);
    assert.equal(run(SQ, 'echo still works').out, 'still works');
  });
  it('a modest loop is not affected', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'for a in 1 2 3; do for b in x y; do echo $a$b; done; done').out.split('\n').length, 6);
  });
  it('the budget starts again for each typed line', () => {
    const SQ = loadShell();
    for (let i = 0; i < 3; i++) assert.equal(run(SQ, 'for a in $(seq 9000); do X=1; done').out, '');
  });
});

describe('unexpected failures become error lines', () => {
  it('(d) doubling a file in a loop does not throw out of execLine', () => {
    const SQ = loadShell();
    run(SQ, 'seq 10000 > f');
    let r;
    assert.doesNotThrow(() => { r = fast(SQ, 'for i in $(seq 20); do cat f f > g; cat g g > f; done', 10000); });
    assert.match(r.out, /too large|too many steps/);
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
  it('any JS exception inside a command is one error line, exit code 1, state usable', () => {
    const SQ = loadShell();
    SQ.CMDS.boom = () => { throw new Error('kaboom'); };
    run(SQ, 'cd forest');
    const r = run(SQ, 'cd cave; boom');
    assert.equal(r.code, 1);
    assert.match(r.out, /^bash: internal error: kaboom/);
    assert.equal(run(SQ, 'echo fine').out, 'fine');
    assert.equal(run(SQ, 'echo $?').out, '0');
  });
  it('a script that blows up restores the folder and variables', () => {
    const SQ = loadShell();
    SQ.CMDS.boom = () => { throw new Error('kaboom'); };
    run(SQ, 'echo "cd forest\nboom" > s.sh; chmod +x s.sh');
    const before = SQ.S.cwd;
    run(SQ, './s.sh');
    assert.equal(SQ.S.cwd, before);
  });
});

describe('deep nesting never shows raw JS text', () => {
  const NEST = 'bash: syntax error: nesting too deep';
  const r = (n, x) => x.repeat(n);
  it('[ ! ! ... x ] 5000 deep', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, '[ ' + r(5000, '! ') + 'x ]'), { out: NEST, code: 2 });
    assert.deepEqual(run(SQ, 'test ' + r(5000, '! ') + 'x'), { out: NEST, code: 2 });
    assert.equal(run(SQ, 'echo $?').out, '2');
  });
  it('[[ ( ... x ... ) ]] 5000 deep, and [[ ! ! ... ]]', () => {
    const SQ = loadShell();
    assert.deepEqual(run(SQ, '[[ ' + r(5000, '( ') + 'x' + r(5000, ' )') + ' ]]'), { out: NEST, code: 2 });
    assert.deepEqual(run(SQ, '[[ ' + r(5000, '! ') + 'x ]]'), { out: NEST, code: 2 });
  });
  it('echo ${X:-${X:-...}} 3000 deep, also inside quotes, a function, a here-string and $(( ))', () => {
    const SQ = loadShell();
    const deep = r(3000, '${X:-') + 'd' + r(3000, '}');
    assert.deepEqual(run(SQ, 'echo ' + deep), { out: NEST, code: 2 });
    assert.deepEqual(run(SQ, 'echo "' + deep + '"'), { out: NEST, code: 2 });
    assert.deepEqual(run(SQ, 'f(){ echo ' + deep + '; }; f'), { out: NEST, code: 2 });
    assert.deepEqual(run(SQ, 'cat <<< ' + deep), { out: NEST, code: 2 });
    assert.deepEqual(run(SQ, 'X=1; echo ${X:' + r(3000, '$((') + '1' + r(3000, '))') + '}'), { out: NEST, code: 2 });
    assert.deepEqual(run(SQ, 'echo "' + r(3000, '$("') + 'x' + r(3000, '")') + '"'), { out: NEST, code: 2 });
    assert.equal(run(SQ, 'echo still works').out, 'still works');
  });
  it('ordinary nesting and long chains still work', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'echo ' + r(40, '${X:-') + 'd' + r(40, '}')).out, 'd');
    assert.equal(run(SQ, '[ ' + r(40, '! ') + 'x ]; echo $?').out, '0');
    assert.equal(run(SQ, '[[ ' + r(40, '( ') + 'x' + r(40, ' )') + ' ]] && echo y').out, 'y');
    assert.equal(run(SQ, '[ ' + r(5000, 'x -o ') + 'x ]; echo $?').out, '0', 'a long -o chain is a flat list');
    assert.equal(run(SQ, '[[ ' + r(5000, 'x && ') + ' "" ]]; echo $?').out, '1');
    assert.equal(run(SQ, '[[ -n a && ( x == y || 1 -lt 2 ) ]] && echo ok').out, 'ok');
    assert.equal(run(SQ, '[ a = b -o c = c -a ! -z d ]; echo $?').out, '0');
  });
  it('generic: a JS stack overflow anywhere in a command reads as the nesting error, never as RangeError text', () => {
    const SQ = loadShell();
    SQ.CMDS.blowup = () => { const f = (n) => f(n + 1) + 1; return f(0); };
    assert.deepEqual(run(SQ, 'blowup'), { out: NEST, code: 2 });
    assert.equal(run(SQ, 'echo $?').out, '2');
    SQ.CMDS.blowup2 = () => { throw new RangeError('Maximum call stack size exceeded'); };
    const out = run(SQ, 'for i in 1; do blowup2; done; echo after');
    assert.equal(out.out, NEST);
    assert.doesNotMatch(out.out, /Maximum call stack|RangeError/);
    assert.equal(SQ.errOf(new RangeError('Maximum call stack size exceeded')), NEST);
    assert.equal(SQ.fatalText(new RangeError('Maximum call stack size exceeded')), NEST);
  });
});

describe('the saved-state cap holds for many small writes', () => {
  it('a loop of small writes stops with the cap message; the world stays near LIM.STATE; the shell still works', () => {
    const SQ = loadShell();
    const r = fast(SQ, "i=0; while (( i < 9000 )); do printf '%0999d' 0 > f$i; ((i++)); done", 10000);
    assert.equal(r.out, 'this practice shell stopped the command: the files in this world grew too large (rm some to free space)');
    assert.equal(r.code, 1);
    const size = SQ.stateText(SQ.S.fs);
    assert.ok(size > SQ.LIM.STATE && size < SQ.LIM.STATE + 256 * 1000, 'state text is ' + size);
    assert.ok(stateSize(SQ) < 2000000, 'saved state is ' + stateSize(SQ));
    assert.equal(run(SQ, 'echo still works').out, 'still works');
    assert.match(run(SQ, 'echo x > one-more').out, /grew too large/, 'over the cap, a further write stops');
    run(SQ, 'rm f*');
    assert.equal(run(SQ, 'echo x > small; cat small').out, 'x', 'after rm, writes work again');
  });
  it('appending small lines in a loop is caught too', () => {
    const SQ = loadShell();
    const r = fast(SQ, "for i in $(seq 9000); do printf '%0999d' 0 >> big$((i % 3)); done", 10000);
    assert.match(r.out, /grew too large|file too large/);
    assert.ok(SQ.stateText(SQ.S.fs) < SQ.LIM.STATE + 256 * 1000);
  });
  it('cp: a copy that would pass the cap is refused; many small cp end at the cap', () => {
    const SQ = loadShell();
    run(SQ, "mkdir big; cd big; printf '%0999d' 0 > s; seq 1 900 | xargs -I{} cp s f{}; cd ..");
    const r = run(SQ, 'cp -r big b1; echo next');
    assert.equal(r.out, 'cp: b1: file too large for this practice shell\nnext');
    assert.equal(SQ.getNode(SQ.norm('~/b1')), null);
    const r2 = fast(SQ, 'for i in $(seq 900); do cp big/s c$i; done', 10000);
    assert.match(r2.out, /grew too large/);
    assert.ok(SQ.stateText(SQ.S.fs) < SQ.LIM.STATE + 256 * 1000);
  });
  it('the end of the typed line checks once more (a short line that ends over the cap)', () => {
    const SQ = loadShell();
    run(SQ, "mkdir big; cd big; printf '%0999d' 0 > s; seq 1 740 | xargs -I{} cp s f{}; cd ..");
    run(SQ, 'cp -r big b1');
    const r = run(SQ, 'cp -r big b2 2>/dev/null; seq 1 20 | xargs -I{} cp big/s x{}');
    assert.equal(r.out, 'this practice shell stopped the command: the files in this world grew too large (rm some to free space)');
  });
  it('the sandbox and scriptPasses are unaffected: the throwaway world is put back', () => {
    const SQ = loadShell();
    const before = SQ.stateText(SQ.S.fs);
    const res = SQ.sandbox(() => run(SQ, "i=0; while (( i < 9000 )); do printf '%0999d' 0 > f$i; ((i++)); done"));
    assert.match(res.out, /grew too large/);
    assert.equal(SQ.stateText(SQ.S.fs), before);
    assert.equal(run(SQ, 'echo x > ok.txt; cat ok.txt').out, 'x');
  });
});

describe('failed saves are reported', () => {
  it('sets saveFailed and calls onSaveFail once per failure episode', () => {
    const ctx = loadContext();
    const SQ = ctx.SQ;
    let calls = 0;
    SQ.rt.onSaveFail = () => calls++;
    const real = ctx.localStorage.setItem;
    ctx.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    SQ.save(); SQ.save();
    assert.equal(SQ.rt.saveFailed, true);
    assert.equal(calls, 1);
    ctx.localStorage.setItem = real;
    SQ.save();
    assert.equal(SQ.rt.saveFailed, false);
  });
});

describe('safeRegex', () => {
  const hang = 'a'.repeat(30) + 'b';
  it('(sed) the two known hanging patterns return quickly with an error', () => {
    const SQ = loadShell();
    run(SQ, `echo ${hang} > h.txt`);
    for (const pat of ['(a|a)*$', '((a+))+$', '(a+)+$', '(a*)*$', '(.*a)+$', '(a|aa)+$']) {
      const r = fast(SQ, `sed -E 's/${pat}/x/' h.txt`, 1000); // -E: in a BRE these characters are literals (Task 7)
      assert.equal(r.out, 'sed: pattern too complex for this practice shell', pat);
      assert.notEqual(r.code, 0);
    }
  });
  it('(grep) the same patterns are refused', () => {
    const SQ = loadShell();
    run(SQ, `echo ${hang} > h.txt`);
    for (const pat of ['(a|a)*$', '((a+))+$', '(a+)+$']) {
      const r = fast(SQ, `grep '${pat}' h.txt`, 1000);
      assert.equal(r.out, 'grep: pattern too complex for this practice shell', pat);
      assert.equal(r.code, 2);
    }
  });
  it('over-long patterns are refused', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, `echo a | grep '${'a'.repeat(300)}'`).out, 'grep: pattern too complex for this practice shell');
  });
  it('simple, safe patterns still compile', () => {
    const { safeRegex } = loadShell();
    for (const p of ['(ab)+', '(a|b)+', '(cat|dog)*', 'a+b*', '[a-z]+', '(ab){2}', '(a|b)', '^(a|b)c$', 'x(a+)y', '(?:ab)+', '\\(a+\\)+', '[(a+)]+', 'a{2,3}', '(foo|bar|qux)+!', '^[0-9]+ (GET|POST) '])
      assert.doesNotThrow(() => safeRegex(p, 'g'), p);
  });
  it('risky patterns throw an error marked complex; invalid ones stay SyntaxErrors', () => {
    const { safeRegex } = loadShell();
    for (const p of ['(a|a)*', '(a+)+', '((a+))+', '(a|ab)+', '(a*)*', '(a|b+)+', '((a|b))+', '(a?)+', '(a|)+'])
      assert.throws(() => safeRegex(p, ''), (e) => e.complex === true, p);
    assert.throws(() => safeRegex('(', ''), (e) => e.name === 'SyntaxError');
  });
});

describe('regex backtracking guard (Task 9b)', () => {
  const put = (SQ, name, text) => SQ.writeFile(SQ.norm(name), text);
  const TOO = 'pattern too complex for this practice shell';
  const after = (SQ) => assert.equal(run(SQ, 'echo next').out, 'next');
  it('pinned slow patterns end quickly with the friendly message, and the next command works', () => {
    const SQ = loadShell();
    put(SQ, 'l128.txt', 'a'.repeat(128));
    put(SQ, 'l32k.txt', 'a'.repeat(32000));
    put(SQ, 'l30k.txt', 'a'.repeat(30000));
    const cases = [
      [`grep -E '.*.*.*.*.*c' l128.txt`, 'grep: ' + TOO],
      [`sed 's/a*a*a*a*a*a*a*a*b/x/' l32k.txt`, 'sed: ' + TOO],
      [`awk '/a*a*a*a*b/' l32k.txt`, 'awk: ' + TOO],
      [`grep 'a*b' l30k.txt`, 'grep: ' + TOO],
      [`grep -c 'a*b' l30k.txt`, 'grep: ' + TOO],
      [`grep -o 'a*b' l30k.txt`, 'grep: ' + TOO],
      [`sed 's/a*b/x/g' l30k.txt`, 'sed: ' + TOO],
      [`sed -n '/a*b/p' l30k.txt`, 'sed: ' + TOO],
      [`awk '{ gsub(/a*b/, "x"); print }' l30k.txt`, 'awk: ' + TOO],
      [`awk '{ n = split($0, p, /a*b/); print n }' l30k.txt`, 'awk: ' + TOO],
      [`awk '{ print match($0, /a*b/) }' l30k.txt`, 'awk: ' + TOO],
      [`awk '$1 ~ /a*b/' l30k.txt`, 'awk: ' + TOO],
      [`awk -F 'a*b' '{ print NF }' l30k.txt`, 'awk: ' + TOO],
      [`x=$(cat l30k.txt); [[ $x =~ a*b ]]`, 'bash: [[: ' + TOO],
    ];
    for (const [line, want] of cases) {
      const r = fast(SQ, line, 1000);
      assert.equal(r.out, want, line);
      assert.notEqual(r.code, 0, line);
      after(SQ);
    }
  });
  it('awk strings built inside the program are guarded too', () => {
    const SQ = loadShell();
    const r = fast(SQ, `awk 'BEGIN { s = "a"; while (length(s) < 30000) s = s s; print (s ~ /a*a*a*b/) }'`, 1000);
    assert.equal(r.out, 'awk: ' + TOO);
    after(SQ);
  });
  it('glob patterns with many stars stay fast on long names (find -name, grep --include)', () => {
    const SQ = loadShell();
    const name = 'a'.repeat(250);
    run(SQ, `mkdir g; touch g/${name}`);
    const r = fast(SQ, `find g -name '*a*a*a*a*a*a*a*a*b'`, 1000);
    assert.equal(r.out, '');
    assert.equal(fast(SQ, `find g -name '*a*a'`, 1000).out, 'g/' + name);
    assert.equal(fast(SQ, `ls g/*a*a*a*a*a*a*a*a*b 2>&1 | wc -l`, 1000).out, '1');
  });
  it('many lines that each fit cannot add up to a freeze: the work is charged to the step budget', () => {
    const SQ = loadShell();
    put(SQ, 'many.txt', ('a'.repeat(200) + '\n').repeat(4900)); // a*a*c is cubic; 200 characters fit, 4,900 such lines would take minutes
    for (const line of [`grep -c 'a*a*c' many.txt`, `sed -n '/a*a*c/p' many.txt`, `awk '/a*a*c/' many.txt`]) {
      const r = fast(SQ, line, 2000);
      assert.equal(r.out, 'this practice shell stopped the command: too many steps', line);
      after(SQ);
    }
    assert.equal(run(SQ, `head -3 many.txt | grep -c 'a*a*c'`).out, '0');
  });
  it('everyday patterns keep working on normal lines, and on long lines when they are linear', () => {
    const SQ = loadShell();
    put(SQ, 't.txt', ['foo and bar', 'ver 3.14 ok', 'abba', 'the wolf howls', 'an error here', 'root:x:0:0:root:/root:/bin/bash', 'nothing'].join('\n'));
    const want = [
      [`grep '^.*foo.*bar$' t.txt`, 'foo and bar'],
      [`grep -E '[0-9]+\\.[0-9]+' t.txt`, 'ver 3.14 ok'],
      [`grep -E '^(a|b)+$' t.txt`, 'abba'],
      [`grep '\\bwolf\\b' t.txt`, 'the wolf howls'],
      [`grep '.*error.*' t.txt`, 'an error here'],
      [`grep -c '^[^:]*:[^:]*:' t.txt`, '1'],
      [`sed -n 's/^\\([^:]*\\):.*/\\1/p' t.txt`, 'root'],
      [`awk -F: '/^root/ { print $7 }' t.txt`, '/bin/bash'],
      [`awk '{ gsub(/o+/, "0"); print }' t.txt | head -1`, 'f0 and bar'],
    ];
    for (const [line, out] of want) assert.equal(run(SQ, line).out, out, line);
    const long = 'x'.repeat(200000) + ' wolf ' + 'y'.repeat(200000);
    put(SQ, 'long.txt', long);
    assert.equal(fast(SQ, `grep -c '\\bwolf\\b' long.txt`, 2000).out, '1');
    assert.equal(fast(SQ, `grep -c 'wolf' long.txt`, 2000).out, '1');
    assert.equal(fast(SQ, `sed 's/.*/z/' long.txt`, 2000).out, 'z');
    assert.equal(fast(SQ, `awk '{ print length($0) }' long.txt`, 2000).out, String(long.length));
    assert.equal(fast(SQ, `sed 's/o/0/g' long.txt | grep -c w0lf`, 2000).out, '1');
  });
  it('regexFits: refuses by subject length, deterministically', () => {
    const { safeRegex, regexFits, LIM } = loadShell();
    const ab = safeRegex('a*b', '');
    assert.equal(regexFits(ab, 200), true);
    assert.equal(regexFits(ab, 30000), false);
    assert.equal(regexFits(safeRegex('\\bwolf\\b', ''), LIM.TEXT), true);
    assert.equal(regexFits(safeRegex('^foo', ''), LIM.TEXT), true);
    for (const p of ['^.*foo.*bar$', '[0-9]+\\.[0-9]+', '^(a|b)+$', '\\bwolf\\b', '.*error.*', '^[^:]*:[^:]*:'])
      assert.equal(regexFits(safeRegex(p, 'g'), 1000), true, p);
    for (const p of ['.*.*.*.*.*c', 'a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?a?aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'])
      assert.throws(() => safeRegex(p, ''), (e) => e.complex === true, p);
  });
  it('seeded random patterns: each is refused, or runs within 250 ms on worst-case subjects up to the longest length it accepts', () => {
    const { safeRegex, regexFits, LIM } = loadShell();
    let seed = 12345;
    const rnd = (k) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * k); };
    const atoms = ['a', 'b', '.', '[ab]', '[^b]', '\\w', '(?:ab)', '(a|b)', '(a|bc)', 'ab'];
    const quants = ['', '', '*', '*', '+', '?', '{2,5}', '{1,}', '*?', '+?'];
    const subjects = (n) => ['a'.repeat(n), 'a'.repeat(n - 1) + 'c', 'ab'.repeat(n >> 1) + 'c', 'b'.repeat(n - 1) + 'c', 'aab'.repeat(Math.floor(n / 3)) + 'x'];
    let accepted = 0, refused = 0, worst = 0, worstPat = '';
    const t0 = Date.now();
    for (let k = 0; k < 120; k++) {
      let p = rnd(3) === 0 ? '^' : '';
      const len = 1 + rnd(6);
      for (let i = 0; i < len; i++) p += atoms[rnd(atoms.length)] + quants[rnd(quants.length)];
      if (rnd(3) === 0) p += rnd(2) ? '$' : 'c';
      let re;
      try { re = safeRegex(p, 'g'); } catch (e) { assert.equal(e.complex, true, p); refused++; continue; }
      accepted++;
      for (const all of [false, true]) {
        let lo = 0, hi = LIM.TEXT; // longest accepted subject length
        while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (regexFits(re, mid, all, true)) lo = mid; else hi = mid - 1; } // true: no line breaks
        if (lo < 4) continue;
        for (const s of subjects(lo)) {
          const t = Date.now();
          re.lastIndex = 0;
          if (!all) re.test(s);
          else { // a /g loop as sed s///g and awk gsub run it; after 2,000 matches only linear match-building work is left
            for (let k = 0, m; k < 2000 && (m = re.exec(s)); k++) if (m[0] === '') re.lastIndex++;
          }
          const ms = Date.now() - t;
          if (ms > worst) { worst = ms; worstPat = `${p} n=${lo} all=${all}`; }
          assert.ok(ms < 250, `${p} took ${ms} ms on ${s.length} chars (all=${all})`);
        }
      }
    }
    assert.ok(accepted > 30 && refused > 3, `accepted ${accepted}, refused ${refused}`);
    assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms; worst ${worst} ms ${worstPat}`);
  });
});

describe('every mission answer, guide example and quick-fire answer stays inside the caps', () => {
  const SQ0 = loadShell();
  const chapters = SQ0.content.chapters;
  const fresh = (ch) => { const SQ = loadShell(); SQ.content.chapters[ch].setup(); return SQ; };
  it('mission answers do not hit a cap or the regex guard', () => {
    chapters.forEach((c, i) => {
      const SQ = fresh(i);
      for (const m of SQ.content.chapters[i].missions) {
        const r = run(SQ, m.answer);
        assert.doesNotMatch(r.out, /too complex|too large|too many steps|cut off/, `${i}.${m.title}`);
      }
    });
  });
  it('guide examples and quick-fire answers do not hit a cap or the regex guard', () => {
    const lines = [];
    for (const g of SQ0.content.guide) for (const [c] of g.ex) lines.push([g.ch === 'extras' ? 0 : g.ch, c]);
    for (const q of SQ0.content.quickfire) for (const a of q[1]) lines.push([chapters.length - 1, a]);
    for (const [ch, line] of lines) {
      const SQ = fresh(ch);
      for (const s of ['~/village/logs/all.log']) SQ.ensureFile?.(s, 'x');
      const r = run(SQ, line);
      assert.doesNotMatch(r.out, /too complex|too large|too many steps|cut off/, line);
    }
  });
});

describe('Stage 2 hardening (Task 2)', () => {
  const overCap = (SQ) => { // a world whose files hold more than LIM.STATE, built directly so no check fires
    const big = 'x'.repeat(SQ.LIM.TEXT);
    for (let i = 0; i < 3; i++) SQ.S.fs.children.tmp.children['big' + i] = SQ.F(big);
    assert.ok(SQ.stateText(SQ.S.fs) > SQ.LIM.STATE);
  };
  it('file names that match Object.prototype members behave like any other name', () => {
    const SQ = loadShell();
    assert.match(run(SQ, 'mkdir constructor; ls').out, /constructor\//);
    assert.equal(run(SQ, 'touch toString; echo hi > valueOf; cat valueOf').out, 'hi');
    assert.match(run(SQ, 'cd __proto__').out, /No such file or directory/);
    run(SQ, 'echo x > __proto__');
    assert.match(run(SQ, 'cat content').out, /No such file or directory/);
    assert.equal(({}).content, undefined);
    assert.equal(Object.prototype.content, undefined);
  });
  it('names with prototype members survive the JSON round trip, and old saves still load', () => {
    const SQ = loadShell();
    run(SQ, 'mkdir constructor; echo a > constructor/__proto__; touch toString');
    const saved = JSON.stringify(SQ.S);
    const SQ2 = loadShell();
    SQ2.resetState(Object.assign(SQ2.fresh(), JSON.parse(saved)));
    assert.equal(run(SQ2, 'cat constructor/__proto__').out, 'a');
    assert.match(run(SQ2, 'ls').out, /constructor\//);
    assert.equal(run(SQ2, 'cat constructor/hasOwnProperty').code !== 0, true);
    // a save written by the old code (plain objects, no __proto__ keys) still loads
    const old = JSON.stringify(loadShell().S);
    const SQ3 = loadShell();
    SQ3.resetState(Object.assign(SQ3.fresh(), JSON.parse(old)));
    assert.equal(run(SQ3, 'cat ~/readme.txt').code, 0);
    run(SQ3, 'cp readme.txt constructor; echo y > hasOwnProperty'); // clone() and fresh writes keep working
    assert.equal(run(SQ3, 'cat constructor').out.startsWith('Welcome'), true);
  });
  it('cat s | tee $(seq 1 3000) cannot overshoot the state cap by more than 60,000', () => {
    const SQ = loadShell();
    run(SQ, "printf '%0999d' 0 > s");
    const r = fast(SQ, 'cat s | tee $(seq 1 3000) >/dev/null', 8000);
    assert.ok(SQ.stateText(SQ.S.fs) <= SQ.LIM.STATE + 60000, 'state ' + SQ.stateText(SQ.S.fs));
    assert.match(r.out, /grew too large/);
  });
  it('LIM.VAR: a doubling loop stops with a friendly line and the shell stays usable', () => {
    const SQ = loadShell();
    assert.equal(SQ.LIM.VAR, 1000000);
    const r = fast(SQ, 'x=a; for i in $(seq 30); do x=$x$x; done');
    assert.equal(r.out, 'this practice shell stopped the command: a value grew too large');
    assert.equal(run(SQ, 'echo ${#x}').out, String(2 ** 19));
  });
  it('any RangeError maps to the friendly line; Firefox "too much recursion" maps to the nesting message', () => {
    const SQ = loadShell();
    assert.equal(SQ.fatalText(new RangeError('Invalid string length')), 'this practice shell stopped the command: a value grew too large');
    assert.equal(SQ.errOf(new RangeError('Invalid array length')), 'this practice shell stopped the command: a value grew too large');
    assert.equal(SQ.fatalText(new RangeError('Maximum call stack size exceeded')), 'bash: ' + SQ.NEST_DEEP);
    const ff = Object.assign(new Error('too much recursion'), { name: 'InternalError' });
    assert.equal(SQ.fatalText(ff), 'bash: ' + SQ.NEST_DEEP);
    assert.equal(SQ.errOf(ff), 'bash: ' + SQ.NEST_DEEP);
    assert.equal(SQ.isOverflow(ff), true);
  });
  it('a stale write flag does not charge the next line in an over-cap world', () => {
    const SQ = loadShell();
    overCap(SQ);
    SQ.writeFile('/home/explorer/saved.txt', 'hello', false, 'saved.txt'); // what an editor Save does
    assert.ok(SQ.rt.grewBy > 0);
    assert.equal(run(SQ, 'echo hi').out, 'hi');
  });
  it('mv in an over-cap world does not print the cap message', () => {
    const SQ = loadShell();
    run(SQ, 'echo a > a');
    overCap(SQ);
    const r = run(SQ, 'mv a b; echo done');
    assert.equal(r.out, 'done');
  });
  it('small writes in a loop still hit the cap through grewBy', () => {
    const SQ = loadShell();
    run(SQ, "printf '%0999d' 0 > s");
    const r = fast(SQ, 'for i in $(seq 3000); do cp s f$i; done', 8000);
    assert.ok(SQ.stateText(SQ.S.fs) <= SQ.LIM.STATE + 60000);
    assert.match(r.out, /too large/);
  });
});

// Stage 3 Task 4 review: an unquoted expansion that splits into many glob patterns is charged to the step budget and capped.
describe('globbing of split fields', () => {
  const setup = () => {
    const SQ = loadShell();
    run(SQ, 'mkdir d; cd d; for i in $(seq 1000); do touch f$i; done');
    assert.equal(run(SQ, 'ls | wc -l').out, '1000');
    return SQ;
  };
  it('echo $z with 65,536 * fields in a 1,000-file folder stops with the friendly line, quickly', () => {
    const SQ = setup();
    const r = fast(SQ, 'z="* "; for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16; do z=$z$z; done; echo $z');
    assert.match(r.out, /^this practice shell stopped the command: /);
    assert.equal(r.code, 1);
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
  it('the same expansion in a for list stops too', () => {
    const SQ = setup();
    const r = fast(SQ, 'z="* "; for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16; do z=$z$z; done; for f in $z; do :; done');
    assert.match(r.out, /^this practice shell stopped the command: /);
    assert.equal(run(SQ, 'echo ok').out, 'ok');
  });
  it('many globs that match nothing are charged to the step budget', () => {
    const SQ = setup();
    const r = fast(SQ, 'z="q* "; for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16; do z=$z$z; done; echo $z | wc -c');
    assert.equal(r.out, 'this practice shell stopped the command: too many steps');
  });
  it('a few globs over the folder still work', () => {
    const SQ = setup();
    assert.equal(run(SQ, 'z="f1* f2*"; echo $z | wc -w').out, '223');
  });
});
