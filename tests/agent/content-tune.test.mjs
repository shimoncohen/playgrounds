// Agent Quest tune tier, chapters 21 to 23 (indexes 20 to 22; positions are [chapter index, mission index], the in-game label is
// index+1 . mission+1). Every mission is guarded against its nearby and lazy answers, and every size limit in AQ.TUNE is measured:
// the reference answer sits under it and each row that fails on size alone sits at least 8 tokens over it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent, FILES } from './harness.mjs';
import { runCases, kit } from './cases.mjs';

const AQ = loadAgent();
const { M, go } = kit(AQ);
const F = (files) => ({ files });
const TUNE = [20, 21, 22];
const MARGIN = 8;

const SK = '.claude/skills/release-guard.md', RULE = 'do not edit migrations/\n', OK = 'Use during a release: blocks edits to migrations';
const D = (desc, extra = RULE, when = 'release', name = 'release-guard') => F({ [SK]: `name: ${name}\ndescription: ${desc}\nwhen: ${when}\n${extra}` });
const LONGDESC = AQ.scenarios.tuneDesc.vfs[SK].split('\n')[1].slice('description: '.length);
const LONGWORDS = 'Release-time safeguard preventing unintentional modification concerning database migrations directories always';
const HEAD = '# Shop notes\nPrices are in dollars.\n', LIVE = 'do not delete data/\n';
const STALE = ['do not edit old-api/', 'only edit billing/', 'ask before run npm run legacy-build'];
const C = (t) => F({ 'CLAUDE.md': t });
const MCP = '.claude/mcp.txt', LINES = AQ.scenarios.tuneMcp.vfs[MCP].split('\n');
const MC = (t) => F({ [MCP]: t });

const COMMENTED = C(HEAD + LIVE + STALE.map((l) => '# ' + l).join('\n') + '\n');

// chapter 22 (index 21)
const DS = '.claude/skills/data-guard.md', SRC = 'src/CLAUDE.md', GUARD = AQ.scenarios.tuneDup.vfs[SRC], WHYL = GUARD.split('\n')[1] + '\n';
const DH = (when = 'bugfix', name = 'name: data-guard\n') => `${name}description: data-guard skill\nwhen: ${when}\n`;
const DUP = (root, src, skill) => F({ 'CLAUDE.md': root, [SRC]: src, [DS]: skill });
const ROOT = HEAD + GUARD;
const RS = '.claude/skills/release-steps.md', CP = '.claude/commands/release-prep.md', NOTESTXT = '.claude/notes.txt';
const RAW = AQ.scenarios.tuneRare.vfs['CLAUDE.md'].split('\n');
const BLOCK = RAW.slice(3).join('\n'), STEPS = RAW.slice(5).filter(Boolean), DAILY = HEAD + LIVE;
const RH = (when = 'release', name = 'release-steps') => `name: ${name}\ndescription: release-steps skill\nwhen: ${when}\n`;
const SKILLED = (body, claude = DAILY) => F({ 'CLAUDE.md': claude, [RS]: RH() + body });
const CG = 'Goal: prepare the release\n', CR = 'Constraints: do not edit migrations/\n', EX = STEPS.map((l) => 'Extra: ' + l).join('\n') + '\n';
const CMD = (text, claude = DAILY) => F({ 'CLAUDE.md': claude, [CP]: text });

