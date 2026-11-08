// Shell Quest landing wiring: a mission opened out of order is set up on every way of landing on it.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }).end(fs.readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const SETUP = 'created the ~/camp folder';
try {
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/programming/shell-quest/`);
  await page.waitForSelector('#cmd');
  const count = () => page.$$eval('#screen .line.sys', e => e.filter(x => x.textContent.includes('Set up for this mission')).length);
  const type = async l => { await page.fill('#cmd', l); await page.press('#cmd', 'Enter'); };
  const dot = j => page.click(`#mission .dots [data-mi="${j}"]`);

  await page.click('.chap[data-ch="1"]');
  assert.equal(await count(), 0, 'chapter change onto Build a camp needs nothing');
  await dot(1);
  assert.equal(await count(), 1, 'dot click');
  assert.match(await page.textContent('#screen'), new RegExp(SETUP));
  await dot(1);
  assert.equal(await count(), 1, 'nothing is missing the second time');

  await page.click('#resetWorld'); await page.click('#resetWorld');
  assert.equal(await count(), 2, 'Reset world');

  await type('rm -r camp'); await page.reload(); await page.waitForSelector('#cmd');
  assert.equal(await count(), 1, 'boot');

  await dot(0);
  await type('mkdir camp');
  await type('rm -r camp');
  await page.click('.chap[data-ch="1"]');
  assert.equal(await count(), 2, 'chapter change onto the open mission');

  await type('touch camp/tent.txt');
  await type('rm -r camp');
  await dot(1);
  assert.equal(await count(), 2, 'a finished mission is not set up again');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
console.log('shell landing: ok');
