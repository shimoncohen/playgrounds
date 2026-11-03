import { describe, it } from 'node:test';
import strict from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// the engine runs in a vm realm, so its arrays and objects have another prototype and deepStrictEqual would reject them
const assert = { ...strict, deepEqual: (a, b, msg) => strict.equal(JSON.stringify(a), JSON.stringify(b), msg) };

const RQ = loadRust();
const { T, unify, show, isCopy, hasRef } = RQ.types;
const main = (body, items = '') => `${items}\nfn main() {\n${body}\n}\n`;
const i32 = T.int('i32');
// every program here has a one-line items part, so the first body line is line 3
const accepts = (body, items) => {
  const c = RQ.compile(main(body, items));
  assert.deepEqual([c.diags, c.unsupported], [[], []], body);
  return c;
};
const un = (body, items) => {
  const c = RQ.compile(main(body, items));
  assert.deepEqual(c.diags, [], body);
  return c.unsupported.map((u) => `${u.feature}@${u.line}`).join(',');
};
const code = (body, items) => {
  const c = RQ.compile(main(body, items));
  assert.deepEqual(c.unsupported, [], body);
  return c.diags.map((d) => `${d.code || d.lint}@${d.line}`).join(',');
};
const find = (c, pred) => { let n = null; RQ.walk(c.ast, (x) => { if (!n && pred(x)) n = x; }); return n; };
const pathOf = (name, nth = 0) => (x) => x.t === 'Path' && x.segs.length === 1 && x.segs[0].name === name && nth-- === 0;

describe('Copy table and reference types', () => {
  it('scalars, &T, &str and tuples/arrays of Copy are Copy; &mut T and String are not', () => {
    for (const t of [i32, T.float, T.bool, T.char, T.str, T.unit, T.never, T.ref(false, i32, 1), T.tuple([i32, T.ref(false, i32, 1)]), T.array(T.str, 2)]) assert.equal(isCopy(t), true, show(t));
    for (const t of [T.string, T.ref(true, i32, 1), T.tuple([i32, T.string]), T.array(T.ref(true, i32, 2), 1), T.tuple([i32, T.tuple([T.string])])]) assert.equal(isCopy(t), false, show(t));
  });
  it('hasRef finds a T.ref anywhere, but not in String or &str', () => {
    for (const t of [T.ref(false, i32, 1), T.tuple([T.ref(false, i32, 1), i32]), T.array(T.ref(true, i32, 1), 1)]) assert.equal(hasRef(t), true, show(t));
    for (const t of [T.tuple([i32, i32]), T.string, T.str, T.array(i32, 3)]) assert.equal(hasRef(t), false, show(t));
  });
  it('show and unify', () => {
    assert.equal(show(T.ref(false, i32, 1)), '&i32');
    assert.equal(show(T.ref(true, T.string, 2)), '&mut String');
    assert.equal(show(T.string), 'String');
    assert.equal(unify(T.ref(false, i32, 1), T.ref(false, i32, 2)), true);
    assert.equal(unify(T.ref(false, i32, 1), T.ref(true, i32, 2)), false);
    assert.equal(unify(T.ref(false, i32, 1), T.ref(false, T.int('u8'), 2)), false);
    assert.equal(unify(T.ref(false, i32, 1), i32), false);
    assert.equal(unify(T.string, T.str), false);
  });
  it('each reference the checker makes has its own numeric rg', () => {
    const c = accepts('    let x = 1;\n    let a = &x;\n    let b = &x;');
    const refs = [];
    RQ.walk(c.ast, (n) => { if (n.t === 'Ref' && n.expr) refs.push(RQ.types.res(c.info.get(n).ty)); });
    assert.equal(refs.length, 2);
    assert.ok(refs.every((r) => r.k === 'ref' && typeof r.rg === 'number'));
    assert.notEqual(refs[0].rg, refs[1].rg);
  });
  it('a tuple holding a String is accepted as a param and a return, and the uses carry its type', () => {
    const c = accepts('    let t = mk();\n    let u = t;', 'fn mk() -> (String, i32) { (String::from("a"), 1) }\nfn f(p: (String, i32)) { let q = p; }');
    for (const name of ['p', 't']) {
      const ty = RQ.types.res(c.info.get(find(c, pathOf(name))).ty);
      assert.equal(ty.k, 'tuple', name);
      assert.equal(RQ.types.res(ty.els[0]).k, 'String', name);
    }
  });
});

