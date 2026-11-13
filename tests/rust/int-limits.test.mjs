import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const main = (body, items = '') => `${items}\nfn main() {\n${body}\n}\n`;
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', `${src} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`); return c.stdout; };
const lint = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', `${src} ${JSON.stringify(c.unsupported)}`); const e = c.errors[0]; return `${e.line}:${e.col} ${e.lint}`; };
const panic = (src) => { const c = RQ.run(src); assert.equal(c.status, 'panic', src); return `${c.panic.line}:${c.panic.col} ${c.panic.msg}`; };

describe('MIN and MAX of a whole-number type', () => {
  it('print the smallest and largest value of each type', () => {
    assert.equal(out(main('    println!("{} {} {} {}", i32::MIN, i32::MAX, u8::MAX, i64::MIN);')), '-2147483648 2147483647 255 -9223372036854775808\n');
    assert.equal(out(main('    println!("{} {} {} {}", u8::MIN, u32::MAX, usize::MAX, isize::MIN);')), '0 4294967295 18446744073709551615 -9223372036854775808\n');
    assert.equal(out(main('    println!("{} {}", i8::MIN, i16::MAX);')), '-128 32767\n');
  });

  it('work as a start value for a running minimum and maximum, in a const and in a cast', () => {
    assert.equal(out(main('    let mut lo = i32::MAX;\n    let mut hi = i32::MIN;\n    for x in [3, -1, 7] {\n        if x < lo { lo = x; }\n        if x > hi { hi = x; }\n    }\n    println!("{} {}", lo, hi);')), '-1 7\n');
    assert.equal(out(main('    println!("{}", LIMIT);', 'const LIMIT: u8 = u8::MAX;')), '255\n');
    assert.equal(out(main('    println!("{}", u8::MAX as u32 + 1);')), '256\n');
  });

  it('feed the overflow lint when the value is known, and the run-time panic when it is a parameter', () => {
    assert.equal(lint(main('    let x = i32::MAX;\n    let y = x + 1;\n    println!("{}", y);')), '4:13 arithmetic_overflow');
    assert.equal(lint(main('    println!("{}", u8::MAX + 1);')), '3:20 arithmetic_overflow');
    assert.equal(lint(main('    let x = i32::MIN;\n    println!("{}", -x);')), '4:20 arithmetic_overflow');
    assert.equal(panic(main('    println!("{}", f(i32::MAX));', 'fn f(x: i32) -> i32 { x + 1 }')), '1:23 attempt to add with overflow');
    assert.equal(panic(main('    println!("{}", f(i32::MIN));', 'fn f(x: i32) -> i32 { -x }')), '1:23 attempt to negate with overflow');
  });

  it('a type that is not modeled, or a path that is not a limit, stays unsupported', () => {
    for (const body of ['    println!("{}", i128::MAX);', '    println!("{}", f64::MAX);', '    println!("{}", u8::BITS);', '    println!("{}", std::i32::MAX);']) {
      const c = RQ.run(main(body));
      assert.equal(c.status, 'unsupported', body);
    }
  });
});

describe('MIN / -1 and MIN % -1', () => {
  const div = (n, op = '/', ty = 'i32') => main(`    let n: ${ty} = ${n};\n    println!("{}", ${ty}::MIN ${op} n);`);
  it('are the unconditional_panic lint when both sides are known: a literal, a let, a mutated variable', () => {
    assert.equal(lint(div(-1)), '4:20 unconditional_panic');
    assert.equal(lint(div(-1, '%')), '4:20 unconditional_panic');
    assert.equal(lint(div(-1, '/', 'i8')), '4:20 unconditional_panic');
    assert.equal(lint(main('    println!("{}", i32::MIN / -1);')), '3:20 unconditional_panic');
    assert.equal(lint(main('    let x = i32::MIN;\n    let n: i32 = -1;\n    println!("{}", x % n);')), '5:20 unconditional_panic');
    assert.equal(lint(main('    let mut n: i32 = 1;\n    n = -1;\n    println!("{}", i32::MIN / n);')), '5:20 unconditional_panic');
    assert.equal(lint(main('    let n = -1i64;\n    let v = i64::MIN;\n    let r = v / n;\n    println!("{}", r);')), '5:13 unconditional_panic');
  });

  it('name the type and the operator in the lint message', () => {
    const c = RQ.run(div(-1, '%', 'i64'));
    assert.match(c.errors[0].msg, /attempt to compute `i64::MIN % -1_i64`, which would overflow/);
  });

  it('are a run-time panic when either side comes from a parameter', () => {
    assert.equal(panic(main('    println!("{}", f(-1));', 'fn f(n: i32) -> i32 { i32::MIN / n }')), '1:23 attempt to divide with overflow');
    assert.equal(panic(main('    println!("{}", f(-1));', 'fn f(n: i32) -> i32 { i32::MIN % n }')), '1:23 attempt to calculate the remainder with overflow');
    assert.equal(panic(main('    println!("{}", f(i32::MIN, -1));', 'fn f(x: i32, n: i32) -> i32 { x / n }')), '1:31 attempt to divide with overflow');
  });

  it('are fine for any other divisor and for unsigned types', () => {
    assert.equal(out(main('    let n: i32 = 3;\n    println!("{}", i32::MIN / n);')), '-715827882\n');
    assert.equal(out(main('    println!("{}", i32::MIN / 2);')), '-1073741824\n');
    assert.equal(out(main('    println!("{}", u8::MAX / 5);')), '51\n');
  });
});
