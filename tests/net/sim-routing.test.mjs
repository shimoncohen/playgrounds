// Network Quest: routing, TTL and traceroute (sim.js part 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const J = (x) => JSON.parse(JSON.stringify(x));
const SERVER = '172.16.0.10';
const L = (e, name) => e.packet.layers.find((l) => l.name === name);
const icmpType = (e) => (L(e, 'ICMP') || { fields: {} }).fields.type;
const hasArp = (entries) => entries.some((e) => J(NQ.pkt.layerNames(e.packet)).includes('ARP'));
const dev = (ifaces, routes) => ({ id: 'x', kind: 'router', ifaces, routes: routes || [], neigh: {}, macTable: {}, nat: null });
const nic = (ip, up = true) => ({ mac: NQ.ip.mac(99), ip, up, peer: null });

test('office: laptop reaches the server two routers away', () => {
  const r = NQ.sim.ping(NQ.createNet('office'), 'laptop', SERVER);
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [true, null, SERVER]);
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'r1', 'r2', 'server']);
});

test('first hop: Ethernet dst is the gateway MAC while IPv4 dst stays the server', () => {
  const net = NQ.createNet('office');
  const r = NQ.sim.ping(net, 'laptop', SERVER);
  const first = [...r.entries].find((e) => e.dev === 'laptop' && e.dir === 'tx' && icmpType(e) === 'echo-request');
  assert.equal(L(first, 'Ethernet').fields.dst, net.devices.r1.ifaces.eth0.mac);
  assert.equal(L(first, 'IPv4').fields.dst, SERVER);
  assert.equal(L(first, 'IPv4').fields.ttl, 64);
  const arpReq = [...r.entries].find((e) => e.dev === 'laptop' && L(e, 'ARP'));
  assert.equal(L(arpReq, 'ARP').fields.tpa, '192.168.1.1', 'the sender ARPs for the gateway, not the target');
});

test('routers decrement TTL and rewrite Ethernet per hop; the server sees ttl 62', () => {
  const net = NQ.createNet('office');
  const r = NQ.sim.ping(net, 'laptop', SERVER);
  const d = net.devices;
  const atServer = [...r.entries].find((e) => e.dev === 'server' && e.dir === 'rx' && icmpType(e) === 'echo-request');
  assert.equal(L(atServer, 'IPv4').fields.ttl, 62);
  const f1 = [...r.entries].find((e) => e.dev === 'r1' && e.dir === 'fwd' && icmpType(e) === 'echo-request');
  assert.equal(f1.iface, 'eth1');
  assert.equal(f1.verdict, 'forwarded out eth1 via 10.0.1.2, ttl 63');
  assert.deepEqual(J(L(f1, 'Ethernet').fields), { src: d.r1.ifaces.eth1.mac, dst: d.r2.ifaces.eth0.mac, type: 'IPv4' });
  assert.deepEqual(J(L(f1, 'IPv4').fields), { src: '192.168.1.10', dst: SERVER, ttl: 63, proto: 'ICMP' });
  const f2 = [...r.entries].find((e) => e.dev === 'r2' && e.dir === 'fwd' && icmpType(e) === 'echo-request');
  assert.equal(L(f2, 'Ethernet').fields.dst, d.server.ifaces.eth0.mac);
  assert.equal(L(f2, 'IPv4').fields.ttl, 62);
  const back = [...r.entries].find((e) => e.dev === 'laptop' && e.dir === 'rx' && icmpType(e) === 'echo-reply');
  assert.equal(L(back, 'IPv4').fields.ttl, 62, 'the reply starts at 64 and crosses two routers');
});

test('second ping logs no ARP at all (gateway and next hops are cached)', () => {
  const net = NQ.createNet('office');
  NQ.sim.ping(net, 'laptop', SERVER);
  const r = NQ.sim.ping(net, 'laptop', SERVER, { seq: 2 });
  assert.equal(r.delivered, true);
  assert.equal(hasArp(r.entries), false);
});

