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
const NAMES = ['script', 'python', 'cpp', 'shell', 'harbor', 'ds', 'net'];
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
  // Lay out in the fallback fonts: the web fonts may not load for a learner, and a test must not need the network.
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
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
// false when the page fits its width; otherwise the innermost elements past the right edge, so a failure names the culprit.
const overflow = page => page.evaluate(() => {
  if (document.documentElement.scrollWidth <= innerWidth) return false;
  const boxPast = e => e.getBoundingClientRect().right > innerWidth + 0.5;
  // Text can spill out of a box that fits, so measure the content's right edge (scrollWidth), not only the box.
  const right = e => { const r = e.getBoundingClientRect(); return getComputedStyle(e).overflowX === 'visible' ? r.left + Math.max(r.width, e.scrollWidth) : r.right; };
  const past = e => right(e) > innerWidth + 0.5;
  // Content inside a scroller or clipper that itself fits does not widen the page.
  const clipped = e => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement)
    if (getComputedStyle(a).overflowX !== 'visible' && !boxPast(a)) return true; return false; };
  const tag = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].map(c => '.' + c).join('');
  const hits = [...document.querySelectorAll('body *')].filter(e => past(e) && !clipped(e) && ![...e.children].some(c => past(c) && !clipped(c)));
  return `scrollWidth ${document.documentElement.scrollWidth} > ${innerWidth}: ` +
    (hits.slice(0, 5).map(e => `${tag(e)} (right ${Math.round(right(e))})`).join(', ') || 'no element past the edge');
});
const read = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
// How many tier headers the shell-quest rail should draw: one per tier that has chapters (Stage 3 Task 17: 3 until the Expert chapters land, then 4).
const railTiers = page => page.evaluate(() => window.SQ.tiers.status({}).filter(s => s.chapters.length).length);

