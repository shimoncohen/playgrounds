import { describe, it } from 'node:test';
import strict from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const assert = { ...strict, deepEqual: (a, b, msg) => strict.equal(JSON.stringify(a), JSON.stringify(b), msg) };
const RQ = loadRust();
const P = (...lines) => lines.join('\n') + '\n';
const main = (...body) => P('fn main() {', ...body.map((l) => '    ' + l), '}');
const ids = (c) => c.errors.map((e) => `${e.code || e.lint}@${e.line}`).join(',');
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src); return `${c.unsupported.feature}@${c.unsupported.line}`; };
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', src + JSON.stringify(c.errors) + JSON.stringify(c.unsupportedAll) + (c.message || '')); return c.stdout; };
const PT = ['#[derive(Debug, Clone, Copy, PartialEq)]', 'struct Pt {', '    x: i32,', '    y: i32,', '}'];
const NAMED = ['struct P {', '    a: String,', '    b: String,', '    n: i32,', '}'];
const mkP = '    let mut p = P { a: String::from("a"), b: String::from("b"), n: 1 };';

describe('structs: named, tuple and unit', () => {
  it('build, read and write fields of each form', () => {
    assert.equal(out(P('struct W(i32, String);', 'struct U;', ...NAMED, 'fn main() {', '    let mut w = W(1, String::from("x"));', '    w.0 += 4;', '    w.1.push_str("y");', '    let _u = U;',
      mkP, '    p.n = p.n + 1;', '    p.a = String::from("z");', '    println!("{} {} {} {} {}", w.0, w.1, p.a, p.b, p.n);', '}')), '5 xy z b 2\n');
  });
  it('a derived Copy struct copies on assignment and on a call, and a write changes only the copy', () => {
    assert.equal(out(P(...PT, 'fn show(p: Pt) -> i32 { p.x }', 'fn main() {', '    let a = Pt { x: 1, y: 2 };', '    let mut b = a;', '    b.x = 9;', '    println!("{} {} {} {:?}", show(a), show(a), show(b), a);', '}')), '1 1 9 Pt { x: 1, y: 2 }\n');
  });
  it('a struct without Copy moves, and the move is E0382 on the next use', () => {
    const c = RQ.run(P(...NAMED.slice(0, 1), '    n: i32,', '}', 'fn take(p: P) {}', 'fn main() {', '    let p = P { n: 1 };', '    take(p);', '    take(p);', '}'));
    assert.equal(ids(c), 'E0382@8');
    assert.equal(c.errors[0].msg, 'use of moved value: `p`');
  });
  it('a missing field is E0609, a field of a tuple past its end too', () => {
    assert.equal(ids(RQ.run(P(...PT, 'fn main() {', '    let p = Pt { x: 1, y: 2 };', '    println!("{}", p.z);', '}'))), 'E0609@8');
    assert.equal(ids(RQ.run(main('let t = (1, 2);', 'println!("{}", t.2);'))), 'E0609@3');
  });
  it('shapes that are not modeled stay unsupported with a hint', () => {
    assert.equal(feature(P('struct P<T: Clone> {', '    x: T,', '}', 'fn main() {}')), 'struct@1');
    assert.equal(feature(P('struct P<'+"'a"+'> {', '    x: &'+"'a"+' mut str,', '}', 'fn main() {}')), 'struct@1');
    assert.equal(feature(P('struct P {', '    o: Option<&str>,', '}', 'fn main() {}')), 'struct@1');
    assert.equal(feature(P('struct P {', '    o: Option<P>,', '}', 'fn main() {}')), 'struct@1');
    assert.equal(feature(P('struct P(i32);', 'fn P() {}', 'fn main() {}')), 'struct@1');
    assert.equal(feature(P(...PT, 'fn main() {', '    let a = Pt { x: 1, y: 2 };', '    let b = Pt { x: 5, ..a };', '}')), 'struct literal@8');
  });
});

