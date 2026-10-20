---
name: new-playground
description: Use when creating a new <name>-quest playground (a new language or tool). Lists every place a new quest must be wired in so it loads, saves, bundles, is tested and shows on the landing page.
---

# New playground

Only start after an issue agreed the topic and scope. Copy the shape of a small existing quest (`python-quest/` or `script-quest/`); do not invent a new structure.

Checklist, all in one PR:

1. **Folder** `<name>-quest/` with `index.html`, `style.css`, `app.js`. Plain scripts, relative paths, no build step, no new dependency.
2. **Progress**: in `index.html`, `<script>window.PROGRESS={key:"<name>-quest-v1",name:"<Name> Quest"}</script>`, then load `../shared/progress.css` and `../shared/progress.js` before `app.js`. Never rename the key later.
   **Navigation**: load `../shared/nav.css` and `../shared/nav.js` the same way (back-to-landing link in `header.top`, feature-request footer).
   **Mission steps**: load `../shared/how.css` and `../shared/how.js` too, and render `HowSteps.html(m.how)` between the anatomy chips and `explain` on the mission card. Write `how` (whole line first, then each part) for every mission, with code in `<code>` (where a field is escaped, use backticks and `HowSteps.tick(text, esc)`); see `docs/tiers-guideline.md` section 3.
3. **Course**: chapters (`CH`), quick-fire, field guide, a `RANKS` ladder with a fun top title. Missions have a reference answer and an honest check. Tiers are optional; see `docs/tiers-guideline.md` section 9.
4. **Landing page** `index.html`: add a card (title, one playful sentence, XP badge hook like the others).
5. **Bundling**: `python3 tools/build.py --check` must pass (the bundler picks up any `*-quest/` folder). Inlined files must not contain `</script` or `</style`.
6. **Tests**: add the name to the list in `tests/smoke.mjs` (loads cleanly, tabs, progress export/import). Engine-like logic that runs without a DOM gets Node tests under `tests/`.
7. **CI scripts**: add the new JS files to the `node --check` glob in `.github/workflows/ci.yml` if they live outside `*/app.js`.
8. **Docs**: a row in the README table, and an entry in the README "Map of the repo" (plus its test folder, if it has one) if the quest has files beyond `index.html` + `style.css` + `app.js`; a mention in `AGENTS.md` "Where things go" if it has its own layout.
9. **Run** `npm run check && npm test`, play every chapter once, check 390px width, and attach screenshots to the PR.
