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
    assert.deepEqual(b, { errors: [], unsupported: [], loans: [], moves: [], maxLive: { shared: 0, mut: 0 }, analysed: ['main'] });
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

// the program starts with `let mut s`, so line 2 declares it and the next body line is line 3
const SI = (...body) => SIMPLE('let mut s = String::from("a");', ...body);
const IX = (...body) => SIMPLE('let mut x = 5;', ...body);
const unsup = (src) => { const c = RQ.run(src); return c.status === 'unsupported' ? `${c.unsupported.feature}@${c.unsupported.line}` : c.status; };

describe('loans: E0499, E0502, E0505, E0506', () => {
  it('two live &mut loans: E0499 at the second borrow', () => {
    assert.equal(diags(SI('let a = &mut s;', 'let b = &mut s;', 'a.push_str("x");')), 'E0499@4');
  });
  it('a &mut borrow while a shared loan is live: E0502 at the push_str', () => {
    assert.equal(diags(SI('let r = &s;', 's.push_str("x");', 'println!("{}", r);')), 'E0502@4');
  });
  it('a shared borrow while a &mut loan is live: E0502, for len and for a print argument', () => {
    assert.equal(diags(SI('let a = &mut s;', 'let n = s.len();', 'a.push_str("x");', 'println!("{}", n);')), 'E0502@4');
    assert.equal(diags(SI('let a = &mut s;', 'println!("{}", s);', 'a.push_str("x");')), 'E0502@4');
  });
  it('a move while borrowed: E0505 at the move', () => {
    assert.equal(diags(SI('let r = &s;', 'let t = s;', 'println!("{}", r);')), 'E0505@4');
    assert.equal(diags(SI('let a = &mut s;', 'drop(s);', 'a.push_str("x");')), 'E0505@4');
  });
  it('an assignment while borrowed: E0506, shared or &mut', () => {
    assert.equal(diags(IX('let r = &x;', 'x = 6;', 'println!("{}", r);')), 'E0506@4');
    assert.equal(diags(IX('let r = &mut x;', 'x = 6;', '*r = 7;')), 'E0506@4');
    assert.equal(diags(IX('let r = &x;', 'x += 1;', 'println!("{}", r);')), 'E0506@4');
  });
  it('each is one coded error through RQ.run', () => {
    for (const [code, src] of [['E0499', SI('let a = &mut s;', 'let b = &mut s;', 'a.push_str("x");')], ['E0502', SI('let r = &s;', 's.push_str("x");', 'println!("{}", r);')],
      ['E0505', SI('let r = &s;', 'let t = s;', 'println!("{}", r);')], ['E0506', IX('let r = &x;', 'x = 6;', 'println!("{}", r);')]]) {
      const c = RQ.run(src);
      assert.equal(c.status, 'error', code);
      assert.ok(c.onlyError(code), code);
    }
  });
  it('a conflict in a loop body', () => {
    assert.equal(diags(SI('let r = &s;', 'for _i in 0..2 {', '    s.push_str("x");', '}', 'println!("{}", r);')), 'E0502@5');
  });
  it('a call with two borrows of one local (explicit &mut and &)', () => {
    const f = 'fn f(a: &mut i32, b: &i32) {}';
    assert.equal(diags(P(f, 'fn main() {', '    let mut x = 1;', '    f(&mut x, &x);', '}')), 'E0502@4');
    assert.equal(diags(P(f, 'fn main() {', '    let mut x = 1;', '    let y = 2;', '    f(&mut x, &y);', '}')), '');
    assert.equal(diags(P('fn g(a: &mut i32, b: &mut i32) {}', 'fn main() {', '    let mut x = 1;', '    g(&mut x, &mut x);', '}')), 'E0499@4');
  });
});

