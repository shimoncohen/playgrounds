import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// Programs with one verdict each are corpus entries (temp-*); this file covers messages, lines, drop order and what stays unsupported.
// Every expected text was printed by the pinned rustc (1.99.1, edition 2024).
const RQ = loadRust();
const main = (body, pre = '') => `${pre}fn main() {\n    ${body.split('\n').join('\n    ')}\n}\n`;
const msgs = (src) => Array.from(RQ.run(src).errors, (e) => `${e.code || e.lint}@${e.line} ${e.msg}`);
const ID = 'fn id(s: &String) -> &String {\n    s\n}\n\n';
const NOTE = 'temporary value dropped while borrowed';

describe('a temporary dies with its statement', () => {
  it('a borrow of it that is used afterwards is E0716, at the temporary', () => {
    assert.deepEqual(msgs(main('let s = String::from("a").as_str();\nprintln!("{}", s);')), [`E0716@2 ${NOTE}`]);
    assert.deepEqual(msgs(ID + main('let s = id(&String::from("a"));\nprintln!("{}", s);')), [`E0716@6 ${NOTE}`]);
    assert.deepEqual(msgs(main('let mut r = &String::from("z");\nr = &String::from("a");\nprintln!("{}", r);')), [`E0716@3 ${NOTE}`]);
    assert.deepEqual(msgs('struct P {\n    name: String,\n}\n\nimpl P {\n    fn name(&self) -> &str {\n        &self.name\n    }\n}\n\nfn mk() -> P {\n    P { name: String::new() }\n}\n\n' + main('let n = mk().name();\nprintln!("{}", n);')), [`E0716@16 ${NOTE}`]);
  });

  it('the line is the temporary, also when the statement runs over several lines or the temporary comes from a macro', () => {
    assert.deepEqual(msgs(main('let s = String::from("a")\n    .as_str();\nprintln!("{}", s);')), [`E0716@2 ${NOTE}`]);
    assert.deepEqual(msgs(ID + main('let s = id(\n    &String::from("a"),\n);\nprintln!("{}", s);')), [`E0716@7 ${NOTE}`]);
    assert.deepEqual(msgs(main('let x = vec![1, 2, 3].first();\nprintln!("{:?}", x);')), [`E0716@2 ${NOTE}`]);
    assert.deepEqual(msgs(main('let mut r = "";\nfor i in 0..2 {\nr = format!("{}", i).as_str();\n}\nprintln!("{}", r);')), [`E0716@4 ${NOTE}`]);
  });

  it('a borrow that is not used afterwards, or a result that keeps none, is fine', () => {
    assert.equal(RQ.run(ID + main('let s = id(&String::from("a"));')).status, 'ok');
    assert.equal(RQ.run(ID + main('let n = id(&String::from("ab")).len();\nprintln!("{}", n);')).stdout, '2\n');
    assert.equal(RQ.run(main('let x = *vec![1, 2, 3].first().unwrap();\nprintln!("{}", x);')).stdout, '1\n');
  });

  it('a borrow of a constant is promoted to a static, so only one that holds a variable is E0716', () => {
    const id = 'fn id(s: &[i32; 2]) -> &[i32; 2] {\n    s\n}\n\n';
    assert.equal(RQ.run(id + main('let s = id(&[1, 2]);\nprintln!("{:?}", s);')).stdout, '[1, 2]\n');
    assert.deepEqual(msgs(id + main('let n = 1;\nlet s = id(&[n, 2]);\nprintln!("{:?}", s);')), [`E0716@7 ${NOTE}`]);
    assert.deepEqual(msgs('fn id(s: &Vec<i32>) -> &Vec<i32> {\n    s\n}\n\n' + main('let s = id(&Vec::new());\nprintln!("{:?}", s);')), [`E0716@6 ${NOTE}`]);
  });

  it('a type with Drop is never promoted, one without it is, even beside one that has it', () => {
    const drop = 'struct N(i32);\n\nimpl Drop for N {\n    fn drop(&mut self) {\n        println!("drop {}", self.0);\n    }\n}\n\n';
    assert.deepEqual(msgs(drop + 'fn id(s: &N) -> &N {\n    s\n}\n\n' + main('let r = id(&N(1));\nprintln!("{}", r.0);')), [`E0716@14 ${NOTE}`]);
    assert.equal(RQ.run(drop + 'struct P {\n    x: i32,\n}\n\nfn id(s: &P) -> &P {\n    s\n}\n\n' + main('let r = id(&P { x: 1 });\nprintln!("{}", r.x);')).stdout, '1\n');
  });

  it('let keeps the temporary until the end of the block and drops it after the names declared later', () => {
    const drop = 'struct N(i32);\n\nimpl Drop for N {\n    fn drop(&mut self) {\n        println!("drop {}", self.0);\n    }\n}\n\n';
    assert.equal(RQ.run(drop + main('let r = &N(1);\nprintln!("a {}", r.0);\nlet q = &N(2);\nprintln!("b {}", q.0);')).stdout, 'a 1\nb 2\ndrop 2\ndrop 1\n');
    assert.equal(RQ.run(drop + main('for i in 0..2 {\nlet r = &N(i);\nprintln!("in {}", r.0);\n}\nprintln!("end");')).stdout, 'in 0\ndrop 0\nin 1\ndrop 1\nend\n');
    assert.equal(RQ.run(drop + 'fn show(n: &N) -> i32 {\n    n.0\n}\n\n' + main('let v = show(&N(1));\nprintln!("x {}", v);')).stdout, 'drop 1\nx 1\n');
  });
});

