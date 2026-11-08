import { describe, it } from 'node:test';
import strict from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const assert = { ...strict, deepEqual: (a, b, msg) => strict.equal(JSON.stringify(a), JSON.stringify(b), msg) };
const RQ = loadRust();
const P = (...lines) => lines.join('\n') + '\n';
const main = (...body) => P('fn main() {', ...body.map((l) => '    ' + l), '}');
const FIRST = P('fn first(s: &str) -> &str {', '    &s[0..2]', '}', '');
const ids = (c) => c.errors.map((e) => `${e.code || e.lint}@${e.line}`).join(',');
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src); return `${c.unsupported.feature}@${c.unsupported.line}`; };

describe('text slices', () => {
  it('take bytes from a String, a &String, a &str and a literal, with every range form', () => {
    assert.equal(RQ.run(main('let s = String::from("hello world");', 'println!("{}|{}|{}|{}|{}", &s[0..5], &s[..2], &s[6..], &s[..], &s[1..=3]);')).stdout, 'hello|he|world|hello world|ell\n');
    assert.equal(RQ.run(P('fn tail(s: &String) -> &str {', '    &s[1..]', '}', 'fn main() {', '    let s = String::from("abc");', '    println!("{}", tail(&s));', '}')).stdout, 'bc\n');
    assert.equal(RQ.run(main('let t = "hello";', 'println!("{}", &t[1..3]);')).stdout, 'el\n');
  });
  it('an empty range at the end is fine, and the bounds can be variables', () => {
    assert.equal(RQ.run(main('let s = String::from("hello");', 'let n = s.len();', 'println!("[{}][{}]", &s[n..], &s[2..2]);')).stdout, '[][]\n');
  });
  it('a slice of a slice counts from the start of the inner slice', () => {
    assert.equal(RQ.run(P('fn tail(s: &str) -> &str {', '    &s[1..]', '}', 'fn main() {', '    println!("{}", tail(tail("abcdefg")));', '}')).stdout, 'cdefg\n');
  });
  it('panics like Rust, at the `[`: end past the length, start past the end, an open start past the length', () => {
    const run = (r) => RQ.run(main('let s = String::from("hello");', 'let a = 4;', 'let b = 2;', 'let n = 10;', `println!("{}", &s[${r}]);`));
    for (const [r, msg, col] of [['0..n', 'end byte index 10 is out of bounds for string of length 5', 22], ['a..b', 'byte range starts at 4 but ends at 2', 22], ['n..', 'start byte index 10 is out of bounds for string of length 5', 22],
      ['a..=b', 'byte range starts at 4 but ends at 3', 22], ['..=n', 'end byte index 10 is out of bounds for string of length 5', 22], ['n..b', 'start byte index 10 is out of bounds for string of length 5', 22]]) {
      const c = run(r);
      assert.equal(c.status, 'panic', r);
      assert.equal(c.panic.msg, msg);
      assert.equal(c.exit, 101);
      assert.equal(c.stderr, `\nthread 'main' panicked at src/main.rs:6:${col}:\n${msg}\n`);
    }
  });
  it('text that is not plain ASCII is reported, not guessed', () => {
    assert.equal(feature(main('let s = "héllo";', 'println!("{}", &s[0..1]);')), 'slice of non-ASCII text@3');
  });
  it('a slice is a &str, so it prints, passes to a &str parameter and has a length', () => {
    assert.equal(RQ.run(P('fn show(s: &str) {', '    println!("{} {}", s, s.len());', '}', 'fn main() {', '    let s = String::from("hello");', '    show(&s[1..4]);', '}')).stdout, 'ell 3\n');
  });
});

