import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// Programs with one verdict each are corpus entries (seq-*); this file covers the values, the messages and what stays unsupported.
const RQ = loadRust();
const main = (body, pre = '') => `${pre}fn main() {\n    ${body.split('\n').join('\n    ')}\n}\n`;
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', src); return c.stdout; };
const msgs = (src) => Array.from(RQ.run(src).errors, (e) => `${e.code || e.lint}@${e.line}:${e.col} ${e.msg}`);

describe('sort, reverse, contains, first and last on an array and a slice', () => {
  it('an array, a Vec and a &mut slice parameter all sort and reverse in place', () => {
    assert.equal(out(main('let mut a = [3, 1, 2];\na.sort();\nprintln!("{:?}", a);\na.reverse();\nprintln!("{:?}", a);\na.sort_unstable();\nprintln!("{:?}", a);')), '[1, 2, 3]\n[3, 2, 1]\n[1, 2, 3]\n');
    assert.equal(out('fn s(x: &mut [i32]) {\n    x.sort_unstable();\n    x.reverse();\n}\n\n' + main('let mut v = vec![3, 1, 2];\ns(&mut v);\nlet mut a = [5, 7, 6];\ns(&mut a);\nprintln!("{:?} {:?}", v, a);')), '[3, 2, 1] [7, 6, 5]\n');
    assert.equal(out(main('let mut v = vec![3, 1, 2];\nv.sort_unstable();\nprintln!("{:?}", v);')), '[1, 2, 3]\n');
  });

  it('a range receiver changes only its window of the array behind it', () => {
    assert.equal(out(main('let mut v = vec![5, 4, 3, 2, 1];\nv[1..].sort();\nprintln!("{:?}", v);\nv[..3].reverse();\nprintln!("{:?}", v);')), '[5, 1, 2, 3, 4]\n[2, 1, 5, 3, 4]\n');
    assert.equal(out(main('let mut a = [5, 4, 3, 2, 1];\na[1..4].sort_unstable();\nprintln!("{:?}", a);')), '[5, 2, 3, 4, 1]\n');
    assert.equal(out('fn s(x: &mut [i32]) {\n    x.sort();\n}\n\n' + main('let mut v = vec![3, 1, 2, 0];\ns(&mut v[1..3]);\nprintln!("{:?}", v);')), '[3, 1, 2, 0]\n');
  });

  it('contains, first and last read the window, and first and last are None when it is empty', () => {
    assert.equal(out(main('let a = [5, 4, 3, 2, 1];\nprintln!("{} {} {:?} {:?}", a.contains(&4), a[..2].contains(&3), a.first(), a[1..3].last());')), 'true false Some(5) Some(3)\n');
    assert.equal(out(main('let v = vec![5, 4, 3];\nprintln!("{:?} {:?}", v[1..1].first(), v[3..].last());')), 'None None\n');
    assert.equal(out('fn f(x: &[i32]) -> i32 {\n    match x.first() {\n        Some(v) => *v,\n        None => -1,\n    }\n}\n\n' + main('println!("{} {}", f(&[7, 8]), f(&[]));')), '7 -1\n');
  });

  it('text, tuples, structs and nested arrays sort by the Ord they have', () => {
    assert.equal(out(main('let mut a = [String::from("b"), String::from("a")];\na.sort();\nprintln!("{:?}", a);')), '["a", "b"]\n');
    assert.equal(out(main("let mut a = [(2, 'a'), (1, 'b')];\na.sort();\nprintln!(\"{:?}\", a);")), "[(1, 'b'), (2, 'a')]\n");
    assert.equal(out('#[derive(PartialEq, Eq, PartialOrd, Ord, Debug)]\nstruct P {\n    x: i32,\n    y: i32,\n}\n\n' + main('let mut a = [P { x: 2, y: 1 }, P { x: 1, y: 5 }, P { x: 1, y: 3 }];\na.sort();\nprintln!("{:?}", a);')), '[P { x: 1, y: 3 }, P { x: 1, y: 5 }, P { x: 2, y: 1 }]\n');
  });

  it('an out-of-range window panics as the range does', () => {
    const c = RQ.run(main('let mut v = [5, 4, 3];\nlet n = 9;\nv[..n].sort();'));
    assert.equal(c.status, 'panic');
    assert.equal(c.panic.msg, 'range end index 9 out of range for slice of length 3');
  });
});