describe('the checker accepts the modeled String and reference shapes', () => {
  it('String::from, String::new, &s, &mut s, a &String param, *r', () => {
    accepts('    let s = String::from("a");');
    accepts('    let s = String::new();');
    accepts('    let s = String::from("a");\n    let r = &s;');
    accepts('    let mut s = String::new();\n    let r = &mut s;');
    accepts('    let s = String::new();\n    let n = size(&s);', 'fn size(s: &String) -> usize { s.len() }');
    accepts('    let x = 1;\n    let n = get(&x);', 'fn get(r: &i32) -> i32 { *r }');
    accepts('    let mut x = 1;\n    put(&mut x);', 'fn put(r: &mut i32) { *r = 1; *r += 2; }');
  });
  it('&String goes where &str is wanted, in a call and in push_str', () => {
    accepts('    let s = String::from("a");\n    show(&s);', 'fn show(s: &str) {}');
    accepts('    let t = String::from("b");\n    let mut s = String::new();\n    s.push_str(&t);');
    accepts('    let s = String::from("a");\n    let r: &str = &s;');
    accepts('    let t = String::from("b");\n    let mut s = String::new();\n    s.push_str("a");');
  });
  it('&str as a param and &\'static str as a return', () => {
    accepts('    show("a");', 'fn show(s: &str) {}');
    accepts('    let s = name();', "fn name() -> &'static str { \"a\" }");
    accepts("    show(\"a\");", "fn show(s: &'static str) {}");
  });
  it('String is printable with {} and {:?}, and so are references', () => {
    accepts('    let s = String::new();\n    println!("{} {:?}", s, s);\n    let r = &s;\n    println!("{r} {r:?}");');
  });
  it('let x: i32; is accepted, let x; is not', () => {
    accepts('    let x: i32;\n    x = 5;\n    println!("{}", x);');
    assert.equal(un('    let x;'), 'deferred initialization@3');
  });
  it('drop(s) is accepted unless the program defines drop', () => {
    accepts('    let s = String::new();\n    drop(s);');
    assert.equal(RQ.run(main('    drop(5);', 'fn drop(x: i32) { println!("mine {}", x); }')).out(), 'mine 5\n');
    assert.equal(un('    drop(1, 2);'), 'wrong argument count@3');
  });
  it('as_str on a temporary String is accepted (mir reports it)', () => {
    accepts('    let r = String::from("a").as_str();');
  });
});

describe('coercion', () => {
  it('String and &str do not convert either way: E0308', () => {
    assert.equal(code('    let x: String = "a";'), 'E0308@3');
    assert.equal(code('    let x: &str = String::from("a");'), 'E0308@3');
    assert.equal(code('    show(String::new());', 'fn show(s: &str) {}'), 'E0308@3');
    assert.equal(code('    let x: i32 = &5;'), 'E0308@3');
    assert.equal(code('    let x: &i32 = 5;'), 'E0308@3');
    assert.equal(code('    let x: &i32 = &String::new();'), 'E0308@3');
    assert.equal(code('    let x: &String = &5;'), 'E0308@3');
    assert.equal(code('    let x: (i32, i32) = &5;'), 'E0308@3');
  });
  it('other reference mismatches are reference coercion', () => {
    assert.equal(un('    let mut s = String::new();\n    show(&mut s);', 'fn show(s: &str) {}'), 'reference coercion@4');
    assert.equal(un('    let mut s = String::new();\n    let r: &String = &mut s;'), 'reference coercion@4');
    assert.equal(un('    let mut s = String::new();\n    let r: &str = &mut s;'), 'reference coercion@4');
    assert.equal(un('    let mut x = 1;\n    let r: &i32 = &mut x;'), 'reference coercion@4');
    assert.equal(un('    let x = 1;\n    let r: &mut i32 = &x;'), 'reference coercion@4');
    assert.equal(un('    let s = "a";\n    let r: &String = s;'), 'reference coercion@4');
  });
  it('a reference to a &str is reference to reference, not E0308', () => {
    assert.equal(un('    let t: &str = "a";\n    show(&t);', 'fn show(s: &str) {}'), 'reference to reference@4');
    assert.equal(un('    let x = 1;\n    let r = &x;\n    let rr = &r;'), 'reference to reference@5');
    assert.equal(un('    let x: &&i32;', 'fn show() {}'), 'reference to reference@3');
  });
});

