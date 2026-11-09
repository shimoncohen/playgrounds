import { describe, it } from 'node:test';
import strict from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// the engine runs in a vm realm, so its arrays and objects have another prototype and deepStrictEqual would reject them
const assert = { ...strict, deepEqual: (a, b, msg) => strict.equal(JSON.stringify(a), JSON.stringify(b), msg) };
const RQ = loadRust();
const P = (...lines) => lines.join('\n') + '\n';
const N = ['struct N {', '    id: i32,', '}', 'impl Drop for N {', '    fn drop(&mut self) {', '        println!("drop {}", self.id);', '    }', '}',
  'fn make(id: i32) -> N {', '    N { id }', '}', ''];
const prog = (...body) => P(...N, 'fn main() {', ...body.map((l) => '    ' + l), '}');
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src); return c.unsupported.feature; };

describe('structs and Drop: drop order', () => {
  it('drops locals in reverse order, temporaries at once, and a moved value once', () => {
    const c = RQ.run(prog('let a = make(1);', 'let b = make(2);', 'make(3);', 'let _ = make(4);', 'let c = b;', 'println!("end");'));
    assert.equal(c.stdout, 'drop 3\ndrop 4\nend\ndrop 2\ndrop 1\n');
  });
  it('runs Drop::drop of a struct before its fields, which drop in declaration order', () => {
    const src = P(...N, 'struct H {', '    id: i32,', '    b: N,', '    a: N,', '}', 'impl Drop for H {', '    fn drop(&mut self) {', '        println!("drop h");', '    }', '}',
      'fn main() {', '    let _h = H { a: make(1), id: 0, b: make(2) };', '}');
    assert.equal(RQ.run(src).stdout, 'drop h\ndrop 2\ndrop 1\n');
  });
  it('drops parameters in reverse order, an overwritten value after the new one is built, and unwinds on a panic', () => {
    assert.equal(RQ.run(P(...N, 'fn two(a: N, b: N) {}', 'fn main() {', '    two(make(1), make(2));', '}')).stdout, 'drop 2\ndrop 1\n');
    assert.equal(RQ.run(prog('let mut m = make(1);', 'm = make(2);', 'println!("end");')).stdout, 'drop 1\nend\ndrop 2\n');
    const c = RQ.run(P(...N, 'fn boom(d: i32) -> i32 {', '    10 / d', '}', 'fn main() {', '    let a = make(1);', '    let z = boom(0);', '    println!("{}", z);', '}'));
    assert.equal(c.status, 'panic');
    assert.equal(c.stdout, 'drop 1\n');
  });
  it('a use after a move of a struct is E0382, and a field read after drop too', () => {
    assert.equal(RQ.run(prog('let a = make(1);', 'let b = a;', 'println!("{}", a.id);')).onlyError('E0382'), true);
    assert.equal(RQ.run(prog('let a = make(1);', 'drop(a);', 'println!("{}", a.id);')).onlyError('E0382'), true);
  });
});

describe('structs and Drop: what stays unsupported', () => {
  it('reports the construct instead of guessing', () => {
    assert.equal(feature('#[derive(Ord)]\nstruct P {\n    x: i32,\n}\nfn main() {}'), 'derive');
    assert.equal(feature('struct P {\n    x: &mut str,\n}\nfn main() {}'), 'struct');
    assert.equal(feature('struct P {\n    p: P,\n}\nfn main() {}'), 'struct');
    assert.equal(feature('struct P {\n    x: i32,\n}\nimpl P {\n    const A: i32 = 1;\n}\nfn main() {}'), 'impl');
    assert.equal(feature(P(...N.slice(0, 3), 'impl Drop for N {', '    fn drop(&mut self) {', '        let x = 1;', '    }', '}', 'fn main() {}')), 'impl');
    assert.equal(feature(P(...N, 'fn main() {', '    let n = N { id: 1 };', '    println!("{}", make(2).id);', '}')), 'field of a temporary');
    assert.equal(feature(P(...N, 'fn main() {', '    let n = N {};', '}')), 'struct literal');
    assert.equal(RQ.run(P(...N, 'fn main() {', '    let n = N { id: 1 };', '    println!("{}", n);', '}')).onlyError('E0277'), true);
  });
});

