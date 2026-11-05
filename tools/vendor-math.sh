#!/usr/bin/env bash
# Rebuilds math-quest/vendor/ from pinned npm packages. Run only to upgrade a library.
set -euo pipefail

KATEX=0.19.1
MATHJS=15.2.0
MATHLIVE=0.111.4
THREE=0.187.0
ESBUILD=0.25.10

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/math-quest/vendor"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fetch() {
  mkdir -p "$tmp/$1"
  (cd "$tmp/$1" && npm pack "$1@$2" --silent >/dev/null && tar xzf "$1-$2.tgz")
}

fetch katex "$KATEX"
fetch mathjs "$MATHJS"
fetch mathlive "$MATHLIVE"
fetch three "$THREE"

rm -rf "$out/katex" "$out/mathjs" "$out/mathlive" "$out/three"
mkdir -p "$out/katex/fonts" "$out/mathjs" "$out/mathlive" "$out/three"

k="$tmp/katex/package"
cp "$k/dist/katex.min.js" "$k/dist/katex.min.css" "$k/LICENSE" "$out/katex/"
cp "$k"/dist/fonts/*.woff2 "$out/katex/fonts/"
echo "katex $KATEX" > "$out/katex/VERSION"

cp "$tmp/mathjs/package/lib/browser/math.js" "$tmp/mathjs/package/LICENSE" "$out/mathjs/"
echo "mathjs $MATHJS" > "$out/mathjs/VERSION"

cp "$tmp/mathlive/package/mathlive.min.js" "$out/mathlive/"
cp "$tmp/mathlive/package/LICENSE.txt" "$out/mathlive/LICENSE"
echo "mathlive $MATHLIVE" > "$out/mathlive/VERSION"

# three ships ES modules only: bundle to a plain-script IIFE so pages need no import maps.
mkdir -p "$tmp/build/node_modules"
mv "$tmp/three/package" "$tmp/build/node_modules/three"
cat > "$tmp/build/entry.js" <<'JS'
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
globalThis.THREE = Object.assign({}, T, { OrbitControls });
JS
(cd "$tmp/build" && npx -y "esbuild@$ESBUILD" entry.js --bundle --minify --format=iife --outfile="$out/three/three.min.js")
cp "$tmp/build/node_modules/three/LICENSE" "$out/three/"
echo "three $THREE" > "$out/three/VERSION"
