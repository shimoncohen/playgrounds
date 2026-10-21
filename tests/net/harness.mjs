// Network Quest test harness: loads the DOM-free engine and content files into a fresh vm context, in page order.
// FILES are relative to net-quest/ and must list the engine and content scripts in net-quest/index.html order.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'net-quest');
export const FILES = ['engine/ip.js', 'engine/packets.js', 'engine/topology.js', 'engine/sim.js', 'engine/shell.js',
  'engine/cmds-ip.js', 'engine/cmds-net.js', 'content/model.js', 'content/ch-1-layers.js', 'content/ch-2-mac-arp.js', 'content/ch-3-ip-addressing.js', 'content/ch-4-routing.js', 'content/extras.js'];

export function loadNet() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
  return sandbox.NQ;
}
