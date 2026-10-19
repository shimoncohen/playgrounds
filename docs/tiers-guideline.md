# Tiers guideline

How to add difficulty tiers (Beginner, Intermediate, ...) to a playground, and how to write missions that hold up. Shell Quest is the reference implementation; every claim here is checked against its code. The design is in `docs/superpowers/specs/2026-10-19-shell-quest-tiers-design.md`.

## 1. The tier model

A tier is a named group of chapters with one XP value per mission. The tiers are Beginner (10 XP), Intermediate (15), Advanced (20) and Expert (25). A chapter badge is always +25 XP, whatever the tier.

Tiers are **open**: nothing is locked. A learner can click any chapter in the rail at any time. Tiers only group, label and pay out differently. A tier counts as complete when every one of its chapters has its badge, and that is **derived**, not stored: there is no tier state in the saved JSON, and a tier badge awards no XP. A tier with no chapters yet (Advanced and Expert today) is declared but not drawn.

## 2. Declaring tiers and tagging chapters

`shared/tiers.js` is a pure module (no DOM except `Tiers.renderRail`). Create the model once, before the content files load. Shell Quest does it in `shell-quest/content/tiers.js`:

```js
SQ.tiers = window.Tiers.create({
  tiers: [{ id: 'beginner', name: 'Beginner', blurb: '...', missionXp: 10 }, /* ... */],
  chapters: SQ.content.chapters,   // the live array; content files push into it later
  baseRanks: [[0, 'Rookie'], [100, 'Apprentice'], [250, 'Navigator'], [420, 'Operator'], [600, 'Pipe Fitter']],
  tierEndRanks: { intermediate: 'Script Smith', advanced: 'Automator', expert: 'Shell Wizard' }
});
```

Each chapter carries `tier: 'intermediate'`. What you get back:

- `tierOf(ch)` returns the tier of chapter index `ch` (the first tier if the tag is missing or unknown).
- `missionXp(ch)` is the XP for one mission in that chapter. The app uses it when a mission completes; `chapterBadgeXp` is the 25.
- `status(S)` gives, per tier, its chapter indexes, `chaptersDone`, `missionsDone`, `missionsTotal` and `complete`. Pass the saved state `S` (`S.done`, `S.badges`).
- `ranks()` and `rankFor(xp)` give the rank ladder and the rank (name, index, `lo`, `hi`) for an XP total.
- `Tiers.renderRail(container, { status, chapters, S, onPick })` draws a `.tierhead` per tier that has chapters, then that tier's chapter buttons. Load `shared/tiers.css` next to your own stylesheet; it uses the host page's theme variables.

**Ranks derive from cumulative XP.** `ranks()` is `baseRanks` plus one entry per tier that has chapters and a name in `tierEndRanks`. That entry sits at the XP of finishing everything up to and including that tier: `sum(missions * missionXp + 25)`. Shell Quest: Beginner ends at 695, Intermediate at 1230 ("Script Smith"). Add chapters to a tier and its threshold moves by itself; never type the number.

## 3. Mission kinds and the check context

A mission is `{ title, goal, anat, answer, explain, check, hint?, note? }`. `answer` is the reference solution: it powers "Type it for me" and the solvability test. `check(ctx)` decides whether the learner passed.

Kinds that exist **today**:

- `command` (the default; no field needed): the check reads what the learner just ran, from the command log.
- `outcome`: the check reads the resulting state (files, modes, links, exported variables, the output of a command) and accepts any way of getting there. Intermediate missions are written this way. There is no separate flag; it is a style of check, built from the helpers below.

Kinds that arrive in **stage 2** (not in the code yet, do not use them): `script`, where the learner writes a file in an editor and the engine runs it against hidden cases, and `challenge`, an open-ended capstone with an outcome or script check. The design mentions `c.out()`, `c.exists()` and `c.runScript()`; none of those exist today.

The check context is built per line by `SQ.ctxFor(line)` in `shell-quest/engine/exec.js`. The real helpers:

| Helper | Meaning |
|---|---|
| `c.line`, `c.cwd` | the line just typed, the working directory |
| `c.log` | command log for this line only: `{name, args, globbed, piped, redirect, errRedirect, code, out}` per command that ran |
| `c.ran(name, pred?)` | some logged command has that name (and `pred(entry)` is true) |
| `c.flag(entry, ch)` | the entry has a short option containing `ch` (`-rf` has `r`) |
| `c.has(p)`, `c.isDir(p)`, `c.isFile(p)` | path exists, is a folder, is a file (`~` and relative paths work) |
| `c.node(p)` | the raw file-system node, for modes or link targets (`SQ.modeOf(node)`) |
| `c.read(p)` | file content, or `''` if it is not a file |

