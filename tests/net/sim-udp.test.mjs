// Network Quest: UDP dispatch in the simulator (claim, then service, then silent drop) and the seams DNS builds on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const { udp, kit } = NQ.sim;
const P = NQ.pkt;

const send = (net, dst, dport, setup) => {
  const ctx = kit.session(net, 'laptop', 0, 0);
  if (setup) setup(ctx);
  const dev = net.devices.laptop, h = kit.nextHop(dev, dst);
  const src = dev.ifaces[h.iface].ip.split('/')[0];
  kit.ipSend(ctx, dev, [P.ipv4(src, dst, 64, 'UDP'), P.udp(5000, dport)], 'udp to ' + dst, { quiet: true });
  kit.settle(ctx);
  return ctx;
};
const verdicts = (ctx) => ctx.entries.map((e) => e.dev + ' ' + e.dir + ' ' + e.verdict);

test('the kit exports the pieces dns.js builds on', () => {
  assert.deepEqual(Object.keys(kit).sort(), ['ipSend', 'layer', 'log', 'nextHop', 'ownIface', 'session', 'settle']);
  const ctx = kit.session(NQ.createNet('office'), 'laptop', 0, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.ext)), {});
});

test('an expect claim for the device and port wins over the listen service', () => {
  const hits = [];
  udp.listen(9001, () => { hits.push('service'); return true; });
  send(NQ.createNet('office'), '172.16.0.10', 9001, (ctx) => udp.expect(ctx, 'server', 9001, (c, dev, iface, p) => { hits.push('claim ' + dev.id + ' ' + iface + ' ' + P.layerNames(p).join('>')); return true; }));
  assert.deepEqual(hits, ['claim server eth0 Ethernet>IPv4>UDP']);
});

test('a claim on another device or port does not catch the datagram: the listen service runs', () => {
  const hits = [];
  udp.listen(9002, (c, dev) => { hits.push('service ' + dev.id); return true; });
  send(NQ.createNet('office'), '172.16.0.10', 9002, (ctx) => { udp.expect(ctx, 'printer', 9002, () => hits.push('wrong device')); udp.expect(ctx, 'server', 9003, () => hits.push('wrong port')); });
  assert.deepEqual(hits, ['service server']);
});

test('a claim that returns false falls through to the service, then to the drop', () => {
  const hits = [];
  udp.listen(9004, () => { hits.push('service'); return false; });
  const ctx = send(NQ.createNet('office'), '172.16.0.10', 9004, (c) => udp.expect(c, 'server', 9004, () => { hits.push('claim'); return false; }));
  assert.deepEqual(hits, ['claim', 'service']);
  assert.match(verdicts(ctx).at(-1), /^server drop no one is listening on UDP port 9004$/);
});

test('an unsolicited udp datagram is dropped silently: no reply and no ICMP', () => {
  const ctx = send(NQ.createNet('office'), '172.16.0.10', 9999);
  const last = ctx.entries.at(-1);
  assert.deepEqual([last.dev, last.dir, last.verdict], ['server', 'drop', 'no one is listening on UDP port 9999']);
  assert.ok(ctx.entries.every((e) => !P.layerNames(e.packet).includes('ICMP')));
  assert.equal(ctx.entries.filter((e) => e.dev === 'server' && e.dir === 'tx' && P.layerNames(e.packet).includes('IPv4')).length, 0);
});

test('an ICMP error with id 0 reaches the sender as an ordinary entry and is not a claim', () => {
  const net = NQ.createNet('office');
  const hits = [];
  const ctx = send(net, '10.9.9.9', 9005, (c) => { udp.expect(c, 'laptop', 5000, () => hits.push('claim')); udp.expect(c, 'laptop', 0, () => hits.push('claim 0')); });
  assert.deepEqual(hits, []);
  const e = ctx.entries.find((x) => x.dev === 'laptop' && x.verdict.startsWith('delivered'));
  assert.match(e.verdict, /^delivered: ICMP dest-unreachable from 192\.168\.1\.1/);
  assert.equal(P.layerNames(e.packet).includes('UDP'), false);
  assert.equal(e.packet.layers.find((l) => l.name === 'ICMP').fields.id, 0);
  assert.equal(ctx.err, null);
  assert.equal(ctx.replyFrom, null);
});

test('settle runs idle hooks when the queue is empty and stops once none has work', () => {
  const calls = [];
  const net = NQ.createNet('office');
  const ctx = send(net, '172.16.0.10', 9006, (c) => { c.idle.push((x) => { calls.push(x === c); return calls.length === 1; }); });
  assert.deepEqual(calls, [true, true]);
  assert.equal(ctx.limited, false);
});

test('icmp and arp behaviour is unchanged: a ping and a traceroute log the same entries, bytes included', () => {
  const net = NQ.createNet('office');
  const r = NQ.sim.ping(net, 'laptop', '172.16.0.10'), t = NQ.sim.traceroute(net, 'laptop', '172.16.0.10');
  const rows = [...r.entries, ...t.entries].map((e) => [e.t, e.dev, e.iface, e.dir, e.verdict, P.hex(e.packet)]);
  assert.equal(rows.length, 50);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'), 'd0d9def0bef7941d58a188e21313daa9e109d608db5ab789f50990b53f53f9ae');
});

test('udp that reaches a nat router is still dropped: nat cannot translate it', () => {
  const net = NQ.createNet('home');
  const ctx = kit.session(net, 'laptop', 0, 0), dev = net.devices.laptop;
  kit.ipSend(ctx, dev, [P.ipv4('192.168.1.10', '198.51.100.10', 64, 'UDP'), P.udp(5000, 53)], 'udp', { quiet: true });
  kit.settle(ctx);
  assert.ok(ctx.entries.some((e) => e.dev === 'home' && e.dir === 'drop' && e.verdict === 'NAT cannot translate this protocol'));
});
