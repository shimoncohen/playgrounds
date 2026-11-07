# AGENTS.md

Rules of the repo for coding agents (Claude Code, Codex, Copilot, ...) and for humans. Read this first; [CONTRIBUTING.md](CONTRIBUTING.md) has the PR workflow, [docs/tiers-guideline.md](docs/tiers-guideline.md) has the mission-authoring detail.

## What this is

Playgrounds: static, no-build, in-browser learning quests in two sections. Programming (`programming/index.html` hub, one folder per quest: `programming/script-quest/`, `programming/python-quest/`, `programming/cpp-quest/`, `programming/shell-quest/`, `programming/harbor-quest/`, `programming/ds-quest/`, `programming/net-quest/`, `programming/agent-quest/`, `programming/rust-quest/`) and Math (`math/`: a hub plus one page per track, `arithmetic/`, `algebra/`, `geometry/`, `trigonometry/`, sharing `track.js`) plus a landing page (`index.html`, one card per section) and `shared/` code. Shell Quest is the reference implementation (a DOM-free engine in `programming/shell-quest/engine/`, course content in `programming/shell-quest/content/`).

## Commands

```
npm ci && npx playwright install chromium   # once
npm run check          # every quest folder and math/ bundle for claude.ai artifacts
npm run test:engine    # Node-only engine + content tests (fast, run often)
npm run test:browser   # Playwright smoke + golden tests (about 3 minutes)
npm test               # both
for f in */app.js programming/*/app.js math/*.js math/scene/*.js math/input/*.js math/*/app.js math/*/content.js programming/ds-quest/*.js programming/shell-quest/*.js programming/shell-quest/engine/*.js programming/shell-quest/content/*.js shared/*.js tests/*.mjs tests/shell/*.mjs tests/ds/*.mjs programming/net-quest/*.js programming/net-quest/engine/*.js programming/net-quest/content/*.js tests/net/*.mjs tests/python/*.mjs tests/script/*.mjs tests/cpp/*.mjs tests/harbor/*.mjs programming/rust-quest/*.js programming/rust-quest/engine/*.js programming/rust-quest/content/*.js tests/rust/*.mjs tests/math/*.mjs programming/agent-quest/*.js programming/agent-quest/engine/*.js programming/agent-quest/content/*.js tests/agent/*.mjs tests/trophy/*.mjs; do node --check "$f" || break; done
```

CI runs the tests for the parts a PR changes (`tools/ci-plan.mjs`) and all of them on `main`. A PR is not ready until they all pass locally.

## Hard rules

1. **No build step, no framework, no new runtime dependency (dev tooling such as commitlint is fine; the libraries vendored under `math/vendor/` by `tools/vendor-math.sh` are the one approved exception).** Plain browser scripts. Pages must work opened from disk and served by GitHub Pages. Fonts and `acorn`/`typescript` come from CDNs; do not add more without an issue.
2. **Must bundle.** `tools/build.py` inlines local `style.css`/`app.js`/`shared/*` into one body-only file. Local assets must be referenced as `<script src="...">` / `<link rel="stylesheet" href="...">` with relative paths, and an inlined file must not contain `</script` or `</style`.
3. **Never regenerate fixtures to make a test pass.** `tests/fixtures/` (golden transcript, corpus 1 and 2) record what old content did. If one fails, your code is wrong. A deliberate change to old behaviour is its own reviewed decision; see the "differential guards" part of the guideline.
4. **Saved progress must keep working.** Never rename a `localStorage` key (`<name>-quest-v1`), never renumber missions that shipped (state is keyed `'<chapter>.<mission>'`); append to the end of a chapter. See guideline section 4.
5. **Every mission is solvable and its check is honest.** Each mission has a reference `answer` that passes its own `check` (the solvability test enforces it). Write checks on outcomes where you can, and try to break your own check with a wrong answer and a lazy answer.
6. **Engine stays DOM-free.** Anything under `programming/shell-quest/engine/` must run in Node. DOM code lives in `ui.js`, `editor.js`, `app.js`.
7. **Stay in scope.** One concern per PR. No drive-by reformatting, renames or dependency bumps.
8. **Match the surrounding code**: naming, comment density, idiom. Some files are deliberately compact; do not reformat them.
9. **Explain the whole, then the parts.** A mission card says what the *whole line* does first, then how each part (command, option, argument, operator) contributes: use the `how` steps list and chip meanings (`docs/tiers-guideline.md` section 3). Never explain only the pieces.
10. **Code in prose.** Commands, options, file names, variables and functions in learner text are `<code>` (backticks where the page escapes the field), never plain words. `tests/shell/codestyle.test.mjs` enforces the checkable part; see `docs/tiers-guideline.md` section 6a.
11. **Tone.** Learner-facing text is friendly, concrete and a little playful. It is never condescending, and it never assumes prior knowledge the quest has not taught yet.
12. **Teach before use.** Every term a mission, question, hint, guide or quick-fire entry relies on was taught by an earlier mission on the default path, or is defined in place before first use. Order the course as a dependency chain (`docs/tiers-guideline.md` section 6).

## Skills

In `.claude/skills/`: `add-mission`, `new-playground`, `pre-pr-check` (before a PR), `review-mission` (adversarial content review), `playtest` (play it in a browser), `mission-voice` (learner-facing tone), `triage-issue`. Use them when the task matches.

## Where things go

