# Tiers guideline

How to add difficulty tiers (Beginner, Intermediate, ...) to a playground, and how to write missions that hold up. Shell Quest is the reference implementation; every claim here is checked against its code. The design is in `docs/superpowers/specs/2026-10-19-shell-quest-tiers-design.md`.

## 1. The tier model

A tier is a named group of chapters with one XP value per mission. The tiers are Beginner (10 XP), Intermediate (15), Advanced (20) and Expert (25). A chapter badge is always +25 XP, whatever the tier.

Tiers are **open**: nothing is locked. A learner can click any chapter in the rail at any time. Tiers only group, label and pay out differently. A tier counts as complete when every one of its chapters has its badge, and that is **derived**, not stored: there is no tier state in the saved JSON, and a tier badge awards no XP. A tier with no chapters yet is declared but not drawn.

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

- `tierOf(ch)` returns the tier **object** (`{id, name, blurb, missionXp}`) of chapter index `ch`, or the first tier if the tag is missing or unknown.
- `missionXp(ch)` is the XP for one mission in that chapter. The app uses it when a mission completes; `chapterBadgeXp` is the 25.
- `status(S)` gives, per tier, its chapter indexes, `chaptersDone`, `missionsDone`, `missionsTotal` and `complete`. Pass the saved state `S` (`S.done`, `S.badges`).
- `ranks()` and `rankFor(xp)` give the rank ladder and the rank (name, index, `lo`, `hi`) for an XP total.
- `Tiers.renderRail(container, { status, chapters, S, onPick })` draws a `.tierhead` per tier that has chapters, then that tier's chapter buttons. Load `shared/tiers.css` next to your own stylesheet; it uses the host page's theme variables `--muted`, `--ink`, `--accent-text` and `--line`, so define those (or map them) in your `style.css`.

**Ranks derive from cumulative XP.** `ranks()` is `baseRanks` plus one entry per tier that has chapters and a name in `tierEndRanks`. That entry sits at the XP of finishing everything up to and including that tier: `sum(missions * missionXp + 25)`. Shell Quest: Beginner ends at 695, Intermediate at 1230 ("Script Smith"), Advanced at 1890 ("Automator"), and Expert at the end of its chapters ("Shell Wizard", the top rank). Add chapters to a tier and its threshold moves by itself; never type the number.

## 3. Mission kinds and the check context

A mission is `{ title, goal, anat, how, answer, explain, check, hint?, note? }`. `answer` is the reference solution: it powers "Type it for me" and the solvability test. `check(ctx)` decides whether the learner passed. `how` explains the line step by step; see "Explain the whole, then the parts" below.

There are four kinds:

- `command` (the default; no field needed): the check reads what the learner just ran, from the command log.
- `outcome`: the check reads the resulting state (files, modes, links, exported variables, what the line printed) and accepts any way of getting there. Intermediate missions are written this way. There is no separate flag; it is a style of check, built from the helpers below.
- `script` (`kind: 'script'`): the learner writes a file in the editor panel, and the engine runs it against test cases in a sandbox. See section 3a.
- `challenge` (`kind: 'challenge'`): a capstone. It has the same fields as a script mission, plus usually its own `check` (which wins over the cases) and a `world`. The mission card shows a "Challenge" tag.

**Explain the whole, then the parts.** A card that only labels pieces (a chip that says `option`, an `explain` that covers one flag) leaves the learner guessing what the line is *for*. So every mission carries `how`, rendered as a numbered "How it works" list by `shared/how.js` (styled by `shared/how.css`, loaded by every quest):

```js
{ title: 'Ignore upper and lower case', goal: '...',
  anat: [['grep','cmd'], ['-i','opt','ignore case'], ['wolf','arg','what to find'], ['journal.txt','arg','where to look']],
  how: [
    '<code>grep -i wolf journal.txt</code> finds every line with wolf in it, however it is capitalised.',   // 1. the whole
    '<code>grep</code> is the command: search inside text.',                                                    // 2. each part,
    '<code>-i</code> is an option: <b>i</b>gnore case. Now wolf, Wolf and WOLF all match.',                    //    tied to the whole
    '<code>wolf</code> is what to look for and <code>journal.txt</code> is where to look.',
  ],
  explain: '...',   // the extra fact or gotcha, not a repeat of the steps
  ... }
```

Rules: step 1 is one plain sentence about the whole line (what goes in, what comes out); later steps go left to right, one part each, and say how the part changes the whole; end with what the learner will see or one common slip; 3 to 5 steps; never an unexplained term (introduce it, or link it to something taught earlier); variables stay quoted and inside `<code>`. A chip's third element is a short meaning (a few words) that replaces the bare kind label; use it for options, operators and arguments whose role is not obvious. Every quest renders `m.how` (Harbor Quest reads `how` on its `{t,i,g,a,h,ans,ok}` missions too), so the same field works everywhere. It is optional in the data so old missions keep rendering, but new and changed missions must have it, and `tests/shell/how.test.mjs` requires it for every Beginner mission.

