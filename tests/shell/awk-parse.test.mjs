// SQ.awkParse: the awk lexer and parser (Task 8). Node shapes are documented in engine/awk-parse.js.
// Grammar corner cases were checked against mawk 1.3.4 (and POSIX/gawk where mawk differs; the test says so).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell } from './harness.mjs';

const SQ = loadShell();
/* JSON round trip: drops `line` fields and the vm realm's prototypes so deepEqual compares shapes only */
const strip = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'line' ? undefined : v)));
const parse = (src) => strip(SQ.awkParse(src));
/* the statements of a single BEGIN block, and the expression of a single expression statement */
const stmts = (body) => parse(`BEGIN { ${body} }`).begin[0];
const ex = (e) => {
  const s = stmts(e);
  assert.equal(s.length, 1);
  assert.equal(s[0].type, 'expr');
  return s[0].expr;
};
const N = (value) => ({ type: 'num', value });
const S = (value) => ({ type: 'str', value });
const V = (name) => ({ type: 'var', name });
const F = (expr) => ({ type: 'field', expr });
const B = (op, left, right) => ({ type: 'binary', op, left, right });
const C = (left, right) => ({ type: 'concat', left, right });
const U = (op, expr) => ({ type: 'unary', op, expr });
const R = (source) => ({ type: 'regex', source });
const A = (target, value, op = '=') => ({ type: 'assign', op, target, value });
const P = (...args) => ({ type: 'print', args });
const X = (expr) => ({ type: 'expr', expr });

/* the thrown error: an Error with awkErr, code 2 and the message */
function err(src) {
  try {
    SQ.awkParse(src);
  } catch (e) {
    assert.equal(Object.prototype.toString.call(e), '[object Error]', 'an Error, not ' + e);
    assert.equal(e.awkErr, true, 'awkErr: ' + e.message);
    assert.equal(e.code, 2);
    return e.message;
  }
  assert.fail('no error for ' + JSON.stringify(src));
}
const unsup = (x) => `this practice shell does not support awk ${x} yet`;
const syntax = (src) => assert.match(err(src), /^awk: syntax error at source line \d+\n context is /, src);

describe('program shape', () => {
  it('BEGIN, END, rules, ranges and functions', () => {
    const p = parse('BEGIN { x = 1 }\n/re/ { print }\nNR==1, NR==3\nEND { print 2 }\nfunction f(a, b) { return a + b }\nBEGIN { }');
    assert.deepEqual(p.begin, [[X(A(V('x'), N(1)))], []]);
    assert.deepEqual(p.end, [[P(N(2))]]);
    assert.deepEqual(p.rules, [
      { pat: R('re'), pat2: null, action: [P()] },
      { pat: { type: 'compare', op: '==', left: V('NR'), right: N(1) }, pat2: { type: 'compare', op: '==', left: V('NR'), right: N(3) }, action: null },
    ]);
    assert.deepEqual(p.funcs, { f: { name: 'f', params: ['a', 'b'], body: [{ type: 'return', value: B('+', V('a'), V('b')) }] } });
  });
  it('an action-only rule has pat null; an empty program is empty', () => {
    assert.deepEqual(parse('{ print $1 }').rules, [{ pat: null, pat2: null, action: [P(F(N(1)))] }]);
    assert.deepEqual(parse(''), { begin: [], end: [], rules: [], funcs: {} });
    assert.deepEqual(parse(' \n# just a comment\n;\n'), { begin: [], end: [], rules: [], funcs: {} });
  });
  it('statements and rules carry their source line', () => {
    const p = SQ.awkParse('BEGIN {\n  x = 1\n\n  print x\n}\n\nNR > 1 { next }');
    assert.deepEqual([...p.begin[0].map((s) => s.line)], [2, 4]);
    assert.equal(p.rules[0].line, 7);
    assert.equal(p.rules[0].action[0].line, 7);
  });
  it('func is accepted as a synonym for function', () => {
    assert.deepEqual(parse('func g() { return }').funcs.g, { name: 'g', params: [], body: [{ type: 'return', value: null }] });
  });
});

