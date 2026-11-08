import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const main = (body, items = '') => `${items}\nfn main() {\n${body}\n}\n`;

describe('RQ.run: programs that compile', () => {
  it('prints println!("{}", 1 + 2) as 3 with exit 0', () => {
    const c = RQ.run(main('    println!("{}", 1 + 2);'));
    assert.equal(c.status, 'ok');
    assert.equal(c.out(), '3\n');
    assert.equal(c.exit, 0);
    assert.equal(c.compiles(), true);
  });

  it('fills holes in order, by number, by name and from a variable, and escapes braces', () => {
    assert.equal(RQ.run(main('    println!("{} and {}", 1, "two");')).out(), '1 and two\n');
    assert.equal(RQ.run(main('    println!("{1}-{0}-{1}", 1, 2);')).out(), '2-1-2\n');
    assert.equal(RQ.run(main('    println!("{n}", n = 7);')).out(), '7\n');
    assert.equal(RQ.run(main('    let who = \'x\';\n    println!("<{who}> {{}}");')).out(), '<x> {}\n');
    assert.equal(RQ.run(main('    println!("{} {}", true, 5 > 3);')).out(), 'true true\n');
  });

  it('print! adds no newline and println!() prints an empty line; eprintln! goes to stderr', () => {
    const c = RQ.run(main('    print!("a");\n    print!("b");\n    println!();\n    eprintln!("oops");'));
    assert.equal(c.out(), 'ab\n');
    assert.equal(c.stderr, 'oops\n');
    assert.equal(c.exit, 0);
  });

  it('mut lets a variable change, shadowing makes a new one, a block scope ends', () => {
    assert.equal(RQ.run(main('    let mut x = 5;\n    x = 6;\n    x += 1;\n    println!("{}", x);')).out(), '7\n');
    assert.equal(RQ.run(main('    let x = 5;\n    let x = x * 2;\n    println!("{}", x);')).out(), '10\n');
    assert.equal(RQ.run(main('    let x = "five";\n    let x = 5;\n    println!("{}", x);')).out(), '5\n');
    assert.equal(RQ.run(main('    let x = 1;\n    {\n        let x = 2;\n        println!("{}", x);\n    }\n    println!("{}", x);')).out(), '2\n1\n');
  });

  it('const and fn with scalar parameters, a tail value and return', () => {
    assert.equal(RQ.run(main('    println!("{}", add(2, MAX));', 'const MAX: i32 = 10;\nfn add(a: i32, b: i32) -> i32 { a + b }')).out(), '12\n');
    assert.equal(RQ.run(main('    println!("{}", early(4));', 'fn early(n: u8) -> u8 {\n    return n + 1;\n}')).out(), '5\n');
  });

  it('does integer maths like Rust: truncating division, remainder sign, typed ranges', () => {
    assert.equal(RQ.run(main('    println!("{} {} {}", 7 / 2, -7 / 2, -7 % 3);')).out(), '3 -3 -1\n');
    assert.equal(RQ.run(main('    let a: u8 = 200;\n    let b: u8 = 55;\n    println!("{}", a + b);')).out(), '255\n');
  });
});

