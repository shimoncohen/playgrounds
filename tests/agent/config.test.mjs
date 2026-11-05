// The prompt grammar and the setup parser: every bad line is an inline error with no effect and no exception.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAgent, J } from './harness.mjs';

const AQ = loadAgent();
const { config, vfs } = AQ;
const scenario = {
  vfs: { 'src/price.js': 'x', 'src/util.js': 'y', 'migrations/001.sql': 'z', 'docs/sample.md': 's', 'CLAUDE.md': '' },
  commands: { 'npm test': () => ({ ok: true }) },
  tools: ['mail.send', 'calendar.list'],
};
const rule = (line) => config.parseConstraint(line, scenario);

describe('constraints', () => {
  it('accepts every form', () => {
    assert.deepEqual(J(rule('do not edit migrations/')), { ok: true, c: { kind: 'do not', verb: 'edit', target: 'migrations/' } });
    assert.deepEqual(J(rule('only edit src/price.js')).c, { kind: 'only', verb: 'edit', target: 'src/price.js' });
    assert.deepEqual(J(rule('ask before run npm test')).c, { kind: 'ask before', verb: 'run', target: 'npm test' });
    assert.deepEqual(J(rule('do not call mail.send')).c, { kind: 'do not', verb: 'call', target: 'mail.send' });
    assert.deepEqual(J(rule('do not send mail')).c, { kind: 'do not', verb: 'send', target: 'mail' });
    assert.deepEqual(J(rule('max 3 files')).c, { kind: 'max', verb: 'edit', target: '', n: 3 });
    assert.deepEqual(J(rule('Do Not Delete src/util.js')).c, { kind: 'do not', verb: 'delete', target: 'src/util.js' });
  });
  const bad = {
    'an empty line': '',
    'a blank line': '   ',
    'an unknown verb': 'do not frobnicate src/',
    'an unresolved target': 'do not edit nonexistent/',
    'a .. path': 'do not read ../secrets.txt',
    'a .. path in the middle': 'do not edit src/../migrations/',
    'a 5,000-character line': 'do not edit ' + 'a'.repeat(5000),
    'advice that is not a rule': "be careful and don't break anything",
    'max zero': 'max 0 files',
    'a command that does not exist': 'do not run rm -rf',
    'a tool that does not exist': 'do not call web.search',
  };
  for (const [what, line] of Object.entries(bad)) {
    it(`rejects ${what} with a message and no exception`, () => {
      const r = rule(line);
      assert.equal(r.ok, false);
      assert.equal(typeof r.error, 'string');
      assert.ok(r.error.length > 0 && r.error.length < 200, 'the message stays short even for a long line');
    });
  }
  it('does not throw on non-strings or a missing scenario', () => {
    for (const v of [null, undefined, 5, {}, []]) assert.equal(config.parseConstraint(v, scenario).ok, false);
    assert.equal(config.parseConstraint('do not edit src/').ok, false);
  });
});

describe('done when', () => {
  const d = (l) => config.parseDoneWhen(l, scenario);
  it('accepts run, read and call', () => {
    assert.deepEqual(J(d('run npm test')).d, { verb: 'run', target: 'npm test' });
    assert.deepEqual(J(d('read docs/sample.md')).d, { verb: 'read', target: 'docs/sample.md' });
    assert.deepEqual(J(d('call calendar.list')).d, { verb: 'call', target: 'calendar.list' });
  });
  it('rejects text that is not a check, empty lines and unresolved targets', () => {
    for (const l of ['it is done', '', 'run nothing', 'read ../x', 'edit src/price.js', 'x'.repeat(5000)]) assert.equal(d(l).ok, false, l);
  });
});

