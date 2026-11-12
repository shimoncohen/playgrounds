import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// Programs with one verdict each are corpus entries (nest-*, elem-*); this file covers messages, order and events.
// Every expected message was printed by the pinned rustc (1.99.1, edition 2024).
const RQ = loadRust();
const main = (body, pre = '') => `${pre}fn main() {\n    ${body.split('\n').join('\n    ')}\n}\n`;
const msgs = (src) => Array.from(RQ.run(src).errors, (e) => `${e.code || e.lint}@${e.line} ${e.msg}`);
const P = 'struct P {\n    x: i32,\n}\n\n';

describe('writing into a Vec of arrays, an array of Vecs, or a field of an element', () => {
  it('runs the shapes a grid or a particle list uses', () => {
    assert.equal(RQ.run(main('let mut v = vec![[0; 3]; 2];\nv[1][2] = 7;\nv[0][0] += 1;\nprintln!("{:?}", v);')).stdout, '[[1, 0, 0], [0, 0, 7]]\n');
    assert.equal(RQ.run(main('let mut a = [vec![1, 2], vec![3]];\na[0][1] = 9;\na[1][0] *= 5;\nprintln!("{:?}", a);')).stdout, '[[1, 9], [15]]\n');
    assert.equal(RQ.run(`fn fill(g: &mut [Vec<u8>]) {\n    g[0][1] = 4;\n}\n\n${main('let mut g = vec![vec![0; 3]; 2];\nfill(&mut g);\nprintln!("{:?}", g);')}`).stdout, '[[0, 4, 0], [0, 0, 0]]\n');
    const ps = RQ.run(main('let mut ps = [Q { x: 0, vx: 2 }, Q { x: 1, vx: 3 }];\nfor i in 0..ps.len() {\nps[i].x += ps[i].vx;\n}\nlet mut w = vec![ps[0], ps[1]];\nw[1].vx = 0;\nprintln!("{} {} {}", ps[0].x, ps[1].x, w[1].vx);', '#[derive(Clone, Copy)]\nstruct Q {\n    x: i32,\n    vx: i32,\n}\n\n'));
    assert.equal(ps.stdout, '2 4 0\n');
  });

  it('a field is written below any number of indexes, structs and tuples', () => {
    assert.equal(RQ.run(main('let mut v = vec![T { ins: vec![(1, 2)] }];\nv[0].ins[0].1 = 8;\nv[0].ins[0].0 += 1;\nprintln!("{:?}", v[0].ins);', 'struct T {\n    ins: Vec<(i32, i32)>,\n}\n\n')).stdout, '[(2, 8)]\n');
    assert.equal(RQ.run(main('let mut a = [(0, 0); 2];\na[1].0 = 5;\nprintln!("{:?}", a);')).stdout, '[(0, 0), (5, 0)]\n');
  });

  it('the right side runs first, then the indexes, and a bad index panics after the right side printed', () => {
    const f = 'fn f() -> i32 {\n    println!("rhs");\n    1\n}\n\n';
    const c = RQ.run(main('let mut v = vec![P { x: 1 }];\nlet i = 1;\nv[i].x = f();', P + f));
    assert.equal(c.stdout, 'rhs\n');
    assert.equal(c.panic.msg, 'index out of bounds: the len is 1 but the index is 1');
    assert.equal(RQ.run(main('let mut a = [P { x: 1 }];\nlet mut i = 0;\nwhile i < 1 {\ni += 1;\n}\na[i].x += f();', P + f)).stdout, 'rhs\n');
    assert.equal(RQ.run(main('let mut v = vec![vec![0; 2]; 2];\nlet i = 1;\nv[i][3] = f();', f)).stdout, 'rhs\n');
  });

  it('an overwritten field is dropped at once', () => {
    const c = RQ.run(main('let mut v = vec![W { n: N(1) }, W { n: N(2) }];\nv[0].n = N(3);\nprintln!("set");', 'struct N(i32);\n\nimpl Drop for N {\n    fn drop(&mut self) {\n        println!("drop {}", self.0);\n    }\n}\n\nstruct W {\n    n: N,\n}\n\n'));
    assert.equal(c.stdout, 'drop 1\nset\ndrop 3\ndrop 2\n');
  });

  it('an index past the end of a field write is the same panic as for a plain element', () => {
    const c = RQ.run(main('let mut v = vec![P { x: 1 }];\nlet i = 3;\nv[i].x = 1;', P));
    assert.equal(c.status, 'panic');
    assert.equal(c.panic.msg, 'index out of bounds: the len is 1 but the index is 3');
    assert.deepEqual([c.panic.line, c.panic.col], [8, 6]);
    assert.equal(msgs(main('let mut a = [P { x: 1 }, P { x: 2 }];\na[2].x = 1;', P))[0].split(':')[0], 'unconditional_panic@7 this operation will panic at runtime');
  });
});

