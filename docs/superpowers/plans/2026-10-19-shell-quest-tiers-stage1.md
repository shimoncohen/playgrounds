# Shell Quest Tiers, Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Shell Quest into engine, content and UI files; add the shared tier module (tier rail, per-tier XP and ranks, tier-aware quick-fire and field guide); add the stage-1 engine features; ship the Intermediate tier (4 chapters) and `docs/tiers-guideline.md`.

**Architecture:** Classic scripts share one global `SQ` namespace (`SQ.S` state, `SQ.rt` run-time log, `SQ.content`). The refactor is behaviour-preserving, guarded by a browser golden transcript captured before any code moves. Engine files have no DOM, so Node tests load them with `vm`. `shared/tiers.js` is a pure model plus a small DOM renderer.

**Tech Stack:** Vanilla JS (classic scripts), Playwright 1.64 and `node:test` (`npm test`), `tools/build.py` for the artifact bundle.

**Spec:** `docs/superpowers/specs/2026-10-19-shell-quest-tiers-design.md`. Stages 2 and 3 get their own plans after this one lands.

## Global Constraints

- localStorage key stays `shell-quest-v1`; `done` keys stay `"<chapter>.<mission>"`; existing chapters keep indexes 0 to 6; new chapters are appended (Intermediate = 7 to 10).
- Beginner behaviour and text do not change: mission XP 10, chapter badge +25, 52 missions (8/7/7/7/7/7/9).
- Mission XP by tier: 10 / 15 / 20 / 25. Tier badges are derived, award no XP, and nothing is locked.
- Ranks: Rookie 0, Apprentice 100, Navigator 250, Operator 420, **Pipe Fitter 600** (renamed from Shell Wizard); later ranks sit at each tier's cumulative end XP (Intermediate = "Script Smith").
- Unsupported syntax prints `this practice shell does not support <X> yet`. Output is capped (see Review Focus).
- Static site only. No new runtime dependencies. Every task ends with `npm test` and `python3 tools/build.py --check` green.
- Commits: author `Shimon Cohen <33935191+shimoncohen@users.noreply.github.com>`, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, no session links.

## Review Focus

1. `$(...)` nested, containing quotes, empty output, or unterminated: nests correctly; unterminated gives `bash: unexpected EOF while looking for matching ')'` (code 2) instead of hanging. Pinned in Task 10.
2. `sed` with `/` in the pattern (custom delimiter), `&` in the replacement, empty input. Pinned in Task 11.
3. `chmod 999`, `chmod u+x,go-w`, `chmod a=r` and permissions on directories. Pinned in Task 12.
4. Saved state from today's version (nodes with `exec` and no `mode`; a user at 600 to 695 XP): loads unchanged, rank shows Pipe Fitter. Pinned in Tasks 6 and 12.
5. Runaway output: `seq 1 1000000` errors instead of flooding; `xargs` with empty input runs once, `xargs -r` runs zero times; invocations capped at 1000. Pinned in Task 11.

---

## File Structure

```
shared/tiers.js, tiers.css          Tiers.create(cfg) pure model + Tiers.renderRail(...)
shell-quest/engine/fs.js            SQ.S, SQ.rt, world, paths, node helpers
shell-quest/engine/parse.js         tokenize, parse, glob, expansion
shell-quest/engine/cmds-basic.js    today's CMDS table
shell-quest/engine/cmds-text.js     (Task 11) tee cut tr sed xargs diff printf seq basename dirname
shell-quest/engine/cmds-sys.js      (Task 12) stat ln which type; chmod/ls -l modes
shell-quest/engine/exec.js          runCmd, execLine, SQ.ctxFor
shell-quest/content/tier-beginner.js, tier-intermediate.js, tiers.js (tier declarations), guide.js, quickfire.js
shell-quest/ui.js                   rendering (prompt, crumbs, map, rail, mission, XP, guide, quick-fire)
shell-quest/app.js                  state load/save, run(), checkMission, events, boot
tests/shell-golden.mjs + tests/fixtures/{shell-beginner-golden.json,shell-progress-beginner-complete.json}
tests/shell/harness.mjs, tests/shell/*.test.mjs     Node engine, tiers and solvability tests
docs/tiers-guideline.md
```

