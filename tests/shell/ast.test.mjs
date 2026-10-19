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

describe('executor runs the new tokens (Task 6a)', () => {
  it('<< and <<< feed stdin', () => {
    assert.equal(run(loadShell(), 'cat <<< hi').out, 'hi');
    assert.equal(run(loadShell(), 'cat << EOF').out, "bash: warning: here-document delimited by end-of-file (wanted 'EOF')");
  });
  it('typed ( ) and & do not crash', () => {
    const r = run(loadShell(), 'echo (a) b &');
    assert.ok(!/internal error/.test(r.out), r.out);
  });
});

// ---- AST parser (Stage 2, Task 5) ----
const P = (s) => JSON.parse(JSON.stringify(SQ.parseProgram(s)));
const err = (s) => { try { SQ.parseProgram(s); } catch (e) { return e; } assert.fail('expected a syntax error for ' + JSON.stringify(s)); };
const first = (s) => P(s).items[0].andor.first.cmds[0];
const synErr = (s, msg) => { const e = err(s); assert.equal(e.message, msg); assert.equal(e.code, 2); assert.equal(e.raw, false); };
const words = (n) => n.words.map((w) => w.v);

describe('parseProgram: lists, and-or, pipelines', () => {
  it('echo a; echo b -> list of 2', () => {
    const l = P('echo a; echo b');
    assert.equal(l.type, 'list');
    assert.equal(l.items.length, 2);
    assert.deepEqual(l.items.map((i) => i.sep), [';', ';']);
    assert.equal(l.src, 'echo a; echo b');
    assert.equal(l.items[1].andor.src, 'echo b');
  });
  it('newline separators, blank lines and comments', () => {
    const l = P('# hi\n\necho a # c\n\n\necho b\n');
    assert.equal(l.items.length, 2);
    assert.equal(l.items[0].sep, '\n');
  });
  it('empty program is an empty list', () => assert.deepEqual(P('  \n# x\n').items, []));
  it('a && b || c -> one andor, 2 rest', () => {
    const a = P('a && b || c').items[0].andor;
    assert.equal(a.type, 'andor');
    assert.deepEqual(a.rest.map((r) => r.op), ['&&', '||']);
    assert.equal(a.rest[1].pipe.cmds[0].words[0].v, 'c');
  });
  it('a | b | c -> 3 cmds', () => {
    const p = P('a | b | c').items[0].andor.first;
    assert.equal(p.type, 'pipeline');
    assert.equal(p.cmds.length, 3);
    assert.equal(p.negate, false);
  });
  it('! false negates', () => {
    const p = P('! false').items[0].andor.first;
    assert.equal(p.negate, true);
    assert.deepEqual(words(p.cmds[0]), ['false']);
  });
  it('newlines allowed after && || |', () => {
    assert.equal(P('a &&\n b ||\n\n c |\n d').items[0].andor.rest.length, 2);
  });
});

