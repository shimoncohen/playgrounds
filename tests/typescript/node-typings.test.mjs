import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ts = createRequire(import.meta.url)('typescript');
const engine = vm.createContext({ ts });
for (const f of ['tscheck.js', 'nodetypes.js']) {
  vm.runInContext(fs.readFileSync(new URL(`../../shared/${f}`, import.meta.url), 'utf8'), engine, { filename: f });
}
const { NodeTypes } = engine;

// A JSON round trip turns the context's objects into this realm's, so deepEqual can compare them.
const plain = v => JSON.parse(JSON.stringify(v));
const node = files => plain(engine.TSCheck.checkProject(files, { node: true }));
const codes = src => node({ 'main.ts': src }).diags.map(d => d.code);
const config = (compilerOptions, rest = {}) => ({ 'tsconfig.json': JSON.stringify({ compilerOptions, ...rest }) });

const libDir = path.dirname(createRequire(import.meta.url).resolve('typescript'));
const HAND_LIB = /const TS_LIB=`([^`]*)`/.exec(fs.readFileSync(new URL('../../shared/tscheck.js', import.meta.url), 'utf8'))[1];
function unfiltered(rootText, { handLib = false, user } = {}) {
  const virtual = { '/node.d.ts': rootText };
  if (user !== undefined) virtual['/main.ts'] = user;
  if (handLib) virtual['/lib.d.ts'] = HAND_LIB;
  const options = { strict: true, target: ts.ScriptTarget.ES2020, noEmit: true, types: [], ...(handLib ? { noLib: true } : { lib: ['lib.es2020.d.ts'] }) };
  const host = {
    getSourceFile: (n, v) => {
      const text = virtual[n] ?? (n.startsWith(libDir) ? fs.readFileSync(n, 'utf8') : null);
      return text == null ? undefined : ts.createSourceFile(n, text, v);
    },
    getDefaultLibFileName: () => (handLib ? '/lib.d.ts' : path.join(libDir, 'lib.es2020.d.ts')), getDefaultLibLocation: () => libDir,
    writeFile() {}, getCurrentDirectory: () => '/', getDirectories: () => [],
    fileExists: n => n in virtual || fs.existsSync(n), readFile: n => virtual[n] ?? fs.readFileSync(n, 'utf8'),
    getCanonicalFileName: n => n, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
  };
  const roots = ['/node.d.ts', ...(handLib ? ['/lib.d.ts'] : []), ...(user !== undefined ? ['/main.ts'] : [])];
  const prog = ts.createProgram(roots, options, host);
  return [...prog.getOptionsDiagnostics(), ...prog.getSyntacticDiagnostics(), ...prog.getSemanticDiagnostics(), ...prog.getGlobalDiagnostics()]
    .map(d => `${d.file?.fileName}:${d.start} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
}

describe('the Node typings are valid TypeScript, with no diagnostic filtered', () => {
  it('compile with zero diagnostics under the real lib.es2020.d.ts', () => {
    assert.deepEqual(unfiltered(NodeTypes.modules), []);
  });

  it('compile with zero diagnostics under the hand lib plus the iterator part', () => {
    assert.deepEqual(unfiltered(NodeTypes.modules + '\n' + NodeTypes.iterators, { handLib: true }), []);
  });

  it('a harness that loads nothing would be caught: an undeclared name is reported under both libs', () => {
    assert.ok(unfiltered('declare var x: Nope;').length > 0);
    assert.ok(unfiltered('declare var x: Nope;', { handLib: true }).length > 0);
  });

  it('are under 12 KB', () => {
    assert.ok(Buffer.byteLength(NodeTypes.modules + NodeTypes.iterators) <= 12 * 1024);
  });
});

