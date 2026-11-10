import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
// arrays made inside the vm sandbox have another realm's prototype, which strict deepEqual rejects
const lexArr = (s) => Array.from(RQ.lex(s));
const kinds = (src) => lexArr(src).map((t) => t.k + ':' + t.v);

describe('lexer', () => {
  it('lexes identifiers, keywords and every punctuation kind', () => {
    assert.deepEqual(kinds('fn main() { let mut x_1 = r#try; }'), ['kw:fn', 'ident:main', 'punct:(', 'punct:)', 'punct:{', 'kw:let', 'kw:mut', 'ident:x_1', 'punct:=', 'ident:r#try', 'punct:;', 'punct:}', 'eof:']);
    assert.deepEqual(kinds('a::b->c=>d==e!=f<=g>=h&&i||j+=1..=2..3<<4>>=5'),
      ['ident:a', 'punct:::', 'ident:b', 'punct:->', 'ident:c', 'punct:=>', 'ident:d', 'punct:==', 'ident:e', 'punct:!=', 'ident:f', 'punct:<=', 'ident:g', 'punct:>=', 'ident:h', 'punct:&&', 'ident:i', 'punct:||', 'ident:j', 'punct:+=', 'int:1', 'punct:..=', 'int:2', 'punct:..', 'int:3', 'punct:<<', 'int:4', 'punct:>>=', 'int:5', 'eof:']);
  });

  it('lexes integers (bases, underscores, suffixes) and floats', () => {
    const t = lexArr('1_000 0xff 0o17 0b101 5u8 7usize 2.5 3.0f64 1e3 4f32 1.max 6..7');
    assert.deepEqual(t.map((x) => x.k + ':' + x.v + (x.suffix ? ':' + x.suffix : '')),
      ['int:1000', 'int:255', 'int:15', 'int:5', 'int:5:u8', 'int:7:usize', 'float:2.5', 'float:3.0:f64', 'float:1e3', 'float:4:f32', 'int:1', 'punct:.', 'ident:max', 'int:6', 'punct:..', 'int:7', 'eof:']);
  });

  it('tells a char from a lifetime', () => {
    assert.deepEqual(kinds("'a' 'a 'static '\\n' '\\'' 'ß' &'a str"), ['char:a', 'lifetime:a', 'lifetime:static', 'char:\n', "char:'", 'char:ß', 'punct:&', 'lifetime:a', 'ident:str', 'eof:']);
  });

  it('lexes plain, escaped and raw strings', () => {
    const t = lexArr('"a\\tb\\n\\"q\\" \\u{41}\\x42" r"raw\\n" r#"has "quotes""# "multi\nline" "cont\\\n   inued"');
    assert.deepEqual(t.filter((x) => x.k === 'str').map((x) => x.v), ['a\tb\n"q" AB', 'raw\\n', 'has "quotes"', 'multi\nline', 'continued']);
  });

  it('skips line, block and nested block comments', () => {
    assert.deepEqual(kinds('a // c\n/* x /* y */ z */ b /// doc\n/** d */ c'), ['ident:a', 'ident:b', 'ident:c', 'eof:']);
  });

  it('records line and column (1-based) on every token', () => {
    const t = lexArr('fn main() {\n    let x = 5;\n}');
    const x = t.find((q) => q.v === 'x'), five = t.find((q) => q.v === '5');
    assert.deepEqual([x.line, x.col, five.line, five.col], [2, 9, 2, 13]);
    assert.equal(t.at(-1).line, 3);
  });

  it('turns an unclosed string or block comment into an err token at its start', () => {
    const s = lexArr('let a = 1;\nlet s = "oops;\nlet b = 2;').find((t) => t.k === 'err');
    assert.deepEqual([s.line, s.col], [2, 9]);
    const c = lexArr('a\n  /* never closed').find((t) => t.k === 'err');
    assert.deepEqual([c.line, c.col], [2, 3]);
    assert.ok(lexArr("'").some((t) => t.k === 'err'));
    assert.ok(lexArr('#').every((t) => t.k !== 'err'));
  });

  it('reports a digit that is out of range for the base, at that digit', () => {
    const e = lexArr('let a = 0b102;').find((t) => t.k === 'err');
    assert.match(e.v, /invalid digit for a base 2 literal/);
    assert.deepEqual([e.line, e.col], [1, 13]);
    assert.match(lexArr('0o78').find((t) => t.k === 'err').v, /base 8/);
    assert.match(lexArr('0x').find((t) => t.k === 'err').v, /no valid digits/);
    assert.equal(lexArr('0b101 0o17 0xfF').some((t) => t.k === 'err'), false);
  });

  it('lexes byte literals flagged as bytes', () => {
    const t = lexArr(`b"hi" b'x'`);
    assert.deepEqual(t.slice(0, 2).map((x) => [x.k, x.byte]), [['str', true], ['char', true]]);
  });

  it('handles a 5,000-line source quickly', () => {
    const src = 'fn f(a: i32) -> i32 { let b = a + 1; b * 2 }\n'.repeat(5000);
    const t0 = Date.now();
    assert.ok(lexArr(src).length > 5000 * 20);
    assert.ok(Date.now() - t0 < 3000);
  });
});

describe('lexer: rustc edge cases', () => {
  const run = (src) => RQ.run(src);
  it('a literal over u128::MAX is "integer literal is too large", with no lint id', () => {
    const c = run('fn main() { let x = 340282366920938463463374607431768211456; }');
    assert.equal(c.status, 'error');
    assert.equal(c.errors[0].code || c.errors[0].lint, undefined);
    assert.match(c.errors[0].msg, /too large/);
  });
  it('a literal that only overflows its type is still overflowing_literals', () => {
    assert.equal(run('fn main() { let x = 300000000000000000000000000000000000000; }').errors[0].lint, 'overflowing_literals');
  });
  it('a #! line 1 is a shebang, and #![ is an attribute', () => {
    assert.equal(run('#!/usr/bin/env run\nfn main() { println!("hi"); }').stdout, 'hi\n');
    assert.equal(run('#![allow(unused)]\nfn main() { println!("hi"); }').stdout, 'hi\n');
    assert.equal(run('#!x\nfn main() {\n    let x: i32 = "a";\n}').errors[0].line, 3);
  });
});

describe('a generic function that calls itself with a bigger type', () => {
  it('is unsupported, not a limit, because rustc rejects it', () => {
    const c = RQ.run('fn f<T>(x: T) { f((x,)) }\nfn main() { f(1); }');
    assert.equal(c.status, 'unsupported');
    assert.equal(c.unsupported.feature, 'polymorphic recursion');
  });
  it('same-type and concrete-type self calls are unchanged', () => {
    assert.equal(RQ.run('fn f<T>(x: T, n: u32) { if n > 0 { f(x, n - 1); } else { println!("end"); } }\nfn main() { f(1, 2); }').stdout, 'end\n');
    assert.equal(RQ.run('fn f<T>(x: T, n: u32) { if n > 0 { f(1i32, n - 1); } }\nfn main() { f("a", 3); println!("ok"); }').stdout, 'ok\n');
  });
});
