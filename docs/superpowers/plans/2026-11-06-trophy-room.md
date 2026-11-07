# Trophy Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Trophy Room page that shows a playground level from all XP summed, progress per subject and per playground, and nine achievements, all derived from the saves the playgrounds already write.

**Architecture:** `shared/catalog.js` lists every playground once with its per-chapter mission counts. `shared/trophies.js` turns the saves plus the catalog into stats, a level and achievements. Both are DOM-free IIFEs that set a global, like `shared/tiers.js`; the only DOM function is `Trophies.labelButton`, like `Tiers.renderRail`. `trophy-room/` renders the summary. The landing page and `shared/nav.js` show a "🏆 Level n" button that links to it.

**Tech Stack:** Plain browser JavaScript, no build step. Node's built-in test runner with `node:vm` for unit tests. Playwright for the browser smoke tests in `tests/smoke.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-06-trophy-room-design.md`. Issue #146.

**Conventions for every task:**
- Branch: `feat/146-trophy-room` from `main`, after this plan merges. One PR for the whole plan, `feat(trophy): add the Trophy Room`, unless the reviewer asks to split.
- Commit messages are Conventional Commits; scopes come from `commitlint.config.mjs` (Task 1 adds `trophy`). End each message with the attribution trailer.
- Comments: only the why, a workaround, an invariant or a gotcha. No narration.
- Before each commit, run the commands in the task. Before the PR: `npm run check && npm test`.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `commitlint.config.mjs` | modify | add the `trophy` scope |
| `shared/catalog.js` | create | `Catalog.SUBJECTS`, `Catalog.QUESTS` |
| `tests/trophy/catalog.test.mjs` | create | catalog matches real content and every playground page |
| `package.json` | modify | add `tests/trophy/*.test.mjs` to `test:engine` |
| `tools/ci-plan.mjs` | modify | a quest change also runs the catalog test; `tests/trophy/` runs everything |
| `tests/tools/ci-plan.test.mjs` | modify | expectations for the above |
| `shared/trophies.js` | create | `Trophies.questStats/readSave/level/subjectStats/achievements/summary/labelButton` |
| `tests/trophy/trophies.test.mjs` | create | unit tests for derivation, level, achievements |
| `shared/cards.js` | modify | `data-subject` cards take keys from the catalog; label `.trophy-btn` |
| `shared/landing.css` | modify | `.actions` button group |
| `index.html` | modify | Trophy Room button; load catalog and trophies; card `data-subject` |
| `trophy-room/index.html`, `app.js`, `style.css` | create | the page |
| `shared/nav.js` | modify | back link on `trophy-room/`; level button on every other page it serves |
| `tests/smoke.mjs` | modify | Trophy Room and level button tests; landing button list |
| `tools/publish_site.sh`, `tests/tools/publish_site.test.mjs` | modify | publish `trophy-room/` |
| `.github/workflows/pr-preview.yml` | modify | preview on `trophy-room/**` changes |
| `README.md`, `AGENTS.md`, `.claude/skills/new-playground/SKILL.md` | modify | docs and the catalog step |

No change needed: `.github/workflows/ci.yml` (its `node --check` loop already covers `*/app.js` and `shared/*.js`), `tools/build.py` (bundles quest folders only; `nav.js` adds nothing inside a bundle because its path rule does not match there).

---

### Task 1: Add the `trophy` commit scope

**Files:**
- Modify: `commitlint.config.mjs`

- [ ] **Step 1: Add the scope**

In `commitlint.config.mjs`, change the scope list line

```js
      'landing', 'shared', 'progress', 'engine', 'content', 'release',
```

to

```js
      'landing', 'shared', 'progress', 'engine', 'content', 'release', 'trophy',
```

- [ ] **Step 2: Check it**

Run: `echo 'feat(trophy): x' | npx commitlint`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add commitlint.config.mjs
git commit -m "ci: allow the trophy commit scope"
```

---

### Task 2: Catalog and its drift test

**Files:**
- Create: `shared/catalog.js`
- Create: `tests/trophy/catalog.test.mjs`
- Modify: `package.json` (`test:engine`)

- [ ] **Step 1: Write the failing test**

Create `tests/trophy/catalog.test.mjs`:

```js
// shared/catalog.js repeats each playground's chapter and mission counts; this keeps it in step with the real content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadShell } from '../shell/harness.mjs';
import { loadNet } from '../net/harness.mjs';
import { loadAgent } from '../agent/harness.mjs';
import { loadMath } from '../math/harness.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(read('shared/catalog.js'), sandbox);
// Arrays from another vm realm fail deepStrictEqual on their prototype, so compare plain copies.
const plain = x => JSON.parse(JSON.stringify(x));
const { QUESTS, SUBJECTS } = plain(sandbox.Catalog);

const between = (src, a, b) => {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  assert.ok(i >= 0 && j > i, `content marker moved: ${JSON.stringify(a)} .. ${JSON.stringify(b)}`);
  return src.slice(i, j);
};
const appOf = q => read(`programming/${q}/app.js`);
const MATH_BASE = ['../math/vendor/mathjs/math.js', 'rng.js', 'graph.js', 'scene/palette.js', 'scene/model.js', 'input/mathjs-setup.js', 'input/check.js'];
const math = track => () => loadMath([...MATH_BASE, `${track}/content.js`]).content.chapters;

// Script, Python, C++ and Harbor keep CH inside app.js, so cut it out by the markers their teach tests use.
const CHAPTERS = {
  'script-quest-v1': () => new Function('const tagOf=v=>Object.prototype.toString.call(v).slice(8,-1);\n'
    + between(appOf('script-quest'), 'const isArr=', '// ================= UI =================') + '\nreturn CH;')(),
  'python-quest-v1': () => new Function(between(appOf('python-quest'), '', 'const ERRS={') + '\nreturn CH;')(),
  'cpp-quest-v1': () => new Function(between(appOf('cpp-quest'), '', '(()=>{\nconst KEY=') + '\nreturn CH;')(),
  'shell-quest-v1': () => loadShell().content.chapters,
  'harbor-quest-v1': () => new Function(between(appOf('harbor-quest'), 'const CH=[', '\nCH.forEach') + '\nreturn CH;')(),
  'ds-quest-v1': () => {
    const sb = {};
    vm.createContext(sb);
    for (const f of ['engine.js', 'content.js']) vm.runInContext(read(`programming/ds-quest/${f}`), sb);
    return sb.DSQ.CH;
  },
  'net-quest-v1': () => loadNet().CH,
  'agent-quest-v1': () => loadAgent().CH,
  'math-arithmetic-v1': math('arithmetic'),
  'math-algebra-v1': math('algebra'),
  'math-geometry-v1': math('geometry'),
  'math-trigonometry-v1': math('trigonometry'),
};

