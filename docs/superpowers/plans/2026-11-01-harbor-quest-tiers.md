# Harbor Quest Shared Tier Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harbor Quest runs on `shared/tiers.js` and `shared/tiers.css`, following `docs/tiers-guideline.md` §9 steps 1 to 6, the §9 step 10 bundle test and the step 8 import test. Nothing a learner saves changes. The only visible change is that the rail gains a "Beginner" tier header. Mission, hint and guide text, XP, ranks and the save format are unchanged.

**Architecture:** `programming/harbor-quest/app.js` (1505 lines, one IIFE) is split into per-file IIFEs on a global `HQ` namespace (guideline §8, §9 step 3), as Shell, Net and DS Quest do. `engine/` and `content/` are DOM-free and are loaded in Node by a strict loader. The refactor is behaviour-preserving, guarded by a browser golden transcript and save fixture captured before any code moves.

**Tech Stack:** Vanilla JS (classic scripts), Playwright and `node:test` (`npm test`), `tools/build.py` for the artifact bundle.

**Issue:** https://github.com/shimoncohen/playgrounds/issues/42 (Harbor Quest only).

**Pin:** `72daf8717299b6de080e3974235a7d4aa6d7dfbc`. Every `path:line` below was read at the pin. The `#45` branch tip is `4f0b2a6`, so Batch 1 re-checks the cited files.

## PR sequence

All work for A and B is on the branch `feat/42-harbor-tiers`, cut from the `#45` branch tip (`test/41-content-loader-solvability`).

- **A:** this plan doc only, merged first. Opened from `feat/42-harbor-tiers`, targets the `#45` branch. Body: `Refs #42`, "plan only, no code".
- **B:** the code, opened from the same `feat/42-harbor-tiers` after A merges. Title `feat(harbor): adopt the shared tier model`. Body `Refs #42`.
- **C:** the CI glob, gated (see "PR C gate" in Task 10).

Only Task 1 runs before PR A merges. Tasks 3 onward start after PR A merges.

## Acceptance Criteria

**AC1.** Harbor loads `../../shared/tiers.css` and `../../shared/tiers.js`. A `window.Tiers.create` call lives in `programming/harbor-quest/content/tiers.js`. All 12 chapters carry `tier:'beginner'`.

**AC2.** `RANKS` (`:1240`), the hand-built rank walk in `renderXP` (`:1275`), and the literals `10` and `25` are gone.
- Mission XP, badge XP and rank come from `tiers.missionXp(S.ch)`, `tiers.chapterBadgeXp` and `tiers.rankFor(S.xp)`.
- The messages are built from those values and render byte-identical: "+10 XP" and "+25 XP".
- `tiers.ranks()` deep-equals `[[0,'Deckhand'],[120,'Dockworker'],[300,'Rigger'],[520,'Shipwright'],[800,'Harbor Pilot'],[1080,'Fleet Captain']]`.
- The quick-fire bonus (`stopFire`, `:1438`) and puzzle XP (`award`, `:1450`) stay local and untouched.

**AC3.** An old save loads with the same XP, rank, badges and progress.
- The `harbor-quest-v1` key, the `fresh()` shape, `{v:1,…}` and the `'ch.mi'` keys are untouched. No save field is added.
- The proof is a golden transcript and save fixture captured before any change. The golden ends with the guide's "Reset all progress" step.
- An import-fixture test in `tests/smoke.mjs` also proves it.
- Behaviour is proved by the golden, the fixtures, the solvability and teach tests, and a written exception list. It is not proved by byte-identical moves.

**AC4.** The rail uses `Tiers.renderRail`. The chapter button markup is unchanged. The "Docker" and "Kubernetes" labels are kept.

**AC5.** Harbor is split into `engine/`, `content/`, `ui.js` and `app.js` on the guideline's namespace.
- Each file is `(function (HQ) { 'use strict'; … })(window.HQ = window.HQ || {});`, with the body unindented as in `programming/shell-quest/ui.js`. Nothing sits outside the wrapper.
- The only globals are `HQ`, `Tiers`, `__hq` and the existing shared ones.
- Names cross files only through `HQ`. Names from earlier files are destructured at the top (`const {a,b}=HQ;`, as `programming/shell-quest/ui.js:2-4` does). Names from later files, and cross-file mutable state, are read at call time as `HQ.x`.
- `S` is a stable object, `HQ.S`, reset in place.
- Bodies are moved verbatim (rule 8). Every line that is not verbatim is on a written exception list (Task 5).
- `engine/` and `content/` are DOM-free, enforced by the Node loader, which gives them no `document`.
- `index.html` has one `<script src>` per file, in dependency order.

**AC6.** The built bundle (`dist/harbor-quest.html`) works as a single inlined page: no page errors, 12 `.chap` buttons, a `.tierhead`, and `docker ps` prints.

**AC7.** README, AGENTS.md (rule 6 and the syntax loop at `:17`) and the guideline describe the new structure. A follow-up issue is planned for Harbor's first new tier.

**AC8.** All Checks pass. The two golden fixtures are never regenerated or hand-edited after their capture commit.

The ticket's "Done when" bullet 1 is AC1+AC3. Bullets 2 and 3 are AC7.

## Scope