describe('derive', () => {
  it('Debug prints as rustc does, plain and pretty, for every shape', () => {
    const src = P('#[derive(Debug)]', 'struct N {', '    id: u8,', '    tag: Option<String>,', '    pair: (i32, f64),', '}', '#[derive(Debug)]', 'struct T(i32, String);', '#[derive(Debug)]', 'struct U;',
      '#[derive(Debug)]', 'enum E {', '    A,', '    B(i32, String),', '    C { x: i32 },', '}',
      'fn main() {',
      '    let n = N { id: 1, tag: Some(String::from("t")), pair: (2, 2.5) };',
      '    println!("{:?}", n);', '    println!("{:#?}", n);',
      '    println!("{:?} {:?} {:?} {:?} {:?}", T(1, String::from("s")), U, E::A, E::B(2, String::from("b")), E::C { x: 3 });',
      '    println!("{:#?}", [E::B(1, String::new()), E::C { x: 0 }]);', '    println!("{:#?}", (E::A, 1));',
      '}');
    assert.equal(out(src), 'N { id: 1, tag: Some("t"), pair: (2, 2.5) }\nN {\n    id: 1,\n    tag: Some(\n        "t",\n    ),\n    pair: (\n        2,\n        2.5,\n    ),\n}\n'
      + 'T(1, "s") U A B(2, "b") C { x: 3 }\n[\n    B(\n        1,\n        "",\n    ),\n    C {\n        x: 0,\n    },\n]\n(\n    A,\n    1,\n)\n');
  });
  it('Clone gives a deep copy, PartialEq compares every field', () => {
    const c = RQ.run(P('#[derive(Debug, Clone, PartialEq)]', 'struct P {', '    s: String,', '    n: i32,', '}', 'fn main() {', '    let a = P { s: String::from("x"), n: 1 };', '    let mut b = a.clone();',
      '    println!("{} {}", a == b, a != b);', '    b.n = 2;', '    b.s.push_str("y");', '    println!("{} {:?} {:?}", a == b, a, b);', '}'));
    assert.equal(c.stdout, 'true false\nfalse P { s: "x", n: 1 } P { s: "xy", n: 2 }\n');
    assert.equal(c.allocs('String'), 2);
  });
  it('a missing trait is an error at the use: Display and Debug E0277, == E0369, clone E0599', () => {
    const q = (extra, body) => RQ.run(P('struct P {', '    n: i32,', '}', 'fn main() {', '    let p = P { n: 1 };', '    let q = P { n: 1 };', `    ${body}`, '}', extra));
    assert.equal(ids(q('', 'println!("{}", p);')), 'E0277@7');
    assert.equal(ids(q('', 'println!("{:?}", p);')), 'E0277@7');
    assert.equal(ids(q('', 'println!("{p}");')), 'E0277@7');
    assert.equal(ids(q('', 'let b = p == q;')), 'E0369@7');
    assert.equal(ids(q('', 'let c = p.clone();')), 'E0599@7');
    assert.equal(RQ.run(main('let o = Some(5);', 'println!("{}", o);')).errors[0].msg, '`Option<{integer}>` doesn\'t implement `std::fmt::Display`');
  });
  it('a derive the type cannot honor, or one that is not modeled, is unsupported', () => {
    assert.equal(feature(P('#[derive(Ord)]', 'struct P {', '    n: i32,', '}', 'fn main() {}')), 'derive@2');
    assert.equal(feature(P('#[derive(PartialOrd)]', 'struct P {', '    n: i32,', '}', 'fn main() {}')), 'derive@2');
    assert.equal(feature(P('#[derive(Clone, Copy)]', 'struct P {', '    s: String,', '}', 'fn main() {}')), 'derive@2');
    assert.equal(feature(P('#[derive(Copy)]', 'struct P {', '    n: i32,', '}', 'fn main() {}')), 'derive@2');
    assert.equal(feature(P('#[derive(PartialEq, Eq)]', 'struct P {', '    f: f64,', '}', 'fn main() {}')), 'derive@2');
    assert.equal(feature(P('#[derive(Debug)]', 'struct Q;', '#[derive(Debug, Clone)]', 'struct P {', '    q: Q,', '}', 'fn main() {}')), 'derive@4');
    assert.equal(feature(P('#[allow(dead_code)]', 'struct P {', '    n: i32,', '}', 'fn main() {}')), 'derive@2');
  });
});

