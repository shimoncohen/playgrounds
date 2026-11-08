---
name: quest-story
description: Use when writing or changing a playground's treasure-hunt story (its story.js outline, chapter story lines, intros, badges) or when giving an existing playground its story. Covers the outline, one leg per chapter, world values, and the save and fixture limits on a rewrite.
---

# Quest story

Every playground is one treasure hunt. The rules are in `docs/story-guideline.md`; read it first, then `AGENTS.md` rules 3, 4, 9 and 12.

## Write the outline

1. **List the course first.** The chapters and their lessons, in dependency order (`docs/tiers-guideline.md` section 6). The story fits this order; never move a lesson for the plot.
2. **Pick a world** that suits the topic and a **final treasure** that pays off something from chapter 1. Write both in one sentence each.
3. **Draw the map**: the named places the trail passes, roughly one region per chapter or tier. These names become folders, files, hosts, variables and values.
4. **Pick the cast**: two to four recurring characters, each with a name and a role. Reuse them; do not add one per mission.
5. **Write one leg per chapter**: the clue that arrives (intro), the puzzle (that chapter's lessons), the find (the badge). The next leg's clue grows out of the last find.
6. **Save it** as `story.js` in the playground folder (shape in the guideline, section 3), and put each leg on its chapter as `story: '...'`.

## Put the missions on the trail

For each mission in the chapter:

- The goal may open with one story clause, then states one concrete task. The `how` steps and `explain` still teach the whole line, then the parts.
- Use world names and values (`lantern.txt`, `harbor.local`, 12 coins), not `foo`, `bar` or `x = 5`. Change the `answer`, `check`, `setup` and tests together.
- Check every story word that is technical against teach-before-use. Plain story words (cave, ranger) need no teaching.
- Whimsical, not silly; never at the learner's expense (`mission-voice`).

## Rewriting an existing playground

- Never reorder or renumber chapters or missions, never rename a `localStorage` key, never regenerate `tests/fixtures/`. Rewrite a leg in place instead of moving it.
- Rename world data only where every check, test and fixture still agrees. If a Shell Quest fixture records a file name, keep that name.
- Remove the playground from `STORY_PENDING` in `tests/trophy/catalog.test.mjs`.
- Run `npm run check && npm test`, then play two chapters (`playtest`) and read only the story lines: do they read as one trail to one treasure?