test('landing page links to every playground', async () => {
  const { ctx, page, errors } = await open(base + '/');
  const hrefs = await page.$$eval('a.card', a => a.map(x => x.getAttribute('href')));
  assert.deepEqual(hrefs.sort(), [...NAMES.map(n => `${n}-quest/`), 'math-quest/'].sort());
  for (const h of hrefs) {
    const r = await page.request.get(`${base}/${h}`);
    assert.equal(r.status(), 200, h);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('landing page links to GitHub and the feature request form', async () => {
  const { ctx, page, errors } = await open(base + '/');
  const hrefs = await page.$$eval('a.btn', a => a.map(x => x.getAttribute('href')));
  assert.deepEqual(hrefs, [
    'https://github.com/shimoncohen/playgrounds',
    'https://github.com/shimoncohen/playgrounds/issues/new?template=feature-request.yml',
  ]);
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

test('landing page sums Math Quest XP', async () => {
  const { ctx, page } = await open(base + '/');
  await page.evaluate(() => {
    localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 10 }));
    localStorage.setItem('math-algebra-v1', JSON.stringify({ xp: 15 }));
  });
  await page.reload();
  assert.match(await page.textContent('a[href="math-quest/"] .xp'), /25 XP/);
  await ctx.close();
});

test('math hub loads cleanly', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('.tcard');
  assert.equal((await page.$$('.tcard')).length, 3);
  assert.match(await page.textContent('#next'), /Order of operations/);
  assert.ok(await page.isVisible('#mapList ol'), 'list hidden on a phone');
  assert.equal((await page.$$('#mapList ol')).length, 3);
  assert.deepEqual(await page.$$eval('#mapList ol:last-of-type li', l => l.length), 2);
  assert.match(await page.textContent('#mapList ol:last-of-type li .needs'), /Needs first: Order of operations \(Arithmetic\)/);
  assert.ok(!(await page.isVisible('svg.map')), 'map shown on a phone');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.ok(await page.isVisible('svg.map'), 'map hidden on desktop');
  assert.ok(await page.$eval('#mapList', e => e.getBoundingClientRect().width <= 1), 'list visible on desktop');
  await page.click('.tcard button');
  assert.ok(await page.isVisible('#trackView svg.map'), 'track view missing');
  assert.deepEqual(errors, []);
  await ctx.close();
});

const PAGES = [...NAMES.map(n => `${n}-quest/`), 'math-quest/arithmetic/', 'math-quest/algebra/', 'math-quest/geometry/'];
// A Math Quest track saves under math-<track>-v1, so its progress file is named math-<track>, not after its folder.
const appOf = pg => pg.startsWith('math-quest/') ? 'math-' + pg.split('/')[1] : pg.slice(0, -1);
for (const pg of PAGES) {
  const app = appOf(pg), name = app.replace(/-quest$/, '');
  test(`${app} loads cleanly`, async () => {
    const { ctx, page, errors } = await open(`${base}/${pg}`);
    await page.waitForSelector('#mission');
    assert.ok((await page.textContent('#mission')).trim().length > 20, 'mission card is empty');
    assert.ok(await page.$('.pg-trigger'), 'Progress button missing');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${app} shows only the selected tab`, async () => {
    const { ctx, page, errors } = await open(`${base}/${pg}`, { viewport: { width: 1280, height: 800 } });
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

  test(`${app} side sections scroll on their own on a wide screen`, async () => {
    const { ctx, page, errors } = await open(`${base}/${pg}`, { viewport: { width: 1440, height: 800 } });
    await page.waitForSelector('#mission');
    const r = await page.evaluate(() => {
      const c = document.getElementById('chapters'), m = document.querySelector('.mapCol .panel');
      return { chapY: getComputedStyle(c).overflowY, chapH: c.clientHeight, mapY: getComputedStyle(m).overflowY, mapMax: parseFloat(getComputedStyle(m).maxHeight) };
    });
    assert.equal(r.chapY, 'auto');
    assert.ok(r.chapH <= 420, `chapter list is ${r.chapH}px tall`);
    assert.equal(r.mapY, 'auto');
    assert.ok(r.mapMax <= 800, `map panel max-height is ${r.mapMax}px`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${app} mission column fits the screen on desktop and stays plain on a phone`, async () => {
    for (const [w, h] of [[1440, 800], [1000, 700]]) {
      const { ctx, page, errors } = await open(`${base}/${pg}`, { viewport: { width: w, height: h } });
      await page.waitForSelector('#mission');
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => { const c = document.querySelector('.missionCol'); return { pos: getComputedStyle(c).position, colY: getComputedStyle(c).overflowY, cardY: getComputedStyle(document.getElementById('mission')).overflowY, bottom: c.getBoundingClientRect().bottom }; });
      assert.equal(r.pos, 'sticky', `${w}x${h}`);
      assert.equal(r.colY, 'visible', 'the column itself has no scrollbar');
      assert.equal(r.cardY, 'auto', 'the mission card scrolls on its own');
      assert.ok(r.bottom <= h, `column ends at ${r.bottom}px in a ${h}px window`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    const { ctx, page, errors } = await open(`${base}/${pg}`, { viewport: { width: 390, height: 800 } });
    await page.waitForSelector('#mission');
    const m = await page.evaluate(() => ({ pos: getComputedStyle(document.querySelector('.missionCol')).position, over: document.documentElement.scrollWidth > innerWidth }));
    assert.equal(m.pos, 'static');
    assert.equal(m.over, false);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${app} links back to the landing page and to the feature request form`, async () => {
    const { ctx, page, errors } = await open(`${base}/${pg}`);
    await page.waitForSelector('#mission');
    const idea = await page.getAttribute('footer.nv-foot a.nv-idea', 'href');
    assert.equal(idea, 'https://github.com/shimoncohen/playgrounds/issues/new?template=feature-request.yml');
    await page.click('header.top a.nv-home');
    await page.waitForSelector('a.card');
    assert.equal(new URL(page.url()).pathname, '/');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${app} progress survives export, wipe and import`, async () => {
    const key = `${app}-v1`;
    const { ctx, page, errors } = await open(`${base}/${pg}`);
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
    const file = path.join(tmp, `${app}.json`);
    await dl.saveAs(file);
    assert.equal(dl.suggestedFilename(), `${app}-progress.json`);
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(exported.app, app);
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

test('math hub links open the track pages', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/`);
  await page.waitForSelector('.tcard');
  const hrefs = await page.$$eval('.tcard a', a => a.map(x => x.getAttribute('href')));
  assert.deepEqual(hrefs, ['arithmetic/', 'algebra/', 'geometry/']);
  for (const h of hrefs) assert.equal((await page.request.get(`${base}/math-quest/${h}`)).status(), 200, h);
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const track of ['arithmetic', 'algebra', 'geometry']) {
  test(`math-${track}: at 1440px the header is one row and its Math Quest link goes to the hub`, async () => {
    const { ctx, page, errors } = await open(`${base}/math-quest/${track}/`, { viewport: { width: 1440, height: 900 } });
    await page.waitForSelector('header .pg-wrap');
    const tops = await page.$$eval('header.top > *', els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    assert.ok(Math.max(...tops) - Math.min(...tops) < 20, `header items share one row: ${tops}`);
    await page.click('header .brand a');
    await page.waitForURL(u => new URL(u).pathname === '/math-quest/');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('math-algebra suggests Order of operations until it is done, and the link opens that chapter', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/algebra/`);
  const hint = () => page.textContent('#mission .prereq');
  await page.waitForSelector('#mission .prereq');
  assert.match(await hint(), /Suggested first: Order of operations \(Arithmetic\), not done yet/);
  assert.match(await hint(), /you evaluate expressions with the order of operations/);
  await page.evaluate(() => localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 75, done: {}, badges: { 0: true } })));
  await page.reload();
  await page.waitForSelector('#mission .prereq');
  assert.match(await hint(), /^Ready/);
  await page.evaluate(() => localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 10, ch: 0, mi: 4, done: { '0.0': true }, badges: {} })));
  await page.reload();
  await page.click('#mission .prereq a');
  await page.waitForURL(/\/math-quest\/arithmetic\//);
  await page.waitForSelector('#mission');
  const u = new URL(page.url());
  assert.equal(u.pathname + u.hash, '/math-quest/arithmetic/#ch=arithmetic.order');
  assert.match(await page.textContent('#chapters [aria-current="true"]'), /Order of operations/);
  assert.match(await page.textContent('#mission'), /Mission 2 of 5/, 'opens the first open mission of the chapter');
  await page.goto(`${base}/math-quest/arithmetic/#guide`);
  await page.waitForSelector('#guide .card');
  assert.ok(await page.isVisible('#tab-guide') && !(await page.isVisible('#tab-quest')), '#guide opens the field guide');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-arithmetic: the working area passes a mission once, keeps the working, and a scene mission passes from its sliders', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/arithmetic/`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
  await page.waitForSelector('#work input.mq-field');
  await page.click('#work input.mq-field');
  await page.keyboard.type('10*3');
  await page.keyboard.press('Enter');
  await page.keyboard.type('30');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#feedback .msg.win');
  assert.match(await page.textContent('#feedback'), /Mission complete! \+10 XP/);
  await until(async () => JSON.parse(await read(page, 'math-arithmetic-v1') || '{}').xp === 10);
  const s = JSON.parse(await read(page, 'math-arithmetic-v1'));
  assert.deepEqual(s.work['0.0'], ['10*3', '30']);
  await page.reload();
  await page.waitForSelector('#feedback .msg.win');
  assert.match(await page.textContent('#feedback'), /You solved this one before/);
  assert.deepEqual(await page.$$eval('#work input.mq-field', f => f.map(x => x.value).filter(Boolean)), ['10*3', '30']);
  assert.match(await page.textContent('#xpText'), /^10 XP/);
  await page.click('#mission .dot[data-mi="4"]');
  await page.waitForSelector('#work', { state: 'hidden' });
  await page.fill('#scene input[type=number][aria-label="c value"]', '1');
  await page.dispatchEvent('#scene input[type=number][aria-label="c value"]', 'input');
  await page.waitForSelector('#feedback .msg.win');
  assert.match(await page.textContent('#xpText'), /^20 XP/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-geometry: Area suggests Order of operations and links to it; Angles needs nothing first', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/geometry/`);
  const hint = () => page.textContent('#mission .prereq');
  await page.waitForSelector('#mission .prereq');
  assert.match(await hint(), /Suggested first: Order of operations \(Arithmetic\), not done yet/);
  assert.match(await hint(), /area formulas such as ½ × b × h are worked out with the order of operations/);
  await page.click('#chapters [data-ch="1"]');
  await until(async () => /^Ready: this chapter needs nothing first/.test(await hint()));
  await page.click('#chapters [data-ch="0"]');
  await until(async () => /Suggested first/.test(await hint()));
  await page.click('#mission .prereq a');
  await page.waitForURL(/\/math-quest\/arithmetic\//);
  const u = new URL(page.url());
  assert.equal(u.pathname + u.hash, '/math-quest/arithmetic/#ch=arithmetic.order');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-geometry: text mode passes an area mission, and an angle answer with a degree sign', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/geometry/`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
  await page.waitForSelector('#work input.mq-field');
  await page.click('#work input.mq-field');
  await page.keyboard.type('12*7');
  await page.keyboard.press('Enter');
  await page.keyboard.type('84');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#feedback .msg.win');
  assert.match(await page.textContent('#feedback'), /Mission complete! \+10 XP/);
  await until(async () => JSON.parse(await read(page, 'math-geometry-v1') || '{}').xp === 10);
  assert.deepEqual(JSON.parse(await read(page, 'math-geometry-v1')).work['0.0'], ['12*7', '84']);

  await page.goto(`${base}/math-quest/geometry/#ch=geometry.angles`);
  await page.waitForSelector('#work input.mq-field');
  assert.match(await page.textContent('#mission h2'), /On a straight line/);
  await page.click('#work input.mq-field');
  await page.keyboard.type('180°-47°');
  await page.keyboard.press('Enter');
  await page.keyboard.type('133°');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#feedback .msg.win');
  assert.deepEqual(await page.$$eval('#work .mq-mark', m => m.map(x => x.textContent).filter(Boolean)), ['✓', '✓']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-arithmetic: #ch=arithmetic.fractions opens Fractions, and its first mission passes on a simplest-form fraction', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/arithmetic/#ch=arithmetic.fractions`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
  await page.waitForSelector('#work input.mq-field');
  assert.match(await page.textContent('#chapters [aria-current="true"]'), /Fractions/);
  assert.match(await page.textContent('#mission'), /1\/4 \+ 1\/3/);
  await page.click('#work input.mq-field');
  await page.keyboard.type('3/12+4/12');
  await page.keyboard.press('Enter');
  await page.keyboard.type('14/24');
  await page.keyboard.press('Tab');
  assert.equal(await page.isVisible('#feedback .msg.win'), false, 'an unsimplified fraction does not pass');
  await page.fill('#work .mq-step:nth-child(2) .mq-field', '7/12');
  await page.press('#work .mq-step:nth-child(2) .mq-field', 'Enter');
  await page.waitForSelector('#feedback .msg.win');
  await until(async () => JSON.parse(await read(page, 'math-arithmetic-v1') || '{}').xp === 10);
  assert.deepEqual(JSON.parse(await read(page, 'math-arithmetic-v1')).work['2.0'], ['3/12+4/12', '7/12']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-arithmetic: each mission opens its picture on its own numbers', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/arithmetic/`);
  const live = () => page.textContent('#scene .mq-live');
  const go = async (ch, mi) => {
    await page.evaluate(([c, m]) => localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 0, ch: c, mi: m, done: {}, badges: {} })), [ch, mi]);
    await page.reload();
    await page.waitForSelector('#scene .mq-live');
  };
  await go(0, 0);
  assert.match(await live(), /Step 0: {2}6 \+ 4 × 3 {3}and {3}\(6 \+ 4\) × 3/);
  await go(0, 1);
  assert.match(await live(), /12 cut into 2 equal parts, then 3 of those parts/);
  await go(0, 4);
  assert.match(await live(), /Step 0: {2}2 \+ 3 × 4/, 'a scene mission keeps the chapter picture');
  await go(1, 1);
  assert.match(await live(), /\(−4\) × \(−2\): 4 across, 2 up/);
  await go(2, 1);
  assert.match(await live(), /2\/3 × 4\/5: 2 of 3 columns and 4 of 5 rows/);
  await go(3, 0);
  assert.match(await live(), /2³: 3 copies of 2 multiplied/);
  await go(4, 3);
  assert.match(await live(), /40 grown by 25%/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-geometry: scene points move with the arrow keys and a pointer, and the live area and angles follow', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/geometry/`);
  const live = () => page.textContent('#scene .mq-live');
  await page.waitForSelector('#scene .mq-live');
  assert.ok((await page.$$('#scene .grid line')).length > 10, 'the area scene has a grid');
  assert.equal(await live(), 'Base b = 12, height h = 7.', 'the first mission opens on its own 12 by 7 floor, without the area it asks for');
  const corner = '#scene circle.drag[aria-label="top right corner of the rectangle"]';
  await page.focus(corner);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await live(), 'Base b = 11, height h = 7.');
  await page.keyboard.press('ArrowDown');
  assert.equal(await live(), 'Base b = 11, height h = 6.');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'top right corner of the rectangle', 'focus survives the redraw');
  await page.click('#mission .dot[data-mi="2"]');
  await page.waitForFunction(() => /10 × 8/.test(document.querySelector('#scene .mq-live').textContent));
  assert.equal(await live(), 'Whole rectangle 10 × 8. Dashed corner cut off: 4 × 3.', 'the L-shaped room has its own picture');

  await page.goto(`${base}/math-quest/geometry/#ch=geometry.angles`);
  await page.click('#mission .dot[data-mi="4"]');
  await page.waitForSelector('#work', { state: 'hidden' });
  assert.equal(await live(), '40° + 70° + 70° = 180°');
  const first = '#scene circle.drag[aria-label="first ray"]', second = '#scene circle.drag[aria-label="second ray"]';
  await page.focus(first);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await live(), '50° + 60° + 70° = 180°');
  assert.equal(await page.getAttribute(first, 'aria-valuetext'), '50°');
  const box = await page.locator('#scene svg').boundingBox(), dot = await page.locator(first).boundingBox();
  const screen = (x, y) => [box.x + (x + 5.5) / 11 * box.width, box.y + (5.5 - y) / 6.5 * box.height];
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
  await page.mouse.down();
  await page.mouse.move(...screen(4 * Math.cos(Math.PI / 3), 4 * Math.sin(Math.PI / 3)), { steps: 5 });
  await page.mouse.up();
  assert.equal(await live(), '60° + 50° + 70° = 180°');
  await page.focus(second);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await live(), '60° + 60° + 60° = 180°');
  await page.waitForSelector('#feedback .msg.win');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-geometry: each angle mission opens on its own picture and numbers', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/geometry/#ch=geometry.angles`);
  const live = () => page.textContent('#scene .mq-live');
  await page.waitForSelector('#scene .mq-live');
  assert.equal(await live(), '47° + x = 180°');
  const want = [[1, '110° + 95° + 80° + x = 360°'], [2, '58° + 71° + x = 180°'], [3, 'The two opposite angles of 60° are 120° together. Aim for 76°.']];
  for (const [i, text] of want) {
    await page.click(`#mission .dot[data-mi="${i}"]`);
    await page.waitForFunction(t => document.querySelector('#scene .mq-live').textContent === t, text);
  }
  await page.focus('#scene circle.drag[aria-label="angle between the lines"]');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await live(), 'The two opposite angles of 61° are 122° together. Aim for 76°.');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-geometry: Pythagoras passes a rounded mission in text mode, and a leg moves the live sum', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/geometry/#ch=geometry.pythagoras`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
  await page.waitForSelector('#work input.mq-field');
  const live = () => page.textContent('#scene .mq-live');
  assert.equal(await live(), 'a² = 9, b² = 16, c² = ?');
  const leg = '#scene circle.drag[aria-label="leg a"]';
  await page.focus(leg);
  await page.keyboard.press('ArrowRight');
  assert.equal(await live(), 'a² = 16, b² = 16, c² = ?');
  await page.click('#mission .dot[data-mi="2"]');
  await page.waitForFunction(() => /^5² \+ 8²/.test(document.querySelector('#scene .mq-live').textContent));
  assert.equal(await live(), '5² + 8² = 25 + 64 = 89, so c = √89 ≈ 9.43. Aim for c = 13.', 'the missing-leg mission opens on the 5 leg and the 13 to reach');
  await page.click('#mission .dot[data-mi="3"]');
  await page.waitForSelector('#work input.mq-field');
  assert.match(await page.textContent('#mission h2'), /Not a whole number/);
  assert.equal(await live(), 'a² = 25, b² = 49, c² = ?');
  await page.click('#work input.mq-field');
  await page.keyboard.type('sqrt(5^2+7^2)');
  await page.keyboard.press('Enter');
  await page.keyboard.type('8.6');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#feedback .msg.win');
  assert.deepEqual(await page.$$eval('#work .mq-mark', m => m.map(x => x.textContent).filter(Boolean)), ['✓', '✓']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-geometry: Circles passes a rounded mission in text mode, and the radius moves the live values', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/geometry/#ch=geometry.circles`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
  await page.waitForSelector('#work input.mq-field');
  const live = () => page.textContent('#scene .mq-live');
  assert.equal(await live(), 'Radius r = 5, diameter d = 10.', 'the first mission opens on its pond, radius 5, without the circumference it asks for');
  await page.focus('#scene circle.drag[aria-label="radius r"]');
  await page.keyboard.press('ArrowRight');
  assert.equal(await live(), 'Radius r = 5.5, diameter d = 11.');
  await page.click('#mission .dot[data-mi="2"]');
  await page.waitForFunction(() => document.querySelector('#scene .mq-live').textContent === 'Diameter d = 14.');
  await page.click('#mission .dot[data-mi="3"]');
  await page.waitForFunction(() => /length you need is 30/.test(document.querySelector('#scene .mq-live').textContent));
  assert.equal(await live(), 'r = 3, C = 2 × π × 3 ≈ 18.85. The length you need is 30.');
  await page.click('#mission .dot[data-mi="0"]');
  await page.waitForSelector('#work input.mq-field');
  await page.click('#work input.mq-field');
  await page.keyboard.type('2*pi*5');
  await page.keyboard.press('Enter');
  await page.keyboard.type('31.4');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#feedback .msg.win');
  assert.deepEqual(await page.$$eval('#work .mq-mark', m => m.map(x => x.textContent).filter(Boolean)), ['✓', '✓']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-algebra: a linear equation needs its working in text mode, and passes once a step comes before x = 4', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/algebra/#ch=algebra.linear`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
  await page.waitForSelector('#work input.mq-field');
  assert.match(await page.textContent('#mission h2'), /Undo the steps/);
  await page.click('#work input.mq-field');
  await page.keyboard.type('x=4');
  await page.keyboard.press('Enter');
  await until(async () => /at least one step before it/.test(await page.textContent('#work .mq-result')));
  assert.equal(await page.locator('#feedback .msg.win').count(), 0, 'the answer alone does not pass');
  await page.fill('#work input.mq-field >> nth=0', '2x=8');
  await page.click('#work input.mq-field >> nth=1');
  await page.keyboard.type('x=4');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#feedback .msg.win');
  assert.deepEqual(await page.$$eval('#work .mq-step.ok', ls => ls.length), 2);
  await until(async () => JSON.parse(await read(page, 'math-algebra-v1') || '{}').xp === 10);
  assert.deepEqual(JSON.parse(await read(page, 'math-algebra-v1')).work['2.0'], ['2x=8', 'x=4']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-algebra: missions open their scene on their own numbers', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/algebra/`);
  const live = () => page.textContent('#scene .mq-live');
  const at = async (ch, mi) => {
    await page.goto(`${base}/math-quest/algebra/#ch=algebra.${ch}`);
    await page.click(`#mission .dot[data-mi="${mi}"]`);
    return live();
  };
  assert.match(await at('expressions', 0), /V = 10·5·3 = 150/);
  assert.match(await at('expressions', 4), /2a \+ 3a = 4 \+ 6 = 10/);
  assert.match(await at('expanding', 0), /3 × 5 = 9 \+ 6 = 15/);
  assert.match(await at('expanding', 1), /x = 7: 2 × 3 = 6$/);
  assert.match(await at('expanding', 3), /\(3 \+ 2\)\(3 \+ 2\) = 9 \+ 6 \+ 6 \+ 4 = 25/);
  assert.match(await at('factoring', 0), /k = 1: 6 x-pieces and 9 units both split into 1 equal row/);
  await page.fill('#scene input[type=range]', '2');
  assert.match(await live(), /k = 2: 9 units do not split into 2 equal rows/);
  await page.fill('#scene input[type=range]', '3');
  assert.match(await live(), /k = 3: 6 x-pieces and 9 units both split into 3 equal rows/);
  assert.match(await at('factoring', 2), /x = 6: 36 − 9 = 27$/);
  assert.match(await at('factoring', 3), /25 − 10 − 10 \+ 4 = 9$/);
  assert.match(await at('quadratics', 1), /y = x² − 16: it crosses the x-axis at x = −4 and x = 4/);
  assert.match(await at('quadratics', 2), /y = x² − 3x: it crosses the x-axis at x = 0 and x = 3/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-algebra: Linear equations suggests Fractions (Arithmetic) until its badge is earned', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/algebra/#ch=algebra.linear`);
  const hint = () => page.textContent('#mission .prereq');
  await page.waitForSelector('#mission .prereq');
  assert.match(await hint(), /Suggested first: Expanding brackets \(Algebra\), Fractions \(Arithmetic\), not done yet/);
  assert.match(await hint(), /many answers are fractions/);
  assert.equal(await page.getAttribute('#mission .prereq a >> text=Fractions', 'href'), '../arithmetic/#ch=arithmetic.fractions');
  await page.evaluate(() => localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 0, done: {}, badges: { 2: true } })));
  await page.reload();
  await page.waitForSelector('#mission .prereq');
  assert.match(await hint(), /Suggested first: Expanding brackets \(Algebra\), not done yet/);
  assert.doesNotMatch(await hint(), /Fractions/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-arithmetic: the quick-fire answer field opens a keyboard with a minus sign', async () => {
  const done = Object.fromEntries([0, 1, 2, 3, 4].map(i => [`1.${i}`, true]));
  const { ctx, page, errors } = await open(`${base}/math-quest/arithmetic/#fire`, {}, c => c.addInitScript(d => localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 50, done: d, badges: {} })), done));
  await page.click('#fStart');
  await page.waitForSelector('#fAns');
  // Phone number pads (inputmode=numeric) have no minus key, and Negative numbers asks for negative answers.
  assert.notEqual(await page.getAttribute('#fAns', 'inputmode'), 'numeric');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-arithmetic: Powers and roots suggests Negative numbers until it is done', async () => {
  const { ctx, page, errors } = await open(`${base}/math-quest/arithmetic/#ch=arithmetic.powers`);
  await page.waitForSelector('#mission .prereq');
  assert.match(await page.textContent('#mission .prereq'), /Suggested first: Negative numbers \(Arithmetic\), not done yet/);
  assert.match(await page.textContent('#mission .prereq'), /\(−2\)² and −2² part ways/);
  assert.equal(await page.getAttribute('#mission .prereq a', 'href'), '#ch=arithmetic.negatives');
  assert.deepEqual(errors, []);
  await ctx.close();
  // The page saves its own state as it unloads, so the finished save is set before the next page loads.
  const done = await open(`${base}/math-quest/arithmetic/#ch=arithmetic.powers`, {}, c => c.addInitScript(() => localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 75, done: {}, badges: { 0: true, 1: true } }))));
  await done.page.waitForSelector('#mission .prereq');
  assert.match(await done.page.textContent('#mission .prereq'), /^Ready/);
  assert.deepEqual(done.errors, []);
  await done.ctx.close();
});

