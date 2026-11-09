import { describe, it } from 'node:test';
import strict from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const assert = strict;
const RQ = loadRust();
const P = (...lines) => lines.join('\n') + '\n';
const ids = (c) => c.errors.map((e) => `${e.code || e.lint}@${e.line}`).join(',');
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src + JSON.stringify(c.errors)); return `${c.unsupported.feature}@${c.unsupported.line}`; };
const run = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', src + JSON.stringify(c.errors) + JSON.stringify(c.unsupported)); return c; };
const rejects = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', src + JSON.stringify(c.unsupported)); return ids(c); };

const SPEAK = ['trait Speak {', '    fn name(&self) -> String;', '    fn speak(&self) -> String;', '    fn intro(&self) -> String {', '        format!("{} says {}", self.name(), self.speak())', '    }', '}'];
const DOG = ['struct Dog;', 'impl Speak for Dog {', '    fn name(&self) -> String { String::from("dog") }', '    fn speak(&self) -> String { String::from("woof") }', '}'];

describe('user traits', () => {
  it('runs a required method, a default method and an override', () => {
    const c = run(P(...SPEAK, ...DOG, 'struct Cat;', 'impl Speak for Cat {', '    fn name(&self) -> String { String::from("cat") }', '    fn speak(&self) -> String { String::from("meow") }',
      '    fn intro(&self) -> String { String::from("the cat ignores you") }', '}',
      'fn main() {', '    println!("{}", Dog.intro());', '    println!("{}", Cat.intro());', '}'));
    assert.equal(c.stdout, 'dog says woof\nthe cat ignores you\n');
  });
  it('calls a trait through a bound and through impl Trait, with the right type each time', () => {
    const c = run(P(...SPEAK, ...DOG, 'fn talk<T: Speak>(x: &T) -> String { x.speak() }', 'fn twice(x: &impl Speak) -> String { format!("{}{}", x.speak(), x.speak()) }',
      'fn calm<T>(x: &T) -> String where T: Speak { x.name() }',
      'fn main() {', '    let d = Dog;', '    println!("{} {} {}", talk(&d), twice(&d), calm(&d));', '    println!("{}", Speak::speak(&d));', '}'));
    assert.equal(c.stdout, 'woof woofwoof dog\nwoof\n');
  });
  it('checks the impl against its trait', () => {
    assert.equal(rejects(P(...SPEAK, 'struct D;', 'impl Speak for D {', '    fn name(&self) -> String { String::new() }', '}', 'fn main() {}')), 'E0046@9');
    assert.equal(rejects(P(...SPEAK, 'struct D;', 'impl Speak for D {', '    fn name(&self) -> String { String::new() }', '    fn speak(&self) -> String { String::new() }', '    fn roll(&self) {}', '}', 'fn main() {}')), 'E0407@12');
    assert.equal(rejects(P(...SPEAK, ...DOG, 'impl Speak for Dog {', '    fn name(&self) -> String { String::new() }', '    fn speak(&self) -> String { String::new() }', '}', 'fn main() {}')), 'E0119@13');
    assert.equal(rejects(P('trait T {', '    fn f(&self) -> i32;', '}', 'struct S;', 'impl T for S {', '    fn f(&self) -> bool { true }', '}', 'fn main() {}')), 'E0053@6');
    assert.equal(rejects(P('trait T {', '    fn f(&self) -> i32;', '}', 'struct S;', 'impl T for S {', '    fn f(&self, n: i32) -> i32 { n }', '}', 'fn main() {}')), 'E0050@6');
    assert.equal(rejects(P('struct S;', 'impl Nope for S {}', 'fn main() {}')), 'E0405@2');
  });
  it('a type without the impl has no method and fails the bound', () => {
    assert.equal(rejects(P(...SPEAK, ...DOG, 'struct Cat;', 'fn main() {', '    let c = Cat;', '    println!("{}", c.speak());', '}')), 'E0599@16');
    assert.equal(rejects(P(...SPEAK, ...DOG, 'struct Cat;', 'fn talk<T: Speak>(x: &T) -> String { x.speak() }', 'fn main() {', '    let c = Cat;', '    println!("{}", talk(&c));', '}')), 'E0277@17');
  });
  it('what stays unsupported', () => {
    assert.equal(feature(P('trait T: Clone {}', 'fn main() {}')), 'trait@1');
    assert.equal(feature(P('trait T {', '    type A;', '}', 'fn main() {}')), 'trait@1');
    assert.equal(feature(P('trait T<X> {}', 'fn main() {}')), 'trait@1');
    assert.equal(feature(P('fn f(x: &dyn Show) {}', 'fn main() {}')), 'dyn@1');
    assert.equal(feature(P('struct S;', 'impl Clone for S {', '    fn clone(&self) -> S { S }', '}', 'fn main() {}')), 'impl@2');
  });
});