describe('checker-stage unsupported triggers', () => {
  it('lifetimes', () => {
    assert.equal(un('', "fn f(s: &'a str) {}"), 'explicit lifetime@1');
    assert.equal(un('', "fn f(s: &'static String) {}"), 'explicit lifetime@1');
    assert.equal(un('', "fn f(s: &'a str) -> &'a str { s }"), 'explicit lifetime@1');
  });
  it('lifetime elision: a returned reference without a lifetime, which also closes the base false accept', () => {
    assert.equal(un('', 'fn f() -> &str { "a" }'), 'lifetime elision@1');
    assert.equal(un('', 'fn f(s: &String) -> &String { s }'), 'lifetime elision@1');
    assert.equal(un('', 'fn f(x: &mut i32) -> &mut i32 { x }'), 'lifetime elision@1');
    assert.equal(un('', 'fn f(s: &String) -> (i32, &str) { (1, "a") }'), 'lifetime elision@1');
  });
  it('reborrow: as_str on a &mut String', () => {
    assert.equal(un('    let mut s = String::new();\n    let r = &mut s;\n    let t = r.as_str();'), 'reborrow@5');
  });
  it('type checking: array repeat of a non-Copy element', () => {
    assert.equal(un('    let a = [String::new(); 2];'), 'type checking@3');
    accepts('    let a = [1; 2];\n    let b = [(1, 2); 2];');
  });
  it('the names that stay', () => {
    assert.equal(un('    let s = String::default();'), 'path call@3');
    assert.equal(un('    let s = String::from("a", "b");'), 'wrong argument count@3');
    assert.equal(un('    let s = String::new();\n    s.foo();'), 'method call@4');
    assert.equal(un('    let n = 5;\n    n.len();'), 'method call@4');
    assert.equal(un('    let n = 5;\n    let m = *n;'), 'dereference@4');
    assert.equal(un('', 'fn f(r: &i32) { *r = 1; }'), 'assignment target@1');
    assert.equal(un('    let r: &mut str;'), 'reference@3');
  });
  it('a type argument on String is still String, not a crash', () => {
    assert.equal(un('    let s: String<i32>;'), 'String@3');
  });
});

describe('methods', () => {
  const ok = (recv, call) => accepts('', `fn t(s: ${recv}) { ${call}; }`);
  it('len on String, &String, &mut String and &str', () => {
    for (const r of ['String', '&String', '&mut String', '&str']) ok(r, 's.len()');
  });
  it('clone on String, &String and &mut String', () => {
    for (const r of ['String', '&String', '&mut String']) ok(r, 'let c: String = s.clone()');
  });
  it('as_str on String and &String', () => {
    for (const r of ['String', '&String']) ok(r, 'let c: &str = s.as_str()');
  });
  it('push_str on String and &mut String, and through &String (E0596 is a borrow-pass error)', () => {
    for (const r of ['String', '&mut String', '&String']) ok(r, 's.push_str("x")');
  });
  it('every other receiver or name is method call', () => {
    const no = (recv, call) => assert.equal(un('', `fn t(s: ${recv}) { ${call}; }`), 'method call@1', `${recv} ${call}`);
    for (const c of ['s.clone()', 's.as_str()', 's.push_str("x")', 's.foo()']) no('&str', c);
    no('String', 's.foo()');
    no('&mut String', 's.trim()');
    no('i32', 's.len()');
  });
  it('as_str on a &mut String is reborrow, and a wrong argument count is not guessed', () => {
    assert.equal(un('', 'fn t(s: &mut String) { s.as_str(); }'), 'reborrow@1');
    assert.equal(un('', 'fn t(s: String) { s.len(1); }'), 'wrong argument count@1');
    assert.equal(un('', 'fn t(s: String) { s.push_str(); }'), 'wrong argument count@1');
  });
  it('push_str takes a &str: a String argument is E0308', () => {
    assert.equal(code('', 'fn t(s: &mut String, u: String) { s.push_str(u); }'), 'E0308@1');
  });
  it('a method name that is an Object member gives unsupported, never a crash', () => {
    for (const m of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      const src = main(`    let s = String::new();\n    s.${m}();`);
      assert.equal(RQ.compile(src).unsupported[0].feature, 'method call', m);
      assert.equal(RQ.run(src).status, 'unsupported', m);
    }
  });
});

