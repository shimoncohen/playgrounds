// Network Quest content: every mission is solvable by its own answer, its check is not fooled by the starter state or
// a lazy answer, and a question's answer is computed from the network, never written in the mission text.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const plain = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&(?:gt|lt|amp|quot);/g, ' ');
// the run a learner would make: the reference lines on a fresh net, then the question's computed answer
const solve = (m, lines = m.answer) => {
  const net = NQ.createNet(m.scenario, m.setup), history = lines.map((line) => { const r = net.exec(line, m.dev); return { line, code: r.code, entries: r.entries }; });
  const ctx = NQ.makeCtx(net, history, null);
  return { net, ctx, expect: m.question ? m.question.expect(ctx) : undefined, all: m.question ? accepted(m, ctx, m.question.expect(ctx)) : [] };
};
// tokens of normalised text, trimmed of sentence punctuation, so "IPv4." still counts as "ipv4"
const toks = (s) => NQ.norm(plain(s)).split(',').map((t) => t.replace(/^[.:!?()"'`]+|[.:!?()"'`]+$/g, '')).filter(Boolean);
const leaks = (text, ans) => { const t = toks(text), a = toks(ans); return t.some((_, i) => a.every((x, j) => t[i + j] === x)); };
// accepted answers that are one common word the lessons must be able to say (the expect value is never exempt)
const COMMON = ['ip'];
const accepted = (m, ctx, expect) => [expect, ...(m.question.accept ? m.question.accept(ctx) : []).filter((a) => !COMMON.includes(NQ.norm(a)))];

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
          const { expect, all } = solve(m);
          assert.ok(typeof expect === 'string' && expect.trim(), 'expect is a non-empty string');
          assert.ok(typeof m.question.ask === 'string' && m.question.ask.trim());
          for (const a of all) for (const t of [m.goal, m.explain, m.hint, m.question.ask, ...m.how]) assert.ok(!leaks(t, a), `"${a}" leaks in: ${plain(t)}`);
        });
        it('a wrong or missing answer fails without giving the answer away', () => {
          const { all } = solve(m);
          for (const a of ['not-it', '', '   ']) {
            const r = NQ.runMission(m, m.answer, a);
            assert.equal(typeof r, 'string');
            for (const x of all) assert.ok(!leaks(r, x), r);
          }
          assert.equal(NQ.runMission(m, m.answer, ''), NQ.ASK);
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
  it('3: a TTL other than the request\'s own does not pass', () => assert.notEqual(run(2, m(2).answer, '63'), true));
  it('2, 3, 5: a traceroute after the ping does not change which packet is asked about', () => {
    const lines = ['ping 10.0.0.3', 'traceroute 10.0.0.3'];
    assert.equal(run(1, lines, 'Ethernet, IPv4, ICMP.'), true);
    assert.equal(run(2, lines, solve(m(2)).expect), true);
    assert.notEqual(run(2, lines, '1'), true);
    assert.equal(run(4, lines, 'IPv4'), true);
  });
  it('2, 5: the alternate names the missions invite are accepted', () => {
    assert.equal(run(1, m(1).answer, 'Ethernet / IP / ICMP'), true);
    assert.equal(run(4, m(4).answer, 'IP'), true);
    assert.equal(run(4, m(4).answer, 'IPv4.'), true);
    assert.equal(run(3, m(3).answer, 'ff:ff:ff:ff:ff:ff.'), true);
  });
  it('2-5: a ping to yourself leaves no packet to read, with a friendly message', () => {
    for (const i of [1, 2, 4]) { const r = run(i, ['ping -c 1 10.0.0.2'], 'x'); assert.equal(typeof r, 'string'); assert.match(r, /ping 10\.0\.0\.3/); }
  });
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
    assert.equal(run(5, ['ping -c 3 10.0.0.3', 'traceroute 10.0.0.3'], '3'), true);
    const self = run(5, ['ping -c 3 10.0.0.3', 'ping -c 2 10.0.0.2'], '3');
    assert.notEqual(self, true);
    assert.match(self, /nothing on the wire/);
  });
});

