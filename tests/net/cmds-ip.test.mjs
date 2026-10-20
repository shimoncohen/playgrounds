// Network Quest: the ip command, setup lines, and ARP learning vs permanent entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const J = (x) => JSON.parse(JSON.stringify(x));
const ok = (net, line, dev) => { const r = net.exec(line, dev); assert.deepEqual(J([r.err, r.code]), [[], 0], line + ' -> ' + r.err); return J(r.out); };
const bad = (net, line, msg, dev) => {
  const before = net.exec('ip addr', dev).out.join('\n') + net.exec('ip route', dev).out.join('\n') + net.exec('ip neigh', dev).out.join('\n');
  const r = net.exec(line, dev);
  assert.deepEqual(J([r.out, r.err, r.code]), [[], [msg], 1], line);
  assert.equal(net.exec('ip addr', dev).out.join('\n') + net.exec('ip route', dev).out.join('\n') + net.exec('ip neigh', dev).out.join('\n'), before, line + ' changed state');
};

test('ip addr on pair', () => {
  const net = NQ.createNet('pair');
  assert.deepEqual(J(net.exec('ip addr').out), [
    '1: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP',
    '    link/ether 02:00:00:00:00:01 brd ff:ff:ff:ff:ff:ff',
    '    inet 10.0.0.2/24 brd 10.0.0.255 scope global eth0',
  ]);
  for (const l of ['ip a', 'ip address', 'ip addr show', 'ip a list', 'ip addr show dev eth0', 'ip addr show eth0']) assert.deepEqual(J(net.exec(l).out), J(net.exec('ip addr').out), l);
  bad(net, 'ip addr show dev eth9', 'Device "eth9" does not exist.');
});

test('ip addr on a router numbers interfaces; /31 and /32 have no brd', () => {
  const net = NQ.createNet('office');
  const o = ok(net, 'ip addr', 'r1');
  assert.equal(o[3], '2: eth1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP');
  assert.equal(o[5], '    inet 10.0.1.1/30 brd 10.0.1.3 scope global eth1');
  net.devices.printer.ifaces.eth0.ip = '1.2.3.4/32';
  assert.equal(ok(net, 'ip addr', 'printer')[2], '    inet 1.2.3.4/32 scope global eth0');
  net.devices.printer.ifaces.eth0.ip = '1.2.3.4/31';
  assert.equal(ok(net, 'ip addr', 'printer')[2], '    inet 1.2.3.4/31 scope global eth0');
  net.devices.printer.ifaces.eth0.ip = null;
  assert.equal(ok(net, 'ip addr', 'printer').length, 2);
});

test('ip addr add: errors leave state unchanged', () => {
  const net = NQ.createNet('pair');
  bad(net, 'ip addr add 10.0.0.300/24 dev eth0', 'Error: inet prefix is expected rather than "10.0.0.300/24".');
  bad(net, 'ip addr add 10.0.0.5/33 dev eth0', 'Error: inet prefix is expected rather than "10.0.0.5/33".');
  bad(net, 'ip addr add 10.0.0.5 dev eth0', 'Error: inet prefix is expected rather than "10.0.0.5".');
  bad(net, 'ip addr add banana dev eth0', 'Error: inet prefix is expected rather than "banana".');
  bad(net, 'ip addr add 10.0.0.5/24 dev eth9', 'Cannot find device "eth9"');
  bad(net, 'ip addr add 10.0.0.5/24', 'Usage: ip addr add <addr/prefix> dev <interface>');
  bad(net, 'ip addr add', 'Usage: ip addr add <addr/prefix> dev <interface>');
  bad(net, 'ip addr add 10.0.0.5/24 dev eth0', 'Error: eth0 already has 10.0.0.2/24; remove it first with: ip addr del 10.0.0.2/24 dev eth0');
  bad(net, 'ip addr del 10.0.0.9/24 dev eth0', 'RTNETLINK answers: Cannot assign requested address');
  bad(net, 'ip addr del 10.0.0.2/24 dev eth9', 'Cannot find device "eth9"');
  bad(net, 'ip addr del 10.0.0.2/24', 'Usage: ip addr del <addr/prefix> dev <interface>');
});