describe('statements', () => {
  it('print and printf', () => {
    assert.deepEqual(stmts('print'), [P()]);
    assert.deepEqual(stmts('print a, b'), [P(V('a'), V('b'))]);
    assert.deepEqual(stmts('print (a, b)'), [P(V('a'), V('b'))]);
    assert.deepEqual(stmts('print (a)(b)'), [P(C(V('a'), V('b')))]);
    assert.deepEqual(stmts('print (a > b)'), [P({ type: 'compare', op: '>', left: V('a'), right: V('b') })]);
    assert.deepEqual(stmts('printf "%d\\n", x'), [{ type: 'printf', args: [S('%d\n'), V('x')] }]);
    assert.deepEqual(stmts('printf("%s-%s", 1, 2)'), [{ type: 'printf', args: [S('%s-%s'), N(1), N(2)] }]);
  });
  it('if / else, while, do / while, for, for in', () => {
    assert.deepEqual(stmts('if (x) print 1; else print 2'), [{ type: 'if', test: V('x'), then: [P(N(1))], else: [P(N(2))] }]);
    assert.deepEqual(stmts('if (x) { print 1 }'), [{ type: 'if', test: V('x'), then: [P(N(1))], else: null }]);
    assert.deepEqual(stmts('if (x) ; else { }'), [{ type: 'if', test: V('x'), then: [], else: [] }]);
    assert.deepEqual(stmts('while (i < 3) i++'), [{ type: 'while', test: { type: 'compare', op: '<', left: V('i'), right: N(3) }, body: [X({ type: 'incdec', op: '++', prefix: false, target: V('i') })] }]);
    assert.deepEqual(stmts('do { x-- } while (x)'), [{ type: 'do', body: [X({ type: 'incdec', op: '--', prefix: false, target: V('x') })], test: V('x') }]);
    assert.deepEqual(stmts('for (i = 0; i < n; i++) s += i'), [{
      type: 'for', init: A(V('i'), N(0)), test: { type: 'compare', op: '<', left: V('i'), right: V('n') },
      step: { type: 'incdec', op: '++', prefix: false, target: V('i') }, body: [X(A(V('s'), V('i'), '+='))],
    }]);
    assert.deepEqual(stmts('for (;;) break'), [{ type: 'for', init: null, test: null, step: null, body: [{ type: 'break' }] }]);
    assert.deepEqual(stmts('for (k in a) { delete a[k]; continue }'), [{ type: 'forin', var: 'k', name: 'a', body: [
      { type: 'delete', name: 'a', subs: [V('k')] }, { type: 'continue' }] }]);
  });
  it('delete, exit, return, next, blocks and expression statements', () => {
    assert.deepEqual(stmts('delete a; delete a[1, 2]'), [{ type: 'delete', name: 'a', subs: null }, { type: 'delete', name: 'a', subs: [N(1), N(2)] }]);
    assert.deepEqual(stmts('exit; exit 3'), [{ type: 'exit', value: null }, { type: 'exit', value: N(3) }]);
    assert.deepEqual(parse('{ next }').rules[0].action, [{ type: 'next' }]);
    assert.deepEqual(parse('function f() { return x * 2 }').funcs.f.body, [{ type: 'return', value: B('*', V('x'), N(2)) }]);
    assert.deepEqual(stmts('{ x; { y } }'), [{ type: 'block', body: [X(V('x')), { type: 'block', body: [X(V('y'))] }] }]);
  });
});

