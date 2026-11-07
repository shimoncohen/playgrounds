import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const main = (body) => `\nfn main() {\n${body}\n}\n`;
const show = (fmt, ...args) => {
  const c = RQ.run(main(`    println!("${fmt}"${args.map((a) => ', ' + a).join('')});`));
  assert.equal(c.status, 'ok', `${fmt} ${args} -> ${c.status} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`);
  return c.out();
};
const f = (x, spec = '') => RQ.std.f64(x, spec);

describe('f64 Display', () => {
  it('prints the shortest digits that read back, never an exponent', () => {
    assert.equal(f(1), '1');
    assert.equal(f(0.1), '0.1');
    assert.equal(f(0.1 + 0.2), '0.30000000000000004');
    assert.equal(f(1.5), '1.5');
    assert.equal(f(100), '100');
    assert.equal(f(1e21), '1000000000000000000000');
    assert.equal(f(1e-7), '0.0000001');
    assert.equal(f(123456789.125), '123456789.125');
    assert.equal(f(5e-324), '0.' + '0'.repeat(323) + '5');
    assert.equal(f(Number.MAX_VALUE), '17976931348623157' + '0'.repeat(292));
  });
  it('NaN, infinities and negative zero', () => {
    assert.equal(f(NaN), 'NaN');
    assert.equal(f(Infinity), 'inf');
    assert.equal(f(-Infinity), '-inf');
    assert.equal(f(-0), '-0');
    assert.equal(f(0), '0');
    assert.equal(f(-2.5), '-2.5');
  });
});

describe('f64 Debug', () => {
  it('keeps a decimal point, and switches to an exponent for very large and very small values', () => {
    assert.equal(f(1, '?'), '1.0');
    assert.equal(f(0.5, '?'), '0.5');
    assert.equal(f(0, '?'), '0.0');
    assert.equal(f(-0, '?'), '-0.0');
    assert.equal(f(1e15, '?'), '1000000000000000.0');
    assert.equal(f(1e16, '?'), '1e16');
    assert.equal(f(1.5e16, '?'), '1.5e16');
    assert.equal(f(0.0001, '?'), '0.0001');
    assert.equal(f(0.00001, '?'), '1e-5');
    assert.equal(f(1.25e-7, '?'), '1.25e-7');
    assert.equal(f(NaN, '?'), 'NaN');
    assert.equal(f(-Infinity, '?'), '-inf');
  });
});

describe('f64 with a precision', () => {
  it('rounds the exact value, ties to even', () => {
    assert.equal(f(3.14159, '.2'), '3.14');
    assert.equal(f(2.5, '.0'), '2');
    assert.equal(f(3.5, '.0'), '4');
    assert.equal(f(0.125, '.2'), '0.12');
    assert.equal(f(0.375, '.2'), '0.38');
    assert.equal(f(0.1, '.20'), '0.10000000000000000555');
    assert.equal(f(2.675, '.2'), '2.67');
    assert.equal(f(1, '.3'), '1.000');
    assert.equal(f(0.999, '.2'), '1.00');
    assert.equal(f(1e21, '.1'), '1000000000000000000000.0');
  });
  it('keeps the sign of values that round to zero, and NaN and inf ignore the precision', () => {
    assert.equal(f(-0.4, '.0'), '-0');
    assert.equal(f(-0, '.1'), '-0.0');
    assert.equal(f(NaN, '.2'), 'NaN');
    assert.equal(f(Infinity, '.2'), 'inf');
  });
});

describe('format specs in println!', () => {
  it('{} {:?} {:.N} {:>N} on the types that support them', () => {
    assert.equal(show('{} {:?} {:.2}', '2.5', '2.5', '2.5'), '2.5 2.5 2.50\n');
    assert.equal(show('[{:>5}] [{:>5}] [{:>5}] [{:>5}]', '42', '"ab"', "'c'", '1.5'), '[   42] [   ab] [    c] [  1.5]\n');
    assert.equal(show('[{:>2}]', '"long"'), '[long]\n');
    assert.equal(show('{:?} {:?} {:?}', '"a\\nb"', "'x'", '5'), '"a\\nb" \'x\' 5\n');
    assert.equal(show('{:?} {:?}', 'true', '()'), 'true ()\n');
  });
  it('by position and by name', () => {
    assert.equal(show('{0:?} {0} {1:.1}', '1.0', '2.25'), '1.0 1 2.2\n');
    assert.equal(show('{x:.2} {x:>6} {x:?}', 'x = 1.0'), '1.00      1 1.0\n');
    const c = RQ.run(main('    let y = 3.14159;\n    println!("{y:.2} {y:?}");'));
    assert.equal(c.out(), '3.14 3.14159\n');
  });
  it('tuples and arrays print with Debug only, nested too', () => {
    assert.equal(show('{:?}', '(1, "a", 2.0, true)'), '(1, "a", 2.0, true)\n');
    assert.equal(show('{:?}', '[[1, 2], [3, 4]]'), '[[1, 2], [3, 4]]\n');
    assert.equal(show('{:?}', '(5,)'), '(5,)\n');
    const c = RQ.run(main('    println!("{}", (1, 2));'));
    assert.equal(c.status, 'unsupported');
    assert.equal(c.unsupported.feature, 'type checking');
  });
  it('any other spec, and a precision on a non-float, stay unsupported', () => {
    for (const spec of ['{:#?}', '{:x}', '{:e}', '{:5}', '{:<5}', '{:05}', '{:+}', '{:.2?}', '{:>5.2}']) {
      const c = RQ.run(main(`    println!("${spec}", 1.5);`));
      assert.equal(c.status, 'unsupported', spec);
      assert.equal(c.unsupported.feature, 'format spec', spec);
    }
    for (const arg of ['1', '"ab"', "'c'", 'true']) {
      const c = RQ.run(main(`    println!("{:.1}", ${arg});`));
      assert.equal(c.status, 'unsupported', arg);
      assert.equal(c.unsupported.feature, 'format spec', arg);
    }
  });
  it('parseFormat reads the spec of each hole', () => {
    const p = RQ.std.parseFormat('{:?} {0:.3} {n:>4} {}');
    assert.equal(p.error, null);
    assert.equal(p.spec, false);
    assert.equal(JSON.stringify(p.parts.filter((x) => x.lit === undefined).map((x) => [x.idx ?? x.name, x.fmt.debug, x.fmt.prec, x.fmt.width])),
      JSON.stringify([[0, true, null, null], [0, false, 3, null], ['n', false, null, 4], [1, false, null, null]]));
    assert.equal(RQ.std.parseFormat('{:#?}').spec, true);
  });
});
