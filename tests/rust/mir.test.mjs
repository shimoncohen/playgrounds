import { describe, it } from 'node:test';
import strict from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// the engine runs in a vm realm, so its arrays and objects have another prototype and deepStrictEqual would reject them
const assert = { ...strict, deepEqual: (a, b, msg) => strict.equal(JSON.stringify(a), JSON.stringify(b), msg) };

const RQ = loadRust();
// every program here has a one-line items part, so the first body line is line 3
const main = (body, items = '') => `${items}\nfn main() {\n${body}\n}\n`;
// a String makes main analysed, so a test about control flow or a trigger can put its own lines after it
const S = '    let s = String::new();\n';
const lower = (src) => { const c = RQ.compile(src); assert.ok(c.ast, src); return { c, m: RQ.mir(c.ast, c.info) }; };
const mfn = (body, items = '', name = 'main') => lower(main(body, items)).m.fns.find((f) => f.name === name);
const analysed = (body, items = '', name = 'main') => {
  const c = RQ.compile(main(body, items));
  return RQ.mir.analysed(c.ast.items.find((i) => i.t === 'Fn' && i.name === name), c.info, c.ast);
};
const un = (body, items = '') => lower(main(body, items)).m.unsupported.map((u) => `${u.feature}@${u.line}`).join(',');

const dump = (f) => {
  const nm = (l) => f.locals[l].name || `_${l}`;
  const op = (x) => (x.k === 'const' ? 'const' : `${x.reb ? 'reb' : x.k} ${nm(x.l)}`);
  const ops = (a) => a.map(op).join(', ');
  const rv = (r) => ({
    use: () => op(r.x), const: () => 'const', ref: () => `&${r.mut ? 'mut ' : ''}${nm(r.l)}`, call: () => `${r.fn}(${ops(r.args)})`,
    method: () => `${op(r.recv)}.${r.name}(${ops(r.args)})`, op: () => `op(${ops(r.args)})`, agg: () => `agg(${ops(r.args)})`,
    deref: () => `*${op(r.x)}`, macro: () => `${r.name}!(${ops(r.args)})`
  })[r.k]();
  return f.blocks.map((b) => b.instrs.map((i) => ({
    decl: () => `decl ${nm(i.l)}${i.uninit ? ' uninit' : ''}`, assign: () => `${nm(i.l)} = ${rv(i.rv)}`, eval: () => rv(i.rv),
    store: () => `*${op(i.ref)} = ${op(i.x)}`, dead: () => `dead ${nm(i.l)}`, branch: () => `branch ${op(i.x)}`, return: () => `return${i.x ? ' ' + op(i.x) : ''}`
  })[i.op]())).flat();
};
const branches = (f) => f.blocks.filter((b) => b.instrs.some((i) => i.op === 'branch'));

describe('RQ.BORROW_FEATURES', () => {
  it('lists the names the mir pass reports', () => {
    // borrow.js pushes its own names after these
    assert.deepEqual(RQ.BORROW_FEATURES.slice(0, 7), ['borrow of a field', 'temporary borrow', 'partial move', 'move out of reference', 'two-phase borrow', 'constant condition', 'program too large']);
    for (const f of RQ.BORROW_FEATURES) assert.ok(RQ.diag.UNSUPPORTED[f] && RQ.diag.UNSUPPORTED[f].length > 10, f);
  });
});

