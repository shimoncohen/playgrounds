import { describe, it } from 'node:test';
import strict from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const assert = strict;
const RQ = loadRust();
const P = (...lines) => lines.join('\n') + '\n';
const ids = (c) => c.errors.map((e) => `${e.code || e.lint}@${e.line}`).join(',');
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src + JSON.stringify(c.errors)); return `${c.unsupported.feature}@${c.unsupported.line}`; };
const run = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', src + JSON.stringify(c.errors) + JSON.stringify(c.unsupported)); return c; };
const rejects = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', src); return ids(c); };

const CHECK = ['fn check(n: i32) -> Result<i32, String> {', '    if n < 0 { Err(String::from("negative")) } else { Ok(n) }', '}'];

describe('? on a Result', () => {
  it('passes Ok through and returns Err early', () => {
    const c = run(P(...CHECK, 'fn twice(n: i32) -> Result<i32, String> {', '    let v = check(n)?;', '    println!("checked {}", v);', '    Ok(v * 2)', '}',
      'fn main() {', '    println!("{:?}", twice(4));', '    println!("{:?}", twice(-1));', '}'));
    assert.equal(c.stdout, 'checked 4\nOk(8)\nErr("negative")\n');
  });
  it('moves the Result: using it afterwards is E0382', () => {
    assert.equal(rejects(P('fn f() -> Result<String, String> { Ok(String::from("a")) }', 'fn g() -> Result<String, String> {', '    let r = f();', '    let s = r?;', '    println!("{:?}", r);', '    Ok(s)', '}', 'fn main() { println!("{:?}", g()); }')), 'E0382@5');
  });
  it('moves a field out of a struct, leaving the others usable', () => {
    const c = run(P('struct S { r: Result<String, String>, n: i32 }', 'fn f(s: S) -> Result<usize, String> {', '    let t = s.r?;', '    println!("{}", s.n);', '    Ok(t.len())', '}', 'fn main() { println!("{:?}", f(S { r: Ok(String::from("abc")), n: 7 })); }'));
    assert.equal(c.stdout, '7\nOk(3)\n');
  });
  it('drops the locals of the function it leaves, innermost first', () => {
    const c = run(P('struct G(i32);', 'impl Drop for G { fn drop(&mut self) { println!("drop {}", self.0); } }',
      'fn f(n: i32) -> Result<i32, String> {', '    let _a = G(1);', '    if n < 0 { return Err(String::from("x")); }', '    Ok(n)', '}',
      'fn g(n: i32) -> Result<i32, String> {', '    let _g = G(2);', '    let v = f(n)?;', '    let _h = G(3);', '    Ok(v)', '}',
      'fn main() {', '    println!("{:?}", g(-1));', '}'));
    assert.equal(c.stdout, 'drop 1\ndrop 2\nErr("x")\n');
  });
  it('works inside a loop, a method and an operand of +', () => {
    const c = run(P(...CHECK, 'struct A { n: i32 }', 'impl A {', '    fn add(&mut self, k: i32) -> Result<i32, String> {', '        self.n += check(k)?;', '        Ok(self.n)', '    }', '}',
      'fn sum() -> Result<i32, String> {', '    let mut a = A { n: 0 };', '    for k in vec![1, 2, -3, 4] {', '        a.add(k)?;', '    }', '    Ok(check(1)? + check(2)?)', '}',
      'fn main() { println!("{:?}", sum()); }'));
    assert.equal(c.stdout, 'Err("negative")\n');
  });
  it('keeps the arithmetic lint on code after a ?', () => {
    assert.equal(rejects(P(...CHECK, 'fn g() -> Result<u8, String> {', '    let a = check(1)?;', '    let x: u8 = 255 + 1;', '    Ok(x)', '}', 'fn main() { println!("{:?}", g()); }')), 'arithmetic_overflow@6');
  });
  it('panics with the overflow after a ? like any other add', () => {
    const c = RQ.run(P('fn f(n: u8) -> Result<u8, String> { Ok(n) }', 'fn g() -> Result<u8, String> {', '    let a = f(200)?;', '    let b = f(100)?;', '    Ok(a + b)', '}', 'fn main() { println!("{:?}", g()); }'));
    assert.equal(c.status, 'panic');
    assert.equal(c.panic.msg, 'attempt to add with overflow');
  });
});

