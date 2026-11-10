import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const main = (body, items = '') => `${items}\nfn main() {\n${body}\n}\n`;
const lint = (body, id, line, items) => {
  const c = RQ.run(main(body, items));
  assert.equal(c.status, 'error', `${body} -> ${c.status} ${JSON.stringify(c.unsupported)}`);
  assert.equal(c.errors.length, 1, body);
  assert.equal(c.errors[0].lint, id, body);
  assert.equal('code' in c.errors[0], false, 'a lint has no code');
  assert.equal(c.errors[0].line, line, body);
  assert.equal(c.compiles(), false);
  assert.equal(c.hasError(id, line), true);
};
const ok = (body, items) => { const c = RQ.run(main(body, items)); assert.equal(c.status, 'ok', `${body} -> ${c.status} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`); return c; };
const folding = (body, items) => { const c = RQ.run(main(body, items)); assert.equal(c.status, 'unsupported', body); assert.equal(c.unsupported.feature, 'const folding', body); };

describe('lints are reported as lint, never as code', () => {
  it('arithmetic_overflow', () => {
    lint('    let x: u8 = 255 + 1;', 'arithmetic_overflow', 3);
    lint('    let x: i32 = 2147483647 + 1;', 'arithmetic_overflow', 3);
    lint('    let x: u8 = 0 - 1;', 'arithmetic_overflow', 3);
    lint('    let x: i8 = 100 * 2;', 'arithmetic_overflow', 3);
    lint('    let x = -128i8;\n    let y = -x;', 'arithmetic_overflow', 4);
  });
  it('unconditional_panic', () => {
    lint('    println!("{}", 1 / 0);', 'unconditional_panic', 3);
    lint('    println!("{}", 7 % 0);', 'unconditional_panic', 3);
    lint('    let z = 0;\n    println!("{}", 5 / z);', 'unconditional_panic', 4);
    lint('    println!("{}", [1, 2, 3][5]);', 'unconditional_panic', 3);
    lint('    let a = [1, 2, 3];\n    println!("{}", a[3]);', 'unconditional_panic', 4);
    lint('    let a = [1, 2, 3];\n    let i = 5;\n    println!("{}", a[i]);', 'unconditional_panic', 5);
  });
  it('overflowing_literals', () => {
    lint('    let x: u8 = 256;', 'overflowing_literals', 3);
    lint('    let x = 3000000000;', 'overflowing_literals', 3);
    lint('    let x: i8 = -129;', 'overflowing_literals', 3);
    lint('    let x: u8 = 300u8;', 'overflowing_literals', 3);
    assert.equal(ok('    let x: u8 = 255;\n    let y: i8 = -128;\n    println!("{} {}", x, y);').out(), '255 -128\n');
    assert.equal(ok('    println!("{}", -2147483648 + 1);').out(), '-2147483647\n');
  });
  it('a const over its type is overflowing_literals; arithmetic that overflows in a const stays unsupported', () => {
    const c = RQ.run('const N: u8 = 300;\nfn main() {}\n');
    assert.equal(c.errors[0].lint, 'overflowing_literals');
    assert.equal(c.errors[0].line, 1);
    assert.equal(RQ.run('const N: u8 = 3;\nfn main() {}\n').status, 'ok');
    const d = RQ.run('const A: u8 = 255 + 1;\nfn main() {}\n');
    assert.equal(d.status, 'unsupported');
    assert.equal(d.unsupported.feature, 'const initializer');
  });
  it('a literal out of range is reported even in code that never runs', () => {
    lint('    return;\n    let x: u8 = 256;', 'overflowing_literals', 4);
  });
});

