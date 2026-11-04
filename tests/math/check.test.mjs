import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMath } from './harness.mjs';

const MQ = loadMath(['../math-quest/vendor/mathjs/math.js', 'rng.js', 'input/mathjs-setup.js', 'input/check.js']);
const C = MQ.check;
const plain = x => JSON.parse(JSON.stringify(x));
const oks = r => plain(r).map(s => s.ok);

test('rng is repeatable for a seed', () => {
  const take = () => { const r = MQ.rng(1); return [r(), r(), r(), r(), r()]; };
  const a = take();
  assert.deepEqual(a, take());
  assert.ok(a.every(v => v >= 0 && v < 1));
  assert.notDeepEqual(a, (() => { const r = MQ.rng(2); return [r(), r(), r(), r(), r()]; })());
});

test('number: value, exact fractions', () => {
  assert.equal(C.number('3/4', 0.75).ok, true);
  const dec = C.number('0.75', '3/4', { exact: true });
  assert.equal(dec.ok, false);
  assert.match(dec.why, /fraction/);
  assert.equal(C.number('1/3*3', 1, { exact: true }).ok, true);
  assert.equal(C.number('2/3', 0.75).ok, false);
  assert.equal(C.number('1/0', 1).ok, false);
  assert.equal(C.number('2+', 1).ok, false);
  assert.ok(C.number('2+', 1).why);
});

test('expr: seeded equivalence, skipped points and form rules', () => {
  assert.equal(C.expr('(x-1)(x+1)', 'x^2-1').ok, true);
  assert.equal(C.expr('x^2+1', 'x^2-1').ok, false);
  assert.equal(C.expr('(x^2-1)/(x-1)', 'x+1').ok, true);
  const lazy = C.expr('(x^2-1)/(x-1)', 'x+1', { form: 'noDivision' });
  assert.equal(lazy.ok, false);
  assert.ok(lazy.why);
  assert.equal(C.expr('x+1', 'x+1', { form: 'noDivision' }).ok, true);
  assert.equal(C.expr('1/0', '1').ok, false);
  assert.equal(C.expr('sqrt(x)-sqrt(x)', '0').ok, false, 'fewer than 12 valid points');
  assert.equal(C.expr('2a+3b', '3b+2a', { vars: ['a', 'b'] }).ok, true);
  assert.equal(C.expr('(x+', 'x').ok, false);
});

test('form rules read the parse tree', () => {
  const p = s => MQ.math.full.parse(s);
  assert.equal(C.forms.noDivision(p('x/2')), false);
  assert.equal(C.forms.noDivision(p('x*2')), true);
  assert.equal(C.forms.product(p('5a')), true);
  assert.equal(C.forms.product(p('2a+3a')), false);
  assert.equal(C.forms.linearFactors(p('(x-1)(x+1)')), true);
  assert.equal(C.forms.linearFactors(p('x^2-1')), false);
  assert.equal(C.expr('5a', '2a+3a', { vars: ['a'], form: 'product' }).ok, true);
  assert.equal(C.expr('2a+3a', '2a+3a', { vars: ['a'], form: 'product' }).ok, false);
});

test('expanded: no bracket left around a sum', () => {
  const p = s => MQ.math.full.parse(s);
  for (const s of ['3x+6', 'x^2+4x+3', '-x-2', 'x^2', '2x*3', '6']) assert.equal(C.forms.expanded(p(s)), true, s);
  for (const s of ['3(x+2)', '(x+1)(x+3)', '-(x+2)', '(x+1)^2', '(x+1)/2', '2(x-1)+3']) assert.equal(C.forms.expanded(p(s)), false, s);
  assert.equal(C.expr('3x+6', '3(x+2)', { form: 'expanded' }).ok, true);
  assert.match(C.expr('3(x+2)', '3(x+2)', { form: 'expanded' }).why, /brackets/);
});

test('final-line checks: one number, one fraction, x = number', () => {
  const F = C.final;
  assert.equal(F.number(6)('6').ok, true);
  assert.equal(F.number(-4)('-4').ok, true);
  assert.match(F.number(6)('2+4').why, /one number/);
  assert.equal(F.number(6)('5').ok, false);

  assert.equal(F.fraction('3/4')('3/4').ok, true);
  assert.equal(F.fraction('3/4')('6/8').ok, false);
  assert.match(F.fraction('3/4')('6/8').why, /simplest/);
  assert.equal(F.fraction('3/4', { lowest: false })('6/8').ok, true);
  assert.equal(F.fraction('-1/2')('-1/2').ok, true);
  assert.equal(F.fraction('2')('2').ok, true);
  assert.match(F.fraction('3/4')('0.75').why, /fraction/);
  assert.match(F.fraction('3/4')('1/2+1/4').why, /one fraction/);

  assert.equal(F.solved(4)('x = 4').ok, true);
  assert.equal(F.solved(4)('4=x').ok, true);
  assert.equal(F.solved('7/2')('x=7/2').ok, true);
  assert.equal(F.solved(4)('x=5').ok, false);
  assert.match(F.solved(4)('2x=8').why, /x = /);
  assert.equal(F.solved(3, 'y')('y=3').ok, true);
});

