---
name: playtest
description: Use to play a quest in a real browser like a new learner would, to find confusing goals, dead ends, layout glitches and console errors. Use after changing a mission or UI, or when asked "is this quest any good?".
---

# Playtest

Play it like someone who has never seen it. Report friction, not just failures.

1. **Serve** the repo: `python3 -m http.server 8000` (background), open `http://localhost:8000/<name>-quest/`. Playwright is already a dev dependency (`npx playwright install chromium` once; set `PW_CHROMIUM` if Chromium lives elsewhere). `tests/smoke.mjs` has `open()` and server helpers worth copying.
2. **Play the path**: read each mission card, try the goal as a learner would from the card alone (no peeking at `answer`), use the hint once, then "Type it for me" and read the explanation.
3. **Look for**: a goal, hint, question or intro that uses a word the quest has not taught yet (write down every unfamiliar term on missions 1 to 3 and where it was first explained); two reasonable answers where only one passes; a hint that gives nothing new; an explanation that is wrong or condescending; "How it works" steps that start with a flag instead of the whole line, or leave you unable to say what the command does; console errors; horizontal scroll or clipped text at 390px wide; saved progress lost on reload.
4. **Screenshot** desktop (1280x800) and phone (390x844) of any problem, and read them.
5. **Report** a short table: where (chapter.mission), what happened, what a learner would expect, suggested fix, severity. Open an issue per real problem using the bug or mission-idea form. Do not fix content in the same pass unless asked.
