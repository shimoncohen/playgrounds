import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

// Expected output recorded from real bash 5.2 (docker.io/library/bash:5.2, sha256:2cf7ddaf5f6369c16a0359e3bd48e54ada211a2e4e90d87532ad2958d642bdd, run with --network none).
const CASES = [
  ["echo `echo hi`", "hi"],
  ["echo \"`echo a   b`\"", "a b"],
  ["echo `echo a   b`", "a b"],
  ["echo a`echo b`c", "abc"],
  ["echo \"x `echo b` y\"", "x b y"],
  ["x=`echo a b`; echo \"$x\"", "a b"],
  ["x=`echo a b`; echo $x", "a b"],
  ["x=`echo 1 2` y=2; echo \"$x $y\"", "1 2 2"],
  ["x=`exit 3`; echo $?", "3"],
  ["for f in `echo a b c`; do echo $f; done", "a\nb\nc"],
  ["echo `echo \\`echo nested\\``", "nested"],
  ["echo \"`echo \\`echo nested\\``\"", "nested"],
  ["x=7; echo `echo \\$x` \"`echo \\$x`\"", "7 7"],
  ["echo `echo \\\\\\\\`", "\\"],
  ["echo `echo \\\"q\\\"`", "\"q\""],
  ["echo \"`echo \\\"q\\\"`\"", "q"],
  ["echo `echo \\a`", "a"],
  ["echo \"`echo '\\a'`\"", "\\a"],
  ["echo ${y:-`echo dflt`}", "dflt"],
  ["echo \"${y:-`echo dflt`}\"", "dflt"],
  ["y=; echo ${y:-`echo a b`}", "a b"],
  ["echo ${y:-`echo }`}", "}"],
  ["echo `echo $((1+2))`", "3"],
  ["echo $((`echo 2` * 3))", "6"],
  ["echo $(echo `echo n`)", "n"],
  ["echo `echo $(echo n)`", "n"],
  ["echo \"$(echo `echo n`)\"", "n"],
  ["x=1; echo `echo $x`", "1"],
  ["echo `echo a\\\nb`", "ab"],
  ["echo `\necho hi`", "hi"],
  ["echo ``", ""],
  ["echo \"\"`` x", " x"],
  ["echo '`echo hi`'", "`echo hi`"],
  ["echo \\`echo hi\\`", "`echo hi`"],
  ["echo \"\\`echo hi\\`\"", "`echo hi`"],
  ["echo hi # `echo no`", "hi"],
  ["cat <<EOF\nx `echo hi` y \\`not\\` z\nEOF", "x hi y `not` z"],
  ["cat <<EOF\nx `echo \\\"q\\\"` y\nEOF", "x \"q\" y"],
  ["cat <<EOF\nx `echo \\`echo n\\`` y\nEOF", "x n y"],
  ["cat <<'EOF'\n`echo hi`\nEOF", "`echo hi`"],
  ["cat <<\"EOF\"\n`echo hi`\nEOF", "`echo hi`"],
  ["cat <<-EOF\n\t`echo tab`\n\tEOF", "tab"],
  ["case `echo x` in x) echo hit;; esac", "hit"],
  ["case x in `echo x`) echo hit;; esac", "hit"],
  ["[[ `echo a` == a ]] && echo yes", "yes"],
  ["if [ `echo 1` = 1 ]; then echo one; fi", "one"],
  ["echo `echo a; echo b`", "a b"],
  ["echo \"`echo a; echo b`\"", "a\nb"],
  ["echo `printf 'a\\n\\n'`end", "aend"],
  ["f() { echo `echo in f $1`; }; f z", "in f z"],
  ["echo `echo a | tr a b`", "b"],
  ["echo `echo a` `echo b`", "a b"],
];

describe('backquote command substitution matches bash 5.2', () => {
  for (const [line, want] of CASES) {
    it(JSON.stringify(line), () => {
      const r = run(loadShell(), line);
      assert.deepEqual(r, { out: want, code: 0 });
    });
  }
});

describe('an unterminated backquote is an error and nothing runs', () => {
  for (const line of ['echo `echo hi', 'echo "`echo hi', 'echo "unterminated `echo', 'echo ${y:-`echo hi}', 'touch made.txt; echo `echo hi']) {
    it(JSON.stringify(line), () => {
      const SQ = loadShell();
      assert.deepEqual(run(SQ, line), { out: "bash: unexpected EOF while looking for matching ``'", code: 2 });
      assert.equal(run(SQ, 'ls made.txt').code, 2);
    });
  }
});
