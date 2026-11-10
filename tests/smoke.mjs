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
import { CHAPTERS } from './trophy/chapters.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['script', 'python', 'cpp', 'shell', 'harbor', 'ds', 'net', 'agent', 'rust'];
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
async function pick(page, name, value) {
  if (await page.locator('#st-panel').isHidden()) await page.click('.st-trigger');
  await page.check(`#st-panel input[name="st-${name}"][value="${value}"]`);
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

for (const [where, cards] of [['/', ['programming/', 'math/']], ['/programming/', NAMES.map(n => `${n}-quest/`)]]) {
  test(`landing page ${where} links to every playground in it`, async () => {
    const { ctx, page, errors } = await open(base + where);
    const hrefs = await page.$$eval('a.card', a => a.map(x => x.getAttribute('href')));
    assert.deepEqual(hrefs.sort(), [...cards].sort());
    for (const h of hrefs) {
      const r = await page.request.get(base + where + h);
      assert.equal(r.status(), 200, h);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('programming hub links back to the landing page', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/`, { viewport: { width: 390, height: 844 } });
  assert.equal(await overflow(page), false);
  await page.click('header.top a.nv-home');
  await page.waitForSelector('a.card[href="programming/"]');
  assert.equal(new URL(page.url()).pathname, '/');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('landing page links to the Trophy Room, GitHub and the feature request form', async () => {
  const { ctx, page, errors } = await open(base + '/');
  const hrefs = await page.$$eval('a.btn', a => a.map(x => x.getAttribute('href')));
  assert.deepEqual(hrefs, [
    'trophy-room/',
    'https://github.com/shimoncohen/playgrounds',
    'https://github.com/shimoncohen/playgrounds/issues/new?template=feature-request.yml',
  ]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('landing page Trophy Room button shows the playground level', async () => {
  const { ctx, page, errors } = await open(base + '/', {}, c => c.addInitScript(() => localStorage.setItem('python-quest-v1', JSON.stringify({ xp: 85 }))));
  assert.equal(await page.textContent('.trophy-btn .lvl'), 'Level 3');
  assert.equal(await page.getAttribute('.trophy-btn', 'aria-label'), 'Trophy Room, level 3');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// 160 XP is level 3. Trigonometry is complete (one chapter of 5); Python has its first chapter of 6 done.
const TROPHY_SEED = () => {
  const first = n => Object.fromEntries(Array.from({ length: n }, (_, i) => ['0.' + i, true]));
  localStorage.setItem('python-quest-v1', JSON.stringify({ xp: 85, done: first(6) }));
  localStorage.setItem('math-trigonometry-v1', JSON.stringify({ xp: 75, done: first(5) }));
};

test('trophy room with no progress shows level 1, every achievement locked, and where to start', async () => {
  const { ctx, page, errors } = await open(`${base}/trophy-room/`);
  assert.match(await page.textContent('#lv-h'), /Level 1 · Visitor/);
  assert.equal(await page.locator('.ach .a.off').count(), 9);
  assert.match(await page.textContent('.empty'), /Finish a mission/);
  assert.deepEqual(await page.$$eval('.empty a', a => a.map(x => x.getAttribute('href'))), ['../programming/', '../math/']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const width of [1280, 390]) {
  test(`trophy room works out level, playgrounds and achievements from saved progress at ${width}px`, async () => {
    const { ctx, page, errors } = await open(`${base}/trophy-room/`, { viewport: { width, height: 900 } }, c => c.addInitScript(TROPHY_SEED));
    assert.match(await page.textContent('#lv-h'), /Level 3 · Visitor/);
    assert.match(await page.textContent('.level'), /160 XP/);
    assert.match(await page.textContent('.level'), /20 XP to Level 4/);
    const lvl = page.locator('#room [role=progressbar]').first();
    assert.equal(await lvl.getAttribute('aria-valuenow'), '80');
    assert.equal(await lvl.getAttribute('aria-valuemax'), '100');
    assert.ok(await lvl.getAttribute('aria-label'));
    assert.ok((await page.$$eval('.a.off .cond', c => c.map(x => x.textContent))).every(t => t.startsWith('Locked: ')));
    assert.match(await page.textContent('#ac-h'), /3 of 9/);
    assert.deepEqual(await page.$$eval('.ach .a:not(.off) b', b => b.map(x => x.textContent)), ['First Steps', 'Finisher', 'Polymath']);
    assert.match(await page.textContent('.quests li:has(a[href="../math/trigonometry/"])'), /Done/);
    assert.match(await page.textContent('.quests li:has(a[href="../programming/python-quest/"])'), /1 \/ 9 chapters · 85 XP/);
    assert.match(await page.textContent('.quests li:has(a[href="../programming/net-quest/"])'), /Not started/);
    assert.equal(await overflow(page), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('trophy room links back to the landing page', async () => {
  const { ctx, page, errors } = await open(`${base}/trophy-room/`);
  assert.equal(await page.$('.nv-trophy'), null, 'the room does not link to itself');
  await page.click('header.top a.nv-home');
  await page.waitForSelector('a.card[href="programming/"]');
  assert.equal(new URL(page.url()).pathname, '/');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Quest headers are full, so there the button is only the trophy and the level lives in its name and tooltip.
for (const [pg, text] of [['programming/', '🏆 Level 3'], ['programming/python-quest/', '🏆'], ['math/algebra/', '🏆']]) {
  test(`trophy room button on ${pg} shows the level and opens the room`, async () => {
    const { ctx, page, errors } = await open(`${base}/${pg}`, {}, c => c.addInitScript(TROPHY_SEED));
    await page.waitForFunction(() => document.querySelector('.nv-trophy')?.getAttribute('aria-label') === 'Trophy Room, level 3');
    assert.equal((await page.textContent('.nv-trophy')).trim(), text);
    assert.equal(await page.getAttribute('.nv-trophy', 'title'), 'Trophy Room, level 3');
    await page.click('.nv-trophy');
    await page.waitForSelector('#lv-h');
    assert.equal(new URL(page.url()).pathname, '/trophy-room/');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('trophy room button keeps its plain label when its scripts fail to load', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/python-quest/`, {}, c => c.route('**/shared/trophies.js', r => r.abort()));
  await page.waitForSelector('.nv-trophy');
  await page.waitForTimeout(500);
  assert.equal(await page.getAttribute('.nv-trophy', 'aria-label'), 'Trophy Room');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('programming hub shows saved XP and the landing page sums it', async () => {
  const { ctx, page } = await open(`${base}/programming/`);
  await page.evaluate(() => {
    localStorage.setItem('python-quest-v1', JSON.stringify({ xp: 25 }));
    localStorage.setItem('shell-quest-v1', JSON.stringify({ xp: 10 }));
  });
  await page.reload();
  assert.match(await page.textContent('a[href="python-quest/"] .xp'), /25 XP/);
  await page.goto(base + '/');
  assert.match(await page.textContent('a[href="programming/"] .xp'), /35 XP/);
  await ctx.close();
});

// The export test seeds every quest with xp 77 and two done keys. Agent Quest recomputes xp from valid done keys on load, so its
// seed is two real chapter 1 missions and the xp is worked out in the page.
const SEED = { default: { xp: 77, done: { '0-0': true, '0-1': true } }, agent: { done: { '0.0': true, '0.1': true } } };

test('landing page sums Math XP', async () => {
  const { ctx, page } = await open(base + '/');
  await page.evaluate(() => {
    localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 10 }));
    localStorage.setItem('math-algebra-v1', JSON.stringify({ xp: 15 }));
  });
  await page.reload();
  assert.match(await page.textContent('a[href="math/"] .xp'), /25 XP/);
  await ctx.close();
});

test('math hub loads cleanly', async () => {
  const { ctx, page, errors } = await open(`${base}/math/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('.tcard');
  assert.equal((await page.$$('.tcard')).length, 4);
  assert.match(await page.textContent('#next'), /Order of operations/);
  assert.ok(await page.isVisible('#mapList ol'), 'list hidden on a phone');
  assert.equal((await page.$$('#mapList ol')).length, 4);
  assert.deepEqual(await page.$$eval('#mapList ol:nth-of-type(3) li', l => l.length), 4);
  assert.match(await page.textContent('#mapList ol:nth-of-type(3) li .needs'), /Needs first: Order of operations \(Arithmetic\)/);
  assert.match(await page.textContent('#mapList ol:nth-of-type(4) li .needs'), /Needs first: Pythagoras \(Geometry\), Angles \(Geometry\), Ratios and percentages \(Arithmetic\)/);
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

const PAGES = [...NAMES.map(n => `programming/${n}-quest/`), 'math/arithmetic/', 'math/algebra/', 'math/geometry/', 'math/trigonometry/'];
// A Math track saves under math-<track>-v1, so its progress file is named math-<track>, not after its folder.
const appOf = pg => pg.startsWith('math/') ? 'math-' + pg.split('/')[1] : pg.split('/')[1];
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
    const seed = SEED[name] || SEED.default;
    const want = seed.xp ?? await page.evaluate(d => window.AQ.state.xpFor(d, {}), seed.done);
    state.xp = want; state.done = seed.done;
    // The app keeps its own copy of the state and saves it (some after a short delay), which would
    // overwrite a seed written behind its back. Write the seed, block any later writes from this
    // page, then reload so the app starts from the seeded state.
    await page.evaluate(([k, v]) => {
      Storage.prototype.setItem.call(localStorage, k, v);
      Storage.prototype.setItem = () => {};
    }, [key, JSON.stringify(state)]);
    await page.reload();
    await page.waitForSelector('#mission');
    assert.equal(JSON.parse(await read(page, key)).xp, want, 'seed did not stick');

    await page.click('.pg-trigger');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Export to file')]);
    const file = path.join(tmp, `${app}.json`);
    await dl.saveAs(file);
    assert.equal(dl.suggestedFilename(), `${app}-progress.json`);
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(exported.app, app);
    assert.equal(exported.data.xp, want);

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.click('.pg-trigger');
    await Promise.all([page.waitForNavigation(), page.setInputFiles('.pg-file', file)]);
    await page.waitForSelector('#mission');
    assert.equal(JSON.parse(await read(page, key)).xp, want);
    assert.match(await page.textContent('#xpText'), new RegExp(String(want)));
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('math hub links open the track pages', async () => {
  const { ctx, page, errors } = await open(`${base}/math/`);
  await page.waitForSelector('.tcard');
  const hrefs = await page.$$eval('.tcard a', a => a.map(x => x.getAttribute('href')));
  assert.deepEqual(hrefs, ['arithmetic/', 'algebra/', 'geometry/', 'trigonometry/']);
  for (const h of hrefs) assert.equal((await page.request.get(`${base}/math/${h}`)).status(), 200, h);
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const track of ['arithmetic', 'algebra', 'geometry', 'trigonometry']) {
  test(`math-${track}: at 1440px the header is one row and its Math link goes to the hub`, async () => {
    const { ctx, page, errors } = await open(`${base}/math/${track}/`, { viewport: { width: 1440, height: 900 } });
    await page.waitForSelector('header .pg-wrap');
    const tops = await page.$$eval('header.top > *', els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    assert.ok(Math.max(...tops) - Math.min(...tops) < 20, `header items share one row: ${tops}`);
    await page.click('header .brand a');
    await page.waitForURL(u => new URL(u).pathname === '/math/');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

const RUST_KEY = 'rust-quest-v1';
const RUST_HELLO = 'fn main() {\n    println!("Hello, Rust!");\n}\n';

test('rust-quest writes a pristine state on a clean load', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`);
  await page.waitForSelector('#mission');
  const s = JSON.parse(await read(page, RUST_KEY));
  assert.equal(s.xp, 0);
  assert.deepEqual(s.done, {});
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: finishing mission 0.0 changes the XP text exactly once, even after running again', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`);
  await page.waitForSelector('#mission');
  assert.equal((await page.textContent('#xpText')).trim(), '0 XP');
  await page.fill('#code', RUST_HELLO);
  await page.click('#bRun');
  await page.waitForFunction(() => document.getElementById('xpText').textContent.trim() === '10 XP');
  assert.match(await page.textContent('#feedback'), /Mission complete! \+10 XP/);
  await page.click('#bRun');
  await page.waitForTimeout(200);
  assert.equal((await page.textContent('#xpText')).trim(), '10 XP');
  assert.equal(JSON.parse(await read(page, RUST_KEY)).xp, 10);
  assert.match(await page.textContent('#result'), /Hello, Rust!/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: a bad saved shape loads with no console errors', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, {}, ctx => ctx.addInitScript(k => { if (!localStorage.getItem(k)) localStorage.setItem(k, '{"done":5,"xp":"x"}'); }, RUST_KEY));
  await page.waitForSelector('#mission');
  assert.equal((await page.textContent('#xpText')).trim(), '0 XP');
  assert.equal(JSON.parse(await read(page, RUST_KEY)).xp, 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest field guide: example code keeps each line whole and scrolls sideways instead of wrapping', async () => {
  for (const width of [1280, 390]) {
    const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width, height: 900 } });
    await page.click('#t-guide');
    await page.waitForSelector('#guide .excmd pre');
    const wrapped = await page.evaluate(() => [...document.querySelectorAll('#guide .excmd pre')].filter(e => {
      const cs = getComputedStyle(e), lines = e.textContent.replace(/\n$/, '').split('\n').length;
      return e.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) > (lines + 0.5) * parseFloat(cs.lineHeight);
    }).map(e => e.textContent.split('\n')[1] || e.textContent));
    assert.deepEqual(wrapped, [], `wrapped examples at ${width}px`);
    assert.equal(await overflow(page), false, `${width}px`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('rust-quest: typed code survives a reload and reset restores the starter', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`);
  await page.waitForSelector('#mission');
  const starter = await page.inputValue('#code');
  assert.match(starter, /fn main/);
  await page.fill('#code', 'fn main() {\n    println!("typed");\n}\n');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('#mission');
  assert.match(await page.inputValue('#code'), /typed/);
  await page.click('#bReset');
  assert.equal(await page.inputValue('#code'), starter);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: the Playground link never carries learner code', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`);
  await page.waitForSelector('#mission');
  await page.fill('#code', 'fn main() {\n    unsafe { }\n}\n');
  await page.click('#bRun');
  await page.waitForSelector('#result .card2');
  const hrefs = await page.$$eval('a[href*="play.rust-lang.org"]', as => as.map(a => a.getAttribute('href')));
  assert.ok(hrefs.length >= 2);
  for (const h of hrefs) assert.equal(h, 'https://play.rust-lang.org/');
  for (const h of await page.$$eval('#result a', as => as.map(a => a.getAttribute('href')))) assert.ok(!/unsafe|fn%20main|fn main/.test(h), h);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: the extra keys row inserts symbols at the caret', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 800 } });
  await page.waitForSelector('#mission');
  await page.fill('#code', '');
  await page.click('#keys button:has-text("<>")');
  assert.equal(await page.inputValue('#code'), '<>');
  assert.equal(await page.evaluate(() => document.getElementById('code').selectionStart), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  for (const b of await page.$$('#keys button')) {
    const box = await b.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `a key is ${box.width}x${box.height}`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: the memory view steps through mission 4.1 and shows the error point of its starter', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mission');
  await page.click('[data-ch="3"]');
  const m = await page.evaluate(() => ({ answer: RQ.CH[3].missions[0].answer, starter: RQ.CH[3].missions[1].starter }));
  assert.equal(await page.isVisible('#memPanel'), false);
  await page.fill('#code', m.answer);
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  const steps = await page.$eval('#memory input[type=range]', e => +e.max) + 1;
  assert.equal(steps, 4);
  await page.$eval('#memory input[type=range]', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, 2);
  assert.match(await page.textContent('#memory .mv-heap'), /#1String\s*ahoy, Rustowner: s/);
  await page.waitForSelector('#memory .mv-arrows path.mv-a-own', { state: 'attached' });
  assert.equal(await page.$$eval('#memory .mv-arrows path.mv-a-own', p => p.length), 1);
  const [stack, heap] = await page.$$eval('#memory .mv-stack, #memory .mv-heap', els => els.map(e => e.getBoundingClientRect().top));
  assert.ok(heap > stack, 'stack and heap stack vertically on a phone');
  await page.click('#memory button:has-text("Next")');
  assert.match(await page.textContent('#memory .mv-step'), /Step 4 of 4/);
  await page.fill('#code', 'fn main() {\n    let s = String::new();\n    println!("{}", s);\n}\n');
  await page.click('#bRun');
  await page.$eval('#memory input[type=range]', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, 1);
  assert.match(await page.textContent('#memory .mv-heap'), /empty, no heap memory yet/);
  await page.fill('#code', m.starter);
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#memory'), /E0382/);
  assert.match(await page.textContent('#memory'), /the error is here/);
  assert.equal(await page.$('#memory input[type=range]'), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: a slice is drawn as a dashed arrow into the heap of the String it borrows, with a loan bar beside the editor', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 1000, height: 800 } });
  await page.waitForSelector('#mission');
  await page.click('[data-ch="4"]');
  await page.click('#mission .dot[data-mi="4"]');
  const answer = await page.evaluate(() => RQ.CH[4].missions[4].answer);
  await page.fill('#code', answer);
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  await page.$eval('#memory input[type=range]', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, 3);
  const slots = await page.$$eval('#memory .mv-ref', els => els.map(e => e.textContent));
  assert.deepEqual(slots, ['[0..5] "hello"', '[6..10] "cove"']);
  assert.match(await page.textContent('#memory .mv-var:has(.mv-name:text-is("s"))'), /borrowed x2/);
  await page.waitForSelector('#memory .mv-arrows path.mv-a-shared', { state: 'attached' });
  assert.equal(await page.$$eval('#memory .mv-arrows path.mv-a-shared', p => p.length), 2);
  assert.equal(await page.$$eval('#gutter .gt-bar.shared', b => b.length), 2);
  await page.click('#mission .dot[data-mi="8"]');
  await page.fill('#code', await page.evaluate(() => RQ.CH[4].missions[8].starter));
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0515/);
  assert.equal(await page.$('#memory input[type=range]'), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: the memory view shows an enum variant with its payload, a field that moved out, and a borrow of one field', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mission');
  await page.fill('#code', 'enum E {\n    A(String),\n    B,\n}\nstruct P {\n    a: String,\n    n: i32,\n}\nfn main() {\n    let e = E::A(String::from("x"));\n    let p = P { a: String::from("y"), n: 1 };\n    let r = &p.n;\n    let t = p.a;\n    println!("{} {}", r, t);\n}\n');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  const steps = await page.$eval('#memory input[type=range]', e => +e.max) + 1;
  await page.$eval('#memory input[type=range]', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, steps - 2);
  const text = n => page.textContent(`#memory .mv-var:has(.mv-name:text-is("${n}"))`);
  assert.match(await text('e'), /A\s*A\.0\s*pointer to #\d/);
  assert.match(await text('p'), /a\s*moved\s*n\s*1/);
  assert.match(await text('r'), /& to p\.n/);
  await page.waitForSelector('#memory .mv-arrows path.mv-a-shared', { state: 'attached' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: chapters 6 and 7 play through: a struct shows its fields, an if let shows its Some, a missing arm is E0004', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mission');
  const last = (n) => page.$eval('#memory input[type=range]', (e, v) => { e.value = e.max - v; e.dispatchEvent(new Event('input')); }, n);
  await page.click('[data-ch="5"]');
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  await last(1);
  assert.match(await page.textContent('#memory .mv-var:has(.mv-name:text-is("pet"))'), /Critter\s*name\s*pointer to #1\s*age\s*5/);
  assert.match(await page.textContent('#feedback'), /Mission complete/);
  await page.click('[data-ch="6"]');
  await page.click('#mission .dot[data-mi="1"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0004[\s\S]*Light::Green/);
  await page.click('#mission .dot[data-mi="8"]');
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  await last(1);
  assert.match(await page.textContent('#memory .mv-var:has(.mv-name:text-is("o"))'), /Option<u32>\s*Some\s*Some\.0\s*3/);
  assert.match(await page.textContent('#feedback'), /Mission complete/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at 390px');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: the memory view shows a Vec on the heap with its elements and owner, and says a moved field is a field', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mission');
  await page.fill('#code', 'struct P {\n    a: String,\n    n: i32,\n}\nfn main() {\n    let p = P { a: String::from("y"), n: 1 };\n    let mut v = Vec::new();\n    v.push(String::from("x"));\n    let t = p.a;\n    println!("{} {}", v.len(), t);\n}\n');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  const steps = await page.$eval('#memory input[type=range]', e => +e.max) + 1;
  const events = [];
  for (let i = 0; i < steps; i++) {
    await page.$eval('#memory input[type=range]', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, i);
    events.push(await page.textContent('#memory .mv-events'));
  }
  assert.ok(events.some(t => t.includes('A field of p moved (p.a), so it cannot be used any more.')), events.join('|'));
  assert.ok(!events.some(t => t.includes('The variable p.a')));
  await page.$eval('#memory input[type=range]', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, steps - 2);
  assert.match(await page.textContent('#memory .mv-var:has(.mv-name:text-is("v"))'), /Vec<String>\s*pointer to #\d/);
  const boxes = await page.$$eval('#memory .mv-box', els => els.map(e => e.textContent));
  assert.ok(boxes.some(t => /Vec\[pointer to #\d+\]owner: v/.test(t)), boxes.join('|'));
  assert.ok(boxes.some(t => /Stringxowner: v\[0\]/.test(t)), boxes.join('|'));
  assert.equal(await page.$eval('#memory', e => e.scrollWidth <= e.clientWidth + 1), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: a HashMap heap box shows no quotes, an owner that reads as a key, and entries in key order', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mission');
  await page.fill('#code', 'use std::collections::HashMap;\nfn main() {\n    let mut m = HashMap::new();\n    m.insert(2, String::from("b"));\n    m.insert(1, String::from("a"));\n    println!("{}", m.len());\n}\n');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  const steps = await page.$eval('#memory input[type=range]', e => +e.max) + 1;
  await page.$eval('#memory input[type=range]', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, steps - 2);
  const boxes = await page.$$eval('#memory .mv-box', els => els.map(e => e.textContent));
  assert.ok(boxes.some(t => /^#\d+HashMap\{1: pointer to #\d+, 2: pointer to #\d+\}owner: m$/.test(t)), boxes.join('|'));
  assert.ok(boxes.some(t => /Stringaowner: m\[value of key 1\]/.test(t)), boxes.join('|'));
  assert.equal(await page.$('#memory .mv-box:has(.mv-kind:text-is("HashMap")) q'), null);
  assert.equal(await page.$eval('#memory', e => e.scrollWidth <= e.clientWidth + 1), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: chapter 8 plays through: a loop shows its borrow of the Vec, a push in the loop is E0502, and a printed HashMap is refused for its order', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mission');
  const last = (n) => page.$eval('#memory input[type=range]', (e, v) => { e.value = e.max - v; e.dispatchEvent(new Event('input')); }, n);
  await page.click('[data-ch="7"]');
  await page.click('#mission .dot[data-mi="6"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0502[\s\S]*cannot borrow bucket as mutable/);
  await page.click('#mission .dot[data-mi="3"]');
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  const steps = await page.$eval('#memory input[type=range]', e => +e.max) + 1;
  let seen = false;
  for (let i = 0; i < steps && !seen; i++) {
    await page.$eval('#memory input[type=range]', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, i);
    seen = await page.$('#memory .mv-var:has(.mv-name:text-is("shell"))') !== null;
  }
  assert.ok(seen, 'the loop variable shows in the memory view');
  assert.match(await page.textContent('#feedback'), /Mission complete/);
  await page.click('#mission .dot[data-mi="8"]');
  await page.click('#bRun');
  await page.waitForSelector('#feedback');
  assert.match(await page.textContent('#feedback'), /depends on `?HashMap`? order/);
  assert.doesNotMatch(await page.textContent('#feedback'), /Mission complete/);
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  await last(1);
  assert.match(await page.textContent('#feedback'), /Mission complete/);
  await page.fill('#code', 'use std::collections::HashMap;\nfn main() {\n    let mut m = HashMap::new();\n    m.insert(1, 2);\n    m.insert(3, 4);\n    println!("{:?}", m);\n}\n');
  await page.click('#bRun');
  await page.waitForSelector('#result .note');
  assert.match(await page.textContent('#result'), /depends on the order of a `?HashMap`?/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at 390px');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: chapter 9 plays through: a used-up Result is E0382, ? in a plain fn is E0277, and main returning an Err shows the error output and exit code 1', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mission');
  await page.click('[data-ch="8"]');
  await page.click('#mission .dot[data-mi="4"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0382[\s\S]*borrow of moved value: r/);
  await page.click('#mission .dot[data-mi="5"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0277[\s\S]*operator can only be used in a function that returns Result or Option/);
  await page.click('#mission .dot[data-mi="8"]');
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .stderr');
  assert.match(await page.textContent('#result'), /Your program ended with an error[\s\S]*Pip and Gus each get 4[\s\S]*Error: Odd\(7\)[\s\S]*Exit code 1/);
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  assert.match(await page.textContent('#feedback'), /Mission complete/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at 390px');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: chapter 10 plays through: a struct that outlives its text is E0597, a struct holding a reference draws an arrow to the text, and a missing lifetime is E0726', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mission');
  await page.click('[data-ch="9"]');
  await page.click('#mission .dot[data-mi="7"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0597[\s\S]*words does not live long enough/);
  await page.click('#mission .dot[data-mi="6"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0726[\s\S]*implicit elided lifetime not allowed here/);
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  assert.match(await page.textContent('#feedback'), /Mission complete/);
  await page.$eval('#memory input[type=range]', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, 3);
  await page.waitForSelector('#memory .mv-arrows path.mv-a-shared', { state: 'attached' });
  assert.match(await page.textContent('#memory .mv-var:has(.mv-name:text-is("note"))'), /text/);
  assert.match(await page.textContent('#memory .mv-var:has(.mv-name:text-is("words"))'), /borrowed/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at 390px');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: chapter 11 plays through: a missing trait method is E0599, a type without Display is E0277, and a hand-written Display and a Drop run in the memory view', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mission');
  await page.click('[data-ch="10"]');
  await page.click('#mission .dot[data-mi="0"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0599[\s\S]*no method named .?sound.? found for .?struct.? .?Crab/);
  await page.click('#mission .dot[data-mi="5"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0277[\s\S]*Shell.? doesn't implement/);
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  assert.match(await page.textContent('#feedback'), /Mission complete/);
  assert.match(await page.textContent('#result'), /shell:4[\s\S]*shell:12/);
  await page.$eval('#memory input[type=range]', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, 4);
  assert.match(await page.textContent('#memory'), /Shell::fmt/);
  assert.match(await page.textContent('#memory'), /Formatter/);
  await page.click('#mission .dot[data-mi="6"]');
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  assert.match(await page.textContent('#feedback'), /Mission complete/);
  assert.match(await page.textContent('#result'), /closing inner[\s\S]*after the block[\s\S]*closing outer/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at 390px');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: chapter 12 plays through: a closure that outlives its function is E0373, a collect with no type is E0282, and a lazy pipeline prints in the order Rust runs it', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mission');
  await page.click('[data-ch="11"]');
  await page.click('#mission .dot[data-mi="1"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0502[\s\S]*cannot borrow .?log.? as mutable/);
  await page.click('#mission .dot[data-mi="5"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0373[\s\S]*closure may outlive the current function/);
  await page.click('#mission .dot[data-mi="6"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0282[\s\S]*type annotations needed/);
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  assert.match(await page.textContent('#feedback'), /Mission complete/);
  assert.match(await page.textContent('#result'), /before[\s\S]*doubling 2[\s\S]*doubling 5[\s\S]*doubling 9/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at 390px');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: chapter 13 plays through: an unopened Result is E0308, a missing lifetime is E0106, and the last mission adds up a day', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`, { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mission');
  await page.click('[data-ch="12"]');
  await page.click('#mission .dot[data-mi="3"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0308[\s\S]*mismatched types/);
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  assert.match(await page.textContent('#feedback'), /Mission complete/);
  await page.click('#mission .dot[data-mi="4"]');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0106[\s\S]*missing lifetime specifier/);
  await page.click('#mission .dot[data-mi="7"]');
  await page.click('#bRun');
  await page.waitForSelector('#result');
  assert.doesNotMatch(await page.textContent('#feedback'), /Mission complete/);
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#memory .mv-ctl input[type=range]');
  assert.match(await page.textContent('#feedback'), /Mission complete/);
  assert.match(await page.textContent('#result'), /Ok\(24\)[\s\S]*Err\(Unknown\("gem"\)\)[\s\S]*Ok\(0\)/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll at 390px');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: the field guide lists the error glossary in a section of its own, after the chapters', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`);
  await page.waitForSelector('#mission');
  await page.click('#t-guide');
  await page.waitForSelector('#guide .gsec');
  const heads = await page.$$eval('#guide .gsec h3', hs => hs.map(h => h.textContent.trim()));
  assert.equal(heads.filter(h => h.startsWith('Chapter')).length, 12, 'chapter 13 has no section of its own');
  assert.deepEqual(heads.slice(-2), ['Error glossary', 'Your progress']);
  assert.equal(await page.$$eval('#guide .gsec:nth-last-child(2) .card', cs => cs.length), 9);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: a failing run clears the stale "Mission complete" card', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`);
  await page.waitForSelector('#mission');
  await page.fill('#code', RUST_HELLO);
  await page.click('#bRun');
  await page.waitForSelector('#feedback .msg.win');
  await page.fill('#code', 'fn main() {\n    let x = 1;\n    x = 2;\n}\n');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result'), /E0384/);
  assert.equal(await page.$('#feedback .msg.win'), null);
  assert.equal((await page.textContent('#feedback')).trim(), '');
  await page.fill('#code', 'fn main() {\n    unsafe { }\n}\n');
  await page.click('#bRun');
  await page.waitForSelector('#result .card2');
  assert.equal(await page.$('#feedback .msg.win'), null);
  assert.equal((await page.textContent('#xpText')).trim(), '10 XP');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: missions 1.1 to 1.6 give XP once each, wrong tries give a hint and no XP, the last one earns the badge', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`);
  await page.waitForSelector('#mission');
  const ms = await page.evaluate(() => RQ.CH[0].missions.map(m => ({ answer: m.answer, wrong: m.wrong[0].src })));
  assert.equal(ms.length, 6);
  const xp = async () => (await page.textContent('#xpText')).trim();
  for (let i = 0; i < ms.length; i++) {
    await page.fill('#code', ms[i].wrong);
    await page.click('#bRun');
    await page.waitForSelector('#feedback .msg.tip, #result .diag');
    assert.equal(await xp(), `${i * 10} XP`);
    assert.equal(await page.$('#feedback .msg.win'), null);
    await page.fill('#code', ms[i].answer);
    await page.click('#bRun');
    await page.waitForSelector('#feedback .msg.win');
    assert.equal(await xp(), `${(i + 1) * 10} XP`);
    assert.match(await page.textContent('#feedback'), /Mission complete! \+10 XP/);
    const badge = /Badge earned: Moss's Note/.test(await page.textContent('#feedback'));
    assert.equal(badge, i === ms.length - 1);
    await page.click('#bRun');
    await page.waitForTimeout(100);
    assert.equal(await xp(), `${(i + 1) * 10} XP`);
    if (i < ms.length - 1) await page.click('#feedback [data-act="next"]');
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: the unsupported card names the feature and the line; the internal-error card links no learner code', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`);
  await page.waitForSelector('#mission');
  await page.fill('#code', 'fn main() {\n    unsafe { }\n}\n');
  await page.click('#bRun');
  await page.waitForSelector('#result .card2');
  assert.match(await page.textContent('#result .card2 h4'), /`?unsafe`?.*line 2|unsafe.*\(line 2\)/);
  assert.equal(await page.locator('#result a[href*="feature-request"]').count(), 1);
  await page.evaluate(() => { RQ.interp = () => { throw new Error('boom'); }; });
  await page.fill('#code', 'fn main() {\n    println!("SECRET-LEARNER-CODE");\n}\n');
  await page.click('#bRun');
  await page.waitForFunction(() => /bug, not your code/.test(document.getElementById('result').textContent));
  assert.match(await page.textContent('#result'), /nothing was counted/);
  const hrefs = await page.$$eval('#result a', as => as.map(a => a.getAttribute('href')));
  assert.equal(hrefs.length, 1);
  assert.match(hrefs[0], /feature-request/);
  assert.ok(!/SECRET|println/i.test(hrefs[0]));
  assert.equal((await page.textContent('#xpText')).trim(), '0 XP');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: a panic shows its output, the header and exit code 101, gives feedback, and the panic mission still completes', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`);
  await page.waitForSelector('#mission');
  await page.fill('#code', 'fn add(a: u8, b: u8) -> u8 {\n    a + b\n}\n\nfn main() {\n    println!("before");\n    println!("{}", add(250, 10));\n}\n');
  await page.click('#bRun');
  await page.waitForSelector('#result .stderr');
  const result = await page.textContent('#result');
  assert.match(result, /before/);
  assert.match(result, /panicked at src\/main\.rs/);
  assert.match(result, /Exit code 101/);
  assert.match(await page.textContent('#feedback'), /Not quite yet[\s\S]*stopped with a panic: attempt to add with overflow/);
  for (const h of await page.$$eval('#result a', as => as.map(a => a.getAttribute('href')))) assert.ok(!/add|fn%20|fn /.test(h), h);
  assert.equal((await page.textContent('#xpText')).trim(), '0 XP');
  await page.click('.chap[data-ch="1"]');
  await page.click('.dot[data-mi="7"]');
  await page.click('[data-act="fill"]');
  await page.click('#bRun');
  await page.waitForSelector('#feedback .msg.win');
  assert.equal((await page.textContent('#xpText')).trim(), '10 XP');
  await page.click('#bRun');
  await page.waitForTimeout(100);
  assert.equal((await page.textContent('#xpText')).trim(), '10 XP');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rust-quest: a lint card shows the lint id, the line and a tip, and does not complete the mission', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/rust-quest/`);
  await page.waitForSelector('#mission');
  await page.fill('#code', 'fn main() {\n    let x: u8 = 255 + 1;\n    println!("{}", x);\n}\n');
  await page.click('#bRun');
  await page.waitForSelector('#result .diag');
  assert.match(await page.textContent('#result .diag .id'), /arithmetic_overflow · line 2/);
  assert.ok((await page.textContent('#result .diag .note')).trim().length > 10);
  assert.equal(await page.$('#feedback .msg.win'), null);
  assert.equal((await page.textContent('#xpText')).trim(), '0 XP');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-algebra suggests Order of operations until it is done, and the link opens that chapter', async () => {
  const { ctx, page, errors } = await open(`${base}/math/algebra/`);
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
  await page.waitForURL(/\/math\/arithmetic\//);
  await page.waitForSelector('#mission');
  const u = new URL(page.url());
  assert.equal(u.pathname + u.hash, '/math/arithmetic/#ch=arithmetic.order');
  assert.match(await page.textContent('#chapters [aria-current="true"]'), /Order of operations/);
  assert.match(await page.textContent('#mission'), /Mission 2 of 5/, 'opens the first open mission of the chapter');
  await page.goto(`${base}/math/arithmetic/#guide`);
  await page.waitForSelector('#guide .card');
  assert.ok(await page.isVisible('#tab-guide') && !(await page.isVisible('#tab-quest')), '#guide opens the field guide');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-arithmetic: the working area passes a mission once, keeps the working, and a scene mission passes from its sliders', async () => {
  const { ctx, page, errors } = await open(`${base}/math/arithmetic/`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
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
  const { ctx, page, errors } = await open(`${base}/math/geometry/`);
  const hint = () => page.textContent('#mission .prereq');
  await page.waitForSelector('#mission .prereq');
  assert.match(await hint(), /Suggested first: Order of operations \(Arithmetic\), not done yet/);
  assert.match(await hint(), /area formulas such as ½ × b × h are worked out with the order of operations/);
  await page.click('#chapters [data-ch="1"]');
  await until(async () => /^Ready: this chapter needs nothing first/.test(await hint()));
  await page.click('#chapters [data-ch="0"]');
  await until(async () => /Suggested first/.test(await hint()));
  await page.click('#mission .prereq a');
  await page.waitForURL(/\/math\/arithmetic\//);
  const u = new URL(page.url());
  assert.equal(u.pathname + u.hash, '/math/arithmetic/#ch=arithmetic.order');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-geometry: a mission picture hides the answer until solved, then shows it as a check', async () => {
  const { ctx, page, errors } = await open(`${base}/math/geometry/#ch=geometry.pythagoras`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
  await page.waitForSelector('#work input.mq-field');
  const shown = async () => (await page.textContent('#scene .mq-live')) + ' ' + (await page.textContent('#scene .mq-desc'));
  assert.doesNotMatch(await shown(), /c = 5\b|= 25\b/, 'legs 3 and 4 open without the hypotenuse');
  await page.click('#work input.mq-field');
  await page.keyboard.type('sqrt(3^2+4^2)');
  await page.keyboard.press('Enter');
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#feedback .msg.win');
  await until(async () => /25/.test(await shown()));
  await page.reload();
  await page.waitForSelector('#scene .mq-live');
  assert.match(await shown(), /25/, 'a solved mission opens on the full picture');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-geometry: text mode passes an area mission, and an angle answer with a degree sign', async () => {
  const { ctx, page, errors } = await open(`${base}/math/geometry/`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
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

  await page.goto(`${base}/math/geometry/#ch=geometry.angles`);
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

test('math-trigonometry: a rounded mission passes in text mode, and the scene angle follows the keys', async () => {
  const { ctx, page, errors } = await open(`${base}/math/trigonometry/`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
  await page.waitForSelector('#work input.mq-field');
  assert.equal(await page.$eval('#mission details.how-hidden', d => d.open), false, 'How it works stays closed until solved');
  await page.click('#work input.mq-field');
  await page.keyboard.type('10*sin(35)');
  await page.keyboard.press('Enter');
  await page.keyboard.type('10*0.5736');
  await page.keyboard.press('Enter');
  await page.keyboard.type('5.7');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#feedback .msg.win');
  assert.deepEqual(await page.$$eval('#work .mq-mark', m => m.map(x => x.textContent).filter(Boolean)), ['✓', '✓', '✓']);
  await until(async () => JSON.parse(await read(page, 'math-trigonometry-v1') || '{}').xp === 10);
  const live = () => page.textContent('#scene .mq-live');
  assert.match(await live(), /sin 35° = 5\.7 \/ 10 = 0\.57\./, 'once solved, the picture reveals the opposite side');
  assert.equal(await page.$$eval('#mission details.how-hidden', d => d.length), 0, 'once solved, How it works is shown open');
  assert.ok(await page.isVisible('#mission .how'));
  await page.focus('#scene circle.drag[aria-label="angle"]');
  await page.keyboard.press('ArrowRight');
  assert.match(await live(), /sin 30° = 5 \/ 10 = 0\.50\./);
  await page.goto(`${base}/math/trigonometry/#ch=trigonometry.ratios`);
  await page.click('#mission .dot[data-mi="4"]');
  await page.waitForSelector('#work', { state: 'hidden' });
  await page.focus('#scene circle.drag[aria-label="angle"]');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await page.waitForSelector('#feedback .msg.win');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-trigonometry: a visual-mode answer with sin passes', async () => {
  const { ctx, page, errors } = await open(`${base}/math/trigonometry/`);
  await page.waitForSelector('#work math-field');
  const fill = async (i, latex) => {
    await page.locator('#work math-field').nth(i).focus();
    await page.evaluate(latex => { document.activeElement.setValue(latex); }, latex);
  };
  await fill(0, '10\\sin\\left(35\\right)');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('#work math-field').length > 1);
  await fill(1, '5.7');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#feedback .msg.win');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-arithmetic: #ch=arithmetic.fractions opens Fractions, and its first mission passes on a simplest-form fraction', async () => {
  const { ctx, page, errors } = await open(`${base}/math/arithmetic/#ch=arithmetic.fractions`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
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
  const { ctx, page, errors } = await open(`${base}/math/arithmetic/`);
  const live = () => page.textContent('#scene .mq-live');
  const go = async (ch, mi) => {
    await page.evaluate(([c, m]) => localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 0, ch: c, mi: m, done: {}, badges: {} })), [ch, mi]);
    await page.reload();
    await page.waitForSelector('#scene .mq-live');
  };
  await go(0, 0);
  assert.match(await live(), /Step 0: {2}6 \+ 4 × 3 {3}and {3}\(6 \+ 4\) × 3/);
  await go(0, 1);
  assert.match(await live(), /12 coins cut into 2 equal piles, then 3 of those piles/);
  await go(0, 4);
  assert.match(await live(), /Step 0: {2}2 \+ 3 × 4/, 'a scene mission keeps the chapter picture');
  await go(1, 1);
  assert.match(await live(), /\(−4\) × \(−2\) coins: 4 across, 2 up/);
  await go(2, 1);
  assert.match(await live(), /2\/3 × 4\/5 of the baker's tray: 2 of 3 columns and 4 of 5 rows/);
  await go(3, 0);
  assert.match(await live(), /2³: 3 copies of 2 multiplied/);
  await go(4, 3);
  assert.match(await live(), /jacket costs 40 coins, grown by 25%/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-arithmetic: the cold-cellar story picture follows the Story setting in place and keeps the sliders', async () => {
  const { ctx, page, errors } = await open(`${base}/math/arithmetic/`);
  await page.evaluate(() => localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 0, ch: 1, mi: 0, done: {}, badges: {} })));
  await page.reload();
  await page.waitForSelector('#scene .mq-live');
  const live = () => page.textContent('#scene .mq-live'), label = () => page.getAttribute('#scene svg', 'aria-label');
  const icons = () => page.locator('#scene svg .icon').count();
  assert.match(await live(), /^At dusk the cellar thermometer reads −3°\. Overnight it changes by −5°/);
  assert.equal(await label(), 'The cold cellar thermometer');
  assert.equal(await icons(), 1, 'the dawn mark');
  await page.fill('#scene input[type=number][aria-label="a value"]', '1');
  await page.dispatchEvent('#scene input[type=number][aria-label="a value"]', 'input');
  assert.match(await live(), /reads 1°/);
  await pick(page, 'story', 'off');
  assert.match(await live(), /^Start at 0, move 1, then move −5/);
  assert.equal(await label(), 'Two arrows along the number line');
  assert.equal(await icons(), 0);
  assert.equal(await page.inputValue('#scene input[type=number][aria-label="a value"]'), '1', 'the slider keeps its value');
  assert.equal(await page.locator('#feedback .msg').count(), 0, 'swapping fires no check');
  await pick(page, 'story', 'on');
  assert.match(await live(), /reads 1°/);
  assert.equal(await page.inputValue('#scene input[type=number][aria-label="a value"]'), '1');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-arithmetic: a scene mission on a story picture still completes, with Story On and Off', async () => {
  for (const mode of ['on', 'off']) {
    const { ctx, page, errors } = await open(`${base}/math/arithmetic/`, {}, c => c.addInitScript(m => {
      localStorage.setItem('playgrounds-story', m);
      if (!localStorage.getItem('math-arithmetic-v1')) localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 0, ch: 1, mi: 4, done: {}, badges: {} }));
    }, mode));
    await page.waitForSelector('#scene .mq-live');
    assert.equal(await page.locator('#scene svg .icon').count() > 0, mode === 'on');
    for (const [n, v] of [['a', '-3'], ['b', '-4']]) {
      await page.fill(`#scene input[type=number][aria-label="${n} value"]`, v);
      await page.dispatchEvent(`#scene input[type=number][aria-label="${n} value"]`, 'input');
    }
    await page.waitForSelector('#feedback .msg.win');
    assert.deepEqual(errors, [], mode);
    await ctx.close();
  }
});

test('math-geometry: scene points move with the arrow keys and a pointer, and the live area and angles follow', async () => {
  const { ctx, page, errors } = await open(`${base}/math/geometry/`);
  const live = () => page.textContent('#scene .mq-live');
  await page.waitForSelector('#scene .mq-live');
  assert.ok((await page.$$('#scene .grid line')).length > 10, 'the area scene has a grid');
  assert.equal(await live(), 'The floor: base b = 12 tiles, height h = 7 tiles.', 'the first mission opens on its own 12 by 7 floor, without the area it asks for');
  const corner = '#scene circle.drag[aria-label="top right corner of the rectangle"]';
  await page.focus(corner);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await live(), 'The floor: base b = 11 tiles, height h = 7 tiles.');
  await page.keyboard.press('ArrowDown');
  assert.equal(await live(), 'The floor: base b = 11 tiles, height h = 6 tiles.');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'top right corner of the rectangle', 'focus survives the redraw');
  await page.click('#mission .dot[data-mi="2"]');
  await page.waitForFunction(() => /10 × 8/.test(document.querySelector('#scene .mq-live').textContent));
  assert.equal(await live(), 'The room starts as 10 × 8 tiles. The dashed corner is cut off: 4 × 3.', 'the L-shaped room has its own picture');

  await page.goto(`${base}/math/geometry/#ch=geometry.angles`);
  await page.click('#mission .dot[data-mi="4"]');
  await page.waitForSelector('#work', { state: 'hidden' });
  assert.equal(await live(), 'The fan window: 40° + 70° + 70° = 180°');
  const first = '#scene circle.drag[aria-label="first ray"]', second = '#scene circle.drag[aria-label="second ray"]';
  await page.focus(first);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await live(), 'The fan window: 50° + 60° + 70° = 180°');
  assert.equal(await page.getAttribute(first, 'aria-valuetext'), '50°');
  const box = await page.locator('#scene svg').boundingBox(), dot = await page.locator(first).boundingBox();
  const screen = (x, y) => [box.x + (x + 5.5) / 11 * box.width, box.y + (5.5 - y) / 6.5 * box.height];
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
  await page.mouse.down();
  await page.mouse.move(...screen(4 * Math.cos(Math.PI / 3), 4 * Math.sin(Math.PI / 3)), { steps: 5 });
  await page.mouse.up();
  assert.equal(await live(), 'The fan window: 60° + 50° + 70° = 180°');
  await page.focus(second);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await live(), 'The fan window: 60° + 60° + 60° = 180°');
  await page.waitForSelector('#feedback .msg.win');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-geometry: each angle mission opens on its own picture and numbers', async () => {
  const { ctx, page, errors } = await open(`${base}/math/geometry/#ch=geometry.angles`);
  const live = () => page.textContent('#scene .mq-live');
  await page.waitForSelector('#scene .mq-live');
  assert.equal(await live(), 'The fan window: 47° + x = 180°');
  const want = [[1, 'The rose window: 110° + 95° + 80° + x = 360°'], [2, 'Bram\'s pane: 58° + 71° + x = 180°'], [3, 'Bram\'s nippers: the two opposite angles of 60° are 120° together. Aim for 76°.']];
  for (const [i, text] of want) {
    await page.click(`#mission .dot[data-mi="${i}"]`);
    await page.waitForFunction(t => document.querySelector('#scene .mq-live').textContent === t, text);
  }
  await page.focus('#scene circle.drag[aria-label="angle between the lines"]');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await live(), 'Bram\'s nippers: the two opposite angles of 61° are 122° together. Aim for 76°.');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-geometry: Pythagoras passes a rounded mission in text mode, and a leg moves the live sum', async () => {
  const { ctx, page, errors } = await open(`${base}/math/geometry/#ch=geometry.pythagoras`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
  await page.waitForSelector('#work input.mq-field');
  const live = () => page.textContent('#scene .mq-live');
  assert.equal(await live(), 'The roof beam: a² = 9, b² = 16, c² = ?');
  const leg = '#scene circle.drag[aria-label="leg a"]';
  await page.focus(leg);
  await page.keyboard.press('ArrowRight');
  assert.equal(await live(), 'The roof beam: a² = 16, b² = 16, c² = ?');
  await page.click('#mission .dot[data-mi="2"]');
  await page.waitForFunction(() => /^The roof beam: 8² \+ 5²/.test(document.querySelector('#scene .mq-live').textContent));
  assert.equal(await live(), 'The roof beam: 8² + 5² = 64 + 25 = 89, so c = √89 ≈ 9.43. Aim for c = 13.', 'the missing-leg mission opens on the 5 leg and the 13 to reach');
  await page.click('#mission .dot[data-mi="3"]');
  await page.waitForSelector('#work input.mq-field');
  assert.match(await page.textContent('#mission h2'), /Not a whole number/);
  assert.equal(await live(), 'The roof beam: a² = 25, b² = 49, c² = ?');
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
  const { ctx, page, errors } = await open(`${base}/math/geometry/#ch=geometry.circles`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
  await page.waitForSelector('#work input.mq-field');
  const live = () => page.textContent('#scene .mq-live');
  assert.equal(await live(), 'The fountain\'s radius is r = 5, so its diameter is d = 10.', 'the first mission opens on its pond, radius 5, without the circumference it asks for');
  await page.focus('#scene circle.drag[aria-label="radius r"]');
  await page.keyboard.press('ArrowRight');
  assert.equal(await live(), 'The fountain\'s radius is r = 5.5, so its diameter is d = 11.');
  await page.click('#mission .dot[data-mi="2"]');
  await page.waitForFunction(() => document.querySelector('#scene .mq-live').textContent === 'The table top is d = 14 across.');
  await page.click('#mission .dot[data-mi="3"]');
  await page.waitForFunction(() => /path you need is 30 long/.test(document.querySelector('#scene .mq-live').textContent));
  assert.equal(await live(), 'The ring path: r = 3, C = 2 × π × 3 ≈ 18.85. The path you need is 30 long.');
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
  const { ctx, page, errors } = await open(`${base}/math/algebra/#ch=algebra.linear`, {}, c => c.addInitScript(() => localStorage.setItem('math-prefs-v1', '{"input":"text"}')));
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
  const { ctx, page, errors } = await open(`${base}/math/algebra/`);
  const live = () => page.textContent('#scene .mq-live');
  const at = async (ch, mi) => {
    await page.goto(`${base}/math/algebra/#ch=algebra.${ch}`);
    await page.click(`#mission .dot[data-mi="${mi}"]`);
    return live();
  };
  assert.match(await at('expressions', 0), /V = 10·5·3 = \?/);
  assert.match(await at('expressions', 4), /2a \+ 3a = 4 \+ 6 = 10/);
  assert.match(await at('expanding', 0), /3 × 5 = 9 \+ 6 = 15/);
  assert.match(await at('expanding', 1), /x = 7: 2 × 3 = 6$/);
  assert.match(await at('expanding', 3), /\(3 \+ 2\)\(3 \+ 2\) = 9 \+ 6 \+ 6 \+ 4 = 25/);
  assert.match(await at('factoring', 0), /k = 1: 6 x-pieces and 9 units both split into 1 equal row/);
  await page.fill('#scene input[type=range]', '2');
  assert.match(await live(), /k = 2: 9 units do not split into 2 equal rows/);
  await page.fill('#scene input[type=range]', '3');
  assert.match(await live(), /k = 3: 6 x-pieces and 9 units both split into 3 equal rows/);
  assert.match(await at('factoring', 2), /x = 6 on a side, with a 3 by 3 corner fenced off: 36 − 9 = 27$/);
  assert.match(await at('factoring', 3), /25 − 10 − 10 \+ 4 = 9$/);
  assert.match(await at('quadratics', 1), /y = x² − 16: where does it meet the x-axis\?/);
  assert.match(await at('quadratics', 2), /y = x² − 3x: where does it meet the x-axis\?/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-algebra: Linear equations suggests Fractions (Arithmetic) until its badge is earned', async () => {
  const { ctx, page, errors } = await open(`${base}/math/algebra/#ch=algebra.linear`);
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
  const { ctx, page, errors } = await open(`${base}/math/arithmetic/#fire`, {}, c => c.addInitScript(d => localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 50, done: d, badges: {} })), done));
  await page.click('#fStart');
  await page.waitForSelector('#fAns');
  // Phone number pads (inputmode=numeric) have no minus key, and Negative numbers asks for negative answers.
  assert.notEqual(await page.getAttribute('#fAns', 'inputmode'), 'numeric');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('math-arithmetic: Powers and roots suggests Negative numbers until it is done', async () => {
  const { ctx, page, errors } = await open(`${base}/math/arithmetic/#ch=arithmetic.powers`);
  await page.waitForSelector('#mission .prereq');
  assert.match(await page.textContent('#mission .prereq'), /Suggested first: Negative numbers \(Arithmetic\), not done yet/);
  assert.match(await page.textContent('#mission .prereq'), /\(−2\)² and −2² part ways/);
  assert.equal(await page.getAttribute('#mission .prereq a', 'href'), '#ch=arithmetic.negatives');
  assert.deepEqual(errors, []);
  await ctx.close();
  // The page saves its own state as it unloads, so the finished save is set before the next page loads.
  const done = await open(`${base}/math/arithmetic/#ch=arithmetic.powers`, {}, c => c.addInitScript(() => localStorage.setItem('math-arithmetic-v1', JSON.stringify({ xp: 75, done: {}, badges: { 0: true, 1: true } }))));
  await done.page.waitForSelector('#mission .prereq');
  assert.match(await done.page.textContent('#mission .prereq'), /^Ready/);
  assert.deepEqual(done.errors, []);
  await done.ctx.close();
});

test('a notes-only save counts as progress: it is exported and restored from the linked file', async () => {
  const key = 'python-quest-v1';
  const { ctx, page, errors } = await open(`${base}/programming/python-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  assert.match(await page.textContent('#mission h2'), /Badge earned: Backup Chest/);
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
  assert.equal(await page.locator('.nv-trophy').count(), 0);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/harbor-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  const { ctx, page } = await open(`${base}/programming/shell-quest/`);
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
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
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
  const o = await open(`${base}/programming/shell-quest/`, opts, prep);
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

test('shell-quest editor: an unchanged Save does not count as writing the file', async () => {
  const { ctx, page, errors, type, waitScreen, screen } = await shellPage({ viewport: { width: 1280, height: 900 } });
  await page.click('#chapters [data-ch="1"]');
  await type('mkdir camp && echo "Day 1" > camp/diary.txt && echo "Day 2" > camp/notes.txt');
  await waitScreen(/Mission complete: Build a camp/);
  await type('cat camp/notes.txt >> camp/diary.txt');
  await page.click('#mission .dot[data-mi="4"]');
  assert.match(await page.textContent('#mission h2'), /Add a second entry/);
  await type('nano camp/diary.txt');
  await page.waitForSelector('#editor:not([hidden])');
  await page.click('#edSave');
  await waitScreen(/Saved camp\/diary\.txt/);
  assert.doesNotMatch(await screen(), /Mission complete: Add a second entry/);
  await page.fill('#edText', 'Day 1\nDay 2\nDay 3\n');
  await page.click('#edSave');
  await waitScreen(/Mission complete: Add a second entry/);
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
  assert.match(await page.textContent('#hintBox'), /Use nano scripts\/hi\.sh to write it, then try it with bash scripts\/hi\.sh\./);
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
  await waitScreen(/Mission complete: Capstone: the backup chest script/);
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
        await page.press('#cmd', 'Enter');
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
  const BADGES = { 15: 'Lamp Switch', 16: 'Bell Rope', 17: 'Visitor Ranking', 18: "Ada's Vault" };
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

test('Settings panel switches theme between Auto, Light and Dark, remembers it and sets data-theme', async () => {
  for (const url of [base + '/', `${base}/programming/shell-quest/`]) {
    const { ctx, page, errors } = await open(url, { colorScheme: 'light' });
    const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(await attr(), null, url);
    assert.ok(await page.isChecked('#st-panel input[name="st-theme"][value="auto"]'), url);
    const light = await bg();
    await pick(page, 'theme', 'light');
    assert.equal(await attr(), 'light', url);
    await pick(page, 'theme', 'dark');
    assert.equal(await attr(), 'dark', url);
    assert.notEqual(await bg(), light, 'dark should change the page background');
    await page.reload();
    assert.equal(await attr(), 'dark', 'choice survives a reload');
    assert.ok(await page.isChecked('#st-panel input[name="st-theme"][value="dark"]'));
    await pick(page, 'theme', 'auto');
    assert.equal(await attr(), null, 'back to auto');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Settings panel opens from one header button, closes on Escape or an outside click, and fits a phone', async () => {
  for (const url of [base + '/', ...PAGES.map(u => `${base}/${u}`)]) {
    const { ctx, page, errors } = await open(url, { viewport: { width: 390, height: 800 } });
    assert.equal(await page.locator('.st-trigger').count(), 1, url);
    assert.equal(await page.locator('.theme-toggle, .story-toggle').count(), 0, `${url}: the old buttons are gone`);
    await page.click('.st-trigger');
    assert.equal(await page.getAttribute('.st-trigger', 'aria-expanded'), 'true', url);
    const box = await page.locator('#st-panel').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, `${url}: the panel stays on screen (${Math.round(box.x)}..${Math.round(box.x + box.width)})`);
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#st-panel').isHidden(), `${url}: Escape closes it`);
    assert.ok(await page.evaluate(() => document.activeElement.classList.contains('st-trigger')), `${url}: focus returns to the button`);
    await page.click('.st-trigger');
    await page.mouse.click(5, 795);
    assert.ok(await page.locator('#st-panel').isHidden(), `${url}: an outside click closes it`);
    assert.deepEqual(errors, [], url);
    await ctx.close();
  }
});

test('every playground header stays on one row from 1280px to 1440px with the web fonts', async () => {
  for (const url of PAGES) {
    for (const width of [1280, 1366, 1440]) {
      // This test needs the web fonts that open() blocks, because learners lay out in them.
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`${base}/${url}`);
      await page.evaluate(() => document.fonts.ready);
      const fonts = await page.evaluate(() => [...document.fonts].some(f => f.status === 'loaded'));
      assert.ok(fonts, `${url}: the web fonts did not load, so this layout check cannot run`);
      const spread = await page.evaluate(() => {
        const mids = [...document.querySelector('header.top').children].map(e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; });
        return Math.max(...mids) - Math.min(...mids);
      });
      assert.ok(spread < 16, `${url}: the header wraps at ${width}px (item centres ${Math.round(spread)}px apart)`);
      await ctx.close();
    }
  }
});

const trailText = page => page.evaluate(() => {
  const e = document.querySelector('.trail').cloneNode(true);
  e.querySelector('.trail-tag').remove();
  return e.textContent;
});
const plainText = html => html.replace(/<[^>]+>/g, '');

test('the trail strip shows the chapter story on a later mission of every playground', async () => {
  for (const url of PAGES) {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 800 }]) {
      const { ctx, page, errors } = await open(`${base}/${url}`, { viewport });
      const key = await page.evaluate(() => window.PROGRESS.key);
      await page.locator('.dots .dot').nth(1).click();
      await page.locator('.trail').waitFor({ state: 'visible' });
      assert.equal(await page.textContent('.trail-tag'), 'The trail', url);
      assert.equal(await trailText(page), plainText(CHAPTERS[key]()[0].story), `${url} at ${viewport.width}px`);
      assert.equal(await overflow(page), false, `${url} at ${viewport.width}px`);
      assert.deepEqual(errors, [], url);
      await ctx.close();
    }
  }
});

test('Story setting hides the trail strip, remembers the choice across reloads and playgrounds', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/shell-quest/`);
  const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-story'));
  assert.equal(await attr(), 'on');
  assert.ok(await page.isChecked('#st-panel input[name="st-story"][value="on"]'));
  await page.locator('.dots .dot').nth(1).click();
  assert.ok(await page.locator('.trail').isVisible());
  await pick(page, 'story', 'off');
  assert.equal(await attr(), 'off');
  assert.ok(await page.locator('.trail').isHidden());
  await page.reload();
  assert.equal(await attr(), 'off', 'choice survives a reload');
  assert.ok(await page.isChecked('#st-panel input[name="st-story"][value="off"]'));
  const other = await ctx.newPage();
  await other.goto(`${base}/math/arithmetic/`);
  assert.equal(await other.evaluate(() => document.documentElement.getAttribute('data-story')), 'off', 'one setting for every playground');
  await other.locator('.dots .dot').nth(1).click();
  assert.ok(await other.locator('.trail').isHidden());
  await pick(other, 'story', 'on');
  assert.ok(await other.locator('.trail').isVisible());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('ds-quest field guide: each explainer runs its operations and examples draw a picture', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/ds-quest/`, { viewport: { width: 1280, height: 900 } });
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
  const o = await open(`${base}/programming/net-quest/`, { viewport: { width: 1280, height: 900 }, ...opts }, prep);
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

const AGENT_KEYS = ['badges', 'best', 'ch', 'done', 'mi', 'tab', 'xp'];
const seedAgent = raw => c => c.addInitScript(v => { if (!sessionStorage.seeded) { localStorage.setItem('agent-quest-v1', v); sessionStorage.seeded = 1; } }, raw);
async function agentPage(opts = {}, prep) {
  const o = await open(`${base}/programming/agent-quest/`, { viewport: { width: 1280, height: 900 }, ...opts }, prep);
  o.console = [];
  o.page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) o.console.push(m.text()); });
  await o.page.waitForSelector('#runBtn');
  o.xp = async () => (await o.page.textContent('#xpText')).trim();
  o.stored = async () => JSON.parse(await read(o.page, 'agent-quest-v1'));
  o.solve = async () => { await o.page.click('#promptHost [data-act="fill"]'); await o.page.click('#runBtn'); };
  return o;
}

test('agent-quest: a clean load stores a pristine state with xp 0 and the whitelisted keys', async () => {
  const { ctx, errors, stored, console } = await agentPage();
  const s = await stored();
  assert.equal(s.xp, 0);
  assert.deepEqual(s.done, {});
  assert.deepEqual(Object.keys(s).sort(), AGENT_KEYS);
  assert.deepEqual(errors, []);
  assert.deepEqual(console, []);
  await ctx.close();
});

test('agent-quest: a tampered xp is replaced at boot by the value derived from done', async () => {
  const done = { '0.0': true };
  const o = await agentPage({}, seedAgent(JSON.stringify({ ch: 0, mi: 1, done, xp: 999, badges: {}, best: 0, tab: 'quest' })));
  const want = await o.page.evaluate(d => window.AQ.state.xpFor(d, {}), done);
  assert.ok(want > 0 && want !== 999);
  assert.equal((await o.stored()).xp, want);
  assert.equal(await o.xp(), `${want} XP`);
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: finishing a mission awards XP once, even if it is run again or after a reload', async () => {
  const o = await agentPage();
  const { page } = o;
  assert.equal(await o.xp(), '0 XP');
  await o.solve();
  assert.equal(await o.xp(), '10 XP');
  assert.equal(await page.$$eval('#mission .dot.done', e => e.length), 1);
  assert.equal(await page.$$eval('#feedback .win', e => e.length), 1);
  await page.click('#runBtn');
  assert.equal(await o.xp(), '10 XP');
  await until(async () => (await o.stored()).xp === 10);
  assert.deepEqual(Object.keys((await o.stored()).done), ['0.0']);
  await page.reload();
  await page.waitForSelector('#runBtn');
  assert.equal(await o.xp(), '10 XP');
  await o.solve();
  assert.equal(await o.xp(), '10 XP');
  assert.equal((await page.textContent('#feedback')).includes('already earned'), true);
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: the feedback follows the latest run (pass, fail, pass)', async () => {
  const o = await agentPage();
  const { page } = o;
  await o.solve();
  assert.equal(await page.locator('#feedback .win').count(), 1);
  await page.fill('#pf-donewhen', '');
  await page.click('#runBtn');
  assert.equal(await page.locator('#feedback .tip').count(), 1);
  assert.equal(await page.locator('#feedback .win').count(), 0);
  await o.solve();
  assert.equal(await page.locator('#feedback .win').count(), 1);
  assert.equal(await page.locator('#feedback .tip').count(), 0, 'the stale tip is gone');
  assert.equal(await o.xp(), '10 XP');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: a damaged save loads without errors and is replaced by the normalized state', async () => {
  for (const [raw, want] of [['{"done":5,"xp":"x"}', 0], ['not json', 0], ['[1,2]', 0],
    ['{"done":{"9.9":true,"0.0":true},"xp":-5,"ch":99,"mi":-1,"tab":"nope","answers":{"0.0":"typed"},"best":"x"}', 10]]) {
    const o = await agentPage({}, seedAgent(raw));
    const s = await o.stored();
    assert.equal(s.xp, want, raw);
    assert.deepEqual(Object.keys(s).sort(), AGENT_KEYS, raw);
    assert.equal(s.tab, 'quest', raw);
    assert.equal(await o.xp(), `${want} XP`, raw);
    assert.ok((await o.page.textContent('#mission h2')).trim().length > 3, raw);
    assert.deepEqual(o.errors, [], raw);
    assert.deepEqual(o.console, [], raw);
    await o.ctx.close();
  }
});

test('agent-quest: a line that does not parse shows an inline error, has no effect, and is shown as text', async () => {
  const o = await agentPage();
  const { page } = o;
  await page.click('#mission .dot[data-mi="1"]');
  await page.fill('#pf-constraints', "be careful and don't delete anything");
  assert.equal(await page.locator('#perrs li').count(), 1);
  assert.match(await page.textContent('#perrs li'), /be careful/);
  await page.click('#runBtn');
  assert.equal(await page.locator('#run .steps').count(), 0, 'no run happens while a line is rejected');
  assert.equal(await page.locator('#feedback .msg').count(), 0, 'no feedback either');
  assert.equal(await o.xp(), '0 XP');
  assert.equal(await page.evaluate(() => document.activeElement.closest('#perrs') !== null), true, 'focus goes to the error');
  await page.fill('#pf-constraints', '<img src=x onerror="window.__x=1"> and <b>bold</b>');
  assert.equal(await page.$('#perrs img'), null);
  assert.equal(await page.$('#perrs b'), null);
  assert.match(await page.textContent('#perrs'), /<img src=x/);
  await page.click('#runBtn');
  assert.equal(await page.$('#feedback img'), null);
  assert.equal(await page.evaluate(() => window.__x), undefined);
  assert.equal(await page.locator('#run .steps').count(), 0);
  await page.fill('#pf-constraints', 'do not delete data/');
  assert.equal(await page.locator('#perrs li').count(), 0);
  await page.click('#runBtn');
  assert.equal(await page.locator('#run .steps li').count() > 0, true, 'the run happens once every line parses');
  assert.equal(await page.locator('#feedback .win').count(), 1);
  assert.equal(await o.xp(), '10 XP');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: Plan first pauses the run until the plan is approved', async () => {
  const withPlan = async ctx => ctx.route('**/agent-quest/content/ch-01-loop.js', async r => {
    const res = await r.fetch();
    await r.fulfill({ response: res, body: (await res.text()).replace("fields:['goal','donewhen'],", "fields:['goal','donewhen','plan'],") });
  });
  const o = await agentPage({}, withPlan);
  const { page } = o;
  await page.click('#promptHost [data-act="fill"]');
  await page.check('#pf-plan');
  await page.click('#runBtn');
  assert.equal(await page.locator('#run .steps li').count(), 2, 'only the context and the plan');
  assert.match(await page.textContent('#run .steps'), /Plan: change src\/price\.js/);
  assert.equal(await page.isVisible('#run [data-act="approve"]'), true);
  assert.match(await page.textContent('#feedback'), /Waiting for your approval/);
  assert.equal(await o.xp(), '0 XP');
  await page.click('#run [data-act="approve"]');
  assert.equal(await page.locator('#run [data-act="approve"]').count(), 0);
  assert.ok(await page.locator('#run .steps li').count() > 4);
  assert.match(await page.textContent('#run .steps'), /Plan approved/);
  assert.equal(await page.locator('#feedback .win').count(), 1);
  assert.equal(await o.xp(), '10 XP');
  await page.check('#pf-plan');
  await page.click('#runBtn');
  assert.equal(await page.locator('#run [data-act="approve"]').count(), 1);
  await page.fill('#pf-donewhen', 'run npm run lint');
  assert.equal(await page.locator('#run [data-act="approve"]').count(), 0,'editing the form drops the pending plan');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: nothing the learner types is ever stored', async () => {
  const o = await agentPage();
  const { page } = o;
  await page.fill('#pf-goal', 'zzsecretzz goal');
  await page.fill('#pf-donewhen', 'zzsecretzz check');
  await page.fill('#fileEditor textarea', 'zzsecretzz notes');
  await page.click('#runBtn');
  await o.solve();
  await until(async () => (await o.stored()).xp === 10);
  await page.waitForTimeout(500);
  const all = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  assert.ok(!all.includes('zzsecret'), 'a typed string reached storage');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: the config and budget missions are played in the file editor', async () => {
  const o = await agentPage();
  const { page } = o;
  await page.click('#mission .dot[data-mi="3"]');
  assert.equal(await page.isVisible('#pf-goal'), false, 'the prompt is fixed for this mission');
  await page.fill('#fileEditor textarea', 'do not delete data/');
  assert.match(await page.textContent('#fileEditor .rules'), /^1 line acts as rules/);
  await page.click('#runBtn');
  assert.equal(await o.xp(), '10 XP');
  await page.click('#mission .dot[data-mi="4"]');
  assert.match(await page.textContent('#meter .mlabel'), /~[6-9]\d\d of 2000 tokens/, 'the heavy memory file shows in the meter');
  await page.click('#runBtn');
  assert.equal(await page.locator('#feedback .tip').count(), 1);
  await page.click('#promptHost [data-act="fill"]');
  assert.match(await page.textContent('#meter .mlabel'), /~\d{1,2} of 2000 tokens/);
  await page.click('#runBtn');
  assert.equal(await o.xp(), '20 XP');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: the prompt form shows only the fields taught so far', async () => {
  const o = await agentPage();
  const { page } = o;
  const shown = () => page.$$eval('#promptHost [id^="pf-"]', es => es.map(e => e.id.slice(3)));
  assert.deepEqual(await shown(), ['goal', 'donewhen']);
  await page.click('#mission .dot[data-mi="1"]');
  assert.deepEqual(await shown(), ['goal', 'constraints', 'donewhen']);
  await page.click('#mission .dot[data-mi="2"]');
  assert.deepEqual(await shown(), ['goal', 'files', 'constraints', 'donewhen']);
  assert.equal(await page.locator('#pf-use, #pf-plan, #pf-examples, #pf-extra').count(), 0);
  await page.click('#promptHost [data-act="fill"]');
  assert.equal(await page.inputValue('#pf-files'), 'src/price.js');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

const seedAt = (ch, mi) => seedAgent(JSON.stringify({ ch, mi }));

test('agent-quest: chapter 3 shows Examples from its first mission and Plan from its fourth, never Use, and plays Plan first', async () => {
  const o = await agentPage({}, seedAt(2, 0));
  const { page } = o;
  const shown = () => page.$$eval('#promptHost [id^="pf-"]', es => es.map(e => e.id.slice(3)));
  assert.deepEqual(await shown(), ['goal', 'files', 'examples', 'constraints', 'donewhen']);
  await page.click('#mission .dot[data-mi="3"]');
  assert.deepEqual(await shown(), ['goal', 'files', 'examples', 'plan', 'constraints', 'donewhen']);
  assert.equal(await page.locator('#pf-use, #pf-extra').count(), 0);
  await page.click('#promptHost [data-act="fill"]');
  assert.equal(await page.isChecked('#pf-plan'), true);
  await page.click('#runBtn');
  assert.equal(await page.isVisible('#run [data-act="approve"]'), true);
  await page.click('#run [data-act="approve"]');
  assert.equal(await page.locator('#feedback .win').count(), 1);
  assert.equal(await o.xp(), '10 XP');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: chapter 4 edits a folder memory file, counts its rules and shows it in the meter once the agent reads there', async () => {
  const o = await agentPage({}, seedAt(3, 1));
  const { page } = o;
  const tree = await page.$$eval('#tree li', ls => ls.map(l => l.textContent));
  assert.ok(tree.includes('src/CLAUDE.md'), 'the folder memory file is editable, with no read-only mark');
  assert.ok(tree.some(t => t.startsWith('src/price.js') && t.endsWith('(read-only)')));
  await page.click('#tree [data-path="src/CLAUDE.md"]');
  await page.fill('#fileEditor textarea', '# Rules for work inside src/\ndo not edit src/legacy/\n');
  assert.match(await page.textContent('#fileEditor .rules'), /^1 line acts as rules/);
  await page.click('#runBtn');
  assert.equal(await o.xp(), '10 XP');
  await page.click('#mission .dot[data-mi="3"]');
  const memory = () => page.$eval('#meter tbody tr:nth-child(2) td.n', e => +e.textContent.slice(1));
  const before = await memory();
  await page.fill('#pf-files', 'src/price.js');
  assert.ok(await memory() > before, 'the folder memory file joins the Memory row once a file under it is read');
  await page.click('#runBtn');
  assert.equal(await o.xp(), '20 XP');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: chapter 5 loads the matching skill, shows its step in the run panel and its body in the meter', async () => {
  const o = await agentPage({}, seedAt(4, 0));
  const { page } = o;
  const skills = () => page.$eval('#meter tbody tr:nth-child(3) td.n', e => +e.textContent.slice(1));
  const before = await skills();
  await page.click('#promptHost [data-act="fill"]');
  assert.ok(await skills() > before, 'the loaded skill body joins the Skills row');
  await page.click('#runBtn');
  assert.match(await page.textContent('#run .steps'), /Skill release-guard loaded/);
  assert.match(await page.textContent('#run .steps'), /blocked by skill release-guard/);
  assert.equal(await o.xp(), '10 XP');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

// this scenario has no tag of its own, so only the fired-schedule branch of refresh() in app.js can make the meter count the skill body
test('agent-quest: a scheduled mission with no tag of its own loads the skill into the meter before the run (mission 20.2)', async () => {
  const o = await agentPage({}, seedAt(19, 1));
  const { page } = o;
  const skills = () => page.$eval('#meter tbody tr:nth-child(3) td.n', e => +e.textContent.slice(1));
  const before = await skills();
  await page.click('#promptHost [data-act="fill"]');
  assert.ok(await skills() > before, 'the schedule line makes this a schedule job, so the skill body joins the Skills row');
  await page.click('#runBtn');
  assert.match(await page.textContent('#run .steps'), /Skill quiet-hours loaded/);
  assert.match(await page.textContent('#run .steps'), /Schedule: starts weekly-review/);
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: chapter 5 names the duplicate skill that was not loaded, with no undefined', async () => {
  const o = await agentPage({}, seedAt(4, 1));
  const { page } = o;
  await page.click('#runBtn');
  const steps = await page.textContent('#run .steps');
  assert.match(steps, /Skill release-notes not loaded \(duplicate\)/);
  assert.doesNotMatch(steps, /undefined/);
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: chapter 2 previews earlier messages and notes the ones dropped to fit', async () => {
  const o = await agentPage({}, seedAt(1, 1));
  const { page } = o;
  const history = await page.$eval('#meter tbody tr:nth-child(6) td.n', e => e.textContent);
  assert.notEqual(history, '~0', 'some earlier messages are still held');
  assert.match(await page.textContent('#meter'), /oldest earlier messages were dropped/);
  await page.click('#promptHost [data-act="fill"]');
  await page.click('#runBtn');
  assert.equal(await o.xp(), '10 XP');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: the file tree works from the keyboard', async () => {
  const { ctx, page, errors } = await agentPage();
  assert.equal(await page.locator('#tree [tabindex="0"]').count(), 1, 'the tree is one tab stop');
  await page.focus('#tree [aria-selected="true"]');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('#tree [aria-selected="true"]', e => e.dataset.path), 'src/price.js');
  assert.equal(await page.$eval('#fileEditor textarea', e => e.readOnly), true, 'project files are read-only');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('agent-quest: the meter is a meter with a text table, patterns and the estimate label', async () => {
  const { ctx, page, errors } = await agentPage();
  assert.equal(await page.locator('#meter [role="meter"]').count(), 1);
  assert.equal(await page.getAttribute('#meter [role="meter"]', 'aria-valuemax'), '2000');
  assert.match(await page.textContent('#meter .mlabel'), /^~\d+ of 2000 tokens \(estimate, chars\/4\)$/);
  assert.equal(await page.locator('#meter table tbody tr').count(), 7);
  assert.match(await page.textContent('#meter'), /Simulated/);
  const fills = await page.$$eval('#meter .mbar span', ss => ss.map(s => getComputedStyle(s).backgroundImage));
  assert.ok(fills.length >= 2 && fills.every(f => f !== 'none'), 'each segment has a pattern, not only a colour');
  await page.click('#mission .dot[data-mi="2"]');
  await page.fill('#pf-files', 'src/price.js');
  const t =await page.$eval('#meter tbody tr:nth-child(5) td.n', e => e.textContent);
  assert.notEqual(t, '~0', 'the file named in Files shows up as files read');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('agent-quest: layout at 390px and at 1000px', async () => {
  const { ctx, page, errors } = await agentPage({ viewport: { width: 390, height: 800 } });
  assert.equal(await page.$$eval('.tabs', e => e.length), 1, 'the pane switcher is not .tabs');
  assert.equal(await page.isVisible('.paneSwitch'), true);
  assert.equal(await page.isVisible('.meterStrip'), true);
  assert.equal(await page.isVisible('#mission'), true);
  assert.equal(await page.isVisible('#filesPanel'), false);
  for (const [pane, panel] of [['files', '#filesPanel'], ['meter', '#meterPanel'], ['run', '#runPanel']]) {
    await page.click(`.paneSwitch button[data-pane="${pane}"]`);
    assert.equal(await page.isVisible(panel), true, pane);
    assert.equal(await page.isVisible('#mission'), false, pane);
    assert.equal(await page.$$eval('.mapCol .panel', ps => ps.filter(p => p.getBoundingClientRect().height > 0).length), 1, pane);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${pane} overflows sideways`);
  }
  await page.click('.paneSwitch button[data-pane="mission"]');
  await page.click('#runBtn');
  assert.equal(await page.isVisible('#feedback [data-act="torun"]'), true);
  await page.click('#feedback [data-act="torun"]');
  assert.equal(await page.isVisible('#runPanel .steps'), true);
  await page.setViewportSize({ width: 1000, height: 700 });
  assert.equal(await page.isVisible('.paneSwitch'), false, 'hidden from 721px up');
  assert.equal(await page.isVisible('.meterStrip'), false);
  assert.equal(await page.$$eval('.mapCol .panel', ps => ps.filter(p => p.getBoundingClientRect().height > 0).length), 3);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('agent-quest: the dev path missions and the Run panel after a hook run and a stall run never scroll sideways at 390, 1000 and 1440', async () => {
  for (const width of [390, 1000, 1440]) {
    const o = await agentPage({ viewport: { width, height: 900 } }, seedAt(7, 0));
    const { page } = o;
    const fits = label => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth).then(ok => assert.equal(ok, true, `${label} overflows sideways at ${width}`));
    const showRun = async () => { if (width < 721) await page.click('.paneSwitch button[data-pane="run"]'); };
    const gotoChapter = async (ch, mi) => { if (width < 721) await page.click('.paneSwitch button[data-pane="mission"]'); await page.click(`#chapters [data-ch="${ch}"]`); if (mi) await page.click(`#mission .dot[data-mi="${mi}"]`); };
    await fits('mission 8.1');
    await gotoChapter(9);
    await fits('mission 10.1');
    await gotoChapter(14, 1);
    await fits('mission 15.2');
    await gotoChapter(10);
    await o.solve();
    await showRun();
    assert.match(await page.textContent('#runPanel .steps'), /Hook after edit/);
    await fits('the Run panel after a hook run');
    await gotoChapter(13);
    await page.click('#runBtn');
    await showRun();
    assert.match(await page.textContent('#runPanel .steps'), /Waiting for approval, but nobody is there/);
    await fits('the Run panel after a stall run');
    assert.deepEqual(o.console, []);
    assert.deepEqual(o.errors, []);
    await o.ctx.close();
  }
});

test('agent-quest: the Schedules chapter never scrolls sideways at 390, 1000 and 1440, and a schedule line stays inert text', async () => {
  for (const width of [390, 1000, 1440]) {
    const o = await agentPage({ viewport: { width, height: 900 } }, seedAt(15, 0));
    const { page } = o;
    const fits = label => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth).then(ok => assert.equal(ok, true, `${label} overflows sideways at ${width}`));
    // at 390px the Files, Mission and Run panels are separate panes
    const pane = async p => { if (width < 721) await page.click(`.paneSwitch button[data-pane="${p}"]`); };
    const edit = async text => { await pane('files'); await page.click('#tree [data-path=".claude/schedule.txt"]'); await page.fill('#fileEditor textarea', text); await pane('mission'); await page.click('#runBtn'); await pane('run'); };
    await fits('mission 16.1');
    assert.equal(await page.locator('#chapters .tierhead[data-tier="personal"]').count(), 1);
    assert.match(await page.textContent('#chapters .tierhead[data-tier="personal"]'), /Personal.*0\/5/);
    assert.match(await page.textContent('#chapters [data-ch="15"]'), /Schedules and reminders/);
    await pane('files');
    await page.click('#tree [data-path=".claude/schedule.txt"]');
    assert.match(await page.inputValue('#fileEditor textarea'), /monday 09:00 use backup-note/);
    await fits('the schedule file view');
    // a rejected line is shown as text in the schedule step, and nothing it holds becomes an element or runs
    await edit('<b>x</b>');
    assert.match(await page.textContent('#runPanel .steps'), /Schedule: no line starts the job\. Ignored: "<b>x<\/b>" is not "WHEN HH:MM use NAME"/);
    assert.equal(await page.locator('#runPanel .steps b').count(), 0);
    await fits('the Run panel after a run no line started');
    await edit('<img src=x onerror="window.__z=1">');
    assert.equal(await page.$('#runPanel img'), null);
    assert.equal(await page.evaluate(() => window.__z), undefined);
    await pane('mission');
    await page.click('#promptHost [data-act="fill"]');
    await page.click('#runBtn');
    await pane('run');
    assert.match(await page.textContent('#runPanel .steps'), /Schedule: starts weekly-digest at 07:30, 5 runs a week \(mon, tue, wed, thu, fri\)/);
    await fits('the Run panel after a fired run');
    assert.deepEqual(o.console, []);
    assert.deepEqual(o.errors, []);
    await o.ctx.close();
  }
});

test('agent-quest: the Writing, Files, Personal MCP and Skills chapters never scroll sideways at 390, 1000 and 1440, and a reload at chapter 20 keeps its chip in the rail', async () => {
  for (const width of [390, 1000, 1440]) {
    for (const [ch, mi] of [[16, 1], [17, 0], [18, 2], [19, 1]]) {
      const o = await agentPage({ viewport: { width, height: 900 } }, seedAt(ch, mi));
      const { page } = o;
      const fits = label => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth).then(ok => assert.equal(ok, true, `${label} overflows sideways at ${width}`));
      await fits(`mission ${ch + 1}.${mi + 1}`);
      await o.solve();
      if (width < 721) await page.click('.paneSwitch button[data-pane="run"]');
      await fits(`the Run panel of ${ch + 1}.${mi + 1}`);
      if (ch === 19) {
        await page.reload();
        await page.waitForSelector('#runBtn');
        const g = await railGaps(page);
        assert.equal(g.chapter, '19');
        assert.equal(g.h && g.v, true, `the chapter 20 chip is cut off at ${width}: ${g.chip} in ${g.rail}`);
      }
      assert.deepEqual(o.console, []);
      assert.deepEqual(o.errors, []);
      await o.ctx.close();
    }
  }
});

test('agent-quest: the Tune chapters never scroll sideways at 390, 1000 and 1440, and the Tune rail header is on screen', async () => {
  for (const width of [390, 1000, 1440]) {
    for (const [ch, mi] of [[20, 0], [21, 1], [22, 2]]) {
      const o = await agentPage({ viewport: { width, height: 900 } }, seedAt(ch, mi));
      const { page } = o;
      const fits = label => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth).then(ok => assert.equal(ok, true, `${label} overflows sideways at ${width}`));
      await fits(`mission ${ch + 1}.${mi + 1}`);
      if (width === 390) {
        const head = page.locator('#chapters .tierhead[data-tier="tune"]');
        assert.match(await head.textContent(), /Tune.*0\/3/);
        assert.equal(await head.isVisible(), true);
      }
      await o.solve();
      if (width < 721) await page.click('.paneSwitch button[data-pane="run"]');
      assert.equal(await page.isVisible('#runPanel .steps'), true, `the Run panel of ${ch + 1}.${mi + 1} is shown`);
      await fits(`the Run panel of ${ch + 1}.${mi + 1}`);
      assert.deepEqual(o.console, []);
      assert.deepEqual(o.errors, []);
      await o.ctx.close();
    }
  }
});

test('agent-quest: finishing Schedules earns the Egg Timer badge, 55 XP and a star on the chapter chip', async () => {
  const o = await agentPage({}, seedAgent(JSON.stringify({ ch: 15, mi: 2, done: { '15.0': true, '15.1': true } })));
  const { page } = o;
  assert.equal(await o.xp(), '20 XP');
  await o.solve();
  assert.match(await page.textContent('#feedback'), /Badge earned: Egg Timer/);
  assert.equal(await o.xp(), '55 XP');
  assert.equal((await page.textContent('#rank')).trim(), 'Prompt Rookie');
  assert.match(await page.textContent('#chapters [data-ch="15"]'), /★/);
  assert.match(await page.textContent('#chapters .tierhead[data-tier="personal"]'), /1\/5/);
  assert.deepEqual(o.console, []);
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

const railGaps = page => page.evaluate(() => {
  const r = document.querySelector('#chapters [aria-current="true"]').getBoundingClientRect(), c = document.querySelector('#chapters').getBoundingClientRect();
  return { chapter: document.querySelector('#chapters [aria-current="true"]').dataset.ch, v: Math.min(r.top - c.top, c.bottom - r.bottom) >= -1, h: Math.min(r.left - c.left, c.right - r.right) >= -1, chip: [r.left, r.right], rail: [c.left, c.right] };
});

test('agent-quest: after a reload at chapter 15 the active chapter chip is scrolled into the rail at 390 and 1280', async () => {
  for (const width of [390, 740, 1280]) {
    const o = await agentPage({ viewport: { width, height: 900 } }, seedAgent(JSON.stringify({ ch: 14 })));
    const { page } = o;
    for (const when of ['on load', 'after a reload']) {
      const g = await railGaps(page);
      assert.equal(g.chapter, '14');
      assert.equal(g.v, true, `the chapter 15 chip is cut off at the top or bottom of the rail at ${width}, ${when}`);
      assert.equal(g.h, true, `the chapter 15 chip is cut off at the side at ${width}, ${when}: ${g.chip} in ${g.rail}`);
      await page.reload();
      await page.waitForSelector('#runBtn');
    }
    assert.deepEqual(o.errors, []);
    await o.ctx.close();
  }
});

test('agent-quest: the active chapter chip is scrolled back into the rail when earlier chips change size after load (web fonts)', async () => {
  const o = await agentPage({ viewport: { width: 390, height: 900 } }, seedAgent(JSON.stringify({ ch: 14 })));
  const { page } = o;
  await page.addStyleTag({ content: '#chapters .chap[data-ch="0"]{min-width:600px}' });
  await page.waitForFunction(() => { const r = document.querySelector('#chapters [aria-current="true"]').getBoundingClientRect(), c = document.querySelector('#chapters').getBoundingClientRect(); return r.left >= c.left - 1 && r.right <= c.right + 1; });
  const g = await railGaps(page);
  assert.equal(g.h, true, `the chip is cut off at the side: ${g.chip} in ${g.rail}`);
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: quick-fire shows code in the question, the options, the answer and the misses list, with no literal tags', async () => {
  // Chapters 12 and 15 are done. Math.random is fixed so the deck keeps the data order and is dealt from its end: 15, then 12.
  const done = {};
  for (const [ch, n] of [[11, 3], [14, 3]]) for (let i = 0; i < n; i++) done[`${ch}.${i}`] = true;
  const o = await agentPage({}, async c => { await seedAgent(JSON.stringify({ done }))(c); await c.addInitScript(() => { Math.random = () => 0.999999; }); });
  const { page } = o;
  const codes = s => (s.match(/<code>/g) || []).length;
  const plain = s => s.replace(/<[^>]+>/g, '');
  const qf = await page.evaluate(() => AQ.QF.map(q => ({ ch: q.ch, c: q.c, a: q.a, w: q.w })));
  await page.click('.tabs button[data-tab="fire"]');
  await page.click('#fStart');
  const missed = new Set();
  for (let step = 0; step < 12 && !(missed.has(11) && missed.has(14)); step++) {
    const text = await page.textContent('#fStage .task');
    const q = qf.find(x => plain(x.c) === text);
    assert.ok(q, `an unknown question: ${text}`);
    assert.equal(await page.locator('#fStage .task code').count(), codes(q.c), `code in the question: ${text}`);
    const opts = await page.$$eval('#fStage .opt .ot', es => es.map(e => e.innerHTML));
    assert.equal(opts.join('|').split('<code>').length - 1, codes([q.a, ...q.w].join('|')), `code in the options: ${text}`);
    const right = opts.indexOf(q.a), wrong = opts.findIndex((_, i) => i !== right);
    // miss one question per chapter: the chapter 15 one whose answer has code, the chapter 12 one whose question has code
    const miss = !missed.has(q.ch) && (q.ch === 14 ? codes(q.a) : q.ch === 11 && codes(q.c));
    await page.click(`#fStage .opt[data-i="${miss ? wrong : right}"]`);
    if (miss) {
      missed.add(q.ch);
      if (codes(q.a)) assert.ok(await page.locator('#fFb code').count() >= 1, 'the answer shown after a miss has code');
    }
    await page.waitForFunction(t => document.querySelector('#fStage .task')?.textContent !== t, text, { timeout: 5000 });
  }
  assert.deepEqual([...missed].sort(), [11, 14]);
  await page.click('#fStop');
  const items = page.locator('#fStage .misses li');
  assert.equal(await items.count(), 2);
  for (let i = 0; i < 2; i++) assert.ok(await items.nth(i).locator('code').count() >= 1, 'a miss has code');
  assert.ok(await page.locator('#fStage .misses span:first-child code').count() >= 1, 'a miss question has code');
  assert.ok(await page.locator('#fStage .misses b code').count() >= 1, 'a miss answer has code');
  assert.ok(await page.locator('#fStage .misses .note code').count() >= 1, 'a miss explanation has code');
  assert.doesNotMatch(await page.textContent('#fStage'), /<\/?(code|b)>/);
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: a long command path in the files list breaks after each slash and keeps its plain text', async () => {
  const o = await agentPage({}, seedAt(11, 0));
  const { page } = o;
  const rows = await page.$$eval('#tree [data-path^=".claude/commands/"]', es => es.map(e => ({ path: e.dataset.path, html: e.innerHTML, text: e.textContent, wbrs: e.querySelectorAll('wbr').length })));
  assert.ok(rows.length >= 1);
  for (const r of rows) {
    assert.equal(r.wbrs, r.path.split('/').length - 1, r.path);
    assert.ok(r.html.startsWith(r.path.split('/').slice(0, -1).join('/<wbr>') + '/<wbr>'), `<wbr> after each slash: ${r.html}`);
    assert.ok(r.text.startsWith(r.path), r.path);
    assert.match(r.text.slice(r.path.length), /^( \(edited\))?( \(read-only\))?$/, r.path);
  }
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: quick-fire and the field guide render, and quick-fire opens after chapter 1', async () => {
  const o = await agentPage({}, seedAgent(JSON.stringify({ done: { '0.0': true, '0.1': true, '0.2': true, '0.3': true, '0.4': true }, badges: { 0: true } })));
  const { page } = o;
  assert.equal(await o.xp(), '75 XP');
  assert.equal((await page.textContent('#rank')).trim(), 'Loop Watcher');
  await page.click('.tabs button[data-tab="fire"]');
  assert.equal(await page.isVisible('#fStart'), true);
  await page.click('#fStart');
  assert.equal(await page.locator('#fStage .opt').count(), 4);
  await page.click('#fStop');
  await page.click('.tabs button[data-tab="guide"]');
  assert.ok(await page.locator('#guide .card').count() >= 1);
  assert.equal(await page.locator('#guide button[data-cmd]').count(), 0, 'guide examples are read-only');
  assert.match(await page.textContent('#aqFoot'), /last checked on 2026-11-01/);
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: the rail shows 23 chapters, and Use is on the form from mission 10.1', async () => {
  const o = await agentPage({}, seedAt(9, 0));
  const { page } = o;
  assert.equal(await page.locator('#chapters .chap').count(), 23);
  assert.equal(await page.isVisible('#pf-use'), true);
  assert.deepEqual(o.console, []);
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('agent-quest: the editor counts a root Done when as the default check, and only for the root file', async () => {
  const o = await agentPage({}, seedAt(14, 0));
  const { page } = o;
  const rules = () => page.textContent('#fileEditor .rules');
  await page.click('#tree [data-path="CLAUDE.md"]');
  await page.fill('#fileEditor textarea', 'Done when: run npm test');
  assert.match(await rules(), /1 acts as the default check/);
  await page.fill('#fileEditor textarea', 'do not delete data/');
  assert.match(await rules(), /no default check/);
  await page.click('#mission .dot[data-mi="1"]');
  await page.click('#tree [data-path="CLAUDE.md"]');
  assert.match(await rules(), /no default check/, '15.2 starts with a Done when line that does not parse');
  assert.doesNotMatch(await rules(), /acts as the default check/);
  await page.click('#tree [data-path="src/CLAUDE.md"]');
  assert.doesNotMatch(await rules(), /default check/, 'a folder file shows neither phrase');
  assert.deepEqual(o.console, []);
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

test('landing page shows Agent Quest XP only after progress', async () => {
  const { ctx, page, errors } = await open(`${base}/programming/`);
  assert.equal((await page.textContent('a[href="agent-quest/"] .xp')).trim(), '');
  assert.equal((await page.textContent('a[href="agent-quest/"] .sub')).trim(), '23 chapters');
  await page.evaluate(() => localStorage.setItem('agent-quest-v1', JSON.stringify({ done: { '0.0': true } })));
  // The card reads the stored xp, which the quest page derives and writes at boot.
  await page.goto(base + '/programming/agent-quest/');
  await page.waitForSelector('#mission');
  await page.goto(`${base}/programming/`);
  assert.match(await page.textContent('a[href="agent-quest/"] .xp'), /10 XP/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('agent-quest: the footer warns once the facts are over 90 days old', async () => {
  const fresh = await agentPage();
  assert.doesNotMatch(await fresh.page.textContent('#aqFoot'), /over 90 days ago/);
  await fresh.ctx.close();
  const old = await agentPage({}, c => c.clock.setFixedTime(new Date('2027-02-01T12:00:00Z')));
  assert.match(await old.page.textContent('#aqFoot'), /last checked on 2026-11-01/);
  assert.match(await old.page.textContent('#aqFoot .stale'), /over 90 days ago/);
  assert.deepEqual(old.errors, []);
  await old.ctx.close();
});

test('agent-quest: the file tree jumps to the last file with End, and the run steps move with the arrow keys', async () => {
  const { ctx, page, errors } = await agentPage();
  await page.focus('#tree [aria-selected="true"]');
  const paths = await page.$$eval('#tree [data-path]', es => es.map(e => e.dataset.path));
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('#tree [aria-selected="true"]', e => e.dataset.path), paths[paths.length - 1]);
  await page.click('#runBtn');
  assert.equal(await page.locator('#runPanel .steps li[tabindex="0"]').count(), 1, 'the steps are one tab stop');
  const first = await page.$eval('#runPanel .steps li[tabindex="0"]', e => e.textContent);
  await page.focus('#runPanel .steps li[tabindex="0"]');
  await page.keyboard.press('ArrowDown');
  assert.notEqual(await page.evaluate(() => document.activeElement.textContent), first);
  assert.equal(await page.evaluate(() => document.activeElement.closest('.steps') !== null), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('agent-quest: long lines and unresolved paths show inline errors, and learner text stays inert', async () => {
  const o = await agentPage();
  const { page } = o;
  await page.click('#mission .dot[data-mi="2"]');
  await page.fill('#pf-files', 'nope/missing.js');
  assert.ok(await page.locator('#perrs li').count() >= 1, 'unresolved path');
  await page.fill('#pf-files', '');
  await page.fill('#pf-donewhen', 'x'.repeat(5000));
  assert.match(await page.textContent('#perrs'), /longer than 300 characters/);
  await page.fill('#pf-donewhen', '<img src=x onerror="window.__y=1">');
  assert.equal(await page.$('#perrs img'), null);
  assert.equal(await page.evaluate(() => window.__y), undefined);
  assert.equal(await o.xp(), '0 XP');
  assert.deepEqual(o.errors, []);
  await o.ctx.close();
});

// A mission is completed by the learner's own input, never by state left over from other missions or a replay.
test('script-quest: after the whole chapter is built, an unrelated input completes no mission, and each mission\'s own answer still does', async () => {
  const hook = 'window.__t={CH,S,setChapter,goMission,runShell,submit,cmd,mk,INITIAL_FILES,openFile,saveFile,ed,get MODE(){return MODE},clearRun(){RUN=null}};})();';
  const prep = ctx => ctx.route('**/script-quest/app.js', async r => {
    const body = (await r.fetch()).text();
    await r.fulfill({ contentType: 'text/javascript', body: (await body).replace(/\}\)\(\);\s*$/, hook) });
  });
  const { ctx, page, errors } = await open(`${base}/programming/script-quest/`, {}, prep);
  const bad = await page.evaluate(async () => {
    const { CH, S, setChapter, goMission, runShell, submit, cmd, mk, INITIAL_FILES, openFile, saveFile, ed } = window.__t;
    const alt = { '2.1': ['let a = 1, coins = 0', 'let coins\ncoins = 0'], '6.1': ['const { bag } = { bag: ["a", "b"] }'], '8.4': ['Object.defineProperty(performer, "act", { value: "tightrope", enumerable: true })'] };
    const bad = [], tick = () => new Promise(r => setTimeout(r, 50));
    const play = async m => {
      if (window.__t.MODE !== 'sh') { cmd.value = m.code; await submit(); return; }
      if (!m.editFile) { runShell(m.code); return; }
      if (m.editFile === 'package.json') return;
      openFile(m.editFile); ed.value = m.code; saveFile();
      if (m.run) runShell(m.run);
    };
    for (let c = 0; c < CH.length; c++) {
      S.done = {}; S.cur = {}; setChapter(c);
      const sh = window.__t.MODE === 'sh';
      if (sh) { S.files = { ...INITIAL_FILES }; S.pkgs = []; }
      const reset = () => { S.done = {}; S.cur = {}; setChapter(c); if (sh) { S.files = { ...INITIAL_FILES }; S.pkgs = []; } };
      for (const m of CH[c].missions) await play(m);
      for (let j = 0; j < CH[c].missions.length; j++) {
        const m = CH[c].missions[j];
        for (const input of sh ? ['ls', 'node -v', 'node -e "1"', 'npm -v'] : ['true']) {
          if (m.code.startsWith(input.slice(0, 7))) continue;
          S.done = {}; S.cur[c] = j; window.__t.clearRun(); goMission(j); await tick();
          cmd.value = input; await submit();
          if (S.done[mk(c, j)]) bad.push(`${c + 1}.${j + 1} ${m.title}: unrelated input ${input} completed it`);
        }
        for (const code of [m.code, ...(alt[`${c + 1}.${j + 1}`] || [])]) {
        reset();
        for (const p of CH[c].missions.slice(0, j)) await play(p);
        S.done = {}; S.cur[c] = j; window.__t.clearRun(); goMission(j); await tick();
        await play({ ...m, code });
        for (let w = 0; w < 80 && !S.done[mk(c, j)]; w++) await tick();
        // the code of the package.json mission is a fragment to paste in, not a whole file, so play() skips it
        if (!S.done[mk(c, j)] && m.editFile !== 'package.json') bad.push(`${c + 1}.${j + 1} ${m.title}: answer ${JSON.stringify(code)} did not complete it`);
        }
        reset();
        for (const p of CH[c].missions) await play(p);
      }
    }
    return bad;
  });
  assert.deepEqual(bad, []);
  assert.deepEqual(errors, []);
  await ctx.close();
});
