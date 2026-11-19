import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadEngine } from './harness.mjs';

const ctx = loadEngine();
ctx.JSRealm = { runScript: (R, code) => { try { vm.runInContext(code, R.w); return null; } catch (e) { return e; } } };
const NOTES = 'x'.repeat(45);

// One vm run. `onReady(env)` runs right after runMain, before the loop has hopped once.
function boot(src, files = { 'notes.txt': NOTES }, onReady) {
  const out = [], errs = [], sys = [];
  const R = { silent: false };
  const w = vm.createContext({ console: { log: (...a) => { if (!R.silent) out.push(a.join(' ')); } } });
  w.Promise = vm.runInContext('Promise', w);
  w.Date = vm.runInContext('Date', w);
  R.w = w;
  const vfs = { files: { ...files }, write: (k, v) => { vfs.files[k] = v; }, list: () => Object.keys(vfs.files), remove: k => { delete vfs.files[k]; }, hasModules: () => false, installed: () => false };
  const res = { out, errs, sys, vfs, exitCode: undefined, thrown: null };
  let finish;
  res.done = new Promise(r => { finish = r; });
  const io = {
    out: () => {}, hop: fn => setImmediate(fn),
    asyncErr: e => { errs.push(e); res.env.stop(); },
    exit: c => { res.exitCode = c; }, sys: t => sys.push(t), done: () => finish(res),
  };
  res.env = ctx.NodeEnv.make(R, vfs, 'main.js', [], io);
  try { res.env.runMain('main.js', src); } catch (e) { res.thrown = e; finish(res); }
  if (onReady) onReady(res.env, res);
  return res;
}

const runVm = (src, files) => boot(src, files).done;

// curl through the hooks, returns the printed text, the recorded requests and whether it finished
function curl(env, ...argv) {
  return new Promise(resolve => {
    const o = { text: [], reqs: [] };
    ctx.NodeEnv.curl(env, argv, { out: t => o.text.push(t), req: r => o.reqs.push(r), done: () => resolve(o) });
  });
}

// the server program, one curl call straight after runMain, then stop the held loop
async function serve(src, calls, files) {
  const outs = [];
  let first;
  const r = boot(src, files, env => { first = curl(env, ...calls[0]); });
  outs.push(await first);
  for (const c of calls.slice(1)) outs.push(await curl(r.env, ...c));
  r.env.stop();
  await r.done;
  return { r, outs };
}

// ---------- the real-node comparison corpus for events and process ----------

const EV = [
  ['order, arguments, this and the return value', `
    const EE = require('events');
    const e = new EE();
    e.on('x', function (a, b) { console.log('first', a, b, this === e); });
    e.on('x', (a) => console.log('second', a));
    console.log(e.emit('x', 1, 2), e.emit('nobody'));
    console.log('after');`],
  ['once and listenerCount', `
    const { EventEmitter } = require('events');
    const e = new EventEmitter();
    e.once('x', () => console.log('once'));
    e.on('x', () => console.log('always'));
    console.log(e.listenerCount('x'));
    e.emit('x'); e.emit('x');
    console.log(e.listenerCount('x'), e.listenerCount('y'));`],
  ['off during emit still runs the snapshot', `
    const EE = require('events');
    const e = new EE();
    const b = () => console.log('b');
    e.on('x', () => { console.log('a'); e.off('x', b); });
    e.on('x', b);
    e.emit('x'); console.log('--'); e.emit('x');`],
  ['off removes the last matching registration only', `
    const EE = require('events');
    const e = new EE();
    const f = () => console.log('f');
    e.on('x', f); e.on('x', f);
    e.off('x', f);
    console.log(e.listenerCount('x'));
    e.emit('x');`],
  ['prependListener, removeAllListeners, eventNames, listeners', `
    const EE = require('events');
    const e = new EE();
    const a = () => console.log('a'), b = () => console.log('b');
    e.on('x', a); e.prependListener('x', b); e.on('y', a);
    console.log(e.eventNames().join(','), e.listeners('x').length, e.listeners('x')[0] === b);
    e.emit('x');
    e.removeAllListeners('x');
    console.log(e.eventNames().join(','), e.emit('x'));
    e.removeAllListeners();
    console.log(e.eventNames().length);`],
  ['error event with a listener', `
    const EE = require('events');
    const e = new EE();
    e.on('error', err => console.log('caught', err.message));
    console.log(e.emit('error', new Error('boom')));`],
  ['error event without a listener: an Error is thrown as is', `
    const EE = require('events');
    const e = new EE();
    const err = new Error('boom');
    try { e.emit('error', err); } catch (x) { console.log(x === err, x.message); }`],
  ['error event without a listener: a non-Error', `
    const EE = require('events');
    const e = new EE();
    for (const v of ['bad', 42]) { try { e.emit('error', v); } catch (x) { console.log(x.code, x.message); } }`],
  ['a class that extends EventEmitter', `
    const EE = require('events');
    class Booth extends EE {
      constructor(n) { super(); this.n = n; }
      sell() { this.emit('sold', this.n); return this; }
    }
    const b = new Booth(3);
    b.on('sold', function (n) { console.log('sold', n, this === b); });
    console.log(b.sell() === b, b instanceof EE, b.n);`],
  ['a listener that is not a function', `
    const EE = require('events');
    try { new EE().on('x', 5); } catch (e) { console.log(e.code); }`],
  ['process exit listener after a timer', `
    process.on('exit', (c) => console.log('exit', c));
    setTimeout(() => console.log('late'), 5);
    console.log('start');`],
  ['process.exit(n) runs the listener once with n', `
    process.on('exit', (c) => console.log('exit', c));
    process.once('exit', (c) => console.log('once', c));
    setTimeout(() => console.log('never'), 5);
    process.exit(3);`],
  ['process.exitCode is read at the natural end', `
    process.on('exit', (c) => console.log('exit', c, process.exitCode));
    process.exitCode = 2;`],
];