describe('expressions', () => {
  it('literals: numbers, strings with escapes, regexes', () => {
    assert.deepEqual(ex('x = 12 + 1.5 + .5 + 1e3 + 2E-1 + 1.'), A(V('x'),
      B('+', B('+', B('+', B('+', B('+', N(12), N(1.5)), N(0.5)), N(1000)), N(0.2)), N(1))));
    assert.deepEqual(ex('x = "a\\tb\\"c\\\\d\\/e\\101\\nf\\qg"'), A(V('x'), S('a\tb"c\\d/eA\nf\\qg')));
    assert.deepEqual(ex('x = /a\\/b[/]\\.c/'), A(V('x'), R('a/b[/]\\.c')));
    assert.deepEqual(ex('x = "a\\\nb"'), A(V('x'), S('ab')), 'backslash-newline inside a string is a continuation');
  });
  it('variables, fields, arrays, ++/--, compound assignment', () => {
    assert.deepEqual(ex('a[i, j] = $3'), A({ type: 'index', name: 'a', subs: [V('i'), V('j')] }, F(N(3))));
    for (const op of ['+=', '-=', '*=', '/=', '%=', '^=']) assert.deepEqual(ex(`x ${op} 2`), A(V('x'), N(2), op));
    assert.deepEqual(ex('x **= 2'), A(V('x'), N(2), '^='), '**= is ^=');
    assert.deepEqual(ex('x = y = 3'), A(V('x'), A(V('y'), N(3))), 'right associative');
    assert.deepEqual(ex('++a[1]'), { type: 'incdec', op: '++', prefix: true, target: { type: 'index', name: 'a', subs: [N(1)] } });
    assert.deepEqual(ex('$2--'), { type: 'incdec', op: '--', prefix: false, target: F(N(2)) });
  });
  it('ternary, ||, &&, in, (a, b) in arr, ~ and !~', () => {
    assert.deepEqual(ex('x = a ? b : c ? d : e'), A(V('x'), { type: 'cond', test: V('a'), yes: V('b'), no: { type: 'cond', test: V('c'), yes: V('d'), no: V('e') } }));
    assert.deepEqual(ex('a || b && c'), { type: 'logical', op: '||', left: V('a'), right: { type: 'logical', op: '&&', left: V('b'), right: V('c') } });
    assert.deepEqual(ex('k in arr'), { type: 'in', subs: [V('k')], name: 'arr' });
    assert.deepEqual(ex('(i, j) in arr'), { type: 'in', subs: [V('i'), V('j')], name: 'arr' });
    assert.deepEqual(ex('$1 ~ /x/'), { type: 'match', op: '~', left: F(N(1)), right: R('x') });
    assert.deepEqual(ex('$1 !~ "y"'), { type: 'match', op: '!~', left: F(N(1)), right: S('y') });
  });
  it('builtin and user function calls; length without parentheses', () => {
    assert.deepEqual(ex('substr($0, 2)'), { type: 'call', name: 'substr', builtin: true, args: [F(N(0)), N(2)] });
    assert.deepEqual(ex('substr ("abc", 2)'), { type: 'call', name: 'substr', builtin: true, args: [S('abc'), N(2)] }, 'a space is allowed after a builtin');
    assert.deepEqual(ex('x = length'), A(V('x'), { type: 'call', name: 'length', builtin: true, args: [] }));
    assert.deepEqual(ex('x = length $1'), A(V('x'), C({ type: 'call', name: 'length', builtin: true, args: [] }, F(N(1)))), 'mawk: length $1 is length concatenated with $1');
    assert.deepEqual(ex('split(s, parts, /,/)'), { type: 'call', name: 'split', builtin: true, args: [V('s'), V('parts'), R(',')] });
    assert.deepEqual(parse('function f(a) { return a } BEGIN { f(1) }').begin[0], [X({ type: 'call', name: 'f', builtin: false, args: [N(1)] })]);
    assert.deepEqual(parse('function f(a) { return a } BEGIN { f (1) }').begin[0], [X({ type: 'call', name: 'f', builtin: false, args: [N(1)] })],
      'mawk accepts a space before ( for a defined function');
    assert.deepEqual(parse('BEGIN { f() } function f() { }').begin[0], [X({ type: 'call', name: 'f', builtin: false, args: [] })], 'defined later');
  });
});

