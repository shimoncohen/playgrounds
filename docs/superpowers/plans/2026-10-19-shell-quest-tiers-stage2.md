# Shell Quest Tiers, Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-line interpreter with a real parser and interpreter (compound commands, functions, arguments, arithmetic, here-docs), add an editor panel for multi-line scripts, add the `script` and `challenge` mission kinds, and ship the Advanced tier (4 chapters, 28 missions).

**Architecture:** The existing tokenizer keeps word `raw` slices so words still expand when each command runs. A new recursive-descent parser (`engine/ast.js`) turns tokens into an AST for a whole script text. A new interpreter (`engine/interp.js`) walks the AST and reuses today's per-command pipeline logic unchanged. The editor is a plain-textarea panel mounted in the terminal column. Script missions run hidden test cases against the learner's file in a sandboxed copy of the world.

**Tech Stack:** Vanilla JS classic scripts under the `SQ` namespace, Node `vm` engine tests (`npm run test:engine`), Playwright smoke tests, `tools/build.py` bundling.

**Spec:** `docs/superpowers/specs/2026-10-19-shell-quest-tiers-design.md` (§3 Stage 2, §4 mission kinds). Stage 1 as built: `docs/tiers-guideline.md`. Stage 3 (awk, processes, Expert) gets its own plan.

## Global Constraints

- The 52 beginner answers stay byte-identical: `tests/shell-golden.mjs` (BEGINNER_CHAPTERS = 7) and both fixtures are never regenerated. Task 1 adds a wider corpus test that every later task must keep green.
- localStorage key `shell-quest-v1`; existing chapter indexes 0 to 10 and `"<chapter>.<mission>"` keys unchanged; Advanced chapters are appended as indexes 11 to 14. New state is created lazily and read with a fallback (`S.fns||{}`); `fresh()` stays unchanged.
- Words still expand at the moment each command runs (`X=1; echo $X`, `touch a1 a2; ls a*`). `$(...)` stays a subshell. `&&`/`||` keep left-to-right short-circuit on the last run status. Log entry shape `{name,args,globbed,piped,redirect,errRedirect,code,out}` is unchanged.
- Unsupported syntax prints `this practice shell does not support <X> yet` (exit 2, no `bash:` prefix). Syntax errors print `bash: syntax error near unexpected token 'X'` (exit 2). The whole script text is parsed before anything runs.
- Caps keep working: `LIM.STEPS` per typed line (loops count one step per pass), output caps, nesting caps. New caps: function nesting 100 (`bash: <name>: maximum function nesting level exceeded`), arithmetic expression length 200, editor file size 1,000,000 characters.
- No new runtime dependencies. No inlined file may contain the literal text `</script` (`tools/build.py` rejects it). Engine files stay DOM-free.
- Mission XP for Advanced is 20, badge +25; Advanced end rank is "Automator" (computed from content, about 1890 XP).
- Every task ends with `npm test` and `python3 tools/build.py --check` green. Smoke tests run on Node 22 locally and Node 24 in CI.
- Commits: author `Shimon Cohen <33935191+shimoncohen@users.noreply.github.com>`, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, no session links.

## Review Focus

1. **Malformed compounds:** `if` without `fi`, `done` without `do`, stray `}` or `esac`, unterminated here-doc or `$(( `. Expected: bash-style syntax error, exit 2, nothing from the script ran, no hang. Pinned in Tasks 4 and 5.
2. **Runaway control flow:** `while true; do :; done`, `f() { f; }; f`, `while :; do x=$x$x; done`. Expected: the step or nesting message, state restored (cwd, variables, frames), next line works. Pinned in Task 6.
3. **Word splitting in new expansions:** `"$@"` vs `$@` vs `"$*"`, empty arguments, arguments with spaces, `${X:-a b}`, `$(( ))` with spaces, empty, division by zero, `2**1000000`, non-numeric operands. Expected: correct words or a clear error, never NaN or an uncaught exception. Pinned in Tasks 2 and 3.
4. **Saved state:** old saves load unchanged; `S.fns` survives reload and export/import; frames and the sandbox never leak into saved state. Pinned in Tasks 6 and 8.
5. **Editor input:** a 1 MB file, CRLF line endings, tabs, file names with HTML characters, `nano` on a directory or a missing parent, closing with unsaved edits, two files opened in a row, touch devices. Expected: clear message or safe handling, no markup injection. Pinned in Task 9.

---

## File Structure

```
shell-quest/engine/arith.js        SQ.arith: integer expression evaluator (no eval)
shell-quest/engine/ast.js          SQ.parseProgram(text): Program (recursive descent over tokens)
shell-quest/engine/cmds-flow.js    [ test true false : read shift local return exit break continue source . unset
shell-quest/engine/interp.js       SQ.runProgram, functions, frames, subshell snapshot, runScript, sandbox
shell-quest/engine/parse.js        (modify) tokenizer: newline, ( ) ;; tokens, here-doc/here-string, ${ } $(( )) , positional params
shell-quest/engine/exec.js        (modify) execLine0 becomes parse+run; runPath uses runScript; ctxFor gains out/exists/runScript
shell-quest/editor.js              editor panel (DOM)
shell-quest/content/tier-advanced.js
tests/fixtures/shell-corpus.json, shell-corpus-allow.json
tests/shell/{corpus,arith,params,ast,flow,functions,scripts,advanced}.test.mjs
```

Script order in `shell-quest/index.html` (the harness reads the same list): `../shared/progress.js`, `../shared/tiers.js`, `engine/fs.js`, `engine/parse.js`, `engine/arith.js`, `engine/ast.js`, `engine/cmds-basic.js`, `engine/cmds-text.js`, `engine/cmds-sys.js`, `engine/cmds-flow.js`, `engine/interp.js`, `engine/exec.js`, `content/tiers.js`, `content/tier-beginner.js`, `content/tier-intermediate.js`, `content/tier-advanced.js`, `content/guide.js`, `content/quickfire.js`, `ui.js`, `editor.js`, `app.js`.

---

### Task 1: Differential corpus guard

**Files:**
- Create: `tests/fixtures/shell-corpus.json`, `tests/fixtures/shell-corpus-allow.json`, `tests/shell/corpus.test.mjs`

