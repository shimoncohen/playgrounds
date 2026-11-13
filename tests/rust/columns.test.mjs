import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// Each program has one coded error, and the position is the one rustc 1.99.1 gives its primary span.
const RQ = loadRust();
const at = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', `${src} ${JSON.stringify(c.unsupported)}`); const e = c.errors.filter((x) => x.code || x.lint); assert.equal(e.length, 1, JSON.stringify(c.errors)); return `${e[0].line}:${e[0].col} ${e[0].code || e[0].lint}`; };
const main = (body, items = '') => `${items}fn main() {\n${body}\n}\n`;

describe('where a borrow error points', () => {
  it('at the name that was moved, inside a macro, a call, an operator and a tuple', () => {
    assert.equal(at(main('    let s = String::from("a");\n    let t = s;\n    println!("{}", s);')), '4:20 E0382');
    assert.equal(at(main('    let a = String::from("a");\n    let b = String::from("b");\n    let c = a;\n    println!("{} {}", b, a);')), '5:26 E0382');
    assert.equal(at(main('    let s = String::from("a");\n    take(s);\n    take(s);', 'fn take(_s: String) {}\n')), '5:10 E0382');
    assert.equal(at(main('    let s = String::from("a");\n    let n = (s, s);\n    println!("{}", n.0);')), '3:17 E0382');
    assert.equal(at(main('    let s = String::from("a");\n    let t = s;\n    let u = s + "b";')), '4:13 E0382');
  });

  it('at the argument that is moved while it is borrowed, or printed while it is mutably borrowed', () => {
    assert.equal(at(main('    let v = vec![1];\n    let r = &v;\n    drop(v);\n    println!("{:?}", r);')), '4:10 E0505');
    assert.equal(at(main('    let mut n = 1;\n    let r = &mut n;\n    println!("{}", n);\n    *r += 1;')), '4:20 E0502');
  });

  it('at the iterated expression of a for loop', () => {
    assert.equal(at(main('    let v = vec![1];\n    for x in &mut v {\n        println!("{}", x);\n    }')), '3:14 E0596');
    assert.equal(at(main('    let v = vec![String::from("a")];\n    for x in v {\n        println!("{}", x);\n    }\n    for y in v {\n        println!("{}", y);\n    }')), '6:14 E0382');
    assert.equal(at(main('    let a = [String::from("a")];\n    for &s in &a {\n        println!("{}", s);\n    }')), '3:15 E0507');
  });

  it('at the temporary, not the & in front of it', () => {
    assert.equal(at(main('    let mut r = &String::from("z");\n    r = &String::from("a");\n    println!("{}", r);')), '3:10 E0716');
    assert.equal(at(main('    let mut last = &0;\n    let n = 1;\n    for x in &[n, 2, 3] {\n        last = x;\n    }\n    println!("{}", last);')), '4:15 E0716');
  });

  it('at the name inside a closure that moves it out', () => {
    assert.equal(at(main('    let s = String::from("a");\n    apply(move || drop(s));', 'fn apply<F: Fn()>(f: F) {\n    f();\n}\n')), '6:24 E0507');
  });
});

describe('where other errors point', () => {
  it('a closure with the wrong shape is at the function it is passed to', () => {
    assert.equal(at(main('    println!("{}", apply(|a, b| a + b));', 'fn apply<F: Fn(i32) -> i32>(f: F) -> i32 {\n    f(1)\n}\n')), '5:20 E0593');
    assert.equal(at(main('    let v = vec![1, 2];\n    let s = v.iter().fold(0, |a| a);')), '3:22 E0593');
  });

  it('a lifetime that is not declared is at the lifetime', () => {
    assert.equal(at('fn show(x: &\'a str) {\n    println!("{}", x);\n}\nfn main() {\n    show("tide");\n}\n'), '1:13 E0261');
  });

  it('Copy with Drop is at the type name, and a wrong parameter count at the first parameter', () => {
    assert.equal(at('#[derive(Clone, Copy)]\nstruct D;\n\nimpl Drop for D {\n    fn drop(&mut self) {}\n}\n\nfn main() {}\n'), '2:8 E0184');
    assert.equal(at('trait T {\n    fn f(&self, n: i32) -> i32;\n}\n\nstruct S;\n\nimpl T for S {\n    fn f(&self) -> i32 {\n        1\n    }\n}\n\nfn main() {}\n'), '8:10 E0050');
  });

  it('a missing associated function is at its name', () => {
    assert.equal(at('struct P;\n\nfn main() {\n    let p = P::make();\n}\n'), '4:16 E0599');
  });

  it('a negative literal that does not fit is at the minus', () => {
    assert.equal(at(main('    let x = -129 as i8;\n    println!("{}", x);')), '2:13 overflowing_literals');
    assert.equal(at(main('    let x: i8 = -129;\n    println!("{}", x);')), '2:17 overflowing_literals');
  });

  it('a name or a value captured in a format string is inside the string', () => {
    assert.equal(at(main('    println!("{y}");')), '2:16 E0425');
    assert.equal(at(main('    let p = P;\n    println!("{p}");', 'struct P;\n')), '4:15 E0277');
  });

  it('a `&&` pattern that does not match is at the inner `&`', () => {
    assert.equal(at(main('    let a = [1, 2];\n    for &&x in &a {\n        println!("{}", x);\n    }')), '3:10 E0308');
  });
});
