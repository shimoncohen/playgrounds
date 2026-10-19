# Shell Quest tiers: design

Date: 2026-10-19
Status: draft for review

## Summary

Shell Quest today teaches the basics of bash in 7 chapters (52 missions). This
design extends it into a four-tier path, **Beginner, Intermediate, Advanced,
Expert**, and turns the tier mechanism into a reusable pattern for the other
playgrounds. Tiers are open: everything is unlocked, grouped and labelled with a
suggested order.

The work is one design delivered in three stages, each its own pull request.

## Goals

- Add three tiers of about 28 missions each (4 chapters x about 7 missions), up to
  expert-level shell craft, in the existing mission style.
- Make the simulated shell capable enough to teach them honestly: real
  multi-line scripts, control flow, text-processing tools, processes.
- Split Shell Quest into focused files so the engine, the content and the UI can
  be understood and tested independently.
- Provide a shared tier module and a written guideline so any playground can adopt
  tiers later.
- Keep every existing user's saved progress, exports and linked save files valid.

## Non-goals

- Tiering the other four playgrounds (documented, not done here).
- Locking or gating tiers.
- A free-practice sandbox.
- Running a real shell, or full bash compatibility. The shell is a documented
  subset and says so when something is unsupported.
- Changing the behaviour of the existing beginner chapters.

## Intent, as agreed

Learners with no experience should still start exactly where they do today.
Learners who already know the basics can jump straight to a later tier, so tiers
are open. Success means: a learner can progress from `pwd` to writing and debugging
non-trivial scripts without leaving the page; the beginner experience is unchanged;
adding a tier to another playground is a documented, mostly declarative task.

## Current state (verified in the code)

- `shell-quest/app.js` is one 717-line file holding the virtual filesystem, the
  shell engine, the mission content, the field guide, the quick-fire questions and
  the UI.
- `CH` is an array of 7 chapters with 8, 7, 7, 7, 7, 7 and 9 missions (52 total).
  A mission has `title`, `goal`, `anat` (token chips), `answer` (reference
  command), `explain`, and `check(c)`, where `c` is a context over a log of
  commands run (`c.ran(name, pred)`, `c.flag(entry, letter)`).
- A chapter has `name`, `badge`, `intro`, `setup()` (seeds files) and `missions`.
- Progress state `S` is saved as one JSON blob under `shell-quest-v1`:
  `done` is keyed `"<chapter>.<mission>"`, `badges` by chapter index, `xp`, `best`.
- XP is 10 per mission and 25 per chapter badge: 695 XP for all of Beginner.
- Ranks are derived from XP and not stored: Rookie 0, Apprentice 100,
  Navigator 250, Operator 420, Shell Wizard 600.
- The Field guide groups entries by chapter index, with a final "Handy extras"
  group whose index equals `CH.length` (7). This collides with new chapters and
  must be keyed explicitly.
- Quick-fire questions are `[prompt, [accepted command strings]]`.
- The engine supports about 30 commands, pipes, `>` `>>` `<`, `&&` `||` `;`,
  globs, variables, quoting and a one-line `for` loop. It runs one line at a time.

## Design

### 1. File structure

Plain classic scripts sharing one global namespace `SQ`, loaded in order from
`index.html`. No bundler is needed: `tools/build.py` already inlines local scripts
in order for the artifact bundle.

```
shared/
  tiers.js, tiers.css     tier model, grouped chapter rail, per-tier progress, ranks
docs/tiers-guideline.md
shell-quest/
  index.html, style.css
  engine/                 no DOM, runs in Node
    fs.js                 virtual filesystem and path helpers
    parse.js              tokenizer and parser (AST from stage 2)
    exec.js               executor, jobs, caps
    cmds-basic.js         today's commands
    cmds-text.js          cut, tr, sed, awk, tee, xargs, diff, ...
    cmds-sys.js           permissions, links, processes, env
  content/
    tier-beginner.js      today's chapters, moved unchanged
    tier-intermediate.js
    tier-advanced.js
    tier-expert.js
    guide.js
    quickfire.js
  ui.js                   rendering, terminal, editor panel, map
  app.js                  wiring and boot
```

