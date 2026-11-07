# Trophy Room (`trophy-room/`) design

Date: 2026-11-06. Status: approved design, nothing built yet. Issue: #146. Builds on #145 (Programming section).

## Goal

One page that shows a learner everything they have done across all playgrounds: a **playground level** computed from the XP of every quest summed, progress per subject (Programming, Math), every quest's progress, and **achievements** such as "Playground Master" for finishing every quest in a subject.

## Decisions

- **Name and place.** The page is the Trophy Room, at `trophy-room/` (top-level folder, like `programming/` and `math/`).
- **Nothing new is stored.** Every number is derived from the quests' existing saves on each visit. No quest changes its save format, and no Trophy Room state exists, so export and import stay per quest as today.
- **Completion is derived from missions, the same way for every quest.** A chapter is done when all its missions are done; a quest is complete when all its chapters are done. Saved `badges` flags are ignored, because Script Quest and Network Quest have none and the others store them as `1` or `true`.
- **One catalog of quests.** `shared/catalog.js` lists every quest once, with its chapter and mission counts. The landing page, the Programming hub and the Trophy Room read it. A test fails when it drifts from the real content.
- **Level curve.** Level `n` starts at `20·(n−1)²` XP. Titles change every 5 levels.
- **Achievements are fixed, derived and never awarded XP.** Nine of them (see "Achievements").
- **Entry points.** A level button in the landing page header and in the shared bar every quest loads.
- **Not bundled.** `tools/build.py` bundles quest folders only; the Trophy Room exists on GitHub Pages only, like the Math tracks. The level button stays out of the bundle, as the back link does today.

## Scope

In scope: `shared/catalog.js`, `shared/trophies.js`, the `trophy-room/` page, the level button in the landing header and in `shared/nav.js`, switching landing and hub cards to the catalog, tests, and repo wiring.

Out of scope: per-quest completion badges, level-milestone achievements, streaks or time played (these need new stored data), sharing or exporting the Trophy Room, and XP for achievements.

The first PR (this spec and the plan) changes docs only.

## Layout

```
shared/
  catalog.js       DOM-free: the list of quests (window.Catalog; tests load it with node:vm, like shared/tiers.js)
  trophies.js      DOM-free: read saves, derive stats, level, achievements
trophy-room/
  index.html       the page: header, level, subjects, quests, achievements
  app.js           renders from Trophies.summary(); no logic beyond layout
  style.css        Trophy Room styles on top of shared/landing.css
tests/trophy/
  trophies.test.mjs  unit tests for derivation, level and achievements
  catalog.test.mjs   catalog matches each quest's real content
```

## Data sources (as of #145)

Every quest saves one JSON object in `localStorage` under its `window.PROGRESS.key`. Same origin, so any page on the site can read all of them; `shared/cards.js` already does this for XP.

| Quest | Key | Done key | Chapters | Missions | Max XP today |
|---|---|---|---|---|---|
| Script | `script-quest-v1` | `c-m` | 12 | 93 | 930 |
| Python | `python-quest-v1` | `c.m` | 9 | 57 | 795 |
| C++ | `cpp-quest-v1` | `c-m` | 9 | 68 | 905 |
| Shell | `shell-quest-v1` | `c.m` | 19 | 137 | 2,690 |
| Harbor | `harbor-quest-v1` | `c.m` | 12 | 91 | 1,300 + quick-fire |
| Data Structures | `ds-quest-v1` | `c.m` | 6 | 26 | 410 |
| Network | `net-quest-v1` | `c.m` | 5 | 32 | 320 |
| Agent | `agent-quest-v1` | `c.m` | 23 | 81 | 1,385 |
| Arithmetic | `math-arithmetic-v1` | `c.m` | 5 | 25 | 375 |
| Algebra | `math-algebra-v1` | `c.m` | 5 | 25 | 375 |
| Geometry | `math-geometry-v1` | `c.m` | 4 | 20 | 300 |
| Trigonometry | `math-trigonometry-v1` | `c.m` | 1 | 5 | 75 |

Total today is about 9,860 XP. Quirks the reader must handle:

