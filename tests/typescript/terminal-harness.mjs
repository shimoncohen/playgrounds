import fs from 'node:fs';
import vm from 'node:vm';
import util from 'node:util';
import { createRequire } from 'node:module';
import { host, makeRealm, release } from './project-harness.mjs';

const ts = createRequire(import.meta.url)('typescript');
vm.runInContext(fs.readFileSync(new URL('../../shared/nodetest.js', import.meta.url), 'utf8'), host, { filename: 'nodetest.js' });

export const transform = (key, src) => ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;

export function runNode(files, { file = 'main.js', node = true, ts: tsOn = false, args = [], deadline = 10000 } = {}) {
  return new Promise(resolve => {
    const res = { out: [], lines: [], errs: [], sys: [], exitCode: undefined, thrown: null, files: null };
    let R, env, timer;
    const vfs = { files: { ...files }, write(k, v) { this.files[k] = v; }, remove(k) { delete this.files[k]; }, list() { return Object.keys(this.files); }, installed: () => false, hasModules: () => false };
    res.files = vfs.files;
    let ended = false;
    const finish = () => { if (ended) return; ended = true; clearTimeout(timer); release(R); resolve(res); };
    const hk = {
      hop: fn => setImmediate(fn),
      out(level, a) {
        const text = level === 'raw' ? String(a[0]) : util.format(...a);
        res.out.push({ level, text, marker: level === 'raw' ? a[1] : undefined });
        res.lines.push(text);
      },
      asyncErr: e => res.errs.push(e),
      sys: t => res.sys.push(t),
      exit: c => { res.exitCode = c; },
      clear() {},
      done: finish,
    };
    if (node) hk.builtins = api => host.NodeTest.make(api);
    if (tsOn) hk.transform = typeof tsOn === 'function' ? tsOn : transform;
    R = makeRealm(hk);
    // A bare vm context exposes no constructors as properties; the page's realm does.
    for (const n of ['Error', 'TypeError']) R.w[n] = vm.runInContext(n, R.w);
    try {
      env = host.NodeEnv.make(R, vfs, file, args, hk);
      timer = setTimeout(() => env.stop(), deadline);
      env.runMain(file);
    } catch (e) {
      if (e && e.__exit !== undefined) res.exitCode = e.__exit; else res.thrown = e;
      env.stop();
      finish();
    }
  });
}
