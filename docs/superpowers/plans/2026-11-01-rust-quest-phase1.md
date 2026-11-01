# Rust Quest Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `rust-quest/`: an in-repo Rust checker and interpreter that runs the learner's real source, a memory view, and 13 chapters on one linear path, delivered as 16 strictly ordered PRs (P0 to P15). This plan details P0 to P5 (up to checkpoint 1); P6 to P15 are summary rows and are re-planned after checkpoint 1 and again after checkpoint 2.

**Architecture:** Plain browser scripts sharing one global namespace `RQ` (like `AQ`, `NQ` and `SQ`), loaded in order from `index.html`. `engine/` (no DOM) holds the lexer, parser, type checker, CFG lowering, borrow pass, interpreter, std signatures and diagnostics. `content/` holds the course as data. `ui.js`, `editor.js`, `memview.js` and `app.js` are the only DOM files. Node tests load the engine and content in a `vm` sandbox, as `tests/net/harness.mjs` does. A corpus of programs checked against a real `rustc` by an owner-run script, plus a hash stamp recomputed in CI, keeps the checker honest.

**Tech Stack:** Plain JS, Node `node:test` + `vm` + `node:crypto`, Playwright (existing smoke tests). A local `rustc` for the owner-run verify script only. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-01-rust-quest-design.md`. Go (#48) and a live "check with real rustc" mode are not in this plan.

## Global Constraints

- No build step, no framework, no new runtime dependency, no network. Pages work opened from disk and on GitHub Pages.
- Engine and content files (`rust-quest/engine/*.js`, `rust-quest/content/*.js`) never touch `window`, `document` or `localStorage`.
- The engine is deterministic: no `Math.random`, no `Date.now`. `HashMap` order is a fixed scramble plus the two-seed rule.
- Progress key is exactly `rust-quest-v1`. Saved learner code is the added field `codes` with a per-mission length cap; no key is renamed. Mission keys are `'<chapter>.<mission>'`; once shipped they are never renumbered, only appended.
- Local assets use relative `<script src>` / `<link href>`; an inlined file never contains `</script` or `</style` (`npm run check` bundles every `*-quest/`).
- Do not regenerate or edit anything under `tests/fixtures/` to make a test pass. `verified.json` is written only by `tests/rust/verify-rustc.mjs` on 0 mismatches.
- Do not weaken, skip or delete an existing test.
- Rust facts (error codes, lint names, panic format, exit codes, edition 2024 behaviour, `f64` formatting) are UNVERIFIED until the first verify run in P2. Do not state them as truth in learner text before then.
- Learner text: whole line explained first, then each part (`how` steps as HTML strings); commands, types, macros, fields and file names are `<code>`; friendly, concrete, never assumes untaught knowledge (AGENTS.md rules 9 to 12, skills `mission-voice` and `add-mission`).
- Every mission has `answer`, `wrong` and `lazy`: the answer passes its own check, the other two fail for their `wrongWhy`, and at least one alternative valid answer passes.
- Conventional Commits, scope `rust` (Task 0 merges before any other PR starts). Never bump the version or edit `CHANGELOG.md`. Keep the attribution trailer your tooling adds.
- Match surrounding code: compact style of `net-quest/*.js` and `cpp-quest/app.js`, comment density, naming.
- One concern per PR. The chain is strict: P0 to P15 in order. Do not open a PR before the one before it has merged, except P0 and P1, where P1 is stacked on P0 until P0 merges.
- Every engine PR extends the corpus for the cases it adds and merges only with 0 mismatches from the owner's verify run.

## Review Focus

1. **Fidelity**: every reject has a paired accept; the verify output line (version, counts, 0 mismatches) is in the PR body; `inputsHash` and `resultsHash` match. Tasks 2.5, 4, 5.
2. **Three non-verdicts**: `unsupported`, `internal` and a real verdict stay separate; no corpus, mission or fuzz program returns `internal`; `unsupported` never completes a mission. Tasks 2.4, 2.6.
3. **Honest checks**: for each mission there is a computed answer, a compiling-but-wrong case and a lazy case; borrow lessons carry the full `lazy` list and use events, not syntax. Every content PR.
4. **Saved state**: fresh state satisfies the `shared/progress.js:44` pristine predicate; one done mission gives `xp > 0`; a tampered `xp` is replaced; `codes` is capped; an export round trip keeps code. Task 2.2.
5. **Teach before use**: previews carry their in-place wording and "Chapter N"; the tag test catches `closure`, `generic-decl` and `trait-impl` before ch11 and ch12. Task 2.6.
6. **Page contract**: the tab, scroll, sticky and 390px checks in `tests/smoke.mjs:96-147` pass for the new quest at 1280, 1440 and 1000×700; the editor extra-keys row works at 390px. Task 2.7.
7. **Shared-file conflicts**: sibling quest PRs (#46, #48, #49, #51 to #58) may edit `tests/smoke.mjs`, `index.html`, `README.md`, `AGENTS.md`, `commitlint.config.mjs` or the `ci.yml` loop first. Rebase, recount the README number, and recheck line numbers before merge.

---

## PR split

| PR | Task | Ref | Title | Depends on |
|---|---|---|---|---|
| P0 | 0 | none (PR) | `ci: allow the rust commit scope` | none |
| P1 | 1 | none (PR) | `docs(rust): spec and plan` | P0 |
| P2 | 2 | #65 | `feat(rust): scaffold, lexer, parser, ch1, verify script` | P1 |
| P3 | 3 | #64 | `ci: wire rust-quest into checks` | P2 |
| P4 | 4 | #66 | `feat(rust): types, lints, formatting, ch2-3` | P3 |
| P5 | 5 | #67 | `feat(rust): move and borrow engine` (checkpoint 1) | P4 |
| P6 | 6 | #68 | `feat(rust): snapshots, memory view, ch4` | P5 |
| P7 | 7 | #69 | `feat(rust): slices, elision, ch5` | P6 |
| P8 | 8 | #70 | `feat(rust): type-system core` | P7 |
| P9 | 9 | #71 | `feat(rust): patterns, exhaustiveness, ch6-7` | P8 |
| P10 | 10 | #72 | `feat(rust): collections, for desugaring, ch8` | P9 |
| P11 | 11 | #73 | `feat(rust): Result and ?, ch9` | P10 |
| P12 | 12 | #74 | `feat(rust): lifetimes, ch10` (checkpoint 2) | P11 |
| P13 | 13 | #75 | `feat(rust): traits and generics, ch11 (blocked on checkpoint 2)` | P12 |
| P14 | 14 | #76 | `feat(rust): closures and iterators, ch12 (blocked on checkpoint 2)` | P13 |
| P15 | 15 | #77 | `feat(rust): capstone, quick-fire and guide polish (blocked on checkpoint 2)` | P14 |

Each PR body says "Part of #47" and never "Closes" (P15 is the last PR; the owner decides whether it closes #47). Each PR carries a QA checklist of real checkboxes, each naming its command or action.

### Task 0: Allow the `rust` commit scope (P0)

**Files:**
- Modify: `commitlint.config.mjs` (add `'rust'` to `scope-enum`), `CONTRIBUTING.md` (scope list gains `rust`)

- [ ] **Step 1: Verify the failure first.** On `origin/main`, run `printf '%s\n' "docs(rust): spec and plan" | npx --no -- commitlint`. Expected: exit 1 with a `scope-enum` error. This is the failing-before check.
- [ ] **Step 2: Add `'rust'`** after `'agent'` in the list in `commitlint.config.mjs`. In `CONTRIBUTING.md`, append `rust` to the scopes line, keeping the order of the rest.
- [ ] **Step 3: Verify.** The same command exits 0, and `printf '%s\n' "ci: allow the rust commit scope" | npx --no -- commitlint` exits 0. `npm run check` exits 0.
- [ ] **Step 4: Open its own PR** titled `ci: allow the rust commit scope` (CI and tooling changes are separate, AGENTS.md "Where things go"). Diff is exactly those two files. Body says "Part of #47".

### Task 1: Spec and plan (P1)

**Files:**
- Create: `docs/superpowers/specs/2026-11-01-rust-quest-design.md`, `docs/superpowers/plans/2026-11-01-rust-quest-phase1.md`

- [ ] **Step 1:** Title check: `printf '%s\n' "docs(rust): spec and plan" | npx --no -- commitlint` exits 0 (needs Task 0 merged, or the stacked base).
- [ ] **Step 2:** Re-read every `path:line` the spec and plan cite against the tree before merge; fix any that moved.
- [ ] **Step 3:** `npm run check` exits 0; `git diff --name-only main...HEAD` lists only the two files (after P0 merges and the branch is rebased onto `main`).
- [ ] **Step 4:** Check the two files for implementation code and for any Claude session link: none. The spec has exactly five fenced blocks (the check-context API, the snapshot shape, the file tree and two mermaid diagrams); the plan has none.
- [ ] **Step 5:** Open the PR titled `docs(rust): spec and plan`, stacked on P0's branch until P0 merges, then retargeted to `main`. Body says "Part of #47" and "Depends on" the P0 PR.

### Task 2: Scaffold, lexer, parser, chapter 1 and the verify script (P2, #65)

Branch off `main` after P1 merges. Sub-tasks run in order; each ends with a commit. The spec sections "Persistence" and "Content tests" define the behaviour of 2.2 and 2.6.

#### 2.1 Scaffold and wire the quest

**Files:**
- Create: `rust-quest/index.html`, `rust-quest/style.css`, `rust-quest/app.js`
- Modify: `index.html` (landing card), `tests/smoke.mjs` (`NAMES` at line 15), `README.md` (table row, repo map, count), `AGENTS.md` (row, "What this is" list)

**Interfaces:**
- Produces: page shell with `.tabs button[data-tab]` (`quest`, `fire`, `guide`), `window.PROGRESS={key:"rust-quest-v1",name:"Rust Quest"}`, `shared/*` css and js including `how`, `nav`, `progress`, `theme`.

- [ ] **Step 1:** Add `'rust'` to `NAMES` in `tests/smoke.mjs`. Run `node tests/smoke.mjs`; expected: the `rust-quest` tests FAIL (404).
- [ ] **Step 2:** Create the shell by copying the shape of `net-quest/index.html`. `app.js` only switches tabs for now.
- [ ] **Step 3:** Landing card in `index.html` with `data-key="rust-quest-v1"`, `.go` and `.xp`; README table row, repo-map entries for `rust-quest/` and `tests/rust/`, the quest count set to the number at merge time, `AGENTS.md` "Where things go" row and "What this is" list.
- [ ] **Step 4:** Run `npm run check` and `node tests/smoke.mjs`. Expected: all pass, including `rust-quest loads cleanly` and `progress survives export, wipe and import`.
- [ ] **Step 5: Commit** `feat(rust): scaffold Rust Quest`.

#### 2.2 Saved state, codes and ranks (`content/state.js`, `content/tiers.js`)

**Files:**
- Create: `rust-quest/content/state.js`, `tests/rust/harness.mjs`, `tests/rust/state.test.mjs`

**Interfaces:**
- Produces on `RQ`: `state.fresh()`, `state.load(raw, chapters) -> S`, `state.serialize(S) -> string`, `state.xpFor(done) -> number`. `S.codes` maps `'<ch>.<mi>'` to learner code, capped per mission.
- Produces in `harness.mjs`: `loadRust() -> RQ` (fresh `vm` context, loads `shared/how.js`, then `rust-quest/engine/*.js` and `content/*.js` in `index.html` order).

- [ ] **Step 1: Failing tests** in `state.test.mjs`: (1) a fresh serialized state satisfies the pristine predicate copied from `shared/progress.js:44` (comment names the line); (2) after one done mission, serialized `xp` is a number greater than 0; (3) a tampered `xp` is replaced by `xpFor`; (4) a `codes` entry over the cap is cut to the cap; (5) the export round trip (serialize, load) keeps `codes`; (6) wrong shapes (`'{"done":5,"xp":"x"}'`, non-JSON, `null`) load without throwing; (7) unknown mission keys in `done` and `codes` are dropped (**Review Focus 4**).
- [ ] **Step 2:** Run `node --test tests/rust/state.test.mjs`. Expected: FAIL (files missing).
- [ ] **Step 3:** Implement. Per-field fallback, as `net-quest/app.js:20-31` does.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(rust): add saved state with capped learner code`.

#### 2.3 Lexer and parser (`engine/lex.js`, `engine/parse.js`)

**Files:**
- Create: `rust-quest/engine/lex.js`, `rust-quest/engine/parse.js`, `tests/rust/lex.test.mjs`, `tests/rust/parse.test.mjs`

**Interfaces:**
- Produces on `RQ`: `lex(src) -> tokens[]` with line and column; `parse(tokens) -> {ast, errors[], unsupported[]}`. AST nodes carry stable node ids. The parser accepts the full subset grammar; anything outside the subset parses, then reports `unsupported` with the feature name and line.

- [ ] **Step 1: Failing tests:** every token kind including lifetimes `'a`, char vs lifetime, raw and escaped strings, nested block comments; parser error positions for a missing `;`, a missing `}` and an unclosed string; an out-of-subset construct (`unsafe`, `HashSet`, `dyn`) parses and reports `unsupported`, not a syntax error; a 5,000-line source returns within the cap; `Fn`-bound syntax in a std signature parses.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS. Add the files to the harness list.
- [ ] **Step 5: Commit** `feat(rust): add the lexer and parser`.

#### 2.4 Minimal checker, interpreter, diagnostics and `RQ.run` (`engine/check.js`, `interp.js`, `std.js`, `diag.js`, `index.js`)

**Files:**
- Create: `rust-quest/engine/types.js`, `check.js`, `interp.js`, `std.js`, `diag.js`, `index.js`, `tests/rust/run.test.mjs`, `tests/rust/internal.test.mjs`

**Interfaces:**
- Consumes: `lex`, `parse`.
- Produces: `RQ.compile(src) -> {ast, diags, unsupported}` and `RQ.run(src, opts) -> c`, the check-context data of the spec section "Check context, answer / wrong / lazy": `status`, `errors`, `stdout`, `stderr`, `exit`, `panic`, `unsupported`, `compiles()`, `hasError(id, line?)`, `out()`. Scope of P2: scalar literals, `let`/`mut`/shadowing/`const`, `fn` with scalar params, `println!` with `{}`, E0384.
- `diag.js` is keyed by code or lint id and holds authored wording, a `tip`, the panic-header constant, and the unsupported catalog with an in-subset hint per entry.
- An exception inside `RQ.run` returns `status:'internal'`, never `unsupported`.

- [ ] **Step 1: Failing tests:** `println!("{}", 1 + 2)` prints `3` with exit 0; assigning twice to an immutable `let` gives `E0384` at the second assignment's line; `mut` and shadowing pass; an unsupported construct gives `status:'unsupported'` with the feature and line; a deliberately thrown engine error (test hook) gives `status:'internal'` and not `unsupported`; a step-cap program gives `status:'limit'`; the same source run twice gives identical results.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS. Add the files to the harness list.
- [ ] **Step 5: Commit** `feat(rust): add the minimal checker, interpreter and diagnostics`.

#### 2.5 Corpus v0, verify script and stamp (`tests/rust/`, `tests/fixtures/rust/`)

**Files:**
- Create: `tests/rust/verify-rustc.mjs`, `tests/rust/stamp.test.mjs`, `tests/rust/corpus.test.mjs`, `tests/fixtures/rust/corpus-1.json`, `tests/fixtures/rust/verified.json`

**Interfaces:**
- Corpus entries are `{id, src, expect:'ok' | {code|lint, line}, out?, err?, exit?, why, pr}`; compile-ok entries require authored `out`, `err`, `exit`. `verified.json` is `{rustc, edition, date, inputsHash, resultsHash, counts}`.
- `verify-rustc.mjs` is not a `*.test.mjs` file. It builds each program as `src/main.rs` in a temp directory with the target edition, compares diagnostic id and primary line (from `--error-format=json`) or stdout, stderr and exit code (run with `RUST_BACKTRACE=0` and a timeout) three ways (authored fields, `rustc`, `RQ.run`), and writes only `verified.json`, and only on 0 mismatches.
- `stamp.test.mjs` recomputes both hashes with `node:crypto`.

- [ ] **Step 1: Failing tests:** `corpus.test.mjs` runs every entry through `RQ.run` and compares authored fields (every reject has a paired accept differing by a minimal edit; ch1 cases: `println!` and `{}` output, E0384, `mut`, shadowing). `stamp.test.mjs` fails on a changed corpus entry (`inputsHash`) and on a changed engine result (`resultsHash`).
- [ ] **Step 2:** Run; FAIL. **Step 3:** Write the corpus and the scripts.
- [ ] **Step 4:** The owner runs `node tests/rust/verify-rustc.mjs` on a machine with `rustc` (check: `rustc --version`; install from rustup.rs). Expected: 0 mismatches and a written `verified.json`. A mismatch means the engine or the authored entry is wrong; fix that, never the fixture to match. This run settles the UNVERIFIED Rust facts and edition 2024 (D4); if `rustc` is older than the edition, stop and ask the owner.
- [ ] **Step 5:** Run `node --test "tests/rust/*.test.mjs"`; PASS.
- [ ] **Step 6: Commit** `test(rust): add corpus v0, the rustc verify script and the stamp test`.

#### 2.6 Mission model and chapter 1 (`content/`)

**Files:**
- Create: `rust-quest/content/model.js`, `ch-01-hello.js`, `extras.js`, `tests/rust/content.test.mjs`, `teach.test.mjs`, `codestyle.test.mjs`

**Interfaces:**
- Produces: `RQ.CH: Chapter[]` where `Chapter = {name, badge, intro, toolbox, learned[], missions[]}` (chapters register by push from `content/ch-*.js`, loaded in order); `Mission = {title, goal, how: string[], explain, hint, kind: 'write'|'fix'|'predict'|'choose', starter?, harness?, answer, wrong[], lazy[], defines[], previews[], check(c) -> true|string}`; `RQ.runMission(m, input) -> true|string`. `RQ.RANKS`, quick-fire and guide seeds in `extras.js`.
- Chapter 1 ("Hello, Rust": `fn main`, `println!`, `let`, immutability, `mut`, shadowing) with the `macro` preview wording of the spec table.

- [ ] **Step 1: Failing tests** (spec section "Content tests"): in `content.test.mjs`, for every mission: `answer` passes; every `wrong` and `lazy` fails for its `wrongWhy`; every `fix` starter fails with `starterErr`; at least one alternative valid answer passes; keys unique by `chapterIndex.missionIndex`; `how` has three to five entries and `how[0]` matches `<code>`; no answer returns `unsupported` or `internal`. `teach.test.mjs`: feature tags per program, `defines`/`previews` rules, the preview wording contains "Chapter N" with N the home chapter and that chapter exists later. `codestyle.test.mjs`: bare-code detection as `tests/net/codestyle.test.mjs:4-6` does, over `goal`, `how`, `explain`, `hint`.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement the model and chapter 1, then `extras.js` with at least 3 quick-fire questions and 1 guide entry for chapter 1. **Step 4:** Run all `tests/rust`; PASS.
- [ ] **Step 5:** Run the `review-mission` skill over the new missions. Fix what it finds.
- [ ] **Step 6: Commit** `feat(rust): add the mission model and chapter 1`.

#### 2.7 UI and editor (`ui.js`, `editor.js`, `app.js`)

**Files:**
- Create: `rust-quest/ui.js`, `rust-quest/editor.js`
- Modify: `rust-quest/app.js`, `rust-quest/style.css`, `rust-quest/index.html` (script order: `shared/*`, `engine/*` in harness order, `content/*`, `ui.js`, `editor.js`, `app.js`), `tests/smoke.mjs`

**Interfaces:**
- Consumes: `RQ.CH`, `RQ.run`, `RQ.runMission`, `RQ.state`, `HowSteps.html`.
- Produces: mission card with `how` steps, code editor with an extra-keys row (`& &mut ' :: <> |x| { } ; ! ? Tab`), run output, diagnostics list, "toolbox" line, the `unsupported` card (hint, "Copy code", bare Playground link with no code in the URL, feature-request footer), the `internal` card ("This is a Rust Quest bug, not your code" plus an issue link with no learner code), "reset to starter" button, and the banner naming `rustc` version and edition from `verified.json`. Save is debounced; a mission awards XP once.

- [ ] **Step 1: Failing browser tests** in `tests/smoke.mjs`: after a clean load the stored `rust-quest-v1` JSON has `xp === 0`; finishing mission 0.0 changes the XP text exactly once even after running again; seeding `localStorage['rust-quest-v1']` with `'{"done":5,"xp":"x"}'` loads with no console errors; typed code survives a reload; "reset to starter" restores the starter; the Playground link href contains no learner code.
- [ ] **Step 2:** Run `node tests/smoke.mjs`; expect the new tests to FAIL.
- [ ] **Step 3:** Implement the DOM files and styles (reuse variables and classes of `net-quest/style.css`; no new fonts). Verify `tools/build.py` discovers the folder without a list edit; verify the 1000×700 sticky check.
- [ ] **Step 4:** Run `npm run check && npm run test:engine && npm run test:browser`. Expected: all pass, no console errors. `tests/rust/` runs locally only (`node --test "tests/rust/*.test.mjs"`) until P3.
- [ ] **Step 5:** Playtest (`playtest` skill) at 390, 1000 and 1440 wide; note what you saw in the PR.
- [ ] **Step 6:** Measure the bundle size (`npm run build` output size of `rust-quest`) and record it in the PR body (D14, first of two measurements).
- [ ] **Step 7: Commit** `feat(rust): add the editor and run view`.

#### 2.8 Open the PR

- [ ] **Step 1:** Run the `pre-pr-check` skill.
- [ ] **Step 2:** The PR body carries the local `node --test "tests/rust/*.test.mjs"` output (CI does not run it yet), the `verify-rustc.mjs` output line (version, counts, 0 mismatches), the bundle size, the playtest notes, and a QA checklist of real checkboxes. Title `feat(rust): scaffold, lexer, parser, ch1, verify script`, "Part of #47", closes #65. Request the security review (`codes` persistence and export, "Copy code" and Playground link, `internal` footer link).
- [ ] **Step 3:** Recount the README quest number against `main` at merge time.

### Task 3: Wire `rust-quest` into the checks (P3, #64)

Opened and merged right after P2. Branch off `main`. Build on #54 (Agent CI wiring): if #54 has merged, rebase onto it; if not, include its loop additions (`tests/fixtures/*.js` in the `AGENTS.md:17` and `pre-pr-check` loops, `ds-quest/*.js` in the `pre-pr-check` loop).

**Files:**
- Modify: `package.json` (line 13, `test:engine`), `.github/workflows/ci.yml` (line 32), `.claude/skills/pre-pr-check/SKILL.md` (line 11), `AGENTS.md` (line 17)

- [ ] **Step 1: Verify the gap first.** Run `npm run test:engine`. Expected: no `tests/rust` test appears in the output. Also read `ci.yml:32`: none of the `rust-quest/` globs is in the syntax loop.
- [ ] **Step 2:** `package.json:13`: add `"tests/rust/*.test.mjs"` to `test:engine`. Recheck the line against `main`.
- [ ] **Step 3:** `ci.yml:32`: add `rust-quest/*.js rust-quest/engine/*.js rust-quest/content/*.js tests/rust/*.mjs` (`*/app.js` already matches `rust-quest/app.js`). Adjust to the final layout from P2. `ci.yml:32` already has `tests/fixtures/*.js`, so only the rust globs are added there; the #54 additions (`tests/fixtures/*.js`, `ds-quest/*.js`) apply to the `pre-pr-check` and `AGENTS.md:17` loops.
- [ ] **Step 4:** `AGENTS.md:17` and `pre-pr-check` line 11: add the same globs. The sandbox may deny agent writes under `.claude/skills`; if so, the owner makes that edit by hand. `pages.yml` needs no edit (it calls `ci.yml`).
- [ ] **Step 5: Verify.** `npm run test:engine` now runs `tests/rust`; run the `ci.yml` syntax loop locally and expect exit 0; `npm run check` exits 0. Done when every local loop lists the same files as `ci.yml`.
- [ ] **Step 6:** Open the PR titled `ci: wire rust-quest into checks`, "Part of #47", closes #64.

### Task 4: Types, lints, formatting, chapters 2 and 3 (P4, #66)

Branch off `main` after P3 merges. Each sub-task ends with a commit and extends the corpus for its cases.

#### 4.1 Type inference (`engine/types.js`, `engine/check.js`)

- [ ] **Step 1: Failing tests:** int/float literal defaults (`i32`, `f64`), tuples, arrays, `as`, `if`/loops as expressions, `Range` as a built-in iterable; E0308 at the mismatching expression's line; E0425 for an unknown name; E0384 still works. Corpus: type errors, each with a paired accept.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS.
- [ ] **Step 5: Commit** `feat(rust): infer scalar, tuple and array types`.

#### 4.2 Lints and runtime panics (`engine/check.js`, `engine/interp.js`, `engine/diag.js`)

- [ ] **Step 1: Failing tests:** `arithmetic_overflow` for `let x: u8 = 255 + 1;`, `unconditional_panic` for `[1,2,3][5]` and `1/0`, `overflowing_literals` for `let x: u8 = 256;`; each reports `lint`, never `code`; the runtime counterpart (`add(250, 10)` on `u8` through parameters) panics with the overflow message and exit 101; a lint on anything beyond literals and single-assignment immutable `let`s is not reported by the engine. Corpus: the three lints and their runtime-panic counterparts. Record the panic-header constant and normalization rules in `diag.js` from the verify run.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS.
- [ ] **Step 5: Commit** `feat(rust): add the three overflow lints and runtime panics`.

#### 4.3 Formatting and `f64` (`engine/std.js`)

- [ ] **Step 1: Failing tests:** `{:?}`, `{:.N}`, `{:>N}`; the engine's own `f64` `Display` and `Debug` and rounding (not JS `toString` or `toFixed`) on edge cases (whole numbers, large and tiny values, `NaN`, infinities, rounding ties). Corpus: formatting edge cases with authored `out`.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS.
- [ ] **Step 5: Commit** `feat(rust): add formatting and f64 display`.

#### 4.4 Chapters 2 and 3 (`content/ch-02-*.js`, `ch-03-*.js`)

- [ ] **Step 1:** Add the chapters, appended to `index.html` and the harness list. Previews per the spec table (`&str` in chapter 2). All missions pass the generic tests from 2.6 unchanged; at least 3 quick-fire questions and 1 guide entry per chapter, including the E-code and lint glossary entries these chapters use.
- [ ] **Step 2:** Run all `tests/rust`; PASS. Run `review-mission` over the diff and fix what it finds.
- [ ] **Step 3: Commit** `feat(rust): add chapters 2 and 3`.

#### 4.5 Verify and open the PR

- [ ] **Step 1:** The owner runs `node tests/rust/verify-rustc.mjs`; expected 0 mismatches and a refreshed `verified.json` written by the script.
- [ ] **Step 2:** `npm run check && npm test`; playtest at 390, 1000 and 1440 wide; run `pre-pr-check`.
- [ ] **Step 3:** The PR body carries the verify output line and playtest notes. Title `feat(rust): types, lints, formatting, ch2-3`, "Part of #47", closes #66.

### Task 5: Move and borrow engine (P5, #67, checkpoint 1)

Branch off `main` after P4 merges. Engine only, no UI. This is the cost driver; sub-tasks run in order.

#### 5.1 Copy classification, reference types and `String` signatures (`engine/types.js`, `engine/std.js`)

- [ ] **Step 1: Failing tests:** the Copy classification table (scalars, `&T` Copy; `String`, `Vec`, `&mut T` not); reference types carry region variables; deref coercion (`&String` to `&str`); `String` std signatures (`push_str`, `len`, `clone`, `as_str`). Corpus: accepts that pass type checking.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS.
- [ ] **Step 5: Commit** `feat(rust): classify Copy types and type references`.

#### 5.2 CFG lowering (`engine/mir.js`)

- [ ] **Step 1: Failing tests:** lowering a function gives a CFG of places, moves and borrows; branches, loops, early `return` and `break` produce the expected edges; each node maps back to an AST node id.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS. Add the file to the harness list.
- [ ] **Step 5: Commit** `feat(rust): lower functions to a control-flow graph`.

#### 5.3 Move analysis (`engine/borrow.js`)

- [ ] **Step 1: Failing tests:** E0382 use after move (straight line, branch, loop); E0381 use of an uninitialised variable; reassigning a moved `mut` variable is accepted; a Copy value never moves. Corpus: each reject with a paired accept.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS.
- [ ] **Step 5: Commit** `feat(rust): detect moves and uninitialised use`.

#### 5.4 NLL loans (`engine/borrow.js`)

- [ ] **Step 1: Failing tests:** E0499, E0502, E0505, E0506, E0596, E0597; a loan ends at the last use of the derived reference (NLL), so the paired accept (borrow last used before the conflicting access) passes; loan regions are available by AST node id. Corpus: `&`/`&mut` conflicts and NLL last use, every reject with a paired accept.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS.
- [ ] **Step 5: Commit** `feat(rust): check loans with non-lexical lifetimes`.

#### 5.5 Fuzz, verify, bundle size and the checkpoint

- [ ] **Step 1:** Add fixed-seed fuzz: mutated sources never throw uncaught, always return within the cap, never return `internal`.
- [ ] **Step 2:** The owner runs `node tests/rust/verify-rustc.mjs`; expected 0 mismatches. Measure the bundle size and record it in the PR body (D14, second of two measurements); the budget in the spec is set from the P2 and P5 numbers.
- [ ] **Step 3:** `npm run check && npm test`; run `pre-pr-check`.
- [ ] **Step 4:** The PR body carries the verify output line and the bundle size. Title `feat(rust): move and borrow engine`, "Part of #47", closes #67.
- [ ] **Step 5: Checkpoint 1, the fidelity gate.** The owner decides whether the borrow pass is honest enough before P6 starts. If not, stop and re-plan; do not start P6.

### Tasks 6 to 15: later PRs (summary)

These rows are not detailed here. **Re-plan after checkpoint 1** (P5) for P6 to P12, and **again after checkpoint 2** (P12) for P13 to P15. The gates apply to every row: the PR extends the corpus and merges only with 0 mismatches from the owner's verify run; content is append-only; `review-mission`, `playtest` at 390, 1000 and 1440 wide, `pre-pr-check`, `npm run check && npm test`.

| Task | PR | Ref | Content | Gate |
|---|---|---|---|---|
| 6 | P6 | #68 | snapshot recorder; `memview.js` (stack and heap, `&` and `&mut` arrows, step slider, loan gutter, static "state at the error point"); minimal structs and the single-method `impl Drop` special case; chapter 4 | corpus: drop order through `impl Drop` programs that print; playtest at 390 (stack and heap stack vertically); borrow-lesson missions carry the full `lazy` list |
| 7 | P7 | #69 | slice types, lifetime elision check, E0106/E0515; chapter 5 | corpus: slices, E0106/E0515 |
| 8 | P8 | #70 | type-system core, engine only: enums, inherent `impl`, generic instantiation of builtin items, builtin trait lookup, method resolution with autoref and autoderef, derives, field place paths; a closure argument reports `unsupported` until P14 | corpus: disjoint fields, partial moves, move in match-arm bindings, derived `Debug` output |
| 9 | P9 | #71 | patterns, exhaustiveness, E0004; chapters 6 and 7 | corpus: patterns and E0004 |
| 10 | P10 | #72 | `for` desugaring over `Vec`, `&Vec`, `&mut Vec`, `HashMap`, `Range`; two-phase borrows; non-closure collection signatures; the single `HashMap` traversal entry point and the two-seed rule with unit tests; chapter 8 | corpus: two-phase `v.push(v.len())`, iterator invalidation, `for` over collections (map-printing entries order-independent) |
| 11 | P11 | #73 | `Result`, `?` with identical error types, `main -> Result`; chapter 9 | corpus: `?` moves, `main -> Result` (stderr `Error: ...`, exit 1) |
| 12 | P12 | #74 | explicit lifetime annotations, region constraints, E0597 with regions; chapter 10 | corpus: lifetime annotations. **Checkpoint 2, a re-plan:** the owner decides whether P13 and P14 stay real code or become authored lessons (R1 partly unmet if downgraded) |
| 13 | P13 | #75 | user generics, user traits, default methods, `impl Trait for Type` (`Drop`, `Display`, `From` with `?`), bounds, `impl Trait` args; E0277/E0599/E0369; chapter 11 | **Blocked on checkpoint 2.** Corpus: E0277/E0599/E0369, bound checks, `impl Trait`, `From` with `?`, hand-written `Display`, general `Drop` |
| 14 | P14 | #76 | closure typing, capture analysis, `move`, `Fn`-kind errors (E0525/E0373), iterator adapters, closure-taking std methods, user `impl Iterator`; chapter 12 | **Blocked on checkpoint 2.** Corpus: closure captures, E0525/E0373, adapter outputs |
| 15 | P15 | #77 | chapter 13 capstone; quick-fire and field-guide completeness (including the E-code and lint glossary); final playtest of every chapter at desktop and 390px with screenshots | **Blocked on checkpoint 2.** `review-mission` over the whole course; README count recheck. Last PR of the chain; the owner decides whether it closes #47 |

Each later PR starts from `main` after the previous merges and appends only. Chapter and mission order is final once merged.

---

## Self-review

- **Spec coverage:** runtime and the three non-verdicts (2.4, 2.6, 2.7), subset boundary (2.3, 4.1 to 4.3, 5.1), type-checker features by PR (Tasks 2 to 5 and the summary table), check context and mission kinds (2.4, 2.6), diagnostics and lints (4.2), memory view (P6 row), engine layout (2.1 to 2.4), Persistence (2.2, 2.7), chapters and previews (2.6, 4.4), alternatives and risks (spec only), Content tests (2.6), fidelity proof and stamp (2.5, 4.5, 5.5), PR chain and checkpoints (PR split, Task 5, summary table), bundle size (2.7 step 6, 5.5 step 2).
- **Touchpoints checked:** P2 landing card, `tests/smoke.mjs:15` `NAMES`, README table row, repo map and count, `AGENTS.md` row and "What this is" list, `xp === 0` smoke assertion. P3 `package.json:13`, `ci.yml:32`, `pre-pr-check` glob, `AGENTS.md:17` loop, `tests/fixtures/*.js`. `tools/build.py` and `commitlint.yml` need no edit (verify the first in 2.1).
- **Naming consistency:** `RQ.compile`, `RQ.run`, `RQ.CH`, `RQ.runMission`, `RQ.state`, `RQ.RANKS`; statuses `ok`, `error`, `unsupported`, `internal`, `panic`, `limit`, `exit`; snapshot states `uninit`, `owned`, `moved`, `dropped`, `shared`, `mutBorrowed`.
- **Conflicts to recheck:** P0 and P2 against sibling quest PRs on `commitlint.config.mjs`, `CONTRIBUTING.md`, `README.md`, `tests/smoke.mjs`, `index.html` and `AGENTS.md`; P3 against #54 on `package.json:13`, `ci.yml:32` and `AGENTS.md:17`.
- **Unverified until P2:** every Rust fact (codes, lints, panic format, exit codes, edition 2024, `f64` formatting), `tools/build.py` discovery of `rust-quest/`, the 1000×700 sticky layout, and the bundle size.
- **Out of scope here:** Go (#48), a live "check with real rustc" mode, the `new-playground` skill fix (#59), a rustup CI step (D10).