The check context is built per line by `SQ.ctxFor(line)` in `shell-quest/engine/exec.js`. The real helpers:

| Helper | Meaning |
|---|---|
| `c.line`, `c.cwd` | the line just typed, the working directory. After an editor Save the line is the pseudo-line `(saved <path>)` and the log is empty |
| `c.log` | command log for this line only: `{name, args, globbed, piped, redirect, errRedirect, code, out}` per command that ran (`errRedirect` is only set when `2>` was used, so treat it as optional). Compounds log too, after they finish: `if`, `while`, `until`, `case`, `[[`, `((` (no words, status as `code`), `for` (its items as `args`, logged before the body) and `(fn)` for a function definition. A function **call** is not logged, only the commands inside it |
| `c.ran(name, pred?)` | some logged command has that name (and `pred(entry)` is true) |
| `c.flag(entry, ch)` | the entry has a short option containing `ch` (`-rf` has `r`) |
| `c.has(p)` / `c.exists(p)`, `c.isDir(p)`, `c.isFile(p)` | path exists, is a folder, is a file (`~` and relative paths are taken from the home folder) |
| `c.node(p)` | the raw file-system node, for modes or link targets (`SQ.modeOf(node)`) |
| `c.read(p)` | file content, or `''` if it is not a file |
| `c.out()` | everything the whole line printed on stdout (`SQ.rt.lastOut`), so a check can judge `x=1; while ...; done` as one unit |
| `c.runScript(path, args, stdin)` | runs a script in the sandbox from the home folder: `{out, err, code}` (`err` is an array of lines). A runaway script is a result (`thrown: true`), never an exception |
| `c.scriptPasses(m)` | runs mission `m`'s test cases in the sandbox: `{ok: true}` or `{ok: false, failed: {index, label, expected, got}}` (`index` -1 means the file is missing) |
| `c.err()` | everything the line printed on stderr: error messages, `set -x` traces, the `[1] 1235` job notice (`SQ.rt.lastErr`); never tips, background-job output or the closing `[1]+  Done` notices. `''` after an editor Save |
| `c.status()` | `$?` after the line (`S.last`) |
| `c.jobs()` | copies of the job table, `{id, pid, cmd, state, code, owner, reaped, desc?}` (`state` `Running`, `Stopped`, `Done`, `Terminated`; `cmd` without the `&`; `owner` 0 for the learner's own jobs), plus the jobs whose records were cleared during the line (`reaped: true`): `sleep 100 & kill %1` lists `{state: 'Terminated', code: 143, reaped: true}`, the next line lists nothing. jobs that scripts and `bash -c` started (`owner` not 0, orphans included) are listed too, so filter `j.owner === 0` before counting jobs or testing a state: "no jobs left" is `c.jobs().filter(j => j.owner === 0).every(j => j.state !== 'Running')`. Shell Quest's Expert chapter 17 (`content/tier-expert.js`) has the worked examples: `myJobs`, and `startedHere` for "a job started on this line" (its `[N] PID` notice is in `c.err()`) |
| `c.clock()` | the virtual clock in seconds, after the line's own 1-second cost (procs.js). A fresh world starts at 0; Reset world and a chapter switch put it back to 0 |
| `c.elapsed()` | the virtual seconds the line itself took, without its 1-second cost: `sleep 5 & wait` gives 5, `echo hi` 0. Use it for "the clock advanced by at least N" |
| `c.ps()` | copies of the process table, `{pid, ppid, cmd, start, state}`; the shell itself is `{pid: 1234, cmd: 'bash'}` |
| `c.tmpFiles()` | the names under `/tmp`, sorted (`[]` when `/tmp` is gone) |

`SQ.missionVerdict(m, c, why)` is what the app calls for every mission: a custom `check` wins; a script or challenge mission without one passes when `c.scriptPasses(m).ok`. It returns `{good, failed}`; with `why` set, a failed script mission also gets the first failing case (see 3a).

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

// outcome style across two log entries and the file system (the real check of Intermediate mission 8.6):
// tee must follow ls, print the same text, and a file it was given must hold that text
check: c => c.log.some((e, k) => {
  if (e.name !== 'tee' || k === 0) return false;
  const p = c.log[k - 1], want = p.out.trim();
  if (p.name !== 'ls' || !want || e.out.trim() !== want) return false;
  return e.args.filter(x => !x.startsWith('-')).some(f => {
    const n = SQ.getNode(SQ.norm(f));          // relative to the current folder, like the shell
    return !!n && n.type === 'file' && n.content.trim() === want;
  });
})
```

### 3a. Script and challenge missions

A script mission, shortened from 14.7 in `shell-quest/content/tier-advanced.js` (the 15.7 capstone is the full challenge example; `tests/fixtures/fake-advanced.js` has a minimal test-only pair):

```js
{ title: 'Script: greeter', kind: 'script', file: 'scripts/greet.sh',
  goal: '...', explain: '...', hint: '...',
  starter: '#!/bin/bash\n# greet the name in $1\n',          // comments only: it must not pass
  answer:  '#!/bin/bash\nif [ -z "$1" ]; then\n  echo "usage: greet.sh NAME" >&2\n  exit 1\nfi\necho "Hello, $1!"\n',
  wrong:   ['#!/bin/bash\necho "Hello, $1!"\n', /* ...near misses, each must fail */],
  tests: [
    { label: 'a name', args: ['Ada'], expectOut: 'Hello, Ada!' },
    { label: 'no name', args: [], expectOut: '', expectErrMatch: 'usage', expectCode: 1 },
    { label: 'a name with a space', args: ['Ada Lovelace'], expectOut: 'Hello, Ada Lovelace!' },
  ] }
```

- `file` is relative to the home folder. `answer` is the whole file text: "Type it for me" opens the editor pre-filled with it, or puts it into the editor already open on that file (it never saves), and the solvability test writes it and runs the cases.
- `starter` is written by `SQ.setupChapter(ch)` (the chapter's `setup()` plus the starters) **only when the file is absent**, so revisiting a chapter or Reset world never clobbers saved work. The solvability rules require that the starter fails.
- `wrong` lists near-miss scripts; the solvability rules assert that every one fails. Write at least three, including the most likely shortcut (hard-coded output, a missing quote, `mv` where `cp` was asked).
- `tests` are the cases (at most 20 run). Every case needs a `label`; it appears in the failure line. Fields:

| Field | Meaning |
|---|---|
| `files` | `{path: content}` written into the sandbox before the run (parents are created). It can add or overwrite, not delete |
| `args` | the positional arguments (`$1`...) |
| `stdin` | text the script reads with `read` or `cat` |
| `expectOut` | stdout, compared exactly after one trailing newline is dropped |
| `expectMatch` | a regular expression stdout must match (through `SQ.safeRegex`) |
| `expectCode` | the exit status; **0 when omitted** |
| `expectFiles` | `{path: content}` the files must hold afterwards; an absent file reads as `'(missing)'`, so `{'backup/readme.md': '(missing)'}` asserts it was not copied |
| `expectErr`, `expectErrMatch` | stderr (the lines joined with `\n`), exactly or by regex. `echo msg >&2` and `1>&2` write there. The regex has no `m` flag, so `^` and `$` anchor the whole text: a `getopts` script prints `scripts/opts.sh: illegal option -- x` before its own usage line, so match `usage: opts\.sh`, not `^usage` |
| `expectEmpty` | directories that must be empty after the run (and `advance`), e.g. `['/tmp']`; a missing one fails as `nowhere (missing)`, a full one as `/tmp holds tmp.A00001` |
| `advance` | virtual seconds (at most 3600) to run after the script ends: the jobs it left behind run, up to and including the end time, so a background write can be checked with `expectFiles`; their stdout joins the case's stdout (`expectOut`), their stderr its stderr |
| `expectClock` | the virtual clock must read exactly this after the run and `advance`. A case starts at 0 and a script costs no 1-second line cost (it is not a typed line), so `sleep 2` reads 2, and a fan-out of `sleep 3`, `sleep 1`, `sleep 2` jobs plus `wait` reads 3 |

- `check` (optional) wins over the cases and decides alone, so call `c.scriptPasses(m)` inside it when the cases should still count. Use it when the outcome alone is not the lesson. 15.5 demands a here-document with `usesHereDoc(script) && c.scriptPasses(MKCONF).ok`, and gives `checkFail`, the line shown when every case passes but the check still says no.
- `world` (optional): `fn => result`, a wrapper the check runs the cases in. The capstone uses `backupWorld`, a sandbox that removes a leftover `backup/` (Beginner 6.7 makes one) and re-seeds `docs/`, so a script that never runs `mkdir` cannot pass on luck. `SQ.missionVerdict` judges the failure line in the same `m.world`, so the line always matches the verdict.

**The sandbox.** `SQ.sandbox(fn)` runs `fn` on a throwaway copy of the whole state `S` (a JSON snapshot of the file system, cwd, variables, exports, functions and `$?`) plus the per-line runtime state, and puts everything back afterwards, also when `fn` throws. While it runs, `save()` is a no-op, so a sandboxed run **never touches `localStorage`**. `c.runScript` and every `scriptPasses` case run inside their own sandbox, from the home folder, with no terminal (`tty: false`), so cases cannot see each other's files.

Each case also starts with a clean process state (Stage 3): no jobs, no traps, no shell options, the clock at 0, pids from 1235 (`$!` of the first job is 1235) and `mktemp` names from `tmp.A00001`, and with `/tmp` empty (the learner's `/tmp` is cleared inside the sandbox only, so a temp file they left there never fails `expectEmpty:['/tmp']`; `c.runScript` does the same). Case `files` are written after that, so a case can seed `/tmp`. Afterwards the learner's jobs, traps, clock, counters and `/tmp` come back unchanged: jobs a case started (also orphans of a script `timeout` ended) never survive, never count toward the 16-job or 200-process caps and are never shown by `jobs`. Jobs, traps and the clock are runtime state (`SQ.rt`), never saved; `SQ.resetProcs()` clears them, and app.js calls it on Reset world, Reset all progress and every chapter switch (files and variables stay).

**The editor flow.** `nano FILE` (also `edit`, `vi`, `vim`) creates nothing: it opens the editor panel on that path (a missing file opens with `#!/bin/bash`). **Save** writes through the same `writeFile` the shell uses, prints `Saved <path>` and runs the mission check with the pseudo-line `(saved <path>)`. **Save & run** saves, then runs `bash <path> [args]` as a typed line (with the Run panel's stdin), and checks with `feedback`: if the mission fails and the file that ran is the mission's own file, one red line explains the first failing case, at most 120 characters:

```
Test 2 (no name) failed: expected "", got "usage: greet.sh NAME"
```

A missing file says `Save your script as <file> first (nano <file>).` Ctrl+S saves, Ctrl+Enter saves and runs, Escape closes (twice with unsaved changes).

### 3b. The parser and interpreter

A typed line, a script, a function body and a sourced file all go through the same three layers:

1. **Tokenizer** (`SQ.tokenize` in `engine/parse.js`). Quotes, `$` forms, operators and here-doc markers. `{dry: true}` finds structure only and keeps each word's raw source; `{pos: true}` (used by the AST parser) adds source offsets to operator tokens and turns `(( ))` and `[[ ]]` at command position into one raw span, so `<` and `<<` inside them are never redirects. (Stage 2 history: a `legacy` flag kept the old line-based behaviour while the AST was built; Task 6a removed it.)
2. **AST** (`SQ.parseProgram(text)` in `engine/ast.js`). Recursive descent to lists, `&&`/`||`, pipelines, simple commands with redirects, and the compounds `if`, `while`, `until`, `for`, `case`, `{ }`, `( )`, `(( ))`, `[[ ]]` and function definitions. The whole text is parsed **before anything runs**: a syntax error prints once, sets `$?` to 2 and nothing executes. Unsupported syntax (`&`, arrays) fails at parse time with "this practice shell does not support X yet".
3. **Interpreter** (`SQ.runProgram(ast, env)` in `engine/interp.js`). Words are expanded at run time, so `X=1; echo $X` works on one line. Loop control, `return` and `exit` travel as **ctl signals** (`{type: 'break' | 'continue' | 'return' | 'exit', n}`) that loops, function calls, sourced files and scripts catch at their edge. Function bodies are stored as source text in `S.fns` and parsed on call (a small cache). A call pushes a **frame** `{name, args, kind: 'function', locals}` on `SQ.rt.frames` (`SQ.frame()` is the top one, which `$1`, `$#`, `$@` and `shift` read); `local` saves the outer value in the frame and the pop restores it (dynamic scope). `source FILE` runs in the current shell under a `'source'` frame. `bash FILE` and `./FILE` are a child: they see only exported variables, no functions, and the caller's cwd, variables, exports, functions and `$?` come back when they end. Files they write stay.

**Caps.** Every runaway ends as one error line and a usable state: `SQ.LIM` (20,000 steps per typed line, 2,000 output lines on screen, 1,000,000 characters per file or output, 5,000,000 output characters per line, a 1,500,000-character saved state, 200-character patterns), 20,000 tokens per program, parser nesting 100, interpreter nesting 250 (compounds, `$( )` and scripts together), function and `source` nesting 100, scripts nested 6 deep, `${X#p}`/`%`/`/` patterns of 200 characters on values of at most 5,000. Expansion (`${X:-${...}}`, quoted `$( )`, `$(( ))` inside `${ }`) and `[`/`[[` expressions (`!`, `( )`) nest at most 100 deep and then print `bash: syntax error: nesting too deep` (status 2); any JS stack overflow that still escapes reads the same, never as raw JS text. The saved-state cap is checked by `writeFile` for a write that grows the world by more than 1,000 characters and by `cp` before a big copy (`SQ.stateOver`, against a size estimate kept for the typed line: one walk of the world, then each write adds its change; a removal only makes it high, so a refusal always rests on a fresh exact walk), and otherwise once the line's growth (`SQ.rt.grewBy`) passes 50,000 characters and at the end of the typed line (`SQ.checkState`): a loop of small writes stops with "this practice shell stopped the command: the files in this world grew too large (rm some to free space)", a little past the cap, with no rollback. Paths: no write (`mkdir`, `mkdir -p`, `touch`, a redirection, `cp`, `mv`, `ln -s`, `mktemp`, `cd`, the editor's Save) may create a name over 255 characters, a path over 4,096 characters or deeper than 128 components, counting the subtree a `cp -r` or `mv` brings along and measured where the node really lands (the deepest existing folder on the way with its links followed, plus the names still to be made), so a link to a deep folder does not get around it (`SQ.tooLong`); an `ln -s` target over 4,096 characters is refused the same way; it fails with GNU's `File name too long`, so the recursive tree code (the map, `stateText`, `clone`, the save's `JSON.stringify`) stays far from any stack limit. In-command work on big inputs is charged to the step budget (`SQ.charge`: one step per 200 units, a unit being about a quarter of a microsecond: 8 `diff` table cells, 4 `sort` compares, one `uniq` line; `comm` steps every 200 lines), so a loop of big `diff`s or `sort`s ends with the step message. Background jobs share the typed line's output budget (`LIM.TOTAL`): a job stopped for too much output keeps it charged, so 16 jobs cannot each print 5,000,000 characters. A `command not found` suggestion is memoized by name and its Levenshtein scan stops at distance 3.