test('ip addr add/del round trips; duplicates across devices are allowed', () => {
  const net = NQ.createNet('pair');
  const before = ok(net, 'ip addr');
  assert.deepEqual(ok(net, 'ip addr del 10.0.0.2/24 dev eth0'), []);
  assert.equal(net.devices.laptop.ifaces.eth0.ip, null);
  assert.equal(ok(net, 'ip addr').length, 2);
  assert.deepEqual(ok(net, 'ip addr add 10.0.0.2/24 dev eth0'), []);
  assert.deepEqual(ok(net, 'ip addr'), before);
  ok(net, 'ip addr del 10.0.0.3/24 dev eth0', 'phone');
  ok(net, 'ip addr add 10.0.0.2/24 dev eth0', 'phone');
  assert.equal(net.devices.phone.ifaces.eth0.ip, '10.0.0.2/24');
});

test('ip addr del leaves static routes alone', () => {
  const net = NQ.createNet('office');
  const n = net.devices.laptop.routes.length;
  ok(net, 'ip addr del 192.168.1.10/24 dev eth0');
  assert.equal(net.devices.laptop.routes.length, n);
});

test('ip route show', () => {
  const o = NQ.createNet('office');
  assert.deepEqual(J(o.exec('ip route').out), ['192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.10', 'default via 192.168.1.1 dev eth0']);
  assert.deepEqual(J(o.exec('ip route show', 'r1').out), [
    '192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.1',
    '10.0.1.0/30 dev eth1 proto kernel scope link src 10.0.1.1',
    '172.16.0.0/24 via 10.0.1.2 dev eth1',
  ]);
  ok(o, 'ip link set eth0 down', 'r1');
  assert.deepEqual(J(o.exec('ip r', 'r1').out), ['10.0.1.0/30 dev eth1 proto kernel scope link src 10.0.1.1', '172.16.0.0/24 via 10.0.1.2 dev eth1']);
});

test('ip route add / del', () => {
  const net = NQ.createNet('office');
  assert.deepEqual(ok(net, 'ip route add 10.5.0.0/24 via 192.168.1.1'), []);
  assert.deepEqual(net.devices.laptop.routes.at(-1) && J(net.devices.laptop.routes.at(-1)), { dst: '10.5.0.0/24', via: '192.168.1.1', dev: 'eth0' });
  assert.ok(ok(net, 'ip route').includes('10.5.0.0/24 via 192.168.1.1 dev eth0'));
  ok(net, 'ip route add 10.6.0.0/24 dev eth0');
  assert.ok(ok(net, 'ip route').includes('10.6.0.0/24 dev eth0 scope link'));
  ok(net, 'ip route add 10.7.0.9 via 192.168.1.1 dev eth0');
  assert.equal(net.devices.laptop.routes.at(-1).dst, '10.7.0.9/32');
  ok(net, 'ip route del 10.5.0.0/24');
  assert.ok(!ok(net, 'ip route').some((l) => l.startsWith('10.5.0.0')));
  ok(net, 'ip route del default');
  assert.ok(!ok(net, 'ip route').some((l) => l.startsWith('default')));
  ok(net, 'ip route add default via 192.168.1.1');
  assert.deepEqual(J(net.devices.laptop.routes.at(-1)), { dst: 'default', via: '192.168.1.1', dev: 'eth0' });
  ok(net, 'ip route add 0.0.0.0/0 via 192.168.1.1', 'printer');
  assert.equal(net.devices.printer.routes[0].dst, 'default');
});