describe('prompt', () => {
  const p = (t, setup) => config.parsePrompt(t, scenario, setup);
  it('reads every field', () => {
    const r = p('Goal: fix it\nFiles: src/price.js, src/util.js\nExamples: docs/sample.md\nPlan: first\nConstraints: do not edit migrations/\nConstraints: max 2 files\nDone when: run npm test\nExtra: thanks');
    assert.deepEqual(J(r.errors), []);
    assert.deepEqual(J(r.files), ['src/price.js', 'src/util.js']);
    assert.deepEqual(J(r.examples), ['docs/sample.md']);
    assert.equal(r.plan, true);
    assert.equal(r.constraints.length, 2);
    assert.deepEqual(J(r.doneWhen), { verb: 'run', target: 'npm test' });
    assert.equal(r.fields.goal, 'fix it');
    assert.equal(r.fields.extra, 'thanks');
  });
  it('turns each bad line into an error with no effect', () => {
    const r = p("Constraints: be careful and don't break anything\nDone when: it is done\nFiles: nope.js\nExamples: see above\nConstraints: do not edit nonexistent/\nPlan: later\nrandom words\nGoal:" + ' '.repeat(2) + 'x'.repeat(5000));
    assert.equal(r.constraints.length, 0);
    assert.equal(r.doneWhen, null);
    assert.deepEqual(J(r.files), []);
    assert.deepEqual(J(r.examples), []);
    assert.equal(r.plan, false);
    assert.equal(r.errors.length, 8);
    assert.ok(r.errors.every((e) => e.line.length <= 80), 'long lines are shortened in the message');
  });
  it('an empty Constraints or Done when value is an error', () => {
    assert.equal(p('Constraints:').errors.length, 1);
    assert.equal(p('Done when:').errors.length, 1);
  });
  it('empty text and unknown field names do not throw', () => {
    for (const t of ['', '\n\n', null, undefined, 'constructor: x', '__proto__: x', 'Goal']) assert.doesNotThrow(() => p(t));
    assert.equal(p('').errors.length, 0);
    assert.equal(p('constructor: x').errors.length, 1);
  });
  it('a doneWhen of null means no Done when line', () => assert.equal(p('Goal: x').doneWhen, null));
});

describe('setup', () => {
  const files = {
    'CLAUDE.md': 'do not edit migrations/\n',
    '.claude/skills/fix.md': 'name: fix-rounding\ndescription: Fixes rounding bugs\nwhen: bugfix\n',
    '.claude/skills/odd.md': 'name: odd\ndescription: x\nwhen: sometimes\n',
    '.claude/skills/none.md': 'description: no name\nwhen: docs\n',
    '.claude/mcp.txt': 'calendar: list, create, delete\nbroken line\n',
    '.claude/permissions.txt': 'deny edit migrations/\nallow everything\n',
    '.claude/hooks.txt': 'before run npm test\n',
    '.claude/agents/helper.md': 'name: helper\nmodel: small\n',
    '.claude/agents/bad.md': 'name: bad\nmodel: huge\n',
  };
  const setup = config.parseSetup(vfs.create(files));
  it('parses the memory, skills, MCP list, rules, hooks and subagents', () => {
    assert.equal(setup.memory, files['CLAUDE.md']);
    assert.deepEqual(J(setup.skills.map((s) => s.name)), ['fix-rounding']);
    assert.deepEqual(J(setup.mcp), [{ name: 'calendar', tools: ['list', 'create', 'delete'] }]);
    assert.deepEqual(J(setup.rules), [{ verb: 'edit', target: 'migrations/' }]);
    assert.deepEqual(J(setup.hooks), [{ verb: 'run', target: 'npm test' }]);
    assert.deepEqual(J(setup.subagents.map((s) => [s.name, s.model, s.cost])), [['helper', 'small', 1]]);
  });
  it('a skill when: outside the closed tag list is an error, and so is a skill with no name', () => {
    assert.ok(setup.errors.some((e) => e.file === '.claude/skills/odd.md' && /when:/.test(e.msg)));
    assert.ok(setup.errors.some((e) => e.file === '.claude/skills/none.md'));
    assert.ok(setup.skills.every((s) => config.TAGS.includes(s.when)));
  });
  it('malformed rule, MCP and subagent lines are errors', () => {
    assert.equal(setup.errors.filter((e) => e.file === '.claude/mcp.txt').length, 1);
    assert.equal(setup.errors.filter((e) => e.file === '.claude/permissions.txt').length, 1);
    assert.equal(setup.errors.filter((e) => e.file === '.claude/agents/bad.md').length, 1);
  });
  it('Use names must exist in the setup or the scenario', () => {
    const r = config.parsePrompt('Use: fix-rounding, calendar, calendar.create, helper, mail.send, ghost', scenario, setup);
    assert.deepEqual(J(r.use), ['fix-rounding', 'calendar', 'calendar.create', 'helper', 'mail.send']);
    assert.equal(r.errors.length, 1);
    assert.equal(config.parsePrompt('Use: fix-rounding', scenario).use.length, 0);
  });
  it('CLAUDE.md lines in the grammar are standing rules and other lines are ignored', () => {
    const m = config.memoryRules({ memory: '# notes\ndo not edit migrations/\nbe nice\n' }, scenario);
    assert.deepEqual(J(m.rules), [{ kind: 'do not', verb: 'edit', target: 'migrations/' }]);
    assert.deepEqual(J(m.ignored), ['be nice']);
  });
});

