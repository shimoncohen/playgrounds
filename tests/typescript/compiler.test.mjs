import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const PIN = '5.9.3';
const read = rel => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const loadTscheck = () => {
  const ctx = vm.createContext({});
  vm.runInContext(read('shared/tscheck.js'), ctx, { filename: 'tscheck.js' });
  return ctx;
};

describe('compiler pin', () => {
  it('installed typescript is exactly the pinned version', () => {
    assert.equal(createRequire(import.meta.url)('typescript/package.json').version, PIN);
  });
  it('package.json pins typescript exactly', () => {
    assert.equal(JSON.parse(read('package.json')).devDependencies.typescript, PIN);
  });
  it('both CDN URLs in shared/tscheck.js name the pinned version', () => {
    const urls = [...read('shared/tscheck.js').matchAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/typescript@([^/]+)\//g)].map(m => m[1]);
    assert.deepEqual(urls, [PIN, PIN]);
  });
});

describe('TSCheck.load retry', () => {
  it('a load after a failure tries the compiler again and can succeed', async () => {
    const ctx = loadTscheck();
    const scripts = [];
    const doc = fail => ({
      createElement: () => ({}),
      head: { appendChild: s => { scripts.push(s); queueMicrotask(() => (fail ? s.onerror() : s.onload())); } },
    });
    ctx.TSCheck.init({ document: doc(true) });
    assert.equal(await ctx.TSCheck.load(), false);
    assert.equal(scripts.length, 2);

    ctx.TSCheck.init({ document: doc(false) });
    ctx.ts = {};
    assert.equal(await ctx.TSCheck.load(), true);
    assert.equal(scripts.length, 3);
    assert.match(scripts[2].src, /typescript\.min\.js$/);
    // ready stays ready: no further script tags
    assert.equal(await ctx.TSCheck.load(), true);
    assert.equal(scripts.length, 3);
  });
});