describe('precedence (checked against mawk)', () => {
  it('a b is concatenation, a - b and a -b are subtraction, a " " -1 is a (" " - 1)', () => {
    assert.deepEqual(ex('x = a b'), A(V('x'), C(V('a'), V('b'))));
    assert.deepEqual(ex('x = a - b'), A(V('x'), B('-', V('a'), V('b'))));
    assert.deepEqual(ex('x = a -b'), A(V('x'), B('-', V('a'), V('b'))));
    assert.deepEqual(ex('x = a " " -1'), A(V('x'), C(V('a'), B('-', S(' '), N(1)))));
    assert.deepEqual(ex('x = 1 " " 2 + 3'), A(V('x'), C(C(N(1), S(' ')), B('+', N(2), N(3)))));
    assert.deepEqual(ex('x = a b c'), A(V('x'), C(C(V('a'), V('b')), V('c'))), 'left associative');
    assert.deepEqual(ex('x = 1 !y'), A(V('x'), C(N(1), U('!', V('y')))), 'mawk prints 11');
  });
  it('$NF-1 is ($NF)-1, $i++ is ($i)++, $++i, $-1, $$0, $x^2', () => {
    assert.deepEqual(ex('x = $NF-1'), A(V('x'), B('-', F(V('NF')), N(1))));
    assert.deepEqual(ex('$i++'), { type: 'incdec', op: '++', prefix: false, target: F(V('i')) });
    assert.deepEqual(ex('x = $++i'), A(V('x'), F({ type: 'incdec', op: '++', prefix: true, target: V('i') })));
    assert.deepEqual(ex('x = $-1'), A(V('x'), F(U('-', N(1)))));
    assert.deepEqual(ex('x = $$0'), A(V('x'), F(F(N(0)))));
    assert.deepEqual(ex('x = $x^2'), A(V('x'), B('^', F(V('x')), N(2))));
  });
  it('!x++ is !(x++); unary minus is below ^; ^ and ** are right associative', () => {
    assert.deepEqual(ex('y = !x++'), A(V('y'), U('!', { type: 'incdec', op: '++', prefix: false, target: V('x') })));
    assert.deepEqual(ex('y = -2^2'), A(V('y'), U('-', B('^', N(2), N(2)))));
    assert.deepEqual(ex('y = 2^3^2'), A(V('y'), B('^', N(2), B('^', N(3), N(2)))));
    assert.deepEqual(ex('y = 2**3**2'), A(V('y'), B('^', N(2), B('^', N(3), N(2)))));
    assert.deepEqual(ex('y = 2^-1'), A(V('y'), B('^', N(2), U('-', N(1)))));
    assert.deepEqual(ex('y = - - 1'), A(V('y'), U('-', U('-', N(1)))));
    assert.deepEqual(ex('y = !1 + 1'), A(V('y'), B('+', U('!', N(1)), N(1))));
  });
  it('! binds tighter than ~; ~ is below comparison; in sits with the comparisons (mawk)', () => {
    assert.deepEqual(ex('y = !x ~ "1"'), A(V('y'), { type: 'match', op: '~', left: U('!', V('x')), right: S('1') }));
    assert.deepEqual(ex('y = "a" ~ "b" == 0'), A(V('y'), { type: 'match', op: '~', left: S('a'), right: { type: 'compare', op: '==', left: S('b'), right: N(0) } }));
    assert.deepEqual(ex('y = 1 in a == 0'), A(V('y'), { type: 'compare', op: '==', left: { type: 'in', subs: [N(1)], name: 'a' }, right: N(0) }));
    assert.deepEqual(ex('y = 0 < 2 in a'), A(V('y'), { type: 'in', subs: [{ type: 'compare', op: '<', left: N(0), right: N(2) }], name: 'a' }));
    assert.deepEqual(ex('y = "a" "b" in a'), A(V('y'), { type: 'in', subs: [C(S('a'), S('b'))], name: 'a' }));
    assert.deepEqual(ex('y = 1 < 2 < 3'), A(V('y'), { type: 'compare', op: '<', left: { type: 'compare', op: '<', left: N(1), right: N(2) }, right: N(3) }), 'mawk: left associative');
    assert.deepEqual(ex('y = a ~ b ? c : d'), A(V('y'), { type: 'cond', test: { type: 'match', op: '~', left: V('a'), right: V('b') }, yes: V('c'), no: V('d') }));
  });
  it('only a whole lvalue can be assigned (mawk: 1 + x = 3 and -x = 3 are syntax errors)', () => {
    syntax('BEGIN { print 1 + x = 3 }');
    syntax('BEGIN { -x = 3 }');
    syntax('BEGIN { 3 = x }');
    syntax('BEGIN { x++ = 1 }');
  });
});

