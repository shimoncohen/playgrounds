// Core chapters 2 to 7: nearby and lazy answers are caught, one case table per mission. Positions are [chapter, mission],
// both 0-based, as in AQ.CH[chapter].missions[mission]. pass: inputs that must pass. fail: inputs that parse and run but must not pass.
// refused: prompt inputs with a line that does not parse, so the agent is never run.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent } from './harness.mjs';
import { kit, runCases } from './cases.mjs';

const AQ = loadAgent();
const { M, go } = kit(AQ);
const F = (files) => ({ files });
const BULK = 'x'.repeat(2000);
const SRC = '# Rules for work inside src/\n', DOCS = '# Rules for work inside docs/\n';
const HEAD = '# before VERB TARGET\n';
const skill = (name, when, body = '') => `name: ${name}\ndescription: ${name} skill\nwhen: ${when}\n${body}`;
const GUARD = (when) => skill('release-guard', when, 'do not edit migrations/\n');
const LOCK = 'Constraints: do not edit migrations/';

const CASES = [
  { at: [1, 0],
    pass: [F({ 'CLAUDE.md': 'do not delete data/backup.csv', '.claude/notes.txt': '' }), F({ 'CLAUDE.md': 'do not delete data', '.claude/notes.txt': '' }), F({ 'CLAUDE.md': 'do not delete data/', '.claude/notes.txt': '', 'src/CLAUDE.md': BULK })],
    fail: [F({ 'CLAUDE.md': 'do not delete data/' }), F({ '.claude/notes.txt': '' }), F({ 'CLAUDE.md': '', '.claude/notes.txt': '' }), F({ 'CLAUDE.md': 'do not delete data/', '.claude/notes.txt': BULK }), F({ 'CLAUDE.md': '', '.claude/notes.txt': 'do not delete data/' }), F({ 'CLAUDE.md': 'do not edit data/', '.claude/notes.txt': '' })] },
  { at: [1, 1],
    pass: [F({ 'CLAUDE.md': 'do not delete data/backup.csv' }), F({ 'CLAUDE.md': 'do not delete data' })],
    fail: [F({ 'CLAUDE.md': '' }), F({ 'CLAUDE.md': 'do not read data/' }), F({ 'CLAUDE.md': 'do not delete src/util.js' }), F({ 'CLAUDE.md': 'Please keep the data folder safe.' })] },
  { at: [1, 2],
    pass: ['Files: src/price.js, src/util.js', 'Files: src/price.js\nFiles: tests/price.test.js'],
    fail: ['Files: src/', 'Files: src/util.js', 'Files: docs/', '', { prompt: 'Files: src/', files: { 'CLAUDE.md': 'do not delete data/' } }, { prompt: '', files: { 'CLAUDE.md': 'do not delete data/' } }],
    refused: ['Files: nothing.js', 'Files: ../x'] },
  { at: [1, 3],
    pass: ['Files: src/tax.js, src/price.js', 'Files: src/price.js\nFiles: src/tax.js'],
    fail: ['Files: src/price.js', 'Files: src/tax.js', 'Files: src/', 'Files: docs/', ''],
    refused: ['Files: ghost.js', 'Files: ../x'] },
  { at: [1, 4],
    pass: [F({ '.claude/agents/helper.md': 'name: helper\nmodel: small' })],
    fail: [F({ '.claude/agents/helper.md': 'name: helper\nmodel: standard\n' }), F({ '.claude/agents/helper.md': '' }), F({ '.claude/agents/helper.md': 'name: helper\nmodel: huge\n' }), F({ '.claude/agents/helper.md': 'name: other\nmodel: small\n' }), F({ '.claude/agents/helper.md': 'name: helper\nmodel: small\n', '.claude/agents/extra.md': 'name: extra\nmodel: small\n' })] },

  { at: [2, 0],
    pass: ['Examples: docs/changelog-sample.md, docs/old-notes.md', 'Examples: docs/changelog-sample.md\nFiles: src/price.js'],
    fail: ['Examples: docs/old-notes.md, docs/changelog-sample.md', 'Examples: docs/old-notes.md', 'Goal: add an entry', ''],
    refused: ['Examples: see above', 'Examples: docs/ghost.md'] },
  { at: [2, 1],
    pass: ['Files: src/price.js, src/util.js', 'Files: src/price.js\nFiles: tests/price.test.js'],
    fail: ['Files: src/', 'Files: src/util.js', 'Files: tests/price.test.js', 'Files: docs/', ''],
    refused: ['Files: nothing.js', 'Files: ../x'] },
  { at: [2, 2],
    pass: [`${LOCK}\nDone when: run npm test`, 'Constraints: do not edit migrations/001.sql\nDone when: run npm test', `${LOCK}\nDone when: run npm test\nFiles: src/`],
    fail: ['Constraints: only edit src/price.js\nDone when: run npm test', LOCK, 'Done when: run npm test', `${LOCK}\nConstraints: do not edit src/tax.js\nDone when: run npm test`, 'Constraints: do not edit src/\nDone when: run npm test', '', F({ 'CLAUDE.md': 'do not edit migrations/\nDone when: run npm test' })],
    refused: ['Constraints: be careful\nDone when: run npm test', 'Constraints: do not edit ghost/\nDone when: run npm test'] },
  { at: [2, 3],
    pass: ['Plan: first\nDone when: run npm test', 'Plan: first\nConstraints: do not edit migrations/\nDone when: run npm test', 'Plan: first\nFiles: src/price.js, src/tax.js\nDone when: run npm test'],
    fail: ['Done when: run npm test', 'Plan: off\nDone when: run npm test', 'Plan: first\nConstraints: do not edit src/', 'Plan: first\nConstraints: only edit src/tax.js\nDone when: run npm test', '', F({ 'CLAUDE.md': 'Done when: run npm test' })],
    refused: ['Plan: always\nDone when: run npm test', 'Plan: first\nDone when: run ghost'] },

  { at: [3, 0],
    pass: [F({ 'CLAUDE.md': 'do not edit src/legacy/old.js' }), F({ 'CLAUDE.md': 'do not edit src/legacy' })],
    fail: [F({ 'CLAUDE.md': 'do not edit src/' }), F({ 'CLAUDE.md': 'do not edit docs/' }), F({ 'CLAUDE.md': '' }), F({ 'CLAUDE.md': 'Please leave the old billing code alone.' }), F({ 'src/legacy/CLAUDE.md': 'do not edit src/legacy/' })] },
  { at: [3, 1],
    pass: [F({ 'src/CLAUDE.md': 'do not edit src/legacy/old.js' }), F({ 'src/CLAUDE.md': 'do not edit src/legacy' })],
    fail: [F({ 'CLAUDE.md': 'do not edit src/legacy/' }), F({ 'docs/CLAUDE.md': 'do not edit src/legacy/' }), F({ 'src/legacy/CLAUDE.md': 'do not edit src/legacy/' }), F({ 'src/CLAUDE.md': 'do not edit src/' }), F({ 'src/CLAUDE.md': '' }), F({ 'src/CLAUDE.md': 'Please leave the old billing code alone.' })] },
  { at: [3, 2],
    pass: [F({ 'docs/CLAUDE.md': 'do not edit docs/generated/api.md', 'src/CLAUDE.md': 'do not edit src/legacy/old.js' })],
    fail: [F({ 'docs/CLAUDE.md': 'do not edit docs/generated/\ndo not edit src/legacy/' }), F({ 'src/CLAUDE.md': 'do not edit docs/generated/\ndo not edit src/legacy/' }), F({ 'CLAUDE.md': 'do not edit docs/generated/\ndo not edit src/legacy/' }), F({ 'src/CLAUDE.md': 'do not edit src/legacy/' }), F({ 'docs/CLAUDE.md': 'do not edit docs/generated/' }), F({ 'docs/CLAUDE.md': 'do not edit docs/', 'src/CLAUDE.md': 'do not edit src/' })] },
  { at: [3, 3],
    pass: ['Files: src/', 'Files: src/price.js, docs/guide.md', 'Files: src/legacy/old.js, src/price.js'],
    fail: ['Files: docs/guide.md', 'Constraints: do not edit src/legacy/', BASE(), '', 'Files: tests/price.test.js'],
    refused: ['Files: ghost/', 'Files: ../x'] },
  { at: [3, 4],
    pass: [F({ 'CLAUDE.md': '', 'src/CLAUDE.md': 'do not edit src/legacy/old.js' }), F({ 'CLAUDE.md': 'do not edit src/legacy/', 'src/CLAUDE.md': '' }), F({ 'CLAUDE.md': '', 'src/CLAUDE.md': 'do not edit src/legacy/', 'src/legacy/CLAUDE.md': BULK })],
    fail: [F({ 'CLAUDE.md': '' }), F({ 'CLAUDE.md': '', 'src/CLAUDE.md': '' }), F({ 'CLAUDE.md': '', 'src/CLAUDE.md': 'do not edit src/legacy/\n' + BULK }), F({ 'CLAUDE.md': BULK, 'src/CLAUDE.md': 'do not edit src/legacy/' }), F({ 'CLAUDE.md': '', 'src/CLAUDE.md': 'do not edit src/legacy/', 'docs/CLAUDE.md': BULK }), F({ 'CLAUDE.md': '', 'src/CLAUDE.md': 'do not edit src/legacy/', '.claude/notes.txt': BULK })] },

  { at: [4, 0],
    pass: [F({ '.claude/skills/release-guard.md': skill('release-guard', 'release', 'do not edit migrations/') })],
    fail: [F({ '.claude/skills/release-guard.md': GUARD('bugfix') }), F({ '.claude/skills/release-guard.md': GUARD('sometimes') }), F({ '.claude/skills/release-guard.md': GUARD('release').replace('do not edit migrations/', 'be careful') }),
      F({ 'CLAUDE.md': 'do not edit migrations/' }), F({ '.claude/permissions.txt': 'deny edit migrations/' }), F({ '.claude/skills/x.md': GUARD('release').replace('release-guard', 'x') }),
      F({ '.claude/skills/a.md': GUARD('release').replace('release-guard', 'a'), '.claude/skills/release-guard.md': GUARD('release') }), F({ '.claude/skills/release-guard.md': GUARD('release').replace('name: release-guard', 'name: other') })] },
  { at: [4, 1],
    pass: [F({ '.claude/skills/release-notes.md': '' }), F({ '.claude/skills/release-notes.md': 'nothing' }), F({ '.claude/skills/release-notes.md': skill('release-notes', 'docs') })],
    fail: [F({ '.claude/skills/release-guard.md': '' }), F({ '.claude/skills/release-notes.md': skill('release-notes', 'docs', BULK) }), F({ '.claude/skills/release-notes.md': '', '.claude/skills/release-guard.md': GUARD('release') + BULK }), F({ '.claude/skills/release-notes.md': '', 'CLAUDE.md': BULK }), F({ '.claude/skills/release-notes.md': '', '.claude/skills/release-guard.md': '' })] },
  { at: [4, 2],
    pass: [F({ '.claude/skills/docs-style.md': '' })],
    fail: [F({ '.claude/skills/release-guard.md': '' }), F({ '.claude/skills/docs-style.md': '', '.claude/skills/release-guard.md': '' }), F({ '.claude/skills/docs-style.md': skill('docs-style', 'release', BULK) }), F({ '.claude/skills/docs-style.md': skill('docs-style', 'release') }), F({ '.claude/skills/docs-style.md': skill('docs-style', 'test') }), F({ '.claude/skills/docs-style.md': '', '.claude/notes.txt': BULK })] },
  { at: [4, 3],
    pass: [F({ '.claude/mcp.txt': 'calendar: list' }), F({ '.claude/mcp.txt': 'calendar: list, create' })],
    fail: [F({ '.claude/mcp.txt': 'mail: send' }), F({ '.claude/mcp.txt': '' }), F({ '.claude/mcp.txt': 'calendar: create' }), F({ '.claude/mcp.txt': 'calendar: list\nmail: send' }), F({ '.claude/mcp.txt': 'calendar: list', 'CLAUDE.md': BULK }), F({ '.claude/mcp.txt': 'calendar list' })] },
  { at: [4, 4],
    pass: ['Constraints: do not call mail.send\nDone when: call calendar.list', 'Constraints: ask before call mail.send\nDone when: call calendar.list', 'Constraints: do not call mail\nDone when: call calendar.list'],
    fail: ['Constraints: do not call calendar.create\nDone when: call calendar.list', 'Constraints: do not send mail.send\nDone when: call calendar.list', 'Done when: call calendar.list', 'Constraints: do not call mail.send', 'Constraints: only call calendar.list\nDone when: call calendar.list', 'Goal: move the 1:1', '', F({ 'CLAUDE.md': 'do not call mail.send\nDone when: call calendar.list' })],
    refused: ['Constraints: do not call ghost.tool\nDone when: call calendar.list', 'Constraints: do not call mail.send\nDone when: call ghost.list'] },

  { at: [5, 0],
    pass: [F({ '.claude/hooks.txt': 'before run npm run deploy' }), F({ '.claude/hooks.txt': 'before run npm run' })],
    fail: [F({ '.claude/hooks.txt': 'before run npm run lint' }), F({ '.claude/hooks.txt': 'before delete data/' }), F({ '.claude/hooks.txt': 'run npm run deploy' }), F({ 'CLAUDE.md': 'do not run npm run deploy' }), F({ '.claude/permissions.txt': 'deny run npm run deploy' }), F({ '.claude/hooks.txt': 'before run npm run deploy-all' })] },
  { at: [5, 1],
    pass: [F({ '.claude/hooks.txt': 'before delete data/\nbefore run npm run deploy' }), F({ '.claude/hooks.txt': 'before delete data/backup.csv\nbefore run npm run deploy' })],
    fail: [F({ '.claude/hooks.txt': 'before run npm run deploy' }), F({ '.claude/hooks.txt': 'before delete data/' }), F({ '.claude/hooks.txt': 'before run npm\nbefore delete data/' }), F({ '.claude/hooks.txt': 'before run npm test\nbefore delete data/\nbefore run npm run deploy' }), F({ '.claude/hooks.txt': '' }), F({ 'CLAUDE.md': 'do not delete data/\ndo not run npm run deploy' })] },
  { at: [5, 2],
    pass: [F({ '.claude/hooks.txt': 'before edit src/legacy/old.js' }), F({ '.claude/hooks.txt': 'before edit src/legacy' })],
    fail: [F({ '.claude/hooks.txt': 'before edit src/' }), F({ '.claude/hooks.txt': 'before edit docs/' }), F({ '.claude/hooks.txt': 'before read src/legacy/' }), F({ 'CLAUDE.md': 'do not edit src/legacy/' }), F({ 'src/CLAUDE.md': 'do not edit src/legacy/' }), F({ '.claude/hooks.txt': '' })] },
  { at: [5, 3],
    pass: [F({ '.claude/agents/finder.md': 'name: finder\nmodel: small', '.claude/agents/architect.md': 'name: architect\nmodel: standard' })],
    fail: [F({ '.claude/agents/finder.md': 'name: finder\nmodel: small\n', '.claude/agents/architect.md': 'name: architect\nmodel: small\n' }), F({ '.claude/agents/finder.md': 'name: finder\nmodel: standard\n', '.claude/agents/architect.md': 'name: architect\nmodel: standard\n' }), F({ '.claude/agents/finder.md': 'name: finder\nmodel: small\n', '.claude/agents/architect.md': 'name: architect\nmodel: large\n' }), F({ '.claude/agents/finder.md': '', '.claude/agents/architect.md': 'name: architect\nmodel: standard\n' }), F({ '.claude/agents/finder.md': 'name: scout\nmodel: small\n', '.claude/agents/architect.md': 'name: architect\nmodel: standard\n' })] },

  { at: [6, 0],
    pass: [F({ '.claude/permissions.txt': 'deny delete data/backup.csv' }), F({ '.claude/permissions.txt': 'deny delete data' })],
    fail: [F({ '.claude/permissions.txt': 'deny read data/' }), F({ '.claude/permissions.txt': 'deny edit src/' }), F({ '.claude/permissions.txt': 'deny delete src/util.js' }), F({ 'CLAUDE.md': 'do not delete data/' }), F({ '.claude/hooks.txt': 'before delete data/' }), F({ '.claude/permissions.txt': 'deny remove data/' })] },
  { at: [6, 1],
    pass: ['Constraints: do not send mail.send', 'Constraints: ask before send mail.send', 'Constraints: do not send mail'],
    fail: ['Constraints: do not call mail.send', 'Constraints: do not read docs/vendor-api.md', 'Constraints: do not read docs/', 'Constraints: do not edit src/', 'Done when: run npm test', ''],
    refused: ['Constraints: be careful with emails', 'Constraints: do not send ghost.send'] },
  { at: [6, 2],
    pass: ['Constraints: do not read .env', 'Files: src/price.js', 'Constraints: ask before read .env'],
    fail: ['Constraints: do not edit .env', 'Files: .env', 'Files: src/price.js, .env', 'Constraints: do not read src/', 'Done when: run npm test', ''],
    refused: ['Constraints: do not read ghost.env', 'Files: ghost.env'] },
  { at: [6, 3],
    pass: ['Plan: first\nConstraints: ask before edit migrations/001.sql', 'Plan: first\nConstraints: ask before edit migrations/\nDone when: run npm test'],
    fail: ['Plan: first', 'Constraints: ask before edit migrations/', 'Plan: first\nConstraints: do not edit migrations/\nConstraints: do not edit src/', 'Plan: first\nConstraints: ask before edit src/', 'Plan: first\nConstraints: ask before read migrations/', 'Plan: first\nConstraints: do not edit migrations/', ''],
    refused: ['Plan: first\nConstraints: ask before edit ghost/', 'Plan: sometimes\nConstraints: ask before edit migrations/'] },
  { at: [6, 4],
    pass: [F({ 'CLAUDE.md': 'do not delete data\ndo not read .env\ndo not send mail.send' }), F({ 'CLAUDE.md': 'ask before delete data/\nask before read .env\nask before send mail.send' })],
    fail: [F({ 'CLAUDE.md': 'do not delete data/\ndo not read .env\ndo not send mail.send please' }), F({ 'CLAUDE.md': 'do not delete data/\ndo not read .env' }), F({ 'CLAUDE.md': '' }), F({ 'CLAUDE.md': 'do not delete data/\ndo not read .env\ndo not send mail.send\nnever reveal keys' }), F({ '.claude/permissions.txt': 'deny delete data/\ndeny read .env\ndeny send mail.send' }), F({ 'CLAUDE.md': 'do not delet data/\ndo not read .env\ndo not send mail.send' }), F({ 'CLAUDE.md': 'do not delete data\ndo not read .env\ndo not send mail.send\nDone when: run npm test' }), F({ 'CLAUDE.md': 'do not delete data\ndo not read .env\ndo not send mail.send\nDone when: it is done' })] },
];

