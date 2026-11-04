// Browser tests for the Math Quest scene layer. Set PW_CHROMIUM to use a specific Chromium; MQ_SHOTS to keep the screenshots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
const PAGE = '/tests/math/pages/scenes.html';

let server, base, browser, tmp;

before(async () => {
  server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }).end(fs.readFileSync(p));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://localhost:${server.address().port}`;
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  tmp = process.env.MQ_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'mq-scene-'));
  fs.mkdirSync(tmp, { recursive: true });
});
after(async () => {
  await browser?.close();
  server?.close();
  if (!process.env.MQ_SHOTS) fs.rmSync(tmp, { recursive: true, force: true });
});

async function open(opts = {}, prep, query = '') {
  const ctx = await browser.newContext(opts);
  if (prep) await ctx.addInitScript(prep);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + PAGE + query);
  await page.waitForSelector('#s3d .mq-live');
  return { ctx, page, errors };
}
const setRange = (page, sel, v) => page.evaluate(([s, v]) => { const i = document.querySelector(s); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]);
const live = (page, id) => page.textContent(`#${id} .mq-live`);

// Reads the shared canvas back: true when any pixel was drawn (the canvas is cleared to transparent).
const canvasHasContent = page => page.evaluate(() => {
  const c = document.querySelector('#s3d canvas');
  if (!c) return false;
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return false;
  const px = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, px);
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) return true;
  return false;
});

test('a slider changes the live line, the number box and the description', async () => {
  const { ctx, page, errors } = await open();
  assert.equal(await live(page, 's3d'), 'V = 2·3·4 = 24');
  await setRange(page, '#s3d .mq-p:nth-child(1) input[type=range]', 4);
  assert.equal(await live(page, 's3d'), 'V = 4·3·4 = 48');
  assert.equal(await page.inputValue('#s3d .mq-p:nth-child(1) .mq-n'), '4');
  assert.match(await page.textContent('#s3d .mq-desc'), /length 4.*V = 48/);
  await page.fill('#s3d .mq-p:nth-child(2) .mq-n', '6');
  assert.equal(await live(page, 's3d'), 'V = 4·6·4 = 96');
  assert.equal(await page.getAttribute('#s3d .mq-desc', 'aria-live'), 'polite');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('hovering a formula term highlights its slider label, and focusing a slider highlights the term', async () => {
  const { ctx, page } = await open();
  await page.hover('#s3d .mq-formula [data-term="a"]');
  assert.ok(await page.$('#s3d label.mq-lab[data-term="a"].hl'));
  assert.equal(await page.$('#s3d label.mq-lab[data-term="b"].hl'), null);
  const style = await page.$eval('#s3d label.mq-lab[data-term="a"]', e => getComputedStyle(e));
  assert.ok(+style.fontWeight >= 800 && style.textDecorationLine.includes('underline'), 'highlight is not color only');
  await page.mouse.move(0, 0);
  assert.equal(await page.$('#s3d .hl'), null);
  await page.focus('#s3d .mq-p:nth-child(2) input[type=range]');
  assert.ok(await page.$('#s3d .mq-formula [data-term="b"].hl'));
  await ctx.close();
});

test('hovering a 3D edge highlights its slider label, and leaving clears it', async () => {
  const { ctx, page } = await open();
  if (!await page.$('#s3d canvas')) { console.log('scene3d hover: skipped, no WebGL on this path'); await ctx.close(); return; }
  await page.locator('#s3d canvas').scrollIntoViewIfNeeded();
  for (const [term, other] of [['a', 'b'], ['b', 'c'], ['c', 'a']]) {
    const pt = await page.evaluate(t => MQ.three3d.screenOf(document.querySelector('#s3d .mq-stage'), t), term);
    assert.ok(pt, `no screen point for ${term}`);
    await page.mouse.move(pt[0], pt[1]);
    assert.ok(await page.$(`#s3d label.mq-lab[data-term="${term}"].hl`), `edge ${term} highlights its label`);
    assert.equal(await page.$(`#s3d label.mq-lab[data-term="${other}"].hl`), null);
  }
  await page.mouse.move(2, 2);
  assert.equal(await page.$('#s3d .hl'), null, 'cleared after leaving');
  await ctx.close();
});

test('the formula term colors come from the palette and KaTeX trust is limited to htmlData', async () => {
  const { ctx, page } = await open();
  const colors = await page.$$eval('#s3d .mq-formula [data-term]', ns => ns.map(n => n.style.color));
  assert.equal(colors.length, 3);
  assert.equal(new Set(colors).size, 3);
  const r = await page.evaluate(() => {
    const el = document.createElement('div');
    katex.render('\\href{https://x.test}{x}\\htmlData{term=q}{y}', el, { trust: c => c.command === '\\htmlData', strict: 'ignore', throwOnError: false });
    return { href: !!el.querySelector('a'), data: !!el.querySelector('[data-term="q"]') };
  });
  assert.deepEqual(r, { href: false, data: true });
  await ctx.close();
});

test('a 2D point moves with the arrow keys and the drawing follows', async () => {
  const { ctx, page } = await open();
  assert.equal(await live(page, 's2d'), 'y(2) = 1·2 + 1 = 3');
  await page.focus('#s2d circle.drag');
  assert.equal(await page.getAttribute('#s2d circle.drag', 'tabindex'), '0');
  await page.keyboard.press('ArrowRight');
  assert.equal(await live(page, 's2d'), 'y(3) = 1·3 + 1 = 4');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('drag')), true, 'focus survives the redraw');
  await setRange(page, '#s2d .mq-p:nth-child(1) input[type=range]', 2);
  assert.equal(await live(page, 's2d'), 'y(3) = 2·3 + 1 = 7');
  assert.equal(await page.$$eval('#s2d polyline.fn', ns => ns.length), 3 + 0, 'line, and 1/x in two pieces');
  await ctx.close();
});

