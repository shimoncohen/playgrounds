// Network Quest: ping, traceroute, arping, ipcalc, and the shell's exception guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const J = (x) => JSON.parse(JSON.stringify(x));
const run = (net, line, dev) => J(net.exec(line, dev));
const USAGE = 'Usage: ping [-c count] destination';
const ok = (net, line, dev) => { const r = run(net, line, dev); assert.deepEqual([r.err, r.code], [[], 0], line + ' -> ' + r.err); return r.out; };
const errOf = (net, line, err, code, dev) => {
  const r = run(net, line, dev);
  assert.deepEqual([r.out, r.err, r.code], [[], err, code], line);
};

test('all four commands are listed by help', () => {
  const net = NQ.createNet('pair');
  const h = ok(net, 'help').join('\n');
  for (const c of ['ping', 'traceroute', 'arping', 'ipcalc']) assert.match(h, new RegExp('^' + c + ' +\\S', 'm'), c);
});

test('ping -c 2 on pair: two replies and statistics', () => {
  const net = NQ.createNet('pair');
  const r = run(net, 'ping -c 2 10.0.0.3');
  assert.deepEqual(r.out, [
    'PING 10.0.0.3 (10.0.0.3) 56(84) bytes of data.',
    '64 bytes from 10.0.0.3: icmp_seq=1 ttl=64 time=1.00 ms',
    '64 bytes from 10.0.0.3: icmp_seq=2 ttl=64 time=1.00 ms',
    '',
    '--- 10.0.0.3 ping statistics ---',
    '2 packets transmitted, 2 received, 0% packet loss',
  ]);
  assert.deepEqual([r.err, r.code], [[], 0]);
  assert.equal(ok(net, 'ping 10.0.0.3').filter((l) => l.startsWith('64 bytes')).length, 4);
  assert.equal(ok(net, 'ping -c3 10.0.0.3').filter((l) => l.startsWith('64 bytes')).length, 3);
});

test('ping an address nobody has: Destination Host Unreachable, exit 1', () => {
  const net = NQ.createNet('pair');
  const r = run(net, 'ping 10.0.0.99');
  assert.deepEqual(r.out.slice(1, 3), ['From 10.0.0.2 icmp_seq=1 Destination Host Unreachable', 'From 10.0.0.2 icmp_seq=2 Destination Host Unreachable']);
  assert.deepEqual(r.out.slice(-1), ['4 packets transmitted, 0 received, +4 errors, 100% packet loss']);
  assert.deepEqual([r.err, r.code], [[], 1]);
});

test('ping argument handling: usage, clamp, bad counts, bad options, hostnames', () => {
  const net = NQ.createNet('pair');
  errOf(net, 'ping', [USAGE], 2);
  assert.equal(ok(net, 'ping -c 99 10.0.0.3').find((l) => / packets transmitted/.test(l)), '10 packets transmitted, 10 received, 0% packet loss');
  for (const [a, v] of [['-c 0', '0'], ['-c0', '0'], ['-c abc', 'abc'], ['-c -1', '-1']]) errOf(net, 'ping ' + a + ' 10.0.0.3', ["ping: invalid argument: '" + v + "'"], 2);
  errOf(net, 'ping -x 10.0.0.3', ["ping: invalid option -- 'x'", USAGE], 2);
  errOf(net, 'ping -c', [USAGE], 2);
  errOf(net, 'ping example.com', ['ping: example.com: Name or service not known'], 2);
  errOf(net, 'ping 10.0.0.300', ['ping: 10.0.0.300: Name or service not known'], 2);
  errOf(net, 'ping 10.0.0.3 10.0.0.2', [USAGE], 2);
  const big = 'a'.repeat(900);
  errOf(net, 'ping ' + big, ['ping: ' + big + ': Name or service not known'], 2);
  assert.equal(run(net, 'ping -c 99999999999999999999 10.0.0.3').code, 0);
  assert.equal(ok(net, 'ping -c 1 10.0.0.3').length, 5);
});

test('ping through two routers: ttl is 62 on arrival', () => {
  const net = NQ.createNet('office');
  const o = ok(net, 'ping -c 1 172.16.0.10');
  assert.equal(o[1], '64 bytes from 172.16.0.10: icmp_seq=1 ttl=62 time=2.00 ms');
});

