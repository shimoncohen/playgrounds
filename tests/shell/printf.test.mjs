import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const out = (line, SQ = loadShell()) => run(SQ, line).out;
// SQ.fmtPrintf returns the raw text (no trailing-newline trimming) so awk can share it
const fmt = (f, ...args) => loadShell().fmtPrintf(f, args);

describe('SQ.fmtPrintf (shared with awk)', () => {
  it('returns { text, code } and err only when something was wrong', () => {
    const r = fmt('%s\n', 'a');
    assert.equal(r.text, 'a\n');
    assert.equal(r.code, 0);
    assert.equal(r.err, undefined);
    const bad = fmt('%d', 'abc');
    assert.equal(bad.text, '0');
    assert.equal(bad.code, 1);
    assert.equal(bad.err, 'bash: printf: abc: invalid number');
  });
  it('cycles the format while arguments remain', () => {
    assert.equal(fmt('%s-%s\n', 'a', 'b', 'c').text, 'a-b\nc-\n');
    assert.equal(fmt('x\n', 'a', 'b').text, 'x\n', 'a format with no conversion prints once');
    assert.equal(fmt('%d|%s|', '', '').text, '0||', 'missing arguments are 0 and empty');
  });
});

describe('printf conversions', () => {
  it('%s %d %i %u %x %X %o %c %%', () => {
    assert.equal(out("printf '%s|%d|%i|%u|%x|%X|%o|%c|%%\\n' hi 42 -7 3 255 255 8 xyz"), 'hi|42|-7|3|ff|FF|10|x|%');
  });
  it('negative numbers wrap to 64 bits for %u %x %o', () => {
    assert.equal(out("printf '%u %x\\n' -1 -1"), '18446744073709551615 ffffffffffffffff');
  });
  it('numeric arguments may be hex, or a quote followed by a character', () => {
    assert.equal(out("printf '%d %d\\n' 0x1f \"'A\""), '31 65');
  });
  it('%e %f %g', () => {
    assert.equal(out("printf '%e %f %g\\n' 1.5 1.5 1.5"), '1.500000e+00 1.500000 1.5');
    assert.equal(out("printf '%g %g %g %g\\n' 0.0001 1000000 100000 3.14159265"), '0.0001 1e+06 100000 3.14159');
    assert.equal(out("printf '%E %G\\n' 1500 0.00001"), '1.500000E+03 1E-05');
    assert.equal(out("printf '%.3f %.0f\\n' 2 2.5"), '2.000 2');
  });
  it('widths, precision and flags', () => {
    assert.equal(out("printf '%5s|%-5s|%05d|%+d|%.2f|%8.3f|\\n' ab ab 42 5 3.14159 3.14159"), '   ab|ab   |00042|+5|3.14|   3.142|');
    assert.equal(out("printf '%5.2f\\n' 3.14159"), ' 3.14');
    assert.equal(out("printf '%*d|%-*d|%.*f\\n' 5 42 4 7 1 3.14159"), '   42|7   |3.1');
    assert.equal(out("printf '%.2s|%#x|%#o\\n' abcdef 255 8"), 'ab|0xff|010');
  });
  it('%b expands escapes in the argument; the format escapes do not apply to %s', () => {
    assert.equal(out("printf '%b|\\n' 'a\\tb'"), 'a\tb|');
    assert.equal(out("printf '%s|\\n' 'a\\tb'"), 'a\\tb|');
    assert.equal(out("printf '%b' 'x\\0101y\\cz'"), 'xAy');
  });
  it('%q shell-quotes', () => {
    assert.equal(out("printf '%q\\n' 'a b'"), 'a\\ b');
    assert.equal(out("printf '%q|%q|%q\\n' '' plain-x.y \"it's\""), "''|plain-x.y|it\\'s");
  });
  it('escapes in the format', () => {
    assert.equal(out("printf 'a\\tb\\\\c\\n'"), 'a\tb\\c');
    assert.equal(out("printf '\\x41\\101\\0102|\\a|\\x4a\\n'").replace('\x07', '<a>'), 'AAB|<a>|J');
    assert.equal(Number(out("printf 'a\\0b' | wc -c")), Number(out("printf 'abc' | wc -c")), 'NUL is one character');
    assert.equal(out("printf 'a\\qb\\n'"), 'a\\qb', 'an unknown escape stays as typed');
  });
  it('cycles the format with extra arguments, fills in missing ones', () => {
    assert.equal(out("printf '%s-%s\\n' a b c"), 'a-b\nc-');
    assert.equal(out("printf '%d:%s\\n'"), '0:');
    assert.equal(out("printf '%s %s\\n' a"), 'a ');
  });
  it('a bad number reports bash style, prints 0 and exits 1', () => {
    assert.equal(out("printf '%d\\n' abc"), 'bash: printf: abc: invalid number\n0');
    assert.equal(run(loadShell(), "printf '%d\\n' abc").code, 1);
    assert.equal(out("printf '%f\\n' abc"), 'bash: printf: abc: invalid number\n0.000000');
  });
  it('no arguments prints the usage line', () => {
    assert.equal(out('printf'), 'printf: usage: printf format [arguments]');
  });
});

describe('printf -v', () => {
  it('stores the result in a variable and prints nothing', () => {
    const SQ = loadShell();
    assert.equal(run(SQ, "printf -v v '%s-%s' a b").out, '');
    assert.equal(run(SQ, 'echo $v').out, 'a-b');
    assert.equal(run(SQ, "printf -vw '%03d' 7; echo $w").out, '007');
  });
  it('keeps a trailing newline in the variable', () => {
    assert.equal(out("printf -v v '%d\\n' 5; echo \"[$v]\""), '[5\n]');
  });
  it('rejects a bad name or a missing name', () => {
    assert.equal(out("printf -v 1x '%s' a"), "bash: printf: `1x': not a valid identifier");
    assert.match(out('printf -v'), /option requires an argument/);
  });
  it('still sets the variable when a number is bad, and exits 1', () => {
    const SQ = loadShell();
    const r = run(SQ, "printf -v n '%d' abc; echo \"$n $?\"");
    assert.match(r.out, /invalid number/);
    assert.match(r.out, /0 (0|1)$/);
  });
});

describe('printf caps', () => {
  it('refuses a huge width, a huge precision and a huge * width', () => {
    assert.match(out("printf '%1000000s' x"), /too large/);
    assert.match(out("printf '%*d' 1000000 1"), /too large/);
    assert.match(out("printf '%.1000000f' 1"), /too large/);
    assert.match(out("printf '%.*s' 99999999 x"), /too large/);
  });
  it('caps the output of a cycling format over a huge argument list', () => {
    const SQ = loadShell();
    const t0 = Date.now();
    const r = run(SQ, "printf '%1000s' $(seq 1 9000) | wc -c");
    assert.ok(Date.now() - t0 < 5000);
    assert.match(r.out, /too large|^\d+$/);
    assert.match(run(SQ, "printf '%s\\n' $(seq 1 9000) | wc -l").out, /^\d+$/);
    assert.equal(run(SQ, 'echo next').out, 'next', 'the next line still works');
  });
  it('a 1e300 %f does not throw', () => {
    assert.match(out("printf '%f\\n' 1e300"), /^1\d{300}\.000000$/);
  });
  it('%u and %d with a very long digit string clamp instead of throwing', () => {
    assert.match(out(`printf '%d\\n' ${'9'.repeat(400)}`), /^9223372036854775807/);
  });
});
