// Each check must pass only a file whose labels are printed from the construct they name, not any file that prints the target order.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadScriptContent } from '../content-loader.mjs';
import { NOTES, runRealNode, isSpawnError } from './order-corpus.mjs';

globalThis.JSRealm = { runScript: (R, code) => { try { vm.runInContext(code, R.w); return null; } catch (e) { return e; } } };
await import('../../shared/scheduler.js');
await import('../../shared/nodeenv.js');

const SCQ = loadScriptContent();
const CH = SCQ.CH;
const ch = CH.find(c => c.name === 'The event loop');
const scan = SCQ.evScan;
const START_NOTES = 'Sweep the ring\nFeed Mumbles\nHang the posters\n';

function runVm(src, files = { 'notes.txt': START_NOTES }) {
  return new Promise(resolve => {
    const out = [], errs = [], sys = [];
    const ctx = vm.createContext({ console: { log: (...a) => out.push(a.join(' ')) } });
    ctx.Date = vm.runInContext('Date', ctx);
    ctx.Promise = vm.runInContext('Promise', ctx);
    ctx.queueMicrotask = f => ctx.Promise.resolve().then(f);
    const R = { w: ctx, silent: false };
    const vfs = { files: { ...files }, write: (k, v) => { vfs.files[k] = v; }, list: () => Object.keys(vfs.files), remove: k => { delete vfs.files[k]; }, hasModules: () => false, installed: () => false };
    const res = { out, errs, sys };
    const io = { out: () => {}, hop: fn => setImmediate(fn), asyncErr: e => { errs.push(e); env.stop(); }, exit: () => {}, sys: t => sys.push(t), done: () => resolve(res) };
    const env = globalThis.NodeEnv.make(R, vfs, 'main.js', [], io);
    try { env.runMain('main.js', src); } catch (e) { res.thrown = e; resolve(res); }
  });
}

const play = async (m, src, files) => {
  const r = await runVm(src, files);
  const f = { 'hello.js': '', 'notes.txt': START_NOTES, [m.editFile]: src };
  return { cmd: 'node', args: [m.editFile], src: `node ${m.editFile}`, ok: !r.thrown && r.errs.length === 0, out: r.out, logs: r.out, files: f, sys: r.sys };
};

const UNRELATED = [['ls', [], ['hello.js  notes.txt']], ['node', ['-v'], ['v22.12.0']], ['node', ['-e', '1'], []], ['npm', ['-v'], ['10.9.2']], ['echo', ['lazy'], ['lazy']]];
const rejectsUnrelated = m => {
  const files = { 'hello.js': '', 'notes.txt': START_NOTES };
  for (const [cmd, args, out] of UNRELATED) assert.ok(!m.check({ cmd, args, src: [cmd, ...args].join(' '), ok: true, out, logs: out, files }), `${cmd} ${args.join(' ')}`);
};

const log = (l, body = '') => `console.log('${l}')${body}`;
const T = l => `setTimeout(() => console.log('${l}'), 0)`;
const I = l => `setImmediate(() => console.log('${l}'))`;
const P = l => `Promise.resolve().then(() => console.log('${l}'))`;
const Q = l => `queueMicrotask(() => console.log('${l}'))`;
const N = l => `process.nextTick(() => console.log('${l}'))`;
const rf = body => `const fs = require('fs')\nfs.readFile('notes.txt', 'utf8', (err, data) => {\n${body}\n})`;

