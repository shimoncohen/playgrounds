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

describe('From and ?', () => {
  const ERR = ['#[derive(Debug)]', 'enum AppError { Parse(String), Neg(i32) }', '#[derive(Debug)]', 'struct ParseFail(String);',
    'impl From<ParseFail> for AppError {', '    fn from(e: ParseFail) -> AppError { AppError::Parse(e.0) }', '}',
    'impl From<i32> for AppError {', '    fn from(n: i32) -> Self { AppError::Neg(n) }', '}',
    'fn parse(s: &str) -> Result<i32, ParseFail> {', '    if s == "x" { Err(ParseFail(String::from("bad"))) } else { Ok(1) }', '}',
    'fn neg(n: i32) -> Result<i32, i32> { if n < 0 { Err(n) } else { Ok(n) } }'];
  it('? converts the error with the matching From impl, and From and into agree', () => {
    const c = run(P(...ERR, 'fn run(s: &str, n: i32) -> Result<i32, AppError> {', '    let a = parse(s)?;', '    let b = neg(n)?;', '    Ok(a + b)', '}',
      'fn main() {', '    println!("{:?}", run("ok", 2));', '    println!("{:?}", run("x", 2));', '    println!("{:?}", run("ok", -3));',
      '    println!("{:?}", AppError::from(7));', '    let f: AppError = ParseFail(String::from("q")).into();', '    println!("{:?}", f);', '}'));
    assert.equal(c.stdout, 'Ok(3)\nErr(Parse("bad"))\nErr(Neg(-3))\nNeg(7)\nParse("q")\n');
  });
  it('a ? with no From impl for that error is E0277, and so is into and from', () => {
    assert.equal(rejects(P('#[derive(Debug)]', 'enum AppError { Parse(String) }', 'struct ParseFail(String);', 'fn parse(s: &str) -> Result<i32, ParseFail> { Err(ParseFail(String::from(s))) }',
      'fn run(s: &str) -> Result<i32, AppError> {', '    let a = parse(s)?;', '    Ok(a)', '}', 'fn main() { println!("{:?}", run("x")); }')), 'E0277@6');
    const M = ['#[derive(Debug)]', 'struct Meters(f64);', 'impl From<f64> for Meters { fn from(v: f64) -> Meters { Meters(v) } }'];
    assert.equal(rejects(P(...M, 'fn main() {', '    let x: i32 = 5;', '    let o: Meters = x.into();', '}')), 'E0277@6');
    assert.equal(rejects(P(...M, 'fn main() {', '    let m = Meters::from(String::from("a"));', '}')), 'E0277@5');
  });
  it('the impl must match From: its parameter, its result, a second impl', () => {
    const E = ['#[derive(Debug)]', 'enum AppError { Parse(String) }', 'struct ParseFail(String);'];
    assert.equal(rejects(P(...E, 'impl From<ParseFail> for AppError { fn from(e: i32) -> AppError { AppError::Parse(String::new()) } }', 'fn main() {}')), 'E0053@4');
    assert.equal(rejects(P(...E, 'impl From<ParseFail> for AppError { fn from(e: ParseFail) -> i32 { 1 } }', 'fn main() {}')), 'E0053@4');
    assert.equal(rejects(P(...E, 'impl From<ParseFail> for AppError { fn from(e: ParseFail) -> AppError { AppError::Parse(e.0) } }', 'impl From<ParseFail> for AppError { fn from(e: ParseFail) -> AppError { AppError::Parse(e.0) } }', 'fn main() {}')), 'E0119@5');
  });
});

