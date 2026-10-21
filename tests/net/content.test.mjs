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

describe('chapter 3: lazy answers are caught', () => {
  const m = (i) => NQ.CH[2].missions[i];
  const run = (i, lines, a, mm = m(i)) => NQ.runMission(mm, lines, a);
  const ADD = (ip) => `ip addr add ${ip} dev eth0`, DEL = (ip) => `ip addr del ${ip} dev eth0`;
  it('has six missions on the expected scenarios and terminals', () => {
    assert.equal(NQ.CH[2].name, 'IP addressing');
    assert.deepEqual([...NQ.CH[2].missions.map((x) => x.scenario)], ['pair', 'pair', 'pair', 'home', 'office', 'pair']);
    assert.deepEqual([...NQ.CH[2].missions.map((x) => x.dev)], ['phone', 'phone', undefined, 'home', 'printer', undefined]);
  });
  it('1: the phone starts without an address, and any free address on the laptop\'s wire fixes it', () => {
    const net = NQ.createNet('pair', m(0).setup);
    assert.equal(net.devices.phone.ifaces.eth0.ip, null);
    assert.equal(net.exec('ping -c 1 10.0.0.2', 'phone').code, 2);
    for (const ip of ['10.0.0.3/24', '10.0.0.77/24', '10.0.0.3/16']) assert.equal(run(0, [ADD(ip)]), true, ip);
  });
  it('1: nothing, a bad or taken address, another subnet or a look at ip addr do not pass', () => {
    for (const lines of [[], ['ip addr'], ['ping -c 1 10.0.0.2'], [ADD('10.0.0.2/24')], [ADD('10.0.1.3/24')], [ADD('10.0.0.3/32')], [ADD('10.0.0.3/30'), 'ip link set eth0 down']])
      assert.notEqual(run(0, lines), true, lines.join(' ; '));
    assert.match(run(0, []), /no address/);
    assert.match(run(0, [ADD('10.0.0.2/24')]), /Another device/);
  });
  it('1: the same fix on the laptop (the wrong device) changes nothing the check wants', () => {
    assert.notEqual(run(0, [ADD('10.0.0.3/24')], undefined, { ...m(0), dev: 'laptop' }), true);
  });
  it('2: the starter is broken both ways, and rewriting the prefix repairs it', () => {
    const net = NQ.createNet('pair', m(1).setup);
    assert.equal(net.devices.phone.ifaces.eth0.ip, '10.0.0.200/25');
    assert.equal(net.exec('ping -c 1 10.0.0.2', 'phone').code, 2);
    assert.equal(net.exec('ping -c 1 10.0.0.200', 'laptop').code, 1);
    assert.equal(run(1, m(1).answer), true);
    assert.equal(run(1, [DEL('10.0.0.200/25'), ADD('10.0.0.3/24')]), true);
    assert.equal(run(1, [DEL('10.0.0.200/25'), ADD('10.0.0.200/23')]), true);
  });
  it('2: nothing, the old prefix again, a narrower prefix, a delete without a new address, a clash or a downed card do not pass', () => {
    for (const lines of [[], ['ip addr'], [DEL('10.0.0.200/25'), ADD('10.0.0.200/25')], [DEL('10.0.0.200/25'), ADD('10.0.0.200/26')], [DEL('10.0.0.200/25'), ADD('10.0.0.200/32')],
      [DEL('10.0.0.200/25')], [DEL('10.0.0.200/25'), ADD('10.0.0.2/24')], [DEL('10.0.0.200/25'), ADD('10.0.0.200/24'), 'ip link set eth0 down'], [ADD('10.0.0.200/24')]])
      assert.notEqual(run(1, lines), true, lines.join(' ; '));
    assert.match(run(1, [DEL('10.0.0.200/25')]), /no address/);
    assert.match(run(1, []), /number after the slash/);
  });
  it('3: ipcalc on a /26, then the computed count; a different prefix, a guess or no ipcalc do not pass', () => {
    const want = String(NQ.ip.cidr('10.0.0.0/26').bcast - NQ.ip.cidr('10.0.0.0/26').net - 1);
    assert.equal(solve(m(2)).expect, want);
    assert.equal(run(2, ['ipcalc 10.0.0.0/26'], want), true);
    assert.equal(run(2, ['ipcalc 10.0.0.77/26'], want), true);
    assert.equal(run(2, ['ip addr', 'ipcalc 10.0.0.0/24', 'ipcalc 192.168.5.64/26'], want + '.'), true);
    assert.equal(run(2, ['ipcalc 10.0.0.0/26'], ''), NQ.ASK);
    for (const [lines, a] of [[[], want], [['ipcalc 10.0.0.0/24'], want], [['ipcalc 10.0.0.0/24'], '254'], [['ipcalc 10.0.0.0/26'], '254'], [['ipcalc 10.0.0.0/26'], '64'], [['ipcalc 10.0.0.0/26'], '32'], [['ipcalc 10.0.0.0'], want], [['ipcalc 10.0.0.0/26 extra'], want]])
      assert.notEqual(run(2, lines, a), true, lines.join(' ; ') + ' -> ' + a);
  });
  it('4: the public address on home, with or without its prefix; the private one, the router\'s other side or no ip addr do not pass', () => {
    const net = NQ.createNet('home');
    assert.equal(solve(m(3)).expect, '203.0.113.5');
    assert.deepEqual([...solve(m(3)).all], ['203.0.113.5', '203.0.113.5/30']);
    for (const a of ['203.0.113.5', '203.0.113.5/30', ' 203.0.113.5. ']) assert.equal(run(3, ['ip addr'], a), true, a);
    assert.equal(run(3, ['ip a'], '203.0.113.5'), true);
    assert.equal(run(3, ['ip addr show dev eth1'], '203.0.113.5'), true);
    for (const a of ['192.168.1.1', '192.168.1.1/24', '203.0.113.6', '198.51.100.1', '203.0.113', '203.0.113.5/24', '10.0.0.1']) assert.notEqual(run(3, ['ip addr'], a), true, a);
    for (const lines of [[], ['ip link'], ['ping -c 1 192.168.1.10'], ['ip neigh']]) assert.notEqual(run(3, lines, '203.0.113.5'), true, lines.join(' ; '));
    assert.equal(net.devices.laptop.ifaces.eth0.ip, '192.168.1.10/24');
  });
  it('4: the answer is computed from the addresses on home, so a changed address changes it', () => {
    const net = NQ.createNet('home');
    net.exec('ip addr del 203.0.113.5/30 dev eth1', 'home'); net.exec('ip addr add 8.8.4.4/30 dev eth1', 'home');
    assert.equal(m(3).question.expect(NQ.makeCtx(net, [], null)), '8.8.4.4');
    net.exec('ip addr del 8.8.4.4/30 dev eth1', 'home'); net.exec('ip addr add 172.20.0.9/30 dev eth1', 'home');
    assert.equal(m(3).question.expect(NQ.makeCtx(net, [], null)), '');
  });
  it('5: the starter has two devices on one address, and moving the printer repairs it', () => {
    const net = NQ.createNet('office', m(4).setup);
    assert.equal(net.devices.printer.ifaces.eth0.ip, '192.168.1.10/24');
    assert.equal(net.devices.laptop.ifaces.eth0.ip, '192.168.1.10/24');
    assert.match(net.exec('arping -c 1 192.168.1.10', 'printer').out.join('\n'), /Unicast reply from 192\.168\.1\.10 \[02:00:00:00:00:01\]/);
    assert.equal(run(4, m(4).answer), true);
    assert.equal(run(4, [DEL('192.168.1.10/24'), ADD('192.168.1.99/24')]), true);
    assert.equal(run(4, [DEL('192.168.1.10/24'), ADD('192.168.1.20/24'), 'arping -c 1 192.168.1.20'].slice(0, 2)), true);
  });
  it('5: the same change on the laptop clears the clash too (either device may move)', () => {
    assert.equal(run(4, [DEL('192.168.1.10/24'), ADD('192.168.1.30/24')], undefined, { ...m(4), dev: 'laptop' }), true);
  });
  it('5: nothing, arping, deleting only, the router\'s or laptop\'s address, another subnet or a short prefix do not pass', () => {
    for (const lines of [[], ['arping -c 1 192.168.1.10', 'ip link'], [DEL('192.168.1.10/24')], [DEL('192.168.1.10/24'), ADD('192.168.1.1/24')], [DEL('192.168.1.10/24'), ADD('192.168.1.10/24')],
      [DEL('192.168.1.10/24'), ADD('192.168.2.20/24')], [DEL('192.168.1.10/24'), ADD('192.168.1.20/32')], [DEL('192.168.1.10/24'), ADD('192.168.1.20/24'), 'ip link set eth0 down'], ['ping -c 1 192.168.1.1']])
      assert.notEqual(run(4, lines), true, lines.join(' ; '));
    assert.match(run(4, [DEL('192.168.1.10/24'), ADD('192.168.1.1/24')]), /still share/);
    assert.match(run(4, [DEL('192.168.1.10/24')]), /no address/);
  });
  it('5: the clash check does not throw on a net with several interfaces without addresses', () => {
    assert.doesNotThrow(() => run(4, [DEL('192.168.1.10/24'), 'ip route']));
  });
  it('6: /31 and /32 both run, then the sum of what ipcalc printed; one of them, other prefixes or a wrong total do not pass', () => {
    const l = ['ipcalc 10.0.0.0/31', 'ipcalc 10.0.0.1/32'];
    assert.equal(solve(m(5)).expect, '3');
    assert.equal(run(5, l, '3'), true);
    assert.equal(run(5, [l[1], l[0]], '3.'), true);
    assert.equal(run(5, ['ipcalc 192.168.0.4/31', 'ipcalc 192.168.0.9/32', 'ipcalc 10.0.0.0/30'], '3'), true);
    assert.equal(run(5, l, ''), NQ.ASK);
    for (const [lines, a] of [[[], '3'], [[l[0]], '3'], [[l[1]], '3'], [['ipcalc 10.0.0.0/30', 'ipcalc 10.0.0.0/24'], '3'], [l, '2'], [l, '1'], [l, '4'], [l, '0'], [l, '2 + 1'], [['ipcalc 10.0.0.0/31', 'ipcalc 10.0.0.1'], '3']])
      assert.notEqual(run(5, lines, a), true, lines.join(' ; ') + ' -> ' + a);
  });
  it('6: the total comes from what ipcalc prints, and the engine still counts /30 as two usable hosts', () => {
    const out = (cmd) => NQ.createNet('pair').exec(cmd).out.join('\n');
    assert.match(out('ipcalc 10.0.0.0/31'), /Hosts\/Net: 2/);
    assert.match(out('ipcalc 10.0.0.1/32'), /Hosts\/Net: 1/);
    assert.match(out('ipcalc 10.0.0.0/30'), /Hosts\/Net: 2/);
    assert.match(out('ipcalc 10.0.0.0/26'), /Hosts\/Net: 62/);
  });
});

