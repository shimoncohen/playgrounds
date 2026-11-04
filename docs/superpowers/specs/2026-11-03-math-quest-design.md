# Math Quest (`math-quest/`) design

Date: 2026-11-03. Status: approved design, nothing built yet. Issue: #103.

## Goal

A math playground that grows from arithmetic to university-level math, and later to theorems and proofs. Math is too wide for one quest, so Math Quest is a **hub of tracks** (Arithmetic, Algebra, Geometry, ...). Each track is a full quest. A **prerequisite graph** ties the tracks together at chapter level: a chapter says what to learn first, but nothing is ever locked.

Math is taught visually where it helps. Every chapter has at least one interactive **scene**: sliders and draggable points that drive a 2D or 3D drawing, next to a live formula whose terms share colors with the shapes they describe. Learners can write their **working** step by step, and every step is checked.

## Decisions

- **Hub plus tracks.** `math-quest/` is the hub; each track is its own quest under it with its own save key, ranks, quick-fire and field guide.
- **Range.** v1 targets school through first-year university (arithmetic, algebra, geometry, trigonometry, calculus, linear algebra, probability, discrete math, proofs). The long-term goal goes further (abstract algebra, analysis, theorems). The design must not cap depth.
- **Prerequisites per chapter, never enforced.** Edges live in one file, `math-quest/graph.js`. Status is derived from saved progress and never stored.
- **Four vendored libraries, approved as an exception** to the "no new dependency" rule, for Math Quest only: KaTeX (formulas), math.js (parsing, exact arithmetic, derivatives), MathLive (visual math input), three.js (3D). See "Dependencies".
- **Track pages are not bundled.** `tools/build.py` bundles top-level `*-quest/` folders only, so it bundles the hub and skips the tracks. The full experience lives on GitHub Pages.
- **Every chapter has a scene; scene missions are the main mission kind.**
- **Color-linked terms in every scene from the start.**
- **Two input modes with a switch, MathLive by default.** Plain text with a KaTeX preview is the other mode.
- **Learner text is saved locally.** Notes and working are stored in the track's own `localStorage` state, so they travel with export and import. This differs from Agent Quest, which persists no learner text; here the text is the learner's own math and has no reason to be hidden from them. It never leaves the browser except through the learner's own export or backup file.

## Scope

In scope for this spec: the hub, the graph, the scene layer, the input and checking layer, the vendoring script, repo wiring, and the first slice of content (Arithmetic chapter 1 and Algebra chapter 1).

Out of scope here, each with its own spec and plan later: the remaining chapters and tracks, proof-heavy and university-level tracks, and any bundled (single-file) version of track pages. The proof mission kinds (`order`, `gap`, `justify`, `flaw`) are specified below so the model has room for them, but their checker ships with the first track that uses them.

The first PR (this spec and the plan) changes docs only.

## Layout

```
math-quest/
  index.html  style.css  app.js     hub: track cards, prerequisite map, "Next up"
  graph.js                          DOM-free: tracks, chapter nodes, requires edges
  scene/
    model.js                        DOM-free: params, derived values, live line, description
    view.js                         sliders, formula, drawing area, live region, term links
    svg2d.js                        axes, function graphs, draggable points, vectors, polygons
    three3d.js                      shared renderer, shapes, orbit, per-term colors
  input/
    check.js                        DOM-free: step checker, form rules, translator
    work.js                         working area, both input modes, switch, keypad
  vendor/
    katex/ (katex.min.js, katex.min.css, fonts/)
    mathjs/math.js
    mathlive/mathlive.min.js
    three/three.min.js              plain-script build made by tools/vendor-math.sh
  arithmetic/  index.html  content.js  app.js
  algebra/     index.html  content.js  app.js
tools/vendor-math.sh
tests/math/
```

Track pages load `../../shared/*` and `../vendor/*` with relative paths and plain `<script src>` tags, like every other quest.

## Saved state