**In**
- §9 steps 1 to 6, step 10 (bundle smoke test) and the old-save import test (step 8).
- The `programming/harbor-quest/` split on `HQ`.
- The Node loader and the tests that depend on the old single-file layout.
- A golden for transcript, XP, rank, UI probes and reset.
- Docs and the `package.json` `test:browser` wiring.
- The plan doc (PR A).
- `AGENTS.md:17`: add the Harbor globs and `tests/fixtures/*.js`.
- Two skill edits (`.claude/skills/pre-pr-check/SKILL.md:11` and `.claude/skills/add-mission/SKILL.md:11`), made by the manager or user because agents cannot write `.claude/skills`.

**Out** (follow-up issues or later PRs)
- Any new tier or chapter, and a `check` context (§9 step 7).
- Solvability tests for new chapters.
- The guide tier filter and quick-fire tier picker (step 9).
- Hand play-through of new chapters (step 11).
- Script, Python, C++ and Data Structures Quest.
- Issues #22, #23 and #24.
- Any mission, hint or guide text change.
- Quick-fire tags stay chapter indexes (`q[2]`).
- `ci.yml` (PR C).
- Any `shared/` edit.

## Global Constraints

- The `harbor-quest-v1` key, the `fresh()` shape and the `'ch.mi'` keys stay. No save field is added. Mission XP stays 10, chapter badge +25, 12 chapters.
- `tools/build.py` and `tools/publish_site.sh`: no change. Keep the exact `<script src="…"></script>` form. No inlined file may contain `</script`.
- `.github/workflows/ci.yml` is not touched in PR B (PR C).
- Static site only. No new runtime dependencies.
- Commits: trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, no session links.

## Review Focus

1. **Save compatibility.** The golden save, the reset tail and the import test guard against data loss. The fixtures are never regenerated after the capture commit.
2. **Names that leave scope.** The only names that can leave scope are the old top-level bindings of the IIFE. A word-boundary scan of each new file for every such name is exhaustive. It over-reports on property keys, strings and shadowing locals, and each hit is reviewed.
3. **`S` reset in place.** No long-lived closure may cache `S.d`, `S.k` or another sub-object across a reset.
4. **Cross-file mutable state and back-references.** `HIT`, `insideLost`, `pendingEdit`, `HQ.k8sResolve` and `HQ.onTick` (see "HQ conventions").
5. **Double click handler and rail labels.** See "What can break", items 4 and 6.
6. **Quick-fire score-bonus path** is not run by the golden. `stopFire`, `award`, `qfOpen` and the timer bodies must be unchanged.

---

## File Structure

### `programming/harbor-quest/app.js` split

The split follows the `/* ---------- … */` markers. Lines 4 to 22 are the header helpers.

| Marker (line) | Home |
|---|---|
| top `:4-22` | `engine/util.js`. `KEY` (`:4`) goes to state. `$` (`:5`) goes to `ui.js`. `esc` stays in util. |
| Docker Hub `:24`, project files `:43`, tiny YAML `:155` | `engine/world.js` (`parseYaml` `:156`) |
| state `:183` | `engine/state.js` (`fresh` `:190`, `S` `:194`, `save` `:197`) |
| output helpers `:200`, Docker engine `:206`, network `:279`, inside a container or pod `:299`, docker `:343`, compose `:512` | `engine/docker.js` (`resolveFrom` `:282`, `boxExec` `:300`) |
| Kubernetes engine `:586` | `engine/k8s.js` (`tick` `:618`, `k8sResolve` `:817`, `viaFwd` `:821`) |
| laptop shell `:881` | `engine/shell.js` (`insideBox` `:937`, `execLine` `:939`) |
| pictures `:953` | `content/pictures.js` (`PICS` `:963`) |
| missions `:997` | `content/tier-beginner.js` (`CH` `:1008`, `CH.forEach(ch.pic=PICS[i])` `:1125`) |
| quick-fire `:1127` | `content/quickfire.js` (`QF` `:1128`, `qfOpen` `:1174`, `VALUED_D` `:1175`, `canon` `:1176`) |
| puzzles `:1183` | `content/puzzles.js` (`PZ_DF` `:1184`, `PZ_Y` `:1192`) |
| field guide data `:1242` | `content/guide.js` (`GUIDE` `:1243`). Delete `RANKS` (`:1240`). |
| UI `:1258` to the guide reset handler `:1488-1490` | `ui.js`: render functions, `onTick` (`:1345`), `checkMission` (`:1351`), `run` (`:1359`), editor, completion, tabs, quick-fire UI, puzzle UI and every handler |
| `/* boot */` `:1491` to `:1503` | `app.js`: `const {…}=HQ`, `boot`, `boot();`, `window.__hq` (`:1501`) |

The coder may merge or split engine files at function boundaries.

New file: `programming/harbor-quest/content/tiers.js` (the `Tiers.create` call, loaded after `tier-beginner`).

### Lines that change

- `renderXP` (`:1275`) and `renderChapters` (`:1278`).
- `S.xp+=10` (`:1353`) with the "+10 XP" text at `:1354`.
- `S.xp+=25` (`:1357`) with the "+25 XP" text.
- The `#chapters` click handler (`:1404`), deleted.
- The reset line `S=fresh()` (`:1490`).
- The `HQ` sites and call-time sites listed in Task 5.

