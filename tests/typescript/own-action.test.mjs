import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptContent } from '../content-loader.mjs';
import { createSession } from './harness.mjs';

// AGENTS.md hard rule 5: a mission completes only on the learner's own input. One session is one console, so
// names and types from earlier runs stay visible to a check, exactly as in the page.
const { CH } = loadTypescriptContent();

// 'C<chapter>M<mission>:C<chapter>M<mission>' (1-based) -> why the second answer may also complete the first. Empty: none do.
const ALLOWED = {};

const BASE_BATTERY = [
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

// A check that reads c.has('N') or c.types.includes('N') must not pass on a bare declaration of N.
const readNames = m => {
  const src = m.check.toString();
  const values = [...src.matchAll(/\.has\(\s*['"](\w+)['"]\s*\)/g)].map(x => `let ${x[1]} = 0`);
  const types = [...src.matchAll(/types\.includes\(\s*['"](\w+)['"]\s*\)/g)].map(x => `type ${x[1]} = {}`);
  return [...values, ...types];
};

const allowed = (a, b) => ALLOWED[`${a}:${b}`];

CH.forEach((ch, ci) => {
  describe(`typescript-quest own action, chapter ${ci + 1}: ${ch.name}`, () => {
    const missions = ch.missions;
    missions.forEach((m, i) => {
      const id = `C${ci + 1}M${i + 1}`;
      const others = missions.map((o, j) => [j, o]).filter(([j]) => j !== i);
      const battery = [...BASE_BATTERY, ...readNames(m)];
      const mustFail = (s, src, what) => {
        const passed = !!m.check(s.ctx(s.run(src)));
        assert.equal(passed, false, `${id} completed by ${what}: ${JSON.stringify(src)}`);
      };
      const answers = (s, label) => others.forEach(([j, o]) => {
        if (allowed(id, `C${ci + 1}M${j + 1}`)) { s.run(o.code); return; }
        mustFail(s, o.code, `${label} the answer of mission ${j + 1}`);
      });
      const runBattery = (s, label) => battery.forEach(src => mustFail(s, src, label));

      it(`mission ${i + 1} is not completed by the other answers, then an unrelated battery (after its setup)`, () => {
        const s = createSession();
        if (m.pre) s.run(m.pre);
        answers(s, 'after setup,');
        runBattery(s, 'the battery after');
      });

      it(`mission ${i + 1} is not completed by a later run once its own answer is stale in the memory panel`, () => {
        const s = createSession();
        if (m.pre) s.run(m.pre);
        s.run(m.code);
        mustFail(s, 'void 0', 'a lazy line after its own answer');
        battery.forEach(src => mustFail(s, src, 'the battery after its own answer'));
      });

      it(`mission ${i + 1} is not completed by the battery when the other answers ran before its setup`, () => {
        const s = createSession();
        answers(s, 'before setup,');
        if (m.pre) s.run(m.pre);
        runBattery(s, 'the battery after');
      });

      it(`mission ${i + 1} is not completed by the answers of the other chapters, each alone after its setup`, () => {
        CH.forEach((och, oci) => {
          if (oci === ci) return;
          och.missions.forEach((o, j) => {
            if (allowed(id, `C${oci + 1}M${j + 1}`)) return;
            const s = createSession();
            if (m.pre) s.run(m.pre);
            mustFail(s, o.code, `the answer of chapter ${oci + 1} mission ${j + 1}`);
          });
        });
      });
    });
  });
});

describe('typescript-quest own action allowlist', () => {
  it('every entry names a real mission pair and a reason', () => {
    for (const [k, why] of Object.entries(ALLOWED)) {
      const [a, b] = k.split(':').map(x => x.match(/^C(\d+)M(\d+)$/));
      assert.ok(a && b, k);
      for (const [, c, m] of [a, b]) assert.ok(CH[c - 1] && CH[c - 1].missions[m - 1], `${k} names a mission that does not exist`);
      assert.ok(why.trim());
    }
  });
});
