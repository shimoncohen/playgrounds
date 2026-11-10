# Story guideline

Every playground is one whimsical treasure hunt. The learner arrives in a small world, follows a trail of clues chapter by chapter, and finds a treasure at the end. The story is the reason to type the next command; the lesson is still the point. This guideline says what a playground's story is made of, where it is written down, and the rules that keep it from getting in the way of teaching.

Shell Quest's Beginner tier is the model to copy: a forest, a cave, a chest, a hidden `.secret_map`, gold, a tent, a diary and a village. Every command the learner types moves them through that world.

## 1. Why a story

A mission that says "use `grep` on `log.txt`" teaches a command. A mission that says "the ranger's logbook mentions the bridge somewhere; find the line" teaches the same command and gives the learner a reason to care whether it worked. Across a whole playground, a story also tells the learner where they are: each chapter is one leg of the trail, and the badge they earn is the thing they found there.

The story is the frame, never the content. If a learner skips every story sentence, the mission must still teach.

## 2. The parts of a story

Each playground has one story outline with these parts. Write it before the course plan (the `new-playground` skill), and keep every mission on it (the `quest-story` skill).

- **World**: one or two sentences. Where the hunt happens and what kind of place it is: a forest village, a harbor, a lighthouse workshop, an island post office. It should suit the topic (Network Quest suits a town of houses passing letters; Data Structures Quest suits a warehouse of shelves, stacks and queues).
- **Map**: the named places the trail passes through, roughly in chapter order. Places are where world data comes from: folder names, hosts, files, variables, shelves.
- **Cast**: two to four recurring characters with a name and a role (the guide who hands out clues, the keeper of a place, a rival who hid the treasure). They come back across chapters; do not invent a new character per mission.
- **Legs**: one per chapter. A leg is a small arc: a **clue** arrives (the chapter intro), a **puzzle** is solved (the missions, which are the lessons), and something is **found** (the chapter badge names it). The next leg's clue usually comes out of what was found.
- **Final treasure**: what the last chapter finds, and why it was worth the trip. It pays off something set up early (the chest from chapter 1, the map torn in half, the locked door at the harbor). Tiered playgrounds may give each tier its own mid-way prize, but there is one final treasure.

## 3. Where it lives

- **The outline**: `story.js` in the playground's folder (`programming/<name>-quest/story.js`, `math/<track>/story.js`). It is a plain DOM-free script that sets `STORY` on the global object, so Node tests and, later, the page can both read it:

  ```js
  (function (root) {
    root.STORY = {
      world: 'A misty forest village where the old ranger hid her gold before she retired.',
      places: ['the clearing', 'the cave', 'the old tent', 'the village square'],
      cast: [{ name: 'Ranger Ada', role: 'left the clues' }, { name: 'Pip', role: 'the village kid who tags along' }],
      treasure: 'The ranger\'s gold, under the floor of the old tent.',
    };
  })(typeof window !== 'undefined' ? window : globalThis);
  ```

  The values above are an illustration, not Shell Quest's real outline. The page does not load it today. Keep it bundle-safe anyway (AGENTS.md rule 2): no `</script` or `</style` in it, and if a page ever loads it, use a relative `<script src="story.js">`.
- **Each leg**: a `story` string on its chapter object, next to `intro` and `badge`. One sentence: the clue, the puzzle and the find (`'A note in the clearing points to a cave; learn to look around and walk between folders, and find the cave entrance.'`). Learners see it on every mission as "The trail" strip (`shared/trail.js`, `shared/trail.css`; a playground renders it with `Trail.html(ch.story)` at the top of the mission view), and a global Story setting in the header (On by default, one `localStorage` key for every playground) hides it. Write the line to be read on its own, since it sits above every mission of its chapter. A Math scene may also carry a `story: { title, live, draw }` picture next to its own `title`, `live` and `draw`. It runs on the same params, formula, checks and screen-reader description, so only the picture and its live line change, and the same setting picks it: Story On shows it, Off shows the plain picture, and a scene without `story` always shows the plain one. Story drawings can use the `{ type: 'icon', name, x, y, size?, term? }` item, drawn from the small built-in set in `math/scene/svg2d.js` (add an icon there only when a picture needs it). Dress the shapes as world objects, not just label them: the bar of a fraction is a loaf or a pie, a grid of squares is paving, not a bar or grid with a caption. Story pictures change nouns only, never the numbers or expressions. A story picture keeps the plain picture's direction, axes and marks: its arrows, dots and points mean the same things in the same places, so mission text that names them ("the dot at the end of the second arrow", "a positive arrow points right") stays true in both. Only the dressing, the title and the live line change. `tests/math/content.test.mjs` checks the x-range and that every plain vector and point is drawn at the same coordinates.

