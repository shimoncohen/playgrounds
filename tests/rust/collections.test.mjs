import { describe, it } from 'node:test';
import strict from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const assert = { ...strict, deepEqual: (a, b, msg) => strict.equal(JSON.stringify(a), JSON.stringify(b), msg) };
const RQ = loadRust();
const P = (...lines) => lines.join('\n') + '\n';
const main = (...body) => P('fn main() {', ...body.map((l) => '    ' + l), '}');
const USE = 'use std::collections::HashMap;';
const ids = (c) => c.errors.map((e) => `${e.code || e.lint}@${e.line}`).join(',');
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src + JSON.stringify(c.errors)); return `${c.unsupported.feature}@${c.unsupported.line}`; };
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', src + JSON.stringify(c.errors) + JSON.stringify(c.unsupportedAll) + (c.message || '')); return c.stdout; };
const { T, has, show, hasRef, isCopy, unify } = RQ.types;
const vec = (el) => T.coll('Vec', [el]);
const map = (k, v) => T.coll('HashMap', [k, v]);
const NOISY = ['struct N {', '    id: i32,', '}', 'impl Drop for N {', '    fn drop(&mut self) {', '        println!("drop {}", self.id);', '    }', '}'];

describe('Vec as a type', () => {
  it('Vec::new, vec![..] and an annotation all give the same type, and push fixes an open element type', () => {
    assert.equal(out(main('let mut v = Vec::new();', 'v.push(1);', 'v.push(2);', 'println!("{:?} {}", v, v.len());')), '[1, 2] 2\n');
    assert.equal(out(main('let v: Vec<u8> = vec![1, 2, 3];', 'let e: Vec<String> = Vec::new();', 'let z: Vec<i32> = vec![];', 'println!("{:?} {:?} {:?} {}", v, e, z, z.is_empty());')), '[1, 2, 3] [] [] true\n');
    assert.equal(out(main('let v = vec![0; 3];', 'let w = vec![String::from("a"); 2];', 'println!("{:?} {:?}", v, w);')), '[0, 0, 0] ["a", "a"]\n');
    assert.equal(out(P('fn count(v: &Vec<i32>) -> usize {', '    v.len()', '}', 'fn add(v: &mut Vec<i32>, x: i32) {', '    v.push(x);', '}',
      'fn make() -> Vec<i32> {', '    vec![7]', '}', 'fn main() {', '    let mut v = make();', '    add(&mut v, 8);', '    println!("{} {:?}", count(&v), v);', '}')), '2 [7, 8]\n');
  });
  it('prints plain and pretty, nested and with structs inside', () => {
    assert.equal(out(P('#[derive(Debug)]', 'struct P {', '    n: i32,', '}', 'fn main() {', '    let v = vec![P { n: 1 }];', '    let n = vec![vec![1], vec![]];', '    println!("{:?} {:?}", v, n);', '    println!("{:#?}", v);', '}')),
      '[P { n: 1 }] [[1], []]\n[\n    P {\n        n: 1,\n    },\n]\n');
  });
  it('the element type is checked, and an unfixed one is unsupported with a hint', () => {
    const c = RQ.run(main('let mut v = Vec::new();', 'v.push(1);', 'v.push(String::new());'));
    assert.equal(ids(c), 'E0308@4');
    assert.equal(c.errors[0].msg, 'mismatched types: expected integer, found `String`');
    assert.equal(feature(main('let v: Vec<String> = vec![1];')), 'type checking@2');
    assert.equal(feature(main('let v = Vec::new();', 'println!("{}", v.len());')), 'inferred type@2');
    assert.equal(feature(main('let v = vec![];')), 'inferred type@2');
  });
  it('a reference never goes into a collection, since its loan would not be tracked', () => {
    assert.equal(feature(main('let v: Vec<&str> = Vec::new();')), 'reference in collection@2');
    assert.equal(feature(main('let x = 1;', 'let mut v = Vec::new();', 'v.push(&x);')), 'reference in collection@4');
    assert.equal(feature(main('let v = vec!["a"];')), 'reference in collection@2');
    assert.equal(feature(P('struct S {', '    v: Vec<&str>,', '}', 'fn main() {}')), 'struct@1');
  });
  it('shapes that are not modeled say so', () => {
    assert.equal(feature(main('let v: Vec = Vec::new();')), 'Vec@2');
    assert.equal(feature(main('let v: Vec<i32, i32> = Vec::new();')), 'Vec@2');
    assert.equal(feature(main('let v = Vec::<i32>::new();')), 'path call@2');
    assert.equal(feature(main('let v: Vec<i32> = Vec::with_capacity(2);')), 'path call@2');
    assert.equal(feature(main('let v = vec![1, 2];', 'let x = v[0];')), 'collection method@3');
    assert.equal(feature(main('let v = vec![1, 2];', 'for x in v {}')), 'collection method@3');
    assert.equal(feature(main('let v = vec![1, 2];', 'let x = v.pop();')), 'collection method@3');
  });
  it('a recursive type through a Vec has a size, and a Vec of big arrays counts as one value', () => {
    assert.equal(out(P('struct Node {', '    kids: Vec<Node>,', '}', 'fn main() {', '    let n = Node { kids: vec![Node { kids: vec![] }] };', '    println!("{}", n.kids.len());', '}')), '1\n');
    assert.equal(out(P('struct Big {', '    v: Vec<[i32; 10000]>,', '}', 'fn main() {', '    let b = Big { v: Vec::new() };', '    println!("{}", b.v.len());', '}')), '0\n');
    assert.equal(feature(main('let v: Vec<[i32; 10001]> = Vec::new();')), 'array length@2');
  });
});

