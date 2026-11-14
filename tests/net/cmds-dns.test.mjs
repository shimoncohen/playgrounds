// Network Quest: dig, sleep, resolvectl and rndc, and which devices have them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const J = (x) => JSON.parse(JSON.stringify(x));
const run = (net, line, dev) => J(net.exec(line, dev));
const out = (net, line, dev) => { const r = run(net, line, dev); assert.deepEqual([r.err, r.code], [[], 0], line + ' -> ' + r.err); return r.out; };
const fresh = () => NQ.createNet('dns');
const T = '\t';

test('dig prints header, question, answer, query time, server and size, and no WHEN', () => {
  const o = out(fresh(), 'dig www.example.test');
  assert.match(o[3], /^;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: \d+$/);
  assert.match(o[o.length - 1], /^;; MSG SIZE {2}rcvd: 66$/);
  const norm = o.map((l) => l.replace(/id: \d+/, 'id: N'));
  assert.deepEqual(norm.slice(0, -1), [
    '; <<>> DiG <<>> www.example.test',
    ';; global options: +cmd',
    ';; Got answer:',
    ';; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: N',
    ';; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 0',
    '',
    ';; QUESTION SECTION:',
    ';www.example.test.' + T + T + 'IN' + T + 'A',
    '',
    ';; ANSWER SECTION:',
    'www.example.test.' + T + '300' + T + 'IN' + T + 'A' + T + '198.18.0.80',
    '',
    ';; Query time: 36 msec',
    ';; SERVER: 192.168.1.53#53(192.168.1.53) (UDP)'
  ]);
  assert.equal(o.some((l) => /WHEN/.test(l)), false);
});

test('dig is deterministic and a second dig is a cache hit with query time 0', () => {
  const net = fresh();
  const a = out(net, 'dig www.example.test'), b = out(net, 'dig www.example.test');
  assert.deepEqual(b.filter((l) => !/Query time/.test(l)), a.filter((l) => !/Query time/.test(l)));
  assert.equal(b.find((l) => /Query time/.test(l)), ';; Query time: 0 msec');
  assert.deepEqual(out(fresh(), 'dig www.example.test'), a);
});

test('dig +short prints only the data, and nothing for NXDOMAIN', () => {
  const net = fresh();
  assert.deepEqual(out(net, 'dig +short www.example.test'), ['198.18.0.80']);
  assert.deepEqual(out(net, 'dig www.example.test AAAA +short'), ['2001:db8::80']);
  assert.deepEqual(out(net, 'dig +short example.test MX'), ['10 mail.example.test.']);
  assert.deepEqual(out(net, 'dig +short shop.example.test'), ['www.example.test.', '198.18.0.80']);
  assert.deepEqual(out(net, 'dig +short wwww.example.test'), []);
});

test('dig prints each record type it knows, and the question names the type', () => {
  const net = fresh();
  const line = (cmd, re) => assert.ok(out(net, cmd).some((l) => re.test(l)), cmd);
  line('dig example.test NS', /^example\.test\.\t300\tIN\tNS\tns1\.example\.test\.$/);
  line('dig example.test MX', /^example\.test\.\t300\tIN\tMX\t10 mail\.example\.test\.$/);
  line('dig www.example.test aaaa', /^www\.example\.test\.\t300\tIN\tAAAA\t2001:db8::80$/);
  line('dig shop.example.test CNAME', /^shop\.example\.test\.\t300\tIN\tCNAME\twww\.example\.test\.$/);
  line('dig example.test TXT', /^;example\.test\.\t\tIN\tTXT$/);
  line('dig WWW.Example.Test', /^www\.example\.test\.\t300\tIN\tA\t198\.18\.0\.80$/);
});

