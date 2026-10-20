---
name: add-mission
description: Use when adding or changing a mission, chapter, quick-fire question or field-guide entry in a playground (mostly Shell Quest). Walks through content shape, honest checks, required tests and save-compatibility rules.
---

# Add a mission

Goal: a mission that teaches one thing, can be solved, and cannot be passed by a lazy answer.

1. **Read first**: `AGENTS.md`, then `docs/tiers-guideline.md` sections 3 (mission kinds, check helpers), 4 (save compatibility), 6 (pitfalls). Look at two neighbouring missions in the target chapter and copy their style.
2. **Place it.** Shell Quest: `shell-quest/content/tier-<tier>.js`. Append to the **end** of a chapter; never insert or renumber (saves are keyed `'<chapter>.<mission>'`). Other quests: the `CH` array in that quest's `app.js`.
3. **Write the mission**: `{ title, goal, anat, how, answer, explain, check, hint? }`.
   - `goal`: one friendly sentence, one concrete task. `answer`: the reference solution. `explain`: factual (test every claim against the engine).
   - `how`: ordered steps, **whole first, then the parts**. Step 1: one plain sentence on what the whole line does. Then one step per part (command, option, argument, operator), each tied back to step 1. Optionally a last step on what the learner will see. 3 to 5 steps. Give unclear `anat` chips a short meaning as a third element (`['-i','opt','ignore case']`). `explain` then holds only the extra fact or gotcha. Example in `docs/tiers-guideline.md` section 3.
   - Prefer an **outcome** check (file content, mode, variable) over "output contains X". Derive expected values from the world, accept sensible alternatives, quote variables in all learner-facing text.
   - The examples you write in `goal`/`explain`/`hint` must not complete the mission unless they teach the same lesson (`echo ...day?.log` must not pass a `*` mission). Tighten the check, or add the example to `ALLOWED_EXAMPLES` in `tests/shell/completion.test.mjs` with a reason.
   - Only teach what the practice shell supports (`help`, spec "as built" sections list gaps).
4. **Tests** (fail first): the solvability test picks the mission up automatically. Add to the tier's test file (`tests/shell/<tier>.test.mjs`) at least one `yes` (a different valid answer) and one `no` (nearest wrong command, and a lazy cheat such as `echo`-ing the expected output). `tests/shell/completion.test.mjs` already covers typos (a not-found command anywhere in the line) and text examples for every mission.
5. **Optional extras**: a quick-fire entry (`content/quickfire.js`) and a guide entry (`content/guide.js`) for what the mission introduces.
6. **Run**: `npm run test:engine`, then `npm run check && npm test`. If a golden or corpus fixture fails, your code is wrong; never regenerate fixtures.
7. **Play it** in the browser: mission card, "How it works" steps, hint, "Type it for me", explanation. Could someone who never saw the command say what the whole line does after reading step 1? Check 390px width.
8. **PR**: fill in the template; paste the wrong/lazy answers you tried and what the check said.