### `window.__hq`

`window.__hq` (`:1501`) keeps its shape: `{run, get S(){…}, skip, tick, canon, CH, parseYaml}`. `tests/smoke.mjs:421` and the new golden use it. `get S()` returns `HQ.S`, which is always the same object.

### Facts verified at the pin

- `document` and `window` appear only at `:5` and from `:1267` on.
- `setInterval` occurs at `:1431` (quick-fire, 100 ms) and `:1499` (`tick`, 250 ms).

### Every top-level `let` in the IIFE, and who touches it

| Binding | Declared | Touched by | Rule |
|---|---|---|---|
| `skew` | `:7` | util; `__hq.skip` (`:1501`) | stays in `util.js`; `HQ.skewBy(ms)`; `HQ.skip` replaces the `__hq` copy |
| `S` | `:194` | all files | `HQ.S` stable object; `HQ.resetState` |
| `saveT` | `:196` | state only | local |
| `HIT` | `:280` | engine writes `:287`; ui reads `:1312`, `:1337`; ui writes `:1344` | **crosses** → `HQ.HIT` everywhere |
| `lastRec` | `:617` | k8s `:631/735/738/768/870`; `__hq.skip` | local to `k8s.js`; `HQ.skip` lives there |
| `insideLost` | `:633` | engine writes `:630`; ui reads and writes `:1345` | **crosses** → `HQ.insideLost` |
| `lastPick` | `:820` | k8s `:822/824` | local |
| `pendingEdit` | `:896` | engine writes `:906`; ui reads and writes `:1362` | **crosses** → `HQ.pendingEdit` |
| `histIdx`, `pop`, `known` | `:1260` | ui only (`:1359`, `:1397-1403`, `:1358`, `:1344`, `:1413`, `:1415`, `:1490`) | local to `ui.js` |
| `hintOpen` | `:1283` | ui only (`:1405-1407`) | local |
| `edFile` | `:1366` | ui only | local |
| `armT` | `:1414` | ui only | local |
| `QS`, `qT`, `LEN` | `:1421` | ui only (`:1428-1443`) | local |
| `PD`, `PY` | `:1445` | ui only (`:1447-1448`, `:1461-1468`) | local |

All the UI-only bindings and their handlers share one file, so no copy goes stale.

### Back-references from an earlier file into a later one

Found by grep, at the pin.
- `resolveFrom` (`:283`, in `docker.js`) → `k8sResolve` (`:817`, in `k8s.js`).
  - The call is `if(box.isPod)return k8sResolve(box,h,port)`.
  - `resolveFrom` is also called at `:293`, `:326` (ping) and `:330` (curl/wget).
- `tick` (`:632`, in `k8s.js`) → `onTick` (`:1345`, in `ui.js`).
- These names were grepped in `:1-585`: `podBox`, `endpoints`, `viaFwd`, `k8sResolve`, `kindOfImage`, `pullable`, `appOf`, `depPods`, `podStatus`, `spawn`, `reconcile`, `mkPod`, `evo`, `pickNode`, `resolveEnv`, `cmData`, `RT`, `K`, `live`, `ready`, `ev`, `term`. The only hit that is a call is `:283`. `K()` first appears at `:590`.
- `viaFwd` (`:821`) is used from the laptop shell (`:889`), which is a later file, so that is fine.
- `insideBox` is used by content (`:1005`) at call time only, from an earlier file, so that is fine.

### Other Harbor files

- `programming/harbor-quest/index.html`:
  - Stylesheets are at `:12-16`. Add `../../shared/tiers.css` after `:16`.
  - Scripts are at `:87-92`: the inline `window.PROGRESS` at `:87`, shared scripts at `:88-91`, and `app.js` at `:92`.
  - New order after `how.js`: `../../shared/tiers.js`, then `engine/*`, then `content/*` (`pictures`, `tier-beginner`, `quickfire`, `puzzles`, `guide`, `tiers`), then `ui.js`, then `app.js`.
- `programming/harbor-quest/style.css:59-68, 138-139, 210-211`: `.chapters`, `.chap`, `.rail-lbl`. The theme vars `tiers.css` needs already exist (`style.css:4-20`). Likely no CSS change.

### Shared (read-only)

- `ranks()` and `rankFor()` throw at call time if `tierEndRanks` is missing (`shared/tiers.js:47`), so pass `{}`.
- `renderRail` sets `container.onclick`.
- `tiers.js` writes `window.Tiers` (`:85`). Its wrapper is `(function (root) {…})(typeof window !== 'undefined' ? window : globalThis)` (`:3`, `:86`), so a stub `window` works.

### Tests

- `tests/content-loader.mjs`: add `loadHarborQuest()`. Existing exports `readApp`, `cut`, `loadContent` stay for Script, Python and C++.
- `tests/harbor/teach.test.mjs:10-13`: the marker slicing goes away. Update its stale header comment at `:3`. Assertions are unchanged.
- `tests/harbor/solvability.test.mjs`:
  - Replace the `prelude` (`:8`) and the `loadContent` marker `parts` with the loader.
  - The test sets `HQ.onTick=()=>{}` and uses `HQ.skip`.
  - `wait` (`:19`) and the assertions are unchanged.