test('ping failure lines: net unreachable from a router, ttl exceeded, local errors, silence', () => {
  let net = NQ.createNet('office');
  ok(net, 'ip route del 172.16.0.0/24', 'r1');
  let r = run(net, 'ping -c 2 172.16.0.10');
  assert.deepEqual(r.out.slice(1, 3), ['From 192.168.1.1 icmp_seq=1 Destination Net Unreachable', 'From 192.168.1.1 icmp_seq=2 Destination Net Unreachable']);
  assert.equal(r.out[5], '2 packets transmitted, 0 received, +2 errors, 100% packet loss');
  assert.equal(r.code, 1);

  net = NQ.createNet('office');
  ok(net, 'ip route add default via 10.0.1.2 dev eth1', 'r1');
  ok(net, 'ip route del default', 'r2');
  ok(net, 'ip route add default via 10.0.1.1 dev eth0', 'r2');
  r = run(net, 'ping -c 1 8.8.8.8');
  assert.match(r.out[1], /^From 10\.0\.1\.[12] icmp_seq=1 Time to live exceeded$/);
  assert.equal(r.out[4], '1 packets transmitted, 0 received, +1 errors, 100% packet loss');

  net = NQ.createNet('office');
  ok(net, 'ip route del default', 'laptop');
  errOf(net, 'ping 8.8.8.8', ['ping: connect: Network is unreachable'], 2);
  net.devices.laptop.ifaces.eth0.ip = null;
  errOf(net, 'ping 192.168.1.20', ['ping: connect: Network is unreachable'], 2);

  net = NQ.createNet('office');
  ok(net, 'ip link set eth0 down', 'laptop');
  errOf(net, 'ping 192.168.1.20', ['ping: connect: Network is down'], 2);

  net = NQ.createNet('home');
  ok(net, 'ip route del default', 'web');
  r = run(net, 'ping -c 2 198.51.100.10');
  assert.deepEqual(r.out, ['PING 198.51.100.10 (198.51.100.10) 56(84) bytes of data.', '', '--- 198.51.100.10 ping statistics ---', '2 packets transmitted, 0 received, 100% packet loss']);
  assert.equal(r.code, 1);
});

test('ping can be piped to grep, and exec entries are the log slice', () => {
  const net = NQ.createNet('pair');
  const r = run(net, 'ping -c 2 10.0.0.3 | grep time');
  assert.equal(r.out.length, 2);
  assert.equal(r.code, 0);
  const before = net.log.length, x = net.exec('ping -c 2 10.0.0.3');
  assert.ok(x.entries.length > 0);
  assert.deepEqual(J(x.entries), J(net.log.slice(before)));
});

test('traceroute on office: header and three numbered hops', () => {
  const net = NQ.createNet('office');
  const r = run(net, 'traceroute 172.16.0.10');
  assert.deepEqual(r.out, [
    'traceroute to 172.16.0.10 (172.16.0.10), 30 hops max, 60 byte packets',
    ' 1  192.168.1.1  0.50 ms  0.50 ms  0.50 ms',
    ' 2  10.0.1.2  1.00 ms  1.00 ms  1.00 ms',
    ' 3  172.16.0.10  1.50 ms  1.50 ms  1.50 ms',
  ]);
  assert.deepEqual([r.err, r.code], [[], 0]);
});

test('traceroute shows !N, !H and * * *', () => {
  let net = NQ.createNet('office');
  ok(net, 'ip route del 172.16.0.0/24', 'r1');
  let o = ok(net, 'traceroute 172.16.0.10');
  assert.equal(o.length, 3);
  assert.equal(o[2], ' 2  192.168.1.1  1.00 ms  1.00 ms  1.00 ms !N');
  net = NQ.createNet('office');
  o = ok(net, 'traceroute 172.16.0.99');
  assert.equal(o[3], ' 3  10.0.1.2  1.50 ms  1.50 ms  1.50 ms !H');
  net = NQ.createNet('home');
  ok(net, 'ip route del default', 'web');
  o = ok(net, 'traceroute 198.51.100.10');
  assert.equal(o.length, 4);
  assert.equal(o[3], ' 3  * * *');
});

