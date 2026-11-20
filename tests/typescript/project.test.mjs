import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ts = createRequire(import.meta.url)('typescript');
const engine = vm.createContext({ ts });
vm.runInContext(fs.readFileSync(new URL('../../shared/tscheck.js', import.meta.url), 'utf8'), engine, { filename: 'tscheck.js' });

// A JSON round trip turns the context's objects into this realm's, so deepEqual can compare them.
const project = files => JSON.parse(JSON.stringify(engine.TSCheck.checkProject(files)));
const codes = r => r.diags.map(d => d.code);
const config = (compilerOptions, rest = {}) => ({ 'tsconfig.json': JSON.stringify({ compilerOptions, ...rest }) });

describe('checkProject: several files', () => {
  const files = {
    'main.ts': "import { a } from './a'\nimport { b } from './dir/b'\nimport { c } from './pkg'\nimport d from './d'\nconsole.log(a, b, c, d())",
    'a.ts': 'export const a: number = 1',
    'dir/b.ts': "import { a } from '../a'\nexport const b: number = a + 1",
    'pkg/index.ts': 'export const c: string = "index"',
    'd.ts': 'export default function d(): string { return "default" }',
  };

  it('resolves relative paths, a directory index and a default export with no diagnostics', () => {
    const r = project(files);
    assert.deepEqual(r.diags, []);
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.js).sort(), ['a.js', 'd.js', 'dir/b.js', 'main.js', 'pkg/index.js']);
  });

  it('accepts a circular import', () => {
    const r = project({
      'a.ts': "import { b } from './b'\nexport const a = 1\nexport function useB(): number { return b }",
      'b.ts': "import { a } from './a'\nexport const b = 2\nexport function useA(): number { return a }",
    });
    assert.deepEqual(r.diags, []);
  });

  it('reports a missing file as TS2307 against the importing file', () => {
    const r = project({ 'main.ts': "import { x } from './nope'\nconsole.log(x)" });
    assert.deepEqual(r.diags.map(d => [d.file, d.line, d.code]), [['main.ts', 1, 2307]]);
    assert.equal(r.ok, false);
  });

  it('reports a name that is not exported as TS2305', () => {
    const r = project({ 'a.ts': 'export const a = 1', 'main.ts': "import { b } from './a'\nconsole.log(b)" });
    assert.deepEqual(r.diags.map(d => [d.file, d.code]), [['main.ts', 2305]]);
    assert.match(r.diags[0].msg, /no exported member 'b'/);
  });

  it('reports a diagnostic against the file it falls in, with its own line and column', () => {
    const r = project({ 'a.ts': 'export const a = 1', 'dir/b.ts': "export const ok = 1\nexport const bad: string = 5" });
    assert.deepEqual(r.diags.map(d => [d.file, d.line, d.col, d.code]), [['dir/b.ts', 2, 14, 2322]]);
  });

  it('a syntax error in one file does not hide the diagnostics of the others', () => {
    const r = project({ 'a.ts': 'export const a = ', 'b.ts': 'export const b: string = 1' });
    const byFile = f => codes({ diags: r.diags.filter(d => d.file === f) });
    assert.ok(byFile('a.ts').length > 0, 'the syntax error is reported');
    assert.deepEqual(byFile('b.ts'), [2322]);
  });
});

