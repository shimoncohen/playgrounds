---
name: triage-issue
description: Use to triage a new GitHub issue in this repo: classify it, ask for what is missing, label it, and say whether it is ready for a contributor or agent to pick up.
---

# Triage an issue

1. **Read** the issue and search for duplicates (`mcp__github__search_issues` or `gh`).
2. **Classify** with one label: `bug`, `mission idea`, `new playground`, or `docs`. Add `good first issue` only if it is one small, local change in one file with an obvious test.
3. **Check it is actionable**: for a bug, a playground, a step list and a browser; for a mission idea, a learner-visible skill and a sketch of the answer; for a new playground, an in-browser runtime story (no install, no build step). If something is missing, ask one specific question and add `needs info`.
4. **Scope**: anything touching progress saving, CI, deploy, or several quests is `maintainer decision`; say so and stop.
5. **Hand-off comment**: restate the task in two lines, point to the relevant skill (`add-mission`, `new-playground`) and files, and invite a contributor or agent to claim it by commenting.
6. Never close an issue as won't-fix without the maintainer; suggest it instead.

Labels used: see `.github/labels.json`. Create any that are missing (Actions → Sync labels → Run workflow).