describe('? on an Option', () => {
  it('returns None early from an Option fn', () => {
    const c = run(P('fn g(o: Option<i32>) -> Option<i32> {', '    let a = o?;', '    let b = Some(a + 1)?;', '    Some(b)', '}', 'fn main() { println!("{:?} {:?}", g(Some(1)), g(None)); }'));
    assert.equal(c.stdout, 'Some(2) None\n');
  });
  it('a reference taken by get keeps its loan after the ?', () => {
    assert.equal(rejects(P('fn f() -> Option<()> {', '    let mut v = vec![1];', '    let x = v.get(0)?;', '    v.push(2);', '    println!("{}", x);', '    Some(())', '}', 'fn main() { f(); }')), 'E0502@4');
    run(P('fn f() -> Option<()> {', '    let mut v = vec![1];', '    let x = *v.get(0)?;', '    v.push(2);', '    println!("{}", x);', '    Some(())', '}', 'fn main() { f(); }'));
  });
});

describe('? diagnostics', () => {
  it('in a fn that returns nothing is one E0277 at the ?', () => {
    assert.equal(rejects(P(...CHECK, 'fn main() {', '    let v = check(1)?;', '    println!("{}", v);', '}')), 'E0277@5');
  });
  it('in a fn that returns another type is E0277 too', () => {
    assert.equal(rejects(P('fn f() -> Option<i32> { Some(1) }', 'fn g() -> i32 {', '    let v = f()?;', '    v', '}', 'fn main() { g(); }')), 'E0277@3');
  });
  it('an Option in a Result fn, and the reverse, are E0277 with rustc wording', () => {
    const a = RQ.run(P('fn f() -> Option<i32> { Some(1) }', 'fn g() -> Result<i32, String> {', '    let v = f()?;', '    Ok(v)', '}', 'fn main() { g().unwrap(); }'));
    assert.equal(ids(a), 'E0277@3');
    assert.match(a.errors[0].msg, /only be used on `Result`s, not `Option`s, in a function that returns `Result`/);
    const b = RQ.run(P('fn f() -> Result<i32, String> { Ok(1) }', 'fn g() -> Option<i32> {', '    let v = f()?;', '    Some(v)', '}', 'fn main() { g(); }'));
    assert.equal(ids(b), 'E0277@3');
    assert.match(b.errors[0].msg, /only be used on `Option`s, not `Result`s, in a function that returns `Option`/);
  });
  it('an error type with no From into the target is E0277', () => {
    const src = (a, b) => P('#[derive(Debug)]', `enum ${a} { X }`, '#[derive(Debug)]', `enum ${b} { Y }`, `fn f() -> Result<i32, ${a}> { Err(${a}::X) }`, `fn g() -> Result<i32, ${b}> {`, '    let v = f()?;', '    Ok(v)', '}', 'fn main() { println!("{:?}", g()); }');
    const c = RQ.run(src('A', 'B'));
    assert.equal(ids(c), 'E0277@7');
    assert.equal(c.errors[0].msg, '`?` couldn\'t convert the error to `B`');
    assert.equal(rejects(P('fn f() -> Result<i32, i32> { Err(1) }', 'fn g() -> Result<i32, String> {', '    let v = f()?;', '    Ok(v)', '}', 'fn main() { g(); }')), 'E0277@3');
  });
  it('an error type that std might convert stays unsupported', () => {
    assert.equal(feature(P('fn f() -> Result<i32, i32> { Err(1) }', 'fn g() -> Result<i32, i64> {', '    let v = f()?;', '    Ok(v)', '}', 'fn main() { g(); }')), 'error conversion@3');
  });
  it('an error type that is still open is unsupported, not guessed', () => {
    assert.equal(feature(P('fn g() -> Result<i32, String> {', '    let r = Ok(3)?;', '    Ok(r)', '}', 'fn main() { g(); }')), 'inferred type@2');
  });
  it('a ? on something else, or in a fn that returns a reference, is unsupported', () => {
    assert.equal(feature(P('fn f(v: &Vec<i32>) -> Option<&i32> {', '    let x = v.get(0)?;', '    Some(x)', '}', 'fn main() {}')), 'try operator@2');
  });
  it('the ? result is checked against the annotation with rustc wording', () => {
    const c = RQ.run(P('fn f() -> Result<i32, String> { Ok(1) }', 'fn g() -> Result<u8, String> {', '    let n: u8 = f()?;', '    Ok(n)', '}', 'fn main() { g(); }'));
    assert.equal(ids(c), 'E0308@3');
    assert.match(c.errors[0].msg, /^`\?` operator has incompatible types: expected `u8`, found `i32`/);
    assert.equal(rejects(P('fn f() -> Result<(), String> { Ok(()) }', 'fn g() -> Result<(), String> {', '    f()?;', '    f()?', '}', 'fn main() { g(); }')), 'E0308@4');
  });
});

