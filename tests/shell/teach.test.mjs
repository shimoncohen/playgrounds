// Shell Quest, "teach before use" (AGENTS.md rule 12): a key term must not appear in any mission text before the mission that teaches it
// (or defines it in place), and Quick-fire only asks about commands whose chapter the learner has finished.
// app.js is one DOM-bound IIFE, so qfOpen is loaded from its source line.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadShell } from './harness.mjs';

const SQ = loadShell();
const CH = SQ.content.chapters, QF = SQ.content.quickfire, GUIDE = SQ.content.guide;
const appSrc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shell-quest', 'app.js'), 'utf8');
const line = appSrc.split('\n').find((l) => l.startsWith('const qfOpen='));
assert.ok(line, 'content marker moved: const qfOpen=');
const qfOpen = new Function('QF', 'CH', line + '\nreturn qfOpen;')(QF, CH);

const plain = (t) => String(t).replace(/<\/?[a-z][^>]*>/gi, '').replace(/`/g, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
/* everything a learner reads on a mission card (starter comments and the answer key are not teaching text) */
const cardText = (m) => plain([m.title, m.goal, m.note, m.hint, m.explain, ...(m.how || []), ...(m.anat || []).map((a) => a[0] + ' ' + (a[2] || '')),
  ...(m.steps || []).map((s) => [s.title, s.goal, s.hint, s.explain, ...(s.how || [])].join(' '))].filter(Boolean).join('\n'));
const flat = [];
CH.forEach((c, ci) => c.missions.forEach((m, mi) => flat.push({ ci, mi, text: cardText(m) })));
const before = (ci, mi) => flat.filter((x) => x.ci < ci || (x.ci === ci && x.mi < mi));

// term -> [regex that uses it, chapter, mission (0-based) that first teaches it or defines it in place (its own card may use it)]
const FIRST = {
  clear: [/\bclear\b/, 0, 1],
  option: [/\boptions?\b/, 0, 0],
  '-z': [/(^|\s)-z\b/, 11, 2],
  '||': [/\|\|/, 11, 0],
  'not (!)': [/\[ ! /, 11, 2],
  'bash file': [/\bbash scripts\//, 11, 6],
  nano: [/\bnano\b/, 11, 6],
  'shebang': [/#!\/bin\/bash/, 11, 6],
  shift: [/\bshift\b/, 13, 2],
  stderr: [/\bstderr\b/, 13, 6],
  printf: [/\bprintf\b/, 15, 6],
  'regular expression': [/regular expression/i, 15, 2],
  'status code': [/status code/i, 15, 4],
  CSV: [/\bCSV\b/, 15, 6],
  true: [/\|\| true/, 18, 6],
  'grep --': [/grep -- /, 18, 6],
};
for (const [term, [re, ci, mi]] of Object.entries(FIRST)) {
  describe(`"${term}"`, () => {
    it(`is not used before ${ci}.${mi}, where it is introduced`, () => {
      for (const x of before(ci, mi)) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}" before it is taught at ${ci}.${mi}`);
      assert.ok(flat.some((x) => x.ci === ci && x.mi === mi && re.test(x.text)), `${ci}.${mi} should be where "${term}" is introduced`);
    });
    it('is not asked in quick-fire before its chapter is done', () => {
      QF.forEach((q) => { if (re.test(q[0] + ' ' + q[1][0])) assert.ok(q.ch >= ci, `"${q[0]}" needs chapter ${ci}`); });
    });
  });
}

