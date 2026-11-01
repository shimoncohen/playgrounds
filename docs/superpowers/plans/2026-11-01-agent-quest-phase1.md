# Agent Quest Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `agent-quest/`: a DOM-free agent simulator, a prompt-and-setup editor, a context meter and 23 chapters on four paths (core, dev, personal, tune), delivered as eight strictly ordered PRs.

**Architecture:** Plain browser scripts sharing one global namespace `AQ` (like `NQ`, `DSQ` and `SQ`), loaded in order from `index.html`. `engine/` (no DOM) holds tokens, the virtual file system, the setup and prompt-grammar parsers, the context builder, the policy and permissions. `content/` holds the course as data plus the pure state functions. `ui.js`, `editor.js`, `meter.js` and `app.js` are the only DOM files. Node tests load the engine and content in a `vm` sandbox, as `tests/net/harness.mjs` does.

**Tech Stack:** Plain JS, Node `node:test` + `vm`, Playwright (existing smoke tests). No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-01-agent-quest-design.md`. Live mode is #52 and is not in this plan.

## Global Constraints

- No build step, no framework, no new runtime dependency. Pages work opened from disk and on GitHub Pages.
- Engine and content files (`agent-quest/engine/*.js`, `agent-quest/content/*.js`) never touch `window`, `document` or `localStorage`.
- The simulator is deterministic: no `Math.random`, no `Date.now`. The Outcome comes from the policy; the provider never produces it and check code never calls it.
- Progress key is exactly `agent-quest-v1`, saved keys exactly `{ch, mi, done, xp, badges, best, tab}`. No learner text is ever persisted. Mission keys are `'<chapter>.<mission>'`; once shipped they are never renumbered, only appended.
- Local assets use relative `<script src>` / `<link href>`; an inlined file never contains `</script` or `</style` (`npm run check` bundles every `*-quest/`).
- Do not regenerate or edit anything under `tests/fixtures/`. Do not weaken, skip or delete an existing test.
- Learner text: whole line explained first, then each part (`how` steps as HTML strings); commands, fields, paths and file names are `<code>`; friendly, concrete, never assumes untaught knowledge (AGENTS.md rules 9 to 12, skills `mission-voice` and `add-mission`).
- Every mission has `answer`, `wrong` and `lazy`: the answer passes its own check and the other two fail. Answers are computed by the sim, never hardcoded.
- Every volatile claim in learner text is a `facts.js` entry with an https `docUrl` and a `checked` date.
- Conventional Commits, scope `agent` (Task 0, already merged before any other PR starts). Never bump the version or edit `CHANGELOG.md`. Keep the attribution trailer your tooling adds.
- Match surrounding code: compact style of `net-quest/*.js`, comment density, naming.
- One concern per PR. The chain is strict: 0, 1, 2, 3, 4, 5, 6, 7. Do not open a PR before the one before it has merged.

## Review Focus

1. **Grammar edge cases**: empty line, unknown verb, target that does not resolve, 5,000-character line, a path with `..`, a constraint that blocks everything. Each is an inline error with no effect and no exception. Task 2.3.
2. **Violation versus skip**: a blocked action logs no violation; an executed action matching `hidden` does. A skipped required action fails `accept` without a violation. Task 2.4.
3. **Honest checks**: for each mission type there is a computed answer, a parsing-but-wrong case and a lazy case (unparsed line, unresolved target, missing `Done when`). The "do nothing" run fails. Task 2.6 and every content PR.
4. **Saved state**: fresh state satisfies the `shared/progress.js:44` pristine predicate; one done mission gives `xp > 0`; a tampered `xp` is replaced; the key set equals the whitelist; a bad shape loads without throwing. Task 2.2.
5. **Page contract**: the tab, scroll, sticky and 390px checks in `tests/smoke.mjs:96-147` pass for the new quest at 1280, 1440 and 1000×700, and the pane switcher is not `.tabs`. Task 2.7.
6. **Shared-file conflicts**: #45 and issues #46 to #50 may edit `tests/smoke.mjs`, `index.html` and `README.md` first. Merge `main` into PR 2 and recount before merge.

---

## PR split

| PR | Task | Ref | Title | Depends on |
|---|---|---|---|---|
| 0 | 0 | #61 | `ci: allow the agent commit scope` | none |
| 1 | 1 | #51 | `docs(agent): spec and plan` | 0 |
| 2 | 2 | #53 | `feat(agent): engine, UI shell, chapter 1` | 1 |
| 3 | 3 | #54 | `ci: wire agent-quest into checks` | 2 |
| 4 | 4 | #55 | `feat(agent): core chapters 2-7` | 3 |
| 5 | 5 | #56 | `feat(agent): dev path (chapters 8-15)` | 4 |
| 6 | 6 | #57 | `feat(agent): personal path (chapters 16-20)` | 5 |
| 7 | 7 | #58 | `feat(agent): setup optimization (chapters 21-23)` | 6 |

Each PR body links #51 as "Part of". Each PR carries a QA checklist of real checkboxes, each naming its command or action.

### Task 0: Allow the `agent` commit scope (PR 0)

**Files:**
- Modify: `commitlint.config.mjs` (add `'agent'` to `scope-enum`), `CONTRIBUTING.md` (scope list gains `net` and `agent`)

- [ ] **Step 1: Verify the failure first.** On `main`, run `printf '%s\n' "docs(agent): spec and plan" | npx --no -- commitlint`. Expected: exit 1 with a `scope-enum` error. This is the failing-before check.
- [ ] **Step 2: Add `'agent'`** after `'net'` in the list in `commitlint.config.mjs`. In `CONTRIBUTING.md`, append `net` and `agent` to the scopes line, keeping the order of the rest.
- [ ] **Step 3: Verify.** The same command exits 0. `npm run check` exits 0.
- [ ] **Step 4: Open its own PR** titled `ci: allow the agent commit scope` (CI and tooling changes are separate, AGENTS.md "Where things go"). Diff is exactly those two files. Status: PR #61.

### Task 1: Spec and plan (PR 1)

**Files:**
- Create: `docs/superpowers/specs/2026-11-01-agent-quest-design.md`, `docs/superpowers/plans/2026-11-01-agent-quest-phase1.md`

- [ ] **Step 1:** Title check: `printf '%s\n' "docs(agent): spec and plan" | npx --no -- commitlint` exits 0 (needs Task 0 merged, or the stacked base).
- [ ] **Step 2:** Re-read every `path:line` the spec cites against the tree before merge; fix any that moved.
- [ ] **Step 3:** `npm run check` exits 0; `git diff --name-only main...HEAD` lists only the two files (after PR 0 merges and `main` is merged in).
- [ ] **Step 4:** Check the two files for pasted code and for any Claude session link: none.
- [ ] **Step 5:** Open the PR titled `docs(agent): spec and plan`, stacked on PR 0's branch until PR 0 merges, then retargeted to `main`.

### Task 2: Engine, UI shell and chapter 1 (PR 2, #53)

Branch off `main` after PR 1 merges. Sub-tasks run in order; each ends with a commit.

#### 2.1 Scaffold and wire the quest

**Files:**
- Create: `agent-quest/index.html`, `agent-quest/style.css`, `agent-quest/app.js`
- Modify: `index.html` (landing card), `tests/smoke.mjs` (`NAMES` at line 15), `README.md` (table row, repo map, count), `AGENTS.md` (row, "What this is" list)

**Interfaces:**
- Produces: page shell with `.tabs button[data-tab]` (`quest`, `fire`, `guide`), `section#tab-quest|fire|guide`, `#chapters`, `.missionCol` containing `#mission`, `.mapCol` with three `.panel`s, `.paneSwitch button[data-pane]`, `.meterStrip`; `window.PROGRESS={key:"agent-quest-v1",name:"Agent Quest"}`.

- [ ] **Step 1:** Add `'agent'` to `NAMES` in `tests/smoke.mjs`. Run `node tests/smoke.mjs`; expected: the `agent-quest` tests FAIL (404).
- [ ] **Step 2:** Create the shell by copying the shape of `net-quest/index.html` (header, tabs, XP bar, `shared/*` css and js including `how`, `nav`, `progress`, `theme`). `app.js` only switches tabs for now.
- [ ] **Step 3:** Landing card in `index.html` with `data-key="agent-quest-v1"`, `.go` and `.xp`; README table row, repo-map entries for `agent-quest/` and `tests/agent/` (including the `tests/` line), the "all seven" count at `README.md:134` set to the number at merge time, `AGENTS.md` "Where things go" row and "What this is" list.
- [ ] **Step 4:** Run `npm run check` and `node tests/smoke.mjs`. Expected: all pass, including `agent-quest loads cleanly` and `progress survives export, wipe and import`.
- [ ] **Step 5: Commit** `feat(agent): scaffold Agent Quest`.

#### 2.2 Saved state and ranks (`content/state.js`, `content/tiers.js`)

**Files:**
- Create: `agent-quest/content/tiers.js`, `agent-quest/content/state.js`, `tests/agent/harness.mjs`, `tests/agent/state.test.mjs`

**Interfaces:**
- Produces on `AQ`: `tiers` from `Tiers.create` (tiers `core`, `dev`, `personal`, `tune`, `missionXp` 10, `tierEndRanks: {}`, core-sized `baseRanks` of about 525 XP at the top); `state.fresh()`, `state.load(raw, chapters) -> S`, `state.serialize(S) -> string`, `state.xpFor(done, badges) -> number`.
- Produces in `harness.mjs`: `loadAgent() -> AQ` (fresh `vm` context, loads `shared/tiers.js`, `shared/how.js`, then `agent-quest/engine/*.js` and `content/*.js` in `index.html` order).

- [ ] **Step 1: Failing tests** in `state.test.mjs`: (1) a fresh serialized state satisfies the pristine predicate copied from `shared/progress.js:44` (comment names the line); (2) after one done mission, serialized `xp` is a number greater than 0; (3) a tampered `xp` is replaced by `xpFor`; (4) the serialized key set equals `{ch, mi, done, xp, badges, best, tab}`, so `answers` or any other key fails; (5) wrong shapes (`'{"done":5,"xp":"x"}'`, non-JSON, `null`) load without throwing; (6) `tab` outside `quest|fire|guide` falls back to `quest`; (7) unknown mission keys in `done` are dropped.
- [ ] **Step 2:** Run `node --test tests/agent/state.test.mjs`. Expected: FAIL (files missing).
- [ ] **Step 3:** Implement. Per-field fallback, as `net-quest/app.js:20-31` does. No learner text field.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(agent): add saved state and path ranks`.

#### 2.3 Tokens, virtual files, config and prompt grammar (`engine/tokens.js`, `vfs.js`, `config.js`)

**Files:**
- Create: `agent-quest/engine/tokens.js`, `agent-quest/engine/vfs.js`, `agent-quest/engine/config.js`, `tests/agent/tokens.test.mjs`, `tests/agent/config.test.mjs`

**Interfaces:**
- Produces on `AQ`: `tokens.estimate(text) -> ceil(chars/4)`; `vfs.create(files) -> Vfs` with `read`, `write`, `exists`, `list(prefix)`, `clone`; `config.parseSetup(vfs) -> {memory, skills[], mcp[], rules[], hooks[], subagents[]}`; `config.parsePrompt(text, scenario) -> {fields, errors[], constraints[], doneWhen|null}`. Constraint is `{kind: 'do not'|'only'|'ask before'|'max', verb, target}`; verbs `edit read run call send delete`.

- [ ] **Step 1: Failing tests:** `estimate('')` is 0, `estimate('abcd')` is 1, `estimate('abcde')` is 2; grammar accepts each constraint form and `max 3 files`; rejects (inline error, no effect, no throw) an unknown verb, an unresolved target (`nonexistent/`), a `..` path, an empty line, `be careful and don't break anything`, `Done when: it is done`, and a 5,000-character line; `Files` and `Examples` entries must resolve; `Use` names must exist in the setup; skill frontmatter `when:` outside the closed task-tag vocabulary is an error (**Review Focus 1**).
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS. Add the files to the harness list.
- [ ] **Step 5: Commit** `feat(agent): add token estimate, virtual files and prompt grammar`.

#### 2.4 Context, permissions, shell table and policy (`engine/context.js`, `permissions.js`, `shell.js`, `policy.js`)

**Files:**
- Create: `agent-quest/engine/context.js`, `permissions.js`, `shell.js`, `policy.js`, `tests/agent/context.test.mjs`, `permissions.test.mjs`, `policy.test.mjs`

**Interfaces:**
- Consumes: `tokens`, `vfs`, `config`.
- Produces: `context.build(setup, prompt, history) -> {segments[], total, peak}` with segments for system, memory, skills, MCP, files, history, prompt; overflow drops the oldest `history` segments first. `permissions.check(action, setup, constraints) -> {allowed, by}`. `shell.exec(scenario, action) -> result` over the scenario's command and tool table. `policy.run(scenario, setup, prompt) -> Outcome` where `Outcome = {status: 'done'|'unverified'|'failed'|'blocked', vfs, calls[], steps[], violations[], tokens{peak,total}}`.
- Policy order (spec "Policy"): build context; plan step if `Plan: first`; walk `script` (blocked means skipped with no violation; executed and matching `hidden` means a violation); run `Done when` if it resolves; on failed verification apply the scenario's correction step and re-verify up to a step cap; no verification means `unverified`.

- [ ] **Step 1: Failing tests** on a fixture scenario with a `migrations/` trap: a blocked trap edit logs no violation; an unblocked one logs exactly one; a skipped required action fails `accept` but `violations` is empty; `Plan: first` puts a plan step before any edit; a correction step runs at most the cap; no `Done when` gives `unverified`; overflow drops the oldest `history` segment and a constraint stated only there is forgotten; `CLAUDE.md` lines in grammar act as standing constraints; two runs of the same inputs give identical Outcomes (determinism) (**Review Focus 2**).
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS. Add the files to the harness list.
- [ ] **Step 5: Commit** `feat(agent): simulate context, permissions and the agent policy`.

#### 2.5 Provider seam (`engine/provider.js`)

**Files:**
- Create: `agent-quest/engine/provider.js`, `tests/agent/provider.test.mjs`

**Interfaces:**
- Produces: `provider.sim.complete(messages, opts) -> {text, usage:{in,out}}` with canned narration and `usage` from `tokens.estimate`.

- [ ] **Step 1: Failing tests:** `usage.in` equals the estimate of the joined messages; the same messages give the same text; a source check that no file under `agent-quest/content/` references `provider` (check code never calls the provider).
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS.
- [ ] **Step 5: Commit** `feat(agent): add the simulated provider seam`.

#### 2.6 Mission model, facts, scenarios and chapter 1 (`content/`)

**Files:**
- Create: `agent-quest/content/model.js`, `facts.js`, `scenarios.js`, `ch-01-loop.js`, `extras.js`, `tests/agent/content.test.mjs`, `teach.test.mjs`, `codestyle.test.mjs`

**Interfaces:**
- Produces: `AQ.CH: Chapter[]` where `Chapter = {name, badge, tier, intro, learned[], missions[]}` (chapters register by push from `content/ch-*.js`, loaded in order); `Mission = {title, goal, how: string[], explain, hint, scenario, kind: 'prompt'|'config'|'budget', answer, wrong, lazy, check(outcome, ctx) -> true|string}`; `AQ.runMission(m, input) -> true|string` builds the scenario, runs the policy and returns `m.check`. `AQ.FACTS: {id, text, docUrl, checked}[]`. `AQ.RANKS`, quick-fire and guide seeds in `extras.js`.
- Chapter 1 ("The agent loop", about 5 missions on the loop: read, act, check; what a tool call is; what the agent can and cannot see).

- [ ] **Step 1: Failing tests** in `content.test.mjs` for every mission of every chapter: `answer` passes; `wrong` and `lazy` fail; empty input fails; keys unique by `chapterIndex.missionIndex`; `how` has three to five entries, `how[0]` matches `<code>` and is over 20 plain characters (`tests/net/content.test.mjs:46-49`); scenario exists; every fact id used exists, has an https `docUrl` and an ISO `checked`. `teach.test.mjs`: every term used by a mission was taught earlier on the default path or is defined in place. `codestyle.test.mjs`: copy the shell rules the same way `tests/net/codestyle.test.mjs:4-6` does (importing `tests/shell/codestyle.test.mjs` would run the Shell Quest tests too; only `bareMentions` is exported), add the agent field names and commands, run over `goal`, `how`, `explain`, `hint`.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement the model, facts, scenarios and chapter 1, then `extras.js` with at least 3 quick-fire questions and 1 guide entry for chapter 1. **Step 4:** Run all `tests/agent`; PASS.
- [ ] **Step 5:** Run the `review-mission` skill over the new missions. Fix what it finds.
- [ ] **Step 6: Commit** `feat(agent): add the mission model and chapter 1`.

#### 2.7 UI, editor, meter and run view (`ui.js`, `editor.js`, `meter.js`, `app.js`)

**Files:**
- Create: `agent-quest/ui.js`, `agent-quest/editor.js`, `agent-quest/meter.js`
- Modify: `agent-quest/app.js`, `agent-quest/style.css`, `agent-quest/index.html` (script order: `shared/*`, `engine/*` in harness order, `content/*`, `ui.js`, `editor.js`, `meter.js`, `app.js`), `tests/smoke.mjs`

**Interfaces:**
- Consumes: `AQ.CH`, `AQ.runMission`, `AQ.state`, `Tiers.renderRail`, `HowSteps.html`.
- Produces: the page markup in spec "UI". Files panel (tree and editor), prompt form with the eight fields and inline grammar errors plus the line "Real agents read natural language. The simulator acts only on these lines so checks are exact.", Meter panel (segmented bar, text table, `role="meter"`, label "~N of M tokens (estimate, chars/4)"), Run panel (steps and Outcome). Save is debounced; a mission awards XP once.

- [ ] **Step 1: Failing browser tests** in `tests/smoke.mjs`: after a clean load the stored `agent-quest-v1` JSON has `xp === 0`; finishing mission 0.0 changes the XP text exactly once even after running again; seeding `localStorage['agent-quest-v1']` with `'{"done":5,"xp":"x"}'` loads with no console errors; a typed prompt line that does not parse shows an inline error.
- [ ] **Step 2:** Run `node tests/smoke.mjs`; expect the new tests to FAIL.
- [ ] **Step 3:** Implement the DOM files and styles (reuse variables and classes of `net-quest/style.css`; no new fonts). Verify `tools/build.py` discovers the folder without a list edit; verify the 1000×700 sticky check.
- [ ] **Step 4:** Run `npm run check && npm run test:engine && npm run test:browser`. Expected: all pass, no console errors. `tests/agent/` runs locally only (`node --test "tests/agent/*.test.mjs"`) until PR 3.
- [ ] **Step 5:** Playtest (`playtest` skill) at 390, 1000 and 1440 wide; note what you saw in the PR.
- [ ] **Step 6: Commit** `feat(agent): add the editor, meter and run view`.

#### 2.8 Open the PR

- [ ] **Step 1:** Run the `pre-pr-check` skill.
- [ ] **Step 2:** The PR body carries the local `node --test "tests/agent/*.test.mjs"` output (CI does not run it yet), the playtest notes, and a QA checklist of real checkboxes. Title `feat(agent): engine, UI shell, chapter 1`, "Part of #51", closes #53.
- [ ] **Step 3:** Recount the README "all seven" number against `main` at merge time.

### Task 3: Wire `agent-quest` into the checks (PR 3, #54)

Opened and merged right after PR 2. Branch off `main`.

**Files:**
- Modify: `package.json` (line 13, `test:engine`), `.github/workflows/ci.yml` (line 32), `.claude/skills/pre-pr-check/SKILL.md` (line 11), `AGENTS.md` (line 17)

- [ ] **Step 1: Verify the gap first.** Run `npm run test:engine`. Expected: no `tests/agent` test appears in the output. Also read `ci.yml:32`: none of the `agent-quest/` globs is in the syntax loop.
- [ ] **Step 2:** `package.json:13`: add `"tests/agent/*.test.mjs"` to `test:engine`. Recheck after #45 merges (it does not edit this line as of 2026-11-01).
- [ ] **Step 3:** `ci.yml:32`: add `agent-quest/*.js agent-quest/engine/*.js agent-quest/content/*.js tests/agent/*.mjs` (`*/app.js` already matches `agent-quest/app.js`).
- [ ] **Step 4:** `AGENTS.md:17` and `pre-pr-check` line 11: add the same globs, plus `tests/fixtures/*.js` (already in `ci.yml:32`, missing from both loops). `pre-pr-check` also lacks `ds-quest/*.js`; note it in the PR as out of scope unless the owner asks. The sandbox may deny agent writes under `.claude/skills`; if so, the user makes that edit.
- [ ] **Step 5: Verify.** `npm run test:engine` now runs `tests/agent`; run the `ci.yml` syntax loop locally and expect exit 0; `npm run check` exits 0.
- [ ] **Step 6:** Open the PR titled `ci: wire agent-quest into checks`, "Part of #51", closes #54.

### Tasks 4 to 7: Content PRs (summary)

Each content PR: one task per chapter (write `content/ch-NN-*.js`, append its `<script>` to `index.html`, extend `tests/agent/harness.mjs` if needed), append-only; all missions pass the generic tests from Task 2.6 unchanged; add at least 3 quick-fire questions and 1 guide entry per chapter; every volatile claim is a `facts.js` entry. Gates per PR: `review-mission` over the diff, `playtest` at 390, 1000 and 1440 wide, `pre-pr-check`, `npm run check && npm test`. Chapter and mission order is final once merged. Each later PR starts from `main` after the previous merges and appends only.

**Index plan** (valid only under the strict merge order 5, 6, 7): core 0 to 6, dev 7 to 14, personal 15 to 19, tune 20 to 22.

| Task | PR | Ref | Chapters (number, file) | Tier |
|---|---|---|---|---|
| 4 | 4 | #55 | 2 context and tokens (`ch-02-context.js`), 3 prompt structure (`ch-03-prompt.js`), 4 memory (`ch-04-memory.js`), 5 skills and MCP (`ch-05-skills-mcp.js`), 6 hooks, plugins, subagents (`ch-06-extend.js`), 7 safety (`ch-07-safety.js`) | core |
| 5 | 5 | #56 | 8 explore, plan, implement; 9 test, review, PR; 10 subagents, parallel, worktrees; 11 hooks for lint, format, guards; 12 slash commands and repo skills; 13 MCP for trackers, docs, browsers; 14 CI and headless; 15 writing a project `CLAUDE.md` | dev |
| 6 | 6 | #57 | 16 writing and research; 17 files and documents; 18 scheduled tasks (artifact is a `schedule.json` entry); 19 personal MCP (mail, calendar, notes); 20 small personal skills and commands | personal |
| 7 | 7 | #58 | 21 audit what is loaded; 22 trim, dedupe, move rare rules into on-demand skills; 23 measure before and after, cheaper models for simple subagent work | tune |

Chapter 3 carries the four prompt-structure missions in the spec (examples, specific versus general, when not to be specific, plan first), each with a defined `accept`. The "which mechanism" chooser in chapter 6 and the model-size chooser in chapter 2 are quick-fire `choose` questions plus a cost-multiplier mission. Chapter 23 shows the meter before and after.

---

## Self-review

- **Spec coverage:** simulator (Tasks 2.3 to 2.5), saved state and landing contract (2.2, 2.7), paths and rank (2.2), missions and checks (2.6), dated content (2.6), UI and 390px (2.7), wiring touchpoints (2.1 for the landing card, `NAMES`, README rows, repo map, count and `AGENTS.md` row; Task 3 for `package.json`, `ci.yml`, `pre-pr-check` and the `AGENTS.md` loop), chain and delivery (PR split), requirement map (content PRs), roadmap (#52 left out).
- **Touchpoints checked:** PR 2 landing card, `smoke.mjs:15` `NAMES`, README table row, repo map (`README.md:102-117`, `:112`), count (`README.md:134`), `AGENTS.md` row, `xp === 0` smoke assertion. PR 3 `package.json:13`, `ci.yml:32`, `pre-pr-check` glob, `AGENTS.md:17` loop, `tests/fixtures/*.js`. `tools/build.py` and `commitlint.yml` need no edit (verify the first in PR 2.1).
- **Naming consistency:** `AQ.tokens`, `AQ.vfs`, `AQ.config`, `AQ.context`, `AQ.permissions`, `AQ.shell`, `AQ.policy`, `AQ.provider`, `AQ.state`, `AQ.CH`, `AQ.FACTS`, `AQ.runMission` are used the same way in every task. Outcome statuses are `done`, `unverified`, `failed`, `blocked`.
- **Conflicts to recheck:** PR 3 against #45 on `package.json:13` (#45 does not touch it as of 2026-11-01); PR 2 against #45 and #46 to #50 on `README.md`, `tests/smoke.mjs` and `index.html`.
- **To verify in PR 2:** `tools/build.py` discovery, and the 1000×700 sticky layout. PR 3 reads the `pre-pr-check` glob itself (Task 3 Step 4).
- **Out of scope here:** live mode (#52), the `new-playground` skill fix (#59), the `pristine()` docs (#60).