describe('RQ.run: E0384', () => {
  it('a second assignment to an immutable let is E0384 at that line', () => {
    const c = RQ.run(main('    let x = 5;\n    println!("{}", x);\n    x = 6;\n    println!("{}", x);'));
    assert.equal(c.status, 'error');
    assert.equal(c.hasError('E0384', 5), true);
    assert.equal(c.onlyError('E0384'), true);
    assert.equal(c.compiles(), false);
    assert.equal(c.errors[0].code, 'E0384');
    assert.equal('lint' in c.errors[0], false);
    assert.equal(c.out(), '');
  });

  it('a compound assignment and an assignment to a parameter are E0384 too', () => {
    assert.equal(RQ.run(main('    let x = 5;\n    x += 1;')).hasError('E0384', 4), true);
    assert.equal(RQ.run(main('    println!("{}", bump(1));', 'fn bump(n: i32) -> i32 {\n    n = n + 1;\n    n\n}')).hasError('E0384', 2), true);
  });

  it('every assignment to the same immutable variable is its own error', () => {
    const c = RQ.run(main('    let x = 1;\n    x = 2;\n    x = 3;'));
    assert.deepEqual(Array.from(c.errors, (e) => e.line), [4, 5]);
  });

  it('mut and shadowing pass', () => {
    assert.equal(RQ.run(main('    let mut x = 5;\n    x = 6;\n    println!("{}", x);')).status, 'ok');
    assert.equal(RQ.run(main('    let x = 5;\n    let x = 6;\n    println!("{}", x);')).status, 'ok');
  });

  it('an error in a function main never calls is still reported', () => {
    assert.equal(RQ.run(main('    println!("hi");', 'fn unused() {\n    let a = 1;\n    a = 2;\n}')).hasError('E0384', 3), true);
  });
});

describe('RQ.run: duplicate names', () => {
  it('a second fn or const with the same name is E0428 at the second one', () => {
    const f = RQ.run('fn f() {}\n\nfn f() {}\n\nfn main() {}\n');
    assert.equal(f.onlyError('E0428'), true);
    assert.equal(f.hasError('E0428', 3), true);
    assert.equal(RQ.run('const N: i32 = 1;\nconst N: i32 = 2;\nfn main() {}\n').hasError('E0428', 2), true);
    assert.equal(RQ.run('const f: i32 = 1;\nfn f() {}\nfn main() {}\n').hasError('E0428', 2), true);
  });
  it('a parameter name used twice is E0415 at the second one', () => {
    const c = RQ.run('fn pick(a: i32,\n    a: i32) -> i32 {\n    a\n}\nfn main() {}\n');
    assert.equal(c.onlyError('E0415'), true);
    assert.equal(c.hasError('E0415', 2), true);
  });
});

describe('RQ.run: literals, consts and ordering', () => {
  it('an unsuffixed literal outside i32 is overflowing_literals', () => {
    const c = RQ.run(main('    println!("{}", 2147483648 - 1);'));
    assert.equal(c.status, 'error');
    assert.equal(c.hasError('overflowing_literals', 3), true);
    assert.equal(RQ.run(main('    println!("{}", -2147483648 + 1);')).out(), '-2147483647\n');
    assert.equal(RQ.run(main('    let big: i64 = 3000000000;\n    println!("{}", big - 1);')).out(), '2999999999\n');
  });
  it('a const initializer that calls a fn is unsupported, not accepted', () => {
    const c = RQ.run('fn g() -> i32 { 1 }\nconst C: i32 = g();\nfn main() {\n    println!("{}", C);\n}\n');
    assert.equal(c.status, 'unsupported');
    assert.equal(c.unsupported.feature, 'const initializer');
    assert.equal(RQ.run('const A: i32 = 2;\nconst B: i32 = A * 3 + 1;\nfn main() {\n    println!("{}", B);\n}\n').out(), '7\n');
  });
  it('a fn main never calls is still linted, and a clean one is ok', () => {
    const want = { 'let x: u8 = 256;': 'overflowing_literals', 'println!("{}", 255u8 + 1);': 'arithmetic_overflow', 'println!("{}", 1 / 0);': 'unconditional_panic' };
    for (const [body, id] of Object.entries(want)) {
      const c = RQ.run(main('    println!("hi");', `fn unused() {\n    ${body}\n}`));
      assert.equal(c.status, 'error', body);
      assert.equal(c.hasError(id, 2), true, body);
    }
    assert.equal(RQ.run(main('    println!("hi");', 'fn spare() {}')).status, 'ok');
    assert.equal(RQ.run(main('    spare();', 'fn spare() {}')).status, 'ok');
  });
  it('every const is checked, read or not', () => {
    const c = RQ.run('const N: u8 = 300;\nfn main() {}\n');
    assert.equal(c.status, 'error');
    assert.equal(c.hasError('overflowing_literals', 1), true);
    assert.equal(RQ.run('const N: u8 = 3;\nfn main() {}\n').status, 'ok');
  });
  it('chars and text order by code point, not by UTF-16 unit', () => {
    assert.equal(RQ.run(main('    println!("{}", \'\\u{10000}\' > \'\\u{E000}\');')).out(), 'true\n');
    assert.equal(RQ.run(main('    println!("{}", "\\u{10000}" < "\\u{E000}");')).out(), 'false\n');
    assert.equal(RQ.run(main('    println!("{} {}", "ab" < "abc", \'a\' == \'a\');')).out(), 'true true\n');
  });
  it('the checker counts shadowing, reads of the old value and variable uses', () => {
    const c = RQ.run(main('    let price = 10;\n    let price = price + 5;\n    let other = 1;\n    let other = 2;\n    println!("{}", price);'));
    assert.equal(c.count('shadow'), 2);
    assert.equal(c.count('shadow-use'), 1);
    assert.equal(c.count('var-use'), 2);
    assert.equal(c.count('op'), 1);
  });
});

