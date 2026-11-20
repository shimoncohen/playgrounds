import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptContent, loadScriptContent } from '../content-loader.mjs';
import { createSession } from './harness.mjs';
import { projectRun, flatFiles } from './project-harness.mjs';

const { CH } = loadTypescriptContent();
const SCRIPT = loadScriptContent().CH;

// outcome per mission, measured against typescript@5.9.3: an array of diagnostic codes (the mission expects the
// error), 'clean' (compiles and runs), or a run-time error name (compiles clean, the check reads the error).
const META = [
  { name: 'Types and inference', badge: 'Booking Stamp', missions: 7, outcomes: [[2322], [2322], 'TypeError', [18046], [7006], [2352], 'clean'] },
  { name: 'Unions and narrowing', badge: 'Switch Lever', missions: 6, outcomes: ['clean', 'clean', 'clean', 'clean', 'clean', [2322]] },
  { name: 'Aliases and interfaces', badge: 'Ticket Blank', missions: 7, outcomes: ['clean', 'clean', [2540], [2353], 'clean', 'clean', 'clean'] },
  { name: 'Typed functions', badge: 'Brass Whistle', missions: 7, outcomes: ['clean', 'clean', 'clean', 'clean', 'clean', 'clean', 'clean'] },
  { name: 'Arrays and tuples', badge: 'Wagon Roster', missions: 6, outcomes: [[2345], [2339], 'clean', 'clean', 'clean', [2493]] },
  { name: 'Generics', badge: 'Coupling Pin', tier: 'intermediate', missions: 6, outcomes: ['clean', [2322], [2345], 'clean', 'clean', [1064]] },
  { name: 'Classes and access modifiers', badge: "Brakeman's Padlock", tier: 'intermediate', missions: 6, outcomes: [[2564], [2341], [2445], 'clean', [2515, 2511], 'clean'] },
  { name: 'Literal types and enums', badge: 'Destination Dial', tier: 'intermediate', missions: 6, outcomes: [[2540], [2339], [2322], 'clean', 'clean', 'clean'] },
  { name: 'Utility types', badge: 'Toolbelt Roll', tier: 'intermediate', missions: 6, outcomes: ['clean', [2741], [2540], [2741], [2353], [2353]] },
  { name: 'Modules', badge: 'Manifest Folder', tier: 'intermediate', mode: 'project', missions: 6, outcomes: ['clean', 'clean', [2305], 'clean', [2307], 'clean'] },
];

// A "try it first" line in a how step names a code; each is measured here: [chapter, mission, source, codes].
const TRIES = [
  [3, 5, 'interface Passenger extends Ticket {\n  name: string\n}\nconst rider: Passenger = { name: "Mumbles" }', [2741]],
  [3, 6, 'type Stamped = Ticket & { stamp: string }\nconst sealed: Stamped = { stamp: "Ashford" }', [2322]],
  [4, 1, 'function seatsLeft(total: number, taken: number): number {\n  return "none"\n}', [2322]],
  [4, 2, 'function board(name: string, seat?: string, row: number = 1) {\n  console.log(name, seat, row)\n}\nboard("Mumbles", "12A", 2, 9)', [2554]],
  [4, 3, 'function reserve(...seats: number[]) {\n  console.log(seats.length)\n}\nreserve(12, "13")', [2345]],
  [4, 4, 'function charge(price: number, discount: (amount: number) => number) {\n  return discount(price)\n}\nconsole.log(charge(20, (amount: string) => 5))', [2345]],
  [4, 5, 'function announce(stop: string): void {\n  console.log("Next stop: " + stop)\n}\nconst said: string = announce("Ashford")', [2322]],
  [4, 6, 'function derail(reason: string): never {\n  return reason\n}', [2322]],
  [5, 3, 'let seat: [number, string] = ["Mumbles", 4]', [2322, 2322]],
  [5, 5, 'let seat: [number, string, string?] = [4, "Mumbles", "Window", "Extra"]', [2322]],
  [6, 4, 'interface Crate<T = string> {\n  item: T\n}\nconst plain: Crate = { item: 7 }', [2322]],
  [6, 5, 'const ready: Promise<string> = Promise.resolve("Ashford")\nready.then((stop: number) => console.log(stop))', [2345]],
  [8, 5, 'type Fares = { Ashford: string | number; Barlow: string | number }\nconst fares = { Ashford: 4 } satisfies Fares', [1360]],
  [9, 1, 'interface Booking {\n  stop: string\n  wagon: number\n}\nconst change: Booking = { wagon: 5 }', [2741]],
];
// logs is read only by the chapter 8 missions that print an enum or a table: their patterns hold under the harness and the page rendering (tested below)
const ALLOWED_C = ['src', 'diags', 'ok', 'err', 'has', 'types', 'logs'];
// a project check reads the run that just happened (the snapshot given to checkProject, its diagnostics, emitted js and printed lines), never the live files
const ALLOWED_P = ['files', 'diags', 'js', 'ok', 'out', 'err'];

