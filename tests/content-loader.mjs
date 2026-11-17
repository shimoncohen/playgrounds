import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const readApp = quest => fs.readFileSync(path.join(ROOT, 'programming', quest, 'app.js'), 'utf8');

// from === null means the start of the file.
export function cut(src, from, to) {
  const i = from === null ? 0 : src.indexOf(from);
  assert.ok(i >= 0, `content marker moved (start): ${JSON.stringify(from)}`);
  const j = src.indexOf(to, i + (from === null ? 0 : from.length));
  assert.ok(j > i, `content marker moved (end, must come after the start): ${JSON.stringify(to)}`);
  return src.slice(i, j);
}

// Runs the content/ scripts in the order index.html lists them, so the page stays the single source of truth.
export function loadScriptContent() {
  const dir = path.join(ROOT, 'programming', 'script-quest');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="(content\/[^"]+)"><\/script>/g)].map(m => m[1]);
  assert.ok(files.length > 0, 'script-quest: no content/ script tags in index.html');
  const window = { SCQ: { engine: {
    tagOf: v => Object.prototype.toString.call(v).slice(8, -1),
    decl: () => { throw new Error('not available in the DOM-free loader'); },
  } } };
  for (const f of files) new Function('window', fs.readFileSync(path.join(dir, f), 'utf8'))(window);
  for (const k of ['CH', 'FIRE', 'qfOpen', 'BLOCKS', 'ERRS', 'guideHTML']) assert.ok(window.SCQ[k], `script-quest: SCQ.${k} missing after loading content/`);
  return window.SCQ;
}

// globals become extra parameters, so the sliced code sees these stubs instead of the real ones.
export function loadContent(quest, { parts, prelude = '', returns, globals = {}, mustInclude = [] }) {
  const src = readApp(quest);
  const code = prelude + parts.map(([a, b]) => cut(src, a, b)).join('\n');
  assert.ok(code.trim().length > 0, `${quest}: empty slice`);
  for (const s of mustInclude) assert.ok(code.includes(s), `${quest}: content marker moved: ${JSON.stringify(s)} not in the slice`);
  return new Function(...Object.keys(globals), code + `\nreturn {${returns.join(',')}};`)(...Object.values(globals));
}