| You want to... | Touch |
|---|---|
| Add or fix a Shell Quest mission | `programming/shell-quest/content/tier-*.js` (+ tests); use the `add-mission` skill |
| Add a Shell Quest command or shell feature | `programming/shell-quest/engine/cmds-*.js` / `interp.js` (+ `tests/shell/`) |
| Change another quest's course | that quest's `app.js` (`CH`, `QF`/`QT`, `GUIDE` arrays); every mission carries `how` steps |
| Add a mission that needs several commands tried | `steps` on the mission (guideline section 3); engine in `programming/shell-quest/engine/exec.js`, list in `ui.js` |
| Change how mission cards render | `shared/how.js` + `shared/how.css` (affects every quest; keep it bundle-safe) |
| Change Data Structures Quest | `programming/ds-quest/content.js` (missions, `QF`, `GUIDE`), `programming/ds-quest/demos.js` (guide explainers), `programming/ds-quest/engine.js` (runner, DOM-free), `programming/ds-quest/app.js` (UI) + `tests/ds/` |
| Change Agent Quest (chapters 1 to 23) | `programming/agent-quest/engine/` (simulator: files, prompt grammar, context, policy; DOM-free), `programming/agent-quest/content/` (`tiers.js`, `state.js`, `model.js`, `facts.js`, `scenarios.js`, `scenarios-personal.js`, `scenarios-tune.js`, `ch-*.js` chapters, `extras.js` for `RANKS`/`QF`/`GUIDE`; DOM-free), `programming/agent-quest/ui.js` + `editor.js` + `meter.js` + `app.js` (UI) + `tests/agent/` (keep `tests/agent/harness.mjs` `FILES` in `programming/agent-quest/index.html` script order) |
| Change Network Quest (chapters 1 to 5) | `programming/net-quest/engine/` (simulator, shell, commands; DOM-free), `programming/net-quest/content/` (`model.js`, `ch-*.js` chapters, `extras.js` for `RANKS`/`QF`/`GUIDE`; DOM-free), `programming/net-quest/ui.js` + `inspector.js` + `app.js` (UI) + `tests/net/` (keep `tests/net/harness.mjs` `FILES` in `programming/net-quest/index.html` script order) |
| Change Rust Quest | `programming/rust-quest/engine/` (lexer, parser, checker, interpreter; DOM-free), `programming/rust-quest/content/` (`model.js`, `ch-*.js`, `extras.js`; `verified.js` is written only by `tests/rust/verify-rustc.mjs`), `programming/rust-quest/ui.js` + `editor.js` + `app.js` (UI) + `tests/rust/` (keep `tests/rust/harness.mjs` `FILES` in `programming/rust-quest/index.html` script order; any corpus, mission or engine-result change needs a fresh `verify-rustc.mjs` run) |
| Change the Math hub or its prerequisite graph | `math/graph.js` (DOM-free; chapter ids and order must match each track's `content.js`), `math/app.js` + `style.css` (hub), `tests/math/` (the landing Math card's `data-subject` and the catalog's math keys must match the graph tracks) |
| Change a Math track's course | `math/<track>/content.js` (DOM-free: chapters, missions with `answer`/`wrong`/`lazy`, quick-fire templates, guide; chapter ids and order match `graph.js`), `math/track.js` + `track.css` (the shared track page) + `tests/math/content.test.mjs` |
| Add a Math track | `math/<track>/` (`index.html`, `app.js`, `content.js`, copied from `geometry/` with its own `PROGRESS` key `math-<track>-v1`), the track and its chapters in `math/graph.js`, the landing card text in `index.html`, its entry in `shared/catalog.js` and its loader in `tests/trophy/catalog.test.mjs` (`tests/math/graph.test.mjs` checks the landing Math card's `data-subject` and the catalog's math keys against the graph tracks), `TRACKS` in `tests/math/content.test.mjs`, `PAGES` and the hub tests in `tests/smoke.mjs`, the README repo map |
| Upgrade a Math vendored library | pins in `tools/vendor-math.sh`, rerun it, commit `math/vendor/` (never edit those files by hand) |
| Add a whole playground | new `programming/<name>-quest/`, its card in `programming/index.html`, its entry in `shared/catalog.js` (key, name, subject, href, done-key separator, missions per chapter) and its loader in `tests/trophy/catalog.test.mjs` (the landing Programming card reads the catalog), `NAMES` in `tests/smoke.mjs`; use the `new-playground` skill |
| Change the Trophy Room | `shared/trophies.js` (DOM-free; level, achievements), `trophy-room/` (page), `shared/catalog.js` (playgrounds and their counts) + `tests/trophy/` and the trophy room tests in `tests/smoke.mjs` |
| Change progress saving | `shared/progress.js` (affects every quest; add a smoke test) |
| Change CI / deploy | `.github/workflows/`, `tools/` (separate PR, flag it) |

## Before you open a PR

Use the `pre-pr-check` skill, or by hand: run the commands above, re-read your own diff adversarially ("what would make CI reject this?"), and fill in the PR template. For UI changes, look at the page in a browser (or Playwright screenshot) at desktop and 390px wide, and say what you saw.

## Agent etiquette

- Branch from `main`; one branch per issue. Do not push to `main` or to someone else's branch.
- **Conventional Commits** for commit messages and the PR title (`type(scope): subject`, see CONTRIBUTING.md; enforced by commitlint locally and in CI). Never bump the version or edit `CHANGELOG.md`; releases are cut by maintainers. Keep any attribution trailer your tooling adds.
- Do not weaken, skip or delete a test to get green. If a test is wrong, say so in the PR and explain.
- Unsure or the issue is ambiguous? Ask on the issue before building; a question is cheaper than a rewrite.
- Plans and specs for larger work go in `docs/superpowers/` (specs, plans) and merge before the code that implements them.