describe('enums, match and exhaustiveness', () => {
  const SHAPE = ['enum Shape {', '    Dot,', '    Circle(i32),', '    Rect { w: i32, h: i32 },', '}'];
  it('match picks the arm of the variant and binds the payload', () => {
    assert.equal(out(P(...SHAPE, 'fn area(s: Shape) -> i32 {', '    match s {', '        Shape::Dot => 0,', '        Shape::Circle(r) => 3 * r * r,', '        Shape::Rect { w, h } => w * h,', '    }', '}',
      'fn main() {', '    println!("{} {} {}", area(Shape::Dot), area(Shape::Circle(2)), area(Shape::Rect { w: 3, h: 4 }));', '}')), '0 12 12\n');
  });
  it('a match on a reference binds references to the payload, and `_` and a name catch the rest', () => {
    assert.equal(out(P(...SHAPE, 'fn name(s: &Shape) -> i32 {', '    match s {', '        Shape::Circle(r) => *r,', '        Shape::Rect { w, .. } => *w + 100,', '        _ => -1,', '    }', '}',
      'fn main() {', '    let a = Shape::Circle(5);', '    let b = Shape::Rect { w: 1, h: 2 };', '    let c = Shape::Dot;', '    println!("{} {} {}", name(&a), name(&b), name(&c));', '    let s = Shape::Dot;', '    let k = match s { Shape::Dot => 0, other => 1 };', '    println!("{}", k);', '}')), '5 101 -1\n0\n');
  });
  it('a missing variant is E0004 at the scrutinee, and a catch-all makes it complete', () => {
    const c = RQ.run(P(...SHAPE, 'fn main() {', '    let s = Shape::Dot;', '    match s {', '        Shape::Dot => {}', '        Shape::Circle(_) => {}', '    }', '}'));
    assert.equal(ids(c), 'E0004@8');
    assert.equal(c.errors[0].msg, 'non-exhaustive patterns: `Shape::Rect { .. }` not covered');
    assert.equal(RQ.run(P('enum E {', '    A,', '    B(i32, i32),', '    C,', '    D,', '    F,', '}', 'fn main() {', '    match E::A {', '        E::A => {}', '    }', '}')).errors[0].msg,
      'non-exhaustive patterns: `E::B(_, _)`, `E::C`, `E::D` and 1 more not covered');
    assert.equal(RQ.run(main('let o: Option<i32> = None;', 'match o {', '    Some(_) => {}', '}')).errors[0].msg, 'non-exhaustive patterns: `None` not covered');
  });
  it('the arms must agree on a type', () => {
    assert.equal(ids(RQ.run(P(...SHAPE, 'fn main() {', '    let s = Shape::Dot;', '    let x = match s {', '        Shape::Dot => 1,', '        _ => "a",', '    };', '}'))), 'E0308@10');
  });
  it('a name that moves a String out of the scrutinee leaves it partly moved, as in Rust', () => {
    const E = ['enum E {', '    A(String),', '    B,', '}'];
    assert.equal(ids(RQ.run(P(...E, 'fn main() {', '    let e = E::A(String::new());', '    match e {', '        E::A(s) => println!("{}", s),', '        E::B => {}', '    }', '    match e {', '        E::A(_) => {}', '        E::B => {}', '    }', '}'))), 'E0382@11');
    const c = RQ.run(P(...E, 'fn main() {', '    let e = E::A(String::new());', '    match e {', '        E::A(s) => println!("{}", s),', '        E::B => {}', '    }', '    println!("{:?}", 1);', '    let f = e;', '}'));
    assert.equal(ids(c), 'E0382@12');
    assert.equal(c.errors[0].msg, 'use of partially moved value: `e`');
    // a reference does not move, and `_` does not bind
    assert.equal(out(P(...E, 'fn main() {', '    let e = E::A(String::from("k"));', '    match &e {', '        E::A(s) => println!("{}", s),', '        E::B => {}', '    }', '    match e {', '        E::A(_) => println!("kept"),', '        E::B => {}', '    }', '    let f = e;', '}')), 'k\nkept\n');
  });
  it('moving a name out from behind a reference is E0507', () => {
    const E = ['enum E {', '    A(String),', '    B,', '}', 'struct W {', '    e: E,', '}'];
    const c = RQ.run(P(...E, 'fn f(w: &W) {', '    match w.e {', '        E::A(s) => println!("{}", s),', '        E::B => {}', '    }', '}', 'fn main() {}'));
    assert.equal(ids(c), 'E0507@9');
    assert.equal(c.errors[0].msg, 'cannot move out of `w.e` as enum variant `A` which is behind a shared reference');
  });
  it('a &mut scrutinee is unsupported', () => {
    assert.equal(feature(P(...SHAPE, 'fn main() {', '    let mut s = Shape::Dot;', '    match &mut s {', '        _ => {}', '    }', '}')), 'match@8');
  });
  it('a variant with a number after it is unsupported, and an enum that holds itself too', () => {
    assert.equal(feature(P('enum E {', '    A = 1,', '}', 'fn main() {}')), 'enum@1');
    assert.equal(feature(P('enum E {', '    A(Option<E>),', '}', 'fn main() {}')), 'enum@1');
  });
});

describe('Option and Result', () => {
  it('build, print and match them, with the type fixed by an annotation, a function type or the other arm', () => {
    assert.equal(out(P('fn half(n: i32) -> Option<i32> {', '    if n % 2 == 0 { Some(n / 2) } else { None }', '}',
      'fn parse(n: i32) -> Result<i32, String> {', '    if n < 0 { Err(String::from("neg")) } else { Ok(n) }', '}',
      'fn main() {', '    let a: Option<String> = None;', '    let b = Some(String::from("s"));', '    println!("{:?} {:?} {:?} {:?}", a, b, half(4), half(3));',
      '    println!("{:?} {:?}", parse(2), parse(-2));', '    match half(8) {', '        Some(n) => println!("half {}", n),', '        None => println!("odd"),', '    }', '}')),
      'None Some("s") Some(2) None\nOk(2) Err("neg")\nhalf 4\n');
  });
  it('a None or Ok that nothing types is unsupported (rustc: E0282), and Some(1) builds an Option', () => {
    assert.equal(feature(main('let x = None;')), 'inferred type@2');
    assert.equal(feature(main('let x = Ok(1);')), 'inferred type@2');
    assert.equal(out(main('let x = Some(1);', 'println!("{:?}", x);')), 'Some(1)\n');
  });
  it('is_some, unwrap, expect and unwrap_or work, and a failing unwrap panics where rustc does', () => {
    assert.equal(out(main('let a = Some(2);', 'let n: Option<i32> = None;', 'let r: Result<i32, String> = Err(String::from("e"));', 'println!("{} {} {} {} {}", a.is_some(), n.is_none(), r.is_err(), n.unwrap_or(7), a.unwrap());', 'println!("{}", r.is_ok());')),
      'true true true 7 2\nfalse\n');
    const c = RQ.run(main('let n: Option<i32> = None;', 'println!("start");', 'let x = n.unwrap();'));
    assert.equal(c.status, 'panic');
    assert.deepEqual(c.panic, { msg: 'called `Option::unwrap()` on a `None` value', line: 4, col: 15 });
    const d = RQ.run(main('let r: Result<i32, String> = Err(String::from("bad"));', 'let x = r.expect("it failed");'));
    assert.equal(d.panic.msg, 'it failed: "bad"');
    assert.equal(d.panic.col, 15);
  });
  it('a closure argument is modeled', () => {
    assert.equal(RQ.run(main('let a = Some(2);', 'let b = a.map(|x| x + 1);', 'println!("{:?}", b);')).stdout, 'Some(3)\n');
  });
  it('Option<T> is Copy only when T is', () => {
    assert.equal(RQ.run(main('let a = Some(1);', 'let b = a;', 'println!("{:?} {:?}", a, b);')).stdout, 'Some(1) Some(1)\n');
    assert.equal(ids(RQ.run(main('let a = Some(String::new());', 'let b = a;', 'println!("{:?}", a);'))), 'E0382@4');
  });
});

