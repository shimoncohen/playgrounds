import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent } from './harness.mjs';
import { kit, runCases } from './cases.mjs';

const AQ = loadAgent();
const { M, go } = kit(AQ);
const F = (files) => ({ files });
const P = (prompt, files) => ({ prompt, files });
const DEV = [7, 8, 9, 10, 11, 12, 13, 14];
const H = (t) => F({ '.claude/hooks.txt': t });
const HEAD = '# before VERB TARGET\n# after edit PATH run COMMAND\n';
const MCP = (t) => F({ '.claude/mcp.txt': t });
const CMD = (name, t) => F({ [`.claude/commands/${name}.md`]: t });
const GOAL = 'Goal: fix the rounding bugs in the shop totals\n';
const RULE = 'Constraints: do not edit migrations/\n';
const CHECK = 'Done when: run npm test\n';
const TYPED = 'It worked, but you typed the lines yourself. This mission is about calling the saved command with Use.';
const NEVER_USED = 'The run passed, but the saved command was never used. Call it with Use.';
const TRACKER = 'tracker: list_issues, create_issue, comment, close\n';
const SMALL_ARCH = { '.claude/agents/architect.md': 'name: architect\nmodel: small\n' };
const JOB = (t) => F({ '.claude/commands/nightly-fix.md': t });
const PERM = (t) => F({ '.claude/permissions.txt': t });
const PG = 'Goal: fix the rounding bug in src/price.js\n';
const TG = 'Goal: fix the rounding bug in src/tax.js\n';
const NOTES = '# Shop notes\nPrices are in dollars.\n';
const VERIFY = 'Done when: run npm run verify\n';
const ROOT = (t) => F({ 'CLAUDE.md': NOTES + t });
const inDev = (c) => DEV.includes(c);

