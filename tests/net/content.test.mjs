// Network Quest content: every mission is solvable by its own answer, its check is not fooled by the starter state or
// a lazy answer, and a question's answer is computed from the network, never written in the mission text.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const plain = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&(?:gt|lt|amp|quot);/g, ' ');
// the run a learner would make: the reference lines on a fresh net, then the question's computed answer
const solve = (m, lines = m.answer) => {
  const net = NQ.createNet(m.scenario, m.setup), history = lines.map((line) => ({ line, code: net.exec(line, m.dev).code }));
  const ctx = NQ.makeCtx(net, history, null);
  return { net, ctx, expect: m.question ? m.question.expect(ctx) : undefined };
};
// tokens of normalised text, trimmed of sentence punctuation, so "IPv4." still counts as "ipv4"
const toks = (s) => NQ.norm(plain(s)).split(',').map((t) => t.replace(/^[.:!?()"'`]+|[.:!?()"'`]+$/g, '')).filter(Boolean);
const leaks = (text, ans) => { const t = toks(text), a = toks(ans); return t.some((_, i) => a.every((x, j) => t[i + j] === x)); };

describe('every mission of every chapter', () => {
  const keys = new Set();
  NQ.CH.forEach((ch, c) => ch.missions.forEach((m, i) => {
    const id = `${c}.${i} ${m.title}`;
    describe(id, () => {
      it('has a unique key and a known scenario whose setup runs', () => {
        assert.ok(!keys.has(`${c}.${i}`)); keys.add(`${c}.${i}`);
        assert.ok(Object.prototype.hasOwnProperty.call(NQ.SCENARIOS, m.scenario), m.scenario);
        assert.doesNotThrow(() => NQ.createNet(m.scenario, m.setup));
        assert.ok(Array.isArray(m.answer) && m.answer.length && m.answer.every((l) => typeof l === 'string' && l.trim()));
        for (const f of ['title', 'goal', 'explain', 'hint']) assert.ok(typeof m[f] === 'string' && m[f].trim(), f);
      });
      it('the reference answer passes', () => {
        assert.equal(NQ.runMission(m, m.answer, solve(m).expect), true);
      });
      it('doing nothing does not pass, with or without the answer typed in', () => {
        assert.equal(typeof NQ.runMission(m, []), 'string');
        assert.equal(typeof NQ.runMission(m, [], solve(m).expect), 'string');
      });
      it('every reference line succeeds', () => {
        const net = NQ.createNet(m.scenario, m.setup);
        for (const l of m.answer) assert.equal(net.exec(l, m.dev).code, 0, l);
      });
      it('how starts with the whole line, then the parts', () => {
        assert.ok(Array.isArray(m.how) && m.how.length >= 3 && m.how.length <= 5, 'three to five steps');
        assert.match(m.how[0], /<code>[^<]+<\/code>/);
        assert.ok(plain(m.how[0]).trim().length > 20);
        for (const [, k] of m.anat || []) assert.ok(Object.prototype.hasOwnProperty.call(NQ.KINDS, k), k);
      });
      if (m.question) {
        it('the question\'s answer is computed and never written in the mission text', () => {
          const { expect } = solve(m);
          assert.ok(typeof expect === 'string' && expect.trim(), 'expect is a non-empty string');
          assert.ok(typeof m.question.ask === 'string' && m.question.ask.trim());
          for (const t of [m.goal, m.explain, m.hint, m.question.ask, ...m.how]) assert.ok(!leaks(t, expect), `"${expect}" leaks in: ${plain(t)}`);
        });
        it('a wrong or missing answer fails without giving the answer away', () => {
          const { expect } = solve(m);
          for (const a of ['not-it', '', '   ']) {
            const r = NQ.runMission(m, m.answer, a);
            assert.equal(typeof r, 'string');
            assert.ok(!leaks(r, expect), r);
          }
        });
      }
    });
  }));
});

describe('chapter 1: lazy answers are caught', () => {
  const m = (i) => NQ.CH[0].missions[i];
  const run = (i, lines, a) => NQ.runMission(m(i), lines, a);
  it('1: looking at your own address is not a ping', () => assert.notEqual(run(0, ['ip addr']), true));
  it('1: pinging an address nobody has gets no reply, so it does not pass', () => assert.notEqual(run(0, ['ping -c 1 10.0.0.9']), true));
  it('1: pinging yourself puts nothing on the wire', () => assert.notEqual(run(0, ['ping -c 1 10.0.0.2']), true));
  it('2: one layer is not the whole stack', () => {
    assert.notEqual(run(1, m(1).answer, 'Ethernet'), true);
    assert.notEqual(run(1, m(1).answer, 'ICMP, IPv4, Ethernet'), true);
    assert.equal(run(1, m(1).answer, 'ethernet → ipv4 → icmp'), true);
  });
  it('2-5: the right answer without a ping first does not pass', () => {
    for (const i of [1, 2, 3, 4]) assert.notEqual(run(i, ['ip addr'], solve(m(i)).expect), true, String(i));
  });
  it('3: the reply\'s TTL line is read from the request\'s own packet', () => assert.notEqual(run(2, m(2).answer, '63'), true));
  it('4: the empty MAC in the ARP body is not the frame\'s destination', () => {
    assert.notEqual(run(3, m(3).answer, '00:00:00:00:00:00'), true);
    assert.notEqual(run(3, m(3).answer, '02:00:00:00:00:02'), true);
    assert.equal(run(3, m(3).answer, 'FF:FF:FF:FF:FF:FF'), true);
  });
  it('5: the outer layer holds MACs, not IP addresses', () => {
    assert.notEqual(run(4, m(4).answer, 'Ethernet'), true);
    assert.notEqual(run(4, m(4).answer, 'ICMP'), true);
  });
  it('6: one probe is not enough, and the count comes from your own command', () => {
    assert.notEqual(run(5, ['ping -c 1 10.0.0.3'], '1'), true);
    assert.notEqual(run(5, ['ping 10.0.0.3'], '4'), true);
    assert.notEqual(run(5, ['ping -c 3 10.0.0.9'], '3'), true);
    assert.equal(run(5, ['ping -c 5 10.0.0.3'], '5'), true);
    assert.notEqual(run(5, ['ping -c 5 10.0.0.3'], '3'), true);
    assert.equal(run(5, ['ping -c 2 10.0.0.3', 'ping -c 4 10.0.0.3'], '4'), true);
  });
});

describe('the check context', () => {
  it('ctx.ping probes a clone: the learner\'s log and ARP caches stay as they were', () => {
    const net = NQ.createNet('pair'), ctx = NQ.makeCtx(net, [], null);
    const before = net.log.length, neigh = JSON.stringify(net.devices.laptop.neigh), pn = JSON.stringify(net.devices.phone.neigh);
    const r = ctx.ping('laptop', '10.0.0.3');
    assert.equal(r.delivered, true);
    assert.equal(r.replyFrom, '10.0.0.3');
    assert.deepEqual([...r.hops], ['laptop', 'sw1', 'phone']);
    assert.equal(net.log.length, before);
    assert.equal(JSON.stringify(net.devices.laptop.neigh), neigh);
    assert.equal(JSON.stringify(net.devices.phone.neigh), pn);
    assert.equal(ctx.ping('laptop', '10.0.0.9').delivered, false);
  });
  it('route, addr, last, layers, entries, history and answered', () => {
    const net = NQ.createNet('office');
    net.exec('ping -c 1 172.16.0.10');
    const ctx = NQ.makeCtx(net, [{ line: 'ping -c 1 172.16.0.10', code: 0 }], ' 42 ');
    assert.deepEqual({ ...ctx.route('laptop', '172.16.0.10') }, { via: '192.168.1.1', dev: 'eth0' });
    assert.equal(ctx.route('printer', '172.16.0.10'), null);
    assert.deepEqual({ ...ctx.addr('r1') }, { eth0: '192.168.1.1/24', eth1: '10.0.1.1/30' });
    const e = ctx.last((x) => x.dev === 'laptop' && x.dir === 'rx');
    assert.equal(e, net.log.findLast((x) => x.dev === 'laptop' && x.dir === 'rx'));
    assert.deepEqual([...ctx.layers(e)], ['Ethernet', 'IPv4', 'ICMP']);
    assert.equal(ctx.last(() => false), null);
    assert.equal(ctx.entries, net.log);
    assert.equal(ctx.history[0].line, 'ping -c 1 172.16.0.10');
    assert.equal(ctx.answered, ' 42 ');
    assert.equal(NQ.makeCtx(net, [], undefined).answered, null);
  });
  it('NQ.norm treats spaces, commas and arrows alike and keeps MACs and numbers', () => {
    const want = 'ethernet,ipv4,icmp';
    for (const s of ['Ethernet → IPv4 → ICMP', 'ethernet ipv4 icmp', 'Ethernet,IPv4,ICMP', ' Ethernet > IPv4 | ICMP ', 'ETHERNET; ipv4,  icmp'])
      assert.equal(NQ.norm(s), want, s);
    assert.equal(NQ.norm('FF:FF:FF:FF:FF:FF'), 'ff:ff:ff:ff:ff:ff');
    assert.equal(NQ.norm(' 64 '), '64');
    assert.equal(NQ.norm(''), '');
  });
  it('runMission runs the lines on the mission\'s dev', () => {
    const m = { scenario: 'office', dev: 'r1', answer: ['ping -c 1 172.16.0.10'],
      check: (c) => c.last((e) => e.dev === 'r1' && e.dir === 'tx') && !c.entries.some((e) => e.dev === 'laptop') ? true : 'run it on r1' };
    assert.equal(NQ.runMission(m, m.answer), true);
    assert.equal(NQ.runMission({ ...m, dev: undefined }, m.answer), 'run it on r1');
    const seen = [];
    NQ.runMission({ ...m, check: (c) => { seen.push(...c.history); return true; } }, ['ip addr', 'nope']);
    assert.deepEqual(seen.map((h) => [h.line, h.code]), [['ip addr', 0], ['nope', 127]]);
  });
  it('runMission asks for an answer, then compares it normalised', () => {
    const m = { scenario: 'pair', answer: ['ping -c 1 10.0.0.3'], hint: 'Look at the packet panel.', check: () => true, question: { ask: 'Who?', expect: () => 'Ethernet,IPv4' } };
    assert.match(NQ.runMission(m, m.answer), /answer/i);
    assert.equal(NQ.runMission(m, m.answer, 'ethernet → ipv4'), true);
    assert.equal(typeof NQ.runMission(m, m.answer, 'ipv4'), 'string');
  });
});

describe('chapters, ranks, quick-fire and guide', () => {
  it('chapters have a name, badge, intro, learned list and missions', () => {
    assert.ok(NQ.CH.length >= 1);
    assert.equal(NQ.CH[0].name, 'Layers and packets');
    assert.equal(NQ.CH[0].missions.length, 6);
    for (const ch of NQ.CH) assert.ok(ch.name && ch.badge && ch.intro && ch.learned.length && ch.missions.length);
  });
  it('six ranks, strictly increasing, the top one at 280 XP', () => {
    assert.equal(NQ.RANKS.length, 6);
    assert.deepEqual([...NQ.RANKS[0]], [0, 'Packet Rookie']);
    assert.deepEqual([...NQ.RANKS.at(-1)], [280, 'Packet Whisperer']);
    for (let i = 1; i < NQ.RANKS.length; i++) assert.ok(NQ.RANKS[i][0] > NQ.RANKS[i - 1][0]);
    assert.equal(NQ.XP, 10);
  });
  it('quick-fire: six questions, each with one answer that differs from three wrong options', () => {
    assert.equal(NQ.QF.length, 6);
    for (const q of NQ.QF) {
      assert.ok(q.c && q.a && q.why, q.c);
      assert.ok(q.w.length >= 3 && !q.w.includes(q.a) && new Set(q.w).size === q.w.length, q.c);
    }
  });
  it('field guide: four entries whose examples run on the pair network', () => {
    assert.equal(NQ.GUIDE.length, 4);
    for (const g of NQ.GUIDE) {
      assert.ok(Number.isInteger(g.ch) && NQ.CH[g.ch] && g.c && g.what && g.ex.length, g.c);
      for (const [, k] of g.syn) assert.ok(Object.prototype.hasOwnProperty.call(NQ.KINDS, k), k);
      const net = NQ.createNet('pair');
      for (const [line] of g.ex) assert.equal(net.exec(line).code, 0, g.c + ': ' + line);
    }
  });
});
