// Network Quest: local delivery, ARP and switching (sim.js part 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const J = (x) => JSON.parse(JSON.stringify(x));
const PHONE = '10.0.0.3';
// what a log entry carries, by name: 'arp-request', 'arp-reply', 'echo-request', 'echo-reply'
const kind = (e) => {
  const L = e.packet.layers, names = J(NQ.pkt.layerNames(e.packet));
  if (names.includes('ARP')) return 'arp-' + L[names.indexOf('ARP')].fields.op;
  if (names.includes('ICMP')) return L[names.indexOf('ICMP')].fields.type;
  return names.join('/');
};
const tx = (entries) => [...entries].filter((e) => e.dir === 'tx');
const hasArp = (entries) => entries.some((e) => NQ.pkt.layerNames(e.packet).includes('ARP'));
// pair plus a third host on sw1.p3
const trio = () => {
  const net = NQ.createNet('pair');
  net.devices.tablet = { id: 'tablet', kind: 'host', ifaces: { eth0: { mac: NQ.ip.mac(40), ip: '10.0.0.4/24', up: true, peer: 'sw1.p3' } }, routes: [], neigh: {}, macTable: {}, nat: null };
  net.devices.sw1.ifaces.p3 = { mac: NQ.ip.mac(41), ip: null, up: true, peer: 'tablet.eth0' };
  return net;
};

test('first ping on pair: ARP request (broadcast), ARP reply, echo request, echo reply, in order', () => {
  const net = NQ.createNet('pair');
  const r = NQ.sim.ping(net, 'laptop', PHONE);
  assert.equal(r.delivered, true);
  assert.equal(r.reason, null);
  assert.equal(r.replyFrom, PHONE);
  const t = tx(r.entries);
  assert.deepEqual(t.map(kind), ['arp-request', 'arp-reply', 'echo-request', 'echo-reply']);
  assert.deepEqual(t.map((e) => e.dev), ['laptop', 'phone', 'laptop', 'phone']);
  const ethOf = (e) => e.packet.layers[0].fields;
  assert.equal(ethOf(t[0]).dst, 'ff:ff:ff:ff:ff:ff');
  assert.equal(ethOf(t[0]).type, 'ARP');
  assert.deepEqual(J(t[0].packet.layers[1].fields), { op: 'request', sha: net.devices.laptop.ifaces.eth0.mac, spa: '10.0.0.2', tha: '00:00:00:00:00:00', tpa: PHONE });
  assert.equal(ethOf(t[1]).dst, net.devices.laptop.ifaces.eth0.mac);
  assert.deepEqual(J(t[1].packet.layers[1].fields), { op: 'reply', sha: net.devices.phone.ifaces.eth0.mac, spa: PHONE, tha: net.devices.laptop.ifaces.eth0.mac, tpa: '10.0.0.2' });
  assert.deepEqual(J(NQ.pkt.layerNames(t[2].packet)), ['Ethernet', 'IPv4', 'ICMP']);
  assert.deepEqual(J(t[2].packet.layers[1].fields), { src: '10.0.0.2', dst: PHONE, ttl: 64, proto: 'ICMP' });
  assert.deepEqual(J(t[3].packet.layers[1].fields), { src: PHONE, dst: '10.0.0.2', ttl: 64, proto: 'ICMP' });
  assert.deepEqual(J(t[3].packet.layers[2].fields), { type: 'echo-reply', id: 1, seq: 1 });
  assert.equal(t[0].verdict, 'ARP request: who has 10.0.0.3?');
  for (const e of r.entries) assert.equal(typeof e.verdict, 'string');
  assert.ok(NQ.pkt.hex(t[2].packet).length > 0, 'packets encode');
});

test('after the first ping: laptop cached phone, phone learned laptop, sw1 learned both MACs', () => {
  const net = NQ.createNet('pair');
  NQ.sim.ping(net, 'laptop', PHONE);
  const d = net.devices;
  assert.equal(d.laptop.neigh[PHONE], d.phone.ifaces.eth0.mac);
  assert.equal(d.phone.neigh['10.0.0.2'], d.laptop.ifaces.eth0.mac);
  assert.deepEqual(J(d.sw1.macTable), { [d.laptop.ifaces.eth0.mac]: 'p1', [d.phone.ifaces.eth0.mac]: 'p2' });
});