describe('the errors of a write below an index name the place as rustc does', () => {
  it('an array of structs is E0594 on the field, a Vec of structs is E0596 on the Vec', () => {
    assert.deepEqual(msgs(main('let a = [P { x: 0 }];\na[0].x = 1;', P)), ['E0594@7 cannot assign to `a[_].x`, as `a` is not declared as mutable']);
    assert.deepEqual(msgs(main('let v = vec![P { x: 0 }];\nv[0].x = 1;', P)), ['E0596@7 cannot borrow `v` as mutable, as it is not declared as mutable']);
    assert.deepEqual(msgs(main('let a = [(0, 0)];\na[0].1 = 1;')), ['E0594@3 cannot assign to `a[_].1`, as `a` is not declared as mutable']);
    assert.deepEqual(msgs(main('let v = vec![(0, 0)];\nv[0].1 = 1;')), ['E0596@3 cannot borrow `v` as mutable, as it is not declared as mutable']);
  });

  it('behind a & reference the place is named as written, and a Vec parameter by its deref', () => {
    assert.deepEqual(msgs(`${P}fn f(v: &[P]) {\n    v[0].x = 1;\n}\n\n${main('f(&[P { x: 0 }]);')}`), ['E0594@6 cannot assign to `v[_].x`, which is behind a `&` reference']);
    assert.deepEqual(msgs(`${P}fn f(v: &Vec<P>) {\n    v[0].x = 1;\n}\n\n${main('f(&vec![P { x: 0 }]);')}`), ['E0596@6 cannot borrow `*v` as mutable, as it is behind a `&` reference']);
    assert.deepEqual(msgs(`${P}fn f(v: &[P; 1]) {\n    v[0].x = 1;\n}\n\n${main('f(&[P { x: 0 }]);')}`), ['E0594@6 cannot assign to `v[_].x`, which is behind a `&` reference']);
    const w = 'struct W {\n    ps: Vec<P>,\n    a: [P; 1],\n}\n\nimpl W {\n    fn f(&self) {\n        self.ps[0].x = 1;\n    }\n\n    fn g(&self) {\n        self.a[0].x = 1;\n    }\n}\n\n';
    assert.deepEqual(msgs(main('let w = W { ps: vec![P { x: 0 }], a: [P { x: 0 }] };\nw.f();\nw.g();', P + w)), [
      'E0596@12 cannot borrow `self.ps` as mutable, as it is behind a `&` reference',
      'E0594@16 cannot assign to `self.a[_].x`, which is behind a `&` reference',
    ]);
  });

  it('a Vec below an array index borrows the array element, and an array below a Vec index borrows the Vec', () => {
    assert.deepEqual(msgs(main('let a = [vec![0; 2], vec![1]];\na[0][1] = 1;')), ['E0596@3 cannot borrow `a[_]` as mutable, as `a` is not declared as mutable']);
    assert.deepEqual(msgs(main('let v = vec![[0; 2]];\nv[0][1] = 1;')), ['E0596@3 cannot borrow `v` as mutable, as it is not declared as mutable']);
    assert.deepEqual(msgs('fn f(a: &[Vec<i32>; 2]) {\n    a[0][1] = 1;\n}\n\nfn main() {\n    f(&[vec![0; 2], vec![1]]);\n}\n'), ['E0596@2 cannot borrow `a[_]` as mutable, as it is behind a `&` reference']);
    assert.deepEqual(msgs('fn f(a: &[Vec<i32>]) {\n    a[0][1] = 1;\n}\n\nfn main() {\n    f(&[vec![0; 2]]);\n}\n'), ['E0596@2 cannot borrow `a[_]` as mutable, as it is behind a `&` reference']);
    assert.deepEqual(msgs('fn f(a: &Vec<[i32; 2]>) {\n    a[0][1] = 1;\n}\n\nfn main() {\n    f(&vec![[0; 2]]);\n}\n'), ['E0596@2 cannot borrow `*a` as mutable, as it is behind a `&` reference']);
  });

  it('a loan on the whole array or Vec blocks the write: E0506 for an array, E0502 and E0499 when a Vec is in the way', () => {
    assert.deepEqual(msgs(main('let mut a = [P { x: 0 }];\nlet r = &a;\na[0].x = 1;\nprintln!("{}", r[0].x);', P)), ['E0506@8 cannot assign to `a[_].x` because it is borrowed']);
    assert.deepEqual(msgs(main('let mut v = vec![P { x: 0 }];\nlet r = &v;\nv[0].x = 1;\nprintln!("{}", r[0].x);', P)), ['E0502@8 cannot borrow `v` as mutable because it is also borrowed as immutable']);
    assert.deepEqual(msgs(main('let mut v = vec![P { x: 0 }];\nlet r = &mut v;\nv[0].x = 1;\nr[0].x = 2;', P)), ['E0499@8 cannot borrow `v` as mutable more than once at a time']);
    assert.deepEqual(msgs(main('let mut a = [vec![1], vec![2]];\nlet r = &a;\na[0][0] = 1;\nprintln!("{:?}", r);')), ['E0502@4 cannot borrow `a[_]` as mutable because it is also borrowed as immutable']);
    assert.deepEqual(msgs(main('let mut a = [vec![1], vec![2]];\nlet r = &mut a;\na[0][0] = 1;\nr[0][0] = 2;')), ['E0499@4 cannot borrow `a[_]` as mutable more than once at a time']);
    assert.deepEqual(msgs(main('let mut v = vec![vec![1]];\nlet r = &v[0];\nv[0][0] = 2;\nprintln!("{:?}", r);')), ['E0502@4 cannot borrow `v` as mutable because it is also borrowed as immutable']);
  });
});

describe('what a write below an index still leaves unsupported', () => {
  const OPEN = [
    ['a write through a & reference', 'fn f(r: &i32) {\n    *r = 1;\n}\n\nfn main() {\n    f(&1);\n}\n', 'assignment target'],
    ['a field of a reference held in a Vec', main('let mut p = P { x: 1 };\nlet mut v = vec![&mut p];\nv[0].x = 2;', P), 'reference in collection'],
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
