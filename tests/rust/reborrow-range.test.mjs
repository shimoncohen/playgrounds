import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

const RQ = loadRust();
const main = (body, pre = '') => `${pre}fn main() {\n    ${body.split('\n').join('\n    ')}\n}\n`;
const out = (src) => { const c = RQ.run(src); assert.equal(c.status, 'ok', `${src} ${JSON.stringify(c.errors)} ${JSON.stringify(c.unsupported)}`); return c.stdout; };
const feature = (src) => { const c = RQ.run(src); assert.equal(c.status, 'unsupported', src); return c.unsupported.feature; };
const fn = (body, sig = 'x: &mut [i32]') => `fn f(${sig}) {\n    ${body}\n}\n\n`;

describe('a range of a &mut slice parameter, used by one method call', () => {
  it('sorts, reverses and swaps only that window, for a slice, a Vec and an array behind the reference', () => {
    assert.equal(out(fn('x[1..].sort();') + main('let mut v = vec![9, 3, 1, 2];\nf(&mut v);\nprintln!("{:?}", v);')), '[9, 1, 2, 3]\n');
    assert.equal(out(fn('x[..2].reverse();\nx[1..3].swap(0, 1);') + main('let mut v = [9, 3, 1, 2];\nf(&mut v);\nprintln!("{:?}", v);')), '[3, 1, 9, 2]\n');
    assert.equal(out(fn('x[1..].sort();', 'x: &mut Vec<i32>') + main('let mut v = vec![9, 3, 1, 2];\nf(&mut v);\nprintln!("{:?}", v);')), '[9, 1, 2, 3]\n');
    assert.equal(out(fn('x[1..].sort();', 'x: &mut [i32; 4]') + main('let mut v = [9, 3, 1, 2];\nf(&mut v);\nprintln!("{:?}", v);')), '[9, 1, 2, 3]\n');
    assert.equal(out(fn('x[1..3].sort_by(|a, b| b.cmp(a));') + main('let mut v = [9, 1, 3, 2];\nf(&mut v);\nprintln!("{:?}", v);')), '[9, 3, 1, 2]\n');
  });

  it('may be used again by the next statement, since the reborrow ends with the call', () => {
    assert.equal(out(fn('x[1..].sort();\nx[0] = 0;\nx[1..].reverse();\nprintln!("{:?}", x);') + main('let mut v = [9, 3, 1, 2];\nf(&mut v);')), '[0, 3, 2, 1]\n');
    assert.equal(out(fn('let n = x.len() / 2;\nx[..n].sort();\nx[n..].sort();') + main('let mut v = [9, 3, 2, 1];\nf(&mut v);\nprintln!("{:?}", v);')), '[3, 9, 1, 2]\n');
    assert.equal(out(fn('x[1..].sort();', 'x: &mut [i32]') + main('let mut v = vec![9, 3, 1, 2];\nf(&mut v[1..]);\nprintln!("{:?}", v);')), '[9, 3, 1, 2]\n');
  });

  it('a bound that is too big panics at the range, as for any slice', () => {
    const c = RQ.run(fn('x[n..].sort();', 'x: &mut [i32], n: usize') + main('let mut v = vec![9, 3, 1, 2];\nf(&mut v, 9);'));
    assert.equal(c.status, 'panic');
    assert.equal(c.panic.msg, 'range start index 9 out of range for slice of length 4');
  });

  it('is unsupported while the reborrow is kept, or the call reads the same reference', () => {
    assert.equal(feature(fn('let r = &mut x[1..];\nx[0] = 5;\nr.sort();') + main('let mut v = [9, 3, 1, 2];\nf(&mut v);')), 'reborrow');
    assert.equal(feature(fn('x[x.len() - 2..].sort();') + main('let mut v = [9, 3, 1, 2];\nf(&mut v);')), 'reborrow');
    assert.equal(feature(fn('for y in x[1..].iter_mut() {\n    *y += 1;\n}') + main('let mut v = [9, 3, 1, 2];\nf(&mut v);')), 'reborrow');
    assert.equal(feature(fn('let r = &x[1..];\nx.sort();\nprintln!("{:?}", r);') + main('let mut v = [9, 3, 1, 2];\nf(&mut v);')), 'reborrow');
  });

  it('a shared slice cannot be sorted: E0596', () => {
    const c = RQ.run(fn('x[1..].sort();', 'x: &[i32]') + main('let v = [9, 3, 1, 2];\nf(&v);'));
    assert.equal(c.status, 'error');
    assert.equal(c.errors[0].code, 'E0596');
  });
});
