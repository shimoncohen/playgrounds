// Every verdict here was checked against rustc (pinned image, edition 2024): the id and line of an error, the output of a program that compiles.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const LONGEST = "fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {\n    if x.len() > y.len() { x } else { y }\n}\n";
const EXC = "struct Excerpt<'a> {\n    part: &'a str,\n}\n";
const main = (...body) => 'fn main() {\n' + body.map((l) => '    ' + l).join('\n') + '\n}\n';

// 'ok:<stdout>', 'E0597@7' (the one coded error) or 'unsupported:<feature>@<line>'
const verdict = (src) => {
  const c = RQ.run(src);
  if (c.status === 'ok') return 'ok:' + c.stdout;
  if (c.status === 'error') return c.errors.map((e) => `${e.code || e.lint}@${e.line}`).join(',');
  if (c.status === 'unsupported') return `unsupported:${c.unsupported.feature}@${c.unsupported.line}`;
  return c.status;
};

const ROWS = {
  'a named lifetime ties the result to both inputs': [LONGEST + main('let a = String::from("abcd");', 'let b = String::from("xy");', 'println!("{}", longest(a.as_str(), b.as_str()));', 'println!("{}", longest("ab", "cde"));'), 'ok:abcd\ncde\n'],
  'the result outliving the shorter input is E0597 at the borrow': [LONGEST + main('let a = String::from("abcd");', 'let r: &str;', '{', '    let b = String::from("xy");', '    r = longest(&a, &b);', '}', 'println!("{}", r);'), 'E0597@9'],
  'using the result inside the inner block is fine': [LONGEST + main('let a = String::from("abcd");', '{', '    let b = String::from("xy");', '    println!("{}", longest(&a, &b));', '}'), 'ok:abcd\n'],
  'a second lifetime frees the input the result does not use': ["fn first<'a, 'b>(x: &'a str, y: &'b str) -> &'a str {\n    println!(\"{}\", y);\n    x\n}\n" + main('let a = String::from("abcd");', 'let r: &str;', '{', '    let b = String::from("xy");', '    r = first(&a, &b);', '}', 'println!("{}", r);'), 'ok:xy\nabcd\n'],
  'an input left out of the lifetime does not hold the result': ["fn first<'a>(x: &'a str, y: &str) -> &'a str {\n    println!(\"{}\", y);\n    x\n}\n" + main('let a = String::from("abcd");', 'let r: &str;', '{', '    let b = String::from("xy");', '    r = first(&a, &b);', '}', 'println!("{}", r);'), 'ok:xy\nabcd\n'],
  'one shared lifetime holds both inputs (E0597)': ["fn first<'a>(x: &'a str, y: &'a str) -> &'a str {\n    x\n}\n" + main('let a = String::from("abcd");', 'let r: &str;', '{', '    let b = String::from("xy");', '    r = first(&a, &b);', '}', 'println!("{}", r);'), 'E0597@9'],
  'writing to an input while the result lives is E0502': [LONGEST + main('let mut a = String::from("abcd");', 'let b = String::from("xy");', 'let r = longest(&a, &b);', 'a.push_str("!");', 'println!("{}", r);'), 'E0502@8'],
  'moving either input while the result lives is E0505': [LONGEST + main('let a = String::from("abcd");', 'let b = String::from("xy");', 'let r = longest(&a, &b);', 'let c = b;', 'println!("{} {}", r, c);'), 'E0505@8'],
  'assigning an input while the result lives is E0506': [LONGEST + main('let mut a = String::from("abcd");', 'let b = String::from("xy");', 'let r = longest(&a, &b);', 'a = String::from("z");', 'println!("{}", r);'), 'E0506@8'],
  'a parameter without the lifetime cannot be returned: E0621': ["fn longest<'a>(x: &'a str, y: &str) -> &'a str {\n    if x.len() > y.len() { x } else { y }\n}\nfn main() {}\n", 'E0621@2'],
  'E0621 also follows a variable that may hold the parameter, whatever the order': ["fn f<'a>(x: &'a str, y: &str, c: bool) -> &'a str {\n    let mut best = y;\n    best = x;\n    if c { best = x; }\n    best\n}\nfn main() {}\n", 'E0621@5'],
  'E0621 follows a call that passes the parameter on': ["fn f<'a>(x: &'a str, y: &str) -> &'a str {\n    longest(x, y)\n}\n" + LONGEST + 'fn main() {}\n', 'E0621@2'],
  'an early return of the parameter is E0621 too': ["fn g<'a>(x: &'a str, y: &str) -> &'a str {\n    if x.len() > 1 { return y; }\n    x\n}\nfn main() {}\n", 'E0621@2'],
  'a parameter that is not returned is fine': ["fn f<'a>(x: &'a str, y: &str) -> &'a str {\n    println!(\"{}\", y.len());\n    x\n}\nfn main() { println!(\"{}\", f(\"a\", \"b\")); }\n", 'ok:1\na\n'],
  'a different named lifetime is rustc\'s code-less error: unsupported': ["fn f<'a, 'b>(x: &'a str, y: &'b str) -> &'a str {\n    y\n}\nfn main() {}\n", 'unsupported:lifetime mismatch@2'],
  'an elided result tied to one parameter may not return another': ['struct S {\n    n: String,\n}\nimpl S {\n    fn pick(&self, o: &str) -> &str {\n        o\n    }\n}\nfn main() {}\n', 'unsupported:lifetime mismatch@6'],
  'an undeclared lifetime is E0261 at each use': ["fn f(x: &'a str) -> &'a str {\n    x\n}\nfn main() {}\n", 'E0261@1,E0261@1'],
  'an undeclared lifetime only in the result is one E0261': ["fn f(x: &str) -> &'a str {\n    x\n}\nfn main() {}\n", 'E0261@1'],
  'a returned local is still E0515': ["fn f<'a>(x: &'a str) -> &'a str {\n    let s = String::from(\"a\");\n    &s\n}\nfn main() {}\n", 'E0515@3'],
  'a lifetime with no parameter tied to it returns a literal': ["fn f<'a>(n: i32) -> &'a str {\n    if n > 0 { \"p\" } else { \"q\" }\n}\nfn main() { println!(\"{}\", f(1)); }\n", 'ok:p\n'],
  'unused lifetimes and owned results are fine': ["fn f<'a>(x: &'a str) -> String { x.to_string() }\nfn g<'a>(x: &str) -> i32 { 3 }\nfn main() { println!(\"{} {}\", f(\"a\"), g(\"b\")); }\n", 'ok:a 3\n'],
  'a named lifetime on a number reference and on a slice': ["fn max_ref<'a>(a: &'a i32, b: &'a i32) -> &'a i32 {\n    if *a > *b { a } else { b }\n}\nfn tail<'a>(v: &'a [i32], n: usize) -> &'a [i32] { &v[n..] }\nfn main() { let p = 3; let q = 9; let v = [1, 2, 3]; println!(\"{} {:?}\", max_ref(&p, &q), tail(&v, 1)); }\n", 'ok:9 [2, 3]\n'],
  'a lifetime on a reference to a struct': ['struct Person {\n    name: String,\n}\nfn name<\'a>(p: &\'a Person) -> &\'a str { &p.name }\nfn main() { let p = Person { name: String::from("Ann") }; println!("{}", name(&p)); }\n', 'ok:Ann\n'],
  'a reference with a lifetime passed through two calls keeps the String borrowed': ["fn f<'a>(x: &'a str) -> &'a str { x }\nfn main() {\n    let s = String::from(\"a\");\n    let r = f(&s);\n    let r2 = f(r);\n    let t = s;\n    println!(\"{}\", r2);\n}\n", 'E0505@6'],
  'duplicate lifetime names are not modeled': ["fn f<'a, 'a>(x: &'a str) -> &'a str { x }\nfn main() {}\n", 'unsupported:generics@1'],
  'a lifetime on a &mut is not modeled': ["fn f<'a>(x: &'a mut String, y: &'a str) -> &'a str { y }\nfn main() {}\n", 'unsupported:explicit lifetime@1'],
  'a lifetime in a let annotation is not modeled': ['fn main() {\n    let r: &\'static str = "a";\n}\n', 'unsupported:explicit lifetime@2'],
  'a named and a plain parameter with an elided result are two lifetimes: E0106': ["fn f<'a>(x: &'a str, y: &str) -> &str { x }\nfn main() {}\n", 'E0106@1'],
  'the same named lifetime twice, with an elided result, is E0106 too': ["fn f<'a>(x: &'a str, y: &'a str) -> &str { x }\nfn main() {}\n", 'E0106@1'],
  'one named parameter with an elided result is not modeled': ["fn f<'a>(x: &'a str) -> &str { x }\nfn main() {}\n", 'unsupported:lifetime elision@1'],
  'the same with two plain parameters is E0106': ["fn f<'a>(x: &str, y: &str) -> &str { x }\nfn main() {}\n", 'E0106@1'],

  'a struct holds a reference with a lifetime': [EXC + main('let novel = String::from("Call me Ishmael.");', 'let e = Excerpt { part: &novel[..4] };', 'println!("{}", e.part);'), 'ok:Call\n'],
  'a field without a lifetime is E0106': ['struct Excerpt {\n    part: &str,\n}\nfn main() {}\n', 'E0106@2'],
  'a field with an undeclared lifetime is E0261': ["struct Excerpt {\n    part: &'a str,\n}\nfn main() {}\n", 'E0261@2'],
  'a struct that holds a reference cannot outlive it (E0597)': [EXC + main('let e: Excerpt;', '{', '    let novel = String::from("Call me");', '    e = Excerpt { part: &novel };', '}', 'println!("{}", e.part);'), 'E0597@8'],
  'dropping the text while the struct lives is E0505': [EXC + main('let novel = String::from("Call me");', 'let e = Excerpt { part: &novel };', 'drop(novel);', 'println!("{}", e.part);'), 'E0505@7'],
  'writing to the text while the struct lives is E0502': [EXC + main('let mut novel = String::from("Call me");', 'let e = Excerpt { part: &novel };', 'novel.push_str("!");', 'println!("{}", e.part);'), 'E0502@7'],
  'assigning the text while the struct lives is E0506': [EXC + main('let mut novel = String::from("Call me");', 'let e = Excerpt { part: &novel };', 'novel = String::from("z");', 'println!("{}", e.part);'), 'E0506@7'],
  'the borrow ends after the last use of the struct': [EXC + main('let mut novel = String::from("Call me");', 'let e = Excerpt { part: &novel };', 'println!("{}", e.part);', 'novel.push_str("!");', 'println!("{}", novel);'), 'ok:Call me\nCall me!\n'],
  'moving the struct moves its loan': [EXC + main('let t = String::from("hi there");', 'let e = Excerpt { part: &t };', 'let f = e;', 'let u = t;', 'println!("{}", f.part);'), 'E0505@8'],
  'a struct built in a function from a local is E0515': [EXC + "fn make<'a>() -> Excerpt<'a> {\n    let s = String::from(\"a\");\n    Excerpt { part: &s }\n}\nfn main() {}\n", 'E0515@6'],
  'a struct result with an elided lifetime borrows the one parameter': [EXC + "fn make(t: &str) -> Excerpt {\n    Excerpt { part: t }\n}\nfn main() { let e = make(\"a\"); println!(\"{}\", e.part); }\n", 'ok:a\n'],
  'a struct result with no parameter to borrow from is E0106': [EXC + 'fn make() -> Excerpt {\n    Excerpt { part: "x" }\n}\nfn main() {}\n', 'E0106@4'],
  'a struct parameter and a reference parameter make two lifetimes: E0106': [EXC + 'fn first(e: &Excerpt) -> &str {\n    e.part\n}\nfn main() {}\n', 'E0106@4'],
  'an impl must name the struct\'s lifetime: E0726': [EXC + 'impl Excerpt {\n    fn level(&self) -> i32 { 3 }\n}\nfn main() {}\n', 'E0726@4'],
  'an impl with an undeclared lifetime is E0261': [EXC + "impl Excerpt<'a> {\n    fn level(&self) -> i32 { 3 }\n}\nfn main() {}\n", 'E0261@4'],
  'methods of an impl with a lifetime, and `impl Name<\'_>`': [EXC.replace('}\n', '    id: u32,\n}\n') + "impl<'a> Excerpt<'a> {\n    fn part(&self) -> &str { self.part }\n    fn id(&self) -> u32 { self.id }\n}\nimpl Excerpt<'_> {\n    fn len(&self) -> usize { self.part.len() }\n}\nfn main() {\n    let t = String::from(\"hi there\");\n    let e = Excerpt { part: &t, id: 7 };\n    println!(\"{} {} {}\", e.part(), e.id(), e.len());\n}\n", 'ok:hi there 7 8\n'],
  'a method result borrows the struct, so the text stays borrowed (E0502)': [EXC + "impl<'a> Excerpt<'a> {\n    fn part(&self) -> &str { self.part }\n}\nfn main() {\n    let mut t = String::from(\"hi\");\n    let e = Excerpt { part: &t };\n    let p = e.part();\n    t.push_str(\"x\");\n    println!(\"{}\", p);\n}\n", 'E0502@11'],
  'an associated function takes the lifetime from its argument': [EXC + "impl<'a> Excerpt<'a> {\n    fn new(part: &'a str) -> Excerpt<'a> { Excerpt { part } }\n}\nfn main() { let t = String::from(\"hi\"); let e = Excerpt::new(&t); println!(\"{}\", e.part); }\n", 'ok:hi\n'],
  'a method with a lifetime of its own': [EXC + "impl<'a> Excerpt<'a> {\n    fn pick<'b>(&self, other: &'b str) -> &'b str { other }\n}\nfn main() { let t = String::from(\"hi\"); let e = Excerpt { part: &t }; println!(\"{}\", e.pick(\"zz\")); }\n", 'ok:zz\n'],
  'a method result tied to the impl lifetime is not modeled': [EXC + "impl<'a> Excerpt<'a> {\n    fn get(&self) -> &'a str { self.part }\n}\nfn main() {}\n", 'unsupported:explicit lifetime@5'],
  'a struct that derives Debug and Copy prints its reference': ["#[derive(Debug, Clone, Copy)]\nstruct Excerpt<'a> {\n    part: &'a str,\n    n: i32,\n}\nfn main() {\n    let t = String::from(\"hello\");\n    let e = Excerpt { part: &t, n: 1 };\n    let f = e;\n    println!(\"{:?} {:?}\", e, f);\n}\n", 'ok:Excerpt { part: "hello", n: 1 } Excerpt { part: "hello", n: 1 }\n'],
  'a tuple struct holds a reference': ["struct W<'a>(&'a str, i32);\nfn main() { let t = String::from(\"a\"); let w = W(&t, 2); println!(\"{} {}\", w.0, w.1); }\n", 'ok:a 2\n'],
  'a struct holds a reference to another struct': ["struct Person {\n    name: String,\n}\nstruct Badge<'a> {\n    owner: &'a Person,\n}\nfn main() { let p = Person { name: String::from(\"Ann\") }; let b = Badge { owner: &p }; println!(\"{}\", b.owner.name); }\n", 'ok:Ann\n'],
  'a function takes structs by value and returns their field': [EXC + "fn longer<'a>(a: Excerpt<'a>, b: Excerpt<'a>) -> &'a str {\n    if a.part.len() > b.part.len() { a.part } else { b.part }\n}\nfn main() { let x = String::from(\"aaa\"); let y = String::from(\"b\"); println!(\"{}\", longer(Excerpt { part: &x }, Excerpt { part: &y })); }\n", 'ok:aaa\n'],
  'a Vec of references stays unsupported': ["struct S<'a> {\n    v: Vec<&'a str>,\n}\nfn main() {}\n", 'unsupported:struct@1'],
  'an enum with a lifetime stays unsupported': ["enum E<'a> {\n    A(&'a str),\n    B,\n}\nfn main() {}\n", 'unsupported:enum@1'],
  'a struct with two lifetimes stays unsupported': ["struct H<'a, 'b> {\n    a: &'a str,\n    b: &'b str,\n}\nfn main() {}\n", 'unsupported:struct@1'],
  'a &mut field stays unsupported': ["struct S<'a> {\n    r: &'a mut String,\n}\nfn main() {}\n", 'unsupported:struct@1'],
  'a lifetime bound stays unsupported': ["fn f<'a: 'b, 'b>(x: &'a str, y: &'b str) -> &'b str { x }\nfn main() {}\n", 'unsupported:lifetime bound@1'],
  'assigning a whole struct frees what its field held': [EXC + main('let mut s = String::from("a");', 'let r: &str = &s;', 'let mut e = Excerpt { part: "x" };', 'e.part = r;', 'e = Excerpt { part: "y" };', 's.push_str("x");', 'println!("{}", e.part);'), 'ok:y\n'],
  'the same when the field was set in an inner block': [EXC + main('let mut s = String::from("a");', 'let mut e = Excerpt { part: "x" };', '{', '    let r: &str = &s;', '    e.part = r;', '}', 'e = Excerpt { part: "y" };', 's.push_str("x");', 'println!("{}", e.part);'), 'ok:y\n'],
  'a field set to a borrow still holds it: E0502': [EXC + main('let mut s = String::from("a");', 'let mut e = Excerpt { part: "x" };', 'e.part = &s[..];', 's.push_str("x");', 'println!("{}", e.part);'), 'E0502@8'],
  'a field set to a borrow still holds it: E0505': [EXC + main('let s = String::from("a");', 'let mut e = Excerpt { part: "x" };', 'e.part = &s[..];', 'drop(s);', 'println!("{}", e.part);'), 'E0505@8'],
  'a struct argument of the static lifetime is not modeled': [EXC + "fn f(e: Excerpt<'static>) { println!(\"{}\", e.part); }\nfn main() { f(Excerpt { part: \"a\" }); }\n", 'unsupported:explicit lifetime@4'],
  'an impl for the static lifetime is not modeled': [EXC + "impl Excerpt<'static> {\n    fn lvl(&self) -> i32 { 1 }\n}\nfn main() {}\n", 'unsupported:explicit lifetime@4'],
  'a &str read through a reference keeps the text borrowed (E0505)': [EXC + main('let s = String::from("a");', 'let e = Excerpt { part: &s };', 'let r = &e;', 'let p = r.part;', 'drop(s);', 'println!("{}", p);'), 'E0505@9'],
  'a &str read through a reference is fine when unused afterwards': [EXC + main('let s = String::from("a");', 'let e = Excerpt { part: &s };', 'let r = &e;', 'let p = r.part;', 'println!("{}", p);', 'drop(s);'), 'ok:a\n'],
  'a &str field of a plain reference parameter cannot be returned: E0621': [EXC + "fn f<'a>(x: &'a str, y: &Excerpt) -> &'a str { y.part }\nfn main() {}\n", 'E0621@4'],
  'the same with an anonymous struct lifetime': [EXC + "fn f<'a>(x: &'a str, y: &Excerpt<'_>) -> &'a str { y.part }\nfn main() {}\n", 'E0621@4'],
  'a &str field of a parameter that carries the lifetime may be returned': [EXC + "fn f<'a>(e: &'a Excerpt<'a>) -> &'a str { let p = e.part; p }\nfn main() { let s = String::from(\"q\"); let e = Excerpt { part: &s }; println!(\"{}\", f(&e)); }\n", 'ok:q\n'],
  'a &str field read from another lifetime is rustc\'s code-less error: unsupported': [EXC + "fn f<'a, 'b>(e: &'a Excerpt<'a>, o: &'b Excerpt<'b>) -> &'a str {\n    let p = o.part;\n    p\n}\nfn main() {}\n", 'unsupported:lifetime mismatch@6'],
  'a constructor that returns Self keeps the text borrowed (E0502)': [EXC + "impl<'a> Excerpt<'a> {\n    fn new(p: &'a str) -> Self { Excerpt { part: p } }\n}\n" + main('let mut s = String::from("a");', 'let e = Excerpt::new(&s);', 's.push_str("x");', 'println!("{}", e.part);'), 'E0502@10'],
  'a plain parameter cannot go into Self: E0621': [EXC + "impl<'a> Excerpt<'a> {\n    fn new3(p: &str) -> Self { Excerpt { part: p } }\n}\nfn main() {}\n", 'E0621@5'],
  'a constructor and a method that return Self': [EXC + "impl<'a> Excerpt<'a> {\n    fn new(p: &'a str) -> Self { Excerpt { part: p } }\n    fn part(&self) -> &str { self.part }\n}\n" + main('let s = String::from("Call me Ishmael.");', 'let e = Excerpt::new(&s[..4]);', 'println!("{}", e.part());', 'drop(s);'), 'ok:Call\n'],
  '`Self` in an `impl Name<\'_>` signature is not modeled': [EXC + "impl Excerpt<'_> {\n    fn new(p: &str) -> Self { Excerpt { part: p } }\n}\nfn main() {}\n", 'unsupported:explicit lifetime@5'],
  'a field that holds a struct with a lifetime needs one: E0106': [EXC + 'struct O {\n    e: Excerpt,\n}\nfn main() {}\n', 'E0106@5'],
  'an anonymous lifetime in a field is E0106': [EXC + "struct O<'a> {\n    e: Excerpt<'_>,\n}\nfn main() {}\n", 'E0106@5'],
  'a field that names the lifetime of the struct it holds': [EXC + "struct O<'a> {\n    e: Excerpt<'a>,\n}\nfn main() {}\n", 'ok:'],
  'a lifetime no field uses is E0392': ["struct S<'a> {\n    n: i32,\n}\nfn main() {}\n", 'E0392@1'],
  'a &String assigned to a &str field is not modeled': [EXC + main('let b = String::from("a");', 'let mut e = Excerpt { part: "x" };', 'e.part = &b;', 'println!("{}", e.part);'), 'unsupported:assigned string reference@7'],
  'the slice and as_str spellings of it are': [EXC + main('let b = String::from("a");', 'let mut e = Excerpt { part: "x" };', 'e.part = &b[..];', 'println!("{}", e.part);', 'e.part = b.as_str();', 'println!("{}", e.part);'), 'ok:a\na\n'],
};

