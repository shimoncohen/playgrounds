import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();

describe('E0600 for a negated unsigned operand', () => {
  it('E0600 is for a literal an annotated let or a cast types, one error per minus on an unsigned operand', () => {
    const state = (src) => { const c = RQ.run(src); return c.status === 'error' ? [...c.errors].map((e) => e.code).join() : c.status; };
    assert.equal(state("fn main() {\n    let x = 5;\n    let y: u32 = -x;\n    println!(\"{}\", y);\n}\n"), 'unsupported', 'n1');
    assert.equal(state("fn main() {\n    let x = 3;\n    let z: u8 = -x;\n    println!(\"{}\", z);\n}\n"), 'unsupported', 'n2');
    assert.equal(state("fn main() {\n    let y: u32 = -(1 + 2);\n    println!(\"{}\", y);\n}\n"), 'unsupported', 'n3');
    assert.equal(state("fn main() {\n    let y: u32 = - -1;\n    println!(\"{}\", y);\n}\n"), 'E0600,E0600', 'n9');
    assert.equal(state("fn main() {\n    let x = 5;\n    let y = -x as u32;\n    println!(\"{}\", y);\n}\n"), "ok", 'n4');
    assert.equal(state("fn main() {\n    let y: u32 = -1;\n    println!(\"{}\", y);\n}\n"), "E0600", 'n7');
    assert.equal(state("fn main() {\n    let y: u32 = -(1);\n    println!(\"{}\", y);\n}\n"), "E0600", 'n8');
    assert.equal(state("fn main() {\n    let y: u32 = 5;\n    let z = - - y;\n    println!(\"{}\", z);\n}\n"), "E0600,E0600", 'n5');
    assert.equal(state("fn main() {\n    let y: u32 = 5;\n    let z = -(-y);\n    println!(\"{}\", z);\n}\n"), "E0600,E0600", 'n6');
    assert.equal(state("fn main() {\n    let y: u32 = 5;\n    let z = - - -y;\n    println!(\"{}\", z);\n}\n"), "E0600,E0600,E0600", 'n10');
  });
});

