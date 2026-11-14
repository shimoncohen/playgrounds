import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const main = (body, items = '') => `${items}fn main() {\n${body}\n}\n`;
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', `${src} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`); return c.stdout; };
const err = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', `${src} ${JSON.stringify(c.unsupported)}`); const e = c.errors; assert.equal(e.length, 1, JSON.stringify(e)); return `${e[0].line}:${e[0].col} ${e[0].code}`; };
const status = (src) => RQ.run(src).status;

describe('a reference argument to partial_cmp', () => {
  const body = (decl, call) => main(`${decl}\n    println!("{:?}", ${call});`);
  it('coerces for a concrete receiver, and an open number is not judged', () => {
    const typed = '    let a: i32 = 5;\n    let b: i32 = 6;\n    let rb = &b;';
    assert.equal(out(body(typed, 'a.partial_cmp(&&b)')), 'Some(Less)\n');
    assert.equal(out(body(typed, 'a.partial_cmp(&rb)')), 'Some(Less)\n');
    for (const decl of ['    let a = 5;\n    let b = 6;\n    let rb = &b;', '    let a = 5.0;\n    let b = 6.0;\n    let rb = &b;']) {
      assert.equal(status(body(decl, 'a.partial_cmp(&&b)')), 'unsupported');
      assert.equal(status(body(decl, 'a.partial_cmp(&rb)')), 'unsupported');
    }
  });
  it('cmp on an open integer still takes the reference; on an open decimal it is E0689', () => {
    assert.equal(out(body('    let a = 5;\n    let b = 6;\n    let rb = &b;', 'a.cmp(&rb)')), 'Less\n');
    assert.equal(err(body('    let a = 5.0;\n    let b = 6.0;', 'a.cmp(&b)')), '4:24 E0689');
  });
});

describe('a name repeated in one use list', () => {
  it('is E0252 at the repeat', () => {
    assert.equal(err('use std::cmp::{Ordering, Ordering};\nfn main() {}\n'), '1:26 E0252');
    assert.equal(err('use std::cmp::{Reverse, Reverse};\nfn main() {}\n'), '1:25 E0252');
    assert.equal(err('use std::fmt::{Display, Display};\nfn main() {}\n'), '1:25 E0252');
    assert.equal(RQ.run('use std::cmp::{Ordering, Reverse};\nfn main() {}\n').status, 'ok');
  });
});

describe('a captured name after an escape', () => {
  it('is at the name in the source, not in the value', () => {
    const lit = (s) => err(main(`    println!("${s}");`));
    assert.equal(lit('a\\n {y}'), '2:20 E0425');
    assert.equal(lit('a\\t{y}'), '2:19 E0425');
    assert.equal(lit('a\\\\{y}'), '2:19 E0425');
    assert.equal(lit('a\\"{y}'), '2:19 E0425');
    assert.equal(lit('a\\u{41}{y}'), '2:23 E0425');
    assert.equal(err(main('    let p = P;\n    println!("a\\n {p}");', 'struct P;\n')), '4:19 E0277');
  });
});

describe('max and min on a type that derives Ord', () => {
  const R = '#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]\nstruct R(i32);\n';
  it('give the larger, and the smaller, as rustc does', () => {
    assert.equal(out(main('    println!("{:?} {:?}", R(1).max(R(2)), R(1).min(R(2)));', R)), 'R(2) R(1)\n');
    assert.equal(out(main('    println!("{:?} {:?}", Reverse(1).max(Reverse(2)), Reverse(1).min(Reverse(2)));', 'use std::cmp::Reverse;\n')), 'Reverse(1) Reverse(2)\n');
    assert.equal(out(main('    println!("{:?}", Some(3).max(None));')), 'Some(3)\n');
  });
  it('without Ord it is still E0599, and clamp is not judged', () => {
    assert.equal(err(main('    println!("{:?}", R(1).max(R(2)));', '#[derive(Debug, PartialEq, PartialOrd)]\nstruct R(i32);\n')), '4:27 E0599');
    assert.equal(status(main('    println!("{:?}", R(1).clamp(R(0), R(3)));', R)), 'unsupported');
  });
});

describe('a binding named like a tuple struct', () => {
  const R = 'struct R(i32);\n';
  it('is E0530 for a let, a parameter, a closure parameter, a for loop and Some', () => {
    assert.equal(err(main('    let R = 5;\n    println!("{}", R);', R)), '3:9 E0530');
    assert.equal(err(main('    let mut R = 5;\n    R += 1;', R)), '3:13 E0530');
    assert.equal(err(main('    println!("{}", f(1));', R + 'fn f(R: i32) -> i32 {\n    R\n}\n')), '2:6 E0530');
    assert.equal(err(main('    let f = |R: i32| R;\n    println!("{}", f(1));', R)), '3:14 E0530');
    assert.equal(err(main('    for R in vec![1] {\n        println!("{}", R);\n    }', R)), '3:9 E0530');
    assert.equal(err(main('    let Some = 5;\n    println!("{}", Some);')), '2:9 E0530');
    assert.equal(err(main('    let Reverse = 5;\n    println!("{}", Reverse);', 'use std::cmp::Reverse;\n')), '3:9 E0530');
  });
  it('a braced struct or an enum name is an ordinary name, and a unit struct or a const is not judged', () => {
    assert.equal(out(main('    let R = 5;\n    println!("{}", R);', 'struct R {\n    a: i32,\n}\n')), '5\n');
    assert.equal(status(main('    let U = 5;\n    println!("{}", U);', 'struct U;\n')), 'unsupported');
    assert.equal(status(main('    let N = 5;\n    println!("{}", N);', 'const N: i32 = 1;\n')), 'unsupported');
  });
});
