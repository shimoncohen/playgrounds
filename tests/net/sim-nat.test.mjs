// Network Quest: NAT and the public side (sim.js part 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const J = (x) => JSON.parse(JSON.stringify(x));
const WEB = '198.51.100.10', OUT = '203.0.113.5';
const L = (e, name) => e.packet.layers.find((l) => l.name === name);
const icmpType = (e) => (L(e, 'ICMP') || { fields: {} }).fields.type;
const at = (r, dev, dir, type) => [...r.entries].find((e) => e.dev === dev && e.dir === dir && icmpType(e) === type);
const entry = (inside, id, outId) => ({ inside, outside: OUT, id, outId, dst: WEB });

test('home: laptop reaches web through NAT; web sees the outside address and a rewritten id', () => {
  const net = NQ.createNet('home');
  const r = NQ.sim.ping(net, 'laptop', WEB);
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [true, null, WEB]);
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'home', 'isp', 'web']);
  const req = at(r, 'web', 'rx', 'echo-request');
  assert.equal(L(req, 'IPv4').fields.src, OUT);
  assert.equal(L(req, 'ICMP').fields.id, 1024);
  assert.deepEqual(J(net.devices.home.nat.table), [entry('192.168.1.10', 1, 1024)]);
  const nat = [...r.entries].filter((e) => e.dev === 'home' && e.dir === 'nat');
  assert.deepEqual(nat.map((e) => e.verdict), [
    'translated: src 192.168.1.10 → 203.0.113.5, id 1 → 1024',
    'translated: dst 203.0.113.5 → 192.168.1.10, id 1024 → 1']);
  assert.deepEqual([L(nat[0], 'IPv4').fields.src, L(nat[0], 'ICMP').fields.id], [OUT, 1024], 'the entry shows the translated packet');
  const back = at(r, 'laptop', 'rx', 'echo-reply');
  assert.deepEqual([L(back, 'IPv4').fields.src, L(back, 'IPv4').fields.dst, L(back, 'ICMP').fields.id], [WEB, '192.168.1.10', 1]);
});

test('a second ping reuses the mapping; a different id gets the next outId', () => {
  const net = NQ.createNet('home');
  NQ.sim.ping(net, 'laptop', WEB);
  let r = NQ.sim.ping(net, 'laptop', WEB, { seq: 2 });
  assert.equal(r.delivered, true);
  assert.equal(net.devices.home.nat.table.length, 1);
  r = NQ.sim.ping(net, 'laptop', WEB, { id: 2 });
  assert.equal(r.delivered, true);
  assert.equal(L(at(r, 'web', 'rx', 'echo-request'), 'ICMP').fields.id, 1025);
  assert.equal(L(at(r, 'laptop', 'rx', 'echo-reply'), 'ICMP').fields.id, 2);
  assert.deepEqual(J(net.devices.home.nat.table), [entry('192.168.1.10', 1, 1024), entry('192.168.1.10', 2, 1025)]);
});

test('phone and laptop, same id: distinct outIds, each reply goes to the right host', () => {
  const net = NQ.createNet('home');
  const a = NQ.sim.ping(net, 'laptop', WEB), b = NQ.sim.ping(net, 'phone', WEB);
  assert.deepEqual([a.delivered, b.delivered, b.replyFrom], [true, true, WEB]);
  assert.deepEqual(J(net.devices.home.nat.table), [entry('192.168.1.10', 1, 1024), entry('192.168.1.11', 1, 1025)]);
  assert.equal(L(at(b, 'web', 'rx', 'echo-request'), 'ICMP').fields.id, 1025);
  assert.equal(L(at(b, 'phone', 'rx', 'echo-reply'), 'IPv4').fields.dst, '192.168.1.11');
  assert.equal(at(b, 'laptop', 'rx', 'echo-reply'), undefined, 'laptop does not get phone\'s reply');
  assert.equal(NQ.sim.ping(net, 'laptop', WEB, { seq: 9 }).delivered, true);
});

test('traceroute laptop -> web through NAT: isp\'s time-exceeded is translated back by id', () => {
  const net = NQ.createNet('home');
  const t = NQ.sim.traceroute(net, 'laptop', WEB);
  assert.deepEqual(J(t.hops), [
    { ttl: 1, from: '192.168.1.1', reached: false },
    { ttl: 2, from: '203.0.113.6', reached: false },
    { ttl: 3, from: WEB, reached: true }]);
  const err = [...t.entries].find((e) => e.dev === 'laptop' && e.dir === 'rx' && icmpType(e) === 'time-exceeded' && L(e, 'IPv4').fields.src === '203.0.113.6');
  assert.deepEqual(J(L(err, 'ICMP').fields), { type: 'time-exceeded', id: 1, seq: 2 });
  assert.equal(L(err, 'IPv4').fields.dst, '192.168.1.10');
  assert.equal(net.devices.home.nat.table.length, 1, 'ttl 1 expires at home before translation; ttl 2 and 3 share one mapping');
});