describe('chapter 1: the two card missions', () => {
  const m = (i) => NQ.CH[0].missions[i];
  const run = (i, lines, a) => NQ.runMission(m(i), lines, a);
  it('7: ip link, then the laptop\'s own MAC', () => {
    assert.equal(run(6, ['ip link'], '02:00:00:00:00:01'), true);
    assert.equal(run(6, ['ip addr'], '02:00:00:00:00:01'), true);
    assert.equal(run(6, ['ip link'], '02:00:00:00:00:01.'), true);
  });
  it('7: the phone\'s MAC, the broadcast MAC or no ip command do not pass', () => {
    assert.notEqual(run(6, ['ip link'], '02:00:00:00:00:02'), true);
    assert.notEqual(run(6, ['ip link'], 'ff:ff:ff:ff:ff:ff'), true);
    assert.notEqual(run(6, ['ping 10.0.0.3'], '02:00:00:00:00:01'), true);
    assert.notEqual(run(6, ['ip route'], '02:00:00:00:00:01'), true);
    assert.notEqual(run(6, [], '02:00:00:00:00:01'), true);
  });
  it('8: arping then ip neigh, the phone\'s MAC', () => {
    assert.equal(run(7, ['arping 10.0.0.3', 'ip neigh'], '02:00:00:00:00:02'), true);
    assert.equal(run(7, ['arping -c 1 10.0.0.3', 'ip neigh'], '02:00:00:00:00:02'), true);
    assert.equal(run(7, ['arping 10.0.0.3', 'ip neigh'], '02:00:00:00:00:02'.toUpperCase()), true);
  });
  it('8: a wrong MAC, the wrong order or a lazy route do not pass', () => {
    assert.notEqual(run(7, m(7).answer, '02:00:00:00:00:01'), true);
    assert.notEqual(run(7, m(7).answer, 'ff:ff:ff:ff:ff:ff'), true);
    assert.notEqual(run(7, ['ip neigh', 'arping 10.0.0.3'], '02:00:00:00:00:02'), true);
    assert.notEqual(run(7, ['arping 10.0.0.3'], '02:00:00:00:00:02'), true);
    assert.notEqual(run(7, ['ip neigh'], '02:00:00:00:00:02'), true);
    assert.notEqual(run(7, ['arping 10.0.0.9', 'ip neigh'], '02:00:00:00:00:02'), true);
    assert.notEqual(run(7, ['ping 10.0.0.3', 'ip neigh'], '02:00:00:00:00:02'), true);
  });
});

