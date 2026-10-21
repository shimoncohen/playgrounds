// Network Quest, "teach before use" (AGENTS.md rule 12) from chapter 2 on: a key term must not appear on any mission card
// before the mission that teaches it (or defines it in place), chapter 2 must not lean on routing or addressing terms that
// later chapters teach, and quick-fire and the field guide only use a term once their chapter is the one that taught it.
// (Chapter 1's own term map lives in content.test.mjs.)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const plain = (t) => String(t).replace(/<\/?[a-z][^>]*>/gi, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
/* everything a learner reads on a mission card (the answer key is not teaching text) */
const cardText = (m) => plain([m.title, m.goal, m.hint, m.explain, ...(m.how || []), m.question && m.question.ask, ...(m.anat || []).map((a) => a[0] + ' ' + (a[2] || ''))].filter(Boolean).join('\n'));
const flat = [];
NQ.CH.forEach((c, ci) => c.missions.forEach((m, mi) => flat.push({ ci, mi, text: cardText(m) })));
const before = (ci, mi) => flat.filter((x) => x.ci < ci || (x.ci === ci && x.mi < mi));

// term -> [regex that uses it, chapter, mission (0-based) that first teaches it or defines it in place (its own card may use it)]
const FIRST = {
  'ip neigh del': [/neigh(?:bor)? del/, 1, 1],
  static: [/\bstatic\b/i, 1, 2],
  'ip neigh add': [/neigh(?:bor)? add/, 1, 2],
  PERMANENT: [/PERMANENT/, 1, 2],
  flooding: [/\bflood/i, 1, 4],
  'MAC table': [/MAC table/i, 1, 4],
  'ip addr': [/ip addr/, 2, 0],
  prefix: [/\bprefix/i, 2, 0],
  subnet: [/\bsubnet/i, 2, 0],
  'ip addr del': [/addr del/, 2, 1],
  mask: [/\bmask\b/i, 2, 1],
  ipcalc: [/ipcalc/, 2, 2],
  host: [/\bhosts?\b/i, 2, 2],
  private: [/\bprivate\b/i, 2, 3],
  public: [/\bpublic\b/i, 2, 3],
  'duplicate address': [/\bduplicate\b|\bshare an address/i, 2, 4],
  '/31': [/\/31\b/, 2, 5],
  'routing table': [/routing table/i, 3, 0],
  'default route': [/default route/i, 3, 0],
  gateway: [/\bgateway/i, 3, 0],
  'ip route': [/ip route\b/, 3, 0],
  'ip route add': [/route add/, 3, 1],
  'ip route del': [/route del/, 3, 2],
  traceroute: [/traceroute/, 3, 3],
  hop: [/\bhops?\b/i, 3, 3],
  'TTL expiry': [/TTL expiry|time exceeded/i, 3, 3],
  'static route': [/static route/i, 3, 4],
  'routing loop': [/routing loop/i, 3, 5],
};
for (const [term, [re, ci, mi]] of Object.entries(FIRST)) {
  describe(`"${term}"`, () => {
    it(`is not used before ${ci}.${mi}, where it is introduced`, () => {
      for (const x of before(ci, mi)) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}" before it is taught at ${ci}.${mi}`);
      assert.ok(flat.some((x) => x.ci === ci && x.mi === mi && re.test(x.text)), `${ci}.${mi} should be where "${term}" is introduced`);
    });
    it('is not used in quick-fire or the field guide before its chapter', () => {
      for (const q of NQ.QF) if (re.test(plain([q.c, q.a, ...q.w, q.why].join(' ')))) assert.ok(q.ch >= ci, `quick-fire "${q.c}" needs chapter ${ci}`);
      for (const g of NQ.GUIDE) if (re.test(plain([g.c, g.what, ...g.ex.flat()].join(' ')))) assert.ok(g.ch >= ci, `guide "${g.c}" needs chapter ${ci}`);
    });
  });
}

describe('chapter 2 does not use words that later chapters teach', () => {
  // routing and addressing come in chapters 3 and 4; NAT in chapter 5 ("router" and "TTL" were taught in chapter 1)
  const LATER = /\b(subnet|netmask|gateway|NAT|routing|default route|DHCP|VLAN|CIDR|prefix)\b|\broute\b/i;
  NQ.CH[1].missions.forEach((m, i) => it(`2.${i + 1} ${m.title}`, () => assert.ok(!LATER.test(cardText(m)), 'uses a later term')));
  it('the chapter intro', () => assert.ok(!LATER.test(plain(NQ.CH[1].intro))));
});

describe('chapter 2 defines its new words in place', () => {
  const card = (i) => plain(NQ.CH[1].missions[i].goal + ' ' + NQ.CH[1].missions[i].how.join(' '));
  it('dev and del are explained where ip neigh del first appears (2.2)', () => {
    assert.match(card(1), /short for delete/);
    assert.match(card(1), /short for device/);
  });
  it('static and lladdr are explained in 2.3', () => {
    assert.match(card(2), /static<\/?[^>]*>?: it stays|A hand-written entry is static/);
    assert.match(card(2), /link-layer address/);
  });
  it('port and MAC table are explained in 2.5', () => {
    assert.match(card(4), /port \(a socket on the switch\)/);
    assert.match(card(4), /called a MAC table/);
  });
  it('the chapter introduces nothing in its intro that a mission teaches later', () => {
    for (const [, [re]] of Object.entries(FIRST)) assert.ok(!re.test(plain(NQ.CH[1].intro)));
  });
});

