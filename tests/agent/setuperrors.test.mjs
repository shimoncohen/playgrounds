import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AQ } from './fixture.mjs';

const mission = AQ.CH[12].missions[0];
const BAD = {
  '.claude/permissions.txt': 'allow edt src/price.js',
  '.claude/hooks.txt': 'after src/ run npm run lint',
  '.claude/mcp.txt': 'calendar list',
  '.claude/skills/x.md': 'name: x\nwhen: sometimes\n',
  '.claude/agents/y.md': 'name: y\nmodel: huge\n',
};

describe('a setup file that does not parse refuses the run', () => {
  for (const [file, text] of Object.entries(BAD)) {
    it(file, () => {
      const r = AQ.evaluate(mission, { files: { [file]: text } });
      assert.equal(r.refused, true);
      assert.equal(r.outcome, null);
      assert.match(r.result, /was not run/);
      assert.ok(r.setup.errors.some((e) => e.file === file && e.msg), JSON.stringify(r.setup.errors));
    });
  }
  it('a command file that clashes with a skill name is refused', () => {
    const r = AQ.evaluate(mission, { files: { '.claude/skills/fix.md': 'name: fix\nwhen: bugfix\n', '.claude/commands/fix.md': 'Goal: x' } });
    assert.equal(r.refused, true);
  });
  it('an emptied skill or agent file is a removed one, not an error', () => {
    const setup = AQ.config.parseSetup(AQ.vfs.create({ '.claude/skills/a.md': '  \n', '.claude/agents/b.md': '' }));
    assert.deepEqual(JSON.parse(JSON.stringify(setup.errors)), []);
    assert.equal(setup.skills.length + setup.subagents.length, 0);
  });
});

describe('no learner meets a setup error before touching a file', () => {
  it('every shipped scenario parses with zero setup errors', () => {
    for (const [name, sc] of Object.entries(AQ.scenarios)) assert.deepEqual(JSON.parse(JSON.stringify(AQ.config.parseSetup(AQ.vfs.create(sc.vfs)).errors)), [], name);
  });
  it('every mission answer parses with zero setup errors', () => {
    AQ.CH.forEach((ch, c) => ch.missions.forEach((m, i) => {
      const { setup } = AQ.prepare(m, m.answer);
      assert.deepEqual(JSON.parse(JSON.stringify(setup.errors)), [], `[${c}, ${i}] ${m.title}`);
    }));
  });
});