describe('Vec owns its elements', () => {
  it('a move ends the old name (E0382) and a push moves the element in', () => {
    assert.equal(ids(RQ.run(main('let v = vec![1];', 'let w = v;', 'println!("{}", v.len());'))), 'E0382@4');
    assert.equal(ids(RQ.run(main('let mut v = Vec::new();', 'let s = String::from("a");', 'v.push(s);', 'println!("{}", s);'))), 'E0382@5');
    assert.equal(ids(RQ.run(main('let mut v = Vec::new();', 'v.push(1);', 'let w = v;', 'v.push(2);'))), 'E0382@5');
  });
  it('push needs a mutable binding or a &mut parameter', () => {
    assert.equal(ids(RQ.run(main('let v = Vec::new();', 'v.push(1);'))), 'E0596@3');
    assert.equal(ids(RQ.run(P('fn add(v: &Vec<i32>) {', '    v.push(1);', '}', 'fn main() {}'))), 'E0596@2');
  });
  it('a push whose argument reads the same Vec is the two-phase borrow, left unsupported', () => {
    assert.equal(feature(main('let mut v = vec![1];', 'v.push(v.len());')), 'two-phase borrow@3');
  });
  it('dropping a Vec drops its elements in order, then frees it', () => {
    const c = RQ.run(P(...NOISY, 'fn main() {', '    let mut v = Vec::new();', '    v.push(N { id: 1 });', '    v.push(N { id: 2 });', '    println!("made");', '}'));
    assert.equal(c.stdout, 'made\ndrop 1\ndrop 2\n');
    assert.equal(c.allocs('Vec'), 1);
    assert.equal(c.events.filter((e) => e.t === 'free').length, 1);
  });
  it('a Vec of Strings frees every String it holds', () => {
    const c = RQ.run(main('let v = vec![String::from("a"), String::from("b")];', 'println!("{}", v.len());'), { snap: true });
    assert.equal(c.events.filter((e) => e.t === 'free').length, 3);
    assert.equal(c.allocs('String'), 2);
  });
  it('a moved Vec is dropped once, by its new owner', () => {
    const c = RQ.run(P(...NOISY, 'fn eat(v: Vec<N>) {', '    println!("eat");', '}', 'fn main() {', '    let v = vec![N { id: 1 }];', '    eat(v);', '    println!("after");', '}'));
    assert.equal(c.stdout, 'eat\ndrop 1\nafter\n');
  });
  it('assigning over a Vec drops the old one', () => {
    const c = RQ.run(P(...NOISY, 'fn main() {', '    let mut v = vec![N { id: 1 }];', '    v = Vec::new();', '    println!("end");', '}'));
    assert.equal(c.stdout, 'drop 1\nend\n');
  });
  it('a temporary Vec drops at the end of its statement', () => {
    const c = RQ.run(P(...NOISY, 'fn main() {', '    let n = vec![N { id: 1 }].len();', '    println!("{}", n);', '}'));
    assert.equal(c.stdout, 'drop 1\n1\n');
  });
});

