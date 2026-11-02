import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AQ, scenario } from './fixture.mjs';
import { J } from './harness.mjs';

const { permissions, config, vfs } = AQ;
const setup = (files = {}) => config.parseSetup(vfs.create({ ...scenario.vfs, ...files }));
const c = (line, by = 'your constraint') => ({ ...config.parseConstraint(line, scenario).c, by });
const act = (verb, target) => ({ verb, target });
const check = (a, cs = [], files = {}, state) => J(permissions.check(a, setup(files), cs, state));

describe('permissions.check', () => {
  it('allows what nothing blocks', () => assert.deepEqual(check(act('edit', 'src/price.js')), { allowed: true, by: null }));
  it('do not blocks the verb on the target and under a folder, and says who blocked it', () => {
    assert.deepEqual(check(act('edit', 'migrations/001.sql'), [c('do not edit migrations/')]), { allowed: false, by: 'your constraint' });
    assert.equal(check(act('read', 'migrations/001.sql'), [c('do not edit migrations/')]).allowed, true);
    assert.equal(check(act('edit', 'src/price.js'), [c('do not edit migrations/')]).allowed, true);
    assert.equal(check(act('call', 'mail.send'), [c('do not call mail.send')]).allowed, false);
    assert.equal(check(act('run', 'npm test'), [c('do not run npm test')]).allowed, false);
  });
  it('only blocks every other target for that verb', () => {
    const rules = [c('only edit src/price.js')];
    assert.equal(check(act('edit', 'src/price.js'), rules).allowed, true);
    assert.equal(check(act('edit', 'src/tax.js'), rules).allowed, false);
    assert.equal(check(act('read', 'src/tax.js'), rules).allowed, true);
  });
  it('ask before blocks, because nobody answers in a pretend run', () => assert.equal(check(act('delete', 'src/tax.js'), [c('ask before delete src/')]).allowed, false));
  it('max N files lets the first N files through and blocks the next new one', () => {
    const rules = [c('max 2 files')];
    assert.equal(check(act('edit', 'a'), rules, {}, { edited: ['a'] }).allowed, true);
    assert.equal(check(act('edit', 'b'), rules, {}, { edited: ['a'] }).allowed, true);
    assert.equal(check(act('edit', 'c'), rules, {}, { edited: ['a', 'b'] }).allowed, false);
    assert.equal(check(act('edit', 'a'), rules, {}, { edited: ['a', 'b'] }).allowed, true);
    assert.equal(check(act('read', 'c'), rules, {}, { edited: ['a', 'b'] }).allowed, true);
  });
  it('permission rules and hooks block too', () => {
    assert.deepEqual(check(act('edit', 'migrations/001.sql'), [], { '.claude/permissions.txt': 'deny edit migrations/' }), { allowed: false, by: 'permission rule' });
    assert.deepEqual(check(act('run', 'npm test'), [], { '.claude/hooks.txt': 'before run npm test' }), { allowed: false, by: 'hook' });
  });
  it('standing CLAUDE.md rules arrive as constraints carrying their source', () => {
    const rules = config.memoryRules(setup({ 'CLAUDE.md': 'do not edit migrations/' }), scenario).rules.map((r) => ({ ...r, by: 'CLAUDE.md' }));
    assert.deepEqual(check(act('edit', 'migrations/001.sql'), rules), { allowed: false, by: 'CLAUDE.md' });
  });
  it('matches a name, a folder or a namespace, not a mere prefix of a name', () => {
    assert.ok(permissions.matches('src/', 'src/price.js'));
    assert.ok(permissions.matches('src', 'src/price.js'));
    assert.ok(permissions.matches('mail', 'mail.send'));
    assert.ok(permissions.matches('npm', 'npm test'));
    assert.ok(!permissions.matches('src/pri', 'src/price.js'));
    assert.ok(!permissions.matches('mail.send', 'mail'));
  });
});