describe('array slices', () => {
  const SUM = P('fn sum(xs: &[i32]) -> i32 {', '    let mut i = 0;', '    let mut t = 0;', '    while i < xs.len() {', '        t += xs[i];', '        i += 1;', '    }', '    t', '}', '');
  it('a &[T] parameter takes a whole array or any part of it', () => {
    assert.equal(RQ.run(P(SUM, 'fn main() {', '    let a = [1, 2, 3, 4];', '    println!("{} {} {}", sum(&a), sum(&a[1..3]), sum(&a[2..]));', '}')).stdout, '10 5 7\n');
  });
  it('prints with {:?}, has a length, and a slice of a slice counts from the inner start', () => {
    assert.equal(RQ.run(main('let a = [10, 20, 30, 40, 50];', 'let b = &a[1..4];', 'let c = &b[1..];', 'println!("{:?} {} {:?} {}", b, b.len(), c, a.len());')).stdout, '[20, 30, 40] 3 [30, 40] 5\n');
  });
  it('panics like Rust, and an index is checked against the slice, not the array', () => {
    const msg = (r) => RQ.run(main('let a = [1, 2, 3];', 'let i = 2;', 'let j = 1;', 'let n = 5;', `println!("{:?}", &a[${r}]);`)).panic.msg;
    assert.equal(msg('1..n'), 'range end index 5 out of range for slice of length 3');
    assert.equal(msg('i..j'), 'slice index starts at 2 but ends at 1');
    assert.equal(msg('n..'), 'range start index 5 out of range for slice of length 3');
    assert.equal(msg('1..=n'), 'range end index 5 out of range for slice of length 3');
    assert.equal(msg('n..j'), 'range start index 5 out of range for slice of length 3');
    assert.equal(msg('i..=0'), 'slice index starts at 2 but ends at 1');
    const c = RQ.run(P('fn get(xs: &[i32], i: usize) -> i32 {', '    xs[i]', '}', 'fn main() {', '    let a = [1, 2, 3];', '    println!("{}", get(&a[1..], 2));', '}'));
    assert.equal(c.panic.msg, 'index out of bounds: the len is 2 but the index is 2');
  });
  it('element types must agree, and an index must be usize', () => {
    assert.equal(ids(RQ.run(P('fn f(xs: &[i64]) {}', 'fn main() {', '    let a = [1i32, 2];', '    f(&a);', '}'))), 'E0308@4');
    assert.equal(feature(P('fn f(xs: &[i32]) -> i32 {', '    let i: i32 = 0;', '    xs[i]', '}', 'fn main() {}')), 'type checking@3');
  });
  it('what stays unsupported', () => {
    assert.equal(feature(P('fn f(xs: &mut [i32]) {}', 'fn main() {}')), 'reference@1');
    assert.equal(feature(main('let a = [1, 2, 3];', 'let b = &mut a[1..];')), 'reference@3');
    assert.equal(feature(main('let a = [String::new(), String::new()];', 'println!("{}", a.len());')), 'method call@3');
    assert.equal(feature(main('let a = [1, 2, 3];', 'let b = a[1..2];')), 'range expression@3');
    assert.equal(feature(P('fn main() {', '    let t = [[1, 2], [3, 4]];', '    let b = &t[0][..];', '}')), 'borrow of a field@3');
  });
});

describe('lifetime elision on a fn signature', () => {
  it('one reference parameter: the result borrows from it, whatever else is passed', () => {
    for (const src of [P('fn f(s: &str) -> &str {', '    s', '}', 'fn main() {}'), P('fn f(s: &String, n: usize) -> &String {', '    s', '}', 'fn main() {}'),
      P('fn f(n: usize, s: &[i32]) -> &[i32] {', '    s', '}', 'fn main() {}')]) {
      const c = RQ.compile(src);
      assert.deepEqual([c.diags, c.unsupported], [[], []], src);
    }
  });
  it('E0106 when no parameter or several could be borrowed from, at the & of the return type', () => {
    for (const src of [P('fn f() -> &str {', '    "a"', '}', 'fn main() {}'), P('fn f(a: &str, b: &str) -> &str {', '    a', '}', 'fn main() {}'),
      P('fn f(s: String) -> &str {', '    "a"', '}', 'fn main() {}')]) {
      const c = RQ.run(src);
      assert.equal(ids(c), 'E0106@1', src);
      assert.equal(c.errors[0].col, src.indexOf('-> ') + 4, src);
    }
  });
  it('a reference inside a slice type counts as a lifetime position', () => {
    assert.equal(ids(RQ.run(P('fn f(xs: &[&str]) -> &str {', '    xs[0]', '}', 'fn main() {}'))), 'E0106@1');
    assert.equal(ids(RQ.run(P('fn f(xs: i32) -> &[&str] {', '    &[]', '}', 'fn main() {}'))), 'E0106@1');
  });
  it("&'static str needs none, and what is not modeled is reported", () => {
    assert.equal(RQ.run(P("fn f(a: &str, b: &str) -> &'static str {", '    "x"', '}', 'fn main() {', '    println!("{}", f("a", "b"));', '}')).stdout, 'x\n');
    assert.equal(feature(P('fn f(x: &mut i32) -> &mut i32 {', '    x', '}', 'fn main() {}')), 'lifetime elision@1');
    assert.equal(feature(P('fn f(s: &String) -> (i32, &str) {', '    (1, "a")', '}', 'fn main() {}')), 'lifetime elision@1');
    assert.equal(feature(P('fn f(s: &mut String) -> &String {', '    s', '}', 'fn main() {}')), 'lifetime elision@1');
  });
  it('a &T is not a &mut T: E0308 at the call, and the other way round stays a reborrow', () => {
    assert.equal(ids(RQ.run(P('fn f(s: &mut String) {}', 'fn main() {', '    let mut s = String::new();', '    f(&s);', '}'))), 'E0308@4');
    assert.equal(feature(P('fn f(s: &String) {}', 'fn main() {', '    let mut s = String::new();', '    f(&mut s);', '}')), 'reference coercion@4');
  });
});