describe('chapter 2: lazy answers are caught', () => {
  const m = (i) => NQ.CH[1].missions[i];
  const run = (i, lines, a) => NQ.runMission(m(i), lines, a);
  const P1 = 'ping -c 1 10.0.0.3', DEL = 'ip neigh del 10.0.0.3 dev eth0', ADD = (mac) => `ip neigh add 10.0.0.3 lladdr ${mac} dev eth0`;
  it('has five missions on the expected scenarios', () => {
    assert.equal(NQ.CH[1].name, 'MAC and ARP');
    assert.deepEqual([...NQ.CH[1].missions.map((x) => x.scenario)], ['pair', 'pair', 'pair', 'pair', 'office']);
  });
  it('1: two pings, the first asking and the second not', () => {
    assert.equal(run(0, [P1, P1]), true);
    assert.equal(run(0, ['ping 10.0.0.3', 'ping 10.0.0.3']), true);
    assert.equal(run(0, [P1, 'ip neigh', P1]), true);
  });
  it('1: one ping, no ping, a ping at nobody or a ping at yourself do not pass', () => {
    for (const lines of [[], [P1], ['arping 10.0.0.3'], ['ping -c 1 10.0.0.9', 'ping -c 1 10.0.0.9'], ['ping -c 1 10.0.0.2', 'ping -c 1 10.0.0.2']]) assert.notEqual(run(0, lines), true, lines.join(' ; '));
  });
  it('1: arping first leaves no ARP to see, and a delete in between makes the last ping ask again', () => {
    assert.match(run(0, ['arping 10.0.0.3', P1, P1]), /Reset scenario/);
    assert.match(run(0, [P1, DEL, P1]), /another ARP request/);
  });
  it('2: ping, delete, ping again', () => {
    assert.equal(run(1, m(1).answer), true);
    assert.equal(run(1, ['arping 10.0.0.3', DEL, 'ping 10.0.0.3']), true);
    assert.equal(run(1, [P1, 'ip neighbor delete 10.0.0.3 dev eth0', P1]), true);
  });
  it('2: no delete, a delete with nothing to delete, or no ping afterwards do not pass', () => {
    for (const lines of [[], [P1, P1], [DEL, P1], [P1, DEL], [P1, DEL, 'ping -c 1 10.0.0.2'], [P1, DEL, 'arping 10.0.0.3', P1], [P1, 'ip neigh del 10.0.0.9 dev eth0', P1]])
      assert.notEqual(run(1, lines), true, lines.join(' ; '));
    assert.match(run(1, [P1, P1]), /ip neigh del/);
  });
  it('3: a made-up static entry passes with the loss the ping reports', () => {
    assert.equal(run(2, m(2).answer, '100%'), true);
    assert.equal(run(2, [ADD('02:00:00:00:00:77')], '100'), true);
    assert.equal(run(2, [ADD('02:00:00:00:00:99'), 'ping 10.0.0.3'], '100%'), true);
  });
  it('3: no entry, the phone\'s real MAC, a broadcast MAC, another address or a wrong number do not pass', () => {
    assert.notEqual(run(2, [], '100%'), true);
    assert.notEqual(run(2, [P1], '100%'), true);
    assert.notEqual(run(2, ['arping 10.0.0.3', 'ip neigh'], '100%'), true);
    assert.notEqual(run(2, [ADD('02:00:00:00:00:02')], '100%'), true);
    assert.match(run(2, [ADD('02:00:00:00:00:02')], '100%'), /real MAC/);
    assert.match(run(2, [ADD('ff:ff:ff:ff:ff:ff')], '100%'), /still reaches/);
    assert.notEqual(run(2, ['ip neigh add 10.0.0.9 lladdr 02:00:00:00:00:99 dev eth0'], '100%'), true);
    assert.notEqual(run(2, m(2).answer, '0%'), true);
    assert.notEqual(run(2, m(2).answer, '0'), true);
    assert.equal(run(2, m(2).answer, ''), NQ.ASK);
  });
  it('3: the entry really breaks the ping, and the learner\'s own net is not touched by the check', () => {
    const net = NQ.createNet('pair');
    net.exec(ADD('02:00:00:00:00:99'));
    const r = net.exec('ping -c 1 10.0.0.3');
    assert.equal(r.code, 1);
    assert.match(r.out.join('\n'), /100% packet loss/);
  });
  it('4: the starter is broken, and deleting or rewriting the entry repairs it', () => {
    const net = NQ.createNet('pair', m(3).setup);
    assert.equal(net.exec('ping -c 1 10.0.0.3').code, 1);
    assert.equal(run(3, [DEL, P1]), true);
    assert.equal(run(3, [DEL]), true);
    assert.equal(run(3, [ADD('02:00:00:00:00:02')]), true);
    assert.equal(run(3, ['arping 10.0.0.3', DEL, 'ping 10.0.0.3']), true);
  });
  it('4: doing nothing, looking, a broadcast entry or a downed card do not pass', () => {
    for (const lines of [[], ['ip neigh'], ['arping 10.0.0.3'], [P1], [ADD('ff:ff:ff:ff:ff:ff'), P1], [ADD('02:00:00:00:00:98')], ['ip link set eth0 down', DEL]])
      assert.notEqual(run(3, lines), true, lines.join(' ; '));
    assert.match(run(3, [ADD('ff:ff:ff:ff:ff:ff')]), /does not have/);
  });
  it('5: the switch must have flooded the ARP request and forwarded what followed', () => {
    assert.equal(run(4, m(4).answer, 'sw1'), true);
    assert.equal(run(4, ['arping 192.168.1.20'], 'SW1'), true);
    assert.equal(run(4, ['ping -c 1 192.168.1.1'], 'sw1'), true);
    assert.equal(run(4, [...m(4).answer, 'traceroute 192.168.1.20'], 'sw1.'), true);
  });
  it('5: no ping, a ping to yourself, a wrong device or a guess do not pass', () => {
    for (const lines of [[], ['ping -c 1 192.168.1.10'], ['ip addr'], ['ping -c 1 192.168.1.99']]) assert.notEqual(run(4, lines, 'sw1'), true, lines.join(' ; '));
    for (const a of ['r1', 'printer', 'laptop', 'switch', 'sw2']) assert.notEqual(run(4, m(4).answer, a), true, a);
  });
});

