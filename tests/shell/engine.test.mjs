import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

describe('shell engine', () => {
  it('pwd prints the home path', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'pwd').out, '/home/explorer');
  });
  it('cd then pwd', () => {
    const SQ = loadShell();
    run(SQ, 'cd /tmp');
    assert.equal(run(SQ, 'pwd').out, '/tmp');
  });
  it('echo to a file then cat', () => {
    const SQ = loadShell();
    run(SQ, 'echo hi > a.txt');
    assert.equal(run(SQ, 'cat a.txt').out, 'hi');
  });
  it('grep -i with pipe', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, 'cat journal.txt | grep -i wolf | wc -l').out, '4');
  });
  it('unknown command suggests a fix', () => {
    const SQ = loadShell();
    assert.ok(run(SQ, 'lss').out.includes('Did you mean: ls?'));
  });
});
