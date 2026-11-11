import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// Every program here was compiled by the pinned rustc; the string after it is what rustc reported (a lint at a line, a run-time
// panic, or nothing). A trap sits in one arm, and whether rustc lints it shows whether it keeps what it knew about the locals
// (full), forgets it (blank) or never walks the arm.
const RQ = loadRust();
const verdict = (src) => {
  const c = RQ.run(src);
  if (c.status === 'error') return [...new Set(c.errors.map((e) => `${e.code || e.lint}@${e.line}`))].sort().join();
  return c.status === 'unsupported' ? `unsupported ${c.unsupported.feature}` : c.status === 'panic' ? 'panic' : c.status;
};

const PROBED = [
  [`fn f(n: u8) {
    let k = 0;
    match n {
        x if x > 3 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@4'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        x if x > 3 => { println!("x"); }
        _ => { println!("{}", 1 / k); }
    }
}
fn main() { f(3); }`, 'panic'],
  [`fn main() {
    let n: u8 = 3;
    let k = 0;
    match n {
        _ if k == 0 => { println!("x"); }
        _ => { let y: u8 = 255 + 1; println!("{}", y); }
    }
}`, 'ok'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        x if k == 0 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@4'],
  [`fn main() {
    let n: u8 = 0;
    let k = 0;
    match n {
        0 => { println!("{}", 1 / k); }
        x if x > 3 => { println!("x"); }
        _ => { println!("x"); }
    }
}`, 'panic'],
  [`fn main() {
    let n: u8 = 0;
    let k = 0;
    match n {
        0 => { println!("x"); }
        x if x > 3 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}`, 'unconditional_panic@6'],
  [`fn main() {
    let n: u8 = 3;
    let k = 0;
    match n {
        3 if k == 0 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}`, 'unconditional_panic@5'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        3 if k == 0 => { println!("x"); }
        _ => { println!("{}", 1 / k); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@5'],
  [`fn main() {
    let n: u8 = 3;
    let k = 0;
    match n {
        3 => { println!("{}", 1 / k); }
        _ if k == 0 => { println!("x"); }
        _ => { println!("x"); }
    }
}`, 'unconditional_panic@5'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        1..=5 if k == 0 => { println!("x"); }
        _ => { let y: u8 = 255 + 1; println!("{}", y); }
    }
}
fn main() { f(3); }`, 'arithmetic_overflow@5'],
  [`fn main() {
    let n: u8 = 0;
    let k = 0;
    match n {
        n @ 1..=5 if k == 0 => { println!("x"); }
        _ => { let y: u8 = 255 + 1; println!("{}", y); }
    }
}`, 'arithmetic_overflow@6'],
  [`fn main() {
    let n: u8 = 3;
    let k = 0;
    match n {
        0 => { println!("x"); }
        1..=5 if k == 0 => { println!("x"); }
        _ => { let y: u8 = 255 + 1; println!("{}", y); }
    }
}`, 'ok'],
  [`fn main() {
    let n: u8 = 3;
    let k = 0;
    match n {
        0 => { println!("x"); }
        1..=5 if k == 0 => { let y: u8 = 255 + 1; println!("{}", y); }
        _ => { println!("x"); }
    }
}`, 'arithmetic_overflow@6'],
  [`fn main() {
    let n: u8 = 3;
    let k = 0;
    match n {
        x if k == 1 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}`, 'ok'],
  [`fn main() {
    let n: u8 = 3;
    let k = 0;
    match n {
        3 if k == 1 => { println!("x"); }
        _ => { println!("{}", 1 / k); }
    }
}`, 'unconditional_panic@6'],
  [`fn main() {
    let n: u8 = 9;
    let k = 0;
    match n {
        0 | 3 if k == 0 => { println!("x"); }
        _ => { println!("{}", 1 / k); }
    }
}`, 'unconditional_panic@6'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        0 | 3 if k == 0 => { let y: u8 = 255 + 1; println!("{}", y); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'arithmetic_overflow@4'],
  [`fn main() {
    let n: u8 = 0;
    let k = 0;
    match n {
        x @ 0..=9 if x > 3 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}`, 'unconditional_panic@5'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        _ if k == 1 => { println!("x"); }
        _ if k == 0 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@5'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        2..=5 if k == 1 => { println!("x"); }
        3 | 4 => { println!("x"); }
        _ => { println!("{}", 1 / k); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@6'],
  [`fn main() {
    let n: u8 = 0;
    let k = 0;
    match n {
        x if x > 100 => { println!("x"); }
        1..=9 => { let y: u8 = 255 + 1; println!("{}", y); }
        _ => { println!("x"); }
    }
}`, 'arithmetic_overflow@6'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        0 => { println!("x"); }
        1..=9 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@5'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        1 | 7..=9 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@4'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        0 => { println!("x"); }
        1..=5 => { println!("{}", 1 / k); }
        6..=9 => { println!("x"); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@5'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        0 => { println!("x"); }
        1..=5 => { println!("x"); }
        6..=9 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'ok'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        0 => { println!("x"); }
        1..=5 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@5'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        0..=9 => { println!("{}", 1 / k); }
        10..=255 => { println!("x"); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@4'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        0..=9 => { println!("x"); }
        10..=255 => { println!("{}", 1 / k); }
    }
}
fn main() { f(3); }`, 'ok'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        1..=3 | 7..=9 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@4'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        0 | 1 => { println!("x"); }
        2..=9 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@5'],
  [`fn main() {
    let n: u8 = 3;
    let k = 0;
    match n {
        n @ 1..=5 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}`, 'unconditional_panic@5'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        0..=2 => { println!("{}", 1 / k); }
        3 | 4 => { println!("x"); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'unconditional_panic@4'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        3..=5 => { println!("x"); }
        5 => { let y: u8 = 255 + 1; println!("{}", y); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'arithmetic_overflow@5'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        5 => { println!("x"); }
        3..=7 => { println!("x"); }
        5 => { let y: u8 = 255 + 1; println!("{}", y); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'arithmetic_overflow@6'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        10 => { println!("x"); }
        1..=3 => { println!("x"); }
        10 => { let y: u8 = 255 + 1; println!("{}", y); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'ok'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        10 => { println!("x"); }
        10 => { let y: u8 = 255 + 1; println!("{}", y); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'ok'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        10 if k == 1 => { println!("x"); }
        10 => { let y: u8 = 255 + 1; println!("{}", y); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'arithmetic_overflow@5'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        10 if k == 0 => { println!("x"); }
        10 => { let y: u8 = 255 + 1; println!("{}", y); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'arithmetic_overflow@5'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        1 | 2 => { println!("x"); }
        2 => { let y: u8 = 255 + 1; println!("{}", y); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'ok'],
  [`fn f(n: u8) {
    let k = 0;
    match n {
        1 | 2 => { println!("x"); }
        2..=3 => { let y: u8 = 255 + 1; println!("{}", y); }
        _ => { println!("x"); }
    }
}
fn main() { f(3); }`, 'arithmetic_overflow@5'],
  [`fn main() {
    let k = 0;
    let n: u8 = 0;
    match n {
        0 => { println!("x"); }
        x if k == 1 => { println!("x"); }
        _ => { let y: u8 = 255 + 1; println!("{}", y); }
    }
}`, 'arithmetic_overflow@7'],
  [`fn main() {
    let k = 0;
    match 0u8 {
        0 => { println!("x"); }
        x if x > 3 => { println!("x"); }
        _ => { let y: u8 = 255 + 1; println!("{}", y); }
    }
}`, 'ok'],
  [`fn main() {
    let k = 0;
    let n: u8 = 1;
    match n {
        x if k == 1 => { println!("x"); }
        _ => { println!("x"); }
    }
    let z = n + 255;
    println!("{}", z);
}`, 'panic'],
  [`fn main() {
    let k = 0;
    let n: u8 = 1;
    match n {
        0 => { println!("x"); }
        _ if k == 1 => { println!("x"); }
        _ => { println!("x"); }
    }
    let z = n + 255;
    println!("{}", z);
}`, 'arithmetic_overflow@9'],
  [`fn main() {
    let k = 0;
    let n: u8 = 3;
    match n {
        x if x > 3 => { println!("{}", 1 / k); }
        _ => { println!("x"); }
    }
}`, 'unconditional_panic@5'],
  [`fn id(b: bool) -> bool { b }
fn main() {
    let k = 0;
    let c = id(false);
    match 0u8 {
        0 if !c => { println!("x"); }
        y => { println!("{}", 1 / k); }
    }
}`, 'unconditional_panic@7'],
  [`fn id(b: bool) -> bool { b }
fn main() {
    let k = 0;
    let c = id(false);
    match 0u8 {
        _ if !c => { println!("x"); }
        y => { println!("{}", 1 / k); }
    }
}`, 'unconditional_panic@7'],
  [`fn id(b: bool) -> bool { b }
fn main() {
    let k = 0;
    let c = id(false);
    match 0u8 {
        _ if c => { println!("x"); }
        y => { println!("{}", 1 / k); }
    }
}`, 'panic'],
];

describe('match arms with guards, ranges and or-patterns, where a trap meets them', () => {
  it('rustc lints the arm it walks with what it knew, and the arms it walks after a failed test without it', () => {
    for (const [src, want] of PROBED) assert.equal(verdict(src), want, src);
  });
  it('shapes that are not modeled stay unsupported', () => {
    const tuple = 'fn f(n: u8, k: i32) {\n    match (n, k) {\n        (1, _) => { let y: u8 = 255 + 1; println!("{}", y); }\n        _ => {}\n    }\n}\nfn main() { f(1, 0); }\n';
    assert.equal(verdict(tuple), 'unsupported const folding');
    const call = 'fn ok(n: u8) -> bool { n > 1 }\nfn f(n: u8) {\n    match n {\n        1 if ok(n) => { let y: u8 = 255 + 1; println!("{}", y); }\n        _ => {}\n    }\n}\nfn main() { f(1); }\n';
    assert.equal(verdict(call), 'unsupported const folding');
    const inLoop = 'fn f(n: u8) {\n    for _i in 0..2 {\n        match n {\n            1 if n > 0 => { let y: u8 = 255 + 1; println!("{}", y); }\n            _ => {}\n        }\n    }\n}\nfn main() { f(1); }\n';
    assert.equal(verdict(inLoop), 'unsupported const folding');
  });
});
