// Network Quest test harness: loads the DOM-free engine files into a fresh vm context. Later tasks append to FILES.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'net-quest', 'engine');
export const FILES = ['ip.js', 'packets.js'];

export function loadNet() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
  return sandbox.NQ;
}