describe('regex versus division', () => {
  it('a / b / c divides; /re/ in operand position is a regex', () => {
    assert.deepEqual(ex('x = a / b / c'), A(V('x'), B('/', B('/', V('a'), V('b')), V('c'))));
    assert.deepEqual(ex('x = 4 /2/ 1'), A(V('x'), B('/', B('/', N(4), N(2)), N(1))));
    assert.deepEqual(ex('x = (1) /2/ 1'), A(V('x'), B('/', B('/', N(1), N(2)), N(1))));
    assert.deepEqual(ex('x = a[1] / 2'), A(V('x'), B('/', { type: 'index', name: 'a', subs: [N(1)] }, N(2))));
    assert.deepEqual(ex('x = "8" / 2'), A(V('x'), B('/', S('8'), N(2))));
    assert.deepEqual(ex('x = /a/ ~ /b/'), A(V('x'), { type: 'match', op: '~', left: R('a'), right: R('b') }));
    assert.deepEqual(ex('x = i++ / 2'), A(V('x'), B('/', { type: 'incdec', op: '++', prefix: false, target: V('i') }, N(2))));
    assert.deepEqual(ex('x = length / 2'), A(V('x'), B('/', { type: 'call', name: 'length', builtin: true, args: [] }, N(2))));
    assert.deepEqual(stmts('print /x/'), [P(R('x'))]);
  });
  it('/= is a regex at the start of a rule and an operator after an operand', () => {
    assert.deepEqual(parse('/=/').rules[0].pat, R('='));
    assert.deepEqual(parse('/=x/ { }').rules[0].pat, R('=x'));
    assert.deepEqual(ex('a /= 2'), A(V('a'), N(2), '/='));
  });
});

describe('newlines, semicolons, comments and continuation', () => {
  it('} closes a statement and ; is optional', () => {
    assert.deepEqual(stmts('x = 1'), [X(A(V('x'), N(1)))]);
    assert.deepEqual(stmts('x = 1\ny = 2'), [X(A(V('x'), N(1))), X(A(V('y'), N(2)))]);
    assert.deepEqual(stmts('x = 1;;; y = 2;'), [X(A(V('x'), N(1))), X(A(V('y'), N(2)))]);
    syntax('BEGIN { x = 1 y = 2 }');
  });
  it('rules may be separated by ; or nothing after }, but a pattern ends at a newline', () => {
    assert.equal(parse('BEGIN { x = 1 } ; { print }').rules.length, 1);
    assert.equal(parse('BEGIN{print 1}{print 2} {print 3}').rules.length, 2);
    assert.deepEqual(parse('NR==1;NR==2').rules.map((r) => r.action), [null, null]);
    assert.deepEqual(parse('NR==1\n{ print "a" }').rules.map((r) => r.pat && r.pat.type), ['compare', null]);
    assert.deepEqual(parse('NR==1,\nNR==3').rules[0].pat2, { type: 'compare', op: '==', left: V('NR'), right: N(3) });
  });
  it('newlines are allowed after && || , { else do and the ) of if/while/for, not after binary operators', () => {
    assert.deepEqual(ex('x = a &&\n b ||\n c'), A(V('x'), { type: 'logical', op: '||', left: { type: 'logical', op: '&&', left: V('a'), right: V('b') }, right: V('c') }));
    assert.deepEqual(stmts('print 1,\n 2'), [P(N(1), N(2))]);
    assert.deepEqual(stmts('print (1,\n 2)'), [P(N(1), N(2))]);
    assert.deepEqual(stmts('if (x)\n\n print 1\n else\n print 2'), [{ type: 'if', test: V('x'), then: [P(N(1))], else: [P(N(2))] }]);
    assert.deepEqual(stmts('do\n print 1\n while (0)'), [{ type: 'do', body: [P(N(1))], test: N(0) }]);
    assert.deepEqual(stmts('do print 1; while (0)'), [{ type: 'do', body: [P(N(1))], test: N(0) }]);
    assert.deepEqual(stmts('while (0)\n print 1; print 2'), [{ type: 'while', test: N(0), body: [P(N(1))] }, P(N(2))]);
    assert.deepEqual(parse('function f(a,\n b)\n { return a b }').funcs.f.params, ['a', 'b']);
    assert.deepEqual(stmts('x = 1\n+ 2'), [X(A(V('x'), N(1))), X(U('+', N(2)))], 'mawk: the newline ends x = 1');
    syntax('BEGIN { x = 1 +\n 2 }');
    syntax('BEGIN { print 1 ?\n 2 : 3 }');
  });
  it('else needs the then-statement terminated (mawk)', () => {
    syntax('BEGIN { if (1) print 1 else print 2 }');
    syntax('BEGIN { if (1) { print 1 }; else print 2 }');
    syntax('BEGIN { if (1) print 1;\n;\n else print 2 }');
  });
  it('comments run to the end of the line; backslash-newline joins lines', () => {
    assert.deepEqual(stmts('x = 1 # set x { ( "\ny = 2'), [X(A(V('x'), N(1))), X(A(V('y'), N(2)))]);
    assert.deepEqual(stmts('x = 1 \\\n + 2'), [X(A(V('x'), B('+', N(1), N(2))))]);
    assert.deepEqual(stmts('x = 1 \\\r\n + 2'), [X(A(V('x'), B('+', N(1), N(2))))]);
    const p = SQ.awkParse('BEGIN { x = 1 \\\n + 2\n y = 3 }');
    assert.equal(p.begin[0][1].line, 3, 'a continued line still counts');
  });
});

