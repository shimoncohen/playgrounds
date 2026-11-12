import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// Programs with one verdict each are corpus entries (arr-*, vec-set-*); this file covers what a corpus entry cannot: messages, events, unsupported.
const RQ = loadRust();
const main = (body, pre = '') => `${pre}fn main() {\n    ${body.split('\n').join('\n    ')}\n}\n`;
const msgs = (src) => Array.from(RQ.run(src).errors, (e) => `${e.code || e.lint}@${e.line} ${e.msg}`);

describe('writing an array element', () => {
  it('names the element as rustc does: a[_] per index, on a name, a nested array, a field and self', () => {
    assert.deepEqual(msgs(main('let a = [0; 3];\na[0] = 1;')), ['E0594@3 cannot assign to `a[_]`, as `a` is not declared as mutable']);
    assert.deepEqual(msgs(main('let g = [[0; 2]; 2];\ng[0][1] = 1;')), ['E0594@3 cannot assign to `g[_][_]`, as `g` is not declared as mutable']);
    assert.deepEqual(msgs(main('let s = S { a: [0; 3] };\ns.a[0] = 1;', 'struct S {\n    a: [i32; 3],\n}\n\n')), ['E0594@7 cannot assign to `s.a[_]`, as `s` is not declared as mutable']);
    assert.deepEqual(msgs(`fn set(a: &[i32; 3]) {\n    a[0] = 5;\n}\n\n${main('let a = [1, 2, 3];\nset(&a);')}`), ['E0594@2 cannot assign to `a[_]`, which is behind a `&` reference']);
    assert.deepEqual(msgs('struct B {\n    c: [i32; 2],\n}\n\nimpl B {\n    fn set(&self) {\n        self.c[0] = 1;\n    }\n}\n\nfn main() {\n    let b = B { c: [0; 2] };\n    b.set();\n}\n'), ['E0594@7 cannot assign to `self.c[_]`, which is behind a `&` reference']);
  });

  it('a Vec behind a & reference is borrowed mutably by IndexMut: E0596 names the Vec', () => {
    assert.deepEqual(msgs(`fn set(v: &Vec<i32>) {\n    v[0] = 1;\n}\n\n${main('let v = vec![0; 3];\nset(&v);')}`), ['E0596@2 cannot borrow `*v` as mutable, as it is behind a `&` reference']);
    assert.deepEqual(msgs(`struct S {\n    v: Vec<i32>,\n}\n\nfn set(s: &S) {\n    s.v[0] = 1;\n}\n\n${main('let s = S { v: vec![0; 3] };\nset(&s);')}`), ['E0596@6 cannot borrow `s.v` as mutable, as it is behind a `&` reference']);
  });

  it('E0594 and the loan error both come out when a write to a borrowed, non-mut array breaks two rules', () => {
    assert.deepEqual(msgs(main('let a = [1, 2, 3];\nlet r = &a;\na[0] = 4;\nprintln!("{:?}", r);')), [
      'E0594@4 cannot assign to `a[_]`, as `a` is not declared as mutable',
      'E0506@4 cannot assign to `a[_]` because it is borrowed',
    ]);
  });

  it('a loan error on a write names the element, a write after a move is a use of the moved array', () => {
    assert.deepEqual(msgs(main('let mut a = [1, 2, 3];\nfor x in &a {\na[0] = *x;\n}')), ['E0506@4 cannot assign to `a[_]` because it is borrowed']);
    assert.deepEqual(msgs(main('let mut a = [String::from("a")];\nlet b = a;\na[0] = String::new();\nprintln!("{:?}", b);')), ['E0382@4 use of moved value: `a`']);
  });

  it('an overwritten element is dropped at once, the other elements with the array', () => {
    const c = RQ.run(main('let mut a = [N(1), N(2)];\na[0] = N(3);\nprintln!("set");', 'struct N(i32);\n\nimpl Drop for N {\n    fn drop(&mut self) {\n        println!("drop {}", self.0);\n    }\n}\n\n'));
    assert.equal(c.stdout, 'drop 1\nset\ndrop 3\ndrop 2\n');
    assert.deepEqual(Array.from(c.events.filter((e) => e.t === 'drop'), (e) => e.name), ['a[0]', 'a', 'a[0]', 'a[1]']);
  });

  it('an index past the end is a panic with the length and the index, at the write', () => {
    const c = RQ.run(main('let mut a = [1, 2, 3];\nlet mut i = 0;\nwhile i < 4 {\na[i] = 0;\ni += 1;\n}'));
    assert.equal(c.status, 'panic');
    assert.equal(c.exit, 101);
    assert.equal(c.panic.msg, 'index out of bounds: the len is 3 but the index is 3');
    assert.deepEqual([c.panic.line, c.panic.col], [5, 5]);
  });

  it('a write to a binding that was never set is E0381 alone, whether or not it is mut', () => {
    assert.deepEqual(msgs(main('let a: [i32; 3];\na[0] = 1;')), ['E0381@3 used binding `a` isn\'t initialized']);
    assert.deepEqual(msgs(main('let mut a: [i32; 3];\na[0] = 1;')), ['E0381@3 used binding `a` isn\'t initialized']);
    assert.deepEqual(msgs(main('let v: Vec<i32>;\nv[0] = 1;')), ['E0381@3 used binding `v` isn\'t initialized']);
    assert.deepEqual(msgs(main('let a: [i32; 3];\na = [0; 3];\na[0] = 1;')), ['E0594@4 cannot assign to `a[_]`, as `a` is not declared as mutable']);
  });

  it('a move closure owns a copy of a Copy array, a struct or a tuple that holds one', () => {
    const c = RQ.run(main('let mut a = [1, 2];\nlet mut f = move || {\na[0] += 10;\na[0]\n};\nprintln!("{}", f());\na[1] = 7;\nprintln!("{} {:?}", f(), a);'));
    assert.equal(c.stdout, '11\n21 [1, 7]\n');
  });

  it('two arrays never share their elements: a copy, a by-value argument and a repeated row are all apart', () => {
    const c = RQ.run(main('let a = [[1, 2], [3, 4]];\nlet mut b = a;\nb[0][1] = 9;\nlet mut r = [[0; 2]; 2];\nr[1][0] = 5;\nprintln!("{:?} {:?} {:?}", a, b, r);'));
    assert.equal(c.stdout, '[[1, 2], [3, 4]] [[1, 9], [3, 4]] [[0, 0], [5, 0]]\n');
  });
});

describe('what a write to an element still leaves unsupported', () => {
  const OPEN = [
    ['a write into an array inside a Vec', main('let mut v = vec![[0; 2]; 2];\nv[0][1] = 3;'), 'assignment target'],
    ['a compound write while a loop lends the array mutably (E0503)', main('let mut a = [0; 3];\nfor x in &mut a {\na[1] += *x;\n}'), 'use while borrowed'],
    ['an element of an array of structs', main('let mut a = [P { x: 0 }; 2];\na[0].x = 1;', '#[derive(Clone, Copy)]\nstruct P {\n    x: i32,\n}\n\n'), 'assignment target'],
    ['a slice of a slice parameter', `fn f(a: &mut [i32]) {\n    a[0] = 1;\n}\n\n${main('let mut a = [1, 2, 3];\nf(&mut a[..]);')}`, 'reference'],
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
