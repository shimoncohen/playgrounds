import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './harness.mjs';

const GUARD = '__loopGuard__();';
const MSG = 'Loop guard: this loop ran more than 5,000,000 times in one go, so it was stopped. Does its exit condition ever become true?';

describe('Scheduler.makeGuard', () => {
  const make = () => {
    const { Scheduler } = loadEngine();
    const deferred = [];
    return { g: Scheduler.makeGuard(fn => deferred.push(fn)), deferred };
  };
  const trip = g => { try { for (;;) g.tick(); } catch (e) { return e; } };

  it('trips at the limit with the scheduler message', () => {
    const { g } = make();
    const e = trip(g);
    assert.equal(e.code, 'ERR_LOOP_GUARD');
    assert.equal(e.message, MSG);
  });

  it('defers one reset on the first tick after a reset, and only one', () => {
    const { g, deferred } = make();
    g.tick(); g.tick(); g.tick();
    assert.equal(deferred.length, 1);
    g.reset();
    g.tick();
    assert.equal(deferred.length, 2);
  });

  it('the deferred reset restarts the count', () => {
    const { g, deferred } = make();
    for (let i = 0; i < 3000000; i++) g.tick();
    deferred[0]();
    for (let i = 0; i < 3000000; i++) g.tick();
  });

  it('without the deferred reset the count keeps growing across ticks', () => {
    const { g } = make();
    for (let i = 0; i < 3000000; i++) g.tick();
    assert.throws(() => { for (let i = 0; i < 3000000; i++) g.tick(); }, { code: 'ERR_LOOP_GUARD' });
  });

  it('reset starts a fresh count', () => {
    const { g } = make();
    for (let i = 0; i < 3000000; i++) g.tick();
    g.reset();
    for (let i = 0; i < 3000000; i++) g.tick();
  });
});

describe('JSRealm.runScript', () => {
  it('resets the realm guard before each script', () => {
    const { Scheduler, JSRealm } = loadEngine();
    const R = { guard: Scheduler.makeGuard(() => {}) };
    for (let i = 0; i < 3000000; i++) R.guard.tick();
    JSRealm.runScript(R, '');
    for (let i = 0; i < 3000000; i++) R.guard.tick();
  });
});

// No real acorn in node: a lookup from source text to a hand-built tree with the positions guardSource reads.
const blk = (start, end, body = []) => ({ type: 'BlockStatement', start, end, body });
const prog = body => ({ type: 'Program', body });
const letI = { type: 'VariableDeclaration', kind: 'let', start: 0, end: 8, declarations: [{ id: { type: 'Identifier', name: 'i' } }] };
const ASYNC_SRC = 'await 1;while(true){}';
const ASYNC_FINAL = '(async()=>{\n' + ASYNC_SRC + '\n})().then(v=>{if(v!==undefined)__asyncOut(v)})';
const ECHO_SRC = 'x=>{while(1){}}';
const ECHO_FINAL = '__out((' + ECHO_SRC + '\n));';
const TREES = {
  'while(true){}': prog([{ type: 'WhileStatement', start: 0, end: 13, body: blk(11, 13) }]),
  'for(;;){}': prog([{ type: 'ForStatement', start: 0, end: 9, body: blk(7, 9) }]),
  'let i=0;while(true)i++': prog([letI, { type: 'WhileStatement', start: 8, end: 22, body: { type: 'ExpressionStatement', start: 19, end: 22 } }]),
  'do{}while(true)': prog([{ type: 'DoWhileStatement', start: 0, end: 15, body: blk(2, 4) }]),
  'function f(){while(1){}}': prog([{ type: 'FunctionDeclaration', start: 0, end: 24, id: { type: 'Identifier', name: 'f' }, body: blk(12, 24, [{ type: 'WhileStatement', start: 13, end: 23, body: blk(21, 23) }]) }]),
  [ECHO_SRC]: prog([{ type: 'ExpressionStatement', start: 0, end: 15, expression: { type: 'ArrowFunctionExpression', start: 0, end: 15, body: blk(3, 15, [{ type: 'WhileStatement', start: 4, end: 14, body: blk(12, 14) }]) } }]),
  [ECHO_FINAL]: prog([{ type: 'ExpressionStatement', start: 0, end: 26, expression: { type: 'CallExpression', callee: { type: 'Identifier', name: '__out' }, arguments: [{ type: 'ArrowFunctionExpression', start: 7, end: 22, body: blk(10, 22, [{ type: 'WhileStatement', start: 11, end: 21, body: blk(19, 21) }]) }] } }]),
  [ASYNC_SRC]: prog([{ type: 'ExpressionStatement', start: 0, end: 8, expression: { type: 'AwaitExpression', start: 0, end: 7 } }, { type: 'WhileStatement', start: 8, end: 21, body: blk(19, 21) }]),
  [ASYNC_FINAL]: prog([{ type: 'ExpressionStatement', start: 0, end: ASYNC_FINAL.length, expression: { type: 'CallExpression', callee: { type: 'ArrowFunctionExpression', start: 1, end: 35, body: blk(10, 35,[{ type: 'WhileStatement', start: 20, end: 33, body: blk(31, 33) }]) } } }]),
};

describe('JSRealm.prepare guards the code it returns', () => {
  const engine = (withAcorn = true, withScheduler = true) => {
    const ctx = loadEngine();
    if (withAcorn) ctx.acorn = { parse: src => { if (!(src in TREES)) throw new Error('no tree for ' + src); return TREES[src]; } };
    if (!withScheduler) ctx.Scheduler = undefined;
    return ctx;
  };

  const CASES = {
    'while(true){}': 'while(true){' + GUARD + '}',
    'for(;;){}': 'for(;;){' + GUARD + '}',
    'let i=0;while(true)i++': 'let i=0;while(true){' + GUARD + 'i++}',
    'do{}while(true)': 'do{' + GUARD + '}while(true)',
    'function f(){while(1){}}': 'function f(){while(1){' + GUARD + '}}',
    [ECHO_SRC]: '__out((x=>{while(1){' + GUARD + '}}\n));',
  };
  for (const [src, want] of Object.entries(CASES)) {
    it(`guards ${JSON.stringify(src)}`, () => assert.equal(engine().JSRealm.prepare(src).code, want));
  }

  it('guards the top-level-await wrapper too', () => {
    const p = engine().JSRealm.prepare(ASYNC_SRC);
    assert.equal(p.async, true);
    assert.equal(p.code, '(async()=>{\nawait 1;while(true){' + GUARD + '}\n})().then(v=>{if(v!==undefined)__asyncOut(v)})');
  });

  it('returns the code unchanged without Scheduler', () => {
    assert.equal(engine(true, false).JSRealm.prepare('while(true){}').code, 'while(true){}');
  });

  it('returns the code unchanged without acorn', () => {
    assert.equal(engine(false).JSRealm.prepare('while(true){}').code, 'while(true){}');
  });
});