describe('loans: NLL', () => {
  it('a holder whose last use is before the conflict', () => {
    assert.equal(diags(SI('let r = &s;', 'println!("{}", r);', 's.push_str("x");')), '');
  });
  it('a holder never used, and a shared loan next to shared uses', () => {
    assert.equal(diags(SI('let r = &s;', 's.push_str("x");')), '');
    assert.equal(diags(SI('let a = &s;', 'let b = &s;', 'println!("{} {} {}", a, b, s);')), '');
  });
  it('a holder reassigned before its next use drops the old loan', () => {
    assert.equal(diags(SI('let t = String::from("b");', 'let mut r = &s;', 'r = &t;', 's.push_str("x");', 'println!("{}", r);')), '');
  });
  it('a Copy read and a shared borrow of the local while a shared loan is live', () => {
    assert.equal(diags(IX('let r = &x;', 'let y = x;', 'println!("{} {} {}", r, y, x);')), '');
  });
  it('a loop back-edge keeps the loan live at the top of the next iteration', () => {
    const body = (a, b) => SI('let t = String::from("b");', 'let mut r = &t;', 'for _i in 0..2 {', ...a, ...b, '}');
    assert.equal(diags(body(['    s.push_str("x");', '    println!("{}", r);'], ['    r = &s;'])), 'E0502@6');
    assert.equal(diags(body(['    s.push_str("x");', '    r = &s;'], ['    println!("{}", r);'])), '');
  });
  it('a branch join unions the loans', () => {
    const src = (tail) => P('fn f(c: bool) {', '    let mut s = String::from("a");', '    let t = String::from("b");', '    let r = if c { &s } else { &t };', ...tail, '}', '', 'fn main() {', '    f(true);', '}');
    assert.equal(diags(src(['    s.push_str("x");', '    println!("{}", r);'])), 'E0502@5');
    assert.equal(diags(src(['    println!("{}", r);', '    s.push_str("x");'])), '');
  });
  it('a loan carried by a &str copy and by as_str on a &String', () => {
    assert.equal(diags(SI('let r: &str = s.as_str();', 'let r2 = r;', 's.push_str("x");', 'println!("{}", r2);')), 'E0502@5');
    assert.equal(diags(SI('let r = &s;', 'let q = r.as_str();', 's.push_str("x");', 'println!("{}", q);')), 'E0502@5');
    assert.equal(diags(SI('let r: &str = s.as_str();', 'let r2 = r;', 'println!("{}", r2);', 's.push_str("x");')), '');
  });
});

describe('RQ.compile loans', () => {
  const nodes = (ast, t) => { const out = []; RQ.walk(ast, (n) => { if (n.t === t) out.push(n); }); return out; };
  it('has the id, the borrow node, the local, mut, the line and the nodes where it is live', () => {
    const c = RQ.compile(SI('let r = &s;', 'println!("{}", r);'));
    assert.deepEqual(c.loans, [{ id: 0, ast: nodes(c.ast, 'Ref')[0].id, local: 's', mut: false, implicit: false, line: 3, span: [3, 4], live: [nodes(c.ast, 'Macro')[0].id] }]);
  });
  it('a &mut loan from a call argument, and ids that run on across fns', () => {
    const c = RQ.compile(P('fn f(a: &mut String) {', '    a.push_str("x");', '}', '', 'fn main() {', '    let mut s = String::new();', '    f(&mut s);', '    s.push_str("y");', '}'));
    assert.deepEqual(c.loans.map((l) => [l.id, l.local, l.mut, l.line]), [[0, 's', true, 7], [1, 's', true, 8]]);
    assert.deepEqual(c.loans.map((l) => l.live.length), [1, 1]);
  });
  it('a loan nobody uses afterwards is never live', () => assert.deepEqual(RQ.compile(SI('let r = &s;')).loans.map((l) => l.live), [[]]));
});

