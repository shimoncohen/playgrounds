// Geometry track content (DOM-free). Chapter ids and order must match MQ.graph.chapters.geometry.
(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const ok = { ok: true };
  const finalNumber = MQ.check.final.number;
  const finalRounded = MQ.check.final.rounded;
  // final.number wants a bare number, so one trailing degree sign is dropped first.
  const angle = n => v => finalNumber(n)(String(v).replace(/\s*°\s*$/, ''));
  const num = v => String(+v.toFixed(2));
  const side = (term, a, b) => ({ type: 'polygon', term, pts: [a, b] });

  const shapes = {
    id: 'rect-tri', title: 'A rectangle and a triangle on a grid of 1 by 1 squares',
    params: {
      b: { min: 1, max: 12, step: 1, value: 4, label: 'base b' },
      h: { min: 1, max: 9, step: 1, value: 3, label: 'height h' },
      p: { min: 0, max: 12, step: 1, value: 1, label: 'top corner of the triangle' },
    },
    terms: ['tri'],
    derived: ({ b, h }) => ({ 'rectangle area': b * h, 'rectangle perimeter': 2 * (b + h), 'triangle area': b * h / 2 }),
    // Two rows: on one line KaTeX breaks after a ×, splitting each formula at 390px.
    formula: '\\begin{aligned}\\text{rectangle: } A &= \\term{b}{b}\\times\\term{h}{h}\\\\ \\text{triangle: } \\term{tri}{A} &= \\tfrac{1}{2}\\times\\term{b}{b}\\times\\term{h}{h}\\end{aligned}',
    live: ({ params: { b, h } }) => `Rectangle: A = ${b} × ${h} = ${b * h}, perimeter = ${2 * (b + h)}.   Triangle: A = ½ × ${b} × ${h} = ${num(b * h / 2)}.`,
    draw: {
      kind: '2d', view: [-3, 13, -1, 10], box: [440, 302],
      items: ({ params: { b, h, p } }) => [
        { type: 'grid' },
        { type: 'polygon', term: 'tri', pts: [[0, 0], [b, 0], [p, h]] },
        side('h', [p, 0], [p, h]),
        side('b', [0, 0], [b, 0]), side('b', [0, h], [b, h]),
        side('h', [0, 0], [0, h]), side('h', [b, 0], [b, h]),
        { type: 'text', x: b / 2, y: -0.5, s: `b = ${b}`, term: 'b' },
        { type: 'text', x: -0.2, y: h / 2, s: `h = ${h}`, term: 'h', anchor: 'end' },
        { type: 'point', x: p, y: h, term: 'p', drag: { x: 'p' }, label: 'top corner of the triangle' },
        { type: 'point', x: b, y: h, drag: { x: 'b', y: 'h' }, label: 'top right corner of the rectangle' },
      ],
    },
  };

  // Same picture, but the live line only gives what the mission gives, not the area it asks for.
  const shapesWith = live => ({ ...shapes, live });
  const given = ({ params: { b, h } }) => `Base b = ${b}, height h = ${h}.`;

  const R = 4.9, rad = d => d * Math.PI / 180, at = (d, r) => [r * Math.cos(rad(d)), r * Math.sin(rad(d))];
  const wedge = (from, to, term) => ({ type: 'polygon', term, pts: [[0, 0], ...Array.from({ length: 13 }, (_, i) => at(from + (to - from) * i / 12, 1.3))] });
  const split = ({ r1, r2 }) => { const lo = Math.min(r1, r2), hi = Math.max(r1, r2); return { lo, hi, a: lo, b: hi - lo, c: 180 - hi }; };
  const rays = {
    id: 'line-rays', title: 'Two rays split a straight line into three angles',
    params: {
      r1: { min: 10, max: 170, step: 10, value: 40, label: 'first ray' },
      r2: { min: 10, max: 170, step: 10, value: 110, label: 'second ray' },
    },
    terms: ['a', 'b', 'c'],
    derived: p => { const { a, b, c } = split(p); return { a, b, c, 'a + b + c': a + b + c }; },
    formula: '\\term{a}{a} + \\term{b}{b} + \\term{c}{c} = 180^\\circ',
    live: ({ derived: d }) => `${d.a}° + ${d.b}° + ${d.c}° = ${d['a + b + c']}°`,
    draw: {
      kind: '2d', view: [-5.5, 5.5, -1, 5.5], box: [440, 260],
      items: ({ params }) => {
        const { lo, hi, a, b, c } = split(params);
        const label = (d, s, term) => { const [x, y] = at(d, 2.1); return { type: 'text', x, y, s, term }; };
        return [
          { type: 'polygon', pts: [[-5.2, 0], [5.2, 0]] },
          wedge(0, lo, 'a'), wedge(lo, hi, 'b'), wedge(hi, 180, 'c'),
          label(lo / 2, `${a}°`, 'a'), label((lo + hi) / 2, `${b}°`, 'b'), label((hi + 180) / 2, `${c}°`, 'c'),
          ...['r1', 'r2'].map(r => ({ type: 'vector', term: r, from: [0, 0], to: at(params[r], R) })),
          { type: 'point', x: 0, y: 0 },
          ...['r1', 'r2'].map((r, i) => { const [x, y] = at(params[r], R - 0.6); return { type: 'point', x, y, term: r, drag: { angle: r, step: 10 }, label: i ? 'second ray' : 'first ray' }; }),
        ];
      },
    },
  };

  const sector = (cx, cy, from, to, r, term) => ({ type: 'polygon', term, pts: [[cx, cy], ...Array.from({ length: 13 }, (_, i) => { const d = from + (to - from) * i / 12; return [cx + r * Math.cos(rad(d)), cy + r * Math.sin(rad(d))]; })] });
  const tag = (cx, cy, from, to, r, s, term) => ({ type: 'text', x: cx + r * Math.cos(rad((from + to) / 2)), y: cy + r * Math.sin(rad((from + to) / 2)), s, term });
  const ray = (cx, cy, d, len) => ({ type: 'polygon', pts: [[cx, cy], [cx + len * Math.cos(rad(d)), cy + len * Math.sin(rad(d))]] });

  const lineRay = {
    id: 'line-ray', title: 'One ray splits a straight line into two angles',
    params: { r: { min: 1, max: 179, step: 1, value: 90, label: 'ray' } },
    terms: ['a', 'x'],
    derived: ({ r }) => ({ a: r, x: 180 - r }),
    formula: '\\term{a}{a} + \\term{x}{x} = 180^\\circ',
    live: ({ derived: d }) => `${d.a}° + x = 180°`,
    draw: {
      kind: '2d', view: [-5.5, 5.5, -1, 5.5], box: [440, 260],
      items: ({ params: { r } }) => [
        { type: 'polygon', pts: [[-5.2, 0], [5.2, 0]] },
        sector(0, 0, 0, r, 1.3, 'a'), sector(0, 0, r, 180, 1.3, 'x'),
        tag(0, 0, 0, r, 2.1, `${r}°`, 'a'), tag(0, 0, r, 180, 2.1, 'x', 'x'),
        { type: 'vector', from: [0, 0], to: at(r, R) },
        { type: 'point', x: 0, y: 0 },
        { type: 'point', x: at(r, R - 0.6)[0], y: at(r, R - 0.6)[1], drag: { angle: 'r', step: 1 }, label: 'ray' },
      ],
    },
  };

  const around = ({ r1, r2, r3 }) => {
    const [p, q, s] = [r1, r2, r3].sort((m, n) => m - n);
    return { cuts: [0, p, q, s, 360], a: p, b: q - p, c: s - q, x: 360 - s };
  };
  const pointRays = {
    id: 'point-rays', title: 'Three rays from a point make four angles that fill a full turn',
    params: {
      r1: { min: 5, max: 355, step: 5, value: 90, label: 'first ray' },
      r2: { min: 5, max: 355, step: 5, value: 180, label: 'second ray' },
      r3: { min: 5, max: 355, step: 5, value: 270, label: 'third ray' },
    },
    terms: ['a', 'b', 'c', 'x'],
    derived: p => { const { a, b, c, x } = around(p); return { a, b, c, x }; },
    formula: '\\term{a}{a} + \\term{b}{b} + \\term{c}{c} + \\term{x}{x} = 360^\\circ',
    live: ({ derived: d }) => `${d.a}° + ${d.b}° + ${d.c}° + x = 360°`,
    draw: {
      kind: '2d', view: [-5.5, 5.5, -5.5, 5.5], box: [360, 360],
      items: ({ params }) => {
        const { cuts } = around(params), names = ['a', 'b', 'c', 'x'];
        return [
          ...cuts.slice(0, 4).flatMap((from, i) => cuts[i + 1] === from ? [] : [sector(0, 0, from, cuts[i + 1], 1.4, names[i]), tag(0, 0, from, cuts[i + 1], 2.7, i === 3 ? 'x' : `${cuts[i + 1] - from}°`, names[i])]),
          ...cuts.slice(0, 4).map(d => ({ type: 'vector', from: [0, 0], to: at(d, R - 0.3) })),
          { type: 'point', x: 0, y: 0 },
        ];
      },
    },
  };

  const triangleAt = ({ a, b }) => {
    const h0 = Math.sin(rad(a)) * Math.sin(rad(b)) / Math.sin(rad(a + b)), s = Math.min(9, 6 / h0), c = Math.sin(rad(b)) / Math.sin(rad(a + b));
    return { s, L: [-s / 2, 0], R: [s / 2, 0], T: [-s / 2 + s * c * Math.cos(rad(a)), s * c * Math.sin(rad(a))] };
  };
  const triangle = {
    id: 'triangle-angles', title: 'A triangle with its three angles marked',
    params: {
      a: { min: 30, max: 75, step: 1, value: 60, label: 'angle a, left corner' },
      b: { min: 30, max: 75, step: 1, value: 60, label: 'angle b, right corner' },
    },
    terms: ['x'],
    derived: ({ a, b }) => ({ x: 180 - a - b }),
    formula: '\\term{a}{a} + \\term{b}{b} + \\term{x}{x} = 180^\\circ',
    live: ({ params: { a, b } }) => `${a}° + ${b}° + x = 180°`,
    draw: {
      kind: '2d', view: [-5.5, 5.5, -1.5, 6.5], box: [440, 320],
      items: ({ params }) => {
        const { a, b } = params, { s, L, R: Rt, T } = triangleAt(params), r = Math.min(1.4, 0.4 * s);
        return [
          { type: 'polygon', pts: [L, Rt, T] },
          sector(...L, 0, a, r, 'a'), sector(...Rt, 180 - b, 180, r, 'b'), sector(...T, 180 + a, 360 - b, r, 'x'),
          tag(...L, 0, a, r + 0.9, `${a}°`, 'a'), tag(...Rt, 180 - b, 180, r + 0.9, `${b}°`, 'b'), tag(...T, 180 + a, 360 - b, r + 0.9, 'x', 'x'),
        ];
      },
    },
  };

  const crossing = {
    id: 'crossing-lines', title: 'Two straight lines cross and make four angles',
    params: { k: { min: 10, max: 80, step: 1, value: 60, label: 'angle between the lines' } },
    terms: ['x', 'y'],
    derived: ({ k }) => ({ x: k, y: 180 - k }),
    formula: '\\term{x}{x} + \\term{y}{y} = 180^\\circ',
    live: ({ derived: d }) => `The two opposite angles of ${d.x}° are ${2 * d.x}° together. Aim for 76°.`,
    draw: {
      kind: '2d', view: [-5.5, 5.5, -5.5, 5.5], box: [360, 360],
      items: ({ params: { k } }) => [
        ray(0, 0, 0, 5.2), ray(0, 0, 180, 5.2), ray(0, 0, k, 5.2), ray(0, 0, k + 180, 5.2),
        ...[[0, k, 'x', k], [k, 180, 'y', 180 - k], [180, 180 + k, 'x', k], [180 + k, 360, 'y', 180 - k]].flatMap(([f, e, term, n]) => [sector(0, 0, f, e, 1.4, term), tag(0, 0, f, e, 2.7, `${n}°`, term)]),
        { type: 'point', x: 0, y: 0 },
        { type: 'point', x: at(k, 4.6)[0], y: at(k, 4.6)[1], drag: { angle: 'k', step: 1 }, label: 'angle between the lines' },
      ],
    },
  };

  // svg2d polygons are always filled, so a taken-away part is drawn as short two-point segments.
  const dashed = (pts, term) => pts.flatMap((p, i) => {
    const q = pts[(i + 1) % pts.length], n = Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.5);
    return Array.from({ length: n }, (_, k) => side(term, [p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n], [p[0] + (q[0] - p[0]) * (k + 0.6) / n, p[1] + (q[1] - p[1]) * (k + 0.6) / n]));
  });

  const lRoom = {
    id: 'l-room', title: 'An L-shaped room: a rectangle with a corner cut off',
    params: {
      w: { min: 6, max: 12, step: 1, value: 10, label: 'width w' },
      h: { min: 5, max: 9, step: 1, value: 8, label: 'height h' },
      u: { min: 1, max: 5, step: 1, value: 4, label: 'cut width u' },
      v: { min: 1, max: 4, step: 1, value: 3, label: 'cut height v' },
    },
    terms: ['whole', 'cut'],
    formula: 'A = \\term{whole}{w\\times h} - \\term{cut}{u\\times v}',
    live: ({ params: { w, h, u, v } }) => `Whole rectangle ${w} × ${h}. Dashed corner cut off: ${u} × ${v}.`,
    draw: {
      kind: '2d', view: [-3, 13, -1, 10], box: [440, 302],
      items: ({ params: { w, h, u, v } }) => [
        { type: 'grid' },
        { type: 'polygon', term: 'whole', pts: [[0, 0], [w, 0], [w, h - v], [w - u, h - v], [w - u, h], [0, h]] },
        ...dashed([[w - u, h - v], [w, h - v], [w, h], [w - u, h]], 'cut'),
        { type: 'text', x: w / 2, y: -0.5, s: `w = ${w}`, term: 'whole' },
        { type: 'text', x: -0.2, y: h / 2, s: `h = ${h}`, term: 'whole', anchor: 'end' },
        { type: 'text', x: w - u / 2, y: h + 0.6, s: `cut ${u} × ${v}`, term: 'cut' },
        { type: 'point', x: w, y: h, drag: { x: 'w', y: 'h' }, label: 'top right corner of the room' },
      ],
    },
  };

  const wholeRoot = n => Math.round(Math.sqrt(n)) ** 2 === n;
  // The view is sized so the squares on the longest legs and on the hypotenuse still fit.
  // ask 'c': the hypotenuse is the question, so c² stays hidden. A number: the hypotenuse to aim for while moving a leg.
  const squares = (max, ask) => ({
    id: 'right-tri', title: 'A right triangle with a square drawn on each of its three sides',
    params: {
      a: { min: 2, max, step: 1, value: 3, label: 'leg a' },
      b: { min: 2, max, step: 1, value: 4, label: 'leg b' },
    },
    terms: ['c'],
    derived: ({ a, b }) => ({ 'a²': a * a, 'b²': b * b, 'c²': a * a + b * b, c: +Math.hypot(a, b).toFixed(2) }),
    formula: '\\term{a}{a}^2 + \\term{b}{b}^2 = \\term{c}{c}^2',
    live: ({ params: { a, b }, derived: d }) => ask === 'c' ? `a² = ${d['a²']}, b² = ${d['b²']}, c² = ?`
      : `${a}² + ${b}² = ${d['a²']} + ${d['b²']} = ${d['c²']}, so c = ${wholeRoot(d['c²']) ? d.c : `√${d['c²']} ≈ ${num(d.c)}`}${ask ? `. Aim for c = ${ask}.` : ''}`,
    draw: {
      kind: '2d', view: [-max - 1, 2 * max + 1, -max - 1, 2 * max + 1], box: [440, 440],
      items: ({ params: { a, b }, derived: d }) => [
        { type: 'polygon', term: 'a', pts: [[0, 0], [a, 0], [a, -a], [0, -a]] },
        { type: 'polygon', term: 'b', pts: [[0, 0], [0, b], [-b, b], [-b, 0]] },
        { type: 'polygon', term: 'c', pts: [[a, 0], [0, b], [b, a + b], [a + b, a]] },
        { type: 'polygon', pts: [[0, 0], [a, 0], [0, b]] },
        { type: 'polygon', pts: [[0, 0], [0.8, 0], [0.8, 0.8], [0, 0.8]] },
        { type: 'text', x: a / 2, y: -a / 2, s: `a² = ${d['a²']}`, term: 'a' },
        { type: 'text', x: -b / 2, y: b / 2, s: `b² = ${d['b²']}`, term: 'b' },
        { type: 'text', x: (a + b) / 2, y: (a + b) / 2, s: ask === 'c' ? 'c² = ?' : `c² = ${d['c²']}`, term: 'c' },
        { type: 'point', x: a, y: 0, term: 'a', drag: { x: 'a' }, label: 'leg a' },
        { type: 'point', x: 0, y: b, term: 'b', drag: { y: 'b' }, label: 'leg b' },
      ],
    },
  });

  const radiusOnly = ({ params: { r }, derived: d }) => `Radius r = ${r}, diameter d = ${d.d}.`;
  const circle = (step, liveLine) => ({
    id: 'circle', title: 'A circle with its radius and diameter marked',
    params: { r: { min: 1, max: 8, step, value: 3, label: 'radius r' } },
    terms: ['d', 'C', 'A'],
    derived: ({ r }) => ({ d: 2 * r, C: +(2 * Math.PI * r).toFixed(2), A: +(Math.PI * r * r).toFixed(2) }),
    formula: '\\begin{aligned}\\term{d}{d} &= 2\\times\\term{r}{r}\\\\ \\term{C}{C} &= 2\\times\\pi\\times\\term{r}{r}\\\\ \\term{A}{A} &= \\pi\\times\\term{r}{r}\\times\\term{r}{r}\\end{aligned}',
    live: liveLine || (({ params: { r }, derived: d }) => `r = ${r}, d = ${d.d}.   C = 2 × π × ${r} ≈ ${num(d.C)}.   A = π × ${r} × ${r} ≈ ${num(d.A)}.`),
    draw: {
      kind: '2d', view: [-9, 9, -9, 9], box: [400, 400],
      items: ({ params: { r } }) => [
        { type: 'polygon', term: 'A', pts: Array.from({ length: 90 }, (_, i) => [r * Math.cos(i * Math.PI / 45), r * Math.sin(i * Math.PI / 45)]) },
        { type: 'polygon', term: 'd', pts: [[-r, 0], [r, 0]] },
        { type: 'vector', term: 'r', from: [0, 0], to: [r, 0] },
        { type: 'text', x: r / 2, y: 0.8, s: `r = ${r}`, term: 'r' },
        { type: 'text', x: -r / 2, y: -0.8, s: `d = ${2 * r}`, term: 'd' },
        { type: 'point', x: 0, y: 0 },
        { type: 'point', x: r, y: 0, term: 'r', drag: { x: 'r', stepX: step }, label: 'radius r' },
      ],
    },
  });

  // The table is measured across (its diameter), so the radius is not shown: halving it is the learner's step.
  const tableTop = {
    id: 'circle-diameter', title: 'A circle measured all the way across, its diameter',
    params: { d: { min: 2, max: 16, step: 1, value: 14, label: 'diameter d' } },
    formula: '\\term{d}{d} = 2\\times r',
    live: ({ params: { d } }) => `Diameter d = ${d}.`,
    draw: {
      kind: '2d', view: [-1, 17, -8.5, 8.5], box: [440, 416],
      items: ({ params: { d } }) => [
        { type: 'polygon', pts: Array.from({ length: 90 }, (_, i) => [d / 2 + d / 2 * Math.cos(i * Math.PI / 45), d / 2 * Math.sin(i * Math.PI / 45)]) },
        { type: 'vector', term: 'd', from: [0, 0], to: [d, 0] },
        { type: 'text', x: d / 2, y: -0.8, s: `d = ${d}`, term: 'd' },
        { type: 'point', x: 0, y: 0 },
        { type: 'point', x: d, y: 0, term: 'd', drag: { x: 'd' }, label: 'diameter d' },
      ],
    },
  };

  MQ.content = {
    track: 'geometry',
    ranks: [[0, 'Dot Joiner'], [40, 'Shape Builder'], [100, 'Angle Ace'], [200, 'Right-Angle Pro'], [300, 'Geometer']],
    chapters: [{
      id: 'geometry.area', name: 'Area and perimeter', badge: 'Floor Plan',
      story: 'Tessa\'s plan shows floors and rooms of the great floor in tiles, so you count the tiles each covers and the edge each has to find the floor plan.',
      intro: 'Mistress Tessa laid the mosaic of the great floor in sections and left her plan behind. The plan shows each floor and room in tiles. The <b>area</b> of a flat shape is how much space it covers, counted in 1 by 1 squares, like floor tiles. Its <b>perimeter</b> is the distance all the way round its edge, like a fence. In the scene every grid square is 1 by 1. The bottom side of the rectangle is its <b>base</b> <code>b</code>, and its <b>height</b> <code>h</code> goes straight up. Drag a corner, or move a slider, and the shapes, the formulas and the numbers change together.',
      scene: shapes,
      missions: [
        { title: 'Cover the floor', kind: 'number', question: '12*7', tex: 'A = b \\times h \\;\\text{ with }\\; b = 12,\\ h = 7',
          goal: 'A floor is a rectangle 12 long and 7 wide. How many 1 by 1 tiles cover it? Work out its area <code>A = b × h</code>.',
          how: [
            '<code>A = b × h</code> counts the squares in a rectangle: <code>h</code> rows, each with <code>b</code> squares in it.',
            '<code>b</code> is the base, 12, and <code>h</code> is the height, 7. Putting them in gives your first step, <code>12 × 7</code> (type <code>12*7</code>).',
            '<code>12 × 7</code> is 84, so 84 tiles cover the floor.',
            'Adding the sides all the way round, <code>12 + 7 + 12 + 7</code>, gives 38. That is the perimeter, the length of the edge, which measures something else.',
          ],
          explain: 'The scene shows this floor, 12 by 7: count the 7 rows of 12 squares. Drag the top right corner to try other floors.',
          hint: 'How many rows of tiles are there, and how many tiles are in each row?', scene: shapesWith(given), reveal: true, at: { b: 12, h: 7 },
          answer: '84', wrong: '38', lazy: '12*7', check: finalNumber(84) },
        { title: 'Half a rectangle', kind: 'number', question: '1/2*10*9', tex: 'A = \\tfrac{1}{2} \\times b \\times h \\;\\text{ with }\\; b = 10,\\ h = 9',
          goal: 'A triangle has a base of 10 and a height of 9. Work out its area <code>A = ½ × b × h</code>, where <code>½</code> means one half.',
          how: [
            '<code>A = ½ × b × h</code> says: a triangle covers half of the rectangle drawn around it.',
            '<code>b × h</code> is that rectangle: <code>10 × 9</code> is 90 squares.',
            '<code>½ ×</code> takes half of it. <code>½</code> means one half, so multiplying by <code>½</code> is the same as dividing by 2. Type it as <code>1/2</code>, so the whole line is <code>1/2*10*9</code>.',
            'Half of 90 is 45, the area of the triangle. Forgetting the <code>½</code> gives 90, the whole rectangle.',
          ],
          explain: 'The height of a triangle goes straight up from the base to the top corner, not along a sloping side. In the scene, slide the top corner of the triangle along: the base and height stay the same, and so does the area.',
          hint: 'First find the rectangle, <code>10 × 9</code>. The triangle is half of it.', scene: shapesWith(given), reveal: true, at: { b: 10, h: 9 },
          answer: '45', wrong: '90', lazy: '1/2*10*9', check: finalNumber(45) },
        { title: 'An L-shaped room', kind: 'number', question: '10*8-4*3', tex: '\\text{a } 10 \\times 8 \\text{ rectangle with a } 4 \\times 3 \\text{ corner cut off}',
          goal: 'A room is shaped like an L: a rectangle 10 wide and 8 tall with a 4 by 3 corner cut off at the top right. Work out its area. The scene shows the room: the whole rectangle, with the cut corner in a second colour.',
          how: [
            'The L is not a rectangle, but it is made of rectangles: find their areas, then add or take away.',
            'One way: the whole 10 by 8 rectangle is <code>10 × 8 = 80</code> squares, before the corner is cut off.',
            'The missing corner is <code>4 × 3 = 12</code> squares, so take it away: your step is <code>80 − 12</code> (type <code>80-12</code>), which is 68.',
            'Another way gives the same answer: cut the L into a bottom part 10 by 5 and a top part 6 by 3. <code>50 + 18</code> is 68 too.',
          ],
          explain: 'Any shape with only square corners can be cut into rectangles like this. Whichever way you cut it, the area comes out the same.',
          hint: 'Find the area of the full 10 by 8 rectangle. How much of it is missing?', scene: lRoom,
          answer: '68', wrong: '80', lazy: '10*8-4*3', check: finalNumber(68) },
        { title: 'The missing side', kind: 'number', question: '54/9', tex: 'b \\times h = 54 \\;\\text{ with }\\; b = 9,\\ h = ?',
          goal: 'A rectangle has an area of 54 and a base of 9. How tall is it? Find the height <code>h</code>.',
          how: [
            'You know the answer to <code>b × h</code> and one of the numbers, so you work the multiplication backwards.',
            '<code>9 × h = 54</code> asks: 9 times what makes 54?',
            'Dividing undoes multiplying: <code>54 ÷ 9</code> (type <code>54/9</code>) is 6.',
            'Check it: <code>9 × 6</code> is 54, so the height is 6. Taking away, <code>54 − 9</code>, gives 45, which does not fit.',
          ],
          explain: 'This is how a builder finds a missing length: if you know the area and one side, divide the area by that side.',
          hint: 'Which number times 9 gives 54?', scene: shapesWith(({ params: { b, h } }) => `Base ${b}, height ${h}: area ${b * h}. The area you need is 54.`), at: { b: 9, h: 3 },
          answer: '6', wrong: '45', lazy: '54/9', check: finalNumber(6) },
        { title: 'Area 24, perimeter 20', kind: 'scene',
          goal: 'Drag the top right corner of the rectangle until its area is 24 squares and its perimeter is 20.',
          how: [
            'You want a rectangle where <code>b × h = 24</code> and <code>b + h + b + h = 20</code>; the scene works out both as you drag.',
            'The perimeter goes round each side once, so it is <code>b + h</code> twice: <code>b + h</code> must be 10.',
            'Which two numbers multiply to 24 and add up to 10? Try a few: 8 and 3 multiply to 24 but add up to 11.',
            'The live line under the grid shows the area and the perimeter, and the mission passes once they read 24 and 20.',
          ],
          explain: 'More than one rectangle covers 24 squares, but their edges have different lengths. The same area can have different perimeters.',
          hint: 'Try a height of 4. What base gives an area of 24?',
          answer: { b: 6, h: 4 }, wrong: { b: 8, h: 3 }, lazy: {},
          check: s => {
            const A = s.derived['rectangle area'], P = s.derived['rectangle perimeter'];
            return A !== 24 ? { ok: false, why: `The area is ${A} now. You need 24.` }
              : P !== 20 ? { ok: false, why: `The area is 24, but the perimeter is ${P}. You need 20.` } : ok;
          } },
      ],
    }, {
      id: 'geometry.angles', name: 'Angles', badge: 'Glass Wedge',
      story: 'The angle gallery\'s glass wedges must fit round each corner, so you work out each missing turn to find the glass wedge that fits.',
      intro: 'The plan leads to the angle gallery, where wedge-shaped glass must fit round each corner and Bram keeps cutting it wrong. An <b>angle</b> is the amount of turn between two lines that meet at a point. It is measured in <b>degrees</b>, written with a small circle: <code>90°</code> is a quarter turn, a <b>right angle</b>, like the corner of a page. A full turn is <code>360°</code>, so half a turn, a straight line, is <code>180°</code>. You can type an answer with or without the <code>°</code>. In the scene, two <b>rays</b>, lines that start at a point and go on in one direction, split a straight line into three angles. Drag a ray and watch the angles and their sum.',
      scene: rays,
      missions: [
        { title: 'On a straight line', kind: 'number', question: '180-47', tex: '47^\\circ + x = 180^\\circ',
          goal: 'A ray splits a straight line into two angles. One is <code>47°</code>. How big is the other one, <code>x</code>?',
          how: [
            'The two angles together make the straight line, half a turn, so they add up to <code>180°</code>.',
            '<code>47°</code> is the part you know. <code>x</code> is whatever is left of the 180.',
            'Take the part you know away from the whole: <code>180 − 47</code> (type <code>180-47</code>) is 133.',
            'Check it: <code>47 + 133</code> is 180. Taking 47 from 90 instead gives 43, which belongs to a right angle, not a straight line.',
          ],
          explain: 'In the scene, drag the ray: one angle grows as the other shrinks, and together they always make <code>180°</code>.',
          hint: 'A straight line is <code>180°</code>. How much is left after <code>47°</code>?', scene: lineRay, at: { r: 47 },
          answer: '133', wrong: '43', lazy: '180-47', check: angle(133) },
        { title: 'All the way round', kind: 'number', question: '360-110-95-80', tex: '110^\\circ + 95^\\circ + 80^\\circ + x = 360^\\circ',
          goal: 'Four angles fit round a point: <code>110°</code>, <code>95°</code>, <code>80°</code> and <code>x</code>. Find <code>x</code>.',
          how: [
            'The four angles go all the way round the point, one full turn, so together they make <code>360°</code>.',
            'The three you know add up to <code>110 + 95 + 80</code>, which is 285.',
            '<code>x</code> is the rest of the full turn: <code>360 − 285</code> (type <code>360-285</code>) is 75.',
            'Check it: <code>285 + 75</code> is 360. The 285 alone is not the answer: it is the part already used.',
          ],
          explain: 'A full turn is two straight lines, back to back: <code>180° + 180° = 360°</code>.',
          hint: 'Add up the three angles you know. How much of the <code>360°</code> is left?', scene: pointRays, at: { r1: 110, r2: 205, r3: 285 },
          answer: '75', wrong: '285', lazy: '360-110-95-80', check: angle(75) },
        { title: 'Inside a triangle', kind: 'number', question: '180-58-71', tex: '58^\\circ + 71^\\circ + x = 180^\\circ',
          goal: 'A triangle has two angles of <code>58°</code> and <code>71°</code>. The three angles inside a triangle always add up to <code>180°</code>. Find the third angle, <code>x</code>.',
          how: [
            'All three angles of the triangle together make <code>180°</code>, the same as a straight line.',
            'The two you know add up to <code>58 + 71</code>, which is 129.',
            '<code>x</code> is what is left: <code>180 − 129</code> (type <code>180-129</code>) is 51.',
            'Check it: <code>58 + 71 + 51</code> is 180. Using 360 by mistake gives 231, bigger than a straight line, which cannot fit inside a triangle.',
          ],
          explain: 'In the scene, change one corner and the third angle changes to keep the total at <code>180°</code>. Put a triangle\'s three corners side by side and they fill a straight line, as the field guide shows.',
          hint: 'Add the two angles you know, then take that away from <code>180°</code>.', scene: triangle, at: { a: 58, b: 71 },
          answer: '51', wrong: '231', lazy: '180-58-71', check: angle(51) },
        { title: 'Opposite angles', kind: 'number', question: '76/2', tex: '\\text{two opposite angles: } x + x = 76^\\circ',
          goal: 'Two straight lines cross like Bram\'s tile nippers, opened wide, making four angles. The angle between the blades and the one opposite it, between the handles, add up to <code>76°</code>. How big is one of them, <code>x</code>?',
          how: [
            'Where two straight lines cross, the two angles opposite each other are always the same size. They are called <b>vertically opposite</b> angles.',
            'Why: each of them sits on a straight line next to the same neighbour, so each is <code>180°</code> take away that neighbour.',
            'So <code>76°</code> is two equal angles together: <code>76 ÷ 2</code> (type <code>76/2</code>) is 38.',
            'Check it: the neighbour is <code>180 − 38 = 142</code>, and <code>38 + 142</code> is 180, a straight line. 104, which is 180 − 76, mixes the two angles up.',
          ],
          explain: 'Open and close Bram\'s tile nippers: the angle between the blades and the angle between the handles grow and shrink together.',
          hint: 'The two opposite angles are equal. What is half of <code>76°</code>?', scene: crossing,
          answer: '38', wrong: '104', lazy: '76/2', check: angle(38) },
        { title: 'Three equal slices', kind: 'scene',
          goal: 'Drag the two rays until the three angles on the straight line are all the same size.',
          how: [
            'The three angles always add up to <code>180°</code>, because together they make the straight line.',
            'Three equal angles share the 180 fairly: each one is <code>180 ÷ 3</code>.',
            'Drag a ray tip, or focus it and press the arrow keys, to turn it 10° at a time. The sliders below the picture move the rays too.',
            'The live line under the picture shows the three angles and their sum. The mission passes when all three match.',
          ],
          explain: 'A straight line is <code>180°</code>, so three equal slices share it evenly. A triangle with three equal corners has three equal sides too: it is called an <b>equilateral</b> triangle.',
          hint: 'Each angle is <code>180 ÷ 3</code>. Put the first ray there.',
          answer: { r1: 60, r2: 120 }, wrong: { r1: 60, r2: 100 }, lazy: {},
          check: ({ derived: { a, b, c } }) => a === b && b === c ? ok : { ok: false, why: `The angles are ${a}°, ${b}° and ${c}° now. Make all three the same.` } },
      ],
    }, {
      id: 'geometry.pythagoras', name: 'Pythagoras', badge: 'Roof Beam',
      story: 'A diagonal beam has to span the hall corner to corner, so you work out its length from the two sides to find the roof beam.',
      intro: 'The glass wedge reveals a note about the diagonal beams of the roof, each of which must span the hall from corner to corner. A <b>right triangle</b> has one right angle, a <code>90°</code> corner like the corner of a page. The two sides that make the right angle are the <b>legs</b>, <code>a</code> and <code>b</code>. The longest side, across from the right angle, is the <b>hypotenuse</b>, <code>c</code>. Draw a square on each side: the two small squares together cover exactly as much area as the big one. This is <b>Pythagoras\' theorem</b>: <code>a² + b² = c²</code>, where <code>a²</code> means <code>a × a</code>. To go back from <code>c²</code> to <code>c</code> you take the <b>square root</b>, written <code>sqrt(…)</code> when you type it: <code>sqrt(25)</code> is 5, because <code>5 × 5 = 25</code>. Drag a leg, or move a slider, and watch the three areas.',
      scene: squares(8),
      missions: [
        { title: 'The long side', kind: 'number', question: 'sqrt(3^2+4^2)', tex: 'c = \\sqrt{3^2 + 4^2}',
          goal: 'A right triangle has legs of 3 and 4. How long is the hypotenuse <code>c</code>?',
          how: [
            'Pythagoras says <code>a² + b² = c²</code>, so <code>c</code> is the square root of <code>a² + b²</code>.',
            'Put the legs in: <code>sqrt(3^2+4^2)</code>. The <code>^2</code> means "squared", so <code>3^2</code> is <code>3 × 3 = 9</code> and <code>4^2</code> is 16.',
            '<code>9 + 16</code> is 25, and <code>sqrt(25)</code> is 5, because <code>5 × 5 = 25</code>. So <code>c = 5</code>.',
            'Stopping at 25 is a slip: that is <code>c²</code>, the area of the big square, not the length of the side.',
          ],
          explain: 'In the scene, 3 and 4 are the starting legs: the squares cover 9 and 16, and the big square covers 25. Its side is 5.',
          hint: 'Square both legs, add them, then take the square root.', scene: squares(8, 'c'), reveal: true,
          answer: '5', wrong: '25', lazy: 'sqrt(3^2+4^2)', check: finalNumber(5) },
        { title: 'Twice as big', kind: 'number', question: 'sqrt(6^2+8^2)', tex: 'c = \\sqrt{6^2 + 8^2}',
          goal: 'The legs are 6 and 8. Find the hypotenuse <code>c</code>.',
          how: [
            'Same recipe: <code>c = sqrt(a² + b²)</code>.',
            '<code>6^2</code> is 36 and <code>8^2</code> is 64, so your first step is <code>sqrt(6^2+8^2)</code>.',
            '<code>36 + 64</code> is 100, and <code>sqrt(100)</code> is 10, because <code>10 × 10 = 100</code>.',
            'Adding the legs, <code>6 + 8 = 14</code>, is another slip: a straight path from corner to corner is shorter than going round the two legs.',
          ],
          explain: 'The legs 6 and 8 are exactly twice the legs of the 3, 4, 5 triangle. Double every side of a right triangle and it is still a right triangle.',
          hint: 'The area of the big square is <code>36 + 64</code>. What number times itself is that?',
          answer: '10', wrong: '14', lazy: 'sqrt(6^2+8^2)', check: finalNumber(10) },
        { title: 'A missing leg', kind: 'number', question: 'sqrt(13^2-5^2)', tex: 'a = \\sqrt{13^2 - 5^2}',
          goal: 'The hypotenuse is 13 and one leg is 5. Find the other leg <code>a</code>.',
          how: [
            'Now you know the big square, <code>c² = 13²</code>, and one small square, <code>5²</code>. The other small square is what is left: <code>a² = c² − b²</code>.',
            '<code>13^2</code> is 169 and <code>5^2</code> is 25, so your first step is <code>sqrt(13^2-5^2)</code>.',
            '<code>169 − 25</code> is 144, and <code>sqrt(144)</code> is 12, because <code>12 × 12 = 144</code>.',
            'Take away, do not add: the hypotenuse is the longest side, so a leg must be shorter than 13. Subtracting the sides, <code>13 − 5 = 8</code>, is a slip too.',
          ],
          explain: 'In the scene, slide leg a until c reaches 13: it stops at the leg you are looking for. The hypotenuse is always the longest side, so it goes first in the subtraction.',
          hint: 'Take the small square away from the big one: <code>13² − 5²</code>. Then take the square root.', scene: squares(12, 13), at: { a: 8, b: 5 }, reveal: squares(12), revealAt: { a: 12 },
          answer: '12', wrong: '8', lazy: 'sqrt(13^2-5^2)', check: finalNumber(12) },
        { title: 'Not a whole number', kind: 'number', round: 1, question: 'sqrt(5^2+7^2)', tex: 'c = \\sqrt{5^2 + 7^2}',
          goal: 'The legs are 5 and 7. Find the hypotenuse <code>c</code>, rounded to 1 decimal place (one digit after the point).',
          how: [
            '<code>5^2</code> is 25 and <code>7^2</code> is 49, so your first step is <code>sqrt(5^2+7^2)</code>, which is <code>sqrt(74)</code>.',
            'No whole number times itself makes 74: <code>8 × 8 = 64</code> and <code>9 × 9 = 81</code>. So <code>c</code> is between 8 and 9.',
            'A calculator gives <code>sqrt(74) = 8.602…</code>. To round to 1 decimal place, look at the next digit: it is 0, which is less than 5, so the 6 stays. Type <code>8.6</code>.',
            'The answer 74 is a slip: that is <code>c²</code>, the area of the big square.',
          ],
          explain: 'Most right triangles do not have whole-number sides, so you round. Rounding to 1 decimal place means taking the closest number with one digit after the point.',
          hint: 'Square and add the legs, take the square root, and round the result to 1 decimal place.', scene: squares(8, 'c'), reveal: true, at: { a: 5, b: 7 },
          answer: '8.6', wrong: '74.0', lazy: 'sqrt(5^2+7^2)', check: finalRounded('sqrt(74)', 1) },
        { title: 'A whole-number triangle', kind: 'scene',
          goal: 'Drag the two legs until the hypotenuse is a whole number other than 5.',
          how: [
            'The scene works out <code>c² = a² + b²</code> for you. You want a total that is a perfect square, like 25 or 100.',
            'The starting triangle, 3 and 4, gives 25 and so <code>c = 5</code>. That one is already used up.',
            'Try doubling it: what do 6 and 8 give? Drag a leg tip, or focus it and press the arrow keys, or use the sliders.',
            'The live line under the picture shows the sum and the root. The mission passes when <code>c</code> is a whole number that is not 5.',
          ],
          explain: 'Sets of whole numbers that fit Pythagoras, like 3, 4 and 5, are called <b>Pythagorean triples</b>. Builders use 3, 4 and 5 to check that a corner is square.',
          hint: 'Double the legs 3 and 4.', scene: squares(8, 'c'), reveal: true, at: { a: 6, b: 8 },
          answer: { a: 6, b: 8 }, wrong: { a: 3, b: 4 }, lazy: {},
          check: ({ derived: d }) => !wholeRoot(d['c²']) ? { ok: false, why: `c² is ${d['c²']}, and c is about ${num(d.c)}, not a whole number.` }
            : d.c === 5 ? { ok: false, why: 'c is 5. Find a triangle with a different whole-number hypotenuse.' } : ok },
      ],
    }, {
      id: 'geometry.circles', name: 'Circles', badge: 'Last Tile',
      story: 'The fountain court is round, so you measure how far round and how much it covers to lay the Last Tile at its centre.',
      intro: 'The last clue points to the round fountain court, where Pebble the snail has marked the spot for the golden tile. A circle is all the points at the same distance from its <b>centre</b>. That distance is the <b>radius</b> <code>r</code>. The <b>diameter</b> <code>d</code> goes straight across, through the centre, so <code>d = 2r</code>. The <b>circumference</b> <code>C</code> is the distance round the edge, and the <b>area</b> <code>A</code> is the space inside. Both depend on <b>pi</b>, written <code>π</code>: the number you get when you divide any circle\'s circumference by its diameter. It is about <code>3.14</code> and its digits never end, so answers are rounded. Type it as <code>pi</code>. Drag the radius tip, or move the slider, and watch <code>d</code>, <code>C</code> and <code>A</code> change.',
      scene: circle(0.5),
      missions: [
        { title: 'Round the fountain', kind: 'number', round: 1, question: '2*pi*5', tex: 'C = 2 \\times \\pi \\times r \\;\\text{ with }\\; r = 5',
          goal: 'The round fountain has a radius of 5. How far is it round its edge? Work out the circumference <code>C = 2 × π × r</code>, rounded to 1 decimal place.',
          how: [
            '<code>C = 2 × π × r</code>: the distance round is a little more than 3 diameters, and <code>2 × r</code> is the diameter.',
            'Put in <code>r = 5</code>: your first step is <code>2*pi*5</code>.',
            'A calculator gives <code>31.415…</code>. The next digit after the 4 is 1, less than 5, so the 4 stays: 31.4.',
            'Leaving out the 2 gives 15.7, which is only half of the way round.',
          ],
          explain: 'The scene opens on this fountain, radius 5: read <code>C</code> in the live line. Double the radius and the circumference doubles too.',
          hint: 'Two times pi times the radius. Type pi as <code>pi</code>.', scene: circle(0.5, radiusOnly), reveal: true, at: { r: 5 },
          answer: '31.4', wrong: '15.7', lazy: '2*pi*5', check: finalRounded('2*pi*5', 1) },
        { title: 'Covering a circle', kind: 'number', round: 1, question: 'pi*3^2', tex: 'A = \\pi \\times r^2 \\;\\text{ with }\\; r = 3',
          goal: 'A round carpet has a radius of 3. How much floor does it cover? Work out the area <code>A = π × r²</code>, rounded to 1 decimal place.',
          how: [
            '<code>A = π × r²</code>, where <code>r²</code> means <code>r × r</code>.',
            '<code>3^2</code> is 9, so your first step is <code>pi*3^2</code>.',
            'A calculator gives <code>28.274…</code>. The next digit after the 2 is 7, 5 or more, so round up: the 2 becomes 3 and you get 28.3.',
            'Mixing it up with the circumference, <code>2 × π × 3</code>, gives 18.8, a length, not an area.',
          ],
          explain: 'Area counts squares, so the radius is multiplied by itself. Double the radius and the area gets four times as big.',
          hint: 'Square the radius first, then multiply by pi.', scene: circle(0.5, radiusOnly), reveal: true,
          answer: '28.3', wrong: '18.8', lazy: 'pi*3^2', check: finalRounded('pi*3^2', 1) },
        { title: 'From the diameter', kind: 'number', round: 1, question: 'pi*(14/2)^2', tex: 'A = \\pi \\times r^2 \\;\\text{ with }\\; r = \\tfrac{14}{2}',
          goal: 'A round table is 14 wide all the way across, its diameter. What is the area of its top, rounded to 1 decimal place?',
          how: [
            'The formula needs the radius, not the diameter. The radius is half of it: <code>14 ÷ 2 = 7</code>.',
            'Put the radius in: <code>pi*(14/2)^2</code>, which is <code>π × 7²</code>, or <code>π × 49</code>.',
            'A calculator gives <code>153.938…</code>. The next digit after the 9 is 3, less than 5, so round to 153.9.',
            'Using 14 as the radius gives 615.8, four times too big.',
          ],
          explain: 'A common slip is to put the diameter into <code>π × r²</code>. Halve first.',
          hint: 'Halve the diameter to get the radius, then use <code>π × r²</code>.', scene: tableTop,
          answer: '153.9', wrong: '615.8', lazy: 'pi*(14/2)^2', check: finalRounded('pi*(14/2)^2', 1) },
        { title: 'Back to the radius', kind: 'number', round: 1, question: '30/(2*pi)', tex: 'r = \\frac{C}{2 \\times \\pi} \\;\\text{ with }\\; C = 30',
          goal: 'A ring path round the court is 30 long all the way round. What is its radius, rounded to 1 decimal place?',
          how: [
            '<code>C = 2 × π × r</code>, and you know <code>C</code>. Dividing undoes multiplying, so <code>r = C ÷ (2 × π)</code>.',
            'Put <code>C = 30</code> in: <code>30/(2*pi)</code>. The brackets make 2 × π the bottom of the fraction.',
            'A calculator gives <code>4.774…</code>. The next digit after the 7 is 7, 5 or more, so round up: 4.8.',
            'Dividing by 2 alone, <code>30 ÷ 2 = 15</code>, forgets π.',
          ],
          explain: 'Check it by putting your radius back in: <code>2 × π × r</code> should come out close to 30. A small gap is from rounding.',
          hint: 'Divide the circumference by <code>2 × π</code>.', scene: circle(0.1, ({ params: { r }, derived: d }) => `r = ${r}, C = 2 × π × ${r} ≈ ${num(d.C)}. The length you need is 30.`),
          answer: '4.8', wrong: '15.0', lazy: '30/(2*pi)', check: finalRounded('30/(2*pi)', 1) },
        { title: 'Area of about 78', kind: 'scene',
          goal: 'Drag the radius tip until the area is between 75 and 80.',
          how: [
            'The live line shows the area <code>A = π × r × r</code> for the current radius.',
            'The radius moves in steps of a half. Start at 3: the area is 28.3, far too small.',
            'Try a radius of 4, then 5, and watch the area grow. Drag the tip, focus it and press the arrow keys, or use the slider.',
            'The mission passes when the area is between 75 and 80.',
          ],
          explain: 'The radius is squared, so the area grows much faster than the radius: one step of the slider, half a unit, changes the area a lot. Only one radius lands between 75 and 80.',
          hint: 'Try a radius of 5.',
          answer: { r: 5 }, wrong: { r: 4 }, lazy: {},
          check: ({ derived: { A } }) => A >= 75 && A <= 80 ? ok : { ok: false, why: `The area is ${num(A)} now. You need it between 75 and 80.` } },
      ],
    }],
    quickfire: [{
      ch: 0,
      make: r => {
        const n = () => 2 + Math.floor(r() * 11);
        for (;;) {
          const b = n(), h = n(), kind = Math.floor(r() * 3);
          if (kind === 0) return { q: `${b}*${h}`, show: `Rectangle ${b} by ${h}: area?`, a: b * h, why: `${b} × ${h} = ${b * h} squares.` };
          if (kind === 1) return { q: `2*(${b}+${h})`, show: `Rectangle ${b} by ${h}: perimeter?`, a: 2 * (b + h), why: `${b} + ${h} + ${b} + ${h} = ${2 * (b + h)}.` };
          return { q: `1/2*${b}*${h}`, show: `Triangle, base ${b}, height ${h}: area?`, a: b * h / 2, why: `${b} × ${h} = ${b * h}, and half of that is ${b * h / 2}.` };
        }
      },
    }, {
      ch: 1,
      make: r => {
        const n = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)), kind = Math.floor(r() * 3);
        if (kind === 0) { const a = n(11, 169); return { q: `180-${a}`, show: `A straight line is split into ${a}° and x. x = ?`, a: 180 - a, why: `180 − ${a} = ${180 - a}.` }; }
        if (kind === 1) { const a = n(20, 100), b = n(20, 150 - a); return { q: `180-${a}-${b}`, show: `A triangle has angles ${a}°, ${b}° and x. x = ?`, a: 180 - a - b, why: `${a} + ${b} = ${a + b}, and 180 − ${a + b} = ${180 - a - b}.` }; }
        const a = n(60, 150), b = n(40, 280 - a); return { q: `360-${a}-${b}`, show: `Round a point: ${a}°, ${b}° and x. x = ?`, a: 360 - a - b, why: `${a} + ${b} = ${a + b}, and 360 − ${a + b} = ${360 - a - b}.` };
      },
    }, {
      ch: 2,
      make: r => {
        const T = [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [9, 12, 15], [7, 24, 25], [12, 16, 20], [20, 21, 29]];
        const [a, b, c] = T[Math.floor(r() * T.length)];
        if (r() < 0.5) return { q: `sqrt(${a}^2+${b}^2)`, show: `Right triangle, legs ${a} and ${b}: hypotenuse?`, a: c, why: `${a * a} + ${b * b} = ${c * c}, and the square root of ${c * c} is ${c}.` };
        return { q: `sqrt(${c}^2-${a}^2)`, show: `Right triangle, hypotenuse ${c} and one leg ${a}: other leg?`, a: b, why: `${c * c} − ${a * a} = ${b * b}, and the square root of ${b * b} is ${b}.` };
      },
    }, {
      ch: 3,
      make: r => {
        const n = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)), kind = Math.floor(r() * 3);
        if (kind === 0) { const x = n(2, 40); return { q: `2*${x}`, show: `A circle has radius ${x}: diameter?`, a: 2 * x, why: `The diameter is twice the radius: 2 × ${x} = ${2 * x}.` }; }
        if (kind === 1) { const x = n(2, 40); return { q: `${2 * x}/2`, show: `A circle has diameter ${2 * x}: radius?`, a: x, why: `The radius is half the diameter: ${2 * x} ÷ 2 = ${x}.` }; }
        const x = 7 * n(1, 6);
        return { q: `2*22/7*${x}`, show: `Use π ≈ 22/7. A circle has radius ${x}: circumference?`, a: 44 * x / 7, why: `2 × 22/7 × ${x} = ${44 * x / 7}.` };
      },
    }],
    guide: [
      { ch: 0, title: 'Area and perimeter',
        what: 'Area counts the 1 by 1 squares a shape covers. Perimeter adds up the lengths all the way round its edge. For a rectangle with base <code>b</code> and height <code>h</code>:',
        tex: 'A = b \\times h \\qquad P = b + h + b + h', scene: true },
      { ch: 0, title: 'A triangle is half a rectangle',
        what: 'A triangle covers half of the rectangle around it, so its area is half of base times height.',
        tex: 'A = \\tfrac{1}{2} \\times b \\times h',
        proof: 'Draw a line from the top corner straight down to the base. It cuts the rectangle into two smaller rectangles, and each side of the triangle cuts one of them in half, corner to corner. The triangle keeps one half of each, so half of <code>b × h</code> in all.' },
      { ch: 1, title: 'Angles on a line and round a point',
        what: 'Angles that make up a straight line add up to <code>180°</code>. Angles all the way round a point add up to <code>360°</code>, a full turn.',
        tex: 'a + b + c = 180^\\circ', scene: true },
      { ch: 1, title: 'The angles in a triangle',
        what: 'The three angles inside any triangle add up to <code>180°</code>. Where two straight lines cross, the angles opposite each other are equal.',
        tex: 'a + b + c = 180^\\circ',
        proof: 'Cut a triangle out of paper and tear off its three corners. Put their points together side by side: they always fill a straight line exactly, <code>180°</code>.' },
      { ch: 2, title: 'Pythagoras\' theorem',
        what: 'In a right triangle, the squares on the two legs together cover the same area as the square on the hypotenuse. To find a side, add or subtract the squares, then take the square root.',
        tex: 'a^2 + b^2 = c^2', scene: true },
      { ch: 2, title: 'Why the squares add up',
        what: 'Take four copies of a right triangle with legs <code>a</code> and <code>b</code>. They fit inside a big square of side <code>a + b</code> in two different ways.',
        tex: '(a+b)^2 = 4\\times\\tfrac{1}{2}ab + c^2 = 4\\times\\tfrac{1}{2}ab + a^2 + b^2',
        proof: 'Put the four triangles in the corners of the big square, hypotenuses facing in: the gap left in the middle is a tilted square of side <code>c</code>. Slide the triangles into two rectangles instead: the gap is now two squares, one of side <code>a</code> and one of side <code>b</code>. The big square and the four triangles did not change, so the gap has the same area both times: <code>c² = a² + b²</code>.' },
      { ch: 3, title: 'Diameter, circumference and area',
        what: 'The diameter is twice the radius. The circumference is pi times the diameter, and the area is pi times the radius times itself. Pi is about <code>3.14</code>.',
        tex: 'd = 2r \\qquad C = 2\\pi r \\qquad A = \\pi r^2', scene: true },
      { ch: 3, title: 'Why the area is pi r squared',
        what: 'Cut a circle into thin slices like a pizza and lay them side by side, pointing up and down. They make a shape close to a rectangle.',
        tex: 'A \\approx \\tfrac{1}{2}C \\times r = \\tfrac{1}{2}(2\\pi r) \\times r = \\pi r^2',
        proof: 'The slices stand on the edge of the circle, half pointing up and half down, so the long side of the rectangle is about half the circumference, <code>½ × 2πr = πr</code>. Its height is the length of a slice, the radius <code>r</code>. Area is long side times height, <code>πr × r = πr²</code>. The thinner the slices, the closer the shape is to a true rectangle.' },
    ],
  };
})();
