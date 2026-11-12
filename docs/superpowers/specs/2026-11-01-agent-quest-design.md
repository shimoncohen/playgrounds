# Agent Quest (`agent-quest/`) design

Date: 2026-11-01. Status: approved design; chapters 1 to 23 are built. Issue: #51. Live mode is #52 and is not part of this spec.

## Goal

A new playground that teaches how to work well with AI coding agents: how the agent loop and the context window work, how to write a prompt, where memory, skills, MCP, hooks and subagents fit, how to keep an agent safe, and how to trim a setup that has grown too heavy. Same quest format as the others: chapters of missions with honest checks, quick-fire, field guide, XP and ranks.

Learners work against a **simulated agent**. They edit a small virtual project (files, `CLAUDE.md`, skills, MCP list, permission rules, hooks, subagents) and fill in a **structured prompt form**. A deterministic policy then "runs the agent" and produces an outcome the check can grade. Nothing calls a real model or the network.

Three paths share one engine: **core** (everyone), **dev** (working in a repo), **personal** (calendar, mail, notes, schedules). A fourth, **tune**, is about measuring and trimming a setup.

## Decisions

- **One playground, 23 chapters, four paths.** Core 7, dev 8, personal 5, tune 3. Paths are `Tiers`, not separate quests.
- **v1 is simulated only.** The Outcome comes from a deterministic policy, never from a model. A live provider (R5-live, R7, R9) is #52.
- **Closed prompt grammar over structured fields**, not free-text parsing. See "Simulator model".
- **Strict linear PR chain, 0 to 7.** Chapter order is merge order, so shipped mission keys never move.
- **Own small engine**, as Net Quest did. It stays DOM-free and loads as plain scripts in one global namespace.
- **No learner text is persisted.** Nothing a learner types reaches `localStorage`, the export or the linked backup file.
- **Dated content is visible, not enforced.** A registry of volatile facts with check dates and a render-time banner. No test fails on age.
- **Teaching-scale window and simplified config formats**, labelled as simulated, with links to the real docs.
- **Skills match the scenario's task tag.** A skill loads its body only when its `when:` equals the scenario `tag`. See "Skill matching".
- **Folder-level memory is simulated.** A `CLAUDE.md` inside a folder loads when the agent reads under that folder. Global memory and `AGENTS.md` are taught in text only. See "Folder memory".

## Scope

In scope: the engine, the UI, 23 chapters, quick-fire, field guide, ranks, tests and repo wiring, delivered as PRs 2 to 7.

Out of scope here:

- Live mode and any network call (#52). The CORS list and provider quirks belong there; this spec does not carry them.
- Real prices, real model names and real token counts. The meter is an estimate.
- Parsing real `CLAUDE.md`, skill, hook or MCP file formats exactly. The simulator uses simplified formats.

PR 1 (this spec and the plan) changes docs only. No `agent-quest/` code, landing, README, `smoke.mjs`, `package.json`, `ci.yml`, `pre-pr-check` or `AGENTS.md` edit lands in it.

## Delivery: the 8-PR chain

The chain is strict and linear: 0, 1, 2, 3, 4, 5, 6, 7. Each PR starts only after the one before it has merged.

| # | Ref | Title | Content | Depends on |
|---|---|---|---|---|
| 0 | #61 | `ci: allow the agent commit scope` | `agent` (and the missing `net`) in `commitlint.config.mjs`, `CONTRIBUTING.md` scope list. | none |
| 1 | #51 | `docs(agent): spec and plan` | This spec and the phase-1 plan, with the touchpoint list (R11). | 0 |
| 2 | #53 | `feat(agent): engine, UI shell, chapter 1` | `agent-quest/` scaffold, simulator, meter, chapter 1, `tests/agent/`, landing card, `tests/smoke.mjs` `NAMES`, README rows and count, `AGENTS.md` row. | 1 |
| 3 | #54 | `ci: wire agent-quest into checks` | `package.json` `test:engine` glob, `ci.yml` syntax-check globs, `pre-pr-check` glob, `AGENTS.md` command loop. | 2 |
| 4 | #55 | `feat(agent): core chapters 2-7` | Chapters 2 to 7. | 3 |
| 5 | #56 | `feat(agent): dev path (chapters 8-15)` | Chapters 8 to 15 and the engine additions they need (helpers, saved commands, after-edit hooks, tool connection, unattended runs, the default check). One PR, built in batches (engine first, then two chapters at a time). | 4 |
| 6 | #57 | `feat(agent): personal path (chapters 16-20)` | Chapters 16 to 20. | 5 |
| 7 | #58 | `feat(agent): setup optimization (chapters 21-23)` | Chapters 21 to 23. | 6 |

Notes:

- **Why the landing card is in PR 2.** `tests/smoke.mjs:15` (`NAMES`) and the landing-page check at `tests/smoke.mjs:58` tie the quest list to the cards on `index.html`. Adding one without the other fails the browser tests.
- **Test evidence for PR 2.** CI does not run `tests/agent/` until PR 3 wires the glob. PR 2's description must carry the local `node --test "tests/agent/*.test.mjs"` output. PR 3 merges right after PR 2 and PRs 4 to 7 cannot start before it, so every content PR is checked in CI.
- **Chapter order is merge order.** Saved progress is keyed `'<chapterIndex>.<missionIndex>'` (`net-quest/app.js:14`, `shared/tiers.js:36`). The index plan (core 0 to 6, dev 7 to 14, personal 15 to 19, tune 20 to 22) holds only under the strict order 5, 6, 7. After merge, chapters and missions are append-only. Issue #57 landed as two PRs. The first registered Schedules as index 15. The second appended 16 to 19. #58 (index 20 on) waits for the second, because a chapter merged in between would take index 16.
- **Conflict surface.** Open PR #45 edits `README.md` and `tests/smoke.mjs`; issues #46 to #50 may touch the same shared files (landing, README table and count, `smoke.mjs` `NAMES`) before PR 2 lands. PR 2 sets the README "all seven" count (`README.md:134`) at merge time. PR #45 does not edit `package.json` or `ci.yml` (checked 2026-11-01); PR 3's author rechecks after #45 merges.
- **`new-playground` skill vs `AGENTS.md`.** The skill's step list says "all in one PR" and includes CI scripts (`.claude/skills/new-playground/SKILL.md:10,20`), while `AGENTS.md` says CI changes go in a separate PR ("Where things go", last row). The chain resolves this: the commit scope is PR 0, the quest and its landing wiring are PR 2, and the CI wiring is PR 3. The skill itself is not edited here (follow-up issue #59).

## Layout

Mirrors `net-quest/`.

```
agent-quest/
  index.html  style.css  app.js        glue, tabs, state wiring
  ui.js  editor.js  meter.js           DOM files: render, file tree + prompt form, context meter
  engine/   tokens.js vfs.js config.js context.js policy.js permissions.js shell.js provider.js
  content/  tiers.js state.js model.js facts.js scenarios.js ch-01-loop.js ... ch-23-measure.js extras.js
tests/agent/  harness.mjs + tokens, config, context, policy, permissions, state, content, teach, codestyle tests
```

- `agent-quest/index.html` loads `shared/tiers.js` and `shared/how.js` by local tags, so it bundles (hard rule 2).
- `engine/` files are plain scripts attached to a root namespace, DOM-free, runnable in Node:
  - `tokens.js`: `estimate(text)` is `ceil(chars / 4)`.
  - `vfs.js`: the virtual project files.
  - `config.js`: parsers for the setup and the prompt grammar.
  - `context.js`: builds the context window from setup, prompt, files read and history.
  - `policy.js`: `run(scenario, setup, prompt) -> Outcome`.
  - `permissions.js`: permission rules and hooks.
  - `shell.js`: the scenario's command and tool table, called by the policy.
  - `provider.js`: the seam (below).
- `content/`:
  - `tiers.js`: the `Tiers.create` call.
  - `state.js`: pure `fresh`, `load`, `serialize`, `xpFor`. Net keeps these inside its DOM `app.js`, so they are not Node-testable there; Agent Quest splits them out so Node can test them.
  - `model.js`, `facts.js`, `scenarios.js`, the chapter files and `extras.js` (`RANKS`, quick-fire, guide).
- Progress key: `agent-quest-v1`. Never renamed.
- Script order in `index.html` is the order `tests/agent/harness.mjs` loads files; keep them in sync.

## Saved state

`agent-quest-v1` stores exactly `{ch, mi, done, xp, badges, best, tab}`.

- **Why `xp` is saved.** `shared/progress.js:44` treats a state as empty only when `d.xp === 0` and `done` is empty. That predicate feeds three behaviours: `hasProgress()` (`:45-49`), the "restore from the linked file when the browser has no progress" branches (`:188-192`, `:336-337`), and the "Replace the progress?" prompt (`:74-75`). A state without `xp` is never pristine. After storage is cleared, the fresh state written on load would count as progress, the linked backup would not be restored, and `writeNow()` would overwrite it with the empty state.
- **Single source of truth.** `xp` is recomputed on every load from `done` plus `badges` by `state.xpFor(done, badges)`, using `Tiers` `missionXp` and `chapterBadgeXp`. A stored `xp` that differs from the derived value is replaced. Net falls back per field in the same way (`net-quest/app.js:20-31`). The saved `xp` exists for `progress.js` and the landing page; it is never the authority.
- **Other keys.** `badges` is saved because `Tiers.status()` reads `S.badges` (`shared/tiers.js:37`) and it keeps a star if a mission is appended later (hard rule 4). `best` is the quick-fire best score. `tab` is one of `quest`, `fire`, `guide` only.
- **`answers` is deliberately left out.** Net saves up to 200 characters of learner text there (`net-quest/app.js:29`). Agent Quest stores no learner text, so nothing can leak into the export or the linked file.
- **Landing-card contract.** `index.html:127-135` shows `JSON.parse(raw).xp` and switches the card to "Continue →" only when `xp > 0`. The saved numeric `xp` is therefore the contract with the landing page. The card needs `data-key="agent-quest-v1"` and the `.xp` and `.go` elements, like the other cards.
- **Tests (`tests/agent/state.test.mjs`).**
  1. A fresh serialized state satisfies the pristine predicate copied from `shared/progress.js:44`; the test comment names that line.
  2. After one done mission, the serialized `xp` is a number greater than 0.
  3. A tampered `xp` is replaced by the derived value.
  4. The serialized key set equals the whitelist, so `answers` or any other key fails.
- **Smoke.** A PR 2 assertion checks that after a clean load the stored JSON has `xp === 0`.

Related follow-up (not in this chain): documenting the `pristine()` contract inside `shared/progress.js` is #60.

## Paths and rank

Reuse `Tiers.create` as Shell Quest does (`shell-quest/content/tiers.js:3-13`).

- `tiers` are `core`, `dev`, `personal`, `tune`. Each chapter carries `tier`; `missionXp` is a flat 10 for every tier.
- `tierEndRanks` is empty. `ranks()` then adds no tier-end rank (`shared/tiers.js:44-51`) and returns `baseRanks` alone.
- The ladder takes total XP from every path. Its thresholds are sized to finishing core: 33 missions at 10 XP plus 7 chapter badges at 25 XP is 505. Core alone reaches the top rank; the other paths only overflow it.
- `status()` and `renderRail` give per-path stars and counts. Nothing is locked.

## Simulator model

### Setup

A setup is a virtual file system plus parsed config:

- `CLAUDE.md`
- skill files
- an MCP list
- permission rules
- hooks
- a subagent list. Each subagent has a `model` of `small`, `standard` or `large`, with relative cost multipliers and no real prices.
- saved commands: each `.claude/commands/NAME.md` is a command named `NAME` (see "Commands").
- after-edit hooks: `after edit PATH run COMMAND` lines in `.claude/hooks.txt`, beside the `before VERB TARGET` lines (see "After hooks").
- allow rules: `allow VERB TARGET` lines in `.claude/permissions.txt`, beside `deny`. They only matter in an unattended scenario (see "Unattended runs").
- the default check: a `Done when: …` line in the root `CLAUDE.md` that parses (see "Default check").

Skill frontmatter has `name`, `description` and `when:` from a closed task-tag vocabulary (`bugfix`, `docs`, `review`, `test`, `release`, `refactor`, `schedule`), so "unused" and "duplicate" are structural facts, not guesses. Skills match the scenario's task tag.

Folder-level memory: a file named `CLAUDE.md` in a folder (for example `src/CLAUDE.md`) is part of the setup. It is read only once the agent reads a file under that folder.

#### Skill matching

- A skill whose `when:` equals the scenario `tag` is loaded: its body (the skill file without its `name`, `description`, `when` and `model` lines, wherever they appear) joins the context as a Skills segment labelled `Skill: <name>`, and body lines in the prompt grammar act as standing rules. A blocked action is skipped and logs no violation. Other body lines cost tokens only.
- A skill that does not match keeps only its `name: description` line in the context. Its body is not loaded and it has no rules.
- When two or more skills match, only the first by sorted path loads. Each other one is skipped with reason `duplicate` and its description still costs tokens. A second skill with an existing name is a setup error and is not added.
- The run records a `skill` step per matching skill, right after the context step: loaded, or not loaded for a duplicate. The first context step already counts the body tokens.
- A scenario with no `tag` ignores skills. Order is by sorted path, with no clock or random value.

#### Folder memory

- Only a file whose path is a folder followed by `CLAUDE.md` counts, at any depth. The root `CLAUDE.md`, `.claude/` paths, other case spellings and other names (including `AGENTS.md`) do not.
- It loads on the first successful `read` of a file under its folder. An edit does not load it. A folder file never loaded has no effect on the run.
- Once loaded it is a Memory segment labelled with its path, counted in `peak` and `total`. Its lines in the prompt grammar act as standing rules for all later actions, whatever their target. Other lines cost tokens only.
- A read file that is itself a loaded folder memory file is counted once, as memory, not as a read file.
- Setup size (for a `budget` mission) counts every folder memory file whether loaded or not, so moving bulk into one cannot dodge a budget.
- The learner can edit a folder memory file the scenario ships. Creating one the scenario does not ship has no effect.

#### Default check

- The first line of the root `CLAUDE.md` that reads `Done when: …` and parses is the default check. It is not an ignored line. Folder memory files and skill bodies never supply one.
- A run with no typed `Done when` (and none from a command) uses it. A typed `Done when` wins. A line that does not parse leaves the run `unverified`.
- It applies in every scenario, not only dev ones, so a core mission can now also pass by a `Done when` line in the root `CLAUDE.md` where the lesson allows it (3.3, 5.5 and 7.5 gain that route). The core answers are unaffected, and the core case tables (`tests/agent/content-core.test.mjs`) keep the 33 core missions' answers passing and their wrong and lazy inputs failing.
- The editor line for the root file reads `N lines act as rules, 1 acts as the default check, M other lines only cost tokens.`, or `no default check` when none parses. A folder file shows neither phrase.

#### Helpers

- A `Use` name that is a subagent is a helper. It reads in its own context, so what it reads counts in the run's `total` but never in `peak`.
- It applies only when the scenario has a non-empty `explore` list and a non-empty `focus` list and the prompt has no `Files` line. Then the `Use` helpers split `explore` into contiguous chunks, in `Use` order (the first `m mod n` chunks get one more file). Each chunk is read by its helper under the same rules as the agent (a blocked read is not read; a read matching `hidden` logs a violation). The agent then reads only `focus`.
- A `delegate` step records the helper, its model, its cost multiplier, the files read and their tokens. `over` is true when those tokens exceed the window, which the narration reports as a helper that lost track of some files.
- With a `Files` line the helpers read nothing, but each still costs. `AQ.helperCost(outcome)` sums the cost over every `delegate` step, so a mission can grade the price of the helpers it was given.
- Not simulated: helpers do not run at the same time and nothing gets faster; there is no clock.

#### Commands

- A file `.claude/commands/NAME.md` (NAME made of letters, digits, `_` and `-`) is a saved command. A name already used by a skill, subagent or MCP server is a setup error and the command is dropped.
- A `Use` name that is a command expands into the prompt. Its lines join the typed ones: `Files`, `Examples` and `Constraints` concatenate (typed lines first), `Plan` is on if either has it, and a typed `Goal` or `Done when` wins over the command's. A command's `Done when` beats the default check.
- A bad line in a command, or a `Use` line inside one, is shown as `Command NAME: …` and refuses the whole run.
- The run gets a `command` step after the context and skill steps and before the plan. The command text counts in the context.
- Not simulated: no arguments, and a command is merged text, not a skill the agent decides to load.

#### After hooks

- After each executed `edit`, every `after edit PATH run COMMAND` hook whose `PATH` covers the edited file runs `COMMAND` through the scenario's command table. A hook belongs to the harness, not the agent: it has no permission check, is not in `calls`, and its output counts in `total`. A `hook` step records the result.
- A failed hook is repaired by the scenario's `correction`, up to the step cap, and the hook runs again. A repair edit fires no hooks, so this cannot recurse. A hook whose command the scenario does not know fails with a reason and is not repaired.
- With no `Done when` (typed or default), the run's status is `done` when the last run of every hook passed, else `failed`. With one, the check decides.
- Not simulated: exit codes and hook output beyond pass or fail.

#### Unattended runs

- A scenario with `unattended: true` has nobody to approve anything. `Plan: first` stalls: the run pushes a `stall` step after the context, skill and command steps, ends `blocked`, and shows no Approve button.
- A non-`read` action is skipped with reason `no one to ask` unless an `allow VERB TARGET` line covers it. This includes the `Done when` check. `allow` has no effect in an attended scenario, and `deny`, constraints and hooks still win over it.
- Not simulated: no runner, secrets or exit codes. Nothing fires on a clock: a line in `.claude/schedule.txt` is read, and the Run button plays the moment it starts the job (see "Schedules").

#### Schedules

- A scenario with `scheduled: true` is started by a schedule line, not by the learner. `.claude/schedule.txt` has one line per start, `WHEN HH:MM use NAME`: `WHEN` is `daily`, `weekdays` or a day name (`monday` to `sunday`), `HH:MM` has two digits each (`00:00` to `23:59`), and `NAME` is a saved command. Matching ignores case. Comment lines (`#`) and blank lines are skipped. A command dropped for a name clash is not a saved command.
- A line that does not parse is an entry in `setup.errors` with the file `.claude/schedule.txt` and a message of its own for a bad `WHEN`, a bad time, a name that is not a saved command, and a line that is not `WHEN HH:MM use NAME`. It has no effect. A good line becomes `{line, day, days, at, use}` in `setup.schedule`, with `days` the three-letter days it covers (`weekdays` is Monday to Friday, `daily` is all seven).
- `fired(scenario, setup, prompt)` is `null` unless the scenario is `scheduled`. Otherwise it is `{entry, due}`: the first line whose `NAME` the prompt uses, and the union of the days of all such lines (the runs per week). It is `null` again when no line matches.
- A fired run is unattended (the rules above apply) and carries the task tag `schedule` unless the scenario has a `tag`. The run starts with a `fire` step, `{entry, due, why?}`, where `why` is the first `.claude/schedule.txt` error, shown with or without a match. When no line starts the job, the run ends `blocked` with only that step.
- `AQ.weekTokens(outcome)` is the run's `tokens.total` times the number of days in the `fire` step's `due` (once, without a `fire` step).
- Not simulated: no clock, no missed runs, no time zones; the time is not graded.

Two shorthands of this simulator are not what real tools do. A `*` in an `edit`, `read` or `delete` target of a rule (`Constraints`, the root `CLAUDE.md`, `permissions.txt`, `hooks.txt`) stands for any text, `/` included, and has to match at least one file. `file#section` in a `read` target (`Files`, `Examples`, `Done when: read`) reads the part of a file from a heading to the next heading of the same or a higher level, with the heading lowercased and runs of other characters turned into `-`. Real agents read a range of lines, not an anchor.

#### Tool connection

- A scenario with `connected: true` skips a `call` with reason `not connected` unless a setup MCP server provides the tool: the target equals the server name or `server.tool`. A permission rule still shows first, and a missing file the call needs is reported before the connection. `Done when: call X` follows the same path and then ends `unverified`.
- Skip reasons show as words in the Run panel and in the narration: `not seen yet` (the agent has not read what it needs yet), `not connected` (the tool is not connected), `no one to ask` (nobody is there to approve it). A skip by a hook or a permission rule reads "a hook does not allow it" or "a permission rule does not allow it".
- Not simulated: no server startup, auth, schema or real tool discovery; `connected` is a list match.

### Prompt model

A closed grammar over structured fields. It is not free-text parsing (see Alternatives).

| Field | Meaning |
|---|---|
| `Goal` | Free text, context only. |
| `Files` | Virtual paths. Each must resolve. They scope what the agent reads. |
| `Examples` | Paths of sample outputs. Each must resolve. The scenario's `style()` extracts a format from each file deterministically (for example a line-prefix pattern), and the policy's formatting action uses it. |
| `Use` | Names that exist in the setup: a skill, an MCP server or tool, a subagent (a helper, see "Helpers") or a saved command (see "Commands"). Shown from chapter 10. |
| `Plan` | `first` or off. |
| `Constraints` | One rule per line. |
| `Done when` | One line. |
| `Extra` | Free text, context only. |

Grammar:

- constraint := (`do not` | `only` | `ask before`) VERB TARGET, or `max` N `files`.
- VERB is one of `edit`, `read`, `run`, `call`, `send`, `delete`.
- TARGET is a path prefix, a command or a tool name, and must resolve against the scenario.
- doneWhen := (`run` CMD | `read` PATH | `call` TOOL): a verification action the agent will perform.

Lines that do not parse, or whose target does not resolve, show an inline error, and the agent does not run until every line parses; a setup file line that does not parse (`permissions.txt`, `hooks.txt`, `mcp.txt`, `schedule.txt`, a skill, an agent or a command file) is listed the same way with its file name, and refuses the run too (a skill or agent file emptied to nothing counts as removed, not as malformed); a refused run is never a pass and changes no state. The UI says: "Real agents read natural language. The simulator acts only on these lines so checks are exact." `CLAUDE.md` lines in the same grammar act as standing constraints. A `Done when:` line in the root `CLAUDE.md` is the default check (see "Default check"). Other lines cost tokens only.

**`Use` expansion.** Before the lines are parsed, each `Use` name that is a saved command is expanded: the command's lines are split into fields like a typed prompt and merged in (see "Commands"). A name that is a helper starts a delegated search (see "Helpers"). Either way, the `Use` name must exist in the setup, or the line is an inline error and the run is refused.

### Scenario

`{vfs, tools, task, script, hidden, accept}`, plus optional `tag`, `style`, `history`, `explore`, `focus`, `unattended`, `connected`, `scheduled` and `toolFns`:

- `script`: the ordered actions the policy would take (reads, edits, tool calls, verifications), including the trap action.
- `hidden`: the scenario's hidden forbidden set, a list of `{verb, target}` pairs, for example an edit under `migrations/` or a call to `mail.send`. It exists independent of what the learner wrote and alone decides which executed actions log a violation.
- `accept(outcome)`: a predicate set over the final vfs, the call log, and optionally `tokens.peak`.
- `tag` (optional): the task tag, one of the closed vocabulary. Skills match against it. A scenario with no `tag` has no skill effect.
- `style(text)` (optional): extracts a format string from a sample file. For each `Examples` path, in prompt order, the policy calls it on the file text; a scripted `edit` whose `write` is a function receives `write(vfs, styles)`.
- `history` (optional): an array of earlier chat messages, held in context ahead of the prompt and dropped oldest first on overflow.
- `explore` (optional): the files an agent with no `Files` line reads before it acts.
- `focus` (optional): the part of `explore` that matters. With it, `Use` helpers take the search and the agent reads only `focus` (see "Helpers").
- `unattended` (optional): nobody is there to approve. `Plan` stalls and a non-`read` action needs an `allow` line (see "Unattended runs").
- `connected` (optional): a `call` needs a setup MCP server that provides the tool (see "Tool connection").
- `scheduled` (optional): a schedule line must start the run (see "Schedules").
- `toolFns` (optional): `{ 'server.tool': vfs => ({ok, out}) }`, a real effect and result for a `call`, like `commands` for a `run`. The function gets the run's copy of the files. A `Done when: call X` whose function returns `ok: false` ends `failed`, whether or not a script action ran.

### Policy

`run(scenario, setup, prompt) -> Outcome` is deterministic and sits outside the provider seam.

0. In a `scheduled` scenario, push the `fire` step first. If no schedule line starts the job, stop as `blocked` (see "Schedules").
1. Build the context.
2. If `Plan: first`, emit a plan step and stop with status `awaiting-approval`; nothing executes. The learner's "Approve plan" continues the same run from step 3, and only that result is graded. In an unattended scenario the run instead pushes a `stall` step and stops as `blocked` (see "Unattended runs").
3. Load the matching skill, if the scenario has a `tag` (see "Skill matching"). Its steps come right after the context step and before the plan; a `command` step for each expanded saved command follows the skill steps.
4. Delegate: each `Use` helper reads its share of the search in its own context and pushes a `delegate` step (see "Helpers"). The agent then reads its scope: the `Files` line, else `focus` when helpers took the search, else `explore`.
5. Walk `script`. A successful `read` under a folder that has a `CLAUDE.md` loads that file (see "Folder memory"). For each action:
   - if a learner constraint, a standing `CLAUDE.md` rule, a skill rule or a permission blocks it, the action is **skipped and logs no violation**;
   - otherwise it executes, and if it matches `hidden`, a violation is logged. A skip carries its reason: a rule, `no one to ask`, `not seen yet` or `not connected`;
   - after an executed edit, the matching after-edit hooks run and push `hook` steps (see "After hooks").
6. Run the verification if there is one: the typed `Done when`, else the command's, else the default check.
7. If verification fails, apply the scenario's correction step and re-verify, up to a step cap.
8. If there is no verification, stop as `unverified`, except that a run with after-edit hooks and no `Done when` is `done` when every hook's last run passed. A run that ends `unverified` with a non-empty script in which every action was skipped is `blocked`; a run whose check ran keeps its `done` or `failed`.

### Outcome

`{status: done|unverified|failed|blocked|awaiting-approval, vfs, calls[], steps[], violations[], tokens{peak,total}}`.

A step has a `type` from `context`, `skill`, `command`, `plan`, `approved`, `delegate`, `act`, `skip`, `hook`, `stall` and `fire` (`AQ.policy.STEP_TYPES`). Each type needs its own narration in the provider, a tag and a description in the Run panel, and a test asserts all three.

A mission passes when `status` is not `failed` or `awaiting-approval`, `violations` is empty, and `accept(outcome)` holds. A skipped required action fails `accept` but is not a violation. `unverified` fails only in missions that teach verification.

### Overflow

When the window overflows, the oldest `history` segments drop, so a constraint stated only in chat can be forgotten.

### Provider seam

- The Outcome comes from the policy. The provider never produces it.
- `complete(messages, opts) -> {text, usage:{in,out}}`. `SimProvider` returns canned step narration plus an estimated `usage` from `tokens.js`.
- The run view and the meter read `usage`. The meter also reads the static breakdown from the context builder.
- A live provider would replace only `SimProvider`, and its output would be a non-graded demo (#52). Check code never calls the provider.

### Meter

A segmented bar with a text table of the same segments, pattern fills (no colour-only meaning), `role="meter"`, and the label "~N of M tokens (estimate, chars/4)". The window is teaching scale and labelled as simulated. A folder-level `CLAUDE.md` appears as a Memory segment once the agent has read under its folder, and a loaded skill body appears as a Skills segment labelled `Skill: <name>`.

## Missions and checks

Four check kinds: `prompt`, `config`, `budget` and `choose` (quick-fire only). A `budget` mission needs the setup total at or below N and `accept` still holding, so deleting everything fails.

Every mission carries `answer`, `wrong` and `lazy`. The solvability test requires the answer to pass and the other two to fail. Answers are computed by the sim, never hardcoded. Mission shape otherwise follows the other quests (goal, `how`, hint, explain), plus a `scenario` name.

### Worked missions

**Constraint mission (repo).** Task: fix the rounding bug in `src/price.js`. `hidden` is an edit under `migrations/`.

- Answer: `Constraints: do not edit migrations/` and `Done when: run npm test`. The forbidden edit is skipped with no violation, tests run, the correction step fixes the first bad edit, and the mission passes.
- Wrong (parses, wrong rule): `do not edit src/`. It blocks the real fix, so `accept` fails and the status is `failed`.
- Lazy: `Constraints: be careful and don't break anything`. It does not parse, so the run is refused with an inline error and the mission fails.
- Lazy 2: `do not edit nonexistent/`. The target does not resolve, so the line is rejected and the run is refused.

**Personal MCP missions (chapter 19).** Three config missions on `connected` scenarios, graded on connect, deny and read-back. Times and titles are not graded, because a tool call logs only `{verb,target}`.

- 19.1 `notesApp` connects the notes tools the job calls.
- 19.2 `inboxApp` reads the mail and never sends it, either by leaving `send` unconnected or with `deny call mail.send`.
- 19.3 `agenda` proves a write: read the note, create the event, check with `call calendar.list`. `accept` needs `calendar.create` made, and the run ends `done` only if the read-back found the event.

**Chapter 3 prompt-structure missions.** Each changes the run.

- *Examples.* Task: write a changelog entry. The `script` has a formatting action driven by `style()` over `Examples`.
  - Answer: `Examples: docs/changelog-sample.md`. The entry matches the project format.
  - Wrong: `Examples: docs/old-notes.md`. It resolves but yields a different format.
  - Lazy: `Examples: see above`. It does not resolve, so the run is refused and the mission fails.
- *Specific versus general (scope).* Task: a fix in `src/price.js`. `accept` needs the fix applied and `tokens.peak` within a budget.
  - Answer: `Files: src/price.js`. One read, low peak, fix applied.
  - Wrong, too broad: `Files: src/`. Every file under `src/` is read, the peak exceeds the budget.
  - Wrong, too narrow: `Files: src/util.js`. The wrong file is read and the fix is not applied.
  - Lazy: no `Files`. The agent explores widely and the peak exceeds the budget.
- *When not to be specific.* The fix spans `src/price.js` and `src/tax.js`; the learner is not told.
  - Answer: `Constraints: do not edit migrations/` with no file restriction, and `Done when: run npm test`. The tests reveal the second file and the correction step fixes it.
  - Wrong: `Constraints: only edit src/price.js`. It parses but blocks the second edit.
  - Lazy: no `Done when`. The status is `unverified` and `tax.js` is not fixed.
- *Plan first.* `Plan: first` produces a plan step before any edit.
  - Accept: a plan step exists, no edit precedes it, and the plan names the files the scenario expects.
  - Lazy: the `Plan` field left off. An edit occurs with no plan step.

## Requirement map

Chapter numbers are 1-based; the array index is the number minus 1.

| Requirement or issue bullet | Where it lands in v1 |
|---|---|
| R1 loop; context window; tokens and cost | Ch 1, 2 |
| R1 model choice | Ch 2 `choose` (quick-fire: which model size for which task) plus a cost-multiplier mission; ch 23 |
| R1 prompt structure; examples; plan first; specific vs general | Ch 3: the four missions above, each with a defined `accept`. None is `choose`-only |
| R1 memory (`CLAUDE.md`/`AGENTS.md`: global, project, folder; short) | Ch 4: project and folder-level `CLAUDE.md` are simulated; global memory and `AGENTS.md` are text and quick-fire only |
| R1 skills, MCP, plugins, hooks, subagents; which to reach for | Ch 5 (skills with `when:` matching, MCP), ch 6 (hooks, plugins, subagents; the "which mechanism" chooser is `choose`-only) |
| R1 safety: permissions, injection, secrets, review before run | Ch 7 |
| R2 explore, plan, implement | Ch 8. Not simulated: no mode switching; `Plan: first` models "show the plan", with no separate explore, plan and edit modes |
| R2 test, review, PR | Ch 9. Not simulated: no human review and no CI; the PR is a virtual file. "Review" is covered only as "the PR is where the change waits for review"; branch protection and merge are not modelled |
| R2 subagents, parallel work, worktrees | Ch 10 (helpers, see "Helpers"). Not simulated: parallel speed-up and worktree isolation are text, quick-fire and the 10.3 explanation only; there is no clock and there are no concurrent agents |
| R2 hooks for lint, format, guards | Ch 11 (see "After hooks"). Not simulated: hooks are config lines mapped to scripted commands; no exit codes or hook output are used beyond pass or fail |
| R2 custom slash commands, repo skills | Ch 12 (see "Commands"). Not simulated: no command arguments; commands are merged text, not skills the agent decides to load; repo skills are text only |
| R2 MCP for trackers, docs, browsers | Ch 13 (see "Tool connection"). Not simulated: no server startup, auth, schema or real tool discovery; `connected` is a list match |
| R2 CI and headless | Ch 14 (see "Unattended runs"). Not simulated: no runner, secrets, exit codes or clock (a schedule line is read and played once; see "Schedules"); `unattended` only blocks `Plan` and non-`read` actions without an `allow` line |
| R2 writing a project `CLAUDE.md` | Ch 15 (see "Default check"). Not simulated: only the root `CLAUDE.md` supplies the check; global memory, `AGENTS.md`, imports and `/init` stay text |
| R3 writing and research | Ch 17 |
| R3 files and documents | Ch 18 |
| R3 scheduled tasks and reminders | Ch 16, the first personal chapter, shipped first (artifact is a line `WHEN HH:MM use NAME` in `.claude/schedule.txt`) |
| R3 personal MCP: mail, calendar, notes | Ch 19 |
| R3 small personal skills and commands | Ch 20 |
| R4 audit what is loaded | Ch 21 |
| R4 trim and dedupe; rare instructions into on-demand skills | Ch 22 |
| R4 measure before and after; cheaper models for simple subagent work | Ch 23 |
| R5 simulated | All chapters |
| R5 live optional | **Deferred to #52** |
| R6 context meter | Ch 2 on, with before/after in ch 23 |
| R7 key safety | **Deferred to #52** (no key exists in v1). The saved-state whitelist test already protects the export |
| R8 graded on input | All missions via the Outcome |
| R9 tokens per live call | **Deferred to #52**. v1 shows simulated per-step `usage`, labelled as estimates |
| R10 dated content | `facts.js`, the footer banner, doc links per chapter |
| R11 spec and plan first | PR 1 (this spec and the plan) |
| R12 tests; desktop and 390px | `tests/agent/`, and a playtest at both sizes in each content PR |
| R13 wiring | PR 2 and PR 3 (touchpoint list below) |
| R14 repo constraints | Layout above |

Total: 23 chapters, core 7, dev 8, personal 5, tune 3.

## Dated content

Agent tooling changes fast. `facts.js` is a registry of `{id, text, docUrl, checked}` for volatile claims; `checked` is an ISO date. Chapters reference facts by id.

- A test checks every fact has an https `docUrl` and an ISO date, and that every id used by a chapter exists. It does not fail on age.
- The footer shows the oldest `checked` date and adds "may be out of date" after 90 days, computed at render time.
- Every volatile claim in this spec is dated; none is stated as timeless.

## `how` steps

`how` stays an array of HTML strings, as `HowSteps.html` requires (`shared/how.js:2,8`). Each string names its part in `<code>` and says what it means. `how[0]` says what the whole prompt or configuration does and contains `<code>`. The content test follows `tests/net/content.test.mjs:46-49`: three to five steps, `how[0]` has a `<code>` element, and it is longer than 20 characters in plain text. There is no `{part, means}` object form.

## UI

The page follows what `tests/smoke.mjs:96-147` checks for every `NAMES` entry.

- **Tabs.** `.tabs button[data-tab]` has exactly three buttons: `quest`, `fire`, `guide`. They switch `section#tab-quest`, `section#tab-fire` and `section#tab-guide`, and only one is visible at 1280px. The saved `tab` is limited to these three values.
- **Quest tab.** `section#tab-quest` holds the rail, the mission column and the map column.
  - `#chapters` is the `Tiers.renderRail` container, with `overflow-y: auto` and a height of at most 420px.
  - `.missionCol` is the mission column and contains `#mission` (the mission card, with the prompt form and `how` steps). At 1440×800 and 1000×700 it is `position: sticky`, with `overflow-y: visible` on the column and `overflow-y: auto` on `#mission`; its bottom stays within the window. At 390px it is `static`.
  - `.mapCol` is the right column with three panels, each `.mapCol .panel`: Files (the tree and editor), Meter (bar and table) and Run (steps and Outcome). Each has `overflow-y: auto` and `max-height` of at most 800px, copying Net's CSS values, so the `.mapCol .panel` check passes whichever panel `querySelector` returns first.
- **390px pane switcher.** At 390px the quest tab shows one pane at a time. The switcher is `.paneSwitch button[data-pane]` with the values `mission`, `files`, `meter`, `run`. It is not `.tabs`, and the panes are not `section[id^="tab-"]`. The switcher is hidden at 721px and wider, where all columns show. Pane state is not saved. `mission` is the default pane, so `#mission` has content on first load.
- **Meter strip.** A compact `.meterStrip` stays at the top at 390px. It is not a `.panel`.
- **No horizontal overflow** at 390px.
- **Accessibility.** The meter has a text table equivalent; the file tree and run steps are keyboard-navigable lists; no meaning is colour-only.
- **To verify in PR 2:** the 1000×700 layout meeting the sticky check (this spec cannot show it), and a playtest at 390, 1000 and 1440 confirming all three layouts.

## Testing

Node (`tests/agent/`, part of `npm run test:engine` once PR 3 wires the glob):

- `tokens`, `config` (grammar accept and reject), `context`, `policy` (skip versus violation, correction step, step cap, `unverified`), `permissions`
- `config` also covers skill matching (`skillBody`, `skillIssues`, `loadedSkills`, duplicate names) and folder memory (the path pattern, `memoryFolders`, `folderMemory`); `context` covers the `Skill:` segment, folder memory segments, the counted-once rule and `setupTokens`; `policy` covers a matching, non-matching, duplicate and untagged skill, folder memory loading on read and not on edit, `style()`, `history` and step order; `shell` covers `write(vfs, styles)`; `provider` covers the `skill` narration
- the dev engine (`devengine.test.mjs`): the default check, after hooks (repair, no recursion, cap, a missing command), connected tools, unattended runs, helpers (the split, `peak` versus `total`, `over`, `helperCost`), saved commands (merge rules, errors, name clashes) and determinism; `config`, `permissions` and `provider` gain cases for `allow`, `hasTool`, command parsing and the skip wording; `registry.test.mjs` asserts that every step type has narration, a `ui.js` tag and a `describe` branch
- `state`: the four tests in "Saved state"
- `content`: unique keys, `how` shape, `answer` passes, `wrong` and `lazy` fail, scenario exists, `facts` well-formed
- `content-core` (the guard for the core path) and `content-dev`: every shipped core mission keeps its answer passing and its wrong and lazy inputs failing, with `pass`, `fail` and `refused` case tables and probe rows that show the engine additions did not open a new way through a core mission. `content-dev` freezes the dev chapters (eight chapters of three missions, indexes 7 to 14) and checks each dev mission's case table, including a bypass probe that moves the answer's rules into the root `CLAUDE.md` without the chapter's own mechanism, which must fail; shared helpers are in `cases.mjs`
- `teach`: every term a mission relies on was taught earlier on the default path or is defined in place (hard rule 12)
- `codestyle`: learner text uses `<code>` for commands, fields and paths; copy the shell rules the same way `tests/net/codestyle.test.mjs:4-6` does (importing `tests/shell/codestyle.test.mjs` would run the Shell Quest tests too) and add the agent field names and commands

Browser: `agent` in `tests/smoke.mjs` `NAMES` (loads cleanly, tabs, scroll and sticky checks, progress export and import) plus the `xp === 0` after clean load assertion. The dev path adds three checks: the rail shows 23 chapters, `Use` is on the form from 10.1, and the editor counter for the root `CLAUDE.md` reads `1 acts as the default check` for `Done when: run npm test`, `no default check` for a line that does not parse (the 15.2 start state), and neither phrase for a folder `CLAUDE.md`.

Other gates: `python3 tools/build.py --check` bundles (no `</script` or `</style` in inlined files). Checked in PR 2: `tools/build.py` discovers `agent-quest/` without a list edit (`tools/build.py:43`, `ROOT.glob("*-quest")`).

## Wiring: touchpoints (R11)

| Touchpoint | PR | Needed |
|---|---|---|
| `agent-quest/` folder, `window.PROGRESS` key `agent-quest-v1` | 2 | yes |
| Landing card in `index.html` with `data-key`, `.xp`, `.go` | 2 | yes |
| `tests/smoke.mjs:15` `NAMES` | 2 | yes |
| README table row (after `README.md:17`) | 2 | yes |
| README "Map of the repo" entry for `agent-quest/` (`README.md:102-117`) | 2 | yes |
| README `tests/` line gains `agent/` (`README.md:112`), once `test:engine` runs it | 3 | yes |
| README count "all seven" (`README.md:134`) | 2 | yes, set at merge time |
| `AGENTS.md` "Where things go" row and "What this is" list | 2 | yes |
| `package.json:13` `test:engine` gains `tests/agent/*.test.mjs` | 3 | yes |
| `.github/workflows/ci.yml:32`: `*/app.js` already matches `agent-quest/app.js`; add `agent-quest/*.js`, `agent-quest/engine/*.js`, `agent-quest/content/*.js`, `tests/agent/*.mjs` | 3 | yes |
| `.claude/skills/pre-pr-check/SKILL.md:11` syntax loop | 3 | yes; the sandbox may deny agent writes under `.claude/skills`, so the user may need to make this edit |
| `AGENTS.md:17` command loop | 3 | yes |
| `tests/fixtures/*.js` missing from the `AGENTS.md:17` and `pre-pr-check` loops (`ci.yml:32` has it) | 3 | yes, added since PR 3 edits those lines anyway |
| `tools/build.py` | none | not expected (discovers `*-quest/`); verify in PR 2 |
| `CHANGELOG.md`, version | none | never (release-please) |
| `.github/workflows/commitlint.yml`, `.husky/commit-msg` | 0 | no edit: both read `commitlint.config.mjs` |

Findings recorded in tickets rather than fixed here: the `new-playground` skill conflict and its missing globs (#59), and the `pristine()` contract docs (#60).

## Alternatives

**Paths**

| Option | Verdict |
|---|---|
| **A. `Tiers` with tiers as paths, empty `tierEndRanks`, core-sized `baseRanks`** | Reuses `create`, `status` and `renderRail`. Chosen. |
| B. Own rail grouped by tag | About 60 lines duplicating `renderRail` and `status`. Rejected. |
| C. Separate quest per path | Duplicates the engine and splits the shared core. Rejected. |

**Saved XP**

| Option | Verdict |
|---|---|
| **A. Save `xp`, recompute and check on load from `done` plus `badges`** | One authority; `progress.js:44` and the landing card work. Chosen. |
| B. Derive XP only, never save | Breaks `pristine()` (`shared/progress.js:44`), restore (`:188-192`, `:336-337`), the replace prompt (`:75`) and the landing card (`index.html:127-135`). Rejected. |
| C. Save `xp` and trust it, like Net | Drifts when mission counts change; Net needs a recompute fallback (`net-quest/app.js:25`). Rejected. |

**Prompt model**

| Option | Verdict |
|---|---|
| **A. Structured fields with a closed grammar** | Exact checks and an honest failure reason. Teaches a form, not prose. Chosen. |
| B. Keyword or regex over free text | The output-only cheat in `docs/tiers-guideline.md:258,263`. Rejected. |
| C. Per-scenario multiple choice | Safe, but the learner writes nothing. Fails the "write" skills. Rejected. |

**Merge order:** strict chain (chosen); parallel PRs with indices assigned at merge (risks renumbering shipped missions, hard rule 4); path-keyed state (departs from `shared/tiers.js:36` and every other quest).

**Free-text persistence:** never persist (chosen); persist with a scrubber (fragile, gains only draft recovery); persist raw (exports learner text, rejected).

**Date stamp:** registry plus render-time banner with a malformed-fact test (chosen); a test that fails after N days (turns CI red on unrelated PRs); a scheduled issue Action (a fine follow-up, but CI work for a separate `ci:` PR).

**Commit scope:** PR 0 `ci:` scope first (chosen); a docs PR as `docs(docs)` and the scope later (the subject misrepresents its area).

## Diagram

```mermaid
flowchart LR
  subgraph UI["Browser UI (DOM)"]
    ED["editor.js: file tree + prompt form"]
    MT["meter.js: bar + table"]
    RV["run view: steps + outcome"]
    RAIL["Tiers.renderRail: paths"]
  end
  subgraph ENG["engine/ (DOM-free)"]
    VFS["vfs + config + prompt grammar"]
    CTX["context builder"]
    POL["policy.run -> Outcome"]
    PERM["permissions + hooks"]
    SH["shell.js: command + tool table"]
    TOK["tokens: chars/4 estimate"]
    OUT["Outcome: status, vfs, calls, violations"]
    PROV["provider seam: SimProvider"]
  end
  subgraph CON["content/"]
    SC["scenarios: script + hidden + accept"]
    CH["chapters, missions, answer/wrong/lazy"]
    FA["facts.js: docUrl + checked date"]
    TI["tiers.js: core, dev, personal, tune"]
    ST["state.js: fresh, load, serialize, xpFor"]
  end
  ED --> VFS --> CTX
  TOK --> CTX
  CTX -->|static breakdown| MT
  SC --> SH
  SH --> POL
  SC --> POL
  CTX --> POL
  POL --> PERM
  POL --> OUT
  POL -->|messages| PROV
  PROV -->|usage + narration| RV
  PROV -->|usage per call| MT
  OUT --> RV
  OUT --> CHK{"mission check: accept(Outcome)"}
  CH --> CHK
  CHK --> ST
  ST --> PS["progress.js: agent-quest-v1, keys ch mi done xp badges best tab"]
  PS -->|xp > 0| LAND["landing card: XP + Continue"]
  TI --> RAIL
  TI --> ST
  PS --> RAIL
  FA -.-> CH
  PROV -. "live provider (#52), not v1" .-> LIVE["live provider (not graded)"]
```

## Risks

- **Effort.** 23 chapters at about 4 to 5 missions each is the largest quest in the repo. Engine plus chapter 1 is about a week; each content PR is a few days. Merge order is the cut order, so a stopped chain still leaves a coherent shorter quest.
- **Grammar versus prose.** The learner writes grammar lines, not natural language. The UI says so, but it is a modelling choice.
- **Scenario authoring.** Each scenario needs a hand-written `script`, `hidden` and `accept`; a wrong `hidden` makes a mission pass or fail for the wrong reason. A wrong or missing `tag` silently turns skill matching off, so a scenario test checks every `tag` is in the closed vocabulary. `review-mission` is mandatory per content PR.
- **Memory scope.** User-level (global) memory and `AGENTS.md` are taught in text and quick-fire only. The simulator reads the root `CLAUDE.md` and folder-level `CLAUDE.md` files, nothing else.
- **`xp` recompute.** If `xpFor` and the rank thresholds drift apart, the landing card and the in-app rank could disagree. The `state` tests cover the derivation, not the thresholds.
- **Staleness.** Visible through the banner, not refreshed automatically.
- **Shared-file conflicts.** #45 and #46 to #50 may touch `smoke.mjs`, the landing page and the README before PR 2. The README "all seven" count will be wrong again if they land in between; PR 2 sets it at merge time.
- **Seam.** A contract only. A real live provider may need streaming (#52).
- **Serial work.** The strict chain makes PR 3 a bottleneck between PRs 2 and 4.
- **Teaching-scale window.** Numbers do not match real models; the UI labels them as simulated.
- `tools/build.py` quest discovery is checked (`tools/build.py:43`, `ROOT.glob("*-quest")`). **To verify in PR 2:** the 1000×700 sticky layout. PR 3 reads the `pre-pr-check` glob itself when it edits that line.

## Open questions (closed)

All answered with the suggested option.

- **Q3, learner free text:** never persist.
- **Q4, paths:** `Tiers` with tiers as paths, a core-sized ladder, path stars.
- **Q5, commit scope:** a `ci:` PR (0) first.
- **Q6, date stamp:** registry plus render-time banner, no age-failing test.
- **Q-N1, window scale:** teaching scale.
- **Q-N2, setup schema:** simplified, with doc links.
- **Q-N3, scope:** all 23 chapters in the strict chain, cut by PR if needed.
- **Q-N4, live mode:** answered by #52.
- **Q-N5, prompt form:** closed grammar over structured fields.
- **Where `.claude/skills/pre-pr-check` is edited** (PR 3): by the user if the sandbox denies the agent.

## Roadmap (separate specs and plans)

- **#52 live mode:** an optional non-graded provider, key safety, per-call token display (R5-live, R7, R9), with the provider and CORS details.
- Playground follow-ups #59 (skills fix) and #60 (`pristine()` docs) are independent of the chain.
