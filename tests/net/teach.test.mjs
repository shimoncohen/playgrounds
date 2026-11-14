// Network Quest, "teach before use" (AGENTS.md rule 12) from chapter 2 on: a key term must not appear on any mission card
// before the mission that teaches it (or defines it in place), chapter 2 must not lean on routing or addressing terms that
// later chapters teach, and quick-fire and the field guide only use a term once their chapter is the one that taught it.
// (Chapter 1's own term map lives in content.test.mjs.)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const plain = (t) => String(t).replace(/<\/?[a-z][^>]*>/gi, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
/* everything a learner reads on a mission card (the answer key is not teaching text); a hint counts as use of a term but not as teaching it */
const cardText = (m, hint) => plain([m.title, m.goal, hint && m.hint, m.explain, ...(m.how || []), m.question && m.question.ask, ...(m.anat || []).map((a) => a[0] + ' ' + (a[2] || ''))].filter(Boolean).join('\n'));
const flat = [];
NQ.CH.forEach((c, ci) => c.missions.forEach((m, mi) => flat.push({ ci, mi, text: cardText(m, true), taught: cardText(m, false) })));
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
  NAT: [/\bNAT\b/, 4, 0],
  translation: [/translat/i, 4, 0],
  ISP: [/\bISP\b/, 4, 0],
  'NAT table': [/NAT table/, 4, 2],
  id: [/\bid\b/, 4, 2],
  'nat on': [/\bnat (?:on|off)\b/, 4, 6],
  DNS: [/\bDNS\b/, 5, 0],
  resolver: [/\bresolver/i, 5, 0],
  dig: [/\bdig\b/, 5, 0],
  record: [/\brecords?\b/i, 5, 1],
  'A record': [/\bA record/, 5, 1],
  UDP: [/\bUDP\b/, 5, 2],
  'UDP port': [/UDP port/, 5, 2],
  qname: [/qname/, 5, 2],
  '+short': [/\+short/, 5, 3],
  MX: [/\bMX\b/, 5, 4],
  NS: [/\bNS\b/, 5, 5],
  'name server': [/name server/i, 5, 5],
  CNAME: [/\bCNAME\b/, 5, 6],
  alias: [/\balias/i, 5, 6],
  NXDOMAIN: [/NXDOMAIN/, 5, 7],
  status: [/reply's status/, 5, 7],
  SERVFAIL: [/SERVFAIL/, 5, 7],
  REFUSED: [/REFUSED/, 5, 7],
  resolvectl: [/resolvectl/, 5, 8],
  recursive: [/\brecursi/i, 6, 0],
  'root server': [/root server/i, 6, 0],
  '@server': [/@(?:server|\d)/, 6, 1],
  referral: [/\breferral/i, 6, 1],
  rd: [/\brd\b/, 6, 1],
  TLD: [/\bTLD\b/, 6, 2],
  glue: [/\bglue\b/i, 6, 2],
  authoritative: [/authoritative/i, 6, 3],
  ra: [/\bra\b/, 6, 3],
  'DNS cache': [/\bcache/i, 6, 4],
  '+norecurse': [/\+norecurse/, 6, 5],
  'DNS TTL': [/DNS TTL/, 6, 6],
  sleep: [/\bsleep\b/, 6, 6],
  'rndc flush': [/rndc/, 6, 7],
  '+trace': [/\+trace/, 6, 8],
};
// same shape; kept apart because the chapter-intro checks below walk FIRST and these chapters' own intros may use them
const EARLY = {
  byte: [/\bbytes?\b/, 0, 0],
  Ethernet: [/\bEthernet\b/, 0, 1],
  IPv4: [/\bIPv4\b/, 0, 1],
  ICMP: [/\bICMP\b/, 0, 1],
  ARP: [/\bARP\b/, 0, 3],
  'packet loss': [/packet loss|\d+% loss/i, 1, 2],
  'last part of a name': [/\blast part\b/i, 6, 0],
};
for (const [term, [re, ci, mi]] of Object.entries({ ...FIRST, ...EARLY })) {
  describe(`"${term}"`, () => {
    it(`is not used before ${ci}.${mi}, where it is introduced`, () => {
      for (const x of before(ci, mi)) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}" before it is taught at ${ci}.${mi}`);
      assert.ok(flat.some((x) => x.ci === ci && x.mi === mi && re.test(x.taught)), `${ci}.${mi} should be where "${term}" is introduced`);
    });
    it('is not used in quick-fire or the field guide before its chapter', () => {
      for (const q of NQ.QF) if (re.test(plain([q.c, q.a, ...q.w, q.why].join(' ')))) assert.ok(q.ch >= ci, `quick-fire "${q.c}" needs chapter ${ci}`);
      for (const g of NQ.GUIDE) if (re.test(plain([g.c, g.what, ...g.ex.flat()].join(' ')))) assert.ok(g.ch >= ci, `guide "${g.c}" needs chapter ${ci}`);
    });
  });
}

