import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadRust, ROOT } from './harness.mjs';

const RQ = loadRust();
const DIR = path.join(ROOT, 'programming', 'rust-quest');

// Shipped mission titles, in order. Content is append only: saves are keyed '<chapter>.<mission>', so a new mission goes
// at the end of its chapter and a new chapter after the last. Add to this list; never edit or reorder it.
const SHIPPED = [['Say hello', 'Fill the hole', 'Name a value with let', 'Why can\'t I change it?', 'Lose a life', 'Same name, new variable'],
  ['Say what kind of number', 'Numbers with a decimal point', 'Change a type with as', 'Keep values together in a tuple', 'Line values up in an array', 'A value that never changes', 'A number too big for its type', 'When a program panics'],
  ['Write your own function', 'The semicolon that ate the value', 'Choose with if and else', 'An if that gives back a value', 'Repeat until you break out', 'Count down with while', 'Walk through a range with for', 'A typo in a name'],
  ['Put text on the heap', 'One owner at a time', 'Numbers just copy', 'Copy a String on purpose', 'Take it in, give it back', 'Free a String early'],
  ['Lend instead of give', 'Borrow it to change it', 'Many readers at once', 'Readers first, then the writer', 'Take a slice', 'A function that hands back a slice', 'A slice keeps its String borrowed', 'Which input does it borrow from?', 'A reference to something that is gone']];
const want = (m) => m.expect || 'ok';

describe('chapter and mission ids are append only', () => {
  it('every shipped mission still sits at its key', () => {
    SHIPPED.forEach((titles, ci) => titles.forEach((t, mi) => assert.equal(RQ.CH[ci]?.missions[mi]?.title, t, `${ci}.${mi}`)));
  });
  it('chapters have the shape the page expects', () => {
    RQ.CH.forEach((ch) => {
      for (const k of ['name', 'badge', 'intro', 'toolbox']) assert.ok(ch[k], k);
      assert.ok(ch.learned.length > 0 && ch.missions.length > 0);
    });
  });
});

RQ.CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => {
  const key = `${ci}.${mi}`;
  describe(`mission ${key} ${m.title}`, () => {
    it('has its card text: how has 3 to 5 steps and the first holds <code>', () => {
      for (const k of ['goal', 'explain', 'hint']) assert.ok(m[k], k);
      assert.ok(m.how.length >= 3 && m.how.length <= 5, `${m.how.length} how steps`);
      assert.match(m.how[0], /<code>/);
      assert.ok(['write', 'fix'].includes(m.kind));
    });
    it('expect is absent or panic', () => assert.ok(m.expect === undefined || m.expect === 'panic'));
    it('the answer passes its own check', () => assert.equal(RQ.runMission(m, m.answer), true));
    it('at least one alternative valid answer passes, and none is unsupported or internal', () => {
      assert.ok(m.alts.length >= 1);
      for (const a of [m.answer, ...m.alts]) {
        const { c, result } = RQ.evalMission(m, a);
        assert.equal(c.status, want(m), a);
        assert.equal(result, true, a);
      }
    });
    it('every wrong and lazy answer fails, and fails for its wrongWhy', () => {
      assert.ok(m.wrong.length >= 1 && m.lazy.length >= 1);
      for (const w of [...m.wrong, ...m.lazy]) {
        const { c, result } = RQ.evalMission(m, w.src);
        assert.notEqual(result, true, w.src);
        assert.equal(typeof result, 'string');
        if (w.wrongWhy === 'check') assert.ok(['ok', want(m)].includes(c.status), `${w.src} should compile and fail the check`);
        else assert.equal(c.hasError(w.wrongWhy), true, `${w.src} should fail with ${w.wrongWhy}`);
      }
    });
    it('the starter does not pass; a fix starter fails with starterErr', () => {
      assert.ok(m.starter);
      assert.notEqual(RQ.runMission(m, m.starter), true);
      const starter = RQ.run(RQ.missionPrograms(m).find((p) => p.role === 'starter').src);
      if (m.kind === 'fix') {
        assert.ok(m.starterErr);
        assert.equal(starter.hasError(m.starterErr), true);
      } else assert.ok(['ok', want(m)].includes(starter.status));
    });
    it('every program is modeled: none returns unsupported or internal', () => {
      for (const p of RQ.missionPrograms(m)) assert.ok(['ok', 'error', ...(m.expect ? [m.expect] : [])].includes(RQ.run(p.src).status), p.id);
    });
    it('the answer has the expected status, and on a mission that expects no panic nothing panics', () => {
      assert.equal(RQ.evalMission(m, m.answer).c.status, want(m));
      if (!m.expect) for (const p of RQ.missionPrograms(m)) assert.notEqual(RQ.run(p.src).status, 'panic', p.id);
    });
  });
}));