- `tests/smoke.mjs:15, 161-194, 421`, plus the new Harbor bundle test modelled on `tests/smoke.mjs:339-370`.
- New files:
  - `tests/harbor-golden.mjs` (template: `tests/shell-golden.mjs`)
  - `tests/fixtures/harbor-golden.json`
  - `tests/fixtures/harbor-progress-complete.json`
  - `tests/harbor/tiers.test.mjs`

### Config and CI

- `package.json:14`: `test:browser` becomes `node tests/smoke.mjs && node tests/shell-golden.mjs && node tests/harbor-golden.mjs`. Done in the golden commit. The `test:engine` glob already covers `tests/harbor/*.test.mjs`.
- `.github/workflows/ci.yml` is **not touched in PR B** (PR C).
  - The loop is `ci.yml:32`, run by `node --check "$f" || exit 1` at `:33`. It already ends with `tests/fixtures/*.js`.
  - PR C adds `programming/harbor-quest/*.js programming/harbor-quest/engine/*.js programming/harbor-quest/content/*.js`.
  - PR C targets `main` and opens only when the gate in Task 10 holds.
- `AGENTS.md:17` gains the Harbor globs and `tests/fixtures/*.js`.
- `.claude/skills/pre-pr-check/SKILL.md:11` gets the same loop edit, made by the manager or user.

### Docs

- `README.md`: the table row `:15`, the tree `:107`, and the sentence at `:127` ("Script, Python, C++ and Harbor Quest keep their course inside `app.js`…"), which drops Harbor.
- `AGENTS.md`:
  - `:7`.
  - The "Where things go" table: add a "Change Harbor Quest" row and adjust the "Change another quest's course" row.
  - Rule 6 (`:29`) extends to `programming/harbor-quest/engine/` and `programming/harbor-quest/content/`.
- `docs/tiers-guideline.md` §9: a note that Harbor is done and how `HQ` holds `S`, `HIT`, `insideLost` and `pendingEdit`. Step 3 (`:312`) says "byte-identical"; the note says the golden is the proof.
- `.claude/skills/add-mission/SKILL.md:11`, edited by the manager or user.
- `docs/superpowers/plans/2026-11-01-harbor-quest-tiers.md` (this file, PR A).

---

## HQ conventions and what can break

1. **Names that go out of scope.**
   - The only names that can leave scope are the old top-level bindings of the IIFE. A word-boundary scan of each new file for every such name is therefore exhaustive. It over-reports on property keys, strings and shadowing locals, and the coder reviews each hit.
   - A destructured name that does not exist yet is `undefined`, not a ReferenceError. It fails later as "x is not a function". The strict loader (Task 5) catches this at load time for the Node-loaded files. In `ui.js` and `app.js` only the browser golden catches it.
2. **`S` is reassigned** by "Reset all progress" (`:1490`).
   - `state.js` keeps `let S=fresh();` and the load/merge line (`:194-195`) verbatim and local. It then sets `HQ.S=S` once.
   - It also exports `HQ.resetState`: `const f=fresh();Object.keys(S).forEach(k=>delete S[k]);Object.assign(S,f)`. The reset line in `ui.js` becomes `HQ.resetState();`.
   - The state and key order are the same as with `S=fresh()`, so `JSON.stringify(S)`, `save()` and the key are unchanged.
   - Other files read `const S=HQ.S;`, the Shell Quest idiom.
   - No long-lived closure may cache `S.d`, `S.k` or another sub-object across a reset. The reviewer greps for such caches. The golden's reset tail is the behavioural proof.
3. **Cross-file mutable state.**
   - `HIT`, `insideLost` and `pendingEdit` become `HQ.HIT`, `HQ.insideLost` and `HQ.pendingEdit` at every site in every file, including the owner. They are never destructured. The owner sets the initial value at load.
   - `skew` and `lastRec` stay local. `HQ.skip=ms=>{skew+=ms;tick();lastRec=0;tick()}` is defined in `k8s.js`, next to `lastRec` and `tick`. It reaches `skew` through `HQ.skewBy` from `util.js`. `app.js` uses `skip:HQ.skip`.
   - Every other `let` stays inside the file that holds all its readers and writers (the table above).
4. **Double click handler.** `renderRail` sets `container.onclick`, and `:1404` also adds a listener, so `goChapter` would fire twice. Pass `onPick:goChapter` and delete `:1404`.
5. **Load order.**
   - Files load in this order: `engine/*`, then `content/pictures`, `tier-beginner`, `quickfire`, `puzzles`, `guide`, `tiers`, then `ui.js`, then `app.js`.
   - `content/tiers.js` comes after `tier-beginner` because `create` reads the live `CH` array.
   - This deviates from §8, which puts `tiers.js` first, because Harbor's `CH` is one literal array.
   - Engine code reaches content only at call time, as `HQ.CH` and similar.
6. **Rail labels.** `renderRail` draws a `.tierhead` row and no group labels. Chapters 0 and 7 carry `group` ("Docker", "Kubernetes"). After `renderRail`, the UI inserts `<div class="rail-lbl">` before those two buttons. No `shared/` change. Look at the stacking at desktop and 390 px.
7. **Time, randomness and locale.**
   - The engine uses `Math.random`, `Date.now` and the 250 ms `tick` interval.
   - `stamp()` (`:19`) builds log timestamps from local time, and `startLogs` (`:236`) and `docker stop` (`:418`) write them into logs that missions print. `clf()` (`:20`) uses UTC.
   - See Task 2.