### 2. Tier model (`shared/tiers.js`)

Declared by the playground:

```js
SQ.tiers = [
  { id: 'beginner',     name: 'Beginner',     blurb: 'Find your way around and handle files.',       missionXp: 10 },
  { id: 'intermediate', name: 'Intermediate', blurb: 'Process text and control what commands do.',   missionXp: 15 },
  { id: 'advanced',     name: 'Advanced',     blurb: 'Write real scripts with logic and functions.', missionXp: 20 },
  { id: 'expert',       name: 'Expert',       blurb: 'Craft robust, fast, debuggable tooling.',      missionXp: 25 },
];
// each chapter carries tier: 'beginner' | ...
```

The module provides: the chapter rail with a header per tier showing "x/y chapters",
a tier badge when every chapter in the tier has its badge, and rank thresholds.
Tier badges are **derived from chapter badges, not stored, and award no XP**.
Tiers are open: nothing is locked.

**Chapter order and keys.** Chapters stay in one global array. Existing chapters
keep indexes 0 to 6 and the same `"<chapter>.<mission>"` keys. New chapters are
appended in tier order: Intermediate 7 to 10, Advanced 11 to 14, Expert 15 to 18.
Saved progress therefore stays valid.

**Ranks.** The thresholds 0, 100, 250, 420, 600 are unchanged, but the rank at 600
is renamed from "Shell Wizard" to "Pipe Fitter" (the only visible change for
existing users, at 600 XP or more). Later ranks sit at each tier's cumulative XP,
computed from the content: "Script Smith" at the end of Intermediate (1215 XP),
"Automator" at the end of Advanced (1875 XP), "Shell Wizard" at the end of Expert
(2675 XP). With 28 missions per tier these figures are targets; the module computes
the real values from the content.

### 3. Engine, by stage

Each stage adds only what that stage's missions need. Unsupported syntax produces
"this practice shell does not support X yet", never silent wrong behaviour. Where a
feature is implemented, error messages follow real bash wording. Step and output
caps stop runaway scripts. Existing behaviour does not change.

**Stage 1 (Intermediate), still one line at a time**
- `$(...)`, single vs double quoting, `export`, `env`, `$?`.
- `2>`, `2>&1`, `/dev/null`.
- `tee`, `cut`, `tr`, `sed 's/a/b/g'` and `-n p`, `xargs`, `diff`, `basename`,
  `dirname`, `printf`, `seq`, `which`, `type`.
- Permissions: `ls -l` shows real `rwx` bits, `chmod` numeric and symbolic;
  `ln -s`, `stat`.

**Stage 2 (Advanced)**
- A real parser producing an AST replaces line-by-line handling: `if/elif/else`,
  `while/until`, `case`, functions, `[ ]`, `[[ ]]`, `test`, `$(( ))`.
- Positional parameters `$1 $@ $#`, `shift`, `read`, `exit`, `return`, `source`,
  here-docs and here-strings.
- An editor panel (`nano <file>` and `edit <file>`) for multi-line scripts, since
  the terminal takes one line at a time. It is a plain textarea with save and run
  controls, usable on touch devices with the existing extra-keys bar.

**Stage 3 (Expert)**
- `awk` subset: fields, `-F`, `BEGIN/END`, patterns, variables, simple arrays,
  `printf`.
- `sed` addresses, `-i`, `-E`; `grep -E -o -w -r -A -B`.
- A simulated process table: `ps`, `&`, `jobs`, `wait`, `kill`, `sleep`, `trap`,
  signals, `$!`.
- `find -exec`, `xargs -I` and `-P`, process substitution `<( )`,
  `set -euo pipefail`, `set -x`, `getopts`.

### 4. Content

