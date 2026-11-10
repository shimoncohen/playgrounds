import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const main = (body, items = '') => `${items}\nfn main() {\n${body}\n}\n`;
const out = (body, items) => { const c = RQ.run(main(body, items)); assert.equal(c.status, 'ok', `${c.status} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}\n${body}`); return c.out(); };
const err = (body, items) => RQ.run(main(body, items));

describe('inference', () => {
  it('an open int literal takes its type from later use, and defaults to i32', () => {
    assert.equal(out('    let x = 2147483647;\n    let y = x + 1;\n    let z: i64 = y;\n    println!("{}", z);'), '2147483648\n');
    assert.equal(out('    let x = 200;\n    let y: u8 = x;\n    println!("{}", y);'), '200\n');
    assert.equal(out('    let a = 7;\n    println!("{}", a / 2);'), '3\n');
  });
  it('a float literal is f64 and does float maths', () => {
    assert.equal(out('    let x = 2.5;\n    let y: f64 = 4.0;\n    println!("{} {} {}", x * 2.0, y / 8.0, x - y);'), '5 0.5 -1.5\n');
    assert.equal(out('    let x = 7.5 % 2.0;\n    println!("{}", -x);'), '-1.5\n');
    assert.equal(RQ.run(main('    let x: f32 = 2.5;')).unsupported.feature, 'f32');
  });
  it('tuples hold mixed types and `.0` reads a field', () => {
    assert.equal(out('    let t = (1, 2.5, \'a\', "s", true);\n    println!("{} {} {}", t.0, t.1, t.2);'), '1 2.5 a\n');
    assert.equal(out('    let t: (i32, f64) = (1, 2.0);\n    let u = t;\n    println!("{:?} {:?}", t, u.1);'), '(1, 2.0) 2.0\n');
    assert.equal(out('    let n = ((1, 2), 3);\n    println!("{}", n.0.1);'), '2\n');
  });
  it('arrays index, repeat and print with Debug', () => {
    assert.equal(out('    let a = [10, 20, 30];\n    println!("{} {:?}", a[1], a);'), '20 [10, 20, 30]\n');
    assert.equal(out('    let a = [0; 3];\n    let b: [u8; 2] = [1, 2];\n    println!("{:?} {:?}", a, b);'), '[0, 0, 0] [1, 2]\n');
    assert.equal(out('    let a = [[1, 2], [3, 4]];\n    println!("{}", a[1][0]);'), '3\n');
  });
  it('as converts between numbers, chars and bool', () => {
    assert.equal(out('    let x = 300;\n    let m = -1;\n    println!("{} {} {}", x as u8, m as u8, 3.99 as i32);'), '44 255 3\n');
    assert.equal(out('    let f = 1e20;\n    let n = -5.5;\n    println!("{} {} {}", f as i32, n as u8, 7 as f64 / 2.0);'), '2147483647 0 3.5\n');
    assert.equal(out('    let z = 0.0;\n    println!("{} {} {} {}", true as i32, \'a\' as u32, 97u8 as char, (z / z) as i32);'), '1 97 a 0\n');
    assert.equal(RQ.run(main('    let x = "a" as i32;')).unsupported.feature, 'cast');
  });
  it('if, loop, while and for run, and break carries a value', () => {
    assert.equal(out('    let n = 5;\n    if n > 3 { println!("big"); } else { println!("small"); }'), 'big\n');
    assert.equal(out('    let n = 5;\n    let s = if n > 3 { "big" } else if n > 1 { "mid" } else { "small" };\n    println!("{}", s);'), 'big\n');
    assert.equal(out('    let mut i = 0;\n    let r = loop {\n        i += 1;\n        if i == 4 { break i * 10; }\n    };\n    println!("{}", r);'), '40\n');
    assert.equal(out('    let mut i = 0;\n    let mut s = 0;\n    while i < 5 {\n        i += 1;\n        if i == 2 { continue; }\n        s += i;\n    }\n    println!("{}", s);'), '13\n');
    assert.equal(out('    let mut s = 0;\n    for i in 0..5 { s += i; }\n    for i in 1..=5 { s += i; }\n    println!("{}", s);'), '25\n');
    assert.equal(out('    for _ in 0..3 { print!("x"); }\n    println!();'), 'xxx\n');
  });
  it('a loop with no way out stops at the step cap, not forever', () => {
    assert.equal(RQ.run(main('    loop {}'), { maxSteps: 1000 }).status, 'limit');
    assert.equal(RQ.run(main('    let mut i = 0;\n    while true { i += 1; }'), { maxSteps: 1000 }).status, 'limit');
  });
  it('a return inside a loop leaves the function', () => {
    assert.equal(out('    println!("{}", first_big(3));', 'fn first_big(n: i32) -> i32 {\n    for i in 0..10 {\n        if i * i > n { return i; }\n    }\n    0\n}'), '2\n');
  });
  it('a body after return is still type-checked', () => {
    const c = err('    return;\n    let x: i32 = "a";');
    assert.equal(c.hasError('E0308', 4), true);
  });
});