test('second ping logs no ARP layer anywhere and is delivered', () => {
  const net = NQ.createNet('pair');
  NQ.sim.ping(net, 'laptop', PHONE);
  const r = NQ.sim.ping(net, 'laptop', PHONE, { seq: 2 });
  assert.equal(r.delivered, true);
  assert.equal(hasArp(r.entries), false);
  assert.deepEqual(tx(r.entries).map(kind), ['echo-request', 'echo-reply']);
  assert.equal(tx(r.entries)[1].packet.layers[2].fields.seq, 2);
});

test('hops for the pair ping are laptop, sw1, phone', () => {
  const r = NQ.sim.ping(NQ.createNet('pair'), 'laptop', PHONE);
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'phone']);
});

test('nobody has 10.0.0.99: host unreachable', () => {
  const r = NQ.sim.ping(NQ.createNet('pair'), 'laptop', '10.0.0.99');
  assert.equal(r.delivered, false);
  assert.equal(r.reason, 'host unreachable');
  assert.equal(r.replyFrom, null);
  assert.deepEqual(tx(r.entries).map(kind), ['arp-request']);
});

test('phone eth0 down: host unreachable, and phone logs an interface-down drop', () => {
  const net = NQ.createNet('pair');
  net.devices.phone.ifaces.eth0.up = false;
  const r = NQ.sim.ping(net, 'laptop', PHONE);
  assert.equal(r.delivered, false);
  assert.equal(r.reason, 'host unreachable');
  const drops = [...r.entries].filter((e) => e.dir === 'drop');
  assert.equal(drops.length, 1);
  assert.equal(drops[0].dev, 'phone');
  assert.equal(drops[0].verdict, 'interface down');
  assert.deepEqual(J(net.devices.phone.neigh), {}, 'a down NIC learns nothing');
});

test('local failures: interface down, no address, no route (nothing is sent)', () => {
  let net = NQ.createNet('pair');
  net.devices.laptop.ifaces.eth0.up = false;
  let r = NQ.sim.ping(net, 'laptop', PHONE);
  assert.deepEqual([r.delivered, r.reason], [false, 'interface down']);
  net = NQ.createNet('pair');
  net.devices.laptop.ifaces.eth0.ip = null;
  r = NQ.sim.ping(net, 'laptop', PHONE);
  assert.deepEqual([r.delivered, r.reason], [false, 'no address']);
  net = NQ.createNet('pair');
  r = NQ.sim.ping(net, 'laptop', '8.8.8.8');
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'no route', null]);
  assert.deepEqual(J(r.hops), []);
  assert.equal(r.entries.length, 0);
  assert.equal(net.clock, 0);
});

test('reason constants are exported verbatim', () => {
  assert.deepEqual(J(NQ.sim.REASONS), { noRoute: 'no route', ifDown: 'interface down', unreachable: 'host unreachable', ttl: 'ttl exceeded', noAddr: 'no address', noReply: 'no reply' });
});

test('broadcast ARP is flooded; a bystander drops it as not addressed to this host', () => {
  const net = trio();
  const r = NQ.sim.ping(net, 'laptop', PHONE);
  assert.equal(r.delivered, true);
  const flood = [...r.entries].filter((e) => e.dir === 'fwd' && kind(e) === 'arp-request');
  assert.deepEqual(flood.map((e) => e.iface).sort(), ['p2', 'p3']);
  const tab = [...r.entries].filter((e) => e.dev === 'tablet');
  assert.deepEqual(tab.map((e) => [e.dir, e.verdict]), [['drop', 'not addressed to this host']]);
  assert.deepEqual(J(net.devices.tablet.neigh), {}, 'a bystander does not learn');
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'phone']);
});

test('known unicast is forwarded out one port, not flooded', () => {
  const net = trio();
  const first = NQ.sim.ping(net, 'laptop', PHONE);
  assert.equal([...first.entries].filter((e) => e.dir === 'fwd').length, 5, 'flood to 2 ports + 3 unicast');
  const r = NQ.sim.ping(net, 'laptop', PHONE, { seq: 2 });
  const fwd = [...r.entries].filter((e) => e.dir === 'fwd');
  assert.deepEqual(fwd.map((e) => [e.dev, e.iface, e.verdict]), [['sw1', 'p2', 'forwarded out p2'], ['sw1', 'p1', 'forwarded out p1']]);
  assert.equal([...r.entries].some((e) => e.dev === 'tablet'), false);
});