describe('E0515: returning a reference to a local', () => {
  it('words the error as rustc does: reference or value, local or parameter', () => {
    const msg = (...b) => RQ.run(P('fn make(s: &str, t: String) -> &str {', ...b.map((l) => '    ' + l), '}', 'fn main() {', '    make("a", String::new());', '}')).errors[0].msg;
    assert.equal(msg('let u = s.to_owned();', '&u'), 'cannot return reference to local variable `u`');
    assert.equal(msg('let u = s.to_owned();', '&u[0..1]'), 'cannot return value referencing local variable `u`');
    assert.equal(msg('let u = s.to_owned();', 'u.as_str()'), 'cannot return value referencing local variable `u`');
    assert.equal(msg('&t'), 'cannot return reference to function parameter `t`');
    assert.equal(msg('&t[..1]'), 'cannot return value referencing function parameter `t`');
  });
  const body = (...b) => P('fn make(s: &str, t: String) -> &str {', ...b.map((l) => '    ' + l), '}', 'fn main() {', '    make("a", String::new());', '}');
  it('finds a reference, a slice, as_str, a parameter and a reference kept in a variable', () => {
    for (const [b, line] of [[['let u = s.to_owned();', '&u'], 3], [['let u = s.to_owned();', '&u[0..1]'], 3], [['let u = s.to_owned();', 'u.as_str()'], 3], [['&t'], 2],
      [['let u = s.to_owned();', 'let r = &u;', 'r'], 4], [['let u = s.to_owned();', 'if s.len() > 1 {', '    return &u;', '}', 's'], 4]]) {
      assert.equal(ids(RQ.run(body(...b))), 'E0515@' + line, b.join(' '));
    }
  });
  it('accepts a result that borrows from a parameter reference, directly or through variables', () => {
    for (const b of [['s'], ['let u = s.to_owned();', '&s[0..1]'], ['let u = s;', 'let r = u;', 'r'], ['&s[1..]']]) {
      const c = RQ.run(body(...b));
      assert.equal(c.status, 'ok', b.join(' '));
    }
  });
  it('the E0597 of a plain scope end is unchanged', () => {
    assert.equal(ids(RQ.run(main('let w: &str;', '{', '    let t = String::from("hi");', '    w = &t[..];', '}', 'println!("{}", w);'))), 'E0597@5');
  });
});