test('number steps are each checked against the original', () => {
  const q = '1*2-3*2+10/(2-1)';
  assert.deepEqual(oks(C.steps(q, ['1*2-3*2+10/1', '2-6+10', '6'], { kind: 'number' })), [true, true, true]);
  const r = plain(C.steps(q, ['2-6+1', '6'], { kind: 'number' }));
  assert.deepEqual(r.map(s => s.ok), [false, true]);
  assert.equal(r[0].why, 'This works out to −3, but it should come to the same value as the question.');
  assert.equal(plain(C.steps('1/2', ['1/3'], { kind: 'number' }))[0].why, 'This works out to 1/3, but it should come to the same value as the question.');
  assert.match(C.expr('x-5', 'x').why, /yours gives −3, the original gives 2\./);
  assert.deepEqual(oks(C.steps('x^2+2x+1', ['(x+1)^2', 'x^2+1', '(x+1)(x+1)'], { kind: 'expr' })), [true, false, true]);
});

test('a degree sign is read as part of the number, in steps and in the preview', () => {
  assert.deepEqual(oks(C.steps('180-47', ['180°-47°', '133°', '133 °', '133'], { kind: 'number' })), [true, true, true, true]);
  assert.equal(C.steps('180-47', ['134°'], { kind: 'number' })[0].ok, false);
  assert.equal(C.tex('180°-47°'), C.tex('180-47'));
  assert.equal(C.final.number(133)('133°').ok, false, 'final.number itself still wants a bare number');
});

test('equation steps: same solutions as the original', () => {
  assert.deepEqual(oks(C.steps('2x+4=10', ['2x=6', 'x=3'], { kind: 'equation' })), [true, true]);
  const slip = plain(C.steps('2x+4=10', ['2x=14', 'x=3'], { kind: 'equation' }));
  assert.deepEqual(slip.map(s => s.ok), [false, true]);
  assert.match(slip[0].why, /different solutions/);
  assert.deepEqual(oks(C.steps('x^3=27', ['x=3'], { kind: 'equation' })), [true], 'same real solutions pass the grid check');
  assert.deepEqual(oks(C.steps('1/x=1', ['1=x'], { kind: 'equation' })), [true], 'a pole is not a root');
  const lose = plain(C.steps('x^2=x', ['x=1'], { kind: 'equation' }))[0];
  assert.equal(lose.ok, false);
  assert.match(lose.why, /loses a solution/);
  const gain = plain(C.steps('x=2', ['x^2=4'], { kind: 'equation' }))[0];
  assert.equal(gain.ok, false);
  assert.match(gain.why, /adds a solution/);
  assert.deepEqual(oks(C.steps('x^2=4', ['(x-2)(x+2)=0', 'x^2-4=0'], { kind: 'equation' })), [true, true]);
  const bad = plain(C.steps('2x+4=10', ['2x+4', '2x=', 'x=1/0'], { kind: 'equation' }));
  assert.deepEqual(bad.map(s => s.ok), [false, false, false]);
  assert.ok(bad.every(s => s.why));
});

test('the safe instance refuses the dangerous functions; the full one keeps them', () => {
  assert.throws(() => MQ.math.safe.evaluate('import({})'));
  assert.throws(() => MQ.math.safe.evaluate('parse("1")'));
  assert.throws(() => MQ.math.safe.evaluate('createUnit("foo")'));
  assert.throws(() => MQ.math.safe.evaluate('evaluate("1")'));
  assert.equal(MQ.math.safe.evaluate('1/3*3').toString(), '1');
  assert.equal(MQ.math.full.derivative('x^2', 'x').toString(), '2 * x');
});

test('tex drops brackets the layout already shows', () => {
  assert.equal(C.tex('10/(2-1)'), '\\frac{10}{2-1}');
  assert.equal(C.tex('2x=6'), '2 x = 6');
});

test('translate rewrites MathLive ascii-math for math.js', () => {
  assert.equal(C.translate('|x-3|'), 'abs(x-3)');
  assert.equal(C.translate('log _2(x)'), 'log(x, 2)');
  assert.equal(C.expr(C.translate('2 x^2+3 x-5'), '2x^2+3x-5').ok, true);
  assert.equal(C.expr(C.translate('2 * x'), '2x').ok, true);
  assert.equal(C.translate('(10)/((2-1))'), '10/(2-1)');
  assert.equal(C.translate('(3)/(4)+(1)/(6)'), '3/4+1/6');
  assert.equal(C.translate('e^((2 x))'), 'e^(2 x)');
  assert.equal(C.translate('sin (x)^2+cos (x)^2'), 'sin (x)^2+cos (x)^2');
  assert.equal(C.translate('2(3)'), '2(3)');
  assert.equal(C.translate('pi * r^2'), 'pi*r^2');
});
