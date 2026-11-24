import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FILES, ROOT } from '../rust/harness.mjs';

const RUST_DIR = path.join(ROOT, 'programming', 'rust-quest', 'engine');
const ENGINE = FILES.slice(0, FILES.indexOf('engine/index.js') + 1);
const TAG = /<script\b([^>]*)>/gi;
const SRC = /\bsrc\s*=\s*(["'])(.*?)\1/i;

const tagsOf = (html) => [...html.matchAll(TAG)].map((m) => ({ attrs: m[1], src: (SRC.exec(m[1]) || [])[2] })).filter((t) => t.src !== undefined);

export function scriptProblems(html, files, disk) {
  const tags = tagsOf(html), srcs = tags.map((t) => t.src), out = [];
  const at = (s) => srcs.indexOf(s);
  const need = ['engine.js', '../python-quest/engine.js', '../cpp-quest/engine.js', ...files.filter((f) => f.startsWith('engine/')).map((f) => `../rust-quest/${f}`)];
  for (const s of need) {
    if (at(s) < 0) out.push(`${s} is not on the page`);
    else if (at('practice.js') >= 0 && at(s) > at('practice.js')) out.push(`${s} comes after practice.js`);
  }
  if (at('practice.js') < 0) out.push('practice.js is not on the page');
  else if (at('app.js') < at('practice.js')) out.push('app.js comes before practice.js');
  const page = srcs.filter((s) => s === '../../shared/how.js' || s.startsWith('../rust-quest/engine/')).map((s) => s.replace('../rust-quest/', ''));
  if (JSON.stringify(page) !== JSON.stringify(files)) out.push('the Rust engine tags differ from the harness FILES order');
  for (const f of disk) if (!srcs.includes(`../rust-quest/engine/${f}`)) out.push(`engine/${f} is not on the page`);
  for (const t of tags) {
    if (/^\s*(https?:|\/\/)/i.test(t.src)) out.push(`external script ${t.src}`);
    if (t.attrs.trim() !== `src="${t.src}"`) out.push(`${t.src} is not a plain <script src> tag`);
  }
  return out;
}

const html = fs.readFileSync(path.join(ROOT, 'programming', 'ds-quest', 'index.html'), 'utf8');
const disk = () => fs.readdirSync(RUST_DIR).filter((f) => f.endsWith('.js'));
const tag = (s) => `<script src="${s}"></script>`;
const swap = (h, a, b) => h.replace(tag(a), '@@A@@').replace(tag(b), tag(a)).replace('@@A@@', tag(b));

describe('programming/ds-quest/index.html scripts', () => {
  it('load the engines before practice.js and practice.js before app.js, as plain local tags', () => {
    assert.deepEqual(scriptProblems(html, ENGINE, disk()), []);
  });
  it('fails when two engine entries are swapped', () => {
    assert.ok(scriptProblems(swap(html, '../rust-quest/engine/lex.js', '../rust-quest/engine/parse.js'), ENGINE, disk()).length > 0);
  });
  it('fails when practice.js comes before an engine', () => {
    assert.ok(scriptProblems(swap(html, 'practice.js', '../cpp-quest/engine.js'), ENGINE, disk()).some((p) => p.includes('cpp-quest/engine.js comes after practice.js')));
  });
  it('fails when app.js comes before practice.js', () => {
    assert.ok(scriptProblems(swap(html, 'practice.js', 'app.js'), ENGINE, disk()).some((p) => p.includes('app.js comes before practice.js')));
  });
  it('fails when a Rust engine file is missing from the page or the list', () => {
    assert.ok(scriptProblems(html.replace(tag('../rust-quest/engine/diag.js'), ''), ENGINE, disk()).length > 0);
    assert.ok(scriptProblems(html, ENGINE, [...disk(), 'extra.js']).some((p) => p.includes('extra.js')));
  });
  it('fails on an external script, whatever its case or form', () => {
    for (const src of ['http://x.test/a.js', 'https://x.test/a.js', '//cdn.test/a.js', 'HTTPS://x.test/a.js']) {
      assert.ok(scriptProblems(html.replace('</body>', `${tag(src)}</body>`), ENGINE, disk()).some((p) => p.includes('external script')), src);
    }
    assert.ok(scriptProblems(html.replace('</body>', '<script defer src="https://x.test/a.js"></script></body>'), ENGINE, disk()).some((p) => p.includes('external script')));
  });
  it('fails on a single-quoted external script', () => {
    assert.ok(scriptProblems(html.replace('</body>', "<script src='https://x.test/a.js'></script></body>"), ENGINE, disk()).some((p) => p.includes('external script')));
  });
  it('fails on a tag that build.py would leave external', () => {
    assert.ok(scriptProblems(html.replace(tag('app.js'), '<script defer src="app.js"></script>'), ENGINE, disk()).some((p) => p.includes('not a plain')));
  });
});