test('dig MX shows the additional section; NXDOMAIN and NODATA show the SOA, both exit 0', () => {
  const net = fresh();
  const mx = out(net, 'dig example.test MX');
  assert.ok(mx.includes(';; ADDITIONAL SECTION:'));
  assert.ok(mx.includes('mail.example.test.' + T + '300' + T + 'IN' + T + 'A' + T + '198.18.0.25'));
  const nx = run(net, 'dig wwww.example.test');
  assert.equal(nx.code, 0);
  assert.ok(nx.out.some((l) => /status: NXDOMAIN/.test(l)));
  assert.ok(nx.out.includes(';; AUTHORITY SECTION:'));
  assert.ok(nx.out.some((l) => /^example\.test\.\t60\tIN\tSOA\tns1\.example\.test\. hostmaster\.example\.test\. 1 3600 600 86400 60$/.test(l)));
  assert.equal(nx.out.includes(';; ANSWER SECTION:'), false);
  const nd = run(net, 'dig www.example.test MX');
  assert.deepEqual([nd.code, nd.out.some((l) => /status: NOERROR/.test(l)), nd.out.includes(';; ANSWER SECTION:')], [0, true, false]);
  assert.ok(nd.out.some((l) => /ANSWER: 0, AUTHORITY: 1/.test(l)));
});

test('dig @server to a server that is not a resolver warns about recursion: flags qr rd, or qr aa rd', () => {
  const net = fresh();
  const warn = ';; WARNING: recursion requested but not available';
  const root = out(net, 'dig @192.0.2.10 www.example.test');
  assert.ok(root.includes(';; flags: qr rd; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1'));
  assert.equal(root[root.indexOf(warn) - 1].startsWith(';; flags'), true);
  assert.ok(root.includes('test.' + T + '300' + T + 'IN' + T + 'NS' + T + 'a.nic.test.'));
  assert.ok(root.includes(';; SERVER: 192.0.2.10#53(192.0.2.10) (UDP)'));
  assert.ok(root.includes(';; Query time: 0 msec'));
  const auth = out(net, 'dig @203.0.113.10 www.example.test');
  assert.ok(auth.includes(';; flags: qr aa rd; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 0'));
  assert.ok(auth.includes(warn));
  assert.equal(out(net, 'dig www.example.test').includes(warn), false);
  assert.equal(out(net, 'dig @192.168.1.53 www.example.test').includes(warn), false);
  assert.equal(out(net, 'dig +norecurse @203.0.113.10 www.example.test').includes(warn), false);
});

test('dig +norecurse: a miss is a referral with qr ra and query time 0; after a normal dig it answers from the cache', () => {
  const net = fresh();
  const miss = out(net, 'dig +norecurse www.example.test');
  assert.ok(miss.includes(';; flags: qr ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1'));
  assert.ok(miss.includes('.' + T + '300' + T + 'IN' + T + 'NS' + T + 'a.root-servers.test.'));
  assert.ok(miss.includes(';; Query time: 0 msec'));
  assert.equal(net.log.some((e) => e.dev === 'root'), false);
  out(net, 'dig www.example.test');
  const hit = out(net, 'dig +norecurse www.example.test');
  assert.ok(hit.includes('www.example.test.' + T + '300' + T + 'IN' + T + 'A' + T + '198.18.0.80'));
  assert.ok(hit.includes(';; flags: qr ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 0'));
});

test('dig +trace asks root, tld and auth in turn with recursion off and prints no warning', () => {
  const net = fresh();
  const r = run(net, 'dig +trace www.example.test');
  assert.equal(r.code, 0);
  assert.deepEqual(r.out, [
    '; <<>> DiG <<>> +trace www.example.test',
    ';; global options: +cmd',
    'test.' + T + '300' + T + 'IN' + T + 'NS' + T + 'a.nic.test.',
    ';; Received 88 bytes from 192.0.2.10#53(a.root-servers.test) in 0 ms',
    '',
    'example.test.' + T + '300' + T + 'IN' + T + 'NS' + T + 'ns1.example.test.',
    ';; Received 108 bytes from 198.51.100.10#53(a.nic.test) in 0 ms',
    '',
    'www.example.test.' + T + '300' + T + 'IN' + T + 'A' + T + '198.18.0.80',
    ';; Received 66 bytes from 203.0.113.10#53(ns1.example.test) in 0 ms',
    ''
  ]);
  const asked = J(r.entries).filter((e) => e.dir === 'rx' && /^delivered: DNS query/.test(e.verdict)).map((e) => e.dev);
  assert.deepEqual(asked, ['root', 'tld', 'auth']);
  assert.ok(r.entries.every((e) => e.packet.layers.every((l) => l.name !== 'DNS' || l.fields.rd === 0)));
  assert.equal(net.devices.resolver.dns.cache.length, 0);
});

