// Golden transcript of Script Quest: plays chapters 1 to 12 via "Type it for me" and compares each
// mission's typed line, editor, console output and XP, the chapter rail and the final save export to fixtures.
// Rewrite fixtures deliberately with: node tests/script/golden.browser.mjs --update
// Needs the jsDelivr CDN (acorn; TypeScript for chapter 11). Set PW_CHROMIUM to use a specific Chromium binary.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOLDEN = path.join(ROOT, 'tests/fixtures/script-golden.json');
const PROGRESS = path.join(ROOT, 'tests/fixtures/script-progress-complete.json');
const UPDATE = process.argv.includes('--update');
const CHAPTERS_COVERED = 12;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

if (!UPDATE) for (const f of [GOLDEN, PROGRESS]) {
  if (!fs.existsSync(f)) throw new Error(`missing fixture ${path.relative(ROOT, f)}: run node tests/script/golden.browser.mjs --update on the unmodified build`);
}

const env = msg => { console.log(`ENV: ${msg}`); process.exit(1); };

const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }).end(fs.readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
} catch (e) { server.close(); env(`chromium did not launch: ${String(e.message).split('\n')[0]}`); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-script-golden-'));

// "A default value" prints a die roll (Math.random in the page's own realm), so its result line is the one non-deterministic output.
const DIE = /^← [1-6]$/;
const READY = 'TypeScript compiler ready.';

const railHtml = page => page.$$eval('#chapters', ([root], n) => {
  const out = [];
  let chaps = 0;
  for (const el of root.children) {
    out.push(el.outerHTML);
    if (el.matches('.chap') && ++chaps === n) break;
  }
  return out;
}, CHAPTERS_COVERED);

let failed = null;
try {
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`${base}/programming/script-quest/`);
  await page.waitForSelector('#cmd');
  if (!(await page.evaluate(() => typeof window.acorn !== 'undefined'))) env('acorn did not load from the CDN');

  const wins = () => page.$$eval('#screen .line.win', els => els.length);
  const rail = { fresh: await railHtml(page) };
  const records = [];
  let readyDropped = 0;
  for (let ch = 0; ch < CHAPTERS_COVERED; ch++) {
    await page.click(`#chapters .chap[data-c="${ch}"]`);
    for (;;) {
      const at = /Mission (\d+) of (\d+)/.exec(await page.textContent('#mission .eyebrow'));
      if (!at) break;
      const title = (await page.textContent('#mission h2')).trim();
      const where = `chapter ${ch + 1}, mission ${at[1]} (${title})`;
      const before = await wins();
      const lineCount = await page.$$eval('#screen .line', els => els.length);
      await page.click('#fill');
      if (/edit /.test(await page.textContent('#mission .goal .label'))) await page.click('#edSave');
      const typed = await page.inputValue('#cmd');
      if ((await wins()) === before && typed.trim()) await page.press('#cmd', 'Enter');
      const deadline = Date.now() + (ch === 10 ? 30000 : 8000);
      while ((await wins()) <= before) {
        if (Date.now() > deadline) assert.fail(`${where}: the reference code did not complete the mission`);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(300);
      const lines = await page.$$eval('#screen .line', (els, n) => els.slice(n).map(e => e.textContent), lineCount);
      const editor = (await page.locator('#editor').isVisible()) ? await page.inputValue('#ed') : null;
      if (title === 'A default value') {
        let hit = 0;
        for (let i = 0; i < lines.length; i++) if (DIE.test(lines[i])) { lines[i] = '← <die>'; hit++; }
        if (!hit) throw new Error(`${where}: no die result line (${DIE}) in the output, the dice rule no longer applies`);
      }
      // The TypeScript load notice lands before or after the echo depending on CDN timing, so it is dropped wherever it falls.
      const shown = lines.filter(l => l !== READY);
      readyDropped += lines.length - shown.length;
      records.push({
        chapter: ch, mission: Number(at[1]), title, typed, editor,
        output: shown.join('\n'),
        xpText: (await page.textContent('#xpText')).trim(),
      });
    }
  }
  assert.equal(readyDropped, 1, `expected to drop the "${READY}" line exactly once, dropped ${readyDropped}`);
  assert.deepEqual(errors, []);
  rail.complete = await railHtml(page);

  await page.click('.pg-trigger');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Export to file')]);
  const exported = path.join(tmp, 'progress.json');
  await dl.saveAs(exported);
  const progress = JSON.parse(fs.readFileSync(exported, 'utf8'));
  delete progress.savedAt;

  const golden = { records, rail };
  if (UPDATE) {
    fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + '\n');
    fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2) + '\n');
    console.log(`wrote ${records.length} records; xp=${progress.data?.xp}`);
  } else {
    assert.deepEqual(golden, JSON.parse(fs.readFileSync(GOLDEN, 'utf8')), 'transcript or rail differs from golden');
    assert.deepEqual(progress, JSON.parse(fs.readFileSync(PROGRESS, 'utf8')), 'progress export differs from golden');
    console.log(`ok: ${records.length} records match golden`);
  }
  await ctx.close();
} catch (e) { failed = e; }
await browser.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(failed); process.exit(1); }
