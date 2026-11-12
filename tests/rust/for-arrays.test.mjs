import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// The programs were compiled and run by the pinned rustc; the expected value is what it printed or reported.
const RQ = loadRust();
const verdict = (src) => {
  const c = RQ.run(src);
  if (c.status === 'error') return [...new Set(c.errors.map((e) => `${e.code || e.lint}@${e.line}`))].sort().join();
  if (c.status === 'panic') return `panic ${c.panic.msg}`;
  return c.status === 'ok' ? c.stdout : `${c.status} ${c.unsupported ? c.unsupported.feature : ''}`;
};

const RUNS = [
  [`fn main() {
    let mut a = [1, 2, 3];
    for x in &mut a {
        *x *= 2;
    }
    for x in &a {
        println!("{}", x);
    }
    let b = a;
    println!("{:?}", b);
}`, "2\n4\n6\n[2, 4, 6]\n"],
  [`fn main() {
    let mut a = [1, 2, 3];
    let r = &mut a;
    for x in r {
        *x += 1;
    }
    println!("{:?}", a);
}`, "[2, 3, 4]\n"],
  [`fn bump(a: &mut [i32; 3]) {
    for x in a {
        *x += 1;
    }
}
fn show(a: &[i32; 3]) {
    for x in a {
        print!("{} ", x);
    }
    println!();
}
fn main() {
    let mut a = [1, 2, 3];
    bump(&mut a);
    bump(&mut a);
    show(&a);
    show(&a);
}`, "3 4 5 \n3 4 5 \n"],
  [`fn total(xs: &[i32]) -> i32 {
    let mut t = 0;
    for x in xs {
        t += x;
    }
    t
}
fn main() {
    let a = [1, 2, 3];
    let v = vec![4, 5];
    println!("{} {}", total(&a), total(&v));
    println!("{}", total(&a));
}`, "6 9\n6\n"],
  [`fn main() {
    let mut grid = [[0; 3]; 2];
    for row in &mut grid {
        for cell in row {
            *cell += 1;
        }
    }
    for row in &grid {
        for cell in row {
            print!("{}", cell);
        }
        println!();
    }
}`, "111\n111\n"],
  [`fn main() {
    let a = [1, 2, 3];
    let mut b = a;
    for x in &mut b {
        *x *= 10;
    }
    println!("{:?} {:?}", a, b);
}`, "[1, 2, 3] [10, 20, 30]\n"],
  [`struct Bag {
    items: [i32; 3],
}
impl Bag {
    fn bump(&mut self) {
        for i in &mut self.items {
            *i += 1;
        }
    }
    fn total(&self) -> i32 {
        let mut t = 0;
        for i in &self.items {
            t += i;
        }
        t
    }
}
fn main() {
    let mut b = Bag { items: [1, 2, 3] };
    b.bump();
    println!("{}", b.total());
}`, "9\n"],
  [`fn main() {
    let a = [1, 2, 3];
    let mut sum = 0;
    for x in &a {
        for y in &a {
            sum += x * y;
        }
    }
    println!("{}", sum);
}`, "36\n"],
  [`fn main() {
    let a = [String::from("x"), String::from("y")];
    for s in &a {
        println!("{}", s);
    }
    let b = a;
    println!("{}", b[0]);
}`, "x\ny\nx\n"],
];

