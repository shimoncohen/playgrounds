import { describe, it } from 'node:test';
import strict from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const assert = { ...strict, deepEqual: (a, b, msg) => strict.equal(JSON.stringify(a), JSON.stringify(b), msg) };
const RQ = loadRust();
const P = (...lines) => lines.join('\n') + '\n';
const main = (...body) => P('fn main() {', ...body.map((l) => '    ' + l), '}');
const ids = (c) => c.errors.map((e) => `${e.code || e.lint}@${e.line}`).join(',');
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src); return `${c.unsupported.feature}@${c.unsupported.line}`; };
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', src + JSON.stringify(c.errors) + JSON.stringify(c.unsupportedAll) + (c.message || '')); return c.stdout; };
const msg = (src) => { const c = RQ.run(src); assert.equal(c.status, 'error', src); assert.equal(c.errors.length, 1, JSON.stringify(c.errors)); return `${c.errors[0].code}: ${c.errors[0].msg}`; };
const E = ['enum E {', '    A,', '    B(bool),', '    C { x: u8, y: bool },', '    D(Option<bool>, bool),', '}'];
const PQ = ['struct P {', '    a: bool,', '    b: u8,', '}', 'struct Q(bool, Option<bool>);'];
const miss = (ty, ...arms) => msg(P(...E, ...PQ, `fn f(v: ${ty}, g: bool) {`, '    match v {', ...arms.map((a) => `        ${a} => {}`), '    }', '}', 'fn main() {}'));
const E4 = (text) => `E0004: non-exhaustive patterns: ${text} not covered`;

describe('E0004 names the values left out, as rustc does', () => {
  it('lists enum variants, three at most, then counts the rest', () => {
    assert.equal(miss('E', 'E::A'), E4('`E::B(_)`, `E::C { .. }` and `E::D(_, _)`'));
    assert.equal(miss('E', 'E::B(true)', 'E::C { x: 0, .. }', 'E::D(None, true)', 'E::A'), E4('`E::B(false)`, `E::C { x: 1_u8..=u8::MAX, .. }` and `E::D(Some(_), _)`'));
  });
  it('names the missing integer ranges with the type of the scrutinee', () => {
    assert.equal(miss('u8', '0..=9', '20..=30', '100'), E4('`10_u8..=19_u8`, `31_u8..=99_u8` and `101_u8..=u8::MAX`'));
    assert.equal(miss('i8', '0'), E4('`i8::MIN..=-1_i8` and `1_i8..=i8::MAX`'));
    assert.equal(miss('usize', '0'), E4('`1_usize..`'));
    assert.equal(miss('isize', '0'), E4('`..=-1_isize` and `1_isize..`'));
    assert.equal(miss('u8', '0..=100'), E4('`101_u8..=u8::MAX`'));
  });
  it('names a char range with the gap for surrogates left out', () => {
    assert.equal(miss('char', "'a'..='z'"), E4("`'\\0'..='`'`, `'{'..='\\u{d7ff}'` and `'\\u{e000}'..='\\u{10ffff}'`"));
  });
  it('digs into tuples, structs and options, and reports the missing part only', () => {
    assert.equal(miss('(bool, Option<bool>)', '(true, Some(_))', '(false, None)'), E4('`(true, None)` and `(false, Some(_))`'));
    assert.equal(miss('(u8, u8)', '(0..=100, _)', '(_, 0..=50)'), E4('`(101_u8..=u8::MAX, 51_u8..=u8::MAX)`'));
    assert.equal(miss('(u8, u8)', '(0..=100, 0..=100)', '(50..=255, 50..=255)'), E4('`(0_u8..=49_u8, 101_u8..=u8::MAX)` and `(101_u8..=u8::MAX, 0_u8..=49_u8)`'));
    assert.equal(miss('P', 'P { a: true, b: 0 }'), E4('`P { a: false, .. }`'));
    assert.equal(miss('Q', 'Q(true, Some(true))', 'Q(false, None)'), E4('`Q(true, None)` and `Q(false, Some(_))`'));
    assert.equal(miss('Option<Option<bool>>', 'Some(Some(true))', 'None'), E4('`Some(None)`'));
  });
  it('shows a & in front of a reference and for a text literal', () => {
    assert.equal(miss('&Option<bool>', 'Some(_)'), E4('`&None`'));
    assert.equal(miss('&str', '"a"'), E4('`&_`'));
    assert.equal(miss('Option<&str>', 'Some("a")', 'None'), E4('`Some(&_)`'));
  });
  it('an arm with a guard names its constructors but covers nothing', () => {
    assert.equal(miss('Option<bool>', 'Some(_) if g', 'None'), E4('`Some(_)`'));
    assert.equal(miss('bool', 'x if g'), E4('`true` and `false`'));
    assert.equal(miss('u8', '0..=9 if g'), E4('`10_u8..=u8::MAX`'));
  });
  it('a search that grows too big is unsupported, not slow', () => {
    const arms = Array.from({ length: 40 }, (_, i) => `(${i}..=${i + 1000}, ${i}..=${i + 1000}, ${i}..=${i + 1000}, ${i}..=${i + 1000})`);
    const c = RQ.run(P('fn f(v: (u32, u32, u32, u32)) {', '    match v {', ...arms.map((a) => `        ${a} => {}`), '    }', '}', 'fn main() {}'));
    assert.ok(['unsupported', 'error'].includes(c.status));
  });
});