describe('what chapter 16 to 18 code gets from the typings', () => {
  const table = [
    ['a wrong argument', "import path from 'path'\npath.join(1)", [2345]],
    ['http.get is not declared', "import http from 'http'\nhttp.get('x', () => {})", [2339]],
    ['JSON.parse held as unknown', "const d: unknown = JSON.parse('{}')\nconsole.log(d.name)", [18046]],
    ['a typed handler', "import http from 'node:http'\nconst s = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(String(req.url)) })\ns.listen(3000, () => console.log('up'))", []],
    ['for...of over Object.entries', "const o = { a: 1, b: 2 }\nfor (const [k, v] of Object.entries(o)) console.log(k, v + 1)", []],
    ['assert.doesNotMatch', "import assert from 'assert'\nassert.doesNotMatch('abc', /x/)", []],
    ['for...of over a Map, a Set and a string',"const m = new Map<string, number>()\nfor (const [k, v] of m) console.log(k, v)\nfor (const x of new Set([1, 2])) console.log(x + 1)\nfor (const c of 'abc') console.log(c.toUpperCase())", []],
    ['fs with both module names', "import fs from 'fs'\nimport { readFileSync } from 'node:fs'\nconst a: string = fs.readFileSync('x', 'utf8')\nconst b: string = readFileSync('x', 'utf8')\nconsole.log(a, b, fs.existsSync('x'))", []],
    ['fs.promises and the callback form', "import fs from 'fs'\nfs.promises.readFile('x', 'utf8').then(t => console.log(t.length))\nfs.readFile('x', 'utf8', (err, t) => { if (err) throw err; console.log(t) })", []],
    ['a wrong fs argument', "import fs from 'fs'\nfs.writeFileSync('x', 5)", [2345]],
    ['events', "import { EventEmitter } from 'events'\nimport EE from 'node:events'\nconst e = new EventEmitter(); const f = new EE()\ne.on('x', (n: number) => console.log(n)); f.emit('x', 1)", []],
    ['node:test and assert', "import { test, describe, it, before, beforeEach } from 'node:test'\nimport assert from 'node:assert'\nimport strict from 'node:assert/strict'\ndescribe('s', () => { before(() => {}); it('a', async () => { assert.equal(1, 1); strict.deepEqual([1], [1]) }) })\ntest('t', (t) => { assert.throws(() => { throw new Error('x') }) })", []],
    ['assert.ok narrows', "import assert from 'assert'\nconst v: string | undefined = process.argv[2]\nassert.ok(v)\nconsole.log(v.length)", []],
    ['process and the globals', "process.stdout.write('a'); process.stderr.write('b')\nprocess.exitCode = 1\nconst id = setInterval(() => {}, 10); clearInterval(id)\nconst im = setImmediate(() => {}); clearImmediate(im)\nconsole.log(process.argv.length, process.env.HOME, process.cwd(), __dirname, __filename)\nprocess.on('exit', () => {})", []],
    ['process.exit is never', "function f(): number { process.exit(1) }\nconsole.log(f())", []],
  ];
  for (const [name, src, want] of table) it(name, () => assert.deepEqual(codes(src), want));

  it('the iterator snippets also check clean under the real lib.es2020.d.ts, and an error there is still reported', () => {
    const snippets = table.filter(([name]) => name.startsWith('for...of')).map(([, src]) => 'declare const console: { log(...a: any[]): void }\n' + src);
    for (const src of snippets) assert.deepEqual(unfiltered(NodeTypes.modules, { user: src }), [], src);
    assert.ok(unfiltered(NodeTypes.modules, { user: 'const n: number = "x"' }).length > 0);
  });

  it('a missing module is still TS2307', () => {
    assert.deepEqual(codes("import x from 'nope'\nconsole.log(x)"), [2307]);
  });
});

describe('checkProject(files, {node:true})', () => {
  const FS = { 'main.ts': "import fs from 'fs'\nconsole.log(fs.existsSync('x'))" };

  it('with no second argument returns what it returned before, and no emit flag', () => {
    const r = plain(engine.TSCheck.checkProject(FS));
    assert.deepEqual(r.diags.map(d => d.code), [2307]);
    assert.deepEqual(Object.keys(r).sort(), ['diags', 'js', 'ok']);
    assert.deepEqual(plain(engine.TSCheck.checkProject(FS, undefined)), r);
  });

  it('the hand lib text is unchanged by the layer', () => {
    const before = plain(engine.TSCheck.checkProject({ 'main.ts': 'const a: number = "x"' }));
    node(FS);
    assert.deepEqual(plain(engine.TSCheck.checkProject({ 'main.ts': 'const a: number = "x"' })), before);
  });

  it('esModuleInterop defaults on: a default import of fs checks and emits the interop helper', () => {
    const r = node(FS);
    assert.deepEqual(r.diags, []);
    assert.match(r.js['main.js'], /__importDefault/);
    assert.equal(r.ok, true);
  });

  it('a tsconfig can still turn esModuleInterop off', () => {
    const r = node({ ...FS, ...config({ esModuleInterop: false }) });
    assert.deepEqual(r.diags.map(d => d.code), [1192]);
  });

  it('the emitted module stays CommonJS when the tsconfig asks for another kind', () => {
    const r = node({ 'main.ts': 'export const a = 1\nimport fs from "fs"\nconsole.log(fs)', ...config({ module: 'esnext' }) });
    assert.match(r.js['main.js'], /exports\.a = 1/);
    assert.match(r.js['main.js'], /require\("fs"\)/);
    assert.doesNotMatch(r.js['main.js'], /^export /m);
  });

  it('emit is true by default and false when the tsconfig sets noEmit', () => {
    assert.equal(node(FS).emit, true);
    assert.equal(node({ ...FS, ...config({ noEmit: true }) }).emit, false);
    assert.equal(node({ ...FS, ...config({ outDir: 'dist' }) }).emit, true);
  });

  it('js is still returned when emit is false', () => {
    assert.deepEqual(Object.keys(node({ ...FS, ...config({ noEmit: true }) }).js), ['main.js']);
  });

  it('the typings are hidden from include globs and from diagnostics', () => {
    assert.deepEqual(node({ 'notes.txt': 'x', ...config({}, { include: ['**/*'] }) }).diags.map(d => d.code), [18003]);
    assert.deepEqual(Object.keys(node({ ...FS, ...config({}, { include: ['**/*'] }) }).js), ['main.js']);
  });

  it('a file named like a typings file is not reported', () => {
    const r = node({ 'main.ts': 'console.log(1)', '.lib/other.ts': 'const a: number = "x"' });
    assert.deepEqual(r.diags.map(d => d.file), ['.lib/other.ts']);
  });

  it('only user files appear in the js map', () => {
    assert.deepEqual(Object.keys(node({ 'a.ts': 'export const a = 1', 'main.ts': "import { a } from './a'\nconsole.log(a)" }).js).sort(), ['a.js', 'main.js']);
  });
});