describe('main -> Result', () => {
  it('Ok(()) is a normal run', () => {
    const c = run(P('fn main() -> Result<(), String> {', '    println!("hi");', '    Ok(())', '}'));
    assert.equal(c.exit, 0);
    assert.equal(c.stderr, '');
  });
  it('Err prints Error: and the Debug text to stderr and exits 1', () => {
    const c = run(P('fn main() -> Result<(), String> {', '    println!("start");', '    Err(String::from("bad \\"q\\""))', '}'));
    assert.equal(c.stdout, 'start\n');
    assert.equal(c.stderr, 'Error: "bad \\"q\\""\n');
    assert.equal(c.exit, 1);
  });
  it('a ? in main leaves with the error, after the locals are dropped', () => {
    const c = run(P('#[derive(Debug)]', 'enum E { Neg(i32) }', 'struct G(i32);', 'impl Drop for G { fn drop(&mut self) { println!("drop {}", self.0); } }',
      'fn f(n: i32) -> Result<i32, E> { if n < 0 { Err(E::Neg(n)) } else { Ok(n) } }',
      'fn main() -> Result<(), E> {', '    let _g = G(1);', '    f(2)?;', '    f(-7)?;', '    println!("unreached");', '    Ok(())', '}'));
    assert.equal(c.stdout, 'drop 1\n');
    assert.equal(c.stderr, 'Error: Neg(-7)\n');
    assert.equal(c.exit, 1);
  });
  it('a panic in main still exits 101', () => {
    const c = RQ.run(P('fn main() -> Result<(), String> {', '    let v: Vec<i32> = Vec::new();', '    let n = v.len() - 1;', '    println!("{}", n);', '    Ok(())', '}'));
    assert.equal(c.status, 'panic');
    assert.equal(c.exit, 101);
  });
  it('another return type, or an error that cannot be printed with {:?}, is unsupported', () => {
    assert.equal(feature(P('fn main() -> Result<i32, String> {', '    Ok(1)', '}')), 'main signature@1');
    assert.equal(feature(P('struct P;', 'fn main() -> Result<(), P> {', '    Ok(())', '}')), 'main signature@2');
    assert.equal(feature(P('fn main() -> i32 {', '    1', '}')), 'main signature@1');
  });
});

describe('Result and Option methods without a closure', () => {
  const body = (...l) => P('fn main() {', ...l.map((x) => '    ' + x), '}');
  it('ok, err, ok_or and unwrap_or_default', () => {
    const c = run(body('let r: Result<i32, String> = Err(String::from("boom"));',
      'println!("{:?} {:?}", r.clone().ok(), r.clone().err());',
      'let o: Option<i32> = None;',
      'println!("{:?}", o.ok_or(String::from("none")));',
      'println!("{:?}", Some(2).ok_or("e"));',
      'println!("{}", r.clone().unwrap_or_default());',
      'let z: Option<String> = None;',
      'println!("{:?}", z.unwrap_or_default());',
      'println!("{}", r.unwrap_err());'));
    assert.equal(c.stdout, 'None Some("boom")\nErr("none")\nOk(2)\n0\n""\nboom\n');
  });
  it('unwrap_err and expect_err panic on Ok with the value in the message', () => {
    const a = RQ.run(body('let r: Result<i32, String> = Ok(3);', 'r.unwrap_err();'));
    assert.equal(a.status, 'panic');
    assert.equal(a.panic.msg, 'called `Result::unwrap_err()` on an `Ok` value: 3');
    const b = RQ.run(body('let r: Result<i32, i32> = Ok(3);', 'r.expect_err("wanted err");'));
    assert.equal(b.panic.msg, 'wanted err: 3');
  });
  it('ok consumes the Result', () => {
    assert.equal(rejects(body('let r: Result<i32, String> = Ok(1);', 'let a = r.ok();', 'let b = r.ok();')), 'E0382@4');
  });
  it('unwrap_or_default needs Default', () => {
    assert.equal(feature(P('struct S { n: i32 }', ...body('let r: Result<S, i32> = Err(1);', 'let n = r.unwrap_or_default();').split('\n').filter(Boolean))).split('@')[0], 'method call');
    assert.equal(run(body('let r: Result<Vec<i32>, i32> = Err(1);', 'println!("{:?}", r.unwrap_or_default());')).stdout, '[]\n');
  });
  it('a closure method is modeled', () => {
    assert.equal(run(body('let r: Result<i32, i32> = Ok(1);', 'let n = r.map(|x| x + 1);', 'println!("{:?}", n);')).stdout, 'Ok(2)\n');
  });
});

