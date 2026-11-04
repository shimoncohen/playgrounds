// Agent Quest personal path, chapters 16 to 20 (indexes 15 to 19; positions are [chapter index, mission index], the in-game label is
// index+1 . mission+1): every mission is guarded against its nearby and lazy answers, the cheat routes through CLAUDE.md,
// permissions.txt and hooks.txt are closed, and each card only uses the dev terms it may.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent, read } from './harness.mjs';
import { runCases, kit } from './cases.mjs';

const AQ = loadAgent();
const { M, go } = kit(AQ);
const F = (files) => ({ files });
const PERSONAL = [15, 16];
// the scenario keys each personal chapter owns, in mission order; every later batch appends its chapter
const KEYS = { 15: ['digest', 'digestDaily', 'remind'], 16: ['voice', 'report', 'clipping'] };
const SCH = '.claude/schedule.txt', ALLOW = '.claude/permissions.txt';
const WD = '.claude/commands/weekly-digest.md', MR = '.claude/commands/morning-reminder.md';
const HEAD = '# When each saved command starts, one line each: WHEN HH:MM use NAME\n';
const S = (lines) => F({ [SCH]: HEAD + lines + '\n' });
const BACKUP = 'monday 09:00 use backup-note\n';
const WEEKLY = 'weekdays 07:30 use weekly-digest';
const DIGEST = AQ.scenarios.digest.vfs[WD];
const REMIND = AQ.scenarios.remind.vfs[MR];
const FIXED = "Goal: remind me about today's plan\nDone when: read notes/today.md\n";
const COMMENT = '# what the scheduled jobs may do, one per line\n';
const CREATE = 'allow call calendar.create\n';
const R = (cmd, allow = COMMENT + CREATE, extra = {}) => F({ [MR]: cmd, [ALLOW]: allow, ...extra });
const SAMPLE = 'drafts/sample-thanks.md', FORMAL = 'drafts/old-formal.md';
const MARKET = 'reports/market.md', PRICING = MARKET + '#pricing';
const NOSEND = 'Constraints: do not call mail.send', NOREAD = 'Constraints: do not read notes/passwords.txt', PAGE = 'clippings/recipe-page.md';
const P = (prompt, files) => ({ prompt, files });