// Teach before use: a term may appear in a mission's goal or how steps only from the mission that introduces it on.
// Keys are the chapter-1 mission indexes; a term is introduced in that mission's goal itself (defined in place) or by an
// earlier mission, and the intro of chapter 1 may not use any of them.
describe('chapter 1: terms are not used before the mission that introduces them', () => {
  const FIRST = { Ethernet: 1, TTL: 2, router: 2, ARP: 3, MAC: 3, frame: 3, broadcast: 3, NAT: 99, OSI: 1, 'TCP/IP': 1 };
  const hit = (t, w) => new RegExp(`(?<![\\w/])${w}(?![\\w/])`, w === 'router' ? 'i' : '').test(plain(t));
  NQ.CH[0].missions.forEach((m, i) => {
    it(`${i + 1} ${m.title}`, () => {
      for (const [w, at] of Object.entries(FIRST)) if (i < at) for (const t of [m.goal, ...m.how]) assert.ok(!hit(t, w), `"${w}" used before mission ${at + 1}: ${plain(t)}`);
    });
  });
  it('the chapter intro stays short and plain', () => {
    for (const w of Object.keys(FIRST)) assert.ok(!hit(NQ.CH[0].intro, w), w);
    assert.ok(plain(NQ.CH[0].intro).length < 900);
  });
  it('the first mission defines packet, command, packet panel, tx/rx and IP address in plain words', () => {
    const t = plain([NQ.CH[0].missions[0].goal, ...NQ.CH[0].missions[0].how].join(' '));
    for (const w of ['command', 'packet panel', 'tx', 'rx', 'IP address', 'packet']) assert.ok(t.includes(w), w);
  });
  it('the guide cards only use commands that a mission taught', () => {
    const key = (l) => { const w = l.trim().split(/\s+/); return w[0] === 'ip' ? w[0] + ' ' + w[1] : w[0]; };
    const taught = new Set(NQ.CH[0].missions.flatMap((x) => x.answer.map(key)));
    for (const g of NQ.GUIDE) for (const [line] of g.ex) assert.ok(taught.has(key(line)), line);
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
  it('NQ.norm treats separators alike, drops trailing sentence punctuation and keeps MACs, addresses and numbers', () => {
    const want = 'ethernet,ipv4,icmp';
    for (const s of ['Ethernet → IPv4 → ICMP', 'ethernet ipv4 icmp', 'Ethernet,IPv4,ICMP', ' Ethernet > IPv4 | ICMP ', 'ETHERNET; ipv4,  icmp',
      'Ethernet, IPv4, ICMP.', 'Ethernet/IPv4/ICMP', 'Ethernet - IPv4 - ICMP', 'Ethernet->IPv4->ICMP', 'Ethernet=IPv4=ICMP!'])
      assert.equal(NQ.norm(s), want, s);
    assert.equal(NQ.norm('FF:FF:FF:FF:FF:FF'), 'ff:ff:ff:ff:ff:ff');
    assert.equal(NQ.norm('ff:ff:ff:ff:ff:ff.'), 'ff:ff:ff:ff:ff:ff');
    // a dash-separated MAC splits into words, so it differs from the colon form the questions use
    assert.notEqual(NQ.norm('ff-ff-ff-ff-ff-ff'), NQ.norm('ff:ff:ff:ff:ff:ff'));
    assert.equal(NQ.norm('10.0.0.3.'), '10.0.0.3');
    assert.equal(NQ.norm('IPv4.'), 'ipv4');
    assert.equal(NQ.norm('64.'), '64');
    assert.equal(NQ.norm(' 64 '), '64');
    assert.equal(NQ.norm('echo-request'), NQ.norm('Echo request'));
    assert.equal(NQ.norm('?!.'), '');
    assert.equal(NQ.norm(''), '');
  });
  it('lastPing and history entries: each line keeps its own log slice', () => {
    const m = { scenario: 'pair', answer: [], check: (c) => {
      const p = c.lastPing();
      return p && p.line === 'ping -c 1 10.0.0.3' && p.entries.length > 0 && c.history[0].entries.length > 0 && c.history[1].entries.length === 0 ? true : 'no';
    } };
    assert.equal(NQ.runMission(m, ['arping 10.0.0.3', 'ip addr', 'ping -c 1 10.0.0.3', 'ip addr']), true);
    assert.equal(NQ.runMission(m, ['arping 10.0.0.3', 'ip addr', 'ping -c 1 10.0.0.3', 'ping -c 1 10.0.0.2']), 'no');
    assert.equal(NQ.makeCtx(NQ.createNet('pair'), [], null).lastPing(), null);
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
    assert.equal(NQ.runMission(m, m.answer), NQ.ASK);
    assert.equal(NQ.runMission(m, m.answer, 'ethernet → ipv4'), true);
    assert.equal(typeof NQ.runMission(m, m.answer, 'ipv4'), 'string');
    const acc = { ...m, question: { ...m.question, accept: () => ['link, IP'] } };
    assert.equal(NQ.runMission(acc, acc.answer, 'Link / IP.'), true);
    assert.equal(NQ.runMission(acc, acc.answer, 'Ethernet,IPv4'), true);
    assert.equal(typeof NQ.runMission(acc, acc.answer, 'link'), 'string');
  });
});

describe('chapters, ranks, quick-fire and guide', () => {
  it('chapters have a name, badge, intro, learned list and missions', () => {
    assert.ok(NQ.CH.length >= 1);
    assert.equal(NQ.CH[0].name, 'Layers and packets');
    assert.equal(NQ.CH[0].missions.length, 8);
    for (const q of NQ.QF) assert.ok(Number.isInteger(q.ch) && NQ.CH[q.ch], q.c);
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
