import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

// Expected output recorded from real bash 5.2 (docker.io/library/bash:5.2, sha256:2cf7ddaf5f6369c16a0359e3bd48e54ada211a2e4e90d87532ad2958d642bdd, run with --network none).
const CASES = [
  ["echo $'a'", "a"],
  ["echo $'a\\tb'", "a\tb"],
  ["echo $'a\\nb'", "a\nb"],
  ["echo $'\\x41\\x4a'", "AJ"],
  ["echo $'\\101\\60\\1011'", "A0A1"],
  ["echo $'\\u00e9\\u263A\\U0001F600'", "é☺😀"],
  ["echo $'\\\\ \\' \\\" \\?'", "\\ ' \" ?"],
  ["x=$'\\cA\\ca\\e'; echo ${#x}", "3"],
  ["echo $'\\q\\z'", "\\q\\z"],
  ["echo $'a''b'$'c'", "abc"],
  ["echo x$'a b'y", "xa by"],
  ["echo \"$'a'\"", "$'a'"],
  ["x=$'a b'; echo \"$x\"", "a b"],
  ["echo $'a b' c", "a b c"],
  ["echo $'*' | tr a b", "*"],
  ["echo $'a\\0b'", "a"],
  ["echo \"${x:-$'a\\tb'}\"", "a\tb"],
  ["echo \"${x:-$'a'}\"", "a"],
  ["echo $(echo $'a\\'b')", "a'b"],
  ["echo `echo $'a'`", "a"],
  ["for i in $'a b' c; do echo \"[$i]\"; done", "[a b]\n[c]"],
  ["case a in $'a') echo m;; esac", "m"],
  ["echo ${x:-\"`echo \"q\"`\"}", "q"],
  ["echo ${x:-\"`echo '\"'`\"}", "\""],
  ["case x in \"`echo '\"'`\") echo m;; *) echo n;; esac", "n"],
  ["echo ${x/\"`echo '\"'`\"/z}", ""],
  ["[[ x == \"`echo '\"'`\" ]]; echo $?", "1"],
  ["echo ${x:-\"$(echo \"q\")\"}", "q"],
  ["echo ${x:-\"${y:-\"in\"}\"}", "in"],
  ["echo \"$(echo \"a\" \"b\")\"", "a b"],
  ["x=\"a\"; echo ${x:+\"$(echo \"$x\")\"}", "a"],
  ["echo `exit 3`$?", "3"],
  ["echo $(exit 3)$?", "3"],
  ["echo $?$(exit 3)", "0"],
  ["`exit 3`; echo $?", "3"],
  ["$(exit 3); echo $?", "3"],
  ["$(true); echo $?", "0"],
  ["if `false`; then echo t; else echo f; fi", "f"],
  ["if $(false); then echo t; else echo f; fi", "f"],
  ["if $(true); then echo t; else echo f; fi", "t"],
  ["x=$(false); echo $?", "1"],
  ["if x=$(false); then echo t; else echo f; fi", "f"],
  ["$(exit 3) && echo yes || echo no", "no"],
  ["false; echo $(true) $?", "0"],
  ["f() { $(exit 4); }; f; echo $?", "4"],
  ["false; $(echo); echo $?", "0"],
];

describe('ANSI-C quotes, quotes inside substitutions and substitution status match bash 5.2', () => {
  for (const [line, want] of CASES) {
    it(JSON.stringify(line), () => {
      assert.deepEqual(run(loadShell(), line), { out: want, code: 0 });
    });
  }
  it('an unterminated $\'..\' is an error', () => {
    assert.equal(run(loadShell(), "echo $'abc").code, 2);
  });
  it('a stale substitution status does not leak into the next command', () => {
    assert.equal(run(loadShell(), 'echo $(exit 3); for i in $?; do echo $i; done').out, '\n0'.slice(1));
  });
});
