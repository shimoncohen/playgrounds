import { describe, it } from 'node:test';
import strict from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const assert = strict;
const RQ = loadRust();
const P = (...lines) => lines.join('\n') + '\n';
const main = (...body) => P('fn main() {', ...body.map((l) => '    ' + l), '}');
const ids = (c) => c.errors.map((e) => `${e.code || e.lint}@${e.line}`).join(',');
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src + JSON.stringify(c.errors)); return `${c.unsupported.feature}@${c.unsupported.line}`; };
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', src + JSON.stringify(c.errors) + JSON.stringify(c.unsupported)); return c.stdout; };
const rejects = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', src + JSON.stringify(c.unsupported)); return ids(c); };
const APPLY = (bound, param = 'f') => ['fn apply<F: ' + bound + '>(' + param + ': F) {', '    f();', '}'];

describe('closures: typing and calls', () => {
  it('a closure is called like a function and its parameter types come from the call', () => {
    assert.equal(out(main('let add = |a, b| a + b;', 'println!("{}", add(2, 3));')), '5\n');
    assert.equal(out(main('let f = |x: i32| -> i32 {', '    let y = x * 2;', '    y + 1', '};', 'println!("{}", f(4));')), '9\n');
  });
  it('a pattern parameter and a & parameter are lets on a hidden name', () => {
    assert.equal(out(main('let v = vec![3, 1, 2];', 'let c = v.iter().filter(|&&x| x > 1).count();', 'let s: i32 = v.iter().map(|&x| x * 2).sum();', 'println!("{} {}", c, s);')), '2 12\n');
    assert.equal(out(main('let v = vec![5, 6];', 'for (i, x) in v.iter().enumerate() {', '    println!("{} {}", i, x);', '}')), '0 5\n1 6\n');
  });
  it('a call with the wrong number or type of arguments is E0057 or E0308', () => {
    assert.equal(rejects(main('let f = |x: i32| x + 1;', 'println!("{}", f(1, 2));')), 'E0057@3');
    assert.equal(rejects(main('let f = |x: i32| x + 1;', 'println!("{}", f("a"));')), 'E0308@3');
  });
  it('calling something that is not a function is E0618', () => {
    assert.equal(rejects(main('let x = 5;', 'println!("{}", x(1));')), 'E0618@3');
  });
  it('a parameter used before its type is known is E0282 at the parameter', () => {
    assert.equal(rejects(main('let f = |s| s.len();', 'println!("{}", f("abc"));')), 'E0282@2');
    assert.equal(out(main('let f = |s: &str| s.len();', 'println!("{}", f("abc"));')), '3\n');
  });
  it('a closure and its Fn kind come from the body', () => {
    assert.equal(rejects(main('let mut count = 0;', 'let tick = || count += 1;', 'tick();', 'println!("{}", count);')), 'E0596@4');
    assert.equal(out(main('let mut count = 0;', 'let mut tick = || count += 1;', 'tick();', 'tick();', 'println!("{}", count);')), '2\n');
    assert.equal(rejects(main('let s = String::from("a");', 'let f = || s;', 'let a = f();', 'let b = f();', 'println!("{} {}", a, b);')), 'E0382@5');
  });
});

