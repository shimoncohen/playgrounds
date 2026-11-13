import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// Every column below was printed by the pinned rustc (1.99.1, edition 2024).
const RQ = loadRust();
const main = (body, pre = '') => `${pre}fn main() {\n    ${body.split('\n').join('\n    ')}\n}\n`;
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', `${src} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`); return c.stdout; };
const at = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', `${src} ${JSON.stringify(c.unsupported)}`); const e = c.errors[0]; return `${e.code}@${e.line}:${e.col}`; };
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src); return c.unsupported.feature; };

describe('a borrow of an array element or a row', () => {
  it('a method call on a row changes that row only', () => {
    assert.equal(out(main('let mut g = [[3, 1], [2, 0]];\ng[0].sort();\nlet i = 1;\ng[i].swap(0, 1);\nprintln!("{:?}", g);')), '[[1, 3], [0, 2]]\n');
    assert.equal(out(main('let mut v = vec![[3, 1], [2, 0]];\nv[1].sort();\nlet mut w = vec![vec![3, 1], vec![2, 0]];\nw[0].sort();\nw[1].push(5);\nprintln!("{:?} {:?}", v, w);')), '[[3, 1], [0, 2]] [[1, 3], [2, 0, 5]]\n');
    assert.equal(out(main('let g = [[3, 1], [2, 0]];\nlet s: i32 = g[1].iter().sum();\nprintln!("{} {} {:?}", g[0].len(), s, g[0].first());')), '2 2 Some(3)\n');
  });

  it('a reference to a row sees later writes through it, and a loop over a row works', () => {
    assert.equal(out(main('let mut g = [[1, 2], [3, 4]];\nlet r = &mut g[1];\nr[0] = 9;\nlet s = &g[0];\nprintln!("{:?} {:?}", s, g);')), '[1, 2] [[1, 2], [9, 4]]\n');
    assert.equal(out(main('let mut g = [[1, 2], [3, 4]];\nfor x in &mut g[1] {\n    *x += 1;\n}\nlet mut t = 0;\nfor x in &g[1] {\n    t += x;\n}\nprintln!("{}", t);')), '9\n');
    assert.equal(out(main('let mut t = [1, 2];\nlet r = &mut t[0];\n*r = 5;\nprintln!("{:?}", t);')), '[5, 2]\n');
  });

  it('a row of an array inside a struct, and a row reached through a &mut parameter', () => {
    assert.equal(out(main('let mut b = B { cells: [[1, 2], [3, 4]] };\nb.cells[0].swap(0, 1);\nlet r = &b.cells[1];\nprintln!("{:?} {:?}", r, b.cells);', 'struct B {\n    cells: [[u8; 2]; 2],\n}\n\n')), '[3, 4] [[2, 1], [3, 4]]\n');
    assert.equal(out(main('let mut g = [[2, 1], [4, 3]];\nf(&mut g);\nprintln!("{:?}", g);', 'fn f(g: &mut [[i32; 2]; 2]) {\n    g[0].sort();\n    g[1].reverse();\n}\n\n')), '[[1, 2], [3, 4]]\n');
  });

  it('an index past the end panics at the index', () => {
    const c = RQ.run('fn pick(g: &mut [[i32; 2]; 2], i: usize) {\n    g[i].sort();\n}\n\nfn main() {\n    let mut g = [[1, 2], [3, 4]];\n    pick(&mut g, 5);\n}\n');
    assert.equal(c.status, 'panic');
    assert.equal(`${c.panic.line}:${c.panic.col} ${c.panic.msg}`, '2:5 index out of bounds: the len is 2 but the index is 5');
  });

  it('every row is g[_] to rustc, so two borrows overlap, and a write to any element conflicts with a borrow', () => {
    assert.equal(at(main('let mut g = [[1, 2], [3, 4]];\nlet a = &mut g[0];\nlet b = &mut g[1];\na[0] = 1;\nb[0] = 1;')), 'E0499@4:13');
    assert.equal(at(main('let mut g = [[1, 2], [3, 4]];\nlet r = &g[0];\ng[1][0] = 9;\nprintln!("{:?}", r);')), 'E0506@4:5');
    assert.equal(at(main('let mut g = [[1, 2], [3, 4]];\nlet r = &g[0];\ng[0].sort();\nprintln!("{:?}", r);')), 'E0502@4:5');
  });

  it('what is not judged stays unsupported: a borrow that is kept beside a use of the array', () => {
    assert.equal(feature(main('let mut g = [[1, 2], [3, 4]];\nlet r = &mut g[0];\nlet n = g[1].len();\nr.sort();\nprintln!("{}", n);')), 'use while borrowed');
  });
});

