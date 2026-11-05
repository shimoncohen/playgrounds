import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent } from './harness.mjs';

const { tokens } = loadAgent();

describe('tokens.estimate is chars/4 rounded up', () => {
  it('counts', () => {
    assert.equal(tokens.estimate(''), 0);
    assert.equal(tokens.estimate('abcd'), 1);
    assert.equal(tokens.estimate('abcde'), 2);
    assert.equal(tokens.estimate('x'.repeat(400)), 100);
  });
  it('treats a missing value as empty text', () => {
    assert.equal(tokens.estimate(null), 0);
    assert.equal(tokens.estimate(undefined), 0);
  });
});