test('traceroute laptop -> server: 192.168.1.1, 10.0.1.2, 172.16.0.10', () => {
  const net = NQ.createNet('office');
  const before = net.log.length;
  const t = NQ.sim.traceroute(net, 'laptop', SERVER);
  assert.deepEqual(J(t.hops), [
    { ttl: 1, from: '192.168.1.1', reached: false },
    { ttl: 2, from: '10.0.1.2', reached: false },
    { ttl: 3, from: SERVER, reached: true }
  ]);
  assert.equal(t.entries.length, net.log.length - before);
  assert.deepEqual(J(t.entries), J(net.log.slice(before)));
});

test('ttl 1 expires at r1, ttl 2 at r2: time-exceeded from the ingress iface', () => {
  const net = NQ.createNet('office');
  let r = NQ.sim.ping(net, 'laptop', SERVER, { ttl: 1, id: 7, seq: 3 });
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'ttl exceeded', '192.168.1.1']);
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'r1']);
  const dropped = [...r.entries].find((e) => e.dev === 'r1' && e.dir === 'drop');
  assert.deepEqual([dropped.iface, dropped.verdict], ['eth0', 'TTL expired, packet discarded']);
  const err = [...r.entries].find((e) => e.dev === 'laptop' && e.dir === 'rx' && icmpType(e) === 'time-exceeded');
  assert.deepEqual(J(L(err, 'IPv4').fields), { src: '192.168.1.1', dst: '192.168.1.10', ttl: 64, proto: 'ICMP' });
  assert.deepEqual(J(L(err, 'ICMP').fields), { type: 'time-exceeded', id: 7, seq: 3 });
  assert.ok(NQ.pkt.hex(err.packet).length > 0, 'ICMP errors encode');
  r = NQ.sim.ping(net, 'laptop', SERVER, { ttl: 2 });
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'ttl exceeded', '10.0.1.2']);
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'r1', 'r2']);
});

test('laptop without its default route: no route, nothing logged', () => {
  const net = NQ.createNet('office');
  net.devices.laptop.routes = [];
  const r = NQ.sim.ping(net, 'laptop', SERVER);
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'no route', null]);
  assert.equal(r.entries.length, 0);
});

test('r1 without its static route: r1 drops and sends dest-unreachable (no route)', () => {
  const net = NQ.createNet('office');
  net.devices.r1.routes = [];
  const r = NQ.sim.ping(net, 'laptop', SERVER);
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'no route', '192.168.1.1']);
  const drops = [...r.entries].filter((e) => e.dir === 'drop' && e.dev === 'r1');
  assert.deepEqual(drops.map((e) => [e.iface, e.verdict]), [['eth0', 'no route to 172.16.0.10']]);
  assert.ok([...r.entries].some((e) => e.dev === 'laptop' && e.dir === 'rx' && icmpType(e) === 'dest-unreachable'));
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'r1']);
});

test('routing loop: r1 default points back at r2; ping 8.8.8.8 ends in ttl exceeded, well under the step limit', () => {
  const net = NQ.createNet('office');
  net.devices.r1.routes.push({ dst: 'default', via: '10.0.1.2', dev: 'eth1' });
  const r = NQ.sim.ping(net, 'laptop', '8.8.8.8');
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'ttl exceeded', '10.0.1.2']);
  assert.ok(r.entries.length < 100, 'entries: ' + r.entries.length);
  assert.equal([...r.entries].some((e) => e.verdict === 'simulation step limit'), false);
  for (const e of r.entries) { const ip = L(e, 'IPv4'); if (ip) assert.ok(ip.fields.ttl >= 0 && ip.fields.ttl <= 255); }
});

test('the next hop never answers ARP: the router reports host unreachable', () => {
  const net = NQ.createNet('office');
  net.devices.server.ifaces.eth0.up = false;
  const r = NQ.sim.ping(net, 'laptop', SERVER);
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'host unreachable', '10.0.1.2']);
  const d = [...r.entries].find((e) => e.dev === 'r2' && e.dir === 'drop');
  assert.equal(d.verdict, 'no ARP answer from 172.16.0.10, packet discarded');
  assert.ok([...r.entries].some((e) => e.dev === 'laptop' && e.dir === 'rx' && icmpType(e) === 'dest-unreachable'));
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'r1', 'r2']);
});