**Interfaces:**
- Produces: a test every later task keeps green. Fixture entry: `{ line, out, code, cwd, vars, files }` (`files` = sorted list of regular-file paths and sizes under HOME after the line). `shell-corpus-allow.json` maps a line to `{ reason, out?, code? }` for intentional changes; an allowed line must match its override.

- [ ] **Step 1: Write `tests/shell/corpus.test.mjs`.** Load the shell, run each corpus line in a fresh world with the chapter setups for chapters 0 to 10 applied, compare to the fixture. `UPDATE_CORPUS=1` rewrites `shell-corpus.json` (used only in this task).
- [ ] **Step 2: Build the corpus on unmodified code**: about 250 lines covering every beginner and Intermediate answer, plus quoting, globs, variables, `for` one-liners, redirects, pipes, `&&`/`||`/`;`, `$(...)`, `cd/ls/cp/mv/rm` edge cases, typo suggestions, `man`, `help`, `history`, error messages, and every unsupported-syntax line (`<<`, `<<<`, `&>`, `$(( ))`, `|&`, `if`, `while`, `$1`, `$@`, `${X:-d}`). Mark lines that Stage 2 will change in the allow file, each with its reason.
- [ ] **Step 3: Run** `node --test tests/shell/corpus.test.mjs`. Expected: PASS twice. Commit.

### Task 2: Arithmetic evaluator

**Files:**
- Create: `shell-quest/engine/arith.js`, `tests/shell/arith.test.mjs`
- Modify: `shell-quest/index.html`

**Interfaces:**
- Produces: `SQ.arith(expr: string, env: { get(name: string): string, set(name: string, v: string): void }): string` returning the decimal result. Throws `Error` with `raw:true` and message `bash: <expr>: <reason>`. Operators: `+ - * / % **`, unary `- + ! ~`, `< <= > >= == !=`, `&& || &`, `|`, `^`, `<< >>`, `?:`, `( )`, assignment `= += -= *= /= %=`, `++`/`--` prefix and postfix on variables. Bare names read variables (empty or non-numeric reads as 0). 64-bit signed wrap-around via BigInt.

- [ ] **Step 1: Write failing tests** (`arith.test.mjs`): `6*7`→`42`; `2**10`→`1024`; `-7/2`→`-3`; `-7%3`→`-1`; `1<2`→`1`; `3>4||2>1`→`1`; `x=5` sets `x` and returns `5`; `i++` returns the old value and sets the new one; `(1+2)*3`→`9`; `0x10`→`16`; `9223372036854775807+1`→`-9223372036854775808`; errors: `1/0` → `division by 0`, `1+` → `syntax error in expression`, empty string → `0`, a 201-character expression → `expression too long`, `2**-1` → `exponent less than 0`, `2**1000000` returns quickly (wrap-around via repeated squaring, not a huge BigInt).
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Implement** `SQ.arith` (precedence climbing over a hand tokenizer). **Step 4: Run** `npm run test:engine`; PASS. **Step 5: Commit.**

### Task 3: Parameter expansion, special parameters and frames

**Files:**
- Modify: `shell-quest/engine/parse.js` (`getVar`, `VRX`, `tokenize` for `${ }`, `$(( ))`, `"$@"`), `shell-quest/engine/fs.js` (`SQ.rt.frames`)
- Test: `tests/shell/params.test.mjs`

**Interfaces:**
- Consumes: `SQ.arith` (Task 2).
- Produces: `SQ.rt.frames: Frame[]` where `Frame = { name: string, args: string[], kind: 'script'|'function'|'source', locals: Map<string,string|undefined>|null }`; `SQ.frame(): Frame` (top frame, or the base frame `{name:'bash',args:[],kind:'script',locals:null}`). `getVar` additionally resolves `0`, `1`..`9`, `{10}` and up, `#`, `@`, `*`, `$` (always `1234`). `${X:-d}`, `${X:=d}`, `${X:+a}`, `${X:?msg}`, `${#X}`, `${X#p}`, `${X##p}`, `${X%p}`, `${X%%p}` (shell patterns), `${X/a/b}`, `${X//a/b}`, `${X:off:len}`. `$(( expr ))` expands to the result. Unquoted `$@`/`$*` split into one word per argument; `"$@"` yields one word per argument (and no word when there are none); `"$*"` joins with a space.

- [ ] **Step 1: Write failing tests:** with a pushed frame `{name:'f',args:['a b','c']}`: `echo $1` → `a b`; `echo "$@"` yields two words (check via `printf '[%s]' "$@"` → `[a b][c]`); `printf '[%s]' $@` → `[a][b][c]`; `echo $#` → `2`; `echo $0` → `f`; unset `echo ${X:-dflt}` → `dflt` and `X` stays unset; `${X:=dflt}` sets it; `echo ${#V}` for `V=hello` → `5`; `V=file.tar.gz`: `${V%.*}` → `file.tar`, `${V%%.*}` → `file`, `${V#*.}` → `tar.gz`, `${V/tar/zip}` → `file.zip.gz`; `echo $((2+3))` → `5`; `echo $(( ))` → `0`; `echo $((1/0))` → `bash: 1/0: division by 0` code 1; `echo ${X:?oops}` with X unset → `bash: X: oops` code 1; unterminated `echo ${X` → `bash: unexpected EOF while looking for matching '}'` code 2; `echo $((1+` → `bash: unexpected EOF while looking for matching '))'`. The tests also confirm `$(( ))` and `${` are literal inside single quotes.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** in the tokenizer and `getVar` (the `$((` branch of `scanSub` now scans to the matching `))`). Remove the `$(( )) arithmetic` unsupported error. **Step 4: Run** `npm test`; corpus allow-list updated only for `$1`, `$@`, `$#`, `${X:-d}`, `$(( ))` lines; golden stays green. **Step 5: Commit.**

### Task 4: Tokenizer additions: newlines, parentheses, here-documents

**Files:**
- Modify: `shell-quest/engine/parse.js` (`tokenize`, a new `expandHeredoc(raw): string`)
- Test: `tests/shell/params.test.mjs` (extend) and `tests/shell/ast.test.mjs` (token cases)