describe('unsupported features fail at parse time', () => {
  for (const [src, what] of [
    ['BEGIN { getline }', 'getline'],
    ['{ getline x < "f" }', 'getline'],
    ['{ "date" | getline d }', 'getline'],
    ['END { while ((getline line) > 0) n++ }', 'getline'],
    ['{ system("ls") }', 'system()'],
    ['{ close("f") }', 'close()'],
    ['{ fflush() }', 'fflush()'],
    ['{ nextfile }', 'nextfile'],
    ['{ print a, b > "f" }', 'output redirection'],
    ['{ print > "f" }', 'output redirection'],
    ['{ print $1 >> "f" }', 'output redirection'],
    ['{ print (1, 2) > "f" }', 'output redirection'],
    ['{ printf "%s", $1 > "f" }', 'output redirection'],
    ['{ printf("%s", $1) >> "f" }', 'output redirection'],
    ['{ print 1 > 2 ? "a" : "b" }', 'output redirection'],
    ['{ print $1 | "sort" }', 'pipes'],
    ['{ printf "x" | "cat" }', 'pipes'],
    ['{ print |& "cmd" }', 'pipes'],
    ['{ x = gensub(/a/, "b", "g") }', 'gensub()'],
    ['BEGIN { t = systime() }', 'systime()'],
    ['function never() { getline }', 'getline'],
  ]) {
    it(`${src} -> awk ${what}`, () => assert.equal(err(src), unsup(what)));
  }
  it('a user function may reuse a gawk-only name', () => {
    assert.equal(parse('function gensub(a) { return a } BEGIN { gensub(1) }').begin[0][0].expr.builtin, false);
  });
  it('getline and friends inside strings and regexes are plain text', () => {
    assert.deepEqual(stmts('print "getline system(", /getline|close/'), [P(S('getline system('), R('getline|close'))]);
  });
});

