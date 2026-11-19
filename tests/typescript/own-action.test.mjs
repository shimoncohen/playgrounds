import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptContent } from '../content-loader.mjs';
import { createSession } from './harness.mjs';

// AGENTS.md hard rule 5: a mission completes only on the learner's own input. One session is one console, so
// names and types from earlier runs stay visible to a check, exactly as in the page.
const { CH } = loadTypescriptContent();
const missions = CH[0].missions;

// 'M<mission>:<other mission's answer>' -> why that answer may also complete mission M. Empty: none do.
const ALLOWED = {};

const BATTERY = [
  'void 0',
  'let a: string = 5',
  'let wagon: string',
  'wagon = 7',
  'type Wagon = "red"',
  'let x: any = 1',
  '(null as any).x',
  'let u: unknown = 1',
  'u.length',
  'function f(w: string) { return w }',
  'const n = 1 as number',
  'let slot = "Tuesday"',
  'slot = "Wednesday"',
  'const stop = "Ashford"',
  'let town = "Ashford"',
  'town = 42',
];

describe('typescript-quest own action', () => {
  missions.forEach((m, i) => {
    const others = missions.map((o, j) => [j, o]).filter(([j]) => j !== i);
    const mustFail = (s, src, what) => {
      const passed = !!m.check(s.ctx(s.run(src)));
      assert.equal(passed, false, `mission ${i + 1} completed by ${what}: ${JSON.stringify(src)}`);
    };
    const answers = (s, label) => others.forEach(([j, o]) => {
      if (ALLOWED[`M${i + 1}:${j + 1}`]) { s.run(o.code); return; }
      mustFail(s, o.code, `${label} the answer of mission ${j + 1}`);
    });
    const battery = (s, label) => BATTERY.forEach(src => mustFail(s, src, label));

    it(`mission ${i + 1} is not completed by the other answers, then an unrelated battery (after its setup)`, () => {
      const s = createSession();
      if (m.pre) s.run(m.pre);
      answers(s, 'after setup,');
      battery(s, 'the battery after');
    });

    it(`mission ${i + 1} is not completed by the battery when the other answers ran before its setup`, () => {
      const s = createSession();
      answers(s, 'before setup,');
      if (m.pre) s.run(m.pre);
      battery(s, 'the battery after');
    });
  });

  it('every allowlist entry names a real mission pair and a reason', () => {
    for (const [k, why] of Object.entries(ALLOWED)) {
      assert.match(k, /^M[1-7]:[1-7]$/);
      assert.ok(why.trim());
    }
  });
});