describe('chapter 4: lazy answers are caught', () => {
  const m = (i) => NQ.CH[3].missions[i];
  const run = (i, lines, a, mm = m(i)) => NQ.runMission(mm, lines, a);
  const DEF = (via) => `ip route add default via ${via}`;
  it('has six missions on the office network, with the terminal on the printer (2) and r1 (5)', () => {
    assert.equal(NQ.CH[3].name, 'Routing and the gateway');
    assert.deepEqual([...NQ.CH[3].missions.map((x) => x.scenario)], Array(6).fill('office'));
    assert.deepEqual([...NQ.CH[3].missions.map((x) => x.dev)], [undefined, 'printer', undefined, undefined, 'r1', undefined]);
  });
  it('1: reading the table, then the computed gateway; a guess, another address or no ip route do not pass', () => {
    assert.equal(solve(m(0)).expect, '192.168.1.1');
    for (const l of ['ip route', 'ip r', 'ip route show', 'ip route list']) assert.equal(run(0, [l], '192.168.1.1'), true, l);
    assert.equal(run(0, ['ip route'], ' 192.168.1.1. '), true);
    assert.equal(run(0, ['ip route'], ''), NQ.ASK);
    for (const a of ['192.168.1.10', '192.168.1.0/24', '10.0.1.1', '10.0.1.2', 'default', 'r1', '192.168.1']) assert.notEqual(run(0, ['ip route'], a), true, a);
    for (const lines of [[], ['ip addr'], ['ip neigh'], ['traceroute 172.16.0.10'], ['ip route add default via 192.168.1.1']]) assert.notEqual(run(0, lines, '192.168.1.1'), true, lines.join(' ; '));
  });
  it('1: the answer is computed from the laptop\'s default route', () => {
    const net = NQ.createNet('office');
    net.exec('ip route del default', 'laptop'); net.exec('ip route add default via 192.168.1.77', 'laptop');
    assert.equal(m(0).question.expect(NQ.makeCtx(net, [], null)), '192.168.1.77');
    net.exec('ip route del default', 'laptop');
    assert.equal(m(0).question.expect(NQ.makeCtx(net, [], null)), '');
  });
  it('2: the printer starts with no route off its wire, and a default route via the router repairs it', () => {
    const net = NQ.createNet('office', m(1).setup);
    assert.equal(net.exec('ping -c 1 172.16.0.10', 'printer').code, 2);
    assert.match(net.exec('ping -c 1 172.16.0.10', 'printer').err.join(' '), /Network is unreachable/);
    assert.equal(run(1, m(1).answer), true);
    assert.equal(run(1, [DEF('192.168.1.1')]), true);
  });
  it('2: nothing, a ping, the laptop as gateway, a route to the server only, or the fix on another device do not pass', () => {
    for (const lines of [[], ['ping -c 1 172.16.0.10'], ['ip route'], [DEF('192.168.1.10')], [DEF('192.168.1.99')], ['ip route add 172.16.0.0/24 via 192.168.1.1'], ['ip route add 10.0.1.0/30 via 192.168.1.1'],
      [DEF('192.168.1.1'), 'ip link set eth0 down'], ['ip route add default dev eth0']])
      assert.notEqual(run(1, lines), true, lines.join(' ; '));
    assert.notEqual(run(1, [DEF('192.168.1.1')], undefined, { ...m(1), dev: 'laptop' }), true, 'wrong device (it already has a default route)');
    assert.notEqual(run(1, [DEF('10.0.1.1')], undefined, { ...m(1), dev: 'r1' }), true, 'wrong device (a router)');
    assert.match(run(1, []), /no default route/);
    assert.match(run(1, [DEF('192.168.1.10')]), /not the office router/);
  });
  it('3: the laptop starts with a gateway nobody owns, and the ARP request asks for the gateway, not the server', () => {
    const net = NQ.createNet('office', m(2).setup), r = net.exec('ping -c 1 172.16.0.10', 'laptop');
    assert.equal(r.code, 1);
    assert.match(r.out.join('\n'), /Destination Host Unreachable/);
    const arp = r.entries.find((e) => e.dev === 'laptop' && e.dir === 'tx' && e.packet.layers.some((l) => l.name === 'ARP'));
    assert.equal(arp.packet.layers.find((l) => l.name === 'ARP').fields.tpa, '192.168.1.2');
    assert.equal(run(2, m(2).answer), true);
    assert.equal(run(2, ['ip route del default', DEF('192.168.1.1')]), true);
  });
  it('3: nothing, a ping, deleting only, another bad or taken gateway, a route for the server only, or the fix on another device do not pass', () => {
    for (const lines of [[], ['ping -c 1 172.16.0.10'], ['ip route del default'], ['ip route del default', DEF('192.168.1.2')], ['ip route del default', DEF('192.168.1.20')], ['ip route del default', DEF('192.168.1.10')],
      ['ip route del default', DEF('10.0.1.2')], ['ip route add 172.16.0.0/24 via 192.168.1.1'], ['ip route add 172.16.0.0/24 via 192.168.1.1', 'ping -c 1 172.16.0.10'],
      ['ip route del default', DEF('192.168.1.1'), 'ip link set eth0 down'], ['ip route del 172.16.0.0/24']])
      assert.notEqual(run(2, lines), true, lines.join(' ; '));
    assert.notEqual(run(2, ['ip route del default', DEF('192.168.1.1')], undefined, { ...m(2), dev: 'printer' }), true, 'the printer is the wrong device');
    assert.notEqual(run(2, ['ip route del default', DEF('192.168.1.1')], undefined, { ...m(2), dev: 'r1' }), true, 'r1 is the wrong device');
    assert.match(run(2, ['ip route del default']), /no default route/);
    assert.match(run(2, []), /ARP request asks for the gateway/);
  });
  it('4: traceroute to the server, then the computed address of hop 2; other traces, other hops and a wrong or missing answer do not pass', () => {
    assert.equal(solve(m(3)).expect, '10.0.1.2');
    assert.equal(run(3, ['traceroute 172.16.0.10'], '10.0.1.2'), true);
    assert.equal(run(3, ['ping -c 1 172.16.0.10', 'traceroute 172.16.0.10', 'ip route'], ' 10.0.1.2. '), true);
    assert.equal(run(3, ['traceroute 172.16.0.10'], ''), NQ.ASK);
    for (const a of ['192.168.1.1', '172.16.0.10', '10.0.1.1', '172.16.0.1', 'r2', '2', '10.0.1']) assert.notEqual(run(3, ['traceroute 172.16.0.10'], a), true, a);
    for (const lines of [[], ['ping -c 1 172.16.0.10'], ['traceroute 192.168.1.1'], ['traceroute 8.8.8.8'], ['traceroute'], ['traceroute 172.16.0.10 8.8.8.8']]) assert.notEqual(run(3, lines, '10.0.1.2'), true, lines.join(' ; '));
    assert.match(run(3, ['traceroute 172.16.0.10'], 'nope'), /Not quite/);
  });
  it('4: the answer is computed from the trace, so a changed network changes it', () => {
    const ctx = (setup, lines) => { const net = NQ.createNet('office', setup), history = lines.map((line) => { const r = net.exec(line); return { line, code: r.code, entries: r.entries }; }); return NQ.makeCtx(net, history, null); };
    const re = [{ dev: 'r2', cmd: 'ip addr del 10.0.1.2/30 dev eth0' }, { dev: 'r2', cmd: 'ip addr add 10.0.1.2/30 dev eth0' }];
    assert.equal(m(3).question.expect(ctx(re, ['traceroute 172.16.0.10'])), '10.0.1.2');
    assert.equal(m(3).question.expect(ctx([], [])), '');
  });
  it('5: r1 starts without a route to the server\'s network, and a static route via r2 repairs it', () => {
    const net = NQ.createNet('office', m(4).setup);
    assert.equal(net.exec('ping -c 1 172.16.0.10', 'r1').code, 2);
    assert.match(net.exec('ping -c 1 172.16.0.10', 'laptop').out.join('\n'), /From 192\.168\.1\.1 icmp_seq=1 Destination Net Unreachable/);
    assert.equal(run(4, m(4).answer), true);
    assert.equal(run(4, ['ip route add 172.16.0.0/24 via 10.0.1.2']), true);
    assert.equal(run(4, ['ip route add 172.16.0.0/24 via 10.0.1.2 dev eth1']), true);
  });
  it('5: nothing, a ping, a default route, a route to another subnet or gateway, or the fix on another device do not pass', () => {
    for (const lines of [[], ['ping -c 1 172.16.0.10'], ['ip route'], [DEF('10.0.1.2')], ['ip route add 172.16.1.0/24 via 10.0.1.2'], ['ip route add 172.16.0.0/24 via 192.168.1.20'], ['ip route add 172.16.0.0/24 via 192.168.1.10'],
      ['ip route add 10.0.0.0/8 via 10.0.1.2'], ['ip route add 172.16.0.0/24 via 10.0.1.2', 'ip link set eth1 down'], ['ip route add 172.16.0.0/16 via 10.0.1.2', 'ip route add 172.16.0.0/24 via 192.168.1.20']])
      assert.notEqual(run(4, lines), true, lines.join(' ; '));
    assert.notEqual(run(4, ['ip route add 172.16.0.0/24 via 10.0.1.2'], undefined, { ...m(4), dev: 'r2' }), true, 'r2 is the wrong device');
    assert.notEqual(run(4, ['ip route add 172.16.0.0/24 via 192.168.1.1'], undefined, { ...m(4), dev: 'printer' }), true, 'the printer is the wrong device');
    assert.match(run(4, [DEF('10.0.1.2')]), /catch-all/);
    assert.match(run(4, []), /no route that covers the server/);
  });
  it('6: a loop, traceroute to an outside address, then the address on hops 3 and 5; the server trace, a wrong address or no trace do not pass', () => {
    const net = NQ.createNet('office', m(5).setup);
    assert.equal(solve(m(5)).expect, '10.0.1.1');
    const t = NQ.sim.traceroute(net.clone(), 'laptop', '8.8.8.8');
    assert.equal(t.hops.length, 30, 'the sim stops the loop by TTL and traceroute by its hop limit');
    assert.ok(t.hops.every((h) => !h.reached) && t.hops.every((h) => h.from));
    for (const target of ['8.8.8.8', '1.1.1.1', '203.0.113.9']) assert.equal(run(5, [`traceroute ${target}`], '10.0.1.1'), true, target);
    assert.equal(run(5, ['traceroute 8.8.8.8'], ' 10.0.1.1. '), true);
    assert.equal(run(5, ['traceroute 8.8.8.8'], ''), NQ.ASK);
    for (const a of ['10.0.1.2', '192.168.1.1', '172.16.0.1', '8.8.8.8', 'r1', '3', '5']) assert.notEqual(run(5, ['traceroute 8.8.8.8'], a), true, a);
    for (const lines of [[], ['ping -c 1 8.8.8.8'], ['traceroute 172.16.0.10'], ['traceroute 192.168.1.1'], ['traceroute 172.16.0.99'], ['ip route']]) assert.notEqual(run(5, lines, '10.0.1.1'), true, lines.join(' ; '));
    assert.match(run(5, ['traceroute 172.16.0.10'], '10.0.1.1'), /does not loop/);
  });
  it('6: without the loop the same trace does not pass, so the check reads the network and not the typed line', () => {
    assert.notEqual(run(5, ['traceroute 8.8.8.8'], '10.0.1.1', { ...m(5), setup: [] }), true);
  });
  it('the repair missions (2, 3 and 5) do not pass on their broken starting networks', () => {
    for (const i of [1, 2, 4]) assert.notEqual(run(i, []), true, String(i + 1));
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