test('ip route errors leave state unchanged', () => {
  const net = NQ.createNet('office');
  bad(net, 'ip route add default via nowhere', 'Error: inet address is expected rather than "nowhere".');
  bad(net, 'ip route add nowhere via 192.168.1.1', 'Error: inet prefix is expected rather than "nowhere".');
  bad(net, 'ip route add 10.5.0.0/33 via 192.168.1.1', 'Error: inet prefix is expected rather than "10.5.0.0/33".');
  bad(net, 'ip route add 10.5.0.1/24 via 192.168.1.1', 'Error: Invalid prefix for given prefix length.');
  bad(net, 'ip route add 10.5.0.0/24 via 8.8.8.8', 'Error: Nexthop has invalid gateway.');
  bad(net, 'ip route add 10.5.0.0/24 via 192.168.1.10', 'Error: Nexthop has invalid gateway.');
  bad(net, 'ip route add 10.5.0.0/24 via 192.168.1.1 dev eth9', 'Cannot find device "eth9"');
  bad(net, 'ip route add 10.5.0.0/24 dev eth9', 'Cannot find device "eth9"');
  bad(net, 'ip route add default via 192.168.1.1', 'RTNETLINK answers: File exists');
  bad(net, 'ip route del 10.9.0.0/24', 'RTNETLINK answers: No such process');
  bad(net, 'ip route add 10.5.0.0/24', 'Usage: ip route add <dst> via <ip> [dev <interface>]   or   ip route add <dst> dev <interface>');
  bad(net, 'ip route add', 'Usage: ip route add <dst> via <ip> [dev <interface>]   or   ip route add <dst> dev <interface>');
  bad(net, 'ip route del', 'Usage: ip route del <dst>');
  ok(net, 'ip route add 10.5.0.0/24 via 192.168.1.1');
  bad(net, 'ip route add 10.5.0.0/24 via 192.168.1.1', 'RTNETLINK answers: File exists');
  const r1 = NQ.createNet('office');
  bad(r1, 'ip route add 10.9.0.0/24 via 10.0.1.2 dev eth0', 'Error: Nexthop has invalid gateway.', 'r1');
  ok(r1, 'ip link set eth1 down', 'r1');
  bad(r1, 'ip route add 10.9.0.0/24 via 10.0.1.2', 'Error: Nexthop has invalid gateway.', 'r1');
});

test('ip neigh after a ping, add, del, PERMANENT', () => {
  const net = NQ.createNet('pair');
  assert.deepEqual(ok(net, 'ip neigh'), []);
  assert.equal(NQ.sim.ping(net, 'laptop', '10.0.0.3').delivered, true);
  assert.deepEqual(J(net.exec('ip neigh').out), ['10.0.0.3 dev eth0 lladdr 02:00:00:00:00:02 REACHABLE']);
  assert.deepEqual(ok(net, 'ip neigh add 10.0.0.9 lladdr AA:bb:cc:dd:ee:0f dev eth0'), []);
  assert.deepEqual(J(net.exec('ip n show').out), ['10.0.0.3 dev eth0 lladdr 02:00:00:00:00:02 REACHABLE', '10.0.0.9 dev eth0 lladdr aa:bb:cc:dd:ee:0f PERMANENT']);
  ok(net, 'ip neigh add 10.0.0.9 lladdr 02:00:00:00:00:09 dev eth0');
  assert.deepEqual(J(net.devices.laptop.permanent), ['10.0.0.9']);
  assert.equal(net.devices.laptop.neigh['10.0.0.9'], '02:00:00:00:00:09');
  ok(net, 'ip neigh del 10.0.0.9 dev eth0');
  assert.deepEqual(J(net.devices.laptop.permanent), []);
  assert.deepEqual(J(net.exec('ip neigh').out), ['10.0.0.3 dev eth0 lladdr 02:00:00:00:00:02 REACHABLE']);
  bad(net, 'ip neigh del 10.0.0.9 dev eth0', 'RTNETLINK answers: No such file or directory');
  bad(net, 'ip neigh add 10.0.0.999 lladdr 02:00:00:00:00:09 dev eth0', 'Error: inet address is expected rather than "10.0.0.999".');
  bad(net, 'ip neigh add 10.0.0.9 lladdr 02:00:00:09 dev eth0', 'Error: lladdr is expected rather than "02:00:00:09".');
  bad(net, 'ip neigh add 10.0.0.9 lladdr 02:00:00:00:00:09 dev eth9', 'Cannot find device "eth9"');
  bad(net, 'ip neigh add 10.0.0.9', 'Usage: ip neigh add <ip> lladdr <mac> dev <interface>');
  bad(net, 'ip neigh del 10.0.0.3', 'Usage: ip neigh del <ip> dev <interface>');
  bad(net, 'ip neigh del 10.0.0.3 dev eth9', 'Cannot find device "eth9"');
});

