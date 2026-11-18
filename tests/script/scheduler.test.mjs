import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './harness.mjs';

const { Scheduler } = loadEngine();

function make({ alive, hop } = {}) {
  const t = { log: [], errs: [], exits: [], sys: [], hops: 0 };
  t.finished = new Promise(done => {
    t.s = Scheduler.create({
      alive,
      hop: fn => { t.hops++; (hop || setImmediate)(fn); },
      io: { asyncErr: e => t.errs.push(e), exit: c => t.exits.push(c), sys: m => t.sys.push(m), done },
    });
  });
  return t;
}
const go = (t, main) => { main(t.s, t.log, t); t.s.drainTicks(); t.s.start(); return t.finished; };
const tick = () => new Promise(r => setImmediate(r));

describe('phases and the clock', () => {
  it('stall case: A (10 ms) queues an immediate then stalls 250 ms; B (50 ms) runs after it', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.setTimeout(() => { log.push('A'); s.setImmediate(() => log.push('I')); s.charge(250); }, 10);
      s.setTimeout(() => log.push('B'), 50);
    });
    assert.deepEqual([...t.log], ['A', 'I', 'B']);
  });

  it('work queued during a phase runs on the next turn', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.setTimeout(() => { log.push('A'); s.setTimeout(() => log.push('B'), 1); s.setImmediate(() => log.push('I')); }, 1);
      s.queueIO(0, () => { log.push('X'); s.queueIO(0, () => log.push('Y')); s.setImmediate(() => log.push('Z')); });
    });
    assert.deepEqual([...t.log], ['A', 'X', 'I', 'Z', 'B', 'Y']);
  });

  it('timers due together run in (due, insertion) order', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.setTimeout(() => log.push('c'), 20);
      s.setTimeout(() => log.push('a'), 10);
      s.setTimeout(() => log.push('b'), 10);
    });
    assert.deepEqual([...t.log], ['a', 'b', 'c']);
  });

  it('a stalled interval runs once, not once per missed beat', async () => {
    const t = make();
    await go(t, (s, log) => {
      let n = 0;
      const h = s.setInterval(() => { if (++n === 1) s.charge(100); }, 10);
      s.setTimeout(() => { s.clearInterval(h); log.push(n); }, 135);
    });
    assert.deepEqual([...t.log], [4]);
  });

  it('delays below 1, NaN, huge or missing become 1', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.setTimeout(() => log.push('two'), 2);
      for (const [name, d] of [['zero', 0], ['neg', -5], ['nan', NaN], ['big', 2147483648], ['none', undefined]]) s.setTimeout(() => log.push(name), d);
    });
    assert.deepEqual([...t.log], ['zero', 'neg', 'nan', 'big', 'none', 'two']);
  });

  it('model choice: in the main module setTimeout(0) runs before setImmediate', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.setImmediate(() => log.push('immediate'));
      s.setTimeout(() => log.push('timeout'), 0);
    });
    assert.deepEqual([...t.log], ['timeout', 'immediate']);
  });

  it('clearTimeout and clearImmediate drop the callback', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.clearTimeout(s.setTimeout(() => log.push('t'), 1));
      s.clearImmediate(s.setImmediate(() => log.push('i')));
      s.setTimeout(() => log.push('kept'), 1);
    });
    assert.deepEqual([...t.log], ['kept']);
  });

  it('an idle loop jumps to the earliest timer, and with nothing left queues no hop', async () => {
    const t = make();
    await go(t, (s, log) => s.setTimeout(() => log.push('late'), 5000));
    assert.deepEqual([...t.log], ['late']);
    const hops = t.hops;
    await tick(); await tick();
    assert.equal(t.hops, hops);
  });

  it('ticks run before the next callback', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.setTimeout(() => { log.push('t1'); s.nextTick(() => log.push('tick')); }, 1);
      s.setTimeout(() => log.push('t2'), 1);
    });
    assert.deepEqual([...t.log], ['t1', 'tick', 't2']);
  });
});