const CASES = [
  { at: [15, 0],
    pass: [S(BACKUP + WEEKLY), S(WEEKLY), S('WEEKDAYS 07:30 USE weekly-digest'), S(BACKUP + 'weekdays   07:30   use   weekly-digest'), S(WEEKLY + '\n' + WEEKLY),
      S('monday 07:30 use weekly-digest\ntuesday 07:30 use weekly-digest\nwednesday 07:30 use weekly-digest\nthursday 07:30 use weekly-digest\nfriday 07:30 use weekly-digest'),
      F({ [SCH]: WEEKLY })],
    fail: [{}, S(BACKUP + 'daily 07:30 use weekly-digest'), S(BACKUP + 'weekdays 17:30 use weekly-digest'), S(BACKUP + 'weekdays 07:30 use weekly-digest\nweekdays 08:00 use weekly-digest'),
      S(BACKUP + 'monday 07:30 use weekly-digest'), S(BACKUP + WEEKLY + '\nsaturday 07:30 use weekly-digest'), S(BACKUP + 'weekdays 07:30 use backup-note'),
      // a line the reader rejects is shown in the Run panel and the mission says so
      S(BACKUP + 'weekday 07:30 use weekly-digest'), S(BACKUP + 'weekdays 7:30 use weekly-digest'), S(BACKUP + 'weekdays 24:00 use weekly-digest'), S(BACKUP + 'weekdays 07:60 use weekly-digest'),
      S(BACKUP + 'weekdays 07:30 use weekly-digst'), S(BACKUP + 'weekdays 07:30 weekly-digest'), S(BACKUP + WEEKLY + ' now'),
      // a good line beside a bad one still reports the bad one
      S(BACKUP + WEEKLY + '\nweekday 08:00 use backup-note'),
      // the command is the job: emptied, edited, or its check moved into the root CLAUDE.md
      F({ [SCH]: HEAD + WEEKLY + '\n', [WD]: '' }), F({ [SCH]: HEAD + WEEKLY + '\n', [WD]: DIGEST + 'Constraints: do not edit notes/' }),
      F({ [SCH]: HEAD + WEEKLY + '\n', [WD]: '', 'CLAUDE.md': 'Done when: read digest.md' }),
      F({ [SCH]: HEAD + WEEKLY + '\n', [WD]: "Goal: write this week's digest into digest.md\n" }),
      // the job's own permissions
      F({ [SCH]: HEAD + WEEKLY + '\n', [ALLOW]: '' }), F({ [SCH]: HEAD + WEEKLY + '\n', [ALLOW]: 'allow edit digest.md\ndeny edit digest.md' }), F({ [SCH]: HEAD + WEEKLY + '\n', [ALLOW]: 'allow edit notes/\n' }),
      // the line in a file that is not the schedule, or an unshipped .claude/ file
      F({ 'CLAUDE.md': WEEKLY }), F({ '.claude/hooks.txt': WEEKLY }), F({ '.claude/schedule.json': WEEKLY }), F({ '.claude/crontab.txt': WEEKLY }), F({ '.claude/commands/morning.md': WEEKLY }),
      F({ [SCH]: '' })],
    refused: [F({ [SCH]: HEAD + WEEKLY + '\n', [WD]: 'banana' }), F({ [WD]: DIGEST + 'Use: backup-note' })] },
  { at: [15, 1],
    pass: [S('monday 07:30 use weekly-digest'), S('monday 09:00 use weekly-digest'), S('MONDAY 07:30 USE weekly-digest'), S('monday 07:30 use weekly-digest\n' + BACKUP.trim()), S('#daily 07:30 use weekly-digest\nmonday 07:30 use weekly-digest')],
    fail: [{}, S('weekdays 07:30 use weekly-digest'), S('friday 07:30 use weekly-digest'), S('daily 07:30 use weekly-digest\nmonday 07:30 use weekly-digest'), S('monday 07:30 use weekly-digest\nfriday 07:30 use weekly-digest'),
      S('monday 07:30 use weekly-digest\ndaily 12:00 use weekly-digest'), S('weekdays 07:30 use weekly-digest\nsaturday 07:30 use weekly-digest\nsunday 07:30 use weekly-digest'),
      S(''), S('monday 07:30 use backup-note'), S('monday 7:30 use weekly-digest'), S('mondey 07:30 use weekly-digest'), S('monday 07:30 use weekly-digst'),
      // the command is the job, and the setup the run carries counts toward the week
      F({ [SCH]: HEAD + 'monday 07:30 use weekly-digest\n', [WD]: '' }), F({ [SCH]: HEAD + 'monday 07:30 use weekly-digest\n', [WD]: DIGEST + 'Constraints: do not edit notes/' }),
      F({ [SCH]: HEAD + 'monday 07:30 use weekly-digest\n', [WD]: '', 'CLAUDE.md': 'Done when: read digest.md' }),
      F({ [SCH]: HEAD + 'monday 07:30 use weekly-digest\n', 'CLAUDE.md': 'x '.repeat(2500) }),
      F({ [SCH]: HEAD + 'monday 07:30 use weekly-digest\n', [ALLOW]: '' }),
      F({ 'CLAUDE.md': 'monday 07:30 use weekly-digest' }), F({ '.claude/schedule.json': 'monday 07:30 use weekly-digest' }), F({ '.claude/hooks.txt': 'monday 07:30 use weekly-digest' })] },
  { at: [15, 2],
    pass: [R(FIXED), R(FIXED, CREATE), R(FIXED, COMMENT + 'allow call calendar.list\n' + CREATE), R(FIXED, COMMENT + CREATE + 'deny call calendar.delete\n'),
      R("Goal: remind me about today's plan\nPlan: off\nDone when: read notes/today.md\n"), R("Goal: remind me about today's plan\nConstraints: do not call calendar.delete\nDone when: read notes/today.md\n", COMMENT + CREATE),
      R(FIXED, COMMENT + 'allow call calendar.delete\ndeny call calendar.delete\n' + CREATE)],
    fail: [{}, R(FIXED, COMMENT), R(REMIND, COMMENT + CREATE), R(REMIND, COMMENT), R(FIXED, COMMENT + 'allow call calendar\n'), R(FIXED, COMMENT + CREATE + 'allow call calendar.delete\n'),
      R(FIXED, COMMENT + 'allow call calendar.crate\n'), R(FIXED, COMMENT + 'allow create calendar\n'), R(FIXED, COMMENT + 'allow read calendar.create\n'), R(FIXED, COMMENT + 'allow call mail.send\n'),
      R(FIXED, COMMENT + 'deny call calendar.create\n' + CREATE), R(FIXED, COMMENT + 'allow call calendar.list\n'),
      // the command is the job: emptied, stripped of its check, or the check moved into the root CLAUDE.md
      R('', COMMENT + CREATE), R('', COMMENT + CREATE, { 'CLAUDE.md': 'Done when: read notes/today.md' }), R("Goal: remind me about today's plan\n"), R("Goal: remind me about today's plan\nPlan: off\n"),
      R(FIXED, COMMENT + CREATE, { 'CLAUDE.md': 'do not call calendar.create' }), R(FIXED, COMMENT, { 'CLAUDE.md': 'allow call calendar.create' }), F({ [ALLOW]: COMMENT + CREATE, 'CLAUDE.md': 'allow call calendar.create' }),
      F({ [ALLOW]: COMMENT + CREATE, [MR]: REMIND, 'CLAUDE.md': FIXED }),
      // the list in a file the job never reads
      R(FIXED, COMMENT, { '.claude/allow.txt': 'allow call calendar.create' }), R(FIXED, COMMENT, { '.claude/hooks.txt': 'allow call calendar.create' }),
      // the schedule line the job needs, broken or gone
      R(FIXED, COMMENT + CREATE, { [SCH]: HEAD + 'daily 08:00 use morning-remindr\n' }), R(FIXED, COMMENT + CREATE, { [SCH]: HEAD + 'daily 8:00 use morning-reminder\n' }), R(FIXED, COMMENT + CREATE, { [SCH]: '' })],
    refused: [R('banana'), R(FIXED + 'Use: morning-reminder')] },
  { at: [16, 0],
    pass: [`Examples: ${SAMPLE}`, `examples: ${SAMPLE}`, `Goal: thank Dana for the tea\nExamples: ${SAMPLE}`, `Examples: ${SAMPLE}, ${FORMAL}`, `Examples: ${SAMPLE}\nFiles: ${FORMAL}`],
    fail: [`Examples: ${FORMAL}`, `Examples: ${FORMAL}, ${SAMPLE}`, 'Examples: drafts/thanks.md', 'Examples: drafts/', `Files: ${SAMPLE}`, 'Goal: write a thank-you note to Dana',
      `Examples: ${SAMPLE}\nConstraints: do not edit drafts/thanks.md`,
      // the sample named outside the prompt, or the greeting pasted into the memory file, shows the agent nothing
      P('', { 'CLAUDE.md': `Examples: ${SAMPLE}` }), P('', { 'CLAUDE.md': 'Hi Dana,' }), P(`Examples: ${FORMAL}`, { 'CLAUDE.md': `Examples: ${SAMPLE}` })],
    refused: ['Examples: drafts/sample-thanks.txt', 'Examples: drafts/nope.md', `Examples: ${SAMPLE}\nExamples: drafts/old.md`] },
  { at: [16, 1],
    pass: [`Files: ${PRICING}`, `files: ${PRICING}`, `Goal: summarise the pricing\nFiles: ${PRICING}`, `Files: ${PRICING}\nDone when: read summary.md`, `Files: ${MARKET}#summary, ${PRICING}`,
      `Files: ${PRICING}\nConstraints: do not read ${MARKET}#appendix`],
    fail: [`Files: ${MARKET}`, 'Files: reports/', `Files: ${MARKET}#competitors`, `Files: ${MARKET}#summary`, `Files: ${MARKET}#appendix`, 'Goal: summarise the pricing', `Done when: read ${PRICING}`,
      `Files: ${PRICING}\nConstraints: do not edit summary.md`,
      // a rule that blocks the section read: the root CLAUDE.md bare rule, and a permission deny line
      P(`Files: ${PRICING}`, { 'CLAUDE.md': `do not read ${MARKET}` }), P(`Files: ${PRICING}`, { '.claude/permissions.txt': `deny read ${MARKET}` }),
      // the answer moved out of the prompt
      P('', { 'CLAUDE.md': `Files: ${PRICING}` })],
    refused: [`Files: ${MARKET}#prices`, `Files: ${MARKET}#Pricing`, `Files: ${MARKET}#`, `Files: reports/mrket.md#pricing`] },
  { at: [16, 2],
    pass: [`${NOSEND}\n${NOREAD}`, `${NOREAD}\n${NOSEND}`, 'Constraints: do not call mail\nConstraints: do not read notes/', `${NOSEND}\n${NOREAD}\nDone when: read ${PAGE}`, `${NOSEND}\nConstraints: only read clippings/`],
    fail: [NOSEND, NOREAD, 'Constraints: only read clippings/recipe-page.md', `Constraints: do not send mail.send\n${NOREAD}`, 'Constraints: do not send mail.send', `Done when: read ${PAGE}`,
      // blocking the page itself is not the point
      `Constraints: do not read ${PAGE}`, `${NOSEND}\n${NOREAD}\nConstraints: do not read ${PAGE}`,
      // the rules in a file other than the prompt
      P('', { 'CLAUDE.md': 'do not call mail.send\ndo not read notes/passwords.txt' }), P('', { 'CLAUDE.md': `${NOSEND}\n${NOREAD}` }),
      P('', { '.claude/permissions.txt': 'deny call mail.send\ndeny read notes/passwords.txt' }), P(NOSEND, { 'CLAUDE.md': 'do not read notes/passwords.txt' })],
    refused: ['Constraints: do not call mail.sned', 'Constraints: do not read notes/password.txt', 'Constraints: do not call', `${NOSEND}\nConstraints: nobody should read notes/passwords.txt`] },
];