const PUZZLES = [
  [0, ['sync', 'promise', 'timer'], {
    yes: { 'sync written last': [T('timer'), P('promise'), log('sync')].join('\n') },
    no: {
      'written in the printed order': [log('sync'), P('promise'), T('timer')].join('\n'),
      'lazy straight-line print': [log('sync'), log('promise'), log('timer')].join('\n'),
      'sync printed from inside .then(': [T('timer'), `Promise.resolve().then(() => { console.log('sync'); console.log('promise') })`].join('\n'),
      'an extra log that never runs': [log('sync'), T('timer'), P('promise'), `if (false) console.log('extra')`].join('\n'),
    },
  }],
  [1, ['sync', 'then', 'queued', 'timer'], {
    yes: { 'timer first, sync last': [T('timer'), P('then'), Q('queued'), log('sync')].join('\n') },
    no: {
      'the two microtasks swapped': [log('sync'), T('timer'), Q('queued'), P('then')].join('\n'),
      'lazy straight-line print': ['sync', 'then', 'queued', 'timer'].map(l => log(l)).join('\n'),
      'queued printed from a timer': [log('sync'), P('then'), T('queued'), T('timer')].join('\n'),
    },
  }],
  [2, ['sync', 'tick', 'promise', 'timer'], {
    yes: { 'sync written last': [T('timer'), P('promise'), N('tick'), log('sync')].join('\n') },
    no: {
      'tick written before the promise': [log('sync'), T('timer'), N('tick'), P('promise')].join('\n'),
      'lazy straight-line print': ['sync', 'tick', 'promise', 'timer'].map(l => log(l)).join('\n'),
      'tick printed from a promise': [log('sync'), T('timer'), `Promise.resolve().then(() => { console.log('tick'); console.log('promise') })`].join('\n'),
    },
  }],
  [3, ['read', 'immediate', 'timer'], {
    yes: { 'read written last in the callback': rf([`  ${T('timer')}`, `  ${I('immediate')}`, `  ${log('read')}`].join('\n')) },
    no: {
      'immediate written before the timer': rf([`  ${log('read')}`, `  ${I('immediate')}`, `  ${T('timer')}`].join('\n')),
      'timer and immediate after the readFile call': `const fs = require('fs')\nfs.readFile('notes.txt', 'utf8', () => console.log('read'))\n${T('timer')}\n${I('immediate')}`,
      'a named callback': `const fs = require('fs')\nfunction onRead() {\n  ${log('read')}\n  ${T('timer')}\n  ${I('immediate')}\n}\nfs.readFile('notes.txt', onRead)`,
      'lazy straight-line print': ['read', 'immediate', 'timer'].map(l => log(l)).join('\n'),
      'labels in the wrong construct': rf([`  ${log('read')}`, `  ${T('immediate')}`, `  ${I('timer')}`].join('\n')),
    },
  }],
  [4, ['poll', 'tick', 'promise', 'immediate', 'timer'], {
    yes: { 'poll written last in the callback': rf([`  ${T('timer')}`, `  ${I('immediate')}`, `  ${P('promise')}`, `  ${N('tick')}`, `  ${log('poll')}`].join('\n')) },
    no: {
      'timer and immediate after the readFile call': `const fs = require('fs')\nfs.readFile('notes.txt', 'utf8', () => {\n  ${log('poll')}\n  ${N('tick')}\n  ${P('promise')}\n})\n${T('timer')}\n${I('immediate')}`,
      'a named callback': `const fs = require('fs')\nfunction onRead() {\n  ${log('poll')}\n  ${T('timer')}\n  ${I('immediate')}\n  ${P('promise')}\n  ${N('tick')}\n}\nfs.readFile('notes.txt', onRead)`,
      'lazy straight-line print': ['poll', 'tick', 'promise', 'immediate', 'timer'].map(l => log(l)).join('\n'),
      'poll moved into a promise': rf([`  ${T('timer')}`, `  ${I('immediate')}`, `  ${N('tick')}`, `  Promise.resolve().then(() => { console.log('poll'); console.log('promise') })`].join('\n')),
    },
  }],
];

describe('chapter 20 shape', () => {
  it('is the last chapter: Intermediate, Node in depth, a shell chapter with its own files', () => {
    assert.equal(CH[CH.length - 1], ch);
    assert.equal(ch.tier, 'intermediate');
    assert.equal(ch.group, 'Node in depth');
    assert.equal(ch.mode, 'sh');
    assert.ok(ch.learned.length >= 3);
    assert.ok(ch.missions.length >= PUZZLES.length);
  });

  it('every mission edits its own file, with no need or pre, and no name chapters 12 or 17 create', () => {
    const taken = new Set(['read.js', 'todo.txt', 'math.js', 'app.js', 'greet.js', 'package.json', 'cow.js', 'hello.js', 'tally.js', 'ring.js', 'welcome.js', 'counter.js', 'prices.json', 'pair.js']);
    const seen = new Set();
    ch.missions.forEach(m => {
      assert.ok(m.editFile, m.title);
      assert.ok(!m.need && !m.pre, m.title);
      assert.ok(!taken.has(m.editFile) && !seen.has(m.editFile), `${m.title}: ${m.editFile}`);
      seen.add(m.editFile);
    });
  });

  it('the intro and mission 4 say Reset project brings notes.txt back', () => {
    assert.match(ch.intro, /notes\.txt[^]*Reset project/);
    assert.match(ch.missions[3].explain, /notes\.txt[^]*Reset project/);
  });

  it('the intro holds no HTML tag, because the page escapes it', () => {
    assert.doesNotMatch(ch.intro, /<[a-z/]/i);
    assert.match(ch.intro, /`notes\.txt`/);
  });

  it('mission 4 says that outside a file callback the order is not guaranteed, and that the callback is read inline', () => {
    assert.match(ch.missions[3].explain, /does not guarantee the order of the two/);
    assert.match(ch.missions[3].explain, /declared elsewhere and passed by name/);
  });
});

