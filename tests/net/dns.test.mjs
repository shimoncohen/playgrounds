// Network Quest: the DNS model (zones, resolver, cache) on the dns scenarios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();

test('dns.js and cmds-dns.js load', () => {
  assert.equal(typeof NQ.dns, 'object');
  assert.equal(typeof NQ.dnsCmds, 'object');
});