describe('closures: captures and loans', () => {
  it('a reading closure borrows, so assigning the variable before the last call is E0506', () => {
    assert.equal(rejects(main('let mut n = 1;', 'let f = || n * 2;', 'n += 1;', 'println!("{}", f());')), 'E0506@4');
    assert.equal(out(main('let mut n = 1;', 'let f = move || n * 2;', 'n += 1;', 'println!("{} {}", f(), n);')), '2 2\n');
  });
  it('a mutable capture blocks every other use until the last call: E0499 and E0502', () => {
    assert.equal(rejects(main('let mut n = 0;', 'let mut a = || n += 1;', 'let mut b = || n += 2;', 'a();', 'b();')), 'E0499@4');
    assert.equal(rejects(main('let mut count = 0;', 'let mut inc = || count += 1;', 'println!("{}", count);', 'inc();')), 'E0502@4');
    assert.equal(out(main('let mut count = 0;', 'let mut inc = || count += 1;', 'inc();', 'println!("{}", count);')), '1\n');
  });
  it('move takes the variable: E0382 afterwards, E0505 while borrowed, and a Copy number is copied', () => {
    assert.equal(rejects(main('let s = String::from("a");', 'let f = move || s.len();', 'println!("{}", s);', 'println!("{}", f());')), 'E0382@4');
    assert.equal(rejects(main('let s = String::from("a");', 'let r = &s;', 'let f = move || s.len();', 'println!("{} {}", r, f());')), 'E0505@4');
    assert.equal(out(main('let mut n = 1;', 'let mut f = move || { n += 1; n };', 'println!("{} {}", f(), f());', 'println!("{}", n);')), '2 3\n1\n');
  });
  it('a capture that is not mut cannot be changed: E0594 for an assignment, E0596 for a borrow', () => {
    assert.equal(rejects(main('let n = 0;', 'let mut f = || n += 1;', 'f();')), 'E0594@3');
    assert.equal(rejects(main('let v = vec![1];', 'let mut f = || v.push(2);', 'f();')), 'E0596@3');
  });
  it('closures read the same variable together, and the borrow ends at the last call', () => {
    assert.equal(out(main('let s = String::from("hi");', 'let f = || s.len();', 'let g = || s.len() + 1;', 'println!("{} {}", f(), g());')), '2 3\n');
    assert.equal(out(main('let mut s = String::from("a");', 'let show = || println!("{}", s);', 'show();', 's.push_str("b");', 'println!("{}", s);')), 'a\nab\n');
  });
  it('a closure in a method reads self, and one in a loop captures that turn', () => {
    const cart = P('struct Cart {', '    items: Vec<i32>,', '    bonus: i32,', '}', 'impl Cart {', '    fn total(&self) -> i32 {', '        self.items.iter().map(|x| x + self.bonus).sum()', '    }', '}');
    assert.equal(out(P(cart, main('let c = Cart { items: vec![1, 2], bonus: 10 };', 'println!("{}", c.total());'))), '23\n');
    assert.equal(out(main('let mut out = Vec::new();', 'for i in 0..3 {', '    let f = |x: i32| x + i;', '    out.push(f(10));', '}', 'println!("{:?}", out);')), '[10, 11, 12]\n');
  });
  it('a closure that moves a field or changes a &mut variable is unsupported, not guessed', () => {
    assert.equal(feature(P('struct P {', '    name: String,', '}', 'fn main() {', '    let p = P { name: String::new() };', '    let f = move || p.name.len();', '    println!("{}", f());', '}')), 'closure capture of a field@6');
    assert.equal(feature(main('let mut n = 0;', 'let r = &mut n;', 'let mut f = || *r += 1;', 'f();')), 'closure capture of a mutable reference@4');
  });
});