describe('virtual files', () => {
  const v = vfs.create({ 'a/b.txt': 'hi', '../evil': 'no', 'ok.md': 'x', 'sp ace': 'no', ['__proto__']: 'p' });
  it('rejects bad paths on create and on write without throwing', () => {
    assert.deepEqual(J(v.list()), ['__proto__', 'a/b.txt', 'ok.md']);
    for (const p of ['..', 'a/../b', '/abs', 'a//b', '', 'a\\b', 'x'.repeat(300), null, 5, 'dir/']) assert.equal(v.write(p, 't'), false, String(p));
    assert.equal(v.write('new/file.md', 't'), true);
    assert.equal(v.write('new/other.md', 5), false);
  });
  it('reads, lists folders, clones and removes', () => {
    assert.equal(v.read('a/b.txt'), 'hi');
    assert.equal(v.read('missing'), null);
    const c = v.clone();
    assert.equal(c.remove('ok.md'), true);
    assert.equal(c.remove('ok.md'), false);
    assert.equal(v.read('ok.md'), 'x');
    assert.deepEqual(J(v.list('a/')), ['a/b.txt']);
  });
});

describe('after-edit hooks and allow lines in the setup', () => {
  const files = {
    '.claude/hooks.txt': 'before run npm test\nafter edit src/ run npm run lint\nafter edit src/price.js\nafter read src/ run npm test\n',
    '.claude/permissions.txt': 'deny edit migrations/\nallow edit src/\nallow everything\n',
  };
  const setup = config.parseSetup(vfs.create(files));
  it('after edit PATH run COMMAND fills afterHooks, and before lines still fill hooks', () => {
    assert.deepEqual(J(setup.afterHooks), [{ target: 'src/', run: 'npm run lint' }]);
    assert.deepEqual(J(setup.hooks), [{ verb: 'run', target: 'npm test' }]);
  });
  it('a hooks line in neither form is an error that names both forms', () => {
    const e = setup.errors.filter((x) => x.file === '.claude/hooks.txt');
    assert.equal(e.length, 2);
    assert.ok(e.every((x) => x.msg.endsWith('is not "before VERB TARGET" or "after edit PATH run COMMAND"')));
  });
  it('allow VERB TARGET fills allow beside deny, and a bad allow line is an error', () => {
    assert.deepEqual(J(setup.allow), [{ verb: 'edit', target: 'src/' }]);
    assert.deepEqual(J(setup.rules), [{ verb: 'edit', target: 'migrations/' }]);
    const e = setup.errors.filter((x) => x.file === '.claude/permissions.txt');
    assert.equal(e.length, 1);
    assert.match(e[0].msg, /is not "deny VERB TARGET" or "allow VERB TARGET"/);
  });
  it('a setup with neither file has empty lists', () => {
    const s = config.parseSetup(vfs.create({}));
    assert.deepEqual([J(s.afterHooks), J(s.allow)], [[], []]);
  });
});

