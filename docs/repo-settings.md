# Repository settings

Settings the contribution and release flow assume. They live in GitHub, not in the repo, so a maintainer sets them once.

## Branch protection for `main`

Settings → Branches → Add rule (or Rules → Rulesets), target `main`:

- **Require a pull request before merging**, with at least 1 approval; dismiss stale approvals on new commits.
- **Require status checks to pass**, up to date with `main`. Required checks: `checks` (CI, from `ci.yml`) and `title` (PR title lint, from `commitlint.yml`).
- **Require conversation resolution** before merging.
- **Block force pushes** and deletions. Optionally **require linear history**.
- Do not let admins or bots bypass it; releases go through a PR too.

## Merge settings

Settings → General → Pull Requests:

- Allow **squash merging** only, default message **Pull request title** (and description). The title is the Conventional Commit that changelogs and version bumps are computed from.
- Automatically delete head branches.

## Actions

Settings → Actions → General:

- Workflow permissions: **Read repository contents** by default (each workflow asks for what it needs).
- Tick **Allow GitHub Actions to create and approve pull requests**, so release-please can open its PR.
- Fork PR workflows: **Require approval for first-time contributors**.

## Release token (recommended)

Pull requests opened with the built-in `GITHUB_TOKEN` do not trigger other workflows, so the required checks would never run on the release PR and it could not be merged. Create a fine-grained personal access token (or a GitHub App token) limited to this repository with **Contents: read/write** and **Pull requests: read/write**, and store it as the repository secret **`RELEASE_TOKEN`**. The *Release* workflow (release-please) uses it when present. Without it, the release PR is created but the required checks never report; push any commit to its branch by hand to start them.

## Pages

Settings → Pages → Source: **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`. The `gh-pages` branch is maintained by `pages.yml`; do not edit it by hand.

## Security

Settings → Code security: enable **Private vulnerability reporting** (used by `SECURITY.md`), **Dependabot alerts** and **secret scanning**.

## Labels

Actions → **Sync labels** → Run workflow creates the labels in `.github/labels.json`.