describe('closures: Fn, FnMut and FnOnce bounds', () => {
  it('a closure variable is judged against the bound where it is passed: E0525', () => {
    assert.equal(rejects(P(...APPLY('Fn()'), 'fn main() {', '    let mut n = 0;', '    let inc = || n += 1;', '    apply(inc);', '}')), 'E0525@6');
    assert.equal(rejects(P(...APPLY('Fn()'), 'fn main() {', '    let s = String::from("a");', '    let eat = move || drop(s);', '    apply(eat);', '}')), 'E0525@6');
    assert.equal(out(P(...APPLY('FnMut()', 'mut f'), 'fn main() {', '    let mut n = 0;', '    let inc = || n += 1;', '    apply(inc);', '    println!("{}", n);', '}')), '1\n');
  });
  it('a closure written in the call is judged inside: E0594, E0596 and E0507 name the capture', () => {
    assert.equal(rejects(P(...APPLY('Fn()'), 'fn main() {', '    let mut n = 0;', '    apply(|| n += 1);', '}')), 'E0594@6');
    assert.equal(rejects(P(...APPLY('Fn()'), 'fn main() {', '    let mut v = vec![1];', '    apply(|| v.push(2));', '}')), 'E0596@6');
    assert.equal(rejects(P(...APPLY('Fn()'), 'fn main() {', '    let s = String::from("a");', '    apply(move || drop(s));', '}')), 'E0507@6');
  });
  it('FnMut and FnOnce parameters are used through their kind', () => {
    assert.equal(rejects(P('fn call<F: FnMut()>(f: F) {', '    f();', '}', 'fn main() {', '    let mut n = 0;', '    call(|| n += 1);', '}')), 'E0596@2');
    assert.equal(rejects(P('fn call<F: FnOnce() -> String>(f: F) -> String {', '    let a = f();', '    f()', '}', 'fn main() {', '    println!("{}", call(|| String::from("x")));', '}')), 'E0382@3');
    assert.equal(out(P('fn run<F: FnOnce() -> String>(f: F) -> String {', '    f()', '}', 'fn main() {', '    let s = String::from("moved");', '    println!("{}", run(move || s));', '}')), 'moved\n');
  });
  it('impl Fn and where bounds take a closure the same way', () => {
    assert.equal(out(P('fn apply(f: impl Fn(i32) -> i32, x: i32) -> i32 {', '    f(x) + f(x)', '}', 'fn main() {', '    println!("{}", apply(|x| x * 2, 5));', '}')), '20\n');
    assert.equal(out(P('fn apply<F>(f: F) -> i32', 'where', '    F: Fn() -> i32,', '{', '    f()', '}', 'fn main() {', '    println!("{}", apply(|| 7));', '}')), '7\n');
  });
  it('the wrong number or type of closure parameters is E0593 or E0631, and a non-closure is E0277', () => {
    const f = ['fn apply<F: Fn(i32) -> i32>(f: F) -> i32 {', '    f(1)', '}'];
    assert.equal(rejects(P(...f, main('println!("{}", apply(|a, b| a + b));'))), 'E0593@5');
    assert.equal(rejects(P(...f, main('println!("{}", apply(|a: String| 1));'))), 'E0631@5');
    assert.equal(rejects(P(...f, main('println!("{}", apply(5));'))), 'E0277@5');
  });
  it('a returned closure must own what it uses: E0373 without move', () => {
    assert.equal(rejects(P('fn adder(n: i32) -> impl Fn(i32) -> i32 {', '    |x| x + n', '}', 'fn main() {', '    println!("{}", adder(2)(3));', '}')), 'E0373@2');
    assert.equal(out(P('fn adder(n: i32) -> impl Fn(i32) -> i32 {', '    move |x| x + n', '}', 'fn main() {', '    let a = adder(5);', '    println!("{} {}", a(1), a(2));', '}')), '6 7\n');
    assert.equal(out(P('fn counter() -> impl FnMut() -> i32 {', '    let mut c = 0;', '    move || {', '        c += 1;', '        c', '    }', '}', 'fn main() {', '    let mut next = counter();', '    println!("{} {} {}", next(), next(), next());', '}')), '1 2 3\n');
  });
  it('what cannot be followed is unsupported with a hint', () => {
    assert.equal(feature(P('fn f() -> impl Fn(&str) -> &str { |a| a }', 'fn main() {}')), 'closure returning a reference@1');
    assert.equal(feature(P('fn double(x: i32) -> i32 { x * 2 }', 'fn apply<F: Fn(i32) -> i32>(f: F) -> i32 { f(3) }', 'fn main() {', '    println!("{}", apply(double));', '}')), 'function value@4');
    for (const f of ['closure kind', 'closure returning a reference', 'closure capture of a field', 'closure capture of a mutable reference']) assert.ok(RQ.diag.hint(f).length > 30, f);
  });
  it('a closure body is linted like any other code', () => {
    assert.equal(rejects(main('let f = |x: i32| x / 0;', 'println!("{}", f(1));')), 'unconditional_panic@2');
  });
});