const CASES = [
  { at: [7, 0],
    pass: ['Constraints: only edit NOTES.md', 'Constraints: only edit NOTES.md\nDone when: read NOTES.md', 'Constraints: only edit NOTES.md\nFiles: src/cart/total.js, NOTES.md'],
    fail: ['Done when: read NOTES.md', 'Constraints: do not edit src/cart/total.js', 'Constraints: only edit src/cart/total.js', 'Constraints: only edit src/', 'Goal: look around', '',
      'Constraints: only edit NOTES.md\nFiles: NOTES.md', F({ 'CLAUDE.md': 'only edit NOTES.md' }), F({ 'CLAUDE.md': 'only edit NOTES.md\nDone when: read NOTES.md' })],
    refused: ['Constraints: only edit ghost.md', 'Constraints: be careful'] },
  { at: [7, 1],
    pass: ['Constraints: max 2 files\nDone when: run npm test', 'Constraints: max 2 files', 'Constraints: max 2 files\nDone when: run npm test\nFiles: src/price.js, src/tax.js'],
    fail: ['Constraints: max 1 files', 'Constraints: max 3 files', 'Constraints: max 3 files\nDone when: run npm test', 'Done when: run npm test', 'Constraints: only edit src/price.js\nDone when: run npm test', '',
      F({ 'CLAUDE.md': 'max 2 files\nDone when: run npm test' }), P('Done when: run npm test', { 'CLAUDE.md': 'max 2 files' })],
    refused: ['Constraints: max 0 files', 'Constraints: max two files'] },
  { at: [7, 2],
    pass: ['Files: NOTES.md, src/cart/total.js\nDone when: run npm test', 'Files: src/cart/total.js, NOTES.md\nDone when: run npm test', 'Files: NOTES.md\nFiles: src/cart/total.js\nDone when: run npm test', P('Files: NOTES.md, src/cart/total.js', { 'CLAUDE.md': 'Done when: run npm test' })],
    fail: ['Files: src/cart/total.js\nDone when: run npm test', 'Done when: run npm test', 'Files: NOTES.md\nDone when: run npm test', 'Files: src/cart/\nDone when: run npm test', 'Files: NOTES.md, src/cart/total.js',
      'Files: NOTES.md, src/cart/\nDone when: run npm test', 'Files: NOTES.md', '', F({ 'CLAUDE.md': 'Done when: run npm test' })],
    refused: ['Files: src/cart/ghost.js', 'Files: ../x'] },

  { at: [8, 0],
    pass: ['Constraints: only edit src/\nDone when: run npm test', 'Constraints: do not edit tests/\nConstraints: do not edit package.json\nDone when: run npm test', 'Constraints: only edit src/price.js\nDone when: run npm test',
      'Constraints: ask before edit tests/\nConstraints: ask before edit package.json\nDone when: run npm test', P('Constraints: only edit src/', { 'CLAUDE.md': 'Done when: run npm test' })],
    fail: ['Constraints: do not edit tests/\nDone when: run npm test', 'Constraints: do not edit package.json\nDone when: run npm test', 'Done when: run npm test', 'Constraints: only edit src/', 'Constraints: do not edit src/\nDone when: run npm test', '',
      P('Done when: run npm test', { 'CLAUDE.md': 'only edit src/' }), P('Done when: run npm test', { 'CLAUDE.md': 'do not edit tests/\ndo not edit package.json' }), F({ 'CLAUDE.md': 'only edit src/\nDone when: run npm test' }),
      P('Done when: run npm test', { '.claude/permissions.txt': 'deny edit tests/\ndeny edit package.json' })],
    refused: ['Constraints: only edit ghost/\nDone when: run npm test', 'Done when: run ghost'] },
  { at: [8, 1],
    pass: ['Done when: run npm run check', 'Done when: run npm run check\nFiles: src/price.js', 'Constraints: do not edit tests/\nDone when: run npm run check', P('Done when: run npm run check', { 'CLAUDE.md': 'Done when: run npm test' })],
    fail: ['Done when: run npm test', 'Goal: fix the rounding bug', 'Done when: run npm run lint', 'Done when: read README.md', 'Done when: run npm run check\nConstraints: do not edit src/', '',
      F({ 'CLAUDE.md': 'Done when: run npm run check' }), P('Goal: fix the rounding bug', { 'CLAUDE.md': 'Done when: run npm run check' })],
    refused: ['Done when: run ghost', 'Done when: run npm run verify'] },
  { at: [8, 2],
    pass: ['Constraints: do not run git push origin main', 'Constraints: ask before run git push origin main', 'Constraints: do not run git push origin main\nDone when: run npm test'],
    fail: ['Constraints: do not run gh pr create', 'Done when: run npm test', 'Constraints: do not run git push origin fix-rounding', 'Constraints: do not run git push origin main\nConstraints: do not run git push origin fix-rounding',
      'Constraints: do not run git push origin main\nConstraints: do not run gh pr create', 'Constraints: do not run git push origin main\nConstraints: do not edit src/price.js', '',
      F({ 'CLAUDE.md': 'do not run git push origin main' }), F({ '.claude/permissions.txt': 'deny run git push origin main' }), F({ '.claude/hooks.txt': 'before run git push origin main' })],
    refused: ['Constraints: do not run git push', 'Constraints: do not run git push origin dev'] },

  { at: [9, 0],
    pass: ['Use: scout\nDone when: run npm test', 'Use: scout', 'Use: scout\nPlan: first\nDone when: run npm test', P('Use: scout', { 'CLAUDE.md': 'Done when: run npm test' }), 'Use: scout\nConstraints: do not edit tests/\nDone when: run npm test'],
    fail: ['Files: src/\nDone when: run npm test', 'Done when: run npm test', 'Files: src/price.js\nUse: scout\nDone when: run npm test', 'Files: src/price.js\nDone when: run npm test', 'Use: scout\nConstraints: do not edit src/\nDone when: run npm test', '',
      F({ 'CLAUDE.md': 'Use: scout\nDone when: run npm test' }), P('Done when: run npm test', { 'CLAUDE.md': 'Use: scout' })],
    refused: ['Use: ghost', 'Use: scout, ghost'] },
  { at: [9, 1],
    pass: ['Use: scout\nDone when: run npm test', 'Use: analyst\nDone when: run npm test', 'Use: scout', 'Use: scout, scout', P('Use: architect', SMALL_ARCH)],
    fail: ['Use: architect\nDone when: run npm test', 'Use: scout, analyst', 'Use: scout, architect', 'Use: scout, analyst, architect', 'Done when: run npm test', 'Files: src/price.js\nUse: scout', 'Files: src/price.js\nDone when: run npm test', '',
      F({ 'CLAUDE.md': 'Use: scout' }), P('Done when: run npm test', { 'CLAUDE.md': 'Use: scout' })],
    refused: ['Use: ghost', 'Use: scout, helper'] },
  { at: [9, 2],
    pass: ['Use: scout, scout2', 'Use: scout2, scout', 'Use: scout, scout2\nDone when: run npm test', P('Use: scout, scout2, architect', SMALL_ARCH)],
    fail: ['Use: scout', 'Use: scout2', 'Use: scout, scout', 'Use: architect', 'Use: scout, architect', 'Use: scout, scout2, architect', 'Done when: run npm test', 'Files: src/price.js\nUse: scout, scout2', '',
      F({ 'CLAUDE.md': 'Use: scout, scout2' }), P('Done when: run npm test', { 'CLAUDE.md': 'Use: scout, scout2' })],
    refused: ['Use: scout3', 'Use: scout, scout2, ghost'] },

  { at: [10, 0],
    pass: [H(HEAD + 'after edit src/ run npm run lint\n'), H('after edit src/ run npm run lint'), H('after edit src/price.js run npm run lint'), H(HEAD + 'after edit src/ run npm run lint\nafter edit docs/ run npm test\n')],
    fail: [{}, H(''), H(HEAD + 'after edit docs/ run npm run lint\n'), H('after edit src/ run npm test'), H('after edit src/ run npm run ghost'), H('before run npm run lint'), H('after src/ run npm run lint'),
      F({ 'CLAUDE.md': 'Done when: run npm run lint' }), F({ 'CLAUDE.md': 'Done when: run npm test' }), F({ '.claude/hook.txt': 'after edit src/ run npm run lint' }), F({ '.claude/notes.txt': 'after edit src/ run npm run lint' })] },
  { at: [10, 1],
    pass: [H(HEAD + 'after edit src/ run npm run format\n'), H('after edit src/price.js run npm run format'), H('after edit src/ run npm run format\nafter edit src/ run npm run lint')],
    fail: [{}, H(''), H('after edit src/ run npm run lint'), H('after edit src/ run npm run lint\nafter edit src/ run npm run format'), H('after edit docs/ run npm run format'), H('after edit src/ run npm test'), H('before run npm run format'),
      F({ 'CLAUDE.md': 'Done when: run npm run format' }), F({ 'CLAUDE.md': 'Done when: run npm run lint' }), F({ '.claude/formatter.txt': 'after edit src/ run npm run format' })] },
  { at: [10, 2],
    pass: [H(HEAD + 'before run npm run deploy\nafter edit src/ run npm run lint\n'), H('after edit src/ run npm run lint\nbefore run npm run deploy'), H('before run npm run deploy\nafter edit src/price.js run npm run lint')],
    fail: [{}, H(''), H('before run npm run deploy'), H('after edit src/ run npm run lint'), H('before run npm run deploy\nbefore run npm run lint'), H('after run npm run deploy\nafter edit src/ run npm run lint'), H('before run npm run deploy\nafter edit src/ run npm test'),
      F({ 'CLAUDE.md': 'do not run npm run deploy\nDone when: run npm run lint' }), F({ '.claude/hook.txt': 'before run npm run deploy\nafter edit src/ run npm run lint' }),
      F({ '.claude/permissions.txt': 'deny run npm run deploy', '.claude/hooks.txt': 'after edit src/ run npm run lint' })] },

  { at: [11, 0],
    pass: [CMD('fix', GOAL + RULE + CHECK), CMD('fix', RULE + CHECK), CMD('fix', GOAL + 'Constraints: only edit src/\n' + CHECK), CMD('fix', GOAL + 'Constraints: ask before edit migrations/\n' + CHECK),
      CMD('fix', GOAL + RULE + 'Constraints: do not delete src/\n' + CHECK)],
    fail: [{}, CMD('fix', GOAL + CHECK), CMD('fix', GOAL + RULE), CMD('fix', GOAL + 'Constraints: only edit src/price.js\n' + CHECK), CMD('fix', GOAL + 'Constraints: do not edit src/\n' + CHECK), CMD('fix', ''),
      CMD('fix', GOAL + RULE + 'Done when: run npm run lint\n'), CMD('fix', GOAL + CHECK + 'Constraints: do not edit tests/\n'),
      F({ 'CLAUDE.md': 'do not edit migrations/\nDone when: run npm test' }), F({ 'CLAUDE.md': 'do not edit migrations/\nDone when: run npm test', '.claude/permissions.txt': 'deny edit migrations/' }),
      CMD('other', GOAL + RULE + CHECK)],
    refused: [CMD('fix', GOAL + 'Constraints: be careful'), CMD('fix', GOAL + 'Done when: run ghost'), CMD('fix', GOAL + 'Use: fix')] },
  { at: [11, 1],
    pass: ['Use: fix', 'Use: fix\nFiles: src/price.js, src/tax.js', 'Use: fix\nConstraints: do not edit tests/', 'Use: fix\nPlan: first', 'Use: fix\n' + CHECK, 'Use: fix, fix', P('Use: fix', { 'CLAUDE.md': 'Done when: run npm test' })],
    fail: ['Use: docs', 'Use: audit', 'Use: docs, audit', 'Goal: fix the rounding bugs', 'Done when: run npm test', '',
      'Constraints: do not edit migrations/\nDone when: run npm test', 'Use: docs\nConstraints: do not edit migrations/\nDone when: run npm test', 'Use: audit\nConstraints: do not edit migrations/\nDone when: run npm test',
      F({ 'CLAUDE.md': 'do not edit migrations/\nDone when: run npm test' }), P('Done when: run npm test', { 'CLAUDE.md': 'do not edit migrations/' }), 'Use: fix\nUse: docs',
      P('Use: fixit', { '.claude/commands/fixit.md': GOAL + RULE + CHECK }), P('Use: fix', { '.claude/commands/fix.md': GOAL })],
    refused: ['Use: ghost', 'Use: fix, ghost', 'Use: fix\nConstraints: be careful', P('Use: fix', { '.claude/commands/fix.md': 'Use: docs' })] },
  { at: [11, 2],
    pass: ['Use: check\nDone when: run npm test', 'Use: check\nDone when: run npm test\nConstraints: do not edit tests/', 'Use: check\nDone when: run npm test\nFiles: src/price.js, src/tax.js', 'Use: check\nDone when: run npm test\nPlan: first'],
    fail: ['Use: check', 'Done when: run npm test', '', 'Use: check\nDone when: run npm run lint', 'Use: check\nDone when: read src/tax.js',
      'Constraints: do not edit migrations/\nDone when: run npm test', P('Done when: run npm test', { 'CLAUDE.md': 'do not edit migrations/' }), P('Use: check', { 'CLAUDE.md': 'Done when: run npm test' }),
      F({ 'CLAUDE.md': 'do not edit migrations/\nDone when: run npm test' }), P('Use: check', { '.claude/commands/check.md': GOAL + RULE + CHECK }),
      P('Use: tests\nDone when: run npm test', { '.claude/commands/tests.md': RULE })],
    refused: ['Use: ghost\nDone when: run npm test', 'Use: check\nDone when: run ghost'] },

  { at: [12, 0],
    pass: [MCP('tracker: list_issues, comment\nbrowser: open, click\ndocs: search\n'), MCP('docs: search'), MCP('docs: lookup, search'), MCP('# servers\ndocs: search, lookup\ntracker: comment')],
    fail: [{}, MCP(''), MCP('docs: lookup'), MCP('docs: lookup\ntracker: list_issues, comment'), MCP('doc: search'), MCP('tracker: docs, search'), MCP('search: docs'), MCP('docs: Search'),
      F({ 'CLAUDE.md': 'Done when: call docs.search' }), F({ '.claude/mcp.json': 'docs: search' }), F({ '.claude/mcp.txt': 'docs: search', '.claude/permissions.txt': 'deny call docs.search' })] },
  { at: [12, 1],
    pass: [MCP('browser: open, click, screenshot'), MCP('browser: screenshot'), MCP('browser: screenshot, open'), MCP('# browser\nbrowser: screenshot\ntracker: comment')],
    fail: [{}, MCP(''), MCP('browse: open, screenshot'), MCP('browser: open, click'), MCP('browser: shot'), MCP('screenshot: browser'), MCP('tracker: screenshot'),
      F({ 'CLAUDE.md': 'Done when: call browser.screenshot' }), F({ 'CLAUDE.md': 'Done when: run npm test' }), F({ '.claude/mcp.txt': 'browser: screenshot', '.claude/permissions.txt': 'deny call browser.screenshot' }), F({ '.claude/mcp.json': 'browser: screenshot' })] },
  { at: [12, 2],
    pass: [MCP('tracker: list_issues, comment'), MCP('tracker: list_issues, create_issue, comment'), MCP('tracker: comment, list_issues')],
    fail: [{}, MCP(''), MCP('tracker: list_issues'), MCP('tracker: comment'), MCP('tracker: list_issues, comment, close'), MCP(TRACKER), MCP('tracker: close'), MCP('tracker: list_issues, create_issue'),
      F({ '.claude/permissions.txt': 'deny call tracker.close' }), F({ '.claude/permissions.txt': 'deny call tracker.close', '.claude/mcp.txt': 'tracker: list_issues, comment, close' }),
      F({ '.claude/hooks.txt': 'before call tracker.close' }), F({ 'CLAUDE.md': 'do not call tracker.close' })] },

  { at: [13, 0],
    pass: [JOB(PG + 'Done when: run npm test\n'), JOB(PG + 'Plan: off\nDone when: run npm test\n'), JOB('Done when: run npm test\n'), JOB(PG + 'Done when: run npm test\nConstraints: do not edit tests/\n'),
      F({ '.claude/commands/nightly-fix.md': '', 'CLAUDE.md': NOTES + 'Done when: run npm test\n' })],
    fail: [{}, JOB(''), JOB(PG + 'Plan: first\n'), JOB(PG + 'Plan: first\nDone when: run npm test\n'), JOB(PG), JOB(PG + 'Plan: first\nDone when: run npm test\nPlan: off'), PERM(''), PERM('allow edit src/price.js'),
      // moved into the root CLAUDE.md with the Plan left in the command: the job still stalls
      F({ 'CLAUDE.md': NOTES + 'Done when: run npm test\n' }), F({ 'CLAUDE.md': NOTES + 'Plan: first\nDone when: run npm test\n' }),
      F({ '.claude/commands/nightly.md': PG + 'Done when: run npm test\n' })] },
  { at: [13, 1],
    pass: [PERM('allow edit src/price.js\nallow run npm test\n'), PERM('allow run npm test\nallow edit src/price.js'), PERM('# the job\nallow edit src/price.js\nallow run npm test\nallow read src/'),
      PERM('allow edit src/price.js\nallow run npm test\nallow run npm run lint'), PERM('allow edit src/price.js\nallow run npm test\ndeny run npm run deploy')],
    fail: [{}, PERM(''), PERM('allow edit src/price.js'), PERM('allow run npm test'), PERM('allow edit src/\nallow run npm'), PERM('allow edit src/\nallow run npm test'), PERM('allow edit src/price.js\nallow run npm'),
      PERM('allow edit src/price.js\nallow run npm test\nallow run npm run deploy'), PERM('allow edit src/price.js\nallow run npm test\nallow edit src/legacy/old.js'), PERM('allow edt src/price.js\nallow run npm test'),
      PERM('deny edit src/legacy/\ndeny run npm run deploy'),
      F({ 'CLAUDE.md': 'allow edit src/price.js\nallow run npm test' }), F({ 'CLAUDE.md': NOTES + 'Done when: run npm test\n', '.claude/permissions.txt': '' }), F({ '.claude/hooks.txt': 'after edit src/ run npm test' }),
      // a list in a file the job never reads
      F({ '.claude/allow.txt': 'allow edit src/price.js\nallow run npm test' })] },
  { at: [13, 2],
    pass: [JOB(TG + 'Files: ci/last-run.log, src/tax.js\nDone when: run npm test\n'), JOB(TG + 'Files: src/tax.js, ci/last-run.log\nDone when: run npm test\n'), JOB(TG + 'Files: ci/last-run.log\nFiles: src/tax.js\nDone when: run npm test\n'),
      JOB(TG + 'Files: ci/, src/tax.js\nDone when: run npm test\n')],
    fail: [{}, JOB(''), JOB(TG + 'Files: src/tax.js\nDone when: run npm test\n'), JOB(TG + 'Files: ci/last-run.log\nDone when: run npm test\n'), JOB(TG + 'Files: ci/last-run.log, src/\nDone when: run npm test\n'),
      JOB(TG + 'Files: src/\nDone when: run npm test\n'), JOB(TG + 'Done when: run npm test\n'),
      // the pointer in a file the job does not read as a prompt, and a permissions list gone
      F({ 'CLAUDE.md': 'Files: ci/last-run.log, src/tax.js\nDone when: run npm test' }),
      F({ '.claude/commands/nightly-fix.md': TG + 'Files: ci/last-run.log, src/tax.js\nDone when: run npm test\n', '.claude/permissions.txt': '' }),
      F({ '.claude/commands/nightly.md': TG + 'Files: ci/last-run.log, src/tax.js\nDone when: run npm test\n' })] },

  { at: [14, 0],
    pass: [ROOT(VERIFY), ROOT('do not edit migrations/\n' + VERIFY), F({ 'CLAUDE.md': VERIFY }), ROOT('done when: run npm run verify'), ROOT(VERIFY + 'Done when: run npm test\n'), ROOT('only edit src/\n' + VERIFY)],
    fail: [{}, F({ 'CLAUDE.md': '' }), ROOT(''), ROOT('Done when: run npm test'), ROOT('Done when: run npm run lint'), ROOT('Done when: run npm run verfy'), ROOT('Done when: run npm test\n' + VERIFY), ROOT('Done when: read README.md'),
      F({ '.claude/notes.txt': VERIFY }), F({ 'src/CLAUDE.md': VERIFY }), F({ '.claude/hooks.txt': 'after edit src/ run npm run verify' }),
      // a hook that runs the command checks the file but is not the check written in memory
      F({ '.claude/hooks.txt': 'after edit src/ run npm run verify', 'CLAUDE.md': NOTES + 'Done when: run npm test\n' })] },
  { at: [14, 1],
    pass: [F({ 'CLAUDE.md': NOTES + VERIFY }), F({ 'CLAUDE.md': NOTES + VERIFY, 'src/CLAUDE.md': VERIFY }), F({ 'CLAUDE.md': NOTES + VERIFY, 'src/CLAUDE.md': '' }), F({ 'CLAUDE.md': NOTES + 'Done when: run npm run verfy\n' + VERIFY }), F({ 'CLAUDE.md': VERIFY })],
    fail: [{}, F({ 'CLAUDE.md': NOTES + 'Done when: run npm test\n' }), F({ 'CLAUDE.md': NOTES + 'Done when: run npm run verfy\n' }), F({ 'CLAUDE.md': NOTES }), F({ 'CLAUDE.md': '' }), F({ 'CLAUDE.md': NOTES, 'src/CLAUDE.md': VERIFY }),
      F({ 'CLAUDE.md': NOTES + 'Done when: run npm run Verify\n' }), F({ 'CLAUDE.md': NOTES + 'Done when: run npm run verfy\n', '.claude/hooks.txt': 'after edit src/ run npm run verify' }), F({ 'CLAUDE.md': NOTES + 'Done when: run npm test\n', 'src/CLAUDE.md': VERIFY })] },
  { at: [14, 2],
    pass: [ROOT('do not edit generated/\n' + VERIFY), ROOT(VERIFY + 'do not edit generated/\n'), F({ 'CLAUDE.md': 'do not edit generated/\nDone when: run npm run verify' }), ROOT('only edit src/\n' + VERIFY)],
    fail: [{}, F({ 'CLAUDE.md': '' }), ROOT('do not edit generated/\n'), ROOT('do not edit generated/\nDone when: run npm test\n'), ROOT(VERIFY), ROOT('do not edit src/\n' + VERIFY), ROOT('do not edit generated/\nDone when: run npm run verfy\n'),
      F({ '.claude/hooks.txt': 'after edit src/ run npm run verify', 'CLAUDE.md': NOTES + 'do not edit generated/\n' }), F({ '.claude/notes.txt': 'do not edit generated/\n' + VERIFY })] },
];