describe('connected tools', () => {
  const setup = config.parseSetup(vfs.create({ '.claude/mcp.txt': 'tracker: open, comment' }));
  it('hasTool is true for a server name or one of its tools only', () => {
    for (const t of ['tracker', 'tracker.open', 'tracker.comment']) assert.equal(config.hasTool(setup, t), true, t);
    for (const t of ['tracker.close', 'track', 'trackers.open', 'open', '']) assert.equal(config.hasTool(setup, t), false, t);
    assert.equal(config.hasTool(config.parseSetup(vfs.create({})), 'tracker'), false);
  });
});

describe('schedule, glob and section targets in the setup grammar', () => {
  const sc = { vfs: { 'downloads/a.pdf': 'x', 'downloads/b.txt': 'y', 'notes.md': '# Notes\n## Pricing\nten' }, commands: { 'npm test': () => ({ ok: true }) }, tools: [] };
  it('an empty setup has an empty schedule, and a valid line fills it', () => {
    assert.deepEqual(J(config.parseSetup(vfs.create({})).schedule), []);
    const s = config.parseSetup(vfs.create({ '.claude/commands/fix.md': 'Goal: x', '.claude/schedule.txt': '# c\nweekdays 07:30 use fix\nweekday 07:30 use fix' }));
    assert.deepEqual(J(s.schedule.map((x) => [x.day, x.at, x.use, x.days.length])), [['weekdays', '07:30', 'fix', 5]]);
    assert.deepEqual(J(s.errors.map((e) => e.file)), ['.claude/schedule.txt']);
  });
  it('a star is accepted in an edit, read or delete rule that matches a file, and rejected elsewhere', () => {
    assert.equal(config.parseConstraint('do not delete downloads/*.pdf', sc).ok, true);
    assert.equal(config.parseConstraint('do not delete downloads/*.docx', sc).ok, false);
    assert.equal(config.parseConstraint('do not run npm *', sc).ok, false);
    assert.equal(config.parsePrompt('Files: downloads/*', sc, config.parseSetup(vfs.create(sc.vfs))).errors.length, 1);
  });
  it('file#section is accepted for a read when the section exists, and never for an edit', () => {
    const p = config.parsePrompt('Files: notes.md#pricing', sc, config.parseSetup(vfs.create(sc.vfs)));
    assert.deepEqual([p.errors.length, J(p.files)], [0, ['notes.md#pricing']]);
    assert.equal(config.parsePrompt('Files: notes.md#nope', sc, config.parseSetup(vfs.create(sc.vfs))).errors.length, 1);
    assert.equal(config.parseConstraint('do not edit notes.md#pricing', sc).ok, false);
  });
});

describe('the default check from CLAUDE.md', () => {
  const sc = { ...scenario, commands: { 'npm test': () => ({ ok: true }), 'npm run lint': () => ({ ok: true }) } };
  const mem = (memory, root) => config.memoryRules({ memory }, sc, root);
  it('the first parsing Done when line of the root file is the check and leaves ignored', () => {
    const m = mem('do not edit migrations/\nDone when: run npm test\nDone when: run npm run lint\nbe nice', true);
    assert.deepEqual(J(m.check), { verb: 'run', target: 'npm test' });
    assert.deepEqual(J(m.rules), [{ kind: 'do not', verb: 'edit', target: 'migrations/' }]);
    assert.deepEqual(J(m.ignored), ['Done when: run npm run lint', 'be nice']);
    assert.equal(mem('done WHEN: read src/price.js').check.target, 'src/price.js');
  });
  it('root is the default; folder memory and skill bodies pass root=false and get no check', () => {
    const m = mem('Done when: run npm test', false);
    assert.equal(m.check, null);
    assert.deepEqual(J(m.ignored), ['Done when: run npm test']);
    assert.notEqual(mem('Done when: run npm test').check, null);
  });
  it('a line that does not parse, or names a missing command, stays ignored', () => {
    for (const l of ['Done when: it is done', 'Done when: run ghost', 'Done when: read nowhere.js', 'Done when:']) {
      const m = mem(l);
      assert.equal(m.check, null, l);
      assert.deepEqual(J(m.ignored), [l], l);
    }
  });
  it('no memory means no check', () => assert.equal(mem('').check, null));
});
