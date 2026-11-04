// Prerequisite graph for Math Quest (DOM-free). Each track's chapter list must match its content.js: same ids, same order,
// because saved badges are keyed by chapter position (S.badges[i]).
(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};

  const G = MQ.graph = {
    tracks: [
      { id: 'arithmetic', name: 'Arithmetic', key: 'math-arithmetic-v1' },
      { id: 'algebra', name: 'Algebra', key: 'math-algebra-v1' },
      { id: 'geometry', name: 'Geometry', key: 'math-geometry-v1' },
      { id: 'trigonometry', name: 'Trigonometry', key: 'math-trigonometry-v1' },
    ],
    chapters: {
      arithmetic: [
        { id: 'arithmetic.order', title: 'Order of operations', requires: [] },
        { id: 'arithmetic.negatives', title: 'Negative numbers', requires: ['arithmetic.order'],
          why: 'a chain with minus signs still follows the order of operations' },
        { id: 'arithmetic.fractions', title: 'Fractions', requires: ['arithmetic.order'],
          why: 'adding fractions mixes × and + in one line, and the order decides which goes first' },
        { id: 'arithmetic.powers', title: 'Powers and roots', requires: ['arithmetic.negatives'],
          why: 'squaring a negative number is where (−2)² and −2² part ways' },
        { id: 'arithmetic.ratios', title: 'Ratios and percentages', requires: ['arithmetic.fractions'],
          why: 'a ratio or a percentage is a fraction written another way' },
      ],
      algebra: [
        { id: 'algebra.expressions', title: 'Expressions and volume', requires: ['arithmetic.order'],
          why: 'you evaluate expressions with the order of operations' },
        { id: 'algebra.expanding', title: 'Expanding brackets', requires: ['algebra.expressions', 'arithmetic.negatives'],
          why: 'multiplying out brackets is working with letters, and a minus in front flips every sign inside' },
        { id: 'algebra.linear', title: 'Linear equations', requires: ['algebra.expanding', 'arithmetic.fractions'],
          why: 'many equations start with brackets to multiply out, and many answers are fractions' },
        { id: 'algebra.factoring', title: 'Factoring', requires: ['algebra.expanding', 'arithmetic.powers'],
          why: 'factoring is expanding run backwards, and x² is a power' },
        { id: 'algebra.quadratics', title: 'Quadratic equations', requires: ['algebra.factoring', 'algebra.linear'],
          why: 'you solve x² + 5x + 6 = 0 by factoring it, then solving two linear equations' },
      ],
      geometry: [
        { id: 'geometry.area', title: 'Area and perimeter', requires: ['arithmetic.order'],
          why: 'area formulas such as ½ × b × h are worked out with the order of operations' },
        { id: 'geometry.angles', title: 'Angles', requires: [] },
        { id: 'geometry.pythagoras', title: 'Pythagoras', requires: ['geometry.area', 'arithmetic.powers'],
          why: 'a² + b² = c² adds the areas of squares on the sides, then takes a square root' },
        { id: 'geometry.circles', title: 'Circles', requires: ['geometry.area'],
          why: 'a circle\'s area is counted in the same 1 by 1 squares as a rectangle\'s' },
      ],
      trigonometry: [
        { id: 'trigonometry.ratios', title: 'Sine, cosine and tangent', requires: ['geometry.pythagoras', 'geometry.angles', 'arithmetic.ratios'],
          why: 'sine, cosine and tangent are ratios of the sides of a right triangle, chosen by one of its angles' },
      ],
    },
  };

  const all = (g = G) => g.tracks.flatMap(t => (g.chapters[t.id] || []).map(c => ({ ...c, track: t.id })));

  G.chapter = (id, g = G) => all(g).find(c => c.id === id);
  G.trackOf = (id, g = G) => (G.chapter(id, g) || {}).track;

  G.validate = (g = G) => {
    const errs = [], cs = all(g), seen = new Set(), ids = new Set(cs.map(c => c.id));
    for (const c of cs) {
      if (seen.has(c.id)) errs.push(`duplicate chapter id ${c.id}`);
      seen.add(c.id);
      for (const r of c.requires) {
        if (r === c.id) errs.push(`${c.id} requires itself`);
        else if (!ids.has(r)) errs.push(`${c.id} requires unknown chapter ${r}`);
      }
    }
    const next = id => (cs.find(c => c.id === id) || { requires: [] }).requires.filter(r => r !== id && ids.has(r));
    const state = {};
    const walk = (id, path) => {
      if (state[id] === 2) return false;
      if (state[id] === 1) { errs.push(`cycle: ${[...path.slice(path.indexOf(id)), id].join(' -> ')}`); return true; }
      state[id] = 1;
      if (next(id).some(r => walk(r, [...path, id]))) return true;
      state[id] = 2;
      return false;
    };
    for (const id of ids) if (walk(id, [])) break;
    return errs;
  };

  G.doneFrom = states => {
    const done = new Set();
    for (const t of G.tracks) {
      const s = states && states[t.id];
      const badges = s && typeof s === 'object' && s.badges;
      if (!badges || typeof badges !== 'object') continue;
      G.chapters[t.id].forEach((c, i) => { if (badges[i]) done.add(c.id); });
    }
    return done;
  };

  G.hint = (id, done) => {
    const missing = G.chapter(id).requires.filter(r => !done.has(r)).map(r => {
      const c = G.chapter(r);
      return { id: r, title: c.title, track: c.track, why: G.chapter(id).why };
    });
    return { ready: !missing.length, missing };
  };

  G.layers = (trackId, g = G) => {
    const cs = g.chapters[trackId], inTrack = new Set(cs.map(c => c.id)), depth = {};
    const d = (c, stack = []) => depth[c.id] ??= stack.includes(c.id) ? 0 :
      1 + Math.max(-1, ...c.requires.filter(r => inTrack.has(r)).map(r => d(cs.find(x => x.id === r), [...stack, c.id])));
    const out = [];
    for (const c of cs) (out[d(c)] = out[d(c)] || []).push(c.id);
    return out.filter(Boolean);
  };

  G.trackEdges = () => {
    const edges = [];
    for (const c of all()) for (const r of c.requires) {
      const from = G.trackOf(r);
      if (from && from !== c.track && !edges.some(e => e[0] === from && e[1] === c.track)) edges.push([from, c.track]);
    }
    return edges;
  };

  G.labelLines = (title, max) => {
    if (title.length <= max) return [title];
    const cut = (s, n) => s.length <= n ? s : s.slice(0, n - 1) + '…';
    const words = title.split(' '), mid = title.length / 2;
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      if (a.length <= max && b.length <= max && (!best || Math.abs(a.length - mid) < Math.abs(best[0].length - mid))) best = [a, b];
    }
    if (best) return best;
    let k = 1;
    while (k < words.length && words.slice(0, k + 1).join(' ').length <= max) k++;
    return k >= words.length ? [cut(title, max)] : [cut(words.slice(0, k).join(' '), max), cut(words.slice(k).join(' '), max)];
  };

  G.nextUp = (done, n = 3) => all().filter(c => !done.has(c.id) && c.requires.every(r => done.has(r))).slice(0, n).map(c => c.id);
})();