describe('checkProject: emitted JS', () => {
  it('leaves no require for an import type and drops an unused import', () => {
    const r = project({
      'types.ts': 'export interface Point { x: number }\nexport const unused = 1',
      'main.ts': "import type { Point } from './types'\nimport { unused } from './types'\nconst p: Point = { x: 1 }\nconsole.log(p.x)",
    });
    assert.deepEqual(r.diags, []);
    assert.doesNotMatch(r.js['main.js'], /require/);
  });

  it('keeps a used import as a require', () => {
    const r = project({ 'a.ts': 'export const a = 1', 'main.ts': "import { a } from './a'\nconsole.log(a)" });
    assert.match(r.js['main.js'], /require\("\.\/a"\)/);
  });

  it('a 3-file program runs through the virtual Node CommonJS', () => {
    const r = project({
      'greet.ts': 'export function greet(who: string): string { return `hello ${who}` }',
      'util/shout.ts': 'export const shout = (s: string): string => s.toUpperCase() + "!"',
      'main.ts': "import { greet } from './greet'\nimport { shout } from './util/shout'\nconsole.log(shout(greet('ts')))",
    });
    assert.deepEqual(r.diags, []);
    const ctx = vm.createContext({});
    const nodeCtx = vm.createContext({ console, ts });
    for (const f of ['scheduler.js', 'nodeenv.js']) vm.runInContext(fs.readFileSync(new URL(`../../shared/${f}`, import.meta.url), 'utf8'), nodeCtx, { filename: f });
    nodeCtx.JSRealm = { runScript: (R, code) => { try { vm.runInContext(code, R.w); return null; } catch (e) { return e; } } };
    const out = [];
    const vfs = { files: Object.fromEntries(Object.entries(r.js)), write() {}, remove() {}, list: () => Object.keys(r.js), installed: () => false, hasModules: () => false };
    const R = { w: ctx };
    ctx.console = { log: (...a) => out.push(a.join(' ')) };
    const env = nodeCtx.NodeEnv.make(R, vfs, 'main.js', [], { out: l => out.push(l) });
    env.require('./main.js');
    assert.deepEqual(out, ['HELLO TS!']);
  });
});

describe('checkProject: tsconfig flags', () => {
  // [option, source, code, config that turns the code on, config that turns it off]
  const matrix = [
    ['noImplicitAny', 'export function f(x) { return x }', 7006, { strict: false, noImplicitAny: true }, { strict: true, noImplicitAny: false }],
    ['strictNullChecks', 'export function f(s?: string) { return s.length }', 18048, { strict: false, strictNullChecks: true }, { strict: true, strictNullChecks: false }],
    ['noUncheckedIndexedAccess', 'const a: number[] = [1]\nexport const n: number = a[0] + 1', 2532, { strict: true, noUncheckedIndexedAccess: true }, { strict: true }],
    ['noImplicitReturns', 'export function f(x: number) { if (x > 0) { return 1 } }', 7030, { noImplicitReturns: true }, {}],
    ['noUnusedLocals', 'export function f() { const u = 1 }', 6133, { noUnusedLocals: true }, {}],
  ];
  for (const [name, src, code, on, off] of matrix) {
    it(`${name}: ${code} appears only when the option is on`, () => {
      assert.deepEqual(codes(project({ ...config(on), 'a.ts': src })), [code], 'on');
      assert.deepEqual(codes(project({ ...config(off), 'a.ts': src })), [], 'off');
    });
  }

  it('strict covers noImplicitAny and strictNullChecks', () => {
    const sloppy = 'export function f(x) { return x }\nexport function g(s?: string) { return s.length }';
    assert.deepEqual(codes(project({ ...config({ strict: true }), 'a.ts': sloppy })), [7006, 18048]);
    assert.deepEqual(codes(project({ ...config({ strict: false }), 'a.ts': sloppy })), []);
  });

  it('with no tsconfig the defaults are strict, ES2020 and CommonJS', () => {
    const r = project({ 'a.ts': 'export function f(x) { return x }\nexport const o = { a: 1 }?.a' });
    assert.deepEqual(codes(r), [7006]);
    assert.match(r.js['a.js'], /exports\.f = f/);
    assert.match(r.js['a.js'], /\?\./, 'ES2020 keeps optional chaining');
  });

  it('a tsconfig target and module change the emit', () => {
    const r = project({ ...config({ target: 'ES2015', module: 'ESNext' }), 'a.ts': 'export const o = { a: 1 }?.a' });
    assert.deepEqual(r.diags, []);
    assert.match(r.js['a.js'], /^export /m);
    assert.doesNotMatch(r.js['a.js'], /\?\./);
  });
});

