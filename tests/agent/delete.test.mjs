import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AQ } from './fixture.mjs';

const J = (x) => JSON.parse(JSON.stringify(x));
const at = (c, i) => AQ.CH[c].missions[i];
const files = (m) => AQ.scenarios[m.scenario].vfs;
const go = (m, input) => AQ.evaluate(m, input, { approved: true });

describe('a file the learner deletes is absent to the engine', () => {
  it('a deleted skill or agent file is removed, like an emptied one', () => {
    const twin = at(4, 1), crew = at(1, 4);
    const del = AQ.prepare(twin, { files: { '.claude/skills/release-notes.md': null } });
    const empty = AQ.prepare(twin, { files: { '.claude/skills/release-notes.md': '' } });
    assert.equal(del.vfs.read('.claude/skills/release-notes.md'), null);
    assert.deepEqual(J(del.setup.skills), J(empty.setup.skills));
    assert.deepEqual(J(del.setup.errors), []);
    const agent = Object.keys(files(crew)).find((p) => p.startsWith('.claude/agents/'));
    assert.deepEqual(J(AQ.prepare(crew, { files: { [agent]: null } }).setup.subagents), J(AQ.prepare(crew, { files: { [agent]: '' } }).setup.subagents));
  });
  it('missions 5.2 and 5.3 pass by emptying and by deleting the file', () => {
    for (const [i, p] of [[1, '.claude/skills/release-notes.md'], [2, '.claude/skills/docs-style.md']]) {
      assert.equal(go(at(4, i), { files: { [p]: '' } }).result, true, `emptied ${p}`);
      assert.equal(go(at(4, i), { files: { [p]: null } }).result, true, `deleted ${p}`);
    }
  });
  it('deleting the skill that carries the rule still fails 5.2 and 5.3', () => {
    assert.notEqual(go(at(4, 1), { files: { '.claude/skills/release-guard.md': null } }).result, true);
    assert.notEqual(go(at(4, 2), { files: { '.claude/skills/release-guard.md': null } }).result, true);
  });
  it('a deleted root CLAUDE.md or mcp.txt reads as absent', () => {
    const m = at(4, 3);
    const p = AQ.prepare(m, { files: { 'CLAUDE.md': null, '.claude/mcp.txt': null } });
    assert.equal(p.setup.memory, '');
    assert.deepEqual(J(p.setup.mcp), []);
  });
  it('a read-only file or a folder memory file the scenario lacks cannot be deleted or invented', () => {
    const m = at(4, 4);
    assert.notEqual(AQ.prepare(at(1, 2), { files: { 'src/price.js': null } }).vfs.read('src/price.js'), null);
    assert.notEqual(AQ.prepare(m, { files: { '.claude/mcp.txt': null } }).vfs.read('.claude/mcp.txt'), null);
    assert.equal(AQ.prepare(m, { files: { 'src/CLAUDE.md': null } }).vfs.read('src/CLAUDE.md'), null);
  });
  it('deleting every editable file never throws and never passes a mission', () => {
    AQ.CH.forEach((ch, c) => ch.missions.forEach((m, i) => {
      const all = Object.fromEntries(Object.keys(files(m)).filter((p) => AQ.canEdit(m, p)).map((p) => [p, null]));
      const r = go(m, { prompt: '', files: all });
      assert.equal(typeof r.result, 'string', `[${c}, ${i}] ${m.title}`);
    }));
  });
});
