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
    fs.js                 virtual filesystem, path helpers, save, run caps (LIM) and safeRegex
    parse.js              tokenizer and parser; line-based by design (AST arrives in stage 2)
    exec.js               executor (one line at a time), caps, ctxFor; no jobs yet
    cmds-basic.js         the original commands plus sort -t/-k, find, grep flags
    cmds-text.js          cut, tr, sed, tee, xargs, diff, seq, printf, basename, dirname
    cmds-sys.js           permissions, links, env, which/type; no processes yet
  content/
    tiers.js              Tiers.create(...): tier list, base ranks, end-of-tier ranks
    tier-beginner.js      today's chapters, moved unchanged
    tier-intermediate.js  (stage 1)
    tier-advanced.js, tier-expert.js   (later stages)
    guide.js
    quickfire.js
  ui.js                   rendering, terminal, map (no editor panel yet; stage 2)
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

## Stage 1 as built

Stage 1 shipped the file split, `shared/tiers.js`, the Intermediate tier (chapters 8 to 11 in the UI, indexes 7 to 10, 29 missions, "Script Smith" at 1230 XP), the tier-aware guide and quick-fire, and the engine commands it needs. What differs from the plan above:

- **Mission kinds.** Only `command` and outcome-style checks exist. `c.out()`, `c.exists()` and `c.runScript()` do not exist yet; checks use the real helpers listed in `docs/tiers-guideline.md` (`ran`, `flag`, `has`, `isDir`, `isFile`, `node`, `read`, `log`). `script` and `challenge` missions are stage 2.
- **Ranks.** The tier-end rank sits at the derived cumulative XP (695 for Beginner, which keeps the 600 XP "Pipe Fitter" rank from the base list; 1230 for Intermediate).
- **Run-time expansion.** Variable and `$(...)` expansion happens while a line runs, so a mission check sees the log of the current line only; `SQ.rt.prevLast` carries the earlier exit code for `$?` missions.
- **Caps.** Step, output, file-size and regex-complexity caps are in (`SQ.LIM`, `SQ.safeRegex`); there is no job control or process model.
- **Golden.** `tests/shell-golden.mjs` replays the seven Beginner chapters only. Later tiers are covered by solvability, wrong-command and alternative-solution tests in `tests/shell/`.
- **Parser.** `parse.js` stays line-based; the AST rewrite is part of stage 2.

## Stage 2 as built

Stage 2 shipped the AST parser and interpreter, the editor panel, `script` and `challenge` missions and the Advanced tier: chapters 12 to 15 in the UI (indexes 11 to 14), Decisions, Loops & numbers, Functions & arguments and Real scripts, 7 missions each (28, six of them script missions and the 15.7 backup capstone a challenge), 20 XP per mission, "Automator" at 1890 XP. How to write such missions is in `docs/tiers-guideline.md` (sections 3a, 3b and 6). The Beginner golden transcript is byte-identical, and a differential corpus of about 1,100 lines recorded from the Stage 1 engine (`tests/shell/corpus.test.mjs`) proves that everything else a learner could already type behaves the same, apart from entries marked `expectChange` and overridden, with a reason, in `tests/fixtures/shell-corpus-allow.json`.

**Deviations from the plan.**

- The interpreter task was split in two, 6a (parse swap, lists, pipelines, if/while/until/for, groups) and 6b (case, functions and frames, subshells, here-documents), each with its own review.
- Task 11b was inserted before the last content task: mission 14.7 needed `>&2` and stderr checks, so the engine gained `>&2` / `1>&2` and `scriptPasses` gained `expectErr` / `expectErrMatch`.
- The tokenizer carried a `legacy` flag (the old line-based behaviour) while the AST parser was built beside it; Task 6a wired the parser in and removed the flag. The tokenizer's `pos` option gives the AST parser source offsets and raw `(( ))` / `[[ ]]` spans.
- Each stage of a multi-command pipeline runs in a subshell (`echo Ada | read x` leaves `x` unset, as in bash). Stage 2 left `cd` and `shift` leaking into the shell, because an unmarked corpus entry pinned `cd forest | cat`; Stage 3 Task 3 closed that (the entry is now marked `expectChange` with an allow-list reason): a stage restores the directory, variables, exports, functions and positional parameters, while files stay shared.
- `local` is a save and restore in `S.vars` through the function's frame (dynamic scope), not a separate scope object.
- `source` runs the file in the current shell under a `'source'` frame; `return` ends the file.
- Word splitting (Stage 3 Task 4): an unquoted `$var`, `${..}`, `$( )`, `$(( ))` and `$@`/`$*` are split on `IFS` (`SQ.splitFields`) and then globbed, an empty unquoted expansion vanishes, and `"$*"` joins with the first `IFS` character. Assignment values, here-documents, `[[ ]]`, `case` words, here-strings, redirect targets and the `NAME=value` arguments of `export`/`local` never split. `IFS` defaults to space, tab and newline, and `unset IFS` restores that splitting. `VAR=x cmd` prefix assignments (the AST `Simple.assigns`) are expanded after the words, set and exported for that command only, and restored afterwards; `read` splits on `IFS`. Globbing the split fields is charged to the step budget (one step per pattern plus one per 100 names looked at), and the words of one command are capped at 500,000 or 2,000,000 characters (`the expanded words grew too large`).
- Script and challenge checks run in `SQ.sandbox`, a throwaway copy of the whole state that never writes `localStorage`. A mission can name the world its check judges (`m.world`), and the failure line is computed in that same world (`SQ.missionVerdict`).
- "Automator" sits at the XP computed from the content, 1890, not the 1875 target above.

