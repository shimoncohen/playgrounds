// Network Quest: the DNS model (zones, resolver, cache) on the dns scenarios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const J = (x) => JSON.parse(JSON.stringify(x));
const ROOT = '192.0.2.10', TLD = '198.51.100.10', AUTH = '203.0.113.10', RES = '192.168.1.53';
const dig = (net, server, name, type = 'A', rd = true) => NQ.dns.query(net, 'laptop', { server, name, type, rd });
const msgOf = (net, server, name, type, rd) => J(dig(net, server, name, type, rd).msg);
const sleep = (net, s) => { for (const d of Object.values(net.devices)) if (d.dns) d.dns.now = (d.dns.now || 0) + s; };
const SOA = 'example.test. 300 IN SOA ns1.example.test. hostmaster.example.test. 1 3600 600 86400 60';
const dnsMsg = (id, qr, extra = {}) => NQ.pkt.dns({ id, qr, opcode: 'QUERY', aa: 0, rd: 1, ra: 0, rcode: 'NOERROR', qname: 'www.example.test.', qtype: 'A', ancount: 0, nscount: 0, arcount: 0, ...extra });

test('dns.js and cmds-dns.js load', () => {
  assert.equal(typeof NQ.dns, 'object');
  assert.equal(typeof NQ.dnsCmds, 'object');
});

test('auth answers from its zone: aa, CNAME followed, MX with its additional record', () => {
  const net = NQ.createNet('dns');
  const a = msgOf(net, AUTH, 'www.example.test', 'A');
  assert.deepEqual([a.qr, a.aa, a.rd, a.ra, a.rcode, a.ancount, a.an1], [1, 1, 1, 0, 'NOERROR', 1, 'www.example.test. 300 IN A 198.18.0.80']);
  assert.equal(msgOf(net, AUTH, 'www.example.test', 'AAAA').an1, 'www.example.test. 300 IN AAAA 2001:db8::80');
  const c = msgOf(net, AUTH, 'shop.example.test', 'A');
  assert.deepEqual([c.ancount, c.an1, c.an2], [2, 'shop.example.test. 300 IN CNAME www.example.test.', 'www.example.test. 300 IN A 198.18.0.80']);
  const mx = msgOf(net, AUTH, 'example.test', 'MX');
  assert.deepEqual([mx.an1, mx.arcount, mx.ar1], ['example.test. 300 IN MX 10 mail.example.test.', 1, 'mail.example.test. 300 IN A 198.18.0.25']);
  assert.equal(msgOf(net, AUTH, 'example.test', 'NS').an1, 'example.test. 300 IN NS ns1.example.test.');
});

test('auth: NODATA and NXDOMAIN carry the SOA, a name outside every zone is REFUSED', () => {
  const net = NQ.createNet('dns');
  const nd = msgOf(net, AUTH, 'www.example.test', 'MX');
  assert.deepEqual([nd.aa, nd.rcode, nd.ancount, nd.nscount, nd.ns1], [1, 'NOERROR', 0, 1, SOA]);
  const nx = msgOf(net, AUTH, 'wwww.example.test', 'A');
  assert.deepEqual([nx.aa, nx.rcode, nx.ancount, nx.ns1], [1, 'NXDOMAIN', 0, SOA]);
  const rf = msgOf(net, AUTH, 'www.example.com', 'A');
  assert.deepEqual([rf.rcode, rf.aa, rf.ancount, rf.nscount], ['REFUSED', 0, 0, 0]);
  assert.equal(msgOf(net, TLD, 'www.example.com', 'A').rcode, 'REFUSED');
});

test('root and tld answer with a referral and glue, not aa', () => {
  const net = NQ.createNet('dns');
  const r = msgOf(net, ROOT, 'www.example.test', 'A');
  assert.deepEqual([r.aa, r.rd, r.ra, r.rcode, r.ancount, r.ns1, r.ar1], [0, 1, 0, 'NOERROR', 0, 'test. 300 IN NS a.nic.test.', 'a.nic.test. 300 IN A 198.51.100.10']);
  const t = msgOf(net, TLD, 'www.example.test', 'A');
  assert.deepEqual([t.aa, t.ancount, t.ns1, t.ar1], [0, 0, 'example.test. 300 IN NS ns1.example.test.', 'ns1.example.test. 300 IN A 203.0.113.10']);
  assert.equal(msgOf(net, ROOT, 'nothing.invalid', 'A').rcode, 'NXDOMAIN');
});