describe('E0596 on a borrow of an element or a range starts where rustc puts it', () => {
  it('an overloaded index (a range, or a Vec) points at the indexed value, an array element at the whole borrow', () => {
    assert.equal(at(main('let a = [3, 1, 2];\nlet r = &mut a[..];\nr.sort();')), 'E0596@3:18');
    assert.equal(at(main('let a = [3, 1, 2];\nlet r = &mut a[1..];\nr.sort();')), 'E0596@3:18');
    assert.equal(at(main('let v = vec![3, 1, 2];\nlet r = &mut v[..];\nr.sort();')), 'E0596@3:18');
    assert.equal(at(main('let v = vec![3, 1, 2];\nlet r = &mut v[1];\n*r = 5;')), 'E0596@3:18');
    assert.equal(at(main('let a = [3, 1, 2];\nlet r = &mut a[1];\n*r = 5;')), 'E0596@3:13');
    assert.equal(at(main('let a = [3, 1, 2];\nlet r = &mut a;\nr.sort();')), 'E0596@3:13');
    assert.equal(at(main('let a = [[3, 1], [2, 0]];\nlet r = &mut a[0][..];\nr.sort();')), 'E0596@3:18');
  });

  it('a method on the place and an argument point at the place itself', () => {
    assert.equal(at(main('let a = [3, 1, 2];\na[1..].sort();')), 'E0596@3:5');
    assert.equal(at(main('let a = [[3, 1], [2, 0]];\na[0].sort();')), 'E0596@3:5');
    assert.equal(at(main('let v = vec![3, 1, 2];\nz(&mut v[1..]);', 'fn z(x: &mut [i32]) {\n    x.sort();\n}\n\n')), 'E0596@7:12');
    assert.equal(at(main('let a = [3, 1, 2];\nz(&mut a);', 'fn z(x: &mut [i32]) {\n    x.sort();\n}\n\n')), 'E0596@7:7');
  });

  it('behind a shared reference the same rule holds', () => {
    assert.equal(at('fn f(x: &[i32]) {\n    let r = &mut x[..];\n    r.sort();\n}\n\nfn main() {\n    f(&[1]);\n}\n'), 'E0596@2:18');
    assert.equal(at('fn f(x: &[i32; 2]) {\n    let r = &mut x[0];\n    *r = 1;\n}\n\nfn main() {\n    f(&[1, 2]);\n}\n'), 'E0596@2:13');
    assert.equal(at('fn f(x: &[[i32; 2]; 2]) {\n    x[0].sort();\n}\n\nfn main() {\n    f(&[[1, 2], [3, 4]]);\n}\n'), 'E0596@2:5');
  });

  it('a conflict names the indexed value too: the second borrow of a Vec or an array range', () => {
    assert.equal(at(main('let mut v = vec![3, 1, 2];\nlet r = &mut v[..];\nlet s = &mut v[..];\nr.sort();\ns.sort();')), 'E0499@4:18');
    assert.equal(at(main('let mut a = [3, 1, 2];\nlet r = &mut a[1..];\nlet s = &a[..];\nr.sort();\nprintln!("{:?}", s);')), 'E0502@4:14');
    assert.equal(at(main('let mut v = vec![3, 1, 2];\nlet r = &v[1..];\nlet s = &mut v[..];\ns.sort();\nprintln!("{:?}", r);')), 'E0502@4:18');
  });
});
