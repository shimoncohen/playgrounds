# AGENTS.md

Rules of the repo for coding agents (Claude Code, Codex, Copilot, ...) and for humans. Read this first; [CONTRIBUTING.md](CONTRIBUTING.md) has the PR workflow, [docs/tiers-guideline.md](docs/tiers-guideline.md) has the mission-authoring detail.

## What this is

Playgrounds: static, no-build, in-browser learning quests (`script-quest/`, `python-quest/`, `cpp-quest/`, `shell-quest/`, `harbor-quest/`, `ds-quest/`) plus a landing page (`index.html`) and `shared/` code. Shell Quest is the reference implementation (a DOM-free engine in `shell-quest/engine/`, course content in `shell-quest/content/`).

## Commands

```
npm ci && npx playwright install chromium   # once
npm run check          # every *-quest/ folder bundles for claude.ai artifacts
npm run test:engine    # Node-only engine + content tests (fast, run often)
npm run test:browser   # Playwright smoke + golden tests (about 3 minutes)
npm test               # both
for f in */app.js ds-quest/*.js shell-quest/*.js shell-quest/engine/*.js shell-quest/content/*.js shared/*.js tests/*.mjs tests/shell/*.mjs tests/ds/*.mjs; do node --check "$f" || break; done
```

CI runs all of these on every PR. A PR is not ready until they pass locally.

## Hard rules

1. **No build step, no framework, no new runtime dependency (dev tooling such as commitlint is fine).** Plain browser scripts. Pages must work opened from disk and served by GitHub Pages. Fonts and `acorn`/`typescript` come from CDNs; do not add more without an issue.
2. **Must bundle.** `tools/build.py` inlines local `style.css`/`app.js`/`shared/*` into one body-only file. Local assets must be referenced as `<script src="...">` / `<link rel="stylesheet" href="...">` with relative paths, and an inlined file must not contain `</script` or `</style`.
3. **Never regenerate fixtures to make a test pass.** `tests/fixtures/` (golden transcript, corpus 1 and 2) record what old content did. If one fails, your code is wrong. A deliberate change to old behaviour is its own reviewed decision; see the "differential guards" part of the guideline.
4. **Saved progress must keep working.** Never rename a `localStorage` key (`<name>-quest-v1`), never renumber missions that shipped (state is keyed `'<chapter>.<mission>'`); append to the end of a chapter. See guideline section 4.
5. **Every mission is solvable and its check is honest.** Each mission has a reference `answer` that passes its own `check` (the solvability test enforces it). Write checks on outcomes where you can, and try to break your own check with a wrong answer and a lazy answer.
6. **Engine stays DOM-free.** Anything under `shell-quest/engine/` must run in Node. DOM code lives in `ui.js`, `editor.js`, `app.js`.
7. **Stay in scope.** One concern per PR. No drive-by reformatting, renames or dependency bumps.
8. **Match the surrounding code**: naming, comment density, idiom. Some files are deliberately compact; do not reformat them.
9. **Tone.** Learner-facing text is friendly, concrete and a little playful. It is never condescending, and it never assumes prior knowledge the quest has not taught yet.

## Skills

In `.claude/skills/`: `add-mission`, `new-playground`, `pre-pr-check` (before a PR), `review-mission` (adversarial content review), `playtest` (play it in a browser), `mission-voice` (learner-facing tone), `triage-issue`. Use them when the task matches.

## Where things go

| You want to... | Touch |
|---|---|
| Add or fix a Shell Quest mission | `shell-quest/content/tier-*.js` (+ tests); use the `add-mission` skill |
| Add a Shell Quest command or shell feature | `shell-quest/engine/cmds-*.js` / `interp.js` (+ `tests/shell/`) |
| Change another quest's course | that quest's `app.js` (`CH`, `QF`/`QT`, `GUIDE` arrays) |
| Change Data Structures Quest | `ds-quest/content.js` (missions, `QF`, `GUIDE`), `ds-quest/engine.js` (runner, DOM-free), `ds-quest/app.js` (UI) + `tests/ds/` |
| Add a whole playground | new `<name>-quest/`, landing card, smoke list; use the `new-playground` skill |
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