const CASES = [
  { at: [20, 0],
    pass: [D(OK), D('Release guard: never edit migrations'), D('RELEASE: BLOCKS MIGRATION EDITS'), D('Applies when shipping a release; blocks edits to the migrations'), D('Release job: never touch migration files'),
      D('  Use during a release:   blocks edits to migrations  ')],
    fail: [{}, D('x'), D(''), D('release'), D('release-guard'), D('release-guard skill'), D('Release Guard!'), D('release guard skill'),
      // the long description kept, a long one in 11 words, or one with only half of the job
      D(LONGDESC), D('Use during a release: blocks every edit to the migrations folder today'), D('Use during a release'), D('blocks edits to migrations'),
      // few words, but long ones: the size limit is what stops it
      D(LONGWORDS),
      // the description text moved into the body, so the line itself says nothing
      D('x', RULE + LONGDESC + '\n'), D('', RULE + OK + '\n'),
      // the skill is the lever: asleep, nameless, renamed, or without its rule
      D(OK, RULE, 'docs'), D(OK, RULE, 'bugfix'), D(OK, RULE, 'banana'), D(OK, ''), D(OK, 'do not edit src/\n'), D(OK, RULE, 'release', 'release-guard-2'), D(OK, RULE, 'release', ''),
      F({ [SK]: '' }), F({ [SK]: '', 'CLAUDE.md': '' }), F({ 'CLAUDE.md': RULE, [SK]: '' })] },
  { at: [20, 1],
    pass: [C(HEAD + LIVE), C(LIVE), C('# Shop notes\n' + LIVE), C(HEAD + 'Do not delete data/\n'), C(HEAD + LIVE + '\n\n'), C('Prices are in dollars.\n' + LIVE)],
    fail: [{}, C(HEAD + LIVE + STALE[0] + '\n'), C(HEAD + LIVE + STALE[1] + '\n'), C(HEAD + LIVE + STALE[2] + '\n'), C(HEAD + LIVE + STALE.slice(0, 2).join('\n') + '\n'), C(HEAD + LIVE + 'DO NOT EDIT OLD-API/\n'),
      // stale lines pointed at real things: they parse, and a rule on src/ stops the fix
      C(HEAD + LIVE + 'do not edit src/\n'), C(HEAD + LIVE + 'do not edit src/\nonly edit tests/\nask before run npm test\n'),
      // the live rule deleted with the stale ones: a violation
      C(HEAD), C(''), C('# Shop notes\n'),
      // hidden with # is still counted
      COMMENTED, C(HEAD + LIVE + '# ' + STALE[0] + '\n# ' + STALE[1] + '\n# ' + STALE[2] + '\n')] },
  { at: [20, 2],
    pass: [MC('calendar: list\nmail: read\n'), MC('mail: read\ncalendar: list\n'), MC('calendar: list\nmail: read, search\n'), MC('calendar: list, search\nmail: read\n'), MC('calendar:  list\nmail:   read'), MC('calendar: list\ncalendar: list\nmail: read\n')],
    fail: [{}, MC('calendar: list\n'), MC('mail: read\n'), MC(''), MC(LINES[0] + '\n' + LINES[1] + '\n'), MC(LINES[0] + '\nmail: read\n'), MC('calendar: list\n' + LINES[1] + '\n'),
      MC(LINES.slice(0, 5).join('\n')), MC('calendar: create\nmail: read\n'), MC('calendar: list\nmail: reed\n'), MC('calender: list\nmail: read\n'), MC('calendar: list, mail: read\n'),
      F({ 'CLAUDE.md': 'calendar: list\nmail: read\n' }), F({ '.claude/mcp.json': 'calendar: list\nmail: read\n' })] },
  { at: [21, 0],
    pass: [DUP(ROOT, '', DH()), DUP(HEAD, GUARD, DH()), DUP(HEAD, '', DH() + GUARD), DUP(ROOT, '', ''), DUP(HEAD + 'Do not delete data/\n' + WHYL, '', DH()), DUP(ROOT, '', DH('docs')),
      // the guard's Why line is not needed to guard
      DUP(HEAD + LIVE, '', DH()), DUP(HEAD, LIVE, DH())],
    fail: [{}, DUP('', '', ''), DUP(HEAD, '', DH()), DUP(ROOT, GUARD, DH()), DUP(ROOT, '', DH() + GUARD), DUP(ROOT, GUARD, DH() + GUARD),
      // a copy that never loads is still a copy: asleep, nameless, with a when: that is not a kind
      DUP(ROOT, '', DH('docs') + GUARD), DUP(ROOT, '', DH('banana') + GUARD), DUP(ROOT, '', DH('bugfix', '') + GUARD), DUP(HEAD, '', DH('docs') + GUARD),
      // the copy that is left never loads, so the delete goes through
      DUP(HEAD, '', DH('banana') + GUARD), DUP(HEAD, '', DH('docs') + GUARD + WHYL),
      // the rule taken out of two places, the reason left behind
      DUP(ROOT, WHYL, DH() + WHYL), DUP(ROOT, WHYL, DH()), DUP(ROOT, '', DH() + WHYL), DUP(HEAD, GUARD, DH() + WHYL),
      // rewritten differently in two places
      DUP(ROOT, 'do not delete data/backup.csv\n', DH()), DUP(HEAD + 'do not delete data/backup.csv\n', LIVE, DH()), DUP(ROOT, 'only delete data/\n', DH())] },
  { at: [21, 1],
    pass: [SKILLED(BLOCK + '\n'), SKILLED(RAW.slice(4).join('\n') + '\n'), SKILLED(STEPS.slice().reverse().join('\n') + '\n' + RULE), SKILLED('\n' + RULE + '\n' + STEPS.join('\n\n') + '\n'),
      // the one rule line also left in CLAUDE.md is a 7-token duplicate, and fits
      SKILLED(BLOCK + '\n', DAILY + RULE), SKILLED('Do not' + RULE.slice('do not'.length) + STEPS.join('\n')), SKILLED('  ' + RULE + STEPS.map((l) => '  ' + l).join('\n') + '\n')],
    fail: [{}, SKILLED(''), SKILLED(RULE), SKILLED(STEPS.join('\n')), SKILLED(STEPS.slice(1).join('\n') + '\n' + RULE), SKILLED(STEPS.join('\n').replace('Bump', 'Raise') + '\n' + RULE),
      // the block copied and left in CLAUDE.md, or only half of it moved
      SKILLED(BLOCK + '\n', RAW.join('\n') + '\n'), SKILLED(BLOCK + '\n', DAILY + STEPS.slice(3).join('\n') + '\n'),
      // the skill is the lever: it loads for this job, never loads, or is gone
      F({ 'CLAUDE.md': DAILY, [RS]: RH('bugfix') + BLOCK + '\n' }), F({ 'CLAUDE.md': DAILY, [RS]: RH('docs') + BLOCK + '\n' }), F({ 'CLAUDE.md': DAILY, [RS]: RH('banana') + BLOCK + '\n' }),
      F({ 'CLAUDE.md': DAILY, [RS]: RH('release', '') + BLOCK + '\n' }), F({ 'CLAUDE.md': DAILY, [RS]: BLOCK + '\n' }), F({ 'CLAUDE.md': DAILY, [RS]: '' }),
      // the block squeezed onto a header line, or parked in a file nothing loads
      F({ 'CLAUDE.md': DAILY, [RS]: `name: release-steps\ndescription: ${RULE.trim()} ${STEPS.join(' ')}\nwhen: release\n` }), F({ 'CLAUDE.md': DAILY, [NOTESTXT]: BLOCK + '\n' }),
      // the rule line stays behind in CLAUDE.md only
      SKILLED(STEPS.join('\n') + '\n', DAILY + RULE),
      // the everyday rule dropped, or everything emptied
      SKILLED(BLOCK + '\n', HEAD), F({ 'CLAUDE.md': '', [RS]: '' })] },
  { at: [21, 2],
    pass: [CMD(CG + CR + EX), CMD(CG + CR + EX, DAILY + RULE), CMD(CR + EX), CMD(EX + CR + CG), CMD(CG + CR + STEPS.map((l) => 'EXTRA:   ' + l).join('\n') + '\n'), CMD(CG + 'Constraints: Do not edit migrations/\n' + EX),
      CMD(CR + STEPS.map((l) => (l === STEPS[0] ? 'Goal: ' : 'Extra: ') + l).join('\n') + '\n'), CMD(CG + CR + EX + '\n\n')],
    fail: [{}, CMD(CG + CR + EX, RAW.join('\n') + '\n'), CMD(CG, RAW.join('\n') + '\n'), CMD(CG + CR, DAILY), CMD(CG + EX), CMD(CG + CR + STEPS.slice(1).map((l) => 'Extra: ' + l).join('\n') + '\n'),
      CMD(CG + CR + 'Extra: ' + STEPS.join(' ') + '\n'), CMD(CG + CR + 'Extra: ' + STEPS[0] + '\n' + STEPS.slice(1).join('\n') + '\n'),
      // a line that is not a prompt line: the command could not be called
      CMD(CG + CR + STEPS.join('\n') + '\n'), CMD(CG + RULE + EX), CMD(CG + '## Release checklist\n' + CR + EX), CMD(CG + CR + EX + 'Use: scout\n'), CMD(CG + 'Constraints: do not edit nowhere/\n' + EX),
      // the rule in a place no run reads, or only where it already was
      F({ 'CLAUDE.md': DAILY, [NOTESTXT]: RULE, [CP]: CG + EX }), CMD(CG + EX, DAILY + RULE), F({ 'CLAUDE.md': DAILY, [NOTESTXT]: BLOCK + '\n' }),
      // the everyday rule dropped, or everything emptied
      CMD(CG + CR + EX, HEAD), F({ 'CLAUDE.md': '', [CP]: '', [NOTESTXT]: '' })] },
];