describe('what rustc rejects in them', () => {
  it('sorting or reversing through a name that is not mut, or behind a & reference, is E0596', () => {
    assert.deepEqual(msgs(main('let a = [3, 1, 2];\na.sort();')), ['E0596@3:5 cannot borrow `a` as mutable, as it is not declared as mutable']);
    assert.deepEqual(msgs(main('let a = [3, 1, 2];\na.reverse();')), ['E0596@3:5 cannot borrow `a` as mutable, as it is not declared as mutable']);
    assert.deepEqual(msgs(main('let v = vec![3, 1, 2];\nv.sort_unstable();')), ['E0596@3:5 cannot borrow `v` as mutable, as it is not declared as mutable']);
    assert.deepEqual(msgs(main('let v = [5, 4, 3];\nv[1..].sort();')), ['E0596@3:5 cannot borrow `v` as mutable, as it is not declared as mutable']);
    assert.deepEqual(msgs('fn s(x: &[i32]) {\n    x.sort();\n}\n\n' + main('s(&[1]);')), ['E0596@2:5 cannot borrow `*x` as mutable, as it is behind a `&` reference']);
    assert.deepEqual(msgs('struct S {\n    a: [i32; 3],\n}\n\nfn f(s: &S) {\n    s.a.sort();\n}\n\n' + main('f(&S { a: [1, 2, 3] });')), ['E0596@6:5 cannot borrow `s.a` as mutable, as it is behind a `&` reference']);
  });

  it('sorting numbers with a decimal point is E0277, because f64 has no Ord', () => {
    assert.deepEqual(msgs(main('let mut a = [3.0, 1.0];\na.sort();')), ['E0277@3:7 the trait bound `{float}: Ord` is not satisfied']);
    assert.deepEqual(msgs(main('let mut a = vec![3.0, 1.0];\na.sort_unstable();')), ['E0277@3:7 the trait bound `{float}: Ord` is not satisfied']);
    assert.deepEqual(msgs('fn s(x: &mut [f64]) {\n    x.sort();\n}\n\n' + main('s(&mut [1.0]);')), ['E0277@2:7 the trait bound `f64: Ord` is not satisfied']);
    assert.deepEqual(msgs('struct P {\n    x: i32,\n}\n\n' + main('let mut a = [P { x: 2 }];\na.sort();')), ['E0277@7:7 the trait bound `P: Ord` is not satisfied']);
  });

  it('a borrow from first or last blocks a sort while it is used, and contains takes a reference', () => {
    assert.deepEqual(msgs(main('let mut a = [5, 4, 3];\nlet f = a.first();\na.sort();\nprintln!("{:?}", f);')).map((m) => m.split(' ')[0]), ['E0502@4:5']);
    assert.deepEqual(msgs(main('let mut a = [5, 4, 3];\nlet f = a.last().unwrap();\na[0] = 9;\nprintln!("{}", f);')).map((m) => m.split(' ')[0]), ['E0506@4:5']);
    assert.deepEqual(msgs(main('let a = [3, 1];\nprintln!("{}", a.contains(1));')).map((m) => m.split(' ')[0]), ['E0308@3:31']);
  });

  it('a value of a type without PartialEq cannot be looked up with contains', () => {
    assert.deepEqual(msgs('struct P {\n    x: i32,\n}\n\n' + main('let a = [P { x: 1 }];\nprintln!("{}", a.contains(&P { x: 1 }));')), ["E0277@7:22 can't compare `P` with `P`"]);
  });
});

describe('what stays unsupported', () => {
  const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src); return c.unsupported.feature; };

  it('sort_by and sort_by_key on an array or a slice, get on an array, and a wrong argument count', () => {
    assert.equal(feature(main('let mut a = [3, 1, 2];\na.sort_by(|x, y| y.cmp(x));')), 'method call');
    assert.equal(feature(main('let a = [3, 1, 2];\nprintln!("{:?}", a.get(1));')), 'method call');
    assert.equal(feature(main('let mut a = [3, 1];\na.sort(1);')), 'wrong argument count');
  });

  it('a range of a slice reached through a &mut reference, and a row of a two-level array', () => {
    assert.equal(feature('fn s(x: &mut [i32]) {\n    x[1..].sort();\n}\n\n' + main('s(&mut [3, 1, 2]);')), 'reborrow');
    assert.equal(feature(main('let mut g = [[3, 1], [2, 0]];\ng[0].sort();')), 'borrow of a field');
  });

  it('the hint for a method it does not know names the array and slice methods', () => {
    assert.match(RQ.diag.hint('collection method'), /array or a slice.*`sort_unstable`/);
  });
});