describe('generic functions and bounds', () => {
  it('largest over numbers and floats', () => {
    const c = run(P('fn largest<T: PartialOrd + Copy>(list: &[T]) -> T {', '    let mut big = list[0];', '    for i in 0..list.len() {', '        if list[i] > big { big = list[i]; }', '    }', '    big', '}',
      'fn main() {', '    let a = [3, 9, 2];', '    let b = [1.5, 0.5];', '    println!("{}", largest(&a));', '    println!("{}", largest(&b));', '}'));
    assert.equal(c.stdout, '9\n1.5\n');
  });
  it('a body can use only what its bounds give', () => {
    assert.equal(rejects(P('fn big<T>(a: T, b: T) -> bool { a > b }', 'fn main() {}')), 'E0369@1');
    assert.equal(rejects(P('fn add<T>(a: T, b: T) -> T { a + b }', 'fn main() {}')), 'E0369@1');
    assert.equal(rejects(P('fn show<T>(a: T) { println!("{}", a); }', 'fn main() {}')), 'E0277@1');
    assert.equal(rejects(P('fn dup<T>(a: T) -> T { a.clone() }', 'fn main() {}')), 'E0599@1');
    assert.equal(rejects(P('fn dup<T>(a: T) -> (T, T) { (a, a) }', 'fn main() {}')), 'E0382@1');
    assert.equal(run(P('fn dup<T: Copy>(a: T) -> (T, T) { (a, a) }', 'fn main() {', '    println!("{:?}", dup(2));', '}')).stdout, '(2, 2)\n');
  });
  it('a call must meet the bound', () => {
    assert.equal(rejects(P('fn eq<T: PartialEq>(a: T, b: T) -> bool { a == b }', 'struct Q;', 'fn main() {', '    println!("{}", eq(Q, Q));', '}')), 'E0277@4');
    assert.equal(rejects(P('fn dup<T: Copy>(a: T) -> (T, T) { (a, a) }', 'fn main() {', '    let q = dup(String::from("x"));', '}')), 'E0277@3');
  });
  it('an unknown or unimported bound is E0405 and nothing else', () => {
    assert.equal(rejects(P('fn f<T: Nope>(x: T) {}', 'fn main() {}')), 'E0405@1');
    assert.equal(rejects(P('fn show<T: Display>(x: T) { println!("{}", x); }', 'fn main() {}')), 'E0405@1');
  });
  it('a result that would carry a reference is unsupported', () => {
    assert.equal(feature(P('fn id<T>(x: T) -> T { x }', 'fn main() {', '    let s = String::from("a");', '    let r = id(&s);', '}')), 'generic reference@4');
  });
});

describe('Display', () => {
  const POINT = ['use std::fmt;', 'struct Point { x: i32, y: i32 }', 'impl fmt::Display for Point {', '    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {', '        write!(f, "({}, {})", self.x, self.y)', '    }', '}'];
  it('prints through {}, to_string, format! and a Display bound; width is ignored as rustc does', () => {
    const c = run(P(...POINT, 'fn show<T: fmt::Display>(x: T) -> String { format!("[{}]", x) }',
      'fn main() {', '    let p = Point { x: 1, y: -2 };', '    println!("{}", p);', '    println!("{:>10}|", p);', '    let s = p.to_string();', '    println!("{} {}", s, s.len());', '    println!("{}", show(p));', '}'));
    assert.equal(c.stdout, '(1, -2)\n(1, -2)|\n(1, -2) 7\n[(1, -2)]\n');
  });
  it('Debug does not stand in for Display, and Display not for Debug', () => {
    assert.equal(rejects(P('struct P;', 'fn main() {', '    println!("{}", P);', '}')), 'E0277@3');
    assert.equal(rejects(P(...POINT, 'fn main() {', '    println!("{:?}", Point { x: 1, y: 2 });', '}')), 'E0277@9');
  });
  it('the fmt signature is the trait\'s', () => {
    assert.equal(rejects(P('use std::fmt;', 'struct P;', 'impl fmt::Display for P {', '    fn fmt(&self, f: &mut fmt::Formatter) -> String { String::new() }', '}', 'fn main() {}')), 'E0053@4');
  });
});

describe('Drop with any body', () => {
  it('runs a body with a local, a return and a call, in rustc order', () => {
    const c = run(P('struct G(i32);', 'impl Drop for G {', '    fn drop(&mut self) {', '        let doubled = self.0 * 2;', '        if doubled > 2 { println!("big {}", doubled); return; }', '        println!("drop {}", self.0);', '    }', '}',
      'fn main() {', '    let _a = G(1);', '    let _b = G(5);', '    println!("end");', '}'));
    assert.equal(c.stdout, 'end\nbig 10\ndrop 1\n');
  });
  it('calling drop by hand is E0040, two Drop impls are E0119', () => {
    assert.equal(rejects(P('struct G;', 'impl Drop for G { fn drop(&mut self) {} }', 'fn main() {', '    let g = G;', '    g.drop();', '}')), 'E0040@5');
    assert.equal(rejects(P('struct G;', 'impl Drop for G { fn drop(&mut self) {} }', 'impl Drop for G { fn drop(&mut self) {} }', 'fn main() {}')), 'E0119@3');
  });
});