describe('I/O queue and virtual Date', () => {
  it('COST values are the decided ones', () => {
    assert.equal(Scheduler.COST.FS_BASE_MS, 250);
    assert.equal(Scheduler.COST.BYTES_PER_MS, 4);
    assert.equal(Scheduler.COST.META_MS, 1);
  });

  it('a queued completion fires after its cost, in the poll phase, and does not advance the clock', async () => {
    const t = make();
    await go(t, (s, log) => {
      const d1 = s.dateNow();
      s.queueIO(300, () => { log.push('io'); s.clearInterval(h); });
      assert.equal(s.dateNow() - d1, 1);
      const h = s.setInterval(() => log.push('beat'), 100);
    });
    // The two dateNow calls moved the clock 2 ms before the interval started, so its third beat (302) is after the io (300).
    assert.deepEqual([...t.log], ['beat', 'beat', 'io']);
  });

  it('charge shifts Date.now, and each call costs 1 ms', () => {
    const { s } = make();
    const a = s.dateNow();
    s.charge(250);
    assert.equal(s.dateNow() - a, 251);
  });

  it('a busy-wait on dateNow ends after about 2000 calls', () => {
    const { s } = make();
    const t0 = s.dateNow();
    let n = 0;
    while (s.dateNow() - t0 < 2000) n++;
    assert.ok(n >= 1998 && n <= 2000, String(n));
  });
});

describe('loop guard runtime', () => {
  const trip = s => { try { for (;;) s.guardTick(); } catch (e) { return e; } };

  it('throws ERR_LOOP_GUARD past the limit, and keeps throwing', () => {
    const { s } = make();
    const e = trip(s);
    assert.equal(e.code, 'ERR_LOOP_GUARD');
    assert.equal(e.message, 'Loop guard: this loop ran more than 5,000,000 times in one go, so it was stopped. Does its exit condition ever become true?');
    assert.throws(() => s.guardTick(), { code: 'ERR_LOOP_GUARD' });
  });

  it('resetGuard starts a fresh count', () => {
    const { s } = make();
    for (let i = 0; i < 3000000; i++) s.guardTick();
    s.resetGuard();
    for (let i = 0; i < 3000000; i++) s.guardTick();
  });

  it('the count is reset for every callback', async () => {
    const t = make();
    await go(t, (s, log) => {
      for (const d of [1, 2]) s.setTimeout(() => { for (let i = 0; i < 3000000; i++) s.guardTick(); log.push('ok'); }, d);
    });
    assert.deepEqual([...t.log], ['ok', 'ok']);
    assert.equal(t.errs.length, 0);
  });

  it('a nextTick that re-queues itself stops at the limit', () => {
    const { s } = make();
    const f = () => s.nextTick(f);
    s.nextTick(f);
    assert.throws(() => s.drainTicks(), { code: 'ERR_LOOP_GUARD' });
  });

  it('a runaway tick inside a callback reaches asyncErr and ends the loop', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.setTimeout(() => { const f = () => s.nextTick(f); s.nextTick(f); }, 1);
      s.setTimeout(() => log.push('never'), 5);
    });
    assert.equal(t.errs[0].code, 'ERR_LOOP_GUARD');
    assert.deepEqual([...t.log], []);
  });
});