**Caps.** `SQ.LIM` (20,000 steps per typed line, 2,000 screen lines, 1,000,000 characters per file or output, 5,000,000 output characters per line, 1,500,000 characters of saved state, 200-character patterns); 20,000 tokens per program; parser nesting 100; interpreter nesting 250 across compounds, `$( )` and scripts (`IMAX`); function and `source` nesting 100; scripts nested 6 deep; `${X#p}` / `%` / `/` patterns of 200 characters on values of at most 5,000; 20 test cases per script mission and 2,000 reported characters per case. Expansion and `[`/`[[` expression nesting stops at 100 levels with `bash: syntax error: nesting too deep` (status 2), and a JS stack overflow that still escapes prints the same line. The saved-state cap is enforced by `writeFile` for writes that grow the world by more than 1,000 characters, by `cp` before a big copy, and for everything else once `SQ.rt.grewBy` (characters written since the last check) passes 50,000, from `writeFile`, `cp` and `step()`, and once at the end of the typed line (`SQ.checkState`, no rollback; `grewBy` resets at the start of each typed line and on an editor Save, and `mv` adds nothing). A variable longer than `LIM.VAR` (1,000,000 characters) stops the command with `a value grew too large`; any other JS `RangeError` prints the same line, and Firefox's `too much recursion` reads as the nesting message. File-system children maps have no prototype (`SQ.fixTree` rebuilds them after a JSON round trip), so names such as `constructor` or `__proto__` are ordinary file names.

**Still unsupported or different from bash (known limitations).**

- *State cap counts file text only.* Names, links and variables are not part of the saved-state cap (a variable is capped separately at `LIM.VAR`, 1,000,000 characters, since Stage 3 Task 2). Since Task 2 the characters a command writes are counted (`SQ.rt.grewBy`) and the world is measured once they pass 50,000, inside `writeFile` and `cp` as well as every step, so a world can pass the cap by about 60,000 characters, not several times over. Recovery is `rm`.
- *Smaller:* script missions in an over-cap world fail with a confusing case line; 15.5's here-document check accepts `<<EOF` inside a quoted string; `echo a 2>&10` is not refused.