describe('a returned reference keeps the argument it borrows from borrowed', () => {
  const m = (...b) => P(FIRST, 'fn main() {', '    let mut s = String::from("hello");', ...b.map((l) => '    ' + l), '}');
  it('E0502, E0505 and E0506 while the result is still used', () => {
    assert.equal(ids(RQ.run(m('let w = first(&s);', 's.push_str("!");', 'println!("{}", w);'))), 'E0502@9');
    assert.equal(ids(RQ.run(m('let w = first(&s);', 'drop(s);', 'println!("{}", w);'))), 'E0505@9');
    assert.equal(ids(RQ.run(m('let w = first(&s);', 's = String::new();', 'println!("{}", w);'))), 'E0506@9');
    assert.equal(ids(RQ.run(m('let w = first(first(&s));', 's.push_str("!");', 'println!("{}", w);'))), 'E0502@9');
  });
  it('accepts the change once the result is used up', () => {
    assert.equal(RQ.run(m('let w = first(&s);', 'println!("{}", w);', 's.push_str("!");', 'println!("{}", s);')).stdout, 'he\nhello!\n');
  });
  it('a slice written in place, of a String and of an array, borrows the same way', () => {
    assert.equal(ids(RQ.run(main('let mut s = String::from("hello");', 'let w = &s[0..2];', 's.push_str("!");', 'println!("{}", w);'))), 'E0502@4');
    assert.equal(ids(RQ.run(main('let mut a = [1, 2, 3];', 'let w = &a[1..];', 'a = [4, 5, 6];', 'println!("{:?}", w);'))), 'E0506@4');
  });
  it("a fn returning &'static str hands back no loan", () => {
    const src = P("fn name(s: &String) -> &'static str {", '    "n"', '}', 'fn main() {', '    let mut s = String::new();', '    let w = name(&s);', '    s.push_str("!");', '    println!("{}", w);', '}');
    assert.equal(RQ.run(src).stdout, 'n\n');
  });
});

describe('maxLive and the check helpers', () => {
  it('counts explicit loans alive at once, per borrowed variable', () => {
    const a = RQ.run(main('let s = String::from("hi");', 'let a = &s;', 'let b = &s;', 'println!("{} {}", a, b);'));
    assert.equal(a.maxLive('shared'), 2);
    assert.equal(a.maxLive('mut'), 0);
    const b = RQ.run(main('let s = String::from("hi");', 'let a = &s;', 'println!("{}", a);', 'let b = &s;', 'println!("{}", b);'));
    assert.equal(b.maxLive('shared'), 1);
    assert.equal(RQ.run(main('let s = String::from("hi");', 'println!("{} {}", s, s);')).maxLive('shared'), 0);
    const c = RQ.run(main('let mut s = String::from("hi");', 'let m = &mut s;', 'm.push_str("!");', 'println!("{}", s);'));
    assert.deepEqual([c.maxLive('mut'), c.maxLive('shared')], [1, 0]);
  });
  it('a copy of a reference is not a second loan', () => {
    assert.equal(RQ.run(main('let s = String::from("hi");', 'let a = &s;', 'let b = a;', 'println!("{} {}", a, b);')).maxLive('shared'), 1);
  });
  it('paramIsRef and methodIn read the code that was written', () => {
    const c = RQ.run(P('fn f(a: &String, b: &mut String, c: String) {', '    b.push_str("x");', '}', 'fn main() {', '    let mut s = String::new();', '    let mut t = String::new();', '    f(&s, &mut t, String::new());', '}'));
    assert.deepEqual([0, 1, 2].map((i) => c.paramIsRef('f', i)), [true, true, false]);
    assert.deepEqual([0, 1].map((i) => c.paramIsRef('f', i, 'mut')), [false, true]);
    assert.equal(c.paramIsRef('missing', 0), false);
    assert.deepEqual([c.usesParam('f', 1), c.usesParam('f', 0), c.usesParam('f', 2)], [true, false, false]);
    assert.deepEqual([c.methodIn('f', 'push_str'), c.methodIn('main', 'push_str')], [1, 0]);
  });
});

describe('snapshots of a slice', () => {
  it('a text slice and an array slice are references that point at the variable they borrow', () => {
    const c = RQ.run(main('let s = String::from("hello world");', 'let w = &s[6..];', 'let a = [1, 2, 3];', 'let b = &a[1..];', 'println!("{} {:?}", w, b);'), { snap: true });
    const last = c.snaps[c.snaps.length - 2];
    const v = (n) => last.frames[0].vars.find((x) => x.name === n);
    const w = v('w').leaves[0], b = v('b').leaves[0];
    assert.deepEqual([w.ref, w.toName, w.text, w.range, w.into], [true, 's', '"world"', [6, 11], 1]);
    assert.deepEqual([b.ref, b.toName, b.text], [true, 'a', '[1..3]']);
  });
});
