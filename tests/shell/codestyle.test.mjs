import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell } from './harness.mjs';

// Learner-facing prose shows command names, options, file names and variables as code (docs/tiers-guideline.md,
// "Code in prose"). A bare `ls` or `-a` reads as part of the sentence, so the learner cannot tell it is something to type.
// Only names that are not ordinary English words can be checked automatically; ambiguous ones (find, cat, sort, echo, ...)
// are checked only where a verb follows them ("find walks", "cat prints"), the rest is for the reviewer.
const SAFE = 'pwd ls cd mkdir rmdir rm cp mv wc grep uniq chmod whoami hostname nano vi vim tee tr sed seq xargs diff printf tac nl comm basename dirname ln awk ps getopts mktemp realpath printenv readonly'.split(' ');
const AMBIG = 'cat echo find head tail sort touch cut env date history clear sleep wait kill jobs'.split(' ');
const VERB = 'prints|shows|puts|scrolls|walks|tells|creates|slices|understands|runs|receives|sees|reverses|keeps|says|swaps|writes|sorts|counts|finds|lists|reads|takes|gives|joins|turns|makes|catches|drops|splits';
const G = '(?<![\\w§/.$-])', E = '(?![\\w/-])';
const RULES = [
  ['command name', new RegExp(`${G}(?:${SAFE.join('|')})${E}`)],
  ['command name before a verb', new RegExp(`${G}(?:${AMBIG.join('|')})(?= (?:${VERB})\\b)`)],
  ['option', new RegExp(`${G}-{1,2}[A-Za-z][\\w-]*${E}`)],
  ['file name', new RegExp(`${G}(?:[\\w.~-]+/)*[\\w-]+\\.(?:txt|log|sh|csv|md|conf|json)${E}`)],
  ['variable', new RegExp(`${G}\\$(?:[A-Za-z_]\\w*|[?#@*0-9])${E}`)],
];
const prose = (h) => String(h).replace(/<code>.*?<\/code>|<kbd>.*?<\/kbd>|<pre[^>]*>.*?<\/pre>/gs, '§').replace(/<[^>]+>/g, ' ').replace(/&(?:gt|lt|amp|quot);/g, '§');

export function bareMentions(text) {
  const t = prose(text), out = [];
  for (const [what, re] of RULES) { const m = re.exec(t); if (m) out.push(`${what} "${m[0]}" in: …${t.slice(Math.max(0, m.index - 25), m.index + 35).replace(/\s+/g, ' ')}…`); }
  return out;
}

describe('bareMentions (the rule itself)', () => {
  it('flags bare names and passes coded ones', () => {
    assert.equal(bareMentions('<code>ls</code> lists what is here').length, 0);
    assert.equal(bareMentions('ls lists what is here').length, 1);
    assert.equal(bareMentions('use -a to see all').length, 1);
    assert.equal(bareMentions('Open journal.txt next').length, 1);
    assert.equal(bareMentions('<code>cat</code> prints a file').length, 0);
    assert.equal(bareMentions('cat prints a file').length, 1);
    assert.equal(bareMentions('Find it, then show it. A step-by-step guide; you can find the file.').length, 0);
  });
});

describe('Shell Quest mission text keeps commands, options, files and variables in <code>', () => {
  const SQ = loadShell();
  SQ.content.chapters.forEach((ch, c) => ch.missions.forEach((m, i) => {
    const parts = [m, ...(m.steps || [])];
    const texts = parts.flatMap((p) => [p.goal, p.explain, p.hint, p.note, ...(p.how || [])]).filter(Boolean);
    it(`${c + 1}.${i + 1} ${m.title}`, () => {
      const bad = texts.flatMap(bareMentions);
      assert.deepEqual(bad, []);
    });
  }));
});

