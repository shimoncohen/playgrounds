import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

// Learner-facing prose shows commands, options, file names, addresses and interface names as code (docs/tiers-guideline.md,
// "Code in prose"). The shell rules are copied from tests/shell/codestyle.test.mjs (importing that file would run the
// Shell Quest tests too); the net rules add the Network Quest commands, interface names, IPv4 addresses, CIDRs and MACs.
// Lowercase ip and ping are always treated as code, so prose says "IP" for the protocol and uses "Ping" only to start a
// sentence ("Ping the phone ...").
const SAFE = 'pwd ls cd mkdir rmdir rm cp mv wc grep uniq chmod whoami hostname nano vi vim tee tr sed seq xargs diff printf tac nl comm basename dirname ln awk ps getopts mktemp realpath printenv readonly'.split(' ');
const AMBIG = 'cat echo find head tail sort touch cut env date history clear sleep wait kill jobs'.split(' ');
const VERB = 'prints|shows|puts|scrolls|walks|tells|creates|slices|understands|runs|receives|sees|reverses|keeps|says|swaps|writes|sorts|counts|finds|lists|reads|takes|gives|joins|turns|makes|catches|drops|splits';
const NET = 'ip ping traceroute arping ipcalc'.split(' ');
const G = '(?<![\\w§/.$-])', E = '(?![\\w/-])';
const RULES = [
  ['command name', new RegExp(`${G}(?:${SAFE.join('|')})${E}`)],
  ['command name before a verb', new RegExp(`${G}(?:${AMBIG.join('|')})(?= (?:${VERB})\\b)`)],
  ['option', new RegExp(`${G}-{1,2}[A-Za-z][\\w-]*${E}`)],
  ['file name', new RegExp(`${G}(?:[\\w.~-]+/)*[\\w-]+\\.(?:txt|log|sh|csv|md|conf|json)${E}`)],
  ['variable', new RegExp(`${G}\\$(?:[A-Za-z_]\\w*|[?#@*0-9])${E}`)],
  ['net command', new RegExp(`${G}(?:${NET.join('|')})${E}`)],
  ['interface name', new RegExp(`${G}(?:eth|wlan|p)\\d+${E}`)],
  ['address', new RegExp(`${G}\\d{1,3}(?:\\.\\d{1,3}){3}(?:/\\d{1,2})?${E}`)],
  ['MAC', new RegExp(`${G}[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}${E}`)],
];
const prose = (h) => String(h).replace(/<code>.*?<\/code>|<kbd>.*?<\/kbd>|<pre[^>]*>.*?<\/pre>/gs, '§').replace(/<[^>]+>/g, ' ').replace(/&(?:gt|lt|amp|quot);/g, '§');

function bareMentions(text) {
  const t = prose(text), out = [];
  for (const [what, re] of RULES) { const m = re.exec(t); if (m) out.push(`${what} "${m[0]}" in: …${t.slice(Math.max(0, m.index - 25), m.index + 35).replace(/\s+/g, ' ')}…`); }
  return out;
}

describe('bareMentions (the net rules)', () => {
  it('flags bare net names and passes coded ones', () => {
    assert.equal(bareMentions('<code>ping</code> sends a packet').length, 0);
    assert.equal(bareMentions('ping sends a packet').length, 1);
    assert.equal(bareMentions('run ip addr').length, 1);
    assert.equal(bareMentions('the phone is at 10.0.0.3.').length, 1);
    assert.equal(bareMentions('the net 10.0.0.0/24').length, 1);
    assert.equal(bareMentions('out of eth0').length, 1);
    assert.equal(bareMentions('sent to ff:ff:ff:ff:ff:ff').length, 1);
    assert.equal(bareMentions('use -c to count').length, 1);
    assert.equal(bareMentions('An IP address, an IPv4 header and a MAC address. IP is the internet layer.').length, 0);
    assert.equal(bareMentions('<code>ping -c 3 10.0.0.3</code> on <code>eth0</code>').length, 0);
  });
});

describe('Network Quest text keeps commands, options, addresses and interfaces in <code>', () => {
  const NQ = loadNet();
  NQ.CH.forEach((ch, c) => {
    it(`chapter ${c + 1} intro`, () => assert.deepEqual(bareMentions(ch.intro), []));
    ch.missions.forEach((m, i) => {
      const texts = [m.goal, m.explain, m.hint, m.question && m.question.ask, ...(m.how || [])].filter(Boolean);
      it(`${c + 1}.${i + 1} ${m.title}`, () => assert.deepEqual(texts.flatMap(bareMentions), []));
    });
  });
  it('field guide what and example notes', () => assert.deepEqual([...NQ.GUIDE].flatMap((g) => [g.what, ...g.ex.map(([, n]) => n)]).flatMap(bareMentions), []));
  it('quick-fire questions, answers and explanations', () => assert.deepEqual([...NQ.QF].flatMap((q) => [q.c, q.a, ...q.w, q.why]).flatMap(bareMentions), []));
});