- Done values are `1` or `true`; test truthiness.
- Script Quest and C++ Quest key missions `chapter-mission`; all others `chapter.mission`.
- Harbor Quest's quick-fire adds XP on every round, so its XP has no ceiling. XP is still summed as saved.
- Harbor Quest discards a save without `v:1`, `d` and `k`; the reader treats such a save as no progress, matching what the quest shows.
- The Shell Quest save holds the whole virtual filesystem. Parse it, keep only `xp` and `done`.
- Some quests write 200 ms after a change. The Trophy Room reads on load and on `pageshow`, which is enough; it does not poll.

## `shared/catalog.js`

```js
{ key: 'python-quest-v1', name: 'Python Quest', subject: 'programming', href: 'programming/python-quest/',
  sep: '.', missions: [6, 7, 8, 6, 6, 7, 6, 5, 6] }
```

- `missions[i]` is the mission count of chapter `i`, in the quest's chapter order. The chapter count is its length.
- `sep` is the done-key separator (`'-'` for Script and C++).
- `href` is relative to the site root; each page resolves it against its own depth.
- `subject` is `programming` or `math`. Subject names and order live here too: `SUBJECTS = [{id:'programming', name:'Programming', href:'programming/'}, {id:'math', name:'Math', href:'math/'}]`.
- The landing Programming and Math cards use `data-subject` and take their keys from the catalog; the Programming hub's quest cards keep `data-key`. `shared/cards.js` keeps its behaviour (sum XP, show "Continue →").

## `shared/trophies.js`

Pure functions that take `localStorage` as a parameter, so tests pass a fake. The one DOM function is `labelButton(a)`, which writes the level into a Trophy Room button.

- `questStats(entry, save)` returns `{ key, xp, missionsDone, missionsTotal, chaptersDone, chaptersTotal, started, complete }`.
  - Missions done: count done keys that parse to a valid `chapter`/`mission` inside the catalog's counts and have a truthy value. Unknown or out-of-range keys are ignored, so a stale save never shows more than 100%.
  - `xp`: the saved `xp` if it is a finite number ≥ 0, else 0.
  - `started`: `missionsDone > 0`. `complete`: `missionsDone === missionsTotal`.
- `readSave(storage, entry)`: read and parse one entry's key. A missing key, invalid JSON, a non-object, a blocked storage (throws) or a Harbor save failing its own validity check give an empty save. It never throws.
- `subjectStats(stats, subjects)`: per subject, quests complete, quests started, chapters done, XP.
- `level(xp)`: `n = floor(sqrt(xp / 20)) + 1`. Returns `{ n, title, lo, hi }` where `lo = 20·(n−1)²` and `hi = 20·n²`. Titles: 1–4 Visitor, 5–9 Explorer, 10–14 Regular, 15–19 Veteran, 20+ Legend. Today's full completion (about 9,860 XP) is level 23. As content grows the top level grows; there is no cap.
- `achievements(stats, subjects)`: returns the list below, each `{ id, name, icon, earned, condition, progress? }`, where `progress` is `{ have, need }` for counted ones while there is something left to reach.
- `summary(storage, catalog)`: everything the page needs in one object.

## Achievements

| Id | Name | Earned when | Progress shown |
|---|---|---|---|
| `first-steps` | First Steps | any mission done anywhere | none |
| `curious` | Curious | 3 quests started | quests started / 3 |
| `wanderer` | Wanderer | every quest started | quests started / all |
| `chapter-chaser` | Chapter Chaser (bronze, silver, gold) | 10, 25, 50 chapters done in total | chapters / next tier |
| `finisher` | Finisher | one quest complete | none |
| `master-programming` | Playground Master: Programming | every Programming quest complete | quests complete / all |
| `master-math` | Playground Master: Math | every Math track complete | tracks complete / all |
| `polymath` | Polymath | at least one chapter done in each subject | none |
| `grand-master` | Grand Master | every quest complete | quests complete / all |

"Every quest" means every catalog entry at the time of reading. When a quest is added, the "every" achievements can become unearned again; that is intended, because the page always reflects the current site. Chapter Chaser is one tile whose medal and label follow the highest tier reached; locked until 10 chapters.

Icons are inline SVG or a single character per tile, chosen in the plan; nothing is loaded from the network.

## Page

One column, max width as the landing page (1100px; content column about 640px), in this order:

