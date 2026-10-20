# 🕹️ Playgrounds

**Learn to code by actually doing it. Right in your browser. No install, no account, nothing to break.**

Each playground is a guided *quest*: a story-flavoured path of bite-sized missions, a live console that runs your code for real, quick-fire rounds to keep you sharp, and a field guide for when you get stuck. You earn XP, collect chapter badges and climb a rank ladder from *Rookie* to *Wizard*.

👉 **[Play it now: shimoncohen.github.io/playgrounds](https://shimoncohen.github.io/playgrounds/)**

| | Playground | You will learn | Folder |
|---|---|---|---|
| 📜 | **Script Quest** | JavaScript, TypeScript and Node, in a real console | [`script-quest/`](script-quest/) |
| 🐍 | **Python Quest** | Python, with a memory map and step-by-step replay | [`python-quest/`](python-quest/) |
| ⚙️ | **C++ Quest** | From Hello, World to pointers, with memory boxes | [`cpp-quest/`](cpp-quest/) |
| 🐚 | **Shell Quest** | Bash: files, pipes, scripts, `awk`, `sed`, jobs. A pretend computer, so nothing you type can hurt | [`shell-quest/`](shell-quest/) |
| ⚓ | **Harbor Quest** | Docker, Compose and Kubernetes | [`harbor-quest/`](harbor-quest/) |
| 🌳 | **Data Structures Quest** | Arrays, stacks, queues, linked lists, maps and trees in JavaScript, drawn as you run them | [`ds-quest/`](ds-quest/) |

Prefer your own machine? Every playground is a static page. Open `index.html` (the landing page) or `<name>-quest/index.html` in a browser. There is no build step, no server and no database.

## 🧭 How a quest works

- **Missions.** One small goal at a time. Type the answer, read why it worked, move on. Stuck? Ask for a hint, or let it *type it for you* and learn from the explanation.
- **Chapters and badges.** Missions group into chapters, and each finished chapter earns a badge (and bonus XP).
- **Quick-fire.** Short timed rounds that turn what you learned into reflexes.
- **Field guide.** A cheat sheet that grows with you.
- **Ranks.** XP adds up to a rank. Every quest has its own ladder and its own top title.
- **Your progress is yours.** It lives in your browser, with export and import so you can back it up or move it between devices (see [Saving progress](#-saving-progress)).

### 🐚 Shell Quest: the deep end

The biggest quest, and the best one to show off. It has **four open tiers** (every chapter is unlocked, so you can jump in wherever you are) and **19 chapters with 137 missions**:

| Tier | What you do | Ends with the rank |
|---|---|---|
| **Beginner** | Find your way around, make, copy and move things, read files, pipes, wildcards, and your first script | Pipe Fitter |
| **Intermediate** | Text tools, substitution and quoting, permissions and links, streams and `xargs` | Script Smith |
| **Advanced** | Real scripts: decisions, loops and numbers, functions and arguments, input, here-documents and exit codes (written in an editor panel and tested against hidden cases) | Automator |
| **Expert** | `awk` and `sed` craft, processes and background jobs on a virtual clock, pipeline mastery (`find -exec`, `xargs`, process substitution), safe scripts (`set -euo pipefail`, `getopts`), and a capstone command-line tool | **Shell Wizard** 🧙 |

Type `help` in the shell for every command by tier. The practice shell is a documented subset of bash; what it leaves out is listed in the design's *Stage 2 as built* and *Stage 3 as built* sections.

## 🎒 Bring it to your team

These make good, low-stakes onboarding material: new hires learn by doing, at their own pace, with nothing to install.

- **Share a link.** Every playground has a stable URL. Send `https://shimoncohen.github.io/playgrounds/shell-quest/` and a new colleague is typing commands in seconds.
- **Pick a path.** Backend newcomers: Shell Quest, then Harbor Quest. Frontend newcomers: Script Quest. Data folks: Python Quest. Systems folks: C++ Quest.
- **Set a rank as the goal.** "Reach *Pipe Fitter* in your first week" is a friendly, measurable milestone. Progress exports to a small JSON file, so people can show where they are.
- **Pair on it.** The missions read well out loud. Take turns driving.
- **Challenge a friend.** Quick-fire rounds are made for "beat my score".

Want a quest on *your* stack, tools or internal conventions? [Open an issue](https://github.com/shimoncohen/playgrounds/issues/new/choose) or build it (below).

## 🤝 Contribute (humans and agents welcome)

This is an open-source project and pull requests are very welcome: new missions, new chapters, bug fixes, polish, or a whole new playground. **We build it agent-first**: the repo is set up so a coding agent such as Claude Code can pick up an issue, make the change, run the checks and open a clean PR, with a human steering. Humans working by hand are just as welcome and follow the same rules.

- 📖 **[CONTRIBUTING.md](CONTRIBUTING.md)**: the PR workflow, step by step.
- 🤖 **[AGENTS.md](AGENTS.md)**: the rules of the repo for coding agents (and for humans who like rules). `CLAUDE.md` points to it.
- 🧩 **[`.claude/skills/`](.claude/skills/)**: ready-made agent skills: `add-mission`, `new-playground`, `pre-pr-check`, `review-mission`, `playtest`, `mission-voice`, `triage-issue`.
- 📐 **[docs/tiers-guideline.md](docs/tiers-guideline.md)**: how to add tiers, write missions and checks that hold up, and keep old saves working.
- ⚙️ **[Repository settings](docs/repo-settings.md)** (branch protection, release token) for maintainers.
- 🤝 **[Code of Conduct](CODE_OF_CONDUCT.md)** and **[Security policy](SECURITY.md)**.
- 📝 **[Design: Shell Quest tiers](docs/superpowers/specs/2026-10-19-shell-quest-tiers-design.md)**: what was built and why.

The 60-second version:

```
git clone https://github.com/<you>/playgrounds && cd playgrounds
npm ci && npx playwright install chromium   # once
# ...make your change...
npm run check && npm test                    # must pass before you open a PR
# commits and PR titles use Conventional Commits: feat(shell): add a mission
```

## 💾 Saving progress

Each playground keeps its state in `localStorage` (one JSON string per playground, per origin). `shared/progress.js` adds a **Progress** button to the header so that clearing the browser's site data doesn't have to mean starting over:

- **Export / Import**: download progress as `<name>-quest-progress.json` and load it back. Works in every browser.
- **Auto-save file** (Chrome, Edge, Opera): link a file once and it is rewritten after every save. If site data is cleared, use "Open existing file" to restore, and the link is re-established. If the browser only asks for permission again, a red dot on the button says so.
- **Storage protection**: `navigator.storage.persist()` is requested once after the first save so the browser doesn't evict the data when disk is low. It doesn't survive a manual "clear site data".

Good to know: importing replaces current progress (with a confirmation); a file only restores automatically when the browser has no progress (zero XP); the local copy wins over the file otherwise, so don't edit one progress file from two devices at once; the JSON can be hand-edited, so it isn't tamper-proof. The auto-save file needs a secure context (HTTPS or localhost) and the full page, so it is hidden inside claude.ai artifacts, where Export/Import is the fallback.

To add it to a new playground: set `window.PROGRESS = {key, name}` (the `localStorage` key) and load `shared/progress.css` and `shared/progress.js` before `app.js`.

## 🛠️ Development

```
npm ci
npx playwright install chromium   # once
npm test                          # engine tests, browser smoke tests, golden transcript
npm run test:engine               # just the engine and content tests (Node only, no browser)
npm run test:browser              # just the browser tests
npm run check                     # does every folder still bundle for artifacts?
```

Node 24 or newer, and Python 3 for the bundler. Set `PW_CHROMIUM=/path/to/chromium` to use an existing browser.

### Map of the repo

```
index.html              landing page
shared/                 code every playground reuses: progress saving, tier model
script-quest/ python-quest/ cpp-quest/ harbor-quest/
                        index.html + style.css + app.js each
ds-quest/               like those, plus engine.js (runner), content.js (course), demos.js (guide explainers)
shell-quest/            split by job (below)
tests/                  engine tests (Node; shell/ and ds/), browser smoke + golden tests (Playwright)
tools/                  build.py (artifact bundler), publish_site.sh (gh-pages)
docs/                   guidelines, design specs, implementation plans
.github/                CI, Pages deploy, PR previews, issue and PR templates
.claude/skills/         agent skills for this repo
```

Shell Quest is plain scripts sharing one `SQ` namespace, loaded in order from `index.html`:

- `shell-quest/engine/`: the DOM-free engine. File system (`fs.js`), tokenizer and expansions (`parse.js`), arithmetic (`arith.js`), AST parser (`ast.js`), interpreter and scripts (`interp.js`), commands (`cmds-*.js`), `printf.js`, `sed.js`, `awk-parse.js` and `awk.js`, the virtual clock and process table (`procs.js`), background jobs (`jobs.js`), and `exec.js` (runs a line and builds the mission check context).
- `shell-quest/content/`: the course. `tiers.js` (tier setup), `tier-beginner.js`, `tier-intermediate.js`, `tier-advanced.js`, `tier-expert.js` (chapters and missions), `guide.js`, `quickfire.js`.
- `shell-quest/ui.js`, `editor.js`, `app.js`: rendering, the script editor panel, and event wiring.

### Tests, in one breath

`tests/shell/*.test.mjs` run the engine and content in Node, including **a solvability test for every mission** (each mission's reference `answer` must pass its own `check`) and two differential corpora that compare thousands of recorded outputs. `tests/shell-golden.mjs` replays every Beginner mission in a real browser against recorded fixtures. `tests/smoke.mjs` loads every playground, exercises progress export/import and the Shell Quest UI, and plays the whole course through. **Never regenerate golden or corpus fixtures to make a test pass**; the [guideline](docs/tiers-guideline.md) explains why and what to do instead.

### Publishing to claude.ai artifacts

The Artifact service wraps pages in its own skeleton, so it needs a single body-only file:

```
python3 tools/build.py            # all five -> dist/<name>-quest.html
python3 tools/build.py shell      # just one
python3 tools/build.py --check    # verify the folders bundle cleanly
```

Then, in a Claude session with the Artifact tool, ask Claude to publish `dist/<name>-quest.html` to the existing artifact URL (an in-place update, so the link stays the same). Artifact URLs aren't stored in this repo; keep them in a git-ignored `artifacts.json` (`{"shell-quest": "https://claude.ai/artifact/…"}`) if you like. `dist/` is git-ignored.

### CI and deployment

- `ci.yml` runs on every pull request: the bundle check, `node --check` on every script, the engine tests and the browser tests.
- `pages.yml` runs on every push to `main`: it calls CI, and only if that passes publishes the site (`index.html`, `shared/` and the `*-quest/` folders) to the root of the `gh-pages` branch.
- `pr-preview.yml` publishes a live preview of a pull request to `pr-preview/pr-<number>/` and comments the link on the PR. It only runs for PRs from branches in this repo; **PRs from forks and Dependabot get no preview** (run the page locally instead).

Both publishing workflows use `tools/publish_site.sh`, which maintains the `gh-pages` branch. Don't edit that branch by hand. Previews share the live site's origin, so they read and write the same saved progress; test them in a private window if you don't want your own progress touched.

One-time setup for a fork or fresh repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `gh-pages`, folder `/ (root)`. The branch is created by the first workflow run.

## 📄 License

[MIT](LICENSE). Learn from it, fork it, teach with it.