runCases(AQ, 'chapters 8 to 15: lazy and nearby answers are caught', CASES, (c) => !inDev(c));

describe('dev chapters', () => {
  it('are frozen at 8 chapters (indexes 7 to 14) of 3 missions each, in tier dev, after the 7 core chapters', () => {
    assert.deepEqual([...DEV], [7, 8, 9, 10, 11, 12, 13, 14]);
    assert.equal(AQ.CH.length, 15);
    assert.deepEqual([...AQ.CH.slice(7).map((ch) => ch.missions.length)], [3, 3, 3, 3, 3, 3, 3, 3]);
    assert.ok(AQ.CH.slice(7).every((ch) => ch.tier === 'dev'));
    assert.ok(AQ.CH.slice(0, 7).every((ch) => ch.tier === 'core'));
  });
  it('the starting setup of every mission fails its own check', () => {
    for (const c of DEV) AQ.CH[c].missions.forEach((m, i) => assert.equal(typeof AQ.runMission(m, {}, { approved: true }), 'string', `[${c}, ${i}]`));
  });
  it('the tables of chapters 11, 12 and 14 each hold an input that creates a .claude/ file the scenario does not ship, and it fails', () => {
    const unshipped = (m, x) => !!x && typeof x === 'object' && Object.keys(x.files || {}).some((p) => p.startsWith('.claude/') && !Object.prototype.hasOwnProperty.call(AQ.scenarios[m.scenario].vfs, p));
    for (const k of CASES.filter((x) => [10, 11, 13].includes(x.at[0]))) assert.ok(k.fail.some((x) => unshipped(M(...k.at), x)), `[${k.at}]`);
  });
  it('every table of every dev chapter holds a failing row that puts lines in the root CLAUDE.md', () => {
    for (const k of CASES.filter((x) => inDev(x.at[0]))) assert.ok(k.fail.some((x) => x && typeof x === 'object' && x.files && 'CLAUDE.md' in x.files), `[${k.at}]`);
  });
  it('the answer, wrong and lazy inputs and the passing table inputs only edit files their scenario ships', () => {
    const ships = (m, x) => { if (x && typeof x === 'object') for (const p of Object.keys(x.files || {})) assert.ok(Object.prototype.hasOwnProperty.call(AQ.scenarios[m.scenario].vfs, p), `${m.title}: ${p}`); };
    for (const k of CASES) { const m = M(...k.at); [m.answer, m.wrong, m.lazy, ...k.pass].forEach((x) => ships(m, x)); }
  });
});

