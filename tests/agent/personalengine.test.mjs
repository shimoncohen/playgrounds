// Engine extensions for the personal path (E7 schedule file, E8 fired run, E9 glob, E10 file#section, E11 tool functions).
// Local fixtures only: nothing here is registered in AQ.scenarios. vfs and shell have no test file of their own, so their rows live here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AQ, run } from './fixture.mjs';
import { J } from './harness.mjs';

const { config, vfs, permissions } = AQ;
const SCH = '.claude/schedule.txt';
const CMD = { '.claude/commands/weekly-digest.md': "Goal: write this week's digest into digest.md\nDone when: read digest.md", '.claude/commands/backup-note.md': 'Goal: back up the inbox' };
const parse = (files) => config.parseSetup(vfs.create(files));
const sched = (text, extra = {}) => parse({ ...CMD, [SCH]: text, ...extra });
const types = (o) => o.steps.map((s) => s.type);

describe('E7: .claude/schedule.txt', () => {
  it('reads WHEN HH:MM use NAME and expands the days', () => {
    const s = sched('weekdays 07:30 use weekly-digest\ndaily 23:59 use backup-note\nMonday 00:00 use backup-note');
    assert.deepEqual(J(s.errors), []);
    assert.deepEqual(J(s.schedule[0]), { line: 'weekdays 07:30 use weekly-digest', day: 'weekdays', days: ['mon', 'tue', 'wed', 'thu', 'fri'], at: '07:30', use: 'weekly-digest' });
    assert.deepEqual(J(s.schedule[1].days), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    assert.deepEqual(J(s.schedule[2].days), ['mon']);
    assert.equal(s.schedule[2].day, 'monday');
  });
  it('is case-insensitive, skips comments and blanks, and keeps a duplicate line', () => {
    const s = sched('# when it runs\n\n  WEEKDAYS 07:30 USE weekly-digest  \nweekdays 07:30 use weekly-digest');
    assert.deepEqual(J(s.errors), []);
    assert.equal(s.schedule.length, 2);
    assert.equal(s.schedule[0].day, 'weekdays');
    assert.equal(s.schedule[0].use, 'weekly-digest');
  });
  it('an absent file gives an empty schedule and no error', () => {
    const s = parse(CMD);
    assert.deepEqual(J(s.schedule), []);
    assert.deepEqual(J(s.errors), []);
    assert.deepEqual(J(parse({ ...CMD, [SCH]: '' }).schedule), []);
  });
  it('each part of a bad line gets its own message and the line has no effect', () => {
    const msg = (line) => { const s = sched(line); assert.equal(s.schedule.length, 0, line); assert.equal(s.errors.length, 1, line); assert.equal(s.errors[0].file, SCH); return s.errors[0].msg; };
    assert.equal(msg('weekday 07:30 use weekly-digest'), '"weekday" is not daily, weekdays or a day name');
    assert.equal(msg('weekdays 7:30 use weekly-digest'), '"7:30" is not a time: use two digits, like 07:30');
    assert.match(msg('weekdays 24:00 use weekly-digest'), /is not a time/);
    assert.match(msg('weekdays 07:60 use weekly-digest'), /is not a time/);
    assert.equal(msg('weekdays 07:30 use weekly-digst'), '"weekly-digst" is not a saved command');
    assert.equal(msg('weekdays 07:30 weekly-digest'), '"weekdays 07:30 weekly-digest" is not "WHEN HH:MM use NAME"');
    assert.match(msg('weekdays 07:30 use weekly-digest extra'), /is not "WHEN HH:MM use NAME"/);
    assert.match(msg('constructor 07:30 use weekly-digest'), /is not daily, weekdays or a day name/);
  });
  it('a long bad line is shown short', () => {
    const e = sched('x'.repeat(5000)).errors[0].msg;
    assert.ok(e.length < 120, e.length);
  });
  it('a command dropped for a name clash is not a saved command', () => {
    const skill = '---\nname: weekly-digest\nwhen: docs\n---\nbody';
    const s = sched('weekdays 07:30 use weekly-digest', { '.claude/skills/digest.md': skill });
    assert.deepEqual(J(s.schedule), []);
    assert.ok(s.errors.some((e) => e.file === SCH && /not a saved command/.test(e.msg)));
  });
  it('a bad line does not hide the good ones', () => {
    const s = sched('weekday 07:30 use weekly-digest\nweekdays 07:30 use weekly-digest');
    assert.equal(s.schedule.length, 1);
    assert.equal(s.errors.length, 1);
  });
});

/* a 15.0-shaped scenario: the job reads the inbox, then writes the digest */
const digest = {
  vfs: { 'notes/inbox.md': 'call the dentist', 'digest.md': '', ...CMD, '.claude/permissions.txt': 'allow edit digest.md', [SCH]: 'monday 09:00 use backup-note' },
  commands: {},
  tools: [],
  scheduled: true,
  script: [{ verb: 'read', target: 'notes/inbox.md' }, { verb: 'edit', target: 'digest.md', needs: ['notes/inbox.md'], write: 'digest' }],
};
const job = (line, scn = digest, files = {}) => run('Use: weekly-digest', { scn, files: { [SCH]: line, ...files } });

describe('E8: fired()', () => {
  it('is null unless the scenario is scheduled', () => {
    const { setup, prompt } = job('weekdays 07:30 use weekly-digest');
    assert.equal(config.fired({ ...digest, scheduled: undefined }, setup, prompt), null);
    assert.equal(config.fired({ ...digest, scheduled: false }, setup, prompt), null);
    assert.notEqual(config.fired(digest, setup, prompt), null);
  });
  it('is the first matching line and the union of the days of every matching line', () => {
    const { setup, prompt } = job('monday 09:00 use backup-note\nsaturday 08:00 use weekly-digest\nweekdays 07:30 use weekly-digest\nweekdays 09:30 use weekly-digest\nmonday 11:00 use weekly-digest');
    const f = config.fired(digest, setup, prompt);
    assert.equal(f.entry.line, 'saturday 08:00 use weekly-digest');
    assert.deepEqual(J(f.due), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  });
  it('is null when no line starts a command the prompt uses', () => {
    const { setup, prompt } = job('monday 09:00 use backup-note');
    assert.equal(config.fired(digest, setup, prompt), null);
  });
});

describe('E8: the fire step and the unattended run', () => {
  it('fire comes first, then the run is unattended with the schedule tag', () => {
    const { outcome } = job('weekdays 07:30 use weekly-digest');
    assert.equal(outcome.steps[0].type, 'fire');
    assert.equal(outcome.steps[0].entry.at, '07:30');
    assert.deepEqual(J(outcome.steps[0].due), ['mon', 'tue', 'wed', 'thu', 'fri']);
    assert.equal(outcome.steps[0].why, undefined);
    assert.equal(outcome.steps.filter((s) => s.type === 'fire').length, 1);
    assert.equal(outcome.status, 'done');
    assert.equal(outcome.vfs.read('digest.md'), 'digest');
  });
  it('no line that starts the job ends blocked with only the fire step', () => {
    const { outcome } = job('monday 09:00 use backup-note');
    assert.deepEqual(J(types(outcome)), ['fire']);
    assert.equal(outcome.status, 'blocked');
    assert.equal(outcome.steps[0].entry, null);
    assert.deepEqual(J(outcome.steps[0].due), []);
    assert.deepEqual(J(outcome.calls), []);
  });
  it('why is the first schedule.txt error, with or without a matching line', () => {
    const bad = 'weekday 07:30 use weekly-digest';
    const a = job(bad).outcome.steps[0], b = job(`${bad}\nweekdays 07:30 use weekly-digest`).outcome.steps[0];
    assert.equal(a.entry, null);
    assert.match(a.why, /"weekday" is not daily/);
    assert.ok(b.entry);
    assert.equal(b.why, a.why);
  });
  it('without an allow line the edit is skipped as "no one to ask"; an allow line lifts it', () => {
    const { outcome } = job('weekdays 07:30 use weekly-digest', digest, { '.claude/permissions.txt': '# nothing allowed' });
    assert.ok(outcome.steps.some((s) => s.type === 'skip' && s.by === 'no one to ask' && s.target === 'digest.md'));
    assert.equal(outcome.vfs.read('digest.md'), '');
    assert.equal(job('weekdays 07:30 use weekly-digest').outcome.vfs.read('digest.md'), 'digest');
  });
  it('Plan: first stalls because the fired run is unattended; the same script unscheduled still waits for approval', () => {
    const files = { '.claude/commands/weekly-digest.md': 'Goal: x\nPlan: first\nDone when: read digest.md' };
    const o = job('daily 07:30 use weekly-digest', digest, files).outcome;
    assert.ok(types(o).includes('stall'));
    assert.equal(o.status, 'blocked');
    const plain = job('daily 07:30 use weekly-digest', { ...digest, scheduled: false }, files).outcome;
    assert.equal(plain.status, 'awaiting-approval');
    assert.ok(!types(plain).includes('fire'));
  });
  it('a skill with when: schedule loads for a fired run; a scenario tag of its own is kept', () => {
    const skill = { '.claude/skills/quiet.md': '---\nname: quiet\nwhen: schedule\n---\ndo not edit digest.md' };
    const o = job('weekdays 07:30 use weekly-digest', digest, skill).outcome;
    assert.ok(o.steps.some((s) => s.type === 'skill' && s.name === 'quiet' && s.loaded));
    assert.ok(o.steps.some((s) => s.type === 'skip' && s.by === 'skill quiet'));
    const tagged = job('weekdays 07:30 use weekly-digest', { ...digest, tag: 'docs' }, skill).outcome;
    assert.ok(!tagged.steps.some((s) => s.type === 'skill'));
  });
  it('the same input gives the same outcome', () => {
    const a = job('weekdays 07:30 use weekly-digest').outcome, b = job('weekdays 07:30 use weekly-digest').outcome;
    assert.deepEqual(J({ ...a, vfs: a.vfs.files }), J({ ...b, vfs: b.vfs.files }));
  });
  it('weekTokens multiplies one run by the runs a week, and by 1 without a fire step', () => {
    const o = job('weekdays 07:30 use weekly-digest').outcome, d = job('daily 07:30 use weekly-digest').outcome;
    assert.ok(o.tokens.total > 0);
    assert.equal(AQ.weekTokens(o), o.tokens.total * 5);
    assert.equal(AQ.weekTokens(d), d.tokens.total * 7);
    const plain = run('Goal: x').outcome;
    assert.equal(AQ.weekTokens(plain), plain.tokens.total);
  });
  it('a bad schedule line cannot reach the run as markup: it is only text in a step', () => {
    const o = job('<img src=x onerror="window.__z=1">').outcome;
    assert.match(o.steps[0].why, /<img src=x/);
    assert.equal(typeof o.steps[0].why, 'string');
  });
});

describe('E8: chapters 1 to 15 are unchanged', () => {
  it('scheduled, unattended and connected are booleans or undefined on every scenario', () => {
    for (const [k, s] of Object.entries(AQ.scenarios)) for (const f of ['scheduled', 'unattended', 'connected']) assert.ok(s[f] === undefined || typeof s[f] === 'boolean', `${k}.${f}`);
  });
  it('no mission of chapters 1 to 15 fires, and its answer run has no fire step', () => {
    AQ.CH.slice(0, 15).forEach((ch, c) => ch.missions.forEach((m, i) => {
      const p = AQ.prepare(m, m.answer);
      assert.equal(config.fired(p.scenario, p.setup, p.prompt), null, `[${c}, ${i}]`);
      const r = AQ.evaluate(m, m.answer, { approved: true });
      if (r.outcome) assert.ok(!types(r.outcome).includes('fire'), `[${c}, ${i}]`);
    }));
  });
  it('no scenario outside the personal set is scheduled', () => {
    for (const [k, s] of Object.entries(AQ.scenarios)) if (s.scheduled) assert.ok(['digest', 'digestDaily', 'remind'].includes(k), k);
  });
});

describe('E9: glob in matches', () => {
  const m = permissions.matches;
  it('a * pattern matches the whole target and spans /', () => {
    assert.ok(m('*.pdf', 'a/b.pdf'));
    assert.ok(m('*.pdf', 'b.pdf'));
    assert.ok(m('downloads/*.pdf', 'downloads/invoice-2024.pdf'));
    assert.ok(!m('downloads/*.pdf', 'downloads/old-draft.txt'));
    assert.ok(!m('*.pdf', 'a.pdfx'));
    assert.ok(m('src/price*', 'src/price.js'));
    assert.ok(!m('src/price*', 'src/tax.js'));
    assert.ok(m('*', 'anything/at/all'));
  });
  it('prefix and suffix may not overlap: a*a does not match a', () => {
    assert.ok(!m('a*a', 'a'));
    assert.ok(m('a*a', 'aa'));
    assert.ok(m('a*a', 'aba'));
    assert.ok(!m('ab*bc', 'abc'));
    assert.ok(m('ab*bc', 'abbc'));
  });
  it('middle parts match left to right, with several stars', () => {
    assert.ok(m('a*b*c', 'a1b2c'));
    assert.ok(!m('a*b*c', 'a1c2b'));
    assert.ok(m('*-signed*.txt', 'documents/lease-signed2.txt'));
    assert.ok(!m('a*b*b*c', 'abc'));
    assert.ok(m('a*b*b*c', 'abbc'));
    assert.ok(m('a**c', 'ac'));
  });
  it('a long path with three stars finishes at once', () => {
    const t = 'a'.repeat(200);
    const at = Date.now();
    assert.equal(m('*a*a*b', t), false);
    assert.equal(m('a*a*a*a', t), true);
    assert.ok(Date.now() - at < 200);
  });
  it('a pattern without a star behaves as before', () => {
    assert.ok(m('src/', 'src/price.js'));
    assert.ok(!m('src/pri', 'src/price.js'));
    assert.ok(m('npm', 'npm test'));
  });
});

describe('E9: a star in a rule is a rule, not a literal path', () => {
  const sc = { vfs: { 'downloads/a.pdf': 'x', 'downloads/b.txt': 'y', 'notes/a.md': 'z' }, commands: { 'npm test': () => ({ ok: true }) }, tools: ['mail.send'] };
  const rule = (l) => config.parseConstraint(l, sc);
  it('is accepted for edit, read and delete when some file matches', () => {
    assert.deepEqual(J(rule('do not delete downloads/*.pdf')).c, { kind: 'do not', verb: 'delete', target: 'downloads/*.pdf' });
    assert.equal(rule('do not edit *.md').ok, true);
    assert.equal(rule('only read notes/*').ok, true);
    assert.equal(rule('do not delete *.pdf').ok, true);
  });
  it('is rejected when it matches no file, has too many stars, or has odd characters', () => {
    assert.match(rule('do not delete downloads/*.docx').error, /matches no file in this project/);
    assert.equal(rule('do not delete *a*a*a*a*').ok, false);
    assert.equal(rule('do not delete down?oads/*').ok, false);
    assert.equal(rule('do not delete ../*').ok, false);
  });
  it('is still rejected for run, call, Files, Examples and Done when', () => {
    assert.equal(rule('do not run npm *').ok, false);
    assert.equal(rule('do not call mail.*').ok, false);
    assert.equal(config.parseDoneWhen('read downloads/*.pdf', sc).ok, false);
    const p = config.parsePrompt('Files: downloads/*\nExamples: downloads/*.pdf', sc, config.parseSetup(vfs.create(sc.vfs)));
    assert.equal(p.errors.length, 2);
    assert.deepEqual(J(p.files), []);
  });
  it('a star in CLAUDE.md, permissions.txt and hooks.txt acts like a constraint', () => {
    const scn = { ...sc, script: [{ verb: 'delete', target: 'downloads/a.pdf' }, { verb: 'delete', target: 'downloads/b.txt' }], hidden: [{ verb: 'delete', target: 'downloads/a.pdf' }] };
    for (const [files, by] of [[{ 'CLAUDE.md': 'do not delete downloads/*.pdf' }, 'CLAUDE.md'], [{ '.claude/permissions.txt': 'deny delete downloads/*.pdf' }, 'permission rule'], [{ '.claude/hooks.txt': 'before delete downloads/*.pdf' }, 'hook']]) {
      const { outcome } = run('Goal: tidy', { scn, files });
      assert.deepEqual(J(outcome.violations), [], by);
      assert.ok(outcome.steps.some((s) => s.type === 'skip' && s.target === 'downloads/a.pdf' && s.by === by), by);
      assert.equal(outcome.vfs.read('downloads/b.txt'), null, by);
    }
    assert.equal(run('Goal: tidy', { scn }).outcome.violations.length, 1);
  });
});

const REPORT = ['# Report', 'intro', '## Summary', 'short', '## Pricing', 'price one', '### Tiers', 'tier text', '## Competitors', 'rivals', '## Pricing', 'second pricing', '## Appendix', 'x '.repeat(400)].join('\n');

describe('E10: file#section in vfs', () => {
  const v = vfs.create({ 'reports/market.md': REPORT, 'a.md': 'no headings' });
  it('reads the heading and its body to the next heading of the same or a higher level', () => {
    assert.equal(v.read('reports/market.md#pricing'), '## Pricing\nprice one\n### Tiers\ntier text');
    assert.equal(v.read('reports/market.md#summary'), '## Summary\nshort');
    assert.equal(v.read('reports/market.md#tiers'), '### Tiers\ntier text');
    assert.equal(v.read('reports/market.md#report').startsWith('# Report\nintro'), true);
    assert.ok(v.read('reports/market.md#report').includes('## Appendix'));
  });
  it('the anchor is the heading lowercased with runs of other characters turned into -', () => {
    const w = vfs.create({ 'x.md': '## Q3 Pricing & Plans!\nbody\n##   Plain   spaces  \nmore' });
    assert.equal(w.read('x.md#q3-pricing-plans'), '## Q3 Pricing & Plans!\nbody');
    assert.equal(w.read('x.md#plain-spaces'), '##   Plain   spaces  \nmore');
  });
  it('the first duplicate anchor wins', () => assert.ok(!v.read('reports/market.md#pricing').includes('second pricing')));
  it('a missing section, a missing file or an empty anchor gives null', () => {
    for (const p of ['reports/market.md#nope', 'missing.md#pricing', 'reports/market.md#', 'a.md#a', '#pricing', 'reports/market.md#Pricing']) assert.equal(v.read(p), null, p);
  });
  it('a whole file still reads whole, and # never makes a file name valid', () => {
    assert.equal(v.read('a.md'), 'no headings');
    assert.equal(vfs.valid('a#b'), false);
    assert.equal(v.write('a#b', 'x'), false);
    assert.equal(v.write('a.md#b', 'x'), false);
    assert.equal(v.read('a.md#b'), null);
    assert.equal(v.remove('reports/market.md#pricing'), false);
    assert.equal(vfs.create({ 'a#b': 'x' }).list().length, 0);
  });
  it('exports section for the resolver', () => assert.equal(vfs.section('## A\nx\n## B\ny', 'b'), '## B\ny'));
});

describe('E10: file#section in the grammar and the run', () => {
  const sc = { vfs: { 'reports/market.md': REPORT, 'summary.md': '' }, commands: {}, tools: [], script: [{ verb: 'edit', target: 'summary.md', needs: ['reports/market.md#pricing'], write: 'price one' }] };
  const setup = () => config.parseSetup(vfs.create(sc.vfs));
  it('Files, Examples and Done when: read accept an existing section', () => {
    const p = config.parsePrompt('Files: reports/market.md#pricing\nExamples: reports/market.md#summary\nDone when: read reports/market.md#summary', sc, setup());
    assert.deepEqual(J(p.errors), []);
    assert.deepEqual(J(p.files), ['reports/market.md#pricing']);
    assert.deepEqual(J(p.doneWhen), { verb: 'read', target: 'reports/market.md#summary' });
  });
  it('an unknown anchor or file is an error; edit and delete still reject #', () => {
    const p = config.parsePrompt('Files: reports/market.md#pricin', sc, setup());
    assert.equal(p.errors.length, 1);
    assert.equal(config.parseConstraint('do not edit reports/market.md#pricing', sc).ok, false);
    assert.equal(config.parseConstraint('do not delete reports/market.md#pricing', sc).ok, false);
    assert.equal(config.parseConstraint('do not read reports/market.md#nope', sc).ok, false);
    assert.equal(config.parseConstraint('do not read reports/market.md#pricing', sc).ok, true);
  });
  it('the context holds only the section, so the peak is smaller than for the whole file', () => {
    const section = run('Files: reports/market.md#pricing', { scn: sc }).outcome, whole = run('Files: reports/market.md', { scn: sc }).outcome;
    assert.ok(section.tokens.peak < whole.tokens.peak, `${section.tokens.peak} < ${whole.tokens.peak}`);
    assert.equal(section.vfs.read('summary.md'), 'price one');
  });
  it('a whole-file read satisfies a section need; a sibling section does not', () => {
    assert.equal(run('Files: reports/market.md', { scn: sc }).outcome.vfs.read('summary.md'), 'price one');
    const sib = run('Files: reports/market.md#competitors', { scn: sc }).outcome;
    assert.equal(sib.vfs.read('summary.md'), '');
    assert.ok(sib.steps.some((s) => s.type === 'skip' && s.by === 'not seen yet'));
  });
  it('matches covers X#section for a rule on X, and not the other way round', () => {
    assert.ok(permissions.matches('notes/x.md', 'notes/x.md#a'));
    assert.ok(!permissions.matches('notes/x.md#a', 'notes/x.md'));
    assert.ok(permissions.matches('notes/*.md', 'notes/x.md#a'));
    assert.ok(!permissions.matches('notes/x.mdx', 'notes/x.md#a'));
  });
  it('do not read X and deny read X stop a read of X#section, and hidden flags it', () => {
    const scn = { ...sc, script: [{ verb: 'read', target: 'reports/market.md#pricing' }], hidden: [{ verb: 'read', target: 'reports/market.md' }] };
    assert.equal(run('Goal: x', { scn }).outcome.violations.length, 1);
    for (const [files, by] of [[{ 'CLAUDE.md': 'do not read reports/market.md' }, 'CLAUDE.md'], [{ '.claude/permissions.txt': 'deny read reports/market.md' }, 'permission rule']]) {
      const { outcome } = run('Goal: x', { scn, files });
      assert.deepEqual(J(outcome.violations), [], by);
      assert.ok(outcome.steps.some((s) => s.type === 'skip' && s.by === by), by);
    }
  });
});

/* an 18.2-shaped scenario: not registered, so the engine row does not depend on PR 2 content */
const agenda = (extra = {}) => ({
  vfs: { 'notes/dentist.md': 'Dentist, Tuesday 10:00', 'calendar/events.txt': 'team standup', '.claude/mcp.txt': 'calendar: list' },
  commands: {},
  tools: ['calendar.list', 'calendar.create'],
  connected: true,
  script: [{ verb: 'read', target: 'notes/dentist.md' }, { verb: 'call', target: 'calendar.create' }],
  toolFns: {
    'calendar.create': (v) => { v.write('calendar/events.txt', v.read('calendar/events.txt') + '\ndentist visit'); return { ok: true }; },
    'calendar.list': (v) => { const t = v.read('calendar/events.txt'); return { ok: /dentist/i.test(t), out: t }; },
  },
  ...extra,
});
const ask = (mcp, scn = agenda(), more = '') => run(`Goal: put the dentist visit on my calendar\nDone when: call calendar.list${more}`, { scn, files: { '.claude/mcp.txt': mcp } });
const verify = (o) => o.steps.find((s) => s.type === 'act' && s.tag === 'verify');

describe('E11: tool functions with an effect', () => {
  it('calendar: list, create ends done and the event is in the file', () => {
    const o = ask('calendar: list, create').outcome;
    assert.equal(o.status, 'done');
    assert.equal(verify(o).ok, true);
    assert.match(o.vfs.read('calendar/events.txt'), /dentist visit/);
  });
  it('calendar: create alone ends unverified: the read-back is skipped as not connected', () => {
    const o = ask('calendar: create').outcome;
    assert.equal(o.status, 'unverified');
    assert.ok(o.steps.some((s) => s.type === 'skip' && s.target === 'calendar.list' && s.by === 'not connected'));
  });
  it('the lazy setup (calendar: list) ends failed with a failing read-back, because toolFns decides', () => {
    const o = ask('calendar: list').outcome;
    assert.equal(o.status, 'failed');
    assert.equal(verify(o).ok, false);
    assert.ok(o.steps.some((s) => s.type === 'skip' && s.target === 'calendar.create' && s.by === 'not connected'));
  });
  it('a denied create also ends failed', () => {
    const o = ask('calendar: list, create', agenda(), '').outcome;
    const d = run('Goal: x\nDone when: call calendar.list', { scn: agenda(), files: { '.claude/mcp.txt': 'calendar: list, create', '.claude/permissions.txt': 'deny call calendar.create' } }).outcome;
    assert.equal(o.status, 'done');
    assert.equal(d.status, 'failed');
    assert.ok(d.steps.some((s) => s.type === 'skip' && s.by === 'permission rule'));
  });
  it('pitfall: the same scenario without the leading read ends blocked (policy turns an all-skipped script into blocked)', () => {
    const o = ask('calendar: list', agenda({ script: [{ verb: 'call', target: 'calendar.create' }] })).outcome;
    assert.equal(o.status, 'blocked');
  });
  it('control: without toolFns the lazy setup ends done, so toolFns is what decides', () => {
    const o = ask('calendar: list', agenda({ toolFns: undefined })).outcome;
    assert.equal(o.status, 'done');
    assert.equal(o.vfs.read('calendar/events.txt'), 'team standup');
  });
  it('a throwing function is ok:false, and absent toolFns keeps the old list match', () => {
    const boom = agenda({ toolFns: { 'calendar.list': () => { throw new Error('x'); } } });
    assert.equal(AQ.shell.exec(boom, { verb: 'call', target: 'calendar.list' }, vfs.create(boom.vfs)).ok, false);
    const none = agenda({ toolFns: undefined });
    assert.deepEqual(J(AQ.shell.exec(none, { verb: 'call', target: 'calendar.list' }, vfs.create(none.vfs))), { ok: true, out: '' });
    assert.equal(AQ.shell.exec(none, { verb: 'call', target: 'calendar.nope' }, vfs.create(none.vfs)).ok, false);
  });
  it('a send to a name present in toolFns keeps the list-match result', () => {
    const scn = agenda();
    assert.deepEqual(J(AQ.shell.exec(scn, { verb: 'send', target: 'calendar.create' }, vfs.create(scn.vfs))), { ok: true, out: '' });
    assert.equal(AQ.shell.exec(scn, { verb: 'send', target: 'calendar.list' }, vfs.create(scn.vfs)).ok, true);
  });
  it('a toolFns write does not change the scenario', () => {
    const scn = agenda();
    ask('calendar: list, create', scn);
    assert.equal(scn.vfs['calendar/events.txt'], 'team standup');
  });
  it('toolFns keys are tools of their scenario, for every registered scenario', () => {
    for (const [k, s] of Object.entries(AQ.scenarios)) for (const t of Object.keys(s.toolFns || {})) assert.ok((s.tools || []).includes(t), `${k}.${t}`);
  });
});
