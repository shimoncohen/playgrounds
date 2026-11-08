// Network Quest: a mission passes only on the commands it asks for. Pings and traces stay out of the list on purpose: several
// missions accept any traffic that teaches the lesson (see content.test.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const UNRELATED = ['help', 'echo hi', 'ip addr', 'ip route', 'ip neigh', 'nat'];
// `ip addr` also lists each card's MAC, so this mission takes it as well as its answer `ip link`
const ALSO_OWN = { 'Your own card': ['ip addr'] };
const expectOf = (m) => {
  if (!m.question) return null;
  const net = NQ.createNet(m.scenario, m.setup);
  const history = m.answer.map((line) => { const r = net.exec(line, m.dev); return { line, code: r.code, entries: r.entries }; });
  return m.question.expect(NQ.makeCtx(net, history, null));
};

describe('an unrelated command never completes a mission', () => {
  NQ.CH.forEach((ch, c) => ch.missions.forEach((m, i) => {
    it(`${c}.${i} ${m.title}`, () => {
      const expect = expectOf(m);
      for (const line of UNRELATED.filter((l) => !m.answer.includes(l) && !(ALSO_OWN[m.title] || []).includes(l))) {
        assert.notEqual(NQ.runMission(m, [line], expect), true, line);
      }
    });
  }));
});