describe('iterators: sources, adapters and consumers', () => {
  it('map, filter, copied and collect', () => {
    assert.equal(out(main('let v = vec![1, 2, 3, 4, 5, 6];', 'let a: Vec<i32> = v.iter().map(|x| x * 2).collect();', 'let b: Vec<i32> = v.iter().filter(|x| **x % 2 == 0).copied().collect();', 'println!("{:?} {:?}", a, b);')), '[2, 4, 6, 8, 10, 12] [2, 4, 6]\n');
  });
  it('sum, product, count, min, max, last, fold, any, all, find, position', () => {
    assert.equal(out(main('let v = vec![3, 1, 4, 1, 5];', 'let s: i32 = v.iter().sum();', 'let p: i32 = v.iter().product();', 'println!("{} {} {} {:?} {:?} {:?}", s, p, v.iter().count(), v.iter().min(), v.iter().max(), v.iter().last());',
      'println!("{} {}", v.iter().fold(0, |a, x| a * 10 + x), v.iter().any(|x| *x == 5));', 'println!("{} {:?} {:?}", v.iter().all(|x| *x < 5), v.iter().find(|x| **x > 3), v.iter().position(|x| *x == 4));')),
    '14 60 5 Some(1) Some(5) Some(5)\n31415 true\nfalse Some(4) Some(2)\n');
  });
  it('enumerate, zip, rev, take, skip, take_while and skip_while', () => {
    assert.equal(out(main('let v = vec![1, 2, 3, 4, 5, 6];', 'let w = vec![10, 20, 30];',
      'let z: Vec<(i32, i32)> = v.iter().copied().zip(w.iter().copied()).collect();', 'let r: Vec<i32> = v.iter().rev().copied().collect();', 'let t: Vec<i32> = v.iter().skip(1).take(3).copied().collect();',
      'let tw: Vec<i32> = v.iter().take_while(|x| **x < 4).copied().collect();', 'let sw: Vec<i32> = v.iter().skip_while(|x| **x < 4).copied().collect();', 'println!("{:?} {:?} {:?} {:?} {:?}", z, r, t, tw, sw);')),
    '[(1, 10), (2, 20), (3, 30)] [6, 5, 4, 3, 2, 1] [2, 3, 4] [1, 2, 3] [4, 5, 6]\n');
  });
  it('ranges, arrays, slices and text are sources', () => {
    assert.equal(out(main('let sq: Vec<i32> = (1..4).map(|x| x * x).collect();', 'let t: i32 = (1..=4).product();', 'let r: Vec<i32> = (0..5).rev().collect();', 'println!("{:?} {} {:?}", sq, t, r);')), '[1, 4, 9] 24 [4, 3, 2, 1, 0]\n');
    assert.equal(out(P('fn total(v: &[i32]) -> i32 {', '    v.iter().sum()', '}', main('let a = [1, 2, 3];', 'println!("{} {}", total(&a), total(&a[1..]));'))), '6 5\n');
    assert.equal(out(main('let s = String::from("hello");', 'let r: String = s.chars().rev().collect();', 'println!("{} {}", r, s.chars().count());')), 'olleh 5\n');
  });
  it('a HashMap gives keys, values and pairs, and collect builds one from pairs', () => {
    const c = RQ.run(P('use std::collections::HashMap;', 'fn main() {', '    let m: HashMap<i32, i32> = (1..4).map(|x| (x, x * x)).collect();', '    let mut ks: Vec<i32> = m.keys().copied().collect();', '    ks.sort();', '    let t: i32 = m.values().sum();', '    println!("{:?} {} {:?}", ks, t, m.get(&3));', '}'));
    assert.equal(c.stdout, '[1, 2, 3] 14 Some(9)\n');
  });
  it('map order over a HashMap follows the two-seed rule', () => {
    const src = P('use std::collections::HashMap;', 'fn main() {', '    let mut m = HashMap::new();', '    m.insert(String::from("a"), 1);', '    m.insert(String::from("b"), 2);', '    m.iter().for_each(|(k, v)| println!("{} {}", k, v));', '}');
    const c = RQ.run(src);
    assert.equal(c.status, 'ok');
    assert.equal(c.orderDependent, true);
  });
  it('iterators are lazy and each item goes through the whole chain', () => {
    assert.equal(out(main('let v = vec![1, 2, 3];', 'let r = v.iter().map(|x| {', '    println!("map {}", x);', '    x + 1', '});', 'println!("before");', 'let w: Vec<i32> = r.collect();', 'println!("{:?}", w);')), 'before\nmap 1\nmap 2\nmap 3\n[2, 3, 4]\n');
    assert.equal(out(main('let v = vec![1, 2, 3, 4];', 'let r: Vec<i32> = v.iter().map(|x| { println!("m{}", x); x * 2 }).filter(|x| { println!("f{}", x); *x > 2 }).collect();', 'println!("{:?}", r);')), 'm1\nf2\nm2\nf4\nm3\nf6\nm4\nf8\n[4, 6, 8]\n');
    assert.equal(out(main('let v = vec![1, 2, 3];', 'let any = v.iter().map(|x| { println!("m{}", x); *x }).any(|x| x == 2);', 'println!("{}", any);')), 'm1\nm2\ntrue\n');
    assert.equal(out(main('let v = vec![1, 2, 3];', 'let w: Vec<i32> = v.iter().map(|x| { println!("m{}", x); x * 2 }).rev().collect();', 'println!("{:?}", w);')), 'm3\nm2\nm1\n[6, 4, 2]\n');
  });
  it('next gives one item at a time, and a for loop walks an adapter', () => {
    assert.equal(out(main('let v = vec![1, 2];', 'let mut it = v.iter();', 'println!("{:?} {:?} {:?}", it.next(), it.next(), it.next());')), 'Some(1) Some(2) None\n');
    assert.equal(out(main('let names = vec![String::from("ab"), String::from("c")];', 'for n in names.iter().map(|s| s.len()) {', '    println!("{}", n);', '}')), '2\n1\n');
  });
  it('into_iter hands values over and iter_mut changes in place', () => {
    assert.equal(out(main('let v = vec![String::from("a"), String::from("bb")];', 'let w: Vec<usize> = v.into_iter().map(|s| s.len()).collect();', 'println!("{:?}", w);')), '[1, 2]\n');
    assert.equal(out(main('let mut v = vec![1, 2, 3];', 'for x in v.iter_mut() {', '    *x *= 2;', '}', 'v.iter_mut().for_each(|x| *x += 1);', 'println!("{:?}", v);')), '[3, 5, 7]\n');
  });
  it('a closure in an adapter can change a capture', () => {
    assert.equal(out(main('let v = vec![1, 2, 3];', 'let mut total = 0;', 'v.iter().for_each(|x| total += x);', 'println!("{}", total);')), '6\n');
  });
});

