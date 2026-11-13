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
const compiles = (body, items) => { const c = RQ.run(main(body, items)); assert.ok(c.compiles(), `${body} -> ${c.status} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`); };
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
    compiles('    let t = ((255u8, 1u8), 2u8);\n    let y = t.0.0 + t.0.1;\n    println!("{}", y);');
    assert.equal(ok('    let t = (254u8, 1u8);\n    let y = t.0 + t.1;\n    println!("{}", y);').out(), '255\n');
  });
  it('u: array elements fold', () => {
    lint('    let a = [255u8];\n    let y = a[0] + 1;\n    println!("{}", y);', 'arithmetic_overflow', 4);
    compiles('    let a = [255u8; 3];\n    let y = a[2] + 1;\n    println!("{}", y);');
    compiles('    let a = [255u8; 3];\n    let z = a[0];\n    let w = z + 1;\n    println!("{}", w);');
    assert.equal(ok('    let a = [254u8];\n    let y = a[0] + 1;\n    println!("{}", y);').out(), '255\n');
  });
  it('an aggregate built from a parameter or read at an unknown index is not folded', () => {
    const c = RQ.run(main('    println!("{}", f(255, 1));', 'fn f(a: u8, b: u8) -> u8 {\n    let t = (a, b);\n    t.0 + t.1\n}'));
    assert.equal(c.status, 'panic');
    const d = RQ.run(main('    println!("{}", g(0));', 'fn g(i: usize) -> u8 {\n    let a = [255u8, 1u8];\n    a[i] + a[1]\n}'));
    assert.equal(d.status, 'panic');
  });
  it('a multi-assigned aggregate read after a barrier is not folded', () => {
    compiles('    let mut t = (255u8, 1u8);\n    t = t;\n    println!("a");\n    let y = t.0 + t.1;');
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
  it('x1, x2: a condition rustc folds to true ends the reachable code, even through a let mut', () => {
    compiles('    let mut t = true;\n    if t {\n        return;\n    }\n    t = false;\n    let x: u8 = 255 + 1;\n    println!("{}", x);');
    compiles('    let mut t = true;\n    t = t;\n    if t {\n        return;\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);');
  });
  it('x3: a while on a mut condition that is read once is still live code after it', () => {
    lint('    let mut t = true;\n    t = t;\n    while t {\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);', 'arithmetic_overflow', 7);
  });
  it('x2, x4: a mutable condition that does not end the code, and a parameter condition, still lint what follows', () => {
    lint('    let mut t = true;\n    t = false;\n    if t {\n        return;\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);', 'arithmetic_overflow', 8);
    lint('    f(true);', 'arithmetic_overflow', 5, 'fn f(t: bool) {\n    if t {\n        return;\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);\n}');
  });
  it('v2: a break that does exit the loop leaves the code after it live', () => {
    lint('    let mut n = 0;\n    loop {\n        n += 1;\n        if n > 2 {\n            break;\n        }\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);', 'arithmetic_overflow', 10);
  });
});

