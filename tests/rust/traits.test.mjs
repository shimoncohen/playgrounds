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

describe('what stays unsupported, and odd shapes never throw', () => {
  it('reports the construct with its hint', () => {
    assert.equal(feature(P('trait Make { fn make() -> Self; }', 'struct A;', 'impl Make for A { fn make() -> A { A } }', 'fn build<T: Make>() -> T { T::make() }', 'fn main() { let a: A = build(); }')), 'path call@4');
    assert.equal(feature(P('use std::fmt::Display;', 'fn f<T: Display>(x: T) -> impl Display { x }', 'fn main() {}')), 'impl Trait@2');
    assert.equal(feature(P('fn f<T: std::ops::Add>(a: T, b: T) {}', 'fn main() {}')), 'bounds@1');
    assert.equal(feature(P('fn f<const N: usize>() {}', 'fn main() {}')), 'generics@1');
    assert.equal(feature(P('fn f<T: Clone>(x: T) -> T { x }', 'fn main() {', '    let g = |a: i32| a;', '}')), 'closure@3');
    assert.equal(feature(P('use std::fmt;', 'struct W<T>(T);', 'impl<T: fmt::Display> fmt::Display for W<T> {', '    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result { write!(f, "{}", self.0) }', '}', 'fn main() {}')), 'impl@3');
    assert.equal(feature(P('struct S;', 'impl std::fmt::Debug for S {', '    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result { write!(f, "S") }', '}', 'fn main() {}')), 'impl@2');
    assert.equal(feature(P('fn id<T>(x: T) -> T { x }', 'fn main() {', '    let a = id::<i32>(1);', '}')), 'path call@3');
  });
  it('an open type that nothing decides is unsupported, not an error', () => {
    assert.equal(feature(P('struct S<T> { items: Vec<T> }', 'impl<T> S<T> { fn new() -> S<T> { S { items: Vec::new() } } }', 'fn main() {', '    let s = S::new();', '}')), 'inferred type@4');
  });
  it('odd sources are answered, never thrown', () => {
    const odd = ['impl impl Drop for N {}', 'trait T { fn f(); }\nstruct S;\nimpl T for S {}\nfn main() {}', 'fn f<T: >(x: T) {}\nfn main() {}', 'impl<T> T {}\nfn main() {}', 'struct S<T, T>(T);\nfn main() {}',
      'trait T { fn f(&self); }\nimpl T for &str { fn f(&self) {} }\nfn main() {}', 'trait T { fn f(&self); }\nimpl T for i32 { fn f(&self) {} }\nfn main() { 1.f(); }', 'fn f(x: impl) {}\nfn main() {}',
      'struct S<T>(T);\nimpl S { }\nfn main() {}', 'struct S<T>(T);\nimpl<T> S<T, T> { }\nfn main() {}', 'trait T { fn f(&self) -> Self; }\nfn g<U: T>(u: &U) -> U { u.f() }\nfn main() {}',
      'use std::fmt;\nstruct S;\nimpl fmt::Display for S { fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result { write!(f) } }\nfn main() { println!("{}", S); }',
      'use std::fmt;\nstruct S;\nimpl fmt::Display for S { fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result { write!(S, "x") } }\nfn main() {}',
      'struct S;\nimpl From<i32> for S { fn from(x: i32) -> S { S } }\nfn main() { let s: S = 1.into(); let t: S = 2.0.into(); }',
      'struct S;\nimpl From for S {}\nfn main() {}', 'trait A { fn f(&self); }\ntrait A {}\nfn main() {}'];
    for (const src of odd) assert.notEqual(RQ.run(src).status, 'internal', src);
  });
});

describe('a reference that could end up stored is not followed through a generic', () => {
  it('a result that takes the type parameter is unsupported when it is a reference, and a plain argument is fine', () => {
    assert.equal(feature(P('struct W<T> { v: T }', 'impl<T> W<T> { fn new(v: T) -> W<T> { W { v } } fn get(&self) -> &T { &self.v } }',
      'fn main() {', '    let mut s = String::from("a");', '    let w = W::new(&s);', '    s.push_str("b");', '    println!("{}", w.get());', '}')), 'generic reference@5');
    assert.equal(run(P('use std::fmt::Display;', 'fn show<T: Display>(x: T) { println!("{}", x); }', 'fn main() {', '    let mut s = String::from("a");', '    show(&s);', '    s.push_str("b");', '    show(&s);', '}')).stdout, 'a\nab\n');
  });
});

