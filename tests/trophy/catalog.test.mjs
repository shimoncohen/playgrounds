// shared/catalog.js repeats each playground's chapter and mission counts; this keeps it in step with the real content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS } from './chapters.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(read('shared/catalog.js'), sandbox);
// Arrays from another vm realm fail deepStrictEqual on their prototype, so compare plain copies.
const plain = x => JSON.parse(JSON.stringify(x));
const { QUESTS, SUBJECTS } = plain(sandbox.Catalog);

for (const q of QUESTS) {
  test(`catalog: ${q.name} has the real mission count of every chapter`, () => {
    assert.ok(CHAPTERS[q.key], `add a loader for ${q.key} to CHAPTERS in tests/trophy/chapters.mjs`);
    assert.deepEqual(plain(CHAPTERS[q.key]().map(c => c.missions.length)), q.missions);
  });
}

test('catalog: every playground page has exactly one entry, with its save key and folder', () => {
  const programming = fs.readdirSync(path.join(ROOT, 'programming')).filter(d => d.endsWith('-quest')).map(d => `programming/${d}/`);
  const math = fs.readdirSync(path.join(ROOT, 'math'), { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(ROOT, 'math', d.name, 'content.js'))).map(d => `math/${d.name}/`);
  const fromPages = [...programming, ...math].map(href => [read(href + 'index.html').match(/window\.PROGRESS=\{key:"([^"]+)"/)[1], href]);
  assert.deepEqual(fromPages.sort(), QUESTS.map(q => [q.key, q.href]).sort());
});

test('catalog: every entry names a known subject and a done-key separator', () => {
  const ids = SUBJECTS.map(s => s.id);
  for (const q of QUESTS) {
    assert.ok(ids.includes(q.subject), `${q.key}: unknown subject ${q.subject}`);
    assert.ok(q.sep === '.' || q.sep === '-', `${q.key}: sep must be "." or "-"`);
    assert.ok(q.missions.length > 0 && q.missions.every(n => Number.isInteger(n) && n > 0), q.key);
  }
});

// docs/story-guideline.md: each playground's story.js outline and a story line per chapter. A playground leaves this
// list in the PR that writes its story; listing one that already has a story.js fails, so the list cannot go stale.
const STORY_PENDING = new Set([]);
const filled = s => typeof s === 'string' && s.trim().length > 0;

for (const q of QUESTS) {
  test(`story: ${q.name} has a story outline and a story line on every chapter`, () => {
    const file = `${q.href}story.js`;
    const exists = fs.existsSync(path.join(ROOT, file));
    if (STORY_PENDING.has(q.key)) {
      assert.ok(!exists, `${file} exists: remove ${q.key} from STORY_PENDING in this file`);
      return;
    }
    assert.ok(exists, `${file} is missing (docs/story-guideline.md section 3)`);
    const src = read(file);
    assert.ok(!/<\/(script|style)/i.test(src), `${file} must stay bundle-safe`);
    const sb = {};
    vm.createContext(sb);
    vm.runInContext(src, sb);
    const s = sb.STORY;
    assert.ok(s, `${file} must set STORY`);
    assert.ok(filled(s.world) && filled(s.treasure), `${file}: world and treasure must be non-empty`);
    assert.ok(Array.isArray(s.places) && s.places.length && s.places.every(filled), `${file}: places must list named places`);
    assert.ok(Array.isArray(s.cast) && s.cast.length && s.cast.every(c => filled(c?.name) && filled(c?.role)), `${file}: cast needs a name and role each`);
    CHAPTERS[q.key]().forEach((c, i) => assert.ok(filled(c.story), `${q.key} chapter ${i}: missing story line`));
  });
}

test('story: every playground page loads the trail and settings files and renders the strip from a script it loads', () => {
  for (const q of QUESTS) {
    const html = read(`${q.href}index.html`);
    assert.match(html, /<link rel="stylesheet" href="(\.\.\/)+shared\/trail\.css">/, `${q.href}: load shared/trail.css`);
    assert.match(html, /<script src="(\.\.\/)+shared\/trail\.js"><\/script>/, `${q.href}: load shared/trail.js`);
    assert.match(html, /<link rel="stylesheet" href="(\.\.\/)+shared\/settings\.css">/, `${q.href}: load shared/settings.css`);
    assert.match(html, /<script src="(\.\.\/)+shared\/settings\.js"><\/script>/, `${q.href}: load shared/settings.js`);
    const scripts = [...html.matchAll(/<script src="([^":]+)"><\/script>/g)].map(m => path.join(q.href, m[1]));
    assert.ok(scripts.some(f => read(f).includes('Trail.html(')), `${q.href}: render the strip with Trail.html(ch.story)`);
  }
});