8. **Hoisting, load-time calls and back-references.**
   - In the old IIFE every `function` declaration was hoisted file-wide. After the split each file hoists only its own functions.
   - Anything that runs at load may use only (a) its own file's names or (b) names destructured from earlier files.
   - Load-time calls:
     - `let S=fresh()` (`:194`, same file, with `now` and `hhex` from util).
     - `CH.forEach` (`:1125`, same file as `CH`, with `PICS` from the earlier `pictures.js`).
     - `loadDf(0);loadY(0)` (`:1449`, same file).
     - The UI's top-level `$('#…')` calls.
     - `boot()`.
   - **Call-time back-references from an earlier file into a later one are exactly two, and both go through `HQ`:**
     - `HQ.k8sResolve(box,h,port)` at `:283`. `k8s.js` sets `HQ.k8sResolve=k8sResolve` at load.
     - `HQ.onTick()` at `:632`. `ui.js` sets `HQ.onTick=onTick` at load.
   - The Node loader runs only `engine/` and `content/`. It never runs `ui.js` or `app.js`, so `test:engine` cannot see breakage there.
   - **That is why `node tests/harbor-golden.mjs` runs after each split commit, in addition to `npm run test:engine`.** It is the only test that executes `ui.js` and `app.js`.
9. **`window.Tiers` in the Node loader.** The loader's stub `window` must be the object `tiers.js` writes `Tiers` onto, so `window.Tiers.create(...)` works in tests.
10. **Artifact host.** Per-file IIFEs on a global namespace are the pattern Shell, Net and DS Quest already ship, so no host-scoping check is needed for correctness. The manager may note in PR B whether the built bundle was seen to load in the host (README:139).

---

## Tasks

**Gates.** Only Task 1 runs before PR A merges. Tasks 3 onward start after PR A merges.

### Task 1: Plan doc (PR A)

- [ ] **Step 1:** On `feat/42-harbor-tiers`, write `docs/superpowers/plans/2026-11-01-harbor-quest-tiers.md` (this file).
- [ ] **Step 2:** One commit, `docs(harbor): plan for the shared tier model`. It changes only this file.
- [ ] **Check:** `git diff --stat HEAD~1..HEAD` shows the one plan file.

### Task 2: Open PR A and wait [manager]

- [ ] PR A targets the `#45` branch. Title `docs(harbor): plan for the shared tier model`. Body `Refs #42`, "plan only, no code".
- [ ] The user merges it.

### Task 3: Baseline

- [ ] `git fetch`. The work branch is `feat/42-harbor-tiers`, already cut from the `#45` tip (or from `main` if `#45` has merged). Call its head BASE.
- [ ] Confirm `git diff --stat 72daf87..BASE -- harbor-quest tests shared .github AGENTS.md docs/tiers-guideline.md package.json` shows nothing the plan cites, and re-read any cited line that moved.
- [ ] Run the Checks on the untouched BASE and record the result.

### Task 4: Golden before any code change (§9 steps 1 to 2)

One commit: `test(harbor): golden transcript and save before tiers`. It also carries the `package.json:14` change.

- [ ] **Header comment:** it must state every determinism choice.
- [ ] **Determinism**
  - Open the browser context with `timezoneId:'UTC'`, `locale:'en-US'` and a fixed 1280×800 viewport.
  - In `page.addInitScript`: freeze `Date.now`, seed `Math.random`, and make `setInterval` calls with delay 250 no-ops. Keep `setTimeout` and the 100 ms quick-fire interval real.
  - Time moves only through `__hq.skip`. **Mirror `wait`: 8 × `__hq.skip(250)` per attempt**, not one `skip(2000)` (`solvability.test.mjs:19`, `:31`).
  - Grep `app.js` for `toLocale`, `Intl`, `navigator`, `innerWidth`, `matchMedia`, `performance`, `crypto` and `new Date(`. Name every hit and what controls it. `matchMedia` is used at `:1418`.
- [ ] **Errors.** `page.on('pageerror', e => errors.push(e.message))`, and a final `assert.deepEqual(errors, [])`, as `tests/shell-golden.mjs:38-39` and `:88` do. Also check it after each chapter so a failure points at its chapter.
- [ ] **Mission loop.** For each chapter, click it. Then for each mission repeat up to 6 times: 8 × `__hq.skip(250)`, click `button[data-act="show"]`, press Enter, and stop when the mission is done.
  - Some missions' `ans` returns a different line per call (`exit` first, then the real line).
  - For an `edit shop.yaml` mission: in `#edText`, replace `replicas: 2` with `replicas: 4`, then click `#edSave`.