describe('iterators: borrows and errors', () => {
  it('an iterator keeps its collection borrowed until its last use', () => {
    assert.equal(rejects(main('let mut v = vec![1, 2];', 'let first = v.iter().next();', 'v.push(3);', 'println!("{:?}", first);')), 'E0502@4');
    assert.equal(out(main('let mut v = vec![1, 2];', 'let first = v.iter().next().copied();', 'v.push(3);', 'println!("{:?}", first);')), 'Some(1)\n');
    assert.equal(rejects(main('let v = vec![1, 2];', 'let r = v.iter().map(|x| x * 2);', 'drop(v);', 'println!("{}", r.count());')), 'E0505@4');
    assert.equal(rejects(main('let mut v = vec![1, 2];', 'for x in v.iter().map(|x| x + 1) {', '    v.push(x);', '}')), 'E0502@4');
    assert.equal(rejects(main('let mut v = vec![1, 2];', 'v.iter().for_each(|x| v.push(*x));')), 'E0502@3');
  });
  it('into_iter takes the Vec, and next needs a mut iterator', () => {
    assert.equal(rejects(main('let v = vec![1, 2];', 'let n = v.into_iter().count();', 'println!("{} {}", n, v.len());')), 'E0382@4');
    assert.equal(rejects(main('let v = vec![1, 2];', 'let it = v.iter();', 'println!("{:?}", it.next());')), 'E0596@4');
  });
  it('collect and sum need a type: E0283, or E0282 when a method comes first', () => {
    assert.equal(rejects(main('let v = vec![1, 2, 3];', 'let w = v.iter().map(|x| x * 2).collect();', 'println!("{}", 1);')), 'E0283@3');
    assert.equal(rejects(main('let v = (1..4).collect();', 'println!("{}", v.len());')), 'E0282@2');
    assert.equal(rejects(main('let v = vec![1, 2, 3];', 'let s = v.iter().sum();', 'println!("{}", 1);')), 'E0283@3');
  });
  it('collect and sum check the item type: E0277', () => {
    assert.equal(rejects(main('let v: Vec<i32> = vec![1, 2, 3];', 'let w: Vec<i32> = v.iter().collect();', 'println!("{:?}", w);')), 'E0277@3');
    assert.equal(rejects(main('let v: Vec<i32> = vec![1, 2, 3];', 'let t: i64 = v.iter().sum();', 'println!("{}", t);')), 'E0277@3');
    assert.equal(rejects(main('let v = vec![1.5, 2.5];', 'let m = v.iter().max();', 'println!("{:?}", m);')), 'E0277@3');
  });
  it('filter hands a reference to a reference: a plain number is E0308 for < and E0277 for ==', () => {
    assert.equal(rejects(main('let v = vec![1, 2, 3];', 'let n = v.iter().filter(|x| x > 1).count();')), 'E0308@3');
    assert.equal(rejects(main('let v = vec![1, 2, 3];', 'let n = v.iter().filter(|x| x == 2).count();')), 'E0277@3');
    assert.equal(out(main('let v = vec![1, 2, 3];', 'let n = v.iter().filter(|x| **x > 1).count();', 'println!("{}", n);')), '2\n');
  });
  it('a closure that takes the wrong number of parameters is E0593', () => {
    assert.equal(rejects(main('let v = vec![1, 2];', 'let t = v.iter().fold(0, |a| a);')), 'E0593@3');
  });
  it('what is not modeled is unsupported with the iterator hint', () => {
    assert.equal(feature(main('let v = vec![1];', 'let it = v.iter().peekable();')), 'iterator@3');
    assert.equal(feature(main('let v = vec![1, 2];', 'let w: Vec<i32> = v.iter().copied().zip(v.iter().copied()).rev().map(|x| x.0).collect();')), 'iterator@3');
    assert.equal(feature(main('let v = vec![1, 2];', 'let r = (0..3).collect::<Vec<i32>>();', 'let w: Vec<&i32> = v.iter().collect();')), 'reference in collection@4');
    assert.ok(RQ.diag.hint('iterator').includes('collect'));
  });
});