test('the router egress iface is down: the host gets interface down from r1', () => {
  const net = NQ.createNet('office');
  net.devices.r1.ifaces.eth1.up = false;
  const r = NQ.sim.ping(net, 'laptop', SERVER);
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'interface down', '192.168.1.1']);
  const d = [...r.entries].find((e) => e.dev === 'r1' && e.dir === 'drop');
  assert.deepEqual([d.iface, d.verdict], ['eth0', 'cannot send to 172.16.0.10: interface down']);
});

test('a router that is the target answers for its far address', () => {
  const r = NQ.sim.ping(NQ.createNet('office'), 'laptop', '10.0.1.2');
  assert.deepEqual([r.delivered, r.replyFrom], [true, '10.0.1.2']);
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'r1', 'r2']);
});

test('hosts never forward: a packet for someone else is dropped', () => {
  const net = NQ.createNet('office');
  net.devices.laptop.routes = [{ dst: 'default', via: '192.168.1.20', dev: 'eth0' }];
  const r = NQ.sim.ping(net, 'laptop', SERVER);
  assert.equal(r.delivered, false);
  const d = [...r.entries].find((e) => e.dev === 'printer' && e.dir === 'drop' && icmpType(e) === 'echo-request');
  assert.equal(d.verdict, 'not addressed to this host');
});

test('route(): longest prefix beats default', () => {
  const d = dev({ eth0: nic('10.0.0.1/24'), eth1: nic('10.0.1.1/30') }, [
    { dst: 'default', via: '10.0.0.254', dev: 'eth0' }, { dst: '172.16.0.0/16', via: '10.0.1.2', dev: 'eth1' }]);
  assert.deepEqual(J(NQ.sim.route(d, '172.16.5.5')), { via: '10.0.1.2', dev: 'eth1' });
  assert.deepEqual(J(NQ.sim.route(d, '8.8.8.8')), { via: '10.0.0.254', dev: 'eth0' });
  assert.deepEqual(J(NQ.sim.route(d, '10.0.0.7')), { via: null, dev: 'eth0' });
  d.routes.push({ dst: '172.16.5.0/24', via: '10.0.0.9', dev: 'eth0' });
  assert.deepEqual(J(NQ.sim.route(d, '172.16.5.5')), { via: '10.0.0.9', dev: 'eth0' });
});

test('route(): connected beats a static route of equal length', () => {
  const d = dev({ eth0: nic('10.0.0.1/24'), eth1: nic('10.0.1.1/30') }, [{ dst: '10.0.0.0/24', via: '10.0.1.2', dev: 'eth1' }]);
  assert.deepEqual(J(NQ.sim.route(d, '10.0.0.5')), { via: null, dev: 'eth0' });
});

test('route(): a route on a down iface is used only when nothing else matches', () => {
  const d = dev({ eth0: nic('10.0.0.1/24'), eth1: nic('10.0.1.1/30', false) }, [
    { dst: '172.16.0.0/24', via: '10.0.1.2', dev: 'eth1' }]);
  assert.deepEqual(J(NQ.sim.route(d, '172.16.0.9')), { via: '10.0.1.2', dev: 'eth1' });
  assert.deepEqual(J(NQ.sim.nextHop(d, '172.16.0.9')), { iface: 'eth1', nextIp: '10.0.1.2', via: '10.0.1.2' });
  d.routes.push({ dst: 'default', via: '10.0.0.254', dev: 'eth0' });
  assert.deepEqual(J(NQ.sim.route(d, '172.16.0.9')), { via: '10.0.0.254', dev: 'eth0' }, 'the up default wins over the longer down route');
  assert.deepEqual(J(NQ.sim.route(d, '10.0.1.2')), { via: '10.0.0.254', dev: 'eth0' }, 'a down iface has no connected subnet');
});