describe('chapter 3 does not use words that later chapters teach', () => {
  // routing, the gateway and NAT come in chapters 4 and 5 ("router" was taught in chapter 1)
  const LATER = /\b(gateway|NAT|routing|default route|DHCP|VLAN|traceroute|hops?|ISP)\b|\broute\b/i;
  NQ.CH[2].missions.forEach((m, i) => it(`3.${i + 1} ${m.title}`, () => assert.ok(!LATER.test(cardText(m)), 'uses a later term')));
  it('the chapter intro', () => assert.ok(!LATER.test(plain(NQ.CH[2].intro))));
});

describe('chapter 3 defines its new words in place', () => {
  const card = (i) => NQ.CH[2].missions[i].goal + ' ' + NQ.CH[2].missions[i].how.join(' ');
  it('prefix and subnet are defined where ip addr add first appears (3.1)', () => {
    assert.match(card(0), /<b>prefix<\/b>/);
    assert.match(card(0), /<b>subnet<\/b>/);
    assert.match(card(0), /short for device/);
  });
  it('del and mask are explained in 3.2', () => {
    assert.match(card(1), /<b>mask<\/b>/);
    assert.match(card(1), /short for delete/);
  });
  it('host, broadcast address and bits are explained in 3.3', () => {
    assert.match(card(2), /<b>host<\/b> is any device with an address/);
    assert.match(card(2), /<b>broadcast address<\/b>/);
    assert.match(plain(NQ.CH[2].missions[2].explain), /called bits/);
  });
  it('private and public are defined in 3.4, with the ranges', () => {
    assert.match(card(3), /<b>private<\/b>/);
    assert.match(card(3), /<b>public<\/b>/);
    assert.match(plain(card(3)), /10\./);
    assert.match(plain(card(3)), /172\.16\. and 172\.31\./);
  });
  it('duplicate address is defined in 3.5', () => assert.match(card(4), /<b>duplicate address<\/b>/));
  it('the chapter introduces nothing in its intro that a mission teaches later', () => {
    for (const [, [re]] of Object.entries(FIRST)) assert.ok(!re.test(plain(NQ.CH[2].intro)));
  });
});

describe('chapter 4 does not use words that chapter 5 teaches', () => {
  // NAT, address translation and the public side of the internet come in chapter 5 ("public" and "private" were taught in chapter 3)
  const LATER = /\bNAT\b|\bnat\b|translat|masquerad|\bISP\b|port forward|dropPrivate/i;
  NQ.CH[3].missions.forEach((m, i) => it(`4.${i + 1} ${m.title}`, () => assert.ok(!LATER.test(cardText(m)), 'uses a later term')));
  it('the chapter intro', () => assert.ok(!LATER.test(plain(NQ.CH[3].intro))));
});

describe('chapter 4 defines its new words in place', () => {
  const card = (i) => NQ.CH[3].missions[i].goal + ' ' + NQ.CH[3].missions[i].how.join(' ');
  it('routing table, route, default route and gateway are defined where ip route first appears (4.1)', () => {
    assert.match(card(0), /<b>routing table<\/b>/);
    assert.match(card(0), /<b>route<\/b>/);
    assert.match(card(0), /<b>default route<\/b>/);
    assert.match(card(0), /<b>gateway<\/b>/);
  });
  it('add and del are explained as they first appear (4.2, 4.3)', () => {
    assert.match(plain(card(1)), /add puts a new route/);
    assert.match(card(2), /short for delete/);
  });
  it('hop and TTL expiry are defined where traceroute first appears (4.4), and time exceeded is explained', () => {
    assert.match(card(3), /<b>hop<\/b>/);
    assert.match(card(3), /<b>TTL expiry<\/b>/);
    assert.match(card(3), /time exceeded/);
  });
  it('static route is defined in 4.5, routing loop in 4.6', () => {
    assert.match(card(4), /<b>static route<\/b>/);
    assert.match(card(5), /<b>routing loop<\/b>/);
  });
  it('the terminal device is announced wherever it is not the laptop (4.2, 4.5)', () => {
    assert.match(card(1), /runs <b>on the printer<\/b>/);
    assert.match(card(4), /runs <b>on r1<\/b>/);
  });
  it('the chapter introduces nothing in its intro that a mission teaches later', () => {
    for (const [, [re]] of Object.entries(FIRST)) assert.ok(!re.test(plain(NQ.CH[3].intro)));
  });
});

describe('quick-fire and guide are gated to a chapter that exists', () => {
  it('every entry names a chapter', () => {
    for (const q of NQ.QF) assert.ok(Number.isInteger(q.ch) && NQ.CH[q.ch], q.c);
    for (const g of NQ.GUIDE) assert.ok(Number.isInteger(g.ch) && NQ.CH[g.ch], g.c);
  });
});