describe('the skip rule: RQ.mir.analysed', () => {
  it('each syntactic trigger makes a fn analysed', () => {
    assert.equal(analysed('    let x = 1;\n    let r = &x;'), true, 'Ref');
    assert.equal(analysed('    let n = "abc".len();'), true, 'MethodCall');
    assert.equal(analysed('    drop(5);'), true, 'drop');
    assert.equal(analysed('    let s = String::new();'), true, 'String::new');
    assert.equal(analysed('    let s = String::from("a");'), true, 'String::from');
    assert.equal(analysed('    let x: i32;\n    x = 5;'), true, 'deferred let');
    assert.equal(analysed('    let x = 1;', 'fn g(r: &i32) -> i32 { *r }', 'g'), true, 'Deref');
  });
  it('drop is a trigger only when it is not a user fn', () => {
    assert.equal(analysed('    drop(5);', 'fn drop(x: i32) {}'), false);
  });
  it('a param, local or temp that is not Copy, or holds a reference, makes a fn analysed', () => {
    assert.equal(analysed('', 'fn f(s: String) {}', 'f'), true);
    assert.equal(analysed('', 'fn f(r: &mut i32) {}', 'f'), true);
    assert.equal(analysed('', 'fn f(r: &i32) {}', 'f'), true);
    assert.equal(analysed('', 'fn f(p: (String, i32)) { let q = p; }', 'f'), true);
    assert.equal(analysed('', 'fn f(p: [String; 1]) {}', 'f'), true);
    assert.equal(analysed('', 'fn f(p: (&i32, i32)) {}', 'f'), true);
    assert.equal(analysed('    let t = mk();\n    let u = t;', 'fn mk() -> (String, i32) { (String::from("a"), 1) }'), true, 'main only holds the tuple');
  });
  it('a Copy-only fn, a boolean && fn and a &str-only fn are not analysed', () => {
    assert.equal(analysed('    let x = 1;\n    let y = x + 1;\n    println!("{}", y);'), false);
    assert.equal(analysed('    let a = true;\n    let b = a && false || a;'), false);
    assert.equal(analysed('    let s = "hi";\n    println!("{}", s);'), false);
    assert.equal(analysed('', 'fn f(s: &str) { let t = s; }', 'f'), false);
    assert.equal(analysed('', 'fn f(p: (i32, i32), q: [u8; 3]) { let a = p; let b = q; }', 'f'), false);
  });
  it('RQ.mir lowers only the analysed fns', () => {
    const { m } = lower(main(S, 'fn plain(x: i32) { let y = x; }'));
    assert.deepEqual(m.fns.map((f) => f.name), ['main']);
  });
});

