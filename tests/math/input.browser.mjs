// Browser tests for the Math working area. Set PW_CHROMIUM to use a specific Chromium; MQ_SHOTS to keep the screenshots.
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
const NOTATIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/math/notations.json'), 'utf8'));
const CHAIN = ['1*2-3*2+10/1', '2-6+10/1', '2-6+10', '6'];

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
  tmp = process.env.MQ_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'mq-input-'));
  fs.mkdirSync(tmp, { recursive: true });
});
after(async () => {
  await browser?.close();
  server?.close();
  if (!process.env.MQ_SHOTS) fs.rmSync(tmp, { recursive: true, force: true });
});

async function open(mode, opts = {}) {
  const ctx = await browser.newContext(opts);
  if (mode) await ctx.addInitScript(m => localStorage.setItem('math-prefs-v1', JSON.stringify({ input: m })), mode);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + PAGE);
  await page.evaluate(() => window.work.ready);
  return { ctx, page, errors };
}
const marks = page => page.$$eval('#work .mq-step', ls => ls.map(l => l.querySelector('.mq-mark').textContent));
const values = page => page.evaluate(() => window.work.values().filter(v => v.trim()));
const squash = s => s.replace(/\s+/g, '');
async function typeChain(page, steps) {
  for (const s of steps) {
    await page.keyboard.type(s);
    await page.keyboard.press('Enter');
  }
}

