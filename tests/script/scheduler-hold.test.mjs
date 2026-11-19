import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './harness.mjs';

const { Scheduler } = loadEngine();

function make() {
  const t = { log: [], hops: 0, idle: [], exits: [], dones: 0 };
  t.s = Scheduler.create({
    hop: fn => { t.hops++; setImmediate(fn); },
    io: { idle: b => t.idle.push(b), exit: c => t.exits.push(c), done: () => { t.dones++; } },
  });
  return t;
}
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };

describe('scheduler hold', () => {
  it('with a hold and nothing queued the loop goes idle and schedules no further hop', async () => {
    const t = make();
    t.s.ref();
    t.s.setTimeout(() => t.log.push('T'), 5);
    t.s.start();
    await settle();
    assert.deepEqual(t.log, ['T']);
    assert.deepEqual(t.idle, [true]);
    assert.equal(t.dones, 0);
    const hops = t.hops;
    await settle();
    assert.equal(t.hops, hops);
  });

  it('queueIO wakes an idle loop, and the loop goes idle again', async () => {
    const t = make();
    t.s.ref();
    t.s.start();
    await settle();
    assert.deepEqual(t.idle, [true]);
    t.s.queueIO(3, () => t.log.push('IO'));
    await settle();
    assert.deepEqual(t.log, ['IO']);
    assert.deepEqual(t.idle, [true, false, true]);
  });

  it('nextTick, setTimeout and setImmediate also wake an idle loop', async () => {
    const t = make();
    t.s.ref();
    t.s.start();
    await settle();
    t.s.nextTick(() => t.log.push('tick'));
    t.s.setTimeout(() => t.log.push('timer'), 2);
    t.s.setImmediate(() => t.log.push('imm'));
    await settle();
    assert.deepEqual([...t.log].sort(), ['imm', 'tick', 'timer']);
    assert.equal(t.idle.at(-1), true);
  });

  it('unref with nothing queued ends an idle loop', async () => {
    const t = make();
    t.s.ref();
    t.s.start();
    await settle();
    t.s.unref();
    await settle();
    assert.equal(t.dones, 1);
  });

  it('unref while work is queued lets the loop end after it', async () => {
    const t = make();
    t.s.ref();
    t.s.queueIO(1, () => t.log.push('IO'));
    t.s.start();
    t.s.unref();
    await settle();
    assert.deepEqual(t.log, ['IO']);
    assert.equal(t.dones, 1);
    assert.deepEqual(t.idle, []);
  });

  it('two refs need two unrefs', async () => {
    const t = make();
    t.s.ref(); t.s.ref();
    t.s.start();
    await settle();
    t.s.unref();
    await settle();
    assert.equal(t.dones, 0);
    t.s.unref();
    await settle();
    assert.equal(t.dones, 1);
  });

  it('stop() ends an idle loop', async () => {
    const t = make();
    t.s.ref();
    t.s.start();
    await settle();
    t.s.stop();
    assert.equal(t.dones, 1);
    t.s.queueIO(0, () => t.log.push('late'));
    await settle();
    assert.deepEqual(t.log, []);
  });

  it('exit() works from idle: reports the code and ends the loop', async () => {
    const t = make();
    t.s.ref();
    t.s.start();
    await settle();
    t.s.exit(3);
    await settle();
    assert.deepEqual(t.exits, [3]);
    assert.equal(t.dones, 1);
  });

  it('without a hold the loop ends as before and never reports idle', async () => {
    const t = make();
    t.s.setTimeout(() => t.log.push('T'), 1);
    t.s.start();
    await settle();
    assert.deepEqual(t.log, ['T']);
    assert.equal(t.dones, 1);
    assert.deepEqual(t.idle, []);
  });

  it('works without an io.idle callback', async () => {
    let done = 0;
    const s = Scheduler.create({ hop: fn => setImmediate(fn), io: { done: () => done++ } });
    s.ref();
    s.start();
    await settle();
    s.unref();
    await settle();
    assert.equal(done, 1);
  });
});
