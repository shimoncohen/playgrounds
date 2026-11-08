// Network Quest: a mission passes only on the commands it asks for. Pings and traces stay out of the list on purpose: several
// missions accept any traffic that teaches the lesson (see content.test.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const UNRELATED = ['help', 'echo hi', 'ip addr', 'ip route', 'ip neigh', 'nat'];
// `ip addr` also lists each card's MAC, so a mission answered by `ip link` takes it too
const ALSO_OWN = { 'ip link': ['ip addr'] };
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
      for (const line of UNRELATED.filter((l) => !m.answer.includes(l) && !m.answer.some((a) => (ALSO_OWN[a] || []).includes(l)))) {
        assert.notEqual(NQ.runMission(m, [line], expect), true, line);
      }
    });
  }));
});
