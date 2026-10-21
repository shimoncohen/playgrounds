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

describe('quick-fire and guide are gated to a chapter that exists', () => {
  it('every entry names a chapter', () => {
    for (const q of NQ.QF) assert.ok(Number.isInteger(q.ch) && NQ.CH[q.ch], q.c);
    for (const g of NQ.GUIDE) assert.ok(Number.isInteger(g.ch) && NQ.CH[g.ch], g.c);
  });
});