function realNode(src) {
  const r = spawnSync(process.execPath, ['-e', src], { encoding: 'utf8', timeout: 10000 });
  if (r.error) throw r.error;
  return r.stdout.split('\n').filter(Boolean);
}
const spawnFailed = e => ['ENOENT', 'EACCES', 'EPERM'].includes(e && e.code);

describe('events and process match real node', () => {
  for (const [name, src] of EV) {
    it(name, { timeout: 15000 }, async t => {
      let real;
      try { real = realNode(src); } catch (e) { if (spawnFailed(e)) { t.skip('cannot spawn node: ' + e.code); return; } throw e; }
      const r = await runVm(src);
      assert.equal(r.thrown && !r.thrown.__exit ? r.thrown : null, null);
      assert.deepEqual(r.out, real);
    });
  }
});

describe('process exit listeners', () => {
  it('run once on a natural end', async () => {
    const r = await runVm(`process.on('exit', c => console.log('bye', c)); setTimeout(() => console.log('t'), 5);`);
    assert.deepEqual(r.out, ['t', 'bye 0']);
  });
  it('do not run after an uncaught error in a callback', async () => {
    const r = await runVm(`process.on('exit', c => console.log('bye', c)); setTimeout(() => { throw new Error('x'); }, 5);`);
    assert.deepEqual(r.out, []);
    assert.equal(r.errs.length, 1);
  });
  it('do not run after Stop', async () => {
    const r = boot(`process.on('exit', c => console.log('bye', c)); setInterval(() => {}, 5);`);
    r.env.stop();
    await r.done;
    assert.deepEqual(r.out, []);
  });
  it('do not run after the loop guard stops the program', async () => {
    const r = await runVm(`process.on('exit', c => console.log('bye', c)); setInterval(() => {}, 5);`);
    assert.ok(r.sys.length === 1, 'the interval hits the virtual time limit');
    assert.deepEqual(r.out, []);
  });
  it('uptime is virtual seconds', async () => {
    const r = await runVm(`const a = process.uptime(); setTimeout(() => console.log(process.uptime() - a >= 1), 1000);`);
    assert.deepEqual(r.out, ['true']);
  });
});

// ---------- http and curl ----------

const SERVER = body => `
const http = require('http');
http.createServer((req, res) => {${body}}).listen(3000);`;

