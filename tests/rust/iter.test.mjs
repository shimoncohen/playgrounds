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
const NOISY = ['struct D(i32);', 'impl Drop for D {', '    fn drop(&mut self) {', '        println!("drop {}", self.0);', '    }', '}'];
const MAP3 = ['let mut m: HashMap<i32, i32> = HashMap::new();', 'm.insert(1, 10);', 'm.insert(2, 20);', 'm.insert(3, 30);'];

describe('the two-seed rule for HashMap order', () => {
  it('{:?} on a map of two or more entries sets the flag and differs between the seeds', () => {
    const c = RQ.run(P(USE, ...[main(...MAP3, 'println!("{:?}", m);')]));
    assert.equal(c.status, 'ok');
    assert.equal(c.hashIterated, true);
    assert.equal(c.orderDependent, true);
  });
  it('printing only the middle key of a three-key map is order dependent', () => {
    const c = RQ.run(P(USE, main(...MAP3, 'let mut ks = Vec::new();', 'for k in m.keys() {', '    ks.push(*k);', '}', 'println!("{}", ks[1]);')));
    assert.equal(c.status, 'ok');
    assert.equal(c.orderDependent, true);
  });
  it('a map of one entry or none prints the same either way and passes', () => {
    for (const n of [0, 1]) {
      const c = RQ.run(P(USE, main('let mut m: HashMap<i32, i32> = HashMap::new();', ...(n ? ['m.insert(1, 2);'] : []), 'println!("{:?} {:#?}", m, m);')));
      assert.equal(c.status, 'ok');
      assert.equal(c.orderDependent, false);
    }
  });
  it('sorted output passes: the keys go into a Vec and are sorted before printing', () => {
    const c = RQ.run(P(USE, main(...MAP3, 'let mut ks = Vec::new();', 'for k in m.keys() {', '    ks.push(*k);', '}', 'ks.sort();', 'println!("{:?}", ks);')));
    assert.equal(c.stdout, '[1, 2, 3]\n');
    assert.equal(c.hashIterated, true);
    assert.equal(c.orderDependent, false);
  });
  it('a sum over a map is order independent, a join of its keys is not', () => {
    assert.equal(RQ.run(P(USE, main(...MAP3, 'let mut t = 0;', 'for (_, v) in &m {', '    t += *v;', '}', 'println!("{}", t);'))).orderDependent, false);
    const c = RQ.run(P(USE, main(...MAP3, 'for (k, _) in &m {', '    println!("{}", k);', '}')));
    assert.equal(c.status, 'ok');
    assert.equal(c.orderDependent, true);
  });
  it('every traversal asks the same entry point: for, iter, keys, values, into_iter, extend, {:?} and a drop that prints', () => {
    const run = (...body) => RQ.run(P(USE, ...NOISY, main('let mut m: HashMap<i32, i32> = HashMap::new();', 'm.insert(1, 1);', 'm.insert(2, 2);', ...body)));
    for (const body of [['for (_, _) in &m {}'], ['for (_, _) in &mut m {}'], ['for (_, _) in m {}'], ['for _ in m.keys() {}'], ['for _ in m.values() {}'], ['for _ in m.values_mut() {}'], ['for _ in m.iter() {}'], ['for _ in m.iter_mut() {}'], ['for _ in m.into_iter() {}'],
      ['let mut n: HashMap<i32, i32> = HashMap::new();', 'n.extend(m);'], ['println!("{:?}", m);'], ['println!("{:?}", Some(m));']]) {
      assert.equal(run(...body).hashIterated, true, body.join(' '));
    }
    assert.equal(run('println!("{}", m.len());').hashIterated, false);
    assert.equal(run('println!("{:?}", m.get(&1));').hashIterated, false);
    assert.equal(run('let n = m.clone();', 'println!("{}", n == m);').hashIterated, false);
    const d = RQ.run(P(USE, ...NOISY, main('let mut m = HashMap::new();', 'm.insert(1, D(1));', 'm.insert(2, D(2));')));
    assert.equal(d.hashIterated, true);
    assert.equal(d.orderDependent, true);
  });
  it('a map inside a struct or an Option prints through the same entry point', () => {
    const c = RQ.run(P(USE, '#[derive(Debug)]', 'struct W {', '    m: HashMap<i32, i32>,', '}', main(...MAP3, 'let w = W { m };', 'println!("{:?}", w);')));
    assert.equal(c.orderDependent, true);
  });
  it('skipping one entry of a map in a loop is still order dependent', () => {
    const c = RQ.run(P(USE, 'fn main() {', '    let mut m = HashMap::new();', '    m.insert(10, 2);', '    m.insert(20, 1);', '    m.insert(30, 3);', '    m.insert(40, 4);', '    for (k, v) in &m {', '        if *v != 2 {', '            println!("{} {}", k, v);', '        }', '    }', '}'));
    assert.equal(c.status, 'ok');
    assert.equal(c.orderDependent, true);
  });
  it('std.hashOrder rotates the order for seed 1 and reverses it for seed 2, and the flag is per session', () => {
    const m = { k: 'map', v: [1, 2, 3, 4].map((i) => ({ key: { k: 'int', v: BigInt(i), ty: 'i32' }, val: { k: 'int', v: BigInt(i), ty: 'i32' } })) };
    const s0 = RQ.std.hashSession(0);
    assert.equal(s0.iterated, false);
    const a = RQ.std.hashOrder(m).map((e) => e.key.v);
    assert.equal(s0.iterated, true);
    RQ.std.hashSession(1);
    const b = RQ.std.hashOrder(m).map((e) => e.key.v);
    assert.deepEqual(b.map(String), [...a.slice(1), a[0]].map(String));
    for (const [i, x] of a.entries()) assert.notEqual(String(b[i]), String(x), `position ${i} keeps its key`);
    RQ.std.hashSession(2);
    assert.deepEqual(RQ.std.hashOrder(m).map((e) => String(e.key.v)), [...a].reverse().map(String));
    assert.equal(RQ.std.debug(m).includes('1: 1'), true);
    RQ.std.hashSession(0);
  });
  it('a mission check fails with the order tip, even when its output matches in the first order', () => {
    const m = { title: 't', check: () => true };
    const r = RQ.evalMission(m, P(USE, main(...MAP3, 'println!("{:?}", m);')));
    assert.equal(typeof r.result, 'string');
    assert.match(r.result, /HashMap/);
    assert.match(r.result, /sort/);
    assert.equal(RQ.evalMission(m, P(USE, main('let mut m: HashMap<i32, i32> = HashMap::new();', 'm.insert(1, 2);', 'println!("{:?}", m);'))).result, true);
  });
  it('a panic that differs between the orders is order dependent too', () => {
    const c = RQ.run(P(USE, main(...MAP3, 'for (k, _) in &m {', '    let v = vec![0];', '    println!("{}", v[*k as usize]);', '}')));
    assert.equal(c.status, 'panic');
    assert.equal(c.orderDependent, true);
  });
});

