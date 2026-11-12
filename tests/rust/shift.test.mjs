import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// Programs with one verdict each are corpus entries (shift-*); this file covers the values, panic places and what stays unsupported.
const RQ = loadRust();
const main = (body, pre = '') => `${pre}fn main() {\n    ${body.split('\n').join('\n    ')}\n}\n`;
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', src); return c.stdout; };
const ids = (src) => Array.from(RQ.run(src).errors, (e) => `${e.code || e.lint}@${e.line}`);

describe('<< and >>', () => {
  it('keep the type of the left side, take any integer type as the amount and drop the bits shifted out', () => {
    assert.equal(out(main('println!("{} {} {} {}", 1 << 3, 255u8 << 1, 1i32 << 31, 1u64 << 63);')), '8 254 -2147483648 9223372036854775808\n');
    assert.equal(out(main('let n: u32 = 3;\nlet m: i64 = 2;\nprintln!("{} {} {}", 5u8 << n, 1i32 << m, 200u8 >> n);')), '40 4 25\n');
    assert.equal(out(main('let x: i64 = 1 << 40;\nprintln!("{}", x);')), '1099511627776\n');
  });

  it('>> on a signed number keeps the sign, and the precedence is below + and above & and comparisons', () => {
    assert.equal(out(main('println!("{} {} {}", -8 >> 1, -1i32 >> 31, -16i8 >> 2);')), '-4 -1 -4\n');
    assert.equal(out(main('println!("{} {} {}", 1 + 2 << 3, 1 << 2 + 3, 6 & 3 << 1);')), '24 32 6\n');
    assert.equal(out(main('let a = 5;\nprintln!("{} {}", a << 1 > 8, a >> 1 == 2);')), 'true true\n');
  });

  it('<<= and >>= change a variable or an element', () => {
    assert.equal(out(main('let mut a = 1;\na <<= 4;\nlet mut v = [1u8, 2];\nv[1] >>= 1;\nprintln!("{} {:?}", a, v);')), '16 [1, 1]\n');
  });
});

describe('a shift by too much', () => {
  const PANIC = (what) => `attempt to shift ${what} with overflow`;
  it('is a panic at run time, at the whole expression, for the width and for a negative amount', () => {
    const at = (src) => { const c = RQ.run(src); assert.equal(c.status, 'panic', src); return [c.panic.msg, c.panic.line, c.panic.col]; };
    assert.deepEqual(at('fn sh(x: i32, n: u32) -> i32 {\n    x << n\n}\n\n' + main('sh(1, 32);')), [PANIC('left'), 2, 5]);
    assert.deepEqual(at('fn sh(x: i32, n: i32) -> i32 {\n    x >> n\n}\n\n' + main('sh(1, -1);')), [PANIC('right'), 2, 5]);
    assert.deepEqual(at('fn go(n: u32) {\n    let mut a = 1;\n    a <<= n;\n}\n\n' + main('go(32);')), [PANIC('left'), 3, 5]);
    assert.deepEqual(at(main('for i in 0..9 {\nprintln!("{}", 1u8 << i);\n}')), [PANIC('left'), 3, 20]);
  });

  it('is arithmetic_overflow when the amount is known, even if the value shifted is not', () => {
    assert.deepEqual(ids(main('println!("{}", 1u8 << 8);')), ['arithmetic_overflow@2']);
    assert.deepEqual(ids(main('let n = 40;\nlet x: i32 = 1;\nprintln!("{}", x << n);')), ['arithmetic_overflow@4']);
    assert.deepEqual(ids('fn f(x: i32) -> i32 {\n    x >> -1\n}\n\n' + main('f(1);')), ['arithmetic_overflow@2']);
    assert.deepEqual(ids(main('let mut a = 1;\na <<= 33;\nprintln!("{}", a);')), ['arithmetic_overflow@3']);
    assert.deepEqual(ids('fn f(n: u32) -> i32 {\n    1 << n\n}\n\n' + main('f(33);')), []);
  });
});

describe('what a shift cannot be applied to', () => {
  it('a decimal number, a bool or a char on the left is E0369', () => {
    for (const e of ['1.0 << 2', 'true << 1', "'a' << 1"]) assert.deepEqual(ids(main(`let x = ${e};`)), ['E0369@2'], e);
  });

  it('a shift through a reference, or by a decimal number, stays unsupported', () => {
    for (const body of ['let a = [1, 2];\nfor x in &a {\nprintln!("{}", x << 1);\n}', 'let x = 1 << 2.0;']) {
      const c = RQ.run(main(body));
      assert.equal(c.status, 'unsupported', body);
      assert.equal(c.unsupported.feature, 'type checking');
    }
  });
});

describe('a shift after a cast', () => {
  it('`as T <<` is a parse error, as rustc reads the `<<` as generic arguments of the type', () => {
    for (const e of ['x as u32 << 1', 'x as u64 << 1 >> 1', '2 + x as u32 << 1']) {
      const c = RQ.run(main(`let x = 1u8;\nlet y = ${e};`));
      assert.equal(c.status, 'error', e);
      assert.match(c.errors[0].msg, /^`<<` is interpreted as a start of generic arguments for `u\d+`, not a shift$/);
      assert.deepEqual([c.errors[0].line, c.errors[0].col], [3, 13 + e.indexOf('<<')], e);
    }
  });

  it('a cast in parentheses can be shifted, and >> <= > after a cast are not generic arguments', () => {
    assert.equal(out(main('let x = 1u8;\nprintln!("{} {} {} {}", (x as u32) << 1, x as u32 >> 1, x as u32 <= 1, x as u32 > 1);')), '2 0 true false\n');
  });
});

describe('a compound operator through a reference', () => {
  it('is linted like one on a variable when only the amount or the divisor matters', () => {
    const via = (op, n) => main(`let mut a = 1u8;\nlet r = &mut a;\n*r ${op} ${n};\nprintln!("{}", a);`);
    assert.deepEqual(ids(via('<<=', 8)), ['arithmetic_overflow@4']);
    assert.deepEqual(ids(via('>>=', 9)), ['arithmetic_overflow@4']);
    assert.deepEqual(ids(via('/=', 0)), ['unconditional_panic@4']);
    assert.deepEqual(ids(via('%=', 0)), ['unconditional_panic@4']);
    assert.deepEqual(ids('fn f(r: &mut u8) {\n    *r <<= 8;\n}\n\n' + main('let mut a = 1u8;\nf(&mut a);')), ['arithmetic_overflow@2']);
    assert.deepEqual(ids(via('<<=', 7)), []);
  });

  it('+= -= *= through a reference are not folded, so they panic at run time', () => {
    for (const [op, n, msg] of [['+=', 255, 'attempt to add with overflow'], ['*=', 3, 'attempt to multiply with overflow'], ['-=', 6, 'attempt to subtract with overflow']]) {
      const c = RQ.run(main(`let mut a = ${op === '*=' ? 100 : 5}u8;\nlet r = &mut a;\n*r ${op} ${op === '+=' ? 255 : n};`));
      assert.equal(c.status, 'panic', op);
      assert.equal(c.panic.msg, msg);
    }
  });
});

