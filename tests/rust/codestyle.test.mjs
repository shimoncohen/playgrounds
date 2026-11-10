import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRust } from './harness.mjs';

// Text a page escapes shows code between backticks, so a backtick pair counts as code too (docs/tiers-guideline.md, "Code in prose").
const KEYWORDS = 'fn mut impl struct enum i32 i64 u8 u16 u32 u64 f64 usize isize'.split(' ');
const MACROS = 'println print eprintln eprint format vec panic assert assert_eq write writeln'.split(' ');
const G = '(?<![\\w§/.$-])', E = '(?![\\w/-])';
const RULES = [
  ['macro', new RegExp(`${G}(?:${MACROS.join('|')})!`)],
  ['error code', new RegExp(`${G}E\\d{4}${E}`)],
  ['keyword or type', new RegExp(`${G}(?:${KEYWORDS.join('|')})${E}`)],
  ['let binding', new RegExp(`${G}let (?:mut )?[a-z_]\\w* =`)],
  ['hole', /\{\}/],
  ['path', /\w::\w/],
  ['main call', /\bmain\(\)/],
  ['snake_case name', new RegExp(`${G}[a-z]+_[a-z_]+${E}`)],
];
const prose = (h) => String(h).replace(/<code>.*?<\/code>|<kbd>.*?<\/kbd>|<pre[^>]*>.*?<\/pre>|`[^`]*`/gs, '§').replace(/<[^>]+>/g, ' ').replace(/&(?:gt|lt|amp|quot);/g, '§');

function bareMentions(text) {
  const t = prose(text), out = [];
  for (const [what, re] of RULES) { const m = re.exec(t); if (m) out.push(`${what} "${m[0]}" in: …${t.slice(Math.max(0, m.index - 25), m.index + 35).replace(/\s+/g, ' ')}…`); }
  return out;
}

describe('bareMentions (the rust rules)', () => {
  it('flags bare code and passes coded text', () => {
    assert.equal(bareMentions('<code>println!</code> prints a line').length, 0);
    assert.equal(bareMentions('println! prints a line').length, 1);
    assert.equal(bareMentions('the error E0384 appears').length, 1);
    assert.equal(bareMentions('the error `E0384` appears').length, 0);
    assert.equal(bareMentions('add mut to it').length, 1);
    assert.equal(bareMentions('a hole {} is filled').length, 1);
    assert.equal(bareMentions('call String::from').length, 1);
    assert.equal(bareMentions('write let x = 5 here').length, 1);
    assert.equal(bareMentions('a snake_case name').length, 1);
    assert.equal(bareMentions('Let me show you. Rust starts in the main function, a hole in the wall, a macro.').length, 0);
  });
});

describe('Rust Quest text keeps code in <code>', () => {
  const RQ = loadRust();
  RQ.CH.forEach((ch, c) => {
    it(`chapter ${c + 1} intro and toolbox`, () => assert.deepEqual([ch.intro, ch.toolbox].flatMap(bareMentions), []));
    ch.missions.forEach((m, i) => {
      const texts = [m.goal, m.explain, m.hint, ...m.how, ...m.previews.map((p) => p.wording)].filter(Boolean);
      it(`${c + 1}.${i + 1} ${m.title}`, () => assert.deepEqual(texts.flatMap(bareMentions), []));
    });
  });
  it('mission feedback sentences', () => {
    const sentences = [];
    for (const ch of RQ.CH) for (const m of ch.missions) {
      for (const p of [m.answer, ...m.alts, m.starter, ...m.wrong.map((w) => w.src), ...m.lazy.map((w) => w.src)]) {
        const r = RQ.runMission(m, p);
        if (typeof r === 'string') sentences.push(r);
      }
    }
    assert.ok(sentences.length > 10);
    assert.deepEqual(sentences.flatMap(bareMentions), []);
  });
  it('unsupported hints and error tips', () => {
    assert.deepEqual(Object.values(RQ.diag.UNSUPPORTED).flatMap(bareMentions), []);
    assert.deepEqual(Object.values(RQ.diag.ERRORS).flatMap((e) => bareMentions(e.tip)), []);
  });
  it('field guide what and example notes', () => assert.deepEqual([...RQ.GUIDE].flatMap((g) => [g.what, ...g.ex.map(([, n]) => n)]).flatMap(bareMentions), []));
  it('quick-fire questions, answers and explanations', () => assert.deepEqual([...RQ.QF].flatMap((q) => [q.c, q.a, ...q.w, q.why]).flatMap(bareMentions), []));
});