runCases(AQ, 'tune chapters 21-23: lazy and nearby answers are caught', CASES, (c) => !TUNE.includes(c));

describe('tune chapters: the frozen shape', () => {
  const made = TUNE.filter((c) => AQ.CH[c]);
  it('chapters 21 to 23 are appended after the 20 shipped ones: tier tune, three missions each', () => {
    assert.ok(made.length >= 1 && made[0] === 20);
    made.forEach((c) => { assert.equal(AQ.CH[c].tier, 'tune'); assert.equal(AQ.CH[c].missions.length, 3, `chapter ${c + 1}`); });
    for (let c = 0; c < 20; c++) assert.notEqual(AQ.CH[c].tier, 'tune');
  });
  it('every mission has an answer, a wrong and a lazy input; wrong and lazy fail with a reason, and so does an empty input', () => {
    for (const c of made) AQ.CH[c].missions.forEach((m, i) => {
      assert.ok(m.answer && m.wrong && m.lazy, m.title);
      assert.equal(go(c, i, m.answer).result, true, `${m.title}: answer`);
      for (const k of ['wrong', 'lazy', 'empty']) {
        const r = go(c, i, k === 'empty' ? (m.kind === 'prompt' ? '' : {}) : m[k]);
        assert.ok(!r.refused, `${m.title}: ${k} was refused`);
        assert.equal(typeof r.result, 'string', `${m.title}: ${k}`);
        assert.ok(r.result.length > 20, `${m.title}: ${k}`);
      }
    });
  });
  it('every scenario the tune chapters use ships each file an input edits, and starts its script with a read', () => {
    for (const c of made) AQ.CH[c].missions.forEach((m) => {
      const sc = AQ.scenarios[m.scenario];
      for (const x of [m.answer, m.wrong, m.lazy]) if (x && typeof x === 'object') for (const p of Object.keys(x.files || {})) assert.ok(Object.prototype.hasOwnProperty.call(sc.vfs, p), `${m.title}: ${p}`);
      assert.equal(sc.script[0].verb, 'read', m.scenario);
    });
  });
  it('a scenario key that clashes with an earlier one throws', () => {
    const upto = FILES.indexOf('content/scenarios-tune.js');
    assert.throws(() => loadAgent([...FILES.slice(0, upto + 1), 'content/scenarios-tune.js']), /duplicate scenario key tuneDesc/);
  });
});

