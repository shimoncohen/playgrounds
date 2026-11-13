// Network Quest: a mission session checks without replaying every line typed so far.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const LOOP = NQ.CH[3].missions[5];

test('a session runs each line once: a check never re-executes the history', () => {
  const s = NQ.session(LOOP);
  let execs = 0;
  const exec = s.net.exec;
  s.net.exec = (...a) => { execs++; return exec(...a); };
  for (let i = 0; i < 12; i++) { s.run('traceroute 8.8.8.8'); s.check(null); }
  assert.equal(execs, 12);
});

test('a check traces each distinct address once, however often it was typed', () => {
  const s = NQ.session(LOOP);
  for (let i = 0; i < 12; i++) s.run('traceroute 8.8.8.8');
  const real = NQ.sim.traceroute;
  let calls = 0;
  NQ.sim.traceroute = (...a) => { calls++; return real(...a); };
  try { assert.equal(s.check(null), NQ.ASK); } finally { NQ.sim.traceroute = real; }
  assert.ok(calls <= 2, 'one trace per check of the address, not one per line typed: ' + calls);
});

test('a probe copy of the network starts with an empty log but the same devices', () => {
  const s = NQ.session(LOOP);
  s.run('traceroute 8.8.8.8');
  assert.ok(s.net.log.length > 0);
  const p = s.net.probe();
  assert.equal(p.log.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(p.devices)), JSON.parse(JSON.stringify(s.net.devices)));
});

test('a long session still reaches the same verdict as a short one', () => {
  const long = NQ.session(LOOP);
  for (let i = 0; i < 25; i++) long.run('traceroute 8.8.8.8');
  const short = NQ.session(LOOP);
  short.run('traceroute 8.8.8.8');
  assert.equal(long.check(null), short.check(null));
  const answer = NQ.runMission(LOOP, ['traceroute 8.8.8.8'], null) === NQ.ASK;
  assert.ok(answer);
});
