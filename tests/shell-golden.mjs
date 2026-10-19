// Golden transcript of Shell Quest: plays every mission via "Type it for me" and compares the
// terminal output, XP and final progress export to fixtures. Refactors must keep it green.
// Rewrite fixtures deliberately with: UPDATE_GOLDEN=1 node tests/shell-golden.mjs
// Set PW_CHROMIUM to use a specific Chromium binary.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = path.join(ROOT, 'tests/fixtures/shell-beginner-golden.json');
const PROGRESS = path.join(ROOT, 'tests/fixtures/shell-progress-beginner-complete.json');
const UPDATE = !!process.env.UPDATE_GOLDEN;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }).end(fs.readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-golden-'));

// Wall-clock output (the `date` command) is replaced so the transcript is deterministic.
const normalize = t => t.replace(/\b[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}\b/g, '<DATE>');

let failed = null;
try {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`${base}/shell-quest/`);
  await page.waitForSelector('#cmd');

  const chapterCount = await page.$$eval('.chap[data-ch]', els => els.length);
  const records = [];
  for (let ch = 0; ch < chapterCount; ch++) {
    await page.click(`.chap[data-ch="${ch}"]`);
    let mission = 0;
    for (;;) {
      const btn = page.locator('#mission button[data-act="fill"]');
      if (!(await btn.count())) break;
      const title = (await page.textContent('#mission h2')).trim();
      await btn.click();
      let typed = await page.inputValue('#cmd');
      const step = async (cmd, followUp = false) => {
        const before = await page.$$eval('#screen .line', els => els.length);
        await page.fill('#cmd', cmd);
        await page.press('#cmd', 'Enter');
        const lines = await page.$$eval('#screen .line', (els, n) => els.slice(n).map(e => e.textContent), before);
        const rec = {
          chapter: ch, mission, title, typed: cmd,
          output: normalize(lines.join('\n')),
          xpText: (await page.textContent('#xpText')).trim(),
        };
        if (followUp) {
          const { typed, output, xpText } = rec;
          Object.assign(records[records.length - 1], { then: { typed, output }, xpText });
        } else records.push(rec);
        return lines;
      };
      const lines = await step(typed);
      // "Treasure hunt" is a two-step mission: "Type it for me" only fills the find; the player then cats the path it printed.
      if ((await page.textContent('#mission h2')).trim() === title) {
        const found = lines.slice(1).map(l => l.trim()).find(l => l.endsWith('gold.txt'));
        assert.ok(found, `mission "${title}" did not complete and has no scripted follow-up`);
        await step(`cat ${found}`, true);
      }
      mission++;
    }
  }
  assert.deepEqual(errors, []);

  await page.click('.pg-trigger');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Export to file')]);
  const exported = path.join(tmp, 'progress.json');
  await dl.saveAs(exported);
  const progress = JSON.parse(fs.readFileSync(exported, 'utf8'));
  // savedAt is the only wall-clock field in the export envelope.
  delete progress.savedAt;

  if (UPDATE) {
    fs.writeFileSync(GOLDEN, JSON.stringify(records, null, 2) + '\n');
    fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2) + '\n');
    console.log(`wrote ${records.length} records; xp=${progress.data?.xp}, badges=${Object.keys(progress.data?.badges || {}).length}`);
  } else {
    assert.deepEqual(records, JSON.parse(fs.readFileSync(GOLDEN, 'utf8')), 'transcript differs from golden');
    assert.deepEqual(progress, JSON.parse(fs.readFileSync(PROGRESS, 'utf8')), 'progress export differs from golden');
    console.log(`ok: ${records.length} records match golden`);
  }
  await ctx.close();
} catch (e) { failed = e; }
await browser.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(failed); process.exit(1); }
