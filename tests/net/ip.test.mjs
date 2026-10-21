// Network Quest: IPv4 addressing helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const { ip } = loadNet();

test('parse: valid addresses', () => {
  assert.equal(ip.parse('10.0.0.2'), 167772162);
  assert.equal(ip.parse('0.0.0.0'), 0);
  assert.equal(ip.parse('255.255.255.255'), 4294967295);
});

test('parse: rejects bad input', () => {
  for (const s of ['10.0.0.300', '1.2.3', '1.2.3.4.5', '1..3.4', '', ' 1.2.3.4', '1.2.3.4 ', '1.2.3.4abc', '1.2.3.0x4', '01.2.3.4', '1.2.3.-4', '1.2.3.+4', 'a.b.c.d', '1.2.3.4.'])
    assert.equal(ip.parse(s), null, JSON.stringify(s));
  for (const v of [null, undefined, 5, {}]) assert.equal(ip.parse(v), null);
});

test('fmt round-trips', () => {
  assert.equal(ip.fmt(ip.parse('192.168.1.1')), '192.168.1.1');
  assert.equal(ip.fmt(0), '0.0.0.0');
  assert.equal(ip.fmt(4294967295), '255.255.255.255');
});

test('cidr: /24 network and broadcast', () => {
  const c = ip.cidr('10.0.0.2/24');
  assert.equal(c.ip, ip.parse('10.0.0.2'));
  assert.equal(c.prefix, 24);
  assert.equal(ip.fmt(c.mask), '255.255.255.0');
  assert.equal(ip.fmt(c.net), '10.0.0.0');
  assert.equal(ip.fmt(c.bcast), '10.0.0.255');
});

test('cidr: /0, /30, /32 boundaries', () => {
  const a = ip.cidr('10.1.2.3/0');
  assert.equal(a.mask, 0); assert.equal(a.net, 0); assert.equal(a.bcast, 4294967295);
  const b = ip.cidr('10.0.0.5/30');
  assert.equal(ip.fmt(b.net), '10.0.0.4'); assert.equal(ip.fmt(b.bcast), '10.0.0.7');
  const c = ip.cidr('10.0.0.9/32');
  assert.equal(c.mask, 4294967295); assert.equal(c.net, c.ip); assert.equal(c.bcast, c.ip);
});

test('cidr: rejects bad input', () => {
  for (const s of ['10.0.0.2/33', '10.0.0.2', '10.0.0.2/', '10.0.0.2/-1', '10.0.0.2/2.5', '10.0.0.2/x', '10.0.0.2/24/1', '10.0.0.300/24', '/24', '10.0.0.2/ 24', '10.0.0.2/024'])
    assert.equal(ip.cidr(s), null, s);
  assert.equal(ip.cidr(null), null);
});

test('inSubnet', () => {
  const c = ip.cidr('192.168.1.7/24');
  assert.equal(ip.inSubnet(ip.parse('192.168.1.200'), c), true);
  assert.equal(ip.inSubnet(ip.parse('192.168.1.0'), c), true);
  assert.equal(ip.inSubnet(ip.parse('192.168.2.1'), c), false);
  assert.equal(ip.inSubnet(ip.parse('1.2.3.4'), ip.cidr('0.0.0.0/0')), true);
  assert.equal(ip.inSubnet(ip.parse('1.2.3.5'), ip.cidr('1.2.3.4/32')), false);
});

test('isPrivate', () => {
  for (const s of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1']) assert.equal(ip.isPrivate(ip.parse(s)), true, s);
  for (const s of ['172.32.0.1', '172.15.255.255', '8.8.8.8', '203.0.113.5', '192.169.0.1']) assert.equal(ip.isPrivate(ip.parse(s)), false, s);
});

test('isPublic: complement of private/loopback/link-local/0/multicast/reserved', () => {
  for (const s of ['8.8.8.8', '203.0.113.5', '172.15.255.255', '172.32.0.0', '223.255.255.255', '1.0.0.0']) assert.equal(ip.isPublic(ip.parse(s)), true, s);
  for (const s of ['10.0.0.1', '172.16.0.0', '172.31.255.255', '192.168.1.1', '127.0.0.1', '169.254.1.1', '0.0.0.0', '0.255.255.255', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255'])
    assert.equal(ip.isPublic(ip.parse(s)), false, s);
});

test('mac', () => {
  assert.equal(ip.mac(0), '02:00:00:00:00:00');
  assert.equal(ip.mac(10), '02:00:00:00:00:0a');
  assert.equal(ip.mac(255), '02:00:00:00:00:ff');
  for (const n of [-1, 256, 1.5, NaN]) assert.throws(() => ip.mac(n), { name: 'RangeError' });
});