describe('the call-nesting helper', () => {
  it('a log after sibling calls is top level, not inside the earlier .then(', () => {
    const s = scan("Promise.resolve().then(() => console.log('a'))\nconsole.log('b')");
    assert.deepEqual(s.logs.map(l => [l.label, l.inner]), [['a', 'then'], ['b', null]]);
  });

  it('brackets and call names inside strings and comments never count', () => {
    const s = scan("console.log(')))(') // setTimeout(\n/* then( */ setTimeout(() => { console.log(\"]}\") }, 0)");
    assert.deepEqual(s.logs.map(l => [l.label, l.inner]), [[')))(', null], [']}', 'setTimeout']]);
    assert.deepEqual(s.calls.filter(c => c.name !== 'log').map(c => c.name), ['setTimeout']);
  });

  it('an arrow function parameter list is not a call and a nested call reports its parent', () => {
    const s = scan("fs.readFile('n', 'u', (err, data) => { setTimeout(() => { console.log('x') }, 0) })");
    assert.deepEqual(s.calls.map(c => [c.name, c.parent]), [['readFile', null], ['setTimeout', 'readFile'], ['log', 'setTimeout']]);
    assert.equal(s.logs[0].inner, 'setTimeout');
  });

  it('a label that is not a plain string is null', () => assert.equal(scan('console.log(x)').logs[0].label, null));
});

