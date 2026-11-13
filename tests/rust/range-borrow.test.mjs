import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// Programs with one verdict each are corpus entries (slice-*); this file covers messages, panic places and what stays unsupported.
// Every expected message was printed by the pinned rustc (1.99.1, edition 2024).
const RQ = loadRust();
const main = (body, pre = '') => `${pre}fn main() {\n    ${body.split('\n').join('\n    ')}\n}\n`;
const msgs = (src) => Array.from(RQ.run(src).errors, (e) => `${e.code || e.lint}@${e.line} ${e.msg}`);
const ZERO = 'fn zero(a: &mut [i32]) {\n    a[0] = 0;\n}\n\n';

describe('a &mut slice of an array or a Vec', () => {
  it('writes reach the array behind the slice, at the offset the range gives', () => {
    assert.equal(RQ.run(main('let mut a = [1, 2, 3, 4];\nzero(&mut a[1..3]);\nlet i = 3;\nzero(&mut a[i..]);\nprintln!("{:?}", a);', ZERO)).stdout, '[1, 0, 3, 0]\n');
    assert.equal(RQ.run(main('let mut v = vec![1, 2, 3, 4, 5];\nlet s = &mut v[1..4];\ns.swap(0, 2);\ns[1] += 10;\nprintln!("{:?}", s);\nprintln!("{:?}", v);')).stdout, '[4, 13, 2]\n[1, 4, 13, 2, 5]\n');
  });

  it('a range panics as rustc does, at the `[` of the range', () => {
    const at = (body) => { const c = RQ.run(main(body, ZERO)); assert.equal(c.status, 'panic'); return [c.panic.msg, c.panic.line, c.panic.col]; };
    assert.deepEqual(at('let mut v = vec![1, 2, 3];\nlet n = 5;\nzero(&mut v[..n]);'), ['range end index 5 out of range for slice of length 3', 8, 16]);
    assert.deepEqual(at('let mut v = [1, 2, 3];\nlet s = 4;\nzero(&mut v[s..]);'), ['range start index 4 out of range for slice of length 3', 8, 16]);
    assert.deepEqual(at('let mut v = [1, 2, 3];\nlet (s, e) = (2, 1);\nzero(&mut v[s..e]);'), ['slice index starts at 2 but ends at 1', 8, 16]);
    assert.deepEqual(at('let mut v = [1, 2, 3, 4, 5];\nzero(&mut v[1..3]);\nlet z = &mut v[1..3];\nz[2] = 0;'), ['index out of bounds: the len is 2 but the index is 2', 9, 5]);
  });

  it('is_empty and len on a slice, and iter, len and iter_mut on v[a..b] itself', () => {
    const c = RQ.run(main('let v = vec![1, 2, 3, 4];\nlet s = &v[4..];\nprintln!("{} {} {}", s.is_empty(), v[1..3].len(), v[1..].iter().sum::<i32>());'));
    assert.equal(c.stdout, 'true 2 9\n');
  });

  it('the errors name the place as rustc does', () => {
    assert.deepEqual(msgs(main('let v = vec![1, 2, 3];\nzero(&mut v[..]);', ZERO)), ['E0596@7 cannot borrow `v` as mutable, as it is not declared as mutable']);
    assert.deepEqual(msgs(main('let v = [1, 2, 3];\nzero(&mut v[1..]);', ZERO)), ['E0596@7 cannot borrow `v` as mutable, as it is not declared as mutable']);
    assert.deepEqual(msgs(`${ZERO}fn outer(a: &[i32]) {\n    zero(&mut a[1..]);\n}\n\n${main('outer(&[1, 2, 3]);')}`), ['E0596@6 cannot borrow `*a` as mutable, as it is behind a `&` reference']);
    assert.deepEqual(msgs('struct B {\n    cells: Vec<i32>,\n}\n\nimpl B {\n    fn clear(&self) {\n        zero(&mut self.cells[1..]);\n    }\n}\n\n' + ZERO + main('let b = B { cells: vec![1] };\nb.clear();')), ['E0596@7 cannot borrow `self.cells` as mutable, as it is behind a `&` reference']);
    assert.deepEqual(msgs(main('let mut v = vec![1, 2, 3, 4];\nlet a = &mut v[..2];\nlet b = &mut v[2..];\na[0] = 1;\nb[0] = 2;')), ['E0499@4 cannot borrow `v` as mutable more than once at a time']);
    assert.deepEqual(msgs(main('let mut a = [1, 2, 3, 4];\nlet s = &mut a[1..];\na[0] = 5;\ns[0] = 1;')), ['E0506@4 cannot assign to `a[_]` because it is borrowed']);
    assert.deepEqual(msgs(main('let mut v = vec![1, 2, 3];\nlet r = &v;\nzero(&mut v[..]);\nprintln!("{:?}", r);', ZERO)), ['E0502@8 cannot borrow `v` as mutable because it is also borrowed as immutable']);
    assert.deepEqual(msgs(main('let mut v = vec![1, 2, 3, 4];\nzero(&mut v[..v.len() / 2]);', ZERO)), ['E0502@7 cannot borrow `v` as immutable because it is also borrowed as mutable']);
    assert.deepEqual(msgs(main('let mut v = [1, 2, 3];\nzero(&v[1..]);', ZERO)), ['E0308@7 mismatched types: expected `&mut [i32]`, found `&[{integer}]`']);
  });

  it('a for loop over a slice holds the base: a push or a write inside it is an error', () => {
    assert.deepEqual(msgs(main('let mut v = vec![1, 2, 3, 4];\nfor x in &v[1..3] {\nv.push(*x);\n}')), ['E0502@4 cannot borrow `v` as mutable because it is also borrowed as immutable']);
    assert.deepEqual(msgs(main('let mut a = [1, 2, 3, 4];\nfor x in &mut a[1..] {\na[0] = *x;\n}')), ['E0506@4 cannot assign to `a[_]` because it is borrowed']);
  });
});

describe('what a slice still leaves unsupported', () => {
  const OPEN = [
    ['kept in a variable', 'fn f(a: &mut [i32]) {\n    let b = &mut a[1..];\n    b[0] = 7;\n}\n\nfn main() {\n    f(&mut [1, 2, 3]);\n}\n', 'reborrow'],
    ['of a row, through a &mut parameter', `${ZERO}fn f(g: &mut Vec<Vec<i32>>) {\n    zero(&mut g[0][1..]);\n}\n\nfn main() {\n    f(&mut vec![vec![1, 2]]);\n}\n`, 'reborrow'],
    ['with the parameter read in a bound', `${ZERO}fn f(a: &mut [i32]) {\n    zero(&mut a[..a.len() / 2]);\n}\n\nfn main() {\n    f(&mut [1, 2, 3, 4]);\n}\n`, 'reborrow'],
    ['beside another use of the parameter in the call', 'fn z(a: &mut [i32], n: usize) {\n    a[0] = n as i32;\n}\n\nfn f(a: &mut [i32]) {\n    z(&mut a[1..], a.len());\n}\n\nfn main() {\n    f(&mut [1, 2, 3, 4]);\n}\n', 'reborrow'],
  ];
  for (const [what, src, feature] of OPEN) {
    it(what, () => {
      const c = RQ.run(src);
      assert.equal(c.status, 'unsupported');
      assert.equal(c.unsupported.feature, feature);
      assert.ok(RQ.diag.hint(feature).length > 30, feature);
    });
  }
});