test('route(): a default-only host, no match, and malformed routes', () => {
  const h = dev({ eth0: nic('192.168.1.10/24') }, [{ dst: 'default', via: '192.168.1.1', dev: 'eth0' }]);
  assert.deepEqual(J(NQ.sim.route(h, '1.2.3.4')), { via: '192.168.1.1', dev: 'eth0' });
  assert.deepEqual(J(NQ.sim.nextHop(h, '1.2.3.4')), { iface: 'eth0', nextIp: '192.168.1.1', via: '192.168.1.1' });
  const lone = dev({ eth0: nic('192.168.1.10/24') });
  assert.equal(NQ.sim.route(lone, '1.2.3.4'), null);
  assert.equal(NQ.sim.nextHop(lone, '1.2.3.4'), null);
  const bad = dev({ eth0: nic('192.168.1.10/24'), eth9: nic(null) }, [
    { dst: 'default', via: '192.168.1.1', dev: 'nope' }, { dst: 'default', via: 'banana', dev: 'eth0' },
    { dst: '1.2.3.0/99', via: '192.168.1.1', dev: 'eth0' }, null, { dst: 'default', via: '192.168.1.1', dev: 'eth9' }]);
  assert.equal(NQ.sim.route(bad, '1.2.3.4'), null);
  assert.equal(NQ.sim.route(lone, 'not-an-ip'), null);
});

test('a malformed route on a router drops with no route instead of throwing', () => {
  const net = NQ.createNet('office');
  net.devices.r1.routes = [{ dst: '172.16.0.0/24', via: '10.0.1.2', dev: 'eth7' }];
  const r = NQ.sim.ping(net, 'laptop', SERVER);
  assert.deepEqual([r.reason, r.replyFrom], ['no route', '192.168.1.1']);
});

test('duplicate IP: phone also claims 10.0.0.2; both ARP replies are logged, laptop (first reply) gets the ping, phone (last reply) stays cached', () => {
  const net = NQ.createNet('pair');
  net.devices.tablet = { id: 'tablet', kind: 'host', ifaces: { eth0: { mac: NQ.ip.mac(40), ip: '10.0.0.4/24', up: true, peer: 'sw1.p3' } }, routes: [], neigh: {}, macTable: {}, nat: null };
  net.devices.sw1.ifaces.p3 = { mac: NQ.ip.mac(41), ip: null, up: true, peer: 'tablet.eth0' };
  net.devices.phone.ifaces.eth0.ip = '10.0.0.2/24';
  const r = NQ.sim.ping(net, 'tablet', '10.0.0.2');
  const replies = [...r.entries].filter((e) => e.dir === 'tx' && L(e, 'ARP') && L(e, 'ARP').fields.op === 'reply');
  assert.deepEqual(replies.map((e) => e.dev), ['laptop', 'phone']);
  assert.deepEqual([r.delivered, r.replyFrom], [true, '10.0.0.2']);
  assert.deepEqual(J(r.hops), ['tablet', 'sw1', 'laptop']);
  assert.equal(net.devices.tablet.neigh['10.0.0.2'], net.devices.phone.ifaces.eth0.mac);
});

test('traceroute: caps at maxHops, stops on other failures, validates maxHops', () => {
  const net = NQ.createNet('office');
  net.devices.r1.routes.push({ dst: 'default', via: '10.0.1.2', dev: 'eth1' });
  const t = NQ.sim.traceroute(net, 'laptop', '8.8.8.8', 5);
  assert.deepEqual(J(t.hops.map((h) => h.ttl)), [1, 2, 3, 4, 5]);
  assert.deepEqual(J(t.hops.map((h) => h.from)), ['192.168.1.1', '10.0.1.2', '10.0.1.1', '10.0.1.2', '10.0.1.1']);
  assert.ok(t.hops.every((h) => h.reached === false));
  const n2 = NQ.createNet('office');
  n2.devices.r2.routes = [{ dst: '192.168.1.0/24', via: '10.0.1.1', dev: 'eth0' }]; // a way back, but nowhere further
  n2.devices.r1.routes = [{ dst: 'default', via: '10.0.1.2', dev: 'eth1' }];
  assert.deepEqual(J(NQ.sim.traceroute(n2, 'laptop', '8.8.8.8').hops), [
    { ttl: 1, from: '192.168.1.1', reached: false }, { ttl: 2, from: '10.0.1.2', reached: false }, // TTL is checked before the route
    { ttl: 3, from: '10.0.1.2', reached: false, reason: 'no route' }]);
  const n3 = NQ.createNet('office');
  n3.devices.laptop.routes = [];
  assert.deepEqual(J(NQ.sim.traceroute(n3, 'laptop', SERVER).hops), [{ ttl: 1, from: null, reached: false, reason: 'no route' }]);
  for (const m of [0, 65, 1.5, '3']) assert.throws(() => NQ.sim.traceroute(NQ.createNet('office'), 'laptop', SERVER, m));
  assert.equal(NQ.sim.traceroute(NQ.createNet('office'), 'laptop', SERVER, 64).hops.length, 3);
});