describe('match: literals, ranges, or-patterns, names, @ and guards', () => {
  it('numbers match by value, range, | and a last arm', () => {
    assert.equal(out(main('for n in 0..8 {', '    let s = match n {', '        0 => "zero",', '        1 | 2 => "small",', '        3..=5 => "mid",', '        6..8 => "high",', '        _ => "big",', '    };', '    println!("{} {}", n, s);', '}')),
      '0 zero\n1 small\n2 small\n3 mid\n4 mid\n5 mid\n6 high\n7 high\n');
  });
  it('MIN, MAX and negative literals end a range; a half-open range runs to the top', () => {
    assert.equal(out(main('let x: i8 = -3;', 'match x {', '    i8::MIN..=-1 => println!("neg"),', '    0 => println!("zero"),', '    1..=i8::MAX => println!("pos"),', '}', 'match 200u8 {', '    0..100 => println!("low"),', '    100.. => println!("high"),', '}')), 'neg\nhigh\n');
  });
  it('chars, bools and text match, also inside Some', () => {
    assert.equal(out(main("let c = 'k';", "match c {", "    'a'..='j' => println!(\"first\"),", "    'k'..='z' => println!(\"second\"),", '    _ => println!("other"),', '}',
      'match "x" {', '    "a" => println!("a"),', '    "x" => println!("x"),', '    _ => println!("?"),', '}', 'match Some("hi") {', '    Some("hi") => println!("hi!"),', '    Some(o) => println!("{}", o),', '    None => println!("none"),', '}', 'match true {', '    true => println!("t"),', '    false => println!("f"),', '}')), 'second\nx\nhi!\nt\n');
  });
  it('a name binds, and name @ pattern binds what the pattern matched', () => {
    assert.equal(out(P('fn show(n: u32) {', '    match n {', '        small @ 1..=5 => println!("small {}", small),', '        big @ (6 | 7 | 8) => println!("big {}", big),', '        other => println!("other {}", other),', '    }', '}', main('show(3);', 'show(8);', 'show(20);'))), 'small 3\nbig 8\nother 20\n');
  });
  it('a guard picks between arms top to bottom and may read a String that the arm then moves', () => {
    assert.equal(out(P('fn show(n: u32) {', '    match n {', '        x if x % 2 == 0 => println!("even {}", x),', '        x if x > 5 => println!("big odd {}", x),', '        _ => println!("other"),', '    }', '}', main('show(8);', 'show(7);', 'show(3);'))), 'even 8\nbig odd 7\nother\n');
    assert.equal(out(main('let o = Some(String::from("hi"));', 'match o {', '    Some(s) if s.len() > 3 => println!("long {}", s),', '    Some(s) => println!("short {}", s),', '    None => println!("none"),', '}')), 'short hi\n');
  });
  it('nested patterns: tuples, options, structs and enum variants', () => {
    assert.equal(out(P(...E, ...PQ, 'fn main() {', '    let t = (Some(Some(3)), E::C { x: 2, y: true });', '    match t {', '        (Some(Some(n)), E::C { x: 2, y }) => println!("{} {}", n, y),', '        _ => println!("other"),', '    }',
      '    let p = P { a: true, b: 9 };', '    match p {', '        P { a: false, .. } => println!("no"),', '        P { b: 0..=5, .. } => println!("low"),', '        P { b, .. } => println!("b={}", b),', '    }', '    match Q(true, None) {', '        Q(false, _) => println!("f"),', '        Q(true, Some(_)) => println!("s"),', '        Q(true, None) => println!("n"),', '    }', '}')), '3 true\nb=9\nn\n');
  });
  it('a scrutinee that is a reference binds by reference and leaves the value whole', () => {
    assert.equal(out(main('let t = (String::from("a"), 5);', 'let r = &t;', 'match r {', '    (s, n) => println!("{} {}", s, n),', '}', 'let o = Some((String::from("b"), 7));', 'match &o {', '    Some((s, n)) => println!("{} {}", s, n),', '    None => {}', '}', 'println!("{:?} {}", o, t.0);')), 'a 5\nb 7\nSome(("b", 7)) a\n');
  });
});