for (const q of QUESTS) {
  test(`catalog: ${q.name} has the real mission count of every chapter`, () => {
    assert.ok(CHAPTERS[q.key], `add a loader for ${q.key} to CHAPTERS in this file`);
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/trophy/catalog.test.mjs`
Expected: FAIL with `ENOENT: no such file or directory, open '.../shared/catalog.js'`.

- [ ] **Step 3: Write the catalog**

Create `shared/catalog.js`. The counts below were read from the content on 2026-11-06 with the loaders above.

```js
/* Every playground once. `missions` is the mission count of each chapter, in chapter order; `sep` joins chapter and
   mission in the save's `done` keys. tests/trophy/catalog.test.mjs fails when either drifts from the real content. */
(function (root) {
  const SUBJECTS = [
    { id: 'programming', name: 'Programming', href: 'programming/', unit: 'quests', icon: '💻' },
    { id: 'math', name: 'Math', href: 'math/', unit: 'tracks', icon: '📐' },
  ];
  const QUESTS = [
    { key: 'script-quest-v1', name: 'Script Quest', subject: 'programming', href: 'programming/script-quest/', sep: '-', missions: [7, 7, 7, 6, 6, 7, 7, 9, 7, 7, 10, 13] },
    { key: 'python-quest-v1', name: 'Python Quest', subject: 'programming', href: 'programming/python-quest/', sep: '.', missions: [6, 7, 8, 6, 6, 7, 6, 5, 6] },
    { key: 'cpp-quest-v1', name: 'C++ Quest', subject: 'programming', href: 'programming/cpp-quest/', sep: '-', missions: [7, 9, 6, 8, 9, 9, 8, 6, 6] },
    { key: 'shell-quest-v1', name: 'Shell Quest', subject: 'programming', href: 'programming/shell-quest/', sep: '.', missions: [8, 7, 7, 7, 7, 7, 9, 7, 8, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7] },
    { key: 'harbor-quest-v1', name: 'Harbor Quest', subject: 'programming', href: 'programming/harbor-quest/', sep: '.', missions: [6, 6, 9, 8, 10, 9, 7, 7, 8, 7, 7, 7] },
    { key: 'ds-quest-v1', name: 'Data Structures Quest', subject: 'programming', href: 'programming/ds-quest/', sep: '.', missions: [5, 4, 3, 4, 5, 5] },
    { key: 'net-quest-v1', name: 'Network Quest', subject: 'programming', href: 'programming/net-quest/', sep: '.', missions: [8, 5, 6, 6, 7] },
    { key: 'agent-quest-v1', name: 'Agent Quest', subject: 'programming', href: 'programming/agent-quest/', sep: '.', missions: [5, 5, 4, 5, 5, 4, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3] },
    { key: 'math-arithmetic-v1', name: 'Arithmetic', subject: 'math', href: 'math/arithmetic/', sep: '.', missions: [5, 5, 5, 5, 5] },
    { key: 'math-algebra-v1', name: 'Algebra', subject: 'math', href: 'math/algebra/', sep: '.', missions: [5, 5, 5, 5, 5] },
    { key: 'math-geometry-v1', name: 'Geometry', subject: 'math', href: 'math/geometry/', sep: '.', missions: [5, 5, 5, 5] },
    { key: 'math-trigonometry-v1', name: 'Trigonometry', subject: 'math', href: 'math/trigonometry/', sep: '.', missions: [5] },
  ];
  root.Catalog = { SUBJECTS, QUESTS };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run it and see it pass**

Run: `node --test tests/trophy/catalog.test.mjs`
Expected: 14 tests, all pass.

- [ ] **Step 5: Add the folder to the engine suite**

In `package.json`, in `test:engine`, insert `\"tests/trophy/*.test.mjs\" ` just before `\"tests/tools/*.test.mjs\"`.

Run: `npm run test:engine 2>&1 | grep -E '^# (pass|fail)'`
Expected: `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add shared/catalog.js tests/trophy/catalog.test.mjs package.json
git commit -m "feat(shared): add a catalog of every playground"
```

---

### Task 3: Re-check the catalog whenever a quest changes

A content change in one quest runs only that quest's tests today, so a catalog drift would go unnoticed until a full run.

**Files:**
- Modify: `tools/ci-plan.mjs`
- Modify: `tests/tools/ci-plan.test.mjs`

- [ ] **Step 1: Update the tests first**

In `tests/tools/ci-plan.test.mjs`:

1. In the test `'shared code, tools, fixtures, config and unknown files select everything'`, add `'tests/trophy/trophies.test.mjs'` and `'trophy-room/app.js'` to the list of files.
2. Replace the test `'a non-shell quest skips the other quests and every shell-only job'` with:

```js
test('a non-shell quest skips the other quests and every shell-only job, and re-checks the catalog', () => {
  const jobs = plan(['programming/net-quest/app.js'], repo);
  assert.deepEqual(names(jobs), ['engine tests (net, catalog)', 'browser smoke tests (net)']);
  assert.deepEqual(jobs[0].args, ['--test', 'tests/net/*.test.mjs', 'tests/trophy/catalog.test.mjs']);
  assert.deepEqual(jobs[1].args, ['--test-skip-pattern=^(cpp|ds|shell)[- ]', 'tests/smoke.mjs']);
});
```

3. Replace the test `'a quest without an engine test folder gets only the browser job'` with:

```js
test('a quest without an engine test folder gets the catalog check and the browser job', () => {
  const jobs = plan(['programming/ds-quest/app.js'], repo);
  assert.deepEqual(names(jobs), ['engine tests (catalog)', 'browser smoke tests (ds)']);
  assert.deepEqual(jobs[0].args, ['--test', 'tests/trophy/catalog.test.mjs']);
});
```

4. In `'shell changes add the full course and golden jobs, ...'`, change the expected first name to `'engine tests (shell, catalog)'`.

- [ ] **Step 2: Run and see them fail**

Run: `node --test tests/tools/ci-plan.test.mjs`
Expected: FAIL on the three changed tests and on `trophy-room/app.js` / `tests/trophy/...` (they select `['net', 'trophy']` or similar instead of `null`).

- [ ] **Step 3: Change `tools/ci-plan.mjs`**

Below `const COURSE = ...` add:

```js
// shared/catalog.js repeats every quest's chapter counts, so any quest change re-checks it.
const CATALOG = 'tests/trophy/catalog.test.mjs';
```

In `scope()`, change

```js
    if (!m || m[1] === 'fixtures' || m[1] === 'tools') return null;
```

to

```js
    if (!m || m[1] === 'fixtures' || m[1] === 'tools' || m[1] === 'trophy') return null;
```

In `plan()`, replace

```js
  else {
    const dirs = picked.filter(q => withTests.includes(q));
    if (dirs.length) jobs.push({ name: `engine tests (${dirs.join(', ')})`, args: ['--test', ...dirs.map(q => `tests/${q}/*.test.mjs`)], browser: false });
  }
```

with

```js
  else if (picked.length) {
    const dirs = picked.filter(q => withTests.includes(q));
    jobs.push({ name: `engine tests (${[...dirs, 'catalog'].join(', ')})`, args: ['--test', ...dirs.map(q => `tests/${q}/*.test.mjs`), CATALOG], browser: false });
  }
```

(`trophy-room/` already matches nothing in `scope()`, so it selects everything without a change.)

- [ ] **Step 4: Run and see them pass**

Run: `node --test tests/tools/ci-plan.test.mjs`
Expected: all pass.

Run: `printf 'programming/net-quest/app.js\n' | node tools/ci-plan.mjs`
Expected: a `matrix=` line whose first job is `engine tests (net, catalog)`.

- [ ] **Step 5: Commit**

```bash
git add tools/ci-plan.mjs tests/tools/ci-plan.test.mjs
git commit -m "ci: re-check the playground catalog on every quest change"
```

---

### Task 4: Trophies: stats, level and achievements

**Files:**
- Create: `shared/trophies.js`
- Create: `tests/trophy/trophies.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/trophy/trophies.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sandbox = {};
vm.createContext(sandbox);
for (const f of ['shared/catalog.js', 'shared/trophies.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
const T = sandbox.Trophies;
const plain = x => JSON.parse(JSON.stringify(x));

const SUBJECTS = [{ id: 'programming', name: 'Programming', href: 'programming/', unit: 'quests', icon: '💻' }, { id: 'math', name: 'Math', href: 'math/', unit: 'tracks', icon: '📐' }];
const Q = (key, subject, missions, sep = '.') => ({ key, name: key, subject, href: key + '/', sep, missions });
const store = data => ({ getItem: k => (k in data ? (typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k])) : null) });
// The fields achievements() reads, with nothing done.
const st = (subject, o = {}) => ({ subject, missionsDone: 0, chaptersDone: 0, started: false, complete: false, ...o });
const ach = (stats, id) => plain(T.achievements(stats, SUBJECTS)).find(a => a.id === id);

test('stats count done missions with either separator and a 1 or true value', () => {
  const dot = plain(T.questStats(Q('a', 'math', [2, 1]), { xp: 30, done: { '0.0': 1, '0.1': true, '1.0': false } }));
  assert.equal(dot.missionsDone, 2);
  assert.equal(dot.chaptersDone, 1);
  assert.equal(dot.started, true);
  assert.equal(dot.complete, false);
  assert.equal(dot.xp, 30);
  const dash = plain(T.questStats(Q('b', 'math', [1], '-'), { done: { '0-0': 1 } }));
  assert.equal(dash.complete, true);
  assert.equal(dash.chaptersTotal, 1);
});

test('stats ignore junk, out-of-range, padded and wrong-separator keys', () => {
  const s = plain(T.questStats(Q('a', 'math', [2]), { done: { '5.0': 1, '0.9': 1, 'a.b': 1, '00.0': 1, '0.0.0': 1, '0-0': 1 } }));
  assert.equal(s.missionsDone, 0);
  assert.equal(s.started, false);
});

test('stats take xp only when it is a finite number of at least 0', () => {
  for (const xp of [NaN, -5, '10', Infinity, null]) assert.equal(T.questStats(Q('a', 'math', [1]), { xp }).xp, 0, String(xp));
  assert.equal(T.questStats(Q('a', 'math', [1]), null).missionsDone, 0);
});

test('a missing, broken or blocked save reads as no save', () => {
  const q = Q('a', 'math', [1]);
  assert.equal(T.readSave(store({}), q), null);
  assert.equal(T.readSave(store({ a: '{not json' }), q), null);
  assert.equal(T.readSave(store({ a: '[1]' }), q), null);
  assert.equal(T.readSave({ getItem() { throw new Error('blocked'); } }, q), null);
  assert.equal(T.readSave(null, q), null);
  assert.deepEqual(plain(T.readSave(store({ a: { xp: 1 } }), q)), { xp: 1 });
});

test('a Harbor save without v:1, d and k reads as no save, as Harbor itself treats it', () => {
  const q = Q('harbor-quest-v1', 'programming', [1]);
  assert.equal(T.readSave(store({ 'harbor-quest-v1': { xp: 10, done: { '0.0': 1 } } }), q), null);
  assert.equal(T.readSave(store({ 'harbor-quest-v1': { v: 1, d: {}, k: {}, xp: 10 } }), q).xp, 10);
});

test('level n starts at 20·(n-1)² XP, with a title every 5 levels', () => {
  const at = xp => plain(T.level(xp));
  assert.deepEqual(at(0), { n: 1, title: 'Visitor', lo: 0, hi: 20 });
  assert.equal(at(19).n, 1);
  assert.equal(at(20).n, 2);
  assert.equal(at(79).n, 2);
  assert.equal(at(80).n, 3);
  assert.equal(at(319).title, 'Visitor');
  assert.deepEqual(at(320), { n: 5, title: 'Explorer', lo: 320, hi: 500 });
  assert.equal(at(1620).title, 'Regular');
  assert.equal(at(3920).title, 'Veteran');
  assert.deepEqual(at(7220), { n: 20, title: 'Legend', lo: 7220, hi: 8000 });
  assert.equal(at(-5).n, 1);
});

test('First Steps needs one mission anywhere', () => {
  assert.equal(ach([st('math')], 'first-steps').earned, false);
  assert.equal(ach([st('math', { missionsDone: 1, started: true })], 'first-steps').earned, true);
});

test('Curious needs 3 playgrounds started and shows how close you are', () => {
  const two = [st('math', { started: true }), st('math', { started: true }), st('math')];
  assert.deepEqual(ach(two, 'curious').progress, { have: 2, need: 3 });
  assert.equal(ach(two, 'curious').earned, false);
  const three = [st('math', { started: true }), st('math', { started: true }), st('programming', { started: true })];
  assert.equal(ach(three, 'curious').earned, true);
  assert.equal(ach(three, 'curious').progress, undefined);
});

test('Wanderer needs every playground started', () => {
  assert.equal(ach([st('math', { started: true }), st('math')], 'wanderer').earned, false);
  assert.equal(ach([st('math', { started: true }), st('math', { started: true })], 'wanderer').earned, true);
});

test('Chapter Chaser wins bronze at 10, silver at 25 and gold at 50 chapters', () => {
  const at = n => ach([st('math', { chaptersDone: n })], 'chapter-chaser');
  assert.equal(at(9).earned, false);
  assert.deepEqual(at(9).progress, { have: 9, need: 10 });
  assert.equal(at(10).earned, true);
  assert.equal(at(10).name, 'Chapter Chaser (bronze)');
  assert.deepEqual(at(10).progress, { have: 10, need: 25 });
  assert.equal(at(25).name, 'Chapter Chaser (silver)');
  assert.equal(at(50).name, 'Chapter Chaser (gold)');
  assert.equal(at(50).progress, undefined);
});

test('Finisher needs one playground complete', () => {
  assert.equal(ach([st('math', { complete: false })], 'finisher').earned, false);
  assert.equal(ach([st('math', { complete: true })], 'finisher').earned, true);
});

test('Playground Master is per subject and needs every playground in it complete', () => {
  const stats = [st('programming', { complete: true }), st('programming', { complete: true }), st('math', { complete: true }), st('math')];
  assert.equal(ach(stats, 'master-programming').earned, true);
  assert.equal(ach(stats, 'master-programming').name, 'Playground Master: Programming');
  assert.equal(ach(stats, 'master-math').earned, false);
  assert.deepEqual(ach(stats, 'master-math').progress, { have: 1, need: 2 });
  assert.equal(ach([st('programming', { complete: true })], 'master-math').earned, false, 'a subject with no playgrounds is never mastered');
});

test('Polymath needs a chapter in both subjects', () => {
  assert.equal(ach([st('programming', { chaptersDone: 3 }), st('math')], 'polymath').earned, false);
  assert.equal(ach([st('programming', { chaptersDone: 1 }), st('math', { chaptersDone: 1 })], 'polymath').earned, true);
});

test('Grand Master needs every playground complete', () => {
  assert.equal(ach([st('programming', { complete: true }), st('math')], 'grand-master').earned, false);
  assert.equal(ach([st('programming', { complete: true }), st('math', { complete: true })], 'grand-master').earned, true);
});

test('there are nine achievements, in page order', () => {
  assert.deepEqual(plain(T.achievements([st('math')], SUBJECTS)).map(a => a.id),
    ['first-steps', 'curious', 'wanderer', 'chapter-chaser', 'finisher', 'master-programming', 'master-math', 'polymath', 'grand-master']);
});

test('summary sums XP over the real catalog and works out level, subjects and quests', () => {
  const s = plain(T.summary(store({
    'python-quest-v1': { xp: 85, done: { '0.0': 1, '0.1': 1, '0.2': 1, '0.3': 1, '0.4': 1, '0.5': 1 } },
    'math-trigonometry-v1': { xp: 75, done: { '0.0': true, '0.1': true, '0.2': true, '0.3': true, '0.4': true } },
  }), sandbox.Catalog));
  assert.equal(s.xp, 160);
  assert.equal(s.level.n, 3);
  assert.equal(s.quests.length, 12);
  assert.deepEqual(s.subjects.map(x => [x.id, x.started, x.complete, x.chaptersDone]), [['programming', 1, 0, 1], ['math', 1, 1, 1]]);
  assert.deepEqual(s.achievements.filter(a => a.earned).map(a => a.id), ['first-steps', 'finisher', 'polymath']);
});
```

- [ ] **Step 2: Run and see them fail**

Run: `node --test tests/trophy/trophies.test.mjs`
Expected: FAIL with `ENOENT ... shared/trophies.js`.

- [ ] **Step 3: Write `shared/trophies.js`**

```js
/* Trophy Room numbers, worked out on every read from the saves the playgrounds already keep; nothing here is stored.
   DOM-free except labelButton. */
(function (root) {
  const LEVEL_STEP = 20;
  const TITLES = [[20, 'Legend'], [15, 'Veteran'], [10, 'Regular'], [5, 'Explorer'], [1, 'Visitor']];
  const MEDALS = [[10, 'bronze', '🥉'], [25, 'silver', '🥈'], [50, 'gold', '🥇']];
  const INDEX = /^(0|[1-9]\d*)$/;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
  const count = (xs, f) => xs.filter(f).length;

  // Harbor Quest discards a save without v:1, d and k and starts fresh, so the room must not count one either.
  const usable = (q, o) => isObj(o) && (q.key !== 'harbor-quest-v1' || (o.v === 1 && !!o.d && !!o.k));

  function readSave(storage, q) {
    try {
      const o = JSON.parse(storage.getItem(q.key));
      return usable(q, o) ? o : null;
    } catch (e) {
      return null;
    }
  }

  function questStats(q, save) {
    const s = isObj(save) ? save : {};
    const done = isObj(s.done) ? s.done : {};
    const perChapter = q.missions.map(() => 0);
    for (const k of Object.keys(done)) {
      const parts = k.split(q.sep);
      if (!done[k] || parts.length !== 2 || !INDEX.test(parts[0]) || !INDEX.test(parts[1])) continue;
      const c = +parts[0], m = +parts[1];
      if (c < q.missions.length && m < q.missions[c]) perChapter[c]++;
    }
    const missionsDone = sum(perChapter, n => n);
    const missionsTotal = sum(q.missions, n => n);
    return {
      key: q.key, name: q.name, subject: q.subject, href: q.href,
      xp: typeof s.xp === 'number' && Number.isFinite(s.xp) && s.xp > 0 ? s.xp : 0,
      missionsDone, missionsTotal,
      chaptersDone: count(perChapter, (n, c) => n === q.missions[c]), chaptersTotal: q.missions.length,
      started: missionsDone > 0, complete: missionsDone === missionsTotal,
    };
  }

  function level(xp) {
    const n = Math.floor(Math.sqrt(Math.max(0, xp) / LEVEL_STEP)) + 1;
    return { n, title: TITLES.find(([min]) => n >= min)[1], lo: LEVEL_STEP * (n - 1) ** 2, hi: LEVEL_STEP * n ** 2 };
  }

  const subjectStats = (stats, subjects) => subjects.map(s => {
    const qs = stats.filter(q => q.subject === s.id);
    return { id: s.id, name: s.name, href: s.href, unit: s.unit, quests: qs.length,
      started: count(qs, q => q.started), complete: count(qs, q => q.complete), chaptersDone: sum(qs, q => q.chaptersDone), xp: sum(qs, q => q.xp) };
  });

  // progress is set only while there is something left to reach, so an earned tile never shows "3 of 3".
  const toward = (have, need, earned) => (earned ? undefined : { have: Math.min(have, need), need });

  function achievements(stats, subjects) {
    const started = count(stats, q => q.started), complete = count(stats, q => q.complete);
    const chapters = sum(stats, q => q.chaptersDone);
    const medal = [...MEDALS].reverse().find(([n]) => chapters >= n);
    const nextMedal = MEDALS.find(([n]) => chapters < n);
    const all = qs => qs.length > 0 && qs.every(q => q.complete);
    const of = id => stats.filter(q => q.subject === id);
    return [
      { id: 'first-steps', name: 'First Steps', icon: '👣', earned: started > 0, condition: 'Finish any mission.' },
      { id: 'curious', name: 'Curious', icon: '🧭', earned: started >= 3, condition: 'Start 3 different playgrounds.', progress: toward(started, 3, started >= 3) },
      { id: 'wanderer', name: 'Wanderer', icon: '🗺️', earned: started === stats.length, condition: 'Start every playground.', progress: toward(started, stats.length, started === stats.length) },
      { id: 'chapter-chaser', name: medal ? `Chapter Chaser (${medal[1]})` : 'Chapter Chaser', icon: medal ? medal[2] : MEDALS[0][2], earned: !!medal,
        condition: nextMedal ? `Finish ${nextMedal[0]} chapters for ${nextMedal[1]}.` : 'Every medal won.', progress: nextMedal && { have: chapters, need: nextMedal[0] } },
      { id: 'finisher', name: 'Finisher', icon: '🏁', earned: complete > 0, condition: 'Finish every chapter of one playground.' },
      ...subjects.map(s => {
        const qs = of(s.id), done = count(qs, q => q.complete);
        return { id: 'master-' + s.id, name: 'Playground Master: ' + s.name, icon: s.icon, earned: all(qs),
          condition: `Finish every ${s.name} playground.`, progress: toward(done, qs.length, all(qs)) };
      }),
      { id: 'polymath', name: 'Polymath', icon: '🎓', earned: subjects.every(s => of(s.id).some(q => q.chaptersDone > 0)),
        condition: `Finish a chapter in ${subjects.map(s => s.name).join(' and ')}.` },
      { id: 'grand-master', name: 'Grand Master', icon: '👑', earned: all(stats), condition: 'Finish every playground.', progress: toward(complete, stats.length, all(stats)) },
    ];
  }

  function summary(storage, catalog) {
    const quests = catalog.QUESTS.map(q => questStats(q, readSave(storage, q)));
    const xp = sum(quests, q => q.xp);
    return { xp, level: level(xp), quests, subjects: subjectStats(quests, catalog.SUBJECTS), achievements: achievements(quests, catalog.SUBJECTS) };
  }

  function labelButton(a) {
    let storage = null;
    try { storage = root.localStorage; } catch (e) { /* storage blocked: level 1 */ }
    const n = summary(storage, root.Catalog).level.n;
    a.querySelector('.lvl').textContent = 'Level ' + n;
    a.setAttribute('aria-label', 'Trophy Room, level ' + n);
  }

  root.Trophies = { readSave, questStats, level, subjectStats, achievements, summary, labelButton };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run and see them pass**

Run: `node --test "tests/trophy/*.test.mjs"` (Node treats a bare folder argument as a file and fails)
Expected: 30 tests, all pass (catalog and trophies).

- [ ] **Step 5: Commit**

```bash
git add shared/trophies.js tests/trophy/trophies.test.mjs
git commit -m "feat(shared): work out level and achievements from saved progress"
```

---

### Task 5: Landing page: catalog-driven cards and the Trophy Room button

**Files:**
- Modify: `shared/cards.js`
- Modify: `shared/landing.css`
- Modify: `index.html`
- Modify: `tests/smoke.mjs`

- [ ] **Step 1: Update the smoke tests first**

In `tests/smoke.mjs`, replace the test `'landing page links to GitHub and the feature request form'` with:

```js
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
```

The existing tests `'programming hub shows saved XP and the landing page sums it'` and `'landing page sums Math XP'` stay as they are: they now prove the catalog-driven keys.

- [ ] **Step 2: Run and see the new tests fail**

Run: `node --test --test-name-pattern='^landing page' tests/smoke.mjs`
Expected: the two tests above FAIL (no `trophy-room/` link, no `.trophy-btn`).

- [ ] **Step 3: Change `shared/cards.js`**

Replace the whole file with:

```js
/* Show saved XP on each card, and the playground level on the Trophy Room button. Playgrounds on the same origin share
   localStorage, so this just reads it. A data-subject card takes its keys from shared/catalog.js. */
const keysOf = card => card.dataset.subject && window.Catalog
  ? Catalog.QUESTS.filter(q => q.subject === card.dataset.subject).map(q => q.key)
  : card.dataset.keys ? card.dataset.keys.split(' ') : [card.dataset.key];

document.querySelectorAll('.card[data-key], .card[data-keys], .card[data-subject]').forEach(card => {
  let xp = 0;
  for (const key of keysOf(card)) {
    try {
      const raw = localStorage.getItem(key);
      const v = raw && JSON.parse(raw).xp;
      if (typeof v === 'number' && v > 0) xp += v;
    } catch (e) { /* storage blocked or unreadable: this key adds no XP */ }
  }
  if (xp > 0) {
    card.querySelector('.xp').textContent = xp + ' XP';
    card.querySelector('.go').textContent = 'Continue →';
  }
});

if (window.Trophies) document.querySelectorAll('.trophy-btn').forEach(Trophies.labelButton);
```

- [ ] **Step 4: Change `index.html`**

1. Replace the GitHub `<a class="btn" ...>GitHub</a>` line inside `.head` with a group holding the new button first and the unchanged GitHub link:

```html
    <div class="actions">
      <a class="btn trophy-btn" href="trophy-room/"><span aria-hidden="true">🏆</span><span class="lvl">Trophy Room</span></a>
      <a class="btn" href="https://github.com/shimoncohen/playgrounds" target="_blank" rel="noopener noreferrer"><!-- the existing GitHub svg, unchanged -->GitHub</a>
    </div>
```

Keep the existing `<svg>...</svg>` of the GitHub link exactly as it is; only wrap the link.

2. On the Programming card, replace `data-keys="script-quest-v1 python-quest-v1 cpp-quest-v1 shell-quest-v1 harbor-quest-v1 ds-quest-v1 net-quest-v1 agent-quest-v1"` with `data-subject="programming"`.
3. On the Math card, replace `data-keys="math-arithmetic-v1 math-algebra-v1 math-geometry-v1 math-trigonometry-v1"` with `data-subject="math"`.
4. Before `<script src="shared/cards.js"></script>` add:

```html
<script src="shared/catalog.js"></script>
<script src="shared/trophies.js"></script>
```

- [ ] **Step 5: Add the button group style**

Append to `shared/landing.css`:

```css
.actions{display:flex;flex-wrap:wrap;gap:8px}
```

- [ ] **Step 6: Run the landing tests**

Run: `node --test --test-name-pattern='^(landing page|programming hub)' tests/smoke.mjs`
Expected: all pass, including the two XP-sum tests.

- [ ] **Step 7: Commit**

```bash
git add shared/cards.js shared/landing.css index.html tests/smoke.mjs
git commit -m "feat(landing): add the Trophy Room button and read card keys from the catalog"
```

---

### Task 6: The Trophy Room page

**Files:**
- Create: `trophy-room/index.html`, `trophy-room/app.js`, `trophy-room/style.css`
- Modify: `shared/nav.js` (path rule only, so the room gets the back link)
- Modify: `tests/smoke.mjs`

- [ ] **Step 1: Write the smoke tests**

Append to `tests/smoke.mjs`, after the landing page tests:

```js
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
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const width of [1280, 390]) {
  test(`trophy room works out level, playgrounds and achievements from saved progress at ${width}px`, async () => {
    const { ctx, page, errors } = await open(`${base}/trophy-room/`, { viewport: { width, height: 900 } }, c => c.addInitScript(TROPHY_SEED));
    assert.match(await page.textContent('#lv-h'), /Level 3 · Visitor/);
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
```

- [ ] **Step 2: Run and see them fail**

Run: `node --test --test-name-pattern='^trophy room' tests/smoke.mjs`
Expected: FAIL (404, no `#lv-h`).

- [ ] **Step 3: Create `trophy-room/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Trophy Room · Playgrounds</title>
<meta name="description" content="Your playground level, progress and achievements across every playground.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=JetBrains+Mono:wght@400;600&display=swap">
<link rel="stylesheet" href="../shared/landing.css">
<link rel="stylesheet" href="../shared/nav.css">
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="wrap">
<header class="top">
  <div class="head">
    <h1 class="brand"><span class="logo" aria-hidden="true">🏆</span>Trophy Room</h1>
  </div>
  <p class="lede">Everything you have done across the playgrounds, worked out from the progress saved in this browser.</p>
</header>

<main>
<div class="room" id="room"></div>
<p class="note"><b>Your progress stays on this device.</b> It is saved in your browser, so clearing site data erases it. Every playground has a <b>Progress</b> button in its header to export a backup file or, in Chrome and Edge, keep one up to date automatically.</p>
</main>
</div>
<script src="../shared/theme.js"></script>
<script src="../shared/catalog.js"></script>
<script src="../shared/trophies.js"></script>
<script src="app.js"></script>
<script src="../shared/nav.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `trophy-room/app.js`**

```js
(() => {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const num = n => n.toLocaleString('en-US');
  const bar = (label, now, max) => `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${now}"><i style="width:${max ? Math.min(100, now / max * 100) : 0}%"></i></div>`;
  const status = a => {
    const left = a.progress ? ` (${a.progress.have} of ${a.progress.need})` : '';
    if (!a.earned) return 'Locked: ' + esc(a.condition) + left;
    return a.progress ? 'Earned. Next: ' + esc(a.condition) + left : 'Earned';
  };

  function storage() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  function render() {
    const S = Trophies.summary(storage(), Catalog);
    const L = S.level;
    const earned = S.achievements.filter(a => a.earned).length;
    document.getElementById('room').innerHTML = `
<section class="box level" aria-labelledby="lv-h">
  <div class="ring" aria-hidden="true">${L.n}</div>
  <h2 id="lv-h">Level ${L.n} · ${esc(L.title)}</h2>
  <p class="muted">${num(S.xp)} XP</p>
  ${bar(`Progress to level ${L.n + 1}`, S.xp - L.lo, L.hi - L.lo)}
  <p class="muted">${num(L.hi - S.xp)} XP to Level ${L.n + 1}</p>
  ${S.xp === 0 && !S.quests.some(q => q.started) ? '<p class="empty">Finish a mission in any playground to start filling this room. Try <a href="../programming/">Programming</a> or <a href="../math/">Math</a>.</p>' : ''}
</section>
<section class="box" aria-labelledby="sb-h">
  <h2 id="sb-h">Subjects</h2>
  ${S.subjects.map(s => `<div class="subject">
    <div class="row"><a href="../${s.href}">${esc(s.name)}</a><span class="muted">${s.complete} of ${s.quests} ${esc(s.unit)} finished · ${s.chaptersDone} chapters</span></div>
    ${bar(`${s.name}: ${s.complete} of ${s.quests} ${s.unit} finished`, s.complete, s.quests)}
  </div>`).join('')}
</section>
<section class="box" aria-labelledby="qs-h">
  <h2 id="qs-h">Playgrounds</h2>
  ${S.subjects.map(s => `<h3>${esc(s.name)}</h3><ul class="quests">${S.quests.filter(q => q.subject === s.id).map(q => `<li class="row">
    <a href="../${q.href}">${esc(q.name)}</a>
    <span class="muted">${q.started ? `${q.chaptersDone} / ${q.chaptersTotal} chapters · ${num(q.xp)} XP` : 'Not started'}${q.complete ? ' <span class="pill">Done</span>' : ''}</span>
  </li>`).join('')}</ul>`).join('')}
</section>
<section aria-labelledby="ac-h">
  <h2 id="ac-h">Achievements · ${earned} of ${S.achievements.length}</h2>
  <ul class="ach">${S.achievements.map(a => `<li class="a${a.earned ? '' : ' off'}">
    <span class="icon" aria-hidden="true">${a.icon}</span><b>${esc(a.name)}</b><span class="cond">${status(a)}</span>
  </li>`).join('')}</ul>
  <p class="muted small">New playgrounds join the "every playground" achievements when they launch.</p>
</section>`;
  }

  render();
  // Coming back with the browser's back button can show a cached page from before the latest mission.
  addEventListener('pageshow', e => { if (e.persisted) render(); });
})();
```

- [ ] **Step 5: Create `trophy-room/style.css`**

```css
.room{display:grid;gap:16px;max-width:640px;margin:28px auto 0}
.room h2{font-size:21px;margin-bottom:12px}
.box{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px}
.box h3{font-size:15px;color:var(--muted);margin:14px 0 0}
.level{text-align:center}
.level h2{margin-bottom:2px}
.ring{width:72px;height:72px;margin:0 auto 10px;border-radius:50%;display:grid;place-items:center;background:var(--term-bg);color:var(--term-prompt);font-family:var(--font-display);font-weight:800;font-size:28px}
.muted{margin:0;color:var(--muted);font-size:14px;font-variant-numeric:tabular-nums}
.small{margin-top:10px;font-size:13px}
.empty{margin:12px 0 0}
.bar{height:10px;margin:8px 0;border-radius:99px;background:var(--surface-2);overflow:hidden}
.bar i{display:block;height:100%;background:var(--accent)}
.subject+.subject{margin-top:12px}
.row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px}
.row a{color:var(--ink);font-weight:700}
.quests{list-style:none;margin:0;padding:0}
.quests li{padding:8px 0;border-bottom:1px solid var(--surface-2)}
.pill{font-size:12px;font-weight:700;padding:1px 8px;border-radius:99px;background:var(--surface-2);color:var(--accent-text)}
.ach{list-style:none;margin:0;padding:0;display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr))}
.a{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 10px;text-align:center;background:var(--surface);border:1px solid var(--line);border-radius:12px}
.a .icon{font-size:28px;line-height:1}
.a b{font-size:14px}
.cond{font-size:12.5px;color:var(--muted)}
.a.off{background:transparent;border-style:dashed}
.a.off .icon{filter:grayscale(1);opacity:.5}
```

- [ ] **Step 6: Give the room the back link**

In `shared/nav.js`, change the path rule

```js
  const at = /\/((?:programming\/)?\w+-quest\/(?:\w+\/)?|math\/(?:\w+\/)?|programming\/)(?:index\.html)?$/.exec(location.pathname);
```

to

```js
  const at = /\/((?:programming\/)?\w+-quest\/(?:\w+\/)?|math\/(?:\w+\/)?|programming\/|trophy-room\/)(?:index\.html)?$/.exec(location.pathname);
```

and update the comment above the IIFE to list `trophy-room/` with the other folders.

- [ ] **Step 7: Run the tests**

Run: `node --test --test-name-pattern='^trophy room' tests/smoke.mjs`
Expected: all 4 pass.

- [ ] **Step 8: Look at it**

Serve with `python3 -m http.server 8000` (background), seed the progress from `TROPHY_SEED` in the browser console, and take screenshots of `http://localhost:8000/trophy-room/` at 1280 and 390 wide, in light and dark. Check the order (level, subjects, playgrounds, achievements) and that locked tiles read as locked in both themes.

- [ ] **Step 9: Commit**

```bash
git add trophy-room/ shared/nav.js tests/smoke.mjs
git commit -m "feat(trophy): add the Trophy Room page"
```

---

### Task 7: The level button on every hub and playground

**Files:**
- Modify: `shared/nav.js`
- Modify: `tests/smoke.mjs`

- [ ] **Step 1: Write the smoke tests**

Append to `tests/smoke.mjs`, after the Trophy Room tests:

```js
for (const pg of ['programming/', 'programming/python-quest/', 'math/algebra/']) {
  test(`trophy room button on ${pg} shows the level and opens the room`, async () => {
    const { ctx, page, errors } = await open(`${base}/${pg}`, {}, c => c.addInitScript(TROPHY_SEED));
    await page.waitForFunction(() => document.querySelector('.nv-trophy .lvl')?.textContent === 'Level 3');
    await page.click('.nv-trophy');
    await page.waitForSelector('#lv-h');
    assert.equal(new URL(page.url()).pathname, '/trophy-room/');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
```

- [ ] **Step 2: Run and see them fail**

Run: `node --test --test-name-pattern='^trophy room button' tests/smoke.mjs`
Expected: FAIL (timeout waiting for `.nv-trophy`).

- [ ] **Step 3: Add the button in `shared/nav.js`**

Replace the block

```js
  if (at) {
    const up = '../'.repeat(at[1].split('/').length - 2) + (location.protocol === 'file:' ? '../index.html' : '../');
    host.prepend(link('nv-home', up, icon('← '), 'All playgrounds'));
  }
```

with

```js
  if (at) {
    const root = '../'.repeat(at[1].split('/').length - 1);
    const page = location.protocol === 'file:' ? 'index.html' : '';
    const home = link('nv-home', root + page, icon('← '), 'All playgrounds');
    host.prepend(home);
    if (at[1] !== 'trophy-room/') {
      const lvl = document.createElement('span');
      lvl.className = 'lvl';
      lvl.textContent = 'Trophy Room';
      const trophy = link('nv-trophy trophy-btn', root + 'trophy-room/' + page, icon('🏆 '), lvl);
      home.after(trophy);
      // Quest pages don't load the catalog, so fetch the two small scripts only where this button is shown.
      const load = src => new Promise((done, fail) => {
        const s = document.createElement('script');
        s.src = root + 'shared/' + src;
        s.onload = done;
        s.onerror = fail;
        document.head.append(s);
      });
      (window.Trophies ? Promise.resolve() : load('catalog.js').then(() => load('trophies.js')))
        .then(() => window.Trophies.labelButton(trophy), () => { /* scripts did not load: keep the plain label */ });
    }
  }
```

`root` is the same depth the old `up` produced: for `programming/python-quest/` it is `../../`, for `math/` it is `../`.

- [ ] **Step 4: Run the new tests and the pages that share the header**

Run: `node --test --test-name-pattern='^trophy room' tests/smoke.mjs`
Expected: all pass.

Run: `npm run test:browser`
Expected: all pass. In particular the per-quest "mission column fits the screen ... on a phone" tests and the Math 1440px header test must still pass with the extra button; if one fails, fix the button's layout in `shared/nav.css`, not the test.

- [ ] **Step 5: Look at it**

Screenshots of `programming/shell-quest/` and `math/geometry/` at 1280 and 390 wide: the button sits after "← All playgrounds" and the header does not overflow.

- [ ] **Step 6: Commit**

```bash
git add shared/nav.js tests/smoke.mjs
git commit -m "feat(shared): show the playground level on every hub and playground"
```

---

### Task 8: Publish, preview and docs

**Files:**
- Modify: `tools/publish_site.sh`, `tests/tools/publish_site.test.mjs`
- Modify: `.github/workflows/pr-preview.yml`
- Modify: `README.md`, `AGENTS.md`, `.claude/skills/new-playground/SKILL.md`
- Modify: `docs/superpowers/specs/2026-11-06-trophy-room-design.md` (two lines that changed during planning)

- [ ] **Step 1: Publish test first**

In `tests/tools/publish_site.test.mjs`, after the two lines that create `math/index.html`, add:

```js
  mkdirSync(join(site, 'trophy-room'));
  writeFileSync(join(site, 'trophy-room', 'index.html'), 'trophies');
```

and after the `'math section published'` assertion add:

```js
  assert.ok(files.includes('pr-preview/pr-7/trophy-room/index.html'), 'trophy room published');
```

Run: `node --test tests/tools/publish_site.test.mjs`
Expected: FAIL on `'trophy room published'`.

- [ ] **Step 2: Publish the folder**

In `tools/publish_site.sh`, change `site=(index.html shared programming math)` to `site=(index.html shared programming math trophy-room)`, and add `trophy-room/` to the comment on line 8 that lists the site.

Run: `node --test tests/tools/publish_site.test.mjs`
Expected: pass.

- [ ] **Step 3: Preview on changes to the room**

In `.github/workflows/pr-preview.yml`, under `paths:`, after `- 'math/**'` add `- 'trophy-room/**'`.

- [ ] **Step 4: Commit the CI and deploy part on its own**

```bash
git add tools/publish_site.sh tests/tools/publish_site.test.mjs .github/workflows/pr-preview.yml
git commit -m "ci: publish and preview the Trophy Room"
```

AGENTS.md asks to flag CI and deploy changes, so name this commit in the PR body.

- [ ] **Step 5: Docs**

`README.md`:
- After the Math row of the playground table, add a paragraph: `**Trophy Room** ([`trophy-room/`](trophy-room/)) shows your playground level, worked out from the XP of every playground, your progress per subject and playground, and achievements such as Playground Master. It reads the progress already saved in your browser.`
- In "Map of the repo", change the `shared/` line to also name `catalog.js` (every playground's key and chapter counts) and `trophies.js` (level and achievements), and add a line: `trophy-room/             the Trophy Room: index.html + style.css + app.js, rendered from shared/trophies.js`.

`AGENTS.md`:
- In the "Add a whole playground" row, add: `its entry in shared/catalog.js (key, name, subject, href, done-key separator, missions per chapter) and its loader in tests/trophy/catalog.test.mjs`. Replace "its key in the landing page's Programming card `data-keys`" with nothing: the landing card now reads the catalog.
- In the "Add a Math track" row, replace "landing card `data-keys`" with "its entry in `shared/catalog.js` and its loader in `tests/trophy/catalog.test.mjs`".
- In the "Change the Math hub" row, drop "landing card `data-keys` in `index.html`".
- Add a row: `| Change the Trophy Room | shared/trophies.js (DOM-free; level, achievements), trophy-room/ (page), shared/catalog.js (playgrounds and their counts) + tests/trophy/ and the trophy room tests in tests/smoke.mjs |`.

`.claude/skills/new-playground/SKILL.md`, step 4: replace "and add the quest's progress key to the `data-keys` of the Programming card" with "and add the quest to `shared/catalog.js` (its mission count per chapter, in order) plus a loader in `tests/trophy/catalog.test.mjs`; the landing card and the Trophy Room read the catalog".

Spec (`docs/superpowers/specs/2026-11-06-trophy-room-design.md`):
- In "Layout", `catalog.js` line: replace "(window.Catalog and an ES export for tests)" with "(window.Catalog; tests load it with node:vm, like shared/tiers.js)".
- In "Entry points", replace the sentence starting "`nav.js` gets the level from" with: "`nav.js` loads `shared/catalog.js` and `shared/trophies.js` itself, only on pages where it shows the button, so no quest page changes."

- [ ] **Step 6: Full check**

Run: `npm run check && npm test`
Expected: all playgrounds bundle; engine and browser tests pass.

Run: `npm run build && ls dist | grep -i trophy`
Expected: no output. The room is not bundled. Bundles do contain `nav.js` and so the text `trophy-room`, but its path rule never matches inside a bundle, so no button appears there.

- [ ] **Step 7: Comment gate**

Run: `git diff main --unified=0 | grep -E '^\+.*(//|/\*|<!--|#)' | grep -vE '^\+\+\+'`
Check each line is a why, workaround, invariant or gotcha; delete or shorten the rest.

- [ ] **Step 8: Commit**

```bash
git add README.md AGENTS.md .claude/skills/new-playground/SKILL.md docs/superpowers/specs/2026-11-06-trophy-room-design.md
git commit -m "docs(trophy): document the Trophy Room and the playground catalog"
```

---

## After the last task

- Open the PR `feat(trophy): add the Trophy Room` with `Closes #146`, the template filled in, QA checkboxes for: open the PR preview's `trophy-room/` with no progress; play one mission in two playgrounds and reload the room; check the level button on the landing page, a hub and a quest at 390px.
- Use the `pre-pr-check` skill.
