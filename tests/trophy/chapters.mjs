import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadShell } from '../shell/harness.mjs';
import { loadNet } from '../net/harness.mjs';
import { loadAgent } from '../agent/harness.mjs';
import { loadRust } from '../rust/harness.mjs';
import { loadMath } from '../math/harness.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const between = (src, a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  assert.ok(i >= 0 && j > i, `content marker moved: ${JSON.stringify(a)} .. ${JSON.stringify(b)}`);
  return src.slice(i, j);
};
const appOf = q => read(`programming/${q}/app.js`);
const MATH_BASE = ['../math/vendor/mathjs/math.js', 'rng.js', 'graph.js', 'scene/palette.js', 'scene/model.js', 'input/mathjs-setup.js', 'input/check.js'];
const math = track => () => loadMath([...MATH_BASE, `${track}/content.js`]).content.chapters;

// Script, Python, C++ and Harbor keep CH inside app.js, so cut it out by the markers their teach tests use.
export const CHAPTERS = {
  'script-quest-v1': () => new Function('const tagOf=v=>Object.prototype.toString.call(v).slice(8,-1);\n'
    + between(appOf('script-quest'), 'const isArr=', '// ================= UI =================') + '\nreturn CH;')(),
  'python-quest-v1': () => new Function(between(appOf('python-quest'), '', 'const ERRS={') + '\nreturn CH;')(),
  'cpp-quest-v1': () => new Function(between(appOf('cpp-quest'), '', '(()=>{\nconst KEY=') + '\nreturn CH;')(),
  'shell-quest-v1': () => loadShell().content.chapters,
  'harbor-quest-v1': () => new Function(between(appOf('harbor-quest'), 'const CH=[', '\nCH.forEach') + '\nreturn CH;')(),
  'ds-quest-v1': () => {
    const sb = {};
    vm.createContext(sb);
    for (const f of ['engine.js', 'content.js']) vm.runInContext(read(`programming/ds-quest/${f}`), sb);
    return sb.DSQ.CH;
  },
  'net-quest-v1': () => loadNet().CH,
  'agent-quest-v1': () => loadAgent().CH,
  'rust-quest-v1': () => loadRust().CH,
  'math-arithmetic-v1': math('arithmetic'),
  'math-algebra-v1': math('algebra'),
  'math-geometry-v1': math('geometry'),
  'math-trigonometry-v1': math('trigonometry'),
};
