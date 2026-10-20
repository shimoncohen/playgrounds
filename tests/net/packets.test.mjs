// Network Quest: packet layers and hex encoding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const { pkt } = loadNet();
const A = '02:00:00:00:00:0a', B = '02:00:00:00:00:0b';

// RFC 1071 reference, written independently of the implementation: ones'-complement sum of 16-bit words.
function rfc1071(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) sum += (bytes[i] << 8) | (bytes[i + 1] ?? 0);
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return ~sum & 0xffff;
}
// the engine runs in a vm realm, so compare structure through JSON (strict deepEqual checks prototypes)
const plain = x => JSON.parse(JSON.stringify(x));
const bytes = p => pkt.hex(p).split(' ').map(h => parseInt(h, 16));
const echo = (ttl = 64) => pkt.stack(pkt.eth(A, B, 'IPv4'), pkt.ipv4('10.0.0.1', '10.0.0.2', ttl, 'ICMP'), pkt.icmp('echo-request', 1, 1));

test('reference checksum matches a literal known-good vector', () => {
  // the classic RFC 1071 / textbook header (UDP, 192.168.0.1 -> 192.168.0.199); checksum b861
  const h = [0x45, 0, 0, 0x73, 0, 0, 0x40, 0, 0x40, 0x11, 0, 0, 0xc0, 0xa8, 0, 0x01, 0xc0, 0xa8, 0, 0xc7];
  assert.equal(rfc1071(h), 0xb861);
});

test('stack and layerNames', () => {
  assert.deepEqual(plain(pkt.layerNames(echo())), ['Ethernet', 'IPv4', 'ICMP']);
  const l = pkt.eth(A, B, 'IPv4'), p = pkt.stack(l);
  l.fields.src = 'changed';
  assert.equal(p.layers[0].fields.src, A);
});

test('builders produce plain layers', () => {
  assert.deepEqual(plain(pkt.eth(A, B, 'ARP')), { name: 'Ethernet', fields: { src: A, dst: B, type: 'ARP' } });
  assert.deepEqual(plain(pkt.arp('request', A, '10.0.0.1', '00:00:00:00:00:00', '10.0.0.2')),
    { name: 'ARP', fields: { op: 'request', sha: A, spa: '10.0.0.1', tha: '00:00:00:00:00:00', tpa: '10.0.0.2' } });
  assert.deepEqual(plain(pkt.ipv4('10.0.0.1', '10.0.0.2', 64, 'ICMP')), { name: 'IPv4', fields: { src: '10.0.0.1', dst: '10.0.0.2', ttl: 64, proto: 'ICMP' } });
  assert.deepEqual(plain(pkt.icmp('echo-reply', 3, 4)), { name: 'ICMP', fields: { type: 'echo-reply', id: 3, seq: 4 } });
});

test('hex: ARP request is broadcast, sender MAC, 08 06, then the ARP body', () => {
  const p = pkt.stack(pkt.eth(A, 'ff:ff:ff:ff:ff:ff', 'ARP'), pkt.arp('request', A, '10.0.0.1', '00:00:00:00:00:00', '10.0.0.2'));
  assert.equal(pkt.hex(p),
    'ff ff ff ff ff ff 02 00 00 00 00 0a 08 06 ' +
    '00 01 08 00 06 04 00 01 02 00 00 00 00 0a 0a 00 00 01 00 00 00 00 00 00 0a 00 00 02');
});

test('hex: ARP reply uses oper 00 02', () => {
  const p = pkt.stack(pkt.eth(B, A, 'ARP'), pkt.arp('reply', B, '10.0.0.2', A, '10.0.0.1'));
  const b = bytes(p);
  assert.equal(b.length, 42);
  assert.deepEqual(b.slice(20, 22), [0, 2]);
});

test('hex: IPv4 version/IHL, length, TTL, protocol', () => {
  const b = bytes(echo(37));
  assert.deepEqual(b.slice(0, 6), [2, 0, 0, 0, 0, 0x0b]);
  assert.deepEqual(b.slice(12, 14), [8, 0]);
  assert.equal(b[14], 0x45);
  assert.equal(b[15], 0);
  assert.deepEqual(b.slice(16, 18), [0, 28]); // 20 header + 8 ICMP
  assert.equal(b[22], 37);
  assert.equal(b[23], 1);
  assert.deepEqual(b.slice(26, 34), [10, 0, 0, 1, 10, 0, 0, 2]);
  assert.equal(b.length, 14 + 28);
});