describe('checkProject: tsconfig problems come back as diagnostics', () => {
  it('bad JSON is a diagnostic against tsconfig.json, not a throw', () => {
    const r = project({ 'tsconfig.json': '{ "compilerOptions": ', 'a.ts': 'export const a = 1' });
    assert.deepEqual(r.diags.map(d => [d.file, d.code]), [['tsconfig.json', 1109]]);
    assert.equal(r.ok, false);
  });

  it('an unknown option is TS5023 against tsconfig.json', () => {
    const r = project({ ...config({ nope: true }), 'a.ts': 'export const a = 1' });
    assert.deepEqual(r.diags.map(d => [d.file, d.code]), [['tsconfig.json', 5023]]);
  });

  it('a bad option value is TS6046 against tsconfig.json', () => {
    const r = project({ ...config({ target: 'es99' }), 'a.ts': 'export const a = 1' });
    assert.deepEqual(r.diags.map(d => [d.file, d.code]), [['tsconfig.json', 6046]]);
  });

  it('a missing extends target is a diagnostic against tsconfig.json', () => {
    const r = project({ ...config({}, { extends: './base.json' }), 'a.ts': 'export const a = 1' });
    assert.deepEqual(r.diags.map(d => [d.file, d.code]), [['tsconfig.json', 5083]]);
  });
});

describe('checkProject: files, include, exclude and extends', () => {
  const bad = 'export const bad: string = 1';
  const tree = {
    'main.ts': "import { a } from './src/a'\nconsole.log(a)",
    'src/a.ts': 'export const a = 1',
    'src/skip.ts': bad,
    'other/o.ts': bad,
  };

  it('with no files or include, every .ts file is a root', () => {
    const r = project({ ...config({}), ...tree });
    assert.deepEqual(r.diags.map(d => d.file).sort(), ['other/o.ts', 'src/skip.ts']);
    assert.deepEqual(Object.keys(r.js).sort(), ['main.js', 'other/o.js', 'src/a.js', 'src/skip.js']);
  });

  it('files lists the roots exactly: a file not imported is left out', () => {
    const r = project({ ...config({}, { files: ['main.ts'] }), ...tree });
    assert.deepEqual(r.diags, []);
    assert.deepEqual(Object.keys(r.js).sort(), ['main.js', 'src/a.js']);
  });

  it('include selects roots by glob from the file map', () => {
    const r = project({ ...config({}, { include: ['src/**/*'] }), ...tree });
    assert.deepEqual(r.diags.map(d => d.file), ['src/skip.ts']);
    assert.deepEqual(Object.keys(r.js).sort(), ['src/a.js', 'src/skip.js']);
  });

  it('exclude removes matches from the include set', () => {
    const r = project({ ...config({}, { include: ['src/**/*', 'other'], exclude: ['src/skip.ts', 'other'] }), ...tree });
    assert.deepEqual(r.diags, []);
    assert.deepEqual(Object.keys(r.js).sort(), ['src/a.js']);
  });

  it('an include that matches nothing is TS18003 against tsconfig.json', () => {
    const r = project({ ...config({}, { include: ['nowhere/**/*'] }), ...tree });
    assert.deepEqual(r.diags.map(d => [d.file, d.code]), [['tsconfig.json', 18003]]);
  });

  it('extends reads a base config from the file map', () => {
    const r = project({
      'tsconfig.json': JSON.stringify({ extends: './base.json' }),
      'base.json': JSON.stringify({ compilerOptions: { noUnusedLocals: true } }),
      'a.ts': 'export function f() { const u = 1 }',
    });
    assert.deepEqual(codes(r), [6133]);
  });
});

describe('checkProject: forced options', () => {
  const src = "const m: Map<string, number> = new Map()\nconsole.log(m, document.title)\nexport {}";
  const base = project({ 'a.ts': src });

  it('lib, types and typeRoots in a config change nothing and raise no option diagnostic', () => {
    const r = project({
      ...config({ lib: ['dom', 'es2022'], types: ['node'], typeRoots: ['/node_modules/@types'], noLib: false }),
      'a.ts': src,
    });
    assert.deepEqual(r, base);
    assert.ok(codes(r).length > 0, 'the hand lib still lacks these names');
    assert.ok(r.diags.every(d => d.file === 'a.ts'));
  });

  it('files the map does not hold cannot be read: an import of a real package fails', () => {
    const r = project({ ...config({ baseUrl: '/', paths: { '*': ['/etc/*'] } }), 'a.ts': "import fs from 'fs'\nexport default fs" });
    assert.deepEqual(r.diags.map(d => [d.file, d.code]), [['a.ts', 2307]]);
  });
});