runCases(AQ, 'chapters 16 to 20: lazy and nearby answers are caught', CASES, (c) => !PERSONAL.includes(c));

describe('schedule messages name the problem', () => {
  const msg = (c, i, input) => go(c, i, input).result;
  it('a line the reader rejects is quoted with its reason, in the mission and in the Run panel step', () => {
    const bad = S(BACKUP + 'weekday 07:30 use weekly-digest');
    assert.match(msg(15, 0, bad), /ignored a line in \.claude\/schedule\.txt: "weekday" is not daily, weekdays or a day name/);
    assert.match(go(15, 0, bad).outcome.steps[0].why, /"weekday"/);
    assert.match(msg(15, 0, S(BACKUP + 'weekdays 7:30 use weekly-digest')), /is not a time/);
    assert.match(msg(15, 0, S(BACKUP + 'weekdays 07:30 use weekly-digst')), /is not a saved command/);
    assert.match(msg(15, 0, S(BACKUP + 'weekdays 07:30 weekly-digest')), /is not "WHEN HH:MM use NAME"/);
  });
  it('the lazy digest run is blocked with only the schedule step, and the message says no line starts it', () => {
    const r = go(15, 0, {});
    assert.deepEqual(JSON.parse(JSON.stringify(r.outcome.steps.map((s) => s.type))), ['fire']);
    assert.equal(r.outcome.status, 'blocked');
    assert.match(r.result, /No line in \.claude\/schedule\.txt starts weekly-digest/);
  });
  it('15.0 names the days and the time that are wrong', () => {
    assert.match(msg(15, 0, S(BACKUP + 'daily 07:30 use weekly-digest')), /five weekdays.*7 days/);
    assert.match(msg(15, 0, S(BACKUP + 'weekdays 17:30 use weekly-digest')), /ready at 07:30, but a line starts it at 17:30/);
  });
  it('15.0 says when the job\'s edit was skipped, and by whom', () => {
    assert.match(msg(15, 0, F({ [SCH]: HEAD + WEEKLY + '\n', [ALLOW]: '' })), /nobody was there to approve it/);
    assert.match(msg(15, 0, F({ [SCH]: HEAD + WEEKLY + '\n', [ALLOW]: 'allow edit digest.md\ndeny edit digest.md' })), /skipped \(permission rule\)/);
  });
  it('15.1 names the runs and the tokens, and the day when only the day is wrong', () => {
    assert.match(msg(15, 1, {}), /runs 7 times a week \(mon, tue, wed, thu, fri, sat, sun\), about \d+ tokens\. The limit is \d+\./);
    assert.match(msg(15, 1, S('weekdays 07:30 use weekly-digest')), /runs 5 times a week/);
    // two days cannot fit the shipped limit, so raise it to reach the case where the day count alone is what is wrong
    const week = AQ.WEEK;
    AQ.WEEK = 1e6;
    try {
      const two = msg(15, 1, S('monday 07:30 use weekly-digest\ntuesday 07:30 use weekly-digest'));
      assert.match(two, /runs 2 times a week \(mon, tue\), about \d+ tokens\. It only has to run on Monday/);
      assert.doesNotMatch(two, /The limit is/);
    } finally { AQ.WEEK = week; }
    assert.match(msg(15, 1, S('friday 07:30 use weekly-digest')), /on Monday, but this schedule starts it on fri/);
    assert.match(msg(15, 1, F({ [SCH]: HEAD + 'monday 07:30 use weekly-digest\n', 'CLAUDE.md': 'x '.repeat(2500) })), /Even one run a week costs about \d+ tokens/);
  });
  it('15.2 says the job stalled, then that the call waited for a permission', () => {
    assert.match(msg(15, 2, {}), /waited for an approval nobody could give/);
    assert.match(msg(15, 2, R(FIXED, COMMENT)), /calendar\.create, but nobody was there to approve it/);
    assert.match(msg(15, 2, R(FIXED, COMMENT + 'allow call calendar\n')), /call calendar\.delete, and nothing told it not to/);
    assert.match(msg(15, 2, R(FIXED, COMMENT + 'deny call calendar.create\n' + CREATE)), /was skipped \(permission rule\)/);
  });
});