test('inject: a reply with no mapping is dropped silently and nothing is forwarded', () => {
  const net = NQ.createNet('home'), d = net.devices;
  NQ.sim.ping(net, 'laptop', WEB);
  const before = J(d.home.nat.table), n = net.log.length;
  const p = NQ.pkt.stack(NQ.pkt.eth(d.isp.ifaces.eth0.mac, d.home.ifaces.eth1.mac, 'IPv4'), NQ.pkt.ipv4(WEB, OUT, 63, 'ICMP'), NQ.pkt.icmp('echo-reply', 5000, 1));
  const r = NQ.sim.inject(net, 'home', 'eth1', p);
  assert.deepEqual(J(r.entries.map((e) => [e.dev, e.iface, e.dir, e.verdict])), [['home', 'eth1', 'drop', 'no NAT mapping for this packet']]);
  assert.deepEqual(J(r.entries), J(net.log.slice(n)));
  assert.deepEqual(J(d.home.nat.table), before);
  p.layers[1].fields.src = '198.51.100.99'; // the right id from the wrong host is not a reply to this mapping
  p.layers[2].fields.id = 1024;
  assert.deepEqual(J(NQ.sim.inject(net, 'home', 'eth1', p).entries.map((e) => e.verdict)), ['no NAT mapping for this packet']);
  p.layers[1].fields.src = WEB; // a mapped id is translated and delivered
  const ok = NQ.sim.inject(net, 'home', 'eth1', p);
  assert.ok(at(ok, 'laptop', 'rx', 'echo-reply'));
  assert.throws(() => NQ.sim.inject(net, 'nope', 'eth0', p));
  assert.throws(() => NQ.sim.inject(net, 'home', 'eth9', p));
});

test('web -> 203.0.113.5: the router answers for its own outside address, no mapping made', () => {
  const net = NQ.createNet('home');
  const r = NQ.sim.ping(net, 'web', OUT);
  assert.deepEqual([r.delivered, r.replyFrom], [true, OUT]);
  assert.deepEqual(J(net.devices.home.nat.table), []);
});

test('web -> 192.168.1.10: isp has no route to a private address, so dest-unreachable from 198.51.100.1', () => {
  const net = NQ.createNet('home');
  const r = NQ.sim.ping(net, 'web', '192.168.1.10');
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'no route', '198.51.100.1']);
  assert.deepEqual(J(net.devices.home.nat.table), []);
});

test('home without NAT: isp drops the private source silently, so laptop hears no reply', () => {
  const net = NQ.createNet('home');
  net.devices.home.nat = null;
  const r = NQ.sim.ping(net, 'laptop', WEB);
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'no reply', null]);
  const d = [...r.entries].filter((e) => e.dir === 'drop' && e.verdict !== 'not addressed to this host'); // phone ignores flooded frames
  assert.deepEqual(J(d.map((e) => [e.dev, e.iface, e.verdict])), [['isp', 'eth0', 'dropped: private source address 192.168.1.10']]);
  assert.equal(at(r, 'web', 'rx', 'echo-request'), undefined);
  assert.equal([...r.entries].some((e) => e.dev === 'isp' && icmpType(e) === 'dest-unreachable'), false);
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'home', 'isp']);
});

test('traffic between the LAN and the router itself is not translated', () => {
  const net = NQ.createNet('home');
  for (const ip of ['192.168.1.1', OUT]) {
    const r = NQ.sim.ping(net, 'laptop', ip);
    assert.deepEqual([r.delivered, r.replyFrom], [true, ip]);
    assert.equal([...r.entries].some((e) => e.dir === 'nat'), false);
  }
  assert.deepEqual(J(net.devices.home.nat.table), []);
});

test('the router\'s own pings out of its outside iface are not dropped for lack of a mapping', () => {
  const net = NQ.createNet('home');
  assert.deepEqual(NQ.sim.ping(net, 'home', WEB).replyFrom, WEB);
  assert.deepEqual(J(NQ.sim.traceroute(net, 'home', WEB).hops.map((h) => h.from)), ['203.0.113.6', WEB]);
  assert.deepEqual(J(net.devices.home.nat.table), []);
});

test('NAT router with its outside iface down: interface down from 192.168.1.1, no mapping', () => {
  const net = NQ.createNet('home');
  net.devices.home.ifaces.eth1.up = false;
  const r = NQ.sim.ping(net, 'laptop', WEB);
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'interface down', '192.168.1.1']);
  assert.deepEqual(J(net.devices.home.nat.table), []);
});

test('NAT ids run out at 65535: the router drops the packet with a readable verdict', () => {
  const net = NQ.createNet('home');
  net.devices.home.nat.table.push({ inside: '192.168.1.99', outside: OUT, id: 1, outId: 65535, dst: WEB });
  const r = NQ.sim.ping(net, 'laptop', WEB);
  assert.deepEqual([r.delivered, r.reason], [false, 'no reply']);
  const d = [...r.entries].find((e) => e.dir === 'drop' && e.dev === 'home');
  assert.deepEqual([d.dev, d.verdict], ['home', 'NAT table full: no free ICMP identifier']);
  assert.equal(net.devices.home.nat.table.length, 1);
  for (const e of net.log) { const ic = L(e, 'ICMP'); if (ic) assert.ok(ic.fields.id >= 0 && ic.fields.id <= 65535); }
});

test('a de-NATed reply still has its ttl decremented at the router', () => {
  const r = NQ.sim.ping(NQ.createNet('home'), 'laptop', WEB);
  assert.equal(L(at(r, 'laptop', 'rx', 'echo-reply'), 'IPv4').fields.ttl, 62);
});

test('home with web unable to reply (no default route) is still no reply', () => {
  const net = NQ.createNet('home');
  net.devices.web.routes = [];
  const r = NQ.sim.ping(net, 'laptop', WEB);
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'no reply', null]);
  assert.ok(at(r, 'web', 'rx', 'echo-request'));
});

test('deterministic: the same session on two fresh nets logs identical entries and tables', () => {
  const go = () => { const n = NQ.createNet('home'); NQ.sim.ping(n, 'laptop', WEB); NQ.sim.ping(n, 'phone', WEB); NQ.sim.traceroute(n, 'laptop', WEB); return J({ log: n.log, t: n.devices.home.nat.table }); };
  assert.deepEqual(go(), go());
});