describe('closure-taking methods', () => {
  it('Option and Result: map, and_then, unwrap_or_else, filter, ok_or_else, map_err', () => {
    assert.equal(out(main('let o: Option<i32> = Some(4);', 'let n: Option<i32> = None;',
      'println!("{:?} {:?} {}", o.map(|x| x + 1), o.and_then(|x| if x > 3 { Some(x * 2) } else { None }), n.unwrap_or_else(|| 99));',
      'println!("{:?} {:?} {:?}", o.filter(|x| *x > 9), o.ok_or_else(|| 0), o.map_or(0, |x| x * 3));')), 'Some(5) Some(8) 99\nNone Ok(4) 12\n');
    assert.equal(out(P('fn parse(s: &str) -> Result<i32, String> {', '    if s == "1" { Ok(1) } else { Err(String::from("bad")) }', '}',
      main('println!("{:?} {:?} {}", parse("1").map(|x| x + 1), parse("x").map_err(|m| m.len()), parse("x").unwrap_or_else(|m| m.len() as i32));'))), 'Ok(2) Err(3) 3\n');
  });
  it('map takes the Option, so using it afterwards is E0382', () => {
    assert.equal(rejects(main('let o = Some(String::from("a"));', 'let n = o.map(|s| s.len());', 'println!("{:?} {:?}", n, o);')), 'E0382@4');
  });
  it('Vec: sort_by_key and retain', () => {
    assert.equal(out(main('let mut v = vec![String::from("ccc"), String::from("a"), String::from("bb")];', 'v.sort_by_key(|s| s.len());', 'println!("{:?}", v);', 'v.retain(|s| s.len() > 1);', 'println!("{:?}", v);')), '["a", "bb", "ccc"]\n["bb", "ccc"]\n');
    assert.equal(rejects(main('let mut v = vec![1.5, 0.5];', 'v.sort_by_key(|x| *x);')), 'E0277@3');
  });
  it('HashMap: entry().or_insert_with runs the closure only for a missing key', () => {
    assert.equal(out(P('use std::collections::HashMap;', 'fn main() {', '    let mut m: HashMap<String, i32> = HashMap::new();', '    *m.entry(String::from("a")).or_insert_with(|| { println!("made"); 5 }) += 1;', '    *m.entry(String::from("a")).or_insert_with(|| { println!("again"); 100 }) += 1;', '    println!("{:?}", m.get("a"));', '}')), 'made\nSome(7)\n');
  });
});

describe('new engine paths: ranges and operators', () => {
  it('a range outside for, a slice and a method receiver is unsupported', () => {
    assert.equal(feature(main('let r = 0..3;')), 'range expression@2');
  });
  it('+= takes a reference to a number', () => {
    assert.equal(out(main('let v = vec![1, 2];', 'let mut t = 0;', 'for x in v.iter() {', '    t += x;', '}', 'println!("{}", t);')), '3\n');
  });
});