describe('events', () => {
  const COPIES = ['let s = String::from("a");', 'let t = s.clone();', 'let u = s.to_owned();', 'let v = s.to_string();', 'let w = String::from(s.as_str());',
    'let x = format!("{}", s);', 'let y = Clone::clone(&s);'];
  it('every way to copy a String is one more allocation, and as_str is none', () => {
    const body = (n) => P('fn main() {', ...COPIES.slice(0, n).map((l) => '    ' + l), '}');
    assert.equal(RQ.run(body(1)).allocs('String'), 1);
    for (let n = 2; n <= COPIES.length; n++) assert.equal(RQ.run(body(n)).allocs('String'), n, COPIES[n - 1]);
    assert.equal(RQ.run(P('fn main() {', '    let s = String::from("a");', '    let t = s.as_str();', '    println!("{}", t);', '}')).allocs('String'), 1);
  });
  it('push_str keeps the same heap object, and a temporary String is freed at the end of its statement', () => {
    const c = RQ.run(P('fn main() {', '    let mut s = String::new();', '    s.push_str("ab");', '    let n = String::from("xyz").len();', '    println!("{}", n);', '}'));
    assert.equal(c.allocs('String'), 2);
    assert.deepEqual(c.events.filter((e) => e.t === 'free').map((e) => e.id), [2, 1]);
  });
  it('moved and dropOrder report the variables', () => {
    const c = RQ.run(P('fn main() {', '    let a = String::from("a");', '    let b = a;', '    let c = String::from("c");', '    drop(c);', '}'));
    assert.equal(c.moved('a'), true);
    assert.equal(c.moved('b'), false);
    assert.deepEqual(c.dropOrder(), ['c', 'b']);
  });
  it('a program that does not run has no events', () => {
    const c = RQ.run(P('fn main() {', '    let a = String::from("a");', '    let b = a;', '    println!("{}", a);', '}'));
    assert.deepEqual([c.events.length, c.allocs('String'), c.dropOrder().length], [0, 0, 0]);
  });
});

describe('snapshots', () => {
  const run = (...body) => RQ.run(P('fn main() {', ...body.map((l) => '    ' + l), '}'), { snap: true });
  it('are off unless asked for, and one before each statement plus one at the end otherwise', () => {
    assert.equal(RQ.run(P('fn main() {', '    let a = 1;', '}')).snaps.length, 0);
    const c = run('let a = String::from("hi");', 'let b = a;');
    assert.deepEqual(c.snaps.map((s) => [s.line, s.end]), [[2, false], [3, false], [3, true]]);
  });
  it('show a moved variable as moved and the heap object under its new owner', () => {
    const s = run('let a = String::from("hi");', 'let b = a;', 'println!("{}", b);').snaps[2];
    const [a, b] = s.frames[0].vars;
    assert.deepEqual([a.state, b.state], ['moved', 'owned']);
    assert.deepEqual(s.heap.map((h) => [h.id, h.content, h.owner]), [[1, 'hi', 'b']]);
    assert.deepEqual(a.leaves, [{ path: '', heap: null }]);
  });
  it('end with an empty stack and heap once everything dropped', () => {
    const s = run('let a = String::from("hi");').snaps.pop();
    assert.deepEqual([s.end, s.frames.length, s.heap.length], [true, 0, 0]);
  });
  it('mark a borrowed variable while the loan is live and not after its last use', () => {
    const c = run('let mut a = String::from("hi");', 'let r = &a;', 'println!("{}", r);', 'a.push_str("!");');
    const at = (i) => c.snaps[i].frames[0].vars.find((v) => v.name === 'a');
    assert.equal(at(2).state, 'shared');
    assert.equal(at(3).state, 'owned');
    assert.equal(c.snaps[3].loans[0].live, false);
    assert.equal(c.snaps[2].loans[0].live, true);
  });
  it('keep a frame per call, and struct fields as slots', () => {
    const c = RQ.run(P('struct S {', '    n: i32,', '    t: String,', '}', 'fn f(s: S) -> i32 {', '    s.n', '}', 'fn main() {', '    let s = S { n: 1, t: String::from("x") };', '    f(s);', '}'), { snap: true });
    const deep = c.snaps.find((s) => s.frames.length === 2);
    assert.equal(deep.frames[1].fn, 'f');
    assert.deepEqual(deep.frames[1].vars[0].leaves.map((l) => [l.path, l.text, l.heap]), [['n', '1', undefined], ['t', undefined, 1]]);
  });
  it('stop at 2000 snapshots but keep the last slot for the end of the run', () => {
    const c = run('let mut i = 0;', 'while i < 5000 {', '    i += 1;', '}');
    assert.equal(c.snaps.length, 2000);
    assert.equal(c.snaps[1999].end, true);
  });
  it('flag an empty String, whose box has no heap memory yet', () => {
    const c = run('let mut s = String::new();', 'let t = String::from("");', 'let u = String::from("a");', 's.push_str("x");', 'println!("{}", s);');
    assert.deepEqual(c.events.filter((e) => e.t === 'alloc').map((e) => e.empty), [true, true, false]);
    assert.deepEqual(c.snaps[3].heap.map((h) => h.content), ['', '', 'a']);
    assert.equal(c.snaps[4].heap[0].content, 'x');
  });
  it('an owned temporary passed to a print is freed at the end of the statement', () => {
    const c = run('println!("{}", String::from("a"));', 'let n = 1;');
    assert.equal(c.snaps[1].heap.length, 0);
    assert.deepEqual(c.events.filter((e) => e.t === 'free').length, 1);
  });
  it('point self of a Drop::drop frame at the value being dropped', () => {
    const c = RQ.run(prog('let a = make(1);', 'println!("x");'), { snap: true });
    const deep = c.snaps.find((s) => s.frames.length === 2 && s.frames[1].fn === 'drop');
    const [host, self] = deep.frames[1].vars;
    assert.equal(host.name, 'a');
    assert.deepEqual([self.leaves[0].to, self.leaves[0].toName], [host.uid, 'a']);
  });});

