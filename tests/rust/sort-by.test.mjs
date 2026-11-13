import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const main = (body, pre = '') => `${pre}fn main() {\n    ${body.split('\n').join('\n    ')}\n}\n`;
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', `${src} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`); return c.stdout; };
const msgs = (src) => Array.from(RQ.run(src).errors, (e) => `${e.code || e.lint}@${e.line}:${e.col}`);
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src); return c.unsupported.feature; };

describe('sort_by, sort_by_key and the unstable twins', () => {
  it('sort an array, a slice, a Vec and a window with the order the closure gives', () => {
    assert.equal(out(main('let mut a = [3, 1, 2];\na.sort_by(|x, y| y.cmp(x));\nprintln!("{:?}", a);\na.sort_unstable_by(|x, y| x.cmp(y));\nprintln!("{:?}", a);')), '[3, 2, 1]\n[1, 2, 3]\n');
    assert.equal(out(main('let mut v = vec![(2, \'b\'), (1, \'z\'), (2, \'a\')];\nv.sort_by_key(|p| p.0);\nprintln!("{:?}", v);\nv.sort_unstable_by_key(|p| p.1);\nprintln!("{:?}", v);')), "[(1, 'z'), (2, 'b'), (2, 'a')]\n[(2, 'a'), (2, 'b'), (1, 'z')]\n");
    assert.equal(out('fn s(x: &mut [i32]) {\n    x.sort_by(|a, b| b.cmp(a));\n}\n\n' + main('let mut v = vec![3, 1, 2, 0];\ns(&mut v[1..3]);\nprintln!("{:?}", v);')), '[3, 2, 1, 0]\n');
    assert.equal(out(main('let mut a = [4, 3, 2, 1];\na[..3].sort_by_key(|x| *x);\nprintln!("{:?}", a);')), '[2, 3, 4, 1]\n');
  });

  it('keep the order of elements that compare equal', () => {
    assert.equal(out(main('let mut v = vec![(1, 5), (0, 4), (1, 3), (0, 2)];\nv.sort_by(|a, b| a.0.cmp(&b.0));\nprintln!("{:?}", v);\nv.sort_by_key(|p| p.1 > 2);\nprintln!("{:?}", v);')), '[(0, 4), (0, 2), (1, 5), (1, 3)]\n[(0, 2), (0, 4), (1, 5), (1, 3)]\n');
  });

  it('read the closure parameter through a reference: a struct field, a tuple field, filter and map', () => {
    const pre = 'struct P {\n    name: String,\n    hp: i32,\n}\n\n';
    assert.equal(out(main('let mut v = vec![P { name: String::from("a"), hp: 3 }, P { name: String::from("b"), hp: 1 }];\nv.sort_by_key(|p| p.hp);\nlet n = v.iter().filter(|p| p.hp > 2).count();\nprintln!("{} {}", v[0].name, n);', pre)), 'b 1\n');
    assert.equal(out(main('let v = vec![(1, 2), (3, 4)];\nlet n = v.iter().filter(|p| p.0 > 1).count();\nlet s: i32 = v.iter().map(|p| p.0 + p.1).sum();\nprintln!("{} {}", n, s);')), '1 10\n');
    assert.deepEqual(msgs(main('let v = vec![(String::from("a"), 1)];\nlet n: Vec<String> = v.iter().map(|p| p.0).collect();')), ['E0507@3:43']);
  });

  it('are the errors rustc gives for a wrong closure', () => {
    assert.deepEqual(msgs(main('let mut v = vec![1.5, 0.5];\nv.sort_by(|a, b| a.cmp(b));')), ['E0599@3:24']);
    assert.deepEqual(msgs(main('let mut v = vec![3, 1];\nv.sort_by(|a, b| a < b);')), ['E0308@3:22']);
    assert.deepEqual(msgs(main('let mut v = vec![3, 1];\nv.sort_by(|a| a);')).map((m) => m.split(':')[0]), ['E0593@3']);
    assert.deepEqual(msgs(main('let mut a = [(1.5, 1)];\na.sort_by_key(|p| p.0);')), ['E0277@3:7']);
    assert.deepEqual(msgs(main('let v = vec![3, 1];\nv.sort_by(|a, b| b.cmp(a));')), ['E0596@3:5']);
    assert.deepEqual(msgs(main('let mut v = vec![3, 1];\nlet r = &v;\nv.sort_by_key(|x| *x);\nprintln!("{:?}", r);')), ['E0502@4:5']);
  });

  it('are unsupported when the closure prints, mutates, or is not a total order', () => {
    assert.equal(feature(main('let mut v = vec![3, 1, 2];\nv.sort_by(|a, b| {\n    println!("{}", a);\n    a.cmp(b)\n});')), 'sort_by with side effects');
    assert.equal(feature(main('let mut v = vec![3, 1, 2];\nlet mut n = 0;\nv.sort_by(|a, b| {\n    n += 1;\n    a.cmp(b)\n});')), 'sort_by with side effects');
    assert.equal(feature(main('let mut v = vec![3, 1, 2];\nv.sort_by(|_, _| 1.cmp(&2));')), 'sort_by with an order that is not total');
  });

  it('give no verdict for the unstable sorts on 21 or more elements with equal keys that differ', () => {
    const big = '[' + Array.from({ length: 25 }, (_, i) => `(${i % 3}, ${i})`).join(', ') + ']';
    assert.equal(feature(main(`let mut v = vec!${big};\nv.sort_unstable_by_key(|p| p.0);`)), 'unstable sort of equal keys');
    const dup = '[' + Array.from({ length: 25 }, (_, i) => `(${i % 3}, 0)`).join(', ') + ']';
    assert.equal(out(main(`let mut v = vec!${dup};\nv.sort_unstable_by_key(|p| p.0);\nprintln!("{}", v[24].0);`)), '2\n');
    assert.equal(out(main(`let mut v = vec!${big};\nv.sort_by_key(|p| p.0);\nprintln!("{:?}", v[3]);`)), '(0, 9)\n');
  });
});