test('port 53 answers only on a name server or resolver: a router or plain host drops the datagram', () => {
  const net = NQ.createNet('dns');
  const r = dig(net, '192.168.1.1', 'www.example.test');
  assert.deepEqual([r.status, r.msg], ['timeout', null]);
  assert.equal(r.entries.at(-1).verdict, 'no one is listening on UDP port 53');
  const office = NQ.dns.query(NQ.createNet('office'), 'laptop', { server: '192.168.1.20', name: 'x.test', type: 'A' });
  assert.equal(office.status, 'timeout');
  assert.equal(office.entries.at(-1).verdict, 'no one is listening on UDP port 53');
});

test('the resolver answers laptop with qr rd ra and caches the answer and both delegations', () => {
  const net = NQ.createNet('dns');
  const m = msgOf(net, RES, 'www.example.test', 'A');
  assert.deepEqual([m.qr, m.aa, m.rd, m.ra, m.rcode, m.an1], [1, 0, 1, 1, 'NOERROR', 'www.example.test. 300 IN A 198.18.0.80']);
  const cache = J(net.devices.resolver.dns.cache).map((e) => [e.name, e.type, e.rcode, e.expires]).sort();
  assert.deepEqual(cache, [['example.test.', 'NS', 'DELEGATION', 300], ['test.', 'NS', 'DELEGATION', 300], ['www.example.test.', 'A', 'NOERROR', 300]]);
  const log = J(net.log.filter((e) => e.dir === 'rx' && /^delivered: DNS/.test(e.verdict)).map((e) => e.dev));
  assert.deepEqual(log, ['resolver', 'root', 'resolver', 'tld', 'resolver', 'auth', 'resolver', 'laptop']);
});

test('the second lookup is a cache hit: query time 0, fewer steps; the cold one costs 12 ms per upstream query', () => {
  const net = NQ.createNet('dns');
  const cold = dig(net, RES, 'www.example.test'), warm = dig(net, RES, 'www.example.test');
  assert.deepEqual([cold.ms, warm.ms], [36, 0]);
  assert.ok(warm.steps < cold.steps, warm.steps + ' < ' + cold.steps);
  assert.deepEqual(J(warm.msg), J(cold.msg));
});

test('cold lookup step count stays under 150', () => {
  const r = dig(NQ.createNet('dns'), RES, 'www.example.test');
  console.log('cold lookup: ' + r.steps + ' steps, ' + r.entries.length + ' log entries');
  assert.ok(r.steps < 150, String(r.steps));
});

test('a second name in the same zone starts at the cached delegation, not at the root', () => {
  const net = NQ.createNet('dns');
  dig(net, RES, 'www.example.test');
  const r = dig(net, RES, 'mail.example.test');
  assert.equal(r.ms, 12);
  assert.equal(r.msg.an1, 'mail.example.test. 300 IN A 198.18.0.25');
});

test('negative answers are cached for min(SOA ttl, SOA minimum) seconds', () => {
  const net = NQ.createNet('dns');
  const cold = dig(net, RES, 'wwww.example.test'), m = J(cold.msg);
  assert.deepEqual([m.rcode, m.ancount, m.ra, m.ns1], ['NXDOMAIN', 0, 1, SOA.replace(' 300 ', ' 60 ')]);
  assert.equal(cold.ms, 36);
  assert.equal(dig(net, RES, 'wwww.example.test').ms, 0);
  sleep(net, 59);
  const warm = dig(net, RES, 'wwww.example.test');
  assert.deepEqual([warm.ms, warm.msg.ns1], [0, SOA.replace(' 300 ', ' 1 ')]);
  sleep(net, 1);
  assert.equal(dig(net, RES, 'wwww.example.test').ms, 12);
  const nodata = dig(net, RES, 'www.example.test', 'MX');
  assert.deepEqual([nodata.msg.rcode, nodata.msg.ancount, nodata.msg.nscount], ['NOERROR', 0, 1]);
  assert.equal(dig(net, RES, 'www.example.test', 'MX').ms, 0);
});

test('ttl counts down on dns.now and the entry expires at 300 seconds', () => {
  const net = NQ.createNet('dns');
  assert.equal(dig(net, RES, 'www.example.test').msg.an1, 'www.example.test. 300 IN A 198.18.0.80');
  sleep(net, 120);
  const w = dig(net, RES, 'www.example.test');
  assert.deepEqual([w.msg.an1, w.ms], ['www.example.test. 180 IN A 198.18.0.80', 0]);
  sleep(net, 200);
  const e = dig(net, RES, 'www.example.test');
  assert.deepEqual([e.msg.an1, e.ms], ['www.example.test. 300 IN A 198.18.0.80', 36]);
  assert.equal(net.clock, net.log.length);
});