describe('the state at the error point', () => {
  it('names the variables in scope, the moved one, and the loans that reach the line', () => {
    const c = RQ.run(P('fn main() {', '    let a = String::from("hi");', '    let b = a;', '    println!("{}", a);', '}'), { snap: true });
    assert.deepEqual(c.view.error, { code: 'E0382', line: 4, msg: 'borrow of moved value: `a`', name: 'a' });
    assert.deepEqual(c.view.vars.map((v) => [v.name, v.state]), [['a', 'moved'], ['b', 'owned']]);
    const d = RQ.run(P('fn main() {', '    let mut a = String::from("hi");', '    let r = &a;', '    a.push_str("!");', '    println!("{}", r);', '}'), { snap: true });
    assert.equal(d.view.error.code, 'E0502');
    assert.deepEqual(d.view.loans, [{ kind: 'shared', place: 'a', from: 3, to: 5 }]);
    assert.equal(d.view.vars.find((v) => v.name === 'a').state, 'shared');
  });
  it('marks a variable that moved on to another variable, not only the one the error names', () => {
    const c = RQ.run(P('fn main() {', '    let a = String::from("a");', '    let b = a;', '    let c = b;', '    println!("{}", b);', '}'), { snap: true });
    assert.deepEqual(c.view.vars.map((v) => [v.name, v.state]), [['a', 'moved'], ['b', 'moved'], ['c', 'owned']]);
  });
  it('is absent unless snapshots are asked for, and for a run that compiles', () => {
    assert.equal(RQ.run(P('fn main() {', '    let a = 1;', '    a = 2;', '}')).view, null);
    assert.equal(RQ.run(P('fn main() {}'), { snap: true }).view, null);
  });
});

describe('borrow lessons cannot be passed by copying or by leaving the safe subset', () => {
  const m = RQ.CH[3].missions[4];
  const SHOUT = (body) => 'fn shout(s: String) -> String {\n' + body + '}\n';
  it('Rc and unsafe report unsupported, so the mission never completes', () => {
    for (const body of ['    unsafe { }\n    s\n', '    let r = Rc::new(s);\n    s\n']) {
      const { c, result } = RQ.evalMission(m, SHOUT(body));
      assert.equal(c.status, 'unsupported');
      assert.notEqual(result, true);
    }
  });
  it('every copying spelling is a second allocation', () => {
    for (const w of m.lazy) assert.notEqual(RQ.runMission(m, w.src), true);
  });
});