describe('dev missions that use Plan wait for approval', () => {
  it('a Plan: first answer pauses the run, and approving finishes it', () => {
    for (const c of DEV) AQ.CH[c].missions.forEach((m, i) => {
      if (!AQ.prepare(m, m.answer).prompt.plan) return;
      const r = AQ.evaluate(m, m.answer);
      assert.equal(r.awaiting, true, `[${c}, ${i}]`);
      assert.equal(typeof r.result, 'string');
      assert.equal(AQ.runMission(m, m.answer, { approved: true }), true);
    });
  });
});

describe('dev scenarios are valid', () => {
  const used = [...new Set(DEV.flatMap((c) => AQ.CH[c].missions.map((m) => m.scenario)))];
  it('focus is a subset of explore, and the flags are booleans', () => {
    for (const name of used) {
      const s = AQ.scenarios[name];
      for (const f of s.focus || []) assert.ok((s.explore || []).includes(f), `${name}: ${f}`);
      for (const f of ['unattended', 'connected']) assert.ok(s[f] === undefined || typeof s[f] === 'boolean', `${name}.${f}`);
    }
  });
  it('every correction is idempotent: it fixes once, then has nothing left to fix', () => {
    for (const name of used) {
      const s = AQ.scenarios[name];
      if (!s.correction) continue;
      const v = AQ.vfs.create(s.vfs), fix = s.correction(v, 0);
      if (fix) assert.ok(v.write(fix.target, fix.write), name);
      assert.equal(s.correction(v, 0), null, name);
      const m = DEV.flatMap((c) => AQ.CH[c].missions).find((x) => x.scenario === name);
      assert.equal(s.correction(AQ.evaluate(m, m.answer).outcome.vfs, 0), null, `${name} after the answer`);
    }
  });
  it('a script step that needs a file is never given a read step for it', () => {
    for (const name of ['survey', 'handoff']) assert.ok(!AQ.scenarios[name].script.some((a) => a.verb === 'read'), name);
  });
});

describe('8.1 Look without touching', () => {
  it('the finding is written only after the cart code was read, and the code stays untouched', () => {
    const { outcome } = go(7, 0, 'Constraints: only edit NOTES.md');
    assert.match(outcome.vfs.read('NOTES.md'), /total\(\)/);
    assert.equal(outcome.vfs.read('src/cart/total.js'), AQ.scenarios.survey.vfs['src/cart/total.js']);
    assert.equal(outcome.violations.length, 0);
  });
  it('a scope of the notes alone skips the edit as not seen yet, and the messages name the gap', () => {
    const r = go(7, 0, 'Constraints: only edit NOTES.md\nFiles: NOTES.md');
    assert.ok(r.outcome.steps.some((s) => s.type === 'skip' && s.by === 'not seen yet' && s.target === 'NOTES.md'));
    assert.match(r.result, /no finding/);
    assert.match(go(7, 0, 'Goal: look around').result, /Nothing limited/);
  });
});

