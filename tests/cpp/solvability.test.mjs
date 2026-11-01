// C++ Quest: every mission is solvable by its own answer, and its check is not fooled by the starter, an empty program,
// or (for keep:true missions) the code carried over from the previous mission.
// A mission's `test:` array is the keyboard input it runs with; the app never reads it, only this file does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../content-loader.mjs';

const { CPP, CH, P, makeCtx } = loadContent('cpp-quest', { parts: [[null, '(()=>{\nconst KEY=']], returns: ['CPP', 'CH', 'P', 'makeCtx'], mustInclude: ['function makeCtx(', 'const CH=['] });

const missions = [];
CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => missions.push({ ci, mi, m, prev: mi > 0 ? ch.missions[mi - 1] : null, id: `${ci}.${mi} ${m.title}` })));
const answerOf = m => m.ans ?? m.start;
const inputsOf = m => (m.test ? [...m.test] : null);

const GUESS = 'Game: Guess the Number', RPS = 'Mini game: Rock, Paper, Scissors';
const byTitle = t => { const x = missions.filter(e => e.m.title === t); assert.equal(x.length, 1, `mission renamed or duplicated: ${t}`); return x[0]; };
const usesStepDepth = m => m.check.toString().includes('stepDepth');

function ctxOf(src, inputs, stepDepth = 0) {
  const c = CPP.compile(src);
  const r = CPP.runAll(src, inputs);
  return makeCtx({ ok: r.ok, out: r.out, src, warnings: r.warnings, info: r.info, prog: c.prog, stepDepth });
}
const passes = (m, src, inputs) => { try { return !!m.check(ctxOf(src, inputs)); } catch { return false; } };

// The step-depth mission only passes in step mode, which records the deepest call stack seen (advance() in app.js).
function stepCtx(src, inputs) {
  const c = CPP.compile(src);
  assert.ok(c.ok, 'does not compile');
  let out = '';
  const warnings = [...c.warnings];
  const M = CPP.Machine(c.prog, { out: s => { out += s; }, warn: w => warnings.push(w), limit: 200000, noInput: !inputs });
  const ins = [...(inputs || [])];
  let stepDepth = 1, arg, r;
  for (;;) {
    r = M.next(arg); arg = undefined;
    if (r.done) break;
    if (r.input) { assert.ok(ins.length, 'ran out of input'); arg = ins.shift(); continue; }
    stepDepth = Math.max(stepDepth, M.depth);
  }
  return makeCtx({ ok: true, out, src, warnings, info: M.info(), prog: c.prog, stepDepth });
}

// The secret is random: binary search driven only by the program's own "Too high!" / "Too low!" lines.
function playGuessingGame(src) {
  const c = CPP.compile(src);
  assert.ok(c.ok, 'does not compile');
  let out = '';
  const warnings = [...c.warnings];
  const M = CPP.Machine(c.prog, { out: s => { out += s; }, warn: w => warnings.push(w), limit: 200000 });
  let lo = 1, hi = 100, guess = 0, guesses = 0, seen = -1, arg, r;
  for (;;) {
    r = M.next(arg); arg = undefined;
    if (r.done) break;
    if (!r.input) continue;
    const hiAt = out.lastIndexOf('Too high!'), loAt = out.lastIndexOf('Too low!');
    if (Math.max(hiAt, loAt) > seen) {
      seen = Math.max(hiAt, loAt);
      if (hiAt > loAt) hi = guess - 1; else lo = guess + 1;
    }
    assert.ok(guesses < 20 && lo <= hi, `guessing game did not converge; output so far:\n${out}`);
    guess = Math.floor((lo + hi) / 2);
    guesses++;
    arg = String(guess);
  }
  const ctx = makeCtx({ ok: true, out, src, warnings, info: M.info(), prog: c.prog, stepDepth: 1 });
  return { ctx, out, guesses };
}

test('every mission whose reference answer reads input has a test: array', () => {
  const bad = missions.filter(({ m }) => /\bcin\s*>>|\bgetline\s*\(/.test(answerOf(m)) && !(m.test && m.test.length)).map(e => e.id);
  assert.deepEqual(bad, []);
});

for (const { id, m, prev } of missions) {
  const isGuess = m.title === GUESS;
  if (!isGuess) {
    test(`${id}: the reference answer passes`, () => {
      const inputs = inputsOf(m);
      const ctx = usesStepDepth(m) ? stepCtx(answerOf(m), inputs) : ctxOf(answerOf(m), inputs);
      assert.equal(!!m.check(ctx), true, `out was:\n${ctx.out}`);
    });
  }
  // Mission 0's answer is its starter, so the starter probe does not apply.
  if (m.ans !== undefined && m.ans !== m.start) {
    test(`${id}: the starter code does not pass`, () => {
      assert.equal(passes(m, m.start, inputsOf(m)), false);
    });
  }
  test(`${id}: an empty program does not pass`, () => {
    assert.equal(passes(m, P(''), inputsOf(m)), false);
  });
  if (m.keep) {
    test(`${id}: the code carried over from the previous mission does not pass`, () => {
      assert.ok(prev, 'a keep mission is never the first of its chapter');
      assert.equal(passes(m, answerOf(prev), inputsOf(m) ?? inputsOf(prev)), false);
    });
  }
}

// srand(time(0)) seeds from whole seconds, so runs in one test would share a secret: give each run its own clock.
function withClock(i, fn) {
  const real = Date.now;
  Date.now = () => 1_700_000_000_000 + i * 7_919_000;
  try { return fn(); } finally { Date.now = real; }
}

test('Guess the Number: a binary-search player wins in at most 7 tries, whatever the secret', () => {
  const { m } = byTitle(GUESS);
  let allOut = '';
  for (let i = 0; i < 30; i++) {
    const { ctx, out, guesses } = withClock(i, () => playGuessingGame(answerOf(m)));
    allOut += out;
    assert.equal(!!m.check(ctx), true, `check failed; out was:\n${out}`);
    const won = /You got it in (\d+) tries!\s*$/.exec(out);
    assert.ok(won, `no win line; out was:\n${out}`);
    assert.equal(Number(won[1]), guesses);
    assert.ok(guesses <= 7, `took ${guesses} tries`);
  }
  assert.match(allOut, /Too high!/);
  assert.match(allOut, /Too low!/);
});

// Diagnostic cross-check only: 1..100 reaches any secret, so the binary-search test above is the acceptance test.
test('Guess the Number: a sweep through 1..100 also reaches the secret', () => {
  const { m } = byTitle(GUESS);
  assert.equal(passes(m, answerOf(m), inputsOf(m)), true);
});

test('Rock, Paper, Scissors: the random result never fails the check', () => {
  const { m } = byTitle(RPS);
  let allOut = '';
  for (let i = 0; i < 30; i++) {
    const ctx = withClock(i, () => ctxOf(answerOf(m), inputsOf(m)));
    allOut += ctx.out;
    assert.equal(!!m.check(ctx), true, `out was:\n${ctx.out}`);
  }
  for (const verdict of [/You win!/, /You lose!/, /It's a tie!/]) assert.match(allOut, verdict);
});