describe('for over collections', () => {
  it('a Vec by value, by &, by &mut and through iter, iter_mut and into_iter', () => {
    assert.equal(out(main('let v = vec![1, 2, 3];', 'for x in &v {', '    print!("{} ", x);', '}', 'for x in v.iter() {', '    print!("{} ", *x + 1);', '}', 'for x in v.into_iter() {', '    print!("{} ", x * 2);', '}', 'println!("");')), '1 2 3 2 3 4 2 4 6 \n');
    assert.equal(out(main('let mut v = vec![1, 2, 3];', 'for x in &mut v {', '    *x += 10;', '}', 'for x in v.iter_mut() {', '    *x *= 2;', '}', 'println!("{:?}", v);')), '[22, 24, 26]\n');
  });
  it('the Vec by value hands over Strings, a pattern takes pairs apart, and break and continue work', () => {
    assert.equal(out(main('let v = vec![String::from("a"), String::from("b"), String::from("c")];', 'let mut s = String::new();', 'let mut n = 0;', 'for t in v {', '    n += 1;', '    if n == 2 {', '        continue;', '    }', '    s.push_str(&t);', '}', 'println!("{}", s);')), 'ac\n');
    assert.equal(out(main('let v = vec![(1, String::from("a")), (2, String::from("b"))];', 'for (n, s) in &v {', '    println!("{} {}", n, s);', '}', 'for (n, s) in v {', '    if n == 2 {', '        break;', '    }', '    println!("{}", s);', '}')), '1 a\n2 b\na\n');
  });
  it('a for over Strings drops each item at the end of its turn, and a break drops the rest in order', () => {
    const c = RQ.run(P(...NOISY, main('let v = vec![D(1), D(2), D(3)];', 'for d in v {', '    println!("got {}", d.0);', '    if d.0 == 2 {', '        break;', '    }', '}', 'println!("end");')));
    assert.equal(c.stdout, 'got 1\ndrop 1\ngot 2\ndrop 2\ndrop 3\nend\n');
    assert.equal(c.allocs('Vec'), 1);
    assert.equal(c.events.filter((e) => e.t === 'free').length, 1);
    assert.equal(RQ.run(P(...NOISY, main('let v = vec![D(1), D(2)];', 'for _ in v {', '    println!("turn");', '}'))).stdout, 'turn\ndrop 1\nturn\ndrop 2\n');
  });
  it('a panic in the body drops the items still waiting, as the unwind does', () => {
    const c = RQ.run(P(...NOISY, main('let v = vec![D(1), D(2), D(3)];', 'let z = vec![0];', 'for d in v {', '    println!("got {}", d.0);', '    println!("{}", z[d.0 as usize]);', '}')));
    assert.equal(c.status, 'panic');
    assert.equal(c.stdout, 'got 1\ndrop 1\ndrop 2\ndrop 3\n');
  });
  it('a map by value, by & and by &mut, and keys, values and values_mut', () => {
    assert.equal(out(P(USE, main(...MAP3, 'let mut t = 0;', 'for (k, v) in &m {', '    t += *k * *v;', '}', 'for (_, v) in &mut m {', '    *v += 1;', '}', 'for v in m.values_mut() {', '    *v += 1;', '}', 'for k in m.keys() {', '    t += *k;', '}', 'for v in m.values() {', '    t += *v;', '}', 'println!("{} {:?}", t, m.get(&2));'))), '212 Some(22)\n');
    assert.equal(out(P(USE, main('let mut m: HashMap<String, Vec<i32>> = HashMap::new();', 'm.insert(String::from("a"), vec![1, 2]);', 'let mut n = 0;', 'for (k, v) in m {', '    n += k.len() + v.len();', '}', 'println!("{}", n);'))), '3\n');
  });
  it('a range still works, and a Vec inside a struct or behind a reference is walked', () => {
    assert.equal(out(main('let mut t = 0;', 'for i in 0..4 {', '    t += i;', '}', 'for i in 1..=3 {', '    t += i;', '}', 'println!("{}", t);')), '12\n');
    assert.equal(out(P('struct S {', '    items: Vec<i32>,', '    count: i32,', '}', 'impl S {', '    fn go(&mut self) {', '        for x in &self.items {', '            self.count += *x;', '        }', '        for x in self.items.iter_mut() {', '            *x += 1;', '        }', '    }', '}',
      'fn show(v: &Vec<i32>) {', '    for x in v {', '        print!("{} ", x);', '    }', '}', 'fn bump(v: &mut Vec<i32>) {', '    for x in v {', '        *x += 1;', '    }', '}',
      main('let mut s = S { items: vec![1, 2], count: 0 };', 's.go();', 'bump(&mut s.items);', 'show(&s.items);', 'println!("{}", s.count);'))), '3 4 3\n');
  });
  it('the loan lasts the whole loop: pushing is E0502, a second &mut is E0499, and after the loop it is over', () => {
    assert.equal(ids(RQ.run(main('let mut v = vec![1];', 'for x in &v {', '    v.push(*x);', '}'))), 'E0502@4');
    assert.equal(ids(RQ.run(main('let mut v = vec![1];', 'for x in v.iter() {', '    v.clear();', '}'))), 'E0502@4');
    assert.equal(ids(RQ.run(main('let mut v = vec![1];', 'for x in &mut v {', '    v.push(*x);', '}'))), 'E0499@4');
    assert.equal(ids(RQ.run(main('let mut v = vec![1];', 'for x in &v {', '    for y in &mut v {', '        *y += *x;', '    }', '}'))), 'E0502@4');
    assert.equal(out(main('let mut v = vec![1];', 'for x in &v {', '    println!("{}", x);', '}', 'v.push(2);', 'println!("{:?}", v);')), '1\n[1, 2]\n');
    assert.equal(ids(RQ.run(P(USE, main('let mut m: HashMap<i32, i32> = HashMap::new();', 'm.insert(1, 1);', 'for (k, v) in &m {', '    m.insert(*k + 1, *v);', '}')))), 'E0502@6');
  });
  it('a &mut parameter keeps the loan on the variable it came through, and iterating it by value moves it', () => {
    assert.equal(ids(RQ.run(P('fn f(v: &mut Vec<i32>) {', '    for x in v.iter() {', '        v.push(*x);', '    }', '}', 'fn main() {}'))), 'E0502@3');
    assert.equal(ids(RQ.run(P('fn f(v: &mut Vec<i32>) {', '    for x in v.iter_mut() {', '        v.push(*x);', '    }', '}', 'fn main() {}'))), 'E0499@3');
    assert.equal(ids(RQ.run(P('fn f(v: &mut Vec<i32>) {', '    for x in v {', '        println!("{}", x);', '    }', '    v.push(1);', '}', 'fn main() {}'))), 'E0382@5');
    assert.equal(RQ.run(P('fn f(v: &mut Vec<i32>) {', '    for x in v.iter_mut() {', '        *x += 1;', '    }', '    v.push(0);', '}', 'fn main() {}')).status, 'ok');
  });
  it('a for over a Vec moves it, &mut needs a mut variable, and a hidden pattern name does not show', () => {
    assert.equal(ids(RQ.run(main('let v = vec![1];', 'for x in v {}', 'println!("{}", v.len());'))), 'E0382@4');
    assert.equal(ids(RQ.run(main('let v = vec![1];', 'for x in &mut v {', '    *x += 1;', '}'))), 'E0596@3');
    const c = RQ.run(main('let v = vec![(1, 2)];', 'for (a, b) in &v {', '    println!("{} {}", a, b);', '}'), { snap: true });
    assert.equal(c.snaps.some((s) => s.frames.some((f) => f.vars.some((v) => v.name.startsWith('#')))), false);
    assert.equal(c.snaps.some((s) => s.frames.some((f) => f.vars.some((v) => v.name === 'a'))), true);
  });
  it('a refutable pattern in a for is E0005', () => {
    assert.equal(ids(RQ.run(main('let v = vec![Some(1), None];', 'for Some(x) in v {', '    println!("{}", x);', '}'))), 'E0005@3');
  });
  it('what stays unsupported has a hint: arrays and slices, iterators held in a variable, adapters and closures', () => {
    assert.equal(feature(main('let a = [1, 2];', 'for x in &a {}')), 'for iterable@3');
    assert.equal(feature(main('let v = vec![1];', 'let it = v.iter().peekable();')), 'iterator@3');
    assert.equal(feature(main('let v = vec![1];', 'for x in v.iter().zip_all() {}')), 'iterator@3');
    assert.equal(feature(main('let v = vec![1];', 'for x in &v[..1] {}')), 'for iterable@3');
    for (const f of ['iterator', 'for iterable']) assert.ok(RQ.diag.hint(f).length > 30, f);
  });
  it('a huge nest of Vecs stops with a limit, not a stack overflow, when it is looped over and dropped', () => {
    const c = RQ.run(P('struct N {', '    k: Vec<N>,', '}', main('let mut n = N { k: Vec::new() };', 'for _ in 0..20000 {', '    n = N { k: vec![n] };', '}', 'for c in n.k {', '    println!("{}", c.k.len());', '}')));
    assert.ok(['limit', 'ok'].includes(c.status), c.status);
    assert.notEqual(c.status, 'internal');
  });
});

