# Math Quest Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Math Quest hub, its prerequisite graph, the scene layer, the working-and-input layer, and the first two track chapters (Arithmetic 1, Algebra 1).

**Architecture:** Plain browser scripts sharing one global namespace `MQ`, loaded in order by each page. DOM-free files (`graph.js`, `scene/model.js`, `input/check.js`, `input/mathjs-setup.js`, track `content.js`) never touch `window`, `document` or `localStorage`; Node tests load them in a `vm` sandbox, as `tests/net/harness.mjs` does. `math-quest/index.html` is the hub. Each track (`math-quest/<track>/`) is a full quest page with the same page contract as the other quests.

**Tech Stack:** Plain JS, Node `node:test` + `vm`, Playwright (existing smoke tests). Vendored KaTeX, math.js, MathLive and three.js at pinned versions (approved exception, spec "Dependencies").

**Spec:** `docs/superpowers/specs/2026-11-03-math-quest-design.md`. Issue: #103.

## Global Constraints

- No build step for the site. Pages work from GitHub Pages and from a local static server. Vendored files are committed; only `tools/vendor-math.sh` changes them.
- DOM-free files never touch `window`, `document` or `localStorage`, and never call `Math.random` or `Date.now`: random points and quick-fire use the seeded generator `MQ.rng(seed)`.
- Save keys are exactly `math-<track>-v1` and `math-prefs-v1`. Mission keys are `'<chapter>.<mission>'`; once shipped they are never renumbered, only appended. Chapters are appended to the end of a track.
- `graph.js` chapter lists match each track's `content.js` chapters: same ids, same order (`S.badges[i]` is positional).
- Hub files (`math-quest/index.html`, `style.css`, `app.js`, `graph.js`) are bundled by `tools/build.py`: relative `<script src>` / `<link href>`, never `</script` or `</style` inside. The hub loads no vendored library.
- Learner text follows AGENTS.md rules 9 to 12 and the `mission-voice` and `add-mission` skills: whole idea first, then each part; math terms are taught before use.
- Every mission has `answer`, `wrong` and `lazy`: the answer passes its own check, the other two fail.
- Do not regenerate or edit `tests/fixtures/`. Do not weaken, skip or delete an existing test.
- Conventional Commits with scope `math` (after T0). Never bump the version or edit `CHANGELOG.md`.
- Match the surrounding style (compact `net-quest/*.js` style, comment density, naming).

## Review Focus

1. **Honest checks:** for every `expr` mission, the lazy answer (the question itself) fails through its `form` rule; every step-checker test has a passing step, a wrong step, and a step after a wrong step that still passes (checked against the original). T4.
2. **Equation steps:** a valid both-sides step passes; dividing by `x` and squaring are flagged with their reason. T4.
3. **Saved state:** a notes-only save is not `pristine`; old saves without `notes` and `work` load; export and import keep both. T4.
4. **Graph contract:** no cycles, every `requires` resolves, chapter lists match `content.js`. T2, T5.
5. **WebGL in CI:** decide in T3 whether the 3D screenshot check can run in CI, with evidence.
6. **Shared-file conflicts:** `feat/47-rust-quest` and `feat/51-agent-quest` also edit `commitlint.config.mjs` (the scope line), `tests/smoke.mjs`, `index.html`, `README.md`, `package.json` and `ci.yml`. Recheck against `main` before the final PR.

---

## PR split

| PR | Task | Base | Title | Depends on |
|---|---|---|---|---|
| 1 | 1 | `main` | `docs: add math quest spec and plan` | none |
| 2 | 0 | `feat/103-math-quest` | `ci: allow the math commit scope` | 1 |
| 3 | T1 | `feat/103-math-quest` | `build(math): vendor KaTeX, math.js, MathLive and three.js` | 2 |
| 4 | T2 | `feat/103-math-quest` | `feat(math): prerequisite graph and hub` | 3 |
| 5 | T3 | `feat/103-math-quest` | `feat(math): scene layer` | 4 |
| 6 | T4 | `feat/103-math-quest` | `feat(math): working area, input modes and step checker` | 5 |
| 7 | T5 | `feat/103-math-quest` | `feat(math): arithmetic and algebra chapter 1` | 6 |
| 8 | final | `main` | `feat(math): math quest` (merge commit) | 7 |

