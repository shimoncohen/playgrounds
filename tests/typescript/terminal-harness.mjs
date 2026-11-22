import fs from 'node:fs';
import vm from 'node:vm';
import util from 'node:util';
import { createRequire } from 'node:module';
import { host, engine, makeRealm, release } from './project-harness.mjs';

export const ts = createRequire(import.meta.url)('typescript');
vm.runInContext(fs.readFileSync(new URL('../../shared/nodetest.js', import.meta.url), 'utf8'), host, { filename: 'nodetest.js' });
vm.runInContext(fs.readFileSync(new URL('../../shared/nodetypes.js', import.meta.url), 'utf8'), engine, { filename: 'nodetypes.js' });

// Stand-ins for the page's console helpers, so the shell block (the page's own, or terminal.js) runs with no DOM.
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toText = html => html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const killRealm = R => { if (R && !R.dead) { R.dead = true; release(R); } };

export function makeDeps({ files = {}, pkgs = [], file = null, dirty = false } = {}) {
  const st = { files: { ...files }, pkgs: [...pkgs], lines: [], syncs: [], syncTrace: [], completes: 0, renders: 0, run: null, sync: false, syncAtLine: [], file, dirty };
  const store = {
    get files() { return st.files; }, get pkgs() { return st.pkgs; },
    write(k, v) { st.files[k] = v; }, remove(k) { delete st.files[k]; },
    list() { return Object.keys(st.files).concat(st.pkgs.length ? ['node_modules'] : []).sort(); },
    installed: p => st.pkgs.includes(p), hasModules: () => st.pkgs.length > 0,
  };
  const deps = {
    line(html, cls = '') { st.lines.push([html, cls]); st.syncAtLine.push(st.sync); },
    esc, toText,
    fmtArgs: a => esc(util.format(...a)),
    tableHTML: v => esc(util.inspect(v)),
    errName: e => (e && typeof e === 'object' && 'message' in e) ? (e.name || 'Error') + ': ' + e.message : String(e),
    errTip: e => e && e.code === 'ENOENT' ? 'check the <b>path</b> with ls' : '',
    clearScreen() { st.lines.push(['CLEAR', '']); },
    tryComplete() { st.completes++; },
    renderProject() { st.renders++; },
    getRun: () => st.run, setRun: r => { st.run = r; },
    isSync: () => st.sync, setSync: v => { st.sync = v; st.syncTrace.push(v); },
    syncBar: s => st.syncs.push(s),
    store, editor: { file: () => st.file, dirty: () => st.dirty },
    makeRealm, killRealm, makeNodeEnv: host.NodeEnv.make, nodeCurl: host.NodeEnv.curl, NODE_VERSION: host.NodeEnv.NODE_VERSION,
    hop: fn => setImmediate(fn),
  };
  return { st, deps, store };
}

const terminalLoaded = new WeakSet();
export function makeTerminal(opts = {}, over = {}) {
  if (!terminalLoaded.has(host)) {
    vm.runInContext(fs.readFileSync(new URL('../../shared/terminal.js', import.meta.url), 'utf8'), host, { filename: 'terminal.js' });
    terminalLoaded.add(host);
  }
  const { st, deps, store } = makeDeps(opts);
  const T = host.Terminal.create({ ...deps, ...over });
  T.st = st; // lets a test wait for the output to stop growing
  return { T, st, store, deps };
}

// The TypeScript page's terminal: ts on, the real compiler, tscheck.js and nodetest.js.
export const makeTs = (opts = {}, over = {}) => makeTerminal(opts, { ts: true, compiler: ts, TSCheck: engine.TSCheck, NodeTest: host.NodeTest, ...over });

export const transform =(key, src) => ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;

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
