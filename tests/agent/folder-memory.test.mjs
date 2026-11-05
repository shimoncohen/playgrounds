// Folder-level memory (spec "Folder memory"): a CLAUDE.md inside a folder loads when the agent reads under that folder.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AQ, scenario, run } from './fixture.mjs';
import { J } from './harness.mjs';

const { config, context, vfs, tokens } = AQ;
const RULE = 'do not edit src/legacy/\n';
const scn = {
  ...scenario,
  vfs: { ...scenario.vfs, 'src/legacy/old.js': 'old', 'src/CLAUDE.md': '', 'docs/CLAUDE.md': '' },
  script: [{ verb: 'read', target: 'src/price.js' }, { verb: 'edit', target: 'src/legacy/old.js', write: 'new' }],
  hidden: [{ verb: 'edit', target: 'src/legacy/' }],
  accept: () => true,
};
const setupOf = (files = {}) => config.parseSetup(vfs.create({ ...scn.vfs, ...files }));
const go = (files, s = scn) => run('Goal: g', { scn: s, files }).outcome;

describe('the folder memory path pattern', () => {
  it('accepts a CLAUDE.md in a folder at any depth', () => {
    for (const p of ['src/CLAUDE.md', 'src/a/CLAUDE.md']) assert.equal(AQ.isFolderMemory(p), true, p);
  });
  it('rejects the root file, .claude/, other spellings and other names', () => {
    for (const p of ['CLAUDE.md', '.claude/CLAUDE.md', 'src/claude.md', 'src/AGENTS.md', 'src/CLAUDE.md.bak', 'src/../CLAUDE.md', 5, null]) assert.equal(AQ.isFolderMemory(p), false, String(p));
  });
});

describe('memoryFolders and folderMemory', () => {
  const s = setupOf({ 'src/a/CLAUDE.md': 'deep', 'src/CLAUDE.md': 'top' });
  it('parseSetup lists them sorted by path with a trailing-slash dir', () => {
    assert.deepEqual(J(s.memoryFolders.map((f) => [f.path, f.dir, f.text])), [['docs/CLAUDE.md', 'docs/', ''], ['src/CLAUDE.md', 'src/', 'top'], ['src/a/CLAUDE.md', 'src/a/', 'deep']]);
  });
  it('matches a read path under the folder and not a sibling like srcx/', () => {
    assert.deepEqual(J(config.folderMemory(s, ['src/price.js']).map((f) => f.path)), ['src/CLAUDE.md']);
    assert.deepEqual(J(config.folderMemory(s, ['src/a/x.js']).map((f) => f.path)), ['src/CLAUDE.md', 'src/a/CLAUDE.md']);
    assert.deepEqual(J(config.folderMemory(s, ['srcx/a.js'])), []);
    assert.deepEqual(J(config.folderMemory(s, [])), []);
  });
});

describe('context with folder memory', () => {
  const setup = setupOf({ 'src/CLAUDE.md': 'folder rules' });
  const prompt = config.parsePrompt('Goal: g', scn, setup);
  const labels = (c) => J(c.segments.map((x) => x.label));
  it('a read under src/ adds a memory segment right after the root one; no read under src/ adds none', () => {
    assert.deepEqual(labels(context.build(setup, prompt, [], [{ path: 'src/price.js', text: 'bug' }])).slice(0, 3), ['System prompt', 'CLAUDE.md', 'src/CLAUDE.md']);
    assert.ok(!labels(context.build(setup, prompt, [], [{ path: 'docs/a.md', text: 'x' }])).includes('src/CLAUDE.md'));
    assert.equal(context.build(setup, prompt, [], [{ path: 'src/price.js', text: 'bug' }]).segments[2].kind, 'memory');
  });
  it('a read file that is the memory file is counted once, as memory', () => {
    const c = context.build(setup, prompt, [], [{ path: 'src/CLAUDE.md', text: 'folder rules' }]);
    assert.equal(c.segments.filter((x) => x.label === 'src/CLAUDE.md').length, 1);
    assert.equal(c.segments.find((x) => x.kind === 'files').text, '');
  });
  it('setupTokens counts folder text whether or not it was read, and the kinds list is unchanged', () => {
    assert.equal(context.setupTokens(setup) - context.setupTokens(setupOf({})), tokens.estimate('folder rules'));
    assert.deepEqual(J(context.KINDS), ['system', 'memory', 'skills', 'mcp', 'files', 'history', 'prompt']);
  });
});

describe('policy with folder memory', () => {
  it('a rule in src/CLAUDE.md blocks a later edit after the agent read under src/, with no violation', () => {
    const o = go({ 'src/CLAUDE.md': RULE });
    assert.deepEqual(J(o.violations), []);
    assert.ok(o.steps.some((s) => s.type === 'skip' && s.target === 'src/legacy/old.js' && s.by === 'src/CLAUDE.md'));
  });
  it('the same rule in docs/CLAUDE.md never loads, so the trap runs', () => {
    assert.equal(go({ 'docs/CLAUDE.md': RULE }).violations.length, 1);
  });
  it('an edit alone does not load the file', () => {
    const o = go({ 'src/CLAUDE.md': RULE }, { ...scn, script: [scn.script[1]] });
    assert.equal(o.violations.length, 1);
  });
  it('a loaded folder file raises the peak', () => {
    assert.ok(go({ 'src/CLAUDE.md': 'w'.repeat(400) }).tokens.peak > go({}).tokens.peak);
  });
});

describe('the create-gate on folder memory', () => {
  AQ.scenarios.fm = scn;
  const m = { scenario: 'fm', kind: 'config', prompt: 'Goal: g' };
  const result = (files) => AQ.evaluate(m, { files }).result;
  it('an input that edits a shipped stub takes effect', () => assert.equal(result({ 'src/CLAUDE.md': RULE }), true));
  it('an input that creates a folder file the scenario does not ship has no effect', () => {
    assert.equal(typeof result({ 'src/legacy/CLAUDE.md': RULE }), 'string');
    assert.equal(AQ.prepare(m, { files: { 'src/legacy/CLAUDE.md': RULE } }).setup.memoryFolders.some((f) => f.path === 'src/legacy/CLAUDE.md'), false);
  });
  it('a project file that is not setup is still read-only', () => assert.equal(AQ.prepare(m, { files: { 'src/price.js': 'x' } }).vfs.read('src/price.js'), 'bug'));
  it('the editor treats the stub as editable and other project files as read-only', () => {
    assert.equal(AQ.editable('src/CLAUDE.md'), true);
    assert.equal(AQ.editable('src/price.js'), false);
  });
});
