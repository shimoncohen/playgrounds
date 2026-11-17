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

const harborDir = path.join(ROOT, 'programming', 'harbor-quest');
const harborScripts = () => [...fs.readFileSync(path.join(harborDir, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])
  .filter(s => s === '../../shared/tiers.js' || /^(engine|content)\//.test(s) || s === 'app.js');

// The harbor-quest scripts of index.html, in page order, as one source, for tests that run the whole game in a vm against a DOM stub.
export const readHarborGame = () => harborScripts().map(s => fs.readFileSync(path.join(harborDir, s), 'utf8')).join('\n');

// Runs the DOM-free scripts of harbor-quest/index.html (shared/tiers.js, engine/*, content/*) against one stub window and returns window.HQ.
// There is no document, so DOM use in those files throws; while they load, reading a key of HQ that is not set yet throws too.
export function loadHarborQuest({ localStorage = { getItem: () => null, setItem() {}, removeItem() {} } } = {}) {
  const srcs = harborScripts().filter(s => s !== 'app.js');
  assert.ok(srcs.some(s => s.startsWith('engine/')) && srcs.some(s => s.startsWith('content/')), 'harbor-quest/index.html lists no engine or content scripts');
  const hq = {};
  let strict = true;
  const window = { HQ: new Proxy(hq, { get(t, k) { if (strict && typeof k === 'string' && !(k in t)) throw new Error(`HQ.${k} read before it was set`); return t[k]; } }) };
  for (const s of srcs) new Function('window', 'localStorage', fs.readFileSync(path.join(harborDir, s), 'utf8'))(window, localStorage);
  strict = false;
  return hq;
}

// globals become extra parameters, so the sliced code sees these stubs instead of the real ones.
export function loadContent(quest, { parts, prelude = '', returns, globals = {}, mustInclude = [] }) {
  const src = readApp(quest);
  const code = prelude + parts.map(([a, b]) => cut(src, a, b)).join('\n');
  assert.ok(code.trim().length > 0, `${quest}: empty slice`);
  for (const s of mustInclude) assert.ok(code.includes(s), `${quest}: content marker moved: ${JSON.stringify(s)} not in the slice`);
  return new Function(...Object.keys(globals), code + `\nreturn {${returns.join(',')}};`)(...Object.values(globals));
}