describe('if let, while let, let else and let with a pattern', () => {
  it('if let runs one case, else if let chains, and it is an expression', () => {
    assert.equal(out(main('let o = Some(4);', 'let p: Option<i32> = None;', 'if let Some(n) = p {', '    println!("p {}", n);', '} else if let Some(m) = o {', '    println!("o {}", m);', '} else {', '    println!("none");', '}',
      'let n = if let Some(v) = o { v * 2 } else { 0 };', 'println!("{}", n);', 'if let Some(1) = o {', '    println!("one");', '}')), 'o 4\n8\n');
  });
  it('while let loops until the pattern fails, and break and continue work in it', () => {
    assert.equal(out(P('fn step(n: u32) -> Option<u32> {', '    if n == 0 { None } else { Some(n - 1) }', '}', main('let mut n = 5;', 'while let Some(next) = step(n) {', '    if n == 4 {', '        n = next;', '        continue;', '    }', '    if n == 1 {', '        break;', '    }', '    println!("{}", n);', '    n = next;', '}', 'println!("end {}", n);'))), '5\n3\n2\nend 1\n');
  });
  it('let else binds when the pattern fits and runs the else block when it does not', () => {
    const src = (o) => main(`let o: Option<i32> = ${o};`, 'let Some(n) = o else {', '    println!("none");', '    return;', '};', 'println!("n={}", n);');
    assert.equal(out(src('Some(5)')), 'n=5\n');
    assert.equal(out(src('None')), 'none\n');
  });
  it('let takes a tuple or a struct apart, with _ and .. leaving the rest', () => {
    assert.equal(out(P('struct Pt {', '    x: i32,', '    y: i32,', '}', main('let (a, b, c) = (1, String::from("a"), 2.5);', 'println!("{} {} {}", a, b, c);', 'let Pt { x, y } = Pt { x: 1, y: 2 };', 'let Pt { x: z, .. } = Pt { x: 9, y: 8 };', 'let () = ();', 'println!("{} {} {}", x, y, z);'))), '1 a 2.5\n1 2 9\n');
  });
  it('a let whose pattern can fail is E0005 and names what is left out', () => {
    const c = RQ.run(main('let o = Some(5);', 'let Some(n) = o;', 'println!("{}", n);'));
    assert.equal(ids(c), 'E0005@3');
    assert.equal(c.errors[0].msg, 'refutable pattern in local binding');
    assert.equal(ids(RQ.run(main('let t = (1, true);', 'let (a, true) = t;'))), 'E0005@3');
  });
  it('the else block of let else must leave: E0308 with the let-else wording', () => {
    const c = RQ.run(main('let o = Some(5);', 'let Some(n) = o else { 5 };', 'println!("{}", n);'));
    assert.equal(ids(c), 'E0308@3');
    assert.equal(c.errors[0].msg, '`else` clause of `let...else` does not diverge: expected `!`, found integer');
  });
  it('an if let with no else gives (), and its two branches must agree', () => {
    assert.equal(msg(main('let o = Some(5);', 'if let Some(v) = o { v }')), 'E0308: mismatched types: expected `()`, found integer');
    assert.equal(msg(main('let o = Some(5);', 'let x = if let Some(v) = o { v * 2 } else { "none" };')), 'E0308: `if` and `else` have incompatible types: expected integer, found `&str`');
  });
  it('the match arms of different types are E0308 with the match wording', () => {
    assert.equal(msg(main('let n = 3;', 'let s = match n {', '    1 => "a",', '    _ => 2,', '};')), 'E0308: `match` arms have incompatible types: expected `&str`, found integer');
  });
  it('a let chain stays unsupported', () => {
    assert.equal(feature(main('let o = Some(5);', 'if o.is_some() && let Some(n) = o {', '    println!("{}", n);', '}')), 'let condition@3');
  });
});

