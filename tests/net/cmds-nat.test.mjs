// Network Quest: the nat command (show, table, on, off) on the home router.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const J = (x) => JSON.parse(JSON.stringify(x));
const WEB = '198.51.100.10';
const run = (net, line, dev = 'home') => { const r = net.exec(line, dev); return { out: J(r.out), err: J(r.err), code: r.code }; };
const reaches = (net, from = 'laptop') => NQ.sim.ping(net.clone(), from, WEB).delivered;

test('nat status says what home translates, and nat is the same as nat status', () => {
  const net = NQ.createNet('home');
  const want = ['NAT is on: inside eth0 (192.168.1.1/24), outside eth1 (203.0.113.5/30)'];
  assert.deepEqual(run(net, 'nat'), { out: want, err: [], code: 0 });
  assert.deepEqual(run(net, 'nat status').out, want);
});

test('nat table: empty at first, then one line per translation, read from the real table', () => {
  const net = NQ.createNet('home');
  assert.deepEqual(run(net, 'nat table').out, ['The NAT table is empty: nothing has been translated yet']);
  net.exec('ping -c 1 ' + WEB, 'phone');
  net.exec('ping -c 1 ' + WEB, 'laptop');
  const o = run(net, 'nat table').out;
  assert.equal(o.length, 3);
  assert.match(o[0], /^proto\s+inside \(private\)\s+outside \(public\)\s+remote$/);
  assert.match(o[1], /^icmp\s+192\.168\.1\.11 id 1\s+203\.0\.113\.5 id 1024\s+198\.51\.100\.10$/);
  assert.match(o[2], /^icmp\s+192\.168\.1\.10 id 1\s+203\.0\.113\.5 id 1025\s+198\.51\.100\.10$/);
});

test('nat off stops translating: laptop gets no reply, the table is forgotten, status says off', () => {
  const net = NQ.createNet('home');
  net.exec('ping -c 1 ' + WEB, 'laptop');
  assert.match(run(net, 'nat off').out[0], /^NAT is now off/);
  assert.equal(net.devices.home.nat, null);
  assert.equal(reaches(net), false);
  assert.deepEqual(NQ.sim.ping(net.clone(), 'laptop', WEB).reason, 'no reply');
  assert.match(run(net, 'nat').out[0], /^NAT is off/);
  assert.deepEqual(run(net, 'nat table').out, ['NAT is off: there is no NAT table']);
});

test('nat on after nat off restores the same settings with an empty table', () => {
  const net = NQ.createNet('home');
  net.exec('ping -c 1 ' + WEB, 'laptop');
  run(net, 'nat off');
  assert.match(run(net, 'nat on').out[0], /^NAT is now on: inside eth0 .*outside eth1/);
  assert.deepEqual(J(net.devices.home.nat), { inside: 'eth0', outside: 'eth1', table: [] });
  assert.equal(net.devices.home.natOff, undefined);
  assert.equal(reaches(net), true);
  assert.equal(reaches(net, 'phone'), true);
});

test('on and off twice are friendly no-ops', () => {
  const net = NQ.createNet('home');
  assert.deepEqual(run(net, 'nat on').code, 0);
  assert.match(run(net, 'nat on').out[0], /^NAT is already on/);
  run(net, 'nat off');
  assert.deepEqual([run(net, 'nat off').code, run(net, 'nat off').out[0]], [0, 'NAT is already off']);
  assert.equal(net.devices.home.nat, null);
});

test('nat on without a default route still turns NAT on, but the ping still fails', () => {
  const net = NQ.createNet('home');
  run(net, 'nat off');
  run(net, 'ip route del default');
  assert.equal(run(net, 'nat on').code, 0);
  assert.equal(reaches(net), false);
  assert.equal(NQ.sim.ping(net.clone(), 'laptop', WEB).reason, 'no route');
});