Examples:

```js
// command style: the right command ran with the right option
check: c => c.ran('grep', e => c.flag(e, 'i'))

// outcome style: the folder exists, however it was made
check: c => c.isDir('~/camp/tools')

// outcome style against data: output must equal what the real file says
check: c => {
  const want = c.read('~/village/sales.csv').split('\n').filter(Boolean).map(l => l.split(',')[0]).join('\n');
  return !!want && c.ran('cut', e => e.out.trim() === want);
}

// output-only is not enough on its own: also require the file ended up right
check: c => c.log.some((e, k) => e.name === 'tee' && k > 0 && c.log[k - 1].name === 'ls' && e.out.trim() === c.log[k - 1].out.trim())
```

## 4. Keeping saved progress compatible

Learners already have saves, exports and linked save files. They must keep loading.

1. **Append chapters, never reorder or remove.** Chapters live in one global array; indexes are the identity. New tiers go at the end, in tier order.
2. **Keys are `'<chapter>.<mission>'`** (`S.done['7.0']`, `S.badges[7]`). Never insert a mission in the middle of a chapter that has shipped; add to the end.
3. **New state fields need defaults** in `fresh()`. The loader is `Object.assign(fresh(), saved)`, so old saves pick the default up.
4. **Never rename the `localStorage` key** (`shell-quest-v1`, set in `window.PROGRESS` in `index.html` and in `engine/fs.js`). Exports and the linked file are matched to it.
5. **Rank renames only change names.** Thresholds are derived from XP, so a rename never changes anyone's progress. (The 600 XP rank went from "Shell Wizard" to "Pipe Fitter" this way.)
6. Tier badges are derived, so there is nothing to migrate when a tier is added.

**Golden-transcript guard.** `tests/shell-golden.mjs` plays every Beginner mission through the real UI with "Type it for me" and compares the terminal text, XP and final export to `tests/fixtures/shell-beginner-golden.json` and `shell-progress-beginner-complete.json`. It walks the Beginner chapters only (`BEGINNER_CHAPTERS = 7`). Content you add later is covered by other tests, so this one must stay byte-identical; fix the code, never regenerate the fixtures (`UPDATE_GOLDEN=1` is for a deliberate change to old content, reviewed on its own). The smoke tests also import the fixture to prove an old save still loads (695 XP, "Pipe Fitter").

## 5. Tests for new content

**Solvability.** `tests/shell/solvability.test.mjs` loads the engine and content in Node (`tests/shell/harness.mjs`, a `vm` context with no DOM), and for every chapter calls `setup()` then runs each mission's `answer` and asserts `check(ctxFor(answer))`. Use the harness `run(SQ, line)`: it resets the command log first, exactly like the app. A mission whose answer needs two steps gets an explicit override (see `TWO_STEP`), never a loosened check.

**Wrong-command and alternative-solution tests.** For each non-trivial mission, assert both directions with a fresh world (`tests/shell/intermediate.test.mjs`):

```js
const yes = (ch, m, line, pre) => assert.ok(judge(ch, m, line, pre), `should accept: ${line}`);
const no  = (ch, m, line, pre) => assert.ok(!judge(ch, m, line, pre), `should reject: ${line}`);
yes(T8, 0, 'cut -f1 -d, village/sales.csv');   // option order differs
no (T8, 0, 'cut -d, -f2 village/sales.csv');   // right command, wrong result
no (T8, 0, 'cat village/sales.csv');           // looks related, teaches nothing
```

`judge` sets up the chapter in a fresh world, runs the `pre` lines (not judged, each with its own log reset), runs the line, then calls the check. Cover: at least one valid alternative, the nearest wrong command, and a repeat of an earlier answer when the check could be satisfied by leftovers.

## 6. Mission-authoring pitfalls

All of these were found in review of the Intermediate tier.