describe('Vec memory view', () => {
  it('the heap box lists the elements, a String element is a pointer with the Vec as its owner, and the stack slot is one pointer', () => {
    const c = RQ.run(main('let mut v = Vec::new();', 'v.push(String::from("a"));', 'println!("{}", v.len());'), { snap: true });
    const last = c.snaps[c.snaps.length - 2];
    const vec1 = last.heap.find((h) => h.kind === 'Vec'), str = last.heap.find((h) => h.kind === 'String');
    assert.equal(vec1.content, `[pointer to #${str.id}]`);
    assert.equal(vec1.owner, 'v');
    assert.equal(str.owner, 'v[0]');
    const v = last.frames[0].vars.find((x) => x.name === 'v');
    assert.equal(v.ty, 'Vec<String>');
    assert.deepEqual(v.leaves.filter((l) => !l.hidden).map((l) => l.heap), [vec1.id]);
  });
  it('a Vec that never grew shows empty, and its allocation event says it takes no heap memory', () => {
    const c = RQ.run(main('let v: Vec<i32> = Vec::new();', 'println!("{}", v.len());'), { snap: true });
    assert.equal(c.snaps.at(-2).heap[0].content, '');
    assert.equal(c.events.find((e) => e.t === 'alloc').empty, true);
  });
  it('a field of a struct that holds a Vec is a pointer too, and the box has the field as owner', () => {
    const c = RQ.run(P('struct S {', '    v: Vec<i32>,', '}', 'fn main() {', '    let s = S { v: vec![1, 2] };', '    println!("{}", s.v.len());', '}'), { snap: true });
    const h = c.snaps.at(-2).heap[0];
    assert.equal(h.content, '[1, 2]');
    assert.equal(h.owner, 's.v');
  });
});

describe('HashMap memory view', () => {
  const map2 = (...ins) => RQ.run(P(USE, 'fn main() {', '    let mut m = HashMap::new();', ...ins.map((l) => '    ' + l), '    let n = m.len();', '}'), { snap: true });
  it('shows entries in key order, so inserting b then a looks the same as a then b', () => {
    const ab = map2('m.insert(1, 10);', 'm.insert(2, 20);'), ba = map2('m.insert(2, 20);', 'm.insert(1, 10);');
    assert.equal(ab.snaps.at(-2).heap[0].content, '{1: 10, 2: 20}');
    assert.equal(ba.snaps.at(-2).heap[0].content, '{1: 10, 2: 20}');
  });
  it('the String values of a map are freed in key order whichever was inserted first', () => {
    const freed = (...ins) => {
      const c = map2(...ins);
      const first = c.snaps.find((x) => x.heap.some((h) => h.kind === 'String' && h.content === 'x'));
      const xid = first.heap.find((h) => h.content === 'x').id;
      return c.events.filter((e) => e.t === 'free').map((e) => (e.id === xid ? 'x' : 'other')).join(',');
    };
    const ab = freed('m.insert(1, String::from("x"));', 'm.insert(2, String::from("y"));'), ba = freed('m.insert(2, String::from("y"));', 'm.insert(1, String::from("x"));');
    assert.equal(ab, 'x,other,other');
    assert.equal(ba, ab);
  });
  it('an owner reads as the value of a key, not as a Vec index', () => {
    const c = map2('m.insert(1, String::from("x"));');
    assert.equal(c.snaps.at(-2).heap.find((h) => h.kind === 'String').owner, 'm[value of key 1]');
  });
});

describe('deep nesting', () => {
  const deep = (tail) => P('#[derive(Clone, Debug, PartialEq, PartialOrd)]', 'struct N {', '    k: Vec<N>,', '}', 'fn main() {', '    let mut n = N { k: Vec::new() };', '    let mut i = 0;', '    while i < 2000 {', '        n = N { k: vec![n] };', '        i += 1;', '    }', tail, '}');
  for (const tail of ['', '    let c = n.clone();', '    let e = n == n;', '    let o = n < n;', '    println!("{:?}", n);']) {
    it(`stops with a limit instead of an internal error: ${tail.trim() || 'drop at the end'}`, () => {
      const c = RQ.run(deep(tail));
      assert.equal(c.status, 'limit');
      assert.equal(c.limit, 'nesting');
    });
  }
});