Script order in `shell-quest/index.html` (single source of truth, also read by `tests/shell/harness.mjs`): `../shared/progress.js`, `../shared/tiers.js`, `engine/fs.js`, `engine/parse.js`, `engine/cmds-basic.js`, `engine/cmds-text.js`, `engine/cmds-sys.js`, `engine/exec.js`, `content/tiers.js`, `content/tier-beginner.js`, `content/tier-intermediate.js`, `content/guide.js`, `content/quickfire.js`, `ui.js`, `app.js`. Every file opens with `(function (SQ) { ... })(window.SQ = window.SQ || {});`.

---

### Task 1: Golden transcript of today's Shell Quest

**Files:**
- Create: `tests/shell-golden.mjs`, `tests/fixtures/shell-beginner-golden.json`, `tests/fixtures/shell-progress-beginner-complete.json`
- Modify: `package.json` (`"test"` runs both `tests/smoke.mjs` and `tests/shell-golden.mjs`)

**Interfaces:**
- Produces: the fixtures and a test that every later task must keep green. `UPDATE_GOLDEN=1 node tests/shell-golden.mjs` rewrites the fixtures; this plan only does that in this task.

- [ ] **Step 1: Write `tests/shell-golden.mjs`.** For each chapter (`.chap[data-ch=i]` in the rail) loop: while the mission card shows a "Type it for me" button, click it, press Enter in `#cmd`, and record `{chapter, mission, typed, output, xpText}` where `output` is the text of the lines the command added to `#screen`. Compare the array to the fixture with `assert.deepEqual`. After the last chapter, click Progress → Export and save the file to the progress fixture path (under `UPDATE_GOLDEN`).
- [ ] **Step 2: Run on unmodified code with `UPDATE_GOLDEN=1`.** Expected: fixtures written, 52 records, the progress fixture has `xp: 695` and 7 badges.
- [ ] **Step 3: Run without the flag.** Run: `PW_CHROMIUM=... node tests/shell-golden.mjs`. Expected: PASS, twice in a row (proves it is deterministic).
- [ ] **Step 4: Commit** (`Add golden transcript test for Shell Quest`).

### Task 2: Extract the engine

**Files:**
- Create: `shell-quest/engine/{fs,parse,cmds-basic,exec}.js`
- Modify: `shell-quest/app.js` (remove moved code), `shell-quest/index.html` (script tags)

**Interfaces:**
- Produces: `SQ.HOME`; `SQ.S` (state object whose identity never changes); `SQ.fresh(): State`; `SQ.resetState(next: State): void` (clears `SQ.S` then `Object.assign`); `SQ.rt = { log: Entry[], changed: Set<string> }` (always access as `SQ.rt.log` / `SQ.rt.changed`, never cache); `SQ.makeWorld()`; `SQ.execLine(line: string, opts?: object): { out: {text,cls,clear?}[], code: number }`; `SQ.ctxFor(line: string): Ctx`; node helpers `norm, getNode, parentOf, bname, disp, join, ensureDir, ensureFile, mkdirp`. Names are unchanged from today.

- [ ] **Step 1: Move code** from `app.js` to the four files without renaming: `fs.js` takes lines 3 to 71 (constants, world, state, filesystem helpers); `parse.js` takes `M … tokenize … parse … globRe, globExpand, flags`; `cmds-basic.js` takes `CMDS`, `FRIENDLY`, `lev`, `suggest`, `headTail`, `copyMove`; `exec.js` takes `runPath, runCmd, execLine` and `ctxFor` from the UI section. Replace the reassigned variables: `S=...` becomes `SQ.resetState(...)` (three places: load, reset world, reset progress), `LOG=[]` and `changed=new Set()` become `SQ.rt.log=[]` / `SQ.rt.changed=new Set()`.
- [ ] **Step 2: Update `app.js`** to use `SQ.*` for everything it consumed (`S`, `CH` stays local until Task 3). Add the engine script tags in the order above.
- [ ] **Step 3: Verify.** Run: `npm test`. Expected: golden and smoke tests PASS unchanged.
- [ ] **Step 4: Commit.**

