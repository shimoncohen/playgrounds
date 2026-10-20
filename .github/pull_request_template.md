## What and why

<!-- One or two sentences. Link the issue: Closes #123 -->

## Type

- [ ] New or improved mission / chapter / quick-fire / guide entry
- [ ] Bug fix
- [ ] Engine or shared-code change
- [ ] New playground
- [ ] Docs / tooling

## How I checked it

- [ ] `npm run check`
- [ ] `npm test` (engine + browser)
- [ ] Played the change in a browser (desktop and ~390px wide), no console errors
- [ ] New missions have a reference answer, plus a wrong and a lazy answer that fail

<!-- Paste the commands you ran and what they printed. Screenshots for anything visible. -->

## Safety rails

- [ ] No test fixture under `tests/fixtures/` was regenerated or edited
- [ ] No `localStorage` key renamed; shipped missions not renumbered or reordered
- [ ] No new dependency or build step
- [ ] Learner-facing text is friendly, concrete and factual

## Made with an agent?

- [ ] Yes (which one, and I reviewed the full diff myself)
- [ ] No

## Not tested / risks

<!-- Be honest. Reviewers appreciate it. -->
