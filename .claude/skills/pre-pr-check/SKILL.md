---
name: pre-pr-check
description: Use before opening or updating a pull request in this repo. Runs the same checks CI runs, reviews the diff against the repo's hard rules, and drafts the PR description.
---

# Pre-PR check

Run in order; stop and fix at the first failure.

1. `git status` clean except intended changes; branch is not `main`; diff is one concern (`git diff --stat origin/main...`).
2. Syntax: `for f in */app.js shell-quest/*.js shell-quest/engine/*.js shell-quest/content/*.js shared/*.js tests/*.mjs tests/shell/*.mjs; do node --check "$f" || break; done`
3. Commit messages and the PR title are Conventional Commits (`echo "type(scope): subject" | npx commitlint`).
4. `npm run check` (bundling) then `npm run test:engine`, then `npm run test:browser` (about 3 minutes; set `PW_CHROMIUM` if Chromium is preinstalled elsewhere).
5. **Adversarial diff read** against `AGENTS.md` hard rules:
   - any fixture under `tests/fixtures/` changed? Revert unless a reviewed, documented decision.
   - any `localStorage` key renamed, shipped mission renumbered or reordered?
   - new dependency, build step, or non-relative asset path?
   - DOM use inside `shell-quest/engine/`?
   - weakened or skipped test?
   - mission checks passable by `echo`-ing the answer?
   - new or changed missions without `how` steps (whole line first, then each part)?
   - bare command names, options, file names or variables in learner text (should be `<code>`)?
6. UI change? Load the page (local server or Playwright), screenshot at desktop and 390px, check the console for errors.
7. Draft the PR using `.github/pull_request_template.md`: what and why, how checked (commands and results, quoted), screenshots, risks. Say plainly what you did not test.