const tsc = createRequire(import.meta.url)('typescript');
// The page's own formatter, cut out of app.js and run in vm: fmtArgs, toText and what they call are the real functions.
// The stub document only turns the html string into its text, which is all toText asks of a DOM.
const appSrc = fs.readFileSync(new URL('../../programming/typescript-quest/app.js', import.meta.url), 'utf8');
const cut = (from, to) => appSrc.slice(appSrc.indexOf(from), appSrc.indexOf(to));
const pageFmt = vm.runInNewContext(
  `${cut('const esc=', 'const TSQ=')}${cut('const promState', 'function tableHTML')}\n({ fmtArgs, toText })`,
  { document: { createElement: () => ({ set innerHTML(h) { this.textContent = h.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); } }) } });
const pageLogs = src => {
  const lines = [];
  const realm = vm.createContext({ console: { log: (...a) => lines.push(pageFmt.toText(pageFmt.fmtArgs(a))) } });
  vm.runInContext(tsc.transpileModule(src, { compilerOptions: { target: tsc.ScriptTarget.ES2020 } }).outputText, realm);
  return lines;
};

const play = (m, src) => {
  const s = createSession();
  if (m.pre) s.run(m.pre);
  const rec = s.run(src);
  return { s, rec, passed: !!m.check(s.ctx(rec)) };
};