- **Output-only checks.** "The output contains X" is satisfied by `echo X`. Check the real effect (file content, mode, link, variable) or compare output with what the data says.
- **Hardcoded files.** Derive expected values from the world (`c.read(...)`), so a changed seed or an alternative path still works. Accept any file name the learner chose when the goal does not name one.
- **Accept alternatives.** If two sensible commands reach the outcome (`2>/dev/null` or `2> errors.txt`, `xargs rm` or `xargs rm -f`), accept both; reject only what teaches the wrong thing.
- **Per-line log reset.** The app resets the log before every typed line, so a check never sees an earlier line. A mission that spans lines (run a failing command, then `echo $?`) must read state that outlives the line. The exit code from before the line is `SQ.rt.prevLast`; it lives on `SQ.rt`, not in saved state. Test such missions with the log reset per line, not as one big `run`.
- **Fresh-world jump-in.** Learners can open any chapter first, and "Reset world" re-runs only the current `setup()`. Setup must create everything the chapter needs with `ensureFile` / `ensureDir` (they never overwrite learner work). Don't rely on an earlier chapter, and don't let one mission destroy files a later mission in the same chapter needs (the 11.5 `xargs rm` mission works on a scratch folder for this reason).
- **Factual explain text.** `explain` is read as truth. Test every claim it makes against the engine (`man`, `help`, run it). Don't describe options the practice shell doesn't support; unsupported options print "this practice shell does not support X yet" rather than doing something silently wrong.
- **Exact-match quick-fire.** Quick-fire answers are compared after dropping quotes and collapsing spaces. When the quoting is the lesson (`echo '$HOME'`), add `{exact:true}` as the fourth tuple element, so only whitespace is normalised.

## 7. Guide and quick-fire tags

- **Guide.** Entries are `{c, ch, what, syn, ex}`. `ch` is the chapter index; the entry's tier is `tierOf(ch)`, so there is no separate tier tag to forget. `ch: 'extras'` puts an entry under "Handy extras", which has its own key and shows only under the All filter. The tier filter buttons are built from the tiers that have chapters.
- **Quick-fire.** Entries are `[task, [accepted answers], tier?, {exact:true}?]`. A missing tier means `'beginner'`. The tier picker shows "Mixed" plus every tier that has at least one question, and a round draws only from the chosen pool.

## 8. File layout for a playground

```
<name>-quest/
  index.html          markup; loads scripts in the order below
  style.css
  engine/             domain logic, no DOM (file system, parser, commands, exec + ctxFor)
  content/            tiers.js (Tiers.create), tier-<id>.js (chapters), guide.js, quickfire.js
  ui.js               rendering helpers
  app.js              wiring: events, mission completion, quick-fire
shared/               progress.js/.css, tiers.js/.css
```

Load order in `index.html`: `shared/progress.js`, `shared/tiers.js`, `engine/*`, `content/tiers.js`, the `content/tier-*.js` files in tier order, `guide.js`, `quickfire.js`, `ui.js`, `app.js`. `tools/build.py` inlines local scripts in the order they appear, and the Node harness reads that same list from `index.html`, so one source of truth. The bundle is tested in `tests/smoke.mjs`.

## 9. Adoption checklist (another playground, e.g. python-quest)

1. Put the new playground's saved-state shape on paper: where chapter, mission, `done`, `badges` and XP live, and the `localStorage` key. Keep all of it.
2. Capture a golden: export a complete save and a transcript of every existing mission, and add a test that replays them. Do this **before** touching anything.
3. Split code into engine / content / ui / app files with a shared namespace, keeping behaviour byte-identical; run the golden after each step.
4. Add `shared/tiers.js` and `shared/tiers.css`; create `content/tiers.js` with `Tiers.create`; tag every existing chapter `tier: 'beginner'` (this changes no behaviour).
5. Replace the hardcoded XP-per-mission, badge XP and rank table with `tiers.missionXp(ch)`, `chapterBadgeXp` and `rankFor`. Pick `baseRanks` and `tierEndRanks` so existing thresholds are unchanged.
6. Draw the rail with `Tiers.renderRail` and keep the chapter button markup the same.
7. Add a `check` context with helpers like the ones in section 3, and write the first new tier as outcome-style checks.
8. Add solvability and wrong-command tests for every new chapter, and an import test for the old save fixture.
9. Tag guide entries by chapter and quick-fire by tier; add the tier filter and picker.
10. Add the bundle smoke test, run `python3 tools/build.py --check`, and wire the Node tests into CI before the browser tests.
11. Play every new chapter by hand at desktop width and 390 px, in light and dark.