| Tier | Chapters (4 each, about 7 missions) |
|---|---|
| Beginner (exists) | Where am I? · Make things · Copy, move, delete · Read files · Pipes · Wildcards & search · Your first script |
| Intermediate | Text tools · Substitution & quoting · Permissions & links · Streams & xargs (capstone: log janitor) |
| Advanced | Decisions · Loops & numbers · Functions & arguments · Real scripts (capstone: write a backup script) |
| Expert | awk & sed craft · Processes & jobs · Pipeline mastery · Safe, debuggable scripts (capstone: a robust CLI tool) |

**Mission kinds.** Every mission keeps a reference `answer`, which powers
"Type it for me" and the solvability test.
- `command` (default, as today): checked against the command log.
- `outcome`: checked against results or file state, however the learner got there.
  The check context gains `c.out()`, `c.exists(path)`, `c.read(path)`.
- `script`: the learner writes a file in the editor and the engine runs it against
  hidden cases `tests: [{ args, stdin, expectOut, expectCode }]`
  via `c.runScript(path, args, stdin)`.
- `challenge`: open-ended capstones with an outcome or script check.

Mission XP is 10 / 15 / 20 / 25 by tier; the chapter badge stays +25.
Each chapter's `setup()` seeds the files it needs (CSV data, an access log, config
files, a `scripts/` folder).

**Quick-fire** gets a per-tier question pool and a tier picker with "Mixed". **Field
guide** entries are tagged by tier and filterable; the "Handy extras" group gets an
explicit key instead of relying on `CH.length`.

### 5. Compatibility

- Existing saved state, exports and linked save files keep loading: the key
  `shell-quest-v1` and the `done`/`badges`/`xp` shapes do not change, and new
  fields have defaults.
- A fixture exported from today's version is part of the tests.
- Beginner chapter content moves unchanged.

### 6. Testing

Written first, test-driven.
- **Engine unit tests** in Node (`node:test`) for commands, parsing, quoting and
  the caps.
- **Solvability test** over every mission in every tier: in a fresh world, run the
  `answer` and assert the check passes.
- **Compatibility test**: import the fixture and assert XP, rank and chapter
  progress.
- **UI tests**: tier rail and progress, tier badge, editor panel, quick-fire tier
  picker.
- The existing smoke tests (tabs, export/import, linked file) stay green.
- `build.py --check` verifies the bundled artifact, including script order.
- CI gains a fast engine-test step.

### 7. Delivery

1. **Stage 1 (own PR):** behaviour-preserving split of `app.js` into
   `engine/`, `content/` and `ui` with every existing test green; `shared/tiers.js`;
   stage-1 engine features; Intermediate chapters; `docs/tiers-guideline.md`.
2. **Stage 2 (own PR):** parser rewrite, editor panel, script missions, Advanced.
3. **Stage 3 (own PR):** `awk`, process simulation, Expert.

Each stage gets a playthrough with screenshots before its PR.

### 8. Guideline for other playgrounds

`docs/tiers-guideline.md` covers: the tier model and open-tier policy; how to
declare tiers and tag chapters; the mission kinds and the check context; how to
keep saved progress compatible (append, never reorder); how ranks derive from
XP; the solvability test pattern; and a checklist for adopting tiers in another
playground.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Parser rewrite breaks beginner behaviour | The 52 beginner missions are a golden test; the rewrite starts only after the split is verified; the rewrite is stage 2 |
| `awk` and `sed` grow without bound | Add features only when a mission needs them; the subset is documented |
| Unwinnable or ambiguous missions across about 84 new ones | The solvability test; outcome checks accept any valid solution |
| Runaway or noisy scripts | Step and output caps |
| Editor is awkward on phones | Plain textarea plus the extra-keys bar; checked in the stage-2 playthrough |
| Existing users see a rank rename at 600 XP | Documented; thresholds are unchanged, only the top rank's name moves |

## Decisions log

- Tiers are open, not gated (chosen).
- Four tiers, full scope, delivered in three stages (chosen).
- Approach C: file split, shared tier module, written guideline (chosen).
- Tier badges cosmetic, no XP (to keep ranks and migration simple).
- Chapters appended in tier order so saved progress stays valid.