test('a notes-only save counts as progress: it is exported and restored from the linked file', async () => {
  const key = 'python-quest-v1';
  const { ctx, page, errors } = await open(`${base}/python-quest/`);
  await ctx.addInitScript(() => {
    const h = async () => (await navigator.storage.getDirectory()).getFileHandle('notes.json', { create: true });
    window.showSaveFilePicker = h;
    window.showOpenFilePicker = async () => [await h()];
  });
  await page.evaluate(k => {
    Storage.prototype.setItem.call(localStorage, k, JSON.stringify({ xp: 0, done: {}, notes: { 0: 'hello' } }));
    Storage.prototype.setItem = () => {};
  }, key);
  await page.reload();
  await page.waitForSelector('#mission');
  await page.click('.pg-trigger');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Export to file')]);
  const file = path.join(tmp, 'notes-only.json');
  await dl.saveAs(file);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).data.notes[0], 'hello');

  await page.click('.pg-trigger');
  await page.click('text=Create save file');
  await page.waitForSelector('.pg-state.pg-ok');
  // A fresh page writes its empty state on load; the linked file must still win, because notes are progress.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await until(async () => {
    try { return /hello/.test(await read(page, key) || ''); }
    catch (e) { if (/context was destroyed|navigation/i.test(e.message)) return false; throw e; }
  });
  await page.waitForLoadState('load');
  assert.deepEqual(errors, []);
  await ctx.close();
});

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
  assert.equal(await page.locator('.tierhead').count(), await railTiers(page));
  const heads = () => page.$$eval('.tierhead', hs => hs.map(h => h.textContent.replace(/\s+/g, ' ').trim()));
  assert.equal(await page.locator('.tierhead').count(), 4);
  let [head, ihead, ahead, xhead] = await heads();
  assert.match(head, /^Beginner/);
  assert.match(head, /0\/7/);
  assert.doesNotMatch(head, /★/);
  assert.match(ihead, /^Intermediate/);
  assert.match(ihead, /0\/4/);
  assert.doesNotMatch(ihead, /★/);
  assert.match(ahead, /^Advanced/);
  assert.match(ahead, /0\/4/);
  assert.doesNotMatch(ahead, /★/);
  assert.match(xhead, /^Expert.*0\/4/);
  assert.doesNotMatch(xhead, /★/);
  const before = (await page.textContent('#mission')).replace(/\s+/g, ' ');
  await page.click('.chap[data-ch="7"]');
  await page.waitForFunction(() => /Pick a column/.test(document.querySelector('#mission').textContent));
  assert.notEqual((await page.textContent('#mission')).replace(/\s+/g, ' '), before);
  assert.equal(await page.getAttribute('.chap[data-ch="7"]', 'aria-current'), 'true');
  await page.click('.pg-trigger');
  await Promise.all([page.waitForNavigation(), page.setInputFiles('.pg-file', path.join(ROOT, 'tests/fixtures/shell-progress-beginner-complete.json'))]);
  await page.waitForSelector('#mission');
  [head, ihead, ahead, xhead] = await heads();
  assert.match(head, /7\/7/);
  assert.match(head, /★/);
  assert.match(ihead, /0\/4/);
  assert.doesNotMatch(ihead, /★/);
  // a Stage 1 save knows nothing of Advanced: the new tier just starts empty
  assert.match(ahead, /^Advanced/);
  assert.match(ahead, /0\/4/);
  assert.doesNotMatch(ahead, /★/);
  assert.match(xhead, /^Expert.*0\/4/);
  assert.doesNotMatch(xhead, /★/);
  assert.deepEqual(await page.$$eval('.tierhead', hs => hs.map(h => h.classList.contains('complete'))), [true, false, false, false]);
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
  assert.equal(heads.length, 4);
  assert.match(heads[3], /^Expert.*0\/4/);
  assert.doesNotMatch(heads[3], /★/);
  assert.deepEqual(await page.$$eval('.tierhead', hs => hs.map(h => h.classList.contains('complete'))), [true, true, false, false]);
  assert.deepEqual(await page.$$eval('.chap[data-ch="8"] .ct, .chap[data-ch="10"] .ct', es => es.map(e => e.textContent)), ['8/8', '7/7']);
  assert.equal(xp, 1230);
  assert.equal((await page.textContent('#xpText')).trim(), '1230 XP');
  assert.equal((await page.textContent('#rank')).trim(), 'Script Smith');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest: a save with chapters 1 to 15 badged shows three complete tiers, a star on each, an Expert tier still open, and the rank Automator', async () => {
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
  assert.equal(heads.length, 4);
  assert.deepEqual(await page.$$eval('.tierhead', hs => hs.map(h => h.classList.contains('complete'))), [true, true, true, false]);
  assert.match(heads[0], /^Beginner.*7\/7.*★/);
  assert.match(heads[1], /^Intermediate.*4\/4.*★/);
  assert.match(heads[2], /^Advanced.*4\/4.*★/);
  const expertChapters = await page.evaluate(() => window.SQ.content.chapters.filter(c => c.tier === 'expert').length);
  assert.equal(expertChapters, 4);
  assert.match(heads[3], /^Expert.*0\/4/);
  assert.doesNotMatch(heads[3], /★/);
  assert.equal(await page.locator('.chap.earned').count(), 15);
  assert.equal((await page.textContent('#xpText')).trim(), '1890 XP');
  assert.equal((await page.textContent('#rank')).trim(), 'Automator');
  // chapter 15 is no longer the last chapter: its card shows the badge, and the next chapter is the first Expert one
  assert.match(await page.textContent('#mission h2'), /Badge earned: Scripter/);
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
  assert.equal(await page.locator('.tierhead').count(), await railTiers(page));
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

