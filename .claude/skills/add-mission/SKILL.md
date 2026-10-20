---
name: add-mission
description: Use when adding or changing a mission, chapter, quick-fire question or field-guide entry in a playground (mostly Shell Quest). Walks through content shape, honest checks, required tests and save-compatibility rules.
---

# Add a mission

Goal: a mission that teaches one thing, can be solved, and cannot be passed by a lazy answer.

1. **Read first**: `AGENTS.md`, then `docs/tiers-guideline.md` sections 3 (mission kinds, check helpers), 4 (save compatibility), 6 (pitfalls). Look at two neighbouring missions in the target chapter and copy their style.
2. **Place it.** Shell Quest: `shell-quest/content/tier-<tier>.js`. Append to the **end** of a chapter; never insert or renumber (saves are keyed `'<chapter>.<mission>'`). Other quests: the `CH` array in that quest's `app.js`.
3. **Write the mission**: `{ title, goal, anat, answer, explain, check, hint? }`.
   - `goal`: one friendly sentence, one concrete task. `answer`: the reference solution. `explain`: factual (test every claim against the engine).
   - Prefer an **outcome** check (file content, mode, variable) over "output contains X". Derive expected values from the world, accept sensible alternatives, quote variables in all learner-facing text.
   - Only teach what the practice shell supports (`help`, spec "as built" sections list gaps).
4. **Tests** (fail first): the solvability test picks the mission up automatically. Add to the tier's test file (`tests/shell/<tier>.test.mjs`) at least one `yes` (a different valid answer) and one `no` (nearest wrong command, and a lazy cheat such as `echo`-ing the expected output).
5. **Optional extras**: a quick-fire entry (`content/quickfire.js`) and a guide entry (`content/guide.js`) for what the mission introduces.
6. **Run**: `npm run test:engine`, then `npm run check && npm test`. If a golden or corpus fixture fails, your code is wrong; never regenerate fixtures.
7. **Play it** in the browser: mission card, hint, "Type it for me", explanation. Check 390px width.
8. **PR**: fill in the template; paste the wrong/lazy answers you tried and what the check said.
