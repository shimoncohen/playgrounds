(function (root) {
'use strict';
const TSQ = root.TSQ = root.TSQ || {};
const errOf = e => e && typeof e === 'object' && 'message' in e ? { name: e.name || 'Error', message: e.message } : { name: 'Error', message: String(e) };

// Compiles the files, then runs main.js through the virtual Node. The Promise resolves when the scheduler is done, so
// timer output and async errors are in the result; its stop() ends a run that is still going.
// deps: TSCheck, NodeEnv, makeRealm(hooks), fmt(args), release(realm), hop, and the live hooks onOut, onErr, onSys, onClear.
TSQ.projectRun = function projectRun(files, deps) {
  deps = deps || {};
  const TS = deps.TSCheck || root.TSCheck, NE = deps.NodeEnv || root.NodeEnv;
  const res = { files: Object.assign({}, files), diags: [], js: {}, ok: false, out: [], err: null };
  const c = TS.checkProject(files);
  res.diags = c.diags;
  res.js = c.js;
  const early = Promise.resolve(res);
  early.stop = () => {};
  if (c.diags.length) return early;
  if (!('main.ts' in files)) {
    res.msg = 'There is no main.ts. Make one with New file, then press Run: it is the file that starts the program.';
    return early;
  }

  let env = null;
  const p = new Promise(resolve => {
    let R = null, ended = false, code = 0;
    const finish = () => {
      if (ended) return;
      ended = true;
      res.ok = !res.err && code === 0;
      if (R && deps.release) deps.release(R);
      resolve(res);
    };
    const fail = e => { if (!res.err) res.err = errOf(e); };
    const hk = {
      hop: deps.hop,
      out(level, args) {
        const text = level === 'raw' ? String(args[0]) : deps.fmt ? deps.fmt(args) : args.join(' ');
        res.out.push(text);
        if (deps.onOut) deps.onOut(level, args, text);
      },
      asyncErr(e, prom) { fail(e); if (deps.onErr) deps.onErr(e, prom); },
      sys(t) { fail(t); if (deps.onSys) deps.onSys(t); },
      clear() { if (deps.onClear) deps.onClear(); },
      exit(n) { code = n; },
      done: finish,
    };
    const vfs = { files: Object.assign({}, c.js), write(k, v) { this.files[k] = v; }, remove(k) { delete this.files[k]; }, list() { return Object.keys(this.files); }, installed: () => false, hasModules: () => false };
    try {
      R = deps.makeRealm(hk);
      env = NE.make(R, vfs, 'main.js', [], hk);
      env.runMain('main.js');
    } catch (e) {
      // A throw before the scheduler starts never reaches io.done
      if (e && e.__exit !== undefined) code = e.__exit;
      else { fail(e); if (deps.onErr) deps.onErr(e, false); }
      if (env) env.stop();
      finish();
    }
  });
  p.stop = () => { if (env) env.stop(); };
  return p;
};
})(typeof window !== 'undefined' ? window : globalThis);
