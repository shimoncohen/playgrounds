import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// rustc gives a parenthesised expression the span of its `(`, so a panic, a lint or a type error inside it starts there;
// name resolution still points at the name. Whole programs with one verdict are corpus entries (paren-*); this file pins the columns.
const RQ = loadRust();
const at = (src) => { const c = RQ.run(src); assert.equal(c.status, 'panic', src); return `${c.panic.line}:${c.panic.col}`; };
const err = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', src); const e = c.errors[0]; return `${e.line}:${e.col} ${e.code || e.lint}`; };
const fn = (body, sig = 'x: u8, n: u8') => `fn f(${sig}) -> u8 {\n${body}\n}\n\nfn main() { println!("{}", f(250, 10)); }\n`;

describe('a panic inside parentheses starts at the opening parenthesis', () => {
  it('each operator, a tail, a nested pair and an operand of a larger expression', () => {
    assert.equal(at(fn('    let y = (x + n);\n    y')), '2:13');
    assert.equal(at(fn('    let y = (x - n);\n    y').replace('250, 10', '1, 2')), '2:13');
    assert.equal(at(fn('    let y = (x * n);\n    y')), '2:13');
    assert.equal(at(fn('    let y = (x / n);\n    y').replace('250, 10', '1, 0')), '2:13');
    assert.equal(at(fn('    let y = (x << n);\n    y', 'x: u8, n: u32').replace('250, 10', '1, 9')), '2:13');
    assert.equal(at(fn('    (x + n)')), '2:5');
    assert.equal(at(fn('    let y = ((x + n) + 1);\n    y')), '2:14');
    assert.equal(at(fn('    let y = (x + n) * 2;\n    y')), '2:13');
    assert.equal(at(fn('    let y = 2 * (x + n);\n    y')), '2:17');
    assert.equal(at(fn('    let y = ((x) + n);\n    y')), '2:13');
    assert.equal(at(fn('    let y = (x) + (n);\n    y')), '2:13');
  });

  it('a parenthesised argument and a compound assignment operand', () => {
    assert.equal(at('fn g(a: u8) -> u8 { a }\n' + fn('    g((x + n))')), '3:7');
    assert.equal(at(fn('    let mut y = x;\n    y += (n * 100);\n    y')), '3:10');
  });

  it('an index and a method call keep the position rustc gives them', () => {
    assert.equal(at('fn f(v: Vec<i32>, i: usize) -> i32 {\n    let y = (v[i]);\n    y\n}\n\nfn main() { println!("{}", f(vec![1], 5)); }\n'), '2:15');
    assert.equal(at('fn f(o: Option<i32>) -> i32 {\n    let y = (o.unwrap());\n    y\n}\n\nfn main() { println!("{}", f(None)); }\n'), '2:16');
  });
});

describe('a lint or an error inside parentheses', () => {
  it('lints start at the parenthesis', () => {
    assert.equal(err('fn main() {\n    let x: u8 = 250;\n    let y = (x + 10);\n    println!("{}", y);\n}\n'), '3:13 arithmetic_overflow');
    assert.equal(err('fn main() {\n    let x: i32 = (1 / 0);\n    println!("{}", x);\n}\n'), '2:18 unconditional_panic');
    assert.equal(err('fn main() {\n    let a = [1, 2, 3];\n    let i = 7;\n    println!("{}", (a[i]));\n}\n'), '4:20 unconditional_panic');
  });

  it('type and borrow errors start at the parenthesis, a missing name at the name', () => {
    assert.equal(err('fn main() {\n    let x: i32 = ("a");\n    println!("{}", x);\n}\n'), '2:18 E0308');
    assert.equal(err('fn main() {\n    let a = String::from("x");\n    let b = a;\n    let c = (a);\n    println!("{} {}", b, c);\n}\n'), '4:13 E0382');
    assert.equal(err('fn main() {\n    let a = 1;\n    let r = (&mut a);\n    *r += 1;\n}\n'), '3:13 E0596');
    assert.equal(err('fn main() {\n    let x = (y);\n    println!("{}", x);\n}\n'), '2:14 E0425');
    assert.equal(err('fn main() {\n    let x = ((y));\n    println!("{}", x);\n}\n'), '2:15 E0425');
  });
});