- **One key per track:** `math-arithmetic-v1`, `math-algebra-v1`, and so on. The hub has no game state of its own.
- **Missions are keyed `'<chapter>.<mission>'`** like every quest (`shared/progress.js` keeps the whole state object as one JSON string). The AGENTS.md rules apply unchanged: never rename a key, never renumber shipped missions, append to the end of a chapter, append chapters to the end of a track.
- **New fields, all additive:** `notes` (per chapter, free text) and `work` (per passed mission, the steps the learner wrote). Old saves load without them. `shared/progress.js` exports the whole state, so both travel with export, import and the backup file. Its `pristine()` check must also count non-empty `notes` as progress, or a notes-only save is treated as empty.
- **Input preference:** `math-prefs-v1` holds `{ input: 'visual' | 'text' }`, shared by every track. Absent means `visual`.

## Prerequisite graph

`math-quest/graph.js` is the only place prerequisites are written:

```js
tracks:   [{ id: 'algebra', name: 'Algebra', key: 'math-algebra-v1' }, ...]
chapters: { algebra: [{ id: 'algebra.expressions', title: 'Expressions',
                        requires: ['arithmetic.order'], why: 'you evaluate with the order of operations' }, ...] }
```

- **Chapter ids are stable names** (`algebra.functions`), never positions, so edges survive reordering in the graph file.
- **Sync contract:** each track's chapter list in `graph.js` must match that track's `content.js` chapters, same ids, same order, because saved badges are keyed by chapter position (`S.badges[i]`). A test enforces it.
- **Done** means the chapter's badge is set in that track's saved state. A missing or unreadable track state counts as "not done" and never throws.
- **Hints show direct prerequisites only.** At the top of a chapter: "Suggested first: Order of operations (Arithmetic), not done yet", the `why` line, and a link to `../arithmetic/#ch=arithmetic.order`. All done shows "Ready". Nothing is locked.
- **Deep links:** track apps read `#ch=<chapter id>` and open that chapter. Existing quests use the hash only for tabs; `#guide` and `#fire` keep working alongside it.

## Hub

- **Overview:** one node per track with a progress ring (chapters with badges / chapters). An arrow goes from track A to track B when any chapter of B requires a chapter of A.
- **Track view:** clicking a track shows its chapters laid out in layers by prerequisite depth (longest path from a chapter with no prerequisites). The layout is our own; it is a few dozen lines and deterministic. Prerequisites from other tracks appear as faded nodes that link out.
- **Next up:** up to 3 chapters that are not done and whose prerequisites are all done, in graph order.
- **390px:** the map becomes a vertical list grouped by layer. The map is keyboard-usable and exposed to screen readers as that same list.
- **Landing page:** one Math Quest card in the root `index.html`. Its XP badge is the sum over all tracks: the card carries `data-keys="math-arithmetic-v1 math-algebra-v1 ..."` and the landing script (which reads one `data-key` today) learns to sum a list. Sync contract: the list must equal the track keys in `graph.js`; a test enforces it.

## Scene layer

A scene is data in a track's `content.js`:

```js
{ id: 'box-volume',
  params: { a: { min: 1, max: 6, step: 1, value: 2, label: 'length' }, b: {...}, c: {...} },
  derived: p => ({ V: p.a * p.b * p.c }),
  formula: 'V = \\term{a}{a}\\cdot\\term{b}{b}\\cdot\\term{c}{c}',
  live: 'V = {a}·{b}·{c} = {V}',
  draw: { kind: '3d', shape: 'box', size: p => [p.a, p.b, p.c] } }
```