test('hex: IPv4 header checksum matches a hand-computed value', () => {
  // words 4500 001c 0000 0000 4001 ---- 0a00 0001 0a00 0002 sum to 0x9920, so the checksum is ~0x9920 = 0x66df
  assert.equal(pkt.hex(echo(64)).split(' ').slice(24, 26).join(' '), '66 df');
});

test('hex: IPv4 checksum equals the reference, and the full header sums to 0xffff', () => {
  for (const ttl of [1, 2, 64, 255]) {
    const h = bytes(echo(ttl)).slice(14, 34);
    const zeroed = h.slice(); zeroed[10] = zeroed[11] = 0;
    assert.equal((h[10] << 8) | h[11], rfc1071(zeroed), 'ttl ' + ttl);
    assert.equal(rfc1071(h), 0, 'ttl ' + ttl); // complement of 0xffff
  }
});

test('hex: ICMP echo checksum, type and fields', () => {
  const b = bytes(echo()).slice(34);
  assert.deepEqual(b, [8, 0, 0xf7, 0xfd, 0, 1, 0, 1]); // sum 0x0802, ~ = 0xf7fd (by hand)
  const r = bytes(pkt.stack(pkt.eth(B, A, 'IPv4'), pkt.ipv4('10.0.0.2', '10.0.0.1', 64, 'ICMP'), pkt.icmp('echo-reply', 0x1234, 0x0506))).slice(34);
  assert.deepEqual(r.slice(0, 2), [0, 0]);
  assert.deepEqual(r.slice(4), [0x12, 0x34, 5, 6]);
  assert.equal((r[2] << 8) | r[3], rfc1071([...r.slice(0, 2), 0, 0, ...r.slice(4)]));
});

test('hex: time-exceeded and dest-unreachable use a 4-byte unused field', () => {
  for (const [type, n] of [['time-exceeded', 0x0b], ['dest-unreachable', 3]]) {
    const b = bytes(pkt.stack(pkt.eth(B, A, 'IPv4'), pkt.ipv4('10.0.0.2', '10.0.0.1', 64, 'ICMP'), pkt.icmp(type, 9, 9)));
    const m = b.slice(34);
    assert.equal(b.length, 14 + 20 + 8);
    assert.deepEqual([m[0], m[1], m[4], m[5], m[6], m[7]], [n, 0, 0, 0, 0, 0]);
    assert.equal((m[2] << 8) | m[3], rfc1071([m[0], 0, 0, 0, 0, 0, 0, 0]));
  }
});

test('hex: lowercase two-digit space-separated, derived from fields', () => {
  const p = echo();
  assert.match(pkt.hex(p), /^([0-9a-f]{2} )+[0-9a-f]{2}$/);
  const before = pkt.hex(p);
  p.layers[1].fields.ttl = 63;
  assert.notEqual(pkt.hex(p), before);
  assert.equal(bytes(p)[22], 63);
});

test('clone is deep', () => {
  const p = echo(), c = pkt.clone(p);
  c.layers[1].fields.ttl = 1;
  assert.equal(p.layers[1].fields.ttl, 64);
  assert.equal(c.layers[1].fields.ttl, 1);
  assert.equal(pkt.hex(pkt.clone(p)), pkt.hex(p));
});

test('invalid input throws a clear error', () => {
  assert.throws(() => pkt.hex({ layers: [{ name: 'TCP', fields: {} }] }), { message: /unknown layer.*TCP/i });
  assert.throws(() => pkt.hex(pkt.stack(pkt.eth(A, B, 'IPv4'), pkt.ipv4('10.0.0.1', '10.0.0.2', 64, 'ICMP'), pkt.icmp('bogus', 1, 1))), { message: /unknown ICMP type.*bogus/i });
  assert.throws(() => pkt.hex(pkt.stack(pkt.eth(A, B, 'IPX'))), { message: /ethernet type.*IPX/i });
  assert.throws(() => pkt.hex(pkt.stack(pkt.eth(A, B, 'ARP'), pkt.arp('poke', A, '10.0.0.1', B, '10.0.0.2'))), { message: /ARP op.*poke/i });
  assert.throws(() => pkt.hex(pkt.stack(pkt.eth(A, B, 'IPv4'), pkt.ipv4('10.0.0.1', 'nope', 64, 'ICMP'))), { message: /address.*nope/i });
  assert.throws(() => pkt.hex(pkt.stack(pkt.eth(A, 'zz:00', 'IPv4'))), { message: /MAC.*zz:00/i });
});
