# Shell Quest Tiers, Stage 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Expert tier (4 chapters, 28 missions, rank "Shell Wizard"): an `awk` subset, a real `sed`, richer `grep`/`find`/`xargs`/`printf`, word splitting and `IFS`, a simulated process table with a virtual clock (`&`, `jobs`, `wait`, `kill`, `sleep`, `ps`, `trap`), `set -euo pipefail`/`set -x`, `getopts`, process substitution, and the content that teaches them.

**Architecture:** New engine files stay DOM-free classic scripts on `SQ`: `printf.js`, `sed.js`, `awk-parse.js`, `awk.js`, `procs.js` (clock, process table, `ps`, `sleep`, `timeout`), `jobs.js` (generator-based executor for background jobs plus the scheduler), `cmds-proc.js` (`jobs wait kill trap`), and `cmds-opts.js` (`set getopts mktemp command readonly`). Time is virtual and deterministic: each typed line costs 1 virtual second, `sleep N` costs N, and background jobs run as generators that yield at `sleep`, so effects land at the right virtual time without real timers. The interpreter, tokenizer and AST gain only what the new syntax needs (`&`, `<( )`, prefix assignments, word splitting).

**Tech Stack:** Vanilla JS classic scripts under the `SQ` namespace, Node `vm` engine tests (`npm run test:engine`), Playwright smoke tests, `tools/build.py` bundling.

**Spec:** `docs/superpowers/specs/2026-10-19-shell-quest-tiers-design.md` (§3 Stage 3, §4 content, "Stage 2 as built" for the limitations this stage closes). How to write missions: `docs/tiers-guideline.md`.

## Global Constraints

- Never regenerate fixtures: `tests/shell-golden.mjs` fixtures (52 Beginner records), `tests/fixtures/shell-corpus.json` (Stage 1 engine) and the new `tests/fixtures/shell-corpus2.json` (Stage 2 engine, Task 1). A changed line is allowed only if its entry is marked `expectChange` and carries an override with a reason in the matching allow-list; adding `expectChange`/`changeNote` metadata to an entry (never touching recorded values) is allowed with a justification in the task report.
- localStorage key `shell-quest-v1` and all existing keys unchanged; Expert chapters are appended as indexes 15 to 18 (UI numbers 16 to 19). Jobs, the clock, traps and shell options are runtime state (`SQ.rt`), never saved; a reload or "Reset world" starts with no jobs, clock 0, no traps.
- Determinism: no `Date.now()`, `Math.random` or real timers in engine code; `date`, `$SECONDS`, `$RANDOM` (unsupported), `ps` and `$!` derive from `SQ.rt.clock` and a pid counter (`$$` stays 1234; the first new pid is 1235 and each background job or `ps` run takes the next one).
- Unsupported syntax keeps printing `this practice shell does not support <X> yet` (exit 2). Real bash/awk/sed wording for errors where implemented. The whole text is parsed before anything runs.
- Caps keep working and grow only where named: `LIM.STEPS` per typed line (a job slice and an awk record loop count steps), `LIM.VAR` 1,000,000 characters per variable (Task 2), at most 16 live jobs, at most 200 processes ever created per session (then `bash: fork: retry: Resource temporarily unavailable`), awk: 2,000 output lines on screen as today, regex through `SQ.safeRegex`, awk program text 20,000 characters, awk field index at most 1,000.
- No new runtime dependencies. No inlined file may contain the literal text `</script`. Engine files stay DOM-free. Every new script is added to `index.html` in dependency order and bundled by `tools/build.py`.
- Mission XP for Expert is 25, badge +25; "Shell Wizard" sits at the XP computed from content (1890 + 28*25 + 4*25 = 2690). Beginner, Intermediate and Advanced content and their answers keep passing unchanged.
- Every task ends with `npm test` and `python3 tools/build.py --check` green; smoke runs on Node 22 locally and Node 24 in CI.
- Commits: author `Shimon Cohen <33935191+shimoncohen@users.noreply.github.com>`, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, no session links.

## Review Focus

1. **Runaway processes and time:** `:(){ :|:& };:`, `f() { f & }; f`, `while :; do sleep 0; done &`, `wait` with no jobs, `kill` of a missing pid, `sleep 99999999`, `timeout 1 sleep 5`. Expected: the job, process or step message, state restored, next line works, no real waiting. Pinned in Tasks 11 and 12.
2. **`awk` robustness:** division by zero, `$(-1)`, `$1000000 = 1`, string versus number comparison (`"10" < "9"` is true for strings, false for numbers from fields), uninitialised variables, regex DoS, an endless `while`, `getline` and `system()` (unsupported message), huge output. Expected: awk-style error or a cap message, never NaN text from JS, never an uncaught exception. Pinned in Tasks 8 and 9.
3. **`sed`/`grep` expressions:** unterminated `s`, `y` with unequal sets, `-n` with `p`, `$` address, empty regex reuse, `-i` on a missing or read-only file, recursive `grep -r` through links. Expected: GNU-style messages, no loop on link cycles. Pinned in Tasks 6 and 7.
4. **Word splitting:** `for f in $(ls)`, `"$@"` versus `$@`, `$IFS` changes, empty unquoted expansions, globs after splitting, `a=$b` (never splits), `[ -n $x ]` with unset `x`. The Beginner golden and both corpora catch drift. Pinned in Task 4.
5. **Error-exit semantics:** `set -e` is suppressed in `if`/`while` conditions, `&&`/`||` lists and `!`; `trap ... EXIT` runs on every way a script ends (end, `exit`, error under `-e`, `kill`, step cap); `set -u` on `$@`, `${x:-}` and `$?`. Pinned in Tasks 13 and 14.

## File Structure

| File | Responsibility |
|---|---|
| `engine/printf.js` | `SQ.fmtPrintf`, shared by `printf` and awk |
| `engine/sed.js` | sed script parser and runner |
| `engine/awk-parse.js`, `engine/awk.js` | awk lexer/parser, interpreter and `CMDS.awk` |
| `engine/procs.js` | `SQ.rt.clock`, pid counter, process records, `ps`, `sleep`, `timeout`, virtual `date` |
| `engine/jobs.js` | `SQ.gen` generator executor, job table, scheduler, `&` |
| `engine/cmds-proc.js` | `jobs wait kill trap` |
| `engine/cmds-opts.js` | `set getopts mktemp command readonly` (and `bash -c/-n/-x`) |
| `content/tier-expert.js` | chapters 16 to 19 |

---

### Task 1: Second differential corpus (Stage 2 behaviour)

**Files:** Create `tests/shell/corpus2-lines.mjs`, `tests/shell/corpus2-generate.mjs` (reuse the helpers in `corpus-generate.mjs`), `tests/shell/corpus2.test.mjs`, `tests/fixtures/shell-corpus2.json`, `tests/fixtures/shell-corpus2-allow.json` (`{}`).

