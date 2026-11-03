import { describe, it } from 'node:test';
import strict from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// the engine runs in a vm realm, so its arrays and objects have another prototype and deepStrictEqual would reject them
const assert = { ...strict, deepEqual: (a, b, msg) => strict.equal(JSON.stringify(a), JSON.stringify(b), msg) };

const RQ = loadRust();
// one line per entry, so the expected line of an error is the index of its line plus one
const P = (...lines) => lines.join('\n') + '\n';
const diags = (src) => RQ.compile(src).diags.map((d) => `${d.code || d.lint}@${d.line}`).join(',');
const TAKE = ['fn take(s: String) {', '    println!("{}", s);', '}', ''];
const SIMPLE = (...body) => P('fn main() {', ...body.map((b) => '    ' + b), '}');

describe('RQ.borrow: the API', () => {
  it('gives errors, unsupported, loans and the names of the fns it analysed', () => {
    const c = RQ.compile(SIMPLE('let s = String::new();'));
    const b = RQ.borrow(c.ast, c.info);
    assert.deepEqual(b, { errors: [], unsupported: [], loans: [], analysed: ['main'] });
  });
  it('a Copy-only fn is not analysed', () => {
    const c = RQ.compile(SIMPLE('let x = 1;', 'let y = x;', 'let z = x;'));
    assert.deepEqual(RQ.borrow(c.ast, c.info).analysed, []);
  });
  it('compile returns loans', () => assert.deepEqual(RQ.compile(SIMPLE('let s = String::new();')).loans, []));
  it('the mir unsupported list comes through', () => {
    const c = RQ.compile(SIMPLE('let s = String::new();', 'let r = &String::new();'));
    assert.deepEqual(RQ.borrow(c.ast, c.info).unsupported.map((u) => `${u.feature}@${u.line}`), ['temporary borrow@3']);
  });
});

describe('E0382: use after move', () => {
  it('straight line, and a move followed by a println!', () => {
    assert.equal(diags(SIMPLE('let s = String::from("a");', 'let t = s;', 'println!("{}", s);')), 'E0382@4');
  });
  it('a move followed by &s', () => {
    assert.equal(diags(SIMPLE('let s = String::from("a");', 'let t = s;', 'let r = &s;')), 'E0382@4');
  });
  it('a move in one branch', () => {
    const src = P(...TAKE, 'fn f(c: bool) {', '    let s = String::from("a");', '    if c {', '        take(s);', '    }', '    println!("{}", s);', '}', '', 'fn main() {', '    f(true);', '}');
    assert.equal(diags(src), 'E0382@10');
  });
  it('a move in a loop body is a move in the previous iteration', () => {
    const src = P(...TAKE, 'fn main() {', '    let s = String::from("a");', '    for _i in 0..2 {', '        take(s);', '    }', '}');
    assert.equal(diags(src), 'E0382@8');
  });
  it('a move as a fn argument', () => {
    const src = P(...TAKE, 'fn main() {', '    let s = String::from("a");', '    take(s);', '    println!("{}", s);', '}');
    assert.equal(diags(src), 'E0382@8');
  });
  it('only the first use of a moved local is reported', () => {
    assert.equal(diags(SIMPLE('let s = String::from("a");', 'drop(s);', 'drop(s);', 'drop(s);')), 'E0382@4');
  });
  it('a tuple holding a String moves', () => {
    const p = P('fn f(p: (String, i32)) {', '    let q = p;', '    let z = p;', '}', '', 'fn main() {', '}');
    assert.equal(diags(p), 'E0382@3');
  });
  it('a tuple returned by a call moves', () => {
    const src = P('fn mk() -> (String, i32) {', '    (String::from("a"), 1)', '}', '', 'fn main() {', '    let t = mk();', '    let u = t;', '    let v = t;', '}');
    assert.equal(diags(src), 'E0382@8');
  });
  it('a move then a print of the tuple', () => {
    const src = P('fn f(p: (String, i32)) {', '    let q = p;', '    println!("{:?}", p);', '}', '', 'fn main() {', '}');
    assert.equal(diags(src), 'E0382@3');
  });
  it('the Copy twin of the tuple shape is accepted and not analysed', () => {
    const src = P('fn f(p: (i32, i32)) {', '    let q = p;', '    let z = p;', '}', '', 'fn main() {', '}');
    assert.equal(diags(src), '');
    const c = RQ.compile(src);
    assert.deepEqual(RQ.borrow(c.ast, c.info).analysed, []);
  });
  it('RQ.run reports it as an error with the line', () => {
    const c = RQ.run(SIMPLE('let s = String::from("a");', 'let t = s;', 'println!("{}", s);'));
    assert.equal(c.status, 'error');
    assert.ok(c.onlyError('E0382'));
    assert.ok(c.hasError('E0382', 4));
  });
});

