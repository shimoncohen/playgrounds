import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const main = (body, items = '') => `${items}\nfn main() {\n${body}\n}\n`;
const panic = (body, items, opts) => { const c = RQ.run(main(body, items), opts); assert.equal(c.status, 'panic', `${body} -> ${c.status} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`); return c; };

describe('runtime panics', () => {
  it('overflow in a call gives status panic, exit 101, the header and the messages so far', () => {
    const c = panic('    println!("before");\n    println!("{}", add(250, 10));', 'fn add(a: u8, b: u8) -> u8 { a + b }');
    assert.equal(c.exit, 101);
    assert.equal(c.stdout, 'before\n');
    assert.equal(JSON.stringify(c.panic), JSON.stringify({ msg: 'attempt to add with overflow', line: 1, col: 30 }));
    assert.equal(c.stderr, "\nthread 'main' panicked at src/main.rs:1:30:\nattempt to add with overflow\n");
    assert.equal(c.compiles(), true);
    assert.equal(c.errors.length, 0);
  });
  it('earlier eprintln output stays before the header', () => {
    const c = panic('    eprintln!("warn");\n    println!("{}", add(250, 10));', 'fn add(a: u8, b: u8) -> u8 { a + b }');
    assert.match(c.stderr, /^warn\n\nthread 'main' panicked at /);
  });
  it('each operation has its own message', () => {
    const msg = (op, a, b, ty = 'u8') => panic(`    println!("{}", f(${a}, ${b}));`, `fn f(a: ${ty}, b: ${ty}) -> ${ty} { a ${op} b }`).panic.msg;
    assert.equal(msg('+', 250, 10), 'attempt to add with overflow');
    assert.equal(msg('-', 1, 2), 'attempt to subtract with overflow');
    assert.equal(msg('*', 20, 20), 'attempt to multiply with overflow');
    assert.equal(msg('/', 1, 0), 'attempt to divide by zero');
    assert.equal(msg('%', 1, 0), 'attempt to calculate the remainder with a divisor of zero');
    assert.equal(msg('/', -128, -1, 'i8'), 'attempt to divide with overflow');
    assert.equal(msg('%', -128, -1, 'i8'), 'attempt to calculate the remainder with overflow');
    assert.equal(panic('    println!("{}", neg(-128));', 'fn neg(a: i8) -> i8 { -a }').panic.msg, 'attempt to negate with overflow');
  });
  it('index out of bounds names the length and the index', () => {
    const c = panic('    println!("{}", at(7));', 'fn at(i: usize) -> i32 {\n    let a = [1, 2, 3];\n    a[i]\n}');
    assert.equal(c.panic.msg, 'index out of bounds: the len is 3 but the index is 7');
    assert.equal(c.panic.line, 3);
    assert.equal(c.panic.col, 5);
  });
  it('compound assignment panics at the target', () => {
    const c = panic('    println!("{}", bump(255));', 'fn bump(n: u8) -> u8 {\n    let mut m = n;\n    m += 1;\n    m\n}');
    assert.equal(c.panic.msg, 'attempt to add with overflow');
    assert.equal(c.panic.line, 3);
  });
  it('a typed value never overflows another type: the stamp decides', () => {
    assert.equal(RQ.run(main('    let x = 2147483647;\n    let y = x + 1;\n    let z: i64 = y;\n    println!("{}", z);')).status, 'ok');
  });
  it('a panic inside a loop keeps what the loop printed', () => {
    const c = panic('    count(3);', 'fn count(n: u8) {\n    let mut i = n;\n    loop {\n        println!("{}", i);\n        i -= 1;\n    }\n}');
    assert.equal(c.stdout, '3\n2\n1\n0\n');
    assert.equal(c.panic.msg, 'attempt to subtract with overflow');
  });
  it('the step cap still wins over an endless loop and never reports a panic', () => {
    assert.equal(RQ.run(main('    loop {}'), { maxSteps: 100 }).status, 'limit');
  });
  it('a panic is not an error and not unsupported', () => {
    const c = panic('    println!("{}", add(250, 10));', 'fn add(a: u8, b: u8) -> u8 { a + b }');
    assert.equal(c.unsupported, null);
    assert.equal(c.hasError('arithmetic_overflow'), false);
  });
  it('the header comes from one constant in diag', () => {
    assert.equal(RQ.diag.panicText({ msg: 'm', line: 2, col: 3 }), "\nthread 'main' panicked at src/main.rs:2:3:\nm\n");
  });
});