describe('8.2 Cap the change', () => {
  it('the tidy-up edit comes last, so a cap of two keeps both fixes and a cap of one drops the tax fix', () => {
    assert.equal(AQ.scenarios.creep.script.at(-1).target, 'src/format.js');
    assert.equal(go(7, 1, M(7, 1).answer).outcome.violations.length, 0);
    assert.match(go(7, 1, M(7, 1).wrong).result, /src\/tax\.js still rounds/);
    assert.match(go(7, 1, M(7, 1).lazy).result, /Nothing capped/);
  });
});

describe('8.3 Hand the notes to the next run', () => {
  it('the goal states the limit, the answer stays under it and reading the whole folder does not', () => {
    assert.ok(M(7, 2).goal.includes(` ${AQ.PEAK} tokens`));
    assert.ok(go(7, 2, M(7, 2).answer).outcome.tokens.peak <= AQ.PEAK);
    assert.ok(go(7, 2, M(7, 2).lazy).outcome.tokens.peak > AQ.PEAK);
  });
  it('each gap in the input gets its own message', () => {
    assert.match(go(7, 2, M(7, 2).wrong).result, /never read the notes/);
    assert.match(go(7, 2, 'Files: NOTES.md\nDone when: run npm test').result, /read the notes but never opened/);
    assert.match(go(7, 2, M(7, 2).lazy).result, /most allowed here is/);
    assert.match(go(7, 2, 'Files: NOTES.md, src/cart/total.js').result, /never verified/);
  });
  it('AQ.verdict does not itself require done: the status check is the mission\'s own', () => {
    const { outcome, prompt, setup } = AQ.evaluate(M(7, 2), 'Files: NOTES.md, src/cart/total.js');
    assert.equal(outcome.status, 'unverified');
    assert.equal(AQ.verdict(outcome, { prompt, setup, scenario: AQ.scenarios.handoff }), true);
  });
  it('defines the pull request in one sentence', () => assert.match(M(7, 2).explain, /pull request \(PR\): the page where teammates read your change before it joins the main code/));
});

describe('9.1 Protect the judge', () => {
  it('both cheats pass npm test on their own, so each needs a fence', () => {
    for (const files of [{ 'tests/price.test.js': "test.skip('adds cents', () => {});\n" }, { 'package.json': '{ "scripts": { "test": "echo ok" } }\n' }]) {
      const v = AQ.vfs.create({ ...AQ.scenarios.gamed.vfs, ...files });
      assert.equal(AQ.scenarios.gamed.commands['npm test'](v).ok, true, Object.keys(files)[0]);
    }
    assert.equal(AQ.scenarios.gamed.commands['npm test'](AQ.vfs.create(AQ.scenarios.gamed.vfs)).ok, false);
  });
  it('the lazy run edits both judges, and the fence is read from the prompt only', () => {
    assert.equal(go(8, 0, M(8, 0).lazy).outcome.violations.length, 2);
    assert.match(go(8, 0, P('Done when: run npm test', { 'CLAUDE.md': 'only edit src/' })).result, /does not stop the agent/);
  });
});

describe('9.2 Run the repo\'s own gate', () => {
  it('the gate command rejects a leftover console.log, and only the typed line passes', () => {
    assert.equal(AQ.scenarios.gate.commands['npm run check'](AQ.vfs.create({ ...AQ.scenarios.gate.vfs, 'src/price.js': 'console.log(1);\nMath.round(' })).ok, false);
    assert.match(go(8, 1, M(8, 1).wrong).result, /console\.log/);
    assert.equal(go(8, 1, F({ 'CLAUDE.md': 'Done when: run npm run check' })).result, 'The gate ran, but not from a Done when line in your prompt.');
  });
});

describe('9.3 Open the PR, never push to main', () => {
  it('the branch is pushed before the PR opens, and a ban on the branch push leaves no PR', () => {
    const { outcome } = go(8, 2, M(8, 2).answer);
    const runs = outcome.calls.filter((x) => x.verb === 'run').map((x) => x.target);
    assert.deepEqual([...runs], ['npm test', 'git push origin fix-rounding', 'gh pr create']);
    assert.match(go(8, 2, 'Constraints: do not run git push origin main\nConstraints: do not run git push origin fix-rounding').result, /No pull request/);
  });
});

const helpers = (c, i, input) => go(c, i, input).outcome.steps.filter((s) => s.type === 'delegate');
const W = () => AQ.context.WINDOW;

describe('10.1 Send the search away', () => {
  it('one helper reads all ten files and still has at least 15% of its window to spare', () => {
    assert.equal(AQ.scenarios.haystack.explore.length, 10);
    const [d] = helpers(9, 0, M(9, 0).answer);
    assert.equal(d.files, 10);
    assert.ok(d.tokens <= W() * 0.85, `${d.tokens} tokens`);
    assert.equal(d.over, false);
  });
  it('the goal states the limit, the helper keeps the main agent under it, and reading the folder yourself does not', () => {
    assert.ok(M(9, 0).goal.includes(` ${AQ.PEAK} tokens`));
    assert.ok(go(9, 0, M(9, 0).answer).outcome.tokens.peak <= AQ.PEAK);
    assert.ok(go(9, 0, M(9, 0).wrong).outcome.tokens.peak > AQ.PEAK);
  });
  it('a named file leaves the helper nothing to search, and the message says so', () => {
    assert.equal(helpers(9, 0, 'Files: src/price.js\nUse: scout')[0].files, 0);
    assert.match(go(9, 0, 'Files: src/price.js\nUse: scout').result, /Nobody searched for you/);
  });
});

describe('10.2 Pay only for the helpers you use', () => {
  it('the setup holds three helpers but a run pays only for the ones it names', () => {
    assert.equal(AQ.config.agentCost(AQ.config.parseSetup(AQ.vfs.create(AQ.scenarios.team.vfs))), 14);
    assert.equal(AQ.helperCost(go(9, 1, 'Use: scout').outcome), 1);
    assert.equal(AQ.helperCost(go(9, 1, 'Use: scout, analyst').outcome), 4);
  });
  it('four files fit in one helper, and the goal states the unit limit', () => {
    assert.equal(AQ.scenarios.team.explore.length, 4);
    assert.ok(helpers(9, 1, M(9, 1).answer)[0].tokens < W());
    assert.ok(M(9, 1).goal.includes(' 3 units'));
  });
  it('the cost message names what the run paid', () => {
    assert.match(go(9, 1, M(9, 1).wrong).result, /cost 10 units\. The most allowed here is 3/);
    assert.match(go(9, 1, 'Use: scout, analyst').result, /cost 4 units/);
  });
});

