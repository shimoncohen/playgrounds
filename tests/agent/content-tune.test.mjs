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