describe('panic!', () => {
  const main = (...l) => P('fn main() {', ...l.map((x) => '    ' + x), '}');
  it('formats its message and points at the macro', () => {
    const c = RQ.run(main('println!("start");', 'panic!("the shells {} must split", 7);'));
    assert.equal(c.status, 'panic');
    assert.equal(c.exit, 101);
    assert.equal(c.stdout, 'start\n');
    assert.equal(c.stderr, "\nthread 'main' panicked at src/main.rs:3:5:\nthe shells 7 must split\n");
  });
  it('without arguments says explicit panic', () => {
    assert.equal(RQ.run(main('panic!();')).panic.msg, 'explicit panic');
  });
  it('has type never: it fits where a value is wanted and ends the code after it', () => {
    run(P('fn pick(n: i32) -> i32 {', '    if n > 0 { n } else { panic!("not positive: {}", n) }', '}', 'fn main() { println!("{}", pick(3)); }'));
    assert.equal(rejects(main('let s = String::from("a");', 'let t = s;', 'println!("{}", s);', 'panic!("x");')), 'E0382@4');
    assert.equal(RQ.run(main('panic!("x");', 'let a: u8 = 255 + 1;')).status, 'panic');
  });
  it('unwinds and drops the locals', () => {
    const c = RQ.run(P('struct G;', 'impl Drop for G { fn drop(&mut self) { println!("drop"); } }', 'fn main() {', '    let _g = G;', '    let x: i32 = panic!("boom");', '}'));
    assert.equal(c.status, 'panic');
    assert.equal(c.stdout, 'drop\n');
  });
  it('needs a string literal for its message', () => {
    const c = RQ.run(main('let m = "x";', 'panic!(m);'));
    assert.equal(c.status, 'error');
    assert.match(c.errors[0].msg, /format argument must be a string literal/);
  });
});

describe('? diagnostics carry their own tip', () => {
  it('the tip names the fix for the case, not the Display one', () => {
    const c = RQ.run(P('fn f() -> Result<i32, i32> { Ok(1) }', 'fn main() {', '    let v = f()?;', '}'));
    assert.match(c.errors[0].tip, /return type/);
  });
});

describe('check helpers for ? and ok_or', () => {
  const F = 'fn split(n: u32) -> Result<u32, String> { Ok(n) }';
  const t = (body, param) => RQ.run(P(F, 'fn g(a: u32) -> Result<u32, String> {', ...body, '}', 'fn main() {}')).tryOn('g', 'split', param);
  it('tryOn counts a ? on the call, or on a local that holds it, when its value is used', () => {
    assert.equal(t(['let x = split(a)?;', 'Ok(x)'], 'a'), 1);
    assert.equal(t(['Ok(split(a)?)'], 'a'), 1);
    assert.equal(t(['let r = split(a);', 'let x = r?;', 'Ok(x)'], 'a'), 1);
  });
  it('tryOn ignores a thrown-away ?, one on other input, and a hand-written match', () => {
    assert.equal(t(['let _z = split(a)?;', 'Ok(1)'], 'a'), 0);
    assert.equal(t(['split(a)?;', 'Ok(1)'], 'a'), 0);
    assert.equal(t(['let x = split(0)?;', 'Ok(x)'], 'a'), 0);
    assert.equal(t(['match split(a) { Ok(h) => Ok(h), Err(e) => return Err(e) }'], 'a'), 0);
  });
  it('chainOn wants the method on a chain from the base call, with its result used', () => {
    const c = (body) => RQ.run(P('fn h(v: &Vec<u32>, i: usize) -> Result<u32, String> {', ...body, '}', 'fn main() {}')).chainOn('h', 'ok_or', 'get');
    assert.equal(c(['let x = v.get(i).copied().ok_or(String::from("n"))?;', 'Ok(x)']), 1);
    assert.equal(c(['let _d = v.get(i).ok_or(String::from("n"));', 'Ok(0)']), 0);
    assert.equal(c(['v.get(i).ok_or(String::from("n"));', 'Ok(0)']), 0);
  });
});

describe('? in a closure with no declared return type', () => {
  const C = (body, tail) => P('fn main() {', '    let v = vec![1, 2, 3];', '    let f = |i: usize| {', `        ${body}`, `        ${tail}`, '    };', '    println!("{:?} {:?}", f(1), f(9));', '}');
  it('an Option ? is judged by the tail, which makes the closure return an Option', () => {
    assert.equal(run(C('let x = v.get(i)?;', 'Some(*x * 10)')).stdout, 'Some(20) None\n');
  });
  it('a plain tail is E0277 at the ?', () => {
    assert.equal(rejects(C('let x = v.get(i)?;', '*x * 10')), 'E0277@4');
  });
  it('a Result ? whose error type the tail leaves open is unsupported, not accepted', () => {
    assert.equal(feature(P('fn main() {', '    let f = |r: Result<i32, String>| {', '        let n = r?;', '        Ok(n + 1)', '    };', '    println!("{:?}", f(Ok(1)));', '}')), 'inferred type@3');
  });
  it('a closure with a declared return type is unchanged', () => {
    assert.equal(run(P('fn main() {', '    let f = |r: Option<i32>| -> Option<i32> { let n = r?; Some(n + 1) };', '    println!("{:?} {:?}", f(Some(1)), f(None));', '}')).stdout, 'Some(2) None\n');
  });
});