describe('15.2: the cheats and the stall', () => {
  it('a Plan: first command stalls the fired run, and the stall is the only way the job ends blocked', () => {
    const r = go(15, 2, {});
    assert.ok(r.outcome.steps.some((s) => s.type === 'stall'));
    assert.equal(r.outcome.status, 'blocked');
  });
  it('the answer adds the event and skips the delete without a mistake', () => {
    const r = go(15, 2, M(15, 2).answer);
    assert.equal(r.result, true);
    assert.ok(r.outcome.calls.some((x) => x.target === 'calendar.create'));
    assert.ok(r.outcome.steps.some((s) => s.type === 'skip' && s.target === 'calendar.delete' && s.by === 'no one to ask'));
    assert.deepEqual(JSON.parse(JSON.stringify(r.outcome.violations)), []);
  });
});

describe('chapter 17 (index 16): Writing and research messages and sizes', () => {
  const msg = (c, i, input) => go(c, i, input).result;
  it('16.0 names a missing sample, a sample in the wrong voice, and a greeting the note did not take', () => {
    assert.match(msg(16, 0, 'Goal: write a thank-you note to Dana'), /no sample to copy/);
    assert.match(msg(16, 0, `Examples: ${FORMAL}`), /not how you write to Dana/);
    assert.match(msg(16, 0, `Examples: ${FORMAL}, ${SAMPLE}`), /does not open with the greeting of your sample/);
  });
  it('16.0 copies the greeting of the sample, up to its first comma', () => {
    assert.equal(go(16, 0, M(16, 0).answer).outcome.vfs.read('drafts/thanks.md').split(',')[0], 'Hi Dana');
    assert.equal(go(16, 0, `Examples: ${FORMAL}`).outcome.vfs.read('drafts/thanks.md').split(',')[0], 'Dear Ms. Dana');
  });
  it('16.1 whole report is over AQ.PEAK and the Pricing section is well under it', () => {
    const peak = (input) => go(16, 1, input).outcome.tokens.peak;
    assert.ok(peak(`Files: ${MARKET}`) > AQ.PEAK);
    assert.ok(peak({}) > AQ.PEAK, 'with no Files line the agent opens the whole report');
    assert.ok(peak(M(16, 1).answer) < AQ.PEAK / 2);
    assert.match(msg(16, 1, `Files: ${MARKET}`), new RegExp(`over the limit of ${AQ.PEAK}`));
    assert.match(msg(16, 1, {}), /read too much of the report/);
  });
  it('16.1 says another section was not the one it needed, and quotes the anchor rule it was given', () => {
    const r = go(16, 1, `Files: ${MARKET}#competitors`);
    assert.ok(r.outcome.steps.some((s) => s.type === 'skip' && s.target === 'summary.md' && s.by === 'not seen yet'));
    assert.match(r.result, /does not point at the Pricing section/);
  });
  it('16.1 names what stopped the section read: the bare CLAUDE.md rule, then a permission deny line', () => {
    const rule = go(16, 1, P(`Files: ${PRICING}`, { 'CLAUDE.md': `do not read ${MARKET}` }));
    assert.ok(rule.outcome.steps.some((s) => s.type === 'skip' && s.target === PRICING && s.by === 'CLAUDE.md'));
    assert.match(rule.result, /could not read reports\/market\.md#pricing \(CLAUDE\.md\)/);
    const deny = go(16, 1, P(`Files: ${PRICING}`, { '.claude/permissions.txt': `deny read ${MARKET}` }));
    assert.ok(deny.outcome.steps.some((s) => s.type === 'skip' && s.target === PRICING && s.by === 'permission rule'));
    assert.match(deny.result, /could not read reports\/market\.md#pricing \(permission rule\)/);
  });
  it('16.1 the answer writes the first line under the heading, and a guessed anchor is not run', () => {
    assert.match(go(16, 1, M(16, 1).answer).outcome.vfs.read('summary.md'), /^Pricing: Plans cost/);
    const r = go(16, 1, `Files: ${MARKET}#prices`);
    assert.equal(r.refused, true);
    assert.match(r.result, /was not run/);
  });
  it('16.2 says a tool is used with call when the rule was written with send', () => {
    const r = go(16, 2, `Constraints: do not send mail.send\n${NOREAD}`);
    assert.ok(r.outcome.violations.some((v) => v.verb === 'call' && v.target === 'mail.send'));
    assert.match(r.result, /A tool is a call.*do not call mail\.send/);
  });
  it('16.2 names the read of the password file when only the send is banned, and the send when only the read is', () => {
    assert.match(msg(16, 2, NOSEND), /read notes\/passwords\.txt/);
    assert.match(msg(16, 2, NOREAD), /called mail\.send/);
  });
  it('16.2 says that blocking the page is not the point, and that a rule outside the prompt is not what the mission asks', () => {
    assert.match(msg(16, 2, `${NOSEND}\n${NOREAD}\nConstraints: do not read ${PAGE}`), /could not read clippings\/recipe-page\.md.*block what it asks for/);
    assert.match(msg(16, 2, P('', { 'CLAUDE.md': 'do not call mail.send\ndo not read notes/passwords.txt' })), /only because of a rule outside your prompt/);
  });
});

/* #110 option A: every check reads what the mission's own file holds, so moving the answer to another setup file must not pass */
describe('chapters 16 to 20: the answer moved to another setup file does not pass', () => {
  const targets = ['CLAUDE.md', ALLOW, '.claude/hooks.txt'];
  // memoryRules reads only "do not / only / ask before / max" lines, so a "Constraints: do not …" line in CLAUDE.md is inert and would fail for the
  // wrong reason; the bare form is the live one. "Done when: …" stays as written.
  const bare = (t) => t.replace(/^Constraints:\s*/gim, '');
  let ranPrompt = 0;
  for (const c of PERSONAL) AQ.CH[c].missions.forEach((m, i) => {
    it(`[${c}, ${i}] ${m.title}: the answer's lines in CLAUDE.md, permissions.txt or hooks.txt, with the shipped file left alone`, () => {
      const text = typeof m.answer === 'string' ? m.answer : Object.values(m.answer.files).join('\n');
      if (typeof m.answer === 'string') ranPrompt++;
      for (const t of targets) for (const x of [text, bare(text)]) assert.equal(typeof go(c, i, P('', { [t]: x })).result, 'string', `${t}: ${x}`);
    });
  });
  it('the sweep reached at least one prompt mission', () => assert.ok(ranPrompt > 0));
});

// Only missions whose lever is the saved command belong here (19.1 does not: an emptied command still fires and loads its skill).
// The name comes from the scenario, not from m.prompt, which prompt missions do not have.
const COMMAND_SWEEP = [[15, 0], [15, 1], [15, 2]];
describe('chapters 16 to 20: the shipped command moved into CLAUDE.md, with the command emptied, does not pass', () => {
  const bare = (t) => t.replace(/^Constraints:\s*/gim, '');
  let ran = 0;
  for (const [c, i] of COMMAND_SWEEP) {
    const m = M(c, i);
    it(`[${c}, ${i}] ${m.title}`, () => {
      const sc = AQ.scenarios[m.scenario], keys = Object.keys(sc.vfs).filter((k) => /^\.claude\/commands\/(.+)\.md$/.test(k) && (m.kind === 'prompt' || k === `.claude/commands/${/^Use: (\S+)$/.exec(m.prompt)[1]}.md`));
      assert.equal(keys.length, 1);
      const p = keys[0], text = (m.answer.files || {})[p] ?? sc.vfs[p];
      for (const x of [text, bare(text)]) {
        const r = go(c, i, m.kind === 'prompt' ? P('', { 'CLAUDE.md': x, [p]: '' }) : F({ ...m.answer.files, 'CLAUDE.md': x, [p]: '' })).result;
        assert.equal(typeof r, 'string', x);
        ran++;
      }
    });
  }
  it('the sweep ran for every entry, twice', () => assert.equal(ran, COMMAND_SWEEP.length * 2));
});

describe('chapters 16 to 20: invariants of every personal mission and case table', () => {
  const missions = PERSONAL.flatMap((c) => AQ.CH[c].missions.map((m, i) => [m, c, i]));
  const mine = CASES.filter((k) => PERSONAL.includes(k.at[0]));
  it('the starting setup of every personal mission fails', () => {
    for (const [m, c, i] of missions) assert.equal(typeof AQ.runMission(m, {}, { approved: true }), 'string', `[${c}, ${i}]`);
  });
  it('every table holds a failing row that puts lines in the root CLAUDE.md', () => {
    for (const k of mine) assert.ok(k.fail.some((x) => x && typeof x === 'object' && x.files && 'CLAUDE.md' in x.files), `[${k.at}]`);
  });
  it('the answer, wrong and lazy inputs and the passing table inputs only edit files their scenario ships', () => {
    const ships = (m, x) => { if (x && typeof x === 'object') for (const p of Object.keys(x.files || {})) assert.ok(Object.prototype.hasOwnProperty.call(AQ.scenarios[m.scenario].vfs, p), `${m.title}: ${p}`); };
    for (const k of mine) { const m = M(...k.at); [m.answer, m.wrong, m.lazy, ...k.pass].forEach((x) => ships(m, x)); }
  });
  it('each personal chapter owns the scenario keys listed here, once, and none is shared with an earlier chapter', () => {
    const seen = new Set(AQ.CH.slice(0, 15).flatMap((ch) => ch.missions.map((m) => m.scenario)));
    for (const c of PERSONAL) {
      assert.deepEqual([...AQ.CH[c].missions.map((m) => m.scenario)], KEYS[c], `chapter index ${c}`);
      for (const k of KEYS[c]) { assert.ok(!seen.has(k), k); seen.add(k); }
    }
  });
});

describe('chapter 16: the one-week limit', () => {
  const one = AQ.evaluate(M(15, 1), M(15, 1).answer, { approved: true }).outcome;
  const T = one.tokens.total;
  it('one run fits and five runs do not: T < WEEK < 5T', () => {
    assert.ok(T < AQ.WEEK && AQ.WEEK < 5 * T, `T=${T} WEEK=${AQ.WEEK}`);
  });
  it('two runs already go over, so the "over the limit" message is true for every extra day', () => assert.ok(2 * T > AQ.WEEK, `T=${T} WEEK=${AQ.WEEK}`));
  it('the weekdays run costs five times one run, and the answer one times', () => {
    assert.equal(AQ.weekTokens(one), T);
    const five = AQ.evaluate(M(15, 1), M(15, 1).wrong, { approved: true }).outcome;
    assert.ok(AQ.weekTokens(five) > 4 * T);
  });
  it('the 15.1 goal states the number the check enforces', () => assert.ok(M(15, 1).goal.includes(` ${AQ.WEEK} tokens`)));
});

// The dev-taught terms: every FIRST entry of tests/agent/teach.test.mjs (:46-63) whose first-teaching chapter is 7 to 14, plus "connected".
// FIRST is not exported and importing a test file would run its suites, so the regexes are copied here; keep them in step.
const DEV = {
  'max N files': /\bmax \d+ files?\b/, 'pull request': /\bpull request\b/i, PR: /\bPR\b/, 'Use:': /\bUse:/, delegate: /\bdelegat/i, parallel: /\bparallel\b/i,
  worktree: /\bworktrees?\b/i, 'after edit': /\bafter edit\b/, formatter: /\bformatter\b/i, 'slash command': /\bslash commands?\b/i, '.claude/commands': /\.claude\/commands/,
  headless: /\bheadless\b/i, unattended: /\bunattended\b/i, CI: /\bCI\b/, 'allow VERB': /\ballow (?:edit|read|run|call|send|delete)\b/, 'default check': /\bdefault check\b/i,
  connected: /\bconnected\b/i,
};
const MANIFEST = { '15,0': ['unattended', '.claude/commands', 'allow VERB'], '15,1': ['.claude/commands'], '15,2': ['unattended', '.claude/commands', 'allow VERB'],
  '16,0': ['Use:'], '16,1': [], '16,2': [] };
const plain = (t) => String(t).replace(/<\/?[a-z][^>]*>/gi, '').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const cardText = (m) => plain([m.title, m.goal, m.hint, m.explain, ...(m.how || [])].join('\n'));

describe('chapters 16 to 20: a card uses exactly the dev terms its row lists, and defines them in place', () => {
  it('the copy holds the sixteen dev terms of teach.test.mjs and "connected"', () => assert.equal(Object.keys(DEV).length, 17));
  for (const [k, allowed] of Object.entries(MANIFEST)) {
    const [c, i] = k.split(',').map(Number);
    it(`[${c}, ${i}] ${M(c, i).title}`, () => {
      const used = Object.keys(DEV).filter((t) => DEV[t].test(cardText(M(c, i))));
      assert.deepEqual(used.sort(), [...allowed].sort());
    });
  }
  it('every personal mission has a manifest row', () => PERSONAL.forEach((c) => AQ.CH[c].missions.forEach((_, i) => assert.ok(MANIFEST[`${c},${i}`], `${c},${i}`))));
});

describe('personal chapters', () => {
  it('chapter 16 is frozen at 1 chapter (index 15) of 3 missions, in tier personal, after the dev chapters', () => {
    assert.ok(AQ.CH.length >= 16);
    assert.deepEqual([...AQ.CH.slice(15, 16).map((ch) => ch.missions.length)], [3]);
    assert.ok(AQ.CH.slice(15, 16).every((ch) => ch.tier === 'personal'));
    assert.ok(AQ.CH.slice(0, 15).every((ch) => ch.tier !== 'personal'));
    assert.equal(AQ.CH[15].badge, 'Clockwork');
  });
  it('the three scenarios are present once, scheduled, unattended-free and tag-free, and none is shared with an earlier chapter', () => {
    const keys = AQ.CH[15].missions.map((m) => m.scenario);
    assert.deepEqual([...keys], ['digest', 'digestDaily', 'remind']);
    assert.equal(new Set(keys).size, 3);
    const earlier = new Set(AQ.CH.slice(0, 15).flatMap((ch) => ch.missions.map((m) => m.scenario)));
    for (const k of keys) {
      assert.ok(!earlier.has(k), k);
      const s = AQ.scenarios[k];
      assert.deepEqual([s.scheduled, s.unattended, s.tag, s.connected], [true, undefined, undefined, undefined], k);
      assert.ok(s.vfs[SCH], `${k} ships the schedule file`);
    }
  });
  it('scenarios-personal.js throws on a key that is already taken', () => {
    assert.match(read('content/scenarios-personal.js'), /duplicate scenario key/);
    assert.throws(() => loadAgent(['engine/vfs.js', 'content/scenarios.js', 'content/scenarios-personal.js', 'content/scenarios-personal.js']), /duplicate scenario key/);
  });
  it('the scenario kit has its three helpers', () => {
    for (const f of ['filler', 'skillFile', 'scraps']) assert.equal(typeof AQ.scenarioKit[f], 'function', f);
  });
  it('every personal config mission has a fixed prompt that uses one saved command the scenario ships', () => {
    for (const m of AQ.CH[15].missions) {
      assert.equal(m.kind, 'config');
      const name = /^Use: (\S+)$/.exec(m.prompt)[1];
      assert.ok(Object.prototype.hasOwnProperty.call(AQ.scenarios[m.scenario].vfs, `.claude/commands/${name}.md`), m.title);
    }
  });
  // vacuous until a personal prompt mission or a scenario with toolFns exists (chapters 17 to 20)
  it('every prompt mission from index 15 lists exactly goal, donewhen, constraints, files, examples, plan and use', () => {
    for (const [c, ch] of AQ.CH.entries()) if (c >= 15) for (const m of ch.missions) if (m.kind === 'prompt') assert.deepEqual([...m.fields].sort(), ['constraints', 'donewhen', 'examples', 'files', 'goal', 'plan', 'use'], m.title);
  });
  it('every personal scenario with toolFns starts with a read, so an all-skipped script cannot hide a failing check', () => {
    for (const ch of AQ.CH.slice(15)) for (const m of ch.missions) {
      const s = AQ.scenarios[m.scenario];
      if (s.toolFns) assert.equal(s.script[0].verb, 'read', m.scenario);
    }
  });
});
