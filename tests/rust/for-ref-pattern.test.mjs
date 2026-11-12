import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// Programs with one verdict each are corpus entries (forref-*); this file covers what a corpus entry cannot: messages, events, unsupported.
const RQ = loadRust();
const main = (body) => `fn main() {\n    ${body.split('\n').join('\n    ')}\n}\n`;
const msgs = (src) => Array.from(RQ.run(src).errors, (e) => `${e.code || e.lint}@${e.line} ${e.msg}`);

describe('an & pattern in a for loop', () => {
  it('copies Copy elements out of the reference, so the collection is still whole afterwards', () => {
    const c = RQ.run(main('let v = vec![1, 2, 3];\nlet mut s = 0;\nfor &x in &v {\ns += x;\n}\nprintln!("{} {:?}", s, v);'));
    assert.equal(c.status, 'ok');
    assert.equal(c.stdout, '6 [1, 2, 3]\n');
  });

  it('moving a non-Copy name out is E0507, worded for the kind of reference', () => {
    assert.deepEqual(msgs(main('let a = [String::new()];\nfor &s in &a {\nprintln!("{}", s);\n}')), ['E0507@3 cannot move out of a shared reference']);
    assert.deepEqual(msgs(main('let mut a = [String::new()];\nfor &mut s in &mut a {\nprintln!("{}", s);\n}')), ['E0507@3 cannot move out of a mutable reference']);
    assert.deepEqual(msgs(main('let a = [(1, String::new())];\nfor &(n, s) in &a {\nprintln!("{} {}", n, s);\n}')), ['E0507@3 cannot move out of a shared reference']);
  });

  it('one E0507 per loop, however many names move', () => {
    assert.equal(msgs(main('let a = [(String::new(), String::new())];\nfor &(p, q) in &a {\nprintln!("{} {}", p, q);\n}')).length, 1);
  });

  it('an item that is not the kind of reference the pattern names is E0308, and the names stay bound', () => {
    assert.deepEqual(msgs(main('let a = [1, 2];\nfor &x in a {\nprintln!("{}", x);\n}')), ['E0308@3 mismatched types: expected integer, found `&_`']);
    assert.deepEqual(msgs(main('let a = [1, 2];\nfor &mut x in &a {\nprintln!("{}", x);\n}')), ['E0308@3 mismatched types: expected `&{integer}`, found `&mut _`']);
    assert.deepEqual(msgs(main('let mut a = [1, 2];\nfor &x in &mut a {\nprintln!("{}", x);\n}')), ['E0308@3 mismatched types: expected `&mut {integer}`, found `&_`']);
    assert.deepEqual(msgs(main('let a = [1, 2];\nfor &(x, y) in a.iter() {\nprintln!("{}", x);\n}')), ['E0308@3 mismatched types: expected integer, found `(_, _)`']);
  });

  it('a refutable pattern behind & is E0005', () => {
    assert.deepEqual(Array.from(RQ.run(main('let a = [Some(1), None];\nfor &Some(x) in &a {\nprintln!("{}", x);\n}')).errors, (e) => e.code), ['E0005']);
  });

  it('the hidden names never reach the memory view or the events', () => {
    const c = RQ.run(main('let a = [(1, 2)];\nfor (i, &(x, y)) in a.iter().enumerate() {\nprintln!("{} {} {}", i, x, y);\n}'));
    assert.equal(c.stdout, '0 1 2\n');
    assert.ok(!JSON.stringify(c.events).includes('#'), JSON.stringify(c.events));
  });
});

describe('a temporary lent to a call or a for loop', () => {
  it('drops at the end of its statement, the later one first, and after a break', () => {
    const drop = 'struct N(i32);\n\nimpl Drop for N {\n    fn drop(&mut self) {\n        println!("drop {}", self.0);\n    }\n}\n\nfn f(a: &N) -> i32 {\n    a.0\n}\n\n';
    assert.equal(RQ.run(`${drop}${main('let y = f(&N(2)) + f(&N(3));\nprintln!("after {}", y);')}`).stdout, 'drop 3\ndrop 2\nafter 5\n');
    assert.equal(RQ.run(`${drop}${main('for &N(x) in &vec![N(7), N(8)] {\nprintln!("{}", x);\nbreak;\n}\nprintln!("end");')}`).stdout, '7\ndrop 7\ndrop 8\nend\n');
  });

  it('a result that may keep the borrow, or a loop name that stays a reference, is still unsupported', () => {
    for (const src of ['fn first(a: &[i32]) -> &[i32] {\n    a\n}\n\n' + main('let r = first(&vec![1, 2]);\nprintln!("{:?}", r);'), main('for x in &[1, 2, 3] {\nprintln!("{}", x);\n}')]) {
      const c = RQ.run(src);
      assert.equal(c.status, 'unsupported');
      assert.equal(c.unsupported.feature, 'temporary borrow');
    }
  });
});

describe('what a pattern behind & still leaves unsupported', () => {
  for (const [what, body] of [
    ['a slice pattern', 'let a = [[1, 2]];\nfor &[x, y] in &a {\nprintln!("{} {}", x, y);\n}'],
    ['a ref binding', 'let a = [(1, String::new())];\nfor &(n, ref s) in &a {\nprintln!("{} {}", n, s);\n}'],
    ['an & inside a struct pattern', 'let a = [P { r: &1 }];\nfor P { r: &x } in &a {\nprintln!("{}", x);\n}'],
  ]) {
    it(what, () => {
      const c = RQ.run(main(body).replace('fn main', 'struct P<\'a> {\n    r: &\'a i32,\n}\n\nfn main'));
      assert.equal(c.status, 'unsupported');
      assert.ok(RQ.diag.hint(c.unsupported.feature).length > 30, c.unsupported.feature);
    });
  }
});