test('traceroute errors', () => {
  const net = NQ.createNet('office');
  errOf(net, 'traceroute', ['Usage: traceroute destination'], 2);
  errOf(net, 'traceroute -n 1.2.3.4', ['Usage: traceroute destination'], 2);
  errOf(net, 'traceroute 1.2.3.4 5.6.7.8', ['Usage: traceroute destination'], 2);
  errOf(net, 'traceroute example.com', ['traceroute: unknown host example.com'], 2);
  ok(net, 'ip route del default', 'laptop');
  errOf(net, 'traceroute 8.8.8.8', ['traceroute: connect: Network is unreachable'], 2);
  ok(net, 'ip link set eth0 down', 'laptop');
  errOf(net, 'traceroute 192.168.1.20', ['traceroute: connect: Network is unreachable'], 2);
});

test('arping: reply with upper-case MAC, silence, off-subnet, usage', () => {
  const net = NQ.createNet('pair');
  const r = run(net, 'arping -c 1 10.0.0.3');
  assert.deepEqual(r.out, ['ARPING 10.0.0.3 from 10.0.0.2 eth0', 'Unicast reply from 10.0.0.3 [02:00:00:00:00:02]  1.000ms', 'Sent 1 probes (1 broadcast(s))', 'Received 1 response(s)']);
  assert.deepEqual([r.err, r.code], [[], 0]);
  assert.equal(ok(net, 'arping 10.0.0.3').length, 4);
  assert.equal(ok(net, 'arping -c 3 10.0.0.3').filter((l) => l.startsWith('Unicast')).length, 3);
  const n = run(net, 'arping -c 2 10.0.0.99');
  assert.deepEqual(n.out, ['ARPING 10.0.0.99 from 10.0.0.2 eth0', 'Sent 2 probes (2 broadcast(s))', 'Received 0 response(s)']);
  assert.equal(n.code, 1);
  errOf(net, 'arping 8.8.8.8', ['arping: Network is unreachable'], 2);
  errOf(net, 'arping', ['Usage: arping [-c count] destination'], 2);
  errOf(net, 'arping -c 0 10.0.0.3', ["arping: invalid argument: '0'"], 2);
  errOf(net, 'arping host', ['arping: host: Name or service not known'], 2);
  assert.match(ok(net, 'arping -c 50 10.0.0.3').join('\n'), /Sent 10 probes/);
});

test('arping follows the normal ARP rules: it refreshes the cache through the reply, never a permanent entry', () => {
  const net = NQ.createNet('pair');
  ok(net, 'ip neigh add 10.0.0.3 lladdr 02:00:00:00:00:99 dev eth0');
  const r = run(net, 'arping -c 1 10.0.0.3');
  assert.match(r.out[1], /\[02:00:00:00:00:02\]/);
  assert.equal(net.devices.laptop.neigh['10.0.0.3'], '02:00:00:00:00:99');
  const net2 = NQ.createNet('pair');
  net2.devices.laptop.neigh['10.0.0.3'] = '02:00:00:00:00:77';
  ok(net2, 'arping -c 1 10.0.0.3');
  assert.equal(net2.devices.laptop.neigh['10.0.0.3'], '02:00:00:00:00:02');
  assert.equal(net2.devices.phone.neigh['10.0.0.2'], '02:00:00:00:00:01');
});

test('NQ.sim.arping', () => {
  const net = NQ.createNet('pair');
  const a = J(NQ.sim.arping(net, 'laptop', '10.0.0.3'));
  assert.deepEqual([a.mac, a.ifaceName], ['02:00:00:00:00:02', 'eth0']);
  assert.ok(a.entries.length > 0);
  assert.deepEqual(J(NQ.sim.arping(net, 'laptop', '8.8.8.8')), { mac: null, ifaceName: null, entries: [] });
  assert.deepEqual(J(NQ.sim.arping(net, 'sw1', '10.0.0.3')), { mac: null, ifaceName: null, entries: [] });
  net.devices.laptop.ifaces.eth0.up = false;
  assert.deepEqual(J(NQ.sim.arping(net, 'laptop', '10.0.0.3')), { mac: null, ifaceName: null, entries: [] });
  assert.throws(() => NQ.sim.arping(net, 'nope', '10.0.0.3'));
});