Each PR body says "Part of #103" and carries a QA checklist of real checkboxes, each naming its command or action. `feat/103-math-quest` is created from `main` after PR 1 merges.

### Task 1: Spec and plan (PR 1)

**Files:** Create `docs/superpowers/specs/2026-11-03-math-quest-design.md`, `docs/superpowers/plans/2026-11-03-math-quest-phase1.md`.

- [ ] **Step 1:** `printf '%s\n' "docs: add math quest spec and plan" | npx --no -- commitlint` exits 0 (no scope, so T0 is not needed first).
- [ ] **Step 2:** `npm run check` exits 0; `git diff --name-only origin/main...HEAD` lists only the two files.
- [ ] **Step 3:** No Claude session link in either file or in the PR body.

### Task 0: Commit scope (PR 2)

**Files:** Modify `commitlint.config.mjs` (add `'math'` to `scope-enum`), `CONTRIBUTING.md` (scope list).

- [ ] **Step 1: Fails first.** `printf '%s\n' "feat(math): x" | npx --no -- commitlint` exits 1 with `scope-enum`.
- [ ] **Step 2:** Add `'math'` after `'agent'`. Add `math` to the scope list in `CONTRIBUTING.md`.
- [ ] **Step 3:** The same command exits 0; `npm run check` exits 0.

### Task T1: Vendored libraries (PR 3)