- [ ] **Record**, per step: chapter, mission, title, typed line, new terminal lines, `#xpText`, `#rank`, badge count.
- [ ] **Probe lines** (about 40, fixed, sent through `__hq.run` after the missions):
  - A valid and an error call for every `docker`, `docker compose` and `kubectl` subcommand family, and the laptop shell commands.
  - `help`, `clear` and an unknown command.
  - **Pod network probes:** from inside a pod, `curl` a service name, `curl` a pod IP, and `ping`, so `resolveFrom`'s `box.isPod` branch (`:283`) and `HIT` run. Record the `#view .hit` count after each.
  - **`insideLost`:** drive it through the UI if the world allows it. Otherwise inject `S.inside` and a `Terminating` pod through `__hq.S`, call `__hq.skip(250)` eight times, and record the sys line and the prompt. Say so in the header.
  - In a throwaway run, use `page.coverage.startJSCoverage()` on `app.js` to list functions never called, and extend the probes to cover them. List the ones that cannot be covered in the header.
- [ ] **Puzzles.** Solve at least one Dockerfile puzzle and one YAML puzzle through the UI, so `S.puz` and the 15 XP path are saved.
  - If a puzzle cannot be driven reliably, inject `puz`, `best` and the matching `xp` through `__hq.S`, then call `__hq.run('')` to persist, before the export. Say so in the header.
  - **Never hand-edit a fixture file.**
- [ ] **Export.** Use the UI export (delete `savedAt`) to `tests/fixtures/harbor-progress-complete.json`, and write `tests/fixtures/harbor-golden.json`. `shared/progress.js:56` exports only `{format, app, version, savedAt, data}` and `data` is the game's own saved object, so `savedAt` is the only time field to strip.
- [ ] **UI probes** (after the export, because they run handlers no other test reaches):
  - Click `[data-act="hint"]` twice and record the hint state.
  - Open Quick-fire and press `#fStart`. Then press `#fSkip`, enter one wrong answer in `#fIn`, and press `#fStop`. Record `#fScore`, `#fStreak`, `#fFb` and the round-over text. Score stays 0, so XP and `S.best` do not change.
  - Click `#resetWorld` twice and record the sys line and `#xpText` (XP and badges are kept).
- [ ] **Reset tail** (last): open the guide, click `#wipeAll` twice, and record `#xpText`, `#rank`, the parsed `localStorage['harbor-quest-v1']` and the first terminal line.
- [ ] **Determinism check.**
  - Run with `UPDATE_GOLDEN=1` twice, then once without. The outputs must be byte-identical.
  - Run once under `env TZ=Asia/Kolkata` and once under `env TZ=America/Los_Angeles`. They must be byte-identical too.
  - If not, stop and return to the manager. Do not weaken the test.
- [ ] From here on, never regenerate the fixtures.

### Task 5: Engine and content split, loader, moved tests

One commit: `refactor(harbor): split into per-file IIFEs on an HQ namespace`.

At this commit `app.js` still holds the UI and boot. They sit in their own wrapper with a destructured preamble, so the tree stays green. Task 6 moves them.

- [ ] **Tooling.** The coder writes a throwaway cross-reference script and a throwaway splitter, both untracked and deleted before the commit. They run as single `node` commands, so no bodies pass through the coder's context.
  - The cross-reference lists every top-level name with its defining section, and for each file the names used from earlier files, names used from later files, and the "Names that go out of scope" scan hits.
  - The splitter cuts at the section markers and adds the wrapper, `'use strict'`, preamble and exports.
- [ ] **Exception list**, written in the commit body as file, line and reason:
  - wrappers, preambles and `Object.assign(HQ,{…})` exports;
  - `KEY` and `$` moved;
  - `HQ.S`, `HQ.resetState` and the `:1490` reset line;
  - `HIT` (`:280`, `:287`, `:1312`, `:1337`, `:1344`), `insideLost` (`:630`, `:633`, `:1345`) and `pendingEdit` (`:896`, `:906`, `:1362`) as `HQ.x`;
  - `HQ.onTick()` at `:632`, and `HQ.k8sResolve(` at `:283`;
  - `HQ.skip` and `HQ.skewBy`;
  - the XP, rank and rail sites (Task 7).
- [ ] **Loader** `loadHarborQuest()` in `tests/content-loader.mjs`:
  - It reads the `<script src>` list from `programming/harbor-quest/index.html` and keeps `../../shared/tiers.js`, `engine/*` and `content/*`.
  - It evaluates each file with `new Function('window','localStorage',src)` against one shared stub `window`, and returns `window.HQ`.
  - It runs strict: `window.HQ` is a Proxy that throws on any read of an absent key while files load, and is turned off afterwards.
  - It passes no `document`, so DOM use in `engine/` or `content/` throws.
- [ ] **Tests.** Move `teach.test.mjs` and `solvability.test.mjs` to the loader. Keep the assertions, set `HQ.onTick=()=>{}`, and use `HQ.skip`.
- [ ] **Checks.** Run `npm run test:engine`, and run `node tests/harbor-golden.mjs` against the Task 4 fixtures. Both must pass unchanged.

### Task 6: Move the UI to `ui.js`

A small commit: `refactor(harbor): move the UI and boot to their own files`.

- [ ] Move `:1258-1490` verbatim into `ui.js`, setting `HQ.onTick=onTick` at load. `app.js` keeps only `boot`, `boot()` and `window.__hq`.
- [ ] Update `index.html`.
- [ ] Run `node tests/harbor-golden.mjs` and `npm run test:engine`.

### Task 7: Tiers (§9 steps 4 to 6) and tests