describe('chapter 1 and 2 say what an item is before the learner meets it', () => {
  const goal = (ci, mi) => plain(NQ.CH[ci].missions[mi].goal + ' ' + NQ.CH[ci].missions[mi].how.join(' '));
  it('byte (1.1), Ethernet, IPv4 and ICMP (1.2), ARP (1.4), packet loss (2.3), last part of a name (7.1)', () => {
    assert.match(goal(0, 0), /a byte is a small unit of data, so 64 bytes is the size of the reply/);
    assert.match(goal(0, 1), /IPv4 carries the addresses for the whole trip, ICMP is the ping message itself, and Ethernet crosses one wire/);
    assert.match(goal(0, 3), /ARP, the Address Resolution Protocol, is how a device finds the MAC behind an IP address/);
    assert.match(goal(1, 2), /Packet loss, in the statistics at the end, is the share of your requests that got no reply/);
    assert.match(goal(6, 0), /the last part of www\.example\.test is test/);
  });
});

describe('chapter 2 does not use words that later chapters teach', () => {
  // routing and addressing come in chapters 3 and 4; NAT in chapter 5 ("router" and "TTL" were taught in chapter 1)
  const LATER = /\b(subnet|netmask|gateway|NAT|routing|default route|DHCP|VLAN|CIDR|prefix)\b|\broute\b/i;
  NQ.CH[1].missions.forEach((m, i) => it(`2.${i + 1} ${m.title}`, () => assert.ok(!LATER.test(cardText(m, true)), 'uses a later term')));
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
  NQ.CH[2].missions.forEach((m, i) => it(`3.${i + 1} ${m.title}`, () => assert.ok(!LATER.test(cardText(m, true)), 'uses a later term')));
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
  NQ.CH[3].missions.forEach((m, i) => it(`4.${i + 1} ${m.title}`, () => assert.ok(!LATER.test(cardText(m, true)), 'uses a later term')));
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
    assert.match(card(4), /runs <b>on <code>r1<\/code><\/b>/);
  });
  it('the chapter introduces nothing in its intro that a mission teaches later', () => {
    for (const [, [re]] of Object.entries(FIRST)) assert.ok(!re.test(plain(NQ.CH[3].intro)));
  });
});

describe('chapter 5 does not use words that nothing has taught', () => {
  // no firewalls, DHCP, ports or forwarding rules: this chapter only needs NAT, the table and the public side
  const LATER = /port forward|firewall|DHCP|VLAN|masquerad|conntrack|\bPAT\b|\bUDP\b|\bTCP\b|dropPrivate|\bDNS\b|RFC ?1918|\bCIDR\b|netmask/i;
  NQ.CH[4].missions.forEach((m, i) => it(`5.${i + 1} ${m.title}`, () => assert.ok(!LATER.test(cardText(m, true)), 'uses a term nothing has taught')));
  it('the chapter intro', () => assert.ok(!LATER.test(plain(NQ.CH[4].intro))));
});

