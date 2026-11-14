import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const P = '#[derive(Debug, Clone)]\nstruct Player {\n    name: String,\n    score: i32,\n}\n\n';
const players = '    let players = vec![\n        Player { name: String::from("ana"), score: 30 },\n        Player { name: String::from("bo"), score: 55 },\n        Player { name: String::from("cy"), score: 55 },\n        Player { name: String::from("di"), score: 12 },\n    ];\n';
const main = (body, items = '') => `${items}fn main() {\n${body}\n}\n`;
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', `${src} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`); return c.stdout; };
const err = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', `${src} ${JSON.stringify(c.unsupported)}`); const e = c.errors; assert.equal(e.length, 1, JSON.stringify(e)); return `${e[0].line}:${e[0].col} ${e[0].code}`; };
const USE = 'use std::cmp::Ordering;\n';
const guess = (arms) => main(`    let guess = 9;\n    match guess.cmp(&7) {\n${arms}\n    }`, USE);

describe('Ordering by name', () => {
  it('matches the three variants, by `use` and by the full path', () => {
    const all = '        Ordering::Less => println!("small"),\n        Ordering::Equal => println!("win"),\n        Ordering::Greater => println!("big"),';
    assert.equal(out(guess(all)), 'big\n');
    assert.equal(out(main('    match 3.cmp(&7) {\n        std::cmp::Ordering::Less => println!("small"),\n        std::cmp::Ordering::Equal => println!("win"),\n        std::cmp::Ordering::Greater => println!("big"),\n    }')), 'small\n');
    assert.equal(out(guess('        Ordering::Less => println!("small"),\n        _ => println!("not small"),')), 'not small\n');
  });

  it('is a value: compared, returned from a match, reversed', () => {
    assert.equal(out(main('    let o = 5.cmp(&8);\n    println!("{} {:?} {:?}", o == Ordering::Less, o, o.reverse());\n    let word = match o {\n        Ordering::Less => "less",\n        Ordering::Equal => "equal",\n        Ordering::Greater => "greater",\n    };\n    println!("{} {}", word, o != std::cmp::Ordering::Greater);', USE)), 'true Less Greater\nless true\n');
    assert.equal(out(main('    let a = 2.5;\n    match a.partial_cmp(&1.5) {\n        Some(Ordering::Greater) => println!("bigger"),\n        Some(_) => println!("not bigger"),\n        None => println!("nan"),\n    }', USE)), 'bigger\n');
  });

  it('is imported with others in one braced `use`', () => {
    assert.equal(out(main('    let mut v = vec![1, 3, 2];\n    v.sort_by_key(|x| Reverse(*x));\n    println!("{:?} {}", v, 1.cmp(&2) == Ordering::Less);', 'use std::cmp::{Ordering, Reverse};\n')), '[3, 2, 1] true\n');
  });

  it('a match that leaves a variant out is E0004 and names it with the full path', () => {
    const c = RQ.run(guess('        Ordering::Less => println!("small"),\n        Ordering::Greater => println!("big"),'));
    assert.equal(c.status, 'error');
    assert.equal(c.errors[0].code, 'E0004');
    assert.equal(`${c.errors[0].line}:${c.errors[0].col}`, '4:11');
    assert.match(c.errors[0].msg, /`std::cmp::Ordering::Equal` not covered/);
  });

  it('Ordering without the `use` is E0433 at the name, once for each path', () => {
    assert.equal(err(main('    match 5.cmp(&8) {\n        Ordering::Less => println!("less"),\n        _ => println!("other"),\n    }')), '3:9 E0433');
    const c = RQ.run(main('    let o = 5.cmp(&8);\n    println!("{}", o == Ordering::Less);'));
    assert.equal(c.status, 'error');
    assert.equal(`${c.errors[0].line}:${c.errors[0].col} ${c.errors[0].code}`, '3:25 E0433');
    assert.equal(c.errors[0].msg, 'failed to resolve: use of undeclared type `Ordering`');
  });

  it('a program that declares its own Ordering keeps it', () => {
    assert.equal(out(main('    let o = Ordering::Late;\n    println!("{:?}", o);', '#[derive(Debug)]\nenum Ordering {\n    Early,\n    Late,\n}\n')), 'Late\n');
  });

  it('a `use` of Ordering and a type of the same name is not judged', () => {
    assert.equal(RQ.run(main('    println!("a");', USE + 'enum Ordering {\n    A,\n}\n')).status, 'unsupported');
  });
});

