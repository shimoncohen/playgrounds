// Algebra track content (DOM-free). Chapter ids and order must match MQ.graph.chapters.algebra.
(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const ok = { ok: true };
  const finalNumber = MQ.check.final.number;
  const E = (label, value) => ({ min: 1, max: 6, step: 1, value, label });

  const box = {
    id: 'box-volume', title: 'Box volume',
    params: { a: { ...E('length', 2), max: 10 }, b: E('width', 3), c: E('height', 4) },
    derived: p => ({ V: p.a * p.b * p.c }),
    formula: 'V = \\term{a}{a}\\cdot\\term{b}{b}\\cdot\\term{c}{c}',
    live: 'V = {a}·{b}·{c} = {V}',
    draw: { kind: '3d', shape: 'box', size: p => [p.a, p.b, p.c] },
  };

  const no = why => ({ ok: false, why });
  const { full } = MQ.math;
  const strip = n => { while (n.isParenthesisNode) n = n.content; return n; };
  const finalExpr = (expected, form) => v => MQ.check.expr(v, expected, { form });
  const R = (label, value) => ({ min: 1, max: 5, step: 1, value, label });
  const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

  const WOOD = '#9a6a3a', SAND = '#c9b98f', IRON = '#6f7b84', WATER = '#3b93b8', EARTH = '#8a6a45';
  const rr = (x0, y0, x1, y1, r, o) => ({ type: 'rrect', x0, y0, x1, y1, r, ...o });
  const disc = (x, y, r, o) => ({ type: 'circle', x, y, r, ...o });
  const label = (x, y, s, anchor) => ({ type: 'text', x, y, s, small: true, anchor });
  const rounded = (items, r) => items.map(it => {
    if (it.type !== 'polygon' || it.pts.length !== 4 || it.pts[0][1] !== it.pts[1][1] || it.pts[1][0] !== it.pts[2][0]) return it;
    const xs = it.pts.map(q => q[0]), ys = it.pts.map(q => q[1]);
    return rr(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), r, { term: it.term, alpha: it.alpha, stroke: it.stroke });
  });
  // The story draw must keep the plain picture's arrows, points and mission-named marks in place (tests check it).
  const dressed = (plain, title, live, build, look) => ({ title, live, draw: { ...plain.draw, ...look, items: s => build(plain.draw.items(s), s) } });
  const bench = (x0, x1, y0) => rr(x0, y0, x1, y0 + 0.43, 3, { color: WOOD, edge: WOOD, alpha: 0.7, w: 2 });
  const BENCH = { title: 'The bench top in four planks', line: 'Four planks make the bench top', place: 'the carpentry bench', color: WOOD };
  const YARD = { title: 'The factor yard in four paved patches', line: 'Four paved patches fill the factor yard', place: 'the factor yard', color: SAND };

  const rect = (id, title, [a, b, c, d], world) => { const plain = {
    id, title,
    params: { a: R('a', a), b: R('b', b), c: R('c', c), d: R('d', d) },
    // The palette has 6 colors for 8 terms, so bd shares a's color and ac shares b's: each sits away from the side it shares with.
    terms: ['ad', 'bc', 'bd', 'ac'],
    derived: p => ({ ac: p.a * p.c, ad: p.a * p.d, bc: p.b * p.c, bd: p.b * p.d, area: (p.a + p.b) * (p.c + p.d) }),
    formula: '(\\term{a}{a}+\\term{b}{b})(\\term{c}{c}+\\term{d}{d}) = \\term{ac}{ac}+\\term{ad}{ad}+\\term{bc}{bc}+\\term{bd}{bd}',
    live: '({a} + {b})({c} + {d}) = {ac} + {ad} + {bc} + {bd} = {area}',
    draw: {
      kind: '2d', view: [-1.2, 10.4, -0.4, 11.2], box: [360, 360],
      items: ({ params }) => {
        // Drawn scaled and centred so the longer side always spans the box; the labels keep the true areas.
        const k = 10 / Math.max(params.a + params.b, params.c + params.d), [a, b, c, d] = ['a', 'b', 'c', 'd'].map(n => params[n] * k);
        const part = (term, x0, y0, x1, y1) => [{ type: 'polygon', term, pts: sq(x0, y0, x1, y1) }, { type: 'text', x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: String(Math.round((x1 - x0) * (y1 - y0) / k / k)), term }];
        const L = (10 - c - d) / 2, T = 10 - (10 - a - b) / 2, m = T - a, bot = m - b, mid = L + c;
        return [
          ...part('ac', L, m, mid, T), ...part('ad', mid, m, mid + d, T), ...part('bc', L, bot, mid, m), ...part('bd', mid, bot, mid + d, m),
          { type: 'text', x: L - 0.6, y: T - a / 2, s: 'a', term: 'a' }, { type: 'text', x: L - 0.6, y: m - b / 2, s: 'b', term: 'b' },
          { type: 'text', x: L + c / 2, y: T + 0.55, s: 'c', term: 'c' }, { type: 'text', x: mid + d / 2, y: T + 0.55, s: 'd', term: 'd' },
        ];
      },
    },
  };
  plain.story = dressed(plain, world.title,
    ({ params: { a, b, c, d }, derived: v }) => `${world.line}: (${a} + ${b})(${c} + ${d}) = ${v.ac} + ${v.ad} + ${v.bc} + ${v.bd} = ${v.area}`,
    (items, { params: p }) => {
      const k = 10 / Math.max(p.a + p.b, p.c + p.d), [a, b, c, d] = [p.a, p.b, p.c, p.d].map(n => n * k);
      const L = (10 - c - d) / 2, T = 10 - (10 - a - b) / 2;
      return [rr(L - 0.15, T - a - b - 0.15, L + c + d + 0.15, T + 0.15, 5, { color: world.color, edge: world.color, alpha: 0.18, w: 4 }),
        ...rounded(items, 3), label(5, -0.9, world.place)];
    },
    { view: [-1.2, 10.4, -1.4, 11.2], box: [360, 394] });
  return plain; };

  // Each box weighs X, the mission's solution; the learner never sees X, only whether the scale is level.
  const W = (label, value, max) => ({ min: 0, max, step: 1, value, label });
  const side = (n, u) => (n ? `${n === 1 ? '' : n}x${u ? ' + ' + u : ''}` : String(u));
  // Rounded so a fraction weight like 5/3 still balances exactly: 3 · 5/3 + 2 − 7 is not quite 0 in floating point.
  const tiltAt = X => p => Math.sign(+((p.bl - p.br) * X + p.ul - p.ur).toFixed(9));
  const balance = X => { const tilt = tiltAt(X); const plain = {
    id: 'balance', title: 'A balance scale with x boxes and unit weights',
    params: { bl: W('p: boxes on the left', 2, 4), ul: W('q: weights on the left', 3, 12), br: W('r: boxes on the right', 0, 4), ur: W('s: weights on the right', 9, 12) },
    derived: p => ({ scale: ['right side down', 'level', 'left side down'][tilt(p) + 1] }),
    formula: '\\term{bl}{p}\\,x+\\term{ul}{q} = \\term{br}{r}\\,x+\\term{ur}{s}',
    live: s => `${side(s.params.bl, s.params.ul)} = ${side(s.params.br, s.params.ur)}: the scale is ${s.derived.scale === 'level' ? 'level' : 'not level, ' + s.derived.scale}`,
    draw: {
      kind: '2d', view: [-6, 6, -0.5, 6], box: [400, 220],
      items: ({ params: p }) => {
        const t = tilt(p) * 0.5;
        const pan = (cx, cy, n, nTerm, u, uTerm) => {
          const out = [{ type: 'polygon', pts: sq(cx - 1.6, cy - 0.08, cx + 1.6, cy + 0.08) }];
          for (let i = 0; i < n; i++) {
            const x = cx - 1.5 + i * 0.76;
            out.push({ type: 'polygon', term: nTerm, pts: sq(x, cy + 0.1, x + 0.68, cy + 0.78) }, { type: 'text', x: x + 0.34, y: cy + 0.44, s: 'x', term: nTerm });
          }
          for (let i = 0; i < u; i++) {
            const x = cx - 1.5 + (i % 6) * 0.5, y = cy + (n ? 0.86 : 0.1) + Math.floor(i / 6) * 0.48;
            out.push({ type: 'polygon', term: uTerm, pts: sq(x, y, x + 0.4, y + 0.4) });
          }
          return out;
        };
        return [
          { type: 'polygon', pts: [[-0.6, 0], [0.6, 0], [0, 2]] },
          { type: 'polygon', pts: [[-4.6, 2 - t - 0.06], [4.6, 2 + t - 0.06], [4.6, 2 + t + 0.06], [-4.6, 2 - t + 0.06]] },
          ...pan(-3.4, 2.1 - t * 0.74, p.bl, 'bl', p.ul, 'ul'), ...pan(3.4, 2.1 + t * 0.74, p.br, 'br', p.ur, 'ur'),
        ];
      },
    },
  };
  plain.story = dressed(plain, 'Odd\'s workshop scale',
    s => `Odd's scale in the balance room, each crate weighing x: ${plain.live(s)}`,
    items => [
      rr(-1.5, -0.32, 1.5, 0, 2, { color: IRON, edge: IRON, alpha: 0.6, w: 2 }),
      ...items.map(it => {
        if (it.type !== 'polygon') return it;
        if (it.pts.length === 3) return { ...it, color: IRON, alpha: 0.5 };
        if (!it.term) return { ...it, color: WOOD, alpha: 0.8 };
        const [[x0, y0], [x1, y1]] = [it.pts[0], it.pts[2]];
        return /^u/.test(it.term) ? disc((x0 + x1) / 2, (y0 + y1) / 2, 6, { term: it.term, alpha: 0.5 }) : rounded([it], 3)[0];
      }),
      label(-5.8, 5.6, 'the balance room', 'start'),
    ]);
  return plain; };

  const U =(max, value, label = 'x', min = 1) => ({ min, max, step: 1, value, label });
  const tx = (x, y, s, term, small) => ({ type: 'text', x, y, s, term, small });
  // The svg has no dashed or unfilled shape: a two-point polygon draws as a bare line, so dashes are short segments.
  const dashed = (x0, y0, x1, y1, term) => {
    const out = [];
    for (const [[ax, ay], [bx, by]] of [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]]) {
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5);
      for (let i = 0; i < n; i += 1) out.push({ type: 'polygon', term, pts: [[ax + (bx - ax) * i / n, ay + (by - ay) * i / n], [ax + (bx - ax) * (i + 0.6) / n, ay + (by - ay) * (i + 0.6) / n]] });
    }
    return out;
  };
  const likeTerms = {
    id: 'like-terms', title: 'Two boxes side by side, 2a and 3a long',
    params: { a: U(3, 2, 'a') },
    derived: p => ({ n2: 2 * p.a, n3: 3 * p.a, V: 5 * p.a }),
    formula: '2\\term{a}{a}+3\\term{a}{a}',
    live: 'a = {a}: 2a + 3a = {n2} + {n3} = {V}',
    draw: {
      kind: '2d', view: [-0.5, 17.5, -1.6, 2.2], box: [400, 90],
      items: ({ params: { a } }) => {
        const row = (n, x0) => Array.from({ length: n }, (_, i) => [
          { type: 'polygon', term: 'a', pts: sq(x0 + i * a, 0, x0 + (i + 1) * a, 1) }, tx(x0 + (i + 0.5) * a, 0.5, 'a', 'a'),
        ]).flat();
        return [...row(2, 0), ...row(3, 2 * a + 1), tx(a, -0.8, '2a'), tx(2 * a + 1 + 1.5 * a, -0.8, '3a')];
      },
    },
  };
  likeTerms.story = dressed(likeTerms, 'Two crates on the crate store shelf',
    s => { const { a } = s.params, v = s.derived; return `Two crates on the crate store shelf, a = ${a}: 2a + 3a = ${v.n2} + ${v.n3} = ${v.V}`; },
    items => [bench(-0.4, 17.4, -0.47), ...rounded(items, 3), label(-0.3, 1.8, 'the crate store', 'start')],
    { view: [-0.5, 17.5, -1.6, 2.4], box: [400, 95] });

  const bracket = {
    id: 'bracket', title: 'A rectangle 3 tall and x + 2 wide',
    params: { x: U(5, 3) },
    terms: ['w2', 'p1', 'p2'],
    derived: p => ({ p1: 3 * p.x, p2: 6, total: 3 * (p.x + 2) }),
    formula: '3(\\term{x}{x}+\\term{w2}{2})',
    live: s => `x = ${s.params.x}: 3 × ${s.params.x + 2} = ${s.derived.p1} + ${s.derived.p2} = ${s.derived.total}`,
    draw: {
      kind: '2d', view: [-1.5, 13.5, -0.6, 4.3], box: [400, 400 * 4.9 / 15],
      items: ({ params: { x } }) => [
        { type: 'polygon', term: 'p1', pts: sq(0, 0, x, 3) }, tx(x / 2, 1.5, String(3 * x), 'p1'),
        { type: 'polygon', term: 'p2', pts: sq(x, 0, x + 2, 3) }, tx(x + 1, 1.5, '6', 'p2'),
        tx(x / 2, 3.6, 'x', 'x'), tx(x + 1, 3.6, '2', 'w2'), tx(-0.7, 1.5, '3'),
      ],
    },
  };
  bracket.story = dressed(bracket, 'The bench board, 3 tall and x + 2 wide',
    s => { const { x } = s.params, v = s.derived; return `A bench board 3 tall and x + 2 wide, x = ${x}: 3 × ${x + 2} = ${v.p1} + ${v.p2} = ${v.total}`; },
    items => [bench(-1.2, 13.2, -0.55), ...rounded(items, 3), label(13.3, 3.6, 'the carpentry bench', 'end')],
    { view: [-1.5, 13.5, -0.9, 4.3], box: [400, 139] });

  const commonFactor = {
    id: 'common-factor', title: 'Share 6x + 9 into equal rows',
    params: { k: U(9, 1, 'k') },
    terms: ['p1', 'p2'],
    derived: p => ({ fits: 6 % p.k === 0 && 9 % p.k === 0 }),
    formula: '6x+9 = \\term{k}{k}(\\,?\\,)',
    live: s => {
      const k = s.params.k, bad = [[6, '6 x-pieces'], [9, '9 units']].filter(([n]) => n % k).map(([, w]) => `${w} do not`);
      const rows = `split into ${k} equal ${k === 1 ? 'row' : 'rows'}`;
      return `k = ${k}: ${bad.length ? `${bad.join(' and ')} ${rows}` : `6 x-pieces and 9 units both ${rows}`}`;
    },
    draw: {
      kind: '2d', view: [-0.5, 15.5, -0.5, 9.7], box: [400, 245],
      items: ({ params: { k } }) => {
        const q6 = Math.floor(6 / k), q9 = Math.floor(9 / k), out = [];
        const piece = (x0, y, w, term, label) => out.push({ type: 'polygon', term, pts: sq(x0, y, x0 + w, y + 0.7) }, ...(label ? [tx(x0 + w / 2, y + 0.35, 'x', term)] : []));
        for (let r = 0; r < k; r++) {
          const y = 8.2 - r * 0.9;
          for (let i = 0; i < q6; i++) piece(i * 1.5, y, 1.4, 'p1', true);
          for (let i = 0; i < q9; i++) piece(q6 * 1.5 + 0.2 + i * 0.6, y, 0.5, 'p2');
        }
        const y = 8 - k * 0.9;
        for (let i = 0; i < 6 - q6 * k; i++) piece(i * 1.5, y, 1.4, null, true);
        for (let i = 0; i < 9 - q9 * k; i++) piece(7 + i * 0.6, y, 0.5, null);
        return out;
      },
    },
  };
  commonFactor.story = dressed(commonFactor, 'Fen\'s cut pieces in the factor yard',
    s => `Fen lays the cut pieces out in the factor yard. ${commonFactor.live(s)}`,
    items => [rr(-0.3, -0.3, 15.3, 9.4, 8, { color: SAND, edge: SAND, alpha: 0.2, w: 3 }), ...rounded(items, 3), label(15.1, 9.95, 'the factor yard', 'end')],
    { view: [-0.5, 15.5, -0.5, 10.5], box: [400, 275] });

  const cutOff = {
    id: 'cut-off', title: 'A rectangle 2 tall with a 2 by 4 part cut off',
    params: { x: U(10, 7, 'x', 5) },
    terms: ['kept', 'cut'],
    derived: p => ({ kept: 2 * (p.x - 4) }),
    formula: '\\term{kept}{2(x-4)}',
    live: s => `x = ${s.params.x}: 2 × ${s.params.x - 4} = ${s.derived.kept}`,
    draw: {
      kind: '2d', view: [-1.5, 11.5, -0.6, 3.4], box: [400, 125],
      items: ({ params: { x } }) => [
        { type: 'polygon', term: 'kept', pts: sq(0, 0, x - 4, 2) }, tx((x - 4) / 2, 1, String(2 * (x - 4)), 'kept'),
        ...dashed(x - 4, 0, x, 2, 'cut'), tx(x - 2, 1.4, 'take away', 'cut', true), tx(x - 2, 0.6, '2 × 4', 'cut', true),
        tx(x / 2, 2.6, 'x', 'x'), tx(-0.7, 1, '2'),
      ],
    },
  };
  cutOff.story = dressed(cutOff, 'A plank with a corner sawn off',
    s => { const { x } = s.params; return `A bench board 2 tall with a 2 by 4 offcut sawn away, x = ${x}: 2 × ${x - 4} = ${s.derived.kept}`; },
    (items, s) => [bench(-1.2, 11.2, -0.55), rr(s.params.x - 4, 0, s.params.x, 2, 3, { color: SAND, edge: SAND, alpha: 0.3, stroke: false }),
      ...rounded(items, 3), label(11.3, 2.6, 'the carpentry bench', 'end')],
    { view: [-1.5, 11.5, -1, 3.4], box: [400, 135] });

  const diffSquares = {
    id: 'diff-squares', title: 'A square with a 3 by 3 corner cut out',
    params: { x: U(9, 6, 'x', 4) },
    terms: ['L', 'cut'],
    derived: p => ({ left: p.x * p.x - 9 }),
    formula: '\\term{L}{x^2-9}',
    live: s => `x = ${s.params.x}: ${s.params.x ** 2} − 9 = ${s.derived.left}`,
    draw: {
      kind: '2d', view: [-1.2, 10.4, -0.8, 10.4], box: [360, 360],
      items: ({ params: { x } }) => {
        const k = 9 / x, c = x - 3;
        return [
          { type: 'polygon', term: 'L', pts: [[0, 0], [c * k, 0], [c * k, 3 * k], [x * k, 3 * k], [x * k, x * k], [0, x * k]] },
          tx(x / 2 * k, (x + 3) / 2 * k, 'x² − 9', 'L'),
          ...dashed(c * k, 0, x * k, 3 * k, 'cut'), tx((x - 1.5) * k, 1.5 * k, '3 × 3', 'cut', true),
          tx(4.5, -0.5, 'x', 'x'), tx(-0.7, 4.5, 'x', 'x'),
        ];
      },
    },
  };
  diffSquares.story = dressed(diffSquares, 'The factor yard with a corner fenced off',
    s => { const { x } = s.params; return `A square yard, x = ${x} on a side, with a 3 by 3 corner fenced off: ${x ** 2} − 9 = ${s.derived.left}`; },
    (items, s) => {
      const k = 9 / s.params.x;
      return [rr(-0.15, -0.15, 9.15, 9.15, 6, { color: SAND, edge: SAND, alpha: 0.18, w: 4 }), rr((s.params.x - 3) * k, 0, 9, 3 * k, 3, { color: WOOD, edge: WOOD, alpha: 0.3, stroke: false }),
        ...items, label(4.5, 9.75, 'the factor yard')];
    },
    { view: [-1.2, 10.4, -1.1, 10.4], box: [360, 357] });

  const perfectSquare = {
    id: 'perfect-square', title: 'A square with two strips taken off',
    params: { x: U(9, 5, 'x', 3) },
    terms: ['sq', 'strips', 'back'],
    derived: p => ({ left: (p.x - 2) ** 2 }),
    formula: '\\term{x}{x}^2-\\term{strips}{4x}+\\term{back}{4}',
    live: s => `x = ${s.params.x}: ${s.params.x ** 2} − ${2 * s.params.x} − ${2 * s.params.x} + 4 = ${s.derived.left}`,
    draw: {
      kind: '2d', view: [-1.2, 10.4, -0.8, 10.4], box: [360, 360],
      items: ({ params: { x } }) => {
        const k = 9 / x, p = (x0, y0, x1, y1) => [x0 * k, y0 * k, x1 * k, y1 * k];
        return [
          { type: 'polygon', term: 'sq', pts: sq(...p(0, 2, x - 2, x)) }, tx((x - 2) / 2 * k, (x + 2) / 2 * k, String((x - 2) ** 2), 'sq'),
          { type: 'polygon', term: 'back', pts: sq(...p(x - 2, 0, x, 2)) }, tx((x - 1) * k, k, '+4', 'back'),
          ...dashed(...p(0, 0, x, 2), 'strips'), ...dashed(...p(x - 2, 0, x, x), 'strips'),
          tx((x - 2) / 2 * k, k, '−2x', 'strips'), tx((x - 1) * k, (x + 2) / 2 * k, '−2x', 'strips'),
          tx(4.5, -0.5, 'x', 'x'),
        ];
      },
    },
  };
  perfectSquare.story = dressed(perfectSquare, 'The factor yard with two strips taken off',
    s => { const { x } = s.params; return `A square yard, x = ${x} on a side, with two strips taken off: ${x ** 2} − ${2 * x} − ${2 * x} + 4 = ${s.derived.left}`; },
    (items, s) => {
      const k = 9 / s.params.x, strip = { color: WOOD, edge: WOOD, alpha: 0.25, stroke: false };
      return [rr(-0.15, -0.15, 9.15, 9.15, 6, { color: SAND, edge: SAND, alpha: 0.18, w: 4 }), rr(0, 0, 9, 2 * k, 3, strip), rr((s.params.x - 2) * k, 0, 9, 9, 3, strip),
        ...rounded(items, 3), label(4.5, 9.75, 'the factor yard')];
    },
    { view: [-1.2, 10.4, -1.1, 10.4], box: [360, 357] });

  const rootsOf = (b, c) => {
    const D = b * b - 4 * c;
    if (D < 0) return [];
    if (D === 0) return [-b / 2];
    return [(-b - Math.sqrt(D)) / 2, (-b + Math.sqrt(D)) / 2];
  };
  const fmt = v => String(+v.toFixed(2)).replace(/^-/, '−');
  const eqOf = (b, c) => `y = x²${b ? ` ${b < 0 ? '−' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}x` : ''}${c ? ` ${c < 0 ? '−' : '+'} ${Math.abs(c)}` : ''}`;
  const parabola = (view, cMin, ask) => { const plain = {
    id: 'parabola', title: 'The curve y = x² + bx + c and where it crosses the x-axis',
    params: { b: { min: -6, max: 6, step: 1, value: 0, label: 'b' }, c: { min: cMin, max: 9, step: 1, value: 3, label: 'c' } },
    terms: ['curve', 'root'],
    derived: p => ({ crossings: rootsOf(p.b, p.c).length }),
    formula: '\\term{curve}{y} = x^2+\\term{b}{b}\\,x+\\term{c}{c}\\qquad\\term{root}{y = 0}',
    live: s => {
      const r = rootsOf(s.params.b, s.params.c), eq = eqOf(s.params.b, s.params.c);
      return ask ? `${eq}: where does it meet the x-axis?` : `${eq}: ${!r.length ? 'it never reaches the x-axis' : r.length === 1 ? `it touches the x-axis at x = ${fmt(r[0])}` : `it crosses the x-axis at x = ${r.map(fmt).join(' and x = ')}`}`;
    },
    draw: {
      kind: '2d', view, box: [400, 400],
      items: ({ params: { b, c } }) => [
        { type: 'axes', xTicks: !ask },
        { type: 'fn', f: x => x * x + b * x + c, term: 'curve' },
        ...(ask ? [] : rootsOf(b, c).map(x => ({ type: 'point', x, y: 0, term: 'root' }))),
      ],
    },
  };
  const [x0, x1, y0] = view;
  const bed = (b, c, lo, hi) => Array.from({ length: 97 }, (_, i) => { const x = lo + (hi - lo) * i / 96; return [x, Math.min(x * x + b * x + c, view[3] + 1)]; });
  plain.story = dressed(plain, 'The millpond bed y = x² + bx + c and where the water meets the bank',
    s => {
      const r = rootsOf(s.params.b, s.params.c), eq = eqOf(s.params.b, s.params.c);
      return ask ? `The pond bed ${eq}: where does the water meet the bank?` : `The pond bed ${eq}: ${!r.length ? 'it stays above the water line, so the dip is dry' : r.length === 1 ? `it just touches the water at x = ${fmt(r[0])}` : `the water meets the bank at x = ${r.map(fmt).join(' and x = ')}`}`;
    },
    (items, { params: { b, c } }) => {
      const r = rootsOf(b, c);
      return [
        { type: 'polygon', pts: [...bed(b, c, x0, x1), [x1, y0 - 1], [x0, y0 - 1]], color: EARTH, alpha: 0.35, stroke: false },
        ...(r.length === 2 ? [{ type: 'polygon', pts: [...bed(b, c, r[0], r[1]), [r[0], 0]], color: WATER, alpha: 0.5, stroke: false }] : []),
        { type: 'polygon', pts: [[x0, 0], [x1, 0]], color: WATER, w: 3, dash: '7 5' },
        ...items, label(x0 + 0.3, 0.55, 'water line', 'start'),
      ];
    });
  return plain; };

  MQ.content = {
    track: 'algebra',
    ranks: [[0, 'Letter Learner'], [30, 'Box Builder'], [75, 'Volume Master'], [150, 'Bracket Opener'], [225, 'Balance Keeper'], [300, 'Factor Finder'], [375, 'Root Hunter']],
    chapters: [{
      id: 'algebra.expressions', name: 'Expressions and volume', badge: 'Crate Label',
      story: 'A crate marked with letters sits in the crate store, so you put its sizes in for the letters and work out its volume to find the crate\'s label.',
      intro: 'In the windmill workshop, Tinker Odd packed her strongbox into a crate and left its sizes as letters. In algebra, letters stand for numbers. A <b>variable</b> is a letter, like <code>a</code>, whose number can change. The crate on this page, drawn as a box, has length <code>a</code>, width <code>b</code> and height <code>c</code>. Its <b>volume</b>, how many 1 by 1 by 1 cubes fit inside, is <code>V = a · b · c</code>, where the dot <code>·</code> means ×. A line made of numbers, letters and operations is an <b>expression</b>. Move the sliders and watch the box, the formula and the numbers change together.',
      scene: box,
      missions: [
        { title: 'Letters for numbers', kind: 'number', scene: { ...box, live: 'V = {a}·{b}·{c} = ?' }, at: { a: 10, b: 5, c: 3 }, reveal: true, question: '10*5*3', tex: 'a \\cdot b \\cdot c \\;\\text{ with }\\; a = 10,\\ b = 5,\\ c = 3',
          goal: 'A crate is 10 long, 5 wide and 3 tall. Put those numbers in for the letters of <code>V = a · b · c</code> and work out the volume <code>V</code>.',
          how: [
            '<code>V = a · b · c</code> says: the volume is length times width times height. Each letter is a variable, waiting for its number.',
            '<code>a</code> is the length, 10; <code>b</code> is the width, 5; <code>c</code> is the height, 3. Swapping them in gives your first step, <code>10 · 5 · 3</code> (type <code>10*5*3</code>).',
            'Then multiply from left to right, as in Order of operations: <code>10 · 5</code> is 50, and <code>50 · 3</code> is 150.',
            'So 150 small cubes fit in the crate. Adding the edges, <code>10 + 5 + 3</code>, gives 18, which measures something else.',
          ],
          explain: 'The sliders in the scene change <code>a</code>, <code>b</code> and <code>c</code> on a smaller box. Each letter has one color: the same on its slider, in the formula and on its edges of the box.',
          hint: 'Swap each letter for its number: <code>10 · 5 · 3</code>. Then multiply.',
          answer: '150', wrong: '18', lazy: '10*5*3', check: finalNumber(150) },
        { title: 'One number in front', kind: 'expr', vars: ['c'], question: '5*2*c',
          goal: 'Another crate in the store is 5 long and 2 wide, but its height <code>c</code> can be anything. Its volume is <code>5 · 2 · c</code>. Write it with only one number in front of <code>c</code>.',
          how: [
            '<code>5 · 2 · c</code> multiplies three things: the two numbers can be multiplied now, and <code>c</code> waits until you know it.',
            '<code>5 · 2</code> is 10: numbers combine even with a letter next to them.',
            '<code>· c</code> stays as it is, because nobody has told you <code>c</code> yet.',
            'Write <code>10c</code>. A number right before a letter means they are multiplied, so <code>10c</code> is <code>10 · c</code>.',
          ],
          explain: 'To check an expression, the quest tries yours and the question with many different numbers for <code>c</code>. If they always agree, the two are equal.',
          hint: 'Multiply the numbers: what is <code>5 · 2</code>? Keep the <code>c</code>.',
          at: { a: 5, b: 2 }, answer: '10c', wrong: '7c', lazy: '5*2*c',
          check: v => {
            const r = MQ.check.expr(v, '10c', { vars: ['c'] });
            if (!r.ok) return r;
            return MQ.math.full.parse(v).filter(n => n.isConstantNode).length === 1 ? ok : { ok: false, why: 'That is equal, but it still has more than one number. Multiply the numbers together.' };
          } },
        { title: 'Double the length', kind: 'expr', at: { a: 1 }, vars: ['a', 'b', 'c'], question: '(2a*b*c)/(a*b*c)', tex: '\\frac{(2a) \\cdot b \\cdot c}{a \\cdot b \\cdot c}',
          goal: 'Odd could have made her crate twice as long: its length becomes <code>2a</code>. How many times bigger is the new volume? The question divides the new volume by the old one: cancel until no division is left.',
          how: [
            'The question is a <b>fraction</b>, the top divided by the bottom: the new volume, <code>(2a) · b · c</code>, over the old one, <code>a · b · c</code>. Its value says how many old boxes fit in the new one.',
            '<code>a</code>, <code>b</code> and <code>c</code> are on the top and on the bottom. Anything divided by itself is 1, like <code>6 ÷ 6</code>, so each pair <b>cancels</b>: you can cross it out.',
            'Cross out <code>a</code>, <code>b</code> and <code>c</code>, and only the <code>2</code> on top is left.',
            'So doubling one edge doubles the volume, whatever the box. Try it on the sliders: set <code>a</code> to 2, then 4, and watch <code>V</code>.',
          ],
          explain: 'The question itself has the same value as the answer, so it would pass a plain equality check. This mission also asks that no division is left, to show you cancelled.',
          hint: 'What is left on top once <code>a</code>, <code>b</code> and <code>c</code> are crossed out?',
          answer: '2', wrong: '2a', lazy: '(2a*b*c)/(a*b*c)',
          check: v => MQ.check.expr(v, '2', { vars: ['a', 'b', 'c'], form: 'noDivision' }) },
        { title: 'Make V = 64', kind: 'scene',
          goal: 'Set the length <code>a</code> to 4, then move the width and height until the volume <code>V</code> is 64.',
          how: [
            'You want <code>a · b · c = 64</code> with <code>a = 4</code>; the scene works out <code>V</code> each time you move a slider.',
            '<code>a = 4</code> fixes the length, so <code>b · c</code> has to make up the rest: 64 ÷ 4 is 16, so <code>b · c</code> must be 16.',
            '<code>b</code> and <code>c</code> each go from 1 to 6 on their sliders. Which two of those numbers multiply to 16?',
            'The live line under the box shows <code>V</code> as you go, and the mission passes the moment it reads 64.',
          ],
          explain: 'When all three edges are the same length, every face is a square: a box like that is called a <b>cube</b>.',
          hint: 'Try <code>b</code> at 4. What does <code>c</code> need to be?',
          answer: { a: 4, b: 4, c: 4 }, wrong: { a: 4, b: 4, c: 2 }, lazy: { a: 4, b: 2, c: 2 },
          check: s => s.params.a !== 4 ? { ok: false, why: 'Keep the length a at 4.' }
            : s.derived.V === 64 ? ok : { ok: false, why: `V is ${s.derived.V} now. You need 64.` } },
        { title: 'Add like terms', kind: 'expr', scene: likeTerms, vars: ['a'], question: '2a+3a',
          goal: 'Two crates stand side by side. Both are 1 wide and 1 tall; one is <code>2a</code> long and the other <code>3a</code>. Together their volume is <code>2a + 3a</code>. Write it as one number times <code>a</code>.',
          how: [
            '<code>2a + 3a</code> is two lots of <code>a</code> plus three more lots of <code>a</code>, like 2 apples and 3 apples.',
            '<code>2a</code> means <code>2 · a</code> and <code>3a</code> means <code>3 · a</code>: both count lots of the same thing, <code>a</code>.',
            'Adding the counts, <code>2 + 3</code>, gives 5 lots of <code>a</code>, written <code>5a</code>.',
            'Careful: <code>2a + 3a</code> is not <code>6a</code>. You add the counts; you do not multiply them.',
          ],
          explain: 'Parts with the same letter, like <code>2a</code> and <code>3a</code>, are called <b>like terms</b>. You add them by adding the numbers in front.',
          hint: 'How many lots of <code>a</code> are there altogether?',
          answer: '5a', wrong: '6a', lazy: '2a+3a',
          check: v => MQ.check.expr(v, '5a', { vars: ['a'], form: 'product' }) },
      ],
    }, {
      id: 'algebra.expanding', name: 'Expanding brackets', badge: 'Plank Plan',
      story: 'Odd\'s bench plans are written inside brackets, so you multiply them out at the carpentry bench to read the plank lengths and find the plank plan.',
      intro: 'At the carpentry bench, Odd\'s plans for the planks are written inside brackets. A bracket groups a sum so it can be multiplied as one piece: <code>3(x + 2)</code> means 3 times the whole of <code>x + 2</code>. <b>Expanding</b> means multiplying out until no bracket is left around a sum: <code>3(x + 2) = 3x + 6</code>. The rectangle on this page shows why it works. Its sides are <code>a + b</code> and <code>c + d</code>, so it splits into four smaller rectangles, and its area is the sum of theirs: <code>ac + ad + bc + bd</code>, where two letters side by side, like <code>ac</code>, mean <code>a · c</code>. Each part has the same color in the picture and in the formula.',
      scene: rect('area-split', 'A rectangle split into four parts', [2, 1, 3, 2], BENCH),
      missions: [
        { title: 'One number times a bracket', kind: 'expr', scene: bracket, vars: ['x'], question: '3(x+2)',
          goal: 'A bench board is a rectangle 3 tall and <code>x + 2</code> wide, so its area is <code>3(x + 2)</code>. Write that area with no brackets left.',
          how: [
            '<code>3(x + 2)</code> means 3 times the whole of <code>x + 2</code>: a number right before a bracket multiplies everything inside it.',
            'Split the rectangle where <code>x</code> meets 2. One part is 3 by <code>x</code>, with area <code>3x</code>; the other is 3 by 2, with area 6.',
            'The whole area is the two parts added: <code>3x + 6</code>.',
            'A common slip is <code>3x + 2</code>: the 3 multiplies the 2 as well, not only the <code>x</code>.',
          ],
          explain: 'Check it with a number: with <code>x = 1</code>, <code>3(1 + 2)</code> is 9, and <code>3 · 1 + 6</code> is 9 too. The quest checks your answer the same way, with many numbers for <code>x</code>.',
          hint: 'Multiply 3 by <code>x</code>, then 3 by 2, and add the two.',
          answer: '3x+6', wrong: '3x+2', lazy: '3(x+2)', check: finalExpr('3x+6', ['expanded', 'collected']) },
        { title: 'A minus sign in front', kind: 'expr', scene: cutOff, vars: ['x'], question: '-2(x-4)',
          goal: 'Expand <code>−2(x − 4)</code>: multiply <code>−2</code> by each part inside, and write it with no brackets. A length cannot be negative, so the scene shows <code>2(x − 4)</code>: a 2 by <code>x</code> rectangle with a 2 by 4 part taken away. Then work out what the minus in front does.',
          how: [
            '<code>−2(x − 4)</code> multiplies the whole of <code>x − 4</code> by <code>−2</code>. Read <code>x − 4</code> as <code>x</code> plus <code>−4</code>, so there are two parts to multiply.',
            '<code>−2</code> times <code>x</code> is <code>−2x</code>.',
            '<code>−2</code> times <code>−4</code> is <code>+8</code>: a negative number times a negative number is positive.',
            'Together that is <code>−2x + 8</code> (type <code>-2x+8</code>). The minus in front flipped the sign of both parts.',
          ],
          explain: 'The slip to watch for is <code>−2x − 8</code>, which flips the first sign but not the second. Try <code>x = 0</code>: <code>−2(0 − 4)</code> is 8, not −8.',
          hint: 'Two multiplications: <code>−2 · x</code> and <code>−2 · (−4)</code>. What is a minus times a minus?',
          answer: '-2x+8', wrong: '-2x-8', lazy: '-2(x-4)', check: finalExpr('-2x+8', ['expanded', 'collected']) },
        { title: 'Two brackets', kind: 'expr', at: { a: 2, b: 1, c: 2, d: 3 }, vars: ['x'], question: '(x+1)(x+3)',
          goal: 'A bigger bench board is a rectangle <code>x + 1</code> tall and <code>x + 3</code> wide. Expand <code>(x + 1)(x + 3)</code> into one sum, and add up the like terms.',
          how: [
            '<code>(x + 1)(x + 3)</code> multiplies every part of the first bracket by every part of the second: like the scene, the rectangle splits into four smaller ones.',
            '<code>x</code> times <code>x</code> is written <code>x²</code>, said "x squared" (type <code>x^2</code>). <code>x</code> times 3 is <code>3x</code>.',
            '1 times <code>x</code> is <code>x</code>, and 1 times 3 is 3. So the four areas are <code>x² + 3x + x + 3</code>.',
            '<code>3x</code> and <code>x</code> are like terms, and together they make <code>4x</code>. The answer is <code>x² + 4x + 3</code>.',
          ],
          explain: 'This is the scene with <code>a</code> and <code>c</code> both standing for <code>x</code>, <code>b = 1</code> and <code>d = 3</code>. The scene opens on it for <code>x = 2</code> (a = 2, b = 1, c = 2, d = 3): the parts are 4, 6, 2 and 3.',
          hint: 'Four multiplications: each of <code>x</code> and 1 times each of <code>x</code> and 3. Then add the two <code>x</code> terms.',
          answer: 'x^2+4x+3', wrong: 'x^2+3', lazy: '(x+1)(x+3)', check: finalExpr('x^2+4x+3', ['expanded', 'collected']) },
        { title: 'A bracket squared', kind: 'expr', at: { a: 3, b: 2, c: 3, d: 2 }, vars: ['x'], question: '(x+2)^2',
          goal: 'Expand <code>(x + 2)²</code>. The small raised 2 means "times itself", so <code>(x + 2)²</code> is <code>(x + 2)(x + 2)</code>.',
          how: [
            '<code>(x + 2)²</code> is the area of a square with side <code>x + 2</code>: <code>(x + 2)(x + 2)</code>.',
            'Multiply every part by every part: <code>x · x = x²</code>, <code>x · 2 = 2x</code>, <code>2 · x = 2x</code> and <code>2 · 2 = 4</code>.',
            'The two middle parts are like terms: <code>2x + 2x = 4x</code>.',
            'So <code>(x + 2)² = x² + 4x + 4</code>. The slip <code>x² + 4</code> forgets the two middle parts.',
          ],
          explain: 'Squaring a sum is not the same as squaring each part. With <code>x = 1</code>, <code>(1 + 2)²</code> is 9, while <code>1² + 2²</code> is only 5. The next mission shows the missing pieces.',
          hint: 'Write it as <code>(x + 2)(x + 2)</code> and expand it like the last mission.',
          answer: 'x^2+4x+4', wrong: 'x^2+4', lazy: '(x+2)^2', check: finalExpr('x^2+4x+4', ['expanded', 'collected']) },
        { title: 'The missing middle', kind: 'scene',
          goal: 'Make a square whose top-left part <code>ac</code> is 9 and whose bottom-right part <code>bd</code> is 4. Then look at the two middle parts.',
          how: [
            'A square is as tall as it is wide, so <code>a + b</code> must equal <code>c + d</code>. Its four parts are the four terms of <code>(a + b)(c + d)</code>.',
            '<code>ac = 9</code>: which two slider numbers multiply to 9?',
            '<code>bd = 4</code>, and the sides have to match, so <code>b</code> and <code>d</code> are the same number too. Which number times itself is 4?',
            'Now read the live line: the whole square is 25, but 9 + 4 is only 13. The two middle parts, <code>ad</code> and <code>bc</code>, make up the rest.',
          ],
          explain: 'The top-left and bottom-right parts are squares, and the two middle parts are the same size. Those two middle parts are why <code>(x + 2)²</code> has <code>4x</code> in it.',
          hint: 'Try <code>a</code> and <code>c</code> at 3.',
          answer: { a: 3, b: 2, c: 3, d: 2 }, wrong: { a: 3, b: 1, c: 3, d: 4 }, lazy: {},
          check: s => {
            const p = s.params, { ac, bd } = s.derived;
            if (p.a + p.b !== p.c + p.d) return no(`That is a rectangle ${p.a + p.b} tall and ${p.c + p.d} wide. Make the two sides equal.`);
            return ac === 9 && bd === 4 ? ok : no(`The corners are ac = ${ac} and bd = ${bd}. You need 9 and 4.`);
          } },
      ],
    }, {
      id: 'algebra.linear', name: 'Linear equations', badge: 'Brass Weight',
      story: 'The workshop scale in the balance room must stay level while a hidden weight is found, so you do the same to both sides to find the brass weight.',
      intro: 'In the balance room, the workshop scale holds a hidden brass weight, and Sprocket the hedgehog keeps tipping it. An <b>equation</b> says that two sides are equal, like <code>2x + 3 = 11</code>. <b>Solving</b> it means finding the number <code>x</code> stands for that makes it true: that number is the <b>solution</b>. The one rule is to do the same thing to both sides, so they stay equal, just as a balance scale stays level when you take the same weight off each side. Each line of your working is a new, simpler equation with the same solution, and your last line reads <code>x =</code> and a number. These are <b>linear</b> equations: <code>x</code> appears only on its own, never as <code>x²</code>.',
      scene: balance(3),
      missions: [
        { title: 'Undo the steps', kind: 'equation', question: '2x+3=11', work: 'required',
          goal: 'Solve <code>2x + 3 = 11</code>. This one checks your working: write at least one step before your answer, and every step must keep the same solution.',
          how: [
            '<code>2x + 3 = 11</code> says: double a number, add 3, and you get 11. Solving it means undoing those steps, the last one first.',
            'The last thing done was <code>+ 3</code>, so take 3 off both sides: <code>2x = 8</code>.',
            'Before that, <code>x</code> was doubled, so halve both sides: <code>x = 4</code>.',
            'Check by putting 4 back in: <code>2 · 4 + 3</code> is 11. It works.',
          ],
          explain: 'Each line is checked against the question: it passes if it has the same solution. So a slip marks only the line with the slip.',
          hint: 'What can you do to both sides to get rid of the <code>+ 3</code>?',
          steps: ['2x=8', 'x=4'],
          scene: balance(4), at: { bl: 2, ul: 3, br: 0, ur: 11 },
          answer: 'x=4', wrong: 'x=7', lazy: '2x+3=11', check: MQ.check.final.solved(4) },
        { title: 'Brackets, and x on both sides', kind: 'equation', question: '3(x-1)=x+5', work: 'required',
          goal: 'Solve <code>3(x − 1) = x + 5</code>. Expand the bracket first, then get every <code>x</code> onto one side. Write your working. A scale cannot hold a minus, so the scene starts one step in, after expanding and adding 3 to both sides: <code>3x = x + 8</code>.',
          how: [
            'The equation has <code>x</code> on both sides. The plan: expand, gather the <code>x</code> terms on one side, then undo the rest as before.',
            'Expand <code>3(x − 1)</code>, as in Expanding brackets: <code>3x − 3 = x + 5</code>.',
            'Take <code>x</code> off both sides, so only one side has an <code>x</code>: <code>2x − 3 = 5</code>.',
            'Add 3 to both sides, <code>2x = 8</code>, then halve both: <code>x = 4</code>.',
          ],
          explain: 'Taking <code>x</code> off both sides is allowed: <code>x</code> is a number, even if you do not know it yet. On the scale, it is lifting one box off each side.',
          hint: 'After expanding, take <code>x</code> away from both sides.',
          steps: ['3x-3=x+5', '2x-3=5', '2x=8', 'x=4'],
          scene: balance(4), at: { bl: 3, ul: 0, br: 1, ur: 8 },
          answer: 'x=4', wrong: 'x=3', lazy: '3(x-1)=x+5', check: MQ.check.final.solved(4) },
        { title: 'Half of x', kind: 'equation', question: 'x/2+1=4', work: 'required',
          goal: 'Solve <code>x/2 + 1 = 4</code>: half of a number, plus 1, is 4. Write your working. A scale cannot hold half a box, so the scene shows both sides doubled: <code>x + 2 = 8</code>.',
          how: [
            '<code>x/2</code> is a fraction, <code>x</code> divided by 2, or half of <code>x</code>. The equation says half of the number, plus 1, makes 4.',
            'Undo the <code>+ 1</code> first: take 1 off both sides, <code>x/2 = 3</code>.',
            'Undo the halving: multiply both sides by 2, <code>x = 6</code>.',
            'Check: half of 6 is 3, and 3 + 1 is 4.',
          ],
          explain: 'Multiplying both sides by the bottom number of a fraction is the usual way to clear it. The slip <code>x = 1.5</code> divides by 2 instead of multiplying.',
          hint: 'Get <code>x/2</code> alone first. Then: half of what is 3?',
          steps: ['x/2=3', 'x=6'],
          scene: balance(6), at: { bl: 1, ul: 2, br: 0, ur: 8 },
          answer: 'x=6', wrong: 'x=1.5', lazy: 'x/2+1=4', check: MQ.check.final.solved(6) },
        { title: 'An answer that is a fraction', kind: 'equation', question: '3x+2=7',
          goal: 'Solve <code>3x + 2 = 7</code>. The answer is not a whole number: write it as a fraction, like <code>x = 4/5</code>.',
          how: [
            'Same plan as before: undo the <code>+ 2</code>, then undo the times 3.',
            'Take 2 off both sides: <code>3x = 5</code>.',
            'Divide both sides by 3: <code>x = 5/3</code>. 5 does not share into 3 equal whole numbers, so the answer stays a fraction.',
            'As a decimal, <code>5/3</code> is 1.666… and never stops, so the fraction is the exact answer.',
          ],
          explain: 'Check it by putting your <code>x</code> back in: <code>3x + 2</code> should come to exactly 7. A rounded decimal does not pass, because it only comes close to 7.',
          hint: 'After taking 2 off both sides you have <code>3x = 5</code>. Five divided by three is a fraction.',
          scene: balance(5 / 3), at: { bl: 3, ul: 2, br: 0, ur: 7 },
          answer: 'x=5/3', wrong: 'x=3', lazy: '3x+2=7', check: MQ.check.final.solved('5/3') },
        { title: 'Keep it level', kind: 'scene',
          goal: 'The workshop scale shows <code>2x + 3 = 9</code>: two boxes and 3 weights on the left, 9 weights on the right, and it is level. Every box weighs the same unknown amount, <code>x</code>, and each weight is 1. Change both sides the same way until one box sits alone on the left and the scale is level again.',
          how: [
            'A level scale is an equation: the left side weighs the same as the right. The sliders <code>p</code>, <code>q</code>, <code>r</code> and <code>s</code> count what sits on each side.',
            'Take one weight off the left and the scale tips. Take one off the right too, and it is level again: the same change to both sides keeps it level.',
            'Take all 3 weights off the left, and 3 off the right: now it shows <code>2x = 6</code>.',
            'Then halve both sides: one box on the left, and half the weights on the right.',
          ],
          explain: 'Each change you make is one line of working: doing the same thing to both sides keeps the equation true and the scale level.',
          hint: 'Clear the weights off the left first, taking the same number off the right each time.',
          answer: { bl: 1, ul: 0, br: 0, ur: 3 }, wrong: { bl: 1, ul: 0, br: 0, ur: 6 }, lazy: {},
          check: s => {
            const p = s.params, many = (n, w) => `${n} ${n === 1 ? w : w + (w === 'box' ? 'es' : 's')}`;
            if (p.br) return no('Keep the right side to weights only: take the boxes off it.');
            if (p.bl !== 1 || p.ul) return no(`Keep going until one box is alone on the left. Now the left has ${many(p.bl, 'box')} and ${many(p.ul, 'weight')}.`);
            return s.derived.scale === 'level' ? ok : no(`One box is alone, but the scale is not level: the ${s.derived.scale.replace(' down', '')} is heavier.`);
          } },
      ],
    }, {
      id: 'algebra.factoring', name: 'Factoring', badge: 'Strongbox Key',
      story: 'Fen has a heap of cut pieces to share into equal rows in the factor yard, so you write each sum as brackets to find the key to the strongbox.',
      intro: 'In the factor yard, Fen has a heap of cut planks to share into equal rows, and the strongbox key hangs on the right arrangement. <b>Factoring</b> is expanding run backwards. You start with a sum, like <code>x² + 5x + 6</code>, and write it as a product, like <code>(x + 2)(x + 3)</code>. Each thing being multiplied is a <b>factor</b>: 2 and 3 are factors of 6, and <code>x + 2</code> is a factor of <code>x² + 5x + 6</code>. Remember that <code>x²</code> means <code>x · x</code>. In the scene you know the four parts of the rectangle, and you look for its sides.',
      scene: rect('area-backwards', 'Find the sides from the four parts', [1, 1, 1, 1], YARD),
      missions: [
        { title: 'Take out a common factor', kind: 'expr', scene: commonFactor, vars: ['x'], question: '6x+9',
          goal: 'Write <code>6x + 9</code> as a whole number times a bracket. Find the biggest number that divides both 6 and 9 exactly, and take it out in front. In the scene, 6 pieces of <code>x</code> and 9 single units are shared into <code>k</code> equal rows: the pieces that do not fit wait below.',
          how: [
            'Factoring <code>6x + 9</code> means finding a number and a bracket that multiply back to it: expanding your answer must give <code>6x + 9</code> again.',
            '6 is <code>3 · 2</code> and 9 is <code>3 · 3</code>, so 3 divides both. It is a <b>common factor</b>.',
            'Take the 3 out in front, and write what is left of each part inside the bracket: <code>3(2x + 3)</code>.',
            'Check by expanding: <code>3 · 2x</code> is <code>6x</code>, and <code>3 · 3</code> is 9.',
          ],
          explain: '<code>1 · (6x + 9)</code> is equal too, but it takes nothing out, so it does not pass.',
          hint: 'Which number goes into both 6 and 9? Divide each part by it.',
          answer: '3(2x+3)', wrong: '3(2x+9)', lazy: '6x+9',
          check: v => {
            const r = MQ.check.expr(v, '6x+9', { form: ['product', 'wholeNumbers'] });
            if (!r.ok) return r;
            let n = strip(full.parse(v));
            if (n.isOperatorNode && n.fn === 'unaryMinus') n = strip(n.args[0]);
            if (n.filter(m => m.isOperatorNode && m.op === '/').length) return no('That is equal, but keep whole numbers inside the bracket. Take out a number that divides both 6 and 9 exactly.');
            const front = n.isOperatorNode && n.op === '*' ? n.args.map(strip).filter(a => a.isConstantNode) : [];
            return front.some(a => Number.isInteger(a.value) && a.value > 1) ? ok : no('That is equal, but no whole number is taken out in front yet. Which number divides both 6 and 9?');
          } },
        { title: 'Back into two brackets', kind: 'expr', vars: ['x'], question: 'x^2+5x+6',
          goal: 'Factor <code>x² + 5x + 6</code> into two brackets, <code>(x + ?)(x + ?)</code>.',
          how: [
            'You want two brackets that expand back to <code>x² + 5x + 6</code>. Expanding <code>(x + p)(x + q)</code> gives <code>x² + (p + q)x + pq</code>, where <code>pq</code> means <code>p · q</code>.',
            'So you need two numbers that multiply to 6, the number on its own, and add to 5, the number in front of <code>x</code>.',
            'Pairs that multiply to 6: 1 and 6, which add to 7, and 2 and 3, which add to 5. It is 2 and 3.',
            'The answer is <code>(x + 2)(x + 3)</code>. Expand it to check: <code>x² + 3x + 2x + 6</code>.',
          ],
          explain: 'The order does not matter: <code>(x + 3)(x + 2)</code> is the same product, and it passes too. In the scene, the sides of the rectangle are the factors, and its four parts are the expanded form.',
          hint: 'Two numbers: they multiply to 6 and add to 5.',
          answer: '(x+2)(x+3)', wrong: '(x+1)(x+6)', lazy: 'x^2+5x+6', check: finalExpr('x^2+5x+6', ['linearFactors', 'wholeNumbers']) },
        { title: 'A difference of squares', kind: 'expr', scene: diffSquares, vars: ['x'], question: 'x^2-9',
          goal: 'Factor <code>x² − 9</code> into two brackets. There is no <code>x</code> term, and that is a clue. The scene shows a square of side <code>x</code> with a 3 by 3 corner cut out; what is left has the area <code>x² − 9</code>.',
          how: [
            '<code>x² − 9</code> is <code>x</code> times itself, minus 3 times itself: one square taken away from another.',
            'Use the idea from the last mission: two numbers that multiply to <code>−9</code> and add to 0, because there is no <code>x</code> term (0 lots of <code>x</code>).',
            '3 and <code>−3</code> work: <code>3 · (−3)</code> is <code>−9</code>, and <code>3 + (−3)</code> is 0.',
            'So <code>x² − 9 = (x − 3)(x + 3)</code>. Expand it, and the middle parts <code>3x</code> and <code>−3x</code> cancel out.',
          ],
          explain: 'This pattern has a name, the <b>difference of two squares</b>: any <code>x² − n²</code> factors as <code>(x − n)(x + n)</code>.',
          hint: 'Which number times itself is 9? One bracket gets a plus, the other a minus.',
          answer: '(x-3)(x+3)', wrong: '(x-3)^2', lazy: 'x^2-9', check: finalExpr('x^2-9', ['linearFactors', 'wholeNumbers']) },
        { title: 'A perfect square', kind: 'expr', scene: perfectSquare, vars: ['x'], question: 'x^2-4x+4',
          goal: 'Factor <code>x² − 4x + 4</code>. Both brackets turn out the same. The scene shows a square of side <code>x</code> with two strips, each 2 wide, taken away; the 2 by 2 corner is in both strips, so it is added back.',
          how: [
            'Again you want <code>(x + p)(x + q)</code>, where <code>p</code> and <code>q</code> multiply to 4 and add to <code>−4</code>.',
            'Two numbers that add to a negative number but multiply to a positive one are both negative.',
            '<code>−2</code> and <code>−2</code> multiply to 4 and add to <code>−4</code>.',
            'So it is <code>(x − 2)(x − 2)</code>, which you can write <code>(x − 2)²</code>.',
          ],
          explain: 'Compare it with <code>(x + 2)² = x² + 4x + 4</code> from Expanding brackets: the sign of the middle term is the sign inside the bracket. A sum that is one bracket times itself is called a <b>perfect square</b>.',
          hint: 'Look for two equal numbers that multiply to 4 and add to <code>−4</code>.',
          answer: '(x-2)^2', wrong: '(x+2)^2', lazy: 'x^2-4x+4', check: finalExpr('x^2-4x+4', ['linearFactors', 'wholeNumbers']) },
        { title: 'Find the sides', kind: 'scene',
          goal: 'A rectangle has the four parts <code>ac = 6</code>, <code>ad = 3</code>, <code>bc = 4</code> and <code>bd = 2</code>. Move the side sliders until it has exactly those parts.',
          how: [
            'This is expanding run backwards: the parts are known, and the sides <code>a + b</code> and <code>c + d</code> are what you look for.',
            '<code>ac = 6</code> and <code>ad = 3</code> share the side <code>a</code>, so <code>a</code> is a common factor of 6 and 3.',
            'With <code>a</code> chosen, <code>c</code> is 6 divided by <code>a</code>, and <code>d</code> is 3 divided by <code>a</code>. Then <code>bc = 4</code> tells you <code>b</code>.',
            'Check <code>bd</code> last: it must come to 2.',
          ],
          explain: 'The four parts add up to the whole area, and so does one side times the other. Finding the sides of the rectangle from its parts is factoring.',
          hint: 'Which number divides both 6 and 3, other than 1? Try it for <code>a</code>.',
          answer: { a: 3, b: 2, c: 2, d: 1 }, wrong: { a: 2, b: 2, c: 3, d: 1 }, lazy: {},
          check: s => {
            const want = { ac: 6, ad: 3, bc: 4, bd: 2 }, off = Object.keys(want).filter(k => s.derived[k] !== want[k]);
            return off.length ? no(`Not yet: ${off.map(k => `${k} is ${s.derived[k]}, not ${want[k]}`).join('; ')}.`) : ok;
          } },
      ],
    }, {
      id: 'algebra.quadratics', name: 'Quadratic equations', badge: 'Strongbox',
      story: 'The bed of the millpond dips below the water line, so you solve for both spots where the water meets the bank to find the strongbox.',
      intro: 'The key fits a strongbox Odd sank in the millpond, where its bed dips below the water. A <b>quadratic equation</b> has an <code>x²</code> in it, like <code>x² + 5x + 6 = 0</code>. It can have two solutions, one, or none. The key fact: if two numbers multiply to 0, at least one of them is 0. So factor one side, keep 0 on the other, and set each factor to 0. Write every solution on your last line, joined by <code>or</code> or a comma: <code>x = 1 or x = 2</code>. With the math keyboard on, <code>or</code> shows as ∨, a sign that means "or". The scene draws, for each <code>x</code>, a point at height <code>y = x² + bx + c</code>; together the points make a curve. It crosses the flat <b>x-axis</b>, where <code>y = 0</code>, exactly at the solutions of <code>x² + bx + c = 0</code>.',
      scene: parabola([-6, 6, -7, 10], 0),
      missions: [
        { title: 'Factor, then split', kind: 'equation', scene: parabola([-6, 6, -7, 10], 0, true), at: { b: 5, c: 6 }, reveal: true, question: 'x^2+5x+6=0',
          goal: 'Solve <code>x² + 5x + 6 = 0</code>. You factored this left side in Factoring. Find both solutions.',
          how: [
            'The equation asks which numbers make <code>x² + 5x + 6</code> come to 0. Factoring turns it into two smaller questions.',
            'Factor the left side: <code>(x + 2)(x + 3) = 0</code>.',
            'Two brackets multiply to 0, so one of them is 0: <code>x + 2 = 0</code> or <code>x + 3 = 0</code>.',
            'Solve each one: <code>x = −2</code> or <code>x = −3</code>. Write both on your last line (type <code>x=-2 or x=-3</code>).',
          ],
          explain: 'Check each answer by putting it back in: <code>x² + 5x + 6</code> should come to 0. A common slip forgets that <code>x + 2 = 0</code> needs a negative <code>x</code>.',
          hint: 'Factor first. Then ask: what makes <code>x + 2</code> zero? What makes <code>x + 3</code> zero?',
          steps: ['(x+2)(x+3)=0', 'x=-2 or x=-3'],
          answer: 'x=-2 or x=-3', wrong: 'x=2 or x=3', lazy: 'x^2+5x+6=0', check: MQ.check.final.roots([-2, -3]) },
        { title: 'Two square roots', kind: 'equation', scene: parabola([-6, 6, -18, 12], -16, true), at: { b: 0, c: -16 }, reveal: parabola([-6, 6, -18, 12], -16), question: 'x^2=16',
          goal: 'Solve <code>x² = 16</code>. Which numbers times themselves make 16? There are two.',
          how: [
            '<code>x² = 16</code> asks for every number that, times itself, gives 16.',
            '4 works: <code>4 · 4 = 16</code>.',
            '<code>−4</code> works too: <code>(−4) · (−4)</code> is also 16, because a minus times a minus is a plus.',
            'So <code>x = 4 or x = −4</code>. Stopping at <code>x = 4</code> loses a solution.',
          ],
          explain: 'The <b>square root</b> of 16, written <code>√16</code>, is only the positive one. An equation with <code>x²</code> wants the negative one too. Another way: <code>x² − 16 = 0</code> is a difference of two squares, so it factors into two brackets.',
          hint: 'What about a negative number times itself?',
          answer: 'x=4 or x=-4', wrong: 'x=4', lazy: 'x^2=16', check: MQ.check.final.roots([4, -4]) },
        { title: 'Do not divide by x', kind: 'equation', scene: parabola([-6, 6, -7, 10], 0, true), at: { b: -3, c: 0 }, reveal: true, question: 'x^2-3x=0',
          goal: 'Solve <code>x² − 3x = 0</code>. It is tempting to divide both sides by <code>x</code>: see what that would lose.',
          how: [
            'Both parts of <code>x² − 3x</code> have an <code>x</code>, so <code>x</code> is a common factor, as in Factoring.',
            'Take it out: <code>x(x − 3) = 0</code>.',
            'One factor is 0: either <code>x = 0</code>, or <code>x − 3 = 0</code>, which gives <code>x = 3</code>.',
            'So <code>x = 0 or x = 3</code>. Dividing both sides by <code>x</code> leaves only <code>x = 3</code>: it throws away <code>x = 0</code>, because nothing can be divided by 0.',
          ],
          explain: 'Put each answer back in: both should make <code>x² − 3x</code> come to 0. Dividing both sides by <code>x</code> loses a solution, and the working area marks a step that does that.',
          hint: 'Take <code>x</code> out as a common factor, then set each factor to 0.',
          answer: 'x=0 or x=3', wrong: 'x=3', lazy: 'x^2-3x=0', check: MQ.check.final.roots([0, 3]) },
        { title: 'One root, twice', kind: 'equation', scene: parabola([-6, 6, -7, 10], 0, true), at: { b: -6, c: 9 }, reveal: true, question: 'x^2-6x+9=0',
          goal: 'Solve <code>x² − 6x + 9 = 0</code>. Both of its factors are the same, so it has just one solution: write it once.',
          how: [
            'Factor first: you need two numbers that multiply to 9 and add to <code>−6</code>.',
            '<code>−3</code> and <code>−3</code> do it, so the equation is <code>(x − 3)² = 0</code>, a perfect square.',
            'Both brackets say the same thing, <code>x − 3 = 0</code>, so <code>x = 3</code>.',
            'The solution comes out twice, but it is one number: write <code>x = 3</code>.',
          ],
          explain: 'A <b>root</b> is another word for a solution, and one that comes from both factors is a <b>repeated root</b>. In the scene, a curve with a repeated root does not cross the x-axis: it just touches it.',
          hint: 'Factor it the way you factored <code>x² − 4x + 4</code>.',
          answer: 'x=3', wrong: 'x=-3', lazy: 'x^2-6x+9=0', check: MQ.check.final.roots([3]) },
        { title: 'Roots on the curve', kind: 'scene',
          goal: 'Move <code>b</code> and <code>c</code> until the pond bed, the curve, crosses the x-axis at <code>x = 1</code> and <code>x = 4</code>.',
          how: [
            'The curve crosses the x-axis where <code>x² + bx + c = 0</code>, so its crossing points are the solutions of that equation.',
            'You want the solutions 1 and 4, so the equation is <code>(x − 1)(x − 4) = 0</code>: each bracket is 0 at one of them.',
            'Expand <code>(x − 1)(x − 4)</code>, as in Expanding brackets, and read off <code>b</code> and <code>c</code>.',
            'Or explore: <code>c</code> lifts the whole curve up and down, and <code>b</code> slides it sideways while moving it down.',
          ],
          explain: 'The crossings multiply to <code>c</code> and add to <code>b</code> with its sign flipped. Try it on any curve that crosses twice.',
          hint: 'Expand <code>(x − 1)(x − 4)</code>.',
          answer: { b: -5, c: 4 }, wrong: { b: 5, c: 4 }, lazy: {},
          check: s => {
            const r = rootsOf(s.params.b, s.params.c);
            if (r.length === 2 && r[0] === 1 && r[1] === 4) return ok;
            return no(!r.length ? 'The curve does not reach the x-axis yet. Try a smaller c, or move b further from 0.' : `It ${r.length === 1 ? 'touches' : 'crosses'} at x = ${r.map(fmt).join(' and x = ')}. You need 1 and 4.`);
          } },
      ],
    }],
    quickfire: [{
      ch: 0,
      make: r => {
        const n = () => 1 + Math.floor(r() * 9), p = n(), q = n(), s = n(), a = p * q + s;
        return { q: `${p}*${q}+${s}`, show: `p · q + r, with p = ${p}, q = ${q}, r = ${s}`, a, why: `${p} · ${q} = ${p * q} comes first, then + ${s} gives ${a}.` };
      },
    }, {
      ch: 1,
      make: r => {
        const n = () => 1 + Math.floor(r() * 9), p = n(), q = n();
        return { q: `${p}+${q}`, show: `(x + ${p})(x + ${q}) = x² + ?x + ${p * q}: what number goes before x?`, a: p + q, why: `The two middle parts are ${q}x and ${p}x, so there are ${p} + ${q} = ${p + q} lots of x.` };
      },
    }, {
      ch: 2,
      make: r => {
        const x = 1 + Math.floor(r() * 9), a = 2 + Math.floor(r() * 4), b = 1 + Math.floor(r() * 9), c = a * x + b;
        return { q: `(${c}-${b})/${a}`, show: `${a}x + ${b} = ${c}: what is x?`, a: x, why: `Take ${b} off both sides: ${a}x = ${c - b}. Then divide both sides by ${a}: x = ${x}.` };
      },
    }, {
      ch: 3,
      make: r => {
        const n = () => 1 + Math.floor(r() * 9), p = n(), q = n();
        return { q: `${p * q}/${p}`, show: `x² + ${p + q}x + ${p * q} = (x + ${p})(x + ?): what is the missing number?`, a: q, why: `The two numbers multiply to ${p * q} and add to ${p + q}: they are ${p} and ${q}.` };
      },
    }, {
      ch: 4,
      make: r => {
        const k = 2 + Math.floor(r() * 11);
        return { q: `${k * k}/${k}`, show: `x² = ${k * k}: what is the positive solution?`, a: k, why: `${k} · ${k} = ${k * k}. The other solution is −${k}.` };
      },
    }],
    guide: [
      { ch: 0, title: 'What a variable is',
        what: 'A variable is a letter that stands for a number. In <code>V = a · b · c</code> the letters are the length, width and height of a box: change one and <code>V</code> changes with it. A number right before a letter means times, so <code>10c</code> is <code>10 · c</code>.' },
      { ch: 0, title: 'The volume of a box',
        what: 'The volume of a box is its length times its width times its height.',
        tex: 'V = a \\cdot b \\cdot c', scene: true,
        proof: 'Lay a row of <code>a</code> small cubes along the length. <code>b</code> rows side by side make one layer of <code>a · b</code> cubes, and <code>c</code> layers stacked up make <code>a · b · c</code>.' },
      { ch: 1, title: 'Expanding one bracket',
        what: 'A number in front of a bracket multiplies every part inside: <code>3(x + 2) = 3x + 6</code>. A minus in front flips every sign inside: <code>−2(x − 4) = −2x + 8</code>.' },
      { ch: 1, title: 'Two brackets: the rectangle',
        what: 'To multiply two brackets, multiply every part of one by every part of the other, then add the like terms.',
        tex: '(a+b)(c+d) = ac+ad+bc+bd', scene: true,
        proof: 'A rectangle <code>a + b</code> tall and <code>c + d</code> wide splits into four smaller rectangles. Their areas are <code>ac</code>, <code>ad</code>, <code>bc</code> and <code>bd</code>, and together they fill the whole one.' },
      { ch: 2, title: 'The same thing to both sides',
        what: 'An equation stays true when you add the same number to both sides, take it away, or multiply or divide both sides by it (as long as it is not 0). Each time, undo the last thing that was done to <code>x</code>, until <code>x</code> is alone.', scene: true },
      { ch: 2, title: 'Checking a solution',
        what: 'Put your answer back into the question. For <code>2x + 3 = 11</code> and <code>x = 4</code>, <code>2 · 4 + 3</code> is 11, so both sides match. A fraction is exact; a rounded decimal is a little off.' },
      { ch: 3, title: 'A common factor',
        what: 'When every part of a sum shares a factor, take it out in front: <code>6x + 9 = 3(2x + 3)</code>. Expanding your answer must give back what you started with.' },
      { ch: 3, title: 'Factoring x² + bx + c',
        what: 'Look for two numbers that multiply to <code>c</code> and add to <code>b</code>. For <code>x² + 5x + 6</code> they are 2 and 3, so it factors as <code>(x + 2)(x + 3)</code>.',
        tex: 'x^2+(p+q)x+pq = (x+p)(x+q)', scene: true,
        proof: 'Expand the right side: the four parts are <code>x²</code>, <code>qx</code>, <code>px</code> and <code>pq</code>, and the two middle ones add up to <code>(p + q)x</code>.' },
      { ch: 4, title: 'When a product is zero',
        what: 'If two numbers multiply to 0, one of them is 0. So once a quadratic equation reads <code>(x + 2)(x + 3) = 0</code>, its solutions come from <code>x + 2 = 0</code> and <code>x + 3 = 0</code>: <code>x = −2 or x = −3</code>.' },
      { ch: 4, title: 'Solutions on the curve',
        what: 'The curve <code>y = x² + bx + c</code> crosses the x-axis at the solutions of <code>x² + bx + c = 0</code>. It can cross twice, touch once (a repeated root), or miss the axis (no solutions).', scene: true },
    ],
  };
})();