describe('loans: unsupported rows', () => {
  it('names are registered with hints', () => {
    for (const f of ['use while borrowed', 'reference in aggregate']) {
      assert.ok(RQ.BORROW_FEATURES.includes(f), f);
      assert.ok(RQ.diag.UNSUPPORTED[f].length > 10, f);
    }
  });
  it('use while borrowed: a Copy read or a compound assignment while a &mut loan is live', () => {
    assert.equal(unsup(IX('let r = &mut x;', 'let y = x;', '*r = 1;', 'println!("{}", y);')), 'use while borrowed@4');
    assert.equal(unsup(IX('let r = &mut x;', 'x += 1;', '*r = 1;')), 'use while borrowed@4');
  });
  it('reference in aggregate: a tuple or array with a reference, or a loan', () => {
    assert.equal(unsup(IX('let r = &x;', 'let t = (r, 1);', 'println!("{}", t.1);')), 'reference in aggregate@4');
    assert.equal(unsup(IX('let t = (&x, 1);', 'println!("{}", t.1);')), 'reference in aggregate@3');
    assert.equal(unsup(IX('let r = &x;', 'let t = [r, r];', 'println!("{}", x);')), 'reference in aggregate@4');
    assert.equal(unsup(SI('let r: &str = s.as_str();', 'let t = (r, 1);', 'println!("{}", t.1);')), 'reference in aggregate@4');
  });
  it('a tuple of plain values is fine', () => assert.equal(diags(SI('let t = (1, 2);', 'println!("{} {}", t.0, s);')), ''));
  it('reborrow: a use of a ref local that a live &mut loan covers (no source shape reaches it, so the mir is built by hand)', () => {
    const real = RQ.mir;
    const ref = { k: 'ref' }, at = (line) => ({ line, col: 1, ast: line });
    const F = {
      name: 'main', ast: 1, line: 1,
      locals: [{ id: 0, name: 'p', ty: ref, mut: true, param: true }, { id: 1, name: 'q', ty: ref, mut: false, param: false }],
      blocks: [{ id: 0, succ: [], unreachable: false, instrs: [
        { op: 'assign', l: 1, rv: { k: 'ref', l: 0, mut: true }, ...at(2) },
        { op: 'eval', rv: { k: 'use', x: { k: 'copy', l: 0 } }, ...at(3) },
        { op: 'eval', rv: { k: 'use', x: { k: 'copy', l: 1 } }, ...at(4) },
        { op: 'return', x: null, ...at(5) }] }]
    };
    RQ.mir = () => ({ fns: [F], unsupported: [] });
    try {
      assert.deepEqual(RQ.borrow({}, {}).unsupported, [{ feature: 'reborrow', line: 3 }]);
    } finally { RQ.mir = real; }
  });
});

