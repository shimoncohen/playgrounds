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