// measure(kind): the peak of the run, or the weight of the whole setup, for a mission and an input
const measure = (kind, c, i, x) => { const r = go(c, i, x); return kind === 'setup' ? AQ.context.setupTokens(r.setup) : r.outcome.tokens.peak; };
const MARGINS = [
  { key: 'desc', at: [20, 0], kind: 'peak', pass: CASES[0].pass.slice(0, 5), over: [{}, D(LONGDESC), D(LONGWORDS)] },
  { key: 'dead', at: [20, 1], kind: 'setup', pass: CASES[1].pass, over: [{}, COMMENTED] },
  { key: 'mcp', at: [20, 2], kind: 'peak', pass: CASES[2].pass, over: [{}, MC(LINES[0] + '\n' + LINES[1] + '\n'), MC(LINES[0] + '\nmail: read\n'), MC('calendar: list\n' + LINES[1] + '\n')] },
  // the rows that fail by a holder, a skill or a command line are not here: they fail whatever their size
  { key: 'dup', at: [21, 0], kind: 'peak', pass: CASES[3].pass, over: [DUP(ROOT, WHYL, DH() + WHYL), DUP(ROOT, WHYL, DH()), DUP(ROOT, '', DH() + WHYL), DUP(HEAD, GUARD, DH() + WHYL)] },
  { key: 'rare', at: [21, 1], kind: 'peak', pass: CASES[4].pass, over: [SKILLED(BLOCK + '\n', RAW.join('\n') + '\n'), SKILLED(BLOCK + '\n', DAILY + STEPS.slice(3).join('\n') + '\n')] },
  { key: 'cmd', at: [21, 2], kind: 'peak', pass: CASES[5].pass, over: [CMD(CG + CR + EX, RAW.join('\n') + '\n'), CMD(CG + CR + EX, DAILY + STEPS.slice(3).join('\n') + '\n')] },
];

