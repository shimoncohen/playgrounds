import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const P = '#[derive(Debug, Clone)]\nstruct Player {\n    name: String,\n    score: i32,\n}\n\n';
const main = (body, items = '') => `${items}fn main() {\n${body}\n}\n`;
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', `${src} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`); return c.stdout; };
const err = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', `${src} ${JSON.stringify(c.unsupported)}`); const e = c.errors; assert.equal(e.length, 1, JSON.stringify(e)); return `${e[0].line}:${e[0].col} ${e[0].code}`; };
const pair = (a, op, b) => main(`    let s = String::from("hi");\n    let t: &str = "ho";\n    let rs = &s;\n    let r = ${a} ${op} ${b};\n    println!("{}", r);`);

describe('comparing text, as rustc 1.99.1 does', () => {
  it('String and &str compare with == and != in any mix that has one impl, and nothing else is allowed', () => {
    // each row: left, right, == verdict, < verdict; E0277 is at the operator, E0308 at the right side
    const rows = [
      ['s', 's', 'ok', 'ok'], ['s', 't', 'ok', 'E0308'], ['s', 'rs', 'E0277', 'E0308'],
      ['t', 's', 'ok', 'E0308'], ['t', 't', 'ok', 'ok'], ['t', 'rs', 'ok', 'ok'],
      ['rs', 's', 'E0277', 'E0308'], ['rs', 't', 'ok', 'E0308'], ['rs', 'rs', 'ok', 'ok'],
    ];
    for (const [a, b, eq, lt] of rows) for (const [op, verdict] of [['==', eq], ['<', lt]]) {
      const src = pair(a, op, b);
      if (verdict === 'ok') assert.equal(RQ.run(src).status, 'ok', `${a} ${op} ${b}`);
      else assert.equal(err(src), `5:${verdict === 'E0277' ? 13 + a.length + 1 : 13 + a.length + op.length + 2} ${verdict}`, `${a} ${op} ${b}`);
    }
  });

  it('prints the answers', () => {
    assert.equal(out(main('    let s = String::from("hi");\n    let t: &str = "ho";\n    println!("{} {} {} {}", s == "hi", "hi" == s, s != t, t == s);')), 'true true true false\n');
    assert.equal(out(main('    let a = String::from("apple");\n    let b = String::from("banana");\n    println!("{} {} {}", a < b, a >= b, &a < &b);')), 'true false true\n');
    assert.equal(out(main('    let a = "apple";\n    let b = String::from("apple");\n    println!("{}", a == b);')), 'true\n');
  });

  it('a number, char or bool on the other side is E0277 for ==, and for < when the number is still open', () => {
    const body = (a, op, b) => main(`    let s = String::from("hi");\n    let n: i32 = 3;\n    let r = ${a} ${op} ${b};\n    println!("{}", r);`);
    assert.equal(err(body('s', '==', '3')), '4:15 E0277');
    assert.equal(err(body('s', '==', "'h'")), '4:15 E0277');
    assert.equal(err(body('s', '<', '3')), '4:17 E0308');
    assert.equal(err(body('3', '==', 's')), '4:15 E0277');
    assert.equal(err(body('3', '<', 's')), '4:15 E0277');
    assert.equal(err(body('n', '==', 's')), '4:18 E0308');
    assert.equal(err(body('true', '==', 's')), '4:21 E0308');
  });

  it('the message names both types', () => {
    const c = RQ.run(pair('s', '==', 'rs'));
    assert.equal(c.errors[0].msg, "can't compare `String` with `&String`");
  });

  it('a comparison reads both sides and moves neither', () => {
    assert.equal(out(main('    let a = String::from("x");\n    let b = String::from("x");\n    let same = a == b;\n    let same2 = "x" == a;\n    println!("{} {} {} {}", same, same2, a, b);')), 'true true x x\n');
    assert.equal(err(main('    let s = String::from("hi");\n    let t = s;\n    println!("{}", s == "hi");\n    println!("{}", t);')), '4:20 E0382');
  });

  it('works on a field of a closure parameter, and in loops', () => {
    assert.equal(out(main('    let ps = vec![Player { name: String::from("ana"), score: 3 }, Player { name: String::from("bo"), score: 5 }];\n    let n = ps.iter().filter(|p| p.name == "bo").count();\n    let m = ps.iter().filter(|p| p.name != "bo").count();\n    let found = ps.iter().any(|p| "ana" == p.name);\n    let at = ps.iter().position(|p| p.name == String::from("bo"));\n    println!("{} {} {} {:?}", n, m, found, at);\n    for p in &ps {\n        if p.name == "bo" {\n            println!("{}", p.score);\n        }\n    }', P)), '1 1 true Some(1)\n5\n');
  });

  it('an unusual shape stays unsupported', () => {
    for (const body of ['    let s = String::from("hi");\n    let t: &str = "hi";\n    println!("{}", s == &t);', '    let s = String::from("hi");\n    println!("{}", s == *"hi");', '    let o = Some(String::from("a"));\n    println!("{}", o == Some("a"));']) {
      assert.equal(RQ.run(main(body)).status, 'unsupported', body);
    }
  });
});