describe('parseProgram: simple commands and redirects', () => {
  it('words and redirects keep parse() shapes', () => {
    const c = first('cat a >o 2>e <i');
    assert.equal(c.type, 'simple');
    assert.deepEqual(words(c), ['cat', 'a']);
    assert.equal(c.out.path, 'o');
    assert.equal(c.out.append, false);
    assert.equal(c.out.w.raw, 'o');
    assert.equal(c.err.path, 'e');
    assert.equal(c.inp.v, 'i');
    assert.equal(c.doc, null);
    assert.equal(c.herestr, null);
  });
  it('>> 2>> 2>&1', () => {
    const c = first('x >> o 2>> e');
    assert.equal(c.out.append, true);
    assert.equal(c.err.append, true);
    assert.deepEqual(first('x 2>&1').err, { dup: true });
  });
  it('here-doc and here-string', () => {
    const c = first('cat <<EOF\nhi $X\nEOF\n');
    assert.equal(c.doc.raw, 'hi $X\n');
    assert.deepEqual(words(c), ['cat']);
    const h = first('cat <<< "a b"');
    assert.equal(h.herestr.v, 'a b');
    assert.equal(h.doc, null);
  });
  it('here-doc then more commands', () => {
    const l = P('cat <<EOF | wc -l\na\nEOF\necho done');
    assert.equal(l.items.length, 2);
    assert.equal(l.items[0].andor.first.cmds.length, 2);
  });
  it('redirect only command', () => assert.equal(first('> f').out.path, 'f'));
  it('reserved words are ordinary words outside command position', () => {
    assert.deepEqual(words(first('echo if then do done in fi { }')), ['echo', 'if', 'then', 'do', 'done', 'in', 'fi', '{', '}']);
    assert.deepEqual(words(first('echo "if" ; ')), ['echo', 'if']);
  });
  it('quoted reserved word at command position is a command', () => {
    assert.equal(first('"if" x').type, 'simple');
  });
  it('assignment prefix words stay words', () => assert.deepEqual(words(first('X=1 Y=2 cmd')), ['X=1', 'Y=2', 'cmd']));
  it('nothing in a redirect target is a syntax error', () => {
    synErr('echo >', "syntax error near unexpected token 'newline'");
    synErr('echo > ;', "syntax error near unexpected token ';'");
  });
});