describe('RQ.run: syntax and format errors have no code', () => {
  it('a syntax error is status error with a line and no code', () => {
    const c = RQ.run('fn main() {\n    let x = 5\n}');
    assert.equal(c.status, 'error');
    assert.equal(c.errors[0].line, 2);
    assert.equal(c.errors[0].code, undefined);
    assert.equal(c.compiles(), false);
  });
  it('a missing main and a wrong format string are errors', () => {
    assert.equal(RQ.run('fn other() {}').status, 'error');
    assert.equal(RQ.run(main('    println!("{} {}", 1);')).status, 'error');
    assert.equal(RQ.run(main('    println!("{}", 1, 2);')).status, 'error');
    assert.equal(RQ.run(main('    println!("{");')).status, 'error');
  });
});

describe('RQ.run: unsupported is not an error', () => {
  const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src); return `${c.unsupported.feature}@${c.unsupported.line}`; };
  it('out-of-subset constructs give status unsupported with the feature and line, not a syntax error', () => {
    assert.equal(feature('fn main() {\n    unsafe { let x = 1; }\n}'), 'unsafe@2');
    assert.equal(feature('use std::collections::HashSet;\nfn main() {\n    let s: HashSet<i32> = HashSet::new();\n}'), 'HashSet@1');
    assert.equal(feature('fn show(x: &dyn Show) {}\nfn main() {}'), 'dyn@1');
  });
  it('constructs of later chapters give unsupported with a hint in the catalog', () => {
    assert.equal(feature('struct P { x: i32 }\nfn main() {}'), 'struct@1');
    assert.equal(feature('fn main() {\n    match 1 { _ => {} }\n}'), 'match@2');
    assert.equal(feature('fn main() {\n    let v = vec![1];\n}'), 'vec!@2');
    assert.equal(feature('fn main() {\n    let x: f32 = 2.5;\n}'), 'f32@2');
    assert.equal(feature('fn main() {\n    println!("{:#?}", 1);\n}'), 'format spec@2');
    assert.equal(RQ.run('fn main() {\n    if true { }\n    let x = 2.5;\n    println!("{:?} {}", 1, x);\n}').out(), '1 2.5\n');
  });
  it('an unannotated Some, Ok or Err call is unsupported, not E0425', () => {
    assert.equal(feature('fn main() {\n    let x = Some(1);\n}'), 'Option@2');
    assert.equal(feature('fn main() {\n    let x = Ok(1);\n}'), 'Result@2');
    assert.equal(feature('fn main() {\n    let e = 1;\n    let x = Err(e);\n}'), 'Result@3');
    assert.equal(RQ.run('fn main() {\n    let x = Nope(1);\n}').onlyError('E0425'), true);
  });
  it('unsupported wins over an error found in the same program, and over a syntax-valid E0384', () => {
    assert.equal(RQ.run('struct S;\nfn main() {\n    let x = 1;\n    x = 2;\n}').status, 'unsupported');
  });
  it('the checker rejects what rustc rejects with a code or lint, and does not guess the rest', () => {
    const id = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', src); return `${c.errors[0].code || c.errors[0].lint}@${c.errors[0].line}`; };
    assert.equal(id('fn main() {\n    let x: u8 = 256;\n}'), 'overflowing_literals@2');
    assert.equal(id('fn main() {\n    let a: u8 = 255;\n    println!("{}", a + 1);\n}'), 'arithmetic_overflow@3');
    assert.equal(id('fn main() {\n    println!("{}", 1 / 0);\n}'), 'unconditional_panic@2');
    assert.equal(id('fn main() {\n    println!("{}", y);\n}'), 'E0425@2');
    assert.equal(id('fn main() {\n    let x: i32 = "a";\n}'), 'E0308@2');
    assert.equal(id('fn main() {\n    let x = 3000000000;\n}'), 'overflowing_literals@2');
    assert.equal(feature('fn main() {\n    let x = 1 + 1.0;\n}'), 'type checking@2');
  });
  it('every feature the engine can report has a hint in the diag catalog', () => {
    for (const f of [...RQ.PARSE_FEATURES, ...RQ.CHECK_FEATURES, ...RQ.BORROW_FEATURES]) assert.ok(RQ.diag.UNSUPPORTED[f] && RQ.diag.UNSUPPORTED[f].length > 10, f);
    assert.ok(RQ.diag.hint('anything else').length > 0);
    for (const f of ['constructor', 'toString', '__proto__']) assert.equal(RQ.diag.hint(f), RQ.diag.hint('anything else'), f);
  });
});