describe('lowering: the instructions', () => {
  it('a println! of an owned local borrows it, and so does an inline name', () => {
    assert.deepEqual(dump(mfn(S + '    let n = 5;\n    println!("{} {n}", s);')), [
      'decl s', 's = String::new()', 'decl n', 'n = const', '_2 = &s', '_3 = &n', 'println!(copy _2, copy _3)', 'dead n', 'dead s', 'return']);
  });
  it('a println! of a reference local borrows it like an owned one, a Field argument borrows just that field and an Index its root', () => {
    assert.deepEqual(dump(mfn('    let x = 1;\n    let r = &x;\n    let t = (1, 2);\n    let a = [1, 2];\n    let i = 0;\n    println!("{} {} {}", r, t.0, a[i]);')), [
      'decl x', 'x = const', 'decl r', 'r = &x', 'decl t', 't = agg(const, const)', 'decl a', 'a = agg(const, const)', 'decl i', 'i = const',
      '_5 = &r', '_7 = &t.0', 'op(copy i)', '_8 = &a', 'println!(copy _5, copy _7, copy _8)', 'dead i', 'dead a', 'dead t', 'dead r', 'dead x', 'return']);
  });
  it('Copy and non-Copy operands are classified by type, a tuple holding a String moves', () => {
    const f = mfn('', 'fn f(p: (String, i32), q: (i32, i32)) { let a = p; let b = q; }', 'f');
    assert.deepEqual(dump(f), ['decl a', 'a = move p', 'decl b', 'b = copy q', 'dead b', 'dead a', 'dead q', 'dead p', 'return']);
    assert.deepEqual(f.locals.map((l) => [l.name, l.param, l.mut]), [['p', true, false], ['q', true, false], ['a', false, false], ['b', false, false]]);
  });
  it('reading a Field is a copy of that field, an Index a copy of the root, and the index is a use', () => {
    assert.deepEqual(dump(mfn(S + '    let t = (1, 2);\n    let a = [1, 2];\n    let i = 0;\n    let x = t.0;\n    let y = a[i];')).slice(8), [
      'decl x', 'x = copy t.0', 'decl y', 'y = op(copy a, copy i)', 'dead y', 'dead x', 'dead i', 'dead a', 'dead t', 'dead s', 'return']);
  });
  it('a String local moves into a call, a &T copies, a &mut passed to a call or method is a use and not a move', () => {
    assert.deepEqual(dump(mfn(S + '    let t = s;\n    drop(t);')).slice(2, 6), ['decl t', 't = move s', 'drop(move t)', 'dead t']);
    const items = 'fn g(a: &mut i32, b: &i32) {}';
    const f = mfn('', items + ' fn h(r: &mut i32, q: &i32, m: &mut String) { g(r, q); g(r, q); m.push_str("x"); }', 'h');
    assert.deepEqual(dump(f).slice(0, 3), ['g(reb r, copy q)', 'g(reb r, copy q)', 'reb m.push_str(const)']);
    assert.ok(!dump(f).some((l) => l.includes('move r') || l.includes('move m')));
  });
  it('an autoref receiver makes a ref temp, and the result carries it', () => {
    assert.deepEqual(dump(mfn(S + '    let r = s.as_str();\n    let mut t = s.clone();\n    t.push_str("x");\n    let n = t.len();')), [
      'decl s', 's = String::new()', 'decl r', '_2 = &s', 'r = copy _2.as_str()', 'decl t', '_4 = &s', 't = copy _4.clone()', '_5 = &mut t', 'move _5.push_str(const)',
      'decl n', '_7 = &t', 'n = copy _7.len()', 'dead n', 'dead t', 'dead r', 'dead s', 'return']);
  });
  it('a store through a reference, a read through it and a compound assign', () => {
    const f = mfn('', 'fn f(r: &mut i32) { *r = 1; *r += 2; let y = *r; }', 'f');
    assert.deepEqual(dump(f), ['*reb r = const', '_1 = *reb r', '_2 = op(copy _1, const)', '*reb r = copy _2', 'decl y', 'y = *reb r', 'dead y', 'dead r', 'return']);
  });
  it('a deferred let is uninit and an assignment is a whole-local assign', () => {
    assert.deepEqual(dump(mfn('    let mut x: i32;\n    x = 5;\n    x += 1;\n')), ['decl x uninit', 'x = const', 'x = op(copy x, const)', 'dead x', 'return']);
  });
  it('block-valued expressions write to a dest temp, or to the let', () => {
    const f = mfn(S + '    let c = true;\n    let x = if c { 1 } else { 2 };\n    println!("{}", if c { 1 } else { 3 });');
    const writes = (name) => f.blocks.filter((b) => b.instrs.some((i) => i.op === 'assign' && (f.locals[i.l].name || null) === name && i.rv.k === 'use'));
    assert.equal(writes('x').length, 2);
    assert.equal(writes(null).length, 2);
  });
  it('&& and || evaluate the right side on its own path', () => {
    const f = mfn(S + '    let a = true;\n    let b = a && a;');
    assert.equal(branches(f).length, 1);
    assert.equal(branches(f)[0].succ.length, 2);
  });
  it('each instr carries an ast id that resolves to a node, with a line and column', () => {
    const { c, m } = lower(main(S + '    let mut n = 0;\n    while n < 3 {\n        n += 1;\n        let t = s.clone();\n        println!("{}", t);\n    }\n    for i in 0..2 {\n        if i == 1 {\n            break;\n        }\n    }\n    let v = loop {\n        break 5;\n    };\n    return;', 'fn g(r: &mut i32) -> i32 { *r = 2; return *r; }'));
    const ids = new Set();
    RQ.walk(c.ast, (n) => { ids.add(n.id); });
    for (const f of m.fns) for (const b of f.blocks) for (const i of b.instrs) {
      assert.ok(ids.has(i.ast), `${f.name} ${i.op}`);
      assert.ok(i.line >= 1 && i.col >= 1, `${f.name} ${i.op}`);
    }
  });
  it('lowering twice gives the same graph', () => {
    const src = main(S + '    let mut n = 0;\n    while n < 3 {\n        n += 1;\n    }', 'fn g(r: &mut i32) { *r = 2; }');
    assert.equal(JSON.stringify(lower(src).m), JSON.stringify(lower(src).m));
  });
});