describe('a for loop over a temporary', () => {
  it('lends it to the loop: the name is a reference, and a name kept past the loop is E0716 unless the array is constant', () => {
    assert.equal(RQ.run(main('let mut t = 0;\nfor x in &[1, 2, 3] {\nt += x;\n}\nprintln!("{}", t);')).stdout, '6\n');
    assert.equal(RQ.run(main('let mut best = &0;\nfor x in [1, 5, 3].iter() {\nif x > best {\nbest = x;\n}\n}\nprintln!("{}", best);')).stdout, '5\n');
    assert.deepEqual(msgs(main('let n = 1;\nlet mut last = &0;\nfor x in &[n, 2, 3] {\nlast = x;\n}\nprintln!("{}", last);')), [`E0716@4 ${NOTE}`]);
    assert.deepEqual(msgs(main('let mut last = &0;\nfor x in &vec![1, 2, 3] {\nlast = x;\n}\nprintln!("{}", last);')), [`E0716@3 ${NOTE}`]);
    assert.deepEqual(msgs('fn mk() -> Vec<i32> {\n    vec![1, 2]\n}\n\n' + main('let mut last = &0;\nfor x in &mk() {\nlast = x;\n}\nprintln!("{}", last);')), [`E0716@7 ${NOTE}`]);
  });

  it('a name that is a reference is not a number', () => {
    assert.deepEqual(msgs(main('for x in &[1, 2, 3] {\nlet y: i32 = x;\n}')).map((m) => m.split(' ')[0]), ['E0308@3']);
  });
});

describe('what a borrow of a temporary still leaves unsupported', () => {
  const OPEN = [
    ['inside a tuple', main('let t = (&String::from("a"), 1);\nprintln!("{}", t.1);')],
    ['inside Some', main('let o = Some(&String::from("a"));\nprintln!("{:?}", o);')],
    ['a constant that rustc may or may not promote', 'fn id(s: &i32) -> &i32 {\n    s\n}\n\n' + main('let r = id(&(4 / 2));\nprintln!("{}", r);')],
    ['a &mut loop name kept past the loop', main('let mut last = &mut 0;\nfor x in &mut [1, 2, 3] {\nlast = x;\n}\n*last += 1;')],
  ];
  for (const [what, src] of OPEN) {
    it(what, () => {
      const c = RQ.run(src);
      assert.equal(c.status, 'unsupported');
      assert.ok(['temporary borrow', 'reborrow'].includes(c.unsupported.feature), c.unsupported.feature);
      assert.ok(RQ.diag.hint(c.unsupported.feature).length > 30);
    });
  }
});
