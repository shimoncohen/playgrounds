import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadScriptContent } from '../content-loader.mjs';

const root = new URL('../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const win = {};
new Function('window', read('shared/catalog.js'))(win);
const entries = win.Catalog.QUESTS;

describe('TypeScript Quest wiring', () => {
  const entry = entries.find(e => e.key === 'typescript-quest-v1');

  it('has a catalog entry', () => assert.ok(entry));

  it('hub card matches the catalog entry', () => {
    const hub = read('programming/index.html');
    const m = hub.match(/<a class="card" href="typescript-quest\/" data-key="([^"]+)">[\s\S]*?<div class="sub">(\d+) chapters?<\/div>/);
    assert.ok(m, 'TypeScript card missing');
    assert.equal(m[1], entry.key);
    assert.equal(Number(m[2]), entry.missions.length);
  });

  it('landing count equals the programming catalog entries', () => {
    const n = entries.filter(e => e.subject === 'programming').length;
    const m = read('index.html').match(/<h2>Programming<\/h2><div class="sub">(\d+) quests<\/div>/);
    assert.ok(m, 'Programming count missing');
    assert.equal(Number(m[1]), n);
  });

  it('CONTRIBUTING lists the typescript scope', () => {
    assert.match(read('CONTRIBUTING.md'), /`typescript`/);
  });

  it('loads scheduler.js after jsrealm.js and before app.js (the REPL loop guard)', () => {
    const tags = [...read('programming/typescript-quest/index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = s => tags.indexOf(s);
    const [js, sch] = ['jsrealm', 'scheduler'].map(n => at(`../../shared/${n}.js`));
    assert.ok(js >= 0 && sch > js, 'scheduler.js must follow jsrealm.js');
    assert.ok(sch < at('app.js'), 'scheduler.js must load before app.js');
  });

  it('loads the advanced chapters after ch-modules.js and before quickfire.js, in chapter order', () => {
    const tags = [...read('programming/typescript-quest/index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const order = ['content/ch-modules.js', 'content/ch-keyof-and-indexed-access.js', 'content/ch-mapped-types.js', 'content/ch-conditional-types.js', 'content/ch-template-literal-types.js', 'content/quickfire.js'];
    const at = order.map(s => tags.indexOf(s));
    assert.ok(at.every(i => i >= 0), `a tag is missing: ${at}`);
    assert.deepEqual(at, [...at].sort((a, b) => a - b));
  });

  it('Script chapter 11 points to TypeScript Quest', () => {
    const ch = loadScriptContent().CH[10];
    assert.equal(ch.name, 'TypeScript');
    assert.match(ch.pointer, /href="\.\.\/typescript-quest\/"/);
  });
});