### Task 3: Extract the content

**Files:**
- Create: `shell-quest/content/tier-beginner.js`, `content/guide.js`, `content/quickfire.js`
- Modify: `shell-quest/app.js`, `shell-quest/index.html`

**Interfaces:**
- Produces: `SQ.content = { chapters: Chapter[], guide: GuideEntry[], quickfire: [string, string[]][] }`. `tier-beginner.js` does `SQ.content.chapters.push(...)` of today's 7 chapters, verbatim; later tiers push after it.

- [ ] **Step 1:** Move `CH`, `GUIDE`, `QF` into the three files as pure data (no logic), creating `SQ.content` if absent. Point `app.js` at `SQ.content.*` (`CH` becomes `SQ.content.chapters`).
- [ ] **Step 2: Verify:** `npm test` PASS (golden unchanged).
- [ ] **Step 3: Commit.**

### Task 4: Extract the UI

**Files:**
- Create: `shell-quest/ui.js`
- Modify: `shell-quest/app.js` (now only wiring), `tools/build.py` (no logic change expected), `shell-quest/index.html`

**Interfaces:**
- Produces: `SQ.ui = { renderAll(), renderPrompt(), renderCrumbs(), renderMap(), renderChapters(), renderMission(), renderXP(), renderGuide(), addLine(html, cls), scrollDown(), fill(v) }`. `app.js` keeps: state load/save, `run`, `checkMission`, `goChapter`, tab handling, quick-fire logic, tab completion, boot.

- [ ] **Step 1: Move** every `render*`, `addLine`, `anatomy`, `promptHTML`, `renderText`, `esc` and the icon constants from `app.js` into `ui.js` under `SQ.ui`; update call sites.
- [ ] **Step 2: Verify:** `npm test` PASS; `python3 tools/build.py shell` then open `dist/shell-quest.html` in the browser harness (Task 15 adds a permanent test for this) and confirm the page loads with no errors.
- [ ] **Step 3: Commit.**

### Task 5: Node harness, engine tests and beginner solvability

**Files:**
- Create: `tests/shell/harness.mjs`, `tests/shell/engine.test.mjs`, `tests/shell/solvability.test.mjs`
- Modify: `package.json` (`"test:engine": "node --test tests/shell/"`; `"test"` also runs it first)

**Interfaces:**
- Produces: `loadShell(): SQ` (fresh `vm` context; reads `shell-quest/index.html`, loads, in order, every `<script src>` under `engine/`, `content/` and `../shared/tiers.js`, with `window` aliased to the context); `run(SQ, line): { out: string, code: number }` (resets `SQ.rt`, calls `execLine` with its default `tty:true`, joins `out[].text` and removes the `\x01<c>…\x02` colour markers, so a directory prints as `name/`).

- [ ] **Step 1: Write failing tests.** `engine.test.mjs`: `it('pwd prints the home path')` → `run(SQ,'pwd').out === '/home/explorer'`; `it('cd then pwd')`; `it('echo to a file then cat')` (`echo hi > a.txt` then `cat a.txt` → `hi`); `it('grep -i with pipe')` (`cat journal.txt | grep -i wolf | wc -l` equals `3`); `it('unknown command suggests a fix')` (`lss` → output contains `Did you mean: ls?`). `solvability.test.mjs`: for each chapter in `SQ.content.chapters`, in a fresh `SQ`: run `setup()`, then for each mission in order run `mission.answer`, and `assert.ok(mission.check(SQ.ctxFor(answer)))` with the mission title in the message.
- [ ] **Step 2: Run** `npm run test:engine`. Expected: FAIL (harness missing).
- [ ] **Step 3: Implement `harness.mjs`** as specified above.
- [ ] **Step 4: Run.** Expected: PASS, including all 52 beginner answers.
- [ ] **Step 5: Commit.**

### Task 6: Tier model, XP and ranks

**Files:**
- Create: `shared/tiers.js`, `shell-quest/content/tiers.js`, `tests/shell/tiers.test.mjs`
- Modify: `shell-quest/app.js` (`checkMission` XP and message), `shell-quest/ui.js` (`renderXP`), `shell-quest/index.html`