test('ip neigh: off-subnet entries fall back to the first interface', () => {
  const net = NQ.createNet('office');
  net.devices.r1.neigh['10.0.1.2'] = '02:00:00:00:00:aa';
  net.devices.r1.neigh['9.9.9.9'] = '02:00:00:00:00:bb';
  assert.deepEqual(J(net.exec('ip neigh', 'r1').out), ['10.0.1.2 dev eth1 lladdr 02:00:00:00:00:aa REACHABLE', '9.9.9.9 dev eth0 lladdr 02:00:00:00:00:bb REACHABLE']);
});

test('a permanent neigh entry is not overwritten by ARP learning', () => {
  const net = NQ.createNet('pair');
  ok(net, 'ip neigh add 10.0.0.3 lladdr 02:00:00:00:00:99 dev eth0');
  NQ.sim.ping(net, 'phone', '10.0.0.2'); // phone's ARP request reaches laptop
  assert.equal(net.devices.laptop.neigh['10.0.0.3'], '02:00:00:00:00:99');
  assert.equal(NQ.sim.ping(net, 'laptop', '10.0.0.3').delivered, false); // the wrong MAC stays wrong
  assert.equal(net.devices.laptop.neigh['10.0.0.3'], '02:00:00:00:00:99');
  ok(net, 'ip neigh del 10.0.0.3 dev eth0');
  assert.equal(NQ.sim.ping(net, 'laptop', '10.0.0.3').delivered, true);
  assert.equal(net.devices.laptop.neigh['10.0.0.3'], '02:00:00:00:00:02');
});

test('a permanent entry is not overwritten by an ARP reply either', () => {
  const net = NQ.createNet('pair');
  ok(net, 'ip neigh add 10.0.0.3 lladdr 02:00:00:00:00:99 dev eth0');
  const arp = NQ.pkt.stack(NQ.pkt.eth('02:00:00:00:00:02', '02:00:00:00:00:01', 'ARP'), NQ.pkt.arp('reply', '02:00:00:00:00:02', '10.0.0.3', '02:00:00:00:00:01', '10.0.0.2'));
  NQ.sim.inject(net, 'laptop', 'eth0', arp);
  assert.equal(net.devices.laptop.neigh['10.0.0.3'], '02:00:00:00:00:99');
});

test('ip link', () => {
  const net = NQ.createNet('pair');
  assert.deepEqual(J(net.exec('ip link').out), ['1: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP', '    link/ether 02:00:00:00:00:01 brd ff:ff:ff:ff:ff:ff']);
  assert.deepEqual(ok(net, 'ip link set eth0 down'), []);
  assert.deepEqual(J(net.exec('ip addr').out.slice(0, 1)), ['1: eth0: <BROADCAST,MULTICAST> mtu 1500 state DOWN']);
  assert.equal(net.exec('ip l show').out[0], '1: eth0: <BROADCAST,MULTICAST> mtu 1500 state DOWN');
  ok(net, 'ip link set dev eth0 up');
  assert.equal(net.devices.laptop.ifaces.eth0.up, true);
  bad(net, 'ip link set eth9 up', 'Cannot find device "eth9"');
  bad(net, 'ip link set eth0 sideways', 'Error: argument "sideways" is wrong: use "up" or "down"');
  bad(net, 'ip link set eth0', 'Usage: ip link set <interface> up|down');
});

test('lockout: a learner can cut themselves off and recover with reset', () => {
  const net = NQ.createNet('pair');
  const before = J(net.exec('ip addr').out);
  ok(net, 'ip addr del 10.0.0.2/24 dev eth0');
  ok(net, 'ip link set eth0 down');
  for (const l of ['ip addr', 'ip route', 'ip neigh', 'ip link', 'help', 'ip', 'ip addr add 10.0.0.2/24 dev eth0', 'ip route add default via 10.0.0.1', 'ip neigh del 1.1.1.1 dev eth0', 'nope']) {
    const r = net.exec(l);
    assert.ok(Array.isArray(r.out) && Number.isInteger(r.code), l);
  }
  net.reset();
  assert.deepEqual(J(net.exec('ip addr').out), before);
});

