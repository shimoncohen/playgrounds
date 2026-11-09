// Learner-chosen names that are also Object.prototype members must behave like any other name.
// rustc accepts every program here (with a non_camel_case_types or non_snake_case warning for some).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const NAMES = ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty'];
const PLAIN = 'Zzq';
const FOR = {
  enum: (n) => `enum ${n} { A, B(i32) }\nfn main() { let e = ${n}::B(2); match e { ${n}::A => println!("a"), ${n}::B(x) => println!("{}", x) } if let ${n}::B(y) = e { println!("{}", y); } }`,
  struct: (n) => `struct ${n} { x: i32 }\nfn main() { let s = ${n} { x: 1 }; println!("{}", s.x); }`,
  field: (n) => `struct S { ${n}: i32 }\nfn main() { let s = S { ${n}: 1 }; println!("{}", s.${n}); }`,
  variable: (n) => `fn main() { let ${n} = 5; let mut v = vec![${n}]; v.push(${n}); println!("{:?}", v); }`,
  fn: (n) => `fn ${n}(a: i32) -> i32 { a + 1 }\nfn main() { println!("{}", ${n}(2)); }`,
  method: (n) => `struct S;\nimpl S { fn ${n}(&self) -> i32 { 3 } }\nfn main() { println!("{}", S.${n}()); }`,
  trait: (n) => `trait ${n} { fn f(&self) -> i32; }\nstruct S;\nimpl ${n} for S { fn f(&self) -> i32 { 1 } }\nfn g<T: ${n}>(t: T) -> i32 { t.f() }\nfn main() { println!("{}", g(S)); }`,
  'trait in where': (n) => `trait ${n} { fn f(&self) -> i32; }\nstruct S;\nimpl ${n} for S { fn f(&self) -> i32 { 1 } }\nfn g<T>(t: T) -> i32 where T: ${n} { t.f() }\nfn main() { println!("{}", g(S)); }`,
  'impl Trait argument': (n) => `trait ${n} { fn f(&self) -> i32; }\nstruct S;\nimpl ${n} for S { fn f(&self) -> i32 { 1 } }\nfn g(t: impl ${n}) -> i32 { t.f() }\nfn main() { println!("{}", g(S)); }`,
  'derive list': (n) => `#[derive(${n})]\nstruct S;\nfn main() {}`,
  'generic parameter': (n) => `fn f<${n}>(x: ${n}) -> ${n} { x }\nfn main() { println!("{}", f(1)); }`,
  'format name': (n) => `fn main() { let ${n} = 1; println!("{${n}}"); }`,
  use: (n) => `use ${n};\nfn main() {}`,
  'unknown macro': (n) => `fn main() { ${n}!("x"); }`,
  'unknown type': (n) => `fn main() { let x: ${n} = 1; }`,
  'unknown method': (n) => `fn main() { let x = 5; x.${n}(); }`,
};
const sig = (c, n) => JSON.stringify([c.status, c.errors.map((e) => e.code || e.lint), c.stdout.split(n).join('N'), c.stderr.split(n).join('N')]);

describe('names that collide with Object.prototype members', () => {
  for (const [what, make] of Object.entries(FOR)) {
    it(`${what}: no internal error, and the same verdict as an ordinary name`, () => {
      const base = RQ.run(make(PLAIN));
      for (const n of NAMES) {
        const c = RQ.run(make(n));
        assert.notEqual(c.status, 'internal', `${n}: ${c.message}`);
        assert.equal(sig(c, n), sig(base, PLAIN), n);
        assert.equal(c.unsupported && c.unsupported.feature.split(n).join(PLAIN), base.unsupported && base.unsupported.feature, n);
      }
    });
  }
});

describe('a struct literal does not need a capitalised name', () => {
  it('lower-case struct names work', () => {
    const c = RQ.run('struct foo { x: i32 }\nfn main() { let a = foo { x: 1 }; println!("{}", a.x); }');
    assert.equal(c.status, 'ok');
    assert.equal(c.stdout, '1\n');
  });
  it('an if, while, match or for head still reads the brace as the body', () => {
    const c = RQ.run('fn main() { let x = 3; if x == 3 { println!("a"); } while x < 3 { } match x { 3 => println!("m"), _ => {} } for i in 0..x { println!("{}", i); } }');
    assert.equal(c.status, 'ok');
  });
});