test('deterministic: the same traceroute on two fresh nets logs identical entries', () => {
  const a = NQ.sim.traceroute(NQ.createNet('office'), 'laptop', SERVER);
  const b = NQ.sim.traceroute(NQ.createNet('office'), 'laptop', SERVER);
  assert.deepEqual(J(a.entries), J(b.entries));
});

// Updated on purpose in Task 7: these pinned the pre-NAT home outcome (isp had no route back to 192.168.1.10). With NAT
// the ping succeeds (tests/net/sim-nat.test.mjs), so the no-reply pin moves to a web that cannot send its reply back.
test('home: the request reaches web but web has no route back, so ping reports no reply', () => {
  const net = NQ.createNet('home');
  net.devices.web.routes = [];
  const r = NQ.sim.ping(net, 'laptop', '198.51.100.10');
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'no reply', null]);
  assert.ok([...r.entries].some((e) => e.dev === 'web' && e.dir === 'rx' && icmpType(e) === 'echo-request'), 'web got the request');
  const d = [...r.entries].find((e) => e.dir === 'drop' && e.dev === 'web');
  assert.equal(d.verdict, 'cannot send to 203.0.113.5: no route', 'web replies to the NAT outside address');
  assert.equal(NQ.sim.ping(NQ.createNet('home'), 'laptop', '203.0.113.6').delivered, true, 'with NAT, isp itself answers');
});

test('home: the same ping without laptop\'s default route is a local no route with no entries', () => {
  const net = NQ.createNet('home');
  net.devices.laptop.routes = [];
  const r = NQ.sim.ping(net, 'laptop', '198.51.100.10');
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'no route', null]);
  assert.equal(r.entries.length, 0);
});

// Updated on purpose in Task 7: without NAT, isp now drops the private source silently (dropPrivate) at hop 2.
test('home traceroute without NAT: home answers, isp drops the private source, so hop 2 is no reply and tracing stops', () => {
  const net = NQ.createNet('home');
  net.devices.home.nat = null;
  assert.deepEqual(J(NQ.sim.traceroute(net, 'laptop', '198.51.100.10').hops), [
    { ttl: 1, from: '192.168.1.1', reached: false },
    { ttl: 2, from: null, reached: false, reason: 'no reply' }]);
});

test('traceroute: target reached but its reply lost is a no-reply hop with from null', () => {
  const net = NQ.createNet('office');
  net.devices.server.routes = [];
  const t = NQ.sim.traceroute(net, 'laptop', SERVER);
  assert.deepEqual(J(t.hops), [
    { ttl: 1, from: '192.168.1.1', reached: false }, { ttl: 2, from: '10.0.1.2', reached: false },
    { ttl: 3, from: null, reached: false, reason: 'no reply' }]);
});

test('route(): a via equal to one of the device\'s own addresses is malformed and never matches', () => {
  const d = dev({ eth0: nic('10.0.0.1/24') }, [{ dst: 'default', via: '10.0.0.1', dev: 'eth0' }]);
  assert.equal(NQ.sim.route(d, '8.8.8.8'), null);
  d.routes.push({ dst: 'default', via: '10.0.0.254', dev: 'eth0' });
  assert.deepEqual(J(NQ.sim.route(d, '8.8.8.8')), { via: '10.0.0.254', dev: 'eth0' });
});