const REJECTS = [
  [`fn main() {
    let mut a = [1, 2, 3];
    for x in &mut a {
        let r = &a;
        *x = 0;
        println!("{:?}", r);
    }
}`, 'E0502@4'],
  [`fn main() {
    let mut a = [1, 2, 3];
    for x in &mut a {
        for y in &mut a {
            *y += 1;
        }
        *x = 0;
    }
}`, 'E0499@4'],
  [`fn main() {
    let mut a = [1, 2, 3];
    for x in &a {
        a = [0, 0, 0];
        println!("{}", x);
    }
}`, 'E0506@4'],
  [`fn main() {
    let a = [String::from("x"), String::from("y")];
    for s in &a {
        drop(a);
        println!("{}", s);
    }
}`, 'E0382@4,E0505@4'],
  [`fn main() {
    let mut a = [1, 2, 3];
    let r = &mut a;
    for x in r {
        *x += 1;
    }
    for x in r {
        *x += 1;
    }
}`, 'E0382@7'],
  [`fn bump(a: &mut [i32; 3]) {
    for x in a {
        *x += 1;
    }
    for x in a {
        *x += 1;
    }
}
fn main() {
    let mut a = [1, 2, 3];
    bump(&mut a);
}`, 'E0382@5'],
  [`fn main() {
    let a = [1, 2, 3];
    for x in &mut a {
        *x += 1;
    }
}`, 'E0596@3'],
  [`fn main() {
    let mut a = [1, 2, 3];
    for x in &mut a {
        println!("{:?}", a);
        *x = 0;
    }
}`, 'E0502@4'],
  [`fn main() {
    let a = [1, 2, 3];
    for x in &a {
        let y: &mut i32 = x;
        println!("{}", y);
    }
}`, 'E0308@4'],
  [`fn main() {
    let a: [u8; 3] = [100, 100, 100];
    let mut t: u8 = 0;
    for x in &a {
        t += x;
    }
    println!("{}", t);
}`, 'panic attempt to add with overflow'],
  [`fn main() {
    let a = [4, 2, 0];
    for x in &a {
        println!("{}", 8 / x);
    }
}`, 'panic attempt to divide by zero'],
];

describe('for over an array: `&a`, `&mut a`, a held `&[T; N]`, `&mut [T; N]` or `&[T]`', () => {
  it('runs as rustc does: elements by reference, mutation through `&mut`, nested rows, the array usable after, copies apart', () => {
    for (const [src, out] of RUNS) assert.equal(verdict(src), out, src);
  });
  it('is rejected, or panics, where rustc says so: a loan of the array for the whole loop, a `&mut` that the loop moves', () => {
    for (const [src, want] of REJECTS) assert.equal(verdict(src), want, src);
  });
  it('copying an array copies its rows too, and [row; n] makes n rows', () => {
    assert.equal(verdict('fn main() {\n    let mut g = [[0; 2]; 2];\n    for row in &mut g {\n        for c in row {\n            *c += 1;\n        }\n    }\n    println!("{:?}", g);\n}\n'), '[[1, 1], [1, 1]]\n');
    assert.equal(verdict('fn main() {\n    let a = [[1, 2], [3, 4]];\n    let mut b = a;\n    for row in &mut b {\n        for c in row {\n            *c = 0;\n        }\n    }\n    println!("{:?} {:?}", a, b);\n}\n'), '[[1, 2], [3, 4]] [[0, 0], [0, 0]]\n');
    assert.equal(verdict('fn main() {\n    let a = [1, 2];\n    let b = [a; 2];\n    let mut c = a;\n    for x in c.iter_mut() {\n        *x = 9;\n    }\n    println!("{:?} {:?} {:?}", a, b, c);\n}\n'), '[1, 2] [[1, 2], [1, 2]] [9, 9]\n');
  });
  it('what is not modeled keeps its hint: a part of an array, a use of the array while it is lent', () => {
    for (const [body, feature] of [
      ['let a = [1, 2, 3];\n    for x in &a[1..] {\n        println!("{}", x);\n    }', 'for iterable'],
      ['let mut a = [1, 2, 3];\n    for x in &mut a {\n        let n = a.len();\n        *x = n as i32;\n    }', 'use while borrowed'],
    ]) {
      const c = RQ.run(`fn main() {\n    ${body}\n}\n`);
      assert.equal(c.status, 'unsupported', body);
      assert.equal(c.unsupported.feature, feature, body);
      assert.ok(RQ.diag.hint(feature).length > 30, feature);
    }
  });
  it('an operation on the loop variable, a reference, is a call of the std impl: rustc does not lint it, a known zero divisor beside it panics at run time', () => {
    const loop = (iter, expr) => `fn main() {\n    let a = [1, 2];\n    let d = 0;\n    for x in ${iter} {\n        println!("{}", ${expr});\n    }\n}\n`;
    assert.equal(verdict(loop('&a', 'x / d')), 'panic attempt to divide by zero');
    assert.equal(verdict(loop('a.iter()', 'x / d')), 'panic attempt to divide by zero');
    assert.equal(verdict(loop('&a', '5 / d')), 'unconditional_panic@5');
  });
});
