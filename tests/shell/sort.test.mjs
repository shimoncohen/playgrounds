import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const SQ = loadShell();
run(SQ, "echo 'b,10,x\na,9,y\nc,100,z\nd,9,w' > t.csv");
const sorted = (args) => run(SQ, `sort ${args} t.csv`).out.split('\n');

describe('sort -t / -k', () => {
  it('numeric key with a separator', () => {
    assert.deepEqual(sorted('-t, -k2 -n'), ['a,9,y', 'd,9,w', 'b,10,x', 'c,100,z']);
    assert.deepEqual(sorted('-t , -k 2 -n -r'), ['c,100,z', 'b,10,x', 'd,9,w', 'a,9,y']);
    assert.deepEqual(sorted('-nr -t, -k2,2'), ['c,100,z', 'b,10,x', 'd,9,w', 'a,9,y']);
  });
  it('lexical key', () => {
    assert.deepEqual(sorted('-t, -k2'), ['b,10,x', 'c,100,z', 'd,9,w', 'a,9,y']); // -k2 runs to the end of the line, like GNU sort
    assert.deepEqual(sorted('-t, -k2,2'), ['b,10,x', 'c,100,z', 'a,9,y', 'd,9,w']);
    assert.deepEqual(sorted('-t, -k3 -r'), ['c,100,z', 'a,9,y', 'b,10,x', 'd,9,w']);
  });
  it('whitespace fields without -t', () => {
    run(SQ, "echo 'x 3\ny 1\nz 2' > w.txt");
    assert.equal(run(SQ, 'sort -k2 -n w.txt').out, 'y 1\nz 2\nx 3');
  });
  it('plain sort behaviour is unchanged', () => {
    assert.equal(run(SQ, 'echo "b\nA\nc" | sort').code, 0);
    assert.equal(run(SQ, "echo '10\n9\n100' > n.txt; sort -n n.txt").out, '9\n10\n100');
    assert.equal(run(SQ, 'sort -nr n.txt').out, '100\n10\n9');
  });
  it('invalid keys give an error, not an exception', () => {
    for (const bad of ['-k0', '-kx', '-k1,0', '-k']) {
      const r = run(SQ, `sort ${bad} t.csv`);
      assert.equal(r.code, 2, bad);
      assert.match(r.out, /^sort: /, bad);
    }
    assert.match(run(SQ, 'sort -t,, t.csv').out, /multi-character tab/);
  });
  it('unsupported real options say so', () => {
    for (const o of ['-f', '-b', '-h', '-M', '-o', '-s', '-c', '-g', '-V', '--version']) {
      assert.equal(run(SQ, `sort ${o} t.csv`).out, `this practice shell does not support sort ${o} yet`, o);
    }
    assert.match(run(SQ, 'sort -q t.csv').out, /invalid option -- 'q'/);
  });
});

describe('sort -k key modifiers n, r and b', () => {
  const shop = (args) => run(SQ, `sort ${args} village/shop.txt`).out.split('\n');
  const BY_PRICE_DESC = ['map 20', 'rope 12', 'torch 8', 'bread 3', 'apple 2'];
  it('-k2nr, -k2,2n, -k2,2nr and -k 2n are accepted', () => {
    assert.deepEqual(shop('-k2nr'), BY_PRICE_DESC);
    assert.deepEqual(shop('-k 2nr'), BY_PRICE_DESC);
    assert.deepEqual(shop('-k2,2nr'), BY_PRICE_DESC);
    assert.deepEqual(shop('-k2,2n'), [...BY_PRICE_DESC].reverse());
    assert.deepEqual(shop('-k 2n'), [...BY_PRICE_DESC].reverse());
    assert.deepEqual(shop('-k2,2n -r'), [...BY_PRICE_DESC].reverse()); // like GNU: a key with its own order options ignores the global -r
    assert.deepEqual(shop('-k2b,2bn'), [...BY_PRICE_DESC].reverse());
  });
  it('a per-key r reverses only that key', () => {
    run(SQ, "echo 'x 1\ny 1\nx 2' > pairs.txt");
    assert.deepEqual(run(SQ, 'sort -k1,1 -k2,2nr pairs.txt').out.split('\n'), ['x 2', 'x 1', 'y 1']);
    assert.deepEqual(run(SQ, 'sort -k1,1r -k2,2n pairs.txt').out.split('\n'), ['y 1', 'x 1', 'x 2']);
  });
  it('other modifiers say so', () => {
    for (const x of ['f', 'd', 'g', 'h', 'M', 'V', 'i']) {
      const r = run(SQ, `sort -k2${x} village/shop.txt`);
      assert.equal(r.out, `this practice shell does not support sort key modifier ${x} yet`, x);
      assert.notEqual(r.code, 0);
    }
    assert.equal(run(SQ, 'sort -k2,2nf village/shop.txt').out, 'this practice shell does not support sort key modifier f yet');
  });
  it('bad keys still print the number error, the 8.7 answer still works', () => {
    assert.match(run(SQ, 'sort -k0n village/shop.txt').out, /invalid number at field start/);
    assert.match(run(SQ, 'sort -kn village/shop.txt').out, /invalid number at field start/);
    SQ.content.chapters[7].setup();
    assert.equal(run(SQ, 'sort -t, -k2 -n -r village/sales.csv | head -n 1').out, 'bread,30,3');
  });
});