describe('inherent impls and method resolution', () => {
  const C = ['struct C {', '    n: i32,', '    tag: String,', '}', 'impl C {', '    fn new(n: i32) -> Self {', '        Self { n, tag: String::from("c") }', '    }', '    fn get(&self) -> i32 {', '        self.n', '    }',
    '    fn bump(&mut self) {', '        self.n += 1;', '    }', '    fn tag(&self) -> &String {', '        &self.tag', '    }', '    fn into_tag(self) -> String {', '        self.tag', '    }', '}'];
  it('associated functions, &self, &mut self and self methods, with Self in types and literals', () => {
    assert.equal(out(P(...C, 'fn main() {', '    let mut c = C::new(1);', '    c.bump();', '    c.bump();', '    println!("{} {}", c.get(), c.tag());', '    let t = c.into_tag();', '    println!("{}", t);', '}')), '3 c\nc\n');
  });
  it('the receiver is borrowed, reborrowed or copied as the method needs, through & and &mut too', () => {
    assert.equal(out(P(...C, 'fn twice(c: &mut C) {', '    c.bump();', '    c.bump();', '}', 'fn read(c: &C) -> i32 {', '    c.get()', '}',
      'fn main() {', '    let mut c = C::new(0);', '    twice(&mut c);', '    let r = &mut c;', '    r.bump();', '    twice(r);', '    println!("{} {}", read(&c), C::get(&c));', '}')), '5 5\n');
    assert.equal(out(P('#[derive(Clone, Copy)]', 'struct Q {', '    n: i32,', '}', 'impl Q {', '    fn take(self) -> i32 {', '        self.n', '    }', '}',
      'fn main() {', '    let q = Q { n: 4 };', '    let r = &q;', '    println!("{} {}", r.take(), q.take());', '}')), '4 4\n');
  });
  it('clone on a reference to a type without Clone copies the reference, as rustc does', () => {
    assert.equal(out(P('struct S {', '    n: i32,', '}', 'fn main() {', '    let s = S { n: 3 };', '    let r = &s;', '    let t = r.clone();', '    println!("{}", t.n);', '}')), '3\n');
  });
  it('a missing method or associated item is E0599', () => {
    const c = RQ.run(P(...C, 'fn main() {', '    let c = C::new(1);', '    c.nothing();', '}'));
    assert.equal(ids(c), 'E0599@24');
    assert.equal(c.errors[0].msg, 'no method named `nothing` found for struct `C` in the current scope');
    assert.equal(ids(RQ.run(P(...C, 'fn main() {', '    let c = C::make(1);', '}'))), 'E0599@23');
    assert.equal(RQ.run(P('enum E {', '    A,', '}', 'fn main() {', '    let e = E::B;', '}')).errors[0].msg, 'no variant, associated function, or constant named `B` found for enum `E` in the current scope');
  });
  it('a &mut self method needs a mutable place: E0596 behind a & and on an immutable variable', () => {
    assert.equal(ids(RQ.run(P(...C, 'fn f(c: &C) {', '    c.bump();', '}', 'fn main() {}'))), 'E0596@23');
    assert.equal(RQ.run(P(...C, 'fn f(c: &C) {', '    c.bump();', '}', 'fn main() {}')).errors[0].msg, 'cannot borrow `*c` as mutable, as it is behind a `&` reference');
    const d = RQ.run(P(...C, 'fn main() {', '    let c = C::new(1);', '    c.bump();', '}'));
    assert.equal(ids(d), 'E0596@24');
    assert.equal(d.errors[0].msg, 'cannot borrow `c` as mutable, as it is not declared as mutable');
  });
  it('a self method on a value behind a reference is E0507, and after the call the value is moved (E0382)', () => {
    assert.equal(RQ.run(P(...C, 'fn f(c: &C) -> String {', '    c.into_tag()', '}', 'fn main() {}')).errors[0].msg, 'cannot move out of `*c` which is behind a shared reference');
    const c = RQ.run(P(...C, 'fn main() {', '    let c = C::new(1);', '    let t = c.into_tag();', '    println!("{}", c.get());', '}'));
    assert.equal(ids(c), 'E0382@25');
    assert.equal(c.errors[0].msg, 'borrow of moved value: `c`');
  });
  it('a result that borrows from self keeps the owner borrowed (elision picks self)', () => {
    const run = (mid) => RQ.run(P(...C, 'fn main() {', '    let mut c = C::new(1);', '    let t = c.tag();', mid, '    println!("{}", t);', '}'));
    assert.equal(ids(run('    c.bump();')), 'E0502@25');
    assert.equal(run('    println!("{}", c.get());').status, 'ok');
  });
  it('what stays unsupported on impls', () => {
    assert.equal(feature(P('struct S;', 'impl S {', '    fn f<const N: usize>(&self) {}', '}', 'fn main() {}')), 'generics@3');
    assert.equal(feature(P('struct S;', 'impl<T> S {', '}', 'fn main() {}')), 'impl@2');
    assert.equal(feature(P('struct S;', 'impl S {', '    const A: i32 = 1;', '}', 'fn main() {}')), 'impl@2');
    assert.equal(feature(P('struct S;', 'trait T {', '    type A;', '}', 'impl T for S {}', 'fn main() {}')), 'trait@2');
    assert.equal(feature(P('struct S {', '    n: i32,', '}', 'impl S {', '    fn f(&mut self) -> &mut i32 {', '        &mut self.n', '    }', '}', 'fn main() {}')), 'lifetime elision@5');
    assert.equal(out(P('struct S {', '    n: i32,', '}', 'impl S {', '    fn set(&mut self, n: i32) {}', '    fn get(&self) -> i32 { 0 }', '}', 'fn main() {', '    let mut s = S { n: 1 };', '    s.set(s.get());', '}')), '');
  });
});