describe('drop, a repeated &mut argument and the order operands are read in', () => {
  it('std drop moves a &mut local; a user fn named drop reborrows it', () => {
    assert.equal(diags(IX('let r = &mut x;', 'drop(r);', '*r = 5;', 'println!("{}", x);')), 'E0382@5');
    const user = P('fn drop(a: &mut i32) {', '    *a = 0;', '}', 'fn main() {', '    let mut x = 1;', '    let r = &mut x;', '    drop(r);', '    *r = 5;', '    println!("{}", x);', '}');
    assert.equal(diags(user), '');
    assert.equal(RQ.run(user).status, 'ok');
  });
  const TWO = ['fn two(a: &mut i32, b: &mut i32) {', '}', 'fn one(a: &mut i32) {', '}'];
  it('the same &mut local twice in one call is unsupported (E0499 in rustc)', () => {
    assert.equal(unsup(P(...TWO, 'fn g(r: &mut i32) {', '    two(r, r);', '}', 'fn main() {', '    let mut x = 1;', '    g(&mut x);', '}')), 'reborrow@6');
    assert.equal(unsup(P(...TWO, 'fn g(r: &mut i32) {', '    two(r, &mut *r);', '}', 'fn main() {', '    let mut x = 1;', '    g(&mut x);', '}')), 'reborrow@6');
  });
  it('one &mut local reborrowed in two calls, or two different ones in a call, is fine', () => {
    assert.equal(diags(P(...TWO, 'fn g(r: &mut i32, q: &mut i32) {', '    one(r);', '    one(r);', '    two(r, q);', '}', 'fn main() {', '    let mut x = 1;', '    let mut y = 2;', '    g(&mut x, &mut y);', '}')), '');
  });
  it('a local read before a sibling that borrows is read there: a Copy read while a &mut loan is live', () => {
    assert.equal(unsup(IX('let r = &mut x;', 'let y = x + *r;', 'println!("{}", y);')), 'use while borrowed@4');
    assert.equal(unsup(IX('let r = &mut x;', 'let t = (x, *r);', 'println!("{}", t.0);')), 'use while borrowed@4');
  });
  it('a &T local print arg is read before a later arg that reassigns it (E0506 in rustc)', () => {
    const src = P('fn main() {', '    let mut x = 1;', '    let y = 2;', '    let mut r = &x;', '    println!("{} {}", r, { r = &y; x = 5; 1 });', '}');
    assert.equal(diags(src), 'E0506@5,E0506@5', 'r = &y while &r is held, and x = 5 while r still holds &x');
  });
  it('a print arg that is a reference local is borrowed by format_args!, so a later arg that reassigns or writes through it is an error', () => {
    assert.equal(diags(IX('let y = 2;', 'let mut r = &x;', 'println!("{} {}", r, { r = &y; 1 });')), 'E0506@5');
    assert.equal(diags(IX('let r = &mut x;', 'println!("{} {}", r, { *r += 1; 1 });')), 'E0506@4');
    assert.equal(diags(IX('let r = &mut x;', 'println!("{} {}", r, { *r = 1; 1 });')), 'E0506@4');
    // an inline `{r}` is an implicit argument after the explicit ones, so it is borrowed after the block ran
    assert.equal(diags(IX('let y = 2;', 'let mut r = &x;', 'println!("{r} {}", { r = &y; 1 });')), '');
    assert.equal(diags(SI('let r = &mut s;', 'println!("{} {}", r, { r.push_str("b"); 1 });')), 'E0502@4');
    assert.equal(diags(P('fn one(a: &mut i32) {', '}', 'fn g(r: &mut i32) {', '    println!("{} {}", r, { one(r); 1 });', '}', 'fn main() {', '    let mut x = 1;', '    g(&mut x);', '}')), 'E0502@4');
    assert.equal(diags(IX('let y = 2;', 'let mut r = &x;', 'println!("{} {}", r, y);', 'r = &y;', 'println!("{}", r);')), '');
    assert.equal(diags(IX('let r = &mut x;', 'println!("{} {}", r, 1);', '*r += 1;', 'println!("{} {}", r, *r);')), '');
    assert.equal(diags(SI('let r = &mut s;', 'println!("{}", r);', 'r.push_str("b");', 'println!("{} {}", r, r);')), '');
  });
  it('a &mut local printed next to a shared use (len, clone) is fine; a &mut use still conflicts', () => {
    // passing a &mut local to a `&` param is a checker `reference coercion` unsupported, so a call arg needs no shared variant
    const FN = (...body) => P('fn f(s: &mut String) {', ...body, '}', 'fn main() {', '    let mut s = String::new();', '    f(&mut s);', '}');
    for (const use of ['s.len()', 's.clone()']) assert.equal(unsup(FN(`    println!("{} {}", s, ${use});`)), 'ok', use);
    assert.equal(diags(FN('    println!("{} {}", s, s.len());')), '');
    assert.equal(diags(FN('    println!("{} {}", s, { s.push_str("a"); 1 });')), 'E0502@2');
  });
  it('a print arg *r borrows r like r does (rustc takes &*r)', () => {
    assert.equal(diags(IX('let r = &mut x;', 'println!("{} {}", *r, x);')), 'E0502@4');
    assert.equal(diags(IX('let r = &mut x;', 'println!("{} {}", *r, { *r += 1; 1 });')), 'E0506@4');
    assert.equal(diags(IX('let r = &x;', 'println!("{} {}", *r, { x = 5; 1 });')), 'E0506@4');
    assert.equal(diags(IX('let r = &mut x;', 'println!("{} {}", *r, r);')), '');
    assert.equal(diags(IX('let r = &mut x;', 'println!("{} {}", *r, *r);')), '');
    assert.equal(diags(P('fn f(s: &mut String) {', '    println!("{} {}", *s, s.len());', '}', 'fn main() {', '    let mut s = String::new();', '    f(&mut s);', '}')), '');
  });
  it('a local moved before a sibling that borrows it is moved there', () => {
    const take = ['fn take(a: String, b: &String) {', '}'];
    assert.equal(diags(P(...take, 'fn main() {', '    let s = String::from("a");', '    take(s, &s);', '}')), 'E0382@5');
  });
  it('a local read next to plain siblings is not copied to a temp', () => {
    const c = RQ.compile(IX('let y = x + 1;', 'let s = String::new();'));
    const m = RQ.mir(c.ast, c.info).fns[0];
    assert.equal(m.locals.filter((l) => l.name === null).length, 0);
  });
});