describe('RQ.run: limits and determinism', () => {
  it('maxSteps stops a straight-line program with status limit', () => {
    const c = RQ.run(main('    println!("a");\n    println!("b");\n    println!("c");'), { maxSteps: 2 });
    assert.equal(c.status, 'limit');
    assert.equal(c.limit, 'steps');
    assert.equal(RQ.run(main('    println!("a");\n    println!("b");\n    println!("c");')).status, 'ok');
  });
  it('unbounded recursion stops at the depth cap', () => {
    const c = RQ.run(main('    again();', 'fn again() {\n    again();\n}'));
    assert.equal(c.status, 'limit');
    assert.equal(c.limit, 'depth');
  });
  it('two runs of the same source are identical', () => {
    const src = main('    let mut x = 1;\n    x += 2;\n    println!("{x}");\n    eprintln!("e");');
    const strip = (c) => JSON.stringify([c.status, c.errors, c.stdout, c.stderr, c.exit, c.unsupported]);
    assert.equal(strip(RQ.run(src)), strip(RQ.run(src)));
  });
});

describe('check context helpers', () => {
  const c = RQ.run(main('    let mut n = 1;\n    n = n + 1;\n    let n = n + 1;\n    println!("{} {}", n, n);'));
  it('counts constructs', () => {
    assert.equal(c.count('let'), 2);
    assert.equal(c.count('mut'), 1);
    assert.equal(c.count('assign'), 1);
    assert.equal(c.count('shadow'), 1);
    assert.equal(c.count('hole'), 2);
    assert.equal(c.usesMacro('println'), 1);
    assert.equal(c.usesMacro('print'), 0);
  });
  it('counts calls of a user fn', () => {
    const d = RQ.run(main('    println!("{}", f(1));', 'fn f(a: i32) -> i32 { a }'));
    assert.equal(d.calls('f'), 1);
    assert.equal(d.calls('g'), 0);
  });
  it('feature tags come from the tree', () => {
    const tags = RQ.features(main('    let mut x = 1;\n    x = 2;\n    println!("{}", x);'));
    for (const t of ['fn-main', 'let', 'mut', 'assign', 'macro', 'println', 'hole']) assert.ok(tags.has(t), t);
    assert.equal(tags.has('closure'), false);
    assert.equal(RQ.features('fn main( {').size, 0);
  });
});
