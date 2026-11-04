(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const { full, safe, blocked } = MQ.math;
  const BLOCKED = new Set(blocked);
  const UNREAD = "I couldn't read this step. Check for a missing number, sign or bracket.";
  const no = why => ({ ok: false, why });
  const yes = { ok: true };

  // Angles may be typed with a degree sign; math.js cannot read `°`, and the value is the same without it.
  const bare = s => String(s).replace(/(\d)\s*°(?!\s*\d)/g, '$1');
  const parse = s => {
    let node;
    try { node = full.parse(bare(s)); } catch (e) { return { why: UNREAD }; }
    if (node.filter(n => n.isAssignmentNode || n.isFunctionAssignmentNode || n.isBlockNode ||
      (n.isSymbolNode && BLOCKED.has(n.name))).length) return { why: UNREAD };
    return { node };
  };
  const show = v => (safe.typeOf(v) === 'Fraction' ? safe.format(v, { fraction: 'ratio' }).replace(/\/1$/, '') : String(+(+v).toFixed(4))).replace(/^-/, '−');
  const real = v => typeof v === 'number' && isFinite(v);
  const unknown = e => { const m = /Undefined symbol (\w+)/.exec(e && e.message); return m && m[1]; };

  const value = s => {
    const p = parse(s);
    if (p.why) return p;
    let v;
    const run = () => {
      try { return safe.evaluate(bare(s)); } catch (e) {
        // An irrational root is a plain number, which math.js will not mix with exact fractions; work it in decimals instead.
        if (/implicitly convert a number to a Fraction/.test(e.message)) return full.evaluate(bare(s));
        throw e;
      }
    };
    try { v = run(); } catch (e) {
      if (/Division by zero/i.test(e.message)) return { why: 'This divides by zero, and that has no value.' };
      const u = unknown(e);
      return { why: u ? `I don't know what \`${u}\` is here. This one is about numbers only.` : UNREAD };
    }
    const t = safe.typeOf(v);
    if (t === 'Fraction' || (t === 'number' && isFinite(v))) return { v, node: p.node };
    return { why: "I couldn't work this out to one number." };
  };

  const off = v => no(`This works out to ${show(v)}, but it should come to the same value as the question.`);
  const number = (input, expected, { exact = false, tol = 1e-9 } = {}) => {
    const a = value(input);
    if (a.why) return no(a.why);
    const b = typeof expected === 'number' ? { v: expected } : value(expected);
    if (b.why) return no('The expected value could not be read.');
    if (exact) {
      const whole = a.node.filter(n => n.isConstantNode).every(n => Number.isInteger(n.value)) && !a.node.filter(n => n.isSymbolNode).length;
      if (!whole || safe.typeOf(a.v) !== 'Fraction') return no('Write the answer as a fraction of whole numbers, like 3/4, not as a decimal.');
      return safe.equal(a.v, safe.fraction(b.v)) ? yes : off(a.v);
    }
    const fa = safe.typeOf(a.v) === 'Fraction', fb = safe.typeOf(b.v) === 'Fraction';
    const same = fa && fb ? safe.equal(a.v, b.v) : Math.abs(+a.v - +b.v) <= tol * Math.max(1, Math.abs(+b.v));
    return same ? yes : off(a.v);
  };

  // math.js reads `x(x - 3)` as a call to a function named x; a learner means x times (x - 3). Rewriting the text,
  // not the parse tree, keeps the power in `x(x+1)^2` on the bracket.
  const times = (s, vars) => String(s).replace(new RegExp(`(?<![A-Za-z_])(${vars.join('|')})\\s*\\(`, 'g'), '$1*(');
  const compile = (s, vars) => {
    const p = parse(times(s, vars));
    if (p.why) return p;
    const node = p.node, code = node.compile();
    const at = scope => { try { const v = code.evaluate(scope); return typeof v === 'number' ? v : NaN; } catch (e) { if (unknown(e)) throw e; return NaN; } };
    try { at(Object.fromEntries(vars.map(n => [n, 0.5]))); } catch (e) {
      return { why: `I don't know what \`${unknown(e)}\` is here. Use ${vars.map(v => '`' + v + '`').join(', ')}.` };
    }
    return { node, at };
  };
  const points = (vars, seed) => {
    const rng = MQ.rng(seed);
    return Array.from({ length: 20 }, () => Object.fromEntries(vars.map(n => [n, rng() * 20 - 10])));
  };
  const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

  const FORM_WHY = {
    noDivision: 'That is equal, but there is still a division in it. Cancel it out.',
    product: 'That is equal, but it is not written as one product yet.',
    linearFactors: 'That is equal, but it is not split into factors like (x - 1)(x + 1) yet.',
    expanded: 'That is equal, but there are still brackets to multiply out.',
    collected: 'That is equal, but some like terms are not added up yet.',
    wholeNumbers: 'That is equal, but write it with whole numbers only, no decimals or fractions.',
  };

  const expr = (input, expected, { vars = ['x'], seed = 1, form } = {}) => {
    const a = compile(input, vars);
    if (a.why) return no(a.why);
    const b = compile(expected, vars);
    if (b.why) return no('The expected expression could not be read.');
    let valid = 0;
    for (const s of points(vars, seed)) {
      const va = a.at(s), vb = b.at(s);
      if (!real(va) || !real(vb)) continue;
      valid++;
      if (!close(va, vb)) {
        // A whole-number example is easier to check by hand than the random point that failed.
        for (const k of [2, 1, 3, -1, 0, -2, 4, 5]) {
          const t = Object.fromEntries(vars.map(n => [n, k])), x = a.at(t), y = b.at(t);
          if (real(x) && real(y) && !close(x, y))
            return no(`These are not equal. Try ${vars.map(n => `${n} = ${k}`).join(', ')}: yours gives ${show(x)}, the original gives ${show(y)}.`);
        }
        return no('These are not equal for every value.');
      }
    }
    if (valid < 12) return no("I couldn't test this: it has no value for most of the numbers I tried.");
    const broken = [].concat(form || []).find(f => !C.forms[f](a.node));
    if (broken) return no(FORM_WHY[broken]);
    return yes;
  };

  const strip = n => { while (n.isParenthesisNode) n = n.content; return n; };
  const terms = n => {
    n = strip(n);
    if (isSum(n)) return [...terms(n.args[0]), ...terms(n.args[1])];
    return [n];
  };
  const isSum = n => n.isOperatorNode && (n.op === '+' || n.op === '-') && n.args.length === 2;
  const isConst = n => n.isConstantNode || (n.isSymbolNode && (n.name === 'pi' || n.name === 'e'));
  const degree = n => {
    n = strip(n);
    if (isConst(n)) return 0;
    if (n.isSymbolNode) return 1;
    if (n.isOperatorNode) {
      const d = n.args.map(degree);
      if (n.op === '+' || n.op === '-') return Math.max(...d);
      if (n.op === '*') return d[0] + d[1];
      if (n.op === '/') return d[1] === 0 ? d[0] : Infinity;
      if (n.op === '^') { const e = strip(n.args[1]); return d[0] === 0 ? 0 : e.isConstantNode && Number.isInteger(e.value) && e.value >= 0 ? d[0] * e.value : Infinity; }
    }
    return n.args && n.args.some(a => degree(a) > 0) ? Infinity : 0;
  };
  const factors = n => {
    n = strip(n);
    if (n.isOperatorNode && n.fn === 'unaryMinus') return factors(n.args[0]);
    if (n.isOperatorNode && n.op === '*') return n.args.flatMap(factors);
    const e = n.isOperatorNode && n.op === '^' ? strip(n.args[1]) : null;
    return e && e.isConstantNode && Number.isInteger(e.value) && e.value > 0 ? factors(n.args[0]) : [n];
  };

  const C = MQ.check = {
    number, expr,
    forms: {
      noDivision: n => !n.filter(m => m.isOperatorNode && m.op === '/').length,
      product: n => !isSum(strip(n)),
      linearFactors: n => !isSum(strip(n)) && factors(n).every(f => degree(f) <= 1),
      expanded: n => !n.filter(m => m.isOperatorNode && (
        m.op === '^' ? isSum(strip(m.args[0]))
          : m.op === '-' && m.fn !== 'unaryMinus' ? isSum(strip(m.args[1]))
            : ['*', '/', '-'].includes(m.op) && m.args.some(a => isSum(strip(a))))).length,
      // Two terms are like terms when one is a fixed multiple of the other at every point.
      collected: n => {
        const ts = terms(n).map(t => t.compile()), pts = points(n.filter(m => m.isSymbolNode && !isConst(m) && !m.isFunctionNode).map(m => m.name), 7);
        const like = (a, b) => { const r = pts.map(p => a.evaluate(p) / b.evaluate(p)).filter(v => isFinite(v)); return r.length > 3 && r.every(v => close(v, r[0])); };
        return ts.every((a, i) => ts.slice(i + 1).every(b => !like(a, b)));
      },
      wholeNumbers: n => !n.filter(m => (m.isConstantNode && !Number.isInteger(m.value)) || (m.isOperatorNode && m.op === '/')).length,
    },
  };

  // The step checker accepts any line with the right value, so a mission's last line must also have the finished shape.
  const NUM = '-?\\d+(?:\\.\\d+)?(?:\\s*/\\s*\\d+)?';
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const solvedRe = x => new RegExp(`^\\s*(?:${x}\\s*=\\s*(${NUM})|(${NUM})\\s*=\\s*${x})\\s*$`);
  const LIST = /\s*,\s*|\s+or\s+/;
  C.final = {
    number: value => v => /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? number(v, value) : no('Keep going until your last line is one number.'),
    fraction: (value, { lowest = true } = {}) => v => {
      const m = /^\s*-?(\d+)(?:\s*\/\s*(\d+))?\s*$/.exec(v);
      if (!m) return no(/\d\.\d/.test(v) ? 'Write the answer as a fraction of whole numbers, like 3/4, not as a decimal.' : 'Keep going until your last line is one fraction, like 3/4.');
      const r = number(v, value, { exact: true });
      if (r.ok && lowest && m[2] && gcd(+m[1], +m[2]) > 1) return no('That is equal, but not in its simplest form yet. Divide the top and bottom by the same number.');
      return r;
    },
    solved: (value, x = 'x') => v => {
      const m = solvedRe(x).exec(v);
      return m ? number(m[1] || m[2], value) : no(`Keep going until your last line reads \`${x} = \` and one number.`);
    },
    roots: (values, x = 'x') => v => {
      const got = [];
      for (const p of String(v).split(LIST)) {
        const m = solvedRe(x).exec(p);
        if (!m) return no(`Keep going until your last line lists each solution as \`${x} = \` and a number, like \`${x} = 2 or ${x} = 3\`.`);
        got.push(m[1] || m[2]);
      }
      const is = (g, w) => number(g, w).ok;
      const bad = got.find(g => !values.some(w => is(g, w)));
      if (bad !== undefined) return no(`\`${x} = ${bad}\` is not a solution. Put it back into the question to check.`);
      if (got.some((g, i) => got.slice(0, i).some(h => is(g, h)))) return no('You wrote the same solution twice. Write each one once.');
      const found = values.filter(w => got.some(g => is(g, w))).length, left = values.length - found;
      if (left) return no(`You found ${found === 1 ? 'one solution' : found + ' solutions'}; there ${left === 1 ? 'is another' : 'are more'}.`);
      return yes;
    },
  };

  const side = (s, vars) => {
    const parts = String(s).split('=');
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return { why: 'Write each step as a whole equation, with one `=` sign and something on each side.' };
    return compile(`(${parts[0]}) - (${parts[1]})`, vars);
  };
  const roots = d => {
    const xs = [], step = 0.01, out = [];
    for (let i = 0; i <= 2000; i++) xs.push(-10 + i * step);
    const v = xs.map(d);
    const push = r => { if (!out.length || r - out[out.length - 1] >= 2 * step) out.push(r); };
    for (let i = 0; i < xs.length; i++) {
      if (real(v[i]) && Math.abs(v[i]) < 1e-9) { push(xs[i]); continue; }
      if (i + 1 < xs.length && real(v[i]) && real(v[i + 1]) && Math.sign(v[i]) * Math.sign(v[i + 1]) < 0) {
        // Bisect so a pole (1/x crossing zero) is not taken for a root.
        let lo = xs[i], hi = xs[i + 1], flo = v[i];
        for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2, fm = d(m); if (Math.sign(fm) === Math.sign(flo)) { lo = m; flo = fm; } else hi = m; }
        const m = (lo + hi) / 2;
        if (Math.abs(d(m)) < 1e-6) push(m);
      }
    }
    return out;
  };
  const equation = (step, orig, vars, seed) => {
    const s = side(step, vars);
    if (s.why) return no(s.why);
    const pts = points(vars, seed);
    if (!pts.some(p => real(s.at(p)))) return no('This step has no value I can work out. Is something divided by zero?');
    let r = null, valid = 0, constant = true;
    for (const p of pts) {
      const vo = orig.at(p), vs = s.at(p);
      if (!real(vo) || !real(vs) || vo === 0) continue;
      valid++;
      if (r === null) r = vs / vo;
      else if (!close(vs / vo, r)) constant = false;
    }
    if (valid >= 12 && constant && real(r) && r !== 0) return yes;
    const at = f => x => f({ [vars[0]]: x }), ro = roots(at(orig.at)), rs = roots(at(s.at));
    const near = (r, set) => set.some(q => Math.abs(q - r) < 1e-3);
    const lost = ro.some(r => !near(r, rs)), added = rs.some(r => !near(r, ro));
    if (lost && added) return no('This step has different solutions from the question. Check what you did to each side.');
    if (lost) return no(`This step loses a solution. Dividing both sides by something with \`${vars[0]}\` in it can do that, and so can keeping only the positive square root.`);
    if (added) return no('This step adds a solution. Squaring both sides can do that.');
    return yes;
  };

  // `x = 2 or x = 3` has the same solutions as `(x - 2)(x - 3) = 0`, so a list of solutions is checked as that equation.
  const asProduct = s => {
    const parts = String(s).split(LIST).map(p => p.split('='));
    return parts.length > 1 && parts.every(q => q.length === 2 && q[0].trim() && q[1].trim())
      ? parts.map(([l, r]) => `((${l})-(${r}))`).join('*') + '=0' : s;
  };
  C.steps = (original, steps, { kind = 'number', vars = ['x'], seed = 1 } = {}) => {
    if (kind === 'number') return steps.map(s => number(s, original));
    if (kind === 'expr') return steps.map(s => expr(s, original, { vars, seed }));
    const orig = side(original, vars);
    if (orig.why) return steps.map(() => no('The question could not be read.'));
    return steps.map(s => equation(asProduct(s), orig, vars, seed));
  };

  // math.js writes implicit multiplication as `~`, which KaTeX renders as a visible gap ("2 x").
  const eqTex = s => bare(s).split('=').map(p => full.parse(p).toTex({ parenthesis: 'auto' })).join(' = ').replace(/~/g, '');
  // Only a list when every item is an equation: the comma in `log(x, 2)` separates arguments.
  C.tex = s => {
    const parts = String(s).split(/(\s*,\s*|\s+or\s+)/);
    if (parts.length === 1 || !parts.every((p, i) => i % 2 || p.split('=').length === 2)) return eqTex(String(s));
    return parts.map((p, i) => i % 2 ? (p.trim() === ',' ? ',\\ ' : '\\text{ or }') : eqTex(p)).join('');
  };

  C.translate = ascii => String(ascii)
    .replace(/\|([^|]+)\|/g, 'abs($1)')
    .replace(/log _\(?(\w+)\)?\(([^)]*)\)/g, 'log($2, $1)')
    .replace(/\s*\*\s*/g, '*')
    .replace(/\s*"\s*or\s*"\s*/g, ' or ')
    .replace(/\(\(([^()]*)\)\)/g, '($1)')
    // MathLive brackets every fraction part; drop brackets around one number or letter unless they are a call like `sin (x)`.
    .replace(/(?<![\w)]\s*)\((\d+(?:\.\d+)?|[a-z])\)/g, '$1');
})();
