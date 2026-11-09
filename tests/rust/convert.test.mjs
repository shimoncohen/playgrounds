// The programs that finish are also in the corpus, so the rustc verify checks their output. An unsupported verdict has no rustc answer to check.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const main = (...body) => `fn main() {\n${body.map((l) => '    ' + l).join('\n')}\n}\n`;
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', src + JSON.stringify(c.errors) + JSON.stringify(c.unsupported)); return c.stdout; };
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src); return c.unsupported.feature; };

describe('String + &str', () => {
  it('joins text and moves only the left String', () => {
    assert.equal(out(main('let a = String::from("a");', 'let s = String::from("hi");', 'let c = a + "b" + &s;', 'println!("{} {}", c, s);')), 'abhi hi\n');
  });
  it('using the left String afterwards is E0382', () => {
    const c = RQ.run(main('let a = String::from("a");', 'let c = a + "b";', 'println!("{} {}", c, a);'));
    assert.equal(c.errors.map((e) => `${e.code}@${e.line}`).join(), 'E0382@4');
  });
  it('a temporary on the left works too', () => {
    assert.equal(out(main('let c = String::from("a") + "b" + "c";', 'println!("{}", c);')), 'abc\n');
  });
  it('a right side that is not &str or &String, and +=, are unsupported with their own hint', () => {
    for (const src of [main('let a = String::from("a");', 'let b = String::from("b");', 'let c = a + b;'), main('let mut s = String::new();', 's += "x";')]) {
      assert.equal(feature(src), 'string concatenation');
    }
    assert.match(RQ.diag.hint('string concatenation'), /push_str/);
  });
});

describe('to_string on numbers, chars and bools', () => {
  it('prints like {}', () => {
    assert.equal(out(main('let n = 5i32;', 'let r = &n;', 'println!("{} {} {}", 5.to_string(), n.to_string(), r.to_string());', 'println!("{} {} {} {}", \'x\'.to_string(), true.to_string(), 2.5.to_string(), 3.0.to_string());', 'println!("{}", 300u32.to_string() + "!");')), '5 5 5\nx true 2.5 3\n300!\n');
  });
  it('the result is a String', () => {
    const c = RQ.run(main('let x: i32 = 5.to_string();'));
    assert.equal(c.errors.map((e) => e.code).join(), 'E0308');
  });
});

describe('.into()', () => {
  it('&str to String, and a whole number to a wider one', () => {
    assert.equal(out(main('let s: String = "hi".into();', 'let x: i64 = 5i32.into();', 'let y: u16 = 7u8.into();', 'let z: i64 = 5u32.into();', 'println!("{} {} {} {}", s, x, y, z);')), 'hi 5 7 5\n');
  });
  it('a narrowing or sign-changing conversion is unsupported, not accepted or rejected', () => {
    for (const [from, to] of [['5i64', 'i32'], ['5i8', 'u8'], ['5u32', 'u16']]) assert.equal(feature(main(`let x: ${to} = ${from}.into();`)), 'into');
  });
});

describe('every unsupported feature the checker names has a specific hint', () => {
  it('bounds, where, into and generic reference', () => {
    for (const f of ['bounds', 'where', 'into', 'generic reference']) assert.notEqual(RQ.diag.hint(f), RQ.diag.hint('anything else'), f);
  });
});