describe('E0381: use of an uninitialised local', () => {
  it('a plain use', () => assert.equal(diags(SIMPLE('let x: i32;', 'println!("{}", x);')), 'E0381@3'));
  it('the read half of a compound assignment', () => assert.equal(diags(SIMPLE('let mut x: i32;', 'x += 1;')), 'E0381@3'));
  it('initialised in one branch only', () => {
    const src = P('fn f(c: bool) {', '    let x: i32;', '    if c {', '        x = 1;', '    }', '    println!("{}", x);', '}', '', 'fn main() {', '    f(true);', '}');
    assert.equal(diags(src), 'E0381@6');
  });
  it('a use of a moved local is E0382 even when it is also uninitialised on another path', () => {
    const src = P('fn f(c: bool) {', '    let s: String;', '    if c {', '        s = String::new();', '        drop(s);', '    }', '    drop(s);', '}', '', 'fn main() {', '    f(true);', '}');
    assert.equal(diags(src), 'E0382@7');
  });
});

describe('E0384: a deferred let assigned twice', () => {
  it('the second assignment', () => assert.equal(diags(SIMPLE('let x: i32;', 'x = 1;', 'x = 2;')), 'E0384@4'));
  it('a mut deferred let is fine', () => assert.equal(diags(SIMPLE('let mut x: i32;', 'x = 1;', 'x = 2;', 'println!("{}", x);')), ''));
  it('one assignment per branch is fine', () => {
    const src = P('fn f(c: bool) {', '    let x: i32;', '    if c {', '        x = 1;', '    } else {', '        x = 2;', '    }', '    println!("{}", x);', '}', '', 'fn main() {', '    f(true);', '}');
    assert.equal(diags(src), '');
  });
  it('an assignment in a loop body is a second assignment', () => {
    assert.equal(diags(SIMPLE('let x: i32;', 'for _i in 0..2 {', '    x = 1;', '}')), 'E0384@4');
  });
  it('a deferred let inside the loop body starts again each time', () => {
    assert.equal(diags(SIMPLE('for _i in 0..2 {', '    let x: i32;', '    x = 1;', '    println!("{}", x);', '}')), '');
  });
  it('the checker still reports a plain immutable let, and the pass adds to it, sorted by line', () => {
    assert.equal(diags(SIMPLE('let a = 1;', 'a = 2;', 'let s = String::new();', 'drop(s);', 'drop(s);')), 'E0384@3,E0382@6');
  });
});

describe('accepted programs', () => {
  it('a reassigned moved mut local', () => {
    assert.equal(diags(SIMPLE('let mut s = String::from("a");', 'let t = s;', 's = String::from("b");', 'println!("{} {}", s, t);')), '');
  });
  it('Copy never moves', () => {
    assert.equal(diags(SIMPLE('let s = String::new();', 'let x = 5;', 'let y = x;', 'let z = x;', 'println!("{} {} {}", s, y, z);')), '');
  });
  it('a move in one branch with a reinit in the same branch', () => {
    const src = P('fn f(c: bool) {', '    let mut s = String::from("a");', '    if c {', '        drop(s);', '        s = String::new();', '    }', '    println!("{}", s);', '}', '', 'fn main() {', '    f(true);', '}');
    assert.equal(diags(src), '');
  });
  it('a move before a break does not reach the loop head again', () => {
    assert.equal(diags(SIMPLE('let s = String::from("a");', 'loop {', '    drop(s);', '    break;', '}')), '');
  });
  it('a move in a branch that returns', () => {
    const src = P('fn f(c: bool) {', '    let s = String::from("a");', '    if c {', '        drop(s);', '        return;', '    }', '    println!("{}", s);', '}', '', 'fn main() {', '    f(true);', '}');
    assert.equal(diags(src), '');
  });
});

describe('when the pass runs', () => {
  it('a checker error other than E0384 keeps it from running', () => {
    assert.equal(diags(SIMPLE('let x: i32 = "a";', 'let s = String::new();', 'drop(s);', 'drop(s);')), 'E0308@2');
  });
  it('an unsupported construct wins over a verdict', () => {
    const c = RQ.run(SIMPLE('let s = String::new();', 'drop(s);', 'drop(s);', 'let r = &String::new();'));
    assert.equal(c.status, 'unsupported');
    assert.equal(c.unsupported.feature, 'temporary borrow');
  });
  it('the lint does not run when the pass found an error', () => {
    assert.equal(diags(SIMPLE('let s = String::new();', 'drop(s);', 'drop(s);', 'let x: u8 = 255 + 1;')), 'E0382@4');
  });
});
