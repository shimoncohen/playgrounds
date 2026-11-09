// FILES are relative to rust-quest/ and must list ../../shared/how.js, engine/* and content/* in programming/rust-quest/index.html order
// (tests/rust/harness-order.test.mjs enforces it).
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'programming', 'rust-quest');
export const FILES = ['../../shared/how.js', 'engine/lex.js', 'engine/parse.js', 'engine/types.js', 'engine/exhaust.js', 'engine/check.js', 'engine/lint.js', 'engine/mir.js', 'engine/borrow.js', 'engine/interp.js',
  'engine/std.js', 'engine/diag.js', 'engine/index.js', 'content/state.js', 'content/model.js', 'content/ch-01-hello.js', 'content/ch-02-types.js', 'content/ch-03-functions.js', 'content/ch-04-ownership.js', 'content/ch-05-borrowing.js', 'content/ch-06-structs.js', 'content/ch-07-enums.js', 'content/ch-08-collections.js', 'content/ch-09-errors.js', 'content/ch-10-lifetimes.js', 'content/ch-11-traits.js', 'content/ch-12-closures.js', 'content/ch-13-capstone.js', 'content/extras.js', 'content/verified.js'];

export function loadRust(files = FILES) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
  return sandbox.RQ;
}