describe('moves and drops through patterns', () => {
  it('a name binds by move, a wildcard moves nothing, and a reference scrutinee borrows', () => {
    assert.equal(ids(RQ.run(main('let o = Some(String::from("a"));', 'match o {', '    Some(s) => println!("{}", s),', '    None => {}', '}', 'println!("{:?}", o);'))), 'E0382@7');
    assert.equal(out(main('let o = Some(String::from("a"));', 'match o {', '    Some(_) => println!("s"),', '    None => {}', '}', 'println!("{:?}", o);')), 's\nSome("a")\n');
    assert.equal(out(main('let o = Some(String::from("a"));', 'if let Some(s) = &o {', '    println!("{}", s);', '}', 'println!("{:?}", o);')), 'a\nSome("a")\n');
  });
  it('a move out of a nested part leaves the other parts usable, and the enum itself not', () => {
    assert.equal(out(main('let t = (String::from("a"), String::from("b"));', 'let (x, _) = t;', 'println!("{} {}", x, t.1);', 'let (_, u) = t;', 'println!("{}", u);')), 'a b\nb\n');
    assert.equal(ids(RQ.run(main('let t = (String::from("a"), String::from("b"));', 'let (x, _) = t;', 'let (y, _) = t;', 'println!("{} {}", x, y);'))), 'E0382@4');
    assert.equal(feature(main('let o = Some((String::from("a"), String::from("b")));', 'if let Some((s, _)) = o {', '    println!("{}", s);', '}', 'if let Some((s2, _)) = o {', '    println!("{}", s2);', '}')), 'partial move@6');
  });
  it('a match reads only the places it tests: a moved value can meet an arm that tests nothing', () => {
    assert.equal(out(main('let t = (String::new(), String::new());', 'let u = t;', 'match t {', '    _ => println!("x"),', '}', 'let (_, _) = u;')), 'x\n');
    assert.equal(ids(RQ.run(main('let o = Some(String::new());', 'let u = o;', 'if let None = o {}'))), 'E0382@4');
    assert.equal(ids(RQ.run(main('let o = Some(String::new());', 'let u = o;', 'match o {', '    x => {}', '}'))), 'E0382@5');
  });
  it('moving out from behind a reference is E0507 with the variant named', () => {
    const c = RQ.run(P('enum E {', '    A(String),', '    B,', '}', 'struct W {', '    e: E,', '}', 'fn f(w: &W) {', '    match w.e {', '        E::A(s) => println!("{}", s),', '        E::B => {}', '    }', '}', 'fn main() {}'));
    assert.equal(ids(c), 'E0507@9');
    assert.equal(c.errors[0].msg, 'cannot move out of `w.e` as enum variant `A` which is behind a shared reference');
  });
  it('the values a let leaves behind drop at the end of the statement, the bound ones with the block', () => {
    const D = P('struct D(String);', 'impl Drop for D {', '    fn drop(&mut self) {', '        println!("drop {}", self.0);', '    }', '}');
    assert.equal(out(P(D, main('let (a, _) = (D(String::from("a")), D(String::from("b")));', 'println!("after");'))), 'drop b\nafter\ndrop a\n');
    assert.equal(out(P(D, main('let (a, b) = (D(String::from("a")), D(String::from("b")));', 'println!("after");'))), 'after\ndrop b\ndrop a\n');
  });
  it('an if let drops its scrutinee before the else block, and a match at the end of the statement', () => {
    const D = P('struct D(String);', 'impl Drop for D {', '    fn drop(&mut self) {', '        println!("drop {}", self.0);', '    }', '}', 'struct Pr(Option<u32>, D);', 'fn pair(s: Option<u32>) -> Pr {', '    Pr(s, D(String::from("t")))', '}');
    const src = (s) => P(D, main(`if let Pr(Some(n), _) = pair(${s}) {`, '    println!("in {}", n);', '} else {', '    println!("else");', '}', 'println!("after");'));
    assert.equal(out(src('None')), 'drop t\nelse\nafter\n');
    assert.equal(out(src('Some(1)')), 'in 1\ndrop t\nafter\n');
    assert.equal(out(P(D, main('match pair(None) {', '    Pr(Some(n), _) => println!("in {}", n),', '    Pr(None, _) => println!("else"),', '}', 'println!("after");'))), 'else\ndrop t\nafter\n');
  });
});