describe('fields are places: partial moves and disjoint borrows', () => {
  it('two fields borrow mutably at once, and a field read next to a borrow of another', () => {
    assert.equal(out(P(...NAMED, 'fn main() {', mkP, '    let x = &mut p.a;', '    let y = &mut p.b;', '    x.push_str("1");', '    y.push_str("2");', '    p.n += 1;', '    println!("{} {} {}", p.a, p.b, p.n);', '}')), 'a1 b2 2\n');
  });
  it('the same field twice is E0499, a field and its owner conflict, a sibling does not', () => {
    const run = (...body) => RQ.run(P(...NAMED, 'fn main() {', mkP, ...body.map((l) => '    ' + l), '}'));
    const c = run('let x = &mut p.a;', 'let y = &mut p.a;', 'x.push_str("1");', 'y.push_str("2");');
    assert.equal(ids(c), 'E0499@9');
    assert.equal(c.errors[0].msg, 'cannot borrow `p.a` as mutable more than once at a time');
    const d = run('let q = &mut p;', 'let r = &p.b;', 'q.n += 1;', 'println!("{}", r);');
    assert.equal(ids(d), 'E0502@9');
    assert.equal(d.errors[0].msg, 'cannot borrow `p.b` as immutable because it is also borrowed as mutable');
    assert.equal(ids(run('let r = &p.a;', 'let s = p;', 'println!("{}", r);')), 'E0505@9');
    assert.equal(ids(run('let r = &p.n;', 'p.n = 5;', 'println!("{}", r);')), 'E0506@9');
    assert.equal(run('let r = &p.n;', 'p.a = String::new();', 'println!("{}", r);').status, 'ok');
  });
  it('moving a field leaves the rest usable and the whole not', () => {
    const run = (...body) => RQ.run(P(...NAMED, 'fn main() {', mkP, ...body.map((l) => '    ' + l), '}'));
    assert.equal(run('let t = p.a;', 'println!("{} {} {}", t, p.b, p.n);').stdout, 'a b 1\n');
    const c = run('let t = p.a;', 'let q = p;');
    assert.equal(ids(c), 'E0382@9');
    assert.equal(c.errors[0].msg, 'use of partially moved value: `p`');
    const d = run('let t = p.a;', 'println!("{:?}", p.a);');
    assert.equal(ids(d), 'E0382@9');
    assert.equal(d.errors[0].msg, 'borrow of moved value: `p.a`');
    const e = run('let t = p.a;', 'println!("{}", p.b);', 'p.a = String::from("again");', 'let q = p;');
    assert.equal(e.status, 'ok');
    assert.equal(ids(run('for i in 0..2 {', '    let t = p.a;', '}')), 'E0382@9');
  });
  it('a moved field names the whole, a field of a field names the path', () => {
    const run = (...body) => RQ.run(P('struct I {', '    s: String,', '}', 'struct O {', '    i: I,', '    n: i32,', '}', 'fn main() {', '    let o = O { i: I { s: String::new() }, n: 1 };', ...body.map((l) => '    ' + l), '}'));
    assert.equal(run('let a = o.i.s;', 'println!("{}", o.n);').status, 'ok');
    assert.equal(run('let a = o.i.s;', 'let b = o.i;').errors[0].msg, 'use of partially moved value: `o.i`');
    assert.equal(run('let a = o;', 'println!("{}", o.n);').errors[0].msg, 'borrow of moved value: `o`');
  });
  it('a tuple moves its parts one at a time too', () => {
    assert.equal(out(main('let t = (String::from("a"), String::from("b"));', 'let x = t.0;', 'println!("{} {}", x, t.1);')), 'a b\n');
    assert.equal(ids(RQ.run(main('let t = (String::from("a"), 1);', 'let x = t.0;', 'let u = t;'))), 'E0382@4');
  });
  it('writing a field of an immutable variable is E0594, and behind a & too', () => {
    const c = RQ.run(P(...NAMED, 'fn main() {', '    let p = P { a: String::new(), b: String::new(), n: 1 };', '    p.n = 2;', '}'));
    assert.equal(ids(c), 'E0594@8');
    assert.equal(c.errors[0].msg, 'cannot assign to `p.n`, as `p` is not declared as mutable');
    const d = RQ.run(P(...NAMED, 'fn f(p: &P) {', '    p.n = 2;', '}', 'fn main() {}'));
    assert.equal(d.errors[0].msg, 'cannot assign to `p.n`, which is behind a `&` reference');
    assert.equal(ids(RQ.run(P(...NAMED, 'fn main() {', '    let p = P { a: String::new(), b: String::new(), n: 1 };', '    let r = &mut p.a;', '}'))), 'E0596@8');
    assert.equal(RQ.run(P(...NAMED, 'fn main() {', '    let p = P { a: String::new(), b: String::new(), n: 1 };', '    let r = &mut p.a;', '}')).errors[0].msg, 'cannot borrow `p.a` as mutable, as `p` is not declared as mutable');
  });
  it('moving a field out of a type with Drop, or out of an array, is unsupported; out from behind a reference is E0507', () => {
    assert.equal(feature(P('struct D {', '    s: String,', '}', 'impl Drop for D {', '    fn drop(&mut self) {}', '}', 'fn main() {', '    let d = D { s: String::new() };', '    let s = d.s;', '}')), 'partial move@9');
    const c = RQ.run(P('struct P {', '    s: String,', '}', 'fn f(p: &P) -> String {', '    p.s', '}', 'fn main() {}'));
    assert.equal(ids(c), 'E0507@5');
    assert.equal(c.errors[0].msg, 'cannot move out of `p.s` which is behind a shared reference');
  });
  it('a field of a String type takes push_str and a slice, through a variable and through &mut', () => {
    assert.equal(out(P(...NAMED, 'fn grow(p: &mut P) {', '    p.a.push_str("!");', '    p.n += 1;', '}', 'fn main() {', mkP, '    grow(&mut p);', '    let s = &p.a[0..1];', '    println!("{} {} {}", p.a, s, p.n);', '}')), 'a! a 2\n');
  });
});