describe('names that resolve to the wrong kind, and conflicts with derives and std', () => {
  it('Copy on a type with Drop is E0184 at the type', () => {
    assert.equal(rejects(P('#[derive(Clone, Copy)]', 'struct D;', 'impl Drop for D { fn drop(&mut self) {} }', 'fn main() {}')), 'E0184@2');
    run(P('#[derive(Clone)]', 'struct D;', 'impl Drop for D { fn drop(&mut self) {} }', 'fn main() {}'));
  });
  it('Type::default() on a generic type with a derived Default is unsupported, not judged', () => {
    assert.equal(feature(P('#[derive(Default, Debug)]', 'struct W<T> { v: T }', 'fn main() {', '    let w: W<i32> = W::default();', '    println!("{:?}", w);', '}')), 'derive@4');
    assert.equal(run(P('#[derive(Default, Debug)]', 'struct W { v: i32 }', 'fn main() {', '    println!("{:?}", W::default());', '}')).stdout, 'W { v: 0 }\n');
  });
  it('a struct, enum, builtin type, type parameter, fn or module after impl or in a bound is E0404', () => {
    assert.equal(rejects(P('struct A;', 'struct B;', 'impl A for B {}', 'fn main() {}')), 'E0404@3');
    assert.equal(rejects(P('enum A { X }', 'fn f<T: A>(_x: T) {}', 'fn main() {}')), 'E0404@2');
    assert.equal(rejects(P('struct A;', 'fn f<T>(_x: T)', 'where', '    T: A,', '{}', 'fn main() {}')), 'E0404@4');
    assert.equal(rejects(P('struct B;', 'impl String for B {}', 'fn main() {}')), 'E0404@2');
    assert.equal(rejects(P('fn f<T, U: T>(_x: U) {}', 'fn main() {}')), 'E0404@1');
    assert.equal(rejects(P('fn f<U: i32>(_x: U) {}', 'fn main() {}')), 'E0404@1');
    assert.equal(rejects(P('struct B;', 'fn ff() {}', 'impl ff for B {}', 'fn main() {}')), 'E0404@3');
    assert.equal(rejects(P('struct B;', 'impl Nope for B {}', 'fn main() {}')), 'E0405@2');
  });
  it('From<T> for T clashes with the blanket impl, From<A> for B does not', () => {
    assert.equal(rejects(P('struct A;', 'impl From<A> for A { fn from(a: A) -> A { a } }', 'fn main() {}')), 'E0119@2');
    assert.equal(rejects(P('enum A { X }', 'impl From<A> for A { fn from(a: A) -> A { a } }', 'fn main() {}')), 'E0119@2');
    run(P('struct A;', 'struct B;', 'impl From<A> for B { fn from(_a: A) -> B { B } }', 'fn main() { let _b = B::from(A); }'));
  });
  it('pub inside a trait, a trait impl or on an impl is E0449', () => {
    assert.equal(rejects(P('trait T { fn f(&self); }', 'struct A;', 'impl T for A {', '    pub fn f(&self) {}', '}', 'fn main() {}')), 'E0449@4');
    assert.equal(rejects(P('trait T {', '    pub fn f(&self);', '}', 'fn main() {}')), 'E0449@2');
    assert.equal(rejects(P('struct A;', 'impl From<i32> for A {', '    pub fn from(_n: i32) -> A { A }', '}', 'fn main() {}')), 'E0449@3');
    assert.equal(rejects(P('struct B;', 'pub impl B {}', 'fn main() {}')), 'E0449@2');
    assert.equal(rejects(P('enum E {', '    pub X,', '}', 'fn main() {}')), 'E0449@2');
    run(P('struct B;', 'impl B { pub fn f(&self) {} }', 'fn main() { B.f(); }'));
  });
});