test('a router that never had NAT works its inside and outside out from the default route', () => {
  const net = NQ.createNet('office');
  assert.deepEqual(run(net, 'nat', 'r2').out, ['NAT is off: r2 forwards packets with their addresses unchanged']);
  assert.equal(run(net, 'nat on', 'r2').code, 0);
  assert.deepEqual(J(net.devices.r2.nat), { inside: 'eth1', outside: 'eth0', table: [] });
  assert.equal(run(net, 'nat on', 'r1').code, 1, 'r1 has no default route');
  assert.match(run(net, 'nat on', 'r1').err[0], /has no default route/);
  assert.equal(net.devices.r1.nat, null);
  net.devices.r2.nat = null;
  net.devices.r2.routes = [{ dst: 'default', via: '10.0.1.1', dev: 'eth0' }];
  net.devices.r2.ifaces.eth1.ip = null;
  assert.match(run(net, 'nat on', 'r2').err[0], /exactly one inside interface/);
});

test('a host cannot translate addresses', () => {
  const net = NQ.createNet('home');
  for (const l of ['nat', 'nat on', 'nat off', 'nat table']) assert.deepEqual(run(net, l, 'laptop'), { out: [], err: ['nat: only a router can translate addresses; laptop is a host'], code: 1 }, l);
});

test('bad input gives a usage line and changes nothing', () => {
  const net = NQ.createNet('home');
  const before = J(net.devices.home);
  for (const l of ['nat maybe', 'nat on off', 'nat -h', 'nat ON', 'nat table now', 'nat "" ', 'nat 1 2 3']) {
    const r = run(net, l);
    assert.equal(r.code, 1, l);
    assert.deepEqual(r.out, []);
    assert.match(r.err[0], /^nat: unknown option ".*"\. Usage: nat \[status \| table \| on \| off\]$/, l);
  }
  assert.deepEqual(run(net, 'nat help').out, ['Usage: nat [status | table | on | off]']);
  assert.deepEqual(J(net.devices.home), before);
});

test('odd states never throw: broken saved settings, a missing table, interfaces without addresses', () => {
  const net = NQ.createNet('home');
  net.devices.home.nat = { inside: 'eth0', outside: 'eth1' };
  assert.equal(run(net, 'nat table').out[0], 'The NAT table is empty: nothing has been translated yet');
  net.devices.home.ifaces.eth0.ip = null;
  assert.match(run(net, 'nat').out[0], /no address/);
  net.devices.home.nat = null;
  net.devices.home.natOff = { inside: 'eth9', outside: 'eth1' };
  const r = run(net, 'nat on');
  assert.notEqual(r.err[0], 'bash: nat: internal error');
  for (const l of ['nat', 'nat table', 'nat on', 'nat off', 'nat on']) assert.doesNotMatch(run(net, l).err.join(' '), /internal error/, l);
});

test('reset and clone: nat off survives a clone, and reset brings NAT back; setup can switch it off', () => {
  const net = NQ.createNet('home', [{ dev: 'home', cmd: 'nat off' }]);
  assert.equal(net.devices.home.nat, null);
  assert.equal(net.clone().devices.home.nat, null);
  run(net, 'nat on');
  assert.ok(net.devices.home.nat);
  net.reset();
  assert.equal(net.devices.home.nat, null, 'the setup runs again after a reset');
  assert.equal(run(net, 'nat on').code, 0, 'and nat on works again');
  const plain = NQ.createNet('home');
  plain.exec('nat off', 'home');
  plain.reset();
  assert.ok(plain.devices.home.nat);
});

test('nat is listed by help', () => {
  assert.match(NQ.createNet('home').exec('help').out.join('\n'), /^nat\s+show or switch/m);
});

test('nat on after nat off needs addresses on both interfaces, with a friendly error', () => {
  const net = NQ.createNet('home');
  run(net, 'nat off');
  net.devices.home.ifaces.eth1.ip = null;
  const r = run(net, 'nat on');
  assert.deepEqual([r.code, r.err[0]], [1, 'nat: cannot turn NAT on: eth1 has no address']);
  assert.equal(net.devices.home.nat, null);
  net.devices.home.ifaces.eth1.ip = '203.0.113.5/30';
  assert.equal(run(net, 'nat on').code, 0, 'with the address back, nat on restores NAT');
  assert.ok(net.devices.home.nat);
});
