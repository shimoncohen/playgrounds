// Network Quest: topology model and starter scenarios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const names = ['pair', 'office', 'home', 'dns', 'dns-stale'];
const J = (x) => JSON.parse(JSON.stringify(x));
const addrs = (net) => J(Object.fromEntries(Object.values(net.devices).map((d) => [d.id, Object.fromEntries(Object.entries(d.ifaces).map(([n, i]) => [n, i.ip]))])));
const gw = (net, id) => J(net.devices[id].routes.filter((r) => r.dst === 'default').map((r) => r.via));

test('scenarios: pair, office, home, dns and dns-stale', () => {
  assert.deepEqual(Object.keys(NQ.SCENARIOS), names);
});

for (const name of names) {
  test(name + ': peers are symmetric, MACs unique, IPs parse, via is on a connected subnet', () => {
    const net = NQ.createNet(name);
    assert.equal(net.name, name);
    assert.equal(net.devices[net.me].kind, 'host');
    assert.deepEqual(J(net.log), []);
    assert.equal(net.clock, 0);
    const macs = [];
    for (const [id, d] of Object.entries(net.devices)) {
      assert.equal(d.id, id);
      assert.deepEqual(J(d.neigh), {});
      assert.deepEqual(J(d.macTable), {});
      for (const [n, i] of Object.entries(d.ifaces)) {
        const [pd, pi] = i.peer.split('.');
        assert.ok(net.devices[pd] && net.devices[pd].ifaces[pi], id + '.' + n + ' peer exists');
        assert.equal(net.devices[pd].ifaces[pi].peer, id + '.' + n);
        macs.push(i.mac);
        assert.equal(i.up, true);
        if (d.kind === 'switch') { assert.match(n, /^p\d+$/); assert.equal(i.ip, null); }
        else if (i.ip !== null) assert.ok(NQ.ip.cidr(i.ip), i.ip);
      }
      for (const r of d.routes) {
        assert.ok(r.dst === 'default' || NQ.ip.cidr(r.dst), r.dst);
        assert.ok(d.ifaces[r.dev], 'route dev exists');
        if (r.via !== null) {
          const v = NQ.ip.parse(r.via);
          assert.notEqual(v, null);
          assert.ok(Object.values(d.ifaces).some((i) => i.ip && NQ.ip.inSubnet(v, NQ.ip.cidr(i.ip))), id + ' via ' + r.via);
        }
      }
    }
    assert.equal(new Set(macs).size, macs.length);
  });
}

test('NAT only on home', () => {
  assert.equal(NQ.createNet('pair').devices.laptop.nat, null);
  for (const n of ['pair', 'office']) for (const d of Object.values(NQ.createNet(n).devices)) assert.equal(d.nat, null);
  const home = NQ.createNet('home');
  assert.deepEqual(J(home.devices.home.nat), { inside: 'eth0', outside: 'eth1', table: [] });
  assert.equal(Object.values(home.devices).filter((d) => d.nat).length, 1);
});

test('dropPrivate only on home\'s isp', () => {
  for (const n of names) for (const d of Object.values(NQ.createNet(n).devices)) assert.equal(d.dropPrivate, n === 'home' && d.id === 'isp', n + '.' + d.id);
});

test('pair: devices and addresses', () => {
  const net = NQ.createNet('pair');
  assert.equal(net.me, 'laptop');
  assert.deepEqual(addrs(net), { laptop: { eth0: '10.0.0.2/24' }, phone: { eth0: '10.0.0.3/24' }, sw1: { p1: null, p2: null } });
  assert.equal(net.devices.sw1.kind, 'switch');
  assert.equal(net.devices.laptop.ifaces.eth0.mac, NQ.ip.mac(1));
  assert.equal(net.devices.sw1.ifaces.p2.mac, NQ.ip.mac(4));
});

