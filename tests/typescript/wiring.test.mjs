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

  it('Script chapter 11 points to TypeScript Quest', () => {
    const ch = loadScriptContent().CH[10];
    assert.equal(ch.name, 'TypeScript');
    assert.match(ch.pointer, /href="\.\.\/typescript-quest\/"/);
  });
});
