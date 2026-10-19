// Node harness: loads the shell-quest engine + content into a fresh vm context (no DOM).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shell-quest');

function scriptList() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  return srcs.filter((s) => /^(engine\/|content\/|\.\.\/shared\/tiers\.js$)/.test(s));
}

export function loadContext() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };
  const ctx = vm.createContext({ localStorage, console });
  ctx.window = ctx;
  for (const src of scriptList()) {
    const file = path.join(ROOT, src);
    if (!fs.existsSync(file)) continue; // e.g. shared/tiers.js before it exists
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return ctx;
}

export function loadShell() {
  return loadContext().SQ;
}

export function run(SQ, line) {
  SQ.rt.log = [];
  SQ.rt.changed = new Set();
  const r = SQ.execLine(line);
  const out = r.out
    .map((o) => o.text)
    .join('\n')
    .replace(/\x01\w([\s\S]*?)\x02/g, '$1')
    .replace(/\n$/, '');
  return { out, code: r.code };
}