describe('10.3 Split a huge search', () => {
  it('one helper holds more than its window, and two helpers split five files three and two, each within it', () => {
    const [one] = helpers(9, 2, 'Use: scout');
    assert.equal(one.files, 5);
    assert.ok(one.tokens > W() && one.over, `${one.tokens} tokens`);
    const [a, b] = helpers(9, 2, M(9, 2).answer);
    assert.deepEqual([a.files, b.files], [3, 2]);
    assert.ok(a.tokens <= W() && b.tokens <= W() && !a.over && !b.over, `${a.tokens} and ${b.tokens}`);
    assert.equal(AQ.scenarios.huge.explore[0], 'src/price.js');
  });
  it('the goal states the window and the unit limit', () => {
    assert.ok(M(9, 2).goal.includes(` ${W()} tokens`));
    assert.ok(M(9, 2).goal.includes(' 3 units'));
  });
  it('an empty third chunk still costs, and every message names its gap', () => {
    assert.equal(AQ.helperCost(go(9, 2, 'Use: scout, scout2, architect').outcome), 12);
    assert.match(go(9, 2, M(9, 2).wrong).result, /more than its window of 2000 tokens/);
    assert.match(go(9, 2, 'Use: scout, architect').result, /cost 11 units/);
    assert.match(go(9, 2, M(9, 2).lazy).result, /Nobody searched/);
  });
});

describe('the reworded 2.5 and 6.4 messages (d10)', () => {
  it('say a helper costs whenever it runs, and the setup price is the most a run could cost', () => {
    assert.match(go(1, 4, { files: {} }).result, /costs 10 units whenever it runs/);
    assert.match(go(5, 3, { files: {} }).result, /would cost 20 units if every one of them ran/);
  });
});

describe('11.1 A check after every edit', () => {
  it('the lint hook fails on the stray log, the agent repairs it, and the hook passes the second time', () => {
    const hooks = go(10, 0, M(10, 0).answer).outcome.steps.filter((s) => s.type === 'hook');
    assert.deepEqual([...hooks.map((s) => s.ok)], [false, true]);
    assert.ok(go(10, 0, M(10, 0).answer).outcome.steps.some((s) => s.tag === 'fix'));
  });
  it('a Done when line in CLAUDE.md runs the same repair but names no hook', () => {
    assert.match(go(10, 0, F({ 'CLAUDE.md': 'Done when: run npm run lint' })).result, /no hook checked it/);
  });
});

describe('11.2 A hook that fixes the file', () => {
  it('the formatter leaves nothing to repair, and the lint hook only works because the agent repaired the tabs', () => {
    assert.ok(!go(10, 1, M(10, 1).answer).outcome.steps.some((s) => s.tag === 'fix'));
    assert.match(go(10, 1, M(10, 1).wrong).result, /had to repair it itself/);
    assert.match(go(10, 1, F({ 'CLAUDE.md': 'Done when: run npm run format' })).result, /no formatter hook/);
  });
});

describe('11.3 Stop it, then check it', () => {
  it('the deploy is skipped by the hook, and an invalid hook form leaves it running', () => {
    assert.ok(go(10, 2, M(10, 2).answer).outcome.steps.some((s) => s.type === 'skip' && s.by === 'hook' && s.target === 'npm run deploy'));
    assert.match(go(10, 2, H('after run npm run deploy\nafter edit src/ run npm run lint')).result, /run npm run deploy, and nothing told it not to/);
    assert.match(go(10, 2, F({ '.claude/permissions.txt': 'deny run npm run deploy', '.claude/hooks.txt': 'after edit src/ run npm run lint' })).result, /not by a hook/);
  });
  it('no config mission of chapter 11 has a Done when line in its fixed prompt', () => {
    for (const i of [0, 1, 2]) assert.ok(!/done when/i.test(M(10, i).prompt), `[10, ${i}]`);
  });
});

const used = (o) => o.steps.filter((s) => s.type === 'command').map((s) => s.name);

describe('12.1 Save a prompt as a command', () => {
  it('the shipped command holds only a goal, so the run it starts has no rule and no check', () => {
    const f = AQ.config.splitFields(AQ.scenarios.cmdfix.vfs['.claude/commands/fix.md']).fields;
    assert.deepEqual([f.constraints.length, f.donewhen], [0, null]);
    assert.deepEqual([...used(go(11, 0, {}).outcome)], ['fix']);
    assert.equal(go(11, 0, {}).outcome.violations.length, 1);
  });
  it('the rule and the check in the command carry the run, and the command step is shown', () => {
    const r = go(11, 0, M(11, 0).answer);
    assert.equal(r.outcome.violations.length, 0);
    assert.equal(r.outcome.status, 'done');
    assert.deepEqual([...used(r.outcome)], ['fix']);
  });
  it('the same lines in CLAUDE.md pass the run but not the mission, and the message names the file', () => {
    assert.match(go(11, 0, F({ 'CLAUDE.md': 'do not edit migrations/\nDone when: run npm test' })).result, /saved command fix does not hold the rule and the check\. Put them in fix\.md/);
    assert.match(go(11, 0, F({ 'CLAUDE.md': 'do not edit migrations/\nDone when: run npm test', '.claude/permissions.txt': 'deny edit migrations/' })).result, /does not hold the rule and the check/);
  });
  it('a command with a rule but no check, or a check but no rule, fails on the run itself', () => {
    assert.match(go(11, 0, CMD('fix', GOAL + RULE)).result, /src\/tax\.js still rounds/);
    assert.match(go(11, 0, CMD('fix', GOAL + CHECK)).result, /edit migrations\/001\.sql, and nothing told it not to/);
  });
  it('a bad line in the command refuses the run, and a Use line in it is an error', () => {
    assert.match(go(11, 0, CMD('fix', GOAL + 'Use: fix')).result, /was not run/);
    assert.equal(AQ.prepare(M(11, 0), CMD('fix', GOAL + 'Use: fix')).prompt.errors[0].msg, 'a command cannot use other names');
  });
});

describe('12.2 Choose the command that fits', () => {
  it('each command on the shelf does what its name hints, and the three names stay distinct', () => {
    const v = AQ.scenarios.cmdset.vfs, names = Object.keys(v).filter((p) => p.startsWith('.claude/commands/'));
    assert.deepEqual(names.sort(), ['.claude/commands/audit.md', '.claude/commands/docs.md', '.claude/commands/fix.md']);
    assert.equal(AQ.prepare(M(11, 1), 'Use: docs').prompt.constraints[0].kind, 'only');
    assert.equal(AQ.prepare(M(11, 1), 'Use: audit').prompt.plan, true);
  });
  it('the answer runs the command, and the lazy run falls into the migrations trap', () => {
    assert.deepEqual([...used(go(11, 1, M(11, 1).answer).outcome)], ['fix']);
    assert.equal(go(11, 1, M(11, 1).lazy).outcome.violations.length, 1);
    assert.match(go(11, 1, M(11, 1).wrong).result, /still rounds/);
  });
  it('the verdict comes first, then the command check: typed lines pass the run but not the mission', () => {
    assert.equal(go(11, 1, 'Constraints: do not edit migrations/\nDone when: run npm test').result, TYPED);
    assert.equal(go(11, 1, F({ 'CLAUDE.md': 'do not edit migrations/\nDone when: run npm test' })).result, TYPED);
    assert.equal(go(11, 1, 'Use: audit\nConstraints: do not edit migrations/\nDone when: run npm test').result, TYPED);
    assert.match(go(11, 1, 'Use: docs\nConstraints: do not edit migrations/\nDone when: run npm test').result, /check failed/);
    assert.match(go(11, 1, 'Use: audit').result, /nothing told it not to/);
  });
  it('a Plan: first command pauses the run, and approving it finishes the fixed run', () => {
    const r = AQ.evaluate(M(11, 1), 'Use: fix\nPlan: first');
    assert.equal(r.awaiting, true);
    assert.equal(AQ.runMission(M(11, 1), 'Use: fix\nPlan: first', { approved: true }), true);
  });
});