**Interfaces:**
- Produces `Tiers.create(cfg)` where `cfg = { tiers: {id,name,blurb,missionXp}[], chapters: {tier:string, missions:unknown[]}[], baseRanks: [number,string][], tierEndRanks: Record<string,string> }`, returning:
  `tierOf(ch: number): Tier`; `missionXp(ch: number): number`; `chapterBadgeXp: 25`;
  `status(S): { tier: Tier, chapters: number[], chaptersDone: number, missionsDone: number, missionsTotal: number, complete: boolean }[]`;
  `ranks(): [number, string][]`; `rankFor(xp: number): { name: string, index: number, lo: number, hi: number }`;
  `cumulativeXp(tierId: string): number`.
- `content/tiers.js` sets `SQ.tiers = Tiers.create({...})` with the four tiers (blurbs from the spec), `baseRanks` `[[0,'Rookie'],[100,'Apprentice'],[250,'Navigator'],[420,'Operator'],[600,'Pipe Fitter']]`, `tierEndRanks` `{ intermediate:'Script Smith', advanced:'Automator', expert:'Shell Wizard' }` (only for tiers that have chapters).

- [ ] **Step 1: Write failing tests** in `tiers.test.mjs`: `it('beginner chapters give 10 XP per mission')` (`SQ.tiers.missionXp(0) === 10`); `it('keeps the old rank thresholds')` (`ranks().slice(0,5).map(r=>r[0])` equals `[0,100,250,420,600]`); `it('renames the 600 XP rank')` (`rankFor(650).name === 'Pipe Fitter'`); `it('beginner cumulative XP is 695')`; `it('status counts a tier complete when every chapter has a badge')` using a hand-built state; `it('a tier without chapters adds no rank')`.
- [ ] **Step 2: Run**; expected FAIL.
- [ ] **Step 3: Implement** `shared/tiers.js` (pure; no DOM in `create`) and `content/tiers.js`; tag every beginner chapter `tier:'beginner'`; make `checkMission` award `SQ.tiers.missionXp(S.ch)` and print it in the message; make `renderXP` use `rankFor`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, golden unchanged (beginner XP and messages identical).
- [ ] **Step 5: Compatibility test** in `tests/smoke.mjs`: import `tests/fixtures/shell-progress-beginner-complete.json` through the Progress control; assert `#xpText` shows `695 XP` and `#rank` shows `Pipe Fitter`.
- [ ] **Step 6: Commit.**

### Task 7: Tier rail and tier badge

**Files:**
- Create: `shared/tiers.css`
- Modify: `shared/tiers.js` (`Tiers.renderRail`), `shell-quest/ui.js` (`renderChapters`), `shell-quest/index.html` (link the css), `shell-quest/style.css` (only if a rule is missing)

**Interfaces:**
- Consumes: `SQ.tiers.status(S)`. Produces `Tiers.renderRail(container: HTMLElement, o: { status, chapters, S, onPick(i:number) }): void`, drawing a header per tier (name, `x/y chapters`, a ★ badge when `complete`) above its chapter buttons. Chapter buttons keep today's classes and `data-ch` so the golden test and `goChapter` still work. Tier headers are `div.tierhead` with `data-tier`.

- [ ] **Step 1: Write the failing Playwright test** (smoke): the rail shows 2 `.tierhead` elements; the first reads `Beginner` and `0/7`; after importing the beginner fixture it reads `7/7` and contains `★`; clicking a chapter under Intermediate switches the mission card.
- [ ] **Step 2: Run**; expected FAIL.
- [ ] **Step 3: Implement** `renderRail` and call it from `renderChapters`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS (golden still green: chapter buttons unchanged).
- [ ] **Step 5: Commit.**

### Task 8: Field guide by tier, explicit extras group

**Files:**
- Modify: `shell-quest/content/guide.js`, `shell-quest/ui.js` (`renderGuide`), `tests/smoke.mjs`

**Interfaces:**
- Produces: guide entries use `ch: number | 'extras'` (the four `ch:7` entries become `'extras'`); `renderGuide` groups by chapter, then extras, under tier headings (`h3[data-tier]`), plus a filter row (`All` and one button per tier that has chapters).

