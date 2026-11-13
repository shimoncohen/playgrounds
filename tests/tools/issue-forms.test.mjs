import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared/catalog.js'), 'utf8'), sandbox);
const names = [...sandbox.Catalog.QUESTS].map(q => q.name);

for (const form of ['bug', 'feature-request', 'mission-idea']) {
  test(`issue form ${form}.yml lists every playground in catalog order`, () => {
    const text = fs.readFileSync(path.join(ROOT, '.github/ISSUE_TEMPLATE', `${form}.yml`), 'utf8');
    const m = text.match(/id: where[\s\S]*?options: \[(.*)\]/);
    assert.ok(m, 'no "where" dropdown with an inline options list');
    const options = m[1].split(',').map(s => s.trim());
    assert.deepEqual(options.slice(0, names.length), names);
    // GitHub refuses a form whose dropdown has a duplicate or empty option.
    assert.equal(new Set(options).size, options.length, 'duplicate option');
    assert.ok(options.every(Boolean), 'empty option');
  });
}