describe('lifetimes: verdicts agree with rustc', () => {
  for (const [name, [src, want]] of Object.entries(ROWS)) it(name, () => assert.equal(verdict(src), want));
});

describe('lifetimes: loans through a struct', () => {
  it('the loan on the text spans from the struct literal to the last use of the struct', () => {
    const c = RQ.run(EXC + main('let t = String::from("hi");', 'let e = Excerpt { part: &t };', 'println!("{}", e.part);', 'println!("{}", t);'));
    assert.equal(c.status, 'ok');
    const l = c.loans.find((x) => x.local === 't' && !x.implicit);
    assert.equal(l.span.join(','), '6,7');
  });
});

describe('lifetimes: the checker never throws on odd shapes', () => {
  const shapes = [
    "fn f<'a>(x: &'a [i32; 3]) -> &'a i32 { &x[0] }\nfn main() {}\n",
    "struct S;\nimpl<'a> S {\n    fn f(&self) -> i32 { 1 }\n}\nfn main() {}\n",
    "fn f<'a>(x: &'a &str) -> &'a str { x }\nfn main() {}\n",
    "fn f<'a>(x: Option<&'a str>) -> Option<&'a str> { x }\nfn main() {}\n",
    "struct S<'a> { r: &'a str }\nfn f<'a>(s: &'a S<'a>) -> &'a str { s.r }\nfn main() {}\n",
    "struct S<'a> { r: &'a str }\nstruct T<'a> { s: S<'a> }\nfn main() {}\n",
    "fn f<'a>(x: &'a str) where 'a: 'static {}\nfn main() {}\n",
  ];
  for (const src of shapes) it(src.split('\n')[0], () => assert.notEqual(RQ.run(src).status, 'internal'));
  it('a very deep type is a limit, not a stack overflow', () => {
    for (const n of [500, 20000]) {
      const t = "&'a ".repeat(n) + 'str';
      assert.notEqual(RQ.run(`fn f<'a>(x: ${t}) -> &'a str { "a" }\nfn main() {}\n`).status, 'internal');
    }
  });
});