test('rd off asks the cache only: a miss is a referral to the nearest cached delegation, else the root hints', () => {
  const net = NQ.createNet('dns');
  const cold = msgOf(net, RES, 'www.example.test', 'A', false);
  assert.deepEqual([cold.qr, cold.rd, cold.ra, cold.aa, cold.rcode, cold.ancount, cold.ns1, cold.ar1], [1, 0, 1, 0, 'NOERROR', 0, '. 300 IN NS a.root-servers.test.', 'a.root-servers.test. 300 IN A 192.0.2.10']);
  assert.equal(dig(net, RES, 'www.example.test', 'A', false).ms, 0);
  dig(net, RES, 'mail.example.test');
  const hot = msgOf(net, RES, 'www.example.test', 'A', false);
  assert.deepEqual([hot.ancount, hot.ns1], [0, 'example.test. 300 IN NS ns1.example.test.']);
  dig(net, RES, 'www.example.test');
  assert.equal(msgOf(net, RES, 'www.example.test', 'A', false).an1, 'www.example.test. 300 IN A 198.18.0.80');
});

test('the dns-stale resolver serves the stale answer until its cache is cleared', () => {
  const net = NQ.createNet('dns-stale');
  assert.equal(dig(net, RES, 'www.example.test').msg.an1, 'www.example.test. 3600 IN A 198.18.0.99');
  net.devices.resolver.dns.cache = [];
  assert.equal(dig(net, RES, 'www.example.test').msg.an1, 'www.example.test. 300 IN A 198.18.0.80');
});

test('ids are deterministic and depend on name, type and server', () => {
  const id = (name, type = 'A', server = RES) => dig(NQ.createNet('dns'), server, name, type).msg.id;
  assert.equal(id('www.example.test'), id('www.example.test'));
  assert.ok(Number.isInteger(id('www.example.test')) && id('www.example.test') >= 0 && id('www.example.test') <= 0xFFFF);
  assert.notEqual(id('www.example.test'), id('shop.example.test'));
  assert.notEqual(id('www.example.test'), id('www.example.test', 'AAAA'));
  assert.notEqual(id('www.example.test'), id('www.example.test', 'A', AUTH));
});

test('a resolver whose upstream server never answers gives SERVFAIL after the idle hook, and the loop ends', () => {
  const net = NQ.createNet('dns');
  net.devices.auth.ifaces.eth0.up = false;
  const r = dig(net, RES, 'www.example.test');
  assert.equal(r.status, 'ok');
  assert.deepEqual([r.msg.rcode, r.msg.ra, r.msg.ancount], ['SERVFAIL', 1, 0]);
  assert.ok(r.steps < NQ.sim.STEP_LIMIT);
  assert.deepEqual(J(net.devices.resolver.dns.cache).map((e) => e.name).sort(), ['example.test.', 'test.']);
  net.devices.auth.ifaces.eth0.up = true;
  assert.equal(dig(net, RES, 'www.example.test').msg.rcode, 'NOERROR');
});

test('a resolver that cannot reach any server answers SERVFAIL; an unreachable resolver is a timeout', () => {
  const net = NQ.createNet('dns');
  net.devices.resolver.routes = [];
  assert.equal(dig(net, RES, 'www.example.test').msg.rcode, 'SERVFAIL');
  const net2 = NQ.createNet('dns');
  net2.devices.laptop.routes = [];
  net2.devices.laptop.ifaces.eth0.ip = '10.9.9.9/24';
  const t = dig(net2, RES, 'www.example.test');
  assert.deepEqual([t.status, t.msg, t.ms], ['timeout', null, 0]);
});

const chain = (net, n) => {
  const rs = net.devices.auth.dns.zones[0].records;
  for (let i = 1; i <= n; i++) rs.push({ name: `c${i}.example.test.`, type: 'CNAME', ttl: 300, data: i === n ? 'www.example.test.' : `c${i + 1}.example.test.` });
};