- **`scene/model.js`** (DOM-free) clamps params to their range and step, computes `derived`, fills the `live` line, and builds a text description for the live region. It exposes the state `{ params, derived, t }` that checks read.
- **`scene/view.js`** mounts one native range input plus number box per param, the KaTeX formula, the drawing area, and an `aria-live` line with the description.
- **`scene/svg2d.js`** draws 2D in SVG. Function graphs are sampled and split at non-finite values, so `1/x` gets no fake vertical line.
- **`scene/three3d.js`** wraps three.js: box, sphere, cylinder, cone, surface `z = f(x, y)`, vectors, planes; drag-to-rotate with three.js's `OrbitControls` (included in the vendored build); flat lighting; per-term colors.
- **Color-linked terms.** `\term{a}{...}` is a KaTeX macro that expands to `\htmlData{term=a}{...}`. The formula term, its slider and its shape share one color from a fixed palette. Hovering or focusing any of the three highlights all three. Color is never the only cue: the label weight and an underline change too. The palette must pass contrast in light and dark themes and stay distinguishable for the common color-vision deficiencies.
- **KaTeX trust** is enabled only for `\htmlData`, through KaTeX's `trust` callback, because formulas are our own content.
- **Animation.** An optional `t` param gets play, pause and a scrub slider, driven by `requestAnimationFrame`. Under `prefers-reduced-motion` scenes start paused and scrubbing still works. Scenes pause when off-screen (`IntersectionObserver`).
- **One WebGL renderer per page.** Browsers cap live WebGL contexts (often around 16), so one shared three.js renderer draws whichever 3D scene is in view.
- **No WebGL:** a 3D scene shows a short notice; its sliders, formula and live line still work, and scene missions stay solvable.

## Missions and checks

Missions keep the repo shape `{ title, goal, how, answer, explain, check, hint? }`, with these kinds:

| Kind | Learner | Check |
|---|---|---|
| `number` | types `3/4`, `0.75`, `-2` | value within tolerance; exact fraction when the goal asks for one |
| `expr` | types `2x^2 + 3x` | equivalence: both sides evaluated at 20 seeded points, points where either is non-finite skipped, at least 12 valid points required |
| `choice` | picks one or several | the set of choices |
| `scene` | moves sliders or points | `ctx.scene` (`{ params, derived, t }`) |
| `order` | arranges proof steps | each step lists the steps it depends on; any order respecting them passes |
| `gap` | fills a missing proof step | the chosen option |
| `justify` | picks a reason per step | per step |
| `flaw` | clicks the wrong step of a broken proof | the step id |

- **`form` rules on `expr`.** Equivalence alone lets a learner paste the question back for "simplify" or "factor". Such missions add a `form` rule checked on the math.js parse tree (for example "no division left", "a product of factors", "degree at most 1 in each factor"). Every `expr` check is tried against a wrong answer and against the lazy answer (the question itself).
- **math.js `simplify` is not used to prove equivalence.** It could not show that `(x-1)(x+1)` and `x^2-1` are equal; the seeded evaluation does.
- **Quick-fire** rounds are generated from templates with a seeded random source.
- **Field guide:** definitions and theorems, each with its statement, an embedded scene where one fits, and a short proof outline.
- **`how` steps** follow `docs/tiers-guideline.md` section 3: the whole idea in one sentence, then each part of the formula left to right, tied to its color.

## Working and input

Every `number` and `expr` mission has a **working area**.

- **One step per field.** The question sits fixed on top. Each step is its own field below it, starting with `=`. Enter adds the next field; Backspace in an empty field removes it. In equation missions the field holds the whole equation (`2x = 6`).
- **Each step is checked against the original line**, not the step before, so one wrong step does not mark every later step wrong:
  - numbers: equal to the original's exact value (math.js with `number: 'Fraction'`);
  - expressions: equivalent to the original (seeded evaluation);
  - equations: same solutions as the original. A step passes when its `lhs - rhs` is a non-zero constant multiple of the original's `lhs - rhs` at the seeded points. Doing the same thing to both sides passes; a step that loses or gains solutions (dividing by `x`, squaring) is flagged, with a note saying why.
- Each step shows ✓ or ✗. **The final answer alone decides the mission** unless the mission sets `work: 'required'`, in which case every step must pass and there must be at least one step before the final answer.
- **Two input modes, one checker.** Both modes produce plain text for math.js.
  - `visual` (default): one MathLive field per step, with MathLive's on-screen keyboard. The field's value is read as `ascii-math` and passed through the **translator**.
  - `text`: a plain-text field per step with a live KaTeX preview under it, and a symbol keypad (fraction, √, ^, π, brackets) for phones.
  - **The switch** sits on the working area and writes `math-prefs-v1`. Switching mid-mission keeps the steps: text → math.js parse → `toTex()` → MathLive; MathLive → `ascii-math` → translator → text.