describe('Clone, Debug and PartialEq lookup on collections', () => {
  it('clone is deep: a new heap record, independent contents', () => {
    const c = RQ.run(main('let mut v = vec![String::from("a")];', 'let w = v.clone();', 'v.push(String::from("b"));', 'println!("{:?} {:?} {}", v, w, v == w);'));
    assert.equal(c.stdout, '["a", "b"] ["a"] false\n');
    assert.equal(c.allocs('Vec'), 2);
  });
  it('== compares element by element', () => {
    assert.equal(out(main('let a = vec![1, 2];', 'let b = vec![1, 2];', 'let c: Vec<i32> = Vec::new();', 'println!("{} {} {}", a == b, a != b, a == c);')), 'true false false\n');
  });
  it('a missing trait on the element is an error at the use, worded as rustc words it', () => {
    const k = (...body) => RQ.run(P('struct K(i32);', 'fn main() {', ...body.map((l) => '    ' + l), '}'));
    const e = (c) => c.errors[0].msg;
    const c1 = k('let v = vec![K(1)];', 'println!("{:?}", v);');
    assert.equal(ids(c1), 'E0277@4');
    assert.equal(e(c1), '`K` doesn\'t implement `Debug`');
    const c2 = k('let v = vec![K(1)];', 'let w = vec![K(1)];', 'println!("{}", v == w);');
    assert.equal(ids(c2), 'E0369@5');
    assert.equal(e(c2), 'binary operation `==` cannot be applied to type `Vec<K>`');
    const c3 = k('let v = vec![K(1)];', 'let w = v.clone();');
    assert.equal(ids(c3), 'E0599@4');
    assert.equal(e(c3), 'the method `clone` exists for struct `Vec<K>`, but its trait bounds were not satisfied');
    const c4 = RQ.run(main('let v = vec![1];', 'println!("{}", v);'));
    assert.equal(ids(c4), 'E0277@3');
    assert.equal(c4.errors[0].msg, '`Vec<{integer}>` doesn\'t implement `std::fmt::Display`');
  });
  it('cloning a Vec whose element type is still open waits for the type instead of guessing', () => {
    const src = main('let v = Vec::new();', 'let w = v.clone();');
    assert.equal(feature(src), 'inferred type@2');
    assert.deepEqual(RQ.compile(src).diags, []);
  });
  it('cloning a reference to a Vec of a non-Clone element copies the reference, as rustc does', () => {
    assert.equal(out(P('struct K(i32);', 'fn main() {', '    let v = vec![K(1)];', '    let r = &v;', '    let q = r.clone();', '    println!("{}", q.len());', '}')), '1\n');
  });
  it('big Vecs stop at the step limit on clone and ==, and a huge count stops before it allocates', () => {
    const big = (body) => RQ.run(main('let v = vec![[0; 10000]; 8];', ...body));
    assert.equal(big(['let w = v.clone();', 'let x = w.clone();', 'let y = x.clone();', 'println!("{}", y.len());']).limit, 'steps');
    assert.equal(big(['let mut n = 0;', 'while n < 20 {', '    let w = v.clone();', '    n += 1;', '}']).limit, 'steps');
    assert.equal(RQ.run(main('let v = vec![0; 1000000];', 'println!("{}", v.len());')).limit, 'steps');
    assert.equal(RQ.run(main('let a = vec![[0; 10000]; 5];', 'let b = vec![[0; 10000]; 5];', 'println!("{}", a == b);')).limit, 'steps');
  });
  it('a vec![x; n] count must be a usize', () => {
    assert.equal(ids(RQ.run(main('let n: i32 = 2;', 'let v = vec![0; n];'))), 'E0308@3');
  });
});

