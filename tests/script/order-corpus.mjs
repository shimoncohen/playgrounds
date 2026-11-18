// Programs must not depend on racy order (main-level timeout vs immediate, I/O vs timer), sync fs or Date, so real node matches.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const NOTES = 'hello notes\n';

export const CORPUS = [
  {
    name: 'sync, then ticks, then promises',
    src: `console.log('sync1');
process.nextTick(() => console.log('tick'));
Promise.resolve().then(() => console.log('promise'));
console.log('sync2');`,
    expect: ['sync1', 'sync2', 'tick', 'promise'],
  },
  {
    name: 'tick inside a promise job, promise inside a tick',
    src: `Promise.resolve().then(() => { console.log('p1'); process.nextTick(() => console.log('tick-in-p1')); }).then(() => console.log('p2'));
process.nextTick(() => { console.log('t1'); Promise.resolve().then(() => console.log('promise-in-t1')); });
process.nextTick(() => console.log('t2'));`,
    expect: ['t1', 't2', 'p1', 'promise-in-t1', 'p2', 'tick-in-p1'],
  },
  {
    name: 'async/await against then chains and ticks',
    src: `async function a() { console.log('a1'); await undefined; console.log('a2'); await null; console.log('a3'); }
a();
Promise.resolve().then(() => console.log('then1')).then(() => console.log('then2')).then(() => console.log('then3'));
process.nextTick(() => console.log('tick'));
console.log('sync');`,
    expect: ['a1', 'sync', 'tick', 'a2', 'then1', 'a3', 'then2', 'then3'],
  },
  {
    name: 'timers run by delay',
    src: `setTimeout(() => console.log('c'), 50);
setTimeout(() => console.log('a'), 10);
setTimeout(() => console.log('b'), 30);`,
    expect: ['a', 'b', 'c'],
  },
  {
    name: 'equal delays run first in, first out',
    src: `setTimeout(() => console.log('one'), 20);
setTimeout(() => console.log('two'), 20);
setTimeout(() => console.log('three'), 20);`,
    expect: ['one', 'two', 'three'],
  },
  {
    name: 'clearTimeout',
    src: `const t = setTimeout(() => console.log('cleared'), 10);
setTimeout(() => console.log('kept'), 30);
clearTimeout(t);`,
    expect: ['kept'],
  },
  {
    name: 'setInterval cleared after 3 ticks',
    src: `let n = 0;
const id = setInterval(() => { n++; console.log('beat ' + n); if (n === 3) clearInterval(id); }, 20);
setTimeout(() => console.log('after'), 150);`,
    expect: ['beat 1', 'beat 2', 'beat 3', 'after'],
  },
  {
    name: 'ticks and promises between two timer callbacks',
    src: `setTimeout(() => {
  console.log('A');
  process.nextTick(() => console.log('A-tick'));
  Promise.resolve().then(() => console.log('A-promise'));
}, 20);
setTimeout(() => console.log('B'), 40);`,
    expect: ['A', 'A-tick', 'A-promise', 'B'],
  },
  {
    name: 'setImmediate drains between callbacks, nested runs next turn',
    src: `setImmediate(() => {
  console.log('i1');
  process.nextTick(() => console.log('i1-tick'));
  setImmediate(() => console.log('nested'));
});
setImmediate(() => console.log('i2'));`,
    expect: ['i1', 'i1-tick', 'i2', 'nested'],
  },
  {
    name: 'from a timer, setImmediate before a nested setTimeout(0)',
    src: `setTimeout(() => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
}, 10);`,
    expect: ['immediate', 'timeout'],
  },
  {
    name: 'fs.readFile against a setImmediate queued from main',
    src: `const fs = require('fs');
fs.readFile('notes.txt', 'utf8', (err, data) => console.log('read ' + data.trim()));
setImmediate(() => console.log('immediate'));
console.log('sync');`,
    expect: ['sync', 'immediate', 'read hello notes'],
  },
  {
    name: 'inside the readFile callback, setImmediate before setTimeout(0)',
    src: `const fs = require('fs');
fs.readFile('notes.txt', 'utf8', () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
});`,
    expect: ['immediate', 'timeout'],
  },
  {
    name: 'fs.promises.readFile().then against ticks, promises and a setImmediate',
    src: `const fs = require('fs');
fs.promises.readFile('notes.txt', 'utf8').then(d => console.log('read ' + d.trim()));
setImmediate(() => console.log('immediate'));
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('tick'));
console.log('sync');`,
    expect: ['sync', 'tick', 'promise', 'immediate', 'read hello notes'],
  },
  {
    name: 'await on fs.promises.readFile against a then chain on the same promise',
    src: `const fs = require('fs');
const p = fs.promises.readFile('notes.txt', 'utf8');
(async () => { const d = await p; console.log('await ' + d.trim()); const e = await fs.promises.readFile('notes.txt', 'utf8'); console.log('again ' + e.trim()); })();
p.then(() => console.log('then1')).then(() => console.log('then2'));`,
    expect: ['await hello notes', 'then1', 'then2', 'again hello notes'],
  },
  {
    name: 'process.exit inside a timer stops later timers',
    src: `setTimeout(() => { console.log('before exit'); process.exit(0); console.log('never'); }, 10);
setTimeout(() => console.log('later'), 30);`,
    expect: ['before exit'],
  },
];

const SPAWN_CODES = ['ENOENT', 'EACCES', 'EPERM'];
export const isSpawnError = e => SPAWN_CODES.includes(e && e.code);

export function runRealNode(program) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'order-corpus-'));
  try {
    fs.writeFileSync(path.join(dir, 'notes.txt'), NOTES);
    const out = execFileSync(process.execPath, ['-e', program.src], { cwd: dir, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
    return out.split('\n').filter((l, i, a) => i < a.length - 1 || l !== '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function compareLines(label, actual, expect) {
  if (actual.length === expect.length && actual.every((l, i) => l === expect[i])) return null;
  return `${label}: expected ${JSON.stringify(expect)} but got ${JSON.stringify(actual)}`;
}
