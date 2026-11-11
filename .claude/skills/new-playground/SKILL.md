---
name: new-playground
description: Use when creating a new <name>-quest playground (a new language or tool). Lists every place a new quest must be wired in so it loads, saves, bundles, is tested and shows on the landing page.
---

# New playground

Only start after an issue agreed the topic and scope. Copy the shape of a small existing quest (`programming/python-quest/` or `programming/script-quest/`); do not invent a new structure.

Checklist, all in one PR:

1. **Folder** `programming/<name>-quest/` (a non-programming topic is its own section, like `math/`: ask first) with `index.html`, `style.css`, `app.js`. Plain scripts, relative paths, no build step, no new dependency (Math's vendored libraries are an approved exception, not a precedent).
2. **Progress**: in `index.html`, `<script>window.PROGRESS={key:"<name>-quest-v1",name:"<Name> Quest"}</script>`, then load `../../shared/progress.css` and `../../shared/progress.js` before `app.js`. Never rename the key later. A fresh save must count as empty: learner-typed text lives in a field `shared/progress.js` already knows (`notes`, `codes`, `code`, `answers`, `tray`, `work`, `sandbox`, `free.code`), anything else the learner changes goes in `defaults:{field:startValue}` on `window.PROGRESS` (see the comment above `pristine`).
   **Settings**: load `../../shared/settings.css` and `../../shared/settings.js` first among the shared scripts (it sets the theme before the page paints and adds the Settings button). Keep the header on one row from 1280px: `tests/smoke.mjs` checks it once the quest is in its `PAGES` list.
   **Navigation**: load `../../shared/nav.css` and `../../shared/nav.js` the same way (back-to-landing link in `header.top`, feature-request footer).
   **Mission steps**: load `../../shared/how.css` and `../../shared/how.js` too, and render `HowSteps.html(m.how)` between the anatomy chips and `explain` on the mission card. Write `how` (whole line first, then each part) for every mission, with code in `<code>` (where a field is escaped, use backticks and `HowSteps.tick(text, esc)`); see `docs/tiers-guideline.md` section 3.
3. **Story, then course.** Before planning chapters, write the playground's treasure-hunt outline in `story.js` (world, places, cast, final treasure; `docs/story-guideline.md`, `quest-story` skill). Every chapter then gets a `story` line (its leg of the hunt) and the badge names what that leg finds. The test in `tests/trophy/catalog.test.mjs` fails without them.
   **The trail**: load `../../shared/trail.css` and `../../shared/trail.js` (after `settings.js`, before `app.js`) and put `${Trail.html(ch.story)}` at the top of every mission view, mission 1 included; the Story setting and the strip's look come from the shared files. `tests/trophy/catalog.test.mjs` and `tests/smoke.mjs` check it.
   **Course**: chapters (`CH`), quick-fire, field guide, a `RANKS` ladder with a fun top title. Missions have a reference answer and an honest check. Plan the order as a dependency chain first: every term a mission uses was taught by an earlier one (guideline section 6, "Teach before use"). Tiers are optional; see `docs/tiers-guideline.md` section 9.
4. **Programming hub** `programming/index.html`: add a card (title, one playful sentence, XP badge hook like the others), and add the quest to `shared/catalog.js` (its mission count per chapter, in order) plus a loader in `tests/trophy/chapters.mjs`; the landing card and the Trophy Room read the catalog.
5. **Bundling**: `python3 tools/build.py --check` must pass (the bundler picks up any `*-quest/` folder at the top level or under `programming/`). Inlined files must not contain `</script` or `</style`.
6. **Tests**: add the name to the list in `tests/smoke.mjs` (loads cleanly, tabs, progress export/import). Engine-like logic that runs without a DOM gets Node tests under `tests/`.
7. **CI scripts**: add the new JS files to the `node --check` glob in `.github/workflows/ci.yml` if they live outside `*/app.js`.
8. **Docs**: a row in the README table, and an entry in the README "Map of the repo" (plus its test folder, if it has one) if the quest has files beyond `index.html` + `style.css` + `app.js`; a mention in `AGENTS.md` "Where things go" if it has its own layout.
9. **Run** `npm run check && npm test`, play every chapter once, check 390px width, and attach screenshots to the PR.