- [ ] `content/tiers.js`: `HQ.tiers=window.Tiers.create({tiers:[{id:'beginner',name:'Beginner',blurb:…,missionXp:10}], chapters:HQ.CH, baseRanks:<the six old pairs>, tierEndRanks:{}})`. Declare only `beginner`.
- [ ] Tag the 12 chapters `tier:'beginner'`. Add `group` on chapters 0 and 7.
- [ ] Replace the XP and rank code (AC2). Keep the bar formula `hi>lo?min(100,(xp-lo)/(hi-lo)*100):100`.
- [ ] Rail per "What can break" items 4 and 6. Add `tiers.css` and `tiers.js` to `index.html`.
- [ ] `tests/harbor/tiers.test.mjs`, through `loadHarborQuest()`:
  - `ranks()` deep-equals the old table.
  - `rankFor` at each threshold −1, 0 and +1, and at 0 and a huge XP.
  - All chapters are `beginner`.
  - `missionXp(i)===10` for all 12, and `chapterBadgeXp===25`.
  - `cumulativeXp('beginner')` equals the sum computed from `CH`.
  - `status` gives 0/12 for an empty save and 12/12 for a full one.
- [ ] `tests/smoke.mjs`, Harbor block:
  - Import `harbor-progress-complete.json`. Assert `#rank`, `#xpText`, 12 `.chap.earned` and the `.tierhead` text.
  - Assert 12 `.chap` and the two `.rail-lbl` texts.
  - Click a chapter once, assert `aria-current`, and assert no console errors.
- [ ] **Bundle test** (§9 step 10), modelled on `tests/smoke.mjs:339-370`: run `python3 tools/build.py harbor`. Load `dist/harbor-quest.html` in a skeleton page with Google Fonts requests answered empty. Assert no page errors, 12 `.chap`, a `.tierhead`, and that `docker ps` prints.
- [ ] The golden fixtures must still pass against the Task 4 capture.

### Task 8: Docs

- [ ] README, AGENTS.md (the table, rule 6, and the `:17` loop), and the guideline §9 note. No `ci.yml`, and no skills.

### Task 9: Adversarial review [quality-reviewer]

- [ ] `git diff --color-moved=dimmed-zebra BASE..HEAD`. Reconcile every changed line with the Task 5 exception list. An unlisted changed line is a finding.
- [ ] Check the wrappers: each file's first and last lines are the wrapper and nothing sits outside it.
- [ ] Grep for bare `HIT`, `insideLost` and `pendingEdit` outside `HQ.`.
- [ ] Grep for top-level `=S\.` caches that survive the in-place reset.
- [ ] Confirm `resolveFrom` calls `HQ.k8sResolve` and `tick` calls `HQ.onTick`, and that no other bare name in `docker.js` or `k8s.js` refers to a later file (the cross-reference output is attached to the review).
- [ ] Confirm `stopFire`, `award`, `qfOpen` and the quick-fire timer bodies are unchanged. The golden's UI probes cover Skip and End round but not the score-bonus path.
- [ ] `git diff --stat BASE..HEAD -- tests/fixtures` shows only the two new files and no later edits.
- [ ] No test weakened or skipped. The loader still throws on DOM use. The golden asserts no page errors.
- [ ] The comment gate: list every added comment line and check each is a why, workaround or invariant.
- [ ] `★ → ✔` is preserved in moved files. No throwaway script is committed.

### Task 10: UI QA, PR B, tickets, PR C [manager]

- [ ] Drive `playwright-cli` on `programming/harbor-quest/` at desktop and 390 px, light and dark. Check the rail with tier header and group labels, mobile scrolling, the XP bar, a chapter click, a reset, and an old-save import. Attach screenshots.
- [ ] Edit `.claude/skills/pre-pr-check/SKILL.md:11` and `.claude/skills/add-mission/SKILL.md:11`.
- [ ] Open PR B from `feat/42-harbor-tiers` against the base branch. Title `feat(harbor): adopt the shared tier model`. Body `Refs #42`.
- [ ] Fill `.github/pull_request_template.md` completely, with a QA checklist:
  - [ ] `npm run check`.
  - [ ] `npm test`.
  - [ ] Import `tests/fixtures/harbor-progress-complete.json`; expect the golden rank and XP and 12 stars.
  - [ ] Open `programming/harbor-quest/` at 390 px and desktop, light and dark; the rail shows "Beginner 12/12" (0/12 on a fresh save), the Docker and Kubernetes labels, and no console errors.
  - [ ] Complete one mission and one chapter; the messages read "+10 XP" and "+25 XP".
  - [ ] Use "Reset all progress" in the guide; XP is 0 and chapter 1 starts again.
  - [ ] Open `dist/harbor-quest.html` and run `docker ps`.
- [ ] Create the tickets after user approval (see "Tickets to create").
- [ ] **PR C gate.** Open PR C only when, after `git fetch`, `git ls-tree origin/main programming/harbor-quest/engine` and `git ls-tree origin/main programming/harbor-quest/content` both list files. That happens when B has reached `main`, either because `#45` merged after B, or because B was retargeted. "B merged" alone is not enough, since B targets the `#45` branch. Otherwise the new globs match nothing on `main`, and CI (no `nullglob`, `ci.yml:30-34`) passes the literal glob to `node --check` and fails.
- [ ] PR C: `ci: syntax-check the harbor engine and content files`, against `main`, flagged as a CI change. It adds `programming/harbor-quest/*.js programming/harbor-quest/engine/*.js programming/harbor-quest/content/*.js` to the loop at `ci.yml:32`.

