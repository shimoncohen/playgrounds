#!/usr/bin/env bash
# Publish the static site to the gh-pages branch, which GitHub Pages serves.
#
#   tools/publish_site.sh main             site root (keeps all pr-preview/ folders)
#   tools/publish_site.sh pr <number>      pr-preview/pr-<number>/
#   tools/publish_site.sh remove-pr <n>    delete that preview
#
# Run from the repo root with push access to `origin`. The site is index.html, shared/ and *-quest/.
set -euo pipefail

mode=${1:?usage: publish_site.sh main | pr <number> | remove-pr <number>}
num=${2:-}
if [[ $mode != main && ! $num =~ ^[0-9]+$ ]]; then echo "a PR number is required" >&2; exit 2; fi

root=$(git rev-parse --show-toplevel)
site=(index.html shared)
for d in "$root"/*-quest; do site+=("$(basename "$d")"); done

work=$(mktemp -d)
trap 'git -C "$root" worktree remove --force "$work" 2>/dev/null || true; rm -rf "$work"' EXIT
rm -rf "$work"   # `git worktree add` wants to create the directory itself

branch=gh-pages
checkout_branch() {
  if git -C "$root" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    git -C "$root" fetch --quiet --depth=1 origin "$branch"
    git -C "$root" worktree add --quiet -B "$branch" "$work" FETCH_HEAD
  else
    git -C "$root" worktree add --quiet --detach "$work"
    git -C "$work" checkout --quiet --orphan "$branch"
    git -C "$work" rm -rfq . 2>/dev/null || true
  fi
}

apply() {
  cd "$work"
  touch .nojekyll
  case $mode in
    main)
      # Replace the site but leave previews alone.
      find . -mindepth 1 -maxdepth 1 ! -name .git ! -name .nojekyll ! -name pr-preview -exec rm -rf {} +
      for item in "${site[@]}"; do cp -r "$root/$item" .; done
      ;;
    pr)
      rm -rf "pr-preview/pr-$num"
      mkdir -p "pr-preview/pr-$num"
      for item in "${site[@]}"; do cp -r "$root/$item" "pr-preview/pr-$num/"; done
      ;;
    remove-pr)
      rm -rf "pr-preview/pr-$num"
      ;;
    *) echo "unknown mode: $mode" >&2; exit 2 ;;
  esac
}

checkout_branch
apply
cd "$work"
git add -A
if git diff --cached --quiet; then echo "gh-pages already up to date"; exit 0; fi
git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit --quiet -m "Publish ${mode}${num:+ $num} from ${GITHUB_SHA:-$(git -C "$root" rev-parse HEAD)}"

# Previews for different PRs can finish at the same time: retry on a rejected push.
for attempt in 1 2 3 4 5; do
  if git push --quiet origin "HEAD:refs/heads/$branch"; then echo "published ($mode${num:+ $num})"; exit 0; fi
  echo "push rejected, retrying ($attempt)..." >&2
  sleep $((attempt * 2))
  git fetch --quiet --depth=1 origin "$branch"
  git rebase --quiet FETCH_HEAD
done
echo "could not push to $branch" >&2
exit 1