test('a chain of eight CNAMEs resolves; nine, and a loop, are SERVFAIL', () => {
  const ok = NQ.createNet('dns'), bad = NQ.createNet('dns'), loop = NQ.createNet('dns');
  chain(ok, 8);
  chain(bad, 9);
  loop.devices.auth.dns.zones[0].records.push({ name: 'a.example.test.', type: 'CNAME', ttl: 300, data: 'b.example.test.' }, { name: 'b.example.test.', type: 'CNAME', ttl: 300, data: 'a.example.test.' });
  const r = dig(ok, RES, 'c1.example.test');
  assert.deepEqual([r.msg.rcode, r.msg.an3], ['NOERROR', 'www.example.test. 300 IN A 198.18.0.80']);
  assert.equal(dig(bad, RES, 'c1.example.test').msg.rcode, 'SERVFAIL');
  assert.equal(dig(loop, RES, 'a.example.test').msg.rcode, 'SERVFAIL');
});

test('a reply must match a pending upstream query on source ip, port and id, else it is not taken', () => {
  const net = NQ.createNet('dns');
  net.devices.auth.ifaces.eth0.up = false;
  const K = NQ.sim.kit, seen = [];
  const ctx = K.session(net, 'laptop', 0, 0);
  ctx.idle.push((c) => {
    if (seen.length) return false;
    const key = Object.keys(c.ext.dns.pending)[0], [dev, ip, id] = key.split('|'), port = c.ext.dns.pending[key].port, claim = c.claims[dev + '|' + port];
    const spoof = (src, dport, mid) => NQ.pkt.stack(NQ.pkt.eth('02:00:00:00:00:99', '02:00:00:00:00:02', 'IPv4'), NQ.pkt.ipv4(src, RES, 60, 'UDP'), NQ.pkt.udp(53, dport), dnsMsg(mid, 1));
    for (const p of [spoof(TLD, port, +id), spoof(ip, port, (+id + 1) & 0xFFFF), spoof(ip, port + 1, +id)]) seen.push(claim(c, c.net.devices.resolver, 'eth0', p));
    seen.push(Object.keys(c.ext.dns.pending).includes(key));
    return false;
  });
  K.ipSend(ctx, net.devices.laptop, [NQ.pkt.ipv4('192.168.1.10', RES, 64, 'UDP'), NQ.pkt.udp(40000, 53), dnsMsg(7, 0)], 'q', { quiet: true });
  K.settle(ctx);
  assert.deepEqual(seen, [false, false, false, true]);
});

test('a reply or stray datagram with nothing waiting for it falls to the silent drop', () => {
  const net = NQ.createNet('dns');
  const K = NQ.sim.kit, ctx = K.session(net, 'root', 0, 0);
  for (const port of [53, 33500]) K.ipSend(ctx, net.devices.root, [NQ.pkt.ipv4(ROOT, RES, 64, 'UDP'), NQ.pkt.udp(53, port), dnsMsg(1, 1)], 'spoof', { quiet: true });
  K.settle(ctx);
  assert.deepEqual(J(ctx.entries.filter((e) => e.dir === 'drop' && e.dev === 'resolver').map((e) => e.verdict)), ['no one is listening on UDP port 53', 'no one is listening on UDP port 33500']);
});

test('lookups leave no session state on the net: pending queries die with the session and clone copies only data', () => {
  const net = NQ.createNet('dns');
  dig(net, RES, 'www.example.test');
  assert.deepEqual(Object.keys(net).sort(), ['clock', 'devices', 'log', 'me', 'name']);
  assert.deepEqual(J(net.clone().devices.resolver.dns), J(net.devices.resolver.dns));
});

test('ctx.dig probes on a copy: the learner net keeps its log, clock, cache and dns.now', () => {
  const net = NQ.createNet('dns');
  net.exec('dig www.example.test');
  net.exec('sleep 30');
  const snap = () => JSON.stringify([net.log.length, net.clock, net.devices.resolver.dns, net.devices.laptop.dns]);
  const before = snap();
  const ctx = NQ.makeCtx(net, [], null);
  const r = ctx.dig('laptop', 'wwww.example.test', 'A', {});
  assert.deepEqual([r.status, r.msg.rcode], ['ok', 'NXDOMAIN']);
  assert.equal(ctx.dig('laptop', 'www.example.test').msg.an1, 'www.example.test. 270 IN A 198.18.0.80');
  assert.equal(ctx.dig('laptop', 'www.example.test', 'A', { server: '203.0.113.10' }).msg.aa, 1);
  assert.equal(ctx.dig('laptop', 'www.example.test', 'A', { rd: false }).msg.ra, 1);
  assert.equal(snap(), before);
});