**Known differences from bash** (the full lists are in the spec's Stage 2 and Stage 3 as-built notes): `help` prints one list of the practice shell's commands, grouped by tier, whatever its argument (`help cd` prints the same list; `man cd` is the per-command page); fd duplication other than `2>&1`, `>&2` and `1>&2` (`2>&2`, `>&-`, `3>&1`) prints "this practice shell does not support >& yet"; backquote substitution (`` `cmd` ``) stays literal text, so lessons use `$( )`.

### 3c. Time, jobs and the Stage 3 tools

**The virtual clock.** Time is virtual and deterministic (`engine/procs.js`): no `Date.now()`, no real timers, no `Math.random`. `SQ.rt.clock` starts at 0; each typed line costs 1 second when it ends, `sleep N` costs N, and nothing else moves it (a busy loop under `timeout` is stopped by the step cap, not by time). `SQ.advance(seconds, io)` moves the clock and runs whatever came due on the way. `$SECONDS` and `date` read the clock. Jobs, traps, shell options and the clock are runtime state on `SQ.rt`: never saved, cleared by `SQ.resetProcs()` on Reset world, Reset all progress and every chapter switch.

**The jobs model.** `cmd &` makes a job record (`SQ.rt.jobs`, pid from 1235, `$!`) and prints `[1] 1235` for a typed line. A job is a generator (`SQ.gen.run`, `engine/jobs.js`) that runs only when the clock moves, and yields at each `sleep`. The approximations, which content must not contradict:

- a job's pipeline stages, a `$( )`, a redirected compound, a sourced file or a script the job starts run as **one unit**: a `sleep` inside such a unit is paid after the unit, so its output comes early;
- a job's effects (files it writes, its output, its exit) happen at the job's virtual time, which only passes when the learner types a line, sleeps or waits;
- notices (`[1]+  Done  ...`) close the typed line; `xargs -P` runs its batches one after another, so the clock shows no speed-up.

**How a mission checks background effects.** On a typed line: `c.jobs()` (filter `j.owner === 0`), `c.ps()`, `c.clock()`, `c.elapsed()`, `c.err()` for the `[N] PID` notice, and files for what a job wrote. In a script case: `advance: N` runs the jobs the script left behind for N more virtual seconds before the case is judged, `expectClock` pins the final time (a fan-out plus `wait` reads its longest sleep), and `expectEmpty: ['/tmp']` proves a `trap ... EXIT` removed the `mktemp` file. Each case starts with no jobs, no traps, no options, the clock at 0 and an empty `/tmp`. Chapter 17 (`content/tier-expert.js`) has the worked examples.

**What `awk`, `sed` and `grep` cover.** Teach only this; anything else prints "this practice shell does not support X yet".

- `awk` (`engine/awk.js`, `awk-parse.js`; POSIX awk, mawk as reference): `-F`, `-v`, `name=value` operands, `BEGIN`/`END`, patterns and ranges, regex matches, fields and `NF`/`NR`/`FNR`/`FS`/`OFS`/`ORS`/`FILENAME`, assigning fields, associative arrays with `in` and `delete`, `for (k in a)` (insertion order; real awk leaves it unspecified), user functions, `if`/`while`/`do`/`for`, `next`, `exit`, `print`, `printf`/`sprintf` (through `SQ.fmtPrintf`), the string and math built-ins (`length substr index split sub gsub match tolower toupper int sqrt rand srand ...`). Unsupported: `getline`, `system()`, `close()`, output redirection and pipes from awk, an `RS` other than a newline.
- `sed` (`engine/sed.js`, GNU wording): `-n`, `-E`/`-r`, `-i[SUFFIX]`, `-e` (repeatable), `-s`; addresses `N`, `$`, `/re/`, `first~step`, `addr,+N`, `0,/re/`, `!`; `{ }` blocks; `s` with `g p i I N` flags and `\1`..`\9`, `&`, `\U \L`; `y d p q Q = n z a i c`, `b t T :`. Unsupported: the hold space (`h H g G x`), `N D P`, `w r e` (also `s///w` and `s///e`), `-z -f -u -l`.
- `grep`: `-i -n -c -v -E -F -w -x -o -l -L -q -s -h -H -r -R -m`, `-e` (repeatable), `-A/-B/-C`, `--include`/`--exclude`. BRE and ERE are not told apart (both are JS regexes through `SQ.safeRegex`). Unsupported: `-f -P -z`.
- Every pattern goes through `SQ.safeRegex`: shapes that could run away (nested or adjacent unbounded quantifiers, counted back-references) are refused with "pattern too complex"; the cost model is calibrated on V8, and on very long, dense lines a harmless pattern can be refused too.

**GNU defaults.** Where tools differ, the practice shell follows GNU: `nl` numbers only non-empty lines (`-b t`; `nl -ba` numbers every line); `find -exec ... \;` exits 0 even when a command fails or is missing, while `-exec ... {} +` exits 1 when its one run fails; `sort`, `uniq -c`, `wc` and `xargs` error texts are GNU's. One deliberate difference: `find` lists each folder sorted by name, where a real `find` uses the order on disk, so content never claims that a real `find` prints in sorted order.

## 4. Keeping saved progress compatible

Learners already have saves, exports and linked save files. They must keep loading.

1. **Append chapters, never reorder or remove.** Chapters live in one global array; indexes are the identity. New tiers go at the end, in tier order.
2. **Keys are `'<chapter>.<mission>'`** (`S.done['7.0']`, `S.badges[7]`). Never insert a mission in the middle of a chapter that has shipped; add to the end.
3. **New state fields need a default or a fallback.** The loader is `Object.assign(fresh(), saved)`, so a field with a default in `fresh()` is picked up by old saves. A field that is created lazily must be read with a fallback: `S.exp` (exported variables) is not in `fresh()` and is always read as `S.exp||{}`.
4. **Never rename the `localStorage` key** (`shell-quest-v1`, set in `window.PROGRESS` in `index.html` and in `engine/fs.js`). Exports and the linked file are matched to it.
5. **Rank renames only change names.** Thresholds are derived from XP, so a rename never changes anyone's progress. (The 600 XP rank went from "Shell Wizard" to "Pipe Fitter" this way.)
6. Tier badges are derived, so there is nothing to migrate when a tier is added.

**Golden-transcript guard.** `tests/shell-golden.mjs` plays every Beginner mission through the real UI with "Type it for me" and compares the terminal text, XP and final export to `tests/fixtures/shell-beginner-golden.json` and `shell-progress-beginner-complete.json`. It walks the Beginner chapters only (`BEGINNER_CHAPTERS = 7`). Content you add later is covered by other tests, so this one must stay byte-identical; fix the code, never regenerate the fixtures (`UPDATE_GOLDEN=1` is for a deliberate change to old content, reviewed on its own). The smoke tests also import the fixture to prove an old save still loads (695 XP, "Pipe Fitter").

**Differential corpus guard.** Stage 2 replaced the line executor with the AST interpreter. To prove that nothing a learner could already type changed, `tests/shell/corpus.test.mjs` replays about 1,100 lines (from `tests/shell/corpus-lines.mjs`, plus every Beginner and Intermediate mission answer and quick-fire answer, built by `corpus-generate.mjs`) and compares stdout, exit status, cwd, variables and file changes with `tests/fixtures/shell-corpus.json`, recorded from the Stage 1 engine. The rules:

- A fixture entry the plan expected to change carries `"expectChange": true` and a `changeNote`. Only those may get an override in `tests/fixtures/shell-corpus-allow.json` (`{"<line>": {reason, out?, code?, vars?, files?, cwd?}}`); the test fails on an allow-list key that names an unmarked entry, or one without a reason.
- **Never regenerate the fixture to make a test pass.** If an unmarked entry differs, the code is wrong (or the change needs its own reviewed decision). Example: Stage 2 Task 13 wanted to extend `help`, but `help cd` (unmarked) prints the same text, so `help` was left as it was; Stage 3 Task 20 made that decision on purpose and marked the entry (next paragraph).

**The second corpus (Stage 3).** `tests/shell/corpus2.test.mjs` replays about 1,800 lines (`corpus2-lines.mjs`, plus every Advanced answer, script, wrong script and quick-fire answer) against `tests/fixtures/shell-corpus2.json`, recorded once from the Stage 2 engine before any Stage 3 change. The rules are the same: only entries marked `expectChange` may be overridden in `tests/fixtures/shell-corpus2-allow.json`, and every override names its task and reason. When a planned change touches an entry the generator did not mark (it happened for `:(){ :|: };:` in Task 12a and for `help` and `help cd` in Task 20), the fix is **metadata only**: add `"expectChange": true` and a `changeNote` to that one fixture line, keep every recorded value as it is, add the allow-list override, put the same note on the line in `corpus*-lines.mjs` (`{ line, change }`) so a regeneration would mark it too, and say why in the review. Recorded values are never edited or regenerated.

## 5. Tests for new content

**Solvability.** `tests/shell/solvability.test.mjs` loads the engine and content in Node (`tests/shell/harness.mjs`, a `vm` context with no DOM), and for every chapter calls `setup()` then runs each mission's `answer` and asserts `check(ctxFor(answer))` (script and challenge missions follow the rules in `solvability-lib.mjs`, below). Use the harness `run(SQ, line)`: it resets the command log first, exactly like the app. A mission whose answer needs two steps gets an explicit override (see `TWO_STEP`), never a loosened check.

**Wrong-command and alternative-solution tests.** For each non-trivial mission, assert both directions with a fresh world (`tests/shell/intermediate.test.mjs`):

```js
const yes = (ch, m, line, pre) => assert.ok(judge(ch, m, line, pre), `should accept: ${line}`);
const no  = (ch, m, line, pre) => assert.ok(!judge(ch, m, line, pre), `should reject: ${line}`);
yes(T8, 0, 'cut -f1 -d, village/sales.csv');   // option order differs
no (T8, 0, 'cut -d, -f2 village/sales.csv');   // right command, wrong result
no (T8, 0, 'cat village/sales.csv');           // looks related, teaches nothing
```

`judge` sets up the chapter in a fresh world, runs the `pre` lines (not judged, each with its own log reset), runs the line, then calls the check. Cover: at least one valid alternative, the nearest wrong command, and a repeat of an earlier answer when the check could be satisfied by leftovers.

**Script missions** (`tests/shell/advanced.test.mjs`, rules in `tests/shell/solvability-lib.mjs`): the solvability test asserts that the starter fails, the answer passes, setup does not overwrite a saved file, and every `wrong` script fails. Add by hand: a few valid alternative scripts (a one-liner, `[[ ]]` instead of `[ ]`, a `shift` loop), extra wrong ones, and the exact failure line for the most likely mistake (`SQ.scriptFailLine(m, c.scriptPasses(m).failed)`). A browser smoke test should cover the editor path once: Type it for me, Save & run on a wrong script (failure line, no XP), then the answer (+XP once).

## 6. Mission-authoring pitfalls

All of these were found in review of the Intermediate and Advanced tiers.

- **Output-only checks.** "The output contains X" is satisfied by `echo X`. Check the real effect (file content, mode, link, variable) or compare output with what the data says.
- **Hardcoded files.** Derive expected values from the world (`c.read(...)`), so a changed seed or an alternative path still works. Accept any file name the learner chose when the goal does not name one.
- **Accept alternatives.** If two sensible commands reach the outcome (`2>/dev/null` or `2> errors.txt`, `xargs rm` or `xargs rm -f`), accept both; reject only what teaches the wrong thing.
- **Per-line log reset.** The app resets the log before every typed line, so a check never sees an earlier line. A learner who types `i=1` and then `while [ "$i" -le 3 ]; ...` on the next line gives the check only the second line. A mission that spans lines (run a failing command, then `echo $?`) must read state that outlives the line: the file system, variables, `c.out()` for what this line printed, and `SQ.rt.prevLast`, the exit code from before the line (it lives on `SQ.rt`, not in saved state). Test such missions with the log reset per line (the harness `run` does it), not as one big `run`.
- **Every mission gets a negative and an alternative test.** At least one plausible wrong answer that must fail and one different valid answer that must pass. Chapters 14 and 15 go further: at least three alternatives and five wrong forms per command mission.
- **Output-only cheats.** For an Advanced mission, `echo 3` must not pass "count to 3 with a loop": require the construct (a `for`/`while` entry in the log, `$((` on the line, `case`, a function call) **and** the behaviour. Better still, call the learner's function again in a sandbox with other arguments (`fnRun` in tier-advanced.js) and compare. A few contrived cheats remain (`f; echo 1` beside a correct `local`); accept that rather than reject valid answers.
- **Typos never complete a mission.** A line that prints `command not found` (`Sort ... | uniq -c`) fails every command mission, however well the commands around it ran: the engine tags those log entries (`nf`) and `SQ.missionVerdict` rejects the line. You get this for free; do not write `c.ran` checks that try to work around it. `tests/shell/completion.test.mjs` runs every mission's answer with an unknown command added and fails if one still completes.
- **Text examples teach the same lesson or do not complete it.** The examples in `goal`, `explain` and `hint` are for experimenting. If typing one completes the mission, it must teach the lesson the mission teaches (`grep -in` for `grep -n`), not a neighbouring one (`echo ...day?.log` for the `*` mission, `echo $HOME` for "Use the value"). The completion test fails on any example that completes its mission unless it is in `ALLOWED_EXAMPLES` with a reason; tighten the check first, allow-list only a true same-lesson example.
- **A finished mission is silent.** The apps do not print "Mission complete" or award XP when a finished mission is revisited and solved again. Keep that when you touch `checkMission`.
- **Quote variables.** Answers, explanations, hints, guide examples and quick-fire answers always quote: `[ -n "$x" ]`, `cp "$f" backup/`. Like bash, this practice shell splits an unquoted `$var` or `$( )` on `IFS` and expands any wildcard in it, and an unquoted empty `$var` passes no argument at all (`[ -n $x ]` is true when `x` is empty). A test enforces that no Advanced text teaches `[ $var`.
- **Script tests must pin the lesson.** Give the case that the obvious shortcut fails: an empty folder for a backup script, a file name with spaces, a second run over an existing output, a missing argument with `expectCode: 1` and `expectErrMatch`. For outcome-only cases the shortcut wins (15.5 accepted two `echo` lines until a `check` demanded the here-document).
- **Fresh-world jump-in.** Learners can open any chapter first, and "Reset world" re-runs only the current `setup()`. Setup must create everything the chapter needs with `ensureFile` / `ensureDir` (they never overwrite learner work). Don't rely on an earlier chapter, and don't let one mission destroy files a later mission in the same chapter needs (the 11.5 `xargs rm` mission works on a scratch folder for this reason).
- **Whole before parts.** Do not open with a flag. A learner who reads "`-r` means recursive" before knowing what `cp` is doing has nothing to hang it on. Put the whole-line step first (`how[0]`), then the parts.
- **Factual explain text.** `explain` is read as truth. Test every claim it makes against the engine (`man`, `help`, run it). Don't describe options the practice shell doesn't support; unsupported options print "this practice shell does not support X yet" rather than doing something silently wrong.
- **Exact-match quick-fire.** Quick-fire answers are compared after dropping quotes and collapsing spaces. When the quoting is the lesson (`echo '$HOME'`), add `{exact:true}` as the fourth tuple element, so only whitespace is normalised.

**Don't teach what the engine does not do.** Content must avoid these Stage 2 gaps (the full list is in the spec's "Stage 2 as built" section): arrays, `&` and job control, `set` (`-e`, `-x`, `--`), `trap`, `getopts`, `awk`, `BASH_REMATCH`, `local -r`, function names with `-` or `.`. Stage 3 closed most of these for the Expert tier (`awk`, `&` and job control, `set -e`/`-u`/`-x`/`-o pipefail`, `trap`, `getopts`); bash arrays and `declare` are still unsupported, so array lessons use awk arrays. Also avoid what Stage 3 left out (section 3c and the spec's Stage 3 note): backquotes, `fg`/`bg`, `>( )`, awk's `getline`, sed's hold space. When a typed option such as `set -x` or `set -u` stays on after the mission, say so in a `note` (19.2 and 19.4 do). A here-document cannot be typed at the prompt (one line at a time), so missions use it in scripts. A typed `exit` only prints a friendly message, and `return`/`local` work only inside a function, so quick-fire answers that need them are phrased as definitions.

## 7. Guide and quick-fire tags

- **Guide.** Entries are `{c, ch, what, syn, ex}`. `ch` is the chapter index; the entry's tier is `tierOf(ch)`, so there is no separate tier tag to forget. `ch: 'extras'` puts an entry under "Handy extras", which has its own key and shows only under the All filter. The tier filter buttons are built from the tiers that have chapters.
- **Quick-fire.** Entries are `[task, [accepted answers], tier?, {exact:true}?]`. A missing tier means `'beginner'`. The tier picker shows "Mixed" plus every tier that has at least one question, and a round draws only from the chosen pool.

## 8. File layout for a playground

```
<name>-quest/
  index.html          markup; loads scripts in the order below
  style.css
  engine/             domain logic, no DOM (file system, tokenizer, AST, interpreter, commands, exec + ctxFor)
  content/            tiers.js (Tiers.create), tier-<id>.js (chapters), guide.js, quickfire.js
  ui.js               rendering helpers
  editor.js           the editor panel (only when the playground has script missions)
  app.js              wiring: events, mission completion, quick-fire
shared/               progress.js/.css, tiers.js/.css
```

Load order in `index.html`: `shared/progress.js`, `shared/tiers.js`, `engine/*`, `content/tiers.js`, the `content/tier-*.js` files in tier order, `guide.js`, `quickfire.js`, `ui.js`, `editor.js`, `app.js`. `tools/build.py` inlines local scripts in the order they appear, and the Node harness reads that same list from `index.html`, so one source of truth. The bundle is tested in `tests/smoke.mjs`.

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
