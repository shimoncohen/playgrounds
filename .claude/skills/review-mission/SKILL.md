---
name: review-mission
description: Use to review new or changed missions (in a diff or PR) for check honesty, solvability, save compatibility and teaching quality. An adversarial read; try to pass each mission the lazy way.
---

# Review a mission

For each changed mission, in order:

1. **Compat**: not inserted mid-chapter, not renumbered, no `localStorage` key touched, no fixture under `tests/fixtures/` edited (see `AGENTS.md`, guideline section 4).
2. **Honest check**: try to pass it by `echo`-ing the expected output, by leftovers from an earlier mission, by a hardcoded path, by a command that merely looks related. Run those through the Node harness (`tests/shell/harness.mjs`: `loadShell`, `run`) or the tier's `judge` helper. If a lazy answer passes, it is a finding.
   Also try every example written in the mission's `goal`/`explain`/`hint`: if one completes the mission but teaches a neighbouring lesson (the `?` example on a `*` mission), that is a finding unless it is allow-listed in `tests/shell/completion.test.mjs` for a stated reason. A typo'd command (`Sort`) must never complete a mission; the completion test checks this for every mission.
3. **Fair check**: does it reject a sensible alternative (option order, `[[ ]]` vs `[ ]`, a different file name the goal did not fix)? If so, it is a finding.
4. **Steps**: if the mission has `steps`, each step is solvable by its own `answer`, no single step (or lazy line) completes the mission, any order works, and the mission-level `answer` equals the first step's.
5. **Tests**: at least one `yes` (valid alternative) and one `no` (wrong and lazy). Solvability covers `answer` only.
6. **Engine truth**: every claim in `how`, `explain` and `hint` is true in this practice shell; nothing teaches an unsupported feature (the spec's "as built" sections list gaps). Variables quoted in all learner text.
7. **Code in prose**: every command name, option, file name, variable and function in `goal`, `how`, `explain`, `hint`, `note` is in `<code>` (backticks where the field is escaped). `tests/shell/codestyle.test.mjs` catches the clear cases; you catch the ambiguous words (find, cat, sort, echo ...) and other quests.
8. **Teaching**: one idea, goal answerable from what came before, tone per `mission-voice`. **Whole before parts**: the mission has `how` steps; step 1 says what the whole line does, each later step ties one part back to it, no term is used before it is explained, and `explain` does not just repeat the steps. A mission that only labels pieces is a finding.

Output: findings list, most severe first, each with mission id, the exact input that breaks it, and the fix. Say "no findings" only after trying step 2.
