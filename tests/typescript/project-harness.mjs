import fs from 'node:fs';
import vm from 'node:vm';
import util from 'node:util';
import { createRequire } from 'node:module';

// Node stand-in for the page's project run: the real typescript, tscheck.js, scheduler.js, nodeenv.js and project.js, each
// in a vm context, with a vm realm for the learner's code and setImmediate as the scheduler's hop.
const ts = createRequire(import.meta.url)('typescript');
const load = (ctx, f) => vm.runInContext(fs.readFileSync(new URL(f, import.meta.url), 'utf8'), ctx, { filename: f });

export const engine = vm.createContext({ ts });
load(engine, '../../shared/tscheck.js');

export const host = vm.createContext({});
['../../shared/scheduler.js', '../../shared/nodeenv.js', '../../programming/typescript-quest/project.js'].forEach(f => load(host, f));
host.JSRealm = { runScript: (R, code) => { try { vm.runInContext(code, R.w); return null; } catch (e) { return e; } } };

// The page's realm reports a rejection nobody handled through hooks.asyncErr; the process event is its Node twin.
// The test runner fails a test on any unhandledRejection, so its listeners are set aside while a run is going.
export function makeRealm(hk) {
  const say = level => (...a) => hk.out(level, a);
  const w = vm.createContext({ console: { log: say('log'), info: say('log'), warn: say('warn'), error: say('error'), table: say('table') } });
  const R = { w, saved: process.listeners('unhandledRejection') };
  R.onRejection = e => hk.asyncErr(e, true);
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', R.onRejection);
  return R;
}
export const release = R => {
  process.off('unhandledRejection', R.onRejection);
  R.saved.forEach(f => process.on('unhandledRejection', f));
};

// The Promise itself, with its stop(); the realm differs from the test's, so tests read it through then().
export const startRun = (files, extra = {}) => host.TSQ.projectRun(files, {
  TSCheck: engine.TSCheck, NodeEnv: host.NodeEnv, makeRealm, release,
  fmt: a => util.format(...a), hop: fn => setImmediate(fn), ...extra,
});

export const flatFiles = v => typeof v === 'string' ? v : Object.entries(v || {}).map(([p, t]) => `${p}\n${t}`).join('\n');

// A JSON round trip turns the contexts' objects into this realm's, so deepEqual can compare them.
export const projectRun = async (files, extra) => JSON.parse(JSON.stringify(await startRun(files, extra)));
