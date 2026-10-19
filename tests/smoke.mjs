// Browser smoke tests: every page loads without errors, and the progress backup
// (export, import, linked save file) behaves. Run with `npm test`.
// Set PW_CHROMIUM to use a specific Chromium binary instead of Playwright's own.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['script', 'python', 'cpp', 'shell', 'harbor'];
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

let server, base, browser, tmp;

before(async () => {
  server = http.createServer((req, res) => {
    let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }).end(fs.readFileSync(p));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://localhost:${server.address().port}`;
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-'));
});
after(async () => { await browser?.close(); server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function open(url, opts = {}, prep) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...opts });
  if (prep) await prep(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(url);
  return { ctx, page, errors };
}
// Poll an async condition (waitForFunction doesn't reliably await async predicates).
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('condition not met within ' + ms + 'ms');
}
const read = (page, key) => page.evaluate(k => localStorage.getItem(k), key);

test('landing page links to every playground', async () => {
  const { ctx, page, errors } = await open(base + '/');
  const hrefs = await page.$$eval('a.card', a => a.map(x => x.getAttribute('href')));
  assert.deepEqual(hrefs.sort(), NAMES.map(n => `${n}-quest/`).sort());
  for (const h of hrefs) {
    const r = await page.request.get(`${base}/${h}`);
    assert.equal(r.status(), 200, h);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('landing page shows saved XP', async () => {
  const { ctx, page } = await open(base + '/');
  await page.evaluate(() => localStorage.setItem('python-quest-v1', JSON.stringify({ xp: 25 })));
  await page.reload();
  assert.match(await page.textContent('a[href="python-quest/"] .xp'), /25 XP/);
  await ctx.close();
});

for (const name of NAMES) {
  test(`${name}-quest loads cleanly`, async () => {
    const { ctx, page, errors } = await open(`${base}/${name}-quest/`);
    await page.waitForSelector('#mission');
    assert.ok((await page.textContent('#mission')).trim().length > 20, 'mission card is empty');
    assert.ok(await page.$('.pg-trigger'), 'Progress button missing');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${name}-quest shows only the selected tab`, async () => {
    const { ctx, page, errors } = await open(`${base}/${name}-quest/`, { viewport: { width: 1280, height: 800 } });
    await page.waitForSelector('#mission');
    const tabs = await page.$$eval('.tabs button[data-tab]', bs => bs.map(b => b.dataset.tab));
    assert.ok(tabs.length >= 3, 'expected at least 3 tabs');
    for (const tab of tabs) {
      await page.click(`.tabs button[data-tab="${tab}"]`);
      // A panel counts as shown when it takes up space; `hidden` panels must collapse.
      const shown = await page.$$eval('section[id^="tab-"]', ss =>
        ss.filter(s => s.getBoundingClientRect().height > 0 && getComputedStyle(s).display !== 'none').map(s => s.id.slice(4)));
      assert.deepEqual(shown, [tab], `after clicking "${tab}"`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${name}-quest progress survives export, wipe and import`, async () => {
    const key = `${name}-quest-v1`;
    const { ctx, page, errors } = await open(`${base}/${name}-quest/`);
    await page.waitForSelector('#mission');
    // Get a real saved state first (some apps only save after an action).
    if (await read(page, key) === null && !(await page.$('#cmd'))) {
      await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ xp: 0, done: {} })), key);
    }
    if (await read(page, key) === null) {
      await page.fill('#cmd', name === 'harbor' ? 'docker ps' : 'pwd');
      await page.press('#cmd', 'Enter');
      await page.waitForFunction(k => localStorage.getItem(k) !== null, key);
    }
    const state = JSON.parse(await read(page, key));
    state.xp = 77; state.done = { '0-0': true, '0-1': true };
    // The app keeps its own copy of the state and saves it (some after a short delay), which would
    // overwrite a seed written behind its back. Write the seed, block any later writes from this
    // page, then reload so the app starts from the seeded state.
    await page.evaluate(([k, v]) => {
      Storage.prototype.setItem.call(localStorage, k, v);
      Storage.prototype.setItem = () => {};
    }, [key, JSON.stringify(state)]);
    await page.reload();
    await page.waitForSelector('#mission');
    assert.equal(JSON.parse(await read(page, key)).xp, 77, 'seed did not stick');

    await page.click('.pg-trigger');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Export to file')]);
    const file = path.join(tmp, `${name}.json`);
    await dl.saveAs(file);
    assert.equal(dl.suggestedFilename(), `${name}-quest-progress.json`);
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(exported.app, `${name}-quest`);
    assert.equal(exported.data.xp, 77);

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.click('.pg-trigger');
    await Promise.all([page.waitForNavigation(), page.setInputFiles('.pg-file', file)]);
    await page.waitForSelector('#mission');
    assert.equal(JSON.parse(await read(page, key)).xp, 77);
    assert.match(await page.textContent('#xpText'), /77/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('shell-quest imports a complete beginner save: 695 XP, Pipe Fitter', async () => {
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#mission');
  await page.click('.pg-trigger');
  await Promise.all([page.waitForNavigation(), page.setInputFiles('.pg-file', path.join(ROOT, 'tests/fixtures/shell-progress-beginner-complete.json'))]);
  await page.waitForSelector('#mission');
  assert.equal((await page.textContent('#xpText')).trim(), '695 XP');
  assert.equal((await page.textContent('#rank')).trim(), 'Pipe Fitter');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest tier rail: Beginner header counts chapters and shows a star when complete', async () => {
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#mission');
  assert.equal(await page.locator('.tierhead').count(), 3);
  const heads = () => page.$$eval('.tierhead', hs => hs.map(h => h.textContent.replace(/\s+/g, ' ').trim()));
  let [head, ihead, ahead] = await heads();
  assert.match(head, /^Beginner/);
  assert.match(head, /0\/7/);
  assert.doesNotMatch(head, /★/);
  assert.match(ihead, /^Intermediate/);
  assert.match(ihead, /0\/4/);
  assert.doesNotMatch(ihead, /★/);
  assert.match(ahead, /^Advanced/);
  assert.match(ahead, /0\/4/);
  assert.doesNotMatch(ahead, /★/);
  const before = (await page.textContent('#mission')).replace(/\s+/g, ' ');
  await page.click('.chap[data-ch="7"]');
  await page.waitForFunction(() => /Pick a column/.test(document.querySelector('#mission').textContent));
  assert.notEqual((await page.textContent('#mission')).replace(/\s+/g, ' '), before);
  assert.equal(await page.getAttribute('.chap[data-ch="7"]', 'aria-current'), 'true');
  await page.click('.pg-trigger');
  await Promise.all([page.waitForNavigation(), page.setInputFiles('.pg-file', path.join(ROOT, 'tests/fixtures/shell-progress-beginner-complete.json'))]);
  await page.waitForSelector('#mission');
  [head, ihead, ahead] = await heads();
  assert.match(head, /7\/7/);
  assert.match(head, /★/);
  assert.match(ihead, /0\/4/);
  assert.doesNotMatch(ihead, /★/);
  // a Stage 1 save knows nothing of Advanced: the new tier just starts empty
  assert.match(ahead, /^Advanced/);
  assert.match(ahead, /0\/4/);
  assert.doesNotMatch(ahead, /★/);
  assert.equal((await page.textContent('#xpText')).trim(), '695 XP');
  assert.equal((await page.textContent('#rank')).trim(), 'Pipe Fitter');
  assert.deepEqual(await page.$$eval('.chap[data-ch="11"] .ct, .chap[data-ch="14"] .ct', es => es.map(e => e.textContent)), ['0/7', '0/7']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest: finishing chapters 7 to 10 completes the Intermediate tier (4/4, star, Script Smith)', async () => {
  // Built from the beginner fixture: add the four Intermediate badges, their done keys and the XP.
  const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/shell-progress-beginner-complete.json'), 'utf8'));
  const counts = { 7: 7, 8: 8, 9: 7, 10: 7 };
  let xp = f.data.xp;
  for (const [ch, n] of Object.entries(counts)) {
    for (let m = 0; m < n; m++) { f.data.done[`${ch}.${m}`] = 1; xp += 15; }
    f.data.badges[ch] = 1; xp += 25;
  }
  f.data.xp = xp; f.data.ch = 10; f.data.mi = counts[10];
  const file = path.join(tmp, 'intermediate-complete.json');
  fs.writeFileSync(file, JSON.stringify(f));
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#mission');
  await page.click('.pg-trigger');
  await Promise.all([page.waitForNavigation(), page.setInputFiles('.pg-file', file)]);
  await page.waitForSelector('#mission');
  const heads = await page.$$eval('.tierhead', hs => hs.map(h => h.textContent.replace(/\s+/g, ' ').trim()));
  assert.match(heads[0], /7\/7/);
  assert.match(heads[1], /^Intermediate/);
  assert.match(heads[1], /4\/4/);
  assert.match(heads[1], /★/);
  assert.match(heads[2], /^Advanced/);
  assert.match(heads[2], /0\/4/);
  assert.doesNotMatch(heads[2], /★/);
  assert.deepEqual(await page.$$eval('.chap[data-ch="8"] .ct, .chap[data-ch="10"] .ct', es => es.map(e => e.textContent)), ['8/8', '7/7']);
  assert.equal(xp, 1230);
  assert.equal((await page.textContent('#xpText')).trim(), '1230 XP');
  assert.equal((await page.textContent('#rank')).trim(), 'Script Smith');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest: a save with chapters 1 to 15 badged shows three complete tiers, a star on each, and the top rank Automator', async () => {
  // Built from the beginner fixture: every Intermediate (15 XP) and Advanced (20 XP) mission done, every badge earned.
  const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/shell-progress-beginner-complete.json'), 'utf8'));
  const counts = { 7: [7, 15], 8: [8, 15], 9: [7, 15], 10: [7, 15], 11: [7, 20], 12: [7, 20], 13: [7, 20], 14: [7, 20] };
  let xp = f.data.xp;
  for (const [ch, [n, per]] of Object.entries(counts)) {
    for (let m = 0; m < n; m++) { f.data.done[`${ch}.${m}`] = 1; xp += per; }
    f.data.badges[ch] = 1; xp += 25;
  }
  assert.equal(xp, 1890);
  f.data.xp = xp; f.data.ch = 14; f.data.mi = 7;
  const file = path.join(tmp, 'advanced-complete.json');
  fs.writeFileSync(file, JSON.stringify(f));
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#mission');
  await page.click('.pg-trigger');
  await Promise.all([page.waitForNavigation(), page.setInputFiles('.pg-file', file)]);
  await page.waitForSelector('#mission');
  const heads = await page.$$eval('.tierhead', hs => hs.map(h => h.textContent.replace(/\s+/g, ' ').trim()));
  assert.equal(heads.length, 3);
  assert.deepEqual(await page.$$eval('.tierhead', hs => hs.map(h => h.classList.contains('complete'))), [true, true, true]);
  assert.match(heads[0], /^Beginner.*7\/7.*★/);
  assert.match(heads[1], /^Intermediate.*4\/4.*★/);
  assert.match(heads[2], /^Advanced.*4\/4.*★/);
  assert.equal(await page.locator('.chap.earned').count(), 15);
  assert.equal((await page.textContent('#xpText')).trim(), '1890 XP');
  assert.equal((await page.textContent('#rank')).trim(), 'Automator');
  assert.match(await page.textContent('#mission h2'), /You finished the Advanced tier/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest artifact bundle (dist/shell-quest.html) works as a single inlined page', async () => {
  execFileSync('python3', ['tools/build.py', 'shell'], { cwd: ROOT, stdio: 'pipe' });
  const body = fs.readFileSync(path.join(ROOT, 'dist/shell-quest.html'), 'utf8');
  // The Artifact service wraps the body-only fragment in a document skeleton; mirror that here.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;
  const { ctx, page, errors } = await open('about:blank');
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  // The bundle keeps the Google Fonts link, which cannot load offline: answer those requests with empty files.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('http://bundle.test/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto('http://bundle.test/shell-quest.html');
  await page.waitForSelector('#mission');
  assert.equal(await page.locator('.tierhead').count(), 3);
  const heads = await page.$$eval('.tierhead', hs => hs.map(h => h.textContent.replace(/\s+/g, ' ').trim()));
  assert.match(heads[0], /^Beginner/);
  assert.match(heads[1], /^Intermediate/);
  assert.match(heads[2], /^Advanced/);
  const before = (await page.textContent('#mission')).replace(/\s+/g, ' ');
  await page.click('.chap[data-ch="7"]');
  await page.waitForFunction(() => /Pick a column/.test(document.querySelector('#mission').textContent));
  assert.notEqual((await page.textContent('#mission')).replace(/\s+/g, ' '), before);
  const xp = async () => parseInt(await page.textContent('#xpText'), 10);
  const x0 = await xp();
  await page.fill('#cmd', 'cut -d, -f1 village/sales.csv');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(x => parseInt(document.querySelector('#xpText').textContent, 10) > x, x0);
  assert.equal(await xp(), x0 + 15);
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  await ctx.close();
});

test('shell-quest: runaway output is capped, so progress still saves and survives a reload', async () => {
  const key = 'shell-quest-v1';
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#cmd');
  const type = async line => { await page.fill('#cmd', line); await page.press('#cmd', 'Enter'); };
  // The file-doubling repro, scaled down: the caps must stop it before the saved state outgrows localStorage.
  await type('seq 10000 > f');
  await type('seq 300 | xargs -I{} cat f > g');
  await page.waitForFunction(() => /too large for this practice shell/.test(document.querySelector('#screen').textContent));
  await type('pwd');
  await page.waitForFunction(k => JSON.parse(localStorage.getItem(k) || '{}').xp > 0, key);
  assert.ok((await read(page, key)).length < 2500000, 'saved state stays small');
  const xp = JSON.parse(await read(page, key)).xp;
  await page.reload();
  await page.waitForSelector('#cmd');
  assert.equal((await page.textContent('#xpText')).trim(), `${xp} XP`);
  assert.equal(JSON.parse(await read(page, key)).xp, xp);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest warns once in the terminal when the browser refuses to save', async () => {
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#cmd');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  const warnings = () => page.$$eval('#screen .line.err', ls => ls.filter(l => /would not store your progress/.test(l.textContent)).length);
  await page.fill('#cmd', 'pwd'); await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => /would not store your progress/.test(document.querySelector('#screen').textContent));
  await page.fill('#cmd', 'ls'); await page.press('#cmd', 'Enter');
  await page.fill('#cmd', 'pwd'); await page.press('#cmd', 'Enter');
  assert.equal(await warnings(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest field guide groups by tier and keeps extras explicit', async () => {
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#mission');
  await page.click('#t-guide');
  assert.deepEqual(await page.$$eval('#guide h3[data-tier]', hs => hs.map(h => h.dataset.tier)), ['beginner', 'intermediate', 'advanced']);
  assert.deepEqual(await page.$$eval('#guide .gfilter button', bs => bs.map(b => b.textContent.trim())), ['All', 'Beginner', 'Intermediate', 'Advanced']);
  const extras = await page.$$eval('#guide .gsec[data-extras] h4', hs => hs.map(h => h.textContent));
  assert.ok(extras.includes('help'), 'help should sit in Handy extras');
  assert.match(await page.textContent('#guide .gsec[data-extras] h3'), /Handy extras/);
  assert.ok(await page.isVisible('#guide .gsec[data-extras]'));
  await page.click('#guide .gfilter button[data-tier="beginner"]');
  assert.ok(await page.isVisible('#guide h3[data-tier="beginner"]'));
  assert.ok(await page.isVisible('#guide .gsec[data-tier="beginner"] h4'));
  assert.ok(!(await page.isVisible('#guide .gsec[data-extras]')), 'extras hidden under a tier filter');
  assert.ok(!(await page.isVisible('#guide .gsec[data-tier="intermediate"]')), 'Intermediate hidden under the Beginner filter');
  await page.click('#guide .gfilter button[data-tier="intermediate"]');
  assert.ok(await page.isVisible('#guide .gsec[data-tier="intermediate"] h4'));
  assert.ok(!(await page.isVisible('#guide .gsec[data-tier="beginner"]')), 'Beginner hidden under the Intermediate filter');
  assert.ok(!(await page.isVisible('#guide .gsec[data-extras]')));
  await page.click('#guide .gfilter button[data-tier="all"]');
  assert.ok(await page.isVisible('#guide .gsec[data-extras]'));
  assert.ok(await page.isVisible('#guide .gsec[data-tier="beginner"]') && await page.isVisible('#guide .gsec[data-tier="intermediate"]'));
  await page.setViewportSize({ width: 390, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow at 390px');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest quick-fire tier picker: Mixed + tiers with questions, run draws from the chosen pool', async () => {
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#mission');
  await page.click('#t-fire');
  const opts = await page.$$eval('#fTier option', os => os.map(o => [o.value, o.textContent.trim()]));
  assert.deepEqual(opts, [['mixed', 'Mixed'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']]);
  assert.equal(await page.inputValue('#fTier'), 'mixed');
  const pool = await page.evaluate(() => SQ.content.quickfire.filter(q => (q[2] || 'beginner') === 'beginner').map(q => q[0]));
  assert.ok(pool.length > 0);
  const run = async (tier, allowed) => {
    await page.selectOption('#fTier', tier);
    await page.click('#fStart');
    for (let i = 0; i < 3; i++) {
      const task = await page.textContent('#fTask');
      assert.ok(allowed.includes(task), `"${task}" is in the ${tier} pool`);
      await page.click('#fSkip');
    }
    await page.click('#fStop');
  };
  const ipool = await page.evaluate(() => SQ.content.quickfire.filter(q => q[2] === 'intermediate').map(q => q[0]));
  assert.ok(ipool.length > 0 && ipool.every(t => !pool.includes(t)));
  await run('beginner', pool);
  await run('intermediate', ipool);
  await run('mixed', await page.evaluate(() => SQ.content.quickfire.map(q => q[0])));
  await page.setViewportSize({ width: 390, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow at 390px');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest quick-fire: single-quote question rejects expanding forms, tee accepts ./', async () => {
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#mission');
  await page.click('#t-fire');
  await page.selectOption('#fTier', 'intermediate');
  await page.click('#fStart');
  const poolSize = await page.evaluate(() => SQ.content.quickfire.filter(q => q[2] === 'intermediate').length);
  const tryAnswer = async (task, ans) => {
    // Every answer (right or wrong) moves on, and the queue reshuffles when it runs out, so the target comes
    // round again within two passes of the pool; allow three before failing.
    for (let i = 0; i < poolSize * 3 && (await page.textContent('#fTask')) !== task; i++) await page.click('#fSkip');
    assert.equal(await page.textContent('#fTask'), task, `question never came up within ${poolSize * 3} skips`);
    await page.fill('#fIn', ans);
    await page.press('#fIn', 'Enter');
    return (await page.textContent('#fFb')).trim();
  };
  const T = 'Print the text $HOME without bash expanding it';
  assert.match(await tryAnswer(T, 'echo $HOME'), /^Not quite/);
  assert.match(await tryAnswer(T, 'echo "$HOME"'), /^Not quite/);
  assert.match(await tryAnswer(T, "echo '$HOME'"), /^Correct/);
  assert.match(await tryAnswer(T, 'echo \\$HOME'), /^Correct/);
  assert.match(await tryAnswer('Show the output of ls and also save it in listing.txt', 'ls | tee ./listing.txt'), /^Correct/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('import rejects another playground\'s file and garbage', async () => {
  const { ctx, page } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#mission');
  await page.click('.pg-trigger');
  const send = async body => {
    const f = path.join(tmp, 'x.json'); fs.writeFileSync(f, body);
    // Clear the previous message first, or the wait below returns at once on the stale one (flaky under load).
    await page.evaluate(() => { document.querySelector('.pg-msg').textContent = ''; });
    await page.setInputFiles('.pg-file', f);
    await page.waitForFunction(() => document.querySelector('.pg-msg').textContent.length > 0);
    return page.textContent('.pg-msg');
  };
  assert.match(await send(JSON.stringify({ format: 'playgrounds-progress', app: 'python-quest', data: { xp: 1 } })), /belongs to/);
  assert.match(await send('not json'), /valid JSON/);
  await ctx.close();
});

test('linked save file: follows saves, restores after wipes', async () => {
  const key = 'shell-quest-v1';
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  // Stand-in for the OS file picker: a file in the browser's private storage (supports the same writable API).
  const stub = () => {
    const h = async () => (await navigator.storage.getDirectory()).getFileHandle('linked.json', { create: true });
    window.showSaveFilePicker = h;
    window.showOpenFilePicker = async () => [await h()];
  };
  await ctx.addInitScript(stub);
  await ctx.addInitScript(() => { try { sessionStorage.setItem('loads', String(Number(sessionStorage.getItem('loads')) + 1)); } catch (e) { /* no storage */ } });
  await page.reload();
  await page.waitForSelector('#cmd');
  const fileText = () => page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('linked.json')).getFile()).text());

  await page.fill('#cmd', 'pwd'); await page.press('#cmd', 'Enter');
  await page.waitForFunction(k => JSON.parse(localStorage.getItem(k) || '{}').xp > 0, key);
  await page.click('.pg-trigger'); await page.click('text=Create save file');
  await page.waitForSelector('.pg-state.pg-ok');
  assert.equal(JSON.parse(await fileText()).app, 'shell-quest');

  await page.click('.pg-trigger'); // close the panel
  await page.fill('#cmd', 'ls'); await page.press('#cmd', 'Enter');
  const local = () => read(page, key);
  await until(async () => {
    const mine = JSON.parse(await local());
    return mine.hist.includes('ls') && JSON.stringify(JSON.parse(await fileText()).data) === JSON.stringify(mine);
  });
  const saved = await local();

  // localStorage wiped, link kept (IndexedDB): restores on load.
  await page.evaluate(() => localStorage.clear());
  const loads = () => page.evaluate(() => Number(sessionStorage.getItem('loads')));
  const before = await loads();
  await page.reload();
  // Restoring from the link writes localStorage and then reloads the page (shared/progress.js restore()),
  // so the restored value is visible one navigation before the page has settled. Count document loads
  // (the init script bumps a sessionStorage counter) and wait for both the test's reload and the restore's.
  await until(async () => {
    try { return (await loads()) === before + 2 && (await local()) === saved; }
    catch (e) { if (/context was destroyed|navigation/i.test(e.message)) return false; throw e; }
  });
  await page.waitForLoadState('load');
  assert.equal(await local(), saved);

  // Everything wiped, including the link: "Open existing file" brings it back.
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise(r => { const q = indexedDB.deleteDatabase('playgrounds-progress'); q.onsuccess = q.onerror = q.onblocked = r; });
  });
  await page.reload();
  await page.waitForSelector('#cmd');
  await page.click('.pg-trigger');
  await Promise.all([page.waitForNavigation(), page.click('text=Open existing file')]);
  await page.waitForFunction(k => JSON.parse(localStorage.getItem(k) || '{}').xp > 0, key);
  assert.equal(await local(), saved);
  await page.click('.pg-trigger');
  await page.waitForSelector('.pg-state.pg-ok');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- Task 9: editor panel ----
const SQ_KEY = 'shell-quest-v1';
async function shellPage(opts = {}, prep) {
  const o = await open(`${base}/shell-quest/`, opts, prep);
  await o.page.waitForSelector('#cmd');
  o.type = async line => { await o.page.fill('#cmd', line); await o.page.press('#cmd', 'Enter'); };
  o.screen = () => o.page.textContent('#screen');
  o.waitScreen = (re, ms) => o.page.waitForFunction(r => new RegExp(r).test(document.querySelector('#screen').textContent), re.source, { timeout: ms || 8000 });
  o.file = async name => o.page.evaluate(([k, n]) => { const f = JSON.parse(localStorage.getItem(k)).fs.children.home.children.explorer.children[n]; return f ? f : null; }, [SQ_KEY, name]);
  o.visible = sel => o.page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; }, sel);
  return o;
}

test('shell-quest editor: nano opens a panel with the shebang, Save writes the file, bash runs it', async () => {
  const { ctx, page, errors, type, waitScreen, file, visible } = await shellPage({ viewport: { width: 1280, height: 900 } });
  assert.equal(await visible('#editor'), false, 'hidden by default');
  await type('nano hello.sh');
  await page.waitForSelector('#editor:not([hidden])');
  assert.equal(await page.inputValue('#edText'), '#!/bin/bash\n');
  assert.equal((await page.textContent('#edTitle')).trim(), '/home/explorer/hello.sh');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'edText');
  assert.equal(await file('hello.sh'), null, 'no file before Save');
  assert.equal(await visible('#tab-quest'), true);
  assert.equal(await visible('#tab-fire'), false);
  assert.equal(await page.getAttribute('#edText', 'wrap'), 'off');
  assert.equal(await page.getAttribute('#edText', 'spellcheck'), 'false');
  assert.ok(await page.getAttribute('#edText', 'aria-label'), 'textarea is labelled');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#editor button')].every(b => b.type === 'button')), true);
  await page.fill('#edText', '#!/bin/bash\necho "hello $1"\n');
  await page.click('#edSave');
  await waitScreen(/Saved hello\.sh/);
  assert.equal((await file('hello.sh')).content, '#!/bin/bash\necho "hello $1"\n');
  await type('bash hello.sh Zed');
  await waitScreen(/hello Zed/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: Save & run passes arguments and stdin; shortcuts work', async () => {
  const { ctx, page, errors, waitScreen, type } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await type('nano greet.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', 'read name\necho "hi $1 and $name"\n');
  await page.fill('#edArgs', 'Ada');
  await page.click('#editor details summary');
  await page.fill('#edStdin', 'Bob');
  await page.click('#edRun');
  await waitScreen(/hi Ada and Bob/);
  assert.match(await page.textContent('#screen'), /\$ bash greet\.sh Ada/);
  // Ctrl+Enter saves and runs
  await page.fill('#edText', 'echo second $1\n');
  await page.focus('#edText');
  await page.keyboard.press('Control+Enter');
  await waitScreen(/second Ada/);
  // Ctrl+S saves only, and the browser's own save dialog is suppressed
  await page.fill('#edText', 'echo third\n');
  await page.focus('#edText');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(k => JSON.parse(localStorage.getItem(k)).fs.children.home.children.explorer.children['greet.sh'].content === 'echo third\n', SQ_KEY);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: CRLF is normalised, 1,000,001 characters are refused, the exec bit survives', async () => {
  const { ctx, page, errors, waitScreen, type, file } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await type('touch run.sh');
  await type('chmod +x run.sh');
  await type('nano run.sh');
  await page.waitForSelector('#editor:not([hidden])');
  // a textarea normalises line breaks itself, so the CRLF text goes straight to the save hook
  await page.evaluate(() => window.SQ.editorSave('/home/explorer/run.sh', 'a\r\nb\rc\r\n'));
  await waitScreen(/Saved run\.sh/);
  const f = await file('run.sh');
  assert.equal(f.content, 'a\nb\nc\n');
  assert.equal(f.exec, true, 'exec bit kept after an editor save');
  await type('nano fresh.sh');
  await page.waitForFunction(() => document.querySelector('#edTitle').textContent.endsWith('fresh.sh'));
  await page.click('#edSave');
  await waitScreen(/Saved fresh\.sh/);
  assert.ok(!(await file('fresh.sh')).exec, 'a new file is not runnable');
  await type('nano run.sh');
  await page.waitForFunction(() => document.querySelector('#edTitle').textContent.endsWith('run.sh'));
  await page.fill('#edText', 'x'.repeat(1000001));
  await page.click('#edSave');
  await waitScreen(/file too large for this practice shell/);
  assert.equal((await file('run.sh')).content, 'a\nb\nc\n', 'unchanged');
  assert.equal(await page.isVisible('#editor'), true, 'still open');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: file names are shown as text (no markup, no dialog)', async () => {
  const { ctx, page, errors, type, waitScreen } = await shellPage({ viewport: { width: 1280, height: 900 } });
  let dialogs = 0;
  page.removeAllListeners('dialog');
  page.on('dialog', d => { dialogs++; d.dismiss(); });
  const name = '<img src=x onerror=alert(1)>';
  await type(`touch '${name}'`);
  await type(`nano '${name}'`);
  await page.waitForSelector('#editor:not([hidden])');
  assert.equal(await page.textContent('#edTitle'), '/home/explorer/' + name);
  assert.equal(await page.locator('#edTitle img, #editor img').count(), 0);
  await page.fill('#edText', 'echo x\n');
  await page.click('#edSave');
  await waitScreen(/Saved /);
  assert.equal(await page.locator('#screen img').count(), 0);
  assert.match(await page.textContent('#screen'), /Saved .*<img src=x onerror=alert\(1\)>/);
  assert.equal(dialogs, 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: closing needs two clicks with unsaved changes; Escape follows the same rule; focus returns', async () => {
  const { ctx, page, errors, type, waitScreen } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await type('nano a.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.click('#edClose'); // unchanged: closes at once
  await page.waitForSelector('#editor', { state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd');
  await type('nano a.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', 'echo changed\n');
  await page.click('#edClose');
  assert.equal((await page.textContent('#edClose')).trim(), 'Discard changes?');
  assert.equal(await page.isVisible('#editor'), true);
  await page.click('#edClose');
  await page.waitForSelector('#editor', { state: 'hidden' });
  assert.equal((await page.textContent('#edClose')).trim(), 'Close');
  // Escape: same rule; Save clears the dirty state
  await type('nano a.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', 'echo kept\n');
  await page.press('#edText', 'Escape');
  assert.equal(await page.isVisible('#editor'), true);
  assert.equal((await page.textContent('#edClose')).trim(), 'Discard changes?');
  await page.click('#edSave');
  await waitScreen(/Saved a\.sh/);
  assert.equal((await page.textContent('#edClose')).trim(), 'Close', 'Save resets the discard prompt');
  await page.press('#edText', 'Escape');
  await page.waitForSelector('#editor', { state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: a second file is refused while the first has unsaved changes', async () => {
  const { ctx, page, errors, type, waitScreen } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await type('nano one.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', 'echo one\n');
  await type('nano two.sh');
  await waitScreen(/Save or close one\.sh first/);
  assert.equal((await page.textContent('#edTitle')).trim(), '/home/explorer/one.sh');
  assert.equal(await page.inputValue('#edText'), 'echo one\n');
  await page.click('#edSave');
  await type('nano two.sh');
  await page.waitForFunction(() => document.querySelector('#edTitle').textContent.endsWith('two.sh'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: nano on a missing parent or a directory prints the error and opens nothing', async () => {
  const { ctx, page, errors, type, waitScreen, visible } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await type('nano nodir/x.sh');
  await waitScreen(/nano: cannot create 'nodir\/x\.sh': No such file or directory/);
  assert.equal(await visible('#editor'), false);
  await type('nano forest');
  await waitScreen(/nano: forest: Is a directory/);
  assert.equal(await visible('#editor'), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: at 390px wide there is no horizontal overflow and every control is usable (touch)', async () => {
  const { ctx, page, errors, type } = await shellPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await type('nano m.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.evaluate(() => document.querySelector('#editor details').open = true);
  const r = await page.evaluate(() => {
    const ids = ['edSave', 'edRun', 'edTab', 'edClose', 'edArgs'].map(id => {
      const b = document.getElementById(id).getBoundingClientRect();
      return { id, w: b.width, h: b.height, right: b.right, left: b.left };
    });
    return { ids, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  });
  assert.ok(r.sw <= r.cw, `page overflows horizontally: ${r.sw} > ${r.cw}`);
  for (const b of r.ids) {
    assert.ok(b.w > 20 && b.left >= 0 && b.right <= r.cw, `${b.id} is on screen`);
    assert.ok(b.h >= 40, `${b.id} is at least 40px tall (${b.h})`);
  }
  await ctx.close();
  assert.deepEqual(errors, []);
});

test('shell-quest editor: the Tab button inserts two spaces at the caret', async () => {
  const { ctx, page, errors, type } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await type('nano t.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', 'ab');
  await page.evaluate(() => { const t = document.getElementById('edText'); t.setSelectionRange(1, 1); });
  await page.click('#edTab');
  assert.equal(await page.inputValue('#edText'), 'a  b');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest: touch extra keys include the script punctuation; tab completion hides [ . and :', async () => {
  const { ctx, page, errors, type } = await shellPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const keys = await page.$$eval('#keys button', bs => bs.filter(b => b.offsetParent).map(b => b.dataset.k));
  for (const k of ['$', ';', '&', '(', ')', '{', '}', '[', ']', '=', '<', '`', '\\']) assert.ok(keys.includes(k), `key ${k}`);
  await page.click('#keys button[data-k="{"]');
  assert.equal(await page.inputValue('#cmd'), '{');
  await page.fill('#cmd', '');
  // completion: the symbol builtins ([ . :) are never offered; letter prefixes still complete (nano, edit, vi, vim stay)
  const listFor = prefix => page.evaluate(p => {
    const c = document.querySelector('#cmd'); c.value = p; c.setSelectionRange(p.length, p.length);
    document.querySelector('#keys [data-k="TAB"]').click();
    return { value: c.value, last: document.querySelector('#screen').lastElementChild.textContent };
  }, prefix);
  const all = (await listFor('')).last.replace(/^\S+@\S+:\S*\$\s*/, '').split(/\s+/).filter(Boolean);
  assert.ok(all.length > 20 && all.includes('nano') && all.includes('edit') && all.includes('vi') && all.includes('vim'), 'full list shown: ' + all.length);
  for (const bad of ['[', '.', ':']) assert.ok(!all.includes(bad), `"${bad}" hidden from completion`);
  assert.equal((await listFor('[')).value, '[', 'nothing completes "["');
  assert.equal((await listFor('nan')).value, 'nano ');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: extra keys type into the field that was used last', async () => {
  const { ctx, page, errors, type } = await shellPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await type('nano k.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', 'ab');
  await page.evaluate(() => { const t = document.getElementById('edText'); t.focus(); t.setSelectionRange(1, 1); });
  await page.click('#keys button[data-k="{"]');
  assert.equal(await page.inputValue('#edText'), 'a{b');
  assert.equal(await page.inputValue('#cmd'), '');
  assert.deepEqual(await page.evaluate(() => [document.activeElement.id, document.activeElement.selectionStart]), ['edText', 2]);
  await page.focus('#edArgs');
  await page.click('#keys button[data-k="$"]');
  assert.equal(await page.inputValue('#edArgs'), '$');
  assert.equal(await page.inputValue('#edText'), 'a{b');
  await page.click('#edClose'); await page.click('#edClose');
  await page.waitForSelector('#editor', { state: 'hidden' });
  await page.click('#keys button[data-k="["]');
  assert.equal(await page.inputValue('#cmd'), '[', 'closed editor: keys go to the terminal');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: Save & run quotes names with spaces, quotes and $; reopening the open file just refocuses', async () => {
  const { ctx, page, errors, type, waitScreen } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await type("touch 'a b$c.sh'");
  await type("nano 'a b$c.sh'");
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', 'echo ran-$1\n');
  await page.fill('#edArgs', 'X');
  await page.click('#edRun');
  await waitScreen(/ran-X/);
  await page.fill('#edText', 'echo changed\n');
  await page.focus('#edArgs');
  await type("nano 'a b$c.sh'");
  await page.waitForFunction(() => document.activeElement.id === 'edText');
  assert.doesNotMatch(await page.textContent('#screen'), /unsaved changes/);
  assert.equal(await page.inputValue('#edText'), 'echo changed\n');
  await type("touch \"it's.sh\"");
  await page.click('#edSave');
  await type("nano \"it's.sh\"");
  await page.waitForFunction(() => document.querySelector('#edTitle').textContent.endsWith("it's.sh"));
  await page.fill('#edText', 'echo quote-ok\n');
  await page.click('#edRun');
  await waitScreen(/quote-ok/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: the discard prompt resets after a timeout and when typing resumes', async () => {
  const { ctx, page, errors, type } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await page.clock.install();
  await type('nano d.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', 'echo x\n');
  await page.click('#edClose');
  assert.equal((await page.textContent('#edClose')).trim(), 'Discard changes?');
  await page.clock.runFor(7000);
  await page.waitForFunction(() => document.querySelector('#edClose').textContent.trim() === 'Close');
  await page.click('#edClose');
  assert.equal((await page.textContent('#edClose')).trim(), 'Discard changes?');
  await page.press('#edText', 'a');
  assert.equal((await page.textContent('#edClose')).trim(), 'Close', 'typing cancels the prompt');
  assert.equal(await page.isVisible('#editor'), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: a failed save shows the error and leaves the editor open and unsaved', async () => {
  const { ctx, page, errors, type, waitScreen } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await type('mkdir sub');
  await type('nano sub/f.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', 'echo hi\n');
  await type('rmdir sub');
  await waitScreen(/\$ rmdir sub/);
  await page.click('#edSave');
  await waitScreen(/No such file or directory/);
  assert.equal(await page.isVisible('#editor'), true);
  await page.click('#edClose');
  assert.equal((await page.textContent('#edClose')).trim(), 'Discard changes?', 'still dirty');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- Task 10: mission kinds (script, challenge) ----
// The test-only chapter in tests/fixtures/fake-advanced.js is appended to content/quickfire.js in transit (before ui.js and app.js run).
const FAKE_JS = fs.readFileSync(path.join(ROOT, 'tests/fixtures/fake-advanced.js'), 'utf8');
async function fakeChapterPage() {
  const o = await shellPage({ viewport: { width: 1280, height: 900 } }, async ctx => {
    await ctx.route('**/shell-quest/content/quickfire.js', async route => {
      const r = await route.fetch();
      await route.fulfill({ response: r, body: (await r.text()) + '\n' + FAKE_JS });
    });
  });
  const idx = await o.page.evaluate(() => window.SQ.content.chapters.length - 1);
  await o.page.click(`[data-ch="${idx}"]`);
  await o.page.waitForFunction(() => /Greeter/.test(document.querySelector('#mission').textContent));
  o.xp = async () => (await o.page.textContent('#xpText')).trim();
  o.lines = re => o.page.evaluate(r => [...document.querySelectorAll('#screen .line')].filter(l => new RegExp(r).test(l.textContent)).length, re.source);
  return o;
}

test('shell-quest script mission: Type it for me opens the editor pre-filled; wrong then right; 20 XP once; replay awards nothing', async () => {
  const { ctx, page, errors, waitScreen, xp, lines } = await fakeChapterPage();
  const card = () => page.textContent('#mission');
  assert.match(await card(), /scripts\/hi\.sh/, 'file path shown on the card');
  assert.doesNotMatch(await card(), /Challenge/, 'a script mission is not tagged Challenge');
  await page.click('[data-act="hint"]');
  assert.match(await page.textContent('#hintBox'), /Use nano scripts\/hi\.sh to write it, then run it with bash scripts\/hi\.sh\./);
  assert.equal(await xp(), '0 XP');
  // Type it for me: the editor opens on the mission file, pre-filled with the answer, nothing saved yet
  await page.click('[data-act="fill"]');
  await page.waitForSelector('#editor:not([hidden])');
  assert.equal((await page.textContent('#edTitle')).trim(), '/home/explorer/scripts/hi.sh');
  const fake = await page.evaluate(() => window.SQ.content.chapters.at(-1).missions[0]);
  assert.equal(await page.inputValue('#edText'), fake.answer);
  assert.equal(await page.inputValue('#cmd'), '', 'the terminal input is untouched');
  // a wrong script, Save & run with an argument: output shows, the failing case is explained, no XP
  await page.fill('#edText', fake.wrong[0]);
  await page.fill('#edArgs', 'Ada');
  await page.click('#edRun');
  await waitScreen(/Test 2 \(no name\) failed: expected "Hi nobody", got "Hi "/);
  assert.match(await page.textContent('#screen'), /\$ bash scripts\/hi\.sh Ada\s*Hi Ada/);
  assert.equal(await xp(), '0 XP');
  assert.equal(await lines(/Mission complete/), 0);
  // Type it for me while the editor is open on the mission file puts the answer in (unsaved), instead of doing nothing
  await page.click('[data-act="fill"]');
  assert.equal(await page.inputValue('#edText'), fake.answer);
  assert.equal(await xp(), '0 XP', 'filling does not save');
  await page.click('#edClose');
  assert.equal((await page.textContent('#edClose')).trim(), 'Discard changes?', 'the filled answer counts as an unsaved change');
  // the right script: Save alone completes it, once
  await page.click('#edSave');
  await waitScreen(/Mission complete: Greeter\s+\+20 XP/);
  assert.equal(await xp(), '20 XP');
  assert.equal(await lines(/Test 1 .* failed/), 0, 'no failure line for a correct script');
  assert.equal(await lines(/Test 2 .* failed/), 1, 'the earlier failure line is the only one');
  await page.click('#edRun');
  await waitScreen(/\$ bash scripts\/hi\.sh Ada\s*Hi Ada\s*(\S[\s\S]*)?$/);
  assert.equal(await lines(/Mission complete: Greeter/), 1, 'running a passing script does not re-announce it');
  // the next mission is the challenge, with its tag and file path
  await page.waitForFunction(() => /Counter/.test(document.querySelector('#mission').textContent));
  assert.match(await card(), /Challenge/);
  assert.match(await card(), /scripts\/count\.sh/);
  // replay mission 1: it completes again with no new XP
  await page.click('[data-mi="0"]');
  await page.waitForFunction(() => /done before/.test(document.querySelector('#mission').textContent));
  await page.click('#edSave');
  await page.waitForFunction(() => document.querySelectorAll('#screen .line.win').length >= 2);
  assert.equal(await lines(/Mission complete: Greeter\s+\+20 XP/), 1, 'XP is announced once');
  assert.equal(await xp(), '20 XP');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest challenge mission: custom check wins; Save & run feeds stdin; wrong script explained', async () => {
  const { ctx, page, errors, waitScreen, xp, lines } = await fakeChapterPage();
  const fake = await page.evaluate(() => window.SQ.content.chapters.at(-1).missions);
  await page.click('[data-mi="1"]');
  await page.waitForFunction(() => /Counter/.test(document.querySelector('#mission').textContent));
  assert.match(await page.textContent('#mission'), /Challenge/);
  await page.click('[data-act="fill"]');
  await page.waitForSelector('#editor:not([hidden])');
  assert.equal(await page.inputValue('#edText'), fake[1].answer);
  // echo 2 passes the test case but not the custom check: Save & run gives no completion
  await page.fill('#edText', '#!/bin/bash\necho 2\n');
  await page.click('#editor details summary');
  await page.fill('#edStdin', 'a\nb\n');
  await page.click('#edRun');
  await waitScreen(/\$ bash scripts\/count\.sh\s*\n?\s*2/);
  assert.equal(await lines(/Mission complete/), 0);
  assert.equal(await xp(), '0 XP');
  // a genuinely wrong one explains the failing case
  await page.fill('#edText', fake[1].wrong[1]);
  await page.click('#edRun');
  await waitScreen(/Test 1 \(two lines\) failed: expected "2", got "3"/);
  await page.fill('#edText', fake[1].answer);
  await page.click('#edRun');
  await waitScreen(/Mission complete: Counter\s+\+20 XP/);
  assert.equal(await xp(), '20 XP', 'mission 1 is still open, so no badge yet');
  assert.equal(await lines(/Badge earned/), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest script mission: starter is written once; revisiting the chapter keeps saved work; a deleted file reopens as new', async () => {
  const { ctx, page, errors, type, waitScreen } = await fakeChapterPage();
  const fake = await page.evaluate(() => window.SQ.content.chapters.at(-1).missions[0]);
  const scripts = async () => page.evaluate(k => JSON.parse(localStorage.getItem(k)).fs.children.home.children.explorer.children.scripts.children['hi.sh'], SQ_KEY);
  assert.equal((await scripts()).content, fake.starter);
  await type('echo mine > scripts/hi.sh');
  await waitScreen(/\$ echo mine > scripts\/hi\.sh/);
  const idx = await page.evaluate(() => window.SQ.content.chapters.length - 1);
  await page.click(`[data-ch="${idx}"]`);
  await page.waitForFunction(() => /Greeter/.test(document.querySelector('#mission').textContent));
  assert.equal((await scripts()).content, 'mine');
  await type('rm scripts/hi.sh');
  await page.click('[data-act="fill"]');
  await page.waitForSelector('#editor:not([hidden])');
  assert.equal(await page.getAttribute('#editor', 'data-is-new'), 'true');
  await page.fill('#edText', fake.wrong[1]);
  await page.fill('#edArgs', 'Ada');
  await page.click('#edRun');
  await waitScreen(/Test 1 \(with a name\) failed: expected "Hi Ada", got "Hello Ada"/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest script mission: Save & run on some other file prints no failure line about the mission file', async () => {
  const { ctx, page, errors, type, waitScreen, xp, lines } = await fakeChapterPage();
  await type('nano other.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', '#!/bin/bash\necho other\n');
  await page.click('#edRun');
  await waitScreen(/\$ bash other\.sh\s*other/);
  assert.equal(await lines(/Test \d+ .* failed/), 0, 'no failure line for an unrelated file');
  assert.equal(await lines(/Save your script as/), 0);
  await page.click('#edClose');
  // the mission's own file still explains its failing case
  await page.click('[data-act="fill"]');
  await page.waitForSelector('#editor:not([hidden])');
  const fake = await page.evaluate(() => window.SQ.content.chapters.at(-1).missions[0]);
  await page.fill('#edText', fake.wrong[0]);
  await page.click('#edRun');
  await waitScreen(/Test 2 \(no name\) failed/);
  assert.equal(await xp(), '0 XP');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest capstone: with a leftover backup/, a script that never makes it is refused and Save & run says why; 15.5 asks for a here-document', async () => {
  const { ctx, page, errors, type, waitScreen } = await shellPage({ viewport: { width: 1280, height: 900 } });
  const xp = () => page.evaluate(() => window.SQ.S.xp);
  await page.click('.chap[data-ch="14"]');
  await page.waitForFunction(() => window.SQ.S.ch === 14);
  await page.click('#mission button[data-mi="6"]');
  await type('mkdir -p backup');
  const m = await page.evaluate(() => { const m = window.SQ.content.chapters[14].missions[6]; return { file: m.file, wrong: m.wrong, answer: m.answer }; });
  await type(`nano ${m.file}`);
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', m.wrong[1]);
  await page.fill('#edArgs', 'docs');
  await page.click('#edRun');
  await waitScreen(/Test 1 \(docs, in a world with no backup\/ yet\) failed/);
  assert.equal(await xp(), 0);
  await page.fill('#edText', m.answer);
  await page.click('#edRun');
  await waitScreen(/Mission complete: Capstone: backup script/);
  await page.click('#edClose');
  await page.click('#mission button[data-mi="4"]');
  await type('nano scripts/mkconf.sh');
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', '#!/bin/bash\necho name=quest > app.conf\necho mode=fast >> app.conf\n');
  await page.click('#edRun');
  await waitScreen(/write it with a here-document/);
  assert.equal(await page.evaluate(() => !!window.SQ.S.done['14.4']), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest editor: a Save is judged on its own, not on the line typed before it (13.1 is not completed by a Save)', async () => {
  const { ctx, page, errors, type, waitScreen } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await type('nano notes.sh');
  await page.waitForSelector('#editor:not([hidden])');
  const answer = await page.evaluate(() => window.SQ.content.chapters[12].missions[0].answer);
  await type(answer); // typed while chapter 1 is the current one: nothing to complete there
  await page.waitForFunction(() => window.SQ.rt.lastOut === '1\n2\n3');
  await page.click('.chap[data-ch="12"]');
  await page.waitForFunction(() => window.SQ.S.ch === 12 && window.SQ.S.mi === 0);
  await page.fill('#edText', '#!/bin/bash\necho note\n');
  await page.click('#edSave');
  await waitScreen(/Saved notes\.sh/);
  assert.equal(await page.evaluate(() => !!window.SQ.S.done['12.0']), false, 'the Save did not replay the earlier line');
  await type(answer);
  await waitScreen(/Mission complete/);
  assert.equal(await page.evaluate(() => !!window.SQ.S.done['12.0']), true, 'typing it now completes it');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest: Reset world also forgets functions and the last exit status', async () => {
  const { ctx, page, errors, type, waitScreen } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await type('hi() { echo hello-fn; }; X=1; export X');
  await type('false');
  assert.equal(await page.evaluate(() => [!!(window.SQ.S.fns && window.SQ.S.fns.hi), window.SQ.S.last]).then(JSON.stringify), JSON.stringify([true, 1]));
  await page.click('#resetWorld');
  await page.click('#resetWorld');
  await waitScreen(/World reset to its starting state/);
  assert.deepEqual(await page.evaluate(() => [window.SQ.S.fns === undefined, window.SQ.S.last, JSON.stringify(window.SQ.S.vars), window.SQ.S.exp === undefined]), [true, 0, '{}', true]);
  assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).fns, SQ_KEY), undefined, 'the saved game has no functions either');
  await type('hi');
  await waitScreen(/bash: hi: command not found/);
  assert.deepEqual(errors, []);
  await ctx.close();
});
