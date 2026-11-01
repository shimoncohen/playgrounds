// Slices the DOM-free course out of an app.js that also holds the DOM app; a marker that moved fails by name.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const readApp = quest => fs.readFileSync(path.join(ROOT, quest, 'app.js'), 'utf8');

// from === null means the start of the file.
export function cut(src, from, to) {
  const i = from === null ? 0 : src.indexOf(from);
  assert.ok(i >= 0, `content marker moved (start): ${JSON.stringify(from)}`);
  const j = src.indexOf(to, i + (from === null ? 0 : from.length));
  assert.ok(j > i, `content marker moved (end, must come after the start): ${JSON.stringify(to)}`);
  return src.slice(i, j);
}

// globals become extra parameters, so the sliced code sees these stubs instead of the real ones.
export function loadContent(quest, { parts, prelude = '', returns, globals = {}, mustInclude = [] }) {
  const src = readApp(quest);
  const code = prelude + parts.map(([a, b]) => cut(src, a, b)).join('\n');
  assert.ok(code.trim().length > 0, `${quest}: empty slice`);
  for (const s of mustInclude) assert.ok(code.includes(s), `${quest}: content marker moved: ${JSON.stringify(s)} not in the slice`);
  return new Function(...Object.keys(globals), code + `\nreturn {${returns.join(',')}};`)(...Object.values(globals));
}
