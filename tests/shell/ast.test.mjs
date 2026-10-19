// Tokenizer additions (Stage 2, Task 4): newlines, parentheses, ;;, lone &, here-documents and here-strings.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const SQ = loadShell();
const toks = (s, o) => JSON.parse(JSON.stringify(SQ.tokenize(s, Object.assign({ dry: true }, o))));
const shape = (s) => toks(s).map((t) => (t.t === 'w' ? 'w' : 'op' + t.v));

describe('tokenizer: new operators', () => {
  it('newline is an op', () => assert.deepEqual(shape('a\nb'), ['w', 'op\n', 'w']));
  it('parentheses are ops', () => assert.deepEqual(shape('f() { echo hi; }'), ['w', 'op(', 'op)', 'w', 'w', 'w', 'op;', 'w']));
  it('{ and } stay words', () => assert.deepEqual(toks('{ a; }').filter((t) => t.t === 'w').map((t) => t.v), ['{', 'a', '}']));
  it(';; is an op', () => assert.ok(shape('case x in a) echo 1;; esac').includes('op;;')));
  it('echo ( yields a ( op', () => assert.deepEqual(shape('echo ('), ['w', 'op(']));
  it('$( ) and $(( )) stay inside words', () => {
    assert.deepEqual(shape('echo $(echo hi) $((1+2))'), ['w', 'w', 'w']);
  });
  it('quoted parens and newlines are literal', () => {
    assert.deepEqual(shape('echo "(a\nb)" \'(\''), ['w', 'w', 'w']);
  });
  it('lone & is an op, && and || unchanged, &> still unsupported', () => {
    assert.deepEqual(shape('sleep 1 &'), ['w', 'w', 'op&']);
    assert.deepEqual(shape('a && b || c'), ['w', 'op&&', 'w', 'op||', 'w']);
    assert.throws(() => toks('echo hi &> f'), /does not support &>/);
    assert.throws(() => toks('a |& b'), /does not support \|&/);
  });
  it('backslash-newline joins lines', () => {
    assert.deepEqual(toks('echo a\\\nb').map((t) => t.v), ['echo', 'ab']);
    assert.deepEqual(shape('echo a \\\n b'), ['w', 'w', 'w']);
  });
  it('comment runs to end of line only', () => assert.deepEqual(shape('a # x (\nb'), ['w', 'op\n', 'w']));
});

describe('tokenizer: here-documents', () => {
  const docOf = (s) => toks(s).find((t) => t.t === 'op' && (t.v === '<<' || t.v === '<<-'));
  it('captures the body up to the delimiter line', () => {
    const t = toks('cat <<EOF\nhello $USER\nEOF\n');
    const ops = t.filter((x) => x.doc);
    assert.equal(ops.length, 1);
    assert.deepEqual(ops[0].doc, { raw: 'hello $USER\n', quoted: false, strip: false, delim: 'EOF' });
    assert.deepEqual(shape('cat <<EOF\nhello $USER\nEOF\n'), ['w', 'op<<', 'w', 'op\n']);
  });
  it('quoted delimiter sets quoted', () => {
    assert.equal(docOf("cat <<'EOF'\n$x\nEOF\n").doc.quoted, true);
    assert.equal(docOf('cat <<"EOF"\n$x\nEOF\n').doc.delim, 'EOF');
    assert.equal(docOf('cat <<E\\OF\n$x\nEOF\n').doc.quoted, true);
  });
  it('<<- strips leading tabs', () => {
    const d = docOf('cat <<-EOF\n\t\ta\n\tb\n\tEOF\n').doc;
    assert.equal(d.raw, 'a\nb\n');
    assert.equal(d.strip, true);
    assert.equal(d.eof, undefined);
  });
  it('unterminated body runs to the end with eof=true', () => {
    const d = docOf('cat <<EOF\na\nb').doc;
    assert.equal(d.raw, 'a\nb\n');
    assert.equal(d.eof, true);
  });
  it('a single typed line has no body: eof=true', () => {
    const d = docOf('cat <<EOF').doc;
    assert.equal(d.raw, '');
    assert.equal(d.eof, true);
  });
  it('commands after the body line continue to tokenize', () => {
    assert.deepEqual(shape('cat <<EOF | wc -l\na\nEOF\necho done'), ['w', 'op<<', 'w', 'op|', 'w', 'w', 'op\n', 'w', 'w']);
  });
  it('two here-docs on one line read in order', () => {
    const ds = toks('cat <<A <<B\n1\nA\n2\nB\n').filter((t) => t.doc).map((t) => t.doc.raw);
    assert.deepEqual(ds, ['1\n', '2\n']);
  });
  it('<<< is a here-string op followed by one word', () => {
    assert.deepEqual(shape('cat <<< "hi there"'), ['w', 'op<<<', 'w']);
  });
  it('is linear on large input', () => {
    const body = 'x\n'.repeat(50000);
    const t0 = Date.now();
    const d = docOf('cat <<EOF\n' + body + 'EOF\n').doc;
    assert.equal(d.raw.length, body.length);
    assert.ok(Date.now() - t0 < 2000);
  });
});

describe('executor stays unchanged for the new tokens (until Tasks 5/6)', () => {
  it('<< and <<< still say unsupported', () => {
    assert.equal(run(loadShell(), 'cat <<< hi').out, 'this practice shell does not support <<< yet');
    assert.equal(run(loadShell(), 'cat << EOF').out, 'this practice shell does not support << yet');
  });
  it('typed ( ) and & do not crash', () => {
    const r = run(loadShell(), 'echo (a) b &');
    assert.ok(!/internal error/.test(r.out), r.out);
  });
});