describe('indexing a Vec', () => {
  it('reads and writes an element, a grid, a field Vec and an element method', () => {
    assert.equal(out(main('let mut g = vec![vec![1, 2], vec![3, 4]];', 'g[1][0] += 10;', 'g[0][1] = 7;', 'let r = &g[1];', 'println!("{:?} {} {}", r, g[0][1], g.len());')), '[13, 4] 7 2\n');
    assert.equal(out(main('let mut names = vec![String::from("a")];', 'names[0].push_str("bc");', 'println!("{} {}", names[0].len(), names[0]);')), '3 abc\n');
    assert.equal(out(main('let mut v = vec![1, 1, 0, 0];', 'for i in 2..v.len() {', '    v[i] = v[i - 1] + v[i - 2];', '}', 'v[0] += v[1];', 'println!("{:?}", v);')), '[2, 1, 2, 3]\n');
  });
  it('an element is borrowed with the whole Vec: E0502 on push, E0499 on a second &mut, E0502 on a write', () => {
    assert.equal(ids(RQ.run(main('let mut v = vec![1];', 'let r = &v[0];', 'v.push(2);', 'println!("{}", r);'))), 'E0502@4');
    assert.equal(ids(RQ.run(main('let mut v = vec![1, 2];', 'let a = &mut v[0];', 'let b = &mut v[1];', '*a += 1;', '*b += 1;'))), 'E0499@4');
    assert.equal(ids(RQ.run(main('let mut v = vec![1, 2];', 'let r = &v[0];', 'v[1] = 5;', 'println!("{}", r);'))), 'E0502@4');
    assert.equal(out(main('let mut v = vec![1, 2];', 'let r = &v[0];', 'println!("{}", r);', 'v[1] = 5;', 'println!("{:?}", v);')), '1\n[1, 5]\n');
  });
  it('v[i] = x on a Vec that is not mut is E0596, and moving a String out of an index is E0507', () => {
    assert.equal(ids(RQ.run(main('let v = vec![1];', 'v[0] = 5;'))), 'E0596@3');
    const c = RQ.run(main('let v = vec![String::from("a")];', 'let s = v[0];'));
    assert.equal(ids(c), 'E0507@3');
    assert.equal(c.errors[0].msg, 'cannot move out of index of `Vec<String>`');
  });
  it('an index past the end panics with the length and index, at the bracket, in every position', () => {
    const at = (src) => { const c = RQ.run(src); assert.equal(c.status, 'panic', src); return `${c.panic.msg}@${c.panic.line}:${c.panic.col}`; };
    assert.equal(at(main('let v = vec![1, 2, 3];', 'let i = v.len() + 4;', 'println!("{}", v[i]);')), 'index out of bounds: the len is 3 but the index is 7@4:21');
    assert.equal(at(main('let v = vec![1, 2, 3];', 'let x = v[7];')), 'index out of bounds: the len is 3 but the index is 7@3:14');
    assert.equal(at(main('let mut v = vec![1, 2, 3];', 'v[7] = 1;')), 'index out of bounds: the len is 3 but the index is 7@3:6');
    assert.equal(at(main('let mut v = vec![1, 2, 3];', 'v[7] += 1;')), 'index out of bounds: the len is 3 but the index is 7@3:6');
    assert.equal(at(main('let g = vec![vec![1, 2], vec![3]];', 'let n = g[1][1];')), 'index out of bounds: the len is 1 but the index is 1@3:17');
    assert.equal(at(main('let v = vec![1, 2, 3];', 'let r = &v;', 'let x = r[7];')), 'index out of bounds: the len is 3 but the index is 7@4:14');
    assert.equal(at(main('let v = vec![1, 2, 3];', 'let r = &v[1..9];')), 'range end index 9 out of range for slice of length 3@3:15');
    assert.equal(at(main('let mut v = vec![1, 2, 3];', 'v.remove(5);')), 'removal index (is 5) should be < len (is 3)@3:7');
    assert.equal(at(main('let mut v = vec![1, 2, 3];', 'v.insert(9, 1);')), 'insertion index (is 9) should be <= len (is 3)@3:7');
    assert.equal(at(main('let mut v = vec![1, 2, 3];', 'v.swap(0, 5);')), 'index out of bounds: the len is 3 but the index is 5@3:7');
  });
  it('a write that panics drops the value it was going to store', () => {
    const c = RQ.run(P(...NOISY, main('let mut v = vec![D(1)];', 'v[3] = D(2);')));
    assert.equal(c.status, 'panic');
    assert.equal(c.stdout, 'drop 2\ndrop 1\n');
  });
  it('a slice of a Vec borrows it, and a &Vec passes where a &[T] is asked for', () => {
    assert.equal(out(P('fn sum(xs: &[i32]) -> i32 {', '    let mut t = 0;', '    for i in 0..xs.len() {', '        t += xs[i];', '    }', '    t', '}', main('let v = vec![1, 2, 3];', 'println!("{} {}", sum(&v), sum(&v[1..]));'))), '6 5\n');
    assert.equal(ids(RQ.run(main('let mut v = vec![1, 2, 3];', 'let s = &v[1..];', 'v.push(4);', 'println!("{}", s.len());'))), 'E0502@4');
  });
  it('an index that is not a usize, a HashMap index and a Vec of references stay unsupported', () => {
    assert.equal(feature(main('let v = vec![1];', 'let i: i32 = 0;', 'let x = v[i];')), 'collection method@4');
    assert.equal(feature(P(USE, main('let mut m: HashMap<i32, i32> = HashMap::new();', 'let x = m[&1];'))), 'map index@4');
    assert.equal(feature(main('let v = vec![1];', 'let x = v.get(0..1);')), 'range expression@3');
  });
});