describe('12.3 Your line wins', () => {
  it('the command check is weak: lint passes while the tax rounding is still wrong', () => {
    const { outcome } = go(11, 2, 'Use: check');
    assert.equal(outcome.status, 'done');
    assert.equal(outcome.vfs.read('src/tax.js'), AQ.scenarios.cmdlint.vfs['src/tax.js']);
  });
  it('a typed Done when replaces the command\'s, and the command rule still adds up', () => {
    const p = AQ.prepare(M(11, 2), M(11, 2).answer).prompt;
    assert.deepEqual([p.doneWhen.target, p.constraints.map((x) => x.target)].flat(), ['npm test', 'migrations/']);
    const { outcome } = go(11, 2, M(11, 2).answer);
    assert.equal(outcome.violations.length, 0);
    assert.ok(outcome.steps.some((s) => s.tag === 'verify' && s.target === 'npm test'));
  });
  it('each gap in the input gets its own message', () => {
    assert.match(go(11, 2, '').result, /never called/);
    assert.doesNotMatch(go(11, 2, '').result, /weak one/);
    assert.match(go(11, 2, 'Done when: run npm run lint').result, /never called/);
    assert.match(go(11, 2, M(11, 2).wrong).result, /weak one in the command/);
    assert.match(go(11, 2, P('Use: check', { 'CLAUDE.md': 'Done when: run npm test' })).result, /weak one in the command/);
    for (const x of [M(11, 2).lazy, 'Constraints: do not edit migrations/\nDone when: run npm test', P('Done when: run npm test', { 'CLAUDE.md': 'do not edit migrations/' })]) assert.equal(go(11, 2, x).result, NEVER_USED);
    assert.match(go(11, 2, P('Use: check', { '.claude/commands/check.md': GOAL + RULE + CHECK })).result, /changed the saved command itself/);
  });
});

describe('13.1 Connect the docs server', () => {
  it('chapter 13 scenarios are all connected, and each list names only tools the scenario has', () => {
    for (const i of [0, 1, 2]) {
      const s = AQ.scenarios[M(12, i).scenario];
      assert.equal(s.connected, true, M(12, i).scenario);
      for (const m of AQ.config.parseSetup(AQ.vfs.create(s.vfs)).mcp) for (const t of m.tools) assert.ok(s.tools.includes(`${m.name}.${t}`), `${m.name}.${t}`);
    }
  });
  it('an unconnected docs tool is skipped as not connected, and a docs server with another tool does not help', () => {
    for (const x of [M(12, 0).lazy, M(12, 0).wrong]) assert.ok(go(12, 0, x).outcome.steps.some((s) => s.type === 'skip' && s.by === 'not connected' && s.target === 'docs.search'));
    assert.match(go(12, 0, M(12, 0).wrong).result, /docs server is not connected with that tool/);
    assert.ok(go(12, 0, M(12, 0).answer).outcome.calls.some((x) => x.target === 'docs.search'));
  });
  it('a ban on the tool leaves it connected but unused, and the run still fails', () => {
    const r = go(12, 0, F({ '.claude/mcp.txt': 'docs: search', '.claude/permissions.txt': 'deny call docs.search' }));
    assert.ok(r.outcome.steps.some((s) => s.type === 'skip' && s.by === 'permission rule'));
    assert.match(r.result, /never looked up the current docs/);
  });
});

describe('13.2 Let it look at the page', () => {
  it('the screenshot check ends done when connected, and unverified when it is not', () => {
    assert.equal(go(12, 1, M(12, 1).answer).outcome.status, 'done');
    assert.equal(go(12, 1, M(12, 1).lazy).outcome.status, 'unverified');
    assert.match(go(12, 1, M(12, 1).lazy).result, /screenshot is not connected/);
    assert.match(go(12, 1, M(12, 1).wrong).result, /screenshot is not connected/);
  });
  it('a ban on the tool leaves the page unchecked, and the message says so', () => {
    assert.match(go(12, 1, F({ '.claude/mcp.txt': 'browser: screenshot', '.claude/permissions.txt': 'deny call browser.screenshot' })).result, /never checked with the browser tool/);
  });
});

describe('13.3 Connect only the tools the job needs', () => {
  it('the close is skipped as not connected for the answer, and runs as a mistake for the lazy list', () => {
    const a = go(12, 2, M(12, 2).answer).outcome;
    assert.ok(a.steps.some((s) => s.type === 'skip' && s.by === 'not connected' && s.target === 'tracker.close'));
    assert.ok(a.calls.some((x) => x.target === 'tracker.comment'));
    assert.match(go(12, 2, M(12, 2).lazy).result, /call tracker\.close, and nothing told it not to/);
  });
  it('every way of stopping the close by a rule gets the same message, and an unlisted comment its own', () => {
    for (const x of [F({ '.claude/permissions.txt': 'deny call tracker.close' }), F({ '.claude/permissions.txt': 'deny call tracker.close', '.claude/mcp.txt': 'tracker: list_issues, comment, close' }), F({ '.claude/hooks.txt': 'before call tracker.close' }), F({ 'CLAUDE.md': 'do not call tracker.close' })]) {
      assert.match(go(12, 2, x).result, /stopped, but by a rule\. This mission is about leaving the tool out of the list/);
    }
    assert.match(go(12, 2, M(12, 2).wrong).result, /never commented on the issue/);
  });
  it('a rule on list_issues is not reported as the tool being not connected', () => {
    const r = go(12, 2, F({ '.claude/mcp.txt': 'tracker: list_issues, comment', '.claude/permissions.txt': 'deny call tracker.list_issues' })).result;
    assert.doesNotMatch(String(r), /because that tool is not connected/);
  });
  it('the explain names 5.4 and says what is different', () => {
    assert.match(M(12, 2).explain, /mission 5\.4/);
    assert.match(M(12, 2).explain, /5\.4 saved tokens, and 13\.3 is about availability/);
  });
});

const skipped = (o, verb, target) => o.steps.find((s) => s.type === 'skip' && s.verb === verb && s.target === target);

describe('chapter 14 jobs are unattended', () => {
  it('all three scenarios are unattended, start from a simulated workflow, and ship the job files the learner edits', () => {
    for (const i of [0, 1, 2]) {
      const s = AQ.scenarios[M(13, i).scenario];
      assert.equal(s.unattended, true, M(13, i).scenario);
      assert.match(s.vfs['.github/workflows/nightly.yml'], /simulated/);
      for (const p of ['ci/last-run.log', '.claude/commands/nightly-fix.md', '.claude/permissions.txt']) assert.ok(typeof s.vfs[p] === 'string', `${M(13, i).scenario}: ${p}`);
      assert.equal(M(13, i).prompt, 'Use: nightly-fix');
    }
  });
});

describe('14.1 Nobody there to approve', () => {
  it('a Plan stalls the job: the run is blocked, never awaiting, and the messages differ for a stall and for no check', () => {
    const r = AQ.evaluate(M(13, 0), {}, { approved: true });
    assert.ok(!r.awaiting);
    assert.equal(r.outcome.status, 'blocked');
    assert.ok(r.outcome.steps.some((s) => s.type === 'stall'));
    assert.match(go(13, 0, M(13, 0).wrong).result, /waited for an approval nobody could give/);
    assert.match(go(13, 0, JOB('')).result, /never finished a checked fix/);
    assert.match(go(13, 0, JOB(PG)).result, /never finished a checked fix/);
  });
  it('without the Plan the job fixes the price through the correction loop and ends done', () => {
    const { outcome } = go(13, 0, M(13, 0).answer);
    assert.equal(outcome.status, 'done');
    assert.ok(outcome.steps.some((s) => s.tag === 'fix'));
    assert.equal(outcome.violations.length, 0);
  });
  it('the card says the permissions file lists the actions, but leaves the allow line for the next mission', () => {
    const card = [M(13, 0).goal, M(13, 0).explain, M(13, 0).hint, ...M(13, 0).how].join('\n');
    assert.doesNotMatch(card, /\ballow (?:edit|read|run|call|send|delete)\b/);
    assert.match(card, /already lists the two actions the job may take/);
  });
});