test('dig +trace stops at NXDOMAIN with the SOA, and reports a server that does not answer', () => {
  const net = fresh();
  const nx = run(net, 'dig +trace wwww.example.test');
  assert.equal(nx.code, 0);
  assert.ok(nx.out.some((l) => /^example\.test\.\t300\tIN\tSOA\t/.test(l)));
  net.devices.auth.ifaces.eth0.up = false;
  const t = run(net, 'dig +trace www.example.test');
  assert.deepEqual([t.code, t.out.slice(-2)], [9, [';; communications error to 203.0.113.10#53: timed out', ';; no servers could be reached']]);
});

test('sleep advances dns.now on every device with a dns field and leaves net.clock alone', () => {
  const net = fresh();
  const before = net.clock;
  assert.deepEqual(out(net, 'sleep 120'), []);
  assert.deepEqual(Object.values(net.devices).filter((d) => d.dns).map((d) => d.dns.now), [120, 120, 120, 120, 120]);
  assert.equal(net.clock, before);
  out(net, 'dig www.example.test');
  out(net, 'sleep 120');
  assert.ok(out(net, 'dig www.example.test').includes('www.example.test.' + T + '180' + T + 'IN' + T + 'A' + T + '198.18.0.80'));
  for (const bad of ['sleep', 'sleep x', 'sleep -1', 'sleep 1 2', 'sleep 1.5', 'sleep 9999999999']) assert.equal(run(net, bad).code, 1, bad);
  assert.deepEqual(run(net, 'sleep').err, ['sleep: missing operand']);
  assert.deepEqual(run(net, 'sleep x').err, ["sleep: invalid time interval 'x'"]);
});