describe('no snippet leans on the main-module setTimeout(0) against setImmediate race', () => {
  const fields = m => [m.code, m.goal, ...m.how, m.explain, m.hint || ''];
  const snippets = text => [...text.matchAll(/<code>([^]*?)<\/code>|`([^`]+)`/g)].map(x => x[1] || x[2]);
  ch.missions.forEach(m => it(m.title, () => {
    const all = [m.code, ...fields(m).slice(1).flatMap(snippets)];
    for (const sn of all) {
      if (!/setTimeout/.test(sn) || !/setImmediate/.test(sn)) continue;
      assert.match(sn, /fs\.readFile\(/, `snippet without readFile: ${sn}`);
      const timing = scan(sn).calls.filter(c => c.name === 'setTimeout' || c.name === 'setImmediate');
      assert.ok(timing.length > 0 && timing.every(c => c.parent === 'readFile'), `outside the readFile callback: ${sn}`);
    }
  }));
});

describe('the puzzle missions (1 to 5)', () => {
  for (const [i, want, progs] of PUZZLES) {
    const m = ch.missions[i];
    describe(`${i + 1}. ${m.title}`, () => {
      it('the reference code prints the target order in the virtual loop, with no Stopped line', async () => {
        const r = await runVm(m.code);
        assert.equal(r.thrown, undefined);
        assert.deepEqual(r.errs, []);
        assert.deepEqual(r.out, want);
        assert.deepEqual(r.sys.filter(t => /^Stopped:/.test(t)), []);
      });

      it('real node prints the same order', t => {
        let actual;
        try { actual = runRealNode({ src: m.code }); } catch (e) { if (isSpawnError(e)) { t.skip(`cannot spawn node: ${e.code}`); return; } throw e; }
        assert.deepEqual(actual, want);
      });

      it('the reference code passes its own check', async () => assert.ok(m.check(await play(m, m.code))));

      it('the reference code also passes when notes.txt is gone', async () => assert.ok(m.check(await play(m, m.code, {}))));

      for (const [name, src] of Object.entries(progs.yes)) it(`passes: ${name}`, async () => {
        const c = await play(m, src);
        assert.deepEqual(c.out, want, 'the alternative must print the target in the vm');
        assert.ok(m.check(c));
      });

      const PRINTS_RIGHT = /printed order|before the promise|before the timer|named callback|inside \.then|from a promise|never runs/;
      for (const [name, src] of Object.entries(progs.no)) it(`fails: ${name}`, async () => {
        const c = await play(m, src);
        if (PRINTS_RIGHT.test(name)) assert.deepEqual(c.out, want, 'prints the target, so only the structure rule can reject it');
        assert.ok(!m.check(c));
      });

      it('fails when it is not a clean run of its own file', async () => {
        const c = await play(m, m.code);
        assert.ok(!m.check({ ...c, ok: false }));
        assert.ok(!m.check({ ...c, args: ['other.js'] }));
      });

      it('the unrelated inputs do not complete it', () => {
        rejectsUnrelated(m);
      });
    });
  }

  it('real node: the corpus notes.txt differs from the starter file only in content, so labels are all that is printed', () => {
    assert.equal(NOTES, 'hello notes\n');
    PUZZLES.forEach(([i]) => assert.doesNotMatch(ch.missions[i].code, /console\.log\((data|err)/));
  });
});

const HEART = (stop = true) => `const fs = require('fs')\nconst start = Date.now()\nlet n = 0\nconst id = setInterval(() => {\n  n++\n  console.log('beat ' + (Date.now() - start))\n  ${stop ? 'if (n === 7) clearInterval(id)' : ''}\n}, 100)\n`;
const SYNC = (stop = true) => HEART(stop) + `setTimeout(() => { fs.readFileSync('notes.txt', 'utf8') }, 250)`;
const ASYNC = (stop = true) => HEART(stop) + `setTimeout(() => { fs.readFile('notes.txt', 'utf8', (err, data) => { console.log('read done') }) }, 250)`;
const gaps = out => out.filter(l => /^beat /.test(l)).map(l => +l.slice(5)).map((t, i, a) => t - (i ? a[i - 1] : 0));
const BUSY = HEART() + `setTimeout(() => { const t = Date.now(); while (Date.now() - t < 300) {} }, 250)`;

describe('the heartbeat missions (6 and 7)', () => {
  const [m6, m7] = [ch.missions[5], ch.missions[6]];

  it('there are 7 missions', () => assert.equal(ch.missions.length, 7));

  describe('measured in the virtual loop on the 45-byte starting notes.txt', () => {
    it('mission 6: the beats stall for at least 200 ms and the heartbeat stops itself after 7', async () => {
      const r = await runVm(m6.code);
      assert.deepEqual(r.errs, []);
      assert.equal(r.out.length, 7);
      assert.ok(Math.max(...gaps(r.out)) >= 200, String(gaps(r.out)));
      assert.deepEqual(r.sys.filter(t => /^Stopped:/.test(t)), []);
    });

    it('mission 7: every gap is at most 150 ms, with 5 beats before read done and 2 after', async () => {
      const r = await runVm(m7.code);
      const i = r.out.indexOf('read done');
      assert.equal(i, 5);
      assert.equal(r.out.length - i - 1, 2);
      assert.equal(r.out.filter(l => /^beat /.test(l)).length, 7);
      assert.ok(Math.max(...gaps(r.out)) <= 150, String(gaps(r.out)));
      assert.deepEqual(r.sys.filter(t => /^Stopped:/.test(t)), []);
    });

    it('a Date.now() busy-wait stalls the beat just as much, yet mission 6 rejects it for having no readFileSync', async () => {
      const r = await runVm(BUSY);
      assert.ok(Math.max(...gaps(r.out)) >= 200, String(gaps(r.out)));
      assert.ok(!m6.check(await play(m6, BUSY)));
    });

    it('missing notes.txt: mission 6 throws and fails; mission 7 shows 2 beats before read done and fails', async () => {
      const c6 = await play(m6, m6.code, {});
      assert.equal(c6.ok, false);
      assert.ok(!m6.check(c6));
      const r7 = await runVm(m7.code, {});
      assert.equal(r7.out.indexOf('read done'), 2);
      assert.deepEqual(r7.errs, []);
      assert.ok(!m7.check(await play(m7, m7.code, {})));
    });
  });

  describe('mission 6 check', () => {
    it('passes the reference code and a valid alternative (read at 150, 5 beats)', async () => {
      assert.ok(m6.check(await play(m6, m6.code)));
      const alt = m6.code.replace('=== 7', '=== 5').replace('}, 250)', '}, 150)');
      assert.ok(m6.check(await play(m6, alt)));
    });

    it('fails a hard-coded print', async () => {
      const src = `console.log('beat 100'); console.log('beat 400')`;
      const c = await play(m6, src);
      assert.deepEqual(c.out, ['beat 100', 'beat 400']);
      assert.ok(!m6.check(c));
    });

    it('fails the reference code with clearInterval removed, and one that never stalls', async () => {
      assert.ok(!m6.check(await play(m6, SYNC(false))));
      assert.ok(!m6.check(await play(m6, HEART() + `setTimeout(() => { fs.readFileSync }, 250)`)));
    });

    it('fails the fs.readFile version (that is mission 7)', async () => assert.ok(!m6.check(await play(m6, m7.code))));

    it('fails extra output lines, an unclean run, another file and the unrelated inputs', async () => {
      const c = await play(m6, m6.code);
      assert.ok(!m6.check({ ...c, out: [...c.out, 'hi'] }));
      assert.ok(!m6.check({ ...c, ok: false }));
      assert.ok(!m6.check({ ...c, args: ['smooth.js'] }));
      rejectsUnrelated(m6);
    });
  });

  describe('mission 7 check', () => {
    it('passes the reference code and fs.promises.readFile started from the same timer', async () => {
      assert.ok(m7.check(await play(m7, m7.code)));
      const alt = HEART() + `setTimeout(() => { fs.promises.readFile('notes.txt', 'utf8').then(() => console.log('read done')) }, 250)`;
      const c = await play(m7, alt);
      assert.ok(c.out.indexOf('read done') >= 3, c.out.join(','));
      assert.ok(m7.check(c));
    });

    it('fails four plain lines (beat, beat, read done, beat)', async () => {
      const c = await play(m7, `console.log('beat 100'); console.log('beat 200'); console.log('read done'); console.log('beat 300')`);
      assert.deepEqual(c.out, ['beat 100', 'beat 200', 'read done', 'beat 300']);
      assert.ok(!m7.check(c));
    });

    it('fails the reference code with clearInterval removed, and readFileSync', async () => {
      assert.ok(!m7.check(await play(m7, ASYNC(false))));
      assert.ok(!m7.check(await play(m7, m6.code)));
      assert.ok(!m7.check(await play(m7, HEART() + `setTimeout(() => { fs.readFileSync('notes.txt', 'utf8'); fs.readFile('notes.txt', () => console.log('read done')) }, 250)`)));
    });

    it('fails a read that is done before the third beat, and a read that is done after the last beat', async () => {
      const early = m7.code.replace('}, 250)', '}, 0)');
      assert.ok(!m7.check(await play(m7, early)));
      const late = m7.code.replace('}, 250)', '}, 5000)');
      assert.ok(!m7.check(await play(m7, late)));
    });

    it('fails an unclean run, another file and the unrelated inputs', async () => {
      const c = await play(m7, m7.code);
      assert.ok(!m7.check({ ...c, ok: false }));
      assert.ok(!m7.check({ ...c, args: ['freeze.js'] }));
      rejectsUnrelated(m7);
    });
  });

  it('mission 6 says the read costs a pretend time here and is quick on a real machine, and where notes.txt comes back', () => {
    assert.match(m6.explain, /fixed pretend time/);
    assert.match(m6.explain, /real machine a tiny file reads in a blink/);
    assert.match(m6.explain, /notes\.txt[^]*Reset project/);
  });
});

describe('all 7 reference runs', () => {
  it('end on their own: no Stopped line, no errors, and the heartbeat prints exactly 7 beats in missions 6 and 7', async () => {
    for (const m of ch.missions) {
      const r = await runVm(m.code);
      assert.deepEqual(r.sys.filter(t => /^Stopped:/.test(t)), [], m.title);
      assert.deepEqual(r.errs, [], m.title);
    }
    assert.equal((await runVm(ch.missions[5].code)).out.length, 7);
  });
});

describe('every mission on a fresh project (starting hello.js and notes.txt, no earlier mission)', () => {
  ch.missions.forEach(m => {
    it(`${m.title}: its own file completes it`, async () => {
      const c = await play(m, m.code);
      assert.deepEqual(Object.keys(c.files).sort(), ['hello.js', 'notes.txt', m.editFile].sort());
      assert.ok(m.check(c));
    });
  });
});