- Not there at all (Stage 3 or later): arrays, `set` (`-e`, `-x`, `--`), `trap`, `getopts`, `awk`, a process table (`ps`, `kill`, `sleep`, `jobs`), `declare`, `let`, `BASH_REMATCH`.
- *Background jobs (Stage 3 Task 12a; `jobs`/`wait`/`kill`/`$!` are Task 12b, next entry).* Jobs run lazily when the virtual clock moves, as generators that yield at `sleep`. Differences from bash: a `$( )` does not wait for the stdout of a job started inside it (`x=$( (sleep 1; echo cap) & echo got )` gives `got`; the job's `cap` reaches the screen later); a `sleep` inside a unit that runs in one go (a multi-stage pipeline, `$( )`, a redirected compound, a sourced file or a script started by the job) is paid after that unit, so its output comes early; job output that comes due during a foreground `$( )` is shown with the error colour (it travels with that command's stderr); job output during `xargs sleep` / `find -exec sleep` is lost; job slices have a step allowance of `LIM.STEPS` each and `3 x LIM.STEPS` together per typed line (the job that crosses a limit is stopped, the other due jobs wait for the next line); after the 200-process cap a surviving spawner (`while :; do x & sleep 1; done &`) prints up to `LIM.LINES` fork errors per line until it ends or the world is reset; `[N] PID` is printed only for typed lines.
- *`jobs`, `wait`, `kill`, `$!`, job notices (Stage 3 Task 12b).* Formats, job specs, `kill -l` and error wording follow bash 5.2 (state field 24 columns, so `Exit 3` is followed by 18 spaces; a signal's notice is its strsignal text: `Killed`, `Hangup`, ...). Differences from bash: notices always close the typed line (bash 5.2 also prints them as soon as a foreground command finishes); the command text is the source as typed (bash reprints its own copy, `( exit 3 )`); a non-interactive shell (script, subshell, `$( )`, job) drops a finished job's record at once and prints no notice or `Terminated` message (its status stays for `wait PID`); `wait` waits only for the current shell's own jobs (in `$( )` and pipeline stages too, where `jobs` and `kill` see the parent's table); a wait longer than `LIM.SLEEP` or for ever stops with `that wait is too long`; inside a job, a `wait` that would block anywhere but a plain command (in a pipeline, redirected compound, `$( )` or a script the job runs) prints the unsupported message; a stopped job that receives a terminating signal ends at once (bash waits for `SIGCONT`), and a job that stops itself runs on until it next sleeps; `kill $$` and every other signal to the shell itself is unsupported until Task 14 (`kill -0 $$` works); `jobs -x` is unsupported; `%+`/`%-` follow start/stop order only.
- *`set` options, `bash -c/-n/-x` (Stage 3 Task 13).* `set -e -u -x -o pipefail` (combined letters, `-o NAME`/`+o NAME`), `set --`/`set ARGS` (positional parameters of the current frame), `set -o`/`set +o` listings (all 27 bash names in bash order, values of `bash -c`; only the four modelled ones change), `set` alone (variables only, no functions), `bash`/`sh` `-c TEXT [name args]`, `-n`, `-x`, `-e`, `-u`, `-o NAME`. Semantics follow bash 5.2: `set -e` is ignored in conditions, non-last `&&`/`||` commands, `!` and everything they call, and off inside `$( )` (no `inherit_errexit`). Differences from bash: a typed line under `set -e`/`set -u` stops only that line (the page never closes); messages keep the `bash: NAME: unbound variable` form inside scripts and `bash -c` and the status is 1 (bash -c gives 127); xtrace shows `[[ ]]`/`(( ))` operands as written, traces `export x=1` once and does not `$'...'`-quote non-ASCII; an unbound variable in a here-document body ends the line (bash goes on); other valid `set`/`bash` letters print the unsupported message; `$-` and `PIPESTATUS` are not supported; a script's stdout and stderr now reach the screen in the order written (they used to print stderr first).
- Backquote command substitution (`` `cmd` ``) is not supported: the text stays literal. Since prefix assignments exist (Stage 3 Task 4), `` x=`echo a b` `` misparses as the prefix `` x=`echo `` followed by the command `a`; accepted as a documented limitation.
- `X=1 export X` (a prefix assignment in front of a special builtin) is restored afterwards and not exported; bash 5.2 keeps `X=1` and exports it. Every prefix assignment is restored after its command here.
- An unquoted `${u:-"a b"}` splits into `a` and `b`: the quoting inside the operand is lost (bash keeps one word `a b`). Quote the whole expansion.
- A redirect target that would split or is empty (`echo hi > $x` with `x="a b"` or empty) is used as one word (`echo hi > $x` writes the file `a b`; an empty target says `bash: : Is a directory`) instead of bash's `bash: $x: ambiguous redirect`. This predates Task 4.
- The `[`/`test` error wording follows the operand position, not bash's argument-count rules, so a split operand can name a different word: `[ $UNSET = x ]` says `=: binary operator expected` (bash: `unary operator expected`), `[ $x = "a b" ]` with `x="a b"` says `a: binary operator expected` (bash: `too many arguments`). The status (2) and the false result match.
- `local -r` is rejected; function names with `-` or `.` are a syntax error; `${V/#a/_}` (anchored substitution) does nothing.
- `while read` also hands over a last line with no trailing newline (bash drops it). Files in this world never end in a newline, so this matches the rest of the shell.
- `$( )` skips here-documents textually: `<<` inside an arithmetic `(( ))` within a `$( )` is handled, but a function definition with a here-document redirect (`f() {...} <<EOF`) does not keep its body; a `$( )` inside a loop with redirected stdin does not inherit it.
- One unsupported construct anywhere in a script stops the whole file before it runs. (Since Stage 3 Task 3 a script syntax error reads `s.sh: line 3: syntax error near unexpected token 'fi'`, with the path as typed and the line of the offending token; an unexpected end of file names the last line of the text, and `source` still prints the plain `bash:` form.)
- A typed here-document cannot span lines at the prompt (the terminal takes one line at a time); scripts use them. A typed `exit` prints a friendly message instead of closing anything.
- `$0` inside a function is the function name; `xargs` cannot call a function.
- `help` lists only the Beginner commands (an unmarked `help cd` corpus entry pins its text); `man` and `type` cover the rest.
- File-descriptor duplication other than `2>&1`, `>&2` and `1>&2` (`2>&2`, `2>&-`, `>&-`, `3>&1`) prints "this practice shell does not support >& yet".
- `__proto__` is refused as a variable or function name ("not a valid identifier"); names such as `constructor` or `toString` behave like any other unset name.

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