describe('lowering: control flow', () => {
  it('if joins both arms', () => {
    const f = mfn(S + '    let c = true;\n    if c {\n        println!("a");\n    } else {\n        println!("b");\n    }');
    assert.equal(branches(f).length, 1);
    const [a, b] = branches(f)[0].succ;
    assert.equal(f.blocks[a].succ.length, 1);
    assert.equal(f.blocks[a].succ[0], f.blocks[b].succ[0]);
  });
  it('while has a back-edge to its head and an exit', () => {
    const f = mfn(S + '    let mut n = 0;\n    while n < 3 {\n        n += 1;\n    }');
    const [head] = branches(f);
    assert.equal(head.succ.length, 2);
    assert.ok(f.blocks.some((b) => b.id > head.id && b.succ.includes(head.id)), 'back-edge');
    assert.equal(f.blocks[head.succ[1]].unreachable, false);
    assert.deepEqual(f.blocks[head.succ[1]].succ, []);
  });
  it('a loop with no break leaves its exit unreachable', () => {
    const f = mfn(S + '    loop {\n        println!("x");\n    }');
    assert.equal(f.blocks[0].unreachable, false);
    const last = f.blocks.find((b) => b.instrs.some((i) => i.op === 'return'));
    assert.equal(last.unreachable, true);
  });
  it('a loop with a break value writes the value to its dest', () => {
    const f = mfn(S + '    let v = loop {\n        break 5;\n    };\n    println!("{}", v);');
    assert.ok(dump(f).includes('v = const'));
    assert.equal(f.blocks.find((b) => b.instrs.some((i) => i.op === 'return')).unreachable, false);
  });
  it('for over a range has a back-edge through its increment, and the loop variable dies each round', () => {
    const f = mfn(S + '    for i in 0..3 {\n        println!("{}", i);\n    }');
    const [head] = branches(f);
    assert.equal(head.succ.length, 2);
    const inc = f.blocks.find((b) => b.succ.length === 1 && b.succ[0] === head.id && b.id > head.id);
    assert.ok(inc, 'back-edge');
    assert.ok(dump(f).includes('dead i'));
    assert.ok(f.blocks.find((b) => b.succ.includes(inc.id)).instrs.some((i) => i.op === 'dead' && f.locals[i.l].name === 'i'));
  });
  it('break, continue and return kill the locals of every scope they leave, innermost first', () => {
    const f = mfn(S + '    let mut n = 0;\n    loop {\n        let t = String::new();\n        n += 1;\n        if n < 3 {\n            continue;\n        }\n        break;\n    }');
    const withDead = f.blocks.filter((b) => b.instrs.some((i) => i.op === 'dead' && f.locals[i.l].name === 't'));
    assert.deepEqual(withDead.map((b) => b.unreachable), [false, false, true]);
    const g = mfn('', 'fn g(a: String) { let b = String::new(); { let c = String::new(); return; } }', 'g');
    assert.deepEqual(dump(g), ['decl b', 'b = String::new()', 'decl c', 'c = String::new()', 'dead c', 'dead b', 'dead a', 'return', 'dead c', 'dead b', 'dead a', 'return']);
  });
  it('code after a return is in an unreachable block', () => {
    const g = mfn('', 'fn g(s: String) { return; println!("x"); }', 'g');
    assert.ok(g.blocks.some((b) => b.unreachable && b.instrs.some((i) => i.op === 'eval')));
    assert.equal(g.blocks[0].unreachable, false);
  });
});