**Files:**
- Create: `tools/vendor-math.sh`, `math-quest/vendor/` (generated), `tests/math/vendor.test.mjs`
- Modify: `package.json:13` (`test:engine` adds `"tests/math/*.test.mjs"`), `.github/workflows/ci.yml:31` (syntax loop adds `math-quest/*.js math-quest/scene/*.js math-quest/input/*.js math-quest/*/app.js math-quest/*/content.js tests/math/*.mjs`), the same loop in `AGENTS.md:17` and `.claude/skills/pre-pr-check/SKILL.md:11`, `AGENTS.md` ("Where things go" row and the dependency exception), `.claude/skills/new-playground/SKILL.md` (one line: Math Quest's vendored libraries are an approved exception, not a precedent), `README.md` (dependency note)

Pinned versions (spec "Dependencies"): `katex@0.19.1`, `mathjs@15.2.0`, `mathlive@0.111.4`, `three@0.187.0`, `esbuild@0.25.10`.

- [ ] **Step 1: Test first.** `tests/math/vendor.test.mjs` asserts that these files exist and are non-empty: `vendor/katex/katex.min.js`, `vendor/katex/katex.min.css`, `vendor/katex/fonts/KaTeX_Main-Regular.woff2`, `vendor/mathjs/math.js`, `vendor/mathlive/mathlive.min.js`, `vendor/three/three.min.js`; and that loading `math.js` and `three.min.js` into a `vm` sandbox defines `math.evaluate` and `THREE.WebGLRenderer` and `THREE.OrbitControls`. Run `node --test tests/math/vendor.test.mjs`: FAIL (files missing).
- [ ] **Step 2: Write `tools/vendor-math.sh`** (`set -euo pipefail`; a temp dir removed on exit by `trap`). It runs `npm pack` for each pinned package into the temp dir, extracts each one, copies `katex/dist/{katex.min.js,katex.min.css,fonts/*.woff2}`, `mathjs/lib/browser/math.js` (+ its `LICENSE` file) and `mathlive/mathlive.min.js` (+ `LICENSE`, no sounds, no fonts) into `math-quest/vendor/<lib>/`. three.js: write an entry file that runs `import * as T from 'three'; import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; globalThis.THREE = Object.assign({}, T, { OrbitControls });`, then `npx -y esbuild@0.25.10 entry.js --bundle --minify --format=iife --outfile=math-quest/vendor/three/three.min.js` with the extracted package as `node_modules/three`, and copy its `LICENSE`. Each `vendor/<lib>/` gets a one-line `VERSION` file.
- [ ] **Step 3:** Run `tools/vendor-math.sh`, then the test: PASS. Check `grep -c '</script' math-quest/vendor/three/three.min.js` prints 0, and record the four file sizes in the PR body.
- [ ] **Step 4: Rerun check.** Run the script a second time; `git status --short math-quest/vendor` is empty (the output is reproducible).
- [ ] **Step 5:** Update the touchpoints listed under Files. Run the `ci.yml` syntax loop locally; it exits 0 (vendor files are not in the loop).
- [ ] **Step 6:** `npm run check && npm test` exit 0. Commit `build(math): vendor KaTeX, math.js, MathLive and three.js`.

### Task T2: Graph and hub (PR 4)

**Files:**
- Create: `math-quest/graph.js`, `math-quest/index.html`, `math-quest/style.css`, `math-quest/app.js`, `tests/math/harness.mjs`, `tests/math/graph.test.mjs`
- Modify: `index.html` (landing card and the XP script), `tests/smoke.mjs`, `README.md` (table row, repo map, count), `AGENTS.md` ("Where things go")

`graph.js` defines `MQ.graph` (DOM-free):

```js
MQ.graph = {
  tracks: [{ id: 'arithmetic', name: 'Arithmetic', key: 'math-arithmetic-v1' },
           { id: 'algebra', name: 'Algebra', key: 'math-algebra-v1' }],
  chapters: {
    arithmetic: [{ id: 'arithmetic.order', title: 'Order of operations', requires: [] }],
    algebra: [{ id: 'algebra.expressions', title: 'Expressions and volume', requires: ['arithmetic.order'],
                why: 'you evaluate expressions with the order of operations' }] },
  // all functions below are pure; `done` is a Set of chapter ids
  chapter(id), trackOf(id), validate() /* -> string[] of errors */,
  doneFrom(states) /* states: { [trackId]: parsed state or null } -> Set */,
  hint(id, done) /* -> { ready: bool, missing: [{ id, title, track, why }] } */,
  layers(trackId) /* -> [[id, ...], ...] by longest prerequisite path */,
  trackEdges() /* -> [[fromTrack, toTrack], ...] unique */,
  nextUp(done, n = 3) /* -> ids not done whose requires are all done, graph order */
};
```

- [ ] **Step 1: Harness.** `tests/math/harness.mjs` exports `loadMath(files)`: a fresh `vm` context with `globalThis = sandbox`, then runs the given files (relative to `math-quest/`) in order and returns `sandbox.MQ`. `FILES_GRAPH = ['graph.js']`.
- [ ] **Step 2: Failing tests** in `tests/math/graph.test.mjs`:
  - `validate()` is `[]` for the shipped graph;
  - a copy with a cycle (`a requires b`, `b requires a`), an unknown `requires`, a duplicate id and a self edge each produce one named error;
  - `doneFrom({ arithmetic: { badges: { 0: true } }, algebra: null })` contains `arithmetic.order` only; a state of `'garbage'` or `{}` does not throw;
  - `hint('algebra.expressions', new Set())` is `{ ready: false, missing: [{ id: 'arithmetic.order', ... }] }`; with `arithmetic.order` done it is `{ ready: true, missing: [] }`;
  - `layers` puts a chapter one layer after its deepest prerequisite; `trackEdges()` is `[['arithmetic', 'algebra']]`; `nextUp(new Set())` is `['arithmetic.order']`.
  Run `node --test tests/math/graph.test.mjs`: FAIL.
- [ ] **Step 3: Implement `graph.js`** until the tests pass. `doneFrom` reads `state.badges[i]` against the position of the chapter in its track list, and treats anything that is not an object with an object `badges` as nothing done.
- [ ] **Step 4: Hub page.** `index.html` loads `../shared/theme.js`, `../shared/nav.css`, `../shared/nav.js`, `style.css`, `graph.js`, `app.js` (no `window.PROGRESS`: the hub has no state). `app.js` reads each track's key with `try { JSON.parse(localStorage.getItem(key)) } catch { null }`, then draws: track cards with a progress ring and link, an SVG overview (one node per track, arrows from `trackEdges()`), a track view on click (`layers()`, faded nodes for other-track prerequisites, each a link to `<track>/#ch=<id>`), and "Next up" (`nextUp(done)`). Below 600px wide, the SVG is hidden and the same data renders as an `<ol>` grouped by layer. The SVG has `role="img"` and an `aria-label`; the list is always in the DOM for screen readers (visually hidden on wide screens).
- [ ] **Step 5: Landing card.** In the root `index.html`, add the Math Quest card with `data-keys="math-arithmetic-v1 math-algebra-v1"` and no `data-key`. Change the XP script at `index.html:127` to read `card.dataset.keys ? card.dataset.keys.split(' ') : [card.dataset.key]` and sum `xp` over the keys, skipping unreadable ones. Select cards with `.card[data-key], .card[data-keys]`.
- [ ] **Step 6: Smoke.** In `tests/smoke.mjs`: the landing-links test expects `NAMES.map(n => `${n}-quest/`)` plus `'math-quest/'`. Add `test('landing page sums Math Quest XP')`: set `math-arithmetic-v1` to `{xp: 10}` and `math-algebra-v1` to `{xp: 15}`, reload, expect `25 XP` on the math card. Add `test('math hub loads cleanly')`: no page errors, two track cards, "Next up" lists "Order of operations", and at 390px the `<ol>` is visible and `scrollWidth <= innerWidth`. Add a Node test in `graph.test.mjs` that the landing card's `data-keys` equals `MQ.graph.tracks.map(t => t.key).join(' ')` (sync contract).
- [ ] **Step 7:** `python3 tools/build.py --check` lists `math-quest`; `npm run check && npm test` exit 0. Screenshots of the hub at 390px and 1440px in the PR. Commit `feat(math): prerequisite graph and hub`.

Track pages do not exist yet, so hub links point at pages added in T5. Mark them in the PR body; the smoke test does not follow them until T5.

### Task T3: Scene layer (PR 5)

**Files:**
- Create: `math-quest/scene/model.js`, `math-quest/scene/view.js`, `math-quest/scene/svg2d.js`, `math-quest/scene/three3d.js`, `math-quest/scene/scene.css`, `math-quest/scene/palette.js`, `tests/math/pages/scenes.html` (a test page that mounts one 2D and one 3D scene from `../../../math-quest/`; it lives under `tests/` so Pages never publishes it), `tests/math/scene.test.mjs`, `tests/math/scene.browser.mjs`
- Modify: `package.json:14` (`test:browser` adds `node tests/math/scene.browser.mjs`), `README.md` (repo map)

Interfaces:

```js
MQ.palette = ['#…', …];          // 6 term colors; T3 picks them and records contrast results in the PR
MQ.scene.model(def) -> {
  set(name, value),              // clamps to [min, max] and snaps to step
  state(),                       // { params, derived, t }
  live(),                        // the def.live string with {name} replaced by values
  describe(),                    // "length 2, width 3, height 4. V = 24."
  colorOf(term)                  // palette color by order of def.params
}
MQ.scene.mount(el, def, { onChange }) -> { model, destroy() }   // view.js
MQ.svg2d.draw(svg, drawDef, state, colorOf)                       // svg2d.js
MQ.three3d.show(el, drawDef, state, colorOf) / .hide(el)           // three3d.js, one shared renderer
```

- [ ] **Step 1: Failing tests** in `tests/math/scene.test.mjs` (harness files `['scene/palette.js', 'scene/model.js']`): `set('a', 99)` clamps to `max`; `set('a', 2.4)` with `step: 1` gives 2; `derived` updates after `set`; `live()` of the box-volume def at a=2,b=3,c=4 is `V = 2·3·4 = 24`; `describe()` contains every label and the derived value; `colorOf('b')` is `MQ.palette[1]`; a def without `t` has `state().t === 0`. Also `MQ.svg2d.sample(f, x0, x1, n)` (pure, in `svg2d.js`, loaded by the harness too) splits `1/x` on `[-1, 1]` into two segments and drops non-finite points. Run: FAIL.
- [ ] **Step 2:** Implement `palette.js`, `model.js` and the pure `sample` in `svg2d.js`. Tests PASS.
- [ ] **Step 3: `view.js`.** For each param, a `<label>` with a `type=range` input and a `type=number` input sharing the value; a formula `<div>` rendered by `katex.render(def.formula, el, { macros: { '\\term': '\\htmlData{term=#1}{#2}' }, trust: c => c.command === '\\htmlData', strict: 'ignore' })`; an `aria-live="polite"` line with `describe()`; the drawing area. Hover or focus on a slider, a formula term (`[data-term]`) or a shape (`data-term` on SVG nodes; mesh userData for 3D) toggles `.hl` on all three. Color on terms is set with `style.color = colorOf(term)`; `.hl` also bolds the label and underlines the term. If `def.t` exists: play, pause and a scrub range; `requestAnimationFrame` drives `t`; `matchMedia('(prefers-reduced-motion: reduce)')` starts paused; an `IntersectionObserver` pauses off-screen.
- [ ] **Step 4: `svg2d.js` drawing:** `axes`, `fn` (uses `sample`), `point` (draggable with pointer events and arrow keys, `tabindex=0`), `vector`, `polygon`. Every element carries `data-term` when its def names one.
- [ ] **Step 5: `three3d.js`:** one module-level `THREE.WebGLRenderer` created on first `show`, moved into whichever scene element is shown; `OrbitControls`; shapes `box`, `sphere`, `cylinder`, `cone`, `surface` (z = f(x, y) as a grid mesh), `vector`; `MeshLambertMaterial` with an ambient and a directional light. Box edges are colored per term (`a`, `b`, `c` as the three edge directions). If `WebGLRenderingContext` is missing or renderer creation throws, render `<p class="nogl">3D needs WebGL, which this browser has turned off. The sliders and formula still work.</p>`.
- [ ] **Step 6: Browser test** `tests/math/scene.browser.mjs` (same server pattern as `tests/smoke.mjs`): open `tests/math/pages/scenes.html`; set slider `a` to 4 and expect the live line to change; hover the formula term `a` and expect `.hl` on the slider label; at 390px and 1440px, screenshot the 2D and 3D scenes into the test's temp dir and expect `scrollWidth <= innerWidth`; in a context with `reducedMotion: 'reduce'`, the animated test scene's play button shows "Play" (paused).
- [ ] **Step 7: WebGL in CI.** Push and read the CI log of the browser test. If the 3D canvas is blank or WebGL is unavailable (check `renderer.getContext()` and one `readPixels` sample in the test), switch the 3D screenshot assertion to a state-only assertion, note it in the spec's Testing section, and say so in the PR. Either way, record the evidence (log lines) in the PR.
- [ ] **Step 8: Palette.** Pick 6 colors; check each against both theme backgrounds at 3:1 minimum (non-text UI contrast) with a script in the PR, and check distinguishability with a deuteranopia/protanopia simulation (Chromium DevTools "Emulate vision deficiencies" via `Emulation.setEmulatedVisionDeficiency` in the browser test, screenshot attached).
- [ ] **Step 9:** `npm run check && npm test` exit 0. Commit `feat(math): scene layer`.

### Task T4: Working area, input modes, step checker (PR 6)

**Files:**
- Create: `math-quest/input/mathjs-setup.js`, `math-quest/input/check.js`, `math-quest/input/work.js`, `math-quest/input/work.css`, `math-quest/rng.js`, `tests/math/check.test.mjs`, `tests/math/input.browser.mjs`
- Modify: `shared/progress.js:44` (`pristine`), `tests/smoke.mjs` (a notes-only save is exported), `package.json:14`, `tests/math/pages/scenes.html` (add a working-area test mission)

Interfaces (all DOM-free except `work.js`):

```js
MQ.rng(seed) -> () => number in [0, 1)            // mulberry32
MQ.math.full                                       // unrestricted math.js instance
MQ.math.safe                                       // number:'Fraction' instance, import/createUnit/reviver/evaluate/parse/simplify/derivative/resolve overridden to throw
MQ.check.number(input, expected, { exact = false, tol = 1e-9 }) -> { ok, why? }
MQ.check.expr(input, expected, { vars = ['x'], seed = 1, form }) -> { ok, why? }
MQ.check.steps(original, steps, { kind: 'number' | 'expr' | 'equation', vars, seed }) -> [{ ok, why? }]
MQ.check.forms = { noDivision, product, linearFactors }   // (node) -> bool, on MQ.math.full.parse trees
MQ.check.translate(ascii) -> string                       // MathLive ascii-math -> math.js
```

- [ ] **Step 1: Failing tests** in `tests/math/check.test.mjs` (harness files `['../math-quest/vendor/mathjs/math.js' loaded first, 'rng.js', 'input/mathjs-setup.js', 'input/check.js']`; the harness accepts paths outside `math-quest/` for the vendor file only):
  - `MQ.rng(1)` gives the same first five values twice;
  - `number('3/4', 0.75)` ok; `number('0.75', '3/4', { exact: true })` not ok with a `why` asking for a fraction; `number('1/3*3', 1, { exact: true })` ok;
  - `expr('(x-1)(x+1)', 'x^2-1')` ok; `expr('x^2+1', 'x^2-1')` not ok; `expr('(x^2-1)/(x-1)', 'x+1')` ok (x = 1 skipped); `expr('(x^2-1)/(x-1)', 'x+1', { form: 'noDivision' })` not ok (the lazy answer); `expr('1/0', '1')` not ok without throwing;
  - `steps('1*2-3*2+10/(2-1)', ['1*2-3*2+10/1', '2-6+10', '6'], { kind: 'number' })` is all ok; with `['2-6+1', '6']` it is `[not ok, ok]` (checked against the original, not the previous step);
  - equations: `steps('2x+4=10', ['2x=6', 'x=3'], { kind: 'equation' })` all ok; `steps('x^2=x', ['x=1'], { kind: 'equation' })` not ok with `why` mentioning a lost solution; `steps('x=2', ['x^2=4'], { kind: 'equation' })` not ok with `why` mentioning a gained solution;
  - `MQ.math.safe.evaluate('import({})')` and `MQ.math.safe.evaluate('parse("1")')` throw; `MQ.math.full.derivative('x^2', 'x').toString()` is `2 * x`;
  - `translate('|x-3|')` is `abs(x-3)`; `translate('log _2(x)')` is `log(x, 2)`; `translate('2 x^2+3 x-5')` is unchanged in value.
  Run: FAIL.
- [ ] **Step 2: `rng.js` and `mathjs-setup.js`.** `mathjs-setup.js` builds `MQ.math.full = math.create(math.all)` and `MQ.math.safe = math.create(math.all, { number: 'Fraction' })`, keeps a private reference to `safe.evaluate`, then overrides the listed functions on `safe` with `safe.import({...}, { override: true })` as on the math.js security page. `MQ.math.safe.evaluate` is the saved reference.
- [ ] **Step 3: `check.js`.**
  - `number`: evaluate with `safe`; exact mode requires the input to parse as integers and `/` only, and compares Fractions with `safe.equal`.
  - `expr`: for `k` in 0..19, `x = (rng() * 20 - 10)` per variable; evaluate both with `full` (numbers); skip if either is not finite; ok when at least 12 points remain and all agree within `1e-9 * max(1, |value|)`. Then apply `form` if given.
  - `steps`: for `number` and `expr`, each step against `original` with the matching check. For `equation`, let `d(e) = lhs - rhs`; at the seeded points compute `r = d(step) / d(original)`. Ok when `r` is finite and the same non-zero constant at every point where both are finite and `d(original) != 0`. Otherwise compare solution sets on a grid of 2001 points in [-10, 10] (a sign change or a zero of `d`): a root of the original missing from the step gives `why: 'this step loses a solution'`; an extra root gives `why: 'this step adds a solution'`. `x^2 = x` → `x = 1` loses `x = 0`; `x = 2` → `x^2 = 4` adds `x = -2`.
  - `translate`: `/\|([^|]+)\|/g` → `abs($1)`, `/log _(\w+)\(([^)]*)\)/g` → `log($2, $1)`, then strip MathLive's extra spaces around `*`.
  Tests PASS.
- [ ] **Step 4: `work.js` (DOM).** `MQ.work.mount(el, mission, { saved, onPass })`: the fixed question on top, one field per step (`=` prefix), Enter adds a field, Backspace in an empty field removes it and focuses the one above. Mode from `math-prefs-v1` (`{ input: 'visual' | 'text' }`, default `visual`). `visual`: inject `<script src="../vendor/mathlive/mathlive.min.js">` once (relative to the track page), then `<math-field>` per step with `MathfieldElement.fontsDirectory = '../vendor/katex/fonts/'` and sounds off (`MathfieldElement.soundsDirectory = null`); read `getValue('ascii-math')` and pass it through `translate`. `text`: `<input>` per step, a KaTeX preview under it (`MQ.math.full.parse(v).toTex()`), and a keypad (`a/b`, `√`, `^`, `π`, `(`, `)`) that inserts at the caret. A switch on the working area writes `math-prefs-v1`. Switching converts each step (text → `parse().toTex()` → `setValue`; visual → `ascii-math` → `translate`). Each step shows ✓ or ✗ with `why`. Pass is the final step's check (`work: 'required'` also needs every step ok and at least one step). On pass, `onPass(steps)` stores them in `S.work['<chapter>.<mission>']`. On phones (`max-width: 600px`), when the MathLive keyboard shows, the scene gets `position: sticky; top: 0` and a max height of 40vh.
- [ ] **Step 5: Notes.** A notes `<textarea>` per chapter, saved to `S.notes[chapterIndex]` on `input` (debounced 300 ms with `setTimeout`, in `work.js`).
- [ ] **Step 6: `pristine`.** At `shared/progress.js:44`, add `&& (!d.notes || Object.values(d.notes).every(v => !v))`. Add a smoke test: on `math-quest/algebra/` (after T5) or on `python-quest/` now, a state `{ xp: 0, done: {}, notes: { 0: 'hello' } }` makes the Progress panel's export produce a file containing `hello`. Run all smoke tests: other quests are unaffected (they have no `notes`).
- [ ] **Step 7: Browser test** `tests/math/input.browser.mjs` on `tests/math/pages/scenes.html`: in `text` mode, type the four-step chain and expect four ✓; change step 2 to `2-6+1` and expect ✗ only there; switch to `visual` and expect four `math-field` elements with the same values; switch back and expect the original text values (up to spaces). **Round trip:** for each notation in `tests/math/notations.json` (start with the 10 from the spec's input test: `10/(2-1)`, `2x^2+3x-5`, `sqrt(x+1)/(x-2)`, `sin(x)^2+cos(x)^2`, `(x-1)(x+1)`, `abs(x-3)`, `3/4+1/6`, `e^(2x)`, `log(x, 2)`, `pi*r^2`), text → MathLive → `translate` evaluates the same at 3 points. At 390px, the keypad buttons are at least 40px wide and `scrollWidth <= innerWidth`.
- [ ] **Step 8:** `npm run check && npm test` exit 0. Commit `feat(math): working area, input modes and step checker`.

### Task T5: Arithmetic and Algebra chapter 1 (PR 7)

**Files:**
- Create: `math-quest/arithmetic/{index.html,style.css,app.js,content.js}`, `math-quest/algebra/{index.html,style.css,app.js,content.js}`, `math-quest/track.js` (the shared track app: rail, mission card, tabs, quick-fire, guide, hint, deep link), `tests/math/content.test.mjs`
- Modify: `tests/smoke.mjs` (page list), `tests/math/notations.json` (every notation the two chapters use), `README.md`

Each track `index.html` sets `window.PROGRESS = { key: 'math-<track>-v1', name: '<Track> · Math Quest' }`, loads `../../shared/{progress,nav,how,tiers,theme}.*`, `../vendor/katex/*`, `../vendor/mathjs/math.js`, `../rng.js`, `../graph.js`, `../scene/*`, `../input/*`, `content.js`, `../track.js`, `app.js`. `algebra/index.html` also loads `../vendor/three/three.min.js`; `arithmetic/index.html` does not. Page structure matches the existing quest contract checked by `tests/smoke.mjs:103-150` (`#mission`, `.tabs button[data-tab]`, `section[id^="tab-"]`, `#chapters`, `.mapCol .panel`, sticky `.missionCol`); copy the layout from `python-quest/`.

- [ ] **Step 1: Failing tests** in `tests/math/content.test.mjs`: for each track, the `content.js` chapter ids equal `MQ.graph.chapters[track]` ids in order; every mission has `answer`, `wrong`, `lazy`, `how` (3 to 5 steps); `check(answer)` passes, `check(wrong)` and `check(lazy)` fail; every chapter has at least one scene; every `scene` mission's answer is a params object that passes; quick-fire templates with seed 1 produce the same 5 questions twice and each has a correct answer per `MQ.check`. Run: FAIL.
- [ ] **Step 2: `track.js`.** Rail via `Tiers.renderRail` (one tier per track for now), mission card with `HowSteps.html(m.how)`, the scene mounted above the working area, tabs Missions / Quick-fire / Guide, XP and badges like the other quests (`missionXp` 10, badge 25). At the top of each chapter, `MQ.graph.hint(id, done)` renders "Suggested first: …, not done yet" with the `why` and a link, or "Ready". It reads `location.hash`: `#ch=<id>` opens that chapter; `#guide` and `#fire` open those tabs as in other quests.
- [ ] **Step 3: Arithmetic chapter 1, "Order of operations"** (`arithmetic.order`), 5 missions: brackets first; multiplication and division left to right; addition and subtraction left to right; the full chain `1*2-3*2+10/(2-1)` with `work: 'required'`; a scene mission. 2D scene: a row of operation chips that collapse in evaluation order as `t` scrubs, the live line showing the current step, each operator colored by its term. Quick-fire template: three random small integers with two operators. Two guide entries: the order, and why `10/(2-1)` is not `10/2-1`.
- [ ] **Step 4: Algebra chapter 1, "Expressions and volume"** (`algebra.expressions`, requires `arithmetic.order`), 5 missions: evaluate `a·b·c` for given values; write the volume expression of a box; double one edge and compare volumes; the scene mission "make V = 64 with a = 4" (answer `{ a: 4, b: 4, c: 4 }`, lazy `{ a: 4, b: 2, c: 2 }`); simplify `2a + 3a` with `form: 'product'` failing the lazy `2a+3a`. 3D scene: the box-volume def from the spec. Quick-fire template: evaluate `p·q + r` at random values. Two guide entries: what a variable is, and the volume formula with the 3D scene embedded.
- [ ] **Step 5: Smoke.** Turn the `for (const name of NAMES)` loop at `tests/smoke.mjs:103` into a loop over `PAGES = [...NAMES.map(n => `${n}-quest/`), 'math-quest/arithmetic/', 'math-quest/algebra/']`, keeping every assertion. Add: the algebra chapter shows "Suggested first: Order of operations" with no arithmetic progress and "Ready" after setting `math-arithmetic-v1` badges `{0: true}`; the link opens `math-quest/arithmetic/#ch=arithmetic.order` on that chapter. Extend `notations.json` and rerun the round-trip test.
- [ ] **Step 6: Gates.** `review-mission` over the diff, `playtest` at 390, 1000 and 1440 wide (screenshots in the PR), `pre-pr-check`, `npm run check && npm test`. Commit `feat(math): arithmetic and algebra chapter 1`.

### Final PR (PR 8)

- [ ] **Step 1:** Merge `main` into `feat/103-math-quest` and resolve the shared-file conflicts from Review Focus 6. `npm run check && npm test` exit 0.
- [ ] **Step 2:** Body lists `Closes #103` only if every Done-when box in #103 is ticked; otherwise "Part of #103".
- [ ] **Step 3:** Ask the owner before enabling merge commits on the repo. The owner merges.

---

## Self-review

- **Spec coverage:** layout (T1 to T5), saved state and `pristine` (T4 Step 6), graph and deep links (T2, T5 Step 2), hub and landing (T2), scene layer, color links, animation, shared renderer, no-WebGL notice (T3), missions and checks incl. `form` (T4, T5), working area, both modes, switch, translator, phone layout, math.js safety, notes (T4), dependencies and vendoring (T1), testing (every task, WebGL in T3 Step 7), delivery (PR split), touchpoints (T0, T1, T2, T4, T5).
- **Not in this plan:** proof mission kinds (`order`, `gap`, `justify`, `flaw`) are specified but first used by the Proofs track; their checker lands with it. Later tracks and chapters have their own plans.
- **Naming consistency:** `MQ.graph`, `MQ.scene.model`, `MQ.scene.mount`, `MQ.svg2d`, `MQ.three3d`, `MQ.palette`, `MQ.rng`, `MQ.math.full`, `MQ.math.safe`, `MQ.check.*`, `MQ.work.mount` are used the same way in every task.
- **To verify during work:** exact line numbers cited (`package.json:13-14`, `ci.yml:31`, `AGENTS.md:17`, `pre-pr-check` line 11, `index.html:127`, `shared/progress.js:44`, `tests/smoke.mjs:103`) against the tree at the start of each task.