describe('tune limits: the answer fits, and a row that fails on size alone misses by at least 8 tokens', () => {
  for (const { key, at: [c, i], kind, pass, over } of MARGINS) {
    it(`AQ.TUNE.${key}: the reference answer and every pass row measure at most ${key} (${kind})`, () => {
      assert.ok(Number.isInteger(AQ.TUNE[key]) && AQ.TUNE[key] > 0);
      for (const x of [M(c, i).answer, ...pass]) assert.ok(measure(kind, c, i, x) <= AQ.TUNE[key], `${measure(kind, c, i, x)} for ${JSON.stringify(x)}`);
    });
    it(`AQ.TUNE.${key}: each size-only fail row measures at least ${key} + ${MARGIN}`, () => {
      for (const x of over) {
        const n = measure(kind, c, i, x);
        assert.ok(n >= AQ.TUNE[key] + MARGIN, `${n} is under ${AQ.TUNE[key]} + ${MARGIN} for ${JSON.stringify(x)}`);
        assert.equal(typeof go(c, i, x).result, 'string');
      }
    });
    it(`AQ.TUNE.${key} is named in the goal of its mission`, () => assert.ok(M(c, i).goal.includes(String(AQ.TUNE[key]))));
  }
});

describe('chapter 21 (index 20): Audit what is loaded messages', () => {
  const msg = (c, i, input) => go(c, i, input).result;
  const loaded = (r) => r.outcome.steps.some((s) => s.type === 'skill' && s.name === 'release-guard' && s.loaded === true);
  it('20.0 the answer loads the skill, its rule skips the migration edit, and the long description is the only cost cut', () => {
    const r = go(20, 0, M(20, 0).answer);
    assert.equal(r.result, true);
    assert.ok(loaded(r));
    assert.ok(r.outcome.steps.some((s) => s.type === 'skip' && s.by === 'skill release-guard' && s.target === 'migrations/001.sql'));
    assert.equal(r.outcome.violations.length, 0);
    assert.ok(go(20, 0, {}).outcome.tokens.peak > r.outcome.tokens.peak + MARGIN);
  });
  it('20.0 names the word count, the repeated name, the missing half of the job, and the size', () => {
    assert.match(msg(20, 0, D('Use during a release: blocks every edit to the migrations folder today')), /description is 12 words\. Cut it to 10 or fewer/);
    assert.match(msg(20, 0, D('release-guard skill')), /only repeats the name/);
    assert.match(msg(20, 0, D('release')), /only repeats the name/);
    assert.match(msg(20, 0, D('x')), /name the release and the migrations/);
    assert.match(msg(20, 0, D('Use during a release')), /name the release and the migrations/);
    assert.match(msg(20, 0, D(LONGWORDS)), new RegExp(`held about \\d+ tokens at once\\. The goal is ${AQ.TUNE.desc} or fewer`));
  });
  it('20.0 names the skill step that went wrong: asleep, or loaded with its rule gone', () => {
    assert.match(msg(20, 0, D(OK, RULE, 'docs')), /never loaded/);
    assert.match(msg(20, 0, D(OK, RULE, 'release', 'release-guard-2')), /never loaded/);
    assert.match(msg(20, 0, D(OK, '')), /rule stopped nothing/);
  });
  it('20.0 a description that moved into the body is not a description', () => assert.match(msg(20, 0, D('x', RULE + OK + '\n')), /name the release and the migrations/));
  it('20.1 names the first stale line, and the others one at a time', () => {
    assert.match(msg(20, 1, {}), /"do not edit old-api\/" names something this project does not have/);
    assert.match(msg(20, 1, C(HEAD + LIVE + STALE.slice(1).join('\n') + '\n')), /"only edit billing\/" names something/);
    assert.match(msg(20, 1, C(HEAD + LIVE + STALE[2] + '\n')), /"ask before run npm run legacy-build" names something/);
  });
  it('20.1 stale lines hidden with # are counted, and the message says so', () => {
    assert.match(msg(20, 1, COMMENTED), /Your setup still takes about \d+ tokens\. The goal is 20 or fewer\. A line that starts with # is hidden from the rules, but it is still counted/);
    assert.doesNotMatch(msg(20, 1, C(HEAD + LIVE + 'Notes to self, many of them, in a long line of prose that costs tokens.\n')), /hidden from the rules/);
  });
  it('20.1 the three stale lines are rejected by the rule reader, the live rule is not, and the answer keeps the live rule working', () => {
    for (const l of STALE) assert.equal(AQ.config.parseConstraint(l, AQ.scenarios.tuneDead).ok, false, l);
    assert.equal(AQ.config.parseConstraint('do not delete data/', AQ.scenarios.tuneDead).ok, true);
    const r = go(20, 1, M(20, 1).answer);
    assert.ok(r.outcome.steps.some((s) => s.type === 'skip' && s.target === 'data/backup.csv' && s.by === 'CLAUDE.md'));
    assert.equal(r.outcome.violations.length, 0);
  });
  it('20.1 a rule on src/ in place of a stale one stops the fix, and a deleted live rule is a violation', () => {
    assert.match(msg(20, 1, C(HEAD + LIVE + 'do not edit src/\n')), /still rounds the wrong way/);
    assert.match(msg(20, 1, C(HEAD)), /did delete data\/backup\.csv, and nothing told it not to/);
  });
  it('20.2 the answer calls both tools, and names the one that is not connected', () => {
    const r = go(20, 2, M(20, 2).answer);
    assert.equal(r.result, true);
    assert.deepEqual(JSON.parse(JSON.stringify(r.outcome.calls.map((c) => c.target))), ['notes/today.md', 'calendar.list', 'mail.read']);
    assert.match(msg(20, 2, MC('calendar: list\n')), /called mail\.read, but that tool is not connected/);
    assert.match(msg(20, 2, MC('mail: read\n')), /called calendar\.list, but that tool is not connected/);
    assert.match(msg(20, 2, MC('')), /called calendar\.list, but that tool is not connected/);
  });
  it('20.2 a server kept whole is told the size, and the lists are long enough that none can stay whole', () => {
    assert.match(msg(20, 2, MC(LINES[0] + '\nmail: read\n')), new RegExp(`held about \\d+ tokens at once\\. The goal is ${AQ.TUNE.mcp} or fewer`));
    assert.ok(LINES[0].split(',').length >= 10 && LINES[1].split(',').length >= 10);
    const names = AQ.config.parseSetup(AQ.vfs.create(AQ.scenarios.tuneMcp.vfs)).mcp.flatMap((m) => m.tools.map((t) => `${m.name}.${t}`));
    assert.deepEqual([...names].sort(), [...AQ.scenarios.tuneMcp.tools].sort());
  });
});

describe('chapter 22 (index 21): Trim, dedupe, move rare rules messages', () => {
  const msg = (c, i, input) => go(c, i, input).result;
  const peakOf = (c, i, x) => go(c, i, x).outcome.tokens.peak;
  it('the cards number missions from 1: 22.3 points at missions 12.1 and 20.1, which are those titles', () => {
    assert.match(M(21, 2).goal, /missions 12\.1 and 20\.1/);
    assert.equal(AQ.CH[11].missions[0].title, 'Save a prompt as a command');
    assert.equal(AQ.CH[19].missions[0].title, 'Save the weekly chore as a command');
  });
  it('the skill files are listed under the path that vfs.read and skillBody expect, so the holder count sees all of them', () => {
    const v = AQ.vfs.create(AQ.scenarios.tuneDup.vfs);
    assert.deepEqual([...v.list('.claude/skills/')], [DS]);
    assert.match(AQ.config.skillBody(v.read(DS)), /^do not delete data\/$/m);
    assert.doesNotMatch(AQ.config.skillBody(v.read(DS)), /^(name|description|when):/m);
  });
  it('21.0 the answer keeps one copy, the rule still skips the delete, and the three copies cost the most', () => {
    const r = go(21, 0, M(21, 0).answer);
    assert.equal(r.result, true);
    assert.ok(r.outcome.steps.some((s) => s.type === 'skip' && s.target === 'data/backup.csv'));
    assert.ok(peakOf(21, 0, {}) > r.outcome.tokens.peak + MARGIN);
  });
  it('21.0 names every place that holds the rule, also a copy that never loads', () => {
    assert.match(msg(21, 0, {}), /still written in 3 places: CLAUDE\.md, src\/CLAUDE\.md, \.claude\/skills\/data-guard\.md/);
    assert.match(msg(21, 0, DUP(ROOT, '', DH('docs') + GUARD)), /2 places: CLAUDE\.md, \.claude\/skills\/data-guard\.md/);
    assert.match(msg(21, 0, DUP(ROOT, '', DH('banana') + GUARD)), /2 places: CLAUDE\.md, \.claude\/skills\/data-guard\.md/);
    assert.match(msg(21, 0, DUP(ROOT, 'do not delete data/backup.csv\n', DH())), /2 places: CLAUDE\.md, src\/CLAUDE\.md/);
  });
  it('21.0 a reason left behind is told the size, and the last copy cannot go', () => {
    assert.match(msg(21, 0, DUP(ROOT, WHYL, DH() + WHYL)), new RegExp(`held about \\d+ tokens at once\\. The goal is ${AQ.TUNE.dup} or fewer`));
    assert.match(msg(21, 0, DUP('', '', '')), /did delete data\/backup\.csv, and nothing told it not to/);
    assert.match(msg(21, 0, DUP(HEAD, '', DH('banana') + GUARD)), /did delete data\/backup\.csv/);
  });
  it('21.1 the answer is not loaded for a bugfix, and the rare rule still guards a release', () => {
    const r = go(21, 1, M(21, 1).answer);
    assert.equal(r.result, true);
    assert.ok(!r.outcome.steps.some((s) => s.type === 'skill' && s.loaded === true));
    assert.ok(AQ.config.memoryRules({ memory: AQ.config.skillBody(r.outcome.vfs.read(RS)) }, AQ.scenarios.tuneRare, false).rules.some((c) => c.target === 'migrations/'));
    assert.ok(peakOf(21, 1, {}) > r.outcome.tokens.peak + MARGIN);
  });
  it('21.1 names the skill, the missing lines, the missing rule and the size', () => {
    assert.match(msg(21, 1, F({ 'CLAUDE.md': DAILY, [RS]: RH('bugfix') + BLOCK + '\n' })), /loads for this job, so the agent carries the checklist again/);
    assert.match(msg(21, 1, F({ 'CLAUDE.md': DAILY, [RS]: RH('docs') + BLOCK + '\n' })), /must keep when: release/);
    assert.match(msg(21, 1, F({ 'CLAUDE.md': DAILY, [RS]: RH('banana') + BLOCK + '\n' })), /is not a working skill/);
    assert.match(msg(21, 1, SKILLED(STEPS.slice(1).join('\n') + '\n' + RULE)), /missing 1 of the six checklist lines, such as "Bump the version in package\.json\."/);
    assert.match(msg(21, 1, F({ 'CLAUDE.md': DAILY, [RS]: `name: release-steps\ndescription: ${STEPS.join(' ')}\nwhen: release\n` })), /missing 6 of the six/);
    assert.match(msg(21, 1, SKILLED(STEPS.join('\n') + '\n', DAILY + RULE)), /rule do not edit migrations\/ is not in the body of the skill/);
    assert.match(msg(21, 1, SKILLED(BLOCK + '\n', RAW.join('\n') + '\n')), new RegExp(`held about \\d+ tokens at once\\. The goal is ${AQ.TUNE.rare} or fewer`));
    assert.match(msg(21, 1, SKILLED(BLOCK + '\n', HEAD)), /did delete data\/backup\.csv/);
  });
  it('21.2 the run never calls the command, so the answer costs only what CLAUDE.md keeps, and the command parses as a prompt', () => {
    const r = go(21, 2, M(21, 2).answer);
    assert.equal(r.result, true);
    assert.ok(!r.outcome.steps.some((s) => s.type === 'command'));
    const p = AQ.config.parsePrompt('Use: release-prep', AQ.scenarios.tuneCmd, r.setup);
    assert.equal(p.errors.length, 0);
    assert.ok(p.constraints.some((k) => k.kind === 'do not' && k.verb === 'edit' && k.target === 'migrations/'));
    assert.ok(peakOf(21, 2, {}) > r.outcome.tokens.peak + MARGIN);
  });
  it('21.2 shows the first line that does not parse, and the missing rule, step and size', () => {
    assert.match(msg(21, 2, CMD(CG + CR + STEPS.join('\n') + '\n')), /would be refused: Command release-prep: Bump the version in package\.json\. does not start with a field name/);
    assert.match(msg(21, 2, CMD(CG + RULE + EX)), /would be refused: Command release-prep: do not edit migrations\/ does not start with a field name/);
    assert.match(msg(21, 2, CMD(CG + '## Release checklist\n' + CR + EX)), /would be refused: Command release-prep: ## Release checklist does not start with a field name/);
    assert.match(msg(21, 2, CMD(CG + CR + EX + 'Use: scout\n')), /would be refused: .*a command cannot use other names/);
    assert.match(msg(21, 2, CMD(CG + EX, DAILY + RULE)), /holds no Constraints: do not edit migrations\/ line/);
    assert.match(msg(21, 2, CMD(CG + CR + EX.split('\n').slice(1).join('\n'))), /missing 1 of the six steps, such as "Bump the version in package\.json\."/);
    assert.match(msg(21, 2, CMD(CG + CR + EX, RAW.join('\n') + '\n')), new RegExp(`held about \\d+ tokens at once\\. The goal is ${AQ.TUNE.cmd} or fewer`));
    assert.match(msg(21, 2, CMD(CG + CR + EX, HEAD)), /did delete data\/backup\.csv/);
  });
});