describe('what the checker records in info', () => {
  it('ty on every expression', () => {
    const c = accepts('    let n = 1 + 2;\n    let s = String::new();');
    for (const lit of ['Binary', 'Call']) assert.ok(c.info.get(find(c, (x) => x.t === lit)).ty, lit);
    assert.equal(RQ.types.res(c.info.get(find(c, (x) => x.t === 'Call')).ty).k, 'String');
  });
  it('bind on param patterns, on Deref targets and on the Path uses', () => {
    const c = accepts('', 'fn put(r: &mut i32) { *r = 1; }');
    const pat = find(c, (x) => x.t === 'IdentPat' && x.name === 'r');
    const bind = c.info.get(pat).bind;
    assert.equal(bind.kind, 'param');
    assert.equal(c.info.get(find(c, (x) => x.t === 'Deref')).bind, bind);
    assert.equal(c.info.get(find(c, pathOf('r'))).bind, bind);
  });
  it('caps on the format string: the inline names with their bind', () => {
    const c = accepts('    let s = 1;\n    println!("{s} and {s}");');
    const lit = find(c, (x) => x.t === 'Lit' && x.kind === 'str');
    const caps = c.info.get(lit).caps;
    assert.deepEqual(caps.map((x) => x.name), ['s', 's']);
    assert.equal(caps[0].bind, c.info.get(find(c, (x) => x.t === 'IdentPat' && x.name === 's')).bind);
  });
  it('recv on a MethodCall: method, receiver kind, adjustment', () => {
    const recv = (body, items) => { const c = accepts(body, items); return c.info.get(find(c, (x) => x.t === 'MethodCall')).recv; };
    assert.deepEqual(recv('    let s = String::new();\n    s.len();'), { method: 'len', kind: 'place', adj: '&' });
    assert.deepEqual(recv('    let mut s = String::new();\n    s.push_str("a");'), { method: 'push_str', kind: 'place', adj: '&mut' });
    assert.deepEqual(recv('', 'fn t(r: &mut String) { r.push_str("a"); }'), { method: 'push_str', kind: 'refvar', adj: 'val' });
    assert.deepEqual(recv('    String::new().len();'), { method: 'len', kind: 'temp', adj: '&' });
  });
  it('sig on a Call: the callee param and return types', () => {
    const c = accepts('    let n = twice(1);', 'fn twice(a: i32) -> i32 { a }');
    const sig = c.info.get(find(c, (x) => x.t === 'Call')).sig;
    assert.deepEqual([sig.params.map(show), show(sig.ret)], [['i32'], 'i32']);
    const d = accepts('    let s = String::from("a");');
    assert.deepEqual([d.info.get(find(d, (x) => x.t === 'Call')).sig.params.map(show), show(d.info.get(find(d, (x) => x.t === 'Call')).sig.ret)], [['&str'], 'String']);
  });
});