describe('guardSource on hand-written trees', () => {
  const G = '__loopGuard__();';
  const n = (type, start, end, extra) => ({ type, start, end, ...extra });
  const prog = (end, ...body) => n('Program', 0, end, { body });
  const run = (src, ast) => Scheduler.guardSource(src, () => ast);

  it('the guard name is the one the transform inserts', () => assert.equal(Scheduler.GUARD_NAME + '();', G));

  it('a block body gets the call first', () => {
    const src = 'while(a){b}';
    const ast = prog(11, n('WhileStatement', 0, 11, { test: n('Identifier', 6, 7), body: n('BlockStatement', 8, 11, { body: [n('ExpressionStatement', 9, 10)] }) }));
    assert.equal(run(src, ast), `while(a){${G}b}`);
  });

  it('a body that is not a block is wrapped in braces', () => {
    const ast = prog(11, n('ForStatement', 0, 11, { body: n('ExpressionStatement', 7, 11) }));
    assert.equal(run('for(;;)x++;', ast), `for(;;){${G}x++;}`);
  });

  it('nested loops are all guarded', () => {
    const inner = n('ForStatement', 9, 18, { body: n('ExpressionStatement', 16, 18) });
    const ast = prog(19, n('WhileStatement', 0, 19, { body: n('BlockStatement', 8, 19, { body: [inner] }) }));
    assert.equal(run('while(a){for(;;)b;}', ast), `while(a){${G}for(;;){${G}b;}}`);
  });

  it('do...while, for...in and for...of bodies are guarded', () => {
    assert.equal(run('do x;while(a)', prog(13, n('DoWhileStatement', 0, 13, { body: n('ExpressionStatement', 3, 5) }))), `do {${G}x;}while(a)`);
    assert.equal(run('for(k in o)x;', prog(13, n('ForInStatement', 0, 13, { body: n('ExpressionStatement', 11, 13) }))), `for(k in o){${G}x;}`);
    assert.equal(run('for(k of o)x;', prog(13, n('ForOfStatement', 0, 13, { body: n('ExpressionStatement', 11, 13) }))), `for(k of o){${G}x;}`);
  });

  it('keeps line numbers: no newline is added', () => {
    const src = 'while(a)\n{\nb\n}';
    const ast = prog(14, n('WhileStatement', 0, 14, { body: n('BlockStatement', 9, 14, { body: [] }) }));
    const out = run(src, ast);
    assert.equal(out, `while(a)\n{${G}\nb\n}`);
    assert.equal(out.split('\n').length, src.split('\n').length);
  });

  it('the rewritten code runs and calls the guard once per iteration', () => {
    const ast = prog(22, n('ForStatement', 8, 22, { body: n('ExpressionStatement', 18, 22) }));
    const out = run('var n=0;for(;n<3;)n++;', ast);
    let calls = 0;
    new Function('__loopGuard__', out)(() => { calls++; });
    assert.equal(calls, 3);
  });

  it('returns the source unchanged without a parser, when it throws, and with no loops', () => {
    const src = 'while(true){}';
    assert.equal(Scheduler.guardSource(src), src);
    assert.equal(Scheduler.guardSource(src, () => { throw new SyntaxError('x'); }), src);
    assert.equal(run('a;', prog(2, n('ExpressionStatement', 0, 2))), 'a;');
  });
});

describe('run budgets, errors, stop and exit', () => {
  it('an interval that is never cleared stops at the callback budget with one sys line', async () => {
    const t = make();
    let n = 0;
    await go(t, s => s.setInterval(() => n++, 1));
    assert.equal(n, Scheduler.MAX_CALLBACKS);
    assert.equal(t.sys.length, 1);
    assert.match(t.sys[0], /more than 5,000 callbacks/);
  });

  it('a slow interval stops at the virtual-time budget with one sys line', async () => {
    const t = make();
    let n = 0;
    await go(t, s => s.setInterval(() => n++, 1000));
    assert.equal(n, 60);
    assert.equal(t.sys.length, 1);
    assert.match(t.sys[0], /more than 60,000 ms of virtual time/);
  });

  it('missing sys, asyncErr and exit hooks are tolerated', async () => {
    let done;
    const finished = new Promise(r => { done = r; });
    const s = Scheduler.create({ hop: fn => setImmediate(fn), io: { done } });
    s.setInterval(() => {}, 1);
    s.start();
    await finished;
    const s2 = Scheduler.create({ hop: fn => setImmediate(fn) });
    s2.setTimeout(() => { throw new Error('boom'); }, 1);
    s2.start();
    await tick(); await tick();
    s2.exit(1);
  });

  it('an error in a callback goes to asyncErr and ends the loop', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.setTimeout(() => { throw new Error('boom'); }, 1);
      s.setTimeout(() => log.push('never'), 2);
    });
    assert.equal(t.errs.length, 1);
    assert.equal(t.errs[0].message, 'boom');
    assert.deepEqual([...t.log], []);
  });

  it('stop() from a callback ends the loop: no later callback runs', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.setTimeout(() => { log.push('A'); s.stop(); }, 1);
      s.setTimeout(() => log.push('B'), 2);
    });
    assert.deepEqual([...t.log], ['A']);
  });

  it('stop() before start() means start() queues no hop', () => {
    const t = make();
    t.s.stop();
    t.s.start();
    assert.equal(t.hops, 0);
  });

  it('exit in a timer reports the code, runs no later timer and is not an async error', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.setTimeout(() => { log.push('A'); s.exit(3); throw { __exit: 3 }; }, 1);
      s.setTimeout(() => log.push('B'), 2);
    });
    assert.deepEqual([...t.log], ['A']);
    assert.deepEqual(t.exits, [3]);
    assert.equal(t.errs.length, 0);
  });

  it('exit inside a tick stops the queued ticks and timers', async () => {
    const t = make();
    await go(t, (s, log) => {
      s.setTimeout(() => {
        s.nextTick(() => { s.exit(0); throw { __exit: 0 }; });
        s.nextTick(() => log.push('second tick'));
      }, 1);
      s.setTimeout(() => log.push('B'), 2);
    });
    assert.deepEqual([...t.log], []);
    assert.deepEqual(t.exits, [0]);
  });

  it('a loop whose alive() turns false ends without another callback', async () => {
    let on = true;
    const t = make({ alive: () => on });
    await go(t, (s, log) => {
      s.setTimeout(() => { log.push('A'); on = false; }, 1);
      s.setTimeout(() => log.push('B'), 2);
    });
    assert.deepEqual([...t.log], ['A']);
  });
});

