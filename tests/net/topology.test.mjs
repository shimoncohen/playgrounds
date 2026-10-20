// Network Quest: topology model and starter scenarios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const names = ['pair', 'office', 'home'];
const J = (x) => JSON.parse(JSON.stringify(x));
const addrs = (net) => J(Object.fromEntries(Object.values(net.devices).map((d) => [d.id, Object.fromEntries(Object.entries(d.ifaces).map(([n, i]) => [n, i.ip]))])));
const gw = (net, id) => J(net.devices[id].routes.filter((r) => r.dst === 'default').map((r) => r.via));

test('scenarios: exactly pair, office, home', () => {
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

test('createNet: setup needs the shell for now', () => {
  assert.deepEqual(J(NQ.createNet('pair', [])), J(NQ.createNet('pair')));
  assert.throws(() => NQ.createNet('pair', [{ dev: 'laptop', cmd: 'ip addr' }]), /setup needs the shell \(Task 8\)/);
});