test('office: devices and addresses', () => {
  const net = NQ.createNet('office');
  assert.equal(net.me, 'laptop');
  assert.deepEqual(addrs(net), {
    laptop: { eth0: '192.168.1.10/24' }, printer: { eth0: '192.168.1.20/24' }, sw1: { p1: null, p2: null, p3: null },
    r1: { eth0: '192.168.1.1/24', eth1: '10.0.1.1/30' }, r2: { eth0: '10.0.1.2/30', eth1: '172.16.0.1/24' }, server: { eth0: '172.16.0.10/24' },
  });
  assert.deepEqual(gw(net, 'laptop'), ['192.168.1.1']);
  assert.deepEqual(gw(net, 'r2'), ['10.0.1.1']);
  assert.deepEqual(gw(net, 'server'), ['172.16.0.1']);
  assert.deepEqual(gw(net, 'printer'), []);
  assert.deepEqual(J(net.devices.r1.routes), [{ dst: '172.16.0.0/24', via: '10.0.1.2', dev: 'eth1' }]);
  assert.equal(net.devices.r1.kind, 'router');
});

test('home: devices and addresses', () => {
  const net = NQ.createNet('home');
  assert.equal(net.me, 'laptop');
  assert.deepEqual(addrs(net), {
    laptop: { eth0: '192.168.1.10/24' }, phone: { eth0: '192.168.1.11/24' }, sw1: { p1: null, p2: null, p3: null },
    home: { eth0: '192.168.1.1/24', eth1: '203.0.113.5/30' }, isp: { eth0: '203.0.113.6/30', eth1: '198.51.100.1/24' }, web: { eth0: '198.51.100.10/24' },
  });
  for (const id of ['laptop', 'phone']) assert.deepEqual(gw(net, id), ['192.168.1.1']);
  assert.deepEqual(gw(net, 'home'), ['203.0.113.6']);
  assert.deepEqual(gw(net, 'web'), ['198.51.100.1']);
  assert.deepEqual(gw(net, 'isp'), []);
});

test('createNet: independent objects', () => {
  const a = NQ.createNet('pair'), b = NQ.createNet('pair');
  a.devices.laptop.ifaces.eth0.ip = '10.9.9.9/24';
  a.log.push({ x: 1 });
  assert.equal(b.devices.laptop.ifaces.eth0.ip, '10.0.0.2/24');
  assert.equal(b.log.length, 0);
  assert.equal(NQ.SCENARIOS.pair.devices.laptop.ifaces.eth0.ip, '10.0.0.2/24');
});

test('reset restores spec, log, clock, neigh, macTable, nat table', () => {
  const net = NQ.createNet('home'), before = J(net);
  net.devices.laptop.ifaces.eth0.ip = '1.1.1.1/8';
  net.devices.laptop.neigh['192.168.1.1'] = 'aa';
  net.devices.sw1.macTable.x = 'p1';
  net.devices.home.nat.table.push({ a: 1 });
  net.devices.laptop.routes.length = 0;
  net.log.push({ x: 1 }); net.clock = 7;
  net.reset();
  assert.deepEqual(J(net), before);
});

test('clone is deep, independent and still resets', () => {
  const a = NQ.createNet('office');
  a.clock = 3;
  const b = a.clone();
  assert.deepEqual(J(b), J(a));
  b.devices.laptop.ifaces.eth0.up = false; b.log.push({ x: 1 }); b.clock = 9;
  assert.equal(a.devices.laptop.ifaces.eth0.up, true);
  assert.equal(a.log.length, 0); assert.equal(a.clock, 3);
  b.reset();
  assert.equal(b.devices.laptop.ifaces.eth0.up, true);
  assert.equal(b.clock, 0);
  a.devices.printer.neigh.k = 'v';
  assert.deepEqual(J(b.devices.printer.neigh), {});
});

test('createNet: unknown name lists the valid ones', () => {
  assert.throws(() => NQ.createNet('nope'), (e) => e.name === 'Error' && names.every((n) => e.message.includes(n)));
});

test('createNet: an empty setup changes nothing; every device has a permanent list', () => {
  assert.deepEqual(J(NQ.createNet('pair', [])), J(NQ.createNet('pair')));
  for (const n of names) for (const d of Object.values(NQ.createNet(n).devices)) assert.deepEqual(J(d.permanent), []);
});

test('exec, clone and reset are not enumerable', () => {
  const net = NQ.createNet('pair');
  assert.deepEqual(Object.keys(net).sort(), ['clock', 'devices', 'log', 'me', 'name']);
});