describe('generic structs and enums', () => {
  const PAIR = ['use std::fmt::Display;', '#[derive(Debug, Clone, PartialEq)]', 'struct Pair<T> { a: T, b: T }', 'impl<T> Pair<T> {', '    fn new(a: T, b: T) -> Pair<T> { Pair { a, b } }',
    '    fn first(&self) -> &T { &self.a }', '    fn swap(self) -> Pair<T> { Pair { a: self.b, b: self.a } }', '}',
    'impl<T: Display + PartialOrd> Pair<T> {', '    fn show_largest(&self) {', '        if self.a > self.b { println!("largest {}", self.a); } else { println!("largest {}", self.b); }', '    }', '}',
    'impl Pair<f64> {', '    fn sum(&self) -> f64 { self.a + self.b }', '}'];
  it('builds, infers and runs methods of a generic struct', () => {
    const c = run(P(...PAIR, 'fn main() {', '    let p = Pair::new(3, 9);', '    p.show_largest();', '    println!("{} {:?}", p.first(), p.clone().swap());',
      '    let q = Pair { a: 1.5, b: 2.0 };', '    println!("{}", q.sum());', '    let s = Pair::new(String::from("x"), String::from("y"));', '    println!("{:?} {}", s, s == s.clone());', '}'));
    assert.equal(c.stdout, 'largest 9\n3 Pair { a: 9, b: 3 }\n3.5\nPair { a: "x", b: "y" } true\n');
  });
  it('runs a generic enum of your own', () => {
    const c = run(P('#[derive(Debug)]', 'enum Maybe<T> { Nothing, Just(T) }', 'impl<T> Maybe<T> {', '    fn is_just(&self) -> bool { match self { Maybe::Just(_) => true, Maybe::Nothing => false } }',
      '    fn or(self, d: T) -> T { match self { Maybe::Just(v) => v, Maybe::Nothing => d } }', '}',
      'fn main() {', '    let m: Maybe<i32> = Maybe::Just(4);', '    let n: Maybe<i32> = Maybe::Nothing;', '    println!("{} {} {}", m.is_just(), n.is_just(), n.or(7));', '    println!("{:?}", Maybe::Just("hi"));', '}'));
    assert.equal(c.stdout, 'true false 7\nJust("hi")\n');
  });
  it('mixed element types, wrong counts and unused parameters are rejected like rustc', () => {
    assert.equal(rejects(P('struct Pair<T> { a: T, b: T }', 'fn main() { let p = Pair { a: 1, b: 2.5 }; }')), 'E0308@2');
    assert.equal(rejects(P('struct Pair<T> { a: i32 }', 'fn main() {}')), 'E0392@1');
    assert.equal(rejects(P('struct Pair<T> { a: T }', 'fn show(p: Pair) {}', 'fn main() {}')), 'E0107@2');
    assert.equal(rejects(P('struct Pair<T> { a: T }', 'fn show(p: Pair<i32, i32>) {}', 'fn main() {}')), 'E0107@2');
    assert.equal(rejects(P('struct W<T> { v: T }', 'impl<T> W<T> { fn get(&self) -> T { self.v } }', 'fn main() {}')), 'E0507@2');
  });
  it('a method of a narrower impl needs the type and the bounds it names', () => {
    assert.equal(rejects(P('struct Pair<T> { a: T, b: T }', 'impl Pair<f64> { fn sum(&self) -> f64 { self.a + self.b } }', 'fn main() { let p = Pair { a: 1, b: 2 }; println!("{}", p.sum()); }')), 'E0599@3');
    assert.equal(rejects(P('struct Pair<T> { a: T, b: T }', 'impl<T: std::fmt::Display> Pair<T> { fn show(&self) { println!("{} {}", self.a, self.b); } }', 'struct Q;', 'fn main() { let p = Pair { a: Q, b: Q }; p.show(); }')), 'E0599@4');
  });
  it('moves and Copy follow the type arguments', () => {
    assert.equal(rejects(P('#[derive(Debug)]', 'struct W<T> { v: T }', 'fn main() { let w = W { v: String::from("a") }; let c = w; println!("{:?}", w); }')), 'E0382@3');
    assert.equal(run(P('#[derive(Debug, Clone, Copy)]', 'struct W<T> { v: T }', 'fn main() { let w = W { v: 1 }; let c = w; println!("{:?} {:?}", w, c); }')).stdout, 'W { v: 1 } W { v: 1 }\n');
  });
});
