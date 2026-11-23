// Loads practice.js and the four engines into one vm context; not a test, so package.json's tests/ds/*.test.mjs glob skips it.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { FILES, ROOT } from '../rust/harness.mjs';

const PROG = path.join(ROOT, 'programming');
const RUST_ENGINE = FILES.slice(0, FILES.indexOf('engine/index.js') + 1);

// content:false skips content.js for tests whose fixtures do not need the missions
export function loadEngines({ content = true } = {}) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const run = (file) => vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: path.relative(ROOT, file) });
  run(path.join(PROG, 'ds-quest', 'engine.js'));
  if (content) run(path.join(PROG, 'ds-quest', 'content.js'));
  run(path.join(PROG, 'ds-quest', 'practice.js'));
  run(path.join(PROG, 'python-quest', 'engine.js'));
  run(path.join(PROG, 'cpp-quest', 'engine.js'));
  for (const f of RUST_ENGINE) run(path.join(PROG, 'rust-quest', f));
  return sandbox;
}
