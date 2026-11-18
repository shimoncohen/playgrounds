// Literal pins: the shared tier model's defaults must not drift for Agent Quest.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadAgent, J } from './harness.mjs';

const AQ = loadAgent();

describe('Agent Quest tier defaults', () => {
  it('ranks', () => {
    assert.deepEqual(J(AQ.tiers.ranks()), [[0, 'Prompt Rookie'], [60, 'Loop Watcher'], [150, 'Context Keeper'],
      [260, 'Prompt Smith'], [380, 'Guardrail Builder'], [505, 'Agent Whisperer']]);
  });
  it('cumulative XP per tier', () => {
    assert.deepEqual(['core', 'dev', 'personal', 'tune'].map((t) => AQ.tiers.cumulativeXp(t)), [505, 945, 1220, 1385]);
  });
  it('10 XP per mission in all 23 chapters, and the badge is 25', () => {
    assert.deepEqual(Array.from({ length: 23 }, (_, i) => AQ.tiers.missionXp(i)), Array(23).fill(10));
    assert.equal(AQ.CH.length, 23);
    assert.equal(AQ.tiers.chapterBadgeXp, 25);
  });
  it('chapter tiers', () => {
    assert.deepEqual(J(AQ.CH.map((c) => c.tier)),[...Array(7).fill('core'), ...Array(8).fill('dev'), ...Array(5).fill('personal'), ...Array(3).fill('tune')]);
  });
  it('renderRail draws every tier header and every chapter', () => {
    const ctx = { }; ctx.globalThis = ctx; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('shared/tiers.js', 'utf8'), ctx);
    const el = { innerHTML: '' };
    ctx.Tiers.renderRail(el, { status: AQ.tiers.status({ done: {}, badges: {} }), chapters: AQ.CH, S: { done: {}, badges: {}, ch: 0 } });
    const heads = [...el.innerHTML.matchAll(/<div class="tierhead" data-tier="(\w+)"><span class="tn">(\w+)<\/span><span class="tc">(\d+)\/(\d+)<\/span><\/div>/g)].map((m) => m.slice(1));
    assert.deepEqual(heads, [['core', 'Core', '0', '7'], ['dev', 'Dev', '0', '8'], ['personal', 'Personal', '0', '5'], ['tune', 'Tune', '0', '3']]);
    assert.equal((el.innerHTML.match(/<button class="chap" data-ch="/g) || []).length, 23);
  });
});