describe('E0596: a mutable borrow of what is not mutable', () => {
  it('push_str on a local that is not mut, at the push_str', () => {
    assert.equal(diags(SIMPLE('let s = String::new();', 's.push_str("x");')), 'E0596@3');
    assert.equal(diags(SIMPLE('let mut s = String::new();', 's.push_str("x");')), '');
  });
  it('&mut of a local that is not mut, and of a param that is not mut', () => {
    assert.equal(diags(SIMPLE('let x = 5;', 'let r = &mut x;')), 'E0596@3');
    assert.equal(diags(SIMPLE('let mut x = 5;', 'let r = &mut x;')), '');
    assert.equal(diags(P('fn f(s: String) {', '    s.push_str("x");', '}', 'fn main() {', '}')), 'E0596@2');
  });
  it('a call argument: f(&mut x) on an immutable x is at the f( line', () => {
    const f = 'fn f(a: &mut i32) {}';
    assert.equal(diags(P(f, 'fn main() {', '    let x = 1;', '    f(&mut x);', '}')), 'E0596@4');
    assert.equal(diags(P(f, 'fn main() {', '    let mut x = 1;', '    f(&mut x);', '}')), '');
  });
  it('push_str through a &String param, and a &mut param that is not itself mut is fine', () => {
    assert.equal(diags(P('fn add(s: &String) {', '    s.push_str("x");', '}', 'fn main() {', '}')), 'E0596@2');
    assert.equal(diags(P('fn add(s: &mut String) {', '    s.push_str("x");', '}', 'fn main() {', '}')), '');
    assert.equal(diags(SI('let r = &mut s;', 'r.push_str("x");')), '');
  });
  it('names the source local when the receiver was copied to a temp before a later argument', () => {
    const d = RQ.compile(P('fn add(s: &String, x: String) {', '    s.push_str(x.as_str());', '}', 'fn main() {', '}')).diags;
    assert.deepEqual(d.map((e) => `${e.code}@${e.line}`), ['E0596@2']);
    assert.ok(d[0].msg.includes('`*s`'), d[0].msg);
  });
  it('a deferred let that is not mut', () => {
    assert.equal(diags(SIMPLE('let s: String;', 's = String::new();', 's.push_str("x");')), 'E0596@4');
  });
  it('is one coded error through RQ.run', () => {
    const c = RQ.run(SIMPLE('let x = 5;', 'let r = &mut x;'));
    assert.equal(c.status, 'error');
    assert.ok(c.onlyError('E0596'));
    assert.ok(c.hasError('E0596', 3));
  });
});

