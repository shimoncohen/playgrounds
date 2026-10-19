# playgrounds

Interactive playgrounds for learning programming and tooling. Each one is a static page: open `index.html` (the landing page) or `<name>-quest/index.html` in a browser, no build step needed. Live site: https://shimoncohen.github.io/playgrounds/

| Playground | Folder |
|---|---|
| Script Quest (JavaScript / TypeScript / Node) | `script-quest/` |
| Harbor Quest (Docker / Kubernetes) | `harbor-quest/` |
| C++ Quest | `cpp-quest/` |
| Python Quest | `python-quest/` |
| Shell Quest (bash) | `shell-quest/` |

Most folders hold `index.html` (markup), `style.css` and `app.js`; Shell Quest splits its code further (see Development). Shared code lives in `shared/`. Fonts and the `acorn` / `typescript` libraries load from CDNs. Nothing needs a server or database, so the repo can be served as-is by GitHub Pages.

## Tiers

Shell Quest has three tiers, Beginner (7 chapters, 52 missions), Intermediate (4 chapters, 29 missions) and Advanced (4 chapters, 28 missions); Expert is planned. Tiers are open: every chapter is unlocked, and the chapter rail just groups them and shows how far you are in each. `shared/tiers.js` holds the tier model (XP per mission, ranks from cumulative XP) so other playgrounds can reuse it.

Advanced is about real scripts: tests and `if`/`case`, loops and `$(( ))`, functions with arguments and `local`, and scripts that read input, `source` a library, write files with here-documents and report errors on stderr with an exit status. Script missions are written in an editor panel (`nano FILE`, then Save or Save & run) and checked by running them against hidden test cases on a throwaway copy of the world. The practice shell is a documented subset of bash: what it does not do yet (arrays, `&`, `set -e`, `trap`, `getopts`, `awk`, ...) is listed in the design's "Stage 2 as built" section.

How to use the tier model, keep old saves working, write command, outcome and script missions, and write checks that hold up: [docs/tiers-guideline.md](docs/tiers-guideline.md). The design and what each stage actually built: [docs/superpowers/specs/2026-10-19-shell-quest-tiers-design.md](docs/superpowers/specs/2026-10-19-shell-quest-tiers-design.md).

## Saving progress

Each playground keeps its state in `localStorage` (one JSON string per playground, per origin). `shared/progress.js` adds a **Progress** button to the header so that clearing the browser's site data doesn't have to mean starting over:

- **Export / Import**: download progress as `<name>-quest-progress.json` and load it back. Works in every browser.
- **Auto-save file** (Chrome, Edge, Opera): link a file once and it is rewritten after every save. If site data is cleared, use "Open existing file" to restore, and the link is re-established. If the browser only asks for permission again, a red dot on the button says so.
- **Storage protection**: `navigator.storage.persist()` is requested once after the first save so the browser doesn't evict the data when disk is low. It doesn't survive a manual "clear site data".

Behaviours worth knowing: importing replaces current progress (with a confirmation); a file only restores automatically when the browser has no progress (zero XP); the local copy wins over the file otherwise, so don't edit one progress file from two devices at once; the JSON can be hand-edited, so it isn't tamper-proof. The auto-save file needs a secure context (HTTPS or localhost) and the full page, so it is hidden inside claude.ai artifacts, where Export/Import is the fallback.

To add it to a new playground: set `window.PROGRESS = {key, name}` (the `localStorage` key) and load `shared/progress.css` and `shared/progress.js` before `app.js`.

## Publishing to claude.ai artifacts

The Artifact service wraps pages in its own skeleton, so it needs a single body-only file:

```
python3 tools/build.py            # all five -> dist/<name>-quest.html
python3 tools/build.py shell      # just one
python3 tools/build.py --check    # verify the folders bundle cleanly
```

Then, in a Claude session with the Artifact tool, ask Claude to publish `dist/<name>-quest.html` to the existing artifact URL (an in-place update, so the link stays the same). The artifact URLs are not stored in this repo; keep them in a git-ignored `artifacts.json` (`{"shell-quest": "https://claude.ai/artifact/…"}`) if you like. `dist/` is git-ignored. Publishing itself can't run from a plain script, because the Artifact tool is only available inside Claude.

## Development

```
npm ci
npx playwright install chromium   # once
npm test                          # engine tests, browser smoke tests, golden transcript
npm run test:engine               # just the shell engine and content tests (Node only, no browser)
npm run check                     # does every folder still bundle for artifacts?
```

`tests/smoke.mjs` (50 tests) serves the repo on a local port and checks that the landing page and every playground load without errors, that progress export, import and the linked save file behave, and that the Shell Quest tiers, field guide, quick-fire, editor panel, script missions and artifact bundle work. `tests/shell-golden.mjs` replays every Beginner mission in the browser and compares the transcript and final save to fixtures in `tests/fixtures/` (52 records). `tests/shell/*.test.mjs` (1,736 tests) run the engine and content in Node without a browser, including the solvability of every mission and a differential corpus that compares about 1,100 lines with the output recorded from the Stage 1 engine. Never regenerate the golden or corpus fixtures to make a test pass (see the guideline). Set `PW_CHROMIUM=/path/to/chromium` to use an existing browser.

Shell Quest is split by job, as plain scripts sharing one `SQ` namespace and loaded in order from `index.html`:

- `shell-quest/engine/`: file system (`fs.js`), tokenizer and expansions (`parse.js`), arithmetic (`arith.js`), the AST parser (`ast.js`), the interpreter, functions, scripts and sandbox (`interp.js`), commands (`cmds-*.js`), and `exec.js` (runs a line, runs script test cases, builds the mission check context).
- `shell-quest/content/`: `tiers.js` (tier setup), `tier-beginner.js`, `tier-intermediate.js` and `tier-advanced.js` (chapters and missions), `guide.js`, `quickfire.js`.
- `shell-quest/ui.js`, `editor.js` and `app.js`: rendering, the script editor panel, and event wiring.

## CI and deployment

- `.github/workflows/ci.yml` runs on pull requests: the bundle check, `node --check` on every script, the engine tests, and the browser tests.
- `.github/workflows/pages.yml` runs on every push to `main`: it calls the CI workflow, and only if that passes publishes the site (`index.html`, `shared/` and the `*-quest/` folders) to the root of the `gh-pages` branch.
- `.github/workflows/pr-preview.yml` runs on pull requests from this repo that touch the landing page, `shared/` or a playground. It publishes a copy to `pr-preview/pr-<number>/` on `gh-pages`, comments the link on the PR, and removes the copy when the PR is closed. Forks and Dependabot are skipped.

Both publishing workflows use `tools/publish_site.sh`, which maintains the `gh-pages` branch. Don't edit that branch by hand.

Previews share the live site's origin, so they read and write the same saved progress. Test them in a private window if you don't want your own progress touched.

One-time setup: in the repo go to **Settings → Pages → Build and deployment → Source** and choose **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`. The `gh-pages` branch is created by the first workflow run.

## License

[MIT](LICENSE)