describe('syntax errors', () => {
  it('use the BWK awk shape with the line and a context line', () => {
    assert.equal(err('{ print $ }'), 'awk: syntax error at source line 1\n context is { print $ >>> } <<<');
    assert.equal(err('BEGIN {\n  x = 1\n  y = = 2\n}'), 'awk: syntax error at source line 3\n context is y = >>> = <<< 2');
    assert.equal(err('{ print 1'), 'awk: syntax error at source line 1\n context is { print 1 >>>  <<<');
    assert.equal(err('BEGIN { x = 1 ) }'), 'awk: syntax error at source line 1\n context is BEGIN { x = 1 >>> ) <<< }');
  });
  it('clips a long context line', () => {
    const m = err('BEGIN { x = ' + '1 + '.repeat(100) + ') }');
    assert.ok(m.split('\n')[1].length < 120, m);
  });
  it('BEGIN and END need an action on the same line', () => {
    assert.equal(err('BEGIN'), 'awk: syntax error at source line 1\n context is BEGIN >>>  <<<');
    syntax('END');
    syntax('BEGIN\n{ print }');
    syntax('BEGIN, END { }');
  });
  for (const src of [
    '{ print "abc }', '{ x = "a\nb" }', '{ x = /abc }', '{ x = /ab\nc/ }', '{ x = 1 & 2 }', '{ x = @y }', '{ x = `y` }',
    '{ x = (1, 2) }', '{ x = (1, 2) + 1 }', '{ print (1, 2)(3) }', '{ x[1 }', '{ f( }', '{ printf }', '{ print 1, }',
    '{ for ((k) in a) print }', '{ for (k in a print }', '{ if x print }', '{ while (x) }', '{ do print 1 }',
    '{ delete }', '{ delete 1 }', '{ x = 1 in 2 }', '{ $ }', '{ ++1 }', '{ x \\ y }', '{ print } }', '{ {',
    'function (a) { }', 'function length(a) { }', 'function if() { }', 'function f(a, a) { }', 'function f(f) { }',
    'function f() { } function f() { }', 'function f() { } BEGIN { f = 1 }', 'BEGIN { x = 1 } function',
    '{ x = substr("a") }', '{ x = substr("a", 1, 2, 3) }', '{ x = index("a") }', '{ x = split("a b", "c") }',
    '{ sub(/a/, "b", "lit") }', '{ x = length(1, 2) }', '{ x = atan2(1) }', '{ x = rand(1) }', '{ x = substr }',
  ]) {
    it(`refuses ${JSON.stringify(src)}`, () => syntax(src));
  }
  it('break/continue outside a loop, return outside a function, next in BEGIN or END', () => {
    syntax('BEGIN { break }');
    syntax('{ continue }');
    syntax('{ if (x) break }');
    syntax('BEGIN { return }');
    syntax('BEGIN { next }');
    syntax('END { if (1) next }');
    assert.deepEqual(parse('function f() { next }').funcs.f.body, [{ type: 'next' }]);
    assert.deepEqual(stmts('while (1) { if (x) break; for (k in a) continue }')[0].type, 'while');
  });
  it('calling an undefined function is an error at parse time (BWK wording)', () => {
    assert.equal(err('BEGIN {\n foo(1) }'), 'awk: calling undefined function foo\n source line number 2');
  });
});

describe('caps', () => {
  it('a program over 20,000 characters is refused', () => {
    const ok = 'BEGIN { x = 1 }' + ' '.repeat(20000 - 15);
    assert.equal(ok.length, 20000);
    assert.doesNotThrow(() => SQ.awkParse(ok));
    assert.equal(err(ok + ' '), 'awk: program too large for this practice shell (over 20,000 characters)');
  });
  it('nesting is capped at 100 levels: awk: nesting too deep', () => {
    const parens = (n) => '('.repeat(n) + '1' + ')'.repeat(n);
    assert.doesNotThrow(() => SQ.awkParse(parens(100)));
    assert.equal(err(parens(101)), 'awk: nesting too deep');
    const braces = (n) => 'BEGIN ' + '{'.repeat(n) + '}'.repeat(n);
    assert.doesNotThrow(() => SQ.awkParse(braces(100)));
    assert.equal(err(braces(101)), 'awk: nesting too deep');
    for (const deep of [
      'BEGIN { x = ' + '-'.repeat(5000) + '1 }',
      'BEGIN { x = ' + '!'.repeat(5000) + '1 }',
      'BEGIN { x = ' + '$'.repeat(5000) + '1 }',
      'BEGIN { ' + 'x = '.repeat(3000) + '1 }',
      'BEGIN { x = ' + '1 ? 2 : '.repeat(1500) + '3 }',
      'BEGIN { x = ' + '2 ^ '.repeat(3000) + '2 }',
      'BEGIN { x = ' + 'a['.repeat(3000) + '1' + ']'.repeat(3000) + ' }',
      'BEGIN { ' + 'if (x) '.repeat(2000) + 'print }',
      'BEGIN { ' + 'while (x) '.repeat(1500) + 'print }',
      'BEGIN { if (x) print; ' + 'else if (x) print; '.repeat(800) + '}',
      'BEGIN { x = ' + 'substr('.repeat(1000) + '1' + ', 1)'.repeat(1000) + ' }',
      '{ print ' + '('.repeat(5000) + ' }',
    ]) {
      assert.equal(err(deep), 'awk: nesting too deep', deep.slice(0, 40));
    }
  });
  it('parses a 20,000-token program in linear time', () => {
    const progs = (n) => [
      'BEGIN{x=1' + '+1'.repeat(n) + '}',
      'BEGIN{x=a' + ' a'.repeat(n) + '}',
      'BEGIN{' + 'x;'.repeat(n) + '}',
      '{print $1' + ',$1'.repeat(n / 2) + '}',
      '{}'.repeat(n / 2),
      'BEGIN{s="' + 'a'.repeat(n * 2) + '"}',
    ];
    const time = (src) => {
      const t = process.hrtime.bigint();
      SQ.awkParse(src);
      return Number(process.hrtime.bigint() - t) / 1e6;
    };
    progs(9990).forEach((p) => assert.ok(p.length <= 20000, p.length));
    for (let i = 0; i < 6; i++) {
      time(progs(500)[i]); // warm up
      const small = Math.min(...[1, 2, 3].map(() => time(progs(999)[i])));
      const big = Math.min(...[1, 2, 3].map(() => time(progs(9990)[i])));
      assert.ok(big < 250, `program ${i}: ${big} ms`);
      assert.ok(big < 40 * Math.max(small, 0.5), `program ${i}: ${small} ms for 1k, ${big} ms for 10x`);
    }
    const tokens = SQ.awkLex('BEGIN{x=1' + '+1'.repeat(9990) + '}').length;
    assert.ok(tokens >= 19980, tokens);
  });
  it('the error context of a huge one-line program stays small', () => {
    const m = err('BEGIN{x=1' + '+1'.repeat(9000) + ')}');
    assert.ok(m.length < 200, m.length);
  });
});