describe('lint with references', () => {
  const lintOf = (body, items) => { const c = RQ.compile(main(body, items)); return [c.diags.map((d) => `${d.lint || d.code}@${d.line}`), c.unsupported.map((u) => `${u.feature}@${u.line}`)]; };
  it('does not throw on a let without an init', () => {
    const c = RQ.run(main('    let x: i32;'));
    assert.equal(c.status, 'unsupported');
    assert.equal(c.unsupported.feature, 'deferred initialization');
  });
  it('still walks Ref, MethodCall and Deref children, and a method call is a barrier', () => {
    assert.deepEqual(lintOf('    let r = &(255u8 + 1);'), [['arithmetic_overflow@3'], []]);
    assert.deepEqual(lintOf('    let mut x: u8 = 255;\n    x = 255;\n    let y = x + 1;'), [['arithmetic_overflow@5'], []]);
    assert.deepEqual(lintOf('', 'fn t(s: &String) {\n    let mut x: u8 = 255;\n    x = 255;\n    let y = x + 1;\n}'), [['arithmetic_overflow@4'], []]);
    assert.deepEqual(lintOf('', 'fn t(s: &String) {\n    let mut x: u8 = 255;\n    x = 255;\n    let n = s.len();\n    let y = x + 1;\n}'), [[], ['const folding@5']]);
  });
  it('&mut x forgets the value of x', () => {
    assert.deepEqual(lintOf('    let mut x: u8 = 255;\n    let r = &mut x;\n    *r = 0;\n    let y = x + 1;'), [[], []]);
  });
  it('a local borrowed anywhere in the fn is const folding, not a verdict', () => {
    assert.deepEqual(lintOf('    let x: u8 = 255;\n    let r = &x;\n    let y = x + 1;'), [[], ['const folding@5']]);
    assert.deepEqual(lintOf('    let x: u8 = 255;\n    let y = x + 1;'), [['arithmetic_overflow@4'], []]);
    assert.deepEqual(lintOf('    let x: u8 = 255;\n    let y = x + 1;\n    let r = &x;'), [[], ['const folding@4']]);
  });
  it('an assignment through a Deref stores nothing and folds nothing', () => {
    assert.deepEqual(lintOf('    let mut x: i32 = 1;\n    let r = &mut x;\n    *r = 255u8 as i32;\n    let y = *r + 2147483647;'), [[], []]);
    assert.deepEqual(lintOf('    let mut x: i32 = 2147483647;\n    let r = &mut x;\n    *r += 1;'), [[], []]);
    assert.deepEqual(lintOf('    let mut x: u8 = 0;\n    let r = &mut x;\n    *r = 255u8 + 1;'), [['arithmetic_overflow@5'], []]);
  });
});

describe('no internal between batches', () => {
  const programs = {
    'deferred let': 'fn main() {\n    let x: i32;\n    x = 5;\n    println!("{}", x);\n}',
    'String::from': 'fn main() {\n    let s = String::from("a");\n}',
    drop: 'fn main() {\n    let s = String::new();\n    drop(s);\n}',
    'write through &mut': 'fn put(r: &mut i32) { *r = 1; }\nfn main() {\n    let mut x = 0;\n    put(&mut x);\n}',
    len: 'fn main() {\n    let s = String::new();\n    println!("{}", s.len());\n}',
    '&s': 'fn main() {\n    let s = String::new();\n    let r = &s;\n}',
    'tuple of String param': 'fn f(p: (String, i32)) {}\nfn main() {\n    println!("hi");\n}',
    'tuple of String return': 'fn mk() -> (String, i32) { (String::from("a"), 1) }\nfn main() {\n    let t = mk();\n}',
    'inline name of a deferred let': 'fn main() {\n    let x: i32;\n    println!("{x}");\n}',
  };
  for (const [name, src] of Object.entries(programs)) {
    it(name, () => assert.notEqual(RQ.run(src).status, 'internal', RQ.run(src).message));
  }
  it('the interpreter guards report the construct', () => {
    const feat = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src); return c.unsupported.feature; };
    assert.equal(feat(main('    let x: i32;')), 'deferred initialization');
    assert.equal(feat(main('    let s = String::from("a");')), 'call');
    assert.equal(feat(main('    drop(1);')), 'call');
  });
  it('an assignment to a non-Path target is unsupported even if it gets past the checker', () => {
    const r = RQ.parse(RQ.lex('fn main() {\n    let r = 5;\n    *r = 1;\n}'));
    const c = RQ.interp(r.ast, { info: new Map() });
    assert.equal(c.status, 'unsupported');
    assert.equal(c.unsupported.feature, 'assignment target');
  });
});