test('resolvectl dns sets the stub resolver and checks its arguments', () => {
  const net = fresh();
  net.devices.laptop.dns.resolver = '192.168.1.99';
  assert.equal(run(net, 'dig www.example.test').out.some((l) => /^;; communications error to 192\.168\.1\.99#53: timed out$/.test(l)), true);
  assert.deepEqual(out(net, 'resolvectl dns eth0 192.168.1.53'), []);
  assert.equal(net.devices.laptop.dns.resolver, '192.168.1.53');
  assert.ok(out(net, 'dig +short www.example.test').includes('198.18.0.80'));
  assert.deepEqual(run(net, 'resolvectl dns eth9 192.168.1.53').err, ['Failed to resolve interface "eth9": No such device']);
  assert.deepEqual(run(net, 'resolvectl dns eth0 nope').err, ['Failed to parse DNS server address: nope']);
  for (const bad of ['resolvectl', 'resolvectl dns', 'resolvectl dns eth0', 'resolvectl status', 'resolvectl dns eth0 192.168.1.53 x']) {
    assert.deepEqual([run(net, bad).code, run(net, bad).err], [2, ['Usage: resolvectl dns <interface> <ip-address>']], bad);
  }
  assert.equal(net.devices.laptop.dns.resolver, '192.168.1.53');
});

test('rndc flush clears the resolver cache', () => {
  const net = NQ.createNet('dns-stale');
  assert.ok(out(net, 'dig +short www.example.test').includes('198.18.0.99'));
  assert.deepEqual(out(net, 'rndc flush', 'resolver'), []);
  assert.deepEqual(J(net.devices.resolver.dns.cache), []);
  assert.deepEqual(out(net, 'dig +short www.example.test'), ['198.18.0.80']);
  assert.deepEqual(run(net, 'rndc', 'resolver').err, ['Usage: rndc flush']);
  assert.deepEqual([run(net, 'rndc reload', 'resolver').code, run(net, 'rndc reload', 'resolver').err], [1, ["rndc: 'reload' failed: unknown command"]]);
});

test('dig argument errors and a server that does not answer', () => {
  const net = fresh();
  assert.deepEqual([run(net, 'dig').code, run(net, 'dig').err], [2, ['Usage: dig [@server] name [type] [+short] [+norecurse] [+trace]']]);
  assert.equal(run(net, 'dig www.example.test PTR').code, 1);
  assert.deepEqual(run(net, 'dig +bogus www.example.test').err, ['Invalid option: +bogus']);
  assert.equal(run(net, 'dig a..b').code, 1);
  assert.equal(run(net, 'dig ' + 'a'.repeat(64) + '.test').code, 1);
  const bad = run(net, 'dig @nope www.example.test');
  assert.deepEqual([bad.code, bad.out], [9, [";; couldn't get address for 'nope': not found"]]);
  const t = run(net, 'dig @192.168.1.99 www.example.test');
  assert.deepEqual([t.code, t.out.slice(-2)], [9, [';; communications error to 192.168.1.99#53: timed out', ';; no servers could be reached']]);
  assert.ok(t.out[0].startsWith('; <<>> DiG'));
  assert.equal(run(net, 'dig +short @192.168.1.99 www.example.test').code, 9);
});

test('dig ignores ICMP errors for its datagram: it stays a timeout', () => {
  const net = fresh();
  net.devices.r1.ifaces.eth3.up = false;
  const r = run(net, 'dig @203.0.113.10 www.example.test');
  assert.deepEqual([r.code, r.out.at(-1)], [9, ';; no servers could be reached']);
  const icmp = r.entries.find((e) => e.dev === 'laptop' && /^delivered: ICMP dest-unreachable/.test(e.verdict));
  assert.ok(icmp, 'the error reached laptop');
  assert.equal(icmp.packet.layers.find((l) => l.name === 'ICMP').fields.id, 0);
});

test('dig @own address times out: there is no loopback delivery', () => {
  const net = fresh();
  const r = run(net, 'dig @192.168.1.10 www.example.test');
  assert.deepEqual([r.code, r.out.at(-2)], [9, ';; communications error to 192.168.1.10#53: timed out']);
  assert.equal(run(net, 'dig @127.0.0.1 www.example.test').code, 9);
});

test('dig, sleep and resolvectl need a dns field, rndc a recursive resolver: elsewhere they are not found', () => {
  const office = NQ.createNet('office');
  for (const c of ['dig www.example.test', 'sleep 1', 'resolvectl dns eth0 1.1.1.1', 'rndc flush']) {
    const r = run(office, c);
    assert.deepEqual([r.code, r.err[0]], [127, 'bash: ' + c.split(' ')[0] + ': command not found'], c);
  }
  const net = fresh();
  const has = (dev) => ['dig', 'sleep', 'resolvectl', 'rndc'].filter((c) => run(net, c, dev).code !== 127);
  assert.deepEqual([has('laptop'), has('resolver'), has('auth'), has('root')], [['dig', 'sleep', 'resolvectl'], ['dig', 'sleep', 'rndc'], ['dig', 'sleep'], ['dig', 'sleep']]);
  assert.equal(run(net, 'dig', 'r1').code, 127);
});

test('dig on a resolver or name server asks 127.0.0.1 and gets no answer', () => {
  const r = run(fresh(), 'dig www.example.test', 'auth');
  assert.deepEqual([r.code, r.out.at(-2)], [9, ';; communications error to 127.0.0.1#53: timed out']);
});

test('dig +trace on a device with no root list reaches no server and exits 9', () => {
  const r = run(fresh(), 'dig +trace www.example.test', 'auth');
  assert.deepEqual([r.code, r.out.slice(-2)], [9, [';; communications error to 127.0.0.1#53: timed out', ';; no servers could be reached']]);
});

test('dig takes the type before the name, as the real one does', () => {
  const net = fresh();
  assert.deepEqual(out(net, 'dig +short MX example.test'), ['10 mail.example.test.']);
  assert.deepEqual(out(net, 'dig mx example.test +short'), ['10 mail.example.test.']);
  assert.deepEqual(out(net, 'dig +short A'), []);
});