describe('what the mir pass leaves unsupported', () => {
  it('reports the trigger with its line, in an analysed fn', () => {
    assert.equal(un('    let a = [1, 2];\n    let r = &a[1];'), 'borrow of a field@4');
    assert.equal(un('    let a = [1, 2];\n    let r = &a[0];'), 'borrow of a field@4');
    assert.equal(un('    let r = &5;'), 'temporary borrow@3');
    assert.equal(un('    let r = &String::new();'), 'temporary borrow@3');
    assert.equal(un('    let mut x = 1;\n    let r = &mut x;\n    let r2 = r;'), 'reborrow@5');
    assert.equal(un('    let mut x = 1;\n    let r = &mut x;\n    let r2: &mut i32 = r;'), 'reborrow@5');
    assert.equal(un('    let x = 1;\n    let r = &x;\n    let r2 = &*r;'), 'reborrow@5');
    assert.equal(un('    let mut x = 1;\n    let r = &mut x;\n    let r2 = &mut *r;'), 'reborrow@5');
    assert.equal(un('    let a = [String::new()];\n    let s = a[0];'), 'partial move@4');
    assert.equal(un('    let s = String::new();\n    let r = &s;\n    let t = *r;'), 'move out of reference@5');
    assert.equal(un('    let mut s = String::from("a");\n    s.push_str(&s);'), 'two-phase borrow@4');
    assert.equal(un(S + '    if true {\n    }'), 'constant condition@4');
    assert.equal(un(S + '    while false {\n    }'), 'constant condition@4');
  });
  it('lets a Copy read through a reference and the implicit reborrows pass, but not a &String of a temporary', () => {
    assert.equal(un('    let mut x = 1;\n    let r = &mut x;\n    *r = 2;\n    let y = *r;\n    println!("{}", r);'), '');
    assert.equal(un('    let mut s = String::from("a");\n    let t = String::from("b");\n    s.push_str(&t);\n    s.push_str(&t.clone());'), 'temporary borrow@6');
    assert.equal(un('    let t = (String::from("a"), 1);\n    let n = t.1;'), '');
  });
  it('a fn the pass skips reports nothing', () => {
    assert.equal(un('    let t = (1, 2);\n    let u = t.0;\n    if true {\n    }'), '');
  });
  it('as_str on a temporary String is a temporary borrow, and nothing else is', () => {
    assert.equal(un('    let r = String::from("a").as_str();\n    println!("{}", r);'), 'temporary borrow@3');
    assert.equal(un('    let s = String::from("a");\n    let r = s.clone().as_str();\n    println!("{}", r);'), 'temporary borrow@4');
    assert.equal(un('    let s = String::from("a");\n    let r = s.as_str();\n    println!("{}", r);'), '');
    assert.equal(un('    let n = String::from("a").len();'), '');
    assert.equal(un('    let s = String::from("a");\n    let n = s.clone().len();\n    let mut t = String::new();\n    t.clone().push_str("x");'), '');
    assert.equal(un('    let s = String::from("a");\n    let r = (&s).as_str();\n    println!("{}", r);'), '');
  });
  it('a program past the instr or local cap is program too large, fast', () => {
    const t0 = Date.now();
    const lets = Array.from({ length: 600 }, (_, i) => `    let a${i} = ${i};`).join('\n');
    assert.equal(un(S + lets), 'program too large@2');
    assert.deepEqual(lower(main(S + lets)).m.fns, []);
    const prints = Array.from({ length: 6000 }, () => '    println!("a");').join('\n');
    assert.equal(un(S + prints), 'program too large@2');
    assert.ok(Date.now() - t0 < 5000);
  });
});
