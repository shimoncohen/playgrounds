import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell } from './harness.mjs';

const SQ = loadShell();
const mkEnv = (init = {}) => {
  const v = { ...init };
  return { v, get: (n) => (n in v ? v[n] : ''), set: (n, x) => void (v[n] = x) };
};
const ev = (e, env = mkEnv()) => SQ.arith(e, env);
const fails = (e, reason, env = mkEnv()) =>
  assert.throws(() => ev(e, env), (err) => err.raw === true && err.message === `bash: ${e}: ${reason}`);

describe('SQ.arith', () => {
  it('basic operators', () => {
    assert.equal(ev('6*7'), '42');
    assert.equal(ev('2**10'), '1024');
    assert.equal(ev('-7/2'), '-3');
    assert.equal(ev('-7%3'), '-1');
    assert.equal(ev('1<2'), '1');
    assert.equal(ev('3>4||2>1'), '1');
    assert.equal(ev('(1+2)*3'), '9');
    assert.equal(ev('0x10'), '16');
    assert.equal(ev('010'), '8');
    assert.equal(ev('2**3**2'), '512');
    assert.equal(ev('1?2:3'), '2');
    assert.equal(ev('0?2:3'), '3');
    assert.equal(ev('!0+~0'), '0');
    assert.equal(ev('1<<4|3^1&7'), '18');
    assert.equal(ev('-16>>2'), '-4');
    assert.equal(ev('5==5 && 5!=4'), '1');
  });
  it('wraps at 64 bits', () => {
    assert.equal(ev('9223372036854775807+1'), '-9223372036854775808');
  });
  it('variables and assignment', () => {
    const env = mkEnv({ y: '4', s: 'abc' });
    assert.equal(ev('x=5', env), '5');
    assert.equal(env.v.x, '5');
    assert.equal(ev('x+=y*2', env), '13');
    assert.equal(env.v.x, '13');
    assert.equal(ev('s+q+nope', env), '0');
    assert.equal(ev('x%=5', env), '3');
    assert.equal(ev('i++', env), '0');
    assert.equal(env.v.i, '1');
    assert.equal(ev('++i', env), '2');
    assert.equal(ev('i--', env), '2');
    assert.equal(env.v.i, '1');
    assert.equal(ev('--i', env), '0');
  });
  it('errors', () => {
    fails('1/0', 'division by 0');
    fails('1%0', 'division by 0');
    fails('1+', 'syntax error in expression');
    fails('2**-1', 'exponent less than 0');
    fails('1'.repeat(201), 'expression too long');
  });
  it('empty is 0', () => {
    assert.equal(ev(''), '0');
    assert.equal(ev('   '), '0');
  });
  it('huge exponent is fast', () => {
    const t = Date.now();
    ev('2**1000000');
    assert.ok(Date.now() - t < 500);
  });
});