describe('the 20 and 21 element boundary of the unstable sorts', () => {
  const vecOf = (n, f) => '[' + Array.from({ length: n }, (_, i) => f(i)).join(', ') + ']';
  const run = (n, el, call) => main(`let mut v = vec!${vecOf(n, el)};\nv.${call};\nprintln!("{:?}", v[0]);`);
  it('exactly 20 elements keep the order of ties, 21 give no verdict when the tied elements differ', () => {
    assert.equal(out(run(20, (i) => `(${i % 3}, ${i})`, 'sort_unstable_by_key(|p| p.0)')), '(0, 0)\n');
    assert.equal(feature(run(21, (i) => `(${i % 3}, ${i})`, 'sort_unstable_by_key(|p| p.0)')), 'unstable sort of equal keys');
    assert.equal(out(run(21, (i) => `(${i % 3}, 0)`, 'sort_unstable_by_key(|p| p.0)')), '(0, 0)\n');
  });
  it('0.0 and -0.0 tie but print differently, so 21 floats with both give no verdict', () => {
    const fl = (i) => (i < 5 ? '0.0' : i < 10 ? '-0.0' : `${i}.0`);
    for (const cmp of ['sort_unstable_by(|a, b| a.partial_cmp(b).unwrap())', 'sort_unstable_by(|a, b| b.partial_cmp(a).unwrap())']) {
      assert.equal(feature(run(21, fl, cmp)), 'unstable sort of equal keys');
      assert.equal(RQ.run(run(20, fl, cmp)).status, 'ok');
    }
    assert.equal(out(run(21, fl, 'sort_unstable_by(|a, b| a.total_cmp(b))').replace('let mut v =', 'let mut v: Vec<f64> =')), '-0.0\n');
  });
  it('tied tuples and structs holding such floats give no verdict either', () => {
    const t = (i) => `(${i < 5 ? '0.0' : i < 10 ? '-0.0' : i + '.0'}, 1)`;
    assert.equal(feature(run(21, t, 'sort_unstable_by(|a, b| a.0.partial_cmp(&b.0).unwrap())')), 'unstable sort of equal keys');
  });
});

