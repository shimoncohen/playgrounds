import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AQ } from './fixture.mjs';

// A prompt mission is answered in the prompt: moving the answer into a setup file the scenario ships must not pass it.
const PROMPT = AQ.CH.flatMap((ch, c) => ch.missions.map((m, i) => ({ c, i, m, name: `${c + 1}.${i + 1} ${m.title}` })))
  .filter(({ c, m }) => c >= 1 && c <= 14 && m.kind === 'prompt');
const go = (m, input) => AQ.evaluate(m, input, { approved: true });
const files = (m) => AQ.scenarios[m.scenario].vfs;
const covered = (path, list) => list.some((f) => path === f || (f.endsWith('/') && path.startsWith(f)));
const J = (x) => JSON.parse(JSON.stringify(x));

describe('a prompt mission is not passed by moving its answer into a setup file', () => {
  for (const { m, name } of PROMPT) {
    it(`${name}: the answer's rules and file scope in CLAUDE.md, permissions and hooks, with an empty prompt`, () => {
      const f = AQ.config.splitFields(m.answer).fields;
      const lines = f.constraints.slice();
      if (f.files.length) {
        const project = Object.keys(files(m)).filter((p) => !AQ.editable(p) && !covered(p, f.files));
        lines.push(...project.map((p) => `do not read ${p}`));
      }
      if (!lines.length) return;
      const vfs = files(m), edit = {};
      const root = (vfs['CLAUDE.md'] || '') + '\n' + lines.join('\n') + '\n';
      edit['CLAUDE.md'] = root;
      const rules = lines.map((l) => /^(do not|only) (\S+) (.+)$/i.exec(l)).filter(Boolean);
      if ('.claude/permissions.txt' in vfs) edit['.claude/permissions.txt'] = vfs['.claude/permissions.txt'] + '\n' + rules.filter((r) => /do not/i.test(r[1])).map((r) => `deny ${r[2]} ${r[3]}`).join('\n') + '\n';
      if ('.claude/hooks.txt' in vfs) edit['.claude/hooks.txt'] = vfs['.claude/hooks.txt'] + '\n' + rules.map((r) => `before ${r[2]} ${r[3]}`).join('\n') + '\n';
      for (const p of Object.keys(vfs)) if (AQ.isFolderMemory(p)) edit[p] = vfs[p] + '\n' + lines.join('\n') + '\n';
      const r = go(m, { prompt: '', files: edit });
      assert.notEqual(r.result, true, 'passed with an empty prompt');
    });
  }
});

describe('a shipped helper keeps its price in a prompt mission', () => {
  for (const { m, name } of PROMPT) {
    const agents = Object.keys(files(m)).filter((p) => p.startsWith('.claude/agents/'));
    if (!agents.length) continue;
    it(`${name}: the wrong prompt still fails when every helper is rewritten to small`, () => {
      const edit = Object.fromEntries(agents.map((p) => [p, files(m)[p].replace(/^model:.*$/m, 'model: small')]));
      assert.notEqual(go(m, { prompt: m.wrong, files: edit }).result, true);
    });
  }
});

describe('a shipped command keeps its lines in a prompt mission', () => {
  for (const { m, name } of PROMPT) {
    const cmds = Object.keys(files(m)).filter((p) => p.startsWith('.claude/commands/'));
    if (!cmds.length) continue;
    it(`${name}: the wrong prompt plus Use: NAME still fails when the command holds the answer`, () => {
      const answer = AQ.config.splitFields(m.answer).fields;
      for (const p of cmds) {
        const n = /([\w-]+)\.md$/.exec(p)[1];
        if (answer.use.includes(n)) continue;
        const r = go(m, { prompt: m.wrong + '\nUse: ' + n, files: { [p]: m.answer.split('\n').filter((l) => !/^Use:/i.test(l)).join('\n') } });
        assert.notEqual(r.result, true, p);
      }
    });
  }
});

describe('every prompt mission of chapters 2 to 15 keeps its answer passing', () => {
  for (const { m, name } of PROMPT) it(name, () => assert.equal(go(m, m.answer).result, true));
});

describe('the issue traces, run by hand', () => {
  const at = (c, i) => AQ.CH[c].missions[i];
  const root = (text) => ({ prompt: '', files: { 'CLAUDE.md': text } });
  it('2.3, 2.4 and 3.2 fail with the file scope written as rules in CLAUDE.md', () => {
    assert.notEqual(go(at(1, 2), root('only read src/price.js')).result, true);
    assert.notEqual(go(at(1, 3), root('do not read docs/\ndo not read src/util.js')).result, true);
    assert.notEqual(go(at(2, 1), root('only read src/price.js')).result, true);
  });
  it('7.2 and 7.3 fail with the rule in CLAUDE.md and an empty prompt', () => {
    assert.notEqual(go(at(6, 1), root('do not send mail.send')).result, true);
    assert.notEqual(go(at(6, 2), root('do not read .env')).result, true);
  });
  it('10.2 and 10.3 fail when the shipped architect is rewritten to small', () => {
    const a = { '.claude/agents/architect.md': 'name: architect\nmodel: small\n' };
    assert.notEqual(go(at(9, 1), { prompt: 'Use: architect', files: a }).result, true);
    assert.notEqual(go(at(9, 2), { prompt: 'Use: scout, scout2, architect', files: a }).result, true);
  });
});