function BASE() { return 'Goal: fix the rounding bug in src/price.js'; }

runCases(AQ, 'chapters 2 to 7: lazy and nearby answers are caught', CASES, (c, ch) => c === 0 || ch.tier !== 'core');

describe('plan first pauses the run until it is approved', () => {
  it('[2, 3] and [6, 3] wait for approval, and approving finishes them', () => {
    for (const [c, i] of [[2, 3], [6, 3]]) {
      const r = AQ.evaluate(M(c, i), M(c, i).answer);
      assert.equal(r.awaiting, true);
      assert.equal(typeof r.result, 'string');
      assert.equal(AQ.runMission(M(c, i), M(c, i).answer, { approved: true }), true);
    }
  });
});

describe('folder memory cannot be invented by an input', () => {
  const m = (c, i) => M(c, i);
  it('a folder memory file the scenario does not ship fails chapter 1 missions 4 and 5', () => {
    for (const i of [3, 4]) assert.equal(typeof AQ.runMission(m(0, i), F({ 'CLAUDE.md': '', 'src/CLAUDE.md': 'do not delete data/' })), 'string');
  });
  it('the starting setups of the memory missions load nothing by themselves', () => {
    for (const i of [0, 1, 2]) assert.equal(typeof AQ.runMission(m(3, i), {}), 'string');
  });
  it('the heavy starting setup of [3, 4] is over its budget', () => {
    const sc = AQ.scenarios.legacyheavy;
    assert.ok(AQ.context.setupTokens(AQ.config.parseSetup(AQ.vfs.create(sc.vfs))) > 150);
  });
});

describe('the history of the chat scenario', () => {
  it('overflow drops the rule when the agent reads widely, and keeps it when the agent reads little', () => {
    const wide = go(1, 1, {}).outcome, narrow = AQ.evaluate(M(1, 2), 'Files: src/price.js').outcome;
    assert.equal(wide.violations.length, 1);
    assert.equal(narrow.violations.length, 0);
    assert.ok(narrow.tokens.peak <= AQ.context.WINDOW);
  });
  it('the pre-run preview holds earlier messages and drops the oldest when the files do not fit', () => {
    const p = AQ.prepare(M(1, 1), {});
    const scope = [...new Set(p.prompt.files.flatMap((f) => (p.vfs.read(f) !== null ? [f] : p.vfs.list(AQ.vfs.dir(f)))))];
    const ctx = AQ.context.build(p.setup, p.prompt, p.scenario.history, scope.map((f) => ({ path: f, text: p.vfs.read(f) })), { skills: [] });
    assert.ok(ctx.segments.some((s) => s.kind === 'history') || ctx.dropped.length > 0);
    assert.ok(ctx.dropped.length > 0);
  });
});
