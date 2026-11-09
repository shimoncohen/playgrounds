#!/bin/sh
# Runs build-run.sh inside a throwaway container, so compile and run share one sandbox.
#   [RUST_IMAGE=rust@sha256:<digest>] docker-run.sh <dir> <edition> <run-timeout-s> <nonce>
#   docker-run.sh --version
# It runs as the invoking user: with CAP_DAC_OVERRIDE dropped, root could not read the owner-only (0700) temp dir.
# no-new-privileges is left off on purpose: snap-packaged docker refuses it.
# A timeout, an error or a signal removes the container by name, so none outlives its run.
RUST_IMAGE=${RUST_IMAGE:-rust@sha256:b8e062b1c3a80183df83d9ba187cadd2b5ab84bc78d453dbfeb2fccd5f982247}
case $RUST_IMAGE in
  *@sha256:*) ;;
  *) echo "set RUST_IMAGE to a rust image pinned by @sha256 digest" >&2; exit 2 ;;
esac
here=$(cd "$(dirname "$0")" && pwd) || exit 2

if [ "${1:-}" = "--version" ]; then
  nonce=version$$
  run_timeout=120
  set -- "$RUST_IMAGE" sh /build-run.sh --version
else
  [ $# -eq 4 ] || { echo "usage: docker-run.sh <dir> <edition> <run-timeout-s> <nonce> | --version" >&2; exit 2; }
  case $4 in *[!A-Za-z0-9]*|"") echo "nonce must be alphanumeric" >&2; exit 2 ;; esac
  case $3 in *[!0-9]*|"") echo "run timeout must be a number of seconds" >&2; exit 2 ;; esac
  nonce=$4
  # the 120 s compile limit in build-run.sh plus the run limit plus 60 s of slack for container start and teardown
  run_timeout=$(( $3 + 180 ))
  dir=$(cd "$1" && pwd) || exit 2
  set -- -v "$dir:/in:ro" "$RUST_IMAGE" sh /build-run.sh /in "$2" "$3" "$4"
fi

name="rq-$nonce"
cleanup() { docker rm -f "$name" >/dev/null 2>&1; }
trap cleanup EXIT
trap 'exit 143' TERM INT

timeout "$run_timeout" docker run --rm --name "$name" --network none --cap-drop ALL --pids-limit 512 --memory 2g --cpus 2 \
  --read-only --tmpfs /tmp:rw,exec,size=512m -e HOME=/tmp --user "$(id -u):$(id -g)" \
  -v "$here/build-run.sh:/build-run.sh:ro" "$@"