describe('review fixes: what rustc decides after a closure', () => {
  it('a non-move closure makes the variables it names address-taken for the lints; a move of a Copy value still lints', () => {
    assert.equal(feature(main('let x: u8 = 255;', 'let f = || x;', 'let y = x + 1;', 'println!("{} {}", y, f());')), 'const folding@4');
    assert.equal(feature(main('let d = 0;', 'let f = || d;', 'println!("{}", 5 / d);')), 'const folding@4');
    assert.equal(rejects(main('let x: u8 = 255;', 'let f = move || x;', 'let y = x + 1;', 'println!("{} {}", y, f());')), 'arithmetic_overflow@4');
    assert.equal(rejects(main('let f = || { let a: u8 = 255; a + 1 };', 'println!("{}", f());')), 'arithmetic_overflow@2');
  });
  it('zip pulls one more item from a longer left side only when a closure would run, which is not modeled', () => {
    const zip = (left, right) => main('let a = vec![1, 2, 3];', 'let b = vec![1, 2];', `let n = ${left}.zip(${right}).count();`, 'println!("{}", n);');
    const noisy = 'a.iter().map(|x| { println!("a{}", x); *x })';
    assert.equal(feature(zip(noisy, 'b.iter()')), 'zip with a side effect on its longer side@4');
    assert.equal(feature(zip('a.iter().filter(|x| { println!("a{}", x); true })', 'b.iter()')), 'zip with a side effect on its longer side@4');
    assert.equal(out(zip('a.iter()', 'b.iter()')), '2\n');
    assert.equal(out(zip('b.iter().map(|x| { println!("b{}", x); *x })', 'a.iter()')), 'b1\nb2\n2\n');
    assert.equal(out(zip('b.iter().map(|x| { println!("b{}", x); *x })', 'a.iter().map(|x| { println!("a{}", x); *x })')), 'b1\na1\nb2\na2\n2\n');
    assert.ok(RQ.diag.hint('zip with a side effect on its longer side').length > 30);
  });
  it('a closure that only reads a Vec may be called in the arguments of a push on it (two-phase borrow)', () => {
    assert.equal(out(main('let mut v = vec![1];', 'let f = || v.len();', 'v.push(f());', 'println!("{:?}", v);')), '[1, 1]\n');
    assert.equal(rejects(main('let mut v = vec![1];', 'let f = || v.len();', 'v.push(f());', 'println!("{:?} {}", v, f());')), 'E0502@4');
    assert.equal(rejects(main('let mut v = vec![1];', 'let mut f = || v.push(2);', 'v.push(1);', 'f();')), 'E0499@4');
  });
  it('a named closure that an operator used passes through map; the engine does not guess the settled type', () => {
    const body = (call) => main('let v = vec![1, 2];', 'let f = |x| x * 2;', call, 'println!("{:?}", r);');
    assert.equal(out(body('let r: Vec<i32> = v.into_iter().map(f).collect();')), '[2, 4]\n');
    assert.equal(feature(body('let r: Vec<i32> = v.iter().map(f).collect();')), 'inferred type@4');
    assert.equal(feature(body('let r = v.iter().map(f).collect::<Vec<i32>>();')), 'inferred type@4');
  });
  it('a returned impl Fn judges the closure body against its own kind', () => {
    const mk = (kind, body, ret = 'i32') => P(`fn make() -> impl ${kind}() -> ${ret} {`, ...body.map((l) => '    ' + l), '}', main('let mut f = make();', 'println!("{:?}", f());'));
    const counter = ['let mut c = 0;', 'move || { c += 1; c }'];
    assert.equal(rejects(mk('Fn', counter)), 'E0594@3');
    assert.equal(out(mk('FnMut', counter)), '1\n');
    const mover = ['let s = String::from("x");', 'move || s'];
    assert.equal(rejects(mk('Fn', mover, 'String')), 'E0507@3');
    assert.equal(rejects(mk('FnMut', mover, 'String')), 'E0507@3');
    assert.equal(out(mk('FnOnce', mover, 'String')), '"x"\n');
    assert.equal(rejects(P('fn make() -> impl Fn() -> i32 {', '    let mut c = 0;', '    return move || { c += 1; c };', '}', main('println!("{}", make()());'))), 'E0594@3');
    assert.equal(feature(P('fn make(b: bool) -> impl Fn() -> i32 {', '    let mut c = 0;', '    if b { return move || { c += 1; c }; }', '    move || 1', '}', main('println!("{}", make(true)());'))), 'closure kind@4');
  });
  it('a closure is Copy when no capture is a move of a non-Copy value or a mutable borrow', () => {
    const apply = (bound) => `fn apply<F: ${bound}>(f: F) -> i32 { f() + f() }`;
    const run = (arg, setup = []) => P(apply('Copy + Fn() -> i32'), main(...setup, `println!("{}", apply(${arg}));`));
    assert.equal(out(run('|| 5')), '10\n');
    assert.equal(out(run('|| n', ['let n = 3;'])), '6\n');
    assert.equal(out(run('move || n', ['let n = 3;'])), '6\n');
    assert.equal(out(run('|| n.len() as i32', ['let n = String::from("a");'])), '2\n');
    assert.equal(rejects(run('move || n.len() as i32', ['let n = String::from("a");'])), 'E0277@4');
    assert.equal(rejects(run('|| { n += 1; n }', ['let mut n = 3;'])), 'E0277@4');
    assert.equal(feature(P(apply('Clone + Fn() -> i32'), main('println!("{}", apply(|| 5));'))), 'closure bound@3');
  });
  it('copying a Copy closure copies the state it captured by value', () => {
    assert.equal(out(main('let mut n = 0;', 'let mut f = move || { n += 1; n };', 'let mut g = f;', 'println!("{} {} {}", f(), g(), f());')), '1 1 2\n');
    assert.equal(out(P('fn bump<F: FnMut() -> i32>(mut f: F) -> i32 { f() + f() }', main('let mut n = 0;', 'let f = move || { n += 1; n };', 'println!("{} {}", bump(f), bump(f));'))), '3 3\n');
  });
  it('the code of a wrong call or argument type matches rustc, or the case is unsupported', () => {
    assert.equal(feature(main('let y = 1;', 'let f = |x| x + y;', 'println!("{}", f(1.5));')), 'inferred type@4');
    assert.equal(rejects(main('let y = 1;', 'let f = |x| x + y;', 'println!("{}", f(1));', 'println!("{}", f(1.5));')), 'E0308@5');
    assert.equal(rejects(main('let y = 1;', 'let f = |x: i32| x + y;', 'println!("{}", f(1.5));')), 'E0308@4');
    assert.equal(feature(main('let v = vec![1, 2];', 'let n = v.iter().map(|x: i32| x + 1).count();', 'println!("{}", n);')), 'type checking@3');
    assert.equal(rejects(P('fn apply<F: Fn(i32) -> i32>(f: F) -> i32 { f(1) }', main('println!("{}", apply(|x: i64| x));'))), 'E0631@3');
    assert.equal(feature(main('let f = || 1;', 'println!("{}", f.call());')), 'method call@3');
  });
});

