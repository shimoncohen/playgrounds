import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptContent, loadScriptContent } from '../content-loader.mjs';
import { createSession } from './harness.mjs';

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
];
const ALLOWED_C = ['src', 'diags', 'ok', 'err', 'has', 'types'];

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

  META.forEach((meta, ci) => {
    const ch = CH[ci];
    describe(`chapter ${ci + 1}: ${meta.name}`, () => {
      it(`is ${meta.missions} beginner ts missions with a story, intro, badge and learned list`, () => {
        assert.equal(ch.badge, meta.badge);
        assert.equal(ch.tier, 'beginner');
        assert.equal(ch.mode, 'ts');
        assert.equal(ch.missions.length, meta.missions);
        assert.equal(meta.outcomes.length, meta.missions);
        for (const k of ['story', 'intro']) assert.ok(ch[k].trim(), k);
        assert.doesNotMatch(ch.intro, /<[a-z/]/i, 'intro is escaped by the page: use backticks for code, no HTML tags');
        assert.ok(ch.learned.length > 0);
        for (const m of ch.missions) assert.doesNotMatch(m.goal, /<[a-z/]/i, `goal of "${m.title}" is escaped by the page: backticks, no HTML tags`);
      });

      it('suggests Script Quest chapters by their rail number and name', () => {
        assert.ok(ch.first.length > 0);
        for (const [n, name] of ch.first) assert.equal(SCRIPT[n - 1].name, name, `Script chapter ${n}`);
      });

      ch.missions.forEach((m, i) => {
        const outcome = meta.outcomes[i];
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