test('a unicast frame for another MAC reaching a NIC is dropped as not addressed to this host', () => {
  const net = trio();
  NQ.sim.ping(net, 'laptop', PHONE);
  net.devices.sw1.macTable = {}; // sw1 forgets: the echo request is flooded as unknown unicast
  const r = NQ.sim.ping(net, 'laptop', PHONE, { seq: 2 });
  assert.equal(r.delivered, true);
  assert.ok([...r.entries].some((e) => e.dir === 'fwd' && e.verdict === 'flooded: destination MAC unknown'));
  assert.deepEqual([...r.entries].filter((e) => e.dev === 'tablet').map((e) => [e.dir, e.verdict]), [['drop', 'not addressed to this host']]);
});

test('office: laptop reaches printer through the 3-port switch', () => {
  const net = NQ.createNet('office');
  const r = NQ.sim.ping(net, 'laptop', '192.168.1.20');
  assert.equal(r.delivered, true);
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'printer']);
  // the router hears the ARP broadcast but it is not the target
  assert.deepEqual([...r.entries].filter((e) => e.dev === 'r1').map((e) => [e.dir, e.verdict]), [['drop', 'not addressed to this host']]);
});

test('a router answers ARP and echo for its own address', () => {
  const r = NQ.sim.ping(NQ.createNet('office'), 'laptop', '192.168.1.1');
  assert.equal(r.delivered, true);
  assert.equal(r.replyFrom, '192.168.1.1');
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'r1']);
});

test('t is strictly increasing by 1 from 0 and clock equals total entries', () => {
  const net = NQ.createNet('pair');
  const a = NQ.sim.ping(net, 'laptop', PHONE);
  const b = NQ.sim.ping(net, 'laptop', '10.0.0.99');
  const c = NQ.sim.ping(net, 'laptop', PHONE, { seq: 2 });
  assert.deepEqual(net.log.map((e) => e.t), net.log.map((_, i) => i));
  assert.equal(net.clock, net.log.length);
  assert.equal(a.entries.length + b.entries.length + c.entries.length, net.log.length);
});

test('entries are exactly the slice of net.log this call added, and logged packets are snapshots', () => {
  const net = NQ.createNet('pair');
  NQ.sim.ping(net, 'laptop', PHONE);
  const before = net.log.length;
  const r = NQ.sim.ping(net, 'laptop', PHONE, { seq: 2 });
  assert.deepEqual(J(r.entries), J(net.log.slice(before)));
  assert.equal(r.entries[0], net.log[before]);
  // distinct logged entries never share a packet object, so later mutation cannot rewrite history
  const pk = new Set(net.log.map((e) => e.packet));
  assert.equal(pk.size, net.log.length);
});

test('deterministic: the same ping on two fresh nets logs identical entries', () => {
  const a = NQ.sim.ping(NQ.createNet('office'), 'laptop', '192.168.1.20');
  const b = NQ.sim.ping(NQ.createNet('office'), 'laptop', '192.168.1.20');
  assert.deepEqual(J(a), J(b));
});

test('opts: ttl, id and seq land on the echo request; a bad ttl throws', () => {
  const r = NQ.sim.ping(NQ.createNet('pair'), 'laptop', PHONE, { ttl: 5, id: 7, seq: 9 });
  const req = tx(r.entries).find((e) => kind(e) === 'echo-request');
  assert.equal(req.packet.layers[1].fields.ttl, 5);
  assert.deepEqual(J(req.packet.layers[2].fields), { type: 'echo-request', id: 7, seq: 9 });
  assert.equal(r.delivered, true);
  for (const ttl of [-1, 256, 1.5, '64']) assert.throws(() => NQ.sim.ping(NQ.createNet('pair'), 'laptop', PHONE, { ttl }));
  assert.throws(() => NQ.sim.ping(NQ.createNet('pair'), 'nobody', PHONE));
  assert.throws(() => NQ.sim.ping(NQ.createNet('pair'), 'laptop', 'not-an-ip'));
});