describe('array size caps', () => {
  const caps = (body) => { const c = err(body); assert.equal(c.status, 'unsupported', body); assert.equal(c.unsupported.feature, 'array length', body); };
  it('the total number of elements is capped, not only each length', () => {
    caps('    let a = [[[0u8; 10000]; 10000]; 10000];\n    println!("{:?}", a);');
    caps('    let a = [[0; 200]; 200];');
    caps('    let a: [[u8; 200]; 200] = [[0; 200]; 200];');
    caps('    let a = [0; 10001];');
    assert.equal(out('    let a = [[0; 100]; 100];\n    println!("{}", a[99][99]);'), '0\n');
  });
  it('printing a big array counts against the step budget instead of freezing', () => {
    const src = main('    let a = [0; 10000];\n    println!("{:?}", a);');
    assert.equal(RQ.run(src, { maxSteps: 5000 }).status, 'limit');
    assert.equal(RQ.run(src).status, 'ok');
  });
});

describe('E0308', () => {
  const e0308 = (body, line, items) => {
    const c = err(body, items);
    assert.equal(c.status, 'error', body);
    assert.equal(c.onlyError('E0308'), true, body);
    assert.equal(c.hasError('E0308', line), true, `${body} -> ${JSON.stringify(c.errors)}`);
    assert.equal('lint' in c.errors[0], false);
  };
  it('let annotation against its init, at the init line', () => {
    e0308('    let x: i32 = "a";', 3);
    e0308('    let x: u8 = 5;\n    let y: i64 = x;', 4);
    e0308('    let x: f64 = 5;', 3);
    e0308('    let t: (i32, i32) = (1, 2, 3);', 3);
    assert.equal(out('    let x: f64 = 5.0;\n    let t: (i32, i32) = (1, 2);\n    println!("{} {}", x, t.0);'), '5 1\n');
  });
  it('call argument against its parameter', () => {
    e0308('    f(true);', 3, 'fn f(a: i32) {}');
    e0308('    let x: u8 = 1;\n    f(x);', 4, 'fn f(a: i32) {}');
    assert.equal(out('    f(1);\n    println!("ok");', 'fn f(a: i32) {}'), 'ok\n');
  });
  it('tail and return against the declared return type', () => {
    e0308('    f();', 1, 'fn f() -> i32 { "a" }');
    e0308('    f();', 1, 'fn f() -> i32 { return true; }');
    e0308('    f();', 1, 'fn f() -> u8 { let x: i32 = 5; x }');
    assert.equal(out('    println!("{}", f());', 'fn f() -> i32 { 5 }'), '5\n');
  });
  it('a body ending in ; but declaring a return type is at the return type', () => {
    e0308('    f();', 1, 'fn f() -> i32 { 5; }');
    e0308('    f();', 1, 'fn f() -> i32 { }');
    assert.equal(out('    println!("{}", f());', 'fn f() -> i32 { return 5; }'), '5\n');
  });
  it('if/else arms that differ, and a condition that is not bool', () => {
    e0308('    let x = if true { 1 } else { "a" };', 3);
    e0308('    if 1 { }', 3);
    e0308('    let n = 3;\n    while n { }', 4);
    assert.equal(out('    let x = if true { 1 } else { 2 };\n    println!("{}", x);'), '1\n');
  });
  it('two different concrete int types in one operator', () => {
    e0308('    let a: i32 = 1;\n    let b: i64 = 2;\n    println!("{}", a + b);', 5);
    e0308('    let a: i32 = 1;\n    let b: u8 = 2;\n    println!("{}", a < b);', 5);
    assert.equal(out('    let a: i32 = 1;\n    let b: i32 = 2;\n    println!("{}", a + b);'), '3\n');
  });
  it('a mismatch outside those shapes stays unsupported', () => {
    for (const body of ['    let a = 1 + 1.0;', '    let a = true + 1;', '    let a = [1, "a"];', '    let a = [1, 2];\n    let b = a[1.5];']) {
      const c = err(body);
      assert.equal(c.status, 'unsupported', body);
      assert.equal(c.unsupported.feature, 'type checking', body);
    }
  });
});

describe('E0425', () => {
  const e0425 = (body, line, items) => {
    const c = err(body, items);
    assert.equal(c.status, 'error', body);
    assert.equal(c.onlyError('E0425'), true, body);
    assert.equal(c.hasError('E0425', line), true, body);
  };
  it('an unknown variable, function or format name', () => {
    e0425('    println!("{}", y);', 3);
    e0425('    let x = 1;\n    let z = x + y;', 4);
    e0425('    nope();', 3);
    e0425('    println!("{y}");', 3);
    e0425('    y = 2;', 3);
    e0425('    {\n        let inner = 2;\n    }\n    println!("{}", inner);', 6);
    assert.equal(out('    let y = 1;\n    println!("{y} {}", y);'), '1 1\n');
  });
  it('E0384 is unchanged', () => {
    assert.equal(RQ.run(main('    let x = 1;\n    x = 2;')).onlyError('E0384'), true);
  });
});