- [ ] **Step 1: Write the failing smoke test:** the Field guide tab shows tier headings and the `help` entry sits in the "Handy extras" group; clicking the `Intermediate` filter hides Beginner entries.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`; PASS. **Step 5: Commit.**

### Task 9: Quick-fire tier picker

**Files:**
- Modify: `shell-quest/content/quickfire.js` (third tuple element `tier`, default `'beginner'`), `shell-quest/app.js`, `shell-quest/index.html` (`<select id="fTier">`), `tests/smoke.mjs`

**Interfaces:**
- Produces: `SQ.content.quickfire: [prompt: string, answers: string[], tier?: string][]`. `startFire` filters by `#fTier` (`mixed` default, otherwise a tier id); the select lists `Mixed` and each tier that has questions.

- [ ] **Step 1: Write the failing smoke test:** with `Intermediate` selected (after Task 13 adds its questions; until then assert the select contains `Mixed` and `Beginner`), every question shown during a 3-question run belongs to the chosen tier's pool (pool read via `page.evaluate(() => SQ.content.quickfire)`).
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4: Run** `npm test`; PASS. **Step 5: Commit.**

### Task 10: Engine, substitution and streams

**Files:**
- Modify: `shell-quest/engine/parse.js`, `engine/exec.js`, `engine/cmds-basic.js` (add `export`, `env`)
- Test: `tests/shell/streams.test.mjs`

**Interfaces:**
- Produces: `$(cmd)` expansion (nests; output trailing newlines stripped; unquoted results split on whitespace; literal inside single quotes); `export NAME[=value]` (state key `S.exp: Record<string,1>`, default `{}`); `env` lists exported plus defaults `HOME USER SHELL HOSTNAME PATH PWD` sorted; scripts run by `bash`/`./` see only exported variables; redirects `2>file`, `2>>file`, `2>/dev/null`, `2>&1` (stderr merged into stdout at that point); `/dev/null` discards writes and reads empty.

- [ ] **Step 1: Write failing tests** (`run` from Task 5): `echo "today: $(echo hi)"` → `today: hi`; nested `echo $(echo $(echo deep))` → `deep`; `echo '$(echo no)'` → `$(echo no)`; `X=$(echo a b); echo $X` → `a b`; unterminated `echo $(echo` → output `bash: unexpected EOF while looking for matching ')'`, code 2; `ls missing 2> err.txt` leaves stdout empty and `cat err.txt` contains `No such file or directory`; `ls missing 2>/dev/null` prints nothing; `ls missing 2>&1 | wc -l` → `1`; `cat nothing > /dev/null` prints nothing; `export Z=1` then `env` contains `Z=1` and an unexported `Y=2` is absent; a script that echoes `$Z` prints `1` after `export Z=1`.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** in the tokenizer (`$(` scanning with depth counting) and executor (stderr routing per command; `err` entries with `cls:'err'` go to the redirect target). **Step 4: Run** `npm test`; PASS including golden. **Step 5: Commit.**

### Task 11: Engine, text tools

**Files:**
- Create: `shell-quest/engine/cmds-text.js`, `tests/shell/text.test.mjs`
- Modify: `shell-quest/index.html`

**Interfaces:**
- Produces commands on the `SQ.CMDS` table with today's `(args, io) => {out, err, code}` shape: `tee [-a] file…`; `cut -d<char> -f<list>` and `-c<list>` (lists `N`, `N,M`, `N-M`); `tr [-d|-s] SET1 [SET2]` (ranges, `[:upper:] [:lower:] [:digit:]`); `sed` with `s/re/repl/[g]` (any delimiter, `&` in replacement), `Nd`, `/re/d`, and `-n` with `Np`, `N,Mp`, `/re/p` (patterns are JavaScript regular expressions; `-E` is accepted and changes nothing); `xargs [-n N] [-I{}] [-r] cmd…`; `diff A B` (normal format, `-q`, exit 1 when different); `printf FORMAT args…` (`%s %d %5s %-5s %%`, `\n \t`, format reused for extra args); `seq [FIRST [INCR]] LAST`; `basename path [suffix]`; `dirname path`.