**Interfaces:**
- Produces: tokenizer ops `{t:'op',v:'\n'}` (unquoted newline), `(`, `)`, `;;`, `<<`, `<<-`, `<<<`. A here-doc op is followed by a word and then carries `{t:'op',v:'<<',doc:{raw: string, quoted: boolean, strip: boolean, delim: string}}` where `raw` is the body text up to the delimiter line (tabs stripped per line when `<<-`). `\`+newline joins lines. `expandHeredoc(raw)` expands `$VAR`, `${ }`, `$(...)`, `$(( ))` and honours `\$`, `` \` ``, `\\` (used only when the delimiter was unquoted). `{` and `}` stay ordinary words (the parser treats them as reserved words at command position). `<<<` takes one word (here-string). `&>` and `|&` stay unsupported.

- [ ] **Step 1: Write failing tests:** tokenizing `a\nb` gives `w,op(\n),w`; `f() { echo hi; }` gives `w op( op) w w w op(;) w`; `case x in a) echo 1;; esac` yields a `;;` op; `cat <<EOF\nhello $USER\nEOF\n` yields one here-doc op whose `raw` is `hello $USER\n`; quoted delimiter `<<'EOF'` sets `quoted:true`; `<<-EOF` with tab-indented body strips tabs; `\`+newline continues a line; unterminated here-doc yields the body to the end and sets `doc.eof=true` (the executor prints `bash: warning: here-document delimited by end-of-file (wanted 'EOF')` and runs); `echo (` now yields a `(` op (bash would also reject it). Existing tokenizer tests unchanged.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`. The old `<<` / `<<<` unsupported messages are removed; `streams.test.mjs` lines pinning `<<<` are edited to the new behaviour (here-string implemented in Task 6). Check golden and corpus: any unquoted parenthesis in today's beginner commands would now be a syntax error, so confirm none exists. **Step 5: Commit.**

### Task 5: AST parser

**Files:**
- Create: `shell-quest/engine/ast.js`, `tests/shell/ast.test.mjs`
- Modify: `shell-quest/index.html`

**Interfaces:**
- Consumes: `SQ.tokenize(text, {dry:true})`.
- Produces: `SQ.parseProgram(text: string): List` and these node shapes (all nodes carry `src` = the exact source slice, needed to store functions):
  - `List { type:'list', items: { andor: AndOr, sep: ';'|'&'|'\n' }[] }`
  - `AndOr { type:'andor', first: Pipeline, rest: { op:'&&'|'||', pipe: Pipeline }[] }`
  - `Pipeline { type:'pipeline', negate: boolean, cmds: Command[] }` (`!` at the start sets `negate`)
  - `Simple { type:'simple', words, out, inp, err, doc, herestr }` (the first four exactly as `parse()` produces today; `doc` the here-doc, `herestr` a word token)
  - `If { type:'if', branches:{cond:List, body:List}[], else:List|null, redirs }`, `While { type:'while'|'until', cond, body, redirs }`, `For { type:'for', var, words: Token[]|null, body, redirs }` (`words:null` means "$@"), `Case { type:'case', word, arms:{patterns:Token[], body:List}[], redirs }`, `Group { type:'group', body, redirs }` (`{ ...; }`), `Subshell { type:'subshell', body, redirs }`, `Func { type:'func', name, body: Group }`, `Arith { type:'arith', expr }` for `(( expr ))`, `Cond { type:'cond', raw }` for `[[ ... ]]` (the raw inner text; evaluated in Task 7).
  - `redirs` is `{ out, inp, err, doc, herestr }` after the closing keyword.
- Errors: `Error` with `raw:false`, `code 2`: `syntax error near unexpected token 'X'`, `syntax error: unexpected end of file`. A trailing `&` or any `&` separator prints `this practice shell does not support & yet`. Arrays and `select` print their unsupported message.

- [ ] **Step 1: Write failing tests** (each asserts the node shape and, for errors, the exact text and code): `echo a; echo b` → list of 2; `a && b || c` → one andor with 2 rest items; `a | b | c` → 3 cmds; `! false` → negate; `if x; then y; elif z; then w; else v; fi`; multi-line `while`; `until`; `for i in 1 2 3; do ...; done`; `for i; do ...; done` (`words:null`); `case $x in a|b) ...;; *) ...;; esac`; `f() { ...; }` and `function f { ...; }`; `( a; b )`; `{ a; b; }`; `(( i+1 ))`; `[[ -f x && -n y ]]`; `done < file`, `fi | cat` (redirs and pipes after a compound); newlines allowed after `&&`, `||`, `|`, `then`, `do`, `else`, `{`; errors: `if x; then y` → `syntax error: unexpected end of file`; `done` alone → `syntax error near unexpected token 'done'`; `echo a;; echo b` → `syntax error near unexpected token ';;'`; `) ` and `}` alone; `then` without `if`; `case x in a) ;;` without `esac`; `echo hi &` → unsupported `&`; `arr=(1 2)` → `this practice shell does not support arrays yet`.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** `parseProgram` (reserved words only at command position; `in`, `do`, `done` etc. are ordinary words elsewhere). **Step 4: Run** `npm run test:engine`; PASS. **Step 5: Commit.**

### Task 6: Interpreter core

**Files:**
- Create: `shell-quest/engine/interp.js`
- Modify: `shell-quest/engine/exec.js` (`execLine0` becomes `runProgram(parseProgram(line), env)`; remove `FOR_RE` and its error text; `runCmd` gains function dispatch and passes `ctl`), `shell-quest/engine/fs.js` (`S.fns` documented as lazy)
- Test: `tests/shell/functions.test.mjs`, `tests/shell/streams.test.mjs` (edit pinned `<<<` lines)

**Interfaces:**
- Consumes: Task 5 AST, `SQ.runCmd`, `SQ.step`, `SQ.arith`, `SQ.rt.frames`.
- Produces: `SQ.runProgram(node: List, env: Env): { out: Out[], code: number, ctl?: Ctl, ui?: object }` where `Env = { depth: number, tty: boolean, record: boolean, stdin: StdinBox|null }`, `StdinBox = { text: string, pos: number }`, `Ctl = { type: 'break'|'continue'|'return'|'exit', n: number }`. `runCmd` results may carry `ctl` and `ui`; a pipeline honours `ctl` only when it has one command. `SQ.snapshotShell(): Snap` and `SQ.restoreShell(snap)` (cwd, oldpwd, vars copy, exp copy, fns copy, last, frames length) replace the inline snapshot code in `runSub`, `runPath` and the subshell. Function table: `S.fns[name] = sourceText` (lazy). `SQ.callFunction(name, args, io)` pushes a frame, runs the cached parse of the stored text, pops the frame, and honours `return`. `io.stdinBox` is set for commands whose stdin comes from a compound redirect, here-doc, here-string or pipe.
- Semantics pinned: the old per-pipeline loop body is moved verbatim into `runPipeline` (redirect pre-truncation, `2>&1` ordering, stderr to screen, status = last stage); `for` expands its list once, logs one `{name:'for', args:items, globbed}` entry and one step per pass; keyword entries `{name:'if'|'while'|'until'|'case'|'(fn)'|'((', args:[], code}` are logged after a compound completes (`record` only); `while`/`until` count a step per pass; conditions of `if`/`while` run with `record` unchanged; function calls log nothing except their inner commands; `S.last` updates after every pipeline; `local NAME[=v]` records the previous value in the top frame and restores it on return; a function definition stores `S.fns[name]` and logs `(fn)`; calling an undefined name is `command not found` as today; function names take precedence over builtins and commands; function depth over 100 → `bash: <name>: maximum function nesting level exceeded` and the call unwinds; `break`/`continue` outside a loop and `return` outside a function or sourced script print bash's messages (`return: can only 'return' from a function or sourced script`); `exit` at typed top level keeps today's friendly message, inside a script it ends the script. `<<<` and here-docs feed `io.stdinBox`. A subshell `( ... )` snapshots and restores like `$(...)`. The whole text is parsed before anything runs, so a syntax error prints once and executes nothing.

- [ ] **Step 1: Write failing tests** (`functions.test.mjs`, one-liners through `run`; conditions use `echo`/`ls` status because `[` arrives in Task 7): `if echo ok >/dev/null; then echo y; else echo n; fi` → `y`; `if ls nothing 2>/dev/null; then echo y; else echo n; fi` → `n`; `until false; do echo a; break; done` → `a`; `for i in 1 2 3; do echo $i; done | wc -l` → `3`; `for x in a b; do echo $x; done && echo end`; `case apple in a*) echo A;; b*) echo B;; esac` → `A`; `case x in a|x) echo m;; esac` → `m`; `greet() { echo "Hello, $1!"; }; greet Ada` → `Hello, Ada!`; `count() { echo $#; }; count a b c` → `3`; a function persists to the next typed line and `JSON.parse(JSON.stringify(SQ.S)).fns.greet` exists; `f() { local x=2; echo $x; }; x=1; f; echo $x` → `2` then `1`; `f() { return 3; }; f; echo $?` → `3`; `f() { f; }; f` prints the nesting message and the next `echo ok` works with `SQ.rt.frames` empty; `until false; do :; done` is stopped with `this practice shell stopped the command: too many steps` and `pwd` is still correct; `{ echo a; echo b; } | wc -l` → `2`; `( cd forest; pwd ); pwd` → `/home/explorer/forest` then `/home/explorer`; `cat <<< "hi there"` → `hi there`; `! echo a >/dev/null; echo $?` → `1`; `for l in a; do cat; done < journal.txt` prints the file; nested `for` inside `if` inside a function; `touch zz; if x` prints the syntax error and `zz` does not exist; `for i in $(seq 1 5000); do echo $i; done` is cut at 2000 lines as today.
- [ ] **Step 2: Run**; FAIL (most tests). **Step 3: Implement** `interp.js` and wire `execLine0`. Keep `execLine`'s outermost wrapper (caps, try/catch, `prevLast`, `capLines`) untouched; set `SQ.rt.lastOut` at the end of the outermost call (joined stdout text) for Task 8. **Step 4: Run** `npm test`: corpus (with the allow-list from Tasks 3 and 4), golden and all existing engine tests must pass; the `for loop needs this shape` message is removed from the corpus allow-list with a reason. **Step 5: Commit** (two commits are fine: "interpreter core", "functions and frames").

### Task 7: Conditions and stateful builtins

**Files:**
- Create: `shell-quest/engine/cmds-flow.js`, `tests/shell/flow.test.mjs`
- Modify: `shell-quest/engine/interp.js` (evaluate `Cond` and `Arith` nodes), `shell-quest/engine/cmds-sys.js` (`BUILTINS` list), `shell-quest/engine/cmds-basic.js` (`echo -e`)

**Interfaces:**
- Consumes: `SQ.runProgram` control signals, `io.stdinBox`, `SQ.frame()`.
- Produces on `SQ.CMDS`: `[` (requires a closing `]`; error `bash: [: missing ']'` exit 2), `test`, `true`, `false`, `:`, `read [-r] [-p prompt] NAME...`, `shift [n]`, `local`, `return [n]`, `exit [n]`, `break [n]`, `continue [n]`, `source FILE [args]` and `. FILE [args]`, `unset [-v|-f] NAME`. `SQ.evalCond(raw: string): number` evaluates `[[ ... ]]` (status 0/1/2). Supported tests for `[`, `test` and `[[`: `-e -f -d -r -w -x -s -L -z -n`, `= == != < > -eq -ne -lt -le -gt -ge`, `!`, `( )`, `-a`/`-o` (for `[`/`test`); `[[` adds `&&`, `||`, glob patterns on the right of `==`/`!=`, and `=~` (JavaScript regex through `SQ.safeRegex`, captures in `BASH_REMATCH` unsupported: print the standard unsupported message when `BASH_REMATCH` is read). `(( expr ))` evaluates with `SQ.arith` (status 0 if the result is nonzero). `read` consumes lines from `io.stdinBox` (advancing `pos`; with `-r` backslashes stay; word splitting by whitespace into the NAMEs, the last NAME gets the rest; `REPLY` when no NAME); returns 1 at end of input; with no stdin on a typed line it prints `read: this practice shell cannot wait for typing. Pipe input in (echo Ada | read name) or use a here-string: read name <<< Ada` and returns 1. `echo -e` expands `\n \t \\`; `-n` and `-e` flags are removed from the output (golden has no `echo -e`).

- [ ] **Step 1: Write failing tests** (`flow.test.mjs`): `[ -f journal.txt ] && echo yes` → `yes`; `[ -d nothing ] || echo no` → `no`; `[ 5 -gt 3 ] && echo big`; `[ "a" = "a" ]`; `[ 3 -gt abc ]` → `bash: [: abc: integer expression expected` exit 2; `[ -f ]` and `[ ]` (status 1); `test -s journal.txt`; `[[ "$USER" == exp* ]] && echo m`; `[[ -n x && -z "" ]]`; `[[ abc =~ ^a.c$ ]]`; `(( 3 > 2 )) && echo y`; `i=0; while [ $i -lt 3 ]; do echo $i; i=$((i+1)); done` → `0`,`1`,`2`; `until [ $n -eq 0 ]` countdown; `for i in 1 2 3 4 5; do [ $i -eq 3 ] && break; echo $i; done` → `1`,`2`; `continue` skips; `break 2` leaves two loops; `while read l; do echo "got: $l"; done < journal.txt` prints each line prefixed; `printf 'a b\n' | { read x y; echo $y; }` → `b`; `read first rest <<< "alpha beta gamma"; echo $rest` → `beta gamma`; `read x` on a bare typed line → the "cannot wait for typing" message, status 1; `shift` inside a function with args `a b c` leaves `$# = 2`; `shift 5` with fewer args → status 1; `source` a file defining a function then calling it; `. file` same; `source nothing` → `bash: source: nothing: No such file or directory`; `unset V` removes the variable; `unset -f f` removes the function; `exit 3` inside a sourced/run script ends it with status 3 while on a typed line it prints the friendly message; `true; echo $?` → `0`, `false; echo $?` → `1`; `type [` and `which test` work; `echo -e "a\tb"` → `a<TAB>b`.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` (corpus allow-list gains `echo -e` lines and the `true`/`false`/`exit` lines with reasons). **Step 5: Commit.**

### Task 8: Scripts with arguments, sandbox and check context

**Files:**
- Modify: `shell-quest/engine/exec.js` (`runPath` → uses `SQ.runScript`; `ctxFor`), `shell-quest/engine/interp.js` (`SQ.runScript`, `SQ.sandbox`), `shell-quest/engine/cmds-basic.js` (`bash`/`sh` pass arguments)
- Test: `tests/shell/scripts.test.mjs`

**Interfaces:**
- Produces: `SQ.runScript(path: string, o: { args?: string[], stdin?: string, depth?: number, tty?: boolean, force?: boolean, record?: boolean }): { out: string, err: string[], code: number }`. `bash FILE ARGS...` and `./FILE ARGS...` pass `$0` (the path as typed), `$1`.. and stdin from a pipe or `<`; the script runs in its own variable scope (only exported variables are visible, as today); `S.exp` additions made by the script are restored when it ends; `exit n` sets the status; a shebang line is a comment; the exec-bit, directory and missing-file errors are unchanged; the old "run each line, ignore failures" behaviour is the same for plain scripts without compound syntax (corpus and `sys.test` stay green). `execLine(line, { stdin })` accepts an initial stdin string. `SQ.sandbox<T>(fn: () => T): T` deep-clones `S` (fs, cwd, oldpwd, vars, exp, fns, last) and `SQ.rt.log`, runs `fn`, restores everything (also when `fn` throws) and never touches `localStorage`. `ctxFor(line)` gains `out(): string` (stdout of the typed line, from `SQ.rt.lastOut`), `exists(p): boolean` (alias of `has`), `runScript(path, args?, stdin?): { out, err, code }` (sandboxed, depth 1, never logged), and `scriptPasses(m): { ok: boolean, failed?: { index: number, label: string, expected: string, got: string } }`. `scriptPasses` runs each `m.tests` case in a sandbox: it writes `case.files` (a map path to content) first, runs `m.file` with `case.args` and `case.stdin`, then compares stdout (exact after trimming one trailing newline) to `case.expectOut`, or tests a regex `case.expectMatch`, compares `case.expectCode` (default 0), and checks `case.expectFiles` (map path to exact content). If the script file is missing or not a regular file the result is `{ok:false, failed:{index:-1, label:'file', expected:m.file, got:'missing'}}`.

- [ ] **Step 1: Write failing tests** (`scripts.test.mjs`): a file with `echo "arg1=$1 all=$@ n=$#"` run as `bash s.sh a "b c"` → `arg1=a all=a b c n=2`; `./s.sh` after `chmod +x`; `$0` shows the typed name; a script calling `exit 4` → `echo $?` → `4` and later lines do not run; stdin: `echo Ada | bash s.sh` with `read n; echo "Hi $n"` → `Hi Ada`; `bash s.sh < file`; exported variables visible, plain ones not (existing `streams.test` cases stay); `export Y=1` inside a script does not leak into `env` afterwards; a script with `if`/`while`/functions spanning lines runs; a syntax error in line 9 prints once and runs nothing (line 1's `touch` did not happen); a script calling itself stops at the existing depth cap; `scriptPasses` passes a correct script and fails a wrong one with the first failing case reported; sandbox leaves the world byte-identical: compare `JSON.stringify(SQ.S)` before and after `scriptPasses` of a script that writes files, changes directory and sets variables; sandbox restores state when the script blows up (`for i in $(seq 1 100000)` step abort); `c.out()` equals the typed line's stdout; hidden tests with `files` seed and `expectFiles`.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`. **Step 5: Commit.**

### Task 9: Editor panel

**Files:**
- Create: `shell-quest/editor.js`
- Modify: `shell-quest/engine/cmds-basic.js` (replace the `nano/vim/vi/code` friendly messages with `nano`, `edit`, `vi`, `vim` commands), `shell-quest/engine/exec.js` (carry `ui` from `runCmd` results to the `execLine` result), `shell-quest/index.html` (panel markup, extra-keys buttons, script tag), `shell-quest/style.css`, `shell-quest/app.js` (open the panel, `runLine`), `shell-quest/ui.js` (`SQ.ui.openEditor/closeEditor`)
- Test: `tests/smoke.mjs`, `tests/shell/scripts.test.mjs` (command side)

**Interfaces:**
- Produces: `nano FILE`, `edit FILE`, `vi FILE`, `vim FILE` return `{ out:'', err:[], code:0, ui:{ edit: absPath, isNew: boolean } }`; errors: `nano: X: Is a directory`, `nano: cannot create 'a/b': No such file or directory` (parent missing), and over-long names are rejected by the same caps as other commands; no file is created until Save. `SQ.ui.openEditor(abs: string, text: string, opts?: { isNew: boolean })` shows `section#editor.panel` (inside `.termCol`, after `#term`, `hidden` by default) with `#edTitle` (file path, set with `textContent`), `#edText` (textarea, monospace, `spellcheck=false`, `wrap=off`), `#edArgs` (input) and `#edStdin` (textarea inside `<details>`), buttons `#edSave`, `#edRun` (Save & run), `#edTab` (inserts two spaces; needed on touch), `#edClose`. Ctrl/Cmd+S saves, Ctrl/Cmd+Enter saves and runs. `app.js`: `runLine(line, { echo: boolean, stdin?: string, feedback?: boolean })` is the old `run()` generalised; `SQ.editorSave(abs, text)` normalises `\r\n` and `\r` to `\n`, rejects more than 1,000,000 characters (`file too large for this practice shell`), writes through `writeFile` keeping an existing `exec` bit, prints `Saved <path>` as a `sys` line, then calls `checkMission('(saved <path>)')`. Run executes `bash <quoted path> <args>` with the stdin text through `runLine(..., {echo:true, stdin, feedback:true})`. Closing with unsaved changes needs a second click on `Close` (the button text changes to `Discard changes?`). Opening a second file while the first has unsaved changes is refused with a terminal tip until Save or Close. Extra keys bar gains `$ ; & ( ) { } [ ] = < \`` and a backslash button. New files start with `#!/bin/bash\n`. The mission panel's "Type it for me" for script missions (Task 10) calls `SQ.ui.openEditor` with the reference script.

- [ ] **Step 1: Write failing tests.** Engine (`scripts.test.mjs`): the `nano` command's results and error messages above; `nano` on an existing file reports `isNew:false`. Smoke (in `tests/smoke.mjs`): typing `nano hello.sh` opens `#editor` (visible, others unchanged) with the shebang; typing a script, clicking Save prints `Saved hello.sh` and the file exists in `localStorage` state; `bash hello.sh` runs it; Save & run with args `Ada` and stdin shows the output in the terminal; saving a CRLF paste normalises it; a 1,000,001-character paste is refused; a file name containing `<img src=x onerror=alert(1)>` (create with `touch '<img src=x onerror=alert(1)>'`) shows as text with no dialog; two-click Close; `nano nodir/x.sh` prints the error and opens nothing; at 390px width the editor has no horizontal page overflow and all five controls are visible; with `hasTouch`/`isMobile` the extra keys include `{`; the tab test (every `section[id^="tab-"]` rule) still passes because the editor is not a tab; golden unchanged.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** (panel styled with the existing theme variables, light and dark). **Step 4: Run** `npm test`; also take desktop and 390px screenshots of the open editor in both themes, read them, fix visible problems. **Step 5: Commit.**

### Task 10: Mission kinds and script-mission flow

**Files:**
- Modify: `shell-quest/app.js` (`checkMission`, "Type it for me"), `shell-quest/ui.js` (`renderMission`), `tests/shell/solvability.test.mjs`, `docs/tiers-guideline.md` (kinds section, finished in Task 13)
- Test: `tests/shell/advanced.test.mjs` (kind plumbing with two fake chapters injected through the harness)

**Interfaces:**
- Produces mission fields: `kind?: 'command'|'outcome'|'script'|'challenge'` (default `command`), for `script` and `challenge` with a file: `file: string` (path relative to HOME), `starter: string` (written by the chapter's `setup()` only if the file is absent), `tests: Case[]` (see Task 8), `answer: string` (the reference script text, may be multi-line), `wrong: string[]` (scripts that must fail, used by the solvability test). `check` is optional for `script`: when absent `checkMission` uses `ctx.scriptPasses(m).ok`; when present it wins (used by `challenge`). `checkMission(line, opts?)` prints, when `opts.feedback` is set and the mission is `script`/`challenge` and a case failed, one `err` line: `Test <n> (<label>) failed: expected "<expectOut>", got "<got>"` (truncated to 120 characters). For `script` and `challenge` missions the "Type it for me" button opens the editor on `m.file` pre-filled with `m.answer` (unsaved) instead of filling the input; the mission card shows `Challenge` as a small tag for `kind: 'challenge'` and the file path for script missions; the default hint for script missions says to use `nano <file>`. The solvability test: for `command`/`outcome` missions as today; for `script`/`challenge`: run `setup()`, write `answer` to `file`, assert `check`/`scriptPasses` passes; write `starter` and assert it does not pass; write each `wrong` script and assert it does not pass; assert every `tests` case has a `label`.

- [ ] **Step 1: Write failing tests:** with an injected chapter holding one script mission (`file:'scripts/hi.sh'`, tests `[{args:['Ada'],expectOut:'Hi Ada'},{args:[],expectOut:'Hi nobody'}]`, an `answer`, `starter`, `wrong`): the solvability test passes it; a smoke test completes it through the UI (click Type it for me, Save & run with `Ada`... checks complete once all cases pass), shows the failing-case line for a wrong script, and awards 20 XP once; replaying does not re-award; the `Challenge` tag renders.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`. **Step 5: Commit.**

### Task 11: Advanced content, chapters 12 and 13 (indexes 11 and 12)

**Files:**
- Create: `shell-quest/content/tier-advanced.js`
- Modify: `shell-quest/index.html`, `shell-quest/content/quickfire.js`, `shell-quest/content/guide.js`
- Test: `tests/shell/advanced.test.mjs` (extend)

**Interfaces:**
- Consumes: Tasks 3 to 10. Chapters pushed after Intermediate with `tier:'advanced'`, same schema as `tier-intermediate.js` (voice, `anat` chips, outcome-based checks accepting alternatives, `setup()` seeding with `ensureFile`/`ensureDir` and never clobbering learner files, goals saying when a mission needs an earlier one, jump-in-safe in a fresh world, per-line log reset: use fs state, `c.out()` and `SQ.rt.prevLast` for multi-line solutions). Lessons from Stage 1 that bind: for each mission add a test with at least one plausible wrong command that fails and one valid alternative that passes; explain text must be true of this engine; use `{exact:true}` for quick-fire questions where quoting matters.

World seeding: `~/scripts/` folder, `village/people.txt` (name,age rows), `~/numbers.txt` (one integer per line), `~/lib/strings.sh` is not seeded here (Task 12 owns it).

| # | Chapter / mission | `answer` | check |
|---|---|---|---|
| 12 | **Decisions** (badge Decider) | | |
| 12.1 | Test a file | `[ -f journal.txt ] && echo yes` | ran `[` with `-f`, output `yes` |
| 12.2 | One-line if | `if [ -d village ]; then echo found; fi` | ran `if`, output `found` |
| 12.3 | Else branch | `if [ -f nothing.txt ]; then echo yes; else echo no; fi` | output `no`, ran `if` |
| 12.4 | Compare numbers | `[ 5 -gt 3 ] && echo bigger` | `[` log entry with `-gt`, output `bigger` |
| 12.5 | Match a pattern | `case "$USER" in explorer) echo hello;; *) echo who;; esac` | ran `case`, output `hello` |
| 12.6 | Double brackets | `[[ "$USER" == exp* ]] && echo matches` | output `matches`, line contains `[[` |
| 12.7 | **Script: exists?** (`script`, `scripts/exists.sh`) | script printing `exists` or `missing` for `$1` | cases: `journal.txt` → `exists`; `ghost.txt` → `missing`; `village` (a directory) → `exists` |
| 13 | **Loops & numbers** (badge Looper) | | |
| 13.1 | Count up | `i=1; while [ $i -le 3 ]; do echo $i; i=$((i+1)); done` | output `1`,`2`,`3`, ran `while` |
| 13.2 | Do the math | `echo $((6*7))` | output `42`, line contains `$((` |
| 13.3 | Add them up | `sum=0; for n in 1 2 3 4; do sum=$((sum+n)); done; echo $sum` | output `10` |
| 13.4 | Count down | `n=3; until [ $n -eq 0 ]; do echo $n; n=$((n-1)); done` | output `3`,`2`,`1`, ran `until` |
| 13.5 | Stop early | `for i in 1 2 3 4 5; do [ $i -eq 3 ] && break; echo $i; done` | output `1`,`2`, line contains `break` |
| 13.6 | Read a file line by line | `while read line; do echo "got: $line"; done < journal.txt` | each journal line printed with prefix `got: ` (derive from the real file) |
| 13.7 | **Script: sum** (`script`, `scripts/sum.sh`) | script printing the sum of its arguments | cases: `1 2 3` → `6`; `10 20` → `30`; no arguments → `0` |

- [ ] **Step 1: Extend `advanced.test.mjs`:** chapter indexes 11 and 12, mission counts 7 and 7, `tier:'advanced'`, the solvability test covers them (command missions by `answer`, script missions by Task 10), negative and alternative tests per mission as listed above, jump-in-safe fresh-world test, `setup()` twice changes nothing, Intermediate chapters untouched.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** chapters, 6 quick-fire entries (tier `advanced`) and 6 guide entries per chapter (`ch: 11` and `ch: 12`), including guide entries for `[`, `test`, `[[`, `if`, `case`, `while`, `until`, `break`, `read`, `$(( ))`. **Step 4: Run** `npm test`. **Step 5: Commit.**

### Task 12: Advanced content, chapters 14 and 15 (indexes 13 and 14) with the capstone

**Files:**
- Modify: `shell-quest/content/tier-advanced.js`, `content/quickfire.js`, `content/guide.js`
- Test: `tests/shell/advanced.test.mjs` (extend)

World seeding: `lib/strings.sh` (defines `shout() { echo "$1" | tr a-z A-Z; }`), `logs/` files for 15.6, `docs/` with three `.txt` files and one `.md` for the capstone.

| # | Chapter / mission | `answer` | check |
|---|---|---|---|
| 14 | **Functions & arguments** (badge Function Maker) | | |
| 14.1 | Define and call | `greet() { echo "Hello, $1!"; }; greet Ada` | output `Hello, Ada!`, `S.fns.greet` exists |
| 14.2 | Count the arguments | `count() { echo $#; }; count a b c` | output `3` |
| 14.3 | All the arguments | `show() { for a in "$@"; do echo "- $a"; done; }; show x y` | output `- x`,`- y` |
| 14.4 | Return a status | `is_big() { [ $1 -gt 10 ]; }; is_big 20 && echo big` | output `big`, a function exists |
| 14.5 | Keep it local | `f() { local x=2; echo $x; }; x=1; f; echo $x` | output `2` then `1` |
| 14.6 | Default values | `echo ${NAME:-stranger}` | output `stranger`, line contains `:-` |
| 14.7 | **Script: greeter** (`script`, `scripts/greet.sh`) | script printing `Hello, NAME!` or, with no argument, `usage: greet.sh NAME` on stderr and exiting 1 | cases: `Ada` → `Hello, Ada!` code 0; no args → code 1 and stderr matches `usage`; `"Ada Lovelace"` → `Hello, Ada Lovelace!` |
| 15 | **Real scripts** (badge Scripter) | | |
| 15.1 | Read from a string | `read first rest <<< "alpha beta gamma"; echo $rest` | output `beta gamma` |
| 15.2 | Share a library | `source lib/strings.sh; shout hello` | output `HELLO` |
| 15.3 | **Script: exit codes** (`script`, `scripts/check.sh`) | script exiting 0 if `$1` is an existing file, else 1 with a message | cases: `journal.txt` → 0; `ghost` → 1 |
| 15.4 | **Script: ask a question** (`script`, `scripts/ask.sh`) | script reading a name from stdin and printing `Hello, NAME!` | cases: stdin `Ada` → `Hello, Ada!`; stdin `Grace` → `Hello, Grace!` |
| 15.5 | **Script: write a config** (`script`, `scripts/mkconf.sh`) | script using a here-document to write `app.conf` with `name=quest` and `mode=fast` | `expectFiles` `app.conf` equals those two lines; running twice leaves the same file |
| 15.6 | **Script: count lines** (`script`, `scripts/loglines.sh`) | script printing `NAME: N` for every `.log` file under `logs/` | seeded cases with `files` overrides: counts match the real line counts, sorted by name |
| 15.7 | **Capstone: backup script** (`challenge`, `scripts/backup.sh`) | script taking a directory, creating `backup/` if missing, copying every `.txt` file into it, printing `backed up N files`, exiting 1 with a usage message when the argument is missing or not a directory | cases: `docs` → `backed up 3 files`, `backup/` holds the three files with identical contents; empty directory → `backed up 0 files`; missing directory → code 1; a second run overwrites cleanly; file names with spaces are copied intact |

- [ ] **Step 1: Extend `advanced.test.mjs`** as in Task 11 for chapters 14 and 15, adding `wrong` scripts for every script mission (e.g. a greeter that ignores quotes, a backup that copies `.md` files, one that does not create `backup/`, one that always exits 0) and a check that all 28 Advanced missions exist: `sum of missions == 28`, `cumulativeXp('advanced')` equals `1230 + 28*20 + 4*25`, rank "Automator" present, Intermediate cumulative XP still 1230.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** chapters, 6 quick-fire and 6 guide entries per chapter (`ch: 13`, `ch: 14`) including `function`, `local`, `shift`, `source`, `exit`, `return`, here-docs, `nano`. **Step 4: Run** `npm test`. **Step 5: Commit.**

### Task 13: Integration, docs and playthrough

**Files:**
- Modify: `tests/smoke.mjs`, `tests/shell/tiers.test.mjs`, `tests/shell/intermediate.test.mjs`, `shell-quest/engine/cmds-basic.js` (`help` text), `shell-quest/ui.js` (end-of-course text, guide footer), `docs/tiers-guideline.md`, `docs/superpowers/specs/2026-10-19-shell-quest-tiers-design.md` (as-built note), `README.md`, `.github/workflows/ci.yml` (add `shell-quest/*.js` coverage if `editor.js` is not matched)

- [ ] **Step 1: Update tier-count assertions:** smoke tier-rail tests expect three `.tierhead`s (Beginner, Intermediate, Advanced) in the rail and the bundle test; guide filter lists include `Advanced`; quick-fire picker lists include `Advanced`; `tiers.test` expects 7 ranks and the Automator rank at the computed XP; `intermediate.test` no longer hard-codes 11 total chapters (assert by tier). Add a smoke test that importing a save with chapters 0 to 14 badged shows 3 headers all complete, `★` on each, and the top rank.
- [ ] **Step 2: Docs:** `docs/tiers-guideline.md` now describes `script` and `challenge` kinds as real (schema, `tests` cases, `wrong` scripts, sandbox, the editor, `c.out/c.exists/c.runScript/c.scriptPasses`), the per-line log reset lesson, and the parser layers (tokenizer, AST, interpreter); update `help`, the guide footer and the end-of-course text; add a Stage 2 as-built note to the spec (deviations, caps, what is still unsupported: arrays, `&`, `set -e`, `trap`, `getopts`, `awk`); README Tiers section and test counts.
- [ ] **Step 3: Playthrough:** serve the repo and use Playwright (`PW_CHROMIUM=/opt/pw-browsers/chromium`): complete all 28 Advanced missions through the UI (command missions with "Type it for me" + Enter; script missions through the editor), confirm 4 badges, `4/4 ★`, 3 tier headers complete and the rank text "Automator"; screenshots at 1280px and 390px in light and dark of: an Advanced chapter card, the editor with a script and a failing-test line, the rail with three tiers; fix visible problems.
- [ ] **Step 4: Old saves:** load a save captured from Stage 1 main (use `tests/fixtures/shell-progress-beginner-complete.json` plus a hand-built Intermediate-complete state): rank, XP, rail counts correct; Advanced shows 0/4.
- [ ] **Step 5: Run** `npm test`, `python3 tools/build.py --check`, `node --check` on every JS file, CI YAML valid; smoke three times in a row. **Step 6: Commit and open the stage-2 PR.**

---

## Self-review (against the spec)

- **Parser, AST, `if/elif/else`, `while/until`, `case`, functions, `[ ]`, `[[ ]]`, `test`, `$(( ))`:** Tasks 2 to 7. **`$1 $@ $#`, `shift`, `read`, `exit`, `return`, `source`, here-docs and here-strings:** Tasks 3, 4, 6, 7, 8. **Editor panel (`nano`/`edit`), save and run, touch-friendly:** Task 9. **Mission kinds `script` and `challenge`, hidden cases, `c.out/c.exists/c.runScript`:** Tasks 8 and 10. **Advanced tier, four chapters, capstone backup script:** Tasks 11 and 12. **Guideline, tests, playthrough:** Task 13. **Compatibility and the 52 beginner answers:** Task 1 and every task's `npm test`.
- **Out of this plan by design:** arrays, `&` background jobs, `set -e/-x`, `trap`, `getopts`, `awk`, process simulation (stage 3); interactive prompting (`read` takes stdin only, the editor's Run panel supplies stdin).
- **Consistency:** names used across tasks are `SQ.arith`, `SQ.parseProgram`, `SQ.runProgram`, `SQ.runScript`, `SQ.sandbox`, `SQ.snapshotShell`/`restoreShell`, `SQ.rt.frames`, `SQ.frame()`, `SQ.rt.lastOut`, `io.stdinBox`, `S.fns`, `ctx.out/exists/runScript/scriptPasses`, `m.kind/file/starter/tests/answer/wrong`, `SQ.ui.openEditor`, `SQ.editorSave`, `runLine`, as defined in Interfaces.
- **Known gap to confirm during Task 1:** the corpus fixture is the safety net for the interpreter swap; if it misses a behaviour the golden/engine tests do not pin, the final whole-branch review compares old and new engines on a fresh list, as in Stage 1.
