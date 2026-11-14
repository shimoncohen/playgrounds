import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const main = (body, items = '') => `${items}fn main() {\n${body}\n}\n`;
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', `${src} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`); return c.stdout; };
const err = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', `${src} ${JSON.stringify(c.unsupported)}`); const e = c.errors; assert.equal(e.length, 1, JSON.stringify(e)); return `${e[0].line}:${e[0].col} ${e[0].code}`; };
const STD = '/rustc/58cf8f9c35b355199727627d07ae34a4e2846d67/library/core/src/num/mod.rs';
const panic = (src) => { const c = RQ.run(src); assert.equal(c.status, 'panic', src); return `${c.panic.line}:${c.panic.col} ${c.panic.msg} | ${c.stderr}`; };

describe('whole-number methods', () => {
  it('abs, pow, min and max', () => {
    assert.equal(out(main('    let a: i32 = -5;\n    let b: i32 = 7;\n    println!("{} {} {} {}", a.abs(), (a - b).abs(), a.pow(2), 2u64.pow(40));\n    println!("{} {} {}", a.min(b), a.max(b), a.max(0).min(3));')), '5 12 25 1099511627776\n-5 7 0\n');
    assert.equal(out(main('    let a = 3;\n    let b = 9;\n    println!("{} {}", a.min(b), a.max(b));')), '3 9\n');
    assert.equal(out(main('    let v: Vec<i32> = vec![3, 9, 2];\n    let mut best = i32::MIN;\n    for &x in &v {\n        best = best.max(x);\n    }\n    let lo = v.iter().fold(i32::MAX, |m, x| m.min(*x));\n    println!("{} {}", best, lo);')), '9 2\n');
  });

  it('abs and pow work through a closure parameter, which is a reference', () => {
    assert.equal(out(main('    let v: Vec<i32> = vec![3, -9, 2];\n    let s: Vec<i32> = v.iter().map(|x| x.abs()).collect();\n    let t: i32 = v.iter().map(|&x| x.pow(2)).sum();\n    let m = v.iter().min_by_key(|x| x.abs()).unwrap();\n    println!("{:?} {} {}", s, t, m);')), '[3, 9, 2] 94 2\n');
  });

  it('checked, wrapping and saturating arithmetic, and abs_diff', () => {
    assert.equal(out(main('    let a: u8 = 250;\n    println!("{:?} {:?} {} {}", a.checked_add(5), a.checked_add(6), a.wrapping_add(10), a.saturating_add(10));\n    let h: u32 = 5;\n    println!("{:?} {} {} {:?}", h.checked_sub(9), h.saturating_sub(9), h.wrapping_sub(9), h.checked_mul(3));\n    println!("{} {} {}", 10u32.abs_diff(3), (-5i32).abs_diff(i32::MAX), (-128i8).wrapping_mul(-1));')), 'Some(255) None 4 255\nNone 0 4294967292 Some(15)\n7 2147483652 -128\n');
    assert.equal(out(main('    let a: u8 = 250;\n    match a.checked_add(10) {\n        Some(v) => println!("sum {}", v),\n        None => println!("overflow"),\n    }')), 'overflow\n');
  });

  it('abs of the smallest value and an overflowing pow panic inside core, at the line rustc names for the type', () => {
    assert.equal(panic(main('    println!("{}", f(i32::MIN));', 'fn f(x: i32) -> i32 { x.abs() }\n')), `1:25 attempt to negate with overflow | \nthread 'main' panicked at ${STD}:429:5:\nattempt to negate with overflow\n`);
    assert.equal(panic(main('    let n: u8 = 16;\n    println!("{}", n.pow(2));')), `3:22 attempt to exponentiate with overflow | \nthread 'main' panicked at ${STD}:586:5:\nattempt to exponentiate with overflow\n`);
    assert.ok(panic(main('    println!("{}", f(10, 20));', 'fn f(x: i64, y: u32) -> i64 { x.pow(y) }\n')).endsWith(`panicked at ${STD}:454:5:\nattempt to exponentiate with overflow\n`));
    assert.equal(out(main('    println!("{} {} {}", f(-2, 31), f(1, 4000000000), f(-1, 4000000001));', 'fn f(x: i32, y: u32) -> i32 { x.pow(y) }\n')), '-2147483648 1 -1\n');
  });

  it('there is no lint for them: a known operand is still a run-time panic', () => {
    assert.equal(RQ.run(main('    println!("{}", 10i32.pow(10));')).status, 'panic');
    assert.equal(RQ.run(main('    println!("{}", i32::MIN.abs());')).status, 'panic');
  });

  it('a number whose type is still open cannot call abs or pow (E0689), but takes min and max', () => {
    assert.equal(err(main('    let a = -3;\n    println!("{}", a.abs());')), '3:22 E0689');
    assert.equal(err(main('    let a = 3;\n    println!("{}", a.pow(2));')), '3:22 E0689');
    assert.equal(err(main('    println!("{}", 2.pow(3));')), '2:22 E0689');
    assert.equal(err(main('    let a = 3;\n    println!("{:?}", a.checked_add(2));')), '3:24 E0689');
    assert.equal(out(main('    let a = 3;\n    let b: i32 = a;\n    println!("{}", a.pow(2) + b);')), '12\n');
    assert.equal(err(main('    let a = 3;\n    let c = a.pow(2);\n    let b: i32 = a;\n    println!("{} {}", c, b);')), '3:15 E0689');
    assert.equal(out(main('    let a = 3;\n    println!("{}", a.min(2));')), '2\n');
  });

  it('abs needs a signed type, and the argument types are checked', () => {
    assert.equal(err(main('    let a: u32 = 3;\n    println!("{}", a.abs());')), '3:22 E0599');
    assert.equal(err(main('    let a: i32 = 3;\n    let n: i32 = 2;\n    println!("{}", a.pow(n));')), '4:26 E0308');
    assert.equal(err(main('    let a: i32 = 3;\n    let b: i64 = 4;\n    println!("{}", a.min(b));')), '4:26 E0308');
  });

  it('what is not modeled stays unsupported', () => {
    for (const body of ['    let a: i32 = -3;\n    println!("{}", a.signum());', '    let a: f64 = -3.5;\n    println!("{}", a.abs());', '    let a: i32 = 3;\n    println!("{}", a.abs(1));']) {
      assert.equal(RQ.run(main(body)).status, 'unsupported', body);
    }
  });
});