- [ ] **Step 1: Write failing tests:** `echo hi | tee a.txt` prints `hi` and `cat a.txt` is `hi`; `echo a,b,c | cut -d, -f2` → `b`; `echo hello | cut -c2-4` → `ell`; `echo hello | tr a-z A-Z` → `HELLO`; `echo "a  b" | tr -s ' '` → `a b`; `echo hi | sed 's/h/H/'` → `Hi`; `echo a/b | sed 's|/|-|'` → `a-b`; `echo cat | sed 's/cat/[&]/'` → `[cat]`; `printf '' | sed 's/a/b/'` → empty output; `cat journal.txt | sed -n '2,3p' | wc -l` → `2`; `seq 3` → `1\n2\n3`; `seq 1 1000000` → `seq: too many numbers for this practice shell`; `echo a b | xargs echo x` → `x a b`; `printf '' | xargs echo x` → `x`; `printf '' | xargs -r echo x` → empty; `printf '1\n2\n' | xargs -n1 echo n` → `n 1\nn 2`; `printf "%s-%d\n" a 1` → `a-1`; `basename /a/b.txt .txt` → `b`; `dirname /a/b.txt` → `/a`; `diff` of two differing files returns code 1 with `<`/`>` lines and equal files return code 0 with no output.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** the commands. **Step 4: Run**; PASS. **Step 5: Commit.**

### Task 12: Engine, permissions, links, stat, which

**Files:**
- Create: `shell-quest/engine/cmds-sys.js`, `tests/shell/sys.test.mjs`
- Modify: `shell-quest/engine/cmds-basic.js` (`ls -l`, `chmod`, `rm` on links), `engine/fs.js` (`getNode` follows links; add `lstat`)

**Interfaces:**
- Produces: node field `mode?: number` (default 0o755 for dirs and `exec` files, 0o644 otherwise; `exec` stays in sync as owner-x); `modeString(node): string` such as `-rw-r--r--`; `ls -l` lines use it and show `name -> target` for links; `chmod` accepts 3-digit octal (digits 0 to 7, else `chmod: invalid mode: '999'`) and symbolic `[ugoa]*[+-=][rwx]*` with comma lists; `ln -s target link` creates `{type:'link', target}`; plain `ln` errors with `this practice shell only supports ln -s`; `stat file` prints `File:`, `Size:`, `Mode: (0644/-rw-r--r--)` lines; `which cmd` prints `/usr/bin/<cmd>` for known commands (code 1 and no output otherwise); `type cmd` prints `<cmd> is /usr/bin/<cmd>` or `<cmd> is a shell builtin` for `cd export source`, else `bash: type: <cmd>: not found` (code 1).