test('shell-quest: a finished mission is not celebrated again, and a typo never completes one', async () => {
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#cmd');
  const type = async line => { await page.fill('#cmd', line); await page.press('#cmd', 'Enter'); };
  const wins = () => page.$$eval('#screen .win', els => els.map(e => e.textContent));
  const xp = async () => (await page.textContent('#xpText')).trim();
  // chapter 5 (Pipes): "Count each name" is mission 4
  await page.click('.chap[data-ch="4"]');
  await page.click('#mission .dot[data-mi="3"]');
  const title = (await page.textContent('#mission h2')).trim();
  assert.equal(title, 'Count each name');
  // the reported screenshot: a capital S is "command not found", and must not complete the mission
  await type('Sort village/people.txt | uniq -c');
  assert.deepEqual(await wins(), []);
  assert.equal((await page.$$eval('#mission .dot.done', els => els.length)), 0);
  await type('sort village/people.txt | uniq -c');
  assert.equal((await wins()).length, 1);
  const xpDone = await xp();
  // go back to the finished mission and repeat it, with the right command and with the typo
  await page.click('#mission .dot[data-mi="3"]');
  await type('sort village/people.txt | uniq -c');
  await type('Sort village/people.txt | uniq -c');
  assert.equal((await wins()).length, 1, 'no second "Mission complete" line');
  assert.equal(await xp(), xpDone);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('harbor-quest: a finished mission is not celebrated again when it is revisited', async () => {
  const { ctx, page, errors } = await open(`${base}/harbor-quest/`);
  await page.waitForSelector('#cmd');
  const type = async line => { await page.fill('#cmd', line); await page.press('#cmd', 'Enter'); };
  const wins = () => page.$$eval('#screen .win', els => els.map(e => e.textContent));
  const ans = await page.evaluate(() => { const b = document.querySelector('#mission [data-act="show"]'); return b ? true : false; });
  assert.ok(ans, 'the first mission offers its answer');
  await page.click('#mission [data-act="show"]');
  const line = await page.inputValue('#cmd');
  await type(line);
  assert.equal((await wins()).length, 1);
  await page.click('#mission .dot[data-mi="0"]');
  await type(line);
  assert.equal((await wins()).length, 1, 'no second "Mission complete" line');
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
  assert.deepEqual(await page.$$eval('#guide h3[data-tier]', hs => hs.map(h => h.dataset.tier)), ['beginner', 'intermediate', 'advanced', 'expert']);
  assert.deepEqual(await page.$$eval('#guide .gfilter button', bs => bs.map(b => b.textContent.trim())), ['All', 'Beginner', 'Intermediate', 'Advanced', 'Expert']);
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
  assert.equal(await overflow(page), false, 'no horizontal overflow at 390px');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* Shell Quest quick-fire only offers what the saved progress has taught (teach-before-use): mark every mission done so the whole pool is open */
const finishShellCourse = page => page.evaluate(() => { SQ.content.chapters.forEach((c, ci) => c.missions.forEach((_, i) => { SQ.S.done[ci + '.' + i] = 1; })); });

test('shell-quest quick-fire is locked until chapter 1 is done, then offers only what the finished chapters taught', async () => {
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#mission');
  await page.click('#t-fire');
  assert.match(await page.textContent('#fStage'), /Locked for now/);
  assert.equal(await page.locator('#fStart').count(), 0);
  assert.ok(!(await page.isVisible('.ftier')), 'no tier picker while everything is locked');
  await page.click('#fGoQuest');
  assert.ok(await page.isVisible('#tab-quest'));
  await page.evaluate(() => { for (let i = 0; i < SQ.content.chapters[0].missions.length; i++) SQ.S.done['0.' + i] = 1; });
  await page.click('#t-fire');
  assert.deepEqual(await page.$$eval('#fTier option', os => os.map(o => o.value)), ['mixed', 'beginner']);
  await page.click('#fStart');
  const ch0 = await page.evaluate(() => SQ.content.quickfire.filter(q => q.ch === 0).map(q => q[0]));
  for (let i = 0; i < 12; i++) { assert.ok(ch0.includes(await page.textContent('#fTask')), 'only chapter 1 questions are asked'); await page.click('#fSkip'); }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest quick-fire tier picker: Mixed + tiers with questions, run draws from the chosen pool', async () => {
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#mission');
  await finishShellCourse(page);
  await page.click('#t-fire');
  const opts = await page.$$eval('#fTier option', os => os.map(o => [o.value, o.textContent.trim()]));
  assert.deepEqual(opts, [['mixed', 'Mixed'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced'], ['expert', 'Expert']]);
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
  const xpool = await page.evaluate(() => SQ.content.quickfire.filter(q => q[2] === 'expert').map(q => q[0]));
  assert.ok(xpool.length >= 12 && xpool.every(t => !ipool.includes(t)));
  await run('expert', xpool);
  await run('mixed', await page.evaluate(() => SQ.content.quickfire.map(q => q[0])));
  await page.setViewportSize({ width: 390, height: 800 });
  assert.equal(await overflow(page), false, 'no horizontal overflow at 390px');
  // Task 20: the flake seen in Task 19 was a skipped question's revealed answer (the long Expert awk pipeline, in a nowrap <code>)
  // pushing the page sideways at 390px. Skip Expert questions until that one has been revealed, checking the width every time.
  await page.selectOption('#fTier', 'expert');
  await page.click('#fStart');
  let sawLong = false;
  for (let i = 0; i < 200 && !sawLong; i++) {
    sawLong = /most common first fields/.test(await page.textContent('#fTask'));
    await page.click('#fSkip');
    assert.equal(await overflow(page), false, `no horizontal overflow at 390px after skipping question ${i + 1}`);
  }
  assert.ok(sawLong, 'the long awk answer was revealed');
  await page.click('#fStop');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest quick-fire: single-quote question rejects expanding forms, tee accepts ./', async () => {
  const { ctx, page, errors } = await open(`${base}/shell-quest/`);
  await page.waitForSelector('#mission');
  await finishShellCourse(page);
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

test('shell-quest: a folder at the depth cap wraps in the prompt and mission card at 390px, and the input stays usable', async () => {
  const { ctx, page, errors, type } = await shellPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await type('mkdir -p $(printf "dd/%.0s" $(seq 1 126)); cd $(printf "dd/%.0s" $(seq 1 126)); mkdir dd');
  assert.match(await page.textContent('#screen'), /mkdir: cannot create directory 'dd': File name too long/);
  assert.equal(await overflow(page), false, 'no horizontal overflow at 390px');
  assert.ok(await page.evaluate(() => document.querySelector('#cmd').getBoundingClientRect().width > 50), 'the input keeps its width');
  await type('cd ~; echo back');
  assert.match(await page.textContent('#screen'), /back/);
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
  // replay mission 1: a finished mission is not celebrated again (no second message, no XP)
  await page.click('[data-mi="0"]');
  await page.waitForFunction(() => /done before/.test(document.querySelector('#mission').textContent));
  await page.click('#edSave');
  await page.waitForFunction(() => /Saved /.test(document.querySelector('#screen').textContent));
  assert.equal(await page.$$eval('#screen .line.win', els => els.length), 1, 'a replay shows no second win line');
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

// ---- Stage 3 Task 17: the Expert tier wiring, 4 chapters x 7 missions at indexes 15 to 18. Task 17 ran these tests on a
// test-only fixture that filled the tier; since Task 19 they run on the real chapters (content/tier-expert.js). ----
const expertPage = (opts = {}) => shellPage({ viewport: { width: 1280, height: 900 }, ...opts });
const tierHeads = page => page.$$eval('.tierhead', hs => hs.map(h => h.textContent.replace(/\s+/g, ' ').trim()));

test('shell-quest Expert tier: four rail headers, Expert in the quick-fire picker and the guide filter', async () => {
  const { ctx, page, errors } = await expertPage();
  assert.equal(await page.locator('.tierhead').count(), 4);
  const heads = await tierHeads(page);
  assert.match(heads[3], /^Expert/);
  assert.match(heads[3], /0\/4/);
  assert.doesNotMatch(heads[3], /★/);
  assert.deepEqual(await page.$$eval('.chap[data-ch="15"], .chap[data-ch="18"]', bs => bs.map(b => b.querySelector('.num').textContent)), ['16', '19']);
  await finishShellCourse(page);
  await page.click('#t-fire');
  const opts = await page.$$eval('#fTier option', os => os.map(o => [o.value, o.textContent.trim()]));
  assert.deepEqual(opts, [['mixed', 'Mixed'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced'], ['expert', 'Expert']]);
  await page.click('#t-guide');
  assert.deepEqual(await page.$$eval('#guide h3[data-tier]', hs => hs.map(h => h.dataset.tier)), ['beginner', 'intermediate', 'advanced', 'expert']);
  assert.deepEqual(await page.$$eval('#guide .gfilter button', bs => bs.map(b => b.textContent.trim())), ['All', 'Beginner', 'Intermediate', 'Advanced', 'Expert']);
  await page.click('#guide .gfilter button[data-tier="expert"]');
  assert.ok(await page.isVisible('#guide .gsec[data-tier="expert"]'));
  assert.ok(!(await page.isVisible('#guide .gsec[data-tier="advanced"]')), 'Advanced hidden under the Expert filter');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest Expert tier: a save with chapters 0 to 18 badged shows four complete headers and the rank Shell Wizard', async () => {
  const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/shell-progress-beginner-complete.json'), 'utf8'));
  const counts = { 7: [7, 15], 8: [8, 15], 9: [7, 15], 10: [7, 15], 11: [7, 20], 12: [7, 20], 13: [7, 20], 14: [7, 20], 15: [7, 25], 16: [7, 25], 17: [7, 25], 18: [7, 25] };
  let xp = f.data.xp;
  for (const [ch, [n, per]] of Object.entries(counts)) {
    for (let m = 0; m < n; m++) { f.data.done[`${ch}.${m}`] = 1; xp += per; }
    f.data.badges[ch] = 1; xp += 25;
  }
  assert.equal(xp, 1890 + 28 * 25 + 4 * 25);
  f.data.xp = xp; f.data.ch = 18; f.data.mi = 7;
  const file = path.join(tmp, 'expert-complete.json');
  fs.writeFileSync(file, JSON.stringify(f));
  const { ctx, page, errors } = await expertPage();
  await page.click('.pg-trigger');
  await Promise.all([page.waitForNavigation(), page.setInputFiles('.pg-file', file)]);
  await page.waitForSelector('#mission');
  const heads = await tierHeads(page);
  assert.equal(heads.length, 4);
  assert.deepEqual(await page.$$eval('.tierhead', hs => hs.map(h => h.classList.contains('complete'))), [true, true, true, true]);
  assert.match(heads[0], /^Beginner.*7\/7.*★/);
  assert.match(heads[1], /^Intermediate.*4\/4.*★/);
  assert.match(heads[2], /^Advanced.*4\/4.*★/);
  assert.match(heads[3], /^Expert.*4\/4.*★/);
  assert.equal(await page.locator('.chap.earned').count(), 19);
  assert.equal((await page.textContent('#xpText')).trim(), '2690 XP');
  assert.equal((await page.textContent('#rank')).trim(), 'Shell Wizard');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('shell-quest Expert tier: a mission awards 25 XP once; a chapter switch and Reset world clear jobs and the clock', async () => {
  const { ctx, page, errors, type, waitScreen } = await expertPage();
  const xp = async () => parseInt(await page.textContent('#xpText'), 10);
  await page.click('.chap[data-ch="15"]');
  const m = await page.evaluate(() => window.SQ.content.chapters[15].missions[0]);
  await page.waitForFunction(t => document.querySelector('#mission h2').textContent.includes(t), m.title);
  const x0 = await xp();
  await type(m.answer);
  await waitScreen(/Mission complete/);
  assert.match(await page.textContent('#screen'), /\+25 XP/);
  assert.equal(await xp(), x0 + 25);
  await page.click('#mission .dot[data-mi="0"]');
  await type(m.answer);
  assert.equal(await page.$$eval('#screen .line.win', els => els.length), 1, 'a replay shows no second win line');
  assert.equal(await xp(), x0 + 25, 'a replay awards nothing');
  await type('sleep 30 &');
  await type('sleep 2');
  assert.deepEqual(await page.evaluate(() => [window.SQ.rt.jobs.length, window.SQ.rt.clock]), [1, 6], 'two answers, sleep 30 & and sleep 2 since the switch to chapter 16');
  await page.click('.chap[data-ch="16"]');
  assert.deepEqual(await page.evaluate(() => [window.SQ.rt.jobs.length, window.SQ.rt.clock]), [0, 0]);
  await type("sleep 30 & trap 'echo usr' USR1");
  await page.click('#resetWorld');
  await page.click('#resetWorld');
  await waitScreen(/World reset/);
  assert.deepEqual(await page.evaluate(() => [window.SQ.rt.jobs.length, window.SQ.rt.clock, !!window.SQ.rt.scopeNode.traps]), [0, 0, false]);
  await type('jobs; trap -p; echo "t=$SECONDS"');
  await waitScreen(/t=0/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---- Stage 3 Task 20: the whole course in one session, Beginner to Expert, through the UI with "Type it for me". Chapters 1 to 15 are
// played straight (the editor's Save & run for their script missions, the two-step Treasure hunt by hand); the four Expert chapters (16 to
// 19, Tasks 18 and 19) first run a wrong script for each script mission (16.7, 17.7, 18.7, 19.6 and the 19.7 capstone) and pin its
// failure line. At the end: 19 badges, four complete tier headers with a star, 2690 XP and the top rank, Shell Wizard. ----
test('shell-quest full course: every mission of chapters 1 to 19 completes through the UI, wrong scripts are explained, 19 badges, four complete tiers, Shell Wizard', async () => {
  const { ctx, page, errors, type, waitScreen } = await shellPage({ viewport: { width: 1280, height: 900 } });
  const xp = () => page.evaluate(() => window.SQ.S.xp);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // a mission is complete when its done key is set (titles repeat across chapters, so the screen text alone could match an earlier one)
  const doneKey = async k => {
    try { await page.waitForFunction(key => !!window.SQ.S.done[key], k, { timeout: 15000 }); } catch (e) {
      const tail = await page.$$eval('#screen .line', els => els.slice(-12).map(x => x.textContent).join('\n'));
      throw new Error(`mission ${k} did not complete: ${e.message}\n--- screen ---\n${tail}`);
    }
  };
  const missionsOf = c => page.evaluate(i => window.SQ.content.chapters[i].missions.map(m => ({ title: m.title, kind: m.kind || '', answer: m.steps ? m.steps[0].answer : m.answer, steps: m.steps ? m.steps.map(s => s.answer) : [], wrong: m.wrong || [] })), c);
  const goTo = async (ci, mi, title) => {
    await page.click(`#mission button[data-mi="${mi}"]`);
    await page.waitForFunction(t => document.querySelector('#mission h2').textContent.includes(t), title);
  };
  const tierXp = { beginner: 10, intermediate: 15, advanced: 20 };
  for (let ci = 0; ci < 15; ci++) {
    await page.click(`.chap[data-ch="${ci}"]`);
    await page.waitForFunction(c => window.SQ.S.ch === c, ci);
    const tier = await page.evaluate(c => window.SQ.tiers.tierOf(c).id, ci);
    const ms = await missionsOf(ci);
    for (let mi = 0; mi < ms.length; mi++) {
      const m = ms[mi], key = `${ci}.${mi}`, before = await xp();
      await goTo(ci, mi, m.title);
      await page.click('[data-act="fill"]');
      if (m.kind === 'script' || m.kind === 'challenge') {
        await page.waitForSelector('#editor:not([hidden])');
        assert.equal(await page.inputValue('#edText'), m.answer, `Type it for me fills the editor for ${key} ${m.title}`);
        await page.click('#edRun');
        await doneKey(key);
        await page.click('#edClose');
      } else {
        assert.equal(await page.inputValue('#cmd'), m.answer, `Type it for me fills ${key} ${m.title}`);
        const n0 = await page.$$eval('#screen .line', els => els.length);
        await page.press('#cmd', 'Enter');
        if (m.title === 'Treasure hunt') { // two steps: the find prints the path, the learner cats it
          const path = l => l.startsWith('./') && l.endsWith('/gold.txt'); // a printed path, not the prompt line that typed the find
          await page.waitForFunction(n => [...document.querySelectorAll('#screen .line')].slice(n).some(e => /^\.\/.*\/gold\.txt$/.test(e.textContent.trim())), n0);
          const found = (await page.$$eval('#screen .line', (els, n) => els.slice(n).map(e => e.textContent.trim()), n0)).find(path);
          await type(`cat ${found}`);
        }
        if (m.steps.length) { // a multi-step mission: one step is ticked off, the mission stays open until the last one
          for (const a of m.steps.slice(1)) {
            assert.equal(await page.evaluate(k => !!window.SQ.S.done[k], key), false, `${key} ${m.title}: one step must not complete the mission`);
            assert.equal(await page.locator('#mission .steps li.done').count(), 1, `${key} ${m.title}: the finished step is ticked`);
            await page.click('[data-act="fill"]');
            assert.equal(await page.inputValue('#cmd'), a, `Type it for me fills the next open step of ${key}`);
            await page.press('#cmd', 'Enter');
          }
        }
        await doneKey(key);
      }
      const gain = (await xp()) - before;
      assert.ok(gain === tierXp[tier] || gain === tierXp[tier] + 25, `${key} ${m.title}: +${gain} XP`);
    }
    await page.waitForFunction(c => !!window.SQ.S.badges[c], ci);
  }
  assert.equal(await xp(), 1890, 'Beginner, Intermediate and Advanced complete: 1890 XP');
  assert.equal((await page.textContent('#rank')).trim(), 'Automator');
  assert.deepEqual(await page.$$eval('.tierhead', hs => hs.map(h => h.classList.contains('complete'))), [true, true, true, false]);
  // per script mission: the Run arguments, the failure line of its first wrong script, and what the answer prints
  const SCRIPTS = {
    '15.6': ['village/sales.csv', /Test 1 \(the sales file\) failed: expected "apple      24\.00/, /apple\s+24\.00\s*bread\s+90\.00/],
    '16.6': ['3 1 2', /Test 1 \(3 1 2\) failed: expected "1 done\\n2 done\\n3 done", got ""/, /1 done\s*2 done\s*3 done/],
    '17.6': ['village/logs/access.log 2', /Test 1 \(the access log, N 2\) failed: expected "4 10\.0\.0\.5\\n3 10\.0\.0\.7", got "2 10\.0\.0\.12\\n4 10\.0\.0\.5"/, /4 10\.0\.0\.5\s*3 10\.0\.0\.7/],
    '18.5': ['-vn Ada', /Test 1 \(-n Ada\) failed: expected "Hello, Ada!", got ""/, /verbose on\s*Hello, Ada!/],
    '18.6': ['village/logs/all.log', /Test 1 \(all\.log, the defaults\) failed: expected "\/tmp empty", got "\/tmp holds tmp\.A00001"/, /3 10\.0\.0\.5\s*3 10\.0\.0\.7\s*1 10\.0\.0\.12/],
  };
  // the done key is set, and the newest win line on the screen names this mission with +25 XP
  const won = async (key, title) => {
    await doneKey(key);
    const last = await page.$$eval('#screen .line.win', els => els.map(e => e.textContent).filter(s => /Mission complete/.test(s)).pop() || '');
    assert.match(last, new RegExp(`Mission complete: ${esc(title)}\\s+\\+25 XP`));
  };
  const BADGES = { 15: 'Text Wrangler', 16: 'Job Controller', 17: 'Pipeline Architect', 18: 'Toolsmith' };
  const x0 = await xp();
  for (const ci of [15, 16, 17, 18]) {
    await page.click(`.chap[data-ch="${ci}"]`);
    await page.waitForFunction(c => window.SQ.S.ch === c, ci);
    const ms = await page.evaluate(c => window.SQ.content.chapters[c].missions.map(m => ({ title: m.title, kind: m.kind || '', answer: m.answer, wrong: m.wrong || [] })), ci);
    assert.equal(ms.length, 7);
    for (let mi = 0; mi < ms.length; mi++) {
      const m = ms[mi];
      await page.click(`#mission button[data-mi="${mi}"]`);
      await page.waitForFunction(t => document.querySelector('#mission h2').textContent.includes(t), m.title);
      await page.click('[data-act="fill"]');
      if (m.kind === 'script' || m.kind === 'challenge') {
        const [args, failRe, outRe] = SCRIPTS[`${ci}.${mi}`];
        await page.waitForSelector('#editor:not([hidden])');
        assert.equal(await page.inputValue('#edText'), m.answer);
        // a wrong script first: Save & run explains the failing case and awards nothing
        await page.fill('#edText', m.wrong[0]);
        await page.fill('#edArgs', args);
        const before = await xp();
        await page.click('#edRun');
        await waitScreen(failRe);
        assert.equal(await xp(), before);
        await page.fill('#edText', m.answer);
        await page.click('#edRun');
        await won(`${ci}.${mi}`, m.title);
        assert.match(await page.textContent('#screen'), outRe);
        await page.click('#edClose');
      } else {
        assert.equal(await page.inputValue('#cmd'), m.answer, `Type it for me fills ${m.title}`);
        await page.press('#cmd', 'Enter');
        await won(`${ci}.${mi}`, m.title);
      }
    }
    await waitScreen(new RegExp(`Badge earned: ${BADGES[ci]}`));
  }
  assert.equal(await xp(), x0 + 4 * (7 * 25 + 25));
  assert.equal(await xp(), 2690);
  assert.equal((await page.textContent('#xpText')).trim(), '2690 XP');
  assert.equal((await page.textContent('#rank')).trim(), 'Shell Wizard');
  assert.equal(await page.evaluate(() => Object.keys(window.SQ.S.badges).length), 19);
  assert.equal(await page.locator('.chap.earned').count(), 19);
  const heads = await page.$$eval('.tierhead', hs => hs.map(h => h.textContent.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(await page.$$eval('.tierhead', hs => hs.map(h => h.classList.contains('complete'))), [true, true, true, true]);
  assert.match(heads[0], /^Beginner.*7\/7.*★/);
  assert.match(heads[1], /^Intermediate.*4\/4.*★/);
  assert.match(heads[2], /^Advanced.*4\/4.*★/);
  assert.match(heads[3], /^Expert.*4\/4.*★/);
  assert.match(await page.textContent('#mission h2'), /You finished the Expert tier/);
  assert.match(await page.textContent('#mission .explain'), /awk and sed.*set -euo pipefail.*That is every chapter there is\./s);
  // what the learner saw: the access-log counts, a job killed, the line counts, the diff, the trace and the trap
  const scr = await page.textContent('#screen');
  assert.match(scr, /200 7/);
  assert.match(scr, /Terminated\s+sleep 100/);
  assert.match(scr, /finished 12\d\d/);
  assert.match(scr, /3 inbox\/a\.txt\s*2 inbox\/b\.txt\s*4 inbox\/c\.txt/);
  assert.match(scr, /job 1\s*job 2\s*job 3/);
  assert.match(scr, /2a3\s*> kiwi\s*4d4\s*< plum/);
  assert.match(scr, /4 10\.0\.0\.5\s*3 10\.0\.0\.9\s*3 10\.0\.0\.7/);
  assert.match(scr, /bash: nope: unbound variable/);
  assert.match(scr, /\+ echo hi\s*hi\s*\+ set \+x/);
  assert.match(scr, /hi\s*bye/);
  assert.equal(await page.evaluate(() => window.SQ.ctxFor('').read('~/config.ini').includes('debug=true')), true);
  assert.deepEqual(await page.evaluate(() => ['a', 'b', 'c'].map(k => window.SQ.ctxFor('').isFile(`~/archive/${k}.txt`))), [true, true, true]);
  assert.equal(await page.evaluate(() => window.SQ.rt.opts.x), false, 'tracing is off again');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('theme button cycles auto, light, dark, remembers the choice and sets data-theme', async () => {
  for (const url of [base + '/', `${base}/shell-quest/`]) {
    const { ctx, page, errors } = await open(url, { colorScheme: 'light' });
    const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(await attr(), null, url);
    const light = await bg();
    await page.click('.theme-toggle');
    assert.equal(await attr(), 'light', url);
    await page.click('.theme-toggle');
    assert.equal(await attr(), 'dark', url);
    assert.notEqual(await bg(), light, 'dark should change the page background');
    await page.reload();
    assert.equal(await attr(), 'dark', 'choice survives a reload');
    assert.match(await page.textContent('.theme-toggle'), /Dark/);
    await page.click('.theme-toggle');
    assert.equal(await attr(), null, 'back to auto');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('ds-quest field guide: each explainer runs its operations and examples draw a picture', async () => {
  const { ctx, page, errors } = await open(`${base}/ds-quest/`, { viewport: { width: 1280, height: 900 } });
  await page.waitForSelector('#mission');
  await page.click('.tabs button[data-tab="guide"]');
  await page.waitForSelector('#demo-tree .dbtn');
  assert.ok((await page.$$('#guide .exviz')).length >= 10, 'guide examples should each draw what they build');
  for (const id of ['array', 'stack', 'queue', 'list', 'map', 'set', 'tree']) {
    await page.click(`#demo-${id} .dbtn >> nth=0`);
    await until(async () => !(await page.$(`#demo-${id} .dbtn:disabled`)));
    assert.ok((await page.textContent(`#demo-${id} .demosay`)).length > 20, `${id} explains what happened`);
    assert.ok((await page.textContent(`#demo-${id} .democode`)).trim().length > 0, `${id} shows the code`);
  }
  await page.click('.tabs button[data-tab="quest"]');
  await page.click('[data-act="watch"]');
  await until(async () => !(await page.isHidden('#tab-guide')));
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* ---------- Network Quest: terminal, packet inspector, map, progress ---------- */
async function netPage(opts = {}, prep) {
  const o = await open(`${base}/net-quest/`, { viewport: { width: 1280, height: 900 }, ...opts }, prep);
  o.console = [];
  o.page.on('console', m => { if (m.type() === 'error') o.console.push(m.text()); });
  await o.page.waitForSelector('#cmd');
  o.type = async line => { await o.page.fill('#cmd', line); await o.page.press('#cmd', 'Enter'); };
  o.xp = async () => (await o.page.textContent('#xpText')).trim();
  return o;
}

test('net-quest: ping shows a reply and an inspector entry', async () => {
  const { ctx, page, errors, type } = await netPage();
  await type('ping -c 1 10.0.0.3');
  assert.match(await page.textContent('#screen'), /1 packets transmitted, 1 received/);
  const rows = page.locator('#inspector .pkt');
  assert.ok(await rows.count() >= 4, 'expected at least 4 packet rows');
  await rows.filter({ hasText: 'echo request' }).first().click();
  const layers = await page.textContent('#layers');
  for (const l of ['Ethernet', 'IPv4', 'ICMP']) assert.ok(layers.includes(l), `layer table shows ${l}`);
  assert.match(await page.textContent('#hex'), /[0-9a-f]{2} [0-9a-f]{2}/);
  assert.ok(await page.$('#diagram svg .dg-sel'), 'the diagram highlights the device');
  assert.match(await page.textContent('#diagram .dg-text'), /laptop eth0 ↔ sw1 p1/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('net-quest: the packet list works from the keyboard', async () => {
  const { ctx, page, errors, type } = await netPage();
  await type('ping -c 1 10.0.0.3');
  await type('ping -c 1 10.0.0.3');
  assert.equal(await page.locator('#inspector [role="tree"] > [role="treeitem"]').count(), 2, 'one group per command');
  assert.equal(await page.locator('#inspector .pkt:visible').count(), 6, 'only the newest group is open (no ARP the second time)');
  assert.equal(await page.locator('#inspector [tabindex="0"]').count(), 1, 'the list is one tab stop');
  await page.focus('#inspector [tabindex="0"]');
  const sel = () => page.$eval('#inspector .pkt[aria-selected="true"]', e => e.textContent);
  const first = await sel();
  await page.keyboard.press('ArrowDown');
  assert.notEqual(await sel(), first, 'ArrowDown moves the selection');
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none', 'the focused row shows a focus ring');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#inspector .pkt:visible').count(), 6 + 12, 'Enter on the older group opens it');
  await page.keyboard.press('End');
  assert.match(await sel(), /echo reply/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('net-quest: finishing a mission awards XP once', async () => {
  const { ctx, page, errors, type, xp } = await netPage();
  assert.equal(await xp(), '0 XP');
  assert.equal(await page.$$eval('#feedback .win', e => e.length), 0);
  await type('ping 10.0.0.3');
  assert.equal(await xp(), '10 XP');
  assert.equal(await page.$$eval('#feedback .win', e => e.length), 1);
  await type('ping 10.0.0.3');
  await type('pign 10.0.0.3');
  await type('ping 10.0.0.99');
  assert.equal(await xp(), '10 XP');
  await page.click('#mission .dot[data-mi="0"]');
  await type('ping 10.0.0.3');
  assert.equal(await xp(), '10 XP', 'replaying a finished mission gives nothing');
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForSelector('#cmd');
  assert.equal(await xp(), '10 XP');
  assert.equal(await page.$$eval('#mission .dot.done', e => e.length), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('net-quest: a failed command never completes a mission', async () => {
  const { ctx, page, errors, type, xp } = await netPage();
  await type('ping 10.0.0.99');
  await type('pong 10.0.0.3');
  assert.equal(await xp(), '0 XP');
  assert.equal(await page.$$eval('#feedback .win', e => e.length), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('net-quest: a damaged save loads without errors', async () => {
  for (const [raw, want] of [['{"done":5,"xp":"x"}', '0 XP'], ['not json', '0 XP'], ['[1,2]', '0 XP'],
    ['{"done":{"9.9":true,"0.0":true},"xp":-5,"ch":99,"mi":-1,"tab":"nope","answers":7,"best":"x"}', '10 XP']]) {
    const o = await netPage({}, c => c.addInitScript(v => { if (!sessionStorage.seeded) { localStorage.setItem('net-quest-v1', v); sessionStorage.seeded = 1; } }, raw));
    assert.equal(await o.xp(), want, raw);
    assert.ok((await o.page.textContent('#mission h2')).trim().length > 3, raw);
    assert.equal(await o.page.isHidden('#tab-quest'), false);
    await o.type('ping 10.0.0.3');
    assert.deepEqual(o.errors, [], raw);
    assert.deepEqual(o.console, [], raw);
    await o.ctx.close();
  }
});

test('net-quest: opening the page does not write a save', async () => {
  const { ctx, page, errors } = await netPage();
  await page.waitForTimeout(400);
  assert.equal(await read(page, 'net-quest-v1'), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('net-quest: a question mission takes an answer', async () => {
  const { ctx, page, errors, type, xp } = await netPage();
  await page.click('#mission .dot[data-mi="1"]');
  assert.equal(await page.isHidden('#answerBox'), true, 'no question before the ping');
  await type('ping 10.0.0.3');
  assert.equal(await page.isVisible('#answerBox'), true);
  const above = await page.evaluate(() => document.getElementById('answerBox').getBoundingClientRect().bottom <= document.getElementById('inspector').getBoundingClientRect().top + 1);
  assert.ok(above, 'the answer box sits above the packet list');
  assert.match(await page.textContent('#answerBox'), /Which layers/);
  await page.fill('#answer', 'Ethernet, ARP');
  await page.click('#answerBox button[type="submit"]');
  assert.match(await page.textContent('#afb'), /Not quite/);
  assert.equal(await xp(), '0 XP');
  await page.fill('#answer', 'Ethernet, IPv4, ICMP');
  await page.click('#answerBox button[type="submit"]');
  assert.equal(await xp(), '10 XP');
  assert.equal(await page.$$eval('#mission .dot.done', e => e.length), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('net-quest: reset scenario and mission switching start a fresh net', async () => {
  const { ctx, page, errors, type } = await netPage();
  const arpRows = () => page.locator('#inspector .pkt', { hasText: 'ARP request' }).count();
  await type('ping -c 1 10.0.0.3');
  assert.ok(await arpRows() > 0);
  await type('ping -c 1 10.0.0.3');
  assert.equal(await page.locator('#inspector .pkt:visible', { hasText: 'ARP' }).count(), 0, 'ARP is cached the second time');
  await page.click('#resetNet');
  assert.equal(await page.locator('#inspector .pkt').count(), 0);
  assert.doesNotMatch(await page.textContent('#screen'), /packets transmitted/);
  await type('ping -c 1 10.0.0.3');
  assert.ok(await page.locator('#inspector .pkt:visible', { hasText: 'ARP request' }).count() > 0, 'ARP again after a reset');
  await page.click('#mission .dot[data-mi="2"]');
  assert.equal(await page.locator('#inspector .pkt').count(), 0);
  await type('ping -c 1 10.0.0.3');
  assert.ok(await page.locator('#inspector .pkt:visible', { hasText: 'ARP request' }).count() > 0, 'ARP again in a new mission');
  await page.press('#cmd', 'ArrowUp');
  assert.equal(await page.inputValue('#cmd'), 'ping -c 1 10.0.0.3');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('net-quest: terminal output is text, never markup', async () => {
  const { ctx, page, errors, type } = await netPage();
  await type('<img src=x onerror=alert(1)>');
  await type('ping "<b>x</b>"');
  assert.equal(await page.$$eval('img, #screen b, #inspector b', e => e.length), 0);
  assert.match(await page.textContent('#screen'), /<img src=x onerror=alert\(1\)>/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd', 'focus stays in the terminal');
  await page.press('#cmd', 'Control+l');
  assert.equal((await page.textContent('#screen')).trim(), '');
  await page.press('#cmd', 'Tab');
  assert.notEqual(await page.evaluate(() => document.activeElement.id), 'cmd', 'Tab moves on: there is no completion to trap it');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('net-quest: chapter 4 plays through the page, on the printer and on r1, and the map marks the terminal device as (you)', async () => {
  for (const width of [1280, 390]) {
    const { ctx, page, errors, type, xp } = await netPage({ viewport: { width, height: 900 } });
    const over = () => overflow(page);
    const steps = [
      [['ip route'], '192.168.1.1', 'laptop'],
      [['ip route add default via 192.168.1.1', 'ping -c 1 172.16.0.10'], null, 'printer'],
      [['ip route del default', 'ip route add default via 192.168.1.1', 'ping -c 1 172.16.0.10'], null, 'laptop'],
      [['traceroute 172.16.0.10'], '10.0.1.2', 'laptop'],
      [['ip route add 172.16.0.0/24 via 10.0.1.2', 'ping -c 1 172.16.0.10'], null, 'r1'],
      [['traceroute 8.8.8.8'], '10.0.1.1', 'laptop']];
    await page.click('#chapters .chap[data-ch="3"]');
    for (const [i, [lines, answer, dev]] of steps.entries()) {
      await page.click(`#mission .dot[data-mi="${i}"]`);
      assert.match(await page.textContent('#prompt'), new RegExp('^' + dev + ':'), `mission ${i + 1} prompt`);
      const you = await page.locator('#diagram .dg-list li', { hasText: '(you)' }).allTextContents();
      assert.equal(you.length, 1, 'exactly one device is marked (you)');
      assert.match(you[0], new RegExp('^' + dev + ' '), `mission ${i + 1}: the map marks ${dev}`);
      assert.match(await page.getAttribute('#diagram svg', 'aria-label'), /Network map/);
      assert.equal(await page.locator('#diagram svg text.dg-id', { hasText: '(you)' }).count(), 1);
      assert.match(await page.locator('#diagram svg text.dg-id', { hasText: '(you)' }).textContent(), new RegExp('^' + dev + ' '));
      if (width < 820) await page.click('.seg button[data-view="term"]');
      for (const l of lines) await type(l);
      if (answer) {
        if (width < 820) await page.click('#feedback [data-act="ask"]');
        await page.fill('#answer', answer); await page.click('#answerBox button[type="submit"]'); }
      assert.equal(await xp(), (i + 1) * 10 + ' XP', `mission ${i + 1} completes`);
      assert.equal(await over(), false, `${width}: no horizontal scroll in mission ${i + 1}`);
    }
    assert.equal(await page.$$eval('#mission .dot.done', e => e.length), 6);
    if (width < 820) for (const v of ['pkts', 'map', 'term']) {
      await page.click(`.seg button[data-view="${v}"]`);
      assert.equal(await over(), false, `${width}: ${v} view after the traceroute loop`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('net-quest: the question stays after an extra command, and a ping with no reply can open it', async () => {
  const { ctx, page, errors, type, xp } = await netPage();
  await page.click('#chapters .chap[data-ch="3"]');
  await page.click('#mission .dot[data-mi="3"]');
  await type('traceroute 172.16.0.10');
  assert.equal(await page.isVisible('#answerBox'), true, 'the question opens');
  await type('traceroute 8.8.8.8');
  assert.equal(await page.isVisible('#answerBox'), true, 'an extra comparison traceroute keeps it');
  await page.fill('#answer', '10.0.1.2'); await page.click('#answerBox button[type="submit"]');
  assert.equal(await xp(), '10 XP');
  await page.click('#chapters .chap[data-ch="1"]');
  await page.click('#mission .dot[data-mi="2"]');
  await type('ip neigh add 10.0.0.3 lladdr 02:00:00:00:00:99 dev eth0');
  assert.equal(await page.isHidden('#answerBox'), true, 'no question before the ping');
  await type('ping -c 1 10.0.0.3');
  assert.equal(await page.isVisible('#answerBox'), true, 'a ping that gets no reply (exit 1) still opens the question');
  await page.fill('#answer', '100%'); await page.click('#answerBox button[type="submit"]');
  assert.equal(await xp(), '20 XP');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('net-quest: chapter 5 plays through the page, on the laptop, home and web, and the map marks the terminal device as (you)', async () => {
  for (const width of [1280, 390]) {
    const { ctx, page, errors, type, xp } = await netPage({ viewport: { width, height: 900 } });
    const over = () => overflow(page);
    const steps = [
      [['ping -c 1 198.51.100.10'], null, 'laptop'],
      [['ping -c 1 198.51.100.10'], '203.0.113.5', 'laptop'],
      [['nat table'], '192.168.1.11', 'home'],
      [['traceroute 192.168.1.10'], 'no route', 'web'],
      [['ip route add default via 203.0.113.6', 'ping -c 1 198.51.100.10'], null, 'home'],
      [['traceroute 198.51.100.10'], 'isp', 'laptop'],
      [['nat', 'nat on'], null, 'home']];
    await page.click('#chapters .chap[data-ch="4"]');
    for (const [i, [lines, answer, dev]] of steps.entries()) {
      await page.click(`#mission .dot[data-mi="${i}"]`);
      assert.match(await page.textContent('#prompt'), new RegExp('^' + dev + ':'), `mission ${i + 1} prompt`);
      const you = await page.locator('#diagram .dg-list li', { hasText: '(you)' }).allTextContents();
      assert.equal(you.length, 1, 'exactly one device is marked (you)');
      assert.match(you[0], new RegExp('^' + dev + ' '), `mission ${i + 1}: the map marks ${dev}`);
      if (width < 820) await page.click('.seg button[data-view="term"]');
      for (const l of lines) await type(l);
      if (answer) {
        if (width < 820) await page.click('#feedback [data-act="ask"]');
        await page.fill('#answer', answer); await page.click('#answerBox button[type="submit"]'); }
      assert.equal(await xp(), (i + 1) * 10 + ' XP', `mission ${i + 1} completes`);
      assert.equal(await over(), false, `${width}: no horizontal scroll in mission ${i + 1}`);
    }
    assert.equal(await page.$$eval('#mission .dot.done', e => e.length), 7);
    if (width < 820) for (const v of ['pkts', 'map', 'term']) {
      await page.click(`.seg button[data-view="${v}"]`);
      assert.equal(await over(), false, `${width}: ${v} view after the last mission`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('net-quest: layout at 390px', async () => {
  for (const width of [390, 360]) {
    const { ctx, page, errors, type } = await netPage({ viewport: { width, height: 800 } });
    await type('ping -c 1 10.0.0.3');
    const over = () => overflow(page);
    assert.equal(await over(), false, `${width}: terminal view`);
    assert.ok(parseFloat(await page.$eval('#cmd', e => getComputedStyle(e).fontSize)) >= 16);
    assert.equal(await page.$eval('details.about', d => d.open), false, 'the chapter intro starts closed on a phone');
    await page.focus('#mission .dot[data-mi="0"]');
    await page.click('#mission [data-act="toterm"]');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd', 'Open the terminal focuses the input');
    assert.equal(await page.isVisible('#termPanel'), true);
    assert.equal(await page.isVisible('#pktPanel'), false);
    await page.click('#feedback [data-act="pkts"]');
    assert.equal(await page.isVisible('#pktPanel'), true, 'the win message leads to the packets');
    await page.click('.seg button[data-view="term"]');
    await page.click('.seg button[data-view="pkts"]');
    assert.equal(await page.isVisible('#pktPanel'), true);
    assert.equal(await page.isVisible('#termPanel'), false);
    await page.locator('#inspector .pkt', { hasText: 'echo request' }).first().click();
    assert.equal(await over(), false, `${width}: packets view`);
    await page.click('.seg button[data-view="map"]');
    assert.equal(await page.isVisible('#mapPanel'), true);
    assert.equal(await page.isVisible('#diagram ul'), true, 'the text map is visible on a phone');
    assert.equal(await over(), false, `${width}: map view`);
    await page.click('.seg button[data-view="term"]');
    assert.equal(await page.isVisible('#termPanel'), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('net-quest: quick-fire stays closed until the chapter is done, and says what to finish', async () => {
  const { ctx, page, errors, console: cerr } = await netPage();
  await page.click('.tabs button[data-tab="fire"]');
  assert.equal(await page.locator('#fStart').count(), 0, 'no way to start the clock');
  assert.match(await page.textContent('#fStage'), /Chapter 1: Layers and packets.*0 of 8 missions done/);
  await page.click('#fStage [data-act="tab-quest"]');
  assert.equal(await page.isVisible('#tab-quest'), true);
  assert.deepEqual(errors, []);
  assert.deepEqual(cerr, []);
  await ctx.close();
});

test('net-quest: quick-fire and field guide render', async () => {
  const done = JSON.stringify({ done: Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map(i => [`0.${i}`, true])), xp: 80 });
  const { ctx, page, errors, console: cerr } = await netPage({}, c => c.addInitScript(v => { if (!sessionStorage.seeded) { localStorage.setItem('net-quest-v1', v); sessionStorage.seeded = 1; } }, done));
  await page.click('.tabs button[data-tab="fire"]');
  await page.click('#fStart');
  assert.ok(await page.locator('#fStage .opt').count() >= 2);
  await page.locator('#fStage .opt').first().click();
  assert.match(await page.textContent('#fFb'), /\S/);
  await page.click('.tabs button[data-tab="guide"]');
  assert.equal(await page.locator('#guide .card').count(), await page.evaluate(() => NQ.GUIDE.length), 'one card for every guide entry, from every chapter');
  assert.ok(await page.locator('#guide .gsec h3', { hasText: 'Chapter 5' }).count() >= 1);
  await page.locator('#guide [data-cmd]').first().click();
  assert.equal(await page.isHidden('#tab-quest'), false);
  assert.match(await page.inputValue('#cmd'), /ping/);
  assert.deepEqual(errors, []);
  assert.deepEqual(cerr, []);
  await ctx.close();
});

test('net-quest: quick-fire draws only from chapters that are done, and from every chapter once all five are', async () => {
  const sizes = [8, 5, 6, 6, 7];
  const seed = (n) => JSON.stringify({ done: Object.fromEntries(sizes.flatMap((k, c) => [...Array(k).keys()].filter(() => c < n).map(i => [`${c}.${i}`, true]))), xp: 0 });
  for (const [n, label] of [[1, 'chapter 1 only'], [5, 'all five chapters']]) {
    const { ctx, page, errors, console: cerr } = await netPage({}, c => c.addInitScript(v => { if (!sessionStorage.seeded) { localStorage.setItem('net-quest-v1', v); sessionStorage.seeded = 1; } }, seed(n)));
    await page.click('.tabs button[data-tab="fire"]');
    const allowed = await page.evaluate((n) => NQ.QF.filter(q => q.ch < n).map(q => q.c), n);
    const seen = new Set();
    await page.click('#fStart');
    for (let i = 0; i < 40; i++) {
      seen.add((await page.innerHTML('#fStage .task')).trim());
      await page.click('#fStop');
      await page.click('#fStart');
    }
    for (const c of seen) assert.ok(allowed.includes(c), `${label}: asked "${c}" before its chapter was done`);
    const later = await page.evaluate(() => NQ.QF.filter(q => q.ch > 0).map(q => q.c));
    assert.equal([...seen].some(c => later.includes(c)), n === 5, `${label}: questions from later chapters`);
    assert.deepEqual(errors, []);
    assert.deepEqual(cerr, []);
    await ctx.close();
  }
});

test('net-quest: the mission card puts the goal first and keeps the chapter intro one tap away', async () => {
  const { ctx, page, errors } = await netPage();
  const card = () => page.evaluate(() => {
    const m = document.getElementById('mission'), kids = [...m.children];
    const at = sel => kids.indexOf(m.querySelector(sel));
    return { h2: at('h2'), goal: at('.goal'), how: at('.how'), about: at('details.about'), open: m.querySelector('details.about').open };
  });
  let c = await card();
  assert.ok(c.h2 < c.goal && c.goal === c.h2 + 1 && c.goal < c.how && c.how < c.about, JSON.stringify(c));
  assert.equal(c.open, true, 'open on the first mission of a chapter until it is done');
  assert.equal(await page.isVisible('#mission [data-act="toterm"]'), false, 'no terminal shortcut on a wide screen');
  await page.click('#mission .dot[data-mi="1"]');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.mi), '1', 'focus comes back to the dot');
  assert.equal((await card()).open, false);
  await page.click('#mission .dot[data-mi="0"]');
  await page.fill('#cmd', 'ping 10.0.0.3'); await page.press('#cmd', 'Enter');
  await page.click('#mission .dot[data-mi="0"]');
  assert.equal((await card()).open, false, 'closed once the mission is done');
  assert.deepEqual(errors, []);
  await ctx.close();
});