test('ip alone, ip help and unknown objects', () => {
  const net = NQ.createNet('pair');
  const u = net.exec('ip').out;
  assert.ok(u.length > 4 && /^Usage: ip/.test(u[0]));
  assert.deepEqual(J(net.exec('ip help').out), J(u));
  const r = net.exec('ip foo');
  assert.deepEqual(J([r.out, r.err, r.code]), [[], ['Object "foo" is unknown, try "ip help".'], 1]);
  const v = net.exec('ip addr frobnicate');
  assert.deepEqual(J([v.out, v.err, v.code]), [[], ['Command "frobnicate" is unknown, try "ip help".'], 1]);
  assert.equal(net.exec('ip -s').code, 1);
});

test('pipes work on ip output', () => {
  const net = NQ.createNet('pair');
  assert.deepEqual(J(net.exec('ip addr | grep 10.0.0').out), ['    inet 10.0.0.2/24 brd 10.0.0.255 scope global eth0']);
  assert.equal(net.exec('ip addr | grep 99.9').code, 1);
  assert.equal(net.exec('ip addr |').code, 2);
  assert.equal(net.exec('| grep x').code, 2);
});

test('setup lines run through the shell with a clean log and clock', () => {
  const setup = [{ dev: 'laptop', cmd: 'ip route del default' }];
  const net = NQ.createNet('office', setup);
  assert.ok(!net.exec('ip route').out.some((l) => l.startsWith('default')));
  assert.deepEqual(J(net.log), []);
  assert.equal(net.clock, 0);
  assert.ok(NQ.createNet('office').exec('ip route').out.some((l) => l.startsWith('default')));
  net.exec('ip route add default via 192.168.1.1');
  net.reset();
  assert.ok(!net.exec('ip route').out.some((l) => l.startsWith('default')), 'reset re-applies setup');
  const c = net.clone();
  c.exec('ip route add default via 192.168.1.1');
  assert.ok(c.exec('ip route').out.some((l) => l.startsWith('default')));
  assert.ok(!net.exec('ip route').out.some((l) => l.startsWith('default')), 'clone is independent');
  c.reset();
  assert.ok(!c.exec('ip route').out.some((l) => l.startsWith('default')), 'clone keeps setup');
  const caller = [{ dev: 'laptop', cmd: 'ip route del default' }];
  const n2 = NQ.createNet('office', caller);
  caller.length = 0;
  n2.reset();
  assert.ok(!n2.exec('ip route').out.some((l) => l.startsWith('default')), 'setup is copied');
});

test('a failing setup line throws with the device and command', () => {
  assert.throws(() => NQ.createNet('office', [{ dev: 'laptop', cmd: 'ip route del 1.2.3.0/24' }]),
    (e) => e.message.includes('setup failed on laptop: ip route del 1.2.3.0/24') && e.message.includes('No such process'));
  assert.throws(() => NQ.createNet('office', [{ dev: 'laptop', cmd: 'bogus' }]), /setup failed on laptop: bogus: bash: bogus: command not found/);
});

test('a spread copy of a Net has no exec, clone or reset', () => {
  const net = NQ.createNet('pair');
  const copy = { ...net }, copy2 = Object.assign({}, net);
  for (const c of [copy, copy2]) for (const k of ['exec', 'clone', 'reset']) assert.equal(c[k], undefined, k);
  assert.equal(typeof net.exec, 'function');
});

test('exec entries are the log slice the line added', () => {
  const net = NQ.createNet('pair');
  NQ.sim.ping(net, 'laptop', '10.0.0.3');
  const n = net.log.length;
  const r = net.exec('ip addr');
  assert.deepEqual(J(r.entries), []);
  NQ.reg('t-log', 'test', (nt, dev) => { NQ.sim.ping(nt, dev.id, '10.0.0.3'); return { out: [], err: [], code: 0 }; });
  const r2 = net.exec('t-log');
  assert.equal(r2.entries.length, net.log.length - n);
  assert.ok(r2.entries.length > 0);
});