describe('HashMap', () => {
  it('needs the use, and the one use modeled is the std one', () => {
    assert.equal(feature(main('let m: HashMap<i32, i32> = HashMap::new();')), 'HashMap@2');
    assert.equal(feature(main('let m = HashMap::<i32, i32>::new();')), 'path call@2');
    assert.equal(feature(P('use std::collections::BTreeMap;', 'fn main() {}')), 'BTreeMap@1');
    assert.equal(feature(P(USE, USE, 'fn main() {}')), 'use@1');
    assert.equal(out(P(USE, 'fn main() {', '    let m: HashMap<i32, i32> = HashMap::new();', '    println!("{}", m.len());', '}')), '0\n');
  });
  it('insert returns the old value as an Option and keeps the first key', () => {
    assert.equal(out(P(USE, 'fn main() {', '    let mut m = HashMap::new();', '    let a = m.insert(String::from("k"), 1);', '    let b = m.insert(String::from("k"), 2);', '    println!("{:?} {:?} {} {:?}", a, b, m.len(), m);', '}')), 'None Some(1) 1 {"k": 2}\n');
  });
  it('the key and the value move into the map', () => {
    assert.equal(ids(RQ.run(P(USE, 'fn main() {', '    let mut m = HashMap::new();', '    let k = String::from("a");', '    m.insert(k, 1);', '    println!("{}", k);', '}'))), 'E0382@6');
  });
  it('a map with no entries or one prints, and with two or more is unsupported: rustc\'s order changes from run to run', () => {
    assert.equal(out(P(USE, 'fn main() {', '    let mut m: HashMap<i32, i32> = HashMap::new();', '    println!("{:?}", m);', '    m.insert(1, 2);', '    println!("{:?} {:#?}", m, m);', '}')), '{}\n{1: 2} {\n    1: 2,\n}\n');
    const c = RQ.run(P(USE, 'fn main() {', '    let mut m = HashMap::new();', '    m.insert(1, 2);', '    m.insert(3, 4);', '    println!("{:?}", m);', '}'));
    assert.equal(c.status, 'unsupported');
    assert.equal(c.unsupported.feature, 'hash map order');
    assert.equal(c.unsupported.line, 6);
    assert.ok(RQ.diag.hint('hash map order').length > 20);
  });
  it('dropping a map of two or more values with a Drop impl is unsupported, one value is not', () => {
    const two = (n) => RQ.run(P(USE, ...NOISY, 'fn main() {', '    let mut m = HashMap::new();', ...Array.from({ length: n }, (_, i) => `    m.insert(${i}, N { id: ${i} });`), '}'));
    assert.equal(two(1).stdout, 'drop 0\n');
    assert.equal(two(2).status, 'unsupported');
    assert.equal(two(2).unsupported.feature, 'hash map order');
  });
  it('a map of Strings drops without a Drop impl in two or more entries', () => {
    assert.equal(RQ.run(P(USE, 'fn main() {', '    let mut m = HashMap::new();', '    m.insert(String::from("a"), String::from("x"));', '    m.insert(String::from("b"), String::from("y"));', '    println!("{}", m.len());', '}')).status, 'ok');
  });
  it('== ignores the order of the entries, and clone is deep', () => {
    assert.equal(out(P(USE, 'fn main() {', '    let mut a = HashMap::new();', '    let mut b = HashMap::new();', '    a.insert(1, 10);', '    a.insert(2, 20);', '    b.insert(2, 20);', '    b.insert(1, 10);',
      '    let c = a.clone();', '    b.insert(3, 30);', '    println!("{} {} {}", a == c, a == b, c.len());', '}')), 'true false 2\n');
  });
  it('a key without Eq and Hash is E0599 on insert, as rustc words it, where the key type is known', () => {
    const c = RQ.run(P(USE, 'fn main() {', '    let mut m: HashMap<f64, i32> = HashMap::new();', '    m.insert(1.0, 2);', '}'));
    assert.equal(ids(c), 'E0599@4');
    assert.equal(c.errors[0].msg, 'the method `insert` exists for struct `HashMap<f64, i32>`, but its trait bounds were not satisfied');
    assert.equal(ids(RQ.run(P(USE, '#[derive(PartialEq)]', 'struct K(i32);', 'fn main() {', '    let mut m: HashMap<K, i32> = HashMap::new();', '    m.insert(K(1), 2);', '}'))), 'E0599@6');
    assert.equal(out(P(USE, '#[derive(PartialEq, Eq, Hash)]', 'struct K(i32);', 'fn main() {', '    let mut m: HashMap<K, i32> = HashMap::new();', '    m.insert(K(1), 2);', '    println!("{}", m.len());', '}')), '1\n');
  });
  it('a key whose type is settled only by the insert is judged when the fn ends, and unsupported if it lacks Eq or Hash', () => {
    assert.equal(feature(P(USE, 'fn main() {', '    let mut m = HashMap::new();', '    m.insert(1.5, 2);', '}')), 'hash key@4');
    assert.equal(out(P(USE, 'fn main() {', '    let mut m = HashMap::new();', '    m.insert(1, 2.5);', '    println!("{}", m.len());', '}')), '1\n');
  });
  it('== on maps needs a key that is Eq and Hash', () => {
    const c = RQ.run(P(USE, '#[derive(PartialEq)]', 'struct K(i32);', 'fn main() {', '    let a: HashMap<K, i32> = HashMap::new();', '    let b: HashMap<K, i32> = HashMap::new();', '    println!("{}", a == b);', '}'));
    assert.equal(ids(c), 'E0369@7');
    assert.equal(c.errors[0].msg, 'binary operation `==` cannot be applied to type `HashMap<K, i32>`');
  });
  it('clone on a map whose value lacks Clone is E0599, and a map is never Display or ordered', () => {
    assert.equal(ids(RQ.run(P(USE, 'struct V;', 'fn main() {', '    let m: HashMap<i32, V> = HashMap::new();', '    let n = m.clone();', '}'))), 'E0599@5');
    assert.equal(ids(RQ.run(P(USE, 'fn main() {', '    let m: HashMap<i32, i32> = HashMap::new();', '    println!("{}", m);', '}'))), 'E0277@4');
    assert.equal(ids(RQ.run(P(USE, 'fn main() {', '    let a: HashMap<i32, i32> = HashMap::new();', '    let b: HashMap<i32, i32> = HashMap::new();', '    println!("{}", a < b);', '}'))), 'E0369@5');
  });
  it('shapes that are not modeled say so', () => {
    assert.equal(feature(P(USE, 'fn main() {', '    let m: HashMap<i32> = HashMap::new();', '}')), 'HashMap@3');
    assert.equal(feature(P(USE, 'fn main() {', '    let m: HashMap<i32, &str> = HashMap::new();', '}')), 'reference in collection@3');
    assert.equal(feature(P(USE, 'fn main() {', '    let mut m: HashMap<i32, i32> = HashMap::new();', '    m.get(&1);', '}')), 'collection method@4');
    assert.equal(feature(P(USE, 'fn main() {', '    let m: HashMap<i32, i32> = HashMap::new();', '    for x in m {}', '}')), 'collection method@4');
  });
});