- **Translator** (`input/check.js`): rewrites MathLive `ascii-math` notations math.js cannot read. Known cases: `|x-3|` → `abs(x-3)`, `log _2(x)` → `log(x, 2)`. The round-trip test is the authority on the list.
- **MathLive loads only in `visual` mode**, injected on first use, so `text` mode never downloads it.
- **On phones, the mission's scene stays visible above MathLive's keyboard** (the keyboard covers about half the screen at 390px).
- **math.js safety.** Learner input runs in the learner's own browser. Following math.js's security page, learner input is evaluated by a separate math.js instance in which `import`, `createUnit`, `reviver`, `evaluate`, `parse`, `simplify`, `derivative` and `resolve` are overridden to throw. Our own code (parsing for `form` rules, `toTex`, derivatives) uses a second, unrestricted instance, because the override applies to the whole instance.
- **Notes:** a free-text notes panel per chapter, saved in `notes`. When a mission passes, its steps are saved in `work` and shown again on revisit.

## Dependencies

Measured on 2026-11-03 from the npm packages:

| Library | Version | License | Minified | Gzipped | Format | `</script` / `</style` inside |
|---|---|---|---|---|---|---|
| KaTeX | 0.19.1 | MIT | 273 KB + 25 KB CSS + 260 KB woff2 fonts | not measured | plain script | none |
| math.js | 15.2.0 | Apache-2.0 | 650 KB | 175 KB | plain script (UMD) | none |
| MathLive | 0.111.4 | MIT | 848 KB (+ 233 KB optional sounds) | 230 KB | plain script (UMD) | `</style` twice |
| three.js | 0.187.0 | MIT | 774 KB as an IIFE build | 200 KB | ES modules only | none in the IIFE build |

- **`tools/vendor-math.sh`** downloads the four packages at pinned versions, copies the files into `math-quest/vendor/`, and builds `three.min.js` as a plain-script IIFE (global `THREE`, with `OrbitControls`) using a pinned esbuild run through `npx`. esbuild is a tool for this step only, not a site dependency. The vendored files are committed; the script is rerun only to upgrade.
- MathLive uses the same KaTeX font files; it points at `vendor/katex/fonts/` instead of shipping a second copy.
- MathLive's sounds are turned off and not vendored.
- three.js loads only on track pages that have 3D scenes. MathLive loads only in `visual` mode.
- MathLive's `</style` strings are why track pages cannot be bundled by `tools/build.py`; that is accepted (track pages are not bundled).

## Testing

- **Node tests (`tests/math/`):**
  - graph: no cycles, unique ids, every `requires` resolves, no self edge, track chapter lists match each `content.js` in order;
  - scene model: clamping, derived values, live line, description;
  - checker: numbers exact, expression equivalence, non-finite points skipped, equation steps (valid step, solution-losing step), each step against the original line, `form` rules, lazy and wrong answers fail;
  - translator: every known case;
  - solvability: every mission's reference `answer` passes its own `check`.
- **Playwright:**
  - hub and each track page in `tests/smoke.mjs` (loads cleanly, tabs, export and import keep `notes` and `work`);
  - a prerequisite hint and its deep link;
  - the input switch, and the working area in both modes;
  - the MathLive round trip: every notation used by course content goes text → MathLive → text and must evaluate the same at the seeded points;
  - one 2D and one 3D scene: drag a slider, see the live line change, screenshot at 390px and at desktop width.
- **WebGL in CI is the first risk to retire.** T3 checks whether CI's headless Chromium renders WebGL reliably. If it does not, the 3D Playwright check asserts scene state only and the spec records the change.
- Every PR runs `npm run check && npm test` and `python3 tools/build.py --check`.

## Delivery

