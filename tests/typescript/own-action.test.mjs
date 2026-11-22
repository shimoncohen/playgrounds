import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptContent } from '../content-loader.mjs';
import { createSession } from './harness.mjs';
import { projectRun } from './project-harness.mjs';

// AGENTS.md hard rule 5: a mission completes only on the learner's own input. One session is one console, so
// names and types from earlier runs stay visible to a check, exactly as in the page.
const { CH } = loadTypescriptContent();

// 'C<chapter>M<mission>:C<chapter>M<mission>' (1-based) -> why the second answer may also complete the first. Empty: none do.
const ALLOWED = {
  'C8M4:C8M6': 'the answer of mission 6 prints the enum too, and printing the enum is all mission 4 asks',
  'C3M4:C14M3': 'chapter 3 mission 4 asks only for TS2353, and a name that is not in the handler table is an unknown property, which is always TS2353',
  'C3M3:C12M3': 'chapter 3 mission 3 asks only for TS2540 and the word readonly, and a Readonly rebuild can show its lock only by a write to a readonly property',
  'C3M4:C9M5': 'chapter 3 mission 4 asks only for TS2353, and the Pick answer is an excess property in an object written in place',
  'C3M4:C9M6': 'chapter 3 mission 4 asks only for TS2353, and the Omit answer is an excess property in an object written in place',
};

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
  'class Car { seats = 1 }',
  'function pass<T>(x: T) { return x }',
  'enum Stop { Ashford }',
  'const board = { stop: "Ashford" } as const',
  'let part: Partial<{ seat: string }>',
  'type Lamp = keyof { red: number }',
  'type Flags<T> = { [K in keyof T]: boolean }',
  'type Track<T> = T extends string ? "left" : "right"',
  'type Cargo<T> = T extends (infer E)[] ? E : never',
  'type Loud = Uppercase<"ashford">',
  'type Address = `${"Ashford" | "Barlow"}-A1`',
];

// A check that reads c.has('N') or c.types.includes('N') must not pass on a bare declaration of N.
const readNames = m => {
  const src = m.check.toString();
  const values = [...src.matchAll(/\.has\(\s*['"](\w+)['"]\s*\)/g)].map(x => `let ${x[1]} = 0`);
  const types = [...src.matchAll(/types\.includes\(\s*['"](\w+)['"]\s*\)/g)].map(x => `type ${x[1]} = {}`);
  return [...values, ...types];
};

const allowed = (a, b) => ALLOWED[`${a}:${b}`];

// A project mission is checked on the run that just happened; each of these must complete none of them.
const PROJECT_BATTERY = {
  'one file that only prints': { 'main.ts': 'console.log("Wagon 4 is ready")' },
  'a value exported and not imported': { 'main.ts': 'export const wagonCount = 4\nconsole.log("Wagons: " + wagonCount)' },
  'a local interface': { 'main.ts': 'interface Wagon {\n  id: number\n}\nconst first: Wagon = { id: 4 }\nconsole.log("Wagon " + first.id)' },
  'two files and a plain import': { 'a.ts': 'export const one = "tea"', 'main.ts': 'import { one } from "./a"\nconsole.log(one)' },
  'a type error': { 'main.ts': 'const seats: number = "four"\nconsole.log(seats)' },
  'no main.ts': { 'a.ts': 'export const one = "tea"' },
  'an empty main.ts': { 'main.ts': '' },
};
const reference = m => ({ ...m.start, ...m.code });

CH.forEach((ch, ci) => {
  if (ch.terminal) return;
  if (ch.mode === 'project') {
    describe(`typescript-quest own action, chapter ${ci + 1}: ${ch.name} (project)`, () => {
      ch.missions.forEach((m, i) => {
        const id = `C${ci + 1}M${i + 1}`;
        const mustFail = async (files, what) => {
          const passed = !!m.check(await projectRun(files));
          assert.equal(passed, false, `${id} completed by ${what}`);
        };
        it(`mission ${i + 1} is not completed by its starter files alone, nor with an empty main.ts`, async () => {
          await mustFail(m.start, 'the starter files');
          await mustFail({ ...m.start, 'main.ts': '' }, 'an empty main.ts');
        });
        it(`mission ${i + 1} is not completed by the reference files of the other missions`, async () => {
          for (const [j, o] of ch.missions.entries()) if (j !== i) await mustFail(reference(o), `the reference files of mission ${j + 1}`);
        });
        it(`mission ${i + 1} is not completed by an unrelated project battery`, async () => {
          for (const [what, files] of Object.entries(PROJECT_BATTERY)) await mustFail(files, what);
        });
      });
    });
    return;
  }
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
          if (oci === ci || och.mode === 'project') return;
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