describe('an unknown field of a closure parameter', () => {
  it('is E0609 at the field name, naming the reference type', () => {
    const pre = 'struct P {\n    a: i32,\n}\n\n';
    const at = (body) => { const c = RQ.run(main(body, pre)); assert.equal(c.status, 'error', body); const e = c.errors[0]; return `${e.code}@${e.line}:${e.col} ${e.msg}`; };
    assert.equal(at('let mut v = vec![P { a: 2 }];\nv.sort_by_key(|p| p.zz);'), 'E0609@7:25 no field `zz` on type `&P`'.replace('7:25', '7:25'));
    assert.match(at('let v = vec![P { a: 2 }];\nlet n = v.iter().filter(|p| p.zz > 0).count();'), /no field `zz` on type `&&P`/);
    assert.match(at('let mut v = vec![P { a: 2 }];\nfor p in v.iter_mut() {\n    p.zz = 1;\n}'), /no field `zz` on type `&mut P`/);
    assert.match(at('let p = P { a: 2 };\nprintln!("{}", p.zz);'), /no field `zz` on type `P`/);
    assert.match(at('let t = (1, 2);\nprintln!("{}", t.5);'), /E0609@\d+:22 no field `5`/);
  });
});

describe('cmp, partial_cmp, total_cmp and Ordering', () => {
  it('compare whole numbers, text, chars, bools, tuples, arrays and options', () => {
    assert.equal(out(main('println!("{:?} {:?} {:?}", 3.cmp(&4), \'b\'.cmp(&\'a\'), true.cmp(&true));')), 'Less Greater Equal\n');
    assert.equal(out(main('let s = String::from("b");\nprintln!("{:?} {:?}", s.cmp(&String::from("a")), "x".cmp("y"));')), 'Greater Less\n');
    assert.equal(out(main('println!("{:?} {:?} {:?}", (1, 2).cmp(&(1, 3)), [1, 2].cmp(&[1, 1]), Some(3).partial_cmp(&Some(4)));')), 'Less Greater Some(Less)\n');
  });

  it('partial_cmp gives None for a NaN and total_cmp orders floats', () => {
    assert.equal(out(main('let n = 0.0 / 0.0;\nprintln!("{:?} {:?}", n.partial_cmp(&1.0), 1.0.partial_cmp(&2.0));')), 'None Some(Less)\n');
    assert.equal(out(main('let a = 1.5f64;\nprintln!("{:?} {:?}", a.total_cmp(&2.5), (-0.0f64).total_cmp(&0.0));')), 'Less Less\n');
    assert.equal(feature(main('let n: f64 = 0.0 / 0.0;\nprintln!("{:?}", n.total_cmp(&1.0));')), 'float total order of NaN');
  });

  it('a program with its own enum named Ordering keeps it, and its cmp stays unsupported', () => {
    const own = '#[derive(Debug)]\nenum Ordering {\n    Up,\n    Flat,\n}\n\n';
    assert.equal(out(main('let o = Ordering::Flat;\nprintln!("{:?} {:?}", o, Ordering::Up);', own)), 'Flat Up\n');
    assert.equal(feature(main('let mut v = vec![3, 1, 2];\nv.sort_by(|a, b| a.cmp(b));', own)), 'collection method');
    assert.equal(feature(main('println!("{:?}", 1.cmp(&2));', own)), 'method call');
  });

  it('reverse, then and then_with combine orderings, and then_with runs its closure only on a tie', () => {
    assert.equal(out(main('let o = 1.cmp(&2);\nprintln!("{:?} {:?} {:?}", o.reverse(), o.then(2.cmp(&1)), 1.cmp(&1).then(2.cmp(&1)));')), 'Greater Less Greater\n');
    assert.equal(out(main('let a = 1.cmp(&2).then_with(|| 2.cmp(&1));\nlet b = 1.cmp(&1).then_with(|| 2.cmp(&1));\nprintln!("{:?} {:?}", a, b);')), 'Less Greater\n');
  });

  it('are E0599 on a float and on a struct without Ord', () => {
    assert.deepEqual(msgs(main('println!("{:?}", 1.5f64.cmp(&2.5));')), ['E0599@2:29']);
    assert.deepEqual(msgs(main('let a = P { x: 1 };\nlet b = P { x: 2 };\nprintln!("{:?}", a.cmp(&b));', 'struct P {\n    x: i32,\n}\n\n')), ['E0599@8:24']);
    assert.equal(out(main('let a = P { x: 1 };\nlet b = P { x: 2 };\nprintln!("{:?}", a.cmp(&b));', '#[derive(PartialEq, Eq, PartialOrd, Ord)]\nstruct P {\n    x: i32,\n}\n\n')), 'Less\n');
  });
});