describe('robustness', () => {
  it('random token soup either parses or throws an awk error, never a JS error', () => {
    const frags = ['{', '}', '(', ')', '[', ']', ';', '\n', ',', '$', 'x', 'a', '1', '"s"', '/r/', '/', '+', '-', '*', '^', '!', '++', '--', '=', '+=',
      '==', '<', '>', '>>', '|', '?', ':', '~', '!~', '&&', '||', 'in', 'if', 'else', 'while', 'do', 'for', 'print', 'printf', 'BEGIN', 'END',
      'function', 'f(', 'length', 'substr(', 'delete', 'next', 'exit', 'return', 'break', '#c', '\\\n', ' '];
    let seed = 12345;
    const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % n);
    let parsed = 0;
    for (let i = 0; i < 20000; i++) {
      let src = '';
      for (let j = 1 + rnd(25); j > 0; j--) src += frags[rnd(frags.length)] + (rnd(2) ? ' ' : '');
      try {
        SQ.awkParse(src);
        parsed++;
      } catch (e) {
        assert.equal(e.awkErr, true, JSON.stringify(src) + ': ' + e);
      }
    }
    assert.ok(parsed > 100, parsed);
  });
  it('the Expert-tier one-liners parse', () => {
    for (const p of ['{print $1}', '$2 > 10 {print $1}', '{s += $2 * $3} END {print s}', '{c[$4]++} END {for (k in c) print k, c[k]}',
      '{printf "%-8s %7.2f\\n", $1, $2*$3}', 'NR>1', 'NR==FNR{a[$1];next} $1 in a', '!seen[$0]++', '{ $1 = ""; print substr($0, 2) }',
      'length > 72', '{ n = split($0, w, /[ \\t]+/); for (i = n; i > 0; i--) printf "%s%s", w[i], (i > 1 ? OFS : ORS) }',
      'BEGIN { while (i++ < 3) print i }', '{ gsub(/foo/, "bar"); print }', 'END { print NR }', '/start/,/stop/']) {
      assert.doesNotThrow(() => SQ.awkParse(p), p);
    }
  });
});

describe('wiring', () => {
  it('index.html loads awk-parse.js after printf.js and sed.js, and awk itself is not registered yet', async () => {
    const fs = await import('node:fs');
    const html = fs.readFileSync(new URL('../../shell-quest/index.html', import.meta.url), 'utf8');
    const at = (f) => html.indexOf(`<script src="engine/${f}"></script>`);
    assert.ok(at('awk-parse.js') > at('sed.js') && at('sed.js') > 0, 'awk-parse.js after sed.js');
    assert.ok(at('awk-parse.js') < at('cmds-text.js'), 'awk-parse.js before cmds-text.js');
    assert.equal(typeof SQ.awkParse, 'function');
  });
});