- [ ] **Step 1: Write failing tests:** `touch f; chmod 600 f; ls -l f` starts with `-rw-------`; `chmod u+x,go-w f; ls -l f` shows `-rwx------`; `chmod a=r f` shows `-r--r--r--`; `chmod 999 f` → `chmod: invalid mode: '999'`; after `mkdir d`, `ls -l` has a line starting `drwxr-xr-x` that ends with `d/`; `ln -s readme.txt r; cat r` prints the readme; `ls -l` shows `r -> readme.txt`; `rm r` removes the link and keeps `readme.txt`; `stat readme.txt` contains `Mode: (0644/-rw-r--r--)`; `which ls` → `/usr/bin/ls`; `type cd` → `cd is a shell builtin`; a node loaded from the saved fixture without `mode` lists as before (`-rw-r--r--`).
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` (golden must stay green: beginner `chmod +x` and `./script` still work). **Step 5: Commit.**

### Task 13: Intermediate content, chapters 8 and 9

**Files:**
- Create: `shell-quest/content/tier-intermediate.js`
- Modify: `shell-quest/content/quickfire.js`, `content/guide.js`, `shell-quest/index.html`

**Interfaces:**
- Consumes: Tasks 10 to 12 commands, Task 3 content shape, `SQ.ensureFile` for seeding. Produces: chapters pushed to `SQ.content.chapters` with `tier:'intermediate'`, same schema as beginner (`name, badge, intro, setup, missions[{title, goal, anat, answer, explain, check}]`), prose written in the beginner style (short, plain, second person). Missions are `command` kind unless the table says otherwise.

World seeding (all in `setup`): `village/sales.csv` (name,qty,price rows), `village/logs/access.log` (12 lines, mixed 200/404/500, repeated IPs), `~/config.ini`, `~/notes.txt` with mixed case.

| # | Chapter / mission | `answer` | `check` |
|---|---|---|---|
| 8 | **Text tools** (badge Textsmith) | | |
| 8.1 | Pick a column | `cut -d, -f1 village/sales.csv` | ran `cut` with `-f1` |
| 8.2 | Shout it | `echo hello | tr a-z A-Z` | output is `HELLO` |
| 8.3 | Swap a word | `sed 's/apple/pear/' village/shop.txt` | output has `pear` and no `apple` |
| 8.4 | Replace everywhere | `sed 's/o/0/g' journal.txt` | ran `sed` with a `g` script |
| 8.5 | Show some lines | `sed -n '2,4p' journal.txt` | output is 3 lines |
| 8.6 | Save and show | `ls | tee listing.txt` | `listing.txt` exists |
| 8.7 | Biggest first | `sort -t, -k2 -n -r village/sales.csv | head -n 1` | output starts with the top row |
| 9 | **Substitution & quoting** (badge Quoter) | | |
| 9.1 | Capture output | `echo "Today is $(date)"` | output starts with `Today is` |
| 9.2 | Count in a sentence | `echo "wolves: $(grep -ic wolf journal.txt)"` | output matches `wolves: \d+` |
| 9.3 | Single vs double | `echo '$HOME'` | output is `$HOME` |
| 9.4 | Keep a value | `FILES=$(ls village); echo $FILES` | output lists village contents |
| 9.5 | Export it | `export GREETING=hi` | `GREETING` in `S.exp` |
| 9.6 | See the environment | `env` | output contains `GREETING=hi` |
| 9.7 | Share with a script | `echo 'echo $GREETING' > g.sh; chmod +x g.sh; ./g.sh` | output is `hi` |
| 9.8 | Did it work? | `ls nothing; echo $?` | output ends with `2` |

- [ ] **Step 1: Extend the solvability test (Task 5)** so it already covers `tier-intermediate.js` (it iterates `SQ.content.chapters`; nothing to change except the harness loading the new file). Run `npm run test:engine`; expected FAIL (chapters missing).
- [ ] **Step 2: Implement the two chapters** per the table: seed files, `anat` chips, `explain` text, `check` functions (outcome checks via `ctx.read/has/log`). Add 6 quick-fire entries and 6 guide entries per chapter (`tier:'intermediate'`).
- [ ] **Step 3: Run** `npm test`. Expected: PASS (solvability covers 15 new missions, quick-fire test from Task 9 now asserts the Intermediate pool is non-empty).
- [ ] **Step 4: Playthrough:** run the stage-2-style screenshot pass (Task 15, Step 3) for these chapters; fix wording or checks found.
- [ ] **Step 5: Commit.**

### Task 14: Intermediate content, chapters 10 and 11 (with capstone)

**Files:**
- Modify: `shell-quest/content/tier-intermediate.js`, `content/quickfire.js`, `content/guide.js`

World seeding: `village/logs/*.log` extended with ERROR lines, `~/scripts/` empty folder, `~/secrets.txt` (mode 0644).

| # | Chapter / mission | `answer` | `check` |
|---|---|---|---|
| 10 | **Permissions & links** (badge Gatekeeper) | | |
| 10.1 | Read the permissions | `ls -l` | ran `ls` with `-l` |
| 10.2 | Lock it down | `chmod 600 secrets.txt` | mode is 0o600 |
| 10.3 | Add a permission | `chmod u+x notes.txt` | owner-x set |
| 10.4 | Read-only for all | `chmod a=r notes.txt` | mode is 0o444 |
| 10.5 | Make a shortcut | `ln -s village/logs/day1.log today.log` | `today.log` is a link to that path |
| 10.6 | Follow the shortcut | `cat today.log` | output equals day1.log |
| 10.7 | Inspect a file | `stat secrets.txt` | ran `stat` |
| 11 | **Streams & xargs** (badge Streamer) | | |
| 11.1 | Silence errors | `ls missing 2>/dev/null` | ran with `2>/dev/null`; output empty |
| 11.2 | Keep errors | `ls missing 2> errors.txt` | `errors.txt` non-empty |
| 11.3 | Merge streams | `ls missing 2>&1 | wc -l` | output is `1` |
| 11.4 | Pipe into arguments | `ls village/logs | xargs -n1 echo file:` | output has one `file:` line per log |
| 11.5 | Delete what you found | `find village/logs -name "*.log" | xargs rm` | no `.log` left |
| 11.6 | Compare two files | `diff village/logs/day1.log village/logs/day2.log` | ran `diff` |
| 11.7 | **Capstone: log janitor** (`outcome`) | `grep ERROR village/logs/all.log 2>/dev/null | cut -d' ' -f1 | sort | uniq -c > report.txt` | `report.txt` has the expected counts for the seeded logs (hidden expectation in `check`) |

- [ ] **Step 1: Run** `npm run test:engine`; expected FAIL (chapters missing).
- [ ] **Step 2: Implement both chapters** as in Task 13 (11.7's world seeding creates `village/logs/all.log`). Add the tier completion test to smoke: after importing a progress file with chapters 7 to 10 badged, the Intermediate tier header shows `4/4` and `★`.
- [ ] **Step 3: Run** `npm test`; PASS. **Step 4: Playthrough** and screenshot pass for these chapters. **Step 5: Commit.**

### Task 15: Guideline, CI and bundle test

**Files:**
- Create: `docs/tiers-guideline.md`
- Modify: `.github/workflows/ci.yml`, `package.json`, `tests/smoke.mjs`, `README.md`, `tools/build.py` (only if the bundle check needs the new script order)

**Interfaces:**
- Produces: guideline sections (tier model and open policy; declaring tiers and tagging chapters; mission kinds and the check context; keeping saved progress compatible: append, never reorder; ranks from cumulative XP; solvability test pattern; adoption checklist for another playground).

- [ ] **Step 1: Write the failing bundle test** in `tests/smoke.mjs`: run `python3 tools/build.py shell` (via `execFileSync`), serve `dist/shell-quest.html`, assert the page loads with no errors, the rail has two tier headers, and clicking through to Intermediate chapter 8 works.
- [ ] **Step 2: Run**; expected FAIL if script order or inlining is wrong. **Step 3: Fix** whatever it reveals.
- [ ] **Step 4: Write the guideline** and link it from the README.
- [ ] **Step 5: CI:** add `npm run test:engine` as a step before the browser tests in `ci.yml`.
- [ ] **Step 6: Playthrough:** serve the repo, run through each Intermediate chapter with Playwright screenshots (desktop and 390 px), read them, and fix visible problems.
- [ ] **Step 7: Run** `npm test` and `python3 tools/build.py --check`; PASS. **Step 8: Commit and open the stage-1 PR.**

---

## Self-review (against the spec)

- **File split and `SQ` namespace:** Tasks 2 to 4. **Tier model, open tiers, derived badges, ranks:** Tasks 6 and 7. **Guide and quick-fire by tier:** Tasks 8 and 9. **Stage-1 engine list:** Tasks 10 to 12. **Intermediate content and capstone:** Tasks 13 and 14. **Guideline, CI, bundle:** Task 15. **Compatibility fixture:** Tasks 1 and 6. **Solvability test:** Task 5, extended by 13 and 14.
- **Out of this plan by design:** parser rewrite, editor, script missions (stage 2); `awk`, processes (stage 3).
- **Consistency:** names used across tasks are `SQ.S`, `SQ.rt`, `SQ.execLine`, `SQ.ctxFor`, `SQ.content.{chapters,guide,quickfire}`, `SQ.tiers`, `Tiers.create`, `Tiers.renderRail`, `run(SQ, line)`, as defined in Interfaces.
- **Known gap to confirm during Task 2:** the exact line ranges listed are from today's `app.js`; if they have shifted, move by function name.