test('dns: seven devices with the documented addresses and routes', () => {
  const net = NQ.createNet('dns');
  assert.equal(net.me, 'laptop');
  assert.deepEqual(Object.keys(net.devices), ['laptop', 'resolver', 'sw1', 'r1', 'root', 'tld', 'auth']);
  assert.deepEqual(addrs(net).r1, { eth0: '192.168.1.1/24', eth1: '192.0.2.1/24', eth2: '198.51.100.1/24', eth3: '203.0.113.1/24' });
  assert.deepEqual([net.devices.laptop, net.devices.resolver].map((d) => d.ifaces.eth0.ip), ['192.168.1.10/24', '192.168.1.53/24']);
  assert.deepEqual(['root', 'tld', 'auth'].map((d) => net.devices[d].ifaces.eth0.ip), ['192.0.2.10/24', '198.51.100.10/24', '203.0.113.10/24']);
  assert.deepEqual(['laptop', 'resolver', 'root', 'tld', 'auth'].map((d) => gw(net, d)), [['192.168.1.1'], ['192.168.1.1'], ['192.0.2.1'], ['198.51.100.1'], ['203.0.113.1']]);
  assert.deepEqual(J(net.devices.r1.routes), []);
  assert.deepEqual(J(net.devices.sw1.ifaces.p3.peer), 'r1.eth0');
  assert.equal(Object.values(net.devices).some((d) => d.nat || d.dropPrivate), false);
});

test('dns: stub, resolver and name server data; zones glue the delegations together', () => {
  const d = NQ.createNet('dns').devices;
  assert.deepEqual(J(d.laptop.dns), { resolver: '192.168.1.53', roots: ['192.0.2.10'] });
  assert.deepEqual(J(d.resolver.dns), { recursive: true, roots: ['192.0.2.10'], now: 0, cache: [] });
  assert.deepEqual(J([d.root, d.tld, d.auth].map((x) => x.dns.zones.map((z) => z.origin))), [['.'], ['test.'], ['example.test.']]);
  const rec = (dev, name, type) => J(d[dev].dns.zones[0].records.filter((r) => r.name === name && r.type === type).map((r) => r.data));
  assert.deepEqual(rec('root', 'test.', 'NS'), ['a.nic.test.']);
  assert.deepEqual(rec('root', 'a.nic.test.', 'A'), ['198.51.100.10']);
  assert.deepEqual(rec('tld', 'example.test.', 'NS'), ['ns1.example.test.']);
  assert.deepEqual(rec('tld', 'ns1.example.test.', 'A'), ['203.0.113.10']);
  assert.deepEqual(rec('auth', 'www.example.test.', 'A'), ['198.18.0.80']);
  assert.deepEqual(rec('auth', 'www.example.test.', 'AAAA'), ['2001:db8::80']);
  assert.deepEqual(rec('auth', 'shop.example.test.', 'CNAME'), ['www.example.test.']);
  assert.deepEqual(rec('auth', 'example.test.', 'MX'), ['10 mail.example.test.']);
  assert.deepEqual(rec('auth', 'mail.example.test.', 'A'), ['198.18.0.25']);
  for (const x of [d.root, d.tld, d.auth]) assert.deepEqual([x.dns.zones[0].soa.ttl, x.dns.zones[0].soa.minimum], [300, 60]);
});

test('dns-stale seeds one cache entry and nothing else differs', () => {
  const a = NQ.createNet('dns'), b = NQ.createNet('dns-stale');
  assert.deepEqual(J(b.devices.resolver.dns.cache), [{ name: 'www.example.test.', type: 'A', expires: 3600, rcode: 'NOERROR', rrs: [{ name: 'www.example.test.', ttl: 300, type: 'A', data: '198.18.0.99' }] }]);
  assert.equal(b.devices.resolver.dns.now, 0);
  b.devices.resolver.dns.cache = [];
  assert.deepEqual(J(b.devices), J(a.devices));
});

test('the other scenarios carry no dns field, and scenarios do not share zone data', () => {
  for (const n of ['pair', 'office', 'home']) for (const d of Object.values(NQ.createNet(n).devices)) assert.equal('dns' in d, false, n + '.' + d.id);
  const x = NQ.createNet('dns');
  x.devices.auth.dns.zones[0].records.length = 0;
  assert.ok(NQ.createNet('dns').devices.auth.dns.zones[0].records.length > 0);
});
