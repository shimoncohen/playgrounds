import fs from 'node:fs';
import vm from 'node:vm';
import util from 'node:util';
import { createRequire } from 'node:module';

// Node stand-in for the page's TypeScript console (programming/typescript-quest/app.js execTS/ctx): one session is one
// console, with DECLS/TYPES/HIST kept across runs so a check sees what the page would show it.
const ts = createRequire(import.meta.url)('typescript');
const engine = vm.createContext({ ts });
vm.runInContext(fs.readFileSync(new URL('../../shared/tscheck.js', import.meta.url), 'utf8'), engine, { filename: 'tscheck.js' });
const { check: tsCheck } = engine.TSCheck;

const REPLAY_BAD = /setTimeout|setInterval|\.then\s*\(|\.catch\s*\(|\bawait\b|console\.clear/;

function bindingNames(n, out) {
  if (ts.isIdentifier(n)) out.push(n.text);
  else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) n.elements.forEach(e => { if (ts.isBindingElement(e)) bindingNames(e.name, out); });
}

// Top-level declared names with their kind, read from the syntax tree.
export function declsOf(src) {
  const sf = ts.createSourceFile('x.ts', src, ts.ScriptTarget.ES2020, true);
  const out = [];
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) {
      const f = st.declarationList.flags;
      const kind = f & ts.NodeFlags.Const ? 'const' : f & ts.NodeFlags.Let ? 'let' : 'var';
      const names = [];
      st.declarationList.declarations.forEach(d => bindingNames(d.name, names));
      names.forEach(name => out.push({ name, kind }));
    } else if (ts.isFunctionDeclaration(st) && st.name) out.push({ name: st.name.text, kind: 'function' });
    else if (ts.isClassDeclaration(st) && st.name) out.push({ name: st.name.text, kind: 'class' });
    else if (ts.isEnumDeclaration(st)) out.push({ name: st.name.text, kind: 'enum' });
  }
  return out;
}

export function createSession() {
  let hist = [], decls = new Map(), types = new Map(), realm = null, sink = null;

  const boot = () => {
    const log = (...a) => { if (sink) sink.push(util.format(...a)); };
    return vm.createContext({ console: { log, error: log, warn: log, table: log } });
  };
  const exec = js => {
    try { vm.runInContext(js, realm); return null; } catch (e) { return e; }
  };
  const fresh = () => { realm = boot(); hist = []; decls = new Map(); types = new Map(); };
  const rebuild = entries => {
    realm = boot(); hist = []; decls = new Map(); types = new Map();
    for (const e of entries) {
      if (!e.replay || exec(e.code)) continue;
      hist.push(e);
      e.decls.forEach(d => decls.set(d.name, d.kind));
      e.types.forEach(t => types.set(t.name, t));
    }
  };
  const prev = () => hist.map(h => h.ts);
  const touches = (h, names) => h.decls.some(d => names.includes(d.name)) || h.types.some(t => names.includes(t.name));
  fresh();

  function run(src) {
    const rec = { src, mode: 'ts', t: Date.now(), logs: [], diags: [], ok: false, err: null };
    let r = tsCheck(prev(), src);
    const ds = declsOf(src);
    const names = ds.map(d => d.name).concat(r.types.map(t => t.name));
    const clash = names.filter(n => decls.has(n) || types.has(n));
    if (clash.length) {
      rebuild(hist.filter(h => !touches(h, clash)));
      r = tsCheck(prev(), src);
    }
    if (r.diags.length) { rec.diags = r.diags; return rec; }
    sink = rec.logs;
    let err;
    try { err = exec(r.js); } finally { sink = null; }
    if (err) {
      rec.err = { name: err.name || 'Error', message: err.message || String(err) };
      if (ds.some(d => d.kind === 'let' || d.kind === 'const' || d.kind === 'class')) rebuild(hist.slice());
      return rec;
    }
    rec.ok = true;
    ds.forEach(d => decls.set(d.name, d.kind));
    r.types.forEach(t => types.set(t.name, t));
    hist.push({ code: r.js, decls: ds, ts: src, types: r.types, replay: !REPLAY_BAD.test(src) });
    return rec;
  }

  // The context a mission's check receives (app.js ctx), without the members the harness cannot reproduce exactly.
  const ctx = rec => ({ ...rec, has: n => decls.has(n), types: [...types.keys()] });

  return { run, ctx, fresh, declared: () => [...decls.keys()], typeNames: () => [...types.keys()] };
}