describe('the non-closure methods', () => {
  it('Vec: pop, get, first, last, contains, sort, reverse, truncate, swap, insert, remove, clear, extend', () => {
    assert.equal(out(main('let mut v: Vec<i32> = Vec::new();', 'println!("{:?} {:?} {:?}", v.pop(), v.get(3), v.first());', 'let mut w = vec![3, 1, 2];', 'w.sort();', 'println!("{:?} {}", w, w.contains(&2));', 'w.reverse();', 'w.truncate(2);', 'w.swap(0, 1);', 'w.insert(1, 9);', 'let r = w.remove(0);', 'println!("{:?} {} {:?} {:?}", w, r, w.last(), w.get(0));', 'w.extend(vec![7]);', 'w.extend([8, 9]);', 'w.clear();', 'println!("{} {}", w.is_empty(), v.len());')),
      'None None None\n[1, 2, 3] true\n[9, 3] 2 Some(3) Some(9)\ntrue 0\n');
  });
  it('get and get_mut give references, copied and cloned give owned values, and pop moves the element out', () => {
    assert.equal(out(main('let mut v = vec![1, 2];', 'if let Some(x) = v.get_mut(1) {', '    *x += 40;', '}', 'let a = v.get(1).copied();', 'let b = v.first().copied().unwrap_or(0);', 'let s = vec![String::from("x")];', 'let c = s.first().cloned();', 'let p = v.pop();', 'println!("{:?} {:?} {} {:?} {:?}", v, a, b, c, p);')), '[1] Some(42) 1 Some("x") Some(42)\n');
  });
  it('sort needs an ordered element, contains an equal one (E0277 as rustc), and a get index must be a usize', () => {
    assert.equal(ids(RQ.run(main('let mut v: Vec<f64> = vec![1.5, 0.5];', 'v.sort();'))), 'E0277@3');
    assert.match(RQ.run(main('let mut v: Vec<f64> = vec![1.5, 0.5];', 'v.sort();')).errors[0].msg, /`f64: Ord`/);
    assert.equal(ids(RQ.run(P('struct S;', main('let v = vec![S];', 'println!("{}", v.contains(&S));')))), 'E0277@4');
    assert.match(RQ.run(P('struct S;', main('let v = vec![S];', 'println!("{}", v.contains(&S));'))).errors[0].msg, /can't compare `S` with `S`/);
    assert.equal(feature(main('let v = vec![1];', 'let i: i32 = 0;', 'let x = v.get(i);')), 'collection method@4');
    assert.equal(ids(RQ.run(main('let v = vec![String::from("a")];', 'let s = String::from("a");', 'println!("{}", v.contains(s));'))), 'E0308@4');
  });
  it('extend takes a Vec or an array by value, so the Vec given moves', () => {
    assert.equal(ids(RQ.run(main('let mut v = vec![1];', 'let w = vec![2];', 'v.extend(w);', 'println!("{:?}", w);'))), 'E0382@5');
    const c = RQ.run(main('let mut v = vec![1];', 'let w = vec![2];', 'v.extend(w);'));
    assert.equal(c.allocs('Vec'), 2);
    assert.equal(c.events.filter((e) => e.t === 'free').length, 2);
  });
  it('HashMap: get, get_mut, contains_key, remove, entry, extend, clear', () => {
    assert.equal(out(P(USE, main('let mut m: HashMap<String, i32> = HashMap::new();', 'm.insert(String::from("a"), 1);', 'let k = String::from("b");', 'println!("{:?} {:?} {}", m.get("a"), m.get(&k), m.contains_key("a"));', '*m.entry(String::from("a")).or_insert(0) += 5;', '*m.entry(String::from("c")).or_insert(7) += 1;',
      'if let Some(x) = m.get_mut("a") {', '    *x += 1;', '}', 'println!("{:?} {:?} {}", m.get("a"), m.get("c"), m.len());', 'println!("{:?} {:?}", m.remove("a"), m.remove("zz"));', 'let mut n: HashMap<String, i32> = HashMap::new();', 'n.extend(m);', 'n.extend(vec![(String::from("q"), 1)]);', 'println!("{}", n.len());', 'n.clear();', 'println!("{}", n.is_empty());'))),
      'Some(1) None true\nSome(7) Some(8) 2\nSome(7) None\n2\ntrue\n');
  });
  it('or_default starts a value at its default, and the reference it gives borrows the map mutably', () => {
    assert.equal(out(P(USE, main('let mut m: HashMap<i32, Vec<i32>> = HashMap::new();', 'm.entry(1).or_default().push(10);', 'm.entry(1).or_default().push(20);', 'println!("{:?}", m.get(&1));'))), 'Some([10, 20])\n');
    assert.equal(ids(RQ.run(P(USE, main('let mut m: HashMap<i32, i32> = HashMap::new();', 'let c = m.entry(1).or_insert(0);', 'm.insert(2, 2);', '*c += 1;')))), 'E0499@5');
  });
  it('a key that is not Eq and Hash is E0599 on every keyed method, and a bare entry is unsupported', () => {
    assert.equal(ids(RQ.run(P(USE, main('let mut m: HashMap<f64, i32> = HashMap::new();', 'let x = m.get(&1.0);')))), 'E0599@4');
    assert.equal(feature(P(USE, main('let mut m: HashMap<i32, i32> = HashMap::new();', 'let e = m.entry(1);'))), 'collection method@4');
  });
  it('a temporary as an argument is borrowed for the call: v.contains(&1) and m.get(&1)', () => {
    assert.equal(out(P(USE, main('let v = vec![1, 2];', 'let mut m: HashMap<i32, i32> = HashMap::new();', 'm.insert(1, 2);', 'println!("{} {} {:?}", v.contains(&2), v.contains(&9), m.get(&1));'))), 'true false Some(2)\n');
  });
});

describe('two-phase borrows', () => {
  it('an argument that only reads the receiver is accepted: v.push(v.len()), v.push(v[0]), s.set(s.get())', () => {
    assert.equal(out(main('let mut v = vec![1, 2];', 'v.push(v.len());', 'v.push(v[0] + v[1]);', 'println!("{:?}", v);')), '[1, 2, 2, 3]\n');
    assert.equal(out(P('struct C {', '    n: i32,', '}', 'impl C {', '    fn get(&self) -> i32 {', '        self.n', '    }', '    fn set(&mut self, n: i32) {', '        self.n = n;', '    }', '}', main('let mut c = C { n: 4 };', 'c.set(c.get() + 1);', 'println!("{}", c.get());'))), '5\n');
  });
  it('a borrow passed in the argument is still live at the call, so it is E0502; a mutation or move in it is not modeled', () => {
    assert.equal(feature(main('let mut v = vec![1];', 'v.push(v.pop().unwrap());')), 'two-phase borrow@3');
    assert.equal(feature(main('let mut s = String::from("a");', 's.push_str(&s);')), 'two-phase borrow@3');
  });
});

describe('the index runs after the &mut borrow of an indexed write', () => {
  const S = ['struct S {', '    items: Vec<i32>,', '    total: i32,', '}'];
  it('a Vec behind a &mut reference whose index reads it is unsupported, not accepted', () => {
    assert.equal(feature(P('fn f(v: &mut Vec<i32>) {', '    v[v.len() - 1] = 5;', '}', 'fn main() {', '    let mut v = vec![1];', '    f(&mut v);', '}')), 'reborrow@2');
    assert.equal(feature(P(...S, 'impl S {', '    fn g(&mut self) {', '        self.items[self.items.len() - 1] = 5;', '    }', '}', 'fn main() {', '    let mut s = S { items: vec![1], total: 0 };', '    s.g();', '}')), 'reborrow@7');
  });
  it('an index that reads another field or a local is fine behind a reference', () => {
    assert.equal(out(P(...S, 'impl S {', '    fn g(&mut self) {', '        let n = self.items.len() - 1;', '        self.items[n] = 5;', '        self.items[0] = self.items[n];', '        self.total = 1;', '    }', '}', 'fn main() {', '    let mut s = S { items: vec![1, 2], total: 0 };', '    s.g();', '    println!("{:?} {}", s.items, s.total);', '}')), '[5, 5] 1\n');
  });
});

describe('a for loop over a field behind a reference', () => {
  const S = ['struct S {', '    items: Vec<i32>,', '    total: i32,', '}'];
  const run = (...body) => P(...S, 'impl S {', '    fn peek(&self) -> i32 {', '        self.total', '    }', '    fn g(&mut self) {', ...body.map((l) => '        ' + l), '    }', '}', 'fn main() {', '    let mut s = S { items: vec![1, 2], total: 0 };', '    s.g();', '    println!("{} {:?}", s.total, s.items);', '}');
  it('holds a loan on the field: pushing to it or calling a &mut method is E0502, a &mut loop gives E0499', () => {
    assert.equal(ids(RQ.run(run('for x in &self.items {', '    self.items.push(*x);', '}'))), 'E0502@11');
    assert.equal(ids(RQ.run(run('for x in &mut self.items {', '    self.items.push(*x);', '}'))), 'E0499@11');
  });
  it('a write to another field, or a & method call, is fine', () => {
    assert.equal(out(run('for x in &self.items {', '    self.total += *x;', '}')), '3 [1, 2]\n');
    assert.equal(out(run('for x in &mut self.items {', '    *x += self.total;', '}')), '0 [1, 2]\n');
  });
  it('a mix of the loop field and another field in the body is unsupported', () => {
    assert.equal(feature(run('for x in &self.items {', '    self.total += *x + self.peek();', '}')), 'reborrow@10');
  });
});

describe('slice methods behind DerefMut get no two-phase borrow', () => {
  it('swap and get_mut with a read of the Vec in the arguments are E0502', () => {
    assert.equal(ids(RQ.run(main('let mut v = vec![1, 2, 3];', 'v.swap(0, v.len() - 1);'))), 'E0502@3');
    assert.equal(ids(RQ.run(main('let mut v = vec![1, 2, 3];', 'if let Some(x) = v.get_mut(v.len() - 1) {', '    *x = 0;', '}'))), 'E0502@3');
  });
  it('push, insert and truncate keep their two-phase borrow, also with a shared loan read in the argument', () => {
    assert.equal(out(main('let mut v = vec![1usize, 2];', 'v.push(v.len());', 'v.insert(v.len(), 0);', 'v.truncate(v.len() - 1);', 'println!("{:?}", v);')), '[1, 2, 2]\n');
    assert.equal(out(main('let mut v = vec![1usize, 2];', 'let r = &v;', 'v.push(r.len());', 'println!("{:?}", v);')), '[1, 2, 2]\n');
    assert.equal(ids(RQ.run(main('let mut v = vec![1usize, 2];', 'let r = &mut v;', 'v.push(r.len());', 'r.push(1);'))), 'E0499@4');
  });
});

describe('the expected type of a coercion site reaches the arms of a match or if', () => {
  it('one E0308, at the first arm that does not fit', () => {
    const c = RQ.run(P('fn first(v: &Vec<u32>) -> u32 {', '    match v.get(0) {', '        Some(x) => x,', '        None => 0,', '    }', '}', 'fn main() {', '    let v = vec![7];', '    println!("{}", first(&v));', '}'));
    assert.equal(ids(c), 'E0308@3');
    assert.equal(ids(RQ.run(main('let v = vec![7u32];', 'let c = true;', 'let n: u32 = if c { &v[0] } else { 0 };'))), 'E0308@4');
  });
  it('without an expectation the arms are still compared with each other', () => {
    assert.equal(ids(RQ.run(main('let c = true;', 'let x = if c { 1 } else { "x" };'))), 'E0308@3');
  });
});

describe('a for over an array by value', () => {
  it('runs the items, nested rows included, and leaves a Copy array usable', () => {
    assert.equal(out(main('let g = [[1u8, 2], [3, 4]];', 'let mut s = 0;', 'for r in g {', '    for c in r {', '        s += c;', '    }', '}', 'println!("{}", s);')), '10\n');
    assert.equal(out(main('let a = [1, 2, 3];', 'for x in a {', '    println!("{}", x);', '}', 'println!("{:?}", a);')), '1\n2\n3\n[1, 2, 3]\n');
    assert.equal(out(main('for x in [1, 2, 3] {', '    println!("{}", x);', '}')), '1\n2\n3\n');
    assert.equal(out(main('let a = [3, 1, 2];', 'let mut t = 0;', 'for x in a {', '    if x == 1 {', '        break;', '    }', '    t += x;', '}', 'println!("{}", t);')), '3\n');
    assert.equal(out(main('let a = [(1, 2), (3, 4)];', 'for p in a {', '    println!("{}", p.0 + p.1);', '}')), '3\n7\n');
  });
  it('moves an array of Strings: each item is owned, and the array is gone after the loop', () => {
    assert.equal(out(main('let a = [String::from("a"), String::from("b")];', 'for s in a {', '    let t = s;', '    println!("{}", t);', '}')), 'a\nb\n');
    assert.equal(ids(RQ.run(main('let a = [String::from("a"), String::from("b")];', 'for s in a {', '    println!("{}", s);', '}', 'println!("{:?}", a);'))), 'E0382@6');
  });
});
