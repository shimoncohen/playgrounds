import fs from 'node:fs';
import vm from 'node:vm';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadScriptContent } from '../content-loader.mjs';
import { createSession } from './harness.mjs';

const ts = createRequire(import.meta.url)('typescript');
const LIBDIR = new URL('../../node_modules/typescript/lib/', import.meta.url).pathname;
const engine = vm.createContext({ ts });
vm.runInContext(fs.readFileSync(new URL('../../shared/tscheck.js', import.meta.url), 'utf8'), engine, { filename: 'tscheck.js' });

const handCodes = src => Array.from(engine.TSCheck.check([], src).diags, d => d.code);

// The real es2020 lib closure (no DOM), read from the pinned compiler. console is declared by the snippet.
const realCodes = src => {
  const main = 'declare var console: { log(...a: any[]): void };\n' + src;
  const host = {
    getSourceFile: (n, v) => n === 'main.ts' ? ts.createSourceFile(n, main, v) : fs.existsSync(LIBDIR + n) ? ts.createSourceFile(n, fs.readFileSync(LIBDIR + n, 'utf8'), v) : undefined,
    getDefaultLibFileName: () => 'lib.es2020.d.ts', getDefaultLibLocation: () => '', writeFile() {}, getCurrentDirectory: () => '',
    getDirectories: () => [], fileExists: n => n === 'main.ts' || fs.existsSync(LIBDIR + n), readFile: n => n === 'main.ts' ? main : fs.readFileSync(LIBDIR + n, 'utf8'),
    getCanonicalFileName: n => n, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
  };
  const prog = ts.createProgram(['main.ts'], { strict: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None, noEmit: true, types: [] }, host);
  return [...prog.getSyntacticDiagnostics(), ...prog.getSemanticDiagnostics()].filter(d => d.file.fileName === 'main.ts').map(d => d.code);
};

// [name, snippet, expected diagnostic codes]: each is compiled with both libs and must give exactly these codes.
const SNIPPETS = [
  ['Extract keeps the matching members', 'type A = Extract<"a" | "b" | 1, string>\nconst x: A = "a"\nconst y: A = 1', [2322]],
  ['Extract of a union with a function', 'type F = Extract<string | (() => void), Function>\nconst f: F = () => {}\nf()', []],
  ['NonNullable drops null and undefined', 'type S = NonNullable<string | null | undefined>\nconst s: S = "x"\nconst n: S = null', [2322]],
  ['Parameters is a tuple', 'function f(a: number, b: string) {}\ntype P = Parameters<typeof f>\nconst p: P = [1, "x"]\nconst q: P = [1, 2]', [2322]],
  ['InstanceType of a class', 'class Crew { n = 1 }\ntype C = InstanceType<typeof Crew>\nconst c: C = new Crew()\nconst bad: C = { n: "x" }', [2322]],
  ['Object.keys returns strings', 'const k: string[] = Object.keys({ a: 1 })\nconst bad: number[] = Object.keys({ a: 1 })', [2322]],
  ['Object.values returns the value type', 'const v: number[] = Object.values({ a: 1, b: 2 })\nconst bad: string[] = Object.values({ a: 1 })', [2322]],
  ['Object.entries returns pairs', 'const e: [string, number][] = Object.entries({ a: 1 })\nconst bad: [string, string][] = Object.entries({ a: 1 })', [2322]],
  ['Object.keys on a record with forEach', 'const r: Record<string, number> = { a: 1 }\nObject.keys(r).forEach(k => console.log(k.toUpperCase(), r[k]))', []],
  ['Map get is possibly undefined', 'const m = new Map<string, number>()\nm.set("a", 1)\nconst v: number = m.get("a")', [2322]],
  ['Map members', 'const m = new Map<string, number>([["a", 1]])\nconsole.log(m.size, m.has("a"), m.delete("a"))\nm.forEach((v, k) => console.log(k.length + v))\nm.clear()', []],
  ['Map rejects a wrong key', 'const m = new Map<string, number>()\nm.set(1, 1)', [2345]],
  ['Map with no type arguments infers from entries', 'const m = new Map([["a", 1]])\nm.set("b", "x")', [2345]],
  ['Set members', 'const s = new Set<number>([1, 2])\ns.add(3)\nconsole.log(s.size, s.has(1), s.delete(2))\ns.forEach(v => console.log(v + 1))\ns.clear()', []],
  ['Set rejects a wrong value', 'const s = new Set<number>()\ns.add("x")', [2345]],
  ['Date construction and reads', 'const d = new Date()\nconst t: number = d.getTime()\nconst y: number = d.getFullYear()\nconst s: string = d.toISOString()\nconst n: number = Date.now()', []],
  ['Date from a string and a number', 'const a = new Date("2026-01-01")\nconst b = new Date(0)\nconst diff: number = a.getTime() - b.getTime()', []],
  ['Date getTime is a number', 'const d = new Date()\nconst s: string = d.getTime()', [2322]],
  ['Date has no such member', 'new Date().nope', [2339]],
  ['Uppercase', 'type U = Uppercase<"ab">\nconst a: U = "AB"\nconst b: U = "ab"', [2322]],
  ['Lowercase', 'type L = Lowercase<"AB">\nconst a: L = "ab"\nconst b: L = "AB"', [2322]],
  ['Capitalize', 'type C = Capitalize<"ab">\nconst a: C = "Ab"\nconst b: C = "ab"', [2322]],
  ['Uncapitalize', 'type C = Uncapitalize<"AB">\nconst a: C = "aB"\nconst b: C = "AB"', [2322]],
  ['Capitalize distributes over a union', 'type C = Capitalize<"a" | "b">\nconst a: C = "A"\nconst b: C = "B"\nconst c: C = "a"', [2820]],
  ['on-handler names from Capitalize', 'type H = `on${Capitalize<"click" | "hover">}`\nconst a: H = "onClick"\nconst b: H = "onHover"\nconst c: H = "onclick"', [2820]],
  ['redeclaring a lib type', 'type Partial<T> = { [P in keyof T]: T[P] }', [2300]],
  ['Awaited unwraps nested promises', 'type A = Awaited<Promise<Promise<string>>>\nconst a: A = "x"\nconst b: A = 1', [2322]],
];

describe('hand lib additions', () => {
  for (const [name, src, codes] of SNIPPETS) {
    it(name, () => {
      assert.deepEqual(handCodes(src), codes, 'hand lib');
      assert.deepEqual(realCodes(src), codes, 'real lib.es2020.d.ts');
    });
  }
});

describe('Script chapter 11 (TypeScript) against the shared lib', () => {
  const ch = loadScriptContent().CH.find(c => c.name === 'TypeScript');
  it('is found', () => assert.ok(ch));
  ch.missions.forEach((m, i) => {
    it(`mission ${i + 1} "${m.title}": the reference answer passes its own check`, () => {
      const s = createSession();
      if (m.pre) s.run(m.pre);
      const rec = s.run(m.code);
      if (m.expectError) assert.ok(rec.diags.length, 'expected a diagnostic');
      else assert.deepEqual(rec.diags, [], 'expected a clean compile');
      assert.equal(!!m.check(s.ctx(rec)), true);
    });
  });
});
