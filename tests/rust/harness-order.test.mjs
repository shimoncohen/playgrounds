import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FILES, ROOT } from './harness.mjs';

const DIR = path.join(ROOT, 'rust-quest');
const SRC = /<script src="([^"]+)"/g;

const pageFiles = (html) => [...html.matchAll(SRC)].map((m) => m[1]).filter((f) => f === '../shared/how.js' || f.startsWith('engine/') || f.startsWith('content/'));
const onDisk = () => ['engine', 'content'].flatMap((d) => fs.readdirSync(path.join(DIR, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`));

export function orderProblems(files, html, disk) {
  const page = pageFiles(html), out = [];
  if (JSON.stringify(files) !== JSON.stringify(page)) out.push('FILES differs from the index.html script order');
  for (const f of disk) {
    if (!files.includes(f)) out.push(`${f} is not in FILES`);
    if (!page.includes(f)) out.push(`${f} is not in index.html`);
  }
  for (const list of [files, page]) {
    const nums = list.map((f) => /^content\/ch-(\d+)-/.exec(f)).filter(Boolean).map((m) => +m[1]);
    if (nums.some((n, i) => i && n <= nums[i - 1])) out.push('chapter files are not in numeric order');
  }
  return out;
}

const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

describe('harness FILES follow rust-quest/index.html', () => {
  it('agree, with every engine and content file listed', () => {
    assert.deepEqual(orderProblems(FILES, html, onDisk()), []);
  });
  it('fails when two entries are swapped', () => {
    const swapped = [...FILES];
    [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
    assert.ok(orderProblems(swapped, html, onDisk()).length > 0);
  });
  it('fails when a file is in one list only', () => {
    assert.ok(orderProblems(FILES, html, [...onDisk(), 'engine/extra.js']).some((p) => p.includes('engine/extra.js')));
    assert.ok(orderProblems(FILES.slice(0, -1), html, onDisk()).length > 0);
    assert.ok(orderProblems([...FILES, 'engine/extra.js'], html, onDisk()).length > 0);
  });
  it('fails when chapter files are out of numeric order', () => {
    const a = ['content/ch-02-x.js', 'content/ch-01-y.js'], page = `<script src="${a[0]}"></script><script src="${a[1]}"></script>`;
    assert.ok(orderProblems(a, page, a).some((p) => p.includes('numeric')));
  });
});