describe('drops and the memory view with fields and enums', () => {
  const D = ['struct D {', '    n: i32,', '}', 'impl Drop for D {', '    fn drop(&mut self) {', '        println!("drop {}", self.n);', '    }', '}'];
  it('a partly moved struct drops its remaining fields in order, after the locals declared later', () => {
    assert.equal(out(P(...D, 'struct H {', '    a: D,', '    b: D,', '}', 'fn main() {', '    let h = H { a: D { n: 1 }, b: D { n: 2 } };', '    let x = h.b;', '    println!("moved");', '    let y = D { n: 9 };', '}')),
      'moved\ndrop 9\ndrop 2\ndrop 1\n');
  });
  it('writing a field drops the old value first, and a moved field is just written', () => {
    assert.equal(out(P(...D, 'struct H {', '    a: D,', '}', 'fn main() {', '    let mut h = H { a: D { n: 1 } };', '    h.a = D { n: 2 };', '    println!("assigned");', '    let t = h.a;', '    h.a = D { n: 3 };', '}')),
      'drop 1\nassigned\ndrop 2\ndrop 3\n');
  });
  it('a match arm drops its names at the arm end, and a temporary scrutinee at the end of the statement', () => {
    assert.equal(out(P(...D, 'fn mk() -> Option<D> {', '    Some(D { n: 5 })', '}', 'fn main() {', '    match mk() {', '        Some(d) => println!("got {}", d.n),', '        None => println!("none"),', '    }', '    println!("between");',
      '    match mk() {', '        Some(_) => println!("peek"),', '        None => {}', '    }', '    println!("end");', '}')), 'got 5\ndrop 5\nbetween\npeek\ndrop 5\nend\n');
  });
  it('an unwrap that fails drops the error it holds while unwinding', () => {
    const c = RQ.run(P('#[derive(Debug)]', ...D, 'fn main() {', '    let r: Result<i32, D> = Err(D { n: 4 });', '    let x = r.unwrap();', '}'));
    assert.equal(c.status, 'panic');
    assert.equal(c.stdout, 'drop 4\n');
    assert.equal(c.panic.msg, 'called `Result::unwrap()` on an `Err` value: D { n: 4 }');
  });
  it('the memory view shows a variant and its payload, a field that moved out, and a borrow of one field', () => {
    const c = RQ.run(P('enum E {', '    A(String),', '    B,', '}', 'struct P {', '    a: String,', '    n: i32,', '}', 'fn main() {', '    let e = E::A(String::from("x"));', '    let mut p = P { a: String::from("y"), n: 1 };', '    let r = &p.n;',
      '    let t = p.a;', '    println!("{}", r);', '}'), { snap: true });
    const s = c.snaps.find((x) => x.line === 14);
    const vars = Object.fromEntries(s.frames[0].vars.map((v) => [v.name, v]));
    assert.deepEqual(vars.e.leaves.map((l) => [l.path, l.text ?? 'heap']), [['', 'A'], ['A.0', 'heap']]);
    assert.deepEqual(vars.p.leaves.map((l) => [l.path, l.text ?? 'heap']), [['a', 'moved'], ['n', '1']]);
    assert.equal(vars.p.state, 'owned');
    assert.deepEqual([vars.r.leaves[0].toName, vars.r.leaves[0].to], ['p.n', vars.p.uid]);
  });
});