describe('http server through curl', () => {
  it('answers 200 with a Content-Length, and records the request', async () => {
    const { outs } = await serve(SERVER(`res.end('hello');`), [['-i', 'localhost:3000']]);
    assert.equal(outs[0].text.join(''), 'HTTP/1.1 200 OK\nContent-Length: 5\n\nhello');
    assert.equal(outs[0].reqs.length, 1);
    assert.deepEqual({ ...outs[0].reqs[0], ms: 0 }, { url: 'localhost:3000', status: 200, ms: 0, body: 'hello' });
    assert.equal(typeof outs[0].reqs[0].ms, 'number');
  });

  it('prints only the body without -i', async () => {
    const { outs } = await serve(SERVER(`res.end('hello');`), [['localhost:3000']]);
    assert.equal(outs[0].text.join(''), 'hello');
  });

  it('writeHead sets the status, the message and headers in order', async () => {
    const { outs } = await serve(SERVER(`res.writeHead(404, { 'Content-Type': 'text/plain', 'X-Lane': '4' }); res.end('gone');`), [['-i', 'localhost:3000']]);
    assert.equal(outs[0].text.join(''), 'HTTP/1.1 404 Not Found\nContent-Type: text/plain\nX-Lane: 4\nTransfer-Encoding: chunked\n\ngone');
    assert.equal(outs[0].reqs[0].status, 404);
  });

  it('setHeader, getHeader, hasHeader and removeHeader', async () => {
    const src = SERVER(`res.setHeader('X-A', '1'); res.setHeader('X-B', '2'); res.removeHeader('X-B');
      res.statusCode = 201;
      res.end([res.getHeader('x-a'), res.hasHeader('X-B'), res.headersSent].join());`);
    const { outs } = await serve(src, [['-i', 'localhost:3000']]);
    assert.equal(outs[0].text.join(''), 'HTTP/1.1 201 Created\nX-A: 1\nContent-Length: 13\n\n1,false,false');
  });

  it('chunked write: no Content-Length, body joined', async () => {
    const { outs } = await serve(SERVER(`res.write('a'); res.write('b'); res.end('c');`), [['-i', 'localhost:3000']]);
    assert.equal(outs[0].text.join(''), 'HTTP/1.1 200 OK\nTransfer-Encoding: chunked\n\nabc');
    assert.equal(outs[0].reqs[0].body, 'abc');
  });

  it('routes by req.url and method, headers and httpVersion are set', async () => {
    const src = SERVER(`
      if (req.url === '/a') return res.end('A');
      if (req.url === '/b?x=1') return res.end(req.method);
      if (req.url === '/h') return res.end([req.headers.host, !!req.headers['user-agent'], req.headers.accept, req.httpVersion].join(' '));
      res.writeHead(404); res.end('none');`);
    const { outs } = await serve(src, [['localhost:3000/a'], ['-X', 'POST', 'http://localhost:3000/b?x=1'], ['127.0.0.1:3000/h'], ['localhost:3000/zzz']]);
    assert.equal(outs[0].text.join(''), 'A');
    assert.equal(outs[1].text.join(''), 'POST');
    assert.equal(outs[2].text.join(''), '127.0.0.1:3000 true */* 1.1');
    assert.equal(outs[3].reqs[0].status, 404);
  });

  it('the req emits end after the handler returns', async () => {
    const { outs } = await serve(SERVER(`req.on('end', () => console.log('end')); console.log('handler'); res.end('ok');`), [['localhost:3000']]);
    assert.equal(outs[0].text.join(''), 'ok');
  });

  it('the listen callback and the listening event come after listen returns', async () => {
    const r = await runVm(`
      const s = require('http').createServer((q, p) => p.end());
      s.on('listening', () => console.log('event', s.address().port));
      s.listen(3000, () => { console.log('callback'); s.close(() => console.log('closed')); });
      console.log('sync', s.listening, s.address().port);`);
    assert.deepEqual(r.out, ['sync true 3000', 'event 3000', 'callback', 'closed']);
  });

  it('listen(0) picks a port from 49152 upward', async () => {
    const r = await runVm(`
      const http = require('http');
      const a = http.createServer().listen(0), b = http.createServer().listen(0);
      console.log(a.address().port, b.address().port);
      a.close(); b.close();`);
    assert.deepEqual(r.out, ['49152 49153']);
  });

  it('a taken port emits an error with EADDRINUSE', async () => {
    const r = boot(`
      const http = require('http');
      http.createServer().listen(3000);
      http.createServer().on('error', e => console.log(e.code, e.message)).listen(3000);`);
    await new Promise(res => setTimeout(res, 20));
    r.env.stop();
    await r.done;
    assert.deepEqual(r.out, ['EADDRINUSE listen EADDRINUSE: address already in use :::3000']);
  });

  it('http.STATUS_CODES holds the common codes', async () => {
    const r = await runVm(`const s = require('node:http').STATUS_CODES; console.log([200, 201, 204, 301, 302, 400, 401, 403, 404, 405, 500, 503].map(c => s[c]).join('|'));`);
    assert.equal(r.out[0], 'OK|Created|No Content|Moved Permanently|Found|Bad Request|Unauthorized|Forbidden|Not Found|Method Not Allowed|Internal Server Error|Service Unavailable');
  });

  it('a throwing handler stops the process, prints the error and the request gets (52)', async () => {
    const { r, outs } = await serve(SERVER(`throw new Error('jam');`), [['localhost:3000']]);
    assert.equal(r.errs.length, 1);
    assert.equal(r.errs[0].message, 'jam');
    assert.equal(outs[0].text.join(''), 'curl: (52) Empty reply from server');
    assert.equal(outs[0].reqs.length, 0);
    assert.equal(r.env.servers.size, 0);
  });

  it('a handler that never ends times out with (28) once the loop is idle', async () => {
    const { outs } = await serve(SERVER(`/* never ends */`), [['localhost:3000']]);
    assert.equal(outs[0].text.join(''), 'curl: (28) Operation timed out');
  });

  it('no server on the port gives (7), even with no env at all', async () => {
    const msg = "curl: (7) Failed to connect to localhost port 3000 after 0 ms: Couldn't connect to server";
    const r = boot('console.log(1)');
    assert.equal((await curl(r.env, 'localhost:3000')).text.join(''), msg);
    assert.equal((await curl(null, 'localhost:3000')).text.join(''), msg);
  });

  it('a foreign host gives (6) and never touches the network', async () => {
    const r = boot('console.log(1)');
    assert.equal((await curl(r.env, 'example.com/x')).text.join(''), 'curl: (6) Could not resolve host: example.com');
  });

  it('-s hides the error line, the other flags still parse', async () => {
    const r = boot('console.log(1)');
    assert.equal((await curl(r.env, '-s', 'localhost:3000')).text.join(''), '');
    assert.equal((await curl(r.env, '-si', 'localhost:3000')).text.join(''), '');
  });

  it('several URLs without --parallel run one after the other', async () => {
    const { outs } = await serve(SERVER(`res.end(req.url);`), [['localhost:3000/a', 'localhost:3000/b']]);
    assert.equal(outs[0].text.join('|'), '/a|/b');
    assert.deepEqual(outs[0].reqs.map(q => q.body), ['/a', '/b']);
  });

  it('a curl issued right after runMain, before the loop runs, gets the response', async () => {
    let sawBefore;
    const r = boot(SERVER(`res.end('fast');`), undefined, env => { sawBefore = env.servers.has(3000); });
    assert.equal(sawBefore, true, 'listen() registers the port at call time');
    const o = await curl(r.env, 'localhost:3000');
    assert.equal(o.text.join(''), 'fast');
    r.env.stop();
  });

  it('the stall: readFileSync serialises parallel requests, async readFile does not', async () => {
    const sync = await serve(SERVER(`res.end(require('fs').readFileSync('notes.txt', 'utf8'));`), [['--parallel', 'localhost:3000', 'localhost:3000']]);
    const msS = sync.outs[0].reqs.map(q => q.ms);
    assert.equal(msS.length, 2);
    assert.ok(Math.max(...msS) >= 500, 'sync: ' + msS);
    const async_ = await serve(SERVER(`require('fs').readFile('notes.txt', 'utf8', (e, t) => res.end(t));`), [['-Z', 'localhost:3000', 'localhost:3000']]);
    const msA = async_.outs[0].reqs.map(q => q.ms);
    assert.equal(msA.length, 2);
    assert.ok(Math.max(...msA) <= 350, 'async: ' + msA);
    assert.deepEqual(async_.outs[0].reqs.map(q => q.body), [NOTES, NOTES]);
  });

  it('a missing notes.txt in the handler stops the server like any uncaught error', async () => {
    const { r, outs } = await serve(SERVER(`res.end(require('fs').readFileSync('notes.txt', 'utf8'));`), [['localhost:3000']], {});
    assert.equal(r.errs[0].code, 'ENOENT');
    assert.match(outs[0].text.join(''), /\(52\)/);
  });

  it('closing the only server lets the loop end by itself', async () => {
    const r = await runVm(`const s = require('http').createServer().listen(3000, () => s.close());`);
    assert.equal(r.errs.length, 0);
  });
});

