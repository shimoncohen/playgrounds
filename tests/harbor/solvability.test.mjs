// Harbor Quest: every mission's reference answer passes its own check, replayed in chapter order on one world (missions build on each other),
// and a lazy line does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../content-loader.mjs';

// tick() calls the UI's onTick(), so a no-op stands in. skip() is a copy of window.__hq.skip in app.js.
const prelude = 'const onTick=()=>{};const skip=ms=>{skew+=ms;tick();lastRec=0;tick()};\n';
const storage = { getItem: () => null, setItem() {}, removeItem() {} };
const { S, execLine, ensureFiles, CH, skip } = loadContent('harbor-quest', {
  prelude,
  parts: [['const KEY=', '/* ---------- pictures'], ['/* ---------- missions', '\nCH.forEach']],
  returns: ['S', 'execLine', 'ensureFiles', 'CH', 'skip'],
  globals: { localStorage: storage },
  mustInclude: ['function execLine(', 'function tick(', 'function ensureFiles(', 'let lastRec=0'],
});

// The UI ticks every 250 ms while the learner reads, so pods advance Pending -> Running between lines.
const wait = ms => { for (let t = 0; t < ms; t += 250) skip(250); };

const run = line => {
  const r = execLine(line);
  return { line, out: r.out.map(o => o.t).join('\n'), code: r.code };
};
const okOf = (m, c) => { try { return !!m.ok(c); } catch { return false; } };

// ans may be a function of the current state (a pod name, "exit" first), giving one line per call.
function solve(m) {
  const tried = [];
  for (let step = 0; step < 6; step++) {
    wait(2000);
    const line = typeof m.ans === 'function' ? m.ans() : m.ans;
    tried.push(line);
    const c = run(line);
    if (okOf(m, c)) return true;
    // execLine only opens the editor; the UI saves on the Save click, so do that here.
    const edit = /^edit (\S+)$/.exec(line);
    if (edit) {
      const f = edit[1];
      assert.equal(f, 'shop.yaml', `no scripted edit for ${f}`);
      S.files[f] = S.files[f].replace(/replicas:\s*2/, 'replicas: 4');
      if (okOf(m, { line, out: '', code: 0 })) return true;
    }
  }
  assert.fail(`reference answer never passed; tried: ${tried.join(' | ')}`);
}

for (const [ci, ch] of CH.entries()) {
  let entered = false;
  for (const [mi, m] of ch.missions.entries()) {
    const id = `${ci}.${mi} ${m.t}`;
    test(`${id}: a lazy line does not pass, the reference answer does`, () => {
      if (!entered) {
        entered = true;
        if (ch.files) ensureFiles(ch.files);
        if (ch.setup) ch.setup();
      }
      assert.ok(m.ans !== undefined, 'mission has no reference answer');
      const lazy = okOf(m, run('echo lazy'));
      // Assert the probe after solving, so a failing probe does not skip the replay and cascade into later missions.
      assert.equal(solve(m), true);
      assert.equal(lazy, false, 'check already true before the learner acts');
    });
  }
}
