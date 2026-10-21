// Network Quest: the shell parser (quotes, pipes, errors, caps) and the command registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNet } from './harness.mjs';

const NQ = loadNet();
const J = (x) => JSON.parse(JSON.stringify(x));
NQ.reg('t-echo', 'test: print the arguments, one per line', (net, dev, args) => ({ out: args.slice(), err: [], code: 0 }));
NQ.reg('t-many', 'test: print 300 lines', () => ({ out: Array.from({ length: 300 }, (_, i) => 'line ' + i), err: ['warn'], code: 0 }));

test('empty and whitespace lines succeed quietly', () => {
  const net = NQ.createNet('pair');
  for (const l of ['', '   ', '\t \n']) assert.deepEqual(J(net.exec(l)), { out: [], err: [], code: 0, entries: [] });
});

test('quotes group words; no escapes', () => {
  const net = NQ.createNet('pair');
  assert.deepEqual(J(net.exec('t-echo a  "b c" \'d "e"\' f"g h"i \'\'').out), ['a', 'b c', 'd "e"', 'fg hi', '']);
  assert.deepEqual(J(net.exec('t-echo "a | b"').out), ['a | b']);
});

test('an unclosed quote is an error, not a throw', () => {
  const net = NQ.createNet('pair');
  let r = net.exec('t-echo "abc');
  assert.deepEqual(J([r.out, r.err, r.code]), [[], ['bash: unexpected EOF while looking for matching `"\''], 2]);
  r = net.exec("t-echo 'abc");
  assert.deepEqual(J(r.err), ["bash: unexpected EOF while looking for matching `''"]);
  assert.equal(r.code, 2);
});

test('long lines are refused', () => {
  const net = NQ.createNet('pair');
  const r = net.exec('x'.repeat(5000));
  assert.deepEqual(J([r.out, r.err, r.code]), [[], ['bash: line too long'], 1]);
  assert.equal(net.exec('t-echo ' + 'x'.repeat(900)).code, 0);
});

test('pipes: grep, grep -v, head', () => {
  const net = NQ.createNet('pair');
  const lines = 't-echo alpha beta Alpha gamma';
  assert.deepEqual(J(net.exec(lines + ' | grep lph').out), ['alpha', 'Alpha']);
  assert.deepEqual(J(net.exec(lines + ' | grep -v a').out), []);
  assert.deepEqual(J(net.exec(lines + ' | grep -v lph').out), ['beta', 'gamma']);
  assert.deepEqual(J(net.exec(lines + ' | head -n 1').out), ['alpha']);
  assert.deepEqual(J(net.exec(lines + ' | grep a | head -n 2').out), ['alpha', 'beta']);
  assert.deepEqual(J(net.exec('t-echo "a b" c | grep "a b"').out), ['a b']);
  assert.equal(net.exec('t-many | head').out.length, 10);
});

test('grep exit code: 1 on no match, 0 on match', () => {
  const net = NQ.createNet('pair');
  assert.equal(net.exec('t-echo a | grep zzz').code, 1);
  assert.equal(net.exec('t-echo a | grep a').code, 0);
  assert.equal(net.exec('t-echo a | head -n 1').code, 0);
});

test('a command\'s err lines are not piped, and survive', () => {
  const net = NQ.createNet('pair');
  const r = net.exec('t-many | grep line | head -n 1');
  assert.deepEqual(J([r.out, r.err]), [['line 0'], ['warn']]);
});

test('bad pipes give friendly errors', () => {
  const net = NQ.createNet('pair');
  let r = net.exec('t-echo a | sort');
  assert.deepEqual(J([r.out, r.err, r.code]), [[], ['bash: sort: only grep and head can follow a pipe here'], 1]);
  for (const l of ['| grep x', 't-echo a |', 't-echo a | | grep a', '|']) {
    r = net.exec(l);
    assert.equal(r.code, 2, l); assert.equal(r.out.length, 0); assert.match(r.err[0], /^bash: syntax error near unexpected token `\|'$/);
  }
  assert.equal(net.exec('t-echo a | grep').code, 2);
  assert.equal(net.exec('t-echo a | head -n x').code, 1);
  assert.equal(net.exec('t-echo a | head 3').code, 1);
});

test('unknown command: 127 and a suggestion', () => {
  const net = NQ.createNet('pair');
  let r = net.exec('ipp addr');
  assert.deepEqual(J([r.out, r.err, r.code]), [[], ['bash: ipp: command not found', "Did you mean 'ip'?"], 127]);
  r = net.exec('zzzzzzzz');
  assert.deepEqual(J([r.err, r.code]), [['bash: zzzzzzzz: command not found'], 127]);
  for (const n of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.equal(net.exec(n).code, 127, n);
  assert.equal(net.exec('""').code, 127);
});

test('output is capped at 200 lines', () => {
  const net = NQ.createNet('pair');
  const r = net.exec('t-many');
  assert.equal(r.out.length, 201);
  assert.equal(r.out[199], 'line 199');
  assert.equal(r.out[200], '… output truncated');
  assert.equal(net.exec('t-echo a').out.length, 1);
});

test('exec: devices, switches, entries', () => {
  const net = NQ.createNet('pair');
  assert.deepEqual(J(net.exec('t-echo hi', 'phone').out), ['hi']);
  assert.throws(() => net.exec('t-echo hi', 'sw1'), /no shell/);
  assert.throws(() => net.exec('t-echo hi', 'nope'), /unknown device/);
  const r = net.exec('t-echo hi');
  assert.deepEqual(J(r.entries), []);
});

test('help lists the registered commands', () => {
  const net = NQ.createNet('pair');
  const r = net.exec('help');
  assert.equal(r.code, 0);
  assert.ok(r.out.some((l) => /^ip\b/.test(l)));
  assert.ok(r.out.some((l) => /^help\b/.test(l)));
  const names = r.out.map((l) => l.split(/\s+/)[0]);
  assert.deepEqual(names, names.slice().sort());
});

test('odd input never throws', () => {
  const net = NQ.createNet('pair');
  for (const l of ['\0', '$(rm -rf /)', 'ip ‮ addr', '\ud800', ';;;', '&&', '>', '"', "'", '||', 'a'.repeat(1000), ' | ', '\n|\n']) {
    const r = net.exec(l);
    assert.ok(Array.isArray(r.out) && Array.isArray(r.err) && Number.isInteger(r.code), JSON.stringify(l));
  }
  for (const l of [undefined, null, 5]) assert.equal(net.exec(l).code, 0);
});
