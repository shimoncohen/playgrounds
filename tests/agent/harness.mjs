// FILES are relative to agent-quest/ and must list the engine and content scripts in agent-quest/index.html order.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'agent-quest');
export const SHARED = ['shared/tiers.js', 'shared/how.js'];
export const FILES = ['engine/tokens.js', 'engine/vfs.js', 'engine/config.js', 'engine/context.js', 'engine/permissions.js', 'engine/shell.js',
  'engine/policy.js', 'engine/provider.js', 'content/tiers.js', 'content/state.js', 'content/facts.js', 'content/scenarios.js',
  'content/model.js', 'content/ch-01-loop.js', 'content/ch-02-context.js', 'content/ch-03-prompt.js',
  'content/ch-04-memory.js', 'content/ch-05-skills-mcp.js', 'content/ch-06-extend.js', 'content/ch-07-safety.js', 'content/ch-08-explore.js',
  'content/ch-09-verify.js', 'content/extras.js'];

export function loadAgent(files = FILES) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of SHARED) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
  return sandbox.AQ;
}

export const read = (rel) => fs.readFileSync(path.join(DIR, rel), 'utf8');
export const sources = (sub) => fs.readdirSync(path.join(DIR, sub)).filter((f) => f.endsWith('.js')).map((f) => [`${sub}/${f}`, read(`${sub}/${f}`)]);
// Learner-visible and decision code only: drop comments and quoted strings so prose ("context window") is not mistaken for a browser global.
export const code = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (m) => (m[0] === '/' ? '' : "''"));
// Values made in the vm have the sandbox's Array and Object, so compare them as JSON.
export const J = (x) => JSON.parse(JSON.stringify(x));
