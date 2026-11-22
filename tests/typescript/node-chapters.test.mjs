// The terminal chapters (15 to 18): every mission is played the way the page plays it, through playTerminal, and a pass
// must hold on the final run and on the last tryComplete snapshot of the last command, or the page cannot complete it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptContent } from '../content-loader.mjs';
import { flatFiles } from './project-harness.mjs';
import { playTerminal as playOnce } from './terminal-harness.mjs';

// The cases replay the same files and commands many times; results are only read, so share the promise.
const played = new Map();
const playTerminal = (files, cmds) => {
  const key = JSON.stringify([files, cmds]);
  if (!played.has(key)) played.set(key, playOnce(files, cmds));
  return played.get(key);
};

const { CH } = loadTypescriptContent();

// Chapter-level helpers (`const cli=c=>...`) that a check calls with the run: their bodies read the run too.
const CONTENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'programming', 'typescript-quest', 'content');
const HELPERS = fs.readdirSync(CONTENT).filter(f => /^ch-.*\.js$/.test(f))
  .flatMap(f => [...fs.readFileSync(path.join(CONTENT, f), 'utf8').matchAll(/^const (\w+)=c=>.*$/gm)].map(x => [x[1], x[0]]));

// Per mission: the exit code and the diagnostic codes of the reference's last run. `tests` is the node --test summary where one is read.
const OUTCOMES = {
  15: [
    { exitCode: 2, codes: [7006, 18048] }, { exitCode: 2, codes: [7006] }, { exitCode: 2, codes: [18048] },
    { exitCode: 2, codes: [18048] }, { exitCode: 2, codes: [7030] }, { exitCode: 2, codes: [6133] },
  ],
  16: [
    { exitCode: 0 }, { exitCode: 2, codes: [18046] }, { exitCode: 0 }, { exitCode: 0 }, { exitCode: 0 }, { exitCode: 2, codes: [2345] },
  ],
  17: [
    { exitCode: 0, tests: { pass: 1, fail: 0, suites: 0 } }, { exitCode: 1, tests: { pass: 0, fail: 1 } },
    { exitCode: 0, tests: { pass: 2, fail: 0, suites: 1 } }, { exitCode: 1, tests: { pass: 0, fail: 1 } },
    { exitCode: 0, tests: { pass: 1, fail: 0 } }, { exitCode: 0, tests: { pass: 1, fail: 0 } },
  ],
  18: [
    { exitCode: 0 }, { exitCode: 1 }, { exitCode: 2, codes: [2741] }, { exitCode: 0 },
    { exitCode: 0 }, { exitCode: 1 }, { exitCode: 0, tests: { pass: 2, fail: 0 } }, { exitCode: 0 },
  ],
};

// 'C18M<m>:C18M<o>': the reference of mission o also completes mission m, because o's CLI keeps m's feature.
// Only chapter 18 is cumulative, so only it may list pairs. The case it skips is ref(o) with m.cmds.
const carries = (m, later, why) => Object.fromEntries(later.map(o => [`C18M${m}:C18M${o}`, why]));
const ALLOWED = {
  ...carries(1, [2, 3, 4, 5, 6, 7, 8], 'the later CLI keeps the typed Command union and still prints the parsed add command, which is all mission 1 asks'),
  ...carries(2, [3, 4, 5, 6, 7, 8], 'the later CLI keeps the try and catch around the load, with the message and process.exitCode on a broken file'),
  ...carries(4, [5, 6, 7, 8], 'the later CLI keeps check and findClashes, so it still prints both clashing performers'),
  ...carries(5, [6, 7, 8], 'the later CLI keeps add that saves the booking and list that shows it (mission 8 groups the lines but still names the added performer)'),
  ...carries(6, [7, 8], 'the later CLI keeps check setting process.exitCode to 1 on a clash'),
  ...carries(7, [8], 'the later project keeps the clash test and the clean test beside the code'),
};

const ALLOWED_C = ['src', 'cmd', 'args', 'ok', 'out', 'diags', 'exitCode', 'tests', 'files', 'ran'];
const DATA = ['timetable.txt', 'timetable.json', 'smudged.json', 'tour-book.json', 'broken.json'];
const ref = o => ({ ...o.start, ...o.code });
const lastCmd = cmds => cmds.filter(c => typeof c === 'string').at(-1);
const lastIdx = cmds => cmds.map((c, i) => [c, i]).filter(([c]) => typeof c === 'string').at(-1)[1];

