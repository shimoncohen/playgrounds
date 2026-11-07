import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
// arrays made inside the vm sandbox have another realm's prototype, which strict deepEqual rejects
const P = (src) => { const r = RQ.parse(RQ.lex(src)); return { ast: r.ast, errors: Array.from(r.errors), unsupported: Array.from(r.unsupported) }; };
const ok = (src) => { const r = P(src); assert.deepEqual(r.errors, [], src); return r; };
const kinds = (ast) => { const s = new Set(); RQ.walk(ast, (n) => { s.add(n.t); }); return s; };

describe('parser: the whole subset grammar parses', () => {
  it('parses a small program into a tree with unique node ids', () => {
    const { ast } = ok('fn main() {\n    let mut x: i32 = 5;\n    x += 1;\n    println!("{}", x + 2 * 3);\n}\n');
    const ids = [];
    RQ.walk(ast, (n) => { ids.push(n.id); });
    assert.equal(new Set(ids).size, ids.length);
    const f = ast.items[0];
    assert.equal(f.t, 'Fn');
    assert.equal(f.name, 'main');
    assert.equal(f.body.stmts.length, 3);
    assert.equal(f.body.stmts[0].t, 'Let');
    const mac = f.body.stmts[2].expr;
    assert.equal(mac.t, 'Macro');
    assert.equal(mac.args[1].t, 'Binary');
    assert.equal(mac.args[1].rhs.op, '*', 'precedence: * binds tighter than +');
  });

  it('parses items, generics, patterns, closures and control flow', () => {
    const src = `
#[derive(Debug, Clone)]
pub struct P<T: Copy> where T: Clone { x: T, y: T }
struct U;
struct W(i32, String);
enum E<'a> { A, B(i32, &'a str), C { n: u8 }, D = 4 }
trait Shape: Copy { const N: usize; type Out; fn area(&self) -> f64; fn name(&self) -> String { String::from("s") } }
impl<T> Shape for P<T> where T: Copy { fn area(&self) -> f64 { 1.0 } }
impl P<i32> { fn new(x: i32) -> Self { P { x, y: x } } fn bump(&mut self, by: i32) { self.x += by; } fn take(self) -> i32 { self.x } }
const MAX: usize = 10;
static GREETING: &str = "hi";
type Pair = (i32, i32);
use std::collections::HashMap;
mod inner { pub fn f() {} }
fn pick<'a, T: PartialOrd + Copy>(a: &'a [T], b: &'a mut Vec<T>) -> Option<&'a T> { None }
fn main() {
    let (a, mut b) = (1, 2);
    let P { x, y: ref z } = P { x: 1, y: 2 };
    let v: Vec<i32> = Vec::new();
    let w = vec![1, 2, 3];
    let r = vec![0; 4];
    let m: HashMap<String, Vec<u8>> = HashMap::new();
    let c = |p: i32, q| p + q;
    let d = move || -> i32 { 3 };
    let t = if a > 1 { 2 } else if a < 0 { 3 } else { 4 };
    let n = match t { 0 => "zero", 1 | 2 => "small", 3..=9 => "mid", k if k > 9 => "big", _ => "neg" };
    let e = E::B(1, "s");
    if let E::B(n, _) = e { println!("{n}"); }
    while let Some(top) = v.pop() { break; }
    'outer: for i in 0..10 { for j in (0..i).rev() { if j == 3 { continue 'outer; } } }
    let x = loop { break 5; };
    let s = &mut b; *s += 1;
    let casted = a as u8 as i64;
    let q = v.iter().map(|k| k * 2).collect::<Vec<_>>();
    let tup = (1, "two", 3.0);
    let first = tup.0;
    let arr = [1, 2, 3];
    let sl = &arr[1..];
    let Some(zz) = None::<i32> else { return; };
    let ch = 'c'; let lt = b'x';
    if a == 1 && let Some(k) = Some(2) { }
    'label: { break 'label; }
}`;
    const { ast, unsupported } = P(src);
    assert.deepEqual(P(src).errors, []);
    for (const k of ['Struct', 'Enum', 'Trait', 'Impl', 'Const', 'Static', 'TypeAlias', 'Use', 'Mod', 'Closure', 'Match', 'If', 'While', 'Loop', 'For', 'Range', 'Cast', 'MethodCall', 'Index', 'StructLit', 'Macro', 'TupleStructPat', 'StructPat', 'RangePat', 'Or', 'LetCond', 'Ref', 'Field']) assert.ok(kinds(ast).has(k), k);
    assert.deepEqual(unsupported.map((u) => u.feature).sort(), ['byte literal']);
  });

  it('parses Fn-bound syntax as in a std signature', () => {
    const src = `fn map<B, F: FnMut(i32) -> B>(self, f: F) -> Vec<B> where F: Fn(&T, &T) -> bool + Sized {}
fn run(f: impl FnOnce() -> i32) -> Box<fn(u8) -> u8> {}`;
    const { ast } = ok(src);
    const bounds = ast.items[0].generics[1].bounds;
    assert.equal(bounds[0].segs[0].name, 'FnMut');
    assert.equal(bounds[0].segs[0].fn.inputs.length, 1);
    assert.equal(bounds[0].segs[0].fn.ret.t, 'Path');
  });

  it('splits >> and >= in nested generics', () => {
    ok('fn f() { let a: Vec<Vec<i32>> = Vec::new(); let b: Option<Vec<u8>>= None; let c = x.collect::<Vec<Vec<u8>>>(); }');
  });

  it('uses the parenthesised and tuple forms of fields and struct patterns', () => {
    ok('fn f() { let a = t.0.1; let (x, y,) = (1, 2,); let [first, .., last] = arr; let &(ref m, _) = &pair; }');
  });
});