describe('derives: PartialOrd, Ord, Default, Hash', () => {
  const SORT = ['#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Clone, Copy)]', 'struct Ver {', '    major: i32,', '    minor: i32,', '}'];
  it('a struct orders by its fields in declaration order', () => {
    assert.equal(out(P(...SORT, 'fn main() {', '    let a = Ver { major: 1, minor: 9 };', '    let b = Ver { major: 2, minor: 0 };', '    let c = Ver { major: 2, minor: 1 };',
      '    println!("{} {} {} {} {}", a < b, b < c, c <= c, a > c, b >= c);', '}')), 'true true true false false\n');
  });
  it('an enum orders by variant first, then by payload', () => {
    assert.equal(out(P('#[derive(PartialEq, PartialOrd)]', 'enum E {', '    Low,', '    Mid(i32),', '    High { n: i32 },', '}', 'fn main() {', '    println!("{} {} {}", E::Low < E::Mid(0), E::Mid(5) < E::Mid(6), E::High { n: 0 } < E::Mid(9));',
      '    println!("{} {}", E::Mid(2) < E::Mid(1), E::Low >= E::Low);', '}')), 'true true false\nfalse true\n');
  });
  it('Option and Result order as rustc does, None before Some and Ok before Err', () => {
    assert.equal(out(main('let a: Option<i32> = None;', 'let b = Some(1);', 'let c: Result<i32, i32> = Ok(5);', 'let d: Result<i32, i32> = Err(0);', 'println!("{} {} {} {}", a < b, b < Some(2), c < d, Some(3) > None);')), 'true true true true\n');
  });
  it('a float field makes the order partial: NaN is unordered, so every comparison is false', () => {
    assert.equal(out(P('#[derive(PartialEq, PartialOrd)]', 'struct F(f64);', 'fn main() {', '    let n = F(0.0 / 0.0);', '    let o = F(1.0);', '    println!("{} {} {} {}", n < o, n > o, n <= o, o < F(2.0));', '}')), 'false false false true\n');
  });
  it('Vecs order lexicographically, a shorter prefix first', () => {
    assert.equal(out(main('let a = vec![1, 2];', 'let b = vec![1, 2, 0];', 'let c = vec![1, 3];', 'println!("{} {} {}", a < b, b < c, c > a);')), 'true true true\n');
  });
  it('comparing a type that does not derive PartialOrd is E0369, and the paired derive makes it compile', () => {
    const src = (d) => P(d, 'struct S(i32);', 'fn main() {', '    println!("{}", S(1) < S(2));', '}');
    const c = RQ.run(src('#[derive(PartialEq)]'));
    assert.equal(ids(c), 'E0369@4');
    assert.equal(c.errors[0].msg, 'binary operation `<` cannot be applied to type `S`');
    assert.equal(out(src('#[derive(PartialEq, PartialOrd)]')), 'true\n');
  });
  it('derive traits that need others are unsupported until the others are derived too', () => {
    assert.equal(feature(P('#[derive(PartialOrd)]', 'struct S(i32);', 'fn main() {}')), 'derive@2');
    assert.equal(feature(P('#[derive(PartialEq, PartialOrd, Ord)]', 'struct S(i32);', 'fn main() {}')), 'derive@2');
    assert.equal(feature(P('#[derive(PartialEq, Eq, PartialOrd, Ord)]', 'struct S(f64);', 'fn main() {}')), 'derive@2');
    assert.equal(feature(P('#[derive(Hash)]', 'struct S(f64);', 'fn main() {}')), 'derive@2');
    assert.equal(out(P('#[derive(PartialEq, Eq, PartialOrd, Ord, Hash)]', 'struct S(i32, String);', 'fn main() {', '    println!("ok");', '}')), 'ok\n');
    assert.equal(feature(P('#[derive(Hash)]', 'struct S {', '    v: Vec<f64>,', '}', 'fn main() {}')), 'derive@2');
  });
  it('Default gives zero, false, the empty string, None and an empty Vec, field by field', () => {
    assert.equal(out(P('#[derive(Debug, Default)]', 'struct Inner(u8, bool);', '#[derive(Debug, Default)]', 'struct Cfg {', '    n: i32,', '    f: f64,', '    s: String,', '    o: Option<Inner>,', '    v: Vec<i32>,', '    t: (i32, bool),', '    a: [i32; 3],', '    i: Inner,', '}',
      'fn main() {', '    println!("{:?}", Cfg::default());', '}')), 'Cfg { n: 0, f: 0.0, s: "", o: None, v: [], t: (0, false), a: [0, 0, 0], i: Inner(0, false) }\n');
  });
  it('an enum derives Default from its #[default] unit variant, and without one the derive is unsupported', () => {
    const e = (attr, derive = '#[derive(Debug, Default)]') => P(derive, 'enum E {', '    A,', `    ${attr}`, '    B,', '}', 'fn main() {', '    println!("{:?}", E::default());', '}');
    assert.equal(out(e('#[default]')), 'B\n');
    assert.equal(feature(e('')), 'derive@2');
    assert.equal(feature(e('#[default]', '#[derive(Debug)]')), 'derive@2');
    assert.equal(feature(P('#[derive(Default)]', 'enum E {', '    #[default]', '    A(i32),', '}', 'fn main() {}')), 'derive@2');
  });
  it('Default needs every field to have it, and calling default on a type without it is E0599', () => {
    assert.equal(feature(P('struct A;', '#[derive(Default)]', 'struct B {', '    a: A,', '}', 'fn main() {}')), 'derive@3');
    const c = RQ.run(P('struct S {', '    n: i32,', '}', 'fn main() {', '    let s = S::default();', '}'));
    assert.equal(ids(c), 'E0599@5');
    assert.equal(c.errors[0].msg, 'no associated function or constant named `default` found for struct `S` in the current scope');
  });
  it('a user fn named default wins over the derive\'s, and a derived struct is a HashMap key', () => {
    assert.equal(out(P('#[derive(Default)]', 'struct S {', '    n: i32,', '}', 'impl S {', '    fn default() -> S {', '        S { n: 7 }', '    }', '}', 'fn main() {', '    let s = S::default();', '    println!("{}", s.n);', '}')), '7\n');
    assert.equal(out(P(USE, '#[derive(PartialEq, Eq, Hash, Debug)]', 'struct K {', '    id: u32,', '    tag: String,', '}', 'fn main() {', '    let mut m = HashMap::new();', '    m.insert(K { id: 1, tag: String::from("a") }, 1);',
      '    let old = m.insert(K { id: 1, tag: String::from("a") }, 2);', '    println!("{:?} {}", old, m.len());', '}')), 'Some(1) 1\n');
  });
});

