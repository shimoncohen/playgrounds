import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

describe('unbuilt grep/find/pipe syntax says so instead of misbehaving', () => {
  const SQ = loadShell();
  const msg = (l) => run(SQ, l);
  it('grep real-but-unbuilt flags', () => {
    for (const f of ['-h', '-E', '-r', '-l', '-w', '-o', '-q']) {
      const r = msg(`grep ${f} wolf journal.txt`);
      assert.equal(r.out, `this practice shell does not support grep ${f} yet`);
      assert.notEqual(r.code, 0);
    }
    assert.match(msg('grep --color wolf journal.txt').out, /does not support grep --long options yet/);
    assert.match(msg('grep -j wolf journal.txt').out, /invalid option/);
  });
  it('grep keeps its beginner flags', () => {
    assert.equal(msg('grep -in map journal.txt | head -n 1').out, '5:Day 2. Found a strange map in an old tree.');
    assert.equal(msg('grep -ic wolf journal.txt').out, '4');
    assert.match(msg('grep -v Day journal.txt').out, /^The road/);
  });
  it('find -print is the default action, so it is accepted and changes nothing', () => {
    const plain = msg('find . -name gold.txt');
    assert.equal(msg('find . -name gold.txt -print').out, plain.out);
    assert.equal(msg('find . -name gold.txt -print').code, 0);
    assert.equal(msg('find . -type d -print').out, msg('find . -type d').out);
    assert.equal(msg('find -print').out, msg('find').out);
  });
  it('find -delete, -exec and friends', () => {
    for (const f of ['-delete', '-exec', '-maxdepth']) assert.equal(msg(`find . ${f} x`).out, `this practice shell does not support find ${f} yet`);
    assert.equal(msg('find . -name gold.txt').out, './forest/cave/deeper/chest/gold.txt');
    assert.match(msg('find . stray').out, /paths must come before/);
  });
  it('|& pipe', () => {
    const r = msg('ls |& wc -l');
    assert.equal(r.out, 'this practice shell does not support |& yet');
    assert.equal(msg('ls | wc -l').code, 0);
  });
});
