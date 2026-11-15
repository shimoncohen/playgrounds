// Agent Quest, "teach before use" (AGENTS.md rule 12): a key term must not appear on any mission card before the mission that
// teaches it (or defines it in place), and quick-fire and the field guide only use a term once their chapter taught it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent } from './harness.mjs';

const AQ = loadAgent();
const plain = (t) => String(t).replace(/<\/?[a-z][^>]*>/gi, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
// only these fields teach: a hint or an explain shows after the learner has already tried
const cardText = (m) => plain([m.title, m.goal, ...(m.how || [])].join('\n'));
const answerText = (m) => (typeof m.answer === 'string' ? m.answer : m.answer && m.answer.files ? Object.values(m.answer.files).join('\n') : '');
const useText = (m) => plain([m.title, m.goal, m.hint, m.explain, answerText(m), ...(m.how || [])].join('\n'));
const flat = [];
AQ.CH.forEach((c, ci) => {
  flat.push({ ci, mi: -1, text: plain([c.intro, c.story].join('\n')), teach: plain(c.intro) });
  c.missions.forEach((m, mi) => flat.push({ ci, mi, text: useText(m), teach: cardText(m) }));
});
// a chapter intro may use what mission 0 of its own chapter teaches
const before = (ci, mi) => flat.filter((x) => x.ci < ci || (x.ci === ci && x.mi < mi && !(x.mi < 0 && mi <= 0)));

// term -> [regex that uses it, chapter, mission (0-based, -1 is the chapter intro) that first teaches it or defines it in place
// (its own card may use it), and optionally a regex the teaching text there must match, so removing the explanation fails the test]
const FIRST = {
  'Done when': [/Done when/, 0, 0],
  'npm test': [/npm test/, 0, 0],
  unverified: [/unverified/i, 0, 0, /marked unverified/],
  'tool call': [/tool call/i, 0, 1],
  verb: [/\bverbs?\b/i, 0, 1],
  target: [/\btargets?\b/i, 0, 1],
  Constraints: [/Constraints/, 0, 1],
  'Run panel': [/Run panel/, 0, 1, /Run panel lists/],
  Files: [/\bFiles\b/, 0, 2],
  token: [/\btokens?\b/i, 0, 2],
  context: [/\bcontext\b/i, 0, 2, /its context:/],
  meter: [/\bmeter\b/i, 0, 2],
  'CLAUDE.md': [/CLAUDE\.md/, 0, 3],
  'memory file': [/memory file/i, 0, 3],
  subagent: [/\bsubagents?\b/i, 1, 4],
  Examples: [/\bExamples\b/, 2, 0],
  // case-sensitive: chapter 1 quick-fire says "plan, build, ship"
  Plan: [/\bPlan\b/, 2, 3],
  'folder memory': [/\bfolder(?:-level)? memory\b/i, 3, 1],
  skill: [/\bskills?\b/i, 4, 0],
  'when:': [/(?<!Done )\bwhen:/, 4, 0],
  MCP: [/\bMCP\b/, 4, -1, /MCP server hands the agent extra tools/],
  // a tool call written the way the grammar writes it: call server.tool
  call: [/\bcall [a-z]+\.[a-z]+/, 4, 4],
  hook: [/\bhooks?\b/i, 5, 0],
  plugin: [/\bplugins?\b/i, 5, -1, /plugin is a bundle/],
  injection: [/\binjections?\b/i, 6, 1],
  secret: [/\bsecrets?\b/i, 6, 2],
  'max N files': [/\bmax \d+ files?\b/, 7, 1],
  // 8.3 defines it in one sentence; the chapter 8 intro and 8.1 and 8.2 must not use it
  'pull request': [/\bpull request\b/i, 7, 2, /page where teammates read your change/],
  PR: [/\bPR\b/, 7, 2, /\(PR\)/],
  'Use:': [/\bUse:/, 9, 0],
  delegate: [/\bdelegat/i, 9, 0],
  parallel: [/\bparallel\b/i, 9, 2],
  worktree: [/\bworktrees?\b/i, 9, 2],
  'after edit': [/\bafter edit\b/, 10, 0],
  formatter: [/\bformatter\b/i, 10, 1],
  'slash command': [/\bslash commands?\b/i, 11, 0],
  '.claude/commands': [/\.claude\/commands/, 11, 0],
  headless: [/\bheadless\b/i, 13, 0],
  unattended: [/\bunattended\b/i, 13, 0],
  CI: [/\bCI\b/, 13, 0],
  // 14.1 says the job's permissions file lists its actions without writing a line of it
  'allow VERB': [/\ballow (?:edit|read|run|call|send|delete)\b/, 13, 1],
  'default check': [/\bdefault check\b/i, 14, 0],
  // chapter 16, the first personal chapter: 15.0 teaches the file and the day word, 15.2 is the first card to say reminder
  'schedule.txt': [/schedule\.txt/, 15, 0],
  'scheduled job': [/\bscheduled (?:task|job)s?\b/i, 15, 0],
  weekdays: [/\bweekdays\b/, 15, 0],
  reminder: [/\breminders?\b/i, 15, 2],
  // chapter 17 (index 16): 16.1 defines the section anchor, a file name with #heading after it
  'section anchor': [/[\w-]+\.md#[a-z][\w-]*/, 16, 1],
  // chapter 18 (index 17): 17.0 defines the star in a path; no card, quick-fire or guide entry before it writes one
  glob: [/\*/, 17, 0],
  // chapter 19 (index 18): 18.0 and 18.1 name the personal tools, notes first and then mail
  'notes tools': [/\bnotes\.(?:search|read|add)\b/, 18, 0],
  'mail tools': [/\bmail\.(?:read|search)\b/, 18, 1],
  // chapter 21 (index 20): 21.2 says a line hidden with # is still in the file and still counted
  'comment out': [/\bcomment(?:ed)?[ -](?:it[ -])?out\b/i, 20, 1, /still in the file and still counted/],
  model: [/\bmodels?\b/i, 1, 4, /model is the AI/],
  changelog: [/\bchange-?log/i, 2, 0, /list of what changed in each release/],
  root: [/\broot\b/i, 3, 1, /top folder/],
  deploy: [/\bdeploy/i, 5, 0, /live for real customers/],
  'package.json': [/package\.json/, 8, 0, /lists the project's commands/],
  'git push': [/\bgit push\b|\bpush(?:ing|es)? (?:straight |directly )?(?:to|onto) (?:`?main|origin|a branch|its own branch)/i, 8, 2, /committed changes/],
  origin: [/\borigin\b/, 8, 2, /shared copy of the project/],
  branch: [/\bbranch(?:es)?\b/i, 8, 2, /branch is a separate line of work/],
  'gh pr create': [/\bgh pr create\b/, 8, 2, /gh pr create opens a pull request/],
  lint: [/\blint/i, 10, 0, /scans your code/],
  // chapter 22 (index 21): 22.3 defines the Extra field in place
  'Extra:': [/\bExtra:/, 21, 2],
};
const extras = () => [
  ...AQ.QF.map((q) => ({ ch: q.ch, where: 'quick-fire', text: plain([q.c, q.a, ...q.w, q.why].join('\n')) })),
  ...AQ.GUIDE.map((g) => ({ ch: g.ch, where: 'the field guide', text: plain([g.c, g.what, ...g.ex.flat()].join('\n')) })),
];

for (const [term, [re, ci, mi, defined]] of Object.entries(FIRST)) {
  describe(`"${term}"`, () => {
    it(`is not used before ${ci}.${mi}, where it is introduced`, () => {
      for (const x of before(ci, mi)) assert.ok(!re.test(x.text), `${x.ci}.${x.mi} uses "${term}" before it is taught at ${ci}.${mi}`);
      const at = flat.find((x) => x.ci === ci && x.mi === mi);
      assert.ok(re.test(at.teach), `${ci}.${mi} should be where "${term}" is introduced`);
      if (defined) assert.match(at.teach, defined, `${ci}.${mi} should explain "${term}"`);
    });
    it('is not used in quick-fire or the field guide before its chapter', () => {
      for (const x of extras()) if (x.ch < ci) assert.ok(!re.test(x.text), `${x.where} for chapter ${x.ch + 1} uses "${term}" before chapter ${ci + 1}`);
    });
  });
}

describe('verbs no chapter 1 mission uses are not taught yet', () => {
  it('call and send appear as code nowhere in chapter 1 text', () => {
    const raw = [...AQ.CH[0].missions.flatMap((m) => [m.goal, m.explain, m.hint, ...m.how]), ...AQ.QF.filter((q) => q.ch === 0).flatMap((q) => [q.c, q.a, ...q.w, q.why]), ...AQ.GUIDE.filter((g) => g.ch === 0).flatMap((g) => [g.what, ...g.ex.flat()])].join('\n');
    assert.doesNotMatch(raw, /<code>(?:call|send)<\/code>/);
  });
});

describe('a mission card does not lean on a later mission', () => {
  it('the chapter 1 intro uses none of the terms', () => {
    for (const [term, [re]] of Object.entries(FIRST)) assert.ok(!re.test(plain(AQ.CH[0].intro)), `the chapter intro uses "${term}" before any mission teaches it`);
  });
  it('a chapter intro uses no term that a later chapter teaches', () => {
    AQ.CH.forEach((ch, c) => {
      for (const [term, [re, ci]] of Object.entries(FIRST)) if (ci > c) assert.ok(!re.test(plain(ch.intro)), `the intro of chapter ${c + 1} uses "${term}" before chapter ${ci + 1}`);
    });
  });
});
