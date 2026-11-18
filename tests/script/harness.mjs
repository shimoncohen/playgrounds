import fs from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../../programming/script-quest/', import.meta.url);
const SHARED = /<script src="\.\.\/\.\.\/shared\/(jsrealm|nodeenv|tscheck)\.js"><\/script>/g;

// A fresh bare context per call: the engine files hold module state (realm host, TS loader state).
export function loadEngine() {
  const html = fs.readFileSync(new URL('index.html', dir), 'utf8');
  const ctx = vm.createContext({});
  for (const [, name] of html.matchAll(SHARED)) {
    vm.runInContext(fs.readFileSync(new URL(`../../shared/${name}.js`, import.meta.url), 'utf8'), ctx, { filename: `${name}.js` });
  }
  return ctx;
}