describe('parseProgram: compound commands', () => {
  it('if / elif / else', () => {
    const n = first('if x; then y; elif z; then w; else v; fi');
    assert.equal(n.type, 'if');
    assert.equal(n.branches.length, 2);
    assert.equal(n.branches[0].cond.items[0].andor.src, 'x');
    assert.equal(n.branches[1].body.items[0].andor.src, 'w');
    assert.equal(n.else.items[0].andor.src, 'v');
    assert.deepEqual(n.redirs, { out: null, inp: null, err: null, doc: null, herestr: null });
    assert.equal(n.src, 'if x; then y; elif z; then w; else v; fi');
  });
  it('if without else has else:null; multi-line', () => {
    const n = first('if x\nthen\n  y\n  z\nfi');
    assert.equal(n.else, null);
    assert.equal(n.branches[0].body.items.length, 2);
  });
  it('while multi-line', () => {
    const n = first('while test $i -lt 3\ndo\n  echo $i\n  i=$((i+1))\ndone');
    assert.equal(n.type, 'while');
    assert.equal(n.body.items.length, 2);
    assert.equal(n.cond.items.length, 1);
  });
  it('until', () => {
    const n = first('until x; do y; done');
    assert.equal(n.type, 'until');
  });
  it('for with list', () => {
    const n = first('for i in 1 2 3; do echo $i; done');
    assert.equal(n.type, 'for');
    assert.equal(n.var, 'i');
    assert.deepEqual(n.words.map((w) => w.v), ['1', '2', '3']);
    assert.equal(n.body.items.length, 1);
  });
  it('for without in -> words:null; empty list', () => {
    assert.equal(first('for i; do echo $i; done').words, null);
    assert.equal(first('for i\ndo echo $i; done').words, null);
    assert.deepEqual(first('for i in; do :; done').words, []);
    assert.equal(first('for i in a\ndo\n:\ndone').words.length, 1);
  });
  it('case with alternatives', () => {
    const n = first('case $x in a|b) echo ab;; *) echo other;; esac');
    assert.equal(n.type, 'case');
    assert.equal(n.word.raw, '$x');
    assert.equal(n.arms.length, 2);
    assert.deepEqual(n.arms[0].patterns.map((t) => t.v), ['a', 'b']);
    assert.deepEqual(n.arms[1].patterns.map((t) => t.v), ['*']);
    assert.equal(n.arms[1].body.items[0].andor.src, 'echo other');
  });
  it('case multi-line, optional ( , last arm without ;;, empty arm', () => {
    const n = first('case x in\n  (a) echo 1\n  ;;\n  b) ;;\n  c) echo 3\nesac');
    assert.equal(n.arms.length, 3);
    assert.equal(n.arms[1].body.items.length, 0);
    assert.equal(n.arms[2].body.items.length, 1);
    assert.equal(first('case x in esac').arms.length, 0);
  });
  it('group { a; b; }', () => {
    const n = first('{ a; b; }');
    assert.equal(n.type, 'group');
    assert.equal(n.body.items.length, 2);
  });
  it('group with newline after {', () => assert.equal(first('{\n a\n b\n}').body.items.length, 2));
  it('subshell ( a; b )', () => {
    const n = first('( a; b )');
    assert.equal(n.type, 'subshell');
    assert.equal(n.body.items.length, 2);
    assert.equal(first('(a)').body.items.length, 1);
  });
  it('nested subshell ( (a); (b) ) is not arithmetic', () => {
    const n = first('( (a); (b) )');
    assert.equal(n.type, 'subshell');
    assert.equal(n.body.items.length, 2);
    assert.equal(first('((a); (b))').type, 'subshell');
  });
  it('(( expr )) arithmetic command', () => {
    const n = first('(( i+1 ))');
    assert.deepEqual([n.type, n.expr], ['arith', 'i+1']);
    assert.equal(first('((i=(1+2)*3))').expr, 'i=(1+2)*3');
    assert.equal(first('(( a < b && c ))').expr, 'a < b && c');
  });
  it('[[ ]] keeps the raw inner text', () => {
    const n = first('[[ -f x && -n y ]]');
    assert.deepEqual([n.type, n.raw], ['cond', '-f x && -n y']);
    assert.equal(first('[[ $a == "x y" ]] && echo').type, 'cond');
    assert.equal(P('[[ a ]] && echo hi').items[0].andor.rest.length, 1);
  });
  it('function definitions', () => {
    const f = first('f() { echo hi; }');
    assert.equal(f.type, 'func');
    assert.equal(f.name, 'f');
    assert.equal(f.body.type, 'group');
    assert.equal(f.src, 'f() { echo hi; }');
    const g = first('function g { echo hi; }');
    assert.deepEqual([g.type, g.name, g.body.type], ['func', 'g', 'group']);
    assert.equal(g.src, 'function g { echo hi; }');
    assert.equal(first('h ()\n{\n echo; }').name, 'h');
    assert.equal(first('function k() { :; }').name, 'k');
  });
  it('function src inside a longer program', () => {
    const l = P('echo a\nf() { echo hi; }\nf');
    assert.equal(l.items[1].andor.first.cmds[0].src, 'f() { echo hi; }');
    assert.equal(l.items[2].andor.src, 'f');
  });
  it('redirects and pipes after a compound', () => {
    const w = first('while read x; do echo $x; done < file');
    assert.equal(w.redirs.inp.v, 'file');
    assert.equal(w.src, 'while read x; do echo $x; done < file');
    const p = P('if x; then y; fi | cat').items[0].andor.first;
    assert.equal(p.cmds.length, 2);
    assert.equal(p.cmds[0].type, 'if');
    const g = first('{ a; } > out 2>&1');
    assert.equal(g.redirs.out.path, 'out');
    assert.deepEqual(g.redirs.err, { dup: true });
    assert.equal(first('for i in 1; do :; done <<< hi').redirs.herestr.v, 'hi');
  });
  it('newlines allowed after then, do, else, {', () => {
    assert.ok(P('if a; then\n\nb\nelse\n\nc\nfi'));
    assert.ok(P('for i in 1; do\n\n echo\n\ndone'));
    assert.ok(P('{\n\n echo\n\n}'));
  });
  it('compound inside compound, and-or inside body', () => {
    const n = first('for i in 1 2; do if [ $i = 1 ]; then echo one; fi; done');
    assert.equal(n.body.items[0].andor.first.cmds[0].type, 'if');
    const t = first('if a && b || c; then d; fi');
    assert.equal(t.branches[0].cond.items[0].andor.rest.length, 2);
  });
  it('heredoc inside a compound body', () => {
    const n = first('if x; then\n cat <<EOF\nhi\nEOF\nfi');
    assert.equal(n.branches[0].body.items[0].andor.first.cmds[0].doc.raw, 'hi\n');
  });
});