describe('type forms meet the checks that walk types', () => {
  it('E0106 counts a reference inside Option and Result, as it does one inside a tuple', () => {
    assert.equal(ids(RQ.run(P('fn f(a: &str, b: &str) -> Option<&str> {', '    None', '}', 'fn main() {}'))), 'E0106@1');
    assert.equal(ids(RQ.run(P('fn f(a: &[i32], b: &[i32]) -> Option<&[i32]> {', '    None', '}', 'fn main() {}'))), 'E0106@1');
    assert.equal(ids(RQ.run(P('fn f(n: i32) -> Result<&str, i32> {', '    Err(n)', '}', 'fn main() {}'))), 'E0106@1');
    assert.equal(ids(RQ.run(P('fn f(a: &str, b: &str) -> (&str, i32) {', '    (a, 1)', '}', 'fn main() {}'))), 'E0106@1');
  });
  it('one reference parameter lends to an Option result, which keeps the owner borrowed', () => {
    const src = (mid) => P('fn pick(s: &str) -> Option<&str> {', '    None', '}', 'fn main() {', '    let mut s = String::from("a");', '    let r = pick(&s);', mid, '    println!("{:?}", r);', '}');
    assert.equal(ids(RQ.run(src('    s.push_str("b");'))), 'E0502@7');
    assert.equal(RQ.run(src('    println!("{}", s);')).status, 'ok');
  });
  it('a reference inside an Option or a generic argument of the wrong count is not a struct field or a type', () => {
    assert.equal(feature(P('fn f(o: Option<i32, i32>) {}', 'fn main() {}')), 'Option@1');
    assert.equal(feature(P('fn f(o: Result<i32>) {}', 'fn main() {}')), 'Result@1');
    assert.equal(feature(P('fn f(o: Vec<i32, i32>) {}', 'fn main() {}')), 'Vec@1');
    assert.equal(feature(P('struct S;', 'fn f(o: S<i32>) {}', 'fn main() {}')), 'generics@2');
  });
  it('an array or a tuple of structs and enums copies by the element type and prints by it', () => {
    assert.equal(out(P(...PT, 'fn main() {', '    let a = [Pt { x: 1, y: 2 }, Pt { x: 3, y: 4 }];', '    let b = a;', '    println!("{:?} {}", a, b.len());', '}')), '[Pt { x: 1, y: 2 }, Pt { x: 3, y: 4 }] 2\n');
    assert.equal(ids(RQ.run(P('struct S {', '    n: i32,', '}', 'fn main() {', '    let a = [S { n: 1 }, S { n: 2 }];', '    let b = a;', '    let c = a;', '}'))), 'E0382@7');
  });
});

describe('the type model', () => {
  const { T, unify, has, isCopy, show } = RQ.types;
  it('tvar binds to anything once and then behaves as that type', () => {
    const v = T.tvar();
    assert.equal(unify(T.enum('Option', [v], [], true), T.enum('Option', [T.int('u8')], [], true)), true);
    assert.equal(show(v), 'u8');
    assert.equal(unify(v, T.int('i8')), false);
  });
  it('has answers for the derivable traits of every type form', () => {
    assert.equal(has(T.float, 'Eq'), false);
    assert.equal(has(T.string, 'Copy'), false);
    assert.equal(has(T.ref(true, T.int('i32'), 1), 'Clone'), false);
    assert.equal(has(T.tuple([T.int('i32'), T.string]), 'Clone'), true);
    assert.equal(has(T.tuple([T.int('i32'), T.string]), 'Copy'), false);
    assert.equal(has(T.enum('Option', [T.string], ['Debug', 'Clone', 'Copy', 'PartialEq', 'Eq'], true), 'Copy'), false);
    assert.equal(isCopy(T.struct('S', ['Copy'])), true);
    assert.equal(isCopy(T.struct('S', [])), false);
  });
});