0. **Epic issue** for Math Quest (the `new-playground` skill requires an agreed issue first).
1. **This spec and its plan**, as a docs-only PR to `main`.
2. **Ticket chain on `feat/103-math-quest`**, one PR each, merged into the feature branch:
   - **T0 Commit scope:** add `math` to `commitlint.config.mjs` and `CONTRIBUTING.md`.
   - **T1 Vendored libraries:** `tools/vendor-math.sh`, `math-quest/vendor/`, the dependency exception recorded in `AGENTS.md`, the `new-playground` skill and the README; the CI `node --check` glob covers `math-quest/**/*.js` except `vendor/`.
   - **T2 Graph and hub:** `graph.js` and its tests, the hub page (map, track view, Next up, 390px list), the landing card, `tests/smoke.mjs`.
   - **T3 Scene layer:** model, view, 2D, 3D, color-linked terms, animation, shared renderer, no-WebGL notice, WebGL-in-CI check.
   - **T4 Input and checking:** checker, `form` rules, translator, working area, both modes and the switch, keypad, notes and `work`.
   - **T5 First content:** Arithmetic chapter 1 (order of operations, including the chain `1*2-3*2+10/(2-1)=...=6`) with a 2D scene; Algebra chapter 1 with the box-volume 3D scene and a prerequisite on Arithmetic chapter 1.
3. **Final PR `feat/103-math-quest` → `main`** with a merge commit so each ticket appears in the changelog. The repo allows squash merges only; turning merge commits on needs the owner's OK first.

## Touchpoints

| Touchpoint | Change |
|---|---|
| `index.html` (landing) | Math Quest card with `data-keys`; the XP script sums a key list (T2) |
| `README.md` | table row, repo map entry, dependency note (T1, T2) |
| `AGENTS.md` | "Where things go" row; the Math Quest dependency exception (T1) |
| `.claude/skills/new-playground/SKILL.md` | note that Math Quest's vendored libraries are an approved exception, not a precedent (T1) |
| `.github/workflows/ci.yml`, `AGENTS.md` command loop, `pre-pr-check` skill | `node --check` glob for `math-quest/` and `tests/math/` (T1) |
| `package.json` | `test:engine` runs `tests/math/*.test.mjs` (T1) |
| `commitlint.config.mjs`, `CONTRIBUTING.md` | the `math` commit scope (T0) |
| `tests/smoke.mjs` | the per-quest page checks (mission card, tabs, scroll, sticky column) loop over a page list: the `NAMES` quests plus each math track page. The hub is not a quest page; it gets its own tests, and the landing-links test expects `math-quest/` (T2, T5) |
| `tools/build.py` | none: it already bundles only top-level `*-quest/` folders; the hub bundles |
| `tools/publish_site.sh` | none: it copies whole `*-quest/` folders, track pages included |
| `shared/progress.js` | `pristine()` treats a state with `xp === 0` and no `done` as empty, so a save holding only notes would be skipped by export and could be replaced on restore. It also counts non-empty `notes` as progress (T4; affects every quest, so a smoke test covers it) |

## Risks

- **WebGL in headless CI** may be unreliable. Mitigation: retire it in T3; fall back to state-only checks.
- **MathLive and math.js disagree on notation.** Mitigation: the translator plus a round-trip test over every notation in the content, rerun when a track adds notation.
- **Page weight:** a 3D track page in `visual` mode loads about 2.5 MB of minified libraries (about 600 KB gzipped, excluding KaTeX gzip and fonts). Cached after the first visit; three.js and MathLive load only where needed.
- **Upgrade breakage** (three.js changes its API often). Mitigation: pinned versions, upgraded only through `tools/vendor-math.sh` in its own PR.
- **MathLive accessibility and touch behavior** have not been tested on a real phone or a screen reader. The `text` mode is the fallback; T4 checks both.

## Alternatives (rejected)

- **One big quest with tiers** instead of a hub: one save key, but very large content files and no way to ship tracks separately.
- **Native MathML** instead of KaTeX: no dependency, but rendering differs between browsers.
- **A hand-written canvas 3D renderer** instead of three.js: no dependency, but surfaces, solids of revolution and later geometry outgrow it.
- **A hand-written expression parser** instead of math.js: smaller, but later tracks need exact fractions, derivatives and LaTeX output.
- **Plain text only** instead of the MathLive switch: lighter, but fractions and powers are harder for beginners to type.
- **Bundling track pages** with embedded fonts and libraries: several MB per page, and MathLive cannot be inlined.