describe('parseProgram: syntax errors', () => {
  const EOF = 'syntax error: unexpected end of file';
  const tok = (t) => `syntax error near unexpected token '${t}'`;
  it('unexpected end of file', () => {
    synErr('if x; then y', EOF);
    synErr('if x; then y;', EOF);
    synErr('while x; do', EOF);
    synErr('for i in 1 2; do echo', EOF);
    synErr('{ a;', EOF);
    synErr('( a', EOF);
    synErr('case x in a) ;;', EOF);
    synErr('case x in a) echo', EOF);
    synErr('f() {', EOF);
    synErr('a &&', EOF);
    synErr('a ||\n', EOF);
    synErr('a |', EOF);
    synErr('! ', EOF);
    synErr('[[ a', EOF);
    synErr('(( 1', EOF);
    synErr('{ echo a }', EOF);
  });
  it('unexpected token', () => {
    synErr('done', tok('done'));
    synErr('echo a;; echo b', tok(';;'));
    synErr(')', tok(')'));
    synErr('}', tok('}'));
    synErr('then', tok('then'));
    synErr('fi', tok('fi'));
    synErr('else', tok('else'));
    synErr('esac', tok('esac'));
    synErr('do', tok('do'));
    synErr('; echo', tok(';'));
    synErr('a | | b', tok('|'));
    synErr('a && && b', tok('&&'));
    synErr('echo a ( b', tok('('));
    synErr('if x; then fi', tok('fi'));
    synErr('if x; fi', tok('fi'));
    synErr('while x; do done', tok('done'));
    synErr('{ }', tok('}'));
    synErr('( )', tok(')'));
    synErr('for i in 1; echo; done', tok('echo'));
    synErr('if x; then y; fi echo', tok('echo'));
    synErr('for 1x in a; do :; done', tok('1x'));
    synErr('case x in a) echo; esac done', tok('done'));
    synErr('case x a) ;; esac', tok('a'));
    synErr('f() echo', tok('echo'));
    synErr('echo a\n)', tok(')'));
  });
  it('unsupported & and arrays and select', () => {
    for (const s of ['echo hi &', 'a & b', 'a &\nb', '{ a & }', 'if x; then y & fi']) {
      const e = err(s);
      assert.equal(e.message, 'this practice shell does not support & yet', s);
      assert.equal(e.code, 2);
    }
    const a = err('arr=(1 2)');
    assert.equal(a.message, 'this practice shell does not support arrays yet');
    assert.equal(a.code, 2);
    assert.equal(err('echo x; declare -a b=(1)').message, 'this practice shell does not support arrays yet');
    assert.equal(err('select x in a b; do echo; done').message, 'this practice shell does not support select yet');
  });
  it('tokenizer errors pass through', () => {
    assert.throws(() => SQ.parseProgram("echo 'x"), /unclosed '/);
    assert.throws(() => SQ.parseProgram('a |& b'), /does not support \|&/);
  });
});

describe('parseProgram: limits', () => {
  it('nesting depth cap, no stack overflow', () => {
    const deep = (n) => '('.repeat(n) + 'x' + ')'.repeat(n);
    assert.ok(P('{ '.repeat(50) + 'x;' + ' }'.repeat(50)));
    const e = err('{ '.repeat(101) + 'x;' + ' }'.repeat(101));
    assert.equal(e.message, 'syntax error: nesting too deep');
    assert.equal(e.code, 2);
    assert.equal(e.raw, false);
    assert.equal(err('if a; then '.repeat(5000)).message, 'syntax error: nesting too deep');
    assert.equal(err(deep(1000).replace(/\(/g, '( ')).message, 'syntax error: nesting too deep');
    assert.equal(err('( '.repeat(500)).message, 'syntax error: nesting too deep');
  });
  it('very long flat programs parse in linear time', () => {
    const t0 = Date.now();
    const l = P('echo a; '.repeat(2000) + 'echo z');
    assert.equal(l.items.length, 2001);
    assert.ok(Date.now() - t0 < 2000);
  });
  it('token cap', () => {
    const e = err('a '.repeat(30000));
    assert.equal(e.message, 'syntax error: program too large');
    assert.equal(e.code, 2);
  });
});

describe('parseProgram: (( )) and [[ ]] are raw spans', () => {
  it('<< inside (( )) does not swallow following lines', () => {
    const l = P('(( x<<2 ))\necho hi\necho there');
    assert.equal(l.items.length, 3);
    assert.deepEqual([l.items[0].andor.first.cmds[0].type, l.items[0].andor.first.cmds[0].expr], ['arith', 'x<<2']);
    assert.equal(l.items[2].andor.src, 'echo there');
  });
  it('<< inside [[ ]] does not swallow following lines', () => {
    const l = P('[[ x<<y ]]\necho hi\necho there');
    assert.equal(l.items.length, 3);
    assert.equal(l.items[0].andor.first.cmds[0].raw, 'x<<y');
  });
  it('>> and < inside spans', () => {
    assert.equal(first('(( x>>2 ))').expr, 'x>>2');
    assert.equal(first('[[ a < b ]]').raw, 'a < b');
  });
  it('parens and quotes inside [[ ]]', () => {
    assert.equal(first('[[ $x == "a b" && ( -n y ) ]]').raw, '$x == "a b" && ( -n y )');
    assert.equal(first('[[ "]]" == x ]]').raw, '"]]" == x');
  });
  it('here-doc after a span still works', () => {
    const l = P('(( 1 )) && cat <<EOF\nhi\nEOF\necho z');
    assert.equal(l.items.length, 2);
    assert.equal(l.items[0].andor.rest[0].pipe.cmds[0].doc.raw, 'hi\n');
  });
  it('span after then/do/!/&&, but not as an argument', () => {
    assert.equal(first('if (( x<<1 )); then :; fi').branches[0].cond.items[0].andor.first.cmds[0].type, 'arith');
    assert.equal(P('echo [[ a ]]').items[0].andor.first.cmds[0].type, 'simple');
  });
  it('((a); (b)) is still a subshell; unterminated spans are EOF errors', () => {
    assert.equal(first('((a); (b))').type, 'subshell');
    synErr('(( x<<2', 'syntax error: unexpected end of file');
    synErr('[[ a', 'syntax error: unexpected end of file');
  });
  it('! ! x toggles negate', () => {
    assert.equal(P('! ! x').items[0].andor.first.negate, false);
    assert.equal(P('! ! ! x').items[0].andor.first.negate, true);
  });
});

describe('parseProgram: unterminated spans stay linear', () => {
  const timed = (s) => { const t0 = Date.now(); const e = err(s); assert.ok(Date.now() - t0 < 500, 'slow: ' + (Date.now() - t0) + 'ms'); return e; };
  it("'(( ' x 40000", () => assert.match(timed('(( '.repeat(40000)).message, /unexpected end of file|nesting too deep|program too large/));
  it('(( a newline x 5000', () => assert.equal(timed('(( a\n'.repeat(5000)).message, 'syntax error: unexpected end of file'));
  it("'[[ ' x 40000 and unterminated quotes", () => {
    timed('[[ '.repeat(40000));
    timed('(( "a\n'.repeat(5000));
  });
  it('tokenizer alone is linear too', () => {
    const t0 = Date.now(); SQ.tokenize('(( '.repeat(40000), { dry: true, pos: true });
    assert.ok(Date.now() - t0 < 500);
  });
});
