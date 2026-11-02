# Contributing to Playgrounds

Thanks for wanting to make learning to code a little more fun. Pull requests are welcome from everyone, and from the coding agents working for them.

## Ways to help

- **Add or improve missions.** A clearer goal, a better hint, a sneakier quick-fire question.
- **Fix a bug.** Wrong check, typo, layout glitch on a phone, console error.
- **Extend a quest.** New chapters, new commands in Shell Quest's practice shell, new field-guide entries.
- **Start a new playground.** Rust? SQL? Git? Regex? Open an issue first so we can agree on scope.
- **Playtest.** Play a quest, then tell us where you got stuck. That is gold.

Look for issues labelled `good first issue` and `mission idea`. Not sure where to start? Open an issue and ask.

## Working with an agent (recommended)

The repo is agent-ready. Point Claude Code (or any coding agent that reads `AGENTS.md`) at an issue:

```
Read AGENTS.md, then work on issue #123. Use the repo's skills. Open a PR when the checks pass.
```

The agent finds the rules in [AGENTS.md](AGENTS.md) and the task skills in [`.claude/skills/`](.claude/skills/). You stay the driver: review the diff, play the result in a browser, and own the PR. Humans are accountable for what they submit, whoever typed it.

## The workflow

1. **Pick or open an issue.** Say you are taking it so nobody doubles up. For anything bigger than a mission or a bug fix, agree on the idea in the issue first.
2. **Fork and branch.** Branch from `main`: `git switch -c fix/shell-quest-sed-typo`.
3. **Set up.** Node 24+, Python 3.
   ```
   npm ci && npx playwright install chromium
   ```
4. **Make the change.** Keep it to one concern. Add or update tests with it (see below).
5. **Run the checks.** All of these must pass; CI runs the same:
   ```
   npm run check && npm test
   ```
   For a quick loop while working on Shell Quest content: `npm run test:engine`.
6. **Look at it.** Open the page. For anything visible, check desktop and a 390px-wide window, and your browser console for errors.
7. **Open the PR.** Fill in the template: what changed, why, how you checked it, screenshots for UI.
8. **Respond to review.** CI must be green. PRs from branches in this repo also get a live preview link; PRs from forks do not, so say how you tested.

## Commits and PR titles

We use [Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint. Releases and the changelog are generated from them, so the messages matter.

```
<type>(<scope>): <what changed, imperative, lower case>

feat(shell): add the wc --lines option
fix(python): keep the memory map in view on phones
docs: explain how to run a quest from disk
feat(shell)!: rename the saved-state key      # breaking change
```

- **Types**: `feat` (new learner-visible thing), `fix`, `perf`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `revert`.
- **Scopes** (optional): `script`, `python`, `cpp`, `shell`, `harbor`, `ds`, `landing`, `shared`, `progress`, `engine`, `content`, `tests`, `ci`, `deps`, `docs`, `tools`, `skills`, `release`, `net`, `agent`, `rust`.
- **The PR title is what lands on `main`** (we squash-merge), so it must follow the format; a check enforces it. Individual commit messages are checked locally by a git hook after `npm ci`.
- Breaking changes (for example anything that would invalidate saved progress) use `!` and a `BREAKING CHANGE:` footer.

Version bumps follow SemVer: `feat` is minor, `fix` and `perf` are patch, `!` is major. Contributors never bump versions or edit `CHANGELOG.md`; release-please does that.

## Releasing (maintainers)

Releases are automated with [release-please](https://github.com/googleapis/release-please). `main` is protected and nobody pushes to it directly.

1. Every merge to `main` updates one open pull request titled **`chore(release): X.Y.Z`**. It bumps `package.json` and writes `CHANGELOG.md` from the Conventional Commits since the last release (`feat` is minor, `fix`/`perf` patch, `!` major; while we are on 0.x a breaking change bumps the minor).
2. When you want to ship, read that PR, wait for the checks, and squash-merge it.
3. release-please then tags `vX.Y.Z` and publishes the GitHub Release with the changelog section. Nothing to run by hand.

Config: `release-please-config.json` and `.release-please-manifest.json` (the current version). Repo settings the flow depends on (branch protection, a token so CI runs on the release PR) are in [docs/repo-settings.md](docs/repo-settings.md).

## What a good PR looks like

- Small and focused, with a Conventional Commit title (`feat(shell): ...`).
- Tests included. New Shell Quest missions are covered by the solvability test automatically; add a case that proves a *wrong* or *lazy* answer fails.
- Learner-facing text that is friendly, concrete and a touch playful. Short sentences. No jargon the quest has not introduced yet.
- No unrelated formatting changes, no new dependencies, no build step.

## Hard rules, briefly

(Full list in [AGENTS.md](AGENTS.md).)

- No build step or framework; pages must work from disk and bundle with `tools/build.py`.
- **Never regenerate test fixtures to get green.** If a golden or corpus test fails, the code is wrong.
- Never rename a `localStorage` key or renumber shipped missions; learners' saved progress must keep working.
- Every mission needs a reference answer that passes its own check.

## Guides

- [docs/tiers-guideline.md](docs/tiers-guideline.md): tiers, mission kinds, writing checks that hold up, keeping saves compatible, adopting tiers in another quest.
- [README](README.md): commands, repo map, CI, deployment.

## Conduct

See the [Code of Conduct](CODE_OF_CONDUCT.md). Short version: be kind, assume good faith, critique code not people. Security issues go through [SECURITY.md](SECURITY.md), not public issues.

## License

By contributing you agree that your work is released under the [MIT License](LICENSE).