describe('http matches real node over loopback', () => {
  const HANDLERS = [
    ['end with a body', `res.end('hello');`],
    ['writeHead with headers', `res.writeHead(404, { 'Content-Type': 'text/plain', 'X-Lane': '4' }); res.end('gone');`],
    ['setHeader then end', `res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ a: 1 }));`],
    ['chunked write', `res.write('a'); res.write('b'); res.end('c');`],
    ['custom status and message', `res.statusCode = 201; res.statusMessage = 'Made'; res.end('ok');`],
    ['writeHead with a Content-Length', `res.writeHead(200, { 'Content-Length': 2 }); res.end('hi');`],
    ['an empty end', `res.end();`],
    ['a multi-byte body', `res.end('café');`],
    ['route by url', `if (req.url === '/tickets') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); } else { res.writeHead(404); res.end('no'); }`],
  ];
  const DROP = new Set(['date', 'connection', 'keep-alive']);
  const CHILD = (handler, url) => `
const http = require('http');
const s = http.createServer((req, res) => {${handler}});
s.on('error', e => { console.log(JSON.stringify({ skip: e.code })); process.exit(0); });
s.listen(0, '127.0.0.1', () => {
  http.get({ host: '127.0.0.1', port: s.address().port, path: ${JSON.stringify(url)}, agent: false }, r => {
    let b = ''; r.setEncoding('utf8'); r.on('data', c => b += c);
    r.on('end', () => { console.log(JSON.stringify({ status: r.statusCode, message: r.statusMessage, headers: r.headers, body: b })); s.close(); process.exit(0); });
  }).on('error', e => { console.log(JSON.stringify({ skip: e.code })); process.exit(0); });
});`;

  for (const [name, handler] of HANDLERS) {
    it(name, { timeout: 20000 }, async t => {
      const url = name === 'route by url' ? '/tickets' : '/';
      const p = spawnSync(process.execPath, ['-e', CHILD(handler, url)], { encoding: 'utf8', timeout: 15000 });
      if (p.error) { if (spawnFailed(p.error)) { t.skip('cannot spawn node: ' + p.error.code); return; } throw p.error; }
      const real = JSON.parse(p.stdout.trim().split('\n').pop());
      if (real.skip) {
        if (['EPERM', 'EACCES'].includes(real.skip)) { t.skip('cannot listen: ' + real.skip); return; }
        assert.fail('real node failed with ' + real.skip + ': ' + p.stderr);
      }
      const { outs } = await serve(SERVER(handler), [['-i', 'localhost:3000' + url]]);
      const text = outs[0].text.join('');
      const [head, ...rest] = text.split('\n\n');
      const lines = head.split('\n');
      const m = /^HTTP\/1\.1 (\d+) (.*)$/.exec(lines[0]);
      const headers = {};
      for (const l of lines.slice(1)) { const i = l.indexOf(': '); headers[l.slice(0, i).toLowerCase()] = l.slice(i + 2); }
      const realHeaders = Object.fromEntries(Object.entries(real.headers).filter(([k]) => !DROP.has(k)));
      assert.equal(Number(m[1]), real.status);
      assert.equal(m[2], real.message);
      assert.deepEqual(headers, realHeaders);
      assert.equal(rest.join('\n\n'), real.body);
      assert.equal(outs[0].reqs[0].body, real.body);
    });
  }
});

describe('no real network', () => {
  it('nodeenv.js uses no fetch, XMLHttpRequest or WebSocket', () => {
    const src = fs.readFileSync(new URL('../../shared/nodeenv.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|WebSocket/);
  });
});