for (const [w, h] of [[390, 844], [1440, 900]]) {
  test(`the page fits at ${w}x${h}`, async () => {
    const { ctx, page } = await open({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(tmp, `scenes-${w}.png`), fullPage: true });
    await ctx.close();
  });
}

test('with reduced motion an animated scene starts paused, and scrubbing still works', async () => {
  const rm = await open({ reducedMotion: 'reduce' });
  assert.equal(await rm.page.textContent('#s2d .mq-anim button'), 'Play');
  const before = await rm.page.textContent('#s2d .mq-desc');
  await rm.page.waitForTimeout(400);
  assert.equal(await rm.page.textContent('#s2d .mq-desc'), before, 'nothing moves while paused');
  await setRange(rm.page, '#s2d .mq-anim input[type=range]', 1.5);
  assert.equal(await rm.page.$eval('#s2d .mq-anim input[type=range]', i => i.value), '1.5');
  const [slider, accent] = await rm.page.$eval('#s2d .mq-anim input[type=range]', i =>
    [getComputedStyle(i).accentColor, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()]);
  const probe = await rm.page.evaluate(c => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }, accent);
  assert.equal(slider, probe, 'the time slider uses the quest accent, not the browser default');
  await rm.ctx.close();

  const normal = await open();
  assert.equal(await normal.page.textContent('#s2d .mq-anim button'), 'Pause');
  const t0 = await normal.page.$eval('#s2d .mq-anim input[type=range]', i => +i.value);
  await normal.page.waitForTimeout(500);
  assert.notEqual(await normal.page.$eval('#s2d .mq-anim input[type=range]', i => +i.value), t0, 'it plays');
  await normal.page.click('#s2d .mq-anim button');
  assert.equal(await normal.page.textContent('#s2d .mq-anim button'), 'Play');
  await normal.ctx.close();
});

test('the 3D scene draws, or says why it cannot', async () => {
  const { ctx, page } = await open();
  const gl = await page.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); });
  if (gl) {
    console.log('scene3d: WebGL available, checking the canvas with readPixels');
    assert.ok(await page.$('#s3d canvas'), 'canvas is mounted');
    assert.ok(await canvasHasContent(page), 'canvas has drawn pixels');
    const st = await page.evaluate(() => MQ.three3d.state(document.querySelector('#s3d .mq-stage')));
    assert.equal(st.meshes, 13);
    assert.deepEqual(st.size.map(v => +v.toFixed(1)), [2.1, 3.1, 4.1]);
    await setRange(page, '#s3d .mq-p:nth-child(1) input[type=range]', 5);
    assert.deepEqual((await page.evaluate(() => MQ.three3d.state(document.querySelector('#s3d .mq-stage')))).size.map(v => +v.toFixed(1)), [5.1, 3.1, 4.1]);
    assert.ok(await canvasHasContent(page), 'canvas still has pixels after a change');
    if (process.env.MQ_SHOTS) await page.locator('#s3d').screenshot({ path: path.join(tmp, 'scene3d.png') });
  } else {
    console.log('scene3d: WebGL UNAVAILABLE in this browser, falling back to scene-state checks');
    assert.ok(await page.$('#s3d .nogl'));
    assert.equal(await live(page, 's3d'), 'V = 2·3·4 = 24');
  }
  await ctx.close();
});

test('without WebGL the 3D scene shows a notice and its sliders still work', async () => {
  const { ctx, page, errors } = await open({}, () => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : get.call(this, t, ...a); };
  });
  assert.match(await page.textContent('#s3d .nogl'), /needs WebGL/);
  await setRange(page, '#s3d .mq-p:nth-child(3) input[type=range]', 6);
  assert.equal(await live(page, 's3d'), 'V = 2·3·6 = 36');
  assert.deepEqual(errors, []);
  await ctx.close();
});