1. **Level card**, centred: a dark ring with the level number, the title, total XP, a bar from `lo` to `hi`, and "N XP to Level n+1".
2. **Subjects**: one row per subject with its name, "q of Q quests · c chapters", and a bar of quests complete. Each subject name links to its hub.
3. **Quests**: one row per catalog entry, grouped by subject: name (link), "c / C chapters · xp XP", and a "Done" pill when complete; "Not started" when nothing is done.
4. **Achievements**: "k of 9" heading, then a grid of tiles. Earned tiles in full colour; locked tiles greyed with the condition and progress as text (not only colour), e.g. "18 of 25 chapters".

The header has the "← All playgrounds" link and the theme toggle, from the shared scripts. Styles reuse the tokens in `shared/landing.css`, both themes. At 390px wide nothing overflows; the grid wraps.

Empty state (no saves): Level 1 Visitor, 0 XP, all achievements locked, and one line: "Finish a mission in any playground to start filling this room." with links to the two hubs.

The page note repeats the landing page's: progress lives in this browser, and each quest's Progress button backs it up.

## Entry points

- **Landing header**: a button "🏆 Level n" next to the existing header buttons, linking to `trophy-room/`. Level 1 with no progress still shows, so the room is discoverable.
- **Shared bar** (`shared/nav.js`): the same button after "← All playgrounds", using the same path rule as the back link, so it appears only on the deployed site and never in a bundled quest. `nav.js` loads `shared/catalog.js` and `shared/trophies.js` itself, only on pages where it shows the button, so no quest page changes.

## Accessibility

- The level bar and subject bars are `role="progressbar"` with `aria-valuenow/min/max` and a text label.
- Locked achievements carry their state in text ("Locked: …"), not only in grey.
- Icons are `aria-hidden`; the name is the label.
- Respects `prefers-reduced-motion` (no animation is planned).

## Tests

- `tests/trophy/trophies.test.mjs` (node, no browser):
  - Derivation: both separators; `1` and `true`; out-of-range and junk keys ignored; invalid JSON, non-object, throwing storage, Harbor save without `v/d/k` give zeros; XP not finite or negative gives 0.
  - Level: boundaries at 0, 19, 20, 79, 80, 7,220; titles at 4/5, 19/20.
  - Achievements: each one just below and at its threshold; Chapter Chaser tiers; Polymath needs both subjects; "every" achievements with one quest missing.
- `tests/trophy/catalog.test.mjs`: for each quest, load its content the way its own tests do and assert the catalog's `missions` equals the real per-chapter counts, and that every `programming/*-quest/` and `math/<track>/` folder has exactly one catalog entry whose `key` matches its `window.PROGRESS.key`. The plan chooses how to read the content of the single-file quests (Script, Python, C++, Harbor), whose chapter arrays are not globals.
- `tests/smoke.mjs`: the Trophy Room loads with no console errors and no overflow at 1280 and 390 wide; with a seeded set of saves it shows the expected level, quest rows and earned achievements; the level button appears on the landing page and on one quest page, and links to the room.
- Landing and hub card tests keep passing with keys from the catalog.

## Touchpoints

- `README.md`: the repo map and a line about the Trophy Room.
- `AGENTS.md`: the change table ("Add a whole playground" and "Add a Math track" now include the catalog entry; a row for the Trophy Room).
- `.claude/skills/new-playground/SKILL.md`: add the catalog entry step.
- `tools/publish_site.sh`: add `trophy-room` to the site list.
- `.github/workflows/pr-preview.yml`: add `trophy-room/**` to the paths.
- `tools/ci-plan.mjs`: a change under `trophy-room/` or `tests/trophy/` runs the trophy tests and the smoke tests; check it falls in the "may touch anything" branch or add it.
- `commitlint.config.mjs`: add a `trophy` scope (CI change, own commit).
- `tools/build.py`: no change; confirm the room is not bundled and bundled quests do not reference it.
- Open quest PRs (Rust Quest #96, #136) add a catalog entry when they land; the catalog test makes that impossible to miss.

## Risks

- **Catalog drift.** Mitigated by the catalog test.
- **Bigger quest pages.** Every quest loads two more small shared scripts for the level button. Both are small and have no dependencies.
- **Harbor quick-fire inflates XP.** Accepted: XP is what the quest saved. Completion does not depend on XP.
- **Achievements can be lost when quests are added.** Intended; stated on the page under the grid ("New playgrounds join the 'every quest' achievements when they launch.").