describe('14.2 Pre-approve exactly what it needs', () => {
  it('with no list every edit and the check are skipped as nobody to ask, and only the read runs', () => {
    const { outcome } = go(13, 1, M(13, 1).lazy);
    assert.deepEqual([...outcome.calls.map((x) => x.verb)], ['read']);
    for (const [verb, target] of [['edit', 'src/price.js'], ['edit', 'src/legacy/old.js'], ['run', 'npm run deploy'], ['run', 'npm test']]) assert.equal(skipped(outcome, verb, target).by, 'no one to ask', target);
    assert.equal(go(13, 1, M(13, 1).lazy).result, 'No edit was allowed, so nothing was fixed.');
  });
  it('the narrow list keeps the legacy edit and the deploy out; a wide list lets both run as violations', () => {
    const a = go(13, 1, M(13, 1).answer).outcome;
    assert.equal(a.status, 'done');
    assert.equal(a.violations.length, 0);
    assert.equal(skipped(a, 'run', 'npm run deploy').by, 'no one to ask');
    assert.equal(go(13, 1, M(13, 1).wrong).outcome.violations.length, 2);
  });
  it('a list for the fix alone writes it but never runs the check, and says so', () => {
    const r = go(13, 1, PERM('allow edit src/price.js'));
    assert.equal(r.outcome.status, 'unverified');
    assert.equal(r.result, 'The fix was written but nobody allowed the check to run.');
  });
  it('an allow line is inert when the job is attended', () => {
    const attended = { ...AQ.scenarios['nightly-allow'], unattended: false };
    const { prompt, setup } = AQ.prepare(M(13, 1), {});
    const o = AQ.policy.run(attended, setup, prompt, {});
    assert.ok(o.calls.some((x) => x.target === 'npm run deploy'));
  });
});

describe('14.3 Tell the unattended job where to look', () => {
  it('the goal states the limit, the answer stays under it and reading the whole project does not', () => {
    assert.ok(M(13, 2).goal.includes(` ${AQ.PEAK} tokens`));
    assert.ok(go(13, 2, M(13, 2).answer).outcome.tokens.peak <= AQ.PEAK);
    const lazy = go(13, 2, M(13, 2).lazy);
    assert.ok(lazy.outcome.tokens.peak > AQ.PEAK);
    assert.match(lazy.result, /most allowed here is/);
  });
  it('the log is a source of the edit: a scope without it skips the edit as not seen yet', () => {
    const w = go(13, 2, M(13, 2).wrong);
    assert.equal(skipped(w.outcome, 'edit', 'src/tax.js').by, 'not seen yet');
    assert.equal(typeof w.result, 'string');
    assert.ok(!AQ.scenarios['nightly-scope'].script.some((a) => a.verb === 'read'));
  });
});

describe('15.1 to 15.3 the project memory file', () => {
  it('the fixed prompts have no Done when and no scope, so only the root CLAUDE.md can supply the check', () => {
    for (const i of [0, 1, 2]) assert.equal(M(14, i).prompt, 'Goal: fix the rounding bug in src/price.js');
  });
  it('npm test passes with the debug line left in, and the project\'s own command does not', () => {
    for (const name of ['memgate', 'memtypo', 'newrepo']) {
      const s = AQ.scenarios[name], v = AQ.vfs.create({ ...s.vfs, 'src/price.js': 'console.log(1);\nMath.round(' });
      assert.equal(s.commands['npm test'](v).ok, true, name);
      assert.equal(s.commands['npm run verify'](v).ok, false, name);
      assert.equal(s.correction(AQ.vfs.create({ ...s.vfs, 'src/price.js': 'console.log(1);\nMath.round(' }), 0).verb, 'edit');
    }
  });
  it('each gap gets its own message: debug line, no memory check, never verified', () => {
    assert.match(go(14, 0, M(14, 0).wrong).result, /debug console\.log still ships/);
    assert.match(go(14, 0, M(14, 0).lazy).result, /debug console\.log still ships/);
    const hook = go(14, 0, F({ '.claude/hooks.txt': 'after edit src/ run npm run verify' }));
    assert.ok(hook.outcome.steps.some((s) => s.type === 'hook' && s.run === 'npm run verify' && s.ok === false));
    assert.equal(hook.result, 'The project\'s own check was never set up in CLAUDE.md. Write it there as a Done when line in the root file.');
  });
  it('the answer runs the project\'s check, repairs the debug line and ends done', () => {
    for (const i of [0, 1, 2]) {
      const { outcome } = go(14, i, M(14, i).answer);
      assert.equal(outcome.status, 'done');
      assert.ok(outcome.calls.some((x) => x.target === 'npm run verify'));
      assert.ok(outcome.steps.some((s) => s.tag === 'fix'));
      assert.equal(outcome.violations.length, 0);
    }
  });
  it('a typed Done when beats the one in CLAUDE.md', () => {
    const m = { ...M(14, 0), prompt: M(14, 0).prompt + '\nDone when: run npm test' };
    const { outcome } = AQ.evaluate(m, M(14, 0).answer);
    assert.ok(outcome.calls.some((x) => x.target === 'npm test'));
    assert.ok(!outcome.calls.some((x) => x.target === 'npm run verify'));
  });
});

describe('15.2 Fix a default that never runs', () => {
  const root = (files) => AQ.config.memoryRules(AQ.prepare(M(14, 1), files).setup, AQ.scenarios.memtypo);
  it('the typo line does not parse and stays ignored, the repaired one is the default check', () => {
    const start = root({});
    assert.equal(start.check, null);
    assert.ok(start.ignored.includes('Done when: run npm run verfy'));
    assert.equal(JSON.stringify(root(M(14, 1).answer).check), JSON.stringify({ verb: 'run', target: 'npm run verify' }));
  });
  it('the folder file holds the right line but never supplies the check, and the run ends unverified', () => {
    assert.match(AQ.scenarios.memtypo.vfs['src/CLAUDE.md'], /Done when: run npm run verify/);
    assert.equal(go(14, 1, {}).outcome.status, 'unverified');
    assert.equal(go(14, 1, F({ 'CLAUDE.md': NOTES, 'src/CLAUDE.md': VERIFY })).outcome.status, 'unverified');
  });
});

describe('15.3 Write it for a new repo', () => {
  it('the README names the rule and the check, and the goal names neither', () => {
    assert.match(AQ.scenarios.newrepo.vfs['README.md'], /generated\/[\s\S]*npm run verify/);
    assert.doesNotMatch(M(14, 2).goal, /generated|verify/);
  });
  it('the rule alone blocks the generated edit but leaves the debug line, and without the rule the hand edit is a violation', () => {
    const rule = go(14, 2, ROOT('do not edit generated/\n'));
    assert.equal(skipped(rule.outcome, 'edit', 'generated/api.js').by, 'CLAUDE.md');
    assert.equal(rule.outcome.violations.length, 0);
    assert.match(rule.result, /debug console\.log still ships/);
    assert.match(go(14, 2, ROOT(VERIFY)).result, /edit generated\/api\.js, and nothing told it not to/);
  });
});