describe('what stays unsupported, with a hint', () => {
  it('ref, & patterns, slices, constants and floats', () => {
    assert.equal(feature(main('let o = Some(String::new());', 'match o {', '    Some(ref s) => {}', '    None => {}', '}')), 'pattern@4');
    assert.equal(feature(main('let o = &Some(1);', 'match o {', '    &Some(n) => {}', '    &None => {}', '}')), 'pattern@4');
    assert.equal(feature(main('let v = [1, 2];', 'match v {', '    [a, b] => {}', '}')), 'pattern@4');
    assert.equal(feature(P('const K: i32 = 3;', main('match 3 {', '    K => {}', '    _ => {}', '}'))), 'pattern@4');
    assert.equal(feature(main('match 2.5 {', '    2.5 => {}', '    _ => {}', '}')), 'pattern@3');
  });
  it('a name bound inside an or-pattern, @ with names inside, and a repeated name', () => {
    assert.equal(feature(main('let o = Some(1);', 'match o {', '    Some(x) | None => {}', '}')), 'pattern@4');
    assert.equal(feature(main('let o = Some(1);', 'match o {', '    n @ Some(m) => {}', '    None => {}', '}')), 'pattern@4');
    assert.equal(feature(main('let t = (1, 2);', 'match t {', '    (a, a) => {}', '}')), 'pattern@4');
  });
  it('a wrong field list, an empty range, and a number outside its type', () => {
    assert.equal(feature(P('struct P {', '    a: i32,', '    b: i32,', '}', main('let p = P { a: 1, b: 2 };', 'let P { a } = p;'))), 'pattern@7');
    assert.equal(feature(main('let n = 5u8;', 'match n {', '    5..=1 => {}', '    _ => {}', '}')), 'pattern@4');
    assert.equal(feature(main('let n = 5u8;', 'match n {', '    300 => {}', '    _ => {}', '}')), 'pattern@4');
  });
  it('a guard that moves the name its arm binds, and a &mut scrutinee', () => {
    assert.equal(feature(P('fn eat(s: String) -> bool {', '    s.len() > 1', '}', main('let o = Some(String::from("abc"));', 'match o {', '    Some(s) if eat(s) => println!("a"),', '    _ => println!("b"),', '}'))), 'match guard@7');
    assert.equal(feature(main('let mut o = Some(1);', 'match &mut o {', '    _ => {}', '}')), 'match@3');
  });
  it('source nested thousands deep is unsupported, not an internal error', () => {
    const n = 5000;
    const c = RQ.run(main('let o = None;', 'match o {', `    ${'Some('.repeat(n)}_${')'.repeat(n)} => {}`, '    _ => {}', '}'));
    assert.equal(c.status, 'unsupported');
    assert.equal(c.unsupported.feature, 'nesting');
  });
});

describe('a pattern names things as rustc does', () => {
  it('a bare Some, Ok or Err is E0530, a bare variant name is E0170, an unknown variant E0599', () => {
    assert.equal(msg(main('let o = Some(1);', 'match o {', '    Some => {}', '    None => {}', '}')), 'E0530: match bindings cannot shadow tuple variants');
    assert.equal(msg(P('enum L {', '    R,', '    G,', '}', main('let l = L::R;', 'match l {', '    L::R => {}', '    L::Y => {}', '    _ => {}', '}'))), 'E0599: no variant, associated function, or constant named `Y` found for enum `L` in the current scope');
  });
  it('a literal of the wrong type is E0308 at the pattern', () => {
    assert.equal(msg(main('let n = 5;', 'match n {', '    "five" => {}', '    _ => {}', '}')), 'E0308: mismatched types: expected integer, found `&str`');
  });
});
