// Network Quest: a mission that asks for several commands passes only after all of them ran, in the order given.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const CASES = [[1, 3, 'Repair the entry'], [2, 0, 'Give the phone an address'], [2, 1, 'A typo in the mask'], [2, 4, 'Two devices, one address'],
  [3, 1, 'No way out'], [3, 2, 'The wrong gateway'], [3, 4, 'A route r1 forgot'], [4, 4, 'Lost the way out'], [4, 6, 'Turn NAT back on']];

// a host that answers once the fix is in, but is not the one the mission asks to prove
const OTHER = { 'Repair the entry': '10.0.0.2', 'Give the phone an address': '10.0.0.3', 'A typo in the mask': '10.0.0.200', 'Two devices, one address': '192.168.1.20',
  'No way out': '192.168.1.1', 'The wrong gateway': '192.168.1.1', 'A route r1 forgot': '10.0.1.2', 'Lost the way out': '203.0.113.6' };

describe('multi-command missions need every command, in order', () => {
  for (const [ch, i, title] of CASES) {
    const m = NQ.CH[ch].missions[i], a = m.answer;
    it(title, () => {
      assert.equal(m.title, title);
      assert.equal(NQ.runMission(m, a, null), true, 'full answer passes');
      assert.notEqual(NQ.runMission(m, a.slice(0, -1), null), true, 'without the last command');
      assert.notEqual(NQ.runMission(m, [a.at(-1), ...a.slice(0, -1)], null), true, 'last command first');
      if (OTHER[title]) assert.notEqual(NQ.runMission(m, [...a.slice(0, -1), 'ping -c 1 ' + OTHER[title]], null), true, 'a ping to another reachable host');
    });
  }
  it('Turn NAT back on: nat on before nat does not pass', () => {
    const m = NQ.CH[4].missions[6];
    assert.notEqual(NQ.runMission(m, ['nat on', 'nat'], null), true);
  });
});