describe('no host API until start()', () => {
  it('create and every non-start call work in a context with no timers or MessageChannel', () => {
    const s = Scheduler.create({});
    s.setTimeout(() => {}, 1);
    s.setInterval(() => {}, 1);
    s.setImmediate(() => {});
    s.nextTick(() => {});
    s.queueIO(1, () => {});
    s.charge(1);
    s.dateNow();
    s.guardTick();
  });

  it('start() without any way to hop throws a clear error', () => {
    const s = Scheduler.create({});
    assert.throws(() => s.start(), /no way to schedule a macrotask/);
  });

  it('with no injected hop, the default one is looked up at start() and its port is closed at the end', { timeout: 5000 }, async () => {
    const ctx = loadEngine();
    let opened = 0, closed = 0;
    ctx.MessageChannel = function () {
      const ch = new MessageChannel();
      const close = ch.port1.close.bind(ch.port1);
      ch.port1.close = () => { closed++; close(); };
      opened++;
      return ch;
    };
    let done;
    const finished = new Promise(r => { done = r; });
    const s = ctx.Scheduler.create({ io: { done } });
    assert.equal(opened, 0);
    let ran = false;
    s.setTimeout(() => { ran = true; }, 1);
    s.start();
    assert.equal(opened, 1);
    await finished;
    assert.equal(ran, true);
    assert.equal(closed, 1);
  });

  it('the port is also closed by stop(), and by a callback that exits', { timeout: 5000 }, async () => {
    for (const how of ['stop', 'exit']) {
      const ctx = loadEngine();
      let closed = 0;
      ctx.MessageChannel = function () {
        const ch = new MessageChannel();
        const close = ch.port1.close.bind(ch.port1);
        ch.port1.close = () => { closed++; close(); };
        return ch;
      };
      let done;
      const finished = new Promise(r => { done = r; });
      const s = ctx.Scheduler.create({ io: { done } });
      s.setTimeout(() => { if (how === 'stop') s.stop(); else { s.exit(0); throw { __exit: 0 }; } }, 1);
      s.start();
      await finished;
      assert.equal(closed, 1, how);
    }
  });

  it('falls back to setTimeout when the host has no MessageChannel', { timeout: 5000 }, async () => {
    const ctx = loadEngine();
    ctx.setTimeout = setTimeout;
    let done;
    const finished = new Promise(r => { done = r; });
    const s = ctx.Scheduler.create({ io: { done } });
    let ran = false;
    s.setTimeout(() => { ran = true; }, 1);
    s.start();
    await finished;
    assert.equal(ran, true);
  });
});