describe('chapter 5 defines its new words in place', () => {
  const card = (i) => NQ.CH[4].missions[i].goal + ' ' + NQ.CH[4].missions[i].how.join(' ');
  it('NAT, translation and ISP are defined where the chapter first uses them (5.1)', () => {
    assert.match(card(0), /<b>NAT<\/b>, short for network address translation/);
    assert.match(card(0), /<b>translation<\/b>/);
    assert.match(card(0), /<b>ISP<\/b>, the internet service provider/);
  });
  it('source address is explained in 5.2, NAT table and id in 5.3', () => {
    assert.match(card(1), /<b>source address<\/b>/);
    assert.match(card(2), /<b>NAT table<\/b>/);
    assert.match(card(2), /<b>id<\/b>, a ticket number/);
  });
  it('inside and outside are defined in 5.7, where nat on first appears', () => {
    assert.match(card(6), /<b>inside<\/b> faces the house/);
    assert.match(card(6), /<b>outside<\/b> faces the internet/);
  });
  it('the terminal device is announced wherever it is not the laptop (5.3, 5.4, 5.5, 5.7)', () => {
    assert.match(card(2), /runs <b>on <code>home<\/code><\/b>/);
    assert.match(card(3), /runs <b>on <code>web<\/code><\/b>/);
    assert.match(card(4), /runs <b>on <code>home<\/code><\/b>/);
    assert.match(card(6), /runs <b>on <code>home<\/code><\/b>/);
  });
  it('the chapter introduces nothing in its intro that a mission teaches later', () => {
    for (const [term, [re, ci, mi]] of Object.entries(FIRST)) if (ci === 4 && mi > 0) assert.ok(!re.test(plain(NQ.CH[4].intro)), term);
  });
});

describe('chapter 6 does not use words that chapter 7 teaches', () => {
  // chapter 7 teaches the lookups below the resolver, caching and DNS TTL
  const LATER = /\+norecurse|\+trace|rndc|\bcache|DNS TTL|authoritative|referral|\bglue\b|\brecursi|root server|\bTLD\b|@server|\bsleep\b|\b(?:rd|ra|aa)\b/i;
  NQ.CH[5].missions.forEach((m, i) => it(`6.${i + 1} ${m.title}`, () => assert.ok(!LATER.test(cardText(m, true)), 'uses a later term')));
  it('the chapter intro', () => assert.ok(!LATER.test(plain(NQ.CH[5].intro))));
});