describe('the trait lookup on type objects', () => {
  const S = (der) => T.struct('S', der);
  it('Vec: every trait but Copy follows the element, and Default always holds', () => {
    for (const tr of ['Clone', 'Debug', 'PartialEq', 'Eq', 'PartialOrd', 'Ord', 'Hash']) {
      assert.equal(has(vec(T.int('i32')), tr), true, tr);
      assert.equal(has(vec(S([])), tr), false, tr);
      assert.equal(has(vec(S([tr])), tr), true, tr);
    }
    assert.equal(has(vec(T.float), 'Eq'), false);
    assert.equal(has(vec(T.float), 'PartialOrd'), true);
    assert.equal(has(vec(S([])), 'Default'), true);
    assert.equal(has(vec(T.int('i32')), 'Copy'), false);
    assert.equal(isCopy(vec(T.int('i32'))), false);
  });
  it('HashMap: Clone and Debug need both types, == needs an Eq and Hash key, nothing orders or hashes it', () => {
    const k = S(['Eq', 'Hash']);
    assert.equal(has(map(T.int('i32'), T.string), 'Clone'), true);
    assert.equal(has(map(T.int('i32'), S([])), 'Clone'), false);
    assert.equal(has(map(T.int('i32'), S([])), 'Debug'), false);
    assert.equal(has(map(k, T.float), 'PartialEq'), true);
    assert.equal(has(map(k, T.float), 'Eq'), false);
    assert.equal(has(map(T.float, T.int('i32')), 'PartialEq'), false);
    assert.equal(has(map(T.string, T.int('i32')), 'Eq'), true);
    for (const tr of ['PartialOrd', 'Ord', 'Hash', 'Copy']) assert.equal(has(map(T.int('i32'), T.int('i32')), tr), false, tr);
    assert.equal(has(map(T.float, T.float), 'Default'), true);
  });
  it('floats are PartialOrd but not Ord or Hash; Option is Default for any payload and Result never is', () => {
    for (const tr of ['Ord', 'Hash', 'Eq']) assert.equal(has(T.float, tr), false, tr);
    assert.equal(has(T.float, 'PartialOrd'), true);
    assert.equal(has(T.float, 'Default'), true);
    const opt = (t) => T.enum('Option', [t], ['Debug', 'Clone', 'Copy', 'PartialEq', 'Eq', 'PartialOrd', 'Ord', 'Hash'], true);
    assert.equal(has(opt(S([])), 'Default'), true);
    assert.equal(has(T.enum('Result', [T.int('i32'), T.int('i32')], ['Debug'], true), 'Default'), false);
    assert.equal(has(opt(T.float), 'Ord'), false);
  });
  it('arrays are Default up to 32 elements, tuples follow their parts, and a reference is not Default', () => {
    assert.equal(has(T.array(T.int('i32'), 32), 'Default'), true);
    assert.equal(has(T.array(T.int('i32'), 33), 'Default'), false);
    assert.equal(has(T.array(S([]), 0), 'Default'), true);
    assert.equal(has(T.tuple([T.int('i32'), S([])]), 'Hash'), false);
    assert.equal(has(T.ref(false, T.int('i32'), 1), 'Default'), false);
  });
  it('IntoIterator holds for collections, arrays, Option and references to them, and for no scalar', () => {
    const i32 = T.int('i32');
    assert.equal(has(vec(i32), 'IntoIterator'), true);
    assert.equal(has(map(i32, i32), 'IntoIterator'), true);
    assert.equal(has(T.array(i32, 2), 'IntoIterator'), true);
    assert.equal(has(T.ref(false, vec(i32), 1), 'IntoIterator'), true);
    assert.equal(has(T.enum('Option', [i32], [], true), 'IntoIterator'), true);
    for (const t of [i32, T.string, T.bool, T.float, T.unit, T.tuple([i32, i32]), S([])]) assert.equal(has(t, 'IntoIterator'), false, show(t));
  });
  it('unify, show and hasRef handle the collection forms', () => {
    assert.equal(unify(vec(T.ivar()), vec(T.int('u8'))), true);
    assert.equal(unify(vec(T.int('i32')), vec(T.int('u8'))), false);
    assert.equal(unify(vec(T.int('i32')), map(T.int('i32'), T.int('i32'))), false);
    assert.equal(unify(map(T.tvar(), T.int('i32')), map(T.string, T.int('i32'))), true);
    assert.equal(show(map(T.string, vec(T.ivar()))), 'HashMap<String, Vec<{integer}>>');
    assert.equal(show(T.ivar()), 'integer');
    assert.equal(hasRef(vec(T.ref(false, T.int('i32'), 1))), true);
    assert.equal(hasRef(vec(T.int('i32'))), false);
  });
});