describe('rustc folding shapes, each probed on the pinned image', () => {
  it('a local assigned more than once is known only until the next block boundary', () => {
    lint('    let mut x: u8 = 250;\n    x += 3;\n    let y = x + 3;\n    println!("{}", y);', 'arithmetic_overflow', 5);
    lint('    let mut x: u8 = 254;\n    x = x + 1;\n    let y = x + 2;\n    println!("{}", y);', 'arithmetic_overflow', 5);
    lint('    let mut x: u8 = 255;\n    x = x;\n    let y = x + 1;\n    println!("{}", y);', 'arithmetic_overflow', 5);
    compiles('    let mut x: u8 = 255;\n    x = x;\n    println!("a");\n    let y = x + 1;\n    println!("{}", y);');
    compiles('    let mut x: u8 = 250;\n    x += 3;\n    println!("a");\n    let y = x + 3;\n    println!("{}", y);');
  });
  it('a local that is borrowed anywhere, a println argument included, is not folded', () => {
    compiles('    let x: u8 = 255;\n    println!("{}", x);\n    let y = x + 1;\n    println!("{}", y);');
    compiles('    let x: u8 = 255;\n    let y = x + 1;\n    println!("{x} {y}");');
    compiles('    let x: u8 = 255;\n    let s = x.to_string();\n    let y = x + 1;\n    println!("{} {}", y, s);');
    compiles('    let t = (255u8, 1u8);\n    println!("{}", t.0);\n    let y = t.0 + t.1;\n    println!("{}", y);');
    compiles('    let mut x: u8 = 250;\n    x += 3;\n    x += 3;\n    println!("{}", x);');
    lint('    let x: u8 = 255;\n    let y = x + 1;\n    println!("{}", y);', 'arithmetic_overflow', 4);
  });
  it('a let mut that is never reassigned is folded across blocks', () => {
    lint('    let mut x: u8 = 255;\n    let y = x + 1;\n    println!("{}", y);', 'arithmetic_overflow', 4);
    lint('    let mut x: u8 = 255;\n    println!("a");\n    let y = x + 1;\n    println!("{}", y);', 'arithmetic_overflow', 5);
    lint('    let mut d = 0;\n    println!("a");\n    println!("{}", 5 / d);', 'unconditional_panic', 5);
    assert.equal(ok('    let mut x: u8 = 1;\n    let y = x + 1;\n    println!("{}", y);').out(), '2\n');
  });
  it('a trap in the branch a known condition rules out is never linted; the live branch is', () => {
    for (const body of [
      '    if false {\n        let x: u8 = 255 + 1;\n    }',
      '    while false {\n        let x: u8 = 255 + 1;\n    }',
      '    let n = 3;\n    if n > 1 {\n        println!("a");\n    } else {\n        let x: u8 = 255 + 1;\n    }',
      '    let n = 3;\n    if n < 2 {\n        println!("a");\n    } else if n < 3 {\n        let x: u8 = 255 + 1;\n    }',
      '    let mut c = true;\n    c = true;\n    if c {\n        println!("a");\n    } else {\n        let x: u8 = 255 + 1;\n    }',
      '    let c = 0;\n    if c == 1 {\n        let d = 0;\n        println!("{}", 5 / d);\n    }',
      '    let a = [1, 2, 3];\n    if false {\n        println!("{}", a[7]);\n    }'
    ]) compiles(body);
    lint('    let c = 3;\n    if c > 2 {\n        let x: u8 = 255 + 1;\n    }', 'arithmetic_overflow', 5);
    lint('    let n = 3;\n    if n > 5 {\n        println!("a");\n    } else {\n        let x: u8 = 255 + 1;\n    }', 'arithmetic_overflow', 7);
    lint('    if false {\n        let d = 0;\n        println!("{}", 5 / d);\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);', 'arithmetic_overflow', 7);
  });
  it('a condition no longer known after a block boundary leaves both branches live', () => {
    lint('    let mut c = false;\n    c = false;\n    println!("a");\n    if c {\n        let x: u8 = 255 + 1;\n    }', 'arithmetic_overflow', 7);
  });
  it('&&, || and a real match switch end the block; a comparison, a closure, a wildcard match and a loop that always breaks do not', () => {
    const X = (mid) => `    let mut x: u8 = 255;\n    x = x;\n    ${mid}\n    let y = x + 1;\n    println!("{}", y);`;
    for (const mid of ['let c = 1 > 2 && true;', 'let c = true || false;', 'match 1 { 1 => {} _ => {} }', 'let f = || 1; f();', 'loop { 1 + 1; break; }']) compiles(X(mid));
    for (const mid of ['let c = 1 > 2;', 'let c = !true;', 'let f = || 1;', 'match 1 { _ => {} }', 'let a = match 1 { n => n };', 'loop { break; }']) lint(X(mid), 'arithmetic_overflow', 6);
    for (const mid of ['loop { return; break; }', 'loop { { return; } break; }', 'loop { match 1 { _ => return } break; }']) compiles(X(mid));
    lint('    let v: u8 = loop { break 255; };\n    let w = v + 1;\n    println!("{}", w);', 'arithmetic_overflow', 4);
    lint(X('match x { n => { println!("{}", n + 1); } }'), 'arithmetic_overflow', 5);
    lint(X('match (1, 2) { (a, b) => {} }'), 'arithmetic_overflow', 6);
    lint('    match 1 {\n        _ => {}\n        _ => {\n            let x: u8 = 255 + 1;\n            println!("{}", x);\n        }\n    }\n    let y: u8 = 255 + 1;\n    println!("{}", y);', 'arithmetic_overflow', 10);
  });
  it('a let without an initializer that is assigned once is folded like a plain let', () => {
    lint('    let a: u8;\n    a = 255;\n    let b = a + 1;\n    println!("{}", b);', 'arithmetic_overflow', 5);
    lint('    let d: i32;\n    d = 0;\n    println!("a");\n    println!("{}", 5 / d);', 'unconditional_panic', 6);
    compiles('    let a: u8;\n    a = 255;\n    let r = &a;\n    let b = a + 1;\n    println!("{} {}", b, r);');
  });
  it('E0600: negating an unsigned type, one error per minus', () => {
    const errs = (body) => { const c = RQ.run(`fn main() {\n${body}\n}\n`); assert.equal(c.status, 'error', body); return [...c.errors].map((e) => `${e.code}@${e.line}`); };
    for (const body of ['    let x = -1 as u8;', '    let x = -0 as u8;', '    let x = -(1) as u8;', '    let x = (-1) as u8;', '    let x = -1 as u32;', '    let x = -1 as usize;', '    let x: u8 = -1;', '    let y: u32 = 5;\n    let z = -y;', '    let n = 7usize;\n    println!("{}", -n);', '    let x = -1u8;']) {
      assert.deepEqual(errs(body + '\n    println!("{}", 1);').map((x) => x.split('@')[0]), ['E0600'], body);
    }
    assert.deepEqual(errs('    let x = - -1 as u8;\n    println!("{}", x);'), ['E0600@2', 'E0600@2']);
    assert.equal(RQ.diag.ERRORS.E0600.msg({ type: 'u8' }), 'cannot apply unary operator `-` to type `u8`');
    for (const body of ['    let x = -1 as i8;', '    let y: i32 = 5;\n    let z = -y;', '    let a: usize = 3;\n    let b = -(a as i32);', '    let x = -1;', '    let x = -2.5f64;']) compiles(body + '\n    println!("{}", 1);');
  });
  it('a literal negated where its type is only fixed later is E0277, where a parameter, field or annotation expects it E0600', () => {
    const code = (body) => { const c = RQ.run(main(body + '\n    println!("{}", 1);', 'fn takes(n: u8) {\n    println!("{}", n);\n}')); assert.equal(c.status, 'error', body); return c.errors.map((e) => e.code).join(); };
    for (const body of ['    let x = -1;\n    let y: u8 = x;', '    let n = 5u8;\n    println!("{}", n + -1);']) assert.equal(code(body), 'E0277', body);
    assert.equal(code('    takes(-1);'), 'E0600');
  });
  it('a break or a pattern whose switch cannot be told cheaply is unsupported, not guessed', () => {
    const X = (mid) => `    let mut x: u8 = 255;\n    x = x;\n    ${mid}\n    let y = x + 1;\n    println!("{}", y);`;
    for (const mid of ['match 1 { n @ _ => {} }', 'match 1 { _ | 1 => {} }', 'loop { match 1 { _ => break } }', 'loop { { break; } }']) folding(X(mid));
  });
  it('the one store of a deferred let is known after a branch that holds it', () => {
    lint('    f(true);', 'arithmetic_overflow', 8, 'fn f(c: bool) {\n    let a: u8;\n    if c {\n        a = 255;\n    } else {\n        return;\n    }\n    let b = a + 1;\n    println!("{}", b);\n}');
    compiles('    f(true);', 'fn f(c: bool) {\n    let a: u8;\n    if c {\n        a = 1;\n    } else {\n        a = 255;\n    }\n    let b = a + 1;\n    println!("{}", b);\n}');
  });
  it('a loop value or store is known only when no break or continue comes before the direct break', () => {
    const I = 'fn idb(b: bool) -> bool {\n    b\n}\n\nfn idu(x: u8) -> u8 {\n    x\n}';
    const V = (loop) => `    let v: u8 = ${loop};\n    println!("{}", v + 1);`;
    for (const loop of ['loop { if idb(false) { break 1; } break 255; }', 'loop { if idb(true) { break 1; } break 255; }', 'loop { match idu(1) { 1 => { break 3; } _ => {} } break 255; }', 'loop { let k = idu(0); if k == 1 { break k; } break 255; }']) compiles(V(loop), I);
    compiles('    let mut x: u8 = 255;\n    x = x;\n    loop {\n        if idb(true) {\n            x = 0;\n            break;\n        }\n        x = 255;\n        break;\n    }\n    let y = x + 1;\n    println!("{}", y);', I);
    folding('    let mut x: u8 = 255;\n    x = x;\n    loop { continue; break; }\n    let y = x + 1;\n    println!("{}", y);');
    lint(V('loop { println!("a"); break 255; }'), 'arithmetic_overflow', 4);
    lint('    f();', 'arithmetic_overflow', 4, 'fn f() -> u8 {\n    let mut n = 255u8;\n    loop {\n        n += 1;\n        return n;\n    }\n}');
    folding('    let mut i = 0u8;\n    let x = loop {\n        i += 1;\n        if i > 3 {\n            break 255u8;\n        }\n    };\n    println!("{}", x + 1);');
  });
  it('rustc folds one level of tuple or array: what sits inside a nested one is unknown, so nothing is linted on it alone', () => {
    for (const body of [
      '    match (255u8, (1u8, 2u8)) {\n        (a, (b, _)) => {\n            println!("{}", a + b);\n        }\n    }',
      '    let ((a, b), c) = ((255u8, 1u8), 2u8);\n    println!("{}", a + b);',
      '    let x = ((255u8, 1u8), 2u8);\n    match x {\n        (p, q) => {\n            println!("{}", p.0 + 1);\n        }\n    }',
      '    let g = [[255u8, 1], [2, 3]];\n    let y = g[0][0] + 1;\n    println!("{}", y);',
      '    let t = (1, (255u8, 2));\n    let y = t.1.0 + 1;\n    println!("{}", y);',
      '    let g = [[1, 2], [3, 4]];\n    if g[0][0] > 0 {\n        println!("{}", g[1][1] + 1);\n    }',
      '    let t = (1, (2, 3));\n    if t.1.0 == 2 {\n        println!("yes");\n    }'
    ]) compiles(body);
    assert.equal(ok('    let g = [[1, 2], [3, 4]];\n    if g[0][0] > 0 {\n        println!("{}", g[1][1] + 1);\n    }').out(), '5\n');
    lint('    let (a, b) = (255u8, (1u8, 2u8));\n    println!("{}", a + 1);', 'arithmetic_overflow', 4);
    lint('    let t = (1, (2, 3));\n    if t.1.0 == 5 {\n        let x: u8 = 255 + 1;\n        println!("{}", x);\n    }', 'arithmetic_overflow', 5);
    lint('    let t = ((255u8, 1u8), 2u8);\n    let d = 0;\n    println!("{}", t.0.0 / d);', 'unconditional_panic', 5);
  });
  it('a binding in an arm of a switching match is known to rustc, so a trap in the arm is not judged', () => {
    folding('    match (255u8, 1u8) {\n        (a, 1) => {\n            println!("{}", a + 1);\n        }\n        _ => {}\n    }');
    lint('    match 1u8 {\n        n @ 0..=255 => {\n            println!("{}", n + 255);\n        }\n        _ => {}\n    }', 'arithmetic_overflow', 5);
  });
  it('a match on a known scrutinee follows only the arm that matches', () => {
    for (const body of [
      '    let n = 5u8;\n    match n {\n        1 => {\n            let x: u8 = 255 + 1;\n            println!("{}", x);\n        }\n        _ => {}\n    }',
      '    let n = 0u8;\n    match n {\n        0 => {}\n        _ => {\n            let x: u8 = 255 + 1;\n            println!("{}", x);\n        }\n    }',
      '    let n = 3u8;\n    match n {\n        1 | 2 => {\n            let x: u8 = 255 + 1;\n            println!("{}", x);\n        }\n        _ => {}\n    }',
      '    let n = 0u8;\n    match n {\n        0 => return,\n        _ => {}\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);'
    ]) compiles(body);
    for (const [body, line] of [
      ['    let n = 2u8;\n    match n {\n        1 | 2 => {\n            let x: u8 = 255 + 1;\n            println!("{}", x);\n        }\n        _ => {}\n    }', 6],
      ['    let n = 7i32;\n    match n {\n        1..=5 => {}\n        _ => {\n            let x: u8 = 255 + 1;\n            println!("{}", x);\n        }\n    }', 7],
      ['    let n = 3u8;\n    match n {\n        0 => return,\n        _ => {}\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);', 8]
    ]) lint(body, 'arithmetic_overflow', line);
  });
  it('struct values fold one level: a field, a struct pattern and a tuple struct', () => {
    lint('    let s = S { a: 255 };\n    let y = s.a + 1;\n    println!("{}", y);', 'arithmetic_overflow', 7, 'struct S {\n    a: u8,\n}\n');
    lint('    let S { a } = S { a: 255 };\n    println!("{}", a + 1);', 'arithmetic_overflow', 7, 'struct S {\n    a: u8,\n}\n');
    lint('    let w = W(255);\n    let y = w.0 + 1;\n    println!("{}", y);', 'arithmetic_overflow', 5, 'struct W(u8);\n');
  });
  it('ordinary programs that rustc and main accept stay ok, whatever shape the match or loop has', () => {
    const P = 'struct Pt {\n    x: i32,\n    y: i32,\n}\n\n';
    for (const [src, out] of [
      ['struct W(u8);\n\nfn main() {\n    let w = W(5);\n    match w {\n        W(n) => println!("{}", n),\n    }\n}\n', '5\n'],
      [P + 'fn main() {\n    let p = Pt { x: 1, y: 2 };\n    match p {\n        Pt { x, y } => println!("{} {}", x, y),\n    }\n}\n', '1 2\n'],
      [P + 'fn main() {\n    let p = Pt { x: 1, y: 2 };\n    match &p {\n        Pt { x, .. } => println!("{}", x),\n    }\n}\n', '1\n'],
      [P + 'impl Pt {\n    fn sum(&self) -> i32 {\n        match self {\n            Pt { x, y } => x + y,\n        }\n    }\n}\n\nfn main() {\n    let p = Pt { x: 1, y: 2 };\n    println!("{}", p.sum());\n}\n', '3\n'],
      ['fn main() {\n    let t = (1, 2);\n    match t {\n        (x, ..) => println!("{}", x),\n    }\n}\n', '1\n'],
      ['enum E {\n    A(i32),\n}\n\nfn main() {\n    let e = E::A(3);\n    match e {\n        E::A(n) => println!("{}", n),\n    }\n}\n', '3\n'],
      ['fn main() {\n    let mut i = 0;\n    loop {\n        i += 1;\n        match i {\n            n if n > 3 => break,\n            _ => {}\n        }\n    }\n    println!("{}", i);\n}\n', '4\n'],
      ['fn main() {\n    let mut i = 0;\n    loop {\n        i += 1;\n        match i {\n            x if x > 3 => {\n                println!("{}", x);\n                break;\n            }\n            x => println!("{}", x),\n        }\n    }\n}\n', '1\n2\n3\n4\n'],
      ['fn main() {\n    let mut n = 0u8;\n    loop {\n        n += 1;\n        if n > 2 {\n            continue;\n        }\n        break;\n    }\n    println!("{}", n);\n}\n', '1\n'],
      ['fn main() {\n    let n = 0u8;\n    let r = match n {\n        0 => 0,\n        k => k - 1,\n    };\n    println!("{}", r);\n}\n', '0\n'],
      ['fn main() {\n    let g = [[1, 2], [3, 4]];\n    if g[0][0] > 0 {\n        println!("{}", g[1][1] + 1);\n    }\n}\n', '5\n']
    ]) {
      const c = RQ.run(src);
      assert.equal(c.status, 'ok', src + JSON.stringify(c.unsupported) + JSON.stringify(c.errors));
      assert.equal(c.stdout, out, src);
    }
  });
  it('a store through a field, an aggregate copy, a re-stored struct and a variant constructor leave a value in doubt, not wrong', () => {
    const S = 'struct S {\n    a: u8,\n}\n\nfn idb() -> bool {\n    true\n}';
    const SC = '#[derive(Clone, Copy)]\nstruct S {\n    a: u8,\n}';
    for (const body of [
      '    let mut s = S { a: 255 };\n    if idb() {\n        s.a = 0;\n    }\n    println!("{}", s.a + 1);',
      '    let mut s = S { a: 255 };\n    match idb() {\n        true => {\n            s.a = 0;\n        }\n        false => {}\n    }\n    println!("{}", s.a + 1);',
      '    let mut t = (255u8, 1u8);\n    if idb() {\n        t.0 = 0;\n    }\n    println!("{}", t.0 + 1);'
    ]) assert.equal(ok(body, S).out(), '1\n', body);
    compiles('    let mut s = S { a: 0 };\n    s = S { a: 255 };\n    println!("{}", s.a + 1);', S);
    compiles('    let s = S { a: 255 };\n    let t = s;\n    println!("{}", t.a + 1);', SC);
    compiles('    let t = (255u8, 1u8);\n    let u = t;\n    println!("{}", u.0 + 1);');
    compiles('    let a = [255u8, 1];\n    let b = a;\n    println!("{}", b[0] + 1);');
    compiles('    let mut a = [0u8, 1];\n    a = [255, 1];\n    println!("{}", a[0] + 1);');
    lint('    let s = S { a: 255 };\n    let t = s;\n    println!("{} {}", t.a, s.a + 1);', 'arithmetic_overflow', 8, SC);
    lint('    let mut s = S { a: 255 };\n    let y = s.a + 1;\n    s = S { a: 0 };\n    println!("{} {}", y, s.a + 1);', 'arithmetic_overflow', 10, S);
    lint('    let t = (255u8, 1u8);\n    let (a, b) = t;\n    println!("{}", a + b);', 'arithmetic_overflow', 5);
    lint('    let mut t = (0u8, 0u8, 0u8);\n    t = (255, 1, 2);\n    println!("{}", t.0 + 1);', 'arithmetic_overflow', 5);
    folding('    let mut x: u8 = 254;\n    x = 255;\n    let o = Some(1);\n    let y = x + 1;\n    println!("{:?} {}", o, y);');
    lint('    let s = S { a: 255 };\n    let y = s.a;\n    println!("{}", y + 1);', 'arithmetic_overflow', 8, SC);
    lint('    let mut t = (0u8, 1u8);\n    t = (255, 1);\n    println!("{}", t.0 + 1);', 'arithmetic_overflow', 5);
  });
  it('code rustc never runs: a literal condition prunes it, a known value leaves a borrowed constant expression linted', () => {
    const D = (T, c = '    let n = 2;\n    if n == 1 {\n') => `${c}        ${T}\n    }`;
    const P = 'println!("{}", 255u8 + 1);';
    lint(D(P), 'arithmetic_overflow', 5);
    lint(D('let s = (255u8 + 1).to_string();\n        println!("{}", s);'), 'arithmetic_overflow', 5);
    for (const T of ['let x: u8 = 255 + 1;\n        println!("{}", x);', 'println!("{}", 5 / 0);', 'println!("{}", 255u8 as u32 + 1);', 'let y = 255u8 + 1 + 0;\n        println!("{}", y);']) compiles(D(T));
    for (const head of ['    if false {\n', '    let c = false;\n    if c {\n', '    while false {\n']) compiles(D(P, head));
    compiles('    if true {\n    } else {\n        ' + P + '\n    }');
    compiles('    return;\n    ' + P);
    lint('    let n = 1;\n    if n == 1 {\n        return;\n    }\n    ' + P, 'arithmetic_overflow', 7);
    compiles('    let n = 1;\n    if n == 1 {\n        return;\n    }\n    let x: u8 = 255 + 1;\n    println!("{}", x);');
    compiles('    let n = 5u8;\n    match n {\n        1 => { ' + P + ' }\n        _ => {}\n    }');
    compiles('    let n = 5u8;\n    match n {\n        5 => {}\n        _ => { ' + P + ' }\n    }');
    for (const body of [
      '    let n = 5u8;\n    match n {\n        1 | 7..=9 => { ' + P + ' }\n        _ => {}\n    }',
      '    let n = 5u8;\n    match n {\n        1..=2 | 7..=9 => { ' + P + ' }\n        _ => {}\n    }',
      '    let n = 5u8;\n    match n {\n        1 => { ' + P + ' }\n        7..=9 => {}\n        _ => {}\n    }'
    ]) folding(body);
  });
  it('in a loop, what was known before the loop survives a value target; what the loop sets does not', () => {
    const err = (src) => { const c = RQ.run(src); return c.status === 'error' ? c.errors.map((e) => e.lint || e.code).join() : c.status; };
    assert.equal(err("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            println!(\"a\");\n        } else {\n            let z = x + 1;\n            println!(\"{}\", z);\n        }\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'a1');
    assert.equal(err("fn run(n: usize) {\n    let x = 255u8;\n    let mut i = 0;\n    while i < n {\n        if i > 100 {\n            println!(\"a\");\n        } else {\n            let z = x + 1;\n            println!(\"{}\", z);\n        }\n        i += 1;\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'a3');
    assert.equal(err("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if !(i > 100) {\n            let z = x + 1;\n            println!(\"{}\", z);\n        }\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'a4');
    assert.equal(err("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 || i > 50 {\n            println!(\"a\");\n        } else {\n            let z = x + 1;\n            println!(\"{}\", z);\n        }\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'a5');
    assert.equal(err("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        let ok = i > 100 || x + 1 > 3;\n        println!(\"{}\", ok);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'a6');
    assert.equal(err("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            println!(\"a\");\n        } else if i > 50 {\n            let z = x + 1;\n            println!(\"{}\", z);\n        }\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'a7');
    assert.equal(err("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        match i {\n            0 => println!(\"a\"),\n            1 => {\n                let z = x + 1;\n            println!(\"{}\", z);\n            }\n            _ => {}\n        }\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'a8');
    assert.equal(err("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        let y = i + 1;\n        if y > 100 {\n            println!(\"a\");\n        } else {\n            let z = x + 1;\n            println!(\"{}\", z);\n        }\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'a10');
    assert.ok(RQ.run("fn run(n: usize) {\n    for i in 0..n {\n        let x = 255u8;\n        if i > 100 {\n            println!(\"a\");\n        } else {\n            let z = x + 1;\n            println!(\"{}\", z);\n        }\n    }\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'a2');
    assert.ok(RQ.run("fn run(n: usize) {\n    let mut x = 0u8;\n    for i in 0..n {\n        x = 255;\n        if i > 100 {\n            println!(\"a\");\n        } else {\n            let z = x + 1;\n            println!(\"{}\", z);\n        }\n    }\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'a11');
    assert.ok(RQ.run("fn run(n: usize) {\n    let mut x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            println!(\"a\");\n        } else {\n            let z = x + 1;\n            println!(\"{}\", z);\n        }\n        x = 255;\n    }\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'a12');
    assert.ok(RQ.run("fn run(n: usize) {\n    let x = 255u8;\n    loop {\n        if n > 100 {\n            println!(\"a\");\n        } else {\n            let z = x + 1;\n            println!(\"{}\", z);\n        }\n        break;\n    }\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'a13');
    assert.ok(RQ.run("fn run(n: usize) {\n    let x = 255u8;\n    println!(\"a\");\n    if n > 100 {\n        println!(\"a\");\n    } else {\n        let z = x + 1;\n            println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'a15');
  });
  it('after an if on an unknown condition whose then returns, the code after sees nothing known from before; a panic or a loop leaves it in doubt', () => {
    const state = (src) => { const c = RQ.run(src); return c.status === 'error' ? c.errors.map((e) => e.lint || e.code).join() : c.status; };
    assert.ok(RQ.run("fn run(n: usize) {\n    let x = 255u8;\n    if n > 100 {\n        return;\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'j1');
    assert.ok(RQ.run("fn run(n: usize) {\n    let x = 255u8;\n    if n > 100 {\n        println!(\"a\");\n        return;\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'j2');
    assert.ok(RQ.run("fn run(n: usize) {\n    let x = 255u8;\n    if n > 100 {\n        return;\n    } else {\n        println!(\"b\");\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'j6');
    assert.ok(RQ.run("fn run(n: usize) {\n    let x = 255u8;\n    if n > 100 {\n        return;\n    }\n    let y = 5;\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'j8');
    assert.ok(RQ.run("fn run(n: usize) {\n    let x = 255u8;\n    if n > 100 {\n        return;\n    }\n    println!(\"{}\", x + 1);\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'j9');
    assert.ok(RQ.run("fn run(n: usize) {\n    let x = 255u8;\n    if n > 100 {\n        println!(\"a\");\n        return;\n    }\n    println!(\"b\");\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'j11');
    assert.ok(RQ.run("fn run(n: usize) {\n    let x = 255u8;\n    let v = vec![1];\n    if v.is_empty() {\n        return;\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'j13');
    assert.ok(RQ.run("fn run(n: usize) {\n    let x = 255u8;\n    if n > 100 {\n        return;\n    }\n    if n > 50 {\n        println!(\"c\");\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n").compiles(), 'j14');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    if n > 100 {\n        println!(\"a\");\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'j5');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    match n {\n        1 => return,\n        _ => {}\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'j7');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    if n > 100 {\n        return;\n    }\n    let z: u8 = 255 + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'j10');
    assert.equal(state("fn run(n: usize) {\n    if n > 100 {\n        return;\n    }\n    let x = 255u8;\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'j15');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    let mut t = 0;\n    if n > 100 {\n        t = 1;\n    }\n    println!(\"{}\", t);\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'j16');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    if n > 100 {\n        println!(\"a\");\n    } else {\n        return;\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'arithmetic_overflow', 'j19');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            break;\n        }\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'j3');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            break;\n        }\n        let z = x + 1;\n        println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'j4');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            continue;\n        }\n        let z = x + 1;\n        println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'j12');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    if n > 100 {\n        panic!(\"no\");\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'j17');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    while n > 100 {\n        return;\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'j18');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            return;\n        }\n        let z = x + 1;\n        println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k1');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            continue;\n        }\n        let z = x + 1;\n        println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k2');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            break;\n        }\n        let z = x + 1;\n        println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k3');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            println!(\"a\");\n            break;\n        }\n        let z = x + 1;\n        println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k4');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    let mut i = 0;\n    while i < n {\n        i += 1;\n        if i > 100 {\n            break;\n        }\n        let z = x + 1;\n        println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k5');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    let mut i = 0;\n    loop {\n        i += 1;\n        if i > 100 {\n            break;\n        }\n        let z = x + 1;\n        println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k6');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            continue;\n        }\n        println!(\"b\");\n        let z = x + 1;\n        println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k7');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            break;\n        }\n        println!(\"b\");\n        let z = x + 1;\n        println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k8');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            break;\n        }\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k9');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            continue;\n        }\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k10');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        if i > 100 {\n            return;\n        }\n    }\n    let z = x + 1;\n    println!(\"{}\", z);\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k11');
    assert.equal(state("fn run(n: usize) {\n    let x = 255u8;\n    for i in 0..n {\n        println!(\"{}\", i);\n        if i > 100 {\n            break;\n        }\n        let z = x + 1;\n        println!(\"{}\", z);\n    }\n}\n\nfn main() {\n    run(1);\n}\n"), 'unsupported', 'k12');
  });
  it('a trap in an arm the known scrutinee rules out is not linted, behind a guard too', () => {
    compiles('    let n = 3;\n    match n {\n        4 if n > 0 => {\n            let x: u8 = 255 + 1;\n        }\n        _ => {}\n    }');
  });
  it('a const item is a known operand', () => {
    lint('    let y = N + 1;\n    println!("{}", y);', 'arithmetic_overflow', 3, 'const N: u8 = 255;');
    lint('    let y = 1 + N;\n    println!("{}", y);', 'arithmetic_overflow', 3, 'const N: u8 = 255;');
    lint('    let y = N * 2;\n    println!("{}", y);', 'arithmetic_overflow', 3, 'const N: i32 = 2147483647;');
    lint('    let y = M + 1;\n    println!("{}", y);', 'arithmetic_overflow', 4, 'const N: u8 = 254;\nconst M: u8 = N + 1;');
    lint('    let x = N;\n    let y = x + 1;\n    println!("{}", y);', 'arithmetic_overflow', 4, 'const N: u8 = 255;');
    lint('    println!("{}", 5 / Z);', 'unconditional_panic', 3, 'const Z: i32 = 0;');
    lint('    let a = [1, 2, 3];\n    println!("{}", a[I]);', 'unconditional_panic', 4, 'const I: usize = 7;');
    assert.equal(ok('    let y = N + 1;\n    println!("{}", y);', 'const N: u8 = 2;').out(), '3\n');
  });
  it('a literal that does not fit its cast target is overflowing_literals; a negative one cast to an unsigned type is E0600', () => {
    for (const src of ['256 as u8', '300 as u8', '-129 as i8', '128 as i8', '65536 as u16', '3000000000 as i32', '(256) as u8', '256 as u8 as u32']) lint(`    let x = ${src};\n    println!("{}", x);`, 'overflowing_literals', 3);
    for (const [src, out] of [['255 as u8', '255'], ['-128 as i8', '-128'], ['256 as u16', '256'], ['300u16 as u8', '44']]) assert.equal(ok(`    let x = ${src};\n    println!("{}", x);`).out(), out + '\n');
    assert.equal(ok('    let n = 256;\n    println!("{}", n as u8);').out(), '0\n');
  });
  it('MIN / -1 and MIN % -1 are the unconditional_panic lint once both sides are known', () => {
    for (const op of ['/', '%']) lint(`    let a: i8 = -128;\n    let b: i8 = -1;\n    println!("{}", a ${op} b);`, 'unconditional_panic', 5);
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