describe('review fixes: mission checks cannot be passed with a decoy', () => {
  const missions = RQ.CH.find((c) => c.name === 'Closures and iterators').missions;
  const verdict = (i, src) => RQ.evalMission(missions[i], src).result;
  it('the context helpers count what they say', () => {
    const c = RQ.run(P('fn main() {', '    let mut v = vec![3, 1];', '    let f = |x: i32| { println!("f{}", x); x };', '    v.retain(|n| f(*n) > 1);', '    println!("{:?}", v);', '}'));
    assert.equal(c.status, 'ok');
    assert.equal(JSON.stringify(c.closures().map((x) => x.caps.map((k) => k.name + ':' + k.mode))), '[[],["f:ref"]]');
    assert.equal(c.printsIn(true), 1);
    assert.equal(c.printsIn(false), 1);
    assert.equal(c.printedCalls('f'), 0);
    assert.equal(c.onRecv('main', 'retain', 'v'), 1);
    assert.equal(c.onRecv('main', 'retain', 'w'), 0);
    assert.equal(c.callArg('apply', 'f'), 0);
  });
  it('every shipped answer still passes and each decoy of the review fails its mission', () => {
    missions.forEach((m, i) => {
      assert.equal(verdict(i, m.answer), true, `M${i + 1} answer`);
      for (const w of m.lazy) assert.notEqual(verdict(i, w.src), true, `M${i + 1} decoy: ${w.src}`);
    });
  });
});