describe('the mission runner', () => {
  const m = RQ.CH[0].missions[0];
  it('an empty editor, unsupported code and engine bugs never complete a mission', () => {
    assert.equal(typeof RQ.runMission(m, ''), 'string');
    assert.match(RQ.runMission(m, 'struct S;\nfn main() {}'), /does not model `struct`/);
    assert.match(RQ.runMission(m, 'fn main() {'), /would not accept/);
  });
  it('a hidden harness is appended to the learner code', () => {
    const fake = { harness: 'fn main() { println!("{}", helper()); }', answer: 'fn helper() -> i32 { 3 }', check: (c) => (c.out() === '3\n' ? true : 'no') };
    assert.equal(RQ.runMission(fake, fake.answer), true);
    assert.equal(RQ.runMission(fake, 'fn helper() -> i32 { 4 }'), 'no');
  });
  it('a panic on a mission that does not expect one gives the panic text, not the check', () => {
    const fake = { answer: '', check: () => true };
    const src = 'fn add(a: u8, b: u8) -> u8 { a + b }\nfn main() { println!("{}", add(250, 10)); }';
    assert.equal(RQ.runMission(fake, src), 'The program stopped with a panic: attempt to add with overflow (line 1).');
    assert.equal(RQ.runMission({ ...fake, expect: 'panic' }, src), true);
  });
  it('missionPrograms lists the answer, starter, alts, wrong and lazy programs with unique ids', () => {
    const ps = RQ.missionPrograms();
    assert.equal(new Set(ps.map((p) => p.id)).size, ps.length);
    assert.deepEqual([...new Set(ps.map((p) => p.role))].sort(), ['alt', 'answer', 'lazy', 'starter', 'wrong']);
    assert.equal(RQ.missionPrograms(m).length, 1 + 1 + m.alts.length + m.wrong.length + m.lazy.length);
  });
});

describe('extras', () => {
  it('ranks start at 0, rise, and have distinct titles', () => {
    assert.equal(RQ.RANKS[0][0], 0);
    RQ.RANKS.forEach((r, i) => { if (i) assert.ok(r[0] > RQ.RANKS[i - 1][0]); });
    assert.equal(new Set(RQ.RANKS.map((r) => r[1])).size, RQ.RANKS.length);
  });
  it('quick-fire has at least 3 questions per chapter so far, each with 3 wrong answers', () => {
    RQ.CH.forEach((_, ci) => assert.ok(RQ.QF.filter((q) => q.ch === ci).length >= 3, `chapter ${ci}`));
    for (const q of RQ.QF) { assert.ok(RQ.CH[q.ch]); assert.equal(q.w.length, 3); assert.ok(!q.w.includes(q.a)); assert.ok(q.c && q.why); }
  });
  it('the field guide has at least one entry per chapter', () => {
    RQ.CH.forEach((_, ci) => assert.ok(RQ.GUIDE.filter((g) => g.ch === ci).length >= 1, `chapter ${ci}`));
    for (const g of RQ.GUIDE) { assert.ok(RQ.CH[g.ch] && g.c && g.what); for (const [code] of g.ex) assert.ok(code.includes('fn main')); }
  });
  it('every guide example runs: ok, or the error it is there to show', () => {
    for (const g of RQ.GUIDE) for (const [code, , declared] of g.ex) assert.ok(['ok', 'error', ...(declared === 'panic' ? ['panic'] : [])].includes(RQ.run(code).status), code);
  });
  it('a guide example that panics says so, and one that says so does panic', () => {
    for (const g of RQ.GUIDE) for (const [code, , declared] of g.ex) assert.equal(RQ.run(code).status === 'panic', declared === 'panic', code);
  });
  it('the guide explains every new error and lint id and panics', () => {
    const text = RQ.GUIDE.map((g) => g.c + g.what).join(' ');
    for (const w of ['E0308', 'E0425', 'E0382', 'E0502', 'E0596', 'E0106', 'E0515', 'arithmetic_overflow', 'overflowing_literals', 'unconditional_panic', 'panic']) assert.ok(text.includes(w), w);
  });
});

describe('inlined files', () => {
  it('contain no </script or </style, so tools/build.py can inline them', () => {
    const files = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(js|css)$/.test(e.name) && files.push(path.join(d, e.name))));
    walk(DIR);
    assert.ok(files.length >= 8);
    for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /<\/(script|style)/i, f);
  });
});
