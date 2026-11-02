import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent } from './harness.mjs';

// Learner-facing prose shows commands, options, file names, paths, prompt fields and rules as code (docs/tiers-guideline.md,
// "Code in prose"). The shell rules are copied from tests/shell/codestyle.test.mjs (importing that file would run the
// Shell Quest tests too); the agent rules add file extensions of this quest, its paths, the npm command, the prompt field names
// and the rule forms. Prose says "the Files panel" without a colon; a field is only code when it is written as a field.
const SAFE = 'pwd ls cd mkdir rmdir rm cp mv wc grep uniq chmod whoami hostname nano vi vim tee tr sed seq xargs diff printf tac nl comm basename dirname ln awk ps getopts mktemp realpath printenv readonly'.split(' ');
const AMBIG = 'cat echo find head tail sort touch cut env date history clear sleep wait kill jobs'.split(' ');
const VERB = 'prints|shows|puts|scrolls|walks|tells|creates|slices|understands|runs|receives|sees|reverses|keeps|says|swaps|writes|sorts|counts|finds|lists|reads|takes|gives|joins|turns|makes|catches|drops|splits';
const G = '(?<![\\w§/.$-])', E = '(?![\\w/-])';
const RULES = [
  ['command name', new RegExp(`${G}(?:${SAFE.join('|')})${E}`)],
  ['command name before a verb', new RegExp(`${G}(?:${AMBIG.join('|')})(?= (?:${VERB})\\b)`)],
  ['option', new RegExp(`${G}-{1,2}[A-Za-z][\\w-]*${E}`)],
  ['file name', new RegExp(`${G}(?:[\\w.~-]+/)*[\\w-]+\\.(?:txt|log|sh|csv|md|conf|json|js|sql)${E}`)],
  ['variable', new RegExp(`${G}\\$(?:[A-Za-z_]\\w*|[?#@*0-9])${E}`)],
  ['agent command', new RegExp(`${G}npm${E}`)],
  ['project path', new RegExp(`${G}(?:src|data|docs|tests|migrations|\\.claude)/`)],
  ['secret file', new RegExp(`${G}\\.env${E}`)],
  ['prompt field', new RegExp(`${G}(?:Goal|Files|Examples|Use|Plan|Constraints|Done when|Extra):`)],
  ['field name', new RegExp(`${G}(?:Done when|Constraints)${E}`)],
  ['rule', new RegExp(`${G}(?:(?:do not|ask before|only) (?:edit|read|run|call|send|delete)|max \\d+ files?)${E}`)],
];
const prose = (h) => String(h).replace(/<code>.*?<\/code>|<kbd>.*?<\/kbd>|<pre[^>]*>.*?<\/pre>/gs, '§').replace(/<[^>]+>/g, ' ').replace(/&(?:gt|lt|amp|quot);/g, '§');

function bareMentions(text) {
  const t = prose(text), out = [];
  for (const [what, re] of RULES) { const m = re.exec(t); if (m) out.push(`${what} "${m[0]}" in: …${t.slice(Math.max(0, m.index - 25), m.index + 35).replace(/\s+/g, ' ')}…`); }
  return out;
}

describe('bareMentions (the agent rules)', () => {
  it('flags bare names and passes coded ones', () => {
    assert.equal(bareMentions('<code>npm test</code> runs the tests').length, 0);
    assert.equal(bareMentions('npm runs the tests').length, 1);
    assert.equal(bareMentions('open src/price.js now').length, 2);
    assert.equal(bareMentions('open <code>src/price.js</code> now').length, 0);
    assert.equal(bareMentions('the data/ folder').length, 1);
    assert.equal(bareMentions('add a Done when line').length, 1);
    assert.equal(bareMentions('Files: src/price.js').length, 3);
    assert.equal(bareMentions('do not delete it').length, 1);
    assert.equal(bareMentions('max 3 files').length, 1);
    assert.equal(bareMentions('read CLAUDE.md').length, 1);
    assert.equal(bareMentions('use -c to count').length, 1);
    assert.equal(bareMentions('the .claude/ folder').length, 1);
    assert.equal(bareMentions('the .env file').length, 1);
    assert.equal(bareMentions('the <code>.claude/</code> folder and <code>.env</code>').length, 0);
    assert.equal(bareMentions('The Files panel, the Run panel, and the rules you write.').length, 0);
    assert.equal(bareMentions('<code>Done when: run npm test</code> and <code>do not edit src/</code>').length, 0);
  });
});

describe('Agent Quest text keeps commands, files, fields and rules in <code>', () => {
  const AQ = loadAgent();
  AQ.CH.forEach((ch, c) => {
    it(`chapter ${c + 1} intro`, () => assert.deepEqual(bareMentions(ch.intro), []));
    ch.missions.forEach((m, i) => {
      const texts = [m.goal, m.explain, m.hint, ...(m.how || [])].filter(Boolean);
      it(`${c + 1}.${i + 1} ${m.title}`, () => assert.deepEqual(texts.flatMap(bareMentions), []));
    });
  });
  it('field guide what and example notes', () => assert.deepEqual([...AQ.GUIDE].flatMap((g) => [g.what, ...g.ex.map(([, n]) => n)]).flatMap(bareMentions), []));
  it('quick-fire questions, answers and explanations', () => assert.deepEqual([...AQ.QF].flatMap((q) => [q.c, q.a, ...q.w, q.why]).flatMap(bareMentions), []));
});