`tests/trophy/catalog.test.mjs` checks both: every playground in `shared/catalog.js` has a `story.js` with a non-empty world, places, cast and treasure, and every chapter has a non-empty `story`. Playgrounds that have not been given their story yet are listed in `STORY_PENDING` in that test; the PR that writes a playground's story removes it from the list, and the test fails if a listed playground already has a `story.js`.

## 4. Rules

1. **The story never replaces the explanation.** The `how` steps and `explain` still say what the whole line does and how each part contributes (AGENTS.md rule 9). A story sentence may set up the task; it never stands in for the teaching. "Open the chest" is not a hint; "`cat` prints a file's contents" is.
2. **Teach before use applies to the story too** (AGENTS.md rule 12). A story sentence must not use a term the learner has not met. "The diary is in a hidden file" is fine only once hidden files have been taught, or if the sentence says what one is. Story words that are not technical (cave, ranger, lantern) are fine at any time.
3. **Whimsical, not silly.** Gentle wonder and a light joke are welcome: a grumpy lighthouse cat, a parrot that only speaks in errors. Slapstick, sarcasm and in-jokes are not. The learner is never the butt of the joke (see the `mission-voice` skill).
4. **World values, not placeholders.** File names, folders, hosts, variables, list items and numbers come from the world: `lantern.txt`, `harbor.local`, `crates = ['rope', 'map', 'compass']`, the 12 coins in the chest. No `foo`, `bar`, `test1`, `x = 5` when a world value would do. Math is no exception: count the coins, measure the bridge, share the treasure.
5. **One world per playground.** Every chapter and every tier stays in the same world with the same cast. A new tier is a new region of the same map, not a new story. Expert chapters are still legs of the hunt, not plain topic lessons.
6. **Keep it short.** A chapter intro carries the clue in one or two sentences; a goal carries at most one story clause before the task. The task itself stays one concrete, checkable thing.
7. **The story follows the course, not the other way round.** The dependency chain of lessons decides the order (`tiers-guideline.md` section 6). Fit the story to that order; never move a lesson to suit the plot.

## 5. Keeping saves and fixtures working

Giving an existing playground its story changes text and, where the checks allow, world data. Some things must not change:

- **Never reorder or renumber missions or chapters** that shipped (AGENTS.md rule 4). Saves are keyed `'<chapter>.<mission>'` and badges by chapter index. A leg that does not fit its chapter is rewritten, not moved.
- **Never rename a `localStorage` key** (`<name>-quest-v1`, `math-<track>-v1`).
- **Never regenerate `tests/fixtures/`** (AGENTS.md rule 3). Shell Quest's golden transcript and corpora record what the old content did. If renaming a file or a value would change a recorded output, keep the old value, or treat the change as its own reviewed decision as `tiers-guideline.md` describes.
- **World data may change** (file names, folder names, hosts, values) when every check, `answer`, test and fixture still agrees. Change the `answer`, `check`, `setup` and the tests together, and run the full test suite.
- **Badge and chapter names may change**: saves store badges by index, not by name. Keep `shared/catalog.js` mission counts unchanged (you are not adding or removing missions).

## 6. Checklist for a story PR

- [ ] `story.js` exists with world, places, cast and treasure, and the playground is removed from `STORY_PENDING`.
- [ ] Every chapter has a `story` line, and its intro gives the clue and its badge names the find.
- [ ] The strip shows the chapter's story line on every mission (first and later ones, desktop and 390px wide), and Story Off in the Settings panel hides it.
- [ ] Missions use world names and values; no `foo`/`bar` left where a world value fits.
- [ ] No story sentence uses a term before it is taught.
- [ ] No mission moved, no key renamed, no fixture touched; `npm run check && npm test` pass.