describe('terms are defined in place the first time they appear', () => {
  const card = (c, i) => plain(CH[c].missions[i].goal + ' ' + CH[c].missions[i].explain + ' ' + (CH[c].missions[i].how || []).join(' '));
  it('clear (0.1)', () => assert.match(card(0, 1), /clear<\/code> wipes it|clear wipes it/));
  it('options and arguments are named before 0.0 uses them (0.0)', () => assert.match(card(0, 0), /small switches called options, and the things it works on, called arguments/));
  it('-z, || and ! (11.0, 11.2)', () => {
    assert.match(card(11, 0), /\|\| runs the next command only if the first one failed/);
    assert.match(card(11, 2), /-z is true when a piece of text is empty/);
    assert.match(card(11, 2), /leading ! flips any test/);
  });
  it('nano, bash file, the editor panel and #! (11.6)', () => {
    assert.match(card(11, 6), /nano is a small text editor that opens in a panel beside the terminal/);
    assert.match(card(11, 6), /bash followed by a file name runs that file as a script/);
    assert.match(card(11, 6), /Save writes the file, Save & run also runs it, and the Arguments box/);
    assert.match(card(11, 6), /#!\/bin\/bash names the program that runs the file, and lines that start with # are comments/);
  });
  it('shift (13.2)', () => assert.match(card(13, 2), /shift drops the first argument, so the old \$2 becomes \$1/));
  it('printf, regular expression, CSV (15.6)', () => {
    assert.match(card(15, 6), /printf prints text from a format/);
    assert.match(card(15, 6), /regular expression \(a pattern written between slashes/);
    assert.match(card(15, 6), /CSV file \(comma-separated values\)/);
  });
  it('status code and request (15.4, 15.0)', () => {
    assert.match(card(15, 4), /status code \(the number such as 200 or 404 that says how the request went\)/);
    assert.match(card(15, 0), /one request to the village server/);
  });
  it('true, false and -- (17.4, 18.0, 18.6)', () => {
    assert.match(card(18, 0), /false is a command that does nothing and fails with status 1/);
    assert.match(card(18, 6), /true is a command that does nothing and succeeds/);
    assert.match(card(18, 6), /-- in grep -- "\$level" means options end here/);
  });
  it('6.5 no longer points at ls -l before 9.0 teaches it', () => {
    assert.doesNotMatch(card(6, 5), /ls -l/);
    assert.doesNotMatch(card(6, 5), /rwx/);
  });
});

// ---- quick-fire: every question is tagged with the chapter that teaches its command, and gated by saved progress
const sig = (q) => {
  if (/^Clear the screen/.test(q[0])) return 'clear';
  if (/NAME is empty/.test(q[0])) return '-z';
  if (/^Drop the first argument/.test(q[0])) return 'shift';
  if (/^Open scripts\//.test(q[0])) return 'nano';
  const t = q[1][0].split(' ')[0];
  return t.startsWith('./') ? './' : /^\w+=/.test(t) ? 'NAME=' : /^\w+\(\)$/.test(t) ? 'name()' : t;
};
describe('quick-fire tags', () => {
  it('there is exactly one chapter tag per question, and it is a real chapter of the question\'s own tier', () => {
    assert.ok(QF.length >= 100);
    for (const q of QF) {
      assert.ok(Number.isInteger(q.ch) && q.ch >= 0 && q.ch < CH.length, `bad chapter on "${q[0]}"`);
      assert.equal(CH[q.ch].tier, q[2] || 'beginner', `"${q[0]}" is tagged chapter ${q.ch}, which is in another tier`);
    }
  });
  it('the chapter has already taught the command (its first mention in a goal or answer is on or before it)', () => {
    for (const q of QF) {
      const s = sig(q);
      const re = s === 'NAME=' ? /\b[A-Za-z_]\w*=/ : s === 'name()' ? /\w+\(\)/ : s === 'nano' || s === 'shift' || s === 'clear' || s === '-z' ? FIRST[s][0] : new RegExp('(^|[^\\w-])' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const first = s in FIRST ? { ci: FIRST[s][1], mi: FIRST[s][2] }
        : (() => { for (let ci = 0; ci < CH.length; ci++) for (let mi = 0; mi < CH[ci].missions.length; mi++) { const m = CH[ci].missions[mi]; if (re.test(plain(m.goal) + '\n' + plain([].concat(m.answer || '').join('\n')))) return { ci, mi }; } return null; })();
      assert.ok(first, `"${q[0]}" (${s}) is taught by no mission`);
      assert.ok(first.ci <= q.ch, `"${q[0]}" (${s}) is first taught at ${first.ci}.${first.mi}, tagged chapter ${q.ch}`);
    }
  });
  it('clear, -z and shift are tagged with the chapters whose missions now define them', () => {
    const at = (re) => QF.find((q) => re.test(q[0])).ch;
    assert.equal(at(/^Clear the screen/), 0);
    assert.equal(at(/NAME is empty/), 11);
    assert.equal(at(/^Drop the first argument/), 13);
  });
});

const doneThrough = (n) => { const d = {}; for (let c = 0; c < n; c++) CH[c].missions.forEach((_, i) => (d[c + '.' + i] = true)); return d; };
describe('quick-fire gating', () => {
  it('nothing is open on a fresh save', () => {
    assert.equal(qfOpen({}).length, 0);
    assert.equal(qfOpen(undefined).length, 0);
  });
  it('chapter 1 alone opens only what it teaches (pwd, ls, ls -a, cd, cat and clear)', () => {
    const open = qfOpen(doneThrough(1));
    assert.ok(open.length >= 7 && open.every((q) => q.ch === 0));
    assert.ok(open.some((q) => q[1][0] === 'pwd') && open.some((q) => q[1][0] === 'clear'));
  });
  it('only questions whose chapter is done are offered, and each chapter adds its own', () => {
    for (let n = 0; n <= CH.length; n++) {
      const open = qfOpen(doneThrough(n));
      for (const q of open) assert.ok(q.ch < n, `chapter ${q.ch} is not done but is offered`);
      assert.equal(open.length, QF.filter((q) => q.ch < n).length);
    }
    assert.equal(qfOpen(doneThrough(CH.length)).length, QF.length);
  });
  it('-z, shift and the editor questions stay locked until the chapter that teaches them is done', () => {
    const texts = (n) => qfOpen(doneThrough(n)).map((q) => q[0]).join('\n');
    assert.doesNotMatch(texts(11), /NAME is empty/);
    assert.match(texts(12), /NAME is empty/);
    assert.doesNotMatch(texts(13), /Drop the first argument/);
    assert.match(texts(14), /Drop the first argument/);
    assert.doesNotMatch(texts(13), /Open scripts\/greet\.sh/);
  });
  it('one missing mission keeps its chapter locked, and a later chapter alone does not unlock an earlier one', () => {
    const d = doneThrough(1); delete d['0.2'];
    assert.equal(qfOpen(d).length, 0);
    assert.equal(qfOpen({ '1.0': true, '1.1': true, '1.2': true, '1.3': true, '1.4': true, '1.5': true, '1.6': true }).filter((q) => q.ch === 0).length, 0);
  });
  it('the locked state offers the way back to the quest, and the picker only lists tiers with open questions', () => {
    assert.match(appSrc, /Locked for now/);
    assert.match(appSrc, /id="fGoQuest">Go to the quest/);
    assert.match(appSrc, /id==='fGoQuest'\)showTab\('quest'\)/);
    assert.match(appSrc, /function fillTiers\(open\)/);
  });
});

describe('guide tags', () => {
  it('clear sits with the chapter that teaches it (0), not in the extras', () => {
    assert.equal(GUIDE.find((g) => g.c === 'clear').ch, 0);
  });
});