test('text mode: each step is checked against the question, and one wrong step stays alone', async () => {
  const { ctx, page, errors } = await open('text');
  assert.equal(await page.$$eval('#work input.mq-field', f => f.length), 1);
  assert.equal(await page.isVisible('#work .mq-keypad'), true);
  await page.focus('#work .mq-field');
  await typeChain(page, CHAIN);
  assert.deepEqual(await marks(page), ['✓', '✓', '✓', '✓', '']);
  assert.match(await page.textContent('#work .mq-result'), /solves it/);
  assert.deepEqual(await page.evaluate(() => window.passed), [CHAIN]);
  assert.match(await page.innerHTML('#work .mq-step:nth-child(1) .mq-prev'), /katex/);

  await page.fill('#work .mq-step:nth-child(2) .mq-field', '2-6+1');
  await page.press('#work .mq-step:nth-child(2) .mq-field', 'Tab');
  assert.deepEqual(await marks(page), ['✓', '✗', '✓', '✓', '']);
  assert.match(await page.textContent('#work .mq-step:nth-child(2) .mq-why'), /works out to −3, /);
  assert.match(await page.textContent('#work .mq-result'), /every step/);

  await page.focus('#work .mq-step:nth-child(5) .mq-field');
  await page.keyboard.press('Backspace');
  assert.equal(await page.$$eval('#work .mq-step', l => l.length), 4);
  assert.equal(await page.evaluate(() => document.activeElement.value), '6');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('required working: the answer alone does not pass, one step before it does', async () => {
  const { ctx, page, errors } = await open('text');
  await page.focus('#work .mq-field');
  await typeChain(page, ['6']);
  assert.deepEqual(await marks(page), ['✓', '']);
  assert.match(await page.textContent('#work .mq-result'), /at least one step before/);
  assert.deepEqual(await page.evaluate(() => window.passed), []);

  await page.fill('#work .mq-step:nth-child(1) .mq-field', '2-6+10');
  await page.focus('#work .mq-step:nth-child(2) .mq-field');
  await typeChain(page, ['6']);
  assert.match(await page.textContent('#work .mq-result'), /solves it/);
  assert.deepEqual(await page.evaluate(() => window.passed), [['2-6+10', '6']]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a right but unfinished last line says what is still missing', async () => {
  const { ctx, page, errors } = await open('text');
  await page.focus('#work .mq-field');
  await typeChain(page, ['2-6+10']);
  assert.deepEqual(await marks(page), ['✓', '']);
  assert.match(await page.textContent('#work .mq-result'), /Finish with one number/);
  await page.fill('#work .mq-step:nth-child(1) .mq-field', '2-6+1');
  await page.press('#work .mq-step:nth-child(1) .mq-field', 'Tab');
  assert.equal(await page.textContent('#work .mq-result'), '', 'a wrong last line explains itself on its own step');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('every field, the switch and the keypad are labelled and keyboard-usable', async () => {
  const { ctx, page, errors } = await open('text');
  assert.equal(await page.getAttribute('#work .mq-field', 'aria-label'), 'Step 1');
  assert.equal(await page.getAttribute('#work .mq-switch input', 'role'), 'switch');
  assert.match(await page.textContent('#work .mq-switch'), /Math keyboard/);
  assert.deepEqual(await page.$$eval('#work .mq-keypad button', b => b.map(x => x.getAttribute('aria-label'))),
    ['fraction', 'square root', 'power', 'pi', 'open bracket', 'close bracket']);
  await page.fill('#work .mq-field', '34');
  await page.focus('#work .mq-field');
  await page.evaluate(() => document.querySelector('#work .mq-field').setSelectionRange(1, 1));
  await page.focus('#work .mq-keypad button[aria-label="fraction"]');
  await page.keyboard.press('Enter');
  assert.equal(await page.inputValue('#work .mq-field'), '3/4');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'mq-field');
  await page.focus('#work .mq-switch input');
  await page.keyboard.press('Space');
  await page.waitForSelector('#work math-field');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('math-prefs-v1')).input), 'visual');
  assert.equal(await page.getAttribute('#work math-field', 'aria-label'), 'Step 1');
  assert.equal(await page.isVisible('#work .mq-keypad'), false);
  assert.deepEqual(await page.$eval('#work math-field', f => ['menu-toggle', 'virtual-keyboard-toggle']
    .map(p => getComputedStyle(f.shadowRoot.querySelector(`[part~="${p}"]`)).display === 'none')), [true, false]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('switching modes keeps the steps both ways', async () => {
  const { ctx, page, errors } = await open('text');
  await page.focus('#work .mq-field');
  await typeChain(page, CHAIN);
  await page.fill('#work .mq-step:nth-child(2) .mq-field', '2-6+1');
  const text = await values(page);
  await page.click('#work .mq-switch input');
  await page.waitForSelector('#work math-field');
  assert.equal(await page.$$eval('#work math-field', f => f.filter(x => x.value).length), 4);
  const visual = await values(page);
  const same = (a, b) => page.evaluate(([a, b]) => a.every((v, i) => MQ.check.number(v, b[i]).ok), [a, b]);
  assert.ok(await same(visual, text), `visual ${JSON.stringify(visual)} vs text ${JSON.stringify(text)}`);
  assert.deepEqual(await marks(page), ['✓', '✗', '✓', '✓', '']);

  await page.click('#work .mq-switch input');
  await page.waitForSelector('#work input.mq-field');
  const back = await values(page);
  assert.ok(await same(back, text), `back ${JSON.stringify(back)}`);
  assert.deepEqual(back.map(squash), text.map(squash));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('round trip: every notation goes text -> MathLive -> translate and keeps its value', async () => {
  const { ctx, page, errors } = await open('visual');
  const rows = await page.evaluate(list => list.map(n => {
    const f = document.createElement('math-field');
    document.body.appendChild(f);
    f.setValue(MQ.check.tex(n));
    const ascii = f.getValue('ascii-math'), back = MQ.check.translate(ascii);
    f.remove();
    const at = [{ x: 0.5, r: 0.5, a: 1.5, b: 2.5, c: 0.75 }, { x: 1.5, r: 2, a: -2, b: 3, c: 4 }, { x: 3.25, r: 3, a: 7, b: -0.5, c: 2.25 }];
    // An equation or a list of solutions keeps its value side by side; `log(x, 2)` has no `=`, so its comma stays.
    const parts = s => (s.includes('=') ? s.split(/=|,|\sor\s/) : [s]);
    const pn = parts(n.replace(/°/g, '')), pb = parts(back.replace(/°/g, ''));
    let ok = pn.length === pb.length;
    // Text that comes back unchanged keeps its value, even where plain math.js reads it as a call (`x(x-3)`).
    try { ok = back === n || ok && at.every(s => pn.every((p, i) => Math.abs(MQ.math.full.evaluate(p, s) - MQ.math.full.evaluate(pb[i], s)) < 1e-9)); } catch (e) { ok = false; }
    return { n, ascii, back, ok };
  }), NOTATIONS);
  if (process.env.MQ_SHOTS) fs.writeFileSync(path.join(tmp, 'roundtrip.json'), JSON.stringify(rows, null, 2));
  for (const r of rows) assert.ok(r.ok, `${r.n} -> ${r.ascii} -> ${r.back}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('at 390px the keypad buttons are at least 40px and nothing overflows', async () => {
  const { ctx, page, errors } = await open('text', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const sizes = await page.$$eval('#work .mq-keypad button', b => b.map(x => x.getBoundingClientRect()).map(r => [r.width, r.height]));
  assert.ok(sizes.every(([w, h]) => w >= 40 && h >= 40), JSON.stringify(sizes));
  await page.focus('#work .mq-field');
  await typeChain(page, ['1*2-3*2+10/1', '2-6+1']);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow (text)');
  await page.locator('#work').screenshot({ path: path.join(tmp, 'work-text-390.png') });

  await page.click('#work .mq-switch input');
  await page.waitForSelector('#work math-field');
  await page.focus('#work math-field');
  await page.evaluate(() => window.mathVirtualKeyboard.show());
  await page.waitForFunction(() => window.mathVirtualKeyboard.visible && document.body.classList.contains('mq-kbd'));
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.mq-scene')).position), 'sticky');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow (visual)');
  await page.evaluate(() => document.querySelector('#work math-field').scrollIntoView({ block: 'start' }));
  const fieldTop = await page.evaluate(() => document.querySelector('#work math-field').getBoundingClientRect().top);
  const sceneBottom = await page.evaluate(() => document.querySelector('#s3d').getBoundingClientRect().bottom);
  assert.ok(fieldTop >= sceneBottom, `the focused step (${fieldTop}) sits below the scene (${sceneBottom})`);
  await page.screenshot({ path: path.join(tmp, 'work-visual-390.png') });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('desktop: a wrong step shows its reason', async () => {
  const { ctx, page, errors } = await open('text', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.focus('#work .mq-field');
  await typeChain(page, ['1*2-3*2+10/1', '2-6+1', '2-6+10', '6']);
  assert.deepEqual(await marks(page), ['✓', '✗', '✓', '✓', '']);
  assert.ok(await page.isVisible('#work .mq-step:nth-child(2) .mq-why'));
  await page.locator('#work').screenshot({ path: path.join(tmp, 'work-wrong-1440.png') });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('notes are saved after a pause in typing', async () => {
  const { ctx, page, errors } = await open('text');
  await page.fill('#notes textarea', 'brackets first');
  assert.equal(await page.getAttribute('#notes textarea', 'id'), await page.getAttribute('#notes label', 'for'));
  await page.waitForFunction(() => window.notesSaved.length === 1);
  assert.deepEqual(await page.evaluate(() => window.notesSaved), ['brackets first']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('visual is the default and MathLive is loaded only then; only visual shows the fraction tip', async () => {
  const { ctx, page, errors } = await open(null);
  assert.ok(await page.$('#work math-field'));
  assert.match(await page.textContent('#work .mq-tip'), /starts a fraction/);
  assert.equal(await page.isVisible('#work .mq-tip'), true);
  assert.equal(await page.$$eval('script[src*="mathlive"]', s => s.length), 1);
  await ctx.close();
  const t = await open('text');
  assert.equal(await t.page.$$eval('script[src*="mathlive"]', s => s.length), 0);
  assert.equal(await t.page.isVisible('#work .mq-tip'), false);
  assert.deepEqual([...errors, ...t.errors], []);
  await t.ctx.close();
});