// Each program was compiled by the pinned rustc. A `-` literal is E0600 where the position already expects an unsigned type (an
// annotation, a parameter, a field, a variant, a branch of an `if` or `match`, a block tail, a comparison with a typed value), and
// E0277 (`u8: Neg`, once for each literal) where nothing expects anything and the type is only fixed by a later use.
const NEG = [
  [`fn f(x: i8) -> i8 {
    x
}
fn main() {
    println!("{}", f(-1));
}`, 'ok'],
  [`fn f(x: u8, y: i8) -> i8 {
    y
}
fn main() {
    println!("{}", f(-1, -1));
}`, 'E0600@5'],
  [`fn f(x: u8) -> u8 {
    x
}
fn main() {
    println!("{}", f(-1));
}`, 'E0600@5'],
  [`fn main() {
    let a: [u8; 2] = [-1, 2];
    println!("{:?}", a);
}`, 'E0600@2'],
  [`fn main() {
    let mut x: u8 = 0;
    x = -1;
    println!("{}", x);
}`, 'E0600@3'],
  [`fn main() {
    let x: u8 = {
        let y = 1;
        -3
    };
    println!("{}", x);
}`, 'E0600@4'],
  [`fn main() {
    let x: u8 = 1;
    println!("{}", -1 == x);
}`, 'E0277@3'],
  [`fn main() {
    let x: u8 = 5;
    println!("{}", x < -1);
}`, 'E0600@3'],
  [`fn main() {
    let x: u8 = 5;
    if x == -1 {
        println!("a");
    }
}`, 'E0600@3'],
  [`fn main() {
    let mut x: u8 = 3;
    x -= -1;
    println!("{}", x);
}`, 'E0277@3'],
  [`const C: u8 = -1;
fn main() {
    println!("{}", C);
}`, 'E0600@1'],
  [`fn main() {
    let y: u32 = - -1;
    println!("{}", y);
}`, 'E0600@2'],
  [`struct S {
    a: i8,
}
fn main() {
    let s = S { a: -1 };
    println!("{}", s.a);
}`, 'ok'],
  [`struct S {
    a: u8,
}
fn main() {
    let s = S { a: -1 };
    println!("{}", s.a);
}`, 'E0600@5'],
  [`fn main() {
    let a = [-1, 2];
    let b: [u8; 2] = a;
    println!("{:?}", b);
}`, 'E0277@2'],
  [`fn main() {
    let x = - -1;
    let y: u8 = x;
    println!("{}", y);
}`, 'E0277@2'],
  [`fn main() {
    let c = true;
    let x = if c { -1 } else { 2 };
    let y: u8 = x;
    println!("{}", y);
}`, 'E0277@3'],
  [`fn main() {
    let o = Some(-1);
    let p: Option<u8> = o;
    println!("{:?}", p);
}`, 'E0277@2'],
  [`fn main() {
    let t = (-1, 2);
    let u: (u8, i32) = t;
    println!("{:?}", u);
}`, 'E0277@2'],
  [`fn main() {
    let v = vec![-1];
    let w: Vec<u8> = v;
    println!("{:?}", w);
}`, 'E0277@2'],
  [`fn main() {
    let c = true;
    let x: i8 = if c { -3 } else { 2 };
    println!("{}", x);
}`, 'ok'],
  [`fn main() {
    let c = true;
    let x: u8 = if c { -3 } else { 2 };
    println!("{}", x);
}`, 'E0600@3'],
  [`fn main() {
    let x = 5;
    let y: u8 = x;
    let z = -x;
    println!("{} {}", y, z);
}`, 'E0600@4'],
  [`fn main() {
    let x = -1;
    let y: i8 = x;
    println!("{}", y);
}`, 'ok'],
  [`fn f(x: u8) {
    println!("{}", x);
}
fn main() {
    let a = -1;
    f(a);
}`, 'E0277@5'],
  [`fn main() {
    let x = -1;
    let y: u8 = x;
    println!("{}", y);
}`, 'E0277@2'],
  [`fn main() {
    let x: u8 = match 1 {
        1 => -1,
        _ => 2,
    };
    println!("{}", x);
}`, 'E0600@3'],
  [`fn main() {
    let r: Result<u8, String> = Ok(-1);
    println!("{:?}", r);
}`, 'E0600@2'],
  [`fn main() {
    let x = 5u8;
    let y = -1 * x;
    println!("{}", y);
}`, 'E0277@3'],
  [`fn main() {
    let x = 5u8;
    let y = x - -1;
    println!("{}", y);
}`, 'E0277@3'],
  [`fn main() {
    let mut v: Vec<u8> = Vec::new();
    v.push(-1);
    println!("{:?}", v);
}`, 'E0600@3'],
  [`fn f(x: &u8) {
    println!("{}", x);
}
fn main() {
    f(&-1);
}`, 'E0600@5'],
  [`fn f() -> u32 {
    return -1;
}
fn main() {
    println!("{}", f());
}`, 'E0600@2'],
  [`fn f() -> u8 {
    -1
}
fn main() {
    println!("{}", f());
}`, 'E0600@2'],
  [`fn main() {
    let o: Option<Option<u32>> = Some(Some(-1));
    println!("{:?}", o);
}`, 'E0600@2'],
  [`fn main() {
    let o: Option<u8> = Some(-1);
    println!("{:?}", o);
}`, 'E0600@2'],
  [`fn main() {
    let t: (i8, i8) = (-1, -1);
    println!("{:?}", t);
}`, 'ok'],
  [`struct S(u8);
fn main() {
    let s = S(-1);
    println!("{}", s.0);
}`, 'E0600@3'],
  [`fn main() {
    let t: (u8, i8) = (-1, -1);
    println!("{:?}", t);
}`, 'E0600@2'],
  [`fn main() {
    let x = 5;
    let z = -x;
    let y: u8 = x;
    println!("{} {}", y, z);
}`, 'E0277@3'],
  [`enum E {
    A(u8),
}
fn main() {
    let e = E::A(-1);
    match e {
        E::A(x) => println!("{}", x),
    }
}`, 'E0600@5'],
  [`fn main() {
    let v: Vec<i8> = vec![1, -1];
    println!("{:?}", v);
}`, 'ok'],
  [`fn main() {
    let v: Vec<u8> = vec![1, -1];
    println!("{:?}", v);
}`, 'E0600@2'],
];

describe('a negative literal where an unsigned type is expected', () => {
  it('is E0600 where the position expects the type, E0277 where a later use fixes it, and fine for a signed one', () => {
    for (const [src, want] of NEG) {
      const c = RQ.run(src);
      const got = c.status === 'error' ? [...new Set(c.errors.map((e) => `${e.code || e.lint}@${e.line}`))].sort().join() : c.status;
      assert.equal(got, want, src);
    }
  });
  it('one E0600 for each minus on a literal, one E0277 for the literal whose type a later use fixes', () => {
    const codes = (src) => RQ.run(src).errors.map((e) => `${e.code}@${e.line}:${e.col}`).join();
    assert.equal(codes('fn main() {\n    let y: u32 = - -1;\n    println!("{}", y);\n}\n'), 'E0600@2:18,E0600@2:20');
    assert.equal(codes('fn main() {\n    let x = - -1;\n    let y: u8 = x;\n    println!("{}", y);\n}\n'), 'E0277@2:15');
  });
  it('is unsupported where the expected type comes from somewhere not modeled', () => {
    for (const body of ['let x: u8 = loop {\n        break -1;\n    };', 'let v = vec![1, 2];\n    println!("{}", v[-1]);']) {
      assert.equal(RQ.run(`fn main() {\n    ${body}\n}\n`).status, 'unsupported', body);
    }
  });
});