describe('cmp with a reference argument', () => {
  it('`&b` where b is already a reference coerces back, in a sort and a search', () => {
    assert.equal(out(main('    let mut v = vec![5, -3, 9];\n    v.sort_by(|a, b| b.cmp(&a));\n    println!("{:?}", v);\n    let a = "pear";\n    let b = "plum";\n    println!("{:?}", a.cmp(&b));')), '[9, 5, -3]\nLess\n');
  });
});

describe('Reverse', () => {
  const board = (key) => main(`${players}    let mut board = players.clone();\n    board.sort_by_key(${key});\n    for p in &board {\n        println!("{} {}", p.name, p.score);\n    }`, 'use std::cmp::Reverse;\n' + P);
  it('turns a key around, alone or in a tuple, and the sort stays stable', () => {
    assert.equal(out(board('|p| Reverse(p.score)')), 'bo 55\ncy 55\nana 30\ndi 12\n');
    assert.equal(out(board('|p| (Reverse(p.score), Reverse(p.name.clone()))')), 'cy 55\nbo 55\nana 30\ndi 12\n');
  });
  it('is a tuple struct: Debug, the field and the flipped comparison', () => {
    assert.equal(out(main('    let r = Reverse(5);\n    println!("{:?} {} {}", r, r.0, Reverse(1) > Reverse(2));\n    println!("{:?}", Reverse(3).cmp(&Reverse(4)));', 'use std::cmp::Reverse;\n')), 'Reverse(5) 5 true\nGreater\n');
  });
  it('a key that is not Ord stays E0277', () => {
    assert.equal(err(main('    let mut v = vec![1.5, 0.5];\n    v.sort_by_key(|x| Reverse(*x));', 'use std::cmp::Reverse;\n')), '4:7 E0277');
  });
  it('without the `use` the name is not found, and a program with its own Reverse keeps it', () => {
    assert.equal(err(main('    let r = Reverse(5);\n    println!("{}", r.0);')), '2:13 E0425');
    assert.equal(out(main('    println!("{}", Reverse(1) < Reverse(2));', '#[derive(PartialEq, PartialOrd)]\nstruct Reverse(i32);\n')), 'true\n');
  });
});

describe('max_by, min_by, max_by_key and min_by_key', () => {
  const run = (call) => out(main(`${players}    let m = players.iter().${call}.unwrap();\n    println!("{} {}", m.name, m.score);`, 'use std::cmp::Reverse;\n' + P));
  it('give the last maximum and the first minimum of equal ones', () => {
    assert.equal(run('max_by_key(|p| p.score)'), 'cy 55\n');
    assert.equal(run('min_by_key(|p| p.score)'), 'di 12\n');
    assert.equal(run('max_by(|a, b| a.score.cmp(&b.score))'), 'cy 55\n');
    assert.equal(run('min_by(|a, b| a.score.cmp(&b.score))'), 'di 12\n');
    assert.equal(run('min_by_key(|p| Reverse(p.score))'), 'bo 55\n');
    assert.equal(run('max_by_key(|p| Reverse(p.score))'), 'di 12\n');
  });
  it('call the closure once for each element after the first (by), or for each element (by_key), in order', () => {
    assert.equal(out(main('    let v = vec![3, 9, 4];\n    let m = v.iter().max_by(|a, b| {\n        println!("{} {}", a, b);\n        a.cmp(b)\n    });\n    println!("{:?}", m);')), '3 9\n9 4\nSome(9)\n');
    assert.equal(out(main('    let v = vec![3, 9, 4];\n    let m = v.iter().min_by_key(|x| {\n        println!("key {}", x);\n        **x\n    });\n    println!("{:?}", m);')), 'key 3\nkey 9\nkey 4\nSome(3)\n');
  });
  it('work on numbers, floats with partial_cmp, and an empty iterator', () => {
    assert.equal(out(main('    let v: Vec<f64> = vec![5.5, 3.25, 9.0];\n    let m = v.iter().max_by(|a, b| a.partial_cmp(b).unwrap()).unwrap();\n    println!("{}", m);')), '9\n');
    assert.equal(out(main('    let v: Vec<i32> = Vec::new();\n    println!("{:?} {:?}", v.iter().max_by_key(|x| **x), v.iter().min_by(|a, b| a.cmp(b)));')), 'None None\n');
  });
  it('a float key is E0277 and a closure with the wrong shape is rejected', () => {
    assert.equal(err(main('    let v: Vec<f64> = vec![5.5, 3.25];\n    let m = v.iter().max_by_key(|x| **x);')), '3:22 E0277');
    assert.equal(RQ.run(main('    let v = vec![1, 2];\n    let m = v.iter().max_by(|a| 0);')).status, 'error');
  });
});