test('switch loop: the broadcast storm stops at the step limit instead of hanging', () => {
  const net = NQ.createNet('pair');
  const d = net.devices;
  d.sw2 = { id: 'sw2', kind: 'switch', ifaces: { p1: { mac: NQ.ip.mac(50), ip: null, up: true, peer: 'sw1.p3' }, p2: { mac: NQ.ip.mac(51), ip: null, up: true, peer: 'sw1.p4' } }, routes: [], neigh: {}, macTable: {}, nat: null };
  d.sw1.ifaces.p3 = { mac: NQ.ip.mac(52), ip: null, up: true, peer: 'sw2.p1' };
  d.sw1.ifaces.p4 = { mac: NQ.ip.mac(53), ip: null, up: true, peer: 'sw2.p2' };
  const r = NQ.sim.ping(net, 'laptop', '10.0.0.99');
  assert.equal(r.delivered, false);
  assert.equal(r.reason, 'host unreachable');
  const last = r.entries[r.entries.length - 1];
  assert.deepEqual([last.dir, last.verdict], ['drop', 'simulation step limit']);
  assert.equal([...r.entries].filter((e) => e.verdict === 'simulation step limit').length, 1);
  assert.ok(r.entries.length < 2000);
  assert.equal(net.clock, net.log.length);
});

test('hops follow the copy the target accepted, not flood copies to a dead-end switch', () => {
  const net = NQ.createNet('pair');
  const d = net.devices;
  d.sw2 = { id: 'sw2', kind: 'switch', ifaces: { p1: { mac: NQ.ip.mac(60), ip: null, up: true, peer: 'sw1.p3' }, p2: { mac: NQ.ip.mac(62), ip: null, up: true, peer: null } }, routes: [], neigh: {}, macTable: {}, nat: null };
  d.sw1.ifaces.p3 = { mac: NQ.ip.mac(61), ip: null, up: true, peer: 'sw2.p1' };
  NQ.sim.ping(net, 'laptop', PHONE);
  d.sw1.macTable = {}; // the echo request is flooded, one copy towards sw2
  const r = NQ.sim.ping(net, 'laptop', PHONE, { seq: 2 });
  assert.equal(r.delivered, true);
  assert.ok([...r.entries].some((e) => e.dev === 'sw2' && e.dir === 'fwd'), 'a copy was flooded on by sw2');
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'phone']);
});

// Task 6 ruling: a failure away from the origin that sends no ICMP error back is 'no reply', not the far device's reason
test('off-origin send failure: phone cannot route the reply, logs a drop, and ping reports no reply', () => {
  const net = NQ.createNet('pair');
  net.devices.phone.ifaces.eth0.ip = '10.0.0.3/32'; // phone answers ARP but has no route back to 10.0.0.2
  const r = NQ.sim.ping(net, 'laptop', PHONE);
  assert.deepEqual([r.delivered, r.reason, r.replyFrom], [false, 'no reply', null]);
  const last = r.entries[r.entries.length - 1];
  assert.deepEqual([last.dev, last.iface, last.dir, last.verdict], ['phone', 'eth0', 'drop', 'cannot send to 10.0.0.2: no route']);
  assert.deepEqual(J(NQ.pkt.layerNames(last.packet)), ['IPv4', 'ICMP']);
  assert.deepEqual(J(r.hops), ['laptop', 'sw1', 'phone'], 'the request still arrived');
});

test('off-origin send failure: the reply would leave through a down iface, ping reports no reply', () => {
  const net = NQ.createNet('pair');
  const ph = net.devices.phone.ifaces;
  ph.eth0.ip = '10.0.0.3/32';
  ph.eth1 = { mac: NQ.ip.mac(70), ip: '10.0.0.1/30', up: false, peer: null }; // the only route back to 10.0.0.2
  const r = NQ.sim.ping(net, 'laptop', PHONE);
  assert.deepEqual([r.delivered, r.reason], [false, 'no reply']);
  const last = r.entries[r.entries.length - 1];
  assert.deepEqual([last.dev, last.iface, last.dir, last.verdict], ['phone', 'eth1', 'drop', 'cannot send to 10.0.0.2: interface down']);
});

test('ARP is per segment: r1 does not answer on its LAN for the address of its other iface', () => {
  const net = NQ.createNet('office');
  net.devices.laptop.ifaces.eth0.ip = '192.168.1.10/0'; // laptop now thinks everything is on its LAN, so it ARPs for 10.0.1.1
  const r = NQ.sim.ping(net, 'laptop', '10.0.1.1');
  assert.deepEqual([r.delivered, r.reason], [false, 'host unreachable']);
  assert.deepEqual([...r.entries].filter((e) => e.dev === 'r1').map((e) => [e.iface, e.dir, e.verdict]), [['eth0', 'drop', 'not addressed to this host']]);
  assert.deepEqual(J(net.devices.r1.neigh), {});
  assert.equal(tx(r.entries).some((e) => kind(e) === 'arp-reply'), false);
});