test('ipcalc', () => {
  const net = NQ.createNet('pair');
  assert.deepEqual(ok(net, 'ipcalc 192.168.1.5/26'), [
    'Address:   192.168.1.5', 'Netmask:   255.255.255.192 = 26', 'Network:   192.168.1.0/26', 'Broadcast: 192.168.1.63',
    'HostMin:   192.168.1.1', 'HostMax:   192.168.1.62', 'Hosts/Net: 62']);
  const o = ok(net, 'ipcalc 192.168.1.0/26');
  assert.ok(o.includes('HostMax:   192.168.1.62') && o.includes('Hosts/Net: 62'));
  assert.deepEqual(ok(net, 'ipcalc 10.0.0.1/31').slice(2), ['Network:   10.0.0.0/31', 'Broadcast: 10.0.0.1', 'HostMin:   10.0.0.0', 'HostMax:   10.0.0.1', 'Hosts/Net: 2']);
  assert.deepEqual(ok(net, 'ipcalc 10.0.0.1/32'), [
    'Address:   10.0.0.1', 'Netmask:   255.255.255.255 = 32', 'Network:   10.0.0.1/32', 'Broadcast: 10.0.0.1',
    'HostMin:   10.0.0.1', 'HostMax:   10.0.0.1', 'Hosts/Net: 1']);
  assert.deepEqual(ok(net, 'ipcalc 0.0.0.0/0'), [
    'Address:   0.0.0.0', 'Netmask:   0.0.0.0 = 0', 'Network:   0.0.0.0/0', 'Broadcast: 255.255.255.255',
    'HostMin:   0.0.0.1', 'HostMax:   255.255.255.254', 'Hosts/Net: 4294967294']);
  for (const a of ['10.0.0.300/24', '10.0.0.1/33', 'garbage', '10.0.0.1/', '/24', 'a/b', '10.0.0.1/24/1']) errOf(net, 'ipcalc ' + a, ['ipcalc: invalid address: ' + a], 1);
  errOf(net, 'ipcalc 192.168.1.5', ['ipcalc: missing prefix, try something like 192.168.1.0/24'], 1);
  errOf(net, 'ipcalc', ['Usage: ipcalc address/prefix'], 2);
  errOf(net, 'ipcalc 1.2.3.4/24 5.6.7.8/24', ['Usage: ipcalc address/prefix'], 2);
});

test('none of the new commands reaches the exception guard on odd input', () => {
  const net = NQ.createNet('office');
  const odd = ['', '-', '--', '-c', '-c -c', '-c 1', '0', '999.1.1.1', '1.2.3.4/', '::1', '%s', '__proto__', 'constructor', '-c 1 -c 2 1.2.3.4', '"" ', '-c 3 192.168.1.20 x'];
  for (const c of ['ping', 'traceroute', 'arping', 'ipcalc']) for (const a of odd) {
    const r = run(net, c + ' ' + a);
    assert.ok(!r.err.some((l) => /internal error/.test(l)), c + ' ' + a);
    assert.ok(Array.isArray(r.out) && typeof r.code === 'number');
  }
});

test('shell guard: a throwing or malformed command gives a friendly error and the net keeps working', () => {
  const net = NQ.createNet('pair');
  NQ.reg('boom', 'test only', () => { throw new Error('kaboom'); });
  NQ.reg('mangled', 'test only', () => 42);
  NQ.reg('noout', 'test only', () => ({ err: [], code: 0 }));
  for (const c of ['boom', 'mangled', 'noout']) {
    const r = run(net, c);
    assert.deepEqual([r.out, r.err, r.code], [[], ['bash: ' + c + ': internal error'], 1], c);
    assert.ok(Array.isArray(r.entries));
  }
  assert.deepEqual(run(net, 'boom | grep x').err, ['bash: boom: internal error']);
  assert.equal(run(net, 'ping -c 1 10.0.0.3').code, 0);
  delete NQ.CMDS.boom; delete NQ.CMDS.mangled; delete NQ.CMDS.noout;
});
