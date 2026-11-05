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
  it('unattended: a non-read action needs a matching allow line, a read never does', () => {
    const un = { edited: [], unattended: true };
    const allow = { '.claude/permissions.txt': 'allow edit src/\nallow call mail' };
    assert.deepEqual(check(act('edit', 'src/price.js'), [], {}, un), { allowed: false, by: 'no one to ask' });
    assert.deepEqual(check(act('edit', 'src/price.js'), [], allow, un), { allowed: true, by: null });
    assert.deepEqual(check(act('call', 'mail.send'), [], allow, un), { allowed: true, by: null });
    assert.equal(check(act('edit', 'docs/big.md'), [], allow, un).by, 'no one to ask');
    assert.equal(check(act('delete', 'src/price.js'), [], allow, un).by, 'no one to ask');
    assert.equal(check(act('run', 'npm test'), [], allow, un).by, 'no one to ask');
    assert.equal(check(act('read', 'docs/big.md'), [], {}, un).allowed, true);
  });
  it('allow beats nothing: a constraint or a deny line still blocks, and attended runs ignore allow', () => {
    const un = { edited: [], unattended: true };
    assert.equal(check(act('edit', 'src/price.js'), [c('do not edit src/')], { '.claude/permissions.txt': 'allow edit src/' }, un).by, 'your constraint');
    assert.equal(check(act('edit', 'src/price.js'), [], { '.claude/permissions.txt': 'deny edit src/\nallow edit src/' }, un).by, 'permission rule');
    assert.equal(check(act('edit', 'src/price.js'), [], { '.claude/permissions.txt': 'allow edit src/' }, { edited: [] }).allowed, true);
    assert.equal(check(act('edit', 'src/price.js'), [], {}, { edited: [] }).allowed, true);
  });
  it('matches a name, a folder or a namespace, not a mere prefix of a name', () => {
    assert.ok(permissions.matches('src/', 'src/price.js'));
    assert.ok(permissions.matches('src', 'src/price.js'));
    assert.ok(permissions.matches('mail', 'mail.send'));
    assert.ok(permissions.matches('npm', 'npm test'));
    assert.ok(!permissions.matches('src/pri', 'src/price.js'));
    assert.ok(!permissions.matches('mail.send', 'mail'));
  });
  it('a * stands for any text, whole-target, and the prefix and suffix may not overlap', () => {
    assert.ok(!permissions.matches('a*a', 'a'));
    assert.ok(permissions.matches('a*a', 'aa'));
    assert.ok(permissions.matches('a*a', 'aba'));
    assert.ok(permissions.matches('*.pdf', 'a/b.pdf'));
    assert.ok(!permissions.matches('*.pdf', 'a.pdfx'));
    assert.ok(permissions.matches('a*b*c', 'a1b2c'));
    assert.ok(!permissions.matches('a*b*c', 'a1c2b'));
    const long = 'a'.repeat(200);
    assert.equal(permissions.matches('*a*a*b', long), false);
    assert.equal(permissions.matches('a*a*a*a', long), true);
  });
  it('a rule on a file also covers a section of it, and not the other way round', () => {
    assert.ok(permissions.matches('notes/x.md', 'notes/x.md#a'));
    assert.ok(!permissions.matches('notes/x.md#a', 'notes/x.md'));
    assert.ok(permissions.matches('notes/*.md', 'notes/x.md#a'));
  });
  it('a star in a deny line and in an allow line goes live', () => {
    const un = { edited: [], unattended: true };
    assert.equal(check(act('delete', 'downloads/a.pdf'), [], { '.claude/permissions.txt': 'deny delete downloads/*.pdf' }).by, 'permission rule');
    assert.equal(check(act('delete', 'downloads/a.txt'), [], { '.claude/permissions.txt': 'deny delete downloads/*.pdf' }).allowed, true);
    assert.equal(check(act('edit', 'src/price.js'), [], { '.claude/permissions.txt': 'allow edit src/price*' }, un).allowed, true);
    assert.equal(check(act('edit', 'src/tax.js'), [], { '.claude/permissions.txt': 'allow edit src/price*' }, un).by, 'no one to ask');
  });
});