describe('E0597: a borrowed local goes out of scope', () => {
  const dangling = (open, close) => P('fn main() {', '    let r: &i32;', open, '        let x = 5;', '        r = &x;', close, '    println!("{}", r);', '}');
  it('a block ends while its local is borrowed, reported at the borrow', () => {
    assert.equal(diags(dangling('    {', '    }')), 'E0597@5');
  });
  it('the same text without the braces is fine', () => assert.equal(diags(dangling('     ', '     ')), ''));
  it('a break out of the loop kills the local', () => {
    const src = (decl) => P('fn main() {', '    let mut x = 5;', '    let r: &i32;', '    loop {', '        ' + decl + 'x = 5;', '        r = &x;', '        break;', '    }', '    println!("{}", r);', '}');
    assert.equal(diags(src('let ')), 'E0597@6');
    assert.equal(diags(src('')), '');
  });
  it('a for variable dies each iteration, and a continue or return with a holder nobody reads is fine', () => {
    assert.equal(diags(P('fn main() {', '    let z = 0;', '    let mut r = &z;', '    for i in 0..2 {', '        r = &i;', '    }', '    println!("{}", r);', '}')), 'E0597@5');
    assert.equal(diags(P('fn f(c: bool) {', '    let y = 1;', '    let mut r = &y;', '    loop {', '        let x = 5;', '        r = &x;', '        if c {', '            continue;', '        }', '        return;', '    }', '}', 'fn main() {', '    f(true);', '}')), '');
  });
  it('a loan ends when the local it borrows is declared again, dies or is assigned', () => {
    assert.equal(diags(P('fn main() {', '    let a = 1;', '    let mut r = &a;', '    loop {', '        let x = 5;', '        println!("{}", r);', '        r = &x;', '    }', '}')), 'E0597@7');
    assert.equal(diags(P('fn main() {', '    let a = 1;', '    let mut r = &a;', '    for i in 0..2 {', '        println!("{}", r);', '        r = &i;', '    }', '}')), 'E0597@6');
    assert.equal(diags(P('fn main() {', '    let mut x = 5;', '    let r = &x;', '    x = 6;', '    x = 7;', '    println!("{}", r);', '}')), 'E0506@4');
  });
  it('a block value that holds a loan to a block local', () => {
    assert.equal(diags(P('fn main() {', '    let r = {', '        let x = 5;', '        &x', '    };', '    println!("{}", r);', '}')), 'E0597@4');
  });
  it('a loan nobody uses after the scope is fine', () => {
    assert.equal(diags(SIMPLE('{', '    let x = 5;', '    let r = &x;', '    println!("{}", r);', '}')), '');
    assert.equal(diags(SIMPLE('let r: &i32;', '{', '    let x = 5;', '    r = &x;', '}')), '');
  });
  it('is one coded error through RQ.run', () => {
    const c = RQ.run(dangling('    {', '    }'));
    assert.equal(c.status, 'error');
    assert.ok(c.onlyError('E0597'));
    assert.ok(c.hasError('E0597', 5));
  });
});