const judge = (m, run) => { try { return !!m.check(run); } catch { return false; } };
// "passes": the check holds on the final run and on the last snapshot of the last command. "ever": on any of them.
async function play(m, files, cmds) {
  const { run, snaps } = await playTerminal(files, cmds);
  const last = snaps.filter(s => s.at === lastIdx(cmds));
  const final = judge(m, run);
  return {
    run, snaps,
    passes: final && last.length > 0 && judge(m, last.at(-1).run),
    ever: final || snaps.some(s => judge(m, s.run)),
  };
}
const never = async (m, files, cmds, what) => {
  const p = await play(m, files, cmds);
  assert.equal(p.ever, false, `${what} completes "${m.title}": ${JSON.stringify(p.run.diags || p.run.out)}`);
};

CH.forEach((ch, ci) => {
  if (!ch.terminal) return;
  const num = ci + 1;
  describe(`terminal chapter ${num}: ${ch.name}`, () => {
    const lastOf = m => lastCmd(m.cmds);
    ch.missions.forEach((m, i) => {
      const id = `C${num}M${i + 1}`;
      const outcome = (OUTCOMES[num] || [])[i];
      describe(`mission ${i + 1}: ${m.title}`, () => {
        it('has every field, and its check reads only the allowed run members and pins the command', () => {
          for (const k of ['title', 'goal', 'explain', 'hint', 'open']) assert.equal(typeof m[k], 'string', k);
          for (const k of ['start', 'code', 'wrong']) assert.ok(m[k] && typeof m[k] === 'object', k);
          assert.ok(m.open in m.start, 'open names a starter file');
          assert.equal(typeof m.check, 'function');
          assert.ok(Array.isArray(m.anat) && m.anat.length > 0, 'anat');
          assert.ok(Array.isArray(m.how) && m.how.length >= 3 && m.how.length <= 5, 'how: 3 to 5 steps');
          assert.match(m.how[0], /^The whole (line|code)/, 'how step 1 says what the whole line does');
          assert.ok(Array.isArray(m.cmds) && m.cmds.length > 0, 'cmds');
          for (const [tok, , label] of m.anat) {
            for (const s of [tok, label]) assert.doesNotMatch(s, /&(lt|gt|amp);/, `anat text ${s} is escaped again by the page`);
            assert.ok(tok.length <= 36, `anat token ${tok} is ${tok.length} characters, a 390 px chip cuts it off`);
          }
          const helpers = HELPERS.filter(([n]) => new RegExp(`\\b${n}\\(c\\)`).test(m.check.toString())).map(([, src]) => src);
          const text = [m.check.toString(), ...helpers].join('\n');
          const used = new Set([...text.matchAll(/\bc\.(\w+)/g)].map(x => x[1]));
          for (const u of used) assert.ok(ALLOWED_C.includes(u), `c.${u}`);
          assert.ok(used.has('cmd'), 'the check pins the command');
          if (/^(node|curl)\b/.test(lastOf(m))) assert.ok(used.has('args'), 'the check pins the file or the url');
          if (/^tsc\b/.test(lastOf(m))) assert.match(text, /c\.args\.length\s*===\s*0|!c\.args\.length/, 'tsc is pinned to no arguments');
        });

        it('has a recorded outcome, and its reference gives exactly that', async () => {
          assert.ok(outcome, `OUTCOMES[${num}][${i}]`);
          const { run } = await playTerminal(ref(m), m.cmds);
          assert.equal(!!m.expectError, outcome.exitCode !== 0, 'expectError follows the exit code');
          assert.equal(run.exitCode, outcome.exitCode);
          assert.deepEqual((run.diags || []).map(d => d.code), outcome.codes || []);
          if (outcome.tests) assert.deepEqual({ ...run.tests, ...outcome.tests }, run.tests);
        });

        it('is solved by its reference files, on the final run and on the last snapshot', async () => {
          const p = await play(m, ref(m), m.cmds);
          assert.ok(p.snaps.length > 0, 'the page judges at least once');
          assert.equal(p.passes, true, JSON.stringify(p.run));
        });

        it('is not solved by its starter, its near-miss or empty .ts files', async () => {
          await never(m, m.start, m.cmds, 'the starter');
          await never(m, { ...m.start, ...m.wrong }, m.cmds, 'the near-miss');
          const emptied = Object.fromEntries(Object.entries(m.start).map(([k, v]) => [k, /\.ts$/.test(k) ? '' : v]));
          await never(m, emptied, m.cmds, 'empty .ts files');
        });

        it('is not solved by the work of the other missions', async () => {
          for (const [j, o] of ch.missions.entries()) {
            if (j === i) continue;
            const allowed = !!ALLOWED[`${id}:C${num}M${j + 1}`];
            if (!allowed) await never(m, ref(o), m.cmds, `the reference of mission ${j + 1} with this mission's commands`);
            // Two missions that run the very same commands share the case, so an entry covers it too.
            if (!(allowed && JSON.stringify(o.cmds) === JSON.stringify(m.cmds))) await never(m, ref(o), o.cmds, `the reference of mission ${j + 1} with its own commands`);
          }
        });

        it('is not solved by the terminal battery on its starter or on its reference', async () => {
          for (const [what, files] of [['starter', m.start], ['reference', ref(m)]]) {
            const cmds = [
              'ls', ...(Object.keys(files).some(k => k.startsWith('src/')) ? ['ls src'] : []),
              ...[...new Set([...Object.keys(files), ...DATA])].map(f => `cat ${f}`),
              `node -e "console.log('Wagon 4 is ready')"`, 'tsc', 'node --test',
              ...Object.keys(files).filter(k => /\.ts$/.test(k)).map(k => `node ${k}`),
            ];
            for (const c of cmds) if (what !== 'reference' || c !== lastOf(m)) await never(m, files, [c], `${c} on the ${what}`);
            for (const [j, o] of ch.missions.entries()) if (j !== i && (what !== 'reference' || JSON.stringify(o.cmds) !== JSON.stringify(m.cmds))) await never(m, files, o.cmds, `the commands of mission ${j + 1} on the ${what}`);
          }
        });

        it('prints only strings from a program run: no brace, bracket or quoted whole line', async () => {
          for (const [what, files] of [['reference', ref(m)], ['wrong', { ...m.start, ...m.wrong }]]) {
            // every command of the mission is read, not only the last: each wrap-up judges its own run, so its snapshot holds that run's output
            const { run, snaps } = await playTerminal(files, m.cmds);
            for (const r of [run, ...snaps.map(s => s.run)]) {
              if (r.cmd !== 'node' || r.args[0] === '--test') continue;
              for (const l of r.out) assert.ok(!/[{[]/.test(l) && !/^(["']).*\1$/.test(l.trim()), `${what} prints ${JSON.stringify(l)}`);
            }
          }
        });

        if (num === 16 && i === 4) {
          it('is not solved by starting the starter server, saving the typed file, then asking (the page judges what was started)', async () => {
            await never(m, m.start, ['node server.ts', { write: ['server.ts', ref(m)['server.ts']] }, 'curl http://localhost:3000/'], 'a restart-free edit');
          });
        }
        if (num === 16 && i === 5) {
          it("answers mission 5's commands with a different reply, so its check cannot pass", async () => {
            await never(CH[15].missions[4], ref(m), CH[15].missions[4].cmds, "the answer of mission 6 with mission 5's commands");
          });
        }

        it('uses world values, not foo or bar, and no loop (the quest does not teach loops)', () => {
          const text = flatFiles(m.code) + '\n' + flatFiles(m.start) + '\n' + m.hint;
          assert.match(text, /tsconfig\.json|main\.ts|src\//, 'the flattened text is not empty');
          assert.doesNotMatch(text, /\b(foo|bar|baz)\b/);
          assert.doesNotMatch(text, /\b(while|for|do)\s*[({]/);
        });
      });
    });
  });
});

describe('terminal chapters: the ALLOWED map', () => {
  it('lists only later chapter 18 references over earlier chapter 18 checks, each with a reason, and each pair is really needed', async () => {
    const ch18 = CH[17];
    for (const [k, why] of Object.entries(ALLOWED)) {
      const [a, b] = k.split(':').map(x => x.match(/^C18M(\d+)$/));
      assert.ok(a && b, `${k}: chapter 18 missions only`);
      const [m, o] = [ch18.missions[a[1] - 1], ch18.missions[b[1] - 1]];
      assert.ok(m && o, `${k} names a mission that does not exist`);
      assert.ok(+b[1] > +a[1], `${k}: the second mission must be the later one`);
      assert.ok(why.trim(), `${k}: a reason`);
      const p = await play(m, ref(o), m.cmds);
      assert.equal(p.passes, true, `${k} is stale: the later reference no longer meets the earlier check`);
    }
  });
});
