#!/bin/sh
#   build-run.sh <dir> <edition> <run-timeout-s> <nonce>      <dir> holds src/main.rs
#   build-run.sh --version
# The output is framed by markers that carry a random nonce, so the program's own output cannot forge a frame:
#   \n<nonce>:DIAG \n<nonce>:STDOUT \n<nonce>:STDERR \n<nonce>:EXIT, each followed by its content.
# Needs GNU timeout.
if [ "${1:-}" = "--version" ]; then exec rustc --version; fi
[ $# -eq 4 ] || { echo "usage: build-run.sh <dir> <edition> <run-timeout-s> <nonce> | --version" >&2; exit 2; }
dir=$1 edition=$2 tmo=$3 nonce=$4
work=$(mktemp -d) || exit 2
trap 'rm -rf "$work"' EXIT
cp -R "$dir/." "$work/" || exit 2
cd "$work" || exit 2

# the path stays src/main.rs so panic messages carry the same path a cargo project would give
timeout 120 rustc --edition "$edition" --error-format=json -o main src/main.rs 2>diag.txt
built=$?
if [ "$built" -eq 0 ]; then
  RUST_BACKTRACE=0 timeout "$tmo" ./main >out.txt 2>err.txt
  code=$?
else
  : >out.txt
  : >err.txt
  code=compile-failed
fi
printf '\n%s:DIAG\n' "$nonce"; cat diag.txt
printf '\n%s:STDOUT\n' "$nonce"; cat out.txt
printf '\n%s:STDERR\n' "$nonce"; cat err.txt
printf '\n%s:EXIT\n%s\n' "$nonce" "$code"