describe('parser: syntax errors carry a position', () => {
  it('a missing `;` points at the end of the line before', () => {
    const r = P('fn main() {\n    let x = 5\n    let y = 6;\n}');
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].line, 2);
    assert.match(r.errors[0].msg, /expected `;`/);
    assert.equal(r.ast, null);
  });

  it('a missing `}` points at the unclosed `{`', () => {
    const r = P('fn main() {\n    println!("hi");\n');
    assert.deepEqual([r.errors[0].line, r.errors[0].col], [1, 11]);
    assert.match(r.errors[0].msg, /unclosed delimiter/);
  });

  it('a stray or mismatched closer is reported where it stands', () => {
    assert.equal(P('fn main() {}\n}').errors[0].line, 2);
    assert.equal(P('fn main() {\n  let a = (1];\n}').errors[0].line, 2);
  });

  it('an unclosed string points at its opening quote', () => {
    const r = P('fn main() {\n    println!("oops);\n}');
    assert.deepEqual([r.errors[0].line, r.errors[0].col], [2, 14]);
    assert.match(r.errors[0].msg, /unclosed double quote string/);
  });

  it('other syntax errors say what was expected', () => {
    assert.match(P('fn main(x) {}').errors[0].msg, /expected/);
    assert.equal(P('let x = 1;').errors[0].line, 1);
    assert.match(P('fn main() { let = 5; }').errors[0].msg, /expected/);
    assert.match(P('fn main() { 1 + ; }').errors[0].msg, /expected expression/);
  });
});

describe('parser: out-of-subset constructs parse, then report unsupported', () => {
  const feats = (src) => { const r = P(src); assert.deepEqual(r.errors, [], src); return r.unsupported.map((u) => `${u.feature}@${u.line}`); };
  it('unsafe', () => {
    assert.deepEqual(feats('fn main() {\n    unsafe { let x = 1; }\n}'), ['unsafe@2']);
    assert.deepEqual(feats('unsafe fn f() {}'), ['unsafe@1']);
  });
  it('HashSet and other collections the quest does not model', () => {
    assert.deepEqual(feats('use std::collections::HashSet;\nfn main() { let s: HashSet<i32> = HashSet::new(); }'), ['HashSet@1', 'HashSet@2']);
    assert.deepEqual(feats('fn f(x: Rc<RefCell<i32>>) {}'), ['Rc@1', 'RefCell@1']);
  });
  it('dyn', () => {
    assert.deepEqual(feats('fn f(x: &dyn Show) {}\nfn g(x: Box<dyn Show + \'static>) {}'), ['dyn@1', 'dyn@2']);
  });
  it('wide ints and f32, in types and as suffixes', () => {
    assert.deepEqual(feats('fn main() { let a: i128 = 1; let b = 2u128; let c = 1.5f32; }'), ['i128@1', 'u128@1', 'f32@1']);
  });
  it('async, static mut, union, macro_rules, dbg! and other macros', () => {
    assert.deepEqual(feats('async fn f() {}'), ['async@1']);
    assert.deepEqual(feats('static mut N: i32 = 0;'), ['static mut@1']);
    assert.deepEqual(feats('union U { a: i32 }'), ['union@1']);
    assert.deepEqual(feats('macro_rules! m { () => {} }'), ['macro_rules@1']);
    assert.deepEqual(feats('fn main() { dbg!(1 + 2); matches!(x, Some(_)); }'), ['dbg!@1', 'other macro@1']);
    assert.deepEqual(feats('const fn f() {}'), ['const fn@1']);
    assert.deepEqual(feats('fn f(p: *const u8) {}'), ['raw pointer@1']);
  });
  it('every feature the parser can report is in RQ.PARSE_FEATURES', () => {
    const all = ['unsafe', 'HashSet', 'Rc', 'RefCell', 'dyn', 'i128', 'u128', 'f32', 'async', 'static mut', 'union', 'macro_rules', 'dbg!', 'other macro', 'const fn', 'raw pointer', 'byte literal'];
    for (const f of all) assert.ok(RQ.PARSE_FEATURES.includes(f), f);
  });
});

describe('parser: size', () => {
  it('parses a 5,000-line source quickly', () => {
    const src = 'fn f(a: i32) -> i32 {\n    let b = a + 1;\n    b * 2\n}\n\n'.repeat(1000);
    const t0 = Date.now();
    const r = P(src);
    assert.deepEqual(r.errors, []);
    assert.equal(r.ast.items.length, 1000);
    assert.ok(Date.now() - t0 < 5000);
  });
});