- Fixture is generated once with `UPDATE_CORPUS2=1` on the unmodified Stage 2 engine and committed. At least 700 entries `{line|lines, out, code, cwd, vars, files}` in the Stage 1 corpus format: every Advanced mission `answer` (with prefix lines), every `wrong` script run through `bash`, fresh probes of every Stage 2 feature (functions, locals, `case`, here-docs, `${}` forms, `$(( ))`, `[ ]`/`[[ ]]`, `read`, `source`, `exit`, `>&2`, `nano`, pipelines of compounds, caps), and lines Stage 3 will change (`awk`, `sleep`, `&`, `<( )`, `set`, `trap`, `getopts`, unquoted `$x` with spaces, `IFS=`, `VAR=x cmd`, `grep -o/-w/-r/-A/-B`, `sed -i`/`;`, `find -exec`, `xargs -P`, `printf '%5.2f'`) marked `expectChange` with `changeNote`.
- [ ] **Step 1:** write the test (same rules as `corpus.test.mjs`: allow-list keys must be `expectChange` entries; fixture present is an `it`; deterministic) and generate the fixture on `main`; run it 3 times.
- [ ] **Step 2:** `npm test` green; commit. Later tasks add allow-list overrides only for marked entries.

### Task 2: Hardening carried over from Stage 2

**Files:** `engine/fs.js`, `engine/exec.js`, `engine/parse.js`, `app.js`, tests `limits.test.mjs`, `engine.test.mjs`.

**Interfaces:** Produces `SQ.LIM.VAR = 1000000`, `SQ.rt.grewBy` (characters written since the last check; `writeFile`, `markTree`, `cp` add to it and `step()` calls `checkState()` once it passes 50,000), and `own(o,k)` used for every file-system child lookup.

- [ ] **Step 1: failing tests:** `mkdir constructor; ls` lists it; `touch toString; echo hi > valueOf; cat valueOf` → `hi`; `cd __proto__` → `No such file or directory`; `echo x > __proto__; cat content` still fails and `Object.prototype.content` is `undefined`; `cat s | tee $(seq 1 3000) >/dev/null` after `printf '%0999d' 0 > s` leaves `stateText` under `LIM.STATE` plus 60,000; `x=a; for i in $(seq 30); do x=$x$x; done` prints `this practice shell stopped the command: a value grew too large` and `${#x}` works afterwards; any `RangeError` (not only stack overflow) maps to that same friendly line, and Firefox's `too much recursion` maps to the nesting message; an editor Save followed by `echo hi` in an over-cap world prints `hi` (the `grew` flag is reset at the start of each `execLine` and by `editorSave`); `mv a b` in an over-cap world does not print the cap message.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** (null-prototype `children` maps rebuilt on load, or `own()` in `walk`/`getNode`/`parentOf`/`writeFile`/`mkdir`/`ln`/`mv`/`cp`; JSON round trip keeps working; old saves load). **Step 4:** `npm test`; corpora green (any change needs an allow-list reason). **Step 5:** Commit.

### Task 3: Shell semantics left over from Stage 2

**Files:** `engine/interp.js`, `engine/exec.js`, `engine/parse.js`, `engine/arith.js`, `engine/cmds-sys.js`, tests `functions.test.mjs`, `scripts.test.mjs`, `flow.test.mjs`, `params.test.mjs`.