describe('typescript-quest chapters', () => {
  it('the metadata table covers every loaded chapter, in order', () => {
    assert.deepEqual(CH.map(c => c.name), META.map(x => x.name));
  });

  it('the "try it first" lines name the codes the compiler reports', () => {
    for (const [c, mi, src, codes] of TRIES) {
      const m = CH[c - 1].missions[mi - 1];
      const s = createSession();
      if (m.pre) s.run(m.pre);
      assert.deepEqual(Array.from(s.run(src).diags, d => d.code), codes, `chapter ${c} mission ${mi}`);
    }
  });

  it('chapter 2 "Is it there?" accepts an if, a conditional or an && guard, and not an unguarded read', () => {
    const m = CH[1].missions[2];
    const fn = body => `function stampLength(note: string | undefined) {\n  ${body}\n}`;
    for (const body of ['return note !== undefined ? note.length : 0', 'return note === undefined ? 0 : note.length', 'return note && note.length', 'return note !== undefined && note.length', 'if (note) {\n    return note.length\n  }'])
      assert.equal(play(m, fn(body)).passed, true, body);
    for (const body of ['return note?.length', 'return note!.length', 'return note.length'])
      assert.equal(play(m, fn(body)).passed, false, body);
  });

  const byTitle = t => CH.flatMap(c => c.missions).find(m => m.title === t);

  it('"Enum or constants" needs both tables printed by name, not any as const plus two look-alike lines', () => {
    const m = byTitle('Enum or constants');
    const head = 'enum Stop {\n  Ashford,\n  Barlow\n}\nconst Route = { Ashford: 0, Barlow: 1 } as const\n';
    assert.equal(play(m, head + 'console.log(Stop)\nconsole.log(Route)').passed, true);
    assert.equal(play(m, head + 'console.log("Ashford 0 0 Ashford")\nconsole.log("Ashford 0")').passed, false, 'text lines');
    assert.equal(play(m, head + 'console.log(Stop)\nconsole.log("Ashford 0")').passed, false, 'Route not printed');
    assert.equal(play(m, head + 'console.log(Stop, Route)').passed, false, 'one call');
  });

  it('"One coupling, any cargo" needs the generic function itself called with a text and a number', () => {
    const m = byTitle('One coupling, any cargo');
    const fn = 'function carry<T>(cargo: T): T {\n  return cargo\n}\n';
    assert.equal(play(m, fn + 'console.log(carry("Ashford"), carry(12))').passed, true);
    assert.equal(play(m, fn + 'console.log("a")\nconsole.log(1)').passed, false, 'carry never called');
    assert.equal(play(m, fn + 'console.log(carry("a"))').passed, false, 'no number call');
  });

  it('a check that reads c.logs passes the reference and not the wrong answer under both the harness and the page rendering', () => {
    const readers = CH.flatMap(c => c.missions).filter(m => /\bc\.logs\b/.test(m.check.toString()));
    assert.ok(readers.length >= 2, 'no mission reads c.logs');
    const onPage = (m, src) => !!m.check({ src, diags: [], ok: true, err: null, logs: pageLogs(src), has: () => false, types: [] });
    for (const m of readers) {
      const ref = play(m, m.code);
      assert.notDeepEqual(pageLogs(m.code), ref.rec.logs, `${m.title}: the page and the harness print the same lines, so the test proves nothing`);
      assert.equal(ref.passed, true, `${m.title}: harness lines ${JSON.stringify(ref.rec.logs)}`);
      assert.equal(onPage(m, m.code), true, `${m.title}: page lines ${JSON.stringify(pageLogs(m.code))}`);
      assert.equal(play(m, m.wrong).passed, false, `${m.title}: wrong, harness`);
      assert.equal(onPage(m, m.wrong), false, `${m.title}: wrong, page`);
      assert.equal(onPage(m, 'void 0'), false, `${m.title}: lazy, page`);
    }
  });

  META.forEach((meta, ci) => {
    const ch = CH[ci];
    describe(`chapter ${ci + 1}: ${meta.name}`, () => {
      it(`is ${meta.missions} ${meta.tier || 'beginner'} ${meta.mode || 'ts'} missions with a story, intro, badge and learned list`, () => {
        assert.equal(ch.badge, meta.badge);
        assert.equal(ch.tier, meta.tier || 'beginner');
        assert.equal(ch.mode, meta.mode || 'ts');
        assert.equal(ch.missions.length, meta.missions);
        assert.equal(meta.outcomes.length, meta.missions);
        for (const k of ['story', 'intro']) assert.ok(ch[k].trim(), k);
        assert.doesNotMatch(ch.intro, /<[a-z/]/i, 'intro is escaped by the page: use backticks for code, no HTML tags');
        assert.ok(ch.learned.length > 0);
        // a goal is escaped, so a generic like `Pair<A, B>` is fine there; only real tag names are refused from chapter 6 on
        const GOAL_TAG = ci < 5 ? /<[a-z/]/i : /<\/?(b|i|em|strong|code|kbd|pre|p|a|br|span|div|ul|li)\b/;
        for (const m of ch.missions) assert.doesNotMatch(m.goal, GOAL_TAG, `goal of "${m.title}" is escaped by the page: backticks, no HTML tags`);
        // hints are raw HTML: from chapter 6 on a generic's angle brackets are written as &lt; and &gt;
        if (ci >= 5) for (const m of ch.missions) assert.doesNotMatch(m.hint, /<[a-z/]/i, `hint of "${m.title}": raw HTML, write < as &lt;`);
      });

      it('suggests Script Quest chapters by their rail number and name', () => {
        assert.ok(ch.first.length > 0);
        for (const [n, name] of ch.first) assert.equal(SCRIPT[n - 1].name, name, `Script chapter ${n}`);
      });

      ch.missions.forEach((m, i) => {
        const outcome = meta.outcomes[i];
        if (meta.mode === 'project') {
          const ref = { ...m.start, ...m.code };
          describe(`mission ${i + 1}: ${m.title} (project)`, () => {
            it('has every field, and its check reads only the allowed run members', () => {
              for (const k of ['title', 'goal', 'explain', 'hint', 'open']) assert.equal(typeof m[k], 'string', k);
              for (const k of ['start', 'code', 'wrong']) assert.ok(m[k] && typeof m[k] === 'object', k);
              assert.ok(m.open in m.start, 'open names a starter file');
              assert.equal(typeof m.check, 'function');
              assert.ok(Array.isArray(m.anat) && m.anat.length > 0, 'anat');
              assert.ok(Array.isArray(m.how) && m.how.length >= 3 && m.how.length <= 5, 'how: 3 to 5 steps');
              assert.match(m.how[0], /^The whole (line|code)/, 'how step 1 says what the whole line does');
              const used = new Set([...m.check.toString().matchAll(/\bc\.(\w+)/g)].map(x => x[1]));
              for (const u of used) assert.ok(ALLOWED_P.includes(u), `c.${u}`);
            });

            it('is solved by its reference files', async () => {
              const r = await projectRun(ref);
              assert.equal(!!m.check(r), true, JSON.stringify(r));
            });

            it(Array.isArray(outcome) ? `reports TS${outcome.join(', TS')}` : 'compiles clean and runs', async () => {
              const r = await projectRun(ref);
              assert.equal(!!m.expectError, Array.isArray(outcome));
              if (Array.isArray(outcome)) assert.deepEqual(r.diags.map(d => d.code), outcome);
              else {
                assert.equal(r.diags.length, 0);
                assert.equal(r.ok, true);
              }
            });

            it('is not solved by its starter files, its near-miss or an empty main.ts', async () => {
              assert.equal(!!m.check(await projectRun(m.start)), false, 'starter');
              assert.equal(!!m.check(await projectRun({ ...m.start, ...m.wrong })), false, 'wrong');
              assert.equal(!!m.check(await projectRun({ ...m.start, 'main.ts': '' })), false, 'empty main.ts');
            });

            it('prints only strings: no brace, bracket or quoted whole line, so the page and the harness agree', async () => {
              for (const [what, files] of [['reference', ref], ['wrong', { ...m.start, ...m.wrong }]]) {
                const r = await projectRun(files);
                for (const l of r.out) assert.ok(!/[{[]/.test(l) && !/^(["']).*\1$/.test(l.trim()), `${what} prints ${JSON.stringify(l)}`);
              }
            });

            it('uses world values, not foo or bar, and no loop (the quest does not teach loops), over the files as one text', () => {
              const text = flatFiles(m.code) + '\n' + flatFiles(m.start) + '\n' + m.hint;
              assert.match(text, /main\.ts/, 'the flattened text is not empty');
              assert.doesNotMatch(text, /\b(foo|bar|baz)\b/);
              assert.doesNotMatch(text, /\b(while|for|do)\s*[({]/);
            });
          });
          return;
        }
        describe(`mission ${i + 1}: ${m.title}`, () => {
          it('has every field, and its check reads only the allowed context members', () => {
            for (const k of ['title', 'goal', 'code', 'explain', 'hint', 'wrong']) assert.equal(typeof m[k], 'string', k);
            assert.equal(typeof m.check, 'function');
            assert.ok(Array.isArray(m.anat) && m.anat.length > 0, 'anat');
            assert.ok(Array.isArray(m.how) && m.how.length >= 3 && m.how.length <= 5, 'how: 3 to 5 steps');
            assert.match(m.how[0], /^The whole (line|code)/, 'how step 1 says what the whole line does');
            const used = new Set([...m.check.toString().matchAll(/\bc\.(\w+)/g)].map(x => x[1]));
            for (const u of used) assert.ok(ALLOWED_C.includes(u), `c.${u}`);
          });

          it('declares what it reuses: after its pre, every need is in scope', () => {
            assert.equal(!!m.pre, !!m.need, 'pre and need come together');
            if (!m.pre) return;
            const s = createSession();
            s.run(m.pre);
            const ctx = s.ctx(s.run('void 0'));
            for (const n of m.need) {
              if (n[0] === '@') assert.ok(ctx.types.includes(n.slice(1)), `type ${n}`);
              else assert.ok(ctx.has(n), `name ${n}`);
            }
          });

          it('is solved by its reference answer', () => {
            const { rec, passed } = play(m, m.code);
            assert.equal(passed, true, JSON.stringify(rec));
          });

          it(Array.isArray(outcome) ? `reports TS${outcome.join(', TS')}` : outcome === 'clean' ? 'compiles clean and runs' : `compiles clean and fails with ${outcome}`, () => {
            const { rec } = play(m, m.code);
            assert.equal(!!m.expectError, Array.isArray(outcome));
            if (Array.isArray(outcome)) assert.deepEqual(Array.from(rec.diags, d => d.code), outcome);
            else {
              assert.equal(rec.diags.length, 0);
              if (outcome === 'clean') assert.equal(rec.ok, true);
              else assert.equal(rec.err.name, outcome);
            }
          });

          it('is not solved by its near-miss or by a lazy line', () => {
            assert.equal(play(m, m.wrong).passed, false, 'wrong');
            assert.equal(play(m, 'void 0').passed, false, 'void 0');
          });

          it('uses world values, not foo or bar, and no loop (the quest does not teach loops)', () => {
            assert.doesNotMatch(m.code, /\b(foo|bar|baz)\b/);
            assert.doesNotMatch(m.code + '\n' + m.hint, /\b(while|for|do)\s*[({]/);
          });
        });
      });
    });
  });
});