describe('review fixes', () => {
  const E2 = ['enum E {', '    A,', '    B,', '}'];
  it('a bare name that is a unit variant of the scrutinee is E0170, not a catch-all', () => {
    const c = RQ.run(P(...E2, 'fn main() {', '    let e = E::A;', '    let r = match e {', '        A => 1,', '        B => 2,', '    };', '    println!("{}", r);', '}'));
    assert.equal(ids(c), 'E0170@8,E0170@9');
    assert.equal(c.errors[0].msg, 'pattern binding `A` is named the same as one of the variants of the type `E`');
    assert.equal(ids(RQ.run(P(...E2, 'fn main() {', '    let e = E::A;', '    let A = e;', '}'))), 'E0170@7');
    assert.equal(out(P('enum E {', '    A,', '    B(i32),', '}', 'fn main() {', '    let e = E::A;', '    let r = match e {', '        E::A => 1,', '        B => 2,', '    };', '    println!("{}", r);', '}')), '1\n');
  });
  it('a bare Some, Ok or Err in a pattern is E0530', () => {
    const c = RQ.run(main('let o = Some(1);', 'match o {', '    Some => 1,', '    None => 2,', '};'));
    assert.equal(ids(c), 'E0530@4');
    assert.equal(c.errors[0].msg, 'match bindings cannot shadow tuple variants');
  });
  it('the size of a struct or enum counts its fields, so nested arrays cannot slip past the array limit', () => {
    const src = P('struct A {', '    v: [i32; 10000],', '}', 'struct B {', '    a: [A; 10000],', '}', 'fn main() {}');
    assert.equal(feature(src), 'array length@5');
    assert.equal(feature(P('#[derive(Clone, Copy)]', 'struct A {', '    v: [i32; 10000],', '}', 'fn main() {', '    let a = [A { v: [0; 10000] }; 2];', '}')), 'array length@6');
  });
  it('clone and == tick the step counter, so a big value cannot freeze the page', () => {
    const src = P('#[derive(Clone, PartialEq)]', 'struct A {', '    v: [i32; 1000],', '}', 'fn main() {', '    let a = A { v: [0; 1000] };', '    let mut n = 0;', '    while n < 200 {', '        let b = a.clone();', '        if a == b { n += 1; }', '    }', '}');
    assert.equal(RQ.run(src, { maxSteps: 100000 }).status, 'limit');
  });
  it('typeck errors in one fn do not hide the borrow errors of another', () => {
    const c = RQ.run(P('fn a() -> i32 {', '    let x: i32 = "s";', '    1', '}', 'fn b() {', '    let v = 5;', '    let r = &mut v;', '    *r += 1;', '}', 'fn main() {', '    a();', '    b();', '}'));
    assert.equal(ids(c), 'E0308@2,E0596@7');
    assert.equal(ids(RQ.run(P('fn a() -> i32 {', '    let x = 5;', '    x = 6;', '    let y: i32 = "s";', '    1', '}', 'fn main() {', '    a();', '}'))), 'E0308@4');
  });
  it('rustc reports each E0594 and a shared-reference E0596 on its own, and merges only repeated `&mut` borrows of one non-mut local', () => {
    const P2 = ['struct P {', '    x: i32,', '    y: i32,', '}', 'impl P {', '    fn inc(&mut self) {', '        self.x += 1;', '    }', '}'];
    assert.equal(ids(RQ.run(P(...P2, 'fn main() {', '    let p = P { x: 1, y: 2 };', '    p.x = 2;', '    p.y = 3;', '}'))), 'E0594@12,E0594@13');
    assert.equal(ids(RQ.run(P(...P2, 'fn main() {', '    let p = P { x: 1, y: 2 };', '    p.x = 2;', '    p.inc();', '}'))), 'E0594@12,E0596@13');
    assert.equal(ids(RQ.run(P(...P2, 'fn f(p: &P) {', '    p.inc();', '    p.inc();', '}', 'fn main() {}'))), 'E0596@11,E0596@12');
    assert.equal(feature(main('let v = 5;', 'let a = &mut v;', 'let b = &mut v;', '*a += 1;', '*b += 1;')), 'repeated error@4');
  });
  it('a move out of a builtin enum from behind a reference names the variant, as rustc does', () => {
    const c = RQ.run(P('fn f(r: &Option<String>) {', '    match *r {', '        Some(s) => println!("{}", s),', '        None => {}', '    }', '}', 'fn main() {}'));
    assert.equal(c.errors[0].msg, 'cannot move out of `r` as enum variant `Some` which is behind a shared reference');
  });
});