describe('what rustc does and does not lint (probes a to h)', () => {
  it('a: code after return is not linted', () => { ok('    return;\n    let x: u8 = 255 + 1;\n    println!("{}", x);'); });
  it('b: the right side of a short circuit is not linted when the left decides', () => {
    ok('    let t = true;\n    if t || { let y: u8 = 255 + 1; y > 0 } { println!("a"); }');
    ok('    let f = false;\n    if f && { let y: u8 = 255 + 1; y > 0 } { println!("a"); }');
  });
  it('e: an index after return is not linted', () => { ok('    return;\n    let a = [1, 2, 3];\n    println!("{}", a[5]);'); });
  it('c, d: an uncalled fn is linted', () => {
    lint('    println!("hi");', 'arithmetic_overflow', 2, 'fn f() {\n    let x: u8 = 255 + 1;\n    println!("{}", x);\n}');
    lint('    println!("hi");', 'overflowing_literals', 2, 'fn f() {\n    let x: u8 = 256;\n    println!("{}", x);\n}');
    ok('    println!("hi");', 'fn spare() {}');
  });
  it('f: a single-assignment immutable let is folded', () => { lint('    let x: u8 = 255;\n    let y = x + 1;', 'arithmetic_overflow', 4); });
  it('g: a let mut folded along straight-line code is linted too', () => { lint('    let mut x: u8 = 255;\n    x = x;\n    let y = x + 1;', 'arithmetic_overflow', 5); });
  it('h: a parameter is never folded, so the call panics at run time', () => {
    const c = RQ.run(main('    println!("before");\n    println!("{}", add(250, 10));', 'fn add(a: u8, b: u8) -> u8 { a + b }'));
    assert.equal(c.status, 'panic');
  });
  it('the same ops on values that are not known are fine', () => {
    assert.equal(ok('    let x: u8 = 254;\n    let y = x + 1;\n    println!("{}", y);').out(), '255\n');
    assert.equal(ok('    println!("{}", 10 / 3 + 255 % 7);').out(), '6\n');
  });
});

describe('round 2 probes: reachability and aggregates', () => {
  it('s, s2: after an if on a known condition whose taken branch returns, nothing is linted', () => {
    ok('    let t = true;\n    if t {\n        return;\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);');
    ok('    if true {\n        return;\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);');
    ok('    let f = false;\n    if f {\n        println!("a");\n    } else {\n        return;\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);');
  });
  it('an if the compiler cannot decide leaves the code after it live', () => {
    lint('    println!("hi");', 'arithmetic_overflow', 6, 'fn f(c: bool) {\n    if c {\n        return;\n    }\n    println!("a");\n    let x: u8 = 255 + 1;\n    println!("{}", x);\n}');
    lint('    let t = true;\n    if t {\n        println!("a");\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);', 'arithmetic_overflow', 7);
  });
  it('t: tuple fields fold', () => {
    lint('    let t = (255u8, 1u8);\n    let y = t.0 + t.1;\n    println!("{}", y);', 'arithmetic_overflow', 4);
    lint('    let t = ((255u8, 1u8), 2u8);\n    let y = t.0.0 + t.0.1;\n    println!("{}", y);', 'arithmetic_overflow', 4);
    assert.equal(ok('    let t = (254u8, 1u8);\n    let y = t.0 + t.1;\n    println!("{}", y);').out(), '255\n');
  });
  it('u: array elements fold', () => {
    lint('    let a = [255u8];\n    let y = a[0] + 1;\n    println!("{}", y);', 'arithmetic_overflow', 4);
    lint('    let a = [255u8; 3];\n    let y = a[2] + 1;\n    println!("{}", y);', 'arithmetic_overflow', 4);
    assert.equal(ok('    let a = [254u8];\n    let y = a[0] + 1;\n    println!("{}", y);').out(), '255\n');
  });
  it('an aggregate built from a parameter or read at an unknown index is not folded', () => {
    const c = RQ.run(main('    println!("{}", f(255, 1));', 'fn f(a: u8, b: u8) -> u8 {\n    let t = (a, b);\n    t.0 + t.1\n}'));
    assert.equal(c.status, 'panic');
    const d = RQ.run(main('    println!("{}", g(0));', 'fn g(i: usize) -> u8 {\n    let a = [255u8, 1u8];\n    a[i] + a[1]\n}'));
    assert.equal(d.status, 'panic');
  });
  it('a mutable aggregate read after a barrier is unsupported const folding', () => {
    folding('    let mut t = (255u8, 1u8);\n    t = t;\n    println!("a");\n    let y = t.0 + t.1;');
  });
  it('v: a break in an inner loop does not exit the outer one, so nothing after it is linted', () => {
    const c = RQ.run(main('    loop {\n        loop {\n            break;\n        }\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);'), { maxSteps: 1000 });
    assert.equal(c.status, 'limit');
  });
  it('w1, w2: nothing after a while on a known-true condition without a break, or after an empty loop, is linted', () => {
    for (const head of ['while true {\n    }', 'loop {\n    }', 'let t = true;\n    while t {\n    }']) {
      const c = RQ.run(main(`    ${head}\n    let x: u8 = 255 + 1;\n    println!("{}", x);`), { maxSteps: 1000 });
      assert.equal(c.status, 'limit', head);
    }
  });
  it('a while on a known-true condition that has a break, or on an unknown condition, leaves the code after it live', () => {
    lint('    while true {\n        break;\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);', 'arithmetic_overflow', 6);
    lint('    println!("hi");', 'arithmetic_overflow', 4, 'fn f(c: bool) {\n    while c {\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);\n}');
  });
  it('x1, x3: a mutable condition that would end the reachable code is not judged', () => {
    folding('    let mut t = true;\n    if t {\n        return;\n    }\n    t = false;\n    let x: u8 = 255 + 1;\n    println!("{}", x);');
    folding('    let mut t = true;\n    t = t;\n    if t {\n        return;\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);');
    folding('    let mut t = true;\n    t = t;\n    while t {\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);');
  });
  it('x2, x4: a mutable condition that does not end the code, and a parameter condition, still lint what follows', () => {
    lint('    let mut t = true;\n    t = false;\n    if t {\n        return;\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);', 'arithmetic_overflow', 8);
    lint('    f(true);', 'arithmetic_overflow', 5, 'fn f(t: bool) {\n    if t {\n        return;\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);\n}');
  });
  it('v2: a break that does exit the loop leaves the code after it live', () => {
    lint('    let mut n = 0;\n    loop {\n        n += 1;\n        if n > 2 {\n            break;\n        }\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);', 'arithmetic_overflow', 10);
  });
});