Security-reviewer: not needed (see "Review needs").

---

## Test plan and Checks

- **Engine (Node).** The teach and solvability tests pass through the strict loader. New `tests/harbor/tiers.test.mjs`.
- **Browser golden.**
  - It replays every mission, about 40 probes, the UI probes, the export and the reset. It asserts no page errors.
  - It is the only test that runs `ui.js` and `app.js`, and it runs after each split commit.
- **Browser smoke.** Existing tests plus the Harbor import and rail test.
- **Bundle.** `npm run check` for inlinability, and the new smoke bundle test (AC6).
- **Manual.** The Task 10 checklist.

**Checks** (from the repo root, in order; each is one command):

1. `npm ci` (installs packages, reaches the network)
2. `npx playwright install chromium` (installs a browser, reaches the network)
3. `npm run check`
4. The CI syntax loop plus the Harbor globs, with nullglob (the script below)
5. `npm test` (about 3 minutes; the Script Quest tests may reach jsDelivr, so this reaches the network). After Task 4 it includes the golden, and after Task 7 the bundle test.

During the split commits (Tasks 5 and 6), also run `node tests/harbor-golden.mjs` alone.

For PR A, the only check is that `git diff --stat` shows the one plan file.

Check 4 script (the CI loop at `ci.yml:32` plus the Harbor globs):

```bash
#!/usr/bin/env bash
set -u
cd "$(git rev-parse --show-toplevel)"
shopt -s nullglob
for f in */app.js programming/ds-quest/*.js programming/harbor-quest/*.js programming/harbor-quest/engine/*.js programming/harbor-quest/content/*.js programming/shell-quest/*.js programming/shell-quest/engine/*.js programming/shell-quest/content/*.js shared/*.js tests/*.mjs tests/shell/*.mjs tests/ds/*.mjs programming/net-quest/*.js programming/net-quest/engine/*.js programming/net-quest/content/*.js tests/net/*.mjs tests/python/*.mjs tests/script/*.mjs tests/cpp/*.mjs tests/harbor/*.mjs tests/fixtures/*.js; do
  node --check "$f" || exit 1
done
echo "syntax ok"
```

## Review needs

- **Input, auth, secrets, deps, public API:** none. The save loader and the progress import format are untouched.
- **Schema or migration:** none. Save compatibility is the data-loss risk, and the golden save, the reset tail and the import test guard it.
- **UI: yes.** Browser QA at desktop and 390 px, light and dark.
- **Security-reviewer:** skip.
- **CI:** PR C is a CI-config change and is flagged as one.

## Risks and assumptions

1. Per-file IIFEs on `HQ`, with `S` held as a stable object reset in place. `programming/shell-quest/ui.js:2-4` uses the same idiom.
2. Behaviour is proved by tests, not by byte-identical moves. A rarely-run engine branch the probes miss could break silently. The coverage run in Task 4 reduces this and does not remove it.
3. The golden is not yet run. If it is not byte-identical under three timezones, the plan stops.
4. `ui.js` and `app.js` are never loaded in Node. Only the golden and smoke run them.
5. `tierEndRanks:{}` with all six old ranks in `baseRanks` keeps thresholds exact, because quick-fire and puzzle XP are outside `cumulativeXp`. Follow-up: when a second tier exists, "Fleet Captain" sits mid-ladder.
6. Merge order. Issues #22, #23 and #24 edit Harbor `app.js` content, and the split moves every line. Whoever lands second rebases.
7. The quick-fire score-bonus path is not run by the golden.
8. The rail's tier header plus group labels may look cluttered on the mobile rail. Judged by screenshot.
9. Unchecked: whether the manager can write `.claude/skills`; remote-only branches; exact mission counts (the golden records them). The `#45` tip is `4f0b2a6`, not the pin, so Task 3 re-checks the cited files.
10. PR #45 CI relies on jsDelivr for Script Quest browser tests, so `npm test` may be flaky for reasons outside this change.
11. The global CLAUDE.md says not to commit superpowers plans. The repo's AGENTS.md says plans merge before the code, and the user chose that.
12. Dollar-selector greps (`\$\(`) are refused in the planning environment, so engine and content DOM-freedom is confirmed only by the `document`/`window` grep (hits `:5` and from `:1267` on). The strict Node loader (no `document`) enforces it from Task 5.

## Tickets to create (after user approval)

1. **Harbor Quest: add the first new tier (Intermediate).** Covers §9 steps 7 to 9 and 11.
2. **docs(tiers-guideline): reconcile the guideline with Harbor's quick-fire shape.** Harbor's `QF` entries carry a chapter index, not the guideline's `tier?` tag (§7). §9 step 3's "byte-identical" should say behaviour is proved by the golden.

## Out-of-scope list (for the PR description)

New tiers or chapters; the guide filter and quick-fire picker; Script, Python, C++ and Data Structures Quest; #22, #23 and #24; content or text edits; any `shared/` edit; `.github/workflows` changes (PR C).