- [ ] **Step 1: failing tests:** `x=$(false); echo $?` → `1`; an assignment-only line takes the status of its last `$( )`; `f() { echo ${X:?msg}; echo after; }; f` prints `bash: X: msg`, no `after`, status 1, and in a script it ends the script; `a="1+2"; echo $((a*2))` → `6` (a variable's text is evaluated as an expression, depth cap 10, cycles give `bash: expression recursion level exceeded`); `unset HOME; echo "[$HOME]"` → `[]` and `cd` with no argument says `bash: cd: HOME not set`; `type if` → `if is a shell keyword`; a script syntax error prints `s.sh: line 3: syntax error near unexpected token 'fi'` (path as typed, line of the offending token); `echo a > f >&2` creates `f` empty; `cd forest | cat` and `echo a | shift` no longer change the shell (each stage runs in a full subshell: cwd, variables, positional parameters, functions, exports; files stay shared); `break` inside a function called from a loop leaves the caller's loop with bash's warning-free behaviour when the loop is active.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** The unmarked corpus entries for `cd forest | cat` (and the two `pwd` ones) get `expectChange` metadata plus an allow-list reason. **Step 4:** `npm test`. **Step 5:** Commit.

### Task 4: Word splitting, `IFS` and prefix assignments

**Files:** `engine/parse.js` (`expandWords`, `getVar`), `engine/interp.js`, `engine/cmds-flow.js` (`read`), tests `params.test.mjs`, `flow.test.mjs`.

**Interfaces:** Produces `SQ.splitFields(text: string, ifs: string): string[]` (whitespace in `ifs` collapses and trims; other `ifs` characters each end a field and empty fields between them are kept). The AST `Simple` node gains `assigns: {name, word}[]` for leading `NAME=word` items that precede a command name.

- [ ] **Step 1: failing tests:** `x="a b  c"; printf '[%s]' $x` → `[a][b][c]`; `printf '[%s]' "$x"` → `[a b  c]`; `e=; printf '[%s]' $e a` → `[a]`; `for w in $(echo a b); do echo $w; done` unchanged; `n="a*"; touch ab; echo $n` globs after splitting, `"$n"` does not; `a=$x` never splits; `IFS=,; y="1,2,,3"; printf '[%s]' $y` → `[1][2][][3]`; `IFS= ; printf '[%s]' $x` → `[a b  c]`; `[ -n $unset ]` is true and `[ -n "$unset" ]` false, as in bash; `"$@"`, `$@`, `"$*"` unchanged; `IFS=, read a b <<< "1,2"; echo $a $b` → `1 2` and `IFS` is unchanged afterwards; `X=1 echo $X` prints an empty line (expansion happens before the assignment) while `X=1 sh -c 'echo $X'`-style child visibility is shown by a function: `f() { echo "[$X]"; }; X=7 f; echo "[$X]"` → `[7]` then `[]`; `read` splits on `IFS`, `-r` keeps backslashes, a custom `IFS` also governs the last-name rule; here-doc and `[[ ]]` operands never split.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** splitting for unquoted `$name`, `${..}`, `$(...)`, `` `...` ``, `$((...))`; quoted parts and literal text never split; empty unquoted expansions vanish; splitting happens before globbing; prefix assignments set the variable only for that command (functions see it; builtins like `read` honour `IFS`) and are restored after. **Step 4:** `npm test`; Advanced answers and wrong scripts still behave (corpus2); allow-list overrides for changed corpus lines with reasons; update the guideline and spec limitation lines that this removes. **Step 5:** Commit.

### Task 5: `printf` formats

**Files:** Create `engine/printf.js`; modify `engine/cmds-text.js`.

**Interfaces:** Produces `SQ.fmtPrintf(fmt: string, args: string[]): { text: string, code: number, err?: string }` (reuses the format cycling rule: the format repeats while arguments remain).

- [ ] **Step 1: failing tests:** `%s %d %i %u %x %X %o %c %e %f %g %%`, widths and flags (`%5s`, `%-5s|`, `%05d`, `%+d`, `%.2f`, `%8.3f`, `%*d`), `%b` (escapes in the argument), `%q` (shell-quoted), `\n \t \\ \a \0nnn \xHH` in the format, argument cycling (`printf '%s-%s\n' a b c` → `a-b`, `c-`), missing arguments (`%d` → 0, `%s` → empty), `printf -v var '%s' x` sets `var`, non-numeric `%d` argument → `bash: printf: abc: invalid number` status 1 and prints 0, `printf '%5.2f\n' 3.14159` → ` 3.14`, no argument → usage message, a huge width (`%1000000s`) is refused.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** the module and make `CMDS.printf` use it. **Step 4:** `npm test`. **Step 5:** Commit.

### Task 6: `grep` flags

**Files:** `engine/cmds-text.js`, tests `text.test.mjs`.

- [ ] **Step 1: failing tests:** `-o` (one match per line, with `-n`, `-i`, `-c` combinations), `-w`, `-x`, `-F`, `-e PAT` (repeatable), `-l`, `-L`, `-q` (status only), `-s`, `-h`, `-H`, `-m N`, `-A N`/`-B N`/`-C N` (context groups separated by `--`, overlapping context merged, `-n` marks context lines with `-` and matches with `:`), `-r`/`-R` (recursive from `.` when no path; files in sorted order; filenames prefixed; symlinked directories not followed so a link cycle ends; `--include=GLOB` and `--exclude=GLOB`), binary-free (the world has none), `-E` kept, `-v` with context, no match → status 1, bad regex → `grep: Unmatched ( or \(` status 2, a missing file → `grep: x: No such file or directory` status 2 (but `-s` hides it). Unsupported flags (`-P`, `-z`, `--color` values other than `never|auto`) keep the unsupported message.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** (regex through `SQ.safeRegex`). **Step 4:** `npm test`; corpus allow-list entries for the `grep -o/-w/-r/-A/-B` lines marked in Task 1. **Step 5:** Commit.

### Task 7: `sed`

**Files:** Create `engine/sed.js`; modify `engine/cmds-text.js` so `CMDS.sed` delegates.

**Interfaces:** Produces `SQ.sedRun(script: string, text: string, o: { n: boolean, E: boolean, s: boolean }): { out: string, code: number, err?: string }` and the in-place path used by `CMDS.sed -i[SUFFIX]`.

- [ ] **Step 1: failing tests:** addresses `N`, `$`, `N,M`, `N,+K`, `/re/`, `/re/,/re/`, `N~step`, `addr!`; commands `s` (flags `g p i N`, `&`, `\1`..`\9`, any delimiter, `\n` in the replacement), `d p q Q = y`, `a\`/`i\`/`c\` (GNU one-line `a text` forms), `{ ... }` blocks, several commands separated by `;` or newlines or repeated `-e`, `-n`, `-E`, `-s`, `-i` and `-i.bak` (writes the file, keeps a backup, prints nothing, missing file → `sed: can't read x: No such file or directory`), empty regex reuses the last one, `y/abc/xyz/`, `sed -n '$='` counts lines, stdin when no file; errors in GNU wording: `sed: -e expression #1, char 5: unterminated `s' command`, `unknown command: `k'`, `unknown option to `s'`, `y` with unequal sets. Unsupported: `w`, `r`, `e`, `N`, `D`, `P`, `H`, `G` hold-space commands print the unsupported message.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** (parse once, run per line; regexes through `SQ.safeRegex`; caps on steps). **Step 4:** `npm test`; the Intermediate sed missions and corpora stay green. **Step 5:** Commit.

### Task 8: `awk` parser

**Files:** Create `engine/awk-parse.js`, `tests/shell/awk-parse.test.mjs`; modify `index.html`.

**Interfaces:** Produces `SQ.awkParse(src: string): Program` with `Program = { begin: Stmt[][], end: Stmt[][], rules: { pat: Expr|null, pat2: Expr|null, action: Stmt[]|null }[], funcs: {} }` (user functions are supported: `function f(a, b) { ... return x }`). Errors are `Error` with `awkErr:true` and text `awk: syntax error at source line N` plus a context line, code 2. Statements: `print`, `printf`, `if/else`, `while`, `do/while`, `for(;;)`, `for (k in a)`, `delete a[k]`, `next`, `exit [e]`, `return`, `break`, `continue`, blocks, expression statements. Expressions: all awk operators with the correct precedence (including regex match `~ !~`, `in`, ternary, string concatenation by juxtaposition, unary minus/plus/not, `++`/`--`, compound assignment, `$expr`, grouping `(a, b) in arr`), regex literals, string and number literals. `getline`, `system()`, `close()`, `|` and `>`/`>>` redirects in `print` print `this practice shell does not support awk getline yet` (and so on) at parse time.

- [ ] **Step 1: failing tests** on node shapes for each construct above, `a b` concatenation versus `a - b`, `print a, b > "f"` unsupported message, `$NF-1` parses as `($NF)-1`, `!x++` precedence, regex versus division ambiguity (`a / b / c` against `/re/`), newline/semicolon rules (`}` closes a statement; `;` optional), comments, line continuation with `\`, `BEGIN` without an action is a syntax error, a program over 20,000 characters is refused, nesting depth capped at 100 (`awk: nesting too deep`), no quadratic behaviour on a 20,000-token program.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** a hand lexer and precedence-climbing parser. **Step 4:** `npm run test:engine`. **Step 5:** Commit.

### Task 9: `awk` interpreter and command

**Files:** Create `engine/awk.js`, `tests/shell/awk.test.mjs`; modify `engine/cmds-text.js` only if needed; `index.html`.

**Interfaces:** Consumes `SQ.awkParse`, `SQ.fmtPrintf`, `SQ.safeRegex`. Produces `CMDS.awk` and `SQ.awkRun(prog, inputs: { name: string, text: string }[], o: { FS?: string, vars: {}, stdin?: string }): { out: string, err: string, code: number }`. Options `-F fs` (single char, string, or regex when longer than one character; `-F'\t'`, `-F,`), `-v name=value`, `-f progfile`, `--` and operands `name=value`; reads stdin when no file.

- [ ] **Step 1: failing tests:** fields and `NF`/`NR`/`FNR`/`FILENAME`/`FS`/`OFS`/`ORS`/`RS`(newline only)/`SUBSEP`; assigning `$3` or `NF` rebuilds `$0` with `OFS`; default FS collapses blanks and trims; `BEGIN`/`END`; range patterns; `next`, `exit` (END still runs; exit code); arrays with `in`/`delete`/`for (k in a)` (iteration order is insertion order, documented), `split`, `length(arr)`; builtins `length substr index split sub gsub match(RSTART,RLENGTH) sprintf tolower toupper int sqrt exp log sin cos atan2 srand rand` (rand is deterministic: seeded LCG, documented); number/string duality (`$1 == 10` numeric when the field looks numeric, `"10" < "9"` string compare, uninitialised is both), number output uses `%.6g` and integers print whole; `printf` via `SQ.fmtPrintf`; user functions with recursion (depth 100) and array parameters by reference; `-v` escapes processed; assigning `$(-1)` → `awk: trying to access out of range field -1` status 2; `$1000001` refused; division by zero → `awk: division by zero` status 2; an endless loop ends with the step-limit message; output beyond the screen cap is cut as for every command; regex special cases (`/a|b/`, bracket classes, `\.`) through `SQ.safeRegex`; `awk -f` of a missing file errors; piping (`cmd | awk`) and `-F, 'NR>1'` skip-header idioms; uninitialised `$0` in `END` keeps the last record. Pin a table of 40 one-liners with exact outputs (checked against real awk semantics by hand, comments say how).
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4:** `npm test`; corpus2 `awk` lines (marked in Task 1) get allow-list overrides. **Step 5:** Commit.

### Task 9b: Regex backtracking guard (added during execution)

**Files:** `engine/fs.js` (`regexRisky`, `safeRegex`), callers in `engine/cmds-text.js`, `engine/sed.js`, `engine/awk.js` as needed, tests `limits.test.mjs`.

Added after the Task 9 review: `SQ.regexRisky` rejects nested quantifiers but not polynomial blow-up. `/.*.*.*.*.*c/` takes 1.4 s on 64 characters and more than 20 s on 128; `a*a*a*a*a*a*a*a*b` hangs on 32k characters; `a*b` on one 30,000-character line takes about 1 s (quadratic). `grep -E`, `sed` and `awk` all share it, and awk can build long strings internally.

- [ ] **Step 1: failing tests (timing budget):** every pattern that `safeRegex` accepts finishes against any subject up to `LIM.TEXT` characters within 250 ms in the test run, and every pattern it cannot guarantee that for gets `pattern too complex for this practice shell`. Pin: `grep -E '.*.*.*.*.*c'` on a 128-char line, `sed 's/a*a*a*a*a*a*a*a*b/x/'` and `awk '/a*a*a*a*b/'` on a 32,000-char line, `a*b` on a 30,000-char line, all end quickly with the friendly message and the next command works. Everyday patterns keep working unchanged: `^.*foo.*bar$`, `[0-9]+\.[0-9]+`, `^(a|b)+$`, `\bwolf\b`, `.*error.*`, and every regex that appears in the Beginner, Intermediate, Advanced mission answers and the corpora.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** in `fs.js`: estimate the worst-case match cost as a function of the pattern (count of unbounded quantified atoms that can overlap, taken as the polynomial degree) and of the subject length, and refuse (`.complex=true`) when the product can exceed a budget; add `SQ.safeRegex(src, flags)` subject-length awareness only if needed (for example `SQ.regexFits(re, len)` called by grep/sed/awk before matching a long line). Keep it small and explain the rule in the comment above `regexRisky`. **Step 4:** `npm test`; corpora and mission answers unchanged (no new overrides expected; if one is needed it must be an `expectChange` entry). **Step 5:** Commit.

### Task 10: `find -exec`, `xargs`, and a few text tools

**Files:** `engine/cmds-text.js`, `engine/cmds-sys.js`, tests `streams.test.mjs`, `text.test.mjs`.

- [ ] **Step 1: failing tests:** `find . -name '*.txt' -exec wc -l {} \;` (one run per file), `-exec ... {} +` (one run with all names), `-exec` run in the find's directory order, exit status of find is 0 unless the command could not be run; `-print0`, `-delete` (files and empty directories, not `.`), `-mindepth`, `-maxdepth`, `-empty`, `-newer` is unsupported; `xargs -0`, `-n N`, `-I{}` with several `{}` and quoting, `-P N` (accepted; runs batches in order, documented), `-t` prints each command to stderr, `-r`; `xargs` can call a function; new `tac`, `nl` (`-ba` default numbering), `paste` (`-d`, `-s`), `comm` (`-1 -2 -3`, sorted input assumed, a warning line when unsorted: `comm: file 1 is not in sorted order`), `cut -s`, `head -c N`/`tail -c N`, `uniq -d -u`.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4:** `npm test`; allow-list the marked lines. **Step 5:** Commit.

### Task 11: Virtual clock, process table, `sleep`, `ps`, `timeout`

**Files:** Create `engine/procs.js`, `tests/shell/procs.test.mjs`; modify `engine/exec.js`, `engine/cmds-basic.js` (`date`), `engine/parse.js` (`$SECONDS`, `$PPID`, `$BASHPID`), `index.html`.

**Interfaces:** Produces `SQ.rt.clock` (seconds, starts 0, reset with the world and by `SQ.sandbox`), `SQ.advance(seconds: number, io): Out[]` (moves the clock forward, running due jobs once Task 12 lands; here it only moves the clock), `SQ.newPid(): number`, `SQ.rt.procs: Proc[]` with `Proc = { pid, ppid, cmd, start, state: 'R'|'S'|'Z'|'T', exit?: number }`. Each outermost typed line costs one virtual second at its end. `CMDS.sleep`, `CMDS.ps`, `CMDS.timeout`, and virtual `date`.

- [ ] **Step 1: failing tests:** `sleep 2; echo $SECONDS` → `3` (2 for sleep, 1 for the line... pin the exact rule: the line's cost is added when the line ends, so inside the line `$SECONDS` is 2 and the next line shows 3); `sleep 0.5` accepted (fractions kept), `sleep 1s 1m`, `sleep abc` → `sleep: invalid time interval 'abc'` status 1, `sleep` alone → `sleep: missing operand`, `sleep 99999999` stops at once with the clock advanced by at most `LIM.SLEEP` (3600) and prints `this practice shell stopped the command: that sleep is too long`; `ps` prints `  PID TTY          TIME CMD`, then `bash`, then `ps` rows with pids 1234 and the next free pid; `ps aux`/`ps -ef` print the richer header and the same rows; `date` prints a fixed epoch plus the clock (`date +%s`, `+%H:%M:%S`, `+%Y-%m-%d` supported subset); `timeout 2 sleep 5` → status 124 after advancing 2 seconds, `timeout 5 echo hi` → `hi`; `$$` is 1234 inside functions and subshells, `$BASHPID` differs in a subshell only if one exists (return 1234 always, documented); the process cap (200) message; the sandbox restores clock and pids.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4:** `npm test`; Beginner golden unaffected (it never calls these). **Step 5:** Commit.

### Task 12a: Background jobs, scheduler core

**Files:** Create `engine/jobs.js`, `tests/shell/jobs.test.mjs`; modify `engine/ast.js` (a trailing or separating `&` becomes `sep:'&'`; the "does not support & yet" message goes away), `engine/interp.js`, `engine/exec.js`.

**Interfaces:** Produces `SQ.rt.jobs: Job[]` with `Job = { id, pid, cmd, node, state: 'Running'|'Done'|'Terminated'|'Stopped', code, wake, gen, vars, cwd, fns }`; `SQ.spawn(node: AST, env, src: string): Job` (copies the shell state like a subshell, takes a pid, prints `[N] PID`); `SQ.gen.run(node, ctx): Generator<{ wake: number }, number>` (a generator interpreter for lists, `&&`/`||`, `if`, `while`, `until`, `for`, `case`, groups, subshells and function calls; every simple command and every multi-stage pipeline runs through the normal synchronous `runCmd`/`runPipeline` as one unit; the `sleep` command yields `{ wake: clock + n }` instead of advancing the clock); `SQ.tick(until: number): Out[]` (runs jobs in wake order up to the time, swapping each job's shell state in and out with `snapshotShell`/`restoreShell`, and returns the output they produced, which the caller puts into the current line's output at that point); `SQ.advance` now calls `SQ.tick`. A job's output goes to the screen as it is produced; file writes happen at the job's virtual time.

- [ ] **Step 1: failing tests:** `sleep 3 & echo started` prints `[1] 1235` then `started`; `(sleep 2; echo hi) &` then three more typed lines (each +1 second) prints `hi` after the second following line and not before; `for i in 1 2 3; do sleep 1; echo $i; done &` prints 1, 2, 3 one per virtual second while the learner types other lines or runs `sleep 5`; two jobs interleave by wake time and then by job number; a job's variables do not leak (`x=1; x=2 & ...; echo $x` → `1`) and `cd` inside a job does not move the shell; a job that writes a file does so at the right time (`(sleep 3; echo a > f) & cat f` fails, `sleep 4; cat f` works); a job calling a function and `source`d code works; `while :; do :; done &` is stopped by the step cap with `this practice shell stopped the job: too many steps` and does not hang the line; `f() { f & }; f` and `:(){ :|:& };:` hit the 16-job and 200-process caps with `bash: fork: retry: Resource temporarily unavailable`, state sane afterwards; pids never repeat within a session; a job that finishes keeps its record until its `Done` notice is shown; `SQ.sandbox` and "Reset world" clear jobs.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** The generator interpreter must reuse the same helpers as `interp.js` (redirects, `runPipeline`, `callFunction`'s frame code) rather than copy them; if more than about 150 lines are duplicated report DONE_WITH_CONCERNS. **Step 4:** `npm test`; corpora (the `&` lines are marked). **Step 5:** Commit.

### Task 12b: `jobs`, `wait`, `kill`, `$!`, notices

**Files:** Create `engine/cmds-proc.js`, extend `tests/shell/jobs.test.mjs`; modify `engine/exec.js`, `engine/parse.js` (`$!`).

**Interfaces:** Produces `CMDS.jobs` (`-l` adds pids, `-p` only pids; format `[1]+  Running                 sleep 30 &`, `+` current, `-` previous), `CMDS.wait` (no args waits for all jobs and returns 0; `wait PID|%N` returns that job's exit status; unknown → `bash: wait: pid 999 is not a child of this shell` status 127; advances the clock to the job's completion, so output the job produces appears during the wait), `CMDS.kill` (`kill PID`, `kill %N`, `kill -s SIG`, `-SIGNAL`, `-9`, `-l` lists signals; unknown pid → `bash: kill: (999) - No such process` status 1; `kill $$` handled in Task 14), notices printed before the next prompt (`[1]+  Done                    sleep 2`, `[1]+  Terminated              sleep 100`, `[1]+  Exit 3                 cmd`), `%%`, `%+`, `%-`, `%N`, `%string` job specs, `$!` (pid of the last job; empty before any).

- [ ] **Step 1: failing tests:** `sleep 5 & wait; echo $SECONDS`; `sleep 2 & wait %1; echo $?` → `0`; `(sleep 1; exit 3) & wait $!; echo $?` → `3`; `sleep 100 & kill %1; jobs` shows `Terminated` once then nothing; `kill -9 1235`; `kill -l`; `kill abc` → `bash: kill: abc: arguments must be process or job IDs`; notices appear once, in job order, after the line that ended them, and never inside `$(...)` output; `jobs` inside a script (non-interactive bash prints the job table too); `wait` with no jobs returns 0 at once; killing a finished job → `No such process`.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4:** `npm test`. **Step 5:** Commit.

### Task 13: `set` options and `bash -c/-n/-x`

**Files:** Create `engine/cmds-opts.js`, `tests/shell/opts.test.mjs`; modify `engine/interp.js`, `engine/parse.js`, `engine/cmds-basic.js` (`bash`/`sh`).

**Interfaces:** Produces `SQ.rt.opts = { e, u, pipefail, x }` (per script frame, inherited by functions and subshells, restored when a script ends), `CMDS.set` (`-e +e -u +u -x +x -o NAME +o NAME` for `errexit nounset pipefail xtrace`, combined `-euo pipefail`, `set --` and `set -- a b c` set positional parameters, `set -o` lists options, others → `set: -X: invalid option`), `bash -c 'cmd' [name args...]`, `bash -n FILE` (parse only, prints nothing and returns 0 or the syntax error), `bash -x FILE`, `sh` the same.

- [ ] **Step 1: failing tests:** `set -e` ends the script at the first failing simple command and returns its status, but not for a failure in an `if`/`while`/`until` condition, in any command of a `&&`/`||` list except the last, after `!`, or inside a function called in such a context; `false || true` and `if false; then :; fi` keep going; `set -u`: `echo "$nope"` → `bash: nope: unbound variable` status 1 and the script ends, `${nope:-d}`, `${nope-}`, `$@`, `$#`, `$?` are fine, `$1` with no arguments is unbound; `set -o pipefail`: `false | true; echo $?` → `1`, `true | false | true` → `1`; `set -x` writes `+ cmd arg` (expanded, one `+` per nesting level) to stderr before each simple command, `set +x` itself is traced; `set -euo pipefail` combined; `set -- a b; echo $#` → `2`; options set inside a function persist after it as in bash, but not after a script ends or in a subshell; typed lines: `set -e` at the prompt does not close the page (a failing line stops that line only, bash would exit the shell; documented); `bash -c 'echo $0 $1' name arg`; `bash -n` reports `s.sh: line 3: syntax error ...` with status 2 and runs nothing; `bash -x s.sh` traces without changing output order of stdout.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4:** `npm test`; allow-list marked `set` lines. **Step 5:** Commit.

### Task 14: `trap` and signals

**Files:** Extend `engine/cmds-proc.js`, `engine/jobs.js`, `engine/interp.js`, `engine/exec.js`; tests `tests/shell/traps.test.mjs`.

**Interfaces:** Produces `SQ.rt.traps: Map<signal, string>` per script frame (inherited by functions, reset in subshells and jobs except `EXIT`-less ignore state), `SQ.signal(pid, sig: string): Out[]` (delivers a signal: a trapped signal runs its handler text through `execLine` at the next command boundary of the target; `TERM`/`INT`/`HUP`/`KILL` end an untrapped job or script with status 128+n; `USR1`/`USR2` untrapped end it too; `0`/`EXIT`, `ERR`, `DEBUG` are pseudo signals), `CMDS.trap` (`trap 'cmd' SIG...`, `trap - SIG`, `trap '' SIG` ignore, `trap -p`, `trap -l`, `trap` alone lists).

- [ ] **Step 1: failing tests:** `bash -c "trap 'echo bye' EXIT; echo hi"` → `hi`, `bye`; EXIT handlers run on end of script, `exit 3` (status kept), an error under `set -e`, `kill $$` (TERM from itself), a step-cap abort (message first, then the handler), and never twice; `trap 'echo err' ERR` fires where `set -e` would exit; `trap 'echo got USR1' USR1; kill -USR1 $$; echo after` → `got USR1`, `after`; `trap '' TERM` makes a job survive `kill %1` (still `Running`) but not `kill -9`; a handler may call `exit n`; `trap - EXIT` removes it; `trap -p EXIT` prints `trap -- 'echo bye' EXIT`; handler text errors are reported once; traps are per script (a sourced file shares the caller's; a function sees and may change the caller's; a subshell inherits nothing but ignored signals); `kill -l` and `trap -l` list `HUP INT QUIT KILL USR1 USR2 TERM CHLD`; signal names accepted with or without `SIG`, case-insensitive numbers 1, 2, 3, 9, 10, 12, 15; a job killed while sleeping runs its trap at the kill time.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4:** `npm test`. **Step 5:** Commit.

### Task 15: `getopts`, `mktemp`, `command`, `readonly`

**Files:** Extend `engine/cmds-opts.js`; tests `tests/shell/opts.test.mjs`.

**Interfaces:** Produces `CMDS.getopts` (`getopts optstring name [args]`, sets `name`, `OPTARG`, `OPTIND`; leading `:` is silent mode; errors `bash: illegal option -- x` and `bash: option requires an argument -- n` with `name` set to `?`, in script form `s.sh: illegal option -- x`; `OPTIND` is per script frame and resettable), `CMDS.mktemp` (`mktemp`, `-d`, `TEMPLATE` with trailing `XXXXXX`, creates under `/tmp` and prints the path; names deterministic from a counter: `/tmp/tmp.A00001`), `CMDS.command` (`command -v NAME` prints the path or name and returns 1 when missing, `command NAME args` bypasses functions), `type -t NAME` (`builtin|file|function|keyword|alias`), `CMDS.readonly` (`readonly X=1` then `X=2` → `bash: X: readonly variable`, unset refused too), `printenv`, `realpath`.

- [ ] **Step 1: failing tests:** a `while getopts "vn:" opt; do case $opt in v) V=1;; n) N=$OPTARG;; \?) ...;; esac; done; shift $((OPTIND-1))` loop over several argument shapes (`-v -n Ada file`, `-vn Ada`, `-nAda`, `--` ends options, missing argument, unknown option, silent mode with `:`); `mktemp` twice gives different names, `-d` makes a directory, files are plain files in `/tmp` and `trap 'rm -f "$t"' EXIT` leaves `/tmp` empty; `command -v ls`, `command -v nope; echo $?` → `1`; `f() { echo mine; }; command f` fails while `f` works; `type -t cd` → `builtin`, `type -t ll` → empty status 1; `readonly` rules.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4:** `npm test`. **Step 5:** Commit.

### Task 16: Process substitution

**Files:** `engine/parse.js` (tokenizer and `scanSub`), `engine/ast.js`, `engine/interp.js`, `engine/fs.js` (virtual `/dev/fd`), tests `tests/shell/procsub.test.mjs`.

**Interfaces:** Produces a word piece `<( list )` that runs the list, stores its stdout in a hidden file `/dev/fd/63`, `/dev/fd/62`, ... (read-only, listed by nothing, removed when the command finishes) and expands to that path; `>( list )` prints `this practice shell does not support >( ) yet`.

- [ ] **Step 1: failing tests:** `diff <(sort a.txt) <(sort b.txt)`; `cat <(echo a) <(echo b)`; `comm -12 <(sort a) <(sort b)`; `while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n` keeps the count (and the piped form gives empty, pinned side by side); `wc -l < <(echo x)`; nested `<( <( ) )`; a failing inner command passes its stderr through and the outer sees empty input; the path is `/dev/fd/63`; unterminated `<(` → `unexpected EOF while looking for matching ')'` status 2; `<(` inside single quotes, inside `[[ ]]` and `$(( ))` stays literal; typed here-docs unaffected; a job-count and nesting cap (20).
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4:** `npm test`; allow-list the marked lines. **Step 5:** Commit.

### Task 17: Mission machinery and Expert tier wiring

**Files:** `engine/exec.js` (`ctxFor`, `scriptPasses`), `app.js`, `ui.js`, `shell-quest/index.html`, `tests/smoke.mjs`, `tests/shell/tiers.test.mjs`, `tests/shell/advanced.test.mjs` (extend), `docs/tiers-guideline.md`.

**Interfaces:** `ctxFor(line)` gains `jobs(): Job[]` (copies), `clock(): number`, `ps(): Proc[]`, `tmpFiles(): string[]` (names under `/tmp`). `scriptPasses` cases gain `expectEmpty: string[]` (directories that must be empty after the run, e.g. `['/tmp']`), `advance: number` (virtual seconds to run after the script ends, so background effects can be checked), `expectClock: number` (the virtual clock must read exactly this after the run and `advance`), and every case runs in a sandbox with a clean clock and no jobs. Expert chapters are accepted by `SQ.tiers` (already declared); the rail shows four tier headers; "Reset world" and chapter switches clear jobs, traps and the clock.

- [ ] **Step 1: failing tests:** a fake Expert chapter injected through the harness completes and awards 25 XP once; `scriptPasses` with `expectEmpty` fails when a script leaves a temp file and passes when it cleans up; `advance` lets a background write be checked; jobs started in a sandboxed check never survive; smoke: four `.tierhead`s, the tier picker and guide filter list `Expert`, an import with chapters 0 to 18 badged shows four complete headers and the rank "Shell Wizard"; `cumulativeXp('expert')` is `1890 + 28*25 + 4*25`; the tier-count assertions from earlier stages are updated minimally.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4:** `npm test`. **Step 5:** Commit.

### Task 18: Expert content, chapters 16 and 17 (indexes 15 and 16)

**Files:** Create `shell-quest/content/tier-expert.js`; modify `index.html`, `content/quickfire.js`, `content/guide.js`; tests `tests/shell/expert.test.mjs`.

**Interfaces:** Same schema, voice and rules as `tier-advanced.js` (outcome-based checks, `anat` chips, idempotent non-clobbering `setup()`, jump-in-safe, per-line log reset with `c.out()` and `SQ.rt.prevLast`, a plausible wrong command and a valid alternative tested for every mission, every explanation verified by running it). Word splitting now exists, so lessons may show the unquoted failure (`for f in $files` with spaces) and teach quoting as the fix. Order-free outputs (array iteration, `-P`) are compared as sorted sets.

World seeding: `~/scripts/` (exists), `village/sales.csv` and `village/logs/access.log` (exist from Intermediate), `config.ini` (exists), `~/inbox/a.txt b.txt c.txt` and `~/lists/a.txt b.txt` (unsorted, overlapping), `~/archive/` (empty directory) for chapter 18 (Task 19).

| # | Chapter / mission | `answer` | check |
|---|---|---|---|
| 16 | **awk & sed craft** (badge Text Wrangler) | | |
| 16.1 | First column | `awk '{print $1}' village/logs/access.log` | output equals the first field of each line, ran `awk` |
| 16.2 | Pick a separator | `awk -F, '{print $1}' village/sales.csv` | names, one per line, `-F` used |
| 16.3 | Filter rows | `awk -F, '$2 > 10 {print $1}' village/sales.csv` | output `apple`,`bread`, a pattern present |
| 16.4 | Add it up | `awk -F, '{s += $2 * $3} END {print s}' village/sales.csv` | output `274`, `END` used |
| 16.5 | Count with an array | `awk '{c[$4]++} END {for (k in c) print k, c[k]}' village/logs/access.log` | the lines `200 7`, `404 3`, `500 2` in any order (verify against the seed) |
| 16.6 | Edit in place | `sed -i 's/debug=false/debug=true/' config.ini` | `config.ini` has `debug=true`, every other line unchanged, `sed -i` ran |
| 16.7 | **Script: report** (`script`, `scripts/report.sh`) | script taking a CSV path and printing `NAME  TOTAL` with `awk -F, '{printf "%-8s %7.2f\n", $1, $2*$3}'` | cases (with `files` overrides): the sales file; a one-row file; a file with a header row skipped by `NR>1`; a missing file → stderr `report.sh: cannot read X`, code 1 |
| 17 | **Processes & jobs** (badge Job Controller) | | |
| 17.1 | See the processes | `ps` | output has the `PID TTY          TIME CMD` header and a `bash` row |
| 17.2 | Run in the background | `sleep 30 &` | output `[1] 1235`; one running job |
| 17.3 | List the jobs | `jobs` | output shows `Running` and `sleep 30 &`; the goal says to start the job first, and the one-liner `sleep 30 & jobs` also passes so a jump-in works in a fresh world |
| 17.4 | Wait for it | `sleep 5 & wait` | the clock advanced by at least 5, no jobs left, `wait` ran |
| 17.5 | Kill it | `sleep 100 & kill %1` | the job ended `Terminated`; `kill` ran with `%1` or the pid |
| 17.6 | The last job's pid | `sleep 2 & pid=$!; wait $pid; echo "finished $pid"` | output `finished 1235` (or the real pid), `$!` and `wait` used |
| 17.7 | **Script: fan out** (`script`, `scripts/fanout.sh`) | script that starts `(sleep $n; echo "$n done") &` for every argument, then `wait`s | cases: `3 1 2` → `1 done`,`2 done`,`3 done`; no arguments → prints `usage: fanout.sh SECONDS...` on stderr, code 1; `1` → `1 done`; the case's virtual clock ends at 3 for `3 1 2` (`expectClock`: add this case field in Task 17 if needed) |

- [ ] **Step 1: write `expert.test.mjs`:** chapter indexes 15 and 16, 7 missions each, `tier:'expert'`, solvability covers every mission, per mission one wrong and one alternative command or script (list in the file), jump-in-safe fresh world, `setup()` twice changes nothing, earlier tiers untouched, every explain text re-run in the harness.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** the chapters, 6 quick-fire entries per chapter (tier `expert`, `{exact:true}` where quoting matters) and 6 guide entries per chapter (`ch: 15`, `ch: 16`) covering `awk` fields/`-F`/`BEGIN`/`END`/arrays/`printf`, `sed` addresses and `-i`, `sleep`, `&`, `jobs`, `wait`, `kill`, `ps`, `$!`. **Step 4:** `npm test`; play all 14 missions through the real UI. **Step 5:** Commit.

### Task 19: Expert content, chapters 18 and 19 (indexes 17 and 18) with the capstone

**Files:** `content/tier-expert.js`, `content/quickfire.js`, `content/guide.js`, `tests/shell/expert.test.mjs`.

| # | Chapter / mission | `answer` | check |
|---|---|---|---|
| 18 | **Pipeline mastery** (badge Pipeline Architect) | | |
| 18.1 | Run a command on every match | `find inbox -name '*.txt' -exec wc -l {} \;` | one `N path` line per file, `-exec` used |
| 18.2 | Feed a command with xargs | `ls inbox/*.txt \| xargs -I{} cp {} archive/` | `archive/` holds the three files, `xargs -I` used |
| 18.3 | Work in parallel | `echo 1 2 3 \| xargs -n1 -P3 echo job` | lines `job 1`,`job 2`,`job 3` in any order, `-P` used |
| 18.4 | Compare without temp files | `diff <(sort lists/a.txt) <(sort lists/b.txt)` | output equals the diff of the sorted files, `<(` used |
| 18.5 | Keep the variable | `while read l; do n=$((n+1)); done < <(cat inbox/a.txt); echo $n` | output equals the line count of `inbox/a.txt`; the piped form (`cat \| while`) is the planned wrong answer |
| 18.6 | Top three | `sort village/logs/access.log \| awk '{print $1}' \| uniq -c \| sort -rn \| head -3` | output equals the real top three with counts |
| 18.7 | **Script: top N** (`script`, `scripts/topn.sh`) | script `topn.sh FILE N` printing the N most frequent first-field values as `COUNT VALUE`, ties broken by value | cases with `files` overrides: the access log with N 2; N larger than the distinct values; an empty file → no output; a missing file → stderr, code 1; no arguments → usage, code 2 |
| 19 | **Safe, debuggable scripts** (badge Toolsmith) | | |
| 19.1 | Stop on error | `bash -c 'set -e; false; echo after'; echo $?` | output `1` only (no `after`) |
| 19.2 | No unset variables | `bash -c 'set -u; echo "$nope"'` | output has `nope: unbound variable`, status 1 |
| 19.3 | See the whole pipeline's status | `bash -c 'set -o pipefail; false \| true; echo $?'` | output `1` |
| 19.4 | Trace it | `set -x; echo hi; set +x` | trace lines `+ echo hi` and `+ set +x` plus `hi` |
| 19.5 | Clean up after yourself | `bash -c "trap 'echo bye' EXIT; echo hi"` | output `hi` then `bye` |
| 19.6 | **Script: options** (`script`, `scripts/opts.sh`) | script using `getopts "vn:"`: `-n NAME` greets (`Hello, NAME!`), `-v` adds `verbose on` first, anything else prints `usage: opts.sh [-v] -n NAME` on stderr and exits 2 | cases: `-n Ada`; `-v -n Ada`; `-vn Ada`; no arguments (usage, 2); `-x` (usage, 2); `-n` alone (usage, 2) |
| 19.7 | **Capstone: a robust log tool** (`challenge`, `scripts/logtool.sh`) | script `logtool.sh [-l LEVEL] [-n N] FILE`: `set -euo pipefail`, option parsing with `getopts`, a `mktemp` work file removed by `trap ... EXIT` on every path, prints the top N source IPs (first field) of lines containing LEVEL as `COUNT IP` (defaults ERROR and 3), `error: cannot read FILE` on stderr with status 1 for an unreadable file, usage with status 2 for bad options | cases: `village/logs/all.log` defaults; `-l WARN -n 1`; `-n 2 FILE`; unknown level with no matches → no output, status 0; missing file → status 1; bad option → status 2; `expectEmpty:['/tmp']` on every case |

- [ ] **Step 1: extend `expert.test.mjs`** as in Task 18 for chapters 18 and 19, `wrong` scripts for every script mission (a topn that sorts by value, a logtool that leaves its temp file, one that ignores `-n`, one that exits 0 on a missing file, one without `set -e` semantics visible by a failing `awk`), a check that all 28 Expert missions exist, `cumulativeXp('expert')` equals `1890 + 28*25 + 4*25`, rank "Shell Wizard" present, Advanced cumulative XP still 1890.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** chapters, 6 quick-fire and 6 guide entries per chapter (`ch: 17`, `ch: 18`) covering `find -exec`, `xargs`, `<( )`, `set -euo pipefail`, `-x`, `trap`, `getopts`, `mktemp`, `$?` and exit codes. **Step 4:** `npm test`; play all 14 missions through the UI (scripts through the editor). **Step 5:** Commit.

### Task 20: Integration, docs and playthrough

**Files:** `tests/smoke.mjs`, `shell-quest/engine/cmds-basic.js` (`help`), `shell-quest/ui.js` (end-of-course text), `docs/tiers-guideline.md`, `docs/superpowers/specs/2026-10-19-shell-quest-tiers-design.md` (Stage 3 as built), `README.md`, `.github/workflows/ci.yml`.

- [ ] **Step 1:** update tier-count assertions; add a smoke test that importing a save with all 19 chapters badged shows four complete headers, `★` on each and the top rank; old saves (Beginner-complete, Intermediate-complete, Advanced-complete) load with the right rank and Expert at 0/4.
- [ ] **Step 2: Docs:** guideline gains the virtual clock and jobs model (how a mission can check background effects: `advance`, `c.jobs()`, `c.clock()`), `expectEmpty`, awk/sed/grep capability lists with what is unsupported, the generator executor and its approximations (a job's pipeline stages run as one unit; effects at the job's virtual time), the corpus2 workflow; `help` is rewritten to list commands by tier (its unmarked `help cd` corpus entry gets `expectChange` metadata with a reason, as in Stage 2); the spec gains a Stage 3 as-built note (deviations, caps, and the limitations that remain: arrays and `declare`, `getline`/`system()` in awk, `sed` hold space and `w`/`r`/`e`, `>( )`, job-control `fg`/`bg`/`disown`/`nohup`, `wait -n`, interactive prompting, real wall-clock time); README Tiers section and test counts.
- [ ] **Step 3: Playthrough:** serve the repo and use Playwright (`PW_CHROMIUM=/opt/pw-browsers/chromium`) to complete all 28 Expert missions through the UI, confirm 4 badges, `4/4 ★`, four complete tier headers and "Shell Wizard"; screenshots at 1280px and 390px in light and dark of an Expert chapter card, the editor with a script and a failing-test line, and the rail with four tiers; fix visible problems.
- [ ] **Step 4: Run** `npm test`, `python3 tools/build.py --check`, `node --check` on every JS file, CI YAML valid; smoke three times in a row. **Step 5: Commit and open the stage-3 PR.**

---

## Self-review (against the spec)

- **Spec §3 Stage 3:** `awk` fields, `-F`, `BEGIN/END`, patterns, variables, arrays, `printf` (Tasks 5, 8, 9); `sed` addresses, `-i`, `-E` and `grep -E -o -w -r -A -B` (Tasks 6, 7); process table `ps`, `&`, `jobs`, `wait`, `kill`, `sleep`, `trap`, signals, `$!` (Tasks 11, 12a, 12b, 14); `find -exec`, `xargs -I`/`-P`, `<( )` (Tasks 10, 16); `set -euo pipefail`, `set -x`, `getopts` (Tasks 13, 15). **§4 Expert content:** four chapters with the capstone (Tasks 18, 19). **Compatibility and testing:** Tasks 1, 17, 20 and every task's `npm test`.
- **Beyond the spec, on purpose:** Task 2 and Task 3 close the Stage 2 limitations a safe-scripting tier cannot teach around (file-name prototype bug, state cap, `${X:?}`, `$(false)` status, subshell pipelines); Task 4 adds real word splitting and prefix assignments because Chapter 19 teaches quoting and `IFS`.
- **Out of this plan by design:** bash arrays and `declare`, `getline`/`system()`/redirects in awk, sed hold space, `>( )`, `fg`/`bg`/`disown`/`nohup`, real timers.
- **Consistency:** names used across tasks are `SQ.fmtPrintf`, `SQ.sedRun`, `SQ.awkParse`, `SQ.awkRun`, `SQ.rt.clock`, `SQ.advance`, `SQ.newPid`, `SQ.rt.procs`, `SQ.rt.jobs`, `SQ.spawn`, `SQ.gen.run`, `SQ.tick`, `SQ.signal`, `SQ.rt.traps`, `SQ.rt.opts`, `SQ.splitFields`, `ctx.jobs/clock/ps/tmpFiles`, `scriptPasses` fields `expectEmpty`/`advance`/`expectClock`, as defined in Interfaces (`expectClock` is added by Task 17 together with `advance`).
- **Known risk to confirm early:** the generator executor (Task 12a) duplicates control-flow logic from `interp.js`. If a shared helper cannot keep the duplication small, the implementer reports it and the controller decides between a larger refactor of `interp.js` and keeping jobs to simple lists, loops and functions.
