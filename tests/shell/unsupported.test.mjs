import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

describe('unbuilt grep/find/pipe syntax says so instead of misbehaving', () => {
  const SQ = loadShell();
  const msg = (l) => run(SQ, l);
  it('grep real-but-unbuilt flags', () => {
    for (const f of ['-P', '-z', '-f', '-a']) {
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

describe('grep -E', () => {
  it('is accepted as a no-op, like sed -E', () => {
    const SQ = loadShell();
    const plain = run(SQ, 'grep "wolf|owl" journal.txt');
    const ere = run(SQ, 'grep -E "wolf|owl" journal.txt');
    assert.equal(ere.code, 0);
    assert.ok(ere.out.length > 0);
    assert.equal(ere.out, plain.out);
    assert.equal(run(SQ, 'grep -iE "WOLF|owl" journal.txt').out, run(SQ, 'grep -i "WOLF|owl" journal.txt').out);
    assert.equal(run(SQ, 'grep -cE "wolf|owl" journal.txt').out, run(SQ, 'grep -c "wolf|owl" journal.txt').out);
  });
});

describe('fd duplication other than 2>&1 and >&2 is reported as unsupported', () => {
  const SQ = loadShell();
  const UNSUP = { out: 'this practice shell does not support >& yet', code: 2 };
  it('N>&M and N>&- / >&- print the >& message (not a syntax error)', () => {
    for (const l of ['echo a 2>&2', 'echo a 2>&-', 'echo a >&-', 'echo a 1>&-', 'echo a >&1', 'echo a 3>&1', 'ls nope 2>&3']) assert.deepEqual(run(SQ, l), UNSUP, l);
  });
  it('>&2, 1>&2 and 2>&1 keep working', () => {
    assert.deepEqual(run(SQ, 'echo a >&2'), { out: 'a', code: 0 });
    assert.deepEqual(run(SQ, 'echo a 1>&2'), { out: 'a', code: 0 });
    assert.deepEqual(run(SQ, 'ls nope 2>&1 | wc -l'), { out: '1', code: 0 });
  });
});