describe('ambiguity: an unverified rustc folding shape is unsupported, never ok', () => {
  it('D1: a multi-assigned local after a call, a trapping op or control flow', () => {
    folding('    let mut x: u8 = 250;\n    x += 3;\n    x += 3;');
    folding('    let mut x: u8 = 255;\n    x = x;\n    println!("a");\n    let y = x + 1;');
  });
  it('D2: an if or while on a known constant condition with a trap in the dead branch', () => {
    folding('    if false {\n        let x: u8 = 255 + 1;\n    }');
    folding('    while false {\n        let x: u8 = 255 + 1;\n    }');
    lint('    let c = 3;\n    if c > 2 {\n        let x: u8 = 255 + 1;\n    }', 'arithmetic_overflow', 5);
    folding('    let n = 3;\n    if n > 1 {\n        println!("a");\n    } else {\n        let x: u8 = 255 + 1;\n    }');
  });
  it('D3: a const item as an operand of a trapping op', () => {
    folding('    let y = N + 1;', 'const N: u8 = 255;');
    assert.equal(ok('    let y = N + 1;\n    println!("{}", y);', 'const N: u8 = 2;').out(), '3\n');
  });
  it('D4: a bare unsuffixed literal cast that does not fit the target', () => {
    folding('    let x = 256 as u8;');
    folding('    let x = -1 as u8;');
    assert.equal(ok('    let x = 255 as u8;\n    println!("{}", x);').out(), '255\n');
    assert.equal(ok('    let n = 256;\n    println!("{}", n as u8);').out(), '0\n');
  });
  it('D5: a let mut never reassigned, used in a trapping op', () => {
    folding('    let mut x: u8 = 255;\n    let y = x + 1;');
    assert.equal(ok('    let mut x: u8 = 1;\n    let y = x + 1;\n    println!("{}", y);').out(), '2\n');
  });
  it('MIN / -1 and MIN % -1 are unsupported integer overflow', () => {
    for (const op of ['/', '%']) {
      const c = RQ.run(main(`    let a: i8 = -128;\n    let b: i8 = -1;\n    println!("{}", a ${op} b);`));
      assert.equal(c.status, 'unsupported');
      assert.equal(c.unsupported.feature, 'integer overflow');
    }
  });
});

describe('every lint id has a tip, and so does every coded error', () => {
  it('RQ.diag.tip answers for lints and codes', () => {
    for (const id of ['arithmetic_overflow', 'unconditional_panic', 'overflowing_literals', 'E0308', 'E0425', 'E0384']) {
      assert.ok(RQ.diag.tip(id).length > 10, id);
      assert.ok(RQ.diag.title(id).length > 3, id);
    }
  });
});
