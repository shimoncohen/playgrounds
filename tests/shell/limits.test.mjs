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
      const r = fast(SQ, `sed 's/${pat}/x/' h.txt`, 1000);
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