describe('the unsupported list, end to end through RQ.run', () => {
  const sweep = (src, feature, line) => {
    const c = RQ.run(src);
    assert.equal(c.status, 'unsupported', feature);
    assert.equal(c.unsupported.feature, feature);
    assert.equal(c.unsupported.line, line, feature);
  };
  const sweepAll = (rows) => rows.forEach(([src, feature, line]) => sweep(src, feature, line));
  it('checker triggers', () => sweepAll([
    [P("fn f<'a>(s: &'a mut String) {}", 'fn main() {', '}'), 'explicit lifetime', 1],
    [P('fn f(x: &mut i32) -> &mut i32 {', '    x', '}', 'fn main() {', '}'), 'lifetime elision', 1],
    [SIMPLE('let x = 1;', 'let r = &x;', 'let rr = &r;'), 'reference to reference', 4],
    [SIMPLE('let mut s = String::new();', 'let r: &String = &mut s;'), 'reference coercion', 3],
    [SIMPLE('let mut s = String::new();', 'let r = &mut s;', 'let t = r.as_str();'), 'reborrow', 4],
    [SIMPLE('let a = [String::new(); 2];'), 'type checking', 2],
    [SIMPLE('let x;'), 'deferred initialization', 2],
    [SIMPLE('let s = String::new();', 's.foo();'), 'method call', 3],
    [SIMPLE('let s = String::default();'), 'path call', 2],
    [P('fn f(r: &i32) {', '    *r = 1;', '}', 'fn main() {', '}'), 'assignment target', 2],
    [SIMPLE('let x = 1;', 'let y = *x;'), 'dereference', 3]
  ]));
  it('mir triggers', () => sweepAll([
    [SIMPLE('let mut x = 1;', 'let r = &mut x;', 'let r2 = r;'), 'reborrow', 4],
    [SIMPLE('let x = 1;', 'let r = &x;', 'let r2 = &*r;'), 'reborrow', 4],
    [SIMPLE('let a = [1, 2];', 'let r = &a[0];'), 'borrow of a field', 3],
    [SIMPLE('let r = &String::new();'), 'temporary borrow', 2],
    [SIMPLE('let r = String::from("a").as_str();', 'println!("{}", r);'), 'temporary borrow', 2],
    [SIMPLE('let a = [String::new()];', 'let s = a[0];'), 'partial move', 3],
    [SIMPLE('let s = String::new();', 'let r = &s;', 'let t = *r;'), 'move out of reference', 4],
    [SIMPLE('let mut s = String::from("a");', 's.push_str(&s);'), 'two-phase borrow', 3],
    [SIMPLE('let s = String::new();', 'if true {', '}'), 'constant condition', 3],
    [SIMPLE(...Array.from({ length: 600 }, (_, i) => `let a${i} = ${i};`), 'let s = String::new();'), 'program too large', 1]
  ]));
  it('borrow triggers and the lint', () => sweepAll([
    [SIMPLE('let mut x = 5;', 'let r = &mut x;', 'let y = x;', '*r = 1;', 'println!("{}", y);'), 'use while borrowed', 4],
    [SIMPLE('let x = 5;', 'let r = &x;', 'let t = (r, 1);', 'println!("{}", t.1);'), 'reference in aggregate', 4],
    [SIMPLE('let x: u8 = 255;', 'let r = &x;', 'let y = x + 1;'), 'const folding', 4]
  ]));
  it('as_str on a temporary is never ok', () => {
    const c = RQ.run(SIMPLE('let r = String::from("a").as_str();', 'println!("{}", r);'));
    assert.notEqual(c.status, 'ok');
    assert.equal(c.status, 'unsupported');
  });
});

describe('large programs', () => {
  it('a doubling program stops with the string size limit, not a crash', () => {
    const c = RQ.run(SI('loop {', '    let t = s.clone();', '    s.push_str(&t);', '}'));
    assert.equal(c.status, 'limit');
    assert.equal(c.limit, 'string size');
  });
  it('a big generated program is checked and run fast', () => {
    const body = Array.from({ length: 90 }, (_, i) => [`let s${i} = String::from("a");`, `let r${i} = &s${i};`, `println!("{}", r${i});`]).flat();
    const t0 = Date.now();
    const c = RQ.run(SIMPLE(...body));
    assert.equal(c.status, 'ok');
    assert.equal(c.stdout, 'a\n'.repeat(90));
    assert.ok(Date.now() - t0 < 5000);
  });
  it('and the same program with a conflict at the end is one error', () => {
    const body = Array.from({ length: 90 }, (_, i) => [`let mut s${i} = String::from("a");`, `let r${i} = &s${i};`]).flat();
    const c = RQ.run(SIMPLE(...body, 's89.push_str("x");', 'println!("{}", r89);'));
    assert.equal(c.status, 'error');
    assert.ok(c.onlyError('E0502'));
  });
});