describe('chapter 6 defines its new words in place', () => {
  const card = (i) => NQ.CH[5].missions[i].goal + ' ' + NQ.CH[5].missions[i].how.join(' ');
  it('DNS and resolver are defined where the chapter first uses them (6.1)', () => {
    assert.match(card(0), /<b>DNS<\/b>, the Domain Name System/);
    assert.match(card(0), /<b>resolver<\/b>, a server whose job is to look names up/);
  });
  it('record and A record are defined in 6.2, IN is explained', () => {
    assert.match(card(1), /<b>record<\/b>: a single fact/);
    assert.match(card(1), /<b>A record<\/b>: it joins a name to an IPv4 address/);
    assert.match(plain(card(1)), /IN \(short for Internet/);
  });
  it('UDP, UDP port, DNS as a layer and qname are defined in 6.3', () => {
    assert.match(card(2), /<b>UDP<\/b> sends one short message/);
    assert.match(card(2), /<b>UDP port<\/b> is a number/);
    assert.match(card(2), /<code>qname<\/code> field is the name being asked about/);
  });
  it('+short is explained as an option in 6.4', () => assert.match(plain(card(3)), /\+short is the option/));
  it('MX, NS, name server, CNAME and alias are defined where they first appear (6.5 to 6.7)', () => {
    assert.match(card(4), /<b>MX<\/b> record names the server that takes in mail/);
    assert.match(card(5), /<b>NS<\/b> record names a <b>name server<\/b>/);
    assert.match(card(6), /<b>CNAME<\/b> record makes a name an <b>alias<\/b>/);
  });
  it('status, NXDOMAIN, SERVFAIL and REFUSED are defined in 6.8', () => {
    assert.match(card(7), /<b>status<\/b>/);
    assert.match(card(7), /<b>NXDOMAIN<\/b> means the name does not exist/);
    assert.match(card(7), /<b>SERVFAIL<\/b> means the server tried and could not find out/);
    assert.match(card(7), /<b>REFUSED<\/b> means the server would not answer/);
  });
  it('resolvectl is explained in 6.9', () => assert.match(plain(card(8)), /resolvectl shows and sets which server this laptop asks/));
  it('the chapter introduces nothing in its intro that a mission teaches later', () => {
    for (const [term, [re, ci, mi]] of Object.entries(FIRST)) if (ci === 5 && mi > 0) assert.ok(!re.test(plain(NQ.CH[5].intro)), term);
  });
});

describe('chapter 7 does not use words that nothing has taught', () => {
  const LATER = /\bTCP\b|DNSSEC|\bEDNS\b|\bPTR\b|zone transfer|\bDHCP\b|\bVLAN\b|wildcard|\bBIND\b/i;
  NQ.CH[6].missions.forEach((m, i) => it(`7.${i + 1} ${m.title}`, () => assert.ok(!LATER.test(cardText(m, true)), 'uses a term nothing has taught')));
  it('the chapter intro', () => assert.ok(!LATER.test(plain(NQ.CH[6].intro))));
});

describe('chapter 7 defines its new words in place', () => {
  const card = (i) => NQ.CH[6].missions[i].goal + ' ' + NQ.CH[6].missions[i].how.join(' ');
  it('recursive and root server are defined in 7.1', () => {
    assert.match(card(0), /<b>recursive<\/b> resolver does the whole search/);
    assert.match(card(0), /<b>root server<\/b>: a server that knows/);
  });
  it('referral and rd are defined in 7.2, and the warning is mentioned', () => {
    assert.match(card(1), /<b>referral<\/b>: not an answer but a pointer/);
    assert.match(plain(card(1)), /\brd\s+means recursion desired/);
    assert.match(plain(card(1)), /prints a warning/);
  });
  it('TLD and glue are defined in 7.3', () => {
    assert.match(card(2), /<b>TLD<\/b> server, short for top-level domain/);
    assert.match(card(2), /<b>glue<\/b>/);
  });
  it('authoritative and ra are defined in 7.4, by contrast with the resolver\'s reply', () => {
    assert.match(card(3), /<b>authoritative<\/b> for/);
    assert.match(plain(card(3)), /\bra\s+means recursion available/);
  });
  it('the DNS cache, +norecurse, the DNS TTL and rndc flush are defined where they first appear (7.5 to 7.8)', () => {
    assert.match(card(4), /<b>DNS cache<\/b>: its memory of answers/);
    assert.match(plain(card(5)), /\+norecurse is the option/);
    assert.match(card(6), /<b>DNS TTL<\/b>, short for time to live/);
    assert.match(plain(card(7)), /rndc controls a name server/);
  });
  it('the terminal device is announced where it is not the laptop (7.8)', () => {
    assert.match(card(7), /runs <b>on <code>resolver<\/code><\/b>/);
  });
  it('the flag aa is never written on a card before chapter 7 ends, because 7.4 asks for it', () => {
    for (const x of flat) assert.ok(!/\baa\b/.test(x.text), `${x.ci}.${x.mi} names the flag`);
  });
  it('the chapter introduces nothing in its intro that a mission teaches later', () => {
    for (const [term, [re, ci, mi]] of Object.entries(FIRST)) if (ci === 6 && mi > 0) assert.ok(!re.test(plain(NQ.CH[6].intro)), term);
  });
});

describe('quick-fire and guide are gated to a chapter that exists', () => {
  it('every entry names a chapter', () => {
    for (const q of NQ.QF) assert.ok(Number.isInteger(q.ch) && NQ.CH[q.ch], q.c);
    for (const g of NQ.GUIDE) assert.ok(Number.isInteger(g.ch) && NQ.CH[g.ch], g.c);
  });
});

describe('learner text only names things the page really shows', () => {
  // the packet list has no "verdict" label and no "dev" column: rows show the step, the device name, the direction and a note
  const all = [];
  NQ.CH.forEach((c, ci) => c.missions.forEach((m, mi) => all.push({ id: `${ci}.${mi}`, text: [m.title, m.goal, m.hint, m.explain, ...(m.how || []), m.question && m.question.ask].filter(Boolean).join('\n') })));
  it('no mission card says "verdict" or "the dev column"', () => {
    for (const x of all) assert.doesNotMatch(plain(x.text), /\bverdicts?\b|\bdev column\b/i, x.id);
  });
  it('check messages and hints do not either', () => {
    for (const [ci, c] of NQ.CH.entries()) for (const [mi, m] of c.missions.entries()) {
      const r = NQ.runMission(m, [], null);
      if (typeof r === 'string') assert.doesNotMatch(plain(r), /\bverdicts?\b|\bdev column\b/i, `${ci}.${mi}`);
    }
  });
});

describe('help lists only the commands taught so far', () => {
  const helpAt = (ci, mi) => Array.from(NQ.session(NQ.CH[ci].missions[mi]).run('help').out, (l) => l.split(/\s+/)[0]);
  it('chapter 1 starts with ping and help, then adds ip and arping where they are taught', () => {
    assert.deepEqual(helpAt(0, 0), ['help', 'ping']);
    assert.deepEqual(helpAt(0, 5), ['help', 'ping']);
    assert.deepEqual(helpAt(0, 6), ['help', 'ip', 'ping']);
    assert.deepEqual(helpAt(0, 7), ['arping', 'help', 'ip', 'ping']);
  });
  it('ipcalc, traceroute and nat appear on the mission that teaches them, not before', () => {
    assert.ok(!helpAt(2, 1).includes('ipcalc') && helpAt(2, 2).includes('ipcalc'));
    assert.ok(!helpAt(3, 2).includes('traceroute') && helpAt(3, 3).includes('traceroute'));
    assert.ok(!helpAt(4, 1).includes('nat') && helpAt(4, 2).includes('nat'));
  });
  it('by the last mission every command is listed', () => {
    const last = NQ.CH.at(-1), m = last.missions.at(-1), dev = NQ.session(m).net.devices[m.dev || NQ.session(m).net.me];
    assert.deepEqual(helpAt(NQ.CH.length - 1, last.missions.length - 1), Object.keys(NQ.CMDS).filter((n) => !NQ.AVAIL[n] || NQ.AVAIL[n](dev)).sort());
  });
  it('chapter 6: dig is not listed before 5.0, resolvectl not before 5.8, and sleep through the whole chapter', () => {
    assert.ok(!helpAt(4, 6).includes('dig'));
    assert.ok(helpAt(5, 0).includes('dig'));
    for (let i = 0; i < 8; i++) assert.ok(!helpAt(5, i).includes('resolvectl'), String(i));
    assert.ok(helpAt(5, 8).includes('resolvectl'));
    for (let i = 0; i < 9; i++) assert.ok(!helpAt(5, i).includes('sleep'), String(i));
  });
  it('chapter 7: sleep is not listed before 6.6, and rndc not before 6.7, where it is listed only on the resolver', () => {
    for (let i = 0; i < 5; i++) assert.ok(!helpAt(6, i).includes('sleep'), String(i));
    assert.ok(helpAt(6, 5).includes('sleep') === false && helpAt(6, 6).includes('sleep'));
    for (let i = 0; i < 7; i++) assert.ok(!helpAt(6, i).includes('rndc'), String(i));
    assert.ok(helpAt(6, 7).includes('rndc'));
    assert.ok(!helpAt(6, 8).includes('rndc'), 'the laptop has no rndc');
    assert.ok(helpAt(6, 8).includes('sleep'));
  });
  it('a locked command still runs: help only hides it', () => {
    assert.equal(NQ.session(NQ.CH[0].missions[0]).run('ipcalc 10.0.0.0/24').code, 0);
  });
});
